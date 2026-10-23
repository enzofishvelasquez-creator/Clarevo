/// <reference types="node" />
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../src/contrast';
import { formatDateBR } from '../src/dates';
import { GUIDE_ENTRIES } from '../src/guide';
import { LEARN_SECTIONS, LEARN_UI_TEXT, SEASONAL_CALENDAR, publishedTopics, relatedTopics } from '../src/learn';

/**
 * Site público (D-064 e D-065, `docs/22_SITE.md`): `scripts/gerar-site.js` gera o site em `site/` a partir de `docs/legal/*.md`, do
 * catálogo de Aprender e do guia de uso do `packages/core`, do conteúdo próprio de `site-src/` e dos modelos de `scripts/site/`. O
 * teste confere o conversor de Markdown; que as páginas gravadas estão em dia; a redação (sem travessão nem a expressão proibida);
 * a ausência de recurso de fora; a estrutura (um `h1`, títulos sem pular nível, links internos); que cada tema publicado de Aprender
 * tem página com o texto do catálogo, a data de revisão e as fontes; a Ajuda e a busca; as Novidades e o feed; os dados
 * estruturados; as capturas; o contraste das cores (a regra de `src/contrast.ts`); a recusa de `--final` enquanto sobrar marcador;
 * a imagem de compartilhamento e o gráfico de recursos do Google Play.
 */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SITE = join(ROOT, 'site');
const SCRIPT = join(ROOT, 'scripts', 'gerar-site.js');
const require = createRequire(import.meta.url);

interface GerarOpcoes {
  legal?: string;
  dados?: Record<string, string | boolean>;
  arquivoDados?: string;
  referencia?: string;
  novidades?: string;
}
interface Gerado {
  arquivos: Map<string, string | Buffer>;
  avisos: string[];
  pendencias: Map<string, string[]>;
  problemasFinais: string[];
  posts: { arquivo: string; data: string; titulo: string; autoria: string; fontes: unknown[] }[];
}
const gerador = require(SCRIPT) as {
  MARCADORES: string[];
  HOSTS_DE_LINK_PERMITIDOS: string[];
  markdownParaHtml: (md: string, opcoes?: Record<string, unknown>) => string;
  titulosDoMarkdown: (md: string, opcoes?: Record<string, unknown>) => { nivel: number; texto: string; id: string }[];
  separarTitulo: (md: string) => { titulo: string | null; corpo: string };
  problemasDeTitulos: (html: string) => string[];
  pendenciasDoTexto: (texto: string, valores?: Record<string, string>) => string[];
  slug: (texto: string) => string;
  lerDados: (arquivo: string) => { dados: Record<string, string>; avisos: string[] };
  gerarSite: (opcoes?: GerarOpcoes) => Gerado;
  linksQuebrados: (arquivos: Map<string, string | Buffer>) => string[];
};
const conteudo = require(join(ROOT, 'scripts', 'site', 'conteudo.js')) as {
  lerCabecalho: (t: string) => { meta: Record<string, string | string[]>; corpo: string };
  lerPosts: (pasta: string, opcoes?: { referencia?: string | null }) => { posts: { arquivo: string; data: string }[]; problemas: string[] };
  dataExiste: (iso: string) => boolean;
  lerPerguntas: (arquivo: string) => { pergunta: string; tema: string; id: string; resposta: string }[];
};
const png = require(join(ROOT, 'scripts', 'site', 'png.js')) as {
  decodificar: (b: Buffer) => { largura: number; altura: number; rgb: Buffer };
  dimensoes: (b: Buffer) => { largura: number; altura: number; tipoCor: number };
  reduzir: (i: { largura: number; altura: number; rgb: Buffer }, l: number) => { largura: number; altura: number; rgb: Buffer };
  codificar: (i: { largura: number; altura: number; rgb: Buffer }, o?: { paleta?: boolean }) => Buffer;
};
const { markdownParaHtml, MARCADORES } = gerador;

/** O gerador é puro: o resultado com os dados do repositório é calculado uma vez e vale para todos os grupos de teste. */
let geradoDoRepositorio: Gerado | null = null;
const gerarSite = (opcoes?: GerarOpcoes): Gerado => {
  if (opcoes) return gerador.gerarSite(opcoes);
  geradoDoRepositorio ??= gerador.gerarSite();
  return geradoDoRepositorio;
};

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Os temas de Aprender que viram página: publicados, não legados, das seções organizar, juros e tempo. */
const TEMAS_DO_SITE = publishedTopics().filter((t) => !t.legacy && ['organizar', 'juros', 'tempo'].includes(t.section));
const TEMAS_DA_AJUDA = ['comecar', 'organizar', 'contas', 'familia', 'beneficio', 'privacidade', 'conta'];
const POSTS = [
  'novidades/2026-10-23-conheca-o-clarevo.html',
  'novidades/2026-10-23-13o-salario-quando-cai-e-como-se-organizar.html',
  'novidades/2026-10-23-como-a-empresa-oferece-o-clarevo-sem-ver-suas-financas.html',
];
const PAGINAS_BASE = [
  'index.html',
  'app/index.html',
  'empresas/index.html',
  'aprender/index.html',
  'aprender/agenda.html',
  'novidades/index.html',
  'novidades/como-escrevemos.html',
  'ajuda/index.html',
  ...TEMAS_DA_AJUDA.map((t) => `ajuda/${t}.html`),
  'seguranca.html',
  'sobre.html',
  'suporte.html',
  'privacidade.html',
  'termos.html',
  'excluir-conta.html',
  '404.html',
];
/** As dez calculadoras do app (D-066), na ordem do catálogo, e o índice delas. */
const CALCULADORAS = ['antes-de-financiar', 'parcelado-ou-a-vista', 'custo-por-ano', 'custo-da-divida', 'quitar-antes', 'multa-e-juros', 'plano-dividas', 'reserva', 'juntar-para-objetivo', 'dividir-contas'];
const PAGINAS_DE_CALCULADORAS = ['calculadoras/index.html', ...CALCULADORAS.map((c) => `calculadoras/${c}.html`)];
const PAGINAS = [...PAGINAS_BASE, 'imprensa.html', ...PAGINAS_DE_CALCULADORAS, ...TEMAS_DO_SITE.map((t) => `aprender/${t.slug}.html`), ...POSTS];
/** As páginas do menu principal (a página atual é marcada com aria-current). */
const NO_MENU = ['index.html', 'app/index.html', 'empresas/index.html', 'aprender/index.html', 'calculadoras/index.html', 'novidades/index.html', 'ajuda/index.html', 'seguranca.html'];

const VAZIOS = Object.fromEntries(MARCADORES.map((m) => [m, '']));
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
const PROIBIDO_TRAVESSAO = /[\u2013\u2014]/;
const PROIBIDO_EXPRESSAO = /faz\w*\s+sentido/i;

/** Texto de exemplo com um caso de cada elemento do conversor, marcadores e trechos que o escape precisa segurar. */
const EXEMPLO = `# Política de exemplo

> Vigência a partir de [DATA DE VIGÊNCIA].

O **Clarevo** é de [RAZÃO SOCIAL], CNPJ [CNPJ], em [ENDEREÇO]. Escreva para [E-MAIL DE PRIVACIDADE] ou veja *o suporte*, \`código\` e __negrito__.

## 1. Dados

### 1.1 O que guardamos

- E-mail e senha
- Nome
  - Só o primeiro nome
- Preferências

1. Primeiro
2. Segundo
3. Veja os [termos](termos-de-uso.md#quem-pode-usar) e a [exclusão](exclusao-de-conta.md)

| Dado | Para quê | Prazo |
|---|:-:|--:|
| E-mail | Entrar | Até a exclusão |
| Nota | Evitar repetição | [A DEFINIR: prazo] |

## 2. Contato

Fale com [a lei](https://www.planalto.gov.br/lei) ou com [o suporte](mailto:[E-MAIL DE SUPORTE]).

Texto com <script>alert(1)</script> & "aspas" e [javascript:alert(1)](javascript:alert(1)).

\`\`\`
bloco <b>cru</b>
\`\`\`

---

Texto final.
`;
const TERMOS = '# Termos de exemplo\n\n## 1. Quem pode usar\n\nPessoas com 18 anos ou mais.\n';
const EXCLUSAO = '# Excluir conta de exemplo\n\n## Como excluir\n\nNo app, abra Conta.\n';

function pastaDeExemplo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'clarevo-site-'));
  writeFileSync(join(dir, 'politica-de-privacidade.md'), EXEMPLO);
  writeFileSync(join(dir, 'termos-de-uso.md'), TERMOS.replace('## 1. Quem pode usar', '## Quem pode usar'));
  writeFileSync(join(dir, 'exclusao-de-conta.md'), EXCLUSAO);
  return dir;
}

const texto = (v: string | Buffer | undefined): string => (typeof v === 'string' ? v : v ? v.toString('utf8') : '');

/** Caminho de um arquivo do site visto de uma página: relativo, e a partir da raiz na 404. */
function visto(de: string, para: string): string {
  if (de === '404.html') return `/${para}`;
  return posix.relative(posix.dirname(de), para) || posix.basename(para);
}

/** O que o `--final` imprime como pendência: os marcadores por página e os problemas de texto. */
function razoesFinais(g: Gerado): string[] {
  return [...[...g.pendencias].flatMap(([p, l]) => l.map((m) => `${p}: ${m}`)), ...g.problemasFinais];
}

/** XML bem formado: declaração, etiquetas abertas e fechadas na ordem, atributos entre aspas e entidades válidas. */
function problemasDeXml(xml: string): string[] {
  const erros: string[] = [];
  if (!xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) erros.push('sem a declaração XML');
  const corpo = xml.replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const pilha: string[] = [];
  let ultimo = 0;
  const entreOk = (t: string) => !/[<>]/.test(t) && !/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(t);
  for (const m of corpo.matchAll(/<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>/g)) {
    if (!entreOk(corpo.slice(ultimo, m.index))) erros.push(`texto inválido antes de ${m[0].slice(0, 40)}`);
    ultimo = (m.index ?? 0) + m[0].length;
    if (m[1]) {
      const topo = pilha.pop();
      if (topo !== m[2]) erros.push(`fecha ${m[2]}, mas estava aberto ${topo}`);
    } else if (!m[4]) pilha.push(m[2]!);
  }
  if (!entreOk(corpo.slice(ultimo))) erros.push('texto inválido no fim');
  if (pilha.length) erros.push(`sem fechar: ${pilha.join(', ')}`);
  return erros;
}

const hostsPermitidos = (dominio: string): string[] => [...gerador.HOSTS_DE_LINK_PERMITIDOS, 'schema.org', ...(dominio ? [dominio] : [])];

/** As verificações que valem para qualquer conjunto de páginas geradas (as gravadas em `site/` e as do texto de exemplo). */
function verificarPaginas(arquivos: Map<string, string | Buffer>, dominio: string, paginas: string[] = PAGINAS_BASE, opcoes: { formularios?: string[] } = {}) {
  const hosts = hostsPermitidos(dominio);
  const prefixoDe = (nome: string) => visto(nome, 'estilo.css').replace('estilo.css', '');
  for (const nome of paginas) {
    const html = texto(arquivos.get(nome));
    const noAjuda = nome.startsWith('ajuda/');
    expect(html.length, nome).toBeGreaterThan(500);
    expect(html, nome).toMatch(/^<!doctype html>\n<html lang="pt-BR">/);
    expect(html, `${nome}: travessão`).not.toMatch(PROIBIDO_TRAVESSAO);
    expect(html, `${nome}: expressão proibida`).not.toMatch(PROIBIDO_EXPRESSAO);
    // Os códigos das decisões internas do projeto (D-011, D-053) não são conteúdo público: fontes do tipo `clarevo` saem como "Regra do próprio Clarevo".
    expect(html, `${nome}: código de decisão interna`).not.toMatch(/\bD-\d{3}\b/);
    // Sem cookies e sem nada que rastreie: os únicos scripts são os dados estruturados (que não executam), a busca da Ajuda e o módulo das
    // calculadoras (que só faz a conta no navegador, com o núcleo de js/nucleo/).
    const noCalc = /^calculadoras\/[a-z-]+\.html$/.test(nome) && nome !== 'calculadoras/index.html';
    for (const m of html.matchAll(/<script\b([^>]*)>/gi)) {
      const ld = /^\s*type="application\/ld\+json"\s*$/.test(m[1]!);
      const busca = noAjuda && /^\s*src="busca\.js"\s+defer\s*$/.test(m[1]!);
      const calculadora = noCalc && /^\s*type="module"\s+src="calculadora\.js"\s*$/.test(m[1]!);
      expect(ld || busca || calculadora, `${nome}: script não permitido: ${m[0]}`).toBe(true);
    }
    expect(html, `${nome}: manipulador de evento`).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html, `${nome}: atributo style (a política de segurança não permite)`).not.toMatch(/\sstyle\s*=/i);
    expect(html, `${nome}: iframe ou objeto`).not.toMatch(/<(iframe|object|embed|video|audio)\b/i);
    // Formulário só nas páginas que o interruptor liga (D-066), e sempre um POST para o próprio site.
    if (opcoes.formularios?.includes(nome)) {
      for (const m of html.matchAll(/<form\b[^>]*>/gi)) expect(m[0], `${nome}: formulário`).toMatch(/^<form class="formulario" method="post" action="\/api\/(contato|newsletter)">$/);
    } else expect(html, `${nome}: formulário`).not.toMatch(/<form\b/i);
    for (const m of html.matchAll(/<input\b[^>]*>/gi)) {
      const campoDeFormulario = opcoes.formularios?.includes(nome) && /type="(text|email|checkbox)"/.test(m[0]);
      expect(campoDeFormulario || (noAjuda && /type="search"/.test(m[0])), `${nome}: campo que não é a busca da Ajuda nem de um formulário ligado: ${m[0]}`).toBe(true);
    }
    // Recursos (src, link, preload) só locais; links de texto só para o app, as fontes citadas no catálogo, o domínio da empresa e as páginas oficiais.
    for (const m of html.matchAll(/<(?:img|link|source|script)\b[^>]*\s(?:src|href)="(https?:)?\/\/[^"]*"/gi)) {
      if (!/rel="canonical"/.test(m[0])) expect.fail(`${nome}: recurso de fora em ${m[0]}`);
    }
    for (const m of html.matchAll(/https?:\/\/([^\s"'<>/\\]+)/g)) expect(hosts, `${nome}: ${m[0]}`).toContain(m[1]);
    for (const m of html.matchAll(/<a\b[^>]*href="https?:[^"]*"[^>]*>/g)) expect(m[0], `${nome}: link externo sem noopener`).toContain('noopener');
    // Estrutura.
    expect(html.match(/<h1[\s>]/g)?.length, `${nome}: h1`).toBe(1);
    expect(gerador.problemasDeTitulos(html), nome).toEqual([]);
    expect(html.match(/<main\b/g)?.length, `${nome}: main`).toBe(1);
    expect(html, `${nome}: link para pular`).toContain('<a class="pular" href="#conteudo">Pular para o conteúdo</a>');
    expect(html, `${nome}: viewport`).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    expect(html, `${nome}: cookie ou analytics`).not.toMatch(/gtag|pixel|google-analytics/i);
    const titulo = /<title>([^<]+)<\/title>/.exec(html)?.[1] ?? '';
    expect(titulo.length, `${nome}: título`).toBeGreaterThan(4);
    expect(titulo.length, `${nome}: título longo demais (${titulo})`).toBeLessThanOrEqual(80);
    const descricao = /<meta name="description" content="([^"]+)">/.exec(html)?.[1] ?? '';
    expect(descricao.length, `${nome}: descrição`).toBeGreaterThanOrEqual(40);
    expect(descricao.length, `${nome}: descrição longa demais`).toBeLessThanOrEqual(200);
    expect(html, `${nome}: Open Graph`).toContain('<meta property="og:title"');
    expect(html, `${nome}: favicon`).toContain(`<link rel="icon" href="${visto(nome, 'favicon.svg')}" type="image/svg+xml">`);
    expect(html, `${nome}: estilo`).toContain(`<link rel="stylesheet" href="${visto(nome, 'estilo.css')}">`);
    expect(html, `${nome}: logotipo oficial no cabeçalho`).toMatch(/<header class="topo">[\s\S]*<img src="[^"]*marca\/clarevo-logotipo-reverso\.svg" alt="[^"]+"/);
    // Imagens: texto alternativo (só o logotipo decorativo do rodapé é vazio, dentro de um link com nome) e tamanho declarado.
    for (const img of html.matchAll(/<img\b[^>]*>/g)) {
      expect(img[0], `${nome}: imagem sem alt`).toMatch(/\salt="/);
      expect(img[0], `${nome}: imagem sem tamanho`).toMatch(/\swidth="\d+"/);
      expect(img[0], `${nome}: imagem sem altura`).toMatch(/\sheight="\d+"/);
      if (!/rodape-marca/.test(html.slice(Math.max(0, (img.index ?? 0) - 200), img.index))) expect(img[0], `${nome}: alt vazio`).toMatch(/\salt="[^"]+"/);
    }
    // Menu: no celular é um <details>, que funciona sem JavaScript; a página atual é marcada.
    expect(html, `${nome}: menu do celular`).toContain('<details class="menu-movel"><summary>Menu</summary>');
    const cabecalho = /<header class="topo">([\s\S]*?)<\/header>/.exec(html)?.[1] ?? '';
    if (NO_MENU.includes(nome)) expect(cabecalho.match(/aria-current="page"/g)?.length, `${nome}: aria-current`).toBe(2);
    else if (/^(aprender|calculadoras|novidades|ajuda)\//.test(nome)) expect(cabecalho.match(/class="secao-atual"/g)?.length, `${nome}: seção atual`).toBe(2);
    // Rodapé em todas: todas as seções, as páginas legais e "[RAZÃO SOCIAL] · CNPJ [CNPJ]" (com os valores, quando houver).
    const rodape = /<footer class="rodape">([\s\S]*?)<\/footer>/.exec(html)?.[1] ?? '';
    for (const p of ['index.html', 'app/index.html', 'empresas/index.html', 'aprender/index.html', 'aprender/agenda.html', 'calculadoras/index.html', 'novidades/index.html', 'novidades/como-escrevemos.html', 'ajuda/index.html', 'seguranca.html', 'sobre.html', 'imprensa.html', 'suporte.html', 'privacidade.html', 'termos.html', 'excluir-conta.html']) {
      expect(rodape, `${nome}: rodapé sem ${p}`).toContain(`<a href="${visto(nome, p)}">`);
    }
    expect(rodape, `${nome}: rodapé`).toMatch(/·\s*CNPJ\s/);
    expect(rodape, `${nome}: rodapé`).toMatch(/RAZÃO SOCIAL|Empresa Exemplo/);
    if (nome === '404.html') expect(html, 'a 404 usa caminhos a partir da raiz').toContain('href="/estilo.css"');
    expect(prefixoDe(nome)).toBe(nome === '404.html' ? '/' : nome.includes('/') ? '../'.repeat(nome.split('/').length - 1) : '');
    // Dados estruturados: JSON válido.
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) expect(() => JSON.parse(m[1]!), `${nome}: JSON-LD`).not.toThrow();
  }
  // Todo link interno (href e src, com âncora) existe.
  expect(gerador.linksQuebrados(arquivos)).toEqual([]);
}

describe('site público: conversor de Markdown (scripts/gerar-site.js)', () => {
  it('títulos de # a #### viram h1 a h4 com âncora estável, sem acento e sem repetir', () => {
    const html = markdownParaHtml('# Um\n\n## Seção 1: Ação\n\n### Seção 1: Ação\n\n#### Fundo\n');
    expect(html).toContain('<h1 id="um">Um</h1>');
    expect(html).toContain('<h2 id="secao-1-acao">Seção 1: Ação</h2>');
    expect(html).toContain('<h3 id="secao-1-acao-2">Seção 1: Ação</h3>');
    expect(html).toContain('<h4 id="fundo">Fundo</h4>');
    // A âncora não muda quando o marcador do título é preenchido, e não leva o marcador.
    expect(markdownParaHtml('## Contato [E-MAIL DE SUPORTE]')).toContain('id="contato"');
    expect(markdownParaHtml('## Contato [E-MAIL DE SUPORTE]', { valores: PREENCHIDOS })).toContain('id="contato"');
    expect(gerador.titulosDoMarkdown('# A\n## B').map((t) => [t.nivel, t.id])).toEqual([[1, 'a'], [2, 'b']]);
    expect(markdownParaHtml('# A\n## B', { prefixoId: 'doc-' })).toContain('id="doc-b"');
    expect(markdownParaHtml('# A\n\n# B', { rebaixarH1: true })).toBe('<h2 id="a">A</h2>\n<h2 id="b">B</h2>');
  });

  it('parágrafos juntam as linhas seguidas e respeitam a quebra de linha forçada', () => {
    expect(markdownParaHtml('Uma linha\noutra linha\n\nSegundo')).toBe('<p>Uma linha outra linha</p>\n<p>Segundo</p>');
    expect(markdownParaHtml('Quebra  \nforçada')).toBe('<p>Quebra<br>forçada</p>');
  });

  it('negrito, itálico, código e links em linha', () => {
    expect(markdownParaHtml('**negrito** e __negrito__')).toBe('<p><strong>negrito</strong> e <strong>negrito</strong></p>');
    expect(markdownParaHtml('*itálico* e _itálico_')).toBe('<p><em>itálico</em> e <em>itálico</em></p>');
    expect(markdownParaHtml('use `a < b` e **`código` forte**')).toBe('<p>use <code>a &lt; b</code> e <strong><code>código</code> forte</strong></p>');
    // Sublinhado no meio de uma palavra ou de um endereço não vira itálico.
    expect(markdownParaHtml('o_nome_da_coisa')).toBe('<p>o_nome_da_coisa</p>');
    expect(markdownParaHtml('[veja](https://clarevo.pages.dev/a_b_c)')).toBe('<p><a href="https://clarevo.pages.dev/a_b_c" rel="noopener noreferrer">veja</a></p>');
    expect(markdownParaHtml('[interno](termos.html#x) e [e-mail](mailto:a@b.test) e <https://clarevo.pages.dev>')).toBe(
      '<p><a href="termos.html#x">interno</a> e <a href="mailto:a@b.test">e-mail</a> e <a href="https://clarevo.pages.dev" rel="noopener noreferrer">https://clarevo.pages.dev</a></p>',
    );
  });

  it('listas com marcador, numeradas e aninhadas; "2026. Texto" não é lista', () => {
    expect(markdownParaHtml('- a\n- b\n  - b1\n- c')).toBe('<ul><li>a</li><li>b<ul><li>b1</li></ul></li><li>c</li></ul>');
    expect(markdownParaHtml('1. um\n2. dois\n3. três')).toBe('<ol><li>um</li><li>dois</li><li>três</li></ol>');
    expect(markdownParaHtml('3. três\n4. quatro')).toBe('<ol start="3"><li>três</li><li>quatro</li></ol>');
    expect(markdownParaHtml('- a\n\n- b')).toBe('<ul><li>a</li><li>b</li></ul>');
    expect(markdownParaHtml('texto\n2026. continua o parágrafo')).toBe('<p>texto 2026. continua o parágrafo</p>');
    expect(markdownParaHtml('- item\n  continua no mesmo item')).toBe('<ul><li>item continua no mesmo item</li></ul>');
  });

  it('tabelas simples, com alinhamento, rótulo por célula (para telas estreitas) e barra escapada', () => {
    const html = markdownParaHtml('| Dado | Prazo |\n|---|--:|\n| E-mail | 5 \\| 6 |\n| **Nota** | `x` |');
    expect(html).toContain('<div class="tabela"><table><thead><tr><th scope="col">Dado</th><th scope="col" class="alinha-d">Prazo</th></tr></thead>');
    expect(html).toContain('<td data-rotulo="Dado">E-mail</td><td data-rotulo="Prazo" class="alinha-d">5 | 6</td>');
    expect(html).toContain('<td data-rotulo="Dado"><strong>Nota</strong></td>');
    // Uma barra no meio do texto, sem linha de separação, não é tabela.
    expect(markdownParaHtml('a | b')).toBe('<p>a | b</p>');
  });

  it('citação, bloco de código e linha horizontal', () => {
    expect(markdownParaHtml('> Aviso **importante**\n> segunda linha')).toBe('<blockquote><p>Aviso <strong>importante</strong> segunda linha</p></blockquote>');
    expect(markdownParaHtml('```\n<b>cru</b> **sem negrito**\n```')).toBe('<pre><code>&lt;b&gt;cru&lt;/b&gt; **sem negrito**</code></pre>');
    expect(markdownParaHtml('antes\n\n---\n\ndepois')).toBe('<p>antes</p>\n<hr>\n<p>depois</p>');
  });

  it('escapa HTML do texto e nunca deixa passar script, evento nem endereço javascript:', () => {
    const html = markdownParaHtml('<script>alert(1)</script> & "aspas" e <img src=x onerror=alert(1)>\n\n[x](javascript:alert(1))\n\n![figura](https://fora.test/a.png)');
    expect(html).not.toMatch(/<script|<img/i);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;aspas&quot;');
    expect(html).not.toContain('href="javascript');
    // Imagem de Markdown vira só o texto alternativo: o site não carrega nada de fora.
    expect(html).toContain('<p>figura</p>');
    expect(markdownParaHtml('[a"b](https://x.test/?q="1"&r=2)')).toContain('href="https://x.test/?q=&quot;1&quot;&amp;r=2"');
  });

  it('marcadores: sem valor ficam visíveis e destacados; com valor são trocados (e-mail vira link); [A DEFINIR] sempre destacado', () => {
    for (const m of MARCADORES) expect(markdownParaHtml(`Veja [${m}] aqui.`)).toBe(`<p>Veja <mark class="pendente">[${m}]</mark> aqui.</p>`);
    expect(markdownParaHtml('Prazo: [A DEFINIR: prazo de guarda]')).toBe('<p>Prazo: <mark class="pendente">[A DEFINIR: prazo de guarda]</mark></p>');
    expect(markdownParaHtml('[A DEFINIR: x]', { valores: PREENCHIDOS })).toContain('class="pendente"');
    expect(markdownParaHtml('Valor [RAZÃO SOCIAL] e [CNPJ]', { valores: PREENCHIDOS })).toBe('<p>Valor Empresa Exemplo Ltda e 00.000.000/0001-00</p>');
    expect(markdownParaHtml('Escreva para [E-MAIL DE SUPORTE].', { valores: PREENCHIDOS })).toBe('<p>Escreva para <a href="mailto:suporte@exemplo.test">suporte@exemplo.test</a>.</p>');
    expect(markdownParaHtml('[fale](mailto:[E-MAIL DE SUPORTE])', { valores: PREENCHIDOS })).toBe('<p><a href="mailto:suporte@exemplo.test">fale</a></p>');
    // O valor também é escapado, e valor só de espaços conta como vazio.
    expect(markdownParaHtml('[RAZÃO SOCIAL]', { valores: { 'RAZÃO SOCIAL': 'A & B <Ltda>' } })).toBe('<p>A &amp; B &lt;Ltda&gt;</p>');
    expect(markdownParaHtml('[CNPJ]', { valores: { CNPJ: '   ' } })).toContain('class="pendente"');
    // Qualquer outro marcador em maiúsculas entre colchetes também aparece como pendência; texto de link com colchetes, não.
    expect(markdownParaHtml('[NOME DO ENCARREGADO]')).toContain('class="pendente"');
    expect(markdownParaHtml('[LGPD](https://www.planalto.gov.br/lei)')).not.toContain('pendente');
  });

  it('pendenciasDoTexto lista o que falta: valores vazios, [A DEFINIR] e marcadores desconhecidos', () => {
    expect(gerador.pendenciasDoTexto('[CNPJ] e [CNPJ] e [RAZÃO SOCIAL] e [A DEFINIR: x] e [NOME DO ENCARREGADO]', { CNPJ: '1', 'RAZÃO SOCIAL': '' })).toEqual(['[RAZÃO SOCIAL]', '[A DEFINIR: x]', '[NOME DO ENCARREGADO]']);
    expect(gerador.pendenciasDoTexto('Sem marcador, [link](x) e [1].', PREENCHIDOS)).toEqual([]);
    expect(gerador.pendenciasDoTexto(MARCADORES.map((m) => `[${m}]`).join(' '), PREENCHIDOS)).toEqual([]);
  });

  it('links entre os textos jurídicos apontam para as páginas do site, e a âncora ganha o prefixo quando vários documentos dividem uma página', () => {
    const mapa = { 'termos-de-uso.md': 'termos.html' };
    expect(markdownParaHtml('[t](termos-de-uso.md#quem) [t](./termos-de-uso.md) [o](outro.md)', { mapaLinks: mapa })).toBe('<p><a href="termos.html#quem">t</a> <a href="termos.html">t</a> <a href="outro.md">o</a></p>');
    expect(markdownParaHtml('[t](#secao)', { prefixoId: 'doc-' })).toBe('<p><a href="#doc-secao">t</a></p>');
    expect(markdownParaHtml('[t](https://x.test/termos-de-uso.md)', { mapaLinks: mapa })).toContain('href="https://x.test/termos-de-uso.md"');
  });

  it('separarTitulo tira o primeiro "# Título" e o resto vira o corpo', () => {
    expect(gerador.separarTitulo('# Título **x**\n\ntexto\n\n## Dois')).toEqual({ titulo: 'Título **x**', corpo: '\ntexto\n\n## Dois' });
    expect(gerador.separarTitulo('sem título\n\n## Dois').titulo).toBeNull();
    expect(gerador.separarTitulo('```\n# dentro do código\n```\n\n# Fora').titulo).toBe('Fora');
  });

  it('problemasDeTitulos aponta h1 ausente ou repetido e título que pula de nível', () => {
    expect(gerador.problemasDeTitulos('<h1>a</h1><h2>b</h2><h3>c</h3><h2>d</h2>')).toEqual([]);
    expect(gerador.problemasDeTitulos('<h1>a</h1><h3>c</h3>')).toHaveLength(1);
    expect(gerador.problemasDeTitulos('<h2>a</h2>').length).toBeGreaterThan(0);
    expect(gerador.problemasDeTitulos('<h1>a</h1><h1>b</h1>')).toHaveLength(1);
  });

  it('o texto de exemplo vira HTML completo, sem nada de fora e sem sobras de Markdown', () => {
    const html = markdownParaHtml(EXEMPLO, { rebaixarH1: true, mapaLinks: { 'termos-de-uso.md': 'termos.html', 'exclusao-de-conta.md': 'excluir-conta.html' } });
    expect(html).not.toMatch(/<script/);
    expect(html).not.toMatch(/\*\*|__|```/);
    expect(html).toContain('<blockquote><p>Vigência a partir de <mark class="pendente">[DATA DE VIGÊNCIA]</mark>.</p></blockquote>');
    expect(html).toContain('<td data-rotulo="Para quê" class="alinha-c">Entrar</td>');
    expect(html).toContain('<td data-rotulo="Prazo" class="alinha-d"><mark class="pendente">[A DEFINIR: prazo]</mark></td>');
    expect(html).toContain('<a href="termos.html#quem-pode-usar">termos</a>');
    expect(html).toContain('<hr>\n<p>Texto final.</p>');
  });
});


describe('site público: conversor de Markdown, novidades', () => {
  it('links sem endereço completo são caminhos a partir da raiz do site e ficam relativos à página', () => {
    expect(markdownParaHtml('[o app](app/index.html) e [a política](privacidade.html#x)', { paginaAtual: 'novidades/post.html' })).toBe(
      '<p><a href="../app/index.html">o app</a> e <a href="../privacidade.html#x">a política</a></p>',
    );
    expect(markdownParaHtml('[o app](app/index.html)', { paginaAtual: 'index.html' })).toBe('<p><a href="app/index.html">o app</a></p>');
    expect(markdownParaHtml('[fora](https://www.gov.br/x) [e-mail](mailto:a@b.test) [âncora](#x)', { paginaAtual: 'a/b.html' })).toContain('href="https://www.gov.br/x"');
  });

  it('o marcador [E-MAIL DE CONTATO] é um marcador de dado, com valor ou destacado', () => {
    expect(MARCADORES).toContain('E-MAIL DE CONTATO');
    expect(markdownParaHtml('Escreva para [E-MAIL DE CONTATO].')).toBe('<p>Escreva para <mark class="pendente">[E-MAIL DE CONTATO]</mark>.</p>');
    expect(markdownParaHtml('Escreva para [E-MAIL DE CONTATO].', { valores: PREENCHIDOS })).toBe('<p>Escreva para <a href="mailto:contato@exemplo.test">contato@exemplo.test</a>.</p>');
  });

  it('o cabeçalho de um Markdown entende texto, lista e fontes de três tipos, e recusa o que não entende', () => {
    const r = conteudo.lerCabecalho('---\ntitulo: Um título: com dois pontos\ndata: 2026-10-23\nfontes:\n  - tema: decimo-terceiro\n  - Rótulo | https://www.gov.br/x\n  - Só texto\n---\nCorpo\n');
    expect(r.meta.titulo).toBe('Um título: com dois pontos');
    expect(r.meta.fontes).toEqual(['tema: decimo-terceiro', 'Rótulo | https://www.gov.br/x', 'Só texto']);
    expect(r.corpo).toBe('Corpo\n');
    expect(conteudo.lerCabecalho('sem cabeçalho').meta).toEqual({});
    expect(() => conteudo.lerCabecalho('---\nlinha solta\n---\n')).toThrow(/não entendi/);
    expect(() => conteudo.lerCabecalho('---\ntitulo: x\n')).toThrow(/fecha/);
  });

  it('um post sem fontes, sem resumo, com data diferente da do nome do arquivo ou com nome fora do padrão é recusado com a lista do que falta', () => {
    const dir = mkdtempSync(join(tmpdir(), 'clarevo-posts-'));
    try {
      writeFileSync(join(dir, '2026-10-23-ok.md'), '---\ntitulo: Ok\ndata: 2026-10-23\nresumo: Resumo\nautoria: Equipe Clarevo\nfontes:\n  - Fonte\n---\nTexto\n');
      writeFileSync(join(dir, '2026-10-22-sem-fontes.md'), '---\ntitulo: Sem\ndata: 2026-10-22\nresumo: Resumo\nautoria: Equipe Clarevo\n---\nTexto\n');
      writeFileSync(join(dir, '2026-10-21-data-errada.md'), '---\ntitulo: Errada\ndata: 2026-10-20\nresumo: Resumo\nautoria: Equipe Clarevo\nfontes:\n  - Fonte\n---\nTexto\n');
      writeFileSync(join(dir, 'sem-data.md'), 'ignorado');
      writeFileSync(join(dir, 'notas.txt'), 'não é post');
      const r = conteudo.lerPosts(dir);
      expect(r.posts.map((p) => p.arquivo)).toEqual(['novidades/2026-10-23-ok.html', 'novidades/2026-10-22-sem-fontes.html', 'novidades/2026-10-21-data-errada.html']);
      expect(r.problemas.some((p) => p.includes('2026-10-22-sem-fontes.md') && p.includes('fontes'))).toBe(true);
      expect(r.problemas.some((p) => p.includes('2026-10-21-data-errada.md') && p.includes('não é a do nome do arquivo'))).toBe(true);
      expect(r.problemas.some((p) => p.includes('2026-10-23-ok.md'))).toBe(false);
      // Um .md com nome fora do padrão não some em silêncio; outro tipo de arquivo não é post.
      expect(r.problemas.some((p) => p.includes('sem-data.md') && p.includes('AAAA-MM-DD-slug.md'))).toBe(true);
      expect(r.problemas.some((p) => p.includes('notas.txt'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('uma data que não existe no calendário e uma data depois da referência explícita são problemas; até a referência, não', () => {
    expect(['2026-10-23', '2024-02-29'].every((d) => conteudo.dataExiste(d))).toBe(true);
    expect(['2026-02-30', '2026-13-01', '2026-10-32', '2025-02-29', '26-10-23', '', 'ontem'].some((d) => conteudo.dataExiste(d))).toBe(false);
    const dir = mkdtempSync(join(tmpdir(), 'clarevo-posts-data-'));
    try {
      const post = (data: string) => `---\ntitulo: T\ndata: ${data}\nresumo: R\nautoria: Equipe Clarevo\nfontes:\n  - Fonte\n---\nTexto\n`;
      writeFileSync(join(dir, '2026-02-30-impossivel.md'), post('2026-02-30'));
      writeFileSync(join(dir, '2026-10-24-amanha.md'), post('2026-10-24'));
      writeFileSync(join(dir, '2026-10-23-hoje.md'), post('2026-10-23'));
      writeFileSync(join(dir, '2026-10-22-cabecalho-torto.md'), post('22/10/2026'));
      const r = conteudo.lerPosts(dir, { referencia: '2026-10-23' });
      const doArquivo = (nome: string) => r.problemas.filter((p) => p.includes(nome));
      expect(doArquivo('2026-02-30-impossivel.md').some((p) => p.includes('não existe no calendário'))).toBe(true);
      expect(doArquivo('2026-10-24-amanha.md').some((p) => p.includes('depois da data de referência (2026-10-23)'))).toBe(true);
      expect(doArquivo('2026-10-23-hoje.md')).toEqual([]);
      expect(doArquivo('2026-10-22-cabecalho-torto.md').some((p) => p.includes('não é uma data válida'))).toBe(true);
      // Sem referência, só a validade do calendário conta; com a referência de amanhã, o post de amanhã passa.
      expect(conteudo.lerPosts(dir).problemas.some((p) => p.includes('depois da data de referência'))).toBe(false);
      expect(conteudo.lerPosts(dir, { referencia: '2026-10-24' }).problemas.some((p) => p.includes('2026-10-24-amanha.md'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('site público: as páginas geradas', () => {
  const gerado = gerarSite();
  const valores = JSON.parse(readFileSync(join(SITE, 'dados-da-empresa.json'), 'utf8')) as Record<string, string>;
  const dominio = (valores['DOMÍNIO'] ?? '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const html = (nome: string) => texto(gerado.arquivos.get(nome));

  it('site/dados-da-empresa.json tem um campo para cada marcador, só com texto', () => {
    for (const m of MARCADORES) expect(typeof valores[m], m).toBe('string');
    // Além dos marcadores, só os dois interruptores dos formulários (D-066), booleanos e desligados no repositório.
    const extras = Object.keys(valores).filter((k) => !k.startsWith('_') && !MARCADORES.includes(k));
    expect(extras).toEqual(['formulario_contato', 'newsletter']);
    expect((valores as unknown as Record<string, unknown>).formulario_contato).toBe(false);
    expect((valores as unknown as Record<string, unknown>).newsletter).toBe(false);
  });

  it('o catálogo que o gerador lê (TypeScript do core, sem pacote novo) é o mesmo que o teste importa', () => {
    const c = require(join(ROOT, 'scripts', 'site', 'catalogo.js')).catalogo();
    expect(c.publicados.length).toBe(publishedTopics().filter((t) => !t.legacy).length);
    expect(JSON.stringify(c.publicados)).toBe(JSON.stringify(publishedTopics().filter((t) => !t.legacy)));
    expect(c.GUIA.length).toBe(GUIDE_ENTRIES.length);
    expect(c.CALENDARIO.length).toBe(12);
  });

  it('todas as páginas existem: as do mapa do site, um tema por página de Aprender e os três posts iniciais', () => {
    for (const nome of PAGINAS) expect(gerado.arquivos.has(nome), nome).toBe(true);
    expect(PAGINAS.filter((n) => n.endsWith('.html')).length).toBeGreaterThanOrEqual(50);
    // O feed RSS só existe com domínio (endereços completos); sem ele não há feed nem link para ele.
    expect(gerado.arquivos.has('novidades/feed.xml'), 'feed.xml só com domínio').toBe(dominio !== '');
    for (const extra of ['estilo.css', '_headers', 'robots.txt', 'ajuda/indice.json', 'ajuda/busca.js', 'favicon.svg', 'og/clarevo.png', 'marca/clarevo-logotipo-reverso.svg', 'calculadoras/calculadora.js', 'js/nucleo/calculators/catalog.js', '_worker.js', '_routes.json', 'imprensa/clarevo-logotipo.svg', 'imprensa/clarevo-logotipo.png']) expect(gerado.arquivos.has(extra), extra).toBe(true);
    const htmls = [...gerado.arquivos.keys()].filter((k) => k.endsWith('.html'));
    expect(htmls.filter((n) => !PAGINAS.includes(n))).toEqual([]);
  });

  it('as páginas e os arquivos gravados em site/ estão em dia com o gerador e o conteúdo (rode: node scripts/gerar-site.js)', () => {
    const desatualizados: string[] = [];
    for (const [nome, esperado] of gerado.arquivos) {
      const arquivo = join(SITE, nome);
      if (!existsSync(arquivo)) {
        desatualizados.push(`${nome} (não existe)`);
        continue;
      }
      const atual = readFileSync(arquivo);
      const certo = typeof esperado === 'string' ? Buffer.from(esperado, 'utf8') : esperado;
      if (atual.equals(certo)) continue;
      // O zlib de cada versão do Node pode gerar bytes diferentes para o mesmo PNG: o que vale são os pixels.
      if (nome.endsWith('.png')) {
        const a = png.decodificar(atual);
        const b = png.decodificar(certo);
        if (a.largura === b.largura && a.altura === b.altura && a.rgb.equals(b.rgb)) continue;
      }
      desatualizados.push(nome);
    }
    expect(desatualizados, 'rode "node scripts/gerar-site.js" e confira as mudanças').toEqual([]);
  });

  it('site/ não tem arquivo que o gerador não conhece (fora o JSON da empresa)', () => {
    const achados: string[] = [];
    const visitar = (dir: string, prefixo: string) => {
      for (const nome of readdirSync(dir)) {
        const rel = prefixo + nome;
        if (statSync(join(dir, nome)).isDirectory()) visitar(join(dir, nome), `${rel}/`);
        else achados.push(rel);
      }
    };
    visitar(SITE, '');
    expect(achados.filter((a) => a !== 'dados-da-empresa.json' && !gerado.arquivos.has(a))).toEqual([]);
  });

  it('cada página legal vem do Markdown quando ele existe e, senão, sai como espaço reservado com [A DEFINIR]', () => {
    const origem: Record<string, string> = { 'privacidade.html': 'politica-de-privacidade.md', 'termos.html': 'termos-de-uso.md', 'excluir-conta.html': 'exclusao-de-conta.md' };
    for (const [pagina, md] of Object.entries(origem)) {
      if (existsSync(join(ROOT, 'docs', 'legal', md))) {
        expect(html(pagina), pagina).not.toContain('texto desta página, que vem de docs/legal');
        const titulo = gerador.separarTitulo(readFileSync(join(ROOT, 'docs', 'legal', md), 'utf8')).titulo;
        expect(titulo, `${md} precisa de um título "# ..."`).not.toBeNull();
      } else {
        expect(html(pagina), pagina).toContain('[A DEFINIR: texto desta página');
        expect(gerado.avisos.join('\n')).toContain(`docs/legal/${md} ainda não existe`);
      }
    }
  });

  it('nenhuma página tem travessão, a expressão proibida, script além do permitido, atributo de evento ou endereço de fora além do permitido; um h1, títulos sem pular nível, rodapé e links internos', () => {
    verificarPaginas(gerado.arquivos, dominio, PAGINAS);
  });

  it('com os formulários ligados (D-066), todas as páginas, inclusive as de resposta, passam nas mesmas verificações e só as três páginas com formulário têm <form>', () => {
    const g = gerarSite({ dados: { ...PREENCHIDOS, formulario_contato: true, newsletter: true }, referencia: '2026-10-23' });
    const respostas = ['contato-enviado.html', 'contato-erro.html', 'novidades/receber.html', 'novidades/receber-enviado.html', 'novidades/receber-confirmado.html', 'novidades/receber-erro.html'];
    for (const nome of respostas) expect(g.arquivos.has(nome), nome).toBe(true);
    verificarPaginas(g.arquivos, 'exemplo.test', [...PAGINAS, ...respostas], { formularios: ['empresas/index.html', 'novidades/index.html', 'novidades/receber.html'] });
    // As páginas de resposta não são indexadas nem entram no sitemap; a página da inscrição, sim.
    const sitemap = texto(g.arquivos.get('sitemap.xml'));
    for (const nome of ['contato-enviado', 'contato-erro', 'novidades/receber-enviado', 'novidades/receber-confirmado', 'novidades/receber-erro']) {
      expect(sitemap, nome).not.toContain(`/${nome}<`);
      expect(texto(g.arquivos.get(`${nome}.html`)), nome).toContain('<meta name="robots" content="noindex">');
    }
    expect(sitemap).toContain('<loc>https://exemplo.test/novidades/receber</loc>');
    expect(sitemap).not.toContain('404');
    // Os links entre as páginas e para o worker existem.
    expect(gerador.linksQuebrados(g.arquivos)).toEqual([]);
  });

  it('todo texto gerado (páginas, feed, índice da busca e arquivos de apoio) está livre de travessão e da expressão proibida', () => {
    for (const [nome, conteudoDoArquivo] of gerado.arquivos) {
      if (!/\.(html|xml|json|js|css|txt)$/.test(nome) || nome === 'dados-da-empresa.json') continue;
      const t = texto(conteudoDoArquivo);
      expect(t, `${nome}: travessão`).not.toMatch(PROIBIDO_TRAVESSAO);
      expect(t, `${nome}: expressão proibida`).not.toMatch(PROIBIDO_EXPRESSAO);
    }
    for (const f of readdirSync(join(ROOT, 'site-src', 'novidades'))) {
      const t = readFileSync(join(ROOT, 'site-src', 'novidades', f), 'utf8');
      expect(t, f).not.toMatch(PROIBIDO_TRAVESSAO);
      expect(t, f).not.toMatch(PROIBIDO_EXPRESSAO);
    }
  });

  it('com marcadores vazios, a faixa "Versão preliminar, em revisão" aparece no topo, os marcadores ficam destacados, nada é indexado e não há domínio nem sitemap', () => {
    const g = gerarSite({ dados: VAZIOS });
    for (const nome of PAGINAS) {
      const h = texto(g.arquivos.get(nome));
      expect(h, nome).toMatch(/<body>\n<a class="pular"[^\n]*\n<div class="faixa" role="note">[\s\S]*Versão preliminar, em revisão\./);
      expect(h, nome).toContain('<meta name="robots" content="noindex">');
      expect(h, nome).toContain('<mark class="pendente">[RAZÃO SOCIAL]</mark>');
      expect(h, nome).not.toContain('rel="canonical"');
      expect(h, nome).not.toContain('og:image"');
      expect(g.pendencias.get(nome)?.length, nome).toBeGreaterThan(0);
    }
    expect(g.arquivos.has('sitemap.xml')).toBe(false);
    expect(texto(g.arquivos.get('robots.txt'))).toContain('Disallow: /');
    const suporte = texto(g.arquivos.get('suporte.html'));
    for (const m of ['E-MAIL DE SUPORTE', 'E-MAIL DE PRIVACIDADE', 'ENDEREÇO', 'CNPJ']) expect(suporte).toContain(`[${m}]`);
    for (const nome of ['sobre.html', 'empresas/index.html', 'novidades/como-escrevemos.html']) expect(texto(g.arquivos.get(nome)), nome).toContain('<mark class="pendente">[E-MAIL DE CONTATO]</mark>');
  });

  it('com todos os valores e sem [A DEFINIR], a faixa some, os valores entram (e-mail como link), há domínio com canonical, Open Graph, sitemap e robots, e nada pendente resta', () => {
    const dir = pastaDeExemplo();
    try {
      writeFileSync(join(dir, 'politica-de-privacidade.md'), EXEMPLO.replace('[A DEFINIR: prazo]', 'cinco anos'));
      const g = gerarSite({ legal: dir, dados: PREENCHIDOS });
      for (const nome of PAGINAS) {
        const h = texto(g.arquivos.get(nome));
        expect(h, nome).not.toContain('class="faixa"');
        expect(h, nome).not.toContain('class="pendente"');
        expect(g.pendencias.get(nome), nome).toEqual([]);
        expect(h, nome).toContain('Empresa Exemplo Ltda · CNPJ 00.000.000/0001-00');
        if (nome === '404.html') {
          expect(h).toContain('noindex');
          continue;
        }
        expect(h, nome).not.toContain('noindex');
        const limpo = nome === 'index.html' ? '/' : nome.endsWith('/index.html') ? `/${nome.slice(0, -'index.html'.length)}` : `/${nome.replace(/\.html$/, '')}`;
        expect(h, nome).toContain(`<link rel="canonical" href="https://exemplo.test${limpo}">`);
        expect(h, nome).toContain(`<meta property="og:url" content="https://exemplo.test${limpo}">`);
        expect(h, nome).toContain('<meta property="og:image" content="https://exemplo.test/og/clarevo.png">');
        expect(h, nome).toContain('<meta property="og:image:width" content="1200">');
        expect(h, nome).toContain('<meta property="og:image:height" content="630">');
      }
      const sobre = texto(g.arquivos.get('sobre.html'));
      expect(sobre).toContain('<a href="mailto:contato@exemplo.test">contato@exemplo.test</a>');
      expect(texto(g.arquivos.get('suporte.html'))).toContain('<a href="mailto:suporte@exemplo.test">suporte@exemplo.test</a>');
      expect(texto(g.arquivos.get('privacidade.html'))).toContain('<h1>Política de exemplo</h1>');
      const sitemap = texto(g.arquivos.get('sitemap.xml'));
      expect(problemasDeXml(sitemap)).toEqual([]);
      expect(sitemap).toContain('<loc>https://exemplo.test/</loc>');
      expect(sitemap).toContain('<loc>https://exemplo.test/app/</loc>');
      expect(sitemap).toContain('<loc>https://exemplo.test/aprender/decimo-terceiro</loc>');
      expect(sitemap).not.toContain('404');
      expect((sitemap.match(/<loc>/g) ?? []).length).toBe(PAGINAS.length - 1);
      const robots = texto(g.arquivos.get('robots.txt'));
      expect(robots).toContain('Allow: /');
      expect(robots).toContain('Sitemap: https://exemplo.test/sitemap.xml');
      expect(robots).not.toContain('Disallow');
      const feed = texto(g.arquivos.get('novidades/feed.xml'));
      expect(feed).toContain('<link>https://exemplo.test/novidades/2026-10-23-conheca-o-clarevo</link>');
      expect(feed).toContain('<atom:link href="https://exemplo.test/novidades/feed.xml" rel="self" type="application/rss+xml"/>');
      const org = /<script type="application\/ld\+json">(\{[^<]*"Organization"[^<]*\})<\/script>/.exec(texto(g.arquivos.get('index.html')));
      expect(JSON.parse(org![1]!)).toMatchObject({ '@type': 'Organization', name: 'Clarevo', legalName: 'Empresa Exemplo Ltda', url: 'https://exemplo.test/' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('um texto jurídico de exemplo (títulos, listas, tabela, links) gera páginas que passam em todas as verificações', () => {
    const dir = pastaDeExemplo();
    try {
      const g = gerarSite({ legal: dir, dados: PREENCHIDOS, referencia: '2026-10-23' });
      verificarPaginas(g.arquivos, 'exemplo.test', PAGINAS);
      const h = texto(g.arquivos.get('privacidade.html'));
      expect(h).toContain('href="termos.html#quem-pode-usar"');
      expect(h).toContain('href="excluir-conta.html"');
      expect(g.avisos.filter((a) => !a.includes('dados-da-empresa'))).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('o gerador avisa de travessão e da expressão proibida no Markdown, com a linha', () => {
    const dir = pastaDeExemplo();
    try {
      writeFileSync(join(dir, 'termos-de-uso.md'), `# Termos\n\nTexto com travessão \u2014 aqui.\n\nIsso não faz ${'sentido'}.\n`);
      const g = gerarSite({ legal: dir, dados: PREENCHIDOS });
      expect(g.avisos.some((a) => a.includes('termos-de-uso.md, linha 3') && a.includes('travessão'))).toBe(true);
      expect(g.avisos.some((a) => a.includes('termos-de-uso.md, linha 5') && a.includes('expressão proibida'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a página inicial traz o que o Clarevo é, recursos com captura, a empresa que nunca vê finanças, o que ele não é, o app web e o aviso das lojas (sem selos)', () => {
    const h = html('index.html');
    expect(h).toContain('<h1>Organize seu mês e aprenda</h1>');
    expect(h).toContain('organizador de finanças pessoais e da família');
    expect(h).toContain('Pode ser oferecido pela empresa como benefício');
    expect(h).toContain('A empresa nunca vê suas finanças');
    for (const frase of ['Não é banco', 'Não movimenta dinheiro', 'Não oferece crédito', 'Não recomenda produtos financeiros']) expect(h, frase).toContain(frase);
    expect(h).toContain('href="https://clarevo.pages.dev"');
    expect(h).toContain('Em breve na App Store e no Google Play.');
    expect(h).toMatch(/Para pessoas/);
    expect(h).toMatch(/Para empresas/);
    // O que aparece no app foi anotado ou importado pela pessoa ou pela Família dela, nunca "só por você".
    expect(h).toContain('foi anotado ou importado por você ou pelas pessoas da sua Família');
    expect(h).not.toContain('foi anotado ou importado por você,');
    // Nem todo tema tem exemplo calculado (taxa-e-tarifa não tem): a página diz "quando cabe", e não "cada um com exemplo calculado".
    expect(TEMAS_DO_SITE.some((t) => !t.example)).toBe(true);
    expect(h).toContain('quando cabe, um exemplo calculado');
    expect(h).not.toMatch(/cada um com exemplo calculado/);
    // O contato de empresas é o [E-MAIL DE CONTATO]; o suporte do app fica na página Suporte.
    expect(h).toContain('[E-MAIL DE CONTATO]');
    expect(h).not.toContain('[E-MAIL DE SUPORTE]');
    // A empresa não vê quando a pessoa abre o app nem o que anota; vê a data do aceite e a do encerramento.
    expect(h).toContain('a em que você aceitou o convite e a de encerramento');
    expect(h).toContain('Também não vê quando você abre o app nem o que você anota.');
    expect(h).not.toContain('nem o que você faz no app');
    // De três a quatro recursos com captura e o herói com a tela Resumo, todos com a legenda de demonstração.
    expect(h.match(/<figure class="celular">/g)?.length).toBe(5);
    expect(h.match(/Dados fictícios de demonstração/g)?.length).toBe(5);
    expect(h).toContain('src="imagens/resumo.png"');
    for (const alvo of ['app/index.html', 'empresas/index.html', 'aprender/index.html', 'ajuda/index.html', 'novidades/index.html', 'seguranca.html']) expect(h, alvo).toContain(`href="${alvo}"`);
    // Sem selos das lojas, preço, depoimento, cliente, prêmio nem número de uso inventado.
    expect(h).not.toMatch(/<img[^>]*(apple|google|store|play)/i);
    expect(h).not.toMatch(/R\$\s?\d{2,}[^\w]*\/|gr[áa]tis|depoimento|milh[õo]es|\d+\s*mil\s+(pessoas|usu)|melhor|pr[êe]mio|nossos clientes/i);
    expect(h).not.toMatch(/Download on the|App Store badge|Get it on/i);
  });

  it('O app passeia por todos os recursos pedidos, cada um com a captura da demonstração e o texto do guia de uso do app', () => {
    const h = html('app/index.html');
    expect(h).toContain('<h1>O Clarevo por dentro</h1>');
    for (const titulo of ['Resumo do mês', 'Anotar gasto e recebimento', 'Leitura de nota fiscal', 'Contas a pagar e gastos fixos', 'Cartões e faturas', 'Metas e reserva', 'Família', 'Aprender e calculadoras', 'Lembretes']) expect(h, titulo).toContain(`>${titulo}</h`);
    for (const id of ['resumo', 'anotar-gasto', 'nota-fiscal', 'contas-a-pagar', 'cartoes', 'metas', 'familia', 'aprender']) {
      const e = GUIDE_ENTRIES.find((x) => x.id === id)!;
      expect(h, id).toContain(esc(e.purpose));
    }
    const figuras = h.match(/<figure class="celular">/g)?.length ?? 0;
    expect(figuras).toBeGreaterThanOrEqual(11);
    expect(h.match(/Dados fictícios de demonstração/g)?.length).toBe(figuras);
    expect(h).toContain('Na web, hoje');
    // "Cada texto vem do guia" não é verdade (os pontos são do site): só a explicação de abertura vem do guia do app.
    expect(h).not.toContain('Cada texto vem do guia');
    expect(h).toContain('A explicação de abertura de cada recurso é a do guia de uso do próprio app');
    expect(h).toContain('tudo o que aparece foi anotado ou importado por você ou pelas pessoas da sua Família');
    // Lembretes são do app para celular: a única captura que existe é a da web, que só avisa que eles não existem, então não há imagem.
    expect(h).toContain('>Lembretes</h3>');
    expect(h).not.toContain('imagens/lembretes.png');
    expect(gerado.arquivos.has('imagens/lembretes.png')).toBe(false);
    expect(h).toContain('Em breve');
    expect(h).toContain('Em breve na App Store e no Google Play.');
    expect(h).not.toMatch(/<img[^>]*(apple|google|store|play)/i);
    expect(h).not.toMatch(/gr[áa]tis|R\$\s?\d+,\d{2}\s*(por|\/)\s*m[eê]s/i);
  });

  it('Para empresas explica o benefício, o que a empresa vê e nunca vê (como no código e nos textos jurídicos), o painel só na web, o fim do benefício e o piloto, sem preço', () => {
    const h = html('empresas/index.html');
    for (const frase of ['Como funciona', 'A empresa vê', 'A empresa nunca vê', 'O painel, só na web', 'Quando o benefício acaba', 'Falar sobre um piloto']) expect(h, frase).toContain(frase);
    expect(h).toContain('os e-mails que ela mesma convidou');
    expect(h).toContain('convite enviado, convite cancelado, ativa ou encerrada');
    for (const nunca of ['gastos, recebimentos e valores', 'categorias, metas, contas a pagar e cartões', 'a Família da pessoa', 'números somados de finanças']) expect(h, nunca).toContain(nunca);
    expect(h).toContain('de 1 a 500 por vez');
    expect(h).toContain('link de uso único');
    expect(h).toContain('o Clarevo não envia e-mail de convite');
    // O fim do benefício: só o que o código garante (nada é apagado; 30 dias de acesso pleno, o prazo de `BENEFIT_GRACE_DAYS` e da migração
    // de empresas). O plano gratuito é [A DEFINIR] (P-005) nos termos e não é afirmado como fato.
    expect(h).toContain('O acesso pleno continua por 30 dias, contados do encerramento da licença ou do fim do contrato');
    expect(h).toContain('O que vale depois desses 30 dias ainda não está definido');
    expect(h).not.toMatch(/plano gratuito|leitura do histórico/i);
    expect(h).toContain('Nada é apagado por causa do fim do benefício');
    // A empresa vê as datas do convite, do aceite ("Ativa desde") e do encerramento; não vê quando a pessoa abre o app nem o que anota.
    expect(h).toContain('a de quando a pessoa aceitou ("Ativa desde") e a do encerramento');
    expect(h).toContain('quando a pessoa abre o app e o que ela anota nele: o painel mostra só a data em que ela aceitou o convite e a do encerramento');
    expect(h).not.toContain('o painel não mostra quem entrou no app');
    expect(h).toContain('[E-MAIL DE CONTATO]');
    expect(h).toContain('Ainda não há tabela de preços');
    expect(h).toContain('src="../imagens/empresa-painel.png"');
    expect(h).toContain('Dados fictícios de demonstração');
    expect(h).not.toMatch(/R\$\s?\d|por vaga|gr[áa]tis|nossos clientes|depoimento|\d+\s*empresas/i);
  });

  it('Segurança e privacidade traz o que guardamos, o que não guardamos, quem vê, a empresa, a exclusão e o link para a política', () => {
    const h = html('seguranca.html');
    for (const frase of ['O essencial', 'O que guardamos', 'O que não guardamos', 'Quem vê os seus dados', 'Como protegemos', 'Este site', 'Excluir a conta']) expect(h, frase).toContain(frase);
    for (const nao of ['número completo de cartão, código de segurança (CVV) e validade', 'CPF da nota fiscal', 'dados do comprovante de Pix ou de pagamento', 'fotos e imagens da câmera']) expect(h, nao).toContain(nao);
    expect(h).toContain('ela nunca vê as suas finanças, nem somadas às de outras pessoas');
    // O site: sem cookies próprios nem análise de acesso; a hospedagem recebe o endereço da página e o IP (não "só para entregá-las").
    expect(h).toContain('O site não usa cookies próprios, não tem análise de acesso');
    expect(h).toContain('a hospedagem recebe o endereço da página que você abre e o seu IP');
    expect(h).not.toContain('só para entregá-las');
    expect(h).not.toContain('O site não usa cookies,');
    // O Android lê o QR Code com um componente do Google (ML Kit), como nas seções 5 e 8 da política.
    expect(h).toContain('No Android, a leitura do QR Code usa um componente do Google (ML Kit) incluído no app');
    expect(h).toContain('pode enviar ao Google dados técnicos de uso e do aparelho');
    expect(h).toContain('seções 5 e 8 da');
    // Na Família, as pessoas anotam também: o que está guardado não é "só o que você anota".
    expect(h).toContain('ou as pessoas da sua Família, anotam ou escolhem importar');
    expect(h).toContain('href="privacidade.html"');
    expect(h).toContain('href="excluir-conta.html"');
    expect(h).toContain('href="termos.html"');
    expect(h).not.toContain('[PROPOSTA');
  });

  it('Sobre fala do que move o Clarevo e de quem está por trás, sem nomes de pessoas, fotos nem números de uso', () => {
    const h = html('sobre.html');
    for (const frase of ['Clareza', 'Sem anúncio', 'Sem venda de dados', 'Sem recomendar produtos']) expect(h, frase).toContain(frase);
    expect(h).toContain('[RAZÃO SOCIAL]');
    expect(h).toContain('[E-MAIL DE CONTATO]');
    expect(h).not.toMatch(/<img[^>]*(foto|retrato|equipe)/i);
    expect(h).not.toMatch(/fundador|fundadora|CEO|\d+\s*mil\s+(pessoas|usu)|milh[õo]es/i);
  });

  it('Suporte continua sendo a página de contato que as lojas citam, com a Ajuda e as perguntas mais comuns', () => {
    const h = html('suporte.html');
    expect(h).toContain('[E-MAIL DE SUPORTE]');
    expect(h).toContain('[E-MAIL DE PRIVACIDADE]');
    expect(h).toContain('href="privacidade.html"');
    expect(h).toContain('href="ajuda/index.html"');
    for (const p of conteudo.lerPerguntas(join(ROOT, 'site-src', 'ajuda', 'perguntas.md'))) expect(h, p.pergunta).toContain(esc(p.pergunta));
    expect(h).toContain('o suporte nunca pede essas informações');
  });

  it('a 404 não pede indexação e usa só caminhos a partir da raiz', () => {
    const h = html('404.html');
    expect(h).toContain('noindex');
    expect(h).toContain('<h1>Página não encontrada</h1>');
    for (const m of h.matchAll(/(?:href|src)="([^"]+)"/g)) {
      if (/^(https?:|mailto:|#)/.test(m[1]!)) continue;
      expect(m[1], `caminho relativo na 404: ${m[1]}`).toMatch(/^\//);
    }
  });

  it('os cabeçalhos de segurança permitem só o próprio site, um script próprio e nada inline', () => {
    const h = html('_headers');
    expect(h).toContain("default-src 'none'");
    expect(h).toContain("script-src 'self'");
    expect(h).toContain("connect-src 'self'");
    expect(h).toContain("img-src 'self'");
    expect(h).not.toContain('unsafe-inline');
    expect(h).not.toContain('unsafe-eval');
    expect(h).not.toMatch(/https?:\/\/[^\s]*;/);
    expect(h).toContain("frame-ancestors 'none'");
    // Os formulários (D-066) enviam só para o próprio site; ninguém mais recebe um envio.
    expect(h).toContain("form-action 'self'");
    expect(h).not.toContain("form-action 'none'");
    expect(h).toContain('X-Content-Type-Options: nosniff');
    // `interest-cohort` era da FLoC, que acabou: só as permissões que o site realmente nega.
    expect(h).not.toContain('interest-cohort');
    expect(h).toContain('Permissions-Policy: camera=(), microphone=(), geolocation=()');
  });

  it('o estilo não carrega nada de fora, usa só as fontes locais e tem foco visível, modo escuro e a identidade da marca', () => {
    const css = html('estilo.css');
    expect(css).not.toMatch(/https?:|@import|\/\/[a-z]/i);
    for (const m of css.matchAll(/url\(([^)]+)\)/g)) expect(m[1], 'url() no CSS').toMatch(/^fontes\/Manrope_(500Medium|700Bold|800ExtraBold)\.ttf$/);
    expect(css).toContain(':focus-visible');
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain('--azul:#2457F5');
    expect(css).toContain('--lima:#D4F05B');
    expect(css).toContain('--texto:#17223B');
    expect(css).not.toMatch(/[\u2013\u2014]/);
    expect(css).toContain('@media print');
    for (const peso of ['500Medium', '700Bold', '800ExtraBold']) expect(existsSync(join(SITE, 'fontes', `Manrope_${peso}.ttf`)), peso).toBe(true);
    expect(readFileSync(join(SITE, 'fontes', 'OFL.txt'), 'utf8')).toContain('SIL OPEN FONT LICENSE Version 1.1');
  });

  it('o logotipo e o favicon são os arquivos de docs/marca, sem redesenho', () => {
    expect(readFileSync(join(SITE, 'marca', 'clarevo-logotipo-reverso.svg')).equals(readFileSync(join(ROOT, 'docs', 'marca', 'clarevo-logotipo-reverso.svg')))).toBe(true);
    expect(readFileSync(join(SITE, 'marca', 'clarevo-logotipo.svg')).equals(readFileSync(join(ROOT, 'docs', 'marca', 'clarevo-logotipo.svg')))).toBe(true);
    expect(readFileSync(join(SITE, 'favicon.svg')).equals(readFileSync(join(ROOT, 'docs', 'marca', 'clarevo-simbolo.svg')))).toBe(true);
  });

  it('na impressão entra o logotipo oficial de fundo claro, e não o reverso com as cores invertidas', () => {
    const css = html('estilo.css');
    const impressao = /@media print\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
    expect(impressao).toContain('.marca .logo-tela{display:none}');
    expect(impressao).toContain('.marca .logo-papel{display:block}');
    expect(css).not.toMatch(/invert\(/);
    expect(css).toContain('.marca .logo-papel{display:none}');
    for (const nome of PAGINAS_BASE) {
      const h = html(nome);
      const p = visto(nome, 'marca/clarevo-logotipo-reverso.svg').replace('clarevo-logotipo-reverso.svg', '');
      expect(h, nome).toContain(`<img src="${p}clarevo-logotipo-reverso.svg" alt="Clarevo, página inicial" width="140" height="28" class="logo-tela">`);
      expect(h, nome).toContain(`<img src="${p}clarevo-logotipo.svg" alt="Clarevo, página inicial" width="140" height="28" class="logo-papel">`);
    }
  });
});

describe('site público: Aprender (o catálogo do app, uma fonte de verdade)', () => {
  const gerado = gerarSite();
  const h = (nome: string) => texto(gerado.arquivos.get(nome));

  it('o site tem 30 ou mais temas, só publicados e não legados, das seções organizar, juros e tempo', () => {
    expect(TEMAS_DO_SITE.length).toBeGreaterThanOrEqual(30);
    const paginas = [...gerado.arquivos.keys()].filter((k) => /^aprender\/[^/]+\.html$/.test(k) && !['aprender/index.html', 'aprender/agenda.html'].includes(k));
    expect(paginas.sort()).toEqual(TEMAS_DO_SITE.map((t) => `aprender/${t.slug}.html`).sort());
    // Nada de rascunho, de "usar" nem de "dúvidas" (esses vão para a Ajuda).
    expect(gerado.arquivos.has('aprender/apagar-dados.html')).toBe(false);
    expect(gerado.arquivos.has('aprender/diferenca.html')).toBe(false);
    expect(gerado.arquivos.has('aprender/quem-ve-meus-dados.html')).toBe(false);
  });

  for (const t of TEMAS_DO_SITE) {
    it(`tema ${t.slug}: a página tem o texto do catálogo, o exemplo, as hipóteses, os fatos, as fontes, a data de revisão e os temas relacionados`, () => {
      const pagina = h(`aprender/${t.slug}.html`);
      expect(pagina).toContain(`<h1>${esc(t.title)}</h1>`);
      if (t.subtitle) expect(pagina).toContain(esc(t.subtitle));
      expect(pagina).toContain(esc(t.short));
      for (const p of t.paragraphs) expect(pagina).toContain(`<p>${esc(p)}</p>`);
      if (t.example) expect(pagina).toContain(esc(t.example));
      if (t.hypotheses) expect(pagina).toContain(esc(t.hypotheses));
      if (t.calculation) {
        for (const linha of t.calculation.split(' · ')) expect(pagina).toContain(`<li>${esc(linha.trim())}</li>`);
      }
      for (const f of t.facts) expect(pagina).toContain(`${esc(f.text)} <a href="#fonte-${f.source + 1}">Fonte ${f.source + 1}</a>`);
      // A data de revisão e todas as fontes (o texto da linha, o endereço e a data de consulta).
      expect(pagina).toContain(`Revisado em ${formatDateBR(t.reviewedOn)}.`);
      expect(t.sources.length).toBeGreaterThan(0);
      t.sources.forEach((s, i) => {
        expect(pagina, `fonte ${i + 1}`).toContain(`id="fonte-${i + 1}"`);
        if (s.kind === 'clarevo') {
          // As referências internas do projeto ("Clarevo: D-011") não aparecem no site público: só "Regra do próprio Clarevo".
          expect(pagina).toContain(`id="fonte-${i + 1}">Regra do próprio Clarevo<`);
          expect(pagina).not.toContain(esc(LEARN_UI_TEXT.sourceLine(s)));
          for (const ref of s.refs) expect(pagina, `código ${ref}`).not.toContain(ref);
        } else expect(pagina).toContain(esc(LEARN_UI_TEXT.sourceLine(s)));
        if (s.kind === 'oficial' || s.kind === 'mercado') {
          expect(pagina).toContain(`href="${esc(s.url)}" rel="noopener noreferrer"`);
          if (s.consultedOn) expect(pagina).toContain(`Consultada em ${formatDateBR(s.consultedOn)}`);
        }
      });
      if (t.reviewEveryMonths) expect(pagina).toContain(`Revisamos este tema a cada ${t.reviewEveryMonths} meses.`);
      expect(pagina).toContain(esc(LEARN_UI_TEXT.disclaimer));
      for (const r of relatedTopics(t.slug).filter((x) => !x.legacy && TEMAS_DO_SITE.includes(x))) expect(pagina).toContain(`href="${r.slug}.html"`);
      // Dados estruturados do artigo.
      const ld = /<script type="application\/ld\+json">([^<]*)<\/script>/.exec(pagina)![1]!;
      expect(JSON.parse(ld)).toMatchObject({ '@type': 'Article', headline: t.title, dateModified: t.reviewedOn });
    });
  }

  it('o índice lista cada tema uma vez, nas seções do app e na ordem do catálogo', () => {
    const indice = h('aprender/index.html');
    expect(indice).toContain('<h1>Aprender</h1>');
    let ultimo = -1;
    for (const id of ['organizar', 'juros', 'tempo']) {
      const secao = LEARN_SECTIONS.find((s) => s.id === id)!;
      const pos = indice.indexOf(`<h2 id="${id}">${esc(secao.title)}</h2>`);
      expect(pos, id).toBeGreaterThan(ultimo);
      ultimo = pos;
    }
    for (const t of TEMAS_DO_SITE) expect(indice.split(`href="${t.slug}.html"`).length - 1, t.slug).toBe(1);
    expect(indice).toContain('href="agenda.html"');
  });

  it('a Agenda financeira vem do calendário de época do catálogo: os doze meses, cada tema com link, data de revisão e fontes oficiais', () => {
    const agenda = h('aprender/agenda.html');
    expect(agenda).toContain('<h1>Agenda financeira</h1>');
    const nomes = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    SEASONAL_CALENDAR.forEach((m) => {
      expect(agenda).toContain(`<h2 id="mes-${m.month}">${nomes[m.month - 1]}</h2>`);
      const secao = agenda.slice(agenda.indexOf(`<h2 id="mes-${m.month}">`)).split('</section>')[0]!;
      if (m.slugs.length === 0) expect(secao).toContain('Sem tema de época neste mês');
      for (const slug of m.slugs) {
        const t = TEMAS_DO_SITE.find((x) => x.slug === slug)!;
        expect(secao, `${nomes[m.month - 1]}: ${slug}`).toContain(`href="${slug}.html"`);
        expect(secao).toContain(esc(t.short));
        expect(secao).toContain(`Revisado em ${formatDateBR(t.reviewedOn)}`);
        expect(secao).toContain('Fontes oficiais:');
      }
    });
    expect(agenda).toContain('deve ser conferido na fonte oficial do ano');
  });
});

describe('site público: Ajuda, busca e perguntas do suporte', () => {
  const gerado = gerarSite();
  const h = (nome: string) => texto(gerado.arquivos.get(nome));
  const temas = TEMAS_DA_AJUDA.map((t) => `ajuda/${t}.html`);
  const perguntasNasPaginas = temas.flatMap((nome) => [...h(nome).matchAll(/<article class="pergunta" id="([^"]+)"><h3>([^<]+)<\/h3>/g)].map((m) => ({ nome, id: m[1]!, pergunta: m[2]! })));
  const indice = JSON.parse(h('ajuda/indice.json')) as { i: string; t: string; a: string; u: string; k: string; x: string }[];

  it('a Ajuda tem os sete temas pedidos, com a lista completa visível sem JavaScript', () => {
    const index = h('ajuda/index.html');
    expect(index).toContain('<h1>Ajuda</h1>');
    for (const titulo of ['Começar', 'Anotar e organizar', 'Contas e cartões', 'Família', 'Benefício da empresa', 'Privacidade e segurança', 'Conta e acesso']) expect(index, titulo).toContain(titulo);
    for (const nome of temas) {
      const pagina = h(nome);
      expect(pagina).toContain('<article class="pergunta"');
      // A busca começa escondida (sem JavaScript seria um campo morto); a lista completa nunca é escondida pela página.
      expect(pagina).toMatch(/<div class="busca" role="search" data-busca data-indice="indice\.json" hidden>/);
      expect(pagina).toContain('<div data-some-na-busca>\n');
      expect(pagina).not.toMatch(/data-some-na-busca[^>]*hidden/);
      expect(pagina).toContain('<script src="busca.js" defer></script>');
      const faq = JSON.parse(/<script type="application\/ld\+json">([^<]*)<\/script>/.exec(pagina)![1]!);
      expect(faq['@type']).toBe('FAQPage');
      expect(faq.mainEntity.length).toBe(pagina.match(/<article class="pergunta"/g)!.length);
      expect(faq.mainEntity[0]).toMatchObject({ '@type': 'Question', acceptedAnswer: { '@type': 'Answer' } });
    }
  });

  it('toda função do guia de uso do app e todo tema de "usar" e "dúvidas" do catálogo tem resposta na Ajuda; o rascunho fica de fora', () => {
    const ids = new Set(perguntasNasPaginas.map((p) => p.id));
    for (const e of GUIDE_ENTRIES) expect(ids.has(`guia-${e.id}`), `guia ${e.id}`).toBe(true);
    for (const t of publishedTopics().filter((x) => x.section === 'usar' || x.section === 'duvidas')) expect(ids.has(`tema-${t.slug}`), `tema ${t.slug}`).toBe(true);
    expect(ids.has('tema-apagar-dados')).toBe(false);
    expect(ids.size).toBe(perguntasNasPaginas.length);
    for (const p of conteudo.lerPerguntas(join(ROOT, 'site-src', 'ajuda', 'perguntas.md'))) {
      expect(ids.has(`p-${p.id}`), `suporte ${p.id}`).toBe(true);
      expect(perguntasNasPaginas.find((x) => x.id === `p-${p.id}`)!.nome).toBe(`ajuda/${p.tema}.html`);
    }
    // O texto do guia é o do app: o "para que serve" e os passos.
    const cartoes = GUIDE_ENTRIES.find((e) => e.id === 'cartoes')!;
    expect(h('ajuda/contas.html')).toContain(esc(cartoes.purpose));
    for (const passo of cartoes.steps) expect(h('ajuda/contas.html')).toContain(`<li>${esc(passo)}</li>`);
  });

  it('as respostas que vêm do catálogo trazem o que o app mostra: "Ver a conta", as hipóteses (também sem exemplo), os números citados e a fonte, sem códigos internos', () => {
    const tema = (slug: string) => publishedTopics().find((t) => t.slug === slug)!;
    const resposta = (arquivo: string, slug: string) => {
      const pagina = h(`ajuda/${arquivo}.html`);
      const inicio = pagina.indexOf(`<article class="pergunta" id="tema-${slug}">`);
      expect(inicio, `${arquivo}: tema-${slug}`).toBeGreaterThan(-1);
      return pagina.slice(inicio, pagina.indexOf('</article>', inicio));
    };
    for (const [arquivo, slug] of [['comecar', 'diferenca'], ['contas', 'estimativa'], ['contas', 'parcelamentos']] as const) {
      const t = tema(slug);
      expect(t.calculation, `${slug} tem "Ver a conta" no catálogo`).toBeTruthy();
      const r = resposta(arquivo, slug);
      expect(r).toContain(`<summary>${LEARN_UI_TEXT.showCalculation}</summary>`);
      for (const linha of t.calculation!.split(' · ')) expect(r, `${slug}: ${linha}`).toContain(`<li>${esc(linha.trim())}</li>`);
      expect(r).toContain(esc(t.example!));
      expect(r).toContain(esc(t.hypotheses!));
    }
    // "Mês sem registro" não tem exemplo, mas o app mostra as hipóteses e o número citado ("R$ 0,00"), e a Ajuda também.
    const sem = tema('sem-registro');
    expect(sem.example).toBeNull();
    const rSem = resposta('organizar', 'sem-registro');
    expect(rSem).toContain(esc(sem.hypotheses!));
    for (const f of sem.facts) expect(rSem).toContain(`<strong>Números e regras citados:</strong> ${esc(f.text)}`);
    // A fonte do tipo `clarevo` aparece como "Regra do próprio Clarevo", igual em todas as respostas que vêm do catálogo.
    for (const t of publishedTopics().filter((x) => (x.section === 'usar' || x.section === 'duvidas') && !x.legacy)) {
      const arquivo = TEMAS_DA_AJUDA.find((a) => new RegExp(`id="tema-${t.slug}"`).test(h(`ajuda/${a}.html`)))!;
      const r = resposta(arquivo, t.slug);
      expect(r, t.slug).toContain(`Revisado em ${formatDateBR(t.reviewedOn)}. Fonte: Regra do próprio Clarevo.`);
      for (const s of t.sources) if (s.kind === 'clarevo') for (const ref of s.refs) expect(r, `${t.slug}: ${ref}`).not.toContain(ref);
    }
    expect(JSON.stringify(indice)).not.toMatch(/\bD-\d{3}\b/);
    // A busca acha o passo a passo da conta e as hipóteses pelo texto.
    expect(indice.find((i) => i.i === 'tema-diferenca')!.x).toContain('Ver a conta');
  });

  it('a Ajuda não afirma o plano gratuito como fato: o que vale depois dos 30 dias de acesso pleno ainda não está definido', () => {
    const b = h('ajuda/beneficio.html');
    expect(b).toContain('o acesso pleno continua por 30 dias. O que vale depois desses 30 dias ainda não está definido. Nada é apagado.');
    expect(b).toContain('Também não vê quando você abre o app nem o que você anota.');
    expect(b).toContain('as datas (como a em que você aceitou o convite e a de encerramento)');
    expect(b).not.toContain('Os e-mails que ela convidou, a situação de cada convite ou licença (convite enviado, convite cancelado, ativa ou encerrada), as datas e as contagens');
    expect(b).not.toContain('o que você faz no app');
    expect(h('ajuda/comecar.html')).toContain('anotado por você ou pelas pessoas da sua Família, ou importado de um arquivo');
  });

  it('o índice da busca (JSON) tem todas as perguntas, com título, tema, endereço e texto, e cada endereço existe', () => {
    expect(indice.length).toBe(perguntasNasPaginas.length);
    for (const p of perguntasNasPaginas) {
      const item = indice.find((x) => x.i === p.id);
      expect(item, p.id).toBeDefined();
      expect(item!.t).toBe(p.pergunta.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
      expect(item!.u).toBe(`${p.nome.replace('ajuda/', '')}#${p.id}`);
      expect(item!.x.length).toBeGreaterThan(20);
      expect(item!.a.length).toBeGreaterThan(3);
    }
    for (const item of indice) {
      const [pagina, ancora] = item.u.split('#');
      expect(h(`ajuda/${pagina}`), item.u).toContain(`id="${ancora}"`);
    }
    // Termos que a pessoa procura achariam resposta: senha, fatura, Família, empresa, exportar.
    const acha = (t: string) => indice.filter((i) => `${i.t} ${i.k} ${i.x}`.toLowerCase().includes(t)).length;
    for (const termo of ['senha', 'fatura', 'família', 'empresa', 'exportar', 'lembrete']) expect(acha(termo), termo).toBeGreaterThan(0);
  });

  it('o script da busca é do próprio site, só lê o índice local e não envia o que a pessoa digita', () => {
    const js = h('ajuda/busca.js');
    expect(js).toContain('fetch(caixa.getAttribute(\'data-indice\'))');
    expect(js).not.toMatch(/https?:|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document\.cookie|eval\(|innerHTML/);
    expect(js.length).toBeLessThan(5000);
    expect(js).toContain('textContent');
  });

  it('a busca funciona no navegador: acha por palavra sem acento, mostra o resultado com link e devolve a lista inteira ao limpar', async () => {
    // O script roda como no navegador, com um DOM mínimo e o índice real.
    class No {
      children: No[] = [];
      hidden = false;
      href = '';
      value = '';
      listeners: Record<string, () => void> = {};
      private t = '';
      get textContent() {
        return this.t;
      }
      set textContent(v: string) {
        this.t = v;
        this.children = [];
      }
      appendChild(c: No) {
        this.children.push(c);
        return c;
      }
      addEventListener(e: string, f: () => void) {
        this.listeners[e] = f;
      }
    }
    const campo = new No();
    const estado = new No();
    const lista = new No();
    const caixa = Object.assign(new No(), {
      hidden: true,
      getAttribute: () => 'indice.json',
      querySelector: (s: string) => (s === 'input' ? campo : s === '.busca-estado' ? estado : lista),
    });
    const escondido = new No();
    const doc = { querySelector: () => caixa, querySelectorAll: () => [escondido], createElement: () => new No() };
    const consultas: string[] = [];
    const fetchFalso = (url: string) => {
      consultas.push(url);
      return Promise.resolve({ ok: true, json: () => Promise.resolve(indice) });
    };
    new Function('document', 'window', 'fetch', h('ajuda/busca.js'))(doc, { fetch: fetchFalso }, fetchFalso);
    await new Promise((r) => setTimeout(r, 0));
    expect(consultas).toEqual(['indice.json']);
    expect(caixa.hidden).toBe(false);
    campo.value = 'SENHA';
    campo.listeners.input!();
    expect(escondido.hidden).toBe(true);
    expect(estado.textContent).toMatch(/respostas? para "SENHA"/);
    expect(lista.children.length).toBeGreaterThan(0);
    expect(lista.children[0]!.children[0]!.href).toMatch(/^[a-z]+\.html#/);
    campo.value = 'familía';
    campo.listeners.input!();
    expect(lista.children.length).toBeGreaterThan(0);
    campo.value = 'xyzxyzxyz';
    campo.listeners.input!();
    expect(estado.textContent).toContain('Nenhuma resposta');
    expect(lista.children.length).toBe(0);
    campo.value = '';
    campo.listeners.input!();
    expect(escondido.hidden).toBe(false);
    expect(estado.textContent).toBe('');
  });
});

describe('site público: Novidades, feed e dados estruturados', () => {
  const gerado = gerarSite();
  const h = (nome: string) => texto(gerado.arquivos.get(nome));

  it('os três posts iniciais têm data 23/10/2026, autoria "Equipe Clarevo", resumo, fontes e dados estruturados de artigo', () => {
    expect(gerado.posts.map((p) => p.arquivo).sort()).toEqual([...POSTS].sort());
    for (const nome of POSTS) {
      const pagina = h(nome);
      expect(pagina, nome).toContain('<time datetime="2026-10-23">23 de outubro de 2026</time> · Equipe Clarevo');
      const fontes = /<h2 id="fontes">Fontes<\/h2>\s*<ol class="fontes">([\s\S]*?)<\/ol>/.exec(pagina)?.[1] ?? '';
      expect((fontes.match(/<li/g) ?? []).length, `${nome}: fontes`).toBeGreaterThanOrEqual(2);
      const ld = JSON.parse(/<script type="application\/ld\+json">([^<]*)<\/script>/.exec(pagina)![1]!);
      expect(ld).toMatchObject({ '@type': 'Article', datePublished: '2026-10-23', author: { name: 'Equipe Clarevo' } });
      expect(ld.headline.length).toBeGreaterThan(10);
      expect(pagina, nome).toContain('corrigimos neste mesmo texto');
    }
  });

  it('"Conheça o Clarevo" só afirma o que o produto faz e manda para as páginas do site como fonte', () => {
    const p = h(POSTS[0]!);
    expect(p).toContain('<h1>Conheça o Clarevo</h1>');
    expect(p).toContain('O Clarevo não é banco');
    expect(p).toContain('tudo o que aparece no app foi anotado ou importado por você ou pelas pessoas da sua Família');
    expect(p).toContain('href="../app/index.html"');
    expect(p).toContain('href="../seguranca.html"');
    expect(p).toContain('href="../empresas/index.html"');
    expect(p).not.toMatch(/R\$\s?\d|gr[áa]tis|milh[õo]es|melhor/i);
  });

  it('"13º salário" usa o texto e as fontes do tema decimo-terceiro do catálogo, sem copiar à mão', () => {
    const t = TEMAS_DO_SITE.find((x) => x.slug === 'decimo-terceiro')!;
    const p = h(POSTS[1]!);
    expect(p).toContain(`<p>${esc(t.short)}</p>`);
    for (const par of t.paragraphs) expect(p).toContain(`<p>${esc(par)}</p>`);
    expect(p).toContain(`<p>${esc(t.example!)}</p>`);
    expect(p).toContain(`<p>${esc(t.hypotheses!)}</p>`);
    for (const s of t.sources) {
      if (s.kind === 'clarevo') {
        expect(p).toContain('Regra do próprio Clarevo');
        expect(p).not.toContain(esc(LEARN_UI_TEXT.sourceLine(s)));
      } else expect(p).toContain(esc(LEARN_UI_TEXT.sourceLine(s)));
      if (s.kind === 'oficial') expect(p).toContain(`href="${esc(s.url)}"`);
    }
    expect(p).toContain('href="../aprender/decimo-terceiro.html"');
    expect(p).not.toMatch(/\{\{/);
    // Nada sobra de diretiva: toda "{{tema:...}}" dos posts existe no catálogo.
    for (const f of readdirSync(join(ROOT, 'site-src', 'novidades'))) {
      for (const m of readFileSync(join(ROOT, 'site-src', 'novidades', f), 'utf8').matchAll(/\{\{tema:([a-z0-9-]+):/g)) expect(publishedTopics().some((x) => x.slug === m[1]), `${f}: ${m[1]}`).toBe(true);
    }
  });

  it('"Como a empresa oferece o Clarevo sem ver suas finanças" bate com a página Para empresas e com o texto jurídico', () => {
    const p = h(POSTS[2]!);
    expect(p).toContain('os e-mails que ela mesma convidou');
    expect(p).toContain('convite enviado, convite cancelado, ativa ou encerrada');
    expect(p).toContain('números somados de finanças');
    expect(p).toContain('o Clarevo não envia e-mail de convite');
    expect(p).toContain('href="../ajuda/beneficio.html#tema-empresa-ve"');
    expect(p).toContain('O banco de dados nega a leitura a quem administra o benefício, e isso é testado.');
    // O fim do benefício diz só o que o código garante: nada é apagado e 30 dias de acesso pleno. O plano gratuito é [A DEFINIR] e não aparece.
    expect(p).toContain('o acesso pleno continua por 30 dias, contados do encerramento da licença ou do fim do contrato');
    expect(p).toContain('O que vale depois desses 30 dias ainda não está definido.');
    expect(p).not.toMatch(/plano gratuito|leitura do histórico/i);
    expect(p).toContain('a empresa a vê como encerrada, com a data');
    // A empresa vê a data do aceite e a do encerramento, mas não quando a pessoa abre o app nem o que anota.
    expect(p).toContain('a do convite, a de quando a pessoa aceitou e a do encerramento');
    expect(p).toContain('quando a pessoa abre o app e o que ela anota nele: o painel mostra só a data em que ela aceitou o convite e a do encerramento');
    expect(p).not.toContain('quando ou como a pessoa usa o app');
  });

  it('o índice de Novidades lista os posts do mais novo para o mais antigo, com "Como escrevemos"; o feed e o link para ele só existem com domínio', () => {
    const i = h('novidades/index.html');
    expect(i).toContain('<h1>Novidades</h1>');
    for (const nome of POSTS) expect(i).toContain(`href="${nome.replace('novidades/', '')}"`);
    expect(i).toContain('href="como-escrevemos.html"');
    // Sem domínio (o caso do repositório hoje) não há feed.xml, nem botão, nem <link rel="alternate"> para ele.
    const semDominio = gerarSite({ dados: { ...PREENCHIDOS, DOMÍNIO: '' }, referencia: '2026-10-23' });
    expect(semDominio.arquivos.has('novidades/feed.xml')).toBe(false);
    for (const [nome, conteudoDaPagina] of semDominio.arquivos) {
      if (!nome.endsWith('.html')) continue;
      expect(texto(conteudoDaPagina), nome).not.toMatch(/feed\.xml|application\/rss\+xml|Feed RSS/);
    }
    expect(gerador.linksQuebrados(semDominio.arquivos)).toEqual([]);
    // Com domínio, o botão e o link existem e apontam para o feed.
    const comDominio = gerarSite({ dados: PREENCHIDOS, referencia: '2026-10-23' });
    const ic = texto(comDominio.arquivos.get('novidades/index.html'));
    expect(ic).toContain('href="feed.xml">Feed RSS</a>');
    expect(ic).toContain('<link rel="alternate" type="application/rss+xml" title="Novidades do Clarevo" href="feed.xml">');
    for (const nome of POSTS) expect(texto(comDominio.arquivos.get(nome)), nome).toContain('<link rel="alternate" type="application/rss+xml" title="Novidades do Clarevo" href="feed.xml">');
  });

  it('o feed RSS (só com domínio) é XML bem formado, com um item por post, data, descrição e endereços completos, nunca relativos', () => {
    const g = gerarSite({ dados: PREENCHIDOS, referencia: '2026-10-23' });
    const feed = texto(g.arquivos.get('novidades/feed.xml'));
    expect(problemasDeXml(feed)).toEqual([]);
    expect(feed).toContain('<rss version="2.0"');
    expect((feed.match(/<item>/g) ?? []).length).toBe(3);
    expect((feed.match(/<pubDate>Fri, 23 Oct 2026 12:00:00 -0300<\/pubDate>/g) ?? []).length).toBe(3);
    for (const p of g.posts) expect(feed).toContain(`<title>${esc(p.titulo)}</title>`);
    for (const m of feed.matchAll(/<(?:link|guid isPermaLink="true")>([^<]*)<\/(?:link|guid)>/g)) expect(m[1], 'endereço do feed').toMatch(/^https:\/\/exemplo\.test\//);
    expect(feed).not.toContain('isPermaLink="false"');
    expect(feed).toContain('<link>https://exemplo.test/novidades/</link>');
    // O verificador de XML do teste pega o que é malformado.
    expect(problemasDeXml('<?xml version="1.0" encoding="UTF-8"?><a><b></a></b>').length).toBeGreaterThan(0);
    expect(problemasDeXml('<?xml version="1.0" encoding="UTF-8"?><a>1 & 2</a>').length).toBeGreaterThan(0);
    expect(problemasDeXml('<a></a>').length).toBeGreaterThan(0);
  });

  it('"Como escrevemos" traz as regras editoriais: fonte, data, revisão, sem recomendar produto, sem publicidade e correções no próprio texto', () => {
    const p = h('novidades/como-escrevemos.html');
    expect(p).toContain('<h1>Como escrevemos</h1>');
    for (const regra of ['Toda informação tem fonte', 'Toda informação tem data', 'a cada 6 ou 12 meses', 'Não recomendamos produto financeiro', 'Não há publicidade', 'Corrigimos no próprio texto', 'Não apagamos o erro em silêncio']) expect(p, regra).toContain(regra);
    expect(p).toContain('[E-MAIL DE CONTATO]');
  });
});

describe('site público: imagens, tamanho e Open Graph', () => {
  const gerado = gerarSite();

  it('as capturas são de demonstração, com largura adequada, tamanho declarado igual ao do arquivo e peso razoável', () => {
    const imagens = [...gerado.arquivos.keys()].filter((k) => k.startsWith('imagens/'));
    expect(imagens.length).toBeGreaterThanOrEqual(12);
    let total = 0;
    for (const nome of imagens) {
      const bytes = gerado.arquivos.get(nome) as Buffer;
      const d = png.dimensoes(bytes);
      expect(d.largura, nome).toBeLessThanOrEqual(960);
      expect(d.largura, nome).toBeGreaterThanOrEqual(480);
      expect(bytes.length, nome).toBeLessThanOrEqual(120 * 1024);
      total += bytes.length;
      // Toda página que usa a imagem declara a mesma largura e altura.
      for (const [pagina, conteudoDaPagina] of gerado.arquivos) {
        if (!pagina.endsWith('.html')) continue;
        for (const m of texto(conteudoDaPagina).matchAll(new RegExp(`<img src="[^"]*${nome.replace('/', '\\/')}"[^>]*>`, 'g'))) {
          expect(m[0], `${pagina}: ${nome}`).toContain(`width="${d.largura}" height="${d.altura}"`);
        }
      }
    }
    expect(total, 'peso total das capturas').toBeLessThanOrEqual(1024 * 1024);
    // O site inteiro, sem as fontes de licença aberta, cabe com folga.
    const tudo = [...gerado.arquivos.values()].reduce((n, c) => n + Buffer.byteLength(c), 0);
    expect(tudo).toBeLessThanOrEqual(4 * 1024 * 1024);
  });

  it('a chave do cache das imagens inclui o resumo do código de png.js e de imagens.js: mudar o método invalida o cache sozinho', () => {
    const imagens = require(join(ROOT, 'scripts', 'site', 'imagens.js')) as {
      RESUMO_DO_CODIGO: string;
      chaveDoCache: (original: Buffer, largura: number, resumo?: string) => string;
      IMAGENS: { id: string; origem: string }[];
    };
    const arquivoDoMetodo = readFileSync(join(ROOT, 'scripts', 'site', 'png.js'));
    const arquivoDaLista = readFileSync(join(ROOT, 'scripts', 'site', 'imagens.js'));
    expect(imagens.RESUMO_DO_CODIGO).toBe(createHash('sha1').update(arquivoDoMetodo).update('|').update(arquivoDaLista).digest('hex').slice(0, 12));
    const original = Buffer.from('captura de teste');
    const chave = imagens.chaveDoCache(original, 480);
    expect(imagens.chaveDoCache(original, 480)).toBe(chave);
    expect(imagens.chaveDoCache(original, 480, 'outro-codigo')).not.toBe(chave);
    expect(imagens.chaveDoCache(original, 960)).not.toBe(chave);
    expect(imagens.chaveDoCache(Buffer.from('outra captura'), 480)).not.toBe(chave);
    // Nada de número de versão escrito à mão para lembrar de trocar.
    expect(arquivoDaLista.toString('utf8')).not.toContain('VERSAO_DO_METODO');
    // A tela de lembretes da web só avisa que o recurso não existe na web: não é captura do recurso.
    expect(imagens.IMAGENS.some((i) => i.id === 'lembretes')).toBe(false);
  });

  it('o reduzir mantém a proporção e o PNG gravado tem os mesmos pixels ao ler de volta', () => {
    const orig = png.decodificar(readFileSync(join(ROOT, 'docs', 'telas', '402_familia_titular.png')));
    const menor = png.reduzir(orig, 390);
    expect(menor.largura).toBe(390);
    expect(Math.abs(menor.altura / menor.largura - orig.altura / orig.largura)).toBeLessThan(0.01);
    const volta = png.decodificar(png.codificar(menor));
    expect(volta.rgb.equals(menor.rgb)).toBe(true);
  });

  it('a imagem de compartilhamento é um PNG de 1200 x 630, RGB de 24 bits, sem transparência, e vai para site/og/clarevo.png', () => {
    const arquivo = join(ROOT, 'site-src', 'imagens', 'og-clarevo-1200x630.png');
    const bytes = readFileSync(arquivo);
    expect(bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(bytes.readUInt32BE(16)).toBe(1200);
    expect(bytes.readUInt32BE(20)).toBe(630);
    expect(bytes[24], 'profundidade de bits').toBe(8);
    expect(bytes[25], 'tipo de cor 2 = RGB, sem alfa').toBe(2);
    expect(bytes.length).toBeLessThanOrEqual(600 * 1024);
    expect((gerado.arquivos.get('og/clarevo.png') as Buffer).equals(bytes)).toBe(true);
    const script = readFileSync(join(ROOT, 'scripts', 'gerar-og-site.js'), 'utf8');
    expect(script).toContain('clarevo-logotipo-reverso.svg');
    expect(script).toContain('apple-subtitulo');
    expect(script).toContain('01_resumo.png');
    // O texto que o desenho mostra (o subtítulo da ficha e a linha de recursos), sem preço, ranking, "melhor", "grátis" nem selos.
    const ficha = readFileSync(join(ROOT, 'docs', 'lojas', 'ficha.md'), 'utf8');
    const textoDoDesenho = [...script.matchAll(/<p>([^<$]*)<\/p>/g)].map((m) => m[1]).join(' ');
    expect(textoDoDesenho.length).toBeGreaterThan(20);
    expect(`${textoDoDesenho} ${ficha.match(/apple-subtitulo[^\n]*\n```\n([^\n]+)/)?.[1] ?? ''}`).not.toMatch(/gr[áa]tis|melhor|baixe|download|R\$|ranking|#1|\bn[úu]mero 1\b/i);
  });
});

describe('site público: contraste das cores (a regra de src/contrast.ts, 4,5:1 para texto e 3:1 para foco e contornos)', () => {
  const css = readFileSync(join(SITE, 'estilo.css'), 'utf8');
  const variaveis = (bloco: string) => Object.fromEntries([...bloco.matchAll(/--([a-z0-9-]+):(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1]!, m[2]!]));
  const claro = variaveis(/:root\{([^}]*)\}/.exec(css)![1]!);
  const escuro = { ...claro, ...variaveis(/@media \(prefers-color-scheme: dark\)\{\s*:root\{([^}]*)\}/.exec(css)![1]!) };

  /** [texto, fundo, onde aparece] */
  const TEXTOS: [string, string, string][] = [
    ['texto', 'fundo', 'texto da página'],
    ['texto', 'superficie', 'texto nos cartões e no rodapé'],
    ['texto-2', 'fundo', 'nota sob a lista'],
    ['texto-2', 'superficie', 'rodapé e rótulos das células da tabela'],
    ['texto', 'azul-claro', 'código, citação e cabeçalho da tabela'],
    ['texto', 'lima-claro', 'destaque "A empresa nunca vê suas finanças"'],
    ['link', 'fundo', 'links no texto'],
    ['link', 'superficie', 'links nos cartões e no rodapé'],
    ['link', 'azul-claro', 'links dentro de citação'],
    ['link', 'lima-claro', 'links dentro do destaque'],
    ['sobre-topo', 'topo', 'logotipo, menu, título e botão suave sobre o azul'],
    ['sobre-topo-suave', 'topo', 'texto de apoio sobre o azul'],
    ['sobre-lima', 'lima', 'faixa de versão preliminar, marcador pendente e botão principal na capa e no menu'],
    ['sobre-botao', 'botao', 'botão principal fora da capa, número dos passos e tema atual da Ajuda'],
    ['sobre-topo', 'disco', 'texto da capa sobre o disco decorativo'],
    ['sobre-topo-suave', 'disco', 'texto de apoio da capa sobre o disco decorativo'],
    ['sobre-rodape', 'rodape', 'títulos e linha legal do rodapé'],
    ['sobre-rodape-2', 'rodape', 'texto do rodapé'],
    ['link-rodape', 'rodape', 'links do rodapé'],
    ['texto-2', 'azul-claro', 'legenda dentro de bloco azul'],
    ['texto', 'lima-claro', 'resposta aberta pelo link da Ajuda e aviso "No app"'],
  ];
  /** [cor, fundo, onde aparece]: foco, contornos e sublinhado do menu (3:1). */
  const GRAFICOS: [string, string, string][] = [
    ['foco', 'fundo', 'anel de foco sobre o fundo'],
    ['foco', 'superficie', 'anel de foco sobre os cartões'],
    ['foco-topo', 'topo', 'anel de foco sobre o azul'],
    ['lima', 'topo', 'sublinhado da página atual e botão principal sobre o azul'],
    ['sobre-topo', 'topo', 'contorno do botão suave e do botão do menu'],
    ['link', 'fundo', 'contorno do botão suave e dos temas da Ajuda'],
    ['contorno', 'fundo', 'contorno do campo de busca'],
    ['contorno', 'superficie', 'contorno do campo de busca nos blocos claros'],
    ['link-rodape', 'rodape', 'anel de foco no rodapé'],
  ];

  it('as variáveis das duas aparências foram lidas (claro e escuro) e as marcas da identidade estão certas', () => {
    expect(claro.azul).toBe('#2457F5');
    expect(claro.lima).toBe('#D4F05B');
    expect(claro.texto).toBe('#17223B');
    expect(escuro.fundo).not.toBe(claro.fundo);
    expect(escuro.texto).not.toBe(claro.texto);
  });

  for (const [nome, cores] of [['claro', claro], ['escuro', escuro]] as const) {
    it(`modo ${nome}: todo par de texto passa de 4,5:1`, () => {
      for (const [fg, bg, onde] of TEXTOS) {
        expect(cores[fg], fg).toBeDefined();
        expect(cores[bg], bg).toBeDefined();
        const razao = contrastRatio(cores[fg]!, cores[bg]!);
        expect(razao, `${onde}: ${fg} ${cores[fg]} sobre ${bg} ${cores[bg]} = ${razao.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
    });
    it(`modo ${nome}: foco e contornos passam de 3:1`, () => {
      for (const [fg, bg, onde] of GRAFICOS) {
        const razao = contrastRatio(cores[fg]!, cores[bg]!);
        expect(razao, `${onde}: ${fg} sobre ${bg} = ${razao.toFixed(2)}`).toBeGreaterThanOrEqual(3);
      }
    });
  }
});

describe('site público: gerar-site.js na linha de comando', () => {
  const rodar = (args: string[]) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: ROOT, encoding: 'utf8' });
  const LIMPO = EXEMPLO.replace('[A DEFINIR: prazo]', 'cinco anos');
  /** Pasta de exemplo sem nenhuma pendência, com o ajuste do caso (arquivo e texto a somar ou a trocar). */
  const pasta = (pastas: string[], ajuste?: (md: Record<string, string>) => void): string => {
    const legal = pastaDeExemplo();
    pastas.push(legal);
    const md: Record<string, string> = {
      'politica-de-privacidade.md': LIMPO,
      'termos-de-uso.md': readFileSync(join(legal, 'termos-de-uso.md'), 'utf8'),
      'exclusao-de-conta.md': readFileSync(join(legal, 'exclusao-de-conta.md'), 'utf8'),
    };
    ajuste?.(md);
    for (const [nome, conteudoDoArquivo] of Object.entries(md)) writeFileSync(join(legal, nome), conteudoDoArquivo);
    return legal;
  };

  it('--final falha (código 1) e lista o que falta, sem gravar nada, enquanto sobrar marcador ou [A DEFINIR]; passa e grava o site todo quando está limpo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'clarevo-final-'));
    const pastas: string[] = [];
    try {
      writeFileSync(join(dir, 'vazios.json'), JSON.stringify(VAZIOS));
      const saida = join(dir, 'site');
      const r = rodar(['--final', '--dados', join(dir, 'vazios.json'), '--saida', saida]);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('--final');
      expect(r.stderr).toContain('[RAZÃO SOCIAL]');
      expect(r.stderr).toContain('[CNPJ]');
      expect(r.stderr).toContain('suporte.html: [E-MAIL DE SUPORTE]');
      expect(r.stderr).toContain('sobre.html: [E-MAIL DE CONTATO]');
      expect(r.stderr).toContain('index.html: [RAZÃO SOCIAL]');
      expect(r.stderr).toContain('aprender/decimo-terceiro.html: [RAZÃO SOCIAL]');
      expect(existsSync(saida)).toBe(false);
      // Com todos os valores mas com um [A DEFINIR] no texto, ainda falha.
      const legal = pasta(pastas);
      writeFileSync(join(legal, 'politica-de-privacidade.md'), EXEMPLO);
      writeFileSync(join(dir, 'cheios.json'), JSON.stringify(PREENCHIDOS));
      const r2 = rodar(['--final', '--dados', join(dir, 'cheios.json'), '--legal', legal, '--saida', saida]);
      expect(r2.status).toBe(1);
      expect(r2.stderr).toContain('privacidade.html: [A DEFINIR: prazo]');
      expect(r2.stderr).not.toContain('[RAZÃO SOCIAL]');
      expect(existsSync(saida)).toBe(false);
      // Sem nenhuma pendência, passa e grava as páginas, o feed, o sitemap e a busca na pasta pedida.
      const limpa = pasta(pastas);
      const r3 = rodar(['--final', '--dados', join(dir, 'cheios.json'), '--legal', limpa, '--referencia', '2026-10-23', '--saida', saida]);
      expect(r3.status, r3.stderr).toBe(0);
      for (const nome of [...PAGINAS, 'sitemap.xml', 'robots.txt', 'novidades/feed.xml', 'ajuda/indice.json', 'ajuda/busca.js', 'og/clarevo.png', 'imagens/resumo.png']) expect(existsSync(join(saida, nome)), nome).toBe(true);
      expect(readFileSync(join(saida, 'suporte.html'), 'utf8')).toContain('suporte@exemplo.test');
      expect(r3.stdout).toMatch(/\d+ páginas/);
      // Rodar de novo não muda nada (as capturas são comparadas pelos pixels).
      const r4 = rodar(['--dados', join(dir, 'cheios.json'), '--legal', limpa, '--referencia', '2026-10-23', '--saida', saida]);
      expect(r4.status, r4.stderr).toBe(0);
      expect(r4.stdout).toContain('0 mudaram');
    } finally {
      for (const p of pastas) rmSync(p, { recursive: true, force: true });
      rmSync(dir, { recursive: true, force: true });
    }
  }, 180_000);

  it('--final recusa cada caso de rascunho (marca, proposta, travessão, link interno quebrado, expressão proibida) e, sem --final, os mesmos casos só viram aviso ou ficam visíveis', () => {
    const pastas: string[] = [];
    try {
      const FRASE = 'Rascunho preparado pela equipe do Clarevo para revisão jurídica. Não é parecer jurídico.';
      const casos: [string, (md: Record<string, string>) => void, string[]][] = [
        ['a frase de rascunho', (md) => (md['termos-de-uso.md'] = `${FRASE}\n\n${md['termos-de-uso.md']}`), ['termos.html: frase de rascunho']],
        ['"Proposta:"', (md) => (md['exclusao-de-conta.md'] += '\nProposta: pedir a confirmação pelo e-mail.\n'), ['excluir-conta.html: texto de proposta ("Proposta:")']],
        ['"proposta, ainda sem confirmação"', (md) => (md['politica-de-privacidade.md'] += '\nAs bases abaixo são uma proposta, ainda sem confirmação jurídica.\n'), ['privacidade.html: texto de proposta ("proposta, ainda sem confirmação")']],
        ['a marca [PROPOSTA]', (md) => (md['termos-de-uso.md'] += '\n[PROPOSTA: prazo de 30 dias]\n'), ['termos.html: [PROPOSTA: prazo de 30 dias]']],
        ['travessão', (md) => (md['termos-de-uso.md'] += '\nTexto com travessão \u2014 aqui.\n'), ['termos.html: travessão']],
        ['link interno para arquivo que não existe', (md) => (md['politica-de-privacidade.md'] += '\nVeja [o contrato](contrato.md).\n'), ['link interno quebrado em privacidade.html', 'contrato.md']],
        ['link interno para âncora que não existe', (md) => (md['politica-de-privacidade.md'] += '\nVeja [os termos](termos-de-uso.md#nao-existe).\n'), ['link interno quebrado em privacidade.html', '#nao-existe']],
        ['[A DEFINIR', (md) => (md['exclusao-de-conta.md'] += '\nPrazo: [A DEFINIR: prazo]\n'), ['excluir-conta.html: [A DEFINIR: prazo]']],
        ['a expressão proibida', (md) => (md['termos-de-uso.md'] += `\nIsso não faz ${'sentido'}.\n`), ['termos.html: expressão proibida']],
      ];
      // Um exemplo limpo não tem nenhum motivo para o --final recusar.
      const limpo = gerarSite({ legal: pasta(pastas), dados: PREENCHIDOS, referencia: '2026-10-23' });
      expect(razoesFinais(limpo)).toEqual([]);
      for (const [nome, ajuste, esperado] of casos) {
        const g = gerarSite({ legal: pasta(pastas, ajuste), dados: PREENCHIDOS, referencia: '2026-10-23' });
        const motivos = razoesFinais(g).join('\n');
        expect(motivos.length, `${nome}: o --final deveria recusar`).toBeGreaterThan(0);
        for (const trecho of esperado) expect(motivos, `${nome}: ${trecho}`).toContain(trecho);
      }
    } finally {
      for (const p of pastas) rmSync(p, { recursive: true, force: true });
    }
  }, 180_000);

  it('na linha de comando, um caso de rascunho falha com código 1 e a lista, sem gravar nada, e sem --final só avisa e grava', () => {
    const dir = mkdtempSync(join(tmpdir(), 'clarevo-final-caso-'));
    const pastas: string[] = [];
    try {
      writeFileSync(join(dir, 'cheios.json'), JSON.stringify(PREENCHIDOS));
      const legal = pasta(pastas, (md) => (md['termos-de-uso.md'] += '\nTexto com travessão \u2014 aqui.\n'));
      const saida = join(dir, 'site');
      const r = rodar(['--final', '--dados', join(dir, 'cheios.json'), '--legal', legal, '--saida', saida]);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('--final');
      expect(r.stderr).toContain('termos.html: travessão');
      expect(existsSync(saida)).toBe(false);
      const normal = rodar(['--dados', join(dir, 'cheios.json'), '--legal', legal, '--saida', saida]);
      expect(normal.status, normal.stderr).toBe(0);
      expect(normal.stderr).toContain('termos-de-uso.md, linha');
      expect(existsSync(join(saida, 'index.html'))).toBe(true);
    } finally {
      for (const p of pastas) rmSync(p, { recursive: true, force: true });
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it('--final falha também com os dados e os textos atuais do repositório, enquanto houver valor vazio ou [A DEFINIR] (hoje: o advogado e a empresa ainda não entregaram)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'clarevo-final-'));
    try {
      const r = rodar(['--final', '--saida', join(dir, 'site')]);
      const atuais = JSON.parse(readFileSync(join(SITE, 'dados-da-empresa.json'), 'utf8')) as Record<string, string>;
      const algumVazio = MARCADORES.some((m) => !(atuais[m] ?? '').trim());
      if (algumVazio) {
        expect(r.status).toBe(1);
        expect(r.stderr).toContain('Falta preencher');
        expect(r.stderr).toContain('[E-MAIL DE CONTATO]');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it('sem --final, o gerador funciona com um aviso quando docs/legal não existe e grava só o que tem', () => {
    const dir = mkdtempSync(join(tmpdir(), 'clarevo-sem-legal-'));
    try {
      mkdirSync(join(dir, 'vazia'));
      const r = rodar(['--legal', join(dir, 'vazia'), '--saida', join(dir, 'site')]);
      expect(r.status, r.stderr).toBe(0);
      expect(r.stderr).toContain('ainda não existe');
      expect(existsSync(join(dir, 'site', 'index.html'))).toBe(true);
      expect(readFileSync(join(dir, 'site', 'privacidade.html'), 'utf8')).toContain('[A DEFINIR: texto desta página');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  /** Uma cópia dos posts do repositório em uma pasta temporária, com o ajuste do caso (nome do arquivo para texto). */
  const posts = (pastas: string[], ajuste?: (arquivos: Record<string, string>) => void): string => {
    const dir = mkdtempSync(join(tmpdir(), 'clarevo-posts-final-'));
    pastas.push(dir);
    const origem = join(ROOT, 'site-src', 'novidades');
    const arquivos: Record<string, string> = {};
    for (const nome of readdirSync(origem)) arquivos[nome] = readFileSync(join(origem, nome), 'utf8');
    ajuste?.(arquivos);
    for (const [nome, c] of Object.entries(arquivos)) writeFileSync(join(dir, nome), c);
    return dir;
  };
  const CABECALHO = (data: string, extra = '', fontes = '\nfontes:\n  - Fonte de teste') => `---\ntitulo: Post de teste\ndata: ${data}\nresumo: Um resumo curto.\nautoria: Equipe Clarevo${fontes}\n---\n${extra || 'Texto do post.\n'}`;
  const REFERENCIA = '2026-10-23';

  it('--final recusa cada caso de Novidades (post sem fontes, data inválida ou futura, tema que não existe, nome fora do padrão) e, sem --final, o aviso aparece e o texto não some em silêncio', () => {
    const pastas: string[] = [];
    try {
      const limpa = pasta(pastas);
      const gerar = (novidades: string, referencia = REFERENCIA, dados: Record<string, string> = PREENCHIDOS) => gerarSite({ legal: limpa, dados, referencia, novidades });
      // Os posts do repositório, com tudo preenchido, não têm motivo nenhum para o --final recusar.
      const bom = gerar(posts(pastas));
      expect(razoesFinais(bom)).toEqual([]);
      expect(bom.avisos.filter((a) => !a.includes('dados-da-empresa'))).toEqual([]);
      const casos: [string, (a: Record<string, string>) => void, string[]][] = [
        ['post sem fontes', (a) => (a['2026-10-22-sem-fontes.md'] = CABECALHO('2026-10-22', undefined, '')), ['site-src/novidades/2026-10-22-sem-fontes.md: falta "fontes" no cabeçalho']],
        ['data que não existe no calendário', (a) => (a['2026-02-30-impossivel.md'] = CABECALHO('2026-02-30')), ['2026-02-30-impossivel.md: a data do nome do arquivo (2026-02-30) não existe no calendário']],
        ['data com formato errado no cabeçalho', (a) => (a['2026-10-22-torto.md'] = CABECALHO('22/10/2026')), ['2026-10-22-torto.md: a data do cabeçalho (22/10/2026) não é uma data válida']],
        ['data futura em relação à referência', (a) => (a['2026-10-24-amanha.md'] = CABECALHO('2026-10-24')), ['2026-10-24-amanha.md: a data (2026-10-24) é depois da data de referência (2026-10-23)']],
        ['tema que não existe em {{tema:...}}', (a) => (a['2026-10-22-tema.md'] = CABECALHO('2026-10-22', '{{tema:nao-existe:p1}}\n')), ['2026-10-22-tema.md: {{tema:nao-existe:p1}} não existe no catálogo de Aprender']],
        ['tema que não existe em "tema:" das fontes', (a) => (a['2026-10-22-fonte.md'] = CABECALHO('2026-10-22', undefined, '\nfontes:\n  - tema: nao-existe')), ['2026-10-22-fonte.md: a fonte "tema: nao-existe" não existe no catálogo de Aprender']],
        ['nome fora do padrão', (a) => (a['sem-data.md'] = CABECALHO('2026-10-22')), ['site-src/novidades/sem-data.md: o nome do arquivo precisa ser AAAA-MM-DD-slug.md']],
      ];
      for (const [nome, ajuste, esperado] of casos) {
        const g = gerar(posts(pastas, ajuste));
        const motivos = razoesFinais(g).join('\n');
        for (const trecho of esperado) {
          expect(motivos, `${nome}: o --final deveria recusar com "${trecho}"`).toContain(trecho);
          // Sem --final, o mesmo problema é um aviso (o console o mostra), e a geração continua.
          expect(g.avisos.join('\n'), `${nome}: aviso`).toContain(trecho);
        }
      }
      // A data de referência é explícita: o mesmo post passa quando a referência chega até a data dele.
      const amanha = posts(pastas, (a) => (a['2026-10-24-amanha.md'] = CABECALHO('2026-10-24')));
      expect(razoesFinais(gerar(amanha, '2026-10-24'))).toEqual([]);
      expect(razoesFinais(gerar(amanha, '2026-10-23')).length).toBeGreaterThan(0);
      expect(() => gerar(amanha, '2026-13-40')).toThrow(/data de referência/);
      // O parágrafo de um tema que não existe não some em silêncio: fica na página, destacado como pendente.
      const semTema = gerar(posts(pastas, (a) => (a['2026-10-22-tema.md'] = CABECALHO('2026-10-22', '{{tema:nao-existe:p1}}\n'))));
      const pagina = texto(semTema.arquivos.get('novidades/2026-10-22-tema.html'));
      expect(pagina).toContain('<mark class="pendente">Falta o texto do tema "nao-existe", campo "p1"');
      expect(pagina).not.toContain('{{');
      // O domínio é exigido de propósito no --final, mesmo que nenhum texto cite [DOMÍNIO] (o texto jurídico de exemplo não cita).
      const semDominio = gerar(posts(pastas), REFERENCIA, { ...PREENCHIDOS, DOMÍNIO: '' });
      expect(semDominio.pendencias.get('privacidade.html')).toEqual([]);
      expect(razoesFinais(semDominio)).toEqual([expect.stringContaining('[DOMÍNIO] sem valor em site/dados-da-empresa.json')]);
      expect(semDominio.avisos.join('\n')).toContain('o --final recusaria: [DOMÍNIO] sem valor');
      const invalido = gerar(posts(pastas), REFERENCIA, { ...PREENCHIDOS, DOMÍNIO: 'isto não é um domínio' });
      expect(razoesFinais(invalido)).toEqual([expect.stringContaining('não parece um domínio')]);
      for (const bomDominio of ['clarevo.com.br', 'https://www.exemplo.test/', 'app.exemplo.com.br']) expect(razoesFinais(gerar(posts(pastas), REFERENCIA, { ...PREENCHIDOS, DOMÍNIO: bomDominio })), bomDominio).toEqual([]);
    } finally {
      for (const p of pastas) rmSync(p, { recursive: true, force: true });
    }
  }, 240_000);

  it('na linha de comando, --final falha (código 1) e lista o post com problema ou o domínio sem valor, sem gravar nada; sem --final só avisa, grava e não cria feed sem domínio', () => {
    const dir = mkdtempSync(join(tmpdir(), 'clarevo-final-posts-'));
    const pastas: string[] = [];
    try {
      writeFileSync(join(dir, 'cheios.json'), JSON.stringify(PREENCHIDOS));
      writeFileSync(join(dir, 'sem-dominio.json'), JSON.stringify({ ...PREENCHIDOS, DOMÍNIO: '' }));
      const legal = pasta(pastas);
      const ruins = posts(pastas, (a) => {
        a['2026-10-24-amanha.md'] = CABECALHO('2026-10-24');
        a['2026-10-22-sem-fontes.md'] = CABECALHO('2026-10-22', undefined, '');
        a['2026-10-22-tema.md'] = CABECALHO('2026-10-22', '{{tema:nao-existe:p1}}\n');
      });
      const saida = join(dir, 'site');
      const r = rodar(['--final', '--dados', join(dir, 'cheios.json'), '--legal', legal, '--novidades', ruins, '--referencia', REFERENCIA, '--saida', saida]);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('--final');
      expect(r.stderr).toContain('2026-10-24-amanha.md: a data (2026-10-24) é depois da data de referência (2026-10-23)');
      expect(r.stderr).toContain('2026-10-22-sem-fontes.md: falta "fontes" no cabeçalho');
      expect(r.stderr).toContain('{{tema:nao-existe:p1}} não existe no catálogo de Aprender');
      expect(existsSync(saida)).toBe(false);
      // Sem --final: avisos no console (stderr), e o site é gravado.
      const normal = rodar(['--dados', join(dir, 'cheios.json'), '--legal', legal, '--novidades', ruins, '--referencia', REFERENCIA, '--saida', saida]);
      expect(normal.status, normal.stderr).toBe(0);
      expect(normal.stderr).toContain('aviso: site-src/novidades/2026-10-22-sem-fontes.md: falta "fontes" no cabeçalho');
      expect(normal.stderr).toContain('aviso: site-src/novidades/2026-10-22-tema.md: {{tema:nao-existe:p1}} não existe no catálogo de Aprender');
      expect(normal.stdout).toMatch(/o --final ainda recusaria \d+ ponto/);
      expect(existsSync(join(saida, 'novidades', 'feed.xml'))).toBe(true);
      // A data de referência inválida na linha de comando é recusada.
      const ruim = rodar(['--dados', join(dir, 'cheios.json'), '--legal', legal, '--referencia', '2026-02-30', '--saida', join(dir, 'x')]);
      expect(ruim.status).toBe(1);
      expect(ruim.stderr).toContain('data de referência');
      // Posts bons e domínio sem valor: o --final recusa só por causa do domínio, mesmo com a política sem [DOMÍNIO]; sem --final, não há feed.
      const boa = posts(pastas);
      const saida2 = join(dir, 'site2');
      const semDominio = rodar(['--final', '--dados', join(dir, 'sem-dominio.json'), '--legal', legal, '--novidades', boa, '--referencia', REFERENCIA, '--saida', saida2]);
      expect(semDominio.status).toBe(1);
      expect(semDominio.stderr).toContain('[DOMÍNIO] sem valor em site/dados-da-empresa.json');
      expect(semDominio.stderr).not.toContain('Falta preencher');
      expect(existsSync(saida2)).toBe(false);
      const semFinal = rodar(['--dados', join(dir, 'sem-dominio.json'), '--legal', legal, '--novidades', boa, '--referencia', REFERENCIA, '--saida', saida2]);
      expect(semFinal.status, semFinal.stderr).toBe(0);
      expect(semFinal.stderr).toContain('aviso: o --final recusaria: [DOMÍNIO] sem valor');
      expect(existsSync(join(saida2, 'index.html'))).toBe(true);
      expect(existsSync(join(saida2, 'novidades', 'feed.xml'))).toBe(false);
      expect(existsSync(join(saida2, 'sitemap.xml'))).toBe(false);
      // Com o domínio, passa e grava o feed.
      const saida3 = join(dir, 'site3');
      const ok = rodar(['--final', '--dados', join(dir, 'cheios.json'), '--legal', legal, '--novidades', boa, '--referencia', REFERENCIA, '--saida', saida3]);
      expect(ok.status, ok.stderr).toBe(0);
      expect(existsSync(join(saida3, 'novidades', 'feed.xml'))).toBe(true);
    } finally {
      for (const p of pastas) rmSync(p, { recursive: true, force: true });
      rmSync(dir, { recursive: true, force: true });
    }
  }, 240_000);
});


describe('gráfico de recursos do Google Play (scripts/gerar-grafico-loja.js)', () => {
  const arquivo = join(ROOT, 'apps', 'app', 'assets', 'loja', 'grafico-recursos-1024x500.png');

  it('é um PNG de 1024 x 500, RGB de 24 bits (sem canal alfa), com até 1 MB', () => {
    const png = readFileSync(arquivo);
    expect(png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(png.readUInt32BE(16)).toBe(1024);
    expect(png.readUInt32BE(20)).toBe(500);
    expect(png[24], 'profundidade de bits').toBe(8);
    expect(png[25], 'tipo de cor 2 = RGB, sem alfa').toBe(2);
    expect(png.length).toBeLessThanOrEqual(1024 * 1024);
    expect(png.length).toBeGreaterThan(10_000);
  });

  it('usa o subtítulo aprovado da ficha, o logotipo reverso oficial e a captura da demonstração, sem texto de preço nem selos', () => {
    const script = readFileSync(join(ROOT, 'scripts', 'gerar-grafico-loja.js'), 'utf8');
    expect(script).toContain('clarevo-logotipo-reverso.svg');
    expect(script).toContain('apple-subtitulo');
    expect(script).toContain('01_resumo.png');
    // Nada importante no centro nem na faixa de baixo ao meio (onde o Google pode sobrepor o botão de vídeo): o script mede e recusa o desenho.
    expect(script).toContain('ZONAS_LIVRES');
    expect(script).toContain('faixa inferior central');
    expect(script).toContain('o desenho invade as zonas livres do gráfico');
    expect(existsSync(join(ROOT, 'docs', 'lojas', 'capturas', 'google-play-celular-1080x1920', '01_resumo.png'))).toBe(true);
    const ficha = readFileSync(join(ROOT, 'docs', 'lojas', 'ficha.md'), 'utf8');
    expect(ficha).toContain('Organize seu mês e aprenda');
    const textoDoGrafico = [...script.matchAll(/<(?:h1|p)>([^<]*)<\/p>|<h1>([^<]*)<\/h1>/g)].map((m) => m[1] ?? m[2]).join(' ');
    expect(textoDoGrafico).not.toMatch(/gr[áa]tis|melhor|baixe|download|R\$|ranking|#1|\bn[úu]mero 1\b/i);
  });
});

