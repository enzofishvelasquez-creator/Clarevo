'use strict';
/**
 * Painéis de conferência do Instagram (D-069): a prévia do perfil no celular, a imagem-resumo do calendário D1 a D30 e a folha de contato.
 * Só montam HTML; o gerador desenha no Chromium. As imagens entram por `file://` (os PNG já gerados), para o HTML não carregar dezenas de MB.
 */
const { pathToFileURL } = require('node:url');
const { PALETA } = require('./calculos');
const { css, esc, ICONES } = require('./modelos');

const url = (arquivo) => pathToFileURL(arquivo).href;
const ABERTURA = (largura, corpoExtra = '') => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>${css()}html,body{width:${largura}px;height:auto;overflow:visible}${corpoExtra}</style></head>`;

// ---------------------------------------------------------------------------------------------------------------------------------
// Prévia do perfil
// ---------------------------------------------------------------------------------------------------------------------------------
const SVG_TIPO = {
  fixado: '<svg viewBox="0 0 24 24" width="30" height="30" fill="#fff" stroke="#17223B" stroke-width="1.2" stroke-linejoin="round" aria-hidden="true"><path d="M14 3l7 7-2 1-3 3 .5 5-1.5 1.5-4-4-5 5-1-1 5-5-4-4L7.5 9l5 .5 3-3z"/></svg>',
  carrossel: '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round" aria-hidden="true" style="filter:drop-shadow(0 0 2px rgba(0,0,0,.6))"><rect x="8" y="3" width="13" height="13" rx="2"/><path d="M5 7v11a2 2 0 002 2h11"/></svg>',
  reel: '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round" aria-hidden="true" style="filter:drop-shadow(0 0 2px rgba(0,0,0,.6))"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M10 8.5l5.5 3.5-5.5 3.5z" fill="#fff"/></svg>',
};

/**
 * `celulas`: nove itens `{ arquivo, tipo: 'carrossel' | 'reel', fixado?, codigo }`, na ordem da grade (os três fixados primeiro, depois os mais novos).
 * `destaques`: `{ nome, arquivo, depois? }`. `avatarArquivo`: PNG do avatar.
 */
function previaDoPerfil({ perfil, destaques, celulas, avatarArquivo }) {
  const ico = (nome) => `<svg viewBox="0 0 120 120" width="0" height="0" aria-hidden="true">${ICONES[nome]}</svg>`;
  void ico;
  const aro = (d) => `<div style="display:flex;flex-direction:column;align-items:center;gap:12px;width:160px;${d.depois ? 'opacity:.55' : ''}"><div style="width:156px;height:156px;border-radius:50%;padding:5px;border:3px ${d.depois ? 'dashed' : 'solid'} #C7CEDB;background:#fff"><div style="width:100%;height:100%;border-radius:50%;background-image:url(${url(d.arquivo)});background-size:140px auto;background-position:center -60px;background-repeat:no-repeat;overflow:hidden"></div></div><span style="font-size:24px;line-height:1.1;text-align:center">${esc(d.nome)}</span></div>`;
  const celula = (c) => `<div style="position:relative;width:358px;height:477px;background:#EEE center/cover no-repeat url(${url(c.arquivo)})"><span style="position:absolute;right:10px;top:10px">${SVG_TIPO[c.tipo]}</span>${c.fixado ? `<span style="position:absolute;left:10px;top:10px">${SVG_TIPO.fixado}</span>` : ''}<span style="position:absolute;left:12px;bottom:10px;background:rgba(23,34,59,.82);color:#fff;font-size:24px;font-weight:600;padding:4px 12px;border-radius:999px">${esc(c.codigo)}</span></div>`;
  return `${ABERTURA(1080)}<body class="branco" style="color:#17223B">
<div style="background:var(--lima);color:var(--marinho);padding:30px 40px;font-size:26px;line-height:1.35;font-weight:500">Prévia de conferência no celular. Não é captura do Instagram: mostra como o perfil fica com as 9 primeiras peças do calendário (os três fixados primeiro, depois as mais novas). n/m significa não medido: só depois da coleta.</div>
<div style="padding:34px 40px 0;display:flex;justify-content:space-between;align-items:center;font-size:36px;font-weight:700"><span style="font-size:44px">&#8592;</span><span>${esc(perfil.identificador)}</span><span style="font-size:44px">&#8943;</span></div>
<div style="padding:34px 40px 0;display:flex;align-items:center;gap:44px">
<div style="width:210px;height:210px;border-radius:50%;overflow:hidden;flex:none;background:url(${url(avatarArquivo)}) center/cover"></div>
<div style="display:flex;flex:1;justify-content:space-around;text-align:center">${[['9', 'publicações'], ['n/m', 'seguidores'], ['n/m', 'seguindo']].map(([v, r]) => `<div><div style="font-size:42px;font-weight:700">${v}</div><div style="font-size:26px;color:var(--cinza)">${r}</div></div>`).join('')}</div></div>
<div style="padding:26px 40px 0"><div style="font-size:38px;font-weight:700">${esc(perfil.nome)}</div>
<div style="font-size:34px;line-height:1.35;margin-top:10px">${perfil.bio.map(esc).join('<br>')}</div>
<div style="font-size:32px;font-weight:700;color:var(--azul);margin-top:14px;display:flex;align-items:center;gap:12px"><svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#2457F5" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/></svg>${esc(perfil.link)}</div></div>
<div style="padding:26px 40px 0;display:flex;gap:16px"><div style="flex:1;background:var(--azul);color:#fff;border-radius:16px;text-align:center;padding:20px;font-size:30px;font-weight:700">Seguir</div><div style="flex:1;background:#EEF0F4;border-radius:16px;text-align:center;padding:20px;font-size:30px;font-weight:700">Mensagem</div></div>
<div style="padding:34px 30px 0;display:flex;gap:16px;overflow:hidden">${destaques.map(aro).join('')}</div>
<div style="margin-top:30px;display:flex;border-bottom:2px solid #E3E7EF;border-top:2px solid #E3E7EF">${['grade', 'reels', 'marcado'].map((t, i) => `<div style="flex:1;display:flex;justify-content:center;padding:20px 0;${i === 0 ? 'border-bottom:4px solid #17223B;margin-bottom:-2px' : 'opacity:.45'}"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#17223B" stroke-width="2" aria-hidden="true">${t === 'grade' ? '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>' : t === 'reels' ? '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M10 8.5l5.5 3.5-5.5 3.5z"/>' : '<path d="M5 3h14v18l-7-5-7 5z"/>'}</svg></div>`).join('')}</div>
<div style="display:grid;grid-template-columns:repeat(3,358px);gap:3px;width:1080px">${celulas.map(celula).join('')}</div>
</body></html>`;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Calendário D1 a D30 (imagem-resumo)
// ---------------------------------------------------------------------------------------------------------------------------------
const TIPOS = {
  preparo: { rotulo: 'Preparo do perfil', fundo: PALETA.claro, texto: PALETA.marinho, borda: PALETA.azul },
  carrossel: { rotulo: 'Carrossel', fundo: PALETA.azul, texto: PALETA.branco, borda: PALETA.azul },
  reel: { rotulo: 'Reel', fundo: PALETA.marinho, texto: PALETA.branco, borda: PALETA.marinho },
  integrante: { rotulo: 'Posição flexível (trend ou vídeo com integrante)', fundo: PALETA.lima, texto: PALETA.marinho, borda: PALETA.marinho },
  revisao: { rotulo: 'Revisão', fundo: PALETA.branco, texto: PALETA.marinho, borda: PALETA.azulEscuro },
  escuta: { rotulo: 'Stories e escuta', fundo: PALETA.off, texto: PALETA.marinho, borda: PALETA.cinza },
  livre: { rotulo: 'Stories de apoio', fundo: PALETA.off, texto: PALETA.cinza, borda: '#C7CEDB' },
  decisao: { rotulo: 'Decisão do ciclo', fundo: PALETA.azulEscuro, texto: PALETA.branco, borda: PALETA.azulEscuro },
};

function imagemDoCalendario(calendario) {
  const cel = (c) => {
    const t = TIPOS[c.tipo];
    return `<div style="background:${t.fundo};color:${t.texto};border:4px ${c.tipo === 'livre' ? 'dashed' : 'solid'} ${t.borda};border-radius:24px;padding:22px 24px;height:250px;display:flex;flex-direction:column;gap:6px;overflow:hidden"><div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font-size:30px;font-weight:700">D${c.dia}</span></div><div style="font-size:${c.peca.length > 12 ? 36 : 50}px;font-weight:700;line-height:1.05">${esc(c.peca)}</div><div style="font-size:26px;line-height:1.2">${esc(c.formato)}</div></div>`;
  };
  const legenda = Object.entries(TIPOS).map(([, t]) => `<span style="display:flex;align-items:center;gap:12px;font-size:26px"><i style="width:34px;height:34px;border-radius:9px;background:${t.fundo};border:4px solid ${t.borda};display:inline-block"></i>${esc(t.rotulo)}</span>`).join('');
  return `${ABERTURA(2480)}<body class="branco" style="padding:56px 48px 56px;color:#17223B">
<h1 style="font-size:64px;margin-bottom:10px">Calendário do primeiro mês: D1 a D30</h1>
<p style="font-size:30px;color:var(--cinza);margin-bottom:28px">Playbook v2.2. D é o dia do piloto de criação do perfil. Três peças por semana como referência; D13 e D20 são posições flexíveis (T01 ou T02 se houver trend adequada, senão P06 ou P09).</p>
<div style="display:flex;flex-wrap:wrap;gap:16px 36px;margin-bottom:30px">${legenda}</div>
<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:16px">${calendario.map(cel).join('')}</div>
<p style="font-size:28px;line-height:1.4;margin-top:30px">Horários para testar: 12h e 19h de Brasília, anotando horário e formato. Revisões nos D14, D21, D28 e D29 e D30; escuta nos D15, D22 e D29. Sem promessa de alcance. A publicação, as fotos, as gravações com pessoas, a conferência do produto e o canal comercial dependem da equipe (detalhe em calendario.md).</p>
</body></html>`;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Folha de contato
// ---------------------------------------------------------------------------------------------------------------------------------
/** `grupos`: `{ titulo, itens: [{ arquivo, largura, altura, legenda? }] }`. Altura fixa de 300 px por miniatura. */
function folhaDeContato(grupos, { titulo }) {
  const bloco = (g) => `<section style="break-inside:avoid;margin:0 0 34px"><h2 style="font-size:28px;margin:0 0 12px;font-weight:700">${esc(g.titulo)}</h2><div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end">${g.itens.map((i) => `<figure style="margin:0"><img src="${url(i.arquivo)}" style="display:block;height:300px;width:${Math.round((300 * i.largura) / i.altura)}px;border:2px solid #CBD7F3" alt="">${i.legenda ? `<figcaption style="font-size:22px;color:var(--cinza);margin-top:4px">${esc(i.legenda)}</figcaption>` : ''}</figure>`).join('')}</div></section>`;
  return `${ABERTURA(3760)}<body class="off" style="padding:44px 48px;color:#17223B">
<h1 style="font-size:56px;margin-bottom:8px">${esc(titulo)}</h1>
<p style="font-size:26px;color:var(--cinza);margin-bottom:30px">Todas as páginas e capas, para conferir de uma vez. As fotos reais e as gravações com integrantes aparecem como quadros marcados: a equipe escolhe e substitui no Canva.</p>
<div style="column-count:2;column-gap:56px">${grupos.map(bloco).join('')}</div>
</body></html>`;
}

module.exports = { previaDoPerfil, imagemDoCalendario, folhaDeContato, TIPOS, url };
