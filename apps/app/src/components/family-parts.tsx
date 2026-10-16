import { DEMO_EMAIL, DEMO_TODAY, FAMILY_ROLE_LABEL, FAMILY_TEXT, authorLabel, contextName, type ContextKind, type FamilyMember } from '@clarevo/core';
import { Users } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Txt } from '@/components/ui';
import { useFamily } from '@/state/family';
import { useSession } from '@/state/session';
import { colors, fonts, radius, space } from '@/theme/tokens';

/** A conta de demonstração com dados fictícios: nela não há Família de exemplo nem criação (D-055). */
export function useIsSeededDemo(): boolean {
  const { auth, user } = useSession();
  return auth.mode === 'demo' && user?.email === DEMO_EMAIL;
}

/** Uma pessoa da Família: primeiro nome, "(você)" e o papel; ex-membro como "ex-membro · Nome". */
export function MemberLine({ member, trailing }: { member: FamilyMember; trailing?: ReactNode }) {
  const ex = member.status === 'ex-membro';
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 48, paddingVertical: space[2] }}
      accessible={!trailing}
      accessibilityLabel={
        trailing ? undefined : ex ? FAMILY_TEXT.exMemberA11y(member.firstName) : FAMILY_TEXT.memberA11y(member.firstName, member.role, member.isMe)
      }>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: radius.pill,
          backgroundColor: ex ? colors.border : colors.brandTint,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Users size={18} color={ex ? colors.textSecondary : colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Txt variant="label" style={{ fontFamily: fonts.bold }} color={ex ? colors.textSecondary : colors.text}>
          {ex ? FAMILY_TEXT.exMember(member.firstName) : FAMILY_TEXT.memberLine(member.firstName, member.isMe)}
        </Txt>
        {ex ? null : (
          <Txt variant="caption" color={colors.textSecondary}>
            {FAMILY_ROLE_LABEL[member.role]}
          </Txt>
        )}
      </View>
      {trailing}
    </View>
  );
}

/**
 * "Agora" para vagas e validade dos convites: o relógio do aparelho; na demonstração, o dia fixo dela (o mesmo que a Família simulada
 * usa para emitir e vencer os convites).
 */
export function useNowMs(): number {
  const { auth } = useSession();
  return auth.mode === 'demo' ? Date.parse(`${DEMO_TODAY}T12:00:00.000Z`) : Date.now();
}

/**
 * De qual contexto é um registro, uma conta a pagar ou um gasto fixo que a tela mostra, e quem o anotou (L-6): no Pessoal é sempre a
 * própria pessoa; na Família, o primeiro nome ("Vera (você)", "Mauro") ou "ex-membro · Nome" para quem saiu. Pelo contexto do próprio
 * item, não pelo seletor: um item aberto por um endereço continua dizendo o contexto a que pertence.
 */
export function useAuthorship(contextId: string, createdBy: string): { kind: ContextKind; contextName: string; by: string } {
  const family = useFamily().data;
  const { user } = useSession();
  if (family && family.context.id === contextId) {
    return {
      kind: 'familia',
      contextName: contextName('familia'),
      by: authorLabel(family.members, createdBy) ?? 'outra pessoa da Família',
    };
  }
  return { kind: 'pessoal', contextName: contextName('pessoal'), by: createdBy === user?.id ? 'você' : 'outra pessoa' };
}
