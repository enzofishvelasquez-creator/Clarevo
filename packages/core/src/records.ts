import type { IsoDate } from './dates';
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

/** Campos que a pessoa informa ao anotar ou editar uma conta a pagar. */
export interface CommitmentInput {
  description: string;
  amountCents: Cents;
  dueOn: IsoDate;
  category: string | null;
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

export const NO_CATEGORY_LABEL = 'Sem categoria';
export const CATEGORIES: Record<RecordKind, readonly string[]> = {
  despesa: ['Moradia', 'Mercado', 'Transporte', 'Saúde', 'Educação', 'Lazer'],
  receita: ['Salário', 'Renda extra', 'Reembolso'],
};
