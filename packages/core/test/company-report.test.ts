/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  COMPANY_PRIVACY,
  COMPANY_REPORT_FIELDS,
  COMPANY_REPORT_TEXT,
  COMPANY_TEXT,
  CSV_BOM,
  CSV_EOL,
  buildCompanyReport,
  buildCompanyReportCsv,
  buildCompanyReportFile,
  companyReportDocTitle,
  companyReportFileName,
  companyReportGenerated,
  companyReportHtml,
  companyReportRows,
  companyReportTextSamples,
  createDemoRepository,
  type CompanyReportInput,
  type ReportLicenseSource,
} from '../src';

/** Termos proibidos (como em company.test.ts): produto financeiro, promessa de rendimento, travessões longos e a expressão vetada. */
const FORBIDDEN =
  /\b(recomendamos|recomendo|invista|aplique|tesouro|cdb|lci|lca|caixinha|cofrinho)\b|fundo de investimento|rentabilidade garantida|rendimento garantido|retorno garantido|enriquec|faz(er|endo)?\s+sentido|[–—]/i;
/** Marcas de gênero nas palavras que descrevem pessoas (o texto do produto é neutro) e palavras de julgamento ou de cobrança. */
const GENDERED = /\b(colaborador(a|es|as)?|funcionári[oa]s?|usuári[oa]s?|bem-vind[oa]s?|convidad[oa]s? (pel[oa]|d[oa] )|administrador(a|es|as)?|dono|dona)\b/i;
const JUDGMENT = /\b(demais|estour\w*|vale a pena|ruim|cuidado|parab[eé]ns|incr[ií]vel|exigimos|obrigat[oó]ri[oa])\b/i;
/** Nada financeiro nem de uso individual no arquivo. */
const FINANCE_OR_USAGE = /R\$|\bsaldo\b|\bgasto|\bdespesa|\breceita|\bmeta\b|\bcartão\b|\bcartões\b|último acesso|entrou no app|acessou/i;

const license = (over: Partial<ReportLicenseSource> & Pick<ReportLicenseSource, 'email' | 'status'>): ReportLicenseSource => ({
  id: `l-${over.email}`,
  invitedAt: '2026-10-01T12:00:00.000Z',
  activatedAt: null,
  endedAt: null,
  cancelledAt: null,
  ...over,
});

const LICENSES: ReportLicenseSource[] = [
  license({ email: 'pessoa.01@empresa-exemplo.example', status: 'ativa', activatedAt: '2026-04-11T12:00:00.000Z' }),
  license({ email: 'cancelado.01@empresa-exemplo.example', status: 'encerrada', invitedAt: '2026-09-20T12:00:00.000Z', cancelledAt: '2026-09-25T12:00:00.000Z' }),
  license({ email: 'convite.01@empresa-exemplo.example', status: 'convidada' }),
  license({ email: 'antiga.01@empresa-exemplo.example', status: 'encerrada', activatedAt: '2026-03-08T12:00:00.000Z', endedAt: '2026-09-01T12:00:00.000Z' }),
];

const input = (over: Partial<CompanyReportInput> = {}): CompanyReportInput => ({
  organization: { name: 'Empresa Exemplo (demonstração)' },
  demo: true,
  contract: { plan: 'individual', seats: 40, startsOn: '2026-03-01', endsOn: null },
  usage: { seats: 40, invited: 6, active: 12, ended: 3 },
  licenses: LICENSES,
  generatedOn: '2026-10-07',
  timeZone: 'America/Sao_Paulo',
  ...over,
});

const EOL = CSV_EOL;
const csvLines = (csv: string): string[] => csv.slice(CSV_BOM.length).split(EOL);

describe('Relatório do RH (D-062): montagem só com o que o painel mostra', () => {
  it('o relatório tem só os campos permitidos, copiados um a um', () => {
    const report = buildCompanyReport(input());
    expect(Object.keys(report)).toEqual([...COMPANY_REPORT_FIELDS.report]);
    expect(Object.keys(report.contract!)).toEqual([...COMPANY_REPORT_FIELDS.contract]);
    expect(Object.keys(report.usage)).toEqual([...COMPANY_REPORT_FIELDS.usage]);
    expect(report.licenses).toHaveLength(4);
    for (const l of report.licenses!) expect(Object.keys(l)).toEqual([...COMPANY_REPORT_FIELDS.license]);
  });

  it('um objeto com campos a mais (pessoa, resumo do código, ids, finanças) nunca chega ao relatório nem aos arquivos', () => {
    const hostile = LICENSES.map((l, n) => ({
      ...l,
      personId: `pessoa-secreta-${n}`,
      codeHash: 'a'.repeat(64),
      contractId: 'contrato-interno',
      lastSeenAt: '2026-10-06T10:00:00.000Z',
      balanceCents: 123456,
    })) as unknown as ReportLicenseSource[];
    const extraContract = { plan: 'familiar', seats: 10, startsOn: '2026-01-01', endsOn: '2027-12-31', id: 'ct-interno', organizationId: 'org-interna' } as const;
    const extraUsage = { seats: 10, invited: 1, active: 2, ended: 3, joinedThisMonth: 9, organizationId: 'org-interna' };
    const report = buildCompanyReport(input({ licenses: hostile, contract: extraContract, usage: extraUsage }));
    const everything = JSON.stringify(report) + buildCompanyReportCsv(report) + companyReportHtml(report);
    for (const secret of ['pessoa-secreta', 'aaaaaaaa', 'contrato-interno', 'ct-interno', 'org-interna', 'lastSeenAt', '123456', 'joinedThisMonth', '06/10/2026']) {
      expect(everything, secret).not.toContain(secret);
    }
    expect(Object.keys(report.contract!)).toEqual([...COMPANY_REPORT_FIELDS.contract]);
    expect(Object.keys(report.usage)).toEqual([...COMPANY_REPORT_FIELDS.usage]);
    expect(report.contract).toEqual({ plan: 'familiar', seats: 10, startsOn: '2026-01-01', endsOn: '2027-12-31' });
  });

  it('a lista segue a ordem do painel (convites, ativas, encerradas; por e-mail) e traz a data que o painel mostra em cada linha', () => {
    const report = buildCompanyReport(input());
    expect(report.licenses).toEqual([
      { email: 'convite.01@empresa-exemplo.example', kind: 'convidada', date: '2026-10-01' },
      { email: 'pessoa.01@empresa-exemplo.example', kind: 'ativa', date: '2026-04-11' },
      { email: 'antiga.01@empresa-exemplo.example', kind: 'encerrada', date: '2026-09-01' },
      { email: 'cancelado.01@empresa-exemplo.example', kind: 'cancelada', date: '2026-09-25' },
    ]);
  });

  it('sem a lista, o relatório não leva e-mail nenhum (licenses nulo)', () => {
    const report = buildCompanyReport(input({ licenses: null }));
    expect(report.licenses).toBeNull();
    const everything = buildCompanyReportCsv(report) + companyReportHtml(report);
    expect(everything).not.toMatch(/[\w.+-]+@[\w.-]+|empresa-exemplo\.example/);
  });

  it('a data de cada licença é o dia no fuso do aparelho (como o painel), e a de geração é a que a tela manda', () => {
    const late = [license({ email: 'tarde@x.com', status: 'convidada', invitedAt: '2026-10-08T02:30:00.000Z' })];
    expect(buildCompanyReport(input({ licenses: late, timeZone: 'America/Sao_Paulo' })).licenses![0]!.date).toBe('2026-10-07');
    expect(buildCompanyReport(input({ licenses: late, timeZone: 'UTC' })).licenses![0]!.date).toBe('2026-10-08');
    expect(buildCompanyReport(input({ generatedOn: '2027-01-02' })).generatedOn).toBe('2027-01-02');
    // Virada de ano no fuso: 01/01 02:30 UTC ainda é 31/12 em São Paulo.
    const ano = [license({ email: 'ano@x.com', status: 'ativa', activatedAt: '2027-01-01T02:30:00.000Z' })];
    expect(buildCompanyReport(input({ licenses: ano })).licenses![0]!.date).toBe('2026-12-31');
  });

  it('com a demonstração, o relatório sai com as contagens e as 22 licenças da "Empresa Exemplo (demonstração)", e as datas em pt-BR', async () => {
    const repo = await createDemoRepository();
    const company = (await repo.listAdministeredCompanies())[0]!;
    const usage = await repo.getCompanyUsage(company.organization.id);
    const report = buildCompanyReport({
      organization: company.organization,
      demo: company.demo,
      contract: company.contracts[0] ?? null,
      usage,
      licenses: company.licenses,
      generatedOn: '2026-10-07',
      timeZone: 'America/Sao_Paulo',
    });
    expect(report.organizationName).toBe('Empresa Exemplo (demonstração)');
    expect(report.demo).toBe(true);
    expect(report.contract).toEqual({ plan: 'individual', seats: 40, startsOn: '2026-03-01', endsOn: null });
    expect(report.usage).toEqual({ seats: 40, invited: 6, active: 12, ended: 3 });
    expect(report.licenses).toHaveLength(22);
    const csv = buildCompanyReportCsv(report);
    expect(csvLines(csv)).toContain('pessoa.01@empresa-exemplo.example;Ativa;11/04/2026');
    expect(csvLines(csv)).toContain('convite.06@empresa-exemplo.example;Convite enviado;06/10/2026');
    expect(csvLines(csv)).toContain('antiga.03@empresa-exemplo.example;Encerrada;03/09/2026');
    expect(csvLines(csv)).toContain('cancelado.01@empresa-exemplo.example;Convite cancelado;25/09/2026');
    // Todos os e-mails do relatório são da empresa fictícia.
    const emails = csv.match(/[^;\r\n]+@[^;\r\n]+/g) ?? [];
    expect(emails).toHaveLength(22);
    for (const e of emails) expect(e).toMatch(/@empresa-exemplo\.example$/);
  });
});

describe('Relatório do RH (D-062): planilha (CSV)', () => {
  it('o arquivo inteiro, com a lista: BOM, ponto e vírgula, fim de linha do Excel, datas dd/mm/aaaa e a frase do rodapé', () => {
    const csv = buildCompanyReportCsv(buildCompanyReport(input()));
    expect(csv).toBe(
      [
        '\uFEFFRelatório de adesão ao benefício',
        'Empresa;Empresa Exemplo (demonstração)',
        'Gerado em;07/10/2026',
        'Demonstração: empresa e pessoas fictícias.',
        '',
        'Contrato',
        'Plano;Individual',
        'Vagas;40',
        'Início;01/03/2026',
        'Fim;Sem data de fim',
        '',
        'Contagens de licenças',
        'Vagas contratadas;40',
        'Convites pendentes;6',
        'Licenças ativas;12',
        'Licenças encerradas;3',
        '',
        'Licenças',
        'E-mail;Situação;Data da situação',
        'convite.01@empresa-exemplo.example;Convite enviado;01/10/2026',
        'pessoa.01@empresa-exemplo.example;Ativa;11/04/2026',
        'antiga.01@empresa-exemplo.example;Encerrada;01/09/2026',
        'cancelado.01@empresa-exemplo.example;Convite cancelado;25/09/2026',
        'O convite cancelado aparece na lista e não entra na contagem de licenças encerradas.',
        '',
        'A empresa não vê dados financeiros de ninguém, nem somados.',
        '',
      ].join(EOL),
    );
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(CSV_BOM).toBe('\uFEFF');
    expect(csv.endsWith(`ninguém, nem somados.${EOL}`)).toBe(true);
    // Toda quebra de linha é CRLF.
    expect(csv.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('sem a lista: só o contrato e as quatro contagens, sem e-mail e sem a seção de licenças', () => {
    const csv = buildCompanyReportCsv(buildCompanyReport(input({ licenses: null, demo: false, organization: { name: 'Empresa Alfa' }, contract: { plan: 'familiar', seats: 6, startsOn: '2026-10-01', endsOn: '2027-09-30' }, usage: { seats: 6, invited: 2, active: 0, ended: 0 } })));
    expect(csvLines(csv)).toEqual([
      'Relatório de adesão ao benefício',
      'Empresa;Empresa Alfa',
      'Gerado em;07/10/2026',
      '',
      'Contrato',
      'Plano;Familiar',
      'Vagas;6',
      'Início;01/10/2026',
      'Fim;30/09/2027',
      '',
      'Contagens de licenças',
      'Vagas contratadas;6',
      'Convites pendentes;2',
      'Licenças ativas;0',
      'Licenças encerradas;0',
      '',
      'A empresa não vê dados financeiros de ninguém, nem somados.',
      '',
    ]);
  });

  it('lista pedida mas vazia: "Nenhuma licença."; organização sem contrato: "Nenhum contrato cadastrado."; sem convite cancelado, sem a nota', () => {
    const csv = buildCompanyReportCsv(buildCompanyReport(input({ licenses: [], contract: null, usage: { seats: 0, invited: 0, active: 0, ended: 0 } })));
    expect(csvLines(csv)).toContain('Nenhum contrato cadastrado.');
    expect(csvLines(csv)).toContain('Nenhuma licença.');
    expect(csvLines(csv)).toContain('Vagas contratadas;0');
    expect(csv).not.toContain('Plano;');
    const semCancelado = buildCompanyReportCsv(buildCompanyReport(input({ licenses: LICENSES.filter((l) => l.cancelledAt === null) })));
    expect(semCancelado).not.toContain('O convite cancelado aparece na lista');
  });

  it('só a demonstração leva a linha de dados fictícios', () => {
    expect(buildCompanyReportCsv(buildCompanyReport(input({ demo: true })))).toContain('Demonstração: empresa e pessoas fictícias.');
    expect(buildCompanyReportCsv(buildCompanyReport(input({ demo: false })))).not.toContain('fictícias');
  });

  it('escape: ponto e vírgula e aspas viram célula entre aspas com as aspas dobradas; quebra de linha vira espaço', () => {
    const csv = buildCompanyReportCsv(buildCompanyReport(input({ organization: { name: 'Alfa; "Beta"\nLtda' }, licenses: null })));
    expect(csvLines(csv)).toContain('Empresa;"Alfa; ""Beta"" Ltda"');
    const lista = buildCompanyReportCsv(buildCompanyReport(input({ licenses: [license({ email: 'a;b"c@x.com', status: 'convidada' })] })));
    expect(csvLines(lista)).toContain('"a;b""c@x.com";Convite enviado;01/10/2026');
    // Cada linha da planilha tem no máximo três células, mesmo com texto estranho.
    for (const line of csvLines(lista)) expect(line.replace(/"[^"]*(?:""[^"]*)*"/g, 'x').split(';').length).toBeLessThanOrEqual(3);
  });

  it('proteção contra fórmula: nome ou e-mail que começa com =, +, - ou @ ganha o apóstrofo', () => {
    for (const lead of ['=', '+', '-', '@']) {
      const csv = buildCompanyReportCsv(buildCompanyReport(input({ organization: { name: `${lead}SOMA(A1)` }, licenses: [license({ email: `${lead}x@y.com`, status: 'ativa', activatedAt: '2026-05-01T12:00:00.000Z' })] })));
      expect(csv, lead).toContain(`Empresa;'${lead}SOMA(A1)`);
      expect(csv, lead).toContain(`'${lead}x@y.com;Ativa;01/05/2026`);
    }
    // A conferência vem antes de achatar a quebra de linha: um nome que começa por quebra de linha e sinal também fica protegido.
    expect(buildCompanyReportCsv(buildCompanyReport(input({ organization: { name: '\n=1+1' } })))).toContain("Empresa;'");
  });

  it('as linhas da planilha são as mesmas do arquivo (uma linha vazia separa as partes)', () => {
    const report = buildCompanyReport(input());
    const rows = companyReportRows(report);
    expect(rows.filter((r) => r.length === 0)).toHaveLength(4);
    expect(rows[0]).toEqual(['Relatório de adesão ao benefício']);
    expect(rows.at(-1)).toEqual([COMPANY_REPORT_TEXT.footer]);
  });

  it('nenhuma linha traz valor financeiro nem uso individual', () => {
    const csv = buildCompanyReportCsv(buildCompanyReport(input()));
    expect(csv).not.toMatch(FINANCE_OR_USAGE);
  });
});

describe('Relatório do RH (D-062): PDF (página de impressão)', () => {
  const html = (over: Partial<CompanyReportInput> = {}, options: { logoSvg?: string } = {}) => companyReportHtml(buildCompanyReport(input(over)), options);
  const text = (h: string) => h.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

  it('é a página inteira em pt-BR, com título sem espaços, sem script e com a mesma folha de estilo da exportação', () => {
    const h = html();
    expect(h.startsWith('<!doctype html>')).toBe(true);
    expect(h).toContain('<html lang="pt-BR">');
    expect(h).toContain('<title>clarevo-relatorio-adesao-2026-10-07</title>');
    expect(h).toContain('@page { size: A4; margin: 14mm; }');
    expect(h).not.toMatch(/<script/i);
    expect(h).not.toMatch(/https?:\/\//);
  });

  it('cabeçalho com o logotipo "clarevo." (o SVG oficial quando vem, o nome com o ponto lima quando não), o nome da empresa e a data', () => {
    expect(html()).toContain('clarevo<span class="dot">.</span>');
    const svg = '<svg viewBox="0 0 10 10"><path d="M0 0" fill="#2457F5"/><circle cx="1" cy="1" r="1" fill="#D4F05B"/></svg>';
    const withLogo = html({}, { logoSvg: svg });
    expect(withLogo).toContain(`<div class="logo" role="img" aria-label="Clarevo">${svg}</div>`);
    expect(withLogo).not.toContain('<span class="dot">');
    const t = text(html());
    expect(t).toContain('Relatório de adesão ao benefício');
    expect(t).toContain('Empresa Exemplo (demonstração)');
    expect(t).toContain('Gerado em 07/10/2026');
    expect(t).toContain('Demonstração: empresa e pessoas fictícias.');
  });

  it('contrato, contagens, lista e a frase do rodapé', () => {
    const h = html();
    const t = text(h);
    for (const piece of ['Contrato', 'Plano Individual', 'Vagas 40', 'Início 01/03/2026', 'Fim Sem data de fim', 'Contagens de licenças', 'Vagas contratadas 40', 'Convites pendentes 6', 'Licenças ativas 12', 'Licenças encerradas 3']) {
      expect(t, piece).toContain(piece);
    }
    expect(t).toContain('E-mail Situação Data da situação');
    expect(t).toContain('pessoa.01@empresa-exemplo.example Ativa 11/04/2026');
    expect(t).toContain('cancelado.01@empresa-exemplo.example Convite cancelado 25/09/2026');
    expect(t).toContain('O convite cancelado aparece na lista e não entra na contagem de licenças encerradas.');
    expect(h).toContain('<footer>A empresa não vê dados financeiros de ninguém, nem somados.</footer>');
    expect(h.indexOf('<footer>')).toBeGreaterThan(h.indexOf('Licenças encerradas'));
  });

  it('sem a lista, sem e-mail e sem a seção; sem contrato e sem licença, a página diz isso', () => {
    const t = text(html({ licenses: null }));
    expect(t).not.toContain('Data da situação');
    expect(t).not.toMatch(/[\w.+-]+@[\w.-]+/);
    const vazio = text(html({ licenses: [], contract: null, demo: false }));
    expect(vazio).toContain('Nenhum contrato cadastrado.');
    expect(vazio).toContain('Nenhuma licença.');
    expect(vazio).not.toContain('fictícias');
  });

  it('o texto da pessoa (nome da empresa e e-mail) é escapado: nada vira marca HTML', () => {
    const h = html({ organization: { name: '<img src=x onerror=alert(1)> & "Cia"' }, licenses: [license({ email: '<b>x</b>@y.com', status: 'ativa', activatedAt: '2026-05-01T12:00:00.000Z' })] });
    expect(h).not.toContain('<img');
    expect(h).not.toContain('<b>x</b>');
    expect(h).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;Cia&quot;');
    expect(h).toContain('&lt;b&gt;x&lt;/b&gt;@y.com');
  });

  it('nenhum valor financeiro nem uso individual na página', () => {
    expect(text(html())).not.toMatch(FINANCE_OR_USAGE);
  });
});

describe('Relatório do RH (D-062): arquivos e textos', () => {
  it('nome do arquivo e título da página: letras sem acento, números e hífen, sem o nome da empresa', () => {
    expect(companyReportFileName('csv', '2026-10-07')).toBe('clarevo-relatorio-adesao-2026-10-07.csv');
    expect(companyReportFileName('pdf', '2026-10-07')).toBe('clarevo-relatorio-adesao-2026-10-07.pdf');
    expect(companyReportDocTitle('2026-10-07')).toBe('clarevo-relatorio-adesao-2026-10-07');
    expect(companyReportFileName('csv', '2026-10-07')).toMatch(/^[a-z0-9-]+\.csv$/);
  });

  it('a entrega: o CSV com BOM e o PDF como HTML da página de impressão, cada um com nome, tipo e conteúdo', () => {
    const report = buildCompanyReport(input());
    const csv = buildCompanyReportFile(report, 'csv');
    expect(csv).toEqual({ fileName: 'clarevo-relatorio-adesao-2026-10-07.csv', mime: 'text/csv;charset=utf-8', kind: 'csv', content: buildCompanyReportCsv(report) });
    const pdf = buildCompanyReportFile(report, 'pdf', { logoSvg: '<svg></svg>' });
    expect(pdf.fileName).toBe('clarevo-relatorio-adesao-2026-10-07.pdf');
    expect(pdf.kind).toBe('pdf');
    expect(pdf.mime).toBe('application/pdf');
    expect(pdf.content).toBe(companyReportHtml(report, { logoSvg: '<svg></svg>' }));
  });

  it('a frase do rodapé é a combinada, e a da privacidade do painel segue a mesma ideia', () => {
    expect(COMPANY_REPORT_TEXT.footer).toBe('A empresa não vê dados financeiros de ninguém, nem somados.');
    expect(COMPANY_PRIVACY).toContain('nem somados');
    expect(companyReportGenerated('2026-10-07')).toBe('Gerado em 07/10/2026');
  });

  it('os rótulos do contrato e das contagens são os do painel', () => {
    const t = companyReportRows(buildCompanyReport(input({ licenses: null }))).map((r) => r[0]);
    for (const label of [COMPANY_TEXT.contractTitle, COMPANY_TEXT.plan, COMPANY_TEXT.seats, COMPANY_TEXT.startsOn, COMPANY_TEXT.endsOn, COMPANY_TEXT.usageSeats, COMPANY_TEXT.usageInvited, COMPANY_TEXT.usageActive, COMPANY_TEXT.usageEnded]) {
      expect(t, label).toContain(label);
    }
  });

  it('nenhum texto do relatório tem termo proibido, travessão, expressão vetada, marca de gênero ou palavra de julgamento', () => {
    const texts = [
      ...companyReportTextSamples(),
      ...companyReportRows(buildCompanyReport(input())).flat(),
      ...companyReportRows(buildCompanyReport(input({ licenses: [], contract: null, demo: false }))).flat(),
    ];
    expect(texts.length).toBeGreaterThan(40);
    for (const text of texts) {
      expect(text, text).not.toMatch(FORBIDDEN);
      expect(text, text).not.toMatch(GENDERED);
      expect(text, text).not.toMatch(JUDGMENT);
    }
    expect(companyReportTextSamples().join(' ')).not.toMatch(FINANCE_OR_USAGE);
  });
});

/** Os arquivos do app são lidos como texto (as telas dependem do Expo e não entram no teste do core). */
const APP_SRC = fileURLToPath(new URL('../../../apps/app/src/', import.meta.url));
const appFile = (rel: string): string => readFileSync(`${APP_SRC}${rel}`, 'utf8');

describe('Relatório do RH (D-062): tela do painel (lida como código-fonte)', () => {
  it('o cartão fica no painel (web), entre "Uso do app" e "Textos para divulgar", e a tela o mostra para qualquer organização', () => {
    const screen = appFile('app/empresa/index.tsx');
    expect(screen).toContain('<ReportCard');
    expect(screen.indexOf('<UsageCard')).toBeLessThan(screen.indexOf('<ReportCard'));
    expect(screen.indexOf('<ReportCard')).toBeLessThan(screen.indexOf('<PromoCard'));
  });

  it('o cartão usa só os dados que o painel já leu (organização, contrato, licenças e as contagens), sem ler finanças nem gravar', () => {
    const panel = appFile('components/company-panel.tsx');
    const card = panel.slice(panel.indexOf('export function ReportCard'), panel.indexOf('// Textos para divulgar'));
    expect(card.length).toBeGreaterThan(500);
    expect(card).toContain('buildCompanyReport(');
    expect(card).toContain('useCompanyUsage(');
    expect(card).toContain('R.csvButton');
    expect(card).toContain('R.pdfButton');
    expect(card).toContain('deliverExportFile');
    expect(card).not.toMatch(/\buseWork\b|\buseFamily\b|listRecords|listCommitments|listGoals|listCards|financial_records|getSpace|\.mutate|useMutation|attemptFamily/);
    // A lista só entra no arquivo quando a caixa está marcada, e começa desmarcada.
    expect(card).toContain('[includeList, setIncludeList] = useState(false)');
    expect(card).toMatch(/includeList \? .* : null/);
  });
});
