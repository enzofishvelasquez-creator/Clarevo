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

const WORDS = 'DESFAZER apaga a última anotação feita por aqui, AJUDA mostra os exemplos e DESLIGAR desliga este número da Clarevo.';

const HOW_TO_LINK = 'No app da Clarevo, abra Conta, toque em WhatsApp e siga os passos.';

/** Respostas da Clarevo no WhatsApp. Sempre resposta a uma mensagem da pessoa, nunca mensagem iniciada pela Clarevo. */
export const WHATSAPP_REPLY = {
  ajuda: `Oi! Por aqui você anota gastos e recebimentos na Clarevo.\n\n${EXAMPLES}\n\n${WORDS}\n\nSe este número ainda não está ligado: ${HOW_TO_LINK}`,
  midia:
    'Por enquanto, a Clarevo entende só mensagens escritas. Dica: o microfone do teclado do celular transforma a sua fala em texto antes de enviar.',
  nao_ligado: `Este número ainda não está ligado a uma conta da Clarevo. ${HOW_TO_LINK}`,
  codigo_invalido: `Este código não vale mais ou não existe. No app, abra Conta, toque em WhatsApp e gere outro. Cada código vale por ${WHATSAPP_CODE_MINUTES} minutos.`,
  muitas_tentativas: 'Muitas tentativas com códigos que não valem. Espere uma hora e gere um código novo no app.',
  muitas_mensagens: 'Muitas mensagens em pouco tempo. Espere alguns minutos e mande de novo.',
  nada_para_desfazer: 'Não há anotação recente feita por aqui para desfazer. Para mudar algo mais antigo, use o app.',
  desligado: 'Pronto, este WhatsApp foi desligado da Clarevo e nada mais será anotado por aqui. Para ligar de novo, use o app.',
  data_futura: 'A data fica no futuro. Para uma conta que ainda vai vencer, use Contas a pagar no app.',
  valor_invalido: 'O valor precisa ser maior que zero. Por exemplo: mercado 52,30',
  valor_acima_do_limite: `O valor passa do limite de ${formatBRL(MAX_RECORD_CENTS)} por registro.`,
  descricao_invalida: 'A descrição ficou longa demais. Escreva em poucas palavras o que foi e o valor, por exemplo: mercado 52,30',
  erro: `Não deu para anotar agora. Tente de novo em alguns minutos. Se continuar, escreva para ${SUPPORT_EMAIL}.`,
} as const;

const PARSE_REPLY: Record<WhatsAppParseError, string> = {
  sem_valor: 'Não encontrei o valor. Escreva o que foi e o valor, por exemplo: mercado 52,30',
  valor_ambiguo: 'Encontrei mais de um valor. Mande uma anotação por mensagem, por exemplo: mercado 52,30',
  valor_invalido: WHATSAPP_REPLY.valor_invalido,
  valor_acima_do_limite: WHATSAPP_REPLY.valor_acima_do_limite,
  sem_descricao: 'Faltou dizer o que foi. Por exemplo: mercado 52,30',
  data_invalida: 'Não entendi a data. Use hoje, ontem, anteontem ou dia/mês, por exemplo: mercado 52,30 ontem',
  data_futura: WHATSAPP_REPLY.data_futura,
  codigo_invalido: WHATSAPP_REPLY.codigo_invalido,
};

/** Resposta para uma mensagem que nem chegou ao banco (formato que a Clarevo não entendeu). */
export function whatsappParseReply(reason: WhatsAppParseError): string {
  return PARSE_REPLY[reason];
}

/** Resposta para o resultado do banco. null: não responder (mensagem repetida pela Meta). */
export function whatsappOutcomeReply(outcome: WhatsAppOutcome, messageDay: IsoDate): string | null {
  const today = outcome.today ?? messageDay;
  switch (outcome.result) {
    case 'repetida':
    case 'silencio':
    case 'registrada':
      return null;
    case 'ligado':
      return `Pronto, este WhatsApp está ligado à Clarevo, no ${spaceLabel(outcome.space)}.\n\n${EXAMPLES}\n\n${WORDS}`;
    case 'anotado':
      return `Anotado no ${spaceLabel(outcome.space)}:\n${recordLines(outcome.record, today)}\n\nSe algo ficou errado, responda DESFAZER.`;
    case 'desfeito':
      return `Desfeito. Saiu do ${spaceLabel(outcome.space)}:\n${recordLines(outcome.record, today)}`;
    case 'sem_permissao':
      return `Você não anota mais no ${spaceLabel(outcome.space)}. No app, abra Conta, toque em WhatsApp e ligue de novo, escolhendo o espaço.`;
    case 'sem_conta':
      return `O ${spaceLabel(outcome.space)} está sem conta de origem principal. No app, abra Conta e escolha a principal em Contas de origem.`;
    default:
      return WHATSAPP_REPLY[outcome.result];
  }
}
