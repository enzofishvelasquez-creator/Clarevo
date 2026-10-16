import {
  CALC_UI_TEXT,
  ERROR_TEXT,
  FAMILY_ROLE_HELP,
  FAMILY_TEXT,
  INVITE_TEXT,
  canEndFamily,
  deviceTimeZone,
  familyErrorText,
  inviteCodeFromText,
  inviteExpiryDay,
  inviteIsValid,
  memberIsActionable,
  roleIsOwner,
  seatsLeft,
  type FamilyMember,
  type FamilyOverview,
} from '@clarevo/core';
import { router } from 'expo-router';
import { LogOut, Plus, ShieldCheck, Users } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { openCalc } from '@/components/calc/open';
import { ChoiceDialog } from '@/components/choice-dialog';
import { ConfirmDialog } from '@/components/dialog';
import { MemberLine, useIsSeededDemo, useNowMs } from '@/components/family-parts';
import { FlashBanner, useFlash } from '@/components/flash';
import { SubHeader } from '@/components/header';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Banner, Button, Card, LinkButton, Screen, TextField, Txt } from '@/components/ui';
import {
  attemptFamily,
  useCancelFamilyInvite,
  useEndFamily,
  useFamily,
  useFamilyKeys,
  useLeaveFamily,
  useRemoveFamilyMember,
  useSetMemberRole,
  useTransferFamilyOwnership,
} from '@/state/family';
import { colors, space } from '@/theme/tokens';

const T = FAMILY_TEXT;

type Confirm =
  | { kind: 'remover'; member: FamilyMember }
  | { kind: 'titularidade'; member: FamilyMember }
  | { kind: 'sair' }
  | { kind: 'encerrar' };

/**
 * Família (D-055). Sem Família: explica, oferece "Criar Família" e a entrada de quem recebeu um convite. Com Família: as pessoas e o
 * papel de cada uma, os ex-membros, os convites ainda válidos e as ações do titular; quem não é titular vê "Sair da Família".
 * Nenhuma ação vale sem o servidor confirmar, e o aviso de privacidade fica sempre à vista.
 */
export default function FamiliaScreen() {
  const family = useFamily();
  // Um só aviso para a tela: o que a tela anterior deixou ("Família criada.") e o resultado das ações daqui. Sair e encerrar trocam
  // a tela de "com Família" para "sem Família", e o aviso precisa sobreviver a essa troca.
  const [notice, setNotice] = useFlash();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={T.title} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        {family.isPending ? (
          <LoadingState label={T.loading} />
        ) : family.isError ? (
          <ErrorState message={T.loadFailed} onRetry={() => family.refetch()} />
        ) : family.data ? (
          <FamilyDetail data={family.data} notice={notice} setNotice={setNotice} />
        ) : (
          <NoFamily notice={notice} />
        )}
        <Pressable accessibilityRole="button" onPress={() => router.push('/quem-ve')} style={styles.privacy}>
          <ShieldCheck size={18} color={colors.textSecondary} />
          <Txt variant="label" color={colors.textSecondary}>
            Quem vê estes dados?
          </Txt>
        </Pressable>
      </Screen>
    </View>
  );
}

/** Sem Família: explicação, "Criar Família" (só com conta real), "Tenho um convite" e a calculadora de dividir contas. */
function NoFamily({ notice }: { notice: string | null }) {
  const demo = useIsSeededDemo();
  const [pasted, setPasted] = useState('');
  const [pasteError, setPasteError] = useState<string | undefined>();

  function seeInvite() {
    const code = inviteCodeFromText(pasted);
    if (!code) {
      setPasteError(INVITE_TEXT.pasteInvalid);
      return;
    }
    setPasteError(undefined);
    setPasted('');
    router.push({ pathname: '/convite/[codigo]', params: { codigo: code } });
  }

  return (
    <>
      <FlashBanner message={notice} />
      <Card>
        <EmptyState
          title={T.introTitle}
          art="familia"
          action={
            <View style={{ alignSelf: 'stretch', gap: space[3] }}>
              {demo ? (
                <Txt variant="label" color={colors.textSecondary} style={{ textAlign: 'center' }}>
                  {T.demoOnly}
                </Txt>
              ) : (
                <Button label={T.create} icon={Plus} onPress={() => router.push('/familia/nova')} />
              )}
              <LinkButton label={CALC_UI_TEXT.links.familia} icon={Users} onPress={() => openCalc('dividir-contas', { origem: 'familia' })} />
            </View>
          }>
          {T.intro}
        </EmptyState>
      </Card>
      <Txt variant="caption" color={colors.textSecondary}>
        {T.privacy}
      </Txt>
      <Txt variant="caption" color={colors.textSecondary}>
        {T.oneAtATime}
      </Txt>
      {demo ? null : (
        <Card style={{ gap: space[3] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {INVITE_TEXT.haveInvite}
          </Txt>
          <TextField
            label={INVITE_TEXT.pasteLabel}
            hint={INVITE_TEXT.pasteHint}
            value={pasted}
            onChangeText={(t) => {
              setPasted(t);
              setPasteError(undefined);
            }}
            error={pasteError}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={seeInvite}
          />
          <Button label={INVITE_TEXT.pasteSubmit} tone="soft" disabled={pasted.trim() === ''} onPress={seeInvite} />
        </Card>
      )}
    </>
  );
}

/** Com Família: pessoas, convites e ações. */
function FamilyDetail({ data, notice, setNotice }: { data: FamilyOverview; notice: string | null; setNotice: (text: string | null) => void }) {
  const keys = useFamilyKeys();
  const nowMs = useNowMs();
  const cancelInvite = useCancelFamilyInvite();
  const removeMember = useRemoveFamilyMember();
  const setRole = useSetMemberRole();
  const transfer = useTransferFamilyOwnership();
  const leave = useLeaveFamily();
  const end = useEndFamily();

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [manage, setManage] = useState<FamilyMember | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const owner = roleIsOwner(data.role);
  const ctx = data.context.id;
  const active = data.members.filter((m) => m.status === 'ativo');
  const ex = data.members.filter((m) => m.status === 'ex-membro');
  const invites = data.invites.filter((i) => inviteIsValid(i, nowMs));
  const left = seatsLeft(data, nowMs);

  /** Roda uma ação do titular ou da pessoa: avisa só depois de o servidor confirmar; a recusa mostra o motivo e nada muda. */
  async function run<R>(slot: string, work: (key: string) => Promise<R>, done: string): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await attemptFamily(keys, slot, work);
      if (r.ok) {
        setNotice(done);
        return true;
      }
      setError(familyErrorText(r.code));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const changeRole = async (m: FamilyMember) => {
    const to = m.role === 'membro' ? 'leitor' : 'membro';
    setManage(null);
    await run(`papel:${m.personId}:${to}`, (key) => setRole.mutateAsync({ key, contextId: ctx, personId: m.personId, role: to }), T.rolesChanged);
  };

  const confirmAction = async () => {
    if (!confirm) return;
    const c = confirm;
    let ok: boolean;
    if (c.kind === 'remover') {
      ok = await run(`remover:${c.member.personId}`, (key) => removeMember.mutateAsync({ key, contextId: ctx, personId: c.member.personId }), T.removed);
    } else if (c.kind === 'titularidade') {
      ok = await run(`titular:${c.member.personId}`, (key) => transfer.mutateAsync({ key, contextId: ctx, personId: c.member.personId }), T.transferred);
    } else if (c.kind === 'sair') {
      ok = await run('sair', (key) => leave.mutateAsync({ key, contextId: ctx }), T.left);
    } else {
      ok = await run('encerrar', (key) => end.mutateAsync({ key, contextId: ctx }), T.ended);
    }
    setConfirm(null);
    return ok;
  };

  const cancelOne = async (id: string) => {
    await run(`cancelar:${id}`, (key) => cancelInvite.mutateAsync({ key, inviteId: id }), T.inviteCancelled);
  };

  const confirmText =
    confirm?.kind === 'remover'
      ? { title: T.removeTitle(confirm.member.firstName), body: T.removeBody, label: T.removeConfirm }
      : confirm?.kind === 'titularidade'
        ? { title: T.transferTitle(confirm.member.firstName), body: T.transferBody, label: T.transferConfirm }
        : confirm?.kind === 'sair'
          ? { title: T.leaveTitle, body: T.leaveBody, label: T.leaveConfirm }
          : { title: T.endTitle, body: T.endBody, label: T.endConfirm };

  return (
    <>
      <FlashBanner message={notice} />
      {error ? (
        <Banner tone="erro">
          <Txt variant="label" color={colors.error}>
            {error}
          </Txt>
        </Banner>
      ) : null}

      <Card style={{ gap: space[1] }}>
        <Txt variant="title" accessibilityRole="header" aria-level={2}>
          {data.context.name}
        </Txt>
        <Txt variant="label">{T.yourRole(data.role)}</Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {FAMILY_ROLE_HELP[data.role]}
        </Txt>
      </Card>

      <Card style={{ gap: space[1] }}>
        <Txt variant="title" accessibilityRole="header" aria-level={2}>
          {T.peopleTitle}
        </Txt>
        {active.map((m) => (
          <MemberLine
            key={m.personId}
            member={m}
            trailing={
              owner && memberIsActionable(m) ? (
                <Button
                  label={T.manage}
                  tone="soft"
                  compact
                  accessibilityLabel={T.manageA11y(m.firstName, m.role)}
                  disabled={busy}
                  onPress={() => setManage(m)}
                />
              ) : null
            }
          />
        ))}
      </Card>

      {ex.length > 0 ? (
        <Card style={{ gap: space[1] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {T.exMembersTitle}
          </Txt>
          {ex.map((m) => (
            <MemberLine key={`${m.personId}:${m.leftAt ?? ''}`} member={m} />
          ))}
          <Txt variant="caption" color={colors.textSecondary}>
            {T.exMembersNote}
          </Txt>
        </Card>
      ) : null}

      {owner ? (
        <Card style={{ gap: space[3] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {T.invitesTitle}
          </Txt>
          {invites.length === 0 ? (
            <Txt color={colors.textSecondary}>{T.invitesNone}</Txt>
          ) : (
            invites.map((i) => {
              const day = inviteExpiryDay(i.expiresAt, deviceTimeZone());
              return (
                <View key={i.id} style={styles.inviteRow} accessible={false}>
                  <Txt variant="label" style={{ flex: 1 }} accessibilityLabel={T.inviteRowA11y(i.role, day)}>
                    {T.inviteRow(i.role, day)}
                  </Txt>
                  <Button
                    label={T.cancelInvite}
                    tone="soft"
                    compact
                    accessibilityLabel={T.cancelInviteA11y(i.role, day)}
                    disabled={busy}
                    onPress={() => cancelOne(i.id)}
                  />
                </View>
              );
            })
          )}
          <Txt variant="caption" color={colors.textSecondary}>
            {T.seats(left)}
          </Txt>
          <Button label={T.invite} icon={Plus} disabled={left === 0 || busy} onPress={() => router.push('/familia/convidar')} />
        </Card>
      ) : null}

      <Txt variant="caption" color={colors.textSecondary}>
        {T.privacy}
      </Txt>

      {owner ? (
        <Card style={{ gap: space[3] }}>
          {canEndFamily(data.members) ? (
            <Button label={T.end} tone="danger" disabled={busy} onPress={() => setConfirm({ kind: 'encerrar' })} />
          ) : (
            <Txt variant="caption" color={colors.textSecondary}>
              {T.endBlocked}
            </Txt>
          )}
          <Txt variant="caption" color={colors.textSecondary}>
            {T.ownerCannotLeave}
          </Txt>
        </Card>
      ) : (
        <Button label={T.leave} icon={LogOut} tone="danger" disabled={busy} onPress={() => setConfirm({ kind: 'sair' })} />
      )}

      <ChoiceDialog
        visible={manage !== null}
        title={manage ? T.manageTitle(manage.firstName) : ''}
        choices={
          manage
            ? [
                { label: manage.role === 'membro' ? T.makeReader : T.makeMember, onPress: () => changeRole(manage) },
                {
                  label: T.transfer,
                  onPress: () => {
                    setConfirm({ kind: 'titularidade', member: manage });
                    setManage(null);
                  },
                },
                {
                  label: T.remove,
                  onPress: () => {
                    setConfirm({ kind: 'remover', member: manage });
                    setManage(null);
                  },
                },
              ]
            : []
        }
        cancelLabel={T.cancel}
        onCancel={() => setManage(null)}>
        {manage ? <Txt color={colors.textSecondary}>{FAMILY_ROLE_HELP[manage.role]}</Txt> : null}
      </ChoiceDialog>

      <ConfirmDialog
        visible={confirm !== null}
        title={confirmText.title}
        cancelLabel={T.cancel}
        confirmLabel={confirmText.label}
        confirmTone={confirm?.kind === 'titularidade' ? 'brand' : 'danger'}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={confirmAction}>
        <Txt color={colors.textSecondary}>{confirmText.body}</Txt>
      </ConfirmDialog>
    </>
  );
}

const styles = StyleSheet.create({
  privacy: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: space[2], minHeight: 44 },
  inviteRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], flexWrap: 'wrap' },
});
