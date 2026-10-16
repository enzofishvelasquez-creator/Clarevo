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

import { BudgetBar } from '@/components/budget-bar';
import { useMoneyMask } from '@/components/committed-parts';
import { FlashBanner, useFlash } from '@/components/flash';
import { ContextPill, SubHeader } from '@/components/header';
import { MoneyTxt } from '@/components/money-text';
import { MonthStepper } from '@/components/month-stepper';
import { ErrorState } from '@/components/states';
import { Card, LinkButton, Screen, Skeleton, Txt } from '@/components/ui';
import { useBudgetNotices } from '@/lib/budget-notices';
import { useMonthBudget, useMonthRefunds, useSpace } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, radius, space, tabular } from '@/theme/tokens';

/**
 * Orçamento por categoria (D-041): tela de consulta, com a barra inferior. Seletor de mês local (como Contas a pagar). Um card por
 * categoria com orçamento no mês: barra na cor da marca (nunca vermelho), "R$ 412,30 de R$ 1.200,00", "Faltam R$ 787,70" ou
 * "R$ 12,30 acima do orçamento" e o percentual com uma casa. As categorias sem orçamento ficam em "Definir orçamento". O usado
 * é por competência: a 1ª parcela de uma compra no cartão conta no mês da compra e as seguintes nos meses depois, mesmo antes de a fatura
 * ser paga; gastos e contas pagas contam no mês da data do pagamento (`BUDGET_TEXT.rule`, a mesma frase do guia e do manual).
 * `?mes=AAAA-MM` abre em outro mês (sem ele, o mês atual).
 *
 * D-054 (decisões de 16/10/2026): acima de 100% a barra fica cheia, com um trecho final listrado proporcional ao excedente e o texto
 * "R$ X acima" (o leitor de tela diz "R$ X acima do orçamento"); de 80% a menos de 100% o card mostra "Chegou a 84% do orçamento." com
 * "Dispensar aviso" (por categoria e mês, só neste aparelho; volta no mês seguinte); e a categoria com estorno informado numa fatura do
 * mês explica o estorno em uma linha (`BUDGET_TEXT.refundNote`, a frase do core).
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
  const { refunds } = useMonthRefunds(contextId, month);
  const s = budget.summary;
  const prev = payablesStep(month, currentMonth, -1);
  const next = payablesStep(month, currentMonth, 1);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={BUDGET_TEXT.title} right={<ContextPill label="Pessoal" />} help="orcamento" />
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
        <Txt color={colors.textSecondary}>{BUDGET_TEXT.rule}</Txt>

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
              <CategoryCard key={r.category} row={r} month={month} currentMonth={currentMonth} refundCents={refunds?.[r.category] ?? 0} />
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

/**
 * Um card por categoria com orçamento: nome, percentual, barra, "usado de orçado" e o que falta (ou passa). Toque abre o formulário.
 * Fora da área tocável: o aviso de 80% com "Dispensar aviso" e a explicação do estorno, para o botão do aviso não ficar dentro de outro.
 */
function CategoryCard({ row, month, currentMonth, refundCents }: { row: BudgetRow; month: IsoMonth; currentMonth: IsoMonth; refundCents: number }) {
  const mask = useMoneyMask();
  const notices = useBudgetNotices();
  const showNear = row.nearNotice !== null && notices.ready && !notices.isDismissed(month, row.category);
  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={mask.label(`${row.a11yLabel} ${BUDGET_TEXT.changeButton(row.category)}.`)}
        onPress={() => openForm(row.category, month, currentMonth)}
        style={(st) => [styles.cardPress, st.pressed && { opacity: 0.85 }, (st as { focused?: boolean }).focused && styles.focusRing]}>
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
        <BudgetBar solidTenths={row.solidTenths} stripedTenths={row.stripedTenths} minimal={row.usedCents > 0} />
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ gap: 2 }}>
          <MoneyTxt style={[tabular, { fontFamily: fonts.bold }]}>{row.amountLine}</MoneyTxt>
          {/* Acima de 100%: "R$ 100,00 acima", o texto que acompanha o trecho listrado (o botão diz "R$ 100,00 acima do orçamento"). */}
          <MoneyTxt variant="label" color={colors.textSecondary} style={row.overText ? { fontFamily: fonts.bold, color: colors.text } : undefined}>
            {row.overText ?? row.balanceLine}
          </MoneyTxt>
        </View>
      </Pressable>
      {showNear ? (
        <View style={styles.notice}>
          <Txt variant="label" style={{ flexShrink: 1 }}>
            {row.nearNotice}
          </Txt>
          <LinkButton
            label={BUDGET_TEXT.dismissNotice}
            accessibilityLabel={BUDGET_TEXT.dismissNoticeA11y(row.category, month)}
            accessibilityHint={BUDGET_TEXT.dismissNoticeHint}
            style={styles.inlineLink}
            onPress={() => notices.dismiss(month, row.category)}
          />
        </View>
      ) : null}
      {refundCents > 0 ? (
        <MoneyTxt variant="caption" color={colors.textSecondary}>
          {BUDGET_TEXT.refundNote(refundCents)}
        </MoneyTxt>
      ) : null}
    </View>
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
  cardPress: { gap: space[3] },
  notice: { gap: space[1], alignItems: 'flex-start' },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  defineRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 56 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  focusRing: { outlineWidth: 3, outlineColor: colors.brand, outlineStyle: 'solid', outlineOffset: 2 } as object,
});
