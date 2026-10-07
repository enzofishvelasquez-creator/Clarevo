import {
  RepoError,
  monthRange,
  type Commitment,
  type FinancialRecord,
  type IsoMonth,
  type PersonalSpace,
  type RecordInput,
  type RecordKind,
  type RecordsRepository,
  type RepoErrorCode,
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
  created_by: string;
  version: number;
  created_at: string;
  updated_at: string;
}

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
];

function repoError(e: { message?: string; code?: string } | null): RepoError {
  const msg = e?.message ?? '';
  const known = KNOWN.find((k) => msg === k || msg.endsWith(k));
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
    createdBy: r.created_by,
    version: r.version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

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

  async listCommitments(contextId: string, month: IsoMonth): Promise<Commitment[]> {
    const { start, endExclusive } = monthRange(month);
    const { data, error } = await this.db
      .from('commitments')
      .select('id, context_id, description, amount_cents, due_on, status')
      .eq('context_id', contextId)
      .gte('due_on', start)
      .lt('due_on', endExclusive);
    if (error) throw repoError(error);
    return data.map((c) => ({
      id: c.id,
      contextId: c.context_id,
      description: c.description,
      amountCents: Number(c.amount_cents),
      dueOn: c.due_on,
      status: c.status,
    }));
  }

  async findOperation(key: string) {
    const { data, error } = await this.db.from('record_operations').select('record_id').eq('idempotency_key', key).maybeSingle();
    if (error) throw repoError(error);
    return data ? { recordId: data.record_id as string } : null;
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
}
