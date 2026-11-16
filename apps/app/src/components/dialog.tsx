import type { ReactNode } from 'react';
import { Modal, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Txt } from '@/components/ui';
import { maskMoneyText, spokenText, useValuesHidden } from '@/lib/privacy';
import { colors, radius, space } from '@/theme/tokens';

/**
 * Diálogo de confirmação acessível. A ação segura vem primeiro. O título pode trazer valores em reais ("Usar R$ 2.512,30
 * a partir de 2028?"): com "Ocultar valores" (lib/privacy.ts), aparecem como "R$ ••••" e o leitor de tela diz "valor oculto".
 * Em tela pequena com letra grande (360 × 640 com fonte em 200%), a caixa fica na altura da tela, longe das barras do sistema, e o
 * conteúdo rola dentro dela, com os botões no fim (`useDialogFrame` e `dialogStyles`, também usados pelo ChoiceDialog e pelos diálogos de colar).
 */
export function ConfirmDialog({
  visible,
  title,
  children,
  cancelLabel,
  confirmLabel,
  confirmTone = 'danger',
  busy,
  onCancel,
  onDismiss,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  children: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  confirmTone?: 'danger' | 'brand';
  busy?: boolean;
  onCancel: () => void;
  /** O voltar do sistema (Android). Sem ele, o voltar faz o mesmo que o botão de cancelar. */
  onDismiss?: () => void;
  onConfirm: () => void;
}) {
  const reduced = useReducedMotion();
  const hidden = useValuesHidden();
  const frame = useDialogFrame();
  return (
    // Durante a ação (busy), nem Cancelar nem o voltar do sistema fecham o diálogo: a ação já começou.
    <Modal visible={visible} transparent animationType={reduced ? 'none' : 'fade'} onRequestClose={busy ? () => {} : (onDismiss ?? onCancel)}>
      <View style={[dialogStyles.backdrop, frame.backdrop]}>
        <View style={[dialogStyles.box, frame.box]} accessibilityViewIsModal accessibilityRole="alert">
          <ScrollView contentContainerStyle={dialogStyles.content} keyboardShouldPersistTaps="handled">
            {/* "2026/2027" no título é lido como "2026 a 2027". */}
            <Txt variant="title" accessibilityRole="header" accessibilityLabel={spokenText(title, hidden)}>
              {maskMoneyText(title, hidden)}
            </Txt>
            <View style={{ gap: space[2] }}>{children}</View>
            <View style={{ gap: space[2], marginTop: space[2] }}>
              <Button label={cancelLabel} tone="soft" onPress={onCancel} disabled={busy} />
              <Button label={confirmLabel} tone={confirmTone} onPress={onConfirm} busy={busy} busyLabel="Aguarde…" />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Margens do fundo e altura máxima da caixa dos diálogos: as barras do sistema ficam de fora (o app desenha de ponta a ponta no
 * Android) e a caixa nunca passa da altura da tela; o que não couber rola dentro dela.
 */
export function useDialogFrame() {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const top = insets.top + space[6];
  const bottom = insets.bottom + space[6];
  return {
    backdrop: { paddingTop: top, paddingBottom: bottom },
    box: { maxHeight: Math.max(240, height - top - bottom) },
  };
}

export const dialogStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[6] },
  box: { width: '100%', maxWidth: 420, flexShrink: 1, backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  content: { padding: space[6], gap: space[3] },
});
