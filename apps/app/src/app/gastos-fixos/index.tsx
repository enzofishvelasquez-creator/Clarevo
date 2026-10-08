import {
  ERROR_TEXT,
  currentTerm,
  formatBRL,
  formatMonthYearBR,
  monthOf,
  numberOfMonth,
  seriesEndMonth,
  seriesEnded,
  seriesMonthlyTotal,
  type CommitmentSeries,
  type IsoDate,
} from '@clarevo/core';
import { router } from 'expo-router';
import { Layers, Plus, Repeat, ShieldCheck } from 'lucide-react-native';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { FlashBanner, useFlash } from '@/components/flash';
import { ContextPill, SubHeader } from '@/components/header';
import { estimateText } from '@/components/series-parts';
import { EmptyState, ErrorState } from '@/components/states';
import { Button, Card, Screen, Skeleton, Txt } from '@/components/ui';
import { useSeriesList, useSpace } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, radius, space, tabular } from '@/theme/tokens';

/**
 * Partes da linha, na ordem da tela e do leitor de tela:
 * "Aluguel · R$ 2.500,00 · todo dia 5", "Luz · ≈ R$ 180,00 · todo dia 12 · valor muda",
 * "Financiamento do carro · Parcela 13 de 48 · R$ 850,00 · termina em outubro de 2029", "Escola · terminou em dezembro de 2026".
 */
function seriesRowParts(s: CommitmentSeries, today: IsoDate): { text: string; a11y: string }[] {
  const end = seriesEndMonth(s);
  if (seriesEnded(s, today)) {
    const t = end === null || s.lastNumber! < s.firstNumber ? 'encerrado antes da primeira conta' : `terminou em ${formatMonthYearBR(end)}`;
    return [{ text: t, a11y: t }];
  }
  const term = currentTerm(s, today);
  const variable = term.amountMode === 'variavel';
  const parts: { text: string; a11y: string }[] = [];
  if (s.kind === 'parcelada') {
    // A parcela do mês atual (ou a primeira, antes de começar), limitada à última.
    const n = Math.min(Math.max(s.firstNumber, numberOfMonth(s, monthOf(today))), s.lastNumber ?? s.firstNumber);
    const label = `Parcela ${n} de ${s.installmentTotal}`;
    parts.push({ text: label, a11y: label });
  }
  parts.push(estimateText(term.amountCents, variable));
  if (s.kind === 'mensal') parts.push({ text: `todo dia ${term.dueDay}`, a11y: `todo dia ${term.dueDay}` });
  if (variable) parts.push({ text: 'valor muda', a11y: 'valor muda' });
  if (end !== null) parts.push({ text: `termina em ${formatMonthYearBR(end)}`, a11y: `termina em ${formatMonthYearBR(end)}` });
  return parts;
}

function SeriesRow({ series: s, today, last }: { series: CommitmentSeries; today: IsoDate; last: boolean }) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale > 1.3;
  const parts = seriesRowParts(s, today);
  const Icon = s.kind === 'parcelada' ? Layers : Repeat;
  const name = currentTerm(s, today).description;
  const kindText = s.kind === 'parcelada' ? 'parcelamento' : 'gasto fixo';
  return (
    <Pressable
      onPress={() => router.push(`/gastos-fixos/${s.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${parts.map((p) => p.a11y).join(', ')}, ${kindText}`}
      accessibilityHint="Abre o gasto fixo"
      style={(st) => [
        styles.row,
        !last && styles.divider,
        st.pressed && { opacity: 0.7 },
        (st as { focused?: boolean }).focused && { outlineWidth: 3, outlineColor: colors.brand, outlineStyle: 'solid' },
      ]}>
      <View style={styles.icon}>
        <Icon size={18} color={colors.brand} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 15 }} numberOfLines={stacked ? undefined : 2}>
          {name}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary} style={tabular}>
          {parts.map((p) => p.text).join(' · ')}
        </Txt>
      </View>
    </Pressable>
  );
}

/** Lista "Gastos fixos e parcelamentos" do contexto Pessoal: ativos por tipo e, por último, os encerrados. */
export default function GastosFixosScreen() {
  const { today } = useSession();
  const personal = useSpace().data;
  const list = useSeriesList(personal?.personalContextId);
  const [notice] = useFlash();

  const all = list.data ?? [];
  const active = all.filter((s) => !seriesEnded(s, today));
  const sections = [
    { title: 'Gastos fixos', items: active.filter((s) => s.kind === 'mensal') },
    { title: 'Parcelamentos', items: active.filter((s) => s.kind === 'parcelada') },
    { title: 'Encerrados', items: all.filter((s) => seriesEnded(s, today)) },
  ].filter((sec) => sec.items.length > 0);
  const monthly = seriesMonthlyTotal(all, today);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title="Gastos fixos e parcelamentos" right={<ContextPill label="Pessoal" />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        <FlashBanner message={notice} />
        <Txt color={colors.textSecondary}>
          Contas que se repetem. Cada mês vira uma conta a pagar, e só o que você marca como paga entra em Pago.
        </Txt>

        {list.isPending ? (
          <Skeleton width="80%" height={20} />
        ) : list.isError ? null : active.length > 0 ? (
          <Txt variant="label" style={tabular}>
            Por mês, se os valores não mudarem: {formatBRL(monthly.totalCents)}
            {monthly.estimatedCents > 0 ? ` (inclui ${formatBRL(monthly.estimatedCents)} estimados)` : ''}.
          </Txt>
        ) : null}

        <Button label="Novo gasto fixo ou parcelamento" icon={Plus} onPress={() => router.push('/gastos-fixos/novo')} />

        {list.isPending ? (
          <View style={{ gap: space[3] }}>
            <Skeleton width="100%" height={56} />
            <Skeleton width="100%" height={56} />
          </View>
        ) : list.isError ? (
          <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => list.refetch()} />
        ) : sections.length === 0 ? (
          <Card>
            <EmptyState title="Nenhum gasto fixo ainda" art="compromissos">
              Aluguel, escola, luz, internet e parcelas entram aqui uma vez e aparecem todo mês em Contas a pagar.
            </EmptyState>
          </Card>
        ) : (
          sections.map((sec) => (
            <Card key={sec.title}>
              <Txt variant="title" accessibilityRole="header" aria-level={2}>
                {sec.title}
              </Txt>
              {sec.items.map((s, i) => (
                <SeriesRow key={s.id} series={s} today={today} last={i === sec.items.length - 1} />
              ))}
            </Card>
          ))
        )}

        <Pressable accessibilityRole="button" onPress={() => router.push('/quem-ve')} style={styles.privacy}>
          <ShieldCheck size={18} color={colors.textSecondary} />
          <Txt variant="label" color={colors.textSecondary}>
            Quem vê estes dados?
          </Txt>
        </Pressable>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3], minHeight: 56 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  icon: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandTint },
  privacy: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: space[2], minHeight: 44 },
});
