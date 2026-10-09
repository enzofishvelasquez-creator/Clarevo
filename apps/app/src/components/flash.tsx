import { useFocusEffect } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';

import { Banner, Txt } from '@/components/ui';
import { announceOnIOS } from '@/lib/a11y';
import { flash } from '@/lib/flash';
import { maskMoneyText, spokenText, useValuesHidden } from '@/lib/privacy';
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

/**
 * Faixa de resultado ("Pagamento registrado: Luz, R$ 180,00..."). Com "Ocultar valores" (lib/privacy.ts), os valores em
 * reais da mensagem aparecem como "R$ ••••" e o leitor de tela diz "valor oculto" (também no anúncio do iOS).
 */
export function FlashBanner({ message }: { message: string | null }) {
  const hidden = useValuesHidden();
  // O Banner tem região viva na web e no Android; o iOS não tem, e lá o resultado (ex.: "Pagamento registrado: ...",
  // "Anotado: ...") é anunciado uma vez a cada mensagem nova. announceOnIOS não faz nada nas outras plataformas.
  useEffect(() => {
    if (message) announceOnIOS(message, { delay: ANNOUNCE_DELAY });
  }, [message]);
  if (!message) return null;
  return (
    <Banner tone="sucesso" icon={Check}>
      <Txt
        variant="label"
        color={colors.successText}
        style={{ fontFamily: fonts.bold }}
        accessibilityLabel={spokenText(message, hidden)}>
        {maskMoneyText(message, hidden)}
      </Txt>
    </Banner>
  );
}
