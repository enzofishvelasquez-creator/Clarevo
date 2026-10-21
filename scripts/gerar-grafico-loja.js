#!/usr/bin/env node
/**
 * Gráfico de recursos do Google Play (D-064, `docs/16` seções 7 e 9): 1024 x 500, PNG de 24 bits sem transparência, até 1 MB.
 * Grava `apps/app/assets/loja/grafico-recursos-1024x500.png`.
 *
 * O desenho é HTML e CSS no Chromium do Playwright, com o que já existe no repositório (nada é redesenhado):
 *   - fundo azul da marca (`#2457F5`);
 *   - logotipo reverso oficial `docs/marca/clarevo-logotipo-reverso.svg`;
 *   - o subtítulo da ficha (`docs/lojas/ficha.md`, campo `apple-subtitulo`), lido do arquivo, e uma linha de recursos;
 *   - a tela Resumo da demonstração (dados fictícios, com a etiqueta "Demonstração") de `docs/lojas/capturas/`, num aparelho simples
 *     desenhado em CSS, saindo pela borda de baixo.
 * Texto e aparelho ficam fora de duas zonas livres e longe das bordas (margens de 72 px dos lados e 44 px do alto): o Google pode
 * sobrepor o botão de vídeo no centro e na faixa de baixo ao meio, então nada importante entra em `ZONAS_LIVRES` (o script confere
 * cada linha de texto e o aparelho e recusa o desenho se algo entrar). Sem preço, ranking, "melhor", "grátis", chamada para baixar
 * nem selos das lojas.
 * Fonte: Manrope (OFL), de `apps/app/assets/fonts`, embutida no HTML.
 *
 * Uso: node scripts/gerar-grafico-loja.js [arquivo de saída]
 * Navegador: Chromium do Playwright, ou CHROMIUM_PATH.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..');
const SAIDA = path.resolve(process.argv[2] || path.join(RAIZ, 'apps', 'app', 'assets', 'loja', 'grafico-recursos-1024x500.png'));
const LARGURA = 1024;
const ALTURA = 500;
const MAXIMO_BYTES = 1024 * 1024;
const AZUL = '#2457F5';
/** Zonas onde nada importante pode ficar (o botão de vídeo do Google) e a margem mínima das bordas, em pixels do gráfico. */
const ZONAS_LIVRES = [
  { nome: 'centro (botão de vídeo)', x0: 440, y0: 180, x1: 584, y1: 320 },
  { nome: 'faixa inferior central', x0: 352, y0: 340, x1: 672, y1: 500 },
];
const MARGEM_MINIMA = { x: 48, topo: 32 };
const CAPTURA = path.join(RAIZ, 'docs', 'lojas', 'capturas', 'google-play-celular-1080x1920', '01_resumo.png');

// ---- PNG sem dependências (o mesmo codificador de `gerar-icones.js`): RGB de 8 bits, filtro 0, zlib no nível máximo. ----
const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABELA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(tipo, dados) {
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
  const out = Buffer.alloc(corpo.length + 8);
  out.writeUInt32BE(dados.length, 0);
  corpo.copy(out, 4);
  out.writeUInt32BE(crc32(corpo), corpo.length + 4);
  return out;
}
function codificarPngRgb(largura, altura, rgba) {
  const linha = largura * 3 + 1;
  const cru = Buffer.alloc(linha * altura);
  for (let y = 0; y < altura; y++) {
    cru[y * linha] = 0;
    for (let x = 0; x < largura; x++) {
      const de = (y * largura + x) * 4;
      const para = y * linha + 1 + x * 3;
      if (rgba[de + 3] !== 255) throw new Error(`pixel (${x}, ${y}) não é opaco, e este PNG não pode ter transparência`);
      cru[para] = rgba[de];
      cru[para + 1] = rgba[de + 1];
      cru[para + 2] = rgba[de + 2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // RGB, sem canal alfa
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('sRGB', Buffer.from([0])),
    chunk('IDAT', zlib.deflateSync(cru, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** O subtítulo da ficha das lojas (campo `apple-subtitulo`): o gráfico usa o texto aprovado, sem copiar. */
function subtituloDaFicha() {
  const ficha = fs.readFileSync(path.join(RAIZ, 'docs', 'lojas', 'ficha.md'), 'utf8');
  const m = /<!-- campo: apple-subtitulo[^>]*-->\s*```\s*\n([^\n]+)\n```/.exec(ficha);
  if (!m) throw new Error('não achei o campo apple-subtitulo em docs/lojas/ficha.md');
  return m[1].trim();
}

const b64 = (arquivo) => fs.readFileSync(arquivo).toString('base64');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function montarHtml() {
  const fonte = (peso) => b64(path.join(RAIZ, 'apps', 'app', 'assets', 'fonts', `Manrope_${peso}.ttf`));
  const logo = b64(path.join(RAIZ, 'docs', 'marca', 'clarevo-logotipo-reverso.svg'));
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><style>
@font-face{font-family:Manrope;font-weight:600;src:url(data:font/ttf;base64,${fonte('600SemiBold')}) format("truetype")}
@font-face{font-family:Manrope;font-weight:800;src:url(data:font/ttf;base64,${fonte('800ExtraBold')}) format("truetype")}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${LARGURA}px;height:${ALTURA}px;overflow:hidden;background:${AZUL}}
body{position:relative;font-family:Manrope,sans-serif;color:#fff}
.disco{position:absolute;left:560px;top:90px;width:520px;height:520px;border-radius:50%;background:#1D47CC}
.texto{position:absolute;left:72px;top:72px;width:372px}
.texto img{display:block;width:300px;height:auto}
.barra{width:56px;height:8px;border-radius:4px;background:#D4F05B;margin:34px 0 20px}
h1{font-weight:800;font-size:46px;line-height:1.12;letter-spacing:-.01em}
p{margin-top:20px;max-width:268px;font-weight:600;font-size:21px;line-height:1.4;color:#EEF2FF}
.aparelho{position:absolute;left:676px;top:44px;width:268px;padding:10px;border-radius:44px;background:#0B1330;box-shadow:0 26px 60px rgba(6,16,64,.5),inset 0 0 0 2px #3A4A86}
.tela{width:100%;border-radius:34px 34px 0 0;overflow:hidden;background:#F6F8FC}
.tela img{display:block;width:100%;height:auto}
</style></head><body>
<div class="disco"></div>
<div class="texto" data-importante>
<img src="data:image/svg+xml;base64,${logo}" alt="Clarevo">
<div class="barra"></div>
<h1>${esc(subtituloDaFicha())}</h1>
<p>Contas a pagar, cartões, metas e Família.</p>
</div>
<div class="aparelho" data-importante><div class="tela"><img src="data:image/png;base64,${b64(CAPTURA)}" alt="Tela Resumo do Clarevo, com dados fictícios de demonstração"></div></div>
</body></html>`;
}

(async () => {
  if (!fs.existsSync(CAPTURA)) throw new Error(`a captura ${path.relative(RAIZ, CAPTURA)} não existe: rode node scripts/capturas-lojas.js`);
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    const pagina = await browser.newPage({ viewport: { width: LARGURA, height: ALTURA }, deviceScaleFactor: 1 });
    await pagina.setContent(montarHtml(), { waitUntil: 'load' });
    await pagina.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode())]));
    // O que importa (logotipo, cada linha de texto e o aparelho) não pode tocar as zonas livres nem encostar nas bordas. O aparelho sai
    // pela borda de baixo de propósito (só a margem de cima e dos lados vale para ele).
    const invasoes = await pagina.evaluate(
      ({ zonas, margem, largura }) => {
        const achados = [];
        const caixas = [];
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
            for (const r of rects) caixas.push({ r, nome: el.tagName.toLowerCase() + (aparelho ? ' (aparelho)' : ''), aparelho });
          }
        }
        for (const { r, nome, aparelho } of caixas) {
          for (const z of zonas) if (r.left < z.x1 && r.right > z.x0 && r.top < z.y1 && r.bottom > z.y0) achados.push(`${nome} entra em "${z.nome}" (x ${Math.round(r.left)}-${Math.round(r.right)}, y ${Math.round(r.top)}-${Math.round(r.bottom)})`);
          if (r.left < margem.x || r.right > largura - margem.x || r.top < margem.topo) achados.push(`${nome} fica perto demais da borda (x ${Math.round(r.left)}-${Math.round(r.right)}, y ${Math.round(r.top)})`);
          void aparelho;
        }
        return achados;
      },
      { zonas: ZONAS_LIVRES, margem: MARGEM_MINIMA, largura: LARGURA },
    );
    if (invasoes.length > 0) throw new Error(`o desenho invade as zonas livres do gráfico:\n  ${invasoes.join('\n  ')}`);
    const foto = await pagina.screenshot({ type: 'png', clip: { x: 0, y: 0, width: LARGURA, height: ALTURA } });
    // O Chromium grava o PNG com canal alfa: decodifica, confere que tudo é opaco e regrava em RGB de 24 bits.
    const rgbaB64 = await pagina.evaluate(async (png) => {
      const bin = atob(png);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const canvas = document.createElement('canvas');
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bmp, 0, 0);
      const dados = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
      let s = '';
      for (let i = 0; i < dados.length; i += 0x8000) s += String.fromCharCode.apply(null, dados.subarray(i, i + 0x8000));
      return { largura: bmp.width, altura: bmp.height, b64: btoa(s) };
    }, foto.toString('base64'));
    if (rgbaB64.largura !== LARGURA || rgbaB64.altura !== ALTURA) throw new Error(`a imagem saiu ${rgbaB64.largura}x${rgbaB64.altura}, esperado ${LARGURA}x${ALTURA}`);
    const png = codificarPngRgb(LARGURA, ALTURA, Buffer.from(rgbaB64.b64, 'base64'));
    if (png.length > MAXIMO_BYTES) throw new Error(`o PNG tem ${png.length} bytes e o Google Play aceita até ${MAXIMO_BYTES}`);
    fs.mkdirSync(path.dirname(SAIDA), { recursive: true });
    fs.writeFileSync(SAIDA, png);
    console.log(`gravado  ${path.relative(RAIZ, SAIDA)}  ${LARGURA}x${ALTURA}  RGB de 24 bits, sem transparência  ${png.length} bytes`);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
