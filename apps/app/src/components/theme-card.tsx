import { THEME_CHOICES, THEME_TEXT, themeChoicePending, type ThemeChoice } from '@clarevo/core';
import { RefreshCw } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';

import { Banner, Button, Card, Chip, Txt } from '@/components/ui';
import { OPENING_THEME_CHOICE, applyThemeNow, saveThemeChoice, useThemeChoice } from '@/lib/theme-choice';
import { useSession } from '@/state/session';
import { colors, colorScheme, space } from '@/theme/tokens';

/**
 * Conta › Tema (D-112, complementa a D-096): "Igual ao aparelho" (o padrão, marcado de início), "Claro" e "Escuro", com a frase de que,
 * por padrão, a Clarevo segue o tema do aparelho. A escolha fica só neste aparelho (`lib/theme-choice.ts`) e sai ao sair da conta. As
 * cores desta abertura não mudam ao escolher: com uma escolha diferente da que vale agora, o card diz que ela vale na próxima abertura e
 * oferece "Aplicar agora", que reabre o app (na web, recarrega a página) só quando a pessoa toca.
 */
export function ThemeCard() {
  const { auth } = useSession();
  const choice = useThemeChoice();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const web = Platform.OS === 'web';
  // As três escolhas numa linha só quando cabem; senão, uma embaixo da outra (auditoria de 18/11/2026: em 390 px ficavam 2 + 1).
  const stacked = useWindowDimensions().width < 480;

  const choose = (next: ThemeChoice) => {
    setMsg(null);
    if (!saveThemeChoice(next)) setMsg(THEME_TEXT.saveFailed);
  };

  const apply = async () => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const reopened = await applyThemeNow(choice, colorScheme).catch(() => false);
    if (!reopened) {
      setBusy(false);
      setMsg(THEME_TEXT.applyFailed);
    }
  };

  return (
    <Card style={{ gap: space[3] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {THEME_TEXT.section}
      </Txt>
      <Txt color={colors.textSecondary}>{`${THEME_TEXT.intro} ${THEME_TEXT.deviceOnly}`}</Txt>
      <View style={{ flexDirection: stacked ? 'column' : 'row', flexWrap: stacked ? 'nowrap' : 'wrap', gap: space[2] }} accessibilityRole="radiogroup" accessibilityLabel={THEME_TEXT.section}>
        {THEME_CHOICES.map((c) => (
          <Chip key={c} label={THEME_TEXT.labels[c]} selected={choice === c} onPress={() => choose(c)} style={stacked ? { alignSelf: 'stretch' } : undefined} />
        ))}
      </View>
      {themeChoicePending(choice, OPENING_THEME_CHOICE) ? (
        <View style={{ gap: space[2] }}>
          <Txt variant="label">{THEME_TEXT.pending}</Txt>
          <Button label={THEME_TEXT.apply} icon={RefreshCw} tone="soft" busy={busy} busyLabel={THEME_TEXT.applyBusy} onPress={apply} />
          <Txt variant="caption" color={colors.textSecondary}>
            {web ? (auth.mode === 'demo' ? `${THEME_TEXT.applyCaption.web} ${THEME_TEXT.applyDemo}` : THEME_TEXT.applyCaption.web) : THEME_TEXT.applyCaption.native}
          </Txt>
        </View>
      ) : null}
      {msg ? (
        <Banner tone="info">
          <Txt variant="label">{msg}</Txt>
        </Banner>
      ) : null}
    </Card>
  );
}
