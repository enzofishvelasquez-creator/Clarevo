import { describe, expect, it } from 'vitest';

import { darkColors, levelColors, lightColors } from '../../../apps/app/src/theme/palettes';

import {
  ACCOUNT_LEVELS,
  ACCOUNT_MARK_KEYS,
  ACCOUNT_MARK_TEXT,
  BASIC_MARK_KEYS,
  DEMO_LEVEL_COUNT_DAY,
  DEMO_TODAY,
  GOAL_IMAGE_KEYS,
  INVESTING_MARK_KEYS,
  LEVEL_IDLE_STEP_DAYS,
  LEVEL_INVESTING_THRESHOLD,
  LEVEL_NAME,
  LEVEL_NOTE_ACTIONS,
  LEVEL_TEXT,
  LEVEL_THRESHOLD,
  LEVEL_WARNING_DAYS,
  NO_MARKS,
  PERSONAL_ONLY_MARK_KEYS,
  accountLevel,
  accountLevelProgress,
  addDays,
  basicMarksDone,
  createDemoRepository,
  demoScenarioFrom,
  investingMarksDone,
  isAccountLevel,
  levelStateOf,
  levelWarningReminder,
  contrastRatio,
  ROUTINE_REMINDER_ID_PREFIX,
  levelToRemember,
  newOperationKey,
  nextLevelWarning,
  parseAccountLevelState,
  parseAccountMarks,
  shouldCelebrateLevel,
  shownAccountLevel,
  type AccountLevelState,
  type AccountMarks,
} from '../src';

/** Os primeiros `n` marcos do dia a dia e os primeiros `inv` de investimentos e reserva feitos, na ordem das listas. */
const marks = (n: number, inv = 0): AccountMarks =>
  ({
    ...NO_MARKS,
    ...Object.fromEntries(BASIC_MARK_KEYS.map((k, i) => [k, i < n])),
    ...Object.fromEntries(INVESTING_MARK_KEYS.map((k, i) => [k, i < inv])),
  }) as AccountMarks;

/** O estado do nível com a contagem desde `since` (e a última anotação em `last`, por padrão a mesma). */
const state = (m: AccountMarks, since: string | null, last: string | null = since): AccountLevelState => ({ marks: m, idleSince: since, lastNoteOn: last });
const TODAY = '2026-11-17';
const daysAgo = (n: number) => addDays(TODAY, -n);

describe('níveis de conta (D-095 e D-111): marcos e níveis', () => {
  it('18 marcos do dia a dia e 6 de investimentos e reserva; Prata com 4, Ouro com 9, Diamante com 14 e Esmeralda com o Diamante e 4 dos 6', () => {
    expect(BASIC_MARK_KEYS).toHaveLength(18);
    expect(INVESTING_MARK_KEYS).toHaveLength(6);
    expect(ACCOUNT_MARK_KEYS).toHaveLength(24);
    expect(new Set(ACCOUNT_MARK_KEYS).size).toBe(24);
    expect(ACCOUNT_LEVELS).toEqual(['bronze', 'prata', 'ouro', 'diamante', 'esmeralda']);
    expect(LEVEL_THRESHOLD).toEqual({ bronze: 0, prata: 4, ouro: 9, diamante: 14, esmeralda: 14 });
    expect(LEVEL_INVESTING_THRESHOLD).toEqual({ bronze: 0, prata: 0, ouro: 0, diamante: 0, esmeralda: 4 });
    expect([0, 3, 4, 8, 9, 13, 14, 18].map((n) => accountLevel(marks(n)))).toEqual(['bronze', 'bronze', 'prata', 'prata', 'ouro', 'ouro', 'diamante', 'diamante']);
    expect(basicMarksDone(NO_MARKS)).toBe(0);
    expect(investingMarksDone(marks(18, 6))).toBe(6);
    expect(accountLevel(NO_MARKS)).toBe('bronze');
  });

  it('a Esmeralda pede o Diamante: os marcos de investimentos e reserva sozinhos não mudam o nível de baixo', () => {
    expect(accountLevel(marks(14, 3))).toBe('diamante');
    expect(accountLevel(marks(14, 4))).toBe('esmeralda');
    expect(accountLevel(marks(18, 6))).toBe('esmeralda');
    // Sem o Diamante, os 6 marcos do grupo não contam para Prata, Ouro nem Diamante (quem já tinha nível não sobe nem desce por eles).
    expect(accountLevel(marks(13, 6))).toBe('ouro');
    expect(accountLevel(marks(3, 6))).toBe('bronze');
    // Investir é só do Pessoal; a reserva conta nos dois.
    expect(PERSONAL_ONLY_MARK_KEYS).toEqual(INVESTING_MARK_KEYS.filter((k) => k !== 'reserva_plano'));
  });

  it('o caminho até o próximo nível: até o Diamante pelos marcos do dia a dia; do Diamante para a Esmeralda, pelos de investimentos e reserva', () => {
    expect(accountLevelProgress(marks(0))).toMatchObject({ level: 'bronze', done: 0, total: 18, next: 'prata', missing: 4, missingGroup: 'dia_a_dia', fraction: 0 });
    expect(accountLevelProgress(marks(3))).toMatchObject({ level: 'bronze', done: 3, next: 'prata', missing: 1, fraction: 0.75 });
    expect(accountLevelProgress(marks(6, 5))).toMatchObject({ level: 'prata', done: 6, investingDone: 5, investingTotal: 6, next: 'ouro', missing: 3, fraction: 0.4 });
    expect(accountLevelProgress(marks(15, 1))).toMatchObject({ level: 'diamante', done: 15, next: 'esmeralda', missing: 3, missingGroup: 'investimentos', fraction: 0.25 });
    expect(accountLevelProgress(marks(15, 5))).toEqual({
      level: 'esmeralda',
      done: 15,
      total: 18,
      investingDone: 5,
      investingTotal: 6,
      next: null,
      missing: 0,
      missingGroup: null,
      fraction: 1,
    });
  });

  it('lê a resposta do banco: só `true` conta, marco desconhecido é ignorado e o que não é objeto vira erro', () => {
    expect(parseAccountMarks({ gasto: true, meta: 'true', recebimento: 1, novo_marco: true, inv_plano: true })).toEqual({ ...NO_MARKS, gasto: true, inv_plano: true });
    expect(parseAccountMarks({})).toEqual(NO_MARKS);
    for (const bad of [null, undefined, 'x', 3, [true]]) expect(() => parseAccountMarks(bad)).toThrow('marcos_invalidos');
    expect(isAccountLevel('esmeralda')).toBe(true);
    expect(isAccountLevel('platina')).toBe(false);
  });

  it('lê o estado do nível (my_account_marks(true)): os marcos, o começo da contagem e a última anotação; dia inválido vira nulo', () => {
    expect(parseAccountLevelState({ marks: { gasto: true }, idle_since: '2026-08-23', last_note_on: '2026-05-20' })).toEqual({
      marks: { ...NO_MARKS, gasto: true },
      idleSince: '2026-08-23',
      lastNoteOn: '2026-05-20',
    });
    expect(parseAccountLevelState({ marks: {}, idle_since: '2026-02-30', last_note_on: 12 })).toEqual({ marks: NO_MARKS, idleSince: null, lastNoteOn: null });
    expect(parseAccountLevelState({ marks: {} })).toEqual(levelStateOf(NO_MARKS));
    for (const bad of [null, 'x', [], { idle_since: '2026-01-01' }]) expect(() => parseAccountLevelState(bad)).toThrow('marcos_invalidos');
  });
});

describe('níveis de conta (D-111): a queda por tempo sem anotar', () => {
  it('desce um degrau a cada 60 dias desde o começo da contagem, nunca abaixo do Bronze; os marcos não mudam', () => {
    const ouro = marks(10);
    const at = (n: number) => shownAccountLevel(state(ouro, daysAgo(n)), TODAY);
    expect(LEVEL_IDLE_STEP_DAYS).toBe(60);
    expect(at(0)).toMatchObject({ level: 'ouro', marksLevel: 'ouro', stepsDown: 0, warning: null });
    expect(at(59)).toMatchObject({ level: 'ouro', stepsDown: 0 });
    expect(at(60)).toMatchObject({ level: 'prata', marksLevel: 'ouro', stepsDown: 1 });
    expect(at(119)).toMatchObject({ level: 'prata', stepsDown: 1 });
    expect(at(120)).toMatchObject({ level: 'bronze', stepsDown: 2 });
    expect(at(400)).toMatchObject({ level: 'bronze', stepsDown: 2, warning: null });
    // Da Esmeralda ao Bronze são quatro degraus (240 dias).
    expect(shownAccountLevel(state(marks(18, 6), daysAgo(239)), TODAY).level).toBe('prata');
    expect(shownAccountLevel(state(marks(18, 6), daysAgo(240)), TODAY).level).toBe('bronze');
  });

  it('sem a contagem (banco sem a migração) ou com um dia inválido, o nível é o dos marcos, sem aviso', () => {
    expect(shownAccountLevel(levelStateOf(marks(14)), TODAY)).toEqual({ level: 'diamante', marksLevel: 'diamante', stepsDown: 0, warning: null });
    expect(shownAccountLevel(state(marks(14), 'ontem'), TODAY).stepsDown).toBe(0);
    expect(shownAccountLevel(state(marks(14), daysAgo(90)), 'hoje').stepsDown).toBe(0);
    // Um começo no futuro (relógio do aparelho atrasado) conta como zero dias.
    expect(shownAccountLevel(state(marks(14), addDays(TODAY, 3)), TODAY)).toMatchObject({ stepsDown: 0, warning: null });
  });

  it('o aviso: do 45º ao 59º dia (e do 105º ao 119º...), com quantos dias faltam, de qual para qual nível e uma chave por degrau', () => {
    const ouro = marks(10);
    const w = (n: number) => shownAccountLevel(state(ouro, daysAgo(n)), TODAY).warning;
    expect(LEVEL_WARNING_DAYS).toBe(15);
    expect(w(44)).toBeNull();
    expect(w(45)).toEqual({ idleDays: 45, daysLeft: 15, from: 'ouro', to: 'prata', restores: null, key: `${daysAgo(45)}|1` });
    expect(w(59)).toMatchObject({ daysLeft: 1, from: 'ouro', to: 'prata' });
    expect(w(60)).toBeNull();
    expect(w(104)).toBeNull();
    expect(w(105)).toEqual({ idleDays: 105, daysLeft: 15, from: 'prata', to: 'bronze', restores: 'ouro', key: `${daysAgo(105)}|2` });
    // No Bronze não há para onde descer: nenhum aviso.
    expect(w(165)).toBeNull();
    expect(shownAccountLevel(state(marks(2), daysAgo(50)), TODAY).warning).toBeNull();
  });

  it('o texto do aviso conta da última anotação (quem já estava parado quando a regra chegou); a queda, da contagem', () => {
    // Parado desde 20/05; a regra chegou em 23/08 (primeira leitura do app com a regra): em 07/10, 45 dias de contagem e 140 sem anotar.
    const s = state(marks(4), '2026-08-23', '2026-05-20');
    const shown = shownAccountLevel(s, '2026-10-07');
    expect(shown).toMatchObject({ level: 'prata', stepsDown: 0 });
    expect(shown.warning).toMatchObject({ idleDays: 140, daysLeft: 15, from: 'prata', to: 'bronze' });
    expect(LEVEL_TEXT.warning(shown.warning!)).toBe(
      'Faz 140 dias que nada é anotado. Em 15 dias, o nível passa de Prata para Bronze. Anotar um gasto ou recebimento mantém o nível.',
    );
    // Sem anotação nenhuma (marcos sem anotar), os dias contam do começo da contagem.
    expect(shownAccountLevel(state(marks(5), daysAgo(46), null), TODAY).warning?.idleDays).toBe(46);
    // Ninguém cai sem aviso: com 140 dias sem anotar e a contagem de 59, ainda no nível dos marcos, com o aviso.
    expect(shownAccountLevel(state(marks(10), daysAgo(59), daysAgo(140)), TODAY)).toMatchObject({ level: 'ouro', stepsDown: 0, warning: { daysLeft: 1 } });
  });

  it('textos do aviso, da queda e do que é o nível: o exemplo do Enzo, o singular e sem contar dias fora do aviso', () => {
    expect(LEVEL_TEXT.warning({ idleDays: 45, daysLeft: 15, from: 'ouro', to: 'prata', restores: null })).toBe(
      'Faz 45 dias que nada é anotado. Em 15 dias, o nível passa de Ouro para Prata. Anotar um gasto ou recebimento mantém o nível.',
    );
    expect(LEVEL_TEXT.warning({ idleDays: 119, daysLeft: 1, from: 'prata', to: 'bronze', restores: 'ouro' })).toBe(
      'Faz 119 dias que nada é anotado. Em 1 dia, o nível passa de Prata para Bronze. Anotar um gasto ou recebimento traz de volta o nível Ouro.',
    );
    expect(LEVEL_TEXT.below(1, 'esmeralda')).toBe(
      'Como nada foi anotado por um tempo, o nível está um degrau abaixo do que os seus marcos dão. Anotar um gasto ou recebimento traz de volta o nível Esmeralda.',
    );
    expect(LEVEL_TEXT.below(2, 'ouro')).toContain('2 degraus abaixo');
    expect(LEVEL_TEXT.below(3, 'ouro')).not.toMatch(/\d+ dias/);
    expect(LEVEL_TEXT.what).toBe(
      'O nível mostra o quanto da Clarevo você já usa e não tem a ver com quanto dinheiro você tem. O nível desce um degrau depois de 60 dias sem anotar nada e volta assim que você voltar a anotar.',
    );
    expect(LEVEL_TEXT.what).not.toMatch(/nunca desce/);
    expect(LEVEL_TEXT.warningDismiss).toBe('Agora não');
  });

  it('o lembrete local: o próximo dia em que um aviso começa (hoje inclusive), com o aviso desse dia; nada no Bronze', () => {
    const ouro = marks(10);
    expect(nextLevelWarning(state(ouro, daysAgo(0)), TODAY)).toEqual({
      date: addDays(TODAY, 45),
      warning: { idleDays: 45, daysLeft: 15, from: 'ouro', to: 'prata', restores: null, key: `${TODAY}|1` },
    });
    expect(nextLevelWarning(state(ouro, daysAgo(45)), TODAY)?.date).toBe(TODAY);
    expect(nextLevelWarning(state(ouro, daysAgo(46)), TODAY)?.date).toBe(addDays(TODAY, 59));
    expect(nextLevelWarning(state(ouro, daysAgo(46)), TODAY)?.warning).toMatchObject({ from: 'prata', to: 'bronze', restores: 'ouro' });
    // Depois do segundo degrau, o Ouro chega ao Bronze: não há próximo aviso.
    expect(nextLevelWarning(state(ouro, daysAgo(106)), TODAY)).toBeNull();
    expect(nextLevelWarning(state(marks(3), daysAgo(0)), TODAY)).toBeNull();
    expect(nextLevelWarning(levelStateOf(ouro), TODAY)).toBeNull();
  });

  it('o lembrete local no celular: no dia em que o aviso começa, no horário dos lembretes, com o texto do aviso e sem valor', () => {
    const ouro = marks(10);
    const r = levelWarningReminder(state(ouro, daysAgo(10)), TODAY, 20, 9 * 60);
    expect(r).toEqual({
      id: `${ROUTINE_REMINDER_ID_PREFIX}nivel-${addDays(TODAY, 35)}`,
      date: addDays(TODAY, 35),
      fireAt: `${addDays(TODAY, 35)}T20:00`,
      hour: 20,
      title: 'Nível da conta',
      body: 'Faz 45 dias que nada é anotado. Em 15 dias, o nível passa de Ouro para Prata. Anotar um gasto ou recebimento mantém o nível.',
      route: '/conta/nivel',
    });
    expect(r!.body).not.toMatch(/R\$/);
    // Hoje é o 45º dia: entra se o horário ainda não passou.
    expect(levelWarningReminder(state(ouro, daysAgo(45)), TODAY, 20, 19 * 60)?.date).toBe(TODAY);
    expect(levelWarningReminder(state(ouro, daysAgo(45)), TODAY, 20, 20 * 60)).toBeNull();
    // Sem contagem, no Bronze ou com hora inválida: nada.
    expect(levelWarningReminder(levelStateOf(ouro), TODAY, 20)).toBeNull();
    expect(levelWarningReminder(state(marks(2), daysAgo(10)), TODAY, 20)).toBeNull();
    expect(levelWarningReminder(state(ouro, daysAgo(10)), TODAY, 25)).toBeNull();
  });

  it('as anotações que contam: gasto ou recebimento (também no cartão, pagando conta ou fatura e importando); metas e investimentos não', () => {
    expect([...LEVEL_NOTE_ACTIONS].sort()).toEqual(['criar', 'criar_compra_cartao', 'criar_encargo_cartao', 'importar_extrato', 'pagar_compromisso', 'pagar_fatura']);
  });
});

describe('níveis de conta: a comemoração, uma vez por nível em cada aparelho', () => {
  it('só quando o nível mostrado sobe em relação ao último que o aparelho já viu; na primeira vez no aparelho, não', () => {
    expect(shouldCelebrateLevel('bronze', 'prata')).toBe(true);
    expect(shouldCelebrateLevel('bronze', 'ouro')).toBe(true);
    expect(shouldCelebrateLevel('diamante', 'esmeralda')).toBe(true);
    expect(shouldCelebrateLevel('prata', 'prata')).toBe(false);
    expect(shouldCelebrateLevel('ouro', 'prata')).toBe(false);
    expect(shouldCelebrateLevel(null, 'diamante')).toBe(false);
  });

  it('o aparelho guarda o maior nível já visto: a queda não apaga e a volta não comemora de novo', () => {
    // Primeira vez no aparelho com o nível abaixo dos marcos: guarda o dos marcos (a volta não comemora).
    expect(levelToRemember(null, { level: 'prata', marksLevel: 'ouro' })).toBe('ouro');
    // Visto Ouro; caiu para Prata: continua Ouro guardado; voltou para Ouro: nada a comemorar.
    expect(levelToRemember('ouro', { level: 'prata', marksLevel: 'ouro' })).toBe('ouro');
    expect(shouldCelebrateLevel(levelToRemember('ouro', { level: 'prata', marksLevel: 'ouro' }), 'ouro')).toBe(false);
    // Subiu de verdade: guarda o novo.
    expect(levelToRemember('ouro', { level: 'diamante', marksLevel: 'diamante' })).toBe('diamante');
  });
});

describe('níveis de conta: textos', () => {
  it('cada marco tem nome e, quase todos, para onde levar; os textos seguem as regras e nunca falam de valor', () => {
    const texts: string[] = [
      ...ACCOUNT_MARK_KEYS.map((k) => ACCOUNT_MARK_TEXT[k].title),
      ...ACCOUNT_LEVELS.flatMap((l) => [
        LEVEL_NAME[l],
        LEVEL_TEXT.level(l),
        LEVEL_TEXT.celebrateTitle(l),
        LEVEL_TEXT.celebrateBody[l],
        LEVEL_TEXT.levelFrom(l),
        LEVEL_TEXT.levelRowLabel(l, true),
      ]),
      LEVEL_TEXT.next(1, 'prata'),
      LEVEL_TEXT.next(3, 'ouro'),
      LEVEL_TEXT.nextInvesting(1, 'esmeralda'),
      LEVEL_TEXT.nextInvesting(3, 'esmeralda'),
      LEVEL_TEXT.progress(5, 18),
      LEVEL_TEXT.investingProgress(5, 6),
      LEVEL_TEXT.markDone('Criar uma meta'),
      LEVEL_TEXT.markTodo('Criar uma meta'),
      LEVEL_TEXT.warning({ idleDays: 45, daysLeft: 15, from: 'esmeralda', to: 'diamante', restores: null }),
      LEVEL_TEXT.below(1, 'esmeralda'),
      ...(Object.values(LEVEL_TEXT).filter((v) => typeof v === 'string') as string[]),
    ];
    for (const t of texts) {
      expect(t).not.toMatch(/—|–/);
      expect(t).not.toMatch(/fa(z|ç)er? sentido|faz sentido/i);
      expect(t).not.toMatch(/R\$|\brico|\briqueza|patrim[oô]nio|deveria|precisa\b|nunca desce/i);
      expect(t).not.toMatch(/bem-vind[oa]|obrigad[oa]\b|urgente|atenção|cuidado/i);
    }
    expect(LEVEL_TEXT.next(1, 'prata')).toBe('Falta 1 marco para o nível Prata.');
    expect(LEVEL_TEXT.next(2, 'diamante')).toBe('Faltam 2 marcos para o nível Diamante.');
    expect(LEVEL_TEXT.nextInvesting(2, 'esmeralda')).toBe('Faltam 2 marcos de investimentos e reserva para o nível Esmeralda.');
    expect(LEVEL_TEXT.celebrateTitle('esmeralda')).toBe('Sua conta chegou ao nível Esmeralda!');
    expect(LEVEL_TEXT.levelFrom('esmeralda')).toBe('A partir do Diamante e de 4 dos 6 marcos de investimentos e reserva');
    expect(LEVEL_TEXT.levelRowLabel('esmeralda', false)).toBe('Esmeralda, a partir do Diamante e de 4 dos 6 marcos de investimentos e reserva');
    expect(LEVEL_TEXT.levelRowLabel('ouro', true)).toBe('Ouro, a partir de 9 marcos, seu nível');
    expect(LEVEL_TEXT.levelRowLabel('bronze', false)).toBe('Bronze, toda conta começa aqui');
    expect(LEVEL_TEXT.investingIntro).toBe('Para o nível Esmeralda: com o Diamante, 4 destes 6 marcos. Eles contam pelo uso, nunca pelo valor.');
    for (const k of ACCOUNT_MARK_KEYS) {
      const href = ACCOUNT_MARK_TEXT[k].href;
      expect(href === null || href.startsWith('/'), k).toBe(true);
    }
    expect(ACCOUNT_MARK_KEYS.filter((k) => ACCOUNT_MARK_TEXT[k].href === null)).toEqual(['tres_meses']);
  });

  it('cada nível tem a sua cor, diferente das outras, e a medalha escura passa de 4,5:1 sobre ela nos dois temas', () => {
    expect(Object.keys(levelColors)).toEqual([...ACCOUNT_LEVELS]);
    expect(new Set(Object.values(levelColors)).size).toBe(ACCOUNT_LEVELS.length);
    for (const palette of [lightColors, darkColors]) {
      for (const l of ACCOUNT_LEVELS) expect(contrastRatio(palette.textOnAccent, levelColors[l]), l).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('o Diamante é alcançável sem cartão, sem investimento, sem dinheiro guardado em meta e sem Família', () => {
    const without = new Set(['cartao', 'investimento', 'aporte', 'familia']);
    const possible = BASIC_MARK_KEYS.filter((k) => !without.has(k)).length;
    expect(possible).toBeGreaterThanOrEqual(LEVEL_THRESHOLD.diamante);
  });
});

describe('níveis de conta: o repositório em memória (demonstração e testes)', () => {
  it('a demonstração: 13 marcos do dia a dia (Ouro) e 5 de investimentos e reserva (sem rendimento registrado)', async () => {
    const repo = await createDemoRepository();
    const m = await repo.getAccountMarks();
    expect(m).toMatchObject({ gasto: true, recebimento: true, gasto_fixo: true, meta: true, investimento: true, importou: false, telegram: false, familia: false });
    expect(m).toMatchObject({ inv_aporte: true, inv_valor: true, inv_rendimento: false, inv_plano: true, inv_meta: true, reserva_plano: true });
    expect(basicMarksDone(m)).toBe(13);
    expect(accountLevel(m)).toBe('ouro');
    expect(Object.keys(m).sort()).toEqual([...ACCOUNT_MARK_KEYS].sort());
  });

  it('escolher a imagem de uma meta leva a demonstração do Ouro à Esmeralda (14 do dia a dia e 5 do grupo)', async () => {
    const repo = await createDemoRepository();
    const space = (await repo.getSpace())!;
    const goal = (await repo.listGoals(space.personalContextId)).find((g) => g.name === 'Viagem de férias')!;
    await repo.setGoalImage(newOperationKey(), goal.id, 0, { kind: 'sugestao', key: GOAL_IMAGE_KEYS[0]! });
    const s = await repo.getAccountLevel();
    expect(accountLevel(s.marks)).toBe('esmeralda');
    expect(shownAccountLevel(s, DEMO_TODAY)).toMatchObject({ level: 'esmeralda', stepsDown: 0, warning: null });
  });

  it('o nível volta ao que os marcos dão: o marco alcançado fica guardado, mesmo se o que o fez some', async () => {
    const repo = await createDemoRepository();
    const before = await repo.getAccountMarks();
    expect(before.meta).toBe(true);
    // Como a limpeza dos excluídos e a Família apagada no banco: o que fez o marco some do repositório.
    const internals = repo as unknown as { goals: Map<string, unknown>; operations: Map<string, unknown> };
    internals.goals.clear();
    internals.operations.clear();
    const after = await repo.getAccountMarks();
    expect(after).toEqual(before);
  });

  it('a contagem: começa na primeira leitura do nível; a última anotação vem das operações e fica guardada', async () => {
    let today = '2026-10-07';
    const { MemoryRepository } = await import('../src/memory-repository');
    const repo = new MemoryRepository({ actorId: 'p1', displayName: 'Teste', today: () => today });
    const space = await repo.ensurePersonalSpace('Conta principal');
    const ctx = space.personalContextId;
    const acc = space.accounts[0]!.id;
    // Conta nova: a contagem começa hoje, sem anotação.
    expect(await repo.getAccountLevel()).toMatchObject({ idleSince: '2026-10-07', lastNoteOn: null });
    // Uma meta não é anotação de gasto ou recebimento.
    today = '2026-10-20';
    await repo.createGoal(newOperationKey(), ctx, {
      goalType: 'objetivo', name: 'Viagem', targetCents: 100_000, targetMonth: null, plannedMonthlyCents: null,
      essentialBaseCents: null, essentialMonths: null, essentialBaseSource: null, initialCents: null, initialOn: null,
    });
    expect(await repo.getAccountLevel()).toMatchObject({ idleSince: '2026-10-07', lastNoteOn: null });
    // Um gasto é.
    await repo.createRecord(newOperationKey(), ctx, 'despesa', { accountId: acc, amountCents: 1000, occurredOn: '2026-10-20', description: 'Pão', category: 'Mercado' });
    expect(await repo.getAccountLevel()).toMatchObject({ idleSince: '2026-10-20', lastNoteOn: '2026-10-20' });
    // As operações somem (limpeza): a última anotação fica guardada.
    (repo as unknown as { operations: Map<string, unknown> }).operations.clear();
    today = '2027-01-10';
    expect(await repo.getAccountLevel()).toMatchObject({ idleSince: '2026-10-20', lastNoteOn: '2026-10-20' });
  });

  it("o cenário 'nivel' (?cenario=nivel): parado desde 20/05, contagem desde 23/08; em 07/10, o aviso de Prata para Bronze, que some ao anotar", async () => {
    expect(demoScenarioFrom('nivel')).toBe('nivel');
    expect(DEMO_LEVEL_COUNT_DAY).toBe('2026-08-23');
    const repo = await createDemoRepository({ scenario: 'nivel' });
    const s = await repo.getAccountLevel();
    expect(s).toMatchObject({ idleSince: '2026-08-23', lastNoteOn: '2026-05-20' });
    const shown = shownAccountLevel(s, DEMO_TODAY);
    expect(shown).toMatchObject({ level: 'prata', marksLevel: 'prata', stepsDown: 0 });
    expect(LEVEL_TEXT.warning(shown.warning!)).toBe(
      'Faz 140 dias que nada é anotado. Em 15 dias, o nível passa de Prata para Bronze. Anotar um gasto ou recebimento mantém o nível.',
    );
    const space = (await repo.getSpace())!;
    await repo.createRecord(newOperationKey(), space.personalContextId, 'despesa', {
      accountId: space.accounts[0]!.id,
      amountCents: 2500,
      occurredOn: DEMO_TODAY,
      description: 'Padaria',
      category: 'Mercado',
    });
    const after = shownAccountLevel(await repo.getAccountLevel(), DEMO_TODAY);
    expect(after).toMatchObject({ level: 'prata', stepsDown: 0, warning: null });
  });

  it("o cenário 'retorno' segue sem aviso nem queda: a contagem começa na primeira leitura, em 07/10", async () => {
    const repo = await createDemoRepository({ scenario: 'retorno' });
    const s = await repo.getAccountLevel();
    expect(s).toMatchObject({ idleSince: DEMO_TODAY, lastNoteOn: '2026-05-20' });
    expect(shownAccountLevel(s, DEMO_TODAY)).toMatchObject({ stepsDown: 0, warning: null });
  });
});
