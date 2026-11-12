import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

/**
 * Instalar a versão web no computador (pedido do Enzo em 12/11/2026, D-098): o Chrome e o Edge avisam, pelo evento `beforeinstallprompt`,
 * que o app pode ser instalado (janela própria e ícone na barra de tarefas, com o manifesto de `public/manifest.webmanifest`). O app guarda
 * o aviso e mostra "Instalar no computador" na barra lateral; tocar abre a pergunta do próprio navegador. Instalado (ou aberto já como
 * app instalado), o item some. Nada vai para o servidor.
 */
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

let pending: InstallEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Só no computador (a barra lateral tem o item); no celular, o navegador mostra a sugestão dele, como antes.
    if (window.innerWidth < 1024) return;
    e.preventDefault();
    pending = e as InstallEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    pending = null;
    notify();
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** Se o navegador oferece instalar agora. */
export function useCanInstall(): boolean {
  return useSyncExternalStore(subscribe, () => pending !== null, () => false);
}

/** Abre a pergunta do navegador. Depois de respondida, o aviso não serve mais (o navegador manda outro, se for o caso). */
export async function promptInstall(): Promise<void> {
  const e = pending;
  if (!e) return;
  pending = null;
  notify();
  try {
    await e.prompt();
    await e.userChoice;
  } catch {
    // O navegador recusou abrir a pergunta (já respondida ou fora do gesto): nada a fazer.
  }
}
