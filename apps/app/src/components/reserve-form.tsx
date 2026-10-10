import {
  GOALS_TEXT,
  GOAL_ERROR_TEXT,
  GOAL_FIELD_ORDER,
  GOAL_RESERVE_REFERENCE,
  MAX_RECORD_CENTS,
  RESERVE_MONTHS_MAX,
  RESERVE_MONTHS_MIN,
  RESERVE_MONTH_CHIPS,
  RESERVE_NAME,
  centsToInput,
  emergencyTarget,
  formatMonthInputBR,
  goalErrorText,
  goalPreview,
  maskMonthBR,
  negativeDayFromDetail,
  parseBRL,
  validateGoalDraft,
  type Cents,
  type EssentialEstimate,
  type Goal,
  type GoalDraft,
  type GoalField,
  type GoalFieldErrors,
  type GoalInput,
  type GoalMovement,
} from '@clarevo/core';
import { useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { ExternalLink } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View, type TextInput } from 'react-native';

import { formatMoneyText } from '@/components/calc/parts';
import { EssentialsBlock } from '@/components/essentials-block';
import { FormFooter } from '@/components/form-footer';
import { ContextPill, SubHeader } from '@/components/header';
import { useLeaveGuard } from '@/components/leave-guard';
import { MoneyTxt } from '@/components/money-text';
import { ChoiceGroup } from '@/components/series-parts';
import { TermHint } from '@/components/term-hint';
import { Card, Chip, LinkButton, Screen, TextField, Txt } from '@/components/ui';
import { essentialSourceFor, type SavedEssentials } from '@/lib/essentials';
import { flash } from '@/lib/flash';
import { guardedWrite } from '@/lib/guarded-write';
import { useCreateGoal, useGoalOperationKey, useUpdateGoal } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, space } from '@/theme/tokens';

/** O que a calculadora "Reserva para imprevistos" leva para /reserva (centavos e meses, como nos outros links). */
export interface ReservePrefill {
  essentialCents?: Cents;
  months?: number;
  savedCents?: Cents;
  plannedCents?: Cents;
}

export type ReservePrefillParams = { essenciais?: string; meses?: string; guardado?: string; mensal?: string };

/** Centavos inteiros de 1 até o limite; qualquer outra coisa é ignorada (o link nunca quebra a tela). */
function cents(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d{1,10}$/.test(value)) return undefined;
  const n = Number(value);
  return n >= 1 && n <= MAX_RECORD_CENTS ? n : undefined;
}

/**
 * Reserva para imprevistos (D-027): cria ou ajusta a reserva. Parâmetros de endereço, todos opcionais e conferidos um a um
 * (inválidos são ignorados): essenciais (centavos), meses (1 a 24), guardado e mensal (centavos). É o que "Criar reserva", na
 * calculadora, leva. Com uma reserva não arquivada, a tela edita.
 */
export function readReservePrefill(params: ReservePrefillParams): ReservePrefill {
  const months = params.meses !== undefined && /^\d{1,2}$/.test(params.meses) ? Number(params.meses) : undefined;
  return {
    essentialCents: cents(params.essenciais),
    months: months !== undefined && months >= RESERVE_MONTHS_MIN && months <= RESERVE_MONTHS_MAX ? months : undefined,
    savedCents: cents(params.guardado),
    plannedCents: cents(params.mensal),
  };
}

type Pick = number | 'outro' | null;

/** Valor de texto ("3.750,00") de centavos válidos, ou '' */
const money = (cents: Cents | null | undefined) => (cents === null || cents === undefined ? '' : centsToInput(cents));

/**
 * Reserva para imprevistos (D-027, spec2 §4.6): calcula e cria (ou ajusta) a reserva. Gastos essenciais por mês (média de
 * gastos, contas do mês ou digitado; sempre ajustável), quantos meses cobrir (1, 3, 6, 12 ou outro de 1 a 24; nenhum marcado
 * no começo), o valor da reserva e, opcionais, o que já está guardado (só ao criar), quanto pretende guardar por mês e até
 * quando, com a prévia sem rendimento. Só existe uma reserva não arquivada por contexto: com uma, a tela edita.
 * Nada é gravado até o botão; o servidor confirma antes de qualquer aviso.
 */
export function ReserveForm({
  contextId,
  reserve,
  movements,
  estimate,
  prefill,
}: {
  contextId: string;
  reserve: Goal | null;
  /** Movimentos da reserva (decidem o mês de partida da prévia na edição). */
  movements: readonly GoalMovement[];
  estimate: EssentialEstimate;
  prefill: ReservePrefill;
}) {
  const { today } = useSession();
  const qc = useQueryClient();
  const create = useCreateGoal();
  const update = useUpdateGoal();
  const keys = useGoalOperationKey();
  const R = GOALS_TEXT.reserve;

  const saved: SavedEssentials | null =
    reserve && reserve.essentialBaseCents !== null && reserve.essentialBaseSource ? { cents: reserve.essentialBaseCents, source: reserve.essentialBaseSource } : null;

  // Preenchimento inicial: a reserva que existe, com o que a calculadora levou por cima; ou, ao criar, a sugestão e o que veio.
  const [initial] = useState(() => {
    const months = prefill.months ?? reserve?.essentialMonths ?? null;
    const pick: Pick = months === null ? null : RESERVE_MONTH_CHIPS.includes(months) ? months : 'outro';
    const essential = prefill.essentialCents ?? reserve?.essentialBaseCents ?? estimate.amountCents;
    return {
      essentialText: money(essential),
      pick,
      monthsText: months !== null && pick === 'outro' ? String(months) : '',
      initialText: money(prefill.savedCents),
      plannedText: money(prefill.plannedCents ?? reserve?.plannedMonthlyCents),
      targetMonthText: reserve?.targetMonth ? formatMonthInputBR(reserve.targetMonth) : '',
    };
  });
  const [essentialText, setEssentialText] = useState(initial.essentialText);
  const [pick, setPick] = useState<Pick>(initial.pick);
  const [monthsText, setMonthsText] = useState(initial.monthsText);
  const [initialText, setInitialText] = useState(initial.initialText);
  const [plannedText, setPlannedText] = useState(initial.plannedText);
  const [targetMonthText, setTargetMonthText] = useState(initial.targetMonthText);
  const [errors, setErrors] = useState<GoalFieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refs: Record<GoalField, React.RefObject<TextInput | null>> = {
    name: useRef<TextInput>(null),
    targetText: useRef<TextInput>(null),
    essentialBaseText: useRef<TextInput>(null),
    essentialMonthsText: useRef<TextInput>(null),
    targetMonthText: useRef<TextInput>(null),
    initialText: useRef<TextInput>(null),
    plannedText: useRef<TextInput>(null),
  };

  const dirty =
    essentialText !== initial.essentialText ||
    pick !== initial.pick ||
    monthsText !== initial.monthsText ||
    initialText !== initial.initialText ||
    plannedText !== initial.plannedText ||
    targetMonthText !== initial.targetMonthText;
  const guard = useLeaveGuard(dirty && !busy, '/metas');

  const essentialCents = parseBRL(essentialText);
  const source = essentialSourceFor(essentialCents, estimate, saved);
  const monthsValue = pick === 'outro' ? monthsText : pick === null ? '' : String(pick);

  const draft: GoalDraft = {
    goalType: 'emergencia',
    name: reserve?.name ?? RESERVE_NAME,
    targetText: '',
    essentialBaseText: essentialText,
    essentialMonthsText: monthsValue,
    essentialBaseSource: source,
    targetMonthText,
    initialText: reserve ? '' : initialText,
    plannedText,
  };
  const checked = validateGoalDraft(draft, today, { mode: reserve ? 'editar' : 'criar', originalTargetMonth: reserve?.targetMonth ?? null });

  // Valor da reserva e prévia ao vivo (nada de erro enquanto a pessoa ainda digita: o erro vem ao salvar).
  const months = pick === null ? null : pick === 'outro' ? (/^\s*\d{1,3}\s*$/.test(monthsText) ? Number(monthsText) : null) : pick;
  const target =
    essentialCents !== null && essentialCents >= 1 && months !== null && months >= 1 && months <= RESERVE_MONTHS_MAX ? emergencyTarget(essentialCents, months) : null;
  const preview =
    checked.ok && checked.input.targetCents !== null
      ? goalPreview(
          {
            targetCents: checked.input.targetCents,
            savedCents: reserve ? reserve.savedCents : (checked.input.initialCents ?? 0),
            targetMonth: checked.input.targetMonth,
            plannedMonthlyCents: checked.input.plannedMonthlyCents,
          },
          today,
          movements.filter((m) => !reserve || m.goalId === reserve.id),
        )
      : null;

  function clearError(field: GoalField) {
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  }

  async function submit() {
    if (busy) return;
    const v = validateGoalDraft(draft, today, { mode: reserve ? 'editar' : 'criar', originalTargetMonth: reserve?.targetMonth ?? null });
    if (!v.ok) {
      setErrors(v.errors);
      setError(null);
      const first = GOAL_FIELD_ORDER.find((f) => v.errors[f]);
      if (first) refs[first].current?.focus();
      return;
    }
    setErrors({});
    setError(null);
    setBusy(true);
    try {
      const { initialCents: _initialCents, initialOn: _initialOn, ...rest } = v.input;
      const update_: GoalInput = rest;
      const snapshot = JSON.stringify([reserve?.id ?? null, reserve?.version ?? 0, v.input]);
      const r = await guardedWrite(
        keys,
        snapshot,
        (key) => (reserve ? update.mutateAsync({ key, id: reserve.id, version: reserve.version, input: update_ }) : create.mutateAsync({ key, contextId, input: v.input })),
        (s) => (reserve ? s.action === 'alterar_meta' && s.goalId === reserve.id : s.action === 'criar_meta'),
      );
      if (r.status === 'ok' || r.status === 'reconciled') {
        flash.set(reserve ? R.saved : R.created);
        guard.leave(() => (reserve ? (router.canGoBack() ? router.back() : router.replace('/metas')) : router.dismissTo('/metas')));
        return;
      }
      if (r.status === 'refused') {
        if (r.code === 'versao_desatualizada' || r.code === 'reserva_ja_existe' || r.code === 'nao_encontrado') qc.invalidateQueries({ queryKey: ['goals'] });
        setError(goalErrorText(r.code, { negativeDay: negativeDayFromDetail(r.detail) }));
        return;
      }
      setError(GOAL_ERROR_TEXT.salvar_falhou);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubHeader title={R.title} onBack={guard.requestCancel} right={<ContextPill label="Salvando em Pessoal" />} />
      <Screen contentStyle={styles.body}>
        <Card style={{ gap: space[4] }}>
          <EssentialsBlock
            estimate={estimate}
            saved={saved}
            text={essentialText}
            onChangeText={(t) => {
              setEssentialText(t);
              clearError('essentialBaseText');
            }}
            error={errors.essentialBaseText}
            fieldRef={refs.essentialBaseText}
          />
        </Card>

        <Card style={{ gap: space[4] }}>
          <ChoiceGroup label={R.monthsQuestion} error={errors.essentialMonthsText && pick !== 'outro' ? errors.essentialMonthsText : undefined}>
            {RESERVE_MONTH_CHIPS.map((n) => (
              <Chip
                key={n}
                label={R.monthChip(n)}
                selected={pick === n}
                onPress={() => {
                  setPick(n);
                  clearError('essentialMonthsText');
                }}
              />
            ))}
            <Chip label={R.otherMonths} accessibilityLabel="Outro número de meses" selected={pick === 'outro'} onPress={() => setPick('outro')} />
          </ChoiceGroup>
          {pick === 'outro' ? (
            <TextField
              ref={refs.essentialMonthsText}
              label={R.otherMonthsLabel}
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={2}
              autoFocus
              value={monthsText}
              onChangeText={(t) => {
                setMonthsText(t.replace(/\D/g, ''));
                clearError('essentialMonthsText');
              }}
              error={errors.essentialMonthsText}
            />
          ) : null}
          <View style={{ gap: space[1] }}>
            <Txt variant="label" color={colors.textSecondary}>
              {R.monthsReference}
            </Txt>
            <Txt variant="caption" color={colors.textSecondary}>
              {R.monthsReferenceSource}
            </Txt>
            {GOAL_RESERVE_REFERENCE.sources.map((s) => (
              <LinkButton
                key={s.url}
                label={`Abrir a página: ${s.title}`}
                icon={ExternalLink}
                style={styles.link}
                onPress={() => Linking.openURL(s.url)}
              />
            ))}
          </View>
          <TermHint term="Reserva para imprevistos" slug="reserva-imprevistos" />
        </Card>

        <Card style={{ gap: space[4] }}>
          {target !== null && essentialCents !== null && months !== null ? (
            <MoneyTxt variant="title" accessibilityRole="header" aria-level={2}>
              {R.result(target, months, essentialCents)}
            </MoneyTxt>
          ) : (
            <Txt variant="label" color={colors.textSecondary}>
              Informe os gastos essenciais e os meses para ver o valor da reserva.
            </Txt>
          )}
          {reserve ? null : (
            <MoneyField
              inputRef={refs.initialText}
              label={R.savedQuestion}
              value={initialText}
              onChange={(t) => {
                setInitialText(t);
                clearError('initialText');
              }}
              error={errors.initialText}
            />
          )}
          <MoneyField
            inputRef={refs.plannedText}
            label={R.plannedQuestion}
            value={plannedText}
            onChange={(t) => {
              setPlannedText(t);
              clearError('plannedText');
            }}
            error={errors.plannedText}
          />
          <TextField
            ref={refs.targetMonthText}
            label={R.deadlineQuestion}
            placeholder="MM/AAAA"
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={7}
            value={targetMonthText}
            onChangeText={(t) => {
              setTargetMonthText(maskMonthBR(t));
              clearError('targetMonthText');
            }}
            error={errors.targetMonthText}
            hint="Digite só os números, como 072027."
          />
          {preview ? (
            <MoneyTxt variant="label" style={{ fontFamily: fonts.bold }} accessibilityLiveRegion="polite">
              {preview}
            </MoneyTxt>
          ) : null}
        </Card>

        <View style={{ gap: space[2] }}>
          <Txt variant="label" color={colors.textSecondary}>
            {R.noteEmergency}
          </Txt>
          <TermHint term="Liquidez, risco e retorno" slug="liquidez-risco-retorno" />
          <Txt variant="label" color={colors.textSecondary}>
            {R.noteNoProducts}
          </Txt>
        </View>
      </Screen>

      <FormFooter
        error={error}
        onCancel={guard.requestCancel}
        submitLabel={reserve ? R.save : R.create}
        busy={busy}
        onSubmit={submit}
      />
      {guard.dialog}
    </KeyboardAvoidingView>
  );
}

/** Campo em reais opcional, formatado ao sair ("1080" vira "1.080,00"). */
function MoneyField({
  label,
  value,
  onChange,
  error,
  inputRef,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  error?: string;
  inputRef?: React.RefObject<TextInput | null>;
}) {
  return (
    <TextField
      ref={inputRef}
      label={label}
      prefix="R$"
      placeholder="0,00"
      keyboardType="decimal-pad"
      inputMode="decimal"
      value={value}
      onChangeText={onChange}
      onBlur={() => onChange(formatMoneyText(value))}
      error={error}
    />
  );
}

const styles = StyleSheet.create({
  body: { padding: space[5], gap: space[4], paddingBottom: space[6] },
  link: { alignSelf: 'flex-start', paddingHorizontal: 0 },
});
