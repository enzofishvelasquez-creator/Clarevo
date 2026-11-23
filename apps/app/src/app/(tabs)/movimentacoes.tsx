import {
  ACCOUNTS_TEXT,
  BUDGET_TEXT,
  BUSINESS_WORDS,
  CALENDAR_TEXT,
  CARDS_TEXT,
  ERROR_TEXT,
  IMPORT_TEXT,
  ORGANIZE_TEXT,
  accountFilterOptions,
  analysesParams,
  calendarMonthParams,
  dayRows,
  filterByAccount,
  formatDayHeader,
  formatBRL,
  formatMonthBR,
  groupRecordsByDay,
  isLongList,
  payablesCaptionFromSummary,
  recordAccountName,
  payablesMonthParams,
  seriesCaptionShort,
  shortcutA11yLabel,
  sortNewestFirst,
  type DayRow,
  type IsoMonth,
  budgetCaption,
  type BudgetSummary,
} from '@clarevo/core';
import { router } from 'expo-router';
import { ArrowDownLeft, Calculator, CalendarClock, CalendarDays, ChevronRight, CreditCard, FileUp, Plus, Repeat, Target, type LucideIcon } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeOut, LinearTransition, ReduceMotion } from 'react-native-reanimated';

import { cardsCaption } from '@/components/card-parts';
import { FlashBanner, useFlash } from '@/components/flash';
import { AppHeader, ContextSwitch, MonthSwitcher } from '@/components/header';
import { RecordRow } from '@/components/record-row';
import { RecordsTable } from '@/components/records-table';
import { SearchEntry } from '@/components/search-parts';
import { AnalysesEntry } from '@/components/analises-parts';
import { AnalysesHeaderEntry } from '@/components/analyses-shortcut';
import { EmptyState, ErrorState } from '@/components/states';
import { Body, Button, Card, CardSlice, Chip, ListCell, Money, Screen, ScreenList, Skeleton, Txt } from '@/components/ui';
import { WIDE_CONTENT_MAX, useWideLayout } from '@/lib/layout';
import { maskMoneyLabel, maskMoneyText, useValuesHidden } from '@/lib/privacy';
import { useAccounts, useCardsOverview, useCommitments, useMonthBudget, useMonthRecords, useSeriesList, useWork, useView } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, motion, radius, space } from '@/theme/tokens';

type Filter = 'todos' | 'receita' | 'despesa';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'receita', label: 'Recebidos' },
  { value: 'despesa', label: 'Pagos' },
];

/** Linha da lista: o cartão inteiro (lista curta) ou, na lista longa, o título de um dia ou um registro. */
type Cell = { type: 'card'; key: string; first: boolean; last: boolean } | DayRow;

type Shortcut = { icon: LucideIcon; title: string; caption: string; open: () => void };

/**
 * Bloco "Organizar" (D-033, D-034, D-037, D-041, D-105): Contas a pagar e Gastos fixos e parcelamentos com legendas do mês (a mesma origem
 * do card "Ainda a pagar", D-021(5)), entre eles o Calendário do mês (D-105, legenda fixa), Cartões com a fatura atual, Orçamento por categoria com a categoria mais perto do limite
 * ("Mercado: R$ 412,30 de R$ 1.200,00"), Importar extrato ou fatura (D-048, legenda fixa) e Calculadoras com a legenda fixa. Enquanto carrega ou com erro, as linhas dinâmicas
 * mostram a legenda fixa (nunca um "0" de uma falha). Nenhuma cor de alerta.
 */
function organizeShortcuts(
  payables: string | null,
  series: string | null,
  cards: string,
  budget: BudgetSummary | null,
  month: IsoMonth,
  currentMonth: IsoMonth,
  business = false,
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
      // Calendário financeiro (D-105): contas, faturas, vencimentos e datas do mês em exibição, só leitura.
      icon: CalendarDays,
      title: CALENDAR_TEXT.rowTitle,
      caption: CALENDAR_TEXT.rowCaption,
      open: () => router.push({ pathname: '/calendario', params: calendarMonthParams(month, currentMonth) }),
    },
    {
      icon: Repeat,
      title: ORGANIZE_TEXT.series.title,
      caption: series ?? (business ? ORGANIZE_TEXT.series.businessFallback : ORGANIZE_TEXT.series.fallback),
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
      icon: FileUp,
      title: IMPORT_TEXT.rowTitle,
      caption: IMPORT_TEXT.rowCaption,
      open: () => router.push('/importar'),
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
  const hidden = useValuesHidden();
  const { month, currentMonth } = useView();
  const work = useWork().data;
  const contextId = work?.contextId;
  const canWrite = work?.canWrite ?? true;
  // Espaço Negócio (auditoria de 18/11/2026): entradas e saídas, como em "Seu negócio"; o Pessoal e a Família continuam como sempre.
  const inBusiness = work?.contextKind === 'negocio';
  const records = useMonthRecords(contextId, month);
  const commitments = useCommitments(contextId, month);
  const seriesList = useSeriesList(contextId);
  const cardsOverview = useCardsOverview(contextId);
  const budget = useMonthBudget(contextId, month);
  const shortcuts = organizeShortcuts(
    commitments.summary ? payablesCaptionFromSummary(commitments.summary, today) : null,
    seriesList.data ? seriesCaptionShort(seriesList.data, inBusiness) : null,
    cardsCaption(cardsOverview.data ?? null, today),
    budget.summary,
    month,
    currentMonth,
    inBusiness,
  );
  const [filter, setFilter] = useState<Filter>('todos');
  // Conta de origem (D-043): o filtro e o nome na linha só aparecem com 2 ou mais contas ativas.
  const accounts = useAccounts(contextId);
  const [accountFilter, setAccountFilter] = useState<string | null>(null);
  const accountOptions = accounts.data && records.data ? accountFilterOptions(accounts.data, records.data) : [];
  const accountId = accountOptions.some((o) => o.id === accountFilter) ? accountFilter : null;
  const [notice] = useFlash();
  const wide = useWideLayout();
  const s = records.summary;
  const list = useMemo(
    () => (records.data ? filterByAccount(sortNewestFirst(records.data), accountId).filter((r) => filter === 'todos' || r.kind === filter) : []),
    [records.data, accountId, filter],
  );
  const groups = useMemo(() => groupRecordsByDay(list), [list]);
  // Mês com muitos lançamentos (D-062 item 5): a lista passa a montar só as linhas perto da tela. Abaixo disso, o cartão de sempre.
  const long = !records.isPending && !records.isError && isLongList(list.length);
  const rows = useMemo(() => (long ? dayRows(groups) : []), [long, groups]);
  const cells: Cell[] = long ? rows : [{ type: 'card', key: 'card', first: true, last: true }];

  // Revisão das telas (16/11/2026): o primeiro movimento à vista sem rolar em 390 × 844. No topo, o mês, Recebido e Pago, os dois botões
  // de anotar, os filtros e "Buscar", logo acima da lista. Depois da lista, "Ver análises do mês" (no lugar de "Seu mês em 30 segundos",
  // "Evolução" e "Análises": a Evolução é uma aba das Análises e o Seu mês fica logo abaixo do mês delas) e o bloco "Organizar".

  /**
   * Os botões de anotar: "+" em "Anotar gasto", como no Resumo, e a seta de entrada em "Registrar recebimento", como nas linhas. No
   * computador, só "Registrar recebimento": a barra lateral já tem o mesmo "Anotar gasto" ("Anotar saída" no negócio), com a mesma regra
   * de quem pode anotar (revisão visual de 23/11/2026: eram dois botões principais iguais lado a lado).
   */
  const actions = canWrite ? (
    <View style={styles.actions}>
      {wide ? null : (
        <Button
          label={inBusiness ? BUSINESS_WORDS.addOut : 'Anotar gasto'}
          icon={Plus}
          style={styles.action}
          onPress={() => router.push({ pathname: '/registro/novo', params: { tipo: 'despesa' } })}
        />
      )}
      <Button
        label={inBusiness ? BUSINESS_WORDS.addIn : 'Registrar recebimento'}
        icon={ArrowDownLeft}
        tone="soft"
        style={styles.action}
        onPress={() => router.push({ pathname: '/registro/novo', params: { tipo: 'receita' } })}
      />
    </View>
  ) : null;

  /** "Ver análises do mês" (D-059): abre no mês em exibição, com Categorias, Evolução, Próximos meses, Orçamento e o Seu mês. */
  const openAnalyses = () => router.push({ pathname: '/analises', params: analysesParams(month, currentMonth) });
  const analyses = <AnalysesEntry onPress={openAnalyses} />;
  /** "Análises" no alto, na linha do título (D-105, retorno do teste de 17/11/2026), sem empurrar a lista. */
  const analysesTop = <AnalysesHeaderEntry onPress={openAnalyses} />;

  const organize = (
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
  );

  /** Recebido e Pago do mês, que abrem a composição. */
  const totals = s ? (
    <View style={styles.totals}>
      {/* Os totais abrem a composição do mês (docs/10 A10), como o Recebido e o Pago do Resumo. */}
      {(
        [
          // Valores numa cor só (auditoria de 18/11/2026): a direção já está no rótulo.
          { tipo: 'recebido', label: 'Recebido', cents: s.receivedCents, color: colors.text },
          { tipo: 'pago', label: 'Pago', cents: s.paidCents, color: undefined },
        ] as const
      ).map((t) => {
        const title = inBusiness ? (t.tipo === 'recebido' ? BUSINESS_WORDS.inMonth(month) : BUSINESS_WORDS.outMonth(month)) : `${t.label} em ${formatMonthBR(month).split(' ')[0]!.toLowerCase()}`;
        return (
          <Pressable
            key={t.tipo}
            accessibilityRole="button"
            accessibilityLabel={maskMoneyLabel(`${title}, ${formatBRL(t.cents)}. Ver a composição`, hidden)}
            onPress={() => router.push({ pathname: '/composicao', params: { tipo: t.tipo } })}
            style={(st) => [styles.totalPress, st.pressed && { opacity: 0.85 }, (st as { focused?: boolean }).focused && styles.focusRing]}>
            <Card style={styles.total}>
              <View style={styles.totalHead}>
                <Txt variant="caption" color={colors.textSecondary} style={{ fontFamily: fonts.bold, flexShrink: 1 }}>
                  {title}
                </Txt>
                <ChevronRight size={16} color={colors.textSecondary} />
              </View>
              <Money cents={t.cents} variant="label" style={styles.totalValue} color={t.color} />
            </Card>
          </Pressable>
        );
      })}
    </View>
  ) : null;

  /** Os filtros da lista e "Buscar" (D-045), a lupa ao lado dos filtros, logo acima da lista: abre a busca em todos os meses. */
  const listTools = (
    <>
      <View style={styles.filterRow}>
        <View style={[styles.filters, { flex: 1 }]} accessibilityRole="radiogroup" accessibilityLabel="Mostrar">
          {FILTERS.map((f) => ({ ...f, label: inBusiness && f.value !== 'todos' ? (f.value === 'receita' ? BUSINESS_WORDS.filterIn : BUSINESS_WORDS.filterOut) : f.label })).map((f) => (
            <Chip key={f.value} label={f.label} selected={filter === f.value} onPress={() => setFilter(f.value)} />
          ))}
        </View>
        <SearchEntry onPress={() => router.push('/movimentacoes/buscar')} />
      </View>

      {accountOptions.length > 0 ? (
        <View style={styles.filters} accessibilityRole="radiogroup" accessibilityLabel={ACCOUNTS_TEXT.filterLabel}>
          {accountOptions.map((o) => (
            <Chip key={o.id ?? 'todas'} label={o.label} selected={accountId === o.id} onPress={() => setAccountFilter(o.id)} />
          ))}
        </View>
      ) : null}
    </>
  );

  const header = (
    <>
      <AppHeader title="Movimentos" action={analysesTop}>
        <ContextSwitch />
        <MonthSwitcher />
      </AppHeader>
      <Body style={styles.bodyTop}>
        <FlashBanner message={notice} />
        {totals}
        {actions}
        {listTools}
      </Body>
    </>
  );

  /** Depois da lista: as análises do mês e "Organizar" (Contas a pagar, Calendário, Gastos fixos, Cartões, Orçamento, Importar e Calculadoras). */
  const footer = (
    <ListCell style={styles.footer}>
      {analyses}
      {organize}
    </ListCell>
  );

  /** O cartão da lista como sempre foi: carregando, erro, vazio ou todos os grupos (linhas com animação de saída e de lugar). */
  const card = (
    <Card>
      {records.isPending ? (
        <View style={{ gap: space[3] }} accessibilityRole="progressbar" accessibilityLabel="Carregando movimentos">
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
            (filter !== 'todos' || accountId !== null) && (records.data?.length ?? 0) > 0 ? (
              <Button
                label="Mostrar todos"
                tone="soft"
                onPress={() => {
                  setFilter('todos');
                  setAccountFilter(null);
                }}
              />
            ) : undefined
          }>
          {filter === 'todos' && accountId === null
            ? inBusiness
              ? BUSINESS_WORDS.emptyList
              : 'Recebimentos e gastos já realizados aparecem aqui, do mais recente para o mais antigo.'
            : accountId !== null
              ? 'Nenhum registro desta conta no mês.'
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
                <RecordRow
                  record={r}
                  last={i === g.items.length - 1}
                  accountName={accounts.data ? recordAccountName(accounts.data, r) : null}
                  onPress={() => router.push(`/registro/${r.id}`)}
                />
              </Animated.View>
            ))}
          </Animated.View>
        ))
      )}
    </Card>
  );

  /** Uma linha da lista: o cartão inteiro (lista curta) ou um pedaço dele (lista longa, só o que está perto da tela). */
  const renderCell = ({ item }: { item: Cell }) => {
    const spacing = item.first ? styles.cellFirst : undefined;
    if (item.type === 'card') return <ListCell style={spacing}>{card}</ListCell>;
    return (
      <ListCell style={spacing}>
        <CardSlice first={item.first} last={item.last}>
          {item.type === 'day' ? (
            <Txt variant="caption" color={colors.textSecondary} style={styles.day} accessibilityRole="header" aria-level={3}>
              {formatDayHeader(item.day, today)}
            </Txt>
          ) : (
            <RecordRow
              record={item.record}
              last={item.lastInDay}
              accountName={accounts.data ? recordAccountName(accounts.data, item.record) : null}
              onPress={() => router.push(`/registro/${item.record.id}`)}
            />
          )}
        </CardSlice>
      </ListCell>
    );
  };

  // Versão para computador (pedido do Enzo em 12/11/2026): duas colunas, com os botões de anotar, as análises e Organizar à esquerda e, à
  // direita, os totais, os filtros, Buscar e a lista do mês em tabela (todas as linhas: no computador não é preciso montar só as que estão
  // perto da tela).
  if (wide) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Screen wide>
          {/* O seletor de espaço e o mês numa linha só, abaixo do título (revisão visual de 23/11/2026: em três linhas, o bloco azul tinha
              208 px de altura e ficava vazio à direita). Com muitos espaços, o mês desce para a linha de baixo. */}
          <AppHeader title="Movimentos" wide action={analysesTop}>
            <View style={styles.wideControls}>
              <ContextSwitch />
              <View style={styles.wideMonth}>
                <MonthSwitcher />
              </View>
            </View>
          </AppHeader>
          <Body style={{ maxWidth: WIDE_CONTENT_MAX }}>
            <FlashBanner message={notice} />
            <View style={styles.wideRow}>
              <View style={styles.wideSide}>
                {actions}
                {analyses}
                {organize}
              </View>
              <View style={styles.wideMain}>
                {totals}
                {listTools}
                {/* Carregando, erro ou vazio: o mesmo cartão do celular. Com lançamentos, a tabela. */}
                {records.isPending || records.isError || list.length === 0 ? (
                  card
                ) : (
                  <Card>
                    <RecordsTable
                      records={list}
                      accountName={accounts.data && accountOptions.length > 0 ? (r) => recordAccountName(accounts.data!, r) : null}
                      onOpen={(r) => router.push(`/registro/${r.id}`)}
                    />
                  </Card>
                )}
              </View>
            </View>
          </Body>
        </Screen>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenList
        wide
        data={cells}
        keyExtractor={(c) => c.key}
        renderItem={renderCell}
        extraData={[accounts.data, today]}
        header={header}
        footer={footer}
      />
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
        <Icon size={20} color={colors.brandText} strokeWidth={2.25} aria-hidden />
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
  // O topo é um `Body` sem o respiro de baixo: o espaço até a lista é o `cellFirst` (o mesmo vão de 16 px entre cartões). Depois da
  // lista, o rodapé tem o mesmo vão e o respiro de baixo do `Body`.
  bodyTop: { paddingBottom: 0 },
  cellFirst: { marginTop: space[4] },
  footer: { marginTop: space[4], paddingBottom: space[6], gap: space[4] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  action: { flexGrow: 1, flexBasis: 220, alignSelf: 'auto' },
  totals: { flexDirection: 'row', gap: space[3], flexWrap: 'wrap' },
  totalPress: { flexGrow: 1, flexBasis: 140 },
  // Os dois cartões ficam com a mesma altura, e o valor, embaixo: com "Recebido em outubro" em duas linhas e "Pago em outubro" em uma, os
  // valores continuam na mesma altura (auditoria de 18/11/2026).
  total: { flexGrow: 1, padding: space[4], gap: space[1], justifyContent: 'space-between' },
  totalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] },
  totalValue: { fontFamily: fonts.extrabold, fontSize: 18, lineHeight: 26 },
  filters: { flexDirection: 'row', gap: space[2], flexWrap: 'wrap' },
  filterRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2] },
  day: { fontFamily: fonts.bold, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: space[2] },
  shortcuts: { gap: space[1], paddingVertical: space[4] },
  shortcut: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 10, minHeight: 56 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  shortcutIcon: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
  focusRing: { outlineWidth: 3, outlineColor: colors.brandText, outlineStyle: 'solid', outlineOffset: 2 } as object,
  wideRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space[6] },
  wideControls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space[6], rowGap: space[2] },
  // O mês traz 8 px de margem em cima (para ficar abaixo do seletor no celular); aqui, na mesma linha, a margem sai.
  wideMonth: { marginTop: -space[2] },
  // 312 px (antes 340): a tabela da direita ganha espaço para a categoria e a conta (auditoria de 18/11/2026).
  wideSide: { width: 312, gap: space[4] },
  wideMain: { flex: 1, minWidth: 0, gap: space[4] },
});
