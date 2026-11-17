import {
  CALENDAR_TEXT,
  calendarStartMonth,
  calendarStep,
  calendarTotalsLines,
  formatMonthBR,
  monthOf,
  type CalendarItem,
  type CalendarTarget,
  type IsoMonth,
} from '@clarevo/core';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { BookOpen, CalendarClock, ChevronRight, CreditCard, PiggyBank, Repeat, TrendingUp, type LucideIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ContextPill, SubHeader } from '@/components/header';
import { MoneyTxt } from '@/components/money-text';
import { MonthStepper } from '@/components/month-stepper';
import { EmptyArt, ErrorState } from '@/components/states';
import { Card, LinkButton, Money, Screen, Skeleton, Txt } from '@/components/ui';
import { invoiceHref } from '@/lib/cards';
import { useDevicePrefs } from '@/lib/device-prefs';
import { explanationHref } from '@/lib/learn';
import { maskMoneyLabel, useValuesHidden } from '@/lib/privacy';
import { useFinancialCalendar, useView, useWork } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, radius, space, tabular } from '@/theme/tokens';

const T = CALENDAR_TEXT;

/** O endereço de cada item: a conta (ou a fatura), o gasto fixo, o investimento, o plano, a meta ou o tema de Aprender. */
function hrefOf(target: CalendarTarget): Href {
  switch (target.kind) {
    case 'conta':
      return target.invoice ? invoiceHref(target.invoice.cardId, target.invoice.month) : { pathname: '/a-pagar/[id]', params: { id: target.commitmentId } };
    case 'gasto_fixo':
      return { pathname: '/gastos-fixos/[id]', params: { id: target.seriesId } };
    case 'investimento':
      return { pathname: '/investimento/[id]', params: { id: target.investmentId } };
    case 'plano_aportes':
      return '/investimento/plano';
    case 'meta':
      return { pathname: '/meta/[id]', params: { id: target.goalId } };
    case 'tema':
      return explanationHref(target.slug);
  }
}

const ICON: Record<CalendarItem['kind'], LucideIcon> = {
  conta: CalendarClock,
  fatura: CreditCard,
  previsto: Repeat,
  vencimento_investimento: TrendingUp,
  plano_aportes: TrendingUp,
  aporte_meta: PiggyBank,
  informe_ir: BookOpen,
  declaracao_ir: BookOpen,
};

/**
 * Calendário financeiro (D-105): tela de consulta, só leitura, com a barra inferior. Seletor de mês local (24 meses para trás e 12 para a
 * frente). No topo, os totais do mês sem misturar previsto com realizado; depois, um cartão por dia com os itens daquele dia e, no fim, o
 * que vale no mês sem dia marcado. Cada item abre a tela dele (conta, fatura, gasto fixo, investimento, plano de aportes, meta ou o tema
 * do Imposto de Renda). Segue o contexto escolhido (Pessoal ou Família); investimentos e a temporada do Imposto de Renda só no Pessoal.
 * "Ocultar valores" vale para todos os valores. Falha de carga é erro com "Tentar de novo", nunca R$ 0,00.
 */
export default function CalendarioScreen() {
  const { today, user } = useSession();
  const currentMonth = monthOf(today);
  const params = useLocalSearchParams<{ mes?: string }>();
  const [month, setMonth] = useState<IsoMonth>(() => calendarStartMonth(params.mes, currentMonth));
  useEffect(() => {
    setMonth(calendarStartMonth(params.mes, currentMonth));
  }, [params.mes, currentMonth]);
  const { space: kind } = useView();
  const work = useWork().data;
  const contextId = work?.contextId;
  const personal = kind === 'pessoal';
  const prefs = useDevicePrefs(user?.id);
  const goalDepositDay = prefs?.routineReminders.aporte ? prefs.depositReminderDay : null;
  const investmentDepositDay = prefs?.routineReminders.aporte_investimentos ? prefs.depositReminderDay : null;
  const calendar = useFinancialCalendar(contextId, month, { personal, goalDepositDay, investmentDepositDay });
  const cal = calendar.data;
  const prev = calendarStep(month, currentMonth, -1);
  const next = calendarStep(month, currentMonth, 1);
  const lines = cal ? calendarTotalsLines(cal.totals) : null;
  const hasPlanned = Boolean(cal && [...cal.days.flatMap((d) => d.items), ...cal.undated].some((i) => i.amountKind === 'planejado'));

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={T.title} right={<ContextPill label="Pessoal" />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        <Txt color={colors.textSecondary}>{T.intro}</Txt>
        <View style={{ gap: space[1] }}>
          <MonthStepper
            groupLabel={T.monthGroup}
            label={`${work?.contextName ?? 'Pessoal'} · ${formatMonthBR(month)}`}
            prevLabel={prev ? T.previous(prev) : 'Mês anterior'}
            nextLabel={next ? T.next(next) : 'Próximo mês'}
            onPrev={prev ? () => setMonth(prev) : null}
            onNext={next ? () => setMonth(next) : null}
          />
          {month !== currentMonth ? <LinkButton label={T.backToCurrent(currentMonth)} style={styles.inlineLink} onPress={() => setMonth(currentMonth)} /> : null}
        </View>

        {calendar.isPending ? (
          <View style={{ gap: space[3] }} accessibilityRole="progressbar" accessibilityLabel={T.loading}>
            <Skeleton width="100%" height={96} />
            <Skeleton width="100%" height={120} />
            <Skeleton width="100%" height={120} />
          </View>
        ) : calendar.isError || !cal || !lines ? (
          <Card>
            <ErrorState message={T.loadError} onRetry={() => calendar.refetch()} />
          </Card>
        ) : (
          <>
            <Card style={{ gap: space[2] }}>
              <Txt variant="title" accessibilityRole="header" aria-level={2}>
                {T.totalsTitle}
              </Txt>
              <Txt variant="label" color={colors.textSecondary}>
                {T.toPayLabel}
              </Txt>
              <Money cents={cal.totals.toPayCents} variant="title" style={styles.total} />
              <Txt variant="caption" color={colors.textSecondary}>
                {lines.toPay ?? T.toPayNone}
              </Txt>
              {lines.estimated ? <MoneyTxt variant="caption">{lines.estimated}</MoneyTxt> : null}
              {lines.paid ? <MoneyTxt variant="label">{lines.paid}</MoneyTxt> : null}
              {lines.goals ? (
                <>
                  <MoneyTxt variant="label">{lines.goals}</MoneyTxt>
                  <Txt variant="caption" color={colors.textSecondary}>
                    {T.goalsPlannedNote}
                  </Txt>
                </>
              ) : null}
            </Card>

            {cal.empty ? (
              <Card style={{ alignItems: 'center', gap: space[3] }}>
                <EmptyArt kind="contas" />
                <Txt variant="label" style={{ fontFamily: fonts.bold, textAlign: 'center' }}>
                  {T.empty(month)}
                </Txt>
                <Txt color={colors.textSecondary} style={{ textAlign: 'center' }}>
                  {T.emptyBody}
                </Txt>
              </Card>
            ) : null}

            {cal.days.map((d) => (
              <Card key={d.date} style={styles.dayCard}>
                <Txt variant="label" style={styles.dayTitle} accessibilityRole="header" aria-level={2}>
                  {d.title}
                </Txt>
                <View>
                  {d.items.map((item, i) => (
                    <ItemRow key={item.key} item={item} last={i === d.items.length - 1} />
                  ))}
                </View>
              </Card>
            ))}

            {cal.undated.length > 0 ? (
              <Card style={styles.dayCard}>
                <Txt variant="label" style={styles.dayTitle} accessibilityRole="header" aria-level={2}>
                  {T.undatedTitle}
                </Txt>
                <View>
                  {cal.undated.map((item, i) => (
                    <ItemRow key={item.key} item={item} last={i === cal.undated.length - 1} />
                  ))}
                </View>
              </Card>
            ) : null}

            <View style={{ gap: space[1] }}>
              <Txt variant="caption" color={colors.textSecondary}>
                {T.readOnly}
              </Txt>
              {hasPlanned ? (
                <Txt variant="caption" color={colors.textSecondary}>
                  {T.depositDayHint}
                </Txt>
              ) : null}
              {!personal ? (
                <Txt variant="caption" color={colors.textSecondary}>
                  {T.investmentsPersonal}
                </Txt>
              ) : null}
            </View>
          </>
        )}
      </Screen>
    </View>
  );
}

/** Um item: ícone, nome, legenda e valor (com "Ocultar valores"); o toque abre a tela dele. Sem cor de alerta. */
function ItemRow({ item, last }: { item: CalendarItem; last: boolean }) {
  const hidden = useValuesHidden();
  const Icon = ICON[item.kind];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={maskMoneyLabel(T.itemA11y(item), hidden)}
      onPress={() => router.push(hrefOf(item.target))}
      style={(st) => [styles.row, !last && styles.divider, st.pressed && { opacity: 0.7 }, (st as { focused?: boolean }).focused && styles.focusRing]}>
      <View style={styles.icon}>
        <Icon size={20} color={colors.brandText} strokeWidth={2.25} aria-hidden />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt variant="label" style={{ fontFamily: fonts.bold }}>
          {item.title}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {item.caption}
        </Txt>
        {item.amountCents !== null ? (
          <View style={styles.amountRow}>
            <Money cents={item.amountCents} variant="label" style={styles.amount} />
            {item.amountKind === 'previsto' || item.amountKind === 'planejado' ? (
              <Txt variant="caption" color={colors.textSecondary}>
                {item.estimate ? `previsto, ${T.estimateSuffix}` : 'previsto'}
              </Txt>
            ) : null}
          </View>
        ) : null}
      </View>
      <ChevronRight size={20} color={colors.textSecondary} aria-hidden />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  inlineLink: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  total: { fontFamily: fonts.extrabold, fontSize: 24, lineHeight: 32 },
  dayCard: { gap: space[1], paddingVertical: space[4] },
  dayTitle: { fontFamily: fonts.bold, color: colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 10, minHeight: 56 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  icon: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: space[2] },
  amount: { fontFamily: fonts.bold, ...tabular },
  focusRing: { outlineWidth: 3, outlineColor: colors.brandText, outlineStyle: 'solid', outlineOffset: 2 } as object,
});
