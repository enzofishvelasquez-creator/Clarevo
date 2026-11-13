/**
 * As duas paletas do app (modo claro e modo escuro, D-096), com as mesmas chaves. Módulo puro, sem React Native: o teste de contraste
 * (`packages/core/test/tema-escuro.test.ts`) o lê direto no Node. Quem desenha a tela importa `colors` de `tokens.ts`, que escolhe a
 * paleta do aparelho ao abrir o app.
 *
 * A paleta escura foi desenhada, não invertida: fundo e superfícies em azul-marinho com o matiz da marca (nada quase preto), texto
 * claro, o lima de sempre com texto escuro por cima, e o azul da marca (`brand`) igual ao claro como fundo cheio (cabeçalho, botão
 * principal, topos) com texto branco. Os comentários de cada cor trazem o contraste daquela paleta, e o teste confere, nas duas, todos os
 * pares de texto que as telas usam (`THEME_CONTRAST_PAIRS`, no núcleo).
 */

export type ColorScheme = 'light' | 'dark';

export const lightColors = {
  /** Azul da marca: fundo cheio do cabeçalho, do botão principal e dos topos, sempre com texto branco por cima. */
  brand: '#2457F5',
  brandPressed: '#1D47CC',
  brandDeep: '#1E4BD8', // trilho do seletor e formas sobre o azul
  brandSoft: '#7FA0F7', // listras do segmento em aberto; 2,5:1 sobre branco, só com rótulo e listras
  /** Azul como cor de texto e de ícone (links, títulos azuis, iniciais, anel de foco) sobre a superfície e os tons claros. */
  brandText: '#2457F5', // 5,59:1 sobre branco
  brandTextDeep: '#1E4BD8', // o azul mais escuro como texto (valor do plano, termo do glossário): 6,34:1 sobre accentTint
  /** Azul das marcas de dados sobre a superfície: barras de progresso, linhas e barras dos gráficos. */
  brandMark: '#2457F5',
  brandMarkDeep: '#1E4BD8', // a parte sólida ("Já pago", "Aportado") ao lado das listras
  accent: '#D4F05B',
  accentTint: '#F2FAD0', // fundo do resumo de explicação ("O que é isso?"): texto 14,57:1; brandText 5,15:1
  illustration: '#F56545',
  text: '#17223B',
  textSecondary: '#4B5873',
  textOnBrand: '#FFFFFF',
  textOnBrandSoft: '#EEF2FF', // 5,0:1 sobre o azul
  /** Texto e ícone sobre o lima, os selos dos níveis e o coral: sempre escuro, nas duas paletas. */
  textOnAccent: '#17223B', // 12,36:1 sobre o lima
  /** Pílulas, avatar e confetes brancos sobre o azul (o azul por cima deles continua 5,59:1). */
  surfaceOnBrand: '#FFFFFF',
  onBrandSoft: '#EAF0FF', // botão suave dentro de um cartão azul: claro nos dois temas, com o azul da marca por cima (4,9:1)
  onBrandSoftPressed: '#DDE7FF',
  surface: '#FFFFFF',
  background: '#F6F8FC',
  brandTint: '#EAF0FF',
  brandTintPressed: '#DDE7FF', // botão suave pressionado: azul sobre ele 4,51:1 (era #DCE6FF, 4,47:1)
  border: '#E3E8F2', // divisórias decorativas
  borderStrong: '#7D8AA6', // contorno de campos e chips: 3,4:1 sobre branco
  error: '#B42318',
  errorTint: '#FDECEA',
  success: '#087E58',
  successText: '#06704F', // texto sobre successTint: 5,6:1
  successTint: '#E3F5EE',
  placeholder: '#616D85', // 5,2:1 sobre branco e 4,55:1 sobre o fundo de erro (era #68748C, 4,11:1 no campo com erro)
  /** Trilho dos seletores ("Por registro | Por categoria") e blocos de carregamento. */
  muted: '#E6EBF5',
  /** Véu atrás das janelas (diálogos, tour, folhas). */
  scrim: 'rgba(23,34,59,0.55)',
  shadow: '#17223B',
  /** Fundo da câmera (leitura de código), escuro nas duas paletas. */
  camera: '#0E1526',
  /** Brancos translúcidos sobre o azul: toque, bloco de carregamento e divisória. Iguais nas duas paletas, porque o azul não muda. */
  onBrandPressed: 'rgba(255,255,255,0.16)',
  onBrandSkeleton: 'rgba(255,255,255,0.22)',
  onBrandLine: 'rgba(255,255,255,0.28)',
  /** Divisória sobre o lima. */
  lineOnAccent: 'rgba(23,34,59,0.14)',
} as const;

/** As cores em hexadecimal ficam com o tipo `#…` (o widget do Android só aceita esse formato); as translúcidas, texto. */
type ColorValue<T> = T extends `#${string}` ? `#${string}` : string;
export type Palette = { readonly [K in keyof typeof lightColors]: ColorValue<(typeof lightColors)[K]> };

export const darkColors: Palette = {
  brand: '#2457F5', // o mesmo azul cheio do claro (cabeçalho, botão principal, topos): branco por cima 5,59:1
  brandPressed: '#1D47CC',
  brandDeep: '#1E4BD8',
  brandSoft: '#5674CF', // listras do segmento em aberto: 3,14:1 sobre a superfície, 2,46:1 sobre brandTint (com rótulo e listras)
  brandText: '#A3BBFF', // 7,28:1 sobre a superfície, 8,66:1 sobre o fundo, 5,70:1 sobre brandTint, 4,80:1 sobre brandTintPressed
  brandTextDeep: '#A3BBFF',
  brandMark: '#7A9CFF', // 5,26:1 sobre a superfície, 4,12:1 sobre brandTint
  brandMarkDeep: '#B4C8FF', // 8,29:1 sobre a superfície
  accent: '#D4F05B', // o mesmo lima, com textOnAccent por cima
  accentTint: '#344019', // lima escuro: texto 9,89:1; secundário 5,34:1; brandText 5,87:1
  illustration: '#F56545',
  text: '#EEF2FB', // 12,27:1 sobre a superfície, 14,60:1 sobre o fundo
  textSecondary: '#A7B4D2', // 6,62:1 sobre a superfície, 7,87:1 sobre o fundo, 5,18:1 sobre brandTint
  textOnBrand: '#FFFFFF',
  textOnBrandSoft: '#EEF2FF',
  textOnAccent: '#17223B',
  surfaceOnBrand: '#FFFFFF',
  onBrandSoft: '#EAF0FF', // botão suave dentro de um cartão azul: claro nos dois temas, com o azul da marca por cima (4,9:1)
  onBrandSoftPressed: '#DDE7FF',
  // Azul-marinho com o matiz da marca (pedido do Enzo, 12/11/2026: "a Clarevo à noite", nada quase preto). A elevação é por clareamento:
  // fundo, cartão um degrau mais claro e o azul claro (brandTint) mais um.
  surface: '#1D2B54',
  background: '#131E3E',
  brandTint: '#283B70', // texto 9,61:1
  brandTintPressed: '#31467F',
  border: '#33436F',
  borderStrong: '#7484AE', // 3,71:1 sobre a superfície, 4,41:1 sobre o fundo
  error: '#FF9C92', // 6,83:1 sobre a superfície, 6,46:1 sobre errorTint
  errorTint: '#4A2631', // texto 11,61:1
  success: '#5ED9AA', // 7,85:1 sobre a superfície
  successText: '#7AE2BA', // 7,41:1 sobre successTint
  successTint: '#173F3B',
  placeholder: '#97A4C3', // 5,51:1 sobre a superfície e 5,22:1 sobre o fundo de erro
  muted: '#2A3A66', // texto 9,88:1
  scrim: 'rgba(8,13,32,0.62)',
  shadow: '#070C1F',
  camera: '#0E1526',
  onBrandPressed: 'rgba(255,255,255,0.16)',
  onBrandSkeleton: 'rgba(255,255,255,0.22)',
  onBrandLine: 'rgba(255,255,255,0.28)',
  lineOnAccent: 'rgba(23,34,59,0.14)',
};

/**
 * Cores dos níveis de conta (D-095), em tom suave (pedido do Enzo, 12/11/2026, no jeito do gov.br): só no selo pequeno do nível, nunca em
 * borda de cartão nem em fundo. Iguais nas duas paletas (os tons claros se veem sobre a superfície escura). A medalha por cima é
 * `textOnAccent` (#17223B): 6,63:1 no bronze, 8,26:1 na prata, 8,12:1 no ouro e 8,51:1 no diamante.
 */
export const levelColors = {
  bronze: '#C9A07E',
  prata: '#B4BCC9',
  ouro: '#D9B65A',
  diamante: '#8CC7DB',
} as const;

export function paletteFor(scheme: ColorScheme): Palette {
  return scheme === 'dark' ? darkColors : lightColors;
}
