import { calcMultaEJuros, type CalcPrefill } from '@clarevo/core';

import { CalcField, CalcResult, CalcScreen, useCalcForm, type CalcBinding } from '@/components/calc/parts';
import { Card } from '@/components/ui';
import { space } from '@/theme/tokens';

type Key = 'valor' | 'multaPct' | 'jurosMesPct' | 'dias';

/**
 * 5. Multa e juros por atraso: multa uma vez e juros simples proporcionais aos dias. O resultado fala em "depois do
 * vencimento"; multa e juros são sempre os que a pessoa lê no boleto ou no contrato (nenhum percentual padrão).
 */
export function MultaEJurosCalc({ prefill }: { prefill: CalcPrefill<'multa-e-juros'> }) {
  const form = useCalcForm<Key>(() => ({ valor: prefill.valor ?? '', multaPct: '', jurosMesPct: '', dias: prefill.dias ?? '' }));
  const outcome = calcMultaEJuros(form.values);
  const calc: CalcBinding<Key> = { slug: 'multa-e-juros', form, errors: outcome.ok ? {} : outcome.errors };

  return (
    <CalcScreen slug="multa-e-juros">
      <Card style={{ gap: space[4] }}>
        <CalcField calc={calc} name="valor" />
        <CalcField calc={calc} name="multaPct" />
        <CalcField calc={calc} name="jurosMesPct" />
        <CalcField calc={calc} name="dias" />
      </Card>

      <CalcResult texts={outcome.ok ? outcome.result : null} />
    </CalcScreen>
  );
}
