#!/usr/bin/env node
/**
 * Leitura de texto em imagem no próprio aparelho (D-078 B): copia para `apps/app/public/ocr/` os arquivos que o navegador usa, para o
 * app servir tudo do próprio endereço (nenhum pedido a CDN nem a serviço de terceiros; a imagem nunca sai do aparelho):
 * - o worker do tesseract.js (`worker.min.js`);
 * - o núcleo em WebAssembly, só as variantes LSTM (o tesseract.js escolhe a que o navegador suporta);
 * - os dados do português (`por.traineddata`, modelo "best_int"), descomprimidos aqui: servidos como arquivo comum, o servidor (o
 *   Cloudflare) comprime na entrega, sem risco de um `.gz` chegar já descomprimido e confundir a leitura.
 * Roda antes do `expo export` (export:web e export:demo). A pasta é gerada e fica fora do repositório (.gitignore).
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'apps/app/public/ocr');
const from = (pkg, file) => path.join(path.dirname(require.resolve(`${pkg}/package.json`, { paths: [path.join(ROOT, 'apps/app'), ROOT] })), file);

const FILES = [
  [from('tesseract.js', 'dist/worker.min.js'), 'worker.min.js'],
  [from('tesseract.js-core', 'tesseract-core-lstm.wasm.js'), 'tesseract-core-lstm.wasm.js'],
  [from('tesseract.js-core', 'tesseract-core-simd-lstm.wasm.js'), 'tesseract-core-simd-lstm.wasm.js'],
  [from('tesseract.js-core', 'tesseract-core-relaxedsimd-lstm.wasm.js'), 'tesseract-core-relaxedsimd-lstm.wasm.js'],
];
const LANG = from('@tesseract.js-data/por', '4.0.0_best_int/por.traineddata.gz');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
let total = 0;
for (const [src, name] of FILES) {
  fs.copyFileSync(src, path.join(OUT, name));
  total += fs.statSync(src).size;
}
const lang = zlib.gunzipSync(fs.readFileSync(LANG));
fs.writeFileSync(path.join(OUT, 'por.traineddata'), lang);
total += lang.length;
console.log(`leitura de imagem: ${FILES.length + 1} arquivos em apps/app/public/ocr (${(total / 1024 / 1024).toFixed(1)} MB)`);
