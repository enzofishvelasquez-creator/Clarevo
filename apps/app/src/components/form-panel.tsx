import { barModeFor } from '@clarevo/core';
import { router } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { colors, space } from '@/theme/tokens';

/** Largura do painel dos formulários na versão para computador. */
export const FORM_PANEL_WIDTH = 560;

/**
 * O endereço de uma tela a partir do nome da rota e dos parâmetros ("registro/[id]/editar" → "/registro/abc/editar"), para saber se a
 * tela é um formulário (`barModeFor`, o mesmo critério da barra das telas de consulta).
 */
export function routePath(name: string, params: Record<string, unknown> | undefined): string {
  const filled = name.replace(/\[([^\]]+)\]/g, (_, k: string) => String(params?.[k] ?? k));
  return `/${filled}`.replace(/\/index$/, '') || '/';
}

/** Os detalhes que também abrem no painel: um lançamento, uma conta a pagar, um gasto fixo e um cartão (a lista continua à vista atrás). */
const DETAIL_IN_PANEL = /^\/(registro|a-pagar|gastos-fixos|cartoes)\/(?!(novo|nova|vencidas|assinaturas)$)[^/]+$/;

/** Formulário ou detalhe que, no computador, abre no painel à direita. */
export function isFormRoute(name: string, params: Record<string, unknown> | undefined): boolean {
  const path = routePath(name, params);
  return barModeFor(path) === 'formulario' || DETAIL_IN_PANEL.test(path);
}

/**
 * Na versão para computador (pedido do Enzo em 12/11/2026), cada formulário (Anotar gasto, Nova meta, Pagar a fatura...) e o detalhe de
 * um lançamento, de uma conta a pagar ou de um gasto fixo abrem num painel à direita, por cima da tela de onde veio, que continua à vista atrás do fundo escurecido. Tocar no fundo ou apertar Esc fecha, como o
 * "voltar" do formulário. O conteúdo é o mesmo do celular.
 */
export function FormPanel({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && router.canGoBack()) router.back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <View style={styles.wrap}>
      <Pressable style={styles.scrim} accessibilityRole="button" accessibilityLabel="Fechar o formulário" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      <View style={styles.panel} role="dialog" aria-modal>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, flexDirection: 'row' },
  scrim: { flex: 1, backgroundColor: colors.scrim },
  panel: {
    width: FORM_PANEL_WIDTH,
    maxWidth: '100%',
    backgroundColor: colors.background,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    shadowColor: colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: space[6],
    shadowOffset: { width: -4, height: 0 },
  },
});
