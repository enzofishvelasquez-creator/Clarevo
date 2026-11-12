import { SUBSCRIPTION_SCREEN_TEXT, TRIAL_DAYS, trialDaysLeft, type Access, type AccessView } from '@clarevo/core';
import { BadgeCheck, Bell, Gift, Hourglass, LockKeyhole, ReceiptText, Sparkles, Target, Users, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ReduceMotion, ZoomIn } from 'react-native-reanimated';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { Card, Txt } from '@/components/ui';
import { colors, fonts, radius, space } from '@/theme/tokens';

const T = SUBSCRIPTION_SCREEN_TEXT;

/** Quem tem acesso completo sem precisar assinar agora (a tela comemora). */
const CELEBRATE: ReadonlySet<Access['status']> = new Set(['assinatura', 'familia', 'beneficio', 'cortesia']);

const BADGE_ICON: Readonly<Record<Access['status'], LucideIcon>> = {
  assinatura: BadgeCheck,
  familia: Users,
  beneficio: Gift,
  cortesia: Gift,
  teste: Hourglass,
  leitura: LockKeyhole,
  pre_lancamento: Sparkles,
};

/**
 * As formas do fundo (as mesmas da ilustração do app: abertas, em lima e azul). Só decoração: o texto fica em cima do azul, nunca do lima
 * (o lima fica no canto, dentro da margem).
 */
export function HeroBackdrop() {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 320 220" preserveAspectRatio="xMaxYMax slice" style={StyleSheet.absoluteFill} accessible={false} pointerEvents="none">
      {/* As duas formas ficam dentro da área desenhada (nada passa da largura da tela, mesmo cortado pela borda do cartão). */}
      <Path d="M244 112C284 104 320 132 318 176C316 208 300 220 240 220C204 220 180 202 186 168C192 138 208 120 244 112Z" fill={colors.brandDeep} />
      <Path d="M296 188C310 186 320 196 320 208C320 216 320 220 320 220L276 220C274 210 280 192 296 188Z" fill={colors.accent} />
    </Svg>
  );
}

/** Confetes em volta do selo, só na faixa de cima (nunca sobre o título), na comemoração. */
export function BadgeConfetti({ inline = false }: { inline?: boolean }) {
  return (
    <Svg width={104} height={64} viewBox="0 0 104 64" style={inline ? undefined : styles.confetti} accessible={false} pointerEvents="none">
      <Circle cx={8} cy={30} r={3.5} fill={colors.accent} />
      <Rect x={18} y={6} width={7} height={7} rx={2} fill={colors.surface} transform="rotate(20 21 9)" />
      <Circle cx={30} cy={52} r={3} fill={colors.illustration} />
      <Rect x={2} y={50} width={6} height={6} rx={1.5} fill={colors.surface} opacity={0.85} transform="rotate(35 5 53)" />
      <Rect x={40} y={0} width={6} height={6} rx={1.5} fill={colors.illustration} transform="rotate(-15 43 3)" />
      <Circle cx={98} cy={4} r={3} fill={colors.surface} />
    </Svg>
  );
}

/**
 * O alto da tela Assinatura (pedido do Enzo, 12/11/2026): o azul da marca com as formas lima e azul, o selo da situação, o plano em
 * destaque e a explicação de sempre (`accessView`). Quem tem acesso completo ganha a comemoração; quem acabou de pagar (`justPaid`), as
 * boas-vindas ao plano; no teste grátis, os dias que faltam em destaque, com a barra. Respeita "reduzir movimento" do aparelho.
 */
export function SubscriptionHero({
  access,
  view,
  now,
  timeZone,
  justPaid = false,
  canceled = false,
}: {
  access: Access;
  view: AccessView;
  now: Date;
  timeZone: string;
  justPaid?: boolean;
  /** A assinatura no cartão foi cancelada (lida no Asaas): o período pago vale, sem comemoração. */
  canceled?: boolean;
}) {
  const celebrate = CELEBRATE.has(access.status) && !canceled;
  const welcome = justPaid && access.status === 'assinatura';
  const Icon = BADGE_ICON[access.status];
  const days = access.status === 'teste' ? (trialDaysLeft(access, now, timeZone) ?? 0) : null;
  const eyebrow = welcome ? T.justPaidEyebrow : canceled ? T.eyebrowCanceled : T.eyebrow[access.status];
  const title = welcome ? T.justPaidTitle(access.plan ?? 'individual') : view.situation;
  return (
    <Animated.View entering={FadeInDown.duration(320).reduceMotion(ReduceMotion.System)} style={styles.hero}>
      <HeroBackdrop />
      <View style={styles.topRow}>
        {celebrate ? <BadgeConfetti /> : null}
        <View style={styles.eyebrow}>
          <Txt variant="caption" color={colors.text} style={{ fontFamily: fonts.bold }}>
            {eyebrow}
          </Txt>
        </View>
        <Animated.View entering={ZoomIn.delay(120).duration(360).reduceMotion(ReduceMotion.System)} style={[styles.badge, celebrate ? styles.badgeCelebrate : styles.badgePlain]}>
          <Icon size={30} color={celebrate ? colors.text : colors.brand} aria-hidden />
        </Animated.View>
      </View>
      <Txt variant="hero" color={colors.textOnBrand} accessibilityRole="header" aria-level={2} style={styles.title}>
        {title}
      </Txt>
      {days !== null ? (
        <View style={{ gap: space[2] }}>
          <Txt color={colors.textOnBrand}>
            <Txt variant="amount" color={colors.textOnBrand}>
              {T.trialDays(days)}
            </Txt>
            {` ${T.trialDaysCaption(days)}`}
          </Txt>
          <View
            style={styles.track}
            accessibilityRole="progressbar"
            accessibilityLabel={T.trialProgressLabel}
            accessibilityValue={{ min: 0, max: TRIAL_DAYS, now: Math.max(0, days) }}>
            <View style={[styles.fill, { width: `${Math.max(4, Math.min(100, (Math.max(0, days) / TRIAL_DAYS) * 100))}%` }]} />
          </View>
        </View>
      ) : null}
      <Txt color={colors.textOnBrandSoft}>{view.body}</Txt>
      {celebrate ? (
        <Txt variant="label" color={colors.textOnBrand} style={{ fontFamily: fonts.bold }}>
          {T.celebrate}
        </Txt>
      ) : null}
    </Animated.View>
  );
}

const BENEFIT_ICON: Readonly<Record<(typeof T.benefits)[number]['icon'], LucideIcon>> = {
  registros: ReceiptText,
  metas: Target,
  lembretes: Bell,
  analises: Sparkles,
  familia: Users,
};

/** O que a assinatura libera, com ícones em azul e lima. Para quem já tem acesso completo, "Tudo isso é seu". */
export function BenefitsCard({ subscribed }: { subscribed: boolean }) {
  return (
    <Card style={{ gap: space[3] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {subscribed ? T.benefitsTitleSubscribed : T.benefitsTitle}
      </Txt>
      {T.benefits.map((b, i) => {
        const Icon = BENEFIT_ICON[b.icon];
        const lime = i % 2 === 1;
        return (
          <View key={b.icon} style={styles.benefit}>
            <View style={[styles.benefitIcon, { backgroundColor: lime ? colors.accentTint : colors.brandTint }]}>
              <Icon size={20} color={lime ? colors.text : colors.brand} aria-hidden />
            </View>
            <Txt variant="label" style={{ flex: 1 }}>
              {b.text}
            </Txt>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.brand, borderRadius: radius.xl, padding: space[5], gap: space[3], overflow: 'hidden' },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space[3] },
  confetti: { position: 'absolute', top: -6, right: 40 },
  eyebrow: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space[3], paddingVertical: space[1], alignSelf: 'flex-start', flexShrink: 1 },
  badge: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  badgeCelebrate: { backgroundColor: colors.accent },
  badgePlain: { backgroundColor: colors.surface },
  title: { fontSize: 30, lineHeight: 38 },
  track: { height: 10, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.28)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.accent },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 44 },
  benefitIcon: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
});
