import {
  PARTS_PER_YEAR_MAX,
  RepoError,
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
  type IsoMonth,
  type MonthOverview,
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
];

/**
 * Converte o erro da API pelo nome (message) que o banco lança.
 * Privacidade: nunca registrar error.details (o Postgres pode incluir valores da linha), nem valores
 * ou descrições, em log ou evento. Só o nome do erro segue adiante.
 */
function repoError(e: { message?: string; code?: string } | null): RepoError {
  const msg = e?.message ?? '';
  // O mais longo vence: 'modo_de_valor_invalido' termina com 'valor_invalido'.
  const known = KNOWN.filter((k) => msg === k || msg.endsWith(k)).sort((a, b) => b.length - a.length)[0];
  if (known) return new RepoError(known);
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
}
