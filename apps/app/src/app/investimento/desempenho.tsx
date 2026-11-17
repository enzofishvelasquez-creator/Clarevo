import {
  ERROR_TEXT,
  INVESTMENT_TEXT,
  PERFORMANCE_PERIODS,
  PERFORMANCE_PERIOD_LABEL,
  PERFORMANCE_TEXT,
  compareInvestment,
  performanceIndicesFrom,
  performanceRateLine,
  type Investment,
  type InvestmentMovement,
  type MarketIndices,
  type PerformancePeriod,
} from '@clarevo/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ContextPill, SubHeader } from '@/components/header';
import { investmentCaption } from '@/components/investment-ficha';
import { EvolutionCard } from '@/components/investment-portfolio';
import { EstimateBadge } from '@/components/investment-tab-parts';
import { ChoiceGroup } from '@/components/series-parts';
import { ErrorState, LoadingState } from '@/components/states';
import { Body, Card, Chip, Screen, Skeleton, Txt } from '@/components/ui';
import { useContextInvestmentMovements, useInvestments, useMarketIndices, useSpace } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, space } from '@/theme/tokens';

const T = PERFORMANCE_TEXT;

/**
 * Desempenho dos investimentos (D-103, item 8): aberto pelo card azul da aba Investir. Três períodos fixos (no mês, em 12 meses, desde o
 * início); para cada investimento ativo, o rendimento no próprio período (do primeiro ao último valor registrado dentro dele), em "% do
 * CDI" quando dá, ao lado do CDI, do IPCA e da poupança do mesmo intervalo, com a taxa da ficha como referência. Não há porcentagem única
 * da carteira (cuidado de método: os valores são digitados em datas diferentes). Selo de estimativa, uma cor só, nada de ranking nem de
 * "melhor". Depois, a evolução da carteira (que saiu da aba). Só leitura; nada é gravado.
 */
export default function DesempenhoScreen() {
  const { today } = useSession();
  const space_ = useSpace();
  const contextId = space_.data?.personalContextId;
  const list = useInvestments(contextId);
  const movements = useContextInvestmentMovements(contextId);
  const [period, setPeriod] = useState<PerformancePeriod>('12m');
  const all = list.data ?? [];
  const active = all.filter((i) => i.status === 'ativo');
  const moves = movements.data ?? [];
  const groups = active.map((i) => moves.filter((m) => m.investmentId === i.id));
  // Uma busca dos índices para os três períodos: desde o mês do primeiro movimento entre os ativos.
  const indices = useMarketIndices(movements.data ? performanceIndicesFrom(groups, today) : null);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/investimentos'));

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={T.title} onBack={back} right={<ContextPill label="Pessoal" fixed />} />
      <Screen>
        <Body>
          {space_.isError || (list.isError && !list.data) || (movements.isError && !movements.data) ? (
            <ErrorState
              message={ERROR_TEXT.carregar_falhou}
              onRetry={() => {
                space_.refetch();
                list.refetch();
                movements.refetch();
              }}
            />
          ) : !list.data || !movements.data ? (
            <LoadingState />
          ) : (
            <>
              <Txt color={colors.textSecondary}>{T.intro}</Txt>
              <Card style={{ gap: space[3] }}>
                <View style={styles.headRow}>
                  <Txt variant="title" accessibilityRole="header" aria-level={2} style={{ flexShrink: 1 }}>
                    {T.compareTitle}
                  </Txt>
                  <EstimateBadge />
                </View>
                <ChoiceGroup label={T.periodLabel}>
                  {PERFORMANCE_PERIODS.map((p) => (
                    <Chip key={p} compact label={PERFORMANCE_PERIOD_LABEL[p]} selected={period === p} onPress={() => setPeriod(p)} />
                  ))}
                </ChoiceGroup>
                {indices.isPending && groups.some((g) => g.length > 0) ? (
                  <View style={{ gap: space[1] }} accessibilityRole="progressbar" accessibilityLabel={T.indicesLoading}>
                    <Skeleton width="60%" height={14} />
                    <Skeleton width="45%" height={14} />
                  </View>
                ) : indices.isError ? (
                  <Txt variant="caption" color={colors.textSecondary}>
                    {T.indicesError}
                  </Txt>
                ) : null}
                {active.length === 0 ? (
                  <Txt color={colors.textSecondary}>{T.empty}</Txt>
                ) : (
                  active.map((i, idx) => (
                    <ComparisonBlock key={i.id} investment={i} movements={groups[idx]!} period={period} indices={indices.data ?? null} first={idx === 0} />
                  ))
                )}
              </Card>
              <View style={{ gap: space[2] }}>
                <Txt variant="caption" color={colors.textSecondary}>
                  {T.method}
                </Txt>
                <Txt variant="caption" color={colors.textSecondary}>
                  {T.formulas}
                </Txt>
                <Txt variant="caption" color={colors.textSecondary}>
                  {T.premise}
                </Txt>
                {indices.data ? (
                  <Txt variant="caption" color={colors.textSecondary}>
                    {indices.data.example ? T.example : T.source(indices.data.fetchedOn)}
                  </Txt>
                ) : null}
              </View>
              <EvolutionCard items={all} movements={moves} />
              <Txt variant="caption" color={colors.textSecondary}>
                {INVESTMENT_TEXT.disclaimer}
              </Txt>
            </>
          )}
        </Body>
      </Screen>
    </View>
  );
}

/** Um investimento no período: de quando a quando, quanto rendeu (e em "% do CDI"), a taxa da ficha e os índices do mesmo intervalo. */
function ComparisonBlock({
  investment: i,
  movements,
  period,
  indices,
  first,
}: {
  investment: Investment;
  movements: readonly InvestmentMovement[];
  period: PerformancePeriod;
  indices: MarketIndices | null;
  first: boolean;
}) {
  const { today } = useSession();
  const c = compareInvestment(movements, period, indices, today);
  // A taxa da ficha como referência, com a taxa que muda numa data (a que vale hoje); "variável" não tem taxa e diz isso.
  const contracted = performanceRateLine(i, today);
  return (
    <View style={[styles.block, !first && styles.divider]}>
      <Txt variant="label" accessibilityRole="header" aria-level={3} style={{ fontFamily: fonts.bold, fontSize: 16 }}>
        {i.name}
      </Txt>
      <Txt variant="caption" color={colors.textSecondary}>
        {investmentCaption(i)}
      </Txt>
      {contracted ? (
        <Txt variant="caption" color={colors.textSecondary}>
          {contracted}
        </Txt>
      ) : null}
      {c.window === null ? (
        <Txt variant="label" color={colors.textSecondary}>
          {T.noWindow(period)}
        </Txt>
      ) : (
        <>
          <Txt variant="caption" color={colors.textSecondary}>
            {T.window(c.window)}
          </Txt>
          <Txt variant="label" style={{ fontFamily: fonts.bold }}>
            {T.rate(c.rate, c.ofCdi)}
          </Txt>
          {indices ? (
            <>
              <Txt variant="label">{T.cdi(c.cdi)}</Txt>
              <Txt variant="label">{T.ipca(c.ipca)}</Txt>
              <Txt variant="label">{T.poupanca(c.poupanca)}</Txt>
              {c.real !== null ? <Txt variant="label">{T.real(c.real)}</Txt> : null}
              {c.projectedFrom ? (
                <Txt variant="caption" color={colors.textSecondary}>
                  {T.projected(c.projectedFrom)}
                </Txt>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[2] },
  block: { gap: 2, paddingTop: space[2] },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: space[3] },
});
