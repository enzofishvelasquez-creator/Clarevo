import { router, useLocalSearchParams } from 'expo-router';
import { AlertCircle, MailCheck } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AuthShell } from '@/components/auth-shell';
import { Banner, Button, LinkButton, Txt } from '@/components/ui';
import { AuthError, RESEND_INTERVAL_SECONDS, pendingCredentials } from '@/lib/auth';
import { DemoAuth } from '@/lib/demo-auth';
import { useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

export default function ConfirmarEmail() {
  const { email = '' } = useLocalSearchParams<{ email?: string }>();
  const { auth } = useSession();
  const [cooldown, setCooldown] = useState(RESEND_INTERVAL_SECONDS);
  const [message, setMessage] = useState<{ tone: 'erro' | 'info'; text: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  /** Consulta o estado real da conta: só entra se o provedor já confirmou o e-mail. */
  const check = async () => {
    const creds = pendingCredentials.get();
    if (!creds) {
      router.replace('/entrar');
      return;
    }
    setChecking(true);
    setMessage(null);
    try {
      await auth.signIn(creds.email, creds.password);
      pendingCredentials.clear();
    } catch (e) {
      const code = e instanceof AuthError ? e.code : 'desconhecido';
      if (code === 'email_nao_confirmado') {
        setMessage({ tone: 'info', text: `Ainda não identificamos a confirmação. Abra o link enviado para ${email} e tente de novo.` });
      } else if (code === 'rede') setMessage({ tone: 'erro', text: 'Sem conexão no momento. Tente novamente.' });
      else router.replace('/entrar');
    } finally {
      setChecking(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0 || sending) return;
    setSending(true);
    setMessage(null);
    try {
      await auth.resendConfirmation(email);
      setCooldown(RESEND_INTERVAL_SECONDS);
      setMessage({ tone: 'info', text: 'Enviamos um novo link.' });
    } catch (e) {
      if (e instanceof AuthError && e.code === 'aguarde' && e.retryAfterSeconds) setCooldown(e.retryAfterSeconds);
      else setMessage({ tone: 'erro', text: 'Não foi possível reenviar agora. Tente novamente em instantes.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <AuthShell
      art={
        <View style={{ alignItems: 'center' }}>
          <MailCheck size={56} color={colors.brand} />
        </View>
      }
      title="Confira seu e-mail">
      <Txt color={colors.textSecondary}>
        Enviamos um link de confirmação para <Txt style={{ fontWeight: '700' }}>{email}</Txt>. Abra o link para liberar sua conta. Seus
        registros só ficam disponíveis depois da confirmação.
      </Txt>
      {auth instanceof DemoAuth ? (
        <Banner tone="info">
          <Txt variant="label">Demonstração: nenhum e-mail é enviado.</Txt>
          <Button label="Simular abertura do link" tone="soft" onPress={() => auth.simulateConfirmation(email)} />
        </Banner>
      ) : null}
      {message ? (
        <Banner tone={message.tone} icon={message.tone === 'erro' ? AlertCircle : undefined}>
          <Txt variant="label" color={message.tone === 'erro' ? colors.error : colors.text}>
            {message.text}
          </Txt>
        </Banner>
      ) : null}
      <View style={{ gap: space[3] }}>
        <Button label="Já confirmei meu e-mail" busy={checking} busyLabel="Conferindo…" onPress={check} />
        <Button
          label={cooldown > 0 ? `Reenviar e-mail em ${cooldown} s` : 'Reenviar e-mail'}
          tone="soft"
          disabled={cooldown > 0}
          busy={sending}
          busyLabel="Enviando…"
          onPress={resend}
        />
      </View>
      <LinkButton label="Usar outro e-mail" onPress={() => router.replace('/criar-conta')} />
    </AuthShell>
  );
}
