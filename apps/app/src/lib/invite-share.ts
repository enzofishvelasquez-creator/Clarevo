import { INVITE_BASE_URL } from '@clarevo/core';
import { Share } from 'react-native';

import { openingExternalScreen } from '@/lib/external-screen';

/**
 * Entrega do link do convite (D-055) no celular: a folha de compartilhamento do aparelho (que já traz "Copiar"). O link não é
 * guardado em lugar nenhum pelo app. A versão web (`invite-share.web.ts`) usa o compartilhamento do navegador e a área de
 * transferência.
 */
export const CAN_COPY = false;

/** No celular a folha de compartilhamento do aparelho sempre existe. */
export function canShareInvite(): boolean {
  return true;
}

/** Endereço do app que o link do convite usa: no celular, o do site publicado. */
export function inviteBaseUrl(): string {
  return INVITE_BASE_URL;
}

export type ShareResult = 'ok' | 'cancelado' | 'falhou';

export async function shareInvite(message: string, title: string): Promise<ShareResult> {
  try {
    // A folha de compartilhar é uma tela de fora. No Android, a promessa termina assim que ela abre: a marca dura até a volta ao app
    // (lib/external-screen.ts), para a biometria não travar o app na volta do WhatsApp ou do e-mail.
    openingExternalScreen();
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
