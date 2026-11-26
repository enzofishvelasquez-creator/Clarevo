import { DEMO_PILL_MAX_FONT_SCALE, SPACE_TEXT, SUMMARY_NAV_TEXT, addMonths, contextLabelFor, contextPillText, formatMonthBR, normalizePath, type SpaceChoice } from '@clarevo/core';
import { router, useNavigation, usePathname } from 'expo-router';
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Eye, EyeOff, Plus, Store, Users } from 'lucide-react-native';
import { Children, createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { PixelRatio, Pressable, StyleSheet, useWindowDimensions, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { Logo } from '@/components/brand';
import { InPanelContext } from '@/components/form-panel';
import { HelpButton } from '@/components/help-button';
import { yearA11yLabel } from '@/components/series-parts';
import { SpaceSheet, useSpaceChoices } from '@/components/space-sheet';
import { DemoPill, TopInset, Txt } from '@/components/ui';
import { STORE_CAPTURE } from '@/lib/capture';
import type { HelpScreen } from '@/lib/guide';
import { WIDE_CONTENT_MAX, WIDE_GUTTER, WIDE_TAB_MAX, WIDE_TOP, useWideLayout } from '@/lib/layout';
import { PRIVACY_TEXT, setValuesHidden, useValuesHidden } from '@/lib/privacy';
import { ProfileAvatar } from '@/components/profile-photo';
import { canGoForward, useView } from '@/state/data';
import { useBusiness } from '@/state/business';
import { useSession } from '@/state/session';
import { LOGOTYPE_HEIGHT, LOGOTYPE_WIDTH } from '@/theme/logo-paths';
import { colors, fonts, motion, radius, space } from '@/theme/tokens';

/** As iniciais do nome (o mesmo do núcleo, `initialsOf` de profile-photo.ts). */
export { initialsOf } from '@clarevo/core';

const focusOnBrand = { outlineWidth: 3, outlineColor: colors.accent, outlineStyle: 'solid', outlineOffset: 2 } as const;

/** Marca do bloco azul do alto na web (`data-band`): o teste de telas confere os cantos dele na versão para computador. */
const BAND_MARK = { dataSet: { band: '1' } } as object;

/** "Demonstração" em Manrope Bold 12 px (85,4 px) mais a margem interna do selo. */
const DEMO_PILL_WIDTH = 102;

/**
 * Olho do cabeçalho (ocultar valores, A2): ação secundária ao lado do avatar, só quando cabe sem apertar o logotipo.
 * Largura da faixa: até 560 px menos as margens; logotipo, selo de demonstração (se houver), olho e avatar com os
 * espaços entre eles. Sem a demonstração, cabe a partir de 320 px. Com o selo, os três da direita se aproximam (8 px em vez de 12) quando
 * só assim cabem: o olho aparece a partir de 390 px, a largura do iPhone mais comum (D-110). Devolve o espaço entre os três da direita, ou
 * null quando o olho não cabe: aí ocultar e mostrar valores ficam em Conta.
 */
function eyeFits(windowWidth: number, narrow: boolean, demo: boolean, fontScale = 1): number | null {
  const gap = narrow ? space[2] : space[3];
  const row = Math.min(windowWidth, 560) - 2 * space[6];
  const logo = (narrow ? 20 : 24) * (LOGOTYPE_WIDTH / LOGOTYPE_HEIGHT);
  const pill = demo ? DEMO_PILL_WIDTH * Math.min(DEMO_PILL_MAX_FONT_SCALE, Math.max(1, fontScale)) : 0;
  for (const inner of demo && gap > space[2] ? [gap, space[2]] : [gap]) {
    if (logo + gap + (demo ? pill + inner : 0) + 44 + inner + 44 <= row) return inner;
  }
  return null;
}

/**
 * Mostrar ou ocultar os valores nesta sessão (a preferência "Ocultar valores ao abrir" fica em Conta). Um estado só (`setValuesHidden`),
 * o mesmo do interruptor de Conta e da barra lateral do computador. `labeled`: na versão para computador, o olho vem com o texto ao lado,
 * no alto da faixa azul, onde o celular mostra o olho (D-110: no computador, a pessoa procurava o olho no cabeçalho e não achava).
 */
function HideValuesButton({ labeled = false }: { labeled?: boolean }) {
  const hidden = useValuesHidden();
  const label = hidden ? PRIVACY_TEXT.showNow : PRIVACY_TEXT.hideNow;
  const Icon = hidden ? Eye : EyeOff;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => setValuesHidden(!hidden)}
      style={(s) => [
        labeled ? styles.eyeLabeled : styles.eye,
        labeled && ((s as { hovered?: boolean }).hovered || s.pressed) && styles.eyeLabeledHover,
        (s as { focused?: boolean }).focused && focusOnBrand,
      ]}>
      <Icon size={labeled ? 20 : 24} color={colors.textOnBrand} aria-hidden />
      {labeled ? (
        <Txt variant="label" color={colors.textOnBrand} style={{ fontFamily: fonts.bold }} numberOfLines={1}>
          {label}
        </Txt>
      ) : null}
    </Pressable>
  );
}

/** Logo reverso, selo de demonstração e acesso à Conta (perfil, segurança e benefício). O avatar é branco sobre o azul nos dois temas. */
function BrandRow() {
  const { user, auth } = useSession();
  const { width } = useWindowDimensions();
  // Abaixo de 360 px, logotipo, selo de demonstração e avatar não cabem lado a lado no tamanho normal.
  const narrow = width < 360;
  // As capturas das lojas escondem o selo (`STORE_CAPTURE`): o olho cabe como numa conta real.
  const demo = auth.mode === 'demo' && !STORE_CAPTURE;
  const eyeGap = eyeFits(width, narrow, demo, PixelRatio.getFontScale());
  return (
    <View style={[styles.top, narrow && { gap: space[2] }]}>
      <Logo height={narrow ? 20 : 24} variant="reverso" />
      <View style={[styles.topRight, { gap: eyeGap ?? (narrow ? space[2] : space[3]) }]}>
        {demo ? <DemoPill /> : null}
        {eyeGap !== null ? <HideValuesButton /> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Conta: perfil, assinatura, lembretes, privacidade e segurança"
          onPress={() => router.push('/conta')}
          style={(s) => [styles.avatar, (s as { focused?: boolean }).focused && focusOnBrand]}>
          {/* A foto do perfil, se houver, ou as iniciais (pedido do Enzo, 16/11/2026). */}
          <ProfileAvatar size={40} background={colors.surfaceOnBrand} color={colors.brand} textVariant="label" />
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Cabeçalho das abas: faixa azul de ponta a ponta, conteúdo limitado a 560 px,
 * com logo e avatar em todas as abas (padrão único). `title` aparece abaixo do logo.
 */
export function AppHeader({
  title,
  context,
  contextFixed,
  wide,
  action,
  topStart,
  children,
}: {
  title?: string;
  context?: string;
  contextFixed?: boolean;
  /** Versão para computador: o conteúdo da faixa acompanha a largura do painel (o Resumo). */
  wide?: boolean;
  /**
   * Versão para computador, sem título (o Resumo): o que fica no alto do cartão azul, à esquerda, na mesma linha de "Ocultar valores"
   * (o seletor de espaço, pedido do Enzo de 23/11/2026: o seletor numa linha só dele, de ponta a ponta, deixava o cartão pesado).
   */
  topStart?: ReactNode;
  /** Um atalho à direita do título (D-105: "Análises" em Movimentos), sem aumentar a faixa. */
  action?: ReactNode;
  children?: ReactNode;
}) {
  // Na versão para computador, o logotipo e a Conta ficam na barra lateral; a faixa azul mostra o título, o mês e, no alto à direita, onde o
  // celular mostra o olho, "Ocultar valores" com o texto (D-110). A barra lateral mantém o mesmo botão, para as telas sem esta faixa.
  // A faixa vira um cartão azul com os quatro cantos arredondados, afastado do alto da janela e da barra lateral e alinhado com os cartões
  // de baixo (pedido do Enzo, 17/11/2026: "corrija as bordas, para que fiquem todas arredondadas").
  const sideNav = useWideLayout();
  // Computador, só o título (Investir, Aprender): a linha do título sem a margem de baixo e o cartão com o mesmo respiro em cima e embaixo
  // (revisão de 23/11/2026: o título ficava a 26 px do alto do cartão e a 46 px do pé).
  const titleOnly = sideNav && Boolean(title) && Children.toArray(children).length === 0;
  const band = (
    <View style={[styles.band, sideNav && styles.bandCard]} {...BAND_MARK}>
      {sideNav ? null : <TopInset color={colors.brand} />}
      <View style={[styles.inner, sideNav && styles.innerCard, titleOnly && styles.innerCardTitleOnly]}>
        {sideNav ? null : <BrandRow />}
        {title ? (
          <View style={[styles.titleRow, titleOnly && { marginBottom: 0 }]}>
            <Txt variant="title" color={colors.textOnBrand} style={styles.title} accessibilityRole="header" aria-level={1}>
              {title}
            </Txt>
            {context ? <ContextPill label={context} fixed={contextFixed} inTab /> : null}
            {action || sideNav ? (
              <View style={styles.titleEnd}>
                {action ? <View style={styles.titleAction}>{action}</View> : null}
                {sideNav ? <HideValuesButton labeled /> : null}
              </View>
            ) : null}
          </View>
        ) : sideNav ? (
          <View style={[styles.wideTop, topStart ? styles.wideTopSplit : null]}>
            {topStart ? <View style={styles.wideTopStart}>{topStart}</View> : null}
            <HideValuesButton labeled />
          </View>
        ) : null}
        {children}
      </View>
    </View>
  );
  if (!sideNav) return band;
  return (
    <View style={[styles.cardWrap, { maxWidth: wide ? WIDE_CONTENT_MAX : WIDE_TAB_MAX, paddingHorizontal: WIDE_GUTTER, paddingTop: WIDE_TOP }]}>
      <TopInset color={colors.background} />
      {band}
    </View>
  );
}

/**
 * Versão para computador, numa tela cheia (fora do painel dos formulários): o cabeçalho compacto e o bloco azul de destaque logo abaixo
 * dele (meta, fatura, investimento) viram cartões com os quatro cantos arredondados, na largura das telas de consulta. Dentro do painel e
 * no celular, nada muda (null). Use em `hero` (o bloco azul) e `heroInner` (o conteúdo dele) das telas de detalhe:
 * `const card = useHeroCard();` e `style={[styles.hero, card?.band]}`, `style={[styles.heroInner, card?.inner]}`.
 */
export function useHeroCard(): { band: ViewStyle; inner: ViewStyle } | null {
  const sideNav = useWideLayout();
  const inPanel = useContext(InPanelContext);
  return sideNav && !inPanel ? { band: styles.heroCard, inner: styles.heroCardInner } : null;
}

/**
 * Cabeçalho compacto das telas internas (formulário, detalhe, composição, conta):
 * voltar, título e o contexto fixo ou outra informação. No celular, o contexto fica sempre
 * na linha de baixo, alinhado ao título; no computador, à direita do título, e desce para
 * baixo dele quando não há espaço. Nem o título nem o contexto são cortados.
 * `help`: nas telas que têm entrada no guia (D-049(3)), o botão "?" (44 px) fica à direita e abre a folha "Como usar".
 * `plainTitle`: o título da barra é só texto, sem papel de título. Só a explicação de um tema usa: ali o título do tema é o nível 1 da
 * tela (D-063 item 2), e a barra ("Aprender") diz de onde a pessoa veio. Uma tela tem no máximo um título de nível 1.
 */
export function SubHeader({ title, onBack, right, help, plainTitle }: { title: string; onBack?: () => void; right?: ReactNode; help?: HelpScreen; plainTitle?: boolean }) {
  // Versão para computador: a faixa acompanha a largura das telas de consulta (760 px). Numa tela cheia, ela vira um cartão azul com os
  // quatro cantos arredondados, afastado do alto da janela e da barra lateral (D-110); no painel dos formulários, fica presa ao alto do
  // painel, que já tem os cantos arredondados.
  const sideNav = useWideLayout();
  const inPanel = useContext(InPanelContext);
  const pathname = usePathname();
  const card = sideNav && !inPanel;
  // Computador: a Conta aberta pela barra lateral (por cima das abas) é um destino, como as abas, e fica sem a seta de voltar. Revisão de
  // 23/11/2026: a seta fazia a Conta parecer uma tela aberta por cima. Aberta de um formulário ("Gerenciar bancos e carteira"), a seta
  // continua: é o caminho de volta ao preenchimento (a janela instalada não tem o botão de voltar do navegador). Conferido ao abrir.
  const navigation = useNavigation();
  const [overTabs] = useState(() => {
    const st = navigation.getState() as { routes?: readonly { name: string }[]; index?: number } | undefined;
    const routes = st?.routes ?? [];
    const i = st?.index ?? routes.length - 1;
    return i <= 0 || routes[i - 1]?.name === '(tabs)';
  });
  const showBack = !(card && normalizePath(pathname) === '/conta' && overTabs);
  // Celular (e web estreita): a pílula do contexto fica sempre na linha de baixo, alinhada ao título. Antes, ia ao lado ou embaixo conforme
  // o tamanho do título, e a faixa mudava de altura de uma tela para outra (60, 80 e 95 px); em 320 px, a pílula quebrava em duas linhas.
  const stacked = !sideNav;
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));
  const backButton = showBack ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Voltar"
      onPress={back}
      hitSlop={6}
      style={(s) => [styles.backBtn, (s as { focused?: boolean }).focused && focusOnBrand]}>
      <ArrowLeft size={22} color={colors.textOnBrand} />
    </Pressable>
  ) : null;
  const titleText = (
    <Txt
      variant="title"
      color={colors.textOnBrand}
      style={styles.subTitle}
      accessibilityRole={plainTitle ? undefined : 'header'}
      aria-level={plainTitle ? undefined : 1}
      accessibilityLabel={yearA11yLabel(title)}>
      {title}
    </Txt>
  );
  const helpButton = help ? (
    <View style={styles.helpSlot}>
      <HelpButton screen={help} />
    </View>
  ) : null;
  const bar = (
    <View style={[styles.subBand, card && styles.subCard]} {...BAND_MARK}>
      {card ? null : <TopInset color={colors.brand} />}
      <View style={[styles.inner, styles.subInner, stacked && styles.subInnerStacked, !showBack && styles.subInnerNoBack, sideNav && { maxWidth: card ? '100%' : WIDE_TAB_MAX }]}>
        {stacked ? (
          <>
            <View style={styles.subRow}>
              {backButton}
              <View style={styles.subMainStacked}>{titleText}</View>
              {helpButton}
            </View>
            {right ? (
              <StackedPillContext value>
                <View style={styles.subPillRow}>{right}</View>
              </StackedPillContext>
            ) : null}
          </>
        ) : (
          <>
            {backButton}
            <View style={styles.subMain}>
              {titleText}
              {right}
            </View>
            {helpButton}
          </>
        )}
      </View>
    </View>
  );
  if (!card) return bar;
  // Embaixo do cartão, 12 px com o fundo da página: o conteúdo que rola some numa borda limpa, longe do azul (revisão de 23/11/2026: a
  // rolagem começava rente ao cartão, e um bloco azul de baixo, como o da fatura, da meta ou do investimento, parecia grudado nele).
  // Por fora, o mesmo espaço da barra de rolagem que a tela de baixo reserva dos dois lados (`scrollbarGutter` do Screen): em 1024 px, onde
  // a tela tem menos de 760 px, o cartão ficava 11 px mais largo que os cartões de baixo de cada lado.
  return (
    <View style={styles.cardGutter}>
      <View style={[styles.cardWrap, { maxWidth: WIDE_TAB_MAX, paddingHorizontal: WIDE_GUTTER, paddingTop: WIDE_TOP, paddingBottom: space[3] }]}>
        <TopInset color={colors.background} />
        {bar}
      </View>
    </View>
  );
}

/** A pílula está na linha de baixo do cabeçalho compacto do celular (SubHeader): o alvo de 44 px da pílula que troca de espaço não aumenta a faixa. */
const StackedPillContext = createContext(false);

/**
 * Contexto fixo durante o preenchimento ou na leitura de um registro. Na demonstração (CL-11), a pílula vira "Demonstração · Pessoal",
 * no lima do selo das abas, para nenhum formulário nem detalhe parecer uma conta real. Os textos das telas dizem "Pessoal"
 * ("Salvando em Pessoal", "Importando em Pessoal"); com a Família escolhida no seletor (D-055), a pílula diz onde a anotação vai
 * ficar: "Salvando em Família". `fixed`: a pílula não muda, porque a tela é só do Pessoal (exportar) ou porque o rótulo já traz o
 * contexto do item aberto (pagar e editar uma conta ou um registro de outro contexto que o do seletor).
 * `switchable` (D-113b): nas telas de consulta que leem o espaço escolhido (Análises, Calendário, Evolução, Contas a pagar, Cartões,
 * Orçamento, busca), a pílula vira um botão com a seta para baixo, com mais de um espaço ou com um espaço para criar, e abre a folha de
 * espaços: trocar de espaço ali recarrega a tela com os dados do espaço escolhido. O alvo de toque tem 44 px de altura; o desenho da
 * pílula não muda. Formulários e detalhes não passam `switchable`: o espaço não muda no meio de um preenchimento.
 */
export function ContextPill({ label: given, fixed, inTab, switchable }: { label: string; fixed?: boolean; inTab?: boolean; switchable?: boolean }) {
  const { auth } = useSession();
  const { space: kind } = useView();
  const business = useBusiness();
  const choices = useSpaceChoices();
  const [open, setOpen] = useState(false);
  // As capturas das lojas mostram a pílula de uma conta real ("Salvando em Pessoal"), sem o selo (`STORE_CAPTURE`).
  const demo = auth.mode === 'demo' && !STORE_CAPTURE;
  // No negócio (D-113), o último "Pessoal" vira o nome do negócio ("Salvando em Sacolé da Mãe").
  const label = fixed ? given : contextLabelFor(given, kind, business.data?.name);
  // Nas abas, o selo "Demonstração" já está no cabeçalho: a pílula fica branca e diz só o contexto.
  const text = contextPillText(label, demo, inTab);
  const lime = demo && !inTab;
  const color = lime ? colors.textOnAccent : colors.brand;
  // A pílula só troca de espaço com mais de um espaço (estudo de 25/11/2026, sinal 22): só com o Pessoal, ela só diz o espaço.
  const canSwitch = Boolean(switchable) && !fixed && choices.spaces.length > 1;
  // Na linha de baixo do cabeçalho do celular (StackedPillContext), a pílula tem a largura da faixa toda e não precisa da margem da direita
  // (era para afastar do "?"). O alvo de 44 px da pílula que troca de espaço avança por igual sobre o respiro de cima e de baixo, até a
  // altura da pílula fixa: a faixa tem a mesma altura com ou sem a seta (a pílula tem 18 px de linha, que crescem com a letra do aparelho,
  // e 8 de margem). Sem limite de linhas: com a letra grande, o texto quebra em vez de ser cortado.
  const stacked = useContext(StackedPillContext);
  const slack = stacked ? Math.max(0, (44 - (18 * PixelRatio.getFontScale() + 8)) / 2) : 0;
  if (!canSwitch) {
    return (
      <View style={[styles.pill, stacked && styles.pillStacked, lime && styles.pillDemo]} accessible accessibilityLabel={`Espaço: ${text}`}>
        <Txt variant="caption" color={color} style={{ fontFamily: fonts.bold }}>
          {text}
        </Txt>
      </View>
    );
  }
  // A seta para baixo só aparece na pílula que é um botão (abre a folha de espaços): é ela que diz que dá para tocar.
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Espaço: ${text}`}
        accessibilityHint={SPACE_TEXT.pillHint}
        onPress={() => setOpen(true)}
        style={(s) => [styles.pillTarget, slack > 0 && { marginVertical: -slack }, (s as { focused?: boolean }).focused && focusOnBrand]}>
        {({ pressed }) => (
          <View style={[styles.pill, styles.pillRow, stacked && styles.pillStacked, lime && styles.pillDemo, pressed && { opacity: 0.85 }]}>
            <Txt variant="caption" color={color} style={{ fontFamily: fonts.bold, flexShrink: 1 }}>
              {text}
            </Txt>
            {/* Na web, o desenho encolheria na linha sem o invólucro que não encolhe. */}
            <View style={styles.pillChevron}>
              <ChevronDown size={16} color={color} strokeWidth={2.5} aria-hidden />
            </View>
          </View>
        )}
      </Pressable>
      {open ? <SpaceSheet mode="trocar" onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/**
 * Seletor de espaço nas abas (CL-V002, D-113b): Pessoal, a Família (D-055, quem tem uma) e o negócio (D-113, pelo nome, quem tem um). A
 * pílula branca desliza em 200 ms (sem animação com "reduzir movimento"). Aparece nas abas que dependem do espaço (Resumo, Movimentos e
 * Metas) só com mais de um espaço (estudo de 25/11/2026, sinal 22: o seletor para quem só tem o Pessoal, e o "Pessoal" repetido em Metas,
 * pareciam descuido). É a única indicação do espaço na tela. O "+" fica enquanto houver um espaço para criar e abre a folha "Criar um
 * espaço"; só com o Pessoal, o espaço Negócio e a Família se criam em Conta ("Plano e espaços") e pelo atalho de Primeiros passos.
 * Investir é só do Pessoal e não tem o seletor.
 */
export function ContextSwitch() {
  const { spaces, creatable } = useSpaceChoices();
  if (spaces.length < 2) return null;
  return <ContextSwitchTrack options={spaces} creatable={creatable.length > 0 ? SPACE_TEXT.createA11y(creatable) : null} />;
}

function ContextSwitchTrack({ options, creatable }: { options: readonly SpaceChoice[]; creatable: string | null }) {
  const { space: active, setSpace } = useView();
  // Versão para computador (pedido do Enzo, 23/11/2026): o seletor fica compacto, com cada opção de 160 a 240 px, em vez de ocupar o
  // cartão de ponta a ponta (só com o Pessoal, era uma barra branca larga). No celular, continua na largura da faixa.
  const compact = useWideLayout();
  const reduced = useReducedMotion();
  // Onde cada opção ficou no trilho (x e largura). No celular, cada opção tem a largura do nome (revisão de 23/11/2026: em partes iguais,
  // "Sacolé da M…" era cortado enquanto "Pessoal" sobrava), e a pílula branca acompanha a opção escolhida.
  const [spots, setSpots] = useState<Partial<Record<SpaceChoice['kind'], { x: number; width: number }>>>({});
  // A pílula branca já está no lugar: até lá, a opção escolhida desenha o próprio fundo branco (sem a pílula sair do canto ao abrir).
  const [placed, setPlaced] = useState(false);
  const [creating, setCreating] = useState(false);
  const index = Math.max(0, options.findIndex((o) => o.kind === active));
  // A posição da opção é a soma das larguras das de antes (a lista não tem espaço entre as opções): na web, onLayout só avisa quando o
  // tamanho muda, e uma opção que só andou (um espaço novo antes dela) ficaria com a posição antiga.
  const widths = options.map((o) => spots[o.kind]?.width);
  const measured = widths.every((v) => v !== undefined);
  const spotX = measured ? widths.slice(0, index).reduce<number>((a, v) => a + (v ?? 0), 0) : -1;
  const spotW = measured ? (widths[index] ?? 0) : -1;
  const spot = measured ? { x: spotX, width: spotW } : undefined;
  const x = useSharedValue(0);
  const w = useSharedValue(0);
  const slides = options.length > 1;
  // Letra grande do aparelho: as opções dividem o trilho em partes iguais (como antes da revisão de 23/11/2026), com reticências.
  const equal = !compact && PixelRatio.getFontScale() > 1.3;

  useEffect(() => {
    if (spotW < 0) return;
    if (reduced || !placed) {
      x.value = spotX;
      w.value = spotW;
      setPlaced(true);
      return;
    }
    x.value = withTiming(spotX, { duration: motion.context });
    w.value = withTiming(spotW, { duration: motion.context });
  }, [spotX, spotW, placed, reduced, x, w]);

  const pill = useAnimatedStyle(() => ({ width: w.value, transform: [{ translateX: x.value }] }));
  const names = options.map((o) => (o.kind === 'negocio' ? 'Negócio' : o.label)).join(', ');

  return (
    <View style={[styles.track, compact && styles.trackCompact]}>
      <View
        style={[styles.tabs, compact && styles.tabsCompact]}
        accessibilityRole="tablist"
        // "Escolher o espaço: Pessoal ou Família": sem o "Espaço:" das pílulas, que diz o espaço de uma tela (só o Pessoal, o nome seria igual).
        accessibilityLabel={`${SPACE_TEXT.switchTitle}: ${names.replace(/, ([^,]+)$/, ' ou $1')}`}>
        {/* Só com mais de um espaço a pílula branca desliza; só com o Pessoal, a opção já vem com o fundo branco (nada a animar). */}
        {spot && slides ? <Animated.View style={[styles.indicator, pill]} /> : null}
        {options.map((o) => {
          const selected = o.kind === active;
          return (
            <Pressable
              key={o.kind}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              aria-selected={selected}
              accessibilityLabel={o.kind === 'negocio' ? `Ver dados do negócio ${o.label}` : `Ver dados de ${o.label}`}
              onPress={() => (selected ? undefined : setSpace(o.kind))}
              onLayout={(e) => {
                const { width } = e.nativeEvent.layout;
                setSpots((s) => (s[o.kind]?.width === width ? s : { ...s, [o.kind]: { x: 0, width } }));
              }}
              style={(s) => [
                styles.option,
                // Só o nome do negócio (escrito pela pessoa, pode ser longo) encolhe e é cortado; "Pessoal" e "Família" ficam inteiros.
                o.kind === 'negocio' && styles.optionShrinks,
                equal && styles.optionEqual,
                compact && styles.optionCompact,
                compact && options.length > 2 && styles.optionCompactThree,
                (!placed || !slides) && selected && styles.optionSelected,
                (s as { focused?: boolean }).focused && focusOnBrand,
              ]}>
              {/* O ícone não encolhe: com o nome longo do negócio em 320 px, só o nome é cortado (com reticências). */}
              {o.kind === 'familia' ? <Users size={18} color={selected ? colors.brand : colors.textOnBrand} style={{ flexShrink: 0 }} /> : null}
              {o.kind === 'negocio' ? <Store size={18} color={selected ? colors.brand : colors.textOnBrand} style={{ flexShrink: 0 }} /> : null}
              <Txt
                variant="label"
                numberOfLines={1}
                color={selected ? colors.brand : colors.textOnBrand}
                style={{ fontFamily: fonts.bold, fontSize: 16, flexShrink: 1 }}>
                {o.label}
              </Txt>
            </Pressable>
          );
        })}
      </View>
      {/* Fora da lista de abas: é um botão (abre a folha), não um espaço. */}
      {creatable ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={creatable}
          onPress={() => setCreating(true)}
          style={(s) => [
            styles.add,
            compact && styles.addCompact,
            (s.pressed || (s as { hovered?: boolean }).hovered) && { backgroundColor: colors.onBrandPressed },
            (s as { focused?: boolean }).focused && focusOnBrand,
          ]}>
          <Plus size={22} color={colors.textOnBrand} strokeWidth={2.5} aria-hidden />
        </Pressable>
      ) : null}
      {creating ? <SpaceSheet mode="criar" onClose={() => setCreating(false)} /> : null}
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
  // Versão para computador: as setas ficam junto do nome do mês, à esquerda, em vez de nas pontas do cartão (pedido do Enzo, 23/11/2026).
  const compact = useWideLayout();
  const forward = canGoForward(month, currentMonth);
  const prev = addMonths(month, -1);
  const next = addMonths(month, 1);
  return (
    <View style={[styles.month, compact && styles.monthCompact]}>
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
        style={[{ flex: 1, textAlign: 'center', fontFamily: fonts.semibold }, compact && styles.monthLabelCompact]}
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
  // Versão para computador: o bloco azul como cartão (o raio dos cartões grandes, `Card`), dentro de uma faixa com a largura do conteúdo.
  cardWrap: { width: '100%', alignSelf: 'center' },
  // `scrollbarGutter` só vale com `overflow` diferente de visível: nada passa da borda, então nada é cortado.
  cardGutter: { width: '100%', overflow: 'hidden', scrollbarGutter: 'stable both-edges' } as object,
  // Os quatro cantos um a um: o raio de baixo da faixa do celular (`band`) venceria um `borderRadius` geral.
  bandCard: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  innerCard: { maxWidth: '100%', paddingTop: space[5] },
  innerCardTitleOnly: { paddingBottom: space[5] },
  subCard: { borderRadius: radius.lg },
  // A largura dos cartões de baixo: a margem dos lados (WIDE_GUTTER) também quando a tela é mais estreita que 760 px (1024 px de janela).
  heroCard: {
    width: `calc(100% - ${2 * WIDE_GUTTER}px)` as `${number}%`,
    maxWidth: WIDE_TAB_MAX - 2 * WIDE_GUTTER,
    alignSelf: 'center',
    marginTop: space[5],
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    overflow: 'hidden',
  },
  heroCardInner: { maxWidth: '100%', paddingTop: space[5] },
  inner: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: space[6], paddingTop: space[4], paddingBottom: space[6] },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space[5], gap: space[3] },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  // overflowWrap (web): uma palavra mais larga que a faixa quebra em vez de passar da tela com letra muito grande; no aparelho o texto já quebra.
  // A margem de baixo fica só na linha do título (titleRow): com as duas, o título sem pílula ganhava 16 px a mais (Movimentos).
  title: { fontSize: 24, lineHeight: 32, overflowWrap: 'anywhere' } as object,
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space[3], rowGap: space[1], marginBottom: space[4] },
  // O atalho do título (44 px de toque) não aumenta a linha de 32 px: as margens negativas compensam a diferença.
  titleAction: { marginVertical: -6 },
  // Fim da linha do título: o atalho (D-105) e, no computador, "Ocultar valores" (D-110), encostados à direita.
  titleEnd: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: space[2] },
  avatar: { minWidth: 44, height: 44, paddingHorizontal: 4, borderRadius: 22, backgroundColor: colors.surfaceOnBrand, alignItems: 'center', justifyContent: 'center' },
  eye: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  // Computador: o olho com o texto, numa pílula azul mais escura sobre a faixa (o mesmo azul do trilho do seletor Pessoal e Família).
  eyeLabeled: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 44, paddingHorizontal: space[4], borderRadius: radius.pill, backgroundColor: colors.brandDeep },
  eyeLabeledHover: { backgroundColor: colors.onBrandPressed },
  // Nas abas com título, o olho fica na mesma linha, encostado à direita (titleEnd); no Resumo (sem título), numa linha só dele, acima do mês.
  wideTop: { flexDirection: 'row', justifyContent: 'flex-end' },
  // Com o seletor de espaço na mesma linha (o Resumo no computador): o seletor à esquerda, "Ocultar valores" à direita.
  wideTopSplit: { justifyContent: 'space-between', alignItems: 'center', gap: space[4] },
  wideTopStart: { flexShrink: 1, minWidth: 0 },
  subBand: { backgroundColor: colors.brand },
  subInner: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingTop: space[2], paddingBottom: space[3], paddingHorizontal: space[3] },
  // Celular: duas linhas, a da seta, do título e do "?" e, embaixo, a da pílula.
  subInnerStacked: { flexDirection: 'column', alignItems: 'stretch', gap: 0 },
  // Computador, sem a seta (a Conta): o título começa onde começa o título das abas (24 px da borda do cartão), e o cartão mantém a altura
  // dos outros cabeçalhos compactos (a linha de 44 px da seta e as margens de cima e de baixo).
  subInnerNoBack: { paddingLeft: space[6], minHeight: 44 + space[2] + space[3] },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  subMainStacked: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  // A pílula começa alinhada ao título: a seta (44 px) e o espaço depois dela (8 px).
  subPillRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 44 + space[2] },
  // O "?" fica por cima do alvo da pílula, que sobe um pouco na linha do título (ContextPill).
  helpSlot: { zIndex: 1 },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  subMain: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space[2], rowGap: space[1] },
  // Computador: o título ocupa a largura natural; se não couber numa linha ao lado do contexto, o contexto passa para baixo.
  subTitle: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 0, overflowWrap: 'anywhere' } as object,
  // flexShrink: com letra grande, o texto quebra dentro da pílula em vez de passar da largura da tela.
  pill: { backgroundColor: colors.surfaceOnBrand, borderRadius: radius.pill, paddingHorizontal: space[3], paddingVertical: space[1], marginRight: space[3], flexShrink: 1 },
  pillStacked: { marginRight: 0 },
  pillDemo: { backgroundColor: colors.accent },
  // A pílula que abre a folha de espaços (D-113b): o alvo tem 44 px de altura, com a pílula do mesmo desenho no meio.
  pillTarget: { minHeight: 44, justifyContent: 'center', flexShrink: 1, borderRadius: radius.pill },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  pillChevron: { flexShrink: 0 },
  track: { flexDirection: 'row', backgroundColor: colors.brandDeep, borderRadius: radius.md, padding: 4, gap: 4 },
  tabs: { flex: 1, minWidth: 0, flexDirection: 'row' },
  // Computador: o trilho na largura das opções (optionCompact), encostado à esquerda.
  trackCompact: { alignSelf: 'flex-start', maxWidth: '100%' },
  // flexGrow e flexBasis um a um: `flex: 0` vira base 0 na web e as opções sumiam.
  tabsCompact: { flexGrow: 0, flexShrink: 1, flexBasis: 'auto' },
  // Cada opção com pelo menos 160 px e até 240, na largura do nome (revisão de 23/11/2026: com 160 fixos, "Sacolé da Maria" virava
  // "Sacolé da Ma…"). Só o que passa de 240 é cortado, e com pouco espaço o nome mais longo encolhe até o mínimo.
  optionCompact: { flexGrow: 0, flexShrink: 1, flexBasis: 'auto', minWidth: 160, maxWidth: 240, minHeight: 44 },
  // Com os três espaços, 136 px no mínimo: em 1024 px, o seletor e "Ocultar valores" continuam cabendo na mesma linha do Resumo.
  optionCompactThree: { minWidth: 136 },
  addCompact: { width: 44, minHeight: 44 },
  indicator: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 13, backgroundColor: colors.surfaceOnBrand },
  // O "+" do seletor: quadrado de 48 px, do tamanho das opções, com o desenho branco sobre o azul escuro do trilho.
  add: { width: 48, minHeight: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  // Celular: cada opção parte da largura do nome e divide o que sobra do trilho por igual (flexGrow com base no conteúdo).
  option: {
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: 'auto',
    minHeight: 48,
    minWidth: 0,
    borderRadius: 13,
    flexDirection: 'row',
    gap: space[2],
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[2],
  },
  optionShrinks: { flexShrink: 1 },
  // Letra grande do aparelho (acima de 1,3): os nomes não cabem lado a lado; partes iguais, com reticências, para nenhum sair do trilho.
  optionEqual: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  optionSelected: { backgroundColor: colors.surfaceOnBrand },
  // O mês vem logo abaixo do seletor de espaço (D-113b: o seletor aparece sempre): 8 px, para o primeiro movimento continuar à vista sem rolar.
  month: { flexDirection: 'row', alignItems: 'center', marginTop: space[2] },
  // Computador: o mês e as setas juntos, à esquerda; a seta da esquerda alinhada com o texto de baixo (o desenho tem 11 px de folga no botão).
  monthCompact: { alignSelf: 'flex-start', marginLeft: -11 },
  monthLabelCompact: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', minWidth: 176 },
  monthBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
