/**
 * Gera os subconjuntos Latin da Manrope que o app carrega (D-063 item 2, `docs/19` seção 10).
 *
 * Por quê: os cinco pesos do pacote `@expo-google-fonts/manrope` têm 97 KB cada (678 glifos, de vários alfabetos), e o app só usa
 * português do Brasil. O subconjunto tem as letras de A a Z com acento e cedilha, os ordinais, os algarismos, "R$", a pontuação, as
 * aspas e os poucos símbolos que as telas escrevem. As fontes ficam em `apps/app/assets/fonts/`, vão no repositório e o `useFonts` de
 * `apps/app/src/app/_layout.tsx` carrega delas (o pacote continua instalado, só que sem ser importado).
 *
 * Uso:  node scripts/gerar-fontes.js           (gera os cinco arquivos e mostra o tamanho de cada um)
 *       node scripts/gerar-fontes.js --verificar  (não grava nada: confere que os arquivos do repositório saem iguais)
 * Precisa de `pyftsubset` (fonttools: `pip install fonttools`). `PYFTSUBSET=/caminho/pyftsubset` troca o programa.
 *
 * O que entra (conjunto fechado: um caractere novo nos textos pede uma linha aqui e `node scripts/gerar-fontes.js`):
 *   U+0020-007E  Latin básico (algarismos, letras, "R$", pontuação, aspas retas)
 *   U+00A0-00FF  Latin-1: espaço que não quebra, letras com acento, cedilha, ordinais (ª º), "·", "§", "×", "÷", "°", "©"
 *   U+2018, U+2019, U+201C, U+201D  aspas curvas
 *   U+2022 "•", U+2026 "…", U+2039 "‹", U+203A "›"
 *   U+2192 "→", U+2212 "−" (sinal de menos), U+2248 "≈"
 * Fora de propósito: travessões (U+2013 e U+2014: os textos do produto não usam), outros alfabetos e as ligações de Latin estendido.
 * Texto que a pessoa digita com um caractere fora do conjunto (por exemplo "ő") aparece na fonte do sistema, sem erro.
 * O teste `packages/core/test/fontes.test.ts` confere que todo caractere escrito nos textos do core e do app está nos cinco arquivos.
 *
 * Os recursos de layout ficam todos (`--layout-features=*`): o app usa números de largura fixa (`tnum`) e o pareamento (`kern`).
 * Os nomes (inclusive o aviso da licença OFL, ids 0, 13 e 14) ficam; o texto da licença vai junto, em `OFL.txt`.
 */
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PACKAGE = path.join(ROOT, 'node_modules', '@expo-google-fonts', 'manrope');
const OUT = path.join(ROOT, 'apps', 'app', 'assets', 'fonts');
/** Os cinco pesos que `apps/app/src/theme/tokens.ts` usa (`fonts`), na ordem de peso. */
const WEIGHTS = ['400Regular', '500Medium', '600SemiBold', '700Bold', '800ExtraBold'];
const UNICODES = ['U+0020-007E', 'U+00A0-00FF', 'U+2018', 'U+2019', 'U+201C', 'U+201D', 'U+2022', 'U+2026', 'U+2039', 'U+203A', 'U+2192', 'U+2212', 'U+2248'];

function subset(source, target) {
  const args = [source, `--unicodes=${UNICODES.join(',')}`, '--layout-features=*', '--name-IDs=*', `--output-file=${target}`];
  const program = process.env.PYFTSUBSET || 'pyftsubset';
  let r = spawnSync(program, args, { encoding: 'utf8' });
  if (r.error && r.error.code === 'ENOENT') r = spawnSync('python3', ['-m', 'fontTools.subset', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`pyftsubset falhou para ${path.basename(source)}: ${r.error ? r.error.message : r.stderr || r.stdout}`);
}

const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const verify = process.argv.includes('--verificar');
const work = verify ? fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'clarevo-fontes-')) : OUT;
if (!verify) fs.mkdirSync(OUT, { recursive: true });

let before = 0;
let after = 0;
let different = 0;
for (const w of WEIGHTS) {
  const name = `Manrope_${w}.ttf`;
  const source = path.join(PACKAGE, w, name);
  const target = path.join(work, name);
  subset(source, target);
  const b = fs.statSync(source).size;
  const a = fs.statSync(target).size;
  before += b;
  after += a;
  if (verify && (!fs.existsSync(path.join(OUT, name)) || sha(path.join(OUT, name)) !== sha(target))) different++;
  console.log(`${name.padEnd(28)} ${String(b).padStart(7)} B -> ${String(a).padStart(6)} B (${((100 * a) / b).toFixed(1)}%)`);
}
console.log(`${'Total'.padEnd(28)} ${String(before).padStart(7)} B -> ${String(after).padStart(6)} B (${((100 * after) / before).toFixed(1)}%), ${before - after} B a menos`);
if (verify) {
  fs.rmSync(work, { recursive: true, force: true });
  if (different > 0) {
    console.error(`${different} arquivo(s) de apps/app/assets/fonts diferem do que o script gera: rode node scripts/gerar-fontes.js`);
    process.exit(1);
  }
  console.log('Os arquivos de apps/app/assets/fonts saem iguais ao que o script gera.');
} else {
  fs.copyFileSync(path.join(PACKAGE, 'LICENSE_FONT'), path.join(OUT, 'OFL.txt'));
}
