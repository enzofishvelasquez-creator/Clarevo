import { DEMO_PILL_MAX_FONT_SCALE, SUMMARY_NAV_TEXT, addMonths, contextLabelFor, contextPillText, formatMonthBR } from '@clarevo/core';
import { router } from 'expo-router';
import { ArrowLeft, ChevronLeft, ChevronRight, Eye, EyeOff, Users } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { PixelRatio, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { Logo } from '@/components/brand';
import { HelpButton } from '@/components/help-button';
import { yearA11yLabel } from '@/components/series-parts';
import { DemoPill, TopInset, Txt } from '@/components/ui';
import type { HelpScreen } from '@/lib/guide';
import { PRIVACY_TEXT, setValuesHidden, useValuesHidden } from '@/lib/privacy';
import { canGoForward, useView, type SpaceKind } from '@/state/data';
import { useFamily } from '@/state/family';
import { useSession } from '@/state/session';
import { LOGOTYPE_HEIGHT, LOGOTYPE_WIDTH } from '@/theme/logo-paths';
import { colors, fonts, motion, radius, space } from '@/theme/tokens';

export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase() || '·';
}

const focusOnBrand = { outlineWidth: 3, outlineColor: colors.accent, outlineStyle: 'solid', outlineOffset: 2 } as const;

/** "Demonstração" em Manrope Bold 12 px (85,4 px) mais a margem interna do selo. */
const DEMO_PILL_WIDTH = 102;

/**
 * Olho do cabeçalho (ocultar valores, A2): ação secundária ao lado do avatar, só quando cabe sem apertar o logotipo.
 * Largura da faixa: até 560 px menos as margens; logotipo, selo de demonstração (se houver), olho e avatar com os
 * espaços entre eles. Sem a demonstração, cabe a partir de 320 px; com o selo, só em telas mais largas. Quando não
 * cabe, ocultar e mostrar valores ficam em Conta.
 */
function eyeFits(windowWidth: number, narrow: boolean, demo: boolean): boolean {
  const gap = narrow ? space[2] : space[3];
  const row = Math.min(windowWidth, 560) - 2 * space[6];
  const logo = (narrow ? 20 : 24) * (LOGOTYPE_WIDTH / LOGOTYPE_HEIGHT);
  const pill = demo ? DEMO_PILL_WIDTH * Math.min(DEMO_PILL_MAX_FONT_SCALE, Math.max(1, PixelRatio.getFontScale())) + gap : 0;
  return logo + gap + pill + 44 + gap + 44 <= row;
}

/** Mostrar ou ocultar os valores nesta sessão (a preferência "Ocultar valores ao abrir" fica em Conta). */
function HideValuesButton() {
  const hidden = useValuesHidden();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hidden ? PRIVACY_TEXT.showNow : PRIVACY_TEXT.hideNow}
      onPress={() => setValuesHidden(!hidden)}
      style={(s) => [styles.eye, (s as { focused?: boolean }).focused && focusOnBrand]}>
      {hidden ? <Eye size={24} color={colors.textOnBrand} /> : <EyeOff size={24} color={colors.textOnBrand} />}
    </Pressable>
  );
}

/** Logo reverso, selo de demonstração e acesso à Conta (perfil, segurança e benefício). */
function BrandRow() {
  const { user, auth } = useSession();
  const { width } = useWindowDimensions();
  // Abaixo de 360 px, logotipo, selo de demonstração e avatar não cabem lado a lado no tamanho normal.
  const narrow = width < 360;
  const demo = auth.mode === 'demo';
  return (
    <View style={[styles.top, narrow && { gap: space[2] }]}>
      <Logo height={narrow ? 20 : 24} variant="reverso" />
      <View style={[styles.topRight, narrow && { gap: space[2] }]}>
        {demo ? <DemoPill /> : null}
        {eyeFits(width, narrow, demo) ? <HideValuesButton /> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Conta: perfil, segurança e acesso ao plano"
          onPress={() => router.push('/conta')}
          style={(s) => [styles.avatar, (s as { focused?: boolean }).focused && focusOnBrand]}>
          <Txt variant="label" color={colors.brand} style={{ fontFamily: fonts.extrabold }} maxFontSizeMultiplier={1.3}>
            {initialsOf(user?.displayName ?? '')}
          </Txt>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Cabeçalho das abas: faixa azul de ponta a ponta, conteúdo limitado a 560 px,
 * com logo e avatar em todas as abas (padrão único). `title` aparece abaixo do logo.
 */
export function AppHeader({ title, context, children }: { title?: string; context?: string; children?: ReactNode }) {
  return (
    <View style={styles.band}>
      <TopInset color={colors.brand} />
      <View style={styles.inner}>
        <BrandRow />
        {title ? (
          <View style={styles.titleRow}>
            <Txt variant="title" color={colors.textOnBrand} style={[styles.title, context ? { marginBottom: 0 } : null]} accessibilityRole="header" aria-level={1}>
              {title}
            </Txt>
            {context ? <ContextPill label={context} /> : null}
          </View>
        ) : null}
        {children}
      </View>
    </View>
  );
}

/**
 * Cabeçalho compacto das telas internas (formulário, detalhe, composição, conta):
 * voltar, título e, à direita, o contexto fixo ou outra informação. Quando não há espaço
 * para os dois lado a lado (telas estreitas, letra grande), o contexto desce para baixo do
 * título, alinhado a ele: nem o título nem o contexto são cortados.
 * `help`: nas telas que têm entrada no guia (D-049(3)), o botão "?" (44 px) fica à direita e abre a folha "Como usar".
 * `plainTitle`: o título da barra é só texto, sem papel de título. Só a explicação de um tema usa: ali o título do tema é o nível 1 da
 * tela (D-063 item 2), e a barra ("Aprender") diz de onde a pessoa veio. Uma tela tem no máximo um título de nível 1.
 */
export function SubHeader({ title, onBack, right, help, plainTitle }: { title: string; onBack?: () => void; right?: ReactNode; help?: HelpScreen; plainTitle?: boolean }) {
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));
  return (
    <View style={styles.subBand}>
      <TopInset color={colors.brand} />
      <View style={[styles.inner, styles.subInner]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          onPress={back}
          hitSlop={6}
          style={(s) => [styles.backBtn, (s as { focused?: boolean }).focused && focusOnBrand]}>
          <ArrowLeft size={22} color={colors.textOnBrand} />
        </Pressable>
        <View style={styles.subMain}>
          <Txt
            variant="title"
            color={colors.textOnBrand}
            style={styles.subTitle}
            accessibilityRole={plainTitle ? undefined : 'header'}
            aria-level={plainTitle ? undefined : 1}
            accessibilityLabel={yearA11yLabel(title)}>
            {title}
          </Txt>
          {right}
        </View>
        {help ? <HelpButton screen={help} /> : null}
      </View>
    </View>
  );
}

/**
 * Contexto fixo durante o preenchimento ou na leitura de um registro. Na demonstração (CL-11), a pílula vira "Demonstração · Pessoal",
 * no lima do selo das abas, para nenhum formulário nem detalhe parecer uma conta real. Os textos das telas dizem "Pessoal"
 * ("Salvando em Pessoal", "Importando em Pessoal"); com a Família escolhida no seletor (D-055), a pílula diz onde a anotação vai
 * ficar: "Salvando em Família". `fixed`: a pílula não muda, porque a tela é só do Pessoal (exportar) ou porque o rótulo já traz o
 * contexto do item aberto (pagar e editar uma conta ou um registro de outro contexto que o do seletor).
 */
export function ContextPill({ label: given, fixed }: { label: string; fixed?: boolean }) {
  const { auth } = useSession();
  const { space: kind } = useView();
  const demo = auth.mode === 'demo';
  const label = fixed ? given : contextLabelFor(given, kind);
  const text = contextPillText(label, demo);
  return (
    <View style={[styles.pill, demo && styles.pillDemo]} accessible accessibilityLabel={`Contexto: ${text}`}>
      <Txt variant="caption" color={demo ? colors.text : colors.brand} style={{ fontFamily: fonts.bold }}>
        {text}
      </Txt>
    </View>
  );
}

const OPTIONS: { kind: SpaceKind; label: string }[] = [
  { kind: 'pessoal', label: 'Pessoal' },
  { kind: 'familia', label: 'Família' },
];

/**
 * Seletor Pessoal/Família nas abas (CL-V002). A pílula branca desliza em 200 ms. Só aparece para quem tem uma Família (D-055):
 * sem ela, o Pessoal é o único contexto e o seletor não ocupa lugar. A Família se cria e se administra em Conta.
 */
export function ContextSwitch() {
  const family = useFamily();
  if (!family.data) return null;
  return <ContextSwitchTrack />;
}

function ContextSwitchTrack() {
  const { space: active, setSpace } = useView();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const index = OPTIONS.findIndex((o) => o.kind === active);
  const x = useSharedValue(0);
  const half = Math.max(0, (width - 8) / 2);

  useEffect(() => {
    const target = index * half;
    x.value = reduced || half === 0 ? target : withTiming(target, { duration: motion.context });
  }, [index, half, reduced, x]);

  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      style={styles.track}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="tablist"
      accessibilityLabel="Contexto financeiro">
      {half > 0 ? <Animated.View style={[styles.indicator, { width: half }, pill]} /> : null}
      {OPTIONS.map((o) => {
        const selected = o.kind === active;
        return (
          <Pressable
            key={o.kind}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            aria-selected={selected}
            accessibilityLabel={`Ver dados de ${o.label}`}
            onPress={() => (selected ? undefined : setSpace(o.kind))}
            style={(s) => [styles.option, half === 0 && selected && styles.optionSelected, (s as { focused?: boolean }).focused && focusOnBrand]}>
            {o.kind === 'familia' ? <Users size={18} color={selected ? colors.brand : colors.textOnBrand} /> : null}
            <Txt variant="label" color={selected ? colors.brand : colors.textOnBrand} style={{ fontFamily: fonts.bold, fontSize: 16 }}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Período mensal com mês anterior e seguinte (até o mês atual). O mês é um título de nível 2, abaixo do título da aba. No Resumo, que
 * não tem outro título (a estrutura é a de D-022), o mês é o título de nível 1 da tela e o leitor de tela lê "Resumo de outubro de
 * 2026" (`titleLevel` 1; o que se vê não muda).
 */
export function MonthSwitcher({ color = colors.textOnBrand, titleLevel = 2 }: { color?: string; titleLevel?: 1 | 2 }) {
  const { month, setMonth, currentMonth } = useView();
  const forward = canGoForward(month, currentMonth);
  const prev = addMonths(month, -1);
  const next = addMonths(month, 1);
  return (
    <View style={styles.month}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Mês anterior: ${formatMonthBR(prev)}`}
        hitSlop={8}
        onPress={() => setMonth(prev)}
        style={(s) => [styles.monthBtn, (s as { focused?: boolean }).focused && focusOnBrand]}>
        <ChevronLeft size={22} color={color} />
      </Pressable>
      <Txt
        variant="label"
        color={color}
        style={{ flex: 1, textAlign: 'center', fontFamily: fonts.semibold }}
        accessibilityRole="header"
        aria-level={titleLevel}
        accessibilityLabel={titleLevel === 1 ? SUMMARY_NAV_TEXT.pageTitleA11y(month) : undefined}>
        {formatMonthBR(month)}
      </Txt>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Próximo mês: ${formatMonthBR(next)}`}
        accessibilityState={{ disabled: !forward }}
        disabled={!forward}
        hitSlop={8}
        onPress={() => setMonth(next)}
        style={(s) => [styles.monthBtn, !forward && { opacity: 0.35 }, forward && (s as { focused?: boolean }).focused && focusOnBrand]}>
        <ChevronRight size={22} color={color} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  band: { backgroundColor: colors.brand, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  inner: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: space[6], paddingTop: space[4], paddingBottom: space[6] },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space[5], gap: space[3] },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  // overflowWrap (web): uma palavra mais larga que a faixa quebra em vez de passar da tela com letra muito grande; no aparelho o texto já quebra.
  title: { fontSize: 24, lineHeight: 32, marginBottom: space[4], overflowWrap: 'anywhere' } as object,
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space[3], rowGap: space[1], marginBottom: space[4] },
  avatar: { minWidth: 44, height: 44, paddingHorizontal: 4, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  eye: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  subBand: { backgroundColor: colors.brand },
  subInner: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingTop: space[2], paddingBottom: space[3], paddingHorizontal: space[3] },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  subMain: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space[2], rowGap: space[1] },
  // O título ocupa a largura natural: se não couber numa linha ao lado do contexto, o contexto passa para baixo.
  subTitle: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 0, overflowWrap: 'anywhere' } as object,
  // flexShrink: com letra grande, o texto quebra dentro da pílula em vez de passar da largura da tela.
  pill: { backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: space[3], paddingVertical: space[1], marginRight: space[3], flexShrink: 1 },
  pillDemo: { backgroundColor: colors.accent },
  track: { flexDirection: 'row', backgroundColor: colors.brandDeep, borderRadius: radius.md, padding: 4 },
  indicator: { position: 'absolute', left: 4, top: 4, bottom: 4, borderRadius: 13, backgroundColor: colors.surface },
  option: { flex: 1, minHeight: 48, borderRadius: 13, flexDirection: 'row', gap: space[2], alignItems: 'center', justifyContent: 'center' },
  optionSelected: { backgroundColor: colors.surface },
  month: { flexDirection: 'row', alignItems: 'center', marginTop: space[5] },
  monthBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
