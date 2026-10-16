import { addMonths, formatMonthBR, formatMonthName, formatMonthSpanBR, type IsoMonth } from './dates';
import {
  COMPARISON_ELIGIBLE_STATES,
  comparisonStats,
  evolutionPoints,
  pointVariation,
  type ComparisonStats,
  type EvolutionMetric,
  type EvolutionPoint,
  type EvolutionPointState,
} from './evolucao';
import { formatTenths } from './learn/format';
import type { Cents } from './money';
import { formatBRL } from './money';
import type { MonthOverview } from './records';
import type { CategoryShare } from './summary';

/**
 * Evolução financeira, fase 1b (D-057, docs/14): a tela "Evolução", montada só com o que `months_overview` já entrega e com as
 * contas de `evolucao.ts` (fase 1a). Aqui moram os textos, o que a tela mostra em cada estado e a memória dos meses que a pessoa
 * tirou da comparação. Nenhuma regra financeira é nova, nada é gravado e nada sai do aparelho.
 *
 * - Recebido e Pago pela data do pagamento, as mesmas somas do Resumo; mês sem lançamentos é "sem registros", nunca zero.
 * - Mês em andamento e mês sem registros ficam à vista no eixo e fora da média e da mediana (D04).
 * - Tirar um mês da comparação só muda a média, a mediana e o desenho; o total dos meses exibidos nunca muda (EF-09).
 */

export const EVOLUTION_ROUTE = '/evolucao';

/** As janelas da tela, em meses, sempre terminando no mês atual da sessão. */
export const EVOLUTION_WINDOWS = [3, 6, 12] as const;
export type EvolutionWindow = (typeof EVOLUTION_WINDOWS)[number];
export const EVOLUTION_DEFAULT_WINDOW: EvolutionWindow = 6;
/** Quantos meses `months_overview` entrega por chamada (o banco recusa mais que 12). */
export const EVOLUTION_MAX_MONTHS = 12;
export const EVOLUTION_METRICS: readonly EvolutionMetric[] = ['recebido', 'pago'];
export const EVOLUTION_DEFAULT_METRIC: EvolutionMetric = 'pago';
/** Quantas categorias o painel do mês mostra. */
export const EVOLUTION_TOP_CATEGORIES = 3;

export function isEvolutionWindow(value: unknown): value is EvolutionWindow {
  return (EVOLUTION_WINDOWS as readonly unknown[]).includes(value);
}

/** Os 12 meses lidos de uma vez, terminando no mês atual; as janelas de 3 e 6 meses saem deles, sem nova leitura. */
export function evolutionFetchRange(currentMonth: IsoMonth): { from: IsoMonth; to: IsoMonth } {
  return { from: addMonths(currentMonth, -(EVOLUTION_MAX_MONTHS - 1)), to: currentMonth };
}

/** Os meses de uma janela, do mais antigo ao mês atual. */
export function evolutionMonths(currentMonth: IsoMonth, windowMonths: EvolutionWindow): IsoMonth[] {
  return Array.from({ length: windowMonths }, (_, i) => addMonths(currentMonth, i - (windowMonths - 1)));
}

/** Nomes das métricas nas frases (Recebido e Pago, como no Resumo). */
const METRIC_LABEL: Record<EvolutionMetric, string> = { recebido: 'Recebido', pago: 'Pago' };

/** "5 de 6 meses", "1 de 1 mês". */
const ofMonthsText = (n: number, total: number): string => `${n} de ${total} ${total === 1 ? 'mês' : 'meses'}`;

/** "gastos" em Pago e "recebimentos" em Recebido, para as frases que falam do que não foi anotado. */
const THINGS: Record<EvolutionMetric, string> = { recebido: 'recebimentos', pago: 'gastos' };

/** "abril", "abril e maio", "abril, maio e junho". */
function nameList(months: readonly IsoMonth[]): string {
  const names = months.map(formatMonthName);
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

const upperFirst = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

export const EVOLUTION_TEXT = {
  /** Título da tela, da linha em Movimentos e do guia. */
  title: 'Evolução',
  subtitle: 'Valores registrados, pela data do pagamento',
  /** Legenda da linha em Movimentos e do índice "No app" de Aprender. */
  rowCaption: 'Recebido e pago mês a mês, com média e mediana',
  rowA11y: 'Evolução. Recebido e pago mês a mês, com média e mediana.',
  screenCaption: 'Recebido e pago mês a mês, com média e mediana, e os meses que você tira da comparação',
  metricGroup: 'Valor mostrado',
  metrics: METRIC_LABEL,
  windowGroup: 'Meses mostrados',
  windowLabel: { 3: '3 meses', 6: '6 meses', 12: '12 meses' } as Record<EvolutionWindow, string>,
  loading: 'Carregando a evolução',
  loadError: 'Não foi possível carregar a evolução.',
  retry: 'Tentar de novo',
  chart: {
    title: (metric: EvolutionMetric): string => `${METRIC_LABEL[metric]} por mês`,
    /** "Meses: de maio a outubro de 2026". */
    span: (from: IsoMonth, to: IsoMonth): string => `Meses: ${formatMonthSpanBR(from, to)}`,
    /** Nome acessível do grupo de botões (um por mês). */
    group: 'Meses do gráfico. Escolha um mês para ver os detalhes.',
    /** "Maior valor do gráfico: R$ 7.800,00". Some com os valores ocultos. */
    maxValue: (cents: Cents): string => `Maior valor do gráfico: ${formatBRL(cents)}`,
    scaleNote: 'O gráfico parte do zero.',
  },
  legend: {
    included: 'Na comparação',
    excluded: 'Fora da comparação',
    noRecords: 'Sem registros',
    inProgress: 'Mês em andamento',
    selected: 'Mês escolhido',
  },
  /** O que cada mês do eixo é, para quem lê só o texto. */
  participation: {
    included: 'na comparação',
    excluded: 'fora da comparação',
    inProgress: 'mês em andamento',
    noRecords: 'sem registros',
  },
  stats: {
    average: 'Média dos meses na comparação',
    median: 'Mediana dos meses na comparação',
    /** "5 de 6 meses", "1 de 1 mês". */
    ofMonths: ofMonthsText,
    total: 'Total dos meses exibidos',
    totalNote: 'Soma de todos os meses do gráfico. Não muda quando você tira um mês da comparação.',
    onlyOne: 'Só um mês na comparação: a média e a mediana são o valor dele.',
    /** Frase do anúncio ao tirar ou pôr um mês: "Média R$ 3.390,00, mediana R$ 3.400,00, 5 de 6 meses." */
    announce: (average: Cents, median: Cents, n: number, total: number): string =>
      `Média ${formatBRL(average)}, mediana ${formatBRL(median)}, ${ofMonthsText(n, total)}.`,
    announceNone: 'Nenhum mês na comparação.',
  },
  custom: {
    /** "Comparação personalizada: 2 de 6 meses fora da comparação". */
    banner: (out: number, total: number): string => `Comparação personalizada: ${out} de ${total} ${total === 1 ? 'mês' : 'meses'} fora da comparação`,
    restore: 'Restaurar todos',
    /** "Fora da comparação: abril e junho." */
    list: (months: readonly IsoMonth[]): string => `Fora da comparação: ${nameList(months)}.`,
    /** A seleção é de cada valor mostrado: "Vale só para Pago." */
    scope: (metric: EvolutionMetric): string => `Vale só para ${METRIC_LABEL[metric]}.`,
  },
  states: {
    /** Nenhum mês dos exibidos tem lançamentos. */
    noRecordsTitle: 'Sem registros nestes meses',
    noRecordsBody: (metric: EvolutionMetric): string =>
      `Mês sem anotação não quer dizer mês sem ${THINGS[metric]}: aqui aparece só o que está registrado no Clarevo.`,
    noRecordsAction: { recebido: 'Registrar recebimento', pago: 'Anotar gasto' } as Record<EvolutionMetric, string>,
    /** Com menos de 12 meses na janela: o convite a olhar mais meses (null com 12). */
    olderMonths: (windowMonths: EvolutionWindow): string | null =>
      windowMonths === 3 ? 'Se há anotações mais antigas, escolha 6 ou 12 meses.' : windowMonths === 6 ? 'Se há anotações mais antigas, escolha 12 meses.' : null,
    /** Só o mês em andamento tem lançamentos: nada fechado para comparar. */
    noClosedTitle: 'Ainda não há mês fechado para comparar',
    noClosedBody: 'A comparação usa meses que já terminaram e têm registros. O mês em andamento aparece no gráfico e fica fora das contas.',
    /** Todos os meses foram tirados: nunca média zero. */
    allOutTitle: 'Escolha ao menos um mês para comparar',
    allOutBody: 'Todos os meses estão fora da comparação, então não há média nem mediana.',
  },
  panel: {
    /** "Pago" ou "Recebido", sobre o valor. */
    valueCaption: (metric: EvolutionMetric): string => METRIC_LABEL[metric],
    noValue: 'Sem registros',
    state: {
      com_registros: 'Com registros',
      em_andamento: 'Mês em andamento',
    },
    noRecords: (metric: EvolutionMetric): string => `Sem registros: mês sem anotação não quer dizer mês sem ${THINGS[metric]}`,
    switchLabel: 'Mostrar este mês na comparação',
    switchCaption: 'Tirar da comparação não apaga nem muda nenhum lançamento.',
    notEligible: {
      em_andamento: 'Este mês fica fora da comparação até terminar.',
      sem_registros: 'Este mês fica fora da comparação porque não tem registros.',
    },
    categoriesTitle: 'Maiores categorias do mês',
    categoryShare: (percentText: string): string => `${percentText} do pago`,
    categoriesNote: 'Mostra o que foi pago. Compra no cartão entra quando a fatura é paga.',
    categoriesAction: 'Ver Pago por categoria',
    categoriesLoadError: 'Não foi possível carregar as categorias do mês.',
    seeRecords: 'Ver lançamentos',
    /** Dica do botão "Ver lançamentos": o mês que a composição vai mostrar. */
    seeRecordsHint: (month: IsoMonth): string => `Abre os lançamentos de ${formatMonthBR(month).toLowerCase()}`,
  },
  variation: {
    title: 'Variação',
    /** "De março para abril". */
    fromTo: (from: IsoMonth, to: IsoMonth): string => `De ${formatMonthName(from)} para ${formatMonthName(to)}`,
    more: (cents: Cents): string => `${formatBRL(cents)} a mais`,
    less: (cents: Cents): string => `${formatBRL(cents)} a menos`,
    same: 'sem diferença',
    /** "136,4% a mais que março". */
    percentMore: (percentText: string, from: IsoMonth): string => `${percentText} a mais que ${formatMonthName(from)}`,
    percentLess: (percentText: string, from: IsoMonth): string => `${percentText} a menos que ${formatMonthName(from)}`,
    percentTiny: (more: boolean, from: IsoMonth): string => `Menos de 0,1% ${more ? 'a mais' : 'a menos'} que ${formatMonthName(from)}`,
    percentUnavailable: 'Percentual não disponível para estes meses.',
    /** O mês no meio que a comparação pulou. */
    skippedOut: (months: readonly IsoMonth[]): string => `${upperFirst(nameList(months))} ${months.length === 1 ? 'ficou' : 'ficaram'} fora da comparação.`,
    skippedEmpty: (months: readonly IsoMonth[]): string => `${upperFirst(nameList(months))} ${months.length === 1 ? 'está' : 'estão'} sem registros.`,
    unavailableNoBase: 'Variação não disponível: não há outro mês na comparação antes deste.',
    unavailableInProgress: 'Variação não disponível: o mês ainda está em andamento.',
    unavailableNoRecords: 'Variação não disponível: mês sem registros.',
  },
  table: {
    show: 'Ver valores mês a mês',
    hide: 'Esconder valores mês a mês',
    title: 'Valores mês a mês',
    columns: { month: 'Mês', value: 'Valor', state: 'Estado', included: 'Na comparação?' },
    yes: 'Sim',
    out: 'Fora da comparação',
    noValue: 'Sem valor',
    noRecords: 'Sem registros',
    note: 'O total dos meses exibidos não depende do que está na comparação.',
  },
} as const;

// ---------------------------------------------------------------------------------------------------------------------
// O que cada mês é na tela
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Como o mês entra na comparação:
 * - na_comparacao: mês fechado, com registros, que a pessoa não tirou;
 * - fora_escolha: mês fechado, com registros, que a pessoa tirou da comparação;
 * - fora_andamento: o mês atual (D04);
 * - fora_sem_registros: nenhum lançamento (D04).
 */
export type EvolutionParticipation = 'na_comparacao' | 'fora_escolha' | 'fora_andamento' | 'fora_sem_registros';

export interface EvolutionPointView extends EvolutionPoint {
  participation: EvolutionParticipation;
  /** Entra na média e na mediana. */
  included: boolean;
  /** Mês fechado com registros: o único que a pessoa pode tirar da comparação. */
  eligible: boolean;
  /** "Abril de 2026". */
  title: string;
  /** "abr". */
  shortLabel: string;
  /** "R$ 7.800,00"; null em mês sem registros (nunca "R$ 0,00"). */
  valueText: string | null;
  /** "Com registros", "Mês em andamento" ou o aviso de mês sem registros (o texto do painel). */
  stateText: string;
  /** "Com registros", "Mês em andamento" ou "Sem registros" (a coluna "Estado" da tabela). */
  stateLabel: string;
  /** "Sim" ou "Fora da comparação" (coluna "Na comparação?"). */
  includedText: string;
  /** Nome acessível do ponto: "Abril de 2026, R$ 7.800,00, fora da comparação". */
  name: string;
}

export type EvolutionSituation = 'normal' | 'sem_registros' | 'sem_mes_fechado' | 'todos_fora' | 'um_mes';

export interface EvolutionView {
  metric: EvolutionMetric;
  windowMonths: EvolutionWindow;
  from: IsoMonth;
  to: IsoMonth;
  currentMonth: IsoMonth;
  points: EvolutionPointView[];
  stats: ComparisonStats;
  /** X de "X de N meses fora da comparação": os meses fechados com registros que a pessoa tirou. */
  outCount: number;
  /** N: os meses fechados com registros. */
  eligibleCount: number;
  /** O que a faixa de comparação e os cartões mostram. */
  situation: EvolutionSituation;
  /** Total dos meses exibidos (todos os pontos), igual ao dos relatórios e sem relação com a seleção. */
  totalCents: Cents;
  /** O maior valor entre todos os pontos: a escala do gráfico, que não muda com a seleção. */
  maxCents: Cents;
}

function participationOf(state: EvolutionPointState, hidden: boolean): EvolutionParticipation {
  if (state === 'sem_registros') return 'fora_sem_registros';
  if (state === 'em_andamento') return 'fora_andamento';
  return hidden ? 'fora_escolha' : 'na_comparacao';
}

function pointName(point: EvolutionPoint, participation: EvolutionParticipation): string {
  const T = EVOLUTION_TEXT.participation;
  const parts = [formatMonthBR(point.month), point.state === 'sem_registros' ? T.noRecords : formatBRL(point.cents)];
  if (point.state === 'em_andamento') parts.push(T.inProgress);
  parts.push(participation === 'na_comparacao' ? T.included : T.excluded);
  return parts.join(', ');
}

export interface EvolutionViewInput {
  /** Linhas de months_overview (ou monthsOverview, no core): pode ter mais meses que a janela; sobram os de fora. */
  overview: readonly MonthOverview[];
  metric: EvolutionMetric;
  windowMonths: EvolutionWindow;
  currentMonth: IsoMonth;
  /** Meses que a pessoa tirou da comparação nesta métrica. */
  hiddenMonths: Iterable<IsoMonth>;
}

/**
 * Tudo o que a tela mostra para a métrica e a janela escolhidas. Um mês que a leitura não trouxe vale "sem registros" (como o
 * banco entrega mês vazio: valor 0 e contagem 0); nunca se inventa valor. Meses ocultos fora da janela, ou que não são
 * elegíveis, não contam. Não altera o que recebe. Lança RangeError com linha inválida (ver evolutionPoints).
 */
export function buildEvolutionView(input: EvolutionViewInput): EvolutionView {
  const { metric, windowMonths, currentMonth } = input;
  const months = evolutionMonths(currentMonth, windowMonths);
  const byMonth = new Map(input.overview.map((row) => [row.month, row] as const));
  const rows: MonthOverview[] = months.map(
    (month) => byMonth.get(month) ?? { month, receivedCount: 0, receivedCents: 0, paidCount: 0, paidCents: 0 },
  );
  const points = evolutionPoints(rows, metric, currentMonth);
  const hidden = new Set(input.hiddenMonths);
  const stats = comparisonStats(points, hidden);
  const views = points.map((p): EvolutionPointView => {
    const participation = participationOf(p.state, hidden.has(p.month));
    const T = EVOLUTION_TEXT;
    return {
      ...p,
      participation,
      included: participation === 'na_comparacao',
      eligible: (COMPARISON_ELIGIBLE_STATES as readonly EvolutionPointState[]).includes(p.state),
      title: formatMonthBR(p.month),
      shortLabel: formatMonthName(p.month).slice(0, 3),
      valueText: p.state === 'sem_registros' ? null : formatBRL(p.cents),
      stateText: p.state === 'sem_registros' ? T.panel.noRecords(metric) : p.state === 'em_andamento' ? T.panel.state.em_andamento : T.panel.state.com_registros,
      stateLabel: p.state === 'sem_registros' ? T.table.noRecords : p.state === 'em_andamento' ? T.panel.state.em_andamento : T.panel.state.com_registros,
      includedText: participation === 'na_comparacao' ? T.table.yes : T.table.out,
      name: pointName(p, participation),
    };
  });
  const total = Number(stats.canonicalTotal);
  if (!Number.isSafeInteger(total)) throw new RangeError('total grande demais');
  const situation: EvolutionSituation = views.every((p) => p.state === 'sem_registros')
    ? 'sem_registros'
    : stats.eligibleCount === 0
      ? 'sem_mes_fechado'
      : stats.visibleCount === 0
        ? 'todos_fora'
        : stats.visibleCount === 1
          ? 'um_mes'
          : 'normal';
  return {
    metric,
    windowMonths,
    from: months[0]!,
    to: months[months.length - 1]!,
    currentMonth,
    points: views,
    stats,
    outCount: stats.hiddenMonths.length,
    eligibleCount: stats.eligibleCount,
    situation,
    totalCents: total,
    maxCents: views.reduce((max, p) => Math.max(max, p.cents), 0),
  };
}

/**
 * O mês do painel: o que a pessoa escolheu, se ainda está na janela; senão, o mais recente que tem lançamentos (ou, sem nenhum, o
 * último da janela).
 */
export function evolutionSelectedMonth(view: EvolutionView, chosen: IsoMonth | null): IsoMonth {
  const picked = view.points.find((p) => p.month === chosen);
  if (picked) return picked.month;
  const latest = [...view.points].reverse().find((p) => p.state !== 'sem_registros');
  return (latest ?? view.points[view.points.length - 1]!).month;
}

// ---------------------------------------------------------------------------------------------------------------------
// Painel do mês escolhido (tela B)
// ---------------------------------------------------------------------------------------------------------------------

export type EvolutionVariation =
  | {
      available: true;
      /** "De março para abril: R$ 4.500,00 a mais". */
      text: string;
      /** "136,4% a mais que março"; null sem percentual (diferença nula ou base não comparável). */
      percentText: string | null;
      /** "Abril ficou fora da comparação." quando há mês pulado no meio; null se os dois meses são vizinhos. */
      skippedText: string | null;
      fromMonth: IsoMonth;
      toMonth: IsoMonth;
      /** Os dois meses são vizinhos no calendário. */
      adjacent: boolean;
    }
  | { available: false; text: string };

/**
 * A variação do mês escolhido: do mês anterior que está na comparação até ele. Com mês tirado ou sem registros no meio, a frase
 * diz as duas datas ("De março para maio") e quais meses ficaram de fora, e nunca chama a variação de "mês a mês" (D06). O mês em
 * andamento e o mês sem registros não têm variação, e o primeiro mês da comparação também não (não há mês antes dele).
 */
export function evolutionVariation(view: EvolutionView, month: IsoMonth): EvolutionVariation {
  const T = EVOLUTION_TEXT.variation;
  const selected = view.points.find((p) => p.month === month);
  if (!selected) return { available: false, text: T.unavailableNoBase };
  if (selected.state === 'sem_registros') return { available: false, text: T.unavailableNoRecords };
  if (selected.state === 'em_andamento') return { available: false, text: T.unavailableInProgress };
  const before = view.points.filter((p) => p.month < selected.month && p.included);
  const base = before[before.length - 1];
  if (!base) return { available: false, text: T.unavailableNoBase };
  const v = pointVariation(base, selected);
  const diff = v.differenceCents;
  const diffText = diff > 0 ? T.more(diff) : diff < 0 ? T.less(-diff) : T.same;
  let percentText: string | null = null;
  if (diff !== 0) {
    if (!v.comparable) percentText = T.percentUnavailable;
    else if (v.permille === 0) percentText = T.percentTiny(diff > 0, base.month);
    else percentText = (diff > 0 ? T.percentMore : T.percentLess)(formatTenths(Math.abs(v.permille)), base.month);
  }
  const between = view.points.filter((p) => p.month > base.month && p.month < selected.month && !p.included);
  const chosenOut = between.filter((p) => p.participation === 'fora_escolha').map((p) => p.month);
  const empty = between.filter((p) => p.participation === 'fora_sem_registros').map((p) => p.month);
  const skipped = [...(chosenOut.length > 0 ? [T.skippedOut(chosenOut)] : []), ...(empty.length > 0 ? [T.skippedEmpty(empty)] : [])];
  return {
    available: true,
    text: `${T.fromTo(base.month, selected.month)}: ${diffText}`,
    percentText,
    skippedText: skipped.length > 0 ? skipped.join(' ') : null,
    fromMonth: base.month,
    toMonth: selected.month,
    adjacent: v.adjacent,
  };
}

export interface EvolutionPanel {
  month: IsoMonth;
  /** "Abril de 2026". */
  title: string;
  /** "Pago". */
  valueCaption: string;
  /** "R$ 7.800,00"; null sem registros. */
  valueText: string | null;
  cents: Cents;
  stateText: string;
  state: EvolutionPointState;
  /** Só o mês fechado com registros tem o interruptor. */
  canToggle: boolean;
  /** O interruptor está ligado (o mês está na comparação). */
  included: boolean;
  /** Frase no lugar do interruptor quando o mês nunca entra na comparação. */
  notEligibleText: string | null;
  variation: EvolutionVariation;
  /** Pago com lançamentos: o app lê as categorias do mês. */
  showsCategories: boolean;
  /** "Ver lançamentos" aparece (o mês tem registros). */
  showsRecords: boolean;
  /** Composição de Recebido ou Pago, aberta com o mês do painel. */
  recordsHref: string;
  categoriesHref: string;
}

/** O painel do mês escolhido (tela B). Não lê nada: as categorias vêm de `categoryBreakdown`, no app. */
export function evolutionPanel(view: EvolutionView, month: IsoMonth): EvolutionPanel {
  const point = view.points.find((p) => p.month === month) ?? view.points[view.points.length - 1]!;
  const T = EVOLUTION_TEXT.panel;
  return {
    month: point.month,
    title: point.title,
    valueCaption: T.valueCaption(view.metric),
    valueText: point.valueText,
    cents: point.cents,
    stateText: point.stateText,
    state: point.state,
    canToggle: point.eligible,
    included: point.included,
    notEligibleText: point.state === 'em_andamento' ? T.notEligible.em_andamento : point.state === 'sem_registros' ? T.notEligible.sem_registros : null,
    variation: evolutionVariation(view, point.month),
    showsCategories: view.metric === 'pago' && point.state !== 'sem_registros',
    showsRecords: point.state !== 'sem_registros',
    recordsHref: `/composicao?tipo=${view.metric === 'pago' ? 'pago' : 'recebido'}`,
    categoriesHref: '/composicao?tipo=pago&vista=categoria',
  };
}

/**
 * As maiores categorias de Pago do mês, para o painel: por valor, do maior para o menor (empate: nome), com "Sem categoria"
 * entrando pelo valor, como em "Seu mês em 30 segundos". `shares` é `categoryBreakdown` de Pago (a fatura já dividida).
 */
export function evolutionTopCategories(shares: readonly CategoryShare[]): CategoryShare[] {
  return [...shares].sort((a, b) => b.cents - a.cents || a.label.localeCompare(b.label, 'pt-BR')).slice(0, EVOLUTION_TOP_CATEGORIES);
}

/** Frase do anúncio ao tirar ou pôr um mês na comparação (média, mediana e "n de N meses"; nunca média zero). */
export function evolutionAnnouncement(view: EvolutionView): string {
  const s = view.stats;
  return s.average === null || s.median === null
    ? EVOLUTION_TEXT.stats.announceNone
    : EVOLUTION_TEXT.stats.announce(s.average, s.median, s.visibleCount, s.eligibleCount);
}

// ---------------------------------------------------------------------------------------------------------------------
// Memória dos meses fora da comparação (D03)
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Meses que a pessoa tirou da comparação, só na memória do app (D03): por pessoa, por contexto (Pessoal ou Família) e por
 * métrica, de modo que Recebido e Pago nunca herdam a seleção um do outro (T13, EF-14). Nunca vai ao aparelho nem ao servidor e
 * some ao sair da conta, ao trocar de pessoa, ao trocar de contexto e ao recarregar a página. O app tem uma instância
 * (`lib/evolution-memory.ts`) e a limpa onde limpa as outras memórias (`clearReceiptMemory`).
 */
export class EvolutionSelectionStore {
  private readonly sets = new Map<string, ReadonlySet<IsoMonth>>();
  private readonly listeners = new Set<() => void>();
  private static readonly EMPTY: ReadonlySet<IsoMonth> = new Set<IsoMonth>();

  /** A chave de uma pessoa num contexto. Sem pessoa ou sem contexto, não há seleção para guardar. */
  static scope(personId: string | null | undefined, contextId: string | null | undefined): string | null {
    return personId && contextId ? `${personId}|${contextId}` : null;
  }

  private key(scope: string, metric: EvolutionMetric): string {
    return `${scope}|${metric}`;
  }

  /** Os meses tirados nesta métrica. A mesma referência enquanto nada muda (serve de snapshot para a tela). */
  get(scope: string | null, metric: EvolutionMetric): ReadonlySet<IsoMonth> {
    return (scope && this.sets.get(this.key(scope, metric))) || EvolutionSelectionStore.EMPTY;
  }

  /** Tira (hidden true) ou devolve (false) um mês da comparação desta métrica. */
  setHidden(scope: string, metric: EvolutionMetric, month: IsoMonth, hidden: boolean): void {
    const current = this.get(scope, metric);
    if (current.has(month) === hidden) return;
    const next = new Set(current);
    if (hidden) next.add(month);
    else next.delete(month);
    this.write(scope, metric, next);
  }

  /** "Restaurar todos": só desta métrica. */
  restoreAll(scope: string, metric: EvolutionMetric): void {
    if (this.get(scope, metric).size === 0) return;
    this.write(scope, metric, new Set());
  }

  /** Esquece tudo (sair da conta, trocar de pessoa ou de contexto). */
  clear(): void {
    if (this.sets.size === 0) return;
    this.sets.clear();
    this.emit();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private write(scope: string, metric: EvolutionMetric, next: ReadonlySet<IsoMonth>): void {
    if (next.size === 0) this.sets.delete(this.key(scope, metric));
    else this.sets.set(this.key(scope, metric), next);
    this.emit();
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
