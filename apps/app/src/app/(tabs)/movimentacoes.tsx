import { ERROR_TEXT, formatDayHeader, formatMonthBR, sortNewestFirst, type FinancialRecord } from '@clarevo/core';
import { router } from 'expo-router';
import { Minus, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeOut, LinearTransition, ReduceMotion } from 'react-native-reanimated';

import { FamilyNotLinked } from '@/components/family-state';
import { FlashBanner, useFlash } from '@/components/flash';
import { AppHeader, ContextSwitch, MonthSwitcher } from '@/components/header';
import { RecordRow } from '@/components/record-row';
import { EmptyState, ErrorState } from '@/components/states';
import { Body, Button, Card, Chip, Money, Screen, Skeleton, Txt } from '@/components/ui';
import { useMonthRecords, useSpace, useView } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, motion, space } from '@/theme/tokens';

type Filter = 'todos' | 'receita' | 'despesa';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'receita', label: 'Recebidos' },
  { value: 'despesa', label: 'Pagos' },
];

/** Agrupa por dia, do mais recente para o mais antigo. */
function groupByDay(list: FinancialRecord[]) {
  const groups: { day: string; items: FinancialRecord[] }[] = [];
  for (const r of list) {
    const last = groups[groups.length - 1];
    if (last && last.day === r.occurredOn) last.items.push(r);
    else groups.push({ day: r.occurredOn, items: [r] });
  }
  return groups;
}

const rowExit = FadeOut.duration(motion.detail).reduceMotion(ReduceMotion.System);
const rowLayout = LinearTransition.duration(motion.detail).reduceMotion(ReduceMotion.System);

export default function MovimentacoesScreen() {
  const { today } = useSession();
  const { space: kind, month } = useView();
  const personal = useSpace().data;
  const contextId = kind === 'pessoal' ? personal?.personalContextId : undefined;
  const records = useMonthRecords(contextId, month);
  const [filter, setFilter] = useState<Filter>('todos');
  const [notice] = useFlash();
  const s = records.summary;
  const list = records.data ? sortNewestFirst(records.data).filter((r) => filter === 'todos' || r.kind === filter) : [];
  const groups = groupByDay(list);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Screen wide>
        <AppHeader title="Movimentações">
          <ContextSwitch />
          <MonthSwitcher />
        </AppHeader>
        <Body>
          <FlashBanner message={notice} />
          {kind === 'familia' ? (
            <FamilyNotLinked />
          ) : (
            <>
              <View style={styles.actions}>
                <Button
                  label="Anotar gasto"
                  icon={Minus}
                  style={styles.action}
                  onPress={() => router.push({ pathname: '/registro/novo', params: { tipo: 'despesa' } })}
                />
                <Button
                  label="Registrar recebimento"
                  icon={Plus}
                  tone="soft"
                  style={styles.action}
                  onPress={() => router.push({ pathname: '/registro/novo', params: { tipo: 'receita' } })}
                />
              </View>

              {s ? (
                <View style={styles.totals}>
                  <Card style={styles.total}>
                    <Txt variant="caption" color={colors.textSecondary} style={{ fontFamily: fonts.bold }}>
                      Recebido em {formatMonthBR(month).split(' ')[0]!.toLowerCase()}
                    </Txt>
                    <Money cents={s.receivedCents} variant="label" style={styles.totalValue} color={colors.success} />
                  </Card>
                  <Card style={styles.total}>
                    <Txt variant="caption" color={colors.textSecondary} style={{ fontFamily: fonts.bold }}>
                      Pago em {formatMonthBR(month).split(' ')[0]!.toLowerCase()}
                    </Txt>
                    <Money cents={s.paidCents} variant="label" style={styles.totalValue} />
                  </Card>
                </View>
              ) : null}

              <View style={styles.filters} accessibilityRole="radiogroup" accessibilityLabel="Mostrar">
                {FILTERS.map((f) => (
                  <Chip key={f.value} label={f.label} selected={filter === f.value} onPress={() => setFilter(f.value)} />
                ))}
              </View>

              <Card>
                {records.isPending ? (
                  <View style={{ gap: space[3] }} accessibilityRole="progressbar" accessibilityLabel="Carregando movimentações">
                    <Skeleton width={80} height={14} />
                    <Skeleton width="100%" height={44} />
                    <Skeleton width="100%" height={44} />
                  </View>
                ) : records.isError ? (
                  <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => records.refetch()} />
                ) : list.length === 0 ? (
                  <EmptyState title={`Nenhum registro em ${formatMonthBR(month).toLowerCase()}`}>
                    {filter === 'todos'
                      ? 'Recebimentos e gastos já realizados aparecem aqui, do mais recente para o mais antigo.'
                      : 'Nenhum registro deste tipo no mês.'}
                  </EmptyState>
                ) : (
                  groups.map((g) => (
                    <Animated.View key={g.day} layout={rowLayout}>
                      <Txt variant="caption" color={colors.textSecondary} style={styles.day} accessibilityRole="header" aria-level={3}>
                        {formatDayHeader(g.day, today)}
                      </Txt>
                      {g.items.map((r, i) => (
                        <Animated.View key={r.id} exiting={rowExit} layout={rowLayout}>
                          <RecordRow record={r} last={i === g.items.length - 1} onPress={() => router.push(`/registro/${r.id}`)} />
                        </Animated.View>
                      ))}
                    </Animated.View>
                  ))
                )}
              </Card>
            </>
          )}
        </Body>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  action: { flexGrow: 1, flexBasis: 220, alignSelf: 'auto' },
  totals: { flexDirection: 'row', gap: space[3], flexWrap: 'wrap' },
  total: { flexGrow: 1, flexBasis: 140, padding: space[4], gap: space[1] },
  totalValue: { fontFamily: fonts.extrabold, fontSize: 18, lineHeight: 26 },
  filters: { flexDirection: 'row', gap: space[2], flexWrap: 'wrap' },
  day: { fontFamily: fonts.bold, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: space[2] },
});
