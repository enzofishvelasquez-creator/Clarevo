import {
  GOAL_ERROR_TEXT,
  SAVINGS_ERROR_TEXT,
  SAVINGS_TEXT,
  formatBRL,
  goalErrorText,
  minimumReserveInput,
  minimumReserveOptions,
  organizeGoals,
  savingsErrorText,
  savingsSmallSteps,
  validateMinimumReserveDraft,
  type Cents,
  type SavingsCheck,
} from '@clarevo/core';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ChartPie, CircleAlert, Gauge } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View, type TextInput } from 'react-native';

import { formatMoneyText } from '@/components/calc/parts';
import { FormFooter } from '@/components/form-footer';
import { ContextPill, SubHeader } from '@/components/header';
import { useLeaveGuard } from '@/components/leave-guard';
import { MoneyTxt, useMoneyLabelMask } from '@/components/money-text';
import { SAVINGS_NOTICE } from '@/components/savings-card';
import { ChoiceGroup } from '@/components/series-parts';
import { Banner, Button, Card, Chip, LinkButton, Screen, TextField, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { guardedWrite } from '@/lib/guarded-write';
import { useCreateGoal, useGoalOperationKey, useSavingsOperationKey, useSetSavingsAnswer, type SavingsPlanInputs } from '@/state/data';
import { colors, fonts, space } from '@/theme/tokens';

/**
 * "Agora não" (spec7 §3): texto acolhedor, sem julgamento, e a reserva mínima a partir de R$ 100,00, escolhida pela pessoa
 * (nenhum valor vem marcado). Passos pequenos opcionais, só como ideia: nada é gravado até "Criar reserva mínima", e o valor
 * por mês escolhido vira o plano da reserva. Ajudas só como links, sem dizer o que mudar. A resposta "agora não" já foi
 * gravada no card; "Me pergunte de novo no próximo mês" a grava de novo com a data nova.
 */
export function MinimumReserve({ contextId, check, inputs }: { contextId: string; check: SavingsCheck | null; inputs: SavingsPlanInputs }) {
  const qc = useQueryClient();
  const maskLabel = useMoneyLabelMask();
  const createGoal = useCreateGoal();
  const setAnswer = useSetSavingsAnswer();
  const goalKeys = useGoalOperationKey();
  const savingsKeys = useSavingsOperationKey();

  const reserve = organizeGoals(inputs.goals).reserve;
  const options = minimumReserveOptions(inputs.estimate.amountCents);
  const steps = savingsSmallSteps();
  const [optionId, setOptionId] = useState<string | null>(null);
  const [otherText, setOtherText] = useState('');
  const [otherError, setOtherError] = useState<string | undefined>();
  const [stepId, setStepId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const otherRef = useRef<TextInput>(null);

  const dirty = optionId !== null || otherText !== '' || stepId !== null;
  const guard = useLeaveGuard(dirty && !busy, '/metas');

  const option = options.find((o) => o.id === optionId) ?? null;
  const step = steps.find((s) => s.id === stepId) ?? null;
  const other = option?.kind === 'outro' ? validateMinimumReserveDraft(otherText) : null;
  const target: Cents | null = option === null ? null : option.kind === 'outro' ? (other && other.ok ? other.targetCents : null) : option.cents;

  async function create() {
    if (busy || asking) return;
    if (option === null) {
      setError('Escolha um valor para a reserva mínima.');
      return;
    }
    if (option.kind === 'outro') {
      const v = validateMinimumReserveDraft(otherText);
      if (!v.ok) {
        setOtherError(v.error);
        otherRef.current?.focus();
        return;
      }
    }
    if (target === null) return;
    // A opção "1 mês dos seus gastos essenciais" guarda a origem deles; os outros valores são a reserva mínima (origem reserva_minima).
    const input = minimumReserveInput(target, step?.monthlyCents ?? null, option.kind === 'essenciais' ? inputs.estimate.source : undefined);
    setBusy(true);
    setError(null);
    try {
      const r = await guardedWrite(
        goalKeys,
        JSON.stringify([contextId, input]),
        (key) => createGoal.mutateAsync({ key, contextId, input }),
        (s) => s.action === 'criar_meta',
      );
      if (r.status === 'ok' || r.status === 'reconciled') {
        flash.set(SAVINGS_TEXT.minimumCreated);
        guard.leave(() => (router.canGoBack() ? router.back() : router.replace('/metas')));
        return;
      }
      if (r.status === 'refused') {
        if (r.code === 'reserva_ja_existe') qc.invalidateQueries({ queryKey: ['goals'] });
        setError(goalErrorText(r.code));
        return;
      }
      setError(GOAL_ERROR_TEXT.salvar_falhou);
    } finally {
      setBusy(false);
    }
  }

  /** "Me pergunte de novo no próximo mês": grava "agora não" de novo, com a data nova, e volta à aba. */
  async function askNextMonth() {
    if (busy || asking) return;
    const version = check?.version ?? 0;
    setAsking(true);
    setError(null);
    try {
      const r = await guardedWrite(savingsKeys, JSON.stringify(['agora_nao', null, version]), (key) =>
        setAnswer.mutateAsync({ key, contextId, expectedVersion: version, answer: 'agora_nao', monthlyCents: null }),
        undefined,
        { retryOnce: true },
      );
      if (r.status === 'ok' || r.status === 'reconciled') {
        flash.set(SAVINGS_NOTICE.later);
        guard.leave(() => (router.canGoBack() ? router.back() : router.replace('/metas')));
        return;
      }
      if (r.status === 'refused') {
        if (r.code === 'versao_desatualizada') qc.invalidateQueries({ queryKey: ['savings'] });
        setError(savingsErrorText(r.code));
        return;
      }
      setError(SAVINGS_ERROR_TEXT.salvar_falhou);
    } finally {
      setAsking(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubHeader title="Reserva mínima" onBack={guard.requestCancel} right={<ContextPill label="Salvando em Pessoal" />} />
      <Screen contentStyle={styles.body}>
        <Card style={{ gap: space[2] }}>
          <Txt>{SAVINGS_TEXT.notNowBody}</Txt>
        </Card>

        {reserve ? (
          <Card style={{ gap: space[3] }}>
            <Txt>{GOAL_ERROR_TEXT.reserva_ja_existe}</Txt>
            <Button label="Abrir a reserva" tone="soft" onPress={() => router.replace('/reserva')} />
          </Card>
        ) : (
          <>
            <Card style={{ gap: space[4] }}>
              <Txt variant="title" accessibilityRole="header" aria-level={2}>
                {SAVINGS_TEXT.minimumTitle}
              </Txt>
              <ChoiceGroup label="Valor para começar">
                {options.map((o) => (
                  <Chip
                    key={o.id}
                    label={o.label}
                    accessibilityLabel={o.kind === 'essenciais' && o.cents !== null ? maskLabel(`${o.label}, ${formatBRL(o.cents)}`) : undefined}
                    selected={optionId === o.id}
                    onPress={() => {
                      setOptionId(o.id);
                      setError(null);
                    }}
                  />
                ))}
              </ChoiceGroup>
              {option?.kind === 'outro' ? (
                <TextField
                  ref={otherRef}
                  label={SAVINGS_TEXT.minimumOtherLabel}
                  hint={SAVINGS_TEXT.minimumOtherHint}
                  prefix="R$"
                  large
                  placeholder="0,00"
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  autoFocus
                  value={otherText}
                  onChangeText={(t) => {
                    setOtherText(t);
                    if (otherError) setOtherError(undefined);
                  }}
                  onBlur={() => setOtherText(formatMoneyText(otherText))}
                  error={otherError}
                />
              ) : null}
              {option && option.kind !== 'outro' && option.cents !== null ? (
                // Os valores sugeridos (R$ 100,00, R$ 300,00...) são do app, não da pessoa, e as opções já estão à vista; só o valor
                // calculado dos gastos essenciais dela segue "Ocultar valores".
                option.kind === 'essenciais' ? (
                  <MoneyTxt variant="label" style={{ fontFamily: fonts.bold }}>
                    {`Reserva mínima: ${formatBRL(option.cents)}`}
                  </MoneyTxt>
                ) : (
                  <Txt variant="label" style={{ fontFamily: fonts.bold }}>
                    {`Reserva mínima: ${formatBRL(option.cents)}`}
                  </Txt>
                )
              ) : null}
            </Card>

            <Card style={{ gap: space[3] }}>
              <Txt variant="title" accessibilityRole="header" aria-level={2}>
                {SAVINGS_TEXT.smallStepsTitle}
              </Txt>
              <Txt variant="label" color={colors.textSecondary}>
                {SAVINGS_TEXT.smallStepsHint}
              </Txt>
              <ChoiceGroup label="Um passo pequeno (opcional)">
                {steps.map((s) => (
                  <Chip
                    key={s.id}
                    // O passo semanal e o equivalente por mês são sugestões fixas do app: ficam à vista.
                    label={s.monthlyLabel ? `${s.label} · ${s.monthlyLabel}` : s.label}
                    selected={stepId === s.id}
                    onPress={() => setStepId(stepId === s.id ? null : s.id)}
                  />
                ))}
              </ChoiceGroup>
              {step?.monthlyCents ? (
                <Txt variant="caption" color={colors.textSecondary}>
                  {SAVINGS_TEXT.weeklyStepBasis}
                </Txt>
              ) : null}
            </Card>
          </>
        )}

        <Card style={{ gap: space[1] }}>
          <LinkButton
            label={SAVINGS_TEXT.helpWhere}
            icon={ChartPie}
            style={styles.link}
            onPress={() => router.push({ pathname: '/composicao', params: { tipo: 'pago' } })}
          />
          <LinkButton label={SAVINGS_TEXT.helpCommitted} icon={Gauge} style={styles.link} onPress={() => router.push('/renda-comprometida')} />
          <LinkButton
            label={asking ? 'Salvando…' : SAVINGS_TEXT.askNextMonth}
            style={styles.link}
            disabled={busy || asking}
            onPress={askNextMonth}
          />
        </Card>
        {reserve && error ? (
          <Banner tone="erro" icon={CircleAlert}>
            <Txt variant="label" color={colors.error}>
              {error}
            </Txt>
          </Banner>
        ) : null}
        <Txt variant="caption" color={colors.textSecondary}>
          {SAVINGS_TEXT.privacy}
        </Txt>
      </Screen>

      {reserve ? null : (
        <FormFooter
          error={error}
          onCancel={guard.requestCancel}
          cancelLabel="Fechar"
          submitLabel={SAVINGS_TEXT.minimumCreate}
          busy={busy}
          onSubmit={create}
        />
      )}
      {guard.dialog}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space[5], gap: space[4], paddingBottom: space[6] },
  link: { alignSelf: 'flex-start', paddingHorizontal: 0 },
});
