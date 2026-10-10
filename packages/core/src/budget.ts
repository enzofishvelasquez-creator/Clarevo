import type { CardEntry } from './records';
import { installmentAmounts } from './cards';
import type { IsoDate, IsoMonth } from './dates';
import { addMonths, formatMonthName, formatMonthYearBR, isValidIsoMonth, monthOf, monthsBetween } from './dates';
import { formatInteger } from './learn/format';
import { percentTenths } from './learn/math';
import type { Cents } from './money';
import { MAX_RECORD_CENTS, formatBRL, parseBRL } from './money';
import type { FinancialRecord } from './records';
import { CATEGORIES } from './records';
import { ERROR_TEXT } from './validation';
import { formatPermille } from './committed';

/**
 * Orçamento por categoria e limite pessoal de comprometimento (D-041, Ciclo F2), no contexto Pessoal. Regras puras,
 * repetidas no banco por month_budget (usado no mês) e pelas funções set_category_budget, delete_category_budget,
 * set_commitment_limit e delete_commitment_limit.
 *
 * Orçamento: valor mensal em centavos (R$ 1,00 a R$ 9.999.999,99) por categoria de despesa, com vigência "a partir de" um mês
 * (vale a linha mais recente com início até o mês mostrado). Uma linha sem valor (null) encerra a vigência: "Tirar o orçamento
 * a partir de novembro". "Sem categoria" não tem orçamento.
 *
 * Usado no mês (competência), por categoria:
 *  + gastos (despesas) com a categoria e data no mês, menos os pagamentos de fatura (só a quitação de compras já contadas);
 *  + compras no cartão: a parcela k conta no mês da compra mais (k − 1) meses, na categoria da compra (a parcela 1 cai no
 *    mês da data da compra, não no mês da fatura);
 *  − estornos de cartão informados com categoria, no mês da fatura em que foram informados (o estorno não tem data própria);
 *  nunca abaixo de zero por categoria. Encargos, saldo anterior e crédito levado não têm categoria e ficam fora. Movimentos de
 *  metas e recebimentos nunca contam.
 *
 * Limite pessoal: de 10% a 100% da renda de referência, em pontos inteiros, com vigência "a partir de" um mês. É escolha da
 * pessoa e nunca vem preenchido. A referência de 30% com dívidas (D-026(5)) continua só na linha de dívidas.
 *
 * Sem cor que julgue, sem nota e sem julgamento: os textos são neutros (ver BUDGET_TEXT e LIMIT_TEXT e os testes de textos).
 */

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** As seis categorias de despesa que têm orçamento, na ordem de sempre. "Sem categoria" não tem. */
export const BUDGET_CATEGORIES: readonly string[] = CATEGORIES.despesa;
/** Valor do orçamento: de R$ 1,00 a R$ 9.999.999,99. */
export const BUDGET_MIN_CENTS = 100;
export const BUDGET_MAX_CENTS = MAX_RECORD_CENTS;
/** "A partir de": de 24 meses antes a 12 meses depois do mês de hoje (como a renda de referência). */
export const BUDGET_MONTHS_BACK = 24;
export const BUDGET_MONTHS_AHEAD = 12;
/** Avisos dentro do app: ao chegar a 80% e ao passar de 100%. */
export const BUDGET_WARN_PERCENT = 80;
/** Limite pessoal: de 10% a 100% da renda, em pontos inteiros. */
export const LIMIT_MIN_PERCENT = 10;
export const LIMIT_MAX_PERCENT = 100;
export const LIMIT_MONTHS_BACK = BUDGET_MONTHS_BACK;
export const LIMIT_MONTHS_AHEAD = BUDGET_MONTHS_AHEAD;
/** O aviso do limite aparece quando o comprometido chega a 5 pontos dele (50 décimos) ou passa. */
export const LIMIT_NEAR_TENTHS = 50;

export function isBudgetCategory(category: unknown): category is string {
  return typeof category === 'string' && BUDGET_CATEGORIES.includes(category);
}

// ---------------------------------------------------------------------------
// Linhas guardadas
// ---------------------------------------------------------------------------

/**
 * Orçamento de uma categoria a partir de um mês (category_budgets). amountCents null: "Tirar o orçamento a partir de {mês}"
 * (encerra a vigência). Gravado só por set_category_budget e delete_category_budget; no máximo uma linha viva por contexto,
 * categoria e mês de início.
 */
export interface CategoryBudget {
  id: string;
  contextId: string;
  category: string;
  /** Primeiro mês em que vale (no banco, o dia 1 desse mês). */
  fromMonth: IsoMonth;
  amountCents: Cents | null;
  createdBy: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Limite pessoal de comprometimento a partir de um mês (commitment_limits): percentual inteiro da renda de referência.
 * Gravado só por set_commitment_limit e delete_commitment_limit; no máximo uma linha viva por contexto e mês de início.
 */
export interface CommitmentLimit {
  id: string;
  contextId: string;
  fromMonth: IsoMonth;
  percent: number;
  createdBy: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Linha vigente da categoria no mês: a mais recente com início até o mês (pode ter valor null: orçamento encerrado). */
export function budgetRowFor<T extends Pick<CategoryBudget, 'category' | 'fromMonth'>>(rows: readonly T[], category: string, month: IsoMonth): T | null {
  let best: T | null = null;
  for (const r of rows) if (r.category === category && r.fromMonth <= month && (!best || r.fromMonth > best.fromMonth)) best = r;
  return best;
}

/** Limite vigente no mês: a linha mais recente com início até o mês (ou null). */
export function limitFor<T extends Pick<CommitmentLimit, 'fromMonth'>>(rows: readonly T[], month: IsoMonth): T | null {
  let best: T | null = null;
  for (const r of rows) if (r.fromMonth <= month && (!best || r.fromMonth > best.fromMonth)) best = r;
  return best;
}

// ---------------------------------------------------------------------------
// Usado no mês
// ---------------------------------------------------------------------------

/** O que o usado no mês lê: gastos realizados e lançamentos de cartão (qualquer mês; o mês pedido filtra). */
export interface BudgetUsageSource {
  records: readonly Pick<FinancialRecord, 'kind' | 'category' | 'amountCents' | 'occurredOn' | 'invoice'>[];
  entries: readonly Pick<CardEntry, 'kind' | 'category' | 'amountCents' | 'installments' | 'purchasedOn' | 'invoiceMonth' | 'sourceMonth'>[];
}

/** Valor da parcela da compra que cai no mês (pela data da compra), ou 0. */
function installmentInMonth(e: BudgetUsageSource['entries'][number], month: IsoMonth): Cents {
  if (e.kind !== 'compra' || e.purchasedOn === null) return 0;
  const k = monthsBetween(monthOf(e.purchasedOn), month) + 1;
  if (k < 1 || k > e.installments) return 0;
  return installmentAmounts(e.amountCents, e.installments)[k - 1]!;
}

/** Usado no mês por categoria (as seis), em centavos. Regra no cabeçalho do arquivo; o banco a repete em month_budget. */
export function categoryUsage(month: IsoMonth, source: BudgetUsageSource): Record<string, Cents> {
  const spent = new Map<string, Cents>();
  const add = (category: string | null, cents: Cents) => {
    if (category !== null && isBudgetCategory(category)) spent.set(category, (spent.get(category) ?? 0) + cents);
  };
  for (const r of source.records) {
    if (r.kind === 'despesa' && !r.invoice && monthOf(r.occurredOn) === month) add(r.category, r.amountCents);
  }
  for (const e of source.entries) {
    if (e.kind === 'compra') add(e.category, installmentInMonth(e, month));
    // Estorno informado pela pessoa (o automático não tem categoria): desconta no mês da fatura em que foi informado.
    else if (e.kind === 'estorno' && e.sourceMonth === null && e.invoiceMonth === month) add(e.category, -e.amountCents);
  }
  return Object.fromEntries(BUDGET_CATEGORIES.map((c) => [c, Math.max(0, spent.get(c) ?? 0)]));
}

/** Uma linha de month_budget: a categoria, o orçamento vigente (null: nenhum ou encerrado) e o usado no mês. */
export interface MonthBudgetLine {
  category: string;
  /** Linha vigente (mesmo encerrada, com valor null); null se nenhuma linha começa até o mês. */
  budgetId: string | null;
  budgetVersion: number | null;
  budgetFrom: IsoMonth | null;
  /** Valor do orçamento no mês; null sem orçamento (nenhuma linha vigente, ou a vigente foi encerrada). */
  budgetCents: Cents | null;
  usedCents: Cents;
}

/** O que month_budget devolve: uma linha por categoria, na ordem de BUDGET_CATEGORIES. */
export interface MonthBudgetRead {
  month: IsoMonth;
  lines: MonthBudgetLine[];
}

/** month_budget calculado no core: as linhas de orçamento do contexto (qualquer mês) e o que foi gasto. */
export function readMonthBudget(month: IsoMonth, budgets: readonly CategoryBudget[], source: BudgetUsageSource): MonthBudgetRead {
  const used = categoryUsage(month, source);
  return {
    month,
    lines: BUDGET_CATEGORIES.map((category) => {
      const row = budgetRowFor(budgets, category, month);
      return {
        category,
        budgetId: row?.id ?? null,
        budgetVersion: row?.version ?? null,
        budgetFrom: row?.fromMonth ?? null,
        budgetCents: row?.amountCents ?? null,
        usedCents: used[category] ?? 0,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Resumo do mês
// ---------------------------------------------------------------------------

/** 0: abaixo de 80%; 1: de 80% até o valor do orçamento; 2: passou do orçamento. */
export type BudgetLevel = 0 | 1 | 2;

/** Nível pelo valor exato em centavos (nunca pelo percentual arredondado). */
export function budgetLevel(usedCents: Cents, budgetCents: Cents): BudgetLevel {
  if (usedCents > budgetCents) return 2;
  return usedCents * 100 >= budgetCents * BUDGET_WARN_PERCENT ? 1 : 0;
}

/** Percentual inteiro, para baixo: 84,9% → 84. */
export function percentFloor(usedCents: Cents, budgetCents: Cents): number {
  const a = usedCents * 100;
  return (a - (a % budgetCents)) / budgetCents;
}

export interface BudgetRow {
  category: string;
  budgetId: string;
  budgetVersion: number;
  budgetFrom: IsoMonth;
  budgetCents: Cents;
  usedCents: Cents;
  /** max(0, orçamento − usado). */
  leftCents: Cents;
  /** max(0, usado − orçamento). */
  overCents: Cents;
  /** Percentual do orçamento em décimos, metade para cima (pode passar de 1.000). */
  tenths: number;
  /** "34,4%" */
  percentText: string;
  /** Largura da barra em décimos, de 0 a 1.000. */
  barTenths: number;
  level: BudgetLevel;
  /** "R$ 412,30 de R$ 1.200,00" */
  amountLine: string;
  /** "Faltam R$ 787,70", "R$ 12,30 acima do orçamento" ou "Orçamento usado por inteiro". */
  balanceLine: string;
  /** "Mercado, R$ 412,30 de R$ 1.200,00, 34,4% do orçamento. Faltam R$ 787,70." */
  a11yLabel: string;
}

export interface BudgetSummary {
  month: IsoMonth;
  /** Categorias com orçamento no mês, na ordem de BUDGET_CATEGORIES. */
  rows: BudgetRow[];
  /** Categorias sem orçamento no mês ("Definir orçamento"), na mesma ordem. */
  without: string[];
  /** Soma dos orçamentos das categorias que têm orçamento. */
  budgetCents: Cents;
  /** Soma do usado, só das categorias que têm orçamento. */
  usedCents: Cents;
  hasAny: boolean;
  /** Categoria mais perto do limite (maior percentual; empate: a primeira da ordem), ou null. */
  nearest: BudgetRow | null;
  /** "Orçado R$ 6.000,00 · Usado R$ 3.100,00"; null sem orçamento. */
  totalLine: string | null;
}

const balanceOf = (b: number, used: number) =>
  used > b ? BUDGET_TEXT.over(used - b) : used === b ? BUDGET_TEXT.full : BUDGET_TEXT.left(b - used);

export function budgetRow(line: MonthBudgetLine & { budgetId: string; budgetVersion: number; budgetFrom: IsoMonth; budgetCents: Cents }): BudgetRow {
  const { category, budgetCents: b, usedCents: used } = line;
  const tenths = percentTenths(used, b);
  const percentText = formatPermille(tenths, used);
  const balanceLine = balanceOf(b, used);
  const amountLine = BUDGET_TEXT.amounts(used, b);
  return {
    category,
    budgetId: line.budgetId,
    budgetVersion: line.budgetVersion,
    budgetFrom: line.budgetFrom,
    budgetCents: b,
    usedCents: used,
    leftCents: Math.max(0, b - used),
    overCents: Math.max(0, used - b),
    tenths,
    percentText,
    barTenths: Math.min(1000, tenths),
    level: budgetLevel(used, b),
    amountLine,
    balanceLine,
    a11yLabel: `${category}, ${amountLine}, ${percentText} do orçamento. ${balanceLine}.`,
  };
}

/** Linha com orçamento no mês? (as outras vão para "Definir orçamento"). */
function hasBudget(l: MonthBudgetLine): l is MonthBudgetLine & { budgetId: string; budgetVersion: number; budgetFrom: IsoMonth; budgetCents: Cents } {
  return l.budgetCents !== null && l.budgetId !== null && l.budgetVersion !== null && l.budgetFrom !== null;
}

export function summarizeBudget(read: MonthBudgetRead): BudgetSummary {
  const rows = read.lines.filter(hasBudget).map(budgetRow);
  const without = read.lines.filter((l) => !hasBudget(l)).map((l) => l.category);
  const budgetCents = rows.reduce((s, r) => s + r.budgetCents, 0);
  const usedCents = rows.reduce((s, r) => s + r.usedCents, 0);
  let nearest: BudgetRow | null = null;
  for (const r of rows) if (!nearest || r.tenths > nearest.tenths) nearest = r;
  return {
    month: read.month,
    rows,
    without,
    budgetCents,
    usedCents,
    hasAny: rows.length > 0,
    nearest,
    totalLine: rows.length > 0 ? BUDGET_TEXT.total(budgetCents, usedCents) : null,
  };
}

/** Legenda da linha "Orçamento por categoria" em Movimentos › Organizar. */
export function budgetCaption(s: BudgetSummary): string {
  return s.nearest ? `${s.nearest.category}: ${s.nearest.amountLine}` : BUDGET_TEXT.organize.none;
}

// ---------------------------------------------------------------------------
// Aviso dentro do app: cruzar 80% ou 100% (sem notificação)
// ---------------------------------------------------------------------------

const capitalizeFirst = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

function monthNameFor(month: IsoMonth, today: IsoDate): string {
  return monthOf(today).slice(0, 4) === month.slice(0, 4) ? formatMonthName(month) : formatMonthYearBR(month);
}

/**
 * Linha neutra para a mensagem de sucesso, só no cruzamento (antes < limiar <= depois): chegou a 80% (ou mais, até o valor do
 * orçamento) ou passou de 100%. "Mercado chegou a 85% do orçamento de outubro." / "Mercado passou do orçamento de outubro em
 * R$ 12,30." Com valores ocultos, sem o valor: "Mercado passou do orçamento de outubro." before/after: a linha da categoria
 * antes e depois de gravar; sem orçamento depois, null.
 */
export function budgetCrossing(
  before: Pick<MonthBudgetLine, 'usedCents' | 'budgetCents'> | null,
  after: Pick<MonthBudgetLine, 'category' | 'usedCents' | 'budgetCents'> | null,
  month: IsoMonth,
  today: IsoDate,
  hideValues = false,
): string | null {
  if (!after || after.budgetCents === null || !before || before.budgetCents === null) return null;
  const was = budgetLevel(before.usedCents, before.budgetCents);
  const now = budgetLevel(after.usedCents, after.budgetCents);
  if (now <= was) return null;
  const name = monthNameFor(month, today);
  if (now === 2) {
    return hideValues
      ? BUDGET_TEXT.crossedOverHidden(after.category, name)
      : BUDGET_TEXT.crossedOver(after.category, name, after.usedCents - after.budgetCents);
  }
  return BUDGET_TEXT.crossedNear(after.category, percentFloor(after.usedCents, after.budgetCents), name);
}

// ---------------------------------------------------------------------------
// Formulário do orçamento
// ---------------------------------------------------------------------------

/** "A partir de": de 24 meses antes a 12 depois do mês de hoje. */
export function budgetMonthBounds(today: IsoDate): { min: IsoMonth; max: IsoMonth } {
  const m = monthOf(today);
  return { min: addMonths(m, -BUDGET_MONTHS_BACK), max: addMonths(m, BUDGET_MONTHS_AHEAD) };
}

/** Mesmos códigos do banco: mes_invalido e vigencia_fora_do_intervalo; null quando aceito. */
export function budgetMonthError(month: unknown, today: IsoDate): 'mes_invalido' | 'vigencia_fora_do_intervalo' | null {
  if (typeof month !== 'string' || !isValidIsoMonth(month)) return 'mes_invalido';
  const { min, max } = budgetMonthBounds(today);
  return month < min || month > max ? 'vigencia_fora_do_intervalo' : null;
}

/** Valor do orçamento: null aceito (tirar o orçamento); senão de R$ 1,00 a R$ 9.999.999,99. */
export function budgetAmountError(amountCents: Cents | null): 'valor_invalido' | 'valor_acima_do_limite' | null {
  if (amountCents === null) return null;
  if (!Number.isSafeInteger(amountCents) || amountCents < BUDGET_MIN_CENTS) return 'valor_invalido';
  if (amountCents > BUDGET_MAX_CENTS) return 'valor_acima_do_limite';
  return null;
}

/** Ordem das conferências de set_category_budget depois da versão e da autoria: mês de início, valor. */
export const BUDGET_INPUT_CODE_ORDER = ['vigencia_fora_do_intervalo', 'valor_invalido', 'valor_acima_do_limite'] as const;

export const BUDGET_ERROR_TEXT = {
  ...ERROR_TEXT,
  valor_invalido: 'Informe um valor de R$ 1,00 ou mais, como 1.200,00.',
  valor_acima_do_limite: 'O valor máximo do orçamento é R$ 9.999.999,99.',
  categoria_invalida: 'Escolha uma das categorias de gasto.',
  mes_invalido: 'Escolha um mês entre dois anos atrás e os próximos 12 meses.',
  vigencia_fora_do_intervalo: 'Escolha um mês entre dois anos atrás e os próximos 12 meses.',
  versao_desatualizada: 'O orçamento deste mês foi alterado em outro aparelho. Confira o valor atual antes de salvar.',
  nao_encontrado: 'Este orçamento foi excluído. Confira os orçamentos atuais.',
} as const;

export interface BudgetDraft {
  category: string;
  amountText: string;
  fromMonth: IsoMonth;
}

export type BudgetValidation =
  | { ok: true; category: string; fromMonth: IsoMonth; amountCents: Cents }
  | { ok: false; errors: Partial<Record<'amountText' | 'fromMonth', string>> };

/** Validação do formulário, na ordem do banco (mês, valor). A categoria vem da rota e não é um campo. */
export function validateBudgetDraft(draft: BudgetDraft, today: IsoDate): BudgetValidation {
  const errors: Partial<Record<'amountText' | 'fromMonth', string>> = {};
  const monthError = budgetMonthError(draft.fromMonth, today);
  if (monthError) errors.fromMonth = BUDGET_ERROR_TEXT[monthError];
  const cents = parseBRL(draft.amountText);
  const amountError = cents === null ? 'valor_invalido' : budgetAmountError(cents);
  if (amountError) errors.amountText = BUDGET_ERROR_TEXT[amountError];
  if (errors.fromMonth || errors.amountText) return { ok: false, errors };
  return { ok: true, category: draft.category, fromMonth: draft.fromMonth, amountCents: cents! };
}

/** O que o endereço /orcamento/{categoria} aceita: o nome exato (sem acento ou caixa, o endereço é o nome codificado). */
export function budgetCategoryFromParam(param: string | string[] | undefined): string | null {
  const value = Array.isArray(param) ? param[0] : param;
  return typeof value === 'string' && isBudgetCategory(value) ? value : null;
}

// ---------------------------------------------------------------------------
// Limite pessoal: validação e textos de situação
// ---------------------------------------------------------------------------

export const LIMIT_ERROR_TEXT = {
  ...ERROR_TEXT,
  percentual_invalido: 'Informe um número inteiro de 10 a 100, como 40.',
  mes_invalido: 'Escolha um mês entre dois anos atrás e os próximos 12 meses.',
  vigencia_fora_do_intervalo: 'Escolha um mês entre dois anos atrás e os próximos 12 meses.',
  versao_desatualizada: 'O limite deste mês foi alterado em outro aparelho. Confira o valor atual antes de salvar.',
  nao_encontrado: 'Este limite foi excluído. Confira o limite atual.',
} as const;

export function limitMonthBounds(today: IsoDate): { min: IsoMonth; max: IsoMonth } {
  const m = monthOf(today);
  return { min: addMonths(m, -LIMIT_MONTHS_BACK), max: addMonths(m, LIMIT_MONTHS_AHEAD) };
}

export function limitMonthError(month: unknown, today: IsoDate): 'mes_invalido' | 'vigencia_fora_do_intervalo' | null {
  if (typeof month !== 'string' || !isValidIsoMonth(month)) return 'mes_invalido';
  const { min, max } = limitMonthBounds(today);
  return month < min || month > max ? 'vigencia_fora_do_intervalo' : null;
}

export function limitPercentError(percent: unknown): 'percentual_invalido' | null {
  return typeof percent === 'number' && Number.isInteger(percent) && percent >= LIMIT_MIN_PERCENT && percent <= LIMIT_MAX_PERCENT ? null : 'percentual_invalido';
}

/** "40", "40%" ou " 40 " → 40; decimais, texto e vazio → null. */
export function parseLimitPercent(text: string): number | null {
  const m = /^\s*(\d{1,3})\s*%?\s*$/.exec(text);
  return m ? Number(m[1]) : null;
}

export interface LimitDraft {
  percentText: string;
  fromMonth: IsoMonth;
}

export type LimitValidation =
  | { ok: true; fromMonth: IsoMonth; percent: number }
  | { ok: false; errors: Partial<Record<'percentText' | 'fromMonth', string>> };

/** Validação do formulário, na ordem do banco (mês, percentual). */
export function validateLimitDraft(draft: LimitDraft, today: IsoDate): LimitValidation {
  const errors: Partial<Record<'percentText' | 'fromMonth', string>> = {};
  const monthError = limitMonthError(draft.fromMonth, today);
  if (monthError) errors.fromMonth = LIMIT_ERROR_TEXT[monthError];
  const percent = parseLimitPercent(draft.percentText);
  if (percent === null || limitPercentError(percent)) errors.percentText = LIMIT_ERROR_TEXT.percentual_invalido;
  if (errors.fromMonth || errors.percentText) return { ok: false, errors };
  return { ok: true, fromMonth: draft.fromMonth, percent: percent! };
}

export type LimitKind = 'dentro' | 'perto' | 'acima';

/** Situação de um mês em relação ao limite pessoal. Comparação em milésimos, como o percentual que a tela mostra. */
export interface LimitStatus {
  month: IsoMonth;
  percent: number;
  /** Comprometido em milésimos da renda (committedPermille). */
  permille: number;
  /** limite − comprometido, em décimos de ponto; negativo quando passou. */
  diffTenths: number;
  kind: LimitKind;
  /** "28,0% de 30% que você escolheu" */
  line: string;
  /** Só 'perto' e 'acima': "Novembro está a 2,0 pontos do limite de 30% que você escolheu." */
  note: string | null;
}

/** "2,0" a partir de 20 décimos. */
const tenthsText = (t: number) => `${Math.floor(t / 10)},${t % 10}`;
/** "ponto" até 1,0 e "pontos" acima. */
const pointsWord = (t: number) => (t <= 10 ? 'ponto' : 'pontos');

function monthStart(month: IsoMonth, today: IsoDate): string {
  const name = monthNameFor(month, today);
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

/**
 * Situação do mês pelo comprometido (milésimos da renda de referência) e pelo limite vigente. Sem referência ou sem limite,
 * null: o limite só aparece com a renda de referência definida. 'perto': a 5 pontos do limite ou menos (inclusive no limite);
 * 'acima': passou do limite.
 */
export function limitStatus(
  month: IsoMonth,
  committedPermilleValue: number | null,
  committedCents: Cents,
  limitPercent: number | null,
  today: IsoDate,
): LimitStatus | null {
  if (committedPermilleValue === null || limitPercent === null) return null;
  const diffTenths = limitPercent * 10 - committedPermilleValue;
  const kind: LimitKind = diffTenths < 0 ? 'acima' : diffTenths <= LIMIT_NEAR_TENTHS ? 'perto' : 'dentro';
  const line = LIMIT_TEXT.line(formatPermille(committedPermilleValue, committedCents), limitPercent);
  let note: string | null = null;
  const start = monthStart(month, today);
  if (kind === 'acima') note = LIMIT_TEXT.over(start, tenthsText(-diffTenths), pointsWord(-diffTenths), limitPercent);
  else if (kind === 'perto') {
    note = diffTenths === 0 ? LIMIT_TEXT.atLimit(start, limitPercent) : LIMIT_TEXT.near(start, tenthsText(diffTenths), pointsWord(diffTenths), limitPercent);
  }
  return { month, percent: limitPercent, permille: committedPermilleValue, diffTenths, kind, line, note };
}

/** Um mês para o aviso ao gravar uma conta: comprometido em milésimos (null sem referência). */
export interface LimitWatchMonth {
  month: IsoMonth;
  committedPermille: number | null;
  committedCents: Cents;
}

/**
 * "Com esta conta, novembro chega a 32,0% da renda, acima do limite de 30% que você escolheu." Só no cruzamento: o primeiro mês
 * (em ordem) que antes estava no limite ou abaixo e agora está acima. Sem limite no mês ou sem renda de referência, nada.
 */
export function limitCrossing(
  before: readonly LimitWatchMonth[],
  after: readonly LimitWatchMonth[],
  limits: readonly Pick<CommitmentLimit, 'fromMonth' | 'percent'>[],
  today: IsoDate,
): string | null {
  const was = new Map(before.map((m) => [m.month, m]));
  for (const m of [...after].sort((a, b) => a.month.localeCompare(b.month))) {
    const limit = limitFor(limits, m.month);
    if (!limit || m.committedPermille === null) continue;
    const over = (permille: number) => permille > limit.percent * 10;
    const prev = was.get(m.month);
    if (over(m.committedPermille) && !(prev && prev.committedPermille !== null && over(prev.committedPermille))) {
      return LIMIT_TEXT.crossed(monthNameFor(m.month, today), formatPermille(m.committedPermille, m.committedCents), limit.percent);
    }
  }
  return null;
}

/** Meses previstos que passam do limite, com a frase curta de sempre (Próximos meses). */
export function limitNotesFor(
  months: readonly LimitWatchMonth[],
  limits: readonly Pick<CommitmentLimit, 'fromMonth' | 'percent'>[],
  today: IsoDate,
): Record<IsoMonth, string> {
  const out: Record<IsoMonth, string> = {};
  for (const m of months) {
    const limit = limitFor(limits, m.month);
    const status = limit ? limitStatus(m.month, m.committedPermille, m.committedCents, limit.percent, today) : null;
    if (status?.kind === 'acima' && status.note) out[m.month] = status.note;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

/** Textos do orçamento por categoria. Neutros: sem cor que julgue, sem julgamento. */
export const BUDGET_TEXT = {
  title: 'Orçamento por categoria',
  intro: 'Defina quanto você pretende usar por mês em cada categoria de gasto.',
  cardRule: 'Compras no cartão contam no mês da compra (cada parcela no seu mês), mesmo antes de a fatura ser paga.',
  /** Orçamento é do usado no mês; Pago por categoria é do que foi pago. */
  versusPaid: 'O orçamento conta o usado no mês. Pago por categoria mostra o que foi pago, e a compra no cartão entra em Pago quando a fatura é paga.',
  retry: 'Tentar novamente',
  loadError: 'Não foi possível carregar o orçamento.',
  withBudgetTitle: 'Com orçamento',
  withoutTitle: 'Definir orçamento',
  withoutHint: 'Categorias sem orçamento neste mês.',
  noneYet: 'Nenhum orçamento definido neste mês. Escolha uma categoria abaixo para começar.',
  noCategoryNote: 'Gastos sem categoria não têm orçamento.',
  /** "Orçado R$ 6.000,00 · Usado R$ 3.100,00" */
  total: (budgetCents: Cents, usedCents: Cents) => `Orçado ${formatBRL(budgetCents)} · Usado ${formatBRL(usedCents)}`,
  totalNote: 'Soma só as categorias com orçamento.',
  /** "R$ 412,30 de R$ 1.200,00" */
  amounts: (usedCents: Cents, budgetCents: Cents) => `${formatBRL(usedCents)} de ${formatBRL(budgetCents)}`,
  /** "Faltam R$ 787,70" */
  left: (cents: Cents) => `Faltam ${formatBRL(cents)}`,
  /** "R$ 12,30 acima do orçamento" */
  over: (cents: Cents) => `${formatBRL(cents)} acima do orçamento`,
  full: 'Orçamento usado por inteiro',
  /** Legenda de Movimentos › Organizar. */
  organize: {
    title: 'Orçamento por categoria',
    none: 'Nenhum orçamento definido',
    fallback: 'Quanto usar por mês em cada categoria',
  },
  /** Composição › Por categoria: "de R$ 1.200,00 orçados". */
  budgeted: (cents: Cents) => `de ${formatBRL(cents)} orçados`,
  /** Nome acessível de uma barra de Por categoria com orçamento: "Mercado, R$ 412,30, 23,4% do pago, de R$ 1.200,00 orçados". */
  budgetedA11y: (label: string, cents: Cents) => `${label}, ${BUDGET_TEXT.budgeted(cents)}`,
  seeBudget: 'Ver orçamento por categoria',
  /** Barra das categorias: nome acessível, mês e orçamento. */
  defineButton: (category: string) => `Definir orçamento de ${category}`,
  changeButton: (category: string) => `Alterar orçamento de ${category}`,
  monthPick: (month: IsoMonth) => `Orçamento de ${formatMonthYearBR(month)}`,
  // Formulário /orcamento/[categoria].
  form: {
    title: (category: string) => `Orçamento de ${category}`,
    intro: (category: string) => `Quanto você pretende usar por mês em ${category}. Vale a partir do mês escolhido, até você mudar.`,
    amountLabel: 'Valor por mês',
    fromLabel: 'A partir de',
    fromHint: 'Meses anteriores ao escolhido não mudam.',
    save: 'Salvar orçamento',
    cancel: 'Cancelar',
    remove: 'Tirar o orçamento',
    /** "Tirar o orçamento a partir de novembro de 2026" */
    removeFrom: (month: IsoMonth) => `Tirar o orçamento a partir de ${formatMonthYearBR(month)}`,
    /** "Tirar o orçamento de Mercado a partir de novembro?" */
    removeTitle: (category: string, month: IsoMonth) => `Tirar o orçamento de ${category} a partir de ${formatMonthYearBR(month)}?`,
    removeBody: 'Os meses anteriores continuam com o orçamento que tinham. Você pode definir outro quando quiser.',
    removeConfirm: 'Tirar orçamento',
    /** Desfazer a retirada: exclui a linha sem valor do mês e a anterior volta a valer. */
    restore: 'Voltar ao orçamento anterior',
    restoreTitle: (month: IsoMonth) => `Voltar ao orçamento anterior a ${formatMonthYearBR(month)}?`,
    restoreBody: 'Tiramos a linha que encerrava o orçamento neste mês. O valor anterior volta a valer.',
    restoreConfirm: 'Voltar ao anterior',
    /** "Orçamento de Mercado salvo. Vale a partir de outubro." */
    saved: (category: string, month: IsoMonth) => `Orçamento de ${category} salvo. Vale a partir de ${formatMonthName(month)}.`,
    /** "Orçamento de Mercado tirado a partir de novembro." */
    removed: (category: string, month: IsoMonth) => `Orçamento de ${category} tirado a partir de ${formatMonthName(month)}.`,
    deleted: (category: string) => `Linha do orçamento de ${category} excluída.`,
    /** Linhas do histórico do orçamento da categoria. */
    historyTitle: 'Histórico',
    historyRow: (month: IsoMonth, cents: Cents | null) => `${capitalizeFirst(formatMonthYearBR(month))}: ${cents === null ? 'sem orçamento' : `${formatBRL(cents)} por mês`}`,
    existing: (month: IsoMonth) => `Já existe uma linha a partir de ${formatMonthYearBR(month)}. Ao salvar, ela é alterada.`,
    monthPrev: (month: IsoMonth) => `Mês anterior: ${formatMonthYearBR(month)}`,
    monthNext: (month: IsoMonth) => `Próximo mês: ${formatMonthYearBR(month)}`,
    unknown: 'Esta categoria não tem orçamento.',
  },
  // Aviso dentro do app, depois de salvar um gasto ou uma compra no cartão.
  /** "Mercado chegou a 85% do orçamento de outubro." */
  crossedNear: (category: string, percent: number, monthName: string) => `${category} chegou a ${formatInteger(percent)}% do orçamento de ${monthName}.`,
  /** "Mercado passou do orçamento de outubro em R$ 12,30." */
  crossedOver: (category: string, monthName: string, overCents: Cents) => `${category} passou do orçamento de ${monthName} em ${formatBRL(overCents)}.`,
  /** Valores ocultos: sem o valor. */
  crossedOverHidden: (category: string, monthName: string) => `${category} passou do orçamento de ${monthName}.`,
} as const;

/** Textos do limite pessoal de comprometimento. Neutros: sem cor que julgue, sem julgamento. */
export const LIMIT_TEXT = {
  title: 'Seu limite',
  intro: 'Escolha até quanto da sua renda de referência você quer comprometer por mês com contas. É uma escolha sua: o Clarevo não sugere um valor.',
  noReference: 'Para escolher um limite, informe antes a sua renda de referência.',
  none: 'Você ainda não escolheu um limite.',
  choose: 'Escolher meu limite',
  change: 'Alterar meu limite',
  /** "28,0% de 30% que você escolheu" */
  line: (percentText: string, percent: number) => `${percentText} de ${percent}% que você escolheu`,
  /** "Novembro está a 2,0 pontos do limite de 30% que você escolheu." */
  near: (month: string, points: string, word: string, percent: number) => `${month} está a ${points} ${word} do limite de ${percent}% que você escolheu.`,
  /** "Novembro está no limite de 30% que você escolheu." */
  atLimit: (month: string, percent: number) => `${month} está no limite de ${percent}% que você escolheu.`,
  /** "Novembro passou 3,5 pontos do limite de 30% que você escolheu." */
  over: (month: string, points: string, word: string, percent: number) => `${month} passou ${points} ${word} do limite de ${percent}% que você escolheu.`,
  /** Aviso ao gravar uma conta: "Com esta conta, novembro chega a 32,0% da renda, acima do limite de 30% que você escolheu." */
  crossed: (monthName: string, percentText: string, percent: number) =>
    `Com esta conta, ${monthName} chega a ${percentText} da renda, acima do limite de ${percent}% que você escolheu.`,
  // Formulário /renda-comprometida/limite.
  form: {
    title: 'Seu limite',
    percentLabel: 'Limite da renda (%)',
    percentHint: 'Um número inteiro de 10 a 100.',
    fromLabel: 'Vale a partir de',
    save: 'Salvar limite',
    cancel: 'Cancelar',
    remove: 'Tirar meu limite',
    /** "Tirar o limite de outubro?" */
    removeTitle: (month: IsoMonth) => `Tirar o limite a partir de ${formatMonthYearBR(month)}?`,
    removeBody: 'O limite anterior volta a valer. Sem nenhum, a tela mostra só o percentual.',
    removeConfirm: 'Tirar limite',
    /** "Limite de 40% salvo. Vale a partir de outubro." */
    saved: (percent: number, month: IsoMonth) => `Limite de ${percent}% salvo. Vale a partir de ${formatMonthName(month)}.`,
    removed: 'Limite tirado.',
    existing: (month: IsoMonth) => `Já existe um limite a partir de ${formatMonthYearBR(month)}. Ao salvar, ele é alterado.`,
    monthPrev: (month: IsoMonth) => `Mês anterior: ${formatMonthYearBR(month)}`,
    monthNext: (month: IsoMonth) => `Próximo mês: ${formatMonthYearBR(month)}`,
  },
} as const;
