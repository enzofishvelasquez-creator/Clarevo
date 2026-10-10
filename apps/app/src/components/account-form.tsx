import {
  ACCOUNTS_TEXT,
  ACCOUNT_FIELD_ORDER,
  ACCOUNT_KINDS,
  ACCOUNT_KIND_LABEL,
  ACCOUNT_NAME_MAX,
  ERROR_TEXT,
  accountBlock,
  accountErrorText,
  activeAccounts,
  canAddActiveAccount,
  validateAccountDraft,
  type AccountDraft,
  type AccountKind,
  type FinancialAccount,
} from '@clarevo/core';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Archive, ArchiveRestore, Check, CircleAlert, Star, Trash2 } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View, type TextInput } from 'react-native';

import { ChoiceDialog } from '@/components/choice-dialog';
import { ConfirmDialog } from '@/components/dialog';
import { FormFooter } from '@/components/form-footer';
import { ContextPill, SubHeader } from '@/components/header';
import { useLeaveGuard } from '@/components/leave-guard';
import { ChoiceGroup } from '@/components/series-parts';
import { Banner, Button, Card, Chip, Screen, TextField, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { guardedWrite } from '@/lib/guarded-write';
import {
  useAccountOperationKey,
  useCreateAccount,
  useDeleteAccount,
  useSetAccountStatus,
  useSetDefaultAccount,
  useUpdateAccount,
} from '@/state/data';
import { colors, space } from '@/theme/tokens';

export type AccountFormMode = { type: 'novo' } | { type: 'editar'; account: FinancialAccount };

const T = ACCOUNTS_TEXT;
const BACK = '/conta';

/**
 * Nova conta e Editar conta (D-043): nome, tipo (conta bancária, dinheiro ou outra) e, ao editar, a situação: tornar principal,
 * arquivar (a principal só se arquiva escolhendo outra), reativar e excluir (só sem lançamentos). A conta só informa a origem do
 * dinheiro: não existe saldo por conta. Rascunho preservado em qualquer erro; a chave de operação reconcilia um resultado incerto;
 * nada de aviso antes de o servidor confirmar. `accounts` são todas as contas não excluídas (para o nome repetido e a nova principal).
 */
export function AccountForm({ mode, contextId, accounts }: { mode: AccountFormMode; contextId: string; accounts: readonly FinancialAccount[] }) {
  const qc = useQueryClient();
  const create = useCreateAccount();
  const update = useUpdateAccount();
  const makeDefault = useSetDefaultAccount();
  const setStatus = useSetAccountStatus();
  const remove = useDeleteAccount();
  const keys = useAccountOperationKey();
  const account = mode.type === 'editar' ? mode.account : null;

  const [initial] = useState<AccountDraft>(() => ({ name: account?.name ?? '', kind: account?.kind ?? 'banco' }));
  const [draft, setDraft] = useState<AccountDraft>(initial);
  const [errors, setErrors] = useState<Partial<Record<'name' | 'kind', string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  /** Aviso das ações que ficam na tela (tornar principal, arquivar, reativar), depois de o servidor confirmar. */
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [chooseDefault, setChooseDefault] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const nameRef = useRef<TextInput>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const guard = useLeaveGuard(dirty && !busy, BACK);
  const set = <K extends keyof AccountDraft>(k: K, v: AccountDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    if (k === 'name' || k === 'kind') setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const done = (text: string, leave = true) => {
    // Confirmação tátil e aviso só depois de o servidor confirmar.
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (leave) {
      flash.set(text);
      guard.leave(() => (router.canGoBack() ? router.back() : router.replace(BACK)));
    } else {
      setNotice(text);
    }
  };

  async function submit() {
    if (busy) return;
    const v = validateAccountDraft(draft, accounts, account?.id);
    if (!v.ok) {
      setErrors(v.errors);
      setError(null);
      const first = ACCOUNT_FIELD_ORDER.find((f) => v.errors[f]);
      if (first === 'name') nameRef.current?.focus();
      return;
    }
    // Só conta ativa ocupa uma das 10 vagas: o banco repete a conferência.
    if (!account && !canAddActiveAccount(accounts)) {
      setError(accountErrorText('limite_de_contas'));
      return;
    }
    setErrors({});
    setError(null);
    setBusy(true);
    try {
      const r = await guardedWrite(
        keys,
        JSON.stringify([account?.id ?? null, account?.version ?? 0, v.input]),
        (key) =>
          account
            ? update.mutateAsync({ key, id: account.id, version: account.version, input: v.input })
            : create.mutateAsync({ key, contextId, input: v.input }),
        (s) => (account ? s.action === 'alterar_conta' && s.accountId === account.id : s.action === 'criar_conta'),
      );
      if (r.status === 'ok' || r.status === 'reconciled') return done(account ? T.saved : T.created);
      if (r.status === 'refused') {
        if (r.code === 'versao_desatualizada' || r.code === 'nao_encontrado') qc.invalidateQueries({ queryKey: ['accounts'] });
        if (r.code === 'nome_da_conta_invalido' || r.code === 'nome_da_conta_repetido') {
          setErrors({ name: accountErrorText(r.code) });
          nameRef.current?.focus();
          return;
        }
        if (r.code === 'tipo_da_conta_invalido') {
          setErrors({ kind: accountErrorText(r.code) });
          return;
        }
        setError(accountErrorText(r.code));
        return;
      }
      setError(ERROR_TEXT.salvar_falhou);
    } finally {
      setBusy(false);
    }
  }

  /** Tornar principal, arquivar, reativar e excluir: cada uma é uma escrita própria, com a versão atual da conta. */
  async function run(
    what: 'principal' | 'arquivar' | 'reativar' | 'excluir',
    newDefaultId: string | null = null,
  ) {
    if (busy || !account) return;
    setActionError(null);
    setNotice(null);
    setBusy(true);
    try {
      const version = account.version;
      const r = await guardedWrite(
        keys,
        JSON.stringify([account.id, version, what, newDefaultId]),
        (key) => {
          if (what === 'principal') return makeDefault.mutateAsync({ key, id: account.id, version });
          if (what === 'excluir') return remove.mutateAsync({ key, id: account.id, version });
          return setStatus.mutateAsync({ key, id: account.id, version, status: what === 'arquivar' ? 'arquivada' : 'ativa', newDefaultId });
        },
        (s) =>
          s.accountId === account.id &&
          s.action === (what === 'principal' ? 'conta_principal' : what === 'excluir' ? 'excluir_conta' : 'situacao_conta'),
      );
      setChooseDefault(false);
      setConfirmDelete(false);
      if (r.status === 'ok' || r.status === 'reconciled') {
        const text = { principal: T.defaultSet, arquivar: T.archivedDone, reativar: T.reactivated, excluir: T.deleted }[what];
        return done(text, what === 'excluir');
      }
      if (r.status === 'refused') {
        if (r.code === 'versao_desatualizada' || r.code === 'nao_encontrado') qc.invalidateQueries({ queryKey: ['accounts'] });
        setActionError(accountErrorText(r.code));
        return;
      }
      setActionError(ERROR_TEXT.salvar_falhou);
    } finally {
      setBusy(false);
    }
  }

  const others = account ? activeAccounts(accounts).filter((a) => a.id !== account.id) : [];
  const archiveBlock = account ? accountBlock(accounts, account, 'archive') : null;
  const deleteBlock = account ? accountBlock(accounts, account, 'delete') : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubHeader title={account ? T.editTitle : T.newTitle} onBack={guard.requestCancel} right={<ContextPill label="Salvando em Pessoal" />} />
      <Screen contentStyle={styles.body}>
        <Card style={{ gap: space[4] }}>
          <TextField
            ref={nameRef}
            label={T.nameLabel}
            hint={T.nameHint}
            value={draft.name}
            onChangeText={(t) => set('name', t)}
            maxLength={ACCOUNT_NAME_MAX}
            autoFocus={mode.type === 'novo'}
            error={errors.name}
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          <ChoiceGroup label={T.kindLabel} error={errors.kind}>
            {ACCOUNT_KINDS.map((k: AccountKind) => (
              <Chip key={k} label={ACCOUNT_KIND_LABEL[k]} selected={draft.kind === k} onPress={() => set('kind', k)} />
            ))}
          </ChoiceGroup>
          <Txt variant="caption" color={colors.textSecondary}>
            {T.balanceNote}
          </Txt>
        </Card>

        {account ? (
          <Card style={{ gap: space[3] }}>
            <Txt variant="title" accessibilityRole="header" aria-level={2}>
              {T.statusTitle}
            </Txt>
            <Txt variant="label" color={colors.textSecondary}>
              {T.rowCaption(account.kind, account.isDefault, account.status)}
            </Txt>
            {notice ? (
              <Banner tone="sucesso" icon={Check}>
                <Txt variant="label" color={colors.successText}>
                  {notice}
                </Txt>
              </Banner>
            ) : null}
            {actionError ? (
              <Banner tone="erro" icon={CircleAlert}>
                <Txt variant="label" color={colors.error}>
                  {actionError}
                </Txt>
              </Banner>
            ) : null}
            {account.status === 'ativa' && !account.isDefault ? (
              <Button label={T.makeDefault} icon={Star} tone="soft" disabled={busy} onPress={() => run('principal')} />
            ) : null}
            {account.status === 'ativa' ? (
              <>
                <Button
                  label={T.archive}
                  icon={Archive}
                  tone="soft"
                  disabled={busy || archiveBlock !== null}
                  onPress={() => (account.isDefault ? setChooseDefault(true) : run('arquivar'))}
                />
                {archiveBlock ? (
                  <Txt variant="caption" color={colors.textSecondary}>
                    {accountErrorText(archiveBlock)}
                  </Txt>
                ) : null}
              </>
            ) : (
              <Button label={T.reactivate} icon={ArchiveRestore} tone="soft" disabled={busy} onPress={() => run('reativar')} />
            )}
            {deleteBlock === null ? (
              <Button label={T.delete} icon={Trash2} tone="danger" disabled={busy} onPress={() => setConfirmDelete(true)} />
            ) : (
              <Txt variant="caption" color={colors.textSecondary}>
                {accountErrorText(deleteBlock)}
              </Txt>
            )}
          </Card>
        ) : null}
      </Screen>

      <FormFooter error={error} onCancel={guard.requestCancel} submitLabel={account ? T.save : T.create} busy={busy} onSubmit={submit} />

      <ChoiceDialog
        visible={chooseDefault}
        title={T.chooseDefaultTitle}
        choices={others.map((a) => ({ label: T.chooseDefaultChoice(a.name), tone: 'soft' as const, onPress: () => run('arquivar', a.id) }))}
        cancelLabel={T.cancel}
        busy={busy}
        onCancel={() => setChooseDefault(false)}>
        <Txt color={colors.textSecondary}>{T.chooseDefaultBody}</Txt>
      </ChoiceDialog>
      <ConfirmDialog
        visible={confirmDelete}
        title={T.deleteTitle}
        cancelLabel={T.cancel}
        confirmLabel={T.deleteConfirm}
        busy={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => run('excluir')}>
        <Txt color={colors.textSecondary}>{T.deleteBody}</Txt>
      </ConfirmDialog>
      {guard.dialog}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space[5], gap: space[4], paddingBottom: space[6] },
});
