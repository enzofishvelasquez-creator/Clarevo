import type { IsoDate, IsoMonth } from './dates';
import type { Cents } from './money';

export type ContextKind = 'pessoal' | 'familia';
export type RecordKind = 'receita' | 'despesa';

/** Tipo da conta de origem do dinheiro (D-043): informativo; não existe saldo por conta (P-018). */
export type AccountKind = 'banco' | 'dinheiro' | 'outra';
/** Conta ativa aparece nos seletores; arquivada só mantém o histórico. Excluída (sem lançamentos) some da leitura. */
export type AccountStatus = 'ativa' | 'arquivada';

/**
 * Conta de origem do dinheiro (D-043, Ciclo G1): de onde saiu um gasto, um pagamento de conta ou de fatura, ou um aporte em meta.
 * Gravada só por create_account, update_account, set_default_account, set_account_status e delete_account.
 */
export interface FinancialAccount {
  id: string;
  contextId: string;
  /** 1 a 40 caracteres, sem espaços nas pontas; único no contexto sem diferenciar maiúsculas de minúsculas. */
  name: string;
  currency: 'BRL';
  /** null = saldo inicial desconhecido (diferente de zero). */
  initialBalanceCents: Cents | null;
  kind: AccountKind;
  status: AccountStatus;
  /** A conta principal do contexto: a que vem marcada nos seletores. Uma só, sempre ativa. */
  isDefault: boolean;
  version: number;
}

/** Campos que a pessoa informa ao cadastrar ou editar uma conta (create_account, update_account). */
export interface AccountInput {
  name: string;
  kind: AccountKind;
}

/** Espaço da pessoa depois da primeira entrada confirmada. */
export interface PersonalSpace {
  personId: string;
  displayName: string;
  timeZone: string;
  personalContextId: string;
  accounts: FinancialAccount[];
}

/** Registro realizado: gasto já pago ou recebimento já recebido. Fonte única de lista, detalhe e totais. */
export interface FinancialRecord {
  id: string;
  contextId: string;
  accountId: string;
  kind: RecordKind;
  status: 'realizado';
  amountCents: Cents;
  currency: 'BRL';
  /** Data do pagamento ou do recebimento (data civil). */
  occurredOn: IsoDate;
  description: string;
  /** null = "Sem categoria". */
  category: string | null;
  /** Conta a pagar que este gasto quitou; null para registros comuns. Imutável. */
  commitmentId: string | null;
  /**
   * Fatura de cartão que este gasto pagou (pay_invoice): cartão e mês de vencimento da fatura; null nos outros registros.
   * Imutável. Do gasto de um pagamento de fatura, update_record muda só a conta de saída e a data (valor, descrição e
   * categoria vêm da fatura: pagamento_de_fatura) e delete_record nunca o exclui (o caminho é undo_invoice_payment).
   */
  invoice: InvoiceRef | null;
  /**
   * Resumo SHA-256 da chave de acesso da nota fiscal (64 hexadecimais minúsculos, calculado no aparelho por
   * `receiptKeyDigest`; D-038). Nunca a chave de 44 caracteres: a de NF-e de emitente pessoa física carrega o CPF dele. Único
   * por contexto entre gastos e compras no cartão vivos. Só em despesa comum; null nos demais.
   */
  receiptKey: string | null;
  createdBy: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Conta a pagar (compromisso previsto). Origem separada; só o gasto gerado ao pagar entra em Pago. */
export interface Commitment {
  id: string;
  contextId: string;
  description: string;
  /** Valor PREVISTO. Não muda ao pagar com outro valor. */
  amountCents: Cents;
  currency: 'BRL';
  /** Vencimento (data civil). */
  dueOn: IsoDate;
  /** null = "Sem categoria". Sugerida ao pagar. */
  category: string | null;
  /** 'cancelado' existe no enum do banco, mas é proibido por restrição neste ciclo. */
  status: 'aberto' | 'quitado';
  /** Presente se e somente se status === 'quitado'. Lido do gasto vivo vinculado (fonte única, sem cópia). */
  payment: CommitmentPayment | null;
  /** Ocorrência de gasto fixo, parcelamento ou conta do ano; null para conta avulsa. Lida pela junção com a série, sem cópia. */
  series: CommitmentSeriesRef | null;
  /**
   * Alterada só neste mês ("Só esta conta") ou com o valor do ano informado (conta do ano): "esta e as próximas"
   * a partir de outra conta não a muda.
   */
  seriesOverride: boolean;
  /**
   * Valor de referência de um gasto fixo que muda (luz, água) até a pessoa informar o valor da conta. Na conta de fatura
   * de cartão, vale enquanto a fatura está aberta (hoje até o dia do fechamento).
   */
  amountIsEstimate: boolean;
  /**
   * Fatura de cartão (D-037): cartão, mês de vencimento e o dia do fechamento gravado na conta (`card_closing_on`). A conta
   * muda só pelos lançamentos do cartão e é paga por pay_invoice (update_commitment, delete_commitment, pay_commitment e
   * undo_commitment_payment recusam com conta_de_fatura). Depois de paga, a conta não muda mais: o vencimento (`dueOn`) e o
   * fechamento (`invoice.closingOn`) são os de quando foi paga, mesmo que o cartão troque os dias; a fatura mostrada
   * (`buildInvoices`) usa os dois, como invoice_items.
   */
  invoice: CommitmentInvoiceRef | null;
  createdBy: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Fatura de um cartão, identificada pelo mês de vencimento ("fatura de novembro"). */
export interface InvoiceRef {
  cardId: string;
  month: IsoMonth;
}

/**
 * Nota fiscal já anotada (receipt_items): o gasto ou a compra no cartão vivos que têm o resumo da chave. Gasto: `recordId`
 * (abrir com getRecord). Compra: `cardEntryId` (o id da compra, abrir com getCardEntry) e `cardId`.
 */
export type ReceiptMatch =
  | { recordId: string; cardEntryId: null; cardId: null }
  | { recordId: null; cardEntryId: string; cardId: string };

/** A fatura na conta a pagar: também o dia do fechamento gravado (commitments.card_closing_on). */
export interface CommitmentInvoiceRef extends InvoiceRef {
  closingOn: IsoDate;
}

export interface CommitmentPayment {
  recordId: string;
  /** Valor pago (pode diferir do previsto). */
  amountCents: Cents;
  /** = occurredOn do gasto. */
  paidOn: IsoDate;
  accountId: string;
}

/** Vínculo da ocorrência com a série (número e dados da série inteira). */
export interface CommitmentSeriesRef {
  id: string;
  number: number;
  kind: SeriesKind;
  nature: SeriesNature;
  installmentTotal: number | null;
  /** Conta do ano: parcelas por ano (1 = cota única). null nas outras. */
  partsPerYear: number | null;
}

/** Campos que a pessoa informa ao anotar ou editar uma conta a pagar. */
export interface CommitmentInput {
  description: string;
  amountCents: Cents;
  dueOn: IsoDate;
  category: string | null;
  /**
   * Só em "Informar o valor da conta": false tira a marca de estimado, mesmo com valor igual à estimativa.
   * Ausente mantém a marca como está.
   */
  amountIsEstimate?: false;
}

/** Campos que a pessoa informa ao marcar uma conta a pagar como paga. */
export interface PaymentInput {
  accountId: string;
  amountCents: Cents;
  paidOn: IsoDate;
  category: string | null;
}

/**
 * O que payCommitment aceita: um PaymentInput em que a conta pode ser nula, e então vale a conta principal do contexto (D-043;
 * no banco, p_account_id nulo em pay_commitment). As telas sempre mandam a conta escolhida.
 */
export type PaymentRequest = Omit<PaymentInput, 'accountId'> & { accountId: string | null };

/** Campos que a pessoa informa ao criar ou editar um registro. */
export interface RecordInput {
  accountId: string;
  amountCents: Cents;
  occurredOn: IsoDate;
  description: string;
  category: string | null;
  /** Só ao criar uma despesa lida de uma nota fiscal (D-038): o resumo SHA-256 da chave (`ReceiptDraft.receiptKey`), nunca a chave. A edição ignora o campo. */
  receiptKey?: string | null;
}

/** Gasto fixo (todo mês), parcelamento ou conta do ano (todo ano, D-029). */
export type SeriesKind = 'mensal' | 'parcelada' | 'anual';
/** Conta do ano: o ano inteiro entra em Contas a pagar quando a 1ª parcela dele vence até o fim do 2º mês depois do atual. */
export const ANNUAL_LEAD_MONTHS = 2;
/** Conta do ano: de 1 (cota única) a 12 parcelas por ano, em meses seguidos. */
export const PARTS_PER_YEAR_MAX = 12;
export type SeriesNature = 'conta' | 'financiamento' | 'compra_parcelada' | 'outro_parcelamento';
/** Tipos que contam como dívida na renda comprometida (referência de 30%). */
export const DEBT_NATURES: readonly SeriesNature[] = ['financiamento', 'compra_parcelada'];
/** Tipos de parcelamento, na ordem dos chips. */
export const INSTALLMENT_NATURES: readonly SeriesNature[] = ['financiamento', 'compra_parcelada', 'outro_parcelamento'];
export type AmountMode = 'fixo' | 'variavel';

/** Vigência: vale do número fromNumber em diante, até a próxima. Nunca editada, só substituída. */
export interface SeriesTerm {
  fromNumber: number;
  description: string;
  category: string | null;
  amountCents: Cents;
  amountMode: AmountMode;
  /** Dia do vencimento (1 a 31), limitado ao último dia de cada mês. */
  dueDay: number;
}

/**
 * Gasto fixo (série mensal), parcelamento ou conta do ano (série anual). Cada ocorrência é uma conta a pagar comum,
 * criada do mês anterior ao seguinte a hoje (conta do ano: o ano inteiro, dois meses antes); o resto é só previsão.
 */
export interface CommitmentSeries {
  id: string;
  contextId: string;
  kind: SeriesKind;
  nature: SeriesNature;
  /** Mês da ocorrência firstNumber. */
  firstDueMonth: IsoMonth;
  /**
   * Mensal: 1. Parcelada: a próxima parcela a pagar no cadastro; as anteriores foram pagas antes do Clarevo.
   * Anual: de 1 a partsPerYear, a próxima parcela a pagar no primeiro ano; a numeração continua entre os anos.
   */
  firstNumber: number;
  /** null = sem término (mensal e anual). firstNumber − 1 = nenhuma conta (só por encerramento). */
  lastNumber: number | null;
  installmentTotal: number | null;
  /** Só anual: parcelas por ano, de 1 a 12, em meses seguidos. null nas outras. */
  partsPerYear: number | null;
  currency: 'BRL';
  /** Vigências vivas, por fromNumber crescente. */
  terms: SeriesTerm[];
  /** Números excluídos só neste mês: nunca voltam a ser criados. */
  skippedNumbers: number[];
  paidCount: number;
  openCount: number;
  /** Quem criou ainda pode anotar no contexto. */
  generating: boolean;
  createdBy: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Cadastro de gasto fixo, parcelamento ou conta do ano. */
export interface SeriesInput {
  kind: SeriesKind;
  nature: SeriesNature;
  description: string;
  category: string | null;
  amountCents: Cents;
  amountMode: AmountMode;
  dueDay: number;
  /** Mês da primeira conta (mensal) ou da próxima parcela (parcelada e anual). */
  firstDueMonth: IsoMonth;
  firstNumber: number;
  installmentTotal: number | null;
  /** Só anual: parcelas por ano (1 = cota única); null nas outras. */
  partsPerYear: number | null;
  /**
   * Último mês; null = sem data para terminar. Mensal: o mês da última conta. Anual: o mês da última parcela do
   * último ano (lastMonthOfYear). Parcelada: sempre null.
   */
  lastMonth: IsoMonth | null;
}

/** "Esta e as próximas": nova vigência a partir de uma conta. */
export interface SeriesEditInput {
  nature: SeriesNature;
  description: string;
  category: string | null;
  amountCents: Cents;
  amountMode: AmountMode;
  dueDay: number;
}

/**
 * Atividade da pessoa no contexto (D-030), mantida no banco a partir de record_operations: só datas, no fuso dela.
 * Lida só pela própria pessoa.
 */
export interface ContextActivity {
  /** Dia da última anotação (qualquer escrita pelas funções do banco, menos a decisão da revisão). */
  lastWriteOn: IsoDate;
  /** Última ausência longa: do último dia com anotação antes dela ao primeiro dia com anotação depois dela. */
  absenceFromOn: IsoDate | null;
  absenceUntilOn: IsoDate | null;
}

/** "Atualizar agora" concluído com alguma ação, ou "Seguir adiante" (e "Concluir" sem ação). */
export type ReturnDecision = 'atualizou' | 'seguiu';

/** Marca da revisão dos últimos meses (return_reviews). O mês revisado e o dia da decisão nunca recuam. */
export interface ReturnReviewMark {
  /** Último mês fechado coberto pela decisão. */
  reviewedThrough: IsoMonth;
  decision: ReturnDecision;
  decidedOn: IsoDate;
  version: number;
}

/** Atividade e marca da própria pessoa no contexto; null quando ainda não existem (conta nova: as duas). */
export interface ReturnReviewState {
  activity: ContextActivity | null;
  mark: ReturnReviewMark | null;
}

/** Resposta a "Você consegue guardar algum valor por mês?" (plano de guardar, spec7): "consigo", "agora não" ou "responder depois". */
export type SavingsAnswer = 'consigo' | 'agora_nao' | 'depois';

/**
 * Resposta da própria pessoa no contexto (savings_checks): uma linha viva por pessoa e contexto, só dela (nem a Família
 * nem a empresa leem). monthlyCents (100 a 999.999.999) só com 'consigo'; askAgainOn (calculada no banco: depois = hoje + 7,
 * agora_nao = hoje + 30) é nula com 'consigo'. O banco guarda também person_id (a própria pessoa), que o app não usa.
 */
export interface SavingsCheck {
  contextId: string;
  answer: SavingsAnswer;
  monthlyCents: Cents | null;
  answeredOn: IsoDate;
  askAgainOn: IsoDate | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Recebimentos e gastos anotados num mês (months_overview, mesmo critério de month_totals). */
export interface MonthOverview {
  month: IsoMonth;
  receivedCount: number;
  receivedCents: Cents;
  paidCount: number;
  paidCents: Cents;
}

/** create_series_occurrence: a conta do mês passado fica em aberto ou registrada como "não houve". */
export type OccurrenceMode = 'aberta' | 'nao_houve';

/**
 * Renda de referência mensal líquida (D-026(2)): informada pela pessoa, vale a partir de um mês (a mais recente com
 * início até o mês mostrado). Só calcula percentuais: não confirma recebimento e nunca entra em Recebido.
 * Gravada só por set_income_reference e delete_income_reference; no máximo uma viva por contexto e mês.
 */
export interface IncomeReference {
  id: string;
  contextId: string;
  /** Primeiro mês em que vale (no banco, o dia 1 desse mês). */
  fromMonth: IsoMonth;
  amountCents: Cents;
  /** "Minha renda varia": o app pede revisão quando a referência vigente é de um mês anterior. */
  varies: boolean;
  createdBy: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  /**
   * Instante em que o valor mudou pela última vez, ou null se nunca mudou desde que foi criada. Só mudar o valor conta
   * (repetir o mesmo valor ou trocar só "Minha renda varia" não muda).
   */
  amountChangedAt: string | null;
}

/**
 * Metas e reservas (D-027, Ciclo C), no contexto Pessoal. Reserva é meta, não conta: o Clarevo não guarda nem movimenta
 * dinheiro, e movimentos de meta nunca entram em Recebido, Pago, Diferença, Ainda a pagar nem na renda comprometida.
 * - 'emergencia': reserva para imprevistos (no máximo uma não arquivada por contexto), alvo = gastos essenciais × meses;
 * - 'oportunidade': reserva de oportunidade, separada da reserva para imprevistos;
 * - 'objetivo': viagem, curso, troca do carro, entrada de um imóvel.
 */
export type GoalType = 'emergencia' | 'oportunidade' | 'objetivo';
/** Concluir é escolha da pessoa (sem celebração automática); arquivada não recebe movimentos. */
export type GoalStatus = 'ativa' | 'concluida' | 'arquivada';
/**
 * Movimentos registrados pela pessoa, com data até hoje. 'saldo_inicial' (já guardado ao criar, no máximo um, só por
 * create_goal), 'aporte', 'rendimento' (recebido, informado pela pessoa) e 'valorizacao' somam; 'resgate' e
 * 'desvalorizacao' subtraem. "Atualizar valor guardado" registra a diferença como valorização ou desvalorização.
 */
export type GoalMovementKind = 'saldo_inicial' | 'aporte' | 'resgate' | 'rendimento' | 'valorizacao' | 'desvalorizacao';
/**
 * De onde veio a base de gastos essenciais da reserva: média do Pago, contas do mês ou valor digitado. 'reserva_minima':
 * a reserva mínima de "Agora não" (base = alvo, sempre 1 mês); o valor é o alvo escolhido, nunca os gastos essenciais, e
 * não pode servir de base para o plano nem para a cobertura.
 */
export type EssentialBaseSource = 'media_gastos' | 'contas_do_mes' | 'informado' | 'reserva_minima';

/** Meta (goals) com os totais dos movimentos vivos (visão goal_items). Gravada só pelas funções de metas do banco. */
export interface Goal {
  id: string;
  contextId: string;
  goalType: GoalType;
  /** 1 a 40 caracteres, sem espaços nas pontas. */
  name: string;
  /** Valor alvo. Na reserva para imprevistos, sempre essentialBaseCents × essentialMonths. */
  targetCents: Cents;
  /** Prazo opcional (mês). */
  targetMonth: IsoMonth | null;
  /** Plano por mês, opcional: intenção, nunca aporte. */
  plannedMonthlyCents: Cents | null;
  /** Só na reserva para imprevistos (os três juntos): base confirmada, meses (1 a 24) e origem da base. */
  essentialBaseCents: Cents | null;
  essentialMonths: number | null;
  essentialBaseSource: EssentialBaseSource | null;
  status: GoalStatus;
  createdBy: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  /** goal_items: soma com sinal dos movimentos vivos (o valor guardado; nunca negativo ao fim de um dia). */
  savedCents: Cents;
  /** goal_items: totais por tipo, sem sinal. */
  initialCents: Cents;
  depositsCents: Cents;
  withdrawalsCents: Cents;
  incomeCents: Cents;
  appreciationCents: Cents;
  depreciationCents: Cents;
  /** goal_items: data do movimento vivo mais recente (null sem movimentos). */
  lastMovementOn: IsoDate | null;
}

/** Movimento de meta (goal_movements). O tipo nunca muda; a versão da meta não sobe com movimentos. */
export interface GoalMovement {
  id: string;
  goalId: string;
  contextId: string;
  kind: GoalMovementKind;
  /** Sempre positivo; o sinal vem do tipo (MOVEMENT_SIGN). */
  amountCents: Cents;
  occurredOn: IsoDate;
  /** Observação opcional, 1 a 80 caracteres (vazia vira null). */
  note: string | null;
  /**
   * Origem do aporte ou destino do resgate (D-043), opcional e só informativa: não cria gasto nem movimenta saldo. Sempre null
   * nos outros tipos de movimento.
   */
  accountId: string | null;
  createdBy: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Campos de create_goal e update_goal (sem o saldo inicial). */
export interface GoalInput {
  goalType: GoalType;
  name: string;
  /** Objetivo e oportunidade: o valor da meta. Na reserva, ignorado: o alvo gravado é base × meses. */
  targetCents: Cents | null;
  targetMonth: IsoMonth | null;
  plannedMonthlyCents: Cents | null;
  /** Só na reserva (os três juntos); nulos nos outros tipos. */
  essentialBaseCents: Cents | null;
  essentialMonths: number | null;
  essentialBaseSource: EssentialBaseSource | null;
}

/** create_goal: com initialCents > 0, cria o movimento 'saldo_inicial' na data initialOn (até hoje). */
export interface NewGoalInput extends GoalInput {
  initialCents: Cents | null;
  initialOn: IsoDate | null;
}

/** Campos de add_goal_movement e update_goal_movement (o tipo vem à parte e nunca muda). */
export interface GoalMovementInput {
  amountCents: Cents;
  occurredOn: IsoDate;
  note: string | null;
  /**
   * Só em aporte e resgate (D-043): a conta ativa do mesmo contexto. Em addGoalMovement, ausente ou null = sem conta. Em
   * updateGoalMovement, ausente = manter a conta que o movimento já tem (o app publicado antes da 0010 não manda a conta e não a
   * perde), null informado = tirar a conta, um id = trocar ou manter. Nos outros tipos, informar a conta é recusado
   * (campo_nao_se_aplica).
   */
  accountId?: string | null;
}

/** Cartão ativo aceita compras novas; arquivado só mostra o histórico e recebe pagamentos de fatura e lançamentos da fatura. */
export type CardStatus = 'ativo' | 'arquivado';

/**
 * Cartão de crédito (D-037, Ciclo E), no contexto Pessoal. Nunca guarda número completo, código de segurança nem validade:
 * só o apelido e, se a pessoa quiser, os 4 últimos dígitos. Gravado só pelas funções de cartões do banco.
 */
export interface Card {
  id: string;
  contextId: string;
  /** 1 a 30 caracteres, sem espaços nas pontas e sem número de cartão (13 a 19 dígitos seguidos). */
  name: string;
  /** Exatamente 4 dígitos ("0123") ou null. Aparece como "final 1234". */
  lastDigits: string | null;
  /** 1 a 31, limitado ao último dia de cada mês. */
  closingDay: number;
  /** 1 a 31, limitado ao último dia de cada mês. */
  dueDay: number;
  /** R$ 1,00 a R$ 9.999.999,99, ou null. */
  limitCents: Cents | null;
  status: CardStatus;
  createdBy: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  /** card_items.used_cents: limite usado (lançamentos das faturas ainda não pagas, nunca negativo). */
  usedCents: Cents;
  /** card_items.current_month, current_closing_on e current_due_on: a fatura que recebe uma compra de hoje. */
  currentMonth: IsoMonth;
  currentClosingOn: IsoDate;
  currentDueOn: IsoDate;
}

/** Campos de create_card e update_card. */
export interface CardInput {
  name: string;
  lastDigits: string | null;
  closingDay: number;
  dueDay: number;
  limitCents: Cents | null;
}

/**
 * Lançamentos do cartão: 'compra' (uma linha por compra, com as parcelas calculadas pelas regras do core), 'encargo'
 * (juros, multa, IOF, anuidade ou tarifa informados a partir da fatura do banco), 'estorno' (crédito) e 'saldo_anterior'
 * (criado só pelo pagamento parcial da fatura anterior, nunca pela pessoa).
 */
export type CardEntryKind = 'compra' | 'encargo' | 'estorno' | 'saldo_anterior';
export type CardChargeType = 'juros' | 'multa' | 'iof' | 'anuidade' | 'tarifa';

export interface CardEntry {
  /** Compra: o id da compra (no banco, o da parcela 1, que as outras parcelas apontam como purchase_id). */
  id: string;
  contextId: string;
  cardId: string;
  kind: CardEntryKind;
  /** compra e estorno manual: 1 a 80 caracteres; encargo, saldo anterior e estorno automático: null. */
  description: string | null;
  /** compra e estorno: uma das categorias do app ou null; encargo e saldo anterior: null. */
  category: string | null;
  /** Só no encargo. */
  chargeType: CardChargeType | null;
  /** Só na compra: data da compra (até hoje). */
  purchasedOn: IsoDate | null;
  /** Compra: valor total; os outros: valor positivo (o sinal vem do tipo; estorno abate). */
  amountCents: Cents;
  /** Compra: de 1 a 48 parcelas; os outros: 1. */
  installments: number;
  /**
   * Compra: fatura da 1ª parcela (fixada ao gravar, não muda se o cartão mudar de dias); os outros: a fatura do
   * lançamento. Mês do vencimento.
   */
  invoiceMonth: IsoMonth;
  /**
   * Saldo anterior e estorno automático (crédito levado): a fatura de origem, sempre o mês anterior à fatura do lançamento.
   * null nos outros. O estorno com sourceMonth nasce e morre dentro das funções de cartão (lancamento_automatico).
   */
  sourceMonth: IsoMonth | null;
  /** Só no saldo anterior: o gasto do pagamento parcial que o criou. */
  paymentRecordId: string | null;
  /** Só na compra: resumo SHA-256 da chave de acesso da nota fiscal (D-038); único por contexto entre gastos e compras vivos. */
  receiptKey: string | null;
  createdBy: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Uma fatura como a visão invoice_items a devolve (calculada, nunca gravada). Totais em centavos; total pode ser negativo. */
export interface InvoiceItem {
  cardId: string;
  /** Mês do vencimento. */
  month: IsoMonth;
  closingOn: IsoDate;
  dueOn: IsoDate;
  status: 'aberta' | 'fechada' | 'paga' | 'paga_em_parte';
  /** Parcelas + encargos + saldo anterior - estornos (inclusive o crédito levado). Negativo = crédito para a seguinte. */
  totalCents: Cents;
  purchasesCents: Cents;
  chargesCents: Cents;
  /** Saldo anterior (pagamento parcial da fatura anterior). */
  carriedInCents: Cents;
  /** Estornos, inclusive o estorno automático. */
  refundsCents: Cents;
  /** max(0, -total): o que é levado à fatura seguinte. */
  creditCents: Cents;
  entryCount: number;
  commitmentId: string | null;
  commitmentVersion: number | null;
  amountIsEstimate: boolean;
  /** Valor da conta em aberto; 0 quando paga ou sem conta. */
  toPayCents: Cents;
  paidRecordId: string | null;
  paidCents: Cents | null;
  paidOn: IsoDate | null;
  paidAccountId: string | null;
  /** Pagamento parcial: o que ficou para a fatura seguinte; null sem pagamento. */
  leftOverCents: Cents | null;
}

/** add_card_purchase e update_card_entry (compra). */
export interface CardPurchaseInput {
  description: string;
  category: string | null;
  purchasedOn: IsoDate;
  totalCents: Cents;
  installments: number;
  /** Só ao criar (add_card_purchase), lida de uma nota fiscal (D-038): o resumo SHA-256 da chave (`ReceiptDraft.receiptKey`), nunca a chave. A edição ignora o campo. */
  receiptKey?: string | null;
}

/** add_card_charge e update_card_entry (encargo). */
export interface CardChargeInput {
  chargeType: CardChargeType;
  amountCents: Cents;
  invoiceMonth: IsoMonth;
}

/** add_card_refund e update_card_entry (estorno). */
export interface CardRefundInput {
  description: string;
  category: string | null;
  amountCents: Cents;
  invoiceMonth: IsoMonth;
}

/** update_card_entry: o tipo precisa ser o do lançamento (tipo_invalido), e o saldo anterior não se altera. */
export type CardEntryInput =
  | ({ kind: 'compra' } & CardPurchaseInput)
  | ({ kind: 'encargo' } & CardChargeInput)
  | ({ kind: 'estorno' } & CardRefundInput);

export const NO_CATEGORY_LABEL = 'Sem categoria';
export const CATEGORIES: Record<RecordKind, readonly string[]> = {
  despesa: ['Moradia', 'Mercado', 'Transporte', 'Saúde', 'Educação', 'Lazer'],
  receita: ['Salário', 'Renda extra', 'Reembolso'],
};
