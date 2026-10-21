/// <reference types="node" />
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../src/contrast';

/**
 * Site público (D-064, `docs/07` seção "Site público (clarevo-site)"): `scripts/gerar-site.js` converte `docs/legal/*.md` em páginas
 * estáticas em `site/` e escreve a página inicial e o suporte a partir dos modelos do próprio script. O teste confere o conversor de
 * Markdown, que as páginas gravadas estão em dia com os textos, as regras de redação, a ausência de qualquer recurso de fora, a
 * estrutura (um `h1`, títulos sem pular nível, links internos), o contraste das cores (a regra de `src/contrast.ts`), a recusa de
 * `--final` enquanto sobrar marcador e o gráfico de recursos do Google Play (1024 x 500).
 */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SITE = join(ROOT, 'site');
const SCRIPT = join(ROOT, 'scripts', 'gerar-site.js');
const require = createRequire(import.meta.url);

interface Gerado {
  arquivos: Map<string, string | Buffer>;
  avisos: string[];
  pendencias: Map<string, string[]>;
}
const gerador = require(SCRIPT) as {
  MARCADORES: string[];
  HOSTS_DE_LINK_PERMITIDOS: string[];
  markdownParaHtml: (md: string, opcoes?: Record<string, unknown>) => string;
  titulosDoMarkdown: (md: string, opcoes?: Record<string, unknown>) => { nivel: number; texto: string; id: string }[];
  separarTitulo: (md: string) => { titulo: string | null; corpo: string };
  problemasDeTitulos: (html: string) => string[];
  pendenciasDoTexto: (texto: string, valores?: Record<string, string>) => string[];
  gerarSite: (opcoes?: { legal?: string; dados?: Record<string, string>; arquivoDados?: string }) => Gerado;
  linksQuebrados: (arquivos: Map<string, string | Buffer>) => string[];
};
const { markdownParaHtml, gerarSite, MARCADORES } = gerador;

const PAGINAS = ['index.html', 'suporte.html', 'privacidade.html', 'termos.html', 'excluir-conta.html'];
const VAZIOS = Object.fromEntries(MARCADORES.map((m) => [m, '']));
const PREENCHIDOS: Record<string, string> = {
  'RAZÃO SOCIAL': 'Empresa Exemplo Ltda',
  CNPJ: '00.000.000/0001-00',
  ENDEREÇO: 'Rua Exemplo, 1, Rio de Janeiro',
  'E-MAIL DE PRIVACIDADE': 'privacidade@exemplo.test',
  'E-MAIL DE SUPORTE': 'suporte@exemplo.test',
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

/** As verificações que valem para qualquer conjunto de páginas geradas (as gravadas em `site/` e as do texto de exemplo). */
function verificarPaginas(arquivos: Map<string, string | Buffer>, dominio: string) {
  const hosts = [...gerador.HOSTS_DE_LINK_PERMITIDOS, ...(dominio ? [dominio] : [])];
  for (const nome of PAGINAS) {
    const html = texto(arquivos.get(nome));
    expect(html.length, nome).toBeGreaterThan(500);
    expect(html, nome).toMatch(/^<!doctype html>\n<html lang="pt-BR">/);
    expect(html, `${nome}: travessão`).not.toMatch(PROIBIDO_TRAVESSAO);
    expect(html, `${nome}: expressão proibida`).not.toMatch(PROIBIDO_EXPRESSAO);
    // Sem JavaScript, sem cookies e sem nada que rastreie.
    expect(html, `${nome}: script`).not.toMatch(/<script/i);
    expect(html, `${nome}: manipulador de evento`).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html, `${nome}: atributo style (a política de segurança não permite)`).not.toMatch(/\sstyle\s*=/i);
    expect(html, `${nome}: iframe, formulário ou objeto`).not.toMatch(/<(iframe|form|object|embed|video|audio|input)\b/i);
    // Recursos (src, link, preload) só locais; links de texto só para o app, o domínio da empresa e as páginas oficiais permitidas.
    for (const m of html.matchAll(/<(?:img|link|source|script)\b[^>]*\s(?:src|href)="(https?:)?\/\/[^"]*"/gi)) expect.fail(`${nome}: recurso de fora em ${m[0]}`);
    for (const m of html.matchAll(/https?:\/\/([^\s"'<>/]+)/g)) expect(hosts, `${nome}: ${m[0]}`).toContain(m[1]);
    for (const m of html.matchAll(/<a\b[^>]*href="https?:[^"]*"[^>]*>/g)) expect(m[0], `${nome}: link externo sem noopener`).toContain('noopener');
    // Estrutura.
    expect(html.match(/<h1[\s>]/g)?.length, `${nome}: h1`).toBe(1);
    expect(gerador.problemasDeTitulos(html), nome).toEqual([]);
    expect(html.match(/<main\b/g)?.length, `${nome}: main`).toBe(1);
    expect(html, `${nome}: link para pular`).toContain('<a class="pular" href="#conteudo">Pular para o conteúdo</a>');
    expect(html, `${nome}: viewport`).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    if (nome === 'index.html' || nome === 'suporte.html') expect(html, `${nome}: cookie ou analytics`).not.toMatch(/cookie|analytics|gtag|pixel/i);
    expect(html, `${nome}: favicon`).toContain('<link rel="icon" href="favicon.svg" type="image/svg+xml">');
    expect(html, `${nome}: logotipo oficial no cabeçalho`).toMatch(/<header class="topo">[\s\S]*<img src="marca\/clarevo-logotipo-reverso\.svg" alt="[^"]+"/);
    for (const img of html.matchAll(/<img\b[^>]*>/g)) expect(img[0], `${nome}: imagem sem alt`).toMatch(/\salt="[^"]+"/);
    // Rodapé em todas: os cinco links e "[RAZÃO SOCIAL] · CNPJ [CNPJ]" (com os valores, quando houver).
    const rodape = /<footer class="rodape">([\s\S]*?)<\/footer>/.exec(html)?.[1] ?? '';
    for (const p of PAGINAS) expect(rodape, `${nome}: rodapé sem ${p}`).toContain(`<a href="${p}">`);
    expect(rodape, `${nome}: rodapé`).toMatch(/·\s*CNPJ\s/);
    expect(rodape, `${nome}: rodapé`).toMatch(/RAZÃO SOCIAL|Empresa Exemplo/);
    // A página atual está marcada no menu.
    expect(html.match(/aria-current="page"/g)?.length, `${nome}: aria-current`).toBe(1);
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

describe('site público: as páginas geradas', () => {
  const gerado = gerarSite();
  const valores = JSON.parse(readFileSync(join(SITE, 'dados-da-empresa.json'), 'utf8')) as Record<string, string>;
  const dominio = (valores['DOMÍNIO'] ?? '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  it('site/dados-da-empresa.json tem um campo para cada marcador, só com texto', () => {
    for (const m of MARCADORES) expect(typeof valores[m], m).toBe('string');
    const extras = Object.keys(valores).filter((k) => !k.startsWith('_') && !MARCADORES.includes(k));
    expect(extras).toEqual([]);
  });

  it('as páginas e os arquivos gravados em site/ estão em dia com os Markdown de docs/legal e com o script (rode: node scripts/gerar-site.js)', () => {
    const desatualizados: string[] = [];
    for (const [nome, esperado] of gerado.arquivos) {
      const arquivo = join(SITE, nome);
      if (!existsSync(arquivo)) {
        desatualizados.push(`${nome} (não existe)`);
        continue;
      }
      const atual = readFileSync(arquivo);
      const certo = typeof esperado === 'string' ? Buffer.from(esperado, 'utf8') : esperado;
      if (!atual.equals(certo)) desatualizados.push(nome);
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
      const html = texto(gerado.arquivos.get(pagina));
      if (existsSync(join(ROOT, 'docs', 'legal', md))) {
        expect(html, pagina).not.toContain('texto desta página, que vem de docs/legal');
        const titulo = gerador.separarTitulo(readFileSync(join(ROOT, 'docs', 'legal', md), 'utf8')).titulo;
        expect(titulo, `${md} precisa de um título "# ..."`).not.toBeNull();
      } else {
        expect(html, pagina).toContain('[A DEFINIR: texto desta página');
        expect(gerado.avisos.join('\n')).toContain(`docs/legal/${md} ainda não existe`);
      }
    }
  });

  it('nenhuma página tem travessão, a expressão proibida, script, atributo de evento ou endereço de fora além do permitido; um h1, títulos sem pular nível, rodapé e links internos', () => {
    verificarPaginas(gerado.arquivos, dominio);
  });

  it('com marcadores vazios, a faixa "Versão preliminar, em revisão" aparece no topo, os marcadores ficam destacados e a página não é indexada', () => {
    const g = gerarSite({ dados: VAZIOS });
    for (const nome of PAGINAS) {
      const html = texto(g.arquivos.get(nome));
      expect(html, nome).toMatch(/<body>\n<a class="pular"[^\n]*\n<div class="faixa" role="note">[\s\S]*Versão preliminar, em revisão\./);
      expect(html, nome).toContain('<meta name="robots" content="noindex">');
      expect(html, nome).toContain('<mark class="pendente">[RAZÃO SOCIAL]</mark>');
      expect(g.pendencias.get(nome)?.length, nome).toBeGreaterThan(0);
    }
    const suporte = texto(g.arquivos.get('suporte.html'));
    for (const m of ['E-MAIL DE SUPORTE', 'E-MAIL DE PRIVACIDADE', 'ENDEREÇO', 'CNPJ']) expect(suporte).toContain(`[${m}]`);
  });

  it('com todos os valores e sem [A DEFINIR], a faixa some, os valores entram (e-mail como link) e nada pendente resta', () => {
    const dir = pastaDeExemplo();
    try {
      writeFileSync(join(dir, 'politica-de-privacidade.md'), EXEMPLO.replace('[A DEFINIR: prazo]', 'cinco anos'));
      const g = gerarSite({ legal: dir, dados: PREENCHIDOS });
      for (const nome of PAGINAS) {
        const html = texto(g.arquivos.get(nome));
        expect(html, nome).not.toContain('class="faixa"');
        expect(html, nome).not.toContain('noindex');
        expect(html, nome).not.toContain('class="pendente"');
        expect(html, nome).toContain('Empresa Exemplo Ltda · CNPJ 00.000.000/0001-00');
        expect(g.pendencias.get(nome), nome).toEqual([]);
      }
      expect(texto(g.arquivos.get('suporte.html'))).toContain('<a href="mailto:suporte@exemplo.test">suporte@exemplo.test</a>');
      expect(texto(g.arquivos.get('privacidade.html'))).toContain('<h1>Política de exemplo</h1>');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('um texto jurídico de exemplo (títulos, listas, tabela, links) gera páginas que passam em todas as verificações', () => {
    const dir = pastaDeExemplo();
    try {
      const g = gerarSite({ legal: dir, dados: PREENCHIDOS });
      verificarPaginas(g.arquivos, 'exemplo.test');
      const html = texto(g.arquivos.get('privacidade.html'));
      expect(html).toContain('href="termos.html#quem-pode-usar"');
      expect(html).toContain('href="excluir-conta.html"');
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

  it('a página inicial traz o que o Clarevo é, a empresa que nunca vê finanças, o que ele não é, o app web e o aviso das lojas (sem selos)', () => {
    const html = texto(gerado.arquivos.get('index.html'));
    expect(html).toContain('<h1>Organize seu mês e aprenda</h1>');
    expect(html).toContain('organizador de finanças pessoais e da família');
    expect(html).toContain('Pode ser oferecido pela empresa como benefício');
    expect(html).toContain('A empresa nunca vê suas finanças');
    for (const frase of ['Não é banco', 'Não movimenta dinheiro', 'Não oferece crédito', 'Não recomenda produtos financeiros']) expect(html, frase).toContain(frase);
    expect(html).toContain('href="https://clarevo.pages.dev"');
    expect(html).toContain('Em breve na App Store e no Google Play.');
    expect(html).toMatch(/Para pessoas/);
    expect(html).toMatch(/Para empresas/);
    // Sem selos das lojas, preço, depoimento nem número de uso inventado.
    expect(html).not.toMatch(/<img[^>]*(apple|google|store|play)/i);
    expect(html).not.toMatch(/R\$|gr[áa]tis|depoimento|milh[õo]es|\d+\s*mil\s+(pessoas|usu)|melhor/i);
  });

  it('o suporte tem o contato, de 6 a 8 perguntas frequentes e o link para a privacidade', () => {
    const html = texto(gerado.arquivos.get('suporte.html'));
    const perguntas = [...html.matchAll(/<h3>([^<]+)<\/h3>/g)].map((m) => m[1]);
    expect(perguntas.length).toBeGreaterThanOrEqual(6);
    expect(perguntas.length).toBeLessThanOrEqual(8);
    expect(perguntas.join(' ')).toMatch(/senha/i);
    expect(perguntas.join(' ')).toMatch(/exclu/i);
    expect(perguntas.join(' ')).toMatch(/Família/);
    expect(perguntas.join(' ')).toMatch(/empresa/i);
    expect(perguntas.join(' ')).toMatch(/dados/i);
    expect(html).toContain('[E-MAIL DE SUPORTE]');
    expect(html).toContain('href="privacidade.html"');
  });

  it('o estilo não carrega nada de fora, usa só as fontes locais e tem foco visível, modo escuro e a identidade da marca', () => {
    const css = texto(gerado.arquivos.get('estilo.css'));
    expect(css).not.toMatch(/https?:|@import|\/\/[a-z]/i);
    for (const m of css.matchAll(/url\(([^)]+)\)/g)) expect(m[1], 'url() no CSS').toMatch(/^fontes\/Manrope_(500Medium|700Bold|800ExtraBold)\.ttf$/);
    expect(css).toContain(':focus-visible');
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain('--azul:#2457F5');
    expect(css).toContain('--lima:#D4F05B');
    expect(css).toContain('--texto:#17223B');
    expect(css).not.toMatch(/[\u2013\u2014]/);
    for (const peso of ['500Medium', '700Bold', '800ExtraBold']) expect(existsSync(join(SITE, 'fontes', `Manrope_${peso}.ttf`)), peso).toBe(true);
    expect(readFileSync(join(SITE, 'fontes', 'OFL.txt'), 'utf8')).toContain('SIL OPEN FONT LICENSE Version 1.1');
  });

  it('os cabeçalhos de segurança não permitem recurso de fora nem script', () => {
    const h = texto(gerado.arquivos.get('_headers'));
    expect(h).toContain("default-src 'none'");
    expect(h).not.toContain('unsafe-inline');
    expect(h).not.toContain('unsafe-eval');
    expect(h).toContain("frame-ancestors 'none'");
    expect(h).toContain('X-Content-Type-Options: nosniff');
  });

  it('o logotipo e o favicon são os arquivos de docs/marca, sem redesenho', () => {
    expect(readFileSync(join(SITE, 'marca', 'clarevo-logotipo-reverso.svg')).equals(readFileSync(join(ROOT, 'docs', 'marca', 'clarevo-logotipo-reverso.svg')))).toBe(true);
    expect(readFileSync(join(SITE, 'favicon.svg')).equals(readFileSync(join(ROOT, 'docs', 'marca', 'clarevo-simbolo.svg')))).toBe(true);
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
    ['sobre-lima', 'lima', 'faixa de versão preliminar, marcador pendente e botão principal'],
  ];
  /** [cor, fundo, onde aparece]: foco, contornos e sublinhado do menu (3:1). */
  const GRAFICOS: [string, string, string][] = [
    ['foco', 'fundo', 'anel de foco sobre o fundo'],
    ['foco', 'superficie', 'anel de foco sobre os cartões'],
    ['foco-topo', 'topo', 'anel de foco sobre o azul'],
    ['lima', 'topo', 'sublinhado da página atual e botão principal sobre o azul'],
    ['sobre-topo', 'topo', 'contorno do botão suave'],
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

  it('--final falha (código 1) e lista o que falta, sem gravar nada, enquanto sobrar marcador ou [A DEFINIR]', () => {
    const dir = mkdtempSync(join(tmpdir(), 'clarevo-final-'));
    try {
      writeFileSync(join(dir, 'vazios.json'), JSON.stringify(VAZIOS));
      const saida = join(dir, 'site');
      const r = rodar(['--final', '--dados', join(dir, 'vazios.json'), '--saida', saida]);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('--final');
      expect(r.stderr).toContain('[RAZÃO SOCIAL]');
      expect(r.stderr).toContain('[CNPJ]');
      expect(r.stderr).toContain('suporte.html: [E-MAIL DE SUPORTE]');
      expect(existsSync(saida)).toBe(false);
      // Com todos os valores mas com um [A DEFINIR] no texto, ainda falha.
      const legal = pastaDeExemplo();
      try {
        writeFileSync(join(dir, 'cheios.json'), JSON.stringify(PREENCHIDOS));
        const r2 = rodar(['--final', '--dados', join(dir, 'cheios.json'), '--legal', legal, '--saida', saida]);
        expect(r2.status).toBe(1);
        expect(r2.stderr).toContain('privacidade.html: [A DEFINIR: prazo]');
        expect(r2.stderr).not.toContain('[RAZÃO SOCIAL]');
        expect(existsSync(saida)).toBe(false);
        // Sem nenhuma pendência, passa e grava as páginas na pasta pedida.
        writeFileSync(join(legal, 'politica-de-privacidade.md'), EXEMPLO.replace('[A DEFINIR: prazo]', 'cinco anos'));
        const r3 = rodar(['--final', '--dados', join(dir, 'cheios.json'), '--legal', legal, '--saida', saida]);
        expect(r3.status, r3.stderr).toBe(0);
        for (const nome of PAGINAS) expect(existsSync(join(saida, nome)), nome).toBe(true);
        expect(readFileSync(join(saida, 'suporte.html'), 'utf8')).toContain('suporte@exemplo.test');
      } finally {
        rmSync(legal, { recursive: true, force: true });
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--final falha também com os dados e os textos atuais do repositório, enquanto houver valor vazio ou [A DEFINIR] (hoje: o advogado e a empresa ainda não entregaram)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'clarevo-final-'));
    try {
      const r = rodar(['--final', '--saida', join(dir, 'site')]);
      const atuais = JSON.parse(readFileSync(join(SITE, 'dados-da-empresa.json'), 'utf8')) as Record<string, string>;
      const algumVazio = MARCADORES.some((m) => !(atuais[m] ?? '').trim());
      if (algumVazio) {
        expect(r.status).toBe(1);
        expect(r.stderr).toContain('Falta preencher');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

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

  it('usa o subtítulo aprovado da ficha, o logotipo reverso oficial e a captura da demonstração, sem texto de preço nem selos', () => {
    const script = readFileSync(join(ROOT, 'scripts', 'gerar-grafico-loja.js'), 'utf8');
    expect(script).toContain('clarevo-logotipo-reverso.svg');
    expect(script).toContain('apple-subtitulo');
    expect(script).toContain('01_resumo.png');
    expect(existsSync(join(ROOT, 'docs', 'lojas', 'capturas', 'google-play-celular-1080x1920', '01_resumo.png'))).toBe(true);
    const ficha = readFileSync(join(ROOT, 'docs', 'lojas', 'ficha.md'), 'utf8');
    expect(ficha).toContain('Organize seu mês e aprenda');
    const textoDoGrafico = [...script.matchAll(/<(?:h1|p)>([^<]*)<\/p>|<h1>([^<]*)<\/h1>/g)].map((m) => m[1] ?? m[2]).join(' ');
    expect(textoDoGrafico).not.toMatch(/gr[áa]tis|melhor|baixe|download|R\$|ranking|#1|\bn[úu]mero 1\b/i);
  });
});
