import {
  COMPARE_MAX_OPTIONS,
  COMPARE_OPTION_KINDS,
  COMPARE_OPTION_LABEL,
  COMPARE_TEXT,
  compareNetYields,
  type CompareDraft,
  type CompareOptionKind,
} from '@clarevo/core';
import { router } from 'expo-router';
import { Plus, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View, type TextInput } from 'react-native';

import { formatMoneyText } from '@/components/calc/parts';
import { SubHeader } from '@/components/header';
import { MoneyTxt } from '@/components/money-text';
import { ChoiceGroup } from '@/components/series-parts';
import { Body, Button, Card, Chip, Screen, TextField, Txt } from '@/components/ui';
import { colors, fonts, space } from '@/theme/tokens';

const T = COMPARE_TEXT;

/**
 * Comparar rendimentos líquidos (D-099, item 10): valor, prazo e até quatro opções genéricas com as taxas que a pessoa digita; o
 * resultado mostra o líquido de cada uma, na ordem em que foram montadas, sem destacar nenhuma. Nada é gravado.
 */
export default function CompararScreen() {
  const [draft, setDraft] = useState<CompareDraft>({ amountText: '', daysText: '', cdiText: '', ipcaText: '', options: [{ kind: null, rateText: '' }, { kind: null, rateText: '' }] });
  const [tried, setTried] = useState(false);
  const outcome = compareNetYields(draft);
  const errors = tried && !outcome.ok ? outcome.errors : {};
  const set = (patch: Partial<CompareDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const setOption = (i: number, patch: Partial<CompareDraft['options'][number]>) => setDraft((d) => ({ ...d, options: d.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) }));
  const usesCdi = draft.options.some((o) => o.kind === 'cdi_tributado' || o.kind === 'cdi_isento');
  const usesIpca = draft.options.some((o) => o.kind === 'ipca_tributado');
  const result = outcome.ok ? outcome.result : null;
  // Revisão de 13/11/2026: ao tocar em "Comparar" com erro, o foco vai para o primeiro campo com erro.
  const amountRef = useRef<TextInput>(null);
  const daysRef = useRef<TextInput>(null);
  const cdiRef = useRef<TextInput>(null);
  const ipcaRef = useRef<TextInput>(null);
  const rateRefs = useRef<(TextInput | null)[]>([]);
  const compare = () => {
    setTried(true);
    if (outcome.ok) return;
    const e = outcome.errors;
    const target = e.amountText
      ? amountRef.current
      : e.daysText
        ? daysRef.current
        : e.cdiText
          ? cdiRef.current
          : e.ipcaText
            ? ipcaRef.current
            : (draft.options.map((o, i) => (e[`option.${i}`] && o.kind ? rateRefs.current[i] : null)).find((r) => r) ?? null);
    setTimeout(() => target?.focus(), 0);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubHeader title={T.title} onBack={() => (router.canGoBack() ? router.back() : router.replace('/investimentos'))} />
      <Screen>
        <Body>
          <Txt color={colors.textSecondary}>{T.intro}</Txt>
          <Card style={{ gap: space[4] }}>
            <TextField
              ref={amountRef}
              label={T.amountLabel}
              prefix="R$"
              large
              placeholder="0,00"
              keyboardType="decimal-pad"
              inputMode="decimal"
              value={draft.amountText}
              onChangeText={(t) => set({ amountText: t })}
              onBlur={() => set({ amountText: formatMoneyText(draft.amountText) })}
              error={errors.amountText}
            />
            <TextField
              ref={daysRef}
              label={T.daysLabel}
              hint={T.daysHint}
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={4}
              value={draft.daysText}
              onChangeText={(t) => set({ daysText: t.replace(/\D/g, '') })}
              error={errors.daysText}
            />
            {usesCdi ? (
              <TextField ref={cdiRef} label={T.cdiLabel} hint={T.cdiHint} keyboardType="numbers-and-punctuation" inputMode="decimal" maxLength={6} value={draft.cdiText} onChangeText={(t) => set({ cdiText: t })} error={errors.cdiText} />
            ) : null}
            {usesIpca ? (
              <TextField ref={ipcaRef} label={T.ipcaLabel} hint={T.ipcaHint} keyboardType="numbers-and-punctuation" inputMode="decimal" maxLength={6} value={draft.ipcaText} onChangeText={(t) => set({ ipcaText: t })} error={errors.ipcaText} />
            ) : null}
          </Card>
          {draft.options.map((o, i) => (
            <Card key={i} style={{ gap: space[3] }}>
              <View style={styles.optionHead}>
                <Txt variant="title" accessibilityRole="header" aria-level={2} style={{ flex: 1 }}>
                  {T.optionTitle(i + 1)}
                </Txt>
                {draft.options.length > 1 ? (
                  <Button
                    label={T.removeOption(i + 1)}
                    icon={X}
                    tone="ghost"
                    compact
                    onPress={() => setDraft((d) => ({ ...d, options: d.options.filter((_, j) => j !== i) }))}
                  />
                ) : null}
              </View>
              <ChoiceGroup label={T.optionKindLabel} accessibilityLabel={`${T.optionKindLabel}, ${T.optionTitle(i + 1)}`} error={errors[`option.${i}`] && o.kind === null ? errors[`option.${i}`] : undefined}>
                {COMPARE_OPTION_KINDS.map((k) => (
                  <Chip key={k} compact label={COMPARE_OPTION_LABEL[k]} selected={o.kind === k} onPress={() => setOption(i, { kind: o.kind === k ? null : (k as CompareOptionKind) })} />
                ))}
              </ChoiceGroup>
              {o.kind ? (
                <TextField
                  ref={(r) => {
                    rateRefs.current[i] = r;
                  }}
                  label={T.optionRateLabel(o.kind)}
                  accessibilityLabel={`${T.optionRateLabel(o.kind)}, ${T.optionTitle(i + 1)}`}
                  keyboardType="numbers-and-punctuation"
                  inputMode="decimal"
                  maxLength={6}
                  value={o.rateText}
                  onChangeText={(t) => setOption(i, { rateText: t })}
                  error={errors[`option.${i}`]}
                />
              ) : null}
            </Card>
          ))}
          {draft.options.length < COMPARE_MAX_OPTIONS ? (
            <Button label={T.addOption} icon={Plus} tone="soft" onPress={() => setDraft((d) => ({ ...d, options: [...d.options, { kind: null, rateText: '' }] }))} />
          ) : null}
          <Button label="Comparar" onPress={compare} />
          {tried && result ? (
            <Card style={{ gap: space[3] }}>
              <Txt variant="title" accessibilityRole="header" aria-level={2}>
                {T.resultTitle}
              </Txt>
              {result.options.map((o) => {
                const equivalent = T.equivalent(o);
                return (
                  <View key={o.index} style={{ gap: space[1] }}>
                    <MoneyTxt variant="label" style={{ fontFamily: fonts.bold }}>
                      {T.optionLine(o, o.index + 1)}
                    </MoneyTxt>
                    <MoneyTxt variant="caption" color={colors.textSecondary}>
                      {T.detailLine(o)}
                    </MoneyTxt>
                    {equivalent ? (
                      <Txt variant="caption" color={colors.textSecondary}>
                        {equivalent}
                      </Txt>
                    ) : null}
                  </View>
                );
              })}
              <View style={{ gap: space[1] }}>
                <Txt variant="label" style={{ fontFamily: fonts.bold }}>
                  Hipóteses
                </Txt>
                {result.hypotheses.map((h) => (
                  <Txt key={h} variant="caption" color={colors.textSecondary}>
                    {h}
                  </Txt>
                ))}
              </View>
            </Card>
          ) : null}
          <Txt variant="caption" color={colors.textSecondary}>
            {T.disclaimer}
          </Txt>
        </Body>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  optionHead: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
});
