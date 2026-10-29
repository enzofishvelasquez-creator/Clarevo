/// <reference types="node" />
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  APP_SCREENS,
  CALCULATORS,
  COMPROVANTE_TEXT,
  GUIDE_ENTRIES,
  GUIDE_GROUPS,
  GUIDE_SEARCH_LIMIT,
  GUIDE_TEXT,
  HELP_TEXT,
  TOUR_CARDS,
  TOUR_TEXT,
  barModeFor,
  guideByGroup,
  guideEntriesOf,
  guideEntry,
  guideEntryHref,
  guideHelpEntry,
  guideSummary,
  guideWhere,
  normalizePath,
  searchGuide,
  shouldShowTour,
  type GuideEntry,
  type HelpScreen,
  type TourState,
} from '../src';

const APP_DIR = fileURLToPath(new URL('../../../apps/app/src/app/', import.meta.url));
const APP_SRC = fileURLToPath(new URL('../../../apps/app/src/', import.meta.url));
const CORE_SRC = fileURLToPath(new URL('../src/', import.meta.url));
const SHOTS_DIR = fileURLToPath(new URL('../../../docs/telas/', import.meta.url));

function files(dir: string, ext: RegExp, skip: (path: string) => boolean = () => false): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (skip(path)) return [];
    if (statSync(path).isDirectory()) return files(path, ext, skip);
    return ext.test(name) ? [path] : [];
  });
}

/** Telas do app (arquivos de src/app): o padrão com colchetes e um endereço de exemplo ([id] vira "abc", [mes] vira "2026-10"). */
function appRoutes(): { pattern: string; sample: string }[] {
  return files(APP_DIR, /\.tsx$/)
    .filter((f) => !/^[_+]/.test(relative(APP_DIR, f).split('/').pop()!)) // _layout, _sitemap e +not-found não são telas do guia
    .map((file) => {
      const parts = relative(APP_DIR, file)
        .replace(/\.tsx$/, '')
        .split('/')
        .filter((p) => !/^\(.*\)$/.test(p) && p !== 'index');
      const pattern = `/${parts.join('/')}`;
      const sample = pattern.replace('[mes]', '2026-10').replace('[slug]', 'reserva').replace('[tema]', 'juros').replace(/\[[a-z]+\]/g, 'abc');
      return { pattern, sample };
    });
}

const ROUTES = appRoutes();
const PATTERNS = ROUTES.map((r) => r.pattern);

/** Um endereço fixo (/calcular/plano-dividas) também vale quando a rota é dinâmica (/calcular/[slug]). */
function routeExists(href: string): boolean {
  const path = normalizePath(href);
  if (path === '/' || PATTERNS.includes(path)) return true;
  return PATTERNS.some((r) => r.includes('[') && new RegExp(`^${r.replace(/\[[^\]]+\]/g, '[^/]+')}$`).test(path));
}

/** Todo o texto do código (core fora do catálogo e o app), onde os nomes das telas aparecem como textos de verdade. */
const SOURCE_TEXT = [
  ...files(CORE_SRC, /\.ts$/, (p) => p.endsWith('/guide/catalog.ts')),
  ...files(APP_SRC, /\.tsx?$/),
]
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

/** Trechos entre aspas de um passo: os nomes de botões, abas e seções que a pessoa lê. */
const quoted = (text: string): string[] => [...text.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);

/** Telas de consulta (e as abas) sem entrada de guia, com a razão. Vazia: toda tela de consulta tem entrada. */
const COVERAGE_EXCEPTIONS: readonly { route: string; reason: string }[] = [];

/** Telas de consulta ou abas que nenhuma entrada cobre e que não estão na lista de exceções. */
function uncovered(routes: readonly { pattern: string; sample: string }[], entries: readonly GuideEntry[], exceptions: readonly { route: string }[]): string[] {
  const covered = new Set(entries.flatMap((e) => e.routes));
  const excepted = new Set(exceptions.map((e) => e.route));
  return routes
    .filter((r) => barModeFor(r.sample) !== 'formulario')
    .map((r) => r.pattern)
    .filter((p) => !covered.has(p) && !excepted.has(p));
}

describe('catálogo do guia (D-049)', () => {
  it('cinco grupos, na ordem da tela, cada um com entradas', () => {
    expect(GUIDE_GROUPS.map((g) => g.title)).toEqual(['Dia a dia', 'Contas e cartões', 'Planejar', 'Aprender e ajuda', 'Conta e privacidade']);
    expect(guideByGroup().map((g) => g.group.id)).toEqual(GUIDE_GROUPS.map((g) => g.id));
    for (const g of GUIDE_GROUPS) expect(guideEntriesOf(g.id).length, g.id).toBeGreaterThan(0);
    for (const e of GUIDE_ENTRIES) expect(GUIDE_GROUPS.some((g) => g.id === e.group), e.id).toBe(true);
  });

  it('a primeira frase de "Para que serve" é a legenda da lista', () => {
    expect(guideSummary(guideEntry('resumo')!)).toBe('Mostra, de uma vez, o que você recebeu, o que pagou e o que ainda vai vencer no mês.');
    for (const e of GUIDE_ENTRIES) {
      expect(guideSummary(e).length, e.id).toBeGreaterThan(20);
      expect(e.purpose.startsWith(guideSummary(e)), e.id).toBe(true);
    }
  });

  it('uma entrada por funcionalidade publicada, com ids únicos', () => {
    expect(new Set(GUIDE_ENTRIES.map((e) => e.id)).size).toBe(GUIDE_ENTRIES.length);
    const ids = GUIDE_ENTRIES.map((e) => e.id);
    // As funcionalidades do spec, mais Exportar, Importar e Buscar (D-045, D-047 e D-048).
    for (const id of [
      'resumo',
      'seu-mes',
      'evolucao',
      'anotar-gasto',
      'nota-fiscal',
      'movimentos',
      'buscar',
      'contas-a-pagar',
      'vencidas',
      'gastos-fixos',
      'contas-do-ano',
      'assinaturas',
      'cartoes',
      'contas-de-origem',
      'orcamento',
      'renda-comprometida',
      'metas',
      'plano-de-guardar',
      'simulador',
      'calculadoras',
      'antes-de-financiar',
      'plano-dividas',
      'aprender',
      'lembretes',
      'ocultar-valores',
      'ultimos-meses',
      'exportar',
      'importar-extrato',
      'quem-ve',
    ])
      expect(ids, id).toContain(id);
    expect(guideEntry('cartoes')?.title).toBe('Cartões e faturas');
    expect(guideEntry('nao-existe')).toBeUndefined();
  });

  it('nenhuma entrada sem título, para que serve, onde fica, passos, tela e palavras de busca', () => {
    for (const e of GUIDE_ENTRIES) {
      expect(e.title.trim(), e.id).not.toBe('');
      expect(e.purpose.trim(), e.id).not.toBe('');
      expect(e.where.length, e.id).toBeGreaterThan(0);
      for (const crumb of e.where) expect(crumb.trim(), e.id).not.toBe('');
      // De 3 a 6 passos curtos.
      expect(e.steps.length, e.id).toBeGreaterThanOrEqual(3);
      expect(e.steps.length, e.id).toBeLessThanOrEqual(6);
      for (const step of e.steps) {
        expect(step.trim(), e.id).not.toBe('');
        expect(step.length, `${e.id}: ${step}`).toBeLessThanOrEqual(330);
      }
      expect(e.screenName.trim(), e.id).not.toBe('');
      expect(e.href.startsWith('/'), e.id).toBe(true);
      expect(e.keywords.length, e.id).toBeGreaterThan(2);
      // "Para que serve": uma ou duas frases.
      const sentences = e.purpose.split(/(?<=[.!?])\s+/).filter(Boolean);
      expect(sentences.length, `${e.id}: ${e.purpose}`).toBeLessThanOrEqual(3);
    }
  });

  it('"Onde fica" mostra o caminho com › entre os nomes', () => {
    expect(guideWhere(['Movimentos', 'Organizar', 'Cartões'])).toBe('Movimentos › Organizar › Cartões');
    expect(guideWhere(guideEntry('cartoes')!.where)).toBe('Movimentos › Organizar › Cartões');
    expect(guideWhere(guideEntry('buscar')!.where)).toBe('Movimentos › Buscar');
    expect(guideWhere(guideEntry('exportar')!.where)).toBe('Conta › Exportar meus dados');
    expect(guideWhere(guideEntry('importar-extrato')!.where)).toBe('Movimentos › Organizar › Importar extrato ou fatura');
    expect(GUIDE_TEXT.open('Cartões')).toBe('Abrir Cartões');
    expect(guideEntryHref('cartoes')).toBe('/aprender/guia/cartoes');
  });

  it('as três funções novas têm entrada com o lugar e os passos reais (D-045, D-047, D-048)', () => {
    const buscar = guideEntry('buscar')!;
    expect(buscar.href).toBe('/movimentacoes/buscar');
    expect(buscar.steps.join(' ')).toContain('"Buscar"');
    expect(buscar.steps.join(' ')).toContain('"Período"');
    const exportar = guideEntry('exportar')!;
    expect(exportar.href).toBe('/conta/exportar');
    expect(exportar.steps.join(' ')).toContain('"Escolher período e formato"');
    expect(exportar.steps.join(' ')).toContain('"Preparar arquivo"');
    const importar = guideEntry('importar-extrato')!;
    expect(importar.href).toBe('/importar');
    expect(importar.steps.join(' ')).toContain('"Escolher o arquivo"');
    expect(importar.steps.join(' ')).toContain('"Revisar as linhas"');
    expect(importar.alsoWhere?.map(guideWhere)).toContain('Conta › Suas contas › Importar extrato');
  });

  it('"Escanear nota fiscal" cita o comprovante de Pix e de pagamento em um passo (D-051), com o nome real da opção, e a busca acha por "pix", "ted" e "boleto"', () => {
    const nota = guideEntry('nota-fiscal')!;
    const step = nota.steps.find((x) => x.includes(COMPROVANTE_TEXT.option));
    expect(step).toBeDefined();
    expect(step).toContain('"Ler comprovante de Pix ou pagamento (PDF)"');
    expect(step).toContain('Registrar recebimento');
    expect(step).toContain('não é guardado');
    // O passo entra antes de "Salvar gasto", que continua sendo o último.
    expect(nota.steps.indexOf(step!)).toBe(nota.steps.length - 2);
    expect(nota.steps[nota.steps.length - 1]).toContain('"Salvar gasto"');
    for (const word of ['pix', 'ted', 'boleto', 'comprovante']) expect(searchGuide(word).map((e) => e.id), word).toContain('nota-fiscal');
  });

  it('"Seu mês em 30 segundos" (D-052) tem entrada em Dia a dia, logo depois do Resumo, com o caminho e os botões reais e a busca acha por "seu mês" e "30 segundos"', () => {
    const entry = guideEntry('seu-mes')!;
    expect(entry.group).toBe('dia-a-dia');
    expect(GUIDE_ENTRIES.map((e) => e.id).slice(0, 2)).toEqual(['resumo', 'seu-mes']);
    expect(entry.title).toBe('Seu mês em 30 segundos');
    expect(entry.href).toBe('/seu-mes');
    expect(entry.routes).toEqual(['/seu-mes']);
    expect(guideWhere(entry.where)).toBe('Movimentos › Seu mês em 30 segundos');
    const steps = entry.steps.join(' ');
    for (const name of ['"Buscar"', '"Próximo"', '"Anterior"', '"Concluir"', '"Entrou e saiu"', '"Para onde foi"', '"O que ainda vence"', '"Orçamento"', '"Metas"', '"Diferença do mês"']) {
      expect(steps, name).toContain(name);
    }
    for (const query of ['seu mês', '30 segundos', 'revisão do mês']) expect(searchGuide(query).map((e) => e.id), query).toContain('seu-mes');
    // A palavra "cartão" continua levando só a Cartões e faturas: o guia do mês não a usa como palavra de busca.
    expect(searchGuide('cartão').map((e) => e.id)).toEqual(['cartoes']);
    // A entrada de Ocultar valores cita o widget de Conta (D-052).
    expect(guideEntry('ocultar-valores')!.alsoWhere?.map(guideWhere)).toContain('Conta › Widget na tela inicial');
    expect(guideEntry('ocultar-valores')!.steps.join(' ')).toContain('"Mostrar valores no widget"');
  });

  it('"Evolução" (D-057) tem entrada em Dia a dia, logo depois de "Seu mês em 30 segundos", com o caminho e os botões reais, e a busca acha por "evolução", "mediana" e "gráfico"', () => {
    const entry = guideEntry('evolucao')!;
    expect(entry.group).toBe('dia-a-dia');
    expect(GUIDE_ENTRIES.map((e) => e.id).slice(0, 3)).toEqual(['resumo', 'seu-mes', 'evolucao']);
    expect(entry.title).toBe('Evolução');
    expect(entry.href).toBe('/evolucao');
    expect(entry.routes).toEqual(['/evolucao']);
    expect(guideWhere(entry.where)).toBe('Movimentos › Evolução');
    expect(entry.screenshot).toBe('443_evolucao_abril_fora.png');
    const steps = entry.steps.join(' ');
    for (const name of ['"Seu mês em 30 segundos"', '"Evolução"', '"Recebido"', '"Pago"', '"3 meses"', '"6 meses"', '"12 meses"', '"Mostrar este mês na comparação"', '"Restaurar todos"', '"Média dos meses na comparação"', '"Mediana dos meses na comparação"', '"Total dos meses exibidos"', '"Ver tabela mês a mês"']) {
      expect(steps, name).toContain(name);
    }
    expect(steps).toContain('não apaga nem muda lançamento');
    expect(steps).toContain('só enquanto o app está aberto');
    for (const query of ['evolução', 'mediana', 'gráfico', 'comparar meses']) expect(searchGuide(query).map((e) => e.id), query).toContain('evolucao');
    // A palavra "cartão" continua levando só a Cartões e faturas.
    expect(searchGuide('cartão').map((e) => e.id)).toEqual(['cartoes']);
  });

  it('a renda comprometida ensina "Calcular pela média" (D-062): o valor vai para o campo e só é salvo quando a pessoa toca em salvar', () => {
    const entry = guideEntry('renda-comprometida')!;
    expect(entry.steps.length).toBeLessThanOrEqual(6);
    const steps = entry.steps.join(' ');
    for (const name of ['"Calcular pela média"', '"Salvar renda de referência"', '"Alterar"']) expect(steps, name).toContain(name);
    expect(steps).toContain('escolha os últimos 3 ou 6 meses');
    expect(steps).toContain('só é salvo quando você toca em "Salvar renda de referência"');
    for (const query of ['renda variável', 'calcular pela média']) expect(searchGuide(query).map((e) => e.id), query).toContain('renda-comprometida');
  });

  it('o painel da empresa e o benefício pela empresa (D-056) têm entrada, com o lugar e os nomes reais das telas', () => {
    const painel = guideEntry('painel-da-empresa')!;
    expect(painel.group).toBe('conta-e-privacidade');
    expect(painel.href).toBe('/empresa');
    expect(painel.routes).toEqual(['/empresa']);
    expect(guideWhere(painel.where)).toBe('Conta › Painel da empresa');
    expect(painel.purpose).toContain('Só na web');
    const passos = painel.steps.join(' ');
    for (const name of ['"Abrir painel da empresa"', '"Contrato"', '"Convidar pessoas"', '"Links para enviar"', '"Copiar todos"', '"Baixar lista"', '"Licenças"', '"Reenviar convite"', '"Cancelar convite"', '"Encerrar licença"', '"Uso do app"', '"Relatório de adesão"', '"Textos para divulgar"']) {
      expect(passos, name).toContain(name);
    }
    expect(passos).toContain('30 dias');
    expect(passos).toContain('com a lista de licenças só se você marcar');
    for (const query of ['relatório', 'adesão']) expect(searchGuide(query).map((e) => e.id), query).toContain('painel-da-empresa');
    expect(painel.screenshot).toBe('421_empresa_painel.png');
    const beneficio = guideEntry('beneficio-da-empresa')!;
    expect(beneficio.href).toBe('/conta');
    expect(beneficio.routes).toEqual(['/beneficio/[codigo]']);
    expect(guideWhere(beneficio.where)).toBe('Conta › Benefício pela empresa');
    const passosBeneficio = beneficio.steps.join(' ');
    for (const name of ['"Entrar"', '"Criar conta"', '"Aceitar benefício"', '"Tenho um convite da empresa"', '"Ver convite"', '"Acesso ao plano"', '"Quem vê estes dados?"']) {
      expect(passosBeneficio, name).toContain(name);
    }
    for (const query of ['empresa', 'rh', 'licença']) expect(searchGuide(query).map((e) => e.id), query).toContain('painel-da-empresa');
    for (const query of ['benefício', 'convite da empresa']) expect(searchGuide(query).map((e) => e.id), query).toContain('beneficio-da-empresa');
    // O guia não promete o que o painel não faz: nada de e-mail enviado pelo Clarevo nem de finanças vistas pela empresa.
    expect(passos).toContain('A Clarevo não envia e-mail');
    expect(passosBeneficio).toContain('Ela não vê seus registros');
  });

  it('as calculadoras aparecem cada uma em uma linha, a partir do catálogo de calculadoras', () => {
    const calc = guideEntry('calculadoras')!;
    expect(calc.lines?.map((l) => l.title)).toEqual(CALCULATORS.map((c) => c.title));
    for (const line of calc.lines ?? []) {
      expect(line.caption.trim(), line.title).not.toBe('');
      expect(routeExists(line.href), line.href).toBe(true);
    }
    expect(calc.lines).toHaveLength(10);
  });
});

describe('rotas do guia existem no app', () => {
  it('o endereço aberto por "Abrir" de cada entrada é uma tela do app', () => {
    expect(ROUTES.length).toBeGreaterThan(50);
    for (const e of GUIDE_ENTRIES) expect(routeExists(e.href), `${e.id}: ${e.href}`).toBe(true);
  });

  it('as telas que a entrada explica (routes) existem como arquivos de src/app', () => {
    for (const e of GUIDE_ENTRIES) for (const route of e.routes) expect(PATTERNS, `${e.id}: ${route}`).toContain(route);
  });

  it('as telas do guia (lista e entrada) existem', () => {
    expect(PATTERNS).toContain('/aprender/guia');
    expect(PATTERNS).toContain('/aprender/guia/[id]');
    // São telas de consulta, com a barra inferior, e a aba do assunto é Aprender.
    expect(barModeFor('/aprender/guia')).toBe('consulta');
    expect(barModeFor('/aprender/guia/cartoes')).toBe('consulta');
  });

  it('as entradas do índice "No app" também levam a telas que o guia explica', () => {
    // O guia e o índice "No app" descrevem as mesmas telas: nenhum endereço do índice fica sem tela do guia.
    const covered = new Set(GUIDE_ENTRIES.flatMap((e) => [normalizePath(e.href), ...e.routes]));
    const dynamic = (path: string) => [...covered].some((r) => r.includes('[') && new RegExp(`^${r.replace(/\[[^\]]+\]/g, '[^/]+')}$`).test(path));
    for (const s of APP_SCREENS) {
      const path = normalizePath(s.href);
      expect(covered.has(path) || dynamic(path), `${s.id}: ${path}`).toBe(true);
    }
  });
});

describe('cobertura: toda tela de consulta tem entrada (D-049)', () => {
  it('as telas de consulta e as abas estão no catálogo ou na lista explícita de exceções', () => {
    expect(uncovered(ROUTES, GUIDE_ENTRIES, COVERAGE_EXCEPTIONS)).toEqual([]);
  });

  it('as exceções são telas que existem e que nenhuma entrada cobre (a lista não apodrece)', () => {
    const covered = new Set(GUIDE_ENTRIES.flatMap((e) => e.routes));
    for (const ex of COVERAGE_EXCEPTIONS) {
      expect(PATTERNS, ex.route).toContain(ex.route);
      expect(covered.has(ex.route), ex.route).toBe(false);
      expect(ex.reason.trim(), ex.route).not.toBe('');
    }
  });

  it('uma tela de consulta nova, sem entrada nem exceção, reprova', () => {
    const fake = [...ROUTES, { pattern: '/tela-nova', sample: '/tela-nova' }, { pattern: '/outra/nova', sample: '/outra/nova' }];
    expect(uncovered(fake, GUIDE_ENTRIES, [])).toEqual(['/tela-nova', '/outra/nova']);
    expect(uncovered(fake, GUIDE_ENTRIES, [{ route: '/tela-nova' }])).toEqual(['/outra/nova']);
    // Formulário não precisa de entrada própria: a entrada da função explica o passo a passo.
    expect(uncovered([{ pattern: '/meta/nova', sample: '/meta/nova' }], [], [])).toEqual([]);
  });

  it('cada tela de consulta ou aba tem pelo menos uma entrada que a cobre', () => {
    const browse = ROUTES.filter((r) => barModeFor(r.sample) !== 'formulario').map((r) => r.pattern);
    expect(browse.length).toBeGreaterThan(20);
    for (const route of browse) expect(GUIDE_ENTRIES.filter((e) => e.routes.includes(route)).length, route).toBeGreaterThan(0);
  });
});

describe('nomes do guia existem nas telas', () => {
  it('todo nome do "Onde fica" existe nos textos das telas ou do core', () => {
    for (const e of GUIDE_ENTRIES) {
      for (const path of [e.where, ...(e.alsoWhere ?? [])]) {
        for (const crumb of path) expect(SOURCE_TEXT, `${e.id}: ${crumb}`).toContain(crumb);
      }
    }
  });

  it('todo nome entre aspas nos passos existe nos textos das telas ou do core', () => {
    let count = 0;
    for (const e of GUIDE_ENTRIES) {
      for (const step of e.steps) {
        for (const name of quoted(step)) {
          count++;
          expect(SOURCE_TEXT, `${e.id}: "${name}"`).toContain(name);
        }
      }
    }
    expect(count).toBeGreaterThan(150);
  });

  it('o nome da tela do botão "Abrir {tela}" existe nos textos', () => {
    for (const e of GUIDE_ENTRIES) expect(SOURCE_TEXT, `${e.id}: ${e.screenName}`).toContain(e.screenName);
  });
});

describe('capturas do manual', () => {
  it('cada entrada aponta para uma captura que existe em docs/telas, de 390 px (780 px de largura) e sem o sufixo de tela pequena', () => {
    for (const e of GUIDE_ENTRIES) {
      expect(e.screenshot, e.id).toMatch(/^[0-9]+[a-z]?_[a-z0-9_]+\.png$/);
      expect(e.screenshot, e.id).not.toMatch(/_(320px|360x640|736px)\.png$/);
      const path = join(SHOTS_DIR, e.screenshot);
      expect(existsSync(path), `${e.id}: ${e.screenshot}`).toBe(true);
      const header = readFileSync(path).subarray(0, 24);
      expect(header.subarray(1, 4).toString('latin1'), e.id).toBe('PNG');
      expect(header.readUInt32BE(16), `${e.id}: largura de ${e.screenshot}`).toBe(780);
    }
  });
});

describe('botão "?" nas telas listadas (D-049(3))', () => {
  const SCREENS: HelpScreen[] = ['cartoes', 'fatura', 'conta-do-ano', 'orcamento', 'renda-comprometida', 'contas-de-origem', 'importar', 'buscar', 'plano-dividas', 'antes-de-financiar'];

  it('cada tela com o "?" tem exatamente uma entrada', () => {
    for (const screen of SCREENS) {
      const entries = GUIDE_ENTRIES.filter((e) => e.help?.includes(screen));
      expect(entries.length, screen).toBe(1);
      expect(guideHelpEntry(screen).id, screen).toBe(entries[0]!.id);
    }
    // Nenhuma tela de ajuda fora da lista.
    const all = new Set(GUIDE_ENTRIES.flatMap((e) => e.help ?? []));
    expect([...all].sort()).toEqual([...SCREENS].sort());
  });

  it('Cartões e Fatura abrem a mesma entrada; as demais, a sua', () => {
    expect(guideHelpEntry('cartoes').id).toBe('cartoes');
    expect(guideHelpEntry('fatura').id).toBe('cartoes');
    expect(guideHelpEntry('conta-do-ano').id).toBe('contas-do-ano');
    expect(guideHelpEntry('orcamento').id).toBe('orcamento');
    expect(guideHelpEntry('renda-comprometida').id).toBe('renda-comprometida');
    expect(guideHelpEntry('contas-de-origem').id).toBe('contas-de-origem');
    expect(guideHelpEntry('importar').id).toBe('importar-extrato');
    expect(guideHelpEntry('buscar').id).toBe('buscar');
    expect(guideHelpEntry('plano-dividas').id).toBe('plano-dividas');
    expect(guideHelpEntry('antes-de-financiar').id).toBe('antes-de-financiar');
  });

  it('o nome acessível e a folha', () => {
    expect(HELP_TEXT.button).toBe('Como usar esta tela');
    expect(HELP_TEXT.seeInGuide).toBe('Ver no guia');
    expect(HELP_TEXT.sheetLabel('Cartões e faturas')).toBe('Como usar: Cartões e faturas');
  });

  it('o código das telas usa o botão nas telas listadas', () => {
    expect(readFileSync(join(APP_SRC, 'components/header.tsx'), 'utf8')).toContain('<HelpButton screen={help} />');
    expect(readFileSync(join(APP_SRC, 'components/help-button.tsx'), 'utf8')).toContain('HELP_TEXT.button');
    const usage: [string, string][] = [
      ['app/cartoes/index.tsx', "help=\"cartoes\""],
      ['app/cartoes/[id]/fatura/[mes]/index.tsx', "help=\"fatura\""],
      ['components/series-form.tsx', "'conta-do-ano'"],
      ['app/gastos-fixos/[id]/index.tsx', "'conta-do-ano'"],
      ['app/orcamento/index.tsx', "help=\"orcamento\""],
      ['app/renda-comprometida/index.tsx', "help=\"renda-comprometida\""],
      ['components/account-form.tsx', "help=\"contas-de-origem\""],
      ['components/import-flow.tsx', "help=\"importar\""],
      ['app/movimentacoes/buscar.tsx', "help=\"buscar\""],
      ['components/calc/parts.tsx', 'calcHelp'],
    ];
    for (const [file, needle] of usage) expect(readFileSync(join(APP_SRC, file), 'utf8'), file).toContain(needle);
  });
});

describe('busca do guia em Aprender', () => {
  const ids = (query: string) => searchGuide(query).map((e) => e.id);

  it('acha a função pelo nome e pelos sinônimos', () => {
    expect(ids('cartão')[0]).toBe('cartoes');
    expect(ids('cartao')[0]).toBe('cartoes');
    expect(ids('fatura')).toEqual(expect.arrayContaining(['cartoes', 'importar-extrato']));
    expect(ids('exportar')[0]).toBe('exportar');
    expect(ids('planilha')).toEqual(expect.arrayContaining(['exportar', 'importar-extrato']));
    expect(ids('buscar')[0]).toBe('buscar');
    expect(ids('quanto paguei')[0]).toBe('buscar');
    expect(ids('boleto')).toContain('contas-a-pagar');
    expect(ids('ipva')).toContain('contas-do-ano');
    expect(ids('streaming')).toContain('assinaturas');
    expect(ids('nota fiscal')[0]).toBe('nota-fiscal');
    expect(ids('guia')).toContain('ajuda');
    expect(ids('tour')).toContain('ajuda');
    expect(ids('bola de neve')[0]).toBe('plano-dividas');
    expect(ids('financiar')[0]).toBe('antes-de-financiar');
    expect(ids('calculadora')[0]).toBe('calculadoras');
    expect(ids('esconder valores')[0]).toBe('ocultar-valores');
    expect(ids('lembrete')[0]).toBe('lembretes');
    expect(ids('quem vê')[0]).toBe('quem-ve');
  });

  it('ignora acentos, maiúsculas e plural; todas as palavras precisam casar', () => {
    expect(ids('CARTÕES')[0]).toBe('cartoes');
    expect(ids('  Lembretes ')[0]).toBe('lembretes');
    expect(searchGuide('cartão zzzzz')).toEqual([]);
  });

  it('sem palavra útil ou sem resultado, lista vazia; nunca passa do limite', () => {
    expect(searchGuide('')).toEqual([]);
    expect(searchGuide('de')).toEqual([]);
    expect(searchGuide('zzzzzz')).toEqual([]);
    expect(searchGuide('conta').length).toBeLessThanOrEqual(GUIDE_SEARCH_LIMIT);
    expect(searchGuide('conta', GUIDE_ENTRIES, 100).length).toBeGreaterThan(2);
    expect(searchGuide('conta', GUIDE_ENTRIES, 2)).toHaveLength(2);
  });

  it('a busca olha o título e as palavras de busca, não o texto dos passos', () => {
    // "juros" aparece em passos e no "Para que serve", mas não é título nem palavra de busca: a busca de temas ("juros") fica só com os temas.
    expect(searchGuide('juros')).toEqual([]);
    expect(searchGuide('estimativa')).toEqual([]);
  });

  it('a busca não guarda nada: mesma entrada, mesma saída, e o catálogo não muda', () => {
    const before = JSON.stringify(GUIDE_ENTRIES);
    expect(ids('boleto')).toEqual(ids('boleto'));
    expect(JSON.stringify(GUIDE_ENTRIES)).toBe(before);
  });

  it('a contagem anunciada junto às outras', () => {
    expect(GUIDE_TEXT.countFor(1, 'boleto')).toBe('1 guia para "boleto"');
    expect(GUIDE_TEXT.countFor(3, ' cartão ')).toBe('3 guias para "cartão"');
  });
});

describe('tour de boas-vindas (D-049(2))', () => {
  const base: TourState = { pathname: '/', prefsLoaded: true, seen: false, personal: true, reviewBand: 'oculta' };

  it('cinco cartões, na ordem do spec, cada um com título, texto e ícone', () => {
    expect(TOUR_CARDS).toHaveLength(5);
    expect(TOUR_CARDS.map((c) => c.id)).toEqual(['resumo', 'anotar', 'contas', 'metas', 'ajuda']);
    expect(TOUR_CARDS.map((c) => c.title)).toEqual(['Resumo do mês', 'Anotar um gasto', 'Contas a pagar e lembretes', 'Metas e calculadoras', 'Onde achar ajuda']);
    expect(new Set(TOUR_CARDS.map((c) => c.icon)).size).toBe(5);
    for (const c of TOUR_CARDS) {
      expect(c.title.trim(), c.id).not.toBe('');
      expect(c.body.trim(), c.id).not.toBe('');
      expect(c.body.length, c.id).toBeLessThanOrEqual(190);
    }
    // O último cartão diz onde achar a ajuda.
    expect(TOUR_CARDS[4]!.body).toContain('Aprender › Como usar o app da Clarevo');
    expect(TOUR_TEXT.skip).toBe('Pular');
    expect(TOUR_TEXT.next).toBe('Próximo');
    expect(TOUR_TEXT.start).toBe('Começar');
    expect(TOUR_TEXT.progress(2, 5)).toBe('2 de 5');
  });

  it('aparece no Resumo, uma vez por pessoa em cada aparelho', () => {
    expect(shouldShowTour(base)).toBe(true);
    expect(shouldShowTour({ ...base, seen: true })).toBe(false);
    // Enquanto as preferências do aparelho não foram lidas, espera (nunca pisca nem repete).
    expect(shouldShowTour({ ...base, prefsLoaded: false })).toBe(false);
  });

  it('nunca aparece sobre a faixa "Seus últimos meses" nem enquanto ela carrega (D-030)', () => {
    expect(shouldShowTour({ ...base, reviewBand: 'visivel' })).toBe(false);
    expect(shouldShowTour({ ...base, reviewBand: 'pendente' })).toBe(false);
  });

  it('nunca aparece sobre formulários, passos com rodapé fixo nem telas de entrada', () => {
    for (const pathname of [
      '/registro/novo',
      '/registro/abc/editar',
      '/a-pagar/nova',
      '/a-pagar/vencidas',
      '/gastos-fixos/novo',
      '/cartoes/novo',
      '/cartoes/abc/fatura/2026-10/pagar',
      '/meta/nova',
      '/guardar',
      '/renda-comprometida/referencia',
      '/orcamento/Mercado',
      '/contas/nova',
      '/importar',
      '/retomar/atualizar',
      '/entrar',
      '/boas-vindas',
      '/primeira-conta',
    ])
      expect(shouldShowTour({ ...base, pathname }), pathname).toBe(false);
  });

  it('também não abre sobre telas de consulta abertas por cima de uma aba, só no Resumo', () => {
    for (const pathname of ['/a-pagar', '/cartoes', '/conta', '/retomar', '/aprender/guia']) expect(shouldShowTour({ ...base, pathname }), pathname).toBe(false);
    // As outras abas também esperam: o tour começa pelo Resumo.
    for (const pathname of ['/movimentacoes', '/metas', '/aprender']) expect(shouldShowTour({ ...base, pathname }), pathname).toBe(false);
    expect(shouldShowTour({ ...base, pathname: '/' })).toBe(true);
    expect(shouldShowTour({ ...base, pathname: '/?mes=2026-09' })).toBe(true);
  });

  it('fora do Pessoal e com o ambiente desligando, não aparece', () => {
    expect(shouldShowTour({ ...base, personal: false })).toBe(false);
    expect(shouldShowTour({ ...base, disabled: true })).toBe(false);
    expect(shouldShowTour({ ...base, disabled: false })).toBe(true);
  });
});
