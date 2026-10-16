import {
  EVOLUTION_TEXT,
  evolutionTopCategories,
  type EvolutionPanel,
  type EvolutionPointView,
  type EvolutionView,
  type IsoMonth,
} from '@clarevo/core';
import { Ban, ChartLine, ChevronDown, ChevronRight, ChevronUp, Hourglass, Minus, RotateCcw, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useState } from 'react';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { MoneyTxt } from '@/components/money-text';
import { SettingSwitch } from '@/components/setting-switch';
import { ErrorState } from '@/components/states';
import { Button, Card, FitMoney, LinkButton, Money, Skeleton, Txt, styles as ui } from '@/components/ui';
import { maskMoneyLabel, useValuesHidden } from '@/lib/privacy';
import { useCategoryBreakdown } from '@/state/data';
import { colors, fonts, space, tabular } from '@/theme/tokens';

const T = EVOLUTION_TEXT;

/** Esconde de leitores de tela o que só desenha (o botão de cada mês, a tabela e os textos já dizem tudo). */
const decorative = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants', 'aria-hidden': true } as const;

// ---------------------------------------------------------------------------------------------------------------------
// Entrada em Movimentos
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Linha "Evolução" em Movimentos (D-057), logo abaixo de "Seu mês em 30 segundos": parece um campo, mas é um botão que abre a tela de
 * consulta `/evolucao`. Nada é lido nem guardado aqui.
 */
export function EvolutionEntry({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={T.rowA11y}
      onPress={onPress}
      style={(s) => [ui.input, styles.entry, s.pressed && { opacity: 0.7 }, (s as { focused?: boolean }).focused && ui.focusRing]}>
      <ChartLine size={20} color={colors.textSecondary} aria-hidden />
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
// Gráfico de linha
// ---------------------------------------------------------------------------------------------------------------------

/** Altura do desenho (sem o eixo), a folga em cima e a linha de base. */
const PLOT_HEIGHT = 176;
const PAD_TOP = 18;
const BASE_Y = PLOT_HEIGHT - 14;
/** Raio dos pontos: grandes, para ver e para tocar (o alvo de toque é a coluna inteira do mês, com 176 px de altura ou mais). */
const R_POINT = 7;
const R_SELECTED = 10;

/** O ícone que o eixo mostra sob o mês quando ele não entra na comparação (e a legenda repete). */
const AXIS_ICON: Record<EvolutionPointView['participation'], LucideIcon | null> = {
  na_comparacao: null,
  fora_escolha: Ban,
  fora_andamento: Hourglass,
  fora_sem_registros: Minus,
};

/**
 * Gráfico de linha de Recebido ou Pago por mês (D-057, EF §7). Um botão por mês (a coluna inteira, de 44 px ou mais de altura), com o
 * nome "Abril de 2026, R$ 7.800,00, fora da comparação". Azul para o ponto que entra na comparação, ponto vazio para o que está fora,
 * um traço na linha de base para o mês sem registros (nunca um ponto em zero) e lima com contorno marinho para o mês escolhido. A
 * linha é interrompida nos dois lados de todo mês fora da comparação: nunca atravessa o intervalo. A escala parte do zero e não muda
 * com a seleção, então o ponto de um mês volta ao mesmo lugar. Nada depende só de cor: o ponto vazio, o ícone sob o mês e a
 * legenda dizem o mesmo que as cores. Com valores ocultos, o gráfico some com os números e o leitor de tela diz "valor oculto".
 */
export function EvolutionChart({ view, selected, onSelect }: { view: EvolutionView; selected: IsoMonth; onSelect: (month: IsoMonth) => void }) {
  const hiddenValues = useValuesHidden();
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const points = view.points;
  const n = points.length;
  const step = width / n;
  // Colunas estreitas (12 meses, letra grande): só a inicial do mês, que o botão e a tabela dizem por extenso.
  const letters = width > 0 && step < 24 * fontScale;
  const usable = BASE_Y - PAD_TOP;
  const xOf = (i: number) => (i + 0.5) * step;
  const yOf = (cents: number) => BASE_Y - (view.maxCents > 0 ? cents / view.maxCents : 0) * usable;

  // Trechos de linha: só entre meses vizinhos que entram na comparação.
  const runs: string[] = [];
  let run: string[] = [];
  points.forEach((p, i) => {
    if (p.included) {
      run.push(`${run.length === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)} ${yOf(p.cents).toFixed(1)}`);
    } else {
      if (run.length > 1) runs.push(run.join(' '));
      run = [];
    }
  });
  if (run.length > 1) runs.push(run.join(' '));

  return (
    <View style={{ gap: space[2] }}>
      <View style={styles.chartHead}>
        <Txt variant="title" accessibilityRole="header" aria-level={2}>
          {T.chart.title(view.metric)}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {T.chart.span(view.from, view.to)}
        </Txt>
        {hiddenValues || view.maxCents <= 0 ? null : (
          <Txt variant="caption" color={colors.textSecondary} style={tabular}>
            {T.chart.maxValue(view.maxCents)}
          </Txt>
        )}
      </View>
      <View role="group" accessibilityLabel={T.chart.group} onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))} style={styles.chart}>
        <View style={styles.columns}>
          {points.map((p) => (
            <MonthColumn key={p.month} point={p} selected={p.month === selected} letters={letters} hiddenValues={hiddenValues} onPress={() => onSelect(p.month)} />
          ))}
        </View>
        {width > 0 ? (
          <Svg width={width} height={PLOT_HEIGHT} style={styles.plot} pointerEvents="none" accessible={false} {...decorative}>
            <Line x1={0} y1={BASE_Y + 0.5} x2={width} y2={BASE_Y + 0.5} stroke={colors.borderStrong} strokeWidth={1} />
            <Line x1={0} y1={PAD_TOP + 0.5} x2={width} y2={PAD_TOP + 0.5} stroke={colors.border} strokeWidth={1} />
            {runs.map((d) => (
              <Path key={d} d={d} stroke={colors.brand} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            ))}
            {points.map((p, i) => (p.month === selected ? null : <Marker key={p.month} point={p} x={xOf(i)} y={p.state === 'sem_registros' ? BASE_Y : yOf(p.cents)} />))}
            {points.map((p, i) => (p.month === selected ? <Marker key={p.month} point={p} x={xOf(i)} y={p.state === 'sem_registros' ? BASE_Y : yOf(p.cents)} selected /> : null))}
          </Svg>
        ) : null}
      </View>
      <Legend view={view} />
    </View>
  );
}

/** O ponto de um mês: azul cheio (na comparação), vazio (fora), traço na base (sem registros) e lima com contorno (escolhido). */
function Marker({ point, x, y, selected }: { point: EvolutionPointView; x: number; y: number; selected?: boolean }) {
  const none = point.state === 'sem_registros';
  if (selected) {
    return (
      <>
        <Circle cx={x} cy={y} r={R_SELECTED} fill={colors.accent} stroke={colors.text} strokeWidth={2.5} />
        {none ? <Line x1={x - 4} y1={y} x2={x + 4} y2={y} stroke={colors.text} strokeWidth={2.5} strokeLinecap="round" /> : null}
        {!none && !point.included ? <Circle cx={x} cy={y} r={3.5} fill={colors.surface} stroke={colors.text} strokeWidth={2} /> : null}
      </>
    );
  }
  if (none) return <Line x1={x - 6} y1={y} x2={x + 6} y2={y} stroke={colors.textSecondary} strokeWidth={3} strokeLinecap="round" />;
  if (point.included) return <Circle cx={x} cy={y} r={R_POINT} fill={colors.brand} stroke={colors.surface} strokeWidth={2} />;
  return <Circle cx={x} cy={y} r={R_POINT} fill={colors.surface} stroke={colors.brand} strokeWidth={3} />;
}

/** A coluna de um mês: o botão (nome completo para o leitor de tela) com o espaço do gráfico e o rótulo do eixo. */
function MonthColumn({
  point,
  selected,
  letters,
  hiddenValues,
  onPress,
}: {
  point: EvolutionPointView;
  selected: boolean;
  letters: boolean;
  hiddenValues: boolean;
  onPress: () => void;
}) {
  const Icon = AXIS_ICON[point.participation];
  const label = letters ? point.shortLabel.charAt(0).toUpperCase() : point.shortLabel;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={maskMoneyLabel(point.name, hiddenValues)}
      accessibilityState={{ selected }}
      aria-pressed={selected}
      onPress={onPress}
      style={(s) => [styles.column, selected && styles.columnSelected, s.pressed && { opacity: 0.7 }, (s as { focused?: boolean }).focused && ui.focusRing]}>
      <View style={{ height: PLOT_HEIGHT }} />
      <View style={styles.axis} {...decorative}>
        <Txt variant="caption" style={[styles.axisLabel, selected && styles.axisLabelSelected, { fontFamily: selected ? fonts.bold : fonts.medium }]} numberOfLines={1}>
          {label}
        </Txt>
        <View style={styles.axisIcon}>{Icon ? <Icon size={14} color={colors.text} strokeWidth={2.25} /> : null}</View>
      </View>
    </Pressable>
  );
}

/** Legenda em texto, só do que aparece no gráfico: o mesmo desenho do ponto e do ícone do eixo, com o nome. */
function Legend({ view }: { view: EvolutionView }) {
  const has = (participation: EvolutionPointView['participation']) => view.points.some((p) => p.participation === participation);
  const items: { key: string; label: string; swatch: ReturnType<typeof Swatch> }[] = [];
  if (has('na_comparacao')) items.push({ key: 'in', label: T.legend.included, swatch: <Swatch kind="included" /> });
  if (has('fora_escolha')) items.push({ key: 'out', label: T.legend.excluded, swatch: <Swatch kind="excluded" icon={Ban} /> });
  if (has('fora_andamento')) items.push({ key: 'andamento', label: T.legend.inProgress, swatch: <Swatch kind="excluded" icon={Hourglass} /> });
  if (has('fora_sem_registros')) items.push({ key: 'sem', label: T.legend.noRecords, swatch: <Swatch kind="none" icon={Minus} /> });
  items.push({ key: 'sel', label: T.legend.selected, swatch: <Swatch kind="selected" /> });
  return (
    <View style={styles.legend}>
      {items.map((item) => (
        <View key={item.key} style={styles.legendItem}>
          {item.swatch}
          <Txt variant="caption" color={colors.textSecondary} style={{ flexShrink: 1 }}>
            {item.label}
          </Txt>
        </View>
      ))}
    </View>
  );
}

function Swatch({ kind, icon: Icon }: { kind: 'included' | 'excluded' | 'none' | 'selected'; icon?: LucideIcon }) {
  return (
    <View style={styles.swatch} {...decorative}>
      <Svg width={18} height={18} accessible={false}>
        {kind === 'included' ? <Circle cx={9} cy={9} r={6} fill={colors.brand} /> : null}
        {kind === 'excluded' ? <Circle cx={9} cy={9} r={5.5} fill={colors.surface} stroke={colors.brand} strokeWidth={2.5} /> : null}
        {kind === 'none' ? <Line x1={3} y1={9} x2={15} y2={9} stroke={colors.textSecondary} strokeWidth={3} strokeLinecap="round" /> : null}
        {kind === 'selected' ? <Circle cx={9} cy={9} r={7} fill={colors.accent} stroke={colors.text} strokeWidth={2} /> : null}
      </Svg>
      {Icon ? <Icon size={14} color={colors.text} strokeWidth={2.25} /> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Painel do mês escolhido
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Painel do mês escolhido, na mesma tela (tela B): mês e ano, valor exato com centavos, estado, a variação com as duas datas, as 3
 * maiores categorias de Pago, o interruptor "Mostrar este mês na comparação" e "Ver lançamentos". Tirar da comparação só muda a
 * média, a mediana e o desenho: nenhum lançamento é lido para isso, nem gravado.
 */
export function MonthPanelCard({
  panel,
  contextId,
  onToggle,
  onSeeRecords,
  onSeeCategories,
}: {
  panel: EvolutionPanel;
  contextId: string | undefined;
  onToggle: (included: boolean) => void;
  onSeeRecords: () => void;
  onSeeCategories: () => void;
}) {
  const v = panel.variation;
  return (
    <Card style={{ gap: space[3] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {panel.title}
      </Txt>
      <View style={{ gap: space[1] }}>
        <Txt variant="caption" color={colors.textSecondary} style={{ fontFamily: fonts.bold }}>
          {panel.valueCaption}
        </Txt>
        {panel.valueText !== null ? (
          <FitMoney cents={panel.cents} maxSize={32} minSize={22} />
        ) : (
          <Txt variant="amount" accessibilityRole="header" aria-level={3}>
            {T.panel.noValue}
          </Txt>
        )}
        <Txt color={colors.textSecondary}>{panel.stateText}</Txt>
      </View>

      <View style={styles.block}>
        <Txt variant="label" style={{ fontFamily: fonts.bold }} accessibilityRole="header" aria-level={3}>
          {T.variation.title}
        </Txt>
        <MoneyTxt color={v.available ? colors.text : colors.textSecondary} style={v.available ? { fontFamily: fonts.bold } : undefined}>
          {v.text}
        </MoneyTxt>
        {v.available && v.percentText ? (
          <Txt variant="caption" color={colors.textSecondary}>
            {v.percentText}
          </Txt>
        ) : null}
        {v.available && v.skippedText ? (
          <Txt variant="caption" color={colors.textSecondary}>
            {v.skippedText}
          </Txt>
        ) : null}
      </View>

      {panel.showsCategories ? <Categories contextId={contextId} month={panel.month} onSeeCategories={onSeeCategories} /> : null}

      <View style={styles.block}>
        {panel.canToggle ? (
          <SettingSwitch label={T.panel.switchLabel} caption={T.panel.switchCaption} value={panel.included} onChange={onToggle} />
        ) : (
          <Txt color={colors.textSecondary}>{panel.notEligibleText ?? ''}</Txt>
        )}
      </View>

      {panel.showsRecords ? (
        <LinkButton
          label={T.panel.seeRecords}
          accessibilityHint={T.panel.seeRecordsHint(panel.month)}
          trailing={ChevronRight}
          style={styles.link}
          onPress={onSeeRecords}
        />
      ) : null}
    </Card>
  );
}

/** As 3 maiores categorias de Pago do mês, com a fatura já dividida (categoryBreakdown), e o link para Por categoria. */
function Categories({ contextId, month, onSeeCategories }: { contextId: string | undefined; month: IsoMonth; onSeeCategories: () => void }) {
  const categories = useCategoryBreakdown(contextId, month);
  const hidden = useValuesHidden();
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale > 1.3;
  return (
    <View style={styles.block}>
      <Txt variant="label" style={{ fontFamily: fonts.bold }} accessibilityRole="header" aria-level={3}>
        {T.panel.categoriesTitle}
      </Txt>
      {categories.isPending ? (
        <View accessibilityRole="progressbar" accessibilityLabel={T.loading} style={{ gap: space[2] }}>
          <Skeleton width="100%" height={20} />
          <Skeleton width="80%" height={20} />
        </View>
      ) : categories.isError || !categories.data ? (
        <ErrorState message={T.panel.categoriesLoadError} retryLabel={T.retry} onRetry={() => categories.refetch()} />
      ) : (
        <>
          {evolutionTopCategories(categories.data).map((c, i, top) => (
            <View key={c.label} style={[styles.category, i < top.length - 1 && styles.divider]} accessible accessibilityLabel={maskMoneyLabel(c.a11yLabel, hidden)}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 15 }}>
                  {c.label}
                </Txt>
                <Txt variant="caption" color={colors.textSecondary}>
                  {T.panel.categoryShare(c.percentText)}
                </Txt>
                {stacked ? <Money cents={c.cents} variant="label" style={styles.categoryValue} /> : null}
              </View>
              {stacked ? null : <Money cents={c.cents} variant="label" style={[styles.categoryValue, { flexShrink: 0 }]} />}
            </View>
          ))}
          <Txt variant="caption" color={colors.textSecondary}>
            {T.panel.categoriesNote}
          </Txt>
          <LinkButton label={T.panel.categoriesAction} trailing={ChevronRight} style={styles.link} onPress={onSeeCategories} />
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Comparação: média, mediana, total e o aviso de comparação personalizada
// ---------------------------------------------------------------------------------------------------------------------

/** O aviso fixo de comparação personalizada (tela C): quantos meses estão fora, quais e "Restaurar todos". */
export function CustomComparisonNotice({ view, onRestore }: { view: EvolutionView; onRestore: () => void }) {
  return (
    <View style={styles.notice}>
      <Txt style={{ fontFamily: fonts.bold }} accessibilityRole="header" aria-level={2}>
        {T.custom.banner(view.outCount, view.eligibleCount)}
      </Txt>
      <Txt variant="caption" color={colors.textSecondary}>
        {`${T.custom.list(view.stats.hiddenMonths)} ${T.custom.scope(view.metric)}`}
      </Txt>
      <Button label={T.custom.restore} icon={RotateCcw} onPress={onRestore} />
    </View>
  );
}

/**
 * Média e mediana lado a lado, cada uma com "n de N meses", e o total dos meses exibidos, que nunca muda com a seleção. Com todos os
 * meses fora, a média e a mediana não aparecem (nunca R$ 0,00) e a tela pede ao menos um mês; só com o mês em andamento, diz que
 * ainda não há mês fechado. O total soma todos os meses do gráfico.
 */
export function StatsSection({ view, onRestore }: { view: EvolutionView; onRestore: () => void }) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = fontScale > 1.3 || width < 300;
  const s = view.stats;
  return (
    <View style={{ gap: space[3] }}>
      {view.situation === 'todos_fora' ? (
        <Card style={{ gap: space[2] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {T.states.allOutTitle}
          </Txt>
          <Txt color={colors.textSecondary}>{T.states.allOutBody}</Txt>
          <Button label={T.custom.restore} icon={RotateCcw} tone="soft" onPress={onRestore} />
        </Card>
      ) : view.situation === 'sem_mes_fechado' ? (
        <Card style={{ gap: space[2] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {T.states.noClosedTitle}
          </Txt>
          <Txt color={colors.textSecondary}>{T.states.noClosedBody}</Txt>
        </Card>
      ) : s.average !== null && s.median !== null ? (
        <>
          <View style={styles.statsRow}>
            <StatCard title={T.stats.average} cents={s.average} caption={T.stats.ofMonths(s.visibleCount, view.eligibleCount)} stacked={stacked} />
            <StatCard title={T.stats.median} cents={s.median} caption={T.stats.ofMonths(s.visibleCount, view.eligibleCount)} stacked={stacked} />
          </View>
          {view.situation === 'um_mes' ? (
            <Txt variant="caption" color={colors.textSecondary}>
              {T.stats.onlyOne}
            </Txt>
          ) : null}
        </>
      ) : null}
      <Card style={{ gap: space[1], padding: space[4] }}>
        <Txt variant="caption" color={colors.textSecondary} style={{ fontFamily: fonts.bold }}>
          {T.stats.total}
        </Txt>
        <Money cents={view.totalCents} variant="label" style={styles.statValue} />
        <Txt variant="caption" color={colors.textSecondary}>
          {T.stats.totalNote}
        </Txt>
      </Card>
    </View>
  );
}

function StatCard({ title, cents, caption, stacked }: { title: string; cents: number; caption: string; stacked: boolean }) {
  return (
    <Card style={[styles.stat, stacked && { flexBasis: '100%' }]}>
      <Txt variant="caption" color={colors.textSecondary} style={{ fontFamily: fonts.bold }}>
        {title}
      </Txt>
      <FitMoney cents={cents} maxSize={22} minSize={14} />
      <Txt variant="caption" color={colors.textSecondary}>
        {caption}
      </Txt>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Tabela equivalente
// ---------------------------------------------------------------------------------------------------------------------

/**
 * "Ver valores mês a mês": a mesma informação do gráfico em texto, um bloco por mês, com o mês, o valor, o estado e "Na comparação?"
 * ("Sim" ou "Fora da comparação"). Começa fechada; a escolha vale só enquanto a tela está aberta.
 */
export function ValuesTable({ view }: { view: EvolutionView }) {
  const [open, setOpen] = useState(false);
  const hidden = useValuesHidden();
  return (
    <Card style={{ gap: space[2] }}>
      <LinkButton
        label={open ? T.table.hide : T.table.show}
        icon={open ? ChevronUp : ChevronDown}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={() => setOpen((o) => !o)}
        style={styles.toggle}
      />
      {open ? (
        <View role="list" style={{ gap: space[1] }}>
          {view.points.map((p, i) => (
            <View
              key={p.month}
              role="listitem"
              accessible
              focusable={false}
              accessibilityLabel={maskMoneyLabel(
                `${p.title}, ${p.valueText ?? T.table.noValue}, ${p.stateLabel}, ${T.table.columns.included} ${p.includedText}`,
                hidden,
              )}
              style={[styles.tableRow, i < view.points.length - 1 && styles.divider]}>
              <View style={styles.tableHead}>
                <Txt variant="label" style={{ fontFamily: fonts.bold, flexShrink: 1 }}>
                  {p.title}
                </Txt>
                {p.valueText !== null ? (
                  <Money cents={p.cents} variant="label" style={[styles.tableValue, { flexShrink: 0 }]} />
                ) : (
                  <Txt variant="label" color={colors.textSecondary} style={{ flexShrink: 0 }}>
                    {T.table.noValue}
                  </Txt>
                )}
              </View>
              <TableField name={T.table.columns.state} value={p.stateLabel} />
              <TableField name={T.table.columns.included} value={p.includedText} />
            </View>
          ))}
          <Txt variant="caption" color={colors.textSecondary}>
            {T.table.note}
          </Txt>
        </View>
      ) : null}
    </Card>
  );
}

function TableField({ name, value }: { name: string; value: string }) {
  return (
    <View style={styles.tableField}>
      <Txt variant="caption" color={colors.textSecondary}>
        {name}
      </Txt>
      <Txt variant="caption" style={{ fontFamily: fonts.bold, flexShrink: 1, textAlign: 'right' }}>
        {value}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  entry: { gap: space[3], paddingVertical: space[2] },
  chart: { position: 'relative' },
  columns: { flexDirection: 'row' },
  plot: { position: 'absolute', top: 0, left: 0 },
  column: { flex: 1, minWidth: 0, alignItems: 'center', borderRadius: 10 },
  columnSelected: { backgroundColor: colors.brandTint },
  axis: { alignItems: 'center', paddingTop: 2, paddingBottom: space[1], gap: 2, minHeight: 40 },
  axisLabel: { fontSize: 12, lineHeight: 16, textAlign: 'center', color: colors.text },
  axisLabelSelected: { backgroundColor: colors.accent, borderRadius: 6, paddingHorizontal: 2, overflow: 'hidden' },
  axisIcon: { height: 16, alignItems: 'center', justifyContent: 'center' },
  chartHead: { gap: space[1], paddingHorizontal: space[3] },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[4], rowGap: space[1], marginTop: space[1], paddingHorizontal: space[3] },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space[1], flexShrink: 1 },
  swatch: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  block: { gap: space[2], paddingTop: space[3], borderTopWidth: 1, borderTopColor: colors.border },
  link: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  category: { flexDirection: 'row', alignItems: 'flex-start', columnGap: space[3], paddingVertical: space[2] },
  categoryValue: { fontFamily: fonts.bold, fontSize: 16 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  notice: { gap: space[2], padding: space[4], borderRadius: 16, backgroundColor: colors.brandTint },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  stat: { flexGrow: 1, flexBasis: 120, minWidth: 0, padding: space[3], gap: space[1] },
  statValue: { fontFamily: fonts.extrabold, fontSize: 18, lineHeight: 26 },
  toggle: { alignSelf: 'flex-start', paddingHorizontal: 0, minHeight: 48 },
  tableRow: { gap: 2, paddingVertical: space[2] },
  tableHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', columnGap: space[3] },
  tableValue: { fontFamily: fonts.bold, fontSize: 15 },
  tableField: { flexDirection: 'row', justifyContent: 'space-between', columnGap: space[3] },
  });
