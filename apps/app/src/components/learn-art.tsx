import type { LearnSectionId } from '@clarevo/core';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';

import { colors } from '@/theme/tokens';

/**
 * Ilustrações das seções de Aprender (spec3 §3.9): decorativas, estáticas e ocultas para leitor de tela, em azul,
 * lima, coral (só detalhe) e branco. Nenhuma usa o símbolo C nem um arco aberto como forma principal.
 * - usar: cartão com linhas; organizar: calendário com um dia destacado; juros: degraus crescentes;
 *   tempo: broto em três alturas; dúvidas: dois balões.
 *
 * `background` é o quadrado de fundo (o lima precisa de fundo para aparecer sobre branco e sobre o próprio lima).
 */
export function LearnArt({ section, size = 48, background = colors.brandTint }: { section: LearnSectionId; size?: number; background?: string }) {
  return (
    <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 48 48" accessible={false}>
        <Rect x={0} y={0} width={48} height={48} rx={12} fill={background} />
        {ART[section]}
      </Svg>
    </View>
  );
}

/** Broto em três alturas (seção Dinheiro no tempo): posição do caule, topo e tamanho das folhas. */
const SPROUTS = [
  { x: 13, top: 31, size: 2.6 },
  { x: 24, top: 24, size: 3.2 },
  { x: 35, top: 16, size: 3.8 },
];

const ART: Record<LearnSectionId, ReactNode> = {
  usar: (
    <>
      <Rect x={7} y={11} width={34} height={26} rx={5} fill={colors.brand} />
      <Rect x={12} y={17} width={15} height={3.5} rx={1.75} fill={colors.surface} />
      <Rect x={12} y={23.5} width={24} height={3.5} rx={1.75} fill={colors.surface} opacity={0.7} />
      <Rect x={12} y={30} width={11} height={3.5} rx={1.75} fill={colors.accent} />
      <Circle cx={34.5} cy={18.75} r={2.5} fill={colors.illustration} />
    </>
  ),
  organizar: (
    <>
      <Rect x={8} y={11} width={32} height={29} rx={5} fill={colors.brand} />
      <Rect x={10.5} y={19} width={27} height={18.5} rx={3} fill={colors.surface} />
      <Rect x={15} y={7.5} width={3.5} height={7} rx={1.75} fill={colors.illustration} />
      <Rect x={29.5} y={7.5} width={3.5} height={7} rx={1.75} fill={colors.illustration} />
      {[0, 1, 2, 3].flatMap((c) =>
        [0, 1].map((r) =>
          c === 2 && r === 1 ? null : (
            <Rect key={`${c}-${r}`} x={13.5 + c * 5.5} y={22.5 + r * 6.5} width={3.5} height={3.5} rx={1} fill={colors.brand} opacity={0.35} />
          ),
        ),
      )}
      <Rect x={23.5} y={27.5} width={8.5} height={8.5} rx={2.5} fill={colors.accent} stroke={colors.brand} strokeWidth={1.5} />
    </>
  ),
  juros: (
    <>
      <Path d="M7 39 H15 V32 H23 V25 H31 V18 H40 V39 Z" fill={colors.brand} />
      <Rect x={7} y={39} width={33} height={2.5} rx={1.25} fill={colors.surface} />
      <Line x1={33} y1={18} x2={38} y2={18} stroke={colors.accent} strokeWidth={2.5} strokeLinecap="round" />
      <Line x1={25} y1={25} x2={29} y2={25} stroke={colors.accent} strokeWidth={2.5} strokeLinecap="round" />
      <Line x1={17} y1={32} x2={21} y2={32} stroke={colors.accent} strokeWidth={2.5} strokeLinecap="round" />
      <Circle cx={35.5} cy={11} r={3.5} fill={colors.illustration} />
    </>
  ),
  tempo: (
    <>
      <Rect x={6} y={37} width={36} height={3.5} rx={1.75} fill={colors.brand} />
      {SPROUTS.map(({ x, top, size }) => (
        <G key={x}>
          <Line x1={x} y1={37} x2={x} y2={top} stroke={colors.brand} strokeWidth={2.5} strokeLinecap="round" />
          {[-1, 1].map((side) => (
            <Ellipse
              key={side}
              cx={x + side * size * 0.9}
              cy={top - size * 0.35}
              rx={size}
              ry={size * 0.55}
              fill={colors.accent}
              stroke={colors.brand}
              strokeWidth={1.2}
              transform={`rotate(${side * -30} ${x + side * size * 0.9} ${top - size * 0.35})`}
            />
          ))}
        </G>
      ))}
      <Circle cx={9} cy={11} r={2.5} fill={colors.illustration} />
    </>
  ),
  duvidas: (
    <>
      <Rect x={6} y={9} width={25} height={17} rx={6} fill={colors.brand} />
      <Path d="M11 25 L10 31 L17 25 Z" fill={colors.brand} />
      <Rect x={11} y={15} width={15} height={3.5} rx={1.75} fill={colors.accent} />
      <Rect x={17} y={22} width={25} height={16} rx={6} fill={colors.surface} stroke={colors.brand} strokeWidth={1.5} />
      <Path d="M32 37.5 L37.5 43 L37 37.5 Z" fill={colors.brand} />
      <Circle cx={24} cy={30} r={1.8} fill={colors.brand} />
      <Circle cx={29.5} cy={30} r={1.8} fill={colors.brand} />
      <Circle cx={35} cy={30} r={1.8} fill={colors.illustration} />
    </>
  ),
};
