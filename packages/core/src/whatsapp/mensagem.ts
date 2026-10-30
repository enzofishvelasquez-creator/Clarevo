import { addDays, isValidIsoDate, type IsoDate } from '../dates';
import { categoryByRules } from '../importar/categorias';
import { normalizeDescription } from '../importar/dedupe';
import { MAX_RECORD_CENTS, parseBRL, type Cents } from '../money';
import { CATEGORIES, type RecordKind } from '../records';

/**
 * Anotar pelo WhatsApp (D-076), fase 1: só mensagens escritas, lidas por regras simples, sem IA. Uma mensagem vira um comando:
 * ligar este número com o código do app, desfazer a última anotação, desligar, ajuda, ou anotar um gasto ou um recebimento.
 * O texto da mensagem nunca é guardado: só o que vira registro, pelas mesmas funções do app.
 */

/** Letras e algarismos do código de ligar: sem I, O, 0 e 1, que se confundem. 32 símbolos, 8 por código (cerca de 10^12). */
export const WHATSAPP_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const WHATSAPP_CODE_LENGTH = 8;
/** Descrição do registro: o mesmo limite do banco. */
export const WHATSAPP_DESCRIPTION_MAX = 80;

export type WhatsAppParseError =
  | 'sem_valor'
  | 'valor_ambiguo'
  | 'valor_invalido'
  | 'valor_acima_do_limite'
  | 'sem_descricao'
  | 'data_invalida'
  | 'data_futura'
  | 'codigo_invalido';

export type WhatsAppCommand =
  | { type: 'ligar'; code: string }
  | { type: 'desfazer' }
  | { type: 'desligar' }
  | { type: 'ajuda' }
  | {
      type: 'anotar';
      kind: RecordKind;
      amountCents: Cents;
      /** A data pelo dia de `today` (o servidor manda ao banco a data escrita ou os dias antes, e o banco usa o dia da pessoa). */
      occurredOn: IsoDate;
      /** "hoje" (0, também sem data), "ontem" (1), "anteontem" (2); null quando a data foi escrita ("dia 5", "12/10"). */
      daysAgo: number | null;
      description: string;
      category: string | null;
    }
  | { type: 'erro'; reason: WhatsAppParseError };

/** Sem acento e em minúsculas, para comparar palavras. */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Pontuação nas pontas de uma palavra (a de dentro fica: "52,30", "12/10", "pão-de-queijo"). */
const EDGE_PUNCT = /^[\s"'“”‘’«»()[\]{}.,;:!?¿¡…*_~]+|[\s"'“”‘’«»()[\]{}.,;:!?¿¡…*_~]+$/gu;

function trimPunct(word: string): string {
  return word.replace(EDGE_PUNCT, '');
}

/** A mensagem inteira, sem acento, sem pontuação e com espaços simples: para reconhecer os comandos de uma palavra. */
function commandForm(text: string): string {
  return fold(text)
    .replace(/[^a-z0-9\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const UNDO = new Set(['desfazer', 'desfaz', 'desfaca', 'desfazer ultimo', 'desfazer ultima', 'desfazer o ultimo', 'desfazer a ultima']);
const UNLINK = new Set(['desligar', 'parar', 'sair', 'stop', 'descadastrar', 'desligar whatsapp']);
const HELP = new Set([
  '', 'ajuda', 'oi', 'oie', 'ola', 'menu', 'inicio', 'comandos', 'help', 'exemplos', 'como funciona',
  'bom dia', 'boa tarde', 'boa noite',
]);
const LINK_WORDS = new Set(['ativar', 'ligar', 'codigo']);

/** Código como o banco guarda o resumo: 8 símbolos do alfabeto, em maiúsculas, sem hífen. null se o formato não serve. */
export function normalizeWhatsAppCode(text: string): string | null {
  const code = text.toUpperCase().replace(/[\s-]+/g, '');
  if (code.length !== WHATSAPP_CODE_LENGTH) return null;
  for (const ch of code) if (!WHATSAPP_CODE_ALPHABET.includes(ch)) return null;
  return code;
}

/** "ABCDEFGH" → "ABCD-EFGH", como o app mostra. */
export function formatWhatsAppCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/**
 * Ligar: "Ativar ABCD-EFGH" (o texto que o app preenche), "ligar ...", "código ..." ou só o código com hífen. Com a palavra de
 * ligar, um código em formato errado já é recusado aqui (codigo_invalido), sem consultar o banco. undefined quando não é ligar.
 */
function readLink(text: string): WhatsAppCommand | undefined {
  const words = commandForm(text).split(' ');
  if (words.length >= 2 && LINK_WORDS.has(words[0]!)) {
    const code = normalizeWhatsAppCode(words.slice(1).join(''));
    return code === null ? { type: 'erro', reason: 'codigo_invalido' } : { type: 'ligar', code };
  }
  const only = text.trim().replace(EDGE_PUNCT, '');
  if (/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/.test(only)) {
    const code = normalizeWhatsAppCode(only);
    if (code !== null) return { type: 'ligar', code };
  }
  return undefined;
}

const INCOME_WORDS = new Set(['recebi', 'recebido', 'recebimento', 'ganhei', 'entrou', 'entrada', 'caiu', 'receita']);
const EXPENSE_WORDS = new Set(['gastei', 'gasto', 'paguei', 'pago', 'comprei', 'compra', 'despesa']);
/** Palavras de ligação que saem das pontas da descrição ("52 reais de mercado" → "mercado"). */
const EDGE_STOP = new Set([
  'de', 'do', 'da', 'dos', 'das', 'no', 'na', 'nos', 'nas', 'em', 'com', 'pra', 'pro', 'para', 'por', 'o', 'a', 'os', 'as', 'um',
  'uma', 'e', 'reais', 'real', 'r$', 'rs', 'foi',
]);
/** Sinais soltos nas pontas ("mercado - 50", "luz = 180"), inclusive os traços que o celular troca sozinho. */
const isEdgeStop = (folded: string) => EDGE_STOP.has(folded) || /^[-+=\u2013\u2014]+$/.test(folded);

interface Token {
  raw: string;
  word: string;
  folded: string;
}

/** Valor em reais numa palavra: "52,30", "R$52", "1.500", "52.5". null quando não é valor. */
function moneyOf(folded: string): { cents: Cents; strong: boolean } | null {
  const t = folded.replace(/[.,]+$/, '');
  if (!/^(r\$)?\d[\d.,]*$/.test(t)) return null;
  const cents = parseBRL(t);
  if (cents === null) return null;
  // "Forte": com R$ ou com centavos ("52,30"), para escolher entre dois números ("13 salário 3.000,00").
  return { cents, strong: t.startsWith('r$') || /,\d{1,2}$/.test(t) };
}

/** Data numa palavra: "12/10" (ano de hoje) ou "12/10/2026" e "12/10/26". undefined quando não é data; null quando é data impossível. */
function dateOf(word: string, today: IsoDate): IsoDate | null | undefined {
  const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(word);
  if (!m) return undefined;
  const year = m[3] === undefined ? today.slice(0, 4) : m[3].length === 2 ? `20${m[3]}` : m[3];
  const iso = `${year}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  return isValidIsoDate(iso) ? iso : null;
}

/** Categoria: o nome dela escrito na mensagem ("lazer 80", "saúde 120") ou, sem isso, as mesmas regras de palavras da importação. */
export function whatsappCategory(description: string, kind: RecordKind): string | null {
  const padded = ` ${normalizeDescription(description)} `;
  for (const category of CATEGORIES[kind]) {
    if (padded.includes(` ${normalizeDescription(category)} `)) return category;
  }
  return categoryByRules(description, kind);
}

/** Até 80 caracteres, cortando no último espaço quando dá. */
function clip(text: string): string {
  if (text.length <= WHATSAPP_DESCRIPTION_MAX) return text;
  const cut = text.slice(0, WHATSAPP_DESCRIPTION_MAX);
  const space = cut.lastIndexOf(' ');
  return (space >= 20 ? cut.slice(0, space) : cut).trim();
}

/**
 * Lê uma mensagem escrita. `today` é o dia da mensagem no fuso de Brasília (o banco confere de novo a data futura no fuso da pessoa).
 * Anotar: o valor (um só), o que foi (a descrição) e, se vier, a data ("hoje", "ontem", "anteontem", "dia 12", "12/10"). Recebimento
 * quando a mensagem começa com "+" ou traz "recebi", "ganhei", "entrou" (ou só tem palavras de recebimento, como "salário 3000");
 * senão, gasto.
 */
export function readWhatsAppMessage(text: string, today: IsoDate): WhatsAppCommand {
  const form = commandForm(text);
  if (UNDO.has(form)) return { type: 'desfazer' };
  if (UNLINK.has(form)) return { type: 'desligar' };
  if (HELP.has(form)) return { type: 'ajuda' };
  const link = readLink(text);
  if (link) return link;

  let tokens: Token[] = text
    .split(/\s+/)
    .filter((w) => w !== '')
    .map((raw) => {
      const word = trimPunct(raw);
      return { raw, word, folded: fold(word) };
    })
    .filter((t) => t.word !== '' || t.raw.startsWith('+') || t.raw.startsWith('-'));

  // Sinal na frente: "+3000 salário" é recebimento; "-50 mercado" é gasto.
  let kind: RecordKind | null = null;
  const first = tokens[0];
  if (first && (first.raw.startsWith('+') || first.raw.startsWith('-'))) {
    kind = first.raw.startsWith('+') ? 'receita' : 'despesa';
    const rest = first.raw.slice(1);
    const word = trimPunct(rest);
    tokens = word === '' ? tokens.slice(1) : [{ raw: rest, word, folded: fold(word) }, ...tokens.slice(1)];
  }
  // A primeira palavra de recebimento ou de gasto decide o tipo e sai da descrição.
  const verb = tokens.findIndex((t) => INCOME_WORDS.has(t.folded) || EXPENSE_WORDS.has(t.folded));
  if (verb >= 0) {
    if (kind === null) kind = INCOME_WORDS.has(tokens[verb]!.folded) ? 'receita' : 'despesa';
    tokens = tokens.filter((_, i) => i !== verb);
  }

  // Data: uma só (repetir a mesma vale).
  let occurredOn: IsoDate | null = null;
  let daysAgo: number | null = null;
  const dateIdx = new Set<number>();
  const setDate = (d: IsoDate, rel: number | null): boolean => {
    if (occurredOn !== null && occurredOn !== d) return false;
    occurredOn = d;
    daysAgo = rel;
    return true;
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    const rel = t.folded === 'hoje' ? 0 : t.folded === 'ontem' ? 1 : t.folded === 'anteontem' ? 2 : null;
    let d: IsoDate | null | undefined;
    if (rel !== null) d = addDays(today, -rel);
    else if (t.folded === 'dia' && /^\d{1,2}$/.test(tokens[i + 1]?.folded ?? '')) {
      const day = tokens[i + 1]!.folded.padStart(2, '0');
      const iso = `${today.slice(0, 8)}${day}`;
      d = isValidIsoDate(iso) ? iso : null;
      dateIdx.add(i);
      i++;
    } else d = dateOf(t.folded, today);
    if (d === undefined) continue;
    if (d === null || !setDate(d, rel)) return { type: 'erro', reason: 'data_invalida' };
    dateIdx.add(i);
  }
  tokens = tokens.filter((_, i) => !dateIdx.has(i));
  const date: IsoDate = occurredOn ?? today;
  if (date > today) return { type: 'erro', reason: 'data_futura' };

  // Valor: "R$" solto vale para o número seguinte.
  const candidates: { idx: number[]; cents: Cents; strong: boolean }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if ((t.folded === 'r$' || t.folded === 'rs') && tokens[i + 1]) {
      const m = moneyOf(`r$${tokens[i + 1]!.folded}`);
      if (m) {
        candidates.push({ idx: [i, i + 1], ...m });
        i++;
        continue;
      }
    }
    const m = moneyOf(t.folded);
    if (m) candidates.push({ idx: [i], ...m });
  }
  if (candidates.length === 0) return { type: 'erro', reason: 'sem_valor' };
  let chosen = candidates[0]!;
  if (candidates.length > 1) {
    const strong = candidates.filter((c) => c.strong);
    if (strong.length !== 1) return { type: 'erro', reason: 'valor_ambiguo' };
    chosen = strong[0]!;
  }
  if (chosen.cents < 1) return { type: 'erro', reason: 'valor_invalido' };
  if (chosen.cents > MAX_RECORD_CENTS) return { type: 'erro', reason: 'valor_acima_do_limite' };
  tokens = tokens.filter((_, i) => !chosen.idx.includes(i));

  // Descrição: o que sobrou, sem as palavras de ligação nas pontas.
  while (tokens.length > 0 && isEdgeStop(tokens[0]!.folded)) tokens = tokens.slice(1);
  while (tokens.length > 0 && isEdgeStop(tokens[tokens.length - 1]!.folded)) tokens = tokens.slice(0, -1);
  const joined = tokens.map((t) => t.word).filter((w) => w !== '').join(' ');
  if (joined === '') return { type: 'erro', reason: 'sem_descricao' };
  const description = clip(joined.charAt(0).toUpperCase() + joined.slice(1));

  if (kind === null) {
    // Sem palavra de tipo: recebimento só quando a descrição é de recebimento e não de gasto ("salário 3000", "reembolso 80").
    kind = whatsappCategory(description, 'receita') !== null && whatsappCategory(description, 'despesa') === null ? 'receita' : 'despesa';
  }
  return {
    type: 'anotar',
    kind,
    amountCents: chosen.cents,
    occurredOn: date,
    daysAgo: occurredOn === null ? 0 : daysAgo,
    description,
    category: whatsappCategory(description, kind),
  };
}
