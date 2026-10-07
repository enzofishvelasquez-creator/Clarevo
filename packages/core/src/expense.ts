import type { FinancialEvent, IsoDate } from './events';
import { isValidIsoDate, monthOf } from './events';
import { parseBRL } from './money';

/** Rascunho do formulário "Anotar gasto" (CL-V004). Os campos guardam o texto digitado. */
export interface ExpenseDraft {
  contextId: string;
  amountText: string;
  description: string;
  category: string;
  paidOn: IsoDate;
  idempotencyKey: string;
}

export type ExpenseField = 'amountText' | 'description' | 'paidOn' | 'contextId';
export type FieldErrors = Partial<Record<ExpenseField, string>>;

export const MAX_EXPENSE_CENTS = 100_000_000_00; // R$ 100 milhões: barra erros de digitação grosseiros.

export type ValidationResult =
  | { ok: true; amountCents: number }
  | { ok: false; errors: FieldErrors };

export function validateExpenseDraft(draft: ExpenseDraft): ValidationResult {
  const errors: FieldErrors = {};
  const amount = parseBRL(draft.amountText);
  if (amount === null || amount <= 0 || amount > MAX_EXPENSE_CENTS) {
    errors.amountText = 'Confira o valor informado';
  }
  if (draft.description.trim() === '') {
    errors.description = 'Diga em poucas palavras com o que foi o gasto';
  }
  if (!isValidIsoDate(draft.paidOn)) {
    errors.paidOn = 'Confira a data do pagamento';
  }
  if (draft.contextId.trim() === '') {
    errors.contextId = 'Escolha onde salvar: Pessoal ou Família';
  }
  if (Object.keys(errors).length > 0 || amount === null) return { ok: false, errors };
  return { ok: true, amountCents: amount };
}

/** Converte um rascunho válido em evento de despesa paga (saída confirmada). */
export function expenseFromDraft(
  draft: ExpenseDraft,
  amountCents: number,
  meta: { id: string; createdBy: string; now: string },
): FinancialEvent {
  return {
    id: meta.id,
    contextId: draft.contextId,
    direction: 'saida',
    status: 'confirmado',
    amountCents,
    description: draft.description.trim(),
    category: draft.category.trim() || 'Outros',
    competence: monthOf(draft.paidOn),
    settledOn: draft.paidOn,
    idempotencyKey: draft.idempotencyKey,
    createdBy: meta.createdBy,
    createdAt: meta.now,
    updatedAt: meta.now,
  };
}
