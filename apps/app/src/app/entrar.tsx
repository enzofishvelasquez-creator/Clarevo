import { router, useLocalSearchParams } from 'expo-router';
import { AlertCircle, CheckCircle2 } from 'lucide-react-native';
import { useRef, useState } from 'react';
import type { TextInput } from 'react-native';

import { AuthShell } from '@/components/auth-shell';
import { Banner, Button, LinkButton, TextField, Txt } from '@/components/ui';
import { AuthError, emailProblem, pendingCredentials } from '@/lib/auth';
import { useSession } from '@/state/session';
import { colors } from '@/theme/tokens';

export default function Entrar() {
  const params = useLocalSearchParams<{ email?: string; aviso?: string }>();
  const { auth, linkProblem, clearLinkProblem } = useSession();
  const [email, setEmail] = useState(params.email ?? '');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const submit = async () => {
    if (busy) return;
    const e = emailProblem(email);
    setEmailError(e ?? undefined);
    if (e) return;
    if (!password) {
      setBanner('Não foi possível entrar. Confira e-mail e senha.');
      passwordRef.current?.focus();
      return;
    }
    setBusy(true);
    setBanner(null);
    try {
      await auth.signIn(email, password);
      pendingCredentials.clear();
    } catch (err) {
      const code = err instanceof AuthError ? err.code : 'desconhecido';
      if (code === 'email_nao_confirmado') {
        pendingCredentials.set(email.trim(), password);
        router.replace({ pathname: '/confirmar-email', params: { email: email.trim() } });
        return;
      }
      if (code === 'rede') setBanner('Sem conexão no momento. Seu e-mail foi mantido. Tente novamente.');
      else if (code === 'muitas_tentativas' || code === 'aguarde') setBanner('Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente.');
      else setBanner('Não foi possível entrar. Confira e-mail e senha.');
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell back title="Entrar">
      {params.aviso === 'senha-atualizada' ? (
        <Banner tone="sucesso" icon={CheckCircle2}>
          <Txt variant="label" color={colors.successText}>
            Senha atualizada. Entre com a nova senha.
          </Txt>
        </Banner>
      ) : null}
      {linkProblem ? (
        <Banner tone="erro" icon={AlertCircle}>
          <Txt variant="label" color={colors.error}>
            O link expirou ou já foi usado.
          </Txt>
          <Button
            label="Pedir novo link"
            tone="soft"
            onPress={() => {
              clearLinkProblem();
              router.push('/recuperar-acesso');
            }}
          />
        </Banner>
      ) : null}
      <TextField
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        inputMode="email"
        textContentType="emailAddress"
        error={emailError}
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextField
        ref={passwordRef}
        label="Senha"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={submit}
      />
      {banner ? (
        <Banner tone="erro" icon={AlertCircle}>
          <Txt variant="label" color={colors.error}>
            {banner}
          </Txt>
        </Banner>
      ) : null}
      <Button label="Entrar" busy={busy} busyLabel="Entrando…" onPress={submit} />
      <LinkButton label="Esqueci minha senha" onPress={() => router.push({ pathname: '/recuperar-acesso', params: { email } })} />
      <LinkButton label="Criar conta" color={colors.textSecondary} onPress={() => router.replace('/criar-conta')} />
    </AuthShell>
  );
}
