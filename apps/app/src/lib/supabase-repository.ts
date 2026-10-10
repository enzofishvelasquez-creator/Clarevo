import {
  ESSENTIAL_BASE_SOURCES,
  GOAL_MOVEMENT_KINDS,
  GOAL_NOTE_MAX,
  GOAL_STATUSES,
  GOAL_TYPES,
  MAX_RECORD_CENTS,
  PARTS_PER_YEAR_MAX,
  RepoError,
  SAVINGS_ANSWERS,
  SAVINGS_MIN_MONTHLY_CENTS,
  addMonths,
  monthRange,
  type AffectedRef,
  type AmountMode,
  type Cents,
  type Commitment,
  type CommitmentAction,
  type CommitmentInput,
  type CommitmentSeries,
  type CommitmentWrite,
  type ContextActivity,
  type FinancialRecord,
  type Goal,
  type GoalAction,
  type GoalInput,
  type GoalMovement,
  type GoalMovementInput,
  type GoalMovementKind,
  type GoalStatus,
  type GoalWrite,
  type IncomeReference,
  type IsoMonth,
  type MonthOverview,
  type NewGoalInput,
  type OccurrenceMode,
  type PaymentInput,
  type PersonalSpace,
  type RecordInput,
  type RecordKind,
  type RecordsRepository,
  type RepoErrorCode,
  type ReturnDecision,
  type ReturnReviewMark,
  type ReturnReviewState,
  type SavingsAnswer,
  type SavingsCheck,
  type SeriesAction,
  type SeriesEditInput,
  type SeriesInput,
  type SeriesKind,
  type SeriesNature,
  type SeriesWrite,
} from '@clarevo/core';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Repositório: leitura filtrada pelo banco (RLS), escrita só por funções com idempotência e versão.
// ---------------------------------------------------------------------------

interface RecordRow {
  id: string;
  context_id: string;
  account_id: string;
  kind: RecordKind;
  status: 'realizado';
  amount_cents: number;
  currency: 'BRL';
  occurred_on: string;
  description: string;
  category: string | null;
  commitment_id: string | null;
  created_by: string;
  version: number;
  created_at: string;
  updated_at: string;
}

/** Colunas da visão commitment_items (conta a pagar + gasto vivo que a quitou + série, quando houver). */
interface CommitmentRow {
  id: string;
  context_id: string;
  description: string;
  amount_cents: number;
  currency: 'BRL';
  due_on: string;
  status: string;
  category: string | null;
  created_by: string;
  version: number;
  created_at: string;
  updated_at: string;
  paid_record_id: string | null;
  paid_on: string | null;
  paid_amount_cents: number | null;
  paid_account_id: string | null;
  // Ocorrência de série (nulos na conta avulsa). Tipo, total de parcelas e parcelas por ano vêm da série pela junção.
  series_id: string | null;
  occurrence_number: number | null;
  series_override: boolean;
  amount_is_estimate: boolean;
  series_kind: SeriesKind | null;
  series_nature: SeriesNature | null;
  series_installment_total: number | null;
  /** Só na conta do ano (1 = cota única); nulo nas outras. */
  series_parts_per_year: number | null;
}

/** Retorno (jsonb) das funções de conta a pagar. record: gasto criado (pagar) ou excluído (desfazer). */
interface CommitmentResult {
  commitment: CommitmentRow | null;
  record: RecordRow | null;
}

/** Vigência viva, como em series_items.terms. */
interface SeriesTermRow {
  from_number: number;
  description: string;
  category: string | null;
  amount_cents: number;
  amount_mode: AmountMode;
  due_day: number;
}

/** Colunas da visão series_items (e o objeto series do retorno das funções de série). */
interface SeriesRow {
  id: string;
  context_id: string;
  kind: SeriesKind;
  nature: SeriesNature;
  /** Primeiro dia do mês (AAAA-MM-01). */
  first_due_month: string;
  first_number: number;
  last_number: number | null;
  installment_total: number | null;
  currency: 'BRL';
  created_by: string;
  version: number;
  created_at: string;
  updated_at: string;
  terms: SeriesTermRow[];
  skipped_numbers: number[];
  paid_count: number;
  open_count: number;
  generating: boolean;
  /** Só na conta do ano, de 1 (cota única) a 12; nulo nas outras. */
  parts_per_year: number | null;
}

/** Retorno (jsonb) das funções de série: ocorrências vivas por número crescente; changed conforme a função. */
interface SeriesResult {
  series: SeriesRow | null;
  occurrences: CommitmentRow[] | null;
  changed: number;
}

/** Linha de context_activity (só datas, no fuso da pessoa; RLS: só a própria pessoa lê). */
interface ContextActivityRow {
  last_write_on: string;
  absence_from_on: string | null;
  absence_until_on: string | null;
}

/** Linha de return_reviews (e retorno jsonb de decide_return_review). reviewed_through: AAAA-MM-01. */
interface ReturnReviewRow {
  reviewed_through: string;
  decision: ReturnDecision;
  decided_on: string;
  version: number;
}

/** Linha de months_overview: month AAAA-MM-01; centavos em bigint (número JSON). */
interface MonthOverviewRow {
  month: string;
  received_count: number;
  received_cents: number;
  paid_count: number;
  paid_cents: number;
}

/** Linha de income_references (e retorno de set/delete_income_reference, que traz também deleted_at e deleted_by). */
interface IncomeReferenceRow {
  id: string;
  context_id: string;
  /** Sempre o dia 1 (AAAA-MM-01). */
  from_month: string;
  amount_cents: number;
  varies: boolean;
  created_by: string;
  version: number;
  created_at: string;
  updated_at: string;
  /** Instante em que o valor mudou pela última vez (null: nunca mudou desde que foi criada). */
  amount_changed_at: string | null;
}

/** Linha da visão goal_items (e a meta do retorno das funções de metas, que traz também deleted_at e deleted_by). */
interface GoalRow {
  id: string;
  context_id: string;
  goal_type: Goal['goalType'];
  name: string;
  target_cents: number;
  target_month: string | null;
  planned_monthly_cents: number | null;
  essential_base_cents: number | null;
  essential_months: number | null;
  essential_base_source: Goal['essentialBaseSource'];
  status: GoalStatus;
  created_by: string;
  version: number;
  created_at: string;
  updated_at: string;
  saved_cents: number;
  initial_cents: number;
  deposits_cents: number;
  withdrawals_cents: number;
  income_cents: number;
  appreciation_cents: number;
  depreciation_cents: number;
  last_movement_on: string | null;
}

/** Linha de goal_movements. */
interface GoalMovementRow {
  id: string;
  goal_id: string;
  context_id: string;
  kind: GoalMovementKind;
  amount_cents: number;
  occurred_on: string;
  note: string | null;
  created_by: string;
  version: number;
  created_at: string;
  updated_at: string;
}

/** Retorno (jsonb) das sete funções de metas: a meta no estado atual e o movimento envolvido (ou null). */
interface GoalResult {
  goal: GoalRow | null;
  movement: GoalMovementRow | null;
}

/** Linha de savings_checks (e retorno de set_savings_answer). person_id é sempre o da sessão. */
interface SavingsCheckRow {
  context_id: string;
  answer: SavingsAnswer;
  monthly_cents: number | null;
  answered_on: string;
  ask_again_on: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

const INCOME_REFERENCE_COLUMNS = 'id, context_id, from_month, amount_cents, varies, created_by, version, created_at, updated_at, amount_changed_at';
const GOAL_MOVEMENT_COLUMNS = 'id, goal_id, context_id, kind, amount_cents, occurred_on, note, created_by, version, created_at, updated_at';
const SAVINGS_CHECK_COLUMNS = 'context_id, answer, monthly_cents, answered_on, ask_again_on, version, created_at, updated_at';

const RECORD_ACTIONS = ['criar', 'editar', 'excluir'];
/**
 * 'criar_ocorrencia' (conta de mês passado de uma série, create_series_occurrence) é ação de conta a pagar: a conta
 * fica em commitment_id. Embora tenha target_id (a série), nunca entra em SERIES_ACTIONS.
 */
const COMMITMENT_ACTIONS: CommitmentAction[] = [
  'criar_compromisso',
  'editar_compromisso',
  'excluir_compromisso',
  'pagar_compromisso',
  'desfazer_pagamento',
  'criar_ocorrencia',
];
const SERIES_ACTIONS: SeriesAction[] = ['criar_serie', 'alterar_serie', 'encerrar_serie', 'excluir_serie', 'informar_ano', 'tirar_ano'];
/** Ações de metas: o alvo (target_id) é a meta nas quatro primeiras e o movimento nas três últimas. */
const GOAL_ACTIONS: GoalAction[] = [
  'criar_meta',
  'alterar_meta',
  'situacao_meta',
  'excluir_meta',
  'registrar_movimento_meta',
  'alterar_movimento_meta',
  'excluir_movimento_meta',
];
const GOAL_MOVEMENT_ACTIONS: readonly GoalAction[] = ['registrar_movimento_meta', 'alterar_movimento_meta', 'excluir_movimento_meta'];

const KNOWN: RepoErrorCode[] = [
  'versao_desatualizada',
  'chave_reutilizada',
  'nao_encontrado',
  'sem_permissao',
  'nao_autenticado',
  'email_nao_confirmado',
  'descricao_obrigatoria',
  'descricao_longa',
  'valor_invalido',
  'valor_acima_do_limite',
  'data_invalida',
  'data_futura',
  'conta_invalida',
  'categoria_invalida',
  'nome_da_conta_invalido',
  'vencimento_fora_do_intervalo',
  'compromisso_quitado',
  'compromisso_aberto',
  'tipo_invalido',
  'natureza_invalida',
  'modo_de_valor_invalido',
  'dia_invalido',
  'inicio_fora_do_intervalo',
  'parcelas_invalidas',
  'parcelas_no_ano_invalidas',
  'parcela_inicial_invalida',
  'fim_invalido',
  'numero_fora_da_serie',
  'inicio_em_conta_paga',
  'limite_de_gastos_fixos',
  'serie_tem_pagamento_posterior',
  'serie_tem_pagamentos',
  'vencimento_fora_do_mes',
  'estimativa_invalida',
  'serie_inconsistente',
  // Revisão dos últimos meses (D-030). Nenhum código acima termina com estes, nem estes com outro da lista.
  'ocorrencia_existente',
  'mes_fora_da_revisao',
  'modo_invalido',
  'decisao_invalida',
  'mes_invalido',
  'periodo_invalido',
  // Renda de referência (D-026). Nenhum é sufixo de outro código da lista, nem tem outro como sufixo.
  'referencia_fora_do_intervalo',
  // Metas e reserva (D-027).
  'reserva_ja_existe',
  'nome_da_meta_invalido',
  'alvo_acima_do_limite',
  'alvo_invalido',
  'prazo_invalido',
  'meses_invalidos',
  'origem_invalida',
  'plano_invalido',
  'saldo_inicial_invalido',
  'observacao_longa',
  'situacao_invalida',
  'meta_arquivada',
  'saldo_da_meta_insuficiente',
  // Plano de guardar (D-036).
  'resposta_invalida',
];

/**
 * Dos detalhes do banco, só dois seguem adiante, e só para montar uma mensagem para a pessoa: "dia=AAAA-MM-DD" (primeiro
 * dia em que o valor guardado ficaria negativo) e "versao_atual=N". Qualquer outro texto é descartado.
 */
function safeDetail(code: RepoErrorCode, details: string | null | undefined): string | undefined {
  if (typeof details !== 'string') return undefined;
  if (code === 'saldo_da_meta_insuficiente' && /^dia=\d{4}-\d{2}-\d{2}$/.test(details)) return details;
  if (code === 'versao_desatualizada' && /^versao_atual=\d{1,9}$/.test(details)) return details;
  return undefined;
}

/**
 * Converte o erro da API pelo nome (message) que o banco lança.
 * Privacidade: nunca registrar error.details (o Postgres pode incluir valores da linha), nem valores
 * ou descrições, em log ou evento. Só o nome do erro segue adiante, mais os dois detalhes de safeDetail (para a mensagem).
 */
function repoError(e: { message?: string; code?: string; details?: string | null } | null): RepoError {
  const msg = e?.message ?? '';
  // O mais longo vence: 'modo_de_valor_invalido' termina com 'valor_invalido'.
  const known = KNOWN.filter((k) => msg === k || msg.endsWith(k)).sort((a, b) => b.length - a.length)[0];
  if (known) return new RepoError(known, undefined, safeDetail(known, e?.details));
  if (e?.code === '42501') return new RepoError('sem_permissao');
  if (/fetch|network|Failed to fetch|timeout/i.test(msg) || !e?.code) return new RepoError('rede');
  return new RepoError('desconhecido', msg);
}

function toRecord(r: RecordRow): FinancialRecord {
  return {
    id: r.id,
    contextId: r.context_id,
    accountId: r.account_id,
    kind: r.kind,
    status: r.status,
    amountCents: Number(r.amount_cents),
    currency: r.currency,
    occurredOn: r.occurred_on,
    description: r.description,
    category: r.category,
    commitmentId: r.commitment_id ?? null,
    createdBy: r.created_by,
    version: r.version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * Parcelas por ano coerentes com o tipo da série (S9): de 1 a 12 na conta do ano, nulo nas outras. Sem isso, o mês, o
 * ano e os rótulos das parcelas sairiam errados.
 */
function partsPerYearOf(kind: SeriesKind, value: number | null | undefined): number | null {
  const k = value == null ? null : Number(value);
  const consistent = kind === 'anual' ? k !== null && Number.isInteger(k) && k >= 1 && k <= PARTS_PER_YEAR_MAX : k === null;
  if (!consistent) throw new RepoError('desconhecido', 'serie_inconsistente');
  return k;
}

/**
 * Paga se e somente se há gasto vivo vinculado. Qualquer outra combinação é recusada: nunca mostrar "paga" sem o gasto.
 * Ocorrência de série só com número e tipo da série; conta avulsa sem marcas de série (como commitments_series_marcas).
 */
function toCommitment(c: CommitmentRow): Commitment {
  const paid = c.status === 'quitado';
  const hasPayment =
    c.paid_record_id != null && c.paid_on != null && c.paid_amount_cents != null && c.paid_account_id != null;
  const consistent = paid ? hasPayment : c.status === 'aberto' && c.paid_record_id == null;
  if (!consistent) throw new RepoError('desconhecido', 'vinculo_inconsistente');
  const inSeries = c.series_id != null;
  const seriesConsistent = inSeries
    ? c.occurrence_number != null && c.series_kind != null && c.series_nature != null
    : c.occurrence_number == null && !c.series_override && !c.amount_is_estimate;
  if (!seriesConsistent) throw new RepoError('desconhecido', 'serie_inconsistente');
  const partsPerYear = inSeries ? partsPerYearOf(c.series_kind!, c.series_parts_per_year) : null;
  return {
    id: c.id,
    contextId: c.context_id,
    description: c.description,
    amountCents: Number(c.amount_cents),
    currency: c.currency,
    dueOn: c.due_on,
    category: c.category,
    status: paid ? 'quitado' : 'aberto',
    payment: paid
      ? {
          recordId: c.paid_record_id!,
          amountCents: Number(c.paid_amount_cents),
          paidOn: c.paid_on!,
          accountId: c.paid_account_id!,
        }
      : null,
    series: inSeries
      ? {
          id: c.series_id!,
          number: c.occurrence_number!,
          kind: c.series_kind!,
          nature: c.series_nature!,
          installmentTotal: c.series_installment_total ?? null,
          partsPerYear,
        }
      : null,
    seriesOverride: c.series_override === true,
    amountIsEstimate: c.amount_is_estimate === true,
    createdBy: c.created_by,
    version: c.version,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}

/** Toda série tem vigência viva no primeiro número (S5); sem ela, nenhum vencimento ou valor pode ser calculado. */
function toSeries(s: SeriesRow): CommitmentSeries {
  const terms = s.terms ?? [];
  if (terms[0]?.from_number !== s.first_number) throw new RepoError('desconhecido', 'serie_inconsistente');
  const partsPerYear = partsPerYearOf(s.kind, s.parts_per_year);
  return {
    id: s.id,
    contextId: s.context_id,
    kind: s.kind,
    nature: s.nature,
    firstDueMonth: s.first_due_month.slice(0, 7),
    firstNumber: s.first_number,
    lastNumber: s.last_number,
    installmentTotal: s.installment_total,
    partsPerYear,
    currency: s.currency,
    terms: terms.map((t) => ({
      fromNumber: t.from_number,
      description: t.description,
      category: t.category,
      amountCents: Number(t.amount_cents),
      amountMode: t.amount_mode,
      dueDay: t.due_day,
    })),
    skippedNumbers: s.skipped_numbers ?? [],
    paidCount: s.paid_count,
    openCount: s.open_count,
    generating: s.generating,
    createdBy: s.created_by,
    version: s.version,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FIRST_DAY = /^\d{4}-\d{2}-01$/;

/** Datas da atividade: o banco devolve AAAA-MM-DD; a ausência tem as duas pontas ou nenhuma (context_activity_ausencia). */
function toActivity(a: ContextActivityRow): ContextActivity {
  const dates = [a.last_write_on, a.absence_from_on, a.absence_until_on].filter((d): d is string => d !== null);
  const consistent = dates.every((d) => ISO_DATE.test(d)) && (a.absence_from_on === null) === (a.absence_until_on === null);
  if (!consistent) throw new RepoError('desconhecido', 'atividade_inconsistente');
  return { lastWriteOn: a.last_write_on, absenceFromOn: a.absence_from_on, absenceUntilOn: a.absence_until_on };
}

/** Marca da revisão: o banco guarda o mês revisado como AAAA-MM-01; o core usa AAAA-MM. */
function toReviewMark(r: ReturnReviewRow): ReturnReviewMark {
  const consistent =
    FIRST_DAY.test(r.reviewed_through) && ISO_DATE.test(r.decided_on) && (r.decision === 'atualizou' || r.decision === 'seguiu');
  if (!consistent) throw new RepoError('desconhecido', 'revisao_inconsistente');
  return { reviewedThrough: r.reviewed_through.slice(0, 7), decision: r.decision, decidedOn: r.decided_on, version: Number(r.version) };
}

function toMonthOverview(m: MonthOverviewRow): MonthOverview {
  if (!FIRST_DAY.test(m.month)) throw new RepoError('desconhecido', 'periodo_inconsistente');
  return {
    month: m.month.slice(0, 7),
    receivedCount: Number(m.received_count),
    receivedCents: Number(m.received_cents),
    paidCount: Number(m.paid_count),
    paidCents: Number(m.paid_cents),
  };
}

/** Número inteiro seguro vindo do banco (bigint sai como número JSON); qualquer outra coisa é inconsistência. */
function whole(v: unknown): number {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isSafeInteger(n)) throw new RepoError('desconhecido', 'valor_inconsistente');
  return n;
}

const wholeOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : whole(v));

/** Referência de renda: mês no dia 1 (AAAA-MM-01 vira AAAA-MM), valor de 1 a 999.999.999 e versão a partir de 1. */
function toIncomeReference(r: IncomeReferenceRow): IncomeReference {
  const amountCents = whole(r.amount_cents);
  const version = whole(r.version);
  const consistent = FIRST_DAY.test(r.from_month) && amountCents >= 1 && amountCents <= MAX_RECORD_CENTS && typeof r.varies === 'boolean' && version >= 1;
  if (!consistent) throw new RepoError('desconhecido', 'referencia_inconsistente');
  return {
    id: r.id,
    contextId: r.context_id,
    fromMonth: r.from_month.slice(0, 7),
    amountCents,
    varies: r.varies,
    createdBy: r.created_by,
    version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    amountChangedAt: r.amount_changed_at ?? null,
  };
}

/**
 * Meta com os totais dos movimentos vivos (goal_items). Recusa o que o banco nunca devolve: tipo ou situação fora da lista,
 * prazo fora do dia 1, reserva sem os três campos (ou outra meta com algum) ou com alvo diferente de base × meses, e guardado
 * que não fecha com os totais. Nunca mostrar um guardado errado.
 */
function toGoal(g: GoalRow): Goal {
  const targetCents = whole(g.target_cents);
  const base = wholeOrNull(g.essential_base_cents);
  const months = wholeOrNull(g.essential_months);
  const source = g.essential_base_source ?? null;
  const initialCents = whole(g.initial_cents);
  const depositsCents = whole(g.deposits_cents);
  const withdrawalsCents = whole(g.withdrawals_cents);
  const incomeCents = whole(g.income_cents);
  const appreciationCents = whole(g.appreciation_cents);
  const depreciationCents = whole(g.depreciation_cents);
  const savedCents = whole(g.saved_cents);
  const reserve = g.goal_type === 'emergencia';
  const consistent =
    GOAL_TYPES.includes(g.goal_type) &&
    GOAL_STATUSES.includes(g.status) &&
    (g.target_month === null || FIRST_DAY.test(g.target_month)) &&
    (g.last_movement_on === null || ISO_DATE.test(g.last_movement_on)) &&
    (reserve
      ? base !== null && months !== null && source !== null && ESSENTIAL_BASE_SOURCES.includes(source) && targetCents === base * months
      : base === null && months === null && source === null) &&
    savedCents === initialCents + depositsCents + incomeCents + appreciationCents - withdrawalsCents - depreciationCents;
  if (!consistent) throw new RepoError('desconhecido', 'meta_inconsistente');
  return {
    id: g.id,
    contextId: g.context_id,
    goalType: g.goal_type,
    name: g.name,
    targetCents,
    targetMonth: g.target_month === null ? null : g.target_month.slice(0, 7),
    plannedMonthlyCents: wholeOrNull(g.planned_monthly_cents),
    essentialBaseCents: base,
    essentialMonths: months,
    essentialBaseSource: source,
    status: g.status,
    createdBy: g.created_by,
    version: whole(g.version),
    createdAt: g.created_at,
    updatedAt: g.updated_at,
    savedCents,
    initialCents,
    depositsCents,
    withdrawalsCents,
    incomeCents,
    appreciationCents,
    depreciationCents,
    lastMovementOn: g.last_movement_on,
  };
}

/** Movimento: tipo da lista, valor positivo (o sentido vem do tipo), data AAAA-MM-DD e observação de 1 a 80 caracteres. */
function toGoalMovement(m: GoalMovementRow): GoalMovement {
  const amountCents = whole(m.amount_cents);
  const consistent =
    GOAL_MOVEMENT_KINDS.includes(m.kind) &&
    amountCents >= 1 &&
    ISO_DATE.test(m.occurred_on) &&
    (m.note === null || (typeof m.note === 'string' && m.note.length >= 1 && m.note.length <= GOAL_NOTE_MAX));
  if (!consistent) throw new RepoError('desconhecido', 'movimento_inconsistente');
  return {
    id: m.id,
    goalId: m.goal_id,
    contextId: m.context_id,
    kind: m.kind,
    amountCents,
    occurredOn: m.occurred_on,
    note: m.note,
    createdBy: m.created_by,
    version: whole(m.version),
    createdAt: m.created_at,
    updatedAt: m.updated_at,
  };
}

/**
 * Resposta do plano de guardar. "consigo" tem valor (R$ 1,00 a R$ 9.999.999,99) e nenhuma data de volta; as outras duas não
 * têm valor e voltam depois do dia da resposta (savings_checks_valor e savings_checks_retorno).
 */
function toSavingsCheck(r: SavingsCheckRow): SavingsCheck {
  const monthly = wholeOrNull(r.monthly_cents);
  const version = whole(r.version);
  const answered = ISO_DATE.test(r.answered_on);
  const consistent =
    SAVINGS_ANSWERS.includes(r.answer) &&
    answered &&
    version >= 1 &&
    (r.answer === 'consigo'
      ? monthly !== null && monthly >= SAVINGS_MIN_MONTHLY_CENTS && monthly <= MAX_RECORD_CENTS && r.ask_again_on === null
      : monthly === null && r.ask_again_on !== null && ISO_DATE.test(r.ask_again_on) && r.ask_again_on > r.answered_on);
  if (!consistent) throw new RepoError('desconhecido', 'guardar_inconsistente');
  return {
    contextId: r.context_id,
    answer: r.answer,
    monthlyCents: monthly,
    answeredOn: r.answered_on,
    askAgainOn: r.ask_again_on,
    version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Páginas de 500 linhas até acabar: a API limita cada resposta, e uma lista incompleta não pode aparecer como confirmada. */
async function readAll<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message?: string; code?: string; details?: string | null } | null }>,
): Promise<T[]> {
  const PAGE = 500;
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1);
    if (error) throw repoError(error);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE) break;
  }
  return rows;
}

/** Só {id, version}: um campo a mais faria a conferência de conjunto do banco recusar a escrita. */
const affectedJson = (list: readonly AffectedRef[]) => list.map((a) => ({ id: a.id, version: a.version }));

export class SupabaseRepository implements RecordsRepository {
  constructor(
    private readonly db: SupabaseClient,
    private readonly user: { id: string },
  ) {}

  async getSpace(): Promise<PersonalSpace | null> {
    const [person, ctx] = await Promise.all([
      this.db.from('persons').select('id, display_name, time_zone').eq('id', this.user.id).maybeSingle(),
      this.db.from('financial_contexts').select('id').eq('owner_person_id', this.user.id).eq('kind', 'pessoal').maybeSingle(),
    ]);
    if (person.error) throw repoError(person.error);
    if (ctx.error) throw repoError(ctx.error);
    if (!person.data || !ctx.data) return null;
    const accounts = await this.db
      .from('financial_accounts')
      .select('id, context_id, name, currency, initial_balance_cents')
      .eq('context_id', ctx.data.id)
      .eq('status', 'ativa')
      .order('created_at');
    if (accounts.error) throw repoError(accounts.error);
    if (accounts.data.length === 0) return null;
    return {
      personId: person.data.id,
      displayName: person.data.display_name,
      timeZone: person.data.time_zone,
      personalContextId: ctx.data.id,
      accounts: accounts.data.map((a) => ({
        id: a.id,
        contextId: a.context_id,
        name: a.name,
        currency: 'BRL' as const,
        initialBalanceCents: a.initial_balance_cents === null ? null : Number(a.initial_balance_cents),
      })),
    };
  }

  async ensurePersonalSpace(accountName: string, timeZone?: string) {
    const { error } = await this.db.rpc('ensure_personal_space', { p_account_name: accountName, p_time_zone: timeZone ?? null });
    if (error) throw repoError(error);
    const space = await this.getSpace();
    if (!space) throw new RepoError('desconhecido');
    return space;
  }

  async renameAccount(accountId: string, name: string) {
    const { error, count } = await this.db.from('financial_accounts').update({ name: name.trim() }, { count: 'exact' }).eq('id', accountId);
    if (error) throw error.code === '23514' ? new RepoError('nome_da_conta_invalido') : repoError(error);
    if (count === 0) throw new RepoError('nao_encontrado');
  }

  /** Lê o mês inteiro em páginas: a API limita cada resposta, e um total incompleto não pode aparecer como confirmado. */
  async listRecords(contextId: string, month: IsoMonth) {
    const { start, endExclusive } = monthRange(month);
    const PAGE = 500;
    const rows: RecordRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.db
        .from('financial_records')
        .select('*')
        .eq('context_id', contextId)
        .gte('occurred_on', start)
        .lt('occurred_on', endExclusive)
        .order('occurred_on', { ascending: false })
        .order('id')
        .range(from, from + PAGE - 1);
      if (error) throw repoError(error);
      rows.push(...(data as RecordRow[]));
      if (data.length < PAGE) break;
    }
    return rows.map(toRecord);
  }

  async getRecord(id: string) {
    const { data, error } = await this.db.from('financial_records').select('*').eq('id', id).maybeSingle();
    if (error) throw repoError(error);
    return data ? toRecord(data as RecordRow) : null;
  }

  /**
   * Contas a pagar do contexto: todas com vencimento no mês (abertas e pagas), as pagas com data de
   * pagamento no mês (paid_on vem do gasto vivo) e as abertas de outros meses.
   * Em páginas, como listRecords: um total incompleto não pode aparecer como confirmado.
   */
  async listCommitments(contextId: string, month: IsoMonth): Promise<Commitment[]> {
    const { start, endExclusive } = monthRange(month);
    const PAGE = 500;
    const rows: CommitmentRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.db
        .from('commitment_items')
        .select('*')
        .eq('context_id', contextId)
        .or(
          `and(due_on.gte.${start},due_on.lt.${endExclusive}),and(paid_on.gte.${start},paid_on.lt.${endExclusive}),status.eq.aberto`,
        )
        .order('due_on')
        .order('created_at')
        .order('id')
        .range(from, from + PAGE - 1);
      if (error) throw repoError(error);
      rows.push(...(data as CommitmentRow[]));
      if (data.length < PAGE) break;
    }
    return rows.map(toCommitment);
  }

  async getCommitment(id: string) {
    const { data, error } = await this.db.from('commitment_items').select('*').eq('id', id).maybeSingle();
    if (error) throw repoError(error);
    return data ? toCommitment(data as CommitmentRow) : null;
  }

  /** Só operações de registro: a chave de um pagamento não pode ser lida como edição do gasto. */
  async findOperation(key: string) {
    const { data, error } = await this.db
      .from('record_operations')
      .select('record_id')
      .eq('idempotency_key', key)
      .in('action', RECORD_ACTIONS)
      .maybeSingle();
    if (error) throw repoError(error);
    return data ? { recordId: data.record_id as string } : null;
  }

  async findCommitmentOperation(key: string) {
    const { data, error } = await this.db
      .from('record_operations')
      .select('action, commitment_id, record_id')
      .eq('idempotency_key', key)
      .in('action', COMMITMENT_ACTIONS)
      .maybeSingle();
    if (error) throw repoError(error);
    return data
      ? {
          action: data.action as CommitmentAction,
          commitmentId: data.commitment_id as string,
          recordId: (data.record_id as string | null) ?? null,
        }
      : null;
  }

  /** Só operações de série: o alvo fica em target_id. */
  async findSeriesOperation(key: string) {
    const { data, error } = await this.db
      .from('record_operations')
      .select('action, target_id')
      .eq('idempotency_key', key)
      .in('action', SERIES_ACTIONS)
      .maybeSingle();
    if (error) throw repoError(error);
    return data ? { action: data.action as SeriesAction, seriesId: data.target_id as string } : null;
  }

  private async call(fn: string, args: Record<string, unknown>) {
    const { data, error } = await this.db.rpc(fn, args).single();
    if (error) throw repoError(error);
    return toRecord(data as RecordRow);
  }

  createRecord(key: string, contextId: string, kind: RecordKind, input: RecordInput) {
    return this.call('create_record', {
      p_idempotency_key: key,
      p_context_id: contextId,
      p_account_id: input.accountId,
      p_kind: kind,
      p_amount_cents: input.amountCents,
      p_occurred_on: input.occurredOn,
      p_description: input.description,
      p_category: input.category,
    });
  }

  updateRecord(key: string, id: string, expectedVersion: number, input: RecordInput) {
    return this.call('update_record', {
      p_idempotency_key: key,
      p_record_id: id,
      p_expected_version: expectedVersion,
      p_account_id: input.accountId,
      p_amount_cents: input.amountCents,
      p_occurred_on: input.occurredOn,
      p_description: input.description,
      p_category: input.category,
    });
  }

  deleteRecord(key: string, id: string, expectedVersion: number) {
    return this.call('delete_record', { p_idempotency_key: key, p_record_id: id, p_expected_version: expectedVersion });
  }

  /** Funções de conta a pagar devolvem jsonb {commitment, record}: sem .single(). */
  private async callCommitment(fn: string, args: Record<string, unknown>): Promise<CommitmentWrite> {
    const { data, error } = await this.db.rpc(fn, args);
    if (error) throw repoError(error);
    const result = data as CommitmentResult | null;
    if (!result?.commitment) throw new RepoError('desconhecido');
    return { commitment: toCommitment(result.commitment), record: result.record ? toRecord(result.record) : null };
  }

  /** Pagar e desfazer sempre devolvem o gasto envolvido. */
  private async callPayment(fn: string, args: Record<string, unknown>) {
    const { commitment, record } = await this.callCommitment(fn, args);
    if (!record) throw new RepoError('desconhecido');
    return { commitment, record };
  }

  createCommitment(key: string, contextId: string, input: CommitmentInput) {
    return this.callCommitment('create_commitment', {
      p_idempotency_key: key,
      p_context_id: contextId,
      p_amount_cents: input.amountCents,
      p_due_on: input.dueOn,
      p_description: input.description,
      p_category: input.category,
    });
  }

  /**
   * p_amount_is_estimate só vai em "Informar o valor da conta" (false). Sem ele, o banco mantém a marca e calcula
   * o mesmo hash da assinatura antiga: uma repetição em trânsito continua reconhecida.
   */
  updateCommitment(key: string, id: string, expectedVersion: number, input: CommitmentInput) {
    return this.callCommitment('update_commitment', {
      p_idempotency_key: key,
      p_commitment_id: id,
      p_expected_version: expectedVersion,
      p_amount_cents: input.amountCents,
      p_due_on: input.dueOn,
      p_description: input.description,
      p_category: input.category,
      ...(input.amountIsEstimate === false ? { p_amount_is_estimate: false } : {}),
    });
  }

  deleteCommitment(key: string, id: string, expectedVersion: number) {
    return this.callCommitment('delete_commitment', {
      p_idempotency_key: key,
      p_commitment_id: id,
      p_expected_version: expectedVersion,
    });
  }

  payCommitment(key: string, id: string, expectedVersion: number, input: PaymentInput) {
    return this.callPayment('pay_commitment', {
      p_idempotency_key: key,
      p_commitment_id: id,
      p_expected_version: expectedVersion,
      p_account_id: input.accountId,
      p_amount_cents: input.amountCents,
      p_paid_on: input.paidOn,
      p_category: input.category,
    });
  }

  undoCommitmentPayment(key: string, id: string, expectedVersion: number) {
    return this.callPayment('undo_commitment_payment', {
      p_idempotency_key: key,
      p_commitment_id: id,
      p_expected_version: expectedVersion,
    });
  }

  /** Gastos fixos, parcelamentos e contas do ano do contexto (inclusive encerrados), em páginas como as demais listas. */
  async listSeries(contextId: string): Promise<CommitmentSeries[]> {
    const PAGE = 500;
    const rows: SeriesRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.db
        .from('series_items')
        .select('*')
        .eq('context_id', contextId)
        .order('created_at')
        .order('id')
        .range(from, from + PAGE - 1);
      if (error) throw repoError(error);
      rows.push(...(data as SeriesRow[]));
      if (data.length < PAGE) break;
    }
    return rows.map(toSeries);
  }

  async getSeries(id: string) {
    const { data, error } = await this.db.from('series_items').select('*').eq('id', id).maybeSingle();
    if (error) throw repoError(error);
    return data ? toSeries(data as SeriesRow) : null;
  }

  /** Ocorrências vivas (abertas e pagas), da mais recente para a mais antiga, até 60. */
  async listSeriesOccurrences(seriesId: string) {
    const { data, error } = await this.db
      .from('commitment_items')
      .select('*')
      .eq('series_id', seriesId)
      .order('occurrence_number', { ascending: false })
      .limit(60);
    if (error) throw repoError(error);
    return (data as CommitmentRow[]).map(toCommitment);
  }

  /**
   * Todas as ocorrências vivas em aberto, por número crescente, sem limite: em páginas, como listCommitments,
   * porque o banco confere o conjunto inteiro nas escritas de série.
   */
  async listOpenSeriesOccurrences(seriesId: string): Promise<Commitment[]> {
    const PAGE = 500;
    const rows: CommitmentRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.db
        .from('commitment_items')
        .select('*')
        .eq('series_id', seriesId)
        .eq('status', 'aberto')
        .order('occurrence_number')
        .order('id')
        .range(from, from + PAGE - 1);
      if (error) throw repoError(error);
      rows.push(...(data as CommitmentRow[]));
      if (data.length < PAGE) break;
    }
    return rows.map(toCommitment);
  }

  /** Funções de série devolvem jsonb {series, occurrences, changed}: sem .single(). */
  private async callSeries(fn: string, args: Record<string, unknown>): Promise<SeriesWrite> {
    const { data, error } = await this.db.rpc(fn, args);
    if (error) throw repoError(error);
    const result = data as SeriesResult | null;
    if (!result?.series) throw new RepoError('desconhecido');
    return {
      series: toSeries(result.series),
      occurrences: (result.occurrences ?? []).map(toCommitment),
      changed: Number(result.changed),
    };
  }

  /**
   * p_parts_per_year só vai na conta do ano. Sem ele, o banco calcula o mesmo hash do Ciclo A: uma repetição em
   * trânsito de gasto fixo ou parcelamento continua reconhecida.
   */
  createSeries(key: string, contextId: string, input: SeriesInput) {
    return this.callSeries('create_series', {
      p_idempotency_key: key,
      p_context_id: contextId,
      p_kind: input.kind,
      p_nature: input.nature,
      p_description: input.description,
      p_category: input.category,
      p_amount_cents: input.amountCents,
      p_amount_mode: input.amountMode,
      p_due_day: input.dueDay,
      p_first_due_month: `${input.firstDueMonth}-01`,
      p_first_number: input.firstNumber,
      p_installment_total: input.installmentTotal,
      p_last_month: input.lastMonth ? `${input.lastMonth}-01` : null,
      ...(input.partsPerYear != null ? { p_parts_per_year: input.partsPerYear } : {}),
    });
  }

  updateSeriesFrom(
    key: string,
    id: string,
    expectedVersion: number,
    fromNumber: number,
    expectedAffected: AffectedRef[],
    input: SeriesEditInput,
  ) {
    return this.callSeries('update_series_from', {
      p_idempotency_key: key,
      p_series_id: id,
      p_expected_version: expectedVersion,
      p_from_number: fromNumber,
      p_expected_affected: affectedJson(expectedAffected),
      p_nature: input.nature,
      p_description: input.description,
      p_category: input.category,
      p_amount_cents: input.amountCents,
      p_amount_mode: input.amountMode,
      p_due_day: input.dueDay,
    });
  }

  endSeries(key: string, id: string, expectedVersion: number, lastNumber: number | null, expectedAffected: AffectedRef[]) {
    return this.callSeries('end_series', {
      p_idempotency_key: key,
      p_series_id: id,
      p_expected_version: expectedVersion,
      p_last_number: lastNumber,
      p_expected_affected: affectedJson(expectedAffected),
    });
  }

  deleteSeries(key: string, id: string, expectedVersion: number, expectedAffected: AffectedRef[]) {
    return this.callSeries('delete_series', {
      p_idempotency_key: key,
      p_series_id: id,
      p_expected_version: expectedVersion,
      p_expected_affected: affectedJson(expectedAffected),
    });
  }

  /**
   * Conta do ano, "Informar o valor de 2027": o ano é o da parcela `number`. O banco confere o conjunto esperado
   * (affectedByYear(…, 'informar')) e não muda a versão da série.
   */
  informSeriesYear(key: string, seriesId: string, number: number, expectedAffected: AffectedRef[], amountCents: Cents) {
    return this.callSeries('inform_series_year', {
      p_idempotency_key: key,
      p_series_id: seriesId,
      p_number: number,
      p_expected_affected: affectedJson(expectedAffected),
      p_amount_cents: amountCents,
    });
  }

  /**
   * Conta do ano, "Tirar as parcelas de 2027" e a segunda etapa de "Paguei o ano todo de uma vez": o conjunto esperado
   * vem de affectedByYear(…, 'tirar') ou de wholeYearPayment(…).affectedAfterPayment.
   */
  skipSeriesYear(key: string, seriesId: string, number: number, expectedAffected: AffectedRef[]) {
    return this.callSeries('skip_series_year', {
      p_idempotency_key: key,
      p_series_id: seriesId,
      p_number: number,
      p_expected_affected: affectedJson(expectedAffected),
    });
  }

  /** Volátil: vai por POST (padrão do rpc). Leitura basta; a autoria das contas criadas é de quem criou a série. */
  async syncSeriesOccurrences(contextId: string) {
    const { data, error } = await this.db.rpc('sync_series_occurrences', { p_context_id: contextId });
    if (error) throw repoError(error);
    const result = data as { created: number; created_overdue: number } | null;
    if (!result) throw new RepoError('desconhecido');
    return { created: Number(result.created), createdOverdue: Number(result.created_overdue) };
  }

  // -------------------------------------------------------------------------
  // Revisão dos últimos meses (D-030, Ciclo A4)
  // -------------------------------------------------------------------------

  /**
   * Atividade e marca da revisão da própria pessoa (RLS: person_id = auth.uid() e leitura no contexto). Sem linha, ou
   * sem leitura no contexto: null. O filtro por pessoa é redundante com a RLS, de propósito.
   */
  async getReturnReviewState(contextId: string): Promise<ReturnReviewState> {
    const [activity, review] = await Promise.all([
      this.db
        .from('context_activity')
        .select('last_write_on, absence_from_on, absence_until_on')
        .eq('context_id', contextId)
        .eq('person_id', this.user.id)
        .maybeSingle(),
      this.db
        .from('return_reviews')
        .select('reviewed_through, decision, decided_on, version')
        .eq('context_id', contextId)
        .eq('person_id', this.user.id)
        .maybeSingle(),
    ]);
    if (activity.error) throw repoError(activity.error);
    if (review.error) throw repoError(review.error);
    return {
      activity: activity.data ? toActivity(activity.data as ContextActivityRow) : null,
      mark: review.data ? toReviewMark(review.data as ReturnReviewRow) : null,
    };
  }

  /** Um item por mês de from a to (até 12), com zeros em mês sem anotação; mesmo critério de month_totals. */
  async monthsOverview(contextId: string, from: IsoMonth, to: IsoMonth): Promise<MonthOverview[]> {
    const { data, error } = await this.db.rpc('months_overview', { p_context_id: contextId, p_from: `${from}-01`, p_to: `${to}-01` });
    if (error) throw repoError(error);
    return ((data ?? []) as MonthOverviewRow[]).map(toMonthOverview);
  }

  /**
   * Contas vivas (abertas e pagas; a visão já tira as excluídas e as "não houve") com vencimento de from-01 até antes do
   * dia 1 do mês seguinte a to, por vencimento, criação e id. Em páginas, como listCommitments.
   */
  async listCommitmentsDueBetween(contextId: string, from: IsoMonth, to: IsoMonth): Promise<Commitment[]> {
    const start = `${from}-01`;
    const endExclusive = `${addMonths(to, 1)}-01`;
    const PAGE = 500;
    const rows: CommitmentRow[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await this.db
        .from('commitment_items')
        .select('*')
        .eq('context_id', contextId)
        .gte('due_on', start)
        .lt('due_on', endExclusive)
        .order('due_on')
        .order('created_at')
        .order('id')
        .range(offset, offset + PAGE - 1);
      if (error) throw repoError(error);
      rows.push(...(data as CommitmentRow[]));
      if (data.length < PAGE) break;
    }
    return rows.map(toCommitment);
  }

  /**
   * Conta do número n de uma série num dos 11 meses fechados anteriores ao atual: 'aberta' ou 'nao_houve' (gravada já
   * excluída só neste mês). Mesmo retorno {commitment, record: null} das funções de conta a pagar. Reconciliação:
   * findCommitmentOperation (criar_ocorrencia) ou repetir com a mesma chave e os mesmos argumentos.
   */
  createSeriesOccurrence(key: string, seriesId: string, expectedSeriesVersion: number, n: number, mode: OccurrenceMode) {
    return this.callCommitment('create_series_occurrence', {
      p_idempotency_key: key,
      p_series_id: seriesId,
      p_expected_version: expectedSeriesVersion,
      p_number: n,
      p_mode: mode,
    });
  }

  /**
   * Decisão da revisão (versão 0 = ainda não existe marca). Devolve a linha atual da marca; uma repetição com a mesma
   * chave devolve a linha atual, que pode ter versão maior.
   */
  async decideReturnReview(
    key: string,
    contextId: string,
    expectedVersion: number,
    reviewedThrough: IsoMonth,
    decision: ReturnDecision,
  ): Promise<ReturnReviewMark> {
    const { data, error } = await this.db.rpc('decide_return_review', {
      p_idempotency_key: key,
      p_context_id: contextId,
      p_expected_version: expectedVersion,
      p_reviewed_through: `${reviewedThrough}-01`,
      p_decision: decision,
    });
    if (error) throw repoError(error);
    if (!data) throw new RepoError('desconhecido');
    return toReviewMark(data as ReturnReviewRow);
  }

  // -------------------------------------------------------------------------
  // Renda de referência (D-026, Ciclo B)
  // -------------------------------------------------------------------------

  /** Referências vivas do contexto, por mês de início crescente (a RLS já tira as excluídas e o que a pessoa não lê). */
  async listIncomeReferences(contextId: string): Promise<IncomeReference[]> {
    const rows = await readAll<IncomeReferenceRow>((from, to) =>
      this.db
        .from('income_references')
        .select(INCOME_REFERENCE_COLUMNS)
        .eq('context_id', contextId)
        .is('deleted_at', null)
        .order('from_month', { ascending: true })
        .order('id')
        .range(from, to),
    );
    return rows.map(toIncomeReference);
  }

  /** As duas funções da renda de referência devolvem jsonb (a linha): sem .single(). */
  private async callReference(fn: string, args: Record<string, unknown>): Promise<IncomeReference> {
    const { data, error } = await this.db.rpc(fn, args);
    if (error) throw repoError(error);
    if (!data) throw new RepoError('desconhecido');
    return toIncomeReference(data as IncomeReferenceRow);
  }

  /**
   * Versão 0 cria a referência do mês; a versão atual altera. O mês vai como AAAA-MM-01. Uma repetição com a mesma chave e o
   * mesmo conteúdo devolve a linha atual, que pode ser mais nova (ou até excluída): é assim que se reconcilia um resultado incerto.
   */
  setIncomeReference(key: string, contextId: string, fromMonth: IsoMonth, expectedVersion: number, amountCents: Cents, varies: boolean) {
    return this.callReference('set_income_reference', {
      p_idempotency_key: key,
      p_context_id: contextId,
      p_from_month: `${fromMonth}-01`,
      p_expected_version: expectedVersion,
      p_amount_cents: amountCents,
      p_varies: varies,
    });
  }

  /** Exclusão lógica: devolve a referência excluída (versão + 1). A anterior volta a valer. */
  deleteIncomeReference(key: string, id: string, expectedVersion: number) {
    return this.callReference('delete_income_reference', {
      p_idempotency_key: key,
      p_id: id,
      p_expected_version: expectedVersion,
    });
  }

  // -------------------------------------------------------------------------
  // Metas e reserva para imprevistos (D-027, Ciclo C)
  // -------------------------------------------------------------------------

  /** Metas vivas do contexto, de todas as situações, por criação, com os totais dos movimentos (goal_items). */
  async listGoals(contextId: string): Promise<Goal[]> {
    const rows = await readAll<GoalRow>((from, to) =>
      this.db.from('goal_items').select('*').eq('context_id', contextId).order('created_at').order('id').range(from, to),
    );
    return rows.map(toGoal);
  }

  async getGoal(id: string): Promise<Goal | null> {
    const { data, error } = await this.db.from('goal_items').select('*').eq('id', id).maybeSingle();
    if (error) throw repoError(error);
    return data ? toGoal(data as GoalRow) : null;
  }

  /** Movimentos vivos da meta, do mais recente ao mais antigo (data, criação, id). */
  async listGoalMovements(goalId: string): Promise<GoalMovement[]> {
    const rows = await readAll<GoalMovementRow>((from, to) =>
      this.db
        .from('goal_movements')
        .select(GOAL_MOVEMENT_COLUMNS)
        .eq('goal_id', goalId)
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to),
    );
    return rows.map(toGoalMovement);
  }

  /** Movimentos vivos de todas as metas do contexto com data no mês, do mais recente ao mais antigo. */
  async listGoalMovementsInMonth(contextId: string, month: IsoMonth): Promise<GoalMovement[]> {
    const { start, endExclusive } = monthRange(month);
    const rows = await readAll<GoalMovementRow>((from, to) =>
      this.db
        .from('goal_movements')
        .select(GOAL_MOVEMENT_COLUMNS)
        .eq('context_id', contextId)
        .gte('occurred_on', start)
        .lt('occurred_on', endExclusive)
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to),
    );
    return rows.map(toGoalMovement);
  }

  /** As sete funções de metas devolvem jsonb {goal, movement}: sem .single(). */
  private async callGoal(fn: string, args: Record<string, unknown>): Promise<GoalWrite> {
    const { data, error } = await this.db.rpc(fn, args);
    if (error) throw repoError(error);
    const result = data as GoalResult | null;
    if (!result?.goal) throw new RepoError('desconhecido');
    return { goal: toGoal(result.goal), movement: result.movement ? toGoalMovement(result.movement) : null };
  }

  /** Os campos da meta, na ordem dos argumentos das funções (o prazo vai como AAAA-MM-01). */
  private goalFields(input: GoalInput) {
    return {
      p_goal_type: input.goalType,
      p_name: input.name,
      p_target_cents: input.targetCents,
      p_target_month: input.targetMonth ? `${input.targetMonth}-01` : null,
      p_planned_monthly_cents: input.plannedMonthlyCents,
      p_essential_base_cents: input.essentialBaseCents,
      p_essential_months: input.essentialMonths,
      p_essential_base_source: input.essentialBaseSource,
    };
  }

  createGoal(key: string, contextId: string, input: NewGoalInput) {
    return this.callGoal('create_goal', {
      p_idempotency_key: key,
      p_context_id: contextId,
      ...this.goalFields(input),
      p_initial_cents: input.initialCents ?? null,
      p_initial_on: input.initialOn ?? null,
    });
  }

  updateGoal(key: string, goalId: string, expectedVersion: number, input: GoalInput) {
    return this.callGoal('update_goal', {
      p_idempotency_key: key,
      p_goal_id: goalId,
      p_expected_version: expectedVersion,
      ...this.goalFields(input),
    });
  }

  setGoalStatus(key: string, goalId: string, expectedVersion: number, status: GoalStatus) {
    return this.callGoal('set_goal_status', {
      p_idempotency_key: key,
      p_goal_id: goalId,
      p_expected_version: expectedVersion,
      p_status: status,
    });
  }

  deleteGoal(key: string, goalId: string, expectedVersion: number) {
    return this.callGoal('delete_goal', { p_idempotency_key: key, p_goal_id: goalId, p_expected_version: expectedVersion });
  }

  /** Sem versão (como create_record): a versão da meta não sobe. saldo_da_meta_insuficiente traz o dia em RepoError.detail. */
  addGoalMovement(key: string, goalId: string, kind: GoalMovementKind, input: GoalMovementInput) {
    return this.callGoal('add_goal_movement', {
      p_idempotency_key: key,
      p_goal_id: goalId,
      p_kind: kind,
      p_amount_cents: input.amountCents,
      p_occurred_on: input.occurredOn,
      p_note: input.note,
    });
  }

  updateGoalMovement(key: string, movementId: string, expectedVersion: number, input: GoalMovementInput) {
    return this.callGoal('update_goal_movement', {
      p_idempotency_key: key,
      p_movement_id: movementId,
      p_expected_version: expectedVersion,
      p_amount_cents: input.amountCents,
      p_occurred_on: input.occurredOn,
      p_note: input.note,
    });
  }

  deleteGoalMovement(key: string, movementId: string, expectedVersion: number) {
    return this.callGoal('delete_goal_movement', {
      p_idempotency_key: key,
      p_movement_id: movementId,
      p_expected_version: expectedVersion,
    });
  }

  /**
   * Só operações de metas, da própria pessoa. Nas ações de meta, target_id é a meta. Nas de movimento, é o movimento e a meta
   * sai de goal_movements; como a RLS esconde movimento excluído (e o de meta excluída), nesse caso goalId vem vazio: quem
   * chama já sabe qual meta estava aberta, e a tela recarrega as metas inteiras.
   */
  async findGoalOperation(key: string) {
    const { data, error } = await this.db
      .from('record_operations')
      .select('action, target_id')
      .eq('idempotency_key', key)
      .in('action', GOAL_ACTIONS)
      .maybeSingle();
    if (error) throw repoError(error);
    if (!data) return null;
    const action = data.action as GoalAction;
    const target = data.target_id as string | null;
    if (!target) throw new RepoError('desconhecido', 'operacao_inconsistente');
    if (!GOAL_MOVEMENT_ACTIONS.includes(action)) return { action, goalId: target, movementId: null };
    const movement = await this.db.from('goal_movements').select('goal_id').eq('id', target).maybeSingle();
    if (movement.error) throw repoError(movement.error);
    return { action, goalId: (movement.data?.goal_id as string | undefined) ?? '', movementId: target };
  }

  // -------------------------------------------------------------------------
  // Plano de guardar (D-036)
  // -------------------------------------------------------------------------

  /** Resposta da própria pessoa no contexto, ou null (nunca respondeu). A RLS já limita à pessoa; o filtro é redundante de propósito. */
  async getSavingsCheck(contextId: string): Promise<SavingsCheck | null> {
    const { data, error } = await this.db
      .from('savings_checks')
      .select(SAVINGS_CHECK_COLUMNS)
      .eq('context_id', contextId)
      .eq('person_id', this.user.id)
      .maybeSingle();
    if (error) throw repoError(error);
    return data ? toSavingsCheck(data as SavingsCheckRow) : null;
  }

  /**
   * Versão 0 = ainda não há resposta. As datas de volta são do banco (o app não manda data). Uma repetição com a mesma chave e o
   * mesmo conteúdo devolve a linha atual: é assim que se reconcilia um resultado incerto.
   */
  async setSavingsAnswer(key: string, contextId: string, expectedVersion: number, answer: SavingsAnswer, monthlyCents: Cents | null = null) {
    const { data, error } = await this.db.rpc('set_savings_answer', {
      p_idempotency_key: key,
      p_context_id: contextId,
      p_expected_version: expectedVersion,
      p_answer: answer,
      p_monthly_cents: monthlyCents ?? null,
    });
    if (error) throw repoError(error);
    if (!data) throw new RepoError('desconhecido');
    return toSavingsCheck(data as SavingsCheckRow);
  }
}
