import { SIMULATE_TEXT, calcFields, calcJuntarParaObjetivo, simulateLinkParams, simulateValuesFromObjetivo, type CalcPrefill, type ObjetivoModo } from '@clarevo/core';
import { router } from 'expo-router';
import { ChartLine } from 'lucide-react-native';
import { useState } from 'react';

import { CalcChoice, CalcField, CalcResult, CalcScreen, calcInlineLink, useCalcForm, type CalcBinding } from '@/components/calc/parts';
import { Card, LinkButton } from '@/components/ui';
import { space } from '@/theme/tokens';

type Key = 'alvo' | 'jaTem' | 'meses' | 'mensal';

/**
 * 7. Juntar para um objetivo: quanto guardar por mês (informando o prazo) ou em quanto tempo (informando o valor por
 * mês). Sem rendimento, como diz a hipótese. Com o resultado, "Simular com rendimento" (Ciclo D) abre /simular com o modo e
 * os mesmos valores; a taxa é sempre digitada lá e nunca vai no endereço.
 */
export function JuntarParaObjetivoCalc({ prefill }: { prefill: CalcPrefill<'juntar-para-objetivo'> }) {
  const specs = calcFields('juntar-para-objetivo');
  const form = useCalcForm<Key>(() => ({ alvo: prefill.alvo ?? '', jaTem: '', meses: '', mensal: '' }));
  const [modo, setModo] = useState<ObjetivoModo>(prefill.modo ?? (specs.modo!.default as ObjetivoModo));

  const outcome = calcJuntarParaObjetivo({ ...form.values, modo });
  const calc: CalcBinding<Key> = { slug: 'juntar-para-objetivo', form, errors: outcome.ok ? {} : outcome.errors };

  return (
    <CalcScreen slug="juntar-para-objetivo">
      <Card style={{ gap: space[4] }}>
        <CalcField calc={calc} name="alvo" />
        <CalcField calc={calc} name="jaTem" hint="Opcional." />
        <CalcChoice spec={specs.modo!} value={modo} onChange={(v) => setModo(v as ObjetivoModo)} />
        {modo === 'prazo' ? <CalcField calc={calc} name="meses" /> : <CalcField calc={calc} name="mensal" />}
      </Card>

      <CalcResult texts={outcome.ok ? outcome.result : null}>
        {outcome.ok && !outcome.result.reached ? (
          <LinkButton
            label={SIMULATE_TEXT.calcLink}
            icon={ChartLine}
            style={calcInlineLink}
            onPress={() => router.push({ pathname: '/simular', params: simulateLinkParams(simulateValuesFromObjetivo(outcome.result)) })}
          />
        ) : null}
      </CalcResult>
    </CalcScreen>
  );
}
