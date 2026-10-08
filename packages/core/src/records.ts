import type { IsoDate, IsoMonth } from './dates';
import type { Cents } from './money';

export type ContextKind = 'pessoal' | 'familia';
export type RecordKind = 'receita' | 'despesa';

export interface FinancialAccount {
  id: string;
  contextId: string;
  name: string;
  currency: 'BRL';
  /** null = saldo inicial desconhecido (diferente de zero). */
  initialBalanceCents: Cents | null;
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
  /** Ocorrência de gasto fixo ou parcelamento; null para conta avulsa. Lida pela junção com a série, sem cópia. */
  series: CommitmentSeriesRef | null;
  /** Alterada só neste mês ("Só esta conta"): "esta e as próximas" a partir de outro mês não a muda. */
  seriesOverride: boolean;
  /** Valor de referência de um gasto fixo que muda (luz, água) até a pessoa informar o valor da conta. */
  amountIsEstimate: boolean;
  createdBy: string;
  version: number;
  createdAt: string;
  updatedAt: string;
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

/** Campos que a pessoa informa ao criar ou editar um registro. */
export interface RecordInput {
  accountId: string;
  amountCents: Cents;
  occurredOn: IsoDate;
  description: string;
  category: string | null;
}

export type SeriesKind = 'mensal' | 'parcelada';
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
 * Gasto fixo (série mensal) ou parcelamento. Cada mês da série é uma conta a pagar comum (ocorrência),
 * criada do mês anterior ao seguinte a hoje; o resto é só previsão.
 */
export interface CommitmentSeries {
  id: string;
  contextId: string;
  kind: SeriesKind;
  nature: SeriesNature;
  /** Mês da ocorrência firstNumber. */
  firstDueMonth: IsoMonth;
  /** Mensal: 1. Parcelada: a próxima parcela a pagar no cadastro; as anteriores foram pagas antes do Clarevo. */
  firstNumber: number;
  /** null = sem término (só mensal). firstNumber − 1 = nenhuma conta (só por encerramento). */
  lastNumber: number | null;
  installmentTotal: number | null;
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

/** Cadastro de gasto fixo ou parcelamento. */
export interface SeriesInput {
  kind: SeriesKind;
  nature: SeriesNature;
  description: string;
  category: string | null;
  amountCents: Cents;
  amountMode: AmountMode;
  dueDay: number;
  /** Mês da primeira conta (mensal) ou da próxima parcela (parcelada). */
  firstDueMonth: IsoMonth;
  firstNumber: number;
  installmentTotal: number | null;
  /** Último mês (só mensal); null = sem data para terminar. */
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

export const NO_CATEGORY_LABEL = 'Sem categoria';
export const CATEGORIES: Record<RecordKind, readonly string[]> = {
  despesa: ['Moradia', 'Mercado', 'Transporte', 'Saúde', 'Educação', 'Lazer'],
  receita: ['Salário', 'Renda extra', 'Reembolso'],
};
