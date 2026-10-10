import {
  ANTES_FIELDS,
  ANTES_TEXT,
  calcAntesDeFinanciar,
  calcErrorText,
  centsToInput,
  monthOf,
  type AntesResult,
  type CalcErrorCode,
  type CalcPrefill,
} from '@clarevo/core';
import { router } from 'expo-router';
import { Layers, Target } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { View, type TextInput } from 'react-native';

import {
  CalcField,
  CalcNote,
  CalcResult,
  CalcScreen,
  CalcTextField,
  CalcYesNo,
  calcInlineLink,
  formatMoneyText,
  showError,
  useCalcForm,
  useNoteHidden,
  type CalcBinding,
} from '@/components/calc/parts';
import { MoneyTxt } from '@/components/money-text';
import { Button, Card, LinkButton, Txt } from '@/components/ui';
import { setValuesHidden, useValuesHidden } from '@/lib/privacy';
import { useCommittedSummary, useSpace } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, space } from '@/theme/tokens';

type Key = 'preco' | 'entrada' | 'parcelas' | 'taxaMes' | 'renda' | 'guardar' | 'rendimento';

/** O campo já mostra o prefixo "R$": com valores ocultos, só os pontos ("R$ ••••" na tela). */
const MASKED_VALUE = '••••';

/**
 * 10. Antes de financiar (D-044): a parcela, o tempo, os juros, o peso na renda, a alternativa de juntar antes e o efeito de
 * uma entrada maior. Nada é gravado: a taxa do financiamento e o rendimento são sempre digitados. A renda de referência
 * (D-026) entra sozinha, editável aqui sem gravar, e o comprometido do mês atual vem da renda comprometida. Com "Ocultar
 * valores", a renda que veio da referência fica mascarada e os valores do resultado aparecem como "R$ ••••".
 */
export function AntesDeFinanciarCalc({ prefill }: { prefill: CalcPrefill<'antes-de-financiar'> }) {
  const { today } = useSession();
  const hidden = useValuesHidden();
  const contextId = useSpace().data?.personalContextId;
  const summary = useCommittedSummary(contextId, monthOf(today));
  const form = useCalcForm<Key>(() => ({ preco: '', entrada: '', parcelas: '', taxaMes: '', renda: '', guardar: '', rendimento: '' }));
  const [first, setFirst] = useState(ANTES_FIELDS.primeiraEmUmMes!.default === true);
  const entradaRef = useRef<TextInput>(null);
  // Aberta de um cadastro ou de algo que já existe: nada a anotar nem a criar de novo.
  const fromContext = useNoteHidden(prefill.origem);

  // A renda de referência entra uma vez, enquanto a pessoa não mexe no campo; depois vale o que ela digitou (sem gravar).
  const referenceText = summary.data?.referenceCents ? centsToInput(summary.data.referenceCents) : '';
  const rendaEdited = form.edited('renda');
  const rendaFromReference = !rendaEdited && referenceText !== '';
  const rendaText = rendaEdited ? form.values.renda : referenceText;
  const committed = summary.data ? summary.data.committedCents : null;

  const outcome = useMemo(
    () =>
      calcAntesDeFinanciar(
        {
          preco: form.values.preco,
          entrada: form.values.entrada,
          parcelas: form.values.parcelas,
          taxaMes: form.values.taxaMes,
          primeiraEmUmMes: first,
          renda: rendaText,
          guardar: form.values.guardar,
          rendimento: form.values.rendimento,
          comprometidoCents: committed,
        },
        today,
      ),
    [form.values, first, rendaText, committed, today],
  );
  const errors: Partial<Record<string, CalcErrorCode>> = outcome.ok ? {} : outcome.errors;
  const result = outcome.ok ? outcome.result : null;
  const calc: CalcBinding<Key> = { slug: 'antes-de-financiar', form, errors };
  const fields = ANTES_FIELDS;

  const rendaSpec = fields.renda!;
  const rendaMasked = hidden && rendaFromReference;
  const rendaVisible = !rendaMasked && errors.renda && showError(errors.renda, rendaSpec, rendaText, form.blurred('renda'), rendaEdited);

  return (
    <CalcScreen slug="antes-de-financiar">
      <Card style={{ gap: space[4] }}>
        <CalcField calc={calc} name="preco" />
        <CalcField calc={calc} name="entrada" inputRef={entradaRef} />
        <CalcField calc={calc} name="parcelas" />
        <CalcField calc={calc} name="taxaMes" />
        <CalcYesNo spec={fields.primeiraEmUmMes!} value={first} onChange={setFirst} />
      </Card>

      <Card style={{ gap: space[3] }}>
        <View style={{ gap: space[1] }}>
          <CalcTextField
            spec={rendaSpec}
            value={rendaMasked ? MASKED_VALUE : rendaText}
            editable={!rendaMasked}
            hint={rendaFromReference ? (hidden ? ANTES_TEXT.rendaHidden : ANTES_TEXT.rendaFromReference) : undefined}
            accessibilityLabel={rendaMasked ? `${rendaSpec.label}, valor oculto` : undefined}
            onChangeText={(t) => form.set('renda', t)}
            onBlur={() => {
              if (!rendaMasked && rendaText.trim() !== '') {
                const formatted = formatMoneyText(rendaText);
                if (formatted !== rendaText) form.set('renda', formatted);
              }
              form.blur('renda');
            }}
            error={rendaVisible && errors.renda ? calcErrorText('antes-de-financiar', 'renda', errors.renda) : undefined}
          />
          {rendaMasked ? (
            <LinkButton
              label={ANTES_TEXT.showValues}
              accessibilityLabel={ANTES_TEXT.showValuesA11y}
              color={colors.textSecondary}
              style={calcInlineLink}
              onPress={() => setValuesHidden(false)}
            />
          ) : null}
        </View>
        {summary.isError ? <CalcNote>{ANTES_TEXT.loadFailed}</CalcNote> : null}
      </Card>

      <Card style={{ gap: space[4] }}>
        <Txt variant="title" accessibilityRole="header" aria-level={2}>
          {ANTES_TEXT.alternativeTitle}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {ANTES_TEXT.alternativeHint}
        </Txt>
        <CalcField calc={calc} name="guardar" />
        <CalcField calc={calc} name="rendimento" />
      </Card>

      <CalcResult texts={result} maskMoney />

      {result && !result.nothingToFinance ? (
        <>
          <SavingCard result={result} />
          <EntryCard result={result} onOther={() => entradaRef.current?.focus()} />
          {!fromContext && (result.noteParams || result.goalParams) ? (
            <View style={{ gap: space[3] }}>
              {result.noteParams ? (
                <Button
                  label={ANTES_TEXT.noteInstallment}
                  icon={Layers}
                  tone="soft"
                  onPress={() =>
                    router.push({
                      pathname: '/gastos-fixos/novo',
                      params: {
                        tipo: result.noteParams!.tipo,
                        natureza: result.noteParams!.natureza,
                        parcelas: String(result.noteParams!.parcelas),
                        ...(result.noteParams!.valor !== undefined ? { valor: String(result.noteParams!.valor) } : {}),
                      },
                    })
                  }
                />
              ) : null}
              {result.goalParams ? (
                <View style={{ gap: space[1] }}>
                  <Button
                    label={ANTES_TEXT.createGoal}
                    icon={Target}
                    tone="soft"
                    onPress={() => {
                      const g = result.goalParams!;
                      router.push({
                        pathname: '/meta/nova',
                        params: { tipo: g.tipo, valor: String(g.valor), prazo: g.prazo, ...(g.mensal !== null ? { mensal: String(g.mensal) } : {}) },
                      });
                    }}
                  />
                  <Txt variant="caption" color={colors.textSecondary}>
                    {ANTES_TEXT.createGoalHint}
                  </Txt>
                </View>
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}
    </CalcScreen>
  );
}

/** "Juntar antes": quanto tempo leva e a comparação neutra com o financiamento (região viva educada, como o resultado). */
function SavingCard({ result }: { result: AntesResult }) {
  return (
    <Card style={{ gap: space[3] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {ANTES_TEXT.savingTitle}
      </Txt>
      <View collapsable={false} style={{ gap: space[2] }} accessibilityLiveRegion="polite" aria-live="polite">
        {result.savingLines.map((line, i) => (
          <MoneyTxt key={`${i}-${line}`} style={i === 0 ? { fontFamily: fonts.bold } : undefined}>
            {line}
          </MoneyTxt>
        ))}
      </View>
    </Card>
  );
}

/** "Com uma entrada maior": mais 10% e 20% do preço de entrada, na parcela e nos juros, e o atalho para outra entrada. */
function EntryCard({ result, onOther }: { result: AntesResult; onOther: () => void }) {
  return (
    <Card style={{ gap: space[3] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {ANTES_TEXT.entryTitle}
      </Txt>
      {result.entryLines.length > 0 ? (
        <View style={{ gap: space[2] }}>
          {result.entryLines.map((line) => (
            <MoneyTxt key={line}>{line}</MoneyTxt>
          ))}
        </View>
      ) : (
        <Txt color={colors.textSecondary}>{ANTES_TEXT.noBiggerEntry}</Txt>
      )}
      <LinkButton label={ANTES_TEXT.otherEntry} style={calcInlineLink} onPress={onOther} />
    </Card>
  );
}
