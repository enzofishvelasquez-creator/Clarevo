import type { ReactNode } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { Button, Txt } from '@/components/ui';
import { colors, radius, space } from '@/theme/tokens';

/** Diálogo de confirmação acessível. A ação segura vem primeiro. */
export function ConfirmDialog({
  visible,
  title,
  children,
  cancelLabel,
  confirmLabel,
  confirmTone = 'danger',
  busy,
  onCancel,
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
  onConfirm: () => void;
}) {
  const reduced = useReducedMotion();
  return (
    // Durante a ação (busy), nem Cancelar nem o voltar do sistema fecham o diálogo: a ação já começou.
    <Modal visible={visible} transparent animationType={reduced ? 'none' : 'fade'} onRequestClose={busy ? () => {} : onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.box} accessibilityViewIsModal accessibilityRole="alert">
          <Txt variant="title" accessibilityRole="header">
            {title}
          </Txt>
          <View style={{ gap: space[2] }}>{children}</View>
          <View style={{ gap: space[2], marginTop: space[2] }}>
            <Button label={cancelLabel} tone="soft" onPress={onCancel} disabled={busy} />
            <Button label={confirmLabel} tone={confirmTone} onPress={onConfirm} busy={busy} busyLabel="Aguarde…" />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(23,34,59,0.55)', alignItems: 'center', justifyContent: 'center', padding: space[6] },
  box: { width: '100%', maxWidth: 420, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space[6], gap: space[3] },
});
