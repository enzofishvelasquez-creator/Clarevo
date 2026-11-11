import { calcFields, calcMultaEJuros, type CalcPrefill, type MultaModo } from '@clarevo/core';
import { useState } from 'react';

import { CalcChoice, CalcField, CalcResult, CalcScreen, useCalcForm, type CalcBinding } from '@/components/calc/parts';
import { Card } from '@/components/ui';
import { space } from '@/theme/tokens';

type Key = 'valor' | 'multaPct' | 'jurosMesPct' | 'dias' | 'rotativoPct' | 'moraPct';

/**
 * 5. Multa e juros por atraso. "Conta ou boleto": multa uma vez e juros simples proporcionais aos dias. "Fatura do cartão" (D-093, era
 * D-089 G): o que ficou sem pagar, os juros do rotativo, os juros de mora, a multa, o IOF estimado e o teto da Lei 14.690/2023. O
 * resultado fala em "depois do vencimento"; os percentuais são sempre os que a pessoa lê no boleto, no contrato ou na fatura (nenhum
 * percentual padrão). Aberta de uma fatura vencida, já vem no modo da fatura.
 */
export function MultaEJurosCalc({ prefill }: { prefill: CalcPrefill<'multa-e-juros'> }) {
  const [modo, setModo] = useState<MultaModo>(prefill.modo === 'fatura' ? 'fatura' : 'conta');
  const specs = calcFields('multa-e-juros', modo);
  const form = useCalcForm<Key>(() => ({ valor: prefill.valor ?? '', multaPct: '', jurosMesPct: '', dias: prefill.dias ?? '', rotativoPct: '', moraPct: '' }));
  const outcome = calcMultaEJuros({ modo, ...form.values });
  const calc: CalcBinding<Key> = { slug: 'multa-e-juros', modo, form, errors: outcome.ok ? {} : outcome.errors };

  return (
    <CalcScreen slug="multa-e-juros">
      <Card style={{ gap: space[4] }}>
        <CalcChoice spec={specs.modo!} value={modo} onChange={(v) => setModo(v as MultaModo)} />
        <CalcField calc={calc} name="valor" />
        {modo === 'fatura' ? (
          <>
            <CalcField calc={calc} name="rotativoPct" />
            <CalcField calc={calc} name="moraPct" />
            <CalcField calc={calc} name="multaPct" />
          </>
        ) : (
          <>
            <CalcField calc={calc} name="multaPct" />
            <CalcField calc={calc} name="jurosMesPct" />
          </>
        )}
        <CalcField calc={calc} name="dias" />
      </Card>

      <CalcResult texts={outcome.ok ? outcome.result : null} />
    </CalcScreen>
  );
}
