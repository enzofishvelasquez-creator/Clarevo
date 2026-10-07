import { router } from 'expo-router';
import { View } from 'react-native';

import { Card, PrimaryButton, Screen, Txt } from '@/components/ui';
import { useFinance } from '@/state/finance';
import { colors, space } from '@/theme/tokens';

// Membros FICTÍCIOS. Na versão com backend, a lista vem de context_memberships (nomes e permissões reais).
const MEMBERS = {
  pessoal: [{ name: 'Você', perms: 'Ver, anotar e editar' }],
  familia: [
    { name: 'Você (titular)', perms: 'Ver, anotar, editar e convidar' },
    { name: 'Bruno', perms: 'Ver e anotar; edita só os próprios registros' },
  ],
};

export default function QuemVeScreen() {
  const { activeContext } = useFinance();
  return (
    <Screen contentStyle={{ padding: space[6], gap: space[4] }}>
      <Txt variant="title">Contexto: {activeContext.name}</Txt>
      <Card>
        {MEMBERS[activeContext.kind].map((m) => (
          <View key={m.name} style={{ paddingVertical: space[2] }}>
            <Txt variant="label">{m.name}</Txt>
            <Txt variant="caption" color={colors.textSecondary}>{m.perms}</Txt>
          </View>
        ))}
      </Card>
      <Txt color={colors.textSecondary}>
        A empresa administra seu acesso ao plano. Seus registros financeiros têm permissões próprias.
      </Txt>
      <Txt variant="caption" color={colors.textSecondary}>Protótipo com dados fictícios.</Txt>
      <PrimaryButton label="Entendi" onPress={() => router.back()} />
    </Screen>
  );
}
