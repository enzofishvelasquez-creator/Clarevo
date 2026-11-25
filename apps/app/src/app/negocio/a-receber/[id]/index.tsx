import {
  ACCOUNTS_TEXT,
  RECEIVABLE_KIND_LABEL,
  RECEIVABLE_TEXT,
  accountDisplayName,
  deviceTimeZone,
  formatBRL,
  formatDateBR,
  formatDateTimeBR,
  receivableDateText,
  receivableErrorText,
  type BusinessContext,
  type Receivable,
} from '@clarevo/core';
import { router, useLocalSearchParams } from 'expo-router';
import { AlertCircle, Check, Pencil, ReceiptText, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ConfirmDialog } from '@/components/dialog';
import { useAuthorship } from '@/components/family-parts';
import { FlashBanner, useFlash } from '@/components/flash';
import { ContextPill, SubHeader } from '@/components/header';
import { MoneyTxt } from '@/components/money-text';
import { BusinessFrame, RECEIVABLES_PATH, useReceivableAccess } from '@/components/receivable-parts';
import { ErrorState, LoadingState } from '@/components/states';
import { Banner, Button, Card, FitMoney, Screen, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { useDeleteReceivable, useReceivable } from '@/state/business';
import { useAccounts } from '@/state/data';
import { attemptFamily, useFamilyKeys } from '@/state/family';
import { useSession } from '@/state/session';
import { colors, fonts, radius, space } from '@/theme/tokens';

const T = RECEIVABLE_TEXT;

/**
 * O valor a receber (D-122): o que é, a data combinada ou prevista, a categoria, quem deve (se houver) e a situação, numa cor só. Em
 * aberto: "Recebi" (quem anota), "Editar" e "Excluir" (quem anotou ou quem administra). Recebido: a data e o valor que entraram e "Ver a
 * entrada"; para desfazer, exclui-se a entrada, e o valor volta para Em aberto.
 */
export default function AReceberDetalheScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <BusinessFrame title={T.detailTitle}>{(business) => <Detail business={business} id={id} />}</BusinessFrame>;
}

function Detail({ business, id }: { business: BusinessContext; id: string | undefined }) {
  const one = useReceivable(id);
  const r = one.data;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={T.detailTitle} right={<ContextPill label={business.name} fixed />} />
      <Screen contentStyle={{ padding: space[5], gap: space[3] }}>
        {one.isPending ? (
          <LoadingState label={T.loading} />
        ) : one.isError ? (
          <ErrorState message={T.loadFailed} onRetry={() => one.refetch()} />
        ) : !r ? (
          <Card style={{ gap: space[3] }}>
            <Txt>{T.notFound}</Txt>
            <Button label={T.backToList} tone="soft" onPress={() => router.replace(RECEIVABLES_PATH)} />
          </Card>
        ) : (
          <Body business={business} r={r} />
        )}
      </Screen>
    </View>
  );
}

function Body({ business, r }: { business: BusinessContext; r: Receivable }) {
  const { today } = useSession();
  const [notice] = useFlash();
  const by = useAuthorship(r.contextId, r.createdBy);
  const access = useReceivableAccess(business, r.createdBy);
  const accounts = useAccounts(r.contextId);
  const remove = useDeleteReceivable();
  const keys = useFamilyKeys();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = r.status === 'aberto';

  async function doDelete() {
    setError(null);
    const result = await attemptFamily(keys, `excluir-a-receber:${r.id}:${r.version}`, (key) => remove.mutateAsync({ key, id: r.id, version: r.version }));
    setConfirming(false);
    if (result.ok) {
      flash.set(T.removed);
      if (router.canGoBack()) router.back();
      else router.replace(RECEIVABLES_PATH);
      return;
    }
    setError(receivableErrorText(result.code));
  }

  return (
    <>
      <FlashBanner message={notice} />
      {error ? (
        <Banner tone="erro" icon={AlertCircle}>
          <Txt variant="label" color={colors.error}>
            {error}
          </Txt>
        </Banner>
      ) : null}
      <Card style={{ gap: space[3] }}>
        <View style={[styles.badge, !open && { backgroundColor: colors.successTint }]}>
          <Txt variant="label" color={open ? colors.brandText : colors.successText} style={{ fontFamily: fonts.bold }}>
            {open ? T.statusOpen : T.statusReceived}
          </Txt>
        </View>
        <Txt variant="title" style={{ fontSize: 24, lineHeight: 32 }} accessibilityRole="header" aria-level={2}>
          {r.description}
        </Txt>
        <FitMoney cents={r.amountCents} />
        <View>
          <Row label={T.rowKind} value={RECEIVABLE_KIND_LABEL[r.kind]} />
          <Row label={T.rowDate(r.kind)} value={formatDateBR(r.expectedOn)} />
          {open ? <Row label={T.rowStatus} value={receivableDateText(r, today)} /> : null}
          <Row label={T.rowCategory} value={r.category} />
          {r.debtor ? <Row label={T.rowDebtor} value={r.debtor} /> : null}
          {r.received ? (
            <>
              <Row label={T.rowReceivedOn} value={formatDateBR(r.received.receivedOn)} />
              <Row label={T.rowReceivedAmount} value={formatBRL(r.received.amountCents)} money />
              <Row label={ACCOUNTS_TEXT.into} value={accountDisplayName(accounts.data ?? [], r.received.accountId)} />
            </>
          ) : null}
          <Row label="Espaço" value={by.contextName} last />
        </View>
        <View style={{ gap: 2 }} accessible>
          <Txt variant="caption" color={colors.textSecondary}>
            Anotado por {by.by} em {formatDateTimeBR(r.createdAt, deviceTimeZone())}
          </Txt>
          {r.version > 1 ? (
            <Txt variant="caption" color={colors.textSecondary}>
              Última alteração em {formatDateTimeBR(r.updatedAt, deviceTimeZone())}
            </Txt>
          ) : null}
        </View>
      </Card>
      {open ? (
        <>
          <Txt variant="caption" color={colors.textSecondary}>
            {T.notCounted}
          </Txt>
          {access.canWrite ? <Button label={T.receive} icon={Check} onPress={() => router.push(`${RECEIVABLES_PATH}/${r.id}/receber`)} /> : null}
          {access.canChange ? <Button label={T.edit} icon={Pencil} tone="soft" onPress={() => router.push(`${RECEIVABLES_PATH}/${r.id}/editar`)} /> : null}
          {access.canChange ? <Button label={T.remove} icon={Trash2} tone="danger" onPress={() => setConfirming(true)} /> : null}
        </>
      ) : (
        <>
          <Txt variant="caption" color={colors.textSecondary}>
            {T.detailReceivedNote}
          </Txt>
          {r.received ? <Button label={T.openRecord} icon={ReceiptText} tone="soft" onPress={() => router.push(`/registro/${r.received!.recordId}`)} /> : null}
        </>
      )}
      {/* A lista que já está na pilha (quem veio de "Ver o valor a receber", na entrada, ganha a lista no lugar do detalhe). */}
      <Button label={T.backToList} tone="ghost" onPress={() => router.dismissTo(RECEIVABLES_PATH)} />
      <ConfirmDialog
        visible={confirming}
        title={T.removeTitle}
        cancelLabel="Cancelar"
        confirmLabel={T.remove}
        busy={remove.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={doDelete}>
        <MoneyTxt style={{ fontFamily: fonts.bold }}>{`${r.description} · ${formatBRL(r.amountCents)}`}</MoneyTxt>
        <Txt color={colors.textSecondary}>{T.removeBody}</Txt>
      </ConfirmDialog>
    </>
  );
}

function Row({ label, value, last, money }: { label: string; value: string; last?: boolean; money?: boolean }) {
  return (
    <View style={[styles.row, !last && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
      <Txt variant="label" color={colors.textSecondary}>
        {label}
      </Txt>
      {money ? (
        <MoneyTxt variant="label" style={styles.value}>
          {value}
        </MoneyTxt>
      ) : (
        <Txt variant="label" style={styles.value}>
          {value}
        </Txt>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    alignSelf: 'flex-start',
    backgroundColor: colors.brandTint,
    paddingHorizontal: space[3],
    paddingVertical: space[1],
    borderRadius: radius.sm,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space[4], paddingVertical: space[3], minHeight: 44, alignItems: 'center' },
  value: { fontFamily: fonts.bold, flexShrink: 1, textAlign: 'right' },
});
