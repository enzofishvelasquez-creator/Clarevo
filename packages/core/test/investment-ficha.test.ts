import { describe, expect, it } from 'vitest';
import {
  DECLARATION_TEXT,
  DETAILS_TEXT,
  EMPTY_DETAILS_DRAFT,
  EMPTY_INVESTMENT_DETAILS,
  FGC_LIMIT_CENTS,
  FGC_TEXT,
  INVESTMENT_KINDS,
  INVESTMENT_SUBKINDS,
  INVESTMENT_TAX_RULES,
  SUBKINDS_BY_KIND,
  SUBKIND_LABEL,
  TAX_TEXT,
  allocationUseful,
  calendarDaysBetween,
  dateEventText,
  declarationSummary,
  declarationYears,
  detailsToDraft,
  estimateRegressiveNet,
  estimateValueByRate,
  fgcByInstitution,
  guaranteeOf,
  incomeSummary,
  institutionKey,
  investmentAllocation,
  investmentDateEvents,
  investmentDetailsError,
  investmentMovementError,
  iofRate,
  isMarketBusinessDay,
  liquidityBucket,
  liquiditySummary,
  marketBusinessDaysInMonth,
  parseRateText,
  rateSummary,
  realRate,
  regressiveRate,
  relativeDays,
  subkindKind,
  suggestedIndexKind,
  taxExplanation,
  taxRegimeOf,
  validateDetailsDraft,
  type Investment,
  type InvestmentDetails,
  type InvestmentMovementKind,
  type MarketIndices,
} from '../src';

const TODAY = '2026-11-11';
const mv = (kind: InvestmentMovementKind, amountCents: number, occurredOn: string, extra: { investmentId?: string; incomeKind?: 'juros' | 'dividendo' | 'jcp' | 'fii' | 'outro' | null } = {}) => ({
  id: `${kind}-${occurredOn}-${amountCents}`,
  kind,
  amountCents,
  occurredOn,
  investmentId: extra.investmentId ?? 'a',
  incomeKind: extra.incomeKind ?? null,
});
const inv = (p: Partial<Investment> & { id: string }): Investment => ({
  contextId: 'ctx',
  name: p.id,
  kind: 'renda_fixa',
  status: 'ativo',
  createdBy: 'p',
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  depositsCents: 0,
  withdrawalsCents: 0,
  incomeCents: 0,
  valueCents: 0,
  lastValueOn: null,
  firstMovementOn: null,
  ...EMPTY_INVESTMENT_DETAILS,
  ...p,
});
const d = (p: Partial<InvestmentDetails>): InvestmentDetails => ({ ...EMPTY_INVESTMENT_DETAILS, ...p });
const noDash = (s: string) => expect(s).not.toMatch(/[–—]/);

describe('ficha ampliada (D-099): tipos exatos, validação e o que ela deduz', () => {
  it('cada tipo exato pertence a um tipo só; nomes oficiais dos títulos públicos', () => {
    expect(new Set(INVESTMENT_SUBKINDS).size).toBe(INVESTMENT_SUBKINDS.length);
    for (const s of INVESTMENT_SUBKINDS) expect(SUBKINDS_BY_KIND[subkindKind(s)]).toContain(s);
    expect(SUBKIND_LABEL.tesouro_selic).toBe('Tesouro Selic');
    expect(SUBKIND_LABEL.tesouro_ipca).toBe('Tesouro IPCA+');
    expect(SUBKINDS_BY_KIND.cripto).toEqual([]);
    for (const k of INVESTMENT_KINDS) expect(SUBKINDS_BY_KIND[k]).toBeDefined();
  });

  it('valida a coerência: tipo exato do tipo, taxa só com forma que pede taxa, liquidez com a data ou os dias', () => {
    expect(investmentDetailsError('renda_fixa', EMPTY_INVESTMENT_DETAILS)).toBeNull();
    expect(investmentDetailsError('renda_fixa', d({ subkind: 'cdb', institution: 'Banco Azul', indexKind: 'cdi', rateBp: 11000, maturityOn: '2028-03-15', liquidity: 'no_vencimento' }))).toBeNull();
    expect(investmentDetailsError('acoes', d({ subkind: 'cdb' }))).toBe('subtipo_invalido');
    expect(investmentDetailsError('renda_fixa', d({ institution: ' Banco' }))).toBe('instituicao_invalida');
    expect(investmentDetailsError('renda_fixa', d({ institution: 'x'.repeat(41) }))).toBe('instituicao_invalida');
    expect(investmentDetailsError('renda_fixa', d({ indexKind: 'cdi' }))).toBe('taxa_invalida');
    expect(investmentDetailsError('renda_fixa', d({ indexKind: 'cdi', rateBp: 0 }))).toBe('taxa_invalida');
    expect(investmentDetailsError('renda_fixa', d({ indexKind: 'poupanca', rateBp: 100 }))).toBe('taxa_invalida');
    expect(investmentDetailsError('renda_fixa', d({ rateBp: 100 }))).toBe('taxa_invalida');
    expect(investmentDetailsError('titulos_publicos', d({ indexKind: 'selic', rateBp: 0 }))).toBeNull();
    expect(investmentDetailsError('titulos_publicos', d({ indexKind: 'selic', rateBp: -12 }))).toBeNull();
    expect(investmentDetailsError('renda_fixa', d({ maturityOn: '2026-02-30' }))).toBe('vencimento_invalido');
    expect(investmentDetailsError('renda_fixa', d({ maturityOn: '2101-01-01' }))).toBe('vencimento_invalido');
    expect(investmentDetailsError('renda_fixa', d({ liquidity: 'a_partir_de' }))).toBe('liquidez_invalida');
    expect(investmentDetailsError('renda_fixa', d({ liquidity: 'a_partir_de', liquidityOn: '2027-01-10' }))).toBeNull();
    expect(investmentDetailsError('renda_fixa', d({ liquidity: 'dias', liquidityDays: 0 }))).toBe('liquidez_invalida');
    expect(investmentDetailsError('renda_fixa', d({ liquidity: 'dias', liquidityDays: 30 }))).toBeNull();
    expect(investmentDetailsError('renda_fixa', d({ liquidity: 'diaria', liquidityDays: 3 }))).toBe('liquidez_invalida');
    expect(investmentDetailsError('renda_fixa', d({ liquidityOn: '2027-01-10' }))).toBe('liquidez_invalida');
  });

  it('o rascunho: taxa com vírgula ou ponto, datas dd/mm/aaaa, tipo exato de outro tipo cai fora, ida e volta', () => {
    expect(parseRateText('110')).toBe(11000);
    expect(parseRateText('110,5')).toBe(11050);
    expect(parseRateText('6.25%')).toBe(625);
    expect(parseRateText('-0,12')).toBe(-12);
    expect(parseRateText('abc')).toBeNull();
    expect(parseRateText('1,234')).toBeNull();
    const ok = validateDetailsDraft('renda_fixa', { ...EMPTY_DETAILS_DRAFT, subkind: 'lci', institutionText: '  Banco   Verde ', indexKind: 'cdi', rateText: '95', maturityText: '10/01/2028', liquidity: 'a_partir_de', liquidityOnText: '10/01/2027' });
    expect(ok).toEqual({ ok: true, details: d({ subkind: 'lci', institution: 'Banco Verde', indexKind: 'cdi', rateBp: 9500, maturityOn: '2028-01-10', liquidity: 'a_partir_de', liquidityOn: '2027-01-10' }) });
    if (ok.ok) expect(validateDetailsDraft('renda_fixa', detailsToDraft(ok.details))).toEqual(ok);
    expect(validateDetailsDraft('acoes', { ...EMPTY_DETAILS_DRAFT, subkind: 'lci' })).toEqual({ ok: true, details: EMPTY_INVESTMENT_DETAILS });
    const bad = validateDetailsDraft('renda_fixa', { ...EMPTY_DETAILS_DRAFT, indexKind: 'prefixado', rateText: '', maturityText: '31/02/2027', liquidity: 'dias', liquidityDaysText: '0' });
    expect(bad).toEqual({ ok: false, errors: { rateText: DETAILS_TEXT.errors.rateEmpty, maturityText: DETAILS_TEXT.errors.date, liquidityDaysText: DETAILS_TEXT.errors.days } });
  });

  it('regra de imposto, garantia e forma de render sugerida pelo tipo exato', () => {
    expect(taxRegimeOf('renda_fixa', 'lci')).toBe('isento');
    expect(taxRegimeOf('renda_fixa', 'cdb')).toBe('regressiva');
    expect(taxRegimeOf('titulos_publicos', null)).toBe('regressiva');
    expect(taxRegimeOf('fundos', 'fundo_multimercado')).toBe('come_cotas');
    expect(taxRegimeOf('fundos', 'fii')).toBe('venda');
    expect(taxRegimeOf('renda_fixa', null)).toBeNull();
    expect(taxRegimeOf('cripto', null)).toBe('cripto');
    expect(guaranteeOf('renda_fixa', 'cdb')).toBe('fgc');
    expect(guaranteeOf('renda_fixa', 'lcd')).toBe('fgc');
    expect(guaranteeOf('renda_fixa', 'lig')).toBe('nenhuma');
    expect(guaranteeOf('renda_fixa', 'debenture')).toBe('nenhuma');
    expect(guaranteeOf('titulos_publicos', null)).toBe('tesouro');
    expect(guaranteeOf('renda_fixa', null)).toBeNull();
    expect(suggestedIndexKind('tesouro_ipca')).toBe('ipca');
    expect(suggestedIndexKind('poupanca')).toBe('poupanca');
    expect(suggestedIndexKind('cdb')).toBeNull();
  });

  it('faixa de liquidez de hoje; carência vencida conta como qualquer dia', () => {
    expect(liquidityBucket(d({ liquidity: 'diaria' }), TODAY)).toBe('ate_1_dia');
    expect(liquidityBucket(d({ liquidity: 'dias', liquidityDays: 30 }), TODAY)).toBe('ate_30_dias');
    expect(liquidityBucket(d({ liquidity: 'a_partir_de', liquidityOn: '2026-01-01' }), TODAY)).toBe('ate_1_dia');
    expect(liquidityBucket(d({ liquidity: 'a_partir_de', liquidityOn: '2027-06-01' }), TODAY)).toBe('ate_1_ano');
    expect(liquidityBucket(d({ liquidity: 'no_vencimento', maturityOn: '2030-01-01' }), TODAY)).toBe('mais_de_1_ano');
    expect(liquidityBucket(d({ liquidity: 'no_vencimento' }), TODAY)).toBeNull();
    expect(liquidityBucket(d({}), TODAY)).toBeNull();
  });

  it('textos da ficha', () => {
    expect(rateSummary('cdi', 11000)).toBe('110% do CDI');
    expect(rateSummary('cdi', 10250)).toBe('102,5% do CDI');
    expect(rateSummary('selic', 0)).toBe('Selic');
    expect(rateSummary('selic', 10)).toBe('Selic mais 0,1% ao ano');
    expect(rateSummary('ipca', 650)).toBe('IPCA mais 6,5% ao ano');
    expect(rateSummary('prefixado', 1325)).toBe('13,25% ao ano');
    expect(rateSummary('variavel', null)).toBe('Variável');
    expect(liquiditySummary(d({ liquidity: 'dias', liquidityDays: 1 }))).toBe('Resgate cai 1 dia depois do pedido');
    expect(liquiditySummary(d({ liquidity: 'a_partir_de', liquidityOn: '2027-01-10' }))).toBe('Resgate a partir de 10/01/2027');
    for (const r of ['isento', 'regressiva', 'come_cotas', 'venda', 'previdencia', 'cripto'] as const) noDash(DETAILS_TEXT.regimeLine(r));
  });

  it('tipo do rendimento só no rendimento recebido', () => {
    expect(investmentMovementError('rendimento', { amountCents: 100, occurredOn: TODAY, note: null, incomeKind: 'jcp' }, TODAY)).toBeNull();
    expect(investmentMovementError('aporte', { amountCents: 100, occurredOn: TODAY, note: null, incomeKind: 'jcp' }, TODAY)).toBe('tipo_rendimento_invalido');
    expect(investmentMovementError('rendimento', { amountCents: 100, occurredOn: TODAY, note: null, incomeKind: 'x' as never }, TODAY)).toBe('tipo_rendimento_invalido');
  });
});

describe('imposto estimado (D-099, item 7)', () => {
  it('tabela regressiva e IOF nas bordas', () => {
    expect(regressiveRate(180)).toBe(0.225);
    expect(regressiveRate(181)).toBe(0.2);
    expect(regressiveRate(360)).toBe(0.2);
    expect(regressiveRate(361)).toBe(0.175);
    expect(regressiveRate(720)).toBe(0.175);
    expect(regressiveRate(721)).toBe(0.15);
    expect(iofRate(0)).toBe(0.96);
    expect(iofRate(1)).toBe(0.96);
    expect(iofRate(10)).toBe(0.66);
    expect(iofRate(29)).toBe(0.03);
    expect(iofRate(30)).toBe(0);
    expect(INVESTMENT_TAX_RULES.iof).toHaveLength(29);
  });

  it('um aporte com mais de 360 dias: 17,5% sobre o rendimento', () => {
    const e = estimateRegressiveNet([mv('aporte', 1_000_000, '2025-11-01'), mv('valor', 1_100_000, TODAY)], TODAY);
    expect(calendarDaysBetween('2025-11-01', TODAY)).toBe(375);
    expect(e).toEqual({ grossCents: 1_100_000, gainCents: 100_000, iofCents: 0, irCents: 17_500, netCents: 1_082_500, rates: { min: 0.175, max: 0.175 } });
  });

  it('aplicado há 10 dias: IOF de 66% do rendimento, e o imposto sobre o que sobra', () => {
    const e = estimateRegressiveNet([mv('aporte', 1_000_000, '2026-11-01'), mv('valor', 1_010_000, TODAY)], TODAY);
    // Rendimento 100,00; IOF 66,00; IR 22,5% de 34,00 = 7,65.
    expect(e).toMatchObject({ gainCents: 10_000, iofCents: 6_600, irCents: 765, netCents: 1_010_000 - 6_600 - 765 });
  });

  it('resgate sai dos aportes mais antigos, na proporção do valor do dia', () => {
    const e = estimateRegressiveNet(
      [mv('aporte', 1_000_000, '2024-01-01'), mv('valor', 1_200_000, '2026-01-01'), mv('resgate', 600_000, '2026-01-02'), mv('valor', 660_000, TODAY)],
      TODAY,
    );
    // Tirou metade do valor: metade do aplicado (5.000,00) fica; rendimento de hoje 1.600,00; mais de 720 dias: 15%.
    expect(e).toMatchObject({ gainCents: 160_000, irCents: 24_000, netCents: 636_000 });
  });

  it('a ordem da lista não muda a conta: no mesmo dia, aporte antes do resgate, e dois resgates do dia somam (revisão de 13/11/2026)', () => {
    const asc = [mv('aporte', 100_000, '2025-01-02'), mv('aporte', 50_000, '2025-06-02'), mv('resgate', 20_000, '2025-06-02'), mv('valor', 150_000, '2026-11-01')];
    const a = estimateRegressiveNet(asc, TODAY);
    expect(estimateRegressiveNet([...asc].reverse(), TODAY)).toEqual(a);
    const twice = [mv('aporte', 100_000, '2025-01-02'), mv('resgate', 10_000, '2025-06-02'), { ...mv('resgate', 10_000, '2025-06-02'), id: 'r2' }, mv('valor', 100_000, '2026-11-01')];
    const one = [mv('aporte', 100_000, '2025-01-02'), mv('resgate', 20_000, '2025-06-02'), mv('valor', 100_000, '2026-11-01')];
    expect(estimateRegressiveNet(twice, TODAY).irCents).toBe(estimateRegressiveNet(one, TODAY).irCents);
  });

  it('dois aportes de idades diferentes dividem o rendimento pelo aplicado vezes os dias', () => {
    const e = estimateRegressiveNet([mv('aporte', 1_000_000, '2024-11-11'), mv('aporte', 1_000_000, '2026-08-13'), mv('valor', 2_300_000, TODAY)], TODAY);
    const daysA = calendarDaysBetween('2024-11-11', TODAY);
    const daysB = calendarDaysBetween('2026-08-13', TODAY);
    const gA = (300_000 * daysA) / (daysA + daysB);
    const gB = 300_000 - gA;
    expect(e.irCents).toBe(Math.round(gA * 0.15 + gB * 0.225));
    expect(e.rates).toEqual({ min: 0.15, max: 0.225 });
  });

  it('sem valor atualizado ou com perda: nada a estimar', () => {
    expect(estimateRegressiveNet([mv('aporte', 1_000_000, '2025-01-01')], TODAY)).toMatchObject({ gainCents: 0, irCents: 0, netCents: 1_000_000, rates: null });
    expect(estimateRegressiveNet([mv('aporte', 1_000_000, '2025-01-01'), mv('valor', 900_000, TODAY)], TODAY)).toMatchObject({ irCents: 0, netCents: 900_000 });
  });

  it('as explicações não recomendam nada e não usam travessão', () => {
    for (const regime of ['isento', 'regressiva', 'come_cotas', 'venda', 'previdencia', 'cripto'] as const) {
      for (const [kind, sub] of [['renda_fixa', 'poupanca'], ['acoes', 'acao'], ['fundos', 'fii'], ['fundos', 'fundo_acoes'], ['fundos', 'etf']] as const) {
        const t = taxExplanation(regime, kind, sub);
        noDash(t);
        expect(t).not.toMatch(/recomend|melhor|vale a pena|deveria/i);
      }
    }
    noDash(TAX_TEXT.rule(TODAY));
    expect(TAX_TEXT.rule(TODAY)).toContain('11/11/2026');
  });
});

describe('o que a ficha mostra na aba (D-099, itens 1 a 5)', () => {
  const items = [
    inv({ id: 'cdb', name: 'CDB do banco', valueCents: 30_000_000, subkind: 'cdb', institution: 'Banco Azul', indexKind: 'cdi', rateBp: 11000, liquidity: 'no_vencimento', maturityOn: '2027-01-10' }),
    inv({ id: 'lci', name: 'LCI', valueCents: 5_000_000, subkind: 'lci', institution: 'banco  azul', liquidity: 'a_partir_de', liquidityOn: '2026-12-01' }),
    inv({ id: 'selic', name: 'Reserva', kind: 'titulos_publicos', valueCents: 2_000_000, subkind: 'tesouro_selic', indexKind: 'selic', rateBp: 0, liquidity: 'diaria' }),
    inv({ id: 'poup', name: 'Poupança', valueCents: 1_000_000, subkind: 'poupanca' }),
    inv({ id: 'acoes', name: 'Ações', kind: 'acoes', valueCents: 3_000_000 }),
    inv({ id: 'velho', name: 'CDB antigo', valueCents: 500_000, subkind: 'cdb', maturityOn: '2026-11-01' }),
    inv({ id: 'fim', name: 'Encerrado', status: 'encerrado', valueCents: 0, subkind: 'cdb', institution: 'Banco Azul' }),
  ];

  it('divisão por tipo, instituição e garantia, com "Sem informação" por último', () => {
    const byKind = investmentAllocation(items, 'kind', TODAY);
    expect(byKind.map((s) => [s.key, s.cents])).toEqual([
      ['renda_fixa', 36_500_000],
      ['acoes', 3_000_000],
      ['titulos_publicos', 2_000_000],
    ]);
    expect(byKind.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1);
    const byInst = investmentAllocation(items, 'institution', TODAY);
    expect(byInst[0]).toMatchObject({ label: 'Banco Azul', cents: 35_000_000, count: 2 });
    expect(byInst.at(-1)!.key).toBe('sem_informacao');
    const byGuarantee = investmentAllocation(items, 'guarantee', TODAY);
    expect(byGuarantee.find((s) => s.key === 'fgc')!.cents).toBe(36_500_000);
    expect(allocationUseful(byInst)).toBe(true);
    expect(allocationUseful(investmentAllocation([items[0]!], 'kind', TODAY))).toBe(false);
  });

  it('vencimentos, liberações e vencidos com valor, em ordem de data', () => {
    const events = investmentDateEvents(items, TODAY);
    expect(events.map((e) => [e.investmentId, e.kind, e.on])).toEqual([
      ['velho', 'vencido', '2026-11-01'],
      ['lci', 'liberacao', '2026-12-01'],
      ['cdb', 'vencimento', '2027-01-10'],
    ]);
    expect(dateEventText(events[2]!)).toBe('CDB do banco vence em 10/01/2027, daqui a 2 meses.');
    expect(dateEventText(events[0]!)).toContain('registre o resgate');
    expect(relativeDays(0)).toBe('hoje');
    expect(relativeDays(1)).toBe('amanhã');
    expect(relativeDays(400)).toBe('daqui a 1 ano e 1 mês');
    expect(relativeDays(730)).toBe('daqui a 2 anos');
  });

  it('FGC: soma por instituição sem caixa nem acento, o que passa do limite e quem está sem instituição', () => {
    expect(institutionKey('Banço  AZUL!')).toBe('banco azul');
    const f = fgcByInstitution(items);
    expect(f.groups).toHaveLength(1);
    expect(f.groups[0]).toMatchObject({ label: 'Banco Azul', cents: 35_000_000, overCents: 35_000_000 - FGC_LIMIT_CENTS, names: ['CDB do banco', 'LCI'] });
    expect(f.withoutInstitution).toEqual({ cents: 1_500_000, names: ['Poupança', 'CDB antigo'] });
    expect(FGC_TEXT.over(f.groups[0]!)).toBe('Banco Azul: R$ 350.000,00 em produtos com garantia do FGC. A garantia vai até R$ 250.000,00 por pessoa em cada instituição ou conglomerado.');
    expect(f.totalCents).toBe(36_500_000);
  });

  it('ganho real e proventos do ano por tipo e por mês', () => {
    expect(realRate(0.1, 0.04)).toBeCloseTo(0.0576923, 6);
    const s = incomeSummary(
      [mv('rendimento', 61_000, '2026-03-10', { incomeKind: 'dividendo' }), mv('rendimento', 15_000, '2026-03-20', { incomeKind: 'jcp' }), mv('rendimento', 48_000, '2026-05-15', { incomeKind: 'fii' }), mv('rendimento', 1_000, '2026-06-01'), mv('rendimento', 9_999, '2025-12-01', { incomeKind: 'jcp' }), mv('aporte', 1, '2026-01-01')],
      2026,
      TODAY,
    );
    expect(s.totalCents).toBe(125_000);
    expect(s.byKind.map((k) => [k.kind, k.cents])).toEqual([
      ['dividendo', 61_000],
      ['fii', 48_000],
      ['jcp', 15_000],
      ['sem_tipo', 1_000],
    ]);
    expect(s.byMonth).toHaveLength(11);
    expect(s.byMonth[2]).toEqual({ month: '2026-03', cents: 76_000 });
  });
});

describe('valor pela taxa contratada (D-099, item 8)', () => {
  const flat = (v: number): Record<string, number> => {
    const out: Record<string, number> = {};
    for (let y = 2024; y <= 2026; y += 1) for (let m = 1; m <= 12; m += 1) out[`${y}-${String(m).padStart(2, '0')}`] = v;
    return out;
  };
  const indices: MarketIndices = { cdi: flat(0.9), ipca: flat(0.35), selic: flat(0.89), poupanca: flat(0.6), fetchedOn: TODAY, example: false };

  it('calendário do mercado: Carnaval, Sexta-feira Santa e Corpus Christi não são dias úteis', () => {
    expect(isMarketBusinessDay('2026-02-16')).toBe(false);
    expect(isMarketBusinessDay('2026-02-17')).toBe(false);
    expect(isMarketBusinessDay('2026-02-18')).toBe(true);
    expect(isMarketBusinessDay('2026-04-03')).toBe(false);
    expect(isMarketBusinessDay('2026-06-04')).toBe(false);
    expect(isMarketBusinessDay('2026-11-20')).toBe(false);
    expect(isMarketBusinessDay('2026-11-14')).toBe(false);
    expect(marketBusinessDaysInMonth('2026-02')).toBe(18);
  });

  it('100% do CDI num mês cheio dá exatamente o CDI do mês; 110% rende mais por dia útil', () => {
    const m = [mv('aporte', 1_000_000, '2026-09-01')];
    expect(estimateValueByRate({ indexKind: 'cdi', rateBp: 10000 }, m, indices, '2026-10-01')).toEqual({ valueCents: 1_009_000, baseOn: null, projectedFrom: null, lastIndexMonth: '2026-12' });
    const n = marketBusinessDaysInMonth('2026-09');
    const daily = 1.009 ** (1 / n) - 1;
    expect(estimateValueByRate({ indexKind: 'cdi', rateBp: 11000 }, m, indices, '2026-10-01')!.valueCents).toBe(Math.round(1_000_000 * (1 + 1.1 * daily) ** n));
  });

  it('Selic sem taxa, IPCA mais zero e prefixado', () => {
    const m = [mv('aporte', 1_000_000, '2026-09-01')];
    expect(estimateValueByRate({ indexKind: 'selic', rateBp: 0 }, m, indices, '2026-10-01')!.valueCents).toBe(1_008_900);
    expect(estimateValueByRate({ indexKind: 'ipca', rateBp: 0 }, m, indices, '2026-10-01')!.valueCents).toBe(1_003_500);
    let du = 0;
    for (let x = new Date(Date.UTC(2026, 0, 2)); x < new Date(Date.UTC(2026, 10, 11)); x.setUTCDate(x.getUTCDate() + 1)) if (isMarketBusinessDay(x.toISOString().slice(0, 10))) du += 1;
    expect(estimateValueByRate({ indexKind: 'prefixado', rateBp: 1200 }, [mv('aporte', 1_000_000, '2026-01-02')], null, TODAY)!.valueCents).toBe(Math.round(1_000_000 * 1.12 ** (du / 252)));
  });

  it('parte do último valor do extrato; aportes depois entram, resgates e rendimentos pagos saem', () => {
    const m = [mv('aporte', 1_000_000, '2026-01-02'), mv('valor', 1_050_000, '2026-09-01'), mv('rendimento', 50_000, '2026-09-01')];
    expect(estimateValueByRate({ indexKind: 'cdi', rateBp: 10000 }, m, indices, '2026-10-01')).toMatchObject({ valueCents: 1_059_450, baseOn: '2026-09-01' });
  });

  it('mês sem índice publicado repete o último; sem série nenhuma ou variável, nada', () => {
    const short: MarketIndices = { ...indices, cdi: { '2026-08': 0.9, '2026-09': 0.9 } };
    const e = estimateValueByRate({ indexKind: 'cdi', rateBp: 10000 }, [mv('aporte', 1_000_000, '2026-09-01')], short, '2026-11-02');
    expect(e).toMatchObject({ projectedFrom: '2026-10', lastIndexMonth: '2026-09' });
    expect(estimateValueByRate({ indexKind: 'cdi', rateBp: 10000 }, [mv('aporte', 1_000_000, '2026-09-01')], { ...indices, cdi: {} }, TODAY)).toBeNull();
    expect(estimateValueByRate({ indexKind: 'variavel', rateBp: null }, [mv('aporte', 1, '2026-09-01')], indices, TODAY)).toBeNull();
    expect(estimateValueByRate({ indexKind: 'selic', rateBp: 0 }, [mv('aporte', 1, '2026-09-01')], { ...indices, selic: undefined }, TODAY)).toBeNull();
  });

  it('poupança: a rentabilidade do mês em cada aniversário completo', () => {
    expect(estimateValueByRate({ indexKind: 'poupanca', rateBp: null }, [mv('aporte', 100_000, '2026-08-15')], indices, '2026-11-14')!.valueCents).toBe(Math.round(100_000 * 1.006 ** 2));
    // Depósito no dia 31: aniversário no dia 1 (01/09, 01/10 e 01/11).
    expect(estimateValueByRate({ indexKind: 'poupanca', rateBp: null }, [mv('aporte', 100_000, '2026-07-31')], indices, '2026-10-31')!.valueCents).toBe(Math.round(100_000 * 1.006 ** 2));
    expect(estimateValueByRate({ indexKind: 'poupanca', rateBp: null }, [mv('aporte', 100_000, '2026-07-31')], indices, '2026-11-01')!.valueCents).toBe(Math.round(100_000 * 1.006 ** 3));
  });
});

describe('resumo para a declaração (D-099, item 9)', () => {
  const items = [
    inv({ id: 'cdb', name: 'CDB', subkind: 'cdb', institution: 'Banco Azul', firstMovementOn: '2025-03-10' }),
    inv({ id: 'acao', name: 'Ações', kind: 'acoes', subkind: 'acao', institution: 'Corretora Sol' }),
    inv({ id: 'pgbl', name: 'Previdência', kind: 'previdencia', subkind: 'pgbl' }),
    inv({ id: 'novo', name: 'Novo', subkind: 'lci' }),
  ];
  const movements = [
    mv('aporte', 1_000_000, '2025-03-10', { investmentId: 'cdb' }),
    mv('valor', 1_080_000, '2025-12-31', { investmentId: 'cdb' }),
    mv('valor', 1_150_000, '2026-12-15', { investmentId: 'cdb' }),
    mv('rendimento', 20_000, '2026-06-01', { investmentId: 'cdb', incomeKind: 'juros' }),
    mv('aporte', 500_000, '2026-02-01', { investmentId: 'acao' }),
    mv('rendimento', 30_000, '2026-05-01', { investmentId: 'acao', incomeKind: 'dividendo' }),
    mv('rendimento', 10_000, '2026-05-01', { investmentId: 'acao', incomeKind: 'jcp' }),
    mv('rendimento', 5_000, '2026-07-01', { investmentId: 'acao' }),
    mv('aporte', 200_000, '2026-04-01', { investmentId: 'pgbl' }),
    mv('aporte', 100_000, '2027-01-02', { investmentId: 'novo' }),
  ];

  it('grupo e código, custo de compra, valores em 31/12, rendimentos por regra e informes', () => {
    const s = declarationSummary(items, movements, 2026);
    expect(s.items.map((i) => i.investmentId)).toEqual(['cdb', 'acao', 'pgbl']);
    const cdb = s.items[0]!;
    expect(cdb).toMatchObject({ group: '04', code: '02', previousCents: 1_080_000, currentCents: 1_150_000, currentEstimated: false, costBased: false });
    expect(cdb.description).toBe('CDB ou RDB na instituição Banco Azul, aplicado desde 10/03/2025.');
    expect(s.items[1]).toMatchObject({ group: '03', code: '01', costBased: true, previousCents: null, currentCents: null });
    expect(s.items[2]).toMatchObject({ pgbl: true, group: null });
    expect(s.income).toEqual({ exemptCents: 30_000, exclusiveCents: 30_000, otherCents: 5_000 });
    expect(s.institutions).toEqual(['Banco Azul', 'Corretora Sol']);
    const prev = declarationSummary(items, movements, 2025);
    expect(prev.items.map((i) => i.investmentId)).toEqual(['cdb']);
    expect(prev.items[0]).toMatchObject({ previousCents: null, currentCents: 1_080_000, currentEstimated: false });
    expect(prev.items[0]!.startedInYear).toBe(true);
    expect(DECLARATION_TEXT.values(prev.items[0]!, 2025)).toBe('Valor registrado em 31/12/2024: R$ 0,00 (começou em 2025). Em 31/12/2025: R$ 10.800,00.');
    expect(DECLARATION_TEXT.values(cdb, 2026, true)).toBe('Valor registrado em 31/12/2025: R$ 10.800,00. Hoje: R$ 11.500,00.');
  });

  it('anos oferecidos: o de hoje e os dois anteriores com movimento', () => {
    expect(declarationYears(movements, TODAY)).toEqual([2026, 2025]);
    expect(declarationYears([], TODAY)).toEqual([2026]);
  });
});

describe('repositório da demonstração: a ficha ao editar (D-099, F5)', () => {
  it('sem a ficha, ela fica como está; com o tipo mudado, só o tipo exato sai; o tipo do rendimento sem o campo também fica', async () => {
    const { createDemoRepository, newOperationKey } = await import('../src');
    const repo = await createDemoRepository();
    const space = (await repo.getSpace())!;
    const ctx = space.personalContextId;
    const all = await repo.listInvestments(ctx);
    const cdb = all.find((i) => i.subkind === 'cdb')!;
    expect(cdb).toMatchObject({ institution: 'Banco Exemplo', indexKind: 'cdi', rateBp: 10500 });
    const kept = await repo.updateInvestment(newOperationKey(), cdb.id, cdb.version, { name: 'Outro nome', kind: 'renda_fixa' });
    expect(kept.investment).toMatchObject({ name: 'Outro nome', subkind: 'cdb', institution: 'Banco Exemplo', rateBp: 10500 });
    const moved = await repo.updateInvestment(newOperationKey(), cdb.id, kept.investment!.version, { name: 'Outro nome', kind: 'fundos' });
    expect(moved.investment).toMatchObject({ kind: 'fundos', subkind: null, institution: 'Banco Exemplo', indexKind: 'cdi' });
    const income = await repo.addInvestmentMovement(newOperationKey(), cdb.id, 'rendimento', { amountCents: 1_000, occurredOn: '2026-10-01', note: null, incomeKind: 'juros' });
    const m = income.movement!;
    const same = await repo.updateInvestmentMovement(newOperationKey(), m.id, m.version, { amountCents: 1_200, occurredOn: '2026-10-01', note: null });
    expect(same.movement).toMatchObject({ amountCents: 1_200, incomeKind: 'juros' });
    const cleared = await repo.updateInvestmentMovement(newOperationKey(), m.id, same.movement!.version, { amountCents: 1_200, occurredOn: '2026-10-01', note: null, incomeKind: null });
    expect(cleared.movement!.incomeKind).toBeNull();
  });
});
