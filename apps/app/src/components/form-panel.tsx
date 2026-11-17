import { router, useIsFocused } from 'expo-router';
import { createContext, useEffect, useRef, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, space } from '@/theme/tokens';

/** Largura do painel dos formulários na versão para computador. */
export const FORM_PANEL_WIDTH = 560;

/**
 * Verdadeiro dentro do painel dos formulários: o cabeçalho compacto (`SubHeader`) fica preso ao alto do painel, que já tem os cantos
 * arredondados, em vez de virar um cartão próprio como nas telas cheias do computador.
 */
export const InPanelContext = createContext(false);

/**
 * O endereço de uma tela a partir do nome da rota e dos parâmetros ("registro/[id]/editar" → "/registro/abc/editar").
 */
export function routePath(name: string, params: Record<string, unknown> | undefined): string {
  const filled = name.replace(/\[([^\]]+)\]/g, (_, k: string) => String(params?.[k] ?? k));
  return `/${filled}`.replace(/\/index$/, '') || '/';
}

const ID = '[^/]+';
const MONTH = '\\d{4}-\\d{2}';
/**
 * As telas que abrem no painel à direita, na versão para computador: os formulários do dia a dia e o detalhe de um lançamento, de uma
 * conta a pagar, de um gasto fixo e de um cartão. Lista própria, sem as telas de entrada, de carregamento, de convite e de exclusão da
 * conta (revisão independente de 12/11/2026), que ficam em tela cheia.
 */
const PANEL_PATHS: readonly RegExp[] = [
  new RegExp(`^/registro/(novo|${ID}|${ID}/editar)$`),
  new RegExp(`^/a-pagar/(nova|(?!vencidas$)${ID}|${ID}/(editar|pagar))$`),
  new RegExp(`^/gastos-fixos/(novo|(?!assinaturas$)${ID}|${ID}/(editar|encerrar|informar))$`),
  new RegExp(`^/meta/(nova|${ID}/(editar|movimento))$`),
  new RegExp(`^/investimento/(novo|${ID}/(editar|movimento))$`),
  /^\/renda-comprometida\/(referencia|limite)$/,
  new RegExp(`^/orcamento/${ID}$`),
  new RegExp(`^/contas/(nova|${ID}/editar)$`),
  new RegExp(`^/cartoes/(novo|${ID}|${ID}/editar|${ID}/fatura/${MONTH}/(pagar|encargo|estorno|compra))$`),
];

/** Tela que, no computador, abre no painel à direita. */
export function isPanelRoute(name: string, params: Record<string, unknown> | undefined): boolean {
  const path = routePath(name, params);
  return PANEL_PATHS.some((re) => re.test(path));
}

/** Esc e o toque no fundo fazem o mesmo que o "voltar" da tela; sem tela atrás (endereço aberto direto), voltam ao Resumo. */
function closePanel() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Há uma janela do app aberta (confirmação, escolha) além dos painéis: o Esc é dela. */
function otherModalOpen(): boolean {
  return Array.from(document.querySelectorAll('[aria-modal="true"]')).some((e) => !e.hasAttribute('data-form-panel'));
}

/**
 * Na versão para computador (pedido do Enzo em 12/11/2026), os formulários e alguns detalhes abrem num painel à direita, por cima da
 * tela de onde vieram, que continua à vista atrás do fundo escurecido. Tocar no fundo ou apertar Esc fecha, como o "voltar" da tela.
 * O painel recebe o foco ao abrir e o devolve ao fechar; o que fica atrás (inclusive a barra lateral) sai do caminho do teclado e do
 * leitor de tela enquanto ele está aberto (`inert`). Só o painel de cima responde ao Esc, e nunca com uma janela de confirmação aberta.
 */
export function FormPanel({ children }: { children: ReactNode }) {
  const focused = useIsFocused();
  const panel = useRef<View>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !focused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || otherModalOpen()) return;
      e.preventDefault();
      closePanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focused]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const el = panel.current as unknown as HTMLElement | null;
    if (!el || typeof el.setAttribute !== 'function') return;
    const before = document.activeElement as HTMLElement | null;
    // O nome do painel é o título da tela.
    const title = el.querySelector('[role="heading"]')?.textContent?.trim();
    if (title) el.setAttribute('aria-label', title);
    const touched: HTMLElement[] = [];
    for (let node: HTMLElement | null = el; node && node !== document.body; node = node.parentElement) {
      const parent: HTMLElement | null = node.parentElement;
      if (!parent) break;
      for (const sib of Array.from(parent.children) as HTMLElement[]) {
        if (sib === node || sib.hasAttribute('inert') || sib.hasAttribute('data-panel-scrim') || sib.tagName === 'SCRIPT') continue;
        sib.setAttribute('inert', '');
        touched.push(sib);
      }
    }
    el.focus({ preventScroll: true });
    return () => {
      touched.forEach((s) => s.removeAttribute('inert'));
      if (before && document.contains(before)) before.focus({ preventScroll: true });
    };
  }, []);

  return (
    <View style={styles.wrap}>
      <Pressable
        style={styles.scrim}
        accessibilityRole="button"
        accessibilityLabel="Fechar"
        {...({ dataSet: { panelScrim: '' } } as object)}
        onPress={closePanel}
      />
      <View ref={panel} style={styles.panel} role="dialog" aria-modal {...({ dataSet: { formPanel: '' }, tabIndex: -1 } as object)}>
        <InPanelContext value={true}>{children}</InPanelContext>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // O fundo escurecido cobre também a margem em volta do painel; só a área à esquerda fecha ao tocar.
  wrap: { flex: 1, flexDirection: 'row', backgroundColor: colors.scrim },
  scrim: { flex: 1 },
  // Um cartão com os quatro cantos arredondados, afastado do alto, da direita e do pé da janela (D-110), como o bloco azul das telas.
  panel: {
    width: FORM_PANEL_WIDTH,
    maxWidth: '100%',
    marginVertical: space[3],
    marginRight: space[3],
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: space[6],
    shadowOffset: { width: -4, height: 0 },
    outlineStyle: 'none',
  } as object,
});
