import { WHATSAPP_CODE_MINUTES } from '../whatsapp/respostas';
import type { ChatScreenText } from '../whatsapp/app';

/**
 * Usuário do bot da Clarevo no Telegram (D-080), sem o @. Null: a tela só explica. O bot é criado pela pessoa responsável pela empresa,
 * no próprio Telegram (docs/35_TELEGRAM.md); depois, a equipe põe o usuário aqui e publica o app.
 */
export const TELEGRAM_BOT: string | null = null;
/**
 * Piloto fechado (D-080): o card em Conta fica escondido e a tela abre só pelo link (app.clarevo.app.br/conta/telegram). true quando
 * abrir a todos, com a política e a resposta do advogado.
 */
export const TELEGRAM_IN_ACCOUNT = false;

/** Usuário de bot do Telegram: 5 a 32 letras, algarismos ou _, terminando em "bot". */
export function isTelegramBotName(name: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(name) && /bot$/i.test(name);
}

/**
 * Link que abre a conversa com o bot da Clarevo; ao tocar em Iniciar, o Telegram manda "/start <código>" e a conta liga sozinha
 * (t.me, o link oficial do Telegram). O código tem só letras maiúsculas e algarismos, o que o Telegram aceita nesse link.
 */
export function telegramStartLink(bot: string, code: string): string {
  return `https://t.me/${bot}?start=${encodeURIComponent(code)}`;
}

/** Textos da tela Conta > Telegram. */
export const TELEGRAM_TEXT = {
  cardTitle: 'Telegram',
  cardBody: 'Anote gastos e recebimentos mandando uma mensagem para a Clarevo no Telegram.',
  cardOpen: 'Anotar pelo Telegram',
  cardLinked: (space: string) => `Ligado ao espaço ${space}.`,
  title: 'Telegram',
  intro:
    'Mande uma mensagem como "mercado 52,30" para a Clarevo no Telegram e o gasto entra no app na hora. Para um recebimento: "recebi 1500 salário".',
  textOnly: 'Por enquanto, só mensagens escritas. O microfone do teclado do celular transforma a sua fala em texto antes de enviar.',
  spaceLabel: 'Anotar no espaço',
  generate: 'Gerar código',
  generating: 'Gerando…',
  codeTitle: 'Seu código',
  codeHelp: `Toque em Abrir o Telegram e depois em Iniciar: o código chega à Clarevo sozinho. Ele vale por ${WHATSAPP_CODE_MINUTES} minutos e serve uma vez.`,
  openChat: 'Abrir o Telegram',
  targetLabel: (bot: string) => `Se o Telegram não abrir, procure @${bot} e mande "Ativar" e o código.`,
  codeLost: 'O código já foi mostrado. Gere outro.',
  checkLinked: 'Já toquei em Iniciar',
  linkedTitle: 'Telegram ligado',
  linkedBody: (space: string) => `As mensagens desta conta do Telegram anotam no espaço ${space}.`,
  linkedGone: 'Ligado a um espaço em que você não anota mais. Gere um código novo para escolher outro.',
  changeSpace: 'Trocar o espaço ou a conta',
  examplesTitle: 'O que dá para mandar',
  examples: [
    'mercado 52,30',
    'farmácia 38 ontem',
    'luz 180 12/10',
    'recebi 1500 salário',
    'DESFAZER: apaga a última anotação feita por lá',
    'DESLIGAR: desliga o Telegram',
  ],
  unlink: 'Desligar o Telegram',
  unlinkTitle: 'Desligar o Telegram?',
  unlinkBody: 'As mensagens desta conta do Telegram deixam de anotar. O que já foi anotado continua no app.',
  unlinkConfirm: 'Desligar',
  unlinked: 'Telegram desligado.',
  privacyTitle: 'Privacidade',
  privacy:
    'As mensagens passam pelos servidores do Telegram. A Clarevo guarda só o que você anotou, como qualquer registro do app. O texto das mensagens, o seu nome e o seu usuário no Telegram não ficam guardados: da conta, só um resumo feito com uma chave secreta, para reconhecer quem escreve.',
  error: 'Não deu para concluir agora. Tente de novo.',
  demo: 'Na demonstração, o Telegram não é ligado.',
  notReady: 'A Clarevo no Telegram ainda está sendo preparada.',
  openFailed: 'Não deu para abrir o Telegram neste aparelho. Procure a Clarevo no Telegram e mande "Ativar" e o código.',
  linkedNow: 'Pronto, o Telegram está ligado.',
  notYet: 'O código ainda não chegou. Confira se tocou em Iniciar no Telegram e tente de novo em alguns segundos.',
} as const satisfies ChatScreenText;
