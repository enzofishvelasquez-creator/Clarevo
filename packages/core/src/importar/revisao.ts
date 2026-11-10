import { addDays, addMonths, isValidIsoDate, monthOf, type IsoDate, type IsoMonth } from '../dates';
import { MAX_RECORD_CENTS } from '../money';
import { CATEGORIES, nextMonthAllowed } from '../records';
import { DESCRIPTION_MAX } from '../validation';
import { invoiceMonthOf, type CardDays } from '../cards';
import { suggestCategory, type ImportMemory } from './categorias';
import { DUPLICATE_WINDOW_DAYS, findLookalikes, importKeys, installmentMark, normalizeDescription, type ExistingEntry, type InstallmentMark } from './dedupe';
import { IMPORT_TEXT } from './textos';
import { IMPORT_BATCH, type ImportDestination, type ImportItem, type ImportParse } from './tipos';
import { cleanDescription } from './valores';

/**
 * A tela "A revisar": das linhas lidas do arquivo às linhas que a pessoa confirma. Tudo puro (sem tela, sem rede): o tipo de cada
 * linha no destino escolhido, a categoria sugerida, a chave, as marcas ("Já anotado", "Parece pagamento de fatura", "Parece
 * transferência") e o que vem marcado para importar. Nada é gravado aqui.
 */

export type ReviewKind = 'despesa' | 'receita' | 'compra' | 'estorno' | 'pagamento';

/**
 * Marca da linha. As que impedem a importação (`importable` falso): pagamento_recebido (pagamento da fatura dentro da própria
 * fatura), data_futura, data_antiga, valor_alto, fatura_paga e ja_anotado por chave. As outras só vêm desmarcadas.
 */
export type ReviewLabel =
  | 'ja_anotado'
  | 'parcela'
  | 'pagamento_fatura'
  | 'transferencia'
  | 'pagamento_recebido'
  | 'data_futura'
  | 'data_antiga'
  | 'valor_alto'
  | 'fatura_paga';

export interface ReviewLine {
  id: string;
  ordinal: number;
  date: IsoDate;
  /** Editável; de 1 a 80 caracteres para importar. */
  description: string;
  /** Positivo. */
  amountCents: number;
  kind: ReviewKind;
  /** Editável; null = "Sem categoria". */
  category: string | null;
  categorySource: 'memoria' | 'regra' | null;
  /** import_key: calculada do arquivo, não muda se a pessoa edita a descrição. */
  key: string;
  label: ReviewLabel | null;
  /** Cartão, compra com a parcela escrita na descrição (D-089 B): entra com as parcelas que faltam. null nas outras linhas. */
  installment: InstallmentMark | null;
  /** Explicação própria da linha (a parcela e a fatura em que entra); null quando vale só a da marca. */
  hint: string | null;
  /** A chave já foi importada: o banco pularia a linha. */
  keyExists: boolean;
  /** A linha pode ser importada (não tem marca que a impede). */
  importable: boolean;
  include: boolean;
}

export interface ReviewInput {
  parse: ImportParse;
  destination: ImportDestination;
  /** A conta ou o cartão de destino. */
  targetId: string;
  today: IsoDate;
  /** A pessoa pediu para inverter entradas e saídas. */
  invertSigns: boolean;
  memory: ImportMemory;
  /** Registros que já existem no destino perto das datas do arquivo. */
  existing: readonly ExistingEntry[];
  /** Chaves do arquivo que o banco já tem (import_items). */
  importedKeys: ReadonlySet<string>;
  /** Cartão de destino: os dias e as faturas já pagas (mês do vencimento). */
  card?: { days: CardDays; paidMonths: ReadonlySet<IsoMonth> } | null;
}

const PAYS_INVOICE = /\b(pagamento|pagto|pgto|pag|liquidacao)\b.*\bfatura\b|\bfatura\b.*\bcartao\b|\bpag\w*\b.*\bcartao de credito\b|\bcartao de credito\b.*\bpag\w*\b/;
const OWN_TRANSFER = /\btransf\w*\b.*\b(propria|mesma titularidade|entre contas|mesmo titular)\b|\bmesma titularidade\b|\bentre contas\b|\bconta propria\b/;
const CARD_PAYMENT_LINE = /\b(pagamento|pagto|pgto|pag)\b|\bobrigado\b/;

/** Descrição de conta que parece o pagamento da fatura de um cartão (já tratado por Pagar fatura). */
export function looksLikeInvoicePayment(description: string): boolean {
  return PAYS_INVOICE.test(normalizeDescription(description));
}

/** Descrição que parece transferência entre contas do próprio titular (não é gasto). */
export function looksLikeOwnTransfer(description: string): boolean {
  return OWN_TRANSFER.test(normalizeDescription(description));
}

/** Linha de crédito dentro de uma fatura de cartão que é o pagamento da própria fatura. */
export function looksLikeCardPaymentLine(description: string): boolean {
  return CARD_PAYMENT_LINE.test(normalizeDescription(description));
}

/** Primeiro dia aceito para uma compra no cartão: o primeiro dia do mês, 48 meses antes do mês de hoje. */
export function oldestCardDate(today: IsoDate): IsoDate {
  return `${addMonths(monthOf(today), -48)}-01`;
}

function sign(input: ReviewInput): 1 | -1 {
  const flip = input.parse.cardPositive && input.destination === 'cartao';
  return flip !== input.invertSigns ? -1 : 1;
}

/** Tipo da linha no destino: conta (saída = despesa, entrada = receita) e cartão (saída = compra; entrada = estorno ou pagamento da fatura). */
export function kindOf(destination: ImportDestination, signedCents: number, description: string): ReviewKind {
  if (destination === 'conta') return signedCents < 0 ? 'despesa' : 'receita';
  if (signedCents < 0) return 'compra';
  return looksLikeCardPaymentLine(description) ? 'pagamento' : 'estorno';
}

/** Tipo de registro de uma linha (despesa ou receita) para escolher as categorias e comparar com o que já existe. */
function recordKind(kind: ReviewKind): 'despesa' | 'receita' {
  return kind === 'receita' ? 'receita' : 'despesa';
}

/**
 * Fatura em que entra a parcela escrita na linha (D-089 B). A data da linha costuma ser a da compra original: a parcela k cai k - 1
 * faturas depois da fatura natural dessa data. Se isso cair depois da fatura aberta do cartão (`openMonth`: a fatura em que entraria
 * uma compra feita hoje, `invoiceMonthOf(card, today)`), a linha trazia a data da cobrança, e não a da compra: a parcela entra na
 * fatura natural da própria data. O banco (import_records) aplica a mesma regra.
 */
export function installmentInvoiceMonth(firstMonth: IsoMonth, mark: InstallmentMark, openMonth: IsoMonth): IsoMonth {
  const target = addMonths(firstMonth, mark.number - 1);
  return target > openMonth ? firstMonth : target;
}

/**
 * A marca "k/n" também pode ser uma data sem ano (dia k do mês n) da semana anterior à data da linha, como "MERCADO 01/11" numa linha
 * de 02/11. Nesse caso a linha continua "Parcela em andamento", mas vem desmarcada, com a explicação de que pode ser só a data.
 */
export function markLooksLikeDate(mark: InstallmentMark, lineDate: IsoDate): boolean {
  if (mark.count < 1 || mark.count > 12) return false;
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = Number(lineDate.slice(0, 4));
  for (const y of [year, year - 1]) {
    const candidate = `${y}-${pad(mark.count)}-${pad(mark.number)}`;
    if (!isValidIsoDate(candidate) || candidate > lineDate) continue;
    return candidate >= addDays(lineDate, -7);
  }
  return false;
}

/** Monta as linhas da revisão, na ordem do arquivo. */

export function buildReview(input: ReviewInput): ReviewLine[] {
  const { parse, destination, today } = input;
  const s = sign(input);
  const oldest = oldestCardDate(today);
  const keys = importKeys(input.targetId, parse.lines);
  const partial = parse.lines.map((l, i) => {
    const signed = l.amountCents * s;
    const kind = kindOf(destination, signed, l.description);
    const amount = Math.abs(signed);
    return { l, kind, amount, key: keys[i]! };
  });
  // "Já anotado" por semelhança. As linhas cuja chave já existe também entram na conta: cada uma ocupa o registro que a importou,
  // para ele não marcar, por semelhança, outra linha igual que ainda não foi importada.
  const candidates = partial.map((p) => ({
    date: p.l.date,
    amountCents: p.amount,
    description: p.l.description,
    kind: p.kind as ExistingEntry['kind'],
    // Fatura com parcela na descrição ("LOJA 03/10"): compara com as parcelas das compras parceladas já anotadas.
    ...(destination === 'cartao' && p.kind === 'compra' && input.card
      ? { invoiceMonth: invoiceMonthOf(input.card.days, p.l.date), installment: installmentMark(p.l.description, p.l.date) }
      : {}),
  }));
  const similar = findLookalikes(
    candidates.map((c, i) => (partial[i]!.kind === 'pagamento' ? { ...c, amountCents: -1 } : c)),
    input.existing,
  );
  return partial.map((p, i): ReviewLine => {
    const { l, kind, amount, key } = p;
    const keyExists = input.importedKeys.has(key);
    const suggestion = kind === 'pagamento' ? { category: null, source: null } : suggestCategory(l.description, recordKind(kind), input.memory);
    let label: ReviewLabel | null = null;
    let importable = true;
    // A primeira marca que impede a importação é a que aparece.
    const block = (x: ReviewLabel) => {
      if (importable) {
        label = x;
        importable = false;
      }
    };
    if (kind === 'pagamento') block('pagamento_recebido');
    if (l.date > today) block('data_futura');
    // Cartão, compra com a parcela escrita (D-089 B): a parcela desta linha e as que faltam, da fatura em que ela entra em diante.
    const mark = destination === 'cartao' && kind === 'compra' ? installmentMark(l.description, l.date) : null;
    // Com "PARC" ou "PARCELA" antes, é parcela com certeza (installmentMark já aceita a data igual à da linha nesse caso).
    const maybeDate = mark !== null && !/PARC(?:ELA)?\.?\s*\d{1,2}\/\d{1,2}/i.test(l.description) && markLooksLikeDate(mark, l.date);
    let hint: string | null = null;
    if (destination === 'cartao' && (kind === 'compra' || kind === 'estorno') && input.card) {
      const natural = invoiceMonthOf(input.card.days, l.date);
      const first = mark ? installmentInvoiceMonth(natural, mark, invoiceMonthOf(input.card.days, today)) : natural;
      const months = mark ? Array.from({ length: mark.count - mark.number + 1 }, (_, i) => addMonths(first, i)) : [natural];
      if ((kind === 'compra' ? l.date < oldest : natural < monthOf(oldest)) && importable) block('data_antiga');
      else if (months.some((m) => input.card!.paidMonths.has(m)) && importable) block('fatura_paga');
      if (mark) hint = maybeDate ? IMPORT_TEXT.installmentOrDateHint(mark.number, mark.count) : IMPORT_TEXT.installmentHint(mark.number, mark.count, first);
    }
    if (amount > MAX_RECORD_CENTS && importable) block('valor_alto');
    if (keyExists && importable) block('ja_anotado');
    if (label === null && similar[i]) label = 'ja_anotado';
    if (label === null && destination === 'cartao' && kind === 'compra') {
      // Compra parcelada em andamento (D-089 B): entra marcada, com as parcelas que faltam. E uma linha de "pagamento" que o arquivo
      // trouxe como compra (planilha com o sinal trocado) é o pagamento da fatura.
      if (mark) label = 'parcela';
      else if (looksLikeCardPaymentLine(l.description)) label = 'pagamento_fatura';
    }
    if (label === null && destination === 'conta') {
      if (looksLikeInvoicePayment(l.description)) label = 'pagamento_fatura';
      else if (looksLikeOwnTransfer(l.description)) label = 'transferencia';
    }
    return {
      id: `l${l.ordinal}`,
      ordinal: l.ordinal,
      date: l.date,
      description: l.description,
      amountCents: amount,
      kind,
      category: suggestion.category,
      categorySource: suggestion.source,
      key,
      label,
      // A parcela vai junto também quando a linha está "Já anotado" por semelhança: marcada à mão, entra com as que faltam.
      installment: mark,
      hint: label === 'parcela' ? hint : null,
      keyExists,
      importable,
      // A marca que pode ser só a data (markLooksLikeDate) vem desmarcada: um clique não cria parcelas que não existem.
      include: importable && (label === null || (label === 'parcela' && !maybeDate)) && kind !== 'estorno',
    };
  });
}

// ---------------------------------------------------------------------------
// Edição da lista
// ---------------------------------------------------------------------------

/** Categorias que a linha aceita: as de gasto (também para compra e estorno) ou as de recebimento. */
export function categoriesFor(kind: ReviewKind): readonly string[] {
  return kind === 'receita' ? CATEGORIES.receita : kind === 'pagamento' ? [] : CATEGORIES.despesa;
}

/** A linha tem problema que impede importar? ('descricao' vazia ou longa demais.) Linha fora da seleção nunca bloqueia. */
export function lineProblem(line: Pick<ReviewLine, 'description' | 'include' | 'importable'>): 'descricao_obrigatoria' | 'descricao_longa' | null {
  if (!line.include || !line.importable) return null;
  const text = line.description.trim();
  if (text === '') return 'descricao_obrigatoria';
  if ([...text].length > DESCRIPTION_MAX) return 'descricao_longa';
  return null;
}

export function includedLines(lines: readonly ReviewLine[]): ReviewLine[] {
  return lines.filter((l) => l.include && l.importable);
}

/** "Selecionar tudo" marca as linhas que podem ser importadas (não as que têm marca que impede); "Limpar seleção" desmarca todas. */
export function setAll(lines: readonly ReviewLine[], include: boolean): ReviewLine[] {
  return lines.map((l) => ({ ...l, include: include && l.importable }));
}

export function allSelected(lines: readonly ReviewLine[]): boolean {
  const open = lines.filter((l) => l.importable);
  return open.length > 0 && open.every((l) => l.include);
}

export function updateLine(lines: readonly ReviewLine[], id: string, patch: Partial<Pick<ReviewLine, 'description' | 'category' | 'include'>>): ReviewLine[] {
  return lines.map((l) => (l.id === id ? { ...l, ...patch, include: patch.include === undefined ? l.include : patch.include && l.importable } : l));
}

/** As linhas escolhidas viram itens para o banco: descrição aparada (1 a 80) e categoria do app ou null. */
export function toImportItems(lines: readonly ReviewLine[]): ImportItem[] {
  return includedLines(lines).map((l) => ({
    importKey: l.key,
    kind: l.kind as ImportItem['kind'],
    amountCents: l.amountCents,
    occurredOn: l.date,
    description: cleanDescription(l.description) || l.description.trim(),
    category: l.category !== null && categoriesFor(l.kind).includes(l.category) ? l.category : null,
    // A parcela vai junto enquanto a descrição (talvez editada) ainda tem a marca: tirar "01/11" da descrição importa à vista.
    ...(l.kind === 'compra' && l.installment && installmentMark(l.description, l.date) !== null
      ? { installment: { number: l.installment.number, count: l.installment.count } }
      : {}),
  }));
}

/** Divide em lotes de até 500 (o limite de uma chamada). */
export function chunkItems<T>(items: readonly T[], size: number = IMPORT_BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Os meses (AAAA-MM) cujos registros precisam ser lidos para achar o que já existe: o de cada linha e os de 3 dias antes e depois dela. */
export function existingMonths(lines: readonly { date: IsoDate }[]): IsoMonth[] {
  const months = new Set<IsoMonth>();
  for (const l of lines) {
    months.add(monthOf(addDays(l.date, -DUPLICATE_WINDOW_DAYS)));
    months.add(monthOf(l.date));
    const last = addDays(l.date, DUPLICATE_WINDOW_DAYS);
    months.add(monthOf(last));
    // Um recebimento dos últimos dias do mês marcado "do mês seguinte" (D-089 A) é lido com o mês seguinte.
    if (nextMonthAllowed(last)) months.add(addMonths(monthOf(last), 1));
  }
  return [...months].sort();
}

/** Contagens para o resumo da tela. */
export function reviewCounts(lines: readonly ReviewLine[]): { total: number; included: number; alreadyNoted: number } {
  return {
    total: lines.length,
    included: includedLines(lines).length,
    alreadyNoted: lines.filter((l) => l.label === 'ja_anotado').length,
  };
}

/**
 * Quantas linhas "Já anotado" ficaram de fora da importação (não marcadas): entram no resumo final como "já estavam anotados".
 * `sentKeys`: chaves das linhas que lotes já gravados nesta importação enviaram; elas viram "Já anotado" quando a revisão é
 * refeita depois de uma recusa, mas já foram contadas como criadas (ou puladas) pelo banco, então não contam de novo.
 */
export function alreadyNotedLeftOut(lines: readonly ReviewLine[], sentKeys: ReadonlySet<string> = new Set()): number {
  return lines.filter((l) => l.label === 'ja_anotado' && !l.include && !sentKeys.has(l.key)).length;
}
