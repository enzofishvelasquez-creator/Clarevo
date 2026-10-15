import { router } from 'expo-router';
import { BookOpen, CalendarClock, Flag, House, CirclePlay, ShieldCheck, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { CalcNavRow } from '@/components/calc/parts';
import { SubHeader } from '@/components/header';
import { TourDialog } from '@/components/tour';
import { Button, Card, Screen, Txt } from '@/components/ui';
import { GUIDE_TEXT, guideByGroup, guideSummary, openGuideEntry } from '@/lib/guide';
import { colors, space } from '@/theme/tokens';

const GROUP_ICON: Record<string, LucideIcon> = {
  'dia-a-dia': House,
  'contas-e-cartoes': CalendarClock,
  planejar: Flag,
  'aprender-e-ajuda': BookOpen,
  'conta-e-privacidade': ShieldCheck,
};

/**
 * Como usar o Clarevo (D-049(1)): a lista das funções por grupos (Dia a dia, Contas e cartões, Planejar, Aprender e ajuda, Conta
 * e privacidade), cada uma abrindo a entrada com "Para que serve", "Onde fica" e "Como usar". No topo, "Ver o tour de novo" mostra
 * outra vez os cinco cartões de boas-vindas (sem mudar o "já visto"). Tela de consulta, com a barra inferior. O app não registra
 * quais entradas a pessoa abre.
 */
export default function GuiaScreen() {
  const [tour, setTour] = useState(false);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={GUIDE_TEXT.screenTitle} onBack={() => (router.canGoBack() ? router.back() : router.navigate('/aprender'))} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        <Txt color={colors.textSecondary}>{GUIDE_TEXT.intro}</Txt>
        <Button label={GUIDE_TEXT.tourAgain} icon={CirclePlay} tone="soft" accessibilityHint={GUIDE_TEXT.tourAgainHint} onPress={() => setTour(true)} />
        {guideByGroup().map(({ group, entries }) => {
          const Icon = GROUP_ICON[group.id] ?? BookOpen;
          return (
            <View key={group.id} style={{ gap: space[2] }}>
              <View style={{ gap: 2 }}>
                <Txt variant="title" accessibilityRole="header" aria-level={2}>
                  {group.title}
                </Txt>
                <Txt variant="caption" color={colors.textSecondary}>
                  {group.caption}
                </Txt>
              </View>
              <Card style={{ paddingVertical: space[1] }}>
                {entries.map((e, i) => (
                  <CalcNavRow
                    key={e.id}
                    icon={Icon}
                    title={e.title}
                    caption={guideSummary(e)}
                    accessibilityLabel={GUIDE_TEXT.rowA11y(e.title, guideSummary(e))}
                    last={i === entries.length - 1}
                    onPress={() => openGuideEntry(e.id)}
                  />
                ))}
              </Card>
            </View>
          );
        })}
      </Screen>
      {tour ? <TourDialog onClose={() => setTour(false)} /> : null}
    </View>
  );
}
