import { CALC_GROUPS, CALC_UI_TEXT, calculatorsInGroup } from '@clarevo/core';
import { router } from 'expo-router';
import { View } from 'react-native';

import { CALC_ICONS } from '@/components/calc/open';
import { CalcDisclaimer, CalcNavRow } from '@/components/calc/parts';
import { SubHeader } from '@/components/header';
import { Card, Screen, Txt } from '@/components/ui';
import { colors, space } from '@/theme/tokens';

/**
 * Calculadoras (docs/08 §2.2; spec4 §2.1): tela interna sem pílula de contexto, porque nada é gravado. A abertura e o
 * aviso fixo ficam antes da lista, visíveis sem rolar em 360 px. Três grupos, na ordem do catálogo do core.
 */
export default function CalculadorasScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={CALC_UI_TEXT.screenTitle} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        <Txt color={colors.textSecondary}>{CALC_UI_TEXT.intro}</Txt>
        <CalcDisclaimer />
        {CALC_GROUPS.map((g) => {
          const items = calculatorsInGroup(g.id);
          return (
            <View key={g.id} style={{ gap: space[2] }}>
              <Txt variant="title" accessibilityRole="header" aria-level={2}>
                {g.title}
              </Txt>
              <Card style={{ paddingVertical: space[2] }}>
                {items.map((c, i) => (
                  <CalcNavRow
                    key={c.slug}
                    icon={CALC_ICONS[c.slug]}
                    title={c.title}
                    caption={c.subtitle}
                    last={i === items.length - 1}
                    onPress={() => router.push({ pathname: '/calcular/[slug]', params: { slug: c.slug } })}
                  />
                ))}
              </Card>
            </View>
          );
        })}
      </Screen>
    </View>
  );
}
