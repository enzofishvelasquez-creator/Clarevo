import type { Cents } from './money';
import { formatBRL } from './money';
import type { InvestmentMovement } from './investments';

/**
 * Histórico de um investimento com o saldo linha a linha (D-104, item 16), separado da posição de hoje (o valor no alto do detalhe).
 *
 * H1. A ordem é a do banco (`clarevo_investment_negative_day`): data; no mesmo dia, aportes, resgates e rendimentos antes da atualização de
 *     valor (o valor informado fecha o dia); depois, pela criação e pelo id.
 * H2. O saldo depois de cada linha: a atualização de valor troca o saldo pelo valor informado; o aporte soma; o resgate tira; o rendimento
 *     recebido não muda o saldo (o dinheiro caiu na conta). Antes da primeira atualização, o saldo é o aplicado menos o resgatado.
 * H3. Na atualização, a diferença para o saldo anterior: quanto o investimento rendeu (ou perdeu) desde a linha de antes, pelo extrato.
 * A lista volta do mais recente ao mais antigo, como a tela mostra.
 */

type Movement = Pick<InvestmentMovement, 'id' | 'kind' | 'amountCents' | 'occurredOn'> & { createdAt?: string };

export interface InvestmentHistoryRow<M extends Movement = Movement> {
  movement: M;
  balanceAfterCents: Cents;
  /** Só na atualização de valor: o valor informado menos o saldo anterior. */
  changeCents: Cents | null;
}

const SIGN: Readonly<Record<InvestmentMovement['kind'], number>> = { aporte: 1, resgate: -1, rendimento: 0, valor: 0 };

/** Os movimentos na ordem do banco (H1). */
function chronological<M extends Movement>(movements: readonly M[]): M[] {
  const cmp = (x: string | undefined, y: string | undefined) => (x === y ? 0 : x === undefined ? 1 : y === undefined ? -1 : x < y ? -1 : 1);
  return [...movements].sort((a, b) => {
    if (a.occurredOn !== b.occurredOn) return a.occurredOn < b.occurredOn ? -1 : 1;
    const kind = (a.kind === 'valor' ? 1 : 0) - (b.kind === 'valor' ? 1 : 0);
    return kind !== 0 ? kind : cmp(a.createdAt, b.createdAt) || cmp(a.id, b.id);
  });
}

/** O histórico com o saldo depois de cada linha (H2 e H3), do mais recente ao mais antigo. */
export function investmentHistory<M extends Movement>(movements: readonly M[]): InvestmentHistoryRow<M>[] {
  let balance = 0;
  const rows: InvestmentHistoryRow<M>[] = [];
  for (const m of chronological(movements)) {
    if (m.kind === 'valor') {
      rows.push({ movement: m, balanceAfterCents: m.amountCents, changeCents: m.amountCents - balance });
      balance = m.amountCents;
    } else {
      balance += SIGN[m.kind] * m.amountCents;
      rows.push({ movement: m, balanceAfterCents: balance, changeCents: null });
    }
  }
  return rows.reverse();
}

export const HISTORY_TEXT = {
  title: 'Histórico',
  intro: 'Cada aporte, atualização de valor, resgate e rendimento, do mais recente ao mais antigo, com o saldo depois de cada um. O valor de hoje fica no alto da tela.',
  /** "Saldo depois: R$ 10.875,00" */
  balance: (c: Cents) => `Saldo depois: ${formatBRL(c)}`,
  /** "R$ 95,00 a mais que o saldo anterior" (sem cor: sinal e palavra). */
  change: (c: Cents) => (c === 0 ? 'Igual ao saldo anterior' : c > 0 ? `${formatBRL(c)} a mais que o saldo anterior` : `${formatBRL(-c)} a menos que o saldo anterior`),
  income: 'Caiu na conta: o saldo não muda.',
  /** Parte do nome acessível da linha. */
  balanceA11y: (c: Cents) => `saldo depois ${formatBRL(c)}`,
} as const;
