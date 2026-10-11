import { DEFAULT_REMINDER_HOUR, isReminderHour, type ReminderHour } from '@clarevo/core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

/**
 * Preferências do Ciclo A2 guardadas só neste aparelho, por pessoa (chave com o identificador): lembretes e horário,
 * oferta de lembretes já mostrada, ocultar valores ao abrir e biometria ao abrir. Nada vai para o servidor.
 * Ler ou gravar pode falhar (navegação privada, armazenamento cheio ou bloqueado): vale o padrão (tudo desligado) e a
 * cópia em memória enquanto o app estiver aberto. Na demonstração, fica só em memória (o identificador se repete depois
 * de recarregar a página; uma conta nova nunca herda a escolha de outra).
 */
export interface DevicePrefs {
  reminders: boolean;
  reminderHour: ReminderHour;
  /** A oferta "Quer receber um aviso no dia anterior ao vencimento?" já apareceu (uma vez por pessoa e aparelho). */
  reminderOffered: boolean;
  hideOnOpen: boolean;
  biometricLock: boolean;
  /**
   * Última forma de pagamento escolhida em Anotar gasto ("dinheiro" ou o identificador de um cartão), só para abrir o formulário
   * já nela. Não é dado financeiro: nada vai para o servidor, e uma escolha que já não existe (cartão arquivado) é ignorada.
   */
  lastPayment: string | null;
  /**
   * Última conta de origem escolhida (D-043: "Saiu de", "Entrou em", "Foi para"), só para abrir os formulários já nela. Não é dado
   * financeiro: nada vai para o servidor, e uma escolha que já não existe ou foi arquivada é ignorada (chooseAccountId).
   */
  lastAccount: string | null;
  /**
   * "Agora não" no aviso de assinaturas (D-046): o dia (AAAA-MM-DD) até o qual o aviso fica escondido, hoje + 30 dias. Só neste
   * aparelho; não é dado financeiro e nada vai para o servidor. Vazio ou inválido: o aviso não está escondido.
   */
  subscriptionSnoozedUntil: string | null;
}

export const DEFAULT_PREFS: DevicePrefs = {
  reminders: false,
  reminderHour: DEFAULT_REMINDER_HOUR,
  reminderOffered: false,
  hideOnOpen: false,
  biometricLock: false,
  lastPayment: null,
  lastAccount: null,
  subscriptionSnoozedUntil: null,
};

const PREFIX = 'clarevo.aparelho.v1.';

/** undefined: ainda lendo do aparelho. */
const memory = new Map<string, DevicePrefs>();
const loading = new Map<string, Promise<DevicePrefs>>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function parse(raw: string | null | undefined): DevicePrefs {
  if (!raw) return DEFAULT_PREFS;
  try {
    const v = JSON.parse(raw) as Partial<Record<keyof DevicePrefs, unknown>>;
    return {
      reminders: v.reminders === true,
      reminderHour: isReminderHour(v.reminderHour) ? v.reminderHour : DEFAULT_REMINDER_HOUR,
      reminderOffered: v.reminderOffered === true,
      hideOnOpen: v.hideOnOpen === true,
      biometricLock: v.biometricLock === true,
      lastPayment: typeof v.lastPayment === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v.lastPayment) ? v.lastPayment : null,
      lastAccount: typeof v.lastAccount === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v.lastAccount) ? v.lastAccount : null,
      subscriptionSnoozedUntil:
        typeof v.subscriptionSnoozedUntil === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.subscriptionSnoozedUntil) ? v.subscriptionSnoozedUntil : null,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function webStorage(): Storage | null {
  if (Platform.OS !== 'web') return null;
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Lê uma vez por pessoa; as leituras seguintes vêm da memória. */
export function loadPrefs(userId: string, persist: boolean): Promise<DevicePrefs> {
  const cached = memory.get(userId);
  if (cached) return Promise.resolve(cached);
  const pending = loading.get(userId);
  if (pending) return pending;
  const key = PREFIX + userId;
  const p = (async () => {
    let prefs = DEFAULT_PREFS;
    if (persist) {
      try {
        prefs = parse(Platform.OS === 'web' ? webStorage()?.getItem(key) : await AsyncStorage.getItem(key));
      } catch {
        prefs = DEFAULT_PREFS;
      }
    }
    // Uma escolha feita durante a leitura prevalece.
    const now = memory.get(userId) ?? prefs;
    memory.set(userId, now);
    loading.delete(userId);
    emit();
    return now;
  })();
  loading.set(userId, p);
  return p;
}

export function getPrefs(userId: string): DevicePrefs | undefined {
  return memory.get(userId);
}

export function updatePrefs(userId: string, patch: Partial<DevicePrefs>, persist: boolean): DevicePrefs {
  const next = { ...(memory.get(userId) ?? DEFAULT_PREFS), ...patch };
  memory.set(userId, next);
  emit();
  if (persist) {
    const key = PREFIX + userId;
    const raw = JSON.stringify(next);
    try {
      if (Platform.OS === 'web') webStorage()?.setItem(key, raw);
      else AsyncStorage.setItem(key, raw).catch(() => {});
    } catch {
      // Sem armazenamento: vale enquanto o app estiver aberto.
    }
  }
  return next;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Preferências da pessoa; undefined enquanto a leitura do aparelho não terminou. */
export function useDevicePrefs(userId: string | undefined): DevicePrefs | undefined {
  return useSyncExternalStore(
    subscribe,
    () => (userId ? memory.get(userId) : undefined),
    () => (userId ? memory.get(userId) : undefined),
  );
}
