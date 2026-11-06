import { isReminderId, REMINDER_ROUTE, REMINDER_TEXT, ROUTINE_REMINDER_TEXT } from '@clarevo/core';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';

/**
 * Recursos do aparelho do Ciclo A2 (lembretes e bloqueio por biometria), só no celular. A versão web
 * (`device.web.ts`) tem as mesmas funções sem efeito, para os pacotes nativos ficarem fora do site.
 *
 * APIs conferidas nas definições de tipo instaladas: expo-notifications 57.0.22 e expo-local-authentication 57.0.3.
 */
export const DEVICE_FEATURES = true;

/**
 * Canais do Android (8 ou mais): precisam existir antes de pedir a permissão e de agendar. Um para os lembretes de vencimento
 * (D-025) e outro para os do dia a dia (D-087), para a pessoa poder silenciar um sem o outro nas configurações do aparelho.
 */
export type ReminderChannel = 'contas' | 'rotina';
const CHANNEL_ID: Readonly<Record<ReminderChannel, string>> = { contas: 'lembretes', rotina: 'lembretes-dia-a-dia' };
const CHANNEL_NAME: Readonly<Record<ReminderChannel, string>> = { contas: REMINDER_TEXT.channelName, rotina: ROUTINE_REMINDER_TEXT.channelName };

export interface NotificationPermission {
  granted: boolean;
  /** O sistema ainda mostra o pedido. Falso depois de uma recusa definitiva: só nas configurações do aparelho. */
  canAsk: boolean;
}

function toPermission(s: Notifications.NotificationPermissionsStatus): NotificationPermission {
  const provisional = s.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  return { granted: s.granted || provisional, canAsk: s.canAskAgain };
}

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  for (const channel of ['contas', 'rotina'] as const) {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID[channel], {
      name: CHANNEL_NAME[channel],
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}

export async function getNotificationPermission(): Promise<NotificationPermission> {
  try {
    return toPermission(await Notifications.getPermissionsAsync());
  } catch {
    return { granted: false, canAsk: false };
  }
}

/** Pedido do sistema: só depois do toque em "Ativar lembretes" ou no interruptor. */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  try {
    await ensureChannel();
    return toPermission(
      await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } }),
    );
  } catch {
    return getNotificationPermission();
  }
}

export interface ScheduledReminder {
  id: string;
  date: Date;
  title: string;
  body: string;
  /** Muda quando o aviso muda (dia, horário, contagem ou texto): avisos iguais não são agendados de novo. */
  signature: string;
  /** Endereço do app aberto pelo toque (Contas a pagar nos de vencimento; Anotar gasto, Registrar recebimento, Análises ou Resumo nos do dia a dia). */
  route: string;
  channel: ReminderChannel;
}

async function scheduledReminders() {
  return (await Notifications.getAllScheduledNotificationsAsync()).filter((n) => isReminderId(n.identifier));
}

/**
 * Deixa agendados exatamente os avisos pedidos: cancela os do Clarevo que saíram do plano e agenda os novos ou mudados
 * (o mesmo identificador substitui o anterior). Notificações de outra origem nunca são tocadas.
 */
export async function syncScheduledReminders(items: readonly ScheduledReminder[]): Promise<void> {
  const existing = await scheduledReminders();
  const wanted = new Map(items.map((i) => [i.id, i]));
  for (const n of existing) {
    const item = wanted.get(n.identifier);
    if (!item || n.content.data?.signature !== item.signature) await Notifications.cancelScheduledNotificationAsync(n.identifier);
  }
  const kept = new Set(existing.filter((n) => wanted.get(n.identifier)?.signature === n.content.data?.signature).map((n) => n.identifier));
  if (items.length > 0) await ensureChannel();
  for (const item of items) {
    if (kept.has(item.id)) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: item.id,
      content: { title: item.title, body: item.body, data: { url: item.route, signature: item.signature }, sound: 'default' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: item.date, channelId: CHANNEL_ID[item.channel] },
    });
  }
}

/** Desliga: tira todos os avisos do Clarevo deste aparelho. */
export async function cancelAllReminders(): Promise<void> {
  for (const n of await scheduledReminders()) await Notifications.cancelScheduledNotificationAsync(n.identifier);
}

/**
 * Aviso com o app aberto aparece como faixa, sem som; o toque num aviso do Clarevo abre a tela do aviso (`data.url`; Contas a pagar
 * quando o aviso é antigo e não a tem), também quando o toque abriu o app. Devolve a função que desfaz o registro.
 */
export function listenToReminders(onOpen: (route: string) => void): () => void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
  const handle = (r: Notifications.NotificationResponse | null) => {
    if (!r || r.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER || !isReminderId(r.notification.request.identifier)) return;
    Notifications.clearLastNotificationResponse();
    const url = r.notification.request.content.data?.url;
    onOpen(typeof url === 'string' && url.startsWith('/') ? url : REMINDER_ROUTE);
  };
  try {
    handle(Notifications.getLastNotificationResponse());
  } catch {
    // Sem resposta guardada.
  }
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}

/** Configurações do app no aparelho (para ligar os avisos depois de uma recusa). */
export function openDeviceSettings() {
  Linking.openSettings().catch(() => {});
}

/** Biometria cadastrada no aparelho (rosto ou digital). */
export async function biometricsAvailable(): Promise<boolean> {
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

export type UnlockResult = 'ok' | 'cancelado' | 'indisponivel' | 'falhou';

/** Pede a biometria; se ela falhar, o próprio sistema oferece a senha do aparelho (disableDeviceFallback: false). */
export async function authenticate(promptMessage: string): Promise<UnlockResult> {
  try {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancelar',
      fallbackLabel: 'Usar a senha do aparelho',
      disableDeviceFallback: false,
    });
    if (r.success) return 'ok';
    if (r.error === 'not_enrolled' || r.error === 'passcode_not_set' || r.error === 'not_available') return 'indisponivel';
    if (r.error === 'user_cancel' || r.error === 'system_cancel' || r.error === 'app_cancel') return 'cancelado';
    return 'falhou';
  } catch {
    return 'falhou';
  }
}
