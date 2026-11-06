/**
 * Versão web de `device.ts`: lembretes (de vencimento e do dia a dia) e bloqueio por biometria existem só no app para celular
 * (D-025(5), D-087). Mesmas
 * funções, sem efeito, para os pacotes nativos ficarem fora do site.
 */
import type { NotificationPermission, ReminderChannel, ScheduledReminder, UnlockResult } from './device';

export type { NotificationPermission, ReminderChannel, ScheduledReminder, UnlockResult };

export const DEVICE_FEATURES = false;

export async function getNotificationPermission(): Promise<NotificationPermission> {
  return { granted: false, canAsk: false };
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  return { granted: false, canAsk: false };
}

export async function syncScheduledReminders(_items: readonly ScheduledReminder[]): Promise<void> {}

export async function cancelAllReminders(): Promise<void> {}

export function listenToReminders(_onOpen: (route: string) => void): () => void {
  return () => {};
}

export function openDeviceSettings() {}

export async function biometricsAvailable(): Promise<boolean> {
  return false;
}

export async function authenticate(_promptMessage: string): Promise<UnlockResult> {
  return 'indisponivel';
}
