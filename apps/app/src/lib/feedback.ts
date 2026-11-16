import { feedbackMailto } from '@clarevo/core';

import { APP_INFO } from '@/lib/app-info';
import { openMailto } from '@/lib/site';

/**
 * "Enviar sugestão ou problema" e "Enviar um problema" (teste com pessoas, 16/11/2026): abre o e-mail do suporte com o assunto e, abaixo
 * do espaço para a pessoa escrever, só a versão, o build, a atualização, o perfil, o sistema, o modelo do aparelho e o caminho da tela sem
 * identificadores (`feedbackMailto`, testado no núcleo). `screen` é o caminho da rota, de preferência pelos segmentos (`/orcamento/[categoria]`).
 * Devolve `false` quando o aparelho não abriu o e-mail: a tela mostra o endereço para copiar.
 */
export function openFeedbackEmail(screen: string): Promise<boolean> {
  return openMailto(feedbackMailto({ ...APP_INFO, screen }));
}
