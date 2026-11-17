import { DEFAULT_THEME_CHOICE, THEME_STORAGE_KEY, parseThemeChoice, storedThemeValue, type ThemeChoice, type ThemeScheme } from '@clarevo/core';
import type { File } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

import { createThemeChoiceMemory } from './theme-choice-memory';

/**
 * Conta › Tema no celular (D-112, complementa a D-096). A escolha fica só neste aparelho, num arquivo pequeno na pasta de documentos do
 * app (`clarevo.tema.v1`, com "light" ou "dark"; "Igual ao aparelho" é não ter o arquivo). As cores são escolhidas uma vez, quando
 * `theme/tokens.ts` é avaliado, então a escolha precisa ser lida antes disso e de forma síncrona: o AsyncStorage das outras preferências
 * (`device-prefs.ts`) só lê de forma assíncrona. A leitura usa `File.textSync` do expo-file-system, que já está no app instalado (é o
 * mesmo das exportações e importações de arquivo): nada de pacote nativo novo, que pediria build novo, e a mudança chega aos celulares
 * de teste pela atualização pelo ar (D-100). A versão web é `theme-choice.web.ts`. Os pacotes do aparelho são carregados na hora de
 * usar, e não no alto do arquivo, como em `theme/tokens.ts`, que importa este arquivo: fora do app (testes no Node), vale o padrão.
 */
function themeFile(): File {
  const fs = require('expo-file-system') as typeof import('expo-file-system');
  return new fs.File(fs.Paths.document, THEME_STORAGE_KEY);
}

function setProcessScheme(scheme: ThemeScheme | 'unspecified'): void {
  const { Appearance } = require('react-native') as typeof import('react-native');
  Appearance.setColorScheme(scheme);
}

function readStored(): ThemeChoice {
  try {
    const file = themeFile();
    return file.exists ? parseThemeChoice(file.textSync()) : DEFAULT_THEME_CHOICE;
  } catch {
    // Sem como ler: vale o tema do aparelho.
    return DEFAULT_THEME_CHOICE;
  }
}

/** A escolha lida ao abrir o app, antes das cores: é a que vale nesta abertura. */
export const OPENING_THEME_CHOICE: ThemeChoice = readStored();

const memory = createThemeChoiceMemory(OPENING_THEME_CHOICE);

/** A escolha marcada em Conta (muda na hora; as cores, só na próxima abertura ou com "Aplicar agora"). */
export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(memory.subscribe, memory.get, memory.get);
}

/** Guarda a escolha neste aparelho. false: não deu para guardar, e a escolha marcada continua a de antes. */
export function saveThemeChoice(choice: ThemeChoice): boolean {
  try {
    const value = storedThemeValue(choice);
    const file = themeFile();
    if (value) file.write(value);
    else if (file.exists) file.delete();
  } catch {
    return false;
  }
  memory.set(choice);
  return true;
}

/** Ao sair da conta ou excluí-la (`forgetDevice`): a escolha sai do aparelho e a próxima abertura volta ao tema do aparelho. Nunca falha. */
export function forgetThemeChoice(): void {
  memory.set(DEFAULT_THEME_CHOICE);
  try {
    const file = themeFile();
    if (file.exists) file.delete();
  } catch {
    // Sem armazenamento: nada a apagar.
  }
}

/**
 * "Aplicar agora" (só quando a pessoa toca; o app nunca recarrega sozinho, D-096): reabre o app com o tema escolhido, pelo
 * `reloadAsync` do expo-updates (que já está instalado) e, onde ele não vale (em desenvolvimento), pelo `reloadAppAsync` do Expo. Antes,
 * o tema do processo, que `_layout.tsx` prendeu ao da abertura e que continua depois de reabrir só o JavaScript, passa para o
 * escolhido ("unspecified" em "Igual ao aparelho"): assim o tema do aparelho é lido de novo e teclado, seletores e alertas já vêm no
 * novo tema. false: não deu para reabrir (o tema do processo volta ao desta abertura e a escolha vale na próxima).
 */
export async function applyThemeNow(choice: ThemeChoice, opening: ThemeScheme): Promise<boolean> {
  setProcessScheme(storedThemeValue(choice) ?? 'unspecified');
  // A troca do tema do processo roda na linha principal do aparelho; a reabertura vai para a mesma fila, logo depois.
  await new Promise((resolve) => setTimeout(resolve, 150));
  try {
    const Updates = require('expo-updates') as typeof import('expo-updates');
    await Updates.reloadAsync();
    return true;
  } catch {
    // Em desenvolvimento ou sem o expo-updates ativo: o reload do próprio Expo.
  }
  try {
    const { reloadAppAsync } = require('expo') as typeof import('expo');
    await reloadAppAsync('Tema escolhido em Conta');
    return true;
  } catch {
    setProcessScheme(opening);
    return false;
  }
}
