import { BAR_TEXT, BUSINESS_WORDS, barModeFor, isNoTabArea, topicTabFor } from '@clarevo/core';
import { router, usePathname } from 'expo-router';
import { Eye, EyeOff, MonitorSmartphone, Plus } from 'lucide-react-native';
import { type GestureResponderEvent, Pressable, StyleSheet, View } from 'react-native';

import { Logo } from '@/components/brand';
import { ProfileAvatar } from '@/components/profile-photo';
import { TABS, useLastTab } from '@/components/tab-bar';
import { Button, DemoPill, Txt, styles as ui } from '@/components/ui';
import { promptInstall, useCanInstall } from '@/lib/install-prompt';
import { contaBelow, useNavState } from '@/lib/nav-state';
import { SIDE_NAV_WIDTH } from '@/lib/layout';
import { PRIVACY_TEXT, setValuesHidden, useValuesHidden } from '@/lib/privacy';
import { useWork } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, radius, space } from '@/theme/tokens';

/**
 * No navegador, cada link da barra lateral é um link de verdade (`<a href>`): Enter abre pelo teclado (num `div` com papel de link, o
 * react-native-web espera um clique que nunca vem) e Ctrl ou Cmd + clique abre em outra aba. O clique comum navega dentro do app, sem
 * recarregar a página. `href` não está nos tipos do React Native; o react-native-web desenha o `<a>` com ele.
 */
function navLink(href: string, go: () => void) {
  return {
    href,
    onPress: (e: GestureResponderEvent) => {
      const ev = e as unknown as { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; button?: number; preventDefault?: () => void };
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || (ev.button ?? 0) !== 0) return;
      ev.preventDefault?.();
      go();
    },
  } as { onPress: (e: GestureResponderEvent) => void };
}

/**
 * A barra lateral da versão para computador (a partir de 1024 px; pedido do Enzo em 12/11/2026): o logotipo, "Anotar gasto" sempre à
 * vista, as cinco áreas do app e, embaixo, ocultar valores e a Conta. Aparece em todas as telas da conta pronta (abas, consultas e
 * formulários), no lugar das abas de baixo. A área marcada é a da tela de agora ou, numa tela aberta por cima, a de onde a pessoa veio.
 */
export function DesktopNav() {
  const pathname = usePathname();
  const origin = useLastTab();
  const { user, auth } = useSession();
  const work = useWork().data;
  const hidden = useValuesHidden();
  const canInstall = useCanInstall();
  const canWrite = work?.canWrite ?? true;
  const path = pathname.replace(/\/+$/, '') || '/';
  const inTabs = barModeFor(pathname) === 'abas';
  const active = inTabs ? path : (origin ?? topicTabFor(pathname));
  const navState = useNavState();
  const fromConta = !inTabs && contaBelow(navState);
  // A área de Conta (Conta, Família, painel da empresa, Contabilidade) e o que se abre dela: a Conta marcada, nenhuma aba (core/navigation).
  const onConta = isNoTabArea(path) || fromConta;

  return (
    <View style={styles.nav} role="navigation" aria-label={BAR_TEXT.label}>
      <View style={styles.brandRow}>
        {/* O logotipo leva ao Resumo, a tela inicial (pedido do Enzo, 23/11/2026), como o Resumo da lista de baixo. */}
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Clarevo: ir para o Resumo"
          {...navLink('/', () => (inTabs ? router.navigate('/') : router.dismissTo('/')))}
          style={(s) => [styles.logoLink, (s as { focused?: boolean }).focused && ui.focusRing]}>
          <Logo height={26} />
        </Pressable>
        {auth.mode === 'demo' ? (
          <View style={{ alignSelf: 'flex-start' }}>
            <DemoPill />
          </View>
        ) : null}
      </View>
      {canWrite ? (
        <Button
          // No espaço Negócio, "Anotar saída" (auditoria de 18/11/2026).
          label={work?.contextKind === 'negocio' ? BUSINESS_WORDS.addOut : 'Anotar gasto'}
          icon={Plus}
          // Com o formulário já aberto, não abre outro igual por cima.
          onPress={() => (path === '/registro/novo' ? undefined : router.push({ pathname: '/registro/novo', params: { tipo: 'despesa' } }))}
        />
      ) : null}
      <View style={{ gap: space[1], marginTop: space[2] }}>
        {TABS.map((t) => {
          const focused = !onConta && t.href === active;
          const Icon = t.icon;
          const color = focused ? colors.brandText : colors.textSecondary;
          return (
            <Pressable
              key={t.name}
              accessibilityRole="link"
              accessibilityLabel={t.a11y}
              aria-current={focused ? 'page' : undefined}
              // Nas abas, troca de aba; numa tela aberta por cima, fecha as telas abertas e volta à aba (como a barra das telas de consulta).
              {...navLink(t.href, () => (inTabs ? router.navigate(t.href) : router.dismissTo(t.href)))}
              style={(s) => [styles.item, focused && styles.itemActive, (s as { hovered?: boolean }).hovered && !focused && styles.itemHover, (s as { focused?: boolean }).focused && ui.focusRing]}>
              <Icon size={22} color={color} strokeWidth={focused ? 2.25 : 2} aria-hidden />
              <Txt variant="label" color={focused ? colors.brandText : colors.text} style={{ fontFamily: focused ? fonts.bold : fonts.semibold }}>
                {t.label}
              </Txt>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flex: 1 }} />
      {canInstall ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Instalar no computador: janela própria e ícone na barra de tarefas"
          onPress={() => void promptInstall()}
          style={(s) => [styles.item, (s as { hovered?: boolean }).hovered && styles.itemHover, (s as { focused?: boolean }).focused && ui.focusRing]}>
          <MonitorSmartphone size={22} color={colors.brandText} aria-hidden />
          <Txt variant="label" color={colors.brandText} style={{ fontFamily: fonts.semibold }}>
            Instalar no computador
          </Txt>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={hidden ? PRIVACY_TEXT.showNow : PRIVACY_TEXT.hideNow}
        onPress={() => setValuesHidden(!hidden)}
        style={(s) => [styles.item, (s as { hovered?: boolean }).hovered && styles.itemHover, (s as { focused?: boolean }).focused && ui.focusRing]}>
        {hidden ? <Eye size={22} color={colors.textSecondary} aria-hidden /> : <EyeOff size={22} color={colors.textSecondary} aria-hidden />}
        <Txt variant="label" style={{ fontFamily: fonts.semibold }}>
          {hidden ? PRIVACY_TEXT.showNow : PRIVACY_TEXT.hideNow}
        </Txt>
      </Pressable>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Conta: perfil, assinatura, lembretes, privacidade e segurança"
        aria-current={onConta ? 'page' : undefined}
        // Com a Conta já na pilha (numa tela aberta a partir dela), volta a ela em vez de abrir outra Conta por cima.
        {...navLink('/conta', () => (fromConta ? router.dismissTo('/conta') : router.push('/conta')))}
        style={(s) => [styles.item, onConta && styles.itemActive, (s as { hovered?: boolean }).hovered && !onConta && styles.itemHover, (s as { focused?: boolean }).focused && ui.focusRing]}>
        <View style={styles.avatar}>
          <ProfileAvatar size={36} background={colors.onBrandSoft} color={colors.brand} textVariant="caption" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="label" color={onConta ? colors.brandText : colors.text} style={{ fontFamily: onConta ? fonts.bold : fonts.semibold }} numberOfLines={1}>
            {user?.displayName || 'Conta'}
          </Txt>
          <Txt variant="caption" color={colors.textSecondary}>
            Conta
          </Txt>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    width: SIDE_NAV_WIDTH,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingHorizontal: space[4],
    paddingTop: space[6],
    paddingBottom: space[5],
    gap: space[3],
  },
  brandRow: { gap: space[2], paddingHorizontal: space[2], marginBottom: space[2] },
  logoLink: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', borderRadius: radius.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 48, paddingHorizontal: space[3], borderRadius: radius.md },
  itemActive: { backgroundColor: colors.brandTint },
  itemHover: { backgroundColor: colors.background },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.onBrandSoft },
});
