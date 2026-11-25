import { RECEIVABLE_TEXT, openReceivables, recentReceived, receivablesSummary, type BusinessContext } from '@clarevo/core';
import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { View } from 'react-native';

import { FlashBanner, useFlash } from '@/components/flash';
import { ContextPill, SubHeader } from '@/components/header';
import { MoneyTxt } from '@/components/money-text';
import { BusinessFrame, RECEIVABLES_PATH, ReceivableRow, useReceivableAccess } from '@/components/receivable-parts';
import { ErrorState } from '@/components/states';
import { Button, Card, Screen, Skeleton, Txt } from '@/components/ui';
import { useReceivables } from '@/state/business';
import { useSession } from '@/state/session';
import { colors, fonts, radius, space } from '@/theme/tokens';

const T = RECEIVABLE_TEXT;

/**
 * A receber (D-122), a partir de "Seu negócio": o que o negócio ainda vai receber, em aberto e por data, com o nome de quem deve quando
 * houver e "Passou da data combinada" em texto neutro (sem cor de alerta); os recebidos mais recentes à parte. Não entra em Entrou, Saiu
 * nem nos totais. "Recebi" abre a confirmação; quem só vê não encontra as ações.
 */
export default function AReceberScreen() {
  return <BusinessFrame title={T.listTitle}>{(business) => <ReceivablesList business={business} />}</BusinessFrame>;
}

function ReceivablesList({ business }: { business: BusinessContext }) {
  const { today } = useSession();
  const [notice] = useFlash();
  const list = useReceivables(business.id);
  // Receber é de quem anota (titular ou quem anota e vê); o que cada linha permite mudar fica no detalhe.
  const { canWrite } = useReceivableAccess(business, null);
  const open = list.data ? openReceivables(list.data) : [];
  const received = list.data ? recentReceived(list.data) : [];
  const summary = list.data ? receivablesSummary(list.data, today) : null;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={T.listTitle} right={<ContextPill label={business.name} fixed />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        <FlashBanner message={notice} />
        <Txt color={colors.textSecondary}>{T.listIntro}</Txt>
        {canWrite ? <Button label={T.add} icon={Plus} onPress={() => router.push(`${RECEIVABLES_PATH}/novo`)} /> : null}
        {list.isError ? (
          <Card>
            <ErrorState message={T.loadFailed} onRetry={() => list.refetch()} />
          </Card>
        ) : !list.data || !summary ? (
          <View style={{ gap: space[3] }} accessibilityRole="progressbar" accessibilityLabel={T.loading}>
            <Skeleton width="100%" height={160} style={{ borderRadius: radius.lg }} />
          </View>
        ) : (
          <>
            <Card style={{ gap: space[2] }}>
              <Txt variant="title" accessibilityRole="header" aria-level={2}>
                {T.openTitle}
              </Txt>
              {open.length === 0 ? (
                <Txt color={colors.textSecondary}>{T.openEmpty}</Txt>
              ) : (
                <>
                  <MoneyTxt variant="label" style={{ fontFamily: fonts.bold }}>
                    {T.totalLine(summary.openCents)}
                  </MoneyTxt>
                  <View>
                    {open.map((r, i) => (
                      <ReceivableRow
                        key={r.id}
                        r={r}
                        today={today}
                        last={i === open.length - 1}
                        onReceive={canWrite ? () => router.push(`${RECEIVABLES_PATH}/${r.id}/receber`) : undefined}
                      />
                    ))}
                  </View>
                </>
              )}
            </Card>
            {received.length > 0 ? (
              <Card style={{ gap: space[2] }}>
                <Txt variant="title" accessibilityRole="header" aria-level={2}>
                  {T.receivedTitle}
                </Txt>
                <Txt variant="caption" color={colors.textSecondary}>
                  {T.receivedNote}
                </Txt>
                <View>
                  {received.map((r, i) => (
                    <ReceivableRow key={r.id} r={r} today={today} last={i === received.length - 1} />
                  ))}
                </View>
              </Card>
            ) : null}
          </>
        )}
        <Txt variant="caption" color={colors.textSecondary}>
          {T.notAdvice}
        </Txt>
      </Screen>
    </View>
  );
}
