import { formatBRL, type Cents } from '@clarevo/core';
import { useSyncExternalStore } from 'react';

import { yearA11y } from './years';

/**
 * Ocultar valores (docs/08 §5 item 8): com valores ocultos, os valores em reais aparecem como "R$ ••••" e o leitor de
 * tela diz "valor oculto". O estado vale para a sessão do app: começa pela preferência "Ocultar valores ao abrir"
 * (guardada só neste aparelho, lib/device-prefs.ts) e muda pelo olho do cabeçalho das abas ou pelo interruptor em Conta.
 *
 * O que é ocultado (todo valor em reais de dados guardados, no texto e no nome acessível): totais do Resumo, linhas de
 * registros e de contas a pagar, gastos fixos e parcelamentos, composição, renda comprometida, metas e reserva, plano de
 * guardar, revisão dos últimos meses, avisos de resultado (FlashBanner), títulos e textos de diálogos e o anúncio do iOS
 * (announceOnIOS). Como usar: `Money` e `FitMoney` (components/ui.tsx) para um valor; `MoneyTxt` (components/money-text.tsx)
 * para uma frase com valores, pronta do core ou montada com formatBRL; moneyText, moneyA11y, maskMoneyText, maskMoneyLabel
 * e spokenText daqui para textos que não são Txt (rótulo de botão, nome acessível, dica de campo com `moneyHint`).
 *
 * O que continua à vista, por decisão: o que a pessoa digita ou edita (campos de texto, inclusive o que vem preenchido
 * com um valor guardado ao abrir um formulário de edição), calculadoras e simulador (entrada e resultado são o que ela
 * digitou), a soma de "Somar valores", os exemplos de Aprender (números de exemplo, não dela), limites fixos ("até
 * R$ 9.999.999,99") e percentuais. Ver packages/core/test/privacy-app.test.ts.
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

/**
 * Nome acessível de um texto que pode ter valores em reais e anos como "2026/2027": os valores viram "valor oculto" (com
 * valores ocultos) e o ano é lido "2026 a 2027". undefined quando o texto já se lê bem como está (o leitor de tela lê o
 * próprio texto). Use no lugar de yearA11yLabel quando o texto mostrado também passa por maskMoneyText.
 */
export function spokenText(text: string, isHidden: boolean): string | undefined {
  const spoken = yearA11y(maskMoneyLabel(text, isHidden));
  return spoken === text ? undefined : spoken;
}

/**
 * Nome acessível com os valores trocados por "valor oculto". Vários valores seguidos viram um só: "R$ 3.500,00 de
 * R$ 22.500,00" é lido "valor oculto", não "valor oculto de valor oculto".
 */
export function maskMoneyLabel(text: string, isHidden: boolean): string {
  return isHidden ? text.replace(MONEY_IN_TEXT, HIDDEN_MONEY_A11Y).replace(/valor oculto(?: (?:de|a|e) valor oculto)+/g, HIDDEN_MONEY_A11Y) : text;
}
