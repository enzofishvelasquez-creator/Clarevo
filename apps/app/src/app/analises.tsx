import {
  ANALYSES_LINKS,
  ANALYSES_TEXT,
  PAYABLES_NAV_TEXT,
  analysesStartMonth,
  analysesStep,
  analysesTabFrom,
  formatMonthBR,
  monthOf,
  type AnalysesTab,
  type IsoMonth,
} from '@clarevo/core';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { AnalysesTabs, BudgetTab, CategoriesTab, EvolutionTab, TabError, TabLoading, UpcomingTab } from '@/components/analises-parts';
import { ContextPill, SubHeader } from '@/components/header';
import { MonthStepper } from '@/components/month-stepper';
import { LinkButton, Screen, Txt } from '@/components/ui';
import { announceOnIOS } from '@/lib/a11y';
import { useView, useWork } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

const T = ANALYSES_TEXT;

/**
 * Análises (D-059): tela de consulta, com a barra inferior (Movimentos marcada), com quatro abas internas: Categorias (completa, em
 * barras ou em bolhas), Evolução, Próximos meses e Orçamento (um resumo curto do mês e um botão para a tela completa). O seletor de
 * mês é local, do mais antigo até o mês de hoje (`?mes=AAAA-MM` abre em outro mês; `?aba=` escolhe a aba). Lê o contexto escolhido
 * (Pessoal ou Família) com as permissões do banco, e só lê: nada é gravado. Valores ocultos, leitor de tela e "reduzir movimento" seguem
 * o resto do app. A escolha "Barras | Bolhas" fica só no aparelho.
 */
export default function AnalisesScreen() {
  const { today } = useSession();
  const currentMonth = monthOf(today);
  const params = useLocalSearchParams<{ mes?: string; aba?: string }>();
  const { setMonth: setViewMonth } = useView();
  const [month, setMonth] = useState<IsoMonth>(() => analysesStartMonth(params.mes, currentMonth));
  const [tab, setTab] = useState<AnalysesTab>(() => analysesTabFrom(params.aba));
  // Entradas "de agora" (sem mês no endereço) abrem sempre no mês de hoje, mesmo com a tela já aberta.
  useEffect(() => {
    setMonth(analysesStartMonth(params.mes, currentMonth));
  }, [params.mes, currentMonth]);
  useEffect(() => {
    setTab(analysesTabFrom(params.aba));
  }, [params.aba]);

  const work = useWork();
  const contextId = work.data?.contextId;
  const canWrite = work.data?.canWrite ?? true;
  const prev = analysesStep(month, currentMonth, -1);
  const next = analysesStep(month, currentMonth, 1);

  // A categoria escolhida vale para este contexto e este mês: outro mês ou outro contexto começa sem escolha.
  const scope = `${contextId ?? ''}|${month}`;
  const [picked, setPicked] = useState<{ scope: string; key: string } | null>(null);
  const selectedKey = picked && picked.scope === scope ? picked.key : null;

  // Ao escolher uma categoria, o cartão dela aparece abaixo do gráfico: se ainda não está à vista, a tela rola até ele.
  const scroll = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const reduced = useReducedMotion();
  const { height: windowHeight } = useWindowDimensions();
  const [panelY, setPanelY] = useState(0);
  const [cardY, setCardY] = useState<number | null>(null);
  const [pickCount, setPickCount] = useState(0);
  const wantsScroll = useRef(false);
  useEffect(() => {
    if (!wantsScroll.current || cardY === null) return;
    wantsScroll.current = false;
    const top = panelY + cardY;
    if (top - scrollY.current < windowHeight * 0.55) return;
    scroll.current?.scrollTo({ y: Math.max(0, top - space[5]), animated: !reduced });
  }, [pickCount, cardY, panelY, windowHeight, reduced]);

  const select = (key: string, announce: string | null) => {
    setPicked({ scope, key });
    wantsScroll.current = true;
    setPickCount((n) => n + 1);
    if (announce) announceOnIOS(announce, { queue: true });
  };

  // "Ver todos os lançamentos do mês" abre a composição de Pago, que mostra o mês em exibição do app: ele passa para o escolhido.
  const seeAllRecords = () => {
    setViewMonth(month);
    router.push('/composicao?tipo=pago' as Href);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={T.title} right={<ContextPill label="Pessoal" />} />
      <Screen scrollRef={scroll} onScroll={(y) => (scrollY.current = y)} contentStyle={{ padding: space[5], gap: space[4] }}>
        <Txt color={colors.textSecondary}>{T.subtitle}</Txt>
        <View style={{ gap: space[1] }}>
          <MonthStepper
            groupLabel={T.monthGroup}
            label={`${work.data?.contextName ?? 'Pessoal'} · ${formatMonthBR(month)}`}
            prevLabel={prev ? PAYABLES_NAV_TEXT.previous(prev) : 'Mês anterior'}
            nextLabel={next ? PAYABLES_NAV_TEXT.next(next) : 'Próximo mês'}
            onPrev={prev ? () => setMonth(prev) : null}
            onNext={next ? () => setMonth(next) : null}
          />
          {month !== currentMonth ? (
            <LinkButton label={PAYABLES_NAV_TEXT.backToCurrent(currentMonth)} style={styles.inlineLink} onPress={() => setMonth(currentMonth)} />
          ) : null}
        </View>

        <AnalysesTabs tab={tab} onChange={setTab} />

        <View role="tabpanel" aria-label={T.tabs[tab]} onLayout={(e) => setPanelY(e.nativeEvent.layout.y)} style={{ gap: space[4] }}>
          {work.isError ? (
            <TabError onRetry={() => work.refetch()} />
          ) : !contextId ? (
            <TabLoading />
          ) : tab === 'categorias' ? (
            <CategoriesTab
              contextId={contextId}
              month={month}
              canWrite={canWrite}
              selectedKey={selectedKey}
              onSelect={select}
              onOpenRecord={(href) => router.push(href as Href)}
              onSeeAll={seeAllRecords}
              onAddExpense={() => router.push({ pathname: '/registro/novo', params: { tipo: 'despesa' } })}
              onCardLayout={setCardY}
            />
          ) : tab === 'evolucao' ? (
            <EvolutionTab contextId={contextId} month={month} currentMonth={currentMonth} onOpen={() => router.push(ANALYSES_LINKS.evolution)} />
          ) : tab === 'proximos-meses' ? (
            <UpcomingTab contextId={contextId} month={month} onOpen={() => router.push(ANALYSES_LINKS.upcoming(month))} />
          ) : (
            <BudgetTab contextId={contextId} month={month} onOpen={() => router.push(ANALYSES_LINKS.budget(month, currentMonth))} />
          )}
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  inlineLink: { alignSelf: 'flex-start', paddingHorizontal: 0 },
});
