import { formatBpCompact, formatInteger, formatRate } from '../learn/format';
import { fixedIncomeTaxBp, fixedIncomeTaxCents } from '../learn/math';
import { formatBRL, type Cents } from '../money';
import { FieldReader, calcNotes, countField, monthsDuration, moneyField, rateField, type CalcFieldSpec, type CalcOutcome, type CalcTexts } from './common';
import { parseCount, parseMoney, parsePercentBp } from './inputs';

/**
 * Quanto rende a um percentual do CDI (D-106, `docs/22_SITE.md`, seção 16): uma estimativa do valor bruto, do Imposto de Renda pela
 * tabela regressiva da renda fixa e do valor líquido de uma aplicação que rende um percentual do CDI, com o CDI que a própria pessoa
 * digita (o de hoje está na página "CDI hoje" do site, com data e fonte). Por enquanto só o site mostra esta calculadora
 * (`SITE_CALCULATORS`).
 *
 * Conta:
 * - CDI ao dia: d = (1 + CDI ao ano)^(1/252) − 1; a aplicação rende p × d em cada dia útil (p = percentual do CDI);
 * - dias úteis = meses × 21 (252 por ano); valor bruto = piso(valor × (1 + p × d)^dias úteis);
 * - dias corridos = arredondar(meses × 365 ÷ 12), que decidem a alíquota da tabela regressiva (`fixedIncomeTaxBp`, Lei 11.033/2004:
 *   22,5% até 180 dias, 20% até 360, 17,5% até 720 e 15% acima); com 1 mês ou mais são 30 dias ou mais, então não há IOF;
 * - imposto = rendimento × alíquota, metade para cima no centavo (`fixedIncomeTaxCents`); valor líquido = bruto − imposto.
 * O CDI muda com a Selic: o resultado é uma estimativa, com as premissas escritas, e nunca sugere taxa, produto nem instituição.
 */
export type RendimentoCdiField = 'valor' | 'percentual' | 'cdiAno' | 'meses' | 'imposto';
export type RendimentoCdiImposto = 'regressivo' | 'isento';

export interface RendimentoCdiInput {
  valor: string;
  /** Percentual do CDI: de 1% a 300%. */
  percentual: string;
  /** CDI ao ano: de 0% a 30%, digitado pela pessoa. */
  cdiAno: string;
  /** 1 a 600. */
  meses: string;
  imposto: RendimentoCdiImposto | null;
}

export interface RendimentoCdiResult extends CalcTexts {
  valueCents: Cents;
  percentBp: number;
  cdiBp: number;
  months: number;
  /** Dias úteis (meses × 21) e dias corridos (meses × 365 ÷ 12, arredondado) usados na conta. */
  businessDays: number;
  calendarDays: number;
  imposto: RendimentoCdiImposto;
  grossCents: Cents;
  grossYieldCents: Cents;
  /** Alíquota da tabela regressiva em pontos-base; null quando isento. */
  taxRateBp: number | null;
  taxCents: Cents;
  netCents: Cents;
  netYieldCents: Cents;
}

export const RENDIMENTO_CDI_PERCENT_MIN_BP = 100;
export const RENDIMENTO_CDI_PERCENT_MAX_BP = 30_000;
export const RENDIMENTO_CDI_RATE_MAX_BP = 3_000;
export const RENDIMENTO_CDI_MONTHS_MAX = 600;
/** Dias úteis num ano e num mês, a convenção das taxas do CDI. */
export const RENDIMENTO_CDI_BUSINESS_DAYS_YEAR = 252;
export const RENDIMENTO_CDI_BUSINESS_DAYS_MONTH = 21;
/** O maior valor que a calculadora mostra (o mesmo teto do simulador). */
export const RENDIMENTO_CDI_RESULT_MAX_CENTS = 99_999_999_999_999;

export const RENDIMENTO_CDI_FIELDS: Record<RendimentoCdiField, CalcFieldSpec> = {
  valor: moneyField('Quanto vai aplicar', 'quanto vai aplicar', '10.000,00'),
  percentual: rateField(
    'Percentual do CDI (%)',
    'o percentual do CDI',
    '100',
    RENDIMENTO_CDI_PERCENT_MIN_BP,
    RENDIMENTO_CDI_PERCENT_MAX_BP,
    'Use de 1% a 300% do CDI.',
    'Quanto do CDI a aplicação rende, como 100 para 100% do CDI.',
  ),
  cdiAno: rateField('CDI ao ano (%)', 'o CDI ao ano', '10', 0, RENDIMENTO_CDI_RATE_MAX_BP, 'Use de 0% a 30% ao ano.', 'Você informa o CDI que quer testar. A Clarevo não sugere taxas, produtos nem instituições.'),
  meses: countField('Por quantos meses', 'por quantos meses', 1, RENDIMENTO_CDI_MONTHS_MAX, 'Use de 1 a 600 meses.', 'De 1 a 600'),
  imposto: {
    label: 'Imposto de Renda',
    kind: 'opcao',
    default: 'regressivo',
    options: [
      { value: 'regressivo', label: 'Tabela regressiva' },
      { value: 'isento', label: 'Isento' },
    ],
    errors: { vazio: 'Escolha se a aplicação paga Imposto de Renda.' },
  },
};

/** "22,5% até 180 dias, 20% de 181 a 360, 17,5% de 361 a 720 e 15% acima de 720 dias", das alíquotas de `fixedIncomeTaxBp`. */
export function regressiveTableText(): string {
  const a = (days: number) => formatBpCompact(fixedIncomeTaxBp(days));
  return `${a(180)} até 180 dias, ${a(360)} de 181 a 360, ${a(720)} de 361 a 720 e ${a(721)} acima de 720 dias`;
}

export const RENDIMENTO_CDI_TEXT = {
  highlightTaxed: (netCents: Cents, months: number) => `Estimativa: ${formatBRL(netCents)} ao fim de ${monthsDuration(months)}, já sem o Imposto de Renda`,
  highlightExempt: (grossCents: Cents, months: number) => `Estimativa: ${formatBRL(grossCents)} ao fim de ${monthsDuration(months)}`,
  gross: (grossCents: Cents, yieldCents: Cents, share: string) => `Valor bruto: ${formatBRL(grossCents)} (rendimento de ${formatBRL(yieldCents)}, ${share} no período)`,
  yieldExempt: (yieldCents: Cents, share: string) => `Rendimento: ${formatBRL(yieldCents)} (${share} no período)`,
  tax: (taxCents: Cents, rateBp: number, days: number) => `Imposto de Renda estimado: ${formatBRL(taxCents)} (${formatBpCompact(rateBp)} do rendimento, para cerca de ${formatInteger(days)} dias)`,
  netYield: (yieldCents: Cents, share: string) => `Rendimento líquido: ${formatBRL(yieldCents)} (${share} no período)`,
  noteTable: () => `Na tabela regressiva, a alíquota cai com o prazo: ${regressiveTableText()}.`,
  noteCdi: 'O CDI acompanha a Selic e muda com o tempo: o resultado de verdade pode ser maior ou menor que esta estimativa.',
  hypotheses: (cdiBp: number, percentBp: number, days: number, imposto: RendimentoCdiImposto): string[] => [
    `CDI de ${formatBpCompact(cdiBp)} ao ano, o mesmo em todo o prazo.`,
    `A aplicação rende ${formatBpCompact(percentBp)} do CDI em cada dia útil, com ${RENDIMENTO_CDI_BUSINESS_DAYS_MONTH} dias úteis por mês (${RENDIMENTO_CDI_BUSINESS_DAYS_YEAR} por ano).`,
    `Prazo de cerca de ${formatInteger(days)} dias corridos, sem resgatar antes. Resgates com menos de 30 dias também pagam IOF.`,
    imposto === 'regressivo'
      ? 'Imposto de Renda pela tabela regressiva da renda fixa (Lei 11.033/2004), só sobre o rendimento, no resgate.'
      : 'Sem Imposto de Renda, como nas aplicações que a lei isenta para pessoa física.',
    'Sem taxas, custódia nem come-cotas. Valores no centavo.',
  ],
} as const;

/** Participação de um valor no aplicado, como percentual com 2 casas: (1.400, 10.000) → "14,00%". */
function shareText(part: Cents, whole: Cents): string {
  return formatRate(part / whole);
}

export function calcRendimentoCdi(input: RendimentoCdiInput): CalcOutcome<RendimentoCdiResult, RendimentoCdiField> {
  const r = new FieldReader<RendimentoCdiField>();
  const valor = r.read('valor', parseMoney(input.valor));
  const percentual = r.read('percentual', parsePercentBp(input.percentual, { min: RENDIMENTO_CDI_PERCENT_MIN_BP, max: RENDIMENTO_CDI_PERCENT_MAX_BP }));
  const cdi = r.read('cdiAno', parsePercentBp(input.cdiAno, { min: 0, max: RENDIMENTO_CDI_RATE_MAX_BP }));
  const meses = r.read('meses', parseCount(input.meses, 1, RENDIMENTO_CDI_MONTHS_MAX));
  const imposto = input.imposto === 'regressivo' || input.imposto === 'isento' ? input.imposto : r.fail('imposto', 'vazio');
  if (!r.ok || valor === undefined || percentual === undefined || cdi === undefined || meses === undefined || imposto === undefined) return { ok: false, errors: r.errors };

  const businessDays = meses * RENDIMENTO_CDI_BUSINESS_DAYS_MONTH;
  const calendarDays = Math.round((meses * 365) / 12);
  // CDI ao dia útil, com log1p e expm1 para não perder precisão com taxas pequenas.
  const cdiDaily = Math.expm1(Math.log1p(cdi / 10_000) / RENDIMENTO_CDI_BUSINESS_DAYS_YEAR);
  const daily = (cdiDaily * percentual) / 10_000;
  const grossRaw = valor * Math.exp(businessDays * Math.log1p(daily));
  if (!Number.isFinite(grossRaw) || grossRaw > RENDIMENTO_CDI_RESULT_MAX_CENTS) return { ok: false, errors: { meses: 'resultado_alto' } };
  // Para baixo no centavo. O milionésimo de centavo a mais e o máximo só corrigem o ruído do ponto flutuante (com 12 meses a 100% do CDI,
  // o fator é exatamente 1 + CDI, e R$ 11.000,00 não pode virar R$ 10.999,99); com CDI de 0% ou mais, o bruto nunca fica abaixo do aplicado.
  const grossCents = Math.max(valor, Math.floor(grossRaw + 1e-6));
  const grossYieldCents = grossCents - valor;
  const taxRateBp = imposto === 'regressivo' ? fixedIncomeTaxBp(calendarDays) : null;
  const taxCents = imposto === 'regressivo' ? fixedIncomeTaxCents(grossYieldCents, calendarDays) : 0;
  const netCents = grossCents - taxCents;
  const netYieldCents = grossYieldCents - taxCents;

  const T = RENDIMENTO_CDI_TEXT;
  const resultLines =
    imposto === 'regressivo'
      ? [
          T.highlightTaxed(netCents, meses),
          T.gross(grossCents, grossYieldCents, shareText(grossYieldCents, valor)),
          T.tax(taxCents, taxRateBp!, calendarDays),
          T.netYield(netYieldCents, shareText(netYieldCents, valor)),
        ]
      : [T.highlightExempt(grossCents, meses), T.yieldExempt(grossYieldCents, shareText(grossYieldCents, valor))];
  return {
    ok: true,
    result: {
      valueCents: valor,
      percentBp: percentual,
      cdiBp: cdi,
      months: meses,
      businessDays,
      calendarDays,
      imposto,
      grossCents,
      grossYieldCents,
      taxRateBp,
      taxCents,
      netCents,
      netYieldCents,
      resultLines,
      ...calcNotes(imposto === 'regressivo' && ['info', T.noteTable()], ['estimate', T.noteCdi]),
      hypotheses: T.hypotheses(cdi, percentual, calendarDays, imposto),
    },
  };
}
