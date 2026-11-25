import {
  BUSINESS_TEXT,
  ERROR_TEXT,
  HOW_CALC_TEXT,
  INVESTMENT_TEXT,
  PERFORMANCE_TEXT,
  TAB_VALUE_DATE_TEXT,
  formatBRL,
  gainOverInvested,
  investmentGain,
  investmentValueStamp,
  portfolioTotals,
  portfolioValueDates,
  type Investment,
  type InvestmentMovement,
} from '@clarevo/core';
import { router } from 'expo-router';
import { ChevronRight, CircleQuestionMark, Plus, ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { NotInBusinessCard } from '@/components/business-parts';
import { FlashBanner, useFlash } from '@/components/flash';
import { AppHeader } from '@/components/header';
import { investmentCaption } from '@/components/investment-ficha';
import { InvestmentTotalsLines } from '@/components/investment-parts';
import { AllocationCard, FiscalCalendarCard, IncomeCard, InvestmentLinks, InvestmentPlanCard, PerformanceCard, UpcomingDatesCard } from '@/components/investment-portfolio';
import { HowCalculatedSheet, InvestmentTemplates, StaleValuesNotice } from '@/components/investment-tab-parts';
import { MoneyTxt, useMoneyLabelMask } from '@/components/money-text';
import { useSpaceChoices } from '@/components/space-sheet';
import { EmptyState, ErrorState } from '@/components/states';
import { Body, Button, Card, Screen, Skeleton, Txt, styles as ui } from '@/components/ui';
import { useWideLayout } from '@/lib/layout';
import { useContextInvestmentMovements, useInvestmentPlan, useInvestments, useSpace, useView, useWorkOf } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, radius, space, tabular } from '@/theme/tokens';

const T = INVESTMENT_TEXT;

/**
 * Investimentos (D-093, aba nova, só no Pessoal): o total de hoje, o aportado e o ganho, "Novo investimento", a lista dos investimentos e
 * os encerrados. Com a ficha ampliada (D-099): próximos vencimentos, como está dividido, os rendimentos recebidos no ano e os atalhos para
 * o resumo da declaração e a calculadora de rendimentos líquidos. Tudo vem do que a pessoa registra; nada é recomendado. Mesmo com a
 * Família escolhida no seletor, esta aba mostra o Pessoal (investimentos não vão para a Família).
 *
 * D-103 (estudo da aba Investir): cada valor diz de quando é (a lista e o intervalo das datas no card azul); o card mostra o ganho em
 * reais e depois a porcentagem sobre o investido, com a folha "Como a conta é feita"; tocar nele abre o desempenho (a evolução e a
 * comparação com CDI, IPCA e poupança, em investimento/desempenho), que tirou do card a porcentagem única da carteira; a tela vazia traz
 * modelos de registro; a divisão tem "Por instituição" com a soma da garantia do FGC. Numa falha ao recarregar, a aba continua com o
 * último valor conhecido de cada investimento, com a data, e um aviso; nunca zero.
 */
export default function InvestimentosScreen() {
  const space_ = useSpace();
  const personal = useWorkOf('pessoal');
  const inBusiness = useView().space === 'negocio';
  const contextId = space_.data?.personalContextId;
  const list = useInvestments(contextId);
  const movements = useContextInvestmentMovements(contextId);
  // Plano de aportes (D-099, item 12): uma falha ao ler o plano não tira a aba (o card só some).
  const plan = useInvestmentPlan(contextId);
  const [notice] = useFlash();
  const [howOpen, setHowOpen] = useState(false);
  const wide = useWideLayout();
  const multiSpace = useSpaceChoices().spaces.length > 1;
  const canWrite = personal.data?.canWrite ?? true;
  const all = list.data ?? [];
  const active = all.filter((i) => i.status === 'ativo');
  const closed = all.filter((i) => i.status !== 'ativo');
  const moves = movements.data ?? null;
  const retry = () => {
    space_.refetch();
    list.refetch();
    movements.refetch();
  };
  // Falha sem nenhum valor conhecido: o erro, com "Tentar de novo". Com a lista já carregada (desta vez ou antes), ela continua na tela,
  // com a data de cada valor, e o aviso de que não deu para atualizar.
  const failedEmpty = (list.isError && !list.data) || (space_.isError && !space_.data);
  const waiting = !list.data || (!moves && !movements.isError);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Screen wide>
        {/* Investir é só do Pessoal: com mais de um espaço, a pílula diz isso; só com o Pessoal, nenhuma indicação de espaço (sinal 22). */}
        <AppHeader title={T.tabTitle} context={multiSpace ? 'Pessoal' : undefined} contextFixed />
        <Body>
          <FlashBanner message={notice} />
          {inBusiness ? (
            // Espaço Negócio (D-113): investimentos ficam no Pessoal; a aba só explica e leva ao Pessoal.
            <NotInBusinessCard text={BUSINESS_TEXT.investHidden} />
          ) : failedEmpty ? (
            <Card>
              <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={retry} />
            </Card>
          ) : waiting ? (
            <View style={{ gap: space[4] }} accessibilityRole="progressbar" accessibilityLabel="Carregando os investimentos">
              <Skeleton width="100%" height={160} style={{ borderRadius: radius.lg }} />
              <Skeleton width="100%" height={96} style={{ borderRadius: radius.lg }} />
            </View>
          ) : all.length === 0 ? (
            <>
              {list.isError ? <StaleValuesNotice partial={false} onRetry={retry} /> : null}
              <Card style={{ gap: space[3] }}>
                <EmptyState title={T.emptyTitle} art="investimentos">
                  {T.emptyBody}
                </EmptyState>
              </Card>
              {/* D-103 (item 5): modelos de registro no lugar do botão único; "Outro investimento" abre o formulário em branco. */}
              {canWrite ? <InvestmentTemplates /> : null}
            </>
          ) : (
            <>
              {list.isError || movements.isError ? <StaleValuesNotice partial={!list.isError} onRetry={retry} /> : null}
              {/* A carteira é só dos ativos: os encerrados saem do total (docs/45, seção 3.2). */}
              {wide ? <SummaryWide active={active} onHow={() => setHowOpen(true)} /> : <Summary active={active} onHow={() => setHowOpen(true)} />}
              {/* Desempenho (auditoria de 18/11/2026): card próprio logo abaixo do total, com CDI, IPCA e poupança no nome. */}
              <PerformanceCard />
              {/* Revisão das telas (16/11/2026): "Novo investimento" logo abaixo do total, não depois da lista. */}
              {canWrite ? <Button label={T.newInvestment} icon={Plus} tone="soft" style={wide ? styles.fit : undefined} onPress={() => router.push('/investimento/novo')} /> : null}
              {moves ? <InvestmentPlanCard plan={plan.data ?? null} movements={moves} /> : null}
              <UpcomingDatesCard items={active} />
              <View style={{ gap: space[3] }}>
                <Txt variant="title" accessibilityRole="header" aria-level={2}>
                  Seus investimentos
                </Txt>
                {active.map((i) => (
                  <InvestmentCard key={i.id} investment={i} movements={moves} />
                ))}
              </View>
              <AllocationCard items={active} />
              {moves ? <IncomeCard movements={moves} /> : null}
              <FiscalCalendarCard items={active} />
              <InvestmentLinks showPlan={canWrite && plan.isSuccess && plan.data === null} />
              {closed.length > 0 ? (
                <View style={{ gap: space[3] }}>
                  <Txt variant="title" accessibilityRole="header" aria-level={2}>
                    {T.closedTitle}
                  </Txt>
                  {closed.map((i) => (
                    <InvestmentCard key={i.id} investment={i} movements={moves} />
                  ))}
                </View>
              ) : null}
            </>
          )}
          {/* Sem investimentos, a explicação do que a aba faz; depois, um aviso só no lugar dos quatro parecidos (revisão das telas). */}
          {list.data && all.length === 0 ? (
            <Txt variant="label" color={colors.textSecondary}>
              {T.intro}
            </Txt>
          ) : null}
          <Txt variant="caption" color={colors.textSecondary}>
            {T.closingNote}
          </Txt>
          <View style={styles.privacy}>
            <ShieldCheck size={18} color={colors.textSecondary} aria-hidden />
            <Txt variant="label" color={colors.textSecondary} style={{ flex: 1 }}>
              {T.whoSees}
            </Txt>
          </View>
        </Body>
      </Screen>
      {howOpen ? <HowCalculatedSheet totals={portfolioTotals(active)} onClose={() => setHowOpen(false)} /> : null}
    </View>
  );
}

/**
 * Card azul (D-103): o total, de quando são os valores (a data mais antiga e a mais recente), o aportado, o ganho em reais e, logo depois,
 * a porcentagem sobre o investido. Tocar no total abre o desempenho. Quem não tem atualização no mês aparece pelo nome, e "Como a conta é
 * feita" abre a folha que explica cada número. Tudo vem da lista (os totais de cada investimento), então o card continua mesmo se os
 * movimentos não carregarem.
 */
function Summary({ active, onHow }: { active: readonly Investment[]; onHow: () => void }) {
  const { today } = useSession();
  const maskLabel = useMoneyLabelMask();
  const t = portfolioTotals(active);
  const share = gainOverInvested(t.gainCents, t.depositsCents);
  const dates = portfolioValueDates(active, today);
  const shareText = share !== null ? HOW_CALC_TEXT.onInvested(share) : null;
  return (
    <View style={styles.blue}>
      <Txt variant="title" color={colors.textOnBrand} accessibilityRole="header" aria-level={2}>
        {T.totalTitle}
      </Txt>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={maskLabel(`${formatBRL(t.valueCents)}. ${T.gain(t.gainCents)}${shareText ? `, ${shareText}` : ''}. ${PERFORMANCE_TEXT.open}`)}
        accessibilityHint={PERFORMANCE_TEXT.openHint}
        onPress={() => router.push('/investimento/desempenho')}
        style={(st) => [{ gap: space[2] }, st.pressed && { opacity: 0.85 }, (st as { focused?: boolean }).focused && ui.focusRingOnBrand]}>
        <MoneyTxt fit color={colors.textOnBrand} style={[tabular, styles.big]}>
          {formatBRL(t.valueCents)}
        </MoneyTxt>
        <Txt variant="caption" color={colors.textOnBrandSoft}>
          {TAB_VALUE_DATE_TEXT.card(dates)}
        </Txt>
        <InvestmentTotalsLines depositsCents={t.depositsCents} withdrawalsCents={t.withdrawalsCents} incomeCents={t.incomeCents} gainCents={t.gainCents} onBrand />
        {shareText ? (
          <Txt variant="label" color={colors.textOnBrand}>
            {shareText}
          </Txt>
        ) : null}
        <View style={styles.openRow}>
          <Txt variant="label" color={colors.textOnBrand} style={{ fontFamily: fonts.bold, fontSize: 15, flexShrink: 1 }}>
            {PERFORMANCE_TEXT.open}
          </Txt>
          <ChevronRight size={18} color={colors.textOnBrand} aria-hidden />
        </View>
      </Pressable>
      {dates.notThisMonth.length > 0 ? (
        <Txt variant="caption" color={colors.textOnBrandSoft}>
          {TAB_VALUE_DATE_TEXT.notThisMonth(dates.notThisMonth)}
        </Txt>
      ) : null}
      <View style={styles.sep} />
      <Button label={HOW_CALC_TEXT.open} icon={CircleQuestionMark} tone="onBrand" compact accessibilityHint={HOW_CALC_TEXT.openHint} onPress={onHow} style={{ alignSelf: 'flex-start' }} />
    </View>
  );
}

/**
 * O mesmo card no computador (revisão visual de 23/11/2026: era um segundo bloco azul logo abaixo da faixa azul da aba, com o texto todo
 * nos 300 px da esquerda): um cartão branco, como os de baixo, com o total e as datas à esquerda e o aportado, o ganho e a porcentagem
 * num bloco claro à direita. Os mesmos textos, os mesmos nomes acessíveis e o mesmo "Como a conta é feita".
 */
function SummaryWide({ active, onHow }: { active: readonly Investment[]; onHow: () => void }) {
  const { today } = useSession();
  const maskLabel = useMoneyLabelMask();
  const t = portfolioTotals(active);
  const share = gainOverInvested(t.gainCents, t.depositsCents);
  const dates = portfolioValueDates(active, today);
  const shareText = share !== null ? HOW_CALC_TEXT.onInvested(share) : null;
  return (
    <Card style={{ gap: space[3] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {T.totalTitle}
      </Txt>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={maskLabel(`${formatBRL(t.valueCents)}. ${T.gain(t.gainCents)}${shareText ? `, ${shareText}` : ''}. ${PERFORMANCE_TEXT.open}`)}
        accessibilityHint={PERFORMANCE_TEXT.openHint}
        onPress={() => router.push('/investimento/desempenho')}
        style={(st) => [styles.wideRow, st.pressed && { opacity: 0.85 }, (st as { focused?: boolean }).focused && ui.focusRing]}>
        <View style={styles.wideMain}>
          <MoneyTxt fit style={[tabular, styles.big]}>{formatBRL(t.valueCents)}</MoneyTxt>
          <Txt variant="caption" color={colors.textSecondary}>
            {TAB_VALUE_DATE_TEXT.card(dates)}
          </Txt>
          <View style={styles.openRow}>
            <Txt variant="label" color={colors.brandText} style={{ fontFamily: fonts.bold, fontSize: 15, flexShrink: 1 }}>
              {PERFORMANCE_TEXT.open}
            </Txt>
            <ChevronRight size={18} color={colors.brandText} aria-hidden />
          </View>
        </View>
        <View style={styles.wideTile}>
          <InvestmentTotalsLines depositsCents={t.depositsCents} withdrawalsCents={t.withdrawalsCents} incomeCents={t.incomeCents} gainCents={t.gainCents} />
          {shareText ? <Txt variant="label">{shareText}</Txt> : null}
        </View>
      </Pressable>
      {dates.notThisMonth.length > 0 ? (
        <Txt variant="caption" color={colors.textSecondary}>
          {TAB_VALUE_DATE_TEXT.notThisMonth(dates.notThisMonth)}
        </Txt>
      ) : null}
      <View style={styles.sepLight} />
      {/* O ícone alinhado com o texto do cartão (o botão tem 12 px de folga dos lados). */}
      <Button label={HOW_CALC_TEXT.open} icon={CircleQuestionMark} tone="ghost" compact accessibilityHint={HOW_CALC_TEXT.openHint} onPress={onHow} style={{ alignSelf: 'flex-start', marginLeft: -space[3] }} />
    </Card>
  );
}

/** Uma linha da lista: nome, tipo, valor, ganho e de quando é o valor (D-103, item 1). */
function InvestmentCard({ investment: i, movements }: { investment: Investment; movements: readonly InvestmentMovement[] | null }) {
  const maskLabel = useMoneyLabelMask();
  const { today } = useSession();
  const gain = investmentGain(i);
  // Com os movimentos, a origem e o que veio depois da atualização; sem eles (falha ao carregar), só a data que vem na lista.
  const stamp = movements
    ? investmentValueStamp(
        movements.filter((m) => m.investmentId === i.id),
        today,
      )
    : { on: i.lastValueOn, source: { kind: 'extrato' as const }, depositsAfter: false, withdrawalsAfter: false };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={maskLabel(`${i.name}, ${investmentCaption(i)}: ${formatBRL(i.valueCents)}. ${T.gain(gain)}.`)}
      accessibilityHint="Abre o investimento"
      onPress={() => router.push({ pathname: '/investimento/[id]', params: { id: i.id } })}
      style={(st) => [ui.card, { gap: space[1] }, st.pressed && { opacity: 0.85 }, (st as { focused?: boolean }).focused && ui.focusRing]}>
      <View style={styles.row}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 16 }}>
            {i.name}
          </Txt>
          <Txt variant="caption" color={colors.textSecondary}>
            {investmentCaption(i)}
          </Txt>
        </View>
        <MoneyTxt fit variant="label" style={[tabular, { fontFamily: fonts.extrabold }]}>
          {formatBRL(i.valueCents)}
        </MoneyTxt>
        <ChevronRight size={20} color={colors.textSecondary} aria-hidden />
      </View>
      <MoneyTxt variant="caption" color={colors.text}>
        {T.gain(gain)}
      </MoneyTxt>
      <Txt variant="caption" color={colors.textSecondary}>
        {TAB_VALUE_DATE_TEXT.row(stamp)}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  blue: { backgroundColor: colors.brand, borderRadius: radius.lg, padding: space[5], gap: space[2] },
  big: { fontFamily: fonts.extrabold, fontSize: 28, lineHeight: 36 },
  sep: { height: 1, backgroundColor: colors.onBrandLine, marginVertical: space[1] },
  sepLight: { height: 1, backgroundColor: colors.border },
  wideRow: { flexDirection: 'row', alignItems: 'center', gap: space[6], borderRadius: radius.sm },
  wideMain: { flex: 1, minWidth: 0, gap: space[1] },
  wideTile: { width: 260, backgroundColor: colors.background, borderRadius: radius.md, paddingVertical: space[3], paddingHorizontal: space[4], gap: space[1] },
  // Botão que cabe no texto, à esquerda (computador): não ocupa a largura toda, como no celular.
  fit: { alignSelf: 'flex-start', minWidth: 220 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 44 },
  privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2] },
});
