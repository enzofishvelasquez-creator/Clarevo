import { Platform, useWindowDimensions } from 'react-native';

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
/**
 * Margem dos lados na versão para computador, a mesma em todas as telas: cartão azul, bloco de destaque e cartões de baixo (revisão de
 * 23/11/2026: as abas usavam 24 px e as telas de consulta 20, e a faixa ficava 4 px mais larga que os cartões). 20 px é o `space[5]`
 * que quase todas as telas de consulta já usam no conteúdo.
 */
export const WIDE_GUTTER = 20;
/** Distância do cartão azul até o alto da janela, a mesma nas abas e nas outras telas (era 24 e 20: a faixa pulava ao navegar). */
export const WIDE_TOP = 24;

/** Só na web: em tablet e Chromebook, o app nativo fica como no celular (o painel dos formulários é da web). */
export function useWideLayout(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= WIDE_MIN_WIDTH;
}

/**
 * Altura abaixo da qual uma janela deitada conta como celular deitado (revisão dos tamanhos de tela, 27/11/2026): celular deitado tem de 320 a
 * 430 px de altura; o menor tablet deitado, 600 ou mais.
 */
export const SHORT_MAX_HEIGHT = 500;

/**
 * Celular deitado (a versão web, no navegador ou instalada; o app das lojas fica sempre em pé): mais largo que alto e com menos de 500 px de
 * altura. Com o cabeçalho de duas linhas e a barra de baixo fixos, sobrava pouco mais da metade da tela para o conteúdo (227 de 390 px):
 * deitado, o cabeçalho das telas internas fica numa linha só, a barra de baixo fica mais baixa e a arte das boas-vindas, menor. Em pé, nada
 * muda.
 */
export function useShortLandscape(): boolean {
  const { width, height } = useWindowDimensions();
  return width > height && height < SHORT_MAX_HEIGHT;
}
