#!/usr/bin/env node
/**
 * Imagem de compartilhamento do site (Open Graph, D-065): 1200 x 630, PNG de 24 bits sem transparência. Grava
 * `site-src/imagens/og-clarevo-1200x630.png`, que `scripts/gerar-site.js` copia para `site/og/clarevo.png`.
 *
 * No mesmo padrão de `scripts/gerar-grafico-loja.js` (nada é redesenhado): HTML e CSS no Chromium do Playwright, fundo azul da marca
 * (`#2457F5`), logotipo reverso oficial `docs/marca/clarevo-logotipo-reverso.svg`, a mensagem central e a frase de apoio da ficha
 * das lojas (`docs/lojas/ficha.md`, campos `mensagem-central` e `frase-de-apoio`, lidos do arquivo; D-068) e a tela Resumo da demonstração (dados fictícios, com a etiqueta
 * "Demonstração") num aparelho simples desenhado em CSS. Sem preço, ranking, "melhor", "grátis" nem selos das lojas. O script
 * confere que o texto e o aparelho ficam longe das bordas, e recusa o desenho se algo encostar.
 * Fonte: Manrope (OFL), de `apps/app/assets/fonts`, embutida no HTML.
 *
 * Uso: node scripts/gerar-og-site.js [arquivo de saída]
 * Navegador: Chromium do Playwright, ou CHROMIUM_PATH.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const png = require('./site/png');

const RAIZ = path.join(__dirname, '..');
const SAIDA = path.resolve(process.argv[2] || path.join(RAIZ, 'site-src', 'imagens', 'og-clarevo-1200x630.png'));
const LARGURA = 1200;
const ALTURA = 630;
const MAXIMO_BYTES = 600 * 1024;
const AZUL = '#2457F5';
const MARGEM = { x: 64, topo: 48 };
const CAPTURA = path.join(RAIZ, 'docs', 'lojas', 'capturas', 'apple-iphone-6-3pol-1206x2622', '01_resumo.png');

/** Um campo da ficha das lojas (`docs/lojas/ficha.md`): a imagem usa o texto aprovado, sem copiar. */
function campoDaFicha(nome) {
  const ficha = fs.readFileSync(path.join(RAIZ, 'docs', 'lojas', 'ficha.md'), 'utf8');
  const m = new RegExp(`<!-- campo: ${nome}[^>]*-->\\s*\`\`\`\\s*\\n([^\\n]+)\\n\`\`\``).exec(ficha);
  if (!m) throw new Error(`não achei o campo ${nome} em docs/lojas/ficha.md`);
  return m[1].trim();
}

const b64 = (arquivo) => fs.readFileSync(arquivo).toString('base64');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function montarHtml() {
  const fonte = (peso) => b64(path.join(RAIZ, 'apps', 'app', 'assets', 'fonts', `Manrope_${peso}.ttf`));
  const logo = b64(path.join(RAIZ, 'docs', 'marca', 'clarevo-logotipo-reverso.svg'));
  // A captura é reduzida antes de entrar, só para o HTML não ficar com 250 KB a mais do que o necessário.
  const tela = png.codificar(png.reduzir(png.decodificar(fs.readFileSync(CAPTURA)), 720)).toString('base64');
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><style>
@font-face{font-family:Manrope;font-weight:600;src:url(data:font/ttf;base64,${fonte('600SemiBold')}) format("truetype")}
@font-face{font-family:Manrope;font-weight:800;src:url(data:font/ttf;base64,${fonte('800ExtraBold')}) format("truetype")}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${LARGURA}px;height:${ALTURA}px;overflow:hidden;background:${AZUL}}
body{position:relative;font-family:Manrope,sans-serif;color:#fff}
.disco{position:absolute;left:640px;top:60px;width:720px;height:720px;border-radius:50%;background:#1D47CC}
.texto{position:absolute;left:${MARGEM.x}px;top:68px;width:660px}
.texto img{display:block;width:320px;height:auto}
.barra{width:72px;height:10px;border-radius:5px;background:#D4F05B;margin:38px 0 26px}
h1{font-weight:800;font-size:56px;line-height:1.1;letter-spacing:-.015em;max-width:590px}
p{margin-top:24px;max-width:560px;font-weight:600;font-size:27px;line-height:1.38;color:#EEF2FF}
p.apoio{margin-top:26px;font-weight:800;font-size:31px;color:#D4F05B}
.aparelho{position:absolute;left:810px;top:56px;width:312px;padding:11px;border-radius:50px;background:#0B1330;box-shadow:0 30px 70px rgba(6,16,64,.5),inset 0 0 0 2px #3A4A86}
.tela{width:100%;border-radius:40px 40px 0 0;overflow:hidden;background:#F6F8FC}
.tela img{display:block;width:100%;height:auto}
</style></head><body>
<div class="disco"></div>
<div class="texto" data-importante>
<img src="data:image/svg+xml;base64,${logo}" alt="Clarevo">
<div class="barra"></div>
<h1>${esc(campoDaFicha('mensagem-central'))}</h1>
<p class="apoio">${esc(campoDaFicha('frase-de-apoio'))}.</p>
<p>Contas a pagar, cartões, metas e Família, sem anúncios.</p>
</div>
<div class="aparelho" data-importante><div class="tela"><img src="data:image/png;base64,${tela}" alt="Tela Resumo da Clarevo, com dados fictícios de demonstração"></div></div>
</body></html>`;
}

(async () => {
  if (!fs.existsSync(CAPTURA)) throw new Error(`a captura ${path.relative(RAIZ, CAPTURA)} não existe: rode node scripts/capturas-lojas.js`);
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    const pagina = await browser.newPage({ viewport: { width: LARGURA, height: ALTURA }, deviceScaleFactor: 1 });
    await pagina.setContent(montarHtml(), { waitUntil: 'load' });
    await pagina.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode())]));
    const invasoes = await pagina.evaluate(
      ({ margem, largura }) => {
        const achados = [];
        for (const raiz of document.querySelectorAll('[data-importante]')) {
          const aparelho = raiz.classList.contains('aparelho');
          const itens = aparelho ? [raiz] : [...raiz.querySelectorAll('img, h1, p')];
          for (const el of itens) {
            const rects = [];
            if (el.tagName === 'IMG' || aparelho) rects.push(el.getBoundingClientRect());
            else {
              const faixa = document.createRange();
              faixa.selectNodeContents(el);
              rects.push(...faixa.getClientRects());
            }
            for (const r of rects) if (r.left < margem.x || r.right > largura - margem.x || r.top < margem.topo) achados.push(`${el.tagName.toLowerCase()} fica perto demais da borda (x ${Math.round(r.left)}-${Math.round(r.right)}, y ${Math.round(r.top)})`);
          }
        }
        return achados;
      },
      { margem: MARGEM, largura: LARGURA },
    );
    if (invasoes.length > 0) throw new Error(`o desenho encosta nas bordas:\n  ${invasoes.join('\n  ')}`);
    const foto = await pagina.screenshot({ type: 'png', clip: { x: 0, y: 0, width: LARGURA, height: ALTURA } });
    const img = png.decodificar(foto);
    if (img.largura !== LARGURA || img.altura !== ALTURA) throw new Error(`a imagem saiu ${img.largura}x${img.altura}, esperado ${LARGURA}x${ALTURA}`);
    const saida = png.codificar(img, { paleta: false });
    if (saida.length > MAXIMO_BYTES) throw new Error(`o PNG tem ${saida.length} bytes (mais do que ${MAXIMO_BYTES})`);
    fs.mkdirSync(path.dirname(SAIDA), { recursive: true });
    fs.writeFileSync(SAIDA, saida);
    console.log(`gravado  ${path.relative(RAIZ, SAIDA)}  ${LARGURA}x${ALTURA}  RGB de 24 bits, sem transparência  ${saida.length} bytes`);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
