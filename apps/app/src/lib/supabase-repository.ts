import {
  ACCOUNT_KINDS,
  ACCOUNT_NAME_MAX,
  BUDGET_CATEGORIES,
  BUDGET_MAX_CENTS,
  BUDGET_MIN_CENTS,
  ESSENTIAL_BASE_SOURCES,
  GOAL_MOVEMENT_KINDS,
  GOAL_NOTE_MAX,
  GOAL_STATUSES,
  GOAL_TYPES,
  MAX_RECORD_CENTS,
  NO_CATEGORY_LABEL,
  PARTS_PER_YEAR_MAX,
  RepoError,
  SAVINGS_ANSWERS,
  SAVINGS_MIN_MONTHLY_CENTS,
  SEARCH_LIMIT,
  searchTermPattern,
  activeAccounts,
  addMonths,
  monthRange,
  receiptKeyValid,
  type AccountAction,
  type AccountInput,
  type AccountKind,
  type AccountStatus,
  type AffectedRef,
  type AmountMode,
  type Card,
  type CardAction,
  type CardChargeInput,
  type CardChargeType,
  type CardEntry,
  type CardEntryInput,
  type CardEntryKind,
  type CardInput,
  type CardPurchaseInput,
  type CardRefundInput,
  type CardStatus,
  type CardWrite,
  type CategoryBudget,
  type Cents,
  type Commitment,
  type CommitmentAction,
  type CommitmentInput,
  type CommitmentLimit,
  type CommitmentSeries,
  type CommitmentWrite,
  type ContextActivity,
  type FinancialAccount,
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
  type InvoiceItem,
  type InvoicePaymentWrite,
  type IsoDate,
  type IsoMonth,
  type MonthBudgetRead,
  type MonthOverview,
  type NewGoalInput,
  type OccurrenceMode,
  type PaymentRequest,
  type PersonalSpace,
  type RecordInput,
  type RecordSearchFilter,
  type RecordKind,
  type ReceiptMatch,
  type RecordsRepository,
  type RepoErrorCode,
  type ReturnDecision,
  type ReturnReviewMark,
  type ReturnReviewState,
  type SavingsAnswer,
  type SavingsCheck,
  type SearchPage,
  type SeriesAction,
  type SubscriptionReviewWrite,
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

/** Linha de financial_accounts (e retorno jsonb das cinco funções de contas). */
interface AccountRow {
  id: string;
  context_id: string;
  name: string;
  currency: string;
  status: AccountStatus;
  initial_balance_cents: number | null;
  kind: AccountKind;
  is_default: boolean;
  version: number;
}

const ACCOUNT_COLUMNS = 'id, context_id, name, currency, status, initial_balance_cents, kind, is_default, version';
/** Ações de contas: a conta em target_id. */
const ACCOUNT_ACTIONS: AccountAction[] = ['criar_conta', 'alterar_conta', 'conta_principal', 'situacao_conta', 'excluir_conta'];

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
  /** Pagamento de fatura (pay_invoice): cartão e mês de vencimento (AAAA-MM-01); nulos nos outros gastos. */
  card_id: string | null;
  invoice_month: string | null;
  /** Resumo SHA-256 da chave da nota (64 hexadecimais minúsculos), nunca a chave. */
  receipt_key: string | null;
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
  /** Conta de fatura de cartão: cartão, mês de vencimento (AAAA-MM-01) e fechamento gravado; nulos nas outras contas. */
  card_id: string | null;
  invoice_month: string | null;
  card_closing_on: string | null;
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
  /**
   * Assinaturas (D-046, migração 0011): ausentes enquanto a 0011 não foi colada (o app novo com o banco antigo): valem falso e nulo,
   * e nada quebra. subscription_reviewed_on: AAAA-MM-DD.
   */
  subscription?: boolean | null;
  subscription_reviewed_on?: string | null;
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

/** Linha de category_budgets (e retorno de set/delete_category_budget, que traz também deleted_at e deleted_by). */
interface CategoryBudgetRow {
  id: string;
  context_id: string;
  category: string;
  /** Sempre o dia 1 (AAAA-MM-01). */
  from_month: string;
  /** null: a linha que encerra a vigência ("Tirar o orçamento a partir de"). */
  amount_cents: number | null;
  created_by: string;
  version: number;
  created_at: string;
  updated_at: string;
}

/** Linha de commitment_limits (e retorno de set/delete_commitment_limit). */
interface CommitmentLimitRow {
  id: string;
  context_id: string;
  from_month: string;
  /** null: a linha que encerra a vigência ("Tirar o limite a partir de"). */
  percent: number | null;
  created_by: string;
  version: number;
  created_at: string;
  updated_at: string;
}

/** Linha de month_budget: o orçamento vigente (nulos sem linha; budget_cents nulo se a vigente foi encerrada) e o usado no mês. */
interface MonthBudgetRow {
  category: string;
  budget_id: string | null;
  budget_version: number | null;
  budget_from: string | null;
  budget_cents: number | null;
  used_cents: number;
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
  /** Origem do aporte ou destino do resgate (D-043); nulo nos outros tipos. */
  account_id: string | null;
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

/** Linha da visão card_items (e o cartão do retorno das funções de cartão, que traz também deleted_at e deleted_by). */
interface CardRow {
  id: string;
  context_id: string;
  nickname: string;
  last_digits: string | null;
  closing_day: number;
  due_day: number;
  limit_cents: number | null;
  status: CardStatus;
  created_by: string;
  version: number;
  created_at: string;
  updated_at: string;
  used_cents: number;
  /** A fatura que recebe uma compra de hoje: mês de vencimento (AAAA-MM-01), fechamento e vencimento. */
  current_month: string;
  current_closing_on: string;
  current_due_on: string;
}

/** Linha da visão card_entry_items (e o lançamento do retorno das funções de cartão). A compra é UMA linha, com o valor total. */
interface CardEntryRow {
  id: string;
  context_id: string;
  card_id: string;
  kind: CardEntryKind;
  description: string | null;
  category: string | null;
  charge_kind: CardChargeType | null;
  purchased_on: string | null;
  amount_cents: number;
  installments: number;
  invoice_month: string;
  source_month: string | null;
  payment_record_id: string | null;
  receipt_key: string | null;
  created_by: string;
  version: number;
  created_at: string;
  updated_at: string;
}

/** Linha da visão invoice_items: uma por fatura que tem lançamento vivo ou conta viva. */
interface InvoiceItemRow {
  card_id: string;
  context_id: string;
  month: string;
  closing_on: string;
  due_on: string;
  status: InvoiceItem['status'];
  total_cents: number;
  purchases_cents: number;
  charges_cents: number;
  carried_in_cents: number;
  refunds_cents: number;
  credit_cents: number;
  entry_count: number;
  commitment_id: string | null;
  commitment_version: number | null;
  amount_is_estimate: boolean;
  to_pay_cents: number;
  paid_record_id: string | null;
  paid_cents: number | null;
  paid_on: string | null;
  paid_account_id: string | null;
  left_over_cents: number | null;
}

/** Retorno (jsonb) das 11 funções de cartão. Só as chaves que o app usa; entries (linhas cruas das parcelas) fica de fora. */
interface CardResult {
  card: CardRow | null;
  entry: CardEntryRow | null;
  invoices: InvoiceItemRow[] | null;
  commitments: CommitmentRow[] | null;
  commitment: CommitmentRow | null;
  record: RecordRow | null;
}

const CATEGORY_BUDGET_COLUMNS = 'id, context_id, category, from_month, amount_cents, created_by, version, created_at, updated_at';
const COMMITMENT_LIMIT_COLUMNS = 'id, context_id, from_month, percent, created_by, version, created_at, updated_at';
const INCOME_REFERENCE_COLUMNS = 'id, context_id, from_month, amount_cents, varies, created_by, version, created_at, updated_at, amount_changed_at';
const GOAL_MOVEMENT_COLUMNS = 'id, goal_id, context_id, kind, amount_cents, occurred_on, note, account_id, created_by, version, created_at, updated_at';
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
const SERIES_ACTIONS: SeriesAction[] = [
  'criar_serie',
  'alterar_serie',
  'encerrar_serie',
  'excluir_serie',
  'informar_ano',
  'tirar_ano',
  // Assinaturas (D-046): o alvo (target_id) também é a série.
  'marcar_assinatura',
];
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
/** Ações de cartão: o cartão em target_id; entry_id só nas cinco ações de lançamento. */
const CARD_ACTIONS: CardAction[] = [
  'criar_cartao',
  'alterar_cartao',
  'situacao_cartao',
  'excluir_cartao',
  'criar_compra_cartao',
  'alterar_lancamento_cartao',
  'excluir_lancamento_cartao',
  'criar_encargo_cartao',
  'criar_estorno_cartao',
  'pagar_fatura',
  'desfazer_pagamento_fatura',
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
  // Contas de origem (D-043). Nenhum é sufixo de outro código da lista, nem tem outro como sufixo.
  'tipo_da_conta_invalido',
  'nome_da_conta_repetido',
  'limite_de_contas',
  'conta_principal',
  'ultima_conta_ativa',
  'conta_com_lancamentos',
  'conta_arquivada',
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
  // Orçamento por categoria e limite pessoal (D-041). Nenhum é sufixo de outro código da lista, nem tem outro como sufixo.
  'vigencia_fora_do_intervalo',
  'percentual_invalido',
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
  // Cartões de crédito e notas fiscais (D-037 e D-038). Nenhum termina com outro código da lista (valor_acima_da_fatura,
  // fatura_paga, fatura_aberta e fatura_seguinte_paga são diferentes até o fim; os "_invalido" têm prefixos próprios), com uma
  // exceção: dias_com_fatura_paga termina com fatura_paga, e o mais longo vence em repoError.
  'conta_de_fatura',
  'pagamento_de_fatura',
  'fatura_paga',
  'fatura_aberta',
  'fatura_seguinte_paga',
  'dias_com_fatura_paga',
  'valor_acima_da_fatura',
  'lancamento_automatico',
  'campo_nao_se_aplica',
  'apelido_invalido',
  'final_invalido',
  'dia_de_fechamento_invalido',
  'dia_de_vencimento_invalido',
  'limite_invalido',
  'limite_de_cartoes',
  'limite_de_lancamentos',
  'cartao_arquivado',
  'cartao_com_lancamentos',
  'tipo_de_encargo_invalido',
  'chave_de_nota_invalida',
  'nota_ja_anotada',
  // Assinaturas (D-046). Nenhum é sufixo de outro código da lista, nem tem outro como sufixo.
  'marca_invalida',
  'assinatura_so_gasto_fixo',
];

/**
 * Códigos que o banco só lança em escrita direta na tabela (23514), nunca pelas funções: defeito de consistência, não recusa.
 * Viram 'desconhecido' com o nome como mensagem (sem valores), para a tela mostrar o erro genérico.
 */
const INCONSISTENCY_CODES = ['fatura_inconsistente', 'compra_inconsistente'];

/**
 * Dos detalhes do banco, só três seguem adiante, e só para montar uma mensagem ou abrir o registro: "dia=AAAA-MM-DD" (primeiro
 * dia em que o valor guardado ficaria negativo), "versao_atual=N" e, em nota_ja_anotada, "registro=<id>" ou "compra=<id>".
 * Qualquer outro texto é descartado.
 */
function safeDetail(code: RepoErrorCode, details: string | null | undefined): string | undefined {
  if (typeof details !== 'string') return undefined;
  if (code === 'saldo_da_meta_insuficiente' && /^dia=\d{4}-\d{2}-\d{2}$/.test(details)) return details;
  if (code === 'versao_desatualizada' && /^versao_atual=\d{1,9}$/.test(details)) return details;
  if (code === 'nota_ja_anotada' && /^(registro|compra)=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(details)) return details;
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
  const broken = INCONSISTENCY_CODES.find((k) => msg === k || msg.endsWith(k));
  if (broken) return new RepoError('desconhecido', broken);
  if (e?.code === '42501') return new RepoError('sem_permissao');
  if (/fetch|network|Failed to fetch|timeout/i.test(msg) || !e?.code) return new RepoError('rede');
  return new RepoError('desconhecido', msg);
}

/** Mês do vencimento da fatura: o banco devolve o dia 1 (AAAA-MM-01); o core usa AAAA-MM. */
function invoiceMonthOf(v: string | null | undefined): IsoMonth {
  if (typeof v !== 'string' || !FIRST_DAY.test(v)) throw new RepoError('desconhecido', 'fatura_inconsistente');
  return v.slice(0, 7);
}

/** Cartão e mês juntos ou nenhum dos dois; o resumo da nota, quando existe, tem a forma do banco (nunca a chave de 44 caracteres). */
function toRecord(r: RecordRow): FinancialRecord {
  const cardId = r.card_id ?? null;
  const month = r.invoice_month ?? null;
  const receiptKey = r.receipt_key ?? null;
  if ((cardId === null) !== (month === null)) throw new RepoError('desconhecido', 'fatura_inconsistente');
  if (receiptKey !== null && !receiptKeyValid(receiptKey)) throw new RepoError('desconhecido', 'nota_inconsistente');
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
    invoice: cardId !== null && month !== null ? { cardId, month: invoiceMonthOf(month) } : null,
    receiptKey,
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
    : // A conta de fatura aberta é "estimada" até o fechamento (amount_is_estimate), sem ser de série.
      c.occurrence_number == null && !c.series_override && (c.card_id != null || !c.amount_is_estimate);
  if (!seriesConsistent) throw new RepoError('desconhecido', 'serie_inconsistente');
  const partsPerYear = inSeries ? partsPerYearOf(c.series_kind!, c.series_parts_per_year) : null;
  // Conta de fatura: cartão, mês e fechamento juntos ou nenhum dos três, e nunca de série.
  const cardId = c.card_id ?? null;
  const closingOn = c.card_closing_on ?? null;
  if ((cardId === null) !== (c.invoice_month == null) || (cardId === null) !== (closingOn === null)) {
    throw new RepoError('desconhecido', 'fatura_inconsistente');
  }
  if (cardId !== null && (inSeries || !ISO_DATE.test(closingOn!))) throw new RepoError('desconhecido', 'fatura_inconsistente');
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
    invoice: cardId !== null ? { cardId, month: invoiceMonthOf(c.invoice_month), closingOn: closingOn! } : null,
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
    subscription: s.subscription === true,
    subscriptionReviewedOn: s.subscription === true && typeof s.subscription_reviewed_on === 'string' ? s.subscription_reviewed_on.slice(0, 10) : null,
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

/** Orçamento de uma categoria: categoria entre as seis, mês no dia 1, valor nulo ou de R$ 1,00 a R$ 9.999.999,99 e versão a partir de 1. */
function toCategoryBudget(r: CategoryBudgetRow): CategoryBudget {
  const amountCents = wholeOrNull(r.amount_cents);
  const version = whole(r.version);
  const consistent =
    BUDGET_CATEGORIES.includes(r.category) &&
    FIRST_DAY.test(r.from_month) &&
    (amountCents === null || (amountCents >= BUDGET_MIN_CENTS && amountCents <= BUDGET_MAX_CENTS)) &&
    version >= 1;
  if (!consistent) throw new RepoError('desconhecido', 'orcamento_inconsistente');
  return {
    id: r.id,
    contextId: r.context_id,
    category: r.category,
    fromMonth: r.from_month.slice(0, 7),
    amountCents,
    createdBy: r.created_by,
    version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Limite pessoal: mês no dia 1, percentual nulo ou inteiro de 10 a 100 e versão a partir de 1. */
function toCommitmentLimit(r: CommitmentLimitRow): CommitmentLimit {
  const percent = r.percent === null ? null : whole(r.percent);
  const version = whole(r.version);
  if (!FIRST_DAY.test(r.from_month) || (percent !== null && (percent < 10 || percent > 100)) || version < 1) throw new RepoError('desconhecido', 'limite_inconsistente');
  return {
    id: r.id,
    contextId: r.context_id,
    fromMonth: r.from_month.slice(0, 7),
    percent,
    createdBy: r.created_by,
    version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * month_budget: sempre as seis categorias, na ordem de BUDGET_CATEGORIES; orçamento (id, versão, mês e valor) e usado coerentes.
 * Uma lista incompleta ou fora de ordem nunca aparece como um orçamento zerado.
 */
function toMonthBudget(month: IsoMonth, rows: readonly MonthBudgetRow[]): MonthBudgetRead {
  if (rows.length !== BUDGET_CATEGORIES.length) throw new RepoError('desconhecido', 'orcamento_inconsistente');
  return {
    month,
    lines: rows.map((r, i) => {
      const budgetCents = wholeOrNull(r.budget_cents);
      const budgetVersion = wholeOrNull(r.budget_version);
      const usedCents = whole(r.used_cents);
      const hasRow = r.budget_id !== null;
      const consistent =
        r.category === BUDGET_CATEGORIES[i] &&
        usedCents >= 0 &&
        hasRow === (r.budget_from !== null) &&
        hasRow === (budgetVersion !== null) &&
        (r.budget_from === null || FIRST_DAY.test(r.budget_from)) &&
        (budgetCents === null || (hasRow && budgetCents >= BUDGET_MIN_CENTS && budgetCents <= BUDGET_MAX_CENTS));
      if (!consistent) throw new RepoError('desconhecido', 'orcamento_inconsistente');
      return {
        category: r.category,
        budgetId: r.budget_id,
        budgetVersion,
        budgetFrom: r.budget_from === null ? null : r.budget_from.slice(0, 7),
        budgetCents,
        usedCents,
      };
    }),
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

/** Conta: tipo e situação da lista, nome de 1 a 40 caracteres e versão a partir de 1 (financial_accounts). */
function toAccount(a: AccountRow): FinancialAccount {
  const consistent =
    ACCOUNT_KINDS.includes(a.kind) &&
    (a.status === 'ativa' || a.status === 'arquivada') &&
    typeof a.name === 'string' &&
    [...a.name].length >= 1 &&
    [...a.name].length <= ACCOUNT_NAME_MAX &&
    Number.isInteger(Number(a.version)) &&
    Number(a.version) >= 1 &&
    (a.is_default !== true || a.status === 'ativa');
  if (!consistent) throw new RepoError('desconhecido', 'conta_inconsistente');
  return {
    id: a.id,
    contextId: a.context_id,
    name: a.name,
    currency: 'BRL',
    initialBalanceCents: a.initial_balance_cents === null || a.initial_balance_cents === undefined ? null : Number(a.initial_balance_cents),
    kind: a.kind,
    status: a.status,
    isDefault: a.is_default === true,
    version: Number(a.version),
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
  // A conta só existe em aporte e resgate (goal_movements_conta).
  const accountId = m.account_id ?? null;
  if (!consistent || (accountId !== null && m.kind !== 'aporte' && m.kind !== 'resgate')) throw new RepoError('desconhecido', 'movimento_inconsistente');
  return {
    id: m.id,
    goalId: m.goal_id,
    contextId: m.context_id,
    kind: m.kind,
    amountCents,
    occurredOn: m.occurred_on,
    note: m.note,
    accountId,
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

const CARD_STATUSES: readonly CardStatus[] = ['ativo', 'arquivado'];
const CARD_ENTRY_KINDS: readonly CardEntryKind[] = ['compra', 'encargo', 'estorno', 'saldo_anterior'];
const CARD_CHARGE_TYPES: readonly CardChargeType[] = ['juros', 'multa', 'iof', 'anuidade', 'tarifa'];
const INVOICE_STATUSES: readonly InvoiceItem['status'][] = ['aberta', 'fechada', 'paga', 'paga_em_parte'];

/**
 * Cartão (card_items). O banco só guarda o apelido e os 4 últimos dígitos: qualquer outra forma de final é recusada aqui
 * (nunca mostrar nem repassar algo que pareça um número de cartão). O apelido do banco vira name.
 */
function toCard(c: CardRow): Card {
  const closingDay = whole(c.closing_day);
  const dueDay = whole(c.due_day);
  const limit = wholeOrNull(c.limit_cents);
  const consistent =
    CARD_STATUSES.includes(c.status) &&
    (c.last_digits === null || /^\d{4}$/.test(c.last_digits)) &&
    closingDay >= 1 &&
    closingDay <= 31 &&
    dueDay >= 1 &&
    dueDay <= 31 &&
    (limit === null || limit >= 1) &&
    ISO_DATE.test(c.current_closing_on) &&
    ISO_DATE.test(c.current_due_on);
  if (!consistent) throw new RepoError('desconhecido', 'cartao_inconsistente');
  return {
    id: c.id,
    contextId: c.context_id,
    name: c.nickname,
    lastDigits: c.last_digits ?? null,
    closingDay,
    dueDay,
    limitCents: limit,
    status: c.status,
    createdBy: c.created_by,
    version: whole(c.version),
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    usedCents: whole(c.used_cents),
    currentMonth: invoiceMonthOf(c.current_month),
    currentClosingOn: c.current_closing_on,
    currentDueOn: c.current_due_on,
  };
}

/**
 * Lançamento do cartão (card_entry_items). A compra é uma linha, com o valor total, as parcelas e a fatura da 1ª parcela;
 * só a compra tem data de compra e só o encargo tem tipo. O resumo da chave da nota, quando existe, só vale na compra e tem a
 * forma do banco.
 */
function toCardEntry(e: CardEntryRow): CardEntry {
  const amountCents = whole(e.amount_cents);
  const installments = whole(e.installments);
  const purchase = e.kind === 'compra';
  const receiptKey = e.receipt_key ?? null;
  const consistent =
    CARD_ENTRY_KINDS.includes(e.kind) &&
    amountCents >= 1 &&
    installments >= 1 &&
    installments <= 48 &&
    (purchase ? e.purchased_on != null && ISO_DATE.test(e.purchased_on) : e.purchased_on == null && installments === 1) &&
    (e.kind === 'encargo' ? e.charge_kind != null && CARD_CHARGE_TYPES.includes(e.charge_kind) : e.charge_kind == null) &&
    (receiptKey === null || (purchase && receiptKeyValid(receiptKey)));
  if (!consistent) throw new RepoError('desconhecido', 'lancamento_inconsistente');
  return {
    id: e.id,
    contextId: e.context_id,
    cardId: e.card_id,
    kind: e.kind,
    description: e.description ?? null,
    category: e.category ?? null,
    chargeType: e.charge_kind ?? null,
    purchasedOn: e.purchased_on ?? null,
    amountCents,
    installments,
    invoiceMonth: invoiceMonthOf(e.invoice_month),
    sourceMonth: e.source_month == null ? null : invoiceMonthOf(e.source_month),
    paymentRecordId: e.payment_record_id ?? null,
    receiptKey,
    createdBy: e.created_by,
    version: whole(e.version),
    createdAt: e.created_at,
    updatedAt: e.updated_at,
  };
}

/** Fatura (invoice_items). Com conta, id e versão vêm juntos; sem conta (total <= 0), nada a pagar e nenhum pagamento. */
function toInvoiceItem(i: InvoiceItemRow): InvoiceItem {
  const commitmentVersion = wholeOrNull(i.commitment_version);
  const toPayCents = whole(i.to_pay_cents);
  const consistent =
    INVOICE_STATUSES.includes(i.status) &&
    ISO_DATE.test(i.closing_on) &&
    ISO_DATE.test(i.due_on) &&
    (i.commitment_id === null) === (commitmentVersion === null) &&
    typeof i.amount_is_estimate === 'boolean' &&
    toPayCents >= 0 &&
    ((i.status === 'paga' || i.status === 'paga_em_parte') === (i.paid_record_id != null));
  if (!consistent) throw new RepoError('desconhecido', 'fatura_inconsistente');
  return {
    cardId: i.card_id,
    month: invoiceMonthOf(i.month),
    closingOn: i.closing_on,
    dueOn: i.due_on,
    status: i.status,
    totalCents: whole(i.total_cents),
    purchasesCents: whole(i.purchases_cents),
    chargesCents: whole(i.charges_cents),
    carriedInCents: whole(i.carried_in_cents),
    refundsCents: whole(i.refunds_cents),
    creditCents: whole(i.credit_cents),
    entryCount: whole(i.entry_count),
    commitmentId: i.commitment_id ?? null,
    commitmentVersion,
    amountIsEstimate: i.amount_is_estimate,
    toPayCents,
    paidRecordId: i.paid_record_id ?? null,
    paidCents: wholeOrNull(i.paid_cents),
    paidOn: i.paid_on ?? null,
    paidAccountId: i.paid_account_id ?? null,
    leftOverCents: wholeOrNull(i.left_over_cents),
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

/**
 * Até `limit` linhas, em páginas de 500 (a API limita cada resposta), pedindo uma a mais para saber se havia mais:
 * `truncated` é verdadeiro só quando existe pelo menos uma linha além do limite. Páginas por posição podem repetir uma linha se
 * algo mudar entre os pedidos: as repetidas (mesmo id) saem, mantendo a ordem em que chegaram.
 */
async function readUpTo<T extends { id: string }>(
  limit: number,
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message?: string; code?: string; details?: string | null } | null }>,
): Promise<SearchPage<T>> {
  const PAGE = 500;
  const want = limit + 1;
  const rows: T[] = [];
  const seen = new Set<string>();
  // `from` anda pelas linhas lidas (repetidas incluídas); cada pedido traz no máximo o que ainda falta.
  for (let from = 0; rows.length < want; ) {
    const size = Math.min(PAGE, want - rows.length);
    const { data, error } = await fetchPage(from, from + size - 1);
    if (error) throw repoError(error);
    for (const row of data ?? []) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
    }
    if ((data?.length ?? 0) < size) break;
    from += size;
  }
  return { items: rows.slice(0, limit), truncated: rows.length > limit };
}

/** Filtros da busca (período, categoria, valor e texto) sobre a coluna de data da tabela; `Sem categoria` pede a coluna nula. */
function searchFilters<
  Q extends {
    gte(column: string, value: unknown): Q;
    lte(column: string, value: unknown): Q;
    eq(column: string, value: unknown): Q;
    is(column: string, value: null): Q;
    ilike(column: string, pattern: string): Q;
  },
>(query: Q, filter: RecordSearchFilter, dateColumn: string): Q {
  let q = query;
  if (filter.from !== null) q = q.gte(dateColumn, filter.from);
  if (filter.to !== null) q = q.lte(dateColumn, filter.to);
  if (filter.category !== null) q = filter.category === NO_CATEGORY_LABEL ? q.is('category', null) : q.eq('category', filter.category);
  if (filter.minCents !== null) q = q.gte('amount_cents', filter.minCents);
  if (filter.maxCents !== null) q = q.lte('amount_cents', filter.maxCents);
  // Texto: um ILIKE por palavra (todas precisam aparecer), mais largo que a conferência exata do aparelho; assim o limite de
  // linhas vale só para o que combina. O texto vai na consulta e não é guardado em lugar nenhum.
  for (const term of filter.terms) q = q.ilike('description', searchTermPattern(term));
  return q;
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
    // Só as contas ativas, a principal primeiro (os seletores e a conta que vem marcada). A RLS já esconde as excluídas.
    const accounts = await this.db
      .from('financial_accounts')
      .select(ACCOUNT_COLUMNS)
      .eq('context_id', ctx.data.id)
      .eq('status', 'ativa')
      .order('is_default', { ascending: false })
      .order('created_at')
      .order('id');
    if (accounts.error) throw repoError(accounts.error);
    if (accounts.data.length === 0) return null;
    return {
      personId: person.data.id,
      displayName: person.data.display_name,
      timeZone: person.data.time_zone,
      personalContextId: ctx.data.id,
      accounts: (accounts.data as AccountRow[]).map(toAccount),
    };
  }

  async ensurePersonalSpace(accountName: string, timeZone?: string) {
    const { error } = await this.db.rpc('ensure_personal_space', { p_account_name: accountName, p_time_zone: timeZone ?? null });
    if (error) throw repoError(error);
    const space = await this.getSpace();
    if (!space) throw new RepoError('desconhecido');
    return space;
  }

  /** A renomeação direta (update (name)) que o app publicado antes da 0010 faz; o app novo usa updateAccount. */
  async renameAccount(accountId: string, name: string) {
    const { error, count } = await this.db.from('financial_accounts').update({ name: name.trim() }, { count: 'exact' }).eq('id', accountId);
    if (error) {
      if (error.code === '23514') throw new RepoError('nome_da_conta_invalido');
      if (error.code === '23505') throw new RepoError('nome_da_conta_repetido');
      throw repoError(error);
    }
    if (count === 0) throw new RepoError('nao_encontrado');
  }

  // -------------------------------------------------------------------------
  // Contas de origem do dinheiro (D-043): as cinco funções da migração 0010
  // -------------------------------------------------------------------------

  /** Contas não excluídas do contexto: ativas (a principal primeiro) e arquivadas (por criação). */
  async listAccounts(contextId: string): Promise<FinancialAccount[]> {
    const rows = await readAll<AccountRow>((from, to) =>
      this.db
        .from('financial_accounts')
        .select(ACCOUNT_COLUMNS)
        .eq('context_id', contextId)
        // 'ativa' vem depois de 'arquivada' na ordem do texto: descendente põe as ativas antes, a principal no topo.
        .order('status', { ascending: false })
        .order('is_default', { ascending: false })
        .order('created_at')
        .order('id')
        .range(from, to),
    );
    // A ordem final não depende do agrupamento do banco: ativas primeiro (a principal no topo), depois as arquivadas.
    const all = rows.map(toAccount);
    return [...activeAccounts(all), ...all.filter((a) => a.status === 'arquivada')];
  }

  /** As cinco funções devolvem a conta em jsonb (na repetição, a conta atual): sem .single(). */
  private async callAccount(fn: string, args: Record<string, unknown>): Promise<FinancialAccount> {
    const { data, error } = await this.db.rpc(fn, args);
    if (error) throw repoError(error);
    if (!data) throw new RepoError('desconhecido');
    return toAccount(data as AccountRow);
  }

  createAccount(key: string, contextId: string, input: AccountInput) {
    return this.callAccount('create_account', { p_idempotency_key: key, p_context_id: contextId, p_name: input.name, p_kind: input.kind });
  }

  updateAccount(key: string, id: string, expectedVersion: number, input: AccountInput) {
    return this.callAccount('update_account', {
      p_idempotency_key: key,
      p_account_id: id,
      p_expected_version: expectedVersion,
      p_name: input.name,
      p_kind: input.kind,
    });
  }

  setDefaultAccount(key: string, id: string, expectedVersion: number) {
    return this.callAccount('set_default_account', { p_idempotency_key: key, p_account_id: id, p_expected_version: expectedVersion });
  }

  setAccountStatus(key: string, id: string, expectedVersion: number, status: AccountStatus, newDefaultId: string | null = null) {
    return this.callAccount('set_account_status', {
      p_idempotency_key: key,
      p_account_id: id,
      p_expected_version: expectedVersion,
      p_status: status,
      p_new_default_id: newDefaultId,
    });
  }

  deleteAccount(key: string, id: string, expectedVersion: number) {
    return this.callAccount('delete_account', { p_idempotency_key: key, p_account_id: id, p_expected_version: expectedVersion });
  }

  /** Só operações de contas, da própria pessoa; a conta é o target_id. */
  async findAccountOperation(key: string) {
    const { data, error } = await this.db
      .from('record_operations')
      .select('action, target_id')
      .eq('idempotency_key', key)
      .in('action', ACCOUNT_ACTIONS)
      .maybeSingle();
    if (error) throw repoError(error);
    if (!data) return null;
    const target = data.target_id as string | null;
    if (!target) throw new RepoError('desconhecido', 'operacao_inconsistente');
    return { action: data.action as AccountAction, accountId: target };
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

  /**
   * Buscar em Movimentações (D-045): período, tipo, categoria, conta e valor no servidor, do mais recente ao mais antigo, até 1.000
   * linhas. O texto da descrição entra como filtro mais largo (ILIKE por palavra, `_` no lugar das letras que podem ter acento) e o
   * aparelho confere o resto, sem diferenciar acentos. Só leitura, na mesma tabela que listRecords.
   */
  async searchRecords(contextId: string, filter: RecordSearchFilter): Promise<SearchPage<FinancialRecord>> {
    const page = await readUpTo<RecordRow>(SEARCH_LIMIT, (from, to) => {
      let q = searchFilters(this.db.from('financial_records').select('*').eq('context_id', contextId), filter, 'occurred_on');
      if (filter.kind !== null) q = q.eq('kind', filter.kind);
      if (filter.accountId !== null) q = q.eq('account_id', filter.accountId);
      return q
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to);
    });
    return { items: page.items.map(toRecord), truncated: page.truncated };
  }

  /** Compras no cartão (uma linha por compra, valor total) pela data da compra; sem recebimento nem conta de origem no filtro. */
  async searchCardPurchases(contextId: string, filter: RecordSearchFilter): Promise<SearchPage<CardEntry>> {
    if (filter.kind === 'receita' || filter.accountId !== null) return { items: [], truncated: false };
    const page = await readUpTo<CardEntryRow>(SEARCH_LIMIT, (from, to) =>
      searchFilters(this.db.from('card_entry_items').select('*').eq('context_id', contextId).eq('kind', 'compra'), filter, 'purchased_on')
        .order('purchased_on', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to),
    );
    return { items: page.items.map(toCardEntry), truncated: page.truncated };
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
      // Só despesa lida de uma nota (D-038): o resumo SHA-256, nunca a chave. Sem nota, o hash é o de antes.
      ...(input.receiptKey != null ? { p_receipt_key: input.receiptKey } : {}),
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

  payCommitment(key: string, id: string, expectedVersion: number, input: PaymentRequest) {
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

  /**
   * Assinaturas (D-046, migração 0011). Marca ou desmarca o gasto fixo mensal; a série volta como nas outras escritas de série.
   * Com o banco ainda sem a 0011, a função não existe e a chamada falha (desconhecido); o app trata como "a marca não foi salva".
   */
  setSeriesSubscription(key: string, id: string, expectedVersion: number, subscription: boolean) {
    return this.callSeries('set_series_subscription', {
      p_idempotency_key: key,
      p_series_id: id,
      p_expected_version: expectedVersion,
      p_subscription: subscription,
    });
  }

  /** "Revisei minhas assinaturas": retorno {reviewed_on, changed}. Não conta como anotação. */
  async markSubscriptionsReviewed(key: string, contextId: string): Promise<SubscriptionReviewWrite> {
    const { data, error } = await this.db.rpc('mark_subscriptions_reviewed', { p_idempotency_key: key, p_context_id: contextId });
    if (error) throw repoError(error);
    const r = data as { reviewed_on?: string | null; changed?: number } | null;
    if (!r || typeof r.changed !== 'number') throw new RepoError('desconhecido');
    return { reviewedOn: typeof r.reviewed_on === 'string' ? r.reviewed_on.slice(0, 10) : null, changed: r.changed };
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
  // Orçamento por categoria e limite pessoal de comprometimento (D-041, Ciclo F2)
  // -------------------------------------------------------------------------

  /** Linhas vivas do orçamento do contexto (a RLS já tira as excluídas e o que a pessoa não lê), por categoria e mês de início. */
  async listCategoryBudgets(contextId: string): Promise<CategoryBudget[]> {
    const rows = await readAll<CategoryBudgetRow>((from, to) =>
      this.db
        .from('category_budgets')
        .select(CATEGORY_BUDGET_COLUMNS)
        .eq('context_id', contextId)
        .is('deleted_at', null)
        .order('from_month', { ascending: true })
        .order('id')
        .range(from, to),
    );
    // A ordem das categorias é a do app, não a alfabética do banco.
    return rows
      .map(toCategoryBudget)
      .sort((a, b) => BUDGET_CATEGORIES.indexOf(a.category) - BUDGET_CATEGORIES.indexOf(b.category) || a.fromMonth.localeCompare(b.fromMonth) || a.id.localeCompare(b.id));
  }

  /** As funções de orçamento e de limite devolvem jsonb (a linha): sem .single(). */
  private async callBudget(fn: string, args: Record<string, unknown>): Promise<CategoryBudget> {
    const { data, error } = await this.db.rpc(fn, args);
    if (error) throw repoError(error);
    if (!data) throw new RepoError('desconhecido');
    return toCategoryBudget(data as CategoryBudgetRow);
  }

  private async callLimit(fn: string, args: Record<string, unknown>): Promise<CommitmentLimit> {
    const { data, error } = await this.db.rpc(fn, args);
    if (error) throw repoError(error);
    if (!data) throw new RepoError('desconhecido');
    return toCommitmentLimit(data as CommitmentLimitRow);
  }

  /**
   * Versão 0 cria a linha da categoria no mês; a versão atual altera. O mês vai como AAAA-MM-01; amountCents null grava a linha que
   * encerra a vigência. Uma repetição com a mesma chave e o mesmo conteúdo devolve a linha atual (reconcilia um resultado incerto).
   */
  setCategoryBudget(key: string, contextId: string, category: string, fromMonth: IsoMonth, expectedVersion: number, amountCents: Cents | null) {
    return this.callBudget('set_category_budget', {
      p_idempotency_key: key,
      p_context_id: contextId,
      p_category: category,
      p_from_month: `${fromMonth}-01`,
      p_expected_version: expectedVersion,
      p_amount_cents: amountCents,
    });
  }

  /** Exclusão lógica: devolve a linha excluída (versão + 1). A anterior da categoria volta a valer. */
  deleteCategoryBudget(key: string, id: string, expectedVersion: number) {
    return this.callBudget('delete_category_budget', { p_idempotency_key: key, p_id: id, p_expected_version: expectedVersion });
  }

  /** month_budget: seis linhas (uma por categoria) com o orçamento vigente e o usado no mês (competência), calculado pelo banco. */
  async getMonthBudget(contextId: string, month: IsoMonth): Promise<MonthBudgetRead> {
    const { data, error } = await this.db.rpc('month_budget', { p_context_id: contextId, p_month: `${month}-01` });
    if (error) throw repoError(error);
    return toMonthBudget(month, (data ?? []) as MonthBudgetRow[]);
  }

  /** Limites vivos do contexto, por mês de início crescente (a RLS já tira os excluídos e o que a pessoa não lê). */
  async listCommitmentLimits(contextId: string): Promise<CommitmentLimit[]> {
    const rows = await readAll<CommitmentLimitRow>((from, to) =>
      this.db
        .from('commitment_limits')
        .select(COMMITMENT_LIMIT_COLUMNS)
        .eq('context_id', contextId)
        .is('deleted_at', null)
        .order('from_month', { ascending: true })
        .order('id')
        .range(from, to),
    );
    return rows.map(toCommitmentLimit);
  }

  /** percent null grava a linha que encerra a vigência ("Tirar o limite a partir de {mês}"). */
  setCommitmentLimit(key: string, contextId: string, fromMonth: IsoMonth, expectedVersion: number, percent: number | null) {
    return this.callLimit('set_commitment_limit', {
      p_idempotency_key: key,
      p_context_id: contextId,
      p_from_month: `${fromMonth}-01`,
      p_expected_version: expectedVersion,
      p_percent: percent,
    });
  }

  deleteCommitmentLimit(key: string, id: string, expectedVersion: number) {
    return this.callLimit('delete_commitment_limit', { p_idempotency_key: key, p_id: id, p_expected_version: expectedVersion });
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
      // A conta de aporte e resgate (D-043) só vai quando informada: o banco anterior à 0010 não conhece o argumento.
      ...(input.accountId ? { p_account_id: input.accountId } : {}),
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
      // Informada: troca ou mantém a conta. Nula: tira a conta. Ausente: nada é enviado e o banco mantém a conta do movimento
      // (o padrão de p_account_id é "manter"; o banco anterior à 0010 não conhece o argumento).
      ...(input.accountId !== undefined ? { p_account_id: input.accountId } : {}),
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

  // -------------------------------------------------------------------------
  // Cartões de crédito (D-037, Ciclo E) e notas fiscais (D-038)
  // -------------------------------------------------------------------------

  /** Cartões vivos do contexto (ativos e arquivados), por criação, com o limite usado e a fatura atual (card_items). */
  async listCards(contextId: string): Promise<Card[]> {
    const rows = await readAll<CardRow>((from, to) =>
      this.db.from('card_items').select('*').eq('context_id', contextId).order('created_at').order('id').range(from, to),
    );
    return rows.map(toCard);
  }

  async getCard(id: string): Promise<Card | null> {
    const { data, error } = await this.db.from('card_items').select('*').eq('id', id).maybeSingle();
    if (error) throw repoError(error);
    return data ? toCard(data as CardRow) : null;
  }

  async getCardEntry(id: string): Promise<CardEntry | null> {
    const { data, error } = await this.db.from('card_entry_items').select('*').eq('id', id).maybeSingle();
    if (error) throw repoError(error);
    return data ? toCardEntry(data as CardEntryRow) : null;
  }

  /**
   * Nota já anotada (receipt_items): o gasto vivo ou a compra viva no cartão com este resumo da chave. Resumo sem a forma de
   * 64 hexadecimais minúsculos nem chega ao banco (a chave de 44 caracteres, com o CPF de quem emitiu, nunca sai do aparelho).
   * Quem não lê o contexto não vê nada: null. Só leitura.
   */
  async findReceipt(contextId: string, receiptKey: string): Promise<ReceiptMatch | null> {
    if (!receiptKeyValid(receiptKey)) return null;
    const { data, error } = await this.db
      .from('receipt_items')
      .select('record_id, card_entry_id, card_id')
      .eq('context_id', contextId)
      .eq('receipt_key', receiptKey)
      .limit(2);
    if (error) throw repoError(error);
    const rows = (data ?? []) as { record_id: string | null; card_entry_id: string | null; card_id: string | null }[];
    if (rows.length === 0) return null;
    const row = rows[0]!;
    if (rows.length > 1) throw new RepoError('desconhecido', 'nota_inconsistente');
    if (row.record_id != null && row.card_entry_id == null && row.card_id == null) {
      return { recordId: row.record_id, cardEntryId: null, cardId: null };
    }
    if (row.record_id == null && row.card_entry_id != null && row.card_id != null) {
      return { recordId: null, cardEntryId: row.card_entry_id, cardId: row.card_id };
    }
    throw new RepoError('desconhecido', 'nota_inconsistente');
  }

  /** Lançamentos vivos do cartão (a compra é uma linha), por criação. Em páginas: até 5.000 por cartão. */
  async listCardEntries(cardId: string): Promise<CardEntry[]> {
    const rows = await readAll<CardEntryRow>((from, to) =>
      this.db.from('card_entry_items').select('*').eq('card_id', cardId).order('created_at').order('id').range(from, to),
    );
    return rows.map(toCardEntry);
  }

  /** Contas de fatura vivas do cartão (abertas e pagas), por mês da fatura. Em páginas, como as demais listas. */
  async listInvoiceCommitments(cardId: string): Promise<Commitment[]> {
    const rows = await readAll<CommitmentRow>((from, to) =>
      this.db.from('commitment_items').select('*').eq('card_id', cardId).order('invoice_month').order('id').range(from, to),
    );
    return rows.map(toCommitment);
  }

  /** Faturas do cartão (uma por mês com lançamento ou conta viva), do mês mais antigo ao mais novo. */
  async listInvoiceItems(cardId: string): Promise<InvoiceItem[]> {
    const rows = await readAll<InvoiceItemRow>((from, to) =>
      this.db.from('invoice_items').select('*').eq('card_id', cardId).order('month').range(from, to),
    );
    return rows.map(toInvoiceItem);
  }

  /**
   * As 11 funções de cartão devolvem jsonb {card, entry, entries, invoices, commitments, commitment, record}: sem .single().
   * O cartão vem sempre, no estado atual (inclusive excluído). As parcelas cruas (entries) não são usadas.
   */
  private async callCard(fn: string, args: Record<string, unknown>): Promise<CardResult> {
    const { data, error } = await this.db.rpc(fn, args);
    if (error) throw repoError(error);
    const result = data as CardResult | null;
    if (!result?.card) throw new RepoError('desconhecido');
    return result;
  }

  private cardWrite(r: CardResult): CardWrite {
    return {
      card: toCard(r.card!),
      entry: r.entry ? toCardEntry(r.entry) : null,
      invoices: (r.invoices ?? []).map(toInvoiceItem),
      commitments: (r.commitments ?? []).map(toCommitment),
    };
  }

  private async writeCard(fn: string, args: Record<string, unknown>): Promise<CardWrite> {
    return this.cardWrite(await this.callCard(fn, args));
  }

  /** Pagar e desfazer sempre devolvem a conta da fatura e o gasto do pagamento (criado ou excluído). */
  private async writeInvoicePayment(fn: string, args: Record<string, unknown>): Promise<InvoicePaymentWrite> {
    const r = await this.callCard(fn, args);
    if (!r.commitment || !r.record) throw new RepoError('desconhecido');
    return { ...this.cardWrite(r), commitment: toCommitment(r.commitment), record: toRecord(r.record) };
  }

  createCard(key: string, contextId: string, input: CardInput) {
    return this.writeCard('create_card', {
      p_idempotency_key: key,
      p_context_id: contextId,
      p_nickname: input.name,
      p_last_digits: input.lastDigits,
      p_closing_day: input.closingDay,
      p_due_day: input.dueDay,
      p_limit_cents: input.limitCents,
    });
  }

  updateCard(key: string, id: string, expectedVersion: number, input: CardInput) {
    return this.writeCard('update_card', {
      p_idempotency_key: key,
      p_card_id: id,
      p_expected_version: expectedVersion,
      p_nickname: input.name,
      p_last_digits: input.lastDigits,
      p_closing_day: input.closingDay,
      p_due_day: input.dueDay,
      p_limit_cents: input.limitCents,
    });
  }

  setCardStatus(key: string, id: string, expectedVersion: number, status: CardStatus) {
    return this.writeCard('set_card_status', {
      p_idempotency_key: key,
      p_card_id: id,
      p_expected_version: expectedVersion,
      p_status: status,
    });
  }

  deleteCard(key: string, id: string, expectedVersion: number) {
    return this.writeCard('delete_card', { p_idempotency_key: key, p_card_id: id, p_expected_version: expectedVersion });
  }

  /** p_receipt_key (o resumo SHA-256, nunca a chave) só vai quando há nota: sem ela, o hash da operação é o de uma compra comum. */
  addCardPurchase(key: string, cardId: string, input: CardPurchaseInput) {
    return this.writeCard('add_card_purchase', {
      p_idempotency_key: key,
      p_card_id: cardId,
      p_purchased_on: input.purchasedOn,
      p_total_cents: input.totalCents,
      p_installments: input.installments,
      p_description: input.description,
      p_category: input.category,
      ...(input.receiptKey != null ? { p_receipt_key: input.receiptKey } : {}),
    });
  }

  /**
   * O valor é sempre o novo inteiro (compra: o total). Cada tipo manda só os campos que usa e deixa os outros nulos
   * (campo_nao_se_aplica); a chave da nota não muda depois de gravada.
   */
  updateCardEntry(key: string, entryId: string, expectedVersion: number, input: CardEntryInput) {
    const common = { p_idempotency_key: key, p_entry_id: entryId, p_expected_version: expectedVersion, p_kind: input.kind };
    if (input.kind === 'compra') {
      return this.writeCard('update_card_entry', {
        ...common,
        p_amount_cents: input.totalCents,
        p_occurred_on: input.purchasedOn,
        p_description: input.description,
        p_category: input.category,
        p_installments: input.installments,
        p_invoice_month: null,
        p_charge_kind: null,
      });
    }
    if (input.kind === 'encargo') {
      return this.writeCard('update_card_entry', {
        ...common,
        p_amount_cents: input.amountCents,
        p_occurred_on: null,
        p_description: null,
        p_category: null,
        p_installments: null,
        p_invoice_month: `${input.invoiceMonth}-01`,
        p_charge_kind: input.chargeType,
      });
    }
    return this.writeCard('update_card_entry', {
      ...common,
      p_amount_cents: input.amountCents,
      p_occurred_on: null,
      p_description: input.description,
      p_category: input.category,
      p_installments: null,
      p_invoice_month: `${input.invoiceMonth}-01`,
      p_charge_kind: null,
    });
  }

  deleteCardEntry(key: string, entryId: string, expectedVersion: number) {
    return this.writeCard('delete_card_entry', { p_idempotency_key: key, p_entry_id: entryId, p_expected_version: expectedVersion });
  }

  addCardCharge(key: string, cardId: string, input: CardChargeInput) {
    return this.writeCard('add_card_charge', {
      p_idempotency_key: key,
      p_card_id: cardId,
      p_invoice_month: `${input.invoiceMonth}-01`,
      p_charge_kind: input.chargeType,
      p_amount_cents: input.amountCents,
    });
  }

  addCardRefund(key: string, cardId: string, input: CardRefundInput) {
    return this.writeCard('add_card_refund', {
      p_idempotency_key: key,
      p_card_id: cardId,
      p_invoice_month: `${input.invoiceMonth}-01`,
      p_amount_cents: input.amountCents,
      p_description: input.description,
      p_category: input.category,
    });
  }

  /** expectedVersion = versão da conta da fatura (InvoiceItem.commitmentVersion). Sem accountId, o banco usa a conta principal do contexto. */
  payInvoice(
    key: string,
    cardId: string,
    month: IsoMonth,
    expectedVersion: number,
    amountCents: Cents,
    paidOn: IsoDate,
    accountId?: string | null,
  ) {
    return this.writeInvoicePayment('pay_invoice', {
      p_idempotency_key: key,
      p_card_id: cardId,
      p_month: `${month}-01`,
      p_expected_version: expectedVersion,
      p_paid_cents: amountCents,
      p_paid_on: paidOn,
      ...(accountId != null ? { p_account_id: accountId } : {}),
    });
  }

  undoInvoicePayment(key: string, cardId: string, month: IsoMonth, expectedVersion: number) {
    return this.writeInvoicePayment('undo_invoice_payment', {
      p_idempotency_key: key,
      p_card_id: cardId,
      p_month: `${month}-01`,
      p_expected_version: expectedVersion,
    });
  }

  /** Só operações de cartão: o cartão em target_id e, nas ações de lançamento, o lançamento em entry_id. */
  async findCardOperation(key: string) {
    const { data, error } = await this.db
      .from('record_operations')
      .select('action, target_id, entry_id, commitment_id, record_id')
      .eq('idempotency_key', key)
      .in('action', CARD_ACTIONS)
      .maybeSingle();
    if (error) throw repoError(error);
    if (!data) return null;
    if (!data.target_id) throw new RepoError('desconhecido', 'operacao_inconsistente');
    return {
      action: data.action as CardAction,
      cardId: data.target_id as string,
      entryId: (data.entry_id as string | null) ?? null,
      commitmentId: (data.commitment_id as string | null) ?? null,
      recordId: (data.record_id as string | null) ?? null,
    };
  }
}
