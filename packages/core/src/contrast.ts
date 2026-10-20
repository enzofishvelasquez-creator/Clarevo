/**
 * Contraste de cor (WCAG 2.2, critérios 1.4.3 e 1.4.11) dos pares de texto e fundo do tema (D-062 item 5, `docs/19`).
 * Metas: 4,5:1 para texto normal, 3:1 para texto grande (24 px, ou 18,66 px em negrito), ícones e contornos de campos.
 * A razão é a do WCAG: (L1 + 0,05) / (L2 + 0,05), com L a luminância relativa em sRGB. Cores com transparência (o botão
 * desabilitado fica com 65% de opacidade) são compostas sobre o que está atrás antes da conta.
 * A tabela `THEME_CONTRAST_PAIRS` lista cada par de cor realmente usado nas telas (conferido na demonstração, em todas as
 * telas, e nos estados que a demonstração não mostra: erro, foco, desabilitado, pressionado). O teste lê as cores de
 * `apps/app/src/theme/tokens.ts`, então trocar uma cor do tema sem rever o contraste quebra o teste.
 */

export type Rgb = readonly [number, number, number];

/** Meta para texto normal (WCAG 1.4.3). */
export const CONTRAST_TEXT = 4.5;
/** Meta para texto grande, ícones e contornos de campos (WCAG 1.4.3 e 1.4.11). */
export const CONTRAST_LARGE = 3;

const HEX = /^#([0-9a-fA-F]{6})$/;

/** "#2457F5" em [36, 87, 245]. Só o formato de seis dígitos, que é o do tema. */
export function hexToRgb(hex: string): Rgb {
  const m = HEX.exec(hex);
  if (!m) throw new Error(`cor inválida: ${hex}`);
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Cor `fg` com opacidade `alpha` (0 a 1) sobre `bg`. */
export function blendOver(fg: Rgb, bg: Rgb, alpha: number): Rgb {
  const mix = (a: number, b: number) => a * alpha + b * (1 - alpha);
  return [mix(fg[0], bg[0]), mix(fg[1], bg[1]), mix(fg[2], bg[2])];
}

/** Luminância relativa (WCAG), de 0 (preto) a 1 (branco). */
export function relativeLuminance(c: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
}

/** Razão de contraste entre duas cores, de 1 a 21. */
export function contrastRatio(a: Rgb | string, b: Rgb | string): number {
  const la = relativeLuminance(typeof a === 'string' ? hexToRgb(a) : a);
  const lb = relativeLuminance(typeof b === 'string' ? hexToRgb(b) : b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Texto grande pelo WCAG: 24 px ou mais, ou 18,66 px (14 pt) ou mais em negrito. */
export function isLargeText(sizePx: number, bold: boolean): boolean {
  return sizePx >= 24 || (bold && sizePx >= 18.66);
}

/** A meta que vale para um par: 4,5 para texto normal, 3 para texto grande, ícone ou contorno. */
export function contrastTarget(kind: ContrastKind): number {
  return kind === 'texto' ? CONTRAST_TEXT : CONTRAST_LARGE;
}

export type ContrastKind = 'texto' | 'texto grande' | 'ícone' | 'contorno';

export interface ContrastPair {
  /** Onde o par aparece, em poucas palavras. */
  use: string;
  /** Nome de uma cor do tema (`colors.*`) ou uma cor literal ("#E6EBF5") usada direto no código. */
  fg: string;
  bg: string;
  kind: ContrastKind;
  /**
   * Opacidade do elemento inteiro (texto e fundo juntos) sobre `behind`: o botão desabilitado usa 0,65 sobre o cartão.
   * `behind` é o que está atrás do elemento (nome de cor do tema).
   */
  opacity?: number;
  behind?: string;
  /** Par que não chega à meta, com o motivo (só estados desabilitados, que o WCAG 1.4.3 dispensa, e o segmento "em aberto" com rótulo). */
  exception?: string;
}

const DISABLED_EXEMPT = 'Componente desabilitado: o WCAG 1.4.3 não pede contraste mínimo; o estado também é dito pelo leitor de tela.';

/** Pares de cor do tema e onde cada um é usado. A conta é de `contrastOfPair`. */
export const THEME_CONTRAST_PAIRS: readonly ContrastPair[] = [
  // Texto sobre fundos claros
  { use: 'Texto principal sobre cartão branco', fg: 'text', bg: 'surface', kind: 'texto' },
  { use: 'Texto principal sobre o fundo da tela', fg: 'text', bg: 'background', kind: 'texto' },
  { use: 'Texto principal sobre o lima (selo "Demonstração", cartões de Aprender)', fg: 'text', bg: 'accent', kind: 'texto' },
  { use: 'Texto principal sobre o fundo do resumo de explicação', fg: 'text', bg: 'accentTint', kind: 'texto' },
  { use: 'Texto principal sobre azul claro (aviso informativo, chip, aba ativa)', fg: 'text', bg: 'brandTint', kind: 'texto' },
  { use: 'Texto principal sobre o trilho do seletor "Por registro | Por categoria"', fg: 'text', bg: '#E6EBF5', kind: 'texto' },
  { use: 'Texto principal sobre o aviso de erro', fg: 'text', bg: 'errorTint', kind: 'texto' },
  { use: 'Texto secundário sobre cartão branco (legendas, dicas)', fg: 'textSecondary', bg: 'surface', kind: 'texto' },
  { use: 'Texto secundário sobre o fundo da tela', fg: 'textSecondary', bg: 'background', kind: 'texto' },
  { use: 'Texto secundário sobre azul claro', fg: 'textSecondary', bg: 'brandTint', kind: 'texto' },
  { use: 'Texto secundário sobre o fundo do resumo de explicação', fg: 'textSecondary', bg: 'accentTint', kind: 'texto' },
  { use: 'Texto secundário sobre o aviso de erro', fg: 'textSecondary', bg: 'errorTint', kind: 'texto' },
  { use: 'Texto de exemplo (placeholder) sobre campo branco', fg: 'placeholder', bg: 'surface', kind: 'texto' },
  { use: 'Texto de exemplo (placeholder) sobre campo com erro', fg: 'placeholder', bg: 'errorTint', kind: 'texto' },
  // Azul da marca como texto
  { use: 'Links e botões suaves sobre cartão branco', fg: 'brand', bg: 'surface', kind: 'texto' },
  { use: 'Links e "Voltar" sobre o fundo da tela', fg: 'brand', bg: 'background', kind: 'texto' },
  { use: 'Botão suave, chip selecionado e aba ativa (azul sobre azul claro)', fg: 'brand', bg: 'brandTint', kind: 'texto' },
  { use: 'Azul sobre o fundo do resumo de explicação ("O que é isso?")', fg: 'brand', bg: 'accentTint', kind: 'texto' },
  { use: 'Azul sobre o botão suave pressionado', fg: 'brand', bg: 'brandTintPressed', kind: 'texto' },
  // Texto sobre o azul
  { use: 'Texto branco sobre o azul (cabeçalho, botão principal)', fg: 'textOnBrand', bg: 'brand', kind: 'texto' },
  { use: 'Texto branco sobre o botão principal pressionado', fg: 'textOnBrand', bg: 'brandPressed', kind: 'texto' },
  { use: 'Texto branco sobre o trilho do seletor Pessoal | Família', fg: 'textOnBrand', bg: 'brandDeep', kind: 'texto' },
  { use: 'Legenda clara sobre o azul ("Recebido menos pago até 07/10")', fg: 'textOnBrandSoft', bg: 'brand', kind: 'texto' },
  { use: 'Legenda clara sobre o trilho do seletor', fg: 'textOnBrandSoft', bg: 'brandDeep', kind: 'texto' },
  { use: 'Valor grande em branco sobre o azul (diferença do mês)', fg: 'textOnBrand', bg: 'brand', kind: 'texto grande' },
  // Avisos e valores
  { use: 'Mensagem de erro de campo e botão "Excluir"', fg: 'error', bg: 'surface', kind: 'texto' },
  { use: 'Aviso de erro', fg: 'error', bg: 'errorTint', kind: 'texto' },
  { use: 'Valor recebido (verde) sobre cartão branco', fg: 'success', bg: 'surface', kind: 'texto' },
  { use: 'Aviso de confirmação ("Gasto salvo")', fg: 'successText', bg: 'successTint', kind: 'texto' },
  // Ícones e contornos (3:1)
  { use: 'Ícone azul sobre o quadrado azul claro (linha de gasto, atalhos)', fg: 'brand', bg: 'brandTint', kind: 'ícone' },
  { use: 'Ícone verde sobre o quadrado verde claro (linha de recebimento)', fg: 'success', bg: 'successTint', kind: 'ícone' },
  { use: 'Ícone cinza (setas "›", lupa) sobre cartão branco', fg: 'textSecondary', bg: 'surface', kind: 'ícone' },
  { use: 'Ícone branco sobre o azul (voltar, olho, mês anterior)', fg: 'textOnBrand', bg: 'brand', kind: 'ícone' },
  { use: 'Contorno de campo e de chip sobre cartão branco', fg: 'borderStrong', bg: 'surface', kind: 'contorno' },
  { use: 'Contorno de campo sobre o fundo da tela', fg: 'borderStrong', bg: 'background', kind: 'contorno' },
  { use: 'Contorno de campo com erro sobre o fundo de erro', fg: 'error', bg: 'errorTint', kind: 'contorno' },
  { use: 'Anel de foco azul sobre cartão branco', fg: 'brand', bg: 'surface', kind: 'contorno' },
  { use: 'Anel de foco azul sobre o fundo da tela', fg: 'brand', bg: 'background', kind: 'contorno' },
  { use: 'Anel de foco lima sobre o azul (cabeçalho)', fg: 'accent', bg: 'brand', kind: 'contorno' },
  { use: 'Anel de foco lima sobre o trilho do seletor', fg: 'accent', bg: 'brandDeep', kind: 'contorno' },
  { use: 'Campo em foco: contorno escuro sobre cartão branco', fg: 'text', bg: 'surface', kind: 'contorno' },
  // Estados desabilitados e o segmento em aberto
  {
    use: 'Botão principal desabilitado (65% de opacidade sobre o cartão)',
    fg: 'textOnBrand',
    bg: 'brand',
    kind: 'texto',
    opacity: 0.65,
    behind: 'surface',
    exception: DISABLED_EXEMPT,
  },
  {
    use: 'Botão suave desabilitado (65% de opacidade sobre o cartão)',
    fg: 'brand',
    bg: 'brandTint',
    kind: 'texto',
    opacity: 0.65,
    behind: 'surface',
    exception: DISABLED_EXEMPT,
  },
  {
    use: 'Seta de mês indisponível no cabeçalho (35% de opacidade sobre o azul)',
    fg: 'textOnBrand',
    bg: 'brand',
    kind: 'ícone',
    opacity: 0.35,
    behind: 'brand',
    exception: DISABLED_EXEMPT,
  },
  {
    use: 'Segmento "em aberto" das barras (azul claro sobre branco), sempre com rótulo e listras',
    fg: 'brandSoft',
    bg: 'surface',
    kind: 'ícone',
    exception: 'Gráfico que nunca depende só da cor: o segmento tem listras e o valor escrito ao lado (WCAG 1.4.1 e 1.4.11).',
  },
];

/** A cor de um par: nome do tema, ou a cor literal quando começa com "#". */
function colorOf(colors: Readonly<Record<string, string>>, name: string): Rgb {
  if (name.startsWith('#')) return hexToRgb(name);
  const hex = colors[name];
  if (!hex) throw new Error(`cor do tema não encontrada: ${name}`);
  return hexToRgb(hex);
}

/** Razão de contraste de um par, com a opacidade do elemento (se houver) composta sobre o que está atrás. */
export function contrastOfPair(colors: Readonly<Record<string, string>>, pair: ContrastPair): number {
  const fg = colorOf(colors, pair.fg);
  const bg = colorOf(colors, pair.bg);
  if (pair.opacity === undefined) return contrastRatio(fg, bg);
  // O elemento inteiro (texto e fundo) é composto sobre o que está atrás: cada cor vira `opacidade × cor + (1 − opacidade) × atrás`.
  const behind = colorOf(colors, pair.behind ?? 'background');
  return contrastRatio(blendOver(fg, behind, pair.opacity), blendOver(bg, behind, pair.opacity));
}

export interface ContrastResult {
  pair: ContrastPair;
  ratio: number;
  target: number;
  ok: boolean;
}

/** Todos os pares com a razão, a meta e se passa (os que têm `exception` aparecem com `ok` falso se não chegam à meta). */
export function checkThemeContrast(colors: Readonly<Record<string, string>>, pairs: readonly ContrastPair[] = THEME_CONTRAST_PAIRS): ContrastResult[] {
  return pairs.map((pair) => {
    const ratio = contrastOfPair(colors, pair);
    const target = contrastTarget(pair.kind);
    return { pair, ratio, target, ok: ratio >= target };
  });
}
