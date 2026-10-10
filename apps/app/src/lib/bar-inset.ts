import { useSyncExternalStore } from 'react';

/**
 * Altura da barra inferior das telas de consulta (D-039), medida pela própria barra. A barra fica sobreposta ao fim da tela
 * (posição absoluta), para não encolher a pilha de telas quando surge: durante a animação de abertura de uma tela de consulta, a
 * barra das abas e a barra da consulta ocupam o mesmo lugar, sem se empilhar nem dar salto. `Screen` soma esta altura ao
 * respiro de baixo da rolagem, e nenhum conteúdo fica atrás da barra. 0 quando não há barra.
 */
let height = 0;
const listeners = new Set<() => void>();

export function setBrowseBarInset(next: number): void {
  const rounded = Math.max(0, Math.round(next));
  if (rounded === height) return;
  height = rounded;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export function useBrowseBarInset(): number {
  return useSyncExternalStore(subscribe, () => height, () => 0);
}
