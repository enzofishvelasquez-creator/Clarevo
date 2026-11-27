#!/usr/bin/env node
/**
 * As fontes do site em WOFF2 (27/11/2026, análise geral de 26/11, lista "Depois"; `docs/22_SITE.md`, seção 22). O site servia as três
 * Manrope em TTF (cerca de 101 KB); em WOFF2 (o TTF comprimido com Brotli, que todo navegador atual lê) são cerca de 46 KB. A fonte de
 * verdade continua sendo o TTF do app (`apps/app/assets/fonts`, subconjunto Latin, licença OFL): este script só converte, sem mudar desenho.
 *
 * Grava em `site-src/fontes/`: `Manrope_<peso>.woff2` e `origem.json`, com o tamanho e o resumo SHA-256 de cada TTF e de cada WOFF2 e a
 * ferramenta usada. O gerador do site copia os WOFF2 para `site/fontes/` e avisa (e o `--final` recusa) se o TTF mudou sem refazer o WOFF2;
 * o teste do núcleo confere o mesmo. O TTF continua em `site/fontes/` como segunda opção do `@font-face` (navegador que lê WOFF2 nunca o
 * baixa) e para o kit de imprensa, que oferece os arquivos.
 *
 * A conversão usa o `wawoff2` (o compressor WOFF2 do Google compilado para JavaScript, sem código nativo), pego do registro de pacotes só
 * para rodar este script, sem entrar no `package.json` (as fontes quase nunca mudam, e o site não precisa dele para ser gerado):
 *   npm install --no-save --prefix /tmp/clarevo-fontes wawoff2@2.0.1
 *   WAWOFF2=/tmp/clarevo-fontes/node_modules/wawoff2 node scripts/gerar-fontes-site.js
 *   node scripts/gerar-fontes-site.js --verificar      só confere o origem.json com os arquivos (sem a ferramenta)
 */
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { FONTES, PESOS_FONTE, SITE_SRC } = require('./site/config');

const PASTA = path.join(SITE_SRC, 'fontes');
const ORIGEM = path.join(PASTA, 'origem.json');
/** A versão do `wawoff2` com que os arquivos de hoje foram feitos (outra versão pode dar outros bytes, com o mesmo desenho). */
const VERSAO = '2.0.1';

const resumo = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const descrever = (bytes) => ({ bytes: bytes.length, sha256: resumo(bytes) });

/** Os problemas entre o `origem.json` e os arquivos (TTF do app e WOFF2 do site): vazio quando tudo bate. */
function conferir() {
  const problemas = [];
  if (!fs.existsSync(ORIGEM)) return ['site-src/fontes/origem.json não existe: rode "node scripts/gerar-fontes-site.js"'];
  const origem = JSON.parse(fs.readFileSync(ORIGEM, 'utf8'));
  for (const peso of PESOS_FONTE) {
    const o = origem.fontes && origem.fontes[peso];
    const ttf = path.join(FONTES, `Manrope_${peso}.ttf`);
    const woff2 = path.join(PASTA, `Manrope_${peso}.woff2`);
    if (!o) problemas.push(`site-src/fontes/origem.json não tem a fonte ${peso}`);
    else if (!fs.existsSync(woff2)) problemas.push(`site-src/fontes/Manrope_${peso}.woff2 não existe`);
    else {
      if (resumo(fs.readFileSync(ttf)) !== o.ttf.sha256) problemas.push(`apps/app/assets/fonts/Manrope_${peso}.ttf mudou depois do WOFF2 do site: rode "node scripts/gerar-fontes-site.js"`);
      if (resumo(fs.readFileSync(woff2)) !== o.woff2.sha256) problemas.push(`site-src/fontes/Manrope_${peso}.woff2 não é o do origem.json: rode "node scripts/gerar-fontes-site.js"`);
    }
  }
  return problemas;
}

async function converter() {
  const modulo = process.env.WAWOFF2 || 'wawoff2';
  let wawoff2;
  let versao;
  try {
    wawoff2 = require(modulo);
    versao = require(path.join(path.dirname(require.resolve(modulo)), 'package.json')).version;
  } catch {
    throw new Error(`o wawoff2 não foi encontrado (${modulo}). Rode:\n  npm install --no-save --prefix /tmp/clarevo-fontes wawoff2@${VERSAO}\n  WAWOFF2=/tmp/clarevo-fontes/node_modules/wawoff2 node scripts/gerar-fontes-site.js`);
  }
  if (versao !== VERSAO) console.warn(`aviso: wawoff2 ${versao}, e não ${VERSAO}: os bytes podem mudar (o desenho, não)`);
  fs.mkdirSync(PASTA, { recursive: true });
  const fontes = {};
  for (const peso of PESOS_FONTE) {
    const ttf = fs.readFileSync(path.join(FONTES, `Manrope_${peso}.ttf`));
    const woff2 = Buffer.from(await wawoff2.compress(ttf));
    if (woff2.subarray(0, 4).toString('latin1') !== 'wOF2') throw new Error(`a conversão de ${peso} não deu um WOFF2`);
    // Volta ao TTF e compara as tabelas: a conversão não pode mudar o desenho.
    const devolta = Buffer.from(await wawoff2.decompress(woff2));
    if (devolta.readUInt16BE(4) !== ttf.readUInt16BE(4)) throw new Error(`o WOFF2 de ${peso} não tem as mesmas tabelas do TTF`);
    fs.writeFileSync(path.join(PASTA, `Manrope_${peso}.woff2`), woff2);
    fontes[peso] = { ttf: descrever(ttf), woff2: descrever(woff2) };
    console.log(`Manrope_${peso}: ${ttf.length} B em TTF, ${woff2.length} B em WOFF2 (${Math.round((1 - woff2.length / ttf.length) * 100)}% menos)`);
  }
  const total = (tipo) => Object.values(fontes).reduce((n, f) => n + f[tipo].bytes, 0);
  const origem = { ferramenta: `wawoff2 ${versao}`, de: 'apps/app/assets/fonts', fontes };
  fs.writeFileSync(ORIGEM, `${JSON.stringify(origem, null, 2)}\n`);
  console.log(`total: ${total('ttf')} B em TTF, ${total('woff2')} B em WOFF2; gravado em site-src/fontes/`);
}

if (require.main === module) {
  const verificar = process.argv.includes('--verificar');
  (verificar ? Promise.resolve().then(() => {
    const p = conferir();
    if (p.length) {
      for (const x of p) console.error(x);
      process.exitCode = 1;
    } else console.log('as fontes WOFF2 do site batem com os TTF do app');
  }) : converter()).catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}

module.exports = { conferir, PASTA, ORIGEM };
