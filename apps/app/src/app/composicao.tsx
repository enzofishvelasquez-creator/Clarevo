import { ERROR_TEXT, formatMonthBR } from '@clarevo/core';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { RecordRow } from '@/components/record-row';
import { ContextPill, SubHeader } from '@/components/header';
import { EmptyState, ErrorState } from '@/components/states';
import { Card, FitMoney, Money, Screen, Skeleton, Txt } from '@/components/ui';
import { useMonthRecords, useSpace, useView } from '@/state/data';
import { colors, space } from '@/theme/tokens';

const COPY = {
  recebido: { title: 'Recebido', criterio: 'Recebimentos realizados com data de recebimento neste mês.' },
  pago: { title: 'Pago', criterio: 'Gastos pagos com data de pagamento neste mês.' },
  diferenca: {
    title: 'Diferença do mês',
    criterio:
      'Recebimentos menos pagamentos confirmados no período. Não é o saldo da conta nem dinheiro disponível: o saldo também depende do saldo inicial e de outros movimentos. Contas a pagar não entram.',
  },
} as const;

/** Composição de cada total, com o mesmo critério e a mesma origem do resumo (CL C004). */
export default function ComposicaoScreen() {
  const { tipo } = useLocalSearchParams<{ tipo?: string }>();
  // Endereço antigo de "Ainda a pagar": a lista agora é /a-pagar.
  if (tipo === 'apagar') return <Redirect href="/a-pagar" />;
  return <Composicao kind={tipo && tipo in COPY ? (tipo as keyof typeof COPY) : 'pago'} />;
}

function Composicao({ kind }: { kind: keyof typeof COPY }) {
  const copy = COPY[kind];
  const { month } = useView();
  const personal = useSpace().data;
  const records = useMonthRecords(personal?.personalContextId, month);
  const s = records.summary;

  const sections = !s
    ? []
    : kind === 'diferenca'
      ? [
          { label: 'Recebido', total: s.receivedCents, list: s.composition.received },
          { label: 'Pago', total: s.paidCents, list: s.composition.paid },
        ]
      : [
          kind === 'recebido'
            ? { label: 'Recebido', total: s.receivedCents, list: s.composition.received }
            : { label: 'Pago', total: s.paidCents, list: s.composition.paid },
        ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
    <SubHeader title={copy.title} right={<ContextPill label="Pessoal" />} />
    <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
      <View style={{ gap: space[1] }}>
        <Txt variant="caption" color={colors.textSecondary}>
          Pessoal · {formatMonthBR(month)}
        </Txt>
        {records.isPending ? (
          <Skeleton width={180} height={40} />
        ) : records.isError || !s ? (
          <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => records.refetch()} />
        ) : (
          <FitMoney cents={kind === 'diferenca' ? s.differenceCents : sections[0]!.total} />
        )}
        <Txt color={colors.textSecondary}>{copy.criterio}</Txt>
      </View>
      {sections.map((sec) => (
        <Card key={sec.label}>
          <View style={styles.head}>
            <Txt variant="title">{sec.label}</Txt>
            <Money cents={sec.total} variant="title" />
          </View>
          {sec.list.length === 0 ? (
            <EmptyState title="Nenhum registro neste critério" />
          ) : (
            sec.list.map((r, i) => (
              <RecordRow key={r.id} record={r} last={i === sec.list.length - 1} onPress={() => router.push(`/registro/${r.id}`)} />
            ))
          )}
        </Card>
      ))}
    </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space[1], gap: space[2] },
});
