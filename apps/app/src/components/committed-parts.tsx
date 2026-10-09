import { useEffect, useId, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg';

import { MoneyTxt } from '@/components/money-text';
import { Txt } from '@/components/ui';
import { maskMoneyLabel, maskMoneyText, useValuesHidden } from '@/lib/privacy';
import { colors, fonts, motion, space, tabular } from '@/theme/tokens';

/**
 * Peças da renda comprometida (D-026, spec2 §4.2): medidor, barra de grupo, legenda e destaque que nunca é cortado.
 * Cor nunca julga: o medidor é sempre o mesmo azul, não muda com o valor; o texto ao lado diz tudo.
 */

/** Valores em reais dentro de frases já montadas pelo core: "R$ ••••" e "valor oculto" com valores ocultos (A2). */
export function useMoneyMask() {
  const hidden = useValuesHidden();
  return {
    hidden,
    /** Texto mostrado. */
    text: (t: string) => maskMoneyText(t, hidden),
    /** Nome acessível. */
    label: (t: string) => maskMoneyLabel(t, hidden),
  };
}

/** Largura do preenchimento em %, de 0 a 100. A primeira exibição já vem no valor final; só muda depois, em 300 ms. */
function useFillStyle(permille: number) {
  const target = Math.max(0, Math.min(1000, permille)) / 10;
  const value = useSharedValue(target);
  const first = useRef(true);
  useEffect(() => {
    // Primeira exibição sem animação (CL-V008). Depois, só quando o valor muda, que só muda depois da resposta do
    // servidor (os números derivam do cache já confirmado). "Reduzir movimento" vai direto ao valor final.
    if (first.current) {
      first.current = false;
      return;
    }
    value.value = withTiming(target, { duration: motion.progress, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System });
  }, [target, value]);
  return useAnimatedStyle(() => ({ width: `${value.value}%` }));
}

/** Listras a 45° (3 px a cada 6 px na horizontal): o segmento "em aberto" não depende só da cor. */
function Stripes({ height }: { height: number }) {
  const id = `listras${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg width="100%" height={height} style={StyleSheet.absoluteFill} accessible={false}>
      <Defs>
        <Pattern id={id} patternUnits="userSpaceOnUse" width={6} height={6}>
          <Path d="M-1 7 L7 -1 M-1 1 L1 -1 M5 7 L7 5" stroke={colors.brandSoft} strokeWidth={2.12} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width="100%" height={height} fill={`url(#${id})`} />
    </Svg>
  );
}

/** Esconde de leitores de tela (o texto ao lado ou o nome do botão pai já diz tudo). */
const decorative = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants', 'aria-hidden': true } as const;

/**
 * Medidor da renda comprometida na escala da renda de referência (cheio em 100%). "Já pago" sólido e "Em aberto"
 * listrado, separados por 2 px de branco; o trilho tem contorno de 1 px, que marca os 100%. Acima de 100%: cheio, com
 * "+" no fim. 16 px na tela e 8 px no Resumo e em "Próximos meses".
 * label: a frase completa para leitor de tela; sem ele, o medidor é decorativo.
 */
export function Meter({
  paidPermille,
  openPermille,
  over = false,
  height = 8,
  label,
}: {
  paidPermille: number;
  openPermille: number;
  over?: boolean;
  height?: 8 | 16;
  label?: string;
}) {
  const paid = useFillStyle(paidPermille);
  const open = useFillStyle(openPermille);
  const inner = height - 2;
  const a11y = label === undefined ? decorative : ({ accessible: true, accessibilityRole: 'image', accessibilityLabel: label } as const);
  return (
    <View style={styles.meterRow} {...a11y}>
      <View style={[styles.track, { height, borderRadius: height / 2 }]}>
        <Animated.View style={[{ height: inner, backgroundColor: colors.brandDeep }, paid]} />
        <Animated.View style={[{ height: inner, overflow: 'hidden' }, open, paidPermille > 0 && styles.gap]}>
          <Stripes height={inner} />
        </Animated.View>
      </View>
      {over ? (
        <Txt variant="label" color={colors.text} style={styles.plus} maxFontSizeMultiplier={1.4}>
          +
        </Txt>
      ) : null}
    </View>
  );
}

/**
 * Barra fina de um grupo, na mesma escala da renda de referência. markPermille: traço de 2 px (a referência de 30% das
 * dívidas) com o rótulo abaixo. O nome do grupo e o valor ficam em texto: a barra é decorativa.
 */
export function GroupBar({ permille, markPermille, markLabel }: { permille: number; markPermille?: number; markLabel?: string }) {
  const fill = useFillStyle(permille);
  const marked = markPermille !== undefined;
  return (
    <View style={[styles.groupWrap, marked && { marginBottom: 20 }]} {...decorative}>
      <View style={[styles.track, { height: 8, borderRadius: 4 }]}>
        <Animated.View style={[{ height: 6, backgroundColor: colors.brand }, fill]} />
      </View>
      {marked ? (
        <>
          <View style={[styles.mark, { left: `${Math.max(0, Math.min(1000, markPermille)) / 10}%` }]} />
          {markLabel ? (
            <Txt variant="caption" color={colors.text} style={[styles.markLabel, { left: `${Math.max(0, Math.min(1000, markPermille)) / 10}%` }]} maxFontSizeMultiplier={1.4}>
              {markLabel}
            </Txt>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/** Quadradinho da legenda: "Já pago" sólido, "Em aberto" listrado. */
function Swatch({ kind }: { kind: 'pago' | 'aberto' }) {
  return (
    <View style={[styles.swatch, kind === 'pago' && { backgroundColor: colors.brandDeep }]} {...decorative}>
      {kind === 'aberto' ? <Stripes height={14} /> : null}
    </View>
  );
}

/**
 * Legenda do medidor: "Já pago · R$ 2.500,00" e "Em aberto · R$ 650,00", sempre em texto. Os valores seguem "Ocultar
 * valores" (A2): passe o texto do core como veio.
 */
export function MeterLegend({ paid, open }: { paid: string; open: string }) {
  return (
    <View style={styles.legend}>
      <View style={styles.legendItem}>
        <Swatch kind="pago" />
        <MoneyTxt variant="label" style={[tabular, { flexShrink: 1 }]}>
          {paid}
        </MoneyTxt>
      </View>
      <View style={styles.legendItem}>
        <Swatch kind="aberto" />
        <MoneyTxt variant="label" style={[tabular, { flexShrink: 1 }]}>
          {open}
        </MoneyTxt>
      </View>
    </View>
  );
}

/**
 * Número de destaque que nunca é cortado: reduz a fonte em degraus até caber (adjustsFontSizeToFit não funciona na web).
 */
export function FitText({ text, color = colors.text, maxSize = 36, minSize = 24, accessibilityLabel }: { text: string; color?: string; maxSize?: number; minSize?: number; accessibilityLabel?: string }) {
  const [width, setWidth] = useState(0);
  const fits = (size: number) => text.length * size * 0.62 <= width;
  let size = maxSize;
  if (width > 0) while (size > minSize && !fits(size)) size -= 2;
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ alignSelf: 'stretch' }}>
      <Txt
        variant="hero"
        color={color}
        style={[tabular, { fontSize: size, lineHeight: Math.round(size * 1.22) }]}
        maxFontSizeMultiplier={1.4}
        accessibilityLabel={accessibilityLabel}>
        {text}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  meterRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  track: {
    flex: 1,
    flexDirection: 'row',
    overflow: 'hidden',
    backgroundColor: colors.brandTint,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  // 2 px de branco entre "Já pago" e "Em aberto".
  gap: { borderLeftWidth: 2, borderLeftColor: colors.surface },
  plus: { fontFamily: fonts.extrabold, fontSize: 16, lineHeight: 20 },
  groupWrap: { position: 'relative', alignSelf: 'stretch' },
  mark: { position: 'absolute', top: -4, width: 2, height: 16, marginLeft: -1, backgroundColor: colors.text },
  markLabel: { position: 'absolute', top: 14, width: 32, marginLeft: -16, textAlign: 'center' },
  swatch: {
    width: 14,
    height: 14,
    borderRadius: 3,
    overflow: 'hidden',
    borderWidth: 0,
    backgroundColor: colors.brandTint,
  },
  legend: { gap: space[1] },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
});
