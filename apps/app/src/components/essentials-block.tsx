import { GOALS_TEXT, MAX_RECORD_CENTS, centsToInput, essentialEstimateText, parseBRL, type EssentialEstimate } from '@clarevo/core';
import { useState, type Ref } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';

import { formatMoneyText } from '@/components/calc/parts';
import { MoneyTxt, useMoneyMask } from '@/components/money-text';
import { TermHint } from '@/components/term-hint';
import { LinkButton, Money, TextField, Txt } from '@/components/ui';
import type { SavedEssentials } from '@/lib/essentials';
import { colors, fonts, space } from '@/theme/tokens';

/**
 * "Seus gastos essenciais por mês" (D-027(6)), na reserva e no plano de guardar: o valor sugerido (média de gastos, contas do
 * mês ou o da reserva que já existe) com a origem em texto e "Ajustar valor"; sem valor, o campo já aparece. A sugestão
 * sempre pode ser ajustada. O texto digitado fica com quem usa o bloco (`text`).
 */
export function EssentialsBlock({
  estimate,
  saved,
  text,
  onChangeText,
  error,
  fieldRef,
}: {
  estimate: EssentialEstimate;
  /** Valor e origem da reserva que já existe, se houver. */
  saved: SavedEssentials | null;
  text: string;
  onChangeText: (text: string) => void;
  error?: string;
  fieldRef?: Ref<TextInput>;
}) {
  const R = GOALS_TEXT.reserve;
  const mask = useMoneyMask();
  const cents = parseBRL(text);
  const validCents = cents !== null && cents >= 1 && cents <= MAX_RECORD_CENTS ? cents : null;
  const [adjusting, setAdjusting] = useState(validCents === null);
  const editing = adjusting || validCents === null || Boolean(error);
  const suggestion = estimate.amountCents;

  const explanation =
    validCents === null || validCents === suggestion
      ? essentialEstimateText(estimate)
      : saved && validCents === saved.cents
        ? 'Valor salvo na sua reserva.'
        : 'Valor informado por você.';

  return (
    <View style={{ gap: space[2] }}>
      <Txt variant="label" style={{ fontFamily: fonts.bold }} accessibilityRole="header" aria-level={3}>
        {R.essentialsTitle}
      </Txt>
      {editing || validCents === null ? (
        <>
          <MoneyTxt variant="caption" color={colors.textSecondary}>
            {explanation}
          </MoneyTxt>
          <TextField
            ref={fieldRef}
            label={R.essentialsLabel}
            prefix="R$"
            large
            placeholder="0,00"
            keyboardType="decimal-pad"
            inputMode="decimal"
            value={text}
            onChangeText={onChangeText}
            onBlur={() => onChangeText(formatMoneyText(text))}
            error={error}
          />
          <View style={styles.links}>
            {suggestion !== null && validCents !== suggestion ? (
              <LinkButton
                label={mask(`Usar a sugestão: R$ ${centsToInput(suggestion)}`)}
                accessibilityLabel={mask(`Usar a sugestão: R$ ${centsToInput(suggestion)}`)}
                style={styles.link}
                onPress={() => {
                  onChangeText(centsToInput(suggestion));
                  setAdjusting(false);
                }}
              />
            ) : null}
            {validCents !== null && !error ? <LinkButton label="Pronto" style={styles.link} onPress={() => setAdjusting(false)} /> : null}
          </View>
        </>
      ) : (
        <>
          <Money cents={validCents} variant="amount" />
          <MoneyTxt variant="caption" color={colors.textSecondary}>
            {explanation}
          </MoneyTxt>
          <LinkButton label={R.adjust} style={styles.link} onPress={() => setAdjusting(true)} />
        </>
      )}
      <TermHint term="Gastos essenciais" slug="essenciais" />
    </View>
  );
}

const styles = StyleSheet.create({
  links: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[4] },
  link: { alignSelf: 'flex-start', paddingHorizontal: 0 },
});
