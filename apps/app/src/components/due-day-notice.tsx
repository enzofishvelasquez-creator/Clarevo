import { DUE_DAY_TEXT, type DueDayNotice as Notice } from '@clarevo/core';
import { CalendarOff, CircleQuestionMark } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';

import { Banner, LinkButton, Txt } from '@/components/ui';
import { colors, fonts, motion, radius, space } from '@/theme/tokens';

/**
 * Aviso de vencimento em sábado, domingo ou feriado nacional (D-060 item 3 e D-061): "Vence no domingo, 11/10/2026, que não é dia útil.
 * O próximo dia útil é terça, 13/10/2026. Só depois desse dia ela passa a vencida." e a frase neutra "Confira com quem cobra se o
 * pagamento pode ser feito no próximo dia útil.". Na conta do ano (sem a tolerância), "Impostos podem ter regra diferente. Confira a data
 * no carnê ou no site do órgão.". Com "Saiba mais" (a Lei 7.089/1983, o que pode variar, o entendimento do STJ, quais feriados contam e
 * quais não, as fontes e a data da consulta). A data de vencimento não muda, e o texto nunca promete que o pagamento no próximo dia
 * útil vale para qualquer cobrança nem que não há encargos.
 * O texto sempre acompanha o ícone (nunca só ícone ou cor); sem valores em reais, então nada se oculta com "Ocultar valores".
 */
export function DueDayNotice({ notice }: { notice: Notice }) {
  const [open, setOpen] = useState(false);
  return (
    <Banner tone="info" icon={CalendarOff} live={false}>
      <Txt variant="label" style={{ fontFamily: fonts.bold }}>
        {notice.text}
      </Txt>
      <Txt variant="label">{notice.advice}</Txt>
      <LinkButton
        label={DUE_DAY_TEXT.learnMore}
        icon={CircleQuestionMark}
        accessibilityLabel={DUE_DAY_TEXT.learnMoreA11y}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={() => setOpen((o) => !o)}
        style={styles.toggle}
      />
      {open ? (
        <Animated.View entering={FadeIn.duration(motion.context).reduceMotion(ReduceMotion.System)} style={styles.panel}>
          <Txt variant="label" style={{ fontFamily: fonts.bold }} accessibilityRole="header" aria-level={3}>
            {DUE_DAY_TEXT.learnMoreTitle}
          </Txt>
          {DUE_DAY_TEXT.learnMoreParagraphs.map((paragraph) => (
            <Txt key={paragraph} variant="label">
              {paragraph}
            </Txt>
          ))}
          <Txt variant="caption" color={colors.textSecondary}>
            {DUE_DAY_TEXT.source}
          </Txt>
        </Animated.View>
      ) : null}
    </Banner>
  );
}

/** Sinal discreto da lista, com texto: "Não é dia útil · vencimento anotado: domingo, 11/10" (conta do ano: "... · confira a data no carnê ou no site do órgão"). */
export function DueDaySign({ notice }: { notice: Notice }) {
  return (
    <View style={styles.sign}>
      <CalendarOff size={13} color={colors.textSecondary} style={styles.signIcon} aria-hidden />
      <Txt variant="caption" color={colors.textSecondary} style={{ flexShrink: 1 }}>
        {notice.signLine}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  panel: {
    backgroundColor: colors.accentTint,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
    borderRadius: radius.sm,
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    gap: space[2],
  },
  sign: { flexDirection: 'row', alignItems: 'flex-start', gap: space[1] },
  signIcon: { marginTop: 2 },
});
