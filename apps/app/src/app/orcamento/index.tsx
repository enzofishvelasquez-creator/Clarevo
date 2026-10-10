import {
  BUDGET_TEXT,
  ERROR_TEXT,
  PAYABLES_NAV_TEXT,
  formatMonthBR,
  monthOf,
  payablesStartMonth,
  payablesStep,
  type BudgetRow,
  type IsoMonth,
} from '@clarevo/core';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronRight, PieChart } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useMoneyMask } from '@/components/committed-parts';
import { FlashBanner, useFlash } from '@/components/flash';
import { ContextPill, SubHeader } from '@/components/header';
import { MoneyTxt } from '@/components/money-text';
import { MonthStepper } from '@/components/month-stepper';
import { ErrorState } from '@/components/states';
import { Card, LinkButton, Screen, Skeleton, Txt } from '@/components/ui';
import { useMonthBudget, useSpace } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, radius, space, tabular } from '@/theme/tokens';

/**
 * Orçamento por categoria (D-041): tela de consulta, com a barra inferior. Seletor de mês local (como Contas a pagar). Um card por
 * categoria com orçamento no mês: barra na cor da marca (nunca vermelho), "R$ 412,30 de R$ 1.200,00", "Faltam R$ 787,70" ou
 * "R$ 12,30 acima do orçamento" e o percentual com uma casa. As categorias sem orçamento ficam em "Definir orçamento". O usado
 * é por competência: compras no cartão contam no mês da compra, cada parcela no seu mês, mesmo antes de a fatura ser paga.
 * `?mes=AAAA-MM` abre em outro mês (sem ele, o mês atual).
 */
export default function OrcamentoScreen() {
  const { today } = useSession();
  const currentMonth = monthOf(today);
  const params = useLocalSearchParams<{ mes?: string }>();
  const [month, setMonth] = useState<IsoMonth>(() => payablesStartMonth(params.mes, currentMonth));
  // Entradas "de agora" (sem mês no endereço) abrem sempre no mês atual, mesmo com a tela já aberta.
  useEffect(() => {
    setMonth(payablesStartMonth(params.mes, currentMonth));
  }, [params.mes, currentMonth]);
  const contextId = useSpace().data?.personalContextId;
  const [notice] = useFlash();
  const budget = useMonthBudget(contextId, month);
  const s = budget.summary;
  const prev = payablesStep(month, currentMonth, -1);
  const next = payablesStep(month, currentMonth, 1);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={BUDGET_TEXT.title} right={<ContextPill label="Pessoal" />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        <FlashBanner message={notice} />
        <View style={{ gap: space[1] }}>
          <MonthStepper
            groupLabel="Mês do orçamento"
            label={`Pessoal · ${formatMonthBR(month)}`}
            prevLabel={prev ? PAYABLES_NAV_TEXT.previous(prev) : 'Mês anterior'}
            nextLabel={next ? PAYABLES_NAV_TEXT.next(next) : 'Próximo mês'}
            onPrev={prev ? () => setMonth(prev) : null}
            onNext={next ? () => setMonth(next) : null}
          />
          {month !== currentMonth ? (
            <LinkButton label={PAYABLES_NAV_TEXT.backToCurrent(currentMonth)} style={styles.inlineLink} onPress={() => setMonth(currentMonth)} />
          ) : null}
        </View>
        <Txt color={colors.textSecondary}>{BUDGET_TEXT.cardRule}</Txt>

        {budget.isPending ? (
          <View style={{ gap: space[3] }} accessibilityRole="progressbar" accessibilityLabel="Carregando o orçamento">
            <Skeleton width="100%" height={72} />
            <Skeleton width="100%" height={120} />
            <Skeleton width="100%" height={120} />
          </View>
        ) : budget.isError || !s ? (
          <Card>
            <ErrorState message={BUDGET_TEXT.loadError} onRetry={() => budget.refetch()} />
          </Card>
        ) : (
          <>
            {s.totalLine ? (
              <Card style={{ gap: space[1] }}>
                <MoneyTxt variant="title" style={tabular}>
                  {s.totalLine}
                </MoneyTxt>
                <Txt variant="caption" color={colors.textSecondary}>
                  {BUDGET_TEXT.totalNote}
                </Txt>
              </Card>
            ) : (
              <Card>
                <Txt>{BUDGET_TEXT.noneYet}</Txt>
              </Card>
            )}

            {s.rows.map((r) => (
              <CategoryCard key={r.category} row={r} month={month} currentMonth={currentMonth} />
            ))}

            {s.without.length > 0 ? (
              <Card style={{ gap: space[1] }}>
                <Txt variant="title" accessibilityRole="header" aria-level={2}>
                  {BUDGET_TEXT.withoutTitle}
                </Txt>
                <Txt variant="caption" color={colors.textSecondary}>
                  {BUDGET_TEXT.withoutHint}
                </Txt>
                <View>
                  {s.without.map((category, i, all) => (
                    <DefineRow key={category} category={category} last={i === all.length - 1} />
                  ))}
                </View>
              </Card>
            ) : null}

            <Card style={{ gap: space[2] }}>
              <Txt variant="caption" color={colors.textSecondary}>
                {BUDGET_TEXT.versusPaid}
              </Txt>
              <Txt variant="caption" color={colors.textSecondary}>
                {BUDGET_TEXT.noCategoryNote}
              </Txt>
              <LinkButton
                label="Ver Pago por categoria"
                icon={PieChart}
                style={styles.inlineLink}
                onPress={() => router.push({ pathname: '/composicao', params: { tipo: 'pago', vista: 'categoria' } })}
              />
            </Card>
          </>
        )}
      </Screen>
    </View>
  );
}

function openForm(category: string, month: IsoMonth, currentMonth: IsoMonth) {
  router.push({ pathname: '/orcamento/[categoria]', params: { categoria: category, ...(month !== currentMonth ? { mes: month } : {}) } });
}

/** Um card por categoria com orçamento: nome, percentual, barra, "usado de orçado" e o que falta (ou passa). Toque abre o formulário. */
function CategoryCard({ row, month, currentMonth }: { row: BudgetRow; month: IsoMonth; currentMonth: IsoMonth }) {
  const mask = useMoneyMask();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={mask.label(`${row.a11yLabel} ${BUDGET_TEXT.changeButton(row.category)}.`)}
      onPress={() => openForm(row.category, month, currentMonth)}
      style={(st) => [styles.card, st.pressed && { opacity: 0.85 }, (st as { focused?: boolean }).focused && styles.focusRing]}>
      <View style={styles.cardHead} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Txt variant="title" style={{ flexShrink: 1 }}>
          {row.category}
        </Txt>
        <View style={styles.headRight}>
          <Txt variant="label" style={[tabular, { fontFamily: fonts.bold }]}>
            {row.percentText}
          </Txt>
          <ChevronRight size={20} color={colors.textSecondary} aria-hidden />
        </View>
      </View>
      <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={[styles.fill, { width: `${row.barTenths / 10}%` }, row.barTenths === 0 && row.usedCents > 0 && styles.fillMin]} />
      </View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ gap: 2 }}>
        <MoneyTxt style={[tabular, { fontFamily: fonts.bold }]}>{row.amountLine}</MoneyTxt>
        <MoneyTxt variant="label" color={colors.textSecondary}>
          {row.balanceLine}
        </MoneyTxt>
      </View>
    </Pressable>
  );
}

function DefineRow({ category, last }: { category: string; last: boolean }) {
  const { today } = useSession();
  const currentMonth = monthOf(today);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={BUDGET_TEXT.defineButton(category)}
      onPress={() => openForm(category, currentMonth, currentMonth)}
      style={(st) => [styles.defineRow, !last && styles.divider, st.pressed && { opacity: 0.7 }, (st as { focused?: boolean }).focused && styles.focusRing]}>
      <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 16, flex: 1 }}>
        {category}
      </Txt>
      <Txt variant="label" color={colors.brand} style={{ fontFamily: fonts.bold }}>
        Definir
      </Txt>
      <ChevronRight size={20} color={colors.textSecondary} aria-hidden />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  inlineLink: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space[5],
    gap: space[3],
    minHeight: 56,
    shadowColor: '#17223B',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  track: { height: 12, borderRadius: radius.pill, backgroundColor: colors.brandTint, overflow: 'hidden' },
  fill: { height: 12, borderRadius: radius.pill, backgroundColor: colors.brand },
  fillMin: { width: 4 },
  defineRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 56 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  focusRing: { outlineWidth: 3, outlineColor: colors.brand, outlineStyle: 'solid', outlineOffset: 2 } as object,
});
