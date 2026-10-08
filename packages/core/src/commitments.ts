import type { IsoDate } from './dates';
import { addDays, addMonthsToDate, daysBetween, formatDateBR, formatDayMonth, formatMonthName } from './dates';
import { formatBRL } from './money';
import type { Commitment, CommitmentInput } from './records';
import type { ToPaySummary } from './summary';

/** Situação derivada de uma conta a pagar. Nunca é gravada (D-021, regra 4). */
export type CommitmentSituation = 'paga' | 'vencida' | 'vence_hoje' | 'a_vencer';

/** Comparação de texto ISO, sem passar por Date local. Paga nunca é vencida, mesmo paga depois do vencimento. */
export function commitmentSituation(c: Commitment, today: IsoDate): CommitmentSituation {
  if (c.status === 'quitado') return 'paga';
  if (c.dueOn < today) return 'vencida';
  if (c.dueOn === today) return 'vence_hoje';
  return 'a_vencer';
}

/** Legenda da conta a pagar: "Vence amanhã", "Vence em 3 dias · 10/10", "Venceu em 05/10/2026", "Paga em 07/10/2026". */
export function dueText(c: Commitment, today: IsoDate): string {
  switch (commitmentSituation(c, today)) {
    case 'paga':
      return c.payment ? `Paga em ${formatDateBR(c.payment.paidOn)}` : 'Paga';
    case 'vencida':
      return `Venceu em ${formatDateBR(c.dueOn)}`;
    case 'vence_hoje':
      return 'Vence hoje';
    case 'a_vencer': {
      const days = daysBetween(today, c.dueOn);
      if (days === 1) return 'Vence amanhã';
      if (days <= 7) return `Vence em ${days} dias · ${formatDayMonth(c.dueOn)}`;
      return `Vence em ${formatDateBR(c.dueOn)}`;
    }
  }
}

/** Preenchimento de "Adicionar a conta do próximo mês": mesma conta, vencimento um mês depois (dia limitado ao fim do mês). */
export function nextMonthPrefill(c: Commitment): CommitmentInput {
  return { description: c.description, amountCents: c.amountCents, dueOn: addMonthsToDate(c.dueOn, 1), category: c.category };
}

/** Conta do mês seguinte já anotada: em aberto, mesmo vencimento do preenchimento e mesma descrição (sem caixa nem espaços nas pontas). */
export function findNextMonthCommitment(list: readonly Commitment[], c: Commitment): Commitment | null {
  const { dueOn } = nextMonthPrefill(c);
  const same = (text: string) => text.trim().toLocaleLowerCase('pt-BR');
  return (
    list.find(
      (x) =>
        x.id !== c.id && x.contextId === c.contextId && x.status === 'aberto' && x.dueOn === dueOn && same(x.description) === same(c.description),
    ) ?? null
  );
}

const contas = (n: number) => (n === 1 ? '1 conta' : `${n} contas`);
const vencidas = (n: number) => `${contas(n)} ${n === 1 ? 'vencida' : 'vencidas'}`;

/** Vencimento curto do card: "hoje", "amanhã" ou "15/10". */
function shortDue(dueOn: IsoDate, today: IsoDate): string {
  if (dueOn === today) return 'hoje';
  if (dueOn === addDays(today, 1)) return 'amanhã';
  return formatDayMonth(dueOn);
}

/** Com um único item: "vence em 15/10", "vence hoje", "vence amanhã" ou "venceu em 05/10". */
function singleDue(dueOn: IsoDate, today: IsoDate): string {
  if (dueOn < today) return `venceu em ${formatDayMonth(dueOn)}`;
  const when = shortDue(dueOn, today);
  return dueOn <= addDays(today, 1) ? `vence ${when}` : `vence em ${when}`;
}

/** Textos do card "Ainda a pagar" no Resumo. */
export function toPayCaption(
  s: ToPaySummary,
  today: IsoDate,
): { main: string | null; overdue: string | null; includes: string | null } {
  const n = s.items.length;
  const first = s.items[0];
  let main: string | null;
  if (!first) main = null;
  else if (!s.isCurrentMonth) main = `${contas(n)} em aberto`;
  else if (n === 1) main = `${first.description} · ${singleDue(first.dueOn, today)}`;
  else if (s.nextDue) main = `${contas(n)} · próxima: ${s.nextDue.description}, ${shortDue(s.nextDue.dueOn, today)}`;
  else main = vencidas(n);
  return {
    main,
    overdue: s.isCurrentMonth && s.overdueCount > 0 && s.overdueCount < n ? vencidas(s.overdueCount) : null,
    includes:
      s.overdueBeforeCents > 0 ? `Inclui ${formatBRL(s.overdueBeforeCents)} de contas vencidas antes de ${formatMonthName(s.month)}.` : null,
  };
}
