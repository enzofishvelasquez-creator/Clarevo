import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { SubHeader } from '@/components/header';
import { Button, Card, Screen, Txt } from '@/components/ui';
import { topicBySlug } from '@/lib/topics';
import { colors, radius, space } from '@/theme/tokens';

/** Explicação aberta por cima da tarefa: voltar mantém o preenchimento do formulário. */
export default function ExplicacaoScreen() {
  const { tema } = useLocalSearchParams<{ tema: string }>();
  const topic = topicBySlug(tema ?? '');

  if (!topic) {
    return (
      <Screen contentStyle={{ padding: space[6], gap: space[4] }}>
        <Txt>Conteúdo não encontrado.</Txt>
        <Button label="Voltar" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
    <SubHeader title="Aprender" />
    <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
      <View style={{ backgroundColor: colors.accent, borderRadius: radius.lg, overflow: 'hidden' }} accessible={false}>
        <Svg width="100%" height={120} viewBox="0 0 320 120" preserveAspectRatio="xMidYMid slice">
          <Path d="M40 30C80 0 140 20 150 60C160 100 110 124 70 114C30 104 8 56 40 30Z" fill={colors.brand} />
          <Path d="M230 20C270 14 304 44 300 80C296 114 258 126 228 112C196 98 186 62 200 40C206 30 216 22 230 20Z" fill={colors.illustration} />
          <Rect x="128" y="34" width="70" height="52" rx="12" fill={colors.surface} />
          <Rect x="140" y="50" width="46" height="6" rx="3" fill="#E3E8F2" />
          <Rect x="140" y="64" width="30" height="6" rx="3" fill={colors.brand} />
        </Svg>
      </View>
      <Txt variant="title" style={{ fontSize: 22, lineHeight: 30 }} accessibilityRole="header">
        {topic.title}
      </Txt>
      {topic.paragraphs.map((p) => (
        <Txt key={p}>{p}</Txt>
      ))}
      <Card style={{ gap: space[1] }}>
        <Txt variant="label" color={colors.textSecondary}>
          Hipóteses do exemplo
        </Txt>
        <Txt variant="caption">{topic.hypotheses}</Txt>
      </Card>
      <Button label="Voltar à tarefa" onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))} />
    </Screen>
    </View>
  );
}
