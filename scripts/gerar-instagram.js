#!/usr/bin/env node
/**
 * Gerador do Instagram da Clarevo (D-069, `docs/25_INSTAGRAM.md`): identidade do perfil e peças do primeiro mês, como o Playbook de Redes
 * Sociais v2.2 e o Manual Operacional v2.2 sugerem. Não muda app, site nem banco, e não baixa nada: tudo é HTML desenhado no Chromium do
 * Playwright (PNG) e montagem do `ffmpeg` (MP4 de rascunho).
 *
 * O que sai em `--saida` (fora do repositório; só o gerador e os textos ficam nele):
 *   perfil/                 avatar 1080 x 1080 (e a conferência a 110 e 44 px), seis capas de destaque 1080 x 1920, prévia do perfil no
 *                           celular, nome-e-bio.txt (com a contagem de caracteres)
 *   D05-P01-.../ ...        uma pasta por peça, na ordem do calendário: pagina-N.png (carrosséis 1080 x 1350), capa.png (Reels e vídeos com
 *                           integrante, 1080 x 1920), rascunho.mp4 (Reels), legenda.txt, alt.txt, roteiro.md (vídeos), ficha.md
 *   reserva-.../            pautas de reserva (R01, B, F01 e F02), fora do calendário
 *   calendario.md, calendario.png, montagem.png (folha de contato) e LEIA-ME.txt
 *
 * Marca: a assinatura "clarevo." é o ativo original de `docs/marca` (nunca redigitada) e o ícone C só aparece no avatar. DM Sans (OFL, em
 * `scripts/instagram/fontes`) nas artes. Foto real e gravação com integrante são quadros marcados: nada de rosto gerado, foto de banco
 * baixada ou imagem inventada. Telas do app só de captura real recortada. Sem nome de pessoa real.
 *
 * Antes de desenhar, o gerador confere o conteúdo (`scripts/instagram/validar.js`: redação, números dos exemplos, limites da bio e do
 * nome, contrastes, páginas por peça) e, em cada página desenhada, margens de 80 px, zonas livres dos 9:16, tamanhos de fonte (rótulo de 24
 * px ou mais, títulos de 56 a 72 px, corpo de 32 a 40 px) e contraste do texto real. Recusa a página que falhar.
 *
 * Uso:
 *   node scripts/gerar-instagram.js --saida <pasta> --redes <pasta das gravações>
 *   node scripts/gerar-instagram.js --saida <pasta> --redes <pasta> --so perfil,P01,P02   só estas partes (perfil, calendario, montagem ou o código da peça)
 *   node scripts/gerar-instagram.js --sem-video                                            não monta os MP4 de rascunho
 * `--redes` é a pasta que `node scripts/gravar-redes.js --saida <pasta>` grava (mp4, quadros e capturas/). Ambiente: CHROMIUM_PATH, FFMPEG,
 * FFPROBE e PLAYWRIGHT_BROWSERS_PATH (padrão /opt/pw-browsers).
 */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
const { chromium } = require('playwright');
const png = require('./site/png');
const { contarCaracteres, LIMITES, PALETA, contraste } = require('./instagram/calculos');
const { PERFIL, DESTAQUES, PECAS, CALENDARIO, GRAVACOES, PESSOA } = require('./instagram/conteudo');
const { validarTudo } = require('./instagram/validar');
const { MODELOS, capaReel, capaPessoa, capaDestaque, avatar, ativos, AJUSTE, css } = require('./instagram/modelos');
const { previaDoPerfil, imagemDoCalendario, folhaDeContato, TIPOS, url } = require('./instagram/paineis');
const video = require('./instagram/video');

const RAIZ = path.join(__dirname, '..');
const FFMPEG = process.env.FFMPEG || (fs.existsSync('/usr/bin/ffmpeg') ? '/usr/bin/ffmpeg' : 'ffmpeg');
const FFPROBE = process.env.FFPROBE || (fs.existsSync('/usr/bin/ffprobe') ? '/usr/bin/ffprobe' : 'ffprobe');

// ---------------------------------------------------------------------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------------------------------------------------------------------
function lerArgumentos(argv) {
  const a = { saida: null, redes: process.env.CLAREVO_REDES || null, so: null, semVideo: false };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--saida') a.saida = argv[++i];
    else if (v === '--redes') a.redes = argv[++i];
    else if (v === '--so') a.so = new Set(argv[++i].split(',').map((x) => x.trim().toUpperCase()));
    else if (v === '--sem-video') a.semVideo = true;
    else throw new Error(`argumento desconhecido: ${v}`);
  }
  return a;
}

const fazer = (args, nome) => !args.so || args.so.has(nome.toUpperCase());

// ---------------------------------------------------------------------------------------------------------------------------------
// Conferência de cada página desenhada (roda no navegador)
// ---------------------------------------------------------------------------------------------------------------------------------
/** Roda dentro do navegador (Playwright manda o código da função): nada de fora dela pode ser usado aqui. */
function conferirPagina({ W, H, rodapeTopo }) {
  const erros = [];
  const lum = (c) => { const v = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const rgba = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(Number); return { c: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 }; };
  const fundoDe = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage !== 'none' && !cs.backgroundImage.startsWith('url(') ) return [234, 240, 255];
      const c = rgba(cs.backgroundColor);
      if (c && c.a > 0.5) return c.c;
    }
    return [255, 255, 255];
  };
  const zona = !!document.querySelector('[data-zona]');
  const nome = (el) => ((el.textContent || el.tagName) + '').trim().replace(/\s+/g, ' ').slice(0, 44);
  if (document.documentElement.scrollHeight > H + 1 || document.documentElement.scrollWidth > W + 1) erros.push('a página rola: o conteúdo passa do tamanho da arte');
  for (const el of document.querySelectorAll('[data-c]')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) { erros.push('elemento sem tamanho: ' + nome(el)); continue; }
    if (r.left < 79 || r.right > W - 79) erros.push('fora da margem de 80 px: ' + nome(el) + ' (x ' + Math.round(r.left) + ' a ' + Math.round(r.right) + ')');
    if (zona) { if (r.top < 249 || r.bottom > 1571) erros.push('fora da zona livre (250 a 1570 px): ' + nome(el) + ' (y ' + Math.round(r.top) + ' a ' + Math.round(r.bottom) + ')'); }
    else if (r.bottom > rodapeTopo) erros.push('encosta no rodapé: ' + nome(el) + ' (termina em ' + Math.round(r.bottom) + ', limite ' + rodapeTopo + ')');
    if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).display !== 'inline') erros.push('texto cortado na largura: ' + nome(el));
  }
  for (const el of document.querySelectorAll('body *')) {
    const tem = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!tem) continue;
    const cs = getComputedStyle(el);
    const t = parseFloat(cs.fontSize);
    if (t < 23.99) erros.push('fonte de ' + t + ' px (mínimo 24 px): ' + nome(el));
    if (el.classList.contains('titulo') && !el.dataset.livre && (t < 55.99 || t > 72.01)) erros.push('título de ' + t + ' px (56 a 72 px): ' + nome(el));
    if (el.classList.contains('corpo') && (t < 31.99 || t > 40.01)) erros.push('corpo de ' + t + ' px (32 a 40 px): ' + nome(el));
    const cor = rgba(cs.color); const fundo = fundoDe(el);
    if (cor) {
      const l1 = lum(cor.c), l2 = lum(fundo); const r = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const lima = cor.c.join() === '212,240,91'; const sobreAzul = fundo.join() === '36,87,245';
      const exigido = lima && sobreAzul ? 3 : 4.5;
      if (r < exigido) erros.push('contraste ' + r.toFixed(2) + ':1 (mínimo ' + exigido + ':1): ' + nome(el));
      if (lima && sobreAzul && !(parseInt(cs.fontWeight, 10) >= 700 && t >= 36)) erros.push('lima sobre azul só em texto grande e em negrito: ' + nome(el));
      if (cor.c.join() === '255,255,255' && fundo.join() === '212,240,91') erros.push('branco sobre lima: ' + nome(el));
    }
  }
  return erros;
};

// ---------------------------------------------------------------------------------------------------------------------------------
// Desenho
// ---------------------------------------------------------------------------------------------------------------------------------
async function preparar(pagina, html, largura, altura) {
  await pagina.setViewportSize({ width: largura, height: altura });
  await pagina.setContent(html, { waitUntil: 'load' });
  await pagina.evaluate(() => Promise.all([document.fonts.load('700 64px "DM Sans"'), document.fonts.load('400 38px "DM Sans"'), ...[...document.images].map((i) => i.decode().catch(() => {}))]).then(() => document.fonts.ready));
  if (!(await pagina.evaluate(() => document.fonts.check('700 64px "DM Sans"') && document.fonts.check('400 38px "DM Sans"')))) throw new Error('a DM Sans não carregou');
}

/** Desenha uma arte, confere e grava PNG de 24 bits sem transparência. `conferir: false` para o avatar (sem texto). */
async function desenhar(pagina, html, { largura, altura, destino, rotulo, conferir = true }) {
  await preparar(pagina, html, largura, altura);
  const ajuste = await pagina.evaluate(AJUSTE);
  const problemas = [...ajuste.map((f) => `título não cabe: ${f}`)];
  if (conferir) problemas.push(...(await pagina.evaluate(conferirPagina, { W: largura, H: altura, rodapeTopo: altura - 64 - 44 - 20 })));
  if (problemas.length > 0) throw new Error(`${rotulo}: ${problemas.join('; ')}`);
  const foto = await pagina.screenshot({ type: 'png', clip: { x: 0, y: 0, width: largura, height: altura } });
  const img = png.decodificar(foto);
  if (img.largura !== largura || img.altura !== altura) throw new Error(`${rotulo}: saiu ${img.largura}x${img.altura}, esperado ${largura}x${altura}`);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, png.codificar(img, { paleta: false }));
  return { largura, altura };
}

/** Camada com transparência (para o vídeo): não confere margens, só grava. */
async function desenharCamada(pagina, html, { largura, altura, destino, clip }) {
  await preparar(pagina, html, largura, altura);
  await pagina.evaluate(AJUSTE);
  const buf = await pagina.screenshot({ type: 'png', omitBackground: true, clip: clip || { x: 0, y: 0, width: largura, height: altura } });
  fs.writeFileSync(destino, buf);
}

function rodar(programa, argumentos, rotulo) {
  const r = spawnSync(programa, argumentos, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${rotulo} falhou (${r.status}): ${(r.stderr || '').split('\n').slice(-8).join('\n')}`);
  return r.stdout;
}

const duracaoDe = (arquivo) => Number(rodar(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', arquivo], 'ffprobe').trim());
const dadosDe = (arquivo) => `data:image/png;base64,${fs.readFileSync(arquivo).toString('base64')}`;

// ---------------------------------------------------------------------------------------------------------------------------------
// Textos de cada peça
// ---------------------------------------------------------------------------------------------------------------------------------
const CONFERENCIA_PLAYBOOK = [
  ['Utilidade', 'A peça responde a pergunta da capa e entrega algo aplicável?'],
  ['Produto', 'O recurso foi testado na versão atual, com data e responsável?'],
  ['Autenticidade', 'Pessoas, funções, depoimentos e telas são reais e corretos?'],
  ['Dados', 'Nomes, contatos, contas e valores pessoais foram substituídos em uma conta de demonstração?'],
  ['Promessa', 'O texto evita resultado garantido, tratamento e recurso futuro como disponível?'],
  ['Oferta', 'Preço, pagamento, plataformas e condições estão conferidos quando citados?'],
  ['Acesso', 'O destino funciona no navegador do Instagram e nos dispositivos anunciados?'],
  ['Leitura', 'Capa, texto e tela são legíveis na prévia de um celular?'],
  ['Áudio e legenda', 'A narração está clara e a legenda foi revisada?'],
  ['Ação', 'Há uma ação principal, com destino adequado ao formato?'],
  ['Registro', 'Peça, origem e campanha podem ser identificadas no acompanhamento?'],
];

const NOME_FORMATO = {
  carrossel: 'carrossel (1080 x 1350)',
  'carrossel-trend': 'carrossel de trend, post reproduzido (1080 x 1350)',
  reel: 'Reel (1080 x 1920)',
  'video-integrante': 'vídeo com integrante real (1080 x 1920)',
  'trend-a-definir': 'trend a definir',
};

function fichaMd(p) {
  const l = [];
  l.push(`# ${p.id}: ${p.nome}`, '');
  l.push(`- **Dia no calendário:** ${p.dia ? `D${p.dia}` : p.reserva ? 'reserva (fora do D1 a D30)' : 'Stories e destaque Ajuda'}${p.fixado ? ` · fixado ${p.fixado}` : ''}`);
  l.push(`- **Formato:** ${NOME_FORMATO[p.formato] || p.formato}${p.paginas ? `, ${p.paginas.length} páginas` : ''}`);
  if (p.familia) l.push(`- **Família visual (Manual v2.2):** ${p.familia}`);
  if (p.alternativaDe) l.push(`- **Alternativa perene de:** ${p.alternativaDe}`);
  if (p.alternativaPerene) l.push(`- **Alternativa perene:** ${p.alternativaPerene}`);
  l.push(`- **Objetivo:** ${p.objetivo}`, `- **Ação principal:** ${p.acao}`, '');
  l.push('## O que depende da equipe', '', ...p.depende.map((d) => `- ${d}`), '');
  if (p.conferencia) {
    l.push('## Conferência da ficha de afirmações (`docs/24_REDES_SOCIAIS.md`, seção 1)', '', 'Versão do app conferida: a da ficha (demonstração de 07/10/2026, gravações de 23/10/2026). O responsável pelo produto, a designar, refaz o teste na versão que for ao ar antes de publicar.', '');
    l.push('| Afirmação | Situação | Evidência e cuidado |', '|---|---|---|', ...p.conferencia.map((c) => `| ${c.afirmacao} | ${c.situacao} | ${c.nota} |`), '');
  }
  if (p.ajustes) l.push('## Ajustes em relação ao texto do Playbook', '', ...p.ajustes.map((a) => `- ${a}`), '');
  if (!p.semArte) {
    l.push('## Conferência antes de publicar (Playbook v2.2)', '', ...CONFERENCIA_PLAYBOOK.map(([t, q]) => `- [ ] **${t}.** ${q}`), '');
  }
  return l.join('\n');
}

function legendaTxt(p) {
  return `${p.legenda}\n`;
}

function altTxt(p) {
  if (Array.isArray(p.alt)) return `${p.alt.map((a, i) => `Página ${i + 1}: ${a}`).join('\n')}\n`;
  return `Vídeo: ${p.alt}\n${p.altCapa ? `Capa: ${p.altCapa}\n` : ''}`;
}

function roteiroMd(p) {
  const l = [`# Roteiro ${p.id}: ${p.nome}`, ''];
  if (p.formato === 'reel') {
    l.push('Texto na tela e narração sugerida, ajustados ao que a tela da gravação mostra de verdade (`docs/24_REDES_SOCIAIS.md`, seção 2). Os tempos são os da gravação limpa (`gravacao-limpa.mp4`). O `rascunho.mp4` usa a coluna "Texto na tela"; `legendas.srt` traz a narração para o Edits.', '');
    l.push('| Início | Texto na tela | Narração sugerida |', '|---|---|---|', ...p.roteiro.map((t) => `| ${String(t.em).replace('.', ',')} s | ${t.tela} | ${t.fala} |`), '');
    l.push('Direção de edição (Playbook): mostrar primeiro a dúvida e depois o resultado na tela; evitar abertura com animação longa do logo; ampliar os valores sem redesenhar a interface; legendar a fala e manter "Exemplo fictício" enquanto os valores aparecerem; conferir o recorte no perfil sem depender das bordas. Duração de referência de cerca de 30 segundos, sem promessa sobre a duração que gera melhor resultado.');
  } else {
    l.push(`Vídeo com integrante real. A capa deste rascunho traz o quadro "${PESSOA}": a gravação é da equipe, com autorização de imagem e de fala, e a própria pessoa revisa o texto antes de gravar.`, '');
    l.push('## Fala', '', ...p.roteiro.map((t) => `> ${t.fala}`), '');
    if (p.stories) l.push('## Sequência de Stories para apoiar uma peça', '', ...p.stories.map((s, i) => `${i + 1}. ${s}`), '');
    if (p.respostas) l.push('## Respostas para a equipe adaptar', '', '| Situação | Resposta base |', '|---|---|', ...p.respostas.map((r) => `| ${r.situacao} | ${r.resposta} |`), '', 'Definir uma rotina de leitura em dias úteis e informar o horário real de atendimento. Não prometer resposta imediata. Dúvidas recorrentes viram pauta; dados de pessoas ficam fora do relatório público.', '');
  }
  return `${l.join('\n')}\n`;
}

function calendarioMd() {
  const l = ['# Calendário do primeiro mês: D1 a D30', ''];
  l.push('Base: Playbook de Redes Sociais v2.2 (24/10/2026). **D é o dia do piloto de criação do perfil.** Referência de três peças por semana, sem promessa de alcance. D13 e D20 são posições flexíveis: T01 ou T02 se houver trend adequada na revisão semanal (até 48 horas antes), senão P06 ou P09.', '');
  l.push('Horários a testar: 12h e 19h de Brasília, anotando horário e formato e comparando várias peças antes de ajustar. Nos dias de publicação, Stories de apoio. Sem parâmetro de rastreamento nos links (D-067); os números vêm do painel do Instagram e das contagens do app, e "não medido" vale onde não houver captura.', '');
  l.push('| Dia | Peça | Formato | Objetivo | Ação | Depende da equipe |', '|---|---|---|---|---|---|');
  for (const c of CALENDARIO) l.push(`| D${c.dia} | ${c.peca} | ${c.formato} | ${c.objetivo} | ${c.acao} | ${c.depende} |`);
  l.push('', '**Fora do calendário:** P12 (dúvida de acesso) fica nos Stories e no destaque Ajuda; R01, B, F01 e F02 são pautas de reserva para o ciclo seguinte ou para o lugar de uma peça repetida.', '');
  l.push('**Bloqueios conhecidos hoje:** a B01 (D27) e o destaque Para empresas dependem do canal comercial conferido, da revisão técnica de saúde e NR-1 e da resposta da pergunta 35 ao advogado; a chamada final da P11 e o destaque Ajuda dependem do canal de ajuda; todas as peças de produto dependem do teste na versão que for ao ar.', '');
  return `${l.join('\n')}\n`;
}

function nomeEBioTxt() {
  const c = (t) => contarCaracteres(t);
  const bio = PERFIL.bio.join('\n');
  const bio2 = PERFIL.bioAcessoAberto.join('\n');
  return `NOME DE EXIBIÇÃO (Playbook v2.2; conferir o identificador e o limite disponível na conta)
${PERFIL.nome}
${c(PERFIL.nome)} caracteres (limite adotado: ${LIMITES.nome})

BIO COM O ACESSO EM PREPARAÇÃO (vale hoje, D-067)
${bio}
${c(bio)} caracteres, com a quebra de linha contando 1 (limite do Instagram: ${LIMITES.bio}). Linhas: ${PERFIL.bio.map((x) => c(x)).join(', ')}.

BIO PARA QUANDO O ACESSO ABRIR (Playbook v2.2, trocar a terceira linha junto com a P03 e o destaque Comece aqui)
${bio2}
${c(bio2)} caracteres.

LINK DA BIO
${PERFIL.linkCompleto}
Versão preliminar do site (sem domínio próprio e sem indexação): testar no navegador do Instagram e no celular antes de abrir o perfil. Sem parâmetro de rastreamento (D-067).

IDENTIFICADOR
Só exibir o @ depois de confirmado o identificador real.

DESTAQUES (nesta ordem; Para empresas só com a apresentação e o canal comercial conferidos)
${DESTAQUES.map((d) => `- ${d.nome}: ${d.conteudo}`).join('\n')}

FIXADOS: P01 O que é a Clarevo, P02 Clarevo na prática e P03 Como acessar.
AVATAR: o ícone oficial C (avatar-1080.png), nunca a assinatura.
`;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Geração
// ---------------------------------------------------------------------------------------------------------------------------------
async function main() {
  const args = lerArgumentos(process.argv.slice(2));
  const SAIDA = path.resolve(args.saida || path.join(os.tmpdir(), 'clarevo-instagram'));
  const REDES = args.redes ? path.resolve(args.redes) : null;

  const erros = validarTudo({ modelos: MODELOS });
  if (erros.length > 0) throw new Error(`o conteúdo não passou na conferência:\n  ${erros.join('\n  ')}`);
  console.log('conteúdo conferido (redação, números, limites do perfil, contrastes e estrutura)');

  const precisaDeRedes = PECAS.some((p) => (p.gravacao || (p.paginas || []).some((x) => x.captura)) && fazer(args, p.id)) || fazer(args, 'montagem');
  if (precisaDeRedes && (!REDES || !fs.existsSync(path.join(REDES, 'capturas')))) {
    throw new Error('falta a pasta das gravações e capturas reais: rode node scripts/gravar-redes.js --saida <pasta> e passe --redes <pasta>');
  }

  const a = ativos();
  const capturas = {};
  if (REDES) for (const arq of fs.readdirSync(path.join(REDES, 'capturas'))) capturas[`capturas/${arq}`] = dadosDe(path.join(REDES, 'capturas', arq));

  fs.mkdirSync(SAIDA, { recursive: true });
  // O Chromium não abre `file://` a partir de `setContent`: os painéis com imagens do disco vão por um HTML temporário na própria pasta.
  let contadorTmp = 0;
  const abrirLocal = async (pg, html, largura, altura) => {
    const arq = path.join(SAIDA, `.tmp-${++contadorTmp}.html`);
    fs.writeFileSync(arq, html);
    try {
      await pg.setViewportSize({ width: largura, height: altura });
      await pg.goto(url(arq), { waitUntil: 'load' });
      await pg.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode().catch(() => {}))]));
    } finally {
      fs.rmSync(arq, { force: true });
    }
  };
  const simples = (corpo, largura) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>${css()}html,body{width:${largura}px;height:auto;overflow:visible}</style></head><body>${corpo}</body></html>`;
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const gerados = []; // para a folha de contato: { grupo, ordem, itens }
  const grupo = (titulo, itens) => gerados.push({ titulo, itens });
  try {
    const pagina = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });

    // ---------------- Perfil ----------------
    const perfilDir = path.join(SAIDA, 'perfil');
    if (fazer(args, 'perfil')) {
      fs.mkdirSync(path.join(perfilDir, 'destaques'), { recursive: true });
      await desenhar(pagina, avatar(a), { largura: 1080, altura: 1080, destino: path.join(perfilDir, 'avatar-1080.png'), rotulo: 'avatar', conferir: false });
      // Conferência do avatar: o círculo do Instagram a 110 px (perfil) e a 44 px (feed) e o quadrado.
      const av = url(path.join(perfilDir, 'avatar-1080.png'));
      const circ = (d, fundo) => `<div style="background:${fundo};padding:28px 40px;display:flex;align-items:center;gap:30px"><div style="width:${d}px;height:${d}px;border-radius:50%;background:url(${av}) center/cover;flex:none"></div><span style="font-size:30px;color:${fundo === '#fff' ? '#17223B' : '#fff'}">${d} px</span></div>`;
      await abrirLocal(pagina, simples(`<div style="display:flex">${circ(110, '#fff')}${circ(44, '#fff')}${circ(110, '#17223B')}${circ(44, '#17223B')}</div><div style="padding:28px 40px;background:#F7F9FD;display:flex;gap:40px;align-items:center"><img src="${av}" style="width:320px;height:320px"><div style="width:110px;height:110px;border-radius:50%;overflow:hidden;flex:none"><img src="${av}" style="width:110px;height:110px"></div><span style="font-size:30px;line-height:1.3">O avatar nos 1080 px e, ao lado, no círculo de 110 px. O círculo é o recorte do Instagram.</span></div>`, 1100), 1100, 560);
      fs.writeFileSync(path.join(perfilDir, 'avatar-conferencia.png'), await pagina.screenshot({ type: 'png', fullPage: true }));
      const itensDestaque = [];
      for (const [i, d] of DESTAQUES.entries()) {
        const destino = path.join(perfilDir, 'destaques', `capa-${i + 1}-${d.id}.png`);
        await desenhar(pagina, capaDestaque(d), { largura: 1080, altura: 1920, destino, rotulo: `destaque ${d.nome}` });
        itensDestaque.push({ arquivo: destino, largura: 1080, altura: 1920, legenda: d.nome });
      }
      fs.writeFileSync(path.join(perfilDir, 'nome-e-bio.txt'), nomeEBioTxt());
    }
    const avatarArquivo = path.join(perfilDir, 'avatar-1080.png');

    // ---------------- Peças ----------------
    const ordem = [...PECAS].sort((x, y) => (x.reserva ? 1 : 0) - (y.reserva ? 1 : 0) || (x.dia ?? 99) - (y.dia ?? 99) || x.id.localeCompare(y.id));
    const arquivosDasPecas = {};
    for (const p of ordem) {
      if (!fazer(args, p.id)) continue;
      const dir = path.join(SAIDA, p.pasta);
      fs.mkdirSync(dir, { recursive: true });
      const itens = [];
      if (p.semArte) {
        fs.writeFileSync(path.join(dir, 'LEIA-ME.txt'), `T02: posição flexível do D20, sem arte pronta.\n\nO Playbook v2.2 define só o objetivo (reconhecimento e reflexão) e a ação (salvar ou comentar a experiência): o formato em circulação é escolhido na revisão semanal, perto da publicação (até 48 horas antes), com a ficha de referência externa do Manual (mídia exata, origem e link direto, data e sinal, justificativa, direitos, aplicação técnica, plano B e resultado esperado). "Uma referência passageira não deve ser fechada com um mês de antecedência."\n\nSe não houver referência adequada, relevante, autorizada e viável em tempo, publicar a alternativa perene: P09 (pasta D20-P09-...).\n`);
        fs.writeFileSync(path.join(dir, 'ficha.md'), `# T02: trend em circulação\n\n- **Dia:** D20 · posição flexível\n- **Objetivo:** ${p.objetivo}\n- **Ação principal:** ${p.acao}\n- **Alternativa perene:** ${p.alternativaPerene}\n\n## O que depende da equipe\n\n${p.depende.map((d) => `- ${d}`).join('\n')}\n`);
        console.log(`${p.id}: sem arte (a definir na revisão semanal)`);
        continue;
      }
      const ctxBase = { a, capturas, total: p.paginas ? p.paginas.length : 0 };
      if (p.paginas) {
        for (const [i, pg] of p.paginas.entries()) {
          const html = MODELOS[pg.modelo](pg, { ...ctxBase, n: i + 1 });
          const destino = path.join(dir, `pagina-${i + 1}.png`);
          await desenhar(pagina, html, { largura: 1080, altura: 1350, destino, rotulo: `${p.id} página ${i + 1} (${pg.modelo})` });
          itens.push({ arquivo: destino, largura: 1080, altura: 1350 });
        }
      } else if (p.formato === 'reel') {
        const g = GRAVACOES[p.gravacao];
        const quadro = path.join(REDES, g.quadroDaCapa);
        const destino = path.join(dir, 'capa.png');
        await desenhar(pagina, capaReel({ ...p.capa, quadro: dadosDe(quadro), rec: g.recorte }, a), { largura: 1080, altura: 1920, destino, rotulo: `${p.id} capa` });
        itens.push({ arquivo: destino, largura: 1080, altura: 1920, legenda: 'capa' });
        // Montagem de rascunho com a gravação real.
        const limpa = path.join(REDES, `${g.base}.mp4`);
        if (!fs.existsSync(limpa)) throw new Error(`falta a gravação ${limpa}`);
        fs.copyFileSync(limpa, path.join(dir, 'gravacao-limpa.mp4'));
        const dur = duracaoDe(limpa);
        fs.writeFileSync(path.join(dir, 'legendas.srt'), video.srt(p.roteiro, dur));
        if (!args.semVideo) {
          const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clarevo-ig-'));
          try {
            const camada = path.join(tmp, 'camada.png');
            await desenharCamada(pagina, video.htmlCamadaFixa({ logo: a.logoReverso, chip: 'Exemplo fictício · demonstração' }), { largura: 1080, altura: 1920, destino: camada });
            const legs = [];
            for (const [i, t] of video.trechos(p.roteiro, dur).entries()) {
              const arq = path.join(tmp, `leg-${i}.png`);
              await desenharCamada(pagina, video.htmlLegenda(t.texto), { largura: 1080, altura: 1920, destino: arq });
              legs.push({ png: arq, de: t.de, ate: t.ate });
            }
            const mp4 = path.join(dir, 'rascunho.mp4');
            rodar(FFMPEG, video.argumentosFfmpeg({ gravacao: limpa, camada, legendas: legs, duracao: dur, saida: mp4 }), `ffmpeg ${p.id}`);
            const saidaDur = duracaoDe(mp4);
            if (Math.abs(saidaDur - dur) > 0.3) throw new Error(`${p.id}: o rascunho tem ${saidaDur.toFixed(2)} s e a gravação, ${dur.toFixed(2)} s`);
            const quadros = [];
            for (const [k, t] of [1.5, p.roteiro[2].em + 1, dur - 1.5].entries()) {
              const f = path.join(dir, `.q${k}.png`);
              rodar(FFMPEG, ['-y', '-ss', String(t), '-i', mp4, '-frames:v', '1', f], `quadro ${p.id}`);
              quadros.push(f);
            }
            await abrirLocal(pagina, simples(`<div style="display:flex;gap:16px;padding:16px;background:#fff">${quadros.map((f) => `<img src="${url(f)}" style="width:350px;height:622px;border:2px solid #CBD7F3">`).join('')}</div>`, 1140), 1140, 656);
            fs.writeFileSync(path.join(dir, 'rascunho-conferencia.png'), await pagina.screenshot({ type: 'png', fullPage: true }));
            quadros.forEach((f) => fs.rmSync(f));
            console.log(`${p.id}: rascunho.mp4 ${saidaDur.toFixed(1)} s, ${(fs.statSync(mp4).size / 1048576).toFixed(1)} MB`);
          } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
          }
        }
        fs.writeFileSync(path.join(dir, 'roteiro.md'), roteiroMd(p));
      } else if (p.formato === 'video-integrante') {
        const destino = path.join(dir, 'capa.png');
        await desenhar(pagina, capaPessoa({ ...p.capa, marcador: PESSOA }, a), { largura: 1080, altura: 1920, destino, rotulo: `${p.id} capa` });
        itens.push({ arquivo: destino, largura: 1080, altura: 1920, legenda: 'capa' });
        fs.writeFileSync(path.join(dir, 'roteiro.md'), roteiroMd(p));
      }
      fs.writeFileSync(path.join(dir, 'legenda.txt'), legendaTxt(p));
      fs.writeFileSync(path.join(dir, 'alt.txt'), altTxt(p));
      fs.writeFileSync(path.join(dir, 'ficha.md'), fichaMd(p));
      arquivosDasPecas[p.id] = itens;
      console.log(`${p.id}: ${itens.length} arte(s)`);
    }

    // ---------------- Prévia do perfil ----------------
    if (fazer(args, 'perfil')) {
      const arq = (id, nome) => path.join(SAIDA, PECAS.find((x) => x.id === id).pasta, nome);
      const celulas = [
        ['P01', 'pagina-1.png', 'carrossel', true],
        ['P02', 'capa.png', 'reel', true],
        ['P03', 'pagina-1.png', 'carrossel', true],
        ['P09', 'capa.png', 'reel', false],
        ['P08', 'capa.png', 'reel', false],
        ['P07', 'pagina-1.png', 'carrossel', false],
        ['P06', 'capa.png', 'reel', false],
        ['P05', 'capa.png', 'reel', false],
        ['P04', 'pagina-1.png', 'carrossel', false],
      ].map(([id, nome, tipo, fixado]) => ({ arquivo: arq(id, nome), tipo, fixado, codigo: id }));
      if (celulas.every((c) => fs.existsSync(c.arquivo))) {
        const destaques = DESTAQUES.map((d, i) => ({ nome: d.nome, depois: d.depois, arquivo: path.join(perfilDir, 'destaques', `capa-${i + 1}-${d.id}.png`) }));
        await abrirLocal(pagina, previaDoPerfil({ perfil: PERFIL, destaques, celulas, avatarArquivo }), 1080, 1400);
        const total = await pagina.evaluate(() => document.documentElement.scrollHeight);
        await pagina.setViewportSize({ width: 1080, height: total });
        await pagina.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode().catch(() => {}))]));
        const foto = await pagina.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1080, height: total } });
        const img = png.decodificar(foto);
        fs.writeFileSync(path.join(perfilDir, 'previa-do-perfil.png'), png.codificar(img, { paleta: false }));
        console.log(`perfil: prévia ${img.largura}x${img.altura}`);
      } else {
        console.log('perfil: a prévia precisa das peças P01 a P09 já geradas (rode sem --so ou inclua as peças)');
      }
    }

    // ---------------- Calendário ----------------
    if (fazer(args, 'calendario')) {
      fs.writeFileSync(path.join(SAIDA, 'calendario.md'), calendarioMd());
      await preparar(pagina, imagemDoCalendario(CALENDARIO), 2480, 1400);
      const total = await pagina.evaluate(() => document.documentElement.scrollHeight);
      await pagina.setViewportSize({ width: 2480, height: total });
      const foto = await pagina.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 2480, height: total } });
      fs.writeFileSync(path.join(SAIDA, 'calendario.png'), png.codificar(png.decodificar(foto), { paleta: false }));
      console.log(`calendário: calendario.md e calendario.png (2480x${total})`);
    }

    // ---------------- Folha de contato ----------------
    if (fazer(args, 'montagem')) {
      const grupos = [];
      const existe = (f) => fs.existsSync(f);
      const perfilItens = [];
      if (existe(avatarArquivo)) perfilItens.push({ arquivo: avatarArquivo, largura: 1080, altura: 1080, legenda: 'avatar' });
      for (const [i, d] of DESTAQUES.entries()) {
        const f = path.join(perfilDir, 'destaques', `capa-${i + 1}-${d.id}.png`);
        if (existe(f)) perfilItens.push({ arquivo: f, largura: 1080, altura: 1920, legenda: d.nome });
      }
      const prev = path.join(perfilDir, 'previa-do-perfil.png');
      if (existe(prev)) {
        const d = png.dimensoes(fs.readFileSync(prev));
        perfilItens.push({ arquivo: prev, largura: d.largura, altura: d.altura, legenda: 'prévia do perfil' });
      }
      if (perfilItens.length) grupos.push({ titulo: 'Perfil: avatar, seis capas de destaque e prévia no celular', itens: perfilItens });
      for (const p of ordem) {
        const dir = path.join(SAIDA, p.pasta);
        const itens = [];
        if (p.paginas) p.paginas.forEach((_, i) => existe(path.join(dir, `pagina-${i + 1}.png`)) && itens.push({ arquivo: path.join(dir, `pagina-${i + 1}.png`), largura: 1080, altura: 1350, legenda: String(i + 1) }));
        else if (existe(path.join(dir, 'capa.png'))) itens.push({ arquivo: path.join(dir, 'capa.png'), largura: 1080, altura: 1920, legenda: 'capa' });
        const conf = path.join(dir, 'rascunho-conferencia.png');
        if (existe(conf)) {
          const d = png.dimensoes(fs.readFileSync(conf));
          itens.push({ arquivo: conf, largura: d.largura, altura: d.altura, legenda: 'rascunho em vídeo (3 quadros)' });
        }
        if (itens.length) grupos.push({ titulo: `${p.id} · ${p.dia ? `D${p.dia} · ` : p.reserva ? 'reserva · ' : ''}${p.nome}`, itens });
      }
      const cal = path.join(SAIDA, 'calendario.png');
      if (existe(cal)) {
        const d = png.dimensoes(fs.readFileSync(cal));
        grupos.push({ titulo: 'Calendário D1 a D30', itens: [{ arquivo: cal, largura: d.largura, altura: d.altura }] });
      }
      await abrirLocal(pagina, folhaDeContato(grupos, { titulo: 'Clarevo no Instagram: folha de contato do primeiro mês' }), 3760, 1400);
      const total = await pagina.evaluate(() => document.documentElement.scrollHeight);
      await pagina.setViewportSize({ width: 3760, height: total });
      const foto = await pagina.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 3760, height: total } });
      fs.writeFileSync(path.join(SAIDA, 'montagem.png'), png.codificar(png.decodificar(foto), { paleta: false }));
      console.log(`montagem.png (3760x${total}), ${grupos.length} grupos`);
    }
  } finally {
    await browser.close();
  }

  if (!args.so) fs.writeFileSync(path.join(SAIDA, 'LEIA-ME.txt'), leiaMe());
  console.log(`pronto: ${SAIDA}`);
}

function leiaMe() {
  const dia = (p) => (p.dia ? `D${p.dia}` : p.reserva ? 'reserva' : 'Stories');
  const ordemPub = [...PECAS].filter((p) => !p.reserva && p.dia).sort((x, y) => x.dia - y.dia || x.id.localeCompare(y.id));
  return `CLAREVO NO INSTAGRAM: PERFIL E PEÇAS DO PRIMEIRO MÊS (D-069)
Gerado por scripts/gerar-instagram.js. Texto e números do Playbook de Redes Sociais v2.2 e do Manual Operacional v2.2 (24/10/2026), conferidos com a ficha de afirmações do app (docs/24_REDES_SOCIAIS.md). Detalhes e regras em docs/25_INSTAGRAM.md.

ESTES ARQUIVOS SÃO RASCUNHOS PARA REVISÃO. A arte final é montada no Canva (editável) e os vídeos no Edits, depois da conferência da equipe. Nada aqui foi publicado.

O QUE É FOTO, PESSOA E TELA
- Quadros "[Foto real: ...]": a equipe escolhe foto própria ou licenciada, com autorização de imagem, e troca no Canva. Nenhum rosto foi gerado e nenhuma foto foi baixada.
- Quadros "[Gravação com integrante real]": gravação da equipe, com a fala revisada pela própria pessoa.
- Telas do app: capturas e gravações reais da demonstração (dados fictícios, etiqueta "Demonstração"), versão da ficha em docs/24. Refazer o teste na versão que for ao ar.

ORDEM DE PUBLICAÇÃO (calendário do Playbook; o detalhe está em calendario.md e calendario.png)
D1 a D4  preparo do perfil: pasta perfil/ (avatar, destaques, nome e bio, prévia)
${ordemPub.map((p) => `${dia(p).padEnd(8)} ${p.id.padEnd(4)} ${p.nome}  (${p.pasta}/)`).join('\n')}
D13 e D20 são posições flexíveis: T01 ou T02 se houver trend adequada, senão P06 ou P09 (as pastas D13-T01 e D20-T02 são as opções de trend).
P12 (dúvida de acesso) fica nos Stories e no destaque Ajuda (pasta stories-e-ajuda-P12-...).
Reserva, fora do calendário (ciclo seguinte ou no lugar de uma peça repetida): pastas reserva-*.

O QUE CADA PASTA CONTÉM
perfil/                avatar-1080.png (ícone C), avatar-conferencia.png (110 px e 44 px), destaques/ (6 capas 1080 x 1920), previa-do-perfil.png, nome-e-bio.txt
D05-P01 e demais       carrosséis: pagina-1.png em diante (1080 x 1350); Reels: capa.png (1080 x 1920), rascunho.mp4 (gravação real com o texto na tela do roteiro), rascunho-conferencia.png, gravacao-limpa.mp4 (para editar no Edits), legendas.srt (narração); vídeos com integrante: capa.png e roteiro.md
em todas as peças      legenda.txt (pronta para colar), alt.txt (texto alternativo), ficha.md (ação principal, o que depende da equipe, conferência das afirmações sobre o app e lista de conferência antes de publicar); Reels e vídeos também têm roteiro.md
calendario.md/.png     D1 a D30: dia, peça, formato, objetivo, ação e o que depende da equipe
montagem.png           folha de contato com todas as páginas e capas, para revisar de uma vez

BLOQUEIOS CONHECIDOS (conferir antes de publicar)
- B01 e o destaque Para empresas: canal comercial conferido, revisão técnica de saúde e NR-1 e a pergunta 35 ao advogado.
- P11 e o destaque Ajuda: canal de ajuda e horário real de atendimento (hoje o e-mail de suporte é marcador).
- P03 e a bio: acesso em preparação (sem data, sem lista de espera, sem preço). Mudam juntos quando o acesso abrir.
- Link da bio (clarevo-site.pages.dev/comece.html): testar no navegador do Instagram; o site ainda é preliminar.
- Identificador e nome de exibição: conferir o limite na conta; o @ só aparece depois de confirmado.
- Todas as peças de produto: responsável pelo produto (a designar) refaz o teste na versão que for ao ar.
`;
}

if (require.main === module) main().catch((e) => {
  console.error(process.env.DEPURAR ? e.stack : e.message || e);
  process.exit(1);
});
