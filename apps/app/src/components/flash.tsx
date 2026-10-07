import { useFocusEffect } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useCallback, useState } from 'react';

import { Banner, Txt } from '@/components/ui';
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

export function FlashBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Banner tone="sucesso" icon={Check}>
      <Txt variant="label" color={colors.successText} style={{ fontFamily: fonts.bold }}>
        {message}
      </Txt>
    </Banner>
  );
}
