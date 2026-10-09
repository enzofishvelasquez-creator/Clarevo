import { RESERVA_MONTH_CHIPS, RESERVA_REFERENCIA, RESERVA_TEXT, calcFields, calcReserva, type CalcPrefill } from '@clarevo/core';
import * as Linking from 'expo-linking';
import { ExternalLink } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { CalcChip, CalcField, CalcResult, CalcScreen, calcInlineLink, onlyChoicesMissing, useCalcForm, type CalcBinding } from '@/components/calc/parts';
import { ChoiceGroup } from '@/components/series-parts';
import { Card, LinkButton, Txt } from '@/components/ui';
import { colors, space } from '@/theme/tokens';

type Key = 'essenciais' | 'meses' | 'guardado' | 'mensal';
type Pick = number | 'outro' | null;

const monthsLabel = (n: number) => (n === 1 ? '1 mês' : `${n} meses`);

/**
 * 6. Reserva para imprevistos: tamanho da reserva, quantos meses o que já está guardado cobre e em quanto tempo
 * completa. Meses a cobrir: chips 1, 3, 6 e 12, mais "Outro" (1 a 24), nenhum marcado no começo. Não diz onde
 * guardar. A referência vem do core (RESERVA_REFERENCIA): com link só quando o endereço foi conferido.
 * No Ciclo C, ganha "Criar reserva"; neste ciclo, nenhum botão.
 */
export function ReservaCalc({ prefill }: { prefill: CalcPrefill<'reserva'> }) {
  const specs = calcFields('reserva');
  const form = useCalcForm<Key>(() => ({ essenciais: prefill.essenciais ?? '', meses: '', guardado: '', mensal: '' }));
  const [pick, setPick] = useState<Pick>(null);
  const monthsText = pick === 'outro' ? form.values.meses : pick === null ? '' : String(pick);

  const outcome = calcReserva({ ...form.values, meses: monthsText });
  const errors = outcome.ok ? {} : outcome.errors;
  const calc: CalcBinding<Key> = { slug: 'reserva', form, errors };
  // Sem mês escolhido, o aviso ("Escolha ...") aparece quando é a única coisa que falta. O "Digite ..." fica para "Outro".
  const showChoice = pick === null && onlyChoicesMissing(errors, ['meses']);

  return (
    <CalcScreen slug="reserva">
      <Card style={{ gap: space[4] }}>
        <CalcField calc={calc} name="essenciais" />
        <ChoiceGroup
          label={specs.meses!.label}
          hint={specs.meses!.hint}
          error={showChoice ? RESERVA_TEXT.chooseMonths : undefined}>
          {RESERVA_MONTH_CHIPS.map((n) => (
            <CalcChip key={n} label={monthsLabel(n)} selected={pick === n} onPress={() => setPick(n)} />
          ))}
          <CalcChip label="Outro" accessibilityLabel="Outro número de meses" selected={pick === 'outro'} onPress={() => setPick('outro')} />
        </ChoiceGroup>
        {pick === 'outro' ? <CalcField calc={calc} name="meses" label="Número de meses" hint="De 1 a 24." /> : null}
        <CalcField calc={calc} name="guardado" hint="Opcional." />
        <CalcField calc={calc} name="mensal" hint="Opcional." />
      </Card>

      <CalcResult texts={outcome.ok ? outcome.result : null} />

      <View style={{ gap: space[1] }}>
        <Txt variant="label" color={colors.textSecondary}>
          {RESERVA_REFERENCIA.text}
        </Txt>
        {RESERVA_REFERENCIA.url ? (
          <LinkButton
            label="Abrir a página do Portal do Investidor"
            icon={ExternalLink}
            style={calcInlineLink}
            onPress={() => Linking.openURL(RESERVA_REFERENCIA.url!)}
          />
        ) : null}
      </View>
    </CalcScreen>
  );
}
