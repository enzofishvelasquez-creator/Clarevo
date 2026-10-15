#!/usr/bin/env node
/**
 * Manual de uso para compartilhar (D-049(4)): gera docs/manual/index.html, um arquivo HTML estático, a partir do catálogo do guia
 * (packages/core/src/guide), a mesma fonte do guia dentro do app e da ajuda "?". Roda no build de documentos, nunca no app.
 *
 * O que sai: capa com o logotipo oficial "clarevo." (docs/marca), sumário, uma seção por entrada do catálogo (para que serve, onde
 * fica, como usar e, nas calculadoras, uma linha para cada uma) e UMA captura de tela existente de docs/telas (390 px, da
 * demonstração fictícia), copiada para docs/manual/img/ e sempre com a faixa "Dados fictícios de demonstração". Estilo para
 * impressão em PDF (A4). Nenhum dado real: as capturas são da demonstração e o texto vem do catálogo.
 *
 * Uso: node scripts/gerar-manual.js [pasta de saída]     (padrão: docs/manual)
 * Rode depois de `npm run test:web` (que refaz as capturas de docs/telas). Falha, sem escrever nada pela metade, se uma captura
 * do catálogo não existir ou se o HTML tiver um caminho de imagem quebrado.
 */
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..');
const TELAS = path.join(ROOT, 'docs', 'telas');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs', 'manual'));

// O catálogo é TypeScript puro (sem React): a leitura transpila cada arquivo do core na hora, só para este script.
Module._extensions['.ts'] = function compileTs(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  module._compile(output.outputText, filename);
};
const core = require(path.join(ROOT, 'packages', 'core', 'src', 'index.ts'));
const { GUIDE_ENTRIES, GUIDE_GROUPS, GUIDE_TEXT, MANUAL_TEXT, guideWhere } = core;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Passo com os nomes de botões e telas entre aspas em destaque: "Salvar gasto" vira um rótulo em negrito, com aspas de verdade. */
const rich = (text) => esc(text).replace(/&quot;([^&]+?)&quot;/g, '<b class="rotulo">&ldquo;$1&rdquo;</b>');

/** O caminho "Movimentos › Organizar › Cartões" com cada nome em negrito e o separador discreto. */
const path_ = (crumbs) => crumbs.map((c) => `<b>${esc(c)}</b>`).join('<span class="sep" aria-hidden="true"> &rsaquo; </span>');

function logo() {
  const file = path.join(ROOT, 'docs', 'marca', 'clarevo-logotipo-reverso.svg');
  return fs.readFileSync(file, 'utf8').trim().replace('<svg ', '<svg class="logo" ');
}

function entrySection(entry) {
  const group = GUIDE_GROUPS.find((g) => g.id === entry.group);
  const also = (entry.alsoWhere ?? []).map((p) => `<li>${path_(p)}</li>`).join('');
  const lines = (entry.lines ?? []).map((l) => `<li><b>${esc(l.title)}</b>: ${esc(l.caption)}</li>`).join('');
  return `
    <section class="entrada" id="${esc(entry.id)}" aria-labelledby="t-${esc(entry.id)}">
      <div class="texto">
        <p class="grupo">${esc(group.title)}</p>
        <h3 id="t-${esc(entry.id)}">${esc(entry.title)}</h3>
        <h4>${esc(GUIDE_TEXT.purposeTitle)}</h4>
        <p>${esc(entry.purpose)}</p>
        <h4>${esc(GUIDE_TEXT.whereTitle)}</h4>
        <p class="onde">${path_(entry.where)}</p>
        ${also ? `<p class="tambem-titulo">${esc(GUIDE_TEXT.alsoTitle)}</p><ul class="tambem">${also}</ul>` : ''}
        <h4>${esc(GUIDE_TEXT.stepsTitle)}</h4>
        <ol class="passos">${entry.steps.map((s) => `<li>${rich(s)}</li>`).join('')}</ol>
        ${lines ? `<h4>${esc(MANUAL_TEXT.linesTitle)}</h4><ul class="linhas">${lines}</ul>` : ''}
      </div>
      <figure class="tela">
        <div class="faixa-demo">${esc(MANUAL_TEXT.demoBand)}</div>
        <img src="img/${esc(entry.screenshot)}" alt="${esc(MANUAL_TEXT.figureAlt(entry.title))}" width="780" height="1688" loading="lazy" />
      </figure>
    </section>`;
}

const CSS = `
  :root {
    --azul: #2457F5; --lima: #D4F05B; --texto: #17223B; --secundario: #4B5873;
    --fundo: #F6F8FC; --cartao: #FFFFFF; --linha: #E3E8F2; --realce: #EAF0FF; --link: #2457F5;
  }
  @media screen and (prefers-color-scheme: dark) {
    :root { --texto: #ECF0FA; --secundario: #AAB5CE; --fundo: #0F1626; --cartao: #17223B; --linha: #2B3856; --realce: #1C2C57; --link: #8FB0FF; }
  }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body { margin: 0; background: var(--fundo); color: var(--texto); font: 17px/1.55 Manrope, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  a { color: var(--link); }
  .pular { position: absolute; left: -999px; top: 0; background: var(--lima); color: #17223B; padding: 8px 12px; border-radius: 8px; }
  .pular:focus { left: 8px; top: 8px; z-index: 5; }
  main, .miolo { max-width: 980px; margin: 0 auto; padding: 0 16px; }
  .capa { background: var(--azul); color: #fff; border-radius: 0 0 28px 28px; padding: 48px 16px 40px; }
  .capa .miolo { display: grid; gap: 20px; }
  .logo { width: min(260px, 70vw); height: auto; display: block; }
  .capa h1 { margin: 0; font-size: clamp(30px, 6vw, 46px); line-height: 1.12; font-weight: 800; }
  .capa p { margin: 0; max-width: 56ch; color: #EEF2FF; font-size: 19px; }
  .faixa-capa, .faixa-demo { background: var(--lima); color: #17223B; font-weight: 800; font-size: 13px; letter-spacing: .01em; }
  .faixa-capa { display: inline-block; justify-self: start; padding: 6px 14px; border-radius: 999px; }
  .intro { padding: 28px 0 8px; }
  .intro p { margin: 0 0 12px; max-width: 70ch; }
  .dica-impressao { color: var(--secundario); font-size: 15px; }
  nav.sumario { padding: 8px 0 8px; }
  nav.sumario h2, main > section > h2 { font-size: 26px; margin: 28px 0 8px; line-height: 1.2; }
  .grupos-sumario { columns: 2 280px; column-gap: 32px; }
  .grupo-sumario { break-inside: avoid; margin: 0 0 16px; }
  .grupo-sumario h3 { margin: 0 0 4px; font-size: 17px; }
  .grupo-sumario ul { margin: 0; padding-left: 20px; }
  .grupo-sumario li { margin: 2px 0; }
  .grupo-titulo { margin-top: 36px; padding-top: 8px; border-top: 3px solid var(--lima); }
  .grupo-titulo p { margin: 0 0 8px; color: var(--secundario); }
  .entrada { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: 28px; align-items: start; background: var(--cartao); border: 1px solid var(--linha); border-radius: 20px; padding: 24px; margin: 20px 0; }
  .entrada h3 { margin: 0 0 8px; font-size: 24px; line-height: 1.2; }
  .entrada h4 { margin: 18px 0 4px; font-size: 14px; letter-spacing: .04em; text-transform: uppercase; color: var(--secundario); }
  .entrada p { margin: 0 0 8px; }
  .grupo { margin: 0 0 2px; font-size: 14px; font-weight: 700; color: var(--secundario); }
  .onde { background: var(--realce); border-radius: 12px; padding: 10px 14px; color: var(--azul); }
  @media screen and (prefers-color-scheme: dark) { .onde { color: var(--link); } }
  .onde b { font-weight: 800; }
  .sep { opacity: .7; }
  .tambem-titulo { margin: 10px 0 2px !important; font-size: 14px; font-weight: 700; color: var(--secundario); }
  .tambem { margin: 0 0 8px; padding: 0; list-style: none; display: grid; gap: 6px; }
  .tambem li { border: 1px solid var(--linha); border-radius: 12px; padding: 6px 12px; font-size: 15px; }
  .passos { margin: 0; padding: 0; list-style: none; counter-reset: passo; display: grid; gap: 10px; }
  .passos li { counter-increment: passo; position: relative; padding-left: 40px; min-height: 28px; }
  .passos li::before { content: counter(passo); position: absolute; left: 0; top: 0; width: 28px; height: 28px; border-radius: 50%; background: var(--realce); color: var(--azul); font-weight: 800; font-size: 14px; display: grid; place-items: center; }
  @media screen and (prefers-color-scheme: dark) { .passos li::before { color: var(--link); } }
  .rotulo { font-weight: 800; }
  .linhas { margin: 0; padding-left: 20px; }
  .linhas li { margin: 4px 0; }
  figure.tela { margin: 0; border: 1px solid var(--linha); border-radius: 22px; overflow: hidden; background: #fff; }
  figure.tela .faixa-demo { padding: 6px 10px; text-align: center; }
  figure.tela img { display: block; width: 100%; height: auto; }
  footer { max-width: 980px; margin: 32px auto 48px; padding: 0 16px; color: var(--secundario); font-size: 14px; }
  @media (max-width: 760px) {
    .entrada { grid-template-columns: 1fr; padding: 18px 16px; }
    figure.tela { width: min(260px, 100%); justify-self: center; }
  }
  @page { size: A4; margin: 14mm 13mm 16mm; }
  @media print {
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    :root { --texto: #17223B; --secundario: #3F4B66; --fundo: #FFFFFF; --cartao: #FFFFFF; --linha: #C9D1E2; --realce: #EAF0FF; --link: #17223B; }
    body { font-size: 10.5pt; line-height: 1.45; background: #fff; color: #17223B; }
    .pular, .dica-impressao { display: none; }
    a { color: inherit; text-decoration: none; }
    main, .miolo { max-width: none; padding: 0; }
    .capa { min-height: 262mm; padding: 40mm 16mm 20mm; border-radius: 0; page-break-after: always; break-after: page; display: flex; align-items: flex-start; }
    .capa h1 { font-size: 38pt; }
    .capa p { font-size: 14pt; }
    .logo { width: 70mm; }
    .intro, nav.sumario { padding-top: 0; }
    nav.sumario { break-after: page; page-break-after: always; }
    nav.sumario h2, main > section > h2 { font-size: 18pt; }
    .grupo-titulo { break-before: page; page-break-before: always; margin-top: 0; break-after: avoid; }
    .entrada { break-inside: avoid; page-break-inside: avoid; grid-template-columns: minmax(0, 1fr) 47mm; gap: 7mm; padding: 4mm 5mm; margin: 4mm 0; border-radius: 4mm; }
    .entrada h3 { font-size: 15pt; }
    .entrada h4 { font-size: 8.5pt; margin-top: 4mm; }
    .passos { gap: 2mm; }
    .passos li { padding-left: 8.5mm; min-height: 6mm; }
    .passos li::before { width: 6mm; height: 6mm; font-size: 8pt; }
    .tambem li { font-size: 9.5pt; padding: 1mm 3mm; }
    figure.tela { border-radius: 5mm; break-inside: avoid; }
    figure.tela .faixa-demo { font-size: 8pt; padding: 1.2mm 2mm; }
    footer { margin: 8mm 0 0; font-size: 9pt; }
  }
`;

function build() {
  const groups = GUIDE_GROUPS.map((group) => ({ group, entries: GUIDE_ENTRIES.filter((e) => e.group === group.id) })).filter((g) => g.entries.length > 0);

  const toc = groups
    .map(
      ({ group, entries }) => `
        <div class="grupo-sumario">
          <h3>${esc(group.title)}</h3>
          <ul>${entries.map((e) => `<li><a href="#${esc(e.id)}">${esc(e.title)}</a></li>`).join('')}</ul>
        </div>`,
    )
    .join('');

  const body = groups
    .map(
      ({ group, entries }) => `
      <section aria-labelledby="g-${esc(group.id)}">
        <div class="grupo-titulo">
          <h2 id="g-${esc(group.id)}">${esc(group.title)}</h2>
          <p>${esc(group.caption)}</p>
        </div>
        ${entries.map(entrySection).join('')}
      </section>`,
    )
    .join('');

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(MANUAL_TEXT.title)}</title>
<meta name="description" content="${esc(MANUAL_TEXT.subtitle)}" />
<style>${CSS}</style>
</head>
<body>
<a class="pular" href="#sumario">Ir para o sumário</a>
<header class="capa">
  <div class="miolo">
    ${logo()}
    <h1>${esc(MANUAL_TEXT.title)}</h1>
    <p>${esc(MANUAL_TEXT.subtitle)}</p>
    <span class="faixa-capa">${esc(MANUAL_TEXT.demoBand)}</span>
  </div>
</header>
<main>
  <div class="intro">
    <p>${esc(MANUAL_TEXT.intro)}</p>
    <p class="dica-impressao">${esc(MANUAL_TEXT.printHint)}</p>
  </div>
  <nav class="sumario" id="sumario" aria-label="${esc(MANUAL_TEXT.tocTitle)}">
    <h2>${esc(MANUAL_TEXT.tocTitle)}</h2>
    <div class="grupos-sumario">${toc}</div>
  </nav>
  ${body}
</main>
<footer>${esc(MANUAL_TEXT.footer)}</footer>
</body>
</html>
`;
}

function main() {
  // Cada captura do catálogo precisa existir: o manual nunca sai com imagem quebrada.
  const shots = [...new Set(GUIDE_ENTRIES.map((e) => e.screenshot))];
  const missing = shots.filter((f) => !fs.existsSync(path.join(TELAS, f)));
  if (missing.length > 0) {
    console.error(`Faltam capturas em docs/telas (rode "npm run test:web" para refazê-las): ${missing.join(', ')}`);
    process.exit(1);
  }
  const html = build();
  // Conferência do próprio resultado: todo caminho de imagem do HTML aponta para uma captura que será copiada.
  const used = [...html.matchAll(/src="img\/([^"]+)"/g)].map((m) => m[1]);
  const broken = used.filter((f) => !shots.includes(f));
  if (broken.length > 0 || used.length !== GUIDE_ENTRIES.length || /undefined|\[object/.test(html)) {
    console.error(`HTML do manual com problema: imagens fora do catálogo ${broken.join(', ') || '(nenhuma)'}, ${used.length} imagens para ${GUIDE_ENTRIES.length} entradas.`);
    process.exit(1);
  }
  const imgDir = path.join(OUT, 'img');
  fs.mkdirSync(imgDir, { recursive: true });
  // Só as capturas usadas ficam em img/ (as que saíram do catálogo são removidas).
  for (const f of fs.readdirSync(imgDir)) if (!shots.includes(f)) fs.rmSync(path.join(imgDir, f));
  for (const f of shots) fs.copyFileSync(path.join(TELAS, f), path.join(imgDir, f));
  fs.writeFileSync(path.join(OUT, 'index.html'), html);
  const rel = path.relative(ROOT, OUT) || '.';
  console.log(`Manual gerado: ${path.join(rel, 'index.html')} (${GUIDE_ENTRIES.length} entradas, ${shots.length} capturas em ${path.join(rel, 'img')}, ${Math.round(html.length / 1024)} KB de HTML).`);
}

main();
