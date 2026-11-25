import { Platform } from 'react-native';

/**
 * Só para as capturas das lojas (`scripts/capturas-lojas.js`): com esta marca na página, a demonstração esconde o selo "Demonstração" e a
 * linha "Fica só nesta demonstração", porque cada captura já leva a nota "Dados fictícios" no próprio desenho. Nenhuma pessoa tem essa
 * marca: a demonstração aberta no navegador continua com o selo em toda tela. Lida uma vez, ao carregar o app.
 */
export const STORE_CAPTURE: boolean = Platform.OS === 'web' && (globalThis as { __clarevoCaptura?: unknown }).__clarevoCaptura === true;
