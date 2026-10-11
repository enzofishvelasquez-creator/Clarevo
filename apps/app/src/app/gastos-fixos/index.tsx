import {
  ANNUAL_HELP_TEXT,
  CALC_UI_TEXT,
  ERROR_TEXT,
  MAX_RECORD_CENTS,
  SUBSCRIPTION_TEXT,
  annualYearOf,
  currentTerm,
  custoPorAnoLink,
  formatBRL,
  formatDayMonth,
  formatMonthName,
  formatMonthYearBR,
  monthOf,
  numberAtOrAfter,
  seriesDueOn,
  seriesEndMonth,
  seriesEnded,
  seriesMonthlyTotal,
  seriesYearlyTotal,
  subscriptionReminderVisible,
  subscriptionRows,
  subscriptionTotals,
  type CommitmentSeries,
  type IsoDate,
  type SubscriptionRow as SubscriptionRowData,
} from '@clarevo/core';
import { router } from 'expo-router';
import { Calculator, CalendarSync, ClipboardCheck, Info, Layers, Plus, Repeat, ShieldCheck, Users } from 'lucide-react-native';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { openCalc } from '@/components/calc/open';
import { FlashBanner, useFlash } from '@/components/flash';
import { ContextPill, SubHeader } from '@/components/header';
import { MoneyTxt } from '@/components/money-text';
import { estimateText, SERIES_NOUN, yearA11y } from '@/components/series-parts';
import { EmptyState, ErrorState } from '@/components/states';
import { TopicLink } from '@/components/topic-link';
import { Banner, Button, Card, LinkButton, Screen, Skeleton, Txt } from '@/components/ui';
import { moneyA11y, moneyText, useValuesHidden } from '@/lib/privacy';
import { useSubscriptionSnooze } from '@/lib/subscription-reminder';
import { useSeriesList, useSpace } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, radius, space, tabular } from '@/theme/tokens';

type Part = { text: string; a11y: string };
const part = (text: string, a11y = text): Part => ({ text, a11y });

/** Número "atual" da série: o do mês de hoje ou o próximo depois dele, dentro do período (a primeira, antes de começar). */
function currentNumber(s: CommitmentSeries, today: IsoDate): number {
  const n = Math.max(s.firstNumber, numberAtOrAfter(s, monthOf(today)));
  return s.lastNumber === null ? n : Math.max(s.firstNumber, Math.min(n, s.lastNumber));
}

/**
 * Conta do ano: "≈ R$ 2.400,00 · todo ano em 20/01 · valor muda" ou "10 parcelas de ≈ R$ 180,00 · fevereiro a novembro,
 * dia 10 · valor muda"; com término, "termina em 2030".
 */
function annualRowParts(s: CommitmentSeries, today: IsoDate, hidden: boolean): Part[] {
  const term = currentTerm(s, today);
  const variable = term.amountMode === 'variavel';
  const k = s.partsPerYear ?? 1;
  const n = currentNumber(s, today);
  const amount = estimateText(term.amountCents, variable, hidden);
  const parts: Part[] = [];
  if (k === 1) {
    parts.push(amount);
    parts.push(part(`todo ano em ${formatDayMonth(seriesDueOn(s, n))}`));
  } else {
    const year = annualYearOf(s, n);
    parts.push(part(`${k} parcelas de ${amount.text}`, `${k} parcelas de ${amount.a11y}`));
    parts.push(part(`${formatMonthName(year.firstMonth)} a ${formatMonthName(year.lastMonth)}, dia ${term.dueDay}`));
  }
  if (variable) parts.push(part('valor muda'));
  if (s.lastNumber !== null) {
    const last = annualYearOf(s, s.lastNumber).label;
    parts.push(part(`termina em ${last}`, `termina em ${yearA11y(last)}`));
  }
  return parts;
}

/**
 * Partes da linha, na ordem da tela e do leitor de tela:
 * "Aluguel · R$ 2.500,00 · todo dia 5", "Luz · ≈ R$ 180,00 · todo dia 12 · valor muda",
 * "Financiamento do carro · Parcela 13 de 48 · R$ 850,00 · termina em outubro de 2029", "Escola · terminou em dezembro de 2026".
 */
function seriesRowParts(s: CommitmentSeries, today: IsoDate, hidden: boolean): Part[] {
  const end = seriesEndMonth(s);
  if (seriesEnded(s, today)) {
    if (s.kind === 'anual') {
      if (end === null || s.lastNumber! < s.firstNumber) return [part('encerrada antes da primeira conta')];
      const last = annualYearOf(s, s.lastNumber!).label;
      return [part(`terminou em ${last}`, `terminou em ${yearA11y(last)}`)];
    }
    const t = end === null || s.lastNumber! < s.firstNumber ? 'encerrado antes da primeira conta' : `terminou em ${formatMonthYearBR(end)}`;
    return [part(t)];
  }
  if (s.kind === 'anual') return annualRowParts(s, today, hidden);
  const term = currentTerm(s, today);
  const variable = term.amountMode === 'variavel';
  const parts: Part[] = [];
  if (s.kind === 'parcelada') {
    // A parcela do mês atual (ou a primeira, antes de começar), limitada à última.
    const n = Math.min(Math.max(s.firstNumber, numberAtOrAfter(s, monthOf(today))), s.lastNumber ?? s.firstNumber);
    const label = `Parcela ${n} de ${s.installmentTotal}`;
    parts.push(part(label));
  }
  parts.push(estimateText(term.amountCents, variable, hidden));
  if (s.kind === 'mensal') parts.push(part(`todo dia ${term.dueDay}`));
  if (variable) parts.push(part('valor muda'));
  if (end !== null) parts.push(part(`termina em ${formatMonthYearBR(end)}`));
  return parts;
}

function SeriesRow({ series: s, today, last }: { series: CommitmentSeries; today: IsoDate; last: boolean }) {
  const { width, fontScale } = useWindowDimensions();
  const hidden = useValuesHidden();
  const stacked = width < 360 || fontScale > 1.3;
  const parts = seriesRowParts(s, today, hidden);
  const Icon = s.kind === 'parcelada' ? Layers : s.kind === 'anual' ? CalendarSync : Repeat;
  const name = currentTerm(s, today).description;
  const kindText = SERIES_NOUN[s.kind];
  return (
    <Pressable
      onPress={() => router.push(`/gastos-fixos/${s.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${parts.map((p) => p.a11y).join(', ')}, ${kindText}`}
      accessibilityHint={s.kind === 'anual' ? 'Abre a conta do ano' : 'Abre o gasto fixo'}
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

/** "R$ 39,90 por mês · R$ 478,80 por ano": com valor que muda, o "≈" na tela e "cerca de" no leitor de tela. */
function subscriptionLine(row: SubscriptionRowData, hidden: boolean): { text: string; a11y: string } {
  const sign = row.estimated ? '≈ ' : '';
  const spoken = row.estimated ? 'cerca de ' : '';
  return {
    text: `${sign}${moneyText(row.monthlyCents, hidden)} por mês · ${sign}${moneyText(row.yearlyCents, hidden)} por ano · todo dia ${row.dueDay}`,
    a11y: `${spoken}${moneyA11y(row.monthlyCents, hidden)} por mês, ${spoken}${moneyA11y(row.yearlyCents, hidden)} por ano, todo dia ${row.dueDay}`,
  };
}

/** Uma assinatura do grupo "Assinaturas": abre o gasto fixo; o link da calculadora fica na própria linha (D-035). */
function SubscriptionLine({ row, series, today, last }: { row: SubscriptionRowData; series: CommitmentSeries | undefined; today: IsoDate; last: boolean }) {
  const hidden = useValuesHidden();
  const line = subscriptionLine(row, hidden);
  const calc = series ? custoPorAnoLink(series, today) : null;
  return (
    <View style={[styles.subRow, !last && styles.divider]}>
      <Pressable
        onPress={() => router.push(`/gastos-fixos/${row.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`${row.name}, ${line.a11y}, assinatura`}
        accessibilityHint="Abre o gasto fixo"
        style={(st) => [
          styles.subMain,
          st.pressed && { opacity: 0.7 },
          (st as { focused?: boolean }).focused && { outlineWidth: 3, outlineColor: colors.brand, outlineStyle: 'solid' },
        ]}>
        <View style={styles.icon}>
          <Repeat size={18} color={colors.brand} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 15 }}>
            {row.name}
          </Txt>
          <Txt variant="caption" color={colors.textSecondary} style={tabular}>
            {line.text}
          </Txt>
        </View>
      </Pressable>
      {calc ? (
        <LinkButton
          label={CALC_UI_TEXT.links.custoAno}
          accessibilityLabel={`${CALC_UI_TEXT.links.custoAno} ${row.name}`}
          icon={Calculator}
          style={styles.subCalc}
          onPress={() => openCalc('custo-por-ano', calc)}
        />
      ) : null}
    </View>
  );
}

/**
 * Grupo "Assinaturas" (D-046), no topo, só quando há alguma ativa: o que custam por mês e por ano (a soma dos valores vigentes; por
 * ano = por mês × 12), uma linha por assinatura com o valor por ano, e o caminho para "Revisar assinaturas". Só informa: nada aqui
 * muda Pago, Ainda a pagar nem a renda comprometida.
 */
function SubscriptionGroup({ list, today }: { list: readonly CommitmentSeries[]; today: IsoDate }) {
  const rows = subscriptionRows(list, today);
  if (rows.length === 0) return null;
  const totals = subscriptionTotals(list, today);
  const byId = new Map(list.map((s) => [s.id, s]));
  return (
    <Card>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {SUBSCRIPTION_TEXT.groupTitle}
      </Txt>
      <MoneyTxt variant="label" style={[tabular, { fontFamily: fonts.bold, paddingTop: space[1] }]}>
        {SUBSCRIPTION_TEXT.totals(totals.monthlyCents, totals.yearlyCents)}
      </MoneyTxt>
      {totals.estimatedMonthlyCents > 0 ? (
        <MoneyTxt variant="caption" color={colors.textSecondary} style={tabular}>
          {SUBSCRIPTION_TEXT.groupEstimated(totals.estimatedMonthlyCents)}
        </MoneyTxt>
      ) : null}
      {rows.map((row, i) => (
        <SubscriptionLine key={row.id} row={row} series={byId.get(row.id)} today={today} last={i === rows.length - 1} />
      ))}
      <LinkButton
        label={SUBSCRIPTION_TEXT.reviewLink}
        icon={ClipboardCheck}
        style={styles.inlineLink}
        onPress={() => router.push('/gastos-fixos/assinaturas')}
      />
    </Card>
  );
}

/**
 * Lista "Gastos fixos e parcelamentos" do contexto Pessoal: assinaturas no topo (quando houver), ativos por tipo (gastos fixos,
 * parcelamentos e contas do ano) e, por último, os encerrados.
 */
export default function GastosFixosScreen() {
  const { today } = useSession();
  const personal = useSpace().data;
  const list = useSeriesList(personal?.personalContextId);
  const [notice] = useFlash();
  const snooze = useSubscriptionSnooze();

  const all = list.data ?? [];
  // Lembrete dentro do app (D-046), sem notificação: só depois de carregar a lista e de ler o aparelho, para não piscar.
  const reminder = list.isSuccess && snooze.ready && subscriptionReminderVisible(all, today, snooze.snoozedUntil, personal?.timeZone);
  const active = all.filter((s) => !seriesEnded(s, today));
  const monthlyActive = active.filter((s) => s.kind !== 'anual');
  const annualActive = active.filter((s) => s.kind === 'anual');
  // Assinaturas (D-046) formam o próprio grupo, no topo, e não se repetem em "Gastos fixos".
  const sections = [
    { title: 'Gastos fixos', items: active.filter((s) => s.kind === 'mensal' && !s.subscription) },
    { title: 'Parcelamentos', items: active.filter((s) => s.kind === 'parcelada') },
  ].filter((sec) => sec.items.length > 0);
  const ended = all.filter((s) => seriesEnded(s, today));
  const monthly = seriesMonthlyTotal(all, today);
  const yearly = seriesYearlyTotal(all, today);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title="Gastos fixos e parcelamentos" right={<ContextPill label="Pessoal" />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        <FlashBanner message={notice} />
        {reminder ? (
          <Banner tone="info" icon={Info} live={false}>
            <Txt variant="label" style={{ fontFamily: fonts.bold }}>
              {SUBSCRIPTION_TEXT.reminderTitle}
            </Txt>
            <View style={styles.reminderActions}>
              <Button label={SUBSCRIPTION_TEXT.reminderReview} tone="soft" compact onPress={() => router.push('/gastos-fixos/assinaturas')} />
              <Button
                label={SUBSCRIPTION_TEXT.reminderLater}
                tone="ghost"
                compact
                accessibilityHint={SUBSCRIPTION_TEXT.reminderLaterHint}
                onPress={snooze.snooze}
              />
            </View>
          </Banner>
        ) : null}
        <View style={{ gap: space[1] }}>
          <Txt color={colors.textSecondary}>
            Contas que se repetem. Cada mês vira uma conta a pagar, e só o que você marca como paga entra em Pago.
          </Txt>
          <TopicLink slug="gasto-fixo" label="O que é um gasto fixo?" style={styles.inlineLink} />
        </View>

        {list.isPending ? (
          <Skeleton width="80%" height={20} />
        ) : list.isError ? null : (
          <>
            {monthlyActive.length > 0 ? (
              <MoneyTxt variant="label" style={tabular}>
                {`Por mês, se os valores não mudarem: ${formatBRL(monthly.totalCents)}${
                  monthly.estimatedCents > 0 ? ` (inclui ${formatBRL(monthly.estimatedCents)} estimados)` : ''
                }.${annualActive.length > 0 ? ' Contas do ano ficam fora desta soma.' : ''}`}
              </MoneyTxt>
            ) : null}
            {annualActive.length > 0 ? (
              <MoneyTxt variant="label" style={tabular}>
                {`Por ano, se os valores não mudarem: ${formatBRL(yearly.totalCents)}${
                  yearly.estimatedCents > 0 ? ` (inclui ${formatBRL(yearly.estimatedCents)} estimados)` : ''
                }.`}
              </MoneyTxt>
            ) : null}
            {/* Com 2 ou mais contas no "Por mês": a calculadora de dividir as contas da casa, com esse total (nada é gravado). */}
            {monthlyActive.length >= 2 && monthly.totalCents > 0 && monthly.totalCents <= MAX_RECORD_CENTS ? (
              <LinkButton
                label={CALC_UI_TEXT.links.dividir}
                icon={Users}
                style={styles.inlineLink}
                onPress={() => openCalc('dividir-contas', { totalCents: monthly.totalCents, origem: 'gastos-fixos' })}
              />
            ) : null}
          </>
        )}

        <Button label="Novo gasto fixo ou parcelamento" icon={Plus} onPress={() => router.push('/gastos-fixos/novo')} />

        {list.isPending ? (
          <View style={{ gap: space[3] }}>
            <Skeleton width="100%" height={56} />
            <Skeleton width="100%" height={56} />
          </View>
        ) : list.isError ? (
          <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => list.refetch()} />
        ) : all.length === 0 ? (
          <Card>
            <EmptyState
              title="Nenhum gasto fixo ainda"
              art="compromissos"
              action={<LinkButton label="Nova conta do ano" onPress={() => router.push('/gastos-fixos/novo?tipo=anual')} />}>
              Aluguel, escola, luz, internet, parcelas e contas do ano, como IPVA e IPTU, entram aqui uma vez e aparecem em Contas a pagar
              quando chega a hora.
            </EmptyState>
          </Card>
        ) : (
          <>
            <SubscriptionGroup list={all} today={today} />

            {sections.map((sec) => (
              <Card key={sec.title}>
                <Txt variant="title" accessibilityRole="header" aria-level={2}>
                  {sec.title}
                </Txt>
                {sec.items.map((s, i) => (
                  <SeriesRow key={s.id} series={s} today={today} last={i === sec.items.length - 1} />
                ))}
              </Card>
            ))}

            {/* Contas do ano: sempre visível, com o atalho para cadastrar a primeira. */}
            <Card>
              <Txt variant="title" accessibilityRole="header" aria-level={2}>
                Contas do ano
              </Txt>
              <Txt variant="label" color={colors.textSecondary} style={{ paddingTop: space[1] }}>
                {ANNUAL_HELP_TEXT.listIntro}
              </Txt>
              {annualActive.map((s, i) => (
                <SeriesRow key={s.id} series={s} today={today} last={i === annualActive.length - 1} />
              ))}
              <LinkButton label="Nova conta do ano" icon={Plus} style={styles.inlineLink} onPress={() => router.push('/gastos-fixos/novo?tipo=anual')} />
              <TopicLink slug="contas-do-ano" label="Como se preparar para as contas do ano?" style={styles.inlineLink} />
            </Card>

            {ended.length > 0 ? (
              <Card>
                <Txt variant="title" accessibilityRole="header" aria-level={2}>
                  Encerrados
                </Txt>
                {ended.map((s, i) => (
                  <SeriesRow key={s.id} series={s} today={today} last={i === ended.length - 1} />
                ))}
              </Card>
            ) : null}
          </>
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
  inlineLink: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  subRow: { paddingVertical: space[2] },
  subMain: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 56 },
  subCalc: { alignSelf: 'flex-start', paddingLeft: 40 + space[3], minHeight: 44 },
  reminderActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], paddingTop: space[1] },
});
