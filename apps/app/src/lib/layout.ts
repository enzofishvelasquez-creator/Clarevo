import { useWindowDimensions } from 'react-native';

/**
 * Versão para computador (pedido do Enzo em 12/11/2026): a partir desta largura, a navegação vira uma barra lateral fixa, no lugar das
 * abas de baixo, e o Resumo vira um painel em colunas. Abaixo dela, o app fica como no celular.
 */
export const WIDE_MIN_WIDTH = 1024;
/** Largura da barra lateral. */
export const SIDE_NAV_WIDTH = 256;
/** Largura máxima do painel do Resumo na versão para computador. */
export const WIDE_CONTENT_MAX = 1080;
/** Largura máxima do conteúdo das outras abas na versão para computador (era 560 px, a do celular). */
export const WIDE_TAB_MAX = 760;

export function useWideLayout(): boolean {
  return useWindowDimensions().width >= WIDE_MIN_WIDTH;
}
