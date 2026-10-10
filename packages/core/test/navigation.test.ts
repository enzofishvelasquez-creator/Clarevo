/// <reference types="node" />
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  APP_SCREENS,
  APP_SEARCH_LIMIT,
  PAYABLES_MONTH_RANGE,
  TAB_ROUTES,
  appScreenIsTab,
  barModeFor,
  isPayablesMonth,
  normalizePath,
  payablesStartMonth,
  payablesStep,
  searchAppScreens,
  topicTabFor,
} from '../src';

/** Telas do app (arquivos de src/app), como caminhos de exemplo: [id] vira "abc", [mes] vira "2026-10". */
const APP_DIR = fileURLToPath(new URL('../../../apps/app/src/app/', import.meta.url));

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return /\.tsx$/.test(name) && !name.startsWith('_') ? [path] : [];
  });
}

function appRoutes(): { pattern: string; sample: string }[] {
  return routeFiles(APP_DIR).map((file) => {
    const parts = relative(APP_DIR, file)
      .replace(/\.tsx$/, '')
      .split('/')
      .filter((p) => !/^\(.*\)$/.test(p) && p !== 'index');
    const pattern = `/${parts.join('/')}`;
    const sample = pattern.replace('[mes]', '2026-10').replace('[slug]', 'reserva').replace('[tema]', 'juros').replace(/\[[a-z]+\]/g, 'abc');
    return { pattern, sample };
  });
}

describe('barra inferior (D-039)', () => {
  it('as quatro abas desenham a própria barra', () => {
    for (const tab of TAB_ROUTES) expect(barModeFor(tab)).toBe('abas');
  });

  it('telas de consulta mostram a barra, inclusive Calculadoras e as telas internas dela', () => {
    for (const path of [
      '/calcular',
      '/calcular/reserva',
      '/calcular/parcelado-ou-a-vista',
      '/a-pagar',
      '/a-pagar/9c1f2f5e-3b0c-4d79-9a0e-5b0f6c1d2e3f',
      '/gastos-fixos',
      '/gastos-fixos/abc',
      '/renda-comprometida',
      '/meta/abc',
      '/simular',
      '/cartoes',
      '/cartoes/abc',
      '/cartoes/abc/fatura/2026-10',
      '/explicacao/juros',
      '/registro/abc',
      '/composicao',
      '/conta',
      '/quem-ve',
      '/retomar',
    ])
      expect(barModeFor(path), path).toBe('consulta');
  });

  it('formulários, passos com rodapé fixo e telas de entrada ficam sem barra', () => {
    for (const path of [
      '/registro/novo',
      '/registro/abc/editar',
      '/a-pagar/nova',
      '/a-pagar/abc/editar',
      '/a-pagar/abc/pagar',
      '/a-pagar/vencidas',
      '/gastos-fixos/novo',
      '/gastos-fixos/abc/editar',
      '/gastos-fixos/abc/encerrar',
      '/gastos-fixos/abc/informar',
      '/meta/nova',
      '/meta/abc/editar',
      '/meta/abc/movimento',
      '/reserva',
      '/guardar',
      '/guardar/minima',
      '/renda-comprometida/referencia',
      '/cartoes/novo',
      '/cartoes/abc/editar',
      '/cartoes/abc/fatura/2026-10/pagar',
      '/cartoes/abc/fatura/2026-10/encargo',
      '/cartoes/abc/fatura/2026-10/estorno',
      '/cartoes/abc/fatura/2026-10/compra',
      '/retomar/atualizar',
      '/retomar/pagar',
      '/entrar',
      '/boas-vindas',
      '/criar-conta',
      '/primeira-conta',
      '/carregando',
    ])
      expect(barModeFor(path), path).toBe('formulario');
  });

  it('ignora parâmetros, âncora e barra final; tela desconhecida é de consulta (a barra não some por esquecimento)', () => {
    expect(normalizePath('/a-pagar/?mes=2026-09#topo')).toBe('/a-pagar');
    expect(normalizePath('')).toBe('/');
    expect(barModeFor('/a-pagar/vencidas/?x=1')).toBe('formulario');
    expect(barModeFor('/registro/novo?tipo=despesa')).toBe('formulario');
    expect(barModeFor('/tela-nova-qualquer')).toBe('consulta');
  });

  it('toda tela do app é classificada: o que se chama novo, editar ou pagar não tem barra, e o resto tem', () => {
    const routes = appRoutes();
    expect(routes.length).toBeGreaterThan(50);
    const formName = /\/(novo|nova|editar|pagar|encargo|estorno|compra|encerrar|informar|movimento|atualizar|vencidas|referencia|minima|reserva|guardar)$/;
    const entry = /^\/(boas-vindas|criar-conta|confirmar-email|entrar|recuperar-acesso|nova-senha|primeira-conta|carregando|confirmado)$/;
    for (const { pattern, sample } of routes) {
      const mode = barModeFor(sample);
      if (entry.test(pattern) || formName.test(pattern)) expect(mode, pattern).toBe('formulario');
      else if ((TAB_ROUTES as readonly string[]).includes(pattern === '' ? '/' : pattern)) expect(mode, pattern).toBe('abas');
      else expect(mode, pattern).toBe('consulta');
    }
  });

  it('aba do assunto: Contas a pagar é de Movimentos, Metas e simulador são de Metas, explicação é de Aprender', () => {
    expect(topicTabFor('/a-pagar')).toBe('/movimentacoes');
    expect(topicTabFor('/cartoes/abc')).toBe('/movimentacoes');
    expect(topicTabFor('/meta/abc')).toBe('/metas');
    expect(topicTabFor('/simular')).toBe('/metas');
    expect(topicTabFor('/explicacao/juros')).toBe('/aprender');
    expect(topicTabFor('/calcular')).toBe('/');
  });
});

describe('Contas a pagar: mês de abertura e seletor local (D-039)', () => {
  const current = '2026-10';

  it('sem mês no endereço (lembrete, atalho do ícone, aviso de vencidas), abre no mês atual', () => {
    expect(payablesStartMonth(undefined, current)).toBe('2026-10');
    expect(payablesStartMonth('', current)).toBe('2026-10');
  });

  it('o card que mostra um mês leva esse mês', () => {
    expect(payablesStartMonth('2026-09', current)).toBe('2026-09');
    expect(payablesStartMonth(['2026-11', '2026-12'], current)).toBe('2026-11');
  });

  it('valor inválido ou fora do que o seletor oferece abre o mês atual', () => {
    for (const bad of ['setembro', '2026-13', '2026-9', '2026-10-01', '1999-01', '2030-01']) expect(payablesStartMonth(bad, current), bad).toBe('2026-10');
  });

  it('o seletor vai de 24 meses atrás a 12 à frente e para nos limites', () => {
    expect(PAYABLES_MONTH_RANGE).toEqual({ back: 24, forward: 12 });
    expect(payablesStep('2026-10', current, -1)).toBe('2026-09');
    expect(payablesStep('2026-10', current, 1)).toBe('2026-11');
    expect(payablesStep('2026-12', current, 1)).toBe('2027-01');
    expect(payablesStep('2027-10', current, 1)).toBeNull();
    expect(payablesStep('2024-10', current, -1)).toBeNull();
    expect(isPayablesMonth('2024-10', current)).toBe(true);
    expect(isPayablesMonth('2024-09', current)).toBe(false);
    expect(isPayablesMonth(202610, current)).toBe(false);
  });
});

describe('busca de Aprender: grupo "No app" (D-039)', () => {
  const first = (query: string) => searchAppScreens(query)[0]?.id;
  const ids = (query: string) => searchAppScreens(query).map((s) => s.id);

  it('acha a função pelo nome e pelos sinônimos', () => {
    expect(first('nota fiscal')).toBe('nota-fiscal');
    expect(first('cupom')).toBe('nota-fiscal');
    expect(first('QR code')).toBe('nota-fiscal');
    expect(ids('boleto')).toContain('contas-a-pagar');
    expect(first('lembrete')).toBe('lembretes');
    expect(first('aviso')).toBe('lembretes');
    expect(first('categoria')).toBe('categoria');
    expect(first('simular')).toBe('simular');
    expect(first('simulador')).toBe('simular');
    expect(first('cartão')).toBe('cartoes');
    expect(first('cartao')).toBe('cartoes');
    expect(first('fatura')).toBe('cartoes');
    expect(first('IPVA')).toBe('contas-do-ano');
    expect(first('salário')).toBe('recebimento');
    expect(first('esconder valores')).toBe('ocultar-valores');
    expect(first('voltei')).toBe('ultimos-meses');
    expect(first('calculadora')).toBe('calculadoras');
    expect(first('renda comprometida')).toBe('renda-comprometida');
    expect(ids('guardar')).toContain('metas');
  });

  it('ignora acentos, maiúsculas e plural; todas as palavras precisam casar', () => {
    expect(first('CARTÕES')).toBe('cartoes');
    expect(first('  Lembretes ')).toBe('lembretes');
    expect(searchAppScreens('nota zzzzz')).toEqual([]);
  });

  it('sem palavra útil ou sem resultado, lista vazia; nunca passa do limite', () => {
    expect(searchAppScreens('')).toEqual([]);
    expect(searchAppScreens('de')).toEqual([]);
    expect(searchAppScreens('zzzzzz')).toEqual([]);
    expect(searchAppScreens('conta').length).toBeLessThanOrEqual(APP_SEARCH_LIMIT);
    expect(searchAppScreens('conta', APP_SCREENS, 100).length).toBeGreaterThan(APP_SEARCH_LIMIT);
  });

  it('o índice é fixo: ids únicos, textos preenchidos e endereços que existem no app', () => {
    expect(new Set(APP_SCREENS.map((s) => s.id)).size).toBe(APP_SCREENS.length);
    const routes = appRoutes().map((r) => r.pattern);
    expect(existsSync(APP_DIR)).toBe(true);
    for (const s of APP_SCREENS) {
      expect(s.title.trim(), s.id).not.toBe('');
      expect(s.caption.trim(), s.id).not.toBe('');
      expect(s.keywords.length, s.id).toBeGreaterThan(2);
      const path = normalizePath(s.href);
      expect(s.href.startsWith('/'), s.id).toBe(true);
      expect(path === '/' || routes.includes(path), `${s.id}: ${path}`).toBe(true);
    }
    expect(appScreenIsTab({ href: '/metas' })).toBe(true);
    expect(appScreenIsTab({ href: '/a-pagar' })).toBe(false);
    expect(APP_SCREENS.filter(appScreenIsTab).map((s) => s.id)).toEqual(['movimentos', 'metas']);
  });

  it('a busca não guarda nada: mesma entrada, mesma saída, e o índice não muda', () => {
    const before = JSON.stringify(APP_SCREENS);
    expect(ids('boleto')).toEqual(ids('boleto'));
    expect(JSON.stringify(APP_SCREENS)).toBe(before);
  });
});
