import { FAMILY_ROLE_HELP, FAMILY_ROLE_LABEL, FAMILY_TEXT, INVITE_ROLES, deviceTimeZone, familyErrorText, inviteExpiryDay, inviteLink, roleIsOwner, seatsLeft, type FamilyInviteWrite, type InviteRole } from '@clarevo/core';
import { router } from 'expo-router';
import { Check, CircleAlert, Copy, Share2 } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { useNowMs } from '@/components/family-parts';
import { FormFooter } from '@/components/form-footer';
import { ContextPill, SubHeader } from '@/components/header';
import { ChoiceGroup } from '@/components/series-parts';
import { ErrorState, LoadingState } from '@/components/states';
import { Banner, Button, Card, Chip, Screen, Txt } from '@/components/ui';
import { CAN_COPY, copyInvite, inviteBaseUrl, shareInvite } from '@/lib/invite-share';
import { attemptFamily, useCreateFamilyInvite, useFamily, useFamilyKeys } from '@/state/family';
import { colors, space } from '@/theme/tokens';

const T = FAMILY_TEXT;
const BACK = '/familia';

type Notice = { tone: 'sucesso' | 'erro'; text: string } | null;

/**
 * Convidar para a Família (D-055), só para o titular: escolhe o que a pessoa poderá fazer, gera o link e abre o compartilhamento do
 * aparelho. O link aparece só agora (o banco guarda apenas o resumo do código): se perder, cancela o convite e gera outro.
 */
export default function ConvidarScreen() {
  const family = useFamily();
  const create = useCreateFamilyInvite();
  const keys = useFamilyKeys();
  const nowMs = useNowMs();
  const [role, setRole] = useState<InviteRole>('membro');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ write: FamilyInviteWrite; link: string | null } | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const header = <SubHeader title={T.inviteTitle} right={<ContextPill label="Família" fixed />} onBack={() => (router.canGoBack() ? router.back() : router.replace(BACK))} />;
  const data = family.data;

  if (!data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {header}
        <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
          {family.isError ? (
            <ErrorState message={T.loadFailed} onRetry={() => family.refetch()} />
          ) : family.isPending ? (
            <LoadingState label={T.loading} />
          ) : (
            <Card style={{ gap: space[3] }}>
              <Txt>{T.accountHintNone}</Txt>
              <Button label={T.accountCreate} tone="soft" onPress={() => router.replace('/familia/nova')} />
            </Card>
          )}
        </Screen>
      </View>
    );
  }

  if (!roleIsOwner(data.role)) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {header}
        <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
          <Card>
            <Txt>{familyErrorText('sem_permissao')}</Txt>
          </Card>
          <Button label="Voltar" tone="soft" onPress={() => router.replace(BACK)} />
        </Screen>
      </View>
    );
  }

  const left = seatsLeft(data, nowMs);
  const expiry = result ? inviteExpiryDay(result.write.invite.expiresAt, deviceTimeZone()) : null;

  /** `auto`: a folha que abre sozinha depois de gerar. Se o aparelho não tem compartilhamento, o link já está à vista e nada é dito. */
  async function share(link: string, auto = false) {
    const r = await shareInvite(T.shareMessage(data!.context.name, link), T.shareTitle);
    if (r === 'falhou' && !auto) setNotice({ tone: 'erro', text: T.shareFailed });
    else setNotice(null);
  }

  async function copy(link: string) {
    const ok = await copyInvite(link);
    setNotice(ok ? { tone: 'sucesso', text: T.copied } : { tone: 'erro', text: T.shareFailed });
  }

  async function submit() {
    if (busy || left === 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await attemptFamily(keys, `convidar:${role}`, (key) => create.mutateAsync({ key, contextId: data!.context.id, role }));
      if (!r.ok) {
        setError(familyErrorText(r.code));
        return;
      }
      const link = r.value.code ? inviteLink(r.value.code, inviteBaseUrl()) : null;
      setResult({ write: r.value, link });
      // A folha de compartilhamento abre logo depois de gerar; o link continua à vista para copiar ou reenviar.
      if (link) void share(link, true);
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {header}
        <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
          <Card style={{ gap: space[3] }}>
            <Txt variant="title" accessibilityRole="header" aria-level={2}>
              {T.inviteLinkTitle}
            </Txt>
            <Txt variant="label" color={colors.textSecondary}>
              {expiry ? T.inviteRow(result.write.invite.role, expiry) : FAMILY_ROLE_LABEL[result.write.invite.role]}
            </Txt>
            {result.link ? (
              <>
                <Txt
                  selectable
                  accessibilityLabel={`${T.inviteLinkTitle}: ${result.link}`}
                  style={[{ flexShrink: 1 }, Platform.OS === 'web' ? ({ wordBreak: 'break-all' } as object) : null]}>
                  {result.link}
                </Txt>
                {notice ? (
                  <Banner tone={notice.tone} icon={notice.tone === 'sucesso' ? Check : CircleAlert}>
                    <Txt variant="label" color={notice.tone === 'sucesso' ? colors.successText : colors.error}>
                      {notice.text}
                    </Txt>
                  </Banner>
                ) : null}
                <Button label={T.share} icon={Share2} onPress={() => share(result.link!)} />
                {CAN_COPY ? <Button label={T.copy} icon={Copy} tone="soft" onPress={() => copy(result.link!)} /> : null}
                <Txt variant="caption" color={colors.textSecondary}>
                  {T.inviteNote}
                </Txt>
              </>
            ) : (
              <Banner tone="erro" icon={CircleAlert}>
                <Txt variant="label" color={colors.error}>
                  {T.inviteLost}
                </Txt>
              </Banner>
            )}
          </Card>
          <Txt variant="caption" color={colors.textSecondary}>
            {T.privacy}
          </Txt>
          <Button label="Concluir" tone="soft" onPress={() => router.replace(BACK)} />
        </Screen>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {header}
      <Screen contentStyle={{ padding: space[5], gap: space[4], paddingBottom: space[6] }}>
        <Card style={{ gap: space[4] }}>
          <ChoiceGroup label={T.inviteRoleLabel}>
            {INVITE_ROLES.map((r) => (
              <Chip key={r} label={FAMILY_ROLE_LABEL[r]} selected={role === r} onPress={() => setRole(r)} />
            ))}
          </ChoiceGroup>
          <Txt variant="caption" color={colors.textSecondary}>
            {FAMILY_ROLE_HELP[role]}
          </Txt>
        </Card>
        <Txt variant="caption" color={colors.textSecondary}>
          {T.seats(left)}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {T.inviteNote}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {T.privacy}
        </Txt>
      </Screen>
      <FormFooter
        error={error}
        onCancel={() => (router.canGoBack() ? router.back() : router.replace(BACK))}
        submitLabel={T.inviteGenerate}
        busy={busy}
        disabled={left === 0}
        onSubmit={submit}
      />
    </KeyboardAvoidingView>
  );
}
