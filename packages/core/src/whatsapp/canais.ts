/**
 * Onde a pessoa liga cada canal de mensagens (D-076, D-080, D-081). true: o card aparece em Conta para todas as pessoas, e as respostas
 * da Clarevo mandam abrir Conta. false (piloto fechado): o card fica escondido, a tela abre só pelo endereço
 * (app.clarevo.app.br/conta/whatsapp ou /conta/telegram) e as respostas apontam esse endereço. Arquivo sem dependências: as respostas e
 * as telas leem daqui.
 */
/** WhatsApp: piloto fechado enquanto a conta da Clarevo na Meta estiver restrita (docs/36_WHATSAPP_CAMINHOS.md). */
export const WHATSAPP_IN_ACCOUNT = false;
/** Telegram: aberto a todas as pessoas desde 03/11/2026 (D-081). */
export const TELEGRAM_IN_ACCOUNT = true;
