import { describe, expect, it } from 'vitest';
import {
  DEMO_TODAY,
  calcLinkParams,
  calcParceladoOuAVista,
  calcPrefill,
  calcQuitarAntes,
  cotaUnicaLink,
  createDemoRepository,
  custoPorAnoLink,
  multaLink,
  quitarAntesLink,
  type CalcLinkValues,
  type CalcPrefill,
  type CalcSlug,
} from '../src';

/** Ida e volta: valores → parâmetros de endereço → campos preenchidos. */
function roundTrip<S extends CalcSlug>(slug: S, values: CalcLinkValues<S>, expected: CalcPrefill<S>) {
  const params = calcLinkParams(slug, values);
  for (const v of Object.values(params)) expect(typeof v).toBe('string');
  expect(calcPrefill(slug, params)).toEqual(expected);
}

describe('links de contexto: ida e volta', () => {
  it('parcelado-ou-a-vista (compra e cota única)', () => {
    roundTrip('parcelado-ou-a-vista', { avistaCents: 108_000, parcelaCents: 12_000, parcelas: 10, origem: 'serie' }, {
      aVista: '1.080,00',
      parcela: '120,00',
      parcelas: '10',
      origem: 'serie',
    });
    roundTrip('parcelado-ou-a-vista', { modo: 'cota-unica', parcelaCents: 18_000, parcelas: 10 }, { modo: 'cota-unica', parcela: '180,00', parcelas: '10' });
    expect(calcLinkParams('parcelado-ou-a-vista', { parcelas: 10, parcelaCents: 12_000 })).toEqual({ parcelas: '10', parcela: '12000' });
  });

  it('custo-por-ano, custo-da-divida, multa-e-juros, reserva, juntar-para-objetivo e dividir-contas', () => {
    roundTrip('custo-por-ano', { valorCents: 250_000, frequencia: 'mes' }, { valor: '2.500,00', frequencia: 'mes' });
    roundTrip('custo-da-divida', { tipo: 'emprestimo', valorCents: 500_000, parcelas: 12 }, { tipo: 'emprestimo', valor: '5.000,00', parcelas: '12' });
    roundTrip('multa-e-juros', { valorCents: 15_000, dias: 10, origem: 'conta' }, { valor: '150,00', dias: '10', origem: 'conta' });
    roundTrip('reserva', { essenciaisCents: 375_000 }, { essenciais: '3.750,00' });
    roundTrip('juntar-para-objetivo', { alvoCents: 2_250_000, modo: 'mensal' }, { alvo: '22.500,00', modo: 'mensal' });
    roundTrip('dividir-contas', { totalCents: 334_000, origem: 'familia' }, { total: '3.340,00', origem: 'familia' });
    expect(calcLinkParams('multa-e-juros', { valorCents: 15_000, dias: 10 })).toEqual({ valor: '15000', dias: '10' });
  });

  it('quitar-antes com prazos (dias separados por vírgula; vencidos viram 0)', () => {
    const params = calcLinkParams('quitar-antes', { parcelaCents: 85_000, restantes: 3, prazosEmDias: [-4, 26, 57] });
    expect(params).toEqual({ parcela: '85000', parcelas: '3', prazos: '0,26,57' });
    expect(calcPrefill('quitar-antes', params)).toEqual({ parcela: '850,00', restantes: '3', prazosEmDias: [0, 26, 57] });
    // Sem "parcelas": restantes = quantidade de prazos.
    expect(calcPrefill('quitar-antes', { prazos: '10,40' })).toEqual({ restantes: '2', prazosEmDias: [10, 40] });
    // Quantidade diferente: prazos ignorados.
    expect(calcPrefill('quitar-antes', { parcelas: '3', prazos: '10,40' })).toEqual({ restantes: '3' });
    // "parcelas" inválido derruba também os prazos.
    expect(calcPrefill('quitar-antes', { parcelas: '0', prazos: '10' })).toEqual({});
    const many = Array.from({ length: 480 }, (_, k) => 30 * (k + 1));
    roundTrip('quitar-antes', { restantes: 480, prazosEmDias: many, modo: 'ultimas' }, { restantes: '480', prazosEmDias: many, modo: 'ultimas' });
    expect(calcPrefill('quitar-antes', { prazos: [...many, 1].join(',') })).toEqual({});
  });

  it('parâmetros inválidos são ignorados, nunca lançam', () => {
    expect(calcPrefill('nao-existe', { valor: '100' })).toEqual({});
    expect(calcPrefill('multa-e-juros', { valor: 'abc', dias: '0' })).toEqual({});
    expect(calcPrefill('multa-e-juros', { valor: '0', dias: '3651' })).toEqual({});
    expect(calcPrefill('multa-e-juros', { valor: '1000000000', dias: '3.650' })).toEqual({});
    expect(calcPrefill('multa-e-juros', { valor: ['20000', '1'], dias: ['10'] })).toEqual({ valor: '200,00', dias: '10' });
    expect(calcPrefill('multa-e-juros', { valor: undefined, origem: 'Com Espaço' })).toEqual({});
    expect(calcPrefill('parcelado-ou-a-vista', { parcelas: '1', modo: 'x' })).toEqual({});
    expect(calcPrefill('parcelado-ou-a-vista', { modo: 'cota-unica', parcelas: '13' })).toEqual({ modo: 'cota-unica' });
    expect(calcPrefill('parcelado-ou-a-vista', { valor: '12000' })).toEqual({ parcela: '120,00' });
    expect(calcPrefill('custo-por-ano', { frequencia: 'ano' })).toEqual({});
    expect(calcPrefill('custo-da-divida', { modo: 'cartao', parcelas: '121' })).toEqual({});
    expect(calcPrefill('quitar-antes', { prazos: '1,a,3' })).toEqual({});
    expect(calcPrefill('dividir-contas', { valor: '1000', modo: 'renda' })).toEqual({ total: '10,00', modo: 'renda' });
  });

  it('o preenchimento entra direto na calculadora', () => {
    const p = calcPrefill('parcelado-ou-a-vista', calcLinkParams('parcelado-ou-a-vista', { avistaCents: 108_000, parcelaCents: 12_000, parcelas: 10 }));
    const out = calcParceladoOuAVista({ aVista: p.aVista!, parcela: p.parcela!, parcelas: p.parcelas!, primeiraNaCompra: false });
    expect(out.ok && out.result.differenceCents).toBe(12_000);
  });
});

describe('links de contexto a partir da demonstração', () => {
  it('financiamento do carro: parcela, restantes e prazos pelos vencimentos', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const series = await repo.listSeries(ctx);
    const fin = series.find((s) => s.nature === 'financiamento')!;
    const link = quitarAntesLink(fin, await repo.listSeriesOccurrences(fin.id), await repo.listOpenSeriesOccurrences(fin.id), DEMO_TODAY)!;
    expect(link.parcelaCents).toBe(85_000);
    expect(link.restantes).toBe(36);
    expect(link.prazosEmDias).toHaveLength(36);
    // Parcela 13 em 10/11/2026: 34 dias depois de 07/10/2026; parcela 14 em 10/12/2026: 64.
    expect(link.prazosEmDias!.slice(0, 2)).toEqual([34, 64]);
    const p = calcPrefill('quitar-antes', calcLinkParams('quitar-antes', link));
    expect(p).toMatchObject({ parcela: '850,00', restantes: '36', origem: 'serie' });
    const out = calcQuitarAntes({ parcela: p.parcela!, restantes: p.restantes!, taxaMes: '1,5', modo: 'tudo', prazosEmDias: p.prazosEmDias });
    expect(out.ok && out.result.usesDueDates).toBe(true);
    // Conferido em Python: Σ 85.000 ÷ 1,015^(dias ÷ 30) com dias 34, 64, 95, …, 1.099 = 2.338.942,40.
    expect(out.ok && out.result.presentValueCents).toBe(2_338_942);
    expect(link.prazosEmDias![35]).toBe(1_099);
    // Gasto fixo e conta do ano não têm o link.
    for (const s of series.filter((x) => x.kind !== 'parcelada')) expect(quitarAntesLink(s, [], [], DEMO_TODAY)).toBeNull();
  });

  it('conta do ano (IPVA cota única e IPTU em 10 parcelas) e gasto fixo mensal (Aluguel)', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const series = await repo.listSeries(ctx);
    const by = (d: string) => series.find((s) => s.terms[0]!.description === d)!;
    expect(cotaUnicaLink(by('IPVA'), DEMO_TODAY)).toEqual({ modo: 'cota-unica', avistaCents: 240_000, origem: 'serie' });
    expect(cotaUnicaLink(by('IPTU'), DEMO_TODAY)).toEqual({ modo: 'cota-unica', parcelas: 10, parcelaCents: 18_000, origem: 'serie' });
    expect(cotaUnicaLink(by('Aluguel'), DEMO_TODAY)).toBeNull();
    expect(custoPorAnoLink(by('Aluguel'), DEMO_TODAY)).toEqual({ valorCents: 250_000, frequencia: 'mes', origem: 'serie' });
    expect(custoPorAnoLink(by('IPVA'), DEMO_TODAY)).toBeNull();
    expect(calcPrefill('parcelado-ou-a-vista', calcLinkParams('parcelado-ou-a-vista', cotaUnicaLink(by('IPVA'), DEMO_TODAY)!))).toEqual({
      modo: 'cota-unica',
      aVista: '2.400,00',
      origem: 'serie',
    });
  });

  it('conta vencida: valor e dias depois do vencimento; a vencer ou paga: sem link', () => {
    expect(multaLink({ status: 'aberto', dueOn: '2026-10-05', amountCents: 15_000 }, '2026-10-15')).toEqual({ valorCents: 15_000, dias: 10, origem: 'conta' });
    expect(multaLink({ status: 'aberto', dueOn: '2026-10-15', amountCents: 15_000 }, '2026-10-15')).toBeNull();
    expect(multaLink({ status: 'quitado', dueOn: '2026-10-05', amountCents: 15_000 }, '2026-10-15')).toBeNull();
    expect(multaLink({ status: 'aberto', dueOn: '2010-01-01', amountCents: 1 }, '2026-10-15')!.dias).toBe(3_650);
  });
});
