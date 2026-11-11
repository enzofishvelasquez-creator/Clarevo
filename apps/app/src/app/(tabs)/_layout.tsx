import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import { View } from 'react-native';

import { TABS, TabBar, TabButton } from '@/components/tab-bar';
import { colors } from '@/theme/tokens';

/** Cinco destinos: Resumo, Movimentos, Metas, Investir (D-093) e Aprender. Conta fica no avatar. */
export default function TabsLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Tabs>
        <TabSlot style={{ flex: 1 }} />
        <TabList asChild>
          <TabBar>
            {TABS.map((t) => (
              <TabTrigger key={t.name} name={t.name} href={t.href} asChild>
                <TabButton label={t.label} a11y={t.a11y} icon={t.icon} />
              </TabTrigger>
            ))}
          </TabBar>
        </TabList>
      </Tabs>
    </View>
  );
}
