import { ENTRY_INVITE_TEXT, entryInviteFromText } from '@clarevo/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react-native';
import { View } from 'react-native';

import { AuthShell } from '@/components/auth-shell';
import { WelcomeArt } from '@/components/states';
import { Button, LinkButton, TextField, Txt } from '@/components/ui';
import { DemoAuth } from '@/lib/demo-auth';
import { useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

export default function BoasVindas() {
  const { auth } = useSession();
  const [opening, setOpening] = useState(false);
  // "Tenho um convite da empresa" (D-078 E): o convite abre antes de criar a conta ou entrar, com a empresa e o plano.
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState('');
  const [inviteError, setInviteError] = useState<string | undefined>();
  function seeInvite() {
    const found = entryInviteFromText(invite);
    if (!found) {
      setInviteError(ENTRY_INVITE_TEXT.invalid);
      return;
    }
    setInviteError(undefined);
    setInvite('');
    if (found.kind === 'empresa') router.push({ pathname: '/beneficio/[codigo]', params: { codigo: found.code } });
    else router.push({ pathname: '/convite/[codigo]', params: { codigo: found.code } });
  }
  return (
    <AuthShell art={<View style={{ alignItems: 'center', marginVertical: space[2] }}><WelcomeArt /></View>}>
      <Txt variant="hero" style={{ fontSize: 28, lineHeight: 36 }} accessibilityRole="header">
        Cuidar da vida financeira faz parte de cuidar de você.
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
      <LinkButton
        label={ENTRY_INVITE_TEXT.open}
        accessibilityHint={ENTRY_INVITE_TEXT.hint}
        accessibilityState={{ expanded: inviteOpen }}
        aria-expanded={inviteOpen}
        onPress={() => setInviteOpen((v) => !v)}
      />
      {inviteOpen ? (
        <View style={{ gap: space[2] }}>
          <TextField
            label={ENTRY_INVITE_TEXT.label}
            hint={ENTRY_INVITE_TEXT.fieldHint}
            value={invite}
            onChangeText={(t) => {
              setInvite(t);
              setInviteError(undefined);
            }}
            error={inviteError}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={seeInvite}
          />
          <Button label={ENTRY_INVITE_TEXT.submit} tone="soft" disabled={invite.trim() === ''} onPress={seeInvite} />
        </View>
      ) : null}
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
