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
 *   - lançado, nenhum texto de pré-lançamento sobra ("fase de testes", "em breve", "piloto", "Preços no lançamento", "abre no lançamento",
 *     a frase da assinatura fechada, "quem testa" e o link da tela de entrar);
 *   - antes do lançamento, nada do que só vale lançado aparece ("Testar 14 dias grátis", "Testar grátis", selos e links das lojas, link para
 *     criar conta ou para a tela inicial do app web, que convida a criar conta, D-064, "aberta para todas as pessoas" e oferta com preço nos
 *     dados estruturados);
 *   - o botão do menu, nas duas versões, leva aonde diz; os dados estruturados são JSON válido; `robots.txt` e `_headers` (a política de
 *     segurança) não mudam com o estado;
 *   - `lancado: true` é recusado enquanto a assinatura pelo app estiver fechada (`SUBSCRIBE_OPEN`), porque o site diria "Testar 14 dias
 *     grátis" ao lado de "A assinatura pelo app abre no lançamento". O site lançado deste teste usa `simularAssinaturaAberta`, que só o
 *     `--estado` aceita e que o `--final` recusa.
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
const config = require(join(ROOT, 'scripts', 'site', 'config.js')) as { URL_APP: string; URL_CRIAR_CONTA: string; URL_ENTRAR: string; URL_DEMO: string; ESTADO_DO_PRODUTO: Record<string, unknown> };
const { URL_APP, URL_CRIAR_CONTA, URL_ENTRAR, URL_DEMO } = config;

/** A data de referência dos posts (a do mais novo, a mesma do teste site.test.ts), para todas as matérias saírem nos dois estados. */
const REFERENCIA = '2026-11-12';
const APP_STORE = 'https://apps.apple.com/br/app/clarevo/id0000000000';
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
 * Os usos legítimos das palavras de pré-lançamento, que continuam depois do lançamento. Cada um diz o porquê; o trecho sai do texto antes
 * da conferência (ou o arquivo inteiro, com `trecho: null`). Uma exceção que não acha mais o trecho dela falha o teste: assim nenhuma
 * fica esquecida aqui depois que o texto mudar.
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
    arquivo: /^empresas\/index\.html$/,
    trecho: 'Em um piloto, combinamos o número de vagas e o prazo.',
    porque: 'O piloto com uma empresa (D-056, docs/legal/plano-de-trabalho-piloto.md) é um combinado comercial que continua existindo depois do lançamento.',
  },
  {
    arquivo: /^privacidade\.html$/,
    trecho: 'previsto para o lançamento',
    porque:
      'Texto jurídico de docs/legal (o Sentry "previsto para o lançamento"): só muda numa nova versão revisada pelo advogado (A16), fora do gerador; está na lista do dia do lançamento em docs/22_SITE.md, seção 19.1.',
  },
];

/** Texto de pré-lançamento: nunca no site lançado. */
const SO_ANTES: [string, RegExp][] = [
  ['fase de testes', /fase de testes/i],
  ['em breve', /\bem breve\b/i],
  ['piloto', /\bpiloto\b/i],
  ['Preços no lançamento', /Preços no lançamento/i],
  // O lançamento do produto ("abre no lançamento", "até o lançamento"). "Lançamento" também é um registro de dinheiro ("nenhum lançamento
  // muda", "o detalhe do lançamento"), que vale nos dois estados: por isso só estas formas.
  ['o lançamento do produto', /\b(?:no|até o|antes do|depois do|para o|ao) lançamento\b/i],
  ['a frase da assinatura fechada', new RegExp(escRe(ACCESS_TEXT.notOpenYet))],
  ['quem testa', /quem (?:já )?testa/i],
  ['link para a tela de entrar', new RegExp(escRe(URL_ENTRAR))],
];
/** O que só vale lançado: nunca antes do lançamento (D-064: nenhum convite a criar conta, nem a tela inicial do app web). */
const SO_DEPOIS: [string, RegExp][] = [
  [`Testar ${TRIAL_DAYS} dias grátis`, new RegExp(`Testar ${TRIAL_DAYS} dias grátis`)],
  ['Testar grátis', /Testar grátis/],
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

  it('lançado: nenhuma página tem texto de pré-lançamento (fora as exceções documentadas, todas ainda em uso)', () => {
    const usadas = new Map<number, number>();
    expect(varrer(lancado, SO_ANTES, usadas)).toEqual([]);
    for (const [i, e] of EXCECOES.entries()) expect(usadas.get(i) ?? 0, `exceção sem uso: ${e.arquivo} ${e.trecho ?? '(arquivo inteiro)'}`).toBeGreaterThan(0);
  });

  it('antes do lançamento: nenhuma página tem o que só vale lançado (criar conta, teste grátis como chamada, lojas, tela inicial do app web, oferta)', () => {
    expect(varrer(pre, SO_DEPOIS)).toEqual([]);
  });

  it('as regras não são vazias: o texto de pré-lançamento existe antes do lançamento, e o do site lançado existe nele', () => {
    const achadosPre = varrer(pre, SO_ANTES).join('\n');
    for (const rotulo of ['fase de testes', 'em breve', 'Preços no lançamento', 'o lançamento do produto', 'quem testa', 'link para a tela de entrar']) expect(achadosPre, rotulo).toContain(`: ${rotulo} (`);
    if (!SUBSCRIBE_OPEN) expect(achadosPre).toContain(': a frase da assinatura fechada (');
    const achadosLancado = varrer(lancado, SO_DEPOIS).join('\n');
    for (const [rotulo] of SO_DEPOIS) expect(achadosLancado, rotulo).toContain(`: ${rotulo} (`);
    // Sem o endereço do Google Play, nenhum selo nem link dele.
    expect(achadosLancado).not.toMatch(/Disponível no Google Play|play\.google\.com/);
  });

  it('o botão do menu leva aonde diz, em todas as páginas: "Entrar (quem testa)" à tela de entrar antes do lançamento e "Testar grátis" à de criar conta depois', () => {
    const botoes = (g: Gerado) => {
      const vistos = new Set<string>();
      let paginas = 0;
      for (const nome of lidos(g).filter((n) => n.endsWith('.html'))) {
        const h = texto(g, nome);
        const cta = [...h.matchAll(/<a class="menu-cta" href="([^"]+)" rel="noopener noreferrer">([^<]+)<\/a>/g)];
        if (!h.includes('class="menu-cta"')) continue;
        paginas++;
        expect(cta.length, nome).toBe(1);
        // O menu do celular repete o mesmo botão, com o mesmo destino.
        const movel = /<details class="menu-movel">[\s\S]*?<\/details>/.exec(h)?.[0] ?? '';
        expect(movel, nome).toContain(`<li><a href="${cta[0]![1]}" rel="noopener noreferrer">${cta[0]![2]}</a></li>`);
        vistos.add(`${cta[0]![2]} -> ${cta[0]![1]}`);
      }
      return { vistos: [...vistos], paginas };
    };
    const a = botoes(pre);
    const b = botoes(lancado);
    expect(a.paginas).toBeGreaterThanOrEqual(100);
    expect(b.paginas).toBe(a.paginas);
    expect(a.vistos).toEqual([`Entrar (quem testa) -> ${URL_ENTRAR}`]);
    expect(b.vistos).toEqual([`Testar grátis -> ${URL_CRIAR_CONTA}`]);
    expect(URL_ENTRAR).toBe(`${URL_APP}/entrar`);
    expect(URL_CRIAR_CONTA).toBe(`${URL_APP}/criar-conta`);
  });

  it('O app, as calculadoras e o kit de imprensa seguem o estado: a versão web, o app que se pode abrir e "Onde usar"', () => {
    const appPre = texto(pre, 'app/index.html');
    const appLancado = texto(lancado, 'app/index.html');
    expect(appPre).toContain(`Para quem já testa a Clarevo: <a href="${URL_ENTRAR}" rel="noopener noreferrer">Entrar na versão web</a>.`);
    expect(appLancado).toContain(`<a href="${URL_APP}" rel="noopener noreferrer">Abrir a versão web</a>.`);
    const calcPre = texto(pre, 'calculadoras/reserva.html');
    const calcLancado = texto(lancado, 'calculadoras/reserva.html');
    expect(calcPre).toContain(`ou use a <a href="${URL_DEMO}" rel="noopener noreferrer">demonstração</a> da Clarevo.`);
    expect(calcPre).toContain(`Você também pode usar a <a href="${URL_DEMO}" rel="noopener noreferrer">demonstração</a> da Clarevo.`);
    expect(calcLancado).toContain(`ou use a <a href="${URL_APP}" rel="noopener noreferrer">versão web</a> da Clarevo.`);
    expect(texto(pre, 'imprensa.html')).toContain('<li><strong>Onde usar:</strong> a Clarevo está em fase de testes. Para pessoas e famílias, o acesso abre no lançamento, na web, na App Store e no Google Play.</li>');
    expect(texto(lancado, 'imprensa.html')).toContain('<li><strong>Onde usar:</strong> na web e na App Store.</li>');
  });

  it('os planos: a frase da assinatura fechada só antes do lançamento (e só com SUBSCRIBE_OPEN fechado), nunca lançado', () => {
    for (const nome of ['index.html', 'planos.html', 'planos/individual.html', 'planos/familia.html']) {
      if (!SUBSCRIBE_OPEN) expect(texto(pre, nome), nome).toContain(ACCESS_TEXT.notOpenYet);
      expect(texto(lancado, nome), nome).not.toContain(ACCESS_TEXT.notOpenYet);
      expect(texto(pre, nome), nome).toContain('Preços no lançamento');
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
      expect(() => estadoDoProduto({ lancado: true })).toThrow(/SUBSCRIBE_OPEN = false em packages\/core\/src\/plano\.ts[\s\S]*mude "lancado" para true em scripts\/site\/config\.js/);
      expect(() => gerarSite({ referencia: REFERENCIA, estado: { lancado: true } })).toThrow(/assinatura pelo app ainda fechada/);
      expect(estadoDoProduto({ lancado: true, simularAssinaturaAberta: true })).toMatchObject({ lancado: true, assinaturaAberta: true, assinaturaSimulada: true });
      expect(lancado.problemasFinais.some((p) => /simula a assinatura aberta/.test(p))).toBe(true);
      expect(lancado.avisos.some((p) => /^o --final recusaria: o estado do produto simula a assinatura aberta/.test(p))).toBe(true);
    }
    expect(pre.problemasFinais.some((p) => /simula a assinatura/.test(p))).toBe(false);
  });
});
