import {
  isInvoiceCommitment,
  isValidIsoMonth,
  type Commitment,
  type IsoMonth,
} from '@clarevo/core';
import { router, type Href } from 'expo-router';

/** Fatura de um cartão (mês do vencimento). */
export function invoiceHref(cardId: string, month: IsoMonth): Href {
  return { pathname: '/cartoes/[id]/fatura/[mes]', params: { id: cardId, mes: month } };
}

export function cardHref(cardId: string): Href {
  return { pathname: '/cartoes/[id]', params: { id: cardId } };
}

/**
 * Para onde leva uma conta a pagar: a conta de fatura abre a fatura do cartão (nunca "Já paguei", editar ou excluir);
 * as outras abrem o detalhe da conta.
 */
export function commitmentHref(c: Pick<Commitment, 'id' | 'invoice'>): Href {
  return isInvoiceCommitment(c) ? invoiceHref(c.invoice!.cardId, c.invoice!.month) : `/a-pagar/${c.id}`;
}

export function openCommitment(c: Pick<Commitment, 'id' | 'invoice'>) {
  router.push(commitmentHref(c));
}

/** Mês lido do endereço (AAAA-MM); qualquer outra coisa é null. */
export function readInvoiceMonth(value: unknown): IsoMonth | null {
  return typeof value === 'string' && /^\d{4}-\d{2}$/.test(value) && isValidIsoMonth(value) ? value : null;
}
