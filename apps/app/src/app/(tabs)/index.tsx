import { BUSINESS_WORDS, COMMITTED_TEXT, ERROR_TEXT, SUMMARY_NAV_TEXT, businessMonth, committedLine, emptyMonthCaption, formatMonthBR, monthOf, payablesMonthParams, toPayCaption } from '@clarevo/core';
import { router, useFocusEffect } from 'expo-router';
import { ArrowRight, CalendarClock, CalendarX, ChevronRight, Plus, ShieldCheck } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View, type ScrollView } from 'react-native';
import Animated, { FadeIn, FadeInLeft, FadeInRight, FadeOut, ReduceMotion } from 'react-native-reanimated';

import { AccessBanner } from '@/components/access-parts';
import { BudgetCelebrationCard } from '@/components/budget-celebration';
import { BudgetPanel, GoalsPanel } from '@/components/resumo-wide';
import { LevelUpCard } from '@/components/level-parts';
import { NoticeClaim, NoticeQueue } from '@/components/notice-queue';
import { WIDE_CONTENT_MAX, useWideLayout } from '@/lib/layout';
import { LegalChangeNotice } from '@/components/legal-notice';
import { Meter, useMoneyMask } from '@/components/committed-parts';
import { FlashBanner, useFlash } from '@/components/flash';
import { AppHeader, ContextSwitch, MonthSwitcher } from '@/components/header';
import { MoneyTxt } from '@/components/money-text';
import { PrimeirosPassos, type PrimeirosPassosState } from '@/components/primeiros-passos';
import { RecordRow } from '@/components/record-row';
import { ReturnBand, useReturnBand } from '@/components/retorno-faixa';
import { SignupSourceCard } from '@/components/signup-source';
import { EmptyState, ErrorState } from '@/components/states';
import { ExtraSavingsCard } from '@/components/extra-savings';
import { SummaryShortcuts } from '@/components/resumo-atalhos';
import { WelcomeTour } from '@/components/tour';
import { Body, Button, Card, FitMoney, LinkButton, Money, Screen, Skeleton, Txt } from '@/components/ui';
import { totalChange, type TotalChange } from '@/lib/highlight';
import { explanationHref, topicBySlug } from '@/lib/learn';
import { BusinessSummaryCard } from '@/components/business-parts';
import { summaryTop } from '@/lib/nav';
import { maskMoneyLabel, moneyA11y, moneyText, useValuesHidden } from '@/lib/privacy';
import { useCards, useCommitments, useCommittedSummary, useMonthRecords, useSpace, useWork, useView, type SpaceKind } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, motion, radius, space, tabular } from '@/theme/tokens';

export default function ResumoScreen() {
  const { today } = useSession();
  const { space: kind, month, currentMonth, monthDirection } = useView();
  const narrow = useWindowDimensions().width < 360;
  const hidden = useValuesHidden();
  const [notice, setNotice] = useFlash();
  const work = useWork().data;
  const contextId = work?.contextId;
  const canWrite = work?.canWrite ?? true;
  const wide = useWideLayout();
  const records = useMonthRecords(contextId, month);
  const s = records.summary;
  const monthName = formatMonthBR(month);
  // "Nada anotado em junho." (e variações): só em meses fechados, como uma linha a mais no cabeçalho (D-030(6)).
  const emptyCaption = s ? emptyMonthCaption(s, month, currentMonth) : null;
  // Faixa "Seus últimos meses" (D-030): só no Pessoal e no mês atual, no lugar dos avisos temporários.
  const band = useReturnBand(kind === 'pessoal' && month === currentMonth ? contextId : undefined);
  // "Como você conheceu o Clarevo?" (D-067): o último da fila de avisos temporários, depois de "Seus últimos meses" e de "Primeiros passos".
  const [stepsState, setStepsState] = useState<PrimeirosPassosState>('carregando');

  // "Ver resumo do mês" volta a este Resumo, que continua na pilha: mostrar do topo, com os totais à vista.
  // Voltar com "Voltar" mantém a posição da rolagem.
  const scroll = useRef<ScrollView>(null);
  useFocusEffect(
    useCallback(() => {
      if (summaryTop.take()) scroll.current?.scrollTo({ y: 0, animated: false });
    }, []),
  );

  // Efeito do último registro salvo ("+ R$ 80,00"), mostrado por alguns segundos e anunciado uma vez.
  const [change, setChange] = useState<(TotalChange & { kind: SpaceKind }) | null>(null);
  useFocusEffect(
    useCallback(() => {
      const c = totalChange.take(month);
      if (c) setChange({ ...c, kind });
    }, [month, kind]),
  );
  useEffect(() => {
    if (!change) return;
    const t = setTimeout(() => setChange(null), 3200);
    return () => clearTimeout(t);
  }, [change]);
  // Só no mês e no contexto do registro: trocar de mês ou de contexto antes de o destaque sumir não leva o "+ R$" para outro lugar.
  const shownChange = change && change.month === month && change.kind === kind ? change : null;

  // Espaço Negócio (auditoria de 18/11/2026): entradas e saídas, como em "Seu negócio". Num mês com retirada para o Pessoal, o total da
  // direita inclui as retiradas (o dinheiro saiu do negócio) e o rótulo diz isso.
  const inBusiness = kind === 'negocio';
  const withdrawn = inBusiness && contextId && records.data ? businessMonth(records.data, contextId, month).withdrawnCents > 0 : false;
  const words = {
    left: inBusiness ? (withdrawn ? BUSINESS_WORDS.kept : BUSINESS_WORDS.left) : 'Diferença do mês',
    leftCaption: inBusiness ? BUSINESS_WORDS.leftCaption(month, today, withdrawn) : SUMMARY_NAV_TEXT.differenceCaption(month, today),
    leftCaptionA11y: inBusiness ? BUSINESS_WORDS.leftCaptionA11y(month, today, withdrawn) : SUMMARY_NAV_TEXT.differenceCaptionA11y(month, today),
    negative: inBusiness ? BUSINESS_WORDS.negative : 'Pagamentos acima dos recebimentos no período',
    in: inBusiness ? BUSINESS_WORDS.in : 'Recebido',
    out: inBusiness ? (withdrawn ? BUSINESS_WORDS.outWithWithdrawals : BUSINESS_WORDS.out) : 'Pago',
    inHint: inBusiness ? BUSINESS_WORDS.inHint : SUMMARY_NAV_TEXT.receivedHint,
    outHint: inBusiness ? BUSINESS_WORDS.outHint : SUMMARY_NAV_TEXT.paidHint,
    add: inBusiness ? BUSINESS_WORDS.addOut : 'Anotar gasto',
    outsTitle: inBusiness ? BUSINESS_WORDS.outsTitle : 'Pagamentos do mês',
    noOuts: inBusiness ? BUSINESS_WORDS.noOuts(month) : `Nenhum pagamento em ${monthName.toLowerCase()}`,
    noOutsBody: inBusiness ? BUSINESS_WORDS.noOutsBody : 'Anote um gasto já pago para ver o efeito no mês.',
  };

  // Troca de mês desliza na direção escolhida; troca de contexto só esmaece (CL-V008).
  const entering = (monthDirection > 0 ? FadeInRight : FadeInLeft).duration(motion.context).reduceMotion(ReduceMotion.System);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Screen wide scrollRef={scroll}>
        {/* No computador, o seletor de espaço sobe para a linha de "Ocultar valores" (pedido do Enzo, 23/11/2026). */}
        <AppHeader wide={wide} topStart={wide ? <ContextSwitch /> : undefined}>
          {wide ? null : <ContextSwitch />}
          <MonthSwitcher titleLevel={1} />

          <Animated.View key={`${kind}-${month}`} entering={entering} style={[styles.heroContent, wide && styles.heroContentWide]}>
            {records.isPending ? (
              wide ? (
                // No computador, o carregamento tem o formato do cartão pronto (valor à esquerda, dois blocos à direita), para nada pular.
                <View accessibilityRole="progressbar" accessibilityLabel="Carregando o resumo" style={styles.skeletonWide}>
                  {/* A mesma altura da coluna pronta (rótulo, valor e legenda: 84 px). */}
                  <View style={[styles.heroMain, { gap: space[2] }]}>
                    <Skeleton width={160} height={18} onBrand />
                    <Skeleton width="70%" height={36} onBrand />
                    <Skeleton width="85%" height={14} onBrand />
                  </View>
                  <View style={[styles.split, styles.splitWide]}>
                    <Skeleton width={164} height={TILE_HEIGHT} onBrand style={{ borderRadius: radius.md }} />
                    <Skeleton width={164} height={TILE_HEIGHT} onBrand style={{ borderRadius: radius.md }} />
                  </View>
                </View>
              ) : (
                <View accessibilityRole="progressbar" accessibilityLabel="Carregando o resumo" style={{ gap: space[3] }}>
                  <Skeleton width={160} height={20} onBrand />
                  <Skeleton width="70%" height={40} onBrand />
                  <Skeleton width="85%" height={14} onBrand />
                  <View style={styles.split}>
                    <Skeleton width={110} height={36} onBrand />
                    <Skeleton width={110} height={36} onBrand />
                  </View>
                </View>
              )
            ) : records.isError || !s ? (
              <View style={wide ? { flex: 1 } : undefined}>
                <ErrorState message="Não foi possível carregar o resumo." onRetry={() => records.refetch()} onBrand />
              </View>
            ) : (
              <>
                {/* No computador, a diferença do mês à esquerda e Recebido e Pago em dois blocos à direita, na mesma linha. */}
                <View style={wide ? styles.heroMain : undefined}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${words.left}, ${moneyA11y(s.differenceCents, hidden)}. ${words.leftCaptionA11y}`}
                  accessibilityHint="Mostra os registros que compõem o total"
                  onPress={() => router.push({ pathname: '/composicao', params: { tipo: 'diferenca' } })}
                  style={(st) => (st as { focused?: boolean }).focused && styles.focusOnBrand}>
                  <Txt variant="label" color={colors.textOnBrand} style={styles.heroLabel}>
                    {words.left}
                  </Txt>
                  <FitMoney cents={s.differenceCents} color={colors.textOnBrand} />
                  <Txt variant="caption" color={colors.textOnBrandSoft}>
                    {words.leftCaption}
                  </Txt>
                  {/* Com valores ocultos, o valor aparece sem sinal (R$ ••••): a frase do negativo também some, para não revelar o sinal. */}
                  {s.differenceCents < 0 && !hidden ? (
                    <Txt variant="caption" color={colors.textOnBrand} style={{ fontFamily: fonts.bold }}>
                      {words.negative}
                    </Txt>
                  ) : null}
                </Pressable>
                {/* Fora da área tocável, para o leitor de tela ler a linha. Mês sem anotação não é mês sem gastos. */}
                {emptyCaption ? (
                  <Txt variant="caption" color={colors.textOnBrand} style={{ fontFamily: fonts.bold, marginTop: space[1] }}>
                    {emptyCaption}
                  </Txt>
                ) : null}
                </View>
                <View style={[styles.split, wide && styles.splitWide]}>
                  <TotalItem
                    label={words.in}
                    tile={wide}
                    cents={s.receivedCents}
                    change={shownChange?.total === 'recebido' ? shownChange.deltaCents : null}
                    hint={words.inHint}
                    onPress={() => router.push({ pathname: '/composicao', params: { tipo: 'recebido' } })}
                  />
                  <TotalItem
                    label={words.out}
                    tile={wide}
                    cents={s.paidCents}
                    alignEnd={!narrow && !wide}
                    change={shownChange?.total === 'pago' ? shownChange.deltaCents : null}
                    hint={words.outHint}
                    onPress={() => router.push({ pathname: '/composicao', params: { tipo: 'pago' } })}
                  />
                </View>
              </>
            )}
          </Animated.View>
        </AppHeader>

        <Body style={wide ? { maxWidth: WIDE_CONTENT_MAX } : undefined}>
          {/* Versão para computador (pedido do Enzo em 12/11/2026): o Resumo vira um painel, com metas e orçamento na coluna da direita. */}
          <View style={wide ? styles.dashboard : styles.stack}>
          <View style={wide ? styles.mainCol : styles.stack}>
          {/*
            "Anotar gasto" sempre logo abaixo do cabeçalho azul (D-039), como na tela original aprovada, em qualquer estado.
            Os avisos temporários (Primeiros passos, Seus últimos meses, confirmações) vêm depois dele, um por vez, sem mudar a
            ordem dos blocos aprovados: a faixa "Seus últimos meses" tem precedência; o card de Primeiros passos espera a
            revisão carregar e volta quando a faixa some (conta nova nunca vê a faixa). A pergunta opcional "Como você conheceu o
            Clarevo?" é a última da fila: só em conta real, a partir do dia seguinte ao primeiro dia de uso e quando nenhum dos
            dois está na tela.
          */}
          {canWrite && !wide ? (
            <Button label={words.add} icon={Plus} onPress={() => router.push({ pathname: '/registro/novo', params: { tipo: 'despesa' } })} />
          ) : null}
          <FlashBanner message={notice} />
          {/*
            Fila dos avisos temporários (pedido do Enzo em 12/11/2026, `components/notice-queue.tsx`): um por vez, nesta ordem:
            "Seus últimos meses", "Primeiros passos", a comemoração do nível, o mês dentro do orçamento e "Como você conheceu a
            Clarevo?". Os avisos da assinatura e dos termos e o lembrete de valor extra ficam fora da fila e aparecem sempre. A fila
            espera a faixa e os Primeiros passos carregarem.
          */}
          <NoticeQueue hold={band.status === 'pendente' || (band.status === 'oculta' && stepsState === 'carregando')}>
          <NoticeClaim id="retorno" wants={band.status === 'visivel'} />
          <NoticeClaim id="passos" wants={band.status === 'oculta' && stepsState === 'visivel'} />
          {/* Assinatura (D-083): nos últimos dias do teste grátis e em só ver e exportar, o aviso com o atalho para os planos. */}
          <AccessBanner />
          {/* Níveis de conta (D-095): a comemoração da troca de nível, uma vez por nível em cada aparelho. */}
          <LevelUpCard />
          {/* O mês que fechou dentro do orçamento, nos primeiros dias do mês seguinte (só no Pessoal, no mês de hoje). */}
          <BudgetCelebrationCard contextId={contextId} eligible={kind === 'pessoal' && month === currentMonth} />
          {/* Mudança anunciada dos termos e da política (A5): só enquanto a próxima versão não vale. */}
          <LegalChangeNotice />
          {band.status === 'visivel' ? <ReturnBand band={band} onMovedOn={(text) => setNotice(text)} /> : null}
          {band.status === 'oculta' ? <PrimeirosPassos contextId={contextId} onState={setStepsState} /> : null}
          {band.status === 'oculta' ? (
            <SignupSourceCard eligible={kind === 'pessoal' && month === currentMonth} blocked={stepsState !== 'oculto'} onSaved={(text) => setNotice(text)} />
          ) : null}
          {band.status === 'oculta' ? (
            <ExtraSavingsCard contextId={contextId} month={month} eligible={kind === 'pessoal' && month === currentMonth} records={records.data} onNotice={(text) => setNotice(text)} />
          ) : null}
          </NoticeQueue>

          <>
            {/* Espaço Negócio (D-113): só com o negócio escolhido; o Resumo do Pessoal e da Família não muda. No computador, o card vai para a
                coluna da direita, para as duas colunas terem alturas parecidas (auditoria de 18/11/2026). */}
            {kind === 'negocio' && contextId && !wide ? <BusinessSummaryCard contextId={contextId} month={month} records={records.data} canWrite={canWrite} /> : null}
            <ToPayCard contextId={contextId} canWrite={canWrite} />

              <Card>
                <View style={styles.cardHead}>
                  <Txt variant="title" accessibilityRole="header" aria-level={2}>
                    {words.outsTitle}
                  </Txt>
                  <LinkButton label="Ver todos" onPress={() => router.push({ pathname: '/composicao', params: { tipo: 'pago' } })} />
                </View>
                {records.isPending ? (
                  <View style={{ gap: space[3], paddingVertical: space[2] }}>
                    <Skeleton width="100%" height={44} />
                    <Skeleton width="100%" height={44} />
                  </View>
                ) : records.isError || !s ? (
                  <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => records.refetch()} />
                ) : s.composition.paid.length === 0 ? (
                  <EmptyState title={words.noOuts}>{words.noOutsBody}</EmptyState>
                ) : (
                  s.composition.paid
                    .slice(0, 3)
                    .map((r, i, arr) => <RecordRow key={r.id} record={r} last={i === arr.length - 1} onPress={() => router.push(`/registro/${r.id}`)} />)
                )}
              </Card>
              {/* Atalhos (D-105): as Análises e o calendário do mês e, no Pessoal, Investir em um toque. Sem título: os blocos aprovados seguem
                  na ordem. No computador, o cartão abre a coluna da direita, à vista sem rolar. */}
              {wide ? null : <SummaryShortcuts contextId={contextId} month={month} currentMonth={currentMonth} personal={kind === 'pessoal'} />}
              {/* No computador, o orçamento fica na coluna principal, abaixo de "Pagamentos do mês" (auditoria de 18/11/2026: a coluna da
                  esquerda acabava em Pagamentos e deixava um bloco vazio grande). */}
              {wide && kind === 'pessoal' ? <BudgetPanel contextId={contextId} month={month} /> : null}
          </>

          </View>
          <View style={wide ? styles.sideCol : styles.stack}>
          {wide ? <SummaryShortcuts contextId={contextId} month={month} currentMonth={currentMonth} personal={kind === 'pessoal'} /> : null}
          {wide && kind === 'negocio' && contextId ? <BusinessSummaryCard contextId={contextId} month={month} records={records.data} canWrite={canWrite} /> : null}
          {wide && kind !== 'negocio' ? <GoalsPanel contextId={contextId} /> : null}
          {wide ? null : <SummaryEnd />}
          </View>
          </View>
          {/* No computador, o cartão lima e "Quem vê estes dados?" numa linha inteira, abaixo das duas colunas. */}
          {wide ? (
            <View style={styles.wideEnd}>
              <SummaryEnd />
            </View>
          ) : null}
        </Body>
      </Screen>
      {/* Tour de boas-vindas (D-049(2)): um modal na primeira entrada, sem mudar a estrutura do Resumo. */}
      <WelcomeTour personal={kind === 'pessoal'} contextId={contextId} />
    </View>
  );
}

/** O fim do Resumo: o cartão lima e "Quem vê estes dados?". */
function SummaryEnd() {
  return (
    <>
      <LearnCard />
      <Pressable accessibilityRole="button" onPress={() => router.push('/quem-ve')} style={styles.privacy} hitSlop={8}>
        <ShieldCheck size={18} color={colors.textSecondary} />
        <Txt variant="label" color={colors.textSecondary}>
          Quem vê estes dados?
        </Txt>
      </Pressable>
    </>
  );
}

/**
 * O cartão lima do fim do Resumo: o tema de Aprender que mais ajuda agora (revisão das telas, 16/11/2026). Com cartão de crédito, "Fatura
 * sem contar duas vezes"; sem cartão, "Diferença do mês e saldo da conta". O título e a legenda são os do próprio tema. Enquanto os
 * cartões carregam, fica o da fatura, como era antes.
 */
function LearnCard() {
  const space = useSpace();
  const cards = useCards(space.data?.personalContextId);
  const slug = cards.isSuccess && !cards.data.some((c) => c.status === 'ativo') ? 'saldo' : 'fatura';
  const topic = topicBySlug(slug);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(explanationHref(slug))}
      style={(st) => [styles.learn, st.pressed && { opacity: 0.85 }]}>
      <View style={{ flex: 1 }}>
        <Txt variant="label" color={colors.textOnAccent} style={{ fontFamily: fonts.extrabold, fontSize: 17 }}>
          {topic?.title}
        </Txt>
        <Txt variant="caption" color={colors.textOnAccent}>
          {topic?.subtitle}
        </Txt>
      </View>
      <ArrowRight size={22} color={colors.textOnAccent} />
    </Pressable>
  );
}

/**
 * "Ainda a pagar" (D-021): rótulo fora da área tocável, resumo tocável que abre /a-pagar e,
 * como irmão (nunca dentro), o link "Anotar conta a pagar". Falha de carga nunca vira R$ 0,00.
 */
function ToPayCard({ contextId, canWrite }: { contextId: string | undefined; canWrite: boolean }) {
  const { today } = useSession();
  const { month, currentMonth, space: kind } = useView();
  const hidden = useValuesHidden();
  const commitments = useCommitments(contextId, month);
  const s = commitments.summary;
  const isCurrent = month === currentMonth;
  const monthName = formatMonthBR(month).toLowerCase();
  const label = isCurrent ? 'Ainda a pagar neste mês' : `Previsto para ${monthName}`;
  const caption = s ? toPayCaption(s, today) : null;
  // Todas as que compõem o total já venceram: a linha principal leva o mesmo destaque da linha de vencidas.
  const allOverdue = Boolean(s && s.isCurrentMonth && s.overdueCount > 0 && s.overdueCount === s.items.length);
  // Total zero é um total conhecido: mostra R$ 0,00 e explica por quê. Uma conta de mês futuro paga adiantada
  // aparece nas pagas do mês, mas não era deste mês: não conta para "todas foram pagas".
  const zeroText = !s
    ? null
    : !s.hasAny
      ? 'Nenhuma conta a pagar em aberto.'
      : s.paidInMonth.some((c) => monthOf(c.dueOn) <= month)
        ? isCurrent
          ? 'Todas as contas a pagar deste mês foram pagas.'
          : `Todas as contas a pagar de ${monthName} foram pagas.`
        : isCurrent
          ? 'Nenhuma conta a pagar vence neste mês.'
          : `Nenhuma conta a pagar em aberto com vencimento em ${monthName}.`;
  const a11y = !s
    ? label
    : caption?.main
      ? `${label}, ${moneyA11y(s.toPayCents, hidden)}. ${caption.main}.${caption.overdue ? ` ${caption.overdue}.` : ''}${caption.includes ? ` ${maskMoneyLabel(caption.includes, hidden)}` : ''}${caption.estimated ? ` ${maskMoneyLabel(caption.estimated, hidden)}` : ''}`
      : `${label}, ${moneyA11y(s.toPayCents, hidden)}. ${zeroText}`;

  return (
    <Card style={{ gap: space[2] }}>
      <View style={styles.toPayHead}>
        <Txt variant="label" color={colors.textSecondary} style={{ flexShrink: 1 }}>
          {label}
        </Txt>
        {/* Mesmo padrão do "Ver todos" de "Pagamentos do mês": abre a lista do mês que o card mostra. */}
        <LinkButton
          label={SUMMARY_NAV_TEXT.viewPayables}
          accessibilityLabel={SUMMARY_NAV_TEXT.viewPayablesA11y}
          trailing={ChevronRight}
          style={styles.viewPayables}
          onPress={() => router.push({ pathname: '/a-pagar', params: payablesMonthParams(month, currentMonth) })}
        />
      </View>
      {commitments.isPending ? (
        <Skeleton width={140} height={28} />
      ) : commitments.isError || !s || !caption ? (
        <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => commitments.refetch()} />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={a11y}
          accessibilityHint="Abre as contas a pagar"
          onPress={() => router.push({ pathname: '/a-pagar', params: payablesMonthParams(month, currentMonth) })}
          style={(st) => [styles.toPayArea, st.pressed && { opacity: 0.7 }, (st as { focused?: boolean }).focused && styles.focusRing]}>
          <View style={{ flex: 1, gap: space[1] }}>
            <Money cents={s.toPayCents} />
            {/* Contas vencidas em texto neutro, em negrito, com um calendário (D-030: a cor de erro fica só para falhas ao salvar; regra de
                não usar cor de alerta em dinheiro; auditoria de 18/11/2026). Antes, ícone de alerta e cor de erro (D-021 item 11). */}
            {allOverdue && caption.main ? (
              <View style={styles.overdueRow}>
                <CalendarX size={16} color={colors.text} aria-hidden />
                <Txt variant="caption" color={colors.text} style={{ fontFamily: fonts.bold, flexShrink: 1 }}>
                  {caption.main}
                </Txt>
              </View>
            ) : (
              <Txt variant="caption" color={colors.textSecondary}>
                {caption.main ?? zeroText}
              </Txt>
            )}
            {caption.overdue ? (
              <View style={styles.overdueRow}>
                <CalendarX size={16} color={colors.text} aria-hidden />
                <Txt variant="caption" color={colors.text} style={{ fontFamily: fonts.bold }}>
                  {caption.overdue}
                </Txt>
              </View>
            ) : null}
            {caption.includes ? <MoneyTxt variant="caption">{caption.includes}</MoneyTxt> : null}
            {/* Gastos fixos que mudam de valor (luz, água): parte do total é a referência, ainda estimada. */}
            {caption.estimated ? <MoneyTxt variant="caption">{caption.estimated}</MoneyTxt> : null}
            <Txt variant="caption" color={colors.textSecondary}>
              Valores previstos, separados do que já foi pago.
            </Txt>
          </View>
          <CalendarClock size={22} color={colors.textSecondary} aria-hidden />
        </Pressable>
      )}
      {/* A renda comprometida é do Pessoal e da Família: no negócio, não aparece (auditoria de 18/11/2026). */}
      {kind === 'negocio' ? null : <CommittedRow contextId={contextId} />}
      {canWrite ? <LinkButton label="Anotar conta a pagar" icon={Plus} style={styles.toPayLink} onPress={() => router.push('/a-pagar/nova')} /> : null}
    </Card>
  );
}

/**
 * "Renda comprometida" (D-026(7)): linha dentro do card "Ainda a pagar", irmã do resumo tocável e do link "Anotar conta a
 * pagar" (nunca dentro de um deles), com área tocável própria que abre /renda-comprometida no mês em exibição. Sem
 * referência de renda: só o convite. Mês sem contas: "0,0%" com a explicação. Falha de carga: erro com "Tentar de novo",
 * nunca 0%. Os valores em reais do nome acessível seguem "Ocultar valores".
 */
function CommittedRow({ contextId }: { contextId: string | undefined }) {
  const { month } = useView();
  const committed = useCommittedSummary(contextId, month);
  const mask = useMoneyMask();
  const s = committed.data;
  if (committed.isPending) {
    return (
      <View style={styles.committed}>
        <Skeleton width="100%" height={44} />
      </View>
    );
  }
  if (committed.isError || !s) {
    return (
      <View style={styles.committed}>
        <ErrorState message={COMMITTED_TEXT.loadError} onRetry={() => committed.refetch()} />
      </View>
    );
  }
  const line = committedLine(s);
  return (
    <View style={styles.committed}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={mask.label(line.a11yLabel)}
        onPress={() => router.push({ pathname: '/renda-comprometida', params: { mes: month } })}
        style={(st) => [styles.committedArea, st.pressed && { opacity: 0.7 }, (st as { focused?: boolean }).focused && styles.focusRing]}>
        {line.kind === 'sem_referencia' ? (
          <Txt variant="label" style={{ fontFamily: fonts.bold, flex: 1 }}>
            {line.title}
          </Txt>
        ) : (
          <View style={{ flex: 1, gap: space[1] }}>
            <View style={styles.committedHead}>
              <Txt variant="label" color={colors.textSecondary} style={{ flexShrink: 1 }}>
                {line.title}
              </Txt>
              <Txt variant="label" style={[styles.committedValue, tabular]}>
                {line.value}
              </Txt>
            </View>
            <Meter paidPermille={line.meter.paidPermille} openPermille={line.meter.openPermille} over={line.meter.over} height={8} />
            {line.caption ? (
              <Txt variant="caption" color={colors.textSecondary}>
                {line.caption}
              </Txt>
            ) : null}
          </View>
        )}
        <ChevronRight size={20} color={colors.textSecondary} aria-hidden />
      </Pressable>
    </View>
  );
}

/** Recebido/Pago no topo. Depois de salvar, mostra por alguns segundos o efeito do registro. */
function TotalItem({
  label,
  cents,
  change,
  alignEnd,
  tile,
  hint,
  onPress,
}: {
  label: string;
  cents: number;
  change: number | null;
  alignEnd?: boolean;
  /** Computador: um bloco azul mais escuro, com folga em volta (pedido do Enzo, 23/11/2026). */
  tile?: boolean;
  hint: string;
  onPress: () => void;
}) {
  const hidden = useValuesHidden();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${moneyA11y(cents, hidden)}`}
      accessibilityHint={hint}
      onPress={onPress}
      style={(st) => [
        styles.splitItem,
        alignEnd && { alignItems: 'flex-end' },
        tile && styles.tile,
        tile && ((st as { hovered?: boolean }).hovered || st.pressed) && styles.tileHover,
        (st as { focused?: boolean }).focused && styles.focusOnBrand,
      ]}>
      <View style={styles.totalLabelRow}>
        <Txt variant="caption" color={colors.textOnBrandSoft} style={{ fontFamily: fonts.bold }}>
          {label}
        </Txt>
        {/* Seta de "abre outra tela": desenho, o nome acessível continua "Recebido, R$ ..." / "Pago, R$ ...". */}
        <ChevronRight size={16} color={colors.textOnBrandSoft} strokeWidth={2.5} aria-hidden />
        {change !== null ? (
          <Animated.View
            entering={FadeIn.duration(motion.confirm).reduceMotion(ReduceMotion.System)}
            exiting={FadeOut.duration(motion.confirm).reduceMotion(ReduceMotion.System)}
            style={styles.changePill}
            accessibilityLiveRegion="polite"
            accessibilityLabel={`${change > 0 ? 'Mais' : 'Menos'} ${moneyA11y(Math.abs(change), hidden)} em ${label}`}>
            <Txt
              variant="caption"
              color={colors.textOnAccent}
              style={{ fontFamily: fonts.bold, fontSize: 12, lineHeight: 16 }}
              accessibilityLabel={hidden ? `${change > 0 ? 'mais' : 'menos'} ${moneyA11y(Math.abs(change), hidden)}` : undefined}>
              {change > 0 ? '+' : '−'} {moneyText(Math.abs(change), hidden)}
            </Txt>
          </Animated.View>
        ) : null}
      </View>
      <Money cents={cents} variant="label" color={colors.textOnBrand} style={styles.splitValue} />
    </Pressable>
  );
}

/** Altura do bloco Recebido ou Pago no computador (12 + legenda 18 + valor 26 + 12), usada no carregamento com o mesmo formato. */
const TILE_HEIGHT = 68;

const styles = StyleSheet.create({
  heroContent: { minHeight: 150, justifyContent: 'center' },
  heroLabel: { fontFamily: fonts.extrabold, fontSize: 18 },
  split: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space[4], columnGap: space[4], rowGap: space[2], flexWrap: 'wrap' },
  // Computador: a diferença à esquerda e os dois blocos à direita, centralizados na altura.
  heroContentWide: { flexDirection: 'row', alignItems: 'center', gap: space[6], minHeight: 0, marginTop: space[3] },
  heroMain: { flex: 1, minWidth: 0 },
  splitWide: { marginTop: 0, flexWrap: 'nowrap', justifyContent: 'flex-end', columnGap: space[3] },
  tile: { backgroundColor: colors.brandDeep, borderRadius: radius.md, paddingVertical: space[3], paddingHorizontal: space[4], minWidth: 164 },
  // Ao passar o mouse ou tocar, o bloco escurece (o branco translúcido clareava e baixava o contraste do texto).
  tileHover: { backgroundColor: colors.brandPressed },
  skeletonWide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[6] },
  splitItem: { minHeight: 44, justifyContent: 'center' },
  splitValue: { fontFamily: fonts.extrabold, fontSize: 18, lineHeight: 26 },
  totalLabelRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  stack: { gap: space[4] },
  dashboard: { flexDirection: 'row', alignItems: 'flex-start', gap: space[6] },
  mainCol: { flex: 3, minWidth: 0, gap: space[4] },
  sideCol: { flex: 2, minWidth: 0, gap: space[4] },
  wideEnd: { gap: space[4], marginTop: space[4] },
  changePill: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space[2], paddingVertical: 1 },
  focusOnBrand: { outlineWidth: 3, outlineColor: colors.accent, outlineStyle: 'solid', outlineOffset: 2 } as object,
  toPayArea: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3], minHeight: 44, borderRadius: radius.sm },
  overdueRow: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  toPayLink: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  // O link "Ver contas ›" fica numa linha só (até em 320 px); quem encolhe é o rótulo.
  viewPayables: { paddingHorizontal: 0, flexShrink: 0 },
  toPayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[2] },
  committed: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space[2], marginTop: space[1] },
  committedArea: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 44, paddingVertical: space[1], borderRadius: radius.sm },
  committedHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', columnGap: space[2], flexWrap: 'wrap' },
  committedValue: { fontFamily: fonts.extrabold, fontSize: 18, lineHeight: 24 },
  focusRing: { outlineWidth: 3, outlineColor: colors.brandText, outlineStyle: 'solid', outlineOffset: 2 } as object,
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[2], flexWrap: 'wrap' },
  learn: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: space[5],
    paddingHorizontal: space[6],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    minHeight: 72,
  },
  privacy: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: space[2], minHeight: 44 },
});
