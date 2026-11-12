/**
 * Tokens do Clarevo · direção "Azul vivo e lima" (CL-V001, 07/10/2026).
 * Contrastes verificados em pares opacos: branco/azul 5,59:1; texto/lima 12,36:1; secundário/branco 7,14:1.
 *
 * Modo escuro (D-096, 12/11/2026): as cores vêm de uma de duas paletas desenhadas (`palettes.ts`, com as mesmas chaves; nada é
 * invertido automaticamente), escolhida uma vez, quando este módulo é avaliado: na web pelo `prefers-color-scheme` do navegador e no
 * celular pelo tema do aparelho (`Appearance`). Os componentes continuam importando `colors` e usando em `StyleSheet.create` no nível
 * do módulo, então o tema não troca com o app aberto: vale na próxima abertura (na web, no próximo carregamento da página; o app nunca
 * recarrega sozinho, porque a pessoa pode estar digitando). No celular, `_layout.tsx` trava o tema do processo com
 * `Appearance.setColorScheme(colorScheme)`, para os componentes nativos (teclado, seletores, alertas) combinarem com o app. Regras
 * para cor nova: o azul `brand` é só fundo cheio com texto branco; azul como texto, ícone ou anel de foco é `brandText` (ou
 * `brandTextDeep`); azul de gráfico e de barra é `brandMark`; texto sobre o lima, os selos dos níveis e o coral é `textOnAccent`
 * (sempre escuro); pílula branca sobre o azul é `surfaceOnBrand`. Cor literal fora das paletas quebra o teste de contraste.
 */
import { levelColors as levels, paletteFor, type ColorScheme, type Palette } from './palettes';

export type { ColorScheme } from './palettes';

/** O tema do aparelho ao abrir o app. Fora do app (testes no Node, sem navegador nem React Native), o claro. */
function deviceColorScheme(): ColorScheme {
  try {
    if (process.env.EXPO_OS === 'web') {
      return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }
    // Carregado aqui, e não no alto do arquivo, para os testes do núcleo lerem os tokens sem o React Native.
    const { Appearance } = require('react-native') as typeof import('react-native');
    return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** O tema desta abertura do app ('light' ou 'dark'). */
export const colorScheme: ColorScheme = deviceColorScheme();

export const colors: Palette = paletteFor(colorScheme);

/** Cores dos níveis de conta (D-095): só no selo pequeno do nível, com a medalha em `colors.textOnAccent`. Iguais nos dois temas. */
export const levelColors = levels;

/** Opacidade da sombra do cartão: no escuro, a superfície mais clara que o fundo já separa o cartão, e a sombra preta só dá volume. */
export const cardShadowOpacity = colorScheme === 'dark' ? 0.28 : 0.06;

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40 } as const;

export const radius = { sm: 12, md: 16, lg: 20, xl: 28, pill: 999 } as const;

export const fonts = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extrabold: 'Manrope_800ExtraBold',
} as const;

export const type = {
  hero: { fontFamily: fonts.extrabold, fontSize: 36, lineHeight: 44 },
  amount: { fontFamily: fonts.extrabold, fontSize: 24, lineHeight: 32 },
  title: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 26 },
  body: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 24 },
  label: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
} as const;

/** Números com largura fixa em listas e totais. */
export const tabular = { fontVariant: ['tabular-nums'] as ('tabular-nums')[] };

/** Durações propostas no CL-V008 (ms). Respeitar "reduzir movimento". */
export const motion = { press: 120, context: 200, detail: 280, confirm: 240, progress: 300 } as const;
