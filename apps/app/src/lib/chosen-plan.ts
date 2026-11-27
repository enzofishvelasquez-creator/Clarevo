import {
  CHOSEN_PLAN_MAX_AGE_MS,
  CHOSEN_PLAN_STORAGE_KEY,
  chosenPlanFromSearch,
  chosenPlanStillUseful,
  parseChosenPlan,
  parseStoredChosenPlan,
  serializeStoredChosenPlan,
  type ChosenPlan,
} from '@clarevo/core';
import { Platform } from 'react-native';

/**
 * O plano escolhido no site (jornada de compra de 27/11/2026, item 15; regras em `packages/core/src/plano-escolhido.ts`): lido do endereço
 * de Criar conta ou de Entrar, guardado só neste aparelho (na web, no localStorage; no celular, só na memória enquanto o app está aberto,
 * porque os links do site abrem a versão web) e usado uma vez, na primeira abertura da tela Assinatura. Nunca vai ao servidor. Ler ou gravar
 * pode falhar (navegação privada, armazenamento bloqueado): fica a cópia em memória, e nada quebra. Sem `periodo` no endereço, a tela abre
 * no mensal, o período marcado de sempre (`PLAN_PERIOD_DEFAULT`).
 * Revisão independente da D-131: a escolha é guardada ao abrir a página, mesmo sem ninguém criar conta, então vale só por 24 horas
 * (`CHOSEN_PLAN_MAX_AGE_MS`, com o instante guardado junto) e sai do aparelho ao ser lida depois disso, ao sair da conta e ao entrar numa
 * conta que já não escolhe plano (`forgetChosenPlanUnlessUseful`, chamada quando o acesso chega).
 */
let memory: { choice: ChosenPlan; savedAt: number } | null = null;

function storage(): Storage | null {
  if (Platform.OS !== 'web') return null;
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

function save(choice: ChosenPlan): void {
  const savedAt = Date.now();
  memory = { choice, savedAt };
  try {
    storage()?.setItem(CHOSEN_PLAN_STORAGE_KEY, serializeStoredChosenPlan(choice, savedAt));
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

/** A escolha guardada há menos de 24 horas, sem apagar; a velha, a do formato de antes (sem o instante) e a ilegível saem do aparelho. */
export function peekChosenPlan(): ChosenPlan | null {
  const now = Date.now();
  if (memory) {
    if (memory.savedAt <= now && now - memory.savedAt < CHOSEN_PLAN_MAX_AGE_MS) return memory.choice;
    clearChosenPlan();
    return null;
  }
  try {
    const raw = storage()?.getItem(CHOSEN_PLAN_STORAGE_KEY) ?? null;
    if (raw === null) return null;
    const stored = parseStoredChosenPlan(raw, now);
    if (!stored) {
      clearChosenPlan();
      return null;
    }
    memory = { choice: stored, savedAt: Number(raw.slice(raw.lastIndexOf('@') + 1)) };
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

/**
 * Quando o acesso da conta chega (ao entrar e ao abrir o app): se a conta já não escolhe plano (assinatura própria, Plano Família de outra
 * pessoa, benefício ou cortesia, `chosenPlanStillUseful`), a escolha sai do aparelho sem ser usada, sem esperar a tela Assinatura.
 */
export function forgetChosenPlanUnlessUseful(status: string): void {
  if (!chosenPlanStillUseful(status)) clearChosenPlan();
}
