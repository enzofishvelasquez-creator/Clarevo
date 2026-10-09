import { calcFields, calcJuntarParaObjetivo, type CalcPrefill, type ObjetivoModo } from '@clarevo/core';
import { useState } from 'react';

import { CalcChoice, CalcField, CalcResult, CalcScreen, useCalcForm, type CalcBinding } from '@/components/calc/parts';
import { Card } from '@/components/ui';
import { space } from '@/theme/tokens';

type Key = 'alvo' | 'jaTem' | 'meses' | 'mensal';

/**
 * 7. Juntar para um objetivo: quanto guardar por mês (informando o prazo) ou em quanto tempo (informando o valor por
 * mês). Sem rendimento, como diz a hipótese; no Ciclo D a mesma tela ganha a taxa de rendimento opcional.
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

      <CalcResult texts={outcome.ok ? outcome.result : null} />
    </CalcScreen>
  );
}
