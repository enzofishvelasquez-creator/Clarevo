import { BAR_TEXT, barModeFor, topicTabFor } from '@clarevo/core';
import { router, usePathname } from 'expo-router';
import { Eye, EyeOff, MonitorSmartphone, Plus } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { Logo } from '@/components/brand';
import { initialsOf } from '@/components/header';
import { TABS, useLastTab } from '@/components/tab-bar';
import { Button, DemoPill, Txt, styles as ui } from '@/components/ui';
import { promptInstall, useCanInstall } from '@/lib/install-prompt';
import { SIDE_NAV_WIDTH } from '@/lib/layout';
import { PRIVACY_TEXT, setValuesHidden, useValuesHidden } from '@/lib/privacy';
import { useWork } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, radius, space } from '@/theme/tokens';

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
  const onConta = /^\/conta(\/|$)/.test(path);

  return (
    <View style={styles.nav} role="navigation" aria-label={BAR_TEXT.label}>
      <View style={styles.brandRow}>
        <Logo height={26} />
        {auth.mode === 'demo' ? (
          <View style={{ alignSelf: 'flex-start' }}>
            <DemoPill />
          </View>
        ) : null}
      </View>
      {canWrite ? (
        <Button
          label="Anotar gasto"
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
              onPress={() => (inTabs ? router.navigate(t.href) : router.dismissTo(t.href))}
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
        onPress={() => router.push('/conta')}
        style={(s) => [styles.item, onConta && styles.itemActive, (s as { hovered?: boolean }).hovered && !onConta && styles.itemHover, (s as { focused?: boolean }).focused && ui.focusRing]}>
        <View style={styles.avatar}>
          <Txt variant="caption" color={colors.brand} style={{ fontFamily: fonts.extrabold }} maxFontSizeMultiplier={1.3}>
            {initialsOf(user?.displayName ?? '')}
          </Txt>
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
  item: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 48, paddingHorizontal: space[3], borderRadius: radius.md },
  itemActive: { backgroundColor: colors.brandTint },
  itemHover: { backgroundColor: colors.background },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.onBrandSoft },
});
