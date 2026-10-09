import { ERROR_TEXT, emptyMonthCaption, formatBRL, formatDateBR, formatMonthBR, monthOf, toPayCaption } from '@clarevo/core';
import { router, useFocusEffect } from 'expo-router';
import { AlertCircle, ArrowRight, CalendarClock, Plus, ShieldCheck } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View, type ScrollView } from 'react-native';
import Animated, { FadeIn, FadeInLeft, FadeInRight, FadeOut, ReduceMotion } from 'react-native-reanimated';

import { FamilyNotLinked } from '@/components/family-state';
import { FlashBanner, useFlash } from '@/components/flash';
import { AppHeader, ContextSwitch, MonthSwitcher } from '@/components/header';
import { PrimeirosPassos } from '@/components/primeiros-passos';
import { RecordRow } from '@/components/record-row';
import { ReturnBand, useReturnBand } from '@/components/retorno-faixa';
import { EmptyState, ErrorState } from '@/components/states';
import { Body, Button, Card, FitMoney, LinkButton, Money, Screen, Skeleton, Txt } from '@/components/ui';
import { totalChange, type TotalChange } from '@/lib/highlight';
import { summaryTop } from '@/lib/nav';
import { useCommitments, useMonthRecords, useSpace, useView } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, motion, radius, space } from '@/theme/tokens';

export default function ResumoScreen() {
  const { today } = useSession();
  const { space: kind, month, currentMonth, monthDirection } = useView();
  const narrow = useWindowDimensions().width < 360;
  const [notice, setNotice] = useFlash();
  const personal = useSpace().data;
  const contextId = kind === 'pessoal' ? personal?.personalContextId : undefined;
  const records = useMonthRecords(contextId, month);
  const s = records.summary;
  const monthName = formatMonthBR(month);
  // "Nada anotado em junho." (e variações): só em meses fechados, como uma linha a mais no cabeçalho (D-030(6)).
  const emptyCaption = s ? emptyMonthCaption(s, month, currentMonth) : null;
  // Faixa "Seus últimos meses" (D-030): só no Pessoal e no mês atual, no lugar dos avisos temporários.
  const band = useReturnBand(month === currentMonth ? contextId : undefined);

  // "Ver resumo do mês" volta a este Resumo, que continua na pilha: mostrar do topo, com os totais à vista.
  // Voltar com "Voltar" mantém a posição da rolagem.
  const scroll = useRef<ScrollView>(null);
  useFocusEffect(
    useCallback(() => {
      if (summaryTop.take()) scroll.current?.scrollTo({ y: 0, animated: false });
    }, []),
  );

  // Efeito do último registro salvo ("+ R$ 80,00"), mostrado por alguns segundos e anunciado uma vez.
  const [change, setChange] = useState<TotalChange | null>(null);
  useFocusEffect(
    useCallback(() => {
      const c = kind === 'pessoal' ? totalChange.take(month) : null;
      if (c) setChange(c);
    }, [kind, month]),
  );
  useEffect(() => {
    if (!change) return;
    const t = setTimeout(() => setChange(null), 3200);
    return () => clearTimeout(t);
  }, [change]);

  // Troca de mês desliza na direção escolhida; troca de contexto só esmaece (CL-V008).
  const entering = (monthDirection > 0 ? FadeInRight : FadeInLeft).duration(motion.context).reduceMotion(ReduceMotion.System);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Screen wide scrollRef={scroll}>
        <AppHeader>
          <ContextSwitch />
          <MonthSwitcher />

          <Animated.View key={`${kind}-${month}`} entering={entering} style={styles.heroContent}>
            {kind === 'familia' ? (
              <Txt variant="title" color={colors.textOnBrand}>
                Família ainda não está ativa
              </Txt>
            ) : records.isPending ? (
              <View accessibilityRole="progressbar" accessibilityLabel="Carregando o resumo" style={{ gap: space[3] }}>
                <Skeleton width={160} height={20} onBrand />
                <Skeleton width="70%" height={40} onBrand />
                <Skeleton width="85%" height={14} onBrand />
                <View style={styles.split}>
                  <Skeleton width={110} height={36} onBrand />
                  <Skeleton width={110} height={36} onBrand />
                </View>
              </View>
            ) : records.isError || !s ? (
              <ErrorState message="Não foi possível carregar o resumo." onRetry={() => records.refetch()} onBrand />
            ) : (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Diferença do mês, ${formatBRL(s.differenceCents)}`}
                  accessibilityHint="Mostra os registros que compõem o total"
                  onPress={() => router.push({ pathname: '/composicao', params: { tipo: 'diferenca' } })}
                  style={(st) => (st as { focused?: boolean }).focused && styles.focusOnBrand}>
                  <Txt variant="label" color={colors.textOnBrand} style={styles.heroLabel}>
                    Diferença do mês
                  </Txt>
                  <FitMoney cents={s.differenceCents} color={colors.textOnBrand} />
                  <Txt variant="caption" color={colors.textOnBrandSoft}>
                    Recebimentos menos pagamentos confirmados
                    {month === currentMonth ? ` · até ${formatDateBR(today).slice(0, 5)}` : ''}
                  </Txt>
                  {s.differenceCents < 0 ? (
                    <Txt variant="caption" color={colors.textOnBrand} style={{ fontFamily: fonts.bold }}>
                      Pagamentos acima dos recebimentos no período
                    </Txt>
                  ) : null}
                </Pressable>
                {/* Fora da área tocável, para o leitor de tela ler a linha. Mês sem anotação não é mês sem gastos. */}
                {emptyCaption ? (
                  <Txt variant="caption" color={colors.textOnBrand} style={{ fontFamily: fonts.bold, marginTop: space[1] }}>
                    {emptyCaption}
                  </Txt>
                ) : null}
                <View style={styles.split}>
                  <TotalItem
                    label="Recebido"
                    cents={s.receivedCents}
                    change={change?.total === 'recebido' ? change.deltaCents : null}
                    onPress={() => router.push({ pathname: '/composicao', params: { tipo: 'recebido' } })}
                  />
                  <TotalItem
                    label="Pago"
                    cents={s.paidCents}
                    alignEnd={!narrow}
                    change={change?.total === 'pago' ? change.deltaCents : null}
                    onPress={() => router.push({ pathname: '/composicao', params: { tipo: 'pago' } })}
                  />
                </View>
              </>
            )}
          </Animated.View>
        </AppHeader>

        <Body>
          <FlashBanner message={notice} />
          {/*
            Avisos temporários (só Pessoal, mês corrente), um por vez, sem mudar a ordem dos blocos aprovados: a faixa
            "Seus últimos meses" tem precedência; o card de Primeiros passos espera a revisão carregar e volta quando a
            faixa some (conta nova nunca vê a faixa).
          */}
          {band.status === 'visivel' ? <ReturnBand band={band} onMovedOn={(text) => setNotice(text)} /> : null}
          {band.status === 'oculta' ? <PrimeirosPassos contextId={contextId} /> : null}

          {kind === 'familia' ? (
            <FamilyNotLinked />
          ) : (
            <>
              <Button label="Anotar gasto" icon={Plus} onPress={() => router.push({ pathname: '/registro/novo', params: { tipo: 'despesa' } })} />

              <ToPayCard contextId={contextId} />

              <Card>
                <View style={styles.cardHead}>
                  <Txt variant="title" accessibilityRole="header" aria-level={2}>
                    Pagamentos do mês
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
                  <EmptyState title={`Nenhum pagamento em ${monthName.toLowerCase()}`}>Anote um gasto já pago para ver o efeito no mês.</EmptyState>
                ) : (
                  s.composition.paid
                    .slice(0, 3)
                    .map((r, i, arr) => <RecordRow key={r.id} record={r} last={i === arr.length - 1} onPress={() => router.push(`/registro/${r.id}`)} />)
                )}
              </Card>
            </>
          )}

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/explicacao/fatura')}
            style={(st) => [styles.learn, st.pressed && { opacity: 0.85 }]}>
            <View style={{ flex: 1 }}>
              <Txt variant="label" style={{ fontFamily: fonts.extrabold, fontSize: 17 }}>
                Fatura sem contar duas vezes
              </Txt>
              <Txt variant="caption">Entenda o efeito no seu mês</Txt>
            </View>
            <ArrowRight size={22} color={colors.text} />
          </Pressable>

          <Pressable accessibilityRole="button" onPress={() => router.push('/quem-ve')} style={styles.privacy} hitSlop={8}>
            <ShieldCheck size={18} color={colors.textSecondary} />
            <Txt variant="label" color={colors.textSecondary}>
              Quem vê estes dados?
            </Txt>
          </Pressable>
        </Body>
      </Screen>
    </View>
  );
}

/**
 * "Ainda a pagar" (D-021): rótulo fora da área tocável, resumo tocável que abre /a-pagar e,
 * como irmão (nunca dentro), o link "Anotar conta a pagar". Falha de carga nunca vira R$ 0,00.
 */
function ToPayCard({ contextId }: { contextId: string | undefined }) {
  const { today } = useSession();
  const { month, currentMonth } = useView();
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
      ? `${label}, ${formatBRL(s.toPayCents)}. ${caption.main}.${caption.overdue ? ` ${caption.overdue}.` : ''}${caption.includes ? ` ${caption.includes}` : ''}${caption.estimated ? ` ${caption.estimated}` : ''}`
      : `${label}, ${formatBRL(s.toPayCents)}. ${zeroText}`;

  return (
    <Card style={{ gap: space[2] }}>
      <Txt variant="label" color={colors.textSecondary}>
        {label}
      </Txt>
      {commitments.isPending ? (
        <Skeleton width={140} height={28} />
      ) : commitments.isError || !s || !caption ? (
        <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => commitments.refetch()} />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={a11y}
          accessibilityHint="Abre as contas a pagar"
          onPress={() => router.push('/a-pagar')}
          style={(st) => [styles.toPayArea, st.pressed && { opacity: 0.7 }, (st as { focused?: boolean }).focused && styles.focusRing]}>
          <View style={{ flex: 1, gap: space[1] }}>
            <Money cents={s.toPayCents} />
            {allOverdue && caption.main ? (
              <View style={styles.overdueRow}>
                <AlertCircle size={16} color={colors.error} aria-hidden />
                <Txt variant="caption" color={colors.error} style={{ fontFamily: fonts.bold, flexShrink: 1 }}>
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
                <AlertCircle size={16} color={colors.error} aria-hidden />
                <Txt variant="caption" color={colors.error} style={{ fontFamily: fonts.bold }}>
                  {caption.overdue}
                </Txt>
              </View>
            ) : null}
            {caption.includes ? <Txt variant="caption">{caption.includes}</Txt> : null}
            {/* Gastos fixos que mudam de valor (luz, água): parte do total é a referência, ainda estimada. */}
            {caption.estimated ? <Txt variant="caption">{caption.estimated}</Txt> : null}
            <Txt variant="caption" color={colors.textSecondary}>
              Valores previstos, separados do que já foi pago.
            </Txt>
          </View>
          <CalendarClock size={22} color={colors.textSecondary} aria-hidden />
        </Pressable>
      )}
      <LinkButton label="Anotar conta a pagar" icon={Plus} style={styles.toPayLink} onPress={() => router.push('/a-pagar/nova')} />
    </Card>
  );
}

/** Recebido/Pago no topo. Depois de salvar, mostra por alguns segundos o efeito do registro. */
function TotalItem({
  label,
  cents,
  change,
  alignEnd,
  onPress,
}: {
  label: string;
  cents: number;
  change: number | null;
  alignEnd?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${formatBRL(cents)}`}
      accessibilityHint="Abre a composição"
      onPress={onPress}
      style={(st) => [styles.splitItem, alignEnd && { alignItems: 'flex-end' }, (st as { focused?: boolean }).focused && styles.focusOnBrand]}>
      <View style={styles.totalLabelRow}>
        <Txt variant="caption" color={colors.textOnBrandSoft} style={{ fontFamily: fonts.bold }}>
          {label}
        </Txt>
        {change !== null ? (
          <Animated.View
            entering={FadeIn.duration(motion.confirm).reduceMotion(ReduceMotion.System)}
            exiting={FadeOut.duration(motion.confirm).reduceMotion(ReduceMotion.System)}
            style={styles.changePill}
            accessibilityLiveRegion="polite"
            accessibilityLabel={`${change > 0 ? 'Mais' : 'Menos'} ${formatBRL(Math.abs(change))} em ${label}`}>
            <Txt variant="caption" color={colors.text} style={{ fontFamily: fonts.bold, fontSize: 12, lineHeight: 16 }}>
              {change > 0 ? '+' : '−'} {formatBRL(Math.abs(change))}
            </Txt>
          </Animated.View>
        ) : null}
      </View>
      <Money cents={cents} variant="label" color={colors.textOnBrand} style={styles.splitValue} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  heroContent: { minHeight: 150, justifyContent: 'center' },
  heroLabel: { fontFamily: fonts.extrabold, fontSize: 18 },
  split: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space[4], columnGap: space[4], rowGap: space[2], flexWrap: 'wrap' },
  splitItem: { minHeight: 44, justifyContent: 'center' },
  splitValue: { fontFamily: fonts.extrabold, fontSize: 18, lineHeight: 26 },
  totalLabelRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  changePill: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space[2], paddingVertical: 1 },
  focusOnBrand: { outlineWidth: 3, outlineColor: colors.accent, outlineStyle: 'solid', outlineOffset: 2 } as object,
  toPayArea: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3], minHeight: 44, borderRadius: radius.sm },
  overdueRow: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  toPayLink: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  focusRing: { outlineWidth: 3, outlineColor: colors.brand, outlineStyle: 'solid', outlineOffset: 2 } as object,
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
