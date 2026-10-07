import { router } from 'expo-router';
import { AlertCircle } from 'lucide-react-native';
import { useState } from 'react';

import { AuthShell } from '@/components/auth-shell';
import { Banner, Button, TextField, Txt } from '@/components/ui';
import { AuthError, PASSWORD_RULE, passwordProblem } from '@/lib/auth';
import { signOutIntent } from '@/lib/nav';
import { useSession } from '@/state/session';
import { colors } from '@/theme/tokens';

/** Aberta pelo link de recuperação. Sem sessão de recuperação válida, o link expirou ou já foi usado. */
export default function NovaSenha() {
  const { user, recovery, auth, signOut } = useSession();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user || !recovery) {
    return (
      <AuthShell title="Nova senha">
        <Banner tone="erro" icon={AlertCircle}>
          <Txt variant="label" color={colors.error}>
            O link expirou ou já foi usado.
          </Txt>
        </Banner>
        <Button label="Pedir novo link" onPress={() => router.replace('/recuperar-acesso')} />
        <Button label="Voltar para Entrar" tone="soft" onPress={() => router.replace('/entrar')} />
      </AuthShell>
    );
  }

  const submit = async () => {
    if (busy) return;
    const p = passwordProblem(password);
    setError(p ?? undefined);
    if (p) return;
    setBusy(true);
    setBanner(null);
    try {
      await auth.updatePassword(password);
      signOutIntent.mark();
      await signOut();
      router.replace({ pathname: '/entrar', params: { email: user.email, aviso: 'senha-atualizada' } });
    } catch (e) {
      if (e instanceof AuthError && e.code === 'senha_fraca') setError(PASSWORD_RULE);
      else if (e instanceof AuthError && e.code === 'sem_sessao') setBanner('O link expirou ou já foi usado.');
      else setBanner('Não foi possível salvar a nova senha. Tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Nova senha" subtitle={`Defina uma nova senha para ${user.email}.`}>
      <TextField
        label="Nova senha"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        hint={PASSWORD_RULE}
        error={error}
        onSubmitEditing={submit}
      />
      {banner ? (
        <Banner tone="erro" icon={AlertCircle}>
          <Txt variant="label" color={colors.error}>
            {banner}
          </Txt>
        </Banner>
      ) : null}
      <Button label="Salvar nova senha" busy={busy} busyLabel="Salvando…" onPress={submit} />
    </AuthShell>
  );
}
