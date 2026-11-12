import { describe, expect, it } from 'vitest';

import {
  ACCOUNT_LEVELS,
  ACCOUNT_MARK_KEYS,
  ACCOUNT_MARK_TEXT,
  LEVEL_NAME,
  LEVEL_TEXT,
  LEVEL_THRESHOLD,
  NO_MARKS,
  accountLevel,
  accountLevelProgress,
  accountMarksDone,
  createDemoRepository,
  isAccountLevel,
  parseAccountMarks,
  shouldCelebrateLevel,
  type AccountMarks,
} from '../src';

/** Os primeiros `n` marcos feitos, na ordem da lista. */
const marks = (n: number): AccountMarks => Object.fromEntries(ACCOUNT_MARK_KEYS.map((k, i) => [k, i < n])) as AccountMarks;

describe('níveis de conta (D-095): marcos e níveis', () => {
  it('16 marcos; toda conta começa no Bronze; Prata com 4, Ouro com 8 e Diamante com 12', () => {
    expect(ACCOUNT_MARK_KEYS).toHaveLength(16);
    expect(new Set(ACCOUNT_MARK_KEYS).size).toBe(16);
    expect(LEVEL_THRESHOLD).toEqual({ bronze: 0, prata: 4, ouro: 8, diamante: 12 });
    expect([0, 3, 4, 7, 8, 11, 12, 16].map((n) => accountLevel(marks(n)))).toEqual(['bronze', 'bronze', 'prata', 'prata', 'ouro', 'ouro', 'diamante', 'diamante']);
    expect(accountMarksDone(NO_MARKS)).toBe(0);
    expect(accountLevel(NO_MARKS)).toBe('bronze');
  });

  it('o caminho até o próximo nível: quantos faltam e a fração dentro do nível; no Diamante, completo', () => {
    expect(accountLevelProgress(marks(0))).toEqual({ level: 'bronze', done: 0, total: 16, next: 'prata', missing: 4, fraction: 0 });
    expect(accountLevelProgress(marks(3))).toEqual({ level: 'bronze', done: 3, total: 16, next: 'prata', missing: 1, fraction: 0.75 });
    expect(accountLevelProgress(marks(6))).toEqual({ level: 'prata', done: 6, total: 16, next: 'ouro', missing: 2, fraction: 0.5 });
    expect(accountLevelProgress(marks(13))).toEqual({ level: 'diamante', done: 13, total: 16, next: null, missing: 0, fraction: 1 });
  });

  it('lê a resposta do banco: só `true` conta, marco desconhecido é ignorado e o que não é objeto vira erro', () => {
    expect(parseAccountMarks({ gasto: true, meta: 'true', recebimento: 1, novo_marco: true })).toEqual({ ...NO_MARKS, gasto: true });
    expect(parseAccountMarks({})).toEqual(NO_MARKS);
    for (const bad of [null, undefined, 'x', 3, [true]]) expect(() => parseAccountMarks(bad)).toThrow('marcos_invalidos');
    expect(isAccountLevel('ouro')).toBe(true);
    expect(isAccountLevel('platina')).toBe(false);
  });

  it('a comemoração: só quando o nível sobe em relação ao último que o aparelho já viu; na primeira vez no aparelho, não', () => {
    expect(shouldCelebrateLevel('bronze', 'prata')).toBe(true);
    expect(shouldCelebrateLevel('bronze', 'ouro')).toBe(true);
    expect(shouldCelebrateLevel('prata', 'prata')).toBe(false);
    expect(shouldCelebrateLevel('ouro', 'prata')).toBe(false);
    expect(shouldCelebrateLevel(null, 'diamante')).toBe(false);
  });

  it('cada marco tem nome e, quase todos, para onde levar; os textos seguem as regras e nunca falam de valor', () => {
    const texts: string[] = [
      ...ACCOUNT_MARK_KEYS.map((k) => ACCOUNT_MARK_TEXT[k].title),
      ...ACCOUNT_LEVELS.flatMap((l) => [LEVEL_NAME[l], LEVEL_TEXT.level(l), LEVEL_TEXT.celebrateTitle(l), LEVEL_TEXT.celebrateBody[l]]),
      LEVEL_TEXT.next(1, 'prata'),
      LEVEL_TEXT.next(3, 'ouro'),
      LEVEL_TEXT.progress(5, 16),
      LEVEL_TEXT.markDone('Criar uma meta'),
      LEVEL_TEXT.markTodo('Criar uma meta'),
      ...(Object.values(LEVEL_TEXT).filter((v) => typeof v === 'string') as string[]),
    ];
    for (const t of texts) {
      expect(t).not.toMatch(/—|–/);
      expect(t).not.toMatch(/fa(z|ç)er? sentido|faz sentido/i);
      expect(t).not.toMatch(/R\$|\brico|\briqueza|patrim[oô]nio|deveria|precisa\b/i);
      expect(t).not.toMatch(/bem-vind[oa]|obrigad[oa]\b/i);
    }
    expect(LEVEL_TEXT.what).toBe('O nível mostra o quanto da Clarevo você já usa. Não tem a ver com quanto dinheiro você tem, e nunca desce.');
    expect(LEVEL_TEXT.next(1, 'prata')).toBe('Falta 1 marco para o nível Prata.');
    expect(LEVEL_TEXT.next(2, 'diamante')).toBe('Faltam 2 marcos para o nível Diamante.');
    expect(LEVEL_TEXT.celebrateTitle('ouro')).toBe('Sua conta chegou ao nível Ouro!');
    for (const k of ACCOUNT_MARK_KEYS) {
      const href = ACCOUNT_MARK_TEXT[k].href;
      expect(href === null || href.startsWith('/'), k).toBe(true);
    }
    expect(ACCOUNT_MARK_KEYS.filter((k) => ACCOUNT_MARK_TEXT[k].href === null)).toEqual(['tres_meses']);
  });
});

describe('níveis de conta: o repositório em memória (demonstração e testes)', () => {
  it('a demonstração tem dados de vários meses: os marcos dela dão um nível acima do Bronze, sem Telegram, importação nem Família', async () => {
    const repo = await createDemoRepository();
    const m = await repo.getAccountMarks();
    expect(m).toMatchObject({ gasto: true, recebimento: true, gasto_fixo: true, meta: true, investimento: true, importou: false, telegram: false, familia: false });
    expect(['prata', 'ouro', 'diamante']).toContain(accountLevel(m));
    expect(Object.keys(m).sort()).toEqual([...ACCOUNT_MARK_KEYS].sort());
  });
});
