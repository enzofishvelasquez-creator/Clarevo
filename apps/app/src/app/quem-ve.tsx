import {
  BUSINESS_PEOPLE_TEXT,
  BUSINESS_ROLE_HELP,
  BUSINESS_TEXT,
  DELETE_TEXT,
  FAMILY_ROLE_HELP,
  FAMILY_TEXT,
  WHO_SEES_TEXT,
  businessSharedNow,
} from '@clarevo/core';
import { router } from 'expo-router';
import { Building2, ShieldCheck, User, Users, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { BusinessMemberLine } from '@/components/business-people';
import { MemberLine } from '@/components/family-parts';
import { ContextPill, SubHeader } from '@/components/header';
import { TopicLink } from '@/components/topic-link';
import { Button, Card, LinkButton, Screen, Txt } from '@/components/ui';
import { useWideLayout } from '@/lib/layout';
import { useView } from '@/state/data';
import { useBusiness, useSharedBusinessPeople } from '@/state/business';
import { useFamily } from '@/state/family';
import { useSession } from '@/state/session';
import { colors, fonts, space } from '@/theme/tokens';

const T = WHO_SEES_TEXT;

/**
 * Nomes e permissões reais do contexto, sem selo genérico. Em duas listas curtas, "Quem vê" e "Quem não vê" (auditoria visual de
 * 18/11/2026: eram nove parágrafos, com "a empresa não vê" repetido quatro vezes), com os mesmos fatos (WHO_SEES_TEXT). Na Família, as
 * pessoas e o papel de cada uma; no espaço Negócio, só a própria pessoa, ou, com o negócio compartilhado (D-116, D-120), as pessoas do
 * negócio e o papel de cada uma, como na Família. Depois, o que acontece ao excluir a conta.
 */
export default function QuemVeScreen() {
  const { user } = useSession();
  const { space: kind } = useView();
  const family = useFamily().data;
  const inFamily = kind === 'familia' && family;
  const business = useBusiness().data;
  const inBusiness = kind === 'negocio' && business;
  const people = useSharedBusinessPeople(inBusiness ? business : null).data;
  // Negócio com outras pessoas ativas: a lista delas, como na Família; sozinha, "só você", como antes.
  const businessShared = Boolean(inBusiness && businessSharedNow(people));
  const name = user?.displayName ?? '';
  const wide = useWideLayout();
  // Computador: as notas pequenas param em 560 px (com 720 px, a linha passava de 120 letras) e "Entendi" cabe no texto, à esquerda.
  const note = wide ? styles.note : undefined;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
    <SubHeader title="Quem vê estes dados?" right={<ContextPill label={kind === 'pessoal' ? 'Pessoal' : kind === 'familia' ? 'Família' : (business?.name ?? BUSINESS_TEXT.context)} fixed />} />
    <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {T.seesTitle}
      </Txt>
      {inFamily ? (
        <Card style={{ gap: space[1] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={3}>
            {family.context.name}
          </Txt>
          <Txt variant="caption" color={colors.textSecondary} style={note}>
            {FAMILY_TEXT.whoSeesIntro}
          </Txt>
          {family.members
            .filter((m) => m.status === 'ativo')
            .map((m) => (
              <View key={m.personId} style={{ gap: 0 }}>
                <MemberLine member={m} />
                <Txt variant="caption" color={colors.textSecondary} style={[{ marginLeft: 36 + space[3], marginTop: -space[1] }, note]}>
                  {FAMILY_ROLE_HELP[m.role]}
                </Txt>
              </View>
            ))}
          <Txt variant="caption" color={colors.textSecondary} style={[{ marginTop: space[2] }, note]}>
            {FAMILY_TEXT.whoSeesNote}
          </Txt>
        </Card>
      ) : null}
      {businessShared && business && people ? (
        <Card style={{ gap: space[1] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={3}>
            {business.name}
          </Txt>
          <Txt variant="caption" color={colors.textSecondary} style={note}>
            {BUSINESS_PEOPLE_TEXT.whoSeesIntro}
          </Txt>
          {people.members
            .filter((m) => m.status === 'ativo')
            .map((m) => (
              <View key={m.personId} style={{ gap: 0 }}>
                <BusinessMemberLine member={m} />
                <Txt variant="caption" color={colors.textSecondary} style={[{ marginLeft: 36 + space[3], marginTop: -space[1] }, note]}>
                  {BUSINESS_ROLE_HELP[m.role]}
                </Txt>
              </View>
            ))}
          <Txt variant="caption" color={colors.textSecondary} style={[{ marginTop: space[2] }, note]}>
            {BUSINESS_PEOPLE_TEXT.whoSeesNote}
          </Txt>
        </Card>
      ) : null}
      <Card style={styles.list}>
        {inFamily || businessShared ? null : <Item icon={User} label={T.you(name)} text={inBusiness ? BUSINESS_TEXT.whoSees : T.personalYou} />}
        {/* O que a empresa vê (D-056): administra o acesso, os e-mails que convidou, a situação e as datas das licenças. */}
        <Item icon={Building2} label={T.companyLabel} text={T.companySees} />
        {/* A equipe da Clarevo (D-064, política seção 7, pergunta 14 ao advogado): a redação que a política propõe. */}
        <Item icon={ShieldCheck} label={T.teamLabel} text={T.team} />
      </Card>

      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {T.notSeesTitle}
      </Txt>
      <Card style={styles.list}>
        {/* O Pessoal (D-030(9), D-036, ciclos B, C e D): só a própria pessoa; com Família, o Pessoal de cada pessoa continua só dela. */}
        <Item
          icon={Users}
          label={T.othersLabel}
          text={
            inFamily
              ? FAMILY_TEXT.privacy
              : businessShared
                ? BUSINESS_PEOPLE_TEXT.whoSeesOthers
                : inBusiness
                  ? T.othersBusiness
                  : family
                    ? `${T.othersPersonal} ${FAMILY_TEXT.privacy}`
                    : T.othersPersonal
          }
        />
        {/* A empresa nunca vê finanças, nem somadas, nem o uso do app (D-056). */}
        <Item icon={Building2} label={T.companyLabel.replace(/, se houver$/, '')} text={T.companyNotSees} />
      </Card>

      {/* Excluir a conta (D-058): o Pessoal é apagado de verdade, e o que foi anotado na Família continua sem nome. */}
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {T.deletionTitle}
      </Txt>
      <Txt color={colors.textSecondary} style={wide ? styles.para : undefined}>
        {DELETE_TEXT.whoSees}
      </Txt>
      <LinkButton label={DELETE_TEXT.whoSeesLink} onPress={() => router.push('/conta/excluir')} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
      <TopicLink slug="empresa-ve" label="A empresa vê meus gastos?" style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
      <Button label="Entendi" style={wide ? styles.fit : undefined} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
    </Screen>
    </View>
  );
}

/** Uma linha das listas: o ícone, quem (em negrito) e o que vê ou não vê. */
function Item({ icon: Icon, label, text }: { icon: LucideIcon; label: string; text: string }) {
  const wide = useWideLayout();
  return (
    <View style={styles.item}>
      <Icon size={20} color={colors.brandText} style={{ marginTop: 2 }} aria-hidden />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt variant="label" style={{ fontFamily: fonts.bold }}>
          {label}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary} style={wide ? styles.note : undefined}>
          {text}
        </Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space[4] },
  item: { flexDirection: 'row', gap: space[3], alignItems: 'flex-start' },
  note: { maxWidth: 560 },
  // O parágrafo de 16 px em até 600 px (cerca de 80 letras por linha).
  para: { maxWidth: 600 },
  fit: { alignSelf: 'flex-start', minWidth: 220 },
});
