/**
 * Ano de conta do ano que atravessa dezembro: "2026/2027" na tela e "2026 a 2027" para leitores de tela (spec 1.7).
 * Datas como 10/02/2027 não mudam. Módulo sem dependências, para os componentes básicos (ui.tsx) também usarem.
 */
export const yearA11y = (text: string) => text.replace(/\b(\d{4})\/(\d{4})\b/g, '$1 a $2');

/** Nome acessível só quando o texto tem um ano como "2026/2027" (undefined: o leitor de tela lê o próprio texto). */
export const yearA11yLabel = (text: string): string | undefined => {
  const spoken = yearA11y(text);
  return spoken === text ? undefined : spoken;
};
