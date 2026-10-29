import { formatPermille } from './committed';
import { addMonths, formatDateBR, formatMonthBR, formatMonthName, formatMonthSpanBR, formatMonthYearBR, monthOf, type IsoDate, type IsoMonth } from './dates';
import {
  COMPARISON_ELIGIBLE_STATES,
  comparisonStats,
  evolutionPoints,
  explainChange,
  isPhase3Metric,
  pointVariation,
  type ChangeExplanation,
  type ChangeSide,
  type ComparisonStats,
  type EvolutionMetric,
  type EvolutionPhase3Metric,
  type EvolutionPoint,
  type EvolutionPointState,
  type EvolutionSelectionMetric,
  type Phase3Point,
} from './evolucao';
import { formatTenths } from './learn/format';
import { MONTH_CHECK_TEXT, monthCheckPlan, type MonthCheckPlan } from './month-check';
import type { Cents } from './money';
import { formatBRL } from './money';
import type { Commitment, CommitmentSeries, MonthCheckKind, MonthOverview } from './records';
import type { RecordsRepository } from './repository';
import { seriesGapsInRange } from './retorno';
import type { CategoryShare } from './summary';

/**
 * Evolução financeira, fase 1b (D-057, docs/14): a tela "Evolução", montada só com o que `months_overview` já entrega e com as
 * contas de `evolucao.ts` (fase 1a). Aqui moram os textos, o que a tela mostra em cada estado e a memória dos meses que a pessoa
 * tirou da comparação. Nenhuma regra financeira é nova, nada é gravado e nada sai do aparelho.
 *
 * - Recebido e Pago pela data do pagamento, as mesmas somas do Resumo; mês sem lançamentos é "sem registros", nunca zero, a não ser que a
 *   pessoa tenha conferido o mês (D-060, "Conferi este mês"): aí é zero confirmado, "R$ 0,00, conferido", e entra nas contas como zero.
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
/** O seletor: Recebido e Pago (pela data do pagamento) e, depois deles, os dois valores da fase 3 (D-062 item 4). */
export const EVOLUTION_METRICS: readonly EvolutionSelectionMetric[] = ['recebido', 'pago', 'comprometida', 'guardado'];
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

/** Nomes dos valores nas frases (Recebido e Pago, como no Resumo, e os dois da fase 3). */
const METRIC_LABEL: Record<EvolutionSelectionMetric, string> = { recebido: 'Recebido', pago: 'Pago', comprometida: 'Renda comprometida', guardado: 'Guardado em metas' };

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
const lowerFirst = (text: string): string => `${text.charAt(0).toLowerCase()}${text.slice(1)}`;

/** "novembro de 2025", "novembro de 2025 e janeiro de 2026": meses de outro período, com o ano. */
function yearNameList(months: readonly IsoMonth[]): string {
  const names = months.map(formatMonthYearBR);
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

/** "abril" e "março"; com os dois meses em anos diferentes, "janeiro de 2026" e "dezembro de 2025". */
function monthLabels(a: IsoMonth, b: IsoMonth): [string, string] {
  return a.slice(0, 4) === b.slice(0, 4) ? [formatMonthName(a), formatMonthName(b)] : [formatMonthYearBR(a), formatMonthYearBR(b)];
}

/** "abril está", "abril e maio estão". */
const beVerb = (months: readonly IsoMonth[]): string => `${nameList(months)} ${months.length === 1 ? 'está' : 'estão'}`;

const GAP_WARNING = 'Pode faltar algo neste mês: há conta prevista sem registro';

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
    title: (metric: EvolutionSelectionMetric): string => `${METRIC_LABEL[metric]} por mês`,
    /** "Meses: de maio a outubro de 2026". */
    span: (from: IsoMonth, to: IsoMonth): string => `Meses: ${formatMonthSpanBR(from, to)}`,
    /** Nome acessível do grupo de botões (um por mês). */
    group: 'Meses do gráfico. Escolha um mês para ver os detalhes.',
    /** "Maior valor do gráfico: R$ 7.800,00". Some com os valores ocultos. */
    maxValue: (cents: Cents): string => `Maior valor do gráfico: ${formatBRL(cents)}`,
    /** Renda comprometida: "Maior valor do gráfico: 52,5%". O percentual segue à vista com valores ocultos. */
    maxPercent: (percentText: string): string => `Maior valor do gráfico: ${percentText}`,
    scaleNote: 'O gráfico parte do zero.',
    /** Guardado em metas com mês negativo (mais resgates que aportes): o zero fica no meio do desenho. */
    zeroNote: 'A linha mais escura marca o zero. Abaixo dela estão os meses com mais resgates que aportes.',
  },
  legend: {
    included: 'Na comparação',
    excluded: 'Fora da comparação',
    noRecords: 'Sem registros',
    zeroConfirmed: 'Conferido, sem lançamentos',
    inProgress: 'Mês em andamento',
    selected: 'Mês escolhido',
    /** Renda comprometida: mês fechado sem renda de referência. */
    noBase: 'Sem base',
    /** Guardado em metas: mês fechado sem aporte nem resgate, com meta já criada. */
    zeroSaved: 'Sem aportes nem resgates, com meta já criada',
  },
  /** O que cada mês do eixo é, para quem lê só o texto. */
  participation: {
    included: 'na comparação',
    excluded: 'fora da comparação',
    inProgress: 'mês em andamento',
    noRecords: 'sem registros',
    zeroConfirmed: MONTH_CHECK_TEXT.zeroConfirmed,
    noBase: 'sem base',
    zeroSaved: 'sem aportes nem resgates, com meta já criada',
  },
  stats: {
    average: 'Média dos meses na comparação',
    median: 'Mediana dos meses na comparação',
    /** "5 de 6 meses", "1 de 1 mês". */
    ofMonths: ofMonthsText,
    total: 'Total dos meses exibidos',
    totalNote: 'Soma de todos os meses do gráfico. Não muda quando você tira um mês da comparação.',
    onlyOne: 'Só um mês na comparação: a média e a mediana são o valor dele.',
    /** Ligação com o tema "Média e mediana" de Aprender (D-062): abre o "O que é isso?" no próprio lugar, com "Ler explicação completa". */
    whatIsMedian: 'O que é mediana?',
    /** Frase do anúncio ao tirar ou pôr um mês: "Média R$ 3.390,00, mediana R$ 3.400,00, 5 de 6 meses." */
    announce: (average: Cents, median: Cents, n: number, total: number): string =>
      `Média ${formatBRL(average)}, mediana ${formatBRL(median)}, ${ofMonthsText(n, total)}.`,
    announceNone: 'Nenhum mês na comparação.',
    /** O mesmo anúncio com os valores já escritos (percentual da Renda comprometida): "Média 52,5%, mediana 50,0%, 2 de 3 meses." */
    announceText: (average: string, median: string, n: number, total: number): string => `Média ${average}, mediana ${median}, ${ofMonthsText(n, total)}.`,
  },
  custom: {
    /** "Comparação personalizada: 2 de 6 meses fora da comparação". */
    banner: (out: number, total: number): string => `Comparação personalizada: ${out} de ${total} ${total === 1 ? 'mês' : 'meses'} fora da comparação`,
    restore: 'Restaurar todos',
    /**
     * "Fora da comparação: abril e junho." Com meses tirados em outra janela (o "Restaurar todos" devolve também esses), a frase os
     * conta e os cita: "Fora da comparação: abril e junho, e 1 mês fora desta janela (novembro de 2025)."
     */
    list: (months: readonly IsoMonth[], outside: readonly IsoMonth[] = []): string =>
      `Fora da comparação: ${nameList(months)}${
        outside.length === 0 ? '' : `, e ${outside.length} ${outside.length === 1 ? 'mês fora' : 'meses fora'} desta janela (${yearNameList(outside)})`
      }.`,
    /** A seleção é de cada valor mostrado: "Vale só para Pago." */
    scope: (metric: EvolutionSelectionMetric): string => `Vale só para ${METRIC_LABEL[metric]}.`,
  },
  states: {
    /** Nenhum mês dos exibidos tem lançamentos. */
    noRecordsTitle: 'Sem registros nestes meses',
    noRecordsBody: (metric: EvolutionMetric): string =>
      `Mês sem anotação não quer dizer mês sem ${THINGS[metric]}: aqui aparece só o que está registrado na Clarevo.`,
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
  /** Mês fechado com sinal de lacuna (D04): entra na comparação, com este aviso no painel, no nome do ponto e na tabela. */
  gap: {
    warning: GAP_WARNING,
  },
  panel: {
    /** "Pago" ou "Recebido", sobre o valor. */
    valueCaption: (metric: EvolutionSelectionMetric): string => METRIC_LABEL[metric],
    noValue: 'Sem registros',
    state: {
      com_registros: 'Com registros',
      zero_confirmado: 'Conferido',
      em_andamento: 'Mês em andamento',
    },
    noRecords: (metric: EvolutionMetric): string => `Sem registros: mês sem anotação não quer dizer mês sem ${THINGS[metric]}`,
    switchLabel: 'Mostrar este mês na comparação',
    switchCaption: 'Tirar da comparação não apaga nem muda nenhum lançamento.',
    notEligible: {
      em_andamento: 'Este mês fica fora da comparação até terminar.',
      sem_registros: 'Este mês fica fora da comparação porque não tem registros.',
      /** Renda comprometida de mês fechado sem renda de referência (fase 3). */
      sem_base: 'Este mês fica fora da comparação porque não há renda de referência para ele.',
    },
    categoriesTitle: 'Maiores categorias do mês',
    /** "35,9% do pago" (Pago) ou "100% do recebido" (Recebido). */
    categoryShare: (percentText: string, metric: EvolutionMetric = 'pago'): string => `${percentText} do ${metric === 'pago' ? 'pago' : 'recebido'}`,
    categoriesNote: 'Mostra o que foi pago. Compra no cartão entra quando a fatura é paga.',
    categoriesNoteReceived: 'Mostra o que foi recebido.',
    categoriesAction: 'Ver Pago por categoria',
    categoriesLoadError: 'Não foi possível carregar as categorias do mês.',
    previous: 'Mês anterior',
    next: 'Mês seguinte',
    /** Dica dos botões "Mês anterior" e "Mês seguinte": o mês que o painel vai mostrar. */
    stepHint: (month: IsoMonth): string => `Mostra ${formatMonthBR(month).toLowerCase()}`,
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
  /** "Entender o que mudou" (fase 2, EF-16 e EF-17): a explicação descritiva entre o mês escolhido e o mês de comparação da variação. */
  explain: {
    title: 'Entender o que mudou',
    /** Dica do botão que abre: os dois meses comparados. */
    hint: (from: IsoMonth, to: IsoMonth): string => {
      const [t, f] = monthLabels(to, from);
      return `Compara ${t} com ${f}`;
    },
    /** "O Pago registrado foi R$ 4.500,00 maior em abril que em março." */
    headline: (metric: EvolutionMetric, differenceCents: number, from: IsoMonth, to: IsoMonth): string => {
      const [t, f] = monthLabels(to, from);
      if (differenceCents === 0) return `O ${METRIC_LABEL[metric]} registrado foi igual em ${t} e em ${f}.`;
      return `O ${METRIC_LABEL[metric]} registrado foi ${formatBRL(Math.abs(differenceCents))} ${differenceCents > 0 ? 'maior' : 'menor'} em ${t} que em ${f}.`;
    },
    /** Mês fora da comparação entre os dois: "(março e maio não são meses vizinhos na comparação: abril está fora)". */
    notAdjacent: (from: IsoMonth, to: IsoMonth, chosenOut: readonly IsoMonth[], empty: readonly IsoMonth[]): string => {
      const [t, f] = monthLabels(to, from);
      const reasons = [...(chosenOut.length > 0 ? [`${beVerb(chosenOut)} fora`] : []), ...(empty.length > 0 ? [`${beVerb(empty)} sem registros`] : [])];
      return `(${f} e ${t} não são meses vizinhos na comparação: ${reasons.join('; ')})`;
    },
    inProgress: 'Mês em andamento: os valores ainda podem mudar.',
    /** O aviso do mês de partida com lacuna ("neste mês", do mês escolhido, é o `gap.warning`). */
    gapIn: (month: IsoMonth): string => `Pode faltar algo em ${formatMonthName(month)}: há conta prevista sem registro`,
    needOtherMonth: 'Escolha outro mês na comparação para ver o que mudou.',
    categoriesTitle: 'Categorias que mais mudaram',
    /** "Casa: R$ 1.200,00 em março, R$ 5.600,00 em abril, R$ 4.400,00 a mais" (sem valor num dos meses: "sem pagamentos em março"). */
    category: (metric: EvolutionMetric, label: string, fromCents: Cents, toCents: Cents, from: IsoMonth, to: IsoMonth): string => {
      const [t, f] = monthLabels(to, from);
      const none = metric === 'pago' ? 'sem pagamentos' : 'sem recebimentos';
      const side = (cents: Cents, month: string): string => `${cents === 0 ? none : formatBRL(cents)} em ${month}`;
      const diff = toCents - fromCents;
      return `${label}: ${side(fromCents, f)}, ${side(toCents, t)}, ${diff > 0 ? `${formatBRL(diff)} a mais` : `${formatBRL(-diff)} a menos`}`;
    },
    noCategoryChange: 'Nenhuma categoria mudou de valor.',
    /** A soma das categorias mostradas não fecha a diferença total: a sobra líquida, com o sinal dito em palavras. Nunca diz que uma categoria foi a causa. */
    others: (cents: number): string => `Outras categorias também mudaram: ${formatBRL(Math.abs(cents))} ${cents > 0 ? 'a mais' : 'a menos'} no total.`,
    relatedTitle: 'Lançamentos relacionados',
    /** "Os maiores lançamentos de abril em Transporte". */
    relatedIntro: (label: string, month: IsoMonth): string => `Os maiores lançamentos de ${formatMonthName(month)} em ${label}`,
    relatedEmpty: (label: string, month: IsoMonth): string => `Nenhum lançamento em ${label} em ${formatMonthName(month)}.`,
    /** "Reparo do carro · 22/04/2026 · R$ 4.400,00". */
    relatedRow: (description: string, date: IsoDate, cents: Cents): string => `${description} · ${formatDateBR(date)} · ${formatBRL(cents)}`,
    relatedRowA11y: (description: string, date: IsoDate, cents: Cents, partial: boolean): string =>
      `${description}, ${formatDateBR(date)}, ${formatBRL(cents)}${partial ? ', parte do pagamento da fatura' : ''}`,
    partOfInvoice: 'Parte do pagamento da fatura',
    note: 'Descreve o que está registrado nos dois meses. Não diz que uma categoria ou um lançamento é a causa da diferença.',
    limitation: 'Os lançamentos lidos não fecham com o total dos dois meses, então não dá para detalhar por categoria agora.',
    loading: 'Carregando o que mudou',
    loadError: 'Não foi possível carregar o que mudou.',
    seeCategories: 'Ver categorias',
    seeRecords: 'Ver lançamentos',
    /** O mesmo interruptor "Mostrar este mês na comparação": o botão tira o mês da comparação ou o traz de volta. */
    compareWithout: 'Comparar sem este mês',
    compareWith: 'Voltar a comparar com este mês',
    compareHint: 'Só muda a média, a mediana e o gráfico. Nenhum lançamento é apagado nem mudado.',
  },
  /**
   * Fase 3 (D-062 item 4): "Renda comprometida" (percentual da renda de referência ligado a contas do mês) e "Guardado em metas" (aportes
   * menos resgates), sempre só de meses já fechados. Cada um escreve a própria base no subtítulo. Previsão nunca entra.
   */
  phase3: {
    subtitle: {
      comprometida: 'Percentual da renda de referência ligado a contas do mês',
      guardado: 'Aportes menos resgates nas metas',
    } as Record<EvolutionPhase3Metric, string>,
    closedOnly: 'Só meses já fechados. O mês em andamento fica de fora e nada aqui é previsão.',
    /** O que o painel diz do estado de cada mês. */
    state: {
      comprometida: {
        com_registros: 'Com contas no mês',
        sem_base: 'Sem base: não há renda de referência para este mês',
        sem_registros: 'Sem registros: mês sem conta anotada não quer dizer mês sem contas',
        em_andamento: 'Mês em andamento: só meses já fechados entram aqui',
      },
      guardado: {
        com_registros: 'Com aportes ou resgates',
        zero_confirmado: 'Sem aportes nem resgates, com meta já criada neste mês',
        sem_registros: 'Sem registros: nenhuma meta criada até este mês',
        em_andamento: 'Mês em andamento: só meses já fechados entram aqui',
      },
    },
    /** A coluna "Estado" da tabela. */
    stateLabel: {
      com_registros: 'Com registros',
      zero_confirmado: 'Sem movimento',
      sem_registros: 'Sem registros',
      sem_base: 'Sem base',
      em_andamento: 'Mês em andamento',
    },
    /** No lugar do valor, num mês sem valor. */
    noValue: {
      sem_base: 'Sem base',
      sem_registros: 'Sem registros',
      em_andamento: 'Mês em andamento',
    },
    switchCaption: 'Tirar da comparação não apaga nem muda nenhuma conta, meta ou lançamento.',
    /** "Entender o que mudou" não se aplica nesta fase. */
    explainTitle: 'Entender o que mudou',
    explainNote: 'Disponível para Recebido e Pago',
    /** Tela sem nenhum mês fechado com valor. */
    empty: {
      noBaseTitle: 'Sem base para estes meses',
      noBaseBody:
        'Sem a renda de referência, não há com o que dividir as contas do mês. Ela é informada em Renda comprometida. Só meses já fechados entram aqui.',
      noBaseAction: 'Informar renda de referência',
      noRecordsTitle: 'Sem registros nestes meses',
      noRecordsBody:
        'Mês sem conta anotada não quer dizer mês sem contas: aqui aparece só o que está registrado na Clarevo. Só meses já fechados entram aqui.',
      noRecordsAction: 'Anotar conta a pagar',
      savingsBody: 'Não há meta criada nestes meses. Só meses já fechados entram aqui.',
      savingsAction: 'Criar meta',
    },
  },
  table: {
    show: 'Ver tabela mês a mês',
    hide: 'Ocultar tabela mês a mês',
    title: 'Valores mês a mês',
    columns: { month: 'Mês', value: 'Valor', state: 'Estado', included: 'Na comparação?' },
    yes: 'Sim',
    out: 'Fora da comparação',
    noValue: 'Sem valor',
    noRecords: 'Sem registros',
    zeroConfirmed: 'Conferido',
    note: 'O total dos meses exibidos não depende do que está na comparação.',
    /** Renda comprometida não tem total (somar percentuais de meses não dá um percentual). */
    noteNoTotal: 'Tirar um mês da comparação só muda a média e a mediana. O percentual de cada mês não muda.',
    /** Dica da linha da tabela, que é um botão: escolhe o mês e leva ao painel. */
    rowHint: 'Mostra este mês no painel',
  },
} as const;

// ---------------------------------------------------------------------------------------------------------------------
// O que cada mês é na tela
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Como o mês entra na comparação:
 * - na_comparacao: mês fechado, com registros ou conferido sem lançamentos (zero confirmado), que a pessoa não tirou;
 * - fora_escolha: mês fechado, com registros ou zero confirmado, que a pessoa tirou da comparação;
 * - fora_andamento: o mês atual (D04);
 * - fora_sem_registros: nenhum lançamento (D04);
 * - fora_sem_base: Renda comprometida de mês fechado sem renda de referência (fase 3): não há com o que dividir.
 */
export type EvolutionParticipation = 'na_comparacao' | 'fora_escolha' | 'fora_andamento' | 'fora_sem_registros' | 'fora_sem_base';

export interface EvolutionPointView extends EvolutionPoint {
  participation: EvolutionParticipation;
  /**
   * O ponto tem um valor para desenhar: falso no mês sem registros (nunca um ponto em zero) e, na fase 3, também no mês em andamento
   * (só meses fechados) e no mês sem base. O desenho vira um traço na linha de base.
   */
  hasValue: boolean;
  /** Entra na média e na mediana. */
  included: boolean;
  /** Mês fechado com registros ou zero confirmado: o único que a pessoa pode tirar da comparação. */
  eligible: boolean;
  /** "Abril de 2026". */
  title: string;
  /** "abr". */
  shortLabel: string;
  /**
   * "R$ 7.800,00"; "R$ 0,00" só no zero confirmado; null em mês sem registros (nunca "R$ 0,00" sem a conferência). Na Renda comprometida,
   * o percentual ("52,5%"); em mês sem valor da fase 3 (em andamento, sem base, sem registros), null.
   */
  valueText: string | null;
  /** "Com registros", "Mês em andamento", "Você conferiu: não houve pagamentos em março de 2026." ou o aviso de mês sem registros (o texto do painel). */
  stateText: string;
  /** "Com registros", "Conferido", "Mês em andamento" ou "Sem registros" (a coluna "Estado" da tabela). */
  stateLabel: string;
  /** "Sim" ou "Fora da comparação" (coluna "Na comparação?"). */
  includedText: string;
  /**
   * Mês fechado de Pago com sinal de lacuna (D04): há número de gasto fixo, parcelamento ou conta do ano sem conta registrada, ou conta em
   * aberto vencida no mês. O ponto segue na comparação (ou fora, se a pessoa o tirou) e ganha o aviso `EVOLUTION_TEXT.gap.warning`.
   */
  gap: boolean;
  /** Nome acessível do ponto: "Abril de 2026, R$ 7.800,00, fora da comparação" (com o aviso de lacuna, se houver). */
  name: string;
}

export type EvolutionSituation = 'normal' | 'sem_registros' | 'sem_mes_fechado' | 'todos_fora' | 'um_mes';

/** O que os valores da visão são: centavos (Recebido, Pago e Guardado em metas) ou milésimos da renda de referência (Renda comprometida). */
export type EvolutionUnit = 'cents' | 'permille';

/**
 * A visão do gráfico, da comparação e da tabela. O parâmetro é o valor mostrado: a visão de Recebido e Pago (`buildEvolutionView`) é a
 * padrão, a da fase 3 é `EvolutionView<EvolutionPhase3Metric>` (`buildPhase3View`). Onde `cents` aparece (pontos, média, mediana, escala),
 * a unidade é `unit`.
 */
export interface EvolutionView<M extends EvolutionSelectionMetric = EvolutionMetric> {
  metric: M;
  /** A unidade dos valores: centavos ou, na Renda comprometida, milésimos (525 = 52,5%). */
  unit: EvolutionUnit;
  windowMonths: EvolutionWindow;
  from: IsoMonth;
  to: IsoMonth;
  currentMonth: IsoMonth;
  points: EvolutionPointView[];
  /**
   * As linhas de months_overview da janela, uma por mês, na mesma ordem dos pontos: o painel lê delas a versão da marca "Conferi este
   * mês" e o aviso de compras no cartão (D-060). Mês que a leitura não trouxe vale a linha zerada. Vazio na fase 3.
   */
  rows: MonthOverview[];
  stats: ComparisonStats;
  /** A média e a mediana já escritas ("R$ 3.390,00" ou "52,5%"); null quando não há mês na comparação (nunca zero). */
  averageText: string | null;
  medianText: string | null;
  /** X de "X de N meses fora da comparação": os meses fechados com registros que a pessoa tirou. */
  outCount: number;
  /** N: os meses fechados com registros. */
  eligibleCount: number;
  /**
   * Meses que a pessoa tirou da comparação deste valor e que estão fora da janela atual (em outra janela de 3, 6 ou 12 meses). A
   * seleção vale em qualquer janela e "Restaurar todos" devolve também esses, então o aviso os conta e os cita. Não entram em `outCount`.
   */
  outsideMonths: IsoMonth[];
  /** O que a faixa de comparação e os cartões mostram. */
  situation: EvolutionSituation;
  /**
   * Total dos meses exibidos (todos os pontos), igual ao dos relatórios e sem relação com a seleção. Null na Renda comprometida: somar
   * percentuais de meses não dá um percentual.
   */
  totalCents: Cents | null;
  /** O maior valor entre todos os pontos, nunca abaixo de 0: o alto da escala do gráfico, que não muda com a seleção. */
  maxCents: Cents;
  /** O menor valor entre todos os pontos, nunca acima de 0: o pé da escala. Só o Guardado em metas passa de 0 (mês com mais resgates que aportes). */
  minCents: Cents;
}

function participationOf(state: EvolutionPointState, hidden: boolean): EvolutionParticipation {
  if (state === 'sem_registros') return 'fora_sem_registros';
  if (state === 'sem_base') return 'fora_sem_base';
  if (state === 'em_andamento') return 'fora_andamento';
  return hidden ? 'fora_escolha' : 'na_comparacao';
}

/** O que o painel diz do estado do mês: no zero confirmado, a própria conferência ("Você conferiu: não houve pagamentos em março de 2026."). */
function pointStateText(point: EvolutionPoint, metric: EvolutionMetric): string {
  const T = EVOLUTION_TEXT;
  if (point.state === 'sem_registros') return T.panel.noRecords(metric);
  if (point.state === 'zero_confirmado') return MONTH_CHECK_TEXT.done(checkKindOf(metric), point.month);
  return point.state === 'em_andamento' ? T.panel.state.em_andamento : T.panel.state.com_registros;
}

/** A coluna "Estado" da tabela. */
function pointStateLabel(point: EvolutionPoint): string {
  const T = EVOLUTION_TEXT;
  if (point.state === 'sem_registros') return T.table.noRecords;
  if (point.state === 'zero_confirmado') return T.table.zeroConfirmed;
  return point.state === 'em_andamento' ? T.panel.state.em_andamento : T.panel.state.com_registros;
}

/** O tipo de marca de "Conferi este mês" de cada valor: Recebido confere recebimentos, Pago confere gastos (pagamentos). */
export function checkKindOf(metric: EvolutionMetric): MonthCheckKind {
  return metric === 'recebido' ? 'recebimentos' : 'pagamentos';
}

function pointName(point: EvolutionPoint, participation: EvolutionParticipation, gap: boolean): string {
  const T = EVOLUTION_TEXT.participation;
  const parts = [formatMonthBR(point.month), point.state === 'sem_registros' ? T.noRecords : formatBRL(point.cents)];
  if (point.state === 'zero_confirmado') parts.push(T.zeroConfirmed);
  if (point.state === 'em_andamento') parts.push(T.inProgress);
  parts.push(participation === 'na_comparacao' ? T.included : T.excluded);
  if (gap) parts.push(lowerFirst(EVOLUTION_TEXT.gap.warning));
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
  /**
   * Meses fechados com sinal de lacuna (`evolutionGapMonths`). Só valem para Pago e só para mês fechado com registros: em Recebido,
   * no mês em andamento e no mês sem registros não há aviso. Sem a leitura (ou se ela falhou), omita: o gráfico sai sem o aviso.
   */
  gapMonths?: Iterable<IsoMonth>;
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
  const gaps = new Set(metric === 'pago' ? (input.gapMonths ?? []) : []);
  const stats = comparisonStats(points, hidden);
  const inWindow = new Set(months);
  const outsideMonths = [...hidden].filter((m) => !inWindow.has(m)).sort();
  const views = points.map((p): EvolutionPointView => {
    const participation = participationOf(p.state, hidden.has(p.month));
    const gap = p.state === 'com_registros' && gaps.has(p.month);
    const T = EVOLUTION_TEXT;
    return {
      ...p,
      participation,
      hasValue: p.state !== 'sem_registros',
      included: participation === 'na_comparacao',
      eligible: (COMPARISON_ELIGIBLE_STATES as readonly EvolutionPointState[]).includes(p.state),
      title: formatMonthBR(p.month),
      shortLabel: formatMonthName(p.month).slice(0, 3),
      valueText: p.state === 'sem_registros' ? null : formatBRL(p.cents),
      stateText: pointStateText(p, metric),
      stateLabel: pointStateLabel(p),
      includedText: participation === 'na_comparacao' ? T.table.yes : T.table.out,
      gap,
      name: pointName(p, participation, gap),
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
    unit: 'cents',
    windowMonths,
    from: months[0]!,
    to: months[months.length - 1]!,
    currentMonth,
    points: views,
    rows,
    stats,
    averageText: stats.average === null ? null : formatBRL(stats.average),
    medianText: stats.median === null ? null : formatBRL(stats.median),
    outCount: stats.hiddenMonths.length,
    eligibleCount: stats.eligibleCount,
    outsideMonths,
    situation,
    totalCents: total,
    maxCents: views.reduce((max, p) => Math.max(max, p.cents), 0),
    minCents: 0,
  };
}

/**
 * O mês do painel: o que a pessoa escolheu, se ainda está na janela; senão, o mais recente que tem lançamentos (ou, sem nenhum, o mais
 * recente conferido sem lançamentos e, sem nenhum, o último da janela).
 */
export function evolutionSelectedMonth<M extends EvolutionSelectionMetric>(view: EvolutionView<M>, chosen: IsoMonth | null): IsoMonth {
  const picked = view.points.find((p) => p.month === chosen);
  if (picked) return picked.month;
  // Fase 3: o mês em andamento não tem valor (só meses fechados), então abre no fechado mais recente que tem valor; sem nenhum, o último.
  if (isPhase3Metric(view.metric)) {
    const valued = [...view.points].reverse().find((p) => p.hasValue);
    return (valued ?? view.points[view.points.length - 1]!).month;
  }
  const withRecords = [...view.points].reverse().find((p) => p.state === 'com_registros' || p.state === 'em_andamento');
  const confirmed = [...view.points].reverse().find((p) => p.state === 'zero_confirmado');
  return (withRecords ?? confirmed ?? view.points[view.points.length - 1]!).month;
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

/** O mês de comparação do mês escolhido: o anterior que está na comparação (o da variação e de "Entender o que mudou"); undefined se não há. */
function comparisonBase(view: EvolutionView, selected: EvolutionPointView): EvolutionPointView | undefined {
  const before = view.points.filter((p) => p.month < selected.month && p.included);
  return before[before.length - 1];
}

/** Os meses entre o de comparação e o escolhido, que ficaram fora da comparação: os que a pessoa tirou e os sem registros. */
function skippedMonths(view: EvolutionView, base: EvolutionPointView, selected: EvolutionPointView): { chosenOut: IsoMonth[]; empty: IsoMonth[] } {
  const between = view.points.filter((p) => p.month > base.month && p.month < selected.month && !p.included);
  return {
    chosenOut: between.filter((p) => p.participation === 'fora_escolha').map((p) => p.month),
    empty: between.filter((p) => p.participation === 'fora_sem_registros').map((p) => p.month),
  };
}

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
  const base = comparisonBase(view, selected);
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
  const { chosenOut, empty } = skippedMonths(view, base, selected);
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
  /** O aviso de lacuna do mês fechado de Pago (D04); null sem lacuna. A variação e as categorias seguem à mostra com ele (D10). */
  gapText: string | null;
  /**
   * "Conferi este mês" (D-060): o botão "Conferi: não houve pagamentos em março de 2026" no mês fechado sem registros (com escrita), ou a
   * frase de mês conferido com "Desfazer a conferência"; em Pago, o aviso de compras no cartão do mês vem junto. null nos meses com
   * registros e no mês em andamento.
   */
  check: MonthCheckPlan | null;
  /** O mês vizinho da janela, para "Mês anterior" e "Mês seguinte"; null no limite (o botão fica desativado). */
  previousMonth: IsoMonth | null;
  nextMonth: IsoMonth | null;
  variation: EvolutionVariation;
  /** O valor mostrado: Pago ou Recebido. */
  metric: EvolutionMetric;
  /** O mês tem lançamentos na métrica: o app lê as categorias do mês (Pago, com a fatura dividida, ou Recebido). */
  showsCategories: boolean;
  /** "Mostra o que foi pago. Compra no cartão entra quando a fatura é paga." ou "Mostra o que foi recebido." */
  categoriesNote: string;
  /** "Ver Pago por categoria" aparece: só em Pago, que é o único valor com a tela Por categoria. */
  showsCategoriesAction: boolean;
  /** "Ver lançamentos" aparece (o mês tem registros). */
  showsRecords: boolean;
  /** Composição de Recebido ou Pago, aberta com o mês do painel. */
  recordsHref: string;
  categoriesHref: string;
  /** "Entender o que mudou" (fase 2): se aparece, com qual mês de comparação e com quais avisos. */
  explain: EvolutionExplainPlan;
}

/** O ponto tem lançamentos (mês fechado ou em andamento): há o que listar e categorias a mostrar. */
function hasRecords(point: EvolutionPoint): boolean {
  return point.state === 'com_registros' || point.state === 'em_andamento';
}

/**
 * "Conferi este mês" no painel: só o mês fechado, sem registros do valor mostrado, tem o botão (sem a marca) ou a frase com "Desfazer a
 * conferência" (zero confirmado). O mês em andamento e o mês com registros não têm nada disso. A linha do banco vira o plano de
 * `monthCheckPlan`, que decide o que aparece com e sem escrita.
 */
function evolutionCheckPlan(view: EvolutionView, point: EvolutionPoint, canWrite: boolean): MonthCheckPlan | null {
  if (point.month >= view.currentMonth || (point.state !== 'sem_registros' && point.state !== 'zero_confirmado')) return null;
  // A linha da leitura traz a versão da marca e as compras no cartão; sem ela (janela montada à mão), a linha zerada do ponto.
  const row: MonthOverview = view.rows.find((r) => r.month === point.month) ?? { month: point.month, receivedCount: 0, receivedCents: 0, paidCount: 0, paidCents: 0 };
  return monthCheckPlan(row, checkKindOf(view.metric), view.currentMonth, canWrite);
}

/**
 * O painel do mês escolhido (tela B). Não lê nada: as categorias vêm de `categoryBreakdown`, no app. `canWrite`: a pessoa escreve no
 * contexto (na Família, quem só lê vê a conferência, sem os botões); sem ele (padrão), o painel não oferece conferir nem desfazer.
 */
export function evolutionPanel(view: EvolutionView, month: IsoMonth, canWrite = false): EvolutionPanel {
  const point = view.points.find((p) => p.month === month) ?? view.points[view.points.length - 1]!;
  const at = view.points.indexOf(point);
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
    gapText: point.gap ? EVOLUTION_TEXT.gap.warning : null,
    check: evolutionCheckPlan(view, point, canWrite),
    previousMonth: view.points[at - 1]?.month ?? null,
    nextMonth: view.points[at + 1]?.month ?? null,
    variation: evolutionVariation(view, point.month),
    metric: view.metric,
    showsCategories: hasRecords(point),
    categoriesNote: view.metric === 'pago' ? T.categoriesNote : T.categoriesNoteReceived,
    showsCategoriesAction: view.metric === 'pago' && hasRecords(point),
    showsRecords: hasRecords(point),
    recordsHref: `/composicao?tipo=${view.metric === 'pago' ? 'pago' : 'recebido'}`,
    categoriesHref: '/composicao?tipo=pago&vista=categoria',
    explain: evolutionExplainPlan(view, point.month),
  };
}

/**
 * As maiores categorias do mês, para o painel: por valor, do maior para o menor (empate: nome), com "Sem categoria" entrando pelo
 * valor, como em "Seu mês em 30 segundos". `shares` é `categoryBreakdown` de Pago (a fatura já dividida) ou
 * `receivedCategoryBreakdown` de Recebido.
 */
export function evolutionTopCategories(shares: readonly CategoryShare[]): CategoryShare[] {
  return [...shares].sort((a, b) => b.cents - a.cents || a.label.localeCompare(b.label, 'pt-BR')).slice(0, EVOLUTION_TOP_CATEGORIES);
}

// ---------------------------------------------------------------------------------------------------------------------
// Entender o que mudou (fase 2: D06, D08 e D10)
// ---------------------------------------------------------------------------------------------------------------------

/**
 * O que a seção "Entender o que mudou" precisa saber antes de ler qualquer lançamento: se aparece, contra qual mês compara, os avisos
 * e as ações. Calculado da visão do gráfico (`months_overview`), sem ler nada.
 * - Não aparece (`visible` falso) quando o mês escolhido está sem registros ou é um zero confirmado (não há o que descrever por categoria).
 *   O mês de comparação tem registros, ou é um zero confirmado (que entra na comparação como zero): as categorias dele são vazias.
 * - Mês em andamento aparece, com o aviso de que os valores ainda podem mudar (a variação do painel não existe nele, mas a descrição sim).
 * - Mês com sinal de lacuna aparece, com o aviso (D10), tanto o escolhido quanto o de comparação.
 * - Sem outro mês antes na comparação (`baseMonth` nulo), só diz para escolher outro mês.
 */
export interface EvolutionExplainPlan {
  visible: boolean;
  metric: EvolutionMetric;
  /** O mês escolhido. */
  month: IsoMonth;
  /** O mês de comparação; null quando não há outro mês na comparação antes do escolhido. */
  baseMonth: IsoMonth | null;
  /** Recebido ou Pago do mês escolhido e do mês de comparação, como no gráfico. */
  cents: Cents;
  baseCents: Cents;
  /** "Escolha outro mês na comparação para ver o que mudou." quando não há mês de comparação; senão null. */
  unavailableText: string | null;
  /** Dica do botão que abre: "Compara abril com março"; null sem mês de comparação. */
  hint: string | null;
  /** Avisos, nesta ordem: mês em andamento, lacuna do mês escolhido e lacuna do mês de comparação. */
  notices: string[];
  /** "(março e maio não são meses vizinhos na comparação: abril está fora)" quando há mês fora entre os dois; senão null. */
  adjacencyText: string | null;
  /** "Comparar sem este mês" (ou "Voltar a comparar com este mês"): o mesmo interruptor do painel. Só no mês fechado com registros. */
  compare: { included: boolean; label: string; hint: string } | null;
  /** "Ver categorias" aparece (só em Pago, o único valor com Por categoria). */
  showsCategoriesAction: boolean;
}

/** O plano da seção "Entender o que mudou" para o mês escolhido. Não lê nada nem altera a visão. */
export function evolutionExplainPlan(view: EvolutionView, month: IsoMonth): EvolutionExplainPlan {
  const T = EVOLUTION_TEXT.explain;
  const selected = view.points.find((p) => p.month === month) ?? view.points[view.points.length - 1]!;
  const none: EvolutionExplainPlan = {
    visible: false,
    metric: view.metric,
    month: selected.month,
    baseMonth: null,
    cents: selected.cents,
    baseCents: 0,
    unavailableText: null,
    hint: null,
    notices: [],
    adjacencyText: null,
    compare: null,
    showsCategoriesAction: false,
  };
  if (selected.state === 'sem_registros' || selected.state === 'zero_confirmado') return none;
  const base = comparisonBase(view, selected);
  if (!base) return { ...none, visible: true, unavailableText: T.needOtherMonth };
  const { chosenOut, empty } = skippedMonths(view, base, selected);
  const notices = [
    ...(selected.state === 'em_andamento' ? [T.inProgress] : []),
    ...(selected.gap ? [EVOLUTION_TEXT.gap.warning] : []),
    ...(base.gap ? [T.gapIn(base.month)] : []),
  ];
  return {
    visible: true,
    metric: view.metric,
    month: selected.month,
    baseMonth: base.month,
    cents: selected.cents,
    baseCents: base.cents,
    unavailableText: null,
    hint: T.hint(base.month, selected.month),
    notices,
    adjacencyText: chosenOut.length + empty.length > 0 ? T.notAdjacent(base.month, selected.month, chosenOut, empty) : null,
    compare: selected.eligible ? { included: selected.included, label: selected.included ? T.compareWithout : T.compareWith, hint: T.compareHint } : null,
    showsCategoriesAction: view.metric === 'pago',
  };
}

export interface EvolutionExplanationCategory {
  key: string;
  label: string;
  /** "Casa: R$ 1.200,00 em março, R$ 5.600,00 em abril, R$ 4.400,00 a mais". */
  text: string;
}

export interface EvolutionExplanationRecord {
  key: string;
  description: string;
  /** "22/04/2026". */
  dateText: string;
  /** "R$ 4.400,00". */
  valueText: string;
  cents: Cents;
  /** "Parte do pagamento da fatura" quando o valor é só a parte da categoria; senão null. */
  partialText: string | null;
  /** "Reparo do carro · 22/04/2026 · R$ 4.400,00". */
  text: string;
  /** "Reparo do carro, 22/04/2026, R$ 4.400,00". */
  a11y: string;
}

/** A explicação pronta para mostrar: só texto e números já descritos, sem causa e sem julgamento. */
export interface EvolutionExplanation {
  /** "O Pago registrado foi R$ 4.500,00 maior em abril que em março." */
  headline: string;
  adjacencyText: string | null;
  notices: string[];
  categoriesTitle: string;
  categories: EvolutionExplanationCategory[];
  /** "Nenhuma categoria mudou de valor." quando a diferença é zero e nenhuma categoria mudou; senão null. */
  noChangeText: string | null;
  /** "Outras categorias também mudaram: R$ 100,00 a mais no total." (ou "a menos") quando as categorias mostradas não fecham a diferença; senão null. */
  othersText: string | null;
  related: { title: string; intro: string; rows: EvolutionExplanationRecord[]; emptyText: string | null } | null;
  /** Quando os lançamentos lidos não fecham com os totais: diz que não detalha por categoria (e não há categorias nem lançamentos). */
  limitation: string | null;
  note: string;
  /** O cálculo bruto, para quem precisar dos números. */
  change: ChangeExplanation;
}

/**
 * A explicação de "Entender o que mudou" a partir do plano e das partes por categoria dos dois meses (`paidCategoryParts` ou
 * `receivedCategoryParts`, os mesmos registros e as mesmas regras do Resumo; o pagamento de fatura vem dividido e estorno no cartão já
 * abateu a fatura). Determinística. Os totais vêm do gráfico (`plan.cents` e `plan.baseCents`), então a frase principal é a mesma
 * diferença da variação. Lança RangeError sem mês de comparação ou se os lados não são os meses do plano.
 */
export function evolutionExplanation(plan: EvolutionExplainPlan, baseParts: ChangeSide['parts'], parts: ChangeSide['parts']): EvolutionExplanation {
  const T = EVOLUTION_TEXT.explain;
  if (!plan.visible || plan.baseMonth === null) throw new RangeError('sem mês de comparação');
  const from = plan.baseMonth;
  const to = plan.month;
  const change = explainChange({ month: from, totalCents: plan.baseCents, parts: baseParts }, { month: to, totalCents: plan.cents, parts });
  const headline = T.headline(plan.metric, change.differenceCents, from, to);
  const base = { headline, adjacencyText: plan.adjacencyText, notices: plan.notices, categoriesTitle: T.categoriesTitle, note: T.note, change };
  if (!change.reconciled) {
    return { ...base, categories: [], noChangeText: null, othersText: null, related: null, limitation: T.limitation };
  }
  const categories = change.categories.map((c): EvolutionExplanationCategory => ({
    key: c.category ?? '\u0000sem-categoria',
    label: c.label,
    text: T.category(plan.metric, c.label, c.fromCents, c.toCents, from, to),
  }));
  const leading = change.categories[0];
  const related = leading
    ? {
        title: T.relatedTitle,
        intro: T.relatedIntro(leading.label, to),
        rows: change.related.map((r): EvolutionExplanationRecord => ({
          key: r.id,
          description: r.description,
          dateText: formatDateBR(r.occurredOn),
          valueText: formatBRL(r.cents),
          cents: r.cents,
          partialText: r.partial ? T.partOfInvoice : null,
          text: T.relatedRow(r.description, r.occurredOn, r.cents),
          a11y: T.relatedRowA11y(r.description, r.occurredOn, r.cents, r.partial),
        })),
        emptyText: change.related.length === 0 ? T.relatedEmpty(leading.label, to) : null,
      }
    : null;
  return {
    ...base,
    categories,
    noChangeText: categories.length === 0 && change.differenceCents === 0 ? T.noCategoryChange : null,
    othersText: change.otherCents !== 0 ? T.others(change.otherCents) : null,
    related,
    limitation: null,
  };
}

/** Frase do anúncio ao tirar ou pôr um mês na comparação (média, mediana e "n de N meses"; nunca média zero). */
export function evolutionAnnouncement<M extends EvolutionSelectionMetric>(view: EvolutionView<M>): string {
  const s = view.stats;
  return view.averageText === null || view.medianText === null || s.average === null || s.median === null
    ? EVOLUTION_TEXT.stats.announceNone
    : EVOLUTION_TEXT.stats.announceText(view.averageText, view.medianText, s.visibleCount, s.eligibleCount);
}

// ---------------------------------------------------------------------------------------------------------------------
// Sinal de lacuna em mês fechado (D04, segunda metade)
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Os meses fechados de `from` a `to` com sinal de lacuna em Pago: junta os números de gasto fixo, parcelamento e conta do ano sem conta
 * registrada (`seriesGapsInRange`, o mesmo sinal de "Seus últimos meses") às contas em aberto vencidas nesses meses. É um aviso de
 * que pode faltar um gasto, nunca uma conta: nada aqui muda média, mediana, total nem variação. `commitments`:
 * `listCommitmentsDueBetween(from, to)`, abertas e pagas. Meses em ordem, sem repetir; vazio com from depois de to.
 * Uma série com `serie_inconsistente` (sem vigência no primeiro número) é pulada: sem ela, o aviso só some, nunca inventa mês. Outro
 * erro continua sendo lançado.
 */
export function evolutionGapMonths(
  series: readonly CommitmentSeries[],
  commitments: readonly Commitment[],
  from: IsoMonth,
  to: IsoMonth,
): IsoMonth[] {
  if (from > to) return [];
  const months = new Set<IsoMonth>();
  for (const s of series) {
    try {
      for (const row of seriesGapsInRange(s, commitments, from, to)) months.add(row.month);
    } catch (e) {
      if (!(e instanceof Error) || e.message !== 'serie_inconsistente') throw e;
    }
  }
  for (const c of commitments) {
    const month = monthOf(c.dueOn);
    if (c.status === 'aberto' && month >= from && month <= to) months.add(month);
  }
  return [...months].sort();
}

/**
 * Leitura do sinal de lacuna da Evolução: `listSeries` e `listCommitmentsDueBetween` dos meses fechados dos últimos 12 (do mês mais
 * antigo da leitura até o mês anterior ao atual), como `loadReturnReview` lê para a revisão. Chame depois de `syncSeriesOccurrences`
 * dar certo: sem ela, uma conta que a geração ainda vai criar apareceria como lacuna. Quem chama trata a falha da leitura mostrando o
 * gráfico sem o aviso.
 */
export async function loadEvolutionGaps(
  repo: Pick<RecordsRepository, 'listSeries' | 'listCommitmentsDueBetween'>,
  contextId: string,
  currentMonth: IsoMonth,
): Promise<IsoMonth[]> {
  const from = evolutionFetchRange(currentMonth).from;
  const to = addMonths(currentMonth, -1);
  const [series, commitments] = await Promise.all([repo.listSeries(contextId), repo.listCommitmentsDueBetween(contextId, from, to)]);
  return evolutionGapMonths(series, commitments, from, to);
}

// ---------------------------------------------------------------------------------------------------------------------
// Fase 3 (D-062 item 4): Renda comprometida e Guardado em metas
// ---------------------------------------------------------------------------------------------------------------------

/**
 * A base de cada valor, escrita no subtítulo da tela: a de Recebido e Pago é a de sempre ("Valores registrados, pela data do pagamento");
 * a dos valores da fase 3 é a própria, e eles dizem que só entram meses já fechados.
 */
export function evolutionSubtitle(metric: EvolutionSelectionMetric): { base: string; note: string | null } {
  return isPhase3Metric(metric)
    ? { base: EVOLUTION_TEXT.phase3.subtitle[metric], note: EVOLUTION_TEXT.phase3.closedOnly }
    : { base: EVOLUTION_TEXT.subtitle, note: null };
}

/** O estado do mês na fase 3, dito no painel. */
function phase3StateText(metric: EvolutionPhase3Metric, state: EvolutionPointState): string {
  const T = EVOLUTION_TEXT.phase3.state;
  if (metric === 'comprometida') {
    if (state === 'com_registros') return T.comprometida.com_registros;
    if (state === 'sem_base') return T.comprometida.sem_base;
    if (state === 'em_andamento') return T.comprometida.em_andamento;
    return T.comprometida.sem_registros;
  }
  if (state === 'com_registros') return T.guardado.com_registros;
  if (state === 'zero_confirmado') return T.guardado.zero_confirmado;
  if (state === 'em_andamento') return T.guardado.em_andamento;
  return T.guardado.sem_registros;
}

/** O que o mês é, em poucas palavras, no nome acessível do ponto. */
function phase3PointName(point: Phase3Point, participation: EvolutionParticipation): string {
  const T = EVOLUTION_TEXT.participation;
  const parts = [formatMonthBR(point.month)];
  if (point.state === 'com_registros' || point.state === 'zero_confirmado') parts.push(point.valueText ?? '');
  else parts.push(point.state === 'sem_base' ? T.noBase : point.state === 'em_andamento' ? T.inProgress : T.noRecords);
  if (point.state === 'zero_confirmado') parts.push(T.zeroSaved);
  parts.push(participation === 'na_comparacao' ? T.included : T.excluded);
  return parts.join(', ');
}

export interface Phase3ViewInput {
  metric: EvolutionPhase3Metric;
  /** Um ponto por mês da janela, de `committedEvolutionPoints` ou de `savingsEvolutionPoints`. */
  points: readonly Phase3Point[];
  windowMonths: EvolutionWindow;
  currentMonth: IsoMonth;
  /** Meses que a pessoa tirou da comparação deste valor. */
  hiddenMonths: Iterable<IsoMonth>;
}

/**
 * Tudo o que a tela mostra para a Renda comprometida ou o Guardado em metas na janela escolhida (D-062 item 4). Só meses fechados têm valor:
 * o mês em andamento aparece no eixo, sem valor, e nunca entra nas contas. Mês sem base (Renda comprometida sem renda de referência) e mês
 * sem registros ficam à vista no eixo, rotulados e fora da média e da mediana, nunca como zero. A média e a mediana valem para os dois
 * (percentual em milésimos, metade para cima); o total só existe no Guardado em metas. `points` precisa ter exatamente os meses da janela;
 * ponto do mês atual com valor lança RangeError (nada de previsão). Não altera o que recebe.
 */
export function buildPhase3View(input: Phase3ViewInput): EvolutionView<EvolutionPhase3Metric> {
  const { metric, windowMonths, currentMonth } = input;
  const months = evolutionMonths(currentMonth, windowMonths);
  const byMonth = new Map(input.points.map((p) => [p.month, p] as const));
  if (input.points.length !== months.length || months.some((m) => !byMonth.has(m))) throw new RangeError('os pontos não são os meses da janela');
  const ordered = months.map((m) => byMonth.get(m)!);
  const current = ordered[ordered.length - 1]!;
  if (current.state !== 'em_andamento' || current.valueText !== null || current.cents !== 0) throw new RangeError('o mês atual não tem valor: só meses fechados');
  const hidden = new Set(input.hiddenMonths);
  const stats = comparisonStats(ordered, hidden);
  const inWindow = new Set(months);
  const outsideMonths = [...hidden].filter((m) => !inWindow.has(m)).sort();
  const T = EVOLUTION_TEXT;
  const views = ordered.map((p): EvolutionPointView => {
    const participation = participationOf(p.state, hidden.has(p.month));
    const hasValue = p.state === 'com_registros' || p.state === 'zero_confirmado';
    return {
      month: p.month,
      cents: p.cents,
      count: p.count,
      state: p.state,
      participation,
      hasValue,
      included: participation === 'na_comparacao',
      eligible: hasValue,
      title: formatMonthBR(p.month),
      shortLabel: formatMonthName(p.month).slice(0, 3),
      valueText: hasValue ? p.valueText : null,
      stateText: phase3StateText(metric, p.state),
      stateLabel: T.phase3.stateLabel[p.state],
      includedText: participation === 'na_comparacao' ? T.table.yes : T.table.out,
      gap: false,
      name: phase3PointName(p, participation),
    };
  });
  const unit: EvolutionUnit = metric === 'comprometida' ? 'permille' : 'cents';
  const total = Number(stats.canonicalTotal);
  if (!Number.isSafeInteger(total)) throw new RangeError('total grande demais');
  const text = (value: number | null): string | null => (value === null ? null : unit === 'permille' ? formatPermille(value, 1) : formatBRL(value));
  const situation: EvolutionSituation =
    stats.eligibleCount === 0 ? 'sem_registros' : stats.visibleCount === 0 ? 'todos_fora' : stats.visibleCount === 1 ? 'um_mes' : 'normal';
  return {
    metric,
    unit,
    windowMonths,
    from: months[0]!,
    to: months[months.length - 1]!,
    currentMonth,
    points: views,
    rows: [],
    stats,
    averageText: text(stats.average),
    medianText: text(stats.median),
    outCount: stats.hiddenMonths.length,
    eligibleCount: stats.eligibleCount,
    outsideMonths,
    situation,
    totalCents: unit === 'permille' ? null : total,
    maxCents: views.reduce((max, p) => (p.hasValue ? Math.max(max, p.cents) : max), 0),
    minCents: views.reduce((min, p) => (p.hasValue ? Math.min(min, p.cents) : min), 0),
  };
}

/** O painel do mês escolhido na fase 3: o mês, o valor (ou o motivo de não ter), o estado, o interruptor e o aviso de que "Entender o que mudou" é de Recebido e Pago. */
export interface Phase3Panel {
  month: IsoMonth;
  /** "Abril de 2026". */
  title: string;
  metric: EvolutionPhase3Metric;
  /** "Renda comprometida" ou "Guardado em metas". */
  valueCaption: string;
  /** "52,5%" ou "R$ 200,00"; null sem valor (então `noValueText` diz por quê). */
  valueText: string | null;
  /** "Sem base", "Sem registros" ou "Mês em andamento", no lugar do valor; null com valor. */
  noValueText: string | null;
  cents: number;
  unit: EvolutionUnit;
  state: EvolutionPointState;
  stateText: string;
  /** A base da conta, a mesma do subtítulo da tela. */
  baseText: string;
  /** Só o mês fechado com valor tem o interruptor. */
  canToggle: boolean;
  included: boolean;
  /** "Tirar da comparação não apaga nem muda nenhuma conta, meta ou lançamento." */
  switchCaption: string;
  /** Frase no lugar do interruptor quando o mês nunca entra na comparação. */
  notEligibleText: string | null;
  previousMonth: IsoMonth | null;
  nextMonth: IsoMonth | null;
  /** "Entender o que mudou" e a frase "Disponível para Recebido e Pago" (a explicação não se aplica a estes valores nesta fase). */
  explainTitle: string;
  explainNote: string;
}

/** O painel do mês `month` (ou o último da janela, se não estiver nela). Não lê nada. */
export function phase3Panel(view: EvolutionView<EvolutionPhase3Metric>, month: IsoMonth): Phase3Panel {
  const point = view.points.find((p) => p.month === month) ?? view.points[view.points.length - 1]!;
  const at = view.points.indexOf(point);
  const T = EVOLUTION_TEXT;
  const noValueText = point.hasValue ? null : point.state === 'sem_base' ? T.phase3.noValue.sem_base : point.state === 'em_andamento' ? T.phase3.noValue.em_andamento : T.phase3.noValue.sem_registros;
  return {
    month: point.month,
    title: point.title,
    metric: view.metric,
    valueCaption: T.panel.valueCaption(view.metric),
    valueText: point.valueText,
    noValueText,
    cents: point.cents,
    unit: view.unit,
    state: point.state,
    stateText: point.stateText,
    baseText: T.phase3.subtitle[view.metric],
    canToggle: point.eligible,
    included: point.included,
    switchCaption: T.phase3.switchCaption,
    notEligibleText: point.state === 'em_andamento' ? T.panel.notEligible.em_andamento : point.state === 'sem_base' ? T.panel.notEligible.sem_base : point.state === 'sem_registros' ? T.panel.notEligible.sem_registros : null,
    previousMonth: view.points[at - 1]?.month ?? null,
    nextMonth: view.points[at + 1]?.month ?? null,
    explainTitle: T.phase3.explainTitle,
    explainNote: T.phase3.explainNote,
  };
}

/** O que a tela diz quando nenhum mês fechado da janela tem valor, e a ação que leva a criar a base (só com escrita). */
export interface Phase3Empty {
  title: string;
  body: string;
  /** A ação: a renda de referência, uma conta a pagar ou uma meta; null sem escrita no contexto (quem só lê não vê o botão). */
  action: { kind: 'referencia' | 'conta' | 'meta'; label: string } | null;
}

/**
 * Tela sem mês fechado com valor (situação 'sem_registros' da fase 3). Na Renda comprometida, "Sem base" quando nenhum mês fechado tem
 * renda de referência, e "Sem registros" quando há renda mas nenhuma conta anotada. No Guardado em metas, "Sem registros" (nenhuma meta
 * ativa anotada). `canWrite`: quem só lê (Família) não recebe o botão.
 */
export function phase3Empty(view: EvolutionView<EvolutionPhase3Metric>, canWrite: boolean): Phase3Empty {
  const T = EVOLUTION_TEXT.phase3.empty;
  if (view.metric === 'guardado') {
    return { title: T.noRecordsTitle, body: T.savingsBody, action: canWrite ? { kind: 'meta', label: T.savingsAction } : null };
  }
  const closed = view.points.filter((p) => p.month < view.currentMonth);
  const withBase = closed.some((p) => p.state !== 'sem_base');
  return withBase
    ? { title: T.noRecordsTitle, body: T.noRecordsBody, action: canWrite ? { kind: 'conta', label: T.noRecordsAction } : null }
    : { title: T.noBaseTitle, body: T.noBaseBody, action: canWrite ? { kind: 'referencia', label: T.noBaseAction } : null };
}

// ---------------------------------------------------------------------------------------------------------------------
// Memória dos meses fora da comparação (D03)
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Meses que a pessoa tirou da comparação, só na memória do app (D03): por pessoa, por contexto (Pessoal ou Família) e por
 * métrica (Recebido, Pago, Renda comprometida e Guardado em metas), de modo que nenhum herda a seleção de outro (T13, EF-14). Nunca vai ao aparelho nem ao servidor e
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

  private key(scope: string, metric: EvolutionSelectionMetric): string {
    return `${scope}|${metric}`;
  }

  /** Os meses tirados nesta métrica. A mesma referência enquanto nada muda (serve de snapshot para a tela). */
  get(scope: string | null, metric: EvolutionSelectionMetric): ReadonlySet<IsoMonth> {
    return (scope && this.sets.get(this.key(scope, metric))) || EvolutionSelectionStore.EMPTY;
  }

  /** Tira (hidden true) ou devolve (false) um mês da comparação desta métrica. */
  setHidden(scope: string, metric: EvolutionSelectionMetric, month: IsoMonth, hidden: boolean): void {
    const current = this.get(scope, metric);
    if (current.has(month) === hidden) return;
    const next = new Set(current);
    if (hidden) next.add(month);
    else next.delete(month);
    this.write(scope, metric, next);
  }

  /** "Restaurar todos": só desta métrica. */
  restoreAll(scope: string, metric: EvolutionSelectionMetric): void {
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

  private write(scope: string, metric: EvolutionSelectionMetric, next: ReadonlySet<IsoMonth>): void {
    if (next.size === 0) this.sets.delete(this.key(scope, metric));
    else this.sets.set(this.key(scope, metric), next);
    this.emit();
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
