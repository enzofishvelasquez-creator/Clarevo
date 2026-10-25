/// <reference types="node" />
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
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
  gerarSite: (o?: Record<string, unknown>) => { arquivos: Map<string, string | Buffer>; avisos: string[]; pendencias: Map<string, string[]>; problemasFinais: string[] };
  lerDados: (arquivo: string) => { dados: Record<string, unknown>; avisos: string[] };
  MARCADORES: string[];
};
const formularios = require(join(ROOT, 'scripts', 'site', 'formularios.js')) as { TAMANHOS: Record<string, number>; FAIXAS: { valor: string; rotulo: string }[]; ISCA: string; CAMPOS: { contato: string[]; newsletter: string[] }; LIMITES: unknown; rotasLigadas: (v: unknown) => { contato: boolean; newsletter: boolean } };
const { servir } = require(join(ROOT, 'scripts', 'site', 'servir.js')) as { servir: (pasta: string, o?: Record<string, unknown>) => Promise<{ url: string; pedidos: string[]; doWorker: string[]; fechar: () => Promise<void> }> };
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
/** O worker entra por um endereço data:, como o Cloudflare o carrega (é um módulo ES sem importações). */
const carregarWorker = async (fonte: string): Promise<Worker> => (await import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(fonte).toString('base64')}`)).default as Worker;
/** `worker`: gerado com os dois formulários ligados (é o que quase todo teste usa). `workerGravado`: o de `site/`, com os interruptores do repositório (desligados). */
let worker: Worker;
let workerGravado: Worker;
let fonteDoWorker: string;
let fonteLigada: string;
beforeAll(async () => {
  fonteDoWorker = readFileSync(join(SITE, '_worker.js'), 'utf8');
  fonteLigada = texto(gerador.gerarSite({ dados: { ...PREENCHIDOS, formulario_contato: true, newsletter: true }, referencia: '2026-10-23' }).arquivos.get('_worker.js'));
  worker = await carregarWorker(fonteLigada);
  workerGravado = await carregarWorker(fonteDoWorker);
}, 60_000);
afterEach(() => vi.unstubAllGlobals());

/** O endereço do site nos testes é o do `Request` de `post` (https://clarevo.test); o worker só o aceita com `SITE_HOST`. */
const ENV_SITE = { SITE_HOST: 'clarevo.test' };
const ENV_CONTATO = { ...ENV_SITE, RESEND_API_KEY: 'chave-so-de-teste-resend', CONTATO_DESTINO: 'contato@exemplo.test', CONTATO_REMETENTE: 'Clarevo <site@exemplo.test>' };
const ENV_NEWSLETTER = { ...ENV_SITE, BREVO_API_KEY: 'chave-so-de-teste-brevo', BREVO_LISTA_ID: '7', BREVO_MODELO_CONFIRMACAO_ID: '3' };
const CONTATO_OK = { nome: 'Pessoa de Teste', email: 'Pessoa@Exemplo.test', empresa: 'Empresa Exemplo', faixa: '51-200', mensagem: 'Quero conversar sobre um piloto.' };

const sem = (env: Record<string, string>, chave: string) => Object.fromEntries(Object.entries(env).filter(([k]) => k !== chave));
const assets = () => ({ fetch: vi.fn(async () => new Response('<h1>estático</h1>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })) });
const envCom = (extra: Record<string, unknown> = {}) => ({ ...extra, ASSETS: assets() });

/** `fetch` simulado: guarda cada chamada e responde como o serviço de e-mail (`corpo`: o que o serviço devolve; 204 não tem corpo). */
function simularFetch(status = 200, corpo = '{}') {
  const chamadas: { url: string; init: RequestInit; corpo: Record<string, unknown> }[] = [];
  const f = vi.fn(async (url: string, init: RequestInit) => {
    chamadas.push({ url: String(url), init, corpo: JSON.parse(String(init.body)) as Record<string, unknown> });
    return new Response(status === 204 ? null : corpo, { status });
  });
  vi.stubGlobal('fetch', f);
  return { f, chamadas };
}

function post(rota: string, campos: Record<string, unknown>, opcoes: { accept?: string; origin?: string; secFetchSite?: string; json?: boolean; tamanho?: number; base?: string } = {}): Request {
  const cabecalhos: Record<string, string> = {};
  if (opcoes.accept) cabecalhos.accept = opcoes.accept;
  if (opcoes.origin !== undefined) cabecalhos.origin = opcoes.origin;
  if (opcoes.secFetchSite !== undefined) cabecalhos['sec-fetch-site'] = opcoes.secFetchSite;
  let corpo: string;
  if (opcoes.json) {
    cabecalhos['content-type'] = 'application/json';
    corpo = JSON.stringify(campos);
  } else {
    cabecalhos['content-type'] = 'application/x-www-form-urlencoded';
    corpo = new URLSearchParams(Object.entries(campos).map(([k, v]) => [k, String(v)])).toString();
  }
  if (opcoes.tamanho !== undefined) cabecalhos['content-length'] = String(opcoes.tamanho);
  return new Request(`${opcoes.base ?? 'https://clarevo.test'}${rota}`, { method: 'POST', headers: cabecalhos, body: corpo });
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
    // Sem SITE_HOST nenhuma das duas rotas envia, mesmo com todas as variáveis do serviço: o endereço do site é uma variável obrigatória.
    expect((await worker.fetch(post('/api/contato', CONTATO_OK), envCom(sem(ENV_CONTATO, 'SITE_HOST')))).status).toBe(503);
    expect((await worker.fetch(post('/api/newsletter', { email: 'leitora@exemplo.test', consentimento: 'sim' }), envCom(sem(ENV_NEWSLETTER, 'SITE_HOST')))).status).toBe(503);
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
    // E-mail inválido com todos os outros campos certos: só ele é apontado (não é o vazio dos outros que faz o envio falhar).
    const soEmail = await worker.fetch(post('/api/contato', { ...CONTATO_OK, email: 'isto-nao-e-um-email' }), envCom(ENV_CONTATO));
    expect(soEmail.status).toBe(400);
    expect((await json(soEmail)).campos).toEqual(['email']);
    // Vários campos errados: todos aparecem, na ordem do formulário.
    const varios = await worker.fetch(post('/api/contato', { ...CONTATO_OK, mensagem: '', nome: '', faixa: 'x' }), envCom(ENV_CONTATO));
    expect((await json(varios)).campos).toEqual(['nome', 'faixa', 'mensagem']);
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
    expect(c!.init.headers).toMatchObject({ Authorization: 'Bearer chave-so-de-teste-resend', 'Content-Type': 'application/json', 'User-Agent': 'clarevo-site' });
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
    // Campo errado: a página de erro é a daquele campo (a primeira, na ordem do formulário, se forem vários).
    const invalido = await worker.fetch(post('/api/contato', { ...CONTATO_OK, email: 'x' }, { accept: html }), envCom(ENV_CONTATO));
    expect(invalido.headers.get('location')).toBe('/contato-erro-email');
    for (const campo of formularios.CAMPOS.contato) {
      const r = await worker.fetch(post('/api/contato', { ...CONTATO_OK, [campo]: campo === 'faixa' ? 'x' : '' }, { accept: html }), envCom(ENV_CONTATO));
      expect(r.headers.get('location'), campo).toBe(`/contato-erro-${campo}`);
    }
    const varios = await worker.fetch(post('/api/contato', { ...CONTATO_OK, mensagem: '', empresa: '' }, { accept: html }), envCom(ENV_CONTATO));
    expect(varios.headers.get('location')).toBe('/contato-erro-empresa');
    // O que não é de campo (origem, falha do serviço, 503) cai na página de erro geral.
    const deOutroSite = await worker.fetch(post('/api/contato', CONTATO_OK, { accept: html, origin: 'https://outro-site.example' }), envCom(ENV_CONTATO));
    expect([deOutroSite.status, deOutroSite.headers.get('location')]).toEqual([303, '/contato-erro']);
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
    expect(r.headers.get('referrer-policy')).toBe('same-origin');
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
    expect(c!.init.headers).toMatchObject({ 'api-key': 'chave-so-de-teste-brevo', 'Content-Type': 'application/json', 'User-Agent': 'clarevo-site' });
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
    expect([semCaixa.status, semCaixa.headers.get('location')]).toEqual([303, '/novidades/receber-erro-consentimento']);
    const emailRuim = await worker.fetch(post('/api/newsletter', { email: 'x', consentimento: 'sim' }, { accept: html }), envCom(ENV_NEWSLETTER));
    expect([emailRuim.status, emailRuim.headers.get('location')]).toEqual([303, '/novidades/receber-erro-email']);
    // Os dois errados: a página do e-mail, que vem primeiro no formulário.
    const doisErros = await worker.fetch(post('/api/newsletter', { email: 'x' }, { accept: html }), envCom(ENV_NEWSLETTER));
    expect(doisErros.headers.get('location')).toBe('/novidades/receber-erro-email');
    simularFetch(400);
    expect((await worker.fetch(post('/api/newsletter', campos), envCom(ENV_NEWSLETTER))).status).toBe(502);
  });
});

describe('site público: _worker.js, quem pode enviar e para onde', () => {
  const NEWS = { email: 'leitora@exemplo.test', consentimento: 'sim' };
  const ROTAS: [string, Record<string, unknown>, Record<string, string>][] = [
    ['/api/contato', CONTATO_OK, ENV_CONTATO],
    ['/api/newsletter', NEWS, ENV_NEWSLETTER],
  ];

  it('Origin: null não vale (é o que sai de uma página sem origem, como um iframe com sandbox), nem o de outro site; só o do próprio site', async () => {
    const { chamadas } = simularFetch();
    for (const [rota, campos, env] of ROTAS) {
      for (const origin of ['null', 'https://outro-site.example', 'http://clarevo.test', 'https://clarevo.test:8443', 'https://sub.clarevo.test', '']) {
        const r = await worker.fetch(post(rota, campos, { origin }), envCom(env));
        expect(r.status, `${rota} Origin ${JSON.stringify(origin)}`).toBe(403);
        expect(await json(r)).toMatchObject({ ok: false, erro: 'origem' });
      }
      expect((await worker.fetch(post(rota, campos, { origin: 'https://clarevo.test' }), envCom(env))).status, rota).toBe(200);
      // Sem Origin e sem Sec-Fetch-Site (um cliente que não é navegador, como o curl) passa: o ataque que a checagem barra vem de outra página.
      expect((await worker.fetch(post(rota, campos), envCom(env))).status, rota).toBe(200);
    }
    expect(chamadas).toHaveLength(4);
  });

  it('Sec-Fetch-Site, quando vem, tem de ser same-origin: cross-site, same-site, none e valor vazio dão 403', async () => {
    const { chamadas } = simularFetch();
    for (const [rota, campos, env] of ROTAS) {
      for (const secFetchSite of ['cross-site', 'same-site', 'none', '', 'qualquer-coisa']) {
        const r = await worker.fetch(post(rota, campos, { secFetchSite }), envCom(env));
        expect(r.status, `${rota} Sec-Fetch-Site ${JSON.stringify(secFetchSite)}`).toBe(403);
      }
      // Mesmo com um Origin certo: o navegador de outra página não consegue trocar o Sec-Fetch-Site, e ele vale mais.
      expect((await worker.fetch(post(rota, campos, { secFetchSite: 'cross-site', origin: 'https://clarevo.test' }), envCom(env))).status, rota).toBe(403);
      // O que o navegador manda num formulário da própria página (com Referrer-Policy: same-origin, o Origin é o de verdade).
      expect((await worker.fetch(post(rota, campos, { secFetchSite: 'same-origin', origin: 'https://clarevo.test' }), envCom(env))).status, rota).toBe(200);
      expect((await worker.fetch(post(rota, campos, { secFetchSite: 'same-origin' }), envCom(env))).status, rota).toBe(200);
      // O Origin errado derruba mesmo com Sec-Fetch-Site same-origin: com no-referrer ele viria "null", e é isso que não vale mais.
      expect((await worker.fetch(post(rota, campos, { secFetchSite: 'same-origin', origin: 'null' }), envCom(env))).status, rota).toBe(403);
    }
    expect(chamadas).toHaveLength(4);
  });

  it('o 403 de origem também vira redirecionamento para a página de erro, quando o navegador pede HTML', async () => {
    simularFetch();
    const r = await worker.fetch(post('/api/contato', CONTATO_OK, { accept: 'text/html,*/*;q=0.8', secFetchSite: 'cross-site' }), envCom(ENV_CONTATO));
    expect([r.status, r.headers.get('location')]).toEqual([303, '/contato-erro']);
  });

  it('só o endereço de SITE_HOST recebe envios: clarevo-site.pages.dev (e qualquer outro) não serve de atalho para /api/*', async () => {
    const { f } = simularFetch();
    for (const [rota, campos, env] of ROTAS) {
      for (const base of ['https://clarevo-site.pages.dev', 'https://outro.clarevo.test', 'https://clarevo.test.evil.example', 'http://127.0.0.1:8788', 'https://clarevo.test:8443']) {
        const r = await worker.fetch(post(rota, campos, { base, origin: base }), envCom(env));
        expect(r.status, `${rota} em ${base}`).toBe(404);
        expect(await json(r)).toMatchObject({ ok: false, erro: 'host' });
        // Nem o método errado dá 405 em outro endereço: a rota "não existe" ali.
        expect((await worker.fetch(new Request(`${base}${rota}`), envCom(env))).status, `GET ${rota} em ${base}`).toBe(404);
      }
      // No endereço certo: aceita, e o endereço vale sem diferença de maiúsculas, com esquema ou com barra no fim (erros de digitação no painel).
      for (const siteHost of ['clarevo.test', 'Clarevo.Test', ' clarevo.test ', 'https://clarevo.test', 'https://clarevo.test/']) {
        expect((await worker.fetch(post(rota, campos), envCom({ ...env, SITE_HOST: siteHost }))).status, `${rota} SITE_HOST ${siteHost}`).toBe(200);
      }
      // Outro valor em SITE_HOST derruba o endereço de sempre.
      expect((await worker.fetch(post(rota, campos), envCom({ ...env, SITE_HOST: 'clarevo.com.br' }))).status, rota).toBe(404);
    }
    expect(f).toHaveBeenCalledTimes(10);
    // Quem manda o formulário de lá (a página estática também existe no pages.dev) cai na página de erro, não num JSON cru.
    const html = await worker.fetch(post('/api/contato', CONTATO_OK, { base: 'https://clarevo-site.pages.dev', accept: 'text/html,*/*;q=0.8' }), envCom(ENV_CONTATO));
    expect([html.status, html.headers.get('location')]).toEqual([303, '/contato-erro']);
    // O endereço de retorno da newsletter vem sempre do endereço certo.
    const { chamadas } = simularFetch();
    await worker.fetch(post('/api/newsletter', NEWS), envCom({ ...ENV_NEWSLETTER, SITE_HOST: 'https://clarevo.test/' }));
    expect(chamadas[0]!.corpo.redirectionUrl).toBe('https://clarevo.test/novidades/receber-confirmado');
  });

  it('rota desligada no interruptor responde 404 mesmo com todas as variáveis certas, e nada é enviado', async () => {
    const { f } = simularFetch();
    // O worker gravado em site/ é o do repositório: os dois interruptores de dados-da-empresa.json estão em false.
    expect(fonteDoWorker).toContain('const ROTAS = {"contato":false,"newsletter":false};');
    for (const [rota, campos, env] of ROTAS) {
      for (const pedido of [post(rota, campos), post(rota, campos, { accept: 'text/html' }), new Request(`https://clarevo.test${rota}`)]) {
        const r = await workerGravado.fetch(pedido, envCom(env));
        expect(r.status, rota).toBe(404);
        expect(r.headers.get('location')).toBeNull();
        expect(await json(r)).toMatchObject({ ok: false, erro: 'desligado' });
      }
    }
    expect(f).not.toHaveBeenCalled();
    // Cada interruptor liga a sua rota, e só ela.
    const doContato = await carregarWorker(texto(gerador.gerarSite({ dados: { ...PREENCHIDOS, formulario_contato: true } }).arquivos.get('_worker.js')));
    const daNews = await carregarWorker(texto(gerador.gerarSite({ dados: { ...PREENCHIDOS, newsletter: true } }).arquivos.get('_worker.js')));
    expect((await doContato.fetch(post('/api/contato', CONTATO_OK), envCom(ENV_CONTATO))).status).toBe(200);
    expect((await doContato.fetch(post('/api/newsletter', NEWS), envCom(ENV_NEWSLETTER))).status).toBe(404);
    expect((await daNews.fetch(post('/api/newsletter', NEWS), envCom(ENV_NEWSLETTER))).status).toBe(200);
    expect((await daNews.fetch(post('/api/contato', CONTATO_OK), envCom(ENV_CONTATO))).status).toBe(404);
    expect(f).toHaveBeenCalledTimes(2);
    // Os interruptores que não são o booleano true não ligam nada.
    expect(formularios.rotasLigadas({ formulario_contato: 'true', newsletter: 1 })).toEqual({ contato: false, newsletter: false });
    expect(formularios.rotasLigadas(undefined)).toEqual({ contato: false, newsletter: false });
    expect(formularios.rotasLigadas({ formulario_contato: true, newsletter: true })).toEqual({ contato: true, newsletter: true });
    // Com tudo desligado, o resto do site continua passando para os arquivos.
    const env = envCom();
    expect((await workerGravado.fetch(new Request('https://clarevo.test/'), env)).status).toBe(200);
    expect(env.ASSETS.fetch).toHaveBeenCalledTimes(1);
  }, 60_000);
});

describe('site público: _worker.js, o corpo é lido em partes, com teto, mesmo sem Content-Length', () => {
  /** Um corpo em pedaços de `parte` bytes, que se acabaria só depois de `total` bytes (ou nunca, com `Infinity`); conta quantos pedaços foram pedidos. */
  function fluxo(parte: number, total: number, prefixo = '') {
    const estado = { puxados: 0, cancelado: false };
    const codificador = new TextEncoder();
    let enviado = 0;
    const corpo = new ReadableStream<Uint8Array>({
      pull(controle) {
        estado.puxados++;
        if (enviado >= total) return controle.close();
        const texto = enviado === 0 ? prefixo + 'a'.repeat(Math.max(0, parte - prefixo.length)) : 'a'.repeat(parte);
        enviado += parte;
        controle.enqueue(codificador.encode(texto));
      },
      cancel() {
        estado.cancelado = true;
      },
    });
    return { corpo, estado };
  }
  const emPartes = (corpo: ReadableStream<Uint8Array>, tipo = 'application/x-www-form-urlencoded'): Request =>
    new Request('https://clarevo.test/api/contato', { method: 'POST', headers: { 'content-type': tipo }, body: corpo, duplex: 'half' } as RequestInit);

  it('um corpo sem Content-Length que nunca acaba dá 413 depois de poucos pedaços, e o resto nem é lido', async () => {
    const { f } = simularFetch();
    const { corpo, estado } = fluxo(4 * 1024, Infinity);
    const pedido = emPartes(corpo);
    expect(pedido.headers.get('content-length')).toBeNull();
    const r = await worker.fetch(pedido, envCom(ENV_CONTATO));
    expect(r.status).toBe(413);
    expect(await json(r)).toMatchObject({ ok: false, erro: 'grande' });
    // Com teto de 20 KB e pedaços de 4 KB, bastam seis pedidos (o do 21º KB derruba); sobra folga para a leitura antecipada do fluxo.
    expect(estado.puxados).toBeLessThan(12);
    await new Promise((ok) => setTimeout(ok, 0));
    expect(estado.cancelado).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });

  it('o Content-Length que mente (pequeno, com o corpo enorme) também dá 413, e um corpo grande em JSON também', async () => {
    const { f } = simularFetch();
    const mentiroso = new Request('https://clarevo.test/api/contato', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'content-length': '10' }, body: 'a'.repeat(30 * 1024) });
    expect((await worker.fetch(mentiroso, envCom(ENV_CONTATO))).status).toBe(413);
    const { corpo } = fluxo(8 * 1024, Infinity);
    expect((await worker.fetch(emPartes(corpo, 'application/json'), envCom(ENV_CONTATO))).status).toBe(413);
    expect(f).not.toHaveBeenCalled();
  });

  it('um corpo em partes dentro do teto passa (os campos chegam inteiros, inclusive acentos cortados entre partes), e o teto exato também', async () => {
    const { chamadas } = simularFetch();
    // Um corpo em JSON (com os acentos como bytes UTF-8 de verdade), picado em pedaços de 7 bytes que cortam as letras com acento ao meio.
    const bruto = new TextEncoder().encode(JSON.stringify({ ...CONTATO_OK, empresa: 'Ação & Cia', mensagem: 'Preço é à vista, não é? ' }));
    let i = 0;
    const picado = new ReadableStream<Uint8Array>({
      pull(c) {
        if (i >= bruto.length) return c.close();
        c.enqueue(bruto.slice(i, i + 7));
        i += 7;
      },
    });
    expect((await worker.fetch(emPartes(picado, 'application/json'), envCom(ENV_CONTATO))).status).toBe(200);
    expect(chamadas[0]!.corpo).toMatchObject({ subject: 'Contato pelo site: Ação & Cia' });
    expect(String(chamadas[0]!.corpo.text)).toContain('Mensagem: Preço é à vista, não é?');
    // No teto exato (20 KB) o corpo é lido até o fim; o erro, se houver, é só de campo (a mensagem estoura o limite de 2.000), e nunca 413.
    const { corpo } = fluxo(1024, 20 * 1024, 'nome=a&email=a%40b.cd&empresa=e&faixa=ate-50&mensagem=');
    expect((await worker.fetch(emPartes(corpo), envCom(ENV_CONTATO))).status).toBe(400);
    const { corpo: um } = fluxo(1024, 21 * 1024, 'nome=a&');
    expect((await worker.fetch(emPartes(um), envCom(ENV_CONTATO))).status).toBe(413);
  });

  it('sem corpo nenhum, é um corpo vazio: campos errados (400), não um erro do worker', async () => {
    simularFetch();
    const r = await worker.fetch(new Request('https://clarevo.test/api/contato', { method: 'POST' }), envCom(ENV_CONTATO));
    expect(r.status).toBe(400);
    expect((await json(r)).campos).toEqual(['nome', 'email', 'empresa', 'faixa', 'mensagem']);
  });
});

describe('site público: _worker.js, o que o Brevo responde', () => {
  const campos = { email: 'leitora@exemplo.test', consentimento: 'sim' };
  const html = 'text/html,*/*;q=0.8';

  it('201 (contato novo), 204 (contato que já existia) e 400 de "já existe" valem como sucesso para a pessoa, sem diferença na resposta', async () => {
    const respostas: [number, string][] = [
      [201, '{"id":42}'],
      [204, ''],
      [400, '{"code":"duplicate_parameter","message":"Contact already exist"}'],
      [400, '{"code":"invalid_parameter","message":"Unable to create contact, the email is already associated with another contact"}'],
    ];
    const vistas: string[] = [];
    for (const [status, corpo] of respostas) {
      simularFetch(status, corpo);
      const r = await worker.fetch(post('/api/newsletter', campos), envCom(ENV_NEWSLETTER));
      expect(r.status, `${status} ${corpo}`).toBe(200);
      vistas.push(JSON.stringify(await json(r)));
      const h = await worker.fetch(post('/api/newsletter', campos, { accept: html }), envCom(ENV_NEWSLETTER));
      expect([h.status, h.headers.get('location')], `${status} ${corpo}`).toEqual([303, '/novidades/receber-enviado']);
    }
    // A pessoa nunca fica sabendo se o e-mail já estava na lista: a resposta é a mesma nos quatro casos.
    expect(new Set(vistas).size).toBe(1);
  });

  it('outro 400 (lista ou modelo errados, e-mail recusado), 401, 404, 500 e o fetch que falha são falha', async () => {
    for (const [status, corpo] of [[400, '{"code":"invalid_parameter","message":"Invalid email address"}'], [400, ''], [400, '{"message":"List ids not found"}'], [401, '{"message":"Key not found"}'], [404, '{}'], [429, '{}'], [500, '{}']] as [number, string][]) {
      simularFetch(status, corpo);
      const r = await worker.fetch(post('/api/newsletter', campos), envCom(ENV_NEWSLETTER));
      expect(r.status, `${status} ${corpo}`).toBe(502);
      expect(await json(r)).toMatchObject({ ok: false, erro: 'falha' });
    }
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('rede fora do ar'); }));
    expect((await worker.fetch(post('/api/newsletter', campos), envCom(ENV_NEWSLETTER))).status).toBe(502);
  });

  it('o Resend só vale com 2xx: 4xx e 5xx são falha, e a chamada leva User-Agent', async () => {
    for (const status of [400, 401, 403, 422, 429, 500]) {
      simularFetch(status, '{"message":"erro"}');
      expect((await worker.fetch(post('/api/contato', CONTATO_OK), envCom(ENV_CONTATO))).status, String(status)).toBe(502);
    }
    const { chamadas } = simularFetch(200, '{"id":"1"}');
    await worker.fetch(post('/api/contato', CONTATO_OK), envCom(ENV_CONTATO));
    expect((chamadas[0]!.init.headers as Record<string, string>)['User-Agent']).toBe('clarevo-site');
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
    expect(fonteDoWorker).not.toMatch(/faz\w*\s+sentido/i);
    for (const fonte of [fonteDoWorker, fonteLigada]) {
      expect(fonte).not.toMatch(/\/\*(LIMITES|CABECALHOS|ROTAS)\*\//);
      expect(fonte).toContain(JSON.stringify(formularios.LIMITES));
      expect(fonte).toContain('export default');
      expect(fonte).not.toMatch(/[–—]/);
      expect(fonte).toContain("const AGENTE = 'clarevo-site';");
    }
    // O worker gravado em site/ é o do repositório (formulários desligados); o outro é o gerado com os dois ligados.
    expect(fonteLigada).toContain('const ROTAS = {"contato":true,"newsletter":true};');
    expect(fonteLigada.replace(/const ROTAS = \{[^}]*\};/, '')).toBe(fonteDoWorker.replace(/const ROTAS = \{[^}]*\};/, ''));
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
    expect(e).toContain('só para responder sobre a Clarevo para empresas');
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
      expect(form).toContain('<label for="nv-consentimento">Quero receber as Novidades da Clarevo por e-mail. Posso cancelar quando quiser.</label>');
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

  it('cada campo tem a sua página de erro, que diz qual campo conferir, sem JavaScript, sem parâmetro e sem repetir o que a pessoa escreveu', () => {
    const paginas = [
      ...formularios.CAMPOS.contato.map((c) => [`contato-erro-${c}.html`, c] as const),
      ...formularios.CAMPOS.newsletter.map((c) => [`novidades/receber-erro-${c}.html`, c] as const),
    ];
    expect(formularios.CAMPOS).toEqual({ contato: ['nome', 'email', 'empresa', 'faixa', 'mensagem'], newsletter: ['email', 'consentimento'] });
    const ROTULOS: Record<string, string> = { nome: 'Nome', email: 'E-mail', empresa: 'Empresa', faixa: 'Número aproximado de pessoas', mensagem: 'Mensagem', consentimento: 'Consentimento' };
    for (const [arquivo, campo] of paginas) {
      const p = h(ligado, arquivo);
      expect(p, arquivo).not.toBe('');
      expect(p, arquivo).toContain(`<h1>Confira o campo ${ROTULOS[campo]}</h1>`);
      expect(p, arquivo).toContain('Nada foi guardado, e você pode tentar de novo.');
      expect(p, arquivo).toContain('<meta name="robots" content="noindex">');
      expect(p, arquivo).not.toMatch(/<form\b|<script\b|<input\b/);
      // O que a pessoa pode fazer: voltar ao formulário (o link existe) ou usar o outro caminho.
      expect(p, arquivo).toMatch(/<a href="(empresas\/index\.html#formulario-contato|receber\.html)">Voltar para (o formulário|a inscrição)<\/a>/);
    }
    // O que cada página diz: o campo e o que costuma estar errado, com os limites do worker.
    const T = formularios.TAMANHOS;
    expect(h(ligado, 'contato-erro-email.html')).toContain(`O campo &quot;E-mail&quot; está vazio, passa de ${T.email} caracteres ou não parece um e-mail`);
    expect(h(ligado, 'contato-erro-nome.html')).toContain(`passa de ${T.nome} caracteres`);
    expect(h(ligado, 'contato-erro-empresa.html')).toContain(`passa de ${T.empresa} caracteres`);
    expect(h(ligado, 'contato-erro-mensagem.html')).toContain('passa de 2.000 caracteres');
    expect(h(ligado, 'contato-erro-faixa.html')).toContain('Nenhuma faixa');
    expect(h(ligado, 'novidades/receber-erro-consentimento.html')).toContain('A caixa de consentimento não foi marcada. Sem ela, nada é cadastrado.');
    // As páginas gerais continuam (para 503, origem e falha do serviço) e não apontam um campo.
    for (const geral of ['contato-erro.html', 'novidades/receber-erro.html']) expect(h(ligado, geral)).not.toContain('Confira o campo');
    // Fora do sitemap (noindex) e sem nenhuma delas com o interruptor desligado.
    const sitemap = h(ligado, 'sitemap.xml');
    for (const [arquivo] of paginas) {
      expect(desligado.arquivos.has(arquivo), arquivo).toBe(false);
      expect(sitemap, arquivo).not.toContain(arquivo.replace(/\.html$/, ''));
    }
  });

  it('o worker manda um campo errado para a página de erro dele, e essa página existe no site gerado', async () => {
    simularFetch();
    const html = 'text/html,*/*;q=0.8';
    const destinos = new Set<string>();
    for (const campo of formularios.CAMPOS.contato) {
      const r = await worker.fetch(post('/api/contato', { ...CONTATO_OK, [campo]: campo === 'faixa' ? 'x' : '' }, { accept: html }), envCom(ENV_CONTATO));
      destinos.add(r.headers.get('location')!);
    }
    for (const [campos, esperado] of [[{ email: 'x', consentimento: 'sim' }, 'email'], [{ email: 'leitora@exemplo.test' }, 'consentimento']] as const) {
      const r = await worker.fetch(post('/api/newsletter', campos, { accept: html }), envCom(ENV_NEWSLETTER));
      destinos.add(r.headers.get('location')!);
      expect(r.headers.get('location')).toBe(`/novidades/receber-erro-${esperado}`);
    }
    expect(destinos.size).toBe(7);
    for (const d of destinos) expect(ligado.arquivos.has(`${d.slice(1)}.html`), d).toBe(true);
  });

  it('o texto ao lado do formulário de contato diz que o Resend guarda uma cópia, com o prazo ainda a definir', () => {
    const e = h(ligado, 'empresas/index.html');
    expect(e).toContain('O Resend também guarda uma cópia nos registros dele, por <mark class="pendente">[A DEFINIR: prazo de guarda no Resend]</mark>.');
    expect(e).toContain('O site não guarda a mensagem.');
    // O formulário desligado não fala disso (a página nem tem o texto).
    expect(h(desligado, 'empresas/index.html')).not.toContain('Resend');
    // Com o formulário ligado, a página fica preliminar (o --final falha) enquanto o prazo estiver a definir.
    expect(ligado.pendencias.get('empresas/index.html')).toContain('[A DEFINIR: prazo de guarda no Resend]');
  });

  it('toda página pede Referrer-Policy: same-origin (o navegador manda o Origin de verdade nos formulários, e o worker recusa "null"), e nenhum outro site recebe o endereço', () => {
    expect(h(ligado, '_headers')).toContain('  Referrer-Policy: same-origin\n');
    expect(h(ligado, '_headers')).not.toContain('Referrer-Policy: no-referrer');
    for (const [nome, v] of ligado.arquivos) {
      if (!nome.endsWith('.html')) continue;
      expect(texto(v), nome).toContain('<meta name="referrer" content="same-origin">');
      expect(texto(v), nome).not.toContain('content="no-referrer"');
    }
    // Os links para fora do site continuam sem repassar o referenciador.
    for (const [nome, v] of ligado.arquivos) {
      if (!nome.endsWith('.html')) continue;
      for (const m of texto(v).matchAll(/<a\b[^>]*href="https?:\/\/[^"]*"[^>]*>/g)) expect(m[0], `${nome}: ${m[0]}`).toContain('rel="noopener noreferrer"');
    }
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

// ------------------------------------------------------------------------------------------------------------------------------
// Servidor local (scripts/site/servir.js) e as seções da política

describe('site público: servir.js entrega ao worker só o que o _routes.json manda', () => {
  const lerRotas = (require(join(ROOT, 'scripts', 'site', 'servir.js')) as { lerRotas: (pasta: string) => (caminho: string) => boolean }).lerRotas;
  /** Uma pasta de site mínima: um worker que se identifica, uma página e a 404. `rotas`: o conteúdo do `_routes.json` (ou nada, sem o arquivo). */
  function pastaDeSite(rotas?: unknown): string {
    const dir = mkdtempSync(join(tmpdir(), 'clarevo-servir-'));
    writeFileSync(join(dir, '_worker.js'), "export default { async fetch(request, env) { return new Response('worker:' + new URL(request.url).pathname + ':' + (env.SITE_HOST ?? '-'), { status: 200 }); } };");
    writeFileSync(join(dir, 'index.html'), '<h1>pagina inicial</h1>');
    writeFileSync(join(dir, 'x.html'), '<h1>pagina x</h1>');
    writeFileSync(join(dir, '404.html'), '<h1>nao achei</h1>');
    mkdirSync(join(dir, 'api'));
    writeFileSync(join(dir, 'api', 'livre.html'), '<h1>arquivo em api</h1>');
    if (rotas !== undefined) writeFileSync(join(dir, '_routes.json'), JSON.stringify(rotas));
    return dir;
  }
  const corpo = async (url: string) => {
    const r = await fetch(url);
    return [r.status, await r.text()] as const;
  };

  it('com include e exclude, só o que casa com include (e não com exclude) vai para o worker; o resto sai direto dos arquivos', async () => {
    const dir = pastaDeSite({ version: 1, include: ['/api/*'], exclude: ['/api/livre*'] });
    const servidor = await servir(dir, { env: { SITE_HOST: 'exemplo.test' } });
    try {
      expect(await corpo(`${servidor.url}/api/contato`)).toEqual([200, 'worker:/api/contato:exemplo.test']);
      expect(await corpo(`${servidor.url}/api/a/b/c`)).toEqual([200, 'worker:/api/a/b/c:exemplo.test']);
      // Fora do include: arquivos estáticos, sem passar pelo worker (a 404 também).
      expect(await corpo(`${servidor.url}/`)).toEqual([200, '<h1>pagina inicial</h1>']);
      expect(await corpo(`${servidor.url}/x`)).toEqual([200, '<h1>pagina x</h1>']);
      expect(await corpo(`${servidor.url}/nao-existe`)).toEqual([404, '<h1>nao achei</h1>']);
      expect(await corpo(`${servidor.url}/apinha`)).toEqual([404, '<h1>nao achei</h1>']);
      // O exclude vale mais que o include: /api/livre.html é um arquivo e sai como arquivo.
      expect(await corpo(`${servidor.url}/api/livre.html`)).toEqual([200, '<h1>arquivo em api</h1>']);
      expect(await corpo(`${servidor.url}/api/livre`)).toEqual([200, '<h1>arquivo em api</h1>']);
    } finally {
      await servidor.fechar();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('sem _routes.json o worker recebe tudo (o padrão do Pages no modo avançado); sem include, também', async () => {
    for (const rotas of [undefined, { version: 1 }, { version: 1, include: ['/*'] }]) {
      const dir = pastaDeSite(rotas);
      const servidor = await servir(dir);
      try {
        expect(await corpo(`${servidor.url}/`), JSON.stringify(rotas)).toEqual([200, 'worker:/:-']);
        expect(await corpo(`${servidor.url}/x`), JSON.stringify(rotas)).toEqual([200, 'worker:/x:-']);
      } finally {
        await servidor.fechar();
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('o padrão aceita * no fim e no meio, escapa o resto e nunca casa com o caminho sem a barra', () => {
    const dir = pastaDeSite({ version: 1, include: ['/api/*', '/a/*/b', '/exato.html'], exclude: ['/api/x/*'] });
    try {
      const vai = lerRotas(dir);
      expect([vai('/api/contato'), vai('/api/'), vai('/api'), vai('/apix')]).toEqual([true, true, false, false]);
      expect([vai('/a/1/b'), vai('/a/1/2/b'), vai('/a/b'), vai('/ab/1/b')]).toEqual([true, true, false, false]);
      expect([vai('/exato.html'), vai('/exatoXhtml'), vai('/exato.html/')]).toEqual([true, false, false]);
      expect([vai('/api/x/1'), vai('/api/y/1')]).toEqual([false, true]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('o _routes.json do site gerado manda só /api/* para o worker, e o servidor local o respeita (um arquivo estático nunca chega ao worker)', async () => {
    expect(readFileSync(join(SITE, '_routes.json'), 'utf8')).toBe('{"version":1,"include":["/api/*"],"exclude":[]}\n');
    const dir = mkdtempSync(join(tmpdir(), 'clarevo-servir-site-'));
    const copia = (nome: string, conteudo: string | Buffer) => {
      mkdirSync(join(dir, ...nome.split('/').slice(0, -1)), { recursive: true });
      writeFileSync(join(dir, nome), conteudo);
    };
    // O worker de verdade (com os dois formulários ligados) e as páginas que ele serviria.
    const g = gerador.gerarSite({ dados: { ...PREENCHIDOS, formulario_contato: true, newsletter: true }, referencia: '2026-10-23' });
    for (const nome of ['_worker.js', '_routes.json', '_headers', '404.html', 'index.html', 'estilo.css', 'contato-erro-email.html']) copia(nome, g.arquivos.get(nome) as string);
    const servidor = await servir(dir, { env: { RESEND_API_KEY: 'x', CONTATO_DESTINO: 'a@b.cd', CONTATO_REMETENTE: 'a@b.cd' }, hostDoSite: true });
    try {
      // Estático: sai direto dos arquivos, sem passar pelo worker (inclusive a 404).
      for (const caminho of ['/', '/estilo.css', '/contato-erro-email', '/nao-existe', '/api']) await fetch(`${servidor.url}${caminho}`);
      expect(servidor.doWorker).toEqual([]);
      // /api/*: só aí o worker entra (e o endereço certo, que hostDoSite configurou, vale: o método errado dá 405, não 404 de endereço).
      const api = await fetch(`${servidor.url}/api/newsletter`);
      expect([api.status, api.headers.get('cache-control')]).toEqual([405, 'no-store']);
      const contato = await fetch(`${servidor.url}/api/contato`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'nome=' });
      expect(contato.status).toBe(400);
      expect(servidor.doWorker).toEqual(['GET /api/newsletter', 'POST /api/contato']);
    } finally {
      await servidor.fechar();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('hostDoSite põe em SITE_HOST o endereço do próprio servidor (127.0.0.1:porta), e sem ele a variável não existe', async () => {
    const dir = pastaDeSite({ version: 1, include: ['/api/*'] });
    const com = await servir(dir, { hostDoSite: true });
    const sem = await servir(dir);
    try {
      expect(await corpo(`${com.url}/api/x`)).toEqual([200, `worker:/api/x:${new URL(com.url).host}`]);
      expect(await corpo(`${sem.url}/api/x`)).toEqual([200, 'worker:/api/x:-']);
    } finally {
      await com.fechar();
      await sem.fechar();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('site público: as seções 3.6 e 3.7 da política só existem com o formulário ligado', () => {
  const secoes = '### 3.6 Contato pelo site\n\nSeção do formulário de contato.\n\n### 3.7 Novidades por e-mail\n\nSeção das Novidades.\n\n';
  const POLITICA = `# Política de privacidade\n\n## 3. O que guardamos?\n\n### 3.5 Outra seção\n\nTexto.\n\n${secoes}## 4. O que não guardamos?\n\nTexto.\n`;
  const SEM_SECOES = POLITICA.replace(secoes, '');
  const gerarCom = (md: string, dados: Record<string, unknown>) => {
    const dir = mkdtempSync(join(tmpdir(), 'clarevo-politica-'));
    try {
      writeFileSync(join(dir, 'politica-de-privacidade.md'), md);
      return gerador.gerarSite({ legal: dir, dados: { ...PREENCHIDOS, ...dados }, referencia: '2026-10-23' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  const MARCA_36 = '[A RETIRAR: seção 3.6 (Contato pelo site) da política, porque o formulário de contato está desligado (formulario_contato em site/dados-da-empresa.json)]';
  const MARCA_37 = '[A RETIRAR: seção 3.7 (Novidades por e-mail) da política, porque o cadastro das Novidades por e-mail está desligado (newsletter em site/dados-da-empresa.json)]';

  it('com os dois desligados, as duas seções saem marcadas para retirar, e o --final recusa (marcador pendente e problema explicado)', () => {
    const g = gerarCom(POLITICA, {});
    const pend = g.pendencias.get('privacidade.html')!;
    expect(pend).toContain(MARCA_36);
    expect(pend).toContain(MARCA_37);
    const pagina = texto(g.arquivos.get('privacidade.html'));
    expect(pagina).toContain(`<mark class="pendente">${MARCA_36}</mark>`);
    // A marca vem logo depois do título da seção, antes do texto dela.
    expect(pagina.indexOf(MARCA_36)).toBeGreaterThan(pagina.indexOf('3.6 Contato pelo site</h3>'));
    expect(pagina.indexOf(MARCA_36)).toBeLessThan(pagina.indexOf('Seção do formulário de contato.'));
    const problemas = g.problemasFinais.filter((p) => p.startsWith('privacidade.html: a seção'));
    expect(problemas).toHaveLength(2);
    expect(problemas[0]).toContain('descreve o formulário de contato, que está desligado (formulario_contato): retire a seção ou ligue o interruptor');
    expect(problemas[1]).toContain('descreve o cadastro das Novidades por e-mail, que está desligado (newsletter)');
    expect(g.avisos.some((a) => a.startsWith('o --final recusaria: privacidade.html: a seção 3.6'))).toBe(true);
    // O texto de origem (docs/legal) não muda: só o que sai na página.
    expect(POLITICA).not.toContain('A RETIRAR');
  }, 60_000);

  it('cada seção só some com o interruptor dela desligado; ligados, nada é marcado nem recusado', () => {
    const soContato = gerarCom(POLITICA, { formulario_contato: true });
    expect(soContato.pendencias.get('privacidade.html')).not.toContain(MARCA_36);
    expect(soContato.pendencias.get('privacidade.html')).toContain(MARCA_37);
    const soNews = gerarCom(POLITICA, { newsletter: true });
    expect(soNews.pendencias.get('privacidade.html')).toContain(MARCA_36);
    expect(soNews.pendencias.get('privacidade.html')).not.toContain(MARCA_37);
    const ligados = gerarCom(POLITICA, { formulario_contato: true, newsletter: true });
    expect(ligados.pendencias.get('privacidade.html')!.filter((m) => m.includes('A RETIRAR'))).toEqual([]);
    expect(texto(ligados.arquivos.get('privacidade.html'))).not.toContain('A RETIRAR');
    expect(ligados.problemasFinais.filter((p) => /privacidade\.html: (a seção|o formulário|as Novidades)/.test(p))).toEqual([]);
  }, 60_000);

  it('o contrário também é recusado: formulário ligado e sem a seção na política', () => {
    const g = gerarCom(SEM_SECOES, { formulario_contato: true, newsletter: true });
    expect(g.problemasFinais).toContain('privacidade.html: o formulário de contato está ligado (formulario_contato) e a política não tem a seção 3.6 (Contato pelo site)');
    expect(g.problemasFinais).toContain('privacidade.html: o cadastro das Novidades por e-mail está ligado (newsletter) e a política não tem a seção 3.7 (Novidades por e-mail)');
    // Desligados e sem as seções: nada a recusar.
    const nada = gerarCom(SEM_SECOES, {});
    expect(nada.problemasFinais.filter((p) => p.startsWith('privacidade.html: a seção') || p.includes('a política não tem a seção'))).toEqual([]);
    expect(nada.pendencias.get('privacidade.html')!.filter((m) => m.includes('A RETIRAR'))).toEqual([]);
  }, 60_000);

  it('o --final de verdade (a linha de comando) lista a seção a retirar', () => {
    const dir = mkdtempSync(join(tmpdir(), 'clarevo-final-'));
    try {
      mkdirSync(join(dir, 'legal'));
      writeFileSync(join(dir, 'legal', 'politica-de-privacidade.md'), POLITICA);
      const rodar = (dados: Record<string, unknown>) => {
        writeFileSync(join(dir, 'dados.json'), JSON.stringify({ ...PREENCHIDOS, ...dados }));
        return spawnSync(process.execPath, [join(ROOT, 'scripts', 'gerar-site.js'), '--final', '--legal', join(dir, 'legal'), '--dados', join(dir, 'dados.json'), '--referencia', '2026-10-23', '--saida', join(dir, 'saida')], { encoding: 'utf8' });
      };
      const desligados = rodar({});
      expect(desligados.status).toBe(1);
      expect(desligados.stderr).toContain('A RETIRAR: seção 3.6 (Contato pelo site)');
      expect(desligados.stderr).toContain('A RETIRAR: seção 3.7 (Novidades por e-mail)');
      expect(desligados.stderr).toContain('descreve o formulário de contato, que está desligado');
      const ligados = rodar({ formulario_contato: true, newsletter: true });
      expect(ligados.stderr).not.toContain('A RETIRAR: seção');
      expect(ligados.stderr).not.toContain('descreve o formulário de contato');
      expect(ligados.stderr).not.toContain('a política não tem a seção');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('a política do repositório tem as duas seções e, com os formulários desligados, o site as marca para retirar', () => {
    const politica = readFileSync(join(ROOT, 'docs', 'legal', 'politica-de-privacidade.md'), 'utf8');
    expect(politica).toMatch(/^### 3\.6 Contato pelo site$/m);
    expect(politica).toMatch(/^### 3\.7 Novidades por e-mail$/m);
    const g = gerador.gerarSite({ dados: { ...PREENCHIDOS }, referencia: '2026-10-23' });
    expect(texto(g.arquivos.get('privacidade.html'))).toContain(`<mark class="pendente">${MARCA_36}</mark>`);
    expect(texto(readFileSync(join(SITE, 'privacidade.html')))).toContain(MARCA_37);
  }, 60_000);
});

/**
 * A margem transparente de um PNG RGBA de 8 bits (sem entrelaçamento): quantos pixels de cada lado não têm nada desenhado (alfa 0).
 * Lê o PNG como é (descomprime e desfaz os filtros de linha), sem pacote.
 */
function margensDoPng(png: Buffer): { esquerda: number; direita: number; topo: number; base: number } {
  const largura = png.readUInt32BE(16);
  const altura = png.readUInt32BE(20);
  expect([png[24], png[25], png[28]], 'PNG de 8 bits, RGBA, sem entrelaçamento').toEqual([8, 6, 0]);
  const partes: Buffer[] = [];
  for (let i = 8; i < png.length; ) {
    const tamanho = png.readUInt32BE(i);
    if (png.subarray(i + 4, i + 8).toString('ascii') === 'IDAT') partes.push(png.subarray(i + 8, i + 8 + tamanho));
    i += 12 + tamanho;
  }
  const cru = inflateSync(Buffer.concat(partes));
  const linha = largura * 4;
  const pixels = Buffer.alloc(altura * linha);
  for (let y = 0; y < altura; y++) {
    const filtro = cru[y * (linha + 1)]!;
    for (let x = 0; x < linha; x++) {
      const v = cru[y * (linha + 1) + 1 + x]!;
      const a = x >= 4 ? pixels[y * linha + x - 4]! : 0;
      const b = y > 0 ? pixels[(y - 1) * linha + x]! : 0;
      const c = x >= 4 && y > 0 ? pixels[(y - 1) * linha + x - 4]! : 0;
      const paeth = () => {
        const p = a + b - c;
        const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
        return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      };
      pixels[y * linha + x] = (v + [0, a, b, (a + b) >> 1, paeth()][filtro]!) & 255;
    }
  }
  let [minX, maxX, minY, maxY] = [largura, -1, altura, -1];
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      if (pixels[y * linha + x * 4 + 3] === 0) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return { esquerda: minX, direita: largura - 1 - maxX, topo: minY, base: altura - 1 - maxY };
}

describe('site público: kit de imprensa', () => {
  const g = gerador.gerarSite();
  const h = texto(g.arquivos.get('imprensa.html'));
  const origem = JSON.parse(readFileSync(join(ROOT, 'site-src', 'imprensa', 'origem.json'), 'utf8')) as Record<string, { sha256: string; png: string; largura: number; altura: number; margem: number }>;
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
      // Margem de respiro: o desenho não encosta em nenhuma borda do PNG (o SVG não ganha margem nenhuma, só a exportação).
      expect(o.margem, nome).toBeGreaterThanOrEqual(80);
      const m = margensDoPng(png);
      for (const lado of ['esquerda', 'direita', 'topo', 'base'] as const) expect(m[lado], `${nome}: margem ${lado}`).toBeGreaterThanOrEqual(o.margem - 2);
      // O desenho em si é o do SVG: o PNG tem o tamanho do desenho (largura do SVG em px) mais a margem dos dois lados.
      const larguraDoDesenho = nome.includes('logotipo') ? 2400 : 1024;
      expect(o.largura, nome).toBe(larguraDoDesenho + 2 * o.margem);
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
    // D-068: as três abrem com o posicionamento de bem-estar financeiro (Manual v2.2), sem prometer resultado de saúde.
    for (const id of ['uma-frase', 'cinquenta', 'cem']) expect(descricao(id), id).toMatch(/^A Clarevo é uma solução de bem-estar financeiro para pessoas e empresas, apoiada por um aplicativo/);
    expect(descricao('cem')).toContain('não é atendimento de saúde');
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
    for (const trecho of ['Nome, e-mail, nome da empresa', 'faixa do número aproximado de pessoas', 'Para responder ao seu contato sobre a Clarevo para empresas', 'O site não guarda a mensagem', 'Cloudflare', 'Resend', 'operadores', '[A DEFINIR: prazo na caixa de e-mail]']) expect(s, trecho).toContain(trecho);
    // O Resend guarda uma cópia da mensagem nos registros dele: a seção diz isso, com o prazo a definir, e a seção de guarda também.
    expect(s).toContain('guarda uma cópia dela nos registros dele, por [A DEFINIR: prazo de guarda no Resend]');
    expect(s).toContain('e a cópia nos registros do Resend, por [A DEFINIR: prazo de guarda no Resend]');
    expect(secao(politica, '## 11.')).toContain('Mensagem do formulário de contato');
    expect(politica).toContain('uma cópia fica nos registros do Resend por [A DEFINIR: prazo de guarda no Resend]');
    expect(politica).toContain('Receberá o que você escrever no formulário e guarda uma cópia nos registros dele.');
    expect(politica.match(/\[A DEFINIR: prazo de guarda no Resend\]/g)).toHaveLength(3);
    expect(politica).toMatch(/Contato pelo formulário do site \(seção 3\.6\): \[PROPOSTA: procedimentos preliminares/);
  });

  it('a política tem a seção proposta das Novidades por e-mail: consentimento, Brevo, descadastro e dupla confirmação', () => {
    const s = secao(politica, '### 3.7 Novidades por e-mail');
    expect(s).toContain('[PROPOSTA:');
    for (const trecho of ['O seu e-mail', 'Consentimento', 'desmarcada', 'dupla confirmação', 'Brevo', 'link para cancelar', 'O site não grava o e-mail']) expect(s, trecho).toContain(trecho);
    // O rastreamento de abertura e clique do Brevo fica desligado, e a política declara isso como ponto a confirmar.
    expect(s).toContain('[A DEFINIR: rastreamento de abertura e clique desligado no Brevo]');
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
    expect(numeros.at(-1)).toBe(33);
    // A 27 fala da cópia do Resend e a 33, do rastreamento de abertura e clique do Brevo.
    const perguntas = secao(resumo, '**Perguntas novas**');
    expect(/^27\. \*\*[^\n]*$/m.exec(perguntas)![0]).toContain('Resend guarda uma cópia nos registros dele');
    expect(/^33\. \*\*[^\n]*$/m.exec(perguntas)![0]).toContain('Rastreamento de abertura e clique no Brevo');
    expect(/^33\. \*\*[^\n]*$/m.exec(perguntas)![0]).toContain('[A DEFINIR: rastreamento de abertura e clique desligado no Brevo]');
    // A seção e vai até a 25 e não foi renumerada.
    expect([...secao(resumo, '## e) Perguntas ao advogado').matchAll(/^(\d+)\. \*\*/gm)].map((m) => Number(m[1]))).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    expect(resumo).toContain('responder as 25 perguntas da seção e e as da seção h');
    for (const assunto of ['Formulário de contato', 'Prazo da mensagem', 'consentimento', 'Descadastro', 'Transferência internacional', 'Estatísticas de tráfego', 'Marca e kit de imprensa']) expect(resumo.toLowerCase(), assunto).toContain(assunto.toLowerCase());
  });

  it('os documentos de D-066 existem: ligar o formulário e a newsletter passo a passo, sem chave, e a contagem de visitas sem script', () => {
    const doc22 = readFileSync(join(ROOT, 'docs', '22_SITE.md'), 'utf8');
    for (const nome of ['SITE_HOST', 'RESEND_API_KEY', 'CONTATO_DESTINO', 'CONTATO_REMETENTE', 'BREVO_API_KEY', 'BREVO_LISTA_ID', 'BREVO_MODELO_CONFIRMACAO_ID', 'BREVO_URL_RETORNO']) expect(doc22, nome).toContain(nome);
    for (const trecho of ['## 9. Ligar o formulário e as Novidades por e-mail', '### 8.1 Calculadoras', '### 8.2 Kit de imprensa', '### 8.3 Formulário de contato', '### 8.4 Novidades por e-mail', '### 8.5 Contagem de visitas sem cookies', 'Web Analytics', 'Nunca cole uma chave de API', '**6. Conferir depois de ligar**', 'formulario_contato']) expect(doc22, trecho).toContain(trecho);
    for (const arquivo of ['22_SITE.md', '20_SENTRY_E_EMAIL.md', '07_PUBLICACAO_WEB.md', '16_PUBLICACAO_LOJAS.md']) {
      const t = readFileSync(join(ROOT, 'docs', arquivo), 'utf8');
      expect(t, arquivo).not.toMatch(/re_[A-Za-z0-9]{16,}|xkeysib-[A-Za-z0-9-]{10,}/);
    }
    expect(readFileSync(join(ROOT, 'docs', '20_SENTRY_E_EMAIL.md'), 'utf8')).toContain('Resend');
    expect(readFileSync(join(ROOT, 'docs', '20_SENTRY_E_EMAIL.md'), 'utf8')).toContain('Brevo');
    expect(readFileSync(join(ROOT, 'docs', '07_PUBLICACAO_WEB.md'), 'utf8')).toContain('_worker.js');
  });

  it('docs/22 trata o limite de taxa como pré-requisito (com o passo a passo), explica o risco da newsletter e os passos do Brevo e do Resend', () => {
    const doc22 = readFileSync(join(ROOT, 'docs', '22_SITE.md'), 'utf8');
    const sec9 = doc22.slice(doc22.indexOf('## 9. Ligar o formulário'), doc22.indexOf('## 10. Decisões'));
    // O limite de taxa vem antes de tudo e é condição para ligar; não "se chegar spam".
    expect(sec9).toContain('**1. Pré-requisito: o limite de taxa da Cloudflare.**');
    expect(sec9.indexOf('**1. Pré-requisito')).toBeLessThan(sec9.indexOf('**2. Resend (contato).**'));
    expect(sec9).toContain('a **regra de limite de taxa criada e conferida (passo 1)**');
    expect(sec9).toContain('os formulários só são ligados depois dele');
    expect(sec9).not.toMatch(/se chegar mensagem de robô|Spam: se chegar/);
    for (const trecho of ['Regras de limite de taxa', 'http.request.uri.path in {"/api/contato" "/api/newsletter"}', 'http.request.method eq "POST"', '**429**', 'Bloquear', 'curl']) expect(sec9, trecho).toContain(trecho);
    // O risco: a confirmação vai para o e-mail de quem foi digitado.
    expect(doc22).toContain('a confirmação vai para o e-mail que a pessoa digitar');
    expect(sec9).toContain('qualquer endereço que alguém digitar');
    // O host, a origem e o Referrer-Policy.
    expect(sec9).toContain('`SITE_HOST` é o endereço do site, **só o endereço**');
    expect(doc22).toContain('**inclusive `Origin: null`**');
    expect(doc22).toContain('**não é defesa contra robô nem contra quem fala direto com a rota**');
    expect(doc22).not.toContain('e isso é aceito');
    expect(doc22).toContain('`Referrer-Policy: same-origin`');
    // Brevo: IP e rastreamento. Resend: cópia e prazo.
    expect(sec9).toContain('**Desligue o bloqueio de IP não reconhecido.**');
    expect(sec9).toContain('**IPs autorizados** (Authorised IPs)');
    expect(sec9).toContain('**não tem IP fixo**');
    expect(sec9).toContain('**Desligue o rastreamento de aberturas e de cliques.**');
    expect(sec9).toContain('[A DEFINIR: rastreamento de abertura e clique desligado no Brevo]');
    expect(sec9).toContain('[A DEFINIR: prazo de guarda no Resend]');
    // O que conferir no primeiro teste real do Brevo: 201, 204 ou 400 para contato que já existe, e o worker trata os três sem erro.
    expect(sec9).toContain('201 (contato novo), 204 (contato existente atualizado) ou 400 (contato já existe)');
    expect(sec9).toContain('O worker trata os três como sucesso');
    expect(doc22).toContain('`User-Agent: clarevo-site`');
    // docs/07: as variáveis do site ficam só no projeto clarevo-site e só para os formulários.
    const doc07 = readFileSync(join(ROOT, 'docs', '07_PUBLICACAO_WEB.md'), 'utf8');
    expect(doc07).not.toContain('Não há variáveis de ambiente.');
    expect(doc07).toContain('as do site (`SITE_HOST`, as do Resend e as do Brevo');
    expect(doc07).toContain('ficam só no projeto `clarevo-site`');
    for (const arquivo of ['22_SITE.md', '07_PUBLICACAO_WEB.md', '20_SENTRY_E_EMAIL.md']) {
      const t = readFileSync(join(ROOT, 'docs', arquivo), 'utf8');
      expect(t, arquivo).not.toMatch(/[–—]/);
      expect(t, arquivo).not.toMatch(/faz\w*\s+sentido/i);
    }
  });
});
