import { SUPPORT_EMAIL, normalizeSiteUrl, sitePageUrl, type SitePage } from '@clarevo/core';
import { Linking, Platform } from 'react-native';

/**
 * O endereço do site público do Clarevo (D-064). **A única leitura de `EXPO_PUBLIC_SITE_URL` do app** (a regra do endereço e os caminhos
 * das páginas ficam em `packages/core/src/legal.ts`, com teste). Sem valor padrão no código: a variável só é configurada quando o site
 * estiver publicado (Cloudflare Pages e EAS, `docs/07` e `docs/16`). Sem ela, ou com um valor que não é um endereço, `SITE_URL` é `null`
 * e o app não mostra nenhum link para o site (o texto do cadastro sai sem link e a seção "Privacidade e termos" de Conta não aparece).
 * A demonstração (`export:demo`) sempre sobe com a variável vazia.
 */
export const SITE_URL: string | null = normalizeSiteUrl(process.env.EXPO_PUBLIC_SITE_URL);

/** O endereço completo de uma página do site, ou `null` quando não há endereço do site. */
export const sitePageHref = (page: SitePage): string | null => sitePageUrl(SITE_URL, page);

/**
 * Abre uma página do site no navegador (`Linking` do React Native: no aparelho abre o navegador; na web, uma janela nova, e o app
 * continua aberto). Devolve `false` quando não há endereço do site ou o sistema não conseguiu abrir.
 */
export async function openSitePage(page: SitePage): Promise<boolean> {
  const url = sitePageHref(page);
  if (!url) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * "Escrever para o suporte" (Conta, card "Ajuda e contato"): abre o programa de e-mail com o endereço do suporte. Na web, o
 * `mailto:` vai na própria janela (o navegador entrega ao programa de e-mail e o app continua aberto, sem uma aba vazia), e a web
 * não diz se havia programa de e-mail: devolve `true`. No aparelho, devolve `false` quando o sistema não conseguiu abrir. Nos
 * dois casos o endereço também aparece escrito no card.
 */
export async function openSupportEmail(): Promise<boolean> {
  const url = `mailto:${SUPPORT_EMAIL}`;
  try {
    if (Platform.OS === 'web') window.location.href = url;
    else await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
