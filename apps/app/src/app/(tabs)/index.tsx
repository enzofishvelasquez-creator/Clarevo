import { ERROR_TEXT, formatBRL, formatDateBR, formatMonthBR } from '@clarevo/core';
import { router } from 'expo-router';
import { ArrowRight, CalendarClock, Plus, ShieldCheck } from 'lucide-react-native';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';

import { FamilyNotLinked } from '@/components/family-state';
import { FlashBanner, useFlash } from '@/components/flash';
import { BrandHeader, ContextSwitch, MonthSwitcher } from '@/components/header';
import { RecordRow } from '@/components/record-row';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button, Card, DemoBadge, FitMoney, LinkButton, Money, Screen, TopInset, Txt } from '@/components/ui';
import { useCommitments, useMonthRecords, useSpace, useView } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, radius, space } from '@/theme/tokens';

const fade = FadeIn.duration(200).reduceMotion(ReduceMotion.System);

export default function ResumoScreen() {
  const { auth, today } = useSession();
  const { space: kind, month, currentMonth } = useView();
  const narrow = useWindowDimensions().width < 360;
  const [notice] = useFlash();
  const personal = useSpace().data;
  const contextId = kind === 'pessoal' ? personal?.personalContextId : undefined;
  const records = useMonthRecords(contextId, month);
  const commitments = useCommitments(contextId, month);
  const s = records.summary;
  const monthName = formatMonthBR(month);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopInset color={colors.brand} />
      <Screen>
        <View style={styles.hero}>
          <BrandHeader />
          <ContextSwitch />
          <MonthSwitcher />

          <Animated.View key={`${kind}-${month}`} entering={fade} style={{ minHeight: 150, justifyContent: 'center' }}>
            {kind === 'familia' ? (
              <Txt variant="title" color={colors.textOnBrand}>
                Família ainda não está ativa
              </Txt>
            ) : records.isPending ? (
              <LoadingState label="Carregando o resumo…" color={colors.textOnBrand} />
            ) : records.isError || !s ? (
              <ErrorState message="Não foi possível carregar o resumo." onRetry={() => records.refetch()} onBrand />
            ) : (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityHint="Mostra os registros que compõem o total"
                  onPress={() => router.push({ pathname: '/composicao', params: { tipo: 'diferenca' } })}>
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
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Recebido, ${formatBRL(s.receivedCents)}`}
                    accessibilityHint="Abre a composição"
                    onPress={() => router.push({ pathname: '/composicao', params: { tipo: 'recebido' } })}
                    style={styles.splitItem}>
                    <Txt variant="caption" color={colors.textOnBrandSoft} style={{ fontFamily: fonts.bold }}>
                      Recebido
                    </Txt>
                    <Money cents={s.receivedCents} variant="label" color={colors.textOnBrand} style={styles.splitValue} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Pago, ${formatBRL(s.paidCents)}`}
                    accessibilityHint="Abre a composição"
                    onPress={() => router.push({ pathname: '/composicao', params: { tipo: 'pago' } })}
                    style={[styles.splitItem, !narrow && { alignItems: 'flex-end' }]}>
                    <Txt variant="caption" color={colors.textOnBrandSoft} style={{ fontFamily: fonts.bold }}>
                      Pago
                    </Txt>
                    <Money cents={s.paidCents} variant="label" color={colors.textOnBrand} style={styles.splitValue} />
                  </Pressable>
                </View>
              </>
            )}
          </Animated.View>
        </View>

        <View style={styles.body}>
          {auth.mode === 'demo' ? <DemoBadge /> : null}
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
                    <LoadingState />
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
                  <Txt variant="title" accessibilityRole="header">
                    Pagamentos do mês
                  </Txt>
                  <LinkButton label="Ver todos" onPress={() => router.push({ pathname: '/composicao', params: { tipo: 'pago' } })} />
                </View>
                {records.isPending ? (
                  <LoadingState />
                ) : records.isError || !s ? (
                  <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => records.refetch()} />
                ) : s.composition.paid.length === 0 ? (
                  <EmptyState title={`Nenhum pagamento em ${monthName.toLowerCase()}`}>
                    Anote um gasto já pago para ver o efeito no mês.
                  </EmptyState>
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
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.brand,
    paddingHorizontal: space[6],
    paddingTop: space[4],
    paddingBottom: space[6],
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  heroLabel: { fontFamily: fonts.extrabold, fontSize: 18 },
  split: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space[4], columnGap: space[4], rowGap: space[2], flexWrap: 'wrap' },
  splitItem: { minHeight: 44, justifyContent: 'center' },
  splitValue: { fontFamily: fonts.extrabold, fontSize: 18, lineHeight: 26 },
  body: { padding: space[6], gap: space[4] },
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
