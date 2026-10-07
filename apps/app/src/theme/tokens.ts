/**
 * Tokens do Clarevo · direção "Azul vivo e lima" (CL-V001, 07/10/2026).
 * Contrastes verificados em pares opacos: branco/azul 5,59:1; texto/lima 12,36:1; secundário/branco 7,14:1.
 * Tema escuro: ainda não desenhado (não inverter tokens automaticamente).
 */
export const colors = {
  brand: '#2457F5',
  brandPressed: '#1D47CC',
  brandDeep: '#1E4BD8', // trilho do seletor sobre o azul
  accent: '#D4F05B',
  illustration: '#F56545',
  text: '#17223B',
  textSecondary: '#4B5873',
  textOnBrand: '#FFFFFF',
  textOnBrandSoft: '#DCE5FF',
  surface: '#FFFFFF',
  background: '#F6F8FC',
  brandTint: '#EAF0FF',
  border: '#E3E8F2',
  error: '#B42318',
  errorTint: '#FDECEA',
  success: '#087E58',
  successTint: '#E3F5EE',
} as const;

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
