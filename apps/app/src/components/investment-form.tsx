import {
  INVESTMENT_FIELD_ORDER,
  INVESTMENT_KINDS,
  INVESTMENT_KIND_LABEL,
  INVESTMENT_NAME_MAX,
  INVESTMENT_TEXT,
  formatDateBR,
  investmentErrorText,
  isRepoError,
  maskDateBR,
  newOperationKey,
  validateInvestmentDraft,
  type Investment,
  type InvestmentField,
  type InvestmentKind,
} from '@clarevo/core';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, type TextInput } from 'react-native';

import { formatMoneyText } from '@/components/calc/parts';
import { FormFooter } from '@/components/form-footer';
import { ContextPill, SubHeader } from '@/components/header';
import { useLeaveGuard } from '@/components/leave-guard';
import { ChoiceGroup } from '@/components/series-parts';
import { Card, Chip, Screen, TextField, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { useInvalidateInvestments } from '@/state/data';
import { useRepo, useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

const T = INVESTMENT_TEXT.form;

/**
 * Novo investimento e editar (D-093). Novo: nome, tipo, quanto aplicou até hoje (obrigatório), quanto vale hoje (opcional) e desde
 * quando (opcional, hoje sem ela). Editar: só nome e tipo; os valores mudam pelos movimentos.
 */
export function InvestmentForm({ contextId, investment }: { contextId: string; investment: Investment | null }) {
  const repo = useRepo();
  const { today } = useSession();
  const invalidate = useInvalidateInvestments();
  const editing = investment !== null;
  const [name, setName] = useState(investment?.name ?? '');
  const [kind, setKind] = useState<InvestmentKind | null>(investment?.kind ?? null);
  const [investedText, setInvestedText] = useState('');
  const [currentText, setCurrentText] = useState('');
  const [startText, setStartText] = useState('');
  const [errors, setErrors] = useState<Partial<Record<InvestmentField, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => newOperationKey());
  const refs: Record<InvestmentField, React.RefObject<TextInput | null>> = {
    name: useRef<TextInput>(null),
    kind: useRef<TextInput>(null),
    investedText: useRef<TextInput>(null),
    currentText: useRef<TextInput>(null),
    startText: useRef<TextInput>(null),
  };
  const dirty = name !== (investment?.name ?? '') || kind !== (investment?.kind ?? null) || investedText !== '' || currentText !== '' || startText !== '';
  const guard = useLeaveGuard(dirty && !busy, editing ? `/investimento/${investment!.id}` : '/investimentos');

  const clear = (f: InvestmentField) => {
    if (errors[f]) setErrors((e) => ({ ...e, [f]: undefined }));
  };

  async function submit() {
    if (busy) return;
    const v = validateInvestmentDraft({ name, kind, investedText, currentText, startText }, today, editing ? 'editar' : 'criar');
    if (!v.ok) {
      setErrors(v.errors);
      setError(null);
      const first = INVESTMENT_FIELD_ORDER.find((f) => v.errors[f]);
      if (first) refs[first].current?.focus();
      return;
    }
    setErrors({});
    setError(null);
    setBusy(true);
    try {
      const w = editing
        ? await repo.updateInvestment(key, investment!.id, investment!.version, { name: v.input.name, kind: v.input.kind })
        : await repo.createInvestment(key, contextId, v.input);
      invalidate();
      flash.set(editing ? T.saved : T.created);
      const id = w.investment?.id ?? investment?.id;
      guard.leave(() => (editing ? (router.canGoBack() ? router.back() : router.replace(`/investimento/${id}`)) : id ? router.replace(`/investimento/${id}`) : router.replace('/investimentos')));
    } catch (e) {
      const code = isRepoError(e) ? e.code : 'desconhecido';
      if (code === 'versao_desatualizada') {
        invalidate();
        setError('Este investimento mudou em outro aparelho. Volte e abra de novo para ver a versão atual.');
      } else if (code === 'chave_reutilizada') {
        invalidate();
        setError('Pode ser que já tenha sido salvo. Confira a lista de investimentos antes de tentar de novo.');
      } else setError(investmentErrorText(code));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubHeader title={editing ? T.editTitle : T.newTitle} onBack={guard.requestCancel} right={<ContextPill label="Salvando em Pessoal" fixed />} />
      <Screen contentStyle={styles.body}>
        <Card style={{ gap: space[4] }}>
          <TextField
            ref={refs.name}
            label={T.nameLabel}
            hint={T.nameHint}
            value={name}
            onChangeText={(t) => {
              setName(t);
              clear('name');
            }}
            maxLength={INVESTMENT_NAME_MAX}
            error={errors.name}
          />
          <ChoiceGroup label={T.kindLabel} error={errors.kind}>
            {INVESTMENT_KINDS.map((k) => (
              <Chip
                key={k}
                label={INVESTMENT_KIND_LABEL[k]}
                selected={kind === k}
                onPress={() => {
                  setKind(k);
                  clear('kind');
                }}
              />
            ))}
          </ChoiceGroup>
          {editing ? null : (
            <>
              <TextField
                ref={refs.investedText}
                label={T.investedLabel}
                hint={T.investedHint}
                prefix="R$"
                large
                placeholder="0,00"
                keyboardType="decimal-pad"
                inputMode="decimal"
                value={investedText}
                onChangeText={(t) => {
                  setInvestedText(t);
                  clear('investedText');
                }}
                onBlur={() => setInvestedText(formatMoneyText(investedText))}
                error={errors.investedText}
              />
              <TextField
                ref={refs.currentText}
                label={T.currentLabel}
                hint={T.currentHint}
                prefix="R$"
                placeholder="0,00"
                keyboardType="decimal-pad"
                inputMode="decimal"
                value={currentText}
                onChangeText={(t) => {
                  setCurrentText(t);
                  clear('currentText');
                }}
                onBlur={() => setCurrentText(formatMoneyText(currentText))}
                error={errors.currentText}
              />
              <TextField
                ref={refs.startText}
                label={T.startLabel}
                hint={T.startHint}
                placeholder={formatDateBR(today)}
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={10}
                value={startText}
                onChangeText={(t) => {
                  setStartText(maskDateBR(t));
                  clear('startText');
                }}
                error={errors.startText}
              />
            </>
          )}
        </Card>
        <Txt variant="label" color={colors.textSecondary}>
          {INVESTMENT_TEXT.footer}
        </Txt>
      </Screen>
      <FormFooter error={error} onCancel={guard.requestCancel} submitLabel={editing ? T.save : T.create} busy={busy} onSubmit={submit} />
      {guard.dialog}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space[5], gap: space[4], paddingBottom: space[6] },
});
