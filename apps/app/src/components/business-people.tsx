import {
  BUSINESS_PEOPLE_TEXT,
  BUSINESS_ROLE_HELP,
  BUSINESS_ROLE_LABEL,
  businessCanInvite,
  businessHasOthers,
  businessPeopleErrorText,
  businessSeatsLeft,
  deviceTimeZone,
  inviteExpiryDay,
  inviteIsValid,
  memberIsActionable,
  type BusinessContext,
  type BusinessInviteRole,
  type BusinessMember,
  type BusinessPeople,
} from '@clarevo/core';
import { router } from 'expo-router';
import { LogOut, UserPlus, Users } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceDialog } from '@/components/choice-dialog';
import { ConfirmDialog } from '@/components/dialog';
import { useNowMs } from '@/components/family-parts';
import { Banner, Button, Card, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { useView } from '@/state/data';
import {
  useCancelBusinessInvite,
  useLeaveBusiness,
  useRemoveBusinessMember,
  useSetBusinessMemberRole,
} from '@/state/business';
import { attemptFamily, useFamilyKeys } from '@/state/family';
import { colors, fonts, radius, space } from '@/theme/tokens';

const T = BUSINESS_PEOPLE_TEXT;

type Confirm = { kind: 'remover'; member: BusinessMember } | { kind: 'papel'; member: BusinessMember; to: BusinessInviteRole } | { kind: 'sair' };

/** Uma pessoa do negócio: primeiro nome, "(você)" e o papel ("Administra", "Anota e vê", "Só vê"); quem saiu, "Nina (saiu do negócio)". */
export function BusinessMemberLine({ member, trailing }: { member: BusinessMember; trailing?: ReactNode }) {
  const ex = member.status === 'ex-membro';
  return (
    <View
      style={styles.memberRow}
      accessible={!trailing}
      accessibilityLabel={trailing ? undefined : ex ? T.exMemberA11y(member.firstName) : T.memberA11y(member.firstName, member.role, member.isMe)}>
      <View style={[styles.avatar, { backgroundColor: ex ? colors.border : colors.brandTint }]}>
        <Users size={18} color={ex ? colors.textSecondary : colors.brandText} />
      </View>
      <View style={{ flex: 1 }}>
        <Txt variant="label" style={{ fontFamily: fonts.bold }} color={ex ? colors.textSecondary : colors.text}>
          {ex ? T.exMember(member.firstName) : T.memberLine(member.firstName, member.isMe)}
        </Txt>
        {ex ? null : (
          <Txt variant="caption" color={colors.textSecondary}>
            {BUSINESS_ROLE_LABEL[member.role]}
          </Txt>
        )}
      </View>
      {trailing}
    </View>
  );
}

/**
 * "Pessoas do negócio" em "Seu negócio" (D-116, D-120). Quem chama decide se a seção aparece (`businessPeopleVisible`): com o Plus fechado,
 * quem administra sozinha ou sozinho não vê nada novo. Quem administra vê as pessoas com "Gerenciar" (mudar o papel e remover, com
 * confirmação), as que saíram, os convites pendentes com "Cancelar convite", as vagas e "Convidar alguém" (só com o Plus aberto). Quem não
 * administra vê o próprio papel, as pessoas e "Sair do negócio". Nenhuma ação vale sem o servidor confirmar.
 */
export function BusinessPeopleSection({
  business,
  people,
  setNotice,
}: {
  business: BusinessContext;
  people: BusinessPeople;
  setNotice: (text: string | null) => void;
}) {
  const keys = useFamilyKeys();
  const nowMs = useNowMs();
  const { setSpace } = useView();
  const cancelInvite = useCancelBusinessInvite();
  const removeMember = useRemoveBusinessMember();
  const setRole = useSetBusinessMemberRole();
  const leave = useLeaveBusiness();

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [manage, setManage] = useState<BusinessMember | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const owner = people.role === 'titular';
  const ctx = business.id;
  const active = people.members.filter((m) => m.status === 'ativo');
  const ex = people.members.filter((m) => m.status === 'ex-membro');
  const invites = people.invites.filter((i) => inviteIsValid(i, nowMs));
  const left = businessSeatsLeft(people, nowMs);
  const canInvite = businessCanInvite(people);

  /** Roda uma ação: avisa só depois de o servidor confirmar; a recusa mostra o motivo e nada muda. */
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
      setError(businessPeopleErrorText(r.code));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const confirmAction = async () => {
    if (!confirm) return;
    const c = confirm;
    if (c.kind === 'remover') {
      await run(`remover:${c.member.personId}`, (key) => removeMember.mutateAsync({ key, contextId: ctx, personId: c.member.personId }), T.removed);
    } else if (c.kind === 'papel') {
      await run(`papel:${c.member.personId}:${c.to}`, (key) => setRole.mutateAsync({ key, contextId: ctx, personId: c.member.personId, role: c.to }), T.roleChanged);
    } else {
      const ok = await run('sair', (key) => leave.mutateAsync({ key, contextId: ctx }), T.left);
      if (ok) {
        // Sem o negócio, a tela volta a Conta com o aviso (como ao encerrar); o seletor volta ao Pessoal.
        setConfirm(null);
        setSpace('pessoal');
        flash.set(T.left);
        router.replace('/conta');
        return;
      }
    }
    setConfirm(null);
  };

  const cancelOne = async (id: string) => {
    await run(`cancelar:${id}`, (key) => cancelInvite.mutateAsync({ key, inviteId: id }), T.inviteCancelled);
  };

  const confirmText =
    confirm?.kind === 'remover'
      ? { title: T.removeTitle(confirm.member.firstName), body: T.removeBody, label: T.removeConfirm }
      : confirm?.kind === 'papel'
        ? { title: T.roleTitle(confirm.member.firstName, confirm.to), body: T.roleBody(confirm.to), label: T.roleConfirm }
        : { title: T.leaveTitle, body: T.leaveBody, label: T.leaveConfirm };

  return (
    <>
      <Card style={{ gap: space[3] }}>
        <View style={{ gap: space[1] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {T.title}
          </Txt>
          <Txt variant="label">{T.yourRole(people.role)}</Txt>
          <Txt variant="caption" color={colors.textSecondary}>
            {BUSINESS_ROLE_HELP[people.role]}
          </Txt>
        </View>
        {error ? (
          <Banner tone="erro">
            <Txt variant="label" color={colors.error}>
              {error}
            </Txt>
          </Banner>
        ) : null}
        {owner && !businessHasOthers(people) && people.plusOpen ? (
          <Txt color={colors.textSecondary}>{T.intro}</Txt>
        ) : null}
        <View>
          {active.map((m) => (
            <BusinessMemberLine
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
        </View>

        {ex.length > 0 ? (
          <View style={[styles.block, styles.divider]}>
            <Txt variant="label" accessibilityRole="header" aria-level={3} style={{ fontFamily: fonts.bold }}>
              {T.exMembersTitle}
            </Txt>
            {ex.map((m) => (
              <BusinessMemberLine key={`${m.personId}:${m.leftAt ?? ''}`} member={m} />
            ))}
            <Txt variant="caption" color={colors.textSecondary}>
              {T.exMembersNote}
            </Txt>
          </View>
        ) : null}

        {/* Os convites e "Convidar alguém" só com o Plus aberto: com ele fechado, quem administra continua vendo as pessoas (D-120). */}
        {owner && people.plusOpen ? (
          <View style={[styles.block, styles.divider]}>
            <Txt variant="label" accessibilityRole="header" aria-level={3} style={{ fontFamily: fonts.bold }}>
              {T.invitesTitle}
            </Txt>
            {invites.length === 0 ? (
              <Txt color={colors.textSecondary}>{T.invitesNone}</Txt>
            ) : (
              invites.map((i) => {
                const day = inviteExpiryDay(i.expiresAt, deviceTimeZone());
                return (
                  <View key={i.id} style={styles.inviteRow} accessible={false}>
                    <Txt variant="label" style={{ flex: 1, minWidth: 140 }} accessibilityLabel={T.inviteRowA11y(i.role, day)}>
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
            {canInvite ? (
              <Button label={T.invite} icon={UserPlus} disabled={left === 0 || busy} onPress={() => router.push('/negocio/convidar')} />
            ) : null}
          </View>
        ) : null}

        <View style={[styles.block, styles.divider]}>
          <Txt variant="caption" color={colors.textSecondary}>
            {T.privacy}
          </Txt>
          <Txt variant="caption" color={colors.textSecondary}>
            {T.oneAtATime}
          </Txt>
        </View>

        {owner ? null : <Button label={T.leave} icon={LogOut} tone="danger" disabled={busy} onPress={() => setConfirm({ kind: 'sair' })} />}
      </Card>

      <ChoiceDialog
        visible={manage !== null}
        title={manage ? T.manageTitle(manage.firstName) : ''}
        choices={
          manage
            ? [
                {
                  label: manage.role === 'membro' ? T.makeReader : T.makeMember,
                  onPress: () => {
                    setConfirm({ kind: 'papel', member: manage, to: manage.role === 'membro' ? 'leitor' : 'membro' });
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
        {manage ? (
          <Txt color={colors.textSecondary}>{BUSINESS_ROLE_HELP[manage.role]}</Txt>
        ) : null}
      </ChoiceDialog>

      <ConfirmDialog
        visible={confirm !== null}
        title={confirmText.title}
        cancelLabel={T.cancel}
        confirmLabel={confirmText.label}
        confirmTone={confirm?.kind === 'papel' ? 'brand' : 'danger'}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={confirmAction}>
        <Txt color={colors.textSecondary}>{confirmText.body}</Txt>
      </ConfirmDialog>
    </>
  );
}

const styles = StyleSheet.create({
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 48, paddingVertical: space[2] },
  avatar: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  block: { gap: space[2] },
  divider: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space[3] },
  inviteRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], flexWrap: 'wrap' },
});
