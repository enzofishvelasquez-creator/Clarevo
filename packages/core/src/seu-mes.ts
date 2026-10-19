import type { BudgetRow, BudgetSummary } from './budget';
import { BUDGET_TEXT } from './budget';
import { toPayCaption } from './commitments';
import { nextBusinessDayDueText, dueKindOf } from './dia-util';
import type { IsoDate, IsoMonth } from './dates';
import { addMonths, formatDayMonth, formatMonthName, formatMonthYearBR, isValidIsoMonth, monthOf } from './dates';
import { formatTenths } from './learn/format';
import type { Cents } from './money';
import { formatBRL } from './money';
import { MONTH_CHECK_TEXT } from './month-check';
import { PAYABLES_FIRST_MONTH } from './navigation';
import type { Commitment } from './records';
import { payablesCaption } from './shortcuts';
import type { CategoryShare, MonthSummary, ToPaySummary } from './summary';

/**
 * "Seu mês em 30 segundos" (D-052, `docs/08` §5 item 12): de quatro a cinco cartões curtos, lidos em sequência, montados só com o que
 * o app já leu e com as regras que já existem: Recebido, Pago e Diferença do Resumo (`summarizeMonth`), "Por categoria" de Pago
 * (`categoryBreakdown`), "Ainda a pagar" (`summarizeToPay`, D-021(5)), o orçamento por categoria (`summarizeBudget`, D-041) e as
 * metas (D-027). Nenhuma regra nova de cálculo e nada é gravado: é uma leitura. Sem julgamento: a comparação com o mês anterior é só
 * um fato ("R$ 150,00 a mais que em setembro"), sem cor, sem nota e sem "demais".
 *
 * Os cartões, nesta ordem:
 *  1. Entrou e saiu: Recebido, Pago e Diferença do mês (que não é saldo da conta).
 *  2. Para onde foi: as 3 maiores categorias de Pago, com valor, percentual e a comparação com o mês anterior (e "Outras", se houver).
 *     Só aparece se o mês tem gastos pagos.
 *  3. O que ainda vence: Ainda a pagar e as próximas contas (até 3), com as vencidas ditas à parte.
 *  4. Orçamento: as categorias que chegaram a 80% do orçamento ou mais; pula se não há orçamento no mês.
 *  5. Metas: o guardado no mês e o plano das metas; pula se não há metas, e em mês que passou sem aporte nem resgate.
 */

export const SEU_MES_ROUTE = '/seu-mes';

/** Quantas categorias, contas e linhas de orçamento cada cartão mostra no máximo. */
export const SEU_MES_TOP = 3;

export type SeuMesCardId = 'entrou-saiu' | 'para-onde-foi' | 'o-que-vence' | 'orcamento' | 'metas';

export const SEU_MES_CARD_IDS: readonly SeuMesCardId[] = ['entrou-saiu', 'para-onde-foi', 'o-que-vence', 'orcamento', 'metas'];

export const SEU_MES_TEXT = {
  /** Título da tela, da linha em Movimentos e do guia. Não é o card "Seu mês" de Metas. */
  title: 'Seu mês em 30 segundos',
  /** Legenda da linha em Movimentos. */
  rowCaption: 'O que entrou, saiu e vence, em cartões curtos',
  rowA11y: 'Seu mês em 30 segundos. O que entrou, saiu e vence, em cartões curtos.',
  /** Legenda do índice "No app" de Aprender. */
  screenCaption: 'Poucas telas curtas com o que entrou, saiu, vence e foi guardado no mês',
  /** Nome acessível do grupo de botões de passo. */
  stepsLabel: 'Cartões do mês',
  previous: 'Anterior',
  next: 'Próximo',
  finish: 'Concluir',
  /** "1 de 5". */
  progress: (index: number, total: number): string => `${index} de ${total}`,
  /** Anúncio ao trocar de cartão: "Cartão 2 de 5. Para onde foi." */
  announce: (index: number, total: number, title: string): string => `Cartão ${index} de ${total}. ${title}.`,
  monthGroup: 'Mês do resumo',
  loading: 'Carregando o seu mês',
  loadError: 'Não foi possível carregar o seu mês.',
  retry: 'Tentar novamente',
  cards: {
    enteredAndLeft: 'Entrou e saiu',
    whereItWent: 'Para onde foi',
    stillDue: 'O que ainda vence',
    budget: 'Orçamento',
    goals: 'Metas',
    /** Mês que já passou: o que ficou em aberto. */
    leftOpen: (month: IsoMonth, ref: IsoMonth): string => `O que ficou em aberto em ${monthPhrase(month, ref)}`,
  },
  entered: {
    received: 'Recebido',
    paid: 'Pago',
    difference: 'Diferença do mês',
    /** "Recebido menos Pago · até 07/10" (no mês atual). */
    differenceDetail: (until: IsoDate | null): string => `Recebido menos Pago${until ? ` · até ${formatDayMonth(until)}` : ''}`,
    notBalance: 'A diferença do mês não é saldo da conta: é o que entrou menos o que foi pago.',
    action: 'Ver os registros do mês',
    /** Pago passou do recebido: o mesmo fato que o Resumo diz. */
    paidAbove: 'Pagamentos acima dos recebimentos no período',
    nothingYet: (month: IsoMonth): string => `Nada anotado em ${formatMonthName(month)} ainda.`,
    nothingNoted: (month: IsoMonth): string => `Nada anotado em ${formatMonthName(month)}.`,
  },
  where: {
    intro: 'As maiores categorias do que foi pago no mês.',
    /** "35,9% do pago" */
    share: (percentText: string): string => `${percentText} do pago`,
    /** "R$ 150,00 a mais que em setembro", "R$ 80,00 a menos que em setembro", "Igual a setembro". */
    more: (cents: Cents, prev: string): string => `${formatBRL(cents)} a mais que em ${prev}`,
    less: (cents: Cents, prev: string): string => `${formatBRL(cents)} a menos que em ${prev}`,
    same: (prev: string): string => `Igual a ${prev}`,
    /** A categoria não teve pagamentos no mês anterior. */
    none: (prev: string): string => `Nada pago nesta categoria em ${prev}`,
    others: (n: number): string => (n === 1 ? '1 outra categoria' : `${n} outras categorias`),
    note: 'Mostra o que foi pago. Compra no cartão entra quando a fatura é paga.',
    action: 'Ver Pago por categoria',
  },
  due: {
    stillToPay: 'Ainda a pagar',
    leftOpen: 'Em aberto',
    /** "1 conta vencida", "2 contas vencidas". */
    overdue: (n: number): string => (n === 1 ? '1 conta vencida' : `${n} contas vencidas`),
    /** "Vence 15/10" */
    dueOn: (dueOn: IsoDate): string => `Vence ${formatDayMonth(dueOn)}`,
    estimated: 'estimado',
    /** "Mais 2 contas em aberto no mês." */
    more: (n: number): string => (n === 1 ? 'Mais 1 conta em aberto no mês.' : `Mais ${n} contas em aberto no mês.`),
    note: 'Valores previstos, separados do que já foi pago.',
    action: 'Ver contas a pagar',
  },
  budget: {
    intro: 'Categorias que chegaram a 80% do orçamento ou mais.',
    none: 'Nenhuma categoria chegou a 80% do orçamento.',
    /** "Mais 2 categorias a 80% do orçamento ou mais." */
    more: (n: number): string => (n === 1 ? 'Mais 1 categoria a 80% do orçamento ou mais.' : `Mais ${n} categorias a 80% do orçamento ou mais.`),
    /** "de R$ 300,00 orçados · 133,3%" (o usado é o valor da linha). */
    ofBudget: (budgetCents: Cents, percentText: string): string => `${BUDGET_TEXT.budgeted(budgetCents)} · ${percentText}`,
    note: 'O orçamento conta o usado no mês, com as parcelas do cartão a partir do mês da compra.',
    action: 'Ver orçamento por categoria',
  },
  goals: {
    saved: (month: IsoMonth, ref: IsoMonth): string => `Guardado em ${monthPhrase(month, ref)}`,
    withdrawn: (month: IsoMonth, ref: IsoMonth): string => `Resgatado em ${monthPhrase(month, ref)}`,
    plan: 'Plano das metas',
    /** "R$ 980,00 por mês" */
    perMonth: (cents: Cents): string => `${formatBRL(cents)} por mês`,
    note: 'Aportes e resgates das metas não entram em Recebido nem em Pago.',
    action: 'Ver metas',
  },
  empty: {
    titleCurrent: (month: IsoMonth): string => `Nada anotado em ${formatMonthName(month)} ainda`,
    titlePast: (month: IsoMonth): string => `Nada anotado em ${formatMonthName(month)}`,
    bodyCurrent: 'Anote um gasto ou um recebimento e volte aqui para ver o mês em poucos passos.',
    bodyPast: 'Mês sem anotação não quer dizer mês sem gastos: aqui aparece só o que está registrado no Clarevo.',
    action: 'Anotar gasto',
  },
} as const;

/** "setembro" no mesmo ano do mês de referência; "dezembro de 2025" em outro ano. */
function monthPhrase(month: IsoMonth, ref: IsoMonth): string {
  return month.slice(0, 4) === ref.slice(0, 4) ? formatMonthName(month) : formatMonthYearBR(month);
}

// ---------------------------------------------------------------------------------------------------------------------
// Mês da tela: do mês mais antigo ao mês de hoje (não há resumo de um mês que ainda não começou)
// ---------------------------------------------------------------------------------------------------------------------

export function isSeuMesMonth(month: unknown, currentMonth: IsoMonth): month is IsoMonth {
  return typeof month === 'string' && isValidIsoMonth(month) && month >= PAYABLES_FIRST_MONTH && month <= currentMonth;
}

/** Mês com que a tela abre: o do endereço (`?mes=AAAA-MM`) se estiver entre o mais antigo e o mês de hoje; senão, o mês de hoje. */
export function seuMesStartMonth(param: string | string[] | undefined, currentMonth: IsoMonth): IsoMonth {
  const value = Array.isArray(param) ? param[0] : param;
  return isSeuMesMonth(value, currentMonth) ? value : currentMonth;
}

/** Mês vizinho no seletor da tela, ou null no limite (o botão fica desativado). */
export function seuMesStep(month: IsoMonth, currentMonth: IsoMonth, delta: 1 | -1): IsoMonth | null {
  const next = addMonths(month, delta);
  return isSeuMesMonth(next, currentMonth) ? next : null;
}

/** `?mes=` só quando o mês não é o de hoje (o padrão da tela). */
export function seuMesParams(month: IsoMonth, currentMonth: IsoMonth): { mes?: IsoMonth } {
  return month === currentMonth ? {} : { mes: month };
}

// ---------------------------------------------------------------------------------------------------------------------
// Os cartões
// ---------------------------------------------------------------------------------------------------------------------

/** Uma linha de um cartão: nome, valor (com o "R$" já escrito) e linhas de detalhe. */
export interface SeuMesRow {
  label: string;
  /** "R$ 6.000,00", "R$ 400,00 de R$ 300,00" ou null. */
  value: string | null;
  details: string[];
  /** Linha em destaque (o total do cartão). */
  strong?: boolean;
}

export interface SeuMesAction {
  label: string;
  /** Endereço do app, com os parâmetros. */
  href: string;
  /** A tela aberta mostra o mês em exibição do app (Composição): o app o ajusta para o mês do cartão antes de abrir. */
  setsMonth?: boolean;
}

export interface SeuMesCard {
  id: SeuMesCardId;
  title: string;
  /** Uma frase sob o título (opcional). */
  intro: string | null;
  rows: SeuMesRow[];
  /** Frases de apoio sob as linhas (o que a conta é e o que não é). */
  notes: string[];
  action: SeuMesAction | null;
}

export interface SeuMesEmpty {
  title: string;
  body: string;
  action: SeuMesAction;
}

export interface SeuMesView {
  month: IsoMonth;
  /** De 2 a 5 cartões; vazio quando `empty` está preenchido. */
  cards: SeuMesCard[];
  /** Mês sem nada anotado nem a pagar. */
  empty: SeuMesEmpty | null;
}

export interface SeuMesInput {
  /** Mês mostrado (de hoje para trás). */
  month: IsoMonth;
  today: IsoDate;
  summary: Pick<MonthSummary, 'receivedCents' | 'paidCents' | 'differenceCents' | 'recordCount'>;
  /** `categoryBreakdown` de Pago do mês (já com os pagamentos de fatura divididos pelas categorias da fatura). */
  breakdown: readonly CategoryShare[];
  /** `categoryBreakdown` do mês anterior; null enquanto não lido. Vazio: o mês anterior não tem pagamentos, e não há comparação. */
  previousBreakdown: readonly CategoryShare[] | null;
  /** `summarizeToPay` do mês. */
  toPay: ToPaySummary;
  /** `summarizeBudget` do mês; null se não lido. Sem categoria com orçamento, o cartão não aparece. */
  budget: BudgetSummary | null;
  /** Metas do contexto: quantas, o guardado no mês (aportes menos resgates) e o plano por mês das metas ativas. null: não lido. */
  goals: { count: number; savedInMonthCents: Cents; plannedCents: Cents } | null;
  /**
   * "Conferi este mês" (D-060): a marca de pagamentos do mês vale (`paidChecked` de months_overview). Num mês que passou e está vazio, a
   * frase "Mês sem anotação não quer dizer mês sem gastos" dá lugar a "Você conferiu: não houve pagamentos em {mês}." Ausente: não conferido.
   */
  paidChecked?: boolean;
}

/** "Recebido R$ 6.000,00" e companhia, para o leitor de tela: "{nome}, {valor}. {detalhe}. {detalhe}." */
export function seuMesRowA11y(row: SeuMesRow): string {
  const head = row.value ? `${row.label}, ${row.value}` : row.label;
  return [head, ...row.details].map((part) => (/[.!?]$/.test(part) ? part : `${part}.`)).join(' ');
}

/** Href de uma tela que abre num mês: com `?mes=` só quando não é o de hoje. */
function withMonth(path: string, month: IsoMonth, currentMonth: IsoMonth): string {
  return month === currentMonth ? path : `${path}?mes=${month}`;
}

function enteredAndLeft(input: SeuMesInput, current: IsoMonth): SeuMesCard {
  const { summary, month, today } = input;
  const isCurrent = month === current;
  const notes: string[] = [SEU_MES_TEXT.entered.notBalance];
  if (summary.recordCount === 0) notes.push(isCurrent ? SEU_MES_TEXT.entered.nothingYet(month) : SEU_MES_TEXT.entered.nothingNoted(month));
  const details = [SEU_MES_TEXT.entered.differenceDetail(isCurrent ? today : null)];
  if (summary.differenceCents < 0) details.push(SEU_MES_TEXT.entered.paidAbove);
  return {
    id: 'entrou-saiu',
    title: SEU_MES_TEXT.cards.enteredAndLeft,
    intro: null,
    rows: [
      { label: SEU_MES_TEXT.entered.received, value: formatBRL(summary.receivedCents), details: [] },
      { label: SEU_MES_TEXT.entered.paid, value: formatBRL(summary.paidCents), details: [] },
      { label: SEU_MES_TEXT.entered.difference, value: formatBRL(summary.differenceCents), details, strong: true },
    ],
    notes,
    action: { label: SEU_MES_TEXT.entered.action, href: '/composicao?tipo=diferenca', setsMonth: true },
  };
}

/** A comparação de uma categoria com o mês anterior, só como fato; null sem mês anterior para comparar. */
function compareWithPrevious(share: CategoryShare, previous: readonly CategoryShare[] | null, prevName: string): string | null {
  if (!previous || previous.length === 0) return null;
  const before = previous.find((p) => p.label === share.label);
  if (!before) return SEU_MES_TEXT.where.none(prevName);
  const diff = share.cents - before.cents;
  if (diff > 0) return SEU_MES_TEXT.where.more(diff, prevName);
  if (diff < 0) return SEU_MES_TEXT.where.less(-diff, prevName);
  return SEU_MES_TEXT.where.same(prevName);
}

function whereItWent(input: SeuMesInput): SeuMesCard | null {
  if (input.breakdown.length === 0) return null;
  // "As maiores": por valor, sem deixar "Sem categoria" por último como na composição.
  const sorted = [...input.breakdown].sort((a, b) => b.cents - a.cents || a.label.localeCompare(b.label, 'pt-BR'));
  const top = sorted.slice(0, SEU_MES_TOP);
  const rest = sorted.slice(SEU_MES_TOP);
  const prevName = monthPhrase(addMonths(input.month, -1), input.month);
  const rows: SeuMesRow[] = top.map((share) => {
    const compare = compareWithPrevious(share, input.previousBreakdown, prevName);
    return { label: share.label, value: formatBRL(share.cents), details: [SEU_MES_TEXT.where.share(share.percentText), ...(compare ? [compare] : [])] };
  });
  if (rest.length > 0) {
    const cents = rest.reduce((acc, r) => acc + r.cents, 0);
    const tenths = rest.reduce((acc, r) => acc + r.tenths, 0);
    rows.push({ label: SEU_MES_TEXT.where.others(rest.length), value: formatBRL(cents), details: [SEU_MES_TEXT.where.share(formatTenths(tenths))] });
  }
  return {
    id: 'para-onde-foi',
    title: SEU_MES_TEXT.cards.whereItWent,
    intro: SEU_MES_TEXT.where.intro,
    rows,
    notes: [SEU_MES_TEXT.where.note],
    action: { label: SEU_MES_TEXT.where.action, href: '/composicao?tipo=pago&vista=categoria', setsMonth: true },
  };
}

function dueRow(c: Commitment, today: IsoDate): SeuMesRow {
  const money = formatBRL(c.amountCents);
  // D-061: em dia que não é útil, "Vence terça, 13/10 (próximo dia útil)"; a data cadastrada e a ordem seguem como estavam.
  const due = nextBusinessDayDueText(c.dueOn, dueKindOf(c), today) ?? SEU_MES_TEXT.due.dueOn(c.dueOn);
  return {
    label: c.description,
    value: c.amountIsEstimate ? `≈ ${money}` : money,
    details: [c.amountIsEstimate ? `${due} · ${SEU_MES_TEXT.due.estimated}` : due],
  };
}

function stillDue(input: SeuMesInput, current: IsoMonth): SeuMesCard {
  const { toPay, month, today } = input;
  const isCurrent = month === current;
  const caption = toPayCaption(toPay, today);
  const sumOf = (list: readonly Commitment[]): Cents => list.reduce((acc, c) => acc + c.amountCents, 0);
  const rows: SeuMesRow[] = [];
  if (toPay.toPayCents <= 0) {
    rows.push({
      label: isCurrent ? SEU_MES_TEXT.due.stillToPay : SEU_MES_TEXT.due.leftOpen,
      value: formatBRL(0),
      details: [payablesCaption({ openCents: 0, overdueCount: 0, month, currentMonth: current })],
      strong: true,
    });
  } else {
    rows.push({
      label: isCurrent ? SEU_MES_TEXT.due.stillToPay : SEU_MES_TEXT.due.leftOpen,
      value: formatBRL(toPay.toPayCents),
      details: [caption.includes, caption.estimated].filter((t): t is string => t !== null),
      strong: true,
    });
    // Mês atual: as vencidas à parte e as próximas a vencer; mês que passou: as que ficaram em aberto.
    const upcoming = isCurrent ? toPay.upcomingInMonth : toPay.items;
    if (isCurrent && toPay.overdueCount > 0) {
      rows.push({ label: SEU_MES_TEXT.due.overdue(toPay.overdueCount), value: formatBRL(sumOf(toPay.overdue)), details: [] });
    }
    for (const c of upcoming.slice(0, SEU_MES_TOP)) rows.push(dueRow(c, today));
  }
  const extra = Math.max(0, (isCurrent ? toPay.upcomingInMonth : toPay.items).length - SEU_MES_TOP);
  const notes: string[] = [SEU_MES_TEXT.due.note];
  if (extra > 0) notes.unshift(SEU_MES_TEXT.due.more(extra));
  return {
    id: 'o-que-vence',
    title: isCurrent ? SEU_MES_TEXT.cards.stillDue : SEU_MES_TEXT.cards.leftOpen(month, current),
    intro: null,
    rows,
    notes,
    action: { label: SEU_MES_TEXT.due.action, href: withMonth('/a-pagar', month, current) },
  };
}

function budgetRowOf(r: BudgetRow): SeuMesRow {
  return {
    label: r.category,
    value: formatBRL(r.usedCents),
    details: [SEU_MES_TEXT.budget.ofBudget(r.budgetCents, r.percentText), r.balanceLine],
  };
}

function budgetCard(input: SeuMesInput, current: IsoMonth): SeuMesCard | null {
  const budget = input.budget;
  // Sem orçamento no mês, o cartão não existe.
  if (!budget || !budget.hasAny) return null;
  const reached = budget.rows.filter((r) => r.level >= 1).sort((a, b) => b.tenths - a.tenths);
  const rows = reached.slice(0, SEU_MES_TOP).map(budgetRowOf);
  const notes: string[] = [];
  if (reached.length === 0) notes.push(SEU_MES_TEXT.budget.none);
  else if (reached.length > SEU_MES_TOP) notes.push(SEU_MES_TEXT.budget.more(reached.length - SEU_MES_TOP));
  notes.push(SEU_MES_TEXT.budget.note);
  return {
    id: 'orcamento',
    title: SEU_MES_TEXT.cards.budget,
    intro: reached.length > 0 ? SEU_MES_TEXT.budget.intro : null,
    rows,
    notes,
    action: { label: SEU_MES_TEXT.budget.action, href: withMonth('/orcamento', input.month, current) },
  };
}

function goalsCard(input: SeuMesInput, current: IsoMonth): SeuMesCard | null {
  const goals = input.goals;
  if (!goals || goals.count === 0) return null;
  const { month } = input;
  const saved = goals.savedInMonthCents;
  // Mês que passou sem aporte nem resgate: ter metas hoje não é anotação daquele mês (senão o estado vazio nunca apareceria).
  if (month < current && saved === 0) return null;
  const rows: SeuMesRow[] = [
    {
      label: saved >= 0 ? SEU_MES_TEXT.goals.saved(month, current) : SEU_MES_TEXT.goals.withdrawn(month, current),
      value: formatBRL(Math.abs(saved)),
      details: [],
      strong: true,
    },
  ];
  // O plano é o de hoje: não faz parte do histórico de um mês que passou.
  if (month === current && goals.plannedCents > 0) {
    rows.push({ label: SEU_MES_TEXT.goals.plan, value: SEU_MES_TEXT.goals.perMonth(goals.plannedCents), details: [] });
  }
  return {
    id: 'metas',
    title: SEU_MES_TEXT.cards.goals,
    intro: null,
    rows,
    notes: [SEU_MES_TEXT.goals.note],
    action: { label: SEU_MES_TEXT.goals.action, href: '/metas' },
  };
}

/**
 * Os cartões do mês. Entrou e saiu e O que ainda vence sempre existem; Para onde foi só com gastos pagos; Orçamento só com orçamento no
 * mês; Metas só com metas (num mês que passou, só com aporte ou resgate nele). Mês sem nada anotado nem a pagar (e sem orçamento nem
 * metas): nenhum cartão, só o estado vazio.
 */
export function buildSeuMes(input: SeuMesInput): SeuMesView {
  const current = monthOf(input.today);
  const optional = [budgetCard(input, current), goalsCard(input, current)].filter((c): c is SeuMesCard => c !== null);
  const nothing = input.summary.recordCount === 0 && input.toPay.items.length === 0 && optional.length === 0;
  if (nothing) {
    const isCurrent = input.month === current;
    return {
      month: input.month,
      cards: [],
      empty: {
        title: isCurrent ? SEU_MES_TEXT.empty.titleCurrent(input.month) : SEU_MES_TEXT.empty.titlePast(input.month),
        body: isCurrent
          ? SEU_MES_TEXT.empty.bodyCurrent
          : input.paidChecked === true
            ? MONTH_CHECK_TEXT.done('pagamentos', input.month)
            : SEU_MES_TEXT.empty.bodyPast,
        action: { label: SEU_MES_TEXT.empty.action, href: '/registro/novo?tipo=despesa' },
      },
    };
  }
  const where = whereItWent(input);
  const cards: SeuMesCard[] = [enteredAndLeft(input, current), ...(where ? [where] : []), stillDue(input, current), ...optional];
  return { month: input.month, cards, empty: null };
}
