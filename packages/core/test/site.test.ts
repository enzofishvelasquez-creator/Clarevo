/// <reference types="node" />
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { contrastRatio } from '../src/contrast';
import { formatDateBR } from '../src/dates';
import { GOALS_TEXT, GOAL_DEADLINE_SHORTCUTS, GOAL_MILESTONES } from '../src/goals';
import { GUIDE_ENTRIES } from '../src/guide';
import { INVESTMENT_TEXT } from '../src/investments';
import { LEARN_SECTIONS, LEARN_UI_TEXT, SEASONAL_CALENDAR, publishedTopics, relatedTopics } from '../src/learn';
import { ACCESS_TEXT, PLAN_NAME, SUBSCRIBE_OPEN, SUBSCRIPTION_SCREEN_TEXT, planPriceAmount } from '../src/plano';
import { SITE_CALCULATORS } from '../src/calculators';
import { INDICADORES_TEXT, INDICADOR_IDS, exibirIndicador, type RetratoIndicadores } from '../src/indicadores';
import { GLOSSARIO, INDICADORES_REVIEWED_ON, PAGINAS_INDICADORES, explicacoesDeMercado } from '../src/indicadores/conteudo';

/**
 * Site público (D-064 e D-065, `docs/22_SITE.md`): `scripts/gerar-site.js` gera o site em `site/` a partir de `docs/legal/*.md`, do
 * catálogo de Aprender e do guia de uso do `packages/core`, do conteúdo próprio de `site-src/` e dos modelos de `scripts/site/`. O
 * teste confere o conversor de Markdown; que as páginas gravadas estão em dia; a redação (sem travessão nem a expressão proibida);
 * a ausência de recurso de fora; a estrutura (um `h1`, títulos sem pular nível, links internos); que cada tema publicado de Aprender
 * tem página com o texto do catálogo, a data de revisão e as fontes; a Ajuda e a busca; as Novidades e o feed; os dados
 * estruturados; as capturas; o contraste das cores (a regra de `src/contrast.ts`); a recusa de `--final` enquanto sobrar marcador;
 * a imagem de compartilhamento e o gráfico de recursos do Google Play.
 */
/** A razão social como aparece no site gravado: o valor de `site/dados-da-empresa.json` ou, vazio, o marcador. */
function dadoDoSite(nome: string): string {
  const dados = JSON.parse(readFileSync(join(SITE, 'dados-da-empresa.json'), 'utf8')) as Record<string, string>;
  return dados[nome] || `[${nome}]`;
}
function razaoSocialDoSite(): string {
  return dadoDoSite('RAZÃO SOCIAL');
}

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SITE = join(ROOT, 'site');
const SCRIPT = join(ROOT, 'scripts', 'gerar-site.js');
/** Frases que a comunicação de bem-estar financeiro não pode usar (Playbook v2.2, "Bem-estar financeiro e saúde mental" e "Proposta empresarial e comunicação sobre NR 1"). */
const PROMESSAS_PROIBIDAS = /ninguém prospera no caos|não adianta fazer terapia|acaba com a ansiedade|app certificado|redução garantida de afastamentos|sua empresa adequada/i;
const require = createRequire(import.meta.url);

interface GerarOpcoes {
  legal?: string;
  dados?: Record<string, string | boolean>;
  arquivoDados?: string;
  referencia?: string;
  novidades?: string;
  retrato?: unknown;
  noticias?: string;
}
interface Gerado {
  arquivos: Map<string, string | Buffer>;
  avisos: string[];
  pendencias: Map<string, string[]>;
  problemasFinais: string[];
  posts: { arquivo: string; data: string; titulo: string; autoria: string; fontes: unknown[] }[];
  retrato: RetratoIndicadores;
  edicoes: { data: string; arquivo: string }[];
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

/**
 * Um retrato dos indicadores (D-106) para os testes que pedem um site sem pendência: números fictícios, do dia da referência dos posts. O
 * repositório não tem retrato (a rede deste ambiente não alcança o Banco Central), e sem ele o `--final` recusa.
 */
const RETRATO_DE_TESTE: RetratoIndicadores = {
  consultadoEm: '2026-11-12T16:00:00.000Z',
  valores: {
    selic: { valor: 12.25, data: '2026-11-12' },
    cdi: { valor: 12.15, data: '2026-11-11', dia: 0.045877 },
    ipca: { valor: 4.1, data: '2026-10-01', mes: 0.3 },
    poupanca: { valor: 0.6512, data: '2026-11-12', fim: '2026-12-12' },
    ptax: { valor: 5.1234, data: '2026-11-11' },
  },
};
const DIR_DO_RETRATO = mkdtempSync(join(tmpdir(), 'clarevo-retrato-'));
const ARQUIVO_DO_RETRATO = join(DIR_DO_RETRATO, 'retrato.json');
writeFileSync(ARQUIVO_DO_RETRATO, JSON.stringify(RETRATO_DE_TESTE));
afterAll(() => rmSync(DIR_DO_RETRATO, { recursive: true, force: true }));

/**
 * O gerador é puro: o resultado com os dados do repositório é calculado uma vez e vale para todos os grupos de teste. Com opções (um caso
 * de teste), entra o retrato de teste, a não ser que o caso traga outro.
 */
let geradoDoRepositorio: Gerado | null = null;
const gerarSite = (opcoes?: GerarOpcoes): Gerado => {
  if (opcoes) return gerador.gerarSite({ retrato: RETRATO_DE_TESTE, ...opcoes });
  geradoDoRepositorio ??= gerador.gerarSite();
  return geradoDoRepositorio;
};

// O mesmo `esc` do gerador (scripts/site/texto.js), com o espaço fixo entre "R$" e o valor (12/11/2026).
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/R\$ (?=\d)/g, 'R$\u00a0');

/** Os temas de Aprender que viram página: publicados, não legados, das seções organizar, juros e tempo. */
const TEMAS_DO_SITE = publishedTopics().filter((t) => !t.legacy && ['organizar', 'juros', 'tempo'].includes(t.section));
const TEMAS_DA_AJUDA = ['comecar', 'organizar', 'contas', 'familia', 'negocio', 'beneficio', 'privacidade', 'conta'];
const POSTS_INICIAIS = [
  'novidades/2026-10-23-conheca-a-clarevo.html',
  'novidades/2026-10-23-13o-salario-quando-cai-e-como-se-organizar.html',
  'novidades/2026-10-23-como-a-empresa-oferece-a-clarevo-sem-ver-suas-financas.html',
];
/** O texto de novembro de 2026, com o que chegou ao app (aba Investir, metas, Multa e juros com a fatura e as cinco abas). */
const POST_DE_NOVEMBRO = 'novidades/2026-11-12-o-que-chegou-ao-app-em-novembro.html';
const POSTS = [...POSTS_INICIAIS, POST_DE_NOVEMBRO];
/**
 * A data de referência dos posts nos testes: a do post mais novo do repositório (nenhum post pode ter data depois dela). Um post novo
 * pede a data dele aqui; o dia seguinte serve para o caso do post com data futura.
 */
const REFERENCIA_DOS_POSTS = '2026-11-12';
const DIA_SEGUINTE = '2026-11-13';
const PAGINAS_BASE = [
  'index.html',
  'comece.html',
  'app/index.html',
  'planos.html',
  'planos/individual.html',
  'planos/familia.html',
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
  'versoes.html',
  'licencas.html',
  '404.html',
];
/** As dez calculadoras do app (D-066), na ordem do catálogo, as duas que só o site mostra (D-106) e o índice delas. */
const CALCULADORAS = ['antes-de-financiar', 'parcelado-ou-a-vista', 'custo-por-ano', 'custo-da-divida', 'quitar-antes', 'multa-e-juros', 'plano-dividas', 'reserva', 'juntar-para-objetivo', 'dividir-contas', 'juros-compostos', 'rendimento-cdi'];
const PAGINAS_DE_CALCULADORAS = ['calculadoras/index.html', ...CALCULADORAS.map((c) => `calculadoras/${c}.html`)];
/** As páginas de mercado (D-106): o painel, uma por indicador, o glossário e as duas explicações. */
const PAGINAS_DE_MERCADO = [
  'indicadores/index.html',
  'indicadores/selic-hoje.html',
  'indicadores/cdi-hoje.html',
  'indicadores/ipca-12-meses.html',
  'indicadores/rendimento-da-poupanca.html',
  'indicadores/dolar-ptax-hoje.html',
  'indicadores/glossario.html',
  'indicadores/quando-a-selic-muda.html',
  'indicadores/como-ler-o-ipca.html',
];
const PAGINAS = [...PAGINAS_BASE, 'imprensa.html', ...PAGINAS_DE_CALCULADORAS, ...PAGINAS_DE_MERCADO, ...TEMAS_DO_SITE.map((t) => `aprender/${t.slug}.html`), ...POSTS];
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
const VERSOES = '# Versões de exemplo\n\n## Versão 1\n\nA primeira versão.\n';

function pastaDeExemplo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'clarevo-site-'));
  writeFileSync(join(dir, 'politica-de-privacidade.md'), EXEMPLO);
  writeFileSync(join(dir, 'termos-de-uso.md'), TERMOS.replace('## 1. Quem pode usar', '## Quem pode usar'));
  writeFileSync(join(dir, 'exclusao-de-conta.md'), EXCLUSAO);
  writeFileSync(join(dir, 'versoes.md'), VERSOES);
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
    // D-106: o painel e as páginas de indicador têm o script do painel, que pergunta uma vez ao próprio site (/api/indicadores).
    const noPainel = /^indicadores\/(index|selic-hoje|cdi-hoje|ipca-12-meses|rendimento-da-poupanca|dolar-ptax-hoje)\.html$/.test(nome);
    // D-115: a página inicial e O app têm o script dos vídeos (js/videos.js), que toca e pausa os vídeos e não pede nada a ninguém.
    const comVideos = ['index.html', 'app/index.html'].includes(nome);
    for (const m of html.matchAll(/<script\b([^>]*)>/gi)) {
      const ld = /^\s*type="application\/ld\+json"\s*$/.test(m[1]!);
      const busca = noAjuda && /^\s*src="busca\.js"\s+defer\s*$/.test(m[1]!);
      const calculadora = noCalc && /^\s*type="module"\s+src="calculadora\.js"\s*$/.test(m[1]!);
      const painel = noPainel && /^\s*src="painel\.js"\s+defer\s*$/.test(m[1]!);
      const videos = comVideos && /^\s*src="(\.\.\/)?js\/videos\.js"\s+defer\s*$/.test(m[1]!);
      // D-115: "Indicadores de hoje" na página inicial usa o script do painel; a página do feed RSS, o botão de copiar o endereço.
      const painelNoInicio = nome === 'index.html' && /^\s*src="indicadores\/painel\.js"\s+defer\s*$/.test(m[1]!);
      const copiar = nome === 'novidades/rss.html' && /^\s*src="\.\.\/js\/copiar\.js"\s+defer\s*$/.test(m[1]!);
      // D-115: o tema do site em todas as páginas, no <head>, sem defer (marca o <html> antes de a página aparecer).
      const tema = /^\s*src="(\/|(\.\.\/)*)js\/tema\.js"\s*$/.test(m[1]!);
      expect(ld || busca || calculadora || painel || videos || painelNoInicio || copiar || tema, `${nome}: script não permitido: ${m[0]}`).toBe(true);
    }
    expect(html, `${nome}: manipulador de evento`).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html, `${nome}: atributo style (a política de segurança não permite)`).not.toMatch(/\sstyle\s*=/i);
    expect(html, `${nome}: iframe ou objeto`).not.toMatch(/<(iframe|object|embed|audio)\b/i);
    // Vídeos (D-114 e D-115): só na página inicial e em O app, do próprio site, sem controles de player e sem `autoplay` (quem toca e pausa
    // é js/videos.js, só com o vídeo na tela), sem som, em repetição e sem baixar nada antes de aparecer.
    if (!['index.html', 'app/index.html'].includes(nome)) expect(html, `${nome}: vídeo fora da página inicial e de O app`).not.toMatch(/<video\b/i);
    for (const v of html.matchAll(/<video\b[^>]*>/gi)) {
      expect(v[0], `${nome}: vídeo`).toMatch(/^<video muted loop playsinline preload="none" width="\d+" height="\d+" poster="[^"]+\.png" aria-labelledby="[^"]+" aria-describedby="[^"]+">$/);
      expect(v[0], `${nome}: vídeo com controles ou autoplay`).not.toMatch(/\s(controls|autoplay)\b/);
    }
    // Formulário só nas páginas que o interruptor liga (D-066), e sempre um POST para o próprio site.
    if (opcoes.formularios?.includes(nome)) {
      for (const m of html.matchAll(/<form\b[^>]*>/gi)) expect(m[0], `${nome}: formulário`).toMatch(/^<form class="formulario" method="post" action="\/api\/(contato|newsletter)">$/);
    } else expect(html, `${nome}: formulário`).not.toMatch(/<form\b/i);
    for (const m of html.matchAll(/<input\b[^>]*>/gi)) {
      const campoDeFormulario = opcoes.formularios?.includes(nome) && /type="(text|email|checkbox)"/.test(m[0]);
      const enderecoDoFeed = nome === 'novidades/rss.html' && /^<input id="rss-endereco" type="text" readonly /.test(m[0]);
      const temaDoSite = /^<input type="radio" name="tema-site" value="(aparelho|claro|escuro)">$/.test(m[0]);
      expect(campoDeFormulario || enderecoDoFeed || temaDoSite || (noAjuda && /type="search"/.test(m[0])), `${nome}: campo que não é a busca da Ajuda nem de um formulário ligado: ${m[0]}`).toBe(true);
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
    // Até 160 caracteres, que é o que as buscas costumam mostrar (a de um tema ou de um post maior é cortada no fim de uma palavra).
    expect(descricao.length, `${nome}: descrição longa demais (${descricao.length})`).toBeLessThanOrEqual(160);
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
    for (const p of ['index.html', 'comece.html', 'app/index.html', 'planos.html', 'empresas/index.html', 'aprender/index.html', 'aprender/agenda.html', 'calculadoras/index.html', 'novidades/index.html', 'novidades/como-escrevemos.html', 'ajuda/index.html', 'seguranca.html', 'sobre.html', 'imprensa.html', 'suporte.html', 'privacidade.html', 'termos.html', 'excluir-conta.html']) {
      expect(rodape, `${nome}: rodapé sem ${p}`).toContain(`<a href="${visto(nome, p)}">`);
    }
    expect(rodape, `${nome}: rodapé`).toMatch(/·\s*CNPJ\s/);
    expect(['RAZÃO SOCIAL', 'Empresa Exemplo', razaoSocialDoSite()].some((r) => rodape.includes(r)), `${nome}: rodapé com a razão social`).toBe(true);
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
    // A página do feed RSS (D-115) existe só com domínio, como o feed.
    expect(gerado.arquivos.has('novidades/rss.html'), 'rss.html só com domínio').toBe(dominio !== '');
    expect(htmls.filter((n) => !PAGINAS.includes(n) && n !== 'novidades/rss.html')).toEqual([]);
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

  it('a lista de licenças (licencas.html) está em dia com o package-lock.json e tem a versão e a licença de cada pacote', () => {
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'gerar-licencas.js'), '--conferir'], { encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    const lista = JSON.parse(readFileSync(join(ROOT, 'site-src', 'licencas.json'), 'utf8')) as { nome: string; versao: string; licenca: string }[];
    expect(lista.length).toBeGreaterThan(100);
    for (const nome of ['react', 'react-native', 'expo', '@supabase/supabase-js']) expect(lista.some((i) => i.nome === nome), nome).toBe(true);
    expect(lista.every((i) => i.versao && i.licenca)).toBe(true);
    expect(html('licencas.html')).toContain('<td>react-native</td>');
  });

  it('cada página legal vem do Markdown quando ele existe e, senão, sai como espaço reservado com [A DEFINIR]', () => {
    const origem: Record<string, string> = { 'privacidade.html': 'politica-de-privacidade.md', 'termos.html': 'termos-de-uso.md', 'excluir-conta.html': 'exclusao-de-conta.md', 'versoes.html': 'versoes.md' };
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
    verificarPaginas(gerado.arquivos, dominio, [...PAGINAS, ...(dominio ? ['novidades/rss.html'] : [])]);
  });

  it('com os formulários ligados (D-066), todas as páginas, inclusive as de resposta, passam nas mesmas verificações e só as três páginas com formulário têm <form>', () => {
    const g = gerarSite({ dados: { ...PREENCHIDOS, formulario_contato: true, newsletter: true }, referencia: REFERENCIA_DOS_POSTS });
    const respostas = ['contato-enviado.html', 'contato-erro.html', 'novidades/receber.html', 'novidades/receber-enviado.html', 'novidades/receber-confirmado.html', 'novidades/receber-erro.html'];
    for (const nome of respostas) expect(g.arquivos.has(nome), nome).toBe(true);
    verificarPaginas(g.arquivos, 'exemplo.test', [...PAGINAS, 'novidades/rss.html', ...respostas], { formularios: ['empresas/index.html', 'novidades/index.html', 'novidades/receber.html'] });
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
      // Sem a 404 e com a página do feed RSS (D-115), que só existe com domínio.
      expect((sitemap.match(/<loc>/g) ?? []).length).toBe(PAGINAS.length);
      expect(sitemap).toContain('<loc>https://exemplo.test/novidades/rss</loc>');
      const robots = texto(g.arquivos.get('robots.txt'));
      expect(robots).toContain('Allow: /');
      expect(robots).toContain('Sitemap: https://exemplo.test/sitemap.xml');
      expect(robots).not.toContain('Disallow');
      const feed = texto(g.arquivos.get('novidades/feed.xml'));
      expect(feed).toContain('<link>https://exemplo.test/novidades/2026-10-23-conheca-a-clarevo</link>');
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
      const g = gerarSite({ legal: dir, dados: PREENCHIDOS, referencia: REFERENCIA_DOS_POSTS });
      verificarPaginas(g.arquivos, 'exemplo.test', [...PAGINAS, 'novidades/rss.html']);
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

  it('a página inicial traz a mensagem central, o apoio prático do app, recursos com vídeo e captura, a empresa que nunca vê finanças, a faixa de confiança, o app web e o aviso das lojas (sem selos)', () => {
    const h = html('index.html');
    // D-068: o título é a mensagem central do Manual v2.2 (seção 19); "Mais clareza para decidir" fica como apoio, e o subtexto diz o que a Clarevo faz.
    expect(h).toContain('<h1>Cuidar da vida financeira faz parte de cuidar de você.</h1>');
    expect(h).not.toContain('<h1>Mais clareza para decidir</h1>');
    expect(h).not.toContain('Organize seu mês e aprenda');
    const h1 = h.indexOf('<h1>Cuidar da vida financeira faz parte de cuidar de você.</h1>');
    const lead = '<p class="lead">A Clarevo ajuda a organizar o mês e acompanhar decisões financeiras pessoais e familiares, respeitando sua realidade.</p>';
    expect(h.indexOf(lead, h1)).toBeGreaterThan(h1);
    expect(h.indexOf('<p class="frase-apoio">Mais clareza para decidir.</p>', h1)).toBeGreaterThan(h.indexOf(lead, h1));
    // A chamada é "Conheça a Clarevo" e leva a O app.
    expect(h).toContain('<a class="botao botao-principal" href="app/index.html">Conheça a Clarevo</a>');
    // O resto fala de bem-estar financeiro com apoio prático, sem prometer resultado de saúde (Playbook v2.2, "Bem-estar financeiro e saúde mental").
    expect(h).toContain('Bem-estar financeiro, com apoio prático');
    // O aviso de saúde saiu do fim da página inicial em 19/11/2026 (pedido do Enzo): fica em Segurança e privacidade e em Para empresas.
    expect(h).not.toContain('não é atendimento de saúde');
    expect(h).not.toContain('eficácia clínica');
    expect(h).toContain('dificuldade financeira não é falta de disciplina');
    expect(h).not.toMatch(PROMESSAS_PROIBIDAS);
    // D-115: o que a Clarevo não faz virou a faixa curta da capa, um link só. Desde 19/11/2026, o link leva à página Segurança e privacidade
    // (o convite visível é "Segurança e privacidade"), e não ao bloco do que a Clarevo não faz, que lá ficou recolhido no fim.
    expect(h).not.toContain('id="nao-e"');
    const faixa = /<p class="confianca"><a href="seguranca\.html">[\s\S]*?<\/a><\/p>/.exec(h)?.[0] ?? '';
    for (const frase of ['Sem conexão com o seu banco', 'Não movimenta dinheiro nem oferece crédito', 'Não guarda os dados completos do cartão']) expect(faixa, frase).toContain(`${frase}</span>`);
    expect(faixa.match(/<a\b/g)?.length).toBe(1);
    expect(faixa).toContain('<span class="so-leitor">. Mais em </span><span class="confianca-mais">Segurança e privacidade<svg');
    expect(faixa).not.toContain('Ver o que a Clarevo não faz');
    expect(/<section class="capa[^"]*">[\s\S]*?<\/section>/.exec(h)![0]).toContain(faixa);
    const seg = html('seguranca.html');
    const naoFaz = /<details class="duvida" id="nao-faz">\n<summary>O que a Clarevo faz e não faz<\/summary>[\s\S]*?<\/details>/.exec(seg)?.[0] ?? '';
    for (const frase of ['Não é banco', 'Não movimenta dinheiro', 'Não oferece crédito', 'não recomenda produtos financeiros', 'Não é atendimento de saúde e não substitui o acompanhamento de profissionais', 'Não se conecta ao seu banco e não pede senha bancária', 'tudo o que aparece no app foi anotado ou importado por você ou pelas pessoas da sua Família']) expect(naoFaz, frase).toContain(frase);
    // Sem repetir em Segurança: o que não fica guardado continua só em "O que não guardamos", e "não se conecta ao seu banco" só neste bloco.
    expect(seg.match(/não se conecta ao seu banco/gi)?.length).toBe(1);
    expect(h).toContain('href="https://app.clarevo.app.br"');
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
    expect(h).toContain(dadoDoSite('E-MAIL DE CONTATO'));
    expect(h).not.toContain(dadoDoSite('E-MAIL DE SUPORTE'));
    // A empresa não vê quando a pessoa abre o app nem o que anota; vê a data do aceite e a do encerramento.
    expect(h).toContain('a do aceite do convite e a do encerramento');
    expect(h).toContain('Também não vê quando você abre o app nem o que você anota.');
    expect(h).not.toContain('nem o que você faz no app');
    // D-115: o herói com o vídeo do Resumo e três cartões com o vídeo do que mostram (anotar, contas e cartões, metas); Aprender continua
    // com a captura. Toda tela, captura ou vídeo, tem a mesma legenda (revisão de 18/11/2026).
    expect(h.match(/<figure class="celular">/g)?.length).toBe(1);
    expect(h).not.toContain('Dados fictícios de demonstração');
    expect(h).toMatch(/src="imagens\/aprender\.[0-9a-f]{10}\.png"/);
    expect(h.match(/<figure class="celular celular-video" data-video /g)?.length).toBe(4);
    expect(h.match(/<figcaption>Tela da demonstração, com dados fictícios<\/figcaption>/g)?.length).toBe(5);
    for (const alvo of ['app/index.html', 'empresas/index.html', 'aprender/index.html', 'ajuda/index.html', 'novidades/index.html', 'seguranca.html']) expect(h, alvo).toContain(`href="${alvo}"`);
    // Sem selos das lojas, depoimento, cliente, prêmio nem número de uso inventado. Preço e "grátis" só na seção Planos (16/11/2026).
    // D-115: o dólar PTAX de "Indicadores de hoje" vem do núcleo com "R$" ("R$ 5,7851"): só o cartão dele fica de fora da regra.
    const semPtax = h.replace(/<a class="cartao indicador" href="indicadores\/dolar-ptax-hoje\.html" data-indicador="ptax">[\s\S]*?<\/a>/, '');
    expect(semPtax).not.toBe(h);
    const foraDosPlanos = semPtax.replace(/<section[^>]*aria-labelledby="planos"[\s\S]*?<\/section>/, '');
    expect(foraDosPlanos).not.toBe(semPtax);
    expect(h).not.toMatch(/<img[^>]*(apple|google|store|play)/i);
    expect(foraDosPlanos).not.toMatch(/R\$\s?\d|gr[áa]tis/i);
    expect(h).not.toMatch(/depoimento|milh[õo]es|\d+\s*mil\s+(pessoas|usu)|melhor|pr[êe]mio|nossos clientes/i);
    expect(h).not.toMatch(/Download on the|App Store badge|Get it on/i);
  });

  // Planos (16/11/2026, pedido do Enzo): no início, com os nomes, os preços e as frases do núcleo; enquanto a assinatura não abre, a frase
  // da tela Assinatura diz que nada é cobrado até o lançamento.
  it('Planos: os dois planos com os textos do núcleo e, com a assinatura fechada, o aviso de que nada é cobrado até o lançamento', () => {
    const h = html('index.html');
    expect(h).toContain('<h2 id="planos">');
    expect(h).toContain(ACCESS_TEXT.notOpenYet);
    expect(SUBSCRIBE_OPEN).toBe(false);
    const { conteudoPlanos } = require(join(ROOT, 'scripts', 'site', 'paginas', 'inicio.js')) as {
      conteudoPlanos: (planos: unknown, u: (d: string) => string) => string;
    };
    const { catalogo } = require(join(ROOT, 'scripts', 'site', 'catalogo.js')) as { catalogo: () => { PLANOS: { aberta: boolean } } };
    const { PLANOS } = catalogo();
    expect(PLANOS.aberta).toBe(SUBSCRIBE_OPEN);
    const secao = conteudoPlanos(PLANOS, (d) => d);
    expect(secao).toContain(`<h2 id="planos">${ACCESS_TEXT.plansTitle}</h2>`);
    expect(secao.match(/<h3>/g)?.length).toBe(2);
    for (const plano of ['individual', 'familiar'] as const) {
      expect(secao).toContain(`<h3>${PLAN_NAME[plano]}</h3>`);
      // O site junta "R$" e o número com espaço sem quebra (esc), para o preço não partir entre linhas.
      expect(secao).toContain(`<span class="preco-valor">${planPriceAmount(plano).replace("R$ ", "R$\u00a0")}</span>${SUBSCRIPTION_SCREEN_TEXT.perMonth}</p>`);
    }
    for (const p of ACCESS_TEXT.plans) expect(secao).toContain(p.who);
    expect(secao).toContain(ACCESS_TEXT.plansNote);
    // Os Termos sem âncora: o texto jurídico muda com o advogado, e a página de exemplo dos testes não tem o item 12.
    expect(secao).toContain('href="termos.html"');
    expect(secao).toContain('href="ajuda/conta.html#guia-assinatura"');
    expect(html('ajuda/conta.html')).toContain('id="guia-assinatura"');
    expect(secao).not.toMatch(/[\u2013\u2014]/);
    // Com a assinatura aberta, o aviso sai.
    expect(conteudoPlanos({ ...PLANOS, aberta: true }, (d) => d)).not.toContain(ACCESS_TEXT.notOpenYet);
  });

  // Espaço Negócio no site (D-115, a partir de D-113 e docs/52): o recurso em O app, com a tela da demonstração e o link da Ajuda, o
  // cartão de "Para quem é" na página inicial e a página Planos. O texto do site descreve a tela de visão geral sem o nome dela, que muda no app ("Seu negócio").
  it('Espaço Negócio: o recurso em O app (com a tela do cenário "negocio" nos dois temas), o cartão na página inicial e a Ajuda', () => {
    const app = html('app/index.html');
    const recurso = /<article class="recurso" id="negocio" aria-labelledby="t-negocio">[\s\S]*?<\/article>/.exec(app)?.[0] ?? '';
    const guia = GUIDE_ENTRIES.find((x) => x.id === 'negocio')!;
    expect(recurso).toContain('<h3 id="t-negocio">Espaço Negócio</h3>');
    expect(recurso).toContain(`<p>${esc(guia.purpose)}</p>`);
    // Revisão de 18/11/2026: o Espaço Negócio não é diferença entre os planos (o app não limita por plano), com o mesmo texto neutro em
    // O app, na página inicial e em Planos.
    expect(recurso).toContain('<li>Incluído na assinatura: um negócio por pessoa, sem custo a mais. É leve: a Clarevo não faz contabilidade nem cálculo de impostos.</li>');
    expect(recurso).toContain('Retirada para o Pessoal');
    expect(recurso).toContain('Numa tela própria do negócio, quanto entrou, quanto saiu e quanto sobrou');
    expect(recurso).toContain('href="../ajuda/negocio.html#guia-negocio"');
    // Só no tema claro, como as outras telas de O app (revisão: um celular escuro entre os claros parecia defeito).
    expect(recurso).toMatch(/<img src="\.\.\/imagens\/negocio\.[0-9a-f]{10}\.png" alt="Tela do negócio Sacolé da Maria/);
    expect(recurso).not.toContain('<picture>');
    expect([...gerado.arquivos.keys()].some((k) => k.startsWith('imagens/negocio-escura.'))).toBe(false);
    // Depois de Família.
    expect(app.indexOf('id="t-negocio"')).toBeGreaterThan(app.indexOf('id="t-familia"'));
    // A Ajuda tem a entrada e a busca acha.
    expect(html('ajuda/negocio.html')).toContain('id="guia-negocio"');
    expect(html('ajuda/index.html')).toContain('href="negocio.html"');
    expect(html('ajuda/indice.json')).toContain('guia-negocio');
    // O cartão de "Para quem é" na página inicial, com o link para o recurso em O app.
    const inicio = html('index.html');
    const paraQuem = /<section[^>]*aria-labelledby="para-quem"[\s\S]*?<\/section>/.exec(inicio)![0];
    expect(paraQuem.match(/<article class="cartao">/g)?.length).toBe(3);
    expect(paraQuem).toContain('<h3>Para quem tem um negócio</h3>');
    expect(paraQuem).toContain('<a href="app/index.html#negocio">Veja o Espaço Negócio</a>');
    expect(paraQuem).toContain('Incluído na assinatura: um negócio por pessoa, sem custo a mais.');
    for (const p of ['planos/individual.html', 'planos/familia.html']) expect(html(p), p).toContain('Incluído na assinatura: um negócio por pessoa, sem custo a mais.');
    for (const p of ['index.html', 'app/index.html', 'planos.html', 'planos/individual.html', 'planos/familia.html']) expect(html(p), p).not.toMatch(/plano Individual inclui um negócio|Inclui o Espaço Negócio|Incluído no plano Individual/);
  });

  // O aviso de saúde (revisado no pacote do advogado, seção j) sem mudar o texto, fora do começo das páginas (D-115, retorno de quem testa:
  // "O negativo não deveria estar logo no começo da página. Isso é advertência, não propaganda."). Desde 19/11/2026 (pedido do Enzo), sai do
  // fim da página inicial e de Sobre e fica em Segurança e privacidade, dentro da pergunta recolhida "O que a Clarevo faz e não faz", e na
  // nota de ressalvas de Para empresas.
  it('o aviso de saúde, com o mesmo texto, fica na pergunta recolhida de Segurança e na nota de ressalvas de Para empresas, e não na página inicial nem em Sobre', () => {
    const { AVISO_DE_SAUDE } = require(join(ROOT, 'scripts', 'site', 'paginas', 'seguranca.js')) as { AVISO_DE_SAUDE: string };
    expect(AVISO_DE_SAUDE).toBe('A Clarevo não é atendimento de saúde e não promete resultado financeiro nem efeito sobre saúde mental, sono, produtividade ou tranquilidade. A vida financeira é uma dimensão do bem-estar, entre outras, e o app não tem eficácia clínica comprovada.');
    expect(readFileSync(join(ROOT, 'docs', 'legal', 'resumo-para-advogado.md'), 'utf8')).toContain('"A Clarevo não é atendimento de saúde e não promete resultado financeiro nem efeito sobre saúde mental, sono, produtividade ou tranquilidade."');
    const inicio = html('index.html');
    const bemEstar = /<section[^>]*aria-labelledby="bem-estar"[\s\S]*?<\/section>/.exec(inicio)![0];
    expect(bemEstar).not.toMatch(/não promete|O que a Clarevo não/);
    expect(bemEstar).toContain('<p class="texto-bloco">Um app para anotar o que entra e o que sai');
    for (const p of ['index.html', 'sobre.html', 'app/index.html', 'planos.html']) {
      expect(html(p), p).not.toContain('eficácia clínica');
      expect(html(p), p).not.toContain('class="aviso-final"');
    }
    expect(html('estilo.css')).not.toContain('.aviso-final');
    // Em Segurança: uma vez só, dentro da pergunta recolhida (fechada) "O que a Clarevo faz e não faz", depois da nota sobre organização e educação financeira.
    const seg = html('seguranca.html');
    expect(seg.split(esc(AVISO_DE_SAUDE)).length - 1).toBe(1);
    const naoFaz = /<details class="duvida" id="nao-faz">[\s\S]*?<\/details>/.exec(seg)?.[0] ?? '';
    expect(naoFaz).toContain(`<p>${esc(AVISO_DE_SAUDE)}</p>`);
    expect(naoFaz.indexOf(esc(AVISO_DE_SAUDE))).toBeGreaterThan(naoFaz.indexOf('A Clarevo é uma ferramenta de organização e de educação financeira.'));
    expect(naoFaz).not.toMatch(/<details[^>]*\sopen/);
    const empresas = html('empresas/index.html');
    const primeira = /<section[^>]*aria-labelledby="bem-estar"[\s\S]*?<\/section>/.exec(empresas)![0];
    expect(primeira).not.toMatch(/não promete|não está incluído|não fazem parte/);
    // Revisão de 18/11/2026: as ressalvas ficam numa nota curta depois de "Como funciona", e não em cartões no bloco da NR-1.
    const nr1 = /<section[^>]*aria-labelledby="nr-1"[\s\S]*?<\/section>/.exec(empresas)![0];
    expect(nr1).not.toMatch(/<h3>O que não está incluído<\/h3>|não é atendimento de saúde/);
    const comoFunciona = /<section[^>]*aria-labelledby="como-funciona"[\s\S]*?<\/section>/.exec(empresas)![0];
    const nota = /<p class="nota nota-ressalvas">[\s\S]*?<\/p>/.exec(comoFunciona)?.[0] ?? '';
    for (const t of ['Atendimento psicológico, mentoria, palestras, laudos, PGR e relatórios de risco não fazem parte do que a Clarevo oferece hoje.', 'não promete redução de absenteísmo, de estresse nem de adoecimento', esc(AVISO_DE_SAUDE)]) expect(nota, t).toContain(t);
    expect(comoFunciona.indexOf('nota-ressalvas')).toBeGreaterThan(comoFunciona.indexOf('</ol>'));
    // Os Termos de uso não falam de saúde (seção 2, "O que a Clarevo não é", lista banco, dinheiro, crédito, conexão com banco, recomendação
    // e consultoria): o aviso continua só no site, revisado no pacote do advogado. Se os Termos ganharem uma cláusula de saúde, revise este teste.
    expect(readFileSync(join(ROOT, 'docs', 'legal', 'termos-de-uso.md'), 'utf8')).not.toMatch(/saúde/i);
  });

  // Indicadores mais fáceis de achar (D-115): "Indicadores de hoje" na página inicial, com o retrato e o script do painel, e o cartão dos
  // indicadores em Aprender e em Novidades. O menu principal não ganhou "Indicadores": não cabe sem quebrar a linha a partir de 1120 px.
  it('Indicadores de hoje na página inicial (os cinco números, a hora e a fonte, o aviso e o caminho para o painel) e o cartão em Aprender e em Novidades', () => {
    const inicio = html('index.html');
    const secao = /<section[^>]*aria-labelledby="indicadores"[\s\S]*?<\/section>/.exec(inicio)?.[0] ?? '';
    expect(secao).toContain('<h2 id="indicadores">Indicadores de hoje</h2>');
    expect(secao).toMatch(/<div class="indicadores-inicio" data-painel data-consultado="[^"]*">/);
    for (const id of ['selic', 'cdi', 'ipca', 'poupanca', 'ptax']) expect(secao, id).toContain(`data-indicador="${id}"`);
    expect(secao).toContain('Fonte: Banco Central do Brasil.');
    expect(secao).toContain('<p class="nota">Conteúdo educativo. Não é recomendação nem análise de valores mobiliários.</p>');
    expect(secao).toContain('<a class="botao botao-principal" href="indicadores/index.html">Ver os indicadores e o glossário</a>');
    // Logo depois de "O que o app faz".
    expect(inicio.indexOf('id="indicadores"')).toBeGreaterThan(inicio.indexOf('id="telas"'));
    expect(inicio.indexOf('id="indicadores"')).toBeLessThan(inicio.indexOf('id="para-quem"'));
    expect(inicio).toContain('<script src="indicadores/painel.js" defer></script>');
    for (const [pagina, alvo] of [['aprender/index.html', '../indicadores/index.html'], ['novidades/index.html', '../indicadores/index.html']] as const) {
      expect(html(pagina), pagina).toContain(`<a class="cartao cartao-calculadoras" href="${alvo}"><span class="titulo-cartao">Indicadores oficiais</span>`);
    }
    const cabecalho = /<header class="topo">([\s\S]*?)<\/header>/.exec(inicio)![1]!;
    expect(cabecalho).not.toContain('Indicadores');
  });

  // Planos (D-115, 18/11/2026; separados por plano em 19/11/2026, pedido do Enzo: clicar num plano mostra o que aquele plano inclui, e não os
  // dois). Os cartões da página inicial levam à página de cada plano; planos.html é um resumo curto, com os dois cartões e o que muda; cada
  // página de plano tem o nome, o preço, para quem é, o que só ele tem, todos os recursos (com os links), como funciona a assinatura e os
  // caminhos para o outro plano e para o resumo, com os textos do núcleo.
  it('Planos: os cartões da página inicial levam à página de cada plano; planos.html resume os dois; cada página mostra só o próprio plano, com os recursos e a assinatura', () => {
    const PAGINAS_DOS_PLANOS = { individual: 'planos/individual.html', familiar: 'planos/familia.html' } as const;
    const inicio = html('index.html');
    const secao = /<section[^>]*aria-labelledby="planos"[\s\S]*?<\/section>/.exec(inicio)![0];
    for (const plano of ['individual', 'familiar'] as const) {
      const cartao = new RegExp(`<article class="cartao plano plano-link">\\n<h3>${PLAN_NAME[plano]}</h3>[\\s\\S]*?</article>`).exec(secao)?.[0] ?? '';
      expect(cartao, plano).toContain(`<a href="${PAGINAS_DOS_PLANOS[plano]}">Ver o que o plano ${PLAN_NAME[plano]} inclui</a>`);
      expect(cartao.match(/<a\b/g)?.length, plano).toBe(1);
    }
    expect(inicio).not.toMatch(/planos\.html#/);

    // planos.html: o resumo curto, sem a lista de recursos.
    const h = html('planos.html');
    expect(h).toContain('<h1>Planos da Clarevo</h1>');
    expect([...h.matchAll(/<h2 id="([^"]+)">/g)].map((m) => m[1])).toEqual(['comparar']);
    expect(h).not.toMatch(/id="recursos"|O que os dois planos incluem|grupos-recursos|recursos-plano/);
    for (const plano of ['individual', 'familiar'] as const) {
      const cartao = new RegExp(`<article class="cartao plano plano-link">\\n<h3>${PLAN_NAME[plano]}</h3>[\\s\\S]*?</article>`).exec(h)?.[0] ?? '';
      expect(cartao, plano).toContain(`<span class="preco-valor">${planPriceAmount(plano).replace('R$ ', 'R$\u00a0')}</span>${SUBSCRIPTION_SCREEN_TEXT.perMonth}</p>`);
      expect(cartao, plano).toContain(ACCESS_TEXT.plans.find((p) => p.plan === plano)!.who);
      expect(cartao, plano).toContain(`<p class="ver-plano"><a href="${PAGINAS_DOS_PLANOS[plano]}">Ver o plano ${PLAN_NAME[plano]}</a></p>`);
      expect(cartao.match(/<a\b/g)?.length, plano).toBe(1);
    }
    expect(h).toContain('Uma assinatura só, paga pela pessoa titular.');
    for (const t of [ACCESS_TEXT.plansNote, ACCESS_TEXT.notOpenYet]) expect(h, t).toContain(esc(t));
    // Preço só nos dois cartões; fora deles, nenhum "R$" com número.
    const foraDosCartoes = h.replace(/<section[^>]*aria-labelledby="comparar"[\s\S]*?<\/section>/, '');
    expect(foraDosCartoes).not.toBe(h);
    expect(foraDosCartoes).not.toMatch(/R\$\s?\d/);
    expect(h).not.toMatch(/[\u2013\u2014]|faz\w*\s+sentido|melhor|depoimento|milh[õo]es/i);

    // A página de cada plano.
    const NOMES_DOS_RECURSOS = ['Anotar e Resumo', 'Contas a pagar', 'Cartões e faturas', 'Calendário do mês', 'Importar extrato e fatura', 'Ler nota, comprovante e boleto', 'Metas e reserva', 'Investir', 'Aprender, simulador e calculadoras', 'Anotar pelo Telegram', 'Espaço Negócio', 'Tema claro ou escuro', 'Ocultar valores', 'Exportar meus dados'];
    const ESPECIFICOS = {
      individual: ['Para uma pessoa: a assinatura é sua.', 'O seu Pessoal, que só você vê.'],
      familiar: ['Até 6 pessoas na mesma Família, contando a pessoa titular.', 'Uma assinatura só, paga pela pessoa titular. Quem recebe o convite para a Família não paga.', 'Convite por link, de uso único e válido por 7 dias, com o papel de quem anota e vê ou de quem só vê.', 'Cada pessoa continua com o próprio Pessoal, que só ela vê', 'Quem é titular muda o papel de cada pessoa, passa a titularidade ou encerra a Família, e quem quiser sai.'],
    };
    for (const plano of ['individual', 'familiar'] as const) {
      const arquivo = PAGINAS_DOS_PLANOS[plano];
      const outro = plano === 'individual' ? 'familiar' : 'individual';
      const p = html(arquivo);
      const capa = /<section class="capa[^"]*">[\s\S]*?<\/section>/.exec(p)![0];
      expect(capa, arquivo).toContain('<p class="migalha"><a href="../planos.html">Planos</a></p>');
      expect(capa, arquivo).toContain(`<h1>Plano ${PLAN_NAME[plano]}</h1>`);
      expect(capa, arquivo).toContain(`<p class="preco-capa"><span class="preco-valor">${planPriceAmount(plano).replace('R$ ', 'R$\u00a0')}</span>${SUBSCRIPTION_SCREEN_TEXT.perMonth}</p>`);
      expect(capa, arquivo).toContain(`<p class="lead">${esc(ACCESS_TEXT.plans.find((x) => x.plan === plano)!.who)}</p>`);
      // Preço só na capa, e só o deste plano.
      expect(p.replace(capa, ''), arquivo).not.toMatch(/R\$\s?\d/);
      expect(p, arquivo).not.toContain(planPriceAmount(outro).replace('R$ ', 'R$\u00a0'));
      expect([...p.matchAll(/<h2 id="([^"]+)">/g)].map((m) => m[1]), arquivo).toEqual(plano === 'familiar' ? ['para-quem', 'inclui', 'assinatura', 'perguntas'] : ['para-quem', 'inclui', 'assinatura']);
      // O que só este plano tem, e nada do que só o outro tem.
      const paraQuem = /<h2 id="para-quem">[\s\S]*?<\/section>/.exec(p)![0];
      for (const t of ESPECIFICOS[plano]) expect(paraQuem, `${arquivo}: ${t}`).toContain(esc(t));
      for (const t of ESPECIFICOS[outro]) expect(p, `${arquivo} sem: ${t}`).not.toContain(esc(t));
      if (plano === 'individual') expect(p).not.toMatch(/titular|convite por link|Até 6 pessoas|papel de quem/i);
      // Todos os recursos do app, com o link para a Ajuda ou O app, que existe.
      const recursos = /<h2 id="inclui">[\s\S]*?<\/section>\n<\/div>/.exec(p)![0];
      const links = [...recursos.matchAll(/<li><a href="([^"]+)">([^<]+)<\/a>: /g)].map((m): [string, string] => [m[1]!, m[2]!]);
      expect(links.map(([, n]) => n), arquivo).toEqual(NOMES_DOS_RECURSOS);
      for (const [destino] of links) {
        expect(destino, destino).toMatch(/^\.\.\//);
        const [alvoRel, ancora] = destino.split('#');
        const alvo = html(posix.normalize(posix.join('planos', alvoRel!)));
        expect(alvo, destino).toBeTruthy();
        if (ancora) expect(alvo, destino).toContain(`id="${ancora}"`);
      }
      // O Espaço Negócio incluído na assinatura, sem prometer negócio compartilhado com a Família (D-116).
      expect(recursos).toContain('Incluído na assinatura: um negócio por pessoa, sem custo a mais.');
      expect(p).not.toMatch(/negócio (da|com a|em) Família|compartilh|sócio/i);
      // Como funciona a assinatura, com os textos do núcleo.
      const assinatura = /<h2 id="assinatura">[\s\S]*?<\/section>/.exec(p)![0];
      for (const t of [ACCESS_TEXT.plansNote, ACCESS_TEXT.readOnlyWhat, ACCESS_TEXT.howToPay, ACCESS_TEXT.benefitNote, ACCESS_TEXT.notOpenYet]) expect(assinatura, `${arquivo}: ${t}`).toContain(esc(t));
      expect(assinatura).toContain('Com Pix, você paga um mês por vez.');
      // No fim: o outro plano e o resumo.
      const fim = PAGINAS_DOS_PLANOS[outro].replace('planos/', '');
      expect(p, arquivo).toContain(`<p class="acoes"><a class="botao botao-principal" href="${fim}">Ver o plano ${PLAN_NAME[outro]}</a> <a class="botao botao-suave" href="../planos.html">Comparar os planos</a></p>`);
      expect(p).not.toMatch(/[\u2013\u2014]|faz\w*\s+sentido|melhor|depoimento|milh[õo]es/i);
    }
    // No Família, as perguntas não repetem o resto da página e respondem direto.
    const familia = html('planos/familia.html');
    const perguntas = /<h2 id="perguntas">[\s\S]*?<\/section>/.exec(familia)![0];
    expect(perguntas).toContain('Quem eu convido precisa ter conta?');
    expect(perguntas).toContain('O que acontece com o que eu anotei se eu sair da Família?');
    // O nome de quem saiu, como o app mostra (FAMILY_TEXT.exMember: "Nina (saiu da Família)").
    expect(perguntas).toContain('com o seu primeiro nome e "saiu da Família" ao lado');
    for (const t of [ACCESS_TEXT.plansNote, ACCESS_TEXT.readOnlyWhat, ACCESS_TEXT.benefitNote, 'Quem recebe o convite para a Família não paga.']) expect(perguntas, t).not.toContain(esc(t));
    expect(familia).toContain('Investir</a>: O que você já investe, só no seu Pessoal');
    // No rodapé de todas as páginas, o resumo dos planos; as páginas dos planos entram no mapa do site.
    expect(html('sobre.html')).toContain('<a href="planos.html">Planos</a>');
    const g = gerarSite({ dados: PREENCHIDOS, referencia: REFERENCIA_DOS_POSTS });
    for (const loc of ['/planos', '/planos/individual', '/planos/familia']) expect(texto(g.arquivos.get('sitemap.xml')), loc).toContain(`<loc>https://exemplo.test${loc}</loc>`);
  });

  it('Comece aqui (o link da bio, D-067): o que é a Clarevo em duas frases, o estado real do acesso e os seis caminhos, sem espera, sem data, sem script e sem rastreamento', () => {
    const h = html('comece.html');
    const principal = /<main[\s\S]*<\/main>/.exec(h)![0];
    expect(h).toContain('<h1>Comece aqui</h1>');
    // O que é o Clarevo, em duas frases (o primeiro parágrafo de apresentação), e a frase de marca depois da explicação.
    const lead = /<p class="lead">([^<]+)<\/p>/.exec(h)![1]!;
    expect(lead.split(/(?<=\.)\s+/).filter(Boolean).length).toBe(2);
    expect(lead).toContain('aplicativo de finanças pessoais e da família');
    expect(lead).toContain('Não é banco, não movimenta dinheiro e não recomenda produtos financeiros.');
    expect(h.indexOf('Mais clareza para decidir.</p>')).toBeGreaterThan(h.indexOf(lead));
    // O estado do acesso de hoje (cadastro de pessoas reais só no piloto, D-064), sem lista de espera nem data.
    expect(h).toContain('A Clarevo está em fase de testes. A versão para pessoas e empresas abre no piloto; acompanhe as <a href="novidades/index.html">Novidades</a>.');
    expect(principal).not.toMatch(/lista de espera|cadastre-se|inscreva|em breve|a partir de \d|dia \d|janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|gr[áa]tis|teste gratuito/i);
    // Os seis caminhos, nesta ordem; a demonstração é o endereço combinado, com noopener, e nenhum link leva parâmetro de rastreamento.
    const links = [...h.matchAll(/<a class="cartao" href="([^"]+)"[^>]*><span class="titulo-cartao">([^<]+)<\/span>/g)].map((m) => [m[2], m[1]]);
    expect(links).toEqual([
      ['O app', 'app/index.html'],
      ['Ver a demonstração', 'https://demo.clarevo.app.br'],
      ['Aprender', 'aprender/index.html'],
      ['Calculadoras', 'calculadoras/index.html'],
      ['Para empresas', 'empresas/index.html'],
      ['Ajuda', 'ajuda/index.html'],
    ]);
    expect(h).toContain('<a class="cartao" href="https://demo.clarevo.app.br" rel="noopener noreferrer">');
    expect(h).toContain('Abra o app com dados fictícios, no navegador. Nada é gravado fora do seu aparelho.');
    for (const m of h.matchAll(/\s(?:href|src)="([^"]*)"/g)) expect(m[1], `link com parâmetro: ${m[1]}`).not.toMatch(/[?&]|utm_|fbclid|gclid|igshid/i);
    // Nenhum script (só dados estruturados, se houver, e o tema do site, que toda página tem desde D-115), nenhum formulário e nenhum
    // recurso de fora.
    expect([...h.matchAll(/<script\b([^>]*)>/g)].filter((m) => !/application\/ld\+json|^ src="js\/tema\.js"$/.test(m[1]!))).toEqual([]);
    expect(h).not.toMatch(/<form\b/);
    // O rodapé leva a ela, e ela entra no mapa do site quando há domínio.
    expect(html('index.html')).toContain('<a href="comece.html">Comece aqui</a>');
    const g = gerarSite({ dados: PREENCHIDOS, referencia: REFERENCIA_DOS_POSTS });
    expect(texto(g.arquivos.get('sitemap.xml'))).toContain('<loc>https://exemplo.test/comece</loc>');
  });

  it('O app passeia por todos os recursos pedidos, cada um com a captura da demonstração e o texto do guia de uso do app', () => {
    const h = html('app/index.html');
    expect(h).toContain('<h1>A Clarevo por dentro</h1>');
    for (const titulo of ['Resumo do mês', 'Anotar gasto e recebimento', 'Leitura de nota fiscal e de comprovante', 'Contas a pagar e gastos fixos', 'Cartões e faturas', 'Metas e reserva', 'Investir', 'Família', 'Aprender e calculadoras', 'Lembretes']) expect(h, titulo).toContain(`>${titulo}</h`);
    for (const id of ['resumo', 'anotar-gasto', 'nota-fiscal', 'contas-a-pagar', 'cartoes', 'metas', 'investimentos', 'familia', 'aprender']) {
      const e = GUIDE_ENTRIES.find((x) => x.id === id)!;
      expect(h, id).toContain(esc(e.purpose));
    }
    // D-115: seis recursos e o cartão do tema com o vídeo do que mostram; os outros (com o Espaço Negócio) com a captura da demonstração.
    const figuras = h.match(/<figure class="celular">/g)?.length ?? 0;
    expect(figuras).toBe(7);
    expect(h).not.toContain('Dados fictícios de demonstração');
    expect(h.match(/<figure class="celular celular-video" data-video /g)?.length).toBe(7);
    expect(h.match(/<figcaption>Tela da demonstração, com dados fictícios<\/figcaption>/g)?.length).toBe(figuras + 7);
    // "E mais": os Lembretes, sem tela, num cartão só de texto na largura toda; os três cartões com celular numa linha só.
    const mais = /<h2 id="mais">E mais<\/h2>[\s\S]*?<\/section>/.exec(h)![0];
    expect(mais).toMatch(/^<h2 id="mais">E mais<\/h2>\n<div class="grade grade-texto">\n<article class="cartao sem-captura">\n<h3>Lembretes<\/h3>/);
    expect(/<div class="mini">[\s\S]*?\n<\/div>/.exec(mais)![0].match(/<article class="cartao">/g)?.length).toBe(3);
    expect(h).toContain('Na web, hoje');
    // "Cada texto vem do guia" não é verdade (os pontos são do site): só a explicação de abertura vem do guia do app.
    expect(h).not.toContain('Cada texto vem do guia');
    expect(h).toContain('A explicação de abertura de cada recurso é a do guia de uso do próprio app');
    // O que o app não faz: a faixa curta da capa, com link para o bloco completo de Segurança e privacidade (D-115).
    expect(h).not.toContain('id="nao-faz"');
    expect(h).toContain('<p class="confianca"><a href="../seguranca.html">');
    // Lembretes são do app para celular: a única captura que existe é a da web, que só avisa que eles não existem, então não há imagem.
    expect(h).toContain('>Lembretes</h3>');
    expect(h).not.toContain('imagens/lembretes.png');
    expect(gerado.arquivos.has('imagens/lembretes.png')).toBe(false);
    expect(h).toContain('Em breve');
    expect(h).toContain('Em breve na App Store e no Google Play.');
    expect(h).not.toMatch(/<img[^>]*(apple|google|store|play)/i);
    expect(h).not.toMatch(/gr[áa]tis|R\$\s?\d+,\d{2}\s*(por|\/)\s*m[eê]s/i);
  });

  it('Para empresas abre com a proposta de bem-estar financeiro, diz o que não está incluído, traz o bloco da NR-1 e explica o benefício, o que a empresa vê e nunca vê (como no código e nos textos jurídicos), o painel só na web, o fim do benefício e a apresentação, sem preço', () => {
    const h = html('empresas/index.html');
    // D-068: o herói é o do Manual v2.2 (seção 19), com o subtexto sem "colaboradores" (linguagem neutra) e a chamada "Solicitar apresentação".
    expect(h).toContain('<h1>Bem-estar financeiro também faz parte do cuidado com sua equipe.</h1>');
    expect(h).toContain('<p class="lead">Conheça a proposta da Clarevo para apoiar a organização financeira das pessoas da equipe e integrar esse cuidado ao programa de bem-estar da empresa.</p>');
    expect(h).toContain('<a class="botao botao-principal" href="#apresentacao">Solicitar apresentação</a>');
    expect(h).toContain('<h2 id="apresentacao">Solicitar apresentação</h2>');
    expect(h).not.toContain('Falar sobre um piloto');
    // Nada de psicologia, mentoria, palestras, laudos, PGR ou relatórios de risco como incluídos: a página diz que não fazem parte.
    expect(h).toContain('Atendimento psicológico, mentoria, palestras, laudos, PGR e relatórios de risco não fazem parte do que a Clarevo oferece hoje.');
    expect(h).toContain('não promete redução de absenteísmo, de estresse nem de adoecimento');
    // O bloco da NR-1 (Manual v2.2, seção 12): a norma não exige app financeiro, a proposta é ação complementar, a contratação isolada não comprova nada.
    expect(h).toContain('<h2 id="nr-1">Bem-estar financeiro e a NR-1</h2>');
    for (const frase of [
      'A NR-1 trata dos fatores de risco psicossociais relacionados ao trabalho, dentro do gerenciamento de riscos ocupacionais.',
      'A NR-1 não exige a contratação de um aplicativo financeiro.',
      'pode ser considerada como ação complementar, conforme a avaliação técnica da empresa.',
      'Contratar a Clarevo, sozinha, não comprova atendimento à norma.',
      'não substitui as ações sobre a organização do trabalho, como sobrecarga e assédio',
      'O endividamento pessoal não deve ser classificado automaticamente como risco ocupacional',
      'não equivale a uma avaliação clínica individual',
      'Veja como a proposta se relaciona com a norma.',
      'Portaria MTE nº 1.419/2024',
      'consultada em 24/10/2026.',
    ]) expect(h, frase).toContain(frase);
    expect(h).not.toContain('pode e o que não pode dizer');
    expect(h).not.toContain('por si só, um risco ocupacional');
    expect(h).toContain('href="https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-1" rel="noopener noreferrer"');
    expect(h).not.toMatch(PROMESSAS_PROIBIDAS);
    expect(h).not.toMatch(/colaboradores/i);
    for (const frase of ['Como funciona', 'A empresa vê', 'A empresa nunca vê', 'O painel, só na web', 'Quando o benefício acaba', 'Solicitar apresentação']) expect(h, frase).toContain(frase);
    expect(h).toContain('os e-mails que ela mesma convidou');
    expect(h).toContain('convite enviado, convite cancelado, ativa ou encerrada');
    for (const nunca of ['gastos, recebimentos e valores', 'categorias, metas, contas a pagar e cartões', 'a Família da pessoa', 'números somados de finanças']) expect(h, nunca).toContain(nunca);
    expect(h).toContain('de 1 a 500 por vez');
    expect(h).toContain('link de uso único');
    expect(h).toContain('a Clarevo não envia e-mail de convite');
    // O fim do benefício: só o que o código garante (nada é apagado; 30 dias de acesso pleno, o prazo de `BENEFIT_GRACE_DAYS` e da migração
    // de empresas) e, depois, o acesso da própria pessoa (assinatura paga, D-083, migração 0023). Não existe plano gratuito.
    expect(h).toContain('O acesso pleno continua por 30 dias, contados do encerramento da licença ou do fim do contrato');
    expect(h).toContain('Depois desses 30 dias, vale o acesso da própria pessoa: com assinatura, tudo continua; sem assinatura, a conta fica só para ver e exportar.');
    expect(h).not.toMatch(/plano gratuito|leitura do histórico/i);
    expect(h).toContain('Nada é apagado por causa do fim do benefício');
    // A empresa vê as datas do convite, do aceite ("Ativa desde") e do encerramento; não vê quando a pessoa abre o app nem o que anota.
    expect(h).toContain('a de quando a pessoa aceitou ("Ativa desde") e a do encerramento');
    expect(h).toContain('quando a pessoa abre o app e o que ela anota nele: o painel mostra só a data em que ela aceitou o convite e a do encerramento');
    expect(h).not.toContain('o painel não mostra quem entrou no app');
    expect(h).toContain(dadoDoSite('E-MAIL DE CONTATO'));
    expect(h).toContain('Ainda não há tabela de preços');
    expect(h).toMatch(/src="\.\.\/imagens\/empresa-painel\.[0-9a-f]{10}\.png"/);
    expect(h).toContain('Tela da demonstração, com dados fictícios');
    expect(h).not.toMatch(/R\$\s?\d|por vaga|gr[áa]tis|nossos clientes|depoimento|\d+\s*empresas/i);
  });

  it('Segurança e privacidade traz o que guardamos, o que não guardamos, quem vê, a empresa, a exclusão e o link para a política', () => {
    const h = html('seguranca.html');
    for (const frase of ['O essencial', 'O que guardamos', 'Dados que a Clarevo não guarda', 'Quem vê os seus dados', 'Como protegemos', 'Sobre este site', 'Como excluir a conta']) expect(h, frase).toContain(frase);
    // Desde 19/11/2026 (pedido do Enzo): a parte visível começa pelo essencial, quem vê, como protegemos e o que guardamos; o que a Clarevo faz
    // e não faz, os dados que ela não guarda, este site e como excluir a conta ficam em perguntas recolhidas (fechadas) no fim, com o texto
    // inteiro, e só a linha dos links fica visível depois delas.
    const principal = /<main[\s\S]*<\/main>/.exec(h)![0];
    expect([...principal.matchAll(/<h2 id="([^"]+)">/g)].map((m) => m[1])).toEqual(['essencial', 'quem-ve', 'protecao', 'guardamos', 'detalhes']);
    const detalhes = /<h2 id="detalhes">Mais detalhes<\/h2>[\s\S]*?<\/section>/.exec(h)![0];
    expect([...detalhes.matchAll(/<details class="duvida" id="([^"]+)">\n<summary>([^<]+)<\/summary>/g)].map((m) => [m[1], m[2]])).toEqual([
      ['nao-faz', 'O que a Clarevo faz e não faz'],
      ['nao-guardamos', 'Dados que a Clarevo não guarda'],
      ['este-site', 'Sobre este site'],
      ['excluir', 'Como excluir a conta'],
    ]);
    expect(h).not.toMatch(/<details[^>]*\sopen/);
    expect(detalhes).not.toMatch(/class="cartao|nunca-ve|ve-nao-ve|lista-nao-faz/);
    expect(detalhes).toMatch(/<\/details>\n<\/div>\n<p>Leia também a <a href="privacidade\.html">Política de privacidade<\/a>, os <a href="termos\.html">Termos de uso<\/a> e as respostas da <a href="ajuda\/privacidade\.html">Ajuda sobre privacidade e segurança<\/a>\. Dúvidas sobre os seus dados: /);
    const duvida = (id: string) => new RegExp(`<details class="duvida" id="${id}">[\\s\\S]*?</details>`).exec(h)?.[0] ?? '';
    expect(duvida('excluir')).toContain('No app, abra Conta e, no último item, toque em "Excluir minha conta". Você digita EXCLUIR e o seu Pessoal é apagado de verdade, na hora.');
    expect(duvida('excluir')).toContain('Quem não consegue entrar no app pede pela página <a href="excluir-conta.html">Excluir conta</a>.');
    expect(duvida('este-site')).toContain('O site guarda no navegador só o tema que você escolher no rodapé (claro ou escuro), se escolher um: essa escolha nunca sai do seu aparelho e serve só para mostrar o tema escolhido.');
    for (const nao of ['número completo de cartão, código de segurança (CVV) e validade', 'CPF da nota fiscal', 'dados do comprovante de Pix ou de pagamento', 'fotos e imagens da câmera', 'No Android, a leitura do QR Code usa um componente do Google (ML Kit) incluído no app']) expect(duvida('nao-guardamos'), nao).toContain(nao);
    // A página pública de exclusão de conta (as lojas pedem) continua no rodapé de todas as páginas.
    expect(/<footer[\s\S]*<\/footer>/.exec(h)![0]).toContain('<a href="excluir-conta.html">Excluir conta</a>');
    // Nenhum link do site leva a uma pergunta recolhida: nem os de outras páginas (seguranca.html#...) nem os de dentro da página (#...).
    for (const [arquivo, conteudo] of gerado.arquivos) {
      if (!arquivo.endsWith('.html')) continue;
      expect(texto(conteudo), arquivo).not.toMatch(/seguranca(\.html)?#(nao-faz|nao-guardamos|este-site|excluir)"/);
    }
    expect(h).not.toMatch(/href="#(nao-faz|nao-guardamos|este-site|excluir)"/);
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

  it('Sobre fala do que move a Clarevo e de quem está por trás, sem nomes de pessoas, fotos nem números de uso', () => {
    const h = html('sobre.html');
    for (const frase of ['Clareza', 'Sem anúncio', 'Sem venda de dados', 'Sem recomendar produtos']) expect(h, frase).toContain(frase);
    expect(h).toContain(razaoSocialDoSite());
    expect(h).toContain(dadoDoSite('E-MAIL DE CONTATO'));
    expect(h).not.toMatch(/<img[^>]*(foto|retrato|equipe)/i);
    expect(h).not.toMatch(/fundador|fundadora|CEO|\d+\s*mil\s+(pessoas|usu)|milh[õo]es/i);
  });

  it('Suporte continua sendo a página de contato que as lojas citam, com a Ajuda e as perguntas mais comuns', () => {
    const h = html('suporte.html');
    expect(h).toContain(dadoDoSite('E-MAIL DE SUPORTE'));
    expect(h).toContain(dadoDoSite('E-MAIL DE PRIVACIDADE'));
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

describe('site público: Investir, metas, segurança, títulos e acabamento (12/11/2026)', () => {
  const gerado = gerarSite();
  const html = (nome: string) => texto(gerado.arquivos.get(nome));
  const recurso = (id: string) => new RegExp(`<article class="recurso" id="${id}"[\\s\\S]*?</article>`).exec(html('app/index.html'))?.[0] ?? '';
  const descricaoDe = (nome: string) => /<meta name="description" content="([^"]+)">/.exec(html(nome))?.[1] ?? '';
  const tituloDe = (nome: string) => /<title>([^<]+)<\/title>/.exec(html(nome))?.[1] ?? '';

  it('O app tem a seção Investir, com o texto do guia do app, os três pontos e a captura da demonstração, sem recomendar investimento', () => {
    const h = html('app/index.html');
    const secao = recurso('investir');
    const guia = GUIDE_ENTRIES.find((x) => x.id === 'investimentos')!;
    expect(INVESTMENT_TEXT.tabLabel).toBe('Investir');
    expect(secao).toContain('<h3 id="t-investir">Investir</h3>');
    expect(secao).toContain(`<p>${esc(guia.purpose)}</p>`);
    for (const ponto of [
      'Você registra o que aplicou, os aportes, os resgates, os rendimentos e o valor de hoje, como aparecem no seu extrato.',
      'A rentabilidade dos meses fechados aparece ao lado do CDI e do IPCA do mesmo período, com dados públicos do Banco Central.',
      'Não é recomendação de investimento, e os investimentos ficam só no seu Pessoal.',
    ]) expect(secao, ponto).toContain(`<li>${ponto}</li>`);
    // Os pontos dizem o que o guia do app diz, nos passos dele.
    const passos = guia.steps.join(' ');
    expect(passos).toContain('compara os meses fechados com o CDI e o IPCA do mesmo período, com os dados públicos do Banco Central. Não é recomendação de investimento.');
    expect(passos).toContain('os investimentos ficam só no seu Pessoal');
    expect(INVESTMENT_TEXT.whoSees).toContain('ficam só no seu Pessoal');
    // Desde 18/11/2026 (D-115), o vídeo de Investir (o card e o Desempenho) no lugar da captura, com a legenda da demonstração; o passo a
    // passo fica na Ajuda. A captura antiga saiu do site (nenhuma página a usava).
    expect(secao).toMatch(/<figure class="celular celular-video" data-video data-titulo="Investir">/);
    expect(secao).toContain('Tela da demonstração, com dados fictícios');
    expect(secao).toContain('href="../ajuda/organizar.html#guia-investimentos"');
    expect([...gerado.arquivos.keys()].some((k) => /^imagens\/investimentos\.[0-9a-f]{10}\.png$/.test(k))).toBe(false);
    // Vem depois de Metas e antes de Família, na ordem das abas, e a página diz quais são as cinco.
    expect(h.indexOf('<article class="recurso" id="metas"')).toBeGreaterThan(0);
    expect(h.indexOf('<article class="recurso" id="investir"')).toBeGreaterThan(h.indexOf('<article class="recurso" id="metas"'));
    expect(h.indexOf('<article class="recurso" id="familia"')).toBeGreaterThan(h.indexOf('<article class="recurso" id="investir"'));
    expect(h).toContain('O app tem cinco abas: Resumo, Movimentos, Metas, Investir e Aprender.');
    // "Quatro abas" só aparece no texto do guia sobre a tela Análises (as abas dela), nunca sobre as abas do app.
    expect(h.match(/quatro abas/gi) ?? []).toHaveLength(GUIDE_ENTRIES.find((x) => x.id === 'analises')!.purpose.includes('quatro abas') ? 1 : 0);
    // Nada de recomendar produto financeiro, de preço nem de convite a cadastrar.
    expect(secao).not.toMatch(/recomendamos|invista|vale a pena|rende mais|gr[áa]tis|cadastre|assine|R\$\s?\d/i);
  });

  it('Metas, em O app e na página inicial, cita os atalhos de prazo, o ritmo no cartão da meta e os marcos de 25%, 50% e 75%, com os nomes do app', () => {
    const secao = recurso('metas');
    expect(GOALS_TEXT.form.deadlineShortcuts).toBe('Atalhos de prazo');
    expect(GOAL_DEADLINE_SHORTCUTS.map((s) => s.label)).toEqual(['6 meses', '1 ano', '2 anos', '5 anos']);
    expect(secao).toContain('Os atalhos de prazo (6 meses, 1 ano, 2 anos ou 5 anos) preenchem a data por você.');
    expect(GOALS_TEXT.pace.onTrack).toBe('No ritmo do plano');
    expect(secao).toContain('O cartão de cada meta com valor planejado por mês mostra o ritmo: se os aportes acompanham o plano e quanto falta.');
    expect([...GOAL_MILESTONES]).toEqual([25, 50, 75]);
    expect(secao).toContain('Ao passar de 25%, 50% e 75% da meta, uma frase curta marca o avanço.');
    expect(html('index.html')).toContain('com atalhos de prazo, o ritmo do plano no cartão de cada meta e os marcos de 25%, 50% e 75%');
    // O tom não cobra: o site não repete "meses atrás do plano".
    expect(`${secao} ${html('index.html')}`).not.toMatch(/atr[áa]s do plano|atrasad/i);
  });

  it('as áreas do app nas descrições incluem Investir: O app, a Ajuda e "O que é" do kit de imprensa', () => {
    expect(descricaoDe('app/index.html')).toContain('cinco abas da Clarevo: Resumo, Movimentos, Metas, Investir e Aprender');
    expect(descricaoDe('ajuda/organizar.html')).toContain('metas, investimentos, simulador e calculadoras');
    expect(html('ajuda/index.html')).toContain('metas, investimentos, simulador e calculadoras');
    expect(html('imprensa.html')).toContain('<li><strong>O que é:</strong> um aplicativo e uma versão web para organizar finanças pessoais e da família, em cinco abas (Resumo, Movimentos, Metas, Investir e Aprender), com educação financeira com fonte.</li>');
    expect(html('index.html')).toContain('acompanhar metas e o que você já investe');
  });

  it('em O app, "Anotar gasto" e a leitura de nota e de comprovante mostram telas diferentes, cada uma com o seu texto alternativo', () => {
    const { IMAGENS } = require(join(ROOT, 'scripts', 'site', 'imagens.js')) as { IMAGENS: { id: string; origem: string; alt: string }[] };
    const anotar = IMAGENS.find((i) => i.id === 'anotar')!;
    const nota = IMAGENS.find((i) => i.id === 'nota')!;
    expect(anotar.origem).toMatch(/02_anotar_gasto\.png$/);
    expect(nota.origem).toMatch(/09_comprovante_lido\.png$/);
    expect(nota.alt).toBe('Tela Anotar gasto depois de ler um comprovante de Pix: o aviso do que foi lido e a descrição e o valor já preenchidos, para conferir antes de salvar.');
    expect(nota.alt).not.toBe(anotar.alt);
    expect(recurso('nota')).toContain(`alt="${esc(nota.alt)}"`);
    expect(recurso('nota')).toContain('>Leitura de nota fiscal e de comprovante</h3>');
    // Anotar gasto mostra o vídeo de anotar um gasto (D-115); a captura "anotar" continua no kit de imprensa.
    expect(recurso('anotar')).toContain('data-titulo="Anotar um gasto"');
    expect(html('imprensa.html')).toContain(`alt="${esc(anotar.alt)}"`);
    // As duas capturas não são a mesma imagem (os pixels diferem) e toda captura do site tem origem que existe.
    const daImagem = (id: string) => gerado.arquivos.get([...gerado.arquivos.keys()].find((k) => k.startsWith(`imagens/${id}.`))!) as Buffer;
    const a = png.decodificar(daImagem('anotar'));
    const b = png.decodificar(daImagem('nota'));
    expect(a.rgb.equals(b.rgb)).toBe(false);
    for (const i of IMAGENS) expect(existsSync(join(ROOT, i.origem)), i.origem).toBe(true);
    expect(new Set(IMAGENS.map((i) => i.origem)).size).toBe(IMAGENS.length);
  });

  it('Segurança e privacidade espelha a política em investimentos, assinatura e pagamento e anotar por mensagem, sem preço nem período de teste', () => {
    const h = html('seguranca.html');
    const guardamos = /<h2 id="guardamos">[\s\S]*?<\/section>/.exec(h)?.[0] ?? '';
    const cartao = (titulo: string) => new RegExp(`<article class="cartao">\\s*<h3>${titulo.replace(/[()]/g, '\\$&')}</h3>\\s*<p>([\\s\\S]*?)</p>`).exec(guardamos)?.[1] ?? '';
    const politica = readFileSync(join(ROOT, 'docs', 'legal', 'politica-de-privacidade.md'), 'utf8');
    // Investimentos: o que a seção 3.2 lista, e só no Pessoal (a empresa não vê, seção 7).
    const investimentos = cartao('Investimentos, só no seu Pessoal');
    // Com a ficha ampliada (D-099): os campos opcionais e o tipo do rendimento, nas duas. Com D-104: a descrição livre, a condição da taxa e a taxa que muda numa data.
    const campos = 'o nome que você escolhe, o tipo e, se você preencher, o tipo exato, uma descrição livre, o nome da instituição, como rende, a taxa e a condição dela, a data em que a taxa muda e a taxa de depois, como em "120% do CDI até 31/03/2027, depois 100%", o vencimento e quando pode resgatar; os aportes, os resgates, os rendimentos recebidos com o tipo de cada um e os valores do extrato';
    expect(politica).toContain(`os investimentos que você registra (${campos})`);
    expect(investimentos).toContain(campos);
    expect(investimentos).toContain('ficam só no seu Pessoal: ninguém da Família vê, nem a empresa que oferece o benefício');
    expect(politica).toContain('A empresa não vê valores, categorias, metas, investimentos, contas, cartões');
    expect(h).toContain('Nunca vê valores, categorias, metas, investimentos, contas, cartões');
    // Assinatura e pagamento: a seção 3.9, sem o preço nem o período de teste, que o site ainda não comunica.
    const assinatura = cartao('Assinatura e pagamento');
    expect(politica).toContain('A situação do seu acesso: o plano (Individual ou Família), até quando ele vale, por onde foi assinado');
    expect(politica).toContain('Número do cartão, código de segurança, validade, dados do Pix, CPF ou endereço de cobrança. Esses dados ficam com a loja ou com o serviço de pagamento da web, pelas regras de cada um.');
    expect(assinatura).toContain('A situação do seu acesso: o plano, até quando ele vale, por onde foi assinado e um resumo matemático que identifica a assinatura.');
    expect(assinatura).toContain('Nunca guardamos número de cartão, código de segurança, validade, dados do Pix, CPF nem endereço de cobrança: esses dados ficam com a loja ou com o serviço de pagamento, pelas regras de cada um.');
    // Anotar por mensagem: a seção 3.8 (opcional; só resumos; nunca o texto, o nome nem o usuário).
    const mensagem = cartao('Anotar por mensagem (opcional)');
    expect(politica).toContain('**Não guardamos o texto das mensagens, o seu nome nem o seu usuário no Telegram.**');
    expect(politica).toContain('De cada mensagem tratada, por 30 dias, guardamos um resumo');
    expect(politica).toContain('Ao desligar, o vínculo é apagado na hora');
    expect(mensagem).toContain('Não guardamos o texto das mensagens, o seu nome nem o seu usuário.');
    expect(mensagem).toContain('por 30 dias');
    expect(mensagem).toContain('Ao desligar, o vínculo é apagado na hora.');
    // A regra vigente do site: nada de preço, "grátis", "14 dias" nem convite a assinar ou cadastrar.
    expect(h).not.toMatch(/R\$\s?\d|gr[áa]tis|14 dias|teste gratuito|assine|cadastre-se|por m[êe]s/i);
    expect(guardamos.match(/<article class="cartao">/g)).toHaveLength(8);
  });

  it('a página inicial diz o que é a Clarevo numa linha acima do título, sem mudar a mensagem central, e a grade de atalhos tem seis cartões em três colunas', () => {
    const h = html('index.html');
    expect(h).toContain('<p class="sobretitulo">App de finanças pessoais e da família</p>\n<h1>Cuidar da vida financeira faz parte de cuidar de você.</h1>');
    expect(html('estilo.css')).toContain('.sobretitulo{');
    const mais = /<h2 id="mais">[\s\S]*?<\/section>/.exec(h)?.[0] ?? '';
    expect(mais).toContain('<div class="grade grade-3">');
    const cartoes = [...mais.matchAll(/<a class="cartao" href="([^"]+)"><span class="titulo-cartao">([^<]+)<\/span>/g)].map((m) => [m[2], m[1]]);
    expect(cartoes).toEqual([
      ['Aprender', 'aprender/index.html'],
      ['Agenda financeira', 'aprender/agenda.html'],
      ['Calculadoras', 'calculadoras/index.html'],
      ['Novidades', 'novidades/index.html'],
      ['Ajuda', 'ajuda/index.html'],
      ['Segurança e privacidade', 'seguranca.html'],
    ]);
    // Seis cartões enchem as linhas em três colunas (computador), em duas (tablet) e em uma (celular): nenhum fica sozinho.
    expect(cartoes.length % 3).toBe(0);
    expect(cartoes.length % 2).toBe(0);
  });

  it('títulos e descrições: O app e Sobre têm assunto no título, e as descrições mais longas foram encurtadas sem perder a mensagem', () => {
    expect(tituloDe('app/index.html')).toBe('O app por dentro: recursos e telas · Clarevo');
    expect(tituloDe('sobre.html')).toBe('Sobre a Clarevo: o que nos move e quem está por trás');
    expect(tituloDe('index.html')).toBe('Clarevo: bem-estar financeiro e mais clareza para decidir');
    expect(descricaoDe('index.html')).toBe('Cuidar da vida financeira faz parte de cuidar de você. Um app de finanças pessoais e da família para organizar o mês e decidir com mais clareza.');
    expect(descricaoDe('empresas/index.html')).toBe('Bem-estar financeiro também faz parte do cuidado com sua equipe. A Clarevo entra no programa de bem-estar, e a empresa nunca vê as finanças das pessoas.');
    expect(descricaoDe('comece.html')).toMatch(/^Cuidar da vida financeira faz parte de cuidar de você\. /);
    // Um resumo de post maior que 160 caracteres é cortado no fim de uma palavra, com reticências; o resumo inteiro continua na página.
    const conheca = 'novidades/2026-10-23-conheca-a-clarevo.html';
    expect(descricaoDe(conheca).length).toBeLessThanOrEqual(160);
    expect(descricaoDe(conheca)).toMatch(/\S\.\.\.$/);
    expect(html(conheca)).toContain('<p class="lead">A Clarevo é uma solução de bem-estar financeiro, apoiada por um aplicativo de finanças pessoais e da família. Veja o que ela faz, o que não faz e onde já dá para usar.</p>');
    // Nenhum título de página se repete.
    const titulos = [...gerado.arquivos.keys()].filter((k) => k.endsWith('.html')).map(tituloDe);
    expect(titulos.filter((t, i) => titulos.indexOf(t) !== i)).toEqual([]);
  });

  it('acabamento: rodapé em duas colunas no celular, área de toque dos links soltos, letras de 14 px e guarda longa das fontes, das capturas e da marca', () => {
    const css = html('estilo.css');
    // O rodapé começa em duas colunas (celular) e volta à grade automática a partir de 48rem.
    expect(css).toContain('.rodape-grade{display:grid;gap:1.5rem 1.25rem;grid-template-columns:repeat(2,minmax(0,1fr));margin-bottom:1.5rem}');
    expect(css).toMatch(/@media \(min-width:48rem\)\{\s*\.rodape-grade\{[^}]*grid-template-columns:repeat\(auto-fit,/);
    // Migalhas, "Voltar para..." e "Fonte N": 44 px de área de toque sem mudar a altura da linha.
    expect(css).toContain('.migalha a,.voltar a,.fatos li a{display:inline-block;padding:.65rem .3rem;margin:-.65rem -.3rem}');
    expect(html('aprender/decimo-terceiro.html')).toContain('<p class="voltar"><a href="index.html">Voltar para Aprender</a></p>');
    expect(html(POST_DE_NOVEMBRO)).toContain('<p class="voltar"><a href="index.html">Voltar para Novidades</a></p>');
    // 14 px (era 13 px) nas linhas de apoio dos cartões e nas etiquetas.
    expect(/\.tema-meta\{[^}]*\}/.exec(css)?.[0]).toContain('font-size:.875rem');
    expect(/\.etiqueta\{[^}]*\}/.exec(css)?.[0]).toContain('font-size:.875rem');
    expect(css).not.toContain('font-size:.8125rem');
    // _headers: o bloco de segurança continua igual, e as fontes, as capturas e a marca ganham guarda longa no navegador.
    const h = html('_headers');
    expect(h).toContain('/*\n  Content-Security-Policy: default-src \'none\';');
    expect(h).toContain('/fontes/*\n  Cache-Control: public, max-age=31536000, immutable\n');
    expect(h).toContain('/imagens/*\n  Cache-Control: public, max-age=31536000, immutable\n');
    expect(h).toContain('/marca/*\n  Cache-Control: public, max-age=2592000\n');
    // O worker continua levando só os cabeçalhos do bloco /* (a guarda longa é dos arquivos estáticos).
    expect(html('_worker.js')).not.toContain('max-age=2592000');
    const { servir } = require(join(ROOT, 'scripts', 'site', 'servir.js')) as { servir: unknown };
    expect(typeof servir).toBe('function');
    const { lerCabecalhosPorCaminho } = require(join(ROOT, 'scripts', 'site', 'servir.js')) as { lerCabecalhosPorCaminho: (pasta: string) => (caminho: string) => Record<string, string> };
    const doCaminho = lerCabecalhosPorCaminho(SITE);
    expect(doCaminho('/fontes/Manrope_500Medium.ttf')).toEqual({ 'Cache-Control': 'public, max-age=31536000, immutable' });
    expect(doCaminho('/imagens/resumo.1a2b3c4d5e.png')).toEqual({ 'Cache-Control': 'public, max-age=31536000, immutable' });
    expect(doCaminho('/marca/clarevo-simbolo.svg')).toEqual({ 'Cache-Control': 'public, max-age=2592000' });
    expect(doCaminho('/estilo.css')).toEqual({});
    expect(doCaminho('/index.html')).toEqual({});
  });

  it('o sitemap traz <lastmod> só onde o conteúdo tem data própria (posts e temas de Aprender), e gerar de novo dá o mesmo arquivo', () => {
    const g = gerarSite({ dados: PREENCHIDOS, referencia: REFERENCIA_DOS_POSTS });
    const sitemap = texto(g.arquivos.get('sitemap.xml'));
    expect(problemasDeXml(sitemap)).toEqual([]);
    expect(sitemap).toContain('<url><loc>https://exemplo.test/novidades/2026-11-12-o-que-chegou-ao-app-em-novembro</loc><lastmod>2026-11-12</lastmod></url>');
    expect(sitemap).toContain('<url><loc>https://exemplo.test/novidades/2026-10-23-conheca-a-clarevo</loc><lastmod>2026-10-23</lastmod></url>');
    expect(sitemap).toContain('<url><loc>https://exemplo.test/novidades/</loc><lastmod>2026-11-12</lastmod></url>');
    for (const t of TEMAS_DO_SITE) expect(sitemap, t.slug).toContain(`<url><loc>https://exemplo.test/aprender/${t.slug}</loc><lastmod>${t.reviewedOn}</lastmod></url>`);
    const maisRecente = TEMAS_DO_SITE.map((t) => t.reviewedOn).sort().pop();
    expect(sitemap).toContain(`<url><loc>https://exemplo.test/aprender/</loc><lastmod>${maisRecente}</lastmod></url>`);
    // As páginas sem data própria ficam sem <lastmod> (nunca a data da geração).
    for (const semData of ['/', '/app/', '/empresas/', '/seguranca', '/calculadoras/', '/ajuda/', '/privacidade']) expect(sitemap, semData).toContain(`<url><loc>https://exemplo.test${semData}</loc></url>`);
    // Nenhum <lastmod> depois do conteúdo mais novo: o post mais novo ou o tema revisado por último (os de investimentos, D-093, são
    // de 13/11/2026, um dia depois do post de novembro; a data de revisão de um tema nunca passa de hoje, R6).
    // As explicações de mercado (D-106) têm a data de revisão delas (17/11/2026).
    expect(sitemap).toContain(`<url><loc>https://exemplo.test/indicadores/como-ler-o-ipca</loc><lastmod>${INDICADORES_REVIEWED_ON}</lastmod></url>`);
    const conteudoMaisNovo = [REFERENCIA_DOS_POSTS, maisRecente!, INDICADORES_REVIEWED_ON].sort().pop()!;
    for (const m of sitemap.matchAll(/<lastmod>([^<]*)<\/lastmod>/g)) {
      expect(conteudo.dataExiste(m[1]!), m[1]).toBe(true);
      expect(m[1]! <= conteudoMaisNovo, `lastmod no futuro: ${m[1]}`).toBe(true);
    }
    // Estável: outra geração, com a data de hoje como referência, dá o mesmo sitemap.
    expect(texto(gerarSite({ dados: PREENCHIDOS, referencia: '2030-01-01' }).arquivos.get('sitemap.xml'))).toBe(sitemap);
    expect(texto(gerador.gerarSite({ dados: PREENCHIDOS }).arquivos.get('sitemap.xml'))).toBe(sitemap);
    // Três gerações do site inteiro: com a máquina ocupada passam dos 5 segundos padrão.
  }, 60_000);
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
          expect(pagina).toContain(`id="fonte-${i + 1}">Regra da própria Clarevo<`);
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

  it('a Ajuda tem os oito temas (os sete pedidos e o Espaço Negócio, D-113), com a lista completa visível sem JavaScript', () => {
    const index = h('ajuda/index.html');
    expect(index).toContain('<h1>Ajuda</h1>');
    for (const titulo of ['Começar', 'Anotar e organizar', 'Contas e cartões', 'Família', 'Espaço Negócio', 'Benefício da empresa', 'Privacidade e segurança', 'Conta e acesso']) expect(index, titulo).toContain(titulo);
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
      expect(r, t.slug).toContain(`Revisado em ${formatDateBR(t.reviewedOn)}. Fonte: Regra da própria Clarevo.`);
      for (const s of t.sources) if (s.kind === 'clarevo') for (const ref of s.refs) expect(r, `${t.slug}: ${ref}`).not.toContain(ref);
    }
    expect(JSON.stringify(indice)).not.toMatch(/\bD-\d{3}\b/);
    // A busca acha o passo a passo da conta e as hipóteses pelo texto.
    expect(indice.find((i) => i.i === 'tema-diferenca')!.x).toContain('Ver a conta');
  });

  it('a Ajuda não fala em plano gratuito: depois dos 30 dias de acesso pleno, vale o acesso da própria pessoa (assinatura paga, D-083)', () => {
    const b = h('ajuda/beneficio.html');
    expect(b).toContain('o acesso pleno continua por 30 dias. Depois desses 30 dias, vale o acesso da própria pessoa: com assinatura, tudo continua; sem assinatura, a conta fica só para ver e exportar. Nada é apagado.');
    expect(b).not.toMatch(/plano gratuito/i);
    expect(b).toContain('Também não vê quando você abre o app nem o que você anota.');
    expect(b).toContain('as datas (como a do aceite do convite e a do encerramento)');
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
    for (const nome of POSTS_INICIAIS) {
      const pagina = h(nome);
      expect(pagina, nome).toContain('<time datetime="2026-10-23">23 de outubro de 2026</time> · Equipe Clarevo');
      // D-115: as fontes em grupos ("Na Clarevo" e "Fontes oficiais"), sem numeração e sem lista dentro de lista.
      const fontes = /<h2 id="fontes">Fontes<\/h2>([\s\S]*?)<p class="revisao">/.exec(pagina)?.[1] ?? '';
      expect((fontes.match(/<li/g) ?? []).length, `${nome}: fontes`).toBeGreaterThanOrEqual(2);
      expect(fontes, nome).not.toMatch(/<ol\b|<li>(?:(?!<\/li>)[\s\S])*<(ul|ol)\b/);
      expect(fontes, nome).toMatch(/^\n<h3 id="fontes-clarevo">Na Clarevo<\/h3>\n<ul class="fontes-lista">/);
      const ld = JSON.parse(/<script type="application\/ld\+json">([^<]*)<\/script>/.exec(pagina)![1]!);
      expect(ld).toMatchObject({ '@type': 'Article', datePublished: '2026-10-23', author: { name: 'Equipe Clarevo' } });
      expect(ld.headline.length).toBeGreaterThan(10);
      expect(pagina, nome).toContain('corrigimos neste mesmo texto');
    }
  });

  it('"Conheça a Clarevo" só afirma o que o produto faz e manda para as páginas do site como fonte', () => {
    const p = h(POSTS[0]!);
    expect(p).toContain('<h1>Conheça a Clarevo</h1>');
    expect(p).toContain('A Clarevo não é banco');
    expect(p).toContain('tudo o que aparece no app foi anotado ou importado por você ou pelas pessoas da sua Família');
    expect(p).toContain('href="../app/index.html"');
    expect(p).toContain('href="../seguranca.html"');
    expect(p).toContain('href="../empresas/index.html"');
    expect(p).not.toMatch(/R\$\s?\d|gr[áa]tis|milh[õo]es|melhor/i);
  });

  it('"O que chegou ao app em novembro" conta a aba Investir, as melhorias das metas, a fatura em Multa e juros e as cinco abas, sem preço, sem "grátis" e sem convite a cadastrar', () => {
    const p = h(POST_DE_NOVEMBRO);
    expect(p).toContain('<h1>O que chegou ao app em novembro</h1>');
    expect(p).toContain('<time datetime="2026-11-12">12 de novembro de 2026</time> · Equipe Clarevo');
    const ld = JSON.parse(/<script type="application\/ld\+json">([^<]*)<\/script>/.exec(p)![1]!);
    expect(ld).toMatchObject({ '@type': 'Article', datePublished: '2026-11-12', author: { name: 'Equipe Clarevo' } });
    for (const secao of ['A aba Investir', 'Metas com atalhos de prazo, ritmo e marcos', 'Multa e juros, agora com a fatura do cartão', 'Cinco abas']) expect(p, secao).toContain(`>${secao}</h2>`);
    // Investir: o que o guia do app diz, sem recomendar investimento.
    expect(p).toContain('A rentabilidade dos meses fechados aparece ao lado do CDI e do IPCA do mesmo período, com dados públicos do Banco Central.');
    expect(p).toContain('Não é recomendação de investimento');
    expect(p).toContain('Os investimentos ficam só no seu Pessoal');
    // Metas: os nomes e os números do app.
    expect(p).toContain('6 meses, 1 ano, 2 anos ou 5 anos');
    expect(p).toContain('Ao passar de 25%, 50% e 75% da meta');
    // Multa e juros: os dois modos, com o texto e as fontes do tema do catálogo (sem copiar à mão) e o link da calculadora.
    expect(p).toContain('Em &quot;Fatura do cartão&quot;, ela soma os juros do rotativo, os juros de mora, a multa e o IOF estimado');
    const tema = publishedTopics().find((t) => t.slug === 'rotativo-cartao')!;
    expect(p).toContain(`<p>${esc(tema.short)}</p>`);
    expect(p).toContain('href="../calculadoras/multa-e-juros.html"');
    expect(p).toContain('href="../aprender/rotativo-cartao.html"');
    expect(p).not.toMatch(/\{\{/);
    // As cinco abas, pelo nome.
    expect(p).toContain('cinco abas: Resumo, Movimentos, Metas, Investir e Aprender');
    // Fontes: as páginas do site e as fontes do tema.
    const fontes = /<h3 id="fontes-clarevo">Na Clarevo<\/h3>\n<ul class="fontes-lista">([\s\S]*?)<\/ul>/.exec(p)?.[1] ?? '';
    for (const destino of ['../app/index.html', '../ajuda/organizar.html#guia-investimentos', '../ajuda/organizar.html#guia-metas', '../calculadoras/multa-e-juros.html', '../seguranca.html', '../aprender/rotativo-cartao.html']) expect(fontes, destino).toContain(`href="${destino}"`);
    // O tema de Aprender com a data de revisão na mesma linha, e as fontes oficiais dele no outro grupo, cada uma com a organização em
    // negrito, o título como link e a data de consulta.
    expect(fontes).toContain(`Aprender: ${esc(tema.title)}</a> <span class="fonte-data">revisado em ${tema.reviewedOn.split('-').reverse().join('/')}</span></li>`);
    const oficiais = /<h3 id="fontes-externas">Fontes oficiais<\/h3>\n<ul class="fontes-lista">([\s\S]*?)<\/ul>/.exec(p)?.[1] ?? '';
    for (const s of tema.sources) {
      if (s.kind !== 'oficial') continue;
      expect(oficiais, s.url).toContain(`<li><strong>${esc(s.publisher)}</strong>: <a href="${esc(s.url)}" rel="noopener noreferrer">${esc(s.title)}</a> <span class="fonte-data">consultada em ${s.consultedOn!.split('-').reverse().join('/')}</span></li>`);
    }
    expect(p).toContain('<p class="fontes-nota">Os temas também se apoiam em regras da própria Clarevo, que dizem como o app funciona e por isso não têm link.</p>');
    // A regra vigente: nada de preço, "grátis", período de teste, data de lançamento, lojas nem convite a cadastrar, baixar ou assinar.
    const principal = /<main[\s\S]*<\/main>/.exec(p)![0];
    expect(principal).not.toMatch(/R\$\s?\d|gr[áa]tis|gratuit|14 dias|teste gr|assin(e|ar|atura)|cadastr|baix(e|ar)|crie (a )?sua conta|comece agora|em breve|App Store|Google Play|milh[õo]es|\bmelhor(es)?\b/i);
    // O resumo cabe no limite dos posts e aparece no índice.
    const post = gerado.posts.find((x) => x.arquivo === POST_DE_NOVEMBRO)!;
    expect(post.data).toBe('2026-11-12');
    expect(h('novidades/index.html').indexOf('2026-11-12-o-que-chegou-ao-app-em-novembro.html')).toBeLessThan(h('novidades/index.html').indexOf('2026-10-23-conheca-a-clarevo.html'));
  });

  it('"13º salário" usa o texto e as fontes do tema decimo-terceiro do catálogo, sem copiar à mão', () => {
    const t = TEMAS_DO_SITE.find((x) => x.slug === 'decimo-terceiro')!;
    const p = h(POSTS[1]!);
    expect(p).toContain(`<p>${esc(t.short)}</p>`);
    for (const par of t.paragraphs) expect(p).toContain(`<p>${esc(par)}</p>`);
    expect(p).toContain(`<p>${esc(t.example!)}</p>`);
    expect(p).toContain(`<p>${esc(t.hypotheses!)}</p>`);
    // As fontes dos dois temas, sem repetir endereço, cada uma numa linha com a organização em negrito e o título como link (D-115); as
    // regras da própria Clarevo viram a nota do fim, sem os códigos internos.
    for (const s of t.sources) {
      if (s.kind === 'clarevo') {
        expect(p).toContain('regras da própria Clarevo, que dizem como o app funciona');
        expect(p).not.toContain(esc(LEARN_UI_TEXT.sourceLine(s)));
      } else if (s.kind === 'oficial') {
        expect(p).toContain(`<strong>${esc(s.publisher)}</strong>: <a href="${esc(s.url)}" rel="noopener noreferrer">${esc(s.title)}</a>`);
        expect(p.split(`href="${esc(s.url)}"`).length - 1, s.url).toBe(1);
      }
    }
    expect(p).not.toMatch(/<ol class="fontes">/);
    expect(p).toContain('href="../aprender/decimo-terceiro.html"');
    expect(p).not.toMatch(/\{\{/);
    // Nada sobra de diretiva: toda "{{tema:...}}" dos posts existe no catálogo.
    for (const f of readdirSync(join(ROOT, 'site-src', 'novidades'))) {
      for (const m of readFileSync(join(ROOT, 'site-src', 'novidades', f), 'utf8').matchAll(/\{\{tema:([a-z0-9-]+):/g)) expect(publishedTopics().some((x) => x.slug === m[1]), `${f}: ${m[1]}`).toBe(true);
    }
  });

  it('"Como a empresa oferece a Clarevo sem ver suas finanças" bate com a página Para empresas e com o texto jurídico', () => {
    const p = h(POSTS[2]!);
    expect(p).toContain('os e-mails que ela mesma convidou');
    expect(p).toContain('convite enviado, convite cancelado, ativa ou encerrada');
    expect(p).toContain('números somados de finanças');
    expect(p).toContain('a Clarevo não envia e-mail de convite');
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
    const semDominio = gerarSite({ dados: { ...PREENCHIDOS, DOMÍNIO: '' }, referencia: REFERENCIA_DOS_POSTS });
    expect(semDominio.arquivos.has('novidades/feed.xml')).toBe(false);
    for (const [nome, conteudoDaPagina] of semDominio.arquivos) {
      if (!nome.endsWith('.html')) continue;
      expect(texto(conteudoDaPagina), nome).not.toMatch(/feed\.xml|application\/rss\+xml|Feed RSS/);
    }
    expect(gerador.linksQuebrados(semDominio.arquivos)).toEqual([]);
    // Com domínio, o botão e o link existem e apontam para o feed.
    const comDominio = gerarSite({ dados: PREENCHIDOS, referencia: REFERENCIA_DOS_POSTS });
    const ic = texto(comDominio.arquivos.get('novidades/index.html'));
    // D-115: o botão "Feed RSS" leva à página que explica o RSS e mostra o endereço; o <link rel="alternate"> continua no XML.
    expect(ic).toContain('href="rss.html">Feed RSS</a>');
    const rss = texto(comDominio.arquivos.get('novidades/rss.html'));
    expect(rss).toContain('<h1>Acompanhar as Novidades por RSS</h1>');
    expect(rss).toContain('<input id="rss-endereco" type="text" readonly value="https://exemplo.test/novidades/feed.xml"');
    expect(rss).toContain('<button type="button" class="botao botao-principal" data-copiar="rss-endereco" data-estado="rss-estado" hidden>Copiar o endereço</button>');
    // O arquivo do feed como link de texto, dentro da nota (revisão: não um botão em destaque).
    expect(rss).toContain('<a href="feed.xml">abrir o arquivo do feed</a>.</p>');
    expect(rss).not.toMatch(/class="botao[^"]*" href="feed\.xml"/);
    expect(rss).not.toMatch(/xsl|stylesheet[^"]*feed/i);
    expect(semDominio.arquivos.has('novidades/rss.html')).toBe(false);
    expect(ic).toContain('<link rel="alternate" type="application/rss+xml" title="Novidades da Clarevo" href="feed.xml">');
    for (const nome of POSTS) expect(texto(comDominio.arquivos.get(nome)), nome).toContain('<link rel="alternate" type="application/rss+xml" title="Novidades da Clarevo" href="feed.xml">');
  });

  it('o feed RSS (só com domínio) é XML bem formado, com um item por post, data, descrição e endereços completos, nunca relativos', () => {
    const g = gerarSite({ dados: PREENCHIDOS, referencia: REFERENCIA_DOS_POSTS });
    const feed = texto(g.arquivos.get('novidades/feed.xml'));
    expect(problemasDeXml(feed)).toEqual([]);
    expect(feed).toContain('<rss version="2.0"');
    expect((feed.match(/<item>/g) ?? []).length).toBe(POSTS.length);
    expect((feed.match(/<pubDate>Fri, 23 Oct 2026 12:00:00 -0300<\/pubDate>/g) ?? []).length).toBe(3);
    expect((feed.match(/<pubDate>Thu, 12 Nov 2026 12:00:00 -0300<\/pubDate>/g) ?? []).length).toBe(1);
    // O post mais novo vem primeiro e dá a data do feed.
    expect(feed.indexOf('2026-11-12-o-que-chegou-ao-app-em-novembro')).toBeLessThan(feed.indexOf('2026-10-23-conheca-a-clarevo'));
    expect(feed).toContain('<lastBuildDate>Thu, 12 Nov 2026 12:00:00 -0300</lastBuildDate>');
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
    expect(p).toContain(dadoDoSite('E-MAIL DE CONTATO'));
  });
});

describe('site público: imagens, tamanho e Open Graph', () => {
  const gerado = gerarSite();

  it('as capturas são de demonstração, com largura adequada, tamanho declarado igual ao do arquivo e peso razoável', () => {
    // D-114: as ilustrações (SVG) ficam em imagens/ também e são conferidas no bloco das Novidades com imagens.
    const imagens = [...gerado.arquivos.keys()].filter((k) => k.startsWith('imagens/') && k.endsWith('.png'));
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
    // Desde 17/11/2026 (D-114), 2 MB: entraram as telas das Novidades, cada uma no tema claro e no escuro (quem visita baixa só uma das
    // duas), e as capas dos vídeos.
    expect(total, 'peso total das capturas').toBeLessThanOrEqual(2 * 1024 * 1024);
    // O site inteiro, sem os vídeos, cabe com folga. Desde 12/11/2026, 5 MB (as capturas originais do kit de imprensa, só para baixar,
    // cresceram com as fotos das metas e as cinco abas); desde 17/11/2026, 6,5 MB, com as telas das Novidades e as capas dos vídeos.
    const tudo = [...gerado.arquivos.entries()].filter(([k]) => !k.startsWith('videos/')).reduce((n, [, c]) => n + Buffer.byteLength(c), 0);
    expect(tudo).toBeLessThanOrEqual(6.5 * 1024 * 1024);
    // Com os vídeos (D-114), até 20 MB, e nenhum arquivo passa de 25 MB, o limite do Cloudflare Pages por arquivo.
    const comVideos = [...gerado.arquivos.values()].reduce((n, c) => n + Buffer.byteLength(c), 0);
    expect(comVideos).toBeLessThanOrEqual(20 * 1024 * 1024);
    for (const [nome, c] of gerado.arquivos) expect(Buffer.byteLength(c), nome).toBeLessThan(25 * 1024 * 1024);
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
    // D-068: a imagem mostra a mensagem central e a frase de apoio, lidas da ficha das lojas.
    expect(script).toContain('mensagem-central');
    expect(script).toContain('frase-de-apoio');
    expect(script).toContain('01_resumo.png');
    // O texto que o desenho mostra (a mensagem central, a frase de apoio e a linha de recursos), sem preço, ranking, "melhor", "grátis" nem selos.
    const ficha = readFileSync(join(ROOT, 'docs', 'lojas', 'ficha.md'), 'utf8');
    const textoDoDesenho = [...script.matchAll(/<p>([^<$]*)<\/p>/g)].map((m) => m[1]).join(' ');
    expect(textoDoDesenho.length).toBeGreaterThan(20);
    const campo = (nome: string) => ficha.match(new RegExp(`${nome}[^\\n]*\\n\`\`\`\\n([^\\n]+)`))?.[1] ?? '';
    expect(campo('mensagem-central')).toBe('Cuidar da vida financeira faz parte de cuidar de você.');
    expect(campo('frase-de-apoio')).toBe('Mais clareza para decidir');
    expect(`${textoDoDesenho} ${campo('mensagem-central')} ${campo('frase-de-apoio')}`).not.toMatch(/gr[áa]tis|melhor|baixe|download|R\$|ranking|#1|\bn[úu]mero 1\b/i);
  });
});

describe('site público: vídeos de uso do app e imagens das Novidades (D-114)', () => {
  const gerado = gerarSite();
  const h = (nome: string) => texto(gerado.arquivos.get(nome));
  const videos = require(join(ROOT, 'scripts', 'site', 'videos.js')) as {
    VIDEOS: { id: string; titulo: string; descricao: string }[];
    LEGENDA_TELA: string;
  };
  const imagens = require(join(ROOT, 'scripts', 'site', 'imagens.js')) as {
    TELAS_DAS_NOVIDADES: { id: string; origem: string; escura: string; alt: string }[];
    ILUSTRACOES: { id: string; origem: string; alt: string }[];
  };

  it('os sete vídeos (anotar um gasto, Resumo, Metas, Investir, fatura por print, Calendário e o tema) saem em MP4 e WebM leves, do próprio site, com nome que muda com o conteúdo', () => {
    expect(videos.VIDEOS.map((v) => v.id)).toEqual(['anotar-gasto', 'resumo-do-mes', 'metas', 'investir', 'importar-fatura-print', 'calendario-do-mes', 'tema-escuro-claro']);
    const manifesto = JSON.parse(readFileSync(join(ROOT, 'site-src', 'videos', 'videos.json'), 'utf8')) as { videos: Record<string, { duracao: number; largura: number; altura: number }> };
    for (const v of videos.VIDEOS) {
      const m = manifesto.videos[v.id]!;
      expect(m.duracao, v.id).toBeGreaterThanOrEqual(10);
      expect(m.duracao, v.id).toBeLessThanOrEqual(25);
      // Retrato de celular.
      expect(m.altura, v.id).toBeGreaterThan(m.largura * 1.5);
      const mp4 = [...gerado.arquivos.keys()].filter((k) => new RegExp(`^videos/${v.id}\\.[0-9a-f]{10}\\.mp4$`).test(k));
      const webm = [...gerado.arquivos.keys()].filter((k) => new RegExp(`^videos/${v.id}\\.[0-9a-f]{10}\\.webm$`).test(k));
      expect(mp4.length, v.id).toBe(1);
      expect(webm.length, v.id).toBe(1);
      const bytesMp4 = gerado.arquivos.get(mp4[0]!) as Buffer;
      const bytesWebm = gerado.arquivos.get(webm[0]!) as Buffer;
      expect(bytesMp4.subarray(4, 8).toString('latin1'), `${v.id}: MP4`).toBe('ftyp');
      expect(bytesWebm.readUInt32BE(0), `${v.id}: WebM`).toBe(0x1a45dfa3);
      // Leves: até 2 MB cada (o gravador baixa a qualidade até caber).
      expect(bytesMp4.length, mp4[0]).toBeLessThanOrEqual(2 * 1000 * 1000);
      expect(bytesWebm.length, webm[0]).toBeLessThanOrEqual(2 * 1000 * 1000);
      // O arquivo de site-src/videos é o mesmo publicado.
      expect(bytesMp4.equals(readFileSync(join(ROOT, 'site-src', 'videos', `${v.id}.mp4`))), v.id).toBe(true);
      // O texto: título, frase e descrição, sem valores em reais (que só aparecem na seção Planos da página inicial).
      for (const t of [v.titulo, v.descricao]) expect(t, v.id).not.toMatch(/R\$\s?\d|[\u2013\u2014]|faz\w*\s+sentido/);
      expect(v.descricao.length, v.id).toBeGreaterThan(120);
    }
    // A política de segurança aceita vídeo só do próprio site, e os vídeos ficam guardados por um ano no navegador.
    expect(h('_headers')).toContain("media-src 'self'");
    expect(h('_headers')).toContain('/videos/*\n  Cache-Control: public, max-age=31536000, immutable\n');
  });

  it('D-115: cada vídeo fica no bloco que ele mostra, na moldura de celular, sem controles nem autoplay, com a legenda da demonstração, o nome e a descrição em texto', () => {
    // Onde cada vídeo fica: a página inicial (a capa e três cartões de "O que o app faz") e O app (seis recursos e o cartão do tema).
    const lugares: [string, string, RegExp][] = [
      ['index.html', 'resumo-do-mes', /<section class="capa[^"]*">[\s\S]*?<\/section>/],
      ['index.html', 'anotar-gasto', /<article class="cartao">\n<h3>Anotar e ver o mês<\/h3>[\s\S]*?<\/article>/],
      ['index.html', 'importar-fatura-print', /<article class="cartao">\n<h3>Contas, cartões e gastos fixos<\/h3>[\s\S]*?<\/article>/],
      ['index.html', 'metas', /<article class="cartao">\n<h3>Metas e reserva<\/h3>[\s\S]*?<\/article>/],
      ['app/index.html', 'resumo-do-mes', /<article class="recurso" id="resumo"[\s\S]*?<\/article>/],
      ['app/index.html', 'anotar-gasto', /<article class="recurso" id="anotar"[\s\S]*?<\/article>/],
      ['app/index.html', 'calendario-do-mes', /<article class="recurso" id="contas"[\s\S]*?<\/article>/],
      ['app/index.html', 'importar-fatura-print', /<article class="recurso" id="cartoes"[\s\S]*?<\/article>/],
      ['app/index.html', 'metas', /<article class="recurso" id="metas"[\s\S]*?<\/article>/],
      ['app/index.html', 'investir', /<article class="recurso" id="investir"[\s\S]*?<\/article>/],
      ['app/index.html', 'tema-escuro-claro', /<article class="cartao">\n<h3>Tema claro ou escuro<\/h3>[\s\S]*?<\/article>/],
    ];
    for (const [pagina, id, onde] of lugares) {
      const p = h(pagina);
      const v = videos.VIDEOS.find((x) => x.id === id)!;
      const bloco = onde.exec(p)?.[0] ?? '';
      expect(bloco, `${pagina}: ${id}`).toContain(`data-titulo="${esc(v.titulo)}"`);
      const item = /<figure class="celular celular-video" data-video [\s\S]*?<\/figure>/.exec(bloco)?.[0] ?? '';
      expect(item).toMatch(/<video muted loop playsinline preload="none" width="720" height="1560" poster="[^"]*imagens\/video-[a-z-]+\.[0-9a-f]{10}\.png"/);
      expect(item).toContain(`aria-labelledby="video-${id}-nome" aria-describedby="video-${id}-descricao"`);
      // WebM primeiro (mais leve), depois o MP4, e um link para o MP4 se o navegador não tocar nenhum dos dois.
      expect(item).toMatch(new RegExp(`<source src="[^"]*videos/${id}\\.[0-9a-f]{10}\\.webm" type="video/webm">\\s*<source src="[^"]*videos/${id}\\.[0-9a-f]{10}\\.mp4" type="video/mp4">\\s*<a href="[^"]*videos/${id}\\.[0-9a-f]{10}\\.mp4">`));
      expect(item).toMatch(new RegExp(`<p class="video-texto" hidden><span id="video-${id}-nome">Vídeo: ${esc(v.titulo)}</span>, \\d+ segundos, sem som\\. <span id="video-${id}-descricao">`));
      expect(item).toContain(`<span id="video-${id}-descricao">${esc(v.descricao)}</span>`);
      expect(item).toContain(`<figcaption>${videos.LEGENDA_TELA}</figcaption>`);
      expect(item).not.toMatch(/\s(controls|autoplay)\b|<details/);
    }
    // Cada vídeo aparece uma vez em cada página onde fica; a seção "Veja o app em uso" saiu (D-115).
    for (const pagina of ['index.html', 'app/index.html']) {
      const p = h(pagina);
      expect(p).not.toContain('Veja o app em uso');
      expect(p).not.toContain('id="em-uso"');
      expect(p).not.toMatch(/\sautoplay\b|\scontrols\b|<audio\b|youtube|vimeo/i);
      for (const v of videos.VIDEOS) expect((p.match(new RegExp(`id="video-${v.id}-nome"`, 'g')) ?? []).length, `${pagina}: ${v.id}`).toBeLessThanOrEqual(1);
      expect(p).toMatch(/<script src="(\.\.\/)?js\/videos\.js" defer><\/script>/);
    }
    expect(h('app/index.html').match(/<video\b/g)?.length).toBe(7);
    expect(h('index.html').match(/<video\b/g)?.length).toBe(4);
    // O cartão do tema leva à resposta da Ajuda sobre o tema.
    expect(h('app/index.html')).toMatch(/<h3>Tema claro ou escuro<\/h3>[\s\S]*?<a href="\.\.\/ajuda\/conta\.html#p-tema">Como usar<\/a>/);
    expect(h('ajuda/conta.html')).toContain('id="p-tema"');
    // O script dos vídeos: do próprio site, sem rede, sem guardar nada, com as preferências de movimento e de dados. Sem botão de pausar
    // (D-115c, 19/11/2026): o próprio vídeo é o controle, com papel de botão, foco pelo teclado, Enter e Espaço e o nome que diz o que um
    // toque faz; o nome sem script (aria-labelledby) dá lugar a esse.
    const js = h('js/videos.js');
    expect(js).toContain('IntersectionObserver');
    expect(js).toContain('prefers-reduced-motion: reduce');
    expect(js).toContain('saveData');
    expect(js).toContain('Pausar o vídeo: ');
    expect(js).toContain('Tocar o vídeo: ');
    for (const t of ["video.setAttribute('tabindex', '0')", "video.setAttribute('role', 'button')", "video.removeAttribute('aria-labelledby')", "ev.key === 'Enter'", "ev.key === ' '", "video.addEventListener('click'"]) expect(js, t).toContain(t);
    expect(js).not.toMatch(/createElement\('button'\)|video-botao/);
    expect(h('estilo.css')).not.toContain('video-botao');
    expect(h('estilo.css')).toContain('.celular video:focus-visible{');
    expect(js).not.toMatch(/fetch\(|XMLHttpRequest|localStorage|sessionStorage|document\.cookie|innerHTML|eval\(/);
    expect(videos.LEGENDA_TELA).toBe('Tela da demonstração, com dados fictícios');
  });

  it('as matérias de Novidades têm imagem de capa (tela da demonstração ou, na do 13º, a ilustração da marca) e as telas ao lado das seções, nos temas claro e escuro', () => {
    const capas: Record<string, string> = {
      'novidades/2026-10-23-conheca-a-clarevo.html': 'post-resumo',
      'novidades/2026-10-23-como-a-empresa-oferece-a-clarevo-sem-ver-suas-financas.html': 'post-quem-ve',
      'novidades/2026-11-12-o-que-chegou-ao-app-em-novembro.html': 'post-investir',
    };
    for (const [pagina, id] of Object.entries(capas)) {
      const p = h(pagina);
      expect(p, pagina).toContain('<section class="capa capa-simples capa-com-imagem">');
      const capa = /<div class="capa-grade capa-post">[\s\S]*?<\/figure>\n<\/div>/.exec(p)?.[0] ?? '';
      expect(capa, pagina).toContain('<figure class="celular capa-tela">');
      expect(capa).toMatch(new RegExp(`<source srcset="[^"]*imagens/${id}-escura\\.[0-9a-f]{10}\\.png" media="\\(prefers-color-scheme: dark\\)" width="480" height="\\d+"><img src="[^"]*imagens/${id}\\.[0-9a-f]{10}\\.png" alt="[^"]{40,}" width="480" height="\\d+" loading="eager"`));
      expect(capa).toContain('<figcaption>Tela da demonstração, com dados fictícios</figcaption>');
    }
    // A matéria sem tela: a ilustração da marca, em SVG feito no repositório, com largura, altura e texto alternativo.
    const treze = h('novidades/2026-10-23-13o-salario-quando-cai-e-como-se-organizar.html');
    expect(treze).toMatch(/<figure class="capa-ilustracao"><img src="\.\.\/imagens\/ilustracao-decimo-terceiro\.[0-9a-f]{10}\.svg" alt="Ilustração da Clarevo: [^"]+" width="400" height="400" decoding="async"><\/figure>/);
    const svg = texto([...gerado.arquivos.entries()].find(([k]) => /^imagens\/ilustracao-decimo-terceiro\.[0-9a-f]{10}\.svg$/.test(k))?.[1]);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 400 400"/);
    expect(svg, 'a ilustração não carrega nada de fora nem tem script').not.toMatch(/<script|<image|href=|url\(/i);
    expect(Buffer.byteLength(svg)).toBeLessThan(8 * 1024);
    // As telas ao lado das seções: a aba Investir (Desempenho), Metas, a fatura em Multa e juros e as cinco abas (Resumo); e o painel da
    // empresa, largo, embaixo do texto.
    const nov = h('novidades/2026-11-12-o-que-chegou-ao-app-em-novembro.html');
    const secoes = [...nov.matchAll(/<div class="post-secao">\n<div class="post-secao-texto">\n<h2 id="([^"]+)">[\s\S]*?<figure class="celular post-tela">[\s\S]*?<img src="[^"]*imagens\/(post-[a-z-]+)\.[0-9a-f]{10}\.png"/g)].map((m) => `${m[1]}:${m[2]}`);
    expect(secoes).toEqual(['a-aba-investir:post-desempenho', 'metas-com-atalhos-de-prazo-ritmo-e-marcos:post-metas', 'multa-e-juros-agora-com-a-fatura-do-cartao:post-multa-fatura', 'cinco-abas:post-resumo']);
    const empresa = h('novidades/2026-10-23-como-a-empresa-oferece-a-clarevo-sem-ver-suas-financas.html');
    expect(empresa).toMatch(/<figure class="larga post-tela"><div class="larga-moldura"><picture><source srcset="\.\.\/imagens\/post-empresa-painel-escura\.[0-9a-f]{10}\.png" media="\(prefers-color-scheme: dark\)" width="960" height="\d+"><img src="\.\.\/imagens\/post-empresa-painel\.[0-9a-f]{10}\.png" alt="Painel da empresa[^"]+" width="960" height="\d+" loading="lazy" decoding="async"><\/picture><\/div><figcaption>Tela da demonstração, com dados fictícios<\/figcaption><\/figure>/);
    // Cada tela das Novidades tem a versão escura, do mesmo tamanho, e nenhuma diretiva ficou sem trocar.
    for (const t of imagens.TELAS_DAS_NOVIDADES) {
      expect(existsSync(join(ROOT, t.origem)), t.origem).toBe(true);
      expect(existsSync(join(ROOT, t.escura)), t.escura).toBe(true);
      const a = png.dimensoes(readFileSync(join(ROOT, t.origem)));
      const b = png.dimensoes(readFileSync(join(ROOT, t.escura)));
      expect(`${b.largura}x${b.altura}`, t.escura).toBe(`${a.largura}x${a.altura}`);
    }
    for (const p of [...gerado.arquivos.keys()].filter((k) => k.startsWith('novidades/') && k.endsWith('.html'))) expect(h(p), p).not.toMatch(/\{\{tela:|class="pendente">Falta a tela/);
  });
});

describe('site público: contraste das cores (a regra de src/contrast.ts, 4,5:1 para texto e 3:1 para foco e contornos)', () => {
  const css = readFileSync(join(SITE, 'estilo.css'), 'utf8');
  const variaveis = (bloco: string) => Object.fromEntries([...bloco.matchAll(/--([a-z0-9-]+):(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1]!, m[2]!]));
  const claro = variaveis(/:root\{([^}]*)\}/.exec(css)![1]!);
  // D-115: as cores escuras valem com o tema do aparelho (sem a escolha "Claro") e com a escolha "Escuro"; os dois blocos são iguais.
  const blocoEscuro = /@media \(prefers-color-scheme: dark\)\{\s*:root:not\(\[data-tema="claro"\]\)\{([^}]*)\}/.exec(css)![1]!;
  const blocoEscolhido = /\n:root\[data-tema="escuro"\]\{([^}]*)\}/.exec(css)![1]!;
  const escuro = { ...claro, ...variaveis(blocoEscuro) };
  it('o tema escuro escolhido no rodapé usa exatamente as cores do tema escuro do aparelho', () => {
    expect(variaveis(blocoEscolhido)).toEqual(variaveis(blocoEscuro));
    expect(Object.keys(variaveis(blocoEscuro)).length).toBeGreaterThanOrEqual(12);
    expect(css).toContain(':root[data-tema="claro"]{color-scheme:light}');
    expect(css).toContain(':root[data-tema="escuro"]{color-scheme:dark}');
  });

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
    ['lima', 'topo', 'sublinhado da página atual, botão principal e frase de apoio da capa (20 px em negrito, texto grande) sobre o azul'],
    ['lima', 'disco', 'frase de apoio da capa sobre o disco decorativo'],
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
  // O retrato de teste dos indicadores (D-106) vai em toda chamada: sem ele, o --final recusaria só por isso.
  const rodar = (args: string[]) => spawnSync(process.execPath, [SCRIPT, ...args, ...(args.includes('--retrato') ? [] : ['--retrato', ARQUIVO_DO_RETRATO])], { cwd: ROOT, encoding: 'utf8' });
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
      const r3 = rodar(['--final', '--dados', join(dir, 'cheios.json'), '--legal', limpa, '--referencia', REFERENCIA_DOS_POSTS, '--saida', saida]);
      expect(r3.status, r3.stderr).toBe(0);
      for (const nome of [...PAGINAS, 'sitemap.xml', 'robots.txt', 'novidades/feed.xml', 'ajuda/indice.json', 'ajuda/busca.js', 'og/clarevo.png']) expect(existsSync(join(saida, nome)), nome).toBe(true);
      expect(readdirSync(join(saida, 'imagens')).some((n) => /^resumo\.[0-9a-f]{10}\.png$/.test(n)), 'imagens/resumo.<resumo>.png').toBe(true);
      expect(readFileSync(join(saida, 'suporte.html'), 'utf8')).toContain('suporte@exemplo.test');
      expect(r3.stdout).toMatch(/\d+ páginas/);
      // Rodar de novo não muda nada (as capturas são comparadas pelos pixels).
      const r4 = rodar(['--dados', join(dir, 'cheios.json'), '--legal', limpa, '--referencia', REFERENCIA_DOS_POSTS, '--saida', saida]);
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
      const FRASE = 'Rascunho preparado pela equipe da Clarevo para revisão jurídica. Não é parecer jurídico.';
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
      const limpo = gerarSite({ legal: pasta(pastas), dados: PREENCHIDOS, referencia: REFERENCIA_DOS_POSTS });
      expect(razoesFinais(limpo)).toEqual([]);
      for (const [nome, ajuste, esperado] of casos) {
        const g = gerarSite({ legal: pasta(pastas, ajuste), dados: PREENCHIDOS, referencia: REFERENCIA_DOS_POSTS });
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
      const vazio = MARCADORES.find((m) => !(atuais[m] ?? '').trim());
      if (vazio) {
        expect(r.status).toBe(1);
        expect(r.stderr).toContain('Falta preencher');
        expect(r.stderr).toContain(`[${vazio}]`);
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
  const REFERENCIA = REFERENCIA_DOS_POSTS;

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
        ['data futura em relação à referência', (a) => (a[`${DIA_SEGUINTE}-amanha.md`] = CABECALHO(DIA_SEGUINTE)), [`${DIA_SEGUINTE}-amanha.md: a data (${DIA_SEGUINTE}) é depois da data de referência (${REFERENCIA})`]],
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
      const amanha = posts(pastas, (a) => (a[`${DIA_SEGUINTE}-amanha.md`] = CABECALHO(DIA_SEGUINTE)));
      expect(razoesFinais(gerar(amanha, DIA_SEGUINTE))).toEqual([]);
      expect(razoesFinais(gerar(amanha, REFERENCIA)).length).toBeGreaterThan(0);
      // Os posts do próprio repositório também são conferidos: com a referência do ciclo inicial, o texto de novembro seria futuro.
      expect(razoesFinais(gerar(posts(pastas), '2026-10-23')).join('\n')).toContain('2026-11-12-o-que-chegou-ao-app-em-novembro.md: a data (2026-11-12) é depois da data de referência (2026-10-23)');
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
        a[`${DIA_SEGUINTE}-amanha.md`] = CABECALHO(DIA_SEGUINTE);
        a['2026-10-22-sem-fontes.md'] = CABECALHO('2026-10-22', undefined, '');
        a['2026-10-22-tema.md'] = CABECALHO('2026-10-22', '{{tema:nao-existe:p1}}\n');
      });
      const saida = join(dir, 'site');
      const r = rodar(['--final', '--dados', join(dir, 'cheios.json'), '--legal', legal, '--novidades', ruins, '--referencia', REFERENCIA, '--saida', saida]);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('--final');
      expect(r.stderr).toContain(`${DIA_SEGUINTE}-amanha.md: a data (${DIA_SEGUINTE}) é depois da data de referência (${REFERENCIA})`);
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


describe('site público: indicadores oficiais, páginas de mercado e resumo semanal (D-106)', { timeout: 180_000 }, () => {
  const repo = gerarSite();
  const comRetrato = gerarSite({ dados: PREENCHIDOS, referencia: REFERENCIA_DOS_POSTS });
  const h = (g: Gerado, nome: string) => texto(g.arquivos.get(nome));
  const AVISO = 'Conteúdo educativo. Não é recomendação nem análise de valores mobiliários.';
  /** Uma pasta de edições do resumo semanal, com os arquivos do caso. */
  const edicoes = (pastas: string[], arquivos: Record<string, unknown>): string => {
    const dir = mkdtempSync(join(tmpdir(), 'clarevo-noticias-'));
    pastas.push(dir);
    for (const [nome, conteudoDoArquivo] of Object.entries(arquivos)) writeFileSync(join(dir, nome), typeof conteudoDoArquivo === 'string' ? conteudoDoArquivo : JSON.stringify(conteudoDoArquivo));
    return dir;
  };
  const NOTICIA = { titulo: 'Copom decide a meta da Selic na reunião da semana', resumo: 'O comitê do Banco Central anunciou a meta da Selic. A decisão vale a partir do dia seguinte.', veiculo: 'Agência de Exemplo', autor: 'Pessoa de Exemplo', data: '2026-11-11', link: 'https://noticias.exemplo.test/copom', tema: 'copom' };

  it('as páginas de mercado existem, com o aviso no rodapé, e as outras páginas não têm o aviso', () => {
    for (const nome of PAGINAS_DE_MERCADO) {
      const pagina = h(repo, nome);
      const rodape = /<footer class="rodape">([\s\S]*?)<\/footer>/.exec(pagina)?.[1] ?? '';
      expect(rodape, nome).toContain(`<p class="rodape-aviso">${esc(AVISO)}</p>`);
    }
    for (const nome of ['index.html', 'aprender/selic.html', 'calculadoras/rendimento-cdi.html', 'sobre.html']) expect(h(repo, nome), nome).not.toContain('rodape-aviso');
    expect(INDICADORES_TEXT.avisoMercado).toBe(AVISO);
  });

  it('o painel mostra os cinco números do retrato com a data, a hora da consulta e "Fonte: Banco Central do Brasil"; o dólar é "Dólar PTAX (Banco Central)"', () => {
    const painel = h(comRetrato, 'indicadores/index.html');
    expect(painel).toContain('<h1>Indicadores oficiais</h1>');
    expect(painel).toContain(`data-painel data-consultado="${RETRATO_DE_TESTE.consultadoEm}"`);
    expect(painel).toContain(`<span data-campo="hora">${esc(INDICADORES_TEXT.retrato(RETRATO_DE_TESTE.consultadoEm!))}</span> Fonte: Banco Central do Brasil.`);
    expect(painel).toContain('Retrato de 12/11/2026 às 13:00, horário de Brasília.');
    for (const id of INDICADOR_IDS) {
      const ex = exibirIndicador(id, RETRATO_DE_TESTE.valores[id]);
      expect(painel, id).toContain(`data-indicador="${id}"><span class="titulo-cartao">${esc(ex.nome)}</span><span class="indicador-numero"><span data-campo="numero">${esc(ex.numero)}</span>`);
      expect(painel, id).toContain(`<span data-campo="data">${esc(ex.data)}</span>`);
    }
    expect(painel).toContain('<span class="titulo-cartao">Dólar PTAX (Banco Central)</span>');
    expect(painel).toContain(esc('R$ 5,1234'));
    expect(painel).toContain('Não são cotações ao vivo nem previsões.');
    // Sem calendário do Copom: só o link para a página oficial do Banco Central.
    expect(painel).toContain('<a href="https://www.bcb.gov.br/controleinflacao/copom" rel="noopener noreferrer">');
    expect(painel).not.toMatch(/\d{1,2} e \d{1,2} de (janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/);
    // O script do painel é do próprio site e a página não tem formulário.
    expect(painel).toContain('<script src="painel.js" defer></script>');
    expect(painel).not.toMatch(/<form\b/);
  });

  it('sem retrato, as páginas dizem que ainda não há números salvos, e o --final recusa', () => {
    // O repositório tem retrato desde 18/11/2026; o caso vazio é montado aqui.
    const semRetrato = gerarSite({ retrato: { consultadoEm: null, valores: {} } });
    expect(semRetrato.retrato).toEqual({ consultadoEm: null, valores: {} });
    const painel = h(semRetrato, 'indicadores/index.html');
    expect(painel).toContain(esc(INDICADORES_TEXT.semRetrato));
    expect(painel).toContain('<span data-campo="numero">Sem número</span>');
    expect(semRetrato.problemasFinais.join('\n')).toContain('indicadores sem retrato');
    // O retrato gravado no repositório passa na leitura, com os cinco números.
    expect(Object.keys(repo.retrato.valores).sort()).toEqual(['cdi', 'ipca', 'poupanca', 'ptax', 'selic']);
    // Com o retrato de teste e tudo preenchido, o retrato não é motivo de recusa; antigo ou incompleto, é.
    expect(comRetrato.problemasFinais.filter((p) => p.includes('retrato'))).toEqual([]);
    const antigo = gerarSite({ dados: PREENCHIDOS, referencia: '2026-11-30' });
    expect(antigo.problemasFinais.join('\n')).toContain('o retrato dos indicadores é de 18 dias antes de 2026-11-30 (o limite é 7)');
    const incompleto = gerarSite({ dados: PREENCHIDOS, referencia: REFERENCIA_DOS_POSTS, retrato: { ...RETRATO_DE_TESTE, valores: { selic: RETRATO_DE_TESTE.valores.selic } } });
    expect(incompleto.problemasFinais.join('\n')).toContain('o retrato dos indicadores não tem CDI, IPCA em 12 meses, Rendimento da poupança, Dólar PTAX (Banco Central)');
    // Um retrato com número fora das faixas ou sem a hora da consulta não entra.
    const estranho = gerarSite({ dados: PREENCHIDOS, referencia: REFERENCIA_DOS_POSTS, retrato: { consultadoEm: 'ontem', valores: RETRATO_DE_TESTE.valores } });
    expect(estranho.retrato).toEqual({ consultadoEm: null, valores: {} });
  });

  it('uma página por indicador, com o número, a data, o que é, o que muda na vida da pessoa, a origem e os links para Aprender e as calculadoras', () => {
    for (const p of PAGINAS_INDICADORES) {
      const nome = `indicadores/${p.slug}.html`;
      const pagina = h(comRetrato, nome);
      const ex = exibirIndicador(p.id, RETRATO_DE_TESTE.valores[p.id]);
      expect(pagina, nome).toContain(`<h1>${esc(p.titulo)}</h1>`);
      expect(pagina, nome).toContain(`<p class="indicador-capa-numero"><span data-campo="numero">${esc(ex.numero)}</span>`);
      expect(pagina, nome).toContain('Fonte: Banco Central do Brasil.');
      expect(pagina, nome).toContain('<h2 id="o-que-e">O que é</h2>');
      expect(pagina, nome).toContain('<h2 id="o-que-muda">O que muda na sua vida</h2>');
      for (const secao of p.oQueMuda) expect(pagina, `${nome}: ${secao.titulo}`).toContain(`<h3>${esc(secao.titulo)}</h3>`);
      expect(pagina, nome).toContain(esc(p.origem));
      for (const t of p.temas) expect(pagina, `${nome}: ${t}`).toContain(`href="../aprender/${t}.html"`);
      for (const c of p.calculadoras) expect(pagina, `${nome}: ${c}`).toContain(`href="../calculadoras/${c}.html"`);
      // A descrição traz o número do retrato e a fonte.
      expect(/<meta name="description" content="([^"]+)">/.exec(pagina)?.[1], nome).toContain(esc(ex.numero));
      expect(pagina, nome).toContain('<script src="painel.js" defer></script>');
    }
    expect(h(comRetrato, 'indicadores/dolar-ptax-hoje.html')).toContain('Não é cotação ao vivo.');
    expect(h(comRetrato, 'indicadores/selic-hoje.html')).toContain('controleinflacao/copom');
  });

  it('o glossário tem os termos pedidos, com âncora, e aponta para os temas de Aprender e para os indicadores', () => {
    const pagina = h(repo, 'indicadores/glossario.html');
    for (const t of GLOSSARIO) {
      expect(pagina, t.termo).toContain(`<h2 id="${t.id}">${esc(t.termo)}</h2>`);
      expect(pagina, t.termo).toContain(`<a href="#${t.id}">${esc(t.termo)}</a>`);
      for (const tema of t.temas) expect(pagina, `${t.termo}: ${tema}`).toContain(`href="../aprender/${tema}.html"`);
    }
    for (const termo of ['CDI', 'IPCA', 'Selic', 'FGC', 'Come-cotas', 'Marcação a mercado', 'Liquidez', 'IR regressivo', 'IOF', 'PTAX']) expect(pagina, termo).toContain(`>${esc(termo)}</h2>`);
  });

  it('as duas explicações permanentes trazem o exemplo calculado pelo núcleo, as hipóteses e as fontes, sem previsão', () => {
    for (const e of explicacoesDeMercado()) {
      const pagina = h(repo, `indicadores/${e.slug}.html`);
      expect(pagina, e.slug).toContain(`<h1>${esc(e.titulo)}</h1>`);
      expect(pagina, e.slug).toContain(esc(e.exemplo.texto));
      expect(pagina, e.slug).toContain(esc(e.exemplo.hipoteses));
      for (const s of e.secoes) expect(pagina, `${e.slug}: ${s.titulo}`).toContain(`>${esc(s.titulo)}</h2>`);
      expect(pagina, e.slug).toContain('<h2 id="fontes">Fontes</h2>');
    }
    expect(h(repo, 'indicadores/quando-a-selic-muda.html')).toContain('A Clarevo não prevê a Selic');
  });

  it('Indicadores e Glossário estão no rodapé de todas as páginas; nenhuma página de mercado fala de ação, empresa, ranking ou "melhores"', () => {
    for (const nome of PAGINAS) {
      const rodape = /<footer class="rodape">([\s\S]*?)<\/footer>/.exec(h(repo, nome))?.[1] ?? '';
      expect(rodape, nome).toContain(`<a href="${visto(nome, 'indicadores/index.html')}">Indicadores</a>`);
      expect(rodape, nome).toContain(`<a href="${visto(nome, 'indicadores/glossario.html')}">Glossário</a>`);
    }
    for (const nome of PAGINAS_DE_MERCADO) {
      const t = (/<main[\s\S]*<\/main>/.exec(h(repo, nome))?.[0] ?? '').replace(/<[^>]+>/g, ' ');
      expect(t, nome).not.toMatch(/\b[A-Z]{4}\d{1,2}\b|Ibovespa|IFIX|ranking|\bmelhores\b|compre agora|preço-alvo/i);
    }
  });

  it('as duas calculadoras novas estão no índice, no grupo "Guardar e dividir", e a do CDI liga para "CDI hoje"', () => {
    const indice = h(repo, 'calculadoras/index.html');
    for (const c of SITE_CALCULATORS) expect(indice, c.slug).toContain(`<a class="cartao" href="${c.slug}.html"><span class="titulo-cartao">${esc(c.title)}</span>`);
    expect(indice.indexOf('href="dividir-contas.html"')).toBeLessThan(indice.indexOf('href="juros-compostos.html"'));
    expect(h(repo, 'calculadoras/rendimento-cdi.html')).toContain('href="../indicadores/cdi-hoje.html">CDI hoje</a>');
    expect(h(repo, 'index.html')).toContain('12 calculadoras para contas rápidas');
  });

  it('resumo semanal: sem edição, nenhuma página e nada no rodapé nem no mapa do site', () => {
    const pastas: string[] = [];
    try {
      const sem = gerarSite({ dados: PREENCHIDOS, referencia: REFERENCIA_DOS_POSTS, noticias: edicoes(pastas, {}) });
      expect([...sem.arquivos.keys()].filter((k) => k.startsWith('noticias/'))).toEqual([]);
      expect(h(sem, 'index.html')).not.toContain('Resumo semanal');
      expect(h(sem, 'sitemap.xml')).not.toContain('/noticias/');
      expect(repo.edicoes).toEqual([]);
      expect([...repo.arquivos.keys()].filter((k) => k.startsWith('noticias/'))).toEqual([]);
    } finally {
      for (const p of pastas) rmSync(p, { recursive: true, force: true });
    }
  });

  it('resumo semanal: com uma edição, o índice e a página dela entram no rodapé e no mapa do site, com links simples, sem imagem nem script', () => {
    const pastas: string[] = [];
    try {
      const pasta = edicoes(pastas, { 'semana-2026-11-12.json': { itens: [NOTICIA] } });
      const g = gerarSite({ dados: PREENCHIDOS, referencia: REFERENCIA_DOS_POSTS, noticias: pasta });
      expect(g.problemasFinais.filter((p) => p.includes('noticias'))).toEqual([]);
      const edicao = h(g, 'noticias/semana-2026-11-12.html');
      expect(edicao).toContain('<h1>Resumo da semana: 12 de novembro de 2026</h1>');
      expect(edicao).toContain(`<h2 id="noticia-1">${esc(NOTICIA.titulo)}</h2>`);
      expect(edicao).toContain(esc(NOTICIA.resumo));
      expect(edicao).toContain('Copom e Selic · 11/11/2026 · Agência de Exemplo, por Pessoa de Exemplo.');
      expect(edicao).toContain('<a href="https://noticias.exemplo.test/copom" rel="noopener noreferrer">Ler a matéria completa no site de Agência de Exemplo</a>');
      expect(edicao).toContain(`<p class="rodape-aviso">${esc(AVISO)}</p>`);
      const main = /<main[\s\S]*<\/main>/.exec(edicao)?.[0] ?? '';
      expect(main).not.toMatch(/<img\b|<script\b|<iframe\b/);
      expect(h(g, 'noticias/index.html')).toContain('href="semana-2026-11-12.html"');
      expect(h(g, 'sobre.html')).toContain('<a href="noticias/index.html">Resumo semanal</a>');
      expect(h(g, 'indicadores/index.html')).toContain('href="../noticias/index.html"');
      const sitemap = h(g, 'sitemap.xml');
      expect(sitemap).toContain('<url><loc>https://exemplo.test/noticias/semana-2026-11-12</loc><lastmod>2026-11-12</lastmod></url>');
      expect(sitemap).toContain('<loc>https://exemplo.test/noticias/</loc>');
      for (const nome of ['noticias/index.html', 'noticias/semana-2026-11-12.html']) {
        expect(h(g, nome).match(/<h1[\s>]/g)?.length, nome).toBe(1);
        expect(gerador.problemasDeTitulos(h(g, nome)), nome).toEqual([]);
        expect(h(g, nome), nome).not.toMatch(PROIBIDO_TRAVESSAO);
      }
      expect(gerador.linksQuebrados(g.arquivos)).toEqual([]);
    } finally {
      for (const p of pastas) rmSync(p, { recursive: true, force: true });
    }
  });

  it('resumo semanal: o gerador recusa edição com problema (sem --final, aviso; a edição não vira página)', () => {
    const pastas: string[] = [];
    try {
      const casos: [string, Record<string, unknown>, string][] = [
        ['nome fora do padrão', { 'resumo.json': { itens: [NOTICIA] } }, 'o nome precisa ser semana-AAAA-MM-DD.json'],
        ['JSON ilegível', { 'semana-2026-11-12.json': '{ itens' }, 'não é um JSON válido'],
        ['sem notícias', { 'semana-2026-11-12.json': { itens: [] } }, 'pelo menos uma notícia'],
        ['data depois da referência', { 'semana-2026-11-13.json': { itens: [{ ...NOTICIA, data: '2026-11-13' }] } }, 'é depois da data de referência'],
        ['campo faltando', { 'semana-2026-11-12.json': { itens: [{ ...NOTICIA, autor: '' }] } }, 'falta autor'],
        ['resumo com três frases', { 'semana-2026-11-12.json': { itens: [{ ...NOTICIA, resumo: 'Uma. Duas. Três.' }] } }, 'mais de duas frases'],
        ['link sem https', { 'semana-2026-11-12.json': { itens: [{ ...NOTICIA, link: 'http://noticias.exemplo.test/x' }] } }, 'https://'],
        ['tema fora da lista', { 'semana-2026-11-12.json': { itens: [{ ...NOTICIA, tema: 'acoes' }] } }, 'não é um dos permitidos'],
        ['notícia fora da semana', { 'semana-2026-11-12.json': { itens: [{ ...NOTICIA, data: '2026-11-01' }] } }, 'não é da semana da edição'],
        ['código de ação', { 'semana-2026-11-12.json': { itens: [{ ...NOTICIA, titulo: 'PETR4 sobe' }] } }, 'código de ação'],
        ['índice de bolsa', { 'semana-2026-11-12.json': { itens: [{ ...NOTICIA, resumo: 'O Ibovespa fechou em alta.' }] } }, 'índice de bolsa'],
        ['travessão', { 'semana-2026-11-12.json': { itens: [{ ...NOTICIA, resumo: 'Texto — com travessão.' }] } }, 'travessão'],
      ];
      for (const [nome, arquivos, esperado] of casos) {
        const g = gerarSite({ dados: PREENCHIDOS, referencia: REFERENCIA_DOS_POSTS, noticias: edicoes(pastas, arquivos) });
        expect(g.problemasFinais.join('\n'), nome).toContain(esperado);
        expect(g.avisos.join('\n'), nome).toContain(esperado);
        expect([...g.arquivos.keys()].filter((k) => k.startsWith('noticias/')), nome).toEqual([]);
      }
    } finally {
      for (const p of pastas) rmSync(p, { recursive: true, force: true });
    }
  });
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

  it('usa a mensagem central e a frase de apoio aprovadas da ficha, o logotipo reverso oficial e a captura da demonstração, sem texto de preço nem selos', () => {
    const script = readFileSync(join(ROOT, 'scripts', 'gerar-grafico-loja.js'), 'utf8');
    expect(script).toContain('clarevo-logotipo-reverso.svg');
    expect(script).toContain('mensagem-central');
    expect(script).toContain('frase-de-apoio');
    expect(script).toContain('01_resumo.png');
    // Nada importante no centro nem na faixa de baixo ao meio (onde o Google pode sobrepor o botão de vídeo): o script mede e recusa o desenho.
    expect(script).toContain('ZONAS_LIVRES');
    expect(script).toContain('faixa inferior central');
    expect(script).toContain('o desenho invade as zonas livres do gráfico');
    expect(existsSync(join(ROOT, 'docs', 'lojas', 'capturas', 'google-play-celular-1080x1920', '01_resumo.png'))).toBe(true);
    const ficha = readFileSync(join(ROOT, 'docs', 'lojas', 'ficha.md'), 'utf8');
    expect(ficha).toContain('Mais clareza para decidir');
    expect(ficha).not.toContain('Organize seu mês e aprenda');
    const textoDoGrafico = [...script.matchAll(/<(?:h1|p)>([^<]*)<\/p>|<h1>([^<]*)<\/h1>/g)].map((m) => m[1] ?? m[2]).join(' ');
    expect(textoDoGrafico).not.toMatch(/gr[áa]tis|melhor|baixe|download|R\$|ranking|#1|\bn[úu]mero 1\b/i);
  });
});

