import { DEMO_ENTRY_TEST_ID, DEMO_URL, ENTRY_INVITE_TEXT, WELCOME_TEXT, entryInviteFromText } from '@clarevo/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { BadgeCheck, ShieldCheck } from 'lucide-react-native';
import { Linking, StyleSheet, View } from 'react-native';

import { AuthShell } from '@/components/auth-shell';
import { WelcomeArt } from '@/components/states';
import { Button, LinkButton, TextField, Txt } from '@/components/ui';
import { DemoAuth } from '@/lib/demo-auth';
import { useShortLandscape } from '@/lib/layout';
import { useSession } from '@/state/session';
import { colors, fonts, radius, space } from '@/theme/tokens';

/**
 * Boas-vindas (D-125, estudo de 25/11/2026, sinal 19): o que o app faz, o teste grátis ("14 dias grátis, sem cartão") e um caminho
 * principal ("Criar conta") com um segundo à vista ("Ver a demonstração"). "Entrar" e o convite da empresa (D-078 E) continuam, como links
 * menores. No build de demonstração, "Ver a demonstração" entra na conta de demonstração; na versão publicada, abre a demonstração da web
 * no navegador (`DEMO_URL`), com dados fictícios. O título é o mesmo do site: desde a D-128 (Enzo, 26/11/2026, revisão da D-126), de novo
 * "Cuidar da vida financeira faz parte de cuidar de você.", sem frase pequena acima, com o benefício concreto no subtítulo logo abaixo.
 */
export default function BoasVindas() {
  const { auth } = useSession();
  const [opening, setOpening] = useState(false);
  // "Tenho um convite da empresa" (D-078 E): o convite abre antes de criar a conta ou entrar, com a empresa e o plano.
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState('');
  const [inviteError, setInviteError] = useState<string | undefined>();
  const demo = auth instanceof DemoAuth ? auth : null;
  // Celular deitado (revisão dos tamanhos de tela, 27/11/2026): a arte menor, para o título e o teste grátis aparecerem sem rolar tanto.
  const short = useShortLandscape();
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
  const seeDemo = async () => {
    if (demo) {
      setOpening(true);
      await demo.signInDemo();
      return;
    }
    await Linking.openURL(DEMO_URL).catch(() => {});
  };
  return (
    <AuthShell art={<View style={{ alignItems: 'center' }}><WelcomeArt width={short ? 120 : 220} /></View>}>
      {/* D-128: o título é a frase da marca, sem frase pequena acima dele, e o benefício concreto fica logo abaixo, como no site. */}
      <Txt variant="hero" style={{ fontSize: 26, lineHeight: 34 }} accessibilityRole="header">
        {WELCOME_TEXT.title}
      </Txt>
      <Txt color={colors.textSecondary}>{WELCOME_TEXT.subtitle}</Txt>
      {/* O teste grátis, logo antes do botão principal: sem cartão, e o que acontece depois. */}
      <View style={styles.trial}>
        <BadgeCheck size={22} color={colors.brandText} style={{ marginTop: 1 }} aria-hidden />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 16 }}>
            {WELCOME_TEXT.trial}
          </Txt>
          <Txt variant="caption" color={colors.textSecondary}>
            {WELCOME_TEXT.trialNote}
          </Txt>
        </View>
      </View>
      <View style={{ gap: space[3] }}>
        <Button label={WELCOME_TEXT.create} onPress={() => router.push('/criar-conta')} />
        {/* `DEMO_ENTRY_TEST_ID` só no build de demonstração: os roteiros de gravação conferem por ele que o build é o de demonstração (a versão
            publicada também tem o botão, que abre a demonstração da web no navegador). */}
        <Button
          label={opening ? WELCOME_TEXT.demoOpening : WELCOME_TEXT.demo}
          tone="soft"
          accessibilityHint={demo ? undefined : WELCOME_TEXT.demoHint}
          testID={demo ? DEMO_ENTRY_TEST_ID : undefined}
          onPress={seeDemo}
        />
        <Txt variant="caption" color={colors.textSecondary} style={{ textAlign: 'center' }}>
          {WELCOME_TEXT.demoNote}
        </Txt>
      </View>
      <View style={styles.signIn}>
        <Txt color={colors.textSecondary}>{WELCOME_TEXT.haveAccount}</Txt>
        <LinkButton label={WELCOME_TEXT.signIn} onPress={() => router.push('/entrar')} />
      </View>
      <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'flex-start' }}>
        <ShieldCheck size={18} color={colors.success} style={{ marginTop: 2 }} aria-hidden />
        <Txt variant="caption" color={colors.textSecondary} style={{ flex: 1 }}>
          {WELCOME_TEXT.privacy}
        </Txt>
      </View>
      <LinkButton
        label={ENTRY_INVITE_TEXT.open}
        color={colors.textSecondary}
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
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  trial: {
    flexDirection: 'row',
    gap: space[3],
    alignItems: 'flex-start',
    backgroundColor: colors.brandTint,
    borderRadius: radius.md,
    paddingVertical: space[3],
    paddingHorizontal: space[4],
  },
  signIn: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: space[1] },
});
