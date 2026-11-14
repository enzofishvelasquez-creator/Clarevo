import {
  DETAILS_FIELD_ORDER,
  EMPTY_DETAILS_DRAFT,
  INVESTMENT_FIELD_ORDER,
  INVESTMENT_KINDS,
  INVESTMENT_KIND_LABEL,
  INVESTMENT_NAME_MAX,
  INVESTMENT_GOAL_TEXT,
  INVESTMENT_TEXT,
  formatDateBR,
  investmentSaveErrorText,
  isRepoError,
  maskDateBR,
  newOperationKey,
  detailsEmpty,
  detailsToDraft,
  investmentDetailsErrorText,
  validateDetailsDraft,
  validateInvestmentDraft,
  type Investment,
  type InvestmentDetailsDraft,
  type InvestmentDetailsField,
  type InvestmentField,
  type InvestmentKind,
} from '@clarevo/core';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, type TextInput } from 'react-native';

import { formatMoneyText } from '@/components/calc/parts';
import { FormFooter } from '@/components/form-footer';
import { InvestmentDetailsSection, type DetailsSectionHandle } from '@/components/investment-details-form';
import { ContextPill, SubHeader } from '@/components/header';
import { useLeaveGuard } from '@/components/leave-guard';
import { ChoiceGroup } from '@/components/series-parts';
import { Card, Chip, Screen, TextField, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { useGoals, useInvalidateInvestments } from '@/state/data';
import { useRepo, useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

const T = INVESTMENT_TEXT.form;

/**
 * Novo investimento e editar (D-093). Novo: nome, tipo, quanto aplicou até hoje (obrigatório), quanto vale hoje (opcional) e desde
 * quando (opcional, hoje sem ela). Editar: nome e tipo; os valores mudam pelos movimentos. Nos dois, o bloco "Mais detalhes (opcional)"
 * com a ficha ampliada (D-099), que é gravada inteira.
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
  const initialDetails = investment ? detailsToDraft(investment) : EMPTY_DETAILS_DRAFT;
  const [details, setDetails] = useState<InvestmentDetailsDraft>(initialDetails);
  const [detailErrors, setDetailErrors] = useState<Partial<Record<InvestmentDetailsField, string>>>({});
  const detailsRef = useRef<DetailsSectionHandle>(null);
  // Meta ligada (D-099, item 13): as metas do Pessoal que podem ser escolhidas (sem as arquivadas), a reserva primeiro.
  const goalsQ = useGoals(contextId);
  const goalOptions = (goalsQ.data ?? [])
    .filter((g) => g.status !== 'arquivada')
    .sort((a, b) => (a.goalType === 'emergencia' ? 0 : 1) - (b.goalType === 'emergencia' ? 0 : 1) || a.name.localeCompare(b.name, 'pt-BR'));
  const initialGoal = investment?.goalId ?? null;
  const [goalId, setGoalId] = useState<string | null>(initialGoal);
  // Meta que deixou de valer (arquivada depois): sai ao salvar, com o aviso. Enquanto a lista não chega (ou falha), a meta não é enviada e o
  // banco mantém a de antes.
  const chosenGoal = goalId !== null && goalOptions.some((g) => g.id === goalId) ? goalId : null;
  const goalForSave: string | null | undefined = goalsQ.isSuccess ? chosenGoal : undefined;
  const goalDropped = goalsQ.isSuccess && initialGoal !== null && goalId === initialGoal && chosenGoal === null;
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
  const dirty =
    name !== (investment?.name ?? '') ||
    kind !== (investment?.kind ?? null) ||
    investedText !== '' ||
    currentText !== '' ||
    startText !== '' ||
    goalId !== initialGoal ||
    JSON.stringify(details) !== JSON.stringify(initialDetails);
  const guard = useLeaveGuard(dirty && !busy, editing ? `/investimento/${investment!.id}` : '/investimentos');

  const clear = (f: InvestmentField) => {
    if (errors[f]) setErrors((e) => ({ ...e, [f]: undefined }));
  };

  async function submit() {
    if (busy) return;
    const v = validateInvestmentDraft({ name, kind, investedText, currentText, startText }, today, editing ? 'editar' : 'criar');
    const dv = validateDetailsDraft(kind, details);
    if (!v.ok || !dv.ok) {
      setErrors(v.ok ? {} : v.errors);
      setDetailErrors(dv.ok ? {} : dv.errors);
      setError(null);
      const first = v.ok ? undefined : INVESTMENT_FIELD_ORDER.find((f) => v.errors[f]);
      if (first) refs[first].current?.focus();
      else if (!dv.ok) {
        const firstDetail = DETAILS_FIELD_ORDER.find((f) => dv.errors[f]);
        if (firstDetail) detailsRef.current?.focus(firstDetail);
      }
      return;
    }
    setErrors({});
    setDetailErrors({});
    setError(null);
    setBusy(true);
    try {
      const w = editing
        ? await repo.updateInvestment(key, investment!.id, investment!.version, { name: v.input.name, kind: v.input.kind, details: dv.details, goalId: goalForSave })
        : await repo.createInvestment(key, contextId, { ...v.input, details: dv.details, goalId: goalForSave });
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
      } else {
        if (code === 'meta_invalida') goalsQ.refetch();
        setError(investmentDetailsErrorText(code) ?? investmentSaveErrorText(code));
      }
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
          {goalOptions.length > 0 ? (
            <ChoiceGroup label={INVESTMENT_GOAL_TEXT.formLabel} hint={INVESTMENT_GOAL_TEXT.formHint}>
              <Chip label={INVESTMENT_GOAL_TEXT.noGoal} selected={chosenGoal === null} onPress={() => setGoalId(null)} />
              {goalOptions.map((g) => (
                <Chip key={g.id} label={g.name} selected={chosenGoal === g.id} onPress={() => setGoalId(chosenGoal === g.id ? null : g.id)} />
              ))}
            </ChoiceGroup>
          ) : null}
          {goalDropped ? (
            <Txt variant="caption" color={colors.textSecondary}>
              {INVESTMENT_GOAL_TEXT.archivedNote}
            </Txt>
          ) : null}
        </Card>
        <InvestmentDetailsSection
          ref={detailsRef}
          kind={kind}
          draft={details}
          onChange={(next) => {
            setDetails(next);
            if (Object.keys(detailErrors).length > 0) setDetailErrors({});
          }}
          errors={detailErrors}
          initiallyOpen={investment !== null && !detailsEmpty(investment)}
        />
        <Txt variant="label" color={colors.textSecondary}>
          {INVESTMENT_TEXT.footer}
        </Txt>
      </Screen>
      <FormFooter error={error} onCancel={guard.requestCancel} submitLabel={editing ? T.save : T.create} busy={busy} onSubmit={submit} stackWhenNarrow />
      {guard.dialog}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space[5], gap: space[4], paddingBottom: space[6] },
});
