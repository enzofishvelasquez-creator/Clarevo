import {
  BUSINESS_TEXT,
  NO_CATEGORY_LABEL,
  activeAccounts,
  businessErrorText,
  canMoveRecord,
  contextCategories,
  formatBRL,
  formatDateBR,
  suggestMoveCategory,
  type ContextKind,
  type FinancialAccount,
  type FinancialRecord,
} from '@clarevo/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AccountPicker } from '@/components/account-picker';
import { FormFooter } from '@/components/form-footer';
import { ContextPill, SubHeader } from '@/components/header';
import { MoneyTxt } from '@/components/money-text';
import { ChoiceGroup } from '@/components/series-parts';
import { ErrorState, LoadingState } from '@/components/states';
import { Button, Card, Chip, Screen, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { useBusiness, useMoveRecord } from '@/state/business';
import { useAccounts, useRecord, useSpace, useView } from '@/state/data';
import { attemptFamily, useFamilyKeys } from '@/state/family';
import { colors, fonts, space } from '@/theme/tokens';

const T = BUSINESS_TEXT;

/**
 * Mover um lançamento para o espaço Negócio ou para o Pessoal (D-113), para quem anotou no lugar errado. O lançamento sai daqui e é
 * gravado de novo no outro espaço, com a categoria e a conta escolhidas, numa operação só. Lançamento ligado (conta a pagar, fatura,
 * rendimento ou retirada) não muda de espaço.
 */
export default function MoverRegistroScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const record = useRecord(id);
  const business = useBusiness();
  const personal = useSpace();
  const r = record.data;
  const toBusiness = Boolean(r && personal.data && r.contextId === personal.data.personalContextId);
  const fromBusiness = Boolean(r && business.data && r.contextId === business.data.id);
  const targetId = toBusiness ? business.data?.id : fromBusiness ? personal.data?.personalContextId : undefined;
  const otherAccounts = useAccounts(toBusiness ? business.data?.id : undefined);
  const back = () => (router.canGoBack() ? router.back() : router.replace(`/registro/${id}`));
  const header = <SubHeader title={toBusiness ? T.moveToBusiness : T.moveToPersonal} onBack={back} right={<ContextPill label={T.context} fixed />} />;

  const loading = record.isPending || business.isPending || personal.isPending || (toBusiness && otherAccounts.isPending);
  const failed = record.isError || business.isError || personal.isError || (toBusiness && otherAccounts.isError);
  if (loading || failed || !r || !business.data || !targetId || !canMoveRecord(r)) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {header}
        <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
          {failed ? (
            <ErrorState
              message={T.loadFailed}
              onRetry={() => {
                record.refetch();
                business.refetch();
                personal.refetch();
              }}
            />
          ) : loading ? (
            <LoadingState label={T.loading} />
          ) : (
            <Card style={{ gap: space[3] }}>
              <Txt>{r && !canMoveRecord(r) ? T.moveLinked : businessErrorText('nao_encontrado')}</Txt>
              <Button label="Voltar" tone="soft" onPress={back} />
            </Card>
          )}
        </Screen>
      </View>
    );
  }
  const targetKind: ContextKind = toBusiness ? 'negocio' : 'pessoal';
  const targetName = toBusiness ? business.data.name : 'Pessoal';
  const accounts = toBusiness ? activeAccounts(otherAccounts.data ?? []) : personal.data!.accounts;
  return <MoveForm record={r} targetId={targetId} targetKind={targetKind} targetName={targetName} accounts={accounts} header={header} onBack={back} />;
}

function MoveForm({
  record: r,
  targetId,
  targetKind,
  targetName,
  accounts,
  header,
  onBack,
}: {
  record: FinancialRecord;
  targetId: string;
  targetKind: ContextKind;
  targetName: string;
  accounts: FinancialAccount[];
  header: React.ReactNode;
  onBack: () => void;
}) {
  const move = useMoveRecord();
  const keys = useFamilyKeys();
  const { setSpace } = useView();
  const [category, setCategory] = useState<string | null>(() => suggestMoveCategory(r.category, r.kind, targetKind));
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [accountError, setAccountError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const categories = contextCategories(targetKind, r.kind);

  async function submit() {
    if (busy) return;
    if (!accountId) {
      setAccountError(businessErrorText('conta_invalida'));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await attemptFamily(keys, `mover:${r.id}:${r.version}:${targetId}:${accountId}:${category ?? ''}`, (key) =>
        move.mutateAsync({ key, recordId: r.id, version: r.version, targetContextId: targetId, accountId, category }),
      );
      if (res.ok) {
        flash.set(T.moved(targetName));
        setSpace(targetKind === 'negocio' ? 'negocio' : 'pessoal');
        router.replace(`/registro/${res.value.id}`);
        return;
      }
      setError(businessErrorText(res.code));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {header}
      <Screen contentStyle={{ padding: space[5], gap: space[4], paddingBottom: space[6] }}>
        <Txt color={colors.textSecondary}>{T.moveHint}</Txt>
        <Txt variant="label" style={{ fontFamily: fonts.bold }}>
          {T.moveTitle(targetName)}
        </Txt>
        <Card style={{ gap: space[2] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {r.description}
          </Txt>
          <MoneyTxt style={{ fontFamily: fonts.bold }}>{`${r.kind === 'despesa' ? 'Gasto' : 'Recebimento'} · ${formatBRL(r.amountCents)} · ${formatDateBR(r.occurredOn)}`}</MoneyTxt>
          <Txt variant="caption" color={colors.textSecondary}>
            {`Categoria aqui: ${r.category ?? NO_CATEGORY_LABEL}`}
          </Txt>
        </Card>
        <Card style={{ gap: space[4] }}>
          <ChoiceGroup label={T.moveCategory}>
            <Chip label={NO_CATEGORY_LABEL} selected={category === null} onPress={() => setCategory(null)} />
            {categories.map((c) => (
              <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} />
            ))}
          </ChoiceGroup>
          <AccountPicker
            accounts={accounts}
            value={accountId}
            onChange={(v) => {
              setAccountId(v ?? '');
              setAccountError(undefined);
            }}
            label={T.moveAccount}
            error={accountError}
            hideManage
          />
        </Card>
      </Screen>
      <FormFooter error={error} onCancel={onBack} submitLabel={T.moveSubmit} busy={busy} onSubmit={submit} />
    </View>
  );
}

