import { formatBRL, parseBRL, type Cents } from './money';
import { formatRateInput, parseRateText } from './investment-details';
import { INVESTMENT_TAX_RULES, iofRate, regressiveRate } from './investment-tax';

/**
 * Comparar rendimentos líquidos (D-099, `docs/49_ESTUDO_INVESTIMENTOS.md`, item 10): o mesmo valor e o mesmo prazo em até quatro opções
 * genéricas, com as taxas que a pessoa recebeu ou quer testar, e o líquido de cada uma (imposto pela tabela regressiva e IOF nos primeiros
 * 30 dias). Sem instituição, sem ranking e sem "melhor opção": as opções aparecem na ordem em que a pessoa as montou. O CDI e o IPCA são
 * hipóteses digitadas; a Clarevo não sugere taxa.
 */

export type CompareOptionKind = 'cdi_tributado' | 'cdi_isento' | 'ipca_tributado' | 'prefixado_tributado' | 'prefixado_isento';
export const COMPARE_OPTION_KINDS: readonly CompareOptionKind[] = ['cdi_tributado', 'cdi_isento', 'ipca_tributado', 'prefixado_tributado', 'prefixado_isento'];
export const COMPARE_OPTION_LABEL: Readonly<Record<CompareOptionKind, string>> = {
  cdi_tributado: '% do CDI, com imposto',
  cdi_isento: '% do CDI, isento',
  ipca_tributado: 'IPCA mais taxa, com imposto',
  prefixado_tributado: 'Prefixado, com imposto',
  prefixado_isento: 'Prefixado, isento',
};
export const COMPARE_MAX_OPTIONS = 4;
export const COMPARE_DAYS_MAX = 3650;

export interface CompareOptionDraft {
  kind: CompareOptionKind | null;
  rateText: string;
}
export interface CompareDraft {
  amountText: string;
  daysText: string;
  cdiText: string;
  ipcaText: string;
  options: CompareOptionDraft[];
}

export interface CompareOptionResult {
  index: number;
  kind: CompareOptionKind;
  rateBp: number;
  grossCents: Cents;
  iofCents: Cents;
  irCents: Cents;
  netCents: Cents;
  /** Rendimento líquido no prazo, em fração. */
  netYield: number;
  /** Nos isentos de % do CDI: a porcentagem do CDI com imposto que daria o mesmo líquido neste prazo (centésimos de ponto). */
  equivalentBp: number | null;
}

export interface CompareResult {
  amountCents: Cents;
  days: number;
  businessDays: number;
  irRate: number;
  options: CompareOptionResult[];
  hypotheses: string[];
}

export type CompareField = 'amountText' | 'daysText' | 'cdiText' | 'ipcaText' | `option.${number}`;

const needsCdi = (k: CompareOptionKind) => k === 'cdi_tributado' || k === 'cdi_isento';
const taxed = (k: CompareOptionKind) => k.endsWith('_tributado');

/** Dias úteis estimados num prazo de dias corridos (252 por ano). */
export function businessDaysFor(days: number): number {
  return Math.round((days * 252) / 365);
}

function grossFactor(kind: CompareOptionKind, rate: number, cdi: number, ipca: number, days: number, du: number): number {
  switch (kind) {
    case 'cdi_tributado':
    case 'cdi_isento':
      return (1 + rate * ((1 + cdi) ** (1 / 252) - 1)) ** du;
    case 'ipca_tributado':
      return (1 + ipca) ** (days / 365) * (1 + rate) ** (du / 252);
    case 'prefixado_tributado':
    case 'prefixado_isento':
      return (1 + rate) ** (du / 252);
  }
}

export function compareNetYields(draft: CompareDraft): { ok: true; result: CompareResult } | { ok: false; errors: Partial<Record<CompareField, string>> } {
  const E = COMPARE_TEXT.errors;
  const errors: Partial<Record<CompareField, string>> = {};
  const amount = parseBRL(draft.amountText);
  if (draft.amountText.trim() === '') errors.amountText = E.amountEmpty;
  else if (amount === null || amount < 100 || amount > 99_999_999_999) errors.amountText = E.amount;
  const daysT = draft.daysText.trim();
  const days = /^\d{1,4}$/.test(daysT) ? Number(daysT) : NaN;
  if (daysT === '') errors.daysText = E.daysEmpty;
  else if (!Number.isInteger(days) || days < 1 || days > COMPARE_DAYS_MAX) errors.daysText = E.days;
  const chosen = draft.options.map((o, i) => ({ ...o, i })).filter((o) => o.kind !== null);
  if (chosen.length === 0) errors['option.0'] = E.noOption;
  const anyCdi = chosen.some((o) => needsCdi(o.kind!));
  const anyIpca = chosen.some((o) => o.kind === 'ipca_tributado');
  const cdiBp = anyCdi ? parseRateText(draft.cdiText) : null;
  if (anyCdi && (cdiBp === null || cdiBp < 1 || cdiBp > 10000)) errors.cdiText = draft.cdiText.trim() === '' ? E.cdiEmpty : E.rate;
  const ipcaBp = anyIpca ? parseRateText(draft.ipcaText) : null;
  if (anyIpca && (ipcaBp === null || ipcaBp < -1000 || ipcaBp > 5000)) errors.ipcaText = draft.ipcaText.trim() === '' ? E.ipcaEmpty : E.rate;
  const rates = new Map<number, number>();
  for (const o of chosen) {
    const bp = parseRateText(o.rateText);
    const max = needsCdi(o.kind!) ? 50000 : 10000;
    if (o.rateText.trim() === '') errors[`option.${o.i}`] = E.rateEmpty;
    else if (bp === null || bp < 1 || bp > max) errors[`option.${o.i}`] = E.rate;
    else rates.set(o.i, bp);
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const du = businessDaysFor(days);
  const cdi = (cdiBp ?? 0) / 10000;
  const ipca = (ipcaBp ?? 0) / 10000;
  const irRate = regressiveRate(days);
  const options = chosen.map((o): CompareOptionResult => {
    const bp = rates.get(o.i)!;
    const rate = bp / 10000;
    const gross = Math.round(amount! * grossFactor(o.kind!, rate, cdi, ipca, days, du));
    const gain = Math.max(0, gross - amount!);
    const iof = Math.round(gain * iofRate(days));
    const ir = taxed(o.kind!) ? Math.round((gain - iof) * irRate) : 0;
    const net = gross - iof - ir;
    const equivalentBp = o.kind === 'cdi_isento' ? Math.round(bp / (1 - irRate)) : null;
    return { index: o.i, kind: o.kind!, rateBp: bp, grossCents: gross, iofCents: iof, irCents: ir, netCents: net, netYield: (net - amount!) / amount!, equivalentBp };
  });
  const hypotheses = [
    `Prazo de ${days} ${days === 1 ? 'dia corrido' : 'dias corridos'}, cerca de ${du} ${du === 1 ? 'dia útil' : 'dias úteis'} (252 por ano).`,
    ...(anyCdi ? [`CDI de ${formatRateInput(cdiBp!)}% ao ano durante todo o prazo.`] : []),
    ...(anyIpca ? [`IPCA de ${formatRateInput(ipcaBp!)}% ao ano durante todo o prazo.`] : []),
    `Imposto pela tabela regressiva em vigor em ${INVESTMENT_TAX_RULES.reviewedOn.split('-').reverse().join('/')}: ${(irRate * 100).toFixed(1).replace('.0', '').replace('.', ',')}% neste prazo, sobre o rendimento.`,
    days < 30 ? 'Resgate antes de 30 dias: IOF sobre o rendimento, antes do imposto.' : 'Sem IOF: o prazo passa de 30 dias.',
    'Sem taxa de custódia nem de administração, e sem o risco de cada emissor.',
  ];
  return { ok: true, result: { amountCents: amount!, days, businessDays: du, irRate, options, hypotheses } };
}

const pct = (f: number) => `${(Math.round(f * 10000) / 100).toFixed(2).replace('.', ',')}%`;

export const COMPARE_TEXT = {
  title: 'Comparar rendimentos líquidos',
  intro: 'O mesmo valor e o mesmo prazo em até quatro opções, com as taxas que você recebeu ou quer testar. A conta mostra quanto sobra depois do imposto.',
  amountLabel: 'Valor aplicado',
  daysLabel: 'Prazo em dias corridos',
  daysHint: 'Por exemplo 365 para um ano, ou 730 para dois.',
  cdiLabel: 'CDI ao ano, como hipótese (%)',
  cdiHint: 'A taxa que você quer testar para todo o prazo.',
  ipcaLabel: 'IPCA ao ano, como hipótese (%)',
  ipcaHint: 'A inflação que você quer testar para todo o prazo.',
  optionTitle: (n: number) => `Opção ${n}`,
  optionKindLabel: 'Como rende',
  optionRateLabel: (k: CompareOptionKind) => (needsCdi(k) ? 'Porcentagem do CDI (%)' : k === 'ipca_tributado' ? 'Taxa acima do IPCA, ao ano (%)' : 'Taxa ao ano (%)'),
  addOption: 'Adicionar opção',
  removeOption: (n: number) => `Tirar a opção ${n}`,
  resultTitle: 'Resultado',
  optionLine: (o: CompareOptionResult, n: number) => `Opção ${n}, ${COMPARE_OPTION_LABEL[o.kind]} a ${formatRateInput(o.rateBp)}%: ${formatBRL(o.netCents)} líquidos.`,
  detailLine: (o: CompareOptionResult) =>
    `Bruto ${formatBRL(o.grossCents)}${o.iofCents > 0 ? `, IOF ${formatBRL(o.iofCents)}` : ''}${o.irCents > 0 ? `, imposto ${formatBRL(o.irCents)}` : ''}. Rendimento líquido de ${pct(o.netYield)} no prazo.`,
  equivalent: (o: CompareOptionResult) => (o.equivalentBp === null ? null : `Neste prazo, equivale a cerca de ${formatRateInput(o.equivalentBp)}% do CDI com imposto.`),
  disclaimer: 'Simulação com as taxas que você informou, pela regra de imposto de hoje, que pode mudar. Não é recomendação de investimento nem comparação de instituições.',
  errors: {
    amountEmpty: 'Informe o valor.',
    amount: 'Informe um valor a partir de R$ 1,00.',
    daysEmpty: 'Informe o prazo.',
    days: `Use de 1 a ${COMPARE_DAYS_MAX} dias.`,
    cdiEmpty: 'Informe o CDI que você quer testar.',
    ipcaEmpty: 'Informe o IPCA que você quer testar.',
    rateEmpty: 'Informe a taxa.',
    rate: 'Informe uma taxa válida, como 110 ou 12,5.',
    noOption: 'Escolha como rende pelo menos uma opção.',
  },
} as const;
