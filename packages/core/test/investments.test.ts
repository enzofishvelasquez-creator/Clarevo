import { describe, expect, it } from 'vitest';
import {
  BCB_SERIES,
  INVESTMENT_KINDS,
  INVESTMENT_KIND_LABEL,
  INVESTMENT_TEXT,
  applyInvestmentChange,
  bcbSeriesUrl,
  chainRates,
  compareLastClosedMonths,
  exampleIndices,
  indexOverMonths,
  investmentErrorText,
  investmentMovementError,
  investmentNegativeDay,
  investmentTotals,
  investmentValueOn,
  investmentsMissingValue,
  joinNamesBR,
  monthlyReturns,
  newInvestmentError,
  parseBcbSeries,
  validateInvestmentDraft,
  type InvestmentMovementKind,
} from '../src';

const mv = (kind: InvestmentMovementKind, amountCents: number, occurredOn: string, id = `${kind}-${occurredOn}-${amountCents}`) => ({ id, kind, amountCents, occurredOn });
const TODAY = '2026-11-11';

describe('investimentos (D-093): valor, ganho e saldo dia a dia', () => {
  // Fictício: R$ 1.000,00 aplicados em 10/09, R$ 500,00 em 05/10, valor de R$ 1.540,00 no extrato em 31/10, R$ 200,00 resgatados em 03/11
  // e R$ 12,00 de rendimento pago em 05/11.
  const list = [
    mv('aporte', 100_000, '2026-09-10'),
    mv('aporte', 50_000, '2026-10-05'),
    mv('valor', 154_000, '2026-10-31'),
    mv('resgate', 20_000, '2026-11-03'),
    mv('rendimento', 1_200, '2026-11-05'),
  ];

  it('antes da primeira atualização, o valor é o custo; depois, o valor informado mais os fluxos seguintes', () => {
    expect(investmentValueOn(list, '2026-09-09')).toBe(0);
    expect(investmentValueOn(list, '2026-09-10')).toBe(100_000);
    expect(investmentValueOn(list, '2026-10-05')).toBe(150_000);
    expect(investmentValueOn(list, '2026-10-31')).toBe(154_000);
    expect(investmentValueOn(list, '2026-11-03')).toBe(134_000);
    // O rendimento pago não muda o valor do investimento.
    expect(investmentValueOn(list, TODAY)).toBe(134_000);
  });

  it('no mesmo dia, o valor informado fecha o dia: já inclui o aporte do dia', () => {
    expect(investmentValueOn([mv('aporte', 10_000, '2026-11-01'), mv('valor', 10_050, '2026-11-01')], '2026-11-01')).toBe(10_050);
    expect(investmentValueOn([mv('valor', 10_050, '2026-11-01'), mv('aporte', 10_000, '2026-11-01')], '2026-11-01')).toBe(10_050);
  });

  it('os totais: aportado, resgatado, rendimentos, valor, ganho e a última atualização', () => {
    expect(investmentTotals(list, TODAY)).toEqual({
      depositsCents: 150_000,
      withdrawalsCents: 20_000,
      incomeCents: 1_200,
      valueCents: 134_000,
      gainCents: 134_000 + 20_000 + 1_200 - 150_000,
      lastValueOn: '2026-10-31',
    });
  });

  it('I1: o valor ao fim de um dia nunca fica negativo', () => {
    expect(investmentNegativeDay(list)).toBeNull();
    expect(investmentNegativeDay(applyInvestmentChange(list, { op: 'add', kind: 'resgate', amountCents: 200_000, occurredOn: '2026-11-04' }))).toBe('2026-11-04');
    // Um resgate no passado que passaria do valor daquele dia, mesmo com um aporte depois.
    expect(investmentNegativeDay(applyInvestmentChange(list, { op: 'add', kind: 'resgate', amountCents: 120_000, occurredOn: '2026-09-20' }))).toBe('2026-09-20');
    // Aporte e resgate no mesmo dia: vale o fim do dia.
    expect(investmentNegativeDay([mv('resgate', 5_000, '2026-11-01'), mv('aporte', 5_000, '2026-11-01')])).toBeNull();
    // Atualização para R$ 0,00 é aceita (perda total); um resgate depois dela, não.
    expect(investmentNegativeDay([mv('aporte', 5_000, '2026-11-01'), mv('valor', 0, '2026-11-02')])).toBeNull();
    expect(investmentNegativeDay([mv('aporte', 5_000, '2026-11-01'), mv('valor', 0, '2026-11-02'), mv('resgate', 1, '2026-11-03')])).toBe('2026-11-03');
    // Excluir o aporte deixa o resgate sem cobertura; alterar o valor do aporte também.
    expect(investmentNegativeDay(applyInvestmentChange(list, { op: 'delete', id: list[0]!.id }))).toBe(null);
    expect(investmentNegativeDay(applyInvestmentChange([mv('aporte', 5_000, '2026-11-01', 'a'), mv('resgate', 5_000, '2026-11-02', 'r')], { op: 'update', id: 'a', amountCents: 4_000, occurredOn: '2026-11-01' }))).toBe('2026-11-02');
  });
});

describe('investimentos: rentabilidade mensal (Dietz modificado) e encadeada', () => {
  // Cadastro com "Quanto vale hoje": o aporte e a atualização de valor no mesmo dia.
  const cadastro = (cents: number, on: string, value = cents) => [mv('aporte', cents, on), mv('valor', value, on)];

  it('um mês simples: R$ 1.000,00 no início, R$ 1.010,00 no fim, sem fluxo, rende 1%', () => {
    const r = monthlyReturns([[...cadastro(100_000, '2026-09-30'), mv('valor', 101_000, '2026-10-31')]], TODAY);
    expect(r.map((x) => x.month)).toEqual(['2026-09', '2026-10', '2026-11']);
    // Setembro: entra no fim do último dia, nenhum dia investido, sem taxa.
    expect(r[0]!.rate).toBeNull();
    expect(r[1]!.rate).toBeCloseTo(0.01, 10);
    expect(r[1]!.endValueCents).toBe(101_000);
    // Novembro ainda sem atualização de valor: sem taxa (o valor do fim é o último informado).
    expect(r[2]).toMatchObject({ month: '2026-11', partial: true, endValueCents: 101_000, rate: null });
  });

  it('o aporte no meio do mês pesa pelos dias que ficou investido; o rendimento pago conta como retorno', () => {
    // Outubro (31 dias): V0 R$ 1.000,00; aporte de R$ 310,00 no dia 16 (peso 15/31 = R$ 150,00); V1 R$ 1.320,00; rendimento de R$ 5,00.
    const g = [...cadastro(100_000, '2026-09-30'), mv('aporte', 31_000, '2026-10-16'), mv('rendimento', 500, '2026-10-20'), mv('valor', 132_000, '2026-10-31')];
    const oct = monthlyReturns([g], TODAY).find((x) => x.month === '2026-10')!;
    expect(oct.rate).toBeCloseTo((132_000 - 100_000 - 31_000 + 500) / (100_000 + 15_000), 10);
  });

  it('sem atualização no primeiro dia, os aportes desse dia entram no começo do dia (a demonstração começa assim)', () => {
    const g = [mv('aporte', 1_000_000, '2026-06-01'), mv('valor', 1_008_500, '2026-06-30')];
    expect(monthlyReturns([g], '2026-07-15')[0]!.rate).toBeCloseTo(0.0085, 10);
  });

  it('a carteira soma os investimentos; encadear multiplica os meses e ignora os sem taxa', () => {
    const a = [...cadastro(100_000, '2026-08-31'), mv('valor', 101_000, '2026-09-30'), mv('valor', 102_010, '2026-10-31')];
    const b = [...cadastro(100_000, '2026-08-31'), mv('valor', 100_000, '2026-09-30'), mv('valor', 99_000, '2026-10-31')];
    const r = monthlyReturns([a, b], TODAY);
    expect(r.find((x) => x.month === '2026-09')!.rate).toBeCloseTo(0.005, 10);
    expect(r.find((x) => x.month === '2026-10')!.endValueCents).toBe(201_010);
    // Um investimento sem atualização no mês deixa a carteira sem taxa naquele mês.
    const c = [...cadastro(50_000, '2026-08-31')];
    expect(monthlyReturns([a, c], TODAY).find((x) => x.month === '2026-09')!.rate).toBeNull();
    expect(chainRates([0.01, null, 0.01])).toBeCloseTo(0.0201, 10);
    expect(chainRates([null])).toBeNull();
    expect(chainRates([])).toBeNull();
    expect(monthlyReturns([[]], TODAY)).toEqual([]);
  });

  it('revisão de 11/11/2026: o ganho de antes do cadastro não vira rendimento de um mês só', () => {
    // Cadastro em 29/11 com R$ 10.000,00 aplicados e R$ 11.200,00 de valor: no próprio dia, sem taxa; em dezembro, novembro fica em 0%.
    const g = cadastro(1_000_000, '2026-11-29', 1_120_000);
    expect(monthlyReturns([g], '2026-11-29')[0]!.rate).toBeNull();
    const dec = monthlyReturns([g], '2026-12-05');
    expect(dec[0]!.rate).toBeCloseTo(0, 10);
    expect(dec[1]!.rate).toBeNull();
    expect(compareLastClosedMonths(dec, exampleIndices())!.rate).toBeCloseTo(0, 10);
    // Desde 01/11/2025, com o valor de hoje só: nenhum mês tem as duas pontas, nada de "+0,00%" contra o CDI.
    const longo = [mv('aporte', 1_000_000, '2025-11-01'), mv('valor', 1_120_000, TODAY)];
    const r = monthlyReturns([longo], TODAY);
    expect(r.every((x) => x.rate === null)).toBe(true);
    expect(compareLastClosedMonths(r, exampleIndices())).toBeNull();
  });

  it('taxa de −100% ou menos (aporte grande no fim do mês e valor zerado) fica sem taxa', () => {
    const g = [...cadastro(100, '2026-08-31'), mv('valor', 100, '2026-09-30'), mv('aporte', 1_000_000, '2026-10-30'), mv('valor', 0, '2026-10-31')];
    expect(monthlyReturns([g], TODAY).find((x) => x.month === '2026-10')!.rate).toBeNull();
  });

  it('duas atualizações no mesmo dia: vale a última criada, como no banco, mesmo com a lista do mais novo para o mais antigo', () => {
    const list = [
      { ...mv('resgate', 500_000, '2026-11-11'), createdAt: '2026-11-11T10:00:00Z' },
      { ...mv('valor', 1_000_000, '2026-11-10'), createdAt: '2026-11-10T10:05:00Z' },
      { ...mv('valor', 0, '2026-11-10'), createdAt: '2026-11-10T10:00:00Z' },
    ];
    expect(investmentNegativeDay(list)).toBeNull();
    expect(investmentValueOn(list, '2026-11-11')).toBe(500_000);
    // Um movimento novo (ainda sem data de criação) vale depois dos que já existem no mesmo dia.
    expect(investmentValueOn(applyInvestmentChange(list.map((m, i) => ({ ...m, id: `m${i}` })), { op: 'add', kind: 'valor', amountCents: 700_000, occurredOn: '2026-11-10' }), '2026-11-10')).toBe(700_000);
  });
});

describe('investimentos: CDI e IPCA', () => {
  it('lê a série do Banco Central e ignora linha estranha', () => {
    expect(
      parseBcbSeries([
        { data: '01/09/2026', valor: '0,91' },
        { data: '01/10/2026', valor: '0.93' },
        { data: '15/10/2026', valor: '0,5' },
        { data: '01/11/2026', valor: 'abc' },
        { data: '01/12/2026', valor: '55' },
        'lixo',
        null,
      ]),
    ).toEqual({ '2026-09': 0.91, '2026-10': 0.93 });
    expect(parseBcbSeries({ erro: true })).toEqual({});
    expect(bcbSeriesUrl(BCB_SERIES.ipca, '2025-11-01', '2026-11-11')).toBe(
      'https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados?formato=json&dataInicial=01/11/2025&dataFinal=11/11/2026',
    );
  });

  it('acumula nos meses pedidos e devolve nulo se faltar mês', () => {
    expect(indexOverMonths({ '2026-09': 1, '2026-10': 1 }, ['2026-09', '2026-10'])).toBeCloseTo(0.0201, 10);
    expect(indexOverMonths({ '2026-09': 1 }, ['2026-09', '2026-10'])).toBeNull();
    expect(indexOverMonths({}, [])).toBeNull();
  });

  it('compara só os meses fechados (até 12) e diz quando os índices são de exemplo', () => {
    const g = [mv('aporte', 100_000, '2026-08-31'), mv('valor', 100_000, '2026-08-31'), mv('valor', 101_000, '2026-09-30'), mv('valor', 102_010, '2026-10-31'), mv('valor', 110_000, TODAY)];
    const c = compareLastClosedMonths(monthlyReturns([g], TODAY), exampleIndices())!;
    expect(c.months).toEqual(['2026-09', '2026-10']);
    expect(c.rate).toBeCloseTo(0.0201, 10);
    expect(c.cdi).toBeCloseTo(1.009 * 1.009 - 1, 10);
    expect(c.ipca).toBeCloseTo(1.0035 * 1.0035 - 1, 10);
    expect(INVESTMENT_TEXT.comparison(c)).toBe('Nos 2 meses fechados, de setembro a outubro de 2026: +2,01%.');
    expect(INVESTMENT_TEXT.cdi(c.cdi)).toBe('CDI no mesmo período: +1,81%');
    expect(INVESTMENT_TEXT.ipca(null)).toBe('IPCA: sem dados para todos os meses');
    expect(exampleIndices().example).toBe(true);
    expect(INVESTMENT_TEXT.indicesExample).toMatch(/exemplo/);
    expect(compareLastClosedMonths([], null)).toBeNull();
  });
});

describe('investimentos: validação e textos', () => {
  it('nome, tipo, valores e datas, como no banco', () => {
    const ok = { name: 'Reserva no banco', kind: 'renda_fixa' as const, investedCents: 100_000, startOn: '2026-01-10', currentCents: null };
    expect(newInvestmentError(ok, TODAY)).toBeNull();
    expect(newInvestmentError({ ...ok, name: '  ' }, TODAY)).toBe('nome_invalido');
    expect(newInvestmentError({ ...ok, name: 'x'.repeat(41) }, TODAY)).toBe('nome_invalido');
    expect(newInvestmentError({ ...ok, kind: 'poupanca' as never }, TODAY)).toBe('tipo_invalido');
    expect(newInvestmentError({ ...ok, investedCents: 0 }, TODAY)).toBe('valor_invalido');
    expect(newInvestmentError({ ...ok, currentCents: -1 }, TODAY)).toBe('valor_invalido');
    expect(newInvestmentError({ ...ok, currentCents: 0 }, TODAY)).toBeNull();
    expect(newInvestmentError({ ...ok, startOn: '2026-11-12' }, TODAY)).toBe('data_futura');
    expect(investmentMovementError('valor', { amountCents: 0, occurredOn: TODAY, note: null }, TODAY)).toBeNull();
    expect(investmentMovementError('aporte', { amountCents: 0, occurredOn: TODAY, note: null }, TODAY)).toBe('valor_invalido');
    expect(investmentMovementError('aporte', { amountCents: 1, occurredOn: TODAY, note: 'x'.repeat(81) }, TODAY)).toBe('observacao_invalida');
  });

  it('o rascunho do formulário', () => {
    const v = validateInvestmentDraft({ name: ' Ações ', kind: 'acoes', investedText: '1.500,00', currentText: '1.620,50', startText: '10/03/2025' }, TODAY, 'criar');
    expect(v).toEqual({ ok: true, input: { name: 'Ações', kind: 'acoes', investedCents: 150_000, currentCents: 162_050, startOn: '2025-03-10' } });
    const bad = validateInvestmentDraft({ name: '', kind: null, investedText: '', currentText: 'abc', startText: '31/12/2026' }, TODAY, 'criar');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(['currentText', 'investedText', 'kind', 'name', 'startText']);
    // Sem data, hoje; sem valor atual, nulo.
    const plain = validateInvestmentDraft({ name: 'Fundo', kind: 'fundos', investedText: '100', currentText: '', startText: '' }, TODAY, 'criar');
    expect(plain.ok && plain.input.startOn === TODAY && plain.input.currentCents === null).toBe(true);
    // Editar só olha nome e tipo.
    expect(validateInvestmentDraft({ name: 'Fundo', kind: 'fundos', investedText: '', currentText: '', startText: '' }, TODAY, 'editar').ok).toBe(true);
  });

  it('tipos, textos e erros seguem as regras de redação, sem nome de banco nem produto', () => {
    expect(INVESTMENT_KINDS.map((k) => INVESTMENT_KIND_LABEL[k])).toEqual(['Renda fixa', 'Títulos públicos', 'Ações', 'Fundos', 'Previdência', 'Criptoativos', 'Outro']);
    expect(INVESTMENT_TEXT.gain(-1200)).toBe('Perda: R$ 12,00');
    expect(INVESTMENT_TEXT.gain(34567)).toBe('Ganho: R$ 345,67');
    expect(INVESTMENT_TEXT.percent(-0.0123)).toBe('-1,23%');
    expect(investmentErrorText('valor_insuficiente', '2026-11-04')).toMatch(/04\/11\/2026/);
    const all: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === 'string') all.push(v);
      else if (typeof v === 'object' && v !== null) Object.values(v).forEach(walk);
    };
    walk(INVESTMENT_TEXT);
    for (const t of all) {
      expect(t).not.toMatch(/—|–/);
      expect(t).not.toMatch(/fazer sentido/i);
      expect(t).not.toMatch(/\bo Clarevo\b/);
      expect(t).not.toMatch(/recomendamos|invista|aplique já|garantid[oa]/i);
    }
    expect(INVESTMENT_TEXT.disclaimer).toMatch(/Não é recomendação de investimento/);
  });
});

describe('investimentos (pedido do Enzo, 11/11/2026): o card da carteira diz quem falta atualizar', () => {
  // O caso do teste do Enzo na web: "Ações" (R$ 700,00 aplicados hoje, sem valor) e "Teste CDI" (desde 01/09, valores em 30/09, 31/10 e hoje).
  const acoes = [mv('aporte', 70000, '2026-11-11')];
  const teste = [mv('aporte', 100000, '2026-09-01'), mv('valor', 100800, '2026-09-30'), mv('valor', 101500, '2026-10-31'), mv('valor', 102000, '2026-11-11')];

  it('a carteira fica sem taxa neste mês só por causa de "Ações", e é ela que o card cita', () => {
    const returns = monthlyReturns([acoes, teste], TODAY);
    expect(returns.at(-1)).toMatchObject({ month: '2026-11', rate: null, partial: true });
    expect(monthlyReturns([teste], TODAY).at(-1)!.rate).toBeCloseTo(0.004926, 6);
    const missing = investmentsMissingValue([{ name: 'Ações', movements: acoes }, { name: 'Teste CDI', movements: teste }], TODAY);
    expect(missing).toEqual({ thisMonth: ['Ações'], lastMonth: [], previousMonth: '2026-10' });
    expect(INVESTMENT_TEXT.missingThisMonth(missing.thisMonth)).toBe('Para ter a taxa deste mês, falta atualizar o valor de Ações.');
    // Com "Atualizar valor" em "Ações" hoje, ninguém falta (começou neste mês: não precisa do mês passado).
    expect(investmentsMissingValue([{ name: 'Ações', movements: [...acoes, mv('valor', 70000, TODAY)] }], TODAY)).toEqual({ thisMonth: [], lastMonth: [], previousMonth: '2026-10' });
  });

  it('quem começou antes deste mês e não tem valor no mês passado entra na segunda lista, com o nome do mês', () => {
    const antigo = [mv('aporte', 50000, '2026-08-01'), mv('valor', 50500, '2026-08-31'), mv('valor', 51000, '2026-11-05')];
    const missing = investmentsMissingValue([{ name: 'Previdência', movements: antigo }], TODAY);
    expect(missing).toEqual({ thisMonth: [], lastMonth: ['Previdência'], previousMonth: '2026-10' });
    expect(monthlyReturns([antigo], TODAY).at(-1)!.rate).toBeNull();
    expect(INVESTMENT_TEXT.missingLastMonth(missing.previousMonth, missing.lastMonth)).toBe(
      'Falta o valor de outubro para Previdência: em "Atualizar valor", use a data 31/10/2026.',
    );
    // O último dia do mês passado nunca é antes do primeiro aporte de quem começou nele (revisão independente de 11/11/2026).
    expect(INVESTMENT_TEXT.missingLastMonth('2027-02', ['A'])).toContain('use a data 28/02/2027.');
    expect(INVESTMENT_TEXT.missingLastMonth('2026-12', ['A'])).toContain('use a data 31/12/2026.');
    expect(INVESTMENT_TEXT.missingLastMonth('2026-12', ['A'])).toContain(`"${INVESTMENT_TEXT.detail.updateValue}"`);
    // Sem nenhum valor: falta nos dois; um valor de outubro resolve o mês passado; movimento só no futuro fica de fora.
    const semValor = [mv('aporte', 10000, '2026-09-15')];
    expect(investmentsMissingValue([{ name: 'X', movements: semValor }], TODAY)).toMatchObject({ thisMonth: ['X'], lastMonth: ['X'] });
    expect(investmentsMissingValue([{ name: 'X', movements: [...semValor, mv('valor', 10100, '2026-10-20')] }], TODAY)).toMatchObject({ thisMonth: ['X'], lastMonth: [] });
    expect(investmentsMissingValue([{ name: 'Futuro', movements: [mv('aporte', 100, '2026-12-01')] }], TODAY)).toMatchObject({ thisMonth: [], lastMonth: [] });
    // Em janeiro, o mês passado é dezembro do ano anterior.
    expect(investmentsMissingValue([{ name: 'X', movements: semValor }], '2027-01-10').previousMonth).toBe('2026-12');
  });

  it('só cita quando atualizar dá a taxa hoje: tudo começou hoje (base zero) fica com o aviso geral', () => {
    // Revisão independente de 11/11/2026: "CDB" criado hoje com valor e "Ações" criado hoje sem valor. Atualizar "Ações" hoje não daria
    // taxa (os dois entram no fim do dia, base zero), então ninguém é citado.
    const cdb = [mv('aporte', 100000, TODAY), mv('valor', 100000, TODAY)];
    expect(monthlyReturns([cdb, acoes], TODAY).at(-1)!.rate).toBeNull();
    expect(investmentsMissingValue([{ name: 'CDB', movements: cdb }, { name: 'Ações', movements: acoes }], TODAY)).toEqual({ thisMonth: [], lastMonth: [], previousMonth: '2026-10' });
    // Com um investimento de antes na carteira, a base fica positiva e "Ações" é citado (e atualizar resolve).
    expect(investmentsMissingValue([{ name: 'Teste CDI', movements: teste }, { name: 'Ações', movements: acoes }], TODAY).thisMonth).toEqual(['Ações']);
    expect(monthlyReturns([teste, [...acoes, mv('valor', 70000, TODAY)]], TODAY).at(-1)!.rate).not.toBeNull();
    // Os textos novos seguem as regras de redação (são funções, fora da varredura das strings).
    for (const t of [INVESTMENT_TEXT.missingThisMonth(['A', 'B']), INVESTMENT_TEXT.missingLastMonth('2026-10', ['A'])]) {
      expect(t).not.toMatch(/[\u2013\u2014]|fazer sentido|recomendamos|invista/i);
    }
  });

  it('os nomes em lista, com até três e "e mais"', () => {
    expect(joinNamesBR([])).toBe('');
    expect(joinNamesBR(['A'])).toBe('A');
    expect(joinNamesBR(['A', 'B'])).toBe('A e B');
    expect(joinNamesBR(['A', 'B', 'C'])).toBe('A, B e C');
    expect(joinNamesBR(['A', 'B', 'C', 'D', 'E'])).toBe('A, B, C e mais 2');
  });
});
