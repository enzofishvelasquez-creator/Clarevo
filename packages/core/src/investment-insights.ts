import type { IsoDate, IsoMonth } from './dates';
import { addDays, addMonths, addMonthsToDate, formatDateBR, formatMonthYearBR, monthOf, monthsBetween } from './dates';
import { isBusinessDay } from './dia-util';
import {
  GUARANTEE_LABEL,
  INCOME_KIND_LABEL,
  INDEX_KIND_LABEL,
  LIQUIDITY_BUCKET_LABEL,
  SUBKIND_LABEL,
  calendarDaysBetween,
  guaranteeOf,
  institutionKey,
  liquidityBucket,
  taxRegimeOf,
  type InvestmentIncomeKind,
  type InvestmentSubkind,
} from './investment-details';
import type { Investment, InvestmentKind, InvestmentMovement, MarketIndices } from './investments';
import { INVESTMENT_KIND_LABEL, investmentValueOn, joinNamesBR } from './investments';
import type { Cents } from './money';
import { formatBRL } from './money';

/**
 * O que a ficha ampliada permite mostrar na aba Investir (D-099, `docs/49_ESTUDO_INVESTIMENTOS.md`, itens 1 a 9): divisão da carteira,
 * vencimentos, limite do FGC, ganho real, proventos, valor estimado pela taxa contratada e o resumo para a declaração. Só organiza o que
 * a pessoa registrou: sem faixa "recomendada", sem meta de alocação, sem cor de alerta por concentração e sem dizer o que fazer.
 */

type MovementLike = Pick<InvestmentMovement, 'kind' | 'amountCents' | 'occurredOn'> & { createdAt?: string; id?: string };

// ---------------------------------------------------------------------------
// 1. Como está dividido
// ---------------------------------------------------------------------------

export type AllocationDimension = 'kind' | 'subkind' | 'institution' | 'liquidity' | 'index' | 'guarantee';
export const ALLOCATION_DIMENSIONS: readonly AllocationDimension[] = ['kind', 'subkind', 'institution', 'liquidity', 'index', 'guarantee'];
export const ALLOCATION_DIMENSION_LABEL: Readonly<Record<AllocationDimension, string>> = {
  kind: 'Por tipo',
  subkind: 'Por investimento',
  institution: 'Por instituição',
  liquidity: 'Por prazo de resgate',
  index: 'Por forma de render',
  guarantee: 'Por garantia',
};
export const NO_INFO_KEY = 'sem_informacao';
export const NO_INFO_LABEL = 'Sem informação';

export interface AllocationSlice {
  key: string;
  label: string;
  cents: Cents;
  /** Fração do total (0 a 1). */
  share: number;
  count: number;
}

type Item = Pick<Investment, 'id' | 'name' | 'kind' | 'status' | 'valueCents'> &
  Pick<Investment, 'subkind' | 'institution' | 'indexKind' | 'rateBp' | 'maturityOn' | 'liquidity' | 'liquidityOn' | 'liquidityDays'>;

function sliceOf(i: Item, dim: AllocationDimension, today: IsoDate): { key: string; label: string } {
  switch (dim) {
    case 'kind':
      return { key: i.kind, label: INVESTMENT_KIND_LABEL[i.kind] };
    case 'subkind':
      return i.subkind ? { key: i.subkind, label: SUBKIND_LABEL[i.subkind] } : { key: `tipo:${i.kind}`, label: INVESTMENT_KIND_LABEL[i.kind] };
    case 'institution':
      return i.institution ? { key: institutionKey(i.institution), label: i.institution } : { key: NO_INFO_KEY, label: NO_INFO_LABEL };
    case 'liquidity': {
      const b = liquidityBucket(i, today);
      return b ? { key: b, label: LIQUIDITY_BUCKET_LABEL[b] } : { key: NO_INFO_KEY, label: NO_INFO_LABEL };
    }
    case 'index':
      return i.indexKind ? { key: i.indexKind, label: INDEX_KIND_LABEL[i.indexKind] } : { key: NO_INFO_KEY, label: NO_INFO_LABEL };
    case 'guarantee': {
      const g = guaranteeOf(i.kind, i.subkind);
      return g ? { key: g, label: GUARANTEE_LABEL[g] } : { key: NO_INFO_KEY, label: NO_INFO_LABEL };
    }
  }
}

/** Fatias dos ativos com valor, da maior para a menor, e "Sem informação" por último. */
export function investmentAllocation(items: readonly Item[], dim: AllocationDimension, today: IsoDate): AllocationSlice[] {
  const live = items.filter((i) => i.status === 'ativo' && i.valueCents > 0);
  const total = live.reduce((a, i) => a + i.valueCents, 0);
  if (total <= 0) return [];
  const map = new Map<string, AllocationSlice>();
  for (const i of live) {
    const { key, label } = sliceOf(i, dim, today);
    const s = map.get(key) ?? { key, label, cents: 0, share: 0, count: 0 };
    s.cents += i.valueCents;
    s.count += 1;
    map.set(key, s);
  }
  return [...map.values()]
    .map((s) => ({ ...s, share: s.cents / total }))
    .sort((a, b) => (a.key === NO_INFO_KEY ? 1 : b.key === NO_INFO_KEY ? -1 : b.cents - a.cents || a.label.localeCompare(b.label)));
}

/** A dimensão só aparece quando diz alguma coisa: pelo menos uma fatia com informação e mais de uma fatia no total. */
export function allocationUseful(slices: readonly AllocationSlice[]): boolean {
  return slices.length > 1 && slices.some((s) => s.key !== NO_INFO_KEY);
}

// ---------------------------------------------------------------------------
// 2. Vencimentos e liberações
// ---------------------------------------------------------------------------

export interface InvestmentDateEvent {
  investmentId: string;
  name: string;
  /** vencimento; liberacao (fim da carência); vencido (passou do vencimento e ainda tem valor). */
  kind: 'vencimento' | 'liberacao' | 'vencido';
  on: IsoDate;
  /** Dias corridos até a data (negativo no vencido). */
  days: number;
}

/** Datas dos ativos até `horizonDays` dias, mais os vencidos que ainda têm valor, em ordem de data. */
export function investmentDateEvents(items: readonly Item[], today: IsoDate, horizonDays = 365): InvestmentDateEvent[] {
  const out: InvestmentDateEvent[] = [];
  for (const i of items) {
    if (i.status !== 'ativo') continue;
    if (i.maturityOn) {
      const days = calendarDaysBetween(today, i.maturityOn);
      if (days < 0 && i.valueCents > 0) out.push({ investmentId: i.id, name: i.name, kind: 'vencido', on: i.maturityOn, days });
      else if (days >= 0 && days <= horizonDays) out.push({ investmentId: i.id, name: i.name, kind: 'vencimento', on: i.maturityOn, days });
    }
    if (i.liquidity === 'a_partir_de' && i.liquidityOn) {
      const days = calendarDaysBetween(today, i.liquidityOn);
      if (days > 0 && days <= horizonDays && i.liquidityOn !== i.maturityOn) out.push({ investmentId: i.id, name: i.name, kind: 'liberacao', on: i.liquidityOn, days });
    }
  }
  return out.sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : a.name.localeCompare(b.name)));
}

/** "hoje", "amanhã", "daqui a 12 dias", "daqui a 3 meses", "daqui a 1 ano e 2 meses". */
export function relativeDays(days: number): string {
  if (days === 0) return 'hoje';
  if (days === 1) return 'amanhã';
  if (days < 60) return `daqui a ${days} dias`;
  const months = Math.round(days / 30.4375);
  if (months < 12) return `daqui a ${months} meses`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  const ys = y === 1 ? '1 ano' : `${y} anos`;
  return m === 0 ? `daqui a ${ys}` : `daqui a ${ys} e ${m === 1 ? '1 mês' : `${m} meses`}`;
}

export function dateEventText(e: InvestmentDateEvent): string {
  switch (e.kind) {
    case 'vencimento':
      return `${e.name} vence em ${formatDateBR(e.on)}, ${relativeDays(e.days)}.`;
    case 'liberacao':
      return `${e.name} pode ser resgatado a partir de ${formatDateBR(e.on)}, ${relativeDays(e.days)}.`;
    case 'vencido':
      return `${e.name} venceu em ${formatDateBR(e.on)}. Se o dinheiro já voltou para a conta, registre o resgate.`;
  }
}

// ---------------------------------------------------------------------------
// 3. Limite do FGC por instituição
// ---------------------------------------------------------------------------

/** R$ 250.000,00 por pessoa em cada instituição ou conglomerado; R$ 1.000.000,00 a cada 4 anos (regulamento do FGC, tema "fgc"). */
export const FGC_LIMIT_CENTS = 25_000_000;
export const FGC_TOTAL_LIMIT_CENTS = 100_000_000;

export interface FgcGroup {
  key: string;
  label: string;
  cents: Cents;
  names: string[];
  /** Passa de R$ 250.000,00 (só informação; a Clarevo não diz o que fazer). */
  overCents: Cents;
}

export interface FgcSummary {
  groups: FgcGroup[];
  /** Com garantia do FGC, mas sem a instituição informada. */
  withoutInstitution: { cents: Cents; names: string[] };
  totalCents: Cents;
}

export function fgcByInstitution(items: readonly Item[]): FgcSummary {
  const map = new Map<string, FgcGroup>();
  const without = { cents: 0, names: [] as string[] };
  let total = 0;
  for (const i of items) {
    if (i.status !== 'ativo' || i.valueCents <= 0 || guaranteeOf(i.kind, i.subkind) !== 'fgc') continue;
    total += i.valueCents;
    if (!i.institution) {
      without.cents += i.valueCents;
      without.names.push(i.name);
      continue;
    }
    const key = institutionKey(i.institution);
    const g = map.get(key) ?? { key, label: i.institution, cents: 0, names: [], overCents: 0 };
    g.cents += i.valueCents;
    g.names.push(i.name);
    map.set(key, g);
  }
  const groups = [...map.values()].map((g) => ({ ...g, overCents: Math.max(0, g.cents - FGC_LIMIT_CENTS) })).sort((a, b) => b.cents - a.cents || a.label.localeCompare(b.label));
  return { groups, withoutInstitution: without, totalCents: total };
}

export const FGC_TEXT = {
  title: 'Garantia do FGC',
  group: (g: FgcGroup) => `${g.label}: ${formatBRL(g.cents)} em produtos com garantia do FGC.`,
  over: (g: FgcGroup) => `Nesta instituição, ${formatBRL(g.cents)} estão em produtos com garantia do FGC. A garantia vai até ${formatBRL(FGC_LIMIT_CENTS)} por pessoa em cada instituição ou conglomerado.`,
  without: (names: readonly string[]) => `Sem a instituição informada: ${joinNamesBR(names)}. Informe onde está em Editar para somar por instituição.`,
  rules: `A garantia vai até ${formatBRL(FGC_LIMIT_CENTS)} por pessoa em cada instituição ou conglomerado, e até ${formatBRL(FGC_TOTAL_LIMIT_CENTS)} a cada 4 anos. Instituições do mesmo conglomerado somam juntas, e a Clarevo não sabe quais são do mesmo grupo.`,
  estimate: 'Estimativa pelo valor que você registrou. A lista do que tem garantia e das instituições associadas fica no site do FGC.',
} as const;

// ---------------------------------------------------------------------------
// 4. Ganho real e régua da poupança
// ---------------------------------------------------------------------------

/** (1 + rentabilidade) ÷ (1 + IPCA) − 1, no mesmo período. */
export function realRate(rate: number, ipca: number): number {
  return (1 + rate) / (1 + ipca) - 1;
}

const pctSigned = (fraction: number) => {
  const v = Math.round(fraction * 10000) / 100;
  return `${v < 0 ? '-' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(2).replace('.', ',')}%`;
};

export const REAL_GAIN_TEXT = {
  real: (r: number) => (r < 0 ? `Abaixo da inflação no período: ${pctSigned(r)}` : `Acima da inflação no período: ${pctSigned(r)}`),
  poupanca: (v: number | null) => (v === null ? 'Poupança: sem dados para todos os meses' : `Poupança no mesmo período: ${pctSigned(v)}`),
  poupancaNote: 'A poupança rende na data de aniversário de cada depósito; a comparação usa a rentabilidade de quem tem aniversário no dia 1.',
} as const;

// ---------------------------------------------------------------------------
// 5. Proventos e rendimentos recebidos
// ---------------------------------------------------------------------------

export interface IncomeSummary {
  year: number;
  totalCents: Cents;
  byKind: { kind: InvestmentIncomeKind | 'sem_tipo'; label: string; cents: Cents }[];
  byMonth: { month: IsoMonth; cents: Cents }[];
}

export function incomeSummary(movements: readonly (MovementLike & Pick<InvestmentMovement, 'incomeKind'>)[], year: number, today: IsoDate): IncomeSummary {
  const list = movements.filter((m) => m.kind === 'rendimento' && m.occurredOn.startsWith(`${year}-`) && m.occurredOn <= today);
  const kinds = new Map<InvestmentIncomeKind | 'sem_tipo', number>();
  const months = new Map<IsoMonth, number>();
  for (const m of list) {
    const k = m.incomeKind ?? 'sem_tipo';
    kinds.set(k, (kinds.get(k) ?? 0) + m.amountCents);
    const mo = monthOf(m.occurredOn);
    months.set(mo, (months.get(mo) ?? 0) + m.amountCents);
  }
  const byKind = [...kinds.entries()]
    .map(([kind, cents]) => ({ kind, label: kind === 'sem_tipo' ? 'Sem tipo informado' : INCOME_KIND_LABEL[kind], cents }))
    .sort((a, b) => (a.kind === 'sem_tipo' ? 1 : b.kind === 'sem_tipo' ? -1 : b.cents - a.cents));
  const byMonth: { month: IsoMonth; cents: Cents }[] = [];
  const last = year === Number(today.slice(0, 4)) ? monthOf(today) : (`${year}-12` as IsoMonth);
  for (let m = `${year}-01` as IsoMonth; monthsBetween(m, last) >= 0; m = addMonths(m, 1)) byMonth.push({ month: m, cents: months.get(m) ?? 0 });
  return { year, totalCents: list.reduce((a, m) => a + m.amountCents, 0), byKind, byMonth };
}

export const INCOME_TEXT = {
  title: (year: number) => `Rendimentos recebidos em ${year}`,
  total: (c: Cents) => formatBRL(c),
  jcpNote: 'O JCP que cai na conta já vem com 17,5% de imposto de renda descontado.',
  kindHint: 'Ao registrar um rendimento recebido, escolha o tipo para ver a divisão aqui e no resumo para a declaração.',
} as const;

// ---------------------------------------------------------------------------
// 8. Valor estimado pela taxa contratada
// ---------------------------------------------------------------------------

/** Domingo de Páscoa (algoritmo gregoriano anônimo), para o calendário do mercado financeiro. */
function easter(year: number): IsoDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` as IsoDate;
}

const marketHolidayCache = new Map<number, Set<IsoDate>>();
/** Além dos feriados nacionais de `dia-util.ts`: segunda e terça de Carnaval, Sexta-feira Santa e Corpus Christi (sem negócios na bolsa). */
function marketHolidays(year: number): Set<IsoDate> {
  let s = marketHolidayCache.get(year);
  if (!s) {
    const e = easter(year);
    s = new Set([addDays(e, -48), addDays(e, -47), addDays(e, -2), addDays(e, 60)]);
    marketHolidayCache.set(year, s);
  }
  return s;
}

/** Dia útil para o mercado financeiro (as contas do CDI, da Selic e das taxas em 252 dias). */
export function isMarketBusinessDay(date: IsoDate): boolean {
  return isBusinessDay(date) && !marketHolidays(Number(date.slice(0, 4))).has(date);
}

export function marketBusinessDaysInMonth(month: IsoMonth): number {
  let n = 0;
  for (let d = `${month}-01` as IsoDate; d.startsWith(month); d = addDays(d, 1)) if (isMarketBusinessDay(d)) n += 1;
  return n;
}

export interface EstimatedValue {
  valueCents: Cents;
  /** A base: a data do último valor do extrato, ou null quando a conta parte dos aportes. */
  baseOn: IsoDate | null;
  /** Primeiro mês em que a conta repetiu o índice do último mês publicado (null quando todos os meses tinham índice). */
  projectedFrom: IsoMonth | null;
  /** Último mês publicado do índice usado (null no prefixado). */
  lastIndexMonth: IsoMonth | null;
}

type Rate = Pick<Investment, 'indexKind' | 'rateBp'>;

/** Série mensal do índice da forma de render, ou null quando não usa série. */
function seriesFor(index: Rate['indexKind'], indices: MarketIndices | null): Readonly<Record<IsoMonth, number>> | null {
  if (!indices) return null;
  switch (index) {
    case 'cdi':
      return indices.cdi;
    case 'selic':
      return indices.selic ?? null;
    case 'ipca':
      return indices.ipca;
    case 'poupanca':
      return indices.poupanca ?? null;
    default:
      return null;
  }
}

/** O valor do índice no mês, ou o do último mês publicado antes dele (projeção), ou null sem nenhum. */
function monthValue(series: Readonly<Record<IsoMonth, number>>, month: IsoMonth, last: IsoMonth | null): { v: number; projected: boolean } | null {
  const v = series[month];
  if (v !== undefined) return { v, projected: false };
  if (last && monthsBetween(last, month) > 0) return { v: series[last]!, projected: true };
  return null;
}

/**
 * Valor de hoje pela taxa que a pessoa registrou (renda fixa), a partir do último valor do extrato (ou dos aportes, sem nenhum). Depois da
 * base, aportes entram, resgates e rendimentos pagos saem, e cada parte rende do dia em que entrou até hoje:
 * - % do CDI e Selic mais taxa: a taxa diária de cada mês sai do índice acumulado no mês e dos dias úteis do mercado; no CDI, multiplicada
 *   pela porcentagem; na Selic, somada à taxa ao ano em 252 dias úteis;
 * - IPCA mais taxa: o IPCA do mês dividido pelos dias úteis, mais a taxa ao ano em 252 dias úteis;
 * - prefixado: a taxa ao ano em 252 dias úteis;
 * - poupança: a rentabilidade do mês em cada aniversário completo.
 * Mês sem índice publicado repete o último publicado (a tela diz desde quando). Valor "na curva": sem a oscilação de mercado dos títulos,
 * sem imposto e sem taxas. Nunca é gravado sozinho: a pessoa escolhe "Usar este valor".
 */
export function estimateValueByRate(inv: Rate, movements: readonly MovementLike[], indices: MarketIndices | null, today: IsoDate): EstimatedValue | null {
  const index = inv.indexKind;
  if (index === null || index === 'variavel') return null;
  if (index !== 'poupanca' && inv.rateBp === null) return null;
  const live = movements.filter((m) => m.occurredOn <= today);
  if (live.length === 0) return null;
  const series = seriesFor(index, indices);
  if (index !== 'prefixado' && (!series || Object.keys(series).length === 0)) return null;
  const lastMonth = series ? (Object.keys(series).sort().pop() as IsoMonth | undefined) ?? null : null;

  // A base: o último valor do extrato (e o que veio depois dele), ou todos os movimentos.
  const values = live.filter((m) => m.kind === 'valor');
  const base = values.length > 0 ? values.reduce((a, m) => (m.occurredOn > a.occurredOn || (m.occurredOn === a.occurredOn && (m.createdAt ?? '') >= (a.createdAt ?? '')) ? m : a)) : null;
  const flows: { on: IsoDate; cents: number }[] = [];
  if (base) flows.push({ on: base.occurredOn, cents: base.amountCents });
  for (const m of live) {
    if (base && m.occurredOn <= base.occurredOn) continue;
    if (m.kind === 'aporte') flows.push({ on: m.occurredOn, cents: m.amountCents });
    else if (m.kind === 'resgate' || m.kind === 'rendimento') flows.push({ on: m.occurredOn, cents: -m.amountCents });
  }
  if (flows.length === 0) return null;
  let projectedFrom: IsoMonth | null = null;
  const noteProjection = (month: IsoMonth) => {
    if (projectedFrom === null || monthsBetween(month, projectedFrom) > 0) projectedFrom = month;
  };

  const start = flows.reduce((a, f) => (f.on < a ? f.on : a), flows[0]!.on);
  let factorOf: (on: IsoDate) => number;
  if (index === 'poupanca') {
    factorOf = (on) => {
      let f = 1;
      for (let k = 1; ; k += 1) {
        const anniversary = addMonthsToDate(on, k);
        if (anniversary > today) break;
        const periodMonth = monthOf(addMonthsToDate(on, k - 1));
        const mv = monthValue(series!, periodMonth, lastMonth);
        if (!mv) return Number.NaN;
        if (mv.projected) noteProjection(periodMonth);
        f *= 1 + mv.v / 100;
      }
      return f;
    };
  } else {
    // Fator acumulado dia a dia, de `start` até hoje: cumulative[d] = produto dos dias úteis em [start, d).
    const rate = (inv.rateBp ?? 0) / 10000;
    const dailyByMonth = new Map<IsoMonth, number | null>();
    const daily = (month: IsoMonth): number | null => {
      if (dailyByMonth.has(month)) return dailyByMonth.get(month)!;
      let v: number | null;
      if (index === 'prefixado') v = (1 + rate) ** (1 / 252) - 1;
      else {
        const mv = monthValue(series!, month, lastMonth);
        if (!mv) v = null;
        else {
          if (mv.projected) noteProjection(month);
          const n = Math.max(1, marketBusinessDaysInMonth(month));
          const d = (1 + mv.v / 100) ** (1 / n) - 1;
          v = index === 'cdi' ? d * rate : (1 + d) * (1 + rate) ** (1 / 252) - 1;
        }
      }
      dailyByMonth.set(month, v);
      return v;
    };
    const cumulative = new Map<IsoDate, number>();
    let acc = 1;
    let broken = false;
    for (let d = start; d <= today; d = addDays(d, 1)) {
      cumulative.set(d, acc);
      if (d < today && isMarketBusinessDay(d)) {
        const r = daily(monthOf(d));
        if (r === null) broken = true;
        else acc *= 1 + r;
      }
    }
    if (broken) return null;
    const end = cumulative.get(today)!;
    factorOf = (on) => end / cumulative.get(on)!;
  }
  let value = 0;
  for (const f of flows) {
    const factor = factorOf(f.on);
    if (!Number.isFinite(factor)) return null;
    value += f.cents * factor;
  }
  if (!Number.isFinite(value)) return null;
  return { valueCents: Math.max(0, Math.round(value)), baseOn: base ? base.occurredOn : null, projectedFrom, lastIndexMonth: index === 'prefixado' ? null : lastMonth };
}

export const ESTIMATE_TEXT = {
  title: 'Valor pela taxa contratada',
  value: (c: Cents) => `Valor estimado: ${formatBRL(c)}`,
  basis: (e: EstimatedValue) =>
    e.baseOn ? `Pela taxa que você registrou, a partir do valor de ${formatDateBR(e.baseOn)}.` : 'Pela taxa que você registrou, a partir dos aportes.',
  projected: (e: EstimatedValue) =>
    e.projectedFrom && e.lastIndexMonth ? `Desde ${formatMonthYearBR(e.projectedFrom)}, sem índice publicado, a conta repete o de ${formatMonthYearBR(e.lastIndexMonth)}.` : null,
  rule: 'Valor bruto, sem imposto, sem taxas e sem a oscilação de mercado dos títulos. O valor do seu extrato é o que vale.',
  use: 'Usar este valor',
  useHint: 'Registra uma atualização de valor com a data de hoje. Confira antes com o seu extrato.',
  used: 'Valor atualizado pela taxa contratada.',
  unavailable: 'Sem o índice agora. Tente de novo mais tarde.',
} as const;

// ---------------------------------------------------------------------------
// 9. Resumo para a declaração anual
// ---------------------------------------------------------------------------

/**
 * Grupo e código de Bens e Direitos pelo tipo exato, para CONFERIR no programa da Receita (as tabelas mudam de um ano para outro e
 * divergem entre guias; revisão anual). Null quando o código depende do caso.
 */
export const DECLARATION_CODES: Readonly<Partial<Record<InvestmentSubkind, { group: string; code: string | null }>>> = {
  poupanca: { group: '04', code: '01' },
  cdb: { group: '04', code: '02' },
  lc: { group: '04', code: '02' },
  debenture: { group: '04', code: '02' },
  coe: { group: '04', code: '02' },
  tesouro_selic: { group: '04', code: '02' },
  tesouro_prefixado: { group: '04', code: '02' },
  tesouro_prefixado_juros: { group: '04', code: '02' },
  tesouro_ipca: { group: '04', code: '02' },
  tesouro_ipca_juros: { group: '04', code: '02' },
  tesouro_renda: { group: '04', code: '02' },
  tesouro_educa: { group: '04', code: '02' },
  tesouro_reserva: { group: '04', code: '02' },
  lci: { group: '04', code: '03' },
  lca: { group: '04', code: '03' },
  lcd: { group: '04', code: '03' },
  lig: { group: '04', code: '03' },
  cri: { group: '04', code: '03' },
  cra: { group: '04', code: '03' },
  debenture_incentivada: { group: '04', code: '03' },
  bdr: { group: '04', code: '04' },
  acao: { group: '03', code: '01' },
  fii: { group: '07', code: '03' },
  vgbl: { group: '99', code: '06' },
};

/** Ações, FII, ETF, BDR, fundos de ações e criptoativos: a declaração usa o custo de compra, que está no informe da corretora. */
const COST_BASED_KINDS: readonly InvestmentKind[] = ['acoes', 'cripto'];
const COST_BASED_SUBKINDS: readonly InvestmentSubkind[] = ['acao', 'bdr', 'etf', 'fii', 'fiagro', 'fundo_acoes'];

export interface DeclarationItem {
  investmentId: string;
  name: string;
  label: string;
  institution: string | null;
  group: string | null;
  code: string | null;
  /** Discriminação sugerida, sem CPF nem número de conta. */
  description: string;
  costBased: boolean;
  pgbl: boolean;
  /** Valor registrado em 31/12 do ano anterior e do ano (null no custo de compra ou sem movimento até a data). */
  previousCents: Cents | null;
  currentCents: Cents | null;
  /** Sem atualização de valor em dezembro do ano: o valor de 31/12 é o último registrado mais aportes e resgates. */
  currentEstimated: boolean;
}

export interface DeclarationIncome {
  /** Rendimentos isentos e não tributáveis: dividendos, rendimentos de FII e juros de produtos isentos. */
  exemptCents: Cents;
  /** Tributação exclusiva ou definitiva: JCP e juros de produtos com tabela regressiva. */
  exclusiveCents: Cents;
  /** Sem tipo ou de regra que depende do caso: conferir no informe. */
  otherCents: Cents;
}

export interface DeclarationSummary {
  year: number;
  items: DeclarationItem[];
  income: DeclarationIncome;
  institutions: string[];
}

export function declarationSummary(
  items: readonly (Item & Pick<Investment, 'firstMovementOn'>)[],
  movements: readonly (MovementLike & Pick<InvestmentMovement, 'investmentId' | 'incomeKind'>)[],
  year: number,
): DeclarationSummary {
  const end = `${year}-12-31` as IsoDate;
  const prevEnd = `${year - 1}-12-31` as IsoDate;
  const decStart = `${year}-12-01` as IsoDate;
  const out: DeclarationItem[] = [];
  const income: DeclarationIncome = { exemptCents: 0, exclusiveCents: 0, otherCents: 0 };
  const institutions = new Map<string, string>();
  for (const i of items) {
    const list = movements.filter((m) => m.investmentId === i.id);
    const firstOn = list.reduce<IsoDate | null>((a, m) => (a === null || m.occurredOn < a ? m.occurredOn : a), null);
    if (firstOn === null || firstOn > end) continue;
    // Encerrado com valor zero antes do ano anterior: fica de fora.
    const prev = firstOn <= prevEnd ? investmentValueOn(list, prevEnd) : null;
    const cur = investmentValueOn(list, end);
    if (i.status !== 'ativo' && cur === 0 && (prev === null || prev === 0) && !list.some((m) => m.occurredOn.startsWith(`${year}-`))) continue;
    const costBased = COST_BASED_KINDS.includes(i.kind) || (i.subkind !== null && COST_BASED_SUBKINDS.includes(i.subkind));
    const code = i.subkind ? DECLARATION_CODES[i.subkind] ?? null : i.kind === 'cripto' ? { group: '08', code: null } : null;
    const label = i.subkind ? SUBKIND_LABEL[i.subkind] : INVESTMENT_KIND_LABEL[i.kind];
    const where = i.institution ? ` na instituição ${i.institution}` : '';
    out.push({
      investmentId: i.id,
      name: i.name,
      label,
      institution: i.institution,
      group: code?.group ?? null,
      code: code?.code ?? null,
      description: `${label}${where}, aplicado desde ${formatDateBR(firstOn)}.`,
      costBased,
      pgbl: i.subkind === 'pgbl',
      previousCents: costBased ? null : prev,
      currentCents: costBased ? null : cur,
      currentEstimated: !costBased && !list.some((m) => m.kind === 'valor' && m.occurredOn >= decStart && m.occurredOn <= end),
    });
    if (i.institution) institutions.set(institutionKey(i.institution), i.institution);
    const regime = taxRegimeOf(i.kind, i.subkind);
    for (const m of list) {
      if (m.kind !== 'rendimento' || !m.occurredOn.startsWith(`${year}-`)) continue;
      const k = m.incomeKind;
      if (k === 'dividendo' || k === 'fii') income.exemptCents += m.amountCents;
      else if (k === 'jcp') income.exclusiveCents += m.amountCents;
      else if (k === 'juros' && regime === 'isento') income.exemptCents += m.amountCents;
      else if (k === 'juros' && regime === 'regressiva') income.exclusiveCents += m.amountCents;
      else income.otherCents += m.amountCents;
    }
  }
  return { year, items: out, income, institutions: [...institutions.values()].sort((a, b) => a.localeCompare(b)) };
}

export const DECLARATION_TEXT = {
  title: (year: number) => `Para a declaração de ${year + 1}`,
  subtitle: (year: number) => `Ano de ${year}. Um resumo para conferir com os informes de rendimentos, não a declaração pronta.`,
  code: (it: DeclarationItem) =>
    it.group === null ? 'Grupo e código: confira no programa da Receita.' : it.code === null ? `Grupo ${it.group}; o código depende do ativo.` : `Grupo ${it.group}, código ${it.code} (confira no programa da Receita).`,
  values: (it: DeclarationItem, year: number) =>
    `Valor registrado em 31/12/${year - 1}: ${it.previousCents === null ? 'sem registro' : formatBRL(it.previousCents)}. Em 31/12/${year}: ${it.currentCents === null ? 'sem registro' : formatBRL(it.currentCents)}.`,
  estimated: (year: number) => `Sem valor atualizado em dezembro de ${year}: o valor de 31/12 é o último registrado mais os aportes e resgates.`,
  costBased: 'A declaração usa o custo de compra, que está no informe da corretora, não o valor de hoje.',
  pgbl: 'PGBL: as contribuições vão em Pagamentos efetuados, não em Bens e Direitos.',
  informe: 'O informe de rendimentos de cada instituição diz o valor a declarar.',
  noCpf: 'Na discriminação, não é preciso número de conta nem CPF de ninguém.',
  incomeTitle: 'Rendimentos recebidos no ano',
  exempt: (c: Cents) => `Isentos e não tributáveis: ${formatBRL(c)}`,
  exclusive: (c: Cents) => `Tributação exclusiva: ${formatBRL(c)}`,
  other: (c: Cents) => `Sem tipo informado, para conferir no informe: ${formatBRL(c)}`,
  institutionsTitle: 'Informes a juntar',
  reminder: 'Em janeiro, registre o valor de 31/12 de cada investimento.',
  empty: (year: number) => `Nenhum investimento registrado em ${year}.`,
} as const;

/** Os anos com movimento, do mais recente ao mais antigo (até 3), sempre com o ano de hoje. */
export function declarationYears(movements: readonly MovementLike[], today: IsoDate): number[] {
  const current = Number(today.slice(0, 4));
  const years = new Set<number>([current]);
  for (const m of movements) {
    const y = Number(m.occurredOn.slice(0, 4));
    if (y <= current && y >= current - 2) years.add(y);
  }
  return [...years].sort((a, b) => b - a);
}
