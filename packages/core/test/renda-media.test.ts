import { describe, expect, it } from 'vitest';
import {
  INCOME_AVERAGE_CHOICES,
  INCOME_AVERAGE_DEFAULT_CHOICE,
  INCOME_AVERAGE_TEXT,
  MemoryFamilyHub,
  MemoryRepository,
  comparisonStats,
  evolutionPoints,
  incomeAverage,
  incomeAverageTextSamples,
  incomeAverageTexts,
  incomeAverageWindow,
  isIncomeAverageChoice,
  isRepoError,
  loadIncomeAverage,
  newOperationKey,
  type IncomeAverageChoice,
  type IncomeAverageOutcome,
  type IsoMonth,
  type MonthOverview,
  type RepoErrorCode,
} from '../src';

/**
 * Renda variável (D-062 item 2, Ciclo V): "Calcular pela média" no formulário da renda de referência. A média do Recebido dos 3 ou dos 6
 * meses fechados antes do mês de hoje, com as regras da Evolução (D04, D-060): entra o mês com recebimentos e o mês conferido como zero;
 * fica de fora o mês atual e o mês sem registros. A conta é a exata de `comparisonStats` (metade para cima no centavo).
 */

const row = (month: string, receivedCents = 0, over: Partial<MonthOverview> = {}): MonthOverview => ({
  month,
  receivedCount: receivedCents > 0 ? 2 : 0,
  receivedCents,
  paidCount: 0,
  paidCents: 0,
  receivedChecked: false,
  paidChecked: false,
  receivedCheckVersion: 0,
  paidCheckVersion: 0,
  cardPurchaseCount: 0,
  ...over,
});

const NOW = '2026-10';

function ok(outcome: IncomeAverageOutcome) {
  if (!outcome.ok) throw new Error(`esperava média, veio ${outcome.reason}`);
  return outcome;
}

async function expectCode(p: Promise<unknown>, code: RepoErrorCode) {
  let error: unknown = null;
  try {
    await p;
  } catch (e) {
    error = e;
  }
  expect(isRepoError(error, code), `esperava ${code}`).toBe(true);
}

describe('a janela: 3 ou 6 meses fechados, nunca o mês atual', () => {
  it('os meses, do mais antigo ao mais recente, terminam no mês anterior ao de hoje', () => {
    expect(incomeAverageWindow('2026-10', 3)).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(incomeAverageWindow('2026-10', 6)).toEqual(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
    // Virada de ano: os meses de 2026 contam para quem está em janeiro ou fevereiro de 2027.
    expect(incomeAverageWindow('2027-01', 3)).toEqual(['2026-10', '2026-11', '2026-12']);
    expect(incomeAverageWindow('2027-02', 6)).toEqual(['2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01']);
    expect(incomeAverageWindow('2026-01', 3)).toEqual(['2025-10', '2025-11', '2025-12']);
  });

  it('só 3 e 6 valem; o padrão é 3; mês atual inválido lança RangeError', () => {
    expect(INCOME_AVERAGE_CHOICES).toEqual([3, 6]);
    expect(INCOME_AVERAGE_DEFAULT_CHOICE).toBe(3);
    for (const bad of [0, 1, 2, 4, 5, 12, -3, 3.5, '3', null, undefined, NaN]) {
      expect(isIncomeAverageChoice(bad), String(bad)).toBe(false);
      expect(() => incomeAverageWindow(NOW, bad as never)).toThrow(RangeError);
      expect(() => incomeAverage([], bad as never, NOW)).toThrow(RangeError);
    }
    for (const bad of ['2026-13', '2026-00', '2026-1', '', 'outubro']) expect(() => incomeAverageWindow(bad, 3)).toThrow(RangeError);
  });
});

describe('incomeAverage: a média exata do Recebido', () => {
  const jas = [row('2026-07', 430_000), row('2026-08', 620_000), row('2026-09', 510_000)];

  it('três meses com recebimentos: média R$ 5.200,00, "3 de 3" (o exemplo de Aprender)', () => {
    const out = ok(incomeAverage(jas, 3, NOW));
    expect(out).toMatchObject({ ok: true, choice: 3, averageCents: 520_000, included: ['2026-07', '2026-08', '2026-09'], excluded: [], zeroConfirmed: [] });
    expect(out.window).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(out.points.map((p) => [p.month, p.cents, p.state])).toEqual([
      ['2026-07', 430_000, 'com_registros'],
      ['2026-08', 620_000, 'com_registros'],
      ['2026-09', 510_000, 'com_registros'],
    ]);
  });

  it('mês sem registros fica de fora e não puxa a média para baixo: "2 de 3"', () => {
    const out = ok(incomeAverage([row('2026-07', 430_000), row('2026-08'), row('2026-09', 510_000)], 3, NOW));
    expect(out).toMatchObject({ averageCents: 470_000, included: ['2026-07', '2026-09'], excluded: ['2026-08'], zeroConfirmed: [] });
  });

  it('mês sem linha vale "sem registros" (nunca um zero conferido); linhas fora da janela e do mês atual são ignoradas', () => {
    const out = ok(incomeAverage([row('2026-09', 510_000), row('2026-10', 99_999_999), row('2026-03', 1_000_000), row('2025-12', 7_000_000)], 3, NOW));
    expect(out).toMatchObject({ averageCents: 510_000, included: ['2026-09'], excluded: ['2026-07', '2026-08'] });
    // Linhas fora de ordem: o resultado é o mesmo.
    const shuffled = [row('2026-09', 510_000), row('2026-07', 430_000), row('2026-08', 620_000)];
    expect(ok(incomeAverage(shuffled, 3, NOW)).averageCents).toBe(520_000);
  });

  it('zero confirmado (D-060) entra como zero e puxa a média: (4.300 + 0 + 5.100) ÷ 3 = R$ 3.133,33', () => {
    const out = ok(incomeAverage([row('2026-07', 430_000), row('2026-08', 0, { receivedChecked: true, receivedCheckVersion: 1 }), row('2026-09', 510_000)], 3, NOW));
    expect(out).toMatchObject({ averageCents: 313_333, included: ['2026-07', '2026-08', '2026-09'], excluded: [], zeroConfirmed: ['2026-08'] });
    expect(out.points[1]).toEqual({ month: '2026-08', cents: 0, count: 0, state: 'zero_confirmado' });
  });

  it('a marca de Pago não vale para o Recebido; a marca de Recebido com registro no mês não conta; só o mês fechado vale', () => {
    // Pago conferido em agosto não confere o Recebido.
    expect(ok(incomeAverage([row('2026-07', 430_000), row('2026-08', 0, { paidChecked: true }), row('2026-09', 510_000)], 3, NOW))).toMatchObject({ included: ['2026-07', '2026-09'], excluded: ['2026-08'], zeroConfirmed: [] });
    // Registro vence a marca (o banco devolve receivedChecked falso, e a conta confere com a contagem).
    expect(ok(incomeAverage([row('2026-07', 430_000, { receivedChecked: true }), row('2026-08'), row('2026-09')], 3, NOW))).toMatchObject({ averageCents: 430_000, zeroConfirmed: [] });
    // Mês atual com a marca no dado: fora da janela, não entra.
    expect(ok(incomeAverage([row('2026-09', 510_000), row('2026-10', 0, { receivedChecked: true })], 3, NOW)).zeroConfirmed).toEqual([]);
  });

  it('só meses conferidos como zero, ou nenhum mês com recebimentos: não há média ("sem_meses")', () => {
    const none = incomeAverage([], 3, NOW);
    expect(none).toMatchObject({ ok: false, reason: 'sem_meses', choice: 3, excluded: ['2026-07', '2026-08', '2026-09'] });
    expect('averageCents' in none).toBe(false);
    const zeros = incomeAverage([row('2026-07', 0, { receivedChecked: true }), row('2026-08', 0, { receivedChecked: true }), row('2026-09')], 3, NOW);
    expect(zeros).toMatchObject({ ok: false, reason: 'sem_meses', excluded: ['2026-09'] });
    // Um mês só com recebimentos basta.
    expect(ok(incomeAverage([row('2026-07', 0, { receivedChecked: true }), row('2026-09', 100)], 3, NOW)).averageCents).toBe(50);
  });

  it('arredondamento em centavos, metade para cima, sem ponto flutuante', () => {
    // 301 ÷ 3 = 100,33...: 100.
    expect(ok(incomeAverage([row('2026-07', 100), row('2026-08', 100), row('2026-09', 101)], 3, NOW)).averageCents).toBe(100);
    // 302 ÷ 3 = 100,67: 101.
    expect(ok(incomeAverage([row('2026-07', 100), row('2026-08', 101), row('2026-09', 101)], 3, NOW)).averageCents).toBe(101);
    // 3 ÷ 2 = 1,5: metade para cima, 2.
    expect(ok(incomeAverage([row('2026-07', 1), row('2026-08', 2)], 3, NOW)).averageCents).toBe(2);
    // Dois meses de R$ 0,01 e um zero conferido: 2 ÷ 3 = 0,67: 1.
    expect(ok(incomeAverage([row('2026-07', 1), row('2026-08', 1), row('2026-09', 0, { receivedChecked: true })], 3, NOW)).averageCents).toBe(1);
    // 1 ÷ 3 = 0,33 arredonda para zero, e a referência não pode ser zero: não há valor para preencher.
    expect(incomeAverage([row('2026-07', 1), row('2026-08', 0, { receivedChecked: true }), row('2026-09', 0, { receivedChecked: true })], 3, NOW)).toMatchObject({ ok: false, reason: 'sem_meses' });
    // Com seis meses: 6 ÷ 6 = 1 e 7 ÷ 6 = 1,17 dão 1; 9 ÷ 6 = 1,5 dá 2.
    const six = (cents: number[]) => cents.map((c, i) => row(`2026-0${4 + i}`, c));
    expect(ok(incomeAverage(six([1, 1, 1, 1, 1, 2]), 6, NOW)).averageCents).toBe(1);
    expect(ok(incomeAverage(six([1, 1, 1, 2, 2, 2]), 6, NOW)).averageCents).toBe(2);
  });

  it('valores grandes ficam exatos (soma em bigint) e nunca passam de um inteiro seguro', () => {
    const big = 999_999_999;
    const out = ok(incomeAverage([row('2026-07', big), row('2026-08', big), row('2026-09', big - 1)], 3, NOW));
    expect(out.averageCents).toBe(999_999_999 - 0); // (3·999.999.999 − 1) ÷ 3 = 999.999.998,67 → 999.999.999
    expect(Number.isSafeInteger(out.averageCents)).toBe(true);
    const huge = Number.MAX_SAFE_INTEGER;
    // Soma maior que o inteiro seguro: a conta é feita em bigint, e a média volta a caber.
    expect(ok(incomeAverage([row('2026-07', huge), row('2026-08', huge), row('2026-09', huge)], 3, NOW)).averageCents).toBe(huge);
  });

  it('seis meses: a janela é de abril a setembro e a média usa só os que têm recebimentos (o cenário da Evolução)', () => {
    // Janeiro a junho do cenário "evolucao": 5.000, 5.000, sem março, 5.200, 5.000 e 5.100; hoje é 07/10/2026.
    const evolucao = [row('2026-01', 500_000), row('2026-02', 500_000), row('2026-03'), row('2026-04', 520_000), row('2026-05', 500_000), row('2026-06', 510_000)];
    // Três meses (julho a setembro): nada anotado.
    expect(incomeAverage(evolucao, 3, NOW)).toMatchObject({ ok: false, reason: 'sem_meses' });
    // Seis meses (abril a setembro): abril, maio e junho entram; julho, agosto e setembro ficam de fora. 15.300,00 ÷ 3 = 5.100,00.
    const six = ok(incomeAverage(evolucao, 6, NOW));
    expect(six).toMatchObject({ averageCents: 510_000, included: ['2026-04', '2026-05', '2026-06'], excluded: ['2026-07', '2026-08', '2026-09'] });
    // Julho conferido como zero entra: 15.300,00 ÷ 4 = 3.825,00.
    const withJuly = [...evolucao, row('2026-07', 0, { receivedChecked: true })];
    expect(ok(incomeAverage(withJuly, 6, NOW))).toMatchObject({ averageCents: 382_500, included: ['2026-04', '2026-05', '2026-06', '2026-07'], zeroConfirmed: ['2026-07'], excluded: ['2026-08', '2026-09'] });
  });

  it('virada de ano: em janeiro de 2027, os três meses são outubro, novembro e dezembro de 2026', () => {
    const rows = [row('2026-09', 900_000), row('2026-10', 400_000), row('2026-11', 500_000), row('2026-12', 600_000), row('2027-01', 9_000_000)];
    expect(ok(incomeAverage(rows, 3, '2027-01'))).toMatchObject({ averageCents: 500_000, included: ['2026-10', '2026-11', '2026-12'] });
    // Seis meses em fevereiro de 2027: agosto a janeiro; setembro (900.000) entra, janeiro (9.000.000) também, fevereiro nunca.
    const six = ok(incomeAverage([...rows, row('2027-02', 99_999)], 6, '2027-02'));
    expect(six.window).toEqual(['2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01']);
    expect(six.included).toEqual(['2026-09', '2026-10', '2026-11', '2026-12', '2027-01']);
    expect(six.excluded).toEqual(['2026-08']);
    expect(six.averageCents).toBe(Math.round((900_000 + 400_000 + 500_000 + 600_000 + 9_000_000) / 5));
  });

  it('é a mesma conta da Evolução (comparisonStats) e não altera as linhas recebidas', () => {
    const rows = [row('2026-04', 331_117), row('2026-05', 0, { receivedChecked: true }), row('2026-06', 280_005), row('2026-07'), row('2026-08', 777_777), row('2026-09', 123_457)];
    const copy = JSON.parse(JSON.stringify(rows)) as MonthOverview[];
    const out = ok(incomeAverage(rows, 6, NOW));
    const stats = comparisonStats(evolutionPoints(rows, 'recebido', NOW), []);
    expect(out.averageCents).toBe(stats.average);
    expect(out.included).toEqual(stats.visibleMonths);
    expect(rows).toEqual(copy);
  });

  it('linha impossível lança RangeError (mês repetido, mês inválido, valor negativo ou quebrado), nunca uma média', () => {
    expect(() => incomeAverage([row('2026-08', 100), row('2026-08', 200)], 3, NOW)).toThrow(RangeError);
    expect(() => incomeAverage([row('2026-13', 100)], 3, NOW)).toThrow(RangeError);
    expect(() => incomeAverage([row('2026-08', -100, { receivedCount: 1 })], 3, NOW)).toThrow(RangeError);
    expect(() => incomeAverage([row('2026-08', 10.5, { receivedCount: 1 })], 3, NOW)).toThrow(RangeError);
    expect(() => incomeAverage([], 3, '2026-13')).toThrow(RangeError);
  });
});

describe('loadIncomeAverage: a leitura de months_overview do contexto escolhido', () => {
  async function harness() {
    const hub = new MemoryFamilyHub({ now: () => Date.parse('2026-10-07T12:00:00.000Z') });
    const mk = async (id: string) => {
      const repo = new MemoryRepository({ actorId: id, displayName: id, today: () => '2026-10-07', family: hub });
      const space = await repo.ensurePersonalSpace('Conta principal');
      return { repo, ctx: space.personalContextId, acc: space.accounts[0]!.id };
    };
    return { mk };
  }
  const receive = (who: { repo: MemoryRepository; acc: string }, ctx: string, amountCents: number, occurredOn: string, category: string | null = 'Salário') =>
    who.repo.createRecord(newOperationKey(), ctx, 'receita', { accountId: who.acc, amountCents, occurredOn, description: 'Recebimento', category });

  it('Pessoal: lê só os meses da janela e calcula (mês atual e gastos ficam de fora)', async () => {
    const { mk } = await harness();
    const ana = await mk('ana');
    await receive(ana, ana.ctx, 430_000, '2026-07-05');
    await receive(ana, ana.ctx, 620_000, '2026-08-05');
    await receive(ana, ana.ctx, 300_000, '2026-08-20');
    await receive(ana, ana.ctx, 510_000, '2026-09-05');
    await receive(ana, ana.ctx, 800_000, '2026-10-05');
    await ana.repo.createRecord(newOperationKey(), ana.ctx, 'despesa', { accountId: ana.acc, amountCents: 999_999, occurredOn: '2026-09-10', description: 'Gasto', category: null });
    const out = ok(await loadIncomeAverage(ana.repo, ana.ctx, NOW, 3));
    // Agosto soma 9.200,00 (6.200,00 + 3.000,00): (4.300,00 + 9.200,00 + 5.100,00) ÷ 3 = 6.200,00.
    expect(out).toMatchObject({ averageCents: 620_000, included: ['2026-07', '2026-08', '2026-09'] });
    expect(out.points.find((p) => p.month === '2026-08')).toMatchObject({ cents: 920_000, count: 2 });
  });

  it('o mês conferido como zero (set_month_check) entra, e desfazer a conferência tira', async () => {
    const { mk } = await harness();
    const ana = await mk('ana');
    await receive(ana, ana.ctx, 430_000, '2026-07-05');
    await receive(ana, ana.ctx, 510_000, '2026-09-05');
    expect(ok(await loadIncomeAverage(ana.repo, ana.ctx, NOW, 3))).toMatchObject({ averageCents: 470_000, excluded: ['2026-08'] });
    const mark = await ana.repo.setMonthCheck(newOperationKey(), ana.ctx, '2026-08', 'recebimentos', 0);
    expect(ok(await loadIncomeAverage(ana.repo, ana.ctx, NOW, 3))).toMatchObject({ averageCents: 313_333, zeroConfirmed: ['2026-08'], excluded: [] });
    await ana.repo.clearMonthCheck(newOperationKey(), ana.ctx, '2026-08', 'recebimentos', mark.version);
    expect(ok(await loadIncomeAverage(ana.repo, ana.ctx, NOW, 3))).toMatchObject({ averageCents: 470_000, excluded: ['2026-08'] });
    // Registro no mês conferido: a marca deixa de valer, o registro entra.
    await ana.repo.setMonthCheck(newOperationKey(), ana.ctx, '2026-08', 'recebimentos', 2);
    await receive(ana, ana.ctx, 100_000, '2026-08-10');
    expect(ok(await loadIncomeAverage(ana.repo, ana.ctx, NOW, 3))).toMatchObject({ averageCents: 346_667, zeroConfirmed: [], excluded: [] });
  });

  it('Família: usa o contexto escolhido, sem misturar com o Pessoal; quem é de fora recebe sem_permissao', async () => {
    const { mk } = await harness();
    const vera = await mk('vera');
    const mauro = await mk('mauro');
    const nina = await mk('nina');
    const otto = await mk('otto');
    const fam = (await vera.repo.createFamily(newOperationKey(), 'Casa')).context.id;
    await mauro.repo.acceptFamilyInvite(newOperationKey(), (await vera.repo.createFamilyInvite(newOperationKey(), fam, 'membro')).code!);
    await nina.repo.acceptFamilyInvite(newOperationKey(), (await vera.repo.createFamilyInvite(newOperationKey(), fam, 'leitor')).code!);
    const famAcc = (await vera.repo.listAccounts(fam))[0]!.id;
    for (const [amount, on] of [[800_000, '2026-07-05'], [1_000_000, '2026-08-05'], [900_000, '2026-09-05']] as const) {
      await vera.repo.createRecord(newOperationKey(), fam, 'receita', { accountId: famAcc, amountCents: amount, occurredOn: on, description: 'Renda da casa', category: null });
    }
    await receive(vera, vera.ctx, 100_000, '2026-09-05');
    const family = ok(await loadIncomeAverage(vera.repo, fam, NOW, 3));
    expect(family).toMatchObject({ averageCents: 900_000, included: ['2026-07', '2026-08', '2026-09'] });
    expect(ok(await loadIncomeAverage(vera.repo, vera.ctx, NOW, 3))).toMatchObject({ averageCents: 100_000, included: ['2026-09'], excluded: ['2026-07', '2026-08'] });
    // O Pessoal da Vera não é de ninguém mais, e quem é de fora nem lê a Família (a leitura de outra pessoa da Família, com os registros
    // da casa, é coberta pela API real: na memória cada pessoa tem os próprios registros).
    await expectCode(loadIncomeAverage(nina.repo, vera.ctx, NOW, 3), 'sem_permissao');
    await expectCode(loadIncomeAverage(otto.repo, fam, NOW, 3), 'sem_permissao');
    // Seis meses na Família: a mesma leitura mais larga.
    expect(ok(await loadIncomeAverage(vera.repo, fam, NOW, 6))).toMatchObject({ averageCents: 900_000, excluded: ['2026-04', '2026-05', '2026-06'] });
  });

  it('só lê: pede um único months_overview, dos meses da janela, e nenhuma escrita; a falha da leitura passa como veio', async () => {
    const calls: unknown[][] = [];
    const fake = {
      monthsOverview: async (...args: unknown[]) => {
        calls.push(args);
        return [row('2026-09', 510_000)];
      },
    };
    expect(ok(await loadIncomeAverage(fake, 'ctx', NOW, 3)).averageCents).toBe(510_000);
    expect(ok(await loadIncomeAverage(fake, 'ctx', NOW, 6)).averageCents).toBe(510_000);
    expect(calls).toEqual([
      ['ctx', '2026-07', '2026-09'],
      ['ctx', '2026-04', '2026-09'],
    ]);
    const boom = new Error('rede caiu');
    await expect(loadIncomeAverage({ monthsOverview: async () => Promise.reject(boom) }, 'ctx', NOW, 3)).rejects.toBe(boom);
    // Janela inválida nem chega a ler.
    await expect(loadIncomeAverage(fake, 'ctx', NOW, 4 as IncomeAverageChoice)).rejects.toBeInstanceOf(RangeError);
    expect(calls).toHaveLength(2);
  });
});

describe('os textos do resultado', () => {
  const T = INCOME_AVERAGE_TEXT;

  it('as frases pedidas pela especificação, com os meses e a contagem', () => {
    const all = incomeAverageTexts(incomeAverage([row('2026-07', 430_000), row('2026-08', 620_000), row('2026-09', 510_000)], 3, NOW));
    expect(all).toEqual({
      headline: 'Média de julho a setembro: R$ 5.200,00',
      count: 'Meses usados: 3 de 3',
      zero: null,
      basis: 'Entram todos os recebimentos anotados no mês, inclusive reembolsos.',
      notice: 'É uma estimativa feita com o que você anotou. Ajuste se souber que o próximo mês será diferente.',
      filled: 'O valor foi para o campo "Valor por mês". Ele só é salvo quando você toca em "Salvar renda de referência".',
      empty: null,
      announce: 'Valor por mês preenchido com R$ 5.200,00, média de julho a setembro.',
    });
    const some = incomeAverageTexts(incomeAverage([row('2026-07', 430_000), row('2026-08', 620_000), row('2026-09')], 3, NOW));
    expect(some.headline).toBe('Média de julho e agosto: R$ 5.250,00');
    expect(some.count).toBe('Meses usados: 2 de 3, setembro sem registros ficou de fora');
    // Dois ou mais fora: plural.
    const one = incomeAverageTexts(incomeAverage([row('2026-09', 510_000)], 3, NOW));
    expect(one.headline).toBe('Média de setembro: R$ 5.100,00');
    expect(one.count).toBe('Meses usados: 1 de 3, julho e agosto sem registros ficaram de fora');
    expect(incomeAverageTexts(incomeAverage([row('2026-04', 520_000), row('2026-05', 500_000), row('2026-06', 510_000)], 6, NOW)).count).toBe(
      'Meses usados: 3 de 6, julho, agosto e setembro sem registros ficaram de fora',
    );
  });

  it('meses salteados nunca viram um intervalo: "julho e setembro", e "julho a setembro" só com três seguidos', () => {
    expect(incomeAverageTexts(incomeAverage([row('2026-07', 100_000), row('2026-09', 300_000)], 3, NOW)).headline).toBe('Média de julho e setembro: R$ 2.000,00');
    const four = incomeAverageTexts(incomeAverage([row('2026-04', 100_000), row('2026-05', 100_000), row('2026-06', 100_000), row('2026-08', 100_000)], 6, NOW));
    expect(four.headline).toBe('Média de abril, maio, junho e agosto: R$ 1.000,00');
    expect(incomeAverageTexts(incomeAverage([row('2026-04', 100_000), row('2026-05', 100_000), row('2026-06', 100_000), row('2026-07', 100_000)], 6, NOW)).headline).toBe(
      'Média de abril a julho: R$ 1.000,00',
    );
  });

  it('o mês conferido como zero é dito, no singular e no plural', () => {
    const one = incomeAverageTexts(incomeAverage([row('2026-07', 430_000), row('2026-08', 0, { receivedChecked: true }), row('2026-09', 510_000)], 3, NOW));
    expect(one.zero).toBe('Agosto entrou com R$ 0,00 porque você conferiu que não houve recebimentos.');
    expect(one.count).toBe('Meses usados: 3 de 3');
    const two = incomeAverageTexts(incomeAverage([row('2026-07', 430_000), row('2026-08', 0, { receivedChecked: true }), row('2026-09', 0, { receivedChecked: true })], 3, NOW));
    expect(two.zero).toBe('Agosto e setembro entraram com R$ 0,00 porque você conferiu que não houve recebimentos.');
    expect(two.headline).toBe('Média de julho a setembro: R$ 1.433,33');
  });

  it('virada de ano: o ano aparece quando a janela passa de um ano para outro', () => {
    const rows = [row('2026-10', 400_000), row('2026-11', 500_000), row('2026-12', 600_000)];
    const t = incomeAverageTexts(incomeAverage(rows, 3, '2027-01'));
    // Os três meses são de 2026: sem o ano.
    expect(t.headline).toBe('Média de outubro a dezembro: R$ 5.000,00');
    const cross = incomeAverageTexts(incomeAverage([row('2026-11', 400_000), row('2026-12', 500_000), row('2027-01', 600_000)], 3, '2027-02'));
    expect(cross.headline).toBe('Média de novembro de 2026 a janeiro de 2027: R$ 5.000,00');
    expect(cross.announce).toBe('Valor por mês preenchido com R$ 5.000,00, média de novembro de 2026 a janeiro de 2027.');
    const crossSome = incomeAverageTexts(incomeAverage([row('2026-12', 500_000), row('2027-01', 600_000)], 3, '2027-02'));
    expect(crossSome.headline).toBe('Média de dezembro de 2026 e janeiro de 2027: R$ 5.500,00');
    expect(crossSome.count).toBe('Meses usados: 2 de 3, novembro de 2026 sem registros ficou de fora');
  });

  it('sem nenhum mês com recebimentos: o botão explica que precisa de pelo menos um mês fechado com recebimentos', () => {
    const three = incomeAverageTexts(incomeAverage([], 3, NOW));
    expect(three.empty).toBe('Para calcular a média, é preciso ter pelo menos um mês fechado com recebimentos anotados. Nos últimos 3 meses (julho a setembro), nenhum mês tem.');
    expect(three.announce).toBe(three.empty);
    expect([three.headline, three.count, three.zero, three.basis, three.notice, three.filled]).toEqual([null, null, null, null, null, null]);
    expect(incomeAverageTexts(incomeAverage([], 6, NOW)).empty).toContain('Nos últimos 6 meses (abril a setembro), nenhum mês tem.');
    expect(incomeAverageTexts(incomeAverage([], 3, '2027-02')).empty).toContain('Nos últimos 3 meses (novembro de 2026 a janeiro de 2027), nenhum mês tem.');
  });

  it('as opções e o botão', () => {
    expect(T.action).toBe('Calcular pela média');
    expect(T.choices[3]).toBe('Últimos 3 meses');
    expect(T.choices[6]).toBe('Últimos 6 meses');
    expect(incomeAverageTextSamples().length).toBeGreaterThan(40);
  });
});
