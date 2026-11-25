import {
  BUSINESS_INVITE_ROLES,
  BUSINESS_INVITE_TEXT,
  BUSINESS_PEOPLE_TEXT,
  BUSINESS_ROLE_HELP,
  BUSINESS_ROLE_LABEL,
  BUSINESS_TEXT,
  businessInviteLink,
  businessPeopleErrorText,
  deviceTimeZone,
  seatsLeftFor,
  inviteExpiryDay,
  type BusinessInviteRole,
  type BusinessInviteWrite,
} from '@clarevo/core';
import { Redirect, router } from 'expo-router';
import { Check, CircleAlert, Copy, Share2 } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { useNowMs } from '@/components/family-parts';
import { FormFooter } from '@/components/form-footer';
import { ContextPill, SubHeader } from '@/components/header';
import { ChoiceGroup } from '@/components/series-parts';
import { ErrorState, LoadingState } from '@/components/states';
import { Banner, Button, Card, Chip, Screen, Txt } from '@/components/ui';
import { CAN_COPY, canShareInvite, copyInvite, inviteBaseUrl, shareInvite } from '@/lib/invite-share';
import { KEYBOARD_BEHAVIOR } from '@/lib/keyboard';
import { useBusiness, useCreateBusinessInvite, usePlusStatus, useSharedBusinessPeople } from '@/state/business';
import { attemptFamily, useFamilyKeys } from '@/state/family';
import { colors, space } from '@/theme/tokens';

const T = BUSINESS_INVITE_TEXT;
const BACK = '/negocio';

type Notice = { tone: 'sucesso' | 'erro'; text: string } | null;

/**
 * Convidar para o negócio (D-116, D-120), só para quem administra e com o Plus aberto: escolhe o que a pessoa poderá fazer, gera o link e
 * abre o compartilhamento do aparelho. O link aparece só agora (o banco guarda apenas o resumo do código): se perder, cancela o convite e
 * gera outro. O mesmo desenho de Convidar para a Família. D-123: a terceira opção, "Contabilidade" (só vê e exporta), com as vagas dela à
 * parte (até 3 acessos, fora das 6 pessoas).
 */
export default function ConvidarNegocioScreen() {
  const business = useBusiness();
  const plus = usePlusStatus();
  const people = useSharedBusinessPeople(business.data);
  const create = useCreateBusinessInvite();
  const keys = useFamilyKeys();
  const nowMs = useNowMs();
  const [role, setRole] = useState<BusinessInviteRole>('membro');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ write: BusinessInviteWrite; link: string | null } | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const leave = () => (router.canGoBack() ? router.back() : router.replace(BACK));
  const header = <SubHeader title={T.inviteTitle} right={<ContextPill label={business.data?.name ?? BUSINESS_TEXT.context} fixed />} onBack={leave} />;
  const data = business.data;
  const list = people.data;
  // Com o Plus fechado (ou sem conseguir ler a chave), a tela não existe: volta a "Seu negócio" (D-120). Quem não administra lê a recusa
  // que o banco daria, sem formulário.
  const closed = Boolean(data && (plus.isError || (plus.data && !plus.data.open) || (list && !list.plusOpen)));
  if (closed) return <Redirect href={BACK} />;
  const refusal = data && data.role !== 'titular' ? 'sem_permissao' : null;

  if (refusal) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {header}
        <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
          <Card>
            <Txt>{businessPeopleErrorText(refusal)}</Txt>
          </Card>
          <Button label="Voltar" tone="soft" onPress={() => router.replace(BACK)} />
        </Screen>
      </View>
    );
  }

  if (!data || !list) {
    const failed = business.isError || people.isError;
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {header}
        <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
          {failed ? (
            <ErrorState message={BUSINESS_PEOPLE_TEXT.loadFailed} onRetry={() => (business.isError ? business.refetch() : people.refetch())} />
          ) : business.isPending || (data && (plus.isPending || people.isPending)) ? (
            <LoadingState label={BUSINESS_PEOPLE_TEXT.loading} />
          ) : (
            <Card style={{ gap: space[3] }}>
              <Txt>{BUSINESS_TEXT.accountHintNone}</Txt>
              <Button label={BUSINESS_TEXT.accountCreate} tone="soft" onPress={() => router.replace('/negocio/novo')} />
            </Card>
          )}
        </Screen>
      </View>
    );
  }

  // As vagas do papel escolhido: as 6 pessoas ou os 3 acessos de Contabilidade (D-123).
  const left = seatsLeftFor(list, role, nowMs);
  const seatsText = role === 'contabilidade' ? BUSINESS_PEOPLE_TEXT.accountantSeats(left) : BUSINESS_PEOPLE_TEXT.seats(left);
  const expiry = result ? inviteExpiryDay(result.write.invite.expiresAt, deviceTimeZone()) : null;

  /** `auto`: a folha que abre sozinha depois de gerar. Se o aparelho não tem compartilhamento, o link já está à vista e nada é dito. */
  async function share(link: string, auto = false) {
    const r = await shareInvite(T.shareMessage(data!.name, link), T.shareTitle);
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
      const r = await attemptFamily(keys, `convidar-negocio:${role}`, (key) => create.mutateAsync({ key, contextId: data!.id, role }));
      if (!r.ok) {
        setError(businessPeopleErrorText(r.code));
        return;
      }
      const link = r.value.code ? businessInviteLink(r.value.code, inviteBaseUrl()) : null;
      setResult({ write: r.value, link });
      // A folha de compartilhamento abre logo depois de gerar; o link continua à vista para copiar ou reenviar.
      if (link && canShareInvite()) void share(link, true);
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={KEYBOARD_BEHAVIOR}>
        {header}
        <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
          <Card style={{ gap: space[3] }}>
            <Txt variant="title" accessibilityRole="header" aria-level={2}>
              {T.linkTitle}
            </Txt>
            <Txt variant="label" color={colors.textSecondary}>
              {expiry ? BUSINESS_PEOPLE_TEXT.inviteRow(result.write.invite.role, expiry) : BUSINESS_ROLE_LABEL[result.write.invite.role]}
            </Txt>
            {result.link ? (
              <>
                <Txt
                  selectable
                  accessibilityLabel={`${T.linkTitle}: ${result.link}`}
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
                {/* Navegador sem compartilhamento (vários de computador): só "Copiar link", como botão principal (D-110). */}
                {canShareInvite() ? <Button label={T.share} icon={Share2} onPress={() => share(result.link!)} /> : null}
                {CAN_COPY ? <Button label={T.copy} icon={Copy} tone={canShareInvite() ? 'soft' : 'brand'} onPress={() => copy(result.link!)} /> : null}
                <Txt variant="caption" color={colors.textSecondary}>
                  {T.note}
                </Txt>
              </>
            ) : (
              <Banner tone="erro" icon={CircleAlert}>
                <Txt variant="label" color={colors.error}>
                  {T.lost}
                </Txt>
              </Banner>
            )}
          </Card>
          <Txt variant="caption" color={colors.textSecondary}>
            {BUSINESS_PEOPLE_TEXT.privacy}
          </Txt>
          <Button label={T.done} tone="soft" onPress={() => router.replace(BACK)} />
        </Screen>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={KEYBOARD_BEHAVIOR}>
      {header}
      <Screen contentStyle={{ padding: space[5], gap: space[4], paddingBottom: space[6] }}>
        <Card style={{ gap: space[4] }}>
          <ChoiceGroup label={T.roleLabel}>
            {BUSINESS_INVITE_ROLES.map((r) => (
              <Chip
                key={r}
                label={BUSINESS_ROLE_LABEL[r]}
                selected={role === r}
                onPress={() => {
                  setRole(r);
                  setError(null);
                }}
              />
            ))}
          </ChoiceGroup>
          <Txt variant="caption" color={colors.textSecondary}>
            {BUSINESS_ROLE_HELP[role]}
          </Txt>
          {role === 'contabilidade' ? (
            <Txt variant="caption" color={colors.textSecondary}>
              {T.accountantInviteNote}
            </Txt>
          ) : null}
        </Card>
        <Txt variant="caption" color={colors.textSecondary}>
          {seatsText}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {T.note}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {BUSINESS_PEOPLE_TEXT.privacy}
        </Txt>
      </Screen>
      <FormFooter error={error} onCancel={leave} submitLabel={T.generate} busy={busy} disabled={left === 0} onSubmit={submit} />
    </KeyboardAvoidingView>
  );
}
