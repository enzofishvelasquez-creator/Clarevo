import type { ThemeChoice } from '@clarevo/core';

/**
 * A escolha marcada em Conta › Tema (D-112) enquanto o app está aberto, comum à web (`theme-choice.web.ts`) e ao celular
 * (`theme-choice.ts`). Começa pela escolha lida ao abrir; as cores desta abertura não mudam com ela (só na próxima abertura ou com
 * "Aplicar agora").
 */
export function createThemeChoiceMemory(opening: ThemeChoice) {
  let current = opening;
  const listeners = new Set<() => void>();
  return {
    get: (): ThemeChoice => current,
    set(choice: ThemeChoice) {
      if (current === choice) return;
      current = choice;
      listeners.forEach((l) => l());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
