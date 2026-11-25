import type { IsoDate } from './dates';
import { daysBetween, formatDateBR, formatListDate, isValidIsoDate, parseDateBR } from './dates';
import type { Cents } from './money';
import { MAX_RECORD_CENTS, centsToInput, formatBRL, parseBRL } from './money';
import type { FinancialRecord } from './records';
import { recordMonth } from './records';
import { businessFlowOf } from './business';
import { charCount, ERROR_TEXT } from './validation';

/**
 * Espaço Negócio, D-122 (25/11/2026, a partir da pesquisa de 18/11, itens 3, 8 e 9 da lista priorizada; docs/52, seção 8): o dinheiro que
 * o negócio ainda vai receber ("A receber": o fiado, a venda no cartão que ainda vai cair e outros valores), as marcas da entrada (se teve
 * nota fiscal e quem pagou) e os lembretes do MEI (mei-reminders.ts). Leve, sem virar contabilidade, sem a Clarevo calcular imposto nem
 * dizer o que declarar: "Os valores são os que você anotou." Numa cor só, sem alerta: o que passou da data combinada é só um fato.
 *
 * Regras repetidas no banco (migração 0045, business_receivables): create_receivable, update_receivable, delete_receivable (só em aberto) e
 * receive_receivable, que grava uma entrada comum no negócio ligada ao "a receber" (financial_records.receivable_id). Excluir essa entrada
 * (delete_record de sempre) devolve o "a receber" para "aberto" (gatilho); ela não vira gasto (recebimento_ligado) nem muda de espaço
 * (lancamento_ligado). O "a receber" não entra em Entrou, Saiu nem em total nenhum: o dinheiro entra quando é recebido.
 *
 * Papéis do negócio compartilhado (D-120): quem só vê não anota; quem anota e vê altera e exclui o que anotou e recebe qualquer um; quem
 * administra altera tudo.
 */

// ---------------------------------------------------------------------------
// "A receber"
// ---------------------------------------------------------------------------

/** O que é: a venda no fiado, a venda no cartão (o dinheiro que ainda vai cair) ou outro valor. Os valores do banco. */
export type ReceivableKind = 'fiado' | 'cartao' | 'outro';
export const RECEIVABLE_KINDS: readonly ReceivableKind[] = ['fiado', 'cartao', 'outro'];
export type ReceivableStatus = 'aberto' | 'recebido';

/** As categorias de entrada do "a receber": as da operação (Vendas, Serviços e Outras entradas), na ordem do negócio. */
export const RECEIVABLE_CATEGORIES: readonly string[] = ['Vendas', 'Serviços', 'Outras entradas'];

/** Descrição de 1 a 80 caracteres e nome de quem deve (opcional) de 1 a 60, contados como o banco conta. */
export const RECEIVABLE_DESCRIPTION_MAX = 80;
export const RECEIVABLE_DEBTOR_MAX = 60;
/** A data combinada ou prevista fica entre 2000 e 2100 (data_invalida fora disso). */
export const RECEIVABLE_DATE_MIN: IsoDate = '2000-01-01';
export const RECEIVABLE_DATE_MAX: IsoDate = '2100-12-31';
/** Quantos recebidos (os mais recentes) a lista lê, além de todos os em aberto. */
export const RECEIVED_READ_LIMIT = 30;
/** Quantos recebidos a lista mostra, à parte. */
export const RECEIVED_SHOWN = 10;

/** A entrada que recebeu o "a receber" (lida da entrada viva ligada, sem cópia): o valor, a data e a conta. */
export interface ReceivableReceipt {
  recordId: string;
  amountCents: Cents;
  receivedOn: IsoDate;
  accountId: string;
}

export interface Receivable {
  id: string;
  contextId: string;
  kind: ReceivableKind;
  description: string;
  amountCents: Cents;
  /** A data combinada (fiado e outro) ou prevista (cartão). */
  expectedOn: IsoDate;
  category: string;
  /** Só o nome de quem deve, opcional (sem CPF nem outros dados). */
  debtor: string | null;
  status: ReceivableStatus;
  /** A entrada viva que recebeu, quando recebido (null em aberto, ou se a leitura da entrada falhou). */
  received: ReceivableReceipt | null;
  createdBy: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** O que a pessoa informa ao anotar ou editar um "a receber". */
export interface ReceivableInput {
  kind: ReceivableKind;
  description: string;
  amountCents: Cents;
  expectedOn: IsoDate;
  category: string;
  debtor: string | null;
}

/** O que a pessoa confirma em "Recebi": o valor (pode ser diferente), a data (até hoje) e a conta do negócio. */
export interface ReceiveInput {
  accountId: string;
  amountCents: Cents;
  receivedOn: IsoDate;
}

/** O que receive_receivable devolve: o "a receber" (agora recebido) e a entrada gravada. */
export interface ReceivableReceiveWrite {
  receivable: Receivable;
  record: FinancialRecord;
}

/** Ações gravadas em record_operations (migração 0045). Todas contam como anotação. */
export type ReceivableAction = 'criar_a_receber' | 'alterar_a_receber' | 'excluir_a_receber' | 'receber_a_receber';
export const RECEIVABLE_ACTIONS: readonly ReceivableAction[] = ['criar_a_receber', 'alterar_a_receber', 'excluir_a_receber', 'receber_a_receber'];

export function isReceivableKind(value: unknown): value is ReceivableKind {
  return typeof value === 'string' && (RECEIVABLE_KINDS as readonly string[]).includes(value);
}

export function isReceivableAction(action: string): action is ReceivableAction {
  return (RECEIVABLE_ACTIONS as readonly string[]).includes(action);
}

/** O nome de quem deve, sem os espaços das pontas; vazio vira nulo (como o banco, nullif(trim)). */
export function normalizeDebtor(value: string | null | undefined): string | null {
  const own = typeof value === 'string' ? value.trim() : '';
  return own === '' ? null : own;
}

/** Os campos aparados como o banco grava (descrição e nome de quem deve). */
export function normalizeReceivableInput(input: ReceivableInput): ReceivableInput {
  return {
    kind: input.kind,
    description: typeof input.description === 'string' ? input.description.trim() : '',
    amountCents: input.amountCents,
    expectedOn: input.expectedOn,
    category: input.category,
    debtor: normalizeDebtor(input.debtor),
  };
}

/** Códigos de recusa dos campos, na ordem do banco (clarevo_check_receivable). */
export type ReceivableFieldError = 'tipo_invalido' | 'descricao_invalida' | 'valor_invalido' | 'data_invalida' | 'categoria_invalida' | 'nome_invalido';

/** A mesma conferência do banco, já com os campos aparados: o primeiro erro, ou null. */
export function receivableInputError(input: ReceivableInput): ReceivableFieldError | null {
  if (!isReceivableKind(input.kind)) return 'tipo_invalido';
  const size = charCount(input.description ?? '');
  if (size < 1 || size > RECEIVABLE_DESCRIPTION_MAX) return 'descricao_invalida';
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 1 || input.amountCents > MAX_RECORD_CENTS) return 'valor_invalido';
  if (typeof input.expectedOn !== 'string' || !isValidIsoDate(input.expectedOn) || input.expectedOn < RECEIVABLE_DATE_MIN || input.expectedOn > RECEIVABLE_DATE_MAX) {
    return 'data_invalida';
  }
  if (!RECEIVABLE_CATEGORIES.includes(input.category)) return 'categoria_invalida';
  if (input.debtor !== null && (charCount(input.debtor) < 1 || charCount(input.debtor) > RECEIVABLE_DEBTOR_MAX)) return 'nome_invalido';
  return null;
}

/** O nome de quem deve só vale no fiado e em outro valor (o dinheiro do cartão vem da maquininha). */
export function receivableTakesDebtor(kind: ReceivableKind): boolean {
  return kind !== 'cartao';
}

// ---------------------------------------------------------------------------
// Formulários
// ---------------------------------------------------------------------------

/** O preenchimento do "a receber" (texto como a pessoa digita). */
export interface ReceivableDraft {
  kind: ReceivableKind | null;
  description: string;
  amountText: string;
  dateText: string;
  category: string | null;
  debtor: string;
}

export type ReceivableField = 'kind' | 'description' | 'amountText' | 'dateText' | 'category' | 'debtor';
/** Ordem dos campos na tela: o foco vai para o primeiro erro. */
export const RECEIVABLE_FIELD_ORDER: readonly ReceivableField[] = ['kind', 'description', 'amountText', 'dateText', 'category', 'debtor'];
export type ReceivableValidation = { ok: true; input: ReceivableInput } | { ok: false; errors: Partial<Record<ReceivableField, string>> };

/** O preenchimento de um "a receber" que já existe (para editar). */
export function receivableDraftOf(r: Pick<Receivable, 'kind' | 'description' | 'amountCents' | 'expectedOn' | 'category' | 'debtor'>): ReceivableDraft {
  return {
    kind: r.kind,
    description: r.description,
    amountText: centsToInput(r.amountCents),
    dateText: formatDateBR(r.expectedOn),
    category: r.category,
    debtor: r.debtor ?? '',
  };
}

/** Confere o preenchimento com as regras do banco. No cartão, o nome de quem deve não vai (fica nulo). */
export function validateReceivableDraft(d: ReceivableDraft): ReceivableValidation {
  const errors: Partial<Record<ReceivableField, string>> = {};
  if (d.kind === null || !isReceivableKind(d.kind)) errors.kind = RECEIVABLE_ERROR_TEXT.tipo_invalido;
  const description = d.description.trim();
  if (description === '' || charCount(description) > RECEIVABLE_DESCRIPTION_MAX) errors.description = RECEIVABLE_ERROR_TEXT.descricao_invalida;
  const amount = parseBRL(d.amountText);
  if (amount === null || amount <= 0) errors.amountText = ERROR_TEXT.valor_invalido;
  else if (amount > MAX_RECORD_CENTS) errors.amountText = ERROR_TEXT.valor_acima_do_limite;
  const expectedOn = parseDateBR(d.dateText);
  if (expectedOn === null || expectedOn < RECEIVABLE_DATE_MIN || expectedOn > RECEIVABLE_DATE_MAX) errors.dateText = RECEIVABLE_ERROR_TEXT.data_invalida;
  if (d.category === null || !RECEIVABLE_CATEGORIES.includes(d.category)) errors.category = RECEIVABLE_ERROR_TEXT.categoria_invalida;
  const debtor = d.kind !== null && receivableTakesDebtor(d.kind) ? normalizeDebtor(d.debtor) : null;
  if (debtor !== null && charCount(debtor) > RECEIVABLE_DEBTOR_MAX) errors.debtor = RECEIVABLE_ERROR_TEXT.nome_invalido;
  if (Object.keys(errors).length > 0 || d.kind === null || amount === null || expectedOn === null || d.category === null) return { ok: false, errors };
  return { ok: true, input: { kind: d.kind, description, amountCents: amount, expectedOn, category: d.category, debtor } };
}

/** O preenchimento de "Recebi". */
export interface ReceiveDraft {
  amountText: string;
  dateText: string;
  accountId: string;
}

export type ReceiveField = 'amountText' | 'dateText' | 'accountId';
export const RECEIVE_FIELD_ORDER: readonly ReceiveField[] = ['amountText', 'dateText', 'accountId'];
export type ReceiveValidation = { ok: true; input: ReceiveInput } | { ok: false; errors: Partial<Record<ReceiveField, string>> };

/** As regras de createRecord: valor de R$ 0,01 a R$ 9.999.999,99, data até hoje e a conta do negócio. */
export function validateReceiveDraft(d: ReceiveDraft, today: IsoDate): ReceiveValidation {
  const errors: Partial<Record<ReceiveField, string>> = {};
  const amount = parseBRL(d.amountText);
  if (amount === null || amount <= 0) errors.amountText = ERROR_TEXT.valor_invalido;
  else if (amount > MAX_RECORD_CENTS) errors.amountText = ERROR_TEXT.valor_acima_do_limite;
  const receivedOn = parseDateBR(d.dateText);
  if (receivedOn === null) errors.dateText = ERROR_TEXT.data_invalida;
  else if (receivedOn > today) errors.dateText = RECEIVABLE_ERROR_TEXT.data_futura;
  if (d.accountId.trim() === '') errors.accountId = ERROR_TEXT.conta_invalida;
  if (Object.keys(errors).length > 0 || amount === null || receivedOn === null) return { ok: false, errors };
  return { ok: true, input: { accountId: d.accountId, amountCents: amount, receivedOn } };
}

// ---------------------------------------------------------------------------
// Lista e resumo
// ---------------------------------------------------------------------------

/** Em aberto e ainda no prazo, na data de hoje, ou passou da data (só um fato, sem cor de alerta); recebido. */
export type ReceivableSituation = 'a_receber' | 'hoje' | 'passou' | 'recebido';

export function receivableSituation(r: Pick<Receivable, 'status' | 'expectedOn'>, today: IsoDate): ReceivableSituation {
  if (r.status === 'recebido') return 'recebido';
  if (r.expectedOn < today) return 'passou';
  return r.expectedOn === today ? 'hoje' : 'a_receber';
}

/** Em aberto, da data mais próxima para a mais distante (as que passaram da data primeiro); empate pela criação. */
export function openReceivables<T extends Pick<Receivable, 'status' | 'expectedOn' | 'createdAt' | 'id'>>(list: readonly T[]): T[] {
  return list
    .filter((r) => r.status === 'aberto')
    .sort((a, b) => a.expectedOn.localeCompare(b.expectedOn) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** Os recebidos, do mais recente para o mais antigo (pela data em que entrou o dinheiro), até `limit`. */
export function recentReceived<T extends Pick<Receivable, 'status' | 'received' | 'updatedAt' | 'id'>>(list: readonly T[], limit = RECEIVED_SHOWN): T[] {
  const on = (r: T) => r.received?.receivedOn ?? r.updatedAt.slice(0, 10);
  return list
    .filter((r) => r.status === 'recebido')
    .sort((a, b) => on(b).localeCompare(on(a)) || b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id))
    .slice(0, limit);
}

/** O cartão "A receber" de "Seu negócio": o total em aberto, quantos são, a próxima data e quantos passaram da data. */
export interface ReceivablesSummary {
  openCents: Cents;
  openCount: number;
  /** A data em aberto mais próxima de hoje em diante; sem nenhuma, a mais antiga das que passaram. */
  nextOn: IsoDate | null;
  pastCount: number;
}

export function receivablesSummary(list: readonly Pick<Receivable, 'status' | 'expectedOn' | 'amountCents'>[], today: IsoDate): ReceivablesSummary {
  const open = list.filter((r) => r.status === 'aberto');
  const coming = open.map((r) => r.expectedOn).filter((d) => d >= today).sort();
  const past = open.map((r) => r.expectedOn).filter((d) => d < today).sort();
  return {
    openCents: open.reduce((s, r) => s + r.amountCents, 0),
    openCount: open.length,
    nextOn: coming[0] ?? past[0] ?? null,
    pastCount: past.length,
  };
}

/** "combinada" no fiado e em outro valor; "prevista" no cartão (o dinheiro cai pela maquininha). */
const dateWord = (kind: ReceivableKind): string => (kind === 'cartao' ? 'prevista' : 'combinada');

/**
 * A legenda da linha: "Combinada para 15/10", "Prevista para hoje", "Passou da data combinada (05/10)" e "Recebido em 07/10". Numa cor só:
 * o que passou da data é só um fato.
 */
export function receivableDateText(r: Pick<Receivable, 'kind' | 'status' | 'expectedOn' | 'received'>, today: IsoDate): string {
  const situation = receivableSituation(r, today);
  if (situation === 'recebido') return r.received ? `Recebido em ${formatListDate(r.received.receivedOn, today)}` : 'Recebido';
  const word = dateWord(r.kind);
  if (situation === 'passou') return `Passou da data ${word} (${formatListDate(r.expectedOn, today)})`;
  if (situation === 'hoje') return `${word === 'prevista' ? 'Prevista' : 'Combinada'} para hoje`;
  return `${word === 'prevista' ? 'Prevista' : 'Combinada'} para ${formatListDate(r.expectedOn, today)}`;
}

/** A legenda inteira da linha: "Fiado · Ana · Combinada para 15/10" (o nome de quem deve, quando houver). */
export function receivableCaption(r: Pick<Receivable, 'kind' | 'status' | 'expectedOn' | 'received' | 'debtor'>, today: IsoDate): string {
  return [RECEIVABLE_KIND_SHORT[r.kind], r.debtor, receivableDateText(r, today)].filter((x): x is string => typeof x === 'string' && x !== '').join(' · ');
}

// ---------------------------------------------------------------------------
// Marcas da entrada do negócio: nota fiscal e quem pagou
// ---------------------------------------------------------------------------

/** Quem pagou: pessoa física, empresa ou exterior. Os valores do banco (financial_records.payer_kind). */
export type PayerKind = 'pf' | 'pj' | 'exterior';
export const PAYER_KINDS: readonly PayerKind[] = ['pf', 'pj', 'exterior'];

/** As duas marcas, opcionais (null = não marcado). Só em entrada do negócio. */
export interface RecordMarks {
  hasInvoice: boolean | null;
  payerKind: PayerKind | null;
}

export const NO_RECORD_MARKS: RecordMarks = { hasInvoice: null, payerKind: null };

export function isPayerKind(value: unknown): value is PayerKind {
  return typeof value === 'string' && (PAYER_KINDS as readonly string[]).includes(value);
}

/** As marcas de um lançamento (as ausentes contam como não marcadas). */
export function recordMarksOf(r: Pick<FinancialRecord, 'hasInvoice' | 'payerKind'>): RecordMarks {
  return { hasInvoice: typeof r.hasInvoice === 'boolean' ? r.hasInvoice : null, payerKind: isPayerKind(r.payerKind) ? r.payerKind : null };
}

export function hasAnyMark(m: RecordMarks): boolean {
  return m.hasInvoice !== null || m.payerKind !== null;
}

/** As marcas como o banco recebe em p_marks: {"has_invoice": true|false|null, "payer_kind": "pf"|"pj"|"exterior"|null}. */
export function marksPayload(m: RecordMarks): { has_invoice: boolean | null; payer_kind: PayerKind | null } {
  return { has_invoice: m.hasInvoice, payer_kind: m.payerKind };
}

/** Uma linha do resumo das marcas: o rótulo e o total das entradas. */
export interface MarkLine {
  key: string;
  label: string;
  cents: Cents;
}

/** As entradas da operação de um ano, por marca (com nota, sem nota e não marcado; de quem veio). */
export interface BusinessYearMarks {
  year: number;
  /** Há pelo menos uma entrada da operação no ano com alguma marca. */
  anyMarked: boolean;
  totalCents: Cents;
  invoice: MarkLine[];
  payer: MarkLine[];
}

/**
 * As entradas da operação do ano (o mesmo critério do "Resumo do ano": as que entram em Entrou, pelo mês em que contam), somadas pelas
 * marcas. Um lançamento repetido (o mesmo id em duas leituras) conta uma vez. Sem cálculo de imposto: só os totais anotados.
 */
export function businessYearMarks(records: readonly FinancialRecord[], contextId: string, year: number): BusinessYearMarks {
  const prefix = `${String(year).padStart(4, '0')}-`;
  const seen = new Set<string>();
  const inv = { sim: 0, nao: 0, sem: 0 };
  const pay = { pf: 0, pj: 0, exterior: 0, sem: 0 };
  let total = 0;
  let anyMarked = false;
  for (const r of records) {
    if (r.contextId !== contextId || r.status !== 'realizado' || r.kind !== 'receita' || seen.has(r.id)) continue;
    seen.add(r.id);
    if (!recordMonth(r).startsWith(prefix) || businessFlowOf(r) !== 'operacao') continue;
    const m = recordMarksOf(r);
    if (hasAnyMark(m)) anyMarked = true;
    total += r.amountCents;
    if (m.hasInvoice === true) inv.sim += r.amountCents;
    else if (m.hasInvoice === false) inv.nao += r.amountCents;
    else inv.sem += r.amountCents;
    if (m.payerKind) pay[m.payerKind] += r.amountCents;
    else pay.sem += r.amountCents;
  }
  const T = RECORD_MARKS_TEXT.year;
  return {
    year,
    anyMarked,
    totalCents: total,
    invoice: [
      { key: 'com_nota', label: T.withInvoice, cents: inv.sim },
      { key: 'sem_nota', label: T.withoutInvoice, cents: inv.nao },
      { key: 'nao_marcado', label: T.unmarked, cents: inv.sem },
    ],
    payer: [
      { key: 'pf', label: T.fromPf, cents: pay.pf },
      { key: 'pj', label: T.fromPj, cents: pay.pj },
      { key: 'exterior', label: T.fromAbroad, cents: pay.exterior },
      { key: 'nao_marcado', label: T.unmarked, cents: pay.sem },
    ],
  };
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

export const RECEIVABLE_KIND_LABEL: Readonly<Record<ReceivableKind, string>> = {
  fiado: 'Venda no fiado',
  cartao: 'Venda no cartão',
  outro: 'Outro valor a receber',
};

/** O tipo na legenda da linha. */
export const RECEIVABLE_KIND_SHORT: Readonly<Record<ReceivableKind, string>> = {
  fiado: 'Fiado',
  cartao: 'Cartão',
  outro: 'Outro valor',
};

export const RECEIVABLE_KIND_HINT: Readonly<Record<ReceivableKind, string>> = {
  fiado: 'Quem comprou vai pagar depois.',
  cartao: 'O dinheiro da venda no cartão ainda vai cair na conta.',
  outro: 'Qualquer outro valor que o negócio ainda vai receber.',
};

const valores = (n: number): string => (n === 1 ? '1 valor' : `${n} valores`);

export const RECEIVABLE_TEXT = {
  /** O cartão em "Seu negócio". */
  cardTitle: 'A receber',
  cardEmpty: 'Nada a receber anotado. Anote aqui a venda no fiado, a venda no cartão que ainda vai cair ou outro valor que o negócio vai receber.',
  openLabel: 'Em aberto',
  /** "3 valores · próxima data: 15/10"; com 1, "1 valor · data: 15/10". */
  cardCount: (count: number, nextOn: IsoDate | null, today: IsoDate): string =>
    `${valores(count)}${nextOn ? ` · ${count === 1 ? 'data' : 'próxima data'}: ${nextOn === today ? 'hoje' : formatListDate(nextOn, today)}` : ''}`,
  /** Quantos passaram da data, só como fato. */
  cardPast: (count: number): string => (count === 1 ? '1 passou da data.' : `${count} passaram da data.`),
  cardA11y: (cents: Cents, count: number): string => `A receber: ${formatBRL(cents)} em aberto, ${valores(count)}`,
  cardNote: 'Não entra em Entrou nem em Saiu: o dinheiro entra quando você marca como recebido.',
  cardOpen: 'Ver o que falta receber',
  add: 'Anotar valor a receber',
  /** A lista (/negocio/a-receber). */
  listTitle: 'A receber',
  listIntro:
    'O dinheiro que o negócio ainda vai receber: a venda no fiado, a venda no cartão que ainda vai cair e outros valores. Não entra em Entrou, Saiu nem nos totais. Quando o dinheiro entrar, toque em "Recebi".',
  openTitle: 'Em aberto',
  openEmpty: 'Nada em aberto.',
  totalLine: (cents: Cents): string => `Total em aberto: ${formatBRL(cents)}`,
  receivedTitle: 'Recebidos recentes',
  receivedNote: 'Cada um virou uma entrada no negócio, na data em que o dinheiro entrou.',
  rowA11y: (r: Pick<Receivable, 'description' | 'kind' | 'status' | 'expectedOn' | 'received' | 'debtor' | 'amountCents'>, today: IsoDate): string =>
    `${r.description}, ${receivableCaption(r, today).toLowerCase()}, ${formatBRL(r.received?.amountCents ?? r.amountCents)}`,
  rowHint: 'Abre o valor a receber',
  receive: 'Recebi',
  receiveA11y: (description: string, cents: Cents): string => `Recebi: ${description}, ${formatBRL(cents)}`,
  /** O formulário. */
  newTitle: 'Anotar valor a receber',
  editTitle: 'Editar valor a receber',
  kindLabel: 'O que é',
  descriptionLabel: 'Descrição',
  descriptionPlaceholder: (kind: ReceivableKind | null): string =>
    kind === 'cartao' ? 'Ex.: Vendas da feira no cartão' : kind === 'outro' ? 'Ex.: Serviço combinado' : 'Ex.: 10 sacolés',
  amountLabel: 'Valor em reais',
  dateLabel: (kind: ReceivableKind | null): string => (kind === 'cartao' ? 'Data prevista' : 'Data combinada'),
  dateHint: 'Digite só os números. Pode ser uma data que já passou.',
  categoryLabel: 'Categoria',
  debtorLabel: 'Quem deve (opcional)',
  debtorHint: 'Só o nome ou um apelido. Não escreva CPF, telefone nem outros dados da pessoa.',
  notCounted: 'Não entra em Entrou nem em Saiu até você marcar como recebido.',
  submitNew: 'Salvar',
  submitEdit: 'Salvar alterações',
  saved: 'Valor a receber salvo.',
  updated: 'Alterações salvas.',
  /** O detalhe. */
  detailTitle: 'Valor a receber',
  statusOpen: 'Em aberto',
  statusReceived: 'Recebido',
  rowKind: 'O que é',
  rowDate: (kind: ReceivableKind): string => (kind === 'cartao' ? 'Data prevista' : 'Data combinada'),
  rowCategory: 'Categoria',
  rowDebtor: 'Quem deve',
  rowStatus: 'Situação',
  rowReceivedOn: 'Recebido em',
  rowReceivedAmount: 'Valor recebido',
  detailReceivedNote: 'Virou uma entrada no negócio. Para desfazer, exclua a entrada: o valor volta para Em aberto.',
  openRecord: 'Ver a entrada',
  edit: 'Editar',
  remove: 'Excluir',
  removeTitle: 'Excluir este valor a receber?',
  removeBody: 'Ele sai da lista. Nada muda em Entrou nem em Saiu.',
  removed: 'Valor a receber excluído.',
  receivedOnly: 'Só o que está em aberto se altera ou se exclui.',
  /** "Recebi" (/negocio/a-receber/[id]/receber). */
  receiveTitle: 'Recebi',
  receiveIntro: 'Fica uma entrada comum no negócio, que conta pela data em que o dinheiro entrou.',
  receiveExpected: (r: Pick<Receivable, 'kind' | 'amountCents' | 'expectedOn'>): string =>
    `${r.kind === 'cartao' ? 'Previsto' : 'Combinado'}: ${formatBRL(r.amountCents)} para ${formatDateBR(r.expectedOn)}`,
  receiveAmountLabel: 'Valor recebido',
  receiveAmountHint: 'Pode ser diferente do combinado, por exemplo o que caiu depois da taxa do cartão.',
  receiveDateLabel: 'Data em que recebeu',
  receiveDateHint: 'Digite só os números. Só datas até hoje.',
  receiveAccountLabel: 'Entrou em',
  receiveSubmit: 'Confirmar recebimento',
  receiveDone: 'Recebido: a entrada foi anotada no negócio.',
  alreadyReceived: 'Este valor já foi marcado como recebido.',
  /** A entrada que veio de um "a receber" (detalhe do lançamento). */
  recordOrigin: 'Origem',
  recordOriginValue: 'A receber',
  recordNote: 'Esta entrada veio de um valor a receber, marcado como recebido. Ela continua entrada e fica no negócio. Excluir esta entrada devolve o valor para Em aberto.',
  recordSee: 'Ver o valor a receber',
  recordDeleteNote: 'O valor a receber ligado a esta entrada volta para Em aberto.',
  recordDeleted: 'Entrada excluída. O valor a receber voltou para Em aberto.',
  /** No editar da entrada ligada: a troca de tipo não aparece (a entrada de um "a receber" continua entrada). */
  kindLocked: 'Esta entrada veio de um valor a receber e continua entrada. Para desfazer o recebimento, exclua a entrada.',
  /** Quem só vê. */
  readOnly: 'Só vê. Não anota nem altera nada.',
  notAdvice: 'Os valores são os que você anotou.',
  loading: 'Carregando o que falta receber…',
  loadFailed: 'Não foi possível carregar o que falta receber. Tente de novo.',
  notFound: 'Este valor a receber não está mais disponível.',
  backToList: 'Ir para A receber',
} as const;

/** Textos de erro do "a receber" e das marcas (nomes do banco, migração 0045). */
export const RECEIVABLE_ERROR_TEXT = {
  tipo_invalido: 'Escolha o que é: venda no fiado, venda no cartão ou outro valor.',
  descricao_invalida: `Dê uma descrição de 1 a ${RECEIVABLE_DESCRIPTION_MAX} caracteres.`,
  valor_invalido: ERROR_TEXT.valor_invalido,
  valor_acima_do_limite: ERROR_TEXT.valor_acima_do_limite,
  data_invalida: 'Confira a data informada.',
  data_futura: 'Use uma data até hoje.',
  categoria_invalida: 'Escolha Vendas, Serviços ou Outras entradas.',
  nome_invalido: `Use até ${RECEIVABLE_DEBTOR_MAX} caracteres no nome.`,
  conta_invalida: ERROR_TEXT.conta_invalida,
  ja_recebido: 'Este valor já foi marcado como recebido. Atualize a tela.',
  versao_desatualizada: 'Este valor a receber mudou em outro aparelho. Confira e tente de novo.',
  nao_encontrado: 'Este valor a receber não está mais disponível. Atualize a tela.',
  sem_permissao: 'Só quem anotou este valor ou quem administra o negócio pode mudar isto.',
  recebimento_ligado: 'Esta entrada veio de um valor a receber e continua entrada. Para desfazer o recebimento, exclua a entrada.',
  lancamento_ligado: 'Esta entrada veio de um valor a receber e não muda de espaço.',
  marcas_invalidas: ERROR_TEXT.salvar_falhou,
  contexto_invalido: ERROR_TEXT.salvar_falhou,
  chave_reutilizada: ERROR_TEXT.salvar_falhou,
  assinatura_necessaria: ERROR_TEXT.assinatura_necessaria,
  rede: 'Sem conexão no momento. Tente de novo.',
  salvar_falhou: ERROR_TEXT.salvar_falhou,
} as const;

/** Texto de um erro do "a receber"; o que não é conhecido cai em "Não foi possível salvar...". */
export function receivableErrorText(code: string): string {
  return (RECEIVABLE_ERROR_TEXT as Record<string, string>)[code] ?? RECEIVABLE_ERROR_TEXT.salvar_falhou;
}

/** Os campos de onde vem cada recusa do banco (o erro fica junto do campo). */
export function receivableFieldOf(code: string): ReceivableField | null {
  switch (code) {
    case 'tipo_invalido':
      return 'kind';
    case 'descricao_invalida':
      return 'description';
    case 'valor_invalido':
    case 'valor_acima_do_limite':
      return 'amountText';
    case 'data_invalida':
      return 'dateText';
    case 'categoria_invalida':
      return 'category';
    case 'nome_invalido':
      return 'debtor';
    default:
      return null;
  }
}

export const PAYER_KIND_LABEL: Readonly<Record<PayerKind, string>> = {
  pf: 'Pessoa física',
  pj: 'Empresa',
  exterior: 'Exterior',
};

/** As marcas no formulário de entrada ("Mais detalhes"), no detalhe, no resumo do ano e na exportação. */
export const RECORD_MARKS_TEXT = {
  section: 'Mais detalhes (opcional)',
  sectionHint: 'Duas marcas para você se organizar. Não mudam nenhum total.',
  open: 'Mostrar mais detalhes',
  close: 'Recolher mais detalhes',
  invoiceLabel: 'Teve nota fiscal?',
  yes: 'Sim',
  no: 'Não',
  payerLabel: 'Quem pagou',
  unmarkHint: 'Toque de novo na opção marcada para desmarcar.',
  /** Detalhe do lançamento. */
  invoiceRow: 'Nota fiscal',
  invoiceRowValue: (v: boolean): string => (v ? 'Teve nota' : 'Sem nota'),
  payerRow: 'Quem pagou',
  /** Ao trocar para gasto, as marcas saem. */
  clearedOnExpense: 'As marcas de nota fiscal e de quem pagou saem ao trocar para saída.',
  /** Resumo do ano. */
  year: {
    title: 'Nota e quem pagou',
    intro: 'As entradas da operação do ano pelas marcas que você pôs em "Mais detalhes". Os valores são os que você anotou.',
    invoiceTitle: 'Nota fiscal',
    payerTitle: 'Quem pagou',
    withInvoice: 'Com nota',
    withoutInvoice: 'Sem nota',
    unmarked: 'Não marcado',
    fromPf: 'De pessoa física',
    fromPj: 'De empresa',
    fromAbroad: 'Do exterior',
  },
  /** Exportação (CSV do negócio). */
  csvInvoice: 'Nota fiscal',
  csvPayer: 'Quem pagou',
  csvYes: 'Sim',
  csvNo: 'Não',
} as const;

/** "Teve nota fiscal?" no detalhe e na exportação: "Teve nota", "Sem nota" ou nada. */
export function invoiceMarkText(m: RecordMarks): string | null {
  return m.hasInvoice === null ? null : RECORD_MARKS_TEXT.invoiceRowValue(m.hasInvoice);
}

/** Dias desde a data combinada (para os testes e a ordenação; nenhuma tela mostra a contagem de dias). */
export function daysPastExpected(r: Pick<Receivable, 'expectedOn'>, today: IsoDate): number {
  return Math.max(0, daysBetween(r.expectedOn, today));
}
