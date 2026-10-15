import {
  PAYABLES_NAV_TEXT,
  SEU_MES_TEXT,
  formatMonthBR,
  monthOf,
  seuMesStartMonth,
  seuMesStep,
  type IsoMonth,
  type SeuMesAction,
  type SeuMesView,
} from '@clarevo/core';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeInLeft, FadeInRight, ReduceMotion } from 'react-native-reanimated';

import { ContextPill, SubHeader } from '@/components/header';
import { MonthStepper } from '@/components/month-stepper';
import { SeuMesCardView } from '@/components/seu-mes-parts';
import { EmptyState, ErrorState } from '@/components/states';
import { Button, Card, LinkButton, Screen, Skeleton, Txt } from '@/components/ui';
import { announceOnIOS } from '@/lib/a11y';
import { useSeuMes, useSpace, useView } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, motion, space } from '@/theme/tokens';

/** Quanto o dedo precisa andar de lado, em pixels, para a troca de cartão. */
const SWIPE_DISTANCE = 48;

/**
 * Seu mês em 30 segundos (D-052): tela de consulta, com a barra inferior (Movimentos marcada). De dois a cinco cartões curtos, lidos
 * um por vez: "Próximo" e "Anterior" (ou deslizar para o lado) trocam de cartão, e o último termina em "Concluir". Seletor de mês
 * local, do mais antigo até o mês de hoje (`?mes=AAAA-MM` abre em outro mês). Só lê: nada é gravado nem registrado (nem qual cartão
 * foi aberto). Valores ocultos, leitor de tela e "reduzir movimento" seguem o resto do app: a troca de cartão é anunciada, e sem
 * movimento o cartão aparece no lugar, sem deslizar.
 */
export default function SeuMesScreen() {
  const { today } = useSession();
  const currentMonth = monthOf(today);
  const params = useLocalSearchParams<{ mes?: string }>();
  const { setMonth: setViewMonth } = useView();
  // O mês mostrado e o cartão: trocar de mês volta ao primeiro cartão.
  const [step, setStep] = useState<{ month: IsoMonth; index: number; direction: 1 | -1 }>(() => ({
    month: seuMesStartMonth(params.mes, currentMonth),
    index: 0,
    direction: 1,
  }));
  // Entradas "de agora" (sem mês no endereço) abrem sempre no mês de hoje, mesmo com a tela já aberta.
  useEffect(() => {
    setStep({ month: seuMesStartMonth(params.mes, currentMonth), index: 0, direction: 1 });
  }, [params.mes, currentMonth]);
  const { month, index, direction } = step;
  const contextId = useSpace().data?.personalContextId;
  const view = useSeuMes(contextId, month);
  const prev = seuMesStep(month, currentMonth, -1);
  const next = seuMesStep(month, currentMonth, 1);
  const goMonth = (m: IsoMonth) => setStep({ month: m, index: 0, direction: m >= month ? 1 : -1 });

  // "Ver Pago por categoria" e "Diferença do mês" abrem a Composição, que mostra o mês em exibição do app: ele passa para o do cartão.
  const onAction = (action: SeuMesAction) => {
    if (action.setsMonth) setViewMonth(month);
    router.push(action.href as Href);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={SEU_MES_TEXT.title} right={<ContextPill label="Pessoal" />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        <View style={{ gap: space[1] }}>
          <MonthStepper
            groupLabel={SEU_MES_TEXT.monthGroup}
            label={`Pessoal · ${formatMonthBR(month)}`}
            prevLabel={prev ? PAYABLES_NAV_TEXT.previous(prev) : 'Mês anterior'}
            nextLabel={next ? PAYABLES_NAV_TEXT.next(next) : 'Próximo mês'}
            onPrev={prev ? () => goMonth(prev) : null}
            onNext={next ? () => goMonth(next) : null}
          />
          {month !== currentMonth ? (
            <LinkButton label={PAYABLES_NAV_TEXT.backToCurrent(currentMonth)} style={styles.inlineLink} onPress={() => goMonth(currentMonth)} />
          ) : null}
        </View>

        {view.isPending ? (
          <View style={{ gap: space[3] }} accessibilityRole="progressbar" accessibilityLabel={SEU_MES_TEXT.loading}>
            <Skeleton width={120} height={14} />
            <Skeleton width="100%" height={200} />
          </View>
        ) : view.isError || !view.data ? (
          <Card>
            <ErrorState message={SEU_MES_TEXT.loadError} onRetry={() => view.refetch()} />
          </Card>
        ) : view.data.empty ? (
          <Card>
            <EmptyState
              title={view.data.empty.title}
              action={
                <Button label={view.data.empty.action.label} icon={Plus} onPress={() => router.push(view.data!.empty!.action.href as Href)} />
              }>
              {view.data.empty.body}
            </EmptyState>
          </Card>
        ) : (
          <Cards
            // Outro mês começa de novo, no primeiro cartão.
            key={month}
            view={view.data}
            index={index}
            direction={direction}
            onIndex={(i, dir) => setStep((s) => ({ ...s, index: i, direction: dir }))}
            onAction={onAction}
          />
        )}
      </Screen>
    </View>
  );
}

/** Os cartões, um por vez, com o progresso, "Anterior" e "Próximo" (no último, "Concluir"). */
function Cards({
  view,
  index,
  direction,
  onIndex,
  onAction,
}: {
  view: SeuMesView;
  index: number;
  direction: 1 | -1;
  onIndex: (index: number, direction: 1 | -1) => void;
  onAction: (action: SeuMesAction) => void;
}) {
  const total = view.cards.length;
  const i = Math.min(index, total - 1);
  const card = view.cards[i]!;
  const first = i === 0;
  const last = i === total - 1;
  const announce = SEU_MES_TEXT.announce(i + 1, total, card.title);
  const nextButton = useRef<View>(null);

  const go = useCallback(
    (delta: 1 | -1) => {
      const to = i + delta;
      if (to < 0 || to >= total) return;
      onIndex(to, delta);
      // "Anterior" fica desativado no primeiro cartão: o foco vai para "Próximo", para o teclado não se perder.
      if (to === 0 && Platform.OS === 'web') setTimeout(() => (nextButton.current as unknown as { focus?: () => void } | null)?.focus?.(), 0);
    },
    [i, total, onIndex],
  );
  const finish = () => (router.canGoBack() ? router.back() : router.replace('/'));

  // Na troca de cartão, o iOS (sem região viva) anuncia o cartão novo; o primeiro é lido com a tela.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    announceOnIOS(announce, { queue: true });
  }, [announce]);

  // Deslizar para o lado também troca de cartão (o mesmo que os botões; nada depende só do gesto).
  const goRef = useRef(go);
  useEffect(() => {
    goRef.current = go;
  });
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderRelease: (_, g) => {
          if (g.dx <= -SWIPE_DISTANCE) goRef.current(1);
          else if (g.dx >= SWIPE_DISTANCE) goRef.current(-1);
        },
      }),
    [],
  );

  const entering = (direction > 0 ? FadeInRight : FadeInLeft).duration(motion.context).reduceMotion(ReduceMotion.System);

  return (
    <View style={{ gap: space[4] }}>
      <View style={styles.progressRow}>
        <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
          {view.cards.map((c, n) => (
            <View key={c.id} style={[styles.dot, n === i && styles.dotOn]} />
          ))}
        </View>
        <Txt variant="caption" color={colors.textSecondary} style={{ fontFamily: fonts.bold }}>
          {SEU_MES_TEXT.progress(i + 1, total)}
        </Txt>
      </View>

      <View {...pan.panHandlers}>
        <Animated.View key={card.id} entering={entering}>
          <SeuMesCardView card={card} onAction={onAction} />
        </Animated.View>
      </View>

      {/* Região viva escondida só da vista (1×1 px cortado, sem opacity 0): a troca de cartão é dita uma vez. */}
      <View style={styles.liveClip} accessibilityElementsHidden={Platform.OS === 'ios'}>
        <Txt style={styles.liveText} accessibilityLiveRegion="polite" aria-live="polite">
          {announce}
        </Txt>
      </View>

      <View style={styles.actions} accessibilityRole="toolbar" accessibilityLabel={SEU_MES_TEXT.stepsLabel}>
        <Button label={SEU_MES_TEXT.previous} tone="soft" disabled={first} style={styles.action} onPress={() => go(-1)} />
        <Button ref={nextButton} label={last ? SEU_MES_TEXT.finish : SEU_MES_TEXT.next} style={styles.action} onPress={() => (last ? finish() : go(1))} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  inlineLink: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  dots: { flexDirection: 'row', gap: space[1] },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotOn: { backgroundColor: colors.brand, width: 20 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  action: { alignSelf: 'auto', flexGrow: 1, flexBasis: 120 },
  liveClip: { position: 'absolute', width: 1, height: 1, overflow: 'hidden' },
  liveText: { width: 240 },
});
