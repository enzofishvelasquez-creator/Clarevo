import {
  ALLOCATION_DIMENSIONS,
  ALLOCATION_DIMENSION_LABEL,
  FGC_TEXT,
  FISCAL_TEXT,
  PORTFOLIO_EVOLUTION_TEXT,
  fiscalCalendar,
  portfolioEvolution,
  taxRegimeOf,
  INCOME_TEXT,
  INVESTMENT_PLAN_TEXT,
  allocationUseful,
  dateEventText,
  fgcByInstitution,
  formatBRL,
  incomeSummary,
  investmentAllocation,
  investmentDateEvents,
  investmentPlanLine,
  type AllocationDimension,
  type Investment,
  type InvestmentMovement,
  type InvestmentPlan,
} from '@clarevo/core';
import { router } from 'expo-router';
import { Calculator, CalendarClock, ChevronRight, FileText, Landmark, PiggyBank } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { MoneyTxt, useMoneyLabelMask } from '@/components/money-text';
import { ChoiceGroup } from '@/components/series-parts';
import { Button, Card, Chip, Txt, styles as ui } from '@/components/ui';
import { useSession } from '@/state/session';
import { colors, fonts, radius, space, tabular } from '@/theme/tokens';

const pct = (share: number) => `${Math.round(share * 100)}%`;

/**
 * "Próximos vencimentos" (D-099, item 2): vencimentos e liberações dos próximos 12 meses e os vencidos que ainda têm valor. Some sem
 * nenhuma data na ficha.
 */
export function UpcomingDatesCard({ items }: { items: readonly Investment[] }) {
  const { today } = useSession();
  const events = investmentDateEvents(items, today, 365);
  if (events.length === 0) return null;
  const shown = events.slice(0, 6);
  return (
    <Card style={{ gap: space[2] }}>
      <View style={styles.titleRow}>
        <CalendarClock size={20} color={colors.brandText} aria-hidden />
        <Txt variant="title" accessibilityRole="header" aria-level={2} style={{ flex: 1 }}>
          Próximos vencimentos
        </Txt>
      </View>
      {shown.map((e) => (
        <Pressable
          key={`${e.investmentId}-${e.kind}`}
          accessibilityRole="button"
          accessibilityHint="Abre o investimento"
          onPress={() => router.push({ pathname: '/investimento/[id]', params: { id: e.investmentId } })}
          style={(st) => [styles.eventRow, st.pressed && { opacity: 0.8 }, (st as { focused?: boolean }).focused && ui.focusRing]}>
          <Txt variant="label" style={{ flex: 1 }}>
            {dateEventText(e)}
          </Txt>
          <ChevronRight size={18} color={colors.textSecondary} aria-hidden />
        </Pressable>
      ))}
      {events.length > shown.length ? (
        <Txt variant="caption" color={colors.textSecondary}>
          {`E mais ${events.length - shown.length} nos próximos 12 meses.`}
        </Txt>
      ) : null}
    </Card>
  );
}

/**
 * "Como está dividido" (D-099, item 1): barras simples com o valor e a porcentagem de cada fatia, numa dimensão escolhida. Só as dimensões
 * que dizem algo aparecem. Sem faixa recomendada, sem meta e sem cor de alerta: todas as barras na mesma cor.
 */
export function AllocationCard({ items }: { items: readonly Investment[] }) {
  const { today } = useSession();
  const maskLabel = useMoneyLabelMask();
  const dims = ALLOCATION_DIMENSIONS.filter((d) => allocationUseful(investmentAllocation(items, d, today)));
  const [chosen, setChosen] = useState<AllocationDimension>('kind');
  if (dims.length === 0) return null;
  const dim = dims.includes(chosen) ? chosen : dims[0]!;
  const slices = investmentAllocation(items, dim, today);
  return (
    <Card style={{ gap: space[3] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        Como está dividido
      </Txt>
      {dims.length > 1 ? (
        <ChoiceGroup label="Ver" accessibilityLabel="Ver a divisão">
          {dims.map((d) => (
            <Chip key={d} compact label={ALLOCATION_DIMENSION_LABEL[d]} selected={dim === d} onPress={() => setChosen(d)} />
          ))}
        </ChoiceGroup>
      ) : null}
      <View style={{ gap: space[3] }}>
        {slices.map((s) => (
          <View key={s.key} style={{ gap: space[1] }} accessible accessibilityLabel={maskLabel(`${s.label}: ${formatBRL(s.cents)}, ${pct(s.share)} do total`)}>
            <View style={styles.sliceHead}>
              <Txt variant="label" style={{ flex: 1, minWidth: 0 }}>
                {s.label}
              </Txt>
              <MoneyTxt variant="label" style={tabular}>
                {formatBRL(s.cents)}
              </MoneyTxt>
              <Txt variant="label" style={[tabular, styles.pct]}>
                {pct(s.share)}
              </Txt>
            </View>
            <View style={styles.track} aria-hidden>
              <View style={[styles.bar, { width: `${Math.max(2, Math.round(s.share * 100))}%` }]} />
            </View>
          </View>
        ))}
      </View>
      <Txt variant="caption" color={colors.textSecondary}>
        Pelo valor de hoje dos investimentos ativos, como você registrou. A Clarevo não indica como dividir.
      </Txt>
    </Card>
  );
}

/**
 * "Garantia do FGC" (D-099, item 3): a soma por instituição dos produtos com a garantia, com o limite escrito de forma neutra. Some sem
 * nenhum produto com a garantia.
 */
export function FgcCard({ items }: { items: readonly Investment[] }) {
  const f = fgcByInstitution(items);
  if (f.totalCents <= 0) return null;
  return (
    <Card style={{ gap: space[2] }}>
      <View style={styles.titleRow}>
        <Landmark size={20} color={colors.brandText} aria-hidden />
        <Txt variant="title" accessibilityRole="header" aria-level={2} style={{ flex: 1 }}>
          {FGC_TEXT.title}
        </Txt>
      </View>
      {f.groups.map((g) => (
        <MoneyTxt key={g.key} variant="label">
          {g.overCents > 0 ? FGC_TEXT.over(g) : FGC_TEXT.group(g)}
        </MoneyTxt>
      ))}
      {f.withoutInstitution.names.length > 0 ? (
        <Txt variant="caption" color={colors.textSecondary}>
          {FGC_TEXT.without(f.withoutInstitution.names)}
        </Txt>
      ) : null}
      <Txt variant="caption" color={colors.textSecondary}>
        {FGC_TEXT.rules}
      </Txt>
      <Txt variant="caption" color={colors.textSecondary}>
        {FGC_TEXT.estimate}
      </Txt>
    </Card>
  );
}

/**
 * "Rendimentos recebidos em 2026" (D-099, item 5): o total do ano e a divisão por tipo, de todos os investimentos (os encerrados no ano
 * também, como no resumo para a declaração). Some sem nenhum rendimento no ano.
 */
export function IncomeCard({ movements }: { movements: readonly InvestmentMovement[] }) {
  const { today } = useSession();
  const year = Number(today.slice(0, 4));
  const s = incomeSummary(movements, year, today);
  if (s.totalCents <= 0) return null;
  return (
    <Card style={{ gap: space[2] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {INCOME_TEXT.title(year)}
      </Txt>
      <MoneyTxt variant="label" style={[tabular, { fontFamily: fonts.extrabold, fontSize: 20 }]}>
        {INCOME_TEXT.total(s.totalCents)}
      </MoneyTxt>
      {s.byKind.map((k) => (
        <View key={k.kind} style={styles.sliceHead}>
          <Txt variant="label" style={{ flex: 1 }}>
            {k.label}
          </Txt>
          <MoneyTxt variant="label" style={tabular}>
            {formatBRL(k.cents)}
          </MoneyTxt>
        </View>
      ))}
      {s.byKind.some((k) => k.kind === 'jcp') ? (
        <Txt variant="caption" color={colors.textSecondary}>
          {INCOME_TEXT.jcpNote}
        </Txt>
      ) : null}
      {s.byKind.some((k) => k.kind === 'sem_tipo') ? (
        <Txt variant="caption" color={colors.textSecondary}>
          {INCOME_TEXT.kindHint}
        </Txt>
      ) : null}
    </Card>
  );
}

/**
 * "Evolução da carteira" (D-099, item 14): o valor no fim de cada um dos últimos 6 meses, em barras da mesma cor, com o aportado
 * acumulado embaixo. Some com menos de dois meses.
 */
export function EvolutionCard({ items, movements }: { items: readonly Investment[]; movements: readonly InvestmentMovement[] }) {
  const { today } = useSession();
  const maskLabel = useMoneyLabelMask();
  // Todos os investimentos: o encerrado conta até o mês do último movimento dele.
  const groups = items.map((i) => ({ movements: movements.filter((m) => m.investmentId === i.id), active: i.status === 'ativo' }));
  const points = portfolioEvolution(groups, today, 6);
  if (points.length < 2) return null;
  const max = Math.max(...points.map((p) => p.valueCents), 1);
  return (
    <Card style={{ gap: space[3] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {PORTFOLIO_EVOLUTION_TEXT.title}
      </Txt>
      {points.map((p) => (
        <View key={p.month} style={{ gap: space[1] }} accessible accessibilityLabel={maskLabel(`${PORTFOLIO_EVOLUTION_TEXT.row(p)}. ${PORTFOLIO_EVOLUTION_TEXT.invested(p)}`)}>
          <MoneyTxt variant="label">{PORTFOLIO_EVOLUTION_TEXT.row(p)}</MoneyTxt>
          <View style={styles.track} aria-hidden>
            <View style={[styles.bar, { width: `${Math.max(2, Math.round((p.valueCents / max) * 100))}%` }]} />
          </View>
          <MoneyTxt variant="caption" color={colors.textSecondary}>
            {PORTFOLIO_EVOLUTION_TEXT.invested(p)}
          </MoneyTxt>
        </View>
      ))}
      <Txt variant="caption" color={colors.textSecondary}>
        {PORTFOLIO_EVOLUTION_TEXT.note}
      </Txt>
    </Card>
  );
}

/** "Datas do ano para quem investe" (D-099, item 15): as próximas quatro datas de referência e a regra do imposto de quem vende ações. */
export function FiscalCalendarCard({ items }: { items: readonly Investment[] }) {
  const { today } = useSession();
  const active = items.filter((i) => i.status === 'ativo');
  if (active.length === 0) return null;
  const hasComeCotas = active.some((i) => taxRegimeOf(i.kind, i.subkind) === 'come_cotas' || (i.kind === 'fundos' && i.subkind === null));
  // Quem tem ação, BDR, ETF, FII ou Fiagro (no fundo de ações o imposto é retido no resgate, sem DARF).
  const sellsShares = active.some((i) => i.kind === 'acoes' || (taxRegimeOf(i.kind, i.subkind) === 'venda' && i.subkind !== 'fundo_acoes'));
  const events = fiscalCalendar(today, { hasComeCotas }).slice(0, 4);
  if (events.length === 0) return null;
  return (
    <Card style={{ gap: space[2] }}>
      <View style={styles.titleRow}>
        <CalendarClock size={20} color={colors.brandText} aria-hidden />
        <Txt variant="title" accessibilityRole="header" aria-level={2} style={{ flex: 1 }}>
          {FISCAL_TEXT.title}
        </Txt>
      </View>
      {events.map((e) => (
        <View key={`${e.kind}-${e.on}`} style={{ gap: 2, paddingVertical: space[1] }}>
          <Txt variant="label" style={{ fontFamily: fonts.bold }}>
            {FISCAL_TEXT.date(e)}
          </Txt>
          <Txt variant="label">{e.text}</Txt>
        </View>
      ))}
      {sellsShares ? (
        <Txt variant="caption" color={colors.textSecondary}>
          {FISCAL_TEXT.darf}
        </Txt>
      ) : null}
      <Txt variant="caption" color={colors.textSecondary}>
        {FISCAL_TEXT.note}
      </Txt>
    </Card>
  );
}

/** Atalhos: o resumo para a declaração e a calculadora de rendimentos líquidos. */
/**
 * Plano de aportes (D-099, item 12): com plano, o aportado do mês ao lado do plano, sem cor e sem cobrança; sem plano, o convite fica na
 * lista de atalhos (InvestmentLinks).
 */
export function InvestmentPlanCard({ plan, movements }: { plan: InvestmentPlan | null; movements: readonly InvestmentMovement[] }) {
  const { today } = useSession();
  const line = investmentPlanLine(plan, movements, today);
  if (!line) return null;
  return (
    <Card style={{ gap: space[2] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {INVESTMENT_PLAN_TEXT.cardTitle}
      </Txt>
      <MoneyTxt>{line}</MoneyTxt>
      <Button label={INVESTMENT_PLAN_TEXT.editAction} tone="ghost" compact onPress={() => router.push('/investimento/plano')} />
    </Card>
  );
}

export function InvestmentLinks({ showPlan = false }: { showPlan?: boolean }) {
  const link = (label: string, hint: string, Icon: typeof FileText, href: Parameters<typeof router.push>[0]) => (
    <Pressable
      accessibilityRole="link"
      accessibilityHint={hint}
      onPress={() => router.push(href)}
      style={(st) => [ui.card, styles.linkRow, st.pressed && { opacity: 0.85 }, (st as { focused?: boolean }).focused && ui.focusRing]}>
      <View style={styles.linkIcon}>
        <Icon size={20} color={colors.brandText} aria-hidden />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="label" style={{ fontFamily: fonts.bold }}>
          {label}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {hint}
        </Txt>
      </View>
      <ChevronRight size={20} color={colors.textSecondary} aria-hidden />
    </Pressable>
  );
  return (
    <View style={{ gap: space[3] }}>
      {showPlan ? link(INVESTMENT_PLAN_TEXT.cardTitle, INVESTMENT_PLAN_TEXT.emptyBody, PiggyBank, '/investimento/plano') : null}
      {link('Resumo para a declaração', 'Valores em 31/12 e rendimentos do ano, para conferir com os informes.', FileText, '/investimento/declaracao')}
      {link('Comparar rendimentos líquidos', 'Uma calculadora com o imposto de cada opção que você recebeu.', Calculator, '/investimento/comparar')}
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 44, paddingVertical: space[1] },
  sliceHead: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  pct: { minWidth: 44, textAlign: 'right', fontFamily: fonts.bold },
  track: { height: 8, borderRadius: radius.pill, backgroundColor: colors.brandTint, overflow: 'hidden' },
  bar: { height: 8, borderRadius: radius.pill, backgroundColor: colors.brandMark },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  linkIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
});
