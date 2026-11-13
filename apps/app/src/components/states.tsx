import { RotateCcw } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { Button, Txt } from '@/components/ui';
import { colors, radius, space } from '@/theme/tokens';

/** Ilustração orgânica: formas abertas em lima e azul, com um cartão de anotação. */
export function WelcomeArt({ width = 300 }: { width?: number }) {
  return (
    <Animated.View entering={FadeInDown.duration(300).reduceMotion(ReduceMotion.System)}>
    <Svg width={width} height={width * 0.72} viewBox="0 0 300 216" accessible={false}>
      <Path d="M70 20C112 4 150 30 156 72C162 116 132 150 92 156C50 162 12 138 8 96C4 58 30 34 70 20Z" fill={colors.accent} />
      <Path d="M226 74C262 70 292 96 290 132C288 172 254 200 216 196C182 192 162 166 166 134C170 100 192 78 226 74Z" fill={colors.brandMark} />
      <Rect x="86" y="32" width="122" height="144" rx="20" fill={colors.surfaceOnBrand} transform="rotate(-8 147 104)" />
      <Path d="M108 64l8 8 14-16" stroke={colors.textOnAccent} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" transform="rotate(-8 147 104)" />
      <Rect x="106" y="98" width="82" height="9" rx="4.5" fill={colors.border} transform="rotate(-8 147 104)" />
      <Rect x="106" y="118" width="58" height="9" rx="4.5" fill={colors.brandMark} transform="rotate(-8 147 104)" />
    </Svg>
    </Animated.View>
  );
}

export type EmptyArtKind = 'registros' | 'familia' | 'metas' | 'compromissos' | 'cartoes' | 'contas' | 'orcamento' | 'investimentos';

/** As quatro ilustrações maiores, no estilo do topo da Assinatura (pedido do Enzo, 12/11/2026): Cartões, Contas a pagar, Orçamento e Investir. */
const LARGE_ART: ReadonlySet<EmptyArtKind> = new Set(['cartoes', 'contas', 'orcamento', 'investimentos']);

/** As formas abertas do fundo (as mesmas das ilustrações do app), na escala da ilustração maior. */
function LargeBlobs() {
  return (
    <>
      <Path d="M150 10C186 4 214 30 210 64C206 100 178 122 144 118C110 114 92 90 96 60C100 32 120 14 150 10Z" fill={colors.brandMark} />
      <Path d="M36 70C56 62 78 74 80 96C82 116 66 130 46 130C24 130 8 116 10 96C12 82 22 74 36 70Z" fill={colors.accent} />
      <Circle cx={198} cy={112} r={6} fill={colors.accent} />
      <Circle cx={20} cy={30} r={4} fill={colors.brandMark} opacity={0.5} />
    </>
  );
}

/** Composições orgânicas por contexto (formas abertas em lima e azul). As de Cartões, Contas a pagar, Orçamento e Investir são maiores. */
export function EmptyArt({ kind }: { kind: EmptyArtKind }) {
  if (LARGE_ART.has(kind)) {
    return (
      <Svg width={220} height={140} viewBox="0 0 220 140" accessible={false}>
        <LargeBlobs />
        {kind === 'cartoes' ? (
          <G transform="rotate(-8 110 72)">
            <Rect x={52} y={36} width={116} height={72} rx={12} fill={colors.surfaceOnBrand} />
            <Rect x={52} y={50} width={116} height={14} fill={colors.brandMark} />
            <Rect x={64} y={74} width={20} height={14} rx={3} fill={colors.accent} />
            <Rect x={92} y={78} width={46} height={6} rx={3} fill={colors.border} />
            <Rect x={64} y={94} width={36} height={6} rx={3} fill={colors.border} />
          </G>
        ) : kind === 'contas' ? (
          <G transform="rotate(-6 110 72)">
            <Rect x={66} y={24} width={88} height={96} rx={12} fill={colors.surfaceOnBrand} />
            <Rect x={66} y={24} width={88} height={20} rx={10} fill={colors.brandMark} />
            <Rect x={66} y={34} width={88} height={10} fill={colors.brandMark} />
            <Rect x={80} y={56} width={44} height={6} rx={3} fill={colors.border} />
            <Rect x={80} y={70} width={32} height={6} rx={3} fill={colors.border} />
            <Rect x={80} y={84} width={40} height={6} rx={3} fill={colors.border} />
            <Circle cx={138} cy={102} r={13} fill={colors.accent} />
            <Path d="M132 102l4 4 8-9" stroke={colors.brandMark} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </G>
        ) : kind === 'orcamento' ? (
          <G transform="rotate(-5 110 72)">
            <Rect x={56} y={28} width={108} height={88} rx={12} fill={colors.surfaceOnBrand} />
            <Rect x={74} y={66} width={16} height={36} rx={4} fill={colors.brandMark} />
            <Rect x={102} y={50} width={16} height={52} rx={4} fill={colors.accent} />
            <Rect x={130} y={76} width={16} height={26} rx={4} fill={colors.brandMark} opacity={0.55} />
            <Path d="M68 46H152" stroke={colors.borderStrong} strokeWidth={2} strokeDasharray="5 5" strokeLinecap="round" />
          </G>
        ) : (
          <G transform="rotate(-5 110 72)">
            <Rect x={56} y={28} width={108} height={88} rx={12} fill={colors.surfaceOnBrand} />
            <Path d="M70 100L94 80L114 88L148 52" stroke={colors.brandMark} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <Circle cx={148} cy={52} r={7} fill={colors.accent} />
            <Rect x={70} y={40} width={34} height={6} rx={3} fill={colors.border} />
          </G>
        )}
      </Svg>
    );
  }
  const blobs = (
    <>
      <Path d="M30 8C52 0 72 14 74 36C76 58 60 74 38 76C16 78 2 64 2 44C2 26 12 14 30 8Z" fill={colors.accent} />
      <Path d="M92 30C108 28 120 40 118 56C116 72 102 82 88 80C74 78 66 66 68 52C70 40 78 32 92 30Z" fill={colors.brandMark} opacity={0.9} />
    </>
  );
  return (
    <Svg width={120} height={84} viewBox="0 0 120 84" accessible={false}>
      {blobs}
      {kind === 'registros' ? (
        <>
          <Rect x={40} y={18} width={40} height={50} rx={8} fill={colors.surfaceOnBrand} transform="rotate(-6 60 43)" />
          <Rect x={47} y={32} width={26} height={4} rx={2} fill={colors.border} transform="rotate(-6 60 43)" />
          <Rect x={47} y={42} width={18} height={4} rx={2} fill={colors.brandMark} transform="rotate(-6 60 43)" />
        </>
      ) : kind === 'familia' ? (
        <>
          <Circle cx={50} cy={38} r={14} fill={colors.surfaceOnBrand} />
          <Circle cx={70} cy={46} r={12} fill={colors.surfaceOnBrand} stroke={colors.brandMark} strokeWidth={3} />
        </>
      ) : kind === 'metas' ? (
        <>
          <Circle cx={60} cy={42} r={20} fill={colors.surfaceOnBrand} />
          <Path d="M66 30C56 30 48 36 48 42C48 48 56 54 66 54C61 51 58 47 58 42C58 37 61 33 66 30Z" fill={colors.accent} />
        </>
      ) : (
        <>
          <Rect x={40} y={22} width={40} height={40} rx={8} fill={colors.surfaceOnBrand} />
          <Rect x={40} y={22} width={40} height={10} rx={4} fill={colors.brandMark} />
          <Circle cx={52} cy={44} r={3} fill={colors.textOnAccent} />
          <Circle cx={60} cy={44} r={3} fill={colors.textOnAccent} />
          <Circle cx={68} cy={44} r={3} fill={colors.accent} />
        </>
      )}
    </Svg>
  );
}

export function EmptyState({
  title,
  children,
  action,
  art = 'registros',
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  art?: EmptyArtKind;
}) {
  return (
    <View style={styles.empty}>
      <EmptyArt kind={art} />
      <Txt variant="title" style={{ textAlign: 'center' }}>
        {title}
      </Txt>
      {children ? (
        <Txt color={colors.textSecondary} style={{ textAlign: 'center' }}>
          {children}
        </Txt>
      ) : null}
      {action}
    </View>
  );
}

export function LoadingState({ label = 'Carregando…', color = colors.brandText }: { label?: string; color?: string }) {
  return (
    <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={color} />
      <Txt variant="label" color={color === colors.brandText ? colors.textSecondary : color}>
        {label}
      </Txt>
    </View>
  );
}

/** Falha de consulta: nunca exibida como zero. */
export function ErrorState({
  message,
  onRetry,
  onBrand,
  retryLabel = 'Tentar novamente',
}: {
  message: string;
  onRetry: () => void;
  onBrand?: boolean;
  /** O texto do botão ("Tentar novamente" na maioria das telas). */
  retryLabel?: string;
}) {
  return (
    <View style={[styles.error, onBrand && { backgroundColor: colors.surface }]} accessibilityRole="alert">
      <Txt variant="label" color={colors.error}>
        {message}
      </Txt>
      <Button label={retryLabel} icon={RotateCcw} tone="soft" onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: space[3], paddingVertical: space[4] },
  loading: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[4] },
  error: { gap: space[3], padding: space[4], borderRadius: radius.md, backgroundColor: colors.errorTint },
});
