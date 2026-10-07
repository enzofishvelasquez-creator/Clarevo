import type { Cents } from './money';

/** Data de calendário no formato AAAA-MM-DD, sem fuso. */
export type IsoDate = string;
/** Mês de competência no formato AAAA-MM. */
export type IsoMonth = string;

export type ContextKind = 'pessoal' | 'familia';

export interface FinancialContext {
  id: string;
  kind: ContextKind;
  name: string;
}

export type EventDirection = 'entrada' | 'saida';

/**
 * previsto: compromisso ou expectativa, não movimentou dinheiro.
 * confirmado: dinheiro efetivamente recebido ou pago (tem settledOn).
 */
export type EventStatus = 'previsto' | 'confirmado';

export interface FinancialEvent {
  id: string;
  contextId: string;
  direction: EventDirection;
  status: EventStatus;
  amountCents: Cents;
  description: string;
  category: string;
  /** Mês a que o evento pertence (competência). */
  competence: IsoMonth;
  /** Vencimento, quando houver. */
  dueOn?: IsoDate;
  /** Data em que o dinheiro entrou ou saiu. Obrigatória quando confirmado. */
  settledOn?: IsoDate;
  /** Chave gerada pelo formulário para impedir registro duplicado. */
  idempotencyKey: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** Exclusão lógica: o evento deixa de compor totais, mas a autoria fica rastreável. */
  deletedAt?: string;
}

export function monthOf(date: IsoDate): IsoMonth {
  return date.slice(0, 7);
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
