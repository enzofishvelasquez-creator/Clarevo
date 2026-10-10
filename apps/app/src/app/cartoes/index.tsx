import { CARDS_TEXT, ERROR_TEXT, cardInvoicesMonth, monthOf } from '@clarevo/core';
import { router } from 'expo-router';
import { Plus, ShieldCheck } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { CardMonthSummary, CardTile } from '@/components/card-parts';
import { FlashBanner, useFlash } from '@/components/flash';
import { ContextPill, SubHeader } from '@/components/header';
import { EmptyState, ErrorState } from '@/components/states';
import { Button, Card, Screen, Skeleton, Txt } from '@/components/ui';
import { useCardsOverview, useIncomeReferences, useSpace } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

const T = CARDS_TEXT;

/**
 * Cartões (D-037): apelido e final, a fatura atual (mês, total, situação, fechamento e vencimento) e o limite usado. Compras no
 * cartão só entram em Pago quando a fatura é paga. Cartões arquivados ficam por último. Nada de cor de alerta.
 */
export default function CartoesScreen() {
  const { today } = useSession();
  const personal = useSpace().data;
  const overview = useCardsOverview(personal?.personalContextId);
  const refs = useIncomeReferences(personal?.personalContextId);
  const month = monthOf(today);
  // Faturas do mês (D-042): as de todos os cartões do contexto, ativos e arquivados, como a renda comprometida as conta.
  const monthTotal = overview.data ? cardInvoicesMonth(overview.data.flatMap((o) => o.invoices), month, refs.data ?? []) : null;
  const [notice] = useFlash();
  const list = overview.data ?? [];
  const active = list.filter((o) => o.card.status === 'ativo');
  const archived = list.filter((o) => o.card.status === 'arquivado');

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={T.title} right={<ContextPill label="Pessoal" />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        <FlashBanner message={notice} />
        {monthTotal && list.length > 0 ? (
          <CardMonthSummary
            data={monthTotal}
            incomeKnown={refs.isSuccess}
            onSeeCommitted={() => router.push({ pathname: '/renda-comprometida', params: { mes: month } })}
            onInformIncome={() => router.push({ pathname: '/renda-comprometida/referencia', params: { mes: month } })}
          />
        ) : null}
        <Txt color={colors.textSecondary}>{T.screens.listIntro}</Txt>
        <Button label={T.newCard} icon={Plus} onPress={() => router.push('/cartoes/novo')} />

        {overview.isPending ? (
          <View style={{ gap: space[3] }} accessibilityRole="progressbar" accessibilityLabel="Carregando cartões">
            <Skeleton width="100%" height={150} />
          </View>
        ) : overview.isError ? (
          <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => overview.refetch()} />
        ) : list.length === 0 ? (
          <Card>
            <EmptyState title={T.emptyTitle} art="compromissos">
              {T.emptyBody}
            </EmptyState>
          </Card>
        ) : (
          <>
            {active.map((o) => (
              <CardTile key={o.card.id} summary={o.summary} today={today} />
            ))}
            {active.length > 0 ? (
              <Txt variant="caption" color={colors.textSecondary}>
                {T.limitNote}
              </Txt>
            ) : null}
            {archived.length > 0 ? (
              <View style={{ gap: space[3] }}>
                <Txt variant="title" accessibilityRole="header" aria-level={2}>
                  {T.archivedTitle}
                </Txt>
                {archived.map((o) => (
                  <CardTile key={o.card.id} summary={o.summary} today={today} />
                ))}
              </View>
            ) : null}
          </>
        )}

        <Pressable accessibilityRole="button" onPress={() => router.push('/quem-ve')} style={styles.privacy}>
          <ShieldCheck size={18} color={colors.textSecondary} />
          <Txt variant="label" color={colors.textSecondary}>
            {T.links.whoSees}
          </Txt>
        </Pressable>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  privacy: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: space[2], minHeight: 44 },
});
