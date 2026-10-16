import { BENEFIT_TEXT, DELETE_TEXT, FAMILY_ROLE_HELP, FAMILY_TEXT, GOALS_TEXT, RETURN_TEXT, SAVINGS_TEXT } from '@clarevo/core';
import { router } from 'expo-router';
import { User } from 'lucide-react-native';
import { View } from 'react-native';

import { MemberLine } from '@/components/family-parts';
import { ContextPill, SubHeader } from '@/components/header';
import { TopicLink } from '@/components/topic-link';
import { Button, Card, LinkButton, Screen, Txt } from '@/components/ui';
import { useView } from '@/state/data';
import { useFamily } from '@/state/family';
import { useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

/** Nomes e permissões reais do contexto, sem selo genérico. */
export default function QuemVeScreen() {
  const { user } = useSession();
  const { space: kind } = useView();
  const family = useFamily().data;
  const inFamily = kind === 'familia' && family;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
    <SubHeader title="Quem vê estes dados?" right={<ContextPill label={kind === 'pessoal' ? 'Pessoal' : 'Família'} />} />
    <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
      {kind === 'pessoal' ? (
        <Card style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
          <User size={22} color={colors.brand} />
          <View style={{ flex: 1 }}>
            <Txt variant="label">{user?.displayName} (você)</Txt>
            <Txt variant="caption" color={colors.textSecondary}>
              Única pessoa que vê, anota, edita e exclui registros em Pessoal.
            </Txt>
          </View>
        </Card>
      ) : null}
      {inFamily ? (
        <>
          <Card style={{ gap: space[1] }}>
            <Txt variant="title" accessibilityRole="header" aria-level={2}>
              {family.context.name}
            </Txt>
            <Txt variant="caption" color={colors.textSecondary}>
              {FAMILY_TEXT.whoSeesIntro}
            </Txt>
            {family.members
              .filter((m) => m.status === 'ativo')
              .map((m) => (
                <View key={m.personId} style={{ gap: 0 }}>
                  <MemberLine member={m} />
                  <Txt variant="caption" color={colors.textSecondary} style={{ marginLeft: 36 + space[3], marginTop: -space[1] }}>
                    {FAMILY_ROLE_HELP[m.role]}
                  </Txt>
                </View>
              ))}
          </Card>
          <Txt color={colors.textSecondary}>{FAMILY_TEXT.whoSeesNote}</Txt>
          <Txt color={colors.textSecondary}>{FAMILY_TEXT.privacy}</Txt>
        </>
      ) : null}
      <Txt color={colors.textSecondary}>
        Se uma empresa oferecer o Clarevo como benefício, ela administra seu acesso ao plano. Seus registros financeiros têm permissões
        próprias e não ficam visíveis para a empresa.
      </Txt>
      {/* O que a empresa vê (D-056): e-mails que convidou, situação e datas das licenças; nunca finanças nem o uso do app. */}
      <Txt color={colors.textSecondary}>{BENEFIT_TEXT.whoSees}</Txt>
      {kind === 'pessoal' ? (
        <>
          {family ? <Txt color={colors.textSecondary}>{FAMILY_TEXT.privacy}</Txt> : null}
          <Txt color={colors.textSecondary}>
            Gastos fixos e parcelamentos também são só seus. A empresa que oferece o benefício não vê nada disso, nem em números somados aos de
            outras pessoas. Contas do ano, como IPVA, IPTU e matrícula, seguem a mesma regra.
          </Txt>
          {/* Revisão dos últimos meses (D-030(9)): só datas, lidas só pela própria pessoa. */}
          <Txt color={colors.textSecondary}>{RETURN_TEXT.privacy}</Txt>
          {/* Ciclos B, C e D: renda de referência, renda comprometida, metas e simulações. */}
          <Txt color={colors.textSecondary}>{GOALS_TEXT.whoSeesGoals}</Txt>
          {/* Plano de guardar (D-036): a resposta, o valor por mês e as datas de volta. */}
          <Txt color={colors.textSecondary}>{SAVINGS_TEXT.privacy}</Txt>
        </>
      ) : null}
      {/* Excluir a conta (D-058): o Pessoal é apagado de verdade, e o que foi anotado na Família continua sem nome. */}
      <Txt color={colors.textSecondary}>{DELETE_TEXT.whoSees}</Txt>
      <LinkButton label={DELETE_TEXT.whoSeesLink} onPress={() => router.push('/conta/excluir')} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
      <TopicLink slug="empresa-ve" label="A empresa vê meus gastos?" style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
      <Button label="Entendi" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
    </Screen>
    </View>
  );
}
