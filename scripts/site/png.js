'use strict';
/**
 * PNG sem pacote nenhum: lê PNG de 8 bits (cinza, RGB, RGBA ou paleta, sem entrelaçamento), reduz com média por área e grava de novo,
 * com filtro escolhido por linha, em RGB de 8 bits ou em paleta quando a imagem tem até 256 cores. Serve para as capturas do site e
 * para o teste, que compara os pixels (e não os bytes, porque o zlib de cada versão do Node pode gerar bytes diferentes).
 */
const zlib = require('node:zlib');

const ASSINATURA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

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
function bloco(tipo, dados) {
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
  const saida = Buffer.alloc(corpo.length + 8);
  saida.writeUInt32BE(dados.length, 0);
  corpo.copy(saida, 4);
  saida.writeUInt32BE(crc32(corpo), corpo.length + 4);
  return saida;
}

const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** Lê um PNG: `{ largura, altura, rgb }` com `rgb` em Buffer de 3 bytes por pixel. Alfa é descartado depois de compor sobre branco. */
function decodificar(buf) {
  if (!buf.subarray(0, 8).equals(ASSINATURA)) throw new Error('não é um PNG');
  let pos = 8;
  let ihdr = null;
  let paleta = null;
  const idat = [];
  while (pos < buf.length) {
    const tamanho = buf.readUInt32BE(pos);
    const tipo = buf.toString('ascii', pos + 4, pos + 8);
    const dados = buf.subarray(pos + 8, pos + 8 + tamanho);
    if (tipo === 'IHDR') ihdr = dados;
    else if (tipo === 'PLTE') paleta = dados;
    else if (tipo === 'IDAT') idat.push(dados);
    else if (tipo === 'IEND') break;
    pos += tamanho + 12;
  }
  if (!ihdr) throw new Error('PNG sem IHDR');
  const largura = ihdr.readUInt32BE(0);
  const altura = ihdr.readUInt32BE(4);
  const profundidade = ihdr[8];
  const tipoCor = ihdr[9];
  if (profundidade !== 8) throw new Error(`profundidade ${profundidade} não é suportada (só 8 bits)`);
  if (ihdr[12] !== 0) throw new Error('PNG entrelaçado não é suportado');
  const canais = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[tipoCor];
  if (!canais) throw new Error(`tipo de cor ${tipoCor} não é suportado`);
  if (tipoCor === 3 && !paleta) throw new Error('PNG de paleta sem PLTE');
  const cru = zlib.inflateSync(Buffer.concat(idat));
  const linha = largura * canais;
  const pixels = Buffer.alloc(linha * altura);
  for (let y = 0; y < altura; y++) {
    const filtro = cru[y * (linha + 1)];
    const de = y * (linha + 1) + 1;
    const para = y * linha;
    for (let i = 0; i < linha; i++) {
      const x = cru[de + i];
      const a = i >= canais ? pixels[para + i - canais] : 0;
      const b = y > 0 ? pixels[para - linha + i] : 0;
      const c = y > 0 && i >= canais ? pixels[para - linha + i - canais] : 0;
      let v;
      if (filtro === 0) v = x;
      else if (filtro === 1) v = x + a;
      else if (filtro === 2) v = x + b;
      else if (filtro === 3) v = x + ((a + b) >> 1);
      else if (filtro === 4) v = x + paeth(a, b, c);
      else throw new Error(`filtro ${filtro} inválido`);
      pixels[para + i] = v & 255;
    }
  }
  const rgb = Buffer.alloc(largura * altura * 3);
  for (let p = 0; p < largura * altura; p++) {
    let r;
    let g;
    let b;
    let alfa = 255;
    const o = p * canais;
    if (tipoCor === 2 || tipoCor === 6) {
      r = pixels[o];
      g = pixels[o + 1];
      b = pixels[o + 2];
      if (tipoCor === 6) alfa = pixels[o + 3];
    } else if (tipoCor === 0 || tipoCor === 4) {
      r = g = b = pixels[o];
      if (tipoCor === 4) alfa = pixels[o + 1];
    } else {
      const i = pixels[o] * 3;
      r = paleta[i];
      g = paleta[i + 1];
      b = paleta[i + 2];
    }
    if (alfa !== 255) {
      r = Math.round((r * alfa + 255 * (255 - alfa)) / 255);
      g = Math.round((g * alfa + 255 * (255 - alfa)) / 255);
      b = Math.round((b * alfa + 255 * (255 - alfa)) / 255);
    }
    rgb[p * 3] = r;
    rgb[p * 3 + 1] = g;
    rgb[p * 3 + 2] = b;
  }
  return { largura, altura, rgb };
}

/**
 * Reduz para a largura pedida com média por área (cada pixel novo é a média ponderada dos pixels de origem que ele cobre). Bom para
 * telas com texto. Mantém a proporção e arredonda a altura.
 */
function reduzir({ largura, altura, rgb }, novaLargura) {
  if (novaLargura >= largura) return { largura, altura, rgb };
  const novaAltura = Math.max(1, Math.round((altura * novaLargura) / largura));
  const fx = largura / novaLargura;
  const fy = altura / novaAltura;
  const saida = Buffer.alloc(novaLargura * novaAltura * 3);
  // Passo horizontal: para cada coluna nova, os pesos das colunas de origem.
  const colunas = [];
  for (let x = 0; x < novaLargura; x++) {
    const ini = x * fx;
    const fim = (x + 1) * fx;
    const lista = [];
    for (let sx = Math.floor(ini); sx < Math.ceil(fim) && sx < largura; sx++) {
      const peso = Math.min(fim, sx + 1) - Math.max(ini, sx);
      if (peso > 0) lista.push([sx, peso / fx]);
    }
    colunas.push(lista);
  }
  for (let y = 0; y < novaAltura; y++) {
    const ini = y * fy;
    const fim = (y + 1) * fy;
    const acc = new Float32Array(novaLargura * 3);
    for (let sy = Math.floor(ini); sy < Math.ceil(fim) && sy < altura; sy++) {
      const pesoY = (Math.min(fim, sy + 1) - Math.max(ini, sy)) / fy;
      if (pesoY <= 0) continue;
      const base = sy * largura * 3;
      for (let x = 0; x < novaLargura; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        for (const [sx, peso] of colunas[x]) {
          const o = base + sx * 3;
          r += rgb[o] * peso;
          g += rgb[o + 1] * peso;
          b += rgb[o + 2] * peso;
        }
        acc[x * 3] += r * pesoY;
        acc[x * 3 + 1] += g * pesoY;
        acc[x * 3 + 2] += b * pesoY;
      }
    }
    const para = y * novaLargura * 3;
    for (let i = 0; i < novaLargura * 3; i++) saida[para + i] = Math.max(0, Math.min(255, Math.round(acc[i])));
  }
  return { largura: novaLargura, altura: novaAltura, rgb: saida };
}

/** Escolhe o filtro de cada linha pelo menor total de valores absolutos (a heurística do libpng). */
function filtrar(dados, largura, altura, canais) {
  const linha = largura * canais;
  const saida = Buffer.alloc((linha + 1) * altura);
  const candidatos = [0, 1, 2, 3, 4].map(() => Buffer.alloc(linha));
  for (let y = 0; y < altura; y++) {
    const atual = y * linha;
    const anterior = (y - 1) * linha;
    for (let i = 0; i < linha; i++) {
      const x = dados[atual + i];
      const a = i >= canais ? dados[atual + i - canais] : 0;
      const b = y > 0 ? dados[anterior + i] : 0;
      const c = y > 0 && i >= canais ? dados[anterior + i - canais] : 0;
      candidatos[0][i] = x;
      candidatos[1][i] = (x - a) & 255;
      candidatos[2][i] = (x - b) & 255;
      candidatos[3][i] = (x - ((a + b) >> 1)) & 255;
      candidatos[4][i] = (x - paeth(a, b, c)) & 255;
    }
    let melhor = 0;
    let menor = Infinity;
    for (let f = 0; f < 5; f++) {
      let soma = 0;
      for (let i = 0; i < linha; i++) {
        const v = candidatos[f][i];
        soma += v < 128 ? v : 256 - v;
      }
      if (soma < menor) {
        menor = soma;
        melhor = f;
      }
    }
    saida[y * (linha + 1)] = melhor;
    candidatos[melhor].copy(saida, y * (linha + 1) + 1);
  }
  return saida;
}


/**
 * Reduz a imagem a até `n` cores sem pontilhado: as cores mais frequentes (fundos, bordas, texto) ficam exatas e o resto vai por
 * corte na mediana (as cores parecidas viram a média ponderada da caixa). Serve para telas do app, que têm poucas cores de verdade
 * e muitos tons de suavização de letra. Devolve a paleta e o índice de cada pixel.
 */
function quantizar(rgb, largura, altura, n = 256, exatas = 48) {
  const contagem = new Map();
  for (let p = 0; p < largura * altura; p++) {
    const k = (rgb[p * 3] << 16) | (rgb[p * 3 + 1] << 8) | rgb[p * 3 + 2];
    contagem.set(k, (contagem.get(k) || 0) + 1);
  }
  const cores = [...contagem.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([k, c]) => ({ r: (k >> 16) & 255, g: (k >> 8) & 255, b: k & 255, c, k }));
  const paleta = [];
  const fixas = cores.slice(0, Math.min(exatas, n, cores.length));
  for (const f of fixas) paleta.push([f.r, f.g, f.b]);
  let caixas = cores.length > fixas.length ? [cores.slice(fixas.length)] : [];
  while (paleta.length + caixas.length < n) {
    // A caixa com mais pixels (e mais de uma cor) é cortada ao meio no canal de maior extensão.
    let alvo = -1;
    let maior = 0;
    caixas.forEach((cx, i) => {
      if (cx.length < 2) return;
      const peso = cx.reduce((t, x) => t + x.c, 0);
      if (peso > maior) {
        maior = peso;
        alvo = i;
      }
    });
    if (alvo < 0) break;
    const cx = caixas[alvo];
    const faixa = (canal) => {
      let lo = 255;
      let hi = 0;
      for (const x of cx) {
        lo = Math.min(lo, x[canal]);
        hi = Math.max(hi, x[canal]);
      }
      return hi - lo;
    };
    const canal = ['r', 'g', 'b'].sort((a, b) => faixa(b) - faixa(a))[0];
    const ordenada = [...cx].sort((a, b) => a[canal] - b[canal] || a.k - b.k);
    const total = ordenada.reduce((t, x) => t + x.c, 0);
    let soma = 0;
    let corte = 1;
    for (let i = 0; i < ordenada.length - 1; i++) {
      soma += ordenada[i].c;
      corte = i + 1;
      if (soma >= total / 2) break;
    }
    caixas.splice(alvo, 1, ordenada.slice(0, corte), ordenada.slice(corte));
  }
  for (const cx of caixas) {
    const total = cx.reduce((t, x) => t + x.c, 0);
    paleta.push([Math.round(cx.reduce((t, x) => t + x.r * x.c, 0) / total), Math.round(cx.reduce((t, x) => t + x.g * x.c, 0) / total), Math.round(cx.reduce((t, x) => t + x.b * x.c, 0) / total)]);
  }
  const proxima = new Map();
  const maisPerto = (r, g, b) => {
    let melhor = 0;
    let menor = Infinity;
    for (let i = 0; i < paleta.length; i++) {
      const dr = r - paleta[i][0];
      const dg = g - paleta[i][1];
      const db = b - paleta[i][2];
      const d = dr * dr * 2 + dg * dg * 4 + db * db * 3;
      if (d < menor) {
        menor = d;
        melhor = i;
      }
    }
    return melhor;
  };
  const indices = Buffer.alloc(largura * altura);
  for (let p = 0; p < largura * altura; p++) {
    const k = (rgb[p * 3] << 16) | (rgb[p * 3 + 1] << 8) | rgb[p * 3 + 2];
    let i = proxima.get(k);
    if (i === undefined) {
      i = maisPerto(rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2]);
      proxima.set(k, i);
    }
    indices[p] = i;
  }
  return { paleta, indices };
}

/**
 * Grava RGB de 8 bits (tipo 2), ou paleta (tipo 3) se houver até 256 cores e `paleta` não for `false`. Com `quantizar`, uma imagem com mais
 * de 256 cores também vai em paleta (com perda, sem pontilhado).
 */
function codificar({ largura, altura, rgb }, { paleta: usarPaleta = true, quantizar: reduzirCores = false } = {}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8;
  const cores = new Map();
  let cabe = usarPaleta;
  for (let p = 0; p < largura * altura && cabe; p++) {
    const k = (rgb[p * 3] << 16) | (rgb[p * 3 + 1] << 8) | rgb[p * 3 + 2];
    if (!cores.has(k)) {
      cores.set(k, cores.size);
      if (cores.size > 256) cabe = false;
    }
  }
  const partes = [ASSINATURA];
  if (!cabe && usarPaleta && reduzirCores) {
    const q = quantizar(rgb, largura, altura);
    ihdr[9] = 3;
    const plte = Buffer.alloc(q.paleta.length * 3);
    q.paleta.forEach((c, i) => plte.set(c, i * 3));
    partes.push(bloco('IHDR', ihdr), bloco('sRGB', Buffer.from([0])), bloco('PLTE', plte), bloco('IDAT', zlib.deflateSync(filtrar(q.indices, largura, altura, 1), { level: 9 })), bloco('IEND', Buffer.alloc(0)));
  } else if (cabe) {
    ihdr[9] = 3;
    const paleta = Buffer.alloc(cores.size * 3);
    for (const [k, i] of cores) {
      paleta[i * 3] = (k >> 16) & 255;
      paleta[i * 3 + 1] = (k >> 8) & 255;
      paleta[i * 3 + 2] = k & 255;
    }
    const indices = Buffer.alloc(largura * altura);
    for (let p = 0; p < largura * altura; p++) indices[p] = cores.get((rgb[p * 3] << 16) | (rgb[p * 3 + 1] << 8) | rgb[p * 3 + 2]);
    partes.push(bloco('IHDR', ihdr), bloco('sRGB', Buffer.from([0])), bloco('PLTE', paleta), bloco('IDAT', zlib.deflateSync(filtrar(indices, largura, altura, 1), { level: 9 })), bloco('IEND', Buffer.alloc(0)));
  } else {
    ihdr[9] = 2;
    partes.push(bloco('IHDR', ihdr), bloco('sRGB', Buffer.from([0])), bloco('IDAT', zlib.deflateSync(filtrar(rgb, largura, altura, 3), { level: 9 })), bloco('IEND', Buffer.alloc(0)));
  }
  return Buffer.concat(partes);
}

/** Largura e altura de um PNG sem decodificar. */
function dimensoes(buf) {
  if (!buf.subarray(0, 8).equals(ASSINATURA)) throw new Error('não é um PNG');
  return { largura: buf.readUInt32BE(16), altura: buf.readUInt32BE(20), tipoCor: buf[25] };
}

module.exports = { decodificar, reduzir, codificar, dimensoes };
