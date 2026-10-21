import type { WidgetSyncPlan } from '@clarevo/core';

/**
 * Ponte com o widget nativo (D-063 item 3, Ciclo AA): quem grava o que o núcleo decidiu (`planWidgetSync`) no armazenamento compartilhado
 * com o widget. Esta é a versão sem widget, usada na web, no Expo Go e em todo build sem `CLAREVO_WIDGET=1`: não há módulo nativo, então
 * nada é lido, gravado nem pedido. `widget-bridge.ios.ts` e `widget-bridge.android.ts` têm as mesmas funções com o widget de verdade.
 */
export type WidgetWrite = Extract<WidgetSyncPlan, { write: true }>;

/** Existe um widget nativo neste aparelho (módulo carregado)? Falso: o app nem lê as contas para o widget. */
export function widgetAvailable(): boolean {
  return false;
}

export async function writeWidget(_plan: WidgetWrite, _now: Date): Promise<void> {}
