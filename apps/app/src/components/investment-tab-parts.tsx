import {
  HOW_CALC_TEXT,
  INVESTMENT_TEMPLATES,
  INVESTMENT_TEMPLATE_TEXT,
  PERFORMANCE_TEXT,
  TAB_VALUE_DATE_TEXT,
  howCalculatedLines,
  type InvestmentTemplate,
  type PortfolioTotals,
} from '@clarevo/core';
import { router } from 'expo-router';
import { Building2, ChevronRight, Landmark, Layers, PiggyBank, type LucideIcon } from 'lucide-react-native';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { MoneyTxt } from '@/components/money-text';
import { Banner, Button, Txt, styles as ui } from '@/components/ui';
import { colors, fonts, radius, space } from '@/theme/tokens';

/**
 * "Como a conta é feita" (D-103, item 2): a folha que explica cada número do card azul da aba Investir com a conta feita com os números
 * da pessoa. Os valores em reais passam por MoneyTxt (com "Ocultar valores", R$ ••••). Nada é gravado.
 */
export function HowCalculatedSheet({ totals, onClose }: { totals: PortfolioTotals; onClose: () => void }) {
  const reduced = useReducedMotion();
  const { height } = useWindowDimensions();
  const lines = howCalculatedLines(totals);
  return (
    <Modal visible transparent animationType={reduced ? 'none' : 'fade'} onRequestClose={onClose} {...({ 'aria-label': HOW_CALC_TEXT.title } as object)}>
      <View style={styles.backdrop}>
        <View style={[styles.box, { maxHeight: Math.max(320, Math.round(height * 0.86)) }]} accessibilityViewIsModal>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {HOW_CALC_TEXT.title}
          </Txt>
          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: space[3] }}>
            {lines.map((l) => (
              <View key={l.title} style={{ gap: 2 }}>
                <MoneyTxt variant="label" style={{ fontFamily: fonts.bold }}>
                  {l.title}
                </MoneyTxt>
                <MoneyTxt variant="caption" color={colors.textSecondary}>
                  {l.text}
                </MoneyTxt>
              </View>
            ))}
            <Txt variant="caption" color={colors.textSecondary}>
              {HOW_CALC_TEXT.note}
            </Txt>
          </ScrollView>
          <Button label={HOW_CALC_TEXT.close} tone="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const TEMPLATE_ICON: Readonly<Record<InvestmentTemplate, LucideIcon>> = { reserva: PiggyBank, titulo: Landmark, banco: Building2, outro: Layers };

/**
 * Modelos de registro na tela vazia (D-103, item 5): quatro formas de começar o registro do que a pessoa já tem. Cada uma abre o novo
 * investimento com o parâmetro "modelo", que preenche parte do formulário (investmentTemplatePreset). São tipos de registro, não sugestão
 * de produto: a lista não destaca nenhum, e o aviso diz que a Clarevo não indica onde investir.
 */
export function InvestmentTemplates() {
  const T = INVESTMENT_TEMPLATE_TEXT;
  return (
    <View style={{ gap: space[3] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {T.title}
      </Txt>
      <Txt variant="label" color={colors.textSecondary}>
        {T.intro}
      </Txt>
      {INVESTMENT_TEMPLATES.map((t) => {
        const Icon = TEMPLATE_ICON[t];
        return (
          <Pressable
            key={t}
            accessibilityRole="link"
            accessibilityLabel={`${T.label[t]}. ${T.hint[t]}`}
            accessibilityHint="Abre o novo investimento com uma parte preenchida"
            onPress={() => router.push({ pathname: '/investimento/novo', params: { modelo: t } })}
            style={(st) => [ui.card, styles.templateRow, st.pressed && { opacity: 0.85 }, (st as { focused?: boolean }).focused && ui.focusRing]}>
            <View style={styles.templateIcon}>
              <Icon size={20} color={colors.brandText} aria-hidden />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="label" style={{ fontFamily: fonts.bold }}>
                {T.label[t]}
              </Txt>
              <Txt variant="caption" color={colors.textSecondary}>
                {T.hint[t]}
              </Txt>
            </View>
            <ChevronRight size={20} color={colors.textSecondary} aria-hidden />
          </Pressable>
        );
      })}
      <Txt variant="caption" color={colors.textSecondary}>
        {T.note}
      </Txt>
    </View>
  );
}

/**
 * Falha ao carregar com valores já na tela (D-103, item 1): a aba continua com o último valor conhecido de cada investimento, com a data,
 * e este aviso; nunca zero no lugar. `partial`: só os movimentos falharam (a lista e os totais vieram).
 */
export function StaleValuesNotice({ partial, onRetry }: { partial: boolean; onRetry: () => void }) {
  return (
    <Banner tone="info">
      <Txt variant="label">{partial ? TAB_VALUE_DATE_TEXT.partial : TAB_VALUE_DATE_TEXT.stale}</Txt>
      <Button label={TAB_VALUE_DATE_TEXT.retry} tone="ghost" compact onPress={onRetry} />
    </Banner>
  );
}

/** Selo "Estimativa" (D-103, item 8), na cor da marca (sem cor de alerta). */
export function EstimateBadge() {
  return (
    <View style={styles.badge} accessible accessibilityLabel={PERFORMANCE_TEXT.estimateA11y}>
      <Txt variant="caption" color={colors.brandText} style={{ fontFamily: fonts.bold }}>
        {PERFORMANCE_TEXT.estimate}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: space[4] },
  box: { width: '100%', maxWidth: 480, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space[6], gap: space[3] },
  templateRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 44 },
  templateIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
  badge: { alignSelf: 'flex-start', paddingHorizontal: space[3], paddingVertical: space[1], borderRadius: radius.pill, backgroundColor: colors.brandTint },
});
