import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import { View } from 'react-native';

import { TABS, TabBar, TabButton } from '@/components/tab-bar';
import { colors } from '@/theme/tokens';

/** Quatro destinos (CL-V002): Resumo, Movimentos, Metas e Aprender. */
export default function TabsLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Tabs>
        <TabSlot style={{ flex: 1 }} />
        <TabList asChild>
          <TabBar>
            {TABS.map((t) => (
              <TabTrigger key={t.name} name={t.name} href={t.href} asChild>
                <TabButton label={t.label} icon={t.icon} />
              </TabTrigger>
            ))}
          </TabBar>
        </TabList>
      </Tabs>
    </View>
  );
}
