import type { IsoDate } from './dates';
import { addDays, addMonths, addMonthsToDate, daysBetween, formatDateBR, formatDayMonth, formatMonthName, monthRange } from './dates';
import { dueKindOf, isCommitmentOverdue, lastOnTimeDay, nextBusinessDayWhen } from './dia-util';
import { formatBRL } from './money';
import type { Commitment, CommitmentInput } from './records';
import type { ToPaySummary } from './summary';

/**
 * Situação derivada de uma conta a pagar. Nunca é gravada (D-021, regra 4). `paga_em_parte` (CL-07) é só da conta de uma fatura de
 * cartão paga por menos que o total: o resto foi para a fatura seguinte (D-037(6)), e a tela da fatura diz "Paga em parte".
 */
export type CommitmentSituation = 'paga' | 'paga_em_parte' | 'vencida' | 'vence_hoje' | 'a_vencer';

/** Conta de fatura de cartão paga por menos que o total da fatura: o que sobrou vira "Saldo anterior" na fatura seguinte. */
export function isPartialInvoicePayment(c: Pick<Commitment, 'invoice' | 'status' | 'payment' | 'amountCents'>): boolean {
  return c.invoice !== null && c.status === 'quitado' && c.payment !== null && c.payment.amountCents < c.amountCents;
}

/**
 * Comparação de texto ISO, sem passar por Date local. Paga nunca é vencida, mesmo paga depois do vencimento. A conta de uma fatura
 * paga em parte é "paga em parte", igual à tela da fatura.
 *
 * "Vencida" é a de D-061 (`effectiveOverdue`): com vencimento em sábado, domingo ou feriado nacional, só depois que o próximo dia útil
 * termina (conta do ano: a partir do dia seguinte à data cadastrada). Até lá a conta é "a vencer", ou "vence hoje" no último dia sem
 * atraso, que nessa tolerância é o próximo dia útil.
 */
export function commitmentSituation(c: Commitment, today: IsoDate): CommitmentSituation {
  if (c.status === 'quitado') return isPartialInvoicePayment(c) ? 'paga_em_parte' : 'paga';
  const last = lastOnTimeDay(c.dueOn, dueKindOf(c));
  if (last < today) return 'vencida';
  if (last === today) return 'vence_hoje';
  return 'a_vencer';
}

/** "Vence terça, 13/10 (próximo dia útil)" quando a tolerância de D-061 vale para a conta; senão null. */
function nextBusinessDayDueLabel(c: Pick<Commitment, 'dueOn' | 'invoice' | 'series'>, today: IsoDate): string | null {
  const w = nextBusinessDayWhen(c.dueOn, dueKindOf(c), today);
  return w === null ? null : `Vence ${w.when}`;
}

/** Mês por extenso no texto: "dezembro" e, em outro ano que o de hoje, "janeiro de 2027" (como invoiceMonthLabel, em cards.ts). */
function monthLabelFor(month: string, today: IsoDate): string {
  const name = formatMonthName(month);
  return month.slice(0, 4) === today.slice(0, 4) ? name : `${name} de ${month.slice(0, 4)}`;
}

/**
 * Legenda da conta a pagar: "Vence amanhã", "Vence em 3 dias · 10/10", "Venceu em 05/10/2026", "Paga em 07/10/2026" e, na conta de
 * uma fatura paga em parte, "Paga em parte em 08/11/2026 · R$ 230,00 foram para a fatura de dezembro". Com vencimento em dia que não
 * é útil (D-061): "Vence terça, 13/10 (próximo dia útil)" ou "Vence hoje (próximo dia útil)"; a data cadastrada segue no detalhe.
 */
export function dueText(c: Commitment, today: IsoDate): string {
  switch (commitmentSituation(c, today)) {
    case 'paga':
      return c.payment ? `Paga em ${formatDateBR(c.payment.paidOn)}` : 'Paga';
    case 'paga_em_parte': {
      const paid = c.payment!;
      const next = addMonths(c.invoice!.month, 1);
      return `Paga em parte em ${formatDateBR(paid.paidOn)} · ${formatBRL(c.amountCents - paid.amountCents)} foram para a fatura de ${monthLabelFor(next, today)}`;
    }
    case 'vencida':
      return `Venceu em ${formatDateBR(c.dueOn)}`;
    case 'vence_hoje':
      return nextBusinessDayDueLabel(c, today) ?? 'Vence hoje';
    case 'a_vencer': {
      const grace = nextBusinessDayDueLabel(c, today);
      if (grace) return grace;
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

/**
 * Conta do mês seguinte já anotada, em aberto ou paga: mesmo vencimento do preenchimento e mesma descrição
 * (sem caixa nem espaços nas pontas). A lista vem do repositório, que não devolve excluídas; para achar
 * também a paga, o app consulta o mês de nextMonthPrefill(c).dueOn.
 */
export function findNextMonthCommitment(list: readonly Commitment[], c: Commitment): Commitment | null {
  const { dueOn } = nextMonthPrefill(c);
  const same = (text: string) => text.trim().toLocaleLowerCase('pt-BR');
  return (
    list.find((x) => x.id !== c.id && x.contextId === c.contextId && x.dueOn === dueOn && same(x.description) === same(c.description)) ?? null
  );
}

const contas = (n: number) => (n === 1 ? '1 conta' : `${n} contas`);
const vencidas = (n: number) => `${contas(n)} ${n === 1 ? 'vencida' : 'vencidas'}`;

/**
 * Vencimento curto do card: "hoje", "amanhã" ou "15/10". Com vencimento em dia que não é útil (D-061), o próximo dia útil:
 * "terça, 13/10 (próximo dia útil)" ou "hoje (próximo dia útil)".
 */
function shortDue(c: Pick<Commitment, 'dueOn' | 'invoice' | 'series'>, today: IsoDate): string {
  const grace = nextBusinessDayWhen(c.dueOn, dueKindOf(c), today);
  if (grace) return grace.when;
  if (c.dueOn === today) return 'hoje';
  if (c.dueOn === addDays(today, 1)) return 'amanhã';
  return formatDayMonth(c.dueOn);
}

/** Com um único item: "vence em 15/10", "vence hoje", "vence amanhã", "vence terça, 13/10 (próximo dia útil)" ou "venceu em 05/10". */
function singleDue(c: Pick<Commitment, 'dueOn' | 'invoice' | 'series'>, today: IsoDate): string {
  if (isCommitmentOverdue(c, today)) return `venceu em ${formatDayMonth(c.dueOn)}`;
  const when = shortDue(c, today);
  return when === 'hoje' || when === 'amanhã' || nextBusinessDayWhen(c.dueOn, dueKindOf(c), today) ? `vence ${when}` : `vence em ${when}`;
}

/**
 * "vencidas" ou "com vencimento": as contas em aberto de antes do mês continuam num total à parte pela data cadastrada (o banco
 * calcula o mesmo número), mas só se chamam "vencidas" quando todas já venceram de verdade (D-061). Nos primeiros dias do mês, uma
 * conta de dia que não é útil no fim do mês anterior ainda está no próximo dia útil: o texto diz "com vencimento antes de".
 */
function overdueBeforeWord(s: Pick<ToPaySummary, 'items' | 'month'>, today: IsoDate): 'vencidas' | 'com vencimento' {
  const { start } = monthRange(s.month);
  return s.items.filter((c) => c.dueOn < start).every((c) => isCommitmentOverdue(c, today)) ? 'vencidas' : 'com vencimento';
}

/** Textos do card "Ainda a pagar" no Resumo. */
export function toPayCaption(
  s: ToPaySummary,
  today: IsoDate,
): { main: string | null; overdue: string | null; includes: string | null; estimated: string | null } {
  const n = s.items.length;
  const first = s.items[0];
  let main: string | null;
  if (!first) main = null;
  else if (!s.isCurrentMonth) main = `${contas(n)} em aberto`;
  else if (n === 1) main = `${first.description} · ${singleDue(first, today)}`;
  else if (s.nextDue) main = `${contas(n)} · próxima: ${s.nextDue.description}, ${shortDue(s.nextDue, today)}`;
  else main = vencidas(n);
  return {
    main,
    overdue: s.isCurrentMonth && s.overdueCount > 0 && s.overdueCount < n ? vencidas(s.overdueCount) : null,
    includes: s.overdueBeforeCents > 0 ? `Inclui ${formatBRL(s.overdueBeforeCents)} de contas ${overdueBeforeWord(s, today)} antes de ${formatMonthName(s.month)}.` : null,
    estimated: s.estimatedCents > 0 ? `Inclui ${formatBRL(s.estimatedCents)} em valores estimados.` : null,
  };
}

/**
 * "Já paguei" na lista de Contas a pagar (spec4 §1.2): pagamento hoje, com o valor previsto, de uma conta em aberto
 * que vence hoje ou depois e tem valor fixo. Estimada, paga ou vencida: null (estimada usa "Informar valor e pagar";
 * vencidas seguem pela revisão de vencidas). A gravação continua sendo pay_commitment.
 */
export function quickPayDraft(
  c: Commitment,
  today: IsoDate,
): { amountCents: number; paidOn: IsoDate; category: string | null } | null {
  // Fatura de cartão: paga pela fatura (pay_invoice), nunca por "Já paguei" (pay_commitment recusa com conta_de_fatura).
  if (c.invoice || c.status !== 'aberto' || c.amountIsEstimate || isCommitmentOverdue(c, today)) return null;
  return { amountCents: c.amountCents, paidOn: today, category: c.category };
}

/**
 * Botão da linha: 'pagar' ("Já paguei", diálogo de confirmação), 'informar' ("Informar valor e pagar", abre o
 * formulário de pagamento) ou null (paga ou vencida).
 */
export function quickPayAction(c: Commitment, today: IsoDate): 'pagar' | 'informar' | null {
  if (c.invoice || c.status !== 'aberto' || isCommitmentOverdue(c, today)) return null;
  return c.amountIsEstimate ? 'informar' : 'pagar';
}

/** Vencimento curto do nome acessível: "vence hoje" ou "vence 12/10". */
const dueShort = (dueOn: IsoDate, today: IsoDate) => (dueOn === today ? 'vence hoje' : `vence ${formatDayMonth(dueOn)}`);

/** Textos de "Já paguei" na lista (diálogo e nomes acessíveis). `name` é o nome mostrado na linha. */
export const QUICK_PAY_TEXT = {
  button: 'Já paguei',
  estimateButton: 'Informar valor e pagar',
  /** "Marcar Luz como paga hoje?" */
  title: (name: string) => `Marcar ${name} como paga hoje?`,
  /** "R$ 180,00 em 08/10/2026" */
  line: (amountCents: number, paidOn: IsoDate) => `${formatBRL(amountCents)} em ${formatDateBR(paidOn)}`,
  confirm: 'Confirmar pagamento',
  change: 'Mudar valor ou data',
  cancel: 'Cancelar',
  /** "Já paguei Luz, vence 12/10" */
  a11y: (name: string, dueOn: IsoDate, today: IsoDate) => `Já paguei ${name}, ${dueShort(dueOn, today)}`,
  /** "Informar valor e pagar Luz, vence 12/10" */
  estimateA11y: (name: string, dueOn: IsoDate, today: IsoDate) => `Informar valor e pagar ${name}, ${dueShort(dueOn, today)}`,
  /** Faixa depois da confirmação do servidor. */
  done: (name: string) => `${name} marcada como paga.`,
} as const;
