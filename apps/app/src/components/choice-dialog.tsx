import type { ReactNode } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { yearA11yLabel } from '@/components/series-parts';
import { Button, Txt } from '@/components/ui';
import { colors, radius, space } from '@/theme/tokens';

export interface DialogChoice {
  label: string;
  onPress: () => void;
  tone?: 'brand' | 'soft';
}

/**
 * Diálogo com duas ou mais ações, como "Só a conta de novembro" e "Novembro e os próximos meses".
 * Mesmo desenho do ConfirmDialog; "Cancelar" fica por último e nunca grava nada.
 * Abre e fecha sem esmaecer: a maioria das escolhas leva a outra tela, e na web o foco volta a quem abriu o diálogo
 * só no fim da animação, o que tiraria o foco do campo da tela nova enquanto a pessoa digita.
 */
export function ChoiceDialog({
  visible,
  title,
  children,
  choices,
  cancelLabel = 'Cancelar',
  busy,
  onCancel,
}: {
  visible: boolean;
  title: string;
  children?: ReactNode;
  choices: DialogChoice[];
  cancelLabel?: string;
  /** Uma ação em andamento: as escolhas ficam bloqueadas e a primeira mostra "Aguarde…". */
  busy?: boolean;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.box} accessibilityViewIsModal accessibilityRole="alert">
          {/* "2026/2027" no título e nas escolhas é lido como "2026 a 2027". */}
          <Txt variant="title" accessibilityRole="header" accessibilityLabel={yearA11yLabel(title)}>
            {title}
          </Txt>
          {children ? <View style={{ gap: space[2] }}>{children}</View> : null}
          <View style={{ gap: space[2], marginTop: space[2] }}>
            {choices.map((c, i) => (
              <Button
                key={c.label}
                label={c.label}
                accessibilityLabel={yearA11yLabel(c.label)}
                tone={c.tone ?? 'soft'}
                onPress={c.onPress}
                busy={busy && i === 0}
                busyLabel="Aguarde…"
                disabled={busy && i > 0}
              />
            ))}
            <Button label={cancelLabel} tone="ghost" onPress={onCancel} disabled={busy} />
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
