import { LEGAL_NEXT, LEGAL_NOTICE_LINK, legalChangeNotice } from '@clarevo/core';
import { FileText } from 'lucide-react-native';

import { Banner, LinkButton, Txt } from '@/components/ui';
import { SITE_URL, openLegalVersionsPage } from '@/lib/site';
import { useSession } from '@/state/session';

/**
 * Aviso de mudança dos termos e da política (A5): no Resumo, enquanto a próxima versão anunciada (`LEGAL_NEXT`) ainda não vale, com o
 * link para a página de versões do site. Sem mudança marcada, nada aparece. O novo aceite, quando a mudança pedir, é o aviso de
 * `legal-gate.tsx`, depois que a versão nova passa a valer.
 */
export function LegalChangeNotice() {
  const { today } = useSession();
  const text = legalChangeNotice(LEGAL_NEXT, today);
  if (!text) return null;
  return (
    <Banner tone="info" icon={FileText} live={false}>
      <Txt variant="label">{text}</Txt>
      {SITE_URL ? (
        <LinkButton label={LEGAL_NOTICE_LINK} onPress={() => void openLegalVersionsPage()} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
      ) : null}
    </Banner>
  );
}
