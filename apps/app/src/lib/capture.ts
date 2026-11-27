import { normalizeSiteUrl } from '@clarevo/core';
import { Platform } from 'react-native';

/**
 * Só para as capturas das lojas (`scripts/capturas-lojas.js`) e as imagens que montam a tela do app num aparelho desenhado (o gráfico do
 * Google Play e a imagem de compartilhamento do site, D-129): com esta marca na página, a demonstração esconde o selo "Demonstração" e a
 * linha "Fica só nesta demonstração", porque cada imagem já leva a nota "Dados fictícios" ou a legenda no próprio desenho. Nenhuma pessoa
 * tem essa marca: a demonstração aberta no navegador continua com o selo em toda tela. Lida uma vez, ao carregar o app.
 */
export const STORE_CAPTURE: boolean = Platform.OS === 'web' && (globalThis as { __clarevoCaptura?: unknown }).__clarevoCaptura === true;

/**
 * Só para o roteiro de telas (`scripts/e2e-web.js`, D-129): com `__clarevoTesteCompra` na página (o endereço do site que os links dos Termos
 * e da Política usam no roteiro), a tela Assinatura da demonstração mostra o que uma conta de verdade vê na web: com `?assinar=teste`, a área
 * de compra (os textos do cartão e do Pix, os botões e os links), e sem ele, a frase da compra fechada. É o único jeito de o roteiro, que só
 * abre a demonstração, conferir o que a pessoa lê antes de pagar. Nenhuma pessoa tem essa marca: a demonstração continua sem botão de
 * assinar nem de pagar (D-125a), e na demonstração os botões não chamam servidor nenhum (o repositório em memória responde "indisponível").
 * Lida uma vez, ao carregar o app.
 */
const previewSite = (globalThis as { __clarevoTesteCompra?: unknown }).__clarevoTesteCompra;
export const PURCHASE_PREVIEW_SITE: string | null = Platform.OS === 'web' && typeof previewSite === 'string' ? normalizeSiteUrl(previewSite) : null;
export const PURCHASE_PREVIEW: boolean = PURCHASE_PREVIEW_SITE !== null;
