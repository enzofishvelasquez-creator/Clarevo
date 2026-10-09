import type { IsoDate, IsoMonth } from './dates';
import { addMonths, addYearsClamped, dateInMonth, isValidIsoDate, isValidIsoMonth, monthOf, monthsBetween } from './dates';
import type { Cents } from './money';
import { MAX_RECORD_CENTS } from './money';
import type {
  Card,
  CardChargeInput,
  CardEntry,
  CardEntryInput,
  CardInput,
  CardPurchaseInput,
  CardRefundInput,
  CardStatus,
  Commitment,
  CommitmentInput,
  CommitmentSeries,
  ContextActivity,
  FinancialAccount,
  FinancialRecord,
  Goal,
  GoalInput,
  GoalMovement,
  GoalMovementInput,
  GoalMovementKind,
  GoalStatus,
  IncomeReference,
  NewGoalInput,
  OccurrenceMode,
  PaymentInput,
  PersonalSpace,
  ReceiptMatch,
  RecordInput,
  RecordKind,
  ReturnDecision,
  ReturnReviewMark,
  SavingsAnswer,
  SavingsCheck,
  SeriesEditInput,
  SeriesInput,
  SeriesTerm,
} from './records';
import type {
  AffectedRef,
  CardAction,
  CardWrite,
  CommitmentAction,
  CommitmentWrite,
  GoalAction,
  GoalWrite,
  IncomeReferenceAction,
  InvoicePaymentWrite,
  RecordsRepository,
  ReturnReviewAction,
  SavingsAction,
  SeriesAction,
  SeriesWrite,
} from './repository';
import { RepoError } from './repository';
import { referenceMonthError } from './committed';
import {
  CARDS_ACTIVE_MAX,
  CARD_CHARGE_TYPES,
  CARD_ENTRIES_MAX,
  CARD_INSTALLMENTS_MAX,
  CARD_STATUSES,
  buildInvoices,
  cardChargeError,
  cardInputError,
  cardLimitUsed,
  cardPurchaseError,
  cardRefundError,
  invoiceClosingOn,
  invoiceCommitmentDescription,
  invoiceDueOn,
  invoiceItemOf,
  invoiceMonthOf,
  invoicePeriod,
  invoiceRecordDescription,
  normalizeCardInput,
  normalizePurchaseInput,
  normalizeRefundInput,
  purchaseFirstInvoiceMonth,
  purchaseInstallments,
  receiptKeyValid,
  type Invoice,
} from './cards';
import {
  GOAL_MOVEMENT_KINDS,
  GOAL_NAME_MAX,
  GOAL_NOTE_MAX,
  GOAL_STATUSES,
  GOAL_TYPES,
  ESSENTIAL_BASE_SOURCES,
  RESERVE_MONTHS_MAX,
  RESERVE_MONTHS_MIN,
  firstNegativeDay,
  goalComposition,
  goalInputError,
  goalMovementError,
  goalTargetOf,
  initialMovementError,
  normalizeGoalNote,
  type GoalMovementChange,
} from './goals';
import { PARTS_PER_YEAR_MAX } from './records';
import { isLongAbsence, isReviewableMonth, monthsOverview as overviewOf } from './retorno';
import { savingsAnswerError, savingsAskAgainOn } from './savings';
import {
  ANNUAL_MAX_YEARS,
  SERIES_LIMIT,
  affectedByDelete,
  affectedByEditFrom,
  affectedByEnd,
  affectedByYear,
  editFromMaxNumber,
  occurrencesToMaterialize,
  seriesCountsTowardLimit,
  seriesMonthOf,
  termFor,
} from './series';
import { dueDateBounds, seriesInputError, seriesTermError } from './validation';

type RecordAction = 'criar' | 'editar' | 'excluir';

interface Operation {
  action: RecordAction | CommitmentAction | SeriesAction | ReturnReviewAction | IncomeReferenceAction | GoalAction | SavingsAction | CardAction;
  hash: string;
  contextId: string;
  recordId: string | null;
  commitmentId: string | null;
  /** Alvo genérico (target_id): a série nas ações de gasto fixo. */
  seriesId: string | null;
  /** Alvo genérico (target_id): a renda de referência nas ações de renda de referência. */
  referenceId: string | null;
  /** Ações de metas: a meta e, nas ações de movimento, o movimento (target_id). */
  goalId: string | null;
  movementId: string | null;
  /** Ações de cartões: o cartão e, nas ações de lançamento, o lançamento (target_id e entry_id). */
  cardId: string | null;
  entryId: string | null;
}

type StoredRecord = FinancialRecord & { deletedAt?: string };
/**
 * Conta a pagar guardada sem o pagamento (lido do gasto vivo vinculado) e sem os dados da série (lidos pela junção).
 * seriesSkipped: excluída só neste mês; o número nunca volta a ser criado.
 */
type StoredCommitment = Omit<Commitment, 'payment' | 'series' | 'invoice'> & {
  deletedAt?: string;
  seriesId: string | null;
  occurrenceNumber: number | null;
  seriesSkipped: boolean;
  /** Fatura de cartão (cartão e mês do vencimento); null nas outras contas. Imutável. */
  invoiceCardId: string | null;
  invoiceMonth: IsoMonth | null;
  /** Fechamento da fatura quando a conta foi mantida pela última vez (card_closing_on): base da marca "estimado". */
  cardClosingOn: IsoDate | null;
};
/** Série guardada sem o que é calculado (vigências, números pulados, contagens). */
type StoredSeries = Omit<CommitmentSeries, 'terms' | 'skippedNumbers' | 'paidCount' | 'openCount' | 'generating'> & { deletedAt?: string };
/** Vigência: nunca editada; "esta e as próximas" marca as substituídas. */
type StoredTerm = SeriesTerm & { id: string; seriesId: string; contextId: string; createdAt: string; supersededAt?: string };
/** Renda de referência (income_references): exclusão lógica; no máximo uma viva por contexto e mês. */
type StoredIncomeReference = IncomeReference & { deletedAt?: string; deletedBy?: string };
/** Meta (goals) sem os totais de goal_items, que são calculados dos movimentos vivos. */
type StoredGoal = Omit<
  Goal,
  'savedCents' | 'initialCents' | 'depositsCents' | 'withdrawalsCents' | 'incomeCents' | 'appreciationCents' | 'depreciationCents' | 'lastMovementOn'
> & { deletedAt?: string; deletedBy?: string };
/** Movimento de meta (goal_movements): exclusão lógica. */
type StoredGoalMovement = GoalMovement & { deletedAt?: string; deletedBy?: string };
/** Cartão (cards) sem o que é calculado (card_items: limite usado e fatura atual) e lançamento do cartão (card_entries): exclusão lógica. */
type StoredCard = Omit<Card, 'usedCents' | 'currentMonth' | 'currentClosingOn' | 'currentDueOn'> & { deletedAt?: string; deletedBy?: string };
type StoredCardEntry = CardEntry & { deletedAt?: string; deletedBy?: string };

const NATURES: readonly string[] = ['conta', 'financiamento', 'compra_parcelada', 'outro_parcelamento'];
const SERIES_ACTIONS: readonly string[] = ['criar_serie', 'alterar_serie', 'encerrar_serie', 'excluir_serie', 'informar_ano', 'tirar_ano'];
const GOAL_ACTIONS: readonly string[] = [
  'criar_meta',
  'alterar_meta',
  'situacao_meta',
  'excluir_meta',
  'registrar_movimento_meta',
  'alterar_movimento_meta',
  'excluir_movimento_meta',
];
const CARD_ACTIONS: readonly string[] = [
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
const COMMITMENT_ACTIONS: readonly string[] = [
  'criar_compromisso',
  'editar_compromisso',
  'excluir_compromisso',
  'pagar_compromisso',
  'desfazer_pagamento',
  'criar_ocorrencia',
];

export interface MemoryRepositoryOptions {
  actorId: string;
  displayName: string;
  timeZone?: string;
  /**
   * Dia atual (no fuso da pessoa) usado para recusar datas futuras, para a janela de geração dos gastos fixos e para a
   * atividade da revisão dos últimos meses. Pode mudar entre chamadas (testes e cenário de demonstração).
   */
  today: () => IsoDate;
  /** Atraso artificial (ms) para exibir estados de envio no protótipo. */
  latencyMs?: number;
}

/**
 * Repositório em memória com as mesmas regras do banco:
 * idempotência por (pessoa, chave), versão contra sobrescrita, exclusão lógica e validação.
 * Contas a pagar seguem as funções do banco (D-021): pagar e desfazer são atômicos e mantêm a invariante I1.
 * Gastos fixos seguem D-024 e contas do ano D-029: ocorrências são contas a pagar comuns, criadas na janela de geração,
 * com S1 a S10.
 * Revisão dos últimos meses (D-030): toda operação gravada, menos a decisão da revisão, atualiza a atividade da pessoa no
 * contexto (como o gatilho clarevo_track_activity); a geração não grava operação e não mexe nela.
 * Renda de referência (D-026): set_income_reference e delete_income_reference, com versão, exclusão lógica e no máximo
 * uma viva por contexto e mês.
 * Metas (D-027): as sete funções de metas, com G1 a G6 (saldo dia a dia nunca negativo, mesmo contexto, nenhuma escrita
 * em registros ou contas a pagar, meta excluída sem movimento vivo, meta arquivada sem movimento novo e no máximo uma
 * reserva não arquivada por contexto). Movimentos nunca mexem em registros, contas a pagar nem na versão da meta.
 * Plano de guardar (spec7): set_savings_answer, uma resposta viva por contexto, só da própria pessoa; não conta como
 * anotação na atividade (como a decisão da revisão) e não mexe em nenhum total.
 * Cartões (D-037): as onze funções de cartões. A fatura é uma conta a pagar (commitments com cartão e mês) mantida na
 * mesma transação de cada escrita do cartão; update_commitment, delete_commitment, pay_commitment e
 * undo_commitment_payment recusam essa conta (conta_de_fatura) e update_record e delete_record recusam o gasto de um
 * pagamento de fatura (pagamento_de_fatura). Compra no cartão nunca cria gasto: só o pagamento da fatura entra em Pago.
 * Usado na demonstração (acesso simulado) e nos testes.
 */
export class MemoryRepository implements RecordsRepository {
  private space: PersonalSpace | null = null;
  private records = new Map<string, StoredRecord>();
  private commitments = new Map<string, StoredCommitment>();
  private seriesById = new Map<string, StoredSeries>();
  private terms = new Map<string, StoredTerm>();
  private operations = new Map<string, Operation>();
  /** context_activity e return_reviews da pessoa (só ela usa este repositório), por contexto. */
  private activity = new Map<string, ContextActivity>();
  private reviews = new Map<string, ReturnReviewMark>();
  private incomeRefs = new Map<string, StoredIncomeReference>();
  private goals = new Map<string, StoredGoal>();
  private goalMovements = new Map<string, StoredGoalMovement>();
  /** savings_checks da pessoa (só ela usa este repositório), por contexto: uma resposta viva por contexto. */
  private savingsChecks = new Map<string, SavingsCheck>();
  private cards = new Map<string, StoredCard>();
  private cardEntries = new Map<string, StoredCardEntry>();
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
   * invariantes I1 e S1 a S10, registros, contas a pagar, séries, vigências e operações voltam ao estado anterior.
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
      activity: new Map(this.activity),
      reviews: new Map(this.reviews),
      incomeRefs: new Map(this.incomeRefs),
      goals: new Map(this.goals),
      goalMovements: new Map(this.goalMovements),
      savingsChecks: new Map(this.savingsChecks),
      cards: new Map(this.cards),
      cardEntries: new Map(this.cardEntries),
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
        activity: this.activity,
        reviews: this.reviews,
        incomeRefs: this.incomeRefs,
        goals: this.goals,
        goalMovements: this.goalMovements,
        savingsChecks: this.savingsChecks,
        cards: this.cards,
        cardEntries: this.cardEntries,
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
      // Com a chave da nota (D-038) o conteúdo ganha o último item; sem ela, o hash é o de antes.
      const receipt = input.receiptKey?.trim() ? input.receiptKey.trim() : null;
      const payload = receipt === null ? [contextId, kind, norm] : [contextId, kind, norm, receipt];
      const replay = this.replayRecord(key, 'criar', payload);
      if (replay) return replay;
      if (!this.canWrite(contextId)) throw new RepoError('sem_permissao');
      this.validate(contextId, norm);
      if (receipt !== null) {
        if (kind !== 'despesa' || !receiptKeyValid(receipt)) throw new RepoError('chave_de_nota_invalida');
        this.checkReceiptFree(contextId, receipt);
      }
      const now = new Date().toISOString();
      const record: FinancialRecord = {
        id: this.id('reg'),
        contextId,
        kind,
        status: 'realizado',
        currency: 'BRL',
        ...norm,
        commitmentId: null,
        invoice: null,
        receiptKey: receipt,
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
      // Gasto de pagamento de fatura: valor, descrição e categoria vêm da fatura; só a conta de saída e a data mudam.
      if (current.invoice && (norm.amountCents !== current.amountCents || norm.description !== current.description || norm.category !== current.category)) {
        throw new RepoError('pagamento_de_fatura');
      }
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
      // Pagamento de fatura: o caminho é undo_invoice_payment, que também desfaz o saldo anterior.
      if (current.invoice) throw new RepoError('pagamento_de_fatura');
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
        invoiceCardId: null,
        invoiceMonth: null,
        cardClosingOn: null,
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
      // Fatura de cartão: muda só pelos lançamentos do cartão.
      if (current.invoiceCardId) throw new RepoError('conta_de_fatura');
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
      if (current.invoiceCardId) throw new RepoError('conta_de_fatura');
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
      // Pagar a fatura sem distribuir o saldo seria contar o pagamento sem o saldo anterior: só pay_invoice.
      if (current.invoiceCardId) throw new RepoError('conta_de_fatura');
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
        invoice: null,
        receiptKey: null,
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
      if (current.invoiceCardId) throw new RepoError('conta_de_fatura');
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
      // Sem parcelas por ano, o conteúdo da repetição é o mesmo do Ciclo A (hash idêntico, como create_series).
      const { partsPerYear: _k, ...cycleA } = norm;
      const payload = [contextId, norm.partsPerYear === null ? cycleA : norm];
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
      let firstNumber: number;
      let lastNumber: number | null;
      switch (norm.kind) {
        case 'mensal':
          firstNumber = 1;
          lastNumber = norm.lastMonth === null ? null : 1 + monthsBetween(norm.firstDueMonth, norm.lastMonth);
          break;
        case 'parcelada':
          firstNumber = norm.firstNumber;
          lastNumber = norm.installmentTotal;
          break;
        case 'anual': {
          // Último ano: (meses(âncora, último mês) / 12 + 1)·k.
          firstNumber = norm.firstNumber;
          const anchor = addMonths(norm.firstDueMonth, -(firstNumber - 1));
          lastNumber = norm.lastMonth === null ? null : (Math.floor(monthsBetween(anchor, norm.lastMonth) / 12) + 1) * norm.partsPerYear!;
          break;
        }
        default:
          throw new RepoError('tipo_invalido');
      }
      const now = new Date().toISOString();
      const series: StoredSeries = {
        id: this.id('serie'),
        contextId,
        kind: norm.kind,
        nature: norm.nature,
        firstDueMonth: norm.firstDueMonth,
        firstNumber,
        lastNumber,
        installmentTotal: norm.kind === 'parcelada' ? norm.installmentTotal : null,
        partsPerYear: norm.kind === 'anual' ? norm.partsPerYear : null,
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
      // Até o último número; sem término, até 12 meses depois do mês atual (reajuste programado). Conta do ano: até a
      // última parcela do ano que começa até 12 meses depois do mês atual.
      const max = editFromMaxNumber(s, this.opts.today());
      if (!Number.isSafeInteger(fromNumber) || fromNumber < s.firstNumber || fromNumber > max) throw new RepoError('numero_fora_da_serie');
      const code = seriesTermError(norm);
      if (code) throw new RepoError(code);
      // Gasto fixo e conta do ano: 'conta'; parcelamento: um dos tipos de parcelamento.
      if (!NATURES.includes(norm.nature) || (s.kind !== 'parcelada') !== (norm.nature === 'conta')) throw new RepoError('natureza_invalida');
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
      let valid: boolean;
      switch (s.kind) {
        case 'mensal':
          valid = lastNumber === null || (int && lastNumber >= 0 && lastNumber <= 600);
          break;
        case 'parcelada':
          valid = int && lastNumber >= s.firstNumber - 1 && lastNumber <= s.installmentTotal!;
          break;
        case 'anual':
          valid = lastNumber === null || (int && lastNumber >= s.firstNumber - 1 && lastNumber <= ANNUAL_MAX_YEARS * s.partsPerYear!);
          break;
        default:
          valid = false;
      }
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

  /** Como inform_series_year: muda as parcelas do ano em aberto e estimadas; a série não muda de versão. */
  async informSeriesYear(key: string, seriesId: string, number: number, expectedAffected: AffectedRef[], amountCents: Cents) {
    return this.write(() => {
      const payload = [seriesId, number, normalizeRefs(expectedAffected), amountCents];
      const replay = this.replaySeries(key, 'informar_ano', payload);
      if (replay) return replay;
      return this.writeYear(key, 'informar_ano', payload, seriesId, number, expectedAffected, amountCents);
    });
  }

  /** Como skip_series_year: exclui as parcelas do ano em aberto com a marca "excluída só neste mês". */
  async skipSeriesYear(key: string, seriesId: string, number: number, expectedAffected: AffectedRef[]) {
    return this.write(() => {
      const payload = [seriesId, number, normalizeRefs(expectedAffected)];
      const replay = this.replaySeries(key, 'tirar_ano', payload);
      if (replay) return replay;
      return this.writeYear(key, 'tirar_ano', payload, seriesId, number, expectedAffected, null);
    });
  }

  /**
   * Corpo comum de informar e tirar (mesma ordem do banco): trava e permissão da série, tipo, número, valor, conjunto
   * afetado (vazio ou diferente do confirmado: versao_desatualizada), escrita e operação com target_id.
   */
  private writeYear(
    key: string,
    action: 'informar_ano' | 'tirar_ano',
    payload: unknown[],
    seriesId: string,
    number: number,
    expectedAffected: AffectedRef[],
    amountCents: Cents | null,
  ): SeriesWrite {
    const s = this.liveSeries(seriesId);
    if (s.kind !== 'anual') throw new RepoError('tipo_invalido');
    if (!Number.isSafeInteger(number) || number < s.firstNumber || (s.lastNumber !== null && number > s.lastNumber)) {
      throw new RepoError('numero_fora_da_serie');
    }
    if (action === 'informar_ano') {
      if (!Number.isSafeInteger(amountCents) || amountCents! < 1) throw new RepoError('valor_invalido');
      if (amountCents! > MAX_RECORD_CENTS) throw new RepoError('valor_acima_do_limite');
    }
    const plan = affectedByYear(
      this.liveOccurrences(s.id).map((c) => this.toCommitment(c)),
      s,
      number,
      action === 'informar_ano' ? 'informar' : 'tirar',
    );
    const actual = plan.ok ? plan.affected : [];
    if (actual.length === 0 || !sameAffected(actual, expectedAffected)) throw new RepoError('versao_desatualizada');
    const now = new Date().toISOString();
    for (const c of plan.ok ? plan.changing : []) {
      this.bumpCommitment(
        c.id,
        action === 'informar_ano'
          ? { amountCents: amountCents!, amountIsEstimate: false, seriesOverride: true }
          : { deletedAt: now, seriesSkipped: true },
        now,
      );
    }
    this.saveOperation(key, action, payload, { contextId: s.contextId, recordId: null, commitmentId: null, seriesId: s.id });
    return this.seriesResult(s.id, actual.length);
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
      // Faturas de cartão em aberto: o dia do fechamento passa sem gravação, então a marca "estimado" (hoje até o fechamento)
      // é atualizada aqui, com versão + 1 (como sync_series_occurrences na migração 0008).
      const today = this.opts.today();
      const now = new Date().toISOString();
      for (const c of [...this.commitments.values()]) {
        if (c.contextId !== contextId || !c.invoiceCardId || c.deletedAt || c.status !== 'aberto' || c.cardClosingOn === null) continue;
        const estimate = today <= c.cardClosingOn;
        if (c.amountIsEstimate !== estimate) this.bumpCommitment(c.id, { amountIsEstimate: estimate }, now);
      }
      return { created, createdOverdue };
    });
  }

  /** Como as leituras de context_activity e return_reviews (RLS: só a própria pessoa; sem leitura, nada). */
  async getReturnReviewState(contextId: string) {
    return this.read(() =>
      this.canRead(contextId)
        ? { activity: this.activity.get(contextId) ?? null, mark: this.reviews.get(contextId) ?? null }
        : { activity: null, mark: null },
    );
  }

  /** Como months_overview: primeiro o período (até 12 meses), depois a permissão. */
  async monthsOverview(contextId: string, from: IsoMonth, to: IsoMonth) {
    return this.read(() => {
      // clarevo_months_between(p_from, p_to) > 11: no máximo 12 meses.
      if (!isValidIsoMonth(from) || !isValidIsoMonth(to) || to < from || monthsBetween(from, to) > 11) throw new RepoError('periodo_invalido');
      if (!this.canRead(contextId)) throw new RepoError('sem_permissao');
      const live = [...this.records.values()].filter((r) => !r.deletedAt).map(strip);
      return overviewOf(live, contextId, from, to);
    });
  }

  /** Contas vivas (abertas e pagas) com vencimento de from-01 até o fim de to, por vencimento. */
  async listCommitmentsDueBetween(contextId: string, from: IsoMonth, to: IsoMonth) {
    const start = `${from}-01`;
    const endExclusive = `${addMonths(to, 1)}-01`;
    return this.read(() =>
      [...this.commitments.values()]
        .filter((c) => !c.deletedAt && c.contextId === contextId && this.canRead(c.contextId) && c.dueOn >= start && c.dueOn < endExclusive)
        .sort(byDue)
        .map((c) => this.toCommitment(c)),
    );
  }

  /**
   * Como create_series_occurrence: conta de um dos 11 meses fechados anteriores ao atual, com a vigência do número e a
   * autoria de quem criou a série; 'nao_houve' grava a conta excluída só neste mês. A versão da série não muda.
   * Ordem do banco: trava e permissão da série, versão, modo, número, mês, autoria, existência.
   */
  async createSeriesOccurrence(key: string, seriesId: string, expectedSeriesVersion: number, n: number, mode: OccurrenceMode) {
    return this.write(() => {
      const payload = [seriesId, expectedSeriesVersion, n, mode];
      const replay = this.replayCommitment(key, 'criar_ocorrencia', payload);
      if (replay) return replay;
      const s = this.liveSeries(seriesId);
      if (s.version !== expectedSeriesVersion) throw new RepoError('versao_desatualizada');
      if (mode !== 'aberta' && mode !== 'nao_houve') throw new RepoError('modo_invalido');
      if (!Number.isSafeInteger(n) || n < s.firstNumber || (s.lastNumber !== null && n > s.lastNumber)) throw new RepoError('numero_fora_da_serie');
      const month = seriesMonthOf(s, n);
      if (!isReviewableMonth(month, this.opts.today())) throw new RepoError('mes_fora_da_revisao');
      // A conta leva a autoria de quem criou a série, que precisa poder anotar no contexto.
      if (!this.isGenerating(s)) throw new RepoError('sem_permissao');
      const exists = [...this.commitments.values()].some(
        (c) => c.seriesId === s.id && c.occurrenceNumber === n && (!c.deletedAt || c.seriesSkipped),
      );
      if (exists) throw new RepoError('ocorrencia_existente');
      const term = termFor(this.toSeries(s).terms, n);
      if (!term) throw new Error('serie_inconsistente');
      const now = new Date().toISOString();
      const skip = mode === 'nao_houve';
      const c: StoredCommitment = {
        id: this.id('cp'),
        contextId: s.contextId,
        description: term.description,
        amountCents: term.amountCents,
        currency: 'BRL',
        dueOn: dateInMonth(month, term.dueDay),
        category: term.category,
        status: 'aberto',
        seriesId: s.id,
        occurrenceNumber: n,
        seriesOverride: false,
        seriesSkipped: skip,
        amountIsEstimate: term.amountMode === 'variavel',
        invoiceCardId: null,
        invoiceMonth: null,
        cardClosingOn: null,
        createdBy: s.createdBy,
        version: 1,
        createdAt: now,
        updatedAt: now,
        ...(skip ? { deletedAt: now } : {}),
      };
      this.commitments.set(c.id, c);
      this.saveOperation(key, 'criar_ocorrencia', payload, { contextId: s.contextId, recordId: null, commitmentId: c.id, seriesId: s.id });
      return this.commitmentResult(c.id, null);
    });
  }

  /**
   * Como decide_return_review: basta leitura no contexto; versão 0 = ainda não existe. O mês revisado e o dia da
   * decisão nunca recuam. Não conta como anotação.
   */
  async decideReturnReview(key: string, contextId: string, expectedVersion: number, reviewedThrough: IsoMonth, decision: ReturnDecision) {
    return this.write(() => {
      const payload = [contextId, expectedVersion, reviewedThrough, decision];
      const replayed = this.replay(key, 'decidir_revisao', payload);
      if (replayed) return this.reviews.get(replayed.contextId)!;
      if (!this.canRead(contextId)) throw new RepoError('sem_permissao');
      if (decision !== 'atualizou' && decision !== 'seguiu') throw new RepoError('decisao_invalida');
      const today = this.opts.today();
      if (typeof reviewedThrough !== 'string' || !isValidIsoMonth(reviewedThrough) || !isReviewableMonth(reviewedThrough, today)) {
        throw new RepoError('mes_invalido');
      }
      const current = this.reviews.get(contextId);
      if (expectedVersion !== (current?.version ?? 0)) throw new RepoError('versao_desatualizada');
      const mark: ReturnReviewMark = current
        ? {
            reviewedThrough: current.reviewedThrough > reviewedThrough ? current.reviewedThrough : reviewedThrough,
            decision,
            decidedOn: current.decidedOn > today ? current.decidedOn : today,
            version: current.version + 1,
          }
        : { reviewedThrough, decision, decidedOn: today, version: 1 };
      this.reviews.set(contextId, mark);
      this.saveOperation(key, 'decidir_revisao', payload, { contextId, recordId: null, commitmentId: null });
      return mark;
    });
  }

  /** Como a leitura de income_references (RLS): vivas do contexto, por mês de início crescente; sem leitura, nada. */
  async listIncomeReferences(contextId: string) {
    return this.read(() =>
      [...this.incomeRefs.values()]
        .filter((r) => !r.deletedAt && r.contextId === contextId && this.canRead(r.contextId))
        .sort((a, b) => a.fromMonth.localeCompare(b.fromMonth) || a.id.localeCompare(b.id))
        .map(stripReference),
    );
  }

  /**
   * Como set_income_reference: versão 0 cria; maior que 0 altera a referência viva do mês (fromMonth não muda: para
   * outro mês, exclua e crie). Ordem do banco: repetição, escrita no contexto, mês, faixa, valor, tipo, versão.
   */
  async setIncomeReference(key: string, contextId: string, fromMonth: IsoMonth, expectedVersion: number, amountCents: Cents, varies: boolean) {
    return this.write(() => {
      const payload = [contextId, fromMonth, expectedVersion, amountCents, varies];
      const replayed = this.replay(key, 'definir_renda_referencia', payload);
      if (replayed) return stripReference(this.incomeRefs.get(replayed.referenceId!)!);
      if (!this.canWrite(contextId)) throw new RepoError('sem_permissao');
      const monthError = referenceMonthError(fromMonth, this.opts.today());
      if (monthError) throw new RepoError(monthError);
      if (!Number.isSafeInteger(amountCents) || amountCents < 1) throw new RepoError('valor_invalido');
      if (amountCents > MAX_RECORD_CENTS) throw new RepoError('valor_acima_do_limite');
      if (typeof varies !== 'boolean') throw new RepoError('tipo_invalido');
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new RepoError('versao_desatualizada');
      const current = [...this.incomeRefs.values()].find((r) => !r.deletedAt && r.contextId === contextId && r.fromMonth === fromMonth);
      if (expectedVersion !== (current?.version ?? 0)) throw new RepoError('versao_desatualizada');
      const now = new Date().toISOString();
      const next: StoredIncomeReference = current
        ? { ...current, amountCents, varies, version: current.version + 1, updatedAt: now }
        : {
            id: this.id('ref'),
            contextId,
            fromMonth,
            amountCents,
            varies,
            createdBy: this.opts.actorId,
            version: 1,
            createdAt: now,
            updatedAt: now,
          };
      this.incomeRefs.set(next.id, next);
      this.saveOperation(key, 'definir_renda_referencia', payload, { contextId, recordId: null, commitmentId: null, referenceId: next.id });
      return stripReference(next);
    });
  }

  /** Como delete_income_reference: exclusão lógica com versão; a referência anterior volta a valer. */
  async deleteIncomeReference(key: string, id: string, expectedVersion: number) {
    return this.write(() => {
      const payload = [id, expectedVersion];
      const replayed = this.replay(key, 'excluir_renda_referencia', payload);
      if (replayed) return stripReference(this.incomeRefs.get(replayed.referenceId!)!);
      const current = this.incomeRefs.get(id);
      if (!current || current.deletedAt || !this.canRead(current.contextId)) throw new RepoError('nao_encontrado');
      if (!this.canWrite(current.contextId)) throw new RepoError('sem_permissao');
      if (current.version !== expectedVersion) throw new RepoError('versao_desatualizada');
      const now = new Date().toISOString();
      const next: StoredIncomeReference = {
        ...current,
        version: current.version + 1,
        updatedAt: now,
        deletedAt: now,
        deletedBy: this.opts.actorId,
      };
      this.incomeRefs.set(id, next);
      this.saveOperation(key, 'excluir_renda_referencia', payload, { contextId: current.contextId, recordId: null, commitmentId: null, referenceId: id });
      return stripReference(next);
    });
  }

  // ---------------------------------------------------------------------------
  // Metas (D-027): mesmas regras e mesma ordem das funções do banco (goals.ts, GOAL_INPUT_CODE_ORDER)
  // ---------------------------------------------------------------------------

  /** Como a leitura de goal_items (RLS): metas vivas do contexto, por criação; sem leitura, nada. */
  async listGoals(contextId: string) {
    return this.read(() =>
      [...this.goals.values()]
        .filter((g) => !g.deletedAt && g.contextId === contextId && this.canRead(g.contextId))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
        .map((g) => this.toGoal(g)),
    );
  }

  async getGoal(id: string) {
    return this.read(() => {
      const g = this.goals.get(id);
      return g && !g.deletedAt && this.canRead(g.contextId) ? this.toGoal(g) : null;
    });
  }

  /** Movimentos vivos da meta, do mais recente ao mais antigo (data, criação, id). */
  async listGoalMovements(goalId: string) {
    return this.read(() => {
      const g = this.goals.get(goalId);
      if (!g || g.deletedAt || !this.canRead(g.contextId)) return [];
      return this.liveGoalMovements(goalId).sort(byMovementDesc).map(stripMovement);
    });
  }

  /** Movimentos vivos de todas as metas do contexto com data no mês, do mais recente ao mais antigo. */
  async listGoalMovementsInMonth(contextId: string, month: IsoMonth) {
    return this.read(() =>
      [...this.goalMovements.values()]
        .filter((m) => !m.deletedAt && m.contextId === contextId && this.canRead(m.contextId) && monthOf(m.occurredOn) === month)
        .sort(byMovementDesc)
        .map(stripMovement),
    );
  }

  async findGoalOperation(key: string) {
    return this.read(() => {
      const op = this.operations.get(key);
      return op && op.goalId && isGoalAction(op.action) ? { action: op.action, goalId: op.goalId, movementId: op.movementId } : null;
    });
  }

  /**
   * Como create_goal (migração 0007). Ordem: repetição; sem_permissao; campos (goalInputError, como
   * clarevo_validate_goal); saldo inicial (saldo_inicial_invalido, data_invalida, data_futura); reserva_ja_existe. Na
   * reserva, o alvo gravado é base × meses (targetCents nulo ou igual). Com saldo inicial > 0, o movimento
   * 'saldo_inicial' na data informada.
   */
  async createGoal(key: string, contextId: string, input: NewGoalInput) {
    return this.write(() => {
      const norm = normalizeGoalInput(input);
      const initialCents = input.initialCents ?? null;
      const initialOn = input.initialOn ?? null;
      const payload = [contextId, ...goalPayload(norm), initialCents, initialOn];
      const replayed = this.replay(key, 'criar_meta', payload);
      if (replayed) return this.goalResult(replayed.goalId!, replayed.movementId);
      if (!this.canWrite(contextId)) throw new RepoError('sem_permissao');
      const today = this.opts.today();
      const code = goalInputError(norm, today) ?? initialMovementError(initialCents, initialOn, today);
      if (code) throw new RepoError(code);
      if (norm.goalType === 'emergencia' && this.otherReserve(contextId, null)) throw new RepoError('reserva_ja_existe');
      const now = new Date().toISOString();
      const goal: StoredGoal = {
        id: this.id('meta'),
        contextId,
        goalType: norm.goalType,
        name: norm.name,
        targetCents: goalTargetOf(norm),
        targetMonth: norm.targetMonth,
        plannedMonthlyCents: norm.plannedMonthlyCents,
        essentialBaseCents: norm.essentialBaseCents,
        essentialMonths: norm.essentialMonths,
        essentialBaseSource: norm.essentialBaseSource,
        status: 'ativa',
        createdBy: this.opts.actorId,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      this.goals.set(goal.id, goal);
      let movementId: string | null = null;
      if (initialCents !== null && initialCents > 0) {
        const m = this.newMovement(goal, 'saldo_inicial', { amountCents: initialCents, occurredOn: initialOn!, note: null }, now);
        movementId = m.id;
      }
      this.saveOperation(key, 'criar_meta', payload, { contextId, recordId: null, commitmentId: null, goalId: goal.id, movementId });
      return this.goalResult(goal.id, movementId);
    });
  }

  /**
   * Como update_goal. Ordem: repetição; trava (nao_encontrado, sem_permissao); versão; campos (o intervalo do prazo só
   * quando o prazo muda); reserva_ja_existe (virar ou continuar reserva, fora de arquivada). Em qualquer situação; os
   * movimentos não mudam.
   */
  async updateGoal(key: string, goalId: string, expectedVersion: number, input: GoalInput) {
    return this.write(() => {
      const norm = normalizeGoalInput(input);
      const payload = [goalId, expectedVersion, ...goalPayload(norm)];
      const replayed = this.replay(key, 'alterar_meta', payload);
      if (replayed) return this.goalResult(replayed.goalId!, null);
      const current = this.liveGoal(goalId);
      if (current.version !== expectedVersion) throw new RepoError('versao_desatualizada');
      const code = goalInputError(norm, this.opts.today(), { checkDeadline: norm.targetMonth !== current.targetMonth });
      if (code) throw new RepoError(code);
      if (norm.goalType === 'emergencia' && current.status !== 'arquivada' && this.otherReserve(current.contextId, goalId)) {
        throw new RepoError('reserva_ja_existe');
      }
      const now = new Date().toISOString();
      this.goals.set(goalId, {
        ...current,
        goalType: norm.goalType,
        name: norm.name,
        targetCents: goalTargetOf(norm),
        targetMonth: norm.targetMonth,
        plannedMonthlyCents: norm.plannedMonthlyCents,
        essentialBaseCents: norm.essentialBaseCents,
        essentialMonths: norm.essentialMonths,
        essentialBaseSource: norm.essentialBaseSource,
        version: current.version + 1,
        updatedAt: now,
      });
      this.saveOperation(key, 'alterar_meta', payload, { contextId: current.contextId, recordId: null, commitmentId: null, goalId, movementId: null });
      return this.goalResult(goalId, null);
    });
  }

  /** Como set_goal_status: concluir, arquivar e reativar. Ordem: repetição; trava; versão; situacao_invalida; reserva_ja_existe. */
  async setGoalStatus(key: string, goalId: string, expectedVersion: number, status: GoalStatus) {
    return this.write(() => {
      const payload = [goalId, expectedVersion, status];
      const replayed = this.replay(key, 'situacao_meta', payload);
      if (replayed) return this.goalResult(replayed.goalId!, null);
      const current = this.liveGoal(goalId);
      if (current.version !== expectedVersion) throw new RepoError('versao_desatualizada');
      if (!GOAL_STATUSES.includes(status)) throw new RepoError('situacao_invalida');
      // Só ao tirar uma reserva de 'arquivada' (fora dela, G6 já garante que não há outra).
      if (current.goalType === 'emergencia' && current.status === 'arquivada' && status !== 'arquivada' && this.otherReserve(current.contextId, goalId)) {
        throw new RepoError('reserva_ja_existe');
      }
      const now = new Date().toISOString();
      this.goals.set(goalId, { ...current, status, version: current.version + 1, updatedAt: now });
      this.saveOperation(key, 'situacao_meta', payload, { contextId: current.contextId, recordId: null, commitmentId: null, goalId, movementId: null });
      return this.goalResult(goalId, null);
    });
  }

  /** Como delete_goal: exclusão lógica da meta e dos movimentos vivos (versão + 1 em cada). */
  async deleteGoal(key: string, goalId: string, expectedVersion: number) {
    return this.write(() => {
      const payload = [goalId, expectedVersion];
      const replayed = this.replay(key, 'excluir_meta', payload);
      if (replayed) return this.goalResult(replayed.goalId!, null);
      const current = this.liveGoal(goalId);
      if (current.version !== expectedVersion) throw new RepoError('versao_desatualizada');
      const now = new Date().toISOString();
      for (const m of this.liveGoalMovements(goalId)) {
        this.goalMovements.set(m.id, { ...m, version: m.version + 1, updatedAt: now, deletedAt: now, deletedBy: this.opts.actorId });
      }
      this.goals.set(goalId, { ...current, version: current.version + 1, updatedAt: now, deletedAt: now, deletedBy: this.opts.actorId });
      this.saveOperation(key, 'excluir_meta', payload, { contextId: current.contextId, recordId: null, commitmentId: null, goalId, movementId: null });
      return this.goalResult(goalId, null);
    });
  }

  /**
   * Como add_goal_movement: trava a meta (serializa o saldo), sem versão; a versão da meta não sobe. Ordem: repetição;
   * trava; meta_arquivada; tipo, valor, data e observação; saldo_da_meta_insuficiente (dia no detalhe).
   */
  async addGoalMovement(key: string, goalId: string, kind: GoalMovementKind, input: GoalMovementInput) {
    return this.write(() => {
      const norm = normalizeMovementInput(input);
      const payload = [goalId, kind, norm.amountCents, norm.occurredOn, norm.note];
      const replayed = this.replay(key, 'registrar_movimento_meta', payload);
      if (replayed) return this.goalResult(replayed.goalId!, replayed.movementId);
      const goal = this.liveGoal(goalId);
      if (goal.status === 'arquivada') throw new RepoError('meta_arquivada');
      const code = goalMovementError(kind, norm, this.opts.today());
      if (code) throw new RepoError(code);
      this.checkGoalBalance(goalId, { op: 'add', kind, amountCents: norm.amountCents, occurredOn: norm.occurredOn });
      const m = this.newMovement(goal, kind, norm, new Date().toISOString());
      this.saveOperation(key, 'registrar_movimento_meta', payload, {
        contextId: goal.contextId,
        recordId: null,
        commitmentId: null,
        goalId,
        movementId: m.id,
      });
      return this.goalResult(goalId, m.id);
    });
  }

  /**
   * Como update_goal_movement: o tipo nunca muda. Ordem: repetição; trava (meta, depois movimento); versão;
   * meta_arquivada; valor, data e observação; saldo_da_meta_insuficiente.
   */
  async updateGoalMovement(key: string, movementId: string, expectedVersion: number, input: GoalMovementInput) {
    return this.write(() => {
      const norm = normalizeMovementInput(input);
      const payload = [movementId, expectedVersion, norm.amountCents, norm.occurredOn, norm.note];
      const replayed = this.replay(key, 'alterar_movimento_meta', payload);
      if (replayed) return this.goalResult(replayed.goalId!, replayed.movementId);
      const { goal, movement } = this.liveMovement(movementId);
      if (movement.version !== expectedVersion) throw new RepoError('versao_desatualizada');
      if (goal.status === 'arquivada') throw new RepoError('meta_arquivada');
      const code = goalMovementError(movement.kind, norm, this.opts.today(), { allowInitial: true });
      if (code) throw new RepoError(code);
      this.checkGoalBalance(goal.id, { op: 'update', id: movementId, amountCents: norm.amountCents, occurredOn: norm.occurredOn });
      const now = new Date().toISOString();
      this.goalMovements.set(movementId, { ...movement, ...norm, version: movement.version + 1, updatedAt: now });
      this.saveOperation(key, 'alterar_movimento_meta', payload, {
        contextId: goal.contextId,
        recordId: null,
        commitmentId: null,
        goalId: goal.id,
        movementId,
      });
      return this.goalResult(goal.id, movementId);
    });
  }

  /** Como delete_goal_movement. Ordem: repetição; trava; versão; meta_arquivada; saldo_da_meta_insuficiente. */
  async deleteGoalMovement(key: string, movementId: string, expectedVersion: number) {
    return this.write(() => {
      const payload = [movementId, expectedVersion];
      const replayed = this.replay(key, 'excluir_movimento_meta', payload);
      if (replayed) return this.goalResult(replayed.goalId!, replayed.movementId);
      const { goal, movement } = this.liveMovement(movementId);
      if (movement.version !== expectedVersion) throw new RepoError('versao_desatualizada');
      if (goal.status === 'arquivada') throw new RepoError('meta_arquivada');
      this.checkGoalBalance(goal.id, { op: 'delete', id: movementId });
      const now = new Date().toISOString();
      this.goalMovements.set(movementId, { ...movement, version: movement.version + 1, updatedAt: now, deletedAt: now, deletedBy: this.opts.actorId });
      this.saveOperation(key, 'excluir_movimento_meta', payload, {
        contextId: goal.contextId,
        recordId: null,
        commitmentId: null,
        goalId: goal.id,
        movementId,
      });
      return this.goalResult(goal.id, movementId);
    });
  }

  // ---------------------------------------------------------------------------
  // Plano de guardar (spec7): savings_checks e set_savings_answer
  // ---------------------------------------------------------------------------

  /** Como a leitura de savings_checks (RLS: só a própria pessoa; sem leitura, nada). */
  async getSavingsCheck(contextId: string) {
    return this.read(() => (this.canRead(contextId) ? (this.savingsChecks.get(contextId) ?? null) : null));
  }

  /**
   * Como set_savings_answer (migração 0007, lida em 09/10/2026). Ordem: repetição; sem_permissao (escrita no contexto);
   * resposta_invalida; valor_invalido e valor_acima_do_limite (savingsAnswerError: 'consigo' de 100 a 999.999.999
   * centavos, as outras sem valor); versao_desatualizada (versão 0 = ainda não existe; nula, negativa ou diferente da
   * atual também; detalhe "versao_atual=N"). A resposta nova substitui a anterior, inclusive o valor. As datas vêm daqui,
   * do dia da pessoa: answeredOn = hoje e askAgainOn = hoje + 7 ('depois'), hoje + 30 ('agora_nao') ou nula ('consigo').
   * Operação sem alvo; não conta como anotação na atividade.
   */
  async setSavingsAnswer(key: string, contextId: string, expectedVersion: number, answer: SavingsAnswer, monthlyCents: Cents | null = null) {
    return this.write(() => {
      const monthly = monthlyCents ?? null;
      const payload = [contextId, expectedVersion, answer, monthly];
      const replayed = this.replay(key, 'responder_guardar', payload);
      if (replayed) return this.savingsChecks.get(replayed.contextId)!;
      if (!this.canWrite(contextId)) throw new RepoError('sem_permissao');
      const code = savingsAnswerError(answer, monthly);
      if (code) throw new RepoError(code);
      const current = this.savingsChecks.get(contextId);
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || expectedVersion !== (current?.version ?? 0)) {
        throw new RepoError('versao_desatualizada', undefined, `versao_atual=${current?.version ?? 0}`);
      }
      const today = this.opts.today();
      const now = new Date().toISOString();
      const next: SavingsCheck = {
        contextId,
        answer,
        monthlyCents: monthly,
        answeredOn: today,
        askAgainOn: savingsAskAgainOn(answer, today),
        version: (current?.version ?? 0) + 1,
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
      };
      this.savingsChecks.set(contextId, next);
      this.saveOperation(key, 'responder_guardar', payload, { contextId, recordId: null, commitmentId: null });
      return next;
    });
  }

  // ---------------------------------------------------------------------------
  // Cartões de crédito (D-037): mesmas regras e mesma ordem das funções do banco (migração 0008, cards.ts)
  // ---------------------------------------------------------------------------

  /** Como a leitura de card_items (RLS): cartões vivos do contexto, por criação, com limite usado e fatura atual; sem leitura, nada. */
  async listCards(contextId: string) {
    return this.read(() =>
      [...this.cards.values()]
        .filter((c) => !c.deletedAt && c.contextId === contextId && this.canRead(c.contextId))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
        .map((c) => this.cardView(c)),
    );
  }

  async getCard(id: string) {
    return this.read(() => {
      const c = this.cards.get(id);
      return c && !c.deletedAt && this.canRead(c.contextId) ? this.cardView(c) : null;
    });
  }

  async getCardEntry(id: string) {
    return this.read(() => {
      const e = this.cardEntries.get(id);
      return e && !e.deletedAt && this.canRead(e.contextId) ? stripEntry(e) : null;
    });
  }

  /** Como a leitura de receipt_items: o gasto ou a compra vivos que têm o resumo da chave; sem leitura ou resumo malformado, null. */
  async findReceipt(contextId: string, receiptKey: string) {
    return this.read((): ReceiptMatch | null => {
      if (!this.canRead(contextId) || !receiptKeyValid(receiptKey)) return null;
      for (const r of this.records.values()) {
        if (!r.deletedAt && r.contextId === contextId && r.receiptKey === receiptKey) return { recordId: r.id, cardEntryId: null, cardId: null };
      }
      for (const e of this.cardEntries.values()) {
        if (!e.deletedAt && e.contextId === contextId && e.receiptKey === receiptKey) return { recordId: null, cardEntryId: e.id, cardId: e.cardId };
      }
      return null;
    });
  }

  async listCardEntries(cardId: string) {
    return this.read(() => {
      const c = this.cards.get(cardId);
      if (!c || c.deletedAt || !this.canRead(c.contextId)) return [];
      return this.liveEntries(cardId).map(stripEntry);
    });
  }

  async listInvoiceCommitments(cardId: string) {
    return this.read(() => {
      const c = this.cards.get(cardId);
      if (!c || c.deletedAt || !this.canRead(c.contextId)) return [];
      return this.invoiceCommitments(cardId).map((x) => this.toCommitment(x));
    });
  }

  async listInvoiceItems(cardId: string) {
    return this.read(() => {
      const c = this.cards.get(cardId);
      if (!c || c.deletedAt || !this.canRead(c.contextId)) return [];
      return this.invoicesOf(c).map(invoiceItemOf);
    });
  }

  async findCardOperation(key: string) {
    return this.read(() => {
      const op = this.operations.get(key);
      return op && op.cardId && isCardAction(op.action)
        ? { action: op.action, cardId: op.cardId, entryId: op.entryId, commitmentId: op.commitmentId, recordId: op.recordId }
        : null;
    });
  }

  /** Como create_card. Ordem: repetição; sem_permissao; campos (cardInputError); limite_de_cartoes. */
  async createCard(key: string, contextId: string, input: CardInput) {
    return this.write(() => {
      const norm = normalizeCardInput(input);
      const payload = [contextId, ...cardPayload(norm)];
      const replayed = this.replay(key, 'criar_cartao', payload);
      if (replayed) return this.cardResult(replayed.cardId!, null, []);
      if (!this.canWrite(contextId)) throw new RepoError('sem_permissao');
      const code = cardInputError(norm);
      if (code) throw new RepoError(code);
      if (this.activeCardCount(contextId, null) >= CARDS_ACTIVE_MAX) throw new RepoError('limite_de_cartoes');
      const now = new Date().toISOString();
      const card: StoredCard = {
        id: this.id('cartao'),
        contextId,
        ...norm,
        status: 'ativo',
        createdBy: this.opts.actorId,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      this.cards.set(card.id, card);
      this.saveOperation(key, 'criar_cartao', payload, { contextId, recordId: null, commitmentId: null, cardId: card.id });
      return this.cardResult(card.id, null, []);
    });
  }

  /** Como update_card. Ordem: repetição; trava; versão; campos. As contas de fatura em aberto seguem o apelido e os dias novos. */
  async updateCard(key: string, id: string, expectedVersion: number, input: CardInput) {
    return this.write(() => {
      const norm = normalizeCardInput(input);
      const payload = [id, expectedVersion, ...cardPayload(norm)];
      const replayed = this.replay(key, 'alterar_cartao', payload);
      if (replayed) return this.cardResult(replayed.cardId!, null, []);
      const current = this.liveCard(id);
      if (current.version !== expectedVersion) throw new RepoError('versao_desatualizada', undefined, `versao_atual=${current.version}`);
      const code = cardInputError(norm);
      if (code) throw new RepoError(code);
      this.cards.set(id, { ...current, ...norm, version: current.version + 1, updatedAt: new Date().toISOString() });
      this.syncInvoices(id);
      this.saveOperation(key, 'alterar_cartao', payload, { contextId: current.contextId, recordId: null, commitmentId: null, cardId: id });
      return this.cardResult(id, null, []);
    });
  }

  /** Como set_card_status. Ordem: repetição; trava; versão; situacao_invalida; limite_de_cartoes (reativar com 20 ativos). */
  async setCardStatus(key: string, id: string, expectedVersion: number, status: CardStatus) {
    return this.write(() => {
      const payload = [id, expectedVersion, status];
      const replayed = this.replay(key, 'situacao_cartao', payload);
      if (replayed) return this.cardResult(replayed.cardId!, null, []);
      const current = this.liveCard(id);
      if (current.version !== expectedVersion) throw new RepoError('versao_desatualizada', undefined, `versao_atual=${current.version}`);
      if (!CARD_STATUSES.includes(status)) throw new RepoError('situacao_invalida');
      if (current.status === 'arquivado' && status === 'ativo' && this.activeCardCount(current.contextId, id) >= CARDS_ACTIVE_MAX) {
        throw new RepoError('limite_de_cartoes');
      }
      this.cards.set(id, { ...current, status, version: current.version + 1, updatedAt: new Date().toISOString() });
      this.saveOperation(key, 'situacao_cartao', payload, { contextId: current.contextId, recordId: null, commitmentId: null, cardId: id });
      return this.cardResult(id, null, []);
    });
  }

  /** Como delete_card: só sem lançamento nem conta de fatura vivos. Ordem: repetição; trava; versão; cartao_com_lancamentos. */
  async deleteCard(key: string, id: string, expectedVersion: number) {
    return this.write(() => {
      const payload = [id, expectedVersion];
      const replayed = this.replay(key, 'excluir_cartao', payload);
      if (replayed) return this.cardResult(replayed.cardId!, null, []);
      const current = this.liveCard(id);
      if (current.version !== expectedVersion) throw new RepoError('versao_desatualizada', undefined, `versao_atual=${current.version}`);
      if (this.liveEntries(id).length > 0 || this.invoiceCommitments(id).length > 0) throw new RepoError('cartao_com_lancamentos');
      const now = new Date().toISOString();
      this.cards.set(id, { ...current, version: current.version + 1, updatedAt: now, deletedAt: now, deletedBy: this.opts.actorId });
      this.saveOperation(key, 'excluir_cartao', payload, { contextId: current.contextId, recordId: null, commitmentId: null, cardId: id });
      return this.cardResult(id, null, []);
    });
  }

  /**
   * Como add_card_purchase. Ordem: repetição; trava; cartao_arquivado; campos (cardPurchaseError); chave da nota
   * (chave_de_nota_invalida, nota_ja_anotada); limite_de_lancamentos; fatura_paga; escrita (a fatura da 1ª parcela é a do
   * período que contém a data, com os dias que o cartão tem hoje, e fica fixada; se ela ainda está ABERTA e foi paga cedo, ou
   * alguma fatura das parcelas está paga, a compra vai para a primeira fatura seguinte livre: pagar cedo não trava o cartão.
   * Se ela já FECHOU e está paga, a compra é recusada com fatura_paga).
   */
  async addCardPurchase(key: string, cardId: string, input: CardPurchaseInput) {
    return this.write(() => {
      const norm = normalizePurchaseInput(input);
      const payload = [cardId, norm.purchasedOn, norm.totalCents, norm.installments, norm.description, norm.category, ...(norm.receiptKey ? [norm.receiptKey] : [])];
      const replayed = this.replay(key, 'criar_compra_cartao', payload);
      if (replayed) return this.entryResult(replayed.cardId!, replayed.entryId!);
      const card = this.liveCard(cardId);
      if (card.status !== 'ativo') throw new RepoError('cartao_arquivado');
      const today = this.opts.today();
      const code = cardPurchaseError(norm, today, true);
      if (code) throw new RepoError(code);
      if (norm.receiptKey) {
        if (!receiptKeyValid(norm.receiptKey)) throw new RepoError('chave_de_nota_invalida');
        this.checkReceiptFree(card.contextId, norm.receiptKey);
      }
      this.checkEntryCap(cardId, norm.installments);
      const first = purchaseFirstInvoiceMonth(card, norm.purchasedOn, norm.installments, this.paidMonths(cardId), today);
      // Fatura natural já fechada e paga (ou outra parcela em fatura paga): recusa, sem empurrar a compra para a fatura atual.
      for (let k = 0; k < norm.installments; k++) if (this.invoicePaid(cardId, addMonths(first, k))) throw new RepoError('fatura_paga');
      const entry = this.newEntry(card, {
        kind: 'compra',
        description: norm.description,
        category: norm.category,
        chargeType: null,
        purchasedOn: norm.purchasedOn,
        amountCents: norm.totalCents,
        installments: norm.installments,
        invoiceMonth: first,
        sourceMonth: null,
        paymentRecordId: null,
        receiptKey: norm.receiptKey ?? null,
      });
      this.syncInvoices(cardId);
      this.saveOperation(key, 'criar_compra_cartao', payload, { contextId: card.contextId, recordId: null, commitmentId: null, cardId, entryId: entry.id });
      return this.entryResult(cardId, entry.id);
    });
  }

  /** Como add_card_charge: cartão arquivado também aceita. Ordem: repetição; trava; campos (cardChargeError); limite_de_lancamentos; fatura_paga. */
  async addCardCharge(key: string, cardId: string, input: CardChargeInput) {
    return this.write(() => {
      const payload = [cardId, input.invoiceMonth, input.chargeType, input.amountCents];
      const replayed = this.replay(key, 'criar_encargo_cartao', payload);
      if (replayed) return this.entryResult(replayed.cardId!, replayed.entryId!);
      const card = this.liveCard(cardId);
      const code = cardChargeError(input, this.opts.today(), true);
      if (code) throw new RepoError(code);
      this.checkEntryCap(cardId, 1);
      if (this.invoicePaid(cardId, input.invoiceMonth)) throw new RepoError('fatura_paga');
      const entry = this.newEntry(card, {
        kind: 'encargo',
        description: null,
        category: null,
        chargeType: input.chargeType,
        purchasedOn: null,
        amountCents: input.amountCents,
        installments: 1,
        invoiceMonth: input.invoiceMonth,
        sourceMonth: null,
        paymentRecordId: null,
        receiptKey: null,
      });
      this.syncInvoices(cardId);
      this.saveOperation(key, 'criar_encargo_cartao', payload, { contextId: card.contextId, recordId: null, commitmentId: null, cardId, entryId: entry.id });
      return this.entryResult(cardId, entry.id);
    });
  }

  /** Como add_card_refund: cartão arquivado também aceita. Ordem: repetição; trava; campos (cardRefundError); limite_de_lancamentos; fatura_paga. */
  async addCardRefund(key: string, cardId: string, input: CardRefundInput) {
    return this.write(() => {
      const norm = normalizeRefundInput(input);
      const payload = [cardId, norm.invoiceMonth, norm.amountCents, norm.description, norm.category];
      const replayed = this.replay(key, 'criar_estorno_cartao', payload);
      if (replayed) return this.entryResult(replayed.cardId!, replayed.entryId!);
      const card = this.liveCard(cardId);
      const code = cardRefundError(norm, this.opts.today(), true);
      if (code) throw new RepoError(code);
      this.checkEntryCap(cardId, 1);
      if (this.invoicePaid(cardId, norm.invoiceMonth)) throw new RepoError('fatura_paga');
      const entry = this.newEntry(card, {
        kind: 'estorno',
        description: norm.description,
        category: norm.category,
        chargeType: null,
        purchasedOn: null,
        amountCents: norm.amountCents,
        installments: 1,
        invoiceMonth: norm.invoiceMonth,
        sourceMonth: null,
        paymentRecordId: null,
        receiptKey: null,
      });
      this.syncInvoices(cardId);
      this.saveOperation(key, 'criar_estorno_cartao', payload, { contextId: card.contextId, recordId: null, commitmentId: null, cardId, entryId: entry.id });
      return this.entryResult(cardId, entry.id);
    });
  }

  /**
   * Como update_card_entry. Ordem: repetição; trava (lançamento, cartão); lancamento_automatico; tipo_invalido (o tipo é o do
   * lançamento); versão; campos como em add_* (a data da compra e a fatura de encargo e estorno só são conferidas no intervalo
   * quando mudam); fatura_paga; limite_de_lancamentos (mais parcelas). Sem mudar valor, data nem parcelas, só descrição e
   * categoria mudam, mesmo numa fatura paga.
   */
  async updateCardEntry(key: string, entryId: string, expectedVersion: number, input: CardEntryInput) {
    return this.write(() => {
      const norm = normalizeEntryInput(input);
      const payload = [entryId, expectedVersion, ...entryPayload(norm)];
      const replayed = this.replay(key, 'alterar_lancamento_cartao', payload);
      if (replayed) return this.entryResult(replayed.cardId!, replayed.entryId!);
      const { card, entry } = this.liveEntry(entryId);
      if (norm.kind !== entry.kind) throw new RepoError('tipo_invalido');
      if (entry.version !== expectedVersion) throw new RepoError('versao_desatualizada', undefined, `versao_atual=${entry.version}`);
      const today = this.opts.today();
      const now = new Date().toISOString();
      if (norm.kind === 'compra') {
        const code = cardPurchaseError(norm, today, norm.purchasedOn !== entry.purchasedOn);
        if (code) throw new RepoError(code);
        const change = norm.totalCents !== entry.amountCents || norm.installments !== entry.installments || norm.purchasedOn !== entry.purchasedOn;
        if (change) {
          const first =
            norm.purchasedOn === entry.purchasedOn ? entry.invoiceMonth : purchaseFirstInvoiceMonth(card, norm.purchasedOn, norm.installments, this.paidMonths(card.id), today);
          for (let k = 0; k < entry.installments; k++) if (this.invoicePaid(card.id, addMonths(entry.invoiceMonth, k))) throw new RepoError('fatura_paga');
          for (let k = 0; k < norm.installments; k++) if (this.invoicePaid(card.id, addMonths(first, k))) throw new RepoError('fatura_paga');
          if (norm.installments > entry.installments) this.checkEntryCap(card.id, norm.installments - entry.installments);
          this.cardEntries.set(entryId, {
            ...entry,
            description: norm.description,
            category: norm.category,
            purchasedOn: norm.purchasedOn,
            amountCents: norm.totalCents,
            installments: norm.installments,
            invoiceMonth: first,
            version: entry.version + 1,
            updatedAt: now,
          });
          this.syncInvoices(card.id);
        } else {
          this.cardEntries.set(entryId, { ...entry, description: norm.description, category: norm.category, version: entry.version + 1, updatedAt: now });
        }
      } else if (norm.kind === 'encargo') {
        const code = cardChargeError(norm, today, norm.invoiceMonth !== entry.invoiceMonth);
        if (code) throw new RepoError(code);
        if (this.invoicePaid(card.id, entry.invoiceMonth) || this.invoicePaid(card.id, norm.invoiceMonth)) throw new RepoError('fatura_paga');
        this.cardEntries.set(entryId, {
          ...entry,
          invoiceMonth: norm.invoiceMonth,
          amountCents: norm.amountCents,
          chargeType: norm.chargeType,
          version: entry.version + 1,
          updatedAt: now,
        });
        this.syncInvoices(card.id);
      } else {
        const code = cardRefundError(norm, today, norm.invoiceMonth !== entry.invoiceMonth);
        if (code) throw new RepoError(code);
        if (this.invoicePaid(card.id, entry.invoiceMonth) || this.invoicePaid(card.id, norm.invoiceMonth)) throw new RepoError('fatura_paga');
        this.cardEntries.set(entryId, {
          ...entry,
          invoiceMonth: norm.invoiceMonth,
          amountCents: norm.amountCents,
          description: norm.description,
          category: norm.category,
          version: entry.version + 1,
          updatedAt: now,
        });
        this.syncInvoices(card.id);
      }
      this.saveOperation(key, 'alterar_lancamento_cartao', payload, { contextId: card.contextId, recordId: null, commitmentId: null, cardId: card.id, entryId });
      return this.entryResult(card.id, entryId);
    });
  }

  /** Como delete_card_entry (a compra inteira). Ordem: repetição; trava; lancamento_automatico; versão; fatura_paga. */
  async deleteCardEntry(key: string, entryId: string, expectedVersion: number) {
    return this.write(() => {
      const payload = [entryId, expectedVersion];
      const replayed = this.replay(key, 'excluir_lancamento_cartao', payload);
      if (replayed) return this.entryResult(replayed.cardId!, replayed.entryId!);
      const { card, entry } = this.liveEntry(entryId);
      if (entry.version !== expectedVersion) throw new RepoError('versao_desatualizada', undefined, `versao_atual=${entry.version}`);
      for (const m of entryMonths(entry)) if (this.invoicePaid(card.id, m)) throw new RepoError('fatura_paga');
      const now = new Date().toISOString();
      this.cardEntries.set(entryId, { ...entry, version: entry.version + 1, updatedAt: now, deletedAt: now, deletedBy: this.opts.actorId });
      this.syncInvoices(card.id);
      this.saveOperation(key, 'excluir_lancamento_cartao', payload, { contextId: card.contextId, recordId: null, commitmentId: null, cardId: card.id, entryId });
      return this.entryResult(card.id, entryId);
    });
  }

  /**
   * Como pay_invoice. Ordem: repetição; trava do cartão; mes_invalido; nao_encontrado (fatura sem conta); versão;
   * compromisso_quitado; valor_invalido; valor_acima_da_fatura; data_invalida (inválida, ou antes do menor entre 1 ano atrás e o
   * início do período da fatura); data_futura;
   * conta_invalida; fatura_seguinte_paga. Cria UM gasto sem categoria, ligado ao cartão e ao mês, na conta informada (sem ela, a
   * mais antiga do contexto) e, no pagamento parcial, o saldo anterior na fatura seguinte.
   */
  async payInvoice(key: string, cardId: string, month: IsoMonth, expectedVersion: number, amountCents: Cents, paidOn: IsoDate, accountId: string | null = null) {
    return this.write(() => {
      const payload = [cardId, month, expectedVersion, amountCents, paidOn, ...(accountId ? [accountId] : [])];
      const replayed = this.replay(key, 'pagar_fatura', payload);
      if (replayed) return this.paymentResult(replayed, month);
      const card = this.liveCard(cardId);
      if (typeof month !== 'string' || !isValidIsoMonth(month)) throw new RepoError('mes_invalido');
      const c = this.invoiceCommitmentOf(cardId, month);
      if (!c) throw new RepoError('nao_encontrado');
      if (c.version !== expectedVersion) throw new RepoError('versao_desatualizada', undefined, `versao_atual=${c.version}`);
      if (c.status !== 'aberto') throw new RepoError('compromisso_quitado');
      const today = this.opts.today();
      if (!Number.isSafeInteger(amountCents) || amountCents < 1) throw new RepoError('valor_invalido');
      if (amountCents > c.amountCents) throw new RepoError('valor_acima_da_fatura');
      // Não antes do menor entre 1 ano atrás e o início do período da fatura (fatura antiga paga na data real).
      const oneYearAgo = addYearsClamped(today, -1);
      const periodStart = invoicePeriod(card, month).startOn;
      if (typeof paidOn !== 'string' || !isValidIsoDate(paidOn) || paidOn < (periodStart < oneYearAgo ? periodStart : oneYearAgo)) throw new RepoError('data_invalida');
      if (paidOn > today) throw new RepoError('data_futura');
      const account = accountId
        ? this.space?.accounts.find((a) => a.id === accountId && a.contextId === card.contextId)
        : this.space?.accounts.find((a) => a.contextId === card.contextId);
      if (!account) throw new RepoError('conta_invalida');
      const left = c.amountCents - amountCents;
      const next = addMonths(month, 1);
      if (left > 0 && this.invoicePaid(cardId, next)) throw new RepoError('fatura_seguinte_paga');
      const now = new Date().toISOString();
      const record: FinancialRecord = {
        id: this.id('reg'),
        contextId: card.contextId,
        accountId: account.id,
        kind: 'despesa',
        status: 'realizado',
        amountCents,
        currency: 'BRL',
        occurredOn: paidOn,
        description: invoiceRecordDescription(card.name, month, paidOn),
        category: null,
        commitmentId: c.id,
        invoice: { cardId, month },
        receiptKey: null,
        createdBy: this.opts.actorId,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      this.records.set(record.id, record);
      this.bumpCommitment(c.id, { status: 'quitado', amountIsEstimate: false }, now);
      let balanceId: string | null = null;
      if (left > 0) {
        balanceId = this.newEntry(card, {
          kind: 'saldo_anterior',
          description: null,
          category: null,
          chargeType: null,
          purchasedOn: null,
          amountCents: left,
          installments: 1,
          invoiceMonth: next,
          sourceMonth: month,
          paymentRecordId: record.id,
          receiptKey: null,
        }).id;
        this.syncInvoices(cardId, month, next);
      }
      this.saveOperation(key, 'pagar_fatura', payload, { contextId: card.contextId, recordId: record.id, commitmentId: c.id, cardId, entryId: balanceId });
      return this.paymentResult(this.operations.get(key)!, month);
    });
  }

  /**
   * Como undo_invoice_payment. Ordem: repetição; trava do cartão; mes_invalido; nao_encontrado (sem conta); versão; compromisso_aberto;
   * fatura_seguinte_paga (há saldo anterior e a fatura seguinte já foi paga). Apaga o gasto, reabre a conta e apaga o saldo
   * anterior criado pelo pagamento.
   */
  async undoInvoicePayment(key: string, cardId: string, month: IsoMonth, expectedVersion: number) {
    return this.write(() => {
      const payload = [cardId, month, expectedVersion];
      const replayed = this.replay(key, 'desfazer_pagamento_fatura', payload);
      if (replayed) return this.paymentResult(replayed, month);
      const card = this.liveCard(cardId);
      if (typeof month !== 'string' || !isValidIsoMonth(month)) throw new RepoError('mes_invalido');
      const c = this.invoiceCommitmentOf(cardId, month);
      if (!c) throw new RepoError('nao_encontrado');
      if (c.version !== expectedVersion) throw new RepoError('versao_desatualizada', undefined, `versao_atual=${c.version}`);
      if (c.status !== 'quitado') throw new RepoError('compromisso_aberto');
      const paid = this.livePayment(c.id);
      if (!paid) throw new Error('vinculo_inconsistente');
      const next = addMonths(month, 1);
      const balance = this.liveEntries(cardId).find((e) => e.kind === 'saldo_anterior' && e.paymentRecordId === paid.id) ?? null;
      if (balance && this.invoicePaid(cardId, next)) throw new RepoError('fatura_seguinte_paga');
      const now = new Date().toISOString();
      if (balance) this.cardEntries.set(balance.id, { ...balance, version: balance.version + 1, updatedAt: now, deletedAt: now, deletedBy: this.opts.actorId });
      this.records.set(paid.id, { ...paid, version: paid.version + 1, updatedAt: now, deletedAt: now });
      this.bumpCommitment(c.id, { status: 'aberto' }, now);
      this.syncInvoices(cardId, month, next);
      this.saveOperation(key, 'desfazer_pagamento_fatura', payload, {
        contextId: card.contextId,
        recordId: paid.id,
        commitmentId: c.id,
        cardId,
        entryId: balance ? balance.id : null,
      });
      return this.paymentResult(this.operations.get(key)!, month);
    });
  }

  /** Cartão vivo: sem leitura ou excluído, não revela a existência; sem escrita, sem_permissao. */
  private liveCard(id: string) {
    const c = this.cards.get(id);
    if (!c || c.deletedAt || !this.canRead(c.contextId)) throw new RepoError('nao_encontrado');
    if (!this.canWrite(c.contextId)) throw new RepoError('sem_permissao');
    return c;
  }

  /** Trava do lançamento e depois do cartão; saldo anterior e estorno automático não se alteram (lancamento_automatico). */
  private liveEntry(id: string) {
    const e = this.cardEntries.get(id);
    if (!e || e.deletedAt || !this.canRead(e.contextId)) throw new RepoError('nao_encontrado');
    const card = this.liveCard(e.cardId);
    if (e.kind === 'saldo_anterior' || (e.kind === 'estorno' && e.sourceMonth !== null)) throw new RepoError('lancamento_automatico');
    return { card, entry: e };
  }

  private activeCardCount(contextId: string, exceptId: string | null) {
    return [...this.cards.values()].filter((c) => !c.deletedAt && c.contextId === contextId && c.status === 'ativo' && c.id !== exceptId).length;
  }

  private liveEntries(cardId: string): StoredCardEntry[] {
    return [...this.cardEntries.values()]
      .filter((e) => e.cardId === cardId && !e.deletedAt)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }

  /** Até 5.000 lançamentos vivos por cartão (cada parcela conta como um). */
  private checkEntryCap(cardId: string, adding: number) {
    const count = this.liveEntries(cardId).reduce((acc, e) => acc + e.installments, 0);
    if (count + adding > CARD_ENTRIES_MAX) throw new RepoError('limite_de_lancamentos');
  }

  private newEntry(card: StoredCard, fields: Omit<CardEntry, 'id' | 'contextId' | 'cardId' | 'createdBy' | 'version' | 'createdAt' | 'updatedAt'>) {
    const now = new Date().toISOString();
    const entry: StoredCardEntry = {
      id: this.id('lanc'),
      contextId: card.contextId,
      cardId: card.id,
      ...fields,
      createdBy: this.opts.actorId,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.cardEntries.set(entry.id, entry);
    return entry;
  }

  /** Contas de fatura vivas do cartão, por mês da fatura. */
  private invoiceCommitments(cardId: string): StoredCommitment[] {
    return [...this.commitments.values()]
      .filter((c) => c.invoiceCardId === cardId && !c.deletedAt)
      .sort((a, b) => a.invoiceMonth!.localeCompare(b.invoiceMonth!) || a.id.localeCompare(b.id));
  }

  private invoiceCommitmentOf(cardId: string, month: IsoMonth) {
    return this.invoiceCommitments(cardId).find((c) => c.invoiceMonth === month);
  }

  /** Fatura paga ou paga em parte: a conta viva do cartão e mês está quitada (clarevo_invoice_paid). */
  private invoicePaid(cardId: string, month: IsoMonth): boolean {
    return this.invoiceCommitmentOf(cardId, month)?.status === 'quitado';
  }

  /** Meses das faturas pagas do cartão (para clarevo_first_free_month, em purchaseFirstInvoiceMonth). */
  private paidMonths(cardId: string): IsoMonth[] {
    return this.invoiceCommitments(cardId)
      .filter((c) => c.status === 'quitado')
      .map((c) => c.invoiceMonth!);
  }

  /** Faturas do cartão com os lançamentos e as contas vivas de agora (cards.ts, buildInvoices). */
  private invoicesOf(card: StoredCard): Invoice[] {
    return buildInvoices(
      card,
      this.liveEntries(card.id),
      this.invoiceCommitments(card.id).map((c) => this.toCommitment(c)),
      this.opts.today(),
    );
  }

  /**
   * Como clarevo_sync_card, na mesma transação de cada escrita: do mês `from` ao `to` (padrão: do primeiro ao último mês com
   * lançamento ou conta), em ordem crescente: (1) o total da fatura; total maior que zero: a conta existe e acompanha o total, o
   * vencimento, o fechamento, o apelido e a marca "estimado" (hoje até o fechamento); total zero ou negativo: a conta é
   * excluída; conta paga não muda (total diferente do pago: fatura_paga); (2) total negativo: o crédito vira UM estorno
   * automático na fatura seguinte (criado, ajustado ou excluído; fatura_seguinte_paga se ela já foi paga), e a rodada segue até
   * ela. A rodada começa na fatura negativa mais antiga e o crédito só é levado adiante enquanto houver, na fatura seguinte ou
   * depois dela, um lançamento comum para recebê-lo (senão ele fica parado na própria fatura, sem encadeamento infinito).
   */
  private syncInvoices(cardId: string, from?: IsoMonth, to?: IsoMonth) {
    const card = this.cards.get(cardId)!;
    const today = this.opts.today();
    const entries = this.liveEntries(cardId);
    const totals = monthTotalsOf(entries);
    const bills = new Map<IsoMonth, StoredCommitment>(this.invoiceCommitments(cardId).map((c) => [c.invoiceMonth!, c]));
    const autos = new Map<IsoMonth, StoredCardEntry>();
    for (const e of entries) if (e.kind === 'estorno' && e.sourceMonth !== null) autos.set(e.sourceMonth, e);
    const months = [...new Set([...totals.keys(), ...bills.keys()])].sort();
    let start = from ?? months[0];
    let last = to ?? months[months.length - 1];
    if (start === undefined || last === undefined) return;
    // A rodada começa na fatura negativa mais antiga (um lançamento novo mais adiante recebe o crédito que estava parado e a
    // exclusão do último lançamento comum desfaz o encadeamento).
    for (const [m, t] of totals) if (t < 0 && m < start) start = m;
    // O crédito só é levado adiante enquanto houver, na fatura seguinte ou depois dela, um lançamento comum para recebê-lo.
    const lastRegular = lastRegularMonthOf(entries);
    const now = new Date().toISOString();
    const description = invoiceCommitmentDescription(card.name);
    let guard = 0;
    for (let m = start; m <= last; m = addMonths(m, 1)) {
      guard += 1;
      if (guard > 700) throw new Error('fatura_inconsistente');
      const next = addMonths(m, 1);
      const total = totals.get(m) ?? 0;
      const c = bills.get(m);
      if (c && c.status === 'quitado') {
        if (total !== c.amountCents) throw new RepoError('fatura_paga');
      } else {
        const dueOn = invoiceDueOn(card, m);
        const closingOn = invoiceClosingOn(card, m);
        const estimate = today <= closingOn;
        if (total > MAX_RECORD_CENTS) throw new RepoError('valor_acima_do_limite');
        if (total > 0) {
          if (!c) {
            const bill: StoredCommitment = {
              id: this.id('cp'),
              contextId: card.contextId,
              description,
              amountCents: total,
              currency: 'BRL',
              dueOn,
              category: null,
              status: 'aberto',
              seriesId: null,
              occurrenceNumber: null,
              seriesOverride: false,
              seriesSkipped: false,
              amountIsEstimate: estimate,
              invoiceCardId: cardId,
              invoiceMonth: m,
              cardClosingOn: closingOn,
              createdBy: card.createdBy,
              version: 1,
              createdAt: now,
              updatedAt: now,
            };
            this.commitments.set(bill.id, bill);
            bills.set(m, bill);
          } else if (
            c.amountCents !== total ||
            c.dueOn !== dueOn ||
            c.description !== description ||
            c.amountIsEstimate !== estimate ||
            c.cardClosingOn !== closingOn
          ) {
            this.bumpCommitment(c.id, { amountCents: total, dueOn, description, amountIsEstimate: estimate, cardClosingOn: closingOn }, now);
            bills.set(m, this.commitments.get(c.id)!);
          }
        } else if (c) {
          this.bumpCommitment(c.id, { deletedAt: now }, now);
          bills.delete(m);
        }
      }
      // Crédito levado à fatura seguinte.
      const credit = lastRegular !== null && next <= lastRegular ? Math.max(0, -total) : 0;
      const auto = autos.get(m);
      let changed = false;
      if (credit > 0) {
        if (!auto) {
          if (this.invoicePaid(cardId, next)) throw new RepoError('fatura_seguinte_paga');
          const created = this.newEntry(card, {
            kind: 'estorno',
            description: null,
            category: null,
            chargeType: null,
            purchasedOn: null,
            amountCents: credit,
            installments: 1,
            invoiceMonth: next,
            sourceMonth: m,
            paymentRecordId: null,
            receiptKey: null,
          });
          autos.set(m, created);
          totals.set(next, (totals.get(next) ?? 0) - credit);
          changed = true;
        } else if (auto.amountCents !== credit) {
          if (this.invoicePaid(cardId, next)) throw new RepoError('fatura_seguinte_paga');
          const updated = { ...auto, amountCents: credit, version: auto.version + 1, updatedAt: now };
          this.cardEntries.set(auto.id, updated);
          autos.set(m, updated);
          totals.set(next, (totals.get(next) ?? 0) + auto.amountCents - credit);
          changed = true;
        }
      } else if (auto) {
        if (this.invoicePaid(cardId, next)) throw new RepoError('fatura_seguinte_paga');
        this.cardEntries.set(auto.id, { ...auto, version: auto.version + 1, updatedAt: now, deletedAt: now, deletedBy: this.opts.actorId });
        autos.delete(m);
        totals.set(next, (totals.get(next) ?? 0) + auto.amountCents);
        changed = true;
      }
      if (changed && next > last) last = next;
    }
  }

  /** Chave da nota já anotada neste contexto (gasto ou compra no cartão vivos): nota_ja_anotada, detalhe registro=<id> ou compra=<id>. */
  private checkReceiptFree(contextId: string, key: string) {
    for (const r of this.records.values()) {
      if (!r.deletedAt && r.contextId === contextId && r.receiptKey === key) throw new RepoError('nota_ja_anotada', undefined, `registro=${r.id}`);
    }
    for (const e of this.cardEntries.values()) {
      if (!e.deletedAt && e.contextId === contextId && e.receiptKey === key) throw new RepoError('nota_ja_anotada', undefined, `compra=${e.id}`);
    }
  }

  /** O cartão como card_items: com o limite usado (faturas ainda não pagas, nunca negativo) e a fatura que recebe uma compra de hoje. */
  private cardView(c: StoredCard, invoices: readonly Invoice[] = this.invoicesOf(c)): Card {
    const month = invoiceMonthOf(c, this.opts.today());
    const { deletedAt: _deleted, deletedBy: _by, ...rest } = c;
    return {
      ...rest,
      usedCents: cardLimitUsed(invoices),
      currentMonth: month,
      currentClosingOn: invoiceClosingOn(c, month),
      currentDueOn: invoiceDueOn(c, month),
    };
  }

  /** O cartão no estado atual (inclusive excluído), o lançamento envolvido, as faturas envolvidas que ainda existem e as contas de fatura vivas. */
  private cardResult(cardId: string, entryId: string | null, months: readonly IsoMonth[]): CardWrite {
    const card = this.cards.get(cardId)!;
    const e = entryId ? this.cardEntries.get(entryId) : undefined;
    const invoices = this.invoicesOf(card);
    return {
      card: this.cardView(card, invoices),
      entry: e ? stripEntry(e) : null,
      invoices: invoices.filter((i) => months.includes(i.month)).map(invoiceItemOf),
      commitments: this.invoiceCommitments(cardId).map((c) => this.toCommitment(c)),
    };
  }

  private entryResult(cardId: string, entryId: string): CardWrite {
    return this.cardResult(cardId, entryId, entryMonths(this.cardEntries.get(entryId)!));
  }

  private paymentResult(op: Operation, month: IsoMonth): InvoicePaymentWrite {
    const record = this.records.get(op.recordId!)!;
    return {
      ...this.cardResult(op.cardId!, op.entryId, [month, addMonths(month, 1)]),
      commitment: this.toCommitment(this.commitments.get(op.commitmentId!)!),
      record: strip(record),
    };
  }

  /**
   * Cartões e lançamentos (no banco: restrições de coluna e índices únicos). Lança Error('cartao_inconsistente').
   * Cartão: apelido, final, dias e limite como cardInputError; no máximo 20 ativos por contexto. Lançamento: forma de cada tipo
   * (card_entries_forma); no máximo um saldo anterior e um estorno automático vivos por fatura de origem; origem sempre o mês
   * anterior; lançamento vivo só em cartão vivo.
   */
  private checkCardInvariants() {
    const fail = () => {
      throw new Error('cartao_inconsistente');
    };
    const active = new Map<string, number>();
    for (const c of this.cards.values()) {
      if (cardInputError(c) !== null || !CARD_STATUSES.includes(c.status) || !Number.isSafeInteger(c.version) || c.version < 1) fail();
      if (!c.deletedAt && c.status === 'ativo') {
        const n = (active.get(c.contextId) ?? 0) + 1;
        if (n > CARDS_ACTIVE_MAX) fail();
        active.set(c.contextId, n);
      }
    }
    const carried = new Set<string>();
    const text = (v: string | null, max: number) => v !== null && v === v.trim() && [...v].length >= 1 && [...v].length <= max;
    for (const e of this.cardEntries.values()) {
      const card = this.cards.get(e.cardId);
      if (!card || card.contextId !== e.contextId) fail();
      const common =
        Number.isSafeInteger(e.amountCents) &&
        e.amountCents >= 1 &&
        e.amountCents <= MAX_RECORD_CENTS &&
        isValidIsoMonth(e.invoiceMonth) &&
        (e.category === null || text(e.category, 40)) &&
        (e.receiptKey === null || receiptKeyValid(e.receiptKey)) &&
        e.version >= 1;
      const origin = e.sourceMonth !== null && isValidIsoMonth(e.sourceMonth) && addMonths(e.sourceMonth, 1) === e.invoiceMonth;
      let kindOk: boolean;
      switch (e.kind) {
        case 'compra':
          kindOk =
            text(e.description, 80) &&
            e.chargeType === null &&
            e.sourceMonth === null &&
            e.paymentRecordId === null &&
            e.purchasedOn !== null &&
            isValidIsoDate(e.purchasedOn) &&
            Number.isSafeInteger(e.installments) &&
            e.installments >= 1 &&
            e.installments <= CARD_INSTALLMENTS_MAX &&
            e.amountCents >= e.installments;
          break;
        case 'encargo':
          kindOk =
            e.description === null &&
            e.category === null &&
            e.chargeType !== null &&
            CARD_CHARGE_TYPES.includes(e.chargeType) &&
            e.purchasedOn === null &&
            e.installments === 1 &&
            e.sourceMonth === null &&
            e.paymentRecordId === null &&
            e.receiptKey === null;
          break;
        case 'estorno':
          kindOk =
            e.chargeType === null &&
            e.purchasedOn === null &&
            e.installments === 1 &&
            e.paymentRecordId === null &&
            e.receiptKey === null &&
            (e.sourceMonth === null ? text(e.description, 80) : origin && e.description === null && e.category === null);
          break;
        case 'saldo_anterior':
          kindOk =
            origin &&
            e.paymentRecordId !== null &&
            e.description === null &&
            e.category === null &&
            e.chargeType === null &&
            e.purchasedOn === null &&
            e.installments === 1 &&
            e.receiptKey === null;
          break;
        default:
          kindOk = false;
      }
      if (!kindOk || !common) fail();
      if (e.deletedAt) continue;
      if (card!.deletedAt) fail(); // lançamento vivo sempre tem cartão vivo
      if (e.sourceMonth !== null) {
        const k = `${e.cardId}|${e.kind}|${e.sourceMonth}`;
        if (carried.has(k)) fail(); // no máximo um saldo anterior e um estorno automático vivos por fatura de origem
        carried.add(k);
      }
    }
  }

  /**
   * Faturas (no banco: C1, C3 e C4 conferidas no fim da transação): para cada cartão vivo, a conta da fatura existe quando o total
   * é maior que zero, tem o valor do total (em aberto: vencimento, fechamento e apelido atuais), é única por fatura e não existe
   * com total zero ou negativo; conta paga tem 1 gasto vivo com o mesmo vínculo e valor de R$ 0,01 até o total; o saldo anterior
   * existe se e somente se o pagamento foi parcial, com a diferença; o estorno automático de uma fatura é o crédito da anterior.
   * Lança Error('fatura_inconsistente').
   */
  private checkInvoiceInvariants() {
    const fail = () => {
      throw new Error('fatura_inconsistente');
    };
    for (const c of this.commitments.values()) {
      if (!c.invoiceCardId) continue;
      if (c.invoiceMonth === null || c.cardClosingOn === null || c.seriesId !== null) fail();
      const card = this.cards.get(c.invoiceCardId);
      if (!card || card.contextId !== c.contextId || (!c.deletedAt && card.deletedAt)) fail();
    }
    for (const r of this.records.values()) {
      if (!r.invoice) continue;
      const c = r.commitmentId ? this.commitments.get(r.commitmentId) : undefined;
      if (!c || c.invoiceCardId !== r.invoice.cardId || c.invoiceMonth !== r.invoice.month || r.kind !== 'despesa') return fail();
      // Saldo anterior vivo depende de um gasto de pagamento vivo.
      const balances = [...this.cardEntries.values()].filter((e) => e.paymentRecordId === r.id && !e.deletedAt);
      if (r.deletedAt) {
        if (balances.length > 0) fail();
        continue;
      }
      if (r.amountCents > c.amountCents) fail();
      if (r.amountCents === c.amountCents) {
        if (balances.length !== 0) fail();
      } else if (balances.length !== 1 || balances[0]!.amountCents !== c.amountCents - r.amountCents || balances[0]!.sourceMonth !== r.invoice.month) {
        fail();
      }
    }
    for (const card of this.cards.values()) {
      if (card.deletedAt) continue;
      const live = this.invoiceCommitments(card.id);
      if (new Set(live.map((c) => c.invoiceMonth)).size !== live.length) fail();
      const entries = this.liveEntries(card.id);
      const totals = monthTotalsOf(entries);
      const lastRegular = lastRegularMonthOf(entries);
      const autoSum = new Map<IsoMonth, Cents>();
      for (const e of entries) if (e.kind === 'estorno' && e.sourceMonth !== null) autoSum.set(e.invoiceMonth, (autoSum.get(e.invoiceMonth) ?? 0) + e.amountCents);
      const months = new Set<IsoMonth>([...totals.keys(), ...live.map((c) => c.invoiceMonth!)]);
      for (const m of [...months]) months.add(addMonths(m, 1));
      const bills = new Map(live.map((c) => [c.invoiceMonth!, c]));
      for (const m of months) {
        const total = totals.get(m) ?? 0;
        const c = bills.get(m);
        if (c) {
          if (c.amountCents !== total) fail();
          if (c.status === 'aberto') {
            if (c.dueOn !== invoiceDueOn(card, m) || c.cardClosingOn !== invoiceClosingOn(card, m) || c.description !== invoiceCommitmentDescription(card.name)) fail();
          } else if (!this.livePayment(c.id)?.invoice) {
            fail();
          }
        } else if (total > 0) {
          fail();
        }
        const expected = lastRegular !== null && m <= lastRegular ? Math.max(0, -(totals.get(addMonths(m, -1)) ?? 0)) : 0;
        if ((autoSum.get(m) ?? 0) !== expected) fail();
      }
    }
  }

  /** C6: a chave da nota é única por contexto entre gastos e compras no cartão vivos. Lança Error('nota_inconsistente'). */
  private checkReceiptInvariants() {
    const seen = new Set<string>();
    const add = (contextId: string, key: string | null) => {
      if (key === null) return;
      const k = `${contextId}|${key}`;
      if (!receiptKeyValid(key) || seen.has(k)) throw new Error('nota_inconsistente');
      seen.add(k);
    };
    for (const r of this.records.values()) {
      if (r.receiptKey !== null && (r.kind !== 'despesa' || r.invoice !== null)) throw new Error('nota_inconsistente');
      if (!r.deletedAt) add(r.contextId, r.receiptKey);
    }
    for (const e of this.cardEntries.values()) if (!e.deletedAt) add(e.contextId, e.receiptKey);
  }

  /** Outra reserva viva e não arquivada no contexto (G6)? */
  private otherReserve(contextId: string, exceptId: string | null) {
    return [...this.goals.values()].some(
      (g) => !g.deletedAt && g.contextId === contextId && g.goalType === 'emergencia' && g.status !== 'arquivada' && g.id !== exceptId,
    );
  }

  /** Como clarevo_goal_negative_day antes de gravar: dia negativo → saldo_da_meta_insuficiente, com o dia no detalhe. */
  private checkGoalBalance(goalId: string, change: GoalMovementChange) {
    const day = firstNegativeDay(this.liveGoalMovements(goalId), change);
    if (day) throw new RepoError('saldo_da_meta_insuficiente', undefined, `dia=${day}`);
  }

  private newMovement(goal: StoredGoal, kind: GoalMovementKind, input: GoalMovementInput, now: string): StoredGoalMovement {
    const m: StoredGoalMovement = {
      id: this.id('mov'),
      goalId: goal.id,
      contextId: goal.contextId,
      kind,
      amountCents: input.amountCents,
      occurredOn: input.occurredOn,
      note: input.note,
      createdBy: this.opts.actorId,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.goalMovements.set(m.id, m);
    return m;
  }

  private liveGoalMovements(goalId: string): StoredGoalMovement[] {
    return [...this.goalMovements.values()].filter((m) => m.goalId === goalId && !m.deletedAt);
  }

  /** Como a trava da meta: sem leitura ou excluída, não revela a existência; sem escrita, sem_permissao. */
  private liveGoal(id: string) {
    const g = this.goals.get(id);
    if (!g || g.deletedAt || !this.canRead(g.contextId)) throw new RepoError('nao_encontrado');
    if (!this.canWrite(g.contextId)) throw new RepoError('sem_permissao');
    return g;
  }

  /** Trava da meta e depois do movimento (G4: movimento vivo sempre tem meta viva). */
  private liveMovement(id: string) {
    const m = this.goalMovements.get(id);
    if (!m || m.deletedAt || !this.canRead(m.contextId)) throw new RepoError('nao_encontrado');
    const goal = this.liveGoal(m.goalId);
    return { goal, movement: m };
  }

  /** Meta com os totais de goal_items (movimentos vivos), inclusive excluída (resultado de delete_goal e repetições). */
  private toGoal(g: StoredGoal): Goal {
    const { deletedAt: _deleted, deletedBy: _by, ...rest } = g;
    const c = goalComposition(this.liveGoalMovements(g.id));
    return { ...rest, ...c };
  }

  private goalResult(goalId: string, movementId: string | null): GoalWrite {
    const m = movementId ? this.goalMovements.get(movementId) : undefined;
    return { goal: this.toGoal(this.goals.get(goalId)!), movement: m ? stripMovement(m) : null };
  }

  /**
   * G1 a G6 e as restrições de coluna de goals e goal_movements (no banco: checks, índices únicos parciais, FK composta e
   * o gatilho adiado do saldo). Lança Error('meta_inconsistente').
   */
  private checkGoalInvariants() {
    const fail = () => {
      throw new Error('meta_inconsistente');
    };
    const reserves = new Set<string>();
    for (const g of this.goals.values()) {
      if (
        !GOAL_TYPES.includes(g.goalType) ||
        !GOAL_STATUSES.includes(g.status) ||
        g.name !== g.name.trim() ||
        [...g.name].length < 1 ||
        [...g.name].length > GOAL_NAME_MAX ||
        !Number.isSafeInteger(g.targetCents) ||
        g.targetCents < 1 ||
        g.targetCents > MAX_RECORD_CENTS ||
        (g.targetMonth !== null && !isValidIsoMonth(g.targetMonth)) ||
        (g.plannedMonthlyCents !== null && (!Number.isSafeInteger(g.plannedMonthlyCents) || g.plannedMonthlyCents < 1 || g.plannedMonthlyCents > MAX_RECORD_CENTS)) ||
        g.version < 1
      ) {
        fail();
      }
      const isReserve = g.goalType === 'emergencia';
      const hasBase = g.essentialBaseCents !== null && g.essentialMonths !== null && g.essentialBaseSource !== null;
      if (isReserve !== hasBase) fail();
      if (
        isReserve &&
        (g.essentialBaseCents! < 1 ||
          g.essentialBaseCents! > MAX_RECORD_CENTS ||
          g.essentialMonths! < RESERVE_MONTHS_MIN ||
          g.essentialMonths! > RESERVE_MONTHS_MAX ||
          !ESSENTIAL_BASE_SOURCES.includes(g.essentialBaseSource!) ||
          g.targetCents !== g.essentialBaseCents! * g.essentialMonths!)
      ) {
        fail();
      }
      // G6: no máximo uma reserva viva e não arquivada por contexto.
      if (isReserve && !g.deletedAt && g.status !== 'arquivada') {
        if (reserves.has(g.contextId)) fail();
        reserves.add(g.contextId);
      }
    }
    const initials = new Set<string>();
    for (const m of this.goalMovements.values()) {
      const g = this.goals.get(m.goalId);
      // G2: meta e movimento no mesmo contexto (FK composta).
      if (!g || g.contextId !== m.contextId) fail();
      if (
        !GOAL_MOVEMENT_KINDS.includes(m.kind) ||
        !Number.isSafeInteger(m.amountCents) ||
        m.amountCents < 1 ||
        m.amountCents > MAX_RECORD_CENTS ||
        !isValidIsoDate(m.occurredOn) ||
        (m.note !== null && (m.note !== m.note.trim() || [...m.note].length < 1 || [...m.note].length > GOAL_NOTE_MAX)) ||
        m.version < 1
      ) {
        fail();
      }
      if (m.deletedAt) continue;
      // G4: meta excluída não tem movimento vivo.
      if (g!.deletedAt) fail();
      // No máximo um "já guardado ao criar" vivo por meta.
      if (m.kind === 'saldo_inicial') {
        if (initials.has(m.goalId)) fail();
        initials.add(m.goalId);
      }
    }
    // G1: o guardado ao fim de cada dia nunca fica negativo.
    for (const g of this.goals.values()) {
      if (!g.deletedAt && firstNegativeDay(this.liveGoalMovements(g.id)) !== null) fail();
    }
  }

  /**
   * Invariantes do vínculo (no banco: restrição adiada, FK composta e checagem de tipo).
   * I1: conta paga, não excluída, com exatamente 1 gasto vivo vinculado, ou em aberto com 0.
   * I2: o gasto vinculado é despesa do mesmo contexto. Lança Error('vinculo_inconsistente').
   * S1, S2, S4, S5, S6, S8, S9 e S10 das séries (S3 e S7 comparam com o estado anterior em checkTransitions).
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
    this.checkReferenceInvariants();
    this.checkGoalInvariants();
    this.checkSavingsInvariants();
    this.checkCardInvariants();
    this.checkInvoiceInvariants();
    this.checkReceiptInvariants();
  }

  /**
   * Plano de guardar (no banco: restrições de coluna de savings_checks): resposta da lista; valor de 1 a MAX_RECORD_CENTS
   * só com 'consigo'; data de volta nula só com 'consigo' e depois do dia da resposta nas outras; versão a partir de 1.
   * Lança Error('guardar_inconsistente').
   */
  private checkSavingsInvariants() {
    for (const c of this.savingsChecks.values()) {
      if (
        savingsAnswerError(c.answer, c.monthlyCents) !== null ||
        !isValidIsoDate(c.answeredOn) ||
        (c.answer === 'consigo' ? c.askAgainOn !== null : c.askAgainOn === null || !isValidIsoDate(c.askAgainOn) || c.askAgainOn <= c.answeredOn) ||
        !Number.isSafeInteger(c.version) ||
        c.version < 1
      ) {
        throw new Error('guardar_inconsistente');
      }
    }
  }

  /**
   * Renda de referência (no banco: índice único das vivas e restrições de coluna): no máximo uma viva por contexto e
   * mês; mês válido; valor de 1 a MAX_RECORD_CENTS; versão a partir de 1. Lança Error('referencia_inconsistente').
   */
  private checkReferenceInvariants() {
    const live = new Set<string>();
    for (const r of this.incomeRefs.values()) {
      if (
        !isValidIsoMonth(r.fromMonth) ||
        !Number.isSafeInteger(r.amountCents) ||
        r.amountCents < 1 ||
        r.amountCents > MAX_RECORD_CENTS ||
        r.version < 1
      ) {
        throw new Error('referencia_inconsistente');
      }
      if (r.deletedAt) continue;
      const k = `${r.contextId}|${r.fromMonth}`;
      if (live.has(k)) throw new Error('referencia_inconsistente');
      live.add(k);
    }
  }

  private checkSeriesInvariants() {
    const fail = () => {
      throw new Error('serie_inconsistente');
    };
    for (const s of this.seriesById.values()) {
      // Forma da série (commitment_series_forma), com S9 da conta do ano.
      let shapeOk: boolean;
      switch (s.kind) {
        case 'mensal':
          shapeOk =
            s.nature === 'conta' &&
            s.installmentTotal === null &&
            s.partsPerYear === null &&
            s.firstNumber === 1 &&
            (s.lastNumber === null || (s.lastNumber >= 0 && s.lastNumber <= 600));
          break;
        case 'parcelada':
          shapeOk =
            s.nature !== 'conta' &&
            s.installmentTotal !== null &&
            s.partsPerYear === null &&
            s.installmentTotal >= 2 &&
            s.installmentTotal <= 480 &&
            s.firstNumber <= s.installmentTotal &&
            s.lastNumber !== null &&
            s.lastNumber >= s.firstNumber - 1 &&
            s.lastNumber <= s.installmentTotal;
          break;
        case 'anual': {
          const k = s.partsPerYear;
          shapeOk =
            s.nature === 'conta' &&
            s.installmentTotal === null &&
            k !== null &&
            Number.isSafeInteger(k) &&
            k >= 1 &&
            k <= PARTS_PER_YEAR_MAX &&
            s.firstNumber >= 1 &&
            s.firstNumber <= k &&
            (s.lastNumber === null || (s.lastNumber >= s.firstNumber - 1 && s.lastNumber <= ANNUAL_MAX_YEARS * k));
          break;
        }
        default:
          shapeOk = false;
      }
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
    // S10: nenhuma ocorrência viva vence depois do fim do 13º mês após o mês de hoje (conta do ano: até mês + 2 + 11).
    const s10 = addMonths(monthOf(this.opts.today()), 13);
    for (const c of this.commitments.values()) {
      if (c.seriesId === null) {
        // Conta avulsa não tem número nem marcas de série (commitments_series_marcas).
        if (c.occurrenceNumber !== null || c.seriesOverride || c.seriesSkipped || (c.amountIsEstimate && !c.invoiceCardId)) fail();
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
      if (monthOf(c.dueOn) > s10) fail(); // S10
    }
  }

  /**
   * Guardas de alteração (gatilhos do banco). S3: vínculo com a série e o número nunca mudam e
   * "excluída só neste mês" é permanente. S7: conta paga não muda o previsto nem a marca de estimado.
   * Série: campos de identidade imutáveis e excluída não muda mais. Vigência: só passa a substituída.
   * Lança Error('campo_imutavel').
   */
  private checkTransitions(before: {
    commitments: Map<string, StoredCommitment>;
    seriesById: Map<string, StoredSeries>;
    terms: Map<string, StoredTerm>;
    /** Ausentes em instantâneos antigos (testes de S3 e S7): as guardas da revisão só comparam quando vêm. */
    activity?: Map<string, ContextActivity>;
    reviews?: Map<string, ReturnReviewMark>;
    incomeRefs?: Map<string, StoredIncomeReference>;
    goals?: Map<string, StoredGoal>;
    goalMovements?: Map<string, StoredGoalMovement>;
    savingsChecks?: Map<string, SavingsCheck>;
    cards?: Map<string, StoredCard>;
    cardEntries?: Map<string, StoredCardEntry>;
  }) {
    const fail = () => {
      throw new Error('campo_imutavel');
    };
    // Atividade: o último dia com anotação não recua; ausência com os dois dias ou nenhum, de < até <= último.
    for (const [ctx, a] of this.activity) {
      const old = before.activity?.get(ctx);
      if (old && a.lastWriteOn < old.lastWriteOn) fail();
      if ((a.absenceFromOn === null) !== (a.absenceUntilOn === null)) fail();
      if (a.absenceFromOn !== null && !(a.absenceFromOn < a.absenceUntilOn! && a.absenceUntilOn! <= a.lastWriteOn)) fail();
    }
    // Renda de referência: contexto, mês, autoria e criação não mudam; excluída não volta; versão + 1 por escrita.
    for (const [id, r] of this.incomeRefs) {
      const old = before.incomeRefs?.get(id);
      if (!old || old === r) continue;
      if (
        old.deletedAt ||
        old.contextId !== r.contextId ||
        old.fromMonth !== r.fromMonth ||
        old.createdBy !== r.createdBy ||
        old.createdAt !== r.createdAt ||
        r.version !== old.version + 1
      ) {
        fail();
      }
    }
    // Metas: contexto, autoria e criação não mudam; excluída não volta; versão + 1 por escrita.
    for (const [id, g] of this.goals) {
      const old = before.goals?.get(id);
      if (!old || old === g) continue;
      if (old.deletedAt || old.contextId !== g.contextId || old.createdBy !== g.createdBy || old.createdAt !== g.createdAt || g.version !== old.version + 1) {
        fail();
      }
    }
    // Movimentos: meta, contexto, tipo, autoria e criação não mudam; excluído não volta; versão + 1 por escrita.
    // G5: meta arquivada não recebe movimento novo nem alterado (a exclusão junto com a meta continua possível).
    for (const [id, m] of this.goalMovements) {
      const old = before.goalMovements?.get(id);
      if (old === m) continue;
      if (
        old &&
        (old.deletedAt ||
          old.goalId !== m.goalId ||
          old.contextId !== m.contextId ||
          old.kind !== m.kind ||
          old.createdBy !== m.createdBy ||
          old.createdAt !== m.createdAt ||
          m.version !== old.version + 1)
      ) {
        fail();
      }
      if (before.goalMovements && !m.deletedAt && this.goals.get(m.goalId)?.status === 'arquivada') fail();
    }
    // Cartões: contexto, autoria e criação não mudam; excluído não volta; versão + 1 por escrita.
    for (const [id, c] of this.cards) {
      const old = before.cards?.get(id);
      if (!old || old === c) continue;
      if (old.deletedAt || old.contextId !== c.contextId || old.createdBy !== c.createdBy || old.createdAt !== c.createdAt || c.version !== old.version + 1) {
        fail();
      }
    }
    // Lançamentos: cartão, contexto, tipo, autoria e criação não mudam; excluído não volta; versão + 1 por escrita.
    for (const [id, e] of this.cardEntries) {
      const old = before.cardEntries?.get(id);
      if (!old || old === e) continue;
      if (
        old.deletedAt ||
        old.cardId !== e.cardId ||
        old.contextId !== e.contextId ||
        old.kind !== e.kind ||
        old.sourceMonth !== e.sourceMonth ||
        old.paymentRecordId !== e.paymentRecordId ||
        old.receiptKey !== e.receiptKey ||
        old.createdBy !== e.createdBy ||
        old.createdAt !== e.createdAt ||
        e.version !== old.version + 1
      ) {
        fail();
      }
    }
    // Plano de guardar: criação não muda; versão + 1 por escrita.
    for (const [ctx, c] of this.savingsChecks) {
      const old = before.savingsChecks?.get(ctx);
      if (!old || old === c) continue;
      if (old.contextId !== c.contextId || old.createdAt !== c.createdAt || c.version !== old.version + 1) fail();
    }
    // Revisão: mês revisado e dia da decisão nunca recuam; versão + 1 por escrita.
    for (const [ctx, r] of this.reviews) {
      const old = before.reviews?.get(ctx);
      if (!old || old === r) continue;
      if (r.reviewedThrough < old.reviewedThrough || r.decidedOn < old.decidedOn || r.version !== old.version + 1) fail();
    }
    for (const [id, c] of this.commitments) {
      const old = before.commitments.get(id);
      if (!old || old === c) continue;
      if (
        old.contextId !== c.contextId ||
        old.createdBy !== c.createdBy ||
        old.createdAt !== c.createdAt ||
        old.seriesId !== c.seriesId ||
        old.occurrenceNumber !== c.occurrenceNumber ||
        old.invoiceCardId !== c.invoiceCardId ||
        old.invoiceMonth !== c.invoiceMonth ||
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
        old.partsPerYear !== s.partsPerYear ||
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
    ids: Omit<Operation, 'action' | 'hash' | 'seriesId' | 'referenceId' | 'goalId' | 'movementId' | 'cardId' | 'entryId'> & {
      seriesId?: string;
      referenceId?: string;
      goalId?: string;
      movementId?: string | null;
      cardId?: string;
      entryId?: string | null;
    },
  ) {
    this.operations.set(key, {
      action,
      hash: hash([action, ...payload]),
      ...ids,
      seriesId: ids.seriesId ?? null,
      referenceId: ids.referenceId ?? null,
      goalId: ids.goalId ?? null,
      movementId: ids.movementId ?? null,
      cardId: ids.cardId ?? null,
      entryId: ids.entryId ?? null,
    });
    this.trackActivity(action, ids.contextId);
  }

  /**
   * Como o gatilho clarevo_track_activity em record_operations: toda operação nova, menos decidir_revisao e
   * responder_guardar, deixa o último dia com anotação >= hoje; se o intervalo desde o último for uma ausência longa,
   * ela passa a ser a última ausência. Mesmo dia ou relógio para trás: nada muda.
   */
  private trackActivity(action: Operation['action'], contextId: string) {
    if (action === 'decidir_revisao' || action === 'responder_guardar') return;
    const day = this.opts.today();
    const a = this.activity.get(contextId);
    if (!a) {
      this.activity.set(contextId, { lastWriteOn: day, absenceFromOn: null, absenceUntilOn: null });
      return;
    }
    if (day <= a.lastWriteOn) return;
    const long = isLongAbsence(a.lastWriteOn, day);
    this.activity.set(contextId, {
      lastWriteOn: day,
      absenceFromOn: long ? a.lastWriteOn : a.absenceFromOn,
      absenceUntilOn: long ? day : a.absenceUntilOn,
    });
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
   * Como clarevo_materialize_series: cria as contas da janela (mês anterior ao seguinte a hoje; conta do ano: o ano
   * inteiro, dois meses antes) que ainda não existem vivas nem foram excluídas só neste mês, com a vigência de cada
   * número e a autoria de quem criou a série.
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
        invoiceCardId: null,
        invoiceMonth: null,
        cardClosingOn: null,
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
    const { deletedAt: _deleted, seriesId, occurrenceNumber, seriesSkipped: _skipped, invoiceCardId, invoiceMonth, cardClosingOn: closingOn, ...rest } = c;
    const r = this.livePayment(c.id);
    const s = seriesId ? this.seriesById.get(seriesId) : undefined;
    return {
      ...rest,
      // Fatura de cartão em aberto: "estimado" calculado na hora, até o dia do fechamento (como commitment_items); a marca
      // gravada só é atualizada por uma gravação de cartão ou por syncSeriesOccurrences e fica velha depois do fechamento.
      amountIsEstimate: invoiceCardId && c.status === 'aberto' ? this.opts.today() <= closingOn! : c.amountIsEstimate,
      invoice: invoiceCardId && invoiceMonth ? { cardId: invoiceCardId, month: invoiceMonth, closingOn: closingOn! } : null,
      series:
        s && occurrenceNumber !== null
          ? {
              id: s.id,
              number: occurrenceNumber,
              kind: s.kind,
              nature: s.nature,
              installmentTotal: s.installmentTotal,
              partsPerYear: s.partsPerYear,
            }
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
    if (typeof input.occurredOn !== 'string' || !isValidIsoDate(input.occurredOn)) throw new RepoError('data_invalida');
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

function isGoalAction(action: Operation['action']): action is GoalAction {
  return GOAL_ACTIONS.includes(action);
}

function isCardAction(action: Operation['action']): action is CardAction {
  return CARD_ACTIONS.includes(action);
}

function isCommitmentAction(action: Operation['action']): action is CommitmentAction {
  return COMMITMENT_ACTIONS.includes(action);
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
    // Ausente vale como nulo (p_parts_per_year default null).
    partsPerYear: input.partsPerYear ?? null,
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

/** Campos de create_goal e update_goal aparados (nome; categoria não existe), na forma do hash. */
function normalizeGoalInput(input: GoalInput): GoalInput {
  return {
    goalType: input.goalType,
    name: typeof input.name === 'string' ? input.name.trim() : input.name,
    targetCents: input.targetCents ?? null,
    targetMonth: input.targetMonth ?? null,
    plannedMonthlyCents: input.plannedMonthlyCents ?? null,
    essentialBaseCents: input.essentialBaseCents ?? null,
    essentialMonths: input.essentialMonths ?? null,
    essentialBaseSource: input.essentialBaseSource ?? null,
  };
}

/** Argumentos da meta na ordem das funções do banco (p_goal_type ... p_essential_base_source). */
function goalPayload(g: GoalInput): unknown[] {
  return [g.goalType, g.name, g.targetCents, g.targetMonth, g.plannedMonthlyCents, g.essentialBaseCents, g.essentialMonths, g.essentialBaseSource];
}

function normalizeMovementInput(input: GoalMovementInput): GoalMovementInput {
  return { amountCents: input.amountCents, occurredOn: input.occurredOn, note: normalizeGoalNote(input.note) };
}

const byMovementDesc = (a: StoredGoalMovement, b: StoredGoalMovement) =>
  b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);

/** Campos do cartão na ordem das funções do banco (p_name ... p_limit_cents), na forma do hash. */
function cardPayload(c: CardInput): unknown[] {
  return [c.name, c.lastDigits, c.closingDay, c.dueDay, c.limitCents];
}

/** Lançamento aparado (descrição; categoria vazia vira nula), na forma do hash. */
function normalizeEntryInput(input: CardEntryInput): CardEntryInput {
  switch (input.kind) {
    case 'compra':
      return { kind: 'compra', ...normalizePurchaseInput(input) };
    case 'estorno':
      return { kind: 'estorno', ...normalizeRefundInput(input) };
    default:
      return { kind: input.kind, chargeType: input.chargeType, amountCents: input.amountCents, invoiceMonth: input.invoiceMonth } as CardEntryInput;
  }
}

/** Argumentos de update_card_entry depois da versão, na ordem da função: valor, data, descrição, categoria, parcelas, fatura, tipo do encargo. */
function entryPayload(input: CardEntryInput): unknown[] {
  switch (input.kind) {
    case 'compra':
      return [input.totalCents, input.purchasedOn, input.description, input.category, input.installments, null, null];
    case 'estorno':
      return [input.amountCents, null, input.description, input.category, null, input.invoiceMonth, null];
    default:
      return [input.amountCents, null, null, null, null, input.invoiceMonth, input.chargeType];
  }
}

/** Total de cada mês de fatura (parcelas, encargos e saldo anterior menos estornos, inclusive o automático), como clarevo_sync_card. */
function monthTotalsOf(entries: readonly Pick<CardEntry, 'kind' | 'amountCents' | 'installments' | 'invoiceMonth' | 'id'>[]): Map<IsoMonth, Cents> {
  const totals = new Map<IsoMonth, Cents>();
  const add = (month: IsoMonth, cents: Cents) => totals.set(month, (totals.get(month) ?? 0) + cents);
  for (const e of entries) {
    if (e.kind === 'compra') for (const p of purchaseInstallments(e)) add(p.invoiceMonth, p.amountCents);
    else add(e.invoiceMonth, e.kind === 'estorno' ? -e.amountCents : e.amountCents);
  }
  return totals;
}

/** Último mês com lançamento comum (tudo menos o estorno automático): parcela, encargo, estorno comum ou saldo anterior. */
function lastRegularMonthOf(entries: readonly Pick<CardEntry, 'kind' | 'sourceMonth' | 'installments' | 'invoiceMonth'>[]): IsoMonth | null {
  let last: IsoMonth | null = null;
  for (const e of entries) {
    if (e.kind === 'estorno' && e.sourceMonth !== null) continue;
    const m = addMonths(e.invoiceMonth, e.kind === 'compra' ? e.installments - 1 : 0);
    if (last === null || m > last) last = m;
  }
  return last;
}

/** Meses de fatura de um lançamento: as parcelas da compra, uma por mês, ou a fatura dele. */
function entryMonths(e: Pick<CardEntry, 'kind' | 'installments' | 'invoiceMonth'>): IsoMonth[] {
  return Array.from({ length: e.kind === 'compra' ? e.installments : 1 }, (_, i) => addMonths(e.invoiceMonth, i));
}

function stripEntry(e: StoredCardEntry): CardEntry {
  const { deletedAt: _deleted, deletedBy: _by, ...rest } = e;
  return rest;
}

function stripMovement(m: StoredGoalMovement): GoalMovement {
  const { deletedAt: _deleted, deletedBy: _by, ...rest } = m;
  return rest;
}

function stripReference(r: StoredIncomeReference): IncomeReference {
  const { deletedAt: _deleted, deletedBy: _by, ...rest } = r;
  return rest;
}

function strip(r: StoredRecord): FinancialRecord {
  const { deletedAt: _deleted, ...rest } = r;
  return rest;
}

/** Cópia profunda de dados simples (sem structuredClone, que o Hermes pode não ter). */
function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}
