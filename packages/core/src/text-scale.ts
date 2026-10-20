/**
 * Letra grande no aparelho (D-062 item 5, `docs/19`): o Android e o iOS aumentam todo texto pela escala de fonte do sistema
 * (`PixelRatio.getFontScale()`, de 1 a 2 ou mais). Na web a escala é sempre 1.
 */

/** Escala de fonte em que as telas passam a empilhar valor e legenda (acima disto, o valor desce para baixo do nome). */
export const STACK_FROM_FONT_SCALE = 1.3;
/** Largura de tela (px) abaixo da qual as telas empilham, qualquer que seja a escala. */
export const STACK_BELOW_WIDTH = 360;

/** A linha cabe com o valor ao lado do nome? Em tela estreita ou com letra muito grande, não: o valor desce. */
export function isStackedLayout(width: number, fontScale: number): boolean {
  return width < STACK_BELOW_WIDTH || fontScale > STACK_FROM_FONT_SCALE;
}

/**
 * Quantas linhas um título de lista pode ocupar: `lines` com a letra no tamanho normal; sem limite (`undefined`) com letra grande
 * (escala acima de 1), para o nome não terminar em "…". A legenda da linha nunca é limitada.
 */
export function clampedLines(lines: number, fontScale: number): number | undefined {
  return fontScale > 1 ? undefined : lines;
}

/** Quanto o selo "Demonstração" cresce com a letra grande: só até 1,3 vez, porque o cabeçalho divide a faixa com o logotipo e o avatar. */
export const DEMO_PILL_MAX_FONT_SCALE = 1.3;
