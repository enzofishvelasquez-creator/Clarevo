import { SIMULATE_TEXT, formatBRL, type SimulationGrowth, type SimulationYear } from '@clarevo/core';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { useId, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, G, Line, Path, Pattern, Rect } from 'react-native-svg';

import { LinkButton, Txt } from '@/components/ui';
import { colors, fonts, space, tabular } from '@/theme/tokens';

/**
 * Ano a ano do simulador (D-028, spec2 §4.2 e §4.7): uma barra por ano com "Aportado" (sólido, brandDeep) e "Rendimento
 * na hipótese" (brandSoft com listras a 45°, separado por 2 px de branco), legenda sempre em texto, o valor só no último
 * ano e o botão "Ver tabela ano a ano" com o mesmo conteúdo. A cor não julga e não muda com o valor.
 * Acessibilidade: o gráfico é uma imagem com a frase completa (SIMULATE_TEXT.chartA11y); os desenhos e o rótulo do
 * último ano ficam ocultos para o leitor de tela. A tabela é o equivalente em texto, com uma frase por ano.
 */

const T = SIMULATE_TEXT;
const brl = formatBRL;

/** Altura da área das barras. */
const BARS_HEIGHT = 140;
const BAR_MAX_WIDTH = 40;

/** Esconde de leitores de tela (a frase do gráfico, a legenda e a tabela já dizem tudo). */
const decorative = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants', 'aria-hidden': true } as const;

/** Listras a 45° (3 px a cada 6 px): o segmento "Rendimento na hipótese" não depende só da cor. */
function StripesDefs({ id }: { id: string }) {
  return (
    <Defs>
      <Pattern id={id} patternUnits="userSpaceOnUse" width={6} height={6}>
        <Path d="M-1 7 L7 -1 M-1 1 L1 -1 M5 7 L7 5" stroke={colors.brandSoft} strokeWidth={2.12} />
      </Pattern>
    </Defs>
  );
}

/** Quadradinho da legenda: "Aportado" sólido, "Rendimento na hipótese" listrado. */
function Swatch({ kind }: { kind: 'aportado' | 'rendimento' }) {
  const id = `simlistras${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View style={[styles.swatch, kind === 'aportado' && { backgroundColor: colors.brandDeep }]} {...decorative}>
      {kind === 'rendimento' ? (
        <Svg width={14} height={14} accessible={false}>
          <StripesDefs id={id} />
          <Rect x={0} y={0} width={14} height={14} fill={`url(#${id})`} />
        </Svg>
      ) : null}
    </View>
  );
}

function Legend() {
  return (
    <View style={styles.legend}>
      <View style={styles.legendItem}>
        <Swatch kind="aportado" />
        <Txt variant="label" style={{ flexShrink: 1 }}>
          {T.chart.contributed}
        </Txt>
      </View>
      <View style={styles.legendItem}>
        <Swatch kind="rendimento" />
        <Txt variant="label" style={{ flexShrink: 1 }}>
          {T.chart.earnings}
        </Txt>
      </View>
    </View>
  );
}

/** As barras: uma por ano, na escala do valor do último ano (o maior). Largura medida na tela. */
function Bars({ years, width }: { years: readonly SimulationYear[]; width: number }) {
  const id = `simbarras${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const n = years.length;
  const gap = n > 30 ? 1 : n > 15 ? 2 : 4;
  const barWidth = Math.max(2, Math.min(BAR_MAX_WIDTH, (width - gap * (n - 1)) / n));
  const max = Math.max(1, years[n - 1]?.finalCents ?? 1);
  return (
    <Svg width={width} height={BARS_HEIGHT} accessible={false}>
      <StripesDefs id={id} />
      {years.map((y, i) => {
        const x = i * (barWidth + gap);
        const total = Math.max(1, Math.round((y.finalCents / max) * BARS_HEIGHT));
        const contributed = Math.min(total, Math.round((y.contributedCents / max) * BARS_HEIGHT));
        const earnings = total - contributed;
        // 2 px de branco entre os dois segmentos, quando há espaço para os dois.
        const separation = contributed > 0 && earnings > 4 ? 2 : 0;
        return (
          <G key={y.year}>
            {contributed > 0 ? <Rect x={x} y={BARS_HEIGHT - contributed} width={barWidth} height={contributed} fill={colors.brandDeep} /> : null}
            {earnings > 0 ? (
              <Rect x={x} y={BARS_HEIGHT - total} width={barWidth} height={Math.max(1, earnings - separation)} fill={`url(#${id})`} />
            ) : null}
          </G>
        );
      })}
      <Line x1={0} y1={BARS_HEIGHT - 0.5} x2={width} y2={BARS_HEIGHT - 0.5} stroke={colors.borderStrong} strokeWidth={1} />
    </Svg>
  );
}

/** Uma linha do rótulo e do valor (a tabela de cada ano). */
function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Txt variant="label" color={colors.textSecondary} style={{ flex: 1 }}>
        {label}
      </Txt>
      <Txt variant="label" style={[tabular, strong && { fontFamily: fonts.bold }]}>
        {value}
      </Txt>
    </View>
  );
}

/** Tabela ano a ano: o mesmo conteúdo das barras, em texto. Um bloco por ano, com a frase completa para o leitor de tela. */
function YearTable({ years }: { years: readonly SimulationYear[] }) {
  return (
    <View style={{ gap: space[1] }} role="list">
      {years.map((y, i) => (
        <View
          key={y.year}
          role="listitem"
          accessible
          focusable={false}
          accessibilityLabel={T.yearA11y(y)}
          style={[styles.year, i < years.length - 1 && styles.yearDivider]}>
          <Txt variant="label" style={{ fontFamily: fonts.bold }}>
            {T.yearLabel(y)}
          </Txt>
          <Row label={T.table.contributed} value={brl(y.contributedCents)} />
          <Row label={T.table.earnings} value={brl(y.earningsCents)} />
          <Row label={T.table.total} value={brl(y.finalCents)} strong />
          {y.todayValueCents !== null ? <Row label={T.table.today} value={brl(y.todayValueCents)} /> : null}
        </View>
      ))}
    </View>
  );
}

/** Ano a ano com o botão da tabela. A tabela começa fechada e a escolha vale só enquanto a tela está aberta. */
export function YearBars({ growth, months }: { growth: SimulationGrowth; months: number }) {
  const [width, setWidth] = useState(0);
  const [showTable, setShowTable] = useState(false);
  const last = growth.byYear[growth.byYear.length - 1];
  if (!last) return null;
  const first = growth.byYear[0]!;
  return (
    <View style={{ gap: space[2] }}>
      <Txt variant="label" style={{ fontFamily: fonts.bold }} accessibilityRole="header" aria-level={3}>
        {T.chart.title}
      </Txt>
      <View accessible accessibilityRole="image" accessibilityLabel={T.chartA11y(growth, months)} style={{ gap: space[1] }}>
        <Txt variant="label" style={[tabular, { fontFamily: fonts.bold }]} {...decorative}>
          {`${T.yearLabel(last)}: ${brl(last.finalCents)}`}
        </Txt>
        <View onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))} style={{ height: BARS_HEIGHT }} {...decorative}>
          {width > 0 ? <Bars years={growth.byYear} width={width} /> : null}
        </View>
        <View style={styles.axis} {...decorative}>
          <Txt variant="caption" color={colors.textSecondary}>
            {T.yearLabel(first)}
          </Txt>
          {growth.byYear.length > 1 ? (
            <Txt variant="caption" color={colors.textSecondary} style={{ flexShrink: 1, textAlign: 'right' }}>
              {T.yearLabel(last)}
            </Txt>
          ) : null}
        </View>
      </View>
      <Legend />
      <LinkButton
        label={showTable ? T.chart.hideTable : T.chart.showTable}
        icon={showTable ? ChevronUp : ChevronDown}
        accessibilityState={{ expanded: showTable }}
        aria-expanded={showTable}
        onPress={() => setShowTable((s) => !s)}
        style={styles.toggle}
      />
      {showTable ? <YearTable years={growth.byYear} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  axis: { flexDirection: 'row', justifyContent: 'space-between', gap: space[2] },
  legend: { gap: space[1] },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  swatch: { width: 14, height: 14, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.brandTint },
  toggle: { alignSelf: 'flex-start', paddingHorizontal: 0, minHeight: 48 },
  year: { gap: 2, paddingVertical: space[2] },
  yearDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
});
