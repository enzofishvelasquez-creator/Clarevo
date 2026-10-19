/**
 * Gera os ícones e a abertura do app a partir dos SVG de docs/marca/ (Ciclo R, D-060 item 1). Nada é redesenhado: cada PNG é o
 * mesmo desenho vetorial, desenhado pelo Chromium do Playwright no tamanho pedido e gravado sem compressão com perdas.
 *
 *   apps/app/assets/images/icon.png                      1024 x 1024, RGB, sem transparência (ícone do iOS e da App Store)
 *   apps/app/assets/images/android-icon-foreground.png   1024 x 1024, RGBA (frente do ícone adaptativo do Android)
 *   apps/app/assets/images/android-icon-background.png   1024 x 1024, RGB (fundo do ícone adaptativo: o azul da marca)
 *   apps/app/assets/images/android-icon-monochrome.png   1024 x 1024, RGBA (ícone temático do Android 13: só o formato)
 *   apps/app/assets/images/splash-icon.png               1024 x 1024, RGBA (abertura, sobre o fundo azul do app.json)
 *   apps/app/assets/loja/icone-play-512.png              512 x 512, PNG de 32 bits (ícone da página do app no Google Play)
 *
 * O ícone da notificação (`notification-icon.png`) e o favicon não são gerados aqui: seguem como estão (`docs/marca/LEIAME.md`).
 *
 * Uso:
 *   node scripts/gerar-icones.js              grava os PNG
 *   node scripts/gerar-icones.js --verificar  não grava: sai com erro se algum PNG gravado difere do que os SVG produzem
 * Navegador: Chromium do Playwright, ou CHROMIUM_PATH.
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..');
const MARCA = path.join(RAIZ, 'docs', 'marca');
const IMAGENS = path.join(RAIZ, 'apps', 'app', 'assets', 'images');
const LOJA = path.join(RAIZ, 'apps', 'app', 'assets', 'loja');
const AZUL = '#2457F5';

/** `svg`: arquivo de docs/marca. `fundo`: cor lida do ícone do app (sem arquivo SVG próprio). `alfa`: PNG com canal alfa. */
const SAIDAS = [
  { arquivo: path.join(IMAGENS, 'icon.png'), svg: 'icone-app.svg', tamanho: 1024, alfa: false },
  { arquivo: path.join(IMAGENS, 'android-icon-foreground.png'), svg: 'icone-android-frente.svg', tamanho: 1024, alfa: true },
  { arquivo: path.join(IMAGENS, 'android-icon-background.png'), fundo: true, tamanho: 1024, alfa: false },
  { arquivo: path.join(IMAGENS, 'android-icon-monochrome.png'), svg: 'icone-android-uma-cor.svg', tamanho: 1024, alfa: true },
  { arquivo: path.join(IMAGENS, 'splash-icon.png'), svg: 'icone-splash.svg', tamanho: 1024, alfa: true },
  { arquivo: path.join(LOJA, 'icone-play-512.png'), svg: 'icone-app.svg', tamanho: 512, alfa: true },
];

// ---- PNG sem dependências: filtro 0 em todas as linhas, zlib no nível máximo, chunk sRGB. Mesma entrada, mesmos bytes. ----
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
/** `rgba`: Buffer com 4 bytes por pixel. Sem canal alfa, o PNG sai RGB (tipo 2) e todo pixel precisa ser opaco. */
function codificarPng(largura, altura, rgba, alfa) {
  const bpp = alfa ? 4 : 3;
  const linha = largura * bpp + 1;
  const cru = Buffer.alloc(linha * altura);
  for (let y = 0; y < altura; y++) {
    cru[y * linha] = 0;
    for (let x = 0; x < largura; x++) {
      const de = (y * largura + x) * 4;
      const para = y * linha + 1 + x * bpp;
      if (!alfa && rgba[de + 3] !== 255) throw new Error(`pixel (${x}, ${y}) não é opaco, e este PNG não pode ter transparência`);
      cru[para] = rgba[de];
      cru[para + 1] = rgba[de + 1];
      cru[para + 2] = rgba[de + 2];
      if (alfa) cru[para + 3] = rgba[de + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8; // 8 bits por canal
  ihdr[9] = alfa ? 6 : 2; // RGBA ou RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('sRGB', Buffer.from([0])),
    chunk('IDAT', zlib.deflateSync(cru, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** O azul do fundo vem do próprio ícone do app (o retângulo de `icone-app.svg`) e tem de ser o azul da marca. */
function azulDoIcone() {
  const m = fs.readFileSync(path.join(MARCA, 'icone-app.svg'), 'utf8').match(/<rect[^>]*fill="(#[0-9A-Fa-f]{6})"/);
  if (!m || m[1].toUpperCase() !== AZUL) throw new Error(`o fundo de icone-app.svg deveria ser ${AZUL} (identidade do CLAUDE.md), e é ${m ? m[1] : 'ausente'}`);
  return m[1];
}

async function desenhar(pagina, svg, tamanho) {
  const b64 = await pagina.evaluate(
    async ({ svg, tamanho }) => {
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = tamanho;
      canvas.height = tamanho;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, tamanho, tamanho);
      const dados = ctx.getImageData(0, 0, tamanho, tamanho).data;
      let bin = '';
      for (let i = 0; i < dados.length; i += 0x8000) bin += String.fromCharCode.apply(null, dados.subarray(i, i + 0x8000));
      return btoa(bin);
    },
    { svg, tamanho },
  );
  return Buffer.from(b64, 'base64');
}

(async () => {
  const verificar = process.argv.includes('--verificar');
  const azul = azulDoIcone();
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const pagina = await browser.newPage();
  await pagina.setContent('<!doctype html><meta charset="utf-8"><body></body>');
  let divergentes = 0;
  for (const s of SAIDAS) {
    const svg = s.fundo
      ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="${azul}"/></svg>`
      : fs.readFileSync(path.join(MARCA, s.svg), 'utf8');
    const png = codificarPng(s.tamanho, s.tamanho, await desenhar(pagina, svg, s.tamanho), s.alfa);
    const rel = path.relative(RAIZ, s.arquivo);
    if (verificar) {
      const igual = fs.existsSync(s.arquivo) && fs.readFileSync(s.arquivo).equals(png);
      if (!igual) divergentes++;
      console.log(`${igual ? 'OK      ' : 'DIVERGE '} ${rel}`);
    } else {
      fs.mkdirSync(path.dirname(s.arquivo), { recursive: true });
      fs.writeFileSync(s.arquivo, png);
      console.log(`gravado  ${rel}  ${s.tamanho}x${s.tamanho}  ${s.alfa ? 'RGBA' : 'RGB sem transparência'}  ${png.length} bytes`);
    }
  }
  await browser.close();
  if (verificar && divergentes > 0) {
    console.error(`${divergentes} PNG diferem do que os SVG de docs/marca produzem: rode "node scripts/gerar-icones.js".`);
    process.exit(1);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
