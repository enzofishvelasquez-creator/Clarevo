import type { IsoDate, IsoMonth } from './dates';
import { addDays, addMonths, daysInMonth, formatDateBR, formatMonthYearBR, isValidIsoDate, monthOf, monthsBetween, parseDateBR } from './dates';
import type { Cents } from './money';
import { MAX_RECORD_CENTS, formatBRL, parseBRL } from './money';
import { charCount } from './validation';

/**
 * Investimentos (D-093, `docs/45_INVESTIMENTOS.md`): acompanhamento manual, só no Pessoal. A pessoa registra aportes, resgates,
 * rendimentos recebidos e o valor atual que vê no extrato; a Clarevo calcula o aportado, o valor, o ganho e a rentabilidade, e
 * compara com o CDI e o IPCA (séries públicas do Banco Central). Nada aqui recomenda investimento, nem cotação automática, nem
 * conexão com corretora. Regras repetidas no banco (funções de investimentos, migração 0032).
 *
 * - Valor ao fim de um dia: com uma atualização de valor no dia, o valor informado (ele já inclui os aportes e resgates do dia);
 *   sem atualização, o valor do dia anterior + aportes − resgates do dia. Antes da primeira atualização, o valor é o aportado
 *   menos o resgatado (custo).
 * - O valor ao fim de cada dia nunca fica negativo: um resgate maior que o valor naquele dia é recusado (I1).
 * - Ganho = valor + resgates + rendimentos recebidos − aportes.
 * - Rentabilidade de um mês (Dietz modificado): (V1 − V0 − aportes + resgates + rendimentos) ÷ (V0 + Σ peso × fluxo), com o peso
 *   do fluxo do dia d igual a (dias do mês − d) ÷ dias do mês (o fluxo entra no fim do dia). Mês com base ≤ 0 fica de fora.
 *   Períodos maiores encadeiam os meses: Π(1 + r) − 1.
 * - Aportes, resgates e rendimentos nunca entram em Recebido, Pago, Diferença nem na renda comprometida: o dinheiro só mudou de lugar.
 */

export type InvestmentKind = 'renda_fixa' | 'titulos_publicos' | 'acoes' | 'fundos' | 'previdencia' | 'cripto' | 'outro';
export type InvestmentStatus = 'ativo' | 'encerrado';
export type InvestmentMovementKind = 'aporte' | 'resgate' | 'rendimento' | 'valor';

export const INVESTMENT_KINDS: readonly InvestmentKind[] = ['renda_fixa', 'titulos_publicos', 'acoes', 'fundos', 'previdencia', 'cripto', 'outro'];
export const INVESTMENT_STATUSES: readonly InvestmentStatus[] = ['ativo', 'encerrado'];
export const INVESTMENT_MOVEMENT_KINDS: readonly InvestmentMovementKind[] = ['aporte', 'resgate', 'rendimento', 'valor'];
export const INVESTMENT_NAME_MAX = 40;
export const INVESTMENT_NOTE_MAX = 80;
/** No máximo 50 investimentos ativos no Pessoal (o banco confere). */
export const INVESTMENT_ACTIVE_MAX = 50;

export const INVESTMENT_KIND_LABEL: Readonly<Record<InvestmentKind, string>> = {
  renda_fixa: 'Renda fixa',
  titulos_publicos: 'Títulos públicos',
  acoes: 'Ações',
  fundos: 'Fundos',
  previdencia: 'Previdência',
  cripto: 'Criptoativos',
  outro: 'Outro',
};

export interface Investment {
  id: string;
  contextId: string;
  name: string;
  kind: InvestmentKind;
  status: InvestmentStatus;
  createdBy: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  /** investment_items: totais dos movimentos vivos, sem sinal. */
  depositsCents: Cents;
  withdrawalsCents: Cents;
  incomeCents: Cents;
  /** investment_items: o valor ao fim de hoje (pela regra acima) e a data da última atualização de valor (null sem nenhuma). */
  valueCents: Cents;
  lastValueOn: IsoDate | null;
  /** investment_items: a data do primeiro movimento vivo (null sem movimentos). */
  firstMovementOn: IsoDate | null;
}

export interface InvestmentMovement {
  id: string;
  investmentId: string;
  contextId: string;
  kind: InvestmentMovementKind;
  /** Sempre ≥ 0 (o valor atual pode ser 0); aporte, resgate e rendimento > 0. */
  amountCents: Cents;
  occurredOn: IsoDate;
  note: string | null;
  /** De onde saiu ou para onde foi o dinheiro (aporte e resgate), como nas metas (D-043). */
  accountId: string | null;
  createdBy: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface InvestmentInput {
  name: string;
  kind: InvestmentKind;
}

/** Criar: o nome e o tipo, o aportado até hoje (desde a data informada) e, se a pessoa souber, quanto vale hoje. */
export interface NewInvestmentInput extends InvestmentInput {
  investedCents: Cents;
  startOn: IsoDate;
  currentCents: Cents | null;
}

export interface InvestmentMovementInput {
  amountCents: Cents;
  occurredOn: IsoDate;
  note: string | null;
  accountId?: string | null;
}

export type InvestmentErrorCode =
  | 'nome_invalido'
  | 'tipo_invalido'
  | 'valor_invalido'
  | 'data_invalida'
  | 'data_futura'
  | 'observacao_invalida'
  | 'investimento_encerrado'
  | 'valor_insuficiente'
  | 'limite_de_investimentos'
  | 'contexto_invalido';

type MovementLike = Pick<InvestmentMovement, 'kind' | 'amountCents' | 'occurredOn'>;
type MovementWithId = MovementLike & { id: string };

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

export function normalizeInvestmentName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function investmentInputError(input: InvestmentInput): InvestmentErrorCode | null {
  const name = normalizeInvestmentName(input.name ?? '');
  if (charCount(name) < 1 || charCount(name) > INVESTMENT_NAME_MAX) return 'nome_invalido';
  if (!INVESTMENT_KINDS.includes(input.kind)) return 'tipo_invalido';
  return null;
}

const validAmount = (c: Cents, min: number) => Number.isSafeInteger(c) && c >= min && c <= MAX_RECORD_CENTS;

export function newInvestmentError(input: NewInvestmentInput, today: IsoDate): InvestmentErrorCode | null {
  const base = investmentInputError(input);
  if (base) return base;
  if (!validAmount(input.investedCents, 1)) return 'valor_invalido';
  if (input.currentCents !== null && !validAmount(input.currentCents, 0)) return 'valor_invalido';
  if (!isValidIsoDate(input.startOn)) return 'data_invalida';
  if (input.startOn > today) return 'data_futura';
  return null;
}

export function investmentMovementError(kind: InvestmentMovementKind, input: InvestmentMovementInput, today: IsoDate): InvestmentErrorCode | null {
  if (!INVESTMENT_MOVEMENT_KINDS.includes(kind)) return 'tipo_invalido';
  if (!validAmount(input.amountCents, kind === 'valor' ? 0 : 1)) return 'valor_invalido';
  if (!isValidIsoDate(input.occurredOn)) return 'data_invalida';
  if (input.occurredOn > today) return 'data_futura';
  if (input.note !== null && (charCount(input.note.trim()) < 1 || charCount(input.note.trim()) > INVESTMENT_NOTE_MAX)) return 'observacao_invalida';
  return null;
}

// ---------------------------------------------------------------------------
// Valor, ganho e saldo dia a dia
// ---------------------------------------------------------------------------

const FLOW_SIGN: Readonly<Record<InvestmentMovementKind, number>> = { aporte: 1, resgate: -1, rendimento: 0, valor: 0 };

/** Movimentos em ordem: data; no mesmo dia, aportes e resgates antes da atualização de valor (o valor informado fecha o dia). */
function sorted<M extends MovementLike>(movements: readonly M[]): M[] {
  return [...movements].sort((a, b) => (a.occurredOn < b.occurredOn ? -1 : a.occurredOn > b.occurredOn ? 1 : (a.kind === 'valor' ? 1 : 0) - (b.kind === 'valor' ? 1 : 0)));
}

/** Valor ao fim do dia `date`. Sem movimentos até a data: 0. */
export function investmentValueOn(movements: readonly MovementLike[], date: IsoDate): Cents {
  let value = 0;
  for (const m of sorted(movements)) {
    if (m.occurredOn > date) break;
    value = m.kind === 'valor' ? m.amountCents : value + FLOW_SIGN[m.kind] * m.amountCents;
  }
  return value;
}

/** O primeiro dia em que o valor fica negativo (I1), ou null. */
export function investmentNegativeDay(movements: readonly MovementLike[]): IsoDate | null {
  let value = 0;
  const list = sorted(movements);
  for (let i = 0; i < list.length; i += 1) {
    const m = list[i]!;
    value = m.kind === 'valor' ? m.amountCents : value + FLOW_SIGN[m.kind] * m.amountCents;
    const endOfDay = i === list.length - 1 || list[i + 1]!.occurredOn !== m.occurredOn;
    if (endOfDay && value < 0) return m.occurredOn;
  }
  return null;
}

export type InvestmentMovementChange =
  | { op: 'add'; kind: InvestmentMovementKind; amountCents: Cents; occurredOn: IsoDate }
  | { op: 'update'; id: string; amountCents: Cents; occurredOn: IsoDate }
  | { op: 'delete'; id: string };

/** Movimentos depois da mudança (o tipo de um movimento alterado nunca muda). */
export function applyInvestmentChange(movements: readonly MovementWithId[], change: InvestmentMovementChange | null): MovementLike[] {
  if (!change) return [...movements];
  if (change.op === 'add') return [...movements, { kind: change.kind, amountCents: change.amountCents, occurredOn: change.occurredOn }];
  if (change.op === 'delete') return movements.filter((m) => m.id !== change.id);
  return movements.map((m) => (m.id === change.id ? { ...m, amountCents: change.amountCents, occurredOn: change.occurredOn } : m));
}

export interface InvestmentTotals {
  depositsCents: Cents;
  withdrawalsCents: Cents;
  incomeCents: Cents;
  valueCents: Cents;
  /** valor + resgates + rendimentos − aportes. */
  gainCents: Cents;
  lastValueOn: IsoDate | null;
}

export function investmentTotals(movements: readonly MovementLike[], today: IsoDate): InvestmentTotals {
  const live = movements.filter((m) => m.occurredOn <= today);
  const sum = (k: InvestmentMovementKind) => live.filter((m) => m.kind === k).reduce((a, m) => a + m.amountCents, 0);
  const depositsCents = sum('aporte');
  const withdrawalsCents = sum('resgate');
  const incomeCents = sum('rendimento');
  const valueCents = investmentValueOn(live, today);
  const lastValue = live.filter((m) => m.kind === 'valor').map((m) => m.occurredOn).sort().pop() ?? null;
  return { depositsCents, withdrawalsCents, incomeCents, valueCents, gainCents: valueCents + withdrawalsCents + incomeCents - depositsCents, lastValueOn: lastValue };
}

/** Ganho a partir dos totais de investment_items. */
export function investmentGain(i: Pick<Investment, 'valueCents' | 'depositsCents' | 'withdrawalsCents' | 'incomeCents'>): Cents {
  return i.valueCents + i.withdrawalsCents + i.incomeCents - i.depositsCents;
}

// ---------------------------------------------------------------------------
// Rentabilidade (Dietz modificado, por mês, encadeada)
// ---------------------------------------------------------------------------

export interface MonthReturn {
  month: IsoMonth;
  /** Fração (0,0123 = 1,23%); null quando a base do mês é ≤ 0 (nada investido no mês). */
  rate: number | null;
  /** Valor ao fim do mês (ou de hoje, no mês em andamento). */
  endValueCents: Cents;
  /** O mês ainda não fechou (vai até hoje). */
  partial: boolean;
}

/**
 * Rentabilidade de cada mês, do mês do primeiro movimento até o mês de hoje. `movements` pode ser de um investimento ou de vários
 * juntos (a carteira): o valor da carteira é a soma dos valores de cada um, então passe os movimentos agrupados por investimento.
 */
export function monthlyReturns(groups: readonly (readonly MovementLike[])[], today: IsoDate): MonthReturn[] {
  const all = groups.flat().filter((m) => m.occurredOn <= today);
  if (all.length === 0) return [];
  const first = all.map((m) => m.occurredOn).sort()[0]!;
  const valueOn = (date: IsoDate) => groups.reduce((acc, g) => acc + investmentValueOn(g, date), 0);
  const out: MonthReturn[] = [];
  const last = monthOf(today);
  for (let month = monthOf(first); monthsBetween(month, last) >= 0; month = addMonths(month, 1)) {
    const [y, mo] = month.split('-').map(Number) as [number, number];
    const days = daysInMonth(y, mo);
    const start = `${month}-01` as IsoDate;
    const partial = month === last;
    const end = partial ? today : (`${month}-${String(days).padStart(2, '0')}` as IsoDate);
    const v0 = valueOn(addDays(start, -1));
    const v1 = valueOn(end);
    let flows = 0;
    let weighted = 0;
    let income = 0;
    for (const m of all) {
      if (m.occurredOn < start || m.occurredOn > end) continue;
      if (m.kind === 'rendimento') income += m.amountCents;
      const f = FLOW_SIGN[m.kind] * m.amountCents;
      if (f === 0) continue;
      const day = Number(m.occurredOn.slice(8, 10));
      flows += f;
      weighted += ((days - day) / days) * f;
    }
    const base = v0 + weighted;
    out.push({ month, rate: base > 0 ? (v1 - v0 - flows + income) / base : null, endValueCents: v1, partial });
  }
  return out;
}

/** Encadeia as taxas mensais (as nulas ficam de fora): Π(1 + r) − 1, ou null sem nenhum mês com taxa. */
export function chainRates(rates: readonly (number | null)[]): number | null {
  const valid = rates.filter((r): r is number => r !== null && Number.isFinite(r));
  if (valid.length === 0) return null;
  return valid.reduce((acc, r) => acc * (1 + r), 1) - 1;
}

// ---------------------------------------------------------------------------
// CDI e IPCA (séries mensais do Banco Central)
// ---------------------------------------------------------------------------

/** Séries mensais, em % ao mês (0,93 = 0,93%), por mês. `example`: valores de exemplo da demonstração, nunca os índices reais. */
export interface MarketIndices {
  cdi: Readonly<Record<IsoMonth, number>>;
  ipca: Readonly<Record<IsoMonth, number>>;
  fetchedOn: IsoDate | null;
  example: boolean;
}

/** Códigos do Sistema Gerenciador de Séries do Banco Central: CDI acumulado no mês (4391) e IPCA, variação mensal (433). */
export const BCB_SERIES = { cdi: 4391, ipca: 433 } as const;

/**
 * Lê a resposta da API de séries do Banco Central ([{ "data": "01/10/2026", "valor": "0,93" }]): só linhas com data dd/mm/aaaa no
 * dia 1 e valor numérico (vírgula ou ponto), entre −10% e 10% ao mês. O resto é ignorado (nunca um índice inventado).
 */
export function parseBcbSeries(json: unknown): Record<IsoMonth, number> {
  const out: Record<IsoMonth, number> = {};
  if (!Array.isArray(json)) return out;
  for (const row of json) {
    if (typeof row !== 'object' || row === null) continue;
    const r = row as { data?: unknown; valor?: unknown };
    if (typeof r.data !== 'string' || (typeof r.valor !== 'string' && typeof r.valor !== 'number')) continue;
    const date = parseDateBR(r.data);
    if (!date || !date.endsWith('-01')) continue;
    const value = typeof r.valor === 'number' ? r.valor : Number(r.valor.replace(',', '.'));
    if (!Number.isFinite(value) || value < -10 || value > 10) continue;
    out[monthOf(date)] = value;
  }
  return out;
}

/** O endereço da série no Banco Central, de `from` a `to` (dd/mm/aaaa). */
export function bcbSeriesUrl(code: number, from: IsoDate, to: IsoDate): string {
  return `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=${formatDateBR(from)}&dataFinal=${formatDateBR(to)}`;
}

/** Índice acumulado nos meses pedidos (fração), ou null se faltar algum mês na série. */
export function indexOverMonths(series: Readonly<Record<IsoMonth, number>>, months: readonly IsoMonth[]): number | null {
  if (months.length === 0) return null;
  let acc = 1;
  for (const m of months) {
    const v = series[m];
    if (v === undefined) return null;
    acc *= 1 + v / 100;
  }
  return acc - 1;
}

/** Valores de exemplo da demonstração (não são os índices reais): CDI de 0,90% e IPCA de 0,35% ao mês, de 2024 a 2027. */
export function exampleIndices(): MarketIndices {
  const cdi: Record<IsoMonth, number> = {};
  const ipca: Record<IsoMonth, number> = {};
  for (let m: IsoMonth = '2024-01'; monthsBetween(m, '2027-12') >= 0; m = addMonths(m, 1)) {
    cdi[m] = 0.9;
    ipca[m] = 0.35;
  }
  return { cdi, ipca, fetchedOn: null, example: true };
}

// ---------------------------------------------------------------------------
// Resumo de um período (para as telas)
// ---------------------------------------------------------------------------

export interface PeriodComparison {
  /** Meses fechados comparados (os 12 mais recentes, ou desde o primeiro movimento). */
  months: IsoMonth[];
  rate: number | null;
  cdi: number | null;
  ipca: number | null;
}

/**
 * Comparação nos meses fechados (o mês de hoje fica de fora: o IPCA do mês só sai no mês seguinte): os até 12 mais recentes com taxa.
 * Sem mês fechado com taxa, null.
 */
export function compareLastClosedMonths(returns: readonly MonthReturn[], indices: MarketIndices | null, max = 12): PeriodComparison | null {
  const closed = returns.filter((r) => !r.partial && r.rate !== null);
  if (closed.length === 0) return null;
  const chosen = closed.slice(-max);
  const months = chosen.map((r) => r.month);
  return {
    months,
    rate: chainRates(chosen.map((r) => r.rate)),
    cdi: indices ? indexOverMonths(indices.cdi, months) : null,
    ipca: indices ? indexOverMonths(indices.ipca, months) : null,
  };
}

// ---------------------------------------------------------------------------
// Rascunhos dos formulários
// ---------------------------------------------------------------------------

export interface InvestmentDraft {
  name: string;
  kind: InvestmentKind | null;
  investedText: string;
  currentText: string;
  startText: string;
}
export type InvestmentField = 'name' | 'kind' | 'investedText' | 'currentText' | 'startText';
export const INVESTMENT_FIELD_ORDER: InvestmentField[] = ['name', 'kind', 'investedText', 'currentText', 'startText'];

export function validateInvestmentDraft(
  draft: InvestmentDraft,
  today: IsoDate,
  mode: 'criar' | 'editar',
): { ok: true; input: NewInvestmentInput } | { ok: false; errors: Partial<Record<InvestmentField, string>> } {
  const T = INVESTMENT_TEXT.errors;
  const errors: Partial<Record<InvestmentField, string>> = {};
  const name = normalizeInvestmentName(draft.name);
  if (charCount(name) < 1) errors.name = T.nameEmpty;
  else if (charCount(name) > INVESTMENT_NAME_MAX) errors.name = T.nameLong;
  if (draft.kind === null || !INVESTMENT_KINDS.includes(draft.kind)) errors.kind = T.kind;
  let investedCents = 0;
  let currentCents: Cents | null = null;
  let startOn: IsoDate = today;
  if (mode === 'criar') {
    const invested = parseBRL(draft.investedText);
    if (invested === null || invested < 1 || invested > MAX_RECORD_CENTS) errors.investedText = draft.investedText.trim() === '' ? T.investedEmpty : T.amount;
    else investedCents = invested;
    if (draft.currentText.trim() !== '') {
      const current = parseBRL(draft.currentText);
      if (current === null || current < 0 || current > MAX_RECORD_CENTS) errors.currentText = T.amount;
      else currentCents = current;
    }
    if (draft.startText.trim() !== '') {
      const d = parseDateBR(draft.startText);
      if (!d) errors.startText = T.date;
      else if (d > today) errors.startText = T.future;
      else startOn = d;
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, input: { name, kind: draft.kind!, investedCents, startOn, currentCents } };
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

const pctText = (fraction: number) => {
  const v = Math.round(fraction * 10000) / 100;
  const s = Math.abs(v).toFixed(2).replace('.', ',');
  return `${v < 0 ? '-' : v > 0 ? '+' : ''}${s}%`;
};

export const INVESTMENT_TEXT = {
  tabTitle: 'Investimentos',
  tabLabel: 'Investir',
  intro: 'Acompanhe o que você já investe: registre aportes, resgates e o valor que aparece no seu extrato. A Clarevo calcula quanto rendeu.',
  totalTitle: 'Seus investimentos hoje',
  /** "R$ 12.345,67" */
  value: (c: Cents) => formatBRL(c),
  invested: (c: Cents) => `Aportado: ${formatBRL(c)}`,
  withdrawn: (c: Cents) => `Resgatado: ${formatBRL(c)}`,
  income: (c: Cents) => `Rendimentos recebidos: ${formatBRL(c)}`,
  /** "Ganho: R$ 345,67" ou "Perda: R$ 12,00" (sem cor de julgamento). */
  gain: (c: Cents) => (c < 0 ? `Perda: ${formatBRL(-c)}` : `Ganho: ${formatBRL(c)}`),
  percent: pctText,
  /** "Nos últimos 12 meses fechados (novembro de 2025 a outubro de 2026): +8,12%. CDI: +10,50%. IPCA: +4,10%." */
  comparison: (c: PeriodComparison) => {
    const span = c.months.length === 1 ? formatMonthYearBR(c.months[0]!) : `${formatMonthYearBR(c.months[0]!)} a ${formatMonthYearBR(c.months[c.months.length - 1]!)}`;
    const head = c.months.length === 1 ? `No mês fechado de ${span}` : `Nos ${c.months.length} meses fechados (${span})`;
    return `${head}: ${c.rate === null ? 'sem taxa' : pctText(c.rate)}.`;
  },
  cdi: (v: number | null) => (v === null ? 'CDI: sem dados para todos os meses' : `CDI no mesmo período: ${pctText(v)}`),
  ipca: (v: number | null) => (v === null ? 'IPCA: sem dados para todos os meses' : `IPCA no mesmo período: ${pctText(v)}`),
  thisMonth: (rate: number | null) => (rate === null ? 'Neste mês: sem taxa ainda' : `Neste mês, até hoje: ${pctText(rate)}`),
  sinceStart: (rate: number | null, from: IsoMonth) => (rate === null ? null : `Desde ${formatMonthYearBR(from)}: ${pctText(rate)}`),
  noValueYet: 'Atualize o valor com o que aparece no seu extrato para ver quanto rendeu.',
  lastValue: (d: IsoDate) => `Valor atualizado em ${formatDateBR(d)}`,
  indicesSource: (fetchedOn: IsoDate | null) =>
    `Fonte do CDI e do IPCA: Banco Central do Brasil, séries ${BCB_SERIES.cdi} e ${BCB_SERIES.ipca}${fetchedOn ? `, consulta em ${formatDateBR(fetchedOn)}` : ''}.`,
  indicesExample: 'Na demonstração, o CDI e o IPCA são valores de exemplo, não os índices reais.',
  indicesError: 'Não foi possível buscar o CDI e o IPCA agora. A sua rentabilidade continua aqui.',
  disclaimer:
    'A rentabilidade é calculada com os valores que você registra, como estão no seu extrato. Não é recomendação de investimento, e o que rendeu no passado não garante o futuro.',
  rule: 'Aportes, resgates e rendimentos não entram em Pago nem em Recebido: o dinheiro continua seu, só mudou de lugar.',
  footer: 'A Clarevo não guarda, não movimenta nem indica investimentos. Os valores mostram só o que você registrou.',
  emptyTitle: 'Nenhum investimento ainda',
  emptyBody: 'Cadastre o que você já tem investido, com quanto aplicou e quanto vale hoje. Dá para atualizar o valor quando quiser.',
  newInvestment: 'Novo investimento',
  closedTitle: 'Encerrados',
  whoSees: 'Seus investimentos ficam só no seu Pessoal. Ninguém da Família nem a empresa que oferece o benefício vê.',
  form: {
    newTitle: 'Novo investimento',
    editTitle: 'Editar investimento',
    nameLabel: 'Nome',
    nameHint: 'Um nome curto que você reconheça, como Reserva no banco ou Ações.',
    kindLabel: 'Tipo',
    investedLabel: 'Quanto você aplicou até hoje?',
    investedHint: 'A soma do que você colocou, sem os rendimentos.',
    currentLabel: 'Quanto vale hoje? (opcional)',
    currentHint: 'O valor que aparece no extrato. Sem ele, a Clarevo usa o valor aplicado.',
    startLabel: 'Desde quando? (opcional)',
    startHint: 'A data da primeira aplicação. Sem ela, hoje.',
    create: 'Criar investimento',
    save: 'Salvar investimento',
    created: 'Investimento criado.',
    saved: 'Investimento salvo.',
  },
  detail: {
    addDeposit: 'Registrar aporte',
    addWithdrawal: 'Registrar resgate',
    addIncome: 'Registrar rendimento recebido',
    updateValue: 'Atualizar valor',
    edit: 'Editar',
    close: 'Encerrar investimento',
    reopen: 'Reabrir investimento',
    delete: 'Excluir investimento',
    deleteTitle: (name: string) => `Excluir ${name}?`,
    deleteBody: 'Os movimentos registrados nele também deixam de aparecer.',
    deleteConfirm: 'Excluir investimento',
    cancel: 'Cancelar',
    closed: 'Investimento encerrado.',
    reopened: 'Investimento reaberto.',
    deleted: 'Investimento excluído.',
    historyTitle: 'Histórico',
    historyEmpty: 'Nenhum movimento registrado.',
    monthsTitle: 'Valor no fim de cada mês',
  },
  movement: {
    aporte: { title: 'Registrar aporte', saved: 'Aporte registrado.', hint: 'O dinheiro que você colocou no investimento.' },
    resgate: { title: 'Registrar resgate', saved: 'Resgate registrado.', hint: 'O dinheiro que você tirou do investimento.' },
    rendimento: {
      title: 'Registrar rendimento recebido',
      saved: 'Rendimento registrado.',
      hint: 'O que o investimento pagou e caiu na sua conta, como dividendos ou juros pagos. O que fica no investimento entra ao atualizar o valor.',
    },
    valor: { title: 'Atualizar valor', saved: 'Valor atualizado.', hint: 'O valor total que aparece no extrato nesta data, já com os aportes e resgates do dia.' },
    amountLabel: 'Valor',
    valueLabel: 'Valor no extrato',
    dateLabel: 'Data',
    noteLabel: 'Observação (opcional)',
    save: 'Salvar',
    updated: 'Movimento salvo.',
    deleted: 'Movimento excluído.',
    delete: 'Excluir movimento',
  },
  movementLabel: { aporte: 'Aporte', resgate: 'Resgate', rendimento: 'Rendimento recebido', valor: 'Valor atualizado' } as Readonly<Record<InvestmentMovementKind, string>>,
  errors: {
    nameEmpty: 'Informe um nome.',
    nameLong: `Use até ${INVESTMENT_NAME_MAX} caracteres.`,
    kind: 'Escolha o tipo.',
    investedEmpty: 'Informe quanto você aplicou.',
    amount: 'Informe um valor válido.',
    date: 'Informe uma data válida, como 15/03/2025.',
    future: 'A data não pode ser depois de hoje.',
    negative: (d: IsoDate) => `Com este movimento, o investimento ficaria com valor negativo em ${formatDateBR(d)}. Confira o valor e a data.`,
    closed: 'O investimento está encerrado. Reabra para registrar.',
    limit: `Você chegou a ${INVESTMENT_ACTIVE_MAX} investimentos ativos. Encerre um para criar outro.`,
    personalOnly: 'Investimentos ficam só no seu Pessoal.',
    save: 'Não foi possível salvar. Tente de novo.',
    notFound: 'Este investimento não existe mais.',
  },
} as const;

/** Texto do erro de investimentos (código do banco ou da validação). */
export function investmentErrorText(code: string, negativeDay: IsoDate | null = null): string {
  const E = INVESTMENT_TEXT.errors;
  switch (code) {
    case 'nome_invalido':
      return E.nameEmpty;
    case 'tipo_invalido':
      return E.kind;
    case 'valor_invalido':
      return E.amount;
    case 'data_invalida':
      return E.date;
    case 'data_futura':
      return E.future;
    case 'investimento_encerrado':
      return E.closed;
    case 'valor_insuficiente':
      return negativeDay ? E.negative(negativeDay) : E.save;
    case 'limite_de_investimentos':
      return E.limit;
    case 'contexto_invalido':
      return E.personalOnly;
    case 'nao_encontrado':
      return E.notFound;
    default:
      return E.save;
  }
}
