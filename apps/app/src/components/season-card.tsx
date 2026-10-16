import { router } from 'expo-router';
import { Calculator, CalendarDays } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { CalcNavRow } from '@/components/calc/parts';
import { TopicRow } from '@/components/topic-link';
import { Card, Txt } from '@/components/ui';
import { SEASONAL_TEXT, calculatorHref, explanationHref, type SeasonalCard } from '@/lib/learn';
import { colors, radius, space } from '@/theme/tokens';

/**
 * Card "Neste mês" (D-053): título de nível 2 com a legenda "Temas para outubro", uma linha para cada tema do mês (as mesmas
 * linhas das seções, com o tempo de leitura) e, quando um tema liga uma calculadora, a linha dela ("Cota única ou parcelado?").
 * Em Aprender (D-053) e, depois do conteúdo principal, em Metas (D-054, P-028), com os mesmos temas e os mesmos links: a explicação
 * abre como se fosse de Aprender. Só lê a data de hoje (`seasonalCard`): sem gravação, sem requisição e sem notificação.
 */
export function SeasonCardView({ card }: { card: SeasonalCard }) {
  return (
    <Card style={{ gap: space[2] }}>
      <View style={styles.head}>
        <View style={styles.icon}>
          <CalendarDays size={22} color={colors.brand} strokeWidth={2.25} aria-hidden />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {SEASONAL_TEXT.title}
          </Txt>
          <Txt variant="caption" color={colors.textSecondary}>
            {SEASONAL_TEXT.caption(card.monthName)}
          </Txt>
        </View>
      </View>
      <View>
        {card.topics.map((t, i) => (
          <TopicRow
            key={t.slug}
            topic={t}
            last={i === card.topics.length - 1 && card.calculators.length === 0}
            onPress={() => router.push(explanationHref(t.slug, 'aprender'))}
          />
        ))}
        {card.calculators.map((c, i) => (
          <CalcNavRow
            key={`${c.slug}-${c.params.modo ?? ''}`}
            icon={Calculator}
            title={c.title}
            caption={c.caption}
            last={i === card.calculators.length - 1}
            onPress={() => router.push(calculatorHref(c))}
          />
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  icon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
});
