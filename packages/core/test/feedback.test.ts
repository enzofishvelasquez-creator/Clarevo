import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ERROR_TEXT,
  FEEDBACK_TEXT,
  LOAD_ERROR_TEXT,
  RepoError,
  SCREEN_ERROR_TEXT,
  SUPPORT_EMAIL,
  VERSION_TEXT,
  appVersionLine,
  buildProfileName,
  deviceLabel,
  feedbackBody,
  feedbackMailto,
  loadErrorText,
  screenFromSegments,
  supportReportLines,
  systemLabel,
  updateLabel,
  type AppReportInfo,
} from '../src';

/**
 * Sugestões e problemas, versão do app e telas de erro (teste com pessoas, 16/11/2026). O e-mail leva só versão, build, atualização,
 * perfil, sistema, aparelho e o caminho da tela sem identificadores: nunca nome, e-mail, valores, categorias nem identificadores.
 */
const UPDATE = '1a2b3c4d-1111-2222-3333-444455556666';

const COMPLETO: AppReportInfo = {
  version: '1.0.1',
  build: '7',
  updateId: UPDATE,
  embedded: false,
  profile: 'preview',
  system: 'Android 14 (API 34)',
  device: 'samsung SM-A515F',
  screen: '/registro/[id]/editar',
};

describe('versão do app (última linha de Conta)', () => {
  it('versão, build e os 8 primeiros caracteres da atualização; sem atualização baixada, "original do build"', () => {
    expect(appVersionLine(COMPLETO)).toBe('Versão 1.0.1 (build 7) · atualização 1a2b3c4d');
    expect(appVersionLine({ ...COMPLETO, embedded: true })).toBe('Versão 1.0.1 (build 7) · original do build');
    expect(appVersionLine({ ...COMPLETO, updateId: null, embedded: false })).toBe('Versão 1.0.1 (build 7) · original do build');
    // Na web: só a versão.
    expect(appVersionLine({ version: '1.0.1', build: null }, false)).toBe('Versão 1.0.1');
    expect(VERSION_TEXT.version('1.0.1', '12')).toBe('Versão 1.0.1 (build 12)');
  });

  it('identificador da atualização: só hexadecimal, em minúsculas; qualquer outra coisa vira "original do build"', () => {
    expect(updateLabel(UPDATE, false)).toBe('1a2b3c4d');
    expect(updateLabel(UPDATE.toUpperCase(), false)).toBe('1a2b3c4d');
    expect(updateLabel(UPDATE, true)).toBe(VERSION_TEXT.original);
    expect(updateLabel('', false)).toBe(VERSION_TEXT.original);
    expect(updateLabel('maria@exemplo.com', false)).toBe(VERSION_TEXT.original);
    expect(updateLabel(undefined, undefined)).toBe(VERSION_TEXT.original);
  });

  it('perfil do build (environment do Sentry): o canal, ou "desconhecido"', () => {
    for (const canal of ['preview', 'preview-sem-widget', 'production']) expect(buildProfileName(canal)).toBe(canal);
    for (const ruim of [null, undefined, '', 'Preview', 'meu perfil', 'a/b', 'x'.repeat(41)]) expect(buildProfileName(ruim)).toBe('desconhecido');
  });
});

describe('sistema e aparelho', () => {
  it('Android: versão do sistema, nível da API, fabricante e modelo (sem número de série nem a impressão digital do build)', () => {
    const constants = { Release: '14', Model: 'SM-A515F', Manufacturer: 'samsung', Brand: 'samsung', Serial: 'R58M123ABC', Fingerprint: 'samsung/a51/a51:14/x' };
    expect(systemLabel('android', 34, constants)).toBe('Android 14 (API 34)');
    expect(deviceLabel('android', constants)).toBe('samsung SM-A515F');
    expect(deviceLabel('android', { Manufacturer: 'Google', Model: 'Pixel 8' })).toBe('Google Pixel 8');
    // O modelo que já começa com o fabricante não repete o nome.
    expect(deviceLabel('android', { Manufacturer: 'motorola', Model: 'motorola edge 40' })).toBe('motorola edge 40');
    expect(deviceLabel('android', {})).toBeNull();
  });

  it('iPhone: a versão do sistema e só "iPhone" ou "iPad" (nunca o nome do aparelho); web: "Navegador", sem aparelho', () => {
    expect(systemLabel('ios', '18.1', { interfaceIdiom: 'phone' })).toBe('iOS 18.1');
    expect(deviceLabel('ios', { interfaceIdiom: 'phone' })).toBe('iPhone');
    expect(deviceLabel('ios', { interfaceIdiom: 'pad' })).toBe('iPad');
    expect(systemLabel('web', undefined)).toBe('Navegador');
    expect(deviceLabel('web', null)).toBeNull();
  });

  it('caminho da tela pelos segmentos da rota: o nome da rota, nunca o valor do parâmetro', () => {
    expect(screenFromSegments(['orcamento', '[categoria]'])).toBe('/orcamento/[categoria]');
    expect(screenFromSegments(['(tabs)', 'index'])).toBe('/(tabs)/index');
    expect(screenFromSegments(['registro', '[id]', 'editar'])).toBe('/registro/[id]/editar');
    expect(screenFromSegments([])).toBe('/');
  });
});

describe('e-mail de sugestão ou problema', () => {
  it('assunto, espaço para escrever, a linha e só as informações técnicas', () => {
    expect(FEEDBACK_TEXT.subject).toBe('Clarevo · sugestão ou problema');
    expect(supportReportLines(COMPLETO)).toEqual([
      'Versão do app: 1.0.1 (build 7)',
      'Atualização: 1a2b3c4d',
      'Perfil do build: preview',
      'Sistema: Android 14 (API 34)',
      'Aparelho: samsung SM-A515F',
      'Tela: /registro/[id]/editar',
    ]);
    const body = feedbackBody(COMPLETO);
    const lines = body.split('\r\n');
    expect(lines[0]).toBe(FEEDBACK_TEXT.bodyIntro);
    // Linhas em branco para a pessoa escrever, antes da linha que separa.
    expect(lines.slice(1, 4)).toEqual(['', '', '']);
    expect(lines[4]).toBe(FEEDBACK_TEXT.separator);
    expect(lines[5]).toBe(FEEDBACK_TEXT.techTitle);
    expect(lines.slice(6)).toEqual(supportReportLines(COMPLETO));
  });

  it('o que não se sabe fica de fora (web, desenvolvimento)', () => {
    expect(supportReportLines({ version: '1.0.1', system: 'Navegador', screen: '/conta' })).toEqual([
      'Versão do app: 1.0.1',
      'Atualização: original do build',
      'Sistema: Navegador',
      'Tela: /conta',
    ]);
    expect(supportReportLines({})).toEqual(['Versão do app: ?', 'Atualização: original do build']);
  });

  it('nenhum dado pessoal sai no corpo, mesmo se o app passar algo estranho em algum campo', () => {
    const estranho: AppReportInfo = {
      version: '1.0.1 maria@exemplo.com',
      build: '7; Maria Silva',
      updateId: 'Maria-3f2b1c4d',
      profile: 'Maria Silva <maria@exemplo.com>',
      system: 'Android 14 maria.silva@gmail.com',
      device: 'maria@exemplo.com',
      screen: '/orcamento/Presente%20da%20Maria?valor=980,00',
    };
    const body = feedbackBody(estranho);
    expect(body).not.toContain('@');
    expect(body).not.toMatch(/maria|silva|980|Presente|gmail|3f2b1c4d/i);
    expect(body).toContain('Tela: /orcamento/[id]');
    expect(supportReportLines(estranho)).toEqual(['Versão do app: ?', 'Atualização: original do build', 'Tela: /orcamento/[id]']);
    expect(appVersionLine(estranho)).toBe('Versão ? · original do build');
    // Identificadores no caminho somem; parâmetros depois de "?" também.
    const comId = feedbackBody({ screen: '/meta/3f2b1c4d-1111-2222-3333-444455556666/movimento?valor=1234' });
    expect(comId).toContain('Tela: /meta/[id]/movimento');
    expect(comId).not.toMatch(/3f2b1c4d|1234/);
    // Caminho que não parece caminho fica de fora.
    expect(feedbackBody({ screen: 'Maria' })).not.toContain('Tela');
  });

  it('o mailto vai para o suporte, com assunto e corpo codificados e quebras de linha CRLF', () => {
    const url = feedbackMailto(COMPLETO);
    expect(url.startsWith(`mailto:${SUPPORT_EMAIL}?subject=`)).toBe(true);
    const query = new URLSearchParams(url.slice(url.indexOf('?') + 1));
    expect(query.get('subject')).toBe(FEEDBACK_TEXT.subject);
    expect(query.get('body')).toBe(feedbackBody(COMPLETO));
    expect(url).toContain('%0D%0A');
    // Espaço codificado como %20 (o "+" do formulário viraria "+" no programa de e-mail).
    expect(url).not.toContain('+');
    expect(FEEDBACK_TEXT.address).toBe(SUPPORT_EMAIL);
  });
});

describe('telas de erro', () => {
  it('falha ao carregar: sem conexão quando o repositório diz rede; senão, o texto de sempre', () => {
    expect(loadErrorText(new RepoError('rede'))).toBe(LOAD_ERROR_TEXT.offline);
    expect(loadErrorText({ code: 'rede' })).toBe(LOAD_ERROR_TEXT.offline);
    expect(loadErrorText(new RepoError('desconhecido'))).toBe(ERROR_TEXT.carregar_falhou);
    expect(loadErrorText(new Error('x'))).toBe(ERROR_TEXT.carregar_falhou);
    expect(loadErrorText(null)).toBe(ERROR_TEXT.carregar_falhou);
  });

  it('os textos pedidos, e as regras de texto: português, sem travessão, sem a expressão vetada, a marca no feminino', () => {
    expect(SCREEN_ERROR_TEXT.title).toBe('Algo deu errado nesta tela.');
    expect(SCREEN_ERROR_TEXT.retry).toBe('Tentar de novo');
    expect(SCREEN_ERROR_TEXT.home).toBe('Voltar ao Resumo');
    expect(SCREEN_ERROR_TEXT.report).toBe('Enviar um problema');
    expect(FEEDBACK_TEXT.button).toBe('Enviar sugestão ou problema');
    expect(LOAD_ERROR_TEXT.signOut).toBe('Sair da conta');
    const textos = [
      ...Object.values(FEEDBACK_TEXT).flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v))),
      ...Object.values(SCREEN_ERROR_TEXT),
      ...Object.values(LOAD_ERROR_TEXT),
      VERSION_TEXT.original,
      VERSION_TEXT.version('1.0.1', '7'),
      VERSION_TEXT.update('1a2b3c4d'),
      feedbackBody(COMPLETO),
    ];
    for (const texto of textos) {
      expect(texto, texto).not.toMatch(/[–—]/);
      expect(texto, texto).not.toMatch(/faz(er|endo)?\s+sentido/i);
      expect(texto, texto).not.toMatch(/(?<![\p{L}])(o|do|no|ao|pelo)\s+Clarevo/u);
      expect(texto, texto).not.toMatch(/\b(usuári[oa]|obrigad[oa]|bem-vind[oa])\b/i);
    }
  });
});

describe('no app', () => {
  const app = (f: string) => readFileSync(fileURLToPath(new URL(`../../../apps/app/src/${f}`, import.meta.url)), 'utf8');

  it('Conta: "Enviar sugestão ou problema" logo abaixo do perfil, a versão na última linha e "Escrever para o suporte" continua', () => {
    const conta = app('app/conta.tsx');
    const perfil = conta.indexOf('<ProfilePhotoActions />');
    const sugestao = conta.indexOf('FEEDBACK_TEXT.title');
    expect(perfil).toBeGreaterThan(0);
    expect(sugestao).toBeGreaterThan(perfil);
    expect(sugestao).toBeLessThan(conta.indexOf('<LevelCard />'));
    expect(conta).toContain('SUPPORT_TEXT.write');
    expect(conta.indexOf('appVersionLine(')).toBeGreaterThan(conta.indexOf('DELETE_TEXT.entryButton'));
  });

  it('a rede de segurança do app inteiro: ErrorBoundary exportado por _layout.tsx, que relata a falha e oferece enviar o problema', () => {
    expect(app('app/_layout.tsx')).toMatch(/export \{ RouteError as ErrorBoundary \} from '@\/components\/route-error';/);
    const tela = app('components/route-error.tsx');
    expect(tela).toContain('reportError(error');
    expect(tela).toContain('SCREEN_ERROR_TEXT.retry');
    expect(tela).toContain('SCREEN_ERROR_TEXT.home');
    expect(tela).toContain('SCREEN_ERROR_TEXT.report');
    // Os segmentos da rota, nunca o caminho com os valores (o nome de uma categoria, um código).
    expect(tela).toContain('useSegments()');
    expect(tela).not.toContain('usePathname');
  });

  it('carregando: sem conexão, "Sair da conta" e "Enviar um problema" debaixo do erro', () => {
    const tela = app('app/carregando.tsx');
    expect(tela).toContain('loadErrorText(');
    expect(tela).toContain('LOAD_ERROR_TEXT.signOut');
    expect(tela).toContain('LOAD_ERROR_TEXT.report');
  });

  it('a web não importa expo-updates nem expo-application (só a versão do celular, app-info.native.ts)', () => {
    const web = app('lib/app-info.ts');
    const native = app('lib/app-info.native.ts');
    expect(web).not.toMatch(/from ['"]expo-(updates|application)['"]|require\(['"]expo-(updates|application)/);
    expect(native).toContain("from 'expo-updates'");
    expect(native).toContain("from 'expo-application'");
  });
});
