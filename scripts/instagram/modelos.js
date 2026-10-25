'use strict';
/**
 * Modelos HTML das artes do Instagram (D-069). Cada função devolve o HTML completo de uma página; o gerador desenha no Chromium e grava o PNG.
 *
 * Regras que os modelos cumprem (Playbook v2.2 e Manual v2.2): paleta oficial (azul #2457F5, lima #D4F05B, marinho #17223B, off-white
 * #F7F9FD, azul-claro #EAF0FF, cinza #53637D), DM Sans (títulos em negrito, corpo sem negrito nem itálico), margens laterais de 80 px em 1080
 * de largura, títulos de 56 a 72 px, corpo de 32 a 40 px, rótulos de 24 px ou mais, números protagonistas de 90 a 130 px, uma ideia por
 * página, assinatura "clarevo." sempre pelo ativo original de `docs/marca` (nunca redigitada), ícone C só no avatar, nunca branco sobre
 * lima. O desenho que uma tela do app mostra vem sempre de captura real recortada (nada de interface redesenhada).
 */
const fs = require('node:fs');
const path = require('node:path');
const { PALETA, percentual, milesimos, EXEMPLOS } = require('./calculos');

const RAIZ = path.join(__dirname, '..', '..');
const b64 = (arquivo) => fs.readFileSync(arquivo).toString('base64');
const FONTE = path.join(__dirname, 'fontes', 'DMSans-variavel.ttf');

/** Escapa o HTML e prende o "R$" ao número (espaço sem quebra), para o valor nunca ficar partido entre duas linhas. */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/R\$ (?=\d)/g, 'R$\u00a0');
/** `*palavra*` vira destaque (`<em>`); o resto sai escapado. */
const rico = (s) => esc(s).replace(/\*([^*]+)\*/g, (_, t) => (t.length > 22 ? `<em class="q">${t}</em>` : `<em>${t}</em>`));

/** Ativos originais da marca, lidos de `docs/marca` (nada é redigitado nem redesenhado). */
function ativos() {
  const marca = path.join(RAIZ, 'docs', 'marca');
  const svg = (nome) => `data:image/svg+xml;base64,${b64(path.join(marca, nome))}`;
  return {
    logo: svg('clarevo-logotipo.svg'),
    logoReverso: svg('clarevo-logotipo-reverso.svg'),
    iconeApp: svg('icone-app.svg'),
    simbolo: svg('clarevo-simbolo.svg'),
    simboloReverso: svg('clarevo-simbolo-reverso.svg'),
  };
}

const TOKENS = `--azul:${PALETA.azul};--lima:${PALETA.lima};--marinho:${PALETA.marinho};--off:${PALETA.off};--claro:${PALETA.claro};--cinza:${PALETA.cinza};--branco:${PALETA.branco};--azul-escuro:${PALETA.azulEscuro};--borda:#CBD7F3`;

/** CSS comum. DM Sans variável embutida (OFL, `scripts/instagram/fontes`). */
function css() {
  return `
@font-face{font-family:"DM Sans";src:url(data:font/ttf;base64,${b64(FONTE)}) format("truetype");font-weight:100 1000;font-style:normal}
:root{${TOKENS}}
*{box-sizing:border-box;margin:0;padding:0}
html,body{overflow:hidden}
body{font-family:"DM Sans",sans-serif;font-weight:400;color:var(--marinho);position:relative;-webkit-font-smoothing:antialiased;font-optical-sizing:auto}
em{font-style:normal;color:var(--azul);white-space:nowrap}
em.q{white-space:normal}
.azul{background:var(--azul);color:var(--branco)}
.azul em{color:var(--lima)}
.off{background:var(--off)}
.claro{background:var(--claro)}
.branco{background:var(--branco)}
h1,h2,h3{font-weight:700;letter-spacing:-.012em;line-height:1.08}
p{line-height:1.36}
.centro{position:absolute;left:80px;right:80px;top:80px;bottom:152px;display:flex;flex-direction:column;justify-content:center;gap:36px}
.topo{justify-content:flex-start;padding-top:0}
.titulo{font-size:64px}
.corpo{font-size:38px;font-weight:400}
.rotulo{font-size:26px;font-weight:500;letter-spacing:.01em;color:var(--cinza)}
.azul .rotulo{color:var(--claro)}
.nota{font-size:28px;color:var(--cinza)}
.azul .nota{color:var(--claro)}
.barra{width:96px;height:12px;border-radius:6px;background:var(--lima);flex:none}
.chip{display:inline-flex;align-items:center;align-self:flex-start;flex:none;background:var(--lima);color:var(--marinho);font-size:26px;font-weight:600;line-height:1;padding:14px 24px;border-radius:999px;white-space:nowrap}
.chip.sobre{position:absolute;z-index:2}
.rodape{position:absolute;left:80px;right:80px;bottom:64px;height:44px;display:flex;align-items:center;justify-content:space-between}
.rodape img{height:44px;width:auto;display:block}
.contador{font-size:26px;font-weight:500;color:var(--cinza)}
.azul .contador{color:var(--claro)}
.cartao{background:var(--branco);border:3px solid var(--borda);border-radius:32px}
.azul .cartao{color:var(--marinho)}
.quadro{position:relative;width:920px;border-radius:36px;overflow:hidden;border:3px solid var(--borda);background:var(--off);flex:none}
.foto{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;text-align:center;padding:48px 64px;background:repeating-linear-gradient(135deg,#EAF0FF 0 30px,#E0E8FB 30px 60px);color:var(--marinho)}
.foto::before{content:"";position:absolute;inset:22px;border:4px dashed rgba(36,87,245,.55);border-radius:24px;pointer-events:none}
.foto svg{width:84px;height:84px;flex:none}
.foto p{font-size:30px;font-weight:500;line-height:1.3;max-width:800px}
.lista{display:flex;flex-direction:column;gap:20px}
.linha-item{display:flex;align-items:center;gap:28px;background:var(--branco);border:3px solid var(--borda);border-radius:28px;padding:26px 32px;font-size:40px;line-height:1.2}
.pino{flex:none;width:64px;height:64px;border-radius:50%;background:var(--azul);color:var(--branco);display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:700}
.caixa{flex:none;width:52px;height:52px;border-radius:12px;border:5px solid var(--azul);background:var(--branco)}
.chamada{background:var(--lima);color:var(--marinho);font-size:40px;font-weight:700;line-height:1.2;padding:30px 36px;border-radius:28px}
.num{font-weight:700;line-height:1;letter-spacing:-.02em;font-feature-settings:"tnum" 1}
`;
}

/** Ajusta cada `[data-auto]` ao maior tamanho entre `data-max` e `data-min` que cabe em `data-linhas`; roda no navegador depois da fonte. */
const AJUSTE = `(() => {
  const falhas = [];
  for (const el of document.querySelectorAll('[data-auto]')) {
    const max = Number(el.dataset.max), min = Number(el.dataset.min), linhas = Number(el.dataset.linhas);
    let t = max;
    for (;; t -= 2) {
      el.style.fontSize = t + 'px';
      const lh = parseFloat(getComputedStyle(el).lineHeight);
      const n = Math.round(el.getBoundingClientRect().height / lh);
      if (n <= linhas || t <= min) { if (n > linhas) falhas.push((el.textContent || '').slice(0, 50) + ': ' + n + ' linhas a ' + t + ' px (máximo ' + linhas + ')'); break; }
    }
  }
  return falhas;
})()`;

function pagina({ largura = 1080, altura = 1350, classe, corpo }) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>${css()}
html,body{width:${largura}px;height:${altura}px}</style></head><body class="${classe}" data-w="${largura}" data-h="${altura}">${corpo}</body></html>`;
}

function rodape({ azul, n, total, a }) {
  return `<div class="rodape" data-rodape><img src="${azul ? a.logoReverso : a.logo}" alt="clarevo."><span class="contador">${n}/${total}</span></div>`;
}

const titulo = (texto, { max = 72, min = 56, linhas = 3, tag = 'h1', extra = '' } = {}) =>
  `<${tag} class="titulo" data-c data-auto data-max="${max}" data-min="${min}" data-linhas="${linhas}" ${extra}>${rico(texto)}</${tag}>`;
const corpoTxt = (texto, { max = 40, min = 32, linhas = 4 } = {}) => `<p class="corpo" data-c data-auto data-max="${max}" data-min="${min}" data-linhas="${linhas}">${rico(texto)}</p>`;
const chipHtml = (t) => (t ? `<span class="chip" data-c>${esc(t)}</span>` : '');

const ICONE_FOTO = `<svg viewBox="0 0 96 96" fill="none" stroke="#17223B" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 30h16l6-9h28l6 9h16v46H12z"/><circle cx="48" cy="52" r="14"/></svg>`;
const quadroDeFoto = (cena, estilo, { sangra = false } = {}) => `<div class="foto"${sangra ? '' : ' data-c'} style="${estilo}">${ICONE_FOTO}<p${sangra ? ' data-c' : ''}>[Foto real: ${esc(cena)}]</p></div>`;

/** Recorte de uma captura real: ampliado, sem redesenhar. `rec` em pixels da imagem original (1080 de largura). */
function recorte({ dados, largura, rec, larguraOriginal = 1080 }) {
  const s = largura / rec.w;
  const alt = Math.round(rec.h * s);
  return `<div style="width:${largura}px;height:${alt}px;background-image:url(${dados});background-repeat:no-repeat;background-size:${Math.round(larguraOriginal * s)}px auto;background-position:-${Math.round(rec.x * s)}px -${Math.round(rec.y * s)}px"></div>`;
}

const PRODUTO = `<svg viewBox="0 0 120 120" fill="none" stroke="#17223B" stroke-width="6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M60 14l42 22v48L60 106 18 84V36z"/><path d="M18 36l42 22 42-22M60 58v48"/></svg>`;

// ---------------------------------------------------------------------------------------------------------------------------------
// Modelos de carrossel (1080 x 1350)
// ---------------------------------------------------------------------------------------------------------------------------------
const MODELOS = {
  capaFoto(d, c) {
    const topo = 740;
    return pagina({
      classe: 'azul',
      corpo: `<div style="position:absolute;left:0;top:0;width:1080px;height:${topo}px">${quadroDeFoto(d.cena, `width:1080px;height:${topo}px;border-radius:0`, { sangra: true })}</div>
<div style="position:absolute;left:80px;right:80px;top:${topo + 44}px;display:flex;flex-direction:column;gap:20px">
${titulo(d.titulo, { max: 72, min: 56, linhas: 3 })}
${d.sub ? `<p data-c style="font-size:44px;font-weight:700;color:var(--lima);line-height:1.15">${esc(d.sub)}</p>` : ''}
</div>${rodape({ azul: true, n: c.n, total: c.total, a: c.a })}`,
    });
  },

  capaAzul(d, c) {
    return pagina({
      classe: 'azul',
      corpo: `<div class="centro">${d.rotulo ? `<span class="chip" data-c>${esc(d.rotulo)}</span>` : ''}<div class="barra"></div>${titulo(d.titulo, { max: 72, min: 60, linhas: 5 })}${d.sub ? corpoTxt(d.sub, { linhas: 3 }) : ''}</div>${rodape({ azul: true, n: c.n, total: c.total, a: c.a })}`,
    });
  },

  capaClara(d, c) {
    return pagina({
      classe: 'off',
      corpo: `<div class="centro">${d.rotulo ? `<p class="rotulo" data-c>${esc(d.rotulo)}</p>` : ''}<div class="barra"></div>${titulo(d.titulo, { max: 72, min: 60, linhas: 4 })}</div>${rodape({ n: c.n, total: c.total, a: c.a })}`,
    });
  },

  azulTexto(d, c) {
    return pagina({
      classe: 'azul',
      corpo: `<div class="centro"><div class="barra"></div>${titulo(d.titulo, { max: 68, min: 56, linhas: 6 })}${d.corpo ? corpoTxt(d.corpo) : ''}</div>${rodape({ azul: true, n: c.n, total: c.total, a: c.a })}`,
    });
  },

  final(d, c) {
    return pagina({
      classe: 'azul',
      corpo: `<div class="centro"><div class="barra"></div>${titulo(d.titulo, { max: 68, min: 56, linhas: 6 })}${d.corpo ? corpoTxt(d.corpo, { linhas: 3 }) : ''}</div>${rodape({ azul: true, n: c.n, total: c.total, a: c.a })}`,
    });
  },

  texto(d, c) {
    return pagina({
      classe: 'off',
      corpo: `<div class="centro">${d.rotulo ? `<p class="rotulo" data-c>${esc(d.rotulo)}</p>` : ''}${d.chip ? chipHtml(d.chip) : ''}${titulo(d.titulo, { max: d.tamTitulo || 68, min: 56, linhas: 6 })}${d.corpo ? corpoTxt(d.corpo) : ''}${d.chamada ? `<p class="chamada" data-c>${esc(d.chamada)}</p>` : ''}</div>${rodape({ n: c.n, total: c.total, a: c.a })}`,
    });
  },

  contasComprasPlanos(d, c) {
    const linhas = d.linhas.map(([a, b]) => `<div data-c style="font-size:72px;font-weight:700;line-height:1.14;letter-spacing:-.012em"><span style="color:var(--azul)">${esc(a)}</span> ${esc(b)}</div>`).join('');
    return pagina({
      classe: 'off',
      corpo: `<div class="centro"><div class="barra"></div><div style="display:flex;flex-direction:column;gap:14px">${linhas}</div>${corpoTxt(d.corpo, { linhas: 2 })}</div>${rodape({ n: c.n, total: c.total, a: c.a })}`,
    });
  },

  tela(d, c) {
    const cap = c.capturas[d.captura.arquivo];
    const quadro = recorte({ dados: cap, largura: 914, rec: d.captura.recorte }); // 920 menos as bordas de 3 px
    return pagina({
      classe: 'claro',
      corpo: `<div class="centro" style="gap:40px">${titulo(d.titulo, { max: 56, min: 56, linhas: 4, tag: 'h2' })}<div style="display:flex;flex-direction:column;gap:18px">${chipHtml(d.chip)}<div class="quadro" data-c>${quadro}</div></div></div>${rodape({ n: c.n, total: c.total, a: c.a })}`,
    });
  },

  fotoTexto(d, c) {
    return pagina({
      classe: 'off',
      corpo: `<div class="centro" style="gap:44px">${quadroDeFoto(d.cena, 'width:920px;height:560px;border-radius:36px;flex:none')}${corpoTxt(d.texto, { max: 40, min: 34, linhas: 5 })}</div>${rodape({ n: c.n, total: c.total, a: c.a })}`,
    });
  },

  passos(d, c) {
    const seta = `<svg viewBox="0 0 48 64" width="48" height="64" fill="none" stroke="#2457F5" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="align-self:center;flex:none"><path d="M24 6v48M8 38l16 16 16-16"/></svg>`;
    const cartoes = d.passos.map((p) => `<div class="linha-item" data-c style="font-size:44px;padding:36px 40px"><span class="pino" style="width:80px;height:80px;font-size:44px">${p.n}</span><span>${esc(p.texto)}</span></div>`);
    return pagina({
      classe: 'off',
      corpo: `<div class="centro" style="gap:28px"><div class="lista" style="gap:28px">${cartoes.join(seta)}</div>${d.nota ? `<p class="nota" data-c style="font-size:30px">${esc(d.nota)}</p>` : ''}</div>${rodape({ n: c.n, total: c.total, a: c.a })}`,
    });
  },

  barras(d, c) {
    const max = Math.max(...d.itens.map((i) => i.valor));
    const cores = [PALETA.azul, PALETA.azulEscuro];
    const barras = d.itens
      .map((it, k) => {
        const largura = Math.round((920 * it.valor) / max);
        return `<div data-c style="display:flex;flex-direction:column;gap:12px"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:20px"><span style="font-size:34px">${esc(it.rotulo)}</span><span class="num" style="font-size:56px">R$ ${String(it.valor / 100).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}</span></div><div style="width:920px;height:72px;border-radius:14px;background:var(--claro)"><div style="width:${largura}px;height:72px;border-radius:14px;background:${cores[k % 2]}"></div></div></div>`;
      })
      .join('');
    return pagina({
      classe: 'off',
      corpo: `<div class="centro" style="gap:44px">${chipHtml(d.chip)}${titulo(d.titulo, { max: 56, min: 56, linhas: 4, tag: 'h2' })}<div style="display:flex;flex-direction:column;gap:40px">${barras}</div><p class="nota" data-c>Barras a partir de zero, na mesma escala.</p></div>${rodape({ n: c.n, total: c.total, a: c.a })}`,
    });
  },

  conta(d, c) {
    const [a, , b, , r] = d.equacao;
    const tok = (valor, rot, destaque) =>
      `<div style="display:flex;flex-direction:column;gap:10px;align-items:center"><span class="num" style="font-size:64px;padding:14px 22px;border-radius:22px;${destaque ? 'background:var(--lima)' : ''}">${esc(valor)}</span><span class="rotulo" style="font-size:26px;text-align:center">${esc(rot)}</span></div>`;
    const op = (s) => `<span class="num" style="font-size:64px;color:var(--cinza);padding-bottom:40px">${esc(s)}</span>`;
    return pagina({
      classe: 'off',
      corpo: `<div class="centro" style="gap:44px">${chipHtml(d.chip)}${titulo(d.titulo, { max: 56, min: 56, linhas: 4, tag: 'h2' })}<div data-c style="display:flex;justify-content:space-between;align-items:flex-start">${tok(a, 'Na conta')}${op('−')}${tok(b, 'Ainda previstas')}${op('=')}${tok(r, d.rotuloResultado, true)}</div>${corpoTxt(d.corpo, { linhas: 3 })}</div>${rodape({ n: c.n, total: c.total, a: c.a })}`,
    });
  },

  parcelas(d, c) {
    const meses = Array.from({ length: d.parcelas }, (_, i) => `<div data-c style="width:140px;height:128px;border-radius:22px;background:var(--branco);border:3px solid var(--borda);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px"><span style="font-size:34px;font-weight:700">${esc(d.valorParcela)}</span><span class="rotulo" style="font-size:24px">mês ${i + 1}</span></div>`).join('');
    return pagina({
      classe: 'off',
      corpo: `<div class="centro" style="gap:40px">${chipHtml(d.chip)}${titulo(d.titulo, { max: 56, min: 56, linhas: 3, tag: 'h2' })}
<div style="display:flex;align-items:center;gap:24px"><div style="width:110px;height:110px;flex:none">${PRODUTO}</div><p class="rotulo" data-c style="font-size:28px">Produto de exemplo, pago em ${d.parcelas} parcelas mensais</p></div>
<div style="display:flex;justify-content:space-between">${meses}</div>
<div data-c style="display:flex;align-items:baseline;gap:20px"><span class="num" style="font-size:104px;color:var(--azul)">= ${esc(d.total)}</span><span class="rotulo" style="font-size:30px">no total</span></div></div>${rodape({ n: c.n, total: c.total, a: c.a })}`,
    });
  },

  duasCondicoes(d, c) {
    const max = Math.max(d.aVista.valor, d.parcelado.valor);
    const col = (x, cor) => {
      const larg = Math.round((376 * x.valor) / max);
      return `<div class="cartao" data-c style="width:446px;padding:30px;display:flex;flex-direction:column;gap:18px;align-items:flex-start"><span style="font-size:32px;color:var(--cinza)">${esc(x.rotulo)}</span><div style="width:96px;height:96px">${PRODUTO}</div><span class="num" style="font-size:68px">${esc(x.texto)}</span><div style="width:376px;height:30px;border-radius:10px;background:var(--claro)"><div style="width:${larg}px;height:30px;border-radius:10px;background:${cor}"></div></div></div>`;
    };
    return pagina({
      classe: 'off',
      corpo: `<div class="centro" style="gap:36px">${chipHtml(d.chip)}${titulo(d.titulo, { max: 56, min: 56, linhas: 4, tag: 'h2' })}<div style="display:flex;justify-content:space-between">${col(d.aVista, PALETA.azul)}${col(d.parcelado, PALETA.azulEscuro)}</div><div class="chamada" data-c style="display:flex;align-items:baseline;gap:24px;align-self:flex-start"><span class="num" style="font-size:72px">${esc(d.diferenca)}</span><span style="font-size:32px;font-weight:500">de diferença de preço</span></div><p class="nota" data-c>Barras a partir de zero, na mesma escala. O mesmo produto nas duas condições.</p></div>${rodape({ n: c.n, total: c.total, a: c.a })}`,
    });
  },

  chipsTexto(d, c) {
    const itens = d.grande
      ? d.chips.map((t) => `<div class="linha-item" data-c style="font-size:40px"><span>${esc(t)}</span></div>`).join('')
      : d.chips.map((t) => `<span data-c style="font-size:44px;font-weight:500;background:var(--claro);border:3px solid var(--borda);border-radius:999px;padding:18px 36px;line-height:1.1">${esc(t)}</span>`).join('');
    return pagina({
      classe: 'off',
      corpo: `<div class="centro" style="gap:44px">${titulo(d.titulo, { max: 68, min: 56, linhas: 4 })}<div style="display:flex;flex-wrap:wrap;gap:20px;${d.grande ? 'flex-direction:column;flex-wrap:nowrap' : ''}">${itens}</div></div>${rodape({ n: c.n, total: c.total, a: c.a })}`,
    });
  },

  listaFerramentas(d, c) {
    const check = `<svg viewBox="0 0 64 64" width="64" height="64" style="flex:none" aria-hidden="true"><circle cx="32" cy="32" r="32" fill="#2457F5"/><path d="M18 33l9 9 19-20" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    return pagina({
      classe: 'off',
      corpo: `<div class="centro" style="gap:40px">${titulo(d.titulo, { max: 60, min: 56, linhas: 3, tag: 'h2' })}<div class="lista" style="gap:16px">${d.itens.map((t) => `<div class="linha-item" data-c style="padding:20px 30px">${check}<span>${esc(t)}</span></div>`).join('')}</div></div>${rodape({ n: c.n, total: c.total, a: c.a })}`,
    });
  },

  nr1(d, c) {
    return pagina({
      classe: 'off',
      corpo: `<div class="centro" style="gap:44px"><p class="rotulo" data-c>Programa de bem-estar e NR-1</p>${titulo(d.titulo, { max: 64, min: 56, linhas: 4, tag: 'h2' })}<div data-c style="background:var(--claro);border-radius:28px;border-left:16px solid var(--lima);padding:36px 40px">${corpoTxt(d.corpo, { max: 40, min: 34, linhas: 6 })}</div></div>${rodape({ n: c.n, total: c.total, a: c.a })}`,
    });
  },

  numeroPergunta(d, c) {
    const rot = d.passo ? `Passo ${d.numero} de ${d.total}` : `Pergunta ${d.numero} de ${d.total}`;
    return pagina({
      classe: 'off',
      corpo: `<div class="centro" style="gap:32px;justify-content:flex-start;padding-top:230px"><p class="rotulo" data-c>${rot}</p><span class="num" data-c style="font-size:140px;color:var(--azul);line-height:.9">${d.numero}</span>${titulo(d.titulo, { max: 72, min: 60, linhas: 4 })}</div>${rodape({ n: c.n, total: c.total, a: c.a })}`,
    });
  },

  // ---- R01 (exemplo regular com calendário visual) ----
  calendarioCapa(d, c) {
    const dias = [];
    for (let k = 1; k <= 14; k++) dias.push(k + 14);
    const destaque = new Set(EXEMPLOS.mes.contas.map((x) => x.dia));
    const cel = (n) => `<div style="height:92px;border-radius:18px;display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:700;${destaque.has(n) ? 'background:var(--lima);color:var(--marinho)' : 'background:rgba(255,255,255,.14);color:var(--branco)'}">${n}</div>`;
    const sem = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((x) => `<div style="text-align:center;font-size:26px;font-weight:500;color:var(--claro)">${x}</div>`).join('');
    return pagina({
      classe: 'azul',
      corpo: `<div class="centro" style="gap:56px"><div class="barra"></div>${titulo(d.titulo, { max: 72, min: 60, linhas: 4 })}<div data-c style="display:grid;grid-template-columns:repeat(7,1fr);gap:12px"><div style="grid-column:1/-1;font-size:28px;font-weight:500;color:var(--claro);margin-bottom:4px">Mês do exemplo, datas ilustrativas</div>${sem}${dias.map(cel).join('')}</div></div>${rodape({ azul: true, n: c.n, total: c.total, a: c.a })}`,
    });
  },

  valoresGrandes(d, c) {
    const max = Math.max(...d.valores.map((v) => v.valor));
    const blocos = d.valores
      .map((v, k) => `<div data-c style="display:flex;flex-direction:column;gap:14px"><span style="font-size:34px;color:var(--cinza)">${esc(v.rotulo)}</span><span class="num" style="font-size:124px">${esc(v.texto)}</span><div style="width:920px;height:28px;border-radius:10px;background:var(--claro)"><div style="width:${Math.round((920 * v.valor) / max)}px;height:28px;border-radius:10px;background:${k ? PALETA.azulEscuro : PALETA.azul}"></div></div></div>`)
      .join('');
    return pagina({
      classe: 'off',
      corpo: `<div class="centro" style="gap:40px">${chipHtml(d.chip)}${titulo(d.titulo, { max: 56, min: 56, linhas: 3, tag: 'h2' })}${blocos}</div>${rodape({ n: c.n, total: c.total, a: c.a })}`,
    });
  },

  calendario(d, c) {
    const destaques = new Map(d.contas.map((x) => [x.dia, x.texto]));
    const sem = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((x) => `<div style="text-align:center;font-size:26px;font-weight:500;color:var(--cinza)">${x}</div>`).join('');
    const cel = (n) => {
      const v = destaques.get(n);
      return `<div style="height:96px;border-radius:16px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;${v ? 'background:var(--lima);color:var(--marinho)' : 'background:var(--branco);border:2px solid var(--borda)'}"><span style="font-size:30px;font-weight:700">${n}</span>${v ? `<span style="font-size:26px;font-weight:700">${esc(v)}</span>` : ''}</div>`;
    };
    const dias = Array.from({ length: 30 }, (_, i) => cel(i + 1)).join('');
    return pagina({
      classe: 'off',
      corpo: `<div class="centro" style="gap:30px">${chipHtml(d.chip)}${titulo(d.titulo, { max: 60, min: 56, linhas: 2, tag: 'h2' })}<div data-c style="display:grid;grid-template-columns:repeat(7,1fr);gap:10px">${sem}${dias}</div><p class="nota" data-c>${esc(d.nota)}</p></div>${rodape({ n: c.n, total: c.total, a: c.a })}`,
    });
  },

  equacaoBarra(d, c) {
    const m = EXEMPLOS.mes;
    const linha = (op, valor, rot, destaque) =>
      `<div data-c style="display:flex;align-items:center;gap:20px;width:920px;padding:6px 16px;border-radius:20px;${destaque ? 'background:var(--lima)' : ''}"><span class="num" style="width:56px;font-size:60px;color:var(--cinza);text-align:center">${op}</span><span class="num" style="font-size:72px;min-width:320px">${esc(valor)}</span><span style="font-size:32px;line-height:1.15">${esc(rot)}</span></div>`;
    const [a, , b, , cc, , r] = d.equacao;
    const partes = [
      { p: m.pago, cor: PALETA.azul, tx: PALETA.branco, rot: 'pago' },
      { p: m.aPagar, cor: PALETA.azulEscuro, tx: PALETA.branco, rot: 'a pagar' },
      { p: m.diferenca, cor: PALETA.lima, tx: PALETA.marinho, rot: 'diferença' },
    ];
    const barra = partes.map((x) => `<div style="width:${(920 * milesimos(x.p, m.recebido)) / 100000}px;height:72px;background:${x.cor};color:${x.tx};display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700">${percentual(x.p, m.recebido, 1)}%</div>`).join('');
    const legenda = partes.map((x) => `<span style="display:flex;align-items:center;gap:10px;font-size:26px"><i style="width:22px;height:22px;border-radius:6px;background:${x.cor};display:inline-block;border:2px solid var(--marinho)"></i>${x.rot}</span>`).join('');
    const soma = partes.reduce((s, x) => s + Number(percentual(x.p, m.recebido, 1).replace(',', '')), 0);
    return pagina({
      classe: 'off',
      corpo: `<div class="centro" style="gap:26px">${chipHtml(d.chip)}
${linha('', a, 'recebidos')}${linha('−', b, 'já pagos')}${linha('−', cc, 'ainda a pagar')}<div style="height:4px;background:var(--marinho);width:888px;margin-left:16px;border-radius:2px"></div>${linha('=', r, 'diferença após essas despesas', true)}
<div data-c style="display:flex;flex-direction:column;gap:12px;margin-top:6px"><div style="display:flex;width:920px;border-radius:14px;overflow:hidden;border:2px solid var(--marinho)">${barra}</div><div style="display:flex;gap:28px">${legenda}</div><p class="nota" style="font-size:26px">Barra de 100% do recebido. Percentuais arredondados: somam ${String(soma / 10).replace('.', ',')}%.</p></div>
${corpoTxt(d.corpo, { max: 38, min: 34, linhas: 2 })}</div>${rodape({ n: c.n, total: c.total, a: c.a })}`,
    });
  },

  checklist(d, c) {
    return pagina({
      classe: 'off',
      corpo: `<div class="centro" style="gap:44px"><div class="lista" style="gap:22px">${d.itens.map((t) => `<div class="linha-item" data-c style="font-size:44px;padding:34px 36px"><span class="caixa"></span><span>${esc(t)}</span></div>`).join('')}</div><p class="chamada" data-c>${esc(d.chamada)}</p></div>${rodape({ n: c.n, total: c.total, a: c.a })}`,
    });
  },

  // ---- T01: post reproduzido (fundo branco, cabeçalho de autor, texto direto; sem faixas azuis nem caixas lima) ----
  post(d, c) {
    return pagina({
      classe: 'branco',
      corpo: `${cabecalhoPost(c.a)}<div style="position:absolute;left:80px;right:80px;top:250px;bottom:80px;display:flex;flex-direction:column;justify-content:center;gap:36px">${titulo(d.titulo, { max: 68, min: 56, linhas: 5 })}${d.corpo ? corpoTxt(d.corpo, { linhas: 4 }) : ''}${d.nota ? `<p data-c style="font-size:${d.notaForte ? 38 : 32}px;${d.notaForte ? 'font-weight:700' : 'color:var(--cinza)'}">${esc(d.nota)}</p>` : ''}</div>`,
    });
  },

  postColunas(d, c) {
    const col = (x) => `<div data-c style="flex:1;border:3px solid #D9E0EE;border-radius:28px;padding:32px;display:flex;flex-direction:column;gap:10px"><span style="font-size:30px;color:var(--cinza)">${esc(x.rotulo)}</span><span class="num" style="font-size:76px">${esc(x.valor)}</span><span style="font-size:30px;color:var(--cinza)">${esc(x.unidade)}</span></div>`;
    return pagina({
      classe: 'branco',
      corpo: `${cabecalhoPost(c.a)}<div style="position:absolute;left:80px;right:80px;top:250px;bottom:80px;display:flex;flex-direction:column;justify-content:center;gap:40px">${titulo(d.titulo, { max: 64, min: 56, linhas: 2, tag: 'h2' })}<div style="display:flex;gap:24px">${d.colunas.map(col).join('')}</div><p data-c style="font-size:44px;font-weight:700">${esc(d.corpo)}</p><p data-c style="font-size:32px;color:var(--cinza)">${esc(d.nota)}</p></div>`,
    });
  },

  postNumero(d, c) {
    const [conta, res] = d.numero.split(' = ');
    return pagina({
      classe: 'branco',
      corpo: `${cabecalhoPost(c.a)}<div style="position:absolute;left:80px;right:80px;top:250px;bottom:80px;display:flex;flex-direction:column;justify-content:center;gap:40px">${titulo(d.titulo, { max: 56, min: 56, linhas: 3, tag: 'h2' })}<div data-c style="display:flex;flex-direction:column;gap:6px"><span class="num" style="font-size:104px">${esc(conta)}</span><span class="num" style="font-size:104px">= ${esc(res)}</span>${d.nota ? `<span data-c style="font-size:32px;color:var(--cinza);margin-top:14px">${esc(d.nota)}</span>` : ''}</div>${corpoTxt(d.corpo, { max: 36, min: 34, linhas: 4 })}</div>`,
    });
  },
};

function cabecalhoPost(a) {
  return `<div data-c style="position:absolute;left:80px;top:96px;display:flex;align-items:center;gap:24px"><img src="${a.iconeApp}" alt="" style="width:96px;height:96px;border-radius:50%;display:block"><span style="font-size:38px;font-weight:700">Clarevo</span></div>`;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// 1080 x 1920: capas de Reel, capas de vídeo com integrante e capas de destaque
// ---------------------------------------------------------------------------------------------------------------------------------
/**
 * Capa de Reel: conteúdo entre 250 px do topo e 350 px do rodapé. O recorte 3:4 da grade do perfil mostra de 240 a 1680 px; por isso o
 * conteúdo começa em 360 px (120 px de folga para os ícones que o Instagram põe sobre a miniatura) e termina em 1560 px.
 */
function capaReel({ tag, titulo: t, sub, chip, quadro, rec }, a) {
  const larg = 800;
  const alt = Math.round((rec.h * (larg - 6)) / rec.w) + 6; // com as bordas de 3 px
  return pagina({
    largura: 1080,
    altura: 1920,
    classe: 'azul',
    corpo: `<div data-zona style="position:absolute;left:80px;right:80px;top:360px;height:1200px;display:flex;flex-direction:column;gap:28px">
${tag ? `<span class="chip" data-c>${esc(tag)}</span>` : ''}
${titulo(t, { max: 72, min: 60, linhas: 4 })}
${sub ? `<p data-c style="font-size:40px;line-height:1.25">${esc(sub)}</p>` : ''}
<div style="flex:1"></div>
<div class="quadro" data-c style="width:${larg}px;height:${alt}px;align-self:center;border-color:rgba(255,255,255,.6)">${recorte({ dados: quadro, largura: larg - 6, rec })}</div>
<div style="display:flex;justify-content:space-between;align-items:center;height:56px;flex:none">${chip ? `<span class="chip" data-c>${esc(chip)}</span>` : '<span></span>'}<img src="${a.logoReverso}" alt="clarevo." style="height:44px;display:block"></div>
</div>`,
  });
}

/** Capa de vídeo com integrante real: o quadro é um marcador, nunca uma imagem de pessoa. */
function capaPessoa({ titulo: t, tag, marcador }, a) {
  return pagina({
    largura: 1080,
    altura: 1920,
    classe: 'azul',
    corpo: `<div data-zona style="position:absolute;left:80px;right:80px;top:360px;height:1200px;display:flex;flex-direction:column;gap:32px">
${tag ? `<span class="chip" data-c>${esc(tag)}</span>` : ''}
${titulo(t, { max: 72, min: 60, linhas: 4 })}
<div style="flex:1"></div>
<div class="foto" data-c style="width:920px;height:640px;border-radius:36px;flex:none;align-self:center;background:repeating-linear-gradient(135deg,#EAF0FF 0 30px,#E0E8FB 30px 60px)">
<svg viewBox="0 0 96 96" fill="none" stroke="#17223B" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="48" cy="48" r="38"/><path d="M40 32l26 16-26 16z"/></svg><p>${esc(marcador)}</p></div>
<div style="display:flex;justify-content:flex-end;align-items:center;height:56px;flex:none"><img src="${a.logoReverso}" alt="clarevo." style="height:44px;display:block"></div>
</div>`,
  });
}

const ICONES = {
  bandeira: '<path d="M34 104V20"/><path d="M34 26h56l-14 20 14 20H34"/>',
  tela: '<rect x="36" y="12" width="48" height="96" rx="12"/><path d="M50 62l8 8 14-16"/><path d="M52 96h16"/>',
  pergunta: '<circle cx="60" cy="60" r="46"/><path d="M45 48c0-10 7-16 15-16s15 6 15 14c0 8-6 10-11 13-3 2-4 4-4 9"/><circle cx="60" cy="88" r="3" fill="#17223B"/>',
  pessoas: '<circle cx="44" cy="38" r="15"/><path d="M14 98V90a22 22 0 0 1 22-22h16a22 22 0 0 1 22 22v8"/><circle cx="88" cy="46" r="11"/><path d="M90 68a20 20 0 0 1 16 20v10"/>',
  boia: '<circle cx="60" cy="60" r="46"/><circle cx="60" cy="60" r="19"/><path d="M28 28l15 15M92 28L77 43M28 92l15-15M92 92L77 77"/>',
  predio: '<rect x="30" y="14" width="60" height="92" rx="6"/><path d="M46 34h8M66 34h8M46 54h8M66 54h8M46 74h8M66 74h8"/><path d="M52 106V90h16v16"/>',
};

/**
 * Capa de destaque: só o ícone, grande e centrado, sobre um disco lima. Sem o nome: o Instagram já mostra o rótulo do destaque embaixo do
 * círculo, e um texto dentro dele ficaria ilegível a 110 px (a capa de 1080 px de largura vira cerca de 10 vezes menor). O Instagram recorta
 * a capa em círculo no centro (aqui, em 540 x 960 px); o disco e o ícone ficam centrados nesse ponto e dentro do recorte.
 */
function capaDestaque({ nome, icone }) {
  const disco = 720;
  const icone_ = 540;
  return pagina({
    largura: 1080,
    altura: 1920,
    classe: 'azul',
    corpo: `<div data-zona style="position:absolute;left:0;top:0;width:1080px;height:1920px">
<div style="position:absolute;left:${(1080 - disco) / 2}px;top:${(1920 - disco) / 2}px;width:${disco}px;height:${disco}px;border-radius:50%;background:var(--lima);display:flex;align-items:center;justify-content:center"><svg data-c role="img" aria-label="${esc(nome)}" viewBox="0 0 120 120" width="${icone_}" height="${icone_}" fill="none" stroke="#17223B" stroke-width="8.5" stroke-linecap="round" stroke-linejoin="round">${ICONES[icone]}</svg></div></div>`,
  });
}

/** Avatar: o ícone oficial do app (C aberto, azul e lima) nos 1080 px, sem nenhuma outra marca. O Instagram recorta em círculo. */
function avatar(a) {
  return pagina({ largura: 1080, altura: 1080, classe: 'azul', corpo: `<img src="${a.iconeApp}" alt="Ícone da Clarevo" style="position:absolute;left:0;top:0;width:1080px;height:1080px;display:block">` });
}

module.exports = { MODELOS, capaReel, capaPessoa, capaDestaque, avatar, ativos, css, pagina, esc, AJUSTE, ICONES, TOKENS, b64, FONTE, recorte, rico };
