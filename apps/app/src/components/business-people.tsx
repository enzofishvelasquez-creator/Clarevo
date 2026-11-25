import {
  BUSINESS_PARTNERSHIP_TEXT,
  BUSINESS_PEOPLE_TEXT,
  BUSINESS_ROLE_HELP,
  BUSINESS_ROLE_LABEL,
  accountantSeatsLeft,
  businessCanInvite,
  businessHasOthers,
  businessPartnershipErrorText,
  businessPartnershipVisible,
  businessPeopleErrorText,
  businessSeatsLeft,
  businessTransferCandidates,
  canChangeRole,
  canTransferTo,
  deviceTimeZone,
  inviteExpiryDay,
  inviteIsValid,
  isAccountant,
  memberIsActionable,
  type BusinessContext,
  type BusinessMember,
  type BusinessMemberRole,
  type BusinessPeople,
} from '@clarevo/core';
import { router } from 'expo-router';
import { LogOut, UserPlus, Users } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceDialog, type DialogChoice } from '@/components/choice-dialog';
import { ConfirmDialog } from '@/components/dialog';
import { useNowMs } from '@/components/family-parts';
import { ChoiceGroup } from '@/components/series-parts';
import { Banner, Button, Card, Chip, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { useAccessCanWrite } from '@/state/access';
import { useView } from '@/state/data';
import {
  useCancelBusinessInvite,
  useLeaveBusiness,
  useRemoveBusinessMember,
  useSetBusinessMemberRole,
  useSetBusinessPartnership,
  useTransferBusinessAdmin,
} from '@/state/business';
import { attemptFamily, useFamilyKeys } from '@/state/family';
import { colors, fonts, radius, space } from '@/theme/tokens';

const T = BUSINESS_PEOPLE_TEXT;
const P = BUSINESS_PARTNERSHIP_TEXT;

type Confirm =
  | { kind: 'remover'; member: BusinessMember }
  | { kind: 'papel'; member: BusinessMember; to: BusinessMemberRole }
  | { kind: 'transferir'; member: BusinessMember }
  | { kind: 'sair' };

/**
 * Uma pessoa do negócio: primeiro nome, "(você)" e o papel ("Administra", "Anota e vê", "Só vê", "Contabilidade"); quem saiu, "Nina (saiu
 * do negócio)".
 */
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
 * "Pessoas do negócio" em "Seu negócio" (D-116, D-120, D-123). Quem chama decide se a seção aparece (`businessPeopleVisible`): com o Plus
 * fechado, quem administra sozinha ou sozinho não vê nada novo. Quem administra vê as pessoas com "Gerenciar" (mudar o papel, passar a
 * administração e remover, com confirmação; a Contabilidade só é removida), as que saíram, a pergunta da sociedade, os convites pendentes
 * com "Cancelar convite", as vagas e "Convidar alguém" (só com o Plus aberto). Quem não administra vê o próprio papel, as pessoas e "Sair do
 * negócio"; quem administra, com o Plus aberto, vê em "Sair do negócio" como sair (passar a administração antes, ou encerrar). Nenhuma ação
 * vale sem o servidor confirmar.
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
  // Em "só ver e exportar" (assinatura, D-083), a resposta da sociedade não grava (assinatura_necessaria): a pergunta some, como o tipo do
  // negócio em "Seu negócio".
  const canWrite = useAccessCanWrite();
  const cancelInvite = useCancelBusinessInvite();
  const removeMember = useRemoveBusinessMember();
  const setRole = useSetBusinessMemberRole();
  const transfer = useTransferBusinessAdmin();
  const leave = useLeaveBusiness();

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [manage, setManage] = useState<BusinessMember | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [ownerLeave, setOwnerLeave] = useState(false);

  const owner = people.role === 'titular';
  const ctx = business.id;
  const active = people.members.filter((m) => m.status === 'ativo');
  const ex = people.members.filter((m) => m.status === 'ex-membro');
  const invites = people.invites.filter((i) => inviteIsValid(i, nowMs));
  const left = businessSeatsLeft(people, nowMs);
  const accountantLeft = accountantSeatsLeft(people, nowMs);
  const canInvite = businessCanInvite(people);
  // Com o Plus aberto, quem administra encontra "Sair do negócio" e lê como sair (D-123); com ele fechado, nada novo aparece.
  const ownerSeesLeave = owner && people.plusOpen;

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
    } else if (c.kind === 'transferir') {
      await run(`transferir:${c.member.personId}`, (key) => transfer.mutateAsync({ key, contextId: ctx, personId: c.member.personId }), T.transferred(c.member.firstName));
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

  const confirmText: { title: string; body: string; note?: string; label: string } =
    confirm?.kind === 'remover'
      ? { title: T.removeTitle(confirm.member.firstName), body: isAccountant(confirm.member) ? T.removeAccountantBody : T.removeBody, label: T.removeConfirm }
      : confirm?.kind === 'papel'
        ? { title: T.roleTitle(confirm.member.firstName, confirm.to), body: T.roleBody(confirm.to), label: T.roleConfirm }
        : confirm?.kind === 'transferir'
          ? { title: T.transferTitle(confirm.member.firstName), body: T.transferBody(confirm.member.firstName), note: T.transferNote, label: T.transferConfirm }
          : { title: T.leaveTitle, body: T.leaveBody, label: T.leaveConfirm };

  /** As ações de "Gerenciar": mudar o papel (nunca da Contabilidade), passar a administração (só com o Plus aberto) e remover. */
  const manageChoices = (m: BusinessMember): DialogChoice[] => {
    const out: DialogChoice[] = [];
    if (canChangeRole(m)) {
      const to: BusinessMemberRole = m.role === 'membro' ? 'leitor' : 'membro';
      out.push({
        label: m.role === 'membro' ? T.makeReader : T.makeMember,
        onPress: () => {
          setConfirm({ kind: 'papel', member: m, to });
          setManage(null);
        },
      });
    }
    if (canTransferTo(people, m)) {
      out.push({
        label: T.transfer,
        onPress: () => {
          setConfirm({ kind: 'transferir', member: m });
          setManage(null);
        },
      });
    }
    out.push({
      label: T.remove,
      onPress: () => {
        setConfirm({ kind: 'remover', member: m });
        setManage(null);
      },
    });
    return out;
  };

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

        {/* A pergunta da sociedade (D-123): só quem administra, só com o Plus aberto e fora de "só ver e exportar". */}
        {businessPartnershipVisible(people) && canWrite ? <PartnershipBlock business={business} /> : null}

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
            <Txt variant="caption" color={colors.textSecondary}>
              {T.accountantSeats(accountantLeft)}
            </Txt>
            {canInvite ? (
              <Button label={T.invite} icon={UserPlus} disabled={(left === 0 && accountantLeft === 0) || busy} onPress={() => router.push('/negocio/convidar')} />
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

        {owner ? (
          ownerSeesLeave ? (
            <Button label={T.leave} icon={LogOut} tone="soft" disabled={busy} onPress={() => setOwnerLeave(true)} />
          ) : null
        ) : (
          <Button label={T.leave} icon={LogOut} tone="danger" disabled={busy} onPress={() => setConfirm({ kind: 'sair' })} />
        )}
      </Card>

      <ChoiceDialog
        visible={manage !== null}
        title={manage ? T.manageTitle(manage.firstName) : ''}
        choices={manage ? manageChoices(manage) : []}
        cancelLabel={T.cancel}
        onCancel={() => setManage(null)}>
        {manage ? <Txt color={colors.textSecondary}>{BUSINESS_ROLE_HELP[manage.role]}</Txt> : null}
      </ChoiceDialog>

      {/* Quem administra e quer sair (D-123): passar a administração antes, ou encerrar sem ninguém para receber. Só explica. */}
      <ChoiceDialog visible={ownerLeave} title={T.ownerLeaveTitle} choices={[]} cancelLabel={T.ownerLeaveOk} onCancel={() => setOwnerLeave(false)}>
        <Txt color={colors.textSecondary}>{businessTransferCandidates(people).length > 0 ? T.ownerLeaveBody : T.ownerLeaveAlone}</Txt>
      </ChoiceDialog>

      <ConfirmDialog
        visible={confirm !== null}
        title={confirmText.title}
        cancelLabel={T.cancel}
        confirmLabel={confirmText.label}
        confirmTone={confirm?.kind === 'papel' || confirm?.kind === 'transferir' ? 'brand' : 'danger'}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={confirmAction}>
        <Txt color={colors.textSecondary}>{confirmText.body}</Txt>
        {confirmText.note ? <Txt color={colors.textSecondary}>{confirmText.note}</Txt> : null}
      </ConfirmDialog>
    </>
  );
}

/**
 * "O negócio é uma sociedade?" (D-123): Sim ou Não enquanto não há resposta; depois, uma linha com a resposta e "Alterar". Com "Sim", a frase
 * de convidar as outras pessoas sócias e de passar a administração se precisar sair. A resposta não muda permissão nenhuma.
 */
function PartnershipBlock({ business }: { business: BusinessContext }) {
  const keys = useFamilyKeys();
  const save = useSetBusinessPartnership();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const value = business.businessPartnership;
  const slot = (v: boolean) => `sociedade:${business.id}:${v ? 'sim' : 'nao'}`;

  async function choose(v: boolean) {
    if (pending !== null) return;
    if (v === value) {
      setEditing(false);
      return;
    }
    setPending(v);
    setError(null);
    // Uma chave por resposta; escolher uma solta a da outra (uma tentativa incerta não volta a valer depois).
    keys.done(slot(!v));
    const r = await attemptFamily(keys, slot(v), (key) => save.mutateAsync({ key, contextId: business.id, partnership: v }));
    setPending(null);
    if (r.ok) setEditing(false);
    else setError(businessPartnershipErrorText(r.code));
  }

  return (
    <View style={[styles.block, styles.divider]}>
      {value !== null && !editing ? (
        <>
          <View style={styles.inviteRow} accessible={false}>
            <Txt variant="label" style={{ flex: 1, minWidth: 140, fontFamily: fonts.bold }} accessibilityLiveRegion="polite">
              {P.answer(value)}
            </Txt>
            <Button label={P.change} tone="soft" compact accessibilityLabel={P.changeA11y(value)} onPress={() => setEditing(true)} />
          </View>
          {value ? (
            <Txt variant="caption" color={colors.textSecondary}>
              {P.yesHint}
            </Txt>
          ) : null}
        </>
      ) : (
        <ChoiceGroup label={P.question} error={error ?? undefined}>
          <Chip label={P.yes} selected={(pending ?? value) === true} onPress={() => choose(true)} />
          <Chip label={P.no} selected={(pending ?? value) === false} onPress={() => choose(false)} />
        </ChoiceGroup>
      )}
      <Txt variant="caption" color={colors.textSecondary}>
        {P.why}
      </Txt>
      {value !== null && editing ? (
        <Button label={P.cancel} tone="soft" compact style={{ alignSelf: 'flex-start' }} onPress={() => setEditing(false)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 48, paddingVertical: space[2] },
  avatar: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  block: { gap: space[2] },
  divider: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space[3] },
  inviteRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], flexWrap: 'wrap' },
});
