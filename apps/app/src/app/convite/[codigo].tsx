import { FAMILY_ROLE_LABEL, FAMILY_TEXT, INVITE_TEXT, deviceTimeZone, familyErrorText, inviteExpiryDay, isRepoError, normalizeInviteCode } from '@clarevo/core';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { AuthShell } from '@/components/auth-shell';
import { SubHeader } from '@/components/header';
import { ErrorState, LoadingState } from '@/components/states';
import { Banner, Button, Card, Screen, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { pendingInvite } from '@/lib/invite-target';
import { restoreTarget } from '@/lib/nav';
import { attemptFamily, useAcceptFamilyInvite, useFamilyKeys } from '@/state/family';
import { useSession } from '@/state/session';
import { useSpaceStatus } from '@/state/space-status';
import { colors, space } from '@/theme/tokens';

const T = INVITE_TEXT;

/**
 * Convite para a Família (D-055), aberto pelo link: funciona na web e no app. Sem conta, leva a entrar ou criar a conta e volta para
 * cá; com conta, mostra a prévia (nome da Família, quem convidou, o que a pessoa poderá fazer e até quando vale) antes de aceitar.
 * O código fica só na memória da tela e do app. Um convite inexistente, usado, cancelado ou vencido diz sempre a mesma coisa.
 */
export default function ConviteScreen() {
  const { codigo } = useLocalSearchParams<{ codigo?: string }>();
  const code = normalizeInviteCode(codigo ?? '');
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
        <ErrorState message={FAMILY_TEXT.loadFailed} onRetry={retry} />
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
      <SubHeader title={T.title} onBack={leaveInvite} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>{children}</Screen>
    </View>
  );
}

/** Sai do convite: volta, ou vai ao início (com conta) ou às boas-vindas (sem conta). */
function leaveInvite() {
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

/** Sem conta: entra ou cria a conta e volta ao convite (a pilha guarda esta tela por baixo; o código fica na memória como reserva). */
function SignedOut({ code }: { code: string }) {
  return (
    <AuthShell title={T.title} subtitle={T.signedOut} back>
      <View style={{ gap: space[3] }}>
        <Button
          label={T.createAccount}
          onPress={() => {
            pendingInvite.set(code);
            router.push('/criar-conta');
          }}
        />
        <Button
          label={T.enter}
          tone="soft"
          onPress={() => {
            pendingInvite.set(code);
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

/**
 * Entrou, mas ainda não criou a primeira conta: a tela da primeira conta abre sozinha, uma vez, e o convite continua aqui por baixo
 * (ao terminar, a pessoa volta a ele). O botão cobre quem voltar sem terminar.
 */
function NeedsSpace({ code }: { code: string }) {
  useEffect(() => {
    pendingInvite.set(code);
    router.push('/primeira-conta');
  }, [code]);
  return (
    <Shell>
      <Card style={{ gap: space[3] }}>
        <Txt>{T.needSpace}</Txt>
        <Button
          label="Criar minha primeira conta"
          onPress={() => {
            pendingInvite.set(code);
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
  const accept = useAcceptFamilyInvite();
  const keys = useFamilyKeys();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // O convite que esperava a entrada já foi retomado: não sobra na memória.
  useEffect(() => {
    pendingInvite.clear();
  }, []);

  const preview = useQuery({
    queryKey: ['family-invite', user?.id ?? null, code],
    queryFn: () => repo!.previewFamilyInvite(code),
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
    const err = preview.error;
    // Só a falta de conexão é falha para tentar de novo; qualquer outra resposta do servidor é "convite indisponível".
    if (isRepoError(err, 'rede')) {
      return (
        <Shell>
          <ErrorState message={familyErrorText('rede')} onRetry={() => preview.refetch()} />
        </Shell>
      );
    }
    return <Unavailable />;
  }

  const p = preview.data;
  const day = inviteExpiryDay(p.expiresAt, deviceTimeZone());

  async function onAccept() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await attemptFamily(keys, `aceitar:${code}`, (key) => accept.mutateAsync({ key, code }));
      if (r.ok) {
        flash.set(T.accepted(r.value.context.name));
        restoreTarget('/familia');
        return;
      }
      if (r.code === 'convite_invalido' || r.code === 'convite_ja_usado') {
        setError(T.invalid);
        void preview.refetch();
        return;
      }
      setError(r.code === 'ja_em_familia' ? T.alreadyIn : r.code === 'familia_cheia' ? T.full : familyErrorText(r.code));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <Card style={{ gap: space[2] }}>
        <Txt variant="label" color={colors.textSecondary}>
          {T.invitedBy(p.invitedBy)}
        </Txt>
        <Txt variant="title" accessibilityRole="header" aria-level={2}>
          {p.familyName}
        </Txt>
        <Txt variant="label">{`${FAMILY_ROLE_LABEL[p.role]}. ${T.roleLine(p.role)}`}</Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {T.validUntil(day)}
        </Txt>
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
