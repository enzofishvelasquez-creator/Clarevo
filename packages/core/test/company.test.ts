/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BENEFIT_GRACE_DAYS,
  BENEFIT_PLAN_LABEL,
  BENEFIT_TEXT,
  COMPANY_ACTIONS,
  COMPANY_ERROR_CODES,
  COMPANY_ERROR_TEXT,
  COMPANY_PRIVACY,
  COMPANY_TEXT,
  CSV_BOM,
  CSV_EOL,
  CSV_INVITE_HEADER,
  EMAIL_MAX,
  LICENSE_BATCH_MAX,
  LICENSE_CODE_PATTERN,
  LICENSE_FILTER_LABEL,
  LICENSE_KIND_LABEL,
  accessUntilDay,
  barModeFor,
  buildInviteCsv,
  buildInviteListText,
  companyErrorText,
  companyTextSamples,
  contractIsOpen,
  contractState,
  currentContract,
  filterLicenses,
  inviteCsvFileName,
  inviteLinkRows,
  isCompanyAction,
  isValidEmail,
  licenseCodeFromText,
  licenseCodeHash,
  licenseCounts,
  licenseKind,
  licenseLink,
  normalizeEmail,
  normalizeLicenseCode,
  parseEmailList,
  planInvites,
  promoTexts,
  sameEmail,
  seatsOf,
  sha256Hex,
  splitEmailList,
  type BenefitContract,
  type License,
  type LicenseInviteResult,
} from '../src';

/** Termos proibidos (como em copy.test.ts): produto financeiro, promessa de rendimento, travessões longos e a expressão vetada. */
const FORBIDDEN =
  /\b(recomendamos|recomendo|invista|aplique|tesouro|cdb|lci|lca|caixinha|cofrinho)\b|fundo de investimento|rentabilidade garantida|rendimento garantido|retorno garantido|enriquec|faz(er|endo)?\s+sentido|[–—]/i;
/** Marcas de gênero nas palavras que descrevem pessoas (o texto do produto é neutro) e palavras de julgamento ou de cobrança. */
const GENDERED = /\b(colaborador(a|es|as)?|funcionári[oa]s?|usuári[oa]s?|bem-vind[oa]s?|convidad[oa]s? (pel[oa]|d[oa] )|administrador(a|es|as)?|dono|dona)\b/i;
const JUDGMENT = /\b(demais|estour\w*|vale a pena|ruim|cuidado|parab[eé]ns|incr[ií]vel|exigimos|obrigat[oó]ri[oa])\b/i;

const contract = (over: Partial<BenefitContract> = {}): BenefitContract => ({
  id: 'ct1',
  organizationId: 'org1',
  seats: 5,
  plan: 'individual',
  startsOn: '2026-10-01',
  endsOn: null,
  ...over,
});

const license = (over: Partial<License> & Pick<License, 'email'>): License => ({
  id: `l-${over.email}`,
  contractId: 'ct1',
  status: 'convidada',
  invitedAt: '2026-10-07T12:00:00.000Z',
  createdAt: '2026-10-07T12:00:00.000Z',
  activatedAt: null,
  endedAt: null,
  cancelledAt: null,
  ...over,
});

describe('Empresas: e-mail (a mesma regra do banco)', () => {
  it('normaliza: sem os espaços das pontas e em minúsculas', () => {
    expect(normalizeEmail('  Ana.Souza@Empresa.COM.br \n')).toBe('ana.souza@empresa.com.br');
    expect(normalizeEmail('')).toBe('');
    expect(normalizeEmail(null)).toBe('');
    expect(normalizeEmail(12)).toBe('');
  });

  it('valida e-mails comuns', () => {
    for (const ok of ['ana@empresa.com.br', 'a@b.co', 'ana.souza+rh@empresa.com', 'ana_souza@sub.dominio.exemplo.org', 'a-b@x-y.com', '1@2.io', 'x@xn--80ak6aa92e.com'])
      expect(isValidEmail(ok), ok).toBe(true);
    // Limites: 64 caracteres na parte local, 254 no total, trechos do domínio de até 63.
    expect(isValidEmail(`${'a'.repeat(64)}@exemplo.test`)).toBe(true);
    expect(isValidEmail(`${'a'.repeat(65)}@exemplo.test`)).toBe(false);
    expect(isValidEmail(`a@${'b'.repeat(63)}.test`)).toBe(true);
    expect(isValidEmail(`a@${'b'.repeat(64)}.test`)).toBe(false);
    expect(isValidEmail(`a@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(63)}.${'e'.repeat(63)}.ab`)).toBe(false);
    expect(EMAIL_MAX).toBe(254);
  });

  it('recusa o que não é e-mail', () => {
    for (const bad of [
      '',
      'ana',
      'ana@',
      '@empresa.com',
      'ana@empresa',
      'ana@@empresa.com',
      'ana @empresa.com',
      'ana@empresa .com',
      '.ana@empresa.com',
      'ana.@empresa.com',
      'a..b@empresa.com',
      'ana@-empresa.com',
      'ana@empresa-.com',
      'ana@empresa..com',
      'ana@empresa.c',
      'ana@empresa.com.',
      'Ana@Empresa.com',
      'ánna@empresa.com',
      'ana@empresá.com',
      'ana,bia@empresa.com',
      'ana;bia@empresa.com',
      'ana<bia>@empresa.com',
    ])
      expect(isValidEmail(bad), bad).toBe(false);
    expect(isValidEmail(null as unknown as string)).toBe(false);
  });

  it('o e-mail da conta é o do convite, sem diferenciar maiúsculas nem os espaços das pontas', () => {
    expect(sameEmail('Bia@Exemplo.test', ' bia@exemplo.test ')).toBe(true);
    expect(sameEmail('bia@exemplo.test', 'caio@exemplo.test')).toBe(false);
    expect(sameEmail('', '')).toBe(false);
    expect(sameEmail(null, null)).toBe(false);
  });
});

describe('Empresas: a lista colada', () => {
  it('divide por linha, vírgula e ponto e vírgula; tira os vazios; "Nome <e-mail>" vale o e-mail dentro', () => {
    expect(splitEmailList('ana@x.com\nbia@x.com, caio@x.com;duda@x.com;;\r\n\n  edu@x.com  ')).toEqual([
      'ana@x.com',
      'bia@x.com',
      'caio@x.com',
      'duda@x.com',
      'edu@x.com',
    ]);
    expect(splitEmailList('Ana Souza <ana@x.com>, "Bia" <bia@x.com>')).toEqual(['ana@x.com', 'bia@x.com']);
    expect(splitEmailList('')).toEqual([]);
    expect(splitEmailList('  \n ,; ')).toEqual([]);
    expect(splitEmailList(undefined)).toEqual([]);
  });

  it('a prévia separa válidos (únicos, normalizados), repetidos e inválidos, na ordem em que aparecem', () => {
    const p = parseEmailList('Ana@X.com\nbia@x.com\nana@x.com\nxis\nBIA@x.com; ana@x.com\nxis\nsem arroba.com');
    expect(p.valid).toEqual(['ana@x.com', 'bia@x.com']);
    expect(p.repeated).toEqual(['ana@x.com', 'bia@x.com']);
    expect(p.invalid).toEqual(['xis', 'sem arroba.com']);
    expect(p.total).toBe(8);
    expect(parseEmailList('')).toEqual({ valid: [], repeated: [], invalid: [], total: 0 });
    // Um item com espaço no meio é um item só, e inválido (a lista não é cortada por espaços).
    expect(parseEmailList('ana@x.com bia@x.com').invalid).toEqual(['ana@x.com bia@x.com']);
  });

  it('o plano de convidar: quem é novo, quem já foi convidado, os repetidos, os inválidos e o primeiro motivo que impede', () => {
    const c = contract({ seats: 4 });
    const existing = [
      license({ email: 'ana@x.com', status: 'ativa', activatedAt: '2026-10-02T12:00:00.000Z' }),
      license({ email: 'bia@x.com' }),
      license({ email: 'ex@x.com', status: 'encerrada', endedAt: '2026-10-03T12:00:00.000Z', activatedAt: '2026-10-01T12:00:00.000Z' }),
    ];
    const today = '2026-10-07';
    // 2 vagas ocupadas (ana ativa, bia convidada); a encerrada não ocupa vaga e pode ser convidada de novo.
    expect(seatsOf(c, existing)).toEqual({ seats: 4, used: 2, free: 2 });
    const ok = planInvites('ANA@x.com\ncaio@x.com\nex@x.com\ncaio@x.com', c, existing, today);
    expect(ok).toMatchObject({ newEmails: ['caio@x.com', 'ex@x.com'], alreadyInvited: ['ana@x.com'], repeated: ['caio@x.com'], invalid: [], seatsFree: 2, problem: null });
    expect(planInvites('caio@x.com\ndudu@x.com\nedu@x.com', c, existing, today).problem).toBe('sem_vagas');
    expect(planInvites('ana@x.com', c, existing, today).problem).toBe('vazia');
    expect(planInvites('', c, existing, today).problem).toBe('vazia');
    expect(planInvites('caio@x.com\nxis', c, existing, today)).toMatchObject({ invalid: ['xis'], problem: 'invalidos' });
    expect(planInvites('caio@x.com', contract({ startsOn: '2026-11-01' }), [], today).problem).toBe('contrato_fora_da_vigencia');
    expect(planInvites('caio@x.com', contract({ endsOn: '2026-10-06' }), [], today).problem).toBe('contrato_fora_da_vigencia');
    // Lote: até 500 por vez.
    const many = Array.from({ length: LICENSE_BATCH_MAX + 1 }, (_, i) => `p${i}@x.com`).join('\n');
    expect(planInvites(many, contract({ seats: 1000 }), [], today).problem).toBe('lote_grande');
    expect(planInvites(many.split('\n').slice(0, LICENSE_BATCH_MAX).join('\n'), contract({ seats: 1000 }), [], today).problem).toBeNull();
    // Licença de outro contrato não ocupa vaga deste.
    expect(seatsOf(c, [license({ email: 'z@x.com', contractId: 'ct2' })]).used).toBe(0);
  });
});

describe('Empresas: vigência, situações e filtros', () => {
  it('o contrato vale do início ao fim, inclusive os dois dias', () => {
    const c = contract({ startsOn: '2026-10-01', endsOn: '2026-10-31' });
    expect(contractIsOpen(c, '2026-09-30')).toBe(false);
    expect(contractIsOpen(c, '2026-10-01')).toBe(true);
    expect(contractIsOpen(c, '2026-10-31')).toBe(true);
    expect(contractIsOpen(c, '2026-11-01')).toBe(false);
    expect(contractIsOpen(contract({ endsOn: null }), '2099-01-01')).toBe(true);
    expect(contractState(c, '2026-09-30')).toBe('futuro');
    expect(contractState(c, '2026-10-15')).toBe('vigente');
    expect(contractState(c, '2026-11-01')).toBe('encerrado');
  });

  it('o contrato da tela e do relatório é o vigente no dia, e não o mais antigo da lista', () => {
    const first = contract({ id: 'ct-1', startsOn: '2025-01-01', endsOn: '2025-12-31' });
    const renewed = contract({ id: 'ct-2', startsOn: '2026-01-01', endsOn: null });
    // Contrato renovado: o primeiro terminou e o segundo vale, em qualquer ordem da lista.
    expect(currentContract([first, renewed], '2026-10-20')?.id).toBe('ct-2');
    expect(currentContract([renewed, first], '2026-10-20')?.id).toBe('ct-2');
    // Vigente com fim no futuro (inclusive no último dia).
    const ending = contract({ id: 'ct-3', startsOn: '2026-01-01', endsOn: '2026-12-31' });
    expect(currentContract([first, ending], '2026-10-20')?.id).toBe('ct-3');
    expect(currentContract([first, ending], '2026-12-31')?.id).toBe('ct-3');
    // Todos vencidos: o de início mais recente.
    const old = contract({ id: 'ct-4', startsOn: '2024-01-01', endsOn: '2024-12-31' });
    expect(currentContract([old, first], '2026-10-20')?.id).toBe('ct-1');
    expect(currentContract([first, old], '2026-10-20')?.id).toBe('ct-1');
    // Um só contrato, vigente ou não, e nenhum.
    expect(currentContract([renewed], '2026-10-20')?.id).toBe('ct-2');
    expect(currentContract([first], '2026-10-20')?.id).toBe('ct-1');
    expect(currentContract([], '2026-10-20')).toBeNull();
  });

  it('a situação na tela: o convite cancelado é dito à parte; a contagem junta cancelados e encerrados', () => {
    const list = [
      license({ email: 'a@x.com' }),
      license({ email: 'b@x.com', status: 'ativa', activatedAt: '2026-10-01T12:00:00.000Z' }),
      license({ email: 'c@x.com', status: 'encerrada', activatedAt: '2026-10-01T12:00:00.000Z', endedAt: '2026-10-05T12:00:00.000Z' }),
      license({ email: 'd@x.com', status: 'encerrada', cancelledAt: '2026-10-05T12:00:00.000Z' }),
    ];
    expect(list.map(licenseKind)).toEqual(['convidada', 'ativa', 'encerrada', 'cancelada']);
    expect(licenseCounts(list)).toEqual({ todas: 4, convidada: 1, ativa: 1, encerrada: 2 });
    expect(filterLicenses(list, 'encerrada').map((l) => l.email)).toEqual(['c@x.com', 'd@x.com']);
    expect(filterLicenses(list, 'todas').map((l) => l.email)).toEqual(['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com']);
    expect(filterLicenses([list[2]!, list[1]!, list[0]!], 'todas').map((l) => l.status)).toEqual(['convidada', 'ativa', 'encerrada']);
    expect(filterLicenses(list, 'ativa')).toHaveLength(1);
  });

  it('as 30 dias de acesso pleno e o dia em que o acesso termina no fuso da pessoa', () => {
    expect(BENEFIT_GRACE_DAYS).toBe(30);
    expect(accessUntilDay('2026-11-06T23:59:59.000Z', 'America/Sao_Paulo')).toBe('2026-11-06');
    // 01:00 UTC ainda é o dia anterior em São Paulo.
    expect(accessUntilDay('2026-11-07T01:00:00.000Z', 'America/Sao_Paulo')).toBe('2026-11-06');
    expect(accessUntilDay(null, 'America/Sao_Paulo')).toBeNull();
  });
});

describe('Empresas: código, link, lista e CSV', () => {
  const code = '0123456789abcdef0123456789abcdef';

  it('o código do convite da empresa tem 128 bits em 32 hexadecimais, como o da Família', () => {
    expect(LICENSE_CODE_PATTERN.test(code)).toBe(true);
    expect(normalizeLicenseCode(`  ${code.toUpperCase()}\n`)).toBe(code);
    for (const bad of ['', 'abc', `${code}0`, 'zz'.repeat(16), null, 12]) expect(normalizeLicenseCode(bad)).toBeNull();
    expect(licenseCodeHash(code)).toBe(sha256Hex(code));
    expect(licenseCodeHash('abc')).toBeNull();
  });

  it('o link é o endereço do app mais /beneficio/<código>, e o código sai de um link colado (e não de um link da Família)', () => {
    expect(licenseLink(code)).toBe(`https://app.clarevo.app.br/beneficio/${code}`);
    expect(licenseLink(code, 'http://localhost:8199/')).toBe(`http://localhost:8199/beneficio/${code}`);
    expect(licenseCodeFromText(licenseLink(code))).toBe(code);
    expect(licenseCodeFromText(`Seu convite: ${licenseLink(code)}. Abra e aceite.`)).toBe(code);
    expect(licenseCodeFromText(code)).toBe(code);
    expect(licenseCodeFromText(`https://clarevo.pages.dev/beneficio/${code.toUpperCase()}`)).toBe(code);
    expect(licenseCodeFromText(`https://clarevo.pages.dev/convite/${code}`)).toBeNull();
    expect(licenseCodeFromText(`https://clarevo.pages.dev/beneficio/${code}0`)).toBeNull();
    expect(licenseCodeFromText('https://clarevo.pages.dev/beneficio/abc')).toBeNull();
    expect(licenseCodeFromText(null)).toBeNull();
  });

  const results: LicenseInviteResult[] = [
    { email: 'ana@x.com', outcome: 'convidada', code, license: license({ email: 'ana@x.com' }) },
    { email: 'bia@x.com', outcome: 'ja_convidado', code: null, license: license({ email: 'bia@x.com' }) },
    { email: 'caio+rh@x.com', outcome: 'convidada', code: 'fedcba9876543210fedcba9876543210', license: license({ email: 'caio+rh@x.com' }) },
  ];

  it('as linhas são só de quem ganhou convite novo (o código existe só nesse momento)', () => {
    const rows = inviteLinkRows(results, 'http://localhost:8199');
    expect(rows).toEqual([
      { email: 'ana@x.com', link: `http://localhost:8199/beneficio/${code}` },
      { email: 'caio+rh@x.com', link: 'http://localhost:8199/beneficio/fedcba9876543210fedcba9876543210' },
    ]);
  });

  it('"Copiar todos": uma linha por pessoa, com o e-mail e o link', () => {
    const rows = inviteLinkRows(results);
    expect(buildInviteListText(rows)).toBe(`ana@x.com: https://app.clarevo.app.br/beneficio/${code}\ncaio+rh@x.com: https://app.clarevo.app.br/beneficio/fedcba9876543210fedcba9876543210`);
    expect(buildInviteListText([])).toBe('');
  });

  it('"Baixar lista": CSV como o das exportações, com BOM, ponto e vírgula, fim de linha do Excel, cabeçalho e uma linha por pessoa', () => {
    const csv = buildInviteCsv(inviteLinkRows(results));
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    const lines = csv.slice(CSV_BOM.length).split(CSV_EOL);
    expect(lines[0]).toBe(CSV_INVITE_HEADER.join(';'));
    expect(CSV_INVITE_HEADER).toEqual(['E-mail', 'Link']);
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe(`ana@x.com;https://app.clarevo.app.br/beneficio/${code}`);
    expect(lines[3]).toBe('');
    // Fórmula em planilha: e-mail que começa com + ou - ganha o apóstrofo de proteção.
    const risky = buildInviteCsv([{ email: '+55@x.com', link: 'https://clarevo.pages.dev/beneficio/aa' }, { email: '-a@x.com', link: 'https://clarevo.pages.dev/beneficio/bb' }]);
    expect(risky).toContain("'+55@x.com;");
    expect(risky).toContain("'-a@x.com;");
    expect(buildInviteCsv([]).slice(CSV_BOM.length)).toBe(`E-mail;Link${CSV_EOL}`);
    expect(inviteCsvFileName('2026-10-07')).toBe('clarevo-convites-2026-10-07.csv');
  });
});

describe('Empresas: textos', () => {
  it('as cinco ações da empresa', () => {
    expect(COMPANY_ACTIONS).toHaveLength(5);
    for (const a of COMPANY_ACTIONS) expect(isCompanyAction(a)).toBe(true);
    expect(isCompanyAction('criar')).toBe(false);
    expect(isCompanyAction('criar_familia')).toBe(false);
  });

  it('nenhum texto da empresa tem termo proibido, travessão, expressão vetada, marca de gênero ou palavra de julgamento', () => {
    const texts = companyTextSamples();
    expect(texts.length).toBeGreaterThan(120);
    for (const text of texts) {
      expect(text, text).not.toMatch(FORBIDDEN);
      expect(text, text).not.toMatch(GENDERED);
      expect(text, text).not.toMatch(JUDGMENT);
    }
  });

  it('a explicação de privacidade diz o que a empresa não vê e o que vê, sem indicador de entradas no app', () => {
    expect(COMPANY_PRIVACY).toBe('A empresa não vê valores, categorias, metas, contas, cartões nem a Família de ninguém, nem somados.');
    expect(COMPANY_TEXT.privacy).toBe(COMPANY_PRIVACY);
    expect(BENEFIT_TEXT.whoSees).toContain(COMPANY_PRIVACY);
    // O indicador "pessoas que entraram no mês" saiu depois da revisão de segurança de 16/10/2026: nenhum texto o menciona.
    expect(BENEFIT_TEXT.whoSees).toContain('Ela não vê se ou quando você usa o app depois de aceitar.');
    expect(BENEFIT_TEXT.whoSees).toContain('(convite enviado, convite cancelado, ativa ou encerrada)');
    expect(companyTextSamples().join(' ')).not.toMatch(/pessoas que entraram|entraram no app|Aparece a partir de|5 pessoas ativas/);
    expect(COMPANY_TEXT).not.toHaveProperty('usageHidden');
    expect(COMPANY_TEXT).not.toHaveProperty('usageJoined');
    expect(COMPANY_TEXT.usageIntro).toBe('Só a contagem das licenças. A empresa não vê quem entrou no app, nem quando, nem o que cada pessoa faz nele.');
    expect(COMPANY_TEXT.endBody).toContain('30 dias');
    expect(COMPANY_TEXT.endBody).toContain('nada é apagado');
  });

  it('rótulos de plano, situação e filtro', () => {
    expect(BENEFIT_PLAN_LABEL).toEqual({ individual: 'Individual', familiar: 'Familiar' });
    expect(LICENSE_FILTER_LABEL).toEqual({ todas: 'Todas', convidada: 'Convidadas', ativa: 'Ativas', encerrada: 'Encerradas' });
    expect(LICENSE_KIND_LABEL.cancelada).toBe('Convite cancelado');
  });

  it('textos para divulgar: quatro fixos, mais um do mês nos meses com tema de época, sem dado de ninguém', () => {
    const ids = (month: string) => promoTexts(`2026-${month}-10`).map((p) => p.id);
    expect(ids('08')).toEqual(['anuncio', 'como-entrar', 'lembrete', 'privacidade']);
    expect(ids('09')).toEqual(['anuncio', 'como-entrar', 'lembrete', 'privacidade']);
    for (const m of ['01', '02', '03', '04', '05', '06', '07', '10', '11', '12']) expect(ids(m), m).toEqual(['anuncio', 'como-entrar', 'lembrete', 'privacidade', 'neste-mes']);
    const outubro = promoTexts('2026-10-07').find((p) => p.id === 'neste-mes')!;
    expect(outubro.title).toBe('Neste mês: outubro');
    expect(outubro.text).toContain('Em outubro');
    expect(outubro.text).toContain('13º salário');
    const junho = promoTexts('2026-06-10').find((p) => p.id === 'neste-mes')!;
    expect(junho.text).toContain('Férias');
    for (const m of ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']) {
      for (const p of promoTexts(`2026-${m}-10`)) {
        expect(p.title.trim(), p.id).not.toBe('');
        expect(p.text.length, p.id).toBeGreaterThan(40);
        expect(p.text.length, p.id).toBeLessThan(600);
        // Nada de e-mail, valor em reais nem número de pessoa: os textos são os mesmos para qualquer empresa.
        expect(p.text, p.id).not.toMatch(/@|R\$\s?\d/);
      }
    }
  });

  it('erros: texto de cada código; o desconhecido cai em "Não foi possível salvar"', () => {
    for (const code of COMPANY_ERROR_CODES) expect(companyErrorText(code), code).not.toBe(COMPANY_ERROR_TEXT.salvar_falhou);
    expect(companyErrorText('qualquer_coisa')).toBe(COMPANY_ERROR_TEXT.salvar_falhou);
    expect(companyErrorText('convite_invalido')).toBe(BENEFIT_TEXT.invalid);
    expect(companyErrorText('vagas_insuficientes')).toContain('vagas livres');
  });
});

/** Os arquivos do app são lidos como texto (as telas dependem do Expo e não entram no teste do core). */
const APP_SRC = fileURLToPath(new URL('../../../apps/app/src/', import.meta.url));
const appFile = (rel: string): string => readFileSync(`${APP_SRC}${rel}`, 'utf8');

describe('Empresas: telas do app (lidas como código-fonte)', () => {
  it('o painel só existe na web: a tela mostra o aviso no celular, e o card de Conta só aparece na web, para quem administra', () => {
    const screen = appFile('app/empresa/index.tsx');
    expect(screen).toContain("Platform.OS === 'web' ? <Panel /> : <Message text={T.webOnly} />");
    // Quem não administra nenhuma organização lê a mensagem de acesso, não um painel vazio.
    expect(screen).toContain('if (!company) return <Message text={T.notAdmin} />');
    const conta = appFile('app/conta.tsx');
    expect(conta).toContain("Platform.OS === 'web' && (companies.data?.length ?? 0) > 0");
    expect(conta).toContain('COMPANY_TEXT.accountOpen');
    // No celular, o card nem pergunta ao banco quais empresas a pessoa administra.
    const hooks = appFile('state/company.ts');
    expect(hooks).toMatch(/Platform\.OS === 'web'/);
    expect(COMPANY_TEXT.webOnly).toContain('só na web');
    expect(COMPANY_TEXT.notAdmin).toContain('equipe da Clarevo');
  });

  it('as rotas: o painel está entre as telas protegidas e o convite da empresa abre com ou sem conta, sem barra', () => {
    const layout = appFile('app/_layout.tsx');
    // O bloco das telas de quem já tem espaço (pronto), não o das telas de entrada.
    const start = layout.indexOf("<Stack.Protected guard={!inRecovery && status === 'pronto'}>");
    expect(start).toBeGreaterThan(0);
    const protectedBlock = layout.slice(start, layout.indexOf('</Stack.Protected>', start));
    expect(protectedBlock).toContain('name="empresa/index"');
    expect(protectedBlock).not.toContain('beneficio/[codigo]');
    expect(layout).toContain('<Stack.Screen name="beneficio/[codigo]" />');
    expect(existsSync(`${APP_SRC}app/empresa/index.tsx`)).toBe(true);
    expect(existsSync(`${APP_SRC}app/beneficio/[codigo].tsx`)).toBe(true);
    expect(barModeFor('/empresa')).toBe('consulta');
    expect(barModeFor('/beneficio/0123456789abcdef0123456789abcdef')).toBe('formulario');
  });

  it('o app nunca lê o resumo do código nem a pessoa da licença, e nunca grava licença direto: só as funções', () => {
    const repo = appFile('lib/supabase-repository.ts');
    const company = repo.slice(repo.indexOf('// Empresas (D-056): as sete funções da migração 0014'), repo.indexOf('/** Linha de family_member_items. */'));
    expect(company.length).toBeGreaterThan(2000);
    expect(company).not.toMatch(/code_hash|person_id/);
    expect(company).not.toMatch(/\.(insert|update|delete|upsert)\(/);
    for (const fn of ['invite_licenses', 'renew_license_invite', 'cancel_license_invite', 'end_license', 'preview_license_invite', 'accept_license', 'organization_usage']) {
      expect(company, fn).toContain(`'${fn}'`);
    }
    expect(company).toContain("from('my_benefit')");
  });

  it('o card "Uso do app" mostra só as quatro contagens de licenças: nada de entradas no app, de acesso nem de pessoas', () => {
    const panel = appFile('components/company-panel.tsx');
    const card = panel.slice(panel.indexOf('export function UsageCard'), panel.indexOf('// Relatório de adesão (D-062)'));
    expect(card.length).toBeGreaterThan(300);
    for (const label of ['usageSeats', 'usageInvited', 'usageActive', 'usageEnded']) expect(card, label).toContain(`T.${label}`);
    expect((card.match(/<Row /g) ?? []).length).toBe(4);
    expect(card).not.toMatch(/joined|entra|sign_?in|usageVisible|usageMinimum/i);
    // O banco e o app não leem nem devolvem o último acesso de ninguém.
    const repo = appFile('lib/supabase-repository.ts');
    expect(repo).not.toMatch(/joined_this_month|usage_visible|usage_minimum|last_sign_in/);
    expect(appFile('state/company.ts')).not.toMatch(/joined|last_sign_in/i);
  });

  it('o painel não lê nenhuma tabela de finanças: só os hooks da empresa', () => {
    for (const rel of ['app/empresa/index.tsx', 'components/company-panel.tsx', 'components/benefit-card.tsx', 'app/beneficio/[codigo].tsx']) {
      const text = appFile(rel);
      expect(text, rel).not.toMatch(/\buseWork\b|\buseFamily\b|listRecords|listCommitments|listGoals|listCards|financial_records|getSpace/);
    }
  });
});
