import { LOGO_SYMBOL_C, LOGO_SYMBOL_MOON } from '@/theme/logo-paths';

/**
 * Desenhos dos widgets do Android (visual de 16/11/2026, docs/21_WIDGET_NATIVO.md, seção 9), em texto SVG para o `SvgWidget` da
 * biblioteca, que os desenha como vetor (nítidos em qualquer densidade de tela, sem PNG nem pasta de recursos). Módulo puro, sem React
 * Native: o widget e o gerador das prévias (`scripts/gerar-widget-previa.js`) usam os mesmos desenhos.
 *
 * - O símbolo C é o da marca (`theme/logo-paths.ts`, o mesmo de docs/marca), sem redesenho: só a caixa fica quadrada, com o desenho
 *   centrado, para caber num quadrado de N dp.
 * - Os ícones são os do lucide (os mesmos do app: Plus, Check, RefreshCw e LogIn), num círculo cheio.
 * - As cores chegam prontas de quem chama (as paletas de `theme/palettes.ts`): aqui não há cor nenhuma.
 */

function svg(size: number, viewBox: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox}">${body}</svg>`;
}

/** O símbolo C (D-010) num quadrado de `size` dp: o C na cor `c` e o crescente na cor `moon`. A caixa original é 322 x 336. */
export function symbolSvg(size: number, c: string, moon: string): string {
  return svg(size, '-13 -6 336 336', `<path fill="${c}" d="${LOGO_SYMBOL_C}"/><path fill="${moon}" d="${LOGO_SYMBOL_MOON}"/>`);
}

/** Um ícone do lucide (caixa 24 x 24, traço) no meio de um círculo cheio de 48; `scale` é o tamanho do ícone em relação ao círculo. */
function iconInCircle(size: number, fill: string, stroke: string, paths: readonly string[], scale: number, strokeWidth: number): string {
  const box = 24 * scale;
  const offset = (48 - box) / 2;
  const strokes = paths.map((d) => `<path d="${d}"/>`).join('');
  return svg(
    size,
    '0 0 48 48',
    `<circle cx="24" cy="24" r="24" fill="${fill}"/>` +
      `<g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${strokes}</g>`,
  );
}

/** "+" (lucide Plus): o atalho de anotar gasto. */
export function plusSvg(size: number, fill: string, stroke: string): string {
  return iconInCircle(size, fill, stroke, ['M5 12h14', 'M12 5v14'], 4 / 3, 2.5);
}

/** Visto (lucide Check): mês sem nada em aberto. */
export function checkSvg(size: number, fill: string, stroke: string): string {
  return iconInCircle(size, fill, stroke, ['M20 6 9 17l-5-5'], 4 / 3, 2.5);
}

/** Setas em círculo (lucide RefreshCw): abrir o app para atualizar. */
export function refreshSvg(size: number, fill: string, stroke: string): string {
  return iconInCircle(
    size,
    fill,
    stroke,
    ['M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16', 'M8 16H3v5'],
    1,
    2.25,
  );
}

/** Entrar (lucide LogIn): sem sessão. */
export function signInSvg(size: number, fill: string, stroke: string): string {
  return iconInCircle(size, fill, stroke, ['m10 17 5-5-5-5', 'M15 12H3', 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4'], 1, 2.25);
}
