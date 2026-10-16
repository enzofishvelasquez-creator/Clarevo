/**
 * Versão web de `invite-share.ts` (D-055): o compartilhamento do navegador, quando existe, e a área de transferência. Nada é
 * guardado e nada vai ao servidor.
 */
import { INVITE_BASE_URL } from '@clarevo/core';

import type { ShareResult } from './invite-share';

export type { ShareResult };

export const CAN_COPY = true;

/** Na web, o link aponta para o mesmo endereço em que o app está aberto (o convite abre onde foi gerado). */
export function inviteBaseUrl(): string {
  const origin = (globalThis as { location?: { origin?: unknown } }).location?.origin;
  return typeof origin === 'string' && /^https?:\/\//.test(origin) ? origin : INVITE_BASE_URL;
}

export async function shareInvite(message: string, title: string): Promise<ShareResult> {
  try {
    const nav = globalThis.navigator as Navigator | undefined;
    if (!nav || typeof nav.share !== 'function') return 'falhou';
    await nav.share({ title, text: message });
    return 'ok';
  } catch (e) {
    return (e as { name?: string } | null)?.name === 'AbortError' ? 'cancelado' : 'falhou';
  }
}

export async function copyInvite(text: string): Promise<boolean> {
  try {
    const nav = globalThis.navigator as Navigator | undefined;
    if (nav?.clipboard?.writeText) {
      await nav.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Segue para a alternativa abaixo.
  }
  try {
    const doc = globalThis.document;
    const area = doc.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    doc.body.appendChild(area);
    area.select();
    const ok = doc.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
