import { ERROR_TEXT, formatBRL, formatDateBR, formatMonthBR } from '@clarevo/core';
import { router, useFocusEffect } from 'expo-router';
import { ArrowRight, CalendarClock, Plus, ShieldCheck } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInLeft, FadeInRight, FadeOut, ReduceMotion } from 'react-native-reanimated';

import { FamilyNotLinked } from '@/components/family-state';
import { FlashBanner, useFlash } from '@/components/flash';
import { AppHeader, ContextSwitch, MonthSwitcher } from '@/components/header';
import { RecordRow } from '@/components/record-row';
import { EmptyState, ErrorState } from '@/components/states';
import { Body, Button, Card, FitMoney, LinkButton, Money, Screen, Skeleton, Txt } from '@/components/ui';
import { totalChange, type TotalChange } from '@/lib/highlight';
import { useCommitments, useMonthRecords, useSpace, useView } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, motion, radius, space } from '@/theme/tokens';

export default function ResumoScreen() {
  const { today } = useSession();
  const { space: kind, month, currentMonth, monthDirection } = useView();
  const narrow = useWindowDimensions().width < 360;
  const [notice] = useFlash();
  const personal = useSpace().data;
  const contextId = kind === 'pessoal' ? personal?.personalContextId : undefined;
  const records = useMonthRecords(contextId, month);
  const commitments = useCommitments(contextId, month);
  const s = records.summary;
  const monthName = formatMonthBR(month);

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
      <Screen wide>
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

          {kind === 'familia' ? (
            <FamilyNotLinked />
          ) : (
            <>
              <Button label="Anotar gasto" icon={Plus} onPress={() => router.push({ pathname: '/registro/novo', params: { tipo: 'despesa' } })} />

              <Pressable
                accessibilityRole="button"
                accessibilityHint="Mostra os compromissos que compõem o total"
                disabled={!commitments.summary?.items.length}
                onPress={() => router.push({ pathname: '/composicao', params: { tipo: 'apagar' } })}>
                <Card style={styles.cardRow}>
                  <View style={{ flex: 1, gap: space[1] }}>
                    <Txt variant="label" color={colors.textSecondary}>
                      {month === currentMonth ? 'Ainda a pagar neste mês' : `Previsto para ${monthName.toLowerCase()}`}
                    </Txt>
                    {commitments.isPending ? (
                      <Skeleton width={140} height={28} />
                    ) : commitments.isError || !commitments.summary ? (
                      <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => commitments.refetch()} />
                    ) : commitments.summary.items.length === 0 ? (
                      <Txt variant="label">Nenhum compromisso registrado.</Txt>
                    ) : (
                      <>
                        <Money cents={commitments.summary.toPayCents} />
                        <Txt variant="caption" color={colors.textSecondary}>
                          {commitments.summary.items.map((c) => c.description).join(' e ')}
                        </Txt>
                      </>
                    )}
                    <Txt variant="caption" color={colors.textSecondary}>
                      Valores previstos, separados do que já foi pago.
                    </Txt>
                  </View>
                  <CalendarClock size={22} color={colors.textSecondary} />
                </Card>
              </Pressable>

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
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
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
