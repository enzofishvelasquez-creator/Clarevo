import type { IsoDate } from './dates';
import { addMonthsToDate, formatDateBR, formatDayMonth, isValidIsoDate, monthOf } from './dates';
import type { InvestmentDetailsDraft } from './investment-details';
import { guaranteeOf, institutionKey } from './investment-details';
import type { AllocationDimension } from './investment-insights';
import { FGC_LIMIT_CENTS, allocationUseful, investmentAllocation } from './investment-insights';
import type { Investment, InvestmentKind, InvestmentMovement, InvestmentPlan } from './investments';
import { INVESTMENT_TEXT, joinNamesBR } from './investments';
import type { Cents } from './money';
import { formatBRL } from './money';

/**
 * Aba Investir, melhorias da D-103 (estudo "Bolsa no site e aba Investir", seção "Dezesseis melhorias para Investir"): de quando é cada
 * valor (item 1), o ganho em reais antes da porcentagem e "Como a conta é feita" (item 2), modelos de registro na tela vazia (item 5), a
 * divisão por instituição com a soma da garantia do FGC (item 9) e a revisão opcional do plano de aportes (item 14). Só organiza o que a
 * pessoa registrou: nada aqui recomenda produto, instituição ou momento, e nada tem cor de alerta.
 */

type MovementLike = Pick<InvestmentMovement, 'kind' | 'amountCents' | 'occurredOn'> & { note?: string | null; createdAt?: string; id?: string };

// ---------------------------------------------------------------------------
// 1. De quando é cada valor
// ---------------------------------------------------------------------------

/**
 * De onde veio o valor registrado: digitado pela pessoa (o extrato), o preço publicado do título, a cota do fundo ou a taxa contratada.
 * Os três últimos vêm de "Usar este valor" no investimento, que grava a atualização com a observação de VALUE_SOURCE_NOTE; sem ela (ou
 * com a observação mudada pela pessoa), o valor conta como digitado.
 */
export type ValueSource = { kind: 'extrato' } | { kind: 'tesouro'; on: IsoDate } | { kind: 'cota'; on: IsoDate } | { kind: 'taxa' };

/** Observações gravadas na atualização de valor feita por "Usar este valor" (até 80 caracteres, como toda observação). */
export const VALUE_SOURCE_NOTE = {
  /** "Preço do Tesouro Nacional de 06/10/2026" */
  treasury: (on: IsoDate) => `Preço do Tesouro Nacional de ${formatDateBR(on)}`,
  /** "Cota do fundo de 05/10/2026" */
  fund: (on: IsoDate) => `Cota do fundo de ${formatDateBR(on)}`,
  rate: 'Pela taxa contratada',
} as const;

const brDateToIso = (d: string): IsoDate | null => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  return isValidIsoDate(iso) ? iso : null;
};

/** A origem pela observação da atualização (exatamente como VALUE_SOURCE_NOTE grava); qualquer outra observação: o extrato. */
export function valueSourceFromNote(note: string | null | undefined): ValueSource {
  const text = (note ?? '').trim();
  if (text === VALUE_SOURCE_NOTE.rate) return { kind: 'taxa' };
  const treasury = /^Preço do Tesouro Nacional de (\d{2}\/\d{2}\/\d{4})$/.exec(text);
  const treasuryOn = treasury ? brDateToIso(treasury[1]!) : null;
  if (treasuryOn) return { kind: 'tesouro', on: treasuryOn };
  const fund = /^Cota do fundo de (\d{2}\/\d{2}\/\d{4})$/.exec(text);
  const fundOn = fund ? brDateToIso(fund[1]!) : null;
  if (fundOn) return { kind: 'cota', on: fundOn };
  return { kind: 'extrato' };
}

export interface ValueStamp {
  /** O dia da última atualização de valor (null sem nenhuma: o valor é o aplicado menos o resgatado). */
  on: IsoDate | null;
  source: ValueSource;
  /** Aportes e resgates depois da última atualização (o valor de hoje os soma e desconta pelo valor de cada um). */
  depositsAfter: boolean;
  withdrawalsAfter: boolean;
}

/**
 * De quando é o valor de um investimento: a última atualização até hoje (no mesmo dia, a criada por último, como nas contas do valor),
 * de onde ela veio e se houve aportes ou resgates depois.
 */
export function investmentValueStamp(movements: readonly MovementLike[], today: IsoDate): ValueStamp {
  const live = movements.filter((m) => m.occurredOn <= today);
  let last: MovementLike | null = null;
  for (const m of live) {
    if (m.kind !== 'valor') continue;
    if (last === null || m.occurredOn > last.occurredOn || (m.occurredOn === last.occurredOn && (m.createdAt ?? '') >= (last.createdAt ?? ''))) last = m;
  }
  if (last === null) return { on: null, source: { kind: 'extrato' }, depositsAfter: false, withdrawalsAfter: false };
  const on = last.occurredOn;
  return {
    on,
    source: valueSourceFromNote(last.note),
    depositsAfter: live.some((m) => m.kind === 'aporte' && m.occurredOn > on),
    withdrawalsAfter: live.some((m) => m.kind === 'resgate' && m.occurredOn > on),
  };
}

/** De quando são os valores da carteira (card azul): a data mais antiga e a mais recente das últimas atualizações dos ativos. */
export interface PortfolioDates {
  from: IsoDate | null;
  to: IsoDate | null;
  /** Ativos sem nenhuma atualização de valor no mês de hoje, na ordem recebida (os sem nenhuma atualização também). */
  notThisMonth: string[];
}

export function portfolioValueDates(items: readonly Pick<Investment, 'name' | 'status' | 'lastValueOn'>[], today: IsoDate): PortfolioDates {
  const active = items.filter((i) => i.status === 'ativo');
  const dates = active.map((i) => i.lastValueOn).filter((d): d is IsoDate => d !== null && d <= today).sort();
  const month = monthOf(today);
  return {
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
    notThisMonth: active.filter((i) => i.lastValueOn === null || monthOf(i.lastValueOn) !== month).map((i) => i.name),
  };
}

const afterText = (s: ValueStamp) =>
  s.depositsAfter && s.withdrawalsAfter
    ? ', mais os aportes e menos os resgates depois dessa data'
    : s.depositsAfter
      ? ', mais os aportes depois dessa data'
      : s.withdrawalsAfter
        ? ', menos os resgates depois dessa data'
        : '';

export const VALUE_DATE_TEXT = {
  /** Linha de cada investimento na lista. */
  row: (s: ValueStamp): string => {
    if (s.on === null) return 'Sem atualização do extrato: mostra o que foi aplicado.';
    const after = afterText(s);
    switch (s.source.kind) {
      case 'tesouro':
        return `Valor de ${formatDateBR(s.on)}, pelo preço do Tesouro Nacional de ${formatDateBR(s.source.on)}${after}.`;
      case 'cota':
        return `Valor de ${formatDateBR(s.on)}, pela cota do fundo de ${formatDateBR(s.source.on)}${after}.`;
      case 'taxa':
        return `Valor de ${formatDateBR(s.on)}, pela taxa contratada${after}.`;
      default:
        return `Atualizado por você em ${formatDateBR(s.on)}${after}.`;
    }
  },
  /** Linha do card azul: "Valores de 30/09 a 06/10/2026, como você registrou." */
  card: (d: PortfolioDates): string => {
    if (d.from === null || d.to === null) return 'Nenhum valor atualizado ainda: o total é o que foi aplicado.';
    if (d.from === d.to) return `Valores de ${formatDateBR(d.to)}, como você registrou.`;
    const from = d.from.slice(0, 4) === d.to.slice(0, 4) ? formatDayMonth(d.from) : formatDateBR(d.from);
    return `Valores de ${from} a ${formatDateBR(d.to)}, como você registrou.`;
  },
  /** "Sem atualização neste mês: Previdência e Ações." */
  notThisMonth: (names: readonly string[]) => `Sem atualização neste mês: ${joinNamesBR(names)}.`,
  /** Uma falha ao recarregar com os valores de antes ainda na tela (nunca zero no lugar deles). */
  stale: 'Não foi possível atualizar agora. Os valores abaixo são os últimos carregados, cada um com a data dele.',
  /** Os movimentos não vieram: os totais e a lista continuam, sem as partes que dependem deles. */
  partial: 'Não foi possível carregar tudo agora. Os valores abaixo são os últimos registrados, cada um com a data dele.',
  retry: 'Tentar de novo',
} as const;

// ---------------------------------------------------------------------------
// 2. Ganho em reais primeiro e "Como a conta é feita"
// ---------------------------------------------------------------------------

export interface PortfolioTotals {
  valueCents: Cents;
  depositsCents: Cents;
  withdrawalsCents: Cents;
  incomeCents: Cents;
  /** valor + resgatado + rendimentos recebidos − aportado. */
  gainCents: Cents;
}

/** Os totais dos ativos (os encerrados ficam fora, como no card azul). */
export function portfolioTotals(items: readonly Pick<Investment, 'status' | 'valueCents' | 'depositsCents' | 'withdrawalsCents' | 'incomeCents'>[]): PortfolioTotals {
  const active = items.filter((i) => i.status === 'ativo');
  const sum = (f: (i: (typeof active)[number]) => number) => active.reduce((a, i) => a + f(i), 0);
  const valueCents = sum((i) => i.valueCents);
  const depositsCents = sum((i) => i.depositsCents);
  const withdrawalsCents = sum((i) => i.withdrawalsCents);
  const incomeCents = sum((i) => i.incomeCents);
  return { valueCents, depositsCents, withdrawalsCents, incomeCents, gainCents: valueCents + withdrawalsCents + incomeCents - depositsCents };
}

/** Ganho ÷ aportado (fração), desde o primeiro aporte; null sem aporte. */
export function gainOverInvested(gainCents: Cents, depositsCents: Cents): number | null {
  return depositsCents > 0 ? gainCents / depositsCents : null;
}

const signedPct = (fraction: number) => INVESTMENT_TEXT.percent(fraction);

export const HOW_CALC_TEXT = {
  /** "+2,94% sobre o investido" (logo abaixo do ganho em reais). */
  onInvested: (fraction: number) => `${signedPct(fraction)} sobre o investido`,
  open: 'Como a conta é feita',
  openHint: 'Explica cada número do card',
  title: 'Como a conta é feita',
  close: 'Fechar',
  note: 'A Clarevo faz a conta só com o que você registra. O extrato de cada instituição é o que vale.',
} as const;

export interface HowLine {
  title: string;
  text: string;
}

/** As linhas de "Como a conta é feita", com os números do card. Resgatado e rendimentos só aparecem quando existem. */
export function howCalculatedLines(t: PortfolioTotals): HowLine[] {
  const out: HowLine[] = [
    {
      title: `Valor de hoje: ${formatBRL(t.valueCents)}`,
      text: 'A soma do último valor que você registrou em cada investimento ativo, mais os aportes e menos os resgates feitos depois dele. Investimento sem atualização entra pelo que foi aplicado.',
    },
    { title: INVESTMENT_TEXT.invested(t.depositsCents), text: 'A soma do que você colocou nos investimentos ativos, sem os rendimentos.' },
  ];
  if (t.withdrawalsCents > 0) out.push({ title: INVESTMENT_TEXT.withdrawn(t.withdrawalsCents), text: 'O que você já tirou deles. Entra no ganho, porque saiu com o rendimento junto.' });
  if (t.incomeCents > 0) out.push({ title: INVESTMENT_TEXT.income(t.incomeCents), text: 'O que caiu na sua conta, como dividendos e juros pagos.' });
  const result = t.gainCents < 0 ? `perda de ${formatBRL(-t.gainCents)}` : `ganho de ${formatBRL(t.gainCents)}`;
  out.push({
    title: INVESTMENT_TEXT.gain(t.gainCents),
    text: `Valor de hoje, mais o resgatado e os rendimentos recebidos, menos o aportado: ${formatBRL(t.valueCents)} + ${formatBRL(t.withdrawalsCents)} + ${formatBRL(t.incomeCents)} − ${formatBRL(t.depositsCents)}. Resultado: ${result}.`,
  });
  const share = gainOverInvested(t.gainCents, t.depositsCents);
  if (share !== null) {
    out.push({
      title: HOW_CALC_TEXT.onInvested(share),
      text: `O ganho dividido pelo aportado: ${formatBRL(t.gainCents)} ÷ ${formatBRL(t.depositsCents)}. É o total desde o primeiro aporte, não uma taxa ao ano nem a do mês.`,
    });
  }
  out.push({
    title: 'De quando é cada valor',
    text: 'Cada valor é do dia em que você o atualizou. A lista mostra a data de cada investimento, e o card vai da data mais antiga à mais recente.',
  });
  out.push({
    title: 'Desempenho',
    text: 'Em "Ver desempenho", cada investimento é comparado com o CDI, o IPCA e a poupança no próprio período. Acima da inflação: (1 + rendimento) ÷ (1 + IPCA) − 1, no mesmo período.',
  });
  return out;
}

// ---------------------------------------------------------------------------
// 5. Modelos de registro na tela vazia
// ---------------------------------------------------------------------------

/** Modelos de registro (nunca sugestão de produto): o que a pessoa já tem. Os nomes internos não citam produto. */
export type InvestmentTemplate = 'reserva' | 'titulo' | 'banco' | 'outro';
export const INVESTMENT_TEMPLATES: readonly InvestmentTemplate[] = ['reserva', 'titulo', 'banco', 'outro'];

export const INVESTMENT_TEMPLATE_TEXT = {
  title: 'Por onde começar o registro',
  intro: 'Escolha o que você já tem. O formulário abre com uma parte preenchida, e dá para mudar tudo.',
  label: {
    reserva: 'Reserva de emergência',
    titulo: 'Título do Tesouro',
    banco: 'CDB, LCI ou LCA que já tenho',
    outro: 'Outro investimento',
  } as Readonly<Record<InvestmentTemplate, string>>,
  hint: {
    reserva: 'O dinheiro guardado para imprevistos, onde ele estiver.',
    titulo: 'Um título público que você já comprou.',
    banco: 'Um título de banco que você já tem, com a taxa do contrato.',
    outro: 'Ações, fundos, previdência, criptoativos ou outro tipo.',
  } as Readonly<Record<InvestmentTemplate, string>>,
  note: 'São só modelos para registrar o que você já tem. A Clarevo não indica onde investir.',
} as const;

export interface InvestmentTemplatePreset {
  name: string;
  kind: InvestmentKind | null;
  details: Partial<InvestmentDetailsDraft>;
  /** Abre "Mais detalhes (opcional)" para a pessoa ver o que veio preenchido. */
  openDetails: boolean;
}

/**
 * O que cada modelo preenche no formulário de novo investimento: o tipo e, no título de banco, a forma de render mais comum ("Porcentagem
 * do CDI", que a pessoa troca se o contrato for outro). No título público, a forma de render vem ao escolher qual é o título, como já
 * acontece no formulário. A reserva leva só o nome e o tipo. Valor, data e taxa ficam sempre em branco.
 */
export function investmentTemplatePreset(t: InvestmentTemplate): InvestmentTemplatePreset {
  switch (t) {
    case 'reserva':
      return { name: INVESTMENT_TEMPLATE_TEXT.label.reserva, kind: 'renda_fixa', details: {}, openDetails: false };
    case 'titulo':
      return { name: '', kind: 'titulos_publicos', details: {}, openDetails: true };
    case 'banco':
      return { name: '', kind: 'renda_fixa', details: { indexKind: 'cdi' }, openDetails: true };
    default:
      return { name: '', kind: null, details: {}, openDetails: false };
  }
}

/** O modelo pelo parâmetro "modelo" da rota de novo investimento (texto ou lista do expo-router); desconhecido: null. */
export function investmentTemplateFrom(param: unknown): InvestmentTemplate | null {
  const value = Array.isArray(param) ? param[0] : param;
  return typeof value === 'string' && (INVESTMENT_TEMPLATES as readonly string[]).includes(value) ? (value as InvestmentTemplate) : null;
}

// ---------------------------------------------------------------------------
// 9. Por instituição, com a soma da garantia do FGC
// ---------------------------------------------------------------------------

/** A ordem das divisões na aba: "Por instituição" logo depois de "Por tipo". */
export const TAB_ALLOCATION_ORDER: readonly AllocationDimension[] = ['kind', 'institution', 'subkind', 'liquidity', 'index', 'guarantee'];

type AllocationItem = Parameters<typeof investmentAllocation>[0][number];

/**
 * As divisões que aparecem: cada uma quando diz alguma coisa (allocationUseful), e "Por instituição" sempre que algum ativo com valor
 * tem a instituição na ficha, mesmo uma só, para a pessoa comparar a soma com o limite do FGC.
 */
export function tabAllocationDimensions(items: readonly AllocationItem[], today: IsoDate): AllocationDimension[] {
  return TAB_ALLOCATION_ORDER.filter((d) =>
    d === 'institution'
      ? items.some((i) => i.status === 'ativo' && i.valueCents > 0 && i.institution !== null)
      : allocationUseful(investmentAllocation(items, d, today)),
  );
}

/** A soma dos ativos com garantia do FGC por instituição (pela chave da fatia "Por instituição") e os que têm a garantia sem a instituição. */
export function fgcByInstitutionKey(items: readonly AllocationItem[]): { byKey: Map<string, Cents>; withoutInstitution: string[]; totalCents: Cents } {
  const byKey = new Map<string, Cents>();
  const withoutInstitution: string[] = [];
  let totalCents = 0;
  for (const i of items) {
    if (i.status !== 'ativo' || i.valueCents <= 0 || guaranteeOf(i.kind, i.subkind) !== 'fgc') continue;
    totalCents += i.valueCents;
    if (!i.institution) withoutInstitution.push(i.name);
    else byKey.set(institutionKey(i.institution), (byKey.get(institutionKey(i.institution)) ?? 0) + i.valueCents);
  }
  return { byKey, withoutInstitution, totalCents };
}

export const INSTITUTION_FGC_TEXT = {
  /** Embaixo da fatia da instituição: "R$ 10.875,00 em produtos com garantia do FGC." */
  slice: (cents: Cents) => `${formatBRL(cents)} em produtos com garantia do FGC.`,
  /** O limite, dito como informação (sem alerta), para a pessoa comparar com as somas. */
  limit: `Para comparar: a garantia do FGC vai até ${formatBRL(FGC_LIMIT_CENTS)} por pessoa em cada instituição ou conglomerado.`,
} as const;

// ---------------------------------------------------------------------------
// 14. Revisão opcional do plano de aportes
// ---------------------------------------------------------------------------

/** O convite aparece depois de 3 meses sem revisar o plano. */
export const PLAN_REVIEW_MONTHS = 3;

const asDate = (value: string | null | undefined): IsoDate | null => {
  const d = (value ?? '').slice(0, 10);
  return isValidIsoDate(d) ? d : null;
};

/** Meses completos de `from` até `today` (0 quando `from` é depois de hoje): o maior n com from + n meses ≤ today. */
export function fullMonthsSince(from: IsoDate, today: IsoDate): number {
  if (from >= today) return 0;
  let n = 0;
  while (addMonthsToDate(from, n + 1) <= today) n += 1;
  return n;
}

/**
 * Meses desde a última revisão do plano quando o convite deve aparecer, ou null. A revisão é a última mudança do plano (a data de
 * alteração dele) ou a última vez que a pessoa abriu a tela do plano neste aparelho, a mais recente. "Agora não" oculta o convite por
 * mais 3 meses. Sem plano, nunca.
 */
export function planReviewDue(
  plan: Pick<InvestmentPlan, 'updatedAt'> | null,
  device: { reviewedOn: string | null; dismissedOn: string | null },
  today: IsoDate,
): number | null {
  if (!plan) return null;
  const changed = asDate(plan.updatedAt);
  const seen = asDate(device.reviewedOn);
  const last = changed && seen ? (changed > seen ? changed : seen) : (changed ?? seen);
  if (!last) return null;
  const months = fullMonthsSince(last, today);
  if (months < PLAN_REVIEW_MONTHS) return null;
  const dismissed = asDate(device.dismissedOn);
  if (dismissed && fullMonthsSince(dismissed, today) < PLAN_REVIEW_MONTHS) return null;
  return months;
}

export const PLAN_REVIEW_TEXT = {
  /** "Faz 3 meses que você revisou o plano. Quer conferir?" */
  invite: (months: number) => `Faz ${months} meses que você revisou o plano. Quer conferir?`,
  later: 'Agora não',
  laterA11y: 'Agora não: ocultar o convite para conferir o plano de aportes',
} as const;
