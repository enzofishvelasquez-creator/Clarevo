/// <reference types="node" />
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NOTICIAS_TEXT } from '../src/noticias/fontes';
import { ACCESS_TEXT, BILLING_PERIODS, PLAN_NAME, PLAN_PERIOD_PRICE_CENTS, SUBSCRIBE_OPEN, TRIAL_DAYS, planPeriodPriceAmount, planPriceAmount } from '../src/plano';

/**
 * O estado do produto (D-125, `scripts/site/estado.js`, `docs/22_SITE.md`, seção 19): UM interruptor, `ESTADO_DO_PRODUTO.lancado` em
 * `scripts/site/config.js`. O teste gera o site INTEIRO nos dois estados, em memória, e confere em todas as páginas que:
 *   - nos DOIS estados, nenhum texto de fase de testes (D-128, pedido do Enzo, 26/11/2026): "fase de testes", "em testes", "piloto", "quem
 *     testa", "Preços no lançamento", "abre no lançamento" e as outras formas do lançamento do produto, a frase da assinatura fechada, "Como
 *     ter acesso", "Ver a demonstração" e "Testar grátis"; a demonstração só como link de texto em O app e em Use no navegador;
 *   - antes do lançamento, só antes: a fita "Em breve" nos planos, "Assine aqui" levando aos planos, o "Entrar" do menu para a tela de entrar
 *     e, desde 27/11/2026 (decisão do Enzo; o cadastro está aberto, D-129 A), o convite "Criar conta grátis" com a linha "A assinatura abre em
 *     breve. Por enquanto, o acesso é completo e nada é cobrado.", só nos planos (a seção do início, `planos.html` e cada plano, com o plano
 *     no endereço), em Comece aqui, em Use no navegador e na linha do fim das páginas de conteúdo; nunca no menu, nunca uma compra, nunca um
 *     preço junto do convite;
 *   - lançado, só lançado: "Assine aqui" e o menu levando à tela de criar conta, selos e links das lojas, a tela inicial do app web, "aberta
 *     para todas as pessoas" e oferta com preço nos dados estruturados (nada disso antes);
 *   - "Assine aqui" é a chamada principal de todas as capas e chamadas finais, com no máximo dois botões por bloco; os dados estruturados são
 *     JSON válido (com a FAQPage do início); `robots.txt` e `_headers` (a política de segurança) não mudam com o estado;
 *   - `lancado: true` é recusado enquanto a assinatura pelo app estiver fechada (`SUBSCRIBE_OPEN`). O site lançado deste teste usa
 *     `simularAssinaturaAberta`, que só o `--estado` aceita e que o `--final` recusa;
 *   - desde a análise geral de 26/11/2026 (D-129): os planos (`planos.html` e a página de cada plano) têm, lançado, "Assine aqui" e "Conheça
 *     o app" na capa e, antes, "Criar conta grátis" e "Conheça o app", com a linha do convite (na seção Planos do início, o convite num quadro);
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
/** A linha dos planos e do convite ao cadastro antes do lançamento (desde 27/11/2026; até então, "A assinatura abre em breve, na web e nas lojas."). */
const AVISO_DOS_PLANOS = 'A assinatura abre em breve. Por enquanto, o acesso é completo e nada é cobrado.';
/** O botão do convite ao cadastro, só antes do lançamento (27/11/2026). */
const CONVITE = 'Criar conta grátis';
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
  ['o convite "Criar conta grátis"', new RegExp(escRe(CONVITE))],
];
/**
 * O que só vale lançado: nunca antes do lançamento ("Assine aqui" para o cadastro, as lojas, a tela inicial do app web, a oferta). Desde
 * 27/11/2026, a tela de criar conta em si vale nos dois estados: antes do lançamento, só pelo convite "Criar conta grátis" (o teste do
 * convite, abaixo, confere onde e como).
 */
const SO_DEPOIS: [string, RegExp][] = [
  ['"Assine aqui" para criar conta', new RegExp(`<a class="botao botao-principal" href="${escRe(URL_CRIAR_CONTA)}" rel="noopener noreferrer">Assine aqui</a>`)],
  ['selo de loja', /class="selo-loja"|Baixar na App Store|Disponível no Google Play/],
  ['link para uma loja', /href="https:\/\/(?:apps\.apple\.com|play\.google\.com)\//],
  ['"Assine aqui" no menu', new RegExp(`<a class="menu-cta" href="${escRe(URL_CRIAR_CONTA)}"`)],
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

  it('antes do lançamento: nenhuma página tem o que só vale lançado ("Assine aqui" para o cadastro, lojas, tela inicial do app web, oferta)', () => {
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
        for (const [i, b] of blocos.entries()) {
          expect(b.length, `${nome} (${estado}): ${JSON.stringify(b)}`).toBeLessThanOrEqual(2);
          // Antes do lançamento (27/11/2026), a chamada final de Use no navegador convida a criar a conta ("Criar conta grátis", para o
          // cadastro), no lugar de "Assine aqui"; a capa continua com "Assine aqui", para os planos.
          if (estado === 'antes' && nome === 'web.html' && i === blocos.length - 1) {
            expect(b[0], `${nome} (${estado}), chamada final`).toEqual(['botao-principal', URL_CRIAR_CONTA, CONVITE]);
            continue;
          }
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

  it('os planos nunca são um beco sem saída (D-129): lançado, "Assine aqui" e "Conheça o app" na capa; antes, "Criar conta grátis" e "Conheça o app", com a linha do convite (27/11/2026)', () => {
    // Desde 27/11/2026 (jornada de compra, item S3), a capa de cada plano leva o plano no endereço do cadastro; o resumo, não.
    const PLANOS = { 'planos.html': ['', ''], 'planos/individual.html': ['../', '?plano=individual'], 'planos/familia.html': ['../', '?plano=familia'] } as const;
    for (const [nome, [sobe, doPlano]] of Object.entries(PLANOS)) {
      const capaDe = (g: Gerado) => /<section class="capa[^"]*">([\s\S]*?)<\/section>/.exec(texto(g, nome))?.[1] ?? '';
      expect(capaDe(lancado), nome).toContain(
        `<div class="acoes">\n<a class="botao botao-principal" href="${URL_CRIAR_CONTA}${doPlano}" rel="noopener noreferrer">Assine aqui</a>\n<a class="botao botao-suave" href="${sobe}app/index.html">Conheça o app</a>\n</div>\n<p class="estado-produto">${TRIAL_DAYS} dias grátis, sem cartão. Cancele quando quiser.</p>`,
      );
      // Antes do lançamento, desde 27/11/2026: "Criar conta grátis" (o cadastro, com o plano da página) e "Conheça o app", com a linha do
      // convite embaixo; nenhum "Assine aqui" na capa (os planos são aonde ele leva).
      expect(capaDe(pre), nome).toContain(
        `<div class="acoes">\n<a class="botao botao-principal" href="${URL_CRIAR_CONTA}${doPlano}" rel="noopener noreferrer">${CONVITE}</a>\n<a class="botao botao-suave" href="${sobe}app/index.html">Conheça o app</a>\n</div>\n<p class="estado-produto">${AVISO_DOS_PLANOS}</p>`,
      );
      expect(capaDe(pre), nome).not.toContain('Assine aqui');
      expect(capaDe(lancado), nome).not.toContain(AVISO_DOS_PLANOS);
      expect(capaDe(lancado), nome).not.toContain(CONVITE);
    }
    // A seção Planos do início, aonde "Assine aqui" da capa leva antes do lançamento: o convite, logo abaixo do título, num quadro.
    expect(texto(pre, 'index.html')).toMatch(
      new RegExp(
        `<h2 id="planos">Planos</h2>\n<p class="lead-bloco">[^<]+</p>\n<div class="convite-conta">\n<p class="aviso-assinatura">${escRe(AVISO_DOS_PLANOS)}</p>\n<p class="acoes acoes-convite"><a class="botao botao-principal" href="${escRe(URL_CRIAR_CONTA)}" rel="noopener noreferrer">${CONVITE}</a></p>\n</div>`,
      ),
    );
    expect(texto(lancado, 'index.html')).not.toContain('aviso-assinatura');
    expect(texto(lancado, 'index.html')).not.toContain('convite-conta');
  });

  it('antes do lançamento, o convite ao cadastro (decisão do Enzo de 27/11/2026): só nos lugares combinados, sempre com a linha honesta, nunca no menu, nunca uma compra, nunca com preço', () => {
    const conteudo = (n: string) => /^(aprender|calculadoras|ajuda)\/[^/]+\.html$/.test(n) || /^novidades\/(index|\d{4}-\d{2}-\d{2}-[^/]+)\.html$/.test(n);
    const links = new Map<string, string[]>();
    for (const nome of lidos(pre).filter((n) => n.endsWith('.html'))) {
      const achados = [...texto(pre, nome).matchAll(new RegExp(`<a(?: class="[^"]+")? href="(${escRe(URL_CRIAR_CONTA)}[^"]*)" rel="noopener noreferrer">([^<]+)</a>`, 'g'))].map((m) => `${m[2]} -> ${m[1]!.replace(/&amp;/g, '&')}`);
      // Todo endereço do cadastro está num desses links (nenhum outro jeito de chegar lá).
      expect((texto(pre, nome).match(/criar-conta/g) ?? []).length, nome).toBe(achados.length);
      if (achados.length && !conteudo(nome)) links.set(nome, achados);
      if (conteudo(nome)) expect(achados, nome).toEqual([`crie a sua conta na Clarevo -> ${URL_CRIAR_CONTA}`]);
    }
    const botao = (q = '') => `${CONVITE} -> ${URL_CRIAR_CONTA}${q}`;
    expect(Object.fromEntries(links)).toEqual({
      'index.html': [botao()],
      'comece.html': [botao()],
      'planos.html': [botao()],
      'planos/individual.html': [botao('?plano=individual')],
      'planos/familia.html': [botao('?plano=familia')],
      'web.html': [botao()],
    });
    // Sempre com a linha honesta ao lado, e nunca no menu (o menu continua só com "Entrar").
    for (const nome of [...links.keys(), ...lidos(pre).filter(conteudo)]) {
      const h = texto(pre, nome);
      expect(h, nome).toContain(AVISO_DOS_PLANOS);
      expect(/<header[\s\S]*?<\/header>/.exec(h)?.[0] ?? '', nome).not.toContain('criar-conta');
    }
    // A ponte e o convite: nada de preço nem de prazo junto ("R$" com número, dias, datas), e nenhum link de compra em página nenhuma.
    const blocosDoConvite = [
      /<div class="convite-conta">[\s\S]*?<\/div>/.exec(texto(pre, 'index.html'))![0],
      /<li><h3>Crie a sua conta<\/h3>[\s\S]*?<\/li>/.exec(texto(pre, 'comece.html'))![0],
      /<div class="chamada-final">[\s\S]*?<\/div>\n<p class="ja-tem-conta">/.exec(texto(pre, 'web.html'))![0],
      ...['planos.html', 'planos/individual.html', 'planos/familia.html'].map((n) => /<div class="acoes">\n<a class="botao botao-principal"[\s\S]*?<p class="estado-produto">[^<]+<\/p>/.exec(texto(pre, n))![0]),
      /<p class="ponte">[\s\S]*?<\/p>/.exec(texto(pre, 'aprender/index.html'))![0],
    ];
    for (const b of blocosDoConvite) {
      expect(b).toMatch(/Criar conta grátis|crie a sua conta na Clarevo/);
      expect(b).toContain(AVISO_DOS_PLANOS);
      expect(b).not.toMatch(/R\$\s?\d|\d+ dias|\d{2}\/\d{2}/);
    }
    for (const nome of lidos(pre)) expect(texto(pre, nome), nome).not.toMatch(/href="[^"]*(?:\/conta\/assinatura|assinar=|checkout|asaas|\/pagar)/i);
    // A linha é a do app com a compra fechada (ACCESS_TEXT.notOpenYet), sem o "Assinatura em breve." do começo.
    expect(AVISO_DOS_PLANOS).toBe(`A assinatura abre em breve. ${ACCESS_TEXT.notOpenYet.replace(/^Assinatura em breve\. /, '')}`);
    expect(SUBSCRIBE_OPEN).toBe(false);
  });

  it('as páginas de conteúdo terminam com uma linha calma para o app (jornada de compra de 27/11/2026, S2): o cadastro, antes do lançamento com a linha do convite, lançado com o teste grátis', () => {
    const conteudo = (g: Gerado) => lidos(g).filter((n) => /^(aprender|calculadoras|ajuda)\/[^/]+\.html$/.test(n) || /^novidades\/(index|\d{4}-\d{2}-\d{2}-[^/]+)\.html$/.test(n));
    const nomes = conteudo(pre);
    // Todas: os temas de Aprender, a agenda, as calculadoras, a Ajuda e as Novidades, com os índices.
    expect(nomes).toEqual(expect.arrayContaining(['aprender/index.html', 'aprender/agenda.html', 'calculadoras/index.html', 'calculadoras/reserva.html', 'ajuda/index.html', 'novidades/index.html']));
    expect(nomes.length).toBeGreaterThan(50);
    const ponte = /<div class="bloco bloco-ponte">\n<div class="miolo">\n(<p class="ponte">[\s\S]*?<\/p>)\n<\/div>\n<\/div>\n<\/main>/;
    const inicio = 'Para organizar as contas, os cartões e os gastos do mês com os seus números, no navegador ou no celular,';
    for (const nome of nomes) {
      expect(ponte.exec(texto(pre, nome))?.[1], `${nome} (antes)`).toBe(`<p class="ponte">${inicio} <a href="${URL_CRIAR_CONTA}" rel="noopener noreferrer">crie a sua conta na Clarevo</a>. ${AVISO_DOS_PLANOS}</p>`);
      expect(ponte.exec(texto(lancado, nome))?.[1], `${nome} (lançado)`).toBe(`<p class="ponte">${inicio} <a href="${URL_CRIAR_CONTA}" rel="noopener noreferrer">crie a sua conta na Clarevo</a>. Toda conta começa com ${TRIAL_DAYS} dias grátis, sem cartão.</p>`);
    }
    // Só nas páginas de conteúdo: nem as páginas de venda (que já têm as chamadas) nem a 404 e as legais.
    for (const g of [pre, lancado]) for (const n of lidos(g).filter((x) => x.endsWith('.html') && !conteudo(g).includes(x))) expect(texto(g, n), n).not.toContain('class="ponte"');
    // Calma: nada de pressa nem de promessa.
    expect(`${texto(pre, 'aprender/index.html')} ${texto(lancado, 'aprender/index.html')}`).not.toMatch(/agora mesmo|não perca|últimas|garanta|economize/i);
  });

  it('lançado, "Assine aqui" de um plano leva o plano ao cadastro (?plano=individual|familia, e &periodo=mensal|anual quando a página mostra um período só); o cabeçalho e as capas genéricas, sem parâmetro (S3)', () => {
    const { urlDoCadastro } = require(join(ROOT, 'scripts', 'site', 'estado.js')) as { urlDoCadastro: (o?: { plano?: string | null; periodo?: string | null }) => string };
    expect(urlDoCadastro()).toBe(URL_CRIAR_CONTA);
    expect(urlDoCadastro({ plano: 'individual' })).toBe(`${URL_CRIAR_CONTA}?plano=individual`);
    expect(urlDoCadastro({ plano: 'familiar' })).toBe(`${URL_CRIAR_CONTA}?plano=familia`);
    expect(urlDoCadastro({ plano: 'familiar', periodo: 'anual' })).toBe(`${URL_CRIAR_CONTA}?plano=familia&periodo=anual`);
    expect(urlDoCadastro({ plano: 'individual', periodo: 'mensal' })).toBe(`${URL_CRIAR_CONTA}?plano=individual&periodo=mensal`);
    expect(() => urlDoCadastro({ plano: 'familia' })).toThrow(/não conhece o plano/);
    expect(() => urlDoCadastro({ plano: 'individual', periodo: 'semanal' })).toThrow(/não conhece o período/);
    expect(() => urlDoCadastro({ periodo: 'anual' })).toThrow(/só com o plano/);
    // No site lançado: os únicos endereços do cadastro com parâmetro são os das capas das duas páginas de plano, cada um com o seu.
    const comParametro = new Map<string, string[]>();
    for (const nome of lidos(lancado).filter((n) => n.endsWith('.html'))) {
      const achados = [...texto(lancado, nome).matchAll(new RegExp(`href="${escRe(URL_CRIAR_CONTA)}\\?([^"]*)"`, 'g'))].map((m) => m[1]!.replace(/&amp;/g, '&'));
      if (achados.length) comParametro.set(nome, achados);
    }
    expect(Object.fromEntries(comParametro)).toEqual({ 'planos/individual.html': ['plano=individual'], 'planos/familia.html': ['plano=familia'] });
    // O cabeçalho dessas páginas continua sem parâmetro. Antes do lançamento, o convite das mesmas páginas leva o mesmo plano (o teste do
    // convite, acima).
    for (const nome of ['planos/individual.html', 'planos/familia.html']) expect(texto(lancado, nome)).toContain(`<a class="menu-cta" href="${URL_CRIAR_CONTA}" rel="noopener noreferrer">Assine aqui</a>`);
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

  it('as ofertas do site lançado levam o período da cobrança (UnitPriceSpecification de 1 mês ou 1 ano) e o preço de plano-precos.ts; antes do lançamento, nenhuma oferta (análise de 26/11, lista "Depois")', () => {
    type Oferta = { '@type': string; name: string; price: string; priceCurrency: string; description: string; priceSpecification: { '@type': string; price: string; priceCurrency: string; referenceQuantity: { '@type': string; value: number; unitCode: string } } };
    const unidade = { mensal: 'MON', anual: 'ANN' } as const;
    // Antes do lançamento, nenhuma oferta em página nenhuma (a fita "Em breve": ninguém consegue assinar ainda).
    for (const nome of lidos(pre).filter((n) => n.endsWith('.html'))) for (const d of dadosEstruturados(texto(pre, nome))) expect(JSON.stringify(d), nome).not.toMatch(/"offers"|"Offer"|PriceSpecification/);
    // Lançado, as ofertas ficam só nas páginas com o SoftwareApplication (o início e o resumo dos planos).
    const comOfertas = lidos(lancado).filter((n) => n.endsWith('.html') && /"Offer"/.test(texto(lancado, n)));
    expect(comOfertas.sort()).toEqual(['index.html', 'planos.html']);
    for (const nome of comOfertas) {
      const app = dadosEstruturados(texto(lancado, nome)).find((d) => d['@type'] === 'SoftwareApplication')!;
      const ofertas = app.offers as Oferta[];
      // Uma oferta por plano e por período, na ordem do núcleo (BILLING_PERIODS), com o nome "Plano <nome> <período>".
      const esperado = (['individual', 'familiar'] as const).flatMap((plano) => BILLING_PERIODS.map((periodo) => ({ plano, periodo })));
      expect(ofertas.length, nome).toBe(esperado.length);
      ofertas.forEach((o, i) => {
        const { plano, periodo } = esperado[i]!;
        // O preço é o de plano-precos.ts, em centavos, e o mesmo que as páginas mostram (planPeriodPriceAmount).
        const preco = (PLAN_PERIOD_PRICE_CENTS[plano][periodo] / 100).toFixed(2);
        expect(planPeriodPriceAmount(plano, periodo).replace(/[^\d,]/g, '').replace(',', '.'), `${nome}: ${o.name}`).toBe(preco);
        expect(o, nome).toMatchObject({
          '@type': 'Offer',
          name: `Plano ${PLAN_NAME[plano]} ${periodo}`,
          price: preco,
          priceCurrency: 'BRL',
          priceSpecification: { '@type': 'UnitPriceSpecification', price: preco, priceCurrency: 'BRL', referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: unidade[periodo] } },
        });
        // Sem "R$" no texto: o preço só nos campos.
        expect(o.description, nome).not.toMatch(/R\$/);
      });
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
      // D-127: os dois planos no mensal e no anual, com o preço do núcleo; desde 27/11/2026, "Plano Individual mensal" e assim por diante.
      expect(ofertas.map((o) => [o['@type'], o.name, o.price, o.priceCurrency]), nome).toEqual([
        ['Offer', `Plano ${PLAN_NAME.individual} mensal`, planPriceAmount('individual').replace(/[^\d,]/g, '').replace(',', '.'), 'BRL'],
        ['Offer', `Plano ${PLAN_NAME.individual} anual`, '269.90', 'BRL'],
        ['Offer', `Plano ${PLAN_NAME.familiar} mensal`, planPriceAmount('familiar').replace(/[^\d,]/g, '').replace(',', '.'), 'BRL'],
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

  it('robots.txt e a política de segurança (_headers) não mudam com o estado; com indexar (D-131), o site entra na busca e as páginas com marcador pendente ficam de fora', () => {
    expect(texto(lancado, 'robots.txt')).toBe(texto(pre, 'robots.txt'));
    expect(texto(lancado, '_headers')).toBe(texto(pre, '_headers'));
    const robots = texto(pre, 'robots.txt');
    expect(robots).toContain('Allow: /');
    expect(robots).not.toContain('Disallow');
    expect(robots).toMatch(/^Sitemap: https:\/\/[a-z0-9.-]+\/sitemap\.xml$/m);
    const mapa = texto(pre, 'sitemap.xml');
    const comPendencia = [...pre.pendencias.entries()].filter(([, l]) => l.length > 0).map(([nome]) => nome);
    for (const nome of comPendencia) {
      expect(texto(pre, nome), nome).toContain('<meta name="robots" content="noindex">');
      expect(mapa.split('\n').some((l) => l.includes(`<loc>`) && new RegExp(`<loc>https://[^/<]+/${nome.replace(/(index)?\.html$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</loc>`).test(l)), nome).toBe(false);
    }
    for (const nome of ['index.html', 'planos.html', 'web.html', 'mei.html']) expect(texto(pre, nome), nome).not.toContain('content="noindex"');
    const fechado = gerarSite({ referencia: REFERENCIA, estado: { indexar: false } });
    if (fechado.pendencias.size > 0 && [...fechado.pendencias.values()].some((l) => l.length > 0)) expect(texto(fechado, 'robots.txt')).toContain('Disallow: /');
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
