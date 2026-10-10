import {
  ACCOUNTS_TEXT,
  ERROR_TEXT,
  GOALS_TEXT,
  GOAL_ERROR_TEXT,
  GOAL_MOVEMENT_FIELD_ORDER,
  GOAL_NOTE_MAX,
  MOVEMENT_LABEL,
  accountsForPicker,
  addDays,
  centsToInput,
  chooseAccountId,
  firstNegativeDay,
  formatDateBR,
  goalErrorText,
  maskDateBR,
  negativeDayFromDetail,
  validateGoalMovementDraft,
  validateSavedValueDraft,
  type Goal,
  type GoalMovement,
  type GoalMovementDraft,
  type GoalMovementField,
  type GoalMovementKind,
} from '@clarevo/core';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View, type TextInput } from 'react-native';

import { AccountPicker } from '@/components/account-picker';
import { formatMoneyText } from '@/components/calc/parts';
import { ConfirmDialog } from '@/components/dialog';
import { FormFooter } from '@/components/form-footer';
import { ContextPill, SubHeader } from '@/components/header';
import { useLeaveGuard } from '@/components/leave-guard';
import { MoneyTxt } from '@/components/money-text';
import { TermHint } from '@/components/term-hint';
import { Banner, Button, Card, Chip, Screen, TextField, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { guardedWrite } from '@/lib/guarded-write';
import { useLastAccount } from '@/lib/last-account';
import { maskMoneyLabel, maskMoneyText, useValuesHidden } from '@/lib/privacy';
import { useAccounts, useAddGoalMovement, useDeleteGoalMovement, useGoalOperationKey, useSpace, useUpdateGoalMovement } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, space } from '@/theme/tokens';

export type MovementMode =
  | { type: 'novo'; kind: 'aporte' | 'resgate' | 'rendimento' }
  /** "Atualizar valor guardado": a diferença vira valorização ou desvalorização. */
  | { type: 'atualizar' }
  | { type: 'editar'; movement: GoalMovement };

const M = GOALS_TEXT.movement;

function titleOf(mode: MovementMode): string {
  if (mode.type === 'atualizar') return GOALS_TEXT.update.title;
  if (mode.type === 'editar') return M.editTitle(mode.movement.kind);
  return M[mode.kind].title;
}

/**
 * Aporte, resgate, rendimento recebido, atualizar valor guardado e editar ou excluir um movimento (D-027, spec2 §4.6).
 * Aportes e resgates não são gasto nem renda: o dinheiro continua da pessoa. O saldo dia a dia é conferido aqui antes de
 * enviar (firstNegativeDay) e de novo no banco (saldo_da_meta_insuficiente). Meta arquivada não recebe movimentos.
 * Depois de salvar, a tela anterior mostra o aviso e a barra anima do valor anterior ao novo.
 */
export function GoalMovementForm({ goal, movements, mode }: { goal: Goal; movements: readonly GoalMovement[]; mode: MovementMode }) {
  const { today } = useSession();
  const hidden = useValuesHidden();
  const qc = useQueryClient();
  const add = useAddGoalMovement();
  const edit = useUpdateGoalMovement();
  const remove = useDeleteGoalMovement();
  const keys = useGoalOperationKey();
  const lastAccount = useLastAccount();
  const activeAccounts = useSpace().data?.accounts ?? [];
  const allAccounts = useAccounts(goal.contextId);
  const editing = mode.type === 'editar' ? mode.movement : null;
  // O movimento em edição pode ter mudado (outro aparelho): sempre o da lista mais recente.
  const current = editing ? (movements.find((m) => m.id === editing.id) ?? null) : null;
  const kind: GoalMovementKind = editing ? editing.kind : mode.type === 'novo' ? mode.kind : 'valorizacao';

  const initial = (() => {
    // A conta (D-043) só existe em aporte e resgate: o aporte novo abre na conta principal ou na última usada neste aparelho.
    if (editing) {
      return {
        amountText: centsToInput(editing.amountCents),
        dateText: formatDateBR(editing.occurredOn),
        note: editing.note ?? '',
        savedText: '',
        accountId: editing.accountId,
      };
    }
    return { amountText: '', dateText: formatDateBR(today), note: '', savedText: '', accountId: chooseAccountId(activeAccounts, lastAccount.last) || null };
  })();
  const [first] = useState(initial);
  const [amountText, setAmountText] = useState(first.amountText);
  const [dateText, setDateText] = useState(first.dateText);
  const [note, setNote] = useState(first.note);
  const [savedText, setSavedText] = useState(first.savedText);
  const [accountId, setAccountId] = useState<string | null>(first.accountId);
  const [errors, setErrors] = useState<Partial<Record<GoalMovementField | 'savedText', string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const refs: Record<GoalMovementField | 'savedText', React.RefObject<TextInput | null>> = {
    amountText: useRef<TextInput>(null),
    dateText: useRef<TextInput>(null),
    note: useRef<TextInput>(null),
    savedText: useRef<TextInput>(null),
  };

  const dirty = amountText !== first.amountText || dateText !== first.dateText || note !== first.note || savedText !== first.savedText || accountId !== first.accountId;
  const guard = useLeaveGuard(dirty && !busy, `/meta/${goal.id}`);
  const archived = goal.status === 'arquivada';

  const clear = (field: GoalMovementField | 'savedText') => {
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const draft: GoalMovementDraft = { kind, amountText, dateText, note };
  const withAccount = mode.type !== 'atualizar' && (kind === 'aporte' || kind === 'resgate');
  const saved = mode.type === 'atualizar' ? validateSavedValueDraft(savedText, goal.savedCents) : null;

  /**
   * Fim comum: o servidor confirmou (ou uma tentativa anterior estava gravada). A meta confirmada já está no cache; o
   * histórico recarrega antes de voltar, para a tela anterior mostrar o valor guardado e a lista de movimentos do mesmo
   * estado (a falha de rede nesse recarregamento não impede de voltar: a lista se atualiza quando a conexão voltar).
   */
  async function done(text: string) {
    flash.set(text);
    await qc.refetchQueries({ queryKey: ['goals', 'movements', goal.id] }).catch(() => undefined);
    guard.leave(() => (router.canGoBack() ? router.back() : router.replace(`/meta/${goal.id}`)));
  }

  function fail(code: string, detail: string | null) {
    if (code === 'versao_desatualizada' || code === 'nao_encontrado') qc.invalidateQueries({ queryKey: ['goals'] });
    if (code === 'saldo_da_meta_insuficiente') {
      setErrors({ amountText: goalErrorText(code, { kind, negativeDay: negativeDayFromDetail(detail) }) });
      refs.amountText.current?.focus();
      return;
    }
    if (code === 'conta_invalida' || code === 'campo_nao_se_aplica') {
      setError(code === 'conta_invalida' ? ERROR_TEXT.conta_invalida : GOAL_ERROR_TEXT.salvar_falhou);
      return;
    }
    if (code === 'data_futura' || code === 'data_invalida') {
      setErrors({ dateText: goalErrorText(code, { kind }) });
      refs.dateText.current?.focus();
      return;
    }
    setError(goalErrorText(code, { kind, negativeDay: negativeDayFromDetail(detail) }));
  }

  async function submit() {
    if (busy || archived) return;
    setError(null);

    if (mode.type === 'atualizar') {
      const v = validateSavedValueDraft(savedText, goal.savedCents);
      if (!v.ok) {
        setErrors({ savedText: v.error });
        refs.savedText.current?.focus();
        return;
      }
      if (v.change === null) return; // igual ao guardado: nada a registrar
      const change = v.change;
      setErrors({});
      setBusy(true);
      try {
        const input = { amountCents: change.amountCents, occurredOn: today, note: null };
        const r = await guardedWrite(
          keys,
          JSON.stringify([goal.id, change.kind, input]),
          (key) => add.mutateAsync({ key, goalId: goal.id, kind: change.kind, input }),
          (s) => s.action === 'registrar_movimento_meta' && s.goalId === goal.id,
        );
        if (r.status === 'ok' || r.status === 'reconciled') return await done(M[change.kind].saved);
        if (r.status === 'refused') return fail(r.code, r.detail);
        setError(GOAL_ERROR_TEXT.salvar_falhou);
      } finally {
        setBusy(false);
      }
      return;
    }

    const v = validateGoalMovementDraft(draft, today, { editing: Boolean(editing) });
    if (!v.ok) {
      setErrors(v.errors);
      const firstField = GOAL_MOVEMENT_FIELD_ORDER.find((f) => v.errors[f]);
      if (firstField) refs[firstField].current?.focus();
      else setError(GOAL_ERROR_TEXT.salvar_falhou);
      return;
    }
    // Saldo dia a dia: um resgate com data passada não pode atravessar o passado (G1).
    const negative = firstNegativeDay(
      movements,
      editing
        ? { op: 'update', id: editing.id, amountCents: v.input.amountCents, occurredOn: v.input.occurredOn }
        : { op: 'add', kind, amountCents: v.input.amountCents, occurredOn: v.input.occurredOn },
    );
    // A conta (D-043) só vai em aporte e resgate; ao editar, nula tira a conta.
    const input = withAccount ? { ...v.input, accountId } : v.input;
    if (negative !== null) {
      setErrors({ amountText: goalErrorText('saldo_da_meta_insuficiente', { kind, negativeDay: negative }) });
      refs.amountText.current?.focus();
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const snapshot = JSON.stringify([goal.id, editing?.id ?? null, editing?.version ?? 0, kind, input]);
      const r = await guardedWrite(
        keys,
        snapshot,
        (key) =>
          editing && current
            ? edit.mutateAsync({ key, movementId: editing.id, version: current.version, input })
            : add.mutateAsync({ key, goalId: goal.id, kind, input }),
        (s) => (editing ? s.action === 'alterar_movimento_meta' && s.movementId === editing.id : s.action === 'registrar_movimento_meta' && s.goalId === goal.id),
      );
      if (r.status === 'ok' || r.status === 'reconciled') {
        if (withAccount) lastAccount.remember(accountId);
        return await done(editing ? M.updated : M[kind === 'saldo_inicial' ? 'aporte' : kind].saved);
      }
      if (r.status === 'refused') return fail(r.code, r.detail);
      setError(GOAL_ERROR_TEXT.salvar_falhou);
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (busy || !editing || !current) return;
    const negative = firstNegativeDay(movements, { op: 'delete', id: current.id });
    if (negative !== null) {
      setConfirmDelete(false);
      setError(goalErrorText('saldo_da_meta_insuficiente', { kind, negativeDay: negative }));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await guardedWrite(
        keys,
        JSON.stringify(['excluir', current.id, current.version]),
        (key) => remove.mutateAsync({ key, movementId: current.id, version: current.version }),
        (s) => s.action === 'excluir_movimento_meta' && s.movementId === current.id,
      );
      setConfirmDelete(false);
      if (r.status === 'ok' || r.status === 'reconciled') return await done(M.deleted);
      if (r.status === 'refused') return fail(r.code, r.detail);
      setError(GOAL_ERROR_TEXT.salvar_falhou);
    } finally {
      setBusy(false);
    }
  }

  const submitLabel =
    mode.type === 'atualizar'
      ? saved && saved.ok && saved.change
        ? GOALS_TEXT.update.button(saved.change.kind, saved.change.amountCents)
        : GOALS_TEXT.update.title
      : mode.type === 'editar'
        ? M.save
        : M[mode.kind].title;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubHeader title={titleOf(mode)} onBack={guard.requestCancel} right={<ContextPill label="Salvando em Pessoal" />} />
      <Screen contentStyle={styles.body}>
        {archived ? (
          <Banner tone="info">
            <Txt variant="label">{GOAL_ERROR_TEXT.meta_arquivada}</Txt>
          </Banner>
        ) : null}
        {editing && !current ? (
          <Banner tone="info">
            <Txt variant="label">{GOAL_ERROR_TEXT.nao_encontrado}</Txt>
          </Banner>
        ) : null}

        <Card style={{ gap: space[4] }}>
          <Txt variant="caption" color={colors.textSecondary}>
            {goal.name}
          </Txt>

          {mode.type === 'atualizar' ? (
            <>
              <TextField
                ref={refs.savedText}
                label={GOALS_TEXT.update.question}
                prefix="R$"
                large
                placeholder="0,00"
                keyboardType="decimal-pad"
                inputMode="decimal"
                autoFocus
                value={savedText}
                onChangeText={(t) => {
                  setSavedText(t);
                  clear('savedText');
                }}
                onBlur={() => setSavedText(formatMoneyText(savedText))}
                error={errors.savedText}
              />
              {saved && saved.ok ? (
                <MoneyTxt variant="label" style={{ fontFamily: fonts.bold }} accessibilityLiveRegion="polite">
                  {saved.change ? GOALS_TEXT.update.preview(saved.change.kind, saved.change.amountCents) : GOALS_TEXT.update.same}
                </MoneyTxt>
              ) : null}
            </>
          ) : (
            <>
              {editing ? (
                <Txt variant="label" style={{ fontFamily: fonts.bold }}>
                  {MOVEMENT_LABEL[editing.kind]}
                </Txt>
              ) : (
                <Txt variant="label" color={colors.textSecondary}>
                  {M[(mode as { kind: 'aporte' | 'resgate' | 'rendimento' }).kind].help}
                </Txt>
              )}
              {kind === 'aporte' ? <TermHint term="Aporte" slug="aporte" /> : null}
              <TextField
                ref={refs.amountText}
                label={M.amountLabel}
                prefix="R$"
                large
                placeholder="0,00"
                keyboardType="decimal-pad"
                inputMode="decimal"
                autoFocus={!editing}
                value={amountText}
                onChangeText={(t) => {
                  setAmountText(t);
                  clear('amountText');
                }}
                onBlur={() => setAmountText(formatMoneyText(amountText))}
                error={errors.amountText}
              />
              <View style={{ gap: space[2] }}>
                <TextField
                  ref={refs.dateText}
                  label={M.dateLabel}
                  placeholder="DD/MM/AAAA"
                  keyboardType="number-pad"
                  inputMode="numeric"
                  maxLength={10}
                  value={dateText}
                  onChangeText={(t) => {
                    setDateText(maskDateBR(t));
                    clear('dateText');
                  }}
                  error={errors.dateText}
                  hint="Digite só os números. Só datas até hoje."
                />
                <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Atalhos de data">
                  <Chip label={M.today} selected={dateText === formatDateBR(today)} onPress={() => setDateText(formatDateBR(today))} />
                  <Chip
                    label={M.yesterday}
                    selected={dateText === formatDateBR(addDays(today, -1))}
                    onPress={() => setDateText(formatDateBR(addDays(today, -1)))}
                  />
                </View>
              </View>
              {withAccount ? (
                <AccountPicker
                  accounts={accountsForPicker(activeAccounts, allAccounts.data, editing?.accountId ?? null)}
                  value={accountId}
                  label={kind === 'resgate' ? ACCOUNTS_TEXT.to : ACCOUNTS_TEXT.out}
                  allowNone={editing !== null}
                  onChange={setAccountId}
                />
              ) : null}
              <TextField
                ref={refs.note}
                label={M.noteLabel}
                maxLength={GOAL_NOTE_MAX}
                value={note}
                onChangeText={(t) => {
                  setNote(t);
                  clear('note');
                }}
                error={errors.note}
              />
            </>
          )}
        </Card>

        {mode.type === 'novo' && mode.kind === 'aporte' ? (
          <Txt variant="label" color={colors.textSecondary}>
            {GOALS_TEXT.detail.rule}
          </Txt>
        ) : null}

        {editing && current ? (
          <Button label={M.deleteConfirm} icon={Trash2} tone="danger" disabled={busy || archived} onPress={() => setConfirmDelete(true)} />
        ) : null}
      </Screen>

      <FormFooter
        error={error}
        onCancel={guard.requestCancel}
        // A diferença revela o valor guardado: com valores ocultos, o botão mostra "R$ ••••" e o leitor diz "valor oculto".
        submitLabel={maskMoneyText(submitLabel, hidden)}
        submitAccessibilityLabel={hidden ? maskMoneyLabel(submitLabel, true) : undefined}
        busy={busy}
        disabled={archived || (editing !== null && current === null) || (saved !== null && saved.ok && saved.change === null)}
        onSubmit={submit}
      />

      <ConfirmDialog
        visible={confirmDelete}
        title={M.deleteTitle}
        cancelLabel="Cancelar"
        confirmLabel={M.deleteConfirm}
        busy={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={doDelete}>
        <Txt color={colors.textSecondary}>{M.deleteBody}</Txt>
      </ConfirmDialog>
      {guard.dialog}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space[5], gap: space[4], paddingBottom: space[6] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
});
