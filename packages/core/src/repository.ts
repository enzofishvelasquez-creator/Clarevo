import type { IsoMonth } from './dates';
import type { Cents } from './money';
import type {
  Commitment,
  CommitmentInput,
  CommitmentSeries,
  FinancialRecord,
  MonthOverview,
  OccurrenceMode,
  PaymentInput,
  PersonalSpace,
  RecordInput,
  RecordKind,
  ReturnDecision,
  ReturnReviewMark,
  ReturnReviewState,
  SeriesEditInput,
  SeriesInput,
} from './records';

/**
 * Ações de conta a pagar gravadas em record_operations (mesmo espaço de chaves dos registros). 'criar_ocorrencia':
 * conta de mês passado de uma série (create_series_occurrence), com a conta em commitment_id e a série em target_id.
 */
export type CommitmentAction =
  | 'criar_compromisso'
  | 'editar_compromisso'
  | 'excluir_compromisso'
  | 'pagar_compromisso'
  | 'desfazer_pagamento'
  | 'criar_ocorrencia';

/** Decisão da revisão dos últimos meses (decide_return_review); não conta como anotação (D-030). */
export type ReviewAction = 'decidir_revisao';

/** Resultado das escritas de conta a pagar: a conta no estado atual e, quando houver, o gasto envolvido. */
export interface CommitmentWrite {
  commitment: Commitment;
  record: FinancialRecord | null;
}

/** Ações de série gravadas em record_operations (alvo em target_id); 'informar_ano' e 'tirar_ano' só em contas do ano. */
export type SeriesAction = 'criar_serie' | 'alterar_serie' | 'encerrar_serie' | 'excluir_serie' | 'informar_ano' | 'tirar_ano';

/** Conta afetada que a pessoa confirmou: se o conjunto mudar até gravar, a escrita é recusada. */
export interface AffectedRef {
  id: string;
  version: number;
}

/** Resultado das escritas de gasto fixo: a série, as ocorrências vivas (número crescente) e quantas contas mudaram. */
export interface SeriesWrite {
  series: CommitmentSeries;
  occurrences: Commitment[];
  changed: number;
}

/**
 * Contrato de acesso a dados usado pelo app. Duas implementações:
 * - SupabaseRepository (app): produção, autorização no banco.
 * - MemoryRepository (core): demonstração e testes, com as mesmas regras de idempotência e versão.
 */
export interface RecordsRepository {
  /** Espaço pessoal da pessoa autenticada; null se ainda não passou por "Sua primeira conta". */
  getSpace(): Promise<PersonalSpace | null>;
  /** Cria (uma única vez) contexto pessoal e primeira conta. Idempotente. O fuso vem do aparelho. */
  ensurePersonalSpace(accountName: string, timeZone?: string): Promise<PersonalSpace>;
  renameAccount(accountId: string, name: string): Promise<void>;

  listRecords(contextId: string, month: IsoMonth): Promise<FinancialRecord[]>;
  getRecord(id: string): Promise<FinancialRecord | null>;

  createRecord(key: string, contextId: string, kind: RecordKind, input: RecordInput): Promise<FinancialRecord>;
  /** Num gasto de conta a pagar, também soma 1 à versão da conta (o previsto não muda). */
  updateRecord(key: string, id: string, expectedVersion: number, input: RecordInput): Promise<FinancialRecord>;
  /** Num gasto de conta a pagar, também reabre a conta (versão +1). */
  deleteRecord(key: string, id: string, expectedVersion: number): Promise<FinancialRecord>;
  /** Reconciliação: a operação de registro (criar, editar, excluir) com esta chave já foi concluída? */
  findOperation(key: string): Promise<{ recordId: string } | null>;

  /**
   * Contas a pagar do contexto, sem excluídas: todas com vencimento no mês (abertas e pagas),
   * as pagas com data de pagamento no mês (qualquer vencimento) e todas as abertas com vencimento
   * fora do mês. A seleção do total é feita por summarizeToPay.
   */
  listCommitments(contextId: string, month: IsoMonth): Promise<Commitment[]>;
  getCommitment(id: string): Promise<Commitment | null>;
  createCommitment(key: string, contextId: string, input: CommitmentInput): Promise<CommitmentWrite>;
  /**
   * Numa ocorrência de série, o vencimento fica no mesmo mês (vencimento_fora_do_mes) e a conta passa a ser
   * "alterada só neste mês". input.amountIsEstimate === false tira a marca de estimado.
   */
  updateCommitment(key: string, id: string, expectedVersion: number, input: CommitmentInput): Promise<CommitmentWrite>;
  /** Numa ocorrência de série, exclui só este mês: o número nunca volta a ser criado. */
  deleteCommitment(key: string, id: string, expectedVersion: number): Promise<CommitmentWrite>;
  /** Atômico: cria o gasto e quita a conta. record = gasto criado. */
  payCommitment(key: string, id: string, expectedVersion: number, input: PaymentInput): Promise<CommitmentWrite & { record: FinancialRecord }>;
  /** Atômico: exclui o gasto e reabre a conta. record = gasto excluído. */
  undoCommitmentPayment(key: string, id: string, expectedVersion: number): Promise<CommitmentWrite & { record: FinancialRecord }>;
  /** Reconciliação de conta a pagar: a operação com esta chave já foi concluída? */
  findCommitmentOperation(key: string): Promise<{ action: CommitmentAction; commitmentId: string; recordId: string | null } | null>;

  /** Gastos fixos, parcelamentos e contas do ano do contexto, sem excluídos (inclusive encerrados). */
  listSeries(contextId: string): Promise<CommitmentSeries[]>;
  getSeries(id: string): Promise<CommitmentSeries | null>;
  /** Ocorrências vivas da série (abertas e pagas), por número decrescente, até 60. */
  listSeriesOccurrences(seriesId: string): Promise<Commitment[]>;
  /**
   * Todas as ocorrências vivas em aberto da série, sem limite, por número crescente. Junto de listSeriesOccurrences
   * (mergeOccurrences), dá o conjunto completo que o banco confere em update_series_from, end_series e delete_series,
   * e as parcelas em aberto de installmentProgress.
   */
  listOpenSeriesOccurrences(seriesId: string): Promise<Commitment[]>;
  createSeries(key: string, contextId: string, input: SeriesInput): Promise<SeriesWrite>;
  /** "Esta e as próximas" a partir do número fromNumber. changed = contas alteradas. */
  updateSeriesFrom(
    key: string,
    id: string,
    expectedVersion: number,
    fromNumber: number,
    expectedAffected: AffectedRef[],
    input: SeriesEditInput,
  ): Promise<SeriesWrite>;
  /** Encerrar (lastNumber) ou retomar (null ou maior). changed = contas em aberto removidas. */
  endSeries(key: string, id: string, expectedVersion: number, lastNumber: number | null, expectedAffected: AffectedRef[]): Promise<SeriesWrite>;
  /** Só sem conta paga. changed = contas em aberto removidas; occurrences vem vazio. */
  deleteSeries(key: string, id: string, expectedVersion: number, expectedAffected: AffectedRef[]): Promise<SeriesWrite>;
  /**
   * Conta do ano, "Informar o valor de 2027": as parcelas do ano da parcela `number` em aberto e estimadas passam a
   * amountCents, deixam de ser estimadas e ficam alteradas só naquele ano (versão + 1). Não mexe nas pagas, nas não
   * estimadas, nas vigências nem na série (a versão da série não muda). expectedAffected: affectedByYear(…, 'informar').
   * changed = contas alteradas.
   */
  informSeriesYear(key: string, seriesId: string, number: number, expectedAffected: AffectedRef[], amountCents: Cents): Promise<SeriesWrite>;
  /**
   * Conta do ano, "Tirar as parcelas de 2027": exclui de uma vez as parcelas do ano da parcela `number` em aberto, com a
   * marca "excluída só neste mês" (nunca voltam, nem se um pagamento for desfeito). As pagas continuam e a série segue.
   * expectedAffected: affectedByYear(…, 'tirar'). changed = contas excluídas.
   */
  skipSeriesYear(key: string, seriesId: string, number: number, expectedAffected: AffectedRef[]): Promise<SeriesWrite>;
  /** Cria as contas da janela de geração. Idempotente, sem chave. */
  syncSeriesOccurrences(contextId: string): Promise<{ created: number; createdOverdue: number }>;
  /** Reconciliação de gasto fixo: a operação com esta chave já foi concluída? */
  findSeriesOperation(key: string): Promise<{ action: SeriesAction; seriesId: string } | null>;

  // Revisão dos últimos meses (D-030, Ciclo A4).

  /** Atividade e marca da revisão da própria pessoa no contexto (context_activity e return_reviews, RLS). */
  getReturnReviewState(contextId: string): Promise<ReturnReviewState>;
  /**
   * Recebimentos e gastos anotados por mês, de `from` a `to` (no máximo 12 meses), um item por mês, do mais antigo ao
   * mais recente. Mesmo critério de month_totals. periodo_invalido; sem leitura, sem_permissao.
   */
  monthsOverview(contextId: string, from: IsoMonth, to: IsoMonth): Promise<MonthOverview[]>;
  /** Contas vivas (abertas e pagas) com vencimento do dia 1 de `from` até o fim de `to`, por vencimento. */
  listCommitmentsDueBetween(contextId: string, from: IsoMonth, to: IsoMonth): Promise<Commitment[]>;
  /**
   * Conta do número n de uma série num dos 11 meses fechados anteriores ao atual, com a vigência de n e a autoria de
   * quem criou a série. 'aberta': fica em aberto (para "Já paguei", pague depois com payCommitment; para "Ainda não
   * paguei", nada mais). 'nao_houve': gravada como excluída só neste mês (nunca volta). A versão da série não muda.
   * Códigos: versao_desatualizada, modo_invalido, numero_fora_da_serie, mes_fora_da_revisao, ocorrencia_existente,
   * nao_encontrado, sem_permissao, chave_reutilizada. Reconciliação: findCommitmentOperation (criar_ocorrencia).
   */
  createSeriesOccurrence(key: string, seriesId: string, expectedSeriesVersion: number, n: number, mode: OccurrenceMode): Promise<CommitmentWrite>;
  /**
   * Grava a decisão (versão 0 = ainda não existe). reviewedThrough: um dos 11 meses fechados anteriores ao atual;
   * o mês revisado e o dia da decisão nunca recuam. Basta leitura no contexto. Códigos: versao_desatualizada,
   * decisao_invalida, mes_invalido, sem_permissao, chave_reutilizada. Não conta como anotação.
   */
  decideReturnReview(
    key: string,
    contextId: string,
    expectedVersion: number,
    reviewedThrough: IsoMonth,
    decision: ReturnDecision,
  ): Promise<ReturnReviewMark>;
}

export type RepoErrorCode =
  | 'versao_desatualizada'
  | 'chave_reutilizada'
  | 'nao_encontrado'
  | 'sem_permissao'
  | 'nao_autenticado'
  | 'email_nao_confirmado'
  | 'rede'
  | 'descricao_obrigatoria'
  | 'descricao_longa'
  | 'valor_invalido'
  | 'valor_acima_do_limite'
  | 'data_invalida'
  | 'data_futura'
  | 'conta_invalida'
  | 'categoria_invalida'
  | 'nome_da_conta_invalido'
  | 'vencimento_fora_do_intervalo'
  | 'compromisso_quitado'
  | 'compromisso_aberto'
  | 'tipo_invalido'
  | 'natureza_invalida'
  | 'modo_de_valor_invalido'
  | 'dia_invalido'
  | 'inicio_fora_do_intervalo'
  | 'parcelas_invalidas'
  | 'parcelas_no_ano_invalidas'
  | 'parcela_inicial_invalida'
  | 'fim_invalido'
  | 'numero_fora_da_serie'
  | 'inicio_em_conta_paga'
  | 'limite_de_gastos_fixos'
  | 'serie_tem_pagamento_posterior'
  | 'serie_tem_pagamentos'
  | 'vencimento_fora_do_mes'
  | 'estimativa_invalida'
  | 'serie_inconsistente'
  | 'ocorrencia_existente'
  | 'mes_fora_da_revisao'
  | 'modo_invalido'
  | 'decisao_invalida'
  | 'mes_invalido'
  | 'periodo_invalido'
  | 'desconhecido';

export class RepoError extends Error {
  constructor(
    readonly code: RepoErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'RepoError';
  }
}

export function isRepoError(e: unknown, code?: RepoErrorCode): e is RepoError {
  return e instanceof RepoError && (code === undefined || e.code === code);
}

let counter = 0;
/** Chave de idempotência por operação (uma por tentativa de salvar um conteúdo). */
export function newOperationKey(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `op-${Date.now().toString(36)}-${(counter++).toString(36)}-${rand}`;
}
