import type { SitePage } from '@clarevo/core';
import { Platform } from 'react-native';
import type { ReactNode } from 'react';

import { Txt } from '@/components/ui';
import { openSitePage, sitePageHref } from '@/lib/site';
import { colors, fonts } from '@/theme/tokens';

/**
 * Link dentro de um texto corrido para uma página do site público (D-064), como "Termos de uso" no cadastro. Só desenhe quando há
 * endereço do site (`SITE_URL` em `lib/site.ts`). Na web é um `<a>` de verdade (`href`), que abre numa aba nova, com foco e teclado;
 * no celular abre o navegador do aparelho e, se o sistema não abrir, chama `onFail`.
 */
export function SiteTextLink({ page, children, onFail }: { page: SitePage; children: ReactNode; onFail?: () => void }) {
  const web = Platform.OS === 'web';
  const href = sitePageHref(page);
  const behavior = web
    ? ({ href, hrefAttrs: { target: '_blank', rel: 'noopener noreferrer' } } as object)
    : {
        onPress: () => {
          void openSitePage(page).then((opened) => {
            if (!opened) onFail?.();
          });
        },
      };
  return (
    <Txt variant="caption" color={colors.brand} accessibilityRole="link" style={{ fontFamily: fonts.bold, textDecorationLine: 'underline' }} {...behavior}>
      {children}
    </Txt>
  );
}
