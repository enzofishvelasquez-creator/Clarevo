import { useSyncExternalStore } from 'react';

/**
 * Se a tela de trava por biometria (DeviceFeatures) está na frente. O aviso de aceite dos termos (A1) espera o app destravar: assim ninguém
 * aceita os termos por outra pessoa sem desbloquear o aparelho.
 */
let locked = false;
const listeners = new Set<() => void>();

export const deviceLock = {
  set(value: boolean) {
    if (locked === value) return;
    locked = value;
    for (const l of listeners) l();
  },
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  get: () => locked,
};

export function useDeviceLocked(): boolean {
  return useSyncExternalStore(deviceLock.subscribe, deviceLock.get, deviceLock.get);
}
