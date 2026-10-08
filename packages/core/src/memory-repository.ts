import type { IsoDate, IsoMonth } from './dates';
import { isValidIsoDate, monthOf } from './dates';
import type { Cents } from './money';
import { MAX_RECORD_CENTS } from './money';
import type {
  Commitment,
  CommitmentInput,
  FinancialAccount,
  FinancialRecord,
  PaymentInput,
  PersonalSpace,
  RecordInput,
  RecordKind,
} from './records';
import type { CommitmentAction, CommitmentWrite, RecordsRepository } from './repository';
import { RepoError } from './repository';
import { dueDateBounds } from './validation';

type RecordAction = 'criar' | 'editar' | 'excluir';

interface Operation {
  action: RecordAction | CommitmentAction;
  hash: string;
  contextId: string;
  recordId: string | null;
  commitmentId: string | null;
}

type StoredRecord = FinancialRecord & { deletedAt?: string };
/** Conta a pagar guardada sem o pagamento: ele é lido do gasto vivo vinculado (fonte única, sem cópia). */
type StoredCommitment = Omit<Commitment, 'payment'> & { deletedAt?: string };

export interface MemoryRepositoryOptions {
  actorId: string;
  displayName: string;
  timeZone?: string;
  /** Dia atual usado para recusar datas futuras. */
  today: () => IsoDate;
  /** Atraso artificial (ms) para exibir estados de envio no protótipo. */
  latencyMs?: number;
}

/**
 * Repositório em memória com as mesmas regras do banco:
 * idempotência por (pessoa, chave), versão contra sobrescrita, exclusão lógica e validação.
 * Contas a pagar seguem as funções do banco (D-021): pagar e desfazer são atômicos e mantêm a invariante I1.
 * Usado na demonstração (acesso simulado) e nos testes.
 */
export class MemoryRepository implements RecordsRepository {
  private space: PersonalSpace | null = null;
  private records = new Map<string, StoredRecord>();
  private commitments = new Map<string, StoredCommitment>();
  private operations = new Map<string, Operation>();
  private seq = 0;
  /** Simula falha de rede: 'antes' (nada gravado) ou 'depois' (gravado, resposta perdida). */
  failNextWrite: 'antes' | 'depois' | null = null;
  failNextRead = false;
  /** Atraso artificial (ms) em cada operação. */
  latencyMs: number;

  constructor(private readonly opts: MemoryRepositoryOptions) {
    this.latencyMs = opts.latencyMs ?? 0;
  }

  private id(prefix: string) {
    this.seq += 1;
    return `${prefix}-${this.seq.toString(36)}`;
  }

  private async delay() {
    if (this.latencyMs) await new Promise((r) => setTimeout(r, this.latencyMs));
  }

  private async read<T>(fn: () => T): Promise<T> {
    await this.delay();
    if (this.failNextRead) {
      this.failNextRead = false;
      throw new RepoError('rede');
    }
    return clone(fn());
  }

  /**
   * Escrita atômica, como uma transação do banco: fn() faz todas as leituras e validações antes da
   * primeira mutação e as mutações rodam em sequência, sem await. Se algo falhar, inclusive a
   * invariante I1, registros, contas a pagar e operações voltam ao estado anterior.
   */
  private async write<T>(fn: () => T): Promise<T> {
    await this.delay();
    const mode = this.failNextWrite;
    this.failNextWrite = null;
    if (mode === 'antes') throw new RepoError('rede');
    const saved = { records: new Map(this.records), commitments: new Map(this.commitments), operations: new Map(this.operations) };
    let result: T;
    try {
      result = fn();
      this.checkInvariants();
    } catch (e) {
      ({ records: this.records, commitments: this.commitments, operations: this.operations } = saved);
      throw e;
    }
    if (mode === 'depois') throw new RepoError('rede');
    return clone(result);
  }

  async getSpace() {
    return this.read(() => this.space);
  }

  async ensurePersonalSpace(accountName: string, timeZone?: string) {
    return this.write(() => {
      if (this.space) return this.space;
      const name = accountName.trim();
      if (name.length < 1 || name.length > 40) throw new RepoError('nome_da_conta_invalido');
      const contextId = this.id('ctx');
      const account: FinancialAccount = { id: this.id('conta'), contextId, name, currency: 'BRL', initialBalanceCents: null };
      this.space = {
        personId: this.opts.actorId,
        displayName: this.opts.displayName,
        timeZone: timeZone ?? this.opts.timeZone ?? 'America/Sao_Paulo',
        personalContextId: contextId,
        accounts: [account],
      };
      return this.space;
    });
  }

  async renameAccount(accountId: string, name: string) {
    return this.write(() => {
      const acc = this.space?.accounts.find((a) => a.id === accountId);
      if (!acc) throw new RepoError('nao_encontrado');
      const trimmed = name.trim();
      if (trimmed.length < 1 || trimmed.length > 40) throw new RepoError('nome_da_conta_invalido');
      acc.name = trimmed;
    });
  }

  async listRecords(contextId: string, month: IsoMonth) {
    return this.read(() =>
      [...this.records.values()].filter((r) => !r.deletedAt && r.contextId === contextId && monthOf(r.occurredOn) === month).map(strip),
    );
  }

  async getRecord(id: string) {
    return this.read(() => {
      const r = this.records.get(id);
      return r && !r.deletedAt && this.canRead(r.contextId) ? strip(r) : null;
    });
  }

  async findOperation(key: string) {
    return this.read(() => {
      const op = this.operations.get(key);
      return op && op.recordId && isRecordAction(op.action) ? { recordId: op.recordId } : null;
    });
  }

  async createRecord(key: string, contextId: string, kind: RecordKind, input: RecordInput) {
    return this.write(() => {
      const norm = normalize(input);
      const payload = [contextId, kind, norm];
      const replay = this.replayRecord(key, 'criar', payload);
      if (replay) return replay;
      if (!this.canWrite(contextId)) throw new RepoError('sem_permissao');
      this.validate(contextId, norm);
      const now = new Date().toISOString();
      const record: FinancialRecord = {
        id: this.id('reg'),
        contextId,
        kind,
        status: 'realizado',
        currency: 'BRL',
        ...norm,
        commitmentId: null,
        createdBy: this.opts.actorId,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      this.records.set(record.id, record);
      this.saveOperation(key, 'criar', payload, { contextId, recordId: record.id, commitmentId: null });
      return record;
    });
  }

  async updateRecord(key: string, id: string, expectedVersion: number, input: RecordInput) {
    return this.write(() => {
      const norm = normalize(input);
      const payload = [id, expectedVersion, norm];
      const replay = this.replayRecord(key, 'editar', payload);
      if (replay) return replay;
      const current = this.liveRecord(id);
      if (current.version !== expectedVersion) throw new RepoError('versao_desatualizada');
      this.validate(current.contextId, norm);
      const now = new Date().toISOString();
      const next = { ...current, ...norm, version: current.version + 1, updatedAt: now };
      this.records.set(id, next);
      // Gasto de conta a pagar: a conta sobe de versão; o valor previsto não muda.
      if (current.commitmentId) this.bumpCommitment(current.commitmentId, {}, now);
      this.saveOperation(key, 'editar', payload, { contextId: current.contextId, recordId: id, commitmentId: current.commitmentId });
      return strip(next);
    });
  }

  async deleteRecord(key: string, id: string, expectedVersion: number) {
    return this.write(() => {
      const payload = [id, expectedVersion];
      const replay = this.replayRecord(key, 'excluir', payload);
      if (replay) return replay;
      const current = this.liveRecord(id);
      if (current.version !== expectedVersion) throw new RepoError('versao_desatualizada');
      const now = new Date().toISOString();
      const next = { ...current, version: current.version + 1, updatedAt: now, deletedAt: now };
      this.records.set(id, next);
      // Excluir o gasto de uma conta a pagar desfaz o pagamento: a conta volta a ficar em aberto.
      if (current.commitmentId) this.bumpCommitment(current.commitmentId, { status: 'aberto' }, now);
      this.saveOperation(key, 'excluir', payload, { contextId: current.contextId, recordId: id, commitmentId: current.commitmentId });
      return strip(next);
    });
  }

  /** Mesmo critério do Supabase: vencimento no mês, pagamento no mês (gasto vivo) ou em aberto. */
  async listCommitments(contextId: string, month: IsoMonth) {
    const paidInMonth = (c: StoredCommitment) => {
      const r = c.status === 'quitado' ? this.livePayment(c.id) : undefined;
      return r !== undefined && monthOf(r.occurredOn) === month;
    };
    return this.read(() =>
      [...this.commitments.values()]
        .filter(
          (c) => !c.deletedAt && c.contextId === contextId && (monthOf(c.dueOn) === month || c.status === 'aberto' || paidInMonth(c)),
        )
        .sort(byDue)
        .map((c) => this.toCommitment(c)),
    );
  }

  async getCommitment(id: string) {
    return this.read(() => {
      const c = this.commitments.get(id);
      return c && !c.deletedAt && this.canRead(c.contextId) ? this.toCommitment(c) : null;
    });
  }

  async findCommitmentOperation(key: string) {
    return this.read(() => {
      const op = this.operations.get(key);
      return op && op.commitmentId && !isRecordAction(op.action)
        ? { action: op.action, commitmentId: op.commitmentId, recordId: op.recordId }
        : null;
    });
  }

  async createCommitment(key: string, contextId: string, input: CommitmentInput) {
    return this.write(() => {
      const norm = normalizeCommitment(input);
      const payload = [contextId, norm];
      const replay = this.replayCommitment(key, 'criar_compromisso', payload);
      if (replay) return replay;
      if (!this.canWrite(contextId)) throw new RepoError('sem_permissao');
      this.validateCommitment(norm, true);
      const now = new Date().toISOString();
      const commitment: StoredCommitment = {
        id: this.id('cp'),
        contextId,
        ...norm,
        currency: 'BRL',
        status: 'aberto',
        createdBy: this.opts.actorId,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      this.commitments.set(commitment.id, commitment);
      this.saveOperation(key, 'criar_compromisso', payload, { contextId, recordId: null, commitmentId: commitment.id });
      return this.commitmentResult(commitment.id, null);
    });
  }

  async updateCommitment(key: string, id: string, expectedVersion: number, input: CommitmentInput) {
    return this.write(() => {
      const norm = normalizeCommitment(input);
      const payload = [id, expectedVersion, norm];
      const replay = this.replayCommitment(key, 'editar_compromisso', payload);
      if (replay) return replay;
      const current = this.liveCommitment(id);
      if (current.version !== expectedVersion) throw new RepoError('versao_desatualizada');
      if (current.status !== 'aberto') throw new RepoError('compromisso_quitado');
      // A janela só vale para vencimento novo: uma conta antiga continua editável.
      this.validateCommitment(norm, norm.dueOn !== current.dueOn);
      this.bumpCommitment(id, norm, new Date().toISOString());
      this.saveOperation(key, 'editar_compromisso', payload, { contextId: current.contextId, recordId: null, commitmentId: id });
      return this.commitmentResult(id, null);
    });
  }

  async deleteCommitment(key: string, id: string, expectedVersion: number) {
    return this.write(() => {
      const payload = [id, expectedVersion];
      const replay = this.replayCommitment(key, 'excluir_compromisso', payload);
      if (replay) return replay;
      const current = this.liveCommitment(id);
      if (current.version !== expectedVersion) throw new RepoError('versao_desatualizada');
      if (current.status !== 'aberto') throw new RepoError('compromisso_quitado');
      const now = new Date().toISOString();
      this.bumpCommitment(id, { deletedAt: now }, now);
      this.saveOperation(key, 'excluir_compromisso', payload, { contextId: current.contextId, recordId: null, commitmentId: id });
      return this.commitmentResult(id, null);
    });
  }

  async payCommitment(key: string, id: string, expectedVersion: number, input: PaymentInput) {
    return this.write(() => {
      const norm = normalizePayment(input);
      const payload = [id, expectedVersion, norm];
      const replay = this.replayCommitment(key, 'pagar_compromisso', payload);
      if (replay) return withRecord(replay);
      const current = this.liveCommitment(id);
      if (current.version !== expectedVersion) throw new RepoError('versao_desatualizada');
      if (current.status !== 'aberto') throw new RepoError('compromisso_quitado');
      // Mesmas regras do gasto realizado: valor, categoria, data até hoje e conta do contexto.
      const recordInput: RecordInput = {
        accountId: norm.accountId,
        amountCents: norm.amountCents,
        occurredOn: norm.paidOn,
        description: current.description,
        category: norm.category,
      };
      this.validate(current.contextId, recordInput);
      const now = new Date().toISOString();
      const record: FinancialRecord = {
        id: this.id('reg'),
        contextId: current.contextId,
        kind: 'despesa',
        status: 'realizado',
        currency: 'BRL',
        ...recordInput,
        commitmentId: id,
        createdBy: this.opts.actorId,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      this.records.set(record.id, record);
      this.bumpCommitment(id, { status: 'quitado' }, now);
      this.saveOperation(key, 'pagar_compromisso', payload, { contextId: current.contextId, recordId: record.id, commitmentId: id });
      return withRecord(this.commitmentResult(id, record.id));
    });
  }

  async undoCommitmentPayment(key: string, id: string, expectedVersion: number) {
    return this.write(() => {
      const payload = [id, expectedVersion];
      const replay = this.replayCommitment(key, 'desfazer_pagamento', payload);
      if (replay) return withRecord(replay);
      const current = this.liveCommitment(id);
      if (current.version !== expectedVersion) throw new RepoError('versao_desatualizada');
      if (current.status !== 'quitado') throw new RepoError('compromisso_aberto');
      // Permissão também sobre o gasto, como clarevo_lock_record.
      const paid = this.liveRecord(this.livePayment(id)?.id ?? '');
      const now = new Date().toISOString();
      // Exclusão lógica: o gasto mantém commitmentId como rastro.
      this.records.set(paid.id, { ...paid, version: paid.version + 1, updatedAt: now, deletedAt: now });
      this.bumpCommitment(id, { status: 'aberto' }, now);
      this.saveOperation(key, 'desfazer_pagamento', payload, { contextId: current.contextId, recordId: paid.id, commitmentId: id });
      return withRecord(this.commitmentResult(id, paid.id));
    });
  }

  /**
   * Invariantes do vínculo (no banco: restrição adiada, FK composta e checagem de tipo).
   * I1: conta paga, não excluída, com exatamente 1 gasto vivo vinculado, ou em aberto com 0.
   * I2: o gasto vinculado é despesa do mesmo contexto. Lança Error('vinculo_inconsistente').
   */
  checkInvariants() {
    const live = new Map<string, number>();
    for (const r of this.records.values()) {
      if (!r.commitmentId) continue;
      const c = this.commitments.get(r.commitmentId);
      if (!c || r.kind !== 'despesa' || r.contextId !== c.contextId) throw new Error('vinculo_inconsistente');
      if (!r.deletedAt) live.set(c.id, (live.get(c.id) ?? 0) + 1);
    }
    for (const c of this.commitments.values()) {
      const n = live.get(c.id) ?? 0;
      if (!((c.status === 'quitado' && !c.deletedAt && n === 1) || (c.status === 'aberto' && n === 0))) {
        throw new Error('vinculo_inconsistente');
      }
    }
  }

  /** Simula outro aparelho alterando o registro (para testar conflito de versão). */
  simulateRemoteEdit(id: string, changes: Partial<RecordInput>) {
    const r = this.liveRecord(id);
    const now = new Date().toISOString();
    this.records.set(id, { ...r, ...changes, version: r.version + 1, updatedAt: now });
    if (r.commitmentId) this.bumpCommitment(r.commitmentId, {}, now);
  }

  /** Simula outro aparelho alterando a conta a pagar em aberto (para testar conflito de versão). */
  simulateRemoteCommitmentEdit(id: string, changes: Partial<CommitmentInput>) {
    const c = this.liveCommitment(id);
    if (c.status !== 'aberto') throw new RepoError('compromisso_quitado');
    this.bumpCommitment(id, changes, new Date().toISOString());
  }

  /** Repetição: mesma chave, mesma ação e mesmo conteúdo devolve a operação; qualquer diferença é recusada. */
  private replay(key: string, action: Operation['action'], payload: unknown[]): Operation | null {
    const op = this.operations.get(key);
    if (!op) return null;
    if (op.action !== action || op.hash !== hash([action, ...payload])) throw new RepoError('chave_reutilizada');
    if (!this.canRead(op.contextId)) throw new RepoError('nao_encontrado');
    return op;
  }

  private replayRecord(key: string, action: RecordAction, payload: unknown[]): FinancialRecord | null {
    const op = this.replay(key, action, payload);
    return op ? strip(this.records.get(op.recordId!)!) : null;
  }

  /** Devolve o estado atual, como clarevo_commitment_result. */
  private replayCommitment(key: string, action: CommitmentAction, payload: unknown[]): CommitmentWrite | null {
    const op = this.replay(key, action, payload);
    return op ? this.commitmentResult(op.commitmentId!, op.recordId) : null;
  }

  private saveOperation(key: string, action: Operation['action'], payload: unknown[], ids: Omit<Operation, 'action' | 'hash'>) {
    this.operations.set(key, { action, hash: hash([action, ...payload]), ...ids });
  }

  private commitmentResult(commitmentId: string, recordId: string | null): CommitmentWrite {
    const r = recordId ? this.records.get(recordId) : undefined;
    return { commitment: this.toCommitment(this.commitments.get(commitmentId)!), record: r ? strip(r) : null };
  }

  /** Soma 1 à versão da conta a pagar, com as mudanças. Só é chamada depois de todas as conferências. */
  private bumpCommitment(id: string, changes: Partial<StoredCommitment>, now: string) {
    const c = this.commitments.get(id)!;
    this.commitments.set(id, { ...c, ...changes, version: c.version + 1, updatedAt: now });
  }

  /** Gasto vivo que quitou a conta (I1 garante no máximo um). */
  private livePayment(commitmentId: string): StoredRecord | undefined {
    for (const r of this.records.values()) if (r.commitmentId === commitmentId && !r.deletedAt) return r;
    return undefined;
  }

  private toCommitment(c: StoredCommitment): Commitment {
    const { deletedAt: _deleted, ...rest } = c;
    const r = this.livePayment(c.id);
    return { ...rest, payment: r ? { recordId: r.id, amountCents: r.amountCents, paidOn: r.occurredOn, accountId: r.accountId } : null };
  }

  private liveRecord(id: string) {
    const r = this.records.get(id);
    if (!r || r.deletedAt || !this.canRead(r.contextId)) throw new RepoError('nao_encontrado');
    return r;
  }

  /** Como clarevo_lock_commitment: sem leitura, não revela a existência; sem escrita, sem_permissao. */
  private liveCommitment(id: string) {
    const c = this.commitments.get(id);
    if (!c || c.deletedAt || !this.canRead(c.contextId)) throw new RepoError('nao_encontrado');
    if (!this.canWrite(c.contextId)) throw new RepoError('sem_permissao');
    return c;
  }

  private canRead(contextId: string) {
    return this.space?.personalContextId === contextId;
  }

  /** Aqui só existe o contexto pessoal, então ler e escrever equivalem; o nome segue a regra do banco. */
  private canWrite(contextId: string) {
    return this.canRead(contextId);
  }

  private validate(contextId: string, input: RecordInput) {
    validateCommon(input.amountCents, input.description, input.category);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.occurredOn)) throw new RepoError('data_invalida');
    if (input.occurredOn > this.opts.today()) throw new RepoError('data_futura');
    const acc = this.space?.accounts.find((a) => a.id === input.accountId);
    if (!acc || acc.contextId !== contextId) throw new RepoError('conta_invalida');
  }

  /** Mesma ordem de clarevo_validate_commitment no banco. */
  private validateCommitment(input: CommitmentInput, checkRange: boolean) {
    validateCommon(input.amountCents, input.description, input.category);
    if (!isValidIsoDate(input.dueOn)) throw new RepoError('data_invalida');
    if (checkRange) {
      const { min, max } = dueDateBounds(this.opts.today());
      if (input.dueOn < min || input.dueOn > max) throw new RepoError('vencimento_fora_do_intervalo');
    }
  }
}

function validateCommon(amountCents: Cents, description: string, category: string | null) {
  if (!Number.isSafeInteger(amountCents) || amountCents < 1) throw new RepoError('valor_invalido');
  if (amountCents > MAX_RECORD_CENTS) throw new RepoError('valor_acima_do_limite');
  if (description.length === 0) throw new RepoError('descricao_obrigatoria');
  if ([...description].length > 80) throw new RepoError('descricao_longa');
  if (category && [...category].length > 40) throw new RepoError('categoria_invalida');
}

function isRecordAction(action: Operation['action']): action is RecordAction {
  return action === 'criar' || action === 'editar' || action === 'excluir';
}

const byDue = (a: StoredCommitment, b: StoredCommitment) =>
  a.dueOn.localeCompare(b.dueOn) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

function trimCategory(category: string | null): string | null {
  return category?.trim() ? category.trim() : null;
}

/** Só os campos do formulário: nada de fora (id, versão, vínculo) entra no registro nem no hash. */
function normalize(input: RecordInput): RecordInput {
  return {
    accountId: input.accountId,
    amountCents: input.amountCents,
    occurredOn: input.occurredOn,
    description: input.description.trim(),
    category: trimCategory(input.category),
  };
}

function normalizeCommitment(input: CommitmentInput): CommitmentInput {
  return { description: input.description.trim(), amountCents: input.amountCents, dueOn: input.dueOn, category: trimCategory(input.category) };
}

function normalizePayment(input: PaymentInput): PaymentInput {
  return { accountId: input.accountId, amountCents: input.amountCents, paidOn: input.paidOn, category: trimCategory(input.category) };
}

/** Pagar e desfazer sempre envolvem um gasto. */
function withRecord(w: CommitmentWrite): CommitmentWrite & { record: FinancialRecord } {
  if (!w.record) throw new RepoError('desconhecido');
  return { ...w, record: w.record };
}

function hash(payload: unknown) {
  return JSON.stringify(payload);
}

function strip(r: StoredRecord): FinancialRecord {
  const { deletedAt: _deleted, ...rest } = r;
  return rest;
}

/** Cópia profunda de dados simples (sem structuredClone, que o Hermes pode não ter). */
function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}
