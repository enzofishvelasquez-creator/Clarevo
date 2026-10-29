/// <reference types="node" />
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONTACT_EMAIL, LEGAL_TEXT, PRIVACY_EMAIL, SIGNUP_CONSENT_TEXT, SITE_PAGES, SUPPORT_EMAIL, SUPPORT_TEXT, normalizeSiteUrl, signupConsentParts, sitePageUrl } from '../src/legal';
import { COMPANY_ERROR_TEXT, COMPANY_TEXT } from '../src/company';

/**
 * Privacidade e termos dentro do app (D-064): os caminhos fixos das páginas do site, a regra do endereço (`EXPO_PUBLIC_SITE_URL`, lida
 * num único módulo do app, sem valor padrão), o texto do cadastro e os textos de Conta e de "Quem vê estes dados?".
 */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const ler = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const PROIBIDO = new RegExp(`[\\u2013\\u2014]|${['faz(er|endo)?', 'sentido'].join('\\s+')}|\\[(A DEFINIR|PROPOSTA)`, 'i');

function arquivos(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivos(caminho, achados);
    else if (/\.(tsx?|js)$/.test(nome)) achados.push(caminho);
  }
  return achados;
}

describe('endereço do site e caminhos das páginas', () => {
  it('as páginas são fixas e cada uma existe em site/', () => {
    expect(SITE_PAGES).toEqual({ privacidade: 'privacidade.html', termos: 'termos.html', exclusao: 'excluir-conta.html', suporte: 'suporte.html' });
    for (const arquivo of Object.values(SITE_PAGES)) expect(existsSync(join(ROOT, 'site', arquivo)), arquivo).toBe(true);
  });

  it('sem endereço (vazio, só espaços, indefinido) não há link; nenhum valor padrão', () => {
    for (const bruto of [undefined, null, '', '   ', '\n']) {
      expect(normalizeSiteUrl(bruto)).toBeNull();
      expect(sitePageUrl(bruto, 'privacidade')).toBeNull();
    }
  });

  it('só aceita endereço https (e http://localhost, para desenvolvimento); o resto vira "sem link"', () => {
    expect(normalizeSiteUrl('https://clarevo-site.pages.dev')).toBe('https://clarevo-site.pages.dev');
    expect(normalizeSiteUrl('  https://clarevo-site.pages.dev/  ')).toBe('https://clarevo-site.pages.dev');
    expect(normalizeSiteUrl('https://exemplo.test/site///')).toBe('https://exemplo.test/site');
    expect(normalizeSiteUrl('https://exemplo.test:8443')).toBe('https://exemplo.test:8443');
    expect(normalizeSiteUrl('http://localhost:8788')).toBe('http://localhost:8788');
    for (const ruim of ['clarevo-site.pages.dev', 'http://exemplo.test', 'ftp://exemplo.test', 'javascript:alert(1)', 'https://', 'https://exemplo test', 'https://exemplo.test/?a=1', 'https://exemplo.test/#x', 'https://-exemplo.test', 'não é endereço']) {
      expect(normalizeSiteUrl(ruim), ruim).toBeNull();
    }
  });

  it('o endereço de cada página junta o site e o caminho fixo, sem barra dupla', () => {
    expect(sitePageUrl('https://clarevo-site.pages.dev/', 'privacidade')).toBe('https://clarevo-site.pages.dev/privacidade.html');
    expect(sitePageUrl('https://exemplo.test', 'termos')).toBe('https://exemplo.test/termos.html');
    expect(sitePageUrl('https://exemplo.test', 'exclusao')).toBe('https://exemplo.test/excluir-conta.html');
    expect(sitePageUrl('https://exemplo.test/site', 'suporte')).toBe('https://exemplo.test/site/suporte.html');
    expect(sitePageUrl('endereço ruim', 'termos')).toBeNull();
  });

  it('EXPO_PUBLIC_SITE_URL é lida num só módulo do app, sem valor padrão no código', () => {
    const leituras = arquivos(join(ROOT, 'apps', 'app', 'src')).filter((f) => /process\.env\.EXPO_PUBLIC_SITE_URL/.test(readFileSync(f, 'utf8')));
    expect(leituras.map((f) => f.slice(ROOT.length))).toEqual([join('apps', 'app', 'src', 'lib', 'site.ts')]);
    const modulo = ler('apps/app/src/lib/site.ts');
    expect(modulo).toContain('normalizeSiteUrl(process.env.EXPO_PUBLIC_SITE_URL)');
    expect(modulo).not.toMatch(/EXPO_PUBLIC_SITE_URL\s*(\?\?|\|\|)/);
    // Nenhum endereço do site escrito no código do app: ele só vem da variável.
    for (const f of arquivos(join(ROOT, 'apps', 'app', 'src'))) expect(readFileSync(f, 'utf8'), f).not.toMatch(/clarevo-site|pages\.dev/);
  });

  it('a demonstração sobe com a variável vazia, e docs/07 e docs/16 explicam que ela só é configurada com o site publicado', () => {
    expect(ler('apps/app/scripts/export-demo.js')).toContain("EXPO_PUBLIC_SITE_URL: ''");
    for (const doc of ['docs/07_PUBLICACAO_WEB.md', 'docs/16_PUBLICACAO_LOJAS.md']) {
      const texto = ler(doc);
      expect(texto, doc).toContain('EXPO_PUBLIC_SITE_URL');
      expect(texto, doc).toMatch(/Sem ela, os links não aparecem|Sem a variável, os links não aparecem|Sem ela, os links/);
    }
  });
});

describe('texto do cadastro', () => {
  it('é a frase pedida, com os dois nomes como trechos de link', () => {
    expect(SIGNUP_CONSENT_TEXT).toBe('Ao criar a conta, você confirma que tem 18 anos ou mais e concorda com os Termos de uso e a Política de privacidade.');
    const partes = signupConsentParts();
    expect(partes.map((p) => p.text).join('')).toBe(SIGNUP_CONSENT_TEXT);
    expect(partes.filter((p) => p.page).map((p) => [p.text, p.page])).toEqual([['Termos de uso', 'termos'], ['Política de privacidade', 'privacidade']]);
  });

  it('a tela do cadastro usa o texto do core e só desenha link com endereço do site, acima do botão "Criar conta"', () => {
    const tela = ler('apps/app/src/app/criar-conta.tsx');
    expect(tela).toContain('signupConsentParts()');
    expect(tela).toMatch(/part\.page && SITE_URL/);
    expect(tela.indexOf('signupConsentParts()')).toBeLessThan(tela.indexOf('<Button label="Criar conta"'));
    expect(tela).not.toMatch(/Checkbox|Switch/);
  });
});

describe('textos de privacidade e termos no app', () => {
  it('nenhum texto mostra marcador, travessão nem a expressão proibida', () => {
    const todos = JSON.stringify(LEGAL_TEXT);
    expect(todos).not.toMatch(PROIBIDO);
    expect(SIGNUP_CONSENT_TEXT).not.toMatch(PROIBIDO);
  });

  it('Conta: a seção "Privacidade e termos" tem política, termos e "Excluir conta: como funciona"', () => {
    expect(LEGAL_TEXT.account.title).toBe('Privacidade e termos');
    expect(LEGAL_TEXT.account.privacy).toBe('Política de privacidade');
    expect(LEGAL_TEXT.account.terms).toBe('Termos de uso');
    expect(LEGAL_TEXT.account.deletion).toBe('Excluir conta: como funciona');
    const conta = ler('apps/app/src/app/conta.tsx');
    expect(conta).toMatch(/\{SITE_URL \? \(/);
    // A seção vem antes de "Sair deste aparelho", e "Excluir minha conta" continua sendo o último item.
    expect(conta.indexOf('LEGAL_TEXT.account.title')).toBeLessThan(conta.indexOf('label="Sair deste aparelho"'));
    expect(conta.indexOf('label="Sair deste aparelho"')).toBeLessThan(conta.indexOf('DELETE_TEXT.entry}'));
    expect(conta.lastIndexOf('<Card')).toBeGreaterThan(conta.indexOf('DELETE_TEXT.entry}') - 400);
  });

  it('"Quem vê estes dados?": diz "pessoa do app" no Pessoal e que a equipe não olha os dados no dia a dia, sem absoluto', () => {
    expect(LEGAL_TEXT.whoSees.personal).toBe('Única pessoa do app que vê, anota, edita e exclui registros em Pessoal.');
    expect(LEGAL_TEXT.whoSees.team).toContain('A equipe da Clarevo não olha os seus dados no dia a dia');
    expect(LEGAL_TEXT.whoSees.team).toContain('Só acessa quando a lei exigir ou para resolver um problema que você pediu.');
    expect(LEGAL_TEXT.whoSees.security).toContain('entre as pessoas do app, só você vê o espaço Pessoal');
    const tela = ler('apps/app/src/app/quem-ve.tsx');
    expect(tela).toContain('LEGAL_TEXT.whoSees.personal');
    expect(tela).toContain('LEGAL_TEXT.whoSees.team');
    expect(ler('apps/app/src/app/conta.tsx')).toContain('LEGAL_TEXT.whoSees.security');
  });
});

describe('Ajuda e contato', () => {
  it('os e-mails do app são os mesmos do site (site/dados-da-empresa.json)', () => {
    const dados = JSON.parse(ler('site/dados-da-empresa.json')) as Record<string, string>;
    expect(SUPPORT_EMAIL).toBe(dados['E-MAIL DE SUPORTE']);
    expect(CONTACT_EMAIL).toBe(dados['E-MAIL DE CONTATO']);
    expect(PRIVACY_EMAIL).toBe(dados['E-MAIL DE PRIVACIDADE']);
  });

  it('o card de Conta diz o endereço por escrito, sem depender do site, e os avisos da empresa apontam para um canal', () => {
    expect(SUPPORT_TEXT.hint).toContain(SUPPORT_EMAIL);
    // Pedidos sobre os dados vão para o e-mail de privacidade, como na política.
    expect(SUPPORT_TEXT.hint).toContain(`Pedidos sobre os seus dados: ${PRIVACY_EMAIL}.`);
    expect(SUPPORT_TEXT.writeFailed).toContain(SUPPORT_EMAIL);
    for (const texto of Object.values(SUPPORT_TEXT)) expect(texto).not.toMatch(PROIBIDO);
    const tela = ler('apps/app/src/app/conta.tsx');
    expect(tela).toContain('SUPPORT_TEXT.title');
    expect(tela).toContain('openSupportEmail');
    expect(COMPANY_TEXT.notAdmin).toContain(SUPPORT_EMAIL);
    // Nenhum texto manda "falar com a equipe" sem dizer como.
    const textos = JSON.stringify([COMPANY_TEXT, COMPANY_ERROR_TEXT]);
    expect(textos).not.toMatch(/fale com a equipe/i);
  });
});
