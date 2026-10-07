import type { IsoMonth } from '@clarevo/core';

/**
 * Efeito de um registro no resumo ("+ R$ 80,00 em Pago"), mostrado uma vez quando o Resumo
 * do mesmo mês recebe o foco depois de salvar, editar ou excluir. Só em memória.
 */
export interface TotalChange {
  total: 'recebido' | 'pago';
  deltaCents: number;
  month: IsoMonth;
}

let pending: TotalChange | null = null;

export const totalChange = {
  set(change: TotalChange) {
    pending = change.deltaCents === 0 ? null : change;
  },
  take(month: IsoMonth): TotalChange | null {
    const c = pending;
    if (!c || c.month !== month) return null;
    pending = null;
    return c;
  },
};
