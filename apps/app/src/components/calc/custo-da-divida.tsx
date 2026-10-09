import { DIVIDA_TEXT, calcCustoDaDivida, calcErrorText, calcFields, type CalcPrefill, type DividaTipo } from '@clarevo/core';
import { useState } from 'react';

import { CalcChoice, CalcField, CalcResult, CalcScreen, onlyChoicesMissing, useCalcForm, type CalcBinding } from '@/components/calc/parts';
import { Card, Txt } from '@/components/ui';
import { space } from '@/theme/tokens';

type Key = 'valor' | 'taxaMes' | 'meses' | 'parcelas' | 'parcelarTaxaMes' | 'parcelarParcelas';

/**
 * 3. Quanto custa uma dívida? Rotativo (1 ciclo e, depois, "E se parcelar a fatura?" com o limite da Lei 14.690/2023),
 * cheque especial (meses, com o aviso do teto) ou empréstimo (parcelas, com o lembrete do CET). Só o campo do tipo
 * escolhido é pedido. A taxa é sempre a que a pessoa digita.
 */
export function CustoDaDividaCalc({ prefill }: { prefill: CalcPrefill<'custo-da-divida'> }) {
  const specs = calcFields('custo-da-divida');
  const form = useCalcForm<Key>(() => ({
    valor: prefill.valor ?? '',
    taxaMes: '',
    meses: '',
    parcelas: prefill.parcelas ?? '',
    parcelarTaxaMes: '',
    parcelarParcelas: '',
  }));
  const [tipo, setTipo] = useState<DividaTipo | null>(prefill.tipo ?? null);

  const outcome = calcCustoDaDivida({ tipo, ...form.values });
  const result = outcome.ok ? outcome.result : null;
  const parcelamento = result?.parcelamento ?? null;
  // Os erros de "E se parcelar a fatura?" vêm no resultado do rotativo, que continua aparecendo.
  const errors = outcome.ok ? (parcelamento && !parcelamento.ok ? parcelamento.errors : {}) : outcome.errors;
  const calc: CalcBinding<Key> = { slug: 'custo-da-divida', form, errors };
  const showChoice = onlyChoicesMissing(errors, ['tipo']);

  return (
    <CalcScreen slug="custo-da-divida">
      <Card style={{ gap: space[4] }}>
        <CalcChoice
          spec={specs.tipo!}
          value={tipo}
          onChange={(v) => setTipo(v as DividaTipo)}
          error={showChoice ? calcErrorText('custo-da-divida', 'tipo', 'vazio') : undefined}
        />
        <CalcField calc={calc} name="valor" />
        <CalcField calc={calc} name="taxaMes" />
        {tipo === 'cheque_especial' ? <CalcField calc={calc} name="meses" /> : null}
        {tipo === 'emprestimo' ? <CalcField calc={calc} name="parcelas" /> : null}
      </Card>

      <CalcResult texts={result} />

      {result?.tipo === 'rotativo' ? (
        <>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {DIVIDA_TEXT.parcelarTitle}
          </Txt>
          <Card style={{ gap: space[4] }}>
            <CalcField calc={calc} name="parcelarTaxaMes" />
            <CalcField calc={calc} name="parcelarParcelas" />
          </Card>
          <CalcResult texts={parcelamento?.ok ? parcelamento.result : null} level={3} />
        </>
      ) : null}
    </CalcScreen>
  );
}
