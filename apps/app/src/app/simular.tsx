import {
  SIMULATE_TEXT,
  SIMULATION_MODES,
  SIMULATION_MODE_FIELDS,
  emptySimulationDraft,
  previewHypotheses,
  simulatePrefill,
  validateSimulationDraft,
  type SimulationDraft,
  type SimulationField,
  type SimulationResult,
} from '@clarevo/core';
import { router, useLocalSearchParams } from 'expo-router';
import { ChartLine, Info } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, StyleSheet, View, type ScrollView, type TextInput } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { CalcChip, formatMoneyText } from '@/components/calc/parts';
import { SubHeader } from '@/components/header';
import { ChoiceGroup, CheckOption } from '@/components/series-parts';
import { SimResultCard, resultSpoken } from '@/components/sim-result';
import { TermHint } from '@/components/term-hint';
import { Button, Card, Screen, TextField, Txt } from '@/components/ui';
import { announceOnIOS } from '@/lib/a11y';
import { useSession } from '@/state/session';
import { colors, radius, space } from '@/theme/tokens';

const T = SIMULATE_TEXT;

type TextFieldName = Exclude<SimulationField, 'mode'>;
type Errors = Partial<Record<SimulationField, string>>;

const KIND: Record<TextFieldName, 'money' | 'count' | 'rate'> = {
  targetText: 'money',
  initialText: 'money',
  monthsText: 'count',
  monthlyText: 'money',
  rateText: 'rate',
  inflationText: 'rate',
};
const LABEL: Record<TextFieldName, string> = {
  targetText: T.fields.target,
  initialText: T.fields.initial,
  monthsText: T.fields.months,
  monthlyText: T.fields.monthly,
  rateText: T.fields.rate,
  inflationText: T.fields.inflation,
};
const HINT: Partial<Record<TextFieldName, string>> = {
  monthsText: T.fields.monthsHint,
  rateText: T.fields.rateHint,
  inflationText: T.fields.inflationHint,
};

/**
 * Simulador (D-028, Ciclo D; spec2 §4.7). Três modos (quanto guardar por mês, em quanto tempo, quanto posso ter), taxa ao ano
 * sempre digitada (campo vazio, sem valor sugerido), inflação opcional, resultado com o valor sem rendimento ao lado,
 * ano a ano com tabela, hipóteses sempre visíveis (aportes no início de cada mês, como na Calculadora do Cidadão do Banco
 * Central) e o aviso fixo no topo, visível sem rolagem em 360 px. Nada é gravado: nem a taxa, nem os valores digitados, nem
 * a simulação. "Criar meta com estes valores" só abre a nova meta preenchida, sem a taxa.
 * O resultado vale para o que foi digitado quando a pessoa tocou em Simular: mudar qualquer campo o tira da tela.
 * Os links de Metas, do detalhe da meta e da calculadora "Juntar para um objetivo" trazem modo e valores (nunca a taxa).
 */
export default function SimularScreen() {
  const params = useLocalSearchParams();
  const { today } = useSession();
  const reduced = useReducedMotion();
  const [draft, setDraft] = useState<SimulationDraft>(() => {
    const { origem: _origem, ...prefill } = simulatePrefill(params);
    return { ...emptySimulationDraft(), ...prefill };
  });
  const [errors, setErrors] = useState<Errors>({});
  const [result, setResult] = useState<SimulationResult | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const resultY = useRef(0);
  const refs: Record<TextFieldName, React.RefObject<TextInput | null>> = {
    targetText: useRef<TextInput>(null),
    initialText: useRef<TextInput>(null),
    monthsText: useRef<TextInput>(null),
    monthlyText: useRef<TextInput>(null),
    rateText: useRef<TextInput>(null),
    inflationText: useRef<TextInput>(null),
  };

  // Campos do modo, na ordem da tela; a inflação só com o interruptor ligado.
  const fields = (draft.mode ? SIMULATION_MODE_FIELDS[draft.mode] : []).filter((f): f is TextFieldName => f !== 'mode');
  const focusOrder = fields.filter((f) => f !== 'inflationText' || draft.inflationOn);

  // Mudou qualquer campo: o resultado deixa de valer e o erro do campo some.
  const change = (patch: Partial<SimulationDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setResult(null);
    setErrors((e) => {
      const next = { ...e };
      for (const key of Object.keys(patch)) delete next[key === 'inflationOn' ? 'inflationText' : (key as SimulationField)];
      return next;
    });
  };

  const submit = () => {
    const out = validateSimulationDraft(draft);
    if (!out.ok) {
      setResult(null);
      setErrors(out.errors);
      const first = (Object.keys(out.errors) as SimulationField[]).find((f) => f !== 'mode');
      if (!out.errors.mode && first) refs[first as TextFieldName].current?.focus();
      return;
    }
    setErrors({});
    setResult(out.result);
    Keyboard.dismiss();
    announceOnIOS(resultSpoken(out.result), { queue: true });
  };

  // O resultado aparece abaixo do formulário: leva a tela até ele (sem animar com "reduzir movimento").
  useEffect(() => {
    if (result) scrollRef.current?.scrollTo({ y: Math.max(0, resultY.current - space[2]), animated: !reduced });
  }, [result, reduced]);

  const next = (name: TextFieldName) => {
    const target = focusOrder[focusOrder.indexOf(name) + 1];
    if (target) refs[target].current?.focus();
    else submit();
  };

  const field = (name: TextFieldName) => {
    const kind = KIND[name];
    const last = focusOrder[focusOrder.length - 1] === name;
    return (
      <TextField
        key={name}
        ref={refs[name]}
        label={LABEL[name]}
        hint={HINT[name]}
        prefix={kind === 'money' ? 'R$' : undefined}
        // Nunca um número de exemplo na taxa: o Clarevo não sugere taxas.
        placeholder={kind === 'money' ? '0,00' : undefined}
        value={draft[name]}
        onChangeText={(text) => change({ [name]: text } as Partial<SimulationDraft>)}
        onBlur={() => {
          // Só a forma do número ("1080" → "1.080,00"): o resultado continua valendo.
          if (kind === 'money' && draft[name].trim() !== '') {
            const formatted = formatMoneyText(draft[name]);
            if (formatted !== draft[name]) setDraft((d) => ({ ...d, [name]: formatted }));
          }
        }}
        keyboardType={kind === 'count' ? 'number-pad' : 'decimal-pad'}
        inputMode={kind === 'count' ? 'numeric' : 'decimal'}
        maxLength={kind === 'count' ? 4 : undefined}
        autoCorrect={false}
        autoComplete="off"
        returnKeyType={last ? 'done' : 'next'}
        onSubmitEditing={() => next(name)}
        error={errors[name]}
      />
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Sem pílula de contexto: nada aqui é gravado. */}
      <SubHeader title={T.title} onBack={() => (router.canGoBack() ? router.back() : router.replace('/metas'))} />
      <Screen scrollRef={scrollRef} contentStyle={{ padding: space[5], gap: space[4] }}>
        {/* Aviso fixo (D-028): no topo, para estar na tela sem rolagem, também em 360 px. */}
        <View style={styles.disclaimer}>
          <Info size={18} color={colors.brand} style={{ marginTop: 1 }} aria-hidden />
          <Txt variant="caption" style={{ flex: 1 }}>
            {T.disclaimer}
          </Txt>
        </View>
        <Txt color={colors.textSecondary}>{T.intro}</Txt>

        <Card style={{ gap: space[4] }}>
          <ChoiceGroup label={T.modeLabel} error={errors.mode}>
            {SIMULATION_MODES.map((mode) => (
              <CalcChip key={mode} label={T.modes[mode]} selected={draft.mode === mode} onPress={() => change({ mode })} />
            ))}
          </ChoiceGroup>

          {fields.map((name) => {
            if (name === 'rateText') {
              return (
                <View key={name} style={{ gap: space[1] }}>
                  {field(name)}
                  <TermHint term="Taxa ao ano e ao mês" slug="taxa-mes-ano" />
                </View>
              );
            }
            if (name === 'inflationText') {
              return (
                <View key={name} style={{ gap: space[3] }}>
                  <CheckOption label={T.fields.inflationToggle} checked={draft.inflationOn} onPress={() => change({ inflationOn: !draft.inflationOn })} />
                  {draft.inflationOn ? field(name) : null}
                  <TermHint term="Inflação" slug="inflacao-ipca" />
                </View>
              );
            }
            return field(name);
          })}

          <Button label={T.simulateButton} icon={ChartLine} onPress={submit} />
        </Card>

        <View onLayout={(e) => (resultY.current = e.nativeEvent.layout.y)}>
          <SimResultCard result={result} hypotheses={result ? result.hypotheses : previewHypotheses(draft)} today={today} />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  disclaimer: { flexDirection: 'row', gap: space[2], padding: space[3], borderRadius: radius.md, backgroundColor: colors.brandTint, alignItems: 'flex-start' },
});
