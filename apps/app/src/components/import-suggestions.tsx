import { CATEGORIES, IMPORT_SUGGESTION_TEXT, budgetRowFor, importSuggestions, monthOf, type ReviewLine } from '@clarevo/core';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { MoneyTxt } from '@/components/money-text';
import { Button, Card, Txt } from '@/components/ui';
import { useCategoryBudgets, useSeriesList } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, space } from '@/theme/tokens';

/**
 * Sugestões no fim da importação (D-078 H): contas que se repetem viram gasto fixo e a média por categoria vira orçamento, sempre
 * abrindo o cadastro preenchido para a pessoa conferir e salvar. Calculadas no aparelho com as linhas importadas (`importSuggestions`).
 * Sem sugestão, nada aparece.
 */
export function ImportSuggestionsCard({ contextId, lines }: { contextId: string | undefined; lines: readonly ReviewLine[] }) {
  const { today } = useSession();
  const series = useSeriesList(contextId);
  const budgets = useCategoryBudgets(contextId);
  const month = monthOf(today);
  const suggestions = useMemo(() => {
    if (!series.data || !budgets.data) return null;
    const withBudget = CATEGORIES.despesa.filter((c) => (budgetRowFor(budgets.data!, c, month)?.amountCents ?? null) !== null);
    // Todas as descrições que o gasto fixo já teve (a vigente e as anteriores): a conta não é sugerida de novo.
    const seriesDescriptions = series.data.flatMap((s) => s.terms.map((t) => t.description));
    return importSuggestions(lines, { seriesDescriptions, budgetCategories: withBudget });
  }, [lines, series.data, budgets.data, month]);
  if (!suggestions || (suggestions.recurring.length === 0 && suggestions.budgets.length === 0)) return null;
  const T = IMPORT_SUGGESTION_TEXT;

  return (
    <Card style={{ gap: space[4] }}>
      <View style={{ gap: space[1] }}>
        <Txt variant="title" accessibilityRole="header" aria-level={2}>
          {T.title}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {T.intro}
        </Txt>
      </View>
      {suggestions.recurring.length > 0 ? (
        <View style={{ gap: space[3] }}>
          <Txt variant="label" style={{ fontFamily: fonts.bold }} accessibilityRole="header" aria-level={3}>
            {T.recurringTitle}
          </Txt>
          <Txt variant="label" color={colors.textSecondary}>
            {T.recurringIntro}
          </Txt>
          {suggestions.recurring.map((s) => (
            <View key={`${s.description}-${s.day}`} style={{ gap: space[1] }}>
              <MoneyTxt>{T.recurringLine(s)}</MoneyTxt>
              <Button
                label={T.recurringAction}
                accessibilityLabel={T.recurringA11y(s)}
                tone="soft"
                onPress={() =>
                  router.push({
                    pathname: '/gastos-fixos/novo',
                    params: { tipo: 'mensal', descricao: s.description, valor: String(s.amountCents), dia: String(s.day), ...(s.category ? { categoria: s.category } : {}) },
                  })
                }
              />
            </View>
          ))}
        </View>
      ) : null}
      {suggestions.budgets.length > 0 ? (
        <View style={{ gap: space[3] }}>
          <Txt variant="label" style={{ fontFamily: fonts.bold }} accessibilityRole="header" aria-level={3}>
            {T.budgetTitle}
          </Txt>
          <Txt variant="label" color={colors.textSecondary}>
            {T.budgetIntro}
          </Txt>
          {suggestions.budgets.map((s) => (
            <View key={s.category} style={{ gap: space[1] }}>
              <MoneyTxt>{T.budgetLine(s)}</MoneyTxt>
              <Button
                label={T.budgetAction}
                accessibilityLabel={T.budgetA11y(s)}
                tone="soft"
                onPress={() => router.push({ pathname: '/orcamento/[categoria]', params: { categoria: s.category, valor: String(s.monthlyCents) } })}
              />
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}
