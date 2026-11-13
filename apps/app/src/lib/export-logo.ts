import { LOGOTYPE_DOT, LOGOTYPE_HEIGHT, LOGOTYPE_WIDTH, LOGOTYPE_WORD } from '@/theme/logo-paths';
import { lightColors as paper } from '@/theme/palettes';

/**
 * Logotipo oficial "clarevo." (D-022) em SVG, para o cabeçalho do resumo em PDF (D-047). Os mesmos caminhos do componente `Logo`
 * (docs/marca): nada é redesenhado. Altura de 26 px no papel. O papel é sempre branco: as cores são as da paleta clara, também no modo
 * escuro (D-096).
 */
const HEIGHT = 26;
const WIDTH = Math.round(HEIGHT * (LOGOTYPE_WIDTH / LOGOTYPE_HEIGHT));

export const EXPORT_LOGO_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${LOGOTYPE_WIDTH} ${LOGOTYPE_HEIGHT}" role="img" aria-label="Clarevo">` +
  `<path d="${LOGOTYPE_WORD}" fill="${paper.brand}"/>` +
  `<circle cx="${LOGOTYPE_DOT.cx}" cy="${LOGOTYPE_DOT.cy}" r="${LOGOTYPE_DOT.r}" fill="${paper.accent}"/>` +
  `</svg>`;
