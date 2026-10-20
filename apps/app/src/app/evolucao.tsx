import {
  EVOLUTION_DEFAULT_METRIC,
  EVOLUTION_DEFAULT_WINDOW,
  EVOLUTION_METRICS,
  EVOLUTION_TEXT,
  EVOLUTION_WINDOWS,
  EvolutionSelectionStore,
  buildEvolutionView,
  buildPhase3View,
  evolutionAnnouncement,
  evolutionFetchRange,
  evolutionPanel,
  evolutionSelectedMonth,
  evolutionSubtitle,
  isPhase3Metric,
  monthOf,
  phase3Empty,
  phase3Panel,
  type EvolutionPhase3Metric,
  type EvolutionSelectionMetric,
  type EvolutionView,
  type EvolutionWindow,
  type IsoMonth,
} from '@clarevo/core';
import { router, type Href } from 'expo-router';
import { Minus, Plus } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, findNodeHandle, Platform, StyleSheet, View } from 'react-native';

import { CustomComparisonNotice, EvolutionChart, MonthPanelCard, Phase3PanelCard, StatsSection, ValuesTable } from '@/components/evolucao-parts';
import { ContextPill, SubHeader } from '@/components/header';
import { MoneyTxt } from '@/components/money-text';
import { EmptyState, ErrorState } from '@/components/states';
import { Button, Card, Chip, Screen, Skeleton, Txt } from '@/components/ui';
import { announceOnIOS } from '@/lib/a11y';
import { evolutionSelection, useHiddenMonths } from '@/lib/evolution-memory';
import { useEvolutionCommitted, useEvolutionGaps, useEvolutionSavings, useEvolutionWindowMonths, useMonthsOverview, useView, useWork } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

const T = EVOLUTION_TEXT;

/**
 * Evolução (D-057, fases 1b e 2): Recebido ou Pago mês a mês, pela data do pagamento, em um gráfico de linha com média, mediana e o total dos
 * meses exibidos, e o painel do mês escolhido (com a seção recolhida "Entender o que mudou", que só lê quando aberta). A pessoa pode tirar um mês da comparação sem apagar nem mudar nenhum lançamento: isso
 * só muda a média, a mediana e o desenho, vale só enquanto o app está aberto (por pessoa, contexto e valor mostrado) e nada é
 * gravado nem enviado (D03). Tela de consulta, com a barra inferior (Movimentos marcada). Lê `months_overview` de uma vez (12 meses
 * até o mês atual) no contexto escolhido; erro nunca mostra dado parcial. O aviso de lacuna em mês fechado de Pago (D04) vem de outra
 * leitura (`useEvolutionGaps`) que a tela não espera: se ela falha, o gráfico sai sem o aviso.
 *
 * Fase 3 (D-062 item 4): depois de Recebido e Pago, o seletor tem "Renda comprometida" (o percentual da renda de referência ligado a contas
 * do mês) e "Guardado em metas" (aportes menos resgates), só de meses já fechados, cada um com a própria base escrita no subtítulo. Eles não
 * leem `months_overview`: a Renda comprometida lê as contas de cada mês fechado (no máximo 11 leituras por janela, com cache pela chave e
 * recarga a cada escrita) e a renda de referência, e o Guardado em metas lê as metas e os movimentos de cada mês fechado. Mês sem renda de
 * referência é "sem base", e mês sem registros fica fora das médias: nunca viram zero. Cada valor tem a própria seleção de meses fora da
 * comparação (T13). "Entender o que mudou" segue só em Recebido e Pago.
 */
export default function EvolucaoScreen() {
  const { today, user } = useSession();
  const currentMonth = monthOf(today);
  const { setMonth: setViewMonth } = useView();
  const work = useWork();
  const contextId = work.data?.contextId;
  const canWrite = work.data?.canWrite ?? true;
  const [metric, setMetric] = useState<EvolutionSelectionMetric>(EVOLUTION_DEFAULT_METRIC);
  const [windowMonths, setWindowMonths] = useState<EvolutionWindow>(EVOLUTION_DEFAULT_WINDOW);
  const [chosen, setChosen] = useState<IsoMonth | null>(null);
  const { from, to } = evolutionFetchRange(currentMonth);
  const overview = useMonthsOverview(contextId, from, to);
  const scope = EvolutionSelectionStore.scope(user?.id, contextId);
  const hidden = useHiddenMonths(scope, metric);
  const gapMonths = useEvolutionGaps(contextId);

  // Recebido e Pago leem months_overview; Renda comprometida e Guardado em metas leem só o que o valor escolhido pede (nada é lido antes).
  const phase3 = isPhase3Metric(metric);
  const windowMonthsList = useEvolutionWindowMonths(windowMonths);
  const committed = useEvolutionCommitted(contextId, windowMonthsList, metric === 'comprometida');
  const savings = useEvolutionSavings(contextId, windowMonthsList, metric === 'guardado');
  const phase3Points = metric === 'comprometida' ? committed : savings;

  const build = (hiddenMonths: ReadonlySet<IsoMonth>): EvolutionView<EvolutionSelectionMetric> | null => {
    if (isPhase3Metric(metric)) {
      return phase3Points.data ? buildPhase3View({ metric, points: phase3Points.data, windowMonths, currentMonth, hiddenMonths }) : null;
    }
    return overview.data && !overview.isError ? buildEvolutionView({ overview: overview.data, metric, windowMonths, currentMonth, hiddenMonths, gapMonths }) : null;
  };
  const view = useMemo((): EvolutionView<EvolutionSelectionMetric> | null => {
    try {
      return build(hidden);
    } catch {
      // Linha que o banco nunca devolveria (valor negativo, mês repetido): erro, nunca um gráfico com dado parcial.
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview.data, overview.isError, phase3Points.data, metric, windowMonths, currentMonth, hidden, gapMonths]);

  const query = phase3 ? phase3Points : overview;
  const loading = work.isPending || (query.isPending && !query.isError);
  const failed = !loading && (work.isError || query.isError || view === null);
  const retry = () => (work.isError ? work.refetch() : query.refetch());

  const selected = view ? evolutionSelectedMonth(view, chosen) : null;
  // O painel de Recebido e Pago (`evolutionPanel`, só com a visão deles) e o da fase 3 (`phase3Panel`) são diferentes.
  const cashView = view && !isPhase3Metric(view.metric) ? (view as EvolutionView) : null;
  const phase3View = view && isPhase3Metric(view.metric) ? (view as EvolutionView<EvolutionPhase3Metric>) : null;
  const panel = cashView && selected ? evolutionPanel(cashView, selected, canWrite) : null;
  const panel3 = phase3View && selected ? phase3Panel(phase3View, selected) : null;

  // Ao tirar ou pôr um mês, a nova média e mediana são ditas ao leitor de tela (a troca de valor e de meses, não).
  const subtitle = evolutionSubtitle(metric);
  const [live, setLive] = useState('');
  const announce = (nextHidden: ReadonlySet<IsoMonth>) => {
    const next = build(nextHidden);
    if (!next) return;
    const text = evolutionAnnouncement(next);
    setLive(text);
    announceOnIOS(text, { queue: true });
  };
  const toggle = (month: IsoMonth, included: boolean) => {
    if (!scope) return;
    evolutionSelection.setHidden(scope, metric, month, !included);
    announce(evolutionSelection.get(scope, metric));
  };
  const restore = () => {
    if (!scope) return;
    evolutionSelection.restoreAll(scope, metric);
    announce(evolutionSelection.get(scope, metric));
  };
  // "Mês anterior" e "Mês seguinte": o foco fica no botão, então o mês novo é dito ao leitor de tela.
  const step = (month: IsoMonth) => {
    setChosen(month);
    const name = view?.points.find((p) => p.month === month)?.name;
    if (!name) return;
    setLive(name);
    announceOnIOS(name, { queue: true });
  };
  // Uma linha da tabela escolhe o mês e leva o foco ao título do painel (que vem acima, com o mês e os detalhes).
  const panelHead = useRef<View>(null);
  const [focusPanel, setFocusPanel] = useState(0);
  useEffect(() => {
    const node = panelHead.current;
    if (focusPanel === 0 || !node) return;
    if (Platform.OS === 'web') (node as unknown as HTMLElement).focus?.();
    else {
      const handle = findNodeHandle(node);
      if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
    }
  }, [focusPanel]);
  const pickFromTable = (month: IsoMonth) => {
    setChosen(month);
    setFocusPanel((n) => n + 1);
  };
  // "Ver lançamentos" e "Ver Pago por categoria" abrem a Composição, que mostra o mês em exibição do app: ele passa para o do painel.
  const open = (href: string, month: IsoMonth) => {
    setViewMonth(month);
    router.push(href as Href);
  };
  const pickMetric = (m: EvolutionSelectionMetric) => {
    setLive('');
    setMetric(m);
  };
  const pickWindow = (w: EvolutionWindow) => {
    setLive('');
    setWindowMonths(w);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={T.title} right={<ContextPill label="Pessoal" />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        <View style={{ gap: space[1] }}>
          <Txt color={colors.textSecondary}>{subtitle.base}</Txt>
          {subtitle.note ? (
            <Txt variant="caption" color={colors.textSecondary}>
              {subtitle.note}
            </Txt>
          ) : null}
        </View>

        <View style={{ gap: space[3] }}>
          <View style={styles.filters} accessibilityRole="radiogroup" accessibilityLabel={T.metricGroup}>
            {EVOLUTION_METRICS.map((m) => (
              <Chip key={m} label={T.metrics[m]} selected={metric === m} onPress={() => pickMetric(m)} />
            ))}
          </View>
          <View style={styles.filters} accessibilityRole="radiogroup" accessibilityLabel={T.windowGroup}>
            {EVOLUTION_WINDOWS.map((w) => (
              <Chip key={w} label={T.windowLabel[w]} selected={windowMonths === w} onPress={() => pickWindow(w)} />
            ))}
          </View>
        </View>

        {loading ? (
          <View style={{ gap: space[3] }} accessibilityRole="progressbar" accessibilityLabel={T.loading}>
            <Skeleton width={140} height={16} />
            <Skeleton width="100%" height={220} />
            <Skeleton width="100%" height={120} />
          </View>
        ) : failed || !view || !selected || !(panel || panel3) ? (
          <Card>
            <ErrorState message={T.loadError} retryLabel={T.retry} onRetry={retry} />
          </Card>
        ) : phase3View && view.situation === 'sem_registros' ? (
          <Phase3EmptyCard view={phase3View} canWrite={canWrite} currentMonth={currentMonth} />
        ) : !phase3View && view.situation === 'sem_registros' && (metric === 'recebido' || metric === 'pago') ? (
          <Card>
            <EmptyState
              title={T.states.noRecordsTitle}
              action={
                canWrite ? (
                  <Button
                    label={T.states.noRecordsAction[metric]}
                    icon={metric === 'pago' ? Minus : Plus}
                    onPress={() => router.push({ pathname: '/registro/novo', params: { tipo: metric === 'pago' ? 'despesa' : 'receita' } })}
                  />
                ) : undefined
              }>
              {[T.states.noRecordsBody(metric), T.states.olderMonths(windowMonths)].filter(Boolean).join(' ')}
            </EmptyState>
          </Card>
        ) : (
          <>
            <Card style={styles.chartCard}>
              <EvolutionChart view={view} selected={selected} onSelect={setChosen} />
            </Card>
            {panel ? (
              <MonthPanelCard
                panel={panel}
                contextId={contextId}
                headRef={panelHead}
                onStep={step}
                onToggle={(included) => toggle(panel.month, included)}
                onSeeRecords={() => open(panel.recordsHref, panel.month)}
                onSeeCategories={() => open(panel.categoriesHref, panel.month)}
              />
            ) : panel3 ? (
              <Phase3PanelCard panel={panel3} headRef={panelHead} onStep={step} onToggle={(included) => toggle(panel3.month, included)} />
            ) : null}
            {view.outCount > 0 ? <CustomComparisonNotice view={view} onRestore={restore} /> : null}
            <StatsSection view={view} onRestore={restore} />
            <ValuesTable view={view} selected={selected} onPick={pickFromTable} />
          </>
        )}

        {/* Região viva escondida só da vista (1×1 px cortado, sem opacity 0): a nova média e mediana são ditas uma vez. */}
        <View style={styles.liveClip} accessibilityElementsHidden={Platform.OS === 'ios'}>
          <MoneyTxt style={styles.liveText} accessibilityLiveRegion="polite" aria-live="polite">
            {view ? live : ''}
          </MoneyTxt>
        </View>
      </Screen>
    </View>
  );
}

/**
 * Renda comprometida ou Guardado em metas sem nenhum mês fechado com valor (fase 3): "Sem base para estes meses" (sem renda de referência),
 * "Sem registros nestes meses" (sem conta anotada ou sem meta ativa) e, com escrita no contexto, o botão que leva a criar a base.
 */
function Phase3EmptyCard({ view, canWrite, currentMonth }: { view: EvolutionView<EvolutionPhase3Metric>; canWrite: boolean; currentMonth: IsoMonth }) {
  const empty = phase3Empty(view, canWrite);
  const go = (kind: 'referencia' | 'conta' | 'meta') => {
    if (kind === 'referencia') router.push({ pathname: '/renda-comprometida/referencia', params: { mes: currentMonth } });
    else if (kind === 'conta') router.push('/a-pagar/nova');
    else router.push('/meta/nova');
  };
  return (
    <Card>
      <EmptyState title={empty.title} action={empty.action ? <Button label={empty.action.label} icon={Plus} onPress={() => go(empty.action!.kind)} /> : undefined}>
        {empty.body}
      </EmptyState>
    </Card>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', gap: space[2], flexWrap: 'wrap' },
  chartCard: { paddingHorizontal: space[1], paddingVertical: space[4] },
  liveClip: { position: 'absolute', width: 1, height: 1, overflow: 'hidden' },
  liveText: { width: 240 },
});
