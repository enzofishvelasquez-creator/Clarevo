import { CALC_UI_TEXT, calculatorBySlug } from '@clarevo/core';
import { router } from 'expo-router';
import { Calculator } from 'lucide-react-native';
import { View } from 'react-native';

import { CALC_ICONS } from '@/components/calc/open';
import { CalcNavRow } from '@/components/calc/parts';
import { AppHeader } from '@/components/header';
import { EmptyState } from '@/components/states';
import { Body, Card, LinkButton, Screen, Txt } from '@/components/ui';
import { colors, space } from '@/theme/tokens';

/**
 * Metas entram em um ciclo próprio. Estado explicativo, sem meta simulada. Até o Ciclo C, a aba leva às contas de
 * guardar (docs/08 §2.2): as três linhas abrem telas que funcionam (CL C005).
 */
export default function MetasScreen() {
  const goals = CALC_UI_TEXT.goalsSlugs.map((slug) => calculatorBySlug(slug)!);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Screen wide>
        <AppHeader title="Metas" />
        <Body>
          <Card>
            <EmptyState title="Metas chegam em uma próxima versão" art="metas">
              Você poderá separar valores para objetivos escolhidos por você, como uma reserva para imprevistos. Uma meta vai mostrar só os
              aportes registrados.
            </EmptyState>
          </Card>
          <Card style={{ gap: space[1], paddingVertical: space[4] }}>
            <Txt variant="title" accessibilityRole="header" aria-level={2}>
              {CALC_UI_TEXT.goalsCardTitle}
            </Txt>
            <View>
              {goals.map((c) => (
                <CalcNavRow
                  key={c.slug}
                  icon={CALC_ICONS[c.slug]}
                  title={c.title}
                  caption={c.subtitle}
                  onPress={() => router.push({ pathname: '/calcular/[slug]', params: { slug: c.slug } })}
                />
              ))}
              <CalcNavRow icon={Calculator} title={CALC_UI_TEXT.goalsAll} onPress={() => router.push('/calcular')} last />
            </View>
          </Card>
          <LinkButton label="Enquanto isso, acompanhe o mês no Resumo" onPress={() => router.navigate('/')} />
        </Body>
      </Screen>
    </View>
  );
}
