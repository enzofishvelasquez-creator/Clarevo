import {
  BUDGET_TEXT,
  CARDS_TEXT,
  ERROR_TEXT,
  ORGANIZE_TEXT,
  formatDayHeader,
  formatMonthBR,
  payablesCaptionFromSummary,
  payablesMonthParams,
  seriesCaptionShort,
  shortcutA11yLabel,
  sortNewestFirst,
  type FinancialRecord,
  type IsoMonth,
  budgetCaption,
  type BudgetSummary,
} from '@clarevo/core';
import { router } from 'expo-router';
import { Calculator, CalendarClock, ChevronRight, CreditCard, Minus, Plus, Repeat, Target, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeOut, LinearTransition, ReduceMotion } from 'react-native-reanimated';

import { cardsCaption } from '@/components/card-parts';
import { FamilyNotLinked } from '@/components/family-state';
import { FlashBanner, useFlash } from '@/components/flash';
import { AppHeader, ContextSwitch, MonthSwitcher } from '@/components/header';
import { RecordRow } from '@/components/record-row';
import { EmptyState, ErrorState } from '@/components/states';
import { Body, Button, Card, Chip, Money, Screen, Skeleton, Txt } from '@/components/ui';
import { maskMoneyLabel, maskMoneyText, useValuesHidden } from '@/lib/privacy';
import { useCardsOverview, useCommitments, useMonthBudget, useMonthRecords, useSeriesList, useSpace, useView } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, motion, radius, space } from '@/theme/tokens';

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

type Shortcut = { icon: LucideIcon; title: string; caption: string; open: () => void };

/**
 * Bloco "Organizar" (D-033, D-034, D-037, D-041): Contas a pagar e Gastos fixos e parcelamentos com legendas do mês (a mesma origem
 * do card "Ainda a pagar", D-021(5)), Cartões com a fatura atual, Orçamento por categoria com a categoria mais perto do limite
 * ("Mercado: R$ 412,30 de R$ 1.200,00") e Calculadoras com a legenda fixa. Enquanto carrega ou com erro, as linhas dinâmicas
 * mostram a legenda fixa (nunca um "0" de uma falha). Nenhuma cor de alerta.
 */
function organizeShortcuts(
  payables: string | null,
  series: string | null,
  cards: string,
  budget: BudgetSummary | null,
  month: IsoMonth,
  currentMonth: IsoMonth,
): Shortcut[] {
  return [
    {
      icon: CalendarClock,
      title: ORGANIZE_TEXT.payables.title,
      caption: payables ?? ORGANIZE_TEXT.payables.fallback,
      // A legenda fala do mês em exibição; Contas a pagar abre nesse mesmo mês (seletor local, D-039).
      open: () => router.push({ pathname: '/a-pagar', params: payablesMonthParams(month, currentMonth) }),
    },
    {
      icon: Repeat,
      title: ORGANIZE_TEXT.series.title,
      caption: series ?? ORGANIZE_TEXT.series.fallback,
      open: () => router.push('/gastos-fixos'),
    },
    {
      icon: CreditCard,
      title: CARDS_TEXT.organizeRow,
      caption: cards,
      open: () => router.push('/cartoes'),
    },
    {
      icon: Target,
      title: BUDGET_TEXT.organize.title,
      caption: budget ? budgetCaption(budget) : BUDGET_TEXT.organize.fallback,
      // A legenda fala do mês em exibição; o Orçamento abre nesse mesmo mês (seletor local).
      open: () => router.push({ pathname: '/orcamento', params: payablesMonthParams(month, currentMonth) }),
    },
    {
      icon: Calculator,
      title: ORGANIZE_TEXT.calculators.title,
      caption: ORGANIZE_TEXT.calculators.caption,
      open: () => router.push('/calcular'),
    },
  ];
}

const rowExit = FadeOut.duration(motion.detail).reduceMotion(ReduceMotion.System);
const rowLayout = LinearTransition.duration(motion.detail).reduceMotion(ReduceMotion.System);

export default function MovimentacoesScreen() {
  const { today } = useSession();
  const { space: kind, month, currentMonth } = useView();
  const personal = useSpace().data;
  const contextId = kind === 'pessoal' ? personal?.personalContextId : undefined;
  const records = useMonthRecords(contextId, month);
  // Só no contexto Pessoal (na Família, contextId fica vazio e as consultas não rodam).
  const commitments = useCommitments(contextId, month);
  const seriesList = useSeriesList(contextId);
  const cardsOverview = useCardsOverview(contextId);
  const budget = useMonthBudget(contextId, month);
  const shortcuts = organizeShortcuts(
    commitments.summary ? payablesCaptionFromSummary(commitments.summary, today) : null,
    seriesList.data ? seriesCaptionShort(seriesList.data) : null,
    cardsCaption(cardsOverview.data ?? null, today),
    budget.summary,
    month,
    currentMonth,
  );
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
            <FamilyNotLinked splitLink />
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

              <Card style={styles.shortcuts}>
                <Txt variant="title" accessibilityRole="header" aria-level={2}>
                  {ORGANIZE_TEXT.title}
                </Txt>
                <View>
                  {shortcuts.map((sc, i) => (
                    <ShortcutRow key={sc.title} {...sc} last={i === shortcuts.length - 1} />
                  ))}
                </View>
              </Card>

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
                  <EmptyState
                    title={`Nenhum registro em ${formatMonthBR(month).toLowerCase()}`}
                    // Filtro sem registros num mês que tem outros: a ação volta para todos.
                    action={
                      filter !== 'todos' && (records.data?.length ?? 0) > 0 ? (
                        <Button label="Mostrar todos" tone="soft" onPress={() => setFilter('todos')} />
                      ) : undefined
                    }>
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

/** Linha de atalho: ícone, nome, legenda curta e seta; nome acessível com a legenda ("Contas a pagar, R$ 650,00 em aberto neste mês, 1 vencida"). */
function ShortcutRow({ icon: Icon, title, caption, open, last }: Shortcut & { last: boolean }) {
  const hidden = useValuesHidden();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={maskMoneyLabel(shortcutA11yLabel(title, caption), hidden)}
      onPress={open}
      style={(st) => [
        styles.shortcut,
        !last && styles.divider,
        st.pressed && { opacity: 0.7 },
        (st as { focused?: boolean }).focused && styles.focusRing,
      ]}>
      <View style={styles.shortcutIcon}>
        <Icon size={20} color={colors.brand} strokeWidth={2.25} aria-hidden />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 15 }}>
          {title}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {maskMoneyText(caption, hidden)}
        </Txt>
      </View>
      <ChevronRight size={20} color={colors.textSecondary} aria-hidden />
    </Pressable>
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
  shortcuts: { gap: space[1], paddingVertical: space[4] },
  shortcut: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 10, minHeight: 56 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  shortcutIcon: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
  focusRing: { outlineWidth: 3, outlineColor: colors.brand, outlineStyle: 'solid', outlineOffset: 2 } as object,
});
