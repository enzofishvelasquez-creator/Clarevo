import { ERROR_TEXT, INVESTMENT_KIND_LABEL, INVESTMENT_TEXT, formatBRL, investmentGain, type Investment } from '@clarevo/core';
import { router } from 'expo-router';
import { ChevronRight, Plus, ShieldCheck } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { FlashBanner, useFlash } from '@/components/flash';
import { AppHeader } from '@/components/header';
import { InvestmentReturns, InvestmentTotalsLines, groupByInvestment } from '@/components/investment-parts';
import { MoneyTxt, useMoneyLabelMask } from '@/components/money-text';
import { EmptyState, ErrorState } from '@/components/states';
import { Body, Button, Card, Screen, Skeleton, Txt, styles as ui } from '@/components/ui';
import { useContextInvestmentMovements, useInvestments, useSpace, useWorkOf } from '@/state/data';
import { colors, fonts, radius, space, tabular } from '@/theme/tokens';

const T = INVESTMENT_TEXT;

/**
 * Investimentos (D-093, aba nova, só no Pessoal): o total de hoje, o aportado, o ganho, a rentabilidade da carteira com o CDI e o IPCA,
 * a lista dos investimentos e os encerrados. Tudo vem do que a pessoa registra; nada é recomendado. Mesmo com a Família escolhida no
 * seletor, esta aba mostra o Pessoal (investimentos não vão para a Família).
 */
export default function InvestimentosScreen() {
  const space_ = useSpace();
  const personal = useWorkOf('pessoal');
  const contextId = space_.data?.personalContextId;
  const list = useInvestments(contextId);
  const movements = useContextInvestmentMovements(contextId);
  const [notice] = useFlash();
  const canWrite = personal.data?.canWrite ?? true;
  const all = list.data ?? [];
  const active = all.filter((i) => i.status === 'ativo');
  const closed = all.filter((i) => i.status !== 'ativo');

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Screen wide>
        <AppHeader title={T.tabTitle} context="Pessoal" contextFixed />
        <Body>
          <FlashBanner message={notice} />
          {list.isError || movements.isError || space_.isError ? (
            <Card>
              <ErrorState
                message={ERROR_TEXT.carregar_falhou}
                onRetry={() => {
                  list.refetch();
                  movements.refetch();
                }}
              />
            </Card>
          ) : !list.data || !movements.data ? (
            <View style={{ gap: space[4] }} accessibilityRole="progressbar" accessibilityLabel="Carregando os investimentos">
              <Skeleton width="100%" height={160} style={{ borderRadius: radius.lg }} />
              <Skeleton width="100%" height={96} style={{ borderRadius: radius.lg }} />
            </View>
          ) : all.length === 0 ? (
            <Card style={{ gap: space[3] }}>
              <EmptyState title={T.emptyTitle} art="metas">
                {T.emptyBody}
              </EmptyState>
              {canWrite ? <Button label={T.newInvestment} icon={Plus} onPress={() => router.push('/investimento/novo')} /> : null}
            </Card>
          ) : (
            <>
              {/* A carteira é só dos ativos: os encerrados saem do total e da rentabilidade (docs/45, seção 3.2). */}
              <Summary active={active} groups={groupByInvestment(movements.data.filter((m) => active.some((i) => i.id === m.investmentId)))} />
              <View style={{ gap: space[3] }}>
                <Txt variant="title" accessibilityRole="header" aria-level={2}>
                  Seus investimentos
                </Txt>
                {active.map((i) => (
                  <InvestmentCard key={i.id} investment={i} />
                ))}
                {canWrite ? <Button label={T.newInvestment} icon={Plus} tone="soft" onPress={() => router.push('/investimento/novo')} /> : null}
              </View>
              {closed.length > 0 ? (
                <View style={{ gap: space[3] }}>
                  <Txt variant="title" accessibilityRole="header" aria-level={2}>
                    {T.closedTitle}
                  </Txt>
                  {closed.map((i) => (
                    <InvestmentCard key={i.id} investment={i} />
                  ))}
                </View>
              ) : null}
            </>
          )}
          <Txt variant="label" color={colors.textSecondary}>
            {T.intro}
          </Txt>
          <Txt variant="caption" color={colors.textSecondary}>
            {T.disclaimer}
          </Txt>
          <Txt variant="caption" color={colors.textSecondary}>
            {T.rule}
          </Txt>
          <View style={styles.privacy}>
            <ShieldCheck size={18} color={colors.textSecondary} aria-hidden />
            <Txt variant="label" color={colors.textSecondary} style={{ flex: 1 }}>
              {T.whoSees}
            </Txt>
          </View>
          <Txt variant="caption" color={colors.textSecondary} style={{ textAlign: 'center' }}>
            {T.footer}
          </Txt>
        </Body>
      </Screen>
    </View>
  );
}

function Summary({ active, groups }: { active: readonly Investment[]; groups: Parameters<typeof InvestmentReturns>[0]['groups'] }) {
  const value = active.reduce((a, i) => a + i.valueCents, 0);
  const deposits = active.reduce((a, i) => a + i.depositsCents, 0);
  const withdrawals = active.reduce((a, i) => a + i.withdrawalsCents, 0);
  const income = active.reduce((a, i) => a + i.incomeCents, 0);
  const hasValue = active.some((i) => i.lastValueOn !== null);
  return (
    <View style={styles.blue}>
      <Txt variant="title" color={colors.textOnBrand} accessibilityRole="header" aria-level={2}>
        {T.totalTitle}
      </Txt>
      <MoneyTxt color={colors.textOnBrand} style={[tabular, styles.big]}>
        {formatBRL(value)}
      </MoneyTxt>
      <InvestmentTotalsLines depositsCents={deposits} withdrawalsCents={withdrawals} incomeCents={income} gainCents={value + withdrawals + income - deposits} onBrand />
      <View style={styles.sep} />
      <InvestmentReturns groups={groups} hasValue={hasValue} onBrand />
    </View>
  );
}

function InvestmentCard({ investment: i }: { investment: Investment }) {
  const maskLabel = useMoneyLabelMask();
  const gain = investmentGain(i);
  const caption = i.lastValueOn ? T.lastValue(i.lastValueOn) : T.noValueYet;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={maskLabel(`${i.name}, ${INVESTMENT_KIND_LABEL[i.kind]}: ${formatBRL(i.valueCents)}. ${T.gain(gain)}.`)}
      accessibilityHint="Abre o investimento"
      onPress={() => router.push({ pathname: '/investimento/[id]', params: { id: i.id } })}
      style={(st) => [ui.card, { gap: space[1] }, st.pressed && { opacity: 0.85 }, (st as { focused?: boolean }).focused && ui.focusRing]}>
      <View style={styles.row}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 16 }}>
            {i.name}
          </Txt>
          <Txt variant="caption" color={colors.textSecondary}>
            {INVESTMENT_KIND_LABEL[i.kind]}
          </Txt>
        </View>
        <MoneyTxt variant="label" style={[tabular, { fontFamily: fonts.extrabold }]}>
          {formatBRL(i.valueCents)}
        </MoneyTxt>
        <ChevronRight size={20} color={colors.textSecondary} aria-hidden />
      </View>
      <MoneyTxt variant="caption" color={colors.text}>
        {T.gain(gain)}
      </MoneyTxt>
      <Txt variant="caption" color={colors.textSecondary}>
        {caption}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  blue: { backgroundColor: colors.brand, borderRadius: radius.lg, padding: space[5], gap: space[2] },
  big: { fontFamily: fonts.extrabold, fontSize: 28, lineHeight: 36 },
  sep: { height: 1, backgroundColor: 'rgba(255,255,255,0.28)', marginVertical: space[1] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2] },
});
