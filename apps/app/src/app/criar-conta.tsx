import { router } from 'expo-router';
import { AlertCircle } from 'lucide-react-native';
import { useRef, useState } from 'react';
import type { TextInput } from 'react-native';

import { AuthShell } from '@/components/auth-shell';
import { Banner, Button, LinkButton, TextField, Txt } from '@/components/ui';
import { AuthError, PASSWORD_RULE, emailProblem, passwordProblem, pendingCredentials } from '@/lib/auth';
import { useSession } from '@/state/session';
import { colors } from '@/theme/tokens';

type Errors = Partial<Record<'name' | 'email' | 'password', string>>;

export default function CriarConta() {
  const { auth } = useSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refs = { name: useRef<TextInput>(null), email: useRef<TextInput>(null), password: useRef<TextInput>(null) };

  const submit = async () => {
    if (busy) return;
    const errs: Errors = {};
    if (!name.trim()) errs.name = 'Diga como podemos chamar você.';
    else if (name.trim().length > 80) errs.name = 'Use no máximo 80 caracteres.';
    const e = emailProblem(email);
    if (e) errs.email = e;
    const p = passwordProblem(password);
    if (p) errs.password = p;
    setErrors(errs);
    const first = (['name', 'email', 'password'] as const).find((k) => errs[k]);
    if (first) {
      refs[first].current?.focus();
      return;
    }
    setBusy(true);
    setBanner(null);
    try {
      await auth.signUp({ displayName: name, email, password });
      pendingCredentials.set(email.trim(), password);
      router.replace({ pathname: '/confirmar-email', params: { email: email.trim() } });
    } catch (err) {
      const code = err instanceof AuthError ? err.code : 'desconhecido';
      if (code === 'senha_fraca') setErrors({ password: PASSWORD_RULE });
      else if (code === 'aguarde' || code === 'muitas_tentativas') setBanner('Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente.');
      else setBanner('Não foi possível criar a conta agora. Seus dados foram mantidos. Tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell back title="Criar conta" subtitle="Leva menos de um minuto. Você confirma o e-mail e já começa a organizar o mês.">
      <TextField
        ref={refs.name}
        label="Nome de apresentação"
        value={name}
        onChangeText={setName}
        autoComplete="name"
        textContentType="name"
        error={errors.name}
        returnKeyType="next"
        onSubmitEditing={() => refs.email.current?.focus()}
      />
      <TextField
        ref={refs.email}
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        inputMode="email"
        textContentType="emailAddress"
        error={errors.email}
        returnKeyType="next"
        onSubmitEditing={() => refs.password.current?.focus()}
      />
      <TextField
        ref={refs.password}
        label="Senha"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        hint={PASSWORD_RULE}
        error={errors.password}
        onSubmitEditing={submit}
      />
      {banner ? (
        <Banner tone="erro" icon={AlertCircle}>
          <Txt variant="label" color={colors.error}>
            {banner}
          </Txt>
        </Banner>
      ) : null}
      <Button label="Criar conta" busy={busy} busyLabel="Criando…" onPress={submit} />
      <LinkButton label="Já tenho conta · Entrar" onPress={() => router.replace('/entrar')} />
    </AuthShell>
  );
}
