/// <reference types="node" />
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NOTICIAS_TEXT } from '../src/noticias/fontes';
import { ACCESS_TEXT, PLAN_NAME, SUBSCRIBE_OPEN, TRIAL_DAYS, planPriceAmount } from '../src/plano';

/**
 * O estado do produto (D-125, `scripts/site/estado.js`, `docs/22_SITE.md`, seção 19): UM interruptor, `ESTADO_DO_PRODUTO.lancado` em
 * `scripts/site/config.js`. O teste gera o site INTEIRO nos dois estados, em memória, e confere em todas as páginas que:
 *   - nos DOIS estados, nenhum texto de fase de testes (D-128, pedido do Enzo, 26/11/2026): "fase de testes", "em testes", "piloto", "quem
 *     testa", "Preços no lançamento", "abre no lançamento" e as outras formas do lançamento do produto, a frase da assinatura fechada, "Como
 *     ter acesso", "Ver a demonstração" e "Testar grátis"; a demonstração só como link de texto em O app e em Use no navegador;
 *   - antes do lançamento, só antes: a fita "Em breve" nos planos, "Assine aqui" levando aos planos e o "Entrar" do menu para a tela de entrar;
 *   - lançado, só lançado: "Assine aqui" e o menu levando à tela de criar conta, selos e links das lojas, a tela inicial do app web, "aberta
 *     para todas as pessoas" e oferta com preço nos dados estruturados (D-064: nada disso antes, nenhum convite a criar conta);
 *   - "Assine aqui" é a chamada principal de todas as capas e chamadas finais, com no máximo dois botões por bloco; os dados estruturados são
 *     JSON válido (com a FAQPage do início); `robots.txt` e `_headers` (a política de segurança) não mudam com o estado;
 *   - `lancado: true` é recusado enquanto a assinatura pelo app estiver fechada (`SUBSCRIBE_OPEN`). O site lançado deste teste usa
 *     `simularAssinaturaAberta`, que só o `--estado` aceita e que o `--final` recusa;
 *   - desde a análise geral de 26/11/2026 (D-129): os planos (`planos.html` e a página de cada plano) têm, lançado, "Assine aqui" e "Conheça
 *     o app" na capa e, antes, a linha "A assinatura abre em breve, na web e nas lojas." (também na seção Planos do início) e "Conheça o app";
 *     lançado, o menu tem "Entrar" ao lado de "Assine aqui", e Use no navegador diz "Já tem conta? Entrar no navegador" nos dois estados;
 *     "Segurança" saiu do menu; e o endereço do Google Play é aceito só como a página oficial do app (`details?id=`).
 */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(import.meta.url);

interface Estado {
  lancado: boolean;
  lojas: { appStore: string; googlePlay: string };
  prazoDeResposta: string;
  assinaturaAberta: boolean;
  assinaturaSimulada: boolean;
}
interface Gerado {
  arquivos: Map<string, string | Buffer>;
  avisos: string[];
  pendencias: Map<string, string[]>;
  problemasFinais: string[];
}
const { gerarSite } = require(join(ROOT, 'scripts', 'gerar-site.js')) as { gerarSite: (opcoes?: Record<string, unknown>) => Gerado };
const { estadoDoProduto } = require(join(ROOT, 'scripts', 'site', 'estado.js')) as { estadoDoProduto: (s?: Record<string, unknown>) => Estado };
const config = require(join(ROOT, 'scripts', 'site', 'config.js')) as {
  URL_APP: string;
  URL_CRIAR_CONTA: string;
  URL_ENTRAR: string;
  URL_DEMO: string;
  ESTADO_DO_PRODUTO: Record<string, unknown>;
  MENU: { arquivo: string; rotulo: string }[];
};
const { selosDasLojas } = require(join(ROOT, 'scripts', 'site', 'estado.js')) as { selosDasLojas: (e: Estado, o?: { pequenos?: boolean }) => string };
const { URL_APP, URL_CRIAR_CONTA, URL_ENTRAR, URL_DEMO } = config;

/** A data de referência dos posts (a do mais novo, a mesma do teste site.test.ts), para todas as matérias saírem nos dois estados. */
const REFERENCIA = '2026-11-12';
const APP_STORE = 'https://apps.apple.com/br/app/clarevo/id0000000000';
/** A página oficial do app no Google Play: sempre com o identificador do pacote no parâmetro `id` (D-129). */
const GOOGLE_PLAY = 'https://play.google.com/store/apps/details?id=app.clarevo';
/** A linha dos planos antes do lançamento (D-129). */
const AVISO_DOS_PLANOS = 'A assinatura abre em breve, na web e nas lojas.';
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** O texto de um arquivo, com as entidades que o site usa trocadas pelo caractere e o espaço sem quebra virando espaço comum. */
function normalizar(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/ |&nbsp;/g, ' ');
}
/**
 * O que se confere em cada arquivo: o HTML como está (atributos, descrição da página, dados estruturados e endereços dos links) e o texto
 * sem as etiquetas (uma frase partida por `<a>` ou `<strong>` volta a ser uma frase só).
 */
function alvo(conteudo: string): string {
  const bruto = normalizar(conteudo);
  const texto = normalizar(conteudo.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
  return `${bruto}\n${texto}`;
}
/** Os arquivos que uma pessoa lê: todas as páginas, a busca da Ajuda e o feed das Novidades. */
const lidos = (g: Gerado) => [...g.arquivos.keys()].filter((k) => k.endsWith('.html') || k === 'ajuda/indice.json' || k === 'novidades/feed.xml').sort();
const texto = (g: Gerado, nome: string) => {
  const c = g.arquivos.get(nome);
  if (c === undefined) throw new Error(`${nome} não foi gerado`);
  return typeof c === 'string' ? c : c.toString('utf8');
};

/**
 * Os usos legítimos de palavras das regras abaixo, que continuam nos dois estados. Cada um diz o porquê; o trecho sai do texto antes da
 * conferência (ou o arquivo inteiro, com `trecho: null`). Uma exceção que não acha mais o trecho dela falha o teste: assim nenhuma fica
 * esquecida aqui depois que o texto mudar.
 */
const EXCECOES: { arquivo: RegExp; trecho: string | null; porque: string }[] = [
  {
    arquivo: /^novidades\/(\d{4}-\d{2}-\d{2}-[^/]+\.html|feed\.xml)$/,
    trecho: null,
    porque:
      'Novidades são registros datados ("Toda informação tem data", em Como escrevemos): o post de 23/10/2026 diz o que valia naquele dia ("chegam em breve à App Store e ao Google Play") e não é reescrito no lançamento. O feed repete os posts.',
  },
  {
    arquivo: /^noticias\/(index|materia)\.html$/,
    trecho: NOTICIAS_TEXT.emBreve,
    porque: 'O "Em breve" das notícias de fontes públicas (D-117) é de outro interruptor, NOTICIAS no painel da Cloudflare, e não do lançamento do app.',
  },
  {
    arquivo: /^privacidade\.html$/,
    trecho: 'previsto para o lançamento',
    porque:
      'Texto jurídico de docs/legal (o Sentry "previsto para o lançamento"): não fala de fase de testes nem do acesso, e só muda numa nova versão revisada pelo advogado (A16), fora do gerador; está na lista do dia do lançamento em docs/22_SITE.md, seção 19.1.',
  },
];

/** D-128: texto de fase de testes, ou a demonstração como chamada. Nunca, em nenhum dos dois estados. */
const NUNCA: [string, RegExp][] = [
  ['fase de testes', /fase de testes?/i],
  ['em testes', /\bem testes\b/i],
  ['piloto', /\bpiloto\b/i],
  ['quem testa', /quem (?:já )?testa/i],
  ['Preços no lançamento', /Preços no lançamento/i],
  // O lançamento do produto ("abre no lançamento", "até o lançamento"). "Lançamento" também é um registro de dinheiro ("nenhum lançamento
  // muda", "o detalhe do lançamento"), que vale nos dois estados: por isso só estas formas.
  ['o lançamento do produto', /\b(?:no|até o|antes do|depois do|para o|ao) lançamento\b/i],
  ['o acesso que abre', /acesso abre/i],
  ['a frase da assinatura fechada', new RegExp(escRe(ACCESS_TEXT.notOpenYet))],
  ['Como ter acesso', /Como ter acesso/],
  ['Ver a demonstração', /Ver a demonstração/],
  ['Testar grátis', /Testar (?:\d+ dias )?grátis/],
  ['a demonstração como botão', /class="botao[^"]*" href="https:\/\/demo\./],
];
/**
 * Só antes do lançamento: a fita "Em breve" dos planos, a linha de que a assinatura abre em breve, "Assine aqui" levando aos planos e o
 * "Entrar" como botão do menu. A tela de entrar em si vale nos dois estados (D-129: lançado, "Entrar" fica ao lado de "Assine aqui" no
 * menu, e Use no navegador diz "Já tem conta? Entrar no navegador").
 */
const SO_ANTES: [string, RegExp][] = [
  ['em breve', /\bem breve\b/i],
  ['a fita "Em breve"', /class="fita-em-breve"/],
  ['a assinatura abre em breve', new RegExp(escRe(AVISO_DOS_PLANOS))],
  ['"Assine aqui" para os planos', /<a class="botao botao-principal" href="(?:#planos|(?:\.\.\/)*planos\.html)">Assine aqui<\/a>/],
  ['"Entrar" como botão do menu', new RegExp(`<a class="menu-cta" href="${escRe(URL_ENTRAR)}"`)],
];
/** O que só vale lançado: nunca antes do lançamento (D-064: nenhum convite a criar conta, nem a tela inicial do app web). */
const SO_DEPOIS: [string, RegExp][] = [
  ['"Assine aqui" para criar conta', new RegExp(`<a class="botao botao-principal" href="${escRe(URL_CRIAR_CONTA)}" rel="noopener noreferrer">Assine aqui</a>`)],
  ['selo de loja', /class="selo-loja"|Baixar na App Store|Disponível no Google Play/],
  ['link para uma loja', /href="https:\/\/(?:apps\.apple\.com|play\.google\.com)\//],
  ['link para criar conta', new RegExp(escRe(URL_CRIAR_CONTA))],
  ['link para a tela inicial do app web', new RegExp(`href="${escRe(URL_APP)}/?"`)],
  ['aberta para todas as pessoas', /aberta para todas as pessoas/i],
  ['oferta com preço nos dados estruturados', /"@type":\s*"Offer"/],
];

/** Os achados de `regras` em todos os arquivos lidos, sem as exceções; e quantas vezes cada exceção foi usada. */
function varrer(g: Gerado, regras: [string, RegExp][], usadas?: Map<number, number>): string[] {
  const achados: string[] = [];
  for (const nome of lidos(g)) {
    let t = alvo(texto(g, nome));
    let pular = false;
    EXCECOES.forEach((e, i) => {
      if (!e.arquivo.test(nome)) return;
      if (e.trecho === null) {
        pular = true;
        usadas?.set(i, (usadas.get(i) ?? 0) + 1);
        return;
      }
      if (t.includes(e.trecho)) usadas?.set(i, (usadas.get(i) ?? 0) + 1);
      t = t.split(e.trecho).join(' ');
    });
    if (pular) continue;
    for (const [rotulo, re] of regras) {
      const m = re.exec(t);
      if (m) achados.push(`${nome}: ${rotulo} ("${t.slice(Math.max(0, m.index - 60), m.index + m[0].length + 60).replace(/\s+/g, ' ')}")`);
    }
  }
  return achados;
}

/** Os dados estruturados de um arquivo, já lidos como JSON (falha se algum não for JSON válido). */
function dadosEstruturados(html: string): Record<string, unknown>[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]!) as Record<string, unknown>);
}

describe('site público: um só estado do produto (D-125), em todas as páginas e nos dois sentidos', { timeout: 180_000 }, () => {
  const pre = gerarSite({ referencia: REFERENCIA });
  // O site lançado, só com a App Store com endereço (para conferir que o Google Play não aparece sem o dele). Com a assinatura do núcleo
  // ainda fechada, só simulando a aberta: sem isso, o gerador recusa (o último teste).
  const lancado = gerarSite({ referencia: REFERENCIA, estado: { lancado: true, lojas: { appStore: APP_STORE }, simularAssinaturaAberta: true } });

  it('as duas gerações têm as mesmas páginas', () => {
    expect(lidos(lancado)).toEqual(lidos(pre));
    expect(lidos(pre).filter((n) => n.endsWith('.html')).length).toBeGreaterThanOrEqual(100);
  });

  it('nos dois estados, nenhuma página tem texto de fase de testes nem a demonstração como chamada (D-128), fora as exceções documentadas, todas ainda em uso', () => {
    const usadas = new Map<number, number>();
    expect(varrer(pre, NUNCA, usadas)).toEqual([]);
    expect(varrer(lancado, NUNCA, usadas)).toEqual([]);
    for (const [i, e] of EXCECOES.entries()) expect(usadas.get(i) ?? 0, `exceção sem uso: ${e.arquivo} ${e.trecho ?? '(arquivo inteiro)'}`).toBeGreaterThan(0);
  });

  it('lançado: nada do que só vale antes do lançamento (a fita "Em breve", "Assine aqui" para os planos, a tela de entrar no menu)', () => {
    expect(varrer(lancado, SO_ANTES)).toEqual([]);
  });

  it('antes do lançamento: nenhuma página tem o que só vale lançado (criar conta, lojas, tela inicial do app web, oferta)', () => {
    expect(varrer(pre, SO_DEPOIS)).toEqual([]);
  });

  it('as regras não são vazias: o que só vale antes existe antes do lançamento, e o do site lançado existe nele', () => {
    const achadosPre = varrer(pre, SO_ANTES).join('\n');
    for (const [rotulo] of SO_ANTES) expect(achadosPre, rotulo).toContain(`: ${rotulo} (`);
    const achadosLancado = varrer(lancado, SO_DEPOIS).join('\n');
    for (const [rotulo] of SO_DEPOIS) expect(achadosLancado, rotulo).toContain(`: ${rotulo} (`);
    // Sem o endereço do Google Play, nenhum selo nem link dele.
    expect(achadosLancado).not.toMatch(/Disponível no Google Play|play\.google\.com/);
  });

  it('"Assine aqui" é a chamada principal de toda capa e chamada final: para os planos antes do lançamento, para criar conta depois, com no máximo dois botões por bloco', () => {
    const PAGINAS_COM_CHAMADAS = ['index.html', 'comece.html', 'app/index.html', 'web.html', 'mei.html'];
    const chamadasDe = (g: Gerado, nome: string) =>
      [...texto(g, nome).matchAll(/<div class="acoes">\n([\s\S]*?)\n<\/div>/g)].map((m) => [...m[1]!.matchAll(/<a class="botao ([^"]+)" href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((b) => [b[1], b[2], b[3]]));
    for (const nome of PAGINAS_COM_CHAMADAS) {
      for (const [g, estado] of [[pre, 'antes'], [lancado, 'lançado']] as const) {
        const blocos = chamadasDe(g, nome);
        expect(blocos.length, `${nome} (${estado})`).toBeGreaterThanOrEqual(1);
        for (const b of blocos) {
          expect(b.length, `${nome} (${estado}): ${JSON.stringify(b)}`).toBeLessThanOrEqual(2);
          const destino = estado === 'lançado' ? URL_CRIAR_CONTA : nome === 'index.html' ? '#planos' : nome.includes('/') ? '../planos.html' : 'planos.html';
          expect(b[0], `${nome} (${estado})`).toEqual(['botao-principal', destino, 'Assine aqui']);
          // A segunda, quando há: Conheça o app ou Use no navegador, nunca a demonstração.
          if (b[1]) expect(['Conheça o app', 'Use no navegador'], `${nome} (${estado})`).toContain(b[1][2]);
        }
      }
    }
    // A demonstração (dados fictícios), nos dois estados, só como link de texto discreto em O app e em Use no navegador.
    for (const g of [pre, lancado]) {
      const comDemo = lidos(g).filter((n) => texto(g, n).includes(URL_DEMO));
      expect(comDemo).toEqual(['app/index.html', 'web.html']);
      for (const n of comDemo) expect(texto(g, n), n).toContain(`<p class="link-demo"><a href="${URL_DEMO}" rel="noopener noreferrer">Ver uma demonstração com dados fictícios</a></p>`);
    }
  });

  it('o menu leva aonde diz, em todas as páginas: "Entrar" à tela de entrar antes do lançamento; lançado, "Assine aqui" à de criar conta e "Entrar" ao lado (D-129)', () => {
    const botoes = (g: Gerado) => {
      const vistos = new Set<string>();
      let paginas = 0;
      for (const nome of lidos(g).filter((n) => n.endsWith('.html'))) {
        const h = texto(g, nome);
        const cta = [...h.matchAll(/<a class="menu-cta" href="([^"]+)" rel="noopener noreferrer">([^<]+)<\/a>/g)];
        const entrar = [...h.matchAll(/<a class="menu-entrar" href="([^"]+)" rel="noopener noreferrer">([^<]+)<\/a>/g)];
        if (!h.includes('class="menu-cta"')) continue;
        paginas++;
        expect(cta.length, nome).toBe(1);
        expect(entrar.length, nome).toBeLessThanOrEqual(1);
        // O menu do celular repete os mesmos links, com os mesmos destinos, "Entrar" antes de "Assine aqui".
        const movel = /<details class="menu-movel">[\s\S]*?<\/details>/.exec(h)?.[0] ?? '';
        const noMovel = (l: RegExpExecArray | RegExpMatchArray) => `<li><a href="${l[1]}" rel="noopener noreferrer">${l[2]}</a></li>`;
        expect(movel, nome).toContain(entrar[0] ? `${noMovel(entrar[0])}${noMovel(cta[0]!)}` : noMovel(cta[0]!));
        vistos.add([...entrar, ...cta].map((l) => `${l[2]} -> ${l[1]}`).join(' | '));
      }
      return { vistos: [...vistos], paginas };
    };
    const a = botoes(pre);
    const b = botoes(lancado);
    expect(a.paginas).toBeGreaterThanOrEqual(100);
    expect(b.paginas).toBe(a.paginas);
    expect(a.vistos).toEqual([`Entrar -> ${URL_ENTRAR}`]);
    expect(b.vistos).toEqual([`Entrar -> ${URL_ENTRAR} | Assine aqui -> ${URL_CRIAR_CONTA}`]);
    expect(URL_ENTRAR).toBe(`${URL_APP}/entrar`);
    expect(URL_CRIAR_CONTA).toBe(`${URL_APP}/criar-conta`);
    // "Segurança" saiu do menu (D-129): continua na faixa de confiança das capas e no rodapé.
    expect(config.MENU.map((m) => m.rotulo)).not.toContain('Segurança');
    for (const g of [pre, lancado]) {
      const h = texto(g, 'index.html');
      expect(/<ul class="menu-lista">[\s\S]*?<\/ul>/.exec(h)?.[0]).not.toContain('seguranca.html');
      expect(h).toContain('<li><a href="seguranca.html">Segurança e privacidade</a></li>');
      expect(h).toMatch(/<p class="confianca"><a href="seguranca\.html">/);
    }
  });

  it('os planos nunca são um beco sem saída (D-129): lançado, "Assine aqui" e "Conheça o app" na capa; antes, à vista, a assinatura em breve e "Conheça o app"', () => {
    const PLANOS = { 'planos.html': '', 'planos/individual.html': '../', 'planos/familia.html': '../' } as const;
    for (const [nome, sobe] of Object.entries(PLANOS)) {
      const capaDe = (g: Gerado) => /<section class="capa[^"]*">([\s\S]*?)<\/section>/.exec(texto(g, nome))?.[1] ?? '';
      expect(capaDe(lancado), nome).toContain(
        `<div class="acoes">\n<a class="botao botao-principal" href="${URL_CRIAR_CONTA}" rel="noopener noreferrer">Assine aqui</a>\n<a class="botao botao-suave" href="${sobe}app/index.html">Conheça o app</a>\n</div>\n<p class="estado-produto">${TRIAL_DAYS} dias grátis, sem cartão. Cancele quando quiser.</p>`,
      );
      expect(capaDe(pre), nome).toContain(
        `<p class="estado-produto">${AVISO_DOS_PLANOS}</p>\n<div class="acoes">\n<a class="botao botao-suave" href="${sobe}app/index.html">Conheça o app</a>\n</div>`,
      );
      expect(capaDe(pre), nome).not.toContain('botao-principal');
      expect(capaDe(lancado), nome).not.toContain(AVISO_DOS_PLANOS);
    }
    // A seção Planos do início, aonde "Assine aqui" da capa leva antes do lançamento: a mesma linha, logo abaixo do título.
    expect(texto(pre, 'index.html')).toMatch(new RegExp(`<h2 id="planos">Planos</h2>\n<p class="lead-bloco">[^<]+</p>\n<p class="aviso-assinatura">${escRe(AVISO_DOS_PLANOS)}</p>`));
    expect(texto(lancado, 'index.html')).not.toContain('aviso-assinatura');
  });

  it('Use no navegador: "Já tem conta? Entrar no navegador" embaixo das chamadas da capa e da chamada final, nos dois estados (D-129)', () => {
    const entrar = `<p class="ja-tem-conta">Já tem conta? <a href="${URL_ENTRAR}" rel="noopener noreferrer">Entrar no navegador</a></p>`;
    for (const g of [pre, lancado]) {
      const h = texto(g, 'web.html');
      expect(h.split(entrar).length - 1).toBe(2);
      expect(h).toMatch(new RegExp(`</div>\n${escRe(entrar)}\n</div>`));
    }
  });

  it('o endereço das lojas (D-129): o Google Play só como a página oficial do app (details?id=), a App Store sem parâmetro; outros recusados', () => {
    expect(estadoDoProduto({ lojas: { googlePlay: GOOGLE_PLAY } }).lojas.googlePlay).toBe(GOOGLE_PLAY);
    expect(estadoDoProduto({ lojas: { appStore: APP_STORE } }).lojas.appStore).toBe(APP_STORE);
    for (const url of [
      'https://play.google.com/store/apps/details?id=app.clarevo&hl=pt_BR',
      'https://play.google.com/store/apps/details?id=app.clarevo&utm_source=site',
      'https://play.google.com/store/apps/details?id=app.clarevo#avaliacoes',
      'https://play.google.com/store/apps/details?id=',
      'https://play.google.com/store/apps/details?id=app clarevo',
      'https://play.google.com/store/apps/dev?id=123',
      'http://play.google.com/store/apps/details?id=app.clarevo',
      'https://play.google.com.golpe.test/store/apps/details?id=app.clarevo',
      'https://golpe.test/?https://play.google.com/store/apps/details?id=app.clarevo',
      // O pacote: partes separadas por ponto (pelo menos duas), cada uma começando por letra (D-129, revisão).
      'https://play.google.com/store/apps/details?id=clarevo',
      'https://play.google.com/store/apps/details?id=1app.clarevo',
      'https://play.google.com/store/apps/details?id=app..clarevo',
      'https://play.google.com/store/apps/details?id=app.clarevo.',
    ]) {
      expect(() => estadoDoProduto({ lojas: { googlePlay: url } }), url).toThrow(/googlePlay/);
    }
    for (const url of [
      'https://apps.apple.com/br/app/clarevo/id0000000000?mt=8',
      'https://apps.apple.com/br/app/clarevo/id0000000000#x',
      'https://golpe.test/apps.apple.com/',
      // Só a página de um app (D-129, revisão): nada de página de desenvolvedor, de busca ou da loja inteira.
      'https://apps.apple.com/',
      'https://apps.apple.com/br/developer/clarevo/id123',
      'https://apps.apple.com/br/app/clarevo/',
      'https://apps.apple.com/us/app/clarevo/id123',
      'https://apps.apple.com/br/app/Clarevo/id123',
    ]) {
      expect(() => estadoDoProduto({ lojas: { appStore: url } }), url).toThrow(/appStore/);
    }
    for (const url of ['https://apps.apple.com/br/app/clarevo/id1234567890', 'https://apps.apple.com/app/id1234567890', 'https://apps.apple.com/br/app/clarevo-controle-de-gastos/id1']) {
      expect(estadoDoProduto({ lojas: { appStore: url } }).lojas.appStore, url).toBe(url);
    }
    expect(estadoDoProduto({ lojas: { googlePlay: 'https://play.google.com/store/apps/details?id=br.com.clarevo_app' } }).lojas.googlePlay).toContain('br.com.clarevo_app');
    // Lançado, com o endereço oficial do Google Play, o selo leva a ele (o "?" escapado só no HTML).
    const comAsDuas = estadoDoProduto({ lancado: true, lojas: { appStore: APP_STORE, googlePlay: GOOGLE_PLAY }, simularAssinaturaAberta: true });
    expect(selosDasLojas(comAsDuas)).toContain(`<a class="selo-loja" href="${GOOGLE_PLAY}" rel="noopener noreferrer">Disponível no Google Play</a>`);
    // Nas capas, os selos numa linha pequena de texto, sem virar um terceiro botão.
    expect(selosDasLojas(comAsDuas, { pequenos: true })).toMatch(/^<p class="selos-lojas selos-pequenos">No celular: <a class="selo-loja"/);
    // Antes do lançamento, nenhum selo, mesmo com os endereços.
    expect(selosDasLojas(estadoDoProduto({ lojas: { googlePlay: GOOGLE_PLAY } }))).toBe('');
  });

  it('O app, as calculadoras e o kit de imprensa seguem o estado: a versão web, o app que se pode abrir e "Onde usar"', () => {
    const appPre = texto(pre, 'app/index.html');
    const appLancado = texto(lancado, 'app/index.html');
    expect(appPre).toContain(`Já tem conta? <a href="${URL_ENTRAR}" rel="noopener noreferrer">Entrar na versão web</a>.`);
    expect(appLancado).toContain(`<a href="${URL_APP}" rel="noopener noreferrer">Abrir a versão web</a>.`);
    for (const g of [pre, lancado]) expect(texto(g, 'app/index.html')).toContain('<a href="../web.html">Use a Clarevo no navegador</a>.');
    // As calculadoras: antes do lançamento, nenhum app para abrir (D-128: nem a demonstração); depois, a versão web.
    const calcPre = texto(pre, 'calculadoras/reserva.html');
    const calcLancado = texto(lancado, 'calculadoras/reserva.html');
    expect(calcPre).toContain('Sem ele, veja o exemplo mais abaixo e a lista do que ela pede.</p>');
    expect(calcPre).toContain('<p class="calc-carregando">Carregando a calculadora. Se ela não aparecer, o seu navegador pode estar bloqueando o JavaScript deste site.</p>');
    expect(calcPre).not.toContain(URL_DEMO);
    expect(calcLancado).toContain(`ou use a <a href="${URL_APP}" rel="noopener noreferrer">versão web</a> da Clarevo.`);
    expect(calcLancado).toContain(`Você também pode usar a <a href="${URL_APP}" rel="noopener noreferrer">versão web</a> da Clarevo.`);
    expect(texto(pre, 'imprensa.html')).toContain('<li><strong>Onde usar:</strong> na web, no navegador do computador ou do celular. O app para iPhone e Android chega em breve à App Store e ao Google Play.</li>');
    expect(texto(lancado, 'imprensa.html')).toContain('<li><strong>Onde usar:</strong> na web e na App Store.</li>');
  });

  it('os planos: a fita "Em breve" em cada cartão (e a etiqueta na capa de cada plano) só antes do lançamento; a frase da assinatura fechada e "Preços no lançamento" nunca', () => {
    for (const nome of ['index.html', 'planos.html']) {
      expect(texto(pre, nome).match(/<span class="fita-em-breve" aria-hidden="true">Em breve<\/span>/g)?.length, nome).toBe(2);
      expect(texto(pre, nome).match(/<span class="so-leitor"> \(em breve\)<\/span><\/h3>/g)?.length, nome).toBe(2);
      expect(texto(lancado, nome), nome).not.toMatch(/fita-em-breve|com-fita|\(em breve\)/);
    }
    for (const nome of ['planos/individual.html', 'planos/familia.html']) {
      expect(texto(pre, nome), nome).toContain('<span class="etiqueta etiqueta-capa">Em breve</span>');
      expect(texto(lancado, nome), nome).not.toContain('etiqueta-capa');
    }
    for (const nome of ['index.html', 'planos.html', 'planos/individual.html', 'planos/familia.html']) {
      for (const g of [pre, lancado]) {
        expect(texto(g, nome), nome).not.toContain(ACCESS_TEXT.notOpenYet);
        expect(texto(g, nome), nome).not.toContain('Preços no lançamento');
      }
    }
  });

  it('os dados estruturados: JSON válido em todas as páginas; SoftwareApplication sem oferta antes do lançamento e com os dois planos, no mensal e no anual, depois', () => {
    for (const g of [pre, lancado]) {
      for (const nome of lidos(g).filter((n) => n.endsWith('.html'))) {
        for (const d of dadosEstruturados(texto(g, nome))) {
          expect(d['@context'], nome).toBe('https://schema.org');
          expect(typeof d['@type'], nome).toBe('string');
        }
      }
    }
    for (const nome of ['index.html', 'planos.html']) {
      const appPre = dadosEstruturados(texto(pre, nome)).find((d) => d['@type'] === 'SoftwareApplication')!;
      const appLancado = dadosEstruturados(texto(lancado, nome)).find((d) => d['@type'] === 'SoftwareApplication')!;
      expect(appPre, nome).toMatchObject({ name: 'Clarevo', applicationCategory: 'FinanceApplication', operatingSystem: 'Web' });
      expect(appPre, nome).not.toHaveProperty('offers');
      expect(appLancado, nome).toMatchObject({ name: 'Clarevo', applicationCategory: 'FinanceApplication', operatingSystem: 'Web, iOS' });
      const ofertas = appLancado.offers as { '@type': string; name: string; price: string; priceCurrency: string }[];
      // D-127: os dois planos no mensal e no anual, com o preço do núcleo.
      expect(ofertas.map((o) => [o['@type'], o.name, o.price, o.priceCurrency]), nome).toEqual([
        ['Offer', `Plano ${PLAN_NAME.individual}`, planPriceAmount('individual').replace(/[^\d,]/g, '').replace(',', '.'), 'BRL'],
        ['Offer', `Plano ${PLAN_NAME.individual} anual`, '269.90', 'BRL'],
        ['Offer', `Plano ${PLAN_NAME.familiar}`, planPriceAmount('familiar').replace(/[^\d,]/g, '').replace(',', '.'), 'BRL'],
        ['Offer', `Plano ${PLAN_NAME.familiar} anual`, '629.90', 'BRL'],
      ]);
    }
    // As perguntas frequentes do início (D-128), iguais nos dois estados: seis perguntas, cada uma com a resposta.
    for (const g of [pre, lancado]) {
      const faq = dadosEstruturados(texto(g, 'index.html')).find((d) => d['@type'] === 'FAQPage') as { mainEntity: { '@type': string; name: string; acceptedAnswer: { '@type': string; text: string } }[] } | undefined;
      expect(faq).toBeDefined();
      expect(faq!.mainEntity.length).toBe(6);
      for (const q of faq!.mainEntity) expect([q['@type'], q.acceptedAnswer['@type'], q.acceptedAnswer.text.length > 40]).toEqual(['Question', 'Answer', true]);
      expect(faq!.mainEntity.at(-1)!.name).toBe(`O que acontece depois dos ${TRIAL_DAYS} dias grátis?`);
    }
    expect(dadosEstruturados(texto(pre, 'index.html')).find((d) => d['@type'] === 'FAQPage')).toEqual(dadosEstruturados(texto(lancado, 'index.html')).find((d) => d['@type'] === 'FAQPage'));
  });

  it('robots.txt e a política de segurança (_headers) não mudam com o estado; com marcador pendente, nada é indexado', () => {
    expect(texto(lancado, 'robots.txt')).toBe(texto(pre, 'robots.txt'));
    expect(texto(lancado, '_headers')).toBe(texto(pre, '_headers'));
    if (pre.pendencias.size > 0) expect(texto(pre, 'robots.txt')).toContain('Disallow: /');
    expect(texto(pre, '_headers')).toContain("Content-Security-Policy: default-src 'none'; img-src 'self'; media-src 'self'; style-src 'self'; font-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  });

  it('o interruptor: lançar com a assinatura fechada é recusado com o que mudar; a simulação só pelo --estado, com aviso e recusa do --final', () => {
    expect(config.ESTADO_DO_PRODUTO.lancado).toBe(false);
    for (const chave of ['assinaturaAberta', 'simularAssinaturaAberta', 'assinaturaSimulada']) expect(config.ESTADO_DO_PRODUTO, chave).not.toHaveProperty(chave);
    expect(estadoDoProduto().assinaturaAberta).toBe(SUBSCRIBE_OPEN);
    expect(() => estadoDoProduto({ assinaturaAberta: true })).toThrow(/simularAssinaturaAberta/);
    expect(() => estadoDoProduto({ simularAssinaturaAberta: 'sim' })).toThrow(/true ou false/);
    if (!SUBSCRIBE_OPEN) {
      expect(() => estadoDoProduto({ lancado: true })).toThrow(/SUBSCRIBE_OPEN = false em packages\/core\/src\/plano-precos\.ts[\s\S]*mude "lancado" para true em scripts\/site\/config\.js/);
      expect(() => gerarSite({ referencia: REFERENCIA, estado: { lancado: true } })).toThrow(/assinatura pelo app ainda fechada/);
      expect(estadoDoProduto({ lancado: true, simularAssinaturaAberta: true })).toMatchObject({ lancado: true, assinaturaAberta: true, assinaturaSimulada: true });
      expect(lancado.problemasFinais.some((p) => /simula a assinatura aberta/.test(p))).toBe(true);
      expect(lancado.avisos.some((p) => /^o --final recusaria: o estado do produto simula a assinatura aberta/.test(p))).toBe(true);
    }
    expect(pre.problemasFinais.some((p) => /simula a assinatura/.test(p))).toBe(false);
  });
});
