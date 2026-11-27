import {
  CHOSEN_PLAN_STORAGE_KEY,
  chosenPlanFromSearch,
  parseChosenPlan,
  parseStoredChosenPlan,
  serializeChosenPlan,
  type ChosenPlan,
} from '@clarevo/core';
import { Platform } from 'react-native';

/**
 * O plano escolhido no site (jornada de compra de 27/11/2026, item 15; regras em `packages/core/src/plano-escolhido.ts`): lido do endereço
 * de Criar conta ou de Entrar, guardado só neste aparelho (na web, no localStorage; no celular, só na memória enquanto o app está aberto,
 * porque os links do site abrem a versão web) e usado uma vez, na primeira abertura da tela Assinatura. Nunca vai ao servidor. Ler ou gravar
 * pode falhar (navegação privada, armazenamento bloqueado): fica a cópia em memória, e nada quebra.
 */
let memory: ChosenPlan | null = null;

function storage(): Storage | null {
  if (Platform.OS !== 'web') return null;
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

function save(choice: ChosenPlan): void {
  memory = choice;
  try {
    storage()?.setItem(CHOSEN_PLAN_STORAGE_KEY, serializeChosenPlan(choice));
  } catch {
    // Sem armazenamento: fica a memória.
  }
}

/** Guarda a escolha que veio nos parâmetros da tela (Criar conta ou Entrar), se for válida. Parâmetros sem escolha não apagam a de antes. */
export function rememberChosenPlan(params: Readonly<Record<string, unknown>>): void {
  const choice = parseChosenPlan(params);
  if (choice) save(choice);
}

/**
 * Na web, ao abrir o app: o endereço da primeira carga, se for Criar conta ou Entrar com a escolha (quem já está na conta e toca no link do
 * site vai direto ao app, sem passar por essas telas).
 */
export function rememberChosenPlanFromLocation(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.location) return;
  try {
    const { pathname, search } = window.location;
    if (!/^\/(criar-conta|entrar)\/?$/.test(pathname)) return;
    const choice = chosenPlanFromSearch(search);
    if (choice) save(choice);
  } catch {
    // Endereço ilegível: nada guardado.
  }
}

/** A escolha guardada, sem apagar. */
export function peekChosenPlan(): ChosenPlan | null {
  if (memory) return memory;
  try {
    const stored = parseStoredChosenPlan(storage()?.getItem(CHOSEN_PLAN_STORAGE_KEY) ?? null);
    if (stored) memory = stored;
    return stored;
  } catch {
    return null;
  }
}

/** Tira a escolha do aparelho (depois de usada, com assinatura ou ao sair da conta). Nunca falha. */
export function clearChosenPlan(): void {
  memory = null;
  try {
    storage()?.removeItem(CHOSEN_PLAN_STORAGE_KEY);
  } catch {
    // Sem armazenamento: nada a apagar.
  }
}
