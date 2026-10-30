import { formatWhatsAppCode } from './mensagem';
import { WHATSAPP_CODE_MINUTES } from './respostas';

/**
 * Número da Clarevo no WhatsApp (D-076): só algarismos, com o país (ex.: '5521912345678'). Enquanto for null, o app não mostra o
 * WhatsApp em Conta (a conta na Meta e o número ainda estão sendo preparados, docs/05, passo 12j).
 */
export const WHATSAPP_NUMBER: string | null = null;

/** Estado do WhatsApp da própria pessoa (my_whatsapp). O número nunca volta ao app: o banco não o guarda. */
export interface WhatsAppLinkState {
  linked: boolean;
  /** Espaço em que as mensagens anotam. */
  contextId: string | null;
  linkedAt: string | null;
  /** Código ainda válido: o espaço dele e até quando vale. */
  codeContextId: string | null;
  codeExpiresAt: string | null;
}

export const WHATSAPP_UNLINKED: WhatsAppLinkState = {
  linked: false,
  contextId: null,
  linkedAt: null,
  codeContextId: null,
  codeExpiresAt: null,
};

/** Resultado de create_whatsapp_code. code nulo: repetição da mesma chave (o código só é mostrado uma vez; validade nula se já foi usado). */
export interface WhatsAppCode {
  code: string | null;
  contextId: string;
  expiresAt: string | null;
}

/** Texto que o app preenche na conversa: "Ativar ABCD-EFGH". */
export function whatsappActivationText(code: string): string {
  return `Ativar ${formatWhatsAppCode(code)}`;
}

/** Link que abre a conversa com a Clarevo já com o texto de ativar (wa.me, o link oficial do WhatsApp). */
export function whatsappChatLink(number: string, code: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(whatsappActivationText(code))}`;
}

/** '5521912345678' → '+55 21 91234-5678'; outro país ou tamanho: '+' e os algarismos. */
export function formatWhatsAppNumber(number: string): string {
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(number);
  return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : `+${number}`;
}

/** Textos da tela Conta > WhatsApp. */
export const WHATSAPP_TEXT = {
  cardTitle: 'WhatsApp',
  cardBody: 'Anote gastos e recebimentos mandando uma mensagem para a Clarevo.',
  cardOpen: 'Anotar pelo WhatsApp',
  cardLinked: (space: string) => `Ligado ao espaço ${space}.`,
  title: 'WhatsApp',
  intro:
    'Mande uma mensagem como "mercado 52,30" para a Clarevo e o gasto entra no app na hora. Para um recebimento: "recebi 1500 salário".',
  textOnly: 'Por enquanto, só mensagens escritas. O microfone do teclado do celular transforma a sua fala em texto antes de enviar.',
  spaceLabel: 'Anotar no espaço',
  generate: 'Gerar código',
  generating: 'Gerando…',
  codeTitle: 'Seu código',
  codeHelp: `Mande "Ativar" e o código para a Clarevo no WhatsApp, do número que você vai usar. O código vale por ${WHATSAPP_CODE_MINUTES} minutos e serve uma vez.`,
  openWhatsApp: 'Abrir o WhatsApp com a mensagem pronta',
  numberLabel: (n: string) => `Número da Clarevo: ${formatWhatsAppNumber(n)}`,
  codeLost: 'O código já foi mostrado. Gere outro.',
  checkLinked: 'Já mandei a mensagem',
  linkedTitle: 'WhatsApp ligado',
  linkedBody: (space: string) => `As mensagens deste número anotam no espaço ${space}.`,
  linkedGone: 'Ligado a um espaço em que você não anota mais. Gere um código novo para escolher outro.',
  changeSpace: 'Trocar o espaço ou o número',
  examplesTitle: 'O que dá para mandar',
  examples: [
    'mercado 52,30',
    'farmácia 38 ontem',
    'luz 180 12/10',
    'recebi 1500 salário',
    'DESFAZER: apaga a última anotação feita por lá',
    'DESLIGAR: desliga o número',
  ],
  unlink: 'Desligar o WhatsApp',
  unlinkTitle: 'Desligar o WhatsApp?',
  unlinkBody: 'As mensagens deste número deixam de anotar. O que já foi anotado continua no app.',
  unlinkConfirm: 'Desligar',
  unlinked: 'WhatsApp desligado.',
  privacyTitle: 'Privacidade',
  privacy:
    'As mensagens passam pelos servidores da Meta, empresa dona do WhatsApp. A Clarevo guarda só o que você anotou, como qualquer registro do app. O texto das mensagens e o seu número não ficam guardados: do número, só um resumo (SHA-256), para reconhecer quem escreve.',
  error: 'Não deu para concluir agora. Tente de novo.',
  demo: 'Na demonstração, o WhatsApp não é ligado.',
  notReady: 'O número da Clarevo no WhatsApp ainda está sendo preparado.',
  openFailed: 'Não deu para abrir o WhatsApp neste aparelho. Mande a mensagem com o código para o número acima.',
  linkedNow: 'Pronto, o WhatsApp está ligado.',
  notYet: 'Ainda não chegou a mensagem com o código. Confira se mandou do número que vai usar e tente de novo em alguns segundos.',
} as const;
