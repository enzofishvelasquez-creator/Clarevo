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
  createdBy: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Compromisso previsto. Origem separada dos registros realizados; não entra em Recebido ou Pago. */
export interface Commitment {
  id: string;
  contextId: string;
  description: string;
  amountCents: Cents;
  dueOn: IsoDate;
  status: 'aberto' | 'quitado' | 'cancelado';
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
