'use strict';
/**
 * O núcleo das calculadoras no navegador (D-066): o MESMO código TypeScript do `packages/core`, transpilado para módulos ES em
 * `site/js/nucleo/`. Uma só fonte de verdade: o site nunca reescreve uma conta, uma faixa de validação nem um texto de resultado.
 *
 * Como funciona, sem pacote novo:
 * 1. parte das entradas (`ENTRADAS`: o catálogo, os campos, a leitura do que se digita, o prefill e as dez calculadoras);
 * 2. transpila cada `.ts` com o `typescript` que já está instalado (`ts.transpileModule`, sem checar tipos, que é o
 *    `npm run typecheck`), sem comentários e como módulo ES (os `import type` somem na transpilação);
 * 3. lê os imports relativos do resultado (pela árvore do compilador), segue cada um e reescreve o caminho para terminar em `.js`
 *    (`'./common'` vira `'./common.js'`; uma pasta vira `'.../index.js'`), porque o navegador não resolve caminho sem extensão;
 * 4. devolve só o fecho de dependências, com o mesmo desenho de pastas do core (`js/nucleo/calculators/…`, `js/nucleo/learn/…`).
 *
 * Cada arquivo começa com uma linha que diz de onde veio. Nada aqui lê o relógio nem o ambiente: rodar duas vezes dá os mesmos bytes.
 */
const fs = require('node:fs');
const path = require('node:path');
const { carregarTypescript, CORE_SRC } = require('./catalogo');

/** Onde o núcleo vai dentro de `site/`. */
const PASTA = 'js/nucleo';

/** As entradas: tudo o que o script da página importa do core. O resto do fecho vem por dependência. */
const ENTRADAS = [
  'calculators/catalog.ts',
  'calculators/fields.ts',
  'calculators/inputs.ts',
  'calculators/links.ts',
  'calculators/antes-de-financiar.ts',
  'calculators/parcelado-ou-a-vista.ts',
  'calculators/custo-por-ano.ts',
  'calculators/custo-da-divida.ts',
  'calculators/quitar-antes.ts',
  'calculators/multa-e-juros.ts',
  'calculators/plano-dividas.ts',
  'calculators/reserva.ts',
  'calculators/juntar-para-objetivo.ts',
  'calculators/dividir-contas.ts',
  'dates.ts',
];

/** O arquivo `.ts` (ou `pasta/index.ts`) a que um import relativo se refere, a partir de um arquivo do core. */
function resolver(de, especificador) {
  const base = path.resolve(path.dirname(de), especificador);
  if (fs.existsSync(`${base}.ts`)) return { arquivo: `${base}.ts`, saida: `${especificador}.js` };
  if (fs.existsSync(path.join(base, 'index.ts'))) return { arquivo: path.join(base, 'index.ts'), saida: `${especificador.replace(/\/$/, '')}/index.js` };
  throw new Error(`nucleo: o import "${especificador}" de ${path.relative(CORE_SRC, de)} não aponta para um arquivo do core`);
}

/** Transpila um arquivo e devolve o texto ES, com os imports relativos já terminando em `.js`, e a lista do que ele importa. */
function transpilar(ts, arquivo) {
  const origem = fs.readFileSync(arquivo, 'utf8');
  const { outputText } = ts.transpileModule(origem, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, removeComments: true },
    fileName: arquivo,
  });
  const fonte = ts.createSourceFile(arquivo, outputText, ts.ScriptTarget.ES2022, true);
  const trocas = [];
  const dependencias = [];
  const ver = (no) => {
    if ((ts.isImportDeclaration(no) || ts.isExportDeclaration(no)) && no.moduleSpecifier && ts.isStringLiteral(no.moduleSpecifier)) {
      const especificador = no.moduleSpecifier.text;
      if (especificador.startsWith('.')) {
        const alvo = resolver(arquivo, especificador);
        dependencias.push(alvo.arquivo);
        trocas.push({ ini: no.moduleSpecifier.getStart(fonte), fim: no.moduleSpecifier.getEnd(), texto: `'${alvo.saida}'` });
      } else throw new Error(`nucleo: ${path.relative(CORE_SRC, arquivo)} importa "${especificador}", que não é do core (o navegador não resolve pacotes)`);
    }
    ts.forEachChild(no, ver);
  };
  ver(fonte);
  let saida = outputText;
  for (const t of trocas.sort((a, b) => b.ini - a.ini)) saida = saida.slice(0, t.ini) + t.texto + saida.slice(t.fim);
  return { saida, dependencias };
}

let guardado = null;

/**
 * O núcleo: `Map` de caminho em `site/` (`js/nucleo/calculators/catalog.js`) para o texto do módulo. Guardado em memória: o gerador
 * e os testes pedem várias vezes.
 */
function nucleo() {
  if (guardado) return guardado;
  const ts = carregarTypescript();
  const feitos = new Map();
  const fila = ENTRADAS.map((e) => path.join(CORE_SRC, e));
  while (fila.length > 0) {
    const arquivo = fila.shift();
    if (feitos.has(arquivo)) continue;
    const { saida, dependencias } = transpilar(ts, arquivo);
    feitos.set(arquivo, saida);
    fila.push(...dependencias);
  }
  const arquivos = new Map();
  for (const [arquivo, texto] of [...feitos].sort((a, b) => a[0].localeCompare(b[0]))) {
    const relativo = path.relative(CORE_SRC, arquivo).split(path.sep).join('/');
    arquivos.set(`${PASTA}/${relativo.replace(/\.ts$/, '.js')}`, `// Gerado por scripts/gerar-site.js a partir de packages/core/src/${relativo}. Não edite: rode "node scripts/gerar-site.js".\n${texto}`);
  }
  guardado = arquivos;
  return arquivos;
}

module.exports = { nucleo, ENTRADAS, PASTA };
