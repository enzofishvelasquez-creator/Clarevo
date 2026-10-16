import { INVITE_BASE_URL } from '@clarevo/core';
import { Share } from 'react-native';

/**
 * Entrega do link do convite (D-055) no celular: a folha de compartilhamento do aparelho (que já traz "Copiar"). O link não é
 * guardado em lugar nenhum pelo app. A versão web (`invite-share.web.ts`) usa o compartilhamento do navegador e a área de
 * transferência.
 */
export const CAN_COPY = false;

/** Endereço do app que o link do convite usa: no celular, o do site publicado. */
export function inviteBaseUrl(): string {
  return INVITE_BASE_URL;
}

export type ShareResult = 'ok' | 'cancelado' | 'falhou';

export async function shareInvite(message: string, title: string): Promise<ShareResult> {
  try {
    const r = await Share.share({ message, title }, { dialogTitle: title });
    return r.action === Share.dismissedAction ? 'cancelado' : 'ok';
  } catch {
    return 'falhou';
  }
}

/** No celular a cópia sai pela folha de compartilhamento. */
export async function copyInvite(_text: string): Promise<boolean> {
  return false;
}
