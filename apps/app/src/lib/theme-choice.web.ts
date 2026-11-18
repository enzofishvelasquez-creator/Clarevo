import { DEFAULT_THEME_CHOICE, THEME_STORAGE_KEY, parseThemeChoice, storedThemeValue, type ThemeChoice, type ThemeScheme } from '@clarevo/core';
import { useSyncExternalStore } from 'react';

import { createThemeChoiceMemory } from './theme-choice-memory';

/**
 * Versão web de `theme-choice.ts` (Conta › Tema, D-112): a escolha fica só neste navegador, no localStorage (`clarevo.tema.v1`, com
 * "light" ou "dark"; "Igual ao aparelho" é não ter a chave), e é lida de forma síncrona antes de `theme/tokens.ts` escolher as cores. O
 * script de `public/index.html` lê a mesma chave para pintar o fundo da página antes de o app desenhar. Ler ou gravar pode falhar
 * (navegação privada, armazenamento bloqueado): vale o tema do navegador. Também na demonstração, porque aplicar é recarregar a página.
 */
function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readStored(): ThemeChoice {
  try {
    return parseThemeChoice(storage()?.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME_CHOICE;
  }
}

/** A escolha lida ao carregar a página, antes das cores: é a que vale neste carregamento. */
export const OPENING_THEME_CHOICE: ThemeChoice = readStored();

const memory = createThemeChoiceMemory(OPENING_THEME_CHOICE);

export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(memory.subscribe, memory.get, memory.get);
}

/** Guarda a escolha neste navegador. false: não deu para guardar, e a escolha marcada continua a de antes. */
export function saveThemeChoice(choice: ThemeChoice): boolean {
  const s = storage();
  if (!s) return false;
  try {
    const value = storedThemeValue(choice);
    if (value) s.setItem(THEME_STORAGE_KEY, value);
    else s.removeItem(THEME_STORAGE_KEY);
  } catch {
    return false;
  }
  memory.set(choice);
  return true;
}

/** Ao sair da conta ou excluí-la (`forgetDevice`): a escolha sai do navegador. Nunca falha. */
export function forgetThemeChoice(): void {
  memory.set(DEFAULT_THEME_CHOICE);
  try {
    storage()?.removeItem(THEME_STORAGE_KEY);
  } catch {
    // Sem armazenamento: nada a apagar.
  }
}

/** "Aplicar agora" (só quando a pessoa toca; o app nunca recarrega sozinho, D-096): recarrega a página, que lê a escolha ao carregar. */
export async function applyThemeNow(_choice: ThemeChoice, _opening: ThemeScheme): Promise<boolean> {
  try {
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}
