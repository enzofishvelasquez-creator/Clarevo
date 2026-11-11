import {
  INVESTMENT_TEXT,
  compareLastClosedMonths,
  monthlyReturns,
  type InvestmentMovement,
  type MonthReturn,
} from '@clarevo/core';
import { View } from 'react-native';

import { MoneyTxt } from '@/components/money-text';
import { Skeleton, Txt } from '@/components/ui';
import { useMarketIndices } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, space } from '@/theme/tokens';

const T = INVESTMENT_TEXT;

/** Movimentos agrupados por investimento (a carteira soma o valor de cada um). */
export function groupByInvestment(movements: readonly InvestmentMovement[]): InvestmentMovement[][] {
  const map = new Map<string, InvestmentMovement[]>();
  for (const m of movements) {
    const list = map.get(m.investmentId) ?? [];
    list.push(m);
    map.set(m.investmentId, list);
  }
  return [...map.values()];
}

/**
 * Rentabilidade (D-093): neste mês até hoje, nos até 12 meses fechados mais recentes com o CDI e o IPCA do mesmo período, e desde o
 * primeiro mês. Os índices vêm da função "indices" (o Banco Central); se não vierem, a rentabilidade continua e a tela diz que não
 * conseguiu. Na demonstração, os índices são de exemplo, e a tela diz isso. Sem atualização de valor, o aviso para atualizar.
 */
export function InvestmentReturns({ groups, hasValue, onBrand = false }: { groups: readonly (readonly InvestmentMovement[])[]; hasValue: boolean; onBrand?: boolean }) {
  const { today } = useSession();
  const returns: MonthReturn[] = monthlyReturns(groups, today);
  const base = compareLastClosedMonths(returns, null);
  const indices = useMarketIndices(base ? base.months[0]! : null);
  const comparison = compareLastClosedMonths(returns, indices.data ?? null);
  const current = returns.length > 0 ? returns[returns.length - 1]! : null;
  const color = onBrand ? colors.textOnBrand : colors.text;
  const soft = onBrand ? colors.textOnBrandSoft : colors.textSecondary;
  if (!hasValue) {
    return (
      <Txt variant="label" color={soft}>
        {T.noValueYet}
      </Txt>
    );
  }
  return (
    <View style={{ gap: space[1] }}>
      {current ? (
        <Txt variant="label" color={color} style={{ fontFamily: fonts.bold }}>
          {T.thisMonth(current.partial ? current.rate : null)}
        </Txt>
      ) : null}
      {comparison ? (
        <>
          <Txt variant="label" color={color}>
            {T.comparison(comparison)}
          </Txt>
          {indices.isPending ? (
            <View style={{ gap: space[1] }} accessibilityRole="progressbar" accessibilityLabel="Buscando o CDI e o IPCA">
              <Skeleton width="60%" height={14} />
              <Skeleton width="55%" height={14} />
            </View>
          ) : indices.isError ? (
            <Txt variant="caption" color={soft}>
              {T.indicesError}
            </Txt>
          ) : (
            <>
              <Txt variant="label" color={color}>
                {T.cdi(comparison.cdi)}
              </Txt>
              <Txt variant="label" color={color}>
                {T.ipca(comparison.ipca)}
              </Txt>
              <Txt variant="caption" color={soft}>
                {indices.data?.example ? T.indicesExample : T.indicesSource(indices.data?.fetchedOn ?? null)}
              </Txt>
            </>
          )}
        </>
      ) : null}
      {comparison === null || (current !== null && current.rate === null) ? (
        <Txt variant="caption" color={soft}>
          {T.monthlyHint}
        </Txt>
      ) : null}
    </View>
  );
}

/** As linhas de totais: aportado, resgatado (se houver), rendimentos (se houver) e ganho ou perda. */
export function InvestmentTotalsLines({
  depositsCents,
  withdrawalsCents,
  incomeCents,
  gainCents,
  onBrand = false,
}: {
  depositsCents: number;
  withdrawalsCents: number;
  incomeCents: number;
  gainCents: number;
  onBrand?: boolean;
}) {
  const color = onBrand ? colors.textOnBrand : colors.text;
  const soft = onBrand ? colors.textOnBrandSoft : colors.textSecondary;
  return (
    <View style={{ gap: 2 }}>
      <MoneyTxt variant="label" color={soft}>
        {T.invested(depositsCents)}
      </MoneyTxt>
      {withdrawalsCents > 0 ? (
        <MoneyTxt variant="label" color={soft}>
          {T.withdrawn(withdrawalsCents)}
        </MoneyTxt>
      ) : null}
      {incomeCents > 0 ? (
        <MoneyTxt variant="label" color={soft}>
          {T.income(incomeCents)}
        </MoneyTxt>
      ) : null}
      <MoneyTxt variant="label" color={color} style={{ fontFamily: fonts.bold }}>
        {T.gain(gainCents)}
      </MoneyTxt>
    </View>
  );
}
