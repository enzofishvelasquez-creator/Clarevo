import type { Card, CardEntry, Commitment, FinancialAccount, FinancialRecord } from './records';
import { NO_CATEGORY_LABEL } from './records';
import type { IsoDate, IsoMonth } from './dates';
import { addMonths, formatDateBR, formatMonthBR, formatMonthSpanBR, monthOf } from './dates';
import type { Cents } from './money';
import { formatBRL } from './money';
import type { Invoice } from './cards';
import { loadInvoicesOfRecords } from './cards';
import type { RecordsRepository } from './repository';
import type { RecordSearchFilter } from './search';
import { searchRange } from './search';
import type { CategoryShare } from './summary';
import { categoryBreakdown, summarizeMonth } from './summary';
import { accountNameOf } from './accounts';

/**
 * Exportar meus dados (D-047, Ciclo H3; docs/08 §5 item 14). A pessoa leva os próprios gastos e recebimentos para uma planilha
 * (CSV) ou guarda um resumo em PDF. Regras puras: montagem das linhas, CSV (UTF-8 com BOM, ponto e vírgula, vírgula decimal,
 * datas dd/mm/aaaa, proteção contra injeção de fórmula), totais por mês iguais aos do Resumo e o HTML do PDF. Nada aqui grava.
 *
 * A leitura é a de sempre (a mesma da busca em Movimentos, D-045, com o limite maior): sem migração, sem função nova no
 * banco. O arquivo nunca leva a chave da nota fiscal, o número do cartão (só o final) nem identificadores internos, e só traz
 * registros do contexto Pessoal da própria pessoa. O app monta o arquivo no aparelho e não guarda cópia dele.
 */

/** Linhas lidas por exportação (lançamentos e compras no cartão juntos). Passou disso, a exportação pede um período menor. */
export const EXPORT_MAX_ROWS = 20_000;

/** Este mês, últimos 3, 6 ou 12 meses (o mês de hoje e os anteriores, inteiros), este ano, o ano passado ou tudo. */
export type ExportPeriod = 'mes' | '3m' | '6m' | '12m' | 'ano' | 'ano_passado' | 'tudo';
export const EXPORT_PERIODS: readonly ExportPeriod[] = ['mes', '3m', '6m', '12m', 'ano', 'ano_passado', 'tudo'];
export const DEFAULT_EXPORT_PERIOD: ExportPeriod = '12m';

export type ExportFormat = 'csv' | 'pdf';
export const EXPORT_FORMATS: readonly ExportFormat[] = ['csv', 'pdf'];
export const DEFAULT_EXPORT_FORMAT: ExportFormat = 'csv';

/** Tipo do lançamento no arquivo. O pagamento de uma fatura é um gasto só, na data do pagamento (D-037). */
export type ExportKind = 'gasto' | 'recebimento' | 'pagamento_fatura';
export const EXPORT_KIND_LABEL: Readonly<Record<ExportKind, string>> = {
  gasto: 'Gasto',
  recebimento: 'Recebimento',
  pagamento_fatura: 'Pagamento de fatura',
};

/** De onde veio o lançamento: anotado direto, pagamento de conta a pagar (avulsa, gasto fixo, parcelamento ou conta do ano) ou de fatura. */
export type ExportOrigin = 'anotado' | 'conta_a_pagar' | 'gasto_fixo' | 'parcelamento' | 'conta_do_ano' | 'fatura';
export const EXPORT_ORIGIN_LABEL: Readonly<Record<ExportOrigin, string>> = {
  anotado: 'Anotado',
  conta_a_pagar: 'Conta a pagar',
  gasto_fixo: 'Gasto fixo',
  parcelamento: 'Parcelamento',
  conta_do_ano: 'Conta do ano',
  fatura: 'Fatura',
};

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

export const EXPORT_TEXT = {
  /** Entrada em Conta. */
  entry: 'Exportar meus dados',
  entryHint: 'Planilha (CSV) ou resumo em PDF dos seus gastos e recebimentos',
  entryA11y: 'Exportar meus dados. Abre a tela para gerar uma planilha ou um resumo em PDF.',
  entryButton: 'Escolher período e formato',
  /** Tela. */
  title: 'Exportar meus dados',
  intro:
    'Leve seus gastos e recebimentos para uma planilha ou guarde um resumo em PDF. O arquivo é montado neste aparelho, com os registros que o app já lê. A Clarevo não guarda cópia dele.',
  portability: 'Poder levar seus dados com você se inspira na portabilidade prevista no art. 18, V, da LGPD. Esta tela não é parecer jurídico.',
  periodLabel: 'Período',
  periods: {
    mes: 'Este mês',
    '3m': 'Últimos 3 meses',
    '6m': 'Últimos 6 meses',
    '12m': 'Últimos 12 meses',
    ano: 'Este ano',
    ano_passado: 'Ano passado',
    tudo: 'Tudo',
  } as Readonly<Record<ExportPeriod, string>>,
  formatLabel: 'Formato',
  formats: { csv: 'Planilha (CSV)', pdf: 'Resumo em PDF' } as Readonly<Record<ExportFormat, string>>,
  formatHints: {
    csv: 'Abre no Excel e no Google Planilhas: datas como 31/12/2026, valores com vírgula e colunas separadas por ponto e vírgula.',
    pdf: 'Um resumo de cada mês, com Recebido, Pago, Diferença e Por categoria, e a lista de lançamentos.',
  } as Readonly<Record<ExportFormat, string>>,
  contentTitle: 'O que vai no arquivo',
  contentCsv:
    'Lançamentos: Data, Tipo, Descrição, Categoria, Valor (R$), Conta de origem e Origem. As compras no cartão vão em um segundo arquivo, à parte, porque o dinheiro só sai quando a fatura é paga.',
  contentPdf:
    'Resumo de cada mês e lista de lançamentos. As compras no cartão aparecem à parte e não entram em Pago, porque o dinheiro só sai quando a fatura é paga.',
  notIncluded: 'Ficam de fora a chave da nota fiscal, o número do cartão (só o final aparece) e os códigos internos da Clarevo. Só entram os seus registros do espaço Pessoal.',
  valuesNote: 'O arquivo mostra os valores, mesmo com Ocultar valores ligado.',
  sensitiveNote: 'O arquivo tem dados financeiros. Guarde-o e compartilhe só com quem você escolher.',
  prepare: 'Preparar arquivo',
  preparing: 'Preparando…',
  biometricPrompt: 'Confirme para exportar seus dados',
  biometricCancelled: 'Exportação cancelada. Nada foi gerado.',
  biometricFailed: 'Não foi possível confirmar agora. Nada foi gerado.',
  loadFailed: 'Não foi possível ler seus registros agora. Tente novamente.',
  tooMany: 'Este período tem mais de 20.000 linhas. Escolha um período menor.',
  emptyTitle: 'Nada para exportar',
  emptyBody: 'Não há gasto, recebimento nem compra no cartão neste período. Escolha outro período.',
  readyTitle: 'Arquivo pronto',
  readyHint: {
    web: 'Cada botão baixa um arquivo. Ele fica na pasta de downloads do navegador, e a Clarevo não guarda cópia.',
    native: 'Cada botão abre o compartilhamento do aparelho. A Clarevo não guarda cópia: o arquivo temporário é apagado na próxima exportação ou quando esta tela é aberta.',
  },
  readyCounts: (records: number, purchases: number): string => {
    const r = records === 1 ? '1 lançamento' : `${records} lançamentos`;
    if (purchases === 0) return r;
    return `${r} e ${purchases === 1 ? '1 compra no cartão' : `${purchases} compras no cartão`}`;
  },
  readyPeriod: (periodLabel: string): string => `Período: ${periodLabel}`,
  /** Botões do arquivo pronto: na web baixam, no aparelho compartilham. */
  fileButton: (file: ExportFileId, native: boolean): string => {
    const noun = file === 'lancamentos' ? 'lançamentos (CSV)' : file === 'compras' ? 'compras no cartão (CSV)' : 'resumo em PDF';
    if (file === 'resumo') return native ? `Compartilhar ${noun}` : 'Abrir para imprimir ou salvar em PDF';
    return `${native ? 'Compartilhar' : 'Baixar'} ${noun}`;
  },
  fileDone: {
    web: 'Pronto. Confira o arquivo na pasta de downloads.',
    native: 'Pronto. O arquivo temporário é apagado na próxima exportação ou quando esta tela é aberta.',
  },
  pdfOpened: 'A página de impressão foi aberta. Escolha "Salvar como PDF" ou imprima.',
  shareFailed: 'Não foi possível compartilhar o arquivo. Tente novamente.',
  shareUnavailable: 'Este aparelho não consegue compartilhar arquivos.',
  popupBlocked: 'O navegador bloqueou a janela de impressão. Permita janelas para este site e tente de novo.',
  newFile: 'Escolher outro período ou formato',
  /** PDF. */
  pdf: {
    /** Título da página (vira o nome sugerido ao salvar ou imprimir): sem barras nem espaços, como o nome do arquivo. */
    docTitle: (generatedOn: IsoDate): string => `clarevo-resumo-${generatedOn}`,
    heading: 'Resumo financeiro',
    period: (label: string, span: string): string => `Período: ${label} (${span})`,
    generated: (on: IsoDate): string => `Gerado em ${formatDateBR(on)}`,
    periodTotals: 'No período',
    received: 'Recebido',
    paid: 'Pago',
    difference: 'Diferença',
    byCategory: 'Por categoria',
    entries: 'Lançamentos',
    noEntries: 'Sem lançamentos neste mês.',
    purchasesTitle: 'Compras no cartão',
    purchasesNote:
      'Estas compras não entram em Pago: o dinheiro só sai quando a fatura é paga, e o pagamento da fatura já está nos lançamentos.',
    purchasesTotal: (count: number, cents: Cents): string => `${count === 1 ? '1 compra' : `${count} compras`} · ${formatBRL(cents)} no total das compras`,
    differenceNote: 'A diferença é Recebido menos Pago. Não é saldo da conta nem dinheiro disponível.',
    footer: 'Gerado pela Clarevo neste aparelho, com os valores que você anotou. Este arquivo tem dados financeiros: guarde-o e compartilhe só com quem você escolher.',
    columns: { date: 'Data', type: 'Tipo', description: 'Descrição', category: 'Categoria', account: 'Conta', value: 'Valor', card: 'Cartão', installments: 'Parcelas', total: 'Valor total', share: '%' },
  },
} as const;

// ---------------------------------------------------------------------------
// Período e filtro
// ---------------------------------------------------------------------------

/** Primeiro e último dia do período (null = sem limite). Os últimos N meses incluem o mês de hoje e os N-1 anteriores, inteiros. */
export function exportRange(period: ExportPeriod, today: IsoDate): { from: IsoDate | null; to: IsoDate | null } {
  if (period === 'mes') return { from: `${monthOf(today)}-01`, to: null };
  return searchRange(period, today);
}

/** O filtro da leitura: só o período (todos os tipos, categorias, contas e valores). */
export function exportFilterOf(period: ExportPeriod, today: IsoDate): RecordSearchFilter {
  const { from, to } = exportRange(period, today);
  return { from, to, kind: null, category: null, accountId: null, minCents: null, maxCents: null, terms: [] };
}

/**
 * Os meses do resumo, do mais antigo ao mais novo. O fim é o mês de hoje (ou o fim do período, se for antes); "Tudo" começa no
 * mês do registro mais antigo ou da compra no cartão mais antiga, o que vier primeiro. Meses sem lançamento ficam na lista, como o
 * Resumo mostra um mês vazio.
 */
export function exportMonths(
  period: ExportPeriod,
  today: IsoDate,
  records: readonly Pick<FinancialRecord, 'occurredOn'>[],
  purchases: readonly Pick<CardEntry, 'kind' | 'purchasedOn'>[] = [],
): IsoMonth[] {
  const { from, to } = exportRange(period, today);
  const recordMonths = records.map((r) => monthOf(r.occurredOn)).sort();
  const purchaseMonths = purchases.flatMap((e) => (e.kind === 'compra' && e.purchasedOn !== null ? [monthOf(e.purchasedOn)] : [])).sort();
  const current = monthOf(today);
  let start = from ? monthOf(from) : ([recordMonths[0], purchaseMonths[0]].filter((m): m is IsoMonth => !!m).sort()[0] ?? current);
  let end = to && monthOf(to) < current ? monthOf(to) : current;
  const latest = recordMonths[recordMonths.length - 1];
  if (latest && latest > end) end = latest;
  if (start > end) start = end;
  const months: IsoMonth[] = [];
  for (let m = start; m <= end; m = addMonths(m, 1)) months.push(m);
  return months;
}

// ---------------------------------------------------------------------------
// Linhas
// ---------------------------------------------------------------------------

export interface ExportRow {
  date: IsoDate;
  kind: ExportKind;
  description: string;
  /** "Sem categoria" quando não há. */
  category: string;
  amountCents: Cents;
  /** Nome da conta de origem; vazio se a conta não é conhecida. */
  account: string;
  origin: ExportOrigin;
}

export interface ExportPurchaseRow {
  date: IsoDate;
  /** "Apelido (final 1234)"; vazio se o cartão não é conhecido. */
  card: string;
  description: string;
  category: string;
  /** Valor total da compra (não a parcela de cada mês). */
  totalCents: Cents;
  installments: number;
}

export interface ExportContext {
  accounts: readonly Pick<FinancialAccount, 'id' | 'name' | 'status'>[];
  cards: readonly Pick<Card, 'id' | 'name' | 'lastDigits'>[];
  /** Contas a pagar que os gastos quitaram, pelo id: dizem se o gasto veio de um gasto fixo, parcelamento ou conta do ano. */
  commitments: ReadonlyMap<string, Pick<Commitment, 'series'>>;
}

export function recordKindOf(record: Pick<FinancialRecord, 'kind' | 'invoice'>): ExportKind {
  if (record.kind === 'receita') return 'recebimento';
  return record.invoice ? 'pagamento_fatura' : 'gasto';
}

export function recordOriginOf(record: Pick<FinancialRecord, 'invoice' | 'commitmentId'>, commitments: ExportContext['commitments']): ExportOrigin {
  if (record.invoice) return 'fatura';
  if (!record.commitmentId) return 'anotado';
  const series = commitments.get(record.commitmentId)?.series ?? null;
  if (!series) return 'conta_a_pagar';
  return series.kind === 'mensal' ? 'gasto_fixo' : series.kind === 'parcelada' ? 'parcelamento' : 'conta_do_ano';
}

/** "Apelido (final 1234)" ou "Apelido". Nunca o número do cartão: o app só guarda os 4 últimos dígitos. */
export function exportCardLabel(card: Pick<Card, 'name' | 'lastDigits'>): string {
  return card.lastDigits ? `${card.name} (final ${card.lastDigits})` : card.name;
}

const createdAtMs = (iso: string): number => {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
};

/** Do mais antigo ao mais novo: data, criação, id (a ordem de uma planilha). */
function oldestFirst(a: FinancialRecord, b: FinancialRecord): number {
  return a.occurredOn.localeCompare(b.occurredOn) || createdAtMs(a.createdAt) - createdAtMs(b.createdAt) || a.id.localeCompare(b.id);
}

export function exportRows(records: readonly FinancialRecord[], ctx: ExportContext): ExportRow[] {
  return [...records].sort(oldestFirst).map((r) => ({
    date: r.occurredOn,
    kind: recordKindOf(r),
    description: r.description,
    category: r.category ?? NO_CATEGORY_LABEL,
    amountCents: r.amountCents,
    account: accountNameOf(ctx.accounts, r.accountId) ?? '',
    origin: recordOriginOf(r, ctx.commitments),
  }));
}

export function exportPurchaseRows(entries: readonly CardEntry[], ctx: Pick<ExportContext, 'cards'>): ExportPurchaseRow[] {
  return entries
    .filter((e) => e.kind === 'compra' && e.purchasedOn !== null)
    .sort((a, b) => a.purchasedOn!.localeCompare(b.purchasedOn!) || createdAtMs(a.createdAt) - createdAtMs(b.createdAt) || a.id.localeCompare(b.id))
    .map((e) => {
      const card = ctx.cards.find((c) => c.id === e.cardId);
      return {
        date: e.purchasedOn!,
        card: card ? exportCardLabel(card) : '',
        description: e.description ?? '',
        category: e.category ?? NO_CATEGORY_LABEL,
        totalCents: e.amountCents,
        installments: e.installments,
      };
    });
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** Marca de ordem de bytes UTF-8: o Excel só lê os acentos certos com ela. */
export const CSV_BOM = '﻿';
export const CSV_SEPARATOR = ';';
/** Fim de linha do Excel. */
export const CSV_EOL = '\r\n';

export const CSV_RECORD_HEADER: readonly string[] = ['Data', 'Tipo', 'Descrição', 'Categoria', 'Valor (R$)', 'Conta de origem', 'Origem'];
export const CSV_PURCHASE_HEADER: readonly string[] = ['Data da compra', 'Cartão', 'Descrição', 'Categoria', 'Valor total (R$)', 'Parcelas'];

/**
 * Protege contra injeção de fórmula: texto que começa com =, +, -, @, tabulação, retorno de linha ou quebra de linha, ou que tem
 * só espaços (inclusive o espaço sem quebra) antes de um desses sinais, ganha um apóstrofo na frente, e a planilha o mostra como
 * texto. A conferência vem antes de achatar as quebras de linha, para não perder o começo do texto. Depois, as quebras de linha
 * viram espaço (cada lançamento fica numa linha só).
 */
export function csvText(value: string): string {
  const risky = /^[\s\u00a0]*[=+\-@]|^[\t\r\n]/.test(value);
  const flat = value.replace(/[\r\n]+/g, ' ');
  return risky ? `'${flat}` : flat;
}

/** Entre aspas quando há ponto e vírgula, aspas ou quebra de linha; as aspas internas dobram. */
export function csvCell(value: string): string {
  return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** 123456 → "1234,56": sem "R$" e sem ponto de milhar, para a planilha reconhecer um número. */
export function csvAmount(cents: Cents): string {
  const abs = Math.abs(cents);
  return `${cents < 0 ? '-' : ''}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

const csvLine = (cells: readonly string[]): string => cells.map(csvCell).join(CSV_SEPARATOR);

/** O CSV de lançamentos: BOM, cabeçalho e uma linha por lançamento, do mais antigo ao mais novo. */
export function buildRecordsCsv(rows: readonly ExportRow[]): string {
  const lines = [
    csvLine(CSV_RECORD_HEADER),
    ...rows.map((r) =>
      csvLine([
        formatDateBR(r.date),
        EXPORT_KIND_LABEL[r.kind],
        csvText(r.description),
        csvText(r.category),
        csvAmount(r.amountCents),
        csvText(r.account),
        EXPORT_ORIGIN_LABEL[r.origin],
      ]),
    ),
  ];
  return CSV_BOM + lines.join(CSV_EOL) + CSV_EOL;
}

/** O CSV das compras no cartão (valor total e parcelas): BOM, cabeçalho e uma linha por compra. */
export function buildPurchasesCsv(rows: readonly ExportPurchaseRow[]): string {
  const lines = [
    csvLine(CSV_PURCHASE_HEADER),
    ...rows.map((r) =>
      csvLine([formatDateBR(r.date), csvText(r.card), csvText(r.description), csvText(r.category), csvAmount(r.totalCents), String(r.installments)]),
    ),
  ];
  return CSV_BOM + lines.join(CSV_EOL) + CSV_EOL;
}

// ---------------------------------------------------------------------------
// Resumo por mês (iguais aos do Resumo) e relatório
// ---------------------------------------------------------------------------

export interface ExportSource {
  contextId: string;
  period: ExportPeriod;
  today: IsoDate;
  records: readonly FinancialRecord[];
  purchases: readonly CardEntry[];
  accounts: readonly Pick<FinancialAccount, 'id' | 'name' | 'status'>[];
  cards: readonly Pick<Card, 'id' | 'name' | 'lastDigits'>[];
  commitments: ReadonlyMap<string, Pick<Commitment, 'series'>>;
  /** Faturas dos pagamentos de fatura, para dividir Pago por categoria como o Resumo faz (vazio: o gasto fica na categoria dele). */
  invoices: readonly Pick<Invoice, 'cardId' | 'month' | 'mix'>[];
}

export interface ExportMonth {
  month: IsoMonth;
  receivedCents: Cents;
  paidCents: Cents;
  differenceCents: Cents;
  categories: CategoryShare[];
  rows: ExportRow[];
}

export interface ExportReport {
  periodLabel: string;
  /** "de novembro de 2025 a outubro de 2026" */
  periodSpan: string;
  generatedOn: IsoDate;
  months: ExportMonth[];
  totals: { receivedCents: Cents; paidCents: Cents; differenceCents: Cents };
  purchases: ExportPurchaseRow[];
  purchasesTotalCents: Cents;
}

/**
 * Relatório do PDF. Recebido, Pago e Diferença de cada mês vêm de `summarizeMonth` e Por categoria de `categoryBreakdown`, as mesmas
 * contas do Resumo; por isso os totais do mês são iguais aos que o Resumo mostra. A soma do período é a soma dos meses.
 */
export function buildExportReport(source: ExportSource): ExportReport {
  const ctx: ExportContext = { accounts: source.accounts, cards: source.cards, commitments: source.commitments };
  const months = exportMonths(source.period, source.today, source.records, source.purchases);
  const rows = exportRows(source.records, ctx);
  const built: ExportMonth[] = months.map((month) => {
    const summary = summarizeMonth(source.records, source.contextId, month);
    return {
      month,
      receivedCents: summary.receivedCents,
      paidCents: summary.paidCents,
      differenceCents: summary.differenceCents,
      categories: categoryBreakdown(summary.composition.paid, source.invoices),
      rows: rows.filter((r) => monthOf(r.date) === month),
    };
  });
  const receivedCents = built.reduce((acc, m) => acc + m.receivedCents, 0);
  const paidCents = built.reduce((acc, m) => acc + m.paidCents, 0);
  const purchases = exportPurchaseRows(source.purchases, ctx);
  const first = months[0]!;
  const last = months[months.length - 1]!;
  return {
    periodLabel: EXPORT_TEXT.periods[source.period],
    periodSpan: formatMonthSpanBR(first, last),
    generatedOn: source.today,
    months: built,
    totals: { receivedCents, paidCents, differenceCents: receivedCents - paidCents },
    purchases,
    purchasesTotalCents: purchases.reduce((acc, p) => acc + p.totalCents, 0),
  };
}

// ---------------------------------------------------------------------------
// HTML do PDF
// ---------------------------------------------------------------------------

/** Escapa texto para HTML (descrições são da pessoa). */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** A folha de estilo da página de impressão (A4, logotipo e tabelas). O relatório do RH (D-062) usa a mesma. */
export const PDF_STYLE = `
@page { size: A4; margin: 14mm; }
* { box-sizing: border-box; }
body { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #17223B; font-size: 11px; line-height: 1.4; margin: 0; }
header.top { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #2457F5; padding-bottom: 8px; margin-bottom: 12px; }
.logo { font-size: 26px; font-weight: 800; color: #2457F5; letter-spacing: -0.04em; line-height: 1; }
.logo .dot { color: #D4F05B; }
.logo svg { display: block; height: 26px; width: auto; }
h1 { font-size: 16px; margin: 0 0 2px; }
.meta { color: #4B5873; font-size: 11px; text-align: right; }
h2 { font-size: 14px; margin: 18px 0 6px; color: #2457F5; break-after: avoid; }
h3 { font-size: 11px; margin: 10px 0 4px; text-transform: none; break-after: avoid; }
table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
th { text-align: left; font-weight: 700; border-bottom: 1px solid #7D8AA6; padding: 3px 4px; }
td { border-bottom: 1px solid #E3E8F2; padding: 3px 4px; vertical-align: top; }
tr { break-inside: avoid; }
.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.sum td, .sum th { font-size: 12px; }
.sum td { font-weight: 700; }
.note { color: #4B5873; font-size: 10px; margin: 4px 0; }
.empty { color: #4B5873; margin: 4px 0; }
section.month { break-inside: auto; }
@media screen { body { max-width: 820px; margin: 0 auto; padding: 16px; } }
footer { margin-top: 18px; padding-top: 8px; border-top: 1px solid #E3E8F2; color: #4B5873; font-size: 10px; }
`;

const money = (cents: Cents): string => escapeHtml(formatBRL(cents));

function summaryTable(received: Cents, paid: Cents, difference: Cents): string {
  const t = EXPORT_TEXT.pdf;
  return `<table class="sum"><thead><tr><th>${t.received}</th><th>${t.paid}</th><th>${t.difference}</th></tr></thead><tbody><tr><td>${money(received)}</td><td>${money(paid)}</td><td>${money(difference)}</td></tr></tbody></table>`;
}

function monthHtml(m: ExportMonth): string {
  const t = EXPORT_TEXT.pdf;
  const c = t.columns;
  // Mês sem lançamento: uma linha só (os totais são zero e entram na soma do período), para o PDF não crescer com meses vazios.
  if (m.rows.length === 0) return `<section class="month"><h2>${escapeHtml(formatMonthBR(m.month))}</h2><p class="empty">${t.noEntries}</p></section>`;
  const categories = m.categories.length
    ? `<h3>${t.byCategory}</h3><table><thead><tr><th>${c.category}</th><th class="num">${c.value}</th><th class="num">${c.share}</th></tr></thead><tbody>${m.categories
        .map((s) => `<tr><td>${escapeHtml(s.label)}</td><td class="num">${money(s.cents)}</td><td class="num">${escapeHtml(s.percentText)}</td></tr>`)
        .join('')}</tbody></table>`
    : '';
  const entries = m.rows.length
    ? `<h3>${t.entries}</h3><table><thead><tr><th>${c.date}</th><th>${c.type}</th><th>${c.description}</th><th>${c.category}</th><th>${c.account}</th><th class="num">${c.value}</th></tr></thead><tbody>${m.rows
        .map(
          (r) =>
            `<tr><td>${formatDateBR(r.date)}</td><td>${EXPORT_KIND_LABEL[r.kind]}</td><td>${escapeHtml(r.description)}</td><td>${escapeHtml(r.category)}</td><td>${escapeHtml(r.account)}</td><td class="num">${money(r.amountCents)}</td></tr>`,
        )
        .join('')}</tbody></table>`
    : `<p class="empty">${t.noEntries}</p>`;
  return `<section class="month"><h2>${escapeHtml(formatMonthBR(m.month))}</h2>${summaryTable(m.receivedCents, m.paidCents, m.differenceCents)}${categories}${entries}</section>`;
}

function purchasesHtml(report: ExportReport): string {
  if (report.purchases.length === 0) return '';
  const t = EXPORT_TEXT.pdf;
  const c = t.columns;
  return `<section class="month"><h2>${t.purchasesTitle}</h2><p class="note">${t.purchasesNote}</p><p class="note">${escapeHtml(t.purchasesTotal(report.purchases.length, report.purchasesTotalCents))}</p><table><thead><tr><th>${c.date}</th><th>${c.card}</th><th>${c.description}</th><th>${c.category}</th><th class="num">${c.installments}</th><th class="num">${c.total}</th></tr></thead><tbody>${report.purchases
    .map(
      (p) =>
        `<tr><td>${formatDateBR(p.date)}</td><td>${escapeHtml(p.card)}</td><td>${escapeHtml(p.description)}</td><td>${escapeHtml(p.category)}</td><td class="num">${p.installments}</td><td class="num">${money(p.totalCents)}</td></tr>`,
    )
    .join('')}</tbody></table></section>`;
}

/**
 * O documento HTML do resumo em PDF, com o logotipo "clarevo." e a data de geração. `logoSvg`: o logotipo oficial em SVG (o app o
 * monta com os caminhos de `docs/marca`); sem ele, o nome em texto com o ponto lima. Mesmo HTML no celular (expo-print) e na web
 * (página de impressão).
 */
export function exportReportHtml(report: ExportReport, options: { logoSvg?: string } = {}): string {
  const t = EXPORT_TEXT.pdf;
  const logo = options.logoSvg
    ? `<div class="logo" role="img" aria-label="Clarevo">${options.logoSvg}</div>`
    : `<div class="logo" role="img" aria-label="Clarevo">clarevo<span class="dot">.</span></div>`;
  const totals =
    report.months.length > 1
      ? `<section><h2>${t.periodTotals}</h2>${summaryTable(report.totals.receivedCents, report.totals.paidCents, report.totals.differenceCents)}</section>`
      : '';
  return [
    '<!doctype html>',
    '<html lang="pt-BR"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(t.docTitle(report.generatedOn))}</title>`,
    `<style>${PDF_STYLE}</style></head><body>`,
    `<header class="top">${logo}<div class="meta"><h1>${t.heading}</h1><div>${escapeHtml(t.period(report.periodLabel, report.periodSpan))}</div><div>${escapeHtml(t.generated(report.generatedOn))}</div></div></header>`,
    totals,
    ...report.months.map(monthHtml),
    purchasesHtml(report),
    `<p class="note">${t.differenceNote}</p>`,
    `<footer>${t.footer}</footer>`,
    '</body></html>',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Arquivos
// ---------------------------------------------------------------------------

export type ExportFileId = 'lancamentos' | 'compras' | 'resumo';

/** O que a entrega do arquivo precisa (CSV baixado ou HTML da página de impressão): o relatório do RH (D-062) usa o mesmo caminho. */
export type ExportDeliverable = Pick<ExportFile, 'fileName' | 'mime' | 'kind' | 'content'>;

export interface ExportFile {
  id: ExportFileId;
  /** Nome do arquivo, só com letras sem acento, números e hífen: "clarevo-lancamentos-2026-10-11.csv". */
  fileName: string;
  mime: string;
  kind: ExportFormat;
  /** CSV: o texto com BOM. PDF: o HTML que vira o PDF. */
  content: string;
}

export interface ExportFiles {
  files: ExportFile[];
  recordCount: number;
  purchaseCount: number;
  periodLabel: string;
  /** Sem lançamento nem compra no período: nenhum arquivo. */
  empty: boolean;
}

export function exportFileName(id: ExportFileId, today: IsoDate): string {
  const base = id === 'lancamentos' ? 'clarevo-lancamentos' : id === 'compras' ? 'clarevo-compras-no-cartao' : 'clarevo-resumo';
  return `${base}-${today}.${id === 'resumo' ? 'pdf' : 'csv'}`;
}

/**
 * Monta o que a pessoa leva. CSV: o arquivo de lançamentos e, havendo compras no cartão, o das compras. PDF: o resumo (HTML).
 * Sem lançamento nem compra, nenhum arquivo (`empty`).
 */
export function buildExportFiles(source: ExportSource, format: ExportFormat, options: { logoSvg?: string } = {}): ExportFiles {
  const periodLabel = EXPORT_TEXT.periods[source.period];
  const recordCount = source.records.length;
  const purchaseCount = source.purchases.filter((e) => e.kind === 'compra' && e.purchasedOn !== null).length;
  const base = { recordCount, purchaseCount, periodLabel };
  if (recordCount === 0 && purchaseCount === 0) return { ...base, files: [], empty: true };
  const ctx: ExportContext = { accounts: source.accounts, cards: source.cards, commitments: source.commitments };
  if (format === 'pdf') {
    const html = exportReportHtml(buildExportReport(source), options);
    return { ...base, empty: false, files: [{ id: 'resumo', fileName: exportFileName('resumo', source.today), mime: 'application/pdf', kind: 'pdf', content: html }] };
  }
  const files: ExportFile[] = [];
  if (recordCount > 0)
    files.push({
      id: 'lancamentos',
      fileName: exportFileName('lancamentos', source.today),
      mime: 'text/csv;charset=utf-8',
      kind: 'csv',
      content: buildRecordsCsv(exportRows(source.records, ctx)),
    });
  if (purchaseCount > 0)
    files.push({
      id: 'compras',
      fileName: exportFileName('compras', source.today),
      mime: 'text/csv;charset=utf-8',
      kind: 'csv',
      content: buildPurchasesCsv(exportPurchaseRows(source.purchases, ctx)),
    });
  return { ...base, empty: false, files };
}

// ---------------------------------------------------------------------------
// Biometria e leitura
// ---------------------------------------------------------------------------

/**
 * Com "Pedir biometria ao abrir" ligado (D-025), a exportação pede a biometria antes de gerar. Como na tela de desbloqueio, a
 * confirmação do aparelho ou a falta de biometria e de senha cadastradas deixam seguir; a recusa ou o cancelamento, não.
 */
export function exportAfterAuth(result: 'ok' | 'cancelado' | 'indisponivel' | 'falhou'): 'seguir' | 'cancelado' | 'falhou' {
  return result === 'ok' || result === 'indisponivel' ? 'seguir' : result === 'cancelado' ? 'cancelado' : 'falhou';
}

export type ExportLoad = { ok: true; source: ExportSource } | { ok: false; reason: 'muitas_linhas' };

/** Lê com no máximo `size` pedidos ao mesmo tempo. */
async function mapLimit<T, R>(items: readonly T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

/**
 * Lê tudo o que a exportação precisa, só com leituras que o app já faz (RLS no banco): os registros e as compras no cartão do
 * período (até `EXPORT_MAX_ROWS`; passou, `muitas_linhas` e nada é montado), as contas, os cartões, as contas a pagar que os
 * gastos quitaram (para dizer se vieram de gasto fixo, parcelamento ou conta do ano) e, para o PDF (`withInvoices`), as faturas
 * dos pagamentos de fatura, para Por categoria sair como no Resumo. Erros do repositório seguem para quem chamou.
 */
export async function loadExportSource(
  repo: RecordsRepository,
  contextId: string,
  period: ExportPeriod,
  today: IsoDate,
  options: { withInvoices?: boolean } = {},
): Promise<ExportLoad> {
  const filter = exportFilterOf(period, today);
  const [found, bought] = await Promise.all([
    repo.searchRecords(contextId, filter, EXPORT_MAX_ROWS),
    repo.searchCardPurchases(contextId, filter, EXPORT_MAX_ROWS),
  ]);
  if (found.truncated || bought.truncated || found.items.length + bought.items.length > EXPORT_MAX_ROWS) return { ok: false, reason: 'muitas_linhas' };
  const records = found.items;
  const [accounts, cards] = await Promise.all([repo.listAccounts(contextId), repo.listCards(contextId)]);

  // Contas a pagar quitadas pelos gastos (o pagamento de fatura é "Fatura" e não precisa da conta). Uma leitura por vencimento cobre
  // quase tudo; a conta paga com muito atraso é lida pelo id.
  const wanted = [...new Set(records.filter((r) => !r.invoice && r.commitmentId).map((r) => r.commitmentId!))];
  const commitments = new Map<string, Commitment>();
  if (wanted.length > 0) {
    const months = records.filter((r) => !r.invoice && r.commitmentId).map((r) => monthOf(r.occurredOn)).sort();
    const bulk = await repo.listCommitmentsDueBetween(contextId, addMonths(months[0]!, -2), months[months.length - 1]!);
    for (const c of bulk) commitments.set(c.id, c);
    const missing = wanted.filter((id) => !commitments.has(id));
    const rest = await mapLimit(missing, 6, (id) => repo.getCommitment(id));
    for (const c of rest) if (c) commitments.set(c.id, c);
  }

  const invoices = options.withInvoices ? await loadInvoicesOfRecords(repo, records, today) : [];
  return {
    ok: true,
    source: { contextId, period, today, records, purchases: bought.items, accounts, cards, commitments, invoices },
  };
}
