import type { IsoDate, IsoMonth } from './dates';
import { dateInMonth, isValidIsoDate, monthOf, monthsBetween } from './dates';
import type { Cents } from './money';
import { MAX_RECORD_CENTS } from './money';
import type {
  Commitment,
  CommitmentInput,
  CommitmentSeries,
  FinancialAccount,
  FinancialRecord,
  PaymentInput,
  PersonalSpace,
  RecordInput,
  RecordKind,
  SeriesEditInput,
  SeriesInput,
  SeriesTerm,
} from './records';
import type { AffectedRef, CommitmentAction, CommitmentWrite, RecordsRepository, SeriesAction, SeriesWrite } from './repository';
import { RepoError } from './repository';
import {
  SERIES_LIMIT,
  affectedByDelete,
  affectedByEditFrom,
  affectedByEnd,
  occurrencesToMaterialize,
  seriesCountsTowardLimit,
  seriesMonthOf,
} from './series';
import { dueDateBounds, seriesInputError, seriesTermError } from './validation';

type RecordAction = 'criar' | 'editar' | 'excluir';

interface Operation {
  action: RecordAction | CommitmentAction | SeriesAction;
  hash: string;
  contextId: string;
  recordId: string | null;
  commitmentId: string | null;
  /** Alvo genérico (target_id): a série nas ações de gasto fixo. */
  seriesId: string | null;
}

type StoredRecord = FinancialRecord & { deletedAt?: string };
/**
 * Conta a pagar guardada sem o pagamento (lido do gasto vivo vinculado) e sem os dados da série (lidos pela junção).
 * seriesSkipped: excluída só neste mês; o número nunca volta a ser criado.
 */
type StoredCommitment = Omit<Commitment, 'payment' | 'series'> & {
  deletedAt?: string;
  seriesId: string | null;
  occurrenceNumber: number | null;
  seriesSkipped: boolean;
};
/** Série guardada sem o que é calculado (vigências, números pulados, contagens). */
type StoredSeries = Omit<CommitmentSeries, 'terms' | 'skippedNumbers' | 'paidCount' | 'openCount' | 'generating'> & { deletedAt?: string };
/** Vigência: nunca editada; "esta e as próximas" marca as substituídas. */
type StoredTerm = SeriesTerm & { id: string; seriesId: string; contextId: string; createdAt: string; supersededAt?: string };

const NATURES: readonly string[] = ['conta', 'financiamento', 'compra_parcelada', 'outro_parcelamento'];
const SERIES_ACTIONS: readonly string[] = ['criar_serie', 'alterar_serie', 'encerrar_serie', 'excluir_serie'];

export interface MemoryRepositoryOptions {
  actorId: string;
  displayName: string;
  timeZone?: string;
  /** Dia atual usado para recusar datas futuras e para a janela de geração dos gastos fixos. */
  today: () => IsoDate;
  /** Atraso artificial (ms) para exibir estados de envio no protótipo. */
  latencyMs?: number;
}

/**
 * Repositório em memória com as mesmas regras do banco:
 * idempotência por (pessoa, chave), versão contra sobrescrita, exclusão lógica e validação.
 * Contas a pagar seguem as funções do banco (D-021): pagar e desfazer são atômicos e mantêm a invariante I1.
 * Gastos fixos seguem D-024: ocorrências são contas a pagar comuns, criadas na janela de geração, com S1 a S8.
 * Usado na demonstração (acesso simulado) e nos testes.
 */
export class MemoryRepository implements RecordsRepository {
  private space: PersonalSpace | null = null;
  private records = new Map<string, StoredRecord>();
  private commitments = new Map<string, StoredCommitment>();
  private seriesById = new Map<string, StoredSeries>();
  private terms = new Map<string, StoredTerm>();
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

  /** Ids com tamanho fixo: a ordem do texto é a ordem de criação (desempate das listas). */
  private id(prefix: string) {
    this.seq += 1;
    return `${prefix}-${this.seq.toString(36).padStart(4, '0')}`;
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
   * primeira mutação e as mutações rodam em sequência, sem await. Objetos guardados nunca são alterados
   * no lugar (sempre substituídos), então a cópia rasa dos mapas basta. Se algo falhar, inclusive as
   * invariantes I1 e S1 a S8, registros, contas a pagar, séries, vigências e operações voltam ao estado anterior.
   */
  private async write<T>(fn: () => T): Promise<T> {
    await this.delay();
    const mode = this.failNextWrite;
    this.failNextWrite = null;
    if (mode === 'antes') throw new RepoError('rede');
    const saved = {
      records: new Map(this.records),
      commitments: new Map(this.commitments),
      seriesById: new Map(this.seriesById),
      terms: new Map(this.terms),
      operations: new Map(this.operations),
    };
    let result: T;
    try {
      result = fn();
      this.checkInvariants();
      this.checkTransitions(saved);
    } catch (e) {
      ({
        records: this.records,
        commitments: this.commitments,
        seriesById: this.seriesById,
        terms: this.terms,
        operations: this.operations,
      } = saved);
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
      return op && op.commitmentId && isCommitmentAction(op.action)
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
        seriesId: null,
        occurrenceNumber: null,
        seriesOverride: false,
        seriesSkipped: false,
        amountIsEstimate: false,
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
      // Sem a marca, o conteúdo da repetição é o mesmo de antes dos gastos fixos (hash idêntico ao da 0002).
      const estimate = input.amountIsEstimate ?? undefined; // nulo mantém, como p_amount_is_estimate
      const payload = estimate === undefined ? [id, expectedVersion, norm] : [id, expectedVersion, norm, estimate];
      const replay = this.replayCommitment(key, 'editar_compromisso', payload);
      if (replay) return replay;
      const current = this.liveCommitment(id);
      if (current.version !== expectedVersion) throw new RepoError('versao_desatualizada');
      if (current.status !== 'aberto') throw new RepoError('compromisso_quitado');
      // Só ausente (mantém) ou false (valor da conta informado).
      if (estimate !== undefined && estimate !== false) throw new RepoError('estimativa_invalida');
      // A janela só vale para vencimento novo: uma conta antiga continua editável.
      this.validateCommitment(norm, norm.dueOn !== current.dueOn);
      // Conta de gasto fixo: o vencimento fica no mês dela (S8), para nunca haver dois meses com a mesma conta.
      const s = current.seriesId ? this.seriesById.get(current.seriesId) : undefined;
      if (s && monthOf(norm.dueOn) !== seriesMonthOf(s, current.occurrenceNumber!)) throw new RepoError('vencimento_fora_do_mes');
      this.bumpCommitment(
        id,
        { ...norm, amountIsEstimate: estimate ?? current.amountIsEstimate, seriesOverride: current.seriesOverride || current.seriesId !== null },
        new Date().toISOString(),
      );
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
      // Conta de gasto fixo: exclui só este mês, e o número nunca volta a ser criado.
      this.bumpCommitment(id, { deletedAt: now, seriesSkipped: current.seriesId !== null }, now);
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

  async listSeries(contextId: string) {
    return this.read(() =>
      [...this.seriesById.values()]
        .filter((s) => !s.deletedAt && s.contextId === contextId && this.canRead(s.contextId))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
        .map((s) => this.toSeries(s)),
    );
  }

  async getSeries(id: string) {
    return this.read(() => {
      const s = this.seriesById.get(id);
      return s && !s.deletedAt && this.canRead(s.contextId) ? this.toSeries(s) : null;
    });
  }

  async listSeriesOccurrences(seriesId: string) {
    return this.read(() => {
      const s = this.seriesById.get(seriesId);
      if (!s || s.deletedAt || !this.canRead(s.contextId)) return [];
      return this.liveOccurrences(seriesId)
        .sort((a, b) => b.occurrenceNumber! - a.occurrenceNumber!)
        .slice(0, 60)
        .map((c) => this.toCommitment(c));
    });
  }

  async listOpenSeriesOccurrences(seriesId: string) {
    return this.read(() => {
      const s = this.seriesById.get(seriesId);
      if (!s || s.deletedAt || !this.canRead(s.contextId)) return [];
      return this.liveOccurrences(seriesId)
        .filter((c) => c.status === 'aberto')
        .sort((a, b) => a.occurrenceNumber! - b.occurrenceNumber!)
        .map((c) => this.toCommitment(c));
    });
  }

  async findSeriesOperation(key: string) {
    return this.read(() => {
      const op = this.operations.get(key);
      return op && op.seriesId && isSeriesAction(op.action) ? { action: op.action, seriesId: op.seriesId } : null;
    });
  }

  async createSeries(key: string, contextId: string, input: SeriesInput) {
    return this.write(() => {
      const norm = normalizeSeries(input);
      const payload = [contextId, norm];
      const replay = this.replaySeries(key, 'criar_serie', payload);
      if (replay) return replay;
      if (!this.canWrite(contextId)) throw new RepoError('sem_permissao');
      const today = this.opts.today();
      const code = seriesInputError(norm, today);
      if (code) throw new RepoError(code);
      const active = [...this.seriesById.values()].filter(
        (s) => !s.deletedAt && s.contextId === contextId && seriesCountsTowardLimit(s, today),
      );
      if (active.length >= SERIES_LIMIT) throw new RepoError('limite_de_gastos_fixos');
      const mensal = norm.kind === 'mensal';
      const firstNumber = mensal ? 1 : norm.firstNumber;
      const lastNumber = !mensal
        ? norm.installmentTotal
        : norm.lastMonth === null
          ? null
          : 1 + monthsBetween(norm.firstDueMonth, norm.lastMonth);
      const now = new Date().toISOString();
      const series: StoredSeries = {
        id: this.id('serie'),
        contextId,
        kind: norm.kind,
        nature: norm.nature,
        firstDueMonth: norm.firstDueMonth,
        firstNumber,
        lastNumber,
        installmentTotal: mensal ? null : norm.installmentTotal,
        currency: 'BRL',
        createdBy: this.opts.actorId,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      this.seriesById.set(series.id, series);
      this.addTerm(series, firstNumber, norm, now);
      this.saveOperation(key, 'criar_serie', payload, { contextId, recordId: null, commitmentId: null, seriesId: series.id });
      const { created } = this.materialize(series.id);
      return this.seriesResult(series.id, created);
    });
  }

  async updateSeriesFrom(
    key: string,
    id: string,
    expectedVersion: number,
    fromNumber: number,
    expectedAffected: AffectedRef[],
    input: SeriesEditInput,
  ) {
    return this.write(() => {
      const norm = normalizeSeriesEdit(input);
      const payload = [id, expectedVersion, fromNumber, normalizeRefs(expectedAffected), norm];
      const replay = this.replaySeries(key, 'alterar_serie', payload);
      if (replay) return replay;
      const s = this.liveSeries(id);
      if (s.version !== expectedVersion) throw new RepoError('versao_desatualizada');
      const max = s.lastNumber ?? s.firstNumber + monthsBetween(s.firstDueMonth, monthOf(this.opts.today())) + 12;
      if (!Number.isSafeInteger(fromNumber) || fromNumber < s.firstNumber || fromNumber > max) throw new RepoError('numero_fora_da_serie');
      const code = seriesTermError(norm);
      if (code) throw new RepoError(code);
      if (!NATURES.includes(norm.nature) || (s.kind === 'mensal') !== (norm.nature === 'conta')) throw new RepoError('natureza_invalida');
      // Afetadas: a conta escolhida (sempre) e as seguintes em aberto que não foram alteradas só no mês.
      const plan = affectedByEditFrom(this.liveOccurrences(s.id).map((c) => this.toCommitment(c)), s, fromNumber);
      if (!plan.ok) throw new RepoError(plan.code);
      if (!sameAffected(plan.affected, expectedAffected)) throw new RepoError('versao_desatualizada');
      const now = new Date().toISOString();
      for (const t of this.terms.values()) {
        if (t.seriesId === s.id && !t.supersededAt && t.fromNumber >= fromNumber) this.terms.set(t.id, { ...t, supersededAt: now });
      }
      this.addTerm(s, fromNumber, norm, now);
      for (const c of plan.changing) {
        this.bumpCommitment(
          c.id,
          {
            description: norm.description,
            category: norm.category,
            amountCents: norm.amountCents,
            amountIsEstimate: norm.amountMode === 'variavel',
            seriesOverride: false,
            dueOn: dateInMonth(seriesMonthOf(s, c.series!.number), norm.dueDay),
          },
          now,
        );
      }
      this.seriesById.set(s.id, { ...s, nature: norm.nature, version: s.version + 1, updatedAt: now });
      this.saveOperation(key, 'alterar_serie', payload, { contextId: s.contextId, recordId: null, commitmentId: null, seriesId: s.id });
      // Contas novas já nascem com a vigência nova.
      this.materialize(s.id);
      return this.seriesResult(s.id, plan.changing.length);
    });
  }

  async endSeries(key: string, id: string, expectedVersion: number, lastNumber: number | null, expectedAffected: AffectedRef[]) {
    return this.write(() => {
      const payload = [id, expectedVersion, lastNumber, normalizeRefs(expectedAffected)];
      const replay = this.replaySeries(key, 'encerrar_serie', payload);
      if (replay) return replay;
      const s = this.liveSeries(id);
      if (s.version !== expectedVersion) throw new RepoError('versao_desatualizada');
      const int = lastNumber !== null && Number.isSafeInteger(lastNumber);
      const valid =
        s.kind === 'mensal'
          ? lastNumber === null || (int && lastNumber >= 0 && lastNumber <= 600)
          : int && lastNumber >= s.firstNumber - 1 && lastNumber <= s.installmentTotal!;
      if (!valid) throw new RepoError('fim_invalido');
      // Retomar um gasto fixo que já não contava faz ele contar de novo: mesmo limite de create_series.
      const today = this.opts.today();
      if (seriesCountsTowardLimit({ ...s, lastNumber }, today) && !seriesCountsTowardLimit(s, today)) {
        const others = [...this.seriesById.values()].filter(
          (o) => o.id !== s.id && !o.deletedAt && o.contextId === s.contextId && seriesCountsTowardLimit(o, today),
        );
        if (others.length >= SERIES_LIMIT) throw new RepoError('limite_de_gastos_fixos');
      }
      // Primeiro a seleção (trava, no banco), só então a conferência: conta paga depois recusa.
      const plan = affectedByEnd(this.liveOccurrences(s.id).map((c) => this.toCommitment(c)), s, lastNumber);
      if (!plan.ok) throw new RepoError(plan.code);
      if (!sameAffected(plan.affected, expectedAffected)) throw new RepoError('versao_desatualizada');
      const now = new Date().toISOString();
      // Sem a marca "excluída só neste mês": retomar recria estas contas dentro da janela.
      for (const c of plan.removed) this.bumpCommitment(c.id, { deletedAt: now }, now);
      this.seriesById.set(s.id, { ...s, lastNumber, version: s.version + 1, updatedAt: now });
      this.saveOperation(key, 'encerrar_serie', payload, { contextId: s.contextId, recordId: null, commitmentId: null, seriesId: s.id });
      this.materialize(s.id);
      return this.seriesResult(s.id, plan.removed.length);
    });
  }

  async deleteSeries(key: string, id: string, expectedVersion: number, expectedAffected: AffectedRef[]) {
    return this.write(() => {
      const payload = [id, expectedVersion, normalizeRefs(expectedAffected)];
      const replay = this.replaySeries(key, 'excluir_serie', payload);
      if (replay) return replay;
      const s = this.liveSeries(id);
      if (s.version !== expectedVersion) throw new RepoError('versao_desatualizada');
      const plan = affectedByDelete(this.liveOccurrences(s.id).map((c) => this.toCommitment(c)), s);
      if (!plan.ok) throw new RepoError(plan.code);
      if (!sameAffected(plan.affected, expectedAffected)) throw new RepoError('versao_desatualizada');
      const now = new Date().toISOString();
      for (const c of plan.removed) this.bumpCommitment(c.id, { deletedAt: now }, now);
      this.seriesById.set(s.id, { ...s, version: s.version + 1, updatedAt: now, deletedAt: now });
      this.saveOperation(key, 'excluir_serie', payload, { contextId: s.contextId, recordId: null, commitmentId: null, seriesId: s.id });
      return this.seriesResult(s.id, plan.removed.length);
    });
  }

  /** Como sync_series_occurrences: leitura basta; a autoria e as regras são da série. Não grava operação. */
  async syncSeriesOccurrences(contextId: string) {
    return this.write(() => {
      if (!this.canRead(contextId)) throw new RepoError('sem_permissao');
      let created = 0;
      let createdOverdue = 0;
      const live = [...this.seriesById.values()].filter((s) => s.contextId === contextId && !s.deletedAt);
      for (const s of live.sort((a, b) => a.id.localeCompare(b.id))) {
        const r = this.materialize(s.id);
        created += r.created;
        createdOverdue += r.createdOverdue;
      }
      return { created, createdOverdue };
    });
  }

  /**
   * Invariantes do vínculo (no banco: restrição adiada, FK composta e checagem de tipo).
   * I1: conta paga, não excluída, com exatamente 1 gasto vivo vinculado, ou em aberto com 0.
   * I2: o gasto vinculado é despesa do mesmo contexto. Lança Error('vinculo_inconsistente').
   * S1, S2, S4, S5, S6 e S8 dos gastos fixos (S3 e S7 comparam com o estado anterior em checkTransitions).
   * Lança Error('serie_inconsistente').
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
    this.checkSeriesInvariants();
  }

  private checkSeriesInvariants() {
    const fail = () => {
      throw new Error('serie_inconsistente');
    };
    for (const s of this.seriesById.values()) {
      // Forma da série (commitment_series_forma).
      const shapeOk =
        s.kind === 'mensal'
          ? s.nature === 'conta' && s.installmentTotal === null && s.firstNumber === 1 && (s.lastNumber === null || (s.lastNumber >= 0 && s.lastNumber <= 600))
          : s.nature !== 'conta' &&
            s.installmentTotal !== null &&
            s.installmentTotal >= 2 &&
            s.installmentTotal <= 480 &&
            s.firstNumber <= s.installmentTotal &&
            s.lastNumber !== null &&
            s.lastNumber >= s.firstNumber - 1 &&
            s.lastNumber <= s.installmentTotal;
      if (!shapeOk) fail();
      // S5: vigência viva em firstNumber, nenhuma viva antes dele e no máximo uma viva por número.
      const live = [...this.terms.values()].filter((t) => t.seriesId === s.id && !t.supersededAt);
      if (!live.some((t) => t.fromNumber === s.firstNumber) || live.some((t) => t.fromNumber < s.firstNumber)) fail();
      if (new Set(live.map((t) => t.fromNumber)).size !== live.length) fail();
    }
    for (const t of this.terms.values()) {
      if (this.seriesById.get(t.seriesId)?.contextId !== t.contextId) fail(); // S2
    }
    const liveKeys = new Set<string>();
    for (const c of this.commitments.values()) {
      if (c.seriesId === null) {
        // Conta avulsa não tem número nem marcas de série (commitments_series_marcas).
        if (c.occurrenceNumber !== null || c.seriesOverride || c.seriesSkipped || c.amountIsEstimate) fail();
        continue;
      }
      const s = this.seriesById.get(c.seriesId);
      if (!s || s.contextId !== c.contextId || c.occurrenceNumber === null) fail(); // S2
      if (c.seriesSkipped && !c.deletedAt) fail(); // excluída só neste mês é sempre excluída
      if (c.deletedAt) continue;
      const n = c.occurrenceNumber!;
      const key = `${c.seriesId}|${n}`;
      if (liveKeys.has(key)) fail(); // S1
      liveKeys.add(key);
      if (s!.deletedAt) fail(); // S6
      if (n < s!.firstNumber || (s!.lastNumber !== null && n > s!.lastNumber)) fail(); // S4
      if (monthOf(c.dueOn) !== seriesMonthOf(s!, n)) fail(); // S8
    }
  }

  /**
   * Guardas de alteração (gatilhos do banco). S3: vínculo com a série e o número nunca mudam e
   * "excluída só neste mês" é permanente. S7: conta paga não muda o previsto nem a marca de estimado.
   * Série: campos de identidade imutáveis e excluída não muda mais. Vigência: só passa a substituída.
   * Lança Error('campo_imutavel').
   */
  private checkTransitions(before: { commitments: Map<string, StoredCommitment>; seriesById: Map<string, StoredSeries>; terms: Map<string, StoredTerm> }) {
    const fail = () => {
      throw new Error('campo_imutavel');
    };
    for (const [id, c] of this.commitments) {
      const old = before.commitments.get(id);
      if (!old || old === c) continue;
      if (
        old.contextId !== c.contextId ||
        old.createdBy !== c.createdBy ||
        old.createdAt !== c.createdAt ||
        old.seriesId !== c.seriesId ||
        old.occurrenceNumber !== c.occurrenceNumber ||
        (old.seriesSkipped && !c.seriesSkipped)
      ) {
        fail();
      }
      if (
        old.status === 'quitado' &&
        c.status === 'quitado' &&
        (old.amountCents !== c.amountCents ||
          old.dueOn !== c.dueOn ||
          old.description !== c.description ||
          old.category !== c.category ||
          old.amountIsEstimate !== c.amountIsEstimate)
      ) {
        fail();
      }
    }
    for (const [id, s] of this.seriesById) {
      const old = before.seriesById.get(id);
      if (!old || old === s) continue;
      if (
        old.deletedAt ||
        old.contextId !== s.contextId ||
        old.kind !== s.kind ||
        old.firstDueMonth !== s.firstDueMonth ||
        old.firstNumber !== s.firstNumber ||
        old.installmentTotal !== s.installmentTotal ||
        old.createdBy !== s.createdBy ||
        old.createdAt !== s.createdAt
      ) {
        fail();
      }
    }
    for (const [id, t] of this.terms) {
      const old = before.terms.get(id);
      if (!old || old === t) continue;
      const { supersededAt: a, ...restOld } = old;
      const { supersededAt: b, ...restNew } = t;
      if (a !== undefined || b === undefined || JSON.stringify(restOld) !== JSON.stringify(restNew)) fail();
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

  /** Devolve o estado atual da série, como clarevo_series_result(target_id, 0) (inclusive excluída). */
  private replaySeries(key: string, action: SeriesAction, payload: unknown[]): SeriesWrite | null {
    const op = this.replay(key, action, payload);
    return op ? this.seriesResult(op.seriesId!, 0) : null;
  }

  private saveOperation(
    key: string,
    action: Operation['action'],
    payload: unknown[],
    ids: Omit<Operation, 'action' | 'hash' | 'seriesId'> & { seriesId?: string },
  ) {
    this.operations.set(key, { action, hash: hash([action, ...payload]), ...ids, seriesId: ids.seriesId ?? null });
  }

  /** Série, ocorrências vivas por número crescente e quantas contas a escrita mudou. */
  private seriesResult(seriesId: string, changed: number): SeriesWrite {
    const s = this.seriesById.get(seriesId)!;
    const occurrences = this.liveOccurrences(seriesId)
      .sort((a, b) => a.occurrenceNumber! - b.occurrenceNumber!)
      .map((c) => this.toCommitment(c));
    return { series: this.toSeries(s), occurrences, changed };
  }

  private toSeries(s: StoredSeries): CommitmentSeries {
    const { deletedAt: _deleted, ...rest } = s;
    const terms = [...this.terms.values()]
      .filter((t) => t.seriesId === s.id && !t.supersededAt)
      .sort((a, b) => a.fromNumber - b.fromNumber)
      .map(({ fromNumber, description, category, amountCents, amountMode, dueDay }) => ({
        fromNumber,
        description,
        category,
        amountCents,
        amountMode,
        dueDay,
      }));
    const all = [...this.commitments.values()].filter((c) => c.seriesId === s.id);
    const live = all.filter((c) => !c.deletedAt);
    return {
      ...rest,
      terms,
      skippedNumbers: all
        .filter((c) => c.seriesSkipped)
        .map((c) => c.occurrenceNumber!)
        .sort((a, b) => a - b),
      paidCount: live.filter((c) => c.status === 'quitado').length,
      openCount: live.filter((c) => c.status === 'aberto').length,
      generating: this.isGenerating(s),
    };
  }

  /** Quem criou a série ainda pode anotar no contexto (aqui, o contexto pessoal de quem a criou). */
  private isGenerating(s: StoredSeries) {
    return s.createdBy === this.opts.actorId && this.canWrite(s.contextId);
  }

  private liveOccurrences(seriesId: string): StoredCommitment[] {
    return [...this.commitments.values()].filter((c) => c.seriesId === seriesId && !c.deletedAt);
  }

  private addTerm(s: StoredSeries, fromNumber: number, t: Omit<SeriesTerm, 'fromNumber'>, now: string) {
    const term: StoredTerm = {
      id: this.id('vig'),
      seriesId: s.id,
      contextId: s.contextId,
      fromNumber,
      description: t.description,
      category: t.category,
      amountCents: t.amountCents,
      amountMode: t.amountMode,
      dueDay: t.dueDay,
      createdAt: now,
    };
    this.terms.set(term.id, term);
  }

  /**
   * Como clarevo_materialize_series: cria as contas da janela (mês anterior ao seguinte a hoje) que ainda não
   * existem vivas nem foram excluídas só neste mês, com a vigência de cada número e a autoria de quem criou a série.
   */
  private materialize(seriesId: string): { created: number; createdOverdue: number } {
    const s = this.seriesById.get(seriesId);
    if (!s || s.deletedAt) return { created: 0, createdOverdue: 0 };
    const today = this.opts.today();
    const live = this.liveOccurrences(s.id).map((c) => this.toCommitment(c));
    let created = 0;
    let createdOverdue = 0;
    for (const o of occurrencesToMaterialize(this.toSeries(s), live, today)) {
      const now = new Date().toISOString();
      const c: StoredCommitment = {
        id: this.id('cp'),
        contextId: s.contextId,
        description: o.description,
        amountCents: o.amountCents,
        currency: 'BRL',
        dueOn: o.dueOn,
        category: o.category,
        status: 'aberto',
        seriesId: s.id,
        occurrenceNumber: o.number,
        seriesOverride: false,
        seriesSkipped: false,
        amountIsEstimate: o.amountIsEstimate,
        createdBy: s.createdBy,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      this.commitments.set(c.id, c);
      created += 1;
      if (o.dueOn < today) createdOverdue += 1;
    }
    return { created, createdOverdue };
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
    const { deletedAt: _deleted, seriesId, occurrenceNumber, seriesSkipped: _skipped, ...rest } = c;
    const r = this.livePayment(c.id);
    const s = seriesId ? this.seriesById.get(seriesId) : undefined;
    return {
      ...rest,
      series:
        s && occurrenceNumber !== null
          ? { id: s.id, number: occurrenceNumber, kind: s.kind, nature: s.nature, installmentTotal: s.installmentTotal }
          : null,
      payment: r ? { recordId: r.id, amountCents: r.amountCents, paidOn: r.occurredOn, accountId: r.accountId } : null,
    };
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

  /** Como clarevo_lock_series: sem leitura ou excluída, não revela a existência; sem escrita, sem_permissao. */
  private liveSeries(id: string) {
    const s = this.seriesById.get(id);
    if (!s || s.deletedAt || !this.canRead(s.contextId)) throw new RepoError('nao_encontrado');
    if (!this.canWrite(s.contextId)) throw new RepoError('sem_permissao');
    return s;
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

function isSeriesAction(action: Operation['action']): action is SeriesAction {
  return SERIES_ACTIONS.includes(action);
}

function isCommitmentAction(action: Operation['action']): action is CommitmentAction {
  return !isRecordAction(action) && !isSeriesAction(action);
}

/**
 * Igualdade de conjuntos {id, versão}, como `atual @> esperado and esperado @> atual` no banco:
 * ordem e repetição não importam; item sem versão, versão em texto ou lista ausente são recusados.
 */
function sameAffected(actual: readonly AffectedRef[], expected: unknown): boolean {
  if (!Array.isArray(expected)) return false;
  const keyOf = (e: unknown) => {
    const ref = e as Partial<AffectedRef> | null;
    return ref && typeof ref.id === 'string' && Number.isSafeInteger(ref.version) ? `${ref.id}|${ref.version}` : null;
  };
  const exp = new Set<string>();
  for (const e of expected) {
    const k = keyOf(e);
    if (k === null) return false;
    exp.add(k);
  }
  const act = new Set(actual.map((a) => `${a.id}|${a.version}`));
  return exp.size === act.size && [...exp].every((k) => act.has(k));
}

/** Só id e versão entram no hash, nessa ordem (o jsonb do banco também ignora a ordem das chaves). */
function normalizeRefs(refs: readonly AffectedRef[] | null): AffectedRef[] | null {
  return Array.isArray(refs) ? refs.map((r) => ({ id: r?.id, version: r?.version })) : null;
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

function normalizeSeries(input: SeriesInput): SeriesInput {
  return {
    kind: input.kind,
    nature: input.nature,
    description: input.description.trim(),
    category: trimCategory(input.category),
    amountCents: input.amountCents,
    amountMode: input.amountMode,
    dueDay: input.dueDay,
    firstDueMonth: input.firstDueMonth,
    firstNumber: input.firstNumber,
    installmentTotal: input.installmentTotal,
    lastMonth: input.lastMonth,
  };
}

function normalizeSeriesEdit(input: SeriesEditInput): SeriesEditInput {
  return {
    nature: input.nature,
    description: input.description.trim(),
    category: trimCategory(input.category),
    amountCents: input.amountCents,
    amountMode: input.amountMode,
    dueDay: input.dueDay,
  };
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
