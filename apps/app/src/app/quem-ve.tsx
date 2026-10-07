import { router } from 'expo-router';
import { User } from 'lucide-react-native';
import { View } from 'react-native';

import { Button, Card, Screen, Txt } from '@/components/ui';
import { useView } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

/** Nomes e permissões reais do contexto, sem selo genérico. */
export default function QuemVeScreen() {
  const { user } = useSession();
  const { space: kind } = useView();
  return (
    <Screen contentStyle={{ padding: space[6], gap: space[4] }}>
      <Txt variant="title" accessibilityRole="header">
        Contexto: {kind === 'pessoal' ? 'Pessoal' : 'Família'}
      </Txt>
      {kind === 'pessoal' ? (
        <Card style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
          <User size={22} color={colors.brand} />
          <View style={{ flex: 1 }}>
            <Txt variant="label">{user?.displayName} (você)</Txt>
            <Txt variant="caption" color={colors.textSecondary}>
              Única pessoa que vê, anota, edita e exclui registros em Pessoal.
            </Txt>
          </View>
        </Card>
      ) : (
        <Card>
          <Txt>Nenhuma família vinculada. Quando houver, esta tela mostrará o nome e as permissões de cada pessoa.</Txt>
        </Card>
      )}
      <Txt color={colors.textSecondary}>
        Se uma empresa oferecer o Clarevo como benefício, ela administra seu acesso ao plano. Seus registros financeiros têm permissões
        próprias e não ficam visíveis para a empresa.
      </Txt>
      <Button label="Entendi" onPress={() => router.back()} />
    </Screen>
  );
}
