import type { ReactNode } from 'react';
import { Modal, ScrollView, View } from 'react-native';

import { dialogStyles, useDialogFrame } from '@/components/dialog';
import { Button, Txt } from '@/components/ui';
import { maskMoneyText, spokenText, useValuesHidden } from '@/lib/privacy';
import { space } from '@/theme/tokens';

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
 * O título e as escolhas podem trazer valores em reais: com "Ocultar valores" (lib/privacy.ts), aparecem como "R$ ••••" e o
 * leitor de tela diz "valor oculto". Com letra grande em tela pequena, tudo rola dentro da caixa, como no ConfirmDialog.
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
  const hidden = useValuesHidden();
  const frame = useDialogFrame();
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onCancel}>
      <View style={[dialogStyles.backdrop, frame.backdrop]}>
        <View style={[dialogStyles.box, frame.box]} accessibilityViewIsModal accessibilityRole="alert">
          <ScrollView contentContainerStyle={dialogStyles.content} keyboardShouldPersistTaps="handled">
            {/* "2026/2027" no título e nas escolhas é lido como "2026 a 2027". */}
            <Txt variant="title" accessibilityRole="header" accessibilityLabel={spokenText(title, hidden)}>
              {maskMoneyText(title, hidden)}
            </Txt>
            {children ? <View style={{ gap: space[2] }}>{children}</View> : null}
            <View style={{ gap: space[2], marginTop: space[2] }}>
              {choices.map((c, i) => (
                <Button
                  key={c.label}
                  label={maskMoneyText(c.label, hidden)}
                  accessibilityLabel={spokenText(c.label, hidden)}
                  tone={c.tone ?? 'soft'}
                  onPress={c.onPress}
                  busy={busy && i === 0}
                  busyLabel="Aguarde…"
                  disabled={busy && i > 0}
                />
              ))}
              <Button label={cancelLabel} tone="ghost" onPress={onCancel} disabled={busy} />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
