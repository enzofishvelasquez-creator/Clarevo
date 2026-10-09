import {
  GOALS_TEXT,
  GOAL_ERROR_TEXT,
  GOAL_FIELD_ORDER,
  GOAL_NAME_MAX,
  GOAL_TEMPLATES,
  MAX_RECORD_CENTS,
  centsToInput,
  charCount,
  formatBRL,
  formatMonthInputBR,
  goalErrorText,
  goalPreview,
  maskMonthBR,
  parseBRL,
  validateGoalDraft,
  type Goal,
  type GoalDraft,
  type GoalField,
  type GoalFieldErrors,
  type GoalInput,
  type GoalMovement,
  type GoalType,
} from '@clarevo/core';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { CircleAlert } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, type TextInput } from 'react-native';

import { formatMoneyText } from '@/components/calc/parts';
import { FormFooter } from '@/components/form-footer';
import { ContextPill, SubHeader } from '@/components/header';
import { useLeaveGuard } from '@/components/leave-guard';
import { MoneyTxt } from '@/components/money-text';
import { ChoiceGroup } from '@/components/series-parts';
import { Banner, Button, Card, Chip, Screen, TextField, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { guardedWrite } from '@/lib/guarded-write';
import { useCreateGoal, useGoalOperationKey, useUpdateGoal } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, space } from '@/theme/tokens';

/** O que a rota /meta/nova pode trazer pronto (simulador, atalhos): tudo opcional, já em texto de campo. */
export interface GoalPrefill {
  goalType?: Extract<GoalType, 'objetivo' | 'oportunidade'>;
  name?: string;
  targetText?: string;
  targetMonthText?: string;
  initialText?: string;
  plannedText?: string;
}

export type GoalPrefillParams = Partial<
  Record<'tipo' | 'goalType' | 'nome' | 'name' | 'valor' | 'targetText' | 'prazo' | 'targetMonthText' | 'inicial' | 'initialText' | 'mensal' | 'plannedText', string | string[]>
>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Centavos inteiros (como nos outros links) viram o texto do campo; texto de campo ("22.500,00") passa como está. */
function amountText(cents: string | undefined, text: string | undefined): string {
  if (cents !== undefined && /^\d{1,10}$/.test(cents)) {
    const n = Number(cents);
    if (n >= 1 && n <= MAX_RECORD_CENTS) return centsToInput(n);
  }
  const parsed = text === undefined ? null : parseBRL(text);
  return parsed !== null && parsed >= 1 && parsed <= MAX_RECORD_CENTS ? centsToInput(parsed) : '';
}

/**
 * Parâmetros de /meta/nova (todos opcionais, conferidos um a um; inválidos são ignorados, nada lança):
 * tipo=objetivo|oportunidade, nome, valor (centavos), prazo (MM/AAAA), inicial e mensal (centavos). Os nomes do rascunho do
 * core (goalType, name, targetText, targetMonthText, initialText, plannedText) também valem, com o valor em texto de campo,
 * para quem passa direto o resultado de simulationGoalPrefill.
 */
export function readGoalPrefill(params: GoalPrefillParams): GoalPrefill {
  const type = first(params.tipo) ?? first(params.goalType);
  const name = (first(params.nome) ?? first(params.name) ?? '').trim();
  const month = first(params.prazo) ?? first(params.targetMonthText) ?? '';
  return {
    goalType: type === 'oportunidade' ? 'oportunidade' : type === 'objetivo' ? 'objetivo' : undefined,
    name: name !== '' && charCount(name) <= GOAL_NAME_MAX ? name : undefined,
    targetText: amountText(first(params.valor), first(params.targetText)),
    targetMonthText: /^\d{2}\/\d{4}$/.test(month) ? month : '',
    initialText: amountText(first(params.inicial), first(params.initialText)),
    plannedText: amountText(first(params.mensal), first(params.plannedText)),
  };
}

type Mode = { type: 'nova'; prefill: GoalPrefill } | { type: 'editar'; goal: Goal; movements: readonly GoalMovement[] };

const FIELD_OF_CODE: Partial<Record<string, GoalField>> = {
  nome_da_meta_invalido: 'name',
  valor_invalido: 'targetText',
  alvo_acima_do_limite: 'targetText',
  prazo_invalido: 'targetMonthText',
  plano_invalido: 'plannedText',
  saldo_inicial_invalido: 'initialText',
  data_invalida: 'initialText',
  data_futura: 'initialText',
};

/**
 * Nova meta e Editar meta (objetivo e reserva de oportunidade; a reserva para imprevistos usa /reserva): tipo, modelo de
 * nome, nome, valor, prazo (opcional), quanto já tem guardado (só ao criar, vira o "já guardado ao criar") e quanto pretende
 * guardar por mês (opcional), com a prévia sem rendimento. Rascunho preservado em qualquer erro; a chave de operação
 * reconcilia um resultado incerto; nada de aviso ou animação antes de o servidor confirmar.
 */
export function GoalForm({ mode, contextId }: { mode: Mode; contextId: string }) {
  const { today } = useSession();
  const qc = useQueryClient();
  const create = useCreateGoal();
  const update = useUpdateGoal();
  const keys = useGoalOperationKey();
  const goal = mode.type === 'editar' ? mode.goal : null;
  const T = GOALS_TEXT.form;

  const [initial] = useState(() => {
    if (mode.type === 'editar') {
      const g = mode.goal;
      return {
        goalType: (g.goalType === 'oportunidade' ? 'oportunidade' : 'objetivo') as GoalType,
        name: g.name,
        targetText: centsToInput(g.targetCents),
        targetMonthText: g.targetMonth ? formatMonthInputBR(g.targetMonth) : '',
        initialText: '',
        plannedText: g.plannedMonthlyCents !== null ? centsToInput(g.plannedMonthlyCents) : '',
      };
    }
    const p = mode.prefill;
    return {
      goalType: (p.goalType ?? 'objetivo') as GoalType,
      name: p.name ?? '',
      targetText: p.targetText ?? '',
      targetMonthText: p.targetMonthText ?? '',
      initialText: p.initialText ?? '',
      plannedText: p.plannedText ?? '',
    };
  });
  const [goalType, setGoalType] = useState<GoalType>(initial.goalType);
  const [name, setName] = useState(initial.name);
  const [otherChosen, setOtherChosen] = useState(false);
  const [targetText, setTargetText] = useState(initial.targetText);
  const [targetMonthText, setTargetMonthText] = useState(initial.targetMonthText);
  const [initialText, setInitialText] = useState(initial.initialText);
  const [plannedText, setPlannedText] = useState(initial.plannedText);
  const [errors, setErrors] = useState<GoalFieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
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
    goalType !== initial.goalType ||
    name !== initial.name ||
    targetText !== initial.targetText ||
    targetMonthText !== initial.targetMonthText ||
    initialText !== initial.initialText ||
    plannedText !== initial.plannedText;
  const guard = useLeaveGuard(dirty && !busy, goal ? `/meta/${goal.id}` : '/metas');

  const draft: GoalDraft = {
    goalType,
    name,
    targetText,
    essentialBaseText: '',
    essentialMonthsText: '',
    essentialBaseSource: 'informado',
    targetMonthText,
    initialText: goal ? '' : initialText,
    plannedText,
  };
  const checked = validateGoalDraft(draft, today, { mode: goal ? 'editar' : 'criar', originalTargetMonth: goal?.targetMonth ?? null });
  const preview =
    checked.ok && checked.input.targetCents !== null
      ? goalPreview(
          {
            targetCents: checked.input.targetCents,
            savedCents: goal ? goal.savedCents : (checked.input.initialCents ?? 0),
            targetMonth: checked.input.targetMonth,
            plannedMonthlyCents: checked.input.plannedMonthlyCents,
          },
          today,
          mode.type === 'editar' ? mode.movements : [],
        )
      : null;

  const clear = (field: GoalField) => {
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  };

  async function submit() {
    if (busy) return;
    const v = validateGoalDraft(draft, today, { mode: goal ? 'editar' : 'criar', originalTargetMonth: goal?.targetMonth ?? null });
    if (!v.ok) {
      setErrors(v.errors);
      setError(null);
      const firstField = GOAL_FIELD_ORDER.find((f) => v.errors[f]);
      if (firstField) refs[firstField].current?.focus();
      return;
    }
    setErrors({});
    setError(null);
    setConflict(false);
    setBusy(true);
    try {
      const { initialCents: _initialCents, initialOn: _initialOn, ...rest } = v.input;
      const changes: GoalInput = rest;
      const r = await guardedWrite(keys, JSON.stringify([goal?.id ?? null, goal?.version ?? 0, v.input]), (key) =>
        goal ? update.mutateAsync({ key, id: goal.id, version: goal.version, input: changes }) : create.mutateAsync({ key, contextId, input: v.input }),
      );
      if (r.status === 'ok') {
        flash.set(goal ? T.saved : T.created);
        const id = r.value.goal.id;
        guard.leave(() => (goal ? (router.canGoBack() ? router.back() : router.replace(`/meta/${id}`)) : router.replace(`/meta/${id}`)));
        return;
      }
      if (r.status === 'reconciled') {
        // A tentativa anterior tinha sido gravada: os dados já foram recarregados. Mostrar como concluído.
        flash.set(goal ? T.saved : T.created);
        const id = r.saved.goalId || goal?.id;
        guard.leave(() => (id ? router.replace(`/meta/${id}`) : router.dismissTo('/metas')));
        return;
      }
      if (r.status === 'refused') {
        if (r.code === 'versao_desatualizada' && goal) {
          // Recarrega a meta e mostra o que mudou, sem perder o preenchimento.
          await qc.refetchQueries({ queryKey: ['goals', 'one', goal.id] });
          setConflict(true);
          return;
        }
        const field = FIELD_OF_CODE[r.code];
        if (field) {
          setErrors({ [field]: goalErrorText(r.code) });
          refs[field].current?.focus();
          return;
        }
        if (r.code === 'nao_encontrado') qc.invalidateQueries({ queryKey: ['goals'] });
        setError(goalErrorText(r.code));
        return;
      }
      setError(GOAL_ERROR_TEXT.salvar_falhou);
    } finally {
      setBusy(false);
    }
  }

  const modelSelected = (t: string) => (t === 'Outro' ? otherChosen : !otherChosen && name.trim() === t);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubHeader title={goal ? T.editTitle : T.newTitle} onBack={guard.requestCancel} right={<ContextPill label="Salvando em Pessoal" />} />
      <Screen contentStyle={styles.body}>
        {conflict && goal ? (
          <Banner tone="erro" icon={CircleAlert}>
            <Txt variant="label" color={colors.error}>
              {GOAL_ERROR_TEXT.versao_desatualizada}
            </Txt>
            <MoneyTxt variant="caption">{`Versão atual: ${goal.name} · ${formatBRL(goal.targetCents)}`}</MoneyTxt>
            <Txt variant="caption">Seu preenchimento foi mantido abaixo.</Txt>
            <Button label="Aplicar minhas alterações na versão atual" tone="soft" onPress={submit} />
            <Button label="Descartar minhas alterações" tone="ghost" onPress={() => guard.leave(() => (router.canGoBack() ? router.back() : router.replace(`/meta/${goal.id}`)))} />
          </Banner>
        ) : null}

        <Card style={{ gap: space[4] }}>
          <ChoiceGroup label="Tipo de meta" hint={goalType === 'oportunidade' ? T.opportunityHint : undefined}>
            <Chip label={T.typeObjective} selected={goalType === 'objetivo'} onPress={() => setGoalType('objetivo')} />
            <Chip label={T.typeOpportunity} selected={goalType === 'oportunidade'} onPress={() => setGoalType('oportunidade')} />
          </ChoiceGroup>

          <ChoiceGroup label="Modelo de nome (opcional)">
            {GOAL_TEMPLATES.map((t) => (
              <Chip
                key={t}
                label={t}
                selected={modelSelected(t)}
                onPress={() => {
                  clear('name');
                  if (t === 'Outro') {
                    setOtherChosen(true);
                    setName('');
                    refs.name.current?.focus();
                  } else {
                    setOtherChosen(false);
                    setName(t);
                  }
                }}
              />
            ))}
          </ChoiceGroup>

          <TextField
            ref={refs.name}
            label={T.nameLabel}
            hint={T.nameHint}
            value={name}
            onChangeText={(t) => {
              setName(t);
              clear('name');
            }}
            maxLength={GOAL_NAME_MAX}
            autoFocus={mode.type === 'nova' && !mode.prefill.name}
            error={errors.name}
            returnKeyType="next"
            onSubmitEditing={() => refs.targetText.current?.focus()}
          />

          <TextField
            ref={refs.targetText}
            label={T.targetLabel}
            prefix="R$"
            large
            placeholder="0,00"
            keyboardType="decimal-pad"
            inputMode="decimal"
            value={targetText}
            onChangeText={(t) => {
              setTargetText(t);
              clear('targetText');
            }}
            onBlur={() => setTargetText(formatMoneyText(targetText))}
            error={errors.targetText}
          />

          <TextField
            ref={refs.targetMonthText}
            label={T.deadlineLabel}
            placeholder="MM/AAAA"
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={7}
            value={targetMonthText}
            onChangeText={(t) => {
              setTargetMonthText(maskMonthBR(t));
              clear('targetMonthText');
            }}
            error={errors.targetMonthText}
            hint="Digite só os números, como 072027."
          />

          {goal ? null : (
            <TextField
              ref={refs.initialText}
              label={T.initialLabel}
              prefix="R$"
              placeholder="0,00"
              keyboardType="decimal-pad"
              inputMode="decimal"
              value={initialText}
              onChangeText={(t) => {
                setInitialText(t);
                clear('initialText');
              }}
              onBlur={() => setInitialText(formatMoneyText(initialText))}
              error={errors.initialText}
            />
          )}

          <TextField
            ref={refs.plannedText}
            label={T.plannedLabel}
            prefix="R$"
            placeholder="0,00"
            keyboardType="decimal-pad"
            inputMode="decimal"
            value={plannedText}
            onChangeText={(t) => {
              setPlannedText(t);
              clear('plannedText');
            }}
            onBlur={() => setPlannedText(formatMoneyText(plannedText))}
            error={errors.plannedText}
          />

          {preview ? (
            <MoneyTxt variant="label" style={{ fontFamily: fonts.bold }} accessibilityLiveRegion="polite">
              {preview}
            </MoneyTxt>
          ) : null}
        </Card>

        <Txt variant="label" color={colors.textSecondary}>
          Uma meta mostra só o que você registrar como guardado. O Clarevo não guarda nem movimenta dinheiro.
        </Txt>
      </Screen>

      <FormFooter error={error} onCancel={guard.requestCancel} submitLabel={goal ? T.save : T.create} busy={busy} onSubmit={submit} />
      {guard.dialog}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space[5], gap: space[4], paddingBottom: space[6] },
});
