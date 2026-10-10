import {
  GOALS_TEXT,
  MAX_RECORD_CENTS,
  SAVINGS_ERROR_TEXT,
  SAVINGS_TEXT,
  GOAL_ERROR_TEXT,
  centsToInput,
  formatBRL,
  goalErrorText,
  organizeGoals,
  parseBRL,
  reserveEssentialBaseCents,
  savingsAskReason,
  savingsPlan,
  savingsPlanTexts,
  savingsReserveInput,
  validateSavingsDraft,
  type GoalInput,
  type SavingsCheck,
  type SavingsStageTexts,
} from '@clarevo/core';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View, type TextInput } from 'react-native';

import { formatMoneyText } from '@/components/calc/parts';
import { EssentialsBlock } from '@/components/essentials-block';
import { FormFooter } from '@/components/form-footer';
import { ContextPill, SubHeader } from '@/components/header';
import { useLeaveGuard } from '@/components/leave-guard';
import { MoneyTxt, useMoneyLabelMask } from '@/components/money-text';
import { ChoiceGroup } from '@/components/series-parts';
import { TermHint } from '@/components/term-hint';
import { Button, Card, Chip, Screen, TextField, Txt } from '@/components/ui';
import { announceOnIOS } from '@/lib/a11y';
import { essentialSourceFor, savingsInitialStage, savingsNeedsStageChoice, type SavedEssentials } from '@/lib/essentials';
import { flash } from '@/lib/flash';
import { guardedWrite, type WriteResult } from '@/lib/guarded-write';
import {
  useCreateGoal,
  useGoalOperationKey,
  useSavingsOperationKey,
  useSetSavingsAnswer,
  useUpdateGoal,
  type SavingsPlanInputs,
} from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, space } from '@/theme/tokens';

/**
 * "Sim, consigo" (spec7 §2): quanto você consegue guardar por mês, a referência do mês, o plano em etapas (reserva de 1, 3 e
 * 6 meses dos gastos essenciais e depois as metas, por prazo, com o mês previsto de cada uma, sem rendimento) e "Usar este
 * plano". O plano é recalculado a cada digitação pelo core (função pura); nada é gravado até a pessoa tocar num botão.
 *
 * "Usar este plano" grava a resposta "consigo" com o valor (set_savings_answer) e, em seguida, cria ou atualiza a reserva
 * para imprevistos (create_goal ou update_goal) com o alvo da etapa escolhida e o valor por mês planejado. Se a resposta
 * foi salva e a reserva não, a tela diz isso e o botão tenta só a reserva (a resposta já está gravada). O valor por mês
 * não é distribuído entre a reserva e as metas: "Depois, o mesmo valor pode ir para as suas metas."
 */
export function SavingsPlanForm({
  contextId,
  check,
  inputs,
  referenceText,
  focusAmount,
  incomeChangedAt = null,
}: {
  contextId: string;
  check: SavingsCheck | null;
  inputs: SavingsPlanInputs;
  /** "Fora dos compromissos em outubro: R$ 2.850,00. Não é saldo: ..." ou null (sem renda de referência ou sem o cálculo). */
  referenceText: string | null;
  focusAmount: boolean;
  /** Instante da última mudança da renda de referência (useSavingsCard). Depois da resposta, a pergunta "renda mudou" está aberta. */
  incomeChangedAt?: string | null;
}) {
  const { today } = useSession();
  const qc = useQueryClient();
  const setAnswer = useSetSavingsAnswer();
  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();
  const savingsKeys = useSavingsOperationKey();
  const goalKeys = useGoalOperationKey();

  const reserve = organizeGoals(inputs.goals).reserve;
  // A reserva mínima de "Agora não" guarda o próprio alvo como base de 1 mês: não é o gasto essencial da pessoa (reserveEssentialBaseCents).
  const savedBase = reserveEssentialBaseCents(reserve);
  const saved: SavedEssentials | null = reserve && savedBase !== null && reserve.essentialBaseSource ? { cents: savedBase, source: reserve.essentialBaseSource } : null;

  const initialAmount = check?.answer === 'consigo' && check.monthlyCents !== null ? centsToInput(check.monthlyCents) : '';
  const initialEssential = inputs.suggestedEssentialCents !== null ? centsToInput(inputs.suggestedEssentialCents) : '';
  const [amountText, setAmountText] = useState(initialAmount);
  const [essentialText, setEssentialText] = useState(initialEssential);
  // Etapa escolhida: a da reserva que já existe (se tem 1, 3 ou 6 meses), para "Usar este plano" nunca diminuir o alvo sem a
  // pessoa escolher. Reserva mínima (1 mês, mas o alvo é o valor escolhido) e reserva de outro prazo não pré-marcam nada;
  // sem reserva, o padrão do core (a primeira etapa ainda não alcançada).
  const keepsOtherMonths = savingsNeedsStageChoice(reserve);
  const initialStage = savingsInitialStage(reserve);
  const [stageId, setStageId] = useState<string | null>(initialStage);
  const [amountError, setAmountError] = useState<string | undefined>();
  const [essentialError, setEssentialError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const amountRef = useRef<TextInput>(null);
  const essentialRef = useRef<TextInput>(null);

  const dirty = amountText !== initialAmount || essentialText !== initialEssential || stageId !== initialStage;
  const guard = useLeaveGuard(dirty && !busy, '/metas');

  // Plano ao vivo: função pura do core a cada digitação.
  const amount = validateSavingsDraft(amountText);
  const essentialCents = parseBRL(essentialText);
  const plan = amount.ok
    ? savingsPlan({
        monthlyCents: amount.monthlyCents,
        essentialCents: essentialCents !== null && essentialCents >= 1 && essentialCents <= MAX_RECORD_CENTS ? essentialCents : null,
        goals: inputs.goals,
        movements: inputs.movements,
        today,
        chosenStageId: stageId,
      })
    : null;
  const texts = plan ? savingsPlanTexts(plan) : null;
  const source = essentialSourceFor(essentialCents, inputs.estimate, saved);
  const reserveInput = plan ? savingsReserveInput(plan, source, { existing: reserve }) : null;
  // Reserva mínima ou com outro prazo (12 meses, por exemplo): "Usar este plano" só aparece depois de a pessoa escolher uma etapa, para nunca diminuir o alvo sozinho.
  const stageChosen = !keepsOtherMonths || stageId !== null;
  const canUsePlan = reserveInput !== null && stageChosen;
  const reserveStages = plan ? plan.stages.filter((s) => s.kind === 'reserva') : [];

  // A frase do plano é anunciada uma vez, quando a pessoa para de digitar (no iOS não há região viva).
  const spoken = texts?.headline ?? '';
  const lastSpoken = useRef(spoken);
  useEffect(() => {
    if (Platform.OS !== 'ios' || spoken === lastSpoken.current) return;
    const timer = setTimeout(() => {
      lastSpoken.current = spoken;
      // announceOnIOS já troca os valores por "valor oculto"; mascarar antes deixaria só os pontos.
      announceOnIOS(spoken, { queue: true });
    }, 600);
    return () => clearTimeout(timer);
  }, [spoken]);

  function failFromResult(result: Exclude<WriteResult<unknown, object>, { status: 'ok' | 'reconciled' }>, scope: 'resposta' | 'reserva', prefix = '') {
    if (result.status === 'refused') {
      if (scope === 'resposta' && result.code === 'versao_desatualizada') qc.invalidateQueries({ queryKey: ['savings'] });
      if (scope === 'reserva' && (result.code === 'versao_desatualizada' || result.code === 'reserva_ja_existe' || result.code === 'nao_encontrado')) {
        qc.invalidateQueries({ queryKey: ['goals'] });
      }
      const text = scope === 'resposta' ? (SAVINGS_ERROR_TEXT as Record<string, string>)[result.code] ?? SAVINGS_ERROR_TEXT.salvar_falhou : goalErrorText(result.code);
      setError(`${prefix}${text}`);
      return;
    }
    setError(`${prefix}${scope === 'resposta' ? SAVINGS_ERROR_TEXT.salvar_falhou : GOAL_ERROR_TEXT.salvar_falhou}`);
  }

  /** Grava a resposta "consigo" com o valor (se mudou) e, com `withReserve`, a reserva do plano. */
  async function persist(withReserve: boolean) {
    if (busy) return;
    const v = validateSavingsDraft(amountText);
    if (!v.ok) {
      setAmountError(v.error);
      amountRef.current?.focus();
      return;
    }
    // "Usar este plano" só aparece com a reserva montada (gastos essenciais informados e etapa escolhida).
    const input = withReserve ? reserveInput : null;
    if (withReserve && input === null) {
      setEssentialError(GOAL_ERROR_TEXT.base_invalida);
      essentialRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Com a pergunta "renda mudou" aberta, manter o mesmo valor também grava, como "Manter o valor": a resposta passa a valer de hoje.
      const incomeQuestionOpen = savingsAskReason(check, today, incomeChangedAt) === 'renda_mudou';
      const sameAnswer = check?.answer === 'consigo' && check.monthlyCents === v.monthlyCents && !incomeQuestionOpen;
      let prefix = '';
      if (!sameAnswer) {
        const version = check?.version ?? 0;
        const r = await guardedWrite(savingsKeys, JSON.stringify(['consigo', v.monthlyCents, version]), (key) =>
          setAnswer.mutateAsync({ key, contextId, expectedVersion: version, answer: 'consigo', monthlyCents: v.monthlyCents }),
          undefined,
          { retryOnce: true },
        );
        if (r.status !== 'ok' && r.status !== 'reconciled') {
          failFromResult(r, 'resposta');
          return;
        }
        prefix = `${SAVINGS_TEXT.amountSaved} `;
      }
      if (withReserve && input) {
        const target = input;
        const r = await guardedWrite(goalKeys, JSON.stringify([reserve?.id ?? null, reserve?.version ?? 0, target]), (key) => {
          if (!reserve) return createGoal.mutateAsync({ key, contextId, input: target });
          const { initialCents: _initialCents, initialOn: _initialOn, ...rest } = target;
          const update: GoalInput = rest;
          return updateGoal.mutateAsync({ key, id: reserve.id, version: reserve.version, input: update });
        });
        if (r.status !== 'ok' && r.status !== 'reconciled') {
          failFromResult(r, 'reserva', prefix);
          return;
        }
      }
      flash.set(withReserve ? SAVINGS_TEXT.planUsed : SAVINGS_TEXT.amountSaved);
      guard.leave(() => (router.canGoBack() ? router.back() : router.replace('/metas')));
    } finally {
      setBusy(false);
    }
  }

  const effect = reserveInput
    ? reserve
      ? `A ${reserve.name} passa a ter alvo de ${formatBRL(reserveInput.targetCents ?? 0)} (${reserveInput.essentialMonths === 1 ? '1 mês' : `${reserveInput.essentialMonths} meses`} dos seus gastos essenciais), com ${formatBRL(reserveInput.plannedMonthlyCents ?? 0)} por mês planejados.`
      : `Será criada a Reserva para imprevistos com alvo de ${formatBRL(reserveInput.targetCents ?? 0)} (${reserveInput.essentialMonths === 1 ? '1 mês' : `${reserveInput.essentialMonths} meses`} dos seus gastos essenciais), com ${formatBRL(reserveInput.plannedMonthlyCents ?? 0)} por mês planejados.`
    : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubHeader title={SAVINGS_TEXT.planTitle} onBack={guard.requestCancel} right={<ContextPill label="Salvando em Pessoal" />} />
      <Screen contentStyle={styles.body}>
        <Card style={{ gap: space[4] }}>
          <TextField
            ref={amountRef}
            label={SAVINGS_TEXT.amountLabel}
            prefix="R$"
            large
            placeholder="0,00"
            keyboardType="decimal-pad"
            inputMode="decimal"
            autoFocus={focusAmount}
            value={amountText}
            onChangeText={(t) => {
              setAmountText(t);
              if (amountError) setAmountError(undefined);
            }}
            onBlur={() => setAmountText(formatMoneyText(amountText))}
            error={amountError}
            hint={SAVINGS_TEXT.amountHint}
          />
          {referenceText ? (
            <MoneyTxt variant="label" color={colors.textSecondary}>
              {referenceText}
            </MoneyTxt>
          ) : null}
          <Txt variant="caption" color={colors.textSecondary}>
            {SAVINGS_TEXT.privacy}
          </Txt>
        </Card>

        <Card style={{ gap: space[4] }}>
          <EssentialsBlock
            estimate={inputs.estimate}
            saved={saved}
            text={essentialText}
            onChangeText={(t) => {
              setEssentialText(t);
              if (essentialError) setEssentialError(undefined);
            }}
            error={essentialError}
            fieldRef={essentialRef}
          />
          {texts?.needsEssentials ? (
            <Txt variant="label" color={colors.textSecondary}>
              {texts.needsEssentials}
            </Txt>
          ) : null}
        </Card>

        {plan && texts && texts.stages.length > 0 ? (
          <Card style={{ gap: space[4] }}>
            <Txt variant="title" accessibilityRole="header" aria-level={2}>
              {SAVINGS_TEXT.stagesTitle}
            </Txt>
            {texts.headline ? (
              <View style={{ gap: space[1] }} accessibilityLiveRegion="polite" aria-live="polite">
                <MoneyTxt style={styles.headline}>{texts.headline}</MoneyTxt>
                <Txt variant="label" color={colors.textSecondary}>
                  {texts.noInterest}
                </Txt>
              </View>
            ) : null}

            {reserveStages.length > 0 ? (
              <ChoiceGroup label={SAVINGS_TEXT.chooseStage}>
                {reserveStages.map((s) => (
                  <Chip
                    key={s.id}
                    label={GOALS_TEXT.reserve.monthChip(s.months!)}
                    accessibilityLabel={`Etapa de ${GOALS_TEXT.reserve.monthChip(s.months!)} dos gastos essenciais`}
                    selected={stageChosen && plan.chosenStageId === s.id}
                    onPress={() => setStageId(s.id)}
                  />
                ))}
              </ChoiceGroup>
            ) : null}

            <View>
              {texts.stages.map((s, i) => (
                <StageRow key={s.id} stage={s} last={i === texts.stages.length - 1} />
              ))}
            </View>

            {texts.afterStage ? (
              <Txt variant="label" color={colors.textSecondary}>
                {texts.afterStage}
              </Txt>
            ) : null}

            <View style={{ gap: space[1] }}>
              <Txt variant="caption" color={colors.textSecondary}>
                {texts.reference}
              </Txt>
              <Txt variant="caption" color={colors.textSecondary}>
                {texts.referenceSource}
              </Txt>
            </View>
            <TermHint term="Reserva para imprevistos" slug="reserva-imprevistos" />

            {canUsePlan && effect ? (
              <MoneyTxt variant="label" style={{ fontFamily: fonts.bold }}>
                {effect}
              </MoneyTxt>
            ) : null}
            {canUsePlan ? (
              <Button label="Salvar só o valor por mês" tone="soft" busy={busy} busyLabel="Salvando…" onPress={() => persist(false)} />
            ) : null}
          </Card>
        ) : null}
      </Screen>

      <FormFooter
        error={error}
        onCancel={guard.requestCancel}
        submitLabel={canUsePlan ? SAVINGS_TEXT.useThisPlan : 'Salvar valor por mês'}
        busy={busy}
        onSubmit={() => persist(canUsePlan)}
      />
      {guard.dialog}
    </KeyboardAvoidingView>
  );
}

/** Uma etapa: nome, valor e quanto falta, e o mês previsto. A frase inteira é o nome acessível. */
function StageRow({ stage, last }: { stage: SavingsStageTexts; last: boolean }) {
  const maskLabel = useMoneyLabelMask();
  return (
    <View accessible accessibilityLabel={maskLabel(stage.sentence)} style={[styles.stage, !last && styles.divider]}>
      <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 15 }}>
        {stage.title}
      </Txt>
      <MoneyTxt variant="caption" color={colors.textSecondary}>
        {`${stage.amount} · ${stage.missing}`}
      </MoneyTxt>
      {stage.month ? (
        <Txt variant="caption" style={{ fontFamily: fonts.semibold }}>
          {stage.month}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: space[5], gap: space[4], paddingBottom: space[6] },
  headline: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 24 },
  stage: { gap: 2, paddingVertical: space[3], minHeight: 56 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
});
