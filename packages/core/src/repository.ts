import type { IsoDate, IsoMonth } from './dates';
import type { Cents } from './money';
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
  FinancialRecord,
  Goal,
  GoalInput,
  GoalMovement,
  GoalMovementInput,
  GoalMovementKind,
  GoalStatus,
  IncomeReference,
  InvoiceItem,
  ReceiptMatch,
  MonthOverview,
  NewGoalInput,
  OccurrenceMode,
  PaymentInput,
  PersonalSpace,
  RecordInput,
  RecordKind,
  ReturnDecision,
  ReturnReviewMark,
  ReturnReviewState,
  SavingsAnswer,
  SavingsCheck,
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
export type ReturnReviewAction = 'decidir_revisao';

/**
 * Renda de referência (D-026, Ciclo B), gravada em record_operations com a referência em target_id:
 * set_income_reference ('definir_renda_referencia') e delete_income_reference ('excluir_renda_referencia').
 * Contam como anotação na atividade (D-030), como as demais escritas.
 */
export type IncomeReferenceAction = 'definir_renda_referencia' | 'excluir_renda_referencia';

/**
 * Resposta do plano de guardar (set_savings_answer, spec7), gravada em record_operations sem alvo. Como 'decidir_revisao',
 * não conta como anotação na atividade (D-030).
 */
export type SavingsAction = 'responder_guardar';

/**
 * Metas (D-027, Ciclo C), gravadas em record_operations com o alvo em target_id: a meta em criar_meta, alterar_meta,
 * situacao_meta e excluir_meta; o movimento em registrar_movimento_meta, alterar_movimento_meta e
 * excluir_movimento_meta. Contam como anotação na atividade (D-030), como as demais escritas.
 */
export type GoalAction =
  | 'criar_meta'
  | 'alterar_meta'
  | 'situacao_meta'
  | 'excluir_meta'
  | 'registrar_movimento_meta'
  | 'alterar_movimento_meta'
  | 'excluir_movimento_meta';

/**
 * Resultado das escritas de metas: a meta no estado atual (com os totais de goal_items, inclusive excluída) e o
 * movimento envolvido (o saldo inicial em createGoal; o registrado, alterado ou excluído nas escritas de movimento).
 */
export interface GoalWrite {
  goal: Goal;
  movement: GoalMovement | null;
}

/**
 * Cartões de crédito (D-037, Ciclo E), gravados em record_operations com o cartão em target_id; nas cinco ações de
 * lançamento (criar_compra_cartao, alterar_lancamento_cartao, excluir_lancamento_cartao, criar_encargo_cartao e
 * criar_estorno_cartao) o lançamento fica também em entry_id (na compra, o id da parcela 1); em pagar_fatura e
 * desfazer_pagamento_fatura, a conta da fatura em commitment_id e o gasto em record_id. Contam como anotação na atividade
 * (D-030), como as demais escritas.
 */
export type CardAction =
  | 'criar_cartao'
  | 'alterar_cartao'
  | 'situacao_cartao'
  | 'excluir_cartao'
  | 'criar_compra_cartao'
  | 'alterar_lancamento_cartao'
  | 'excluir_lancamento_cartao'
  | 'criar_encargo_cartao'
  | 'criar_estorno_cartao'
  | 'pagar_fatura'
  | 'desfazer_pagamento_fatura';

/**
 * Resultado das escritas de cartão (o JSON {card, entry, invoices, commitments, commitment, record} do banco): o cartão no
 * estado atual (inclusive excluído, com o limite usado e a fatura atual), o lançamento envolvido (a compra inteira; criado,
 * alterado ou excluído; null nas escritas do cartão), as faturas envolvidas que ainda existem, como invoice_items, e todas as
 * contas de fatura vivas do cartão, já com o valor mantido na mesma transação.
 */
export interface CardWrite {
  card: Card;
  entry: CardEntry | null;
  invoices: InvoiceItem[];
  commitments: Commitment[];
}

/**
 * Resultado de pay_invoice e undo_invoice_payment: a conta da fatura (paga ou reaberta), o gasto do pagamento (criado ou
 * excluído) e, em entry, o saldo anterior criado (pagamento parcial) ou removido (desfazer); null sem saldo.
 */
export interface InvoicePaymentWrite extends CardWrite {
  commitment: Commitment;
  record: FinancialRecord;
}

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

  // Renda de referência (D-026, Ciclo B). Para "Próximos meses", as contas por vencimento vêm de
  // listCommitmentsDueBetween (mesma leitura de commitment_items).

  /** Referências vivas do contexto, por mês de início crescente. Sem leitura: lista vazia (RLS). */
  listIncomeReferences(contextId: string): Promise<IncomeReference[]>;
  /**
   * Cria (expectedVersion 0) ou altera (versão atual) a referência viva do mês fromMonth. Exige escrita no contexto.
   * Ordem do banco: repetição; sem_permissao; mes_invalido; referencia_fora_do_intervalo (fora de mês atual − 24 a
   * mês atual + 12); valor_invalido e valor_acima_do_limite; tipo_invalido (varies nulo); versao_desatualizada (versão
   * nula ou negativa, 0 com referência viva no mês, maior que 0 sem referência viva ou com outra versão); autoria ou
   * "editar de outras pessoas" (sem_permissao). Mesma chave e conteúdo: devolve o estado atual; outro conteúdo ou outra
   * ação: chave_reutilizada.
   */
  setIncomeReference(
    key: string,
    contextId: string,
    fromMonth: IsoMonth,
    expectedVersion: number,
    amountCents: Cents,
    varies: boolean,
  ): Promise<IncomeReference>;
  /**
   * Exclusão lógica com versão (a anterior volta a valer). Ordem: repetição; nao_encontrado (sem leitura ou já
   * excluída); sem_permissao (sem escrita); versao_desatualizada; autoria. Devolve a referência excluída.
   */
  deleteIncomeReference(key: string, id: string, expectedVersion: number): Promise<IncomeReference>;

  // Metas e reservas (D-027, Ciclo C). Ordem das conferências e códigos em goals.ts (GOAL_*_CODE_ORDER).

  /** Metas vivas do contexto (todas as situações), por criação; com os totais de goal_items. Sem leitura: lista vazia. */
  listGoals(contextId: string): Promise<Goal[]>;
  /** Meta viva (com os totais de goal_items) ou null (excluída, inexistente ou sem leitura). */
  getGoal(id: string): Promise<Goal | null>;
  /** Movimentos vivos da meta, do mais recente ao mais antigo (data, criação, id). Sem leitura: lista vazia. */
  listGoalMovements(goalId: string): Promise<GoalMovement[]>;
  /** Movimentos vivos de todas as metas do contexto com data no mês, do mais recente ao mais antigo. */
  listGoalMovementsInMonth(contextId: string, month: IsoMonth): Promise<GoalMovement[]>;
  /**
   * create_goal. Exige escrita no contexto. Na reserva ('emergencia'), o alvo gravado é base × meses (targetCents nulo
   * ou igual ao produto, senão alvo_invalido). Com initialCents > 0, cria o movimento 'saldo_inicial' em initialOn.
   * Ordem: repetição; sem_permissao; GOAL_INPUT_CODE_ORDER; saldo inicial (saldo_inicial_invalido, data_invalida,
   * data_futura); reserva_ja_existe.
   */
  createGoal(key: string, contextId: string, input: NewGoalInput): Promise<GoalWrite>;
  /**
   * update_goal (mesmos campos, sem o saldo inicial), em qualquer situação. Ordem: repetição; nao_encontrado;
   * sem_permissao (inclusive autoria sem "editar de outras pessoas", só no banco); versao_desatualizada;
   * GOAL_INPUT_CODE_ORDER (o intervalo do prazo só quando ele muda); reserva_ja_existe. Movimentos não mudam.
   */
  updateGoal(key: string, goalId: string, expectedVersion: number, input: GoalInput): Promise<GoalWrite>;
  /**
   * set_goal_status: concluir, arquivar e reativar. Ordem: repetição; nao_encontrado; sem_permissao;
   * versao_desatualizada; situacao_invalida; reserva_ja_existe (reserva saindo de arquivada com outra reserva não
   * arquivada no contexto).
   */
  setGoalStatus(key: string, goalId: string, expectedVersion: number, status: GoalStatus): Promise<GoalWrite>;
  /** delete_goal: exclui a meta e os movimentos vivos (versão + 1 em cada), em qualquer situação. Ordem: repetição; trava; versão. */
  deleteGoal(key: string, goalId: string, expectedVersion: number): Promise<GoalWrite>;
  /**
   * add_goal_movement: sem versão (como create_record); a versão da meta não sobe. Ordem: repetição; nao_encontrado;
   * sem_permissao; meta_arquivada; tipo_invalido ('saldo_inicial' só por createGoal); valor_invalido;
   * valor_acima_do_limite; data_invalida; data_futura; observacao_longa; saldo_da_meta_insuficiente (o primeiro dia
   * negativo em RepoError.detail, "dia=AAAA-MM-DD"; negativeDayFromDetail).
   */
  addGoalMovement(key: string, goalId: string, kind: GoalMovementKind, input: GoalMovementInput): Promise<GoalWrite>;
  /**
   * update_goal_movement: o tipo nunca muda (o 'saldo_inicial' também pode ser corrigido). Ordem: repetição;
   * nao_encontrado; sem_permissao (autoria, só no banco); versao_desatualizada; meta_arquivada; valor, data e
   * observação; saldo_da_meta_insuficiente.
   */
  updateGoalMovement(key: string, movementId: string, expectedVersion: number, input: GoalMovementInput): Promise<GoalWrite>;
  /** delete_goal_movement. Ordem: repetição; nao_encontrado; sem_permissao; versao_desatualizada; meta_arquivada; saldo. */
  deleteGoalMovement(key: string, movementId: string, expectedVersion: number): Promise<GoalWrite>;
  /** Reconciliação de metas: a operação com esta chave já foi concluída? movementId só nas ações de movimento. */
  findGoalOperation(key: string): Promise<{ action: GoalAction; goalId: string; movementId: string | null } | null>;

  // Plano de guardar (spec7). A resposta e as datas são só da própria pessoa (RLS como a atividade do A4).

  /** Resposta da própria pessoa no contexto (savings_checks) ou null (ainda não respondeu, sem leitura ou outra pessoa). */
  getSavingsCheck(contextId: string): Promise<SavingsCheck | null>;
  /**
   * set_savings_answer. Grava (versão 0 = ainda não existe) ou substitui a resposta viva da pessoa no contexto. Exige
   * escrita no contexto. Ordem: repetição; sem_permissao; resposta_invalida; valor_invalido e valor_acima_do_limite
   * (monthlyCents de 100 a 999.999.999 só com 'consigo'; nulo nas outras respostas); versao_desatualizada (versão nula ou
   * negativa também; RepoError.detail "versao_atual=N"). As datas são calculadas aqui, no dia da pessoa: answeredOn = hoje; askAgainOn = hoje + 7
   * ('depois'), hoje + 30 ('agora_nao') ou nula ('consigo'). Mesma chave e conteúdo: devolve o estado atual; outro
   * conteúdo ou outra ação: chave_reutilizada. Não conta como anotação na atividade. Reconciliação: repetir a chave.
   */
  setSavingsAnswer(key: string, contextId: string, expectedVersion: number, answer: SavingsAnswer, monthlyCents?: Cents | null): Promise<SavingsCheck>;

  // Cartões de crédito (D-037, Ciclo E). Regras e ordem das conferências em cards.ts (CARD_*_CODE_ORDER), iguais às da migração 0008.

  /** Cartões vivos do contexto (ativos e arquivados), por criação, com o limite usado e a fatura atual (card_items). Sem leitura: lista vazia. */
  listCards(contextId: string): Promise<Card[]>;
  /** Cartão vivo ou null (excluído, inexistente ou sem leitura). */
  getCard(id: string): Promise<Card | null>;
  /** Lançamento vivo (a compra pelo id dela) ou null. Serve a "Esta nota já foi anotada" (nota_ja_anotada, detalhe compra=<id>). */
  getCardEntry(id: string): Promise<CardEntry | null>;
  /**
   * Nota fiscal já anotada neste contexto (D-038), para o aviso "Esta nota já foi anotada" logo depois de escanear, antes de
   * Salvar: procura o gasto vivo ou a compra viva no cartão que têm o resumo da chave (`ReceiptDraft.receiptKey`, 64
   * hexadecimais minúsculos; receipt_items no banco). Devolve o gasto (`recordId`, abrir com getRecord) ou a compra
   * (`cardEntryId`, abrir com getCardEntry, e `cardId`); null se a nota não foi anotada, se o resumo não tem a forma certa ou se
   * quem consulta não lê o contexto (não revela a existência). Só leitura: não grava nem conta como anotação.
   */
  findReceipt(contextId: string, receiptKey: string): Promise<ReceiptMatch | null>;
  /**
   * Lançamentos vivos do cartão: compras (uma por compra, com as parcelas calculadas por purchaseInstallments), encargos,
   * estornos (inclusive o automático) e saldos anteriores, por criação. Sem leitura: lista vazia.
   */
  listCardEntries(cardId: string): Promise<CardEntry[]>;
  /**
   * Contas de fatura vivas do cartão (uma por fatura com total maior que zero, abertas e pagas), por mês da fatura. Junto de
   * listCardEntries, dão buildInvoices (cards.ts).
   */
  listInvoiceCommitments(cardId: string): Promise<Commitment[]>;
  /** Faturas do cartão como a visão invoice_items (uma por mês com lançamento ou conta viva), do mês mais antigo ao mais novo. */
  listInvoiceItems(cardId: string): Promise<InvoiceItem[]>;
  /**
   * create_card. Exige escrita no contexto. Ordem: repetição; sem_permissao; CARD_INPUT_CODE_ORDER (apelido_invalido,
   * final_invalido, dia_de_fechamento_invalido, dia_de_vencimento_invalido, limite_invalido); limite_de_cartoes (20 ativos).
   */
  createCard(key: string, contextId: string, input: CardInput): Promise<CardWrite>;
  /**
   * update_card, em qualquer situação. Ordem: repetição; nao_encontrado; sem_permissao; versao_desatualizada;
   * CARD_INPUT_CODE_ORDER; dias_com_fatura_paga (mudar os dias quando, com os dias novos, a fatura do período de hoje ou
   * alguma depois dela já está paga; nada é gravado). As contas de fatura em aberto passam a ter o novo apelido e vencimento (mesma transação); as
   * compras já feitas ficam nas faturas em que foram lançadas.
   */
  updateCard(key: string, id: string, expectedVersion: number, input: CardInput): Promise<CardWrite>;
  /**
   * set_card_status: arquivar e reativar. Ordem: repetição; trava; versão; situacao_invalida; limite_de_cartoes (reativar
   * com 20 ativos). Mesma situação é aceita (versão + 1).
   */
  setCardStatus(key: string, id: string, expectedVersion: number, status: CardStatus): Promise<CardWrite>;
  /**
   * delete_card: exclusão lógica, só sem lançamentos vivos nem conta de fatura viva (cartao_com_lancamentos). Ordem: repetição;
   * trava; versão; lançamentos.
   */
  deleteCard(key: string, id: string, expectedVersion: number): Promise<CardWrite>;
  /**
   * add_card_purchase: sem versão (como create_record). A 1ª parcela cai sempre na fatura natural, a cujo período a data
   * pertence (`invoiceMonthOf`); as outras, nas seguintes. Se a fatura da 1ª parcela, ou de qualquer outra, já está paga, recusa
   * com fatura_paga (texto: `cardErrorText('fatura_paga', { purchase: true })`; antes de enviar, `purchasePreview` mostra o
   * mesmo texto): a compra não vai para outra fatura; quem foi cobrado depois registra um encargo ou ajuste na fatura atual.
   * Ordem: repetição; nao_encontrado; sem_permissao; cartao_arquivado; CARD_PURCHASE_CODE_ORDER
   * (valor_invalido, valor_acima_do_limite, descricao_obrigatoria, descricao_longa, categoria_invalida, parcelas_invalidas,
   * data_invalida, data_futura); com receiptKey (o resumo SHA-256 da chave, nunca a chave): chave_de_nota_invalida,
   * nota_ja_anotada (detalhe "registro=<id>" ou "compra=<id>"); limite_de_lancamentos; fatura_paga. entry = a compra.
   */
  addCardPurchase(key: string, cardId: string, input: CardPurchaseInput): Promise<CardWrite>;
  /**
   * update_card_entry (compra, encargo ou estorno manual; o tipo vem em input.kind e precisa ser o do lançamento). Ordem:
   * repetição; nao_encontrado; sem_permissao; lancamento_automatico (saldo anterior e estorno automático); tipo_invalido;
   * versao_desatualizada; campos como em add_* (a data da compra e a fatura de encargo e estorno só são conferidas no
   * intervalo quando mudam); fatura_paga (mudar valor, data ou parcelas da compra, ou o valor ou a fatura de encargo e
   * estorno, numa fatura já paga; mudar só descrição e categoria da compra vale). entry = a compra ou o lançamento.
   */
  updateCardEntry(key: string, entryId: string, expectedVersion: number, input: CardEntryInput): Promise<CardWrite>;
  /** delete_card_entry (exclusão lógica; a compra inteira). Ordem: repetição; trava; lancamento_automatico; versão; fatura_paga. */
  deleteCardEntry(key: string, entryId: string, expectedVersion: number): Promise<CardWrite>;
  /**
   * add_card_charge: encargo informado a partir da fatura do banco; cartão arquivado também aceita. Ordem: repetição;
   * nao_encontrado; sem_permissao; CARD_CHARGE_CODE_ORDER (tipo_de_encargo_invalido, valor_invalido, valor_acima_do_limite,
   * mes_invalido); limite_de_lancamentos; fatura_paga.
   */
  addCardCharge(key: string, cardId: string, input: CardChargeInput): Promise<CardWrite>;
  /**
   * add_card_refund: estorno (crédito) numa fatura escolhida; cartão arquivado também aceita. Ordem: repetição; trava;
   * CARD_REFUND_CODE_ORDER (valor_invalido, valor_acima_do_limite, descricao_obrigatoria, descricao_longa,
   * categoria_invalida, mes_invalido); limite_de_lancamentos; fatura_paga. Crédito maior que o total da fatura vira um estorno
   * automático na seguinte, enquanto houver lançamento comum nela ou depois dela (fatura_seguinte_paga se ela já foi paga).
   */
  addCardRefund(key: string, cardId: string, input: CardRefundInput): Promise<CardWrite>;
  /**
   * pay_invoice: cria UM gasto "Fatura Nubank (outubro)" na data do pagamento e marca a conta da fatura como paga.
   * expectedVersion = versão da conta da fatura (Invoice.commitmentVersion). accountId: a conta de saída; ausente, a conta ativa
   * mais antiga do contexto. Ordem: repetição; nao_encontrado; sem_permissao; mes_invalido; nao_encontrado (a fatura não tem
   * conta); versao_desatualizada; compromisso_quitado; fatura_aberta (só se paga depois que a fatura fecha: hoje até o dia do
   * fechamento, ou fatura futura, é recusado, sem gravar nada; o texto com a data é
   * `cardErrorText('fatura_aberta', { closingOn })`); valor_invalido; valor_acima_da_fatura; data_invalida (inválida, ou
   * antes do menor entre 1 ano atrás e o início do período da fatura, para pagar uma fatura antiga na data real); data_futura;
   * conta_invalida; fatura_seguinte_paga (pagamento parcial com a fatura seguinte já paga). A data do pagamento pode ser
   * anterior ao fechamento (quem pagou antes informa o dia em que pagou).
   * Pagamento parcial: a diferença vira o lançamento "saldo anterior" na fatura do mês seguinte (entry). O gasto não tem categoria.
   */
  payInvoice(
    key: string,
    cardId: string,
    month: IsoMonth,
    expectedVersion: number,
    amountCents: Cents,
    paidOn: IsoDate,
    accountId?: string | null,
  ): Promise<InvoicePaymentWrite>;
  /**
   * undo_invoice_payment: apaga o gasto, reabre a conta e apaga o saldo anterior criado. Ordem: repetição; nao_encontrado;
   * sem_permissao; mes_invalido; nao_encontrado (sem conta); versao_desatualizada; compromisso_aberto (a conta não está paga);
   * fatura_seguinte_paga (há saldo anterior e a fatura seguinte já foi paga).
   */
  undoInvoicePayment(key: string, cardId: string, month: IsoMonth, expectedVersion: number): Promise<InvoicePaymentWrite>;
  /** Reconciliação de cartões: a operação com esta chave já foi concluída? entryId só nas ações de lançamento. */
  findCardOperation(key: string): Promise<{
    action: CardAction;
    cardId: string;
    entryId: string | null;
    commitmentId: string | null;
    recordId: string | null;
  } | null>;
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
  | 'referencia_fora_do_intervalo'
  | 'reserva_ja_existe'
  | 'nome_da_meta_invalido'
  | 'alvo_acima_do_limite'
  | 'prazo_invalido'
  | 'meses_invalidos'
  | 'origem_invalida'
  | 'alvo_invalido'
  | 'plano_invalido'
  | 'saldo_inicial_invalido'
  | 'observacao_longa'
  | 'situacao_invalida'
  | 'meta_arquivada'
  | 'saldo_da_meta_insuficiente'
  | 'resposta_invalida'
  | 'conta_de_fatura'
  | 'pagamento_de_fatura'
  | 'fatura_paga'
  | 'fatura_aberta'
  | 'fatura_seguinte_paga'
  | 'dias_com_fatura_paga'
  | 'valor_acima_da_fatura'
  | 'lancamento_automatico'
  | 'campo_nao_se_aplica'
  | 'apelido_invalido'
  | 'final_invalido'
  | 'dia_de_fechamento_invalido'
  | 'dia_de_vencimento_invalido'
  | 'limite_invalido'
  | 'limite_de_cartoes'
  | 'limite_de_lancamentos'
  | 'cartao_arquivado'
  | 'cartao_com_lancamentos'
  | 'tipo_de_encargo_invalido'
  | 'chave_de_nota_invalida'
  | 'nota_ja_anotada'
  | 'desconhecido';

export class RepoError extends Error {
  constructor(
    readonly code: RepoErrorCode,
    message?: string,
    /**
     * Detalhe do banco, quando houver (saldo_da_meta_insuficiente: o primeiro dia negativo, AAAA-MM-DD; versao_desatualizada:
     * "versao_atual=N"; nota_ja_anotada: "registro=<id>" ou "compra=<id>").
     */
    readonly detail?: string,
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
