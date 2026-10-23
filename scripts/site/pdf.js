'use strict';
/**
 * PDF A4 "Pacote para revisão jurídica" (`--pdf`): o resumo para o advogado, a política de privacidade, os termos, a exclusão de
 * conta e os pontos do contrato com empresas, nesta ordem, com os marcadores visíveis. Usa o Chromium do Playwright (ou CHROMIUM_PATH).
 * O PDF não vai para o repositório.
 */
const fs = require('node:fs');
const path = require('node:path');
const { RAIZ, MARCA, FONTES, PESOS_FONTE, DOCUMENTOS_DO_PACOTE } = require('./config');
const { esc, markdownParaHtml, separarTitulo, textoPuro } = require('./texto');

const CSS_PDF = `
@page{size:A4}
*{box-sizing:border-box}
body{margin:0;font-family:Manrope,Arial,sans-serif;font-weight:500;font-size:10.5pt;line-height:1.55;color:#17223B;overflow-wrap:break-word}
h1{font-weight:800;font-size:20pt;line-height:1.2;margin:0 0 .6em;color:#17223B}
h2{font-weight:800;font-size:14pt;line-height:1.3;margin:1.5em 0 .5em;break-after:avoid}
h3{font-weight:700;font-size:12pt;margin:1.2em 0 .4em;break-after:avoid}
h4{font-weight:700;font-size:11pt;margin:1em 0 .3em;break-after:avoid}
p,ul,ol,blockquote,pre{margin:0 0 .8em}
ul,ol{padding-left:1.3em}
li{margin:.2em 0}
a{color:#2457F5}
code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.9em;background:#EAF0FF;padding:.05em .3em;border-radius:3px}
pre{background:#EAF0FF;padding:.7em;border-radius:6px;white-space:pre-wrap}
blockquote{border-left:3pt solid #2457F5;background:#EAF0FF;padding:.5em .8em}
hr{border:0;border-top:1px solid #E3E8F2;margin:1.5em 0}
table{width:100%;border-collapse:collapse;font-size:9.5pt;margin:0 0 .8em}
th,td{border:1px solid #C9D2E6;padding:.35em .5em;text-align:left;vertical-align:top}
th{background:#EAF0FF}
tr{break-inside:avoid}
.tabela{margin:0}
.alinha-d{text-align:right}.alinha-c{text-align:center}
mark.pendente{background:#D4F05B;color:#17223B;padding:0 .2em;border-radius:3px;font-weight:700}
.doc{break-before:page}
.capa-pdf{break-before:auto;min-height:248mm}
.capa-pdf .faixa-azul{background:#2457F5;padding:16mm 12mm;border-radius:10px;margin-bottom:14mm}
.capa-pdf .faixa-azul img{display:block;height:18mm;width:auto}
.capa-pdf h1{font-size:30pt;margin-bottom:.4em}
.capa-pdf .aviso{display:inline-block;background:#D4F05B;padding:.5em .8em;border-radius:6px;font-weight:800;margin:.8em 0 1.4em}
.capa-pdf .data{color:#4B5873;margin:0}
.capa-pdf ol{margin-top:.4em}
`;

function dataPorExtenso(d = new Date()) {
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
}

/** O HTML do pacote: capa, sumário e os documentos na ordem, cada um começando em página nova. Devolve também o que faltou. */
function montarPacote({ legal, valores, data = new Date() }) {
  const avisos = [];
  const docs = [];
  for (const nome of DOCUMENTOS_DO_PACOTE) {
    const arquivo = path.join(legal, nome);
    if (!fs.existsSync(arquivo)) {
      avisos.push(`docs/legal/${nome} não existe e ficou de fora do PDF`);
      continue;
    }
    const md = fs.readFileSync(arquivo, 'utf8');
    const { titulo } = separarTitulo(md);
    const id = `doc-${nome.replace(/\.md$/, '')}`;
    const mapaLinks = Object.fromEntries(DOCUMENTOS_DO_PACOTE.map((n) => [n, `#doc-${n.replace(/\.md$/, '')}`]));
    const html = markdownParaHtml(md, { valores, prefixoId: `${id}-`, mapaLinks });
    docs.push({ nome, id, titulo: titulo ? textoPuro(titulo) : nome, html });
  }
  const logo = fs.readFileSync(path.join(MARCA, 'clarevo-logotipo-reverso.svg')).toString('base64');
  const fonte = (peso) => fs.readFileSync(path.join(FONTES, `Manrope_${peso}.ttf`)).toString('base64');
  const faces = PESOS_FONTE.map((p) => `@font-face{font-family:Manrope;font-weight:${p.slice(0, 3)};src:url(data:font/ttf;base64,${fonte(p)}) format("truetype")}`).join('\n');
  const sumario = docs.map((d) => `<li><a href="#${d.id}">${esc(d.titulo)}</a></li>`).join('');
  const capa = `<section class="doc capa-pdf">
<div class="faixa-azul"><img src="data:image/svg+xml;base64,${logo}" alt="Clarevo"></div>
<div class="miolo">
<h1>Pacote para revisão jurídica</h1>
<p class="aviso">Rascunho para revisão jurídica. Não é parecer jurídico.</p>
<p class="data">Gerado em ${esc(dataPorExtenso(data))}</p>
<p style="margin-top:1.4em">Os marcadores entre colchetes ficam visíveis e destacados: são os dados que a empresa ainda precisa informar.</p>
<p style="margin-top:1.4em"><strong>Neste pacote</strong></p>
<ol>${sumario}</ol>
</div>
</section>`;
  const corpo = docs.map((d) => `<section class="doc" id="${d.id}">\n${d.html}\n</section>`).join('\n');
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pacote para revisão jurídica · Clarevo</title><style>${faces}\n${CSS_PDF}</style></head><body>${capa}\n${corpo}</body></html>`;
  return { html, docs, avisos };
}

async function gerarPdf({ legal, valores, destino }) {
  const { html, docs, avisos } = montarPacote({ legal, valores });
  if (docs.length === 0) throw new Error(`nenhum dos documentos do pacote existe em ${path.relative(RAIZ, legal) || legal}: rode de novo quando os Markdown estiverem lá`);
  const { chromium } = require('playwright');
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    const pagina = await browser.newPage();
    await pagina.setContent(html, { waitUntil: 'load' });
    await pagina.evaluate(() => document.fonts.ready);
    fs.mkdirSync(path.dirname(path.resolve(destino)), { recursive: true });
    const rodape = `<div style="width:100%;font-family:Arial,sans-serif;font-size:9px;color:#4B5873;text-align:center">Pacote para revisão jurídica · Rascunho, não é parecer jurídico · Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>`;
    await pagina.pdf({
      path: path.resolve(destino),
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: rodape,
      margin: { top: '18mm', bottom: '18mm', left: '18mm', right: '18mm' },
    });
  } finally {
    await browser.close();
  }
  return { documentos: docs.map((d) => d.nome), avisos };
}

module.exports = { montarPacote, gerarPdf, dataPorExtenso };
