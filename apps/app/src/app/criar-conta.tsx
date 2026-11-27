import { DEMO_TEXT, INVITE_BASE_URL, LEGAL_TEXT, SIGNUP_TEXT, signupConsentParts } from '@clarevo/core';
import { router, useLocalSearchParams } from 'expo-router';
import { AlertCircle, Info } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Linking, type TextInput } from 'react-native';

import { AuthShell } from '@/components/auth-shell';
import { SiteTextLink } from '@/components/site-link';
import { Banner, Button, LinkButton, TextField, Txt } from '@/components/ui';
import { AuthError, PASSWORD_RULE, emailProblem, passwordProblem, pendingCredentials } from '@/lib/auth';
import { rememberChosenPlan } from '@/lib/chosen-plan';
import { SITE_URL } from '@/lib/site';
import { useSession } from '@/state/session';
import { colors } from '@/theme/tokens';

type Errors = Partial<Record<'name' | 'email' | 'password', string>>;

/**
 * Criar conta. O link de cadastro do site (`/criar-conta`) chega aqui direto, sem passar pelas boas-vindas, para quem está sem sessão (a
 * tela de carregamento decide, `signupEntryTarget` em lib/nav.ts; jornada de compra de 27/11/2026): no alto, a linha do teste grátis
 * (`SIGNUP_TEXT.trial`, verdadeira antes e depois do início da cobrança); o plano e o período escolhidos no site
 * (`?plano=individual|familia&periodo=mensal|anual`) ficam só neste aparelho, para a tela Assinatura abrir com eles. Voltar leva às
 * boas-vindas (aberta direto, sem tela antes na pilha) e "Já tenho conta · Entrar" a Entrar, como antes.
 */
export default function CriarConta() {
  const { auth } = useSession();
  const params = useLocalSearchParams();
  // O plano do site: guardado uma vez, ao abrir (parâmetros inválidos não guardam nada).
  useEffect(() => {
    rememberChosenPlan(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
    if (!name.trim()) errs.name = 'Diga como a Clarevo pode chamar você.';
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
      else if (code === 'aguarde' || code === 'muitas_tentativas') setBanner('Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.');
      else setBanner('Não foi possível criar a conta agora. Seus dados foram mantidos. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell back title={SIGNUP_TEXT.title} note={SIGNUP_TEXT.trial} subtitle={SIGNUP_TEXT.subtitle}>
      {auth.mode === 'demo' ? (
        <Banner tone="info" icon={Info}>
          <Txt variant="label">{DEMO_TEXT.signUpNotice}</Txt>
          <Button label={DEMO_TEXT.openApp} tone="soft" onPress={() => Linking.openURL(`${INVITE_BASE_URL}/criar-conta`).catch(() => {})} />
        </Banner>
      ) : null}
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
      {/* Aceite (D-064): texto curto acima do botão, sem caixa de seleção por enquanto (pergunta 25 ao advogado). Os dois nomes só
          viram links quando há endereço do site (`EXPO_PUBLIC_SITE_URL`); sem endereço, o texto sai sem link. */}
      <Txt variant="caption" color={colors.textSecondary}>
        {signupConsentParts().map((part, i) =>
          part.page && SITE_URL ? (
            <SiteTextLink key={i} page={part.page} onFail={() => setBanner(LEGAL_TEXT.account.openFailed)}>
              {part.text}
            </SiteTextLink>
          ) : (
            part.text
          ),
        )}
      </Txt>
      <Button label="Criar conta" busy={busy} busyLabel="Criando…" onPress={submit} />
      <LinkButton label="Já tenho conta · Entrar" onPress={() => router.replace('/entrar')} />
    </AuthShell>
  );
}
