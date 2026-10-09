/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GOALS_TEXT, SAVINGS_TEXT, formatBRL } from '../src';
import {
  HIDDEN_MONEY,
  HIDDEN_MONEY_A11Y,
  maskMoneyLabel,
  maskMoneyText,
  moneyA11y,
  moneyText,
  setValuesHidden,
  spokenText,
  valuesHidden,
} from '../../../apps/app/src/lib/privacy';

/**
 * Ocultar valores (A2, docs/08 §5 item 8): com valores ocultos, os valores em reais viram "R$ ••••" na tela e "valor oculto"
 * para o leitor de tela, em toda tela que mostra dados guardados. Valem as exceções decididas: o que a pessoa digita (campos,
 * calculadoras, simulador e a soma de valores) continua à vista, porque é entrada dela; e limites fixos ("até
 * R$ 9.999.999,99") não são dados da pessoa.
 * Os arquivos do app são lidos como texto, sem importar telas (que dependem do Expo); lib/privacy.ts é puro e entra direto.
 */
const APP_SRC = fileURLToPath(new URL('../../../apps/app/src/', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const files = sourceFiles(APP_SRC).map((path) => ({ rel: path.slice(APP_SRC.length), text: readFileSync(path, 'utf8') }));

describe('lib/privacy.ts', () => {
  it('moneyText e moneyA11y: o valor ou "R$ ••••" e "valor oculto"', () => {
    expect(moneyText(210_000, false)).toBe('R$ 2.100,00');
    expect(moneyText(210_000, true)).toBe(HIDDEN_MONEY);
    expect(moneyA11y(210_000, false)).toBe('R$ 2.100,00');
    expect(moneyA11y(210_000, true)).toBe(HIDDEN_MONEY_A11Y);
    expect(HIDDEN_MONEY).toBe('R$ ••••');
    expect(HIDDEN_MONEY_A11Y).toBe('valor oculto');
  });

  it('maskMoneyText troca todo valor em reais de uma frase, com sinal e aproximação, e não mexe no resto', () => {
    const phrases: [string, string][] = [
      ['R$ 1.234,56', 'R$ ••••'],
      ['-R$ 1.234,56', 'R$ ••••'],
      ['\u2212R$ 30,00', 'R$ ••••'],
      ['≈ R$ 180,00 · estimado', '≈ R$ •••• · estimado'],
      ['Mais R$ 80,00 em Pago', 'Mais R$ •••• em Pago'],
      ['R$ 3.500,00 de R$ 22.500,00 · 15%', 'R$ •••• de R$ •••• · 15%'],
      ['Aluguel · R$ 2.500,00 · vence em 05/11/2026', 'Aluguel · R$ •••• · vence em 05/11/2026'],
      ['R$\u00a01.000.000,00', 'R$ ••••'],
      ['2 contas · próxima: Internet, 15/10', '2 contas · próxima: Internet, 15/10'],
      ['Renda comprometida em outubro: 52,5%', 'Renda comprometida em outubro: 52,5%'],
    ];
    for (const [text, hidden] of phrases) {
      expect(maskMoneyText(text, true), text).toBe(hidden);
      expect(maskMoneyText(text, false), text).toBe(text);
    }
  });

  it('maskMoneyLabel: "valor oculto" no lugar de cada valor e um só quando vêm juntos', () => {
    expect(maskMoneyLabel('Diferença do mês, R$ 2.100,00', true)).toBe('Diferença do mês, valor oculto');
    expect(maskMoneyLabel('Mais R$ 80,00 em Pago', true)).toBe('Mais valor oculto em Pago');
    expect(maskMoneyLabel('Reserva para imprevistos: 15% da meta, R$ 3.500,00 de R$ 22.500,00.', true)).toBe(
      'Reserva para imprevistos: 15% da meta, valor oculto.',
    );
    expect(maskMoneyLabel('cerca de R$ 180,00, valor estimado', true)).toBe('cerca de valor oculto, valor estimado');
    expect(maskMoneyLabel('Diferença do mês, R$ 2.100,00', false)).toBe('Diferença do mês, R$ 2.100,00');
  });

  it('spokenText: ano "2026/2027" lido "2026 a 2027" e valores ocultos; undefined quando o próprio texto basta', () => {
    expect(spokenText('Aluguel · R$ 2.500,00', false)).toBeUndefined();
    expect(spokenText('Aluguel · R$ 2.500,00', true)).toBe('Aluguel · valor oculto');
    expect(spokenText('IPTU 2026/2027 · R$ 1.800,00', false)).toBe('IPTU 2026 a 2027 · R$ 1.800,00');
    expect(spokenText('IPTU 2026/2027 · R$ 1.800,00', true)).toBe('IPTU 2026 a 2027 · valor oculto');
    expect(spokenText('Nada a ocultar aqui', true)).toBeUndefined();
  });

  it('o estado começa mostrando os valores e muda para a sessão', () => {
    expect(valuesHidden()).toBe(false);
    setValuesHidden(true);
    expect(valuesHidden()).toBe(true);
    setValuesHidden(false);
    expect(valuesHidden()).toBe(false);
  });

  it('as frases que o core monta com formatBRL são cobertas pela máscara (amostras de Metas e do plano de guardar)', () => {
    const samples = [
      GOALS_TEXT.savedOfTarget(350_000, 2_250_000),
      GOALS_TEXT.detail.compositionDeposits(50_000),
      SAVINGS_TEXT.planMonthly(50_000),
      `Fora dos compromissos: ${formatBRL(285_000)}`,
    ];
    for (const text of samples) {
      expect(text).toMatch(/R\$/);
      expect(maskMoneyText(text, true)).not.toMatch(/\d,\d{2}/);
      expect(maskMoneyLabel(text, true)).not.toMatch(/R\$|\d,\d{2}/);
    }
  });
});

describe('telas e componentes: valores em reais passam pelos auxiliares de privacidade', () => {
  /** Entradas da própria pessoa: o resultado do simulador e das calculadoras é o produto do que ela digitou. */
  const TYPED_INPUT_SURFACES = ['components/sim-year-bars.tsx'];
  const AWARE = /from '@\/(lib\/privacy|components\/money-text)'/;

  it('lê o app de verdade', () => {
    expect(files.length).toBeGreaterThan(30);
    expect(files.some((f) => f.rel === join('components', 'ui.tsx'))).toBe(true);
  });

  it('todo arquivo que chama formatBRL também usa os auxiliares de lib/privacy.ts ou MoneyTxt (ou é uma entrada digitada)', () => {
    const bad = files
      .filter(({ rel, text }) => rel !== join('lib', 'privacy.ts') && /\bformatBRL\(/.test(text))
      .filter(({ rel, text }) => !TYPED_INPUT_SURFACES.includes(rel.split('\\').join('/')) && !AWARE.test(text))
      .map((f) => f.rel);
    expect(bad).toEqual([]);
  });

  it('Money e FitMoney (ui.tsx) leem o estado de privacidade e o leitor de tela diz "valor oculto"', () => {
    const ui = files.find((f) => f.rel === join('components', 'ui.tsx'))!.text;
    expect(ui).toMatch(/export function Money\(/);
    expect(ui).toMatch(/export function FitMoney\(/);
    expect(ui.match(/useValuesHidden\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(ui).toContain('HIDDEN_MONEY_A11Y');
  });

  it('os avisos de resultado, os diálogos e o anúncio do iOS seguem a privacidade', () => {
    const read = (...parts: string[]) => files.find((f) => f.rel === join(...parts))!.text;
    expect(read('components', 'flash.tsx')).toMatch(/maskMoneyText/);
    expect(read('components', 'dialog.tsx')).toMatch(/maskMoneyText/);
    expect(read('components', 'choice-dialog.tsx')).toMatch(/maskMoneyText/);
    expect(read('lib', 'a11y.ts')).toMatch(/maskMoneyLabel\(text, valuesHidden\(\)\)/);
  });

  it('nenhuma tela escreve "R$ ••••" ou "valor oculto" à mão: a máscara vem sempre de lib/privacy.ts', () => {
    const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const bad = files
      .filter(({ rel, text }) => rel.startsWith('app') && /['"`][^'"`\n]*(R\$ •|valor oculto)[^'"`\n]*['"`]/.test(code(text)))
      .map((f) => f.rel);
    expect(bad).toEqual([]);
  });
});
