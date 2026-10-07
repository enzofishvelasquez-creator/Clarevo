import { router, useLocalSearchParams } from 'expo-router';
import { AlertCircle, MailCheck } from 'lucide-react-native';
import { useEffect, useState } from 'react';

import { AuthShell } from '@/components/auth-shell';
import { Banner, Button, LinkButton, TextField, Txt } from '@/components/ui';
import { AuthError, RESEND_INTERVAL_SECONDS, emailProblem } from '@/lib/auth';
import { DemoAuth } from '@/lib/demo-auth';
import { useSession } from '@/state/session';
import { colors } from '@/theme/tokens';

const NEUTRAL = 'Se houver uma conta com esse endereço, você receberá as instruções para recuperar o acesso.';

export default function RecuperarAcesso() {
  const params = useLocalSearchParams<{ email?: string }>();
  const { auth } = useSession();
  const [email, setEmail] = useState(params.email ?? '');
  const [error, setError] = useState<string | undefined>();
  const [sent, setSent] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submit = async () => {
    if (busy || cooldown > 0) return;
    const e = emailProblem(email);
    setError(e ?? undefined);
    if (e) return;
    setBusy(true);
    setBanner(null);
    try {
      await auth.requestPasswordReset(email);
      setSent(true);
      setCooldown(RESEND_INTERVAL_SECONDS);
    } catch (err) {
      if (err instanceof AuthError && err.code === 'aguarde' && err.retryAfterSeconds) {
        setSent(true);
        setCooldown(err.retryAfterSeconds);
      } else if (err instanceof AuthError && err.code === 'rede') setBanner('Sem conexão no momento. Seu e-mail foi mantido. Tente novamente.');
      else setBanner('Não foi possível enviar agora. Tente novamente em instantes.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Recuperar acesso" subtitle="Informe o e-mail da sua conta. Enviaremos um link para você definir uma nova senha.">
      <TextField
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        inputMode="email"
        error={error}
        onSubmitEditing={submit}
      />
      {sent ? (
        <Banner tone="info" icon={MailCheck}>
          <Txt variant="label">{NEUTRAL}</Txt>
          {auth instanceof DemoAuth ? (
            <Button
              label="Demonstração: simular abertura do link"
              tone="soft"
              onPress={() => {
                if (!auth.simulateRecoveryLink(email)) setBanner('Demonstração: nenhuma conta simulada com esse e-mail.');
              }}
            />
          ) : null}
        </Banner>
      ) : null}
      {banner ? (
        <Banner tone="erro" icon={AlertCircle}>
          <Txt variant="label" color={colors.error}>
            {banner}
          </Txt>
        </Banner>
      ) : null}
      <Button
        label={cooldown > 0 ? `Enviar novamente em ${cooldown} s` : sent ? 'Enviar novamente' : 'Enviar link'}
        disabled={cooldown > 0}
        busy={busy}
        busyLabel="Enviando…"
        onPress={submit}
      />
      <LinkButton label="Voltar para Entrar" onPress={() => router.replace('/entrar')} />
    </AuthShell>
  );
}
