import { formatBRL, type Cents } from '@clarevo/core';
import { useSyncExternalStore } from 'react';

/**
 * Ocultar valores (docs/08 §5 item 8): com valores ocultos, os valores em reais aparecem como "R$ ••••" e o leitor de
 * tela diz "valor oculto". O estado vale para a sessão do app: começa pela preferência "Ocultar valores ao abrir"
 * (guardada só neste aparelho, lib/device-prefs.ts) e muda pelo olho do cabeçalho das abas ou pelo interruptor em Conta.
 */
export const HIDDEN_MONEY = 'R$ ••••';
export const HIDDEN_MONEY_A11Y = 'valor oculto';

/** Textos de Conta e da tela de desbloqueio (A2). */
export const PRIVACY_TEXT = {
  section: 'Privacidade neste aparelho',
  hideToggle: 'Ocultar valores ao abrir',
  hideCaption: 'Ao abrir o app, os valores aparecem como R$ ••••. Vale só para este aparelho.',
  showNow: 'Mostrar valores',
  hideNow: 'Ocultar valores',
  lockToggle: 'Pedir biometria ao abrir',
  lockCaption: 'Ao abrir o app, o aparelho pede a biometria ou, se ela falhar, a senha do aparelho. Sair da conta nunca depende dela.',
  lockConfirmPrompt: 'Confirme para pedir biometria ao abrir',
  lockConfirmFailed: 'Não foi possível confirmar. A biometria continua desligada.',
  lockTitle: 'Desbloquear o Clarevo',
  lockBody: 'Use a biometria ou a senha do aparelho para ver seus dados.',
  unlock: 'Desbloquear',
  unlockFailed: 'Não foi possível confirmar agora. Tente de novo.',
  signOut: 'Sair da conta',
  signOutCaption: 'Sair encerra a sessão neste aparelho. Seus registros continuam guardados.',
} as const;

let hidden = false;
const listeners = new Set<() => void>();

export function setValuesHidden(value: boolean) {
  if (hidden === value) return;
  hidden = value;
  listeners.forEach((l) => l());
}

export function valuesHidden() {
  return hidden;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useValuesHidden(): boolean {
  return useSyncExternalStore(subscribe, valuesHidden, valuesHidden);
}

/** Valor para mostrar: "R$ 1.234,56" ou "R$ ••••". */
export function moneyText(cents: Cents, isHidden: boolean): string {
  return isHidden ? HIDDEN_MONEY : formatBRL(cents);
}

/** Valor para o leitor de tela: "R$ 1.234,56" ou "valor oculto". */
export function moneyA11y(cents: Cents, isHidden: boolean): string {
  return isHidden ? HIDDEN_MONEY_A11Y : formatBRL(cents);
}

/** Valores em reais dentro de uma frase já formatada ("−R$ 1.234,56", "R$ 30,00"). */
const MONEY_IN_TEXT = /[\u2212-]?R\$\s?\d{1,3}(?:\.\d{3})*,\d{2}/g;

/** Frase mostrada com os valores trocados por "R$ ••••" (para telas que montam o texto com formatBRL). */
export function maskMoneyText(text: string, isHidden: boolean): string {
  return isHidden ? text.replace(MONEY_IN_TEXT, HIDDEN_MONEY) : text;
}

/** Nome acessível com os valores trocados por "valor oculto". */
export function maskMoneyLabel(text: string, isHidden: boolean): string {
  return isHidden ? text.replace(MONEY_IN_TEXT, HIDDEN_MONEY_A11Y) : text;
}
