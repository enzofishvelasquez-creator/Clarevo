import type { IsoDate, IsoMonth } from './dates';
import { addDays, formatDayMonth, formatMonthName, monthOf } from './dates';
import { formatBRL } from './money';
import type { Commitment } from './records';
import type { ToPaySummary } from './summary';
import { DEMO_TEXT } from './demo-badge';

/**
 * Núcleo do widget da tela inicial (D-052): a função pura que monta o conteúdo dos dois tamanhos a partir do que o app já leu, com
 * as mesmas regras do Resumo e de Contas a pagar (`summarizeToPay`, D-021(5)). O widget nativo (iOS e Android) fica para a preparação
 * das lojas e só vai ler o resultado pronto (`WidgetSnapshot`); nenhuma regra financeira existe do lado nativo. Nada aqui grava,
 * lê a rede ou guarda o que a pessoa vê.
 *
 * - Pequeno: o rótulo "Anotar gasto" e a rota que o app abre.
 * - Médio: "Ainda a pagar em {mês}" com o valor, a próxima conta a vencer (nome, data, valor ou "estimado") e quantas já venceram.
 * - Valores ocultos por padrão: só a preferência própria "Mostrar valores no widget" (desligada de início, neste aparelho) os mostra.
 *   Com os valores ocultos, o conteúdo montado nem chega a ter o número: o `WidgetSnapshot` guardado no aparelho para o widget ler
 *   traz "R$ ••••" e "valor oculto", nunca o valor em reais. O nome da conta a vencer aparece em qualquer caso.
 * - Estados: normal, vazio ("Nada em aberto neste mês"), sem sessão ("Entre no Clarevo para ver") e sem dados (ainda não lidos).
 *   Sem sessão, o conteúdo ignora tudo o que vier da leitura: nenhuma conta, nenhum valor.
 * - Demonstração: o mesmo conteúdo, com o selo "Demonstração" (os dados são fictícios).
 */

/** O interruptor "Mostrar valores no widget" começa desligado. */
export const DEFAULT_WIDGET_SHOW_VALUES = false;

/** Versão do formato guardado para o widget ler; muda se um campo mudar de sentido ou for acrescentado (2: `builtOn`). */
export const WIDGET_SNAPSHOT_VERSION = 2;

/** O que o widget mostra no lugar de um valor oculto (o mesmo de "Ocultar valores" no app). */
export const WIDGET_HIDDEN_MONEY = 'R$ ••••';
/** O que o leitor de tela diz no lugar de um valor oculto. */
export const WIDGET_HIDDEN_A11Y = 'valor oculto';

/** Rotas que o widget abre (as mesmas do app). */
export const WIDGET_ROUTES = {
  note: '/registro/novo?tipo=despesa',
  payables: '/a-pagar',
  signIn: '/entrar',
} as const;

export const WIDGET_TEXT = {
  /** Conta › "Widget na tela inicial". */
  section: 'Widget na tela inicial',
  availability: 'Disponível quando o app estiver nas lojas',
  explain: 'Mostra quanto ainda falta pagar no mês e a próxima conta a vencer, com um atalho para anotar um gasto.',
  showValues: 'Mostrar valores no widget',
  showValuesCaption: 'Desligado, o widget mostra R$ •••• no lugar dos valores. Vale só para este aparelho.',
  /** Widget pequeno. */
  small: {
    label: 'Anotar gasto',
    a11y: 'Anotar gasto. Abre o Clarevo no formulário de gasto.',
    a11ySignedOut: 'Anotar gasto. Abre o Clarevo para você entrar.',
  },
  /** Widget médio. */
  medium: {
    title: (month: IsoMonth): string => `Ainda a pagar em ${formatMonthName(month)}`,
    empty: 'Nada em aberto neste mês',
    signedOut: 'Entre no Clarevo para ver',
    noData: 'Abra o Clarevo para atualizar',
    /** "1 vencida", "2 vencidas". */
    overdue: (n: number): string => (n === 1 ? '1 vencida' : `${n} vencidas`),
    estimated: 'estimado',
    badge: DEMO_TEXT.badge,
  },
} as const;

export type WidgetState = 'normal' | 'vazio' | 'sem_sessao' | 'sem_dados';

export interface WidgetInput {
  /** Hoje, no fuso da pessoa. */
  today: IsoDate;
  /** Há uma pessoa com sessão? Sem sessão, nada da leitura entra no conteúdo. */
  signedIn: boolean;
  /** Conta de demonstração (dados fictícios). */
  demo: boolean;
  /** Preferência "Mostrar valores no widget" (padrão: desligada). */
  showValues: boolean;
  /** `summarizeToPay` do mês de hoje (o contexto Pessoal), ou null enquanto não foi lido. */
  toPay: ToPaySummary | null;
}

/** Widget pequeno: o atalho para anotar um gasto. */
export interface WidgetSmall {
  size: 'pequeno';
  label: string;
  /** Rota que o app abre ao tocar. */
  route: string;
  a11y: string;
  /** "Demonstração" na conta de demonstração, ou null. */
  badge: string | null;
}

/** A próxima conta a vencer (vence hoje ou depois). */
export interface WidgetNext {
  name: string;
  /** "hoje", "amanhã" ou "15/10". */
  when: string;
  /** "R$ 150,00", "≈ R$ 180,00" (valor estimado) ou "R$ ••••" com os valores ocultos. */
  amount: string;
  estimated: boolean;
  /** "Internet · 15/10 · R$ 150,00" (e " · estimado" quando o valor é estimado). */
  line: string;
}

/** Widget médio: quanto ainda falta pagar no mês e a próxima conta. */
export interface WidgetMedium {
  size: 'medio';
  state: WidgetState;
  /** Rota que o app abre ao tocar. */
  route: string;
  /** "Ainda a pagar em outubro" (estados normal e vazio). */
  title: string | null;
  /** "R$ 650,00" ou "R$ ••••" (só no estado normal). */
  value: string | null;
  /** O texto de um estado sem valor: vazio, sem sessão ou sem dados. */
  message: string | null;
  next: WidgetNext | null;
  /** "1 vencida" ou "2 vencidas"; null sem vencidas. */
  overdue: string | null;
  /** Os valores aparecem (preferência ligada) ou estão ocultos. */
  valuesShown: boolean;
  badge: string | null;
  /** Texto alternativo: o que o leitor de tela diz do widget inteiro. */
  a11y: string;
}

export interface WidgetContent {
  small: WidgetSmall;
  medium: WidgetMedium;
}

/** O que o app guarda no aparelho para o widget nativo ler: o conteúdo pronto, sem regra nenhuma do lado do widget. */
export interface WidgetSnapshot extends WidgetContent {
  version: typeof WIDGET_SNAPSHOT_VERSION;
  /** Mês de "Ainda a pagar" (o de hoje). */
  month: IsoMonth;
  /**
   * Dia em que o app montou o conteúdo (AAAA-MM-DD, o `today` da entrada). O texto guardado tem datas relativas ("hoje", "amanhã") e
   * vencidas contadas até esse dia: em outro dia ele já não vale, e o widget nativo mostra o estado sem dados (`isWidgetSnapshotFresh`).
   */
  builtOn: IsoDate;
}

const whenOf = (dueOn: IsoDate, today: IsoDate): string => (dueOn === today ? 'hoje' : dueOn === addDays(today, 1) ? 'amanhã' : formatDayMonth(dueOn));

/** "vence hoje", "vence amanhã" ou "vence em 15/10". */
const dueSpoken = (when: string): string => (when === 'hoje' || when === 'amanhã' ? `vence ${when}` : `vence em ${when}`);

function nextOf(c: Commitment, today: IsoDate, showValues: boolean): WidgetNext {
  const estimated = c.amountIsEstimate;
  const money = showValues ? formatBRL(c.amountCents) : WIDGET_HIDDEN_MONEY;
  const amount = estimated ? `≈ ${money}` : money;
  const when = whenOf(c.dueOn, today);
  return {
    name: c.description,
    when,
    amount,
    estimated,
    line: `${c.description} · ${when} · ${amount}${estimated ? ` · ${WIDGET_TEXT.medium.estimated}` : ''}`,
  };
}

function nextSpoken(next: WidgetNext, c: Commitment, showValues: boolean): string {
  const money = showValues ? formatBRL(c.amountCents) : WIDGET_HIDDEN_A11Y;
  const value = next.estimated ? `cerca de ${money}, valor estimado` : money;
  return `Próxima conta: ${next.name}, ${dueSpoken(next.when)}, ${value}.`;
}

/**
 * O conteúdo dos dois widgets. Mesmas regras do Resumo: "Ainda a pagar" é o estoque em aberto do mês de hoje, com as vencidas dos
 * meses anteriores, e a próxima conta é a primeira em aberto que vence hoje ou depois (`ToPaySummary.nextDue`).
 */
export function buildWidgetContent(input: WidgetInput): WidgetContent {
  const { today, signedIn, demo } = input;
  const badge = demo ? WIDGET_TEXT.medium.badge : null;
  const demoPrefix = demo ? `${DEMO_TEXT.badge}. ` : '';
  const small: WidgetSmall = {
    size: 'pequeno',
    label: WIDGET_TEXT.small.label,
    route: signedIn ? WIDGET_ROUTES.note : WIDGET_ROUTES.signIn,
    a11y: `${demoPrefix}${signedIn ? WIDGET_TEXT.small.a11y : WIDGET_TEXT.small.a11ySignedOut}`,
    badge,
  };
  const base = { size: 'medio' as const, title: null, value: null, message: null, next: null, overdue: null, valuesShown: false, badge };

  // Sem sessão: nada da leitura entra, mesmo que ela venha preenchida.
  if (!signedIn) {
    const message = WIDGET_TEXT.medium.signedOut;
    return { small, medium: { ...base, state: 'sem_sessao', route: WIDGET_ROUTES.signIn, message, a11y: `${demoPrefix}${message}.` } };
  }

  const toPay = input.toPay;
  // Só vale o resumo do mês de hoje; qualquer outra coisa é "ainda não lido".
  if (!toPay || !toPay.isCurrentMonth || toPay.month !== monthOf(today)) {
    const message = WIDGET_TEXT.medium.noData;
    return { small, medium: { ...base, state: 'sem_dados', route: WIDGET_ROUTES.payables, message, a11y: `${demoPrefix}${message}.` } };
  }

  const showValues = input.showValues;
  const title = WIDGET_TEXT.medium.title(toPay.month);
  if (toPay.items.length === 0) {
    const message = WIDGET_TEXT.medium.empty;
    return { small, medium: { ...base, state: 'vazio', route: WIDGET_ROUTES.payables, title, message, valuesShown: showValues, a11y: `${demoPrefix}${title}. ${message}.` } };
  }

  const value = showValues ? formatBRL(toPay.toPayCents) : WIDGET_HIDDEN_MONEY;
  const nextCommitment = toPay.nextDue;
  const next = nextCommitment ? nextOf(nextCommitment, today, showValues) : null;
  const overdue = toPay.overdueCount > 0 ? WIDGET_TEXT.medium.overdue(toPay.overdueCount) : null;
  const spokenValue = showValues ? value : WIDGET_HIDDEN_A11Y;
  const a11y = [
    `${demoPrefix}${title}, ${spokenValue}.`,
    next && nextCommitment ? nextSpoken(next, nextCommitment, showValues) : null,
    overdue ? `${overdue}.` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' ');
  return {
    small,
    medium: { ...base, state: 'normal', route: WIDGET_ROUTES.payables, title, value, next, overdue, valuesShown: showValues, a11y },
  };
}

/** O formato guardado para o widget nativo ler. `JSON.stringify` do resultado é o que vai para o armazenamento compartilhado. */
export function buildWidgetSnapshot(input: WidgetInput): WidgetSnapshot {
  return { version: WIDGET_SNAPSHOT_VERSION, month: monthOf(input.today), builtOn: input.today, ...buildWidgetContent(input) };
}

/**
 * O que o widget guardado ainda vale hoje? Só no mesmo dia em que foi montado (`builtOn`): no dia seguinte "hoje" e "amanhã" já não
 * dizem o que diziam, e a virada de mês (de dezembro para janeiro, por exemplo) também muda o dia. Falso: o widget mostra
 * `WIDGET_TEXT.medium.noData` ("Abra o Clarevo para atualizar"). `today` é o dia do aparelho, no fuso da pessoa.
 */
export function isWidgetSnapshotFresh(snapshot: Pick<WidgetSnapshot, 'builtOn'>, today: IsoDate): boolean {
  return snapshot.builtOn === today;
}
