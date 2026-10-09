import { useFocusEffect } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';

import { yearA11yLabel } from '@/components/series-parts';
import { Banner, Txt } from '@/components/ui';
import { announceOnIOS } from '@/lib/a11y';
import { flash } from '@/lib/flash';
import { colors, fonts } from '@/theme/tokens';

/** Mostra a mensagem deixada pela tela anterior (ex.: "Registro excluído") ao receber o foco. */
export function useFlash() {
  const [message, setMessage] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      // A cada vez que a tela recebe o foco, mostra só a mensagem nova (ou nenhuma).
      setMessage(flash.take());
    }, []),
  );
  return [message, setMessage] as const;
}

/** Espera para o anúncio no iOS: a tela que recebeu o foco (ou a folha que fechou) termina de assentar antes. */
const ANNOUNCE_DELAY = 500;

export function FlashBanner({ message }: { message: string | null }) {
  // O Banner tem região viva na web e no Android; o iOS não tem, e lá o resultado (ex.: "Pagamento registrado: ...",
  // "Anotado: ...") é anunciado uma vez a cada mensagem nova. announceOnIOS não faz nada nas outras plataformas.
  useEffect(() => {
    if (message) announceOnIOS(message, { delay: ANNOUNCE_DELAY });
  }, [message]);
  if (!message) return null;
  return (
    <Banner tone="sucesso" icon={Check}>
      <Txt variant="label" color={colors.successText} style={{ fontFamily: fonts.bold }} accessibilityLabel={yearA11yLabel(message)}>
        {message}
      </Txt>
    </Banner>
  );
}
