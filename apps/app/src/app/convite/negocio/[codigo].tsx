import {
  BUSINESS_INVITE_TEXT,
  BUSINESS_PEOPLE_TEXT,
  BUSINESS_ROLE_LABEL,
  businessPeopleErrorText,
  deviceTimeZone,
  inviteExpiryDay,
  isRepoError,
  normalizeInviteCode,
} from '@clarevo/core';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { AuthShell } from '@/components/auth-shell';
import { SubHeader } from '@/components/header';
import { ErrorState, LoadingState } from '@/components/states';
import { Banner, Button, Card, Screen, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { pendingBusinessInvite } from '@/lib/invite-target';
import { restoreTarget } from '@/lib/nav';
import { useAcceptBusinessInvite } from '@/state/business';
import { useView } from '@/state/data';
import { attemptFamily, useFamilyKeys } from '@/state/family';
import { useSession } from '@/state/session';
import { useSpaceStatus } from '@/state/space-status';
import { colors, space } from '@/theme/tokens';

const T = BUSINESS_INVITE_TEXT;

/**
 * Convite para um negócio (D-116, D-120), aberto pelo link `/convite/negocio/<código>`: funciona na web e no app, como o convite da
 * Família. Sem conta, leva a entrar ou criar a conta e volta para cá; com conta, mostra a prévia (o nome do negócio, quem convidou, o que
 * a pessoa poderá fazer e até quando vale) antes de aceitar. Aceitar troca o espaço do app para o negócio. O código fica só na memória da
 * tela e do app. Um convite inexistente, usado, cancelado ou vencido diz sempre a mesma coisa. D-123: o convite da Contabilidade diz que
 * a pessoa vai ver e exportar, sem anotar; aceitar não muda o espaço do app e leva a /contabilidade/<id> (fora dos espaços da pessoa).
 */
export default function ConviteNegocioScreen() {
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
        <ErrorState message={BUSINESS_PEOPLE_TEXT.loadFailed} onRetry={retry} />
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
            pendingBusinessInvite.set(code);
            router.push('/criar-conta');
          }}
        />
        <Button
          label={T.enter}
          tone="soft"
          onPress={() => {
            pendingBusinessInvite.set(code);
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
    pendingBusinessInvite.set(code);
    router.push('/primeira-conta');
  }, [code]);
  return (
    <Shell>
      <Card style={{ gap: space[3] }}>
        <Txt>{T.needSpace}</Txt>
        <Button
          label={T.createFirst}
          onPress={() => {
            pendingBusinessInvite.set(code);
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
  const { setSpace } = useView();
  const accept = useAcceptBusinessInvite();
  const keys = useFamilyKeys();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // O convite que esperava a entrada já foi retomado: não sobra na memória.
  useEffect(() => {
    pendingBusinessInvite.clear();
  }, []);

  const preview = useQuery({
    queryKey: ['business-invite', user?.id ?? null, code],
    queryFn: () => repo!.previewBusinessInvite(code),
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
          <ErrorState message={businessPeopleErrorText('rede')} onRetry={() => preview.refetch()} />
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
      const r = await attemptFamily(keys, `aceitar-negocio:${code}`, (key) => accept.mutateAsync({ key, code }));
      if (r.ok) {
        if (r.value.role === 'contabilidade') {
          // A Contabilidade não ganha um espaço: o seletor não muda, e o negócio abre na área "Negócios que você acompanha".
          flash.set(T.acceptedAccountant(r.value.context.name));
          restoreTarget(`/contabilidade/${r.value.context.id}`);
          return;
        }
        // Aceitar leva ao negócio: o seletor passa para ele e "Seu negócio" abre com o aviso.
        setSpace('negocio');
        flash.set(T.accepted(r.value.context.name));
        restoreTarget('/negocio');
        return;
      }
      if (r.code === 'convite_invalido' || r.code === 'convite_ja_usado') {
        setError(T.invalid);
        void preview.refetch();
        return;
      }
      setError(businessPeopleErrorText(r.code, true));
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
          {p.businessName}
        </Txt>
        <Txt variant="label">{`${BUSINESS_ROLE_LABEL[p.role]}. ${T.roleLine(p.role)}`}</Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {T.validUntil(day)}
        </Txt>
      </Card>
      <Txt color={colors.textSecondary}>{T.privacy}</Txt>
      <Txt variant="caption" color={colors.textSecondary}>
        {p.role === 'contabilidade' ? T.accountantNote : T.oneAtATime}
      </Txt>
      {error ? (
        <Banner tone="erro">
          <Txt variant="label" color={colors.error}>
            {error}
          </Txt>
        </Banner>
      ) : null}
      <Button label={T.accept} busy={busy} busyLabel={T.accepting} onPress={onAccept} />
      <Button label={T.notNow} tone="soft" disabled={busy} onPress={() => router.replace('/')} />
    </Shell>
  );
}
