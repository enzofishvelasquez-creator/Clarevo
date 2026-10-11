import { ACCOUNTS_TEXT, activeAccounts, hasAccountChoice } from './accounts';
import type { IsoDate, IsoMonth } from './dates';
import { addMonths, formatDateBR, monthOf } from './dates';
import type { Cents } from './money';
import { MAX_RECORD_CENTS, formatBRL, parseBRL, roundDiv } from './money';
import type { CardEntry, FinancialAccount, FinancialRecord, RecordKind } from './records';
import { CATEGORIES, NO_CATEGORY_LABEL } from './records';

/**
 * Buscar em Movimentações (D-045, Ciclo H1; docs/08 §5 item 5). Responde "quanto paguei de luz?" e acha um lançamento antigo em
 * todos os meses. Regras puras: nada aqui grava, e o app não registra buscas (como Aprender).
 *
 * O servidor filtra por período, tipo, categoria, conta e valor e devolve até `SEARCH_LIMIT` linhas, das mais recentes; o texto da
 * descrição é filtrado no aparelho, sem diferenciar maiúsculas nem acentos (normalização NFD). Sem migração: a leitura é a mesma
 * que a RLS já permite. Compras no cartão ficam num grupo à parte e nunca entram na soma de Pago (só o pagamento da fatura é gasto).
 */

/** Linhas que o servidor devolve por busca (registros e, em separado, compras no cartão). Passou disso, a busca avisa. */
export const SEARCH_LIMIT = 1000;
/** Tamanho máximo do texto buscado. */
export const SEARCH_TEXT_MAX = 80;
/** Linhas mostradas de cada vez na tela; "Mostrar mais" traz as próximas (a soma sempre vale para todas as achadas). */
export const SEARCH_PAGE = 100;

export type SearchKind = 'todos' | RecordKind;
export const SEARCH_KINDS: readonly SearchKind[] = ['todos', 'despesa', 'receita'];

/** Últimos 3, 6 ou 12 meses (o mês de hoje e os anteriores, inteiros), este ano, o ano passado ou tudo. */
export type SearchPeriod = '3m' | '6m' | '12m' | 'ano' | 'ano_passado' | 'tudo';
export const SEARCH_PERIODS: readonly SearchPeriod[] = ['3m', '6m', '12m', 'ano', 'ano_passado', 'tudo'];
export const DEFAULT_SEARCH_PERIOD: SearchPeriod = '12m';

/** A busca como a pessoa a montou (valores já lidos). */
export interface SearchParams {
  text: string;
  kind: SearchKind;
  period: SearchPeriod;
  /** Uma categoria do app, `NO_CATEGORY_LABEL` para os sem categoria, ou null para qualquer. */
  category: string | null;
  accountId: string | null;
  minCents: Cents | null;
  maxCents: Cents | null;
}

export const DEFAULT_SEARCH: SearchParams = {
  text: '',
  kind: 'todos',
  period: DEFAULT_SEARCH_PERIOD,
  category: null,
  accountId: null,
  minCents: null,
  maxCents: null,
};

/**
 * O que o servidor filtra (financial_records e card_entry_items). `from` e `to` incluem o dia; `category` igual a
 * `NO_CATEGORY_LABEL` pede os sem categoria; valores em centavos incluem os limites.
 */
export interface RecordSearchFilter {
  from: IsoDate | null;
  to: IsoDate | null;
  kind: RecordKind | null;
  category: string | null;
  accountId: string | null;
  minCents: Cents | null;
  maxCents: Cents | null;
}

/** Resposta de uma busca no servidor: as mais recentes (até `SEARCH_LIMIT`) e se havia mais. */
export interface SearchPage<T> {
  items: T[];
  truncated: boolean;
}

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

export const SEARCH_TEXT = {
  /** Entrada em Movimentações. */
  entry: 'Buscar',
  entryHint: 'Gastos e recebimentos de todos os meses',
  entryA11y: 'Buscar. Abre a busca em todos os meses.',
  /** Tela. */
  title: 'Buscar',
  intro: 'Procure um gasto ou um recebimento em todos os meses. Nada do que você busca é guardado.',
  textLabel: 'O que você procura',
  textHint: 'Por exemplo: luz, mercado ou farmácia. Não precisa de acento.',
  clearText: 'Limpar texto',
  kindLabel: 'Tipo',
  kinds: { todos: 'Todos', despesa: 'Gastos', receita: 'Recebimentos' } as Readonly<Record<SearchKind, string>>,
  periodLabel: 'Período',
  periods: {
    '3m': 'Últimos 3 meses',
    '6m': 'Últimos 6 meses',
    '12m': 'Últimos 12 meses',
    ano: 'Este ano',
    ano_passado: 'Ano passado',
    tudo: 'Tudo',
  } as Readonly<Record<SearchPeriod, string>>,
  moreFilters: (active: number): string => (active > 0 ? `Mais filtros (${active})` : 'Mais filtros'),
  lessFilters: 'Menos filtros',
  categoryLabel: 'Categoria',
  categoryAll: 'Todas',
  accountLabel: 'Conta',
  accountAll: 'Todas',
  minLabel: 'Valor de',
  maxLabel: 'Valor até',
  amountPrefix: 'R$',
  amountHint: 'Opcional. Deixe em branco para qualquer valor.',
  amountInvalid: 'Confira o valor informado, como 80,00.',
  amountOrder: 'O valor final não pode ser menor que o inicial.',
  clearSearch: 'Limpar busca',
  /** Resultado. */
  loading: 'Buscando nos seus registros',
  loadFailed: 'Não foi possível buscar. Tente novamente.',
  emptyTitle: 'Nada encontrado',
  emptyBody: 'Nenhum registro combina com esta busca. Mude o texto, o período ou os filtros.',
  noRecords: 'Nenhum gasto ou recebimento combina com esta busca.',
  truncated: 'Mostrando os 1.000 mais recentes; refine a busca.',
  shownOf: (shown: number, total: number): string => `Mostrando ${shown} de ${total}`,
  showMore: (next: number): string => `Mostrar mais ${next}`,
  expenses: (count: number, cents: Cents): string => `${count === 1 ? '1 gasto' : `${count} gastos`} · ${formatBRL(cents)} no período`,
  incomes: (count: number, cents: Cents): string => `${count === 1 ? '1 recebimento' : `${count} recebimentos`} · ${formatBRL(cents)} no período`,
  average: (cents: Cents): string => `média de ${formatBRL(cents)} por mês com gasto`,
  /** Aviso sob o resumo quando há compras no cartão na busca: elas não entram na soma de gastos. */
  summaryCardsNote: 'Os gastos acima não incluem as compras no cartão, listadas à parte.',
  /** Registros que o pagamento da fatura criou (um gasto só, na data do pagamento). */
  invoiceNote: 'O pagamento de uma fatura aparece como um gasto só, na data do pagamento. As compras ficam em Compras no cartão.',
  /** Compras no cartão. */
  cardsTitle: 'Compras no cartão',
  cardsNote: 'O dinheiro só sai quando a fatura é paga. Por isso estas compras não estão somadas em Pago: o pagamento da fatura aparece na lista acima, uma vez só.',
  cardsSummary: (count: number, cents: Cents): string => `${count === 1 ? '1 compra' : `${count} compras`} · ${formatBRL(cents)} no total das compras`,
  cardsHiddenByAccount: 'Compras no cartão não têm conta de origem: a conta vem do pagamento da fatura. Limpe o filtro de conta para vê-las.',
  cardsLoadFailed: 'Não foi possível carregar as compras no cartão. Tente novamente.',
  retry: 'Tentar de novo',
  purchaseCaption: (purchasedOn: IsoDate, cardName: string | null, installments: number): string =>
    ['Compra', formatDateBR(purchasedOn), cardName, installments === 1 ? 'à vista' : `em ${installments} vezes`].filter(Boolean).join(' · '),
  purchaseA11y: (description: string, caption: string, value: string): string => `${description}, ${caption}, ${value}. Abre a fatura.`,
} as const;

// ---------------------------------------------------------------------------
// Normalização e texto buscado
// ---------------------------------------------------------------------------

/** Minúsculas, sem acentos (NFD sem as marcas) e com os espaços aparados e juntos: "  Conta de LUZ " → "conta de luz". */
export function normalizeSearchText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** As palavras buscadas (normalizadas, até `SEARCH_TEXT_MAX` caracteres); vazio quando não há texto. */
export function searchTerms(query: string): string[] {
  const normalized = normalizeSearchText(query.slice(0, SEARCH_TEXT_MAX));
  return normalized === '' ? [] : normalized.split(' ');
}

/** A descrição tem todas as palavras buscadas, em qualquer ordem e em qualquer parte? Sem texto buscado, tudo combina. */
export function textMatchesSearch(description: string, query: string): boolean {
  const terms = searchTerms(query);
  if (terms.length === 0) return true;
  const haystack = normalizeSearchText(description);
  return terms.every((t) => haystack.includes(t));
}

// ---------------------------------------------------------------------------
// Período, filtro do servidor e conferência
// ---------------------------------------------------------------------------

/** Primeiro e último dia do período (null = sem limite). Os últimos N meses incluem o mês de hoje e os N-1 anteriores, inteiros. */
export function searchRange(period: SearchPeriod, today: IsoDate): { from: IsoDate | null; to: IsoDate | null } {
  const year = Number(today.slice(0, 4));
  switch (period) {
    case '3m':
    case '6m':
    case '12m': {
      const months = Number(period.slice(0, -1));
      return { from: `${addMonths(monthOf(today), -(months - 1))}-01`, to: null };
    }
    case 'ano':
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    case 'ano_passado':
      return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
    case 'tudo':
      return { from: null, to: null };
  }
}

/** O que o servidor recebe para esta busca (o texto não vai: é filtrado no aparelho). */
export function searchFilterOf(params: SearchParams, today: IsoDate): RecordSearchFilter {
  const { from, to } = searchRange(params.period, today);
  return {
    from,
    to,
    kind: params.kind === 'todos' ? null : params.kind,
    category: params.category,
    accountId: params.accountId,
    minCents: params.minCents,
    maxCents: params.maxCents,
  };
}

const categoryMatches = (category: string | null, wanted: string | null): boolean =>
  wanted === null ? true : wanted === NO_CATEGORY_LABEL ? category === null : category === wanted;

const amountMatches = (cents: Cents, filter: Pick<RecordSearchFilter, 'minCents' | 'maxCents'>): boolean =>
  (filter.minCents === null || cents >= filter.minCents) && (filter.maxCents === null || cents <= filter.maxCents);

const dateMatches = (date: IsoDate, filter: Pick<RecordSearchFilter, 'from' | 'to'>): boolean =>
  (filter.from === null || date >= filter.from) && (filter.to === null || date <= filter.to);

/** O registro passa pelo filtro do servidor? É a regra do SQL da busca, repetida aqui para a memória e para conferir. */
export function recordMatchesFilter(record: FinancialRecord, filter: RecordSearchFilter): boolean {
  return (
    dateMatches(record.occurredOn, filter) &&
    (filter.kind === null || record.kind === filter.kind) &&
    categoryMatches(record.category, filter.category) &&
    (filter.accountId === null || record.accountId === filter.accountId) &&
    amountMatches(record.amountCents, filter)
  );
}

/**
 * A compra no cartão passa pelo filtro do servidor? Pela data da compra e pelo valor total. Recebimento e conta de origem não se
 * aplicam a compras no cartão: com um deles no filtro, nenhuma compra combina (use `includesCardPurchases`).
 */
export function purchaseMatchesFilter(entry: CardEntry, filter: RecordSearchFilter): boolean {
  return (
    entry.kind === 'compra' &&
    entry.purchasedOn !== null &&
    filter.kind !== 'receita' &&
    filter.accountId === null &&
    dateMatches(entry.purchasedOn, filter) &&
    categoryMatches(entry.category, filter.category) &&
    amountMatches(entry.amountCents, filter)
  );
}

/** A busca olha as compras no cartão? Não, quando pede só recebimentos ou uma conta de origem (compra não tem conta até a fatura ser paga). */
export function includesCardPurchases(params: Pick<SearchParams, 'kind' | 'accountId'>): boolean {
  return params.kind !== 'receita' && params.accountId === null;
}

/** Do mais recente ao mais antigo: data, depois criação, depois id. */
export function compareNewestRecord(a: FinancialRecord, b: FinancialRecord): number {
  return b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
}

export function compareNewestPurchase(a: CardEntry, b: CardEntry): number {
  return (b.purchasedOn ?? '').localeCompare(a.purchasedOn ?? '') || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
}

/** Resultado final no aparelho: o que o servidor devolveu, repassado pelo filtro, com o texto aplicado e do mais recente ao mais antigo. */
export function searchResultRecords(records: readonly FinancialRecord[], params: SearchParams, today: IsoDate): FinancialRecord[] {
  const filter = searchFilterOf(params, today);
  return records.filter((r) => recordMatchesFilter(r, filter) && textMatchesSearch(r.description, params.text)).sort(compareNewestRecord);
}

export function searchResultPurchases(entries: readonly CardEntry[], params: SearchParams, today: IsoDate): CardEntry[] {
  const filter = searchFilterOf(params, today);
  return entries.filter((e) => purchaseMatchesFilter(e, filter) && textMatchesSearch(e.description ?? '', params.text)).sort(compareNewestPurchase);
}

// ---------------------------------------------------------------------------
// Resumo e agrupamento
// ---------------------------------------------------------------------------

export interface SearchTotals {
  count: number;
  cents: Cents;
  /** Meses diferentes com ao menos um registro. */
  months: number;
}

export interface SearchSummary {
  paid: SearchTotals;
  received: SearchTotals;
  /** Média por mês com gasto (centavos, metade para cima); null sem gastos. */
  averagePaidCents: Cents | null;
}

function totalsOf(records: readonly FinancialRecord[]): SearchTotals {
  return {
    count: records.length,
    cents: records.reduce((acc, r) => acc + r.amountCents, 0),
    months: new Set(records.map((r) => monthOf(r.occurredOn))).size,
  };
}

/**
 * Soma dos registros achados: gastos (Pago) e recebimentos (Recebido), e a média de gasto por mês que teve gasto. Só registros
 * realizados: o pagamento de uma fatura é um gasto (na data do pagamento) e as compras no cartão não entram.
 */
export function summarizeSearch(records: readonly FinancialRecord[]): SearchSummary {
  const paid = totalsOf(records.filter((r) => r.kind === 'despesa'));
  const received = totalsOf(records.filter((r) => r.kind === 'receita'));
  return { paid, received, averagePaidCents: paid.months > 0 ? roundDiv(paid.cents, paid.months) : null };
}

export interface PurchasesSummary {
  count: number;
  totalCents: Cents;
}

/** Compras no cartão achadas: quantas e o total das compras (o valor cheio, não a parcela de cada mês). */
export function summarizePurchases(entries: readonly CardEntry[]): PurchasesSummary {
  return { count: entries.length, totalCents: entries.reduce((acc, e) => acc + e.amountCents, 0) };
}

/** As linhas do resumo, na ordem em que aparecem: gastos, média, recebimentos. Vazio quando não há nada. */
export function searchSummaryLines(summary: SearchSummary): string[] {
  const lines: string[] = [];
  if (summary.paid.count > 0) {
    lines.push(SEARCH_TEXT.expenses(summary.paid.count, summary.paid.cents));
    if (summary.averagePaidCents !== null) lines.push(SEARCH_TEXT.average(summary.averagePaidCents));
  }
  if (summary.received.count > 0) lines.push(SEARCH_TEXT.incomes(summary.received.count, summary.received.cents));
  return lines;
}

export interface SearchMonthGroup<T> {
  month: IsoMonth;
  items: T[];
}

/** Agrupa por mês na ordem recebida (do mais recente ao mais antigo): os itens de um mês ficam juntos, e cada mês aparece uma vez. */
export function groupByMonth<T>(items: readonly T[], dateOf: (item: T) => IsoDate): SearchMonthGroup<T>[] {
  const groups: SearchMonthGroup<T>[] = [];
  for (const item of items) {
    const month = monthOf(dateOf(item));
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.items.push(item);
    else groups.push({ month, items: [item] });
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Opções e rascunho
// ---------------------------------------------------------------------------

/** Categorias oferecidas para o tipo escolhido, mais "Sem categoria" no fim. */
export function searchCategoryOptions(kind: SearchKind): string[] {
  const list = kind === 'todos' ? [...CATEGORIES.despesa, ...CATEGORIES.receita] : [...CATEGORIES[kind]];
  return [...list, NO_CATEGORY_LABEL];
}

/** A categoria escolhida vale para o tipo? Se não (por exemplo, "Salário" depois de passar para Gastos), a busca a ignora. */
export function effectiveSearchCategory(kind: SearchKind, category: string | null): string | null {
  return category !== null && searchCategoryOptions(kind).includes(category) ? category : null;
}

export interface SearchAccountOption {
  /** Nulo = "Todas". */
  id: string | null;
  label: string;
}

/**
 * Chips de conta da busca: "Todas" e cada conta (as ativas, a principal primeiro, e as arquivadas, que podem ter registros
 * antigos), só quando há 2 ou mais contas ativas (D-043).
 */
export function searchAccountOptions(accounts: readonly FinancialAccount[]): SearchAccountOption[] {
  if (!hasAccountChoice(accounts)) return [];
  const archived = accounts.filter((a) => a.status === 'arquivada');
  return [
    { id: null, label: SEARCH_TEXT.accountAll },
    ...activeAccounts(accounts).map((a) => ({ id: a.id, label: a.name })),
    ...archived.map((a) => ({ id: a.id, label: ACCOUNTS_TEXT.archivedName(a.name) })),
  ];
}

/** O que a pessoa digitou e escolheu, antes de ler os valores. */
export interface SearchDraft {
  text: string;
  kind: SearchKind;
  period: SearchPeriod;
  category: string | null;
  accountId: string | null;
  /** Valor inicial e final como digitados ("80,00"); vazio = qualquer. */
  min: string;
  max: string;
}

export const DEFAULT_SEARCH_DRAFT: SearchDraft = { text: '', kind: 'todos', period: DEFAULT_SEARCH_PERIOD, category: null, accountId: null, min: '', max: '' };

export interface SearchFieldErrors {
  min?: string;
  max?: string;
}

function readAmount(text: string): { cents: Cents | null; error: boolean } {
  if (text.trim() === '') return { cents: null, error: false };
  const cents = parseBRL(text);
  return cents === null || cents > MAX_RECORD_CENTS ? { cents: null, error: true } : { cents, error: false };
}

/**
 * Lê o rascunho: o texto, o tipo e o período valem como estão; a categoria que não serve ao tipo cai; os valores precisam ser
 * reais válidos (até R$ 9.999.999,99) e o final não pode ser menor que o inicial. Com erro, não há busca: os textos dizem o que
 * corrigir.
 */
export function searchFromDraft(draft: SearchDraft): { ok: true; params: SearchParams } | { ok: false; errors: SearchFieldErrors } {
  const min = readAmount(draft.min);
  const max = readAmount(draft.max);
  const errors: SearchFieldErrors = {};
  if (min.error) errors.min = SEARCH_TEXT.amountInvalid;
  if (max.error) errors.max = SEARCH_TEXT.amountInvalid;
  if (!errors.min && !errors.max && min.cents !== null && max.cents !== null && max.cents < min.cents) errors.max = SEARCH_TEXT.amountOrder;
  if (errors.min || errors.max) return { ok: false, errors };
  return {
    ok: true,
    params: {
      text: draft.text.slice(0, SEARCH_TEXT_MAX),
      kind: draft.kind,
      period: draft.period,
      category: effectiveSearchCategory(draft.kind, draft.category),
      accountId: draft.accountId,
      minCents: min.cents,
      maxCents: max.cents,
    },
  };
}

/** Filtros dentro de "Mais filtros" que estão ligados (categoria, conta, valor inicial, valor final). */
export function moreFiltersActive(draft: Pick<SearchDraft, 'kind' | 'category' | 'accountId' | 'min' | 'max'>): number {
  return (
    (effectiveSearchCategory(draft.kind, draft.category) !== null ? 1 : 0) +
    (draft.accountId !== null ? 1 : 0) +
    (draft.min.trim() !== '' ? 1 : 0) +
    (draft.max.trim() !== '' ? 1 : 0)
  );
}

/** A busca está como no começo (nada digitado, nada escolhido)? */
export function isDefaultDraft(draft: SearchDraft): boolean {
  return (
    draft.text.trim() === '' &&
    draft.kind === DEFAULT_SEARCH_DRAFT.kind &&
    draft.period === DEFAULT_SEARCH_DRAFT.period &&
    moreFiltersActive(draft) === 0
  );
}
