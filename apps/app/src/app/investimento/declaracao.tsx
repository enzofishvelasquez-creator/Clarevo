import { DECLARATION_TEXT, ERROR_TEXT, declarationSummary, declarationYears, formatBRL } from '@clarevo/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ContextPill, SubHeader } from '@/components/header';
import { MoneyTxt } from '@/components/money-text';
import { ChoiceGroup } from '@/components/series-parts';
import { ErrorState, LoadingState } from '@/components/states';
import { Body, Card, Chip, Screen, Txt } from '@/components/ui';
import { useContextInvestmentMovements, useInvestments, useSpace } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, space } from '@/theme/tokens';

const T = DECLARATION_TEXT;

/**
 * Resumo para a declaração anual (D-099, item 9): para cada investimento do ano, o grupo e o código de Bens e Direitos para conferir, uma
 * discriminação sugerida sem CPF, os valores registrados em 31/12 e os rendimentos recebidos no ano por regra. Nunca "declaração pronta":
 * os informes de rendimentos das instituições dizem o valor a declarar.
 */
export default function DeclaracaoScreen() {
  const { today } = useSession();
  const space_ = useSpace();
  const contextId = space_.data?.personalContextId;
  const list = useInvestments(contextId);
  const movements = useContextInvestmentMovements(contextId);
  const years = declarationYears(movements.data ?? [], today);
  const [year, setYear] = useState<number>(() => {
    // Até maio (o prazo da declaração), o padrão é o ano que acabou; depois, o ano de hoje.
    const y = Number(today.slice(0, 4));
    return Number(today.slice(5, 7)) <= 5 ? y - 1 : y;
  });
  const shownYears = years.includes(year) ? years : [year, ...years].sort((a, b) => b - a);
  const summary = list.data && movements.data ? declarationSummary(list.data, movements.data, year) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title="Resumo para a declaração" onBack={() => (router.canGoBack() ? router.back() : router.replace('/investimentos'))} right={<ContextPill label="Pessoal" fixed />} />
      <Screen>
        <Body>
          {list.isError || movements.isError ? (
            <ErrorState
              message={ERROR_TEXT.carregar_falhou}
              onRetry={() => {
                list.refetch();
                movements.refetch();
              }}
            />
          ) : !summary ? (
            <LoadingState />
          ) : (
            <>
              <View style={{ gap: space[1] }}>
                <Txt variant="title" accessibilityRole="header" aria-level={1}>
                  {T.title(year)}
                </Txt>
                <Txt color={colors.textSecondary}>{T.subtitle(year)}</Txt>
              </View>
              {shownYears.length > 1 ? (
                <ChoiceGroup label="Ano" accessibilityLabel="Ano dos valores">
                  {shownYears.map((y) => (
                    <Chip key={y} compact label={String(y)} selected={y === year} onPress={() => setYear(y)} />
                  ))}
                </ChoiceGroup>
              ) : null}
              {summary.items.length === 0 ? (
                <Card>
                  <Txt color={colors.textSecondary}>{T.empty(year)}</Txt>
                </Card>
              ) : (
                <>
                  <Txt variant="title" accessibilityRole="header" aria-level={2}>
                    Bens e Direitos
                  </Txt>
                  {summary.items.map((it) => (
                    <Card key={it.investmentId} style={{ gap: space[2] }}>
                      <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 16 }} accessibilityRole="header" aria-level={3}>
                        {it.name}
                      </Txt>
                      <Txt variant="caption" color={colors.textSecondary}>
                        {it.label}
                      </Txt>
                      {it.pgbl ? (
                        <Txt variant="label">{T.pgbl}</Txt>
                      ) : (
                        <>
                          <Txt variant="label">{T.code(it)}</Txt>
                          <View style={styles.quote}>
                            <Txt variant="caption" color={colors.textSecondary}>
                              Discriminação sugerida
                            </Txt>
                            <Txt variant="label" selectable>
                              {it.description}
                            </Txt>
                          </View>
                          {it.costBased ? (
                            <Txt variant="label">{T.costBased}</Txt>
                          ) : (
                            <>
                              <MoneyTxt variant="label">{T.values(it, year, year >= Number(today.slice(0, 4)))}</MoneyTxt>
                              {it.currentEstimated && year < Number(today.slice(0, 4)) ? (
                                <Txt variant="caption" color={colors.textSecondary}>
                                  {T.estimated(year)}
                                </Txt>
                              ) : null}
                            </>
                          )}
                        </>
                      )}
                    </Card>
                  ))}
                  <Card style={{ gap: space[2] }}>
                    <Txt variant="title" accessibilityRole="header" aria-level={2}>
                      {T.incomeTitle}
                    </Txt>
                    <MoneyTxt variant="label">{T.exempt(summary.income.exemptCents)}</MoneyTxt>
                    <MoneyTxt variant="label">{T.exclusive(summary.income.exclusiveCents)}</MoneyTxt>
                    {summary.income.otherCents > 0 ? <MoneyTxt variant="label">{T.other(summary.income.otherCents)}</MoneyTxt> : null}
                    <Txt variant="caption" color={colors.textSecondary}>
                      {`Total: ${formatBRL(summary.income.exemptCents + summary.income.exclusiveCents + summary.income.otherCents)}. Pelo tipo que você escolheu ao registrar cada rendimento.`}
                    </Txt>
                  </Card>
                  {summary.institutions.length > 0 ? (
                    <Card style={{ gap: space[2] }}>
                      <Txt variant="title" accessibilityRole="header" aria-level={2}>
                        {T.institutionsTitle}
                      </Txt>
                      {summary.institutions.map((inst) => (
                        <Txt key={inst} variant="label">
                          {`Informe de rendimentos de ${year}: ${inst}`}
                        </Txt>
                      ))}
                    </Card>
                  ) : null}
                </>
              )}
              <View style={{ gap: space[1] }}>
                <Txt variant="caption" color={colors.textSecondary}>
                  {T.informe}
                </Txt>
                <Txt variant="caption" color={colors.textSecondary}>
                  {T.noCpf}
                </Txt>
                <Txt variant="caption" color={colors.textSecondary}>
                  {T.reminder}
                </Txt>
                <Txt variant="caption" color={colors.textSecondary}>
                  Os grupos e códigos mudam de um ano para outro: confira sempre no programa da Receita Federal. Não é orientação tributária.
                </Txt>
              </View>
            </>
          )}
        </Body>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  quote: { gap: 2, borderLeftWidth: 3, borderLeftColor: colors.border, paddingLeft: space[3] },
});
