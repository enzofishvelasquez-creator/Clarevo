import { CircleQuestionMark } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { Button, Txt } from '@/components/ui';
import { GUIDE_TEXT, HELP_TEXT, guideHelpEntry, openGuideEntry, type GuideEntry, type HelpScreen } from '@/lib/guide';
import { colors, fonts, radius, space } from '@/theme/tokens';

const focusOnBrand = { outlineWidth: 3, outlineColor: colors.accent, outlineStyle: 'solid', outlineOffset: 2 } as const;

/**
 * Botão "?" no cabeçalho de algumas telas (D-049(3)): alvo de 44 px e nome acessível "Como usar esta tela". Abre a folha com o
 * "Como usar" da entrada do guia daquela tela e o atalho "Ver no guia". Nada é gravado nem registrado.
 */
export function HelpButton({ screen }: { screen: HelpScreen }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={HELP_TEXT.button}
        onPress={() => setOpen(true)}
        hitSlop={4}
        style={(s) => [styles.button, s.pressed && { backgroundColor: 'rgba(255,255,255,0.16)' }, (s as { focused?: boolean }).focused && focusOnBrand]}>
        <CircleQuestionMark size={24} color={colors.textOnBrand} aria-hidden />
      </Pressable>
      {open ? <HelpSheet entry={guideHelpEntry(screen)} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** A folha: título da entrada, os passos de "Como usar" numerados, "Ver no guia" e "Fechar". */
function HelpSheet({ entry, onClose }: { entry: GuideEntry; onClose: () => void }) {
  const reduced = useReducedMotion();
  const { height } = useWindowDimensions();
  const seeInGuide = () => {
    onClose();
    openGuideEntry(entry.id);
  };
  return (
    <Modal
      visible
      transparent
      animationType={reduced ? 'none' : 'fade'}
      onRequestClose={onClose}
      {...({ 'aria-label': HELP_TEXT.sheetLabel(entry.title) } as object)}>
      <View style={styles.backdrop}>
        <View style={[styles.box, { maxHeight: Math.max(320, height - space[8]) }]} accessibilityViewIsModal>
          <Txt variant="label" color={colors.textSecondary} style={{ fontFamily: fonts.bold }}>
            {HELP_TEXT.sheetSteps}
          </Txt>
          <Txt variant="title" accessibilityRole="header" aria-level={2} style={{ marginTop: -space[2] }}>
            {entry.title}
          </Txt>
          <ScrollView style={styles.steps} contentContainerStyle={{ gap: space[3] }}>
            {entry.steps.map((step, i) => (
              <View key={step} style={styles.step} accessible accessibilityLabel={GUIDE_TEXT.stepA11y(i + 1, step)}>
                <View style={styles.number} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
                  <Txt variant="label" color={colors.brand} style={{ fontFamily: fonts.extrabold }}>
                    {i + 1}
                  </Txt>
                </View>
                <Txt style={{ flex: 1 }}>{step}</Txt>
              </View>
            ))}
          </ScrollView>
          <View style={{ gap: space[2] }}>
            <Button label={HELP_TEXT.seeInGuide} onPress={seeInGuide} />
            <Button label={HELP_TEXT.close} tone="ghost" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  button: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(23,34,59,0.55)', alignItems: 'center', justifyContent: 'center', padding: space[4] },
  box: { width: '100%', maxWidth: 440, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space[6], gap: space[3] },
  steps: { flexShrink: 1 },
  step: { flexDirection: 'row', gap: space[3], alignItems: 'flex-start' },
  number: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
});
