import type { BudgetSummary } from './budget';
import { BUDGET_TEXT } from './budget';
import { CARDS_TEXT } from './cards';
import type { CommittedProjection } from './committed';
import { COMMITTED_TEXT } from './committed';
import type { IsoMonth } from './dates';
import { addMonths, formatDateBR, formatMonthYearBR, isValidIsoMonth } from './dates';
import { EVOLUTION_TEXT, evolutionVariation, type EvolutionView } from './evolucao-tela';
import { formatBRL, type Cents } from './money';
import { PAYABLES_FIRST_MONTH, payablesMonthParams } from './navigation';
import type { CategoryPart, CategoryShare } from './summary';

/**
 * Análises (D-059): uma tela de consulta, em Movimentos, que reúne quatro leituras do mês escolhido: Categorias (completa aqui, em
 * barras ou em bolhas), Evolução, Próximos meses e Orçamento (estas três mostram um resumo curto e levam à tela completa que já
 * existe). Não há regra financeira nova, nem função no banco, nem gravação: tudo é conta sobre o que o app já leu (`categoryBreakdown`,
 * `monthsOverview`, `projectCommitted`, `summarizeBudget`). Sem julgamento: só fatos, com nome e percentual escritos (nunca só cor).
 *
 * - Categorias usa os mesmos números de "Por categoria" do Pago (maior resto, fatura paga dividida pelas categorias dela, sem dupla
 *   contagem). As bolhas têm a área proporcional ao valor (raio pela raiz), com um tamanho mínimo legível, e o arranjo é uma conta
 *   determinística para uma lista de valores e uma largura (`layoutBubbles`): nenhuma bolha toca outra.
 * - A escolha "Barras | Bolhas" fica só no aparelho (`DevicePrefs.categoryView`), sem banco.
 */

export const ANALYSES_ROUTE = '/analises';

// ---------------------------------------------------------------------------------------------------------------------
// Abas e mês da tela
// ---------------------------------------------------------------------------------------------------------------------

/** As quatro abas internas, na ordem da tela. */
export const ANALYSES_TABS = ['categorias', 'evolucao', 'proximos-meses', 'orcamento'] as const;
export type AnalysesTab = (typeof ANALYSES_TABS)[number];
export const ANALYSES_DEFAULT_TAB: AnalysesTab = 'categorias';

export function isAnalysesTab(value: unknown): value is AnalysesTab {
  return (ANALYSES_TABS as readonly unknown[]).includes(value);
}

/** Aba com que a tela abre: a do endereço (`?aba=`) se existir; senão, Categorias. */
export function analysesTabFrom(param: string | string[] | undefined): AnalysesTab {
  const value = Array.isArray(param) ? param[0] : param;
  return isAnalysesTab(value) ? value : ANALYSES_DEFAULT_TAB;
}

/** A aba que uma tecla do teclado escolhe: setas (com volta ao outro extremo), Home e End. Outra tecla: null. */
export function analysesTabForKey(current: AnalysesTab, key: string): AnalysesTab | null {
  const last = ANALYSES_TABS.length - 1;
  const at = ANALYSES_TABS.indexOf(current);
  if (key === 'ArrowRight' || key === 'ArrowDown') return ANALYSES_TABS[at === last ? 0 : at + 1]!;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return ANALYSES_TABS[at === 0 ? last : at - 1]!;
  if (key === 'Home') return ANALYSES_TABS[0]!;
  if (key === 'End') return ANALYSES_TABS[last]!;
  return null;
}

/** Mês dentro do que o seletor oferece: do mais antigo ao mês de hoje (não há análise de um mês que ainda não começou). */
export function isAnalysesMonth(month: unknown, currentMonth: IsoMonth): month is IsoMonth {
  return typeof month === 'string' && isValidIsoMonth(month) && month >= PAYABLES_FIRST_MONTH && month <= currentMonth;
}

/** Mês com que a tela abre: o do endereço (`?mes=AAAA-MM`) se estiver entre o mais antigo e o mês de hoje; senão, o mês de hoje. */
export function analysesStartMonth(param: string | string[] | undefined, currentMonth: IsoMonth): IsoMonth {
  const value = Array.isArray(param) ? param[0] : param;
  return isAnalysesMonth(value, currentMonth) ? value : currentMonth;
}

/** Mês vizinho no seletor da tela, ou null no limite (o botão fica desativado). */
export function analysesStep(month: IsoMonth, currentMonth: IsoMonth, delta: 1 | -1): IsoMonth | null {
  const next = addMonths(month, delta);
  return isAnalysesMonth(next, currentMonth) ? next : null;
}

/** `?mes=` só quando o mês não é o de hoje (o padrão da tela). */
export function analysesParams(month: IsoMonth, currentMonth: IsoMonth): { mes?: IsoMonth } {
  return month === currentMonth ? {} : { mes: month };
}

// ---------------------------------------------------------------------------------------------------------------------
// Barras | Bolhas
// ---------------------------------------------------------------------------------------------------------------------

export const CATEGORY_VIEWS = ['barras', 'bolhas'] as const;
export type CategoryView = (typeof CATEGORY_VIEWS)[number];
/** Barras é o padrão: a comparação mais precisa. */
export const DEFAULT_CATEGORY_VIEW: CategoryView = 'barras';

export function isCategoryView(value: unknown): value is CategoryView {
  return (CATEGORY_VIEWS as readonly unknown[]).includes(value);
}

/** Uma categoria como chave de seleção: a de nome tem "c:" na frente; "Sem categoria" tem a sua. Nunca confunde uma com a outra. */
export const NO_CATEGORY_KEY = 'sem-categoria';
export function categoryKey(category: string | null): string {
  return category === null ? NO_CATEGORY_KEY : `c:${category}`;
}

/** Nome acessível da bolha e da barra: "Mercado, 23,4%, R$ 920,00". */
export function categoryAccessibleName(share: Pick<CategoryShare, 'label' | 'percentText' | 'cents'>): string {
  return `${share.label}, ${share.percentText}, ${formatBRL(share.cents)}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Bolhas: o arranjo (puro e determinístico)
// ---------------------------------------------------------------------------------------------------------------------

/** Folga mínima entre duas bolhas, em px. */
export const BUBBLE_GAP = 8;
/** Margem até a borda da área, em px (cabe o contorno). */
export const BUBBLE_PAD = 2;
/** Raio mínimo legível, em px (76 px de diâmetro): cabe "Transporte" e o percentual, em duas linhas. */
export const BUBBLE_MIN_RADIUS = 38;
/** Raio da maior bolha: no máximo 30% da largura e nunca mais que 88 px. */
export const BUBBLE_MAX_RADIUS = 88;
export const BUBBLE_MAX_FRACTION = 0.3;
/** Quanto da área o conjunto de bolhas ocupa, no máximo, ao calcular o tamanho da maior. */
const BUBBLE_FILL = 0.55;
/** A letra grande do sistema aumenta as bolhas, até este limite. */
export const BUBBLE_MAX_SCALE = 1.5;

export interface Bubble {
  /** Posição do valor na lista que entrou. */
  index: number;
  value: number;
  /** Centro e raio em px, na área de `width` por `height`. */
  cx: number;
  cy: number;
  r: number;
  /** O raio foi levado ao mínimo (a área deixa de ser proporcional): o percentual escrito é o que vale. */
  atMinimum: boolean;
}

export interface BubbleLayout {
  width: number;
  height: number;
  bubbles: Bubble[];
  minRadius: number;
  maxRadius: number;
}

export interface BubbleOptions {
  /** Escala da letra do sistema (1 a 1,5): aumenta o raio mínimo e o tamanho das letras. */
  scale?: number;
}

function clampScale(scale: number | undefined): number {
  return typeof scale === 'number' && Number.isFinite(scale) ? Math.min(BUBBLE_MAX_SCALE, Math.max(1, scale)) : 1;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const EPS = 1e-6;

interface Circle {
  x: number;
  y: number;
  r: number;
}

/** Posições onde um círculo de raio `r` encosta (com a folga) nas paredes e nos círculos já postos. */
function candidates(placed: readonly Circle[], r: number, width: number): [number, number][] {
  const left = BUBBLE_PAD + r;
  const right = width - BUBBLE_PAD - r;
  const top = BUBBLE_PAD + r;
  const out: [number, number][] = [
    [left, top],
    [right, top],
  ];
  for (const c of placed) {
    const d = c.r + r + BUBBLE_GAP;
    for (const x of [left, right]) {
      const dx = x - c.x;
      if (Math.abs(dx) <= d) {
        const dy = Math.sqrt(d * d - dx * dx);
        out.push([x, c.y - dy], [x, c.y + dy]);
      }
    }
    const dy = top - c.y;
    if (Math.abs(dy) <= d) {
      const dx = Math.sqrt(d * d - dy * dy);
      out.push([c.x - dx, top], [c.x + dx, top]);
    }
  }
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i]!;
      const b = placed[j]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const r1 = a.r + r + BUBBLE_GAP;
      const r2 = b.r + r + BUBBLE_GAP;
      if (dist < EPS || dist > r1 + r2 || dist < Math.abs(r1 - r2)) continue;
      const along = (r1 * r1 - r2 * r2 + dist * dist) / (2 * dist);
      const h2 = r1 * r1 - along * along;
      if (h2 < 0) continue;
      const h = Math.sqrt(h2);
      const mx = a.x + (dx * along) / dist;
      const my = a.y + (dy * along) / dist;
      out.push([mx + (h * dy) / dist, my - (h * dx) / dist], [mx - (h * dy) / dist, my + (h * dx) / dist]);
    }
  }
  return out;
}

/** Põe os círculos, um a um, na posição livre mais alta (empate: a mais à esquerda). Sempre devolve um arranjo sem sobreposição. */
function pack(radii: readonly number[], width: number): Circle[] {
  const placed: Circle[] = [];
  for (const r of radii) {
    const left = BUBBLE_PAD + r;
    const right = width - BUBBLE_PAD - r;
    const top = BUBBLE_PAD + r;
    const free = candidates(placed, r, width).filter(
      ([x, y]) =>
        x >= left - EPS && x <= right + EPS && y >= top - EPS && placed.every((c) => Math.hypot(x - c.x, y - c.y) >= c.r + r + BUBBLE_GAP - EPS),
    );
    if (free.length === 0) {
      // Sem posição encostada: logo abaixo de tudo, que nunca encosta em ninguém.
      const bottom = placed.reduce((m, c) => Math.max(m, c.y + c.r), BUBBLE_PAD);
      placed.push({ x: left, y: bottom + BUBBLE_GAP + r, r });
      continue;
    }
    free.sort((p, q) => (Math.abs(p[1] - q[1]) > 1e-4 ? p[1] - q[1] : Math.abs(p[0] - q[0]) > 1e-4 ? p[0] - q[0] : 0));
    const [x, y] = free[0]!;
    placed.push({ x, y, r });
  }
  return placed;
}

/**
 * O arranjo das bolhas para uma lista de valores e uma largura em px. Função pura: os mesmos valores e a mesma largura dão sempre as
 * mesmas posições e os mesmos raios.
 * - Valor zero, negativo ou que não é número fica de fora (não há bolha de área zero); `index` guarda o lugar do valor na lista.
 * - A área é proporcional ao valor (raio pela raiz do valor, a maior bolha com `maxRadius`); o raio nunca fica abaixo do mínimo legível
 *   (`atMinimum`), e nenhuma bolha passa da largura.
 * - As bolhas são postas na ordem da lista (a lista vem do maior para o menor): cada uma na posição livre mais alta, encostada
 *   nas paredes ou nas outras com `BUBBLE_GAP` de folga, e o conjunto é centralizado na largura. Nenhuma bolha toca outra.
 */
export function layoutBubbles(values: readonly number[], width: number, options: BubbleOptions = {}): BubbleLayout {
  const scale = clampScale(options.scale);
  const fit = Number.isFinite(width) && width > 0 ? (width - 2 * BUBBLE_PAD) / 2 : 0;
  const minRadius = Math.min(BUBBLE_MIN_RADIUS * scale, fit);
  const items = values.map((value, index) => ({ value, index })).filter(({ value }) => Number.isFinite(value) && value > 0);
  const ceiling = Math.min(Math.max(minRadius + 8, Math.min(width * BUBBLE_MAX_FRACTION, BUBBLE_MAX_RADIUS * scale)), fit);
  if (items.length === 0 || fit <= 0) return { width: Math.max(0, width || 0), height: 0, bubbles: [], minRadius, maxRadius: ceiling };
  const top = Math.max(...items.map((i) => i.value));
  // A maior bolha também não passa do que o conjunto pede: com muitos valores parecidos, as bolhas encolhem para caber lado a lado
  // (a área total é cerca de 55% de uma área de `width` por 1,1 × `width`), sem nunca ficar abaixo do mínimo mais 8 px.
  const total = items.reduce((sum, i) => sum + i.value, 0);
  const wanted = Math.sqrt((BUBBLE_FILL * width * width * 1.1 * top) / (Math.PI * total));
  const maxRadius = Math.min(ceiling, Math.max(minRadius + 8, wanted), fit);
  const radii = items.map(({ value }) => Math.min(fit, Math.max(minRadius, maxRadius * Math.sqrt(value / top))));
  const circles = pack(radii, width);
  // Centraliza o conjunto na largura (deslocar para o lado nunca cria sobreposição nem passa das paredes).
  const minX = Math.min(...circles.map((c) => c.x - c.r));
  const maxX = Math.max(...circles.map((c) => c.x + c.r));
  const shift = (width - (maxX - minX)) / 2 - minX;
  const bubbles = circles.map((c, k): Bubble => {
    const item = items[k]!;
    return {
      index: item.index,
      value: item.value,
      cx: round2(c.x + shift),
      cy: round2(c.y),
      r: round2(c.r),
      atMinimum: maxRadius * Math.sqrt(item.value / top) < minRadius,
    };
  });
  const height = Math.ceil(Math.max(...circles.map((c) => c.y + c.r)) + BUBBLE_PAD);
  return { width, height, bubbles, minRadius: round2(minRadius), maxRadius: round2(maxRadius) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Bolhas: o nome e o percentual dentro de cada uma
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Largura estimada de um texto em Manrope Bold, em múltiplos do tamanho da letra. Conta letras estreitas (i, j, l, t, f, r), largas
 * (m, w), maiúsculas, dígitos, vírgula e o sinal de %, com 6% de folga. O roteiro web confere nas bolhas desenhadas se o texto cabe.
 */
export function labelWidthEm(text: string): number {
  let em = 0;
  for (const ch of text) {
    if (ch === ' ' || ch === ',' || ch === '.') em += 0.3;
    else if (ch === '%') em += 0.88;
    else if (ch >= '0' && ch <= '9') em += 0.62;
    else if ('mwMW'.includes(ch)) em += 0.92;
    else if ('ijltfr'.includes(ch)) em += 0.34;
    else if (ch !== ch.toLowerCase()) em += 0.7;
    else em += 0.58;
  }
  return em * 1.06;
}

/** Tamanhos de letra tentados, do maior para o menor, em px (multiplicados pela escala). */
export const BUBBLE_FONT_SIZES = [13, 12, 11] as const;
export const BUBBLE_LINE_HEIGHT = 1.15;

export interface BubbleLabel {
  /** As linhas do nome (uma ou duas) e, por último, o percentual. */
  lines: string[];
  fontSize: number;
  lineHeight: number;
}

/** A linha cabe no círculo? O ponto mais longe do centro é a borda da caixa da linha, não o meio dela. */
function lineFits(widthEm: number, fontSize: number, offset: number, lineHeight: number, radius: number): boolean {
  const reach = Math.abs(offset) + lineHeight / 2;
  return reach < radius && (widthEm * fontSize) / 2 <= Math.sqrt(radius * radius - reach * reach) - 2;
}

/** O nome inteiro numa linha e, com mais de uma palavra, a divisão em duas linhas que deixa a mais larga a mais estreita possível. */
function nameVariants(name: string): string[][] {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const variants: string[][] = [[words.join(' ')]];
  if (words.length > 1) {
    let best: string[] = [];
    let bestWidth = Infinity;
    for (let i = 1; i < words.length; i++) {
      const pair = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
      const width = Math.max(labelWidthEm(pair[0]!), labelWidthEm(pair[1]!));
      if (width < bestWidth - 1e-9) {
        best = pair;
        bestWidth = width;
      }
    }
    variants.push(best);
  }
  return variants;
}

/** Corta o texto até caber em `maxEm`, com reticências. */
function truncateToWidth(text: string, maxEm: number): string {
  if (labelWidthEm(text) <= maxEm) return text;
  const chars = [...text];
  while (chars.length > 0 && labelWidthEm(`${chars.join('').trimEnd()}…`) > maxEm) chars.pop();
  return `${chars.join('').trimEnd()}…`;
}

/**
 * O nome e o percentual dentro de uma bolha de raio `radius` (px): o maior tamanho de letra em que o nome cabe (numa linha ou em duas)
 * junto do percentual. Se nem o menor tamanho serve (nome muito comprido), o nome é cortado com reticências; o nome inteiro continua no
 * nome acessível e no cartão da categoria.
 */
export function fitBubbleLabel(name: string, percentText: string, radius: number, scale = 1): BubbleLabel {
  const s = clampScale(scale);
  const variants = nameVariants(name);
  for (const base of BUBBLE_FONT_SIZES) {
    const fontSize = base * s;
    const lineHeight = fontSize * BUBBLE_LINE_HEIGHT;
    for (const nameLines of variants) {
      const lines = [...nameLines, percentText];
      const n = lines.length;
      if (lines.every((text, k) => lineFits(labelWidthEm(text), fontSize, (k - (n - 1) / 2) * lineHeight, lineHeight, radius))) {
        return { lines, fontSize: round2(fontSize), lineHeight: round2(lineHeight) };
      }
    }
  }
  const fontSize = BUBBLE_FONT_SIZES[BUBBLE_FONT_SIZES.length - 1]! * s;
  const lineHeight = fontSize * BUBBLE_LINE_HEIGHT;
  const nameLines = variants[variants.length - 1]!;
  const n = nameLines.length + 1;
  const cut = nameLines.map((text, k) => {
    const reach = Math.abs(k - (n - 1) / 2) * lineHeight + lineHeight / 2;
    const half = reach < radius ? Math.sqrt(radius * radius - reach * reach) - 2 : 0;
    return truncateToWidth(text, Math.max(0, (2 * half) / fontSize));
  });
  return { lines: [...cut, percentText], fontSize: round2(fontSize), lineHeight: round2(lineHeight) };
}

export interface CategoryBubble extends Bubble {
  /** `categoryKey` da categoria. */
  key: string;
  /** O nome inteiro ("Mercado", "Sem categoria"). */
  label: string;
  cents: Cents;
  /** "23,4%" (a soma de todas é 100,0%, pelo maior resto, de `categoryBreakdown`). */
  percentText: string;
  /** O que está escrito dentro da bolha. */
  lines: string[];
  fontSize: number;
  lineHeight: number;
  /** "Mercado, 23,4%, R$ 920,00". */
  a11yLabel: string;
}

export interface CategoryBubbleLayout {
  width: number;
  height: number;
  bubbles: CategoryBubble[];
  /** Alguma bolha está no tamanho mínimo: a legenda diz que o percentual escrito é o que vale. */
  anyAtMinimum: boolean;
}

/**
 * As bolhas de "Pago por categoria": o arranjo de `layoutBubbles` sobre o valor de cada categoria de `categoryBreakdown`, com o nome
 * e o percentual escritos dentro de cada uma. Categoria com valor zero fica de fora (a barra continua mostrando-a).
 */
export function categoryBubbles(shares: readonly CategoryShare[], width: number, scale = 1): CategoryBubbleLayout {
  const layout = layoutBubbles(
    shares.map((s) => s.cents),
    width,
    { scale },
  );
  const bubbles = layout.bubbles.map((b): CategoryBubble => {
    const share = shares[b.index]!;
    const label = fitBubbleLabel(share.label, share.percentText, b.r, scale);
    return {
      ...b,
      key: categoryKey(share.category),
      label: share.label,
      cents: share.cents,
      percentText: share.percentText,
      lines: label.lines,
      fontSize: label.fontSize,
      lineHeight: label.lineHeight,
      a11yLabel: categoryAccessibleName(share),
    };
  });
  return { width: layout.width, height: layout.height, bubbles, anyAtMinimum: bubbles.some((b) => b.atMinimum) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------------------------------------------------

export const ANALYSES_TEXT = {
  /** Título da tela, da linha em Movimentos e do guia. */
  title: 'Análises',
  /** Legenda da linha em Movimentos. */
  rowCaption: 'Categorias, Evolução, Próximos meses e Orçamento',
  rowA11y: 'Análises. Categorias, Evolução, Próximos meses e Orçamento.',
  /** Legenda do índice "No app" de Aprender. */
  screenCaption: 'Categorias em barras ou bolhas, evolução, próximos meses e orçamento do mês',
  subtitle: 'Consulte o mês escolhido. Só leitura: nada é gravado.',
  tabsLabel: 'Tipo de análise',
  tabs: { categorias: 'Categorias', evolucao: 'Evolução', 'proximos-meses': 'Próximos meses', orcamento: 'Orçamento' } as Record<AnalysesTab, string>,
  monthGroup: 'Mês das análises',
  loading: 'Carregando as análises',
  loadError: 'Não foi possível carregar as análises.',
  retry: 'Tentar de novo',
  categories: {
    /** "Pago em outubro de 2026". */
    title: (month: IsoMonth): string => `Pago em ${formatMonthYearBR(month)}`,
    hint: 'Toque em uma categoria para ver os lançamentos do mês.',
    viewGroup: 'Como mostrar as categorias',
    views: { barras: 'Barras', bolhas: 'Bolhas' } as Record<CategoryView, string>,
    /** A legenda pedida por Enzo (D-059), sempre à vista. */
    legend: 'Bolhas: visão exploratória. Barras: comparação mais precisa.',
    minimumNote: 'As bolhas menores aparecem no tamanho mínimo, para o nome caber. O percentual escrito é o que vale.',
    barsLabel: 'Pago por categoria',
    /** O valor e o percentual na barra: "R$ 920,00 · 23,4%". */
    barValue: (cents: Cents, percentText: string): string => `${formatBRL(cents)} · ${percentText}`,
    bubblesLabel: 'Pago por categoria, em bolhas',
    /** "Nenhum gasto anotado em outubro de 2026." */
    empty: (month: IsoMonth): string => `Nenhum gasto anotado em ${formatMonthYearBR(month)}.`,
    emptyBody: 'Mês sem anotação não quer dizer mês sem gastos: aqui aparece só o que está registrado no Clarevo.',
    emptyAction: 'Anotar gasto',
    invoiceNote: CARDS_TEXT.screens.categoryInvoiceNote,
    selected: {
      title: 'Categoria selecionada',
      /** "23,4% do pago". */
      share: (percentText: string): string => `${percentText} do pago`,
      /** "Mercado, 23,4% do pago, R$ 920,00". */
      a11y: (name: string, percentText: string, cents: Cents): string => `${name}, ${percentText} do pago, ${formatBRL(cents)}`,
      /** Dito ao leitor de tela quando a pessoa escolhe: "Categoria selecionada: Mercado, 23,4%, R$ 920,00." */
      announce: (name: string, percentText: string, cents: Cents): string => `Categoria selecionada: ${name}, ${percentText}, ${formatBRL(cents)}.`,
      recordsTitle: 'Lançamentos do mês',
      /** "1 lançamento" ou "3 lançamentos". */
      count: (n: number): string => `${n} ${n === 1 ? 'lançamento' : 'lançamentos'}`,
      order: 'Do maior para o menor valor.',
      none: 'Nenhum lançamento nesta categoria.',
      partOfInvoice: 'Parte do pagamento da fatura',
      /** "Mais 2 lançamentos nesta categoria." */
      more: (n: number): string => `Mais ${n} ${n === 1 ? 'lançamento' : 'lançamentos'} nesta categoria.`,
      seeAll: 'Ver todos os lançamentos do mês',
      /** "Mercado do bairro, 06/10/2026, R$ 1.400,00" (com "parte do pagamento da fatura" quando for o caso). */
      rowA11y: (description: string, date: string, cents: Cents, partial: boolean): string =>
        `${description}, ${formatDateBR(date)}, ${formatBRL(cents)}${partial ? ', parte do pagamento da fatura' : ''}`,
      rowHint: 'Abre o lançamento',
    },
  },
  evolution: {
    /** "Pago em outubro de 2026". */
    title: (month: IsoMonth): string => `Pago em ${formatMonthYearBR(month)}`,
    basis: EVOLUTION_TEXT.subtitle,
    /** O mês escolhido é mais antigo que os 12 meses que a Evolução mostra. */
    outside: (from: IsoMonth): string => `A Evolução mostra os 12 meses até hoje, a partir de ${formatMonthYearBR(from)}. Este mês fica antes.`,
    action: 'Abrir Evolução',
    actionHint: 'Abre a tela Evolução, com o gráfico de linha, a média e a mediana',
  },
  upcoming: {
    /** "Previsto depois de outubro de 2026". */
    title: (month: IsoMonth): string => `Previsto depois de ${formatMonthYearBR(month)}`,
    none: 'Nenhuma conta prevista nos próximos meses.',
    legend: COMMITTED_TEXT.upcomingLegend,
    action: 'Abrir Renda comprometida',
    actionHint: 'Abre Renda comprometida, na seção Próximos meses',
  },
  budget: {
    /** "Orçamento de outubro de 2026". */
    title: (month: IsoMonth): string => `Orçamento de ${formatMonthYearBR(month)}`,
    /** "Nenhum orçamento definido em outubro de 2026." */
    none: (month: IsoMonth): string => `Nenhum orçamento definido em ${formatMonthYearBR(month)}.`,
    /** "2 categorias com orçamento". */
    count: (n: number): string => `${n} ${n === 1 ? 'categoria com orçamento' : 'categorias com orçamento'}`,
    /** "Maior percentual usado: Moradia, R$ 2.500,00 de R$ 2.500,00 (100,0%)". */
    nearest: (category: string, amountLine: string, percentText: string): string => `Maior percentual usado: ${category}, ${amountLine} (${percentText})`,
    action: 'Abrir Orçamento',
    actionHint: 'Abre o Orçamento por categoria deste mês',
  },
} as const;

// ---------------------------------------------------------------------------------------------------------------------
// Categoria selecionada
// ---------------------------------------------------------------------------------------------------------------------

/** Quantos lançamentos o cartão lista antes de mandar para a lista completa do mês. */
export const CATEGORY_CARD_ROWS = 10;

export interface SelectedCategoryRow {
  /** Id do lançamento. */
  recordId: string;
  description: string;
  /** "06/10/2026". */
  dateText: string;
  /** "R$ 1.400,00": a parte da categoria (no pagamento de fatura, só a parte dela). */
  valueText: string;
  cents: Cents;
  /** "Parte do pagamento da fatura" quando a parte é menor que o lançamento; senão null. */
  partialText: string | null;
  a11y: string;
  /** Endereço do lançamento. */
  href: string;
}

export interface SelectedCategoryCard {
  key: string;
  title: string;
  name: string;
  valueText: string;
  cents: Cents;
  percentText: string;
  /** "23,4% do pago". */
  shareText: string;
  a11y: string;
  announce: string;
  /** "3 lançamentos". */
  countText: string;
  rows: SelectedCategoryRow[];
  /** Quantos lançamentos ficaram fora da lista (`CATEGORY_CARD_ROWS`). */
  hiddenCount: number;
  moreText: string | null;
}

/**
 * O cartão "Categoria selecionada": valor e percentual da categoria (os de `categoryBreakdown`) e os lançamentos do mês nela, do maior
 * valor para o menor (empate: o mais recente, depois a descrição). `parts` são as partes por categoria do Pago (`paidCategoryParts`):
 * o pagamento de fatura entra só com a parte dessa categoria, então a soma das linhas é o valor do cartão. Categoria que não está nas
 * barras: null. Só os `limit` maiores aparecem; o resto vira "Mais N lançamentos nesta categoria".
 */
export function selectedCategoryCard(
  shares: readonly CategoryShare[],
  parts: readonly CategoryPart[],
  key: string,
  limit: number = CATEGORY_CARD_ROWS,
): SelectedCategoryCard | null {
  const T = ANALYSES_TEXT.categories.selected;
  const share = shares.find((s) => categoryKey(s.category) === key);
  if (!share) return null;
  const byRecord = new Map<string, { part: CategoryPart; cents: Cents }>();
  for (const part of parts) {
    if (categoryKey(part.category) !== key) continue;
    const found = byRecord.get(part.record.id);
    if (found) found.cents += part.cents;
    else byRecord.set(part.record.id, { part, cents: part.cents });
  }
  const all = [...byRecord.values()]
    .filter(({ cents }) => cents > 0)
    .sort(
      (a, b) =>
        b.cents - a.cents ||
        b.part.record.occurredOn.localeCompare(a.part.record.occurredOn) ||
        a.part.record.description.localeCompare(b.part.record.description, 'pt-BR') ||
        a.part.record.id.localeCompare(b.part.record.id),
    );
  const rows = all.slice(0, Math.max(0, limit)).map(({ part, cents }): SelectedCategoryRow => {
    const record = part.record;
    const partial = cents < record.amountCents;
    return {
      recordId: record.id,
      description: record.description,
      dateText: formatDateBR(record.occurredOn),
      valueText: formatBRL(cents),
      cents,
      partialText: partial ? T.partOfInvoice : null,
      a11y: T.rowA11y(record.description, record.occurredOn, cents, partial),
      href: `/registro/${record.id}`,
    };
  });
  const hiddenCount = all.length - rows.length;
  return {
    key,
    title: T.title,
    name: share.label,
    valueText: formatBRL(share.cents),
    cents: share.cents,
    percentText: share.percentText,
    shareText: T.share(share.percentText),
    a11y: T.a11y(share.label, share.percentText, share.cents),
    announce: T.announce(share.label, share.percentText, share.cents),
    countText: T.count(all.length),
    rows,
    hiddenCount,
    moreText: hiddenCount > 0 ? T.more(hiddenCount) : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Os resumos das outras três abas
// ---------------------------------------------------------------------------------------------------------------------

export interface AnalysesEvolutionSummary {
  /** "Pago em outubro de 2026". */
  title: string;
  /** "R$ 3.900,00"; null em mês sem registros (nunca "R$ 0,00"). */
  valueText: string | null;
  cents: Cents;
  /** "Com registros", "Mês em andamento" ou o aviso de mês sem registros. */
  stateText: string;
  /** "De setembro para outubro: R$ 150,00 a mais", ou o motivo de não haver variação. */
  variationText: string;
  /** "4,0% a mais que setembro"; null sem percentual. */
  percentText: string | null;
  basis: string;
}

/**
 * O resumo da aba Evolução para o mês escolhido: o Pago do mês, o estado e a variação com o mês anterior que está na comparação (as duas
 * datas, como na tela Evolução). `view` é `buildEvolutionView` de Pago nos 12 meses até hoje. Mês que a janela não cobre: null.
 */
export function analysesEvolutionSummary(view: EvolutionView, month: IsoMonth): AnalysesEvolutionSummary | null {
  const point = view.points.find((p) => p.month === month);
  if (!point) return null;
  const variation = evolutionVariation(view, month);
  const T = ANALYSES_TEXT.evolution;
  const valueText = point.valueText;
  const percentText = variation.available ? variation.percentText : null;
  return {
    title: T.title(month),
    valueText,
    cents: point.cents,
    stateText: point.stateText,
    variationText: variation.text,
    percentText,
    basis: T.basis,
  };
}

export interface AnalysesUpcomingRow {
  month: IsoMonth;
  /** "Novembro de 2026 · R$ 3.830,00 · 63,8%". */
  text: string;
  a11y: string;
}

export interface AnalysesUpcomingSummary {
  title: string;
  rows: AnalysesUpcomingRow[];
  /** "Nenhuma conta prevista nos próximos meses." quando os meses mostrados não têm nada previsto; senão null. */
  emptyText: string | null;
  legend: string;
}

/** Quantos meses seguintes o resumo mostra (a seção completa de Renda comprometida mostra seis). */
export const ANALYSES_UPCOMING_MONTHS = 3;

/** O resumo da aba Próximos meses: os primeiros meses depois do escolhido, sempre "previstos", como em Renda comprometida. */
export function analysesUpcomingSummary(projection: CommittedProjection, month: IsoMonth): AnalysesUpcomingSummary {
  const shown = projection.months.slice(0, ANALYSES_UPCOMING_MONTHS);
  return {
    title: ANALYSES_TEXT.upcoming.title(month),
    rows: shown.map((m) => ({ month: m.month, text: m.text, a11y: m.a11yLabel })),
    emptyText: shown.every((m) => m.committedCents === 0) ? ANALYSES_TEXT.upcoming.none : null,
    legend: ANALYSES_TEXT.upcoming.legend,
  };
}

export interface AnalysesBudgetSummary {
  title: string;
  /** "Orçado R$ 4.600,00 · Usado R$ 3.900,00"; null sem orçamento no mês. */
  totalLine: string | null;
  /** "2 categorias com orçamento"; null sem orçamento. */
  countText: string | null;
  /** "Maior percentual usado: Moradia, R$ 2.500,00 de R$ 2.500,00 (100,0%)"; null sem orçamento. */
  nearestLine: string | null;
  /** "Nenhum orçamento definido em outubro de 2026."; null com orçamento. */
  emptyText: string | null;
  note: string | null;
}

/** O resumo da aba Orçamento: o total orçado e usado e a categoria com o maior percentual, como no orçamento. */
export function analysesBudgetSummary(summary: BudgetSummary): AnalysesBudgetSummary {
  const T = ANALYSES_TEXT.budget;
  if (!summary.hasAny) {
    return { title: T.title(summary.month), totalLine: null, countText: null, nearestLine: null, emptyText: T.none(summary.month), note: null };
  }
  const nearest = summary.nearest;
  return {
    title: T.title(summary.month),
    totalLine: summary.totalLine,
    countText: T.count(summary.rows.length),
    nearestLine: nearest ? T.nearest(nearest.category, nearest.amountLine, nearest.percentText) : null,
    emptyText: null,
    note: BUDGET_TEXT.totalNote,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Endereços das telas completas
// ---------------------------------------------------------------------------------------------------------------------

/** A seção de Renda comprometida para onde a aba Próximos meses leva (`?secao=proximos`). */
export const RENDA_UPCOMING_SECTION = 'proximos';

export function isUpcomingSection(param: string | string[] | undefined): boolean {
  return (Array.isArray(param) ? param[0] : param) === RENDA_UPCOMING_SECTION;
}

/** Os parâmetros dos botões "Abrir ..." de cada aba. A Evolução abre sempre na janela de 6 meses até hoje, sem parâmetro. */
export const ANALYSES_LINKS = {
  evolution: { pathname: '/evolucao' as const },
  upcoming: (month: IsoMonth) => ({ pathname: '/renda-comprometida' as const, params: { mes: month, secao: RENDA_UPCOMING_SECTION } }),
  budget: (month: IsoMonth, currentMonth: IsoMonth) => ({ pathname: '/orcamento' as const, params: payablesMonthParams(month, currentMonth) }),
};

