import { calcFields, calcQuitarAntes, type CalcPrefill, type QuitarModo } from '@clarevo/core';
import { useState } from 'react';

import { CalcChoice, CalcField, CalcResult, CalcScreen, useCalcForm, type CalcBinding } from '@/components/calc/parts';
import { Card } from '@/components/ui';
import { space } from '@/theme/tokens';

type Key = 'parcela' | 'restantes' | 'taxaMes' | 'quantas';

/**
 * 4. Quitar antes ou adiantar parcelas: sempre uma estimativa (o texto fixo vem nas notas do resultado); nunca
 * o termo vetado em D-024(7). Aberta pelo detalhe de um financiamento ou compra parcelada, recebe também os dias até cada
 * vencimento que falta (prazos): eles valem enquanto "Parcelas que faltam" tiver o mesmo número de prazos.
 */
export function QuitarAntesCalc({ prefill }: { prefill: CalcPrefill<'quitar-antes'> }) {
  const specs = calcFields('quitar-antes');
  const form = useCalcForm<Key>(() => ({ parcela: prefill.parcela ?? '', restantes: prefill.restantes ?? '', taxaMes: '', quantas: '' }));
  const [modo, setModo] = useState<QuitarModo>(prefill.modo ?? (specs.modo!.default as QuitarModo));

  const outcome = calcQuitarAntes({ ...form.values, modo, prazosEmDias: prefill.prazosEmDias });
  const calc: CalcBinding<Key> = { slug: 'quitar-antes', form, errors: outcome.ok ? {} : outcome.errors };

  return (
    <CalcScreen slug="quitar-antes">
      <Card style={{ gap: space[4] }}>
        <CalcField calc={calc} name="parcela" />
        <CalcField calc={calc} name="restantes" />
        <CalcField calc={calc} name="taxaMes" />
        <CalcChoice spec={specs.modo!} value={modo} onChange={(v) => setModo(v as QuitarModo)} />
        {modo === 'ultimas' ? <CalcField calc={calc} name="quantas" /> : null}
      </Card>

      <CalcResult texts={outcome.ok ? outcome.result : null} />
    </CalcScreen>
  );
}
