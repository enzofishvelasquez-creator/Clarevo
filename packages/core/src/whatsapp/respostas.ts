import { addDays, formatListDate, formatMonthName, formatMonthYearBR, type IsoDate } from '../dates';
import { SUPPORT_EMAIL } from '../legal';
import { MAX_RECORD_CENTS, formatBRL, type Cents } from '../money';
import { NO_CATEGORY_LABEL, type RecordKind } from '../records';
import { TELEGRAM_IN_ACCOUNT, WHATSAPP_IN_ACCOUNT } from './canais';
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

/** O apelido sem a palavra "cartão" no começo ("Cartão Azul" vira "Azul"), para não repetir a palavra. */
function withoutCardWord(nickname: string): string {
  const rest = nickname.replace(/^\s*cart[aã]o\s+/i, '');
  return rest === '' ? nickname : rest;
}

/** "cartão Azul", ou o apelido como está quando ele já começa com "Cartão" ("Cartão Azul"). */
function cardLabel(nickname: string): string {
  return withoutCardWord(nickname) === nickname ? `cartão ${nickname}` : nickname;
}

/** Compra no cartão anotada ou desfeita (D-089 C), como o banco devolve: o apelido do cartão, nunca os dígitos; a fatura como dia 1. */
export interface WhatsAppPurchaseInfo {
  amount_cents: Cents;
  purchased_on: IsoDate;
  description: string;
  category: string | null;
  card_nickname: string;
  /** "2026-12-01": a fatura em que a compra caiu (o mês do vencimento). */
  invoice_month: string;
}

/**
 * Resultado das funções whatsapp_* do banco. Nada é respondido em "repetida" (a Meta mandou de novo a mesma mensagem) nem em "silencio"
 * (enxurrada de mensagens, depois do primeiro aviso). "registrada": mensagem sem dados (ajuda, mídia, não entendi), respondida pelo
 * servidor. `today`: o dia da pessoa no instante da mensagem, no fuso dela (para "hoje" e "ontem" na resposta).
 */
export type WhatsAppOutcome =
  | { result: 'ligado'; space: WhatsAppSpace; /** Nome de quem ligou (o dono do código), para quem escreve conferir a conta. */ name?: string | null; today?: IsoDate }
  | { result: 'anotado'; space: WhatsAppSpace; record: WhatsAppRecordInfo; today?: IsoDate }
  | { result: 'desfeito'; space: WhatsAppSpace; record: WhatsAppRecordInfo; today?: IsoDate }
  | { result: 'sem_permissao' | 'sem_conta'; space: WhatsAppSpace; today?: IsoDate }
  | { result: 'compra_anotada' | 'compra_desfeita'; space: WhatsAppSpace; purchase: WhatsAppPurchaseInfo; today?: IsoDate }
  | { result: 'sem_cartao' | 'fatura_paga' | 'limite_do_cartao'; space: WhatsAppSpace; today?: IsoDate }
  | { result: 'qual_cartao'; space: WhatsAppSpace; cards: string[]; today?: IsoDate }
  | {
      result:
        | 'nada_para_desfazer'
        | 'desligado'
        | 'nao_ligado'
        | 'codigo_invalido'
        | 'ja_ligado'
        | 'sem_assinatura'
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

/** "dezembro" ou "janeiro de 2027" (com o ano quando não é o ano de hoje). */
function invoiceLabel(invoiceMonth: string, today: IsoDate): string {
  const month = invoiceMonth.slice(0, 7);
  return month.slice(0, 4) === today.slice(0, 4) ? formatMonthName(month) : formatMonthYearBR(month);
}

function purchaseLines(p: WhatsAppPurchaseInfo, today: IsoDate): string {
  return [
    `Compra no ${cardLabel(p.card_nickname)}: ${p.description}, ${formatBRL(p.amount_cents)}`,
    `Categoria: ${p.category ?? NO_CATEGORY_LABEL}`,
    `Data da compra: ${dayLabel(p.purchased_on, today)}`,
    `Fatura de ${invoiceLabel(p.invoice_month, today)}`,
  ].join('\n');
}

/** "Azul", "Azul e Roxo", "Azul, Roxo e Verde". */
function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
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
  '',
  'Para uma compra no cartão de crédito, acrescente a palavra cartão no fim:',
  'farmácia 41 cartão',
  'Com mais de um cartão, o nome dele depois: "farmácia 41 cartão azul".',
].join('\n');

/** Canal da conversa (D-076 e D-080). As respostas e as regras são as mesmas; mudam o nome do canal e o de quem escreve. */
export type ChatChannel = 'whatsapp' | 'telegram';

const CHANNEL_WORDS: Record<ChatChannel, { name: string; who: string; whoLinked: string; inAccount: boolean }> = {
  whatsapp: { name: 'WhatsApp', who: 'este número', whoLinked: 'este WhatsApp', inAccount: WHATSAPP_IN_ACCOUNT },
  telegram: { name: 'Telegram', who: 'este Telegram', whoLinked: 'este Telegram', inAccount: TELEGRAM_IN_ACCOUNT },
};

/**
 * Onde ligar, gerar outro código ou ligar de novo: em Conta, quando o card aparece; no piloto fechado, o endereço da tela (o card em
 * Conta fica escondido).
 */
function whereTo(channel: ChatChannel) {
  const w = CHANNEL_WORDS[channel];
  if (w.inAccount) {
    return {
      link: `No app da Clarevo, abra Conta, toque em ${w.name} e siga os passos.`,
      newCode: `No app, abra Conta, toque em ${w.name} e gere outro.`,
      relink: `No app, abra Conta, toque em ${w.name} e ligue de novo, escolhendo o espaço.`,
    };
  }
  const page = `app.clarevo.app.br/conta/${channel}`;
  return {
    link: `Abra ${page} e siga os passos.`,
    newCode: `Gere outro em ${page}.`,
    relink: `Ligue de novo em ${page}, escolhendo o espaço.`,
  };
}

/** "Este número" ou "Este Telegram", no começo da frase. */
const upperFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Respostas da Clarevo no canal. Sempre resposta a uma mensagem da pessoa, nunca mensagem iniciada pela Clarevo. */
function chatReplies(channel: ChatChannel) {
  const w = CHANNEL_WORDS[channel];
  const where = whereTo(channel);
  const words = `DESFAZER apaga a última anotação feita por aqui, AJUDA mostra os exemplos e DESLIGAR desliga ${w.who} da Clarevo.`;
  const howToLink = where.link;
  return {
    words,
    ajuda: `Oi! Por aqui você anota gastos e recebimentos na Clarevo.\n\n${EXAMPLES}\n\n${words}\n\nSe ${w.who} ainda não está ligado: ${howToLink}`,
    midia:
      'Por enquanto, a Clarevo entende só mensagens escritas. Dica: o microfone do teclado do celular transforma a sua fala em texto antes de enviar.',
    nao_ligado: `${upperFirst(w.who)} ainda não está ligado a uma conta da Clarevo. ${howToLink}`,
    codigo_invalido: `Este código não vale mais ou não existe. ${where.newCode} Cada código vale por ${WHATSAPP_CODE_MINUTES} minutos.`,
    ja_ligado: `${upperFirst(w.who)} já está ligado a outra conta da Clarevo. Se for seu, mande DESLIGAR e depois mande o código de novo.`,
    sem_assinatura:
      'A sua conta da Clarevo está só para ver e exportar: o teste grátis acabou ou a assinatura não está ativa. Para voltar a anotar, abra Conta no app e toque em Assinatura.',
    muitas_tentativas: 'Muitas tentativas com códigos que não valem. Espere uma hora e gere um código novo no app.',
    muitas_mensagens: 'Muitas mensagens em pouco tempo. Espere alguns minutos e mande de novo.',
    nada_para_desfazer: 'Não há anotação recente feita por aqui para desfazer. Para mudar algo mais antigo, use o app.',
    desligado: `Pronto, ${w.whoLinked} foi desligado da Clarevo e nada mais será anotado por aqui. Para ligar de novo, use o app.`,
    data_futura: 'A data fica no futuro. Para uma conta que ainda vai vencer, use Contas a pagar no app.',
    valor_invalido: 'O valor precisa ser maior que zero. Por exemplo: mercado 52,30',
    valor_acima_do_limite: `O valor passa do limite de ${formatBRL(MAX_RECORD_CENTS)} por registro.`,
    descricao_invalida: 'A descrição ficou longa demais. Escreva em poucas palavras o que foi e o valor, por exemplo: mercado 52,30',
    erro: `Não deu para anotar agora. Tente de novo em alguns minutos. Se continuar, escreva para ${SUPPORT_EMAIL}.`,
    ligado: (space: WhatsAppSpace, name?: string | null) =>
      `Pronto, ${w.whoLinked} está ligado à ${name ? `conta de ${name} na ` : ''}Clarevo, no ${spaceLabel(space)}.\n\n${EXAMPLES}\n\n${words}`,
    sem_permissao: (space: WhatsAppSpace) => `Você não anota mais no ${spaceLabel(space)}. ${where.relink}`,
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
      return r.ligado(outcome.space, outcome.name);
    case 'anotado':
      return `Anotado no ${spaceLabel(outcome.space)}:\n${recordLines(outcome.record, today)}\n\nSe algo ficou errado, responda DESFAZER.`;
    case 'desfeito':
      return `Desfeito. Saiu do ${spaceLabel(outcome.space)}:\n${recordLines(outcome.record, today)}`;
    case 'sem_permissao':
      return r.sem_permissao(outcome.space);
    case 'sem_conta':
      return `O ${spaceLabel(outcome.space)} está sem conta de origem principal. No app, abra Conta e escolha a principal em Contas de origem.`;
    case 'compra_anotada':
      return `Anotado no ${spaceLabel(outcome.space)}:\n${purchaseLines(outcome.purchase, today)}\n\nSe algo ficou errado, responda DESFAZER.`;
    case 'compra_desfeita':
      return `Desfeito. Saiu do ${spaceLabel(outcome.space)}:\n${purchaseLines(outcome.purchase, today)}`;
    case 'sem_cartao':
      return outcome.space.kind === 'pessoal'
        ? 'O espaço Pessoal não tem cartão de crédito cadastrado. Para anotar no cartão, cadastre um no app, em Conta e Cartões. Para anotar como gasto já pago, mande sem a palavra cartão.'
        : `Compras no cartão entram só no espaço Pessoal, e ${CHANNEL_WORDS[channel].whoLinked} está ligado ao ${spaceLabel(outcome.space)}. Mande sem a palavra cartão para anotar como gasto, ou ligue de novo escolhendo o Pessoal.`;
    case 'qual_cartao':
      return `Qual cartão? Você tem: ${listNames(outcome.cards)}. Mande de novo com o nome depois da palavra cartão, como "farmácia 41 cartão ${withoutCardWord(outcome.cards[0] ?? 'azul').toLowerCase()}".`;
    case 'fatura_paga':
      return 'A fatura desse mês já está marcada como paga no app, então a compra não pode entrar nem sair por aqui. Confira a data ou anote no app.';
    case 'limite_do_cartao':
      return 'Este cartão chegou a 5.000 lançamentos guardados. Exclua no app os que não precisa mais para anotar outros.';
    default:
      return chatReply(channel)[outcome.result];
  }
}
