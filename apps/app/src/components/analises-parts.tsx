import {
  ANALYSES_TABS,
  ANALYSES_TEXT,
  CATEGORY_VIEWS,
  EvolutionSelectionStore,
  analysesBudgetSummary,
  analysesEvolutionSummary,
  analysesTabForKey,
  analysesUpcomingSummary,
  bubbleForTap,
  buildEvolutionView,
  categoryAccessibleName,
  categoryBubbles,
  categoryKey,
  evolutionFetchRange,
  monthCheckPlan,
  monthOf,
  selectedCategoryCard,
  type AnalysesTab,
  type CategoryShare,
  type CategoryView,
  type IsoMonth,
  type SelectedCategoryCard,
} from '@clarevo/core';
import { Check, ChartPie, ChevronRight } from 'lucide-react-native';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { MoneyTxt } from '@/components/money-text';
import { MonthCheckBlock } from '@/components/month-check';
import { EmptyState, ErrorState } from '@/components/states';
import { Button, Card, LinkButton, Money, Skeleton, Txt, spaceKeyPress, styles as ui } from '@/components/ui';
import { useCategoryViewPref } from '@/lib/category-view';
import { useHiddenMonths } from '@/lib/evolution-memory';
import { maskMoneyLabel, useValuesHidden } from '@/lib/privacy';
import { useCategoryAnalysis, useCommittedUpcoming, useMonthBudget, useMonthCheckRow, useMonthsOverview, type CategoryAnalysis } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, radius, space, tabular } from '@/theme/tokens';

const T = ANALYSES_TEXT;

/** Esconde de leitores de tela o que só desenha (o botão de cada bolha já diz tudo). */
const decorative = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants', 'aria-hidden': true } as const;

// ---------------------------------------------------------------------------------------------------------------------
// Entrada em Movimentos
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Linha "Análises" em Movimentos (D-059), logo abaixo de "Evolução": parece um campo, mas é um botão que abre a tela de consulta
 * `/analises`. Nada é lido nem guardado aqui.
 */
export function AnalysesEntry({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={T.rowA11y}
      onPress={onPress}
      style={(s) => [ui.input, styles.entry, s.pressed && { opacity: 0.7 }, (s as { focused?: boolean }).focused && ui.focusRing]}>
      <ChartPie size={20} color={colors.textSecondary} aria-hidden />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 15 }}>
          {T.title}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {T.rowCaption}
        </Txt>
      </View>
      <ChevronRight size={20} color={colors.textSecondary} aria-hidden />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// As quatro abas
// ---------------------------------------------------------------------------------------------------------------------

/**
 * As quatro abas internas (Categorias, Evolução, Próximos meses e Orçamento), de 44 px de altura. A aba escolhida tem fundo azul e o
 * sinal de marcado (nunca só cor). Setas, Home e End escolhem a aba, como no padrão de abas. Em tela estreita as abas passam para a
 * segunda linha, sem rolagem de lado.
 */
export function AnalysesTabs({ tab, onChange }: { tab: AnalysesTab; onChange: (tab: AnalysesTab) => void }) {
  const refs = useRef<Partial<Record<AnalysesTab, View | null>>>({});
  const keys = (current: AnalysesTab): object =>
    Platform.OS === 'web'
      ? {
          onKeyDown: (e: { key?: string; preventDefault?: () => void }) => {
            if (e.key === ' ' || e.key === 'Spacebar') {
              e.preventDefault?.();
              onChange(current);
              return;
            }
            const next = analysesTabForKey(current, e.key ?? '');
            if (!next) return;
            e.preventDefault?.();
            onChange(next);
            refs.current[next]?.focus();
          },
        }
      : {};
  return (
    <View accessibilityRole="tablist" accessibilityLabel={T.tabsLabel} style={styles.tabs}>
      {ANALYSES_TABS.map((t) => {
        const selected = t === tab;
        return (
          <Pressable
            key={t}
            ref={(node) => {
              refs.current[t] = node;
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            aria-selected={selected}
            onPress={() => onChange(t)}
            {...keys(t)}
            style={(s) => [styles.tab, selected && styles.tabSelected, s.pressed && { opacity: 0.85 }, (s as { focused?: boolean }).focused && ui.focusRing]}>
            {selected ? <Check size={16} color={colors.textOnBrand} strokeWidth={2.5} style={{ flexShrink: 0 }} /> : null}
            <Txt variant="label" color={selected ? colors.textOnBrand : colors.text} style={{ fontFamily: fonts.bold, flexShrink: 1 }}>
              {T.tabs[t]}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Estados comuns
// ---------------------------------------------------------------------------------------------------------------------

export function TabLoading() {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={T.loading} style={{ gap: space[3] }}>
      <Skeleton width={160} height={16} />
      <Skeleton width="100%" height={180} />
    </View>
  );
}

export function TabError({ onRetry }: { onRetry: () => void }) {
  return (
    <Card>
      <ErrorState message={T.loadError} retryLabel={T.retry} onRetry={() => onRetry()} />
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------------------------------------------------

/** "Barras | Bolhas": grupo de rádios em forma de segmento, com alvos de 48 px e o sinal de marcado. */
function ViewSegment({ value, onChange }: { value: CategoryView; onChange: (view: CategoryView) => void }) {
  return (
    <View style={styles.track} accessibilityRole="radiogroup" accessibilityLabel={T.categories.viewGroup}>
      {CATEGORY_VIEWS.map((view) => {
        const selected = view === value;
        return (
          <Pressable
            key={view}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            aria-checked={selected}
            onPress={() => onChange(view)}
            {...spaceKeyPress(() => onChange(view))}
            style={(s) => [styles.option, selected && styles.optionSelected, (s as { focused?: boolean }).focused && ui.focusRing]}>
            {selected ? <Check size={16} color={colors.brand} strokeWidth={2.5} /> : null}
            <Txt variant="label" color={selected ? colors.brand : colors.text} style={{ fontFamily: fonts.bold, fontSize: 15, textAlign: 'center', flexShrink: 1 }}>
              {T.categories.views[view]}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Pago por categoria em barras: as mesmas barras de "Por categoria" (largura = percentual do pago), cada uma um botão. O nome acessível
 * é "Mercado, 23,4%, R$ 920,00". A barra escolhida ganha fundo claro, contorno mais grosso e o sinal de marcado.
 */
function CategoryBars({ shares, selectedKey, onSelect }: { shares: CategoryShare[]; selectedKey: string | null; onSelect: (key: string) => void }) {
  const hidden = useValuesHidden();
  // Lista e item na web (o leitor de tela diz quantas categorias há); no app, cada barra é um botão só.
  const listRole = Platform.OS === 'web' ? ({ role: 'list', 'aria-label': T.categories.barsLabel } as object) : {};
  const itemRole = Platform.OS === 'web' ? ({ role: 'listitem' } as object) : {};
  return (
    <View style={{ gap: space[2] }} {...listRole}>
      {shares.map((sh) => {
        const key = categoryKey(sh.category);
        const selected = key === selectedKey;
        return (
          <View key={key} {...itemRole}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={maskMoneyLabel(categoryAccessibleName(sh), hidden)}
              accessibilityState={{ selected }}
              aria-pressed={selected}
              onPress={() => onSelect(key)}
              style={(s) => [styles.bar, selected && styles.barSelected, s.pressed && { opacity: 0.85 }, (s as { focused?: boolean }).focused && ui.focusRing]}>
              <View style={styles.barHead} {...decorative}>
                <View style={styles.barName}>
                  {selected ? <Check size={16} color={colors.brand} strokeWidth={2.5} style={{ flexShrink: 0 }} /> : null}
                  <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 15, flexShrink: 1 }}>
                    {sh.label}
                  </Txt>
                </View>
                <MoneyTxt variant="label" style={[{ fontFamily: fonts.bold, fontSize: 15, flexShrink: 0 }, tabular]}>
                  {T.categories.barValue(sh.cents, sh.percentText)}
                </MoneyTxt>
              </View>
              <View style={styles.barTrack} {...decorative}>
                <View style={[styles.barFill, { width: `${sh.tenths / 10}%` }, sh.tenths === 0 && styles.barMin]} />
              </View>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Pago por categoria em bolhas (SVG): a área de cada bolha é proporcional ao valor (raio pela raiz), com um tamanho mínimo legível, e o
 * arranjo vem do core (`categoryBubbles`): nenhuma bolha toca outra, em qualquer largura. O nome e o percentual ficam escritos dentro
 * de cada bolha (nunca só cor), e cada bolha é um botão com o nome acessível "Mercado, 23,4%, R$ 920,00". O toque escolhe a bolha que
 * contém o ponto tocado (`bubbleForTap`), não a do quadrado do botão. A escolhida fica lima, com contorno escuro mais grosso. As bolhas
 * não mostram valor em reais; o nome acessível, sim (e segue "Ocultar valores").
 */
function CategoryBubbleChart({ shares, selectedKey, onSelect }: { shares: CategoryShare[]; selectedKey: string | null; onSelect: (key: string) => void }) {
  const hidden = useValuesHidden();
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const layout = useMemo(() => (width > 0 ? categoryBubbles(shares, width, fontScale) : null), [shares, width, fontScale]);
  return (
    <View onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))} style={{ alignSelf: 'stretch' }}>
      {layout ? (
        <View role="group" accessibilityLabel={T.categories.bubblesLabel} style={{ width: layout.width, height: layout.height }}>
          <Svg width={layout.width} height={layout.height} style={StyleSheet.absoluteFill} pointerEvents="none" accessible={false} {...decorative}>
            {layout.bubbles.map((b) => {
              const selected = b.key === selectedKey;
              return (
                <Circle
                  key={b.key}
                  cx={b.cx}
                  cy={b.cy}
                  r={b.r}
                  fill={selected ? colors.accent : colors.brand}
                  stroke={selected ? colors.text : colors.surface}
                  strokeWidth={selected ? 3 : 2}
                />
              );
            })}
          </Svg>
          {layout.bubbles.map((b) => {
            const selected = b.key === selectedKey;
            return (
              <Pressable
                key={b.key}
                accessibilityRole="button"
                accessibilityLabel={maskMoneyLabel(b.a11yLabel, hidden)}
                accessibilityState={{ selected }}
                aria-pressed={selected}
                onPress={(e) => {
                  // O botão é um quadrado: o canto dele pode cobrir a borda de uma bolha vizinha maior. O ponto tocado decide a bolha.
                  const hit = bubbleForTap(layout.bubbles, b, e?.nativeEvent?.locationX, e?.nativeEvent?.locationY);
                  if (hit) onSelect(hit.key);
                }}
                style={(s) => [
                  styles.bubble,
                  { left: b.cx - b.r, top: b.cy - b.r, width: 2 * b.r, height: 2 * b.r, borderRadius: b.r },
                  s.pressed && { opacity: 0.85 },
                  (s as { focused?: boolean }).focused && ui.focusRing,
                ]}>
                <View style={{ width: 2 * b.r, alignItems: 'center' }} pointerEvents="none" {...decorative}>
                  {b.lines.map((line, i) => (
                    <Txt
                      key={`${i}-${line}`}
                      allowFontScaling={false}
                      numberOfLines={1}
                      color={selected ? colors.text : colors.textOnBrand}
                      style={{ fontFamily: fonts.bold, fontSize: b.fontSize, lineHeight: b.lineHeight, textAlign: 'center' }}>
                      {line}
                    </Txt>
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Skeleton width="100%" height={200} />
      )}
      {layout?.anyAtMinimum ? (
        <Txt variant="caption" color={colors.textSecondary} style={{ marginTop: space[2] }}>
          {T.categories.minimumNote}
        </Txt>
      ) : null}
    </View>
  );
}

/**
 * O cartão "Categoria selecionada": valor, percentual e os lançamentos do mês na categoria, cada um com o link para o lançamento. O
 * pagamento de fatura aparece só com a parte da categoria. Valores seguem "Ocultar valores".
 */
function SelectedCategory({
  card,
  onOpenRecord,
  onSeeAll,
  onLayout,
}: {
  card: SelectedCategoryCard;
  onOpenRecord: (href: string) => void;
  onSeeAll: () => void;
  onLayout: (y: number | null) => void;
}) {
  const hidden = useValuesHidden();
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale > 1.3;
  // Ao sair da tela (outro mês, outra aba), a posição guardada deixa de valer: a próxima só vale depois do primeiro layout do cartão novo.
  useEffect(() => () => onLayout(null), [onLayout]);
  return (
    <View onLayout={(e) => onLayout(e.nativeEvent.layout.y)}>
      <Card style={{ gap: space[3] }}>
        <Txt variant="caption" color={colors.textSecondary} style={{ fontFamily: fonts.bold }} accessibilityRole="header" aria-level={2}>
          {card.title}
        </Txt>
        <View style={styles.selectedHead} accessible accessibilityLabel={maskMoneyLabel(T.categories.selected.a11y(card.name, card.percentText, card.cents), hidden)}>
          <Txt variant="title" style={{ flexShrink: 1 }}>
            {card.name}
          </Txt>
          <View style={{ alignItems: stacked ? 'flex-start' : 'flex-end' }}>
            <MoneyTxt variant="title" style={tabular}>
              {card.valueText}
            </MoneyTxt>
            <Txt variant="caption" color={colors.textSecondary}>
              {card.shareText}
            </Txt>
          </View>
        </View>
        <View style={{ gap: 2 }}>
          <Txt variant="label" style={{ fontFamily: fonts.bold }} accessibilityRole="header" aria-level={3}>
            {T.categories.selected.recordsTitle}
          </Txt>
          <Txt variant="caption" color={colors.textSecondary}>
            {card.rows.length > 0 ? `${card.countText}. ${T.categories.selected.order}` : T.categories.selected.none}
          </Txt>
        </View>
        {card.rows.length > 0 ? (
          <View>
            {card.rows.map((row, i) => (
              <Pressable
                key={row.recordId}
                accessibilityRole="button"
                accessibilityLabel={maskMoneyLabel(row.a11y, hidden)}
                accessibilityHint={T.categories.selected.rowHint}
                onPress={() => onOpenRecord(row.href)}
                style={(s) => [styles.row, i < card.rows.length - 1 && styles.rowDivider, s.pressed && { opacity: 0.7 }, (s as { focused?: boolean }).focused && ui.focusRing]}>
                <View style={{ flex: 1, minWidth: 0 }} {...decorative}>
                  <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 15 }} numberOfLines={2}>
                    {row.description}
                  </Txt>
                  <Txt variant="caption" color={colors.textSecondary}>
                    {row.partialText ? `${row.dateText} · ${row.partialText}` : row.dateText}
                  </Txt>
                  {stacked ? (
                    <MoneyTxt variant="label" style={[tabular, { fontFamily: fonts.bold, fontSize: 15 }]}>
                      {row.valueText}
                    </MoneyTxt>
                  ) : null}
                </View>
                {stacked ? null : (
                  <View {...decorative}>
                    <MoneyTxt variant="label" style={[tabular, { fontFamily: fonts.bold, fontSize: 15, flexShrink: 0 }]}>
                      {row.valueText}
                    </MoneyTxt>
                  </View>
                )}
                <ChevronRight size={18} color={colors.textSecondary} aria-hidden />
              </Pressable>
            ))}
          </View>
        ) : null}
        {card.moreText ? (
          <Txt variant="caption" color={colors.textSecondary}>
            {card.moreText}
          </Txt>
        ) : null}
        {card.hiddenCount > 0 ? <LinkButton label={T.categories.selected.seeAll} trailing={ChevronRight} style={styles.link} onPress={onSeeAll} /> : null}
        {/* Região viva escondida só da vista (1×1 px cortado): a escolha é dita uma vez ao leitor de tela. */}
        <View style={styles.liveClip} accessibilityElementsHidden={Platform.OS === 'ios'}>
          <Txt style={styles.liveText} accessibilityLiveRegion="polite" aria-live="polite">
            {maskMoneyLabel(card.announce, hidden)}
          </Txt>
        </View>
      </Card>
    </View>
  );
}

/**
 * A aba Categorias, completa: o Pago do mês em barras ou em bolhas (Barras de início; a escolha fica só no aparelho), a legenda, e o
 * cartão da categoria que a pessoa tocou. Os números são os de "Por categoria". Carregando, erro com "Tentar de novo", mês sem gastos e
 * valores ocultos têm o seu estado.
 */
export function CategoriesTab({
  contextId,
  month,
  canWrite,
  selectedKey,
  onSelect,
  onOpenRecord,
  onSeeAll,
  onAddExpense,
  onCardLayout,
}: {
  contextId: string | undefined;
  month: IsoMonth;
  canWrite: boolean;
  selectedKey: string | null;
  onSelect: (key: string, announce: string | null) => void;
  onOpenRecord: (href: string) => void;
  onSeeAll: () => void;
  onAddExpense: () => void;
  onCardLayout: (y: number | null) => void;
}) {
  const analysis = useCategoryAnalysis(contextId, month);
  const pref = useCategoryViewPref();
  if (analysis.isError) return <TabError onRetry={() => analysis.refetch()} />;
  if (analysis.isPending || !pref.ready || !analysis.data) return <TabLoading />;
  return (
    <CategoriesBody
      data={analysis.data}
      contextId={contextId}
      month={month}
      canWrite={canWrite}
      view={pref.view}
      onView={pref.setView}
      selectedKey={selectedKey}
      onSelect={onSelect}
      onOpenRecord={onOpenRecord}
      onSeeAll={onSeeAll}
      onAddExpense={onAddExpense}
      onCardLayout={onCardLayout}
    />
  );
}

function CategoriesBody({
  data,
  contextId,
  month,
  canWrite,
  view,
  onView,
  selectedKey,
  onSelect,
  onOpenRecord,
  onSeeAll,
  onAddExpense,
  onCardLayout,
}: {
  data: CategoryAnalysis;
  contextId: string | undefined;
  month: IsoMonth;
  canWrite: boolean;
  view: CategoryView;
  onView: (view: CategoryView) => void;
  selectedKey: string | null;
  onSelect: (key: string, announce: string | null) => void;
  onOpenRecord: (href: string) => void;
  onSeeAll: () => void;
  onAddExpense: () => void;
  onCardLayout: (y: number | null) => void;
}) {
  const card = useMemo(() => (selectedKey ? selectedCategoryCard(data.shares, data.parts, selectedKey) : null), [data, selectedKey]);
  // "Conferi este mês" (D-060): num mês terminado sem gastos, a pessoa confere que não houve; a frase de mês sem anotação vira "Você conferiu: ...".
  const { today } = useSession();
  const currentMonth = monthOf(today);
  const checks = useMonthCheckRow(data.shares.length === 0 && month < currentMonth ? contextId : undefined, month);
  const plan = checks.row ? monthCheckPlan(checks.row, 'pagamentos', currentMonth, canWrite) : null;
  // Barras e Bolhas têm alturas diferentes: a posição guardada do cartão deixa de valer até o layout novo dele (antes de qualquer layout).
  useLayoutEffect(() => {
    onCardLayout(null);
  }, [view, onCardLayout]);
  if (data.shares.length === 0) {
    return (
      <Card>
        <EmptyState
          title={T.categories.empty(month)}
          action={
            <View style={{ gap: space[3], alignSelf: 'stretch' }}>
              <MonthCheckBlock contextId={contextId} plan={plan} />
              {canWrite && plan?.state !== 'conferido' ? <Button label={T.categories.emptyAction} onPress={onAddExpense} /> : null}
            </View>
          }>
          {plan?.state === 'conferido' ? undefined : T.categories.emptyBody}
        </EmptyState>
      </Card>
    );
  }
  const pick = (key: string) => {
    const next = selectedCategoryCard(data.shares, data.parts, key);
    onSelect(key, next ? next.announce : null);
  };
  return (
    <>
      <Card style={{ gap: space[3] }}>
        <View style={styles.cardHead}>
          <Txt variant="title" accessibilityRole="header" aria-level={2} style={{ flexShrink: 1 }}>
            {T.categories.title(month)}
          </Txt>
          <Money cents={data.paidCents} variant="title" />
        </View>
        <ViewSegment value={view} onChange={onView} />
        <Txt variant="caption" color={colors.textSecondary}>
          {T.categories.hint}
        </Txt>
        {view === 'bolhas' ? (
          <CategoryBubbleChart shares={data.shares} selectedKey={selectedKey} onSelect={pick} />
        ) : (
          <CategoryBars shares={data.shares} selectedKey={selectedKey} onSelect={pick} />
        )}
        <Txt variant="caption" color={colors.textSecondary}>
          {T.categories.legend}
        </Txt>
        {data.hasInvoicePayment ? (
          <Txt variant="caption" color={colors.textSecondary}>
            {T.categories.invoiceNote}
          </Txt>
        ) : null}
      </Card>
      {card ? <SelectedCategory card={card} onOpenRecord={onOpenRecord} onSeeAll={onSeeAll} onLayout={onCardLayout} /> : null}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Evolução, Próximos meses e Orçamento: o resumo e o botão para a tela completa
// ---------------------------------------------------------------------------------------------------------------------

function SummaryCard({ title, children, actionLabel, actionHint, onAction }: { title: string; children: ReactNode; actionLabel: string; actionHint: string; onAction: () => void }) {
  return (
    <Card style={{ gap: space[3] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {title}
      </Txt>
      {children}
      <Button label={actionLabel} tone="soft" accessibilityHint={actionHint} onPress={onAction} />
    </Card>
  );
}

/** Evolução: o Pago do mês, o estado e a variação com o mês anterior na comparação (as mesmas contas da tela Evolução). */
export function EvolutionTab({ contextId, month, currentMonth, onOpen }: { contextId: string | undefined; month: IsoMonth; currentMonth: IsoMonth; onOpen: () => void }) {
  const { user } = useSession();
  const { from, to } = evolutionFetchRange(currentMonth);
  const overview = useMonthsOverview(contextId, from, to);
  const scope = EvolutionSelectionStore.scope(user?.id, contextId);
  const hiddenMonths = useHiddenMonths(scope, 'pago');
  const result = useMemo(() => {
    if (!overview.data) return null;
    try {
      const view = buildEvolutionView({ overview: overview.data, metric: 'pago', windowMonths: 12, currentMonth, hiddenMonths });
      return { summary: analysesEvolutionSummary(view, month), from: view.from };
    } catch {
      // Linha que o banco nunca devolveria: erro, nunca um resumo com dado parcial.
      return 'erro' as const;
    }
  }, [overview.data, currentMonth, hiddenMonths, month]);
  if (overview.isError || result === 'erro') return <TabError onRetry={() => overview.refetch()} />;
  if (overview.isPending || !result) return <TabLoading />;
  const s = result.summary;
  return (
    <SummaryCard title={T.evolution.title(month)} actionLabel={T.evolution.action} actionHint={T.evolution.actionHint} onAction={onOpen}>
      {s ? (
        <View style={{ gap: space[1] }}>
          {s.valueText !== null ? <Money cents={s.cents} /> : null}
          <Txt color={colors.textSecondary}>{s.stateText}</Txt>
          <MoneyTxt style={{ fontFamily: fonts.bold }}>{s.variationText}</MoneyTxt>
          {s.percentText ? (
            <Txt variant="caption" color={colors.textSecondary}>
              {s.percentText}
            </Txt>
          ) : null}
          <Txt variant="caption" color={colors.textSecondary}>
            {s.basis}
          </Txt>
        </View>
      ) : (
        <Txt color={colors.textSecondary}>{T.evolution.outside(result.from)}</Txt>
      )}
    </SummaryCard>
  );
}

/** Próximos meses: os primeiros meses previstos depois do escolhido. O botão abre Renda comprometida na seção Próximos meses. */
export function UpcomingTab({ contextId, month, onOpen }: { contextId: string | undefined; month: IsoMonth; onOpen: () => void }) {
  const upcoming = useCommittedUpcoming(contextId, month);
  if (upcoming.isError) return <TabError onRetry={() => upcoming.refetch()} />;
  if (upcoming.isPending || !upcoming.data) return <TabLoading />;
  const s = analysesUpcomingSummary(upcoming.data, month);
  return (
    <SummaryCard title={s.title} actionLabel={T.upcoming.action} actionHint={T.upcoming.actionHint} onAction={onOpen}>
      {s.emptyText ? (
        <Txt>{s.emptyText}</Txt>
      ) : (
        <View style={{ gap: space[2] }}>
          {s.rows.map((r) => (
            <MoneyTxt key={r.month} variant="label" style={[tabular, { fontFamily: fonts.bold }]} accessibilityLabel={r.a11y}>
              {r.text}
            </MoneyTxt>
          ))}
        </View>
      )}
      <Txt variant="caption" color={colors.textSecondary}>
        {s.legend}
      </Txt>
    </SummaryCard>
  );
}

/** Orçamento: o total orçado e usado do mês e a categoria com o maior percentual. O botão abre o Orçamento no mesmo mês. */
export function BudgetTab({ contextId, month, onOpen }: { contextId: string | undefined; month: IsoMonth; onOpen: () => void }) {
  const budget = useMonthBudget(contextId, month);
  if (budget.isError) return <TabError onRetry={() => budget.refetch()} />;
  if (budget.isPending || !budget.summary) return <TabLoading />;
  const s = analysesBudgetSummary(budget.summary);
  return (
    <SummaryCard title={s.title} actionLabel={T.budget.action} actionHint={T.budget.actionHint} onAction={onOpen}>
      {s.emptyText ? (
        <Txt>{s.emptyText}</Txt>
      ) : (
        <View style={{ gap: space[1] }}>
          {s.totalLine ? <MoneyTxt style={[tabular, { fontFamily: fonts.bold }]}>{s.totalLine}</MoneyTxt> : null}
          {s.countText ? <Txt color={colors.textSecondary}>{s.countText}</Txt> : null}
          {s.nearestLine ? <MoneyTxt style={tabular}>{s.nearestLine}</MoneyTxt> : null}
          {s.note ? (
            <Txt variant="caption" color={colors.textSecondary}>
              {s.note}
            </Txt>
          ) : null}
        </View>
      )}
    </SummaryCard>
  );
}

const styles = StyleSheet.create({
  entry: { gap: space[3], paddingVertical: space[2] },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  tab: {
    flexGrow: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[1],
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  tabSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[2], flexWrap: 'wrap' },
  track: { flexDirection: 'row', backgroundColor: '#E6EBF5', borderRadius: radius.md, padding: 4, gap: 4 },
  option: { flex: 1, minHeight: 48, borderRadius: radius.sm, flexDirection: 'row', gap: space[1], alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[2] },
  optionSelected: { backgroundColor: colors.surface },
  bar: { minHeight: 56, gap: space[2], justifyContent: 'center', paddingVertical: space[2], paddingHorizontal: space[3], borderRadius: radius.sm, borderWidth: 1.5, borderColor: 'transparent' },
  barSelected: { backgroundColor: colors.brandTint, borderColor: colors.brand, borderWidth: 2 },
  barHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space[3], flexWrap: 'wrap' },
  barName: { flexDirection: 'row', alignItems: 'center', gap: space[1], flexShrink: 1 },
  barTrack: { height: 12, borderRadius: radius.pill, backgroundColor: colors.brandTint, overflow: 'hidden' },
  barFill: { height: 12, borderRadius: radius.pill, backgroundColor: colors.brand },
  // Categoria com valor, mas abaixo de 0,1%: um traço visível.
  barMin: { width: 4 },
  bubble: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  selectedHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space[3], flexWrap: 'wrap' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3], minHeight: 56 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  link: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  liveClip: { position: 'absolute', width: 1, height: 1, overflow: 'hidden' },
  liveText: { width: 240 },
});
