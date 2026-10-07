import { DEMO_FAMILY_BUDGET_CENTS, formatBRL } from '@clarevo/core';
import { router } from 'expo-router';
import { ArrowUpRight, CalendarClock, CalendarDays, Plus, ShieldCheck } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { BrandHeader, ContextSwitch } from '@/components/header';
import { Card, EventRow, Money, PrimaryButton, Screen, TopInset, Txt } from '@/components/ui';
import { monthLabel, useFinance } from '@/state/finance';
import { colors, fonts, radius, space } from '@/theme/tokens';

export default function ResumoScreen() {
  const { summary, activeContext, month } = useFinance();
  const isFamily = activeContext.kind === 'familia';
  const lastPaid = summary.composition.paid.slice(0, isFamily ? 3 : 2);
  const toPayNames = summary.composition.toPay.map((e) => e.description).join(' e ');

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopInset color={colors.brand} />
      <Screen>
        <View style={styles.hero}>
          <BrandHeader />
          <ContextSwitch />

          <View style={styles.periodRow}>
            <Txt variant="caption" color={colors.textOnBrandSoft}>
              {monthLabel(month)}
            </Txt>
            <CalendarDays size={20} color={colors.textOnBrandSoft} accessibilityLabel="Escolher período" />
          </View>

          {!summary.hasData ? (
            <Txt variant="title" color={colors.textOnBrand} style={{ marginTop: space[2] }}>
              Sem registros neste mês
            </Txt>
          ) : isFamily ? (
            <Pressable accessibilityRole="button" onPress={() => router.push('/composicao?tipo=pago')}>
              <Txt variant="label" color={colors.textOnBrand} style={styles.heroLabel}>
                Despesas compartilhadas
              </Txt>
              <Money cents={summary.paidCents} variant="hero" color={colors.textOnBrand} />
              <Txt variant="caption" color={colors.textOnBrandSoft}>
                Pagamentos confirmados no contexto Família
              </Txt>
            </Pressable>
          ) : (
            <>
              <Pressable accessibilityRole="button" accessibilityHint="Mostra os eventos que compõem o total" onPress={() => router.push('/composicao?tipo=diferenca')}>
                <Txt variant="label" color={colors.textOnBrand} style={styles.heroLabel}>
                  Diferença do mês
                </Txt>
                <Money cents={summary.differenceCents} variant="hero" color={colors.textOnBrand} />
                <Txt variant="caption" color={colors.textOnBrandSoft}>
                  Recebimentos menos pagamentos confirmados
                </Txt>
              </Pressable>
              <View style={styles.split}>
                <Pressable accessibilityRole="button" onPress={() => router.push('/composicao?tipo=recebido')}>
                  <Txt variant="caption" color={colors.textOnBrandSoft}>Recebido</Txt>
                  <Money cents={summary.receivedCents} variant="label" color={colors.textOnBrand} style={styles.splitValue} />
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => router.push('/composicao?tipo=pago')} style={{ alignItems: 'flex-end' }}>
                  <Txt variant="caption" color={colors.textOnBrandSoft}>Pago</Txt>
                  <Money cents={summary.paidCents} variant="label" color={colors.textOnBrand} style={styles.splitValue} />
                </Pressable>
              </View>
            </>
          )}
        </View>

        <View style={styles.body}>
          <PrimaryButton label="Anotar gasto" icon={Plus} onPress={() => router.push('/anotar')} />

          {isFamily ? (
            <Card>
              <View style={styles.cardHead}>
                <Txt variant="title">Orçamento da família</Txt>
                <Txt variant="title">{Math.round((summary.paidCents / DEMO_FAMILY_BUDGET_CENTS) * 100)}%</Txt>
              </View>
              <View style={styles.progressTrack} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: DEMO_FAMILY_BUDGET_CENTS, now: summary.paidCents }}>
                <View style={[styles.progressFill, { width: `${Math.min(100, (summary.paidCents / DEMO_FAMILY_BUDGET_CENTS) * 100)}%` }]} />
              </View>
              <View style={styles.cardHead}>
                <Txt variant="caption" color={colors.textSecondary}>
                  {formatBRL(summary.paidCents)} de {formatBRL(DEMO_FAMILY_BUDGET_CENTS)}
                </Txt>
                <Txt variant="caption" color={colors.textSecondary}>
                  Restam {formatBRL(Math.max(0, DEMO_FAMILY_BUDGET_CENTS - summary.paidCents))}
                </Txt>
              </View>
            </Card>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => router.push('/composicao?tipo=apagar')}>
              <Card style={styles.cardRow}>
                <View style={{ flex: 1 }}>
                  <Txt variant="label" color={colors.textSecondary}>Ainda a pagar neste mês</Txt>
                  <Money cents={summary.toPayCents} />
                  <Txt variant="label" color={colors.textSecondary}>
                    {toPayNames ? `${toPayNames} · vencimentos futuros` : 'Nada previsto'}
                  </Txt>
                </View>
                <CalendarClock size={22} color={colors.textSecondary} />
              </Card>
            </Pressable>
          )}

          <Card>
            <View style={styles.cardHead}>
              <Txt variant="title">{isFamily ? 'Gastos em conjunto' : 'Últimos pagamentos'}</Txt>
              <Pressable accessibilityRole="link" hitSlop={12} onPress={() => router.push('/movimentos')}>
                <Txt variant="label" color={colors.brand} style={{ fontFamily: fonts.bold, fontSize: 16 }}>Ver todos</Txt>
              </Pressable>
            </View>
            {lastPaid.length === 0 ? (
              <Txt color={colors.textSecondary}>Nenhum pagamento confirmado neste mês.</Txt>
            ) : (
              lastPaid.map((e) => <EventRow key={e.id} event={e} />)
            )}
          </Card>

          <Pressable accessibilityRole="button" onPress={() => router.push('/fatura')} style={({ pressed }) => [styles.learn, pressed && { opacity: 0.85 }]}>
            <View style={{ flex: 1 }}>
              <Txt variant="label" style={{ fontFamily: fonts.extrabold, fontSize: 16 }}>Fatura sem contar duas vezes</Txt>
              <Txt variant="caption">Uma explicação de 30 segundos</Txt>
            </View>
            <ArrowUpRight size={20} color={colors.text} />
          </Pressable>

          <Pressable accessibilityRole="button" onPress={() => router.push('/quem-ve')} style={styles.privacy} hitSlop={8}>
            <ShieldCheck size={18} color={colors.textSecondary} />
            <Txt variant="label" color={colors.textSecondary}>Quem vê estes dados?</Txt>
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
  periodRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space[6] },
  heroLabel: { fontFamily: fonts.extrabold, fontSize: 18, marginTop: space[2] },
  split: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space[4] },
  splitValue: { fontFamily: fonts.extrabold, fontSize: 18 },
  body: { padding: space[6], gap: space[4] },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[2] },
  progressTrack: { height: 10, borderRadius: 5, backgroundColor: colors.brandTint, marginVertical: space[3], overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.brand, borderRadius: 5 },
  learn: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: space[5],
    paddingHorizontal: space[6],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  privacy: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: space[2], paddingVertical: space[2] },
});
