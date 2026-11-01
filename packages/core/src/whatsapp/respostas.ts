import { addDays, formatListDate, type IsoDate } from '../dates';
import { SUPPORT_EMAIL } from '../legal';
import { MAX_RECORD_CENTS, formatBRL, type Cents } from '../money';
import { NO_CATEGORY_LABEL, type RecordKind } from '../records';
import type { WhatsAppParseError } from './mensagem';

/** Validade do código de ligar, em minutos (a mesma do banco). */
export const WHATSAPP_CODE_MINUTES = 15;

/** Espaço do registro, como o banco devolve: Pessoal ou o nome da Família. */
export interface WhatsAppSpace {
  kind: 'pessoal' | 'familia';
  name: string;
}

/** Registro anotado ou desfeito, como o banco devolve (snake_case, igual ao JSON das funções). */
export interface WhatsAppRecordInfo {
  kind: RecordKind;
  amount_cents: Cents;
  occurred_on: IsoDate;
  description: string;
  category: string | null;
  account_name: string;
}

/**
 * Resultado das funções whatsapp_* do banco. Nada é respondido em "repetida" (a Meta mandou de novo a mesma mensagem) nem em "silencio"
 * (enxurrada de mensagens, depois do primeiro aviso). "registrada": mensagem sem dados (ajuda, mídia, não entendi), respondida pelo
 * servidor. `today`: o dia da pessoa no instante da mensagem, no fuso dela (para "hoje" e "ontem" na resposta).
 */
export type WhatsAppOutcome =
  | { result: 'ligado'; space: WhatsAppSpace; today?: IsoDate }
  | { result: 'anotado'; space: WhatsAppSpace; record: WhatsAppRecordInfo; today?: IsoDate }
  | { result: 'desfeito'; space: WhatsAppSpace; record: WhatsAppRecordInfo; today?: IsoDate }
  | { result: 'sem_permissao' | 'sem_conta'; space: WhatsAppSpace; today?: IsoDate }
  | {
      result:
        | 'nada_para_desfazer'
        | 'desligado'
        | 'nao_ligado'
        | 'codigo_invalido'
        | 'muitas_tentativas'
        | 'muitas_mensagens'
        | 'data_futura'
        | 'valor_invalido'
        | 'valor_acima_do_limite'
        | 'descricao_invalida'
        | 'repetida'
        | 'silencio'
        | 'registrada'
        | 'erro';
      today?: IsoDate;
    };

/** "espaço Pessoal" ou "espaço Família Souza". */
function spaceLabel(space: WhatsAppSpace): string {
  return space.kind === 'pessoal' ? 'espaço Pessoal' : `espaço ${space.name}`;
}

/** "hoje, 30/10", "ontem, 29/10" ou "12/10" (com o ano quando é de outro ano). */
function dayLabel(date: IsoDate, today: IsoDate): string {
  const shown = formatListDate(date, today);
  if (date === today) return `hoje, ${shown}`;
  if (date === addDays(today, -1)) return `ontem, ${shown}`;
  return shown;
}

function recordLines(r: WhatsAppRecordInfo, today: IsoDate): string {
  const what = r.kind === 'despesa' ? 'Gasto' : 'Recebimento';
  const account = r.kind === 'despesa' ? 'Saiu de' : 'Entrou em';
  return [
    `${what}: ${r.description}, ${formatBRL(r.amount_cents)}`,
    `Categoria: ${r.category ?? NO_CATEGORY_LABEL}`,
    `Data: ${dayLabel(r.occurred_on, today)}`,
    `${account}: ${r.account_name}`,
  ].join('\n');
}

const EXAMPLES = [
  'Para anotar um gasto, escreva o que foi e o valor:',
  'mercado 52,30',
  '',
  'Para um recebimento:',
  'recebi 1500 salário',
  '',
  'A data é hoje, se você não disser outra: "farmácia 38 ontem" ou "luz 180 12/10".',
].join('\n');

/** Canal da conversa (D-076 e D-080). As respostas e as regras são as mesmas; mudam o nome do canal e o de quem escreve. */
export type ChatChannel = 'whatsapp' | 'telegram';

const CHANNEL_WORDS: Record<ChatChannel, { name: string; who: string; whoLinked: string }> = {
  whatsapp: { name: 'WhatsApp', who: 'este número', whoLinked: 'este WhatsApp' },
  telegram: { name: 'Telegram', who: 'este Telegram', whoLinked: 'este Telegram' },
};

/** "Este número" ou "Este Telegram", no começo da frase. */
const upperFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Respostas da Clarevo no canal. Sempre resposta a uma mensagem da pessoa, nunca mensagem iniciada pela Clarevo. */
function chatReplies(channel: ChatChannel) {
  const w = CHANNEL_WORDS[channel];
  const words = `DESFAZER apaga a última anotação feita por aqui, AJUDA mostra os exemplos e DESLIGAR desliga ${w.who} da Clarevo.`;
  const howToLink = `No app da Clarevo, abra Conta, toque em ${w.name} e siga os passos.`;
  return {
    words,
    ajuda: `Oi! Por aqui você anota gastos e recebimentos na Clarevo.\n\n${EXAMPLES}\n\n${words}\n\nSe ${w.who} ainda não está ligado: ${howToLink}`,
    midia:
      'Por enquanto, a Clarevo entende só mensagens escritas. Dica: o microfone do teclado do celular transforma a sua fala em texto antes de enviar.',
    nao_ligado: `${upperFirst(w.who)} ainda não está ligado a uma conta da Clarevo. ${howToLink}`,
    codigo_invalido: `Este código não vale mais ou não existe. No app, abra Conta, toque em ${w.name} e gere outro. Cada código vale por ${WHATSAPP_CODE_MINUTES} minutos.`,
    muitas_tentativas: 'Muitas tentativas com códigos que não valem. Espere uma hora e gere um código novo no app.',
    muitas_mensagens: 'Muitas mensagens em pouco tempo. Espere alguns minutos e mande de novo.',
    nada_para_desfazer: 'Não há anotação recente feita por aqui para desfazer. Para mudar algo mais antigo, use o app.',
    desligado: `Pronto, ${w.whoLinked} foi desligado da Clarevo e nada mais será anotado por aqui. Para ligar de novo, use o app.`,
    data_futura: 'A data fica no futuro. Para uma conta que ainda vai vencer, use Contas a pagar no app.',
    valor_invalido: 'O valor precisa ser maior que zero. Por exemplo: mercado 52,30',
    valor_acima_do_limite: `O valor passa do limite de ${formatBRL(MAX_RECORD_CENTS)} por registro.`,
    descricao_invalida: 'A descrição ficou longa demais. Escreva em poucas palavras o que foi e o valor, por exemplo: mercado 52,30',
    erro: `Não deu para anotar agora. Tente de novo em alguns minutos. Se continuar, escreva para ${SUPPORT_EMAIL}.`,
    ligado: (space: WhatsAppSpace) => `Pronto, ${w.whoLinked} está ligado à Clarevo, no ${spaceLabel(space)}.\n\n${EXAMPLES}\n\n${words}`,
    sem_permissao: (space: WhatsAppSpace) =>
      `Você não anota mais no ${spaceLabel(space)}. No app, abra Conta, toque em ${w.name} e ligue de novo, escolhendo o espaço.`,
  };
}

type ChatReplies = ReturnType<typeof chatReplies>;
type FixedReply = Exclude<keyof ChatReplies, 'words' | 'ligado' | 'sem_permissao'>;

const REPLIES: Record<ChatChannel, ChatReplies> = { whatsapp: chatReplies('whatsapp'), telegram: chatReplies('telegram') };

/** Os textos fixos das respostas de um canal. */
function fixedReplies(channel: ChatChannel): Record<FixedReply, string> {
  const { words: _w, ligado: _l, sem_permissao: _s, ...fixed } = REPLIES[channel];
  return fixed;
}

/** Respostas da Clarevo no WhatsApp. Sempre resposta a uma mensagem da pessoa, nunca mensagem iniciada pela Clarevo. */
export const WHATSAPP_REPLY = fixedReplies('whatsapp');
/** Respostas da Clarevo no Telegram (D-080): as mesmas do WhatsApp, com o nome do canal. */
export const TELEGRAM_REPLY = fixedReplies('telegram');

/** As respostas fixas do canal. */
export function chatReply(channel: ChatChannel): Record<FixedReply, string> {
  return channel === 'telegram' ? TELEGRAM_REPLY : WHATSAPP_REPLY;
}

function parseReplies(r: Record<FixedReply, string>): Record<WhatsAppParseError, string> {
  return {
    sem_valor: 'Não encontrei o valor. Escreva o que foi e o valor, por exemplo: mercado 52,30',
    valor_ambiguo: 'Encontrei mais de um valor. Mande uma anotação por mensagem, por exemplo: mercado 52,30',
    valor_invalido: r.valor_invalido,
    valor_acima_do_limite: r.valor_acima_do_limite,
    sem_descricao: 'Faltou dizer o que foi. Por exemplo: mercado 52,30',
    data_invalida: 'Não entendi a data. Use hoje, ontem, anteontem ou dia/mês, por exemplo: mercado 52,30 ontem',
    data_futura: r.data_futura,
    codigo_invalido: r.codigo_invalido,
  };
}

const PARSE_REPLY: Record<ChatChannel, Record<WhatsAppParseError, string>> = {
  whatsapp: parseReplies(WHATSAPP_REPLY),
  telegram: parseReplies(TELEGRAM_REPLY),
};

/** Resposta para uma mensagem que nem chegou ao banco (formato que a Clarevo não entendeu). */
export function whatsappParseReply(reason: WhatsAppParseError, channel: ChatChannel = 'whatsapp'): string {
  return PARSE_REPLY[channel][reason];
}

/** Resposta para o resultado do banco. null: não responder (mensagem repetida pelo canal). */
export function whatsappOutcomeReply(outcome: WhatsAppOutcome, messageDay: IsoDate, channel: ChatChannel = 'whatsapp'): string | null {
  const today = outcome.today ?? messageDay;
  const r = REPLIES[channel];
  switch (outcome.result) {
    case 'repetida':
    case 'silencio':
    case 'registrada':
      return null;
    case 'ligado':
      return r.ligado(outcome.space);
    case 'anotado':
      return `Anotado no ${spaceLabel(outcome.space)}:\n${recordLines(outcome.record, today)}\n\nSe algo ficou errado, responda DESFAZER.`;
    case 'desfeito':
      return `Desfeito. Saiu do ${spaceLabel(outcome.space)}:\n${recordLines(outcome.record, today)}`;
    case 'sem_permissao':
      return r.sem_permissao(outcome.space);
    case 'sem_conta':
      return `O ${spaceLabel(outcome.space)} está sem conta de origem principal. No app, abra Conta e escolha a principal em Contas de origem.`;
    default:
      return chatReply(channel)[outcome.result];
  }
}
