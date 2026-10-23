/// <reference types="node" />
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Segunda etapa do site (D-066, `docs/22_SITE.md`, seções 8.2 a 8.4): o worker do Cloudflare Pages que recebe o formulário de contato
 * (Resend) e o cadastro das Novidades por e-mail (Brevo), os formulários "prontos e desligados", o kit de imprensa e os textos jurídicos
 * propostos. O worker roda aqui no Node 22, com `Request`, `Response` e `fetch` globais e o `fetch` simulado: nenhum envio de verdade.
 */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SITE = join(ROOT, 'site');
const require = createRequire(import.meta.url);
const gerador = require(join(ROOT, 'scripts', 'gerar-site.js')) as {
  gerarSite: (o?: Record<string, unknown>) => { arquivos: Map<string, string | Buffer>; avisos: string[]; pendencias: Map<string, string[]> };
  lerDados: (arquivo: string) => { dados: Record<string, unknown>; avisos: string[] };
  MARCADORES: string[];
};
const formularios = require(join(ROOT, 'scripts', 'site', 'formularios.js')) as { TAMANHOS: Record<string, number>; FAIXAS: { valor: string; rotulo: string }[]; ISCA: string; LIMITES: unknown };
const texto = (v: string | Buffer | undefined): string => (typeof v === 'string' ? v : v ? v.toString('utf8') : '');
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const PREENCHIDOS: Record<string, string> = {
  'RAZÃO SOCIAL': 'Empresa Exemplo Ltda',
  CNPJ: '00.000.000/0001-00',
  ENDEREÇO: 'Rua Exemplo, 1, Rio de Janeiro',
  'E-MAIL DE PRIVACIDADE': 'privacidade@exemplo.test',
  'E-MAIL DE SUPORTE': 'suporte@exemplo.test',
  'E-MAIL DE CONTATO': 'contato@exemplo.test',
  DOMÍNIO: 'exemplo.test',
  'DATA DE VIGÊNCIA': '1 de janeiro de 2027',
};

// ------------------------------------------------------------------------------------------------------------------------------
// O worker

type Worker = { fetch: (request: Request, env: Record<string, unknown>) => Promise<Response> };
let worker: Worker;
let fonteDoWorker: string;
beforeAll(async () => {
  fonteDoWorker = readFileSync(join(SITE, '_worker.js'), 'utf8');
  // É um módulo ES sem importações: entra por um endereço data:, como o Cloudflare o carrega.
  worker = (await import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(fonteDoWorker).toString('base64')}`)).default as Worker;
});
afterEach(() => vi.unstubAllGlobals());

const ENV_CONTATO = { RESEND_API_KEY: 'chave-so-de-teste-resend', CONTATO_DESTINO: 'contato@exemplo.test', CONTATO_REMETENTE: 'Clarevo <site@exemplo.test>' };
const ENV_NEWSLETTER = { BREVO_API_KEY: 'chave-so-de-teste-brevo', BREVO_LISTA_ID: '7', BREVO_MODELO_CONFIRMACAO_ID: '3' };
const CONTATO_OK = { nome: 'Pessoa de Teste', email: 'Pessoa@Exemplo.test', empresa: 'Empresa Exemplo', faixa: '51-200', mensagem: 'Quero conversar sobre um piloto.' };

const assets = () => ({ fetch: vi.fn(async () => new Response('<h1>estático</h1>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })) });
const envCom = (extra: Record<string, unknown> = {}) => ({ ...extra, ASSETS: assets() });

/** `fetch` simulado: guarda cada chamada e responde como o serviço de e-mail. */
function simularFetch(status = 200) {
  const chamadas: { url: string; init: RequestInit; corpo: Record<string, unknown> }[] = [];
  const f = vi.fn(async (url: string, init: RequestInit) => {
    chamadas.push({ url: String(url), init, corpo: JSON.parse(String(init.body)) as Record<string, unknown> });
    return new Response('{}', { status });
  });
  vi.stubGlobal('fetch', f);
  return { f, chamadas };
}

function post(rota: string, campos: Record<string, unknown>, opcoes: { accept?: string; origin?: string; json?: boolean; tamanho?: number } = {}): Request {
  const cabecalhos: Record<string, string> = {};
  if (opcoes.accept) cabecalhos.accept = opcoes.accept;
  if (opcoes.origin) cabecalhos.origin = opcoes.origin;
  let corpo: string;
  if (opcoes.json) {
    cabecalhos['content-type'] = 'application/json';
    corpo = JSON.stringify(campos);
  } else {
    cabecalhos['content-type'] = 'application/x-www-form-urlencoded';
    corpo = new URLSearchParams(Object.entries(campos).map(([k, v]) => [k, String(v)])).toString();
  }
  if (opcoes.tamanho !== undefined) cabecalhos['content-length'] = String(opcoes.tamanho);
  return new Request(`https://clarevo.test${rota}`, { method: 'POST', headers: cabecalhos, body: corpo });
}
const json = async (r: Response) => (await r.json()) as { ok: boolean; erro: string | null; mensagem: string; campos?: string[] };

describe('site público: _worker.js, contato (Resend)', () => {
  it('sem as variáveis, a rota responde 503 com mensagem clara e não envia nada', async () => {
    const { f } = simularFetch();
    const r = await worker.fetch(post('/api/contato', CONTATO_OK), envCom());
    expect(r.status).toBe(503);
    const c = await json(r);
    expect(c).toMatchObject({ ok: false, erro: 'indisponivel' });
    expect(c.mensagem).toContain('ainda não está ligado');
    expect(f).not.toHaveBeenCalled();
    // Falta qualquer uma das três variáveis.
    for (const falta of Object.keys(ENV_CONTATO)) {
      const env = { ...ENV_CONTATO, [falta]: '' };
      expect((await worker.fetch(post('/api/contato', CONTATO_OK), envCom(env))).status, falta).toBe(503);
    }
    expect(f).not.toHaveBeenCalled();
  });

  it('método diferente de POST dá 405, com Allow: POST', async () => {
    simularFetch();
    for (const metodo of ['GET', 'PUT', 'DELETE', 'PATCH']) {
      const r = await worker.fetch(new Request('https://clarevo.test/api/contato', { method: metodo }), envCom(ENV_CONTATO));
      expect(r.status, metodo).toBe(405);
      expect(r.headers.get('allow')).toBe('POST');
    }
    expect((await worker.fetch(new Request('https://clarevo.test/api/newsletter', { method: 'GET' }), envCom(ENV_NEWSLETTER))).status).toBe(405);
  });

  it('o campo-isca preenchido é descartado sem enviar, com a mesma resposta de um envio de verdade', async () => {
    const { f } = simularFetch();
    const r = await worker.fetch(post('/api/contato', { ...CONTATO_OK, [formularios.ISCA]: 'http://spam.example' }), envCom(ENV_CONTATO));
    expect(r.status).toBe(200);
    expect(await json(r)).toMatchObject({ ok: true });
    expect(f).not.toHaveBeenCalled();
    // Mesmo com os outros campos vazios, o robô não aprende nada: a resposta é a de sucesso.
    const vazio = await worker.fetch(post('/api/contato', { [formularios.ISCA]: 'x' }), envCom(ENV_CONTATO));
    expect(vazio.status).toBe(200);
    expect(f).not.toHaveBeenCalled();
  });

  it('valida tamanho, e-mail e faixa, e diz quais campos estão errados, sem enviar', async () => {
    const { f } = simularFetch();
    const T = formularios.TAMANHOS;
    const casos: [string, Record<string, unknown>, string][] = [
      ['nome vazio', { ...CONTATO_OK, nome: '   ' }, 'nome'],
      ['nome grande', { ...CONTATO_OK, nome: 'a'.repeat(T.nome! + 1) }, 'nome'],
      ['e-mail sem arroba', { ...CONTATO_OK, email: 'pessoa.exemplo.test' }, 'email'],
      ['e-mail sem domínio', { ...CONTATO_OK, email: 'pessoa@exemplo' }, 'email'],
      ['e-mail com espaço', { ...CONTATO_OK, email: 'pe ssoa@exemplo.test' }, 'email'],
      ['e-mail enorme', { ...CONTATO_OK, email: `${'a'.repeat(T.email!)}@exemplo.test` }, 'email'],
      ['empresa vazia', { ...CONTATO_OK, empresa: '' }, 'empresa'],
      ['empresa grande', { ...CONTATO_OK, empresa: 'e'.repeat(T.empresa! + 1) }, 'empresa'],
      ['faixa que não existe', { ...CONTATO_OK, faixa: 'um-milhao' }, 'faixa'],
      ['faixa vazia', { ...CONTATO_OK, faixa: '' }, 'faixa'],
      ['mensagem vazia', { ...CONTATO_OK, mensagem: '' }, 'mensagem'],
      ['mensagem grande', { ...CONTATO_OK, mensagem: 'm'.repeat(T.mensagem! + 1) }, 'mensagem'],
    ];
    for (const [nome, campos, campo] of casos) {
      const r = await worker.fetch(post('/api/contato', campos), envCom(ENV_CONTATO));
      expect(r.status, nome).toBe(400);
      const c = await json(r);
      expect(c.erro, nome).toBe('dados');
      expect(c.campos, nome).toContain(campo);
    }
    expect(f).not.toHaveBeenCalled();
    // No limite exato, passa.
    const limite = { ...CONTATO_OK, nome: 'a'.repeat(T.nome!), empresa: 'e'.repeat(T.empresa!), mensagem: 'm'.repeat(T.mensagem!) };
    expect((await worker.fetch(post('/api/contato', limite), envCom(ENV_CONTATO))).status).toBe(200);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('o corpo enviado ao Resend traz só os campos do formulário, com o texto escapado, e a chave só no cabeçalho', async () => {
    const { chamadas } = simularFetch();
    const campos = { nome: 'Pessoa <b>de</b> "Teste"', email: 'Pessoa@Exemplo.TEST', empresa: "Empresa & Filhos <script>alert('x')</script>", faixa: '201-1000', mensagem: 'Linha 1\r\nLinha 2 <img src=x onerror=alert(1)>\n\n\n\nLinha 3 & fim' };
    const r = await worker.fetch(post('/api/contato', campos, { origin: 'https://clarevo.test' }), envCom(ENV_CONTATO));
    expect(r.status).toBe(200);
    expect(chamadas).toHaveLength(1);
    const [c] = chamadas;
    expect(c!.url).toBe('https://api.resend.com/emails');
    expect(c!.init.method).toBe('POST');
    expect(c!.init.headers).toMatchObject({ Authorization: 'Bearer chave-so-de-teste-resend', 'Content-Type': 'application/json' });
    // Nada além dos campos: nem IP, nem navegador, nem a chave no corpo.
    expect(Object.keys(c!.corpo).sort()).toEqual(['from', 'html', 'reply_to', 'subject', 'text', 'to']);
    expect(c!.corpo).toMatchObject({ from: 'Clarevo <site@exemplo.test>', to: ['contato@exemplo.test'], reply_to: 'pessoa@exemplo.test' });
    const html = String(c!.corpo.html);
    expect(html).toContain('Pessoa &lt;b&gt;de&lt;/b&gt; &quot;Teste&quot;');
    expect(html).toContain('Empresa &amp; Filhos &lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toMatch(/<(script|img|b)\b/i);
    expect(html).toContain('Linha 1<br>Linha 2');
    expect(html).not.toContain('\n\n\n');
    expect(html).toContain('De 201 a 1.000 pessoas');
    const t = String(c!.corpo.text);
    expect(t).toContain('Nome: Pessoa <b>de</b> "Teste"');
    expect(t).toContain('Número aproximado de pessoas: De 201 a 1.000 pessoas');
    expect(JSON.stringify(c!.corpo)).not.toContain('chave-so-de-teste');
    // O assunto é de uma linha só.
    expect(String(c!.corpo.subject)).toBe("Contato pelo site: Empresa & Filhos <script>alert('x')</script>");
    const comQuebra = await worker.fetch(post('/api/contato', { ...CONTATO_OK, empresa: 'Uma\r\nBcc: alguem@exemplo.test' }), envCom(ENV_CONTATO));
    expect(comQuebra.status).toBe(200);
    expect(String(chamadas[1]!.corpo.subject)).not.toMatch(/[\r\n]/);
  });

  it('aceita o envio em JSON, recusa o corpo grande demais (413) e o corpo ilegível (400)', async () => {
    const { chamadas } = simularFetch();
    expect((await worker.fetch(post('/api/contato', CONTATO_OK, { json: true }), envCom(ENV_CONTATO))).status).toBe(200);
    expect(chamadas).toHaveLength(1);
    expect((await worker.fetch(post('/api/contato', CONTATO_OK, { tamanho: 25 * 1024 }), envCom(ENV_CONTATO))).status).toBe(413);
    const enorme = await worker.fetch(post('/api/contato', { ...CONTATO_OK, mensagem: 'x'.repeat(30 * 1024) }), envCom(ENV_CONTATO));
    expect(enorme.status).toBe(413);
    const ilegivel = new Request('https://clarevo.test/api/contato', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nao e json' });
    expect((await worker.fetch(ilegivel, envCom(ENV_CONTATO))).status).toBe(400);
    expect(chamadas).toHaveLength(1);
  });

  it('só o próprio site envia: Origin de outro endereço dá 403 (e "null", que o navegador manda com no-referrer, vale)', async () => {
    const { chamadas } = simularFetch();
    expect((await worker.fetch(post('/api/contato', CONTATO_OK, { origin: 'https://outro-site.example' }), envCom(ENV_CONTATO))).status).toBe(403);
    expect((await worker.fetch(post('/api/contato', CONTATO_OK, { origin: 'null' }), envCom(ENV_CONTATO))).status).toBe(200);
    expect((await worker.fetch(post('/api/contato', CONTATO_OK, { origin: 'https://clarevo.test' }), envCom(ENV_CONTATO))).status).toBe(200);
    expect(chamadas).toHaveLength(2);
  });

  it('se o Resend falhar ou o pedido não sair, responde 502 e nada fica guardado', async () => {
    simularFetch(500);
    const r = await worker.fetch(post('/api/contato', CONTATO_OK), envCom(ENV_CONTATO));
    expect(r.status).toBe(502);
    expect(await json(r)).toMatchObject({ ok: false, erro: 'falha' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('rede fora do ar'); }));
    expect((await worker.fetch(post('/api/contato', CONTATO_OK), envCom(ENV_CONTATO))).status).toBe(502);
  });

  it('um envio de formulário (o navegador pede HTML) vira redirecionamento para a página de resposta; sem pedir HTML, vale o status', async () => {
    simularFetch();
    const html = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
    const ok = await worker.fetch(post('/api/contato', CONTATO_OK, { accept: html }), envCom(ENV_CONTATO));
    expect(ok.status).toBe(303);
    expect(ok.headers.get('location')).toBe('/contato-enviado');
    for (const campos of [{ ...CONTATO_OK, email: 'x' }, CONTATO_OK]) {
      const semVariaveis = await worker.fetch(post('/api/contato', campos, { accept: html }), envCom());
      expect(semVariaveis.status).toBe(303);
      expect(semVariaveis.headers.get('location')).toBe('/contato-erro');
    }
    const invalido = await worker.fetch(post('/api/contato', { ...CONTATO_OK, email: 'x' }, { accept: html }), envCom(ENV_CONTATO));
    expect(invalido.headers.get('location')).toBe('/contato-erro');
    simularFetch(500);
    const falha = await worker.fetch(post('/api/contato', CONTATO_OK, { accept: html }), envCom(ENV_CONTATO));
    expect(falha.headers.get('location')).toBe('/contato-erro');
    // Quem pede JSON (ou não diz o que aceita) ganha o status de verdade.
    expect((await worker.fetch(post('/api/contato', CONTATO_OK, { accept: 'application/json' }), envCom())).status).toBe(503);
  });

  it('as respostas do worker levam os cabeçalhos de segurança do site, sem cache', async () => {
    simularFetch();
    const r = await worker.fetch(post('/api/contato', CONTATO_OK), envCom(ENV_CONTATO));
    expect(r.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(r.headers.get('content-security-policy')).toContain("form-action 'self'");
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('referrer-policy')).toBe('no-referrer');
  });
});

describe('site público: _worker.js, Novidades por e-mail (Brevo)', () => {
  it('sem as variáveis (ou com id que não é número), 503 e nada é cadastrado', async () => {
    const { f } = simularFetch();
    const campos = { email: 'leitora@exemplo.test', consentimento: 'sim' };
    expect((await worker.fetch(post('/api/newsletter', campos), envCom())).status).toBe(503);
    for (const quebra of [{ BREVO_API_KEY: '' }, { BREVO_LISTA_ID: '' }, { BREVO_MODELO_CONFIRMACAO_ID: 'abc' }, { BREVO_LISTA_ID: '0' }]) {
      expect((await worker.fetch(post('/api/newsletter', campos), envCom({ ...ENV_NEWSLETTER, ...quebra }))).status, JSON.stringify(quebra)).toBe(503);
    }
    expect(f).not.toHaveBeenCalled();
  });

  it('sem a caixa de consentimento, nada é cadastrado (400); com e-mail inválido, também não', async () => {
    const { f } = simularFetch();
    for (const consentimento of [undefined, '', 'nao', 'talvez']) {
      const campos: Record<string, unknown> = { email: 'leitora@exemplo.test' };
      if (consentimento !== undefined) campos.consentimento = consentimento;
      const r = await worker.fetch(post('/api/newsletter', campos), envCom(ENV_NEWSLETTER));
      expect(r.status, String(consentimento)).toBe(400);
      expect((await json(r)).erro).toBe('consentimento');
    }
    for (const email of ['', 'x', 'a@b', 'a b@c.de', `${'a'.repeat(260)}@exemplo.test`]) {
      const r = await worker.fetch(post('/api/newsletter', { email, consentimento: 'sim' }), envCom(ENV_NEWSLETTER));
      expect(r.status, email).toBe(400);
      expect((await json(r)).campos).toContain('email');
    }
    expect(f).not.toHaveBeenCalled();
  });

  it('o corpo enviado ao Brevo é só o e-mail, a lista, o modelo de confirmação e o endereço de retorno', async () => {
    const { chamadas } = simularFetch();
    const r = await worker.fetch(post('/api/newsletter', { email: ' Leitora@Exemplo.TEST ', consentimento: 'sim' }, { origin: 'https://clarevo.test' }), envCom(ENV_NEWSLETTER));
    expect(r.status).toBe(200);
    expect(chamadas).toHaveLength(1);
    const [c] = chamadas;
    expect(c!.url).toBe('https://api.brevo.com/v3/contacts/doubleOptinConfirmation');
    expect(c!.init.method).toBe('POST');
    expect(c!.init.headers).toMatchObject({ 'api-key': 'chave-so-de-teste-brevo', 'Content-Type': 'application/json' });
    expect(c!.corpo).toEqual({ email: 'leitora@exemplo.test', includeListIds: [7], templateId: 3, redirectionUrl: 'https://clarevo.test/novidades/receber-confirmado' });
    expect(JSON.stringify(c!.corpo)).not.toContain('chave-so-de-teste');
    // O endereço de retorno pode vir do painel.
    await worker.fetch(post('/api/newsletter', { email: 'leitora@exemplo.test', consentimento: 'on' }), envCom({ ...ENV_NEWSLETTER, BREVO_URL_RETORNO: 'https://exemplo.test/novidades/receber-confirmado' }));
    expect(chamadas[1]!.corpo.redirectionUrl).toBe('https://exemplo.test/novidades/receber-confirmado');
  });

  it('campo-isca, origem, método, falha do Brevo e redirecionamento seguem as regras do contato', async () => {
    const { chamadas } = simularFetch();
    const campos = { email: 'leitora@exemplo.test', consentimento: 'sim' };
    expect((await worker.fetch(post('/api/newsletter', { ...campos, [formularios.ISCA]: 'x' }), envCom(ENV_NEWSLETTER))).status).toBe(200);
    expect(chamadas).toHaveLength(0);
    expect((await worker.fetch(post('/api/newsletter', campos, { origin: 'https://outro-site.example' }), envCom(ENV_NEWSLETTER))).status).toBe(403);
    const html = 'text/html,*/*;q=0.8';
    const ok = await worker.fetch(post('/api/newsletter', campos, { accept: html }), envCom(ENV_NEWSLETTER));
    expect([ok.status, ok.headers.get('location')]).toEqual([303, '/novidades/receber-enviado']);
    const semCaixa = await worker.fetch(post('/api/newsletter', { email: 'leitora@exemplo.test' }, { accept: html }), envCom(ENV_NEWSLETTER));
    expect([semCaixa.status, semCaixa.headers.get('location')]).toEqual([303, '/novidades/receber-erro']);
    simularFetch(400);
    expect((await worker.fetch(post('/api/newsletter', campos), envCom(ENV_NEWSLETTER))).status).toBe(502);
  });
});

describe('site público: _worker.js, o resto cai nos arquivos estáticos', () => {
  it('qualquer outra rota vai para env.ASSETS.fetch, com os cabeçalhos de segurança, sem tocar na resposta', async () => {
    const { f } = simularFetch();
    for (const rota of ['/', '/empresas/', '/aprender/juros', '/api/outra', '/api/contato/extra', '/estilo.css', '/qualquer-coisa']) {
      const env = envCom();
      const pedido = new Request(`https://clarevo.test${rota}`);
      const r = await worker.fetch(pedido, env);
      expect(env.ASSETS.fetch, rota).toHaveBeenCalledTimes(1);
      expect(env.ASSETS.fetch).toHaveBeenCalledWith(pedido);
      expect(r.status).toBe(200);
      expect(await r.text()).toBe('<h1>estático</h1>');
      expect(r.headers.get('content-type')).toBe('text/html; charset=utf-8');
      expect(r.headers.get('content-security-policy')).toContain("script-src 'self'");
      expect(r.headers.get('x-frame-options')).toBe('DENY');
    }
    // Um POST em outra rota também vai para os arquivos (e o status 404 do Pages passa intacto).
    const env = { ASSETS: { fetch: vi.fn(async () => new Response('não achei', { status: 404 })) } };
    const r = await worker.fetch(new Request('https://clarevo.test/x', { method: 'POST', body: 'a=1' }), env);
    expect(r.status).toBe(404);
    expect(f).not.toHaveBeenCalled();
  });

  it('o arquivo gravado não tem segredo, não escreve log nem usa armazenamento, e traz os limites do gerador', () => {
    // Sem os comentários (que explicam o que o worker NÃO usa): nada de log, de armazenamento da Cloudflare nem de segredo escrito.
    const codigo = fonteDoWorker.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(codigo).not.toMatch(/console\.|\bKV\b|D1Database|\bR2\b|\.put\(|localStorage|process\.env|re_[A-Za-z0-9]{16,}|xkeysib-|Bearer [A-Za-z0-9]{12,}/);
    expect(codigo).not.toMatch(/\benv\.[A-Z_]+_KV\b|env\.DB\b/);
    expect(fonteDoWorker).not.toMatch(/[–—]/);
    expect(fonteDoWorker).not.toMatch(/faz\w*\s+sentido/i);
    expect(fonteDoWorker).not.toMatch(/\/\*(LIMITES|CABECALHOS)\*\//);
    expect(fonteDoWorker).toContain(JSON.stringify(formularios.LIMITES));
    expect(fonteDoWorker).toContain('export default');
    // Só as duas rotas e os dois serviços.
    expect([...fonteDoWorker.matchAll(/https:\/\/[a-z.]+\/[A-Za-z0-9/._-]*/g)].map((m) => m[0]).sort()).toEqual(['https://api.brevo.com/v3/contacts/doubleOptinConfirmation', 'https://api.resend.com/emails']);
    expect(readFileSync(join(SITE, '_routes.json'), 'utf8')).toBe('{"version":1,"include":["/api/*"],"exclude":[]}\n');
  });
});

// ------------------------------------------------------------------------------------------------------------------------------
// Formulários prontos e desligados

describe('site público: formulários prontos e desligados', () => {
  const desligado = gerador.gerarSite({ dados: { ...PREENCHIDOS }, referencia: '2026-10-23' });
  const ligado = gerador.gerarSite({ dados: { ...PREENCHIDOS, formulario_contato: true, newsletter: true }, referencia: '2026-10-23' });
  const h = (g: typeof ligado, nome: string) => texto(g.arquivos.get(nome));
  const PAGINAS_DO_CONTATO = ['contato-enviado.html', 'contato-erro.html'];
  const PAGINAS_DA_NEWSLETTER = ['novidades/receber.html', 'novidades/receber-enviado.html', 'novidades/receber-confirmado.html', 'novidades/receber-erro.html'];

  it('desligados (o padrão do repositório), o site fica como era: o e-mail de contato, sem formulário e sem as páginas de resposta', () => {
    const dados = JSON.parse(readFileSync(join(SITE, 'dados-da-empresa.json'), 'utf8')) as Record<string, unknown>;
    expect(dados.formulario_contato).toBe(false);
    expect(dados.newsletter).toBe(false);
    for (const nome of [...PAGINAS_DO_CONTATO, ...PAGINAS_DA_NEWSLETTER]) expect(desligado.arquivos.has(nome), nome).toBe(false);
    // (A busca da Ajuda é um campo `type="search"` sem formulário e sem envio: só ela pode ter `<input>`.)
    for (const [nome, v] of desligado.arquivos) {
      if (!nome.endsWith('.html')) continue;
      expect(texto(v), nome).not.toMatch(/<form\b|<textarea\b|<select\b|\/api\/(contato|newsletter)/);
      for (const m of texto(v).matchAll(/<input\b[^>]*>/g)) expect(m[0], nome).toContain('type="search"');
    }
    expect(h(desligado, 'empresas/index.html')).toContain('escreva para <a href="mailto:contato@exemplo.test">contato@exemplo.test</a>');
    expect(h(desligado, 'novidades/index.html')).not.toContain('Receber as Novidades por e-mail');
    expect(h(desligado, 'index.html')).not.toContain('Novidades por e-mail');
    // O worker existe mesmo assim (pronto), e só atende /api/*.
    expect(desligado.arquivos.has('_worker.js')).toBe(true);
  });

  it('só o booleano true liga: texto, número e "true" entre aspas não ligam, e o gerador avisa', () => {
    for (const valor of ['true', 'sim', 1, null]) {
      const g = gerador.gerarSite({ dados: { ...PREENCHIDOS, formulario_contato: valor, newsletter: valor } });
      expect(g.arquivos.has('contato-enviado.html'), String(valor)).toBe(false);
      expect(g.arquivos.has('novidades/receber.html'), String(valor)).toBe(false);
    }
    const dir = mkdtempSync(join(tmpdir(), 'clarevo-interruptores-'));
    try {
      writeFileSync(join(dir, 'dados.json'), JSON.stringify({ ...Object.fromEntries(gerador.MARCADORES.map((m) => [m, ''])), formulario_contato: 'true', newsletter: true }));
      const { dados, avisos } = gerador.lerDados(join(dir, 'dados.json'));
      expect(dados.formulario_contato).toBe(false);
      expect(dados.newsletter).toBe(true);
      expect(avisos.join('\n')).toContain('"formulario_contato" deve ser true ou false');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('ligado, "Para empresas" tem o formulário de contato completo, com os mesmos tamanhos do worker, campo-isca e o texto de privacidade', () => {
    const e = h(ligado, 'empresas/index.html');
    const form = /<form class="formulario" method="post" action="\/api\/contato">([\s\S]*?)<\/form>/.exec(e)?.[1] ?? '';
    expect(form).not.toBe('');
    const T = formularios.TAMANHOS;
    expect(form).toMatch(new RegExp(`name="nome" type="text" maxlength="${T.nome}" required`));
    expect(form).toMatch(new RegExp(`name="email" type="email" maxlength="${T.email}" required`));
    expect(form).toMatch(new RegExp(`name="empresa" type="text" maxlength="${T.empresa}" required`));
    expect(form).toMatch(new RegExp(`name="mensagem" rows="6" maxlength="${T.mensagem}" required`));
    expect(form).toContain('<select id="ct-faixa" name="faixa" required>');
    for (const f of formularios.FAIXAS) expect(form).toContain(`<option value="${f.valor}">${esc(f.rotulo)}</option>`);
    for (const rotulo of ['Nome', 'E-mail', 'Empresa', 'Número aproximado de pessoas que poderiam receber o benefício', 'Mensagem']) expect(form).toContain(`>${rotulo}</label>`);
    // Campo-isca: escondido por classe (o estilo inline é proibido), fora do teclado e do leitor de tela.
    expect(form).toContain(`<div class="campo-isca" aria-hidden="true"><label for="ct-${formularios.ISCA}">Não preencha este campo</label><input id="ct-${formularios.ISCA}" name="${formularios.ISCA}" type="text" tabindex="-1" autocomplete="off"></div>`);
    expect(e).not.toMatch(/\sstyle\s*=/);
    expect(form).toContain('type="submit">Enviar mensagem</button>');
    // O texto de privacidade vem junto: para que serve, que o site não guarda, e o link para a política.
    expect(e).toContain('O que acontece com a sua mensagem');
    expect(e).toContain('só para responder sobre o Clarevo para empresas');
    expect(e).toContain('O site não guarda a mensagem');
    expect(e).toContain('Resend');
    expect(e).toContain('<a href="../privacidade.html">Política de privacidade</a>');
    // O e-mail de contato continua à mão, para quem prefere.
    expect(e).toContain('escreva para <a href="mailto:contato@exemplo.test">contato@exemplo.test</a>');
    // Só há um campo de cada tipo que o gerador conhece.
    expect([...e.matchAll(/<input\b[^>]*type="([a-z]+)"/g)].map((m) => m[1]).sort()).toEqual(['email', 'text', 'text', 'text']);
  });

  it('ligado, a newsletter pede e-mail e consentimento (caixa obrigatória e desmarcada), explica a confirmação por e-mail e liga para a política', () => {
    for (const nome of ['novidades/index.html', 'novidades/receber.html']) {
      const p = h(ligado, nome);
      const form = /<form class="formulario" method="post" action="\/api\/newsletter">([\s\S]*?)<\/form>/.exec(p)?.[1] ?? '';
      expect(form, nome).not.toBe('');
      expect(form).toMatch(/<input id="nv-consentimento" name="consentimento" type="checkbox" value="sim" required>/);
      expect(form).not.toMatch(/checked/);
      expect(form).toContain('<label for="nv-consentimento">Quero receber as Novidades do Clarevo por e-mail. Posso cancelar quando quiser.</label>');
      expect(form).toMatch(new RegExp(`name="email" type="email" maxlength="${formularios.TAMANHOS.email}" required`));
      expect(form).toContain(`name="${formularios.ISCA}"`);
      expect(p).toContain('Confirmação por e-mail');
      expect(p).toContain('Só começa a receber as Novidades depois de clicar no link dela');
      expect(p).toContain('link para cancelar');
      expect(p).toContain('Brevo');
      expect(p).toMatch(/<a href="(\.\.\/)?privacidade\.html">Política de privacidade<\/a>/);
    }
    const r = h(ligado, 'novidades/receber.html');
    expect(r).toContain('dupla confirmação');
    expect(r).toContain('Sem a caixa marcada, nada é cadastrado');
    for (const [nome, titulo] of [['novidades/receber-enviado.html', 'Falta só confirmar'], ['novidades/receber-confirmado.html', 'Cadastro confirmado'], ['novidades/receber-erro.html', 'Não foi possível cadastrar'], ['contato-enviado.html', 'Mensagem enviada'], ['contato-erro.html', 'Não foi possível enviar']] as const) {
      const p = h(ligado, nome);
      expect(p, nome).toContain(`<h1>${titulo}</h1>`);
      expect(p, nome).toContain('<meta name="robots" content="noindex">');
      expect(p, nome).not.toMatch(/<form\b|<script\b/);
    }
    expect(h(ligado, 'novidades/receber-enviado.html')).toContain('Até você confirmar, não enviamos as Novidades');
    // As páginas de resposta são exatamente as que o worker usa nos redirecionamentos.
    for (const destino of ['/contato-enviado', '/contato-erro', '/novidades/receber-enviado', '/novidades/receber-erro']) {
      expect(fonteDoWorkerDeFora(), destino).toContain(destino);
      expect(ligado.arquivos.has(`${destino.slice(1)}.html`), destino).toBe(true);
    }
    expect(fonteDoWorkerDeFora()).toContain('/novidades/receber-confirmado');
    expect(ligado.arquivos.has('novidades/receber-confirmado.html')).toBe(true);
  });

  it('ligados, as páginas de resposta não entram na busca (noindex) e o rodapé ganha "Novidades por e-mail" só com a newsletter ligada', () => {
    expect(h(ligado, 'index.html')).toContain('<a href="novidades/receber.html">Novidades por e-mail</a>');
    expect(h(desligado, 'index.html')).not.toContain('novidades/receber.html');
    const soContato = gerador.gerarSite({ dados: { ...PREENCHIDOS, formulario_contato: true } });
    expect(soContato.arquivos.has('contato-enviado.html')).toBe(true);
    expect(soContato.arquivos.has('novidades/receber.html')).toBe(false);
    expect(texto(soContato.arquivos.get('novidades/index.html'))).not.toContain('<form');
    const soNewsletter = gerador.gerarSite({ dados: { ...PREENCHIDOS, newsletter: true } });
    expect(soNewsletter.arquivos.has('contato-enviado.html')).toBe(false);
    expect(texto(soNewsletter.arquivos.get('empresas/index.html'))).not.toContain('<form');
  });

  it('o gerador não deixa chave, senha nem token em nenhum arquivo, nem no JSON da empresa', () => {
    for (const g of [desligado, ligado]) {
      for (const [nome, v] of g.arquivos) {
        if (!/\.(html|js|json|xml|txt|css)$/.test(nome)) continue;
        expect(texto(v), nome).not.toMatch(/re_[A-Za-z0-9]{16,}|xkeysib-[A-Za-z0-9-]{10,}|Bearer [A-Za-z0-9._-]{16,}|sk_(live|test)_/);
      }
    }
    expect(Object.keys(JSON.parse(readFileSync(join(SITE, 'dados-da-empresa.json'), 'utf8')) as object).filter((k) => /chave|senha|token|secret|key/i.test(k))).toEqual([]);
  });
});

/** O worker gravado em `site/`, para conferir os destinos dos redirecionamentos. */
function fonteDoWorkerDeFora(): string {
  return readFileSync(join(SITE, '_worker.js'), 'utf8');
}

// ------------------------------------------------------------------------------------------------------------------------------
// Kit de imprensa

describe('site público: kit de imprensa', () => {
  const g = gerador.gerarSite();
  const h = texto(g.arquivos.get('imprensa.html'));
  const origem = JSON.parse(readFileSync(join(ROOT, 'site-src', 'imprensa', 'origem.json'), 'utf8')) as Record<string, { sha256: string; png: string; largura: number; altura: number }>;
  const NOMES = ['clarevo-logotipo', 'clarevo-logotipo-reverso', 'clarevo-logotipo-uma-cor', 'clarevo-simbolo', 'clarevo-simbolo-reverso', 'clarevo-simbolo-uma-cor'];

  it('o logotipo e o símbolo são os SVG de docs/marca, sem retoque, e os PNG saíram desses mesmos SVG (o resumo SHA-256 confere)', () => {
    for (const nome of NOMES) {
      const svg = readFileSync(join(ROOT, 'docs', 'marca', `${nome}.svg`));
      expect((g.arquivos.get(`imprensa/${nome}.svg`) as Buffer).equals(svg), nome).toBe(true);
      expect(readFileSync(join(SITE, 'imprensa', `${nome}.svg`)).equals(svg), `site/imprensa/${nome}.svg`).toBe(true);
      const o = origem[`${nome}.svg`]!;
      expect(o.sha256, `${nome}: o SVG de docs/marca mudou, refaça os PNG com node scripts/gerar-marca-imprensa.js`).toBe(createHash('sha256').update(svg).digest('hex'));
      const png = g.arquivos.get(`imprensa/${nome}.png`) as Buffer;
      expect(png.subarray(1, 4).toString('ascii'), nome).toBe('PNG');
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], nome).toEqual([o.largura, o.altura]);
      expect(png[25], `${nome}: PNG com transparência (RGBA)`).toBe(6);
      expect(png.length, nome).toBeLessThan(150 * 1024);
      expect(h).toContain(`href="imprensa/${nome}.svg" download`);
      expect(h).toContain(`href="imprensa/${nome}.png" download`);
    }
  });

  it('traz cores, fonte (Manrope, licença OFL), contato e regras de uso do logotipo da marca', () => {
    for (const hex of ['#2457F5', '#D4F05B', '#17223B']) expect(h).toContain(`<code>${hex}</code>`);
    expect(h).toContain('RGB 36, 87, 245');
    expect(h).toContain('RGB 212, 240, 91');
    expect(h).toContain('RGB 23, 34, 59');
    expect(h).toContain('Manrope');
    expect(h).toContain('SIL Open Font License 1.1');
    expect(h).toContain('href="fontes/OFL.txt"');
    expect(h).toContain('[E-MAIL DE CONTATO]');
    expect(h).toContain('tirar o ponto lima, trocar a cor dele ou usar o nome do logotipo sem o ponto');
    expect(h).toContain('redesenhar o logotipo');
    expect(h).toContain('usar o símbolo no lugar do logotipo em cabeçalhos');
  });

  it('as descrições prontas têm uma frase, 50 e 100 palavras, e só dizem o que o produto faz', () => {
    const descricao = (id: string) => {
      const m = new RegExp(`<article class="cartao descricao" id="${id}">[\\s\\S]*?<p>([\\s\\S]*?)</p>`).exec(h);
      expect(m, id).not.toBeNull();
      return m![1]!.replace(/&amp;/g, '&').replace(/&quot;/g, '"');
    };
    const palavras = (t: string) => t.trim().split(/\s+/).length;
    expect(palavras(descricao('cinquenta'))).toBe(50);
    expect(palavras(descricao('cem'))).toBe(100);
    expect(descricao('uma-frase')).toMatch(/^O Clarevo é um aplicativo/);
    expect(descricao('uma-frase').match(/\./g)).toHaveLength(1);
    expect(h).toContain('50 palavras</span>');
    expect(h).toContain('100 palavras</span>');
    const todas = ['uma-frase', 'cinquenta', 'cem'].map(descricao).join(' ');
    // Fiel ao produto (não é banco, não recomenda produto financeiro, sem anúncio) e sem promessa que o código não cumpre.
    expect(descricao('cem')).toContain('não é banco');
    expect(descricao('cem')).toContain('não recomenda produtos financeiros');
    expect(descricao('cem')).toContain('não tem anúncios e não vende dados');
    expect(descricao('cem')).toContain('até seis pessoas');
    expect(todas).not.toMatch(/melhor|grátis|gratuito|garant|rendimento|investiment|oferta de crédito|concede crédito|milh|mil usu|prêmio/i);
    expect(todas).not.toMatch(/[–—]/);
  });

  it('não traz números de uso, clientes nem prêmios, e diz isso', () => {
    expect(h).toContain('O kit não traz números de uso, clientes nem prêmios.');
    const semAviso = h.replace('O kit não traz números de uso, clientes nem prêmios.', '').replace(/<[^>]+>/g, ' ');
    expect(semAviso).not.toMatch(/prêmio|premiad|\bclientes\b|usuári[oa]s|downloads?|baixaram|milhões|milhares/i);
  });

  it('tem 6 capturas da demonstração, em tamanho original, com texto alternativo e a legenda de dados fictícios', () => {
    const capturas = ['01-resumo', '02-anotar-gasto', '03-contas-a-pagar', '04-cartoes', '05-evolucao', '06-metas'];
    const lojas = ['01_resumo', '02_anotar_gasto', '03_contas_a_pagar', '04_cartoes', '05_evolucao', '07_metas'];
    expect(capturas.length).toBeGreaterThanOrEqual(4);
    expect(capturas.length).toBeLessThanOrEqual(6);
    capturas.forEach((nome, i) => {
      const original = readFileSync(join(ROOT, 'docs', 'lojas', 'capturas', 'apple-iphone-6-3pol-1206x2622', `${lojas[i]}.png`));
      expect((g.arquivos.get(`imprensa/capturas/${nome}.png`) as Buffer).equals(original), nome).toBe(true);
      expect(h).toContain(`href="imprensa/capturas/${nome}.png" download>Baixar em tamanho original (1206 x 2622 px,`);
    });
    expect([...h.matchAll(/<figcaption>Dados fictícios de demonstração<\/figcaption>/g)]).toHaveLength(capturas.length);
    expect(h).toContain('a etiqueta "Demonstração" aparece no próprio app');
    for (const m of h.matchAll(/<img\b[^>]*src="imagens\/[^"]+"[^>]*>/g)) expect(m[0]).toMatch(/\salt="[^"]{20,}"/);
  });

  it('a página entra no rodapé e no sitemap, e tem um h1 só', () => {
    expect(texto(g.arquivos.get('index.html'))).toContain('<a href="imprensa.html">Imprensa</a>');
    expect(h.match(/<h1[\s>]/g)).toHaveLength(1);
    const comDominio = gerador.gerarSite({ dados: { ...PREENCHIDOS } });
    expect(texto(comDominio.arquivos.get('sitemap.xml'))).toContain('<loc>https://exemplo.test/imprensa</loc>');
    expect(texto(comDominio.arquivos.get('imprensa.html'))).not.toContain('noindex');
  });
});

// ------------------------------------------------------------------------------------------------------------------------------
// Política, resumo e documentos

describe('site público: textos jurídicos propostos e documentação (D-066)', () => {
  const politica = readFileSync(join(ROOT, 'docs', 'legal', 'politica-de-privacidade.md'), 'utf8');
  const resumo = readFileSync(join(ROOT, 'docs', 'legal', 'resumo-para-advogado.md'), 'utf8');
  const secao = (md: string, titulo: string) => {
    const i = md.indexOf(titulo);
    expect(i, titulo).toBeGreaterThan(-1);
    const resto = md.slice(i + titulo.length);
    return resto.slice(0, resto.search(/\n#{2,3} /));
  };

  it('a política tem a seção proposta do contato pelo site: dados, finalidade, base, Resend e Cloudflare como operadores, sem guarda no site e prazo a definir', () => {
    const s = secao(politica, '### 3.6 Contato pelo site');
    expect(s).toContain('[PROPOSTA:');
    for (const trecho of ['Nome, e-mail, nome da empresa', 'faixa do número aproximado de pessoas', 'Para responder ao seu contato sobre o Clarevo para empresas', 'O site não guarda a mensagem', 'Cloudflare', 'Resend', 'operadores', '[A DEFINIR: prazo na caixa de e-mail]']) expect(s, trecho).toContain(trecho);
    expect(politica).toMatch(/Contato pelo formulário do site \(seção 3\.6\): \[PROPOSTA: procedimentos preliminares/);
  });

  it('a política tem a seção proposta das Novidades por e-mail: consentimento, Brevo, descadastro e dupla confirmação', () => {
    const s = secao(politica, '### 3.7 Novidades por e-mail');
    expect(s).toContain('[PROPOSTA:');
    for (const trecho of ['O seu e-mail', 'Consentimento', 'desmarcada', 'dupla confirmação', 'Brevo', 'link para cancelar', 'O site não grava o e-mail']) expect(s, trecho).toContain(trecho);
    expect(politica).toMatch(/Novidades por e-mail \(seção 3\.7\): consentimento \(art\. 7º, I\)/);
    expect(politica).toContain('- **Resend** (envio da mensagem do formulário de contato do site');
    expect(politica).toContain('- **Brevo** (Novidades por e-mail');
  });

  it('a seção de cookies cita as estatísticas do painel da Cloudflare, sem script, como proposta para o advogado', () => {
    const s = secao(politica, '## 10. Cookies e rastreadores');
    expect(s).toContain('[PROPOSTA: para saber quantas pessoas visitam o site, usamos só as estatísticas de tráfego que a própria Cloudflare mostra no painel');
    expect(s).toContain('sem script na página e sem cookie');
    expect(s).toContain('não usamos cookies próprios, script de análise de acesso nem recurso de terceiros carregado no navegador');
  });

  it('o resumo para o advogado tem a seção "Novidades desde o envio ao advogado", com as perguntas numeradas na sequência (26 em diante)', () => {
    expect(resumo).toContain('## h) Novidades desde o envio ao advogado (D-066');
    const numeros = [...secao(resumo, '**Perguntas novas**').matchAll(/^(\d+)\. \*\*/gm)].map((m) => Number(m[1]));
    expect(numeros.length).toBeGreaterThanOrEqual(5);
    expect(numeros).toEqual(numeros.map((_, i) => 26 + i));
    // A seção e vai até a 25 e não foi renumerada.
    expect([...secao(resumo, '## e) Perguntas ao advogado').matchAll(/^(\d+)\. \*\*/gm)].map((m) => Number(m[1]))).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    expect(resumo).toContain('responder as 25 perguntas da seção e e as da seção h');
    for (const assunto of ['Formulário de contato', 'Prazo da mensagem', 'consentimento', 'Descadastro', 'Transferência internacional', 'Estatísticas de tráfego', 'Marca e kit de imprensa']) expect(resumo.toLowerCase(), assunto).toContain(assunto.toLowerCase());
  });

  it('os documentos de D-066 existem: ligar o formulário e a newsletter passo a passo, sem chave, e a contagem de visitas sem script', () => {
    const doc22 = readFileSync(join(ROOT, 'docs', '22_SITE.md'), 'utf8');
    for (const nome of ['RESEND_API_KEY', 'CONTATO_DESTINO', 'CONTATO_REMETENTE', 'BREVO_API_KEY', 'BREVO_LISTA_ID', 'BREVO_MODELO_CONFIRMACAO_ID', 'BREVO_URL_RETORNO']) expect(doc22, nome).toContain(nome);
    for (const trecho of ['## 9. Ligar o formulário e as Novidades por e-mail', '### 8.1 Calculadoras', '### 8.2 Kit de imprensa', '### 8.3 Formulário de contato', '### 8.4 Novidades por e-mail', '### 8.5 Contagem de visitas sem cookies', 'Web Analytics', 'Nunca cole uma chave de API', '**5. Conferir depois de ligar**', 'formulario_contato']) expect(doc22, trecho).toContain(trecho);
    for (const arquivo of ['22_SITE.md', '20_SENTRY_E_EMAIL.md', '07_PUBLICACAO_WEB.md', '16_PUBLICACAO_LOJAS.md']) {
      const t = readFileSync(join(ROOT, 'docs', arquivo), 'utf8');
      expect(t, arquivo).not.toMatch(/re_[A-Za-z0-9]{16,}|xkeysib-[A-Za-z0-9-]{10,}/);
    }
    expect(readFileSync(join(ROOT, 'docs', '20_SENTRY_E_EMAIL.md'), 'utf8')).toContain('Resend');
    expect(readFileSync(join(ROOT, 'docs', '20_SENTRY_E_EMAIL.md'), 'utf8')).toContain('Brevo');
    expect(readFileSync(join(ROOT, 'docs', '07_PUBLICACAO_WEB.md'), 'utf8')).toContain('_worker.js');
  });
});
