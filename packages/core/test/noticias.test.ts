/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { MAX_BYTES_DO_FEED, lerDataDoFeed, lerFeed, pareceCorpoInteiro, type ItemDoFeed } from '../src/noticias/feed';
import { CODIGO_DE_ACAO, EMPRESAS_LISTADAS, MERCADO_NO_CORPO, PALAVRAS_DE_MERCADO, REGRAS_DE_TEMA, corpoCitaMercado, foraDaLinhaEditorial, normalizar, temaDaNoticia } from '../src/noticias/filtro';
import { FONTES_NOTICIAS, FONTES_PUBLICAS, NOTICIAS_TEXT, PORTAIS_PRIVADOS, TEMAS_NOTICIAS, feedPermitido, fontesParaLer, licencaEfetiva, type FonteNoticias } from '../src/noticias/fontes';
import { MAX_TEXTO_DA_MATERIA, decodificarEntidades, filtrarHtml, frases, lerMarcacao, resolverLink, resumir, textoPuro } from '../src/noticias/html';
import { MAX_NOTICIAS, creditoDaAgenciaBrasil, creditoDaAutoria, idDaNoticia, juntarNoticias, prepararNoticia } from '../src/noticias';
import { NOTICIAS_CACHE_MS, NOTICIAS_FALHA_MS, buscarFeed, corpoDaLista, createNoticiasHandler, type NoticiasFetch } from '../src/noticias/servidor';

/**
 * Notícias do site (D-117): o leitor de feeds (com amostras reais dos feeds conferidos em 19/11/2026, em `test/fixtures/noticias`), o
 * filtro de HTML, o filtro de temas e a linha editorial, a regra de licença e de crédito, a junção das fontes e o atendimento de
 * `/api/noticias` (cópia, falhas, só os feeds configurados).
 */

const PASTA = fileURLToPath(new URL('./fixtures/noticias/', import.meta.url));
const amostra = (nome: string) => readFileSync(`${PASTA}${nome}`, 'utf8');
const fonte = (id: string): FonteNoticias => FONTES_NOTICIAS.find((f) => f.id === id)!;
/** A amostra de cada fonte configurada (a do Ministério da Fazenda e a da Receita são as dos feeds de verdade, cortados). */
const AMOSTRAS: Record<string, string> = {
  'agencia-brasil-economia': 'agencia-brasil-economia.xml',
  'bcb-noticias': 'bcb-noticias.xml',
  'bcb-notas': 'bcb-notas.xml',
  'receita-federal': 'receita-federal.xml',
  'ministerio-da-fazenda': 'ministerio-da-fazenda.xml',
};
const ler = (id: string) => lerFeed(amostra(AMOSTRAS[id]!), { base: fonte(id).feed })!;
/** O instante das amostras: 19/11/2026, 18h em Brasília. */
const AGORA = Date.parse('2026-11-19T21:00:00Z');
const TRAVESSAO = /[\u2013\u2014]/;

describe('notícias: as fontes configuradas (fontes.ts)', () => {
  it('cada fonte tem feed https conferido, host permitido, nome, página e linha de licença; os portais privados começam vazios', () => {
    expect(FONTES_PUBLICAS.map((f) => f.id)).toEqual(['agencia-brasil-economia', 'bcb-noticias', 'bcb-notas', 'receita-federal', 'ministerio-da-fazenda']);
    expect(PORTAIS_PRIVADOS).toEqual([]);
    expect(new Set(FONTES_NOTICIAS.map((f) => f.id)).size).toBe(FONTES_NOTICIAS.length);
    for (const f of FONTES_NOTICIAS) {
      const u = new URL(f.feed);
      expect(u.protocol, f.id).toBe('https:');
      expect(f.hosts, f.id).toContain(u.hostname);
      expect(new URL(f.site).protocol, f.id).toBe('https:');
      expect(f.tipo, f.id).toBe('publica');
      expect(f.linhaDeLicenca, f.id).not.toMatch(TRAVESSAO);
      expect(f.conferido, f.id).toMatch(/19\/11\/2026/);
      expect(feedPermitido(f.feed), f.id).toBe(true);
    }
  });

  it('regra de licença: Agência Brasil e gov.br com texto inteiro (Agência Brasil só com crédito dela), Banco Central só resumo', () => {
    expect(fonte('agencia-brasil-economia')).toMatchObject({ licenca: 'texto_completo', credito: 'agencia-brasil' });
    expect(fonte('receita-federal').licenca).toBe('texto_completo');
    expect(fonte('ministerio-da-fazenda').licenca).toBe('texto_completo');
    expect(fonte('bcb-noticias').licenca).toBe('so_resumo');
    expect(fonte('bcb-notas').licenca).toBe('so_resumo');
    for (const id of ['receita-federal', 'ministerio-da-fazenda']) expect(fonte(id).linhaDeLicenca).toContain('CC BY-ND 3.0');
    // Um portal privado é sempre só resumo, mesmo que alguém escreva outra licença.
    const privado: FonteNoticias = { ...fonte('agencia-brasil-economia'), id: 'portal', tipo: 'privada', licenca: 'texto_completo' };
    expect(licencaEfetiva(privado)).toBe('so_resumo');
    // "Leia direto nas fontes": uma linha por nome e página (as duas do Banco Central numa só).
    expect(fontesParaLer().map((f) => f.nome)).toEqual(['Agência Brasil', 'Banco Central do Brasil', 'Receita Federal', 'Ministério da Fazenda']);
  });

  it('os textos das páginas seguem as regras de escrita (sem travessão, sem a expressão proibida) e os temas têm rótulo', () => {
    for (const [k, v] of Object.entries(NOTICIAS_TEXT)) {
      expect(v, k).not.toMatch(TRAVESSAO);
      expect(v, k).not.toMatch(/faz\w*\s+sentido/i);
    }
    expect(Object.keys(TEMAS_NOTICIAS).sort()).toEqual(REGRAS_DE_TEMA.map((r) => r.tema).sort());
    // A frase "De onde vêm as notícias" nomeia todas as fontes (quem acrescentar uma fonte atualiza a frase).
    for (const f of fontesParaLer()) expect(NOTICIAS_TEXT.deOnde, f.nome).toContain(f.nome);
  });
});

describe('notícias: proteção contra SSRF (feedPermitido)', () => {
  it('só o endereço exato de um feed configurado, com https, sem usuário, senha nem porta', () => {
    const ab = fonte('agencia-brasil-economia').feed;
    expect(feedPermitido(ab)).toBe(true);
    for (const url of [
      ab.replace('https:', 'http:'),
      `${ab}?x=1`,
      'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml',
      'https://agenciabrasil.ebc.com.br.exemplo.test/rss/economia/feed.xml',
      'https://usuario:senha@agenciabrasil.ebc.com.br/rss/economia/feed.xml',
      'https://agenciabrasil.ebc.com.br:8443/rss/economia/feed.xml',
      'https://169.254.169.254/latest/meta-data/',
      'http://localhost/',
      'file:///etc/passwd',
      'javascript:alert(1)',
      '',
      'não é endereço',
    ]) expect(feedPermitido(url), url).toBe(false);
    expect(feedPermitido(undefined as unknown as string)).toBe(false);
    // Uma fonte mal configurada (sem https ou com host fora da lista dela) também não é buscada.
    const ruim: FonteNoticias = { ...fonte('bcb-noticias'), id: 'ruim', feed: 'http://www.bcb.gov.br/feed' };
    expect(feedPermitido(ruim.feed, [ruim])).toBe(false);
    const outroHost: FonteNoticias = { ...fonte('bcb-noticias'), id: 'outro', feed: 'https://interno.exemplo.test/feed' };
    expect(feedPermitido(outroHost.feed, [outroHost])).toBe(false);
  });
});

describe('notícias: o leitor de feeds com as amostras reais', () => {
  it('Agência Brasil (RSS 2.0): o texto inteiro vem em <description>, com autoria, assuntos e data', () => {
    const r = ler('agencia-brasil-economia');
    expect(r.formato).toBe('rss2');
    expect(r.itens).toHaveLength(5);
    const durigan = r.itens[0]!;
    expect(durigan.titulo).toBe('Durigan prevê impacto inicial da reforma tributária sobre inflação');
    expect(durigan.link).toBe('https://agenciabrasil.ebc.com.br/economia/noticia/2026-11/durigan-preve-impacto-inicial-da-reforma-tributaria-sobre-inflacao');
    expect(new Date(durigan.data!).toISOString()).toBe('2026-11-17T18:56:00.000Z');
    expect(durigan.autor).toBe('Pedro Peduzzi - Repórter da Agência Brasil');
    expect(durigan.categorias).toEqual(['Economia', 'Dario Durigan', 'Reforma Tributária', 'CAE']);
    expect(durigan.resumoHtml).toBeNull();
    expect(durigan.corpoHtml).toContain('<strong>O ministro da Fazenda, Dario Durigan');
    expect(r.itens[1]!.autor).toBe('Wellton Máximo \u2013 Repórter da Agência Brasil*');
    expect(r.itens[1]!.categorias).toContain('Ibovespa');
  });

  it('Banco Central (Atom): o texto em <content type="html">, sem autoria nem resumo; título sem caractere invisível', () => {
    const n = ler('bcb-noticias');
    expect(n.formato).toBe('atom');
    expect(n.itens.map((i) => i.titulo)).toEqual([
      'Pix celebra 6 anos como motor de inclusão e eficiência financeira em todo o Brasil',
      'BC reforça proteção ao consumidor com novas regras para oferta e contratação de crédito',
      'Inscrições para três vagas do Programa de Estágio de Pós-Graduação em Pesquisa (PEPP) são prorrogadas até 13 de novembro',
    ]);
    expect(n.itens[0]!.link).toBe('https://www.bcb.gov.br/detalhenoticia/21320/noticia');
    expect(new Date(n.itens[0]!.data!).toISOString()).toBe('2026-11-16T10:46:11.000Z');
    expect(n.itens[0]!.autor).toBeNull();
    expect(n.itens[0]!.resumoHtml).toBeNull();
    expect(n.itens[0]!.corpoHtml).toContain('href="/estabilidadefinanceira/pix"');
    const notas = ler('bcb-notas');
    expect(notas.itens.map((i) => i.titulo)).toContain('BC divulga IC-Br de outubro');
    for (const i of notas.itens) expect(i.titulo).not.toMatch(/[\u200b\ufeff]/);
  });

  it('Receita Federal (Atom) e Ministério da Fazenda (RSS 1.0): só a linha fina, sem o texto inteiro; a data da busca do gov.br', () => {
    const rf = ler('receita-federal');
    expect(rf.formato).toBe('atom');
    expect(rf.itens).toHaveLength(3);
    expect(rf.itens[0]).toMatchObject({ autor: 'Receita Federal', corpoHtml: null, categorias: ['RTC'] });
    expect(rf.itens[0]!.resumoHtml).toBe('Profissionais de contabilidade têm papel relevante na promoção da conformidade tributária.');
    expect(new Date(rf.itens[0]!.data!).toISOString()).toBe('2026-11-19T19:56:05.000Z');
    const mf = ler('ministerio-da-fazenda');
    expect(mf.formato).toBe('rss1');
    expect(mf.itens[0]!.link).toMatch(/^https:\/\/www\.gov\.br\/fazenda\/pt-br\/assuntos\/noticias\/2026\/novembro\//);
    expect(new Date(mf.itens[0]!.data!).toISOString()).toBe('2026-11-19T14:25:40.000Z');
    expect(mf.itens[0]!.categorias).toEqual(['REFORMA TRIBUTÁRIA', 'CONFORMIDADE TRIBUTÁRIA', 'TRANSPARÊNCIA', 'IVA DUAL']);
    expect(mf.itens.every((i) => i.corpoHtml === null)).toBe(true);
  });

  it('seções CDATA (inclusive com "</item>" dentro), entidades, xhtml do Atom e link pelo guid', () => {
    const rss = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>T</title>
<item><title><![CDATA[Pix & boletos: o que muda]]></title><guid isPermaLink="true">https://www.gov.br/x/a</guid>
<description>Resumo com &amp;amp; e &#233; e &#xE9; e &eacute; e &desconhecida;.</description>
<content:encoded><![CDATA[<p>Corpo com </item> no meio e <b>negrito</b>.</p>]]></content:encoded><pubDate>Wed, 18 Nov 2026 19:26:00 GMT</pubDate></item>
<item><title>Segunda</title><link>/relativo</link><pubDate>18 Nov 2026 10:00 -0300</pubDate></item></channel></rss>`;
    const r = lerFeed(rss, { base: 'https://www.gov.br/feed' })!;
    expect(r.itens).toHaveLength(2);
    expect(r.itens[0]!.titulo).toBe('Pix & boletos: o que muda');
    expect(r.itens[0]!.link).toBe('https://www.gov.br/x/a');
    expect(textoPuro(r.itens[0]!.resumoHtml!)).toBe('Resumo com & e é e é e é e &desconhecida;.');
    expect(r.itens[0]!.corpoHtml).toBe('<p>Corpo com </item> no meio e <b>negrito</b>.</p>');
    expect(new Date(r.itens[0]!.data!).toISOString()).toBe('2026-11-18T19:26:00.000Z');
    expect(r.itens[1]!.link).toBe('https://www.gov.br/relativo');
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom" xml:base="https://www.bcb.gov.br/"><entry><title type="html">A &amp;lt;b&amp;gt; B</title>
<link rel="self" href="https://www.bcb.gov.br/self"/><link href="noticia/1"/><updated>2026-11-19T10:00:00Z</updated>
<content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><p>Um <em>texto</em> &amp; mais</p></div></content></entry></feed>`;
    const a = lerFeed(atom, { base: 'https://www.bcb.gov.br/api/feed' })!;
    expect(a.itens[0]!.link).toBe('https://www.bcb.gov.br/noticia/1');
    expect(a.itens[0]!.titulo).toBe('A <b> B');
    expect(filtrarHtml(a.itens[0]!.corpoHtml!)).toBe('<p>Um <em>texto</em> &amp; mais</p>');
  });

  it('entidades declaradas no documento não são expandidas, e o que não é feed (ou é grande demais) é recusado', () => {
    const bomba = `<?xml version="1.0"?><!DOCTYPE r [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;">]><rss><channel><item><title>&b;</title><link>https://www.gov.br/x</link></item></channel></rss>`;
    expect(lerFeed(bomba, { base: 'https://www.gov.br/' })!.itens[0]!.titulo).toBe('&b;');
    expect(lerFeed('<html><body>não é feed</body></html>', { base: 'https://www.gov.br/' })).toBeNull();
    expect(lerFeed('', { base: 'https://www.gov.br/' })).toBeNull();
    expect(lerFeed(`<rss>${' '.repeat(MAX_BYTES_DO_FEED)}</rss>`, { base: 'https://www.gov.br/' })).toBeNull();
    // Muitas notícias: só as 50 primeiras.
    const muitas = `<rss><channel>${Array.from({ length: 80 }, (_, i) => `<item><title>N${i}</title><link>https://www.gov.br/${i}</link></item>`).join('')}</channel></rss>`;
    expect(lerFeed(muitas, { base: 'https://www.gov.br/' })!.itens).toHaveLength(50);
  });

  it('datas: RFC 822 (meses em inglês ou português, fusos com nome), ISO 8601 e o formato da busca do gov.br; data impossível é recusada', () => {
    const iso = (s: string) => {
      const t = lerDataDoFeed(s);
      return t === null ? null : new Date(t).toISOString();
    };
    expect(iso('Thu, 19 Nov 2026 16:39:00 -0300')).toBe('2026-11-19T19:39:00.000Z');
    expect(iso('Qui, 19 Dez 2026 16:39 BRT')).toBe('2026-12-19T19:39:00.000Z');
    expect(iso('19 Nov 2026 16:39:00 GMT')).toBe('2026-11-19T16:39:00.000Z');
    expect(iso('2026-11-19T16:56:05-03:00')).toBe('2026-11-19T19:56:05.000Z');
    expect(iso('2026-11-19T13:26:34Z')).toBe('2026-11-19T13:26:34.000Z');
    expect(iso('2026-11-19T13:26:34.123+00:00')).toBe('2026-11-19T13:26:34.000Z');
    expect(iso('2026-11-19')).toBe('2026-11-19T03:00:00.000Z');
    expect(iso('2026/11/19 11:25:40 GMT-3')).toBe('2026-11-19T14:25:40.000Z');
    expect(iso('2026/11/19 11:25:40')).toBe('2026-11-19T14:25:40.000Z');
    for (const ruim of ['31 Nov 2026 10:00 GMT', '2026-02-30', '2026-13-01', 'ontem', '', 'Thu, 19 Xyz 2026 10:00 GMT', '19 Nov 2026 10:00 QQQ', '2026-11-19T25:00:00Z', 'x'.repeat(100)]) expect(iso(ruim), ruim).toBeNull();
    expect(lerDataDoFeed(null)).toBeNull();
  });
});

describe('notícias: o filtro de HTML do texto inteiro', () => {
  it('só p, br, a (http e https, com noopener), strong, em, listas, citação, h2 e h3; nenhum atributo além do href', () => {
    const sujo = `<div class="x" style="color:red" onclick="roubar()"><h1>Título</h1><p>Texto <b>forte</b> e <i>itálico</i> e <span style="x">enfeite</span>.<br>Linha.</p>
<img src="https://imagens.exemplo.test/foto.jpg" onerror="alert(1)"><figure><img src="a.jpg"><figcaption>Foto: Agência</figcaption></figure>
<script>alert("x")</script><style>p{color:red}</style><iframe src="https://exemplo.test"></iframe><svg><circle/></svg>
<h4>Subtítulo</h4><ul><li>um</li><li>dois<ul><li>dentro</li></ul></li></ul><blockquote>Citação solta</blockquote>
<a href="https://www.gov.br/x" target="_blank" title="t">link bom</a> <a href="javascript:alert(1)">ruim</a> <a href="java&#115;cript:alert(1)">ruim2</a>
<a href=" &#10;javascript:alert(1)">ruim3</a> <a href="data:text/html,x">ruim4</a> <a href="mailto:a@b.test">e-mail</a> <a href="/relativo">relativo</a>
<table><tr><td>célula um</td><td><p>célula dois</p></td></tr></table><p></p><p>&nbsp;</p><p><br></p><SCRIPT>maiúsculo()</SCRIPT><form><input value="x"></form></div>`;
    const limpo = filtrarHtml(sujo, 'https://www.bcb.gov.br/noticia/1')!;
    expect(limpo).toBe(
      [
        '<h2>Título</h2>',
        '<p>Texto <strong>forte</strong> e <em>itálico</em> e enfeite.<br>Linha.</p>',
        '<h3>Subtítulo</h3>',
        '<ul>\n<li>um</li>\n<li>dois<ul>\n<li>dentro</li>\n</ul></li>\n</ul>',
        '<blockquote>\n<p>Citação solta</p>\n</blockquote>',
        '<p><a href="https://www.gov.br/x" rel="noopener noreferrer">link bom</a> ruim ruim2 ruim3 ruim4 e-mail <a href="https://www.bcb.gov.br/relativo" rel="noopener noreferrer">relativo</a></p>',
        '<p>célula um</p>',
        '<p>célula dois</p>',
      ].join('\n'),
    );
    expect(limpo).not.toMatch(/<img|<script|<style|<iframe|<svg|<figure|<form|<input|\son\w+=|style=|class=|target=|title=|javascript:|data:|mailto:|alert|Foto: Agência/i);
  });

  it('marcação quebrada ou maliciosa não escapa: tags aninhadas de propósito, aspas, comentários e elementos sem fechar', () => {
    const casos: [string, string][] = [
      // "<scr<script>" é uma marca "scr" com um atributo estranho: o resto vira texto escapado, nunca script.
      ['<scr<script>x</script>ipt>alert(1)</script>', '<p>xipt&gt;alert(1)</p>'],
      ['<p>a<!-- <script>alert(1)</script> -->b</p>', '<p>ab</p>'],
      ['<p><strong>sem fechar <em>nada', '<p><strong>sem fechar <em>nada</em></strong></p>'],
      ['<a href="https://www.gov.br/"><a href="https://www.bcb.gov.br/">dentro</a></a>', '<p><a href="https://www.bcb.gov.br/" rel="noopener noreferrer">dentro</a></p>'],
      ['<p title="a>b">texto</p>', '<p>texto</p>'],
      ['<p>1 < 2 e 3 > 2 &amp; &lt;b&gt;</p>', '<p>1 &lt; 2 e 3 &gt; 2 &amp; &lt;b&gt;</p>'],
      ['<img src=x onerror=alert(1)//', ''],
      ['<p onmouseover="x">ok</p><noscript><p>escondido</p></noscript><template><p>molde</p></template>', '<p>ok</p>'],
      ['<math><mi>x</mi></math><p>depois</p>', '<p>depois</p>'],
      ['<video><source src="v.mp4"></video><audio src="a.mp3"></audio><p>só texto</p>', '<p>só texto</p>'],
      ['<p>\u200bespaço\u200b invisível\ufeff</p>', '<p>espaço invisível</p>'],
      ['<A HREF="HTTPS://WWW.GOV.BR/X">Maiúsculo</A>', '<p><a href="https://www.gov.br/X" rel="noopener noreferrer">Maiúsculo</a></p>'],
    ];
    for (const [entrada, saida] of casos) expect(filtrarHtml(entrada, 'https://www.gov.br/') ?? '', entrada).toBe(saida);
    expect(filtrarHtml('')).toBeNull();
    expect(filtrarHtml('<p> </p><img src="x">')).toBeNull();
    // Texto grande demais: a matéria fica só com o link para a fonte.
    expect(filtrarHtml(`<p>${'a'.repeat(MAX_TEXTO_DA_MATERIA + 1)}</p>`)).toBeNull();
  });

  it('a matéria real da Agência Brasil sai sem imagem, sem logotipo de outro site, sem o pixel de contagem e com o texto e os links', () => {
    const it0 = ler('agencia-brasil-economia').itens[0]!;
    expect(it0.corpoHtml).toMatch(/<img src="https:\/\/cdn\.jsdelivr\.net\/[^"]+logo-agenciabrasil\.svg"/);
    expect(it0.corpoHtml).toMatch(/ebc\.png\?id=/);
    const limpo = filtrarHtml(it0.corpoHtml!, it0.link)!;
    expect(limpo).not.toMatch(/<img|jsdelivr|ebc\.png|ebc\.gif|style=|imagens\.ebc/);
    expect(limpo.startsWith('<p><strong>O ministro da Fazenda, Dario Durigan, afirmou, nesta terça-feira (17)')).toBe(true);
    expect(limpo).toContain('<h3>Notícias relacionadas:</h3>');
    expect(limpo).toContain('<h2>Tributação corporativa</h2>');
    // O texto é o mesmo do feed: só a marcação muda.
    expect(textoPuro(limpo).replace(/\s+/g, ' ')).toBe(textoPuro(it0.corpoHtml!).replace(/\s+/g, ' '));
    // A tabela da matéria da hora extra vira parágrafos, sem perder o texto.
    const horaExtra = ler('agencia-brasil-economia').itens[4]!;
    const tabela = filtrarHtml(horaExtra.corpoHtml!, horaExtra.link)!;
    expect(tabela).toContain('<p>4. Acordos e convenções coletivas</p>');
    expect(tabela).not.toMatch(/<t[dr]|<table/);
    // O Banco Central usa links relativos: saem com o endereço completo.
    const pix = ler('bcb-noticias').itens[0]!;
    expect(filtrarHtml(pix.corpoHtml!, pix.link)).toContain('<a href="https://www.bcb.gov.br/estabilidadefinanceira/pix" rel="noopener noreferrer">Pix</a>');
  });

  it('texto puro, frases e resumo curto (as primeiras frases inteiras, até duas e 300 caracteres)', () => {
    expect(textoPuro('<p>Um <b>dois</b></p><script>tres()</script><p>quatro<br>cinco</p>')).toBe('Um dois\n\nquatro\ncinco');
    expect(decodificarEntidades('&lt;&#x26;&#0;&#xD800;&nbsp;')).toBe('<&\ufffd\ufffd\u00a0');
    expect(frases('Primeira frase. Segunda? Terceira! R$ 1.000,00 não quebra. Fim')).toEqual(['Primeira frase.', 'Segunda?', 'Terceira!', 'R$ 1.000,00 não quebra.', 'Fim']);
    expect(resumir('Uma. Duas. Três.')).toBe('Uma. Duas.');
    expect(resumir(`Curta. ${'x'.repeat(320)}.`)).toBe('Curta.');
    const longa = resumir(`${'palavra '.repeat(60)}fim.`);
    expect(longa.length).toBeLessThanOrEqual(300);
    expect(longa.endsWith('\u2026')).toBe(true);
    expect(resumir('')).toBe('');
    expect(resolverLink('//www.gov.br/x', 'https://www.bcb.gov.br/')).toBe('https://www.gov.br/x');
    expect(resolverLink('ftp://x.test/a')).toBeNull();
    expect(resolverLink('https://user:pw@www.gov.br/')).toBeNull();
    expect(lerMarcacao('<a b="1" c=\'2\' d=3 e>t</a>')[0]).toEqual({ tipo: 'abre', nome: 'a', atributos: { b: '1', c: '2', d: '3', e: '' }, sozinha: false });
    expect(pareceCorpoInteiro('<p>a</p><p>b</p><p>c</p>')).toBe(true);
    expect(pareceCorpoInteiro('Uma linha fina curta.')).toBe(false);
  });
});

describe('notícias: o filtro de temas e a linha editorial da CVM', () => {
  it('as palavras ficam normalizadas, sem repetição, e cada tema tem pelo menos uma palavra', () => {
    for (const r of REGRAS_DE_TEMA) {
      const todas = [...r.fortes, ...(r.noTitulo ?? []), ...(r.fora ?? [])];
      expect(todas.length, r.tema).toBeGreaterThan(0);
      for (const p of todas) expect(normalizar(p), `${r.tema}: ${p}`).toBe(p);
      expect(new Set(todas).size, r.tema).toBe(todas.length);
    }
    for (const p of [...PALAVRAS_DE_MERCADO, ...MERCADO_NO_CORPO]) expect(normalizar(p), p).toBe(p);
    expect(new Set(EMPRESAS_LISTADAS).size).toBe(EMPRESAS_LISTADAS.length);
  });

  it('acha o tema de cada assunto de finanças pessoais', () => {
    const casos: [string, string][] = [
      ['Copom mantém a Selic em 15% ao ano', 'juros'],
      ['BC divulga Ata da 282ª reunião do Copom', 'juros'],
      ['Juros do consignado caem em outubro', 'credito'],
      ['IPCA-15 de novembro fica em 0,3%', 'inflacao'],
      ['Durigan prevê impacto inicial da reforma tributária sobre inflação', 'inflacao'],
      ['Receita abre consulta ao lote residual de restituição do IRPF 2026', 'imposto-de-renda'],
      ['Prazo da declaração do Imposto de Renda termina sexta', 'imposto-de-renda'],
      ['Pix celebra 6 anos como motor de inclusão', 'pix'],
      ['Novas regras ampliam uso do Open Finance', 'pix'],
      ['Juros do rotativo do cartão de crédito sobem', 'credito'],
      ['BC reforça proteção ao consumidor com novas regras para oferta e contratação de crédito', 'credito'],
      ['Desenrola abre renegociação de dívidas atrasadas', 'credito'],
      ['Polícia alerta para golpe da falsa central de atendimento', 'golpes'],
      ['Golpistas usam boleto falso com nome de banco', 'golpes'],
      ['FGC paga investidores de banco liquidado', 'fgc'],
      ['Tesouro Direto bate recorde de investidores', 'tesouro-e-poupanca'],
      ['BC divulga Relatório de Poupança de outubro', 'tesouro-e-poupanca'],
      ['Salário mínimo de 2027 terá aumento real', 'salario'],
      ['Segunda parcela do 13º salário deve ser paga até 20 de dezembro', 'salario'],
      ['Mais de 276 mil trabalhadores ainda não sacaram o abono salarial', 'salario'],
    ];
    for (const [titulo, tema] of casos) expect(temaDaNoticia(titulo), titulo).toBe(tema);
    // Palavra que, solta no resumo, fala de outra coisa só vale no título.
    expect(temaDaNoticia('Senado aprova projeto', 'O texto prevê juros menores para as empresas.')).toBeNull();
    expect(temaDaNoticia('Senado aprova projeto', 'A meta da Selic segue em 15%.')).toBe('juros');
  });

  it('fica de fora o que não é finanças pessoais, inclusive "golpe de Estado", dívida pública e crédito para empresas', () => {
    for (const titulo of [
      'BNDES injetou R$ 254 bi de crédito na economia de janeiro a setembro',
      'STF julga núcleo da trama golpista',
      'Tentativa de golpe de Estado: PGR denuncia acusados',
      'Senado aprova renegociação das dívidas dos estados',
      'Número de desempregados há dois anos ou mais é o menor já registrado',
      'Ministério lembra que a caderneta de vacinação deve estar em dia',
      'Brasil simplifica exportação de cosméticos para América Latina',
      'Veja como será o cálculo da hora extra com a escala de trabalho 5x2',
    ]) expect(temaDaNoticia(titulo), titulo).toBeNull();
  });

  it('linha editorial: sai notícia com código de ação, índice de bolsa, dica de mercado ou empresa listada', () => {
    for (const texto of [
      'PETR4 sobe 3% no pregão',
      'Dólar sobe para R$ 5,87. Economia. dólar. Ibovespa',
      'IFIX fecha em alta',
      'Bolsa de valores renova recorde',
      'Empresa anuncia dividendos aos acionistas',
      'Analistas veem preço-alvo maior',
      'Onde investir com a Selic a 15%',
      'Banco do Brasil lança renegociação de dívidas',
      'Nubank amplia limite do cartão',
      'Americanas entra com pedido na Justiça',
      'Copom e Itaú: o que esperar',
    ]) expect(foraDaLinhaEditorial(texto), texto).toBe(true);
    for (const texto of [
      'Banco Central do Brasil divulga a ata do Copom',
      'Ações da Receita Federal contra fraudes no Pix',
      'Tarifas americanas pressionam a inflação',
      'Vale lembrar: o 13º salário cai até 20 de dezembro',
      'IPCA-15 sobe 0,3%',
      'COP31 discute financiamento',
    ]) expect(foraDaLinhaEditorial(texto), texto).toBe(false);
    expect(CODIGO_DE_ACAO.test('KNRI11 e VALE3')).toBe(true);
    expect(CODIGO_DE_ACAO.test('IPCA15 e COP31')).toBe(false);
    expect(corpoCitaMercado('No mercado, o Ibovespa caiu 1%.')).toBe(true);
    expect(corpoCitaMercado('A bolsa de valores reagiu.')).toBe(false);
  });
});

describe('notícias: crédito, licença, resumo e junção das fontes', () => {
  it('o texto inteiro da Agência Brasil só com o crédito da própria Agência Brasil, sem parceiro nem "com informações de"', () => {
    for (const autor of ['Pedro Peduzzi - Repórter da Agência Brasil', 'Ana Cristina Campos \u2013 Repórter da Agência Brasil', 'Bruno de Freitas Moura \u2500 Repórter da Agência Brasil', 'Fabíola Sinimbú - repórter da Agência Brasil', 'Agência Brasil', ' Vitor Abdala - Repórter da Agência Brasil ']) {
      expect(creditoDaAgenciaBrasil(autor, 'Texto da matéria.'), autor).toBe(true);
    }
    for (const autor of ['Wellton Máximo \u2013 Repórter da Agência Brasil*', 'Agência Brasil*', 'Dimas Soldi - Repórter da TV Brasil', 'Priscila Thereso - Repórter da Rádio Nacional', 'Redação', '', null]) {
      expect(creditoDaAgenciaBrasil(autor, 'Texto da matéria.'), String(autor)).toBe(false);
    }
    expect(creditoDaAgenciaBrasil('Agência Brasil', 'Texto. * com informações da Reuters')).toBe(false);
    expect(creditoDaAgenciaBrasil('Agência Brasil', 'Texto. Com informações da Agência Gov.')).toBe(false);
    expect(creditoDaAgenciaBrasil('Agência Brasil', 'Segundo a agência Reuters, o mercado reagiu.')).toBe(false);
    expect(creditoDaAutoria('Pedro Peduzzi - Repórter da Agência Brasil')).toBe('Por Pedro Peduzzi, repórter da Agência Brasil');
    expect(creditoDaAutoria('Wellton Máximo \u2013 Repórter da Agência Brasil*')).toBe('Por Wellton Máximo, repórter da Agência Brasil');
    expect(creditoDaAutoria('Receita Federal')).toBe('Receita Federal');
    expect(creditoDaAutoria(null)).toBeNull();
  });

  it('com as amostras reais: a lista, o texto inteiro só onde a licença e o crédito permitem, o resumo e a mais nova primeiro', () => {
    const porFonte = FONTES_NOTICIAS.map((f) => ({ fonte: f, itens: ler(f.id).itens }));
    const lista = juntarNoticias(porFonte, AGORA, FONTES_NOTICIAS);
    expect(lista.map((n) => [n.dataTexto, n.fonte, n.tema, n.textoCompleto, n.titulo])).toEqual([
      ['17/11/2026', 'Agência Brasil', 'inflacao', false, 'Clima afeta produção e eleva preço do tomate em diversas capitais'],
      ['17/11/2026', 'Agência Brasil', 'inflacao', true, 'Durigan prevê impacto inicial da reforma tributária sobre inflação'],
      ['16/11/2026', 'Banco Central do Brasil', 'pix', false, 'Pix celebra 6 anos como motor de inclusão e eficiência financeira em todo o Brasil'],
      ['11/11/2026', 'Banco Central do Brasil', 'tesouro-e-poupanca', false, 'BC divulga Relatório de Poupança de outubro'],
      ['10/11/2026', 'Banco Central do Brasil', 'juros', false, 'BC divulga Ata da 282ª reunião do Copom'],
      ['05/11/2026', 'Banco Central do Brasil', 'credito', false, 'BC reforça proteção ao consumidor com novas regras para oferta e contratação de crédito'],
    ]);
    const [tomate, durigan, pix] = lista;
    // Agência Brasil com crédito próprio: texto inteiro e o primeiro parágrafo como resumo.
    expect(durigan!.resumo).toBe('O ministro da Fazenda, Dario Durigan, afirmou, nesta terça-feira (17), que a implementação da reforma tributária pode gerar pequeno impacto inicial sobre a inflação. A observação foi em resposta à preocupação manifestada por senadores com uma eventual alta do índice.');
    expect(durigan!.autor).toBe('Por Pedro Peduzzi, repórter da Agência Brasil');
    expect(durigan!.html).toContain('<h2>Tributação corporativa</h2>');
    expect(durigan!.licenca).toBe(fonte('agencia-brasil-economia').linhaDeLicenca);
    // Matéria da TV Brasil republicada pela Agência Brasil: só título e link (o corpo nunca vira resumo).
    expect(tomate).toMatchObject({ textoCompleto: false, resumo: null, html: null, autor: 'Por Dimas Soldi, repórter da TV Brasil' });
    // Banco Central: só resumo pela licença, e o feed não traz resumo à parte, então fica só o título.
    expect(pix).toMatchObject({ textoCompleto: false, resumo: null, html: null, autor: null, link: 'https://www.bcb.gov.br/detalhenoticia/21320/noticia' });
    // De fora: a do dólar (Ibovespa e parceiro), a do BNDES (crédito para empresas), a da hora extra e as de reforma tributária do gov.br.
    const titulos = lista.map((n) => n.titulo).join('\n');
    expect(titulos).not.toMatch(/Dólar sobe|BNDES|hora extra|Cash Out|Prisma Fiscal|IBS/);
    for (const n of lista) {
      expect(n.id).toMatch(/^[0-9a-f]{16}$/);
      expect(n.id).toBe(idDaNoticia(n.link));
      expect(n.temaRotulo).toBe(TEMAS_NOTICIAS[n.tema]);
    }
  });

  it('gov.br (amostra real da busca da Receita): a linha fina como resumo, ao pé da letra, e "Ler na fonte" (o feed não traz o texto inteiro)', () => {
    const itens = lerFeed(amostra('receita-federal-busca-restituicao.xml'), { base: fonte('receita-federal').feed })!.itens;
    const lista = juntarNoticias([{ fonte: fonte('receita-federal'), itens }], AGORA);
    expect(lista.map((n) => n.tema)).toEqual(['imposto-de-renda', 'imposto-de-renda']);
    for (const n of lista) {
      expect(n.textoCompleto).toBe(false);
      expect(n.fonte).toBe('Receita Federal');
      const original = itens.find((i) => i.link === n.link)!;
      expect(n.resumo).toBe(resumir(textoPuro(original.resumoHtml!)));
    }
  });

  it('portal privado: o resumo é só a linha fina do próprio feed, cortada em até duas frases; um description com a matéria inteira não vira resumo', () => {
    const portal: FonteNoticias = { id: 'portal', nome: 'Portal de Exemplo', site: 'https://portal.exemplo.test/', feed: 'https://portal.exemplo.test/feed', hosts: ['portal.exemplo.test'], tipo: 'privada', licenca: 'texto_completo', linhaDeLicenca: 'Notícia do Portal de Exemplo.', conferido: '19/11/2026' };
    const base: ItemDoFeed = { titulo: 'Copom mantém a Selic', link: 'https://portal.exemplo.test/a', data: AGORA - 3600_000, autor: 'Repórter', categorias: [], resumoHtml: '<p>Primeira frase do portal. Segunda frase. Terceira frase que não entra.</p>', corpoHtml: `<p>${'Corpo inteiro da matéria. '.repeat(40)}</p>` };
    const n = prepararNoticia(base, portal, AGORA)!;
    expect(n).toMatchObject({ resumo: 'Primeira frase do portal. Segunda frase.', textoCompleto: false, html: null, fonte: 'Portal de Exemplo' });
    const corpoNoDescription = lerFeed(`<rss><channel><item><title>Copom mantém a Selic</title><link>https://portal.exemplo.test/b</link><pubDate>Thu, 19 Nov 2026 10:00:00 -0300</pubDate><description>${`&lt;p&gt;${'Texto da matéria. '.repeat(50)}&lt;/p&gt;`.repeat(3)}</description></item></channel></rss>`, { base: portal.feed })!.itens[0]!;
    expect(prepararNoticia(corpoNoDescription, portal, AGORA)).toMatchObject({ resumo: null, textoCompleto: false, html: null });
  });

  it('descarta notícia sem título, sem link, sem data, com data no futuro ou com link para fora dos sites da fonte; corpo curto ou com mercado fica sem texto inteiro', () => {
    const ab = fonte('agencia-brasil-economia');
    const corpo = `<p>${'O Copom manteve a Selic. '.repeat(30)}</p>`;
    const base: ItemDoFeed = { titulo: 'Copom mantém a Selic', link: 'https://agenciabrasil.ebc.com.br/economia/x', data: AGORA, autor: 'Agência Brasil', categorias: [], resumoHtml: null, corpoHtml: corpo };
    expect(prepararNoticia(base, ab, AGORA)?.textoCompleto).toBe(true);
    expect(prepararNoticia({ ...base, titulo: '' }, ab, AGORA)).toBeNull();
    expect(prepararNoticia({ ...base, link: null }, ab, AGORA)).toBeNull();
    expect(prepararNoticia({ ...base, data: null }, ab, AGORA)).toBeNull();
    expect(prepararNoticia({ ...base, data: AGORA + 3 * 86_400_000 }, ab, AGORA)).toBeNull();
    expect(prepararNoticia({ ...base, link: 'https://golpe.exemplo.test/x' }, ab, AGORA)).toBeNull();
    expect(prepararNoticia({ ...base, corpoHtml: '<p>O Copom manteve a Selic. Leia mais.</p>' }, ab, AGORA)?.textoCompleto).toBe(false);
    expect(prepararNoticia({ ...base, corpoHtml: `${corpo}<p>No mercado, o Ibovespa caiu 1%.</p>` }, ab, AGORA)?.textoCompleto).toBe(false);
  });

  it('junção: tira as repetidas (mesmo link ou mesmo título, fica a que tem o texto inteiro), põe a mais nova primeiro e guarda no máximo 30', () => {
    const ab = fonte('agencia-brasil-economia');
    const rf = fonte('receita-federal');
    const corpo = `<p>${'A Receita paga a restituição do Imposto de Renda. '.repeat(20)}</p>`;
    const item = (titulo: string, link: string, horas: number, comCorpo = false): ItemDoFeed => ({ titulo, link, data: AGORA - horas * 3600_000, autor: 'Agência Brasil', categorias: [], resumoHtml: comCorpo ? null : 'Restituição do Imposto de Renda.', corpoHtml: comCorpo ? corpo : null });
    const lista = juntarNoticias(
      [
        { fonte: rf, itens: [item('Receita paga restituição do IR', 'https://www.gov.br/a', 2), item('Lote de restituição do IR', 'https://www.gov.br/b', 5)] },
        { fonte: ab, itens: [item('Receita paga restituição do IR!', 'https://agenciabrasil.ebc.com.br/a', 3, true), item('Outra sobre restituição', 'https://agenciabrasil.ebc.com.br/c', 1)] },
      ],
      AGORA,
    );
    expect(lista.map((n) => [n.fonte, n.titulo])).toEqual([
      ['Agência Brasil', 'Outra sobre restituição'],
      ['Agência Brasil', 'Receita paga restituição do IR!'],
      ['Receita Federal', 'Lote de restituição do IR'],
    ]);
    const muitas = Array.from({ length: 45 }, (_, i) => item(`Restituição do IR número ${i}`, `https://www.gov.br/n${i}`, i));
    const cortada = juntarNoticias([{ fonte: rf, itens: muitas }], AGORA);
    expect(cortada).toHaveLength(MAX_NOTICIAS);
    expect(cortada[0]!.titulo).toBe('Restituição do IR número 0');
    expect(idDaNoticia('https://www.gov.br/a#x')).toBe(idDaNoticia('https://www.gov.br/a'));
    expect(idDaNoticia('https://www.gov.br/a')).not.toBe(idDaNoticia('https://www.gov.br/b'));
  });
});

describe('notícias: o atendimento de /api/noticias (servidor.ts)', () => {
  /** O `fetch` simulado: responde cada feed configurado com a amostra dele e guarda cada endereço pedido. */
  function fetchDasFontes(opcoes: { falhar?: string[]; xml?: Record<string, string> } = {}) {
    const pedidos: { url: string; init: { timeoutMs: number; maxBytes: number } }[] = [];
    const f = vi.fn<NoticiasFetch>(async (url, init) => {
      pedidos.push({ url, init });
      const fnt = FONTES_NOTICIAS.find((x) => x.feed === url);
      if (!fnt) throw new Error(`endereço que não é de feed configurado: ${url}`);
      if (opcoes.falhar?.includes(fnt.id)) return { ok: false, status: 500, text: async () => '' };
      return { ok: true, status: 200, text: async () => opcoes.xml?.[fnt.id] ?? amostra(AMOSTRAS[fnt.id]!) };
    });
    return { f, pedidos };
  }

  it('GET da lista: busca só os feeds configurados, com prazo e teto, e devolve as notícias sem o texto inteiro, com a hora e as fontes', async () => {
    const { f, pedidos } = fetchDasFontes();
    const atender = createNoticiasHandler({ fetch: f, agora: () => AGORA });
    const r = await atender({ method: 'GET', rota: 'lista' });
    expect(r.status).toBe(200);
    expect(r.headers).toEqual({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=900' });
    expect(pedidos.map((p) => p.url).sort()).toEqual(FONTES_NOTICIAS.map((x) => x.feed).sort());
    for (const p of pedidos) expect(p.init).toEqual({ timeoutMs: 8000, maxBytes: MAX_BYTES_DO_FEED });
    const corpo = JSON.parse(r.body) as { atualizado: string; consultadoEm: string; fontes: { nome: string; site: string }[]; noticias: Record<string, unknown>[] };
    expect(corpo.atualizado).toBe('Atualizado em 19/11/2026 às 18:00, horário de Brasília.');
    expect(corpo.consultadoEm).toBe('2026-11-19T21:00:00.000Z');
    expect(corpo.fontes.map((x) => x.nome)).toEqual(['Agência Brasil', 'Banco Central do Brasil', 'Receita Federal', 'Ministério da Fazenda']);
    expect(corpo.noticias).toHaveLength(6);
    for (const n of corpo.noticias) expect(Object.keys(n).sort()).toEqual(['data', 'dataTexto', 'fonte', 'fonteId', 'id', 'link', 'resumo', 'tema', 'temaRotulo', 'textoCompleto', 'titulo']);
    expect(r.body).not.toMatch(/<p>|<strong>|Por Pedro Peduzzi/);
  });

  it('a matéria: 200 só para notícia com texto inteiro; só resumo, desconhecida ou id inválido dão 404 ou 400, sem buscar nada a mais', async () => {
    const { f, pedidos } = fetchDasFontes();
    const atender = createNoticiasHandler({ fetch: f, agora: () => AGORA });
    const lista = JSON.parse((await atender({ method: 'GET', rota: 'lista' })).body).noticias as { id: string; textoCompleto: boolean; titulo: string }[];
    const comTexto = lista.find((n) => n.textoCompleto)!;
    const soResumo = lista.find((n) => !n.textoCompleto)!;
    const m = await atender({ method: 'GET', rota: 'materia', id: comTexto.id });
    expect(m.status).toBe(200);
    const materia = JSON.parse(m.body) as { titulo: string; autor: string; licenca: string; html: string; link: string };
    expect(materia.titulo).toBe(comTexto.titulo);
    expect(materia.autor).toBe('Por Pedro Peduzzi, repórter da Agência Brasil');
    expect(materia.licenca).toContain('Agência Brasil');
    expect(materia.html).not.toMatch(/<img|<script|style=/);
    expect((await atender({ method: 'GET', rota: 'materia', id: soResumo.id })).status).toBe(404);
    expect((await atender({ method: 'GET', rota: 'materia', id: '0123456789abcdef' })).status).toBe(404);
    for (const id of ['https://169.254.169.254/', '../etc/passwd', 'ABCDEF0123456789', '', null, undefined]) {
      const r = await atender({ method: 'GET', rota: 'materia', id });
      expect(r.status, String(id)).toBe(400);
      expect(r.headers['Cache-Control']).toBe('no-store');
    }
    // Só os cinco feeds, uma vez: nenhum endereço de matéria, de link ou do pedido foi buscado.
    expect(pedidos.map((p) => p.url).sort()).toEqual(FONTES_NOTICIAS.map((x) => x.feed).sort());
  });

  it('a cópia vale uma hora; HEAD sem corpo; só GET e HEAD', async () => {
    let t = AGORA;
    const { f } = fetchDasFontes();
    const atender = createNoticiasHandler({ fetch: f, agora: () => t });
    await atender({ method: 'GET', rota: 'lista' });
    await atender({ method: 'GET', rota: 'lista' });
    const head = await atender({ method: 'HEAD', rota: 'lista' });
    expect(head.status).toBe(200);
    expect(head.body).toBe('');
    expect(f).toHaveBeenCalledTimes(FONTES_NOTICIAS.length);
    t += NOTICIAS_CACHE_MS + 1;
    await atender({ method: 'GET', rota: 'lista' });
    expect(f).toHaveBeenCalledTimes(FONTES_NOTICIAS.length * 2);
    const post = await atender({ method: 'POST', rota: 'lista' });
    expect(post.status).toBe(405);
    expect(post.headers.Allow).toBe('GET, HEAD');
  });

  it('feed que falha fica com as notícias da busca anterior e tenta de novo em 5 minutos; sem nenhum feed e sem cópia, 503, sem repetir a busca antes de 5 minutos', async () => {
    let t = AGORA;
    let falhar: string[] = [];
    const pedidos: string[] = [];
    const f: NoticiasFetch = async (url) => {
      pedidos.push(url);
      const fnt = FONTES_NOTICIAS.find((x) => x.feed === url)!;
      if (falhar.includes(fnt.id)) return { ok: false, status: 503, text: async () => '' };
      return { ok: true, status: 200, text: async () => amostra(AMOSTRAS[fnt.id]!) };
    };
    const atender = createNoticiasHandler({ fetch: f, agora: () => t });
    const antes = JSON.parse((await atender({ method: 'GET', rota: 'lista' })).body).noticias.length;
    falhar = ['agencia-brasil-economia'];
    t += NOTICIAS_CACHE_MS + 1;
    const parcial = JSON.parse((await atender({ method: 'GET', rota: 'lista' })).body).noticias;
    expect(parcial.length).toBe(antes); // A Agência Brasil continua com as notícias da busca anterior.
    const n = pedidos.length;
    t += NOTICIAS_FALHA_MS - 1000;
    await atender({ method: 'GET', rota: 'lista' });
    expect(pedidos.length).toBe(n);
    t += 2000;
    await atender({ method: 'GET', rota: 'lista' });
    expect(pedidos.length).toBe(n + FONTES_NOTICIAS.length);

    // Um atendimento novo, com tudo fora do ar: 503 e nada de buscar de novo antes de 5 minutos.
    const fora: string[] = [];
    let t2 = AGORA;
    const nada = createNoticiasHandler({ fetch: async (url) => (fora.push(url), { ok: false, status: 500, text: async () => '' }), agora: () => t2 });
    const r = await nada({ method: 'GET', rota: 'lista' });
    expect(r.status).toBe(503);
    expect(JSON.parse(r.body)).toEqual({ erro: 'indisponivel' });
    expect(r.headers['Cache-Control']).toBe('no-store');
    expect((await nada({ method: 'GET', rota: 'materia', id: '0123456789abcdef' })).status).toBe(503);
    expect(fora).toHaveLength(FONTES_NOTICIAS.length);
    t2 += NOTICIAS_FALHA_MS + 1;
    await nada({ method: 'GET', rota: 'lista' });
    expect(fora).toHaveLength(FONTES_NOTICIAS.length * 2);
  });

  it('feed grande demais, que não é feed ou que lança erro conta como falha; pedidos ao mesmo tempo esperam a mesma busca', async () => {
    const ab = fonte('agencia-brasil-economia');
    for (const text of [async () => null, async () => 'x'.repeat(MAX_BYTES_DO_FEED + 1), async () => '<html>não é feed</html>', async () => { throw new Error('rede'); }]) {
      expect(await buscarFeed(ab, { fetch: async () => ({ ok: true, status: 200, text }) })).toBeNull();
    }
    expect(await buscarFeed(ab, { fetch: async () => { throw new Error('rede'); } })).toBeNull();
    // Uma fonte com endereço fora da regra nunca é buscada.
    const ruim: FonteNoticias = { ...ab, id: 'ruim', feed: 'http://agenciabrasil.ebc.com.br/rss/economia/feed.xml' };
    const espiao = vi.fn<NoticiasFetch>();
    expect(await buscarFeed(ruim, { fetch: espiao, fontes: [ruim] })).toBeNull();
    expect(espiao).not.toHaveBeenCalled();
    const { f } = fetchDasFontes();
    const atender = createNoticiasHandler({ fetch: f, agora: () => AGORA });
    await Promise.all([atender({ method: 'GET', rota: 'lista' }), atender({ method: 'GET', rota: 'lista' }), atender({ method: 'HEAD', rota: 'lista' })]);
    expect(f).toHaveBeenCalledTimes(FONTES_NOTICIAS.length);
    expect(JSON.parse(corpoDaLista([], '2026-11-19T21:00:00.000Z')).noticias).toEqual([]);
  });
});
