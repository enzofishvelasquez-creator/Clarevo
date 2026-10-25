'use strict';
/**
 * Montagem de rascunho dos Reels (D-069): a gravação real do app, com as legendas do roteiro em trechos, o logotipo original e o aviso de
 * exemplo fictício, tudo dentro das zonas livres do Instagram (250 px no topo e 350 px no rodapé de 1080 x 1920).
 *
 * Como fica: fundo azul; no alto, a assinatura "clarevo." e o aviso "Exemplo fictício"; logo abaixo, o texto na tela do trecho (DM Sans); e a
 * gravação em um quadro de 800 x 1052 que termina em 1568 px. A gravação perde a faixa de 200 px do alto (o cabeçalho das telas internas) e a barra de abas
 * (a partir de 1710 px), que são moldura; por isso o aviso de demonstração é do próprio rascunho. Os textos e o logotipo vêm de camadas PNG desenhadas no Chromium
 * (a fonte DM Sans variável não passa pelo `drawtext` do ffmpeg), e o ffmpeg só empilha as camadas.
 */
const { PALETA } = require('./calculos');
const { css, esc } = require('./modelos');

const POS = { cartaoX: 140, cartaoY: 516, cartaoL: 800, cartaoA: 1052, recorteY: 200, recorteA: 1420, legendaY: 336, legendaA: 172, linhaY: 258 };

const base = (corpo) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>${css()}html,body{width:1080px;height:1920px;background:transparent}</style></head><body style="background:transparent">${corpo}</body></html>`;

/** Camada fixa: tudo azul, menos o quadro da gravação (com cantos arredondados), mais a assinatura e o aviso. */
function htmlCamadaFixa({ logo, chip }) {
  return base(`<div style="position:absolute;left:${POS.cartaoX}px;top:${POS.cartaoY}px;width:${POS.cartaoL}px;height:${POS.cartaoA}px;border-radius:36px;border:3px solid rgba(255,255,255,.65);box-shadow:0 0 0 2400px ${PALETA.azul}"></div>
<div style="position:absolute;left:80px;right:80px;top:${POS.linhaY}px;height:56px;display:flex;align-items:center;justify-content:space-between"><img src="${logo}" alt="clarevo." style="height:44px;display:block"><span class="chip" style="font-size:26px">${esc(chip)}</span></div>`);
}

/** Uma legenda: texto branco, negrito, até 3 linhas, no mesmo lugar em todos os trechos. */
function htmlLegenda(texto) {
  return base(`<div style="position:absolute;left:80px;right:80px;top:${POS.legendaY}px;height:${POS.legendaA}px;display:flex;align-items:flex-start"><p data-auto data-max="50" data-min="40" data-linhas="3" style="font-size:50px;font-weight:700;line-height:1.14;letter-spacing:-.005em;color:#fff">${esc(texto)}</p></div>`);
}

const dois = (n) => String(n).padStart(2, '0');
function tempoSrt(s) {
  const ms = Math.round(s * 1000);
  return `${dois(Math.floor(ms / 3600000))}:${dois(Math.floor(ms / 60000) % 60)}:${dois(Math.floor(ms / 1000) % 60)},${String(ms % 1000).padStart(3, '0')}`;
}

/** Legenda .srt da narração sugerida (para colar no Edits), com os tempos do roteiro. */
function srt(roteiro, duracao) {
  return roteiro
    .map((t, i) => {
      const fim = i + 1 < roteiro.length ? roteiro[i + 1].em - 0.15 : duracao;
      return `${i + 1}\n${tempoSrt(t.em)} --> ${tempoSrt(fim)}\n${t.fala}\n`;
    })
    .join('\n');
}

/** Os trechos (início, fim) de cada legenda; a última vai até o fim do vídeo. */
function trechos(roteiro, duracao) {
  return roteiro.map((t, i) => ({ de: t.em, ate: i + 1 < roteiro.length ? roteiro[i + 1].em : duracao, texto: t.tela }));
}

/** Argumentos do ffmpeg: gravação recortada e ampliada sobre o fundo azul, a camada fixa por cima e cada legenda no seu trecho. */
function argumentosFfmpeg({ gravacao, camada, legendas, duracao, saida }) {
  const d = duracao.toFixed(2);
  const entradas = ['-y', '-i', gravacao, '-loop', '1', '-framerate', '25', '-t', d, '-i', camada];
  legendas.forEach((l) => entradas.push('-loop', '1', '-framerate', '25', '-t', d, '-i', l.png));
  const fc = [
    `color=c=0x2457F5:s=1080x1920:r=25:d=${d}[bg]`,
    `[0:v]crop=1080:${POS.recorteA}:0:${POS.recorteY},scale=${POS.cartaoL}:${POS.cartaoA}:flags=lanczos,setsar=1,fps=25[rec]`,
    `[bg][rec]overlay=${POS.cartaoX}:${POS.cartaoY}[a]`,
    `[a][1:v]overlay=0:0[l0]`,
  ];
  legendas.forEach((l, i) => fc.push(`[l${i}][${i + 2}:v]overlay=0:0:enable='between(t,${l.de.toFixed(2)},${l.ate.toFixed(2)})'[l${i + 1}]`));
  fc.push(`[l${legendas.length}]format=yuv420p[v]`);
  return [...entradas, '-filter_complex', fc.join(';'), '-map', '[v]', '-t', d, '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '25', '-movflags', '+faststart', '-an', saida];
}

module.exports = { POS, htmlCamadaFixa, htmlLegenda, srt, trechos, argumentosFfmpeg, tempoSrt };
