import { CALC_UI_TEXT, calcCustoPorAno, calcErrorText, calcFields, type CalcPrefill, type Frequencia } from '@clarevo/core';
import { router } from 'expo-router';
import { Repeat } from 'lucide-react-native';
import { useState } from 'react';

import { CalcChoice, CalcField, CalcResult, CalcScreen, onlyChoicesMissing, useCalcForm, useNoteHidden, type CalcBinding } from '@/components/calc/parts';
import { Button, Card } from '@/components/ui';
import { space } from '@/theme/tokens';

/** 2. Quanto custa por ano? Assinaturas e gastos que se repetem; "Anotar como gasto fixo" com o valor por mês. */
export function CustoPorAnoCalc({ prefill }: { prefill: CalcPrefill<'custo-por-ano'> }) {
  const specs = calcFields('custo-por-ano');
  const form = useCalcForm<'valor'>(() => ({ valor: prefill.valor ?? '' }));
  const [frequencia, setFrequencia] = useState<Frequencia | null>(prefill.frequencia ?? null);

  const outcome = calcCustoPorAno({ valor: form.values.valor, frequencia });
  const errors = outcome.ok ? {} : outcome.errors;
  const calc: CalcBinding<'valor'> = { slug: 'custo-por-ano', form, errors };
  const result = outcome.ok ? outcome.result : null;
  const showChoice = onlyChoicesMissing(errors, ['frequencia']);
  // Aberta de um cadastro ou de algo que já existe: nada a anotar de novo.
  const fromContext = useNoteHidden(prefill.origem);

  return (
    <CalcScreen slug="custo-por-ano">
      <Card style={{ gap: space[4] }}>
        <CalcField calc={calc} name="valor" />
        <CalcChoice
          spec={specs.frequencia!}
          value={frequencia}
          onChange={(v) => setFrequencia(v as Frequencia)}
          error={showChoice ? calcErrorText('custo-por-ano', 'frequencia', 'vazio') : undefined}
        />
      </Card>

      <CalcResult texts={result} />

      {result?.noteParams && !fromContext ? (
        <Button
          label={CALC_UI_TEXT.noteFixed}
          icon={Repeat}
          tone="soft"
          onPress={() => router.push({ pathname: '/gastos-fixos/novo', params: { tipo: result.noteParams!.tipo, valor: String(result.noteParams!.valor) } })}
        />
      ) : null}
    </CalcScreen>
  );
}
