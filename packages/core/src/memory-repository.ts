import type { IsoDate, IsoMonth } from './dates';
import { monthOf } from './dates';
import { MAX_RECORD_CENTS } from './money';
import type { Commitment, FinancialAccount, FinancialRecord, PersonalSpace, RecordInput, RecordKind } from './records';
import type { RecordsRepository } from './repository';
import { RepoError } from './repository';

interface Operation {
  action: 'criar' | 'editar' | 'excluir';
  hash: string;
  recordId: string;
}

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
 * Usado na demonstração (acesso simulado) e nos testes.
 */
export class MemoryRepository implements RecordsRepository {
  private space: PersonalSpace | null = null;
  private records = new Map<string, FinancialRecord & { deletedAt?: string }>();
  private commitments: Commitment[] = [];
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

  private async write<T>(fn: () => T): Promise<T> {
    await this.delay();
    const mode = this.failNextWrite;
    this.failNextWrite = null;
    if (mode === 'antes') throw new RepoError('rede');
    const result = fn();
    if (mode === 'depois') throw new RepoError('rede');
    return clone(result);
  }

  async getSpace() {
    return this.read(() => this.space);
  }

  async ensurePersonalSpace(accountName: string) {
    return this.write(() => {
      if (this.space) return this.space;
      const name = accountName.trim();
      if (name.length < 1 || name.length > 40) throw new RepoError('nome_da_conta_invalido');
      const contextId = this.id('ctx');
      const account: FinancialAccount = { id: this.id('conta'), contextId, name, currency: 'BRL', initialBalanceCents: null };
      this.space = {
        personId: this.opts.actorId,
        displayName: this.opts.displayName,
        timeZone: this.opts.timeZone ?? 'America/Sao_Paulo',
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

  async listCommitments(contextId: string, month: IsoMonth) {
    return this.read(() => this.commitments.filter((c) => c.contextId === contextId && monthOf(c.dueOn) === month));
  }

  async findOperation(key: string) {
    return this.read(() => {
      const op = this.operations.get(key);
      return op ? { recordId: op.recordId } : null;
    });
  }

  async createRecord(key: string, contextId: string, kind: RecordKind, input: RecordInput) {
    return this.write(() => {
      const norm = normalize(input);
      const replay = this.replay(key, 'criar', [contextId, kind, norm]);
      if (replay) return replay;
      if (!this.canRead(contextId)) throw new RepoError('sem_permissao');
      this.validate(contextId, norm);
      const now = new Date().toISOString();
      const record: FinancialRecord = {
        id: this.id('reg'),
        contextId,
        kind,
        status: 'realizado',
        currency: 'BRL',
        ...norm,
        createdBy: this.opts.actorId,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      this.records.set(record.id, record);
      this.operations.set(key, { action: 'criar', hash: hash([contextId, kind, norm]), recordId: record.id });
      return record;
    });
  }

  async updateRecord(key: string, id: string, expectedVersion: number, input: RecordInput) {
    return this.write(() => {
      const norm = normalize(input);
      const replay = this.replay(key, 'editar', [id, expectedVersion, norm]);
      if (replay) return replay;
      const current = this.liveRecord(id);
      if (current.version !== expectedVersion) throw new RepoError('versao_desatualizada');
      this.validate(current.contextId, norm);
      const next = { ...current, ...norm, version: current.version + 1, updatedAt: new Date().toISOString() };
      this.records.set(id, next);
      this.operations.set(key, { action: 'editar', hash: hash([id, expectedVersion, norm]), recordId: id });
      return strip(next);
    });
  }

  async deleteRecord(key: string, id: string, expectedVersion: number) {
    return this.write(() => {
      const replay = this.replay(key, 'excluir', [id, expectedVersion]);
      if (replay) return replay;
      const current = this.liveRecord(id);
      if (current.version !== expectedVersion) throw new RepoError('versao_desatualizada');
      const now = new Date().toISOString();
      const next = { ...current, version: current.version + 1, updatedAt: now, deletedAt: now };
      this.records.set(id, next);
      this.operations.set(key, { action: 'excluir', hash: hash([id, expectedVersion]), recordId: id });
      return strip(next);
    });
  }

  /** Somente demonstração/testes: compromissos não têm cadastro neste ciclo. */
  seedCommitment(c: Omit<Commitment, 'id'>) {
    this.commitments.push({ ...c, id: this.id('comp') });
  }

  /** Simula outro aparelho alterando o registro (para testar conflito de versão). */
  simulateRemoteEdit(id: string, changes: Partial<RecordInput>) {
    const r = this.liveRecord(id);
    this.records.set(id, { ...r, ...changes, version: r.version + 1, updatedAt: new Date().toISOString() });
  }

  private replay(key: string, action: Operation['action'], payload: unknown): FinancialRecord | null {
    const op = this.operations.get(key);
    if (!op) return null;
    if (op.action !== action || op.hash !== hash(payload)) throw new RepoError('chave_reutilizada');
    return strip(this.records.get(op.recordId)!);
  }

  private liveRecord(id: string) {
    const r = this.records.get(id);
    if (!r || r.deletedAt || !this.canRead(r.contextId)) throw new RepoError('nao_encontrado');
    return r;
  }

  private canRead(contextId: string) {
    return this.space?.personalContextId === contextId;
  }

  private validate(contextId: string, input: RecordInput) {
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 1) throw new RepoError('valor_invalido');
    if (input.amountCents > MAX_RECORD_CENTS) throw new RepoError('valor_acima_do_limite');
    if (input.description.length === 0) throw new RepoError('descricao_obrigatoria');
    if (input.description.length > 80) throw new RepoError('descricao_longa');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.occurredOn)) throw new RepoError('data_invalida');
    if (input.occurredOn > this.opts.today()) throw new RepoError('data_futura');
    const acc = this.space?.accounts.find((a) => a.id === input.accountId);
    if (!acc || acc.contextId !== contextId) throw new RepoError('conta_invalida');
  }
}

function normalize(input: RecordInput): RecordInput {
  const category = input.category?.trim() ? input.category.trim() : null;
  return { ...input, description: input.description.trim(), category };
}

function hash(payload: unknown) {
  return JSON.stringify(payload);
}

function strip(r: FinancialRecord & { deletedAt?: string }): FinancialRecord {
  const { deletedAt: _deleted, ...rest } = r;
  return rest;
}

/** Cópia profunda de dados simples (sem structuredClone, que o Hermes pode não ter). */
function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}
