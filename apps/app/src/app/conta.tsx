import { AlertCircle, Check, KeyRound, LogOut, MonitorSmartphone } from 'lucide-react-native';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { ConfirmDialog } from '@/components/dialog';
import { AccountsCard } from '@/components/accounts-card';
import { PrivacyCard, RemindersCard } from '@/components/device-settings';
import { SubHeader } from '@/components/header';
import { TopicLink } from '@/components/topic-link';
import { Banner, Button, Card, Screen, Txt } from '@/components/ui';
import { AuthError, RESEND_INTERVAL_SECONDS } from '@/lib/auth';
import { signOutIntent } from '@/lib/nav';
import { useSpace } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, space } from '@/theme/tokens';

type Msg = { tone: 'erro' | 'sucesso' | 'info'; text: string } | null;

function Message({ msg }: { msg: Msg }) {
  if (!msg) return null;
  const color = msg.tone === 'erro' ? colors.error : msg.tone === 'sucesso' ? colors.successText : colors.text;
  return (
    <Banner tone={msg.tone} icon={msg.tone === 'erro' ? AlertCircle : Check}>
      <Txt variant="label" color={color}>
        {msg.text}
      </Txt>
    </Banner>
  );
}

/** Conta: perfil, suas contas (origem do dinheiro, D-043), segurança, lembretes, privacidade neste aparelho e situação do acesso ao plano. */
export default function ContaScreen() {
  const { user, auth, signOut } = useSession();
  const personal = useSpace().data;
  const [securityMsg, setSecurityMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState<'senha' | 'sessoes' | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [confirmAll, setConfirmAll] = useState(false);
  // ?secao=lembretes (vindo de Contas a pagar) ou ?secao=contas (o atalho "Gerenciar contas" dos seletores): rola até o card.
  const { secao } = useLocalSearchParams<{ secao?: string }>();
  const scroll = useRef<ScrollView>(null);
  const [remindersY, setRemindersY] = useState<number | null>(null);
  const [accountsY, setAccountsY] = useState<number | null>(null);
  useEffect(() => {
    const y = secao === 'lembretes' ? remindersY : secao === 'contas' ? accountsY : null;
    if (y !== null) scroll.current?.scrollTo({ y: Math.max(0, y - space[4]), animated: false });
  }, [secao, remindersY, accountsY]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  /** Alterar a senha pelo mesmo caminho seguro da recuperação: link no e-mail da conta. */
  const changePassword = async () => {
    if (!user || busy || cooldown > 0) return;
    setBusy('senha');
    setSecurityMsg(null);
    try {
      await auth.requestPasswordReset(user.email);
      setCooldown(RESEND_INTERVAL_SECONDS);
      setSecurityMsg({
        tone: 'info',
        text: auth.mode === 'demo' ? 'Demonstração: nenhum e-mail é enviado.' : `Enviamos um link para ${user.email}. Abra o link para definir a nova senha.`,
      });
    } catch (e) {
      if (e instanceof AuthError && e.code === 'aguarde' && e.retryAfterSeconds) setCooldown(e.retryAfterSeconds);
      else setSecurityMsg({ tone: 'erro', text: 'Não foi possível enviar agora. Tente novamente em instantes.' });
    } finally {
      setBusy(null);
    }
  };

  const signOutEverywhere = async () => {
    setBusy('sessoes');
    signOutIntent.mark();
    try {
      await signOut('global');
    } catch {
      setBusy(null);
      setConfirmAll(false);
      setSecurityMsg({ tone: 'erro', text: 'Não foi possível encerrar as sessões agora. Tente novamente.' });
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title="Conta" />
      <Screen scrollRef={scroll} contentStyle={{ padding: space[5], gap: space[4] }}>
        <Card style={{ gap: space[1] }}>
          <Txt variant="title">{user?.displayName}</Txt>
          <Txt color={colors.textSecondary}>{user?.email}</Txt>
          {auth.mode === 'demo' ? (
            <>
              <Txt variant="caption" color={colors.textSecondary}>
                Demonstração: acesso simulado e dados fictícios, guardados só neste aparelho enquanto o app está aberto.
              </Txt>
              <TopicLink slug="demonstracao" label="O que é a demonstração?" style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
            </>
          ) : null}
        </Card>

        <View onLayout={(e) => setAccountsY(e.nativeEvent.layout.y)}>
          <AccountsCard contextId={personal?.personalContextId} />
        </View>

        <Card style={{ gap: space[3] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            Segurança
          </Txt>
          <Txt variant="caption" color={colors.textSecondary}>
            Seus registros ficam protegidos por permissões no servidor: só você vê o contexto Pessoal.
          </Txt>
          <Message msg={securityMsg} />
          <Button
            label={cooldown > 0 ? `Alterar senha (novo envio em ${cooldown} s)` : 'Alterar senha'}
            icon={KeyRound}
            tone="soft"
            disabled={cooldown > 0}
            busy={busy === 'senha'}
            busyLabel="Enviando…"
            onPress={changePassword}
          />
          <Button label="Encerrar sessão em todos os aparelhos" icon={MonitorSmartphone} tone="soft" onPress={() => setConfirmAll(true)} />
        </Card>

        <View onLayout={(e) => setRemindersY(e.nativeEvent.layout.y)}>
          <RemindersCard />
        </View>
        <PrivacyCard />

        <Card style={{ gap: space[2] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            Acesso ao plano
          </Txt>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space[3] }}>
            <Txt variant="label" color={colors.textSecondary}>
              Situação
            </Txt>
            <Txt variant="label" style={{ fontFamily: fonts.bold }}>
              Plano pessoal
            </Txt>
          </View>
          <Txt variant="caption" color={colors.textSecondary}>
            Quando uma empresa oferecer o Clarevo como benefício, a validade e a cobertura aparecem aqui. A empresa administra seu acesso ao
            plano. Seus registros financeiros têm permissões próprias.
          </Txt>
        </Card>

        <Button
          label="Sair deste aparelho"
          icon={LogOut}
          tone="soft"
          onPress={() => {
            signOutIntent.mark();
            signOut();
          }}
        />
        <Txt variant="caption" color={colors.textSecondary} style={{ textAlign: 'center' }}>
          Sair encerra a sessão neste aparelho. Seus registros continuam guardados.
        </Txt>
      </Screen>

      <ConfirmDialog
        visible={confirmAll}
        title="Encerrar sessão em todos os aparelhos?"
        cancelLabel="Cancelar"
        confirmLabel="Encerrar sessões"
        confirmTone="brand"
        busy={busy === 'sessoes'}
        onCancel={() => setConfirmAll(false)}
        onConfirm={signOutEverywhere}>
        <Txt color={colors.textSecondary}>Você vai precisar entrar de novo em todos os aparelhos, inclusive neste. Seus registros continuam guardados.</Txt>
      </ConfirmDialog>
    </View>
  );
}
