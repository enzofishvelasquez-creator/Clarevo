import type { IsoDate } from './dates';
import { formatDateBR } from './dates';
import type { BenefitContract, BenefitPlan, CompanyUsage, License, LicenseKind } from './company';
import { BENEFIT_PLAN_LABEL, COMPANY_TEXT, LICENSE_KIND_LABEL, dayOf, filterLicenses, licenseKind } from './company';
import type { ExportDeliverable } from './export';
import { CSV_BOM, CSV_EOL, CSV_SEPARATOR, PDF_STYLE, csvCell, csvText, escapeHtml } from './export';

/**
 * Relatório de adesão para o RH (D-062 item 1, Ciclo U). Planilha (CSV) e página de impressão em PDF com o que o painel da empresa
 * (D-056) já mostra: o nome da organização, o contrato (plano, vagas, início e fim), a data de geração, as quatro contagens de
 * `organization_usage` (vagas, convites pendentes, licenças ativas e encerradas) e, só se o RH marcar, a lista de licenças (e-mail,
 * situação e a data que o painel mostra). Nada financeiro, nada de uso individual e nada que o painel não leia: a montagem copia
 * campo a campo, então um objeto com mais campos (pessoa, resumo do código, ids) nunca chega ao arquivo.
 *
 * Regras puras, sem leitura nem escrita no banco: o app monta o arquivo no navegador (o painel só existe na web) e não guarda cópia.
 * O CSV segue o das exportações (D-047): UTF-8 com BOM, ponto e vírgula, fim de linha do Excel, datas dd/mm/aaaa e proteção contra
 * fórmula. O PDF é o HTML da página de impressão, com a mesma folha de estilo e o logotipo oficial.
 */

/** Os campos que o relatório pode ter: o teste confere que a montagem não leva nenhum além destes. */
export const COMPANY_REPORT_FIELDS = {
  report: ['organizationName', 'demo', 'generatedOn', 'contract', 'usage', 'licenses'],
  contract: ['plan', 'seats', 'startsOn', 'endsOn'],
  usage: ['seats', 'invited', 'active', 'ended'],
  license: ['email', 'kind', 'date'],
} as const;

export interface CompanyReportContract {
  plan: BenefitPlan;
  seats: number;
  startsOn: IsoDate;
  endsOn: IsoDate | null;
}

export interface CompanyReportUsage {
  seats: number;
  invited: number;
  active: number;
  ended: number;
}

/** Uma licença no relatório: o e-mail, a situação e a data da situação (a mesma que o painel mostra na linha). */
export interface CompanyReportLicense {
  email: string;
  kind: LicenseKind;
  date: IsoDate;
}

export interface CompanyReport {
  organizationName: string;
  /** Organização de demonstração: o arquivo diz que a empresa e as pessoas são fictícias. */
  demo: boolean;
  generatedOn: IsoDate;
  /** null: a organização não tem contrato cadastrado. */
  contract: CompanyReportContract | null;
  usage: CompanyReportUsage;
  /** null: o RH não pediu a lista. */
  licenses: CompanyReportLicense[] | null;
}

/** O que a montagem lê de cada licença: o que o painel mostra na linha, e nada mais. */
export type ReportLicenseSource = Pick<License, 'id' | 'email' | 'status' | 'invitedAt' | 'activatedAt' | 'endedAt' | 'cancelledAt'>;

export interface CompanyReportInput {
  organization: { name: string };
  demo: boolean;
  /** O contrato que o painel mostra (o primeiro). */
  contract: Pick<BenefitContract, 'plan' | 'seats' | 'startsOn' | 'endsOn'> | null;
  usage: Pick<CompanyUsage, 'seats' | 'invited' | 'active' | 'ended'>;
  /** As licenças que o painel lista; `null` quando o RH não quer a lista no arquivo. */
  licenses: readonly ReportLicenseSource[] | null;
  generatedOn: IsoDate;
  /** Fuso para o dia de cada data gravada (o do aparelho, como o painel). */
  timeZone: string;
}

export const COMPANY_REPORT_TEXT = {
  /** Cartão do painel. */
  cardTitle: 'Relatório de adesão',
  cardIntro:
    'Leve o resumo do benefício para uma reunião ou para o arquivo do RH: o contrato, as vagas e as contagens de licenças. O arquivo é montado neste navegador, e a Clarevo não guarda cópia dele.',
  includeLabel: 'Incluir a lista de licenças',
  includeHint: 'Leva o e-mail, a situação e a data de cada licença, como o painel mostra. Sem a lista, o arquivo tem só as contagens.',
  includeNote: 'Com a lista, o arquivo tem e-mails de pessoas. Compartilhe só com quem precisa.',
  csvButton: 'Baixar relatório em planilha (CSV)',
  pdfButton: 'Baixar relatório em PDF',
  csvDone: 'Relatório baixado. Confira a pasta de downloads.',
  pdfOpened: 'A página de impressão foi aberta. Escolha "Salvar como PDF" ou imprima.',
  failed: 'Não foi possível baixar o relatório. Tente novamente.',
  popupBlocked: 'O navegador bloqueou a janela de impressão. Permita janelas para este site e tente de novo.',
  usageLoading: 'Carregando as contagens do painel…',
  usageFailed: 'Não foi possível carregar as contagens. Atualize o painel para baixar o relatório.',
  /** Arquivo (planilha e PDF). */
  title: 'Relatório de adesão ao benefício',
  organization: 'Empresa',
  generated: 'Gerado em',
  demoLine: 'Demonstração: empresa e pessoas fictícias.',
  noContract: 'Nenhum contrato cadastrado.',
  countsTitle: 'Contagens de licenças',
  licensesTitle: 'Licenças',
  noLicenses: 'Nenhuma licença.',
  columns: { email: 'E-mail', situation: 'Situação', date: 'Data da situação' },
  cancelledNote: 'O convite cancelado aparece na lista e não entra na contagem de licenças encerradas.',
  /** O rodapé de cada arquivo. */
  footer: 'A empresa não vê dados financeiros de ninguém, nem somados.',
} as const;

/** "Gerado em 07/10/2026". */
export const companyReportGenerated = (on: IsoDate): string => `${COMPANY_REPORT_TEXT.generated} ${formatDateBR(on)}`;

/** O dia que a linha da licença mostra no painel: ativa desde, encerrada em, convite cancelado em ou convite enviado em. */
function licenseDay(license: ReportLicenseSource, kind: LicenseKind, timeZone: string): IsoDate {
  const instant =
    kind === 'ativa' ? license.activatedAt : kind === 'encerrada' ? license.endedAt : kind === 'cancelada' ? license.cancelledAt : license.invitedAt;
  return dayOf(instant ?? license.invitedAt, timeZone);
}

/**
 * Monta o relatório copiando só os campos permitidos (`COMPANY_REPORT_FIELDS`). A lista segue a ordem do painel: convites primeiro,
 * depois licenças ativas e encerradas, e dentro de cada grupo por e-mail.
 */
export function buildCompanyReport(input: CompanyReportInput): CompanyReport {
  const contract = input.contract
    ? { plan: input.contract.plan, seats: input.contract.seats, startsOn: input.contract.startsOn, endsOn: input.contract.endsOn }
    : null;
  const licenses =
    input.licenses === null
      ? null
      : filterLicenses(input.licenses, 'todas').map((l) => {
          const kind = licenseKind(l);
          return { email: l.email, kind, date: licenseDay(l, kind, input.timeZone) };
        });
  return {
    organizationName: input.organization.name,
    demo: input.demo,
    generatedOn: input.generatedOn,
    contract,
    usage: { seats: input.usage.seats, invited: input.usage.invited, active: input.usage.active, ended: input.usage.ended },
    licenses,
  };
}

/** Os pares "rótulo e valor" do contrato, como o card do painel os escreve. */
function contractPairs(contract: CompanyReportContract): [string, string][] {
  return [
    [COMPANY_TEXT.plan, BENEFIT_PLAN_LABEL[contract.plan]],
    [COMPANY_TEXT.seats, String(contract.seats)],
    [COMPANY_TEXT.startsOn, formatDateBR(contract.startsOn)],
    [COMPANY_TEXT.endsOn, contract.endsOn ? formatDateBR(contract.endsOn) : COMPANY_TEXT.noEnd],
  ];
}

/** Os pares "rótulo e valor" das contagens, com os rótulos do card "Uso do app". */
function usagePairs(usage: CompanyReportUsage): [string, string][] {
  return [
    [COMPANY_TEXT.usageSeats, String(usage.seats)],
    [COMPANY_TEXT.usageInvited, String(usage.invited)],
    [COMPANY_TEXT.usageActive, String(usage.active)],
    [COMPANY_TEXT.usageEnded, String(usage.ended)],
  ];
}

const licenseCells = (l: CompanyReportLicense): string[] => [l.email, LICENSE_KIND_LABEL[l.kind], formatDateBR(l.date)];
const hasCancelled = (report: CompanyReport): boolean => (report.licenses ?? []).some((l) => l.kind === 'cancelada');

/** As linhas da planilha, antes de proteger e escapar cada célula. Linha vazia separa as partes. */
export function companyReportRows(report: CompanyReport): string[][] {
  const t = COMPANY_REPORT_TEXT;
  const rows: string[][] = [[t.title], [t.organization, report.organizationName], [t.generated, formatDateBR(report.generatedOn)]];
  if (report.demo) rows.push([t.demoLine]);
  rows.push([], [COMPANY_TEXT.contractTitle]);
  if (report.contract) rows.push(...contractPairs(report.contract));
  else rows.push([t.noContract]);
  rows.push([], [t.countsTitle], ...usagePairs(report.usage));
  if (report.licenses !== null) {
    rows.push([], [t.licensesTitle]);
    if (report.licenses.length === 0) rows.push([t.noLicenses]);
    else {
      rows.push([t.columns.email, t.columns.situation, t.columns.date], ...report.licenses.map(licenseCells));
      if (hasCancelled(report)) rows.push([t.cancelledNote]);
    }
  }
  rows.push([], [t.footer]);
  return rows;
}

/** O CSV do relatório: BOM, ponto e vírgula, fim de linha do Excel, texto protegido contra fórmula e células escapadas. */
export function buildCompanyReportCsv(report: CompanyReport): string {
  const line = (cells: readonly string[]) => cells.map((c) => csvCell(csvText(c))).join(CSV_SEPARATOR);
  return CSV_BOM + companyReportRows(report).map(line).join(CSV_EOL) + CSV_EOL;
}

// ---------------------------------------------------------------------------
// HTML do PDF
// ---------------------------------------------------------------------------

const REPORT_STYLE = `${PDF_STYLE}
table.kv th { width: 45%; font-weight: 400; color: #4B5873; border-bottom: 1px solid #E3E8F2; }
table.kv td { font-weight: 700; }
.demo { background: #EEF2FE; border-radius: 6px; padding: 6px 8px; margin: 0 0 8px; }
`;

function pairsTable(pairs: readonly [string, string][]): string {
  return `<table class="kv"><tbody>${pairs.map(([label, value]) => `<tr><th scope="row">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join('')}</tbody></table>`;
}

function licensesHtml(report: CompanyReport): string {
  if (report.licenses === null) return '';
  const t = COMPANY_REPORT_TEXT;
  const head = `<h2>${escapeHtml(t.licensesTitle)}</h2>`;
  if (report.licenses.length === 0) return `<section class="month">${head}<p class="empty">${escapeHtml(t.noLicenses)}</p></section>`;
  const body = report.licenses.map((l) => `<tr>${licenseCells(l).map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('');
  const note = hasCancelled(report) ? `<p class="note">${escapeHtml(t.cancelledNote)}</p>` : '';
  return `<section class="month">${head}<table><thead><tr><th>${escapeHtml(t.columns.email)}</th><th>${escapeHtml(t.columns.situation)}</th><th>${escapeHtml(t.columns.date)}</th></tr></thead><tbody>${body}</tbody></table>${note}</section>`;
}

/**
 * A página de impressão do relatório, com o logotipo "clarevo." (`logoSvg`: o logotipo oficial em SVG; sem ele, o nome em texto com o
 * ponto lima), o nome da organização, a data de geração e a frase do rodapé. Mesmo caminho do resumo em PDF da exportação (D-047):
 * o navegador abre a página e a pessoa escolhe "Salvar como PDF".
 */
export function companyReportHtml(report: CompanyReport, options: { logoSvg?: string } = {}): string {
  const t = COMPANY_REPORT_TEXT;
  const logo = options.logoSvg
    ? `<div class="logo" role="img" aria-label="Clarevo">${options.logoSvg}</div>`
    : `<div class="logo" role="img" aria-label="Clarevo">clarevo<span class="dot">.</span></div>`;
  const contract = report.contract
    ? pairsTable(contractPairs(report.contract))
    : `<p class="empty">${escapeHtml(t.noContract)}</p>`;
  return [
    '<!doctype html>',
    '<html lang="pt-BR"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(companyReportDocTitle(report.generatedOn))}</title>`,
    `<style>${REPORT_STYLE}</style></head><body>`,
    `<header class="top">${logo}<div class="meta"><h1>${escapeHtml(t.title)}</h1><div>${escapeHtml(report.organizationName)}</div><div>${escapeHtml(companyReportGenerated(report.generatedOn))}</div></div></header>`,
    report.demo ? `<p class="demo">${escapeHtml(t.demoLine)}</p>` : '',
    `<section class="month"><h2>${escapeHtml(COMPANY_TEXT.contractTitle)}</h2>${contract}</section>`,
    `<section class="month"><h2>${escapeHtml(t.countsTitle)}</h2>${pairsTable(usagePairs(report.usage))}</section>`,
    licensesHtml(report),
    `<footer>${escapeHtml(t.footer)}</footer>`,
    '</body></html>',
  ]
    .filter((part) => part !== '')
    .join('\n');
}

// ---------------------------------------------------------------------------
// Arquivos
// ---------------------------------------------------------------------------

export type CompanyReportFormat = 'csv' | 'pdf';

/** Título da página de impressão (vira o nome sugerido ao salvar): sem barras nem espaços, como o nome do arquivo. */
export function companyReportDocTitle(generatedOn: IsoDate): string {
  return `clarevo-relatorio-adesao-${generatedOn}`;
}

/** Nome do arquivo: letras sem acento, números e hífen, sem o nome da empresa. */
export function companyReportFileName(format: CompanyReportFormat, generatedOn: IsoDate): string {
  return `${companyReportDocTitle(generatedOn)}.${format}`;
}

/** O arquivo pronto para entregar: o CSV com BOM ou o HTML da página de impressão. */
export function buildCompanyReportFile(report: CompanyReport, format: CompanyReportFormat, options: { logoSvg?: string } = {}): ExportDeliverable {
  if (format === 'pdf') {
    return { fileName: companyReportFileName('pdf', report.generatedOn), mime: 'application/pdf', kind: 'pdf', content: companyReportHtml(report, options) };
  }
  return { fileName: companyReportFileName('csv', report.generatedOn), mime: 'text/csv;charset=utf-8', kind: 'csv', content: buildCompanyReportCsv(report) };
}

/** Todos os textos do relatório montados com entradas de exemplo, para o teste de textos. */
export function companyReportTextSamples(): string[] {
  const t = COMPANY_REPORT_TEXT;
  const out: string[] = [];
  for (const value of Object.values(t)) if (typeof value === 'string') out.push(value);
  out.push(...Object.values(t.columns), companyReportGenerated('2026-10-07'));
  return out;
}
