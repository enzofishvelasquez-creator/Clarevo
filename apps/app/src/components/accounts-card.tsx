import { ACCOUNTS_TEXT, canAddActiveAccount, type AccountKind, type FinancialAccount } from '@clarevo/core';
import { router } from 'expo-router';
import { ChevronRight, Coins, Landmark, Plus, Wallet, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { ErrorState, LoadingState } from '@/components/states';
import { TermHint } from '@/components/term-hint';
import { Button, Card, Txt } from '@/components/ui';
import { useAccounts } from '@/state/data';
import { colors, fonts, radius, space } from '@/theme/tokens';

const ICON: Record<AccountKind, LucideIcon> = { banco: Landmark, dinheiro: Wallet, outra: Coins };

/**
 * "Suas contas" em Conta (D-043): as contas de onde sai o dinheiro, com o tipo e a marca "Principal" ou "Arquivada". Tocar numa conta
 * abre o formulário (renomear, mudar o tipo, tornar principal, arquivar ou reativar, excluir); "Adicionar conta" abre o cadastro. A conta
 * só informa a origem: o Clarevo não guarda saldo por conta nem movimenta dinheiro.
 */
export function AccountsCard({ contextId }: { contextId: string | undefined }) {
  const accounts = useAccounts(contextId);
  return (
    <Card style={{ gap: space[3] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {ACCOUNTS_TEXT.title}
      </Txt>
      <Txt variant="caption" color={colors.textSecondary}>
        {ACCOUNTS_TEXT.intro}
      </Txt>
      {accounts.isError ? (
        <ErrorState message={ACCOUNTS_TEXT.loadFailed} onRetry={() => accounts.refetch()} />
      ) : !accounts.data ? (
        <LoadingState />
      ) : (
        <>
          <View>
            {accounts.data.map((a, i) => (
              <AccountRow key={a.id} account={a} last={i === accounts.data.length - 1} />
            ))}
          </View>
          <Button
            label={ACCOUNTS_TEXT.add}
            icon={Plus}
            tone="soft"
            disabled={!canAddActiveAccount(accounts.data)}
            onPress={() => router.push('/contas/nova')}
          />
          {canAddActiveAccount(accounts.data) ? null : (
            <Txt variant="caption" color={colors.textSecondary}>
              {ACCOUNTS_TEXT.limitNote}
            </Txt>
          )}
        </>
      )}
      <Txt variant="caption" color={colors.textSecondary}>
        {ACCOUNTS_TEXT.balanceNote}
      </Txt>
      <TermHint term="Saldo inicial" slug="saldo" />
    </Card>
  );
}

function AccountRow({ account, last }: { account: FinancialAccount; last: boolean }) {
  const Icon = ICON[account.kind];
  const archived = account.status === 'arquivada';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={ACCOUNTS_TEXT.rowA11y(account.name, account.kind, account.isDefault, account.status)}
      onPress={() => router.push(`/contas/${account.id}/editar`)}
      style={(s) => [
        styles.row,
        !last && styles.divider,
        s.pressed && { opacity: 0.7 },
        (s as { focused?: boolean }).focused && styles.focusRing,
      ]}>
      <View style={styles.icon}>
        <Icon size={20} color={archived ? colors.textSecondary : colors.brand} strokeWidth={2.25} aria-hidden />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 15 }} color={archived ? colors.textSecondary : colors.text} numberOfLines={2}>
          {account.name}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {ACCOUNTS_TEXT.rowCaption(account.kind, account.isDefault, account.status)}
        </Txt>
      </View>
      <ChevronRight size={20} color={colors.textSecondary} aria-hidden />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 10, minHeight: 56 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  icon: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
  focusRing: { outlineWidth: 3, outlineColor: colors.brand, outlineStyle: 'solid', outlineOffset: 2 } as object,
});
