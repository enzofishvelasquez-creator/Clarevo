import { fold } from '../comprovante/texto';
import { addDays, isValidIsoDate, type IsoDate } from '../dates';
import { MAX_RECORD_CENTS } from '../money';
import { installmentMark, normalizeDescription, similarDescriptions } from './dedupe';
import { lineDirection, signedByDirection, unmarkedDirection, type AmountMark } from './direcao';
import { IMPORT_MAX_LINES, type ImportDestination, type ImportParse, type ParsedLine } from './tipos';
import { cleanDescription } from './valores';

/**
 * Importar por print (D-108, retorno do teste: "além do importar fatura em PDF, a possibilidade de enviar prints; no caso do mês
 * atual, a fatura ainda não pode ser baixada"). O texto de cada imagem é lido no aparelho (D-078 B: tesseract.js na web,
 * `expo-text-extractor` no celular) e chega aqui como texto puro, sem a posição de cada pedaço; daqui saem as linhas (data,
 * descrição, valor e a parcela "3/4" quando houver), como no PDF, para a mesma tela de conferência. Nada da imagem nem do texto é
 * guardado.
 *
 * O leitor de texto devolve as linhas da tela em ordens diferentes conforme o aparelho, então a leitura aceita:
 * - a linha inteira ("16/11 MERCADO EXEMPLO -80,50" ou "Mercado Exemplo R$ 80,50");
 * - a descrição numa linha e o valor na seguinte (com uma ou duas linhas de descrição, como "Transferência enviada" e o nome);
 * - as descrições todas e, depois, os valores todos (o leitor do celular junta a coluna da esquerda num bloco e a da direita em
 *   outro): os valores seguidos casam com as descrições na mesma ordem;
 * - o valor antes da descrição.
 * A data vem do cabeçalho do dia ("16 NOV", "16 de novembro", "16/11", "Hoje", "Ontem") ou do começo da linha; sem ano, é o ano de
 * hoje, e uma data que cairia depois de hoje volta um ano. Saldo, total, limite, vencimento e botões ficam de fora.
 *
 * Gasto ou recebimento: a marca do valor ("-R$ 50,00", "+R$ 0,01"), as palavras e o costume dos prints (`lineDirection`). Na fatura,
 * a compra vem sem marca. Linhas que aparecem em mais de um print (prints que se sobrepõem ao rolar a tela) entram uma vez só; duas
 * linhas iguais no mesmo print continuam duas. Tudo vem marcado "Lido de imagem: confira" na revisão.
 */

/** Quantos prints numa leitura. */
export const IMPORT_MAX_IMAGES = 10;

const MONTHS: Record<string, number> = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
const MONTH_NAME = '(jan(?:eiro)?|fev(?:ereiro)?|mar(?:co)?|abr(?:il)?|mai(?:o)?|jun(?:ho)?|jul(?:ho)?|ago(?:sto)?|set(?:embro)?|out(?:ubro)?|nov(?:embro)?|dez(?:embro)?)';
const WEEKDAY = '(?:(?:segunda|terca|quarta|quinta|sexta)(?:[- ]feira)?|sabado|domingo|seg|ter|qua|qui|sex|sab|dom)\\.?,?\\s+';
const LEAD = `^(?:(hoje|ontem)\\s*,?\\s*)?(?:${WEEKDAY})?`;
/** "16 NOV", "16 de novembro de 2026", "Segunda, 16 nov", "Hoje, 16 de novembro" no começo da linha (texto sem acento, minúsculo). */
const DATE_NAME = new RegExp(`${LEAD}(\\d{1,2})\\s*(?:de\\s+)?${MONTH_NAME}\\.?(?![a-z])(?:\\s*(?:de\\s+)?(\\d{4}))?(?!\\d)`);
/** "16/11", "16/11/2026", "16/11/26" no começo da linha. */
const DATE_NUM = new RegExp(`${LEAD}(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{4}|\\d{2}))?(?![\\d,/])`);
/** "Hoje" ou "Ontem" sozinhos (ou com o dia da semana). */
const DATE_RELATIVE = /^(hoje|ontem)\b(?:\s*,?\s*(?:(?:segunda|terca|quarta|quinta|sexta)(?:[- ]feira)?|sabado|domingo)\b)?/;

/**
 * Valor em reais: "R$ 1.234,56", "-R$ 50,00", "- R$ 50,00", "R$ -50,00", "+ R$ 0,01", "50,00-", "50,00 D", "50,00 C". O sinal
 * tem de estar junto do valor (no máximo um espaço).
 */
const MONEY = /(?<![\d.,])(?:([+-]) ?)?(?:(?:[Rr] ?\$|RS|Rs) ?)?(?:([+-]) ?)?(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})(?![\d,])(?: ?(-)(?!\d))?(?: ?\b([DC])\b)?/;
/** O leitor às vezes troca a vírgula por ponto: só com "R$" na frente e duas casas ("R$ 80.50"). */
const MONEY_DOT = /(?<![\d.,])(?:([+-]) ?)?(?:[Rr] ?\$|RS|Rs) ?(?:([+-]) ?)?(\d+\.\d{2})(?![\d.,])/;

/** Cabeçalho, rodapé e botões da tela do banco (texto sem acento, minúsculo). */
const SKIP =
  /\b(saldo|total|subtotal|limite|resumo|periodo|pagina|lancamentos futuros|fatura (atual|aberta|fechada|anterior|prevista|do mes|de (janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro))|valor da fatura|pagamento minimo|minimo|vencimento|vence|vencida|fecha em|fecha dia|fechamento|melhor dia|disponivel|pagar fatura|parcelar fatura|antecipar|extrato|filtrar|filtros|buscar|ver mais|ver todos|ver tudo)\b/;
/** Hora ("14:32", "14h32") e "às" antes dela. */
const TIME = /(?:(?:^|\s)(?:as|às)\s+)?\b\d{1,2}[:h]\d{2}\b/gi;
/** Parcela escrita: "Parcela 3 de 4", "Parcela 3/4", "Parc 03/04". */
const INSTALLMENT_WORDS = /\bparc(?:ela)?\.?\s*(\d{1,2})\s*(?:de|\/)\s*(\d{1,2})\b/;
/** Uma linha só com a parcela: "3/4", "3 de 4". */
const INSTALLMENT_ALONE = /^(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})$/;

interface Money {
  index: number;
  length: number;
  cents: number;
  mark: AmountMark;
}

function cleanLine(raw: string): string {
  return raw
    .replace(/[\u00a0\u2007\u202f\t]/g, ' ')
    .replace(/[\u2010-\u2015\u2212\ufe63\uff0d]/g, '-')
    .replace(/[|\u2022\u00b7\u203a\u2039\u00bb\u00ab<>*_~^=]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findMoney(line: string): Money | null {
  const m = MONEY.exec(line);
  if (m) {
    const minus = m[1] === '-' || m[2] === '-' || m[4] === '-';
    const plus = !minus && (m[1] === '+' || m[2] === '+');
    const mark: AmountMark = minus ? 'menos' : plus ? 'mais' : m[5] === 'D' ? 'D' : m[5] === 'C' ? 'C' : null;
    return { index: m.index, length: m[0].length, cents: Number(m[3]!.replace(/\./g, '').replace(',', '')), mark };
  }
  const d = MONEY_DOT.exec(line);
  if (d) {
    const minus = d[1] === '-' || d[2] === '-';
    const plus = !minus && (d[1] === '+' || d[2] === '+');
    return { index: d.index, length: d[0].length, cents: Number(d[3]!.replace('.', '')), mark: minus ? 'menos' : plus ? 'mais' : null };
  }
  return null;
}

/** Dia e mês sem ano: o ano de hoje, e um dia depois de hoje volta um ano (print de dezembro lido em janeiro). */
function resolveDate(day: number, month: number, year: number | null, today: IsoDate): IsoDate | null {
  const pad = (n: number) => String(n).padStart(2, '0');
  if (year !== null) {
    const iso = `${year}-${pad(month)}-${pad(day)}`;
    return isValidIsoDate(iso) ? iso : null;
  }
  const y = Number(today.slice(0, 4));
  let iso = `${y}-${pad(month)}-${pad(day)}`;
  if (!isValidIsoDate(iso)) return null;
  if (iso > today) iso = `${y - 1}-${pad(month)}-${pad(day)}`;
  return isValidIsoDate(iso) ? iso : null;
}

/** A data no começo da linha e o tamanho do que ela ocupa; null quando a linha não começa por data. */
function leadingDate(folded: string, today: IsoDate): { date: IsoDate; length: number } | null {
  const year = (raw: string | undefined) => (raw === undefined ? null : raw.length === 2 ? 2000 + Number(raw) : Number(raw));
  const named = DATE_NAME.exec(folded);
  if (named) {
    const date = resolveDate(Number(named[2]), MONTHS[named[3]!.slice(0, 3)]!, year(named[4]), today);
    return date ? { date, length: named[0].length } : null;
  }
  const num = DATE_NUM.exec(folded);
  if (num && Number(num[3]) >= 1 && Number(num[3]) <= 12) {
    const date = resolveDate(Number(num[2]), Number(num[3]), year(num[4]), today);
    return date ? { date, length: num[0].length } : null;
  }
  const rel = DATE_RELATIVE.exec(folded);
  if (rel) return { date: rel[1] === 'hoje' ? today : addDays(today, -1), length: rel[0].length };
  return null;
}

function validInstallment(number: number, count: number): { number: number; count: number } | null {
  return count >= 2 && count <= 48 && number >= 1 && number <= count ? { number, count } : null;
}

/** Texto de descrição: sem hora, sem "de" solto e sem pontuação nas pontas; vazio quando não tem ao menos três letras. */
function descriptionText(raw: string): string {
  const text = raw
    .replace(TIME, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-:;,.+/]+|[\s\-:;,./]+$/g, '')
    .replace(/^(?:de|em|no|na)\s+|\s+(?:de|em|no|na)$/gi, '')
    .trim();
  return (text.match(/\p{L}/gu) ?? []).length >= 3 ? text : '';
}

type Installment = { number: number; count: number };

/** Uma linha lida de um print, antes de juntar os prints. */
interface Entry {
  date: IsoDate | null;
  description: string;
  cents: number;
  mark: AmountMark;
  /** A parcela escrita numa linha à parte ("Parcela 3 de 4"), acrescentada à descrição no fim. */
  inst: Installment | null;
}

interface Pending {
  text: string;
  /** Data em vigor quando a linha apareceu. */
  date: IsoDate | null;
  /** A linha veio depois do último cabeçalho de dia (uma linha só com a data). */
  afterHeader: boolean;
  inst: Installment | null;
}

/** As linhas de um print: as que viraram lançamento, as deixadas de lado, a última data vista e se havia saldo. */
interface ImageRead {
  entries: Entry[];
  ignored: number;
  lastDate: IsoDate | null;
  balance: boolean;
}

/** A descrição com a parcela ("LOJA PARC 3/4"), se ela ainda não está escrita, aparada a 80 caracteres. */
function withInstallment(description: string, inst: Installment | null): string {
  if (!inst || installmentMark(description) !== null) return cleanDescription(description);
  const tail = ` PARC ${inst.number}/${inst.count}`;
  return `${cleanDescription(description).slice(0, 80 - tail.length).trim()}${tail}`;
}

function readImageText(text: string, today: IsoDate, startDate: IsoDate | null): ImageRead {
  const lines = text.split(/\r?\n/).map(cleanLine).filter((l) => l !== '');
  const entries: Entry[] = [];
  let ignored = 0;
  let balance = false;
  let currentDate: IsoDate | null = startDate;
  let pending: Pending[] = [];
  /** Linha (posição) do último lançamento lido: a parcela na linha logo abaixo é dele. */
  let lastEmitAt = -2;
  /** O último lançamento tinha a descrição e o valor na mesma linha (a descrição comprida pode continuar na linha de baixo). */
  let lastSameLine = false;
  /** Valores sem descrição antes (o leitor pôs o valor antes da descrição): esperam a próxima descrição. */
  let orphans: { money: Money; date: IsoDate | null }[] = [];

  const emit = (description: string, money: Money, date: IsoDate | null, inst: Installment | null, at: number) => {
    if (cleanDescription(description) === '' || money.cents <= 0 || money.cents > MAX_RECORD_CENTS) {
      ignored++;
      return;
    }
    entries.push({ date, description, cents: money.cents, mark: money.mark, inst });
    lastEmitAt = at;
    lastSameLine = false;
  };
  const moneyOnly = (line: string | undefined): boolean => {
    const m = line === undefined ? null : findMoney(line);
    return m !== null && descriptionText(line!.slice(0, m.index)) === '' && descriptionText(line!.slice(m.index + m.length)) === '';
  };
  const upper = (text: string) => /\p{L}/u.test(text) && !/\p{Ll}/u.test(text);
  const dropOrphans = () => {
    ignored += orphans.length;
    orphans = [];
  };
  /** A parcela numa linha só dela: é da descrição pendente logo acima ou do lançamento da linha de cima. */
  const attachInstallment = (inst: Installment, at: number): boolean => {
    const last = pending[pending.length - 1];
    if (last) {
      last.inst = inst;
      return true;
    }
    const entry = entries[entries.length - 1];
    if (entry && lastEmitAt === at - 1 && !entry.inst) {
      entry.inst = inst;
      return true;
    }
    return false;
  };
  const groupInst = (group: readonly Pending[]) => group.find((p) => p.inst)?.inst ?? null;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]!;
    let folded = fold(line);
    // Parcela sozinha numa linha ("3/4"), logo depois da descrição ou do lançamento.
    const aloneInst = INSTALLMENT_ALONE.exec(folded);
    const alone = aloneInst ? validInstallment(Number(aloneInst[1]), Number(aloneInst[2])) : null;
    if (alone && attachInstallment(alone, i)) continue;
    const lead = leadingDate(folded, today);
    if (lead) {
      currentDate = lead.date;
      line = line.slice(lead.length).trim();
      folded = folded.slice(lead.length).trim();
      if (descriptionText(line) === '' && findMoney(line) === null) {
        // Cabeçalho do dia: o que estava pendente ficou para trás (e um valor sem descrição, perdido).
        pending = pending.map((p) => ({ ...p, afterHeader: false }));
        dropOrphans();
        continue;
      }
    }
    if (SKIP.test(folded)) {
      if (/\bsaldo\b/.test(folded) && findMoney(line)) balance = true;
      pending = [];
      dropOrphans();
      continue;
    }
    let inst: Installment | null = null;
    const words = INSTALLMENT_WORDS.exec(folded);
    if (words) {
      inst = validInstallment(Number(words[1]), Number(words[2]));
      line = `${line.slice(0, words.index)} ${line.slice(words.index + words[0].length)}`.trim();
      folded = fold(line);
    }
    const money = findMoney(line);
    if (money) {
      const before = descriptionText(line.slice(0, money.index));
      const after = descriptionText(line.slice(money.index + money.length));
      // O texto depois do valor só serve de descrição quando nada está pendente ("R$ 80,50 Mercado").
      const here = before || (pending.length === 0 ? after : '');
      if (here !== '') {
        emit(here, money, currentDate, inst, i);
        lastSameLine = true;
        pending = [];
        continue;
      }
      // Valores seguidos, sem descrição na linha: casam com as descrições pendentes.
      const run: { money: Money; inst: Installment | null }[] = [{ money, inst }];
      while (i + 1 < lines.length) {
        const next = lines[i + 1]!;
        const nextMoney = findMoney(next);
        if (!nextMoney || descriptionText(next.slice(0, nextMoney.index)) !== '' || descriptionText(next.slice(nextMoney.index + nextMoney.length)) !== '') break;
        if (leadingDate(fold(next), today)) break;
        run.push({ money: nextMoney, inst: null });
        i++;
      }
      if (pending.length === 0) {
        for (const r of run) orphans.push({ money: r.money, date: currentDate });
        continue;
      }
      if (run.length === 1) {
        const recent = pending.filter((p) => p.afterHeader);
        const use = (recent.length > 0 ? recent : pending).slice(-3);
        emit(use.map((p) => p.text).join(' '), money, currentDate, inst ?? groupInst(use), i);
      } else {
        const k = run.length;
        const m = pending.length;
        if (m >= k) {
          const size = m % k === 0 ? m / k : 1;
          const start = m % k === 0 ? 0 : m - k;
          run.forEach((r, j) => {
            const group = pending.slice(start + j * size, start + (j + 1) * size);
            emit(group.map((p) => p.text).join(' '), r.money, group[0]!.date ?? currentDate, r.inst ?? groupInst(group), i);
          });
        } else {
          // Menos descrições que valores: as descrições casam com os primeiros valores, e os outros ficam de lado.
          run.forEach((r, j) => {
            const p = pending[j];
            if (p) emit(p.text, r.money, p.date ?? currentDate, r.inst ?? p.inst, i);
            else ignored++;
          });
        }
      }
      pending = [];
      continue;
    }
    const text = descriptionText(line);
    if (text === '') {
      if (inst) attachInstallment(inst, i);
      continue;
    }
    // A descrição comprida em maiúsculas, quebrada em duas linhas ("ENTRADA REND PAGO R$ 0,01" e "APLIC AUT APR"), continua o
    // lançamento de cima, se a linha seguinte não é um valor sozinho (que pediria esta linha como descrição).
    const previous = entries[entries.length - 1];
    if (previous && lastSameLine && lastEmitAt === i - 1 && !inst && !moneyOnly(lines[i + 1]) && upper(previous.description) && upper(text)) {
      previous.description = `${previous.description} ${text}`;
      lastEmitAt = i;
      continue;
    }
    if (orphans.length > 0) {
      const o = orphans.shift()!;
      emit(text, o.money, o.date ?? currentDate, inst, i);
      continue;
    }
    pending.push({ text, date: currentDate, afterHeader: true, inst });
    // Só as últimas linhas importam (descrição de duas ou três linhas); o resto é cabeçalho ou botão.
    if (pending.length > 12) pending = pending.slice(-12);
  }
  ignored += orphans.length;
  return { entries, ignored, lastDate: currentDate, balance };
}

/** Os prints parecem a fatura de um cartão (e não o extrato da conta)? */
function looksLikeCardStatement(texts: readonly string[]): boolean {
  const all = fold(texts.join('\n'));
  return /\bfatura\b/.test(all) && /\b(limite|vencimento|vence|fecha|fechamento|cartao)\b/.test(all) && !/\b(extrato|conta corrente|saldo em conta)\b/.test(all);
}

/**
 * Lê o texto de um ou mais prints (na ordem em que foram escolhidos) e devolve as linhas, como o PDF. `hint`: o destino já escolhido
 * ("Importar fatura" na tela do cartão); sem ele, as palavras dos prints dizem se é fatura ou extrato. null quando nenhum print tem
 * lançamento (data, descrição e valor).
 */
export function statementFromImageTexts(texts: readonly string[], today: IsoDate, hint: ImportDestination | null = null): ImportParse | null {
  const statement: ImportDestination = hint ?? (looksLikeCardStatement(texts) ? 'cartao' : 'conta');
  let ignored = 0;
  let balance = false;
  let lastDate: IsoDate | null = null;
  const perImage: Entry[][] = [];
  for (const text of texts) {
    const read = readImageText(text, today, lastDate);
    // Linhas do começo do print antes de qualquer data: sem print anterior, ficam com a primeira data que aparece depois nele.
    const firstDate = read.entries.find((e) => e.date !== null)?.date ?? null;
    const entries = read.entries.map((e) => ({ ...e, description: withInstallment(e.description, e.inst), date: e.date ?? firstDate }));
    ignored += read.ignored + entries.filter((e) => e.date === null).length;
    perImage.push(entries.filter((e) => e.date !== null));
    balance = balance || read.balance;
    lastDate = read.lastDate ?? lastDate;
  }
  // Prints que se sobrepõem: uma linha igual (dia, valor e descrição parecida) a uma de outro print entra uma vez só. Cada linha já
  // aceita cobre uma linha de cada um dos outros prints, para duas linhas iguais no mesmo print continuarem duas.
  const kept: { entry: Entry; image: number; claimed: Set<number> }[] = [];
  let repeated = 0;
  perImage.forEach((entries, image) => {
    for (const entry of entries) {
      const twin = kept.find(
        (k) =>
          k.image !== image &&
          !k.claimed.has(image) &&
          k.entry.date === entry.date &&
          k.entry.cents === entry.cents &&
          (normalizeDescription(k.entry.description) === normalizeDescription(entry.description) || similarDescriptions(k.entry.description, entry.description)),
      );
      if (twin) {
        twin.claimed.add(image);
        repeated++;
        continue;
      }
      kept.push({ entry, image, claimed: new Set() });
    }
  });
  if (kept.length === 0) return null;
  const unmarked = statement === 'conta' ? unmarkedDirection(kept.map((k) => k.entry.mark)) : null;
  const lines: ParsedLine[] = kept.slice(0, IMPORT_MAX_LINES).map(({ entry }, i) => ({
    ordinal: i + 1,
    date: entry.date!,
    description: entry.description,
    amountCents: signedByDirection(entry.cents, lineDirection(statement, statement === 'cartao' && entry.mark === 'mais' ? null : entry.mark, entry.description, unmarked)),
    fitId: null,
  }));
  return { source: 'imagem', statement, lines, ignored, balanceIgnored: balance, cardPositive: false, repeated };
}
