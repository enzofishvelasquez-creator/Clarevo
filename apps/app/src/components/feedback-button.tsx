import { FEEDBACK_TEXT } from '@clarevo/core';
import { Mail } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Txt } from '@/components/ui';
import { openFeedbackEmail } from '@/lib/feedback';
import { colors, space } from '@/theme/tokens';

/**
 * O botão que abre o e-mail de sugestão ou problema (`lib/feedback.ts`). Se o aparelho não abrir o e-mail, mostra o endereço do suporte
 * logo abaixo, selecionável para copiar. Sem provedores do app (sessão, tema, área segura): serve também na tela de erro do app inteiro.
 */
export function FeedbackButton({
  label,
  screen,
  tone = 'soft',
  onBrand,
}: {
  label: string;
  /** O caminho da tela, sem identificadores (`/conta`, `/carregando`, os segmentos da rota na tela de erro). */
  screen: string;
  tone?: 'soft' | 'ghost' | 'onBrand';
  /** Sobre o azul da marca (a tela de carregamento): o aviso sai em branco. */
  onBrand?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const color = onBrand ? colors.textOnBrand : colors.text;
  return (
    <View style={{ gap: space[2] }}>
      <Button
        label={label}
        icon={Mail}
        tone={tone}
        onPress={async () => {
          setFailed(false);
          if (!(await openFeedbackEmail(screen))) setFailed(true);
        }}
      />
      {failed ? (
        <View accessibilityLiveRegion="polite" style={{ gap: space[1] }}>
          <Txt variant="caption" color={color}>
            {FEEDBACK_TEXT.openFailed}
          </Txt>
          <Txt variant="label" color={color} selectable>
            {FEEDBACK_TEXT.address}
          </Txt>
        </View>
      ) : null}
    </View>
  );
}
