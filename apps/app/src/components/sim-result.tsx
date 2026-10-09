import { SIMULATE_TEXT, simulationGoalPrefill, simulationResultLines, type IsoDate, type SimulationResult } from '@clarevo/core';
import { router } from 'expo-router';
import { Target } from 'lucide-react-native';
import { View } from 'react-native';

import { YearBars } from '@/components/sim-year-bars';
import { TermHint } from '@/components/term-hint';
import { Button, Txt, styles as ui } from '@/components/ui';
import { colors, fonts, space, tabular } from '@/theme/tokens';

const T = SIMULATE_TEXT;

/**
 * Cartão do resultado do simulador (D-028). De cima para baixo: o resultado em uma região viva educada (ou o texto de
 * espera), o ano a ano, as hipóteses (sempre visíveis, antes e depois do resultado) e "Criar meta com estes valores".
 * A linha de destaque vem do core; o resultado sem rendimento vem sempre ao lado, na própria lista de linhas.
 * Nada é gravado aqui: "Criar meta" só abre /meta/nova com os campos preenchidos, e a taxa nunca vai junto.
 */
export function SimResultCard({ result, hypotheses, today }: { result: SimulationResult | null; hypotheses: readonly string[]; today: IsoDate }) {
  const { intro, highlight, lines } = result?.texts ?? { intro: null, highlight: '', lines: [] };
  const goal = result ? simulationGoalPrefill(result, today) : null;
  return (
    <View style={[ui.card, { gap: space[3] }]}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {T.resultTitle}
      </Txt>

      {/* Sempre montada: a troca do texto de espera pelo resultado é anunciada (no iOS, por announceOnIOS). */}
      <View collapsable={false} style={{ gap: space[2] }} accessibilityLiveRegion="polite" aria-live="polite">
        {result ? (
          <>
            {intro ? <Txt color={colors.textSecondary}>{intro}</Txt> : null}
            <Txt style={[tabular, { fontFamily: fonts.extrabold, fontSize: 20, lineHeight: 28 }]}>{highlight}</Txt>
            {lines.map((line, i) => (
              <Txt key={`${i}-${line}`} style={tabular}>
                {line}
              </Txt>
            ))}
          </>
        ) : (
          <Txt color={colors.textSecondary}>{T.waiting}</Txt>
        )}
      </View>

      {result?.growth && result.months !== null ? (
        <>
          <YearBars growth={result.growth} months={result.months} />
          <TermHint term="Juros compostos" slug="juros-simples-compostos" />
        </>
      ) : null}

      <View style={{ gap: space[1] }}>
        <Txt variant="label" style={{ fontFamily: fonts.bold }} accessibilityRole="header" aria-level={3}>
          {T.hypothesesTitle}
        </Txt>
        {hypotheses.map((h, i) => (
          <View key={`${i}-${h}`} style={{ flexDirection: 'row', gap: space[2], alignItems: 'flex-start' }}>
            <Txt variant="label" color={colors.textSecondary} aria-hidden accessibilityElementsHidden importantForAccessibility="no">
              •
            </Txt>
            <Txt variant="label" color={colors.textSecondary} style={{ flex: 1 }}>
              {h}
            </Txt>
          </View>
        ))}
        <TermHint term="Como ler uma simulação" slug="simulacao" />
      </View>

      {goal ? (
        <View style={{ gap: space[2] }}>
          <Button
            label={T.createGoal}
            icon={Target}
            tone="soft"
            onPress={() =>
              router.push({
                pathname: '/meta/nova',
                // Só os campos da meta; a taxa e a inflação ficam na simulação. Campo em branco não vai no endereço.
                params: Object.fromEntries(Object.entries(goal).filter(([, v]) => v !== '')),
              })
            }
          />
          <Txt variant="caption" color={colors.textSecondary}>
            {T.createGoalHint}
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

/** O que o leitor de tela diz quando o resultado aparece (iOS: announceOnIOS; Android e web: a região viva). */
export function resultSpoken(result: SimulationResult): string {
  return simulationResultLines(result).join(' ');
}
