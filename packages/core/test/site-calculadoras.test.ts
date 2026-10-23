/// <reference types="node" />
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as core from '../src/calculators';
import { CALCULATORS, CALC_GROUPS, CALC_UI_TEXT, calcErrorText, calcFields, calcPrefill, calcTitle, type CalcErrorCode, type CalcSlug } from '../src/calculators';
import { publishedTopics, topicCalculator } from '../src/learn';

/**
 * Calculadoras no site (D-066, `docs/22_SITE.md`, seção 8.1). A conta do navegador é o MESMO código do `packages/core`, transpilado por
 * `scripts/site/nucleo.js` para `site/js/nucleo/`. O teste confere que o núcleo é completo e sem nada de fora; que, para entradas de
 * exemplo de cada calculadora, os módulos gerados (importados no Node, num processo à parte, como o navegador os importa) devolvem
 * exatamente o que o core devolve, e os erros e os textos também; que cada página tem o que o app tem (título, campos, aviso, exemplo
 * calculado e ligação com Aprender); e que o script da página não envia nem guarda nada. O teste de navegador está em
 * `scripts/e2e-site.js` (`npm run test:site`).
 */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SITE = join(ROOT, 'site');
const require = createRequire(import.meta.url);
const gerador = require(join(ROOT, 'scripts', 'gerar-site.js')) as { gerarSite: (o?: Record<string, unknown>) => { arquivos: Map<string, string | Buffer> } };
const { nucleo, fechoDe, ENTRADAS } = require(join(ROOT, 'scripts', 'site', 'nucleo.js')) as { nucleo: () => Map<string, string>; fechoDe: (raizes: string[]) => string[]; ENTRADAS: string[] };
const { exemploDa, EXEMPLOS, precargaDaCalculadora } = require(join(ROOT, 'scripts', 'site', 'paginas', 'calculadoras.js')) as {
  precargaDaCalculadora: (slug: string) => string[];
  exemploDa: (slug: string) => { linhas: { rotulo?: string; valor?: string; texto?: string }[]; resultado: { resultLines: string[]; hypotheses: string[]; notes: string[] } };
  EXEMPLOS: Record<string, unknown>;
};

const texto = (v: string | Buffer | undefined): string => (typeof v === 'string' ? v : v ? v.toString('utf8') : '');
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const HOJE = '2026-10-23';
const gerado = gerador.gerarSite();
const pagina = (nome: string) => texto(gerado.arquivos.get(nome));

type Consulta =
  | { tipo: 'calculo'; modulo: string; funcao: string; args: unknown[] }
  | { tipo: 'campos'; slug: CalcSlug; modo?: string }
  | { tipo: 'erro'; slug: CalcSlug; campo: string; codigo: CalcErrorCode }
  | { tipo: 'prefill'; slug: string; params: Record<string, string> }
  | { tipo: 'catalogo' };
const CODIGOS: CalcErrorCode[] = ['vazio', 'invalido', 'casas_demais', 'fora_da_faixa', 'zero', 'acima_do_limite', 'longo', 'resultado_alto'];

describe('site público: núcleo das calculadoras (o código do core no navegador)', () => {
  const arquivos = nucleo();

  it('tem as entradas e só o fecho de dependências delas, em módulos ES que o navegador resolve', () => {
    for (const e of ENTRADAS) expect(arquivos.has(`js/nucleo/${e.replace(/\.ts$/, '.js')}`), e).toBe(true);
    expect(arquivos.size).toBeGreaterThan(ENTRADAS.length);
    expect(arquivos.size).toBeLessThan(40);
    for (const [nome, fonte] of arquivos) {
      expect(nome, nome).toMatch(/^js\/nucleo\/.+\.js$/);
      expect(fonte.split('\n')[0], nome).toMatch(/^\/\/ Gerado por scripts\/gerar-site\.js a partir de packages\/core\/src\/.+\.ts\. Não edite/);
      // Todo import e re-export é relativo, termina em .js e aponta para um arquivo do próprio núcleo.
      for (const m of fonte.matchAll(/(?:import|export)\s[^;]*?from\s*'([^']+)'/g)) {
        expect(m[1], `${nome}: ${m[0]}`).toMatch(/^\.\.?\/.*\.js$/);
        const destino = join(dirname(`/${nome}`), m[1]!).replace(/^\//, '');
        expect(arquivos.has(destino), `${nome} importa ${m[1]}, que não está no núcleo`).toBe(true);
      }
      expect(fonte, nome).not.toMatch(/\bimport\s*\(|\brequire\s*\(|\bprocess\.|\bBuffer\b|node:/);
      expect(fonte, `${nome}: travessão`).not.toMatch(/[–—]/);
      expect(fonte, `${nome}: expressão proibida`).not.toMatch(/faz\w*\s+sentido/i);
      // Sem TypeScript sobrando: nada de tipo nem de comentário do core.
      expect(fonte, nome).not.toMatch(/^\s*(export\s+)?(interface|type)\s+\w+/m);
    }
  });

  it('os arquivos do núcleo e o script da página fazem parte do site gerado, e gerar duas vezes dá os mesmos bytes', () => {
    for (const [nome, fonte] of arquivos) expect(gerado.arquivos.get(nome), nome).toBe(fonte);
    const segunda = gerador.gerarSite();
    for (const [nome] of arquivos) expect(segunda.arquivos.get(nome), nome).toBe(gerado.arquivos.get(nome));
    // Os scripts das calculadoras (o que inicia a página, as peças comuns e uma definição por calculadora) saem de site-src sem mudança.
    const scripts = ['calculadora.js', 'base.js', ...CALCULATORS.map((c) => `definicoes/${c.slug}.js`)];
    for (const arq of scripts) {
      expect(gerado.arquivos.get(`calculadoras/${arq}`), arq).toBe(readFileSync(join(ROOT, 'site-src', 'calculadoras', arq), 'utf8'));
      expect(readFileSync(join(SITE, 'calculadoras', arq), 'utf8'), `site/calculadoras/${arq} está desatualizado: rode node scripts/gerar-site.js`).toBe(gerado.arquivos.get(`calculadoras/${arq}`));
    }
    expect([...gerado.arquivos.keys()].filter((k) => /^calculadoras\/.+\.js$/.test(k)).sort()).toEqual(scripts.map((a) => `calculadoras/${a}`).sort());
    for (const [nome, fonte] of arquivos) expect(readFileSync(join(SITE, nome), 'utf8'), `site/${nome} está desatualizado: rode node scripts/gerar-site.js`).toBe(fonte);
  });

  /** Entradas de exemplo de cada calculadora: o que dá resultado e o que dá erro de cada tipo. */
  const CASOS: { modulo: string; funcao: string; args: unknown[] }[] = [
    { modulo: 'antes-de-financiar', funcao: 'calcAntesDeFinanciar', args: [{ preco: '50.000,00', entrada: '10.000,00', parcelas: '48', taxaMes: '1,99', primeiraEmUmMes: true, renda: '4.500,00', guardar: '', rendimento: '' }, HOJE] },
    { modulo: 'antes-de-financiar', funcao: 'calcAntesDeFinanciar', args: [{ preco: '1.000', entrada: '', parcelas: '1', taxaMes: '0', primeiraEmUmMes: false, renda: '', guardar: '200', rendimento: '6' }, HOJE] },
    { modulo: 'antes-de-financiar', funcao: 'calcAntesDeFinanciar', args: [{ preco: '1.000', entrada: '1.000', parcelas: '12', taxaMes: '2', primeiraEmUmMes: true }] },
    { modulo: 'antes-de-financiar', funcao: 'calcAntesDeFinanciar', args: [{ preco: 'abc', entrada: '2000', parcelas: '0', taxaMes: '1,999', renda: '-1' }] },
    { modulo: 'parcelado-ou-a-vista', funcao: 'calcParceladoOuAVista', args: [{ modo: 'compra', aVista: '1.080,00', parcelas: '12', parcela: '120,00', primeiraNaCompra: false, formaPagamento: 'boleto' }] },
    { modulo: 'parcelado-ou-a-vista', funcao: 'calcParceladoOuAVista', args: [{ modo: 'compra', aVista: '1.080,00', parcelas: '12', parcela: '120,00', primeiraNaCompra: true, formaPagamento: 'cartao' }] },
    { modulo: 'parcelado-ou-a-vista', funcao: 'calcParceladoOuAVista', args: [{ modo: 'cota-unica', aVista: '2.400,00', parcelas: '4', parcela: '650,00', primeiraNaCompra: true, formaPagamento: null }] },
    { modulo: 'parcelado-ou-a-vista', funcao: 'calcParceladoOuAVista', args: [{ modo: 'compra', aVista: '', parcelas: '1', parcela: '0', primeiraNaCompra: false, formaPagamento: null }] },
    { modulo: 'custo-por-ano', funcao: 'calcCustoPorAno', args: [{ valor: '39,90', frequencia: 'mes' }] },
    { modulo: 'custo-por-ano', funcao: 'calcCustoPorAno', args: [{ valor: '12', frequencia: 'dia_util' }] },
    { modulo: 'custo-por-ano', funcao: 'calcCustoPorAno', args: [{ valor: '', frequencia: null }] },
    { modulo: 'custo-da-divida', funcao: 'calcCustoDaDivida', args: [{ tipo: 'rotativo', valor: '1.000,00', taxaMes: '8', parcelarTaxaMes: '8', parcelarParcelas: '6' }] },
    { modulo: 'custo-da-divida', funcao: 'calcCustoDaDivida', args: [{ tipo: 'cheque_especial', valor: '500', taxaMes: '9', meses: '3' }] },
    { modulo: 'custo-da-divida', funcao: 'calcCustoDaDivida', args: [{ tipo: 'emprestimo', valor: '1.000,00', taxaMes: '2,5', parcelas: '12' }] },
    { modulo: 'custo-da-divida', funcao: 'calcCustoDaDivida', args: [{ tipo: null, valor: '', taxaMes: '100' }] },
    { modulo: 'quitar-antes', funcao: 'calcQuitarAntes', args: [{ parcela: '850,00', restantes: '24', taxaMes: '1,5', modo: 'tudo' }] },
    { modulo: 'quitar-antes', funcao: 'calcQuitarAntes', args: [{ parcela: '850,00', restantes: '24', taxaMes: '1,5', modo: 'ultimas', quantas: '6' }] },
    { modulo: 'quitar-antes', funcao: 'calcQuitarAntes', args: [{ parcela: '850,00', restantes: '24', taxaMes: '1,5', modo: 'ultimas', quantas: '30' }] },
    { modulo: 'multa-e-juros', funcao: 'calcMultaEJuros', args: [{ valor: '200,00', multaPct: '2', jurosMesPct: '1', dias: '15' }] },
    { modulo: 'multa-e-juros', funcao: 'calcMultaEJuros', args: [{ valor: '0', multaPct: '21', jurosMesPct: '1,234', dias: '4000' }] },
    {
      modulo: 'plano-dividas',
      funcao: 'calcPlanoDividas',
      args: [
        {
          dividas: [
            { tipo: 'parcelada', apelido: 'Financiamento', parcela: '850,00', restantes: '24', taxaParcelada: '1,5' },
            { tipo: 'saldo', apelido: 'Cartão', saldo: '1.000,00', taxaSaldo: '8', pagamento: '200,00' },
          ],
          extra: '200,00',
        },
        HOJE,
      ],
    },
    { modulo: 'plano-dividas', funcao: 'calcPlanoDividas', args: [{ dividas: [{ tipo: 'saldo', saldo: '1.000', taxaSaldo: '8', pagamento: '50' }], extra: '' }] },
    { modulo: 'plano-dividas', funcao: 'calcPlanoDividas', args: [{ dividas: [{ tipo: null }, { tipo: 'parcelada', parcela: '', restantes: '0' }], extra: 'x' }] },
    { modulo: 'plano-dividas', funcao: 'calcPlanoDividas', args: [{ dividas: [], extra: '' }] },
    { modulo: 'reserva', funcao: 'calcReserva', args: [{ essenciais: '3.750,00', meses: '6', guardado: '4.500,00', mensal: '500,00' }] },
    { modulo: 'reserva', funcao: 'calcReserva', args: [{ essenciais: '3.750,00', meses: '12' }] },
    { modulo: 'reserva', funcao: 'calcReserva', args: [{ essenciais: '', meses: '25' }] },
    { modulo: 'juntar-para-objetivo', funcao: 'calcJuntarParaObjetivo', args: [{ alvo: '22.500,00', jaTem: '4.500,00', modo: 'prazo', meses: '18' }] },
    { modulo: 'juntar-para-objetivo', funcao: 'calcJuntarParaObjetivo', args: [{ alvo: '22.500,00', jaTem: '4.500,00', modo: 'mensal', mensal: '1.000,00' }] },
    { modulo: 'juntar-para-objetivo', funcao: 'calcJuntarParaObjetivo', args: [{ alvo: '1.000', jaTem: '2.000', modo: 'prazo', meses: '12' }] },
    { modulo: 'juntar-para-objetivo', funcao: 'calcJuntarParaObjetivo', args: [{ alvo: '', modo: null }] },
    { modulo: 'dividir-contas', funcao: 'calcDividirContas', args: [{ total: '3.000,00', modo: 'iguais', pessoas: [{}, {}, { apelido: 'Terceira' }] }] },
    { modulo: 'dividir-contas', funcao: 'calcDividirContas', args: [{ total: '3.000,00', modo: 'renda', pessoas: [{ renda: '4.000,00' }, { renda: '2.000,00' }] }] },
    { modulo: 'dividir-contas', funcao: 'calcDividirContas', args: [{ total: '10,00', modo: 'renda', pessoas: [{ apelido: 'um nome muito comprido para o campo', renda: '' }] }] },
  ];

  it('para cada calculadora, os módulos gerados (importados no Node, como o navegador os importa) dão exatamente o mesmo resultado, os mesmos erros e os mesmos textos que o core', () => {
    const dir = mkdtempSync(join(tmpdir(), 'clarevo-nucleo-'));
    try {
      for (const [nome, fonte] of arquivos) {
        mkdirSync(dirname(join(dir, nome)), { recursive: true });
        writeFileSync(join(dir, nome), fonte);
      }
      writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
      const consultas: Consulta[] = [
        ...CASOS.map((c): Consulta => ({ ...c, tipo: 'calculo' })),
        ...CALCULATORS.flatMap((c) => [undefined, 'cota-unica'].map((modo): Consulta => ({ tipo: 'campos', slug: c.slug, modo }))),
        ...CALCULATORS.flatMap((c) =>
          Object.keys(calcFields(c.slug)).flatMap((campo) =>
            CODIGOS.map((codigo): Consulta => ({ tipo: 'erro', slug: c.slug, campo, codigo })),
          ),
        ),
        ...(
          [
            ['custo-da-divida', { modo: 'emprestimo', valor: '100000', parcelas: '12', origem: 'serie' }],
            ['parcelado-ou-a-vista', { modo: 'cota-unica', avista: '240000', parcela: '65000', parcelas: '4' }],
            ['quitar-antes', { parcela: '85000', parcelas: '24', modo: 'ultimas', prazos: '30,60' }],
            ['reserva', { valor: 'x' }],
            ['desconhecida', { modo: 'x' }],
          ] as [string, Record<string, string>][]
        ).map(([slug, params]): Consulta => ({ tipo: 'prefill', slug, params })),
        { tipo: 'catalogo' },
      ];
      writeFileSync(join(dir, 'consultas.json'), JSON.stringify(consultas));
      writeFileSync(
        join(dir, 'rodar.mjs'),
        `import { readFileSync } from 'node:fs';
const consultas = JSON.parse(readFileSync(new URL('./consultas.json', import.meta.url)));
const catalogo = await import('./js/nucleo/calculators/catalog.js');
const campos = await import('./js/nucleo/calculators/fields.js');
const links = await import('./js/nucleo/calculators/links.js');
const saidas = [];
for (const c of consultas) {
  if (c.tipo === 'calculo') saidas.push((await import('./js/nucleo/calculators/' + c.modulo + '.js'))[c.funcao](...c.args));
  else if (c.tipo === 'campos') saidas.push(campos.calcFields(c.slug, c.modo));
  else if (c.tipo === 'erro') saidas.push(campos.calcErrorText(c.slug, c.campo, c.codigo));
  else if (c.tipo === 'prefill') saidas.push(links.calcPrefill(c.slug, c.params));
  else saidas.push({ grupos: catalogo.CALC_GROUPS, lista: catalogo.CALCULATORS, ui: catalogo.CALC_UI_TEXT, titulo: catalogo.calcTitle('parcelado-ou-a-vista', 'cota-unica') });
}
process.stdout.write(JSON.stringify(saidas));
`,
      );
      const r = spawnSync(process.execPath, [join(dir, 'rodar.mjs')], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      expect(r.status, r.stderr).toBe(0);
      const doNucleo = JSON.parse(r.stdout) as unknown[];
      expect(doNucleo.length).toBe(consultas.length);
      const doCore = consultas.map((c) => {
        switch (c.tipo) {
          case 'calculo':
            return (core as unknown as Record<string, (...a: unknown[]) => unknown>)[c.funcao]!(...c.args);
          case 'campos':
            return calcFields(c.slug, c.modo);
          case 'erro':
            return calcErrorText(c.slug, c.campo, c.codigo);
          case 'prefill':
            return calcPrefill(c.slug, c.params);
          default:
            return { grupos: CALC_GROUPS, lista: CALCULATORS, ui: CALC_UI_TEXT, titulo: calcTitle('parcelado-ou-a-vista', 'cota-unica') };
        }
      });
      // O JSON de um lado e do outro: `undefined` some nos dois.
      consultas.forEach((c, i) => expect(doNucleo[i], `${c.tipo} ${JSON.stringify(c).slice(0, 140)}`).toEqual(JSON.parse(JSON.stringify(doCore[i]))));
      // Os casos de exemplo cobrem resultado e erro de cada uma das dez.
      for (const c of CALCULATORS) {
        const deles = CASOS.map((x, i) => ({ x, saida: doNucleo[i] as { ok: boolean } })).filter((y) => y.x.modulo === c.slug);
        expect(deles.some((y) => y.saida.ok), `${c.slug}: nenhum caso calcula`).toBe(true);
        expect(deles.some((y) => !y.saida.ok), `${c.slug}: nenhum caso dá erro`).toBe(true);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});

describe('site público: páginas das calculadoras', () => {
  it('o índice tem os três grupos do app, com as dez calculadoras na ordem, o título e o subtítulo do catálogo', () => {
    const h = pagina('calculadoras/index.html');
    expect(h).toContain('<h1>Calculadoras</h1>');
    expect(h).toContain(esc(CALC_UI_TEXT.intro.replace('Nada é gravado.', 'Tudo acontece no seu navegador: nada é enviado, gravado nem guardado.')));
    expect(h).toContain(esc(CALC_UI_TEXT.disclaimer));
    let ultimo = -1;
    for (const g of CALC_GROUPS) {
      const i = h.indexOf(`<h2 id="${g.id}">${esc(g.title)}</h2>`);
      expect(i, g.title).toBeGreaterThan(ultimo);
      ultimo = i;
    }
    expect(CALCULATORS.length).toBe(10);
    let posicao = 0;
    for (const c of CALCULATORS) {
      const trecho = `<a class="cartao" href="${c.slug}.html"><span class="titulo-cartao">${esc(c.title)}</span><span class="tema-sub">${esc(c.subtitle)}</span></a>`;
      const i = h.indexOf(trecho);
      expect(i, c.slug).toBeGreaterThan(posicao);
      posicao = i;
    }
  });

  for (const c of CALCULATORS) {
    it(`${c.slug}: título, grupo, aviso, campos sem JavaScript, exemplo calculado pelo core e ligação com Aprender`, () => {
      const h = pagina(`calculadoras/${c.slug}.html`);
      expect(h).toContain(`<title>${esc(c.title)} · Clarevo</title>`);
      expect(h).toContain(`<h1>${esc(c.title)}</h1>`);
      expect(h).toContain(esc(c.subtitle));
      expect(h).toContain(`<p class="migalha"><a href="index.html">Calculadoras</a> · ${esc(CALC_GROUPS.find((g) => g.id === c.group)!.title)}</p>`);
      // O aviso do app, mais a frase sobre estimativa; o ponto de montagem do script e o módulo, que é do próprio site.
      expect(h).toContain(esc(CALC_UI_TEXT.disclaimer));
      expect(h).toContain('não garantem resultado');
      expect(h).toContain(`<div class="calc" data-calculadora="${c.slug}">`);
      expect(h).toContain('<script type="module" src="calculadora.js"></script>');
      // Sem JavaScript: o aviso, o link para a versão web e cada campo da calculadora (rótulo e dica do core).
      const sem = /<noscript>([\s\S]*?)<\/noscript>/.exec(h)?.[1] ?? '';
      expect(sem).toContain('precisa de JavaScript');
      expect(sem).toContain('versão web');
      const ignorados = c.slug === 'plano-dividas' ? ['dividas'] : c.slug === 'dividir-contas' ? ['pessoas'] : [];
      for (const [chave, spec] of Object.entries(calcFields(c.slug))) {
        if (ignorados.includes(chave)) continue;
        expect(sem, `${c.slug}.${chave}`).toContain(`<strong>${esc(spec.label)}.</strong>`);
        if (spec.hint) expect(sem, `${c.slug}.${chave} dica`).toContain(esc(spec.hint));
      }
      // O exemplo é calculado na geração pelo core: cada linha do resultado e cada hipótese estão na página.
      const ex = exemploDa(c.slug);
      expect(ex.resultado.resultLines.length).toBeGreaterThan(0);
      for (const l of ex.resultado.resultLines) expect(h, 'resultado do exemplo').toContain(`<li>${esc(l)}</li>`);
      for (const l of ex.resultado.hypotheses) expect(h, 'hipótese do exemplo').toContain(`<li>${esc(l)}</li>`);
      for (const l of ex.resultado.notes) expect(h, 'aviso do exemplo').toContain(esc(l));
      expect(h).toContain('Um exemplo, com números fictícios');
      // Os temas de Aprender do catálogo que apontam para esta calculadora.
      const temas = publishedTopics().filter((t) => !t.legacy && ['organizar', 'juros', 'tempo'].includes(t.section) && topicCalculator(t.slug)?.slug === c.slug);
      for (const t of temas) expect(h, `tema ${t.slug}`).toContain(`href="../aprender/${t.slug}.html"`);
      // Nada que mande ou guarde: a página só tem o módulo e os dados estruturados como script.
      expect(h).not.toMatch(/<form\b|<iframe\b/i);
    });
  }

  it('os exemplos usam números fictícios e a função do core de cada calculadora', () => {
    expect(Object.keys(EXEMPLOS).sort()).toEqual(CALCULATORS.map((c) => c.slug).sort());
    for (const c of CALCULATORS) {
      const ex = exemploDa(c.slug);
      expect(ex.linhas.length, c.slug).toBeGreaterThan(0);
    }
  });

  it('cada tema de Aprender que tem calculadora no catálogo liga para a página dela, com o mesmo modo do app; os outros não ligam', () => {
    let com = 0;
    for (const t of publishedTopics().filter((x) => !x.legacy && ['organizar', 'juros', 'tempo'].includes(x.section))) {
      const h = pagina(`aprender/${t.slug}.html`);
      const l = topicCalculator(t.slug);
      if (l) {
        com++;
        const modo = (l.params as Record<string, string>).modo;
        const no = /<p class="no-app">([\s\S]*?)<\/p>/.exec(h)?.[1] ?? '';
        expect(no, t.slug).toContain(`<a href="../calculadoras/${l.slug}.html${modo ? `?modo=${encodeURIComponent(modo)}` : ''}">${esc(calcTitle(l.slug, modo))}</a>`);
        expect(no, t.slug).toContain('sem enviar nada');
      } else expect(h, t.slug).not.toContain('class="no-app"');
    }
    expect(com).toBeGreaterThanOrEqual(8);
    // O parâmetro é só `modo`, o mesmo que o app usa.
    for (const m of Object.values(Object.fromEntries(gerado.arquivos)).map(texto).join('\n').matchAll(/\.\.\/calculadoras\/[a-z-]+\.html\?([^"]+)"/g)) expect(m[1]).toMatch(/^modo=[a-z_-]+$/);
  });

  it('"Calculadoras" está no menu principal, no rodapé, no índice e no início de Aprender, na página inicial e na 404', () => {
    for (const [nome, h] of [...gerado.arquivos].filter(([n]) => n.endsWith('.html')).map(([n, v]) => [n, texto(v)] as const)) {
      expect(h, `${nome}: menu`).toMatch(/<ul class="menu-lista">.*<li><a href="[^"]*index\.html"[^>]*>Calculadoras<\/a><\/li>/);
      expect(h, `${nome}: rodapé`).toMatch(/<footer class="rodape">[\s\S]*<a href="[^"]*index\.html">Calculadoras<\/a>/);
    }
    expect(pagina('aprender/index.html')).toContain(`href="../calculadoras/index.html"><span class="titulo-cartao">${esc(CALC_UI_TEXT.learnCardTitle)}</span>`);
    expect(pagina('aprender/index.html')).toContain('>Calculadoras</a>');
    expect(pagina('index.html')).toContain('<span class="titulo-cartao">Calculadoras</span>');
    expect(pagina('404.html')).toContain('href="/calculadoras/index.html">Calculadoras</a>');
  });

  it('os scripts das calculadoras só montam a tela: nada de envio, armazenamento, cookie, HTML solto nem escrita na URL', () => {
    const nomes = ['calculadora.js', 'base.js', ...CALCULATORS.map((c) => `definicoes/${c.slug}.js`)];
    for (const arq of nomes) {
      const js = readFileSync(join(ROOT, 'site-src', 'calculadoras', arq), 'utf8');
      expect(js, arq).not.toMatch(/https?:|\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|localStorage|sessionStorage|indexedDB|document\.cookie|eval\s*\(|new Function|innerHTML|outerHTML|insertAdjacentHTML|document\.write|history\.|location\.(href|search|hash|assign|replace)\s*=/);
      // Todo import é do núcleo gerado ou de outro script das calculadoras (nunca de fora).
      for (const m of js.matchAll(/from '([^']+)'/g)) expect(m[1], `${arq}: ${m[0]}`).toMatch(/^(\.\.?\/js\/nucleo\/.+\.js|\.\.\/\.\.\/js\/nucleo\/.+\.js|\.\/base\.js|\.\.\/base\.js)$/);
      for (const m of js.matchAll(/\bimport\('([^']+)'\)/g)) expect(m[1], `${arq}: ${m[0]}`).toMatch(/^(\.\.\/js\/nucleo\/.+\.js|\.\/definicoes\/[a-z-]+\.js)$/);
      // Nenhum import() com caminho montado na hora (o modulepreload e a política de segurança precisam saber o que carrega).
      expect(js, arq).not.toMatch(/\bimport\s*\(\s*[^'\s)]/);
      expect(js, arq).not.toMatch(/[–—]/);
      expect(js, arq).not.toMatch(/faz\w*\s+sentido/i);
    }
    // O único parâmetro de endereço lido é "modo".
    const todos = nomes.map((a) => readFileSync(join(ROOT, 'site-src', 'calculadoras', a), 'utf8')).join('\n');
    expect([...todos.matchAll(/\.get\('([a-z]+)'\)/g)].map((m) => m[1])).toEqual(['modo']);
  });

  it('o _headers permite os módulos do próprio site e nada de fora', () => {
    const h = pagina('_headers');
    expect(h).toContain("script-src 'self'");
    expect(h).not.toMatch(/unsafe-inline|unsafe-eval|https?:\/\//);
  });
});

describe('site público: cada página de calculadora carrega só o que usa', () => {
  const PASTA_DOS_SCRIPTS = join(ROOT, 'site-src', 'calculadoras');
  const lerScript = (nomeDoScript: string) => readFileSync(join(PASTA_DOS_SCRIPTS, nomeDoScript), 'utf8');
  const ENTRADA = lerScript('calculadora.js');
  const BASE = lerScript('base.js');
  const nome = (slug: string) => `calculadoras/${slug}.html`;
  const slugs = CALCULATORS.map((c) => c.slug);
  const PESADOS = ['series', 'cards', 'committed', 'simulate', 'validation', 'dia-util'].map((m) => `js/nucleo/${m}.js`);
  const COM_PESADOS = ['antes-de-financiar', 'plano-dividas'];
  const importsDe = (fonte: string) => [...fonte.matchAll(/^import\s[^;]*?from\s+'([^']+)';/gm)].map((m) => m[1]!);
  const doNucleo = (caminhos: string[], de: string) => caminhos.map((c) => posix.join(posix.dirname(de), c)).filter((c) => c.startsWith('js/nucleo/'));
  const tamanho = (arquivos: string[]) => arquivos.reduce((n, a) => n + Buffer.byteLength(gerado.arquivos.get(a) as string), 0);
  /** O que a página pré-carrega, em caminhos a partir da raiz do site. */
  const preCarga = (slug: string) => [...pagina(nome(slug)).matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map((m) => posix.join('calculadoras', m[1]!));
  /** Os módulos do núcleo que um script importa de cara, com tudo o que eles importam. */
  const nucleoDe = (script: string, arquivo: string) => fechoDe(doNucleo(importsDe(script), arquivo));

  it('o script que inicia a página importa de cara só as peças comuns, o catálogo e as datas; o resto vem de import() com caminho escrito por extenso', () => {
    expect(importsDe(ENTRADA).sort()).toEqual(['../js/nucleo/calculators/catalog.js', '../js/nucleo/dates.js', './base.js']);
    expect(importsDe(BASE).sort()).toEqual(['../js/nucleo/calculators/catalog.js', '../js/nucleo/calculators/inputs.js', '../js/nucleo/money.js']);
    // O que ele puxa de cara não traz nenhuma das calculadoras pesadas (séries, cartões, lançamentos e simulação).
    const deCara = [...new Set([...nucleoDe(ENTRADA, 'calculadoras/calculadora.js'), ...nucleoDe(BASE, 'calculadoras/base.js')])];
    for (const pesado of PESADOS) expect(deCara, pesado).not.toContain(pesado);
    expect(tamanho(deCara)).toBeLessThan(40_000);
    // Cada calculadora tem o seu par de import() (o módulo do núcleo e a definição dela), e só um de cada, com caminho que existe.
    const dinamicos = [...ENTRADA.matchAll(/\bimport\('([^']+)'\)/g)].map((m) => m[1]!);
    for (const slug of slugs) {
      expect(dinamicos.filter((d) => d === `../js/nucleo/calculators/${slug}.js`), slug).toHaveLength(1);
      expect(dinamicos.filter((d) => d === `./definicoes/${slug}.js`), slug).toHaveLength(1);
      expect(gerado.arquivos.has(`js/nucleo/calculators/${slug}.js`), slug).toBe(true);
      expect(gerado.arquivos.has(`calculadoras/definicoes/${slug}.js`), slug).toBe(true);
      expect(ENTRADA, slug).toMatch(new RegExp(`^\\s*(?:'${slug}'|${slug}): \\{ nucleo: \\(\\) => import\\('\\.\\./js/nucleo/calculators/${slug}\\.js'\\), definicao: \\(\\) => import\\('\\./definicoes/${slug}\\.js'\\) \\},`, 'm'));
    }
    expect(dinamicos.filter((d) => !d.startsWith('./definicoes/') && !/calculators\/(?!links)/.test(d))).toEqual(['../js/nucleo/calculators/links.js']);
    // O links.js (que traz as séries e os cartões) só é pedido quando o endereço traz ?modo=: sem parâmetro o prefill do core é vazio.
    expect(ENTRADA).toMatch(/modoDoEndereco \? import\('\.\.\/js\/nucleo\/calculators\/links\.js'\)/);
    for (const slug of slugs) expect(calcPrefill(slug, {}), slug).toEqual({});
    // Se o módulo não carregar, a página diz isso em vez de ficar parada em "carregando".
    expect(ENTRADA).toContain('Não foi possível carregar a calculadora.');
  });

  it('cada definição importa só as peças comuns e o núcleo, e entrega a fábrica da tela (export default); nenhuma importa outra definição', () => {
    for (const slug of slugs) {
      const arquivo = `definicoes/${slug}.js`;
      const fonte = lerScript(arquivo);
      expect(fonte, slug).toMatch(/^export default \(ctx, pre, \{[^}]*\}\) => \{$/m);
      for (const origem of importsDe(fonte)) expect(origem, `${slug}: ${origem}`).toMatch(/^(\.\.\/base\.js|\.\.\/\.\.\/js\/nucleo\/.+\.js)$/);
      expect(fonte, slug).not.toMatch(/\bimport\s*\(/);
      // O módulo do núcleo da calculadora chega por parâmetro (é o import() da página): a definição não o importa de novo.
      expect(fonte, slug).not.toContain(`calculators/${slug}.js`);
    }
    expect(slugs).toHaveLength(10);
  });

  it('cada página tem o modulepreload dos scripts dela, do módulo do núcleo da calculadora e de tudo o que eles importam, e nada além disso', () => {
    for (const slug of slugs) {
      const html = pagina(nome(slug));
      const links = preCarga(slug);
      expect(links, slug).toEqual(precargaDaCalculadora(slug));
      expect(links[0], slug).toBe('calculadoras/calculadora.js');
      expect(links, slug).toContain('calculadoras/base.js');
      expect(links, slug).toContain(`calculadoras/definicoes/${slug}.js`);
      expect(links, slug).toContain(`js/nucleo/calculators/${slug}.js`);
      // Nenhuma outra definição entra na página.
      expect(links.filter((a) => a.startsWith('calculadoras/definicoes/')), slug).toEqual([`calculadoras/definicoes/${slug}.js`]);
      for (const a of links) expect(gerado.arquivos.has(a), `${slug}: ${a} não existe`).toBe(true);
      expect(new Set(links).size, slug).toBe(links.length);
      // Os links ficam no <head>, antes do script do módulo, e o script continua sendo um módulo do próprio site.
      const cabeca = html.slice(0, html.indexOf('</head>'));
      expect(cabeca.match(/<link rel="modulepreload"/g), slug).toHaveLength(links.length);
      expect(cabeca.indexOf('<link rel="modulepreload"'), slug).toBeLessThan(cabeca.indexOf('<script type="module" src="calculadora.js">'));
      // O fecho do núcleo está completo: o módulo da calculadora, a definição e o que a página importa de cara, com tudo o que eles importam.
      const defin = lerScript(`definicoes/${slug}.js`);
      const raizes = [`js/nucleo/calculators/${slug}.js`, ...doNucleo(importsDe(defin), `calculadoras/definicoes/${slug}.js`), ...doNucleo(importsDe(ENTRADA), 'calculadoras/calculadora.js'), ...doNucleo(importsDe(BASE), 'calculadoras/base.js')];
      expect(links.filter((a) => a.startsWith('js/nucleo/')), slug).toEqual(fechoDe(raizes));
    }
    // O índice não tem calculadora na página, então não pré-carrega nada.
    expect(pagina('calculadoras/index.html')).not.toContain('modulepreload');
  });

  it('as calculadoras leves não carregam séries, cartões, lançamentos nem simulação; as duas que usam isso carregam, e cada página pesa bem menos que antes', () => {
    // Antes da divisão, toda página carregava o núcleo inteiro (26 arquivos) e o script único de todas as calculadoras: 336.928 bytes.
    const ANTES = 336_928;
    const pesos: Record<string, number> = {};
    for (const slug of slugs) {
      const links = preCarga(slug);
      pesos[slug] = tamanho(links);
      expect(pesos[slug], slug).toBeLessThan(ANTES);
      if (COM_PESADOS.includes(slug)) {
        expect(links.some((a) => PESADOS.includes(a)), slug).toBe(true);
        expect(pesos[slug], slug).toBeLessThan(ANTES * 0.75);
        continue;
      }
      for (const pesado of PESADOS) expect(links, `${slug}: ${pesado}`).not.toContain(pesado);
      expect(pesos[slug], `${slug}: bytes carregados`).toBeLessThan(ANTES / 5);
    }
  });

  it('os campos e as mensagens de erro que o script monta, sem o fields.js do core, são exatamente os do core, para as dez calculadoras', () => {
    const dir = mkdtempSync(join(tmpdir(), 'clarevo-campos-'));
    try {
      for (const [arq, fonte] of nucleo()) {
        mkdirSync(dirname(join(dir, arq)), { recursive: true });
        writeFileSync(join(dir, arq), fonte);
      }
      for (const [arq, fonte] of gerado.arquivos) {
        if (!/^calculadoras\/.+\.js$/.test(arq)) continue;
        mkdirSync(dirname(join(dir, arq)), { recursive: true });
        writeFileSync(join(dir, arq), fonte as string);
      }
      writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
      const consultas = slugs.flatMap((slug) => [
        { slug, modo: undefined },
        ...(slug === 'parcelado-ou-a-vista' ? [{ slug, modo: 'cota-unica' }] : []),
      ]);
      const erros = slugs.flatMap((slug) => [...Object.keys(calcFields(slug)), 'renda.1', 'apelido.0', 'tipo.2', 'campo-que-nao-existe'].flatMap((campo) => CODIGOS.map((codigo) => ({ slug, campo, codigo }))));
      writeFileSync(join(dir, 'consultas.json'), JSON.stringify({ consultas, erros }));
      writeFileSync(
        join(dir, 'rodar.mjs'),
        `import { readFileSync } from 'node:fs';
globalThis.document = { querySelector: () => null };
globalThis.window = { location: { search: '' } };
const { MODULOS } = await import('./calculadoras/calculadora.js');
const { NOMES_DOS_CAMPOS, camposDe, textoDoErro } = await import('./calculadoras/base.js');
const { consultas, erros } = JSON.parse(readFileSync(new URL('./consultas.json', import.meta.url)));
const modulos = {};
for (const slug of Object.keys(MODULOS)) {
  modulos[slug] = await MODULOS[slug].nucleo();
  const definicao = await MODULOS[slug].definicao();
  if (typeof definicao.default !== 'function') throw new Error(slug + ': a definição não exporta a fábrica');
}
process.stdout.write(JSON.stringify({
  slugs: Object.keys(MODULOS),
  nomes: Object.keys(NOMES_DOS_CAMPOS),
  campos: consultas.map((c) => camposDe(c.slug, c.modo, modulos[c.slug])),
  erros: erros.map((e) => textoDoErro(e.slug, e.campo, e.codigo, undefined, modulos[e.slug])),
  errosCotaUnica: textoDoErro('parcelado-ou-a-vista', 'aVista', 'vazio', 'cota-unica', modulos['parcelado-ou-a-vista']),
}));
`,
      );
      const r = spawnSync(process.execPath, [join(dir, 'rodar.mjs')], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      expect(r.status, r.stderr).toBe(0);
      const saida = JSON.parse(r.stdout) as { slugs: string[]; nomes: string[]; campos: unknown[]; erros: string[]; errosCotaUnica: string };
      expect([...saida.slugs].sort()).toEqual([...slugs].sort());
      expect([...saida.nomes].sort()).toEqual([...slugs].sort());
      consultas.forEach((c, i) => expect(saida.campos[i], `${c.slug} ${c.modo ?? ''}`).toEqual(JSON.parse(JSON.stringify(calcFields(c.slug, c.modo)))));
      erros.forEach((e, i) => expect(saida.erros[i], `${e.slug} ${e.campo} ${e.codigo}`).toBe(calcErrorText(e.slug, e.campo, e.codigo)));
      expect(saida.errosCotaUnica).toBe(calcErrorText('parcelado-ou-a-vista', 'aVista', 'vazio', 'cota-unica'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
