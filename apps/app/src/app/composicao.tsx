import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Card, EventRow, Money, Screen, Txt } from '@/components/ui';
import { monthLabel, useFinance } from '@/state/finance';
import { colors, space } from '@/theme/tokens';

const COPY = {
  recebido: { title: 'Recebido', criterio: 'Entradas confirmadas com data de recebimento neste mês.' },
  pago: { title: 'Pago', criterio: 'Saídas confirmadas com data de pagamento neste mês.' },
  apagar: { title: 'Ainda a pagar neste mês', criterio: 'Saídas previstas com vencimento neste mês. Ainda não saíram da conta.' },
  diferenca: {
    title: 'Diferença do mês',
    criterio: 'Recebimentos menos pagamentos confirmados no período. Não é o saldo da conta, que também depende do saldo inicial e de outras movimentações.',
  },
} as const;

/** Composição de cada total, pelo mesmo critério do resumo (CL-V003). */
export default function ComposicaoScreen() {
  const { tipo = 'pago' } = useLocalSearchParams<{ tipo?: keyof typeof COPY }>();
  const { summary, activeContext, month } = useFinance();
  const copy = COPY[tipo] ?? COPY.pago;

  const sections =
    tipo === 'diferenca'
      ? [
          { label: 'Recebido', total: summary.receivedCents, events: summary.composition.received },
          { label: 'Pago', total: summary.paidCents, events: summary.composition.paid },
        ]
      : [
          {
            label: copy.title,
            total: tipo === 'recebido' ? summary.receivedCents : tipo === 'apagar' ? summary.toPayCents : summary.paidCents,
            events: tipo === 'recebido' ? summary.composition.received : tipo === 'apagar' ? summary.composition.toPay : summary.composition.paid,
          },
        ];

  return (
    <Screen contentStyle={{ padding: space[6], gap: space[4] }}>
      <View style={{ gap: space[1] }}>
        <Txt variant="caption" color={colors.textSecondary}>
          {activeContext.name} · {monthLabel(month)}
        </Txt>
        <Txt variant="title" style={{ fontSize: 22 }}>{copy.title}</Txt>
        <Money cents={tipo === 'diferenca' ? summary.differenceCents : sections[0]!.total} variant="hero" />
        <Txt color={colors.textSecondary}>{copy.criterio}</Txt>
      </View>
      {sections.map((s) => (
        <Card key={s.label}>
          <View style={styles.head}>
            <Txt variant="title">{s.label}</Txt>
            <Money cents={s.total} variant="title" />
          </View>
          {s.events.length === 0 ? (
            <Txt color={colors.textSecondary}>Nenhum evento neste critério.</Txt>
          ) : (
            s.events.map((e) => <EventRow key={e.id} event={e} onPress={() => router.push('/movimentos')} />)
          )}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space[1] },
});
