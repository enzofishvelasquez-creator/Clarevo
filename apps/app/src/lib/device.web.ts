/**
 * Versão web de `device.ts`: lembretes e bloqueio por biometria existem só no app para celular (D-025(5)). Mesmas
 * funções, sem efeito, para os pacotes nativos ficarem fora do site.
 */
import type { NotificationPermission, ScheduledReminder, UnlockResult } from './device';

export type { NotificationPermission, ScheduledReminder, UnlockResult };

export const DEVICE_FEATURES = false;

export async function getNotificationPermission(): Promise<NotificationPermission> {
  return { granted: false, canAsk: false };
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  return { granted: false, canAsk: false };
}

export async function syncScheduledReminders(_items: readonly ScheduledReminder[]): Promise<void> {}

export async function cancelAllReminders(): Promise<void> {}

export function listenToReminders(_onOpen: () => void): () => void {
  return () => {};
}

export function openDeviceSettings() {}

export async function biometricsAvailable(): Promise<boolean> {
  return false;
}

export async function authenticate(_promptMessage: string): Promise<UnlockResult> {
  return 'indisponivel';
}
