import { BENEFIT_TEXT, companyErrorText, isRepoError, normalizeLicenseCode } from '@clarevo/core';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { AuthShell } from '@/components/auth-shell';
import { SubHeader } from '@/components/header';
import { ErrorState, LoadingState } from '@/components/states';
import { Banner, Button, Card, Screen, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { pendingBenefit } from '@/lib/invite-target';
import { restoreTarget } from '@/lib/nav';
import { useAcceptLicense } from '@/state/company';
import { attemptFamily, useFamilyKeys } from '@/state/family';
import { useSession } from '@/state/session';
import { useSpaceStatus } from '@/state/space-status';
import { colors, space } from '@/theme/tokens';

const T = BENEFIT_TEXT;

/**
 * Convite da empresa (D-056), aberto pelo link que o RH envia: funciona na web e no app. Sem conta, leva a entrar ou criar a conta e
 * volta para cá; com conta, mostra a prévia (o nome da organização e o plano) antes de aceitar. O código fica só na memória da tela e
 * do app. Um convite inexistente, usado, cancelado, vencido ou de outro e-mail diz sempre a mesma coisa.
 */
export default function BeneficioScreen() {
  const { codigo } = useLocalSearchParams<{ codigo?: string }>();
  const code = normalizeLicenseCode(codigo ?? '');
  const { ready, user } = useSession();
  const { status, retry } = useSpaceStatus();

  if (!ready || status === 'pendente') {
    return (
      <Shell>
        <LoadingState label={T.loading} />
      </Shell>
    );
  }
  if (!code) return <Unavailable />;
  if (!user || status === 'sem-sessao') return <SignedOut code={code} />;
  if (status === 'erro') {
    return (
      <Shell>
        <ErrorState message={companyErrorText('carregar_falhou')} onRetry={retry} />
      </Shell>
    );
  }
  if (status === 'sem-conta') return <NeedsSpace code={code} />;
  return <Preview code={code} />;
}

/** Cabeçalho comum das telas com conta. */
function Shell({ children }: { children: ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={T.title} onBack={leave} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>{children}</Screen>
    </View>
  );
}

/** Sai do convite: volta, ou vai ao início (com conta) ou às boas-vindas (sem conta). */
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Link sem código reconhecível, ou convite que o servidor não oferece: a mesma mensagem para todos os motivos. */
function Unavailable() {
  const { user } = useSession();
  return user ? (
    <Shell>
      <Card style={{ gap: space[3] }}>
        <Txt variant="title" accessibilityRole="header" aria-level={2}>
          {T.invalidTitle}
        </Txt>
        <Txt>{T.invalid}</Txt>
      </Card>
      <Button label={T.goHome} tone="soft" onPress={() => router.replace('/')} />
    </Shell>
  ) : (
    <AuthShell title={T.invalidTitle} subtitle={T.invalid} back>
      <Button label={T.enter} onPress={() => router.replace('/entrar')} />
    </AuthShell>
  );
}

/** Sem conta: entra ou cria a conta e volta ao convite (o código fica na memória como reserva). */
function SignedOut({ code }: { code: string }) {
  return (
    <AuthShell title={T.title} subtitle={T.signedOut} back>
      <View style={{ gap: space[3] }}>
        <Button
          label={T.createAccount}
          onPress={() => {
            pendingBenefit.set(code);
            router.push('/criar-conta');
          }}
        />
        <Button
          label={T.enter}
          tone="soft"
          onPress={() => {
            pendingBenefit.set(code);
            router.push('/entrar');
          }}
        />
      </View>
      <Txt variant="caption" color={colors.textSecondary}>
        {T.privacy}
      </Txt>
    </AuthShell>
  );
}

/** Entrou, mas ainda não criou a primeira conta: a tela da primeira conta abre sozinha, uma vez, e o convite continua por baixo. */
function NeedsSpace({ code }: { code: string }) {
  useEffect(() => {
    pendingBenefit.set(code);
    router.push('/primeira-conta');
  }, [code]);
  return (
    <Shell>
      <Card style={{ gap: space[3] }}>
        <Txt>{T.needSpace}</Txt>
        <Button
          label="Criar minha primeira conta"
          onPress={() => {
            pendingBenefit.set(code);
            router.push('/primeira-conta');
          }}
        />
      </Card>
    </Shell>
  );
}

/** Com conta: a prévia e a decisão. */
function Preview({ code }: { code: string }) {
  const { user, repo } = useSession();
  const accept = useAcceptLicense();
  const keys = useFamilyKeys();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // O convite que esperava a entrada já foi retomado: não sobra na memória.
  useEffect(() => {
    pendingBenefit.clear();
  }, []);

  const preview = useQuery({
    queryKey: ['benefit-invite', user?.id ?? null, code],
    queryFn: () => repo!.previewLicenseInvite(code),
    enabled: Boolean(repo),
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });

  if (preview.isPending) {
    return (
      <Shell>
        <LoadingState label={T.loading} />
      </Shell>
    );
  }
  if (preview.isError) {
    // Só a falta de conexão é falha para tentar de novo; qualquer outra resposta do servidor é "convite indisponível".
    if (isRepoError(preview.error, 'rede')) {
      return (
        <Shell>
          <ErrorState message={companyErrorText('rede')} onRetry={() => preview.refetch()} />
        </Shell>
      );
    }
    return <Unavailable />;
  }

  const p = preview.data;

  async function onAccept() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await attemptFamily(keys, `aceitar-beneficio:${code}`, (key) => accept.mutateAsync({ key, code }));
      if (r.ok) {
        flash.set(T.accepted(r.value.organizationName));
        restoreTarget('/conta');
        return;
      }
      if (r.code === 'convite_invalido') {
        setError(T.invalid);
        void preview.refetch();
        return;
      }
      setError(companyErrorText(r.code));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <Card style={{ gap: space[2] }}>
        <Txt variant="label" color={colors.textSecondary}>
          {T.invitedBy(p.organizationName)}
        </Txt>
        <Txt variant="title" accessibilityRole="header" aria-level={2}>
          {p.organizationName}
        </Txt>
        <Txt variant="label">{T.planLine(p.plan)}</Txt>
      </Card>
      <Txt color={colors.textSecondary}>{T.privacy}</Txt>
      {error ? (
        <Banner tone="erro">
          <Txt variant="label" color={colors.error}>
            {error}
          </Txt>
        </Banner>
      ) : null}
      <Button label={T.accept} busy={busy} busyLabel="Aceitando…" onPress={onAccept} />
      <Button label={T.notNow} tone="soft" disabled={busy} onPress={() => router.replace('/')} />
    </Shell>
  );
}
