import { router } from 'expo-router';
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react-native';
import { View } from 'react-native';

import { AuthShell } from '@/components/auth-shell';
import { WelcomeArt } from '@/components/states';
import { Button, LinkButton, Txt } from '@/components/ui';
import { DemoAuth } from '@/lib/demo-auth';
import { useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

export default function BoasVindas() {
  const { auth } = useSession();
  const [opening, setOpening] = useState(false);
  return (
    <AuthShell art={<View style={{ alignItems: 'center', marginVertical: space[2] }}><WelcomeArt /></View>}>
      <Txt variant="hero" style={{ fontSize: 34, lineHeight: 42 }} accessibilityRole="header">
        Seu dinheiro,{'\n'}mais claro.
      </Txt>
      <Txt color={colors.textSecondary}>Acompanhe o seu mês e construa planos para você e sua família.</Txt>
      <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'flex-start' }}>
        <ShieldCheck size={18} color={colors.success} style={{ marginTop: 2 }} />
        <Txt variant="caption" color={colors.textSecondary} style={{ flex: 1 }}>
          Seus registros pessoais são só seus. Se uma empresa oferecer o plano, ela não vê suas finanças.
        </Txt>
      </View>
      <View style={{ gap: space[3], marginTop: space[2] }}>
        <Button label="Criar conta" onPress={() => router.push('/criar-conta')} />
        <Button label="Entrar" tone="soft" onPress={() => router.push('/entrar')} />
      </View>
      {auth instanceof DemoAuth ? (
        <LinkButton
          label={opening ? 'Abrindo…' : 'Ver demonstração com dados fictícios'}
          onPress={async () => {
            setOpening(true);
            await auth.signInDemo();
          }}
        />
      ) : null}
    </AuthShell>
  );
}
