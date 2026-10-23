#!/usr/bin/env node
/**
 * PNG do logotipo e do símbolo para o kit de imprensa do site (D-066, `docs/22_SITE.md`). Nada é redesenhado: cada PNG é o SVG de
 * `docs/marca/` desenhado pelo Chromium do Playwright, com fundo transparente, e gravado em `site-src/imprensa/`. O desenho é o do SVG, sem
 * mudança: o que o PNG acrescenta é só uma margem transparente em volta (o respiro), porque o logotipo do SVG vai até a borda e quem o
 * coloca num documento ou numa página costuma encostá-lo em outras coisas. A margem existe só na exportação, não no SVG. O gerador do site
 * (`scripts/gerar-site.js`) copia os SVG de `docs/marca/` e estes PNG para `site/imprensa/`.
 *
 * `site-src/imprensa/origem.json` guarda o resumo SHA-256 de cada SVG de onde o PNG saiu, o tamanho do PNG e a margem em pixels: o teste do site confere que os SVG de
 * `docs/marca/` ainda têm esse resumo, e assim um logotipo que mudou sem refazer o PNG aparece sem precisar do Chromium.
 *
 * Uso:
 *   node scripts/gerar-marca-imprensa.js              grava os PNG e o origem.json
 *   node scripts/gerar-marca-imprensa.js --verificar  não grava: sai com erro se algum PNG ou o origem.json não bate com os SVG
 *                                                     (a conferência do PNG é pelos pixels, no Chromium)
 * Navegador: Chromium do Playwright, ou CHROMIUM_PATH.
 */
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..');
const MARCA = path.join(RAIZ, 'docs', 'marca');
const SAIDA = path.join(RAIZ, 'site-src', 'imprensa');

/**
 * O nome de cada arquivo, a largura do DESENHO (a altura sai da proporção do `viewBox` do SVG) e a margem transparente que o PNG ganha em
 * cada lado, em pixels. O PNG fica `largura + 2 * margem` de largura. A margem do logotipo é 4% da largura do desenho (20% da altura dele)
 * e a do símbolo, 8%: o símbolo é quadrado e costuma ir sozinho num ícone, então pede um pouco mais de ar.
 */
const ARQUIVOS = [
  { svg: 'clarevo-logotipo.svg', largura: 2400, margem: 96 },
  { svg: 'clarevo-logotipo-reverso.svg', largura: 2400, margem: 96 },
  { svg: 'clarevo-logotipo-uma-cor.svg', largura: 2400, margem: 96 },
  { svg: 'clarevo-simbolo.svg', largura: 1024, margem: 80 },
  { svg: 'clarevo-simbolo-reverso.svg', largura: 1024, margem: 80 },
  { svg: 'clarevo-simbolo-uma-cor.svg', largura: 1024, margem: 80 },
];

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** Largura e altura do `viewBox` de um SVG da marca. */
function proporcao(svg) {
  const m = /viewBox="\s*(-?[\d.]+)\s+(-?[\d.]+)\s+([\d.]+)\s+([\d.]+)\s*"/.exec(svg);
  if (!m) throw new Error('o SVG não tem viewBox');
  return { largura: Number(m[3]), altura: Number(m[4]) };
}

async function desenhar(navegador, svg, largura, margem) {
  const p = proporcao(svg);
  const altura = Math.round((largura * p.altura) / p.largura);
  const totalLargura = largura + 2 * margem;
  const totalAltura = altura + 2 * margem;
  const pagina = await navegador.newPage({ viewport: { width: totalLargura, height: totalAltura }, deviceScaleFactor: 1 });
  const uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  await pagina.setContent(`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}img{display:block;margin:${margem}px;width:${largura}px;height:${altura}px}</style><img src="${uri}" alt="">`);
  await pagina.evaluate(() => document.querySelector('img').decode());
  const png = await pagina.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: totalLargura, height: totalAltura } });
  await pagina.close();
  return { png, largura: totalLargura, altura: totalAltura };
}

/** Compara dois PNG pixel a pixel no Chromium (a compressão muda com a versão do zlib sem mudar a imagem). */
async function mesmosPixels(navegador, a, b) {
  const pagina = await navegador.newPage();
  const r = await pagina.evaluate(
    async ({ x, y }) => {
      const ler = async (b64) => {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        const canvas = document.createElement('canvas');
        canvas.width = bmp.width;
        canvas.height = bmp.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(bmp, 0, 0);
        return { l: bmp.width, a: bmp.height, d: ctx.getImageData(0, 0, bmp.width, bmp.height).data };
      };
      const [i, j] = [await ler(x), await ler(y)];
      if (i.l !== j.l || i.a !== j.a) return false;
      for (let k = 0; k < i.d.length; k++) if (i.d[k] !== j.d[k]) return false;
      return true;
    },
    { x: a.toString('base64'), y: b.toString('base64') },
  );
  await pagina.close();
  return r;
}

(async () => {
  const verificar = process.argv.includes('--verificar');
  const navegador = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const origem = {};
  let divergentes = 0;
  fs.mkdirSync(SAIDA, { recursive: true });
  for (const a of ARQUIVOS) {
    const svg = fs.readFileSync(path.join(MARCA, a.svg));
    const { png, largura, altura } = await desenhar(navegador, svg.toString('utf8'), a.largura, a.margem);
    const nome = a.svg.replace(/\.svg$/, '.png');
    origem[a.svg] = { sha256: sha256(svg), png: nome, largura, altura, margem: a.margem };
    const alvo = path.join(SAIDA, nome);
    if (verificar) {
      const ok = fs.existsSync(alvo) && (await mesmosPixels(navegador, fs.readFileSync(alvo), png));
      if (!ok) divergentes++;
      console.log(`${ok ? 'OK      ' : 'DIVERGE '} site-src/imprensa/${nome}  ${largura}x${altura}`);
    } else {
      fs.writeFileSync(alvo, png);
      console.log(`gravado site-src/imprensa/${nome}  ${largura}x${altura}  ${(png.length / 1024).toFixed(0)} KB`);
    }
  }
  const json = `${JSON.stringify(origem, null, 2)}\n`;
  const arquivoOrigem = path.join(SAIDA, 'origem.json');
  if (verificar) {
    const ok = fs.existsSync(arquivoOrigem) && fs.readFileSync(arquivoOrigem, 'utf8') === json;
    if (!ok) divergentes++;
    console.log(`${ok ? 'OK      ' : 'DIVERGE '} site-src/imprensa/origem.json`);
  } else fs.writeFileSync(arquivoOrigem, json);
  await navegador.close();
  if (divergentes) {
    console.error(`${divergentes} arquivo(s) fora do que os SVG de docs/marca produzem: rode "node scripts/gerar-marca-imprensa.js".`);
    process.exitCode = 1;
  }
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
