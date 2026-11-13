import {
  ERROR_TEXT,
  INVESTMENT_NOTE_MAX,
  INVESTMENT_TEXT,
  applyInvestmentChange,
  formatDateBR,
  investmentErrorText,
  investmentMovementError,
  investmentNegativeDay,
  isRepoError,
  maskDateBR,
  newOperationKey,
  parseBRL,
  parseDateBR,
  centsToInput,
  INCOME_KIND_LABEL,
  INCOME_TEXT,
  INVESTMENT_INCOME_KINDS,
  type Investment,
  type InvestmentIncomeKind,
  type InvestmentMovement,
  type InvestmentMovementKind,
} from '@clarevo/core';
import { router, useLocalSearchParams } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, View, type TextInput } from 'react-native';

import { formatMoneyText } from '@/components/calc/parts';
import { ConfirmDialog } from '@/components/dialog';
import { FormFooter } from '@/components/form-footer';
import { ContextPill, SubHeader } from '@/components/header';
import { useLeaveGuard } from '@/components/leave-guard';
import { ChoiceGroup } from '@/components/series-parts';
import { ErrorState, LoadingState } from '@/components/states';
import { Button, Card, Chip, Screen, TextField, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { useInvalidateInvestments, useInvestment, useInvestmentMovements } from '@/state/data';
import { useRepo, useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

const M = INVESTMENT_TEXT.movement;
const KINDS: readonly InvestmentMovementKind[] = ['aporte', 'resgate', 'rendimento', 'valor'];

/**
 * Movimento de um investimento (D-093): /investimento/<id>/movimento?tipo=aporte|resgate|rendimento|valor para registrar, ou
 * ?movimento=<id> para alterar ou excluir. Antes de enviar, confere o saldo dia a dia (I1), como o banco. No rendimento recebido, o tipo
 * (juros ou cupom, dividendos, JCP, rendimento de FII ou outro, D-099) alimenta os proventos e o resumo para a declaração.
 */
export default function InvestimentoMovimentoScreen() {
  const { id, tipo, movimento } = useLocalSearchParams<{ id: string; tipo?: string; movimento?: string }>();
  const one = useInvestment(id);
  const movements = useInvestmentMovements(id);
  if (one.isSuccess && one.data && movements.isSuccess) {
    const existing = movimento ? (movements.data.find((m) => m.id === movimento) ?? null) : null;
    if (!movimento || existing) {
      const kind: InvestmentMovementKind = existing ? existing.kind : KINDS.includes(tipo as InvestmentMovementKind) ? (tipo as InvestmentMovementKind) : 'aporte';
      return <MovementForm key={`${tipo ?? ''}-${movimento ?? ''}`} investment={one.data} movements={movements.data} kind={kind} existing={existing} />;
    }
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={M.aporte.title} right={<ContextPill label="Salvando em Pessoal" fixed />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        {one.isError || movements.isError ? (
          <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => (one.isError ? one.refetch() : movements.refetch())} />
        ) : one.isSuccess && movements.isSuccess ? (
          <Card style={{ gap: space[3] }}>
            <Txt>{INVESTMENT_TEXT.errors.notFound}</Txt>
            <Button label="Ir para Investimentos" onPress={() => router.replace('/investimentos')} />
          </Card>
        ) : (
          <LoadingState />
        )}
      </Screen>
    </View>
  );
}

function MovementForm({
  investment,
  movements,
  kind,
  existing,
}: {
  investment: Investment;
  movements: readonly InvestmentMovement[];
  kind: InvestmentMovementKind;
  existing: InvestmentMovement | null;
}) {
  const repo = useRepo();
  const { today } = useSession();
  const invalidate = useInvalidateInvestments();
  const texts = M[kind];
  const first = {
    amountText: existing ? centsToInput(existing.amountCents) : '',
    dateText: formatDateBR(existing?.occurredOn ?? today),
    note: existing?.note ?? '',
    // Só no novo: num rendimento já registrado sem tipo, nada é escolhido pela pessoa sem ela ver (revisão independente de 13/11/2026).
    incomeKind: existing ? existing.incomeKind : kind === 'rendimento' && (investment.subkind === 'fii' || investment.subkind === 'fiagro') ? 'fii' : null,
  };
  const [amountText, setAmountText] = useState(first.amountText);
  const [dateText, setDateText] = useState(first.dateText);
  const [note, setNote] = useState(first.note);
  const [incomeKind, setIncomeKind] = useState<InvestmentIncomeKind | null>(first.incomeKind);
  const [errors, setErrors] = useState<{ amountText?: string; dateText?: string; note?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [key] = useState(() => newOperationKey());
  const [deleteKey] = useState(() => newOperationKey());
  const amountRef = useRef<TextInput>(null);
  const dateRef = useRef<TextInput>(null);
  const dirty = amountText !== first.amountText || dateText !== first.dateText || note !== first.note || incomeKind !== first.incomeKind;
  const guard = useLeaveGuard(dirty && !busy, `/investimento/${investment.id}`);
  const closed = investment.status !== 'ativo';
  const back = () => guard.leave(() => (router.canGoBack() ? router.back() : router.replace(`/investimento/${investment.id}`)));

  const fail = (e: unknown) => {
    const code = isRepoError(e) ? e.code : 'desconhecido';
    const day = isRepoError(e) && e.detail?.startsWith('dia=') ? e.detail.slice(4) : null;
    if (code === 'valor_insuficiente') {
      setErrors({ amountText: investmentErrorText(code, day) });
      amountRef.current?.focus();
      return;
    }
    if (code === 'versao_desatualizada' || code === 'chave_reutilizada') invalidate();
    setError(code === 'chave_reutilizada' ? 'Pode ser que já tenha sido salvo. Confira o histórico antes de tentar de novo.' : investmentErrorText(code));
  };

  async function submit() {
    if (busy || closed) return;
    setError(null);
    const amountCents = parseBRL(amountText);
    const occurredOn = parseDateBR(dateText);
    const trimmed = note.trim() === '' ? null : note.trim();
    const errs: typeof errors = {};
    if (amountCents === null) errs.amountText = amountText.trim() === '' ? 'Informe um valor.' : INVESTMENT_TEXT.errors.amount;
    if (!occurredOn) errs.dateText = INVESTMENT_TEXT.errors.date;
    if (Object.keys(errs).length === 0) {
      const code = investmentMovementError(kind, { amountCents: amountCents!, occurredOn: occurredOn!, note: trimmed }, today);
      if (code === 'valor_invalido') errs.amountText = INVESTMENT_TEXT.errors.amount;
      else if (code === 'data_futura') errs.dateText = INVESTMENT_TEXT.errors.future;
      else if (code === 'data_invalida') errs.dateText = INVESTMENT_TEXT.errors.date;
      else if (code === 'observacao_invalida') errs.note = `Use até ${INVESTMENT_NOTE_MAX} caracteres.`;
    }
    if (Object.keys(errs).length === 0) {
      const day = investmentNegativeDay(
        applyInvestmentChange(
          movements,
          existing ? { op: 'update', id: existing.id, amountCents: amountCents!, occurredOn: occurredOn! } : { op: 'add', kind, amountCents: amountCents!, occurredOn: occurredOn! },
        ),
      );
      if (day) errs.amountText = INVESTMENT_TEXT.errors.negative(day);
    }
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      if (errs.amountText) amountRef.current?.focus();
      else if (errs.dateText) dateRef.current?.focus();
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const input = { amountCents: amountCents!, occurredOn: occurredOn!, note: trimmed, incomeKind: kind === 'rendimento' ? incomeKind : null };
      if (existing) await repo.updateInvestmentMovement(key, existing.id, existing.version, input);
      else await repo.addInvestmentMovement(key, investment.id, kind, input);
      invalidate();
      flash.set(existing ? M.updated : texts.saved);
      back();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (busy || !existing) return;
    const day = investmentNegativeDay(applyInvestmentChange(movements, { op: 'delete', id: existing.id }));
    if (day) {
      setConfirmDelete(false);
      setError(INVESTMENT_TEXT.errors.negative(day));
      return;
    }
    setBusy(true);
    try {
      await repo.deleteInvestmentMovement(deleteKey, existing.id, existing.version);
      invalidate();
      setConfirmDelete(false);
      flash.set(M.deleted);
      back();
    } catch (e) {
      setConfirmDelete(false);
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubHeader title={existing ? INVESTMENT_TEXT.movementLabel[kind] : texts.title} onBack={guard.requestCancel} right={<ContextPill label="Salvando em Pessoal" fixed />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4], paddingBottom: space[6] }}>
        <Txt variant="label" style={{ fontWeight: '700' }}>
          {investment.name}
        </Txt>
        <Txt color={colors.textSecondary}>{texts.hint}</Txt>
        {closed ? <Txt color={colors.error}>{INVESTMENT_TEXT.errors.closed}</Txt> : null}
        <Card style={{ gap: space[4] }}>
          <TextField
            ref={amountRef}
            label={kind === 'valor' ? M.valueLabel : M.amountLabel}
            prefix="R$"
            large
            placeholder="0,00"
            keyboardType="decimal-pad"
            inputMode="decimal"
            value={amountText}
            onChangeText={(t) => {
              setAmountText(t);
              if (errors.amountText) setErrors((e) => ({ ...e, amountText: undefined }));
            }}
            onBlur={() => setAmountText(formatMoneyText(amountText))}
            error={errors.amountText}
          />
          <TextField
            ref={dateRef}
            label={M.dateLabel}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={10}
            value={dateText}
            onChangeText={(t) => {
              setDateText(maskDateBR(t));
              if (errors.dateText) setErrors((e) => ({ ...e, dateText: undefined }));
            }}
            error={errors.dateText}
          />
          {kind === 'rendimento' ? (
            <ChoiceGroup label="Tipo do rendimento (opcional)" hint={INCOME_TEXT.kindHint}>
              {INVESTMENT_INCOME_KINDS.map((k) => (
                <Chip key={k} label={INCOME_KIND_LABEL[k]} selected={incomeKind === k} onPress={() => setIncomeKind(incomeKind === k ? null : k)} />
              ))}
            </ChoiceGroup>
          ) : null}
          {kind === 'rendimento' && incomeKind === 'jcp' ? (
            <Txt variant="caption" color={colors.textSecondary}>
              {INCOME_TEXT.jcpNote}
            </Txt>
          ) : null}
          <TextField label={M.noteLabel} value={note} maxLength={INVESTMENT_NOTE_MAX} onChangeText={setNote} error={errors.note} />
        </Card>
        {existing && !closed ? <Button label={M.delete} icon={Trash2} tone="ghost" onPress={() => setConfirmDelete(true)} /> : null}
      </Screen>
      <FormFooter error={error} onCancel={guard.requestCancel} submitLabel={existing ? M.save : texts.title} busy={busy} onSubmit={submit} />
      <ConfirmDialog
        visible={confirmDelete}
        title={`${M.delete}?`}
        cancelLabel={INVESTMENT_TEXT.detail.cancel}
        confirmLabel={M.delete}
        busy={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={doDelete}>
        <Txt color={colors.textSecondary}>{`${INVESTMENT_TEXT.movementLabel[kind]} de ${formatDateBR(existing?.occurredOn ?? today)}.`}</Txt>
      </ConfirmDialog>
      {guard.dialog}
    </KeyboardAvoidingView>
  );
}
