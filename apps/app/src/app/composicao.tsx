import { ERROR_TEXT, formatDateBR, formatMonthBR } from '@clarevo/core';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { RecordRow } from '@/components/record-row';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Card, FitMoney, Money, Screen, Txt } from '@/components/ui';
import { useCommitments, useMonthRecords, useSpace, useView } from '@/state/data';
import { colors, fonts, space } from '@/theme/tokens';

const COPY = {
  recebido: { title: 'Recebido', criterio: 'Recebimentos realizados com data de recebimento neste mês.' },
  pago: { title: 'Pago', criterio: 'Gastos pagos com data de pagamento neste mês.' },
  apagar: {
    title: 'Ainda a pagar',
    criterio: 'Compromissos previstos com vencimento neste mês. Ainda não saíram da conta e não entram em Pago nem na diferença do mês.',
  },
  diferenca: {
    title: 'Diferença do mês',
    criterio:
      'Recebimentos menos pagamentos confirmados no período. Não é o saldo da conta nem dinheiro disponível: o saldo também depende do saldo inicial e de outros movimentos. Compromissos previstos não entram.',
  },
} as const;

/** Composição de cada total, com o mesmo critério e a mesma origem do resumo (CL C004). */
export default function ComposicaoScreen() {
  const { tipo } = useLocalSearchParams<{ tipo?: keyof typeof COPY }>();
  const kind = tipo && tipo in COPY ? tipo : 'pago';
  const copy = COPY[kind];
  const { month } = useView();
  const personal = useSpace().data;
  const records = useMonthRecords(personal?.personalContextId, month);
  const commitments = useCommitments(personal?.personalContextId, month);
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
    <Screen contentStyle={{ padding: space[6], gap: space[4] }}>
      <Stack.Screen options={{ title: copy.title }} />
      <View style={{ gap: space[1] }}>
        <Txt variant="caption" color={colors.textSecondary}>
          Pessoal · {formatMonthBR(month)}
        </Txt>
        {kind === 'apagar' ? (
          commitments.isPending ? (
            <LoadingState />
          ) : commitments.isError || !commitments.summary ? (
            <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => commitments.refetch()} />
          ) : (
            <FitMoney cents={commitments.summary.toPayCents} />
          )
        ) : records.isPending ? (
          <LoadingState />
        ) : records.isError || !s ? (
          <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => records.refetch()} />
        ) : (
          <FitMoney cents={kind === 'diferenca' ? s.differenceCents : sections[0]!.total} />
        )}
        <Txt color={colors.textSecondary}>{copy.criterio}</Txt>
      </View>
      {kind === 'apagar' && commitments.summary ? (
        <Card>
          {commitments.summary.items.length === 0 ? (
            <EmptyState title="Nenhum compromisso registrado" />
          ) : (
            commitments.summary.items.map((c, i, arr) => (
              <View key={c.id} style={[styles.commitment, i < arr.length - 1 && styles.divider]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt variant="label" style={{ fontFamily: fonts.bold }}>
                    {c.description}
                  </Txt>
                  <Txt variant="caption" color={colors.textSecondary}>
                    Previsto · vence em {formatDateBR(c.dueOn)}
                  </Txt>
                </View>
                <Money cents={c.amountCents} variant="label" style={{ fontFamily: fonts.bold, flexShrink: 0 }} />
              </View>
            ))
          )}
        </Card>
      ) : null}
      {(kind === 'apagar' ? [] : sections).map((sec) => (
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
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space[1], gap: space[2] },
  commitment: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3], minHeight: 56 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
});
