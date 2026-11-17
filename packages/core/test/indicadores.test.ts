import { describe, expect, it, vi } from 'vitest';
import { CALCULATORS, SITE_CALCULATORS, publishedTopics } from '../src';
import {
  FAIXAS_INDICADORES,
  INDICADORES_TEXT,
  INDICADOR_IDS,
  SGS_INDICADORES,
  anualizarTaxaDiaria,
  exibirIndicador,
  exibirRetrato,
  ipcaDozeMeses,
  lerIndicador,
  lerLinhasSgs,
  numeroBR,
  retratoDeJson,
  type RetratoIndicadores,
} from '../src/indicadores';
import {
  AVISO_DE_MERCADO,
  GLOSSARIO,
  INDICADORES_REVIEWED_ON,
  PAGINAS_INDICADORES,
  exemploDaSelic,
  exemploDoIpca,
  explicacoesDeMercado,
  fontesDasPaginasDeMercado,
} from '../src/indicadores/conteudo';
import { INDICADORES_CACHE_MS, INDICADORES_FALHA_MS, buscarRetrato, createIndicadoresHandler, enderecosDosIndicadores, type IndicadoresFetch } from '../src/indicadores/servidor';
import { BCB_SERIES } from '../src/investments';

/**
 * Indicadores oficiais do site (D-106): as séries do SGS, a leitura das respostas do Banco Central, as contas (CDI ao ano e IPCA em 12
 * meses), os textos de cada número, o atendimento de /api/indicadores (cópia de uma hora, falha da fonte, só GET) e o texto das páginas
 * de mercado (sem título, empresa, previsão nem ranking, com fonte).
 */

/** Respostas do SGS no formato da API, como o Banco Central devolve. */
const SGS = {
  selic: [{ data: '13/11/2026', valor: '15.00' }, { data: '14/11/2026', valor: '15.00' }, { data: '17/11/2026', valor: '15.00' }],
  cdi: [{ data: '13/11/2026', valor: '0.055131' }, { data: '14/11/2026', valor: '0.055131' }],
  ipca: Array.from({ length: 13 }, (_, i) => {
    const mes = 10 + i; // de outubro de 2025 a outubro de 2026
    const ano = mes > 12 ? 2026 : 2025;
    const m = mes > 12 ? mes - 12 : mes;
    return { data: `01/${String(m).padStart(2, '0')}/${ano}`, valor: '0.40' };
  }),
  poupanca: [{ data: '16/11/2026', datafim: '16/12/2026', valor: '0.6721' }, { data: '17/11/2026', datafim: '17/12/2026', valor: '0.6719' }],
  ptax: [{ data: '13/11/2026', valor: '5.3911' }, { data: '14/11/2026', valor: '5.3870' }],
};

/** O `fetch` simulado: responde cada série pelo código do endereço. */
function fetchDoBanco(respostas: Partial<Record<string, unknown>> = SGS, falhar: string[] = []) {
  const codigos = Object.fromEntries(Object.entries(SGS_INDICADORES).map(([id, c]) => [`bcdata.sgs.${c}/`, id]));
  const f = vi.fn<IndicadoresFetch>(async (url) => {
    const id = Object.entries(codigos).find(([k]) => url.includes(k))?.[1];
    if (!id) throw new Error(`endereço inesperado ${url}`);
    if (falhar.includes(id)) return { ok: false, status: 500, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => respostas[id] };
  });
  return f;
}

const AGORA = Date.parse('2026-11-17T16:12:00.000Z'); // 13:12 em Brasília

describe('indicadores: séries e leitura', () => {
  it('os códigos das séries: 432, 12, 433 e 195 (os da função indices do app) e 1', () => {
    expect(SGS_INDICADORES).toEqual({ selic: 432, cdi: 12, ipca: 433, poupanca: 195, ptax: 1 });
    expect(SGS_INDICADORES.ipca).toBe(BCB_SERIES.ipca);
    expect(SGS_INDICADORES.poupanca).toBe(BCB_SERIES.poupanca);
  });

  it('os endereços pedem um período (30 dias nas diárias, 15 meses no IPCA) à API do Banco Central', () => {
    const e = enderecosDosIndicadores('2026-11-17');
    expect(e.selic).toBe('https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?formato=json&dataInicial=18/10/2026&dataFinal=17/11/2026');
    expect(e.ipca).toBe('https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados?formato=json&dataInicial=01/08/2025&dataFinal=17/11/2026');
    expect(Object.values(e).every((u) => u.startsWith('https://api.bcb.gov.br/dados/serie/bcdata.sgs.'))).toBe(true);
  });

  it('lê só linhas com data e número, na ordem da data, com vírgula ou ponto', () => {
    expect(lerLinhasSgs([{ data: '02/01/2026', valor: '1,5' }, { data: '01/01/2026', valor: 2 }, { data: '31/02/2026', valor: '1' }, { data: '03/01/2026', valor: 'abc' }, null, 'x'])).toEqual([
      { data: '2026-01-01', valor: 2, fim: null },
      { data: '2026-01-02', valor: 1.5, fim: null },
    ]);
    expect(lerLinhasSgs({ erro: 'x' })).toEqual([]);
  });

  it('CDI: a taxa ao dia vira taxa ao ano em 252 dias úteis', () => {
    expect(anualizarTaxaDiaria(0.055131)).toBe(14.9);
    expect(anualizarTaxaDiaria(0)).toBe(0);
    expect(lerIndicador('cdi', SGS.cdi, '2026-11-17')).toEqual({ valor: 14.9, data: '2026-11-14', dia: 0.055131 });
  });

  it('IPCA: acumula os últimos 12 meses publicados (as taxas se multiplicam); falta um mês, sem número', () => {
    const serie = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`2026-${String(i + 1).padStart(2, '0')}`, 0.5]));
    expect(ipcaDozeMeses(serie)).toEqual({ valor: 6.17, ultimoMes: '2026-12', mes: 0.5 });
    const comFalta = { ...serie };
    delete comFalta['2026-06'];
    expect(ipcaDozeMeses(comFalta)).toBeNull();
    expect(lerIndicador('ipca', SGS.ipca, '2026-11-17')).toEqual({ valor: 4.91, data: '2026-10-01', mes: 0.4 });
  });

  it('a última linha até hoje, com as faixas de bom senso; a poupança precisa do fim do período', () => {
    expect(lerIndicador('selic', SGS.selic, '2026-11-17')).toEqual({ valor: 15, data: '2026-11-17' });
    expect(lerIndicador('selic', SGS.selic, '2026-11-14')).toEqual({ valor: 15, data: '2026-11-14' });
    expect(lerIndicador('poupanca', SGS.poupanca, '2026-11-17')).toEqual({ valor: 0.6719, data: '2026-11-17', fim: '2026-12-17' });
    expect(lerIndicador('poupanca', [{ data: '17/11/2026', valor: '0.6719' }], '2026-11-17')).toBeNull();
    expect(lerIndicador('ptax', SGS.ptax, '2026-11-17')).toEqual({ valor: 5.387, data: '2026-11-14' });
    expect(lerIndicador('ptax', [{ data: '14/11/2026', valor: '538.70' }], '2026-11-17')).toBeNull();
    expect(lerIndicador('selic', [{ data: '14/11/2026', valor: '-1' }], '2026-11-17')).toBeNull();
    expect(lerIndicador('selic', [], '2026-11-17')).toBeNull();
    expect(FAIXAS_INDICADORES.ptax).toEqual([0.5, 50]);
  });
});

describe('indicadores: o texto de cada número', () => {
  it('número com vírgula, sem ruído do ponto flutuante', () => {
    expect(numeroBR(15, 2)).toBe('15,00');
    expect(numeroBR(5.387, 4)).toBe('5,3870');
    expect(numeroBR(1234.5, 2)).toBe('1.234,50');
    expect(numeroBR(-0.04, 2)).toBe('-0,04');
    expect(numeroBR(1.005, 2)).toBe('1,01');
  });

  it('cada indicador com o número, a unidade e a data; o dólar é "Dólar PTAX (Banco Central)", nunca cotação ao vivo', () => {
    expect(exibirIndicador('selic', { valor: 15, data: '2026-11-17' })).toEqual({ nome: 'Selic (meta)', numero: '15,00%', unidade: 'ao ano', data: 'Meta em vigor em 17/11/2026', extra: null });
    expect(exibirIndicador('cdi', { valor: 14.9, data: '2026-11-14', dia: 0.055131 }).data).toBe('Taxa de 14/11/2026, em 252 dias úteis');
    expect(exibirIndicador('ipca', { valor: 4.91, data: '2026-10-01', mes: 0.4 })).toEqual({
      nome: 'IPCA em 12 meses',
      numero: '4,91%',
      unidade: 'em 12 meses',
      data: 'Acumulado de novembro de 2025 a outubro de 2026',
      extra: 'Outubro de 2026: 0,40% no mês',
    });
    expect(exibirIndicador('poupanca', { valor: 0.6719, data: '2026-11-17', fim: '2026-12-17' }).data).toBe('De 17/11/2026 a 17/12/2026, para depósitos com aniversário no dia 17');
    expect(exibirIndicador('ptax', { valor: 5.387, data: '2026-11-14' })).toEqual({ nome: 'Dólar PTAX (Banco Central)', numero: 'R$ 5,3870', unidade: 'por dólar, na venda', data: 'Fechamento de 14/11/2026', extra: null });
    expect(exibirIndicador('selic', null)).toEqual({ nome: 'Selic (meta)', numero: 'Sem número', unidade: '', data: '', extra: null });
    expect(INDICADORES_TEXT.nomes.ptax).toBe('Dólar PTAX (Banco Central)');
    expect(JSON.stringify(INDICADORES_TEXT)).not.toMatch(/ao vivo"|tempo real|cotação ao vivo do/i);
  });

  it('a hora da consulta em Brasília, a fonte e o aviso das páginas de mercado', () => {
    expect(INDICADORES_TEXT.retrato('2026-11-17T16:12:00.000Z')).toBe('Retrato de 17/11/2026 às 13:12, horário de Brasília.');
    expect(INDICADORES_TEXT.atualizado('2026-11-17T16:12:00.000Z')).toBe('Atualizado em 17/11/2026 às 13:12, horário de Brasília.');
    expect(INDICADORES_TEXT.fonte).toBe('Fonte: Banco Central do Brasil.');
    expect(INDICADORES_TEXT.avisoMercado).toBe('Conteúdo educativo. Não é recomendação nem análise de valores mobiliários.');
    expect(AVISO_DE_MERCADO).toBe(INDICADORES_TEXT.avisoMercado);
  });

  it('um retrato de fora só vale com a hora da consulta e números dentro das faixas', () => {
    const bom: RetratoIndicadores = { consultadoEm: '2026-11-17T16:12:00.000Z', valores: { selic: { valor: 15, data: '2026-11-17' }, ptax: { valor: 5.387, data: '2026-11-14' } } };
    expect(retratoDeJson(bom)).toEqual(bom);
    expect(retratoDeJson({ ...bom, consultadoEm: 'ontem' })).toEqual({ consultadoEm: null, valores: {} });
    expect(retratoDeJson({ consultadoEm: bom.consultadoEm, valores: { selic: { valor: 900, data: '2026-11-17' }, cdi: { valor: 14.9, data: '2026-11-14' } } })).toEqual({ consultadoEm: bom.consultadoEm, valores: {} });
    expect(retratoDeJson(null)).toEqual({ consultadoEm: null, valores: {} });
    expect(Object.keys(exibirRetrato(bom))).toEqual([...INDICADOR_IDS]);
  });
});

describe('indicadores: /api/indicadores (o worker do site)', () => {
  it('busca as cinco séries ao mesmo tempo e grava a hora da consulta', async () => {
    const f = fetchDoBanco();
    const { retrato, falhas } = await buscarRetrato({ fetch: f, agora: AGORA });
    expect(f).toHaveBeenCalledTimes(5);
    expect(falhas).toEqual([]);
    expect(retrato.consultadoEm).toBe('2026-11-17T16:12:00.000Z');
    expect(Object.keys(retrato.valores).sort()).toEqual([...INDICADOR_IDS].sort());
  });

  it('guarda a cópia por uma hora: o segundo pedido não consulta o Banco Central; depois de uma hora, consulta de novo', async () => {
    let t = AGORA;
    const f = fetchDoBanco();
    const atender = createIndicadoresHandler({ fetch: f, agora: () => t });
    const r1 = await atender({ method: 'GET' });
    expect(r1.status).toBe(200);
    expect(r1.headers['Cache-Control']).toBe('public, max-age=900');
    const corpo = JSON.parse(r1.body);
    expect(corpo.fonte).toBe('Fonte: Banco Central do Brasil.');
    expect(corpo.atualizado).toBe('Atualizado em 17/11/2026 às 13:12, horário de Brasília.');
    expect(corpo.exibicao.selic.numero).toBe('15,00%');
    expect(corpo.exibicao.ptax.nome).toBe('Dólar PTAX (Banco Central)');
    expect(f).toHaveBeenCalledTimes(5);
    t += INDICADORES_CACHE_MS - 1;
    await atender({ method: 'GET' });
    expect(f).toHaveBeenCalledTimes(5);
    t += 2;
    await atender({ method: 'GET' });
    expect(f).toHaveBeenCalledTimes(10);
  });

  it('pedidos ao mesmo tempo esperam a mesma consulta', async () => {
    const f = fetchDoBanco();
    const atender = createIndicadoresHandler({ fetch: f, agora: () => AGORA });
    await Promise.all([atender({ method: 'GET' }), atender({ method: 'GET' }), atender({ method: 'GET' })]);
    expect(f).toHaveBeenCalledTimes(5);
  });

  it('a fonte fora do ar: sem cópia, 503 (a página fica com o retrato da geração) e espera 5 minutos antes de tentar de novo', async () => {
    let t = AGORA;
    const f = fetchDoBanco(SGS, [...INDICADOR_IDS]);
    const atender = createIndicadoresHandler({ fetch: f, agora: () => t });
    const r = await atender({ method: 'GET' });
    expect(r.status).toBe(503);
    expect(r.headers['Cache-Control']).toBe('no-store');
    expect(JSON.parse(r.body)).toEqual({ erro: 'indisponivel' });
    await atender({ method: 'GET' });
    expect(f).toHaveBeenCalledTimes(5);
    t += INDICADORES_FALHA_MS;
    await atender({ method: 'GET' });
    expect(f).toHaveBeenCalledTimes(10);
  });

  it('a fonte fora do ar com uma cópia antiga: devolve a cópia, com a hora em que ela foi consultada', async () => {
    let t = AGORA;
    let fora = false;
    const ok = fetchDoBanco();
    const f = vi.fn<IndicadoresFetch>(async (url, init) => (fora ? { ok: false, status: 503, json: async () => ({}) } : ok(url, init)));
    const atender = createIndicadoresHandler({ fetch: f, agora: () => t });
    await atender({ method: 'GET' });
    fora = true;
    t += INDICADORES_CACHE_MS + 1;
    const r = await atender({ method: 'GET' });
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body).consultadoEm).toBe('2026-11-17T16:12:00.000Z');
  });

  it('uma série fora do ar não leva as outras: fica a de antes (com a data dela) e a consulta volta em 5 minutos', async () => {
    let t = AGORA;
    let falhar: string[] = [];
    const f = vi.fn<IndicadoresFetch>((url, init) => fetchDoBanco(SGS, falhar)(url, init));
    const atender = createIndicadoresHandler({ fetch: f, agora: () => t });
    const primeira = await atender({ method: 'GET' });
    expect(Object.keys(JSON.parse(primeira.body).valores)).toHaveLength(5);
    falhar = ['ptax'];
    t += INDICADORES_CACHE_MS;
    const r = JSON.parse((await atender({ method: 'GET' })).body);
    expect(r.valores.ptax).toEqual({ valor: 5.387, data: '2026-11-14' });
    const antes = f.mock.calls.length;
    t += INDICADORES_FALHA_MS;
    await atender({ method: 'GET' });
    expect(f.mock.calls.length).toBe(antes + 5);
  });

  it('só GET e HEAD; HEAD sem corpo', async () => {
    const atender = createIndicadoresHandler({ fetch: fetchDoBanco(), agora: () => AGORA });
    const post = await atender({ method: 'POST' });
    expect([post.status, post.headers.Allow]).toEqual([405, 'GET, HEAD']);
    const head = await atender({ method: 'HEAD' });
    expect([head.status, head.body]).toEqual([200, '']);
  });

  it('uma resposta estranha da fonte (número fora da faixa, formato errado) vira falha daquela série, nunca um número estranho', async () => {
    const f = fetchDoBanco({ ...SGS, selic: [{ data: '17/11/2026', valor: '1500' }], cdi: { erro: 'x' } });
    const { retrato, falhas } = await buscarRetrato({ fetch: f, agora: AGORA });
    expect(falhas.sort()).toEqual(['cdi', 'selic']);
    expect(retrato.valores.selic).toBeUndefined();
  });
});

describe('indicadores: o texto das páginas de mercado', () => {
  const textos = (): string[] => [
    ...PAGINAS_INDICADORES.flatMap((p) => [p.titulo, p.subtitulo, ...p.oQueE, ...p.oQueMuda.flatMap((s) => [s.titulo, s.texto]), p.origem]),
    ...GLOSSARIO.flatMap((t) => [t.termo, t.definicao]),
    ...explicacoesDeMercado().flatMap((e) => [e.titulo, e.subtitulo, e.resumo, ...e.secoes.flatMap((s) => [s.titulo, ...s.paragrafos]), e.exemplo.texto, ...e.exemplo.conta, e.exemplo.hipoteses]),
  ];

  it('uma página por indicador, na ordem do painel, com os títulos que as pessoas buscam', () => {
    expect(PAGINAS_INDICADORES.map((p) => [p.id, p.slug, p.titulo])).toEqual([
      ['selic', 'selic-hoje', 'Selic hoje'],
      ['cdi', 'cdi-hoje', 'CDI hoje'],
      ['ipca', 'ipca-12-meses', 'IPCA em 12 meses'],
      ['poupanca', 'rendimento-da-poupanca', 'Rendimento da poupança hoje'],
      ['ptax', 'dolar-ptax-hoje', 'Dólar PTAX hoje'],
    ]);
    for (const p of PAGINAS_INDICADORES) {
      expect(p.oQueE.length, p.id).toBeGreaterThanOrEqual(2);
      expect(p.oQueMuda, p.id).toHaveLength(3);
      expect(p.origem, p.id).toContain(`érie ${SGS_INDICADORES[p.id]} do`);
      expect(p.fontes.length, p.id).toBeGreaterThan(0);
    }
    // Renda fixa, dívidas e poupança (o dólar fala de compras, contratos e dívidas em dólar).
    expect(PAGINAS_INDICADORES.filter((p) => p.id !== 'ptax').every((p) => p.oQueMuda[0]!.titulo === 'Na renda fixa' && p.oQueMuda[1]!.titulo === 'Nas dívidas')).toBe(true);
  });

  it('os temas de Aprender existem e estão publicados; as calculadoras existem no app ou no site', () => {
    const publicados = new Set(publishedTopics().filter((t) => !t.legacy && ['organizar', 'juros', 'tempo'].includes(t.section)).map((t) => t.slug));
    const calculadoras = new Set([...CALCULATORS, ...SITE_CALCULATORS].map((c) => c.slug as string));
    const temas = [...PAGINAS_INDICADORES.flatMap((p) => p.temas), ...GLOSSARIO.flatMap((t) => t.temas), ...explicacoesDeMercado().flatMap((e) => e.temas)];
    for (const t of temas) expect(publicados.has(t), t).toBe(true);
    for (const c of PAGINAS_INDICADORES.flatMap((p) => p.calculadoras)) expect(calculadoras.has(c), c).toBe(true);
  });

  it('o glossário tem os termos pedidos, em ordem alfabética, e cada termo leva a um tema de Aprender, a uma página de indicador ou a uma fonte', () => {
    const termos = GLOSSARIO.map((t) => t.termo);
    for (const pedido of ['CDI', 'IPCA', 'Selic', 'FGC', 'Come-cotas', 'Marcação a mercado', 'Liquidez', 'IR regressivo', 'IOF', 'PTAX']) expect(termos, pedido).toContain(pedido);
    expect(termos).toEqual([...termos].sort((a, b) => a.localeCompare(b, 'pt-BR')));
    expect(new Set(GLOSSARIO.map((t) => t.id)).size).toBe(GLOSSARIO.length);
    for (const t of GLOSSARIO) expect(t.temas.length + (t.indicador ? 1 : 0) + t.fontes.length, t.termo).toBeGreaterThan(0);
    expect(GLOSSARIO.find((t) => t.id === 'ir-regressivo')!.definicao).toContain('22,5% até 180 dias');
  });

  it('os exemplos das explicações são calculados pelo núcleo', () => {
    expect(exemploDaSelic()).toEqual({ menor: 1_100_000, maior: 1_110_000 });
    expect(exemploDoIpca()).toEqual({ dozeMeses: '6,17%', doisMeses: '2,01%', ganhoReal: '5,26%' });
    const [selic, ipca] = explicacoesDeMercado();
    expect(selic!.titulo).toBe('O que muda quando a Selic muda');
    expect(selic!.exemplo.texto).toContain('R$ 11.000,00 brutos');
    expect(selic!.exemplo.texto).toContain('R$ 11.100,00');
    expect(ipca!.titulo).toBe('Como ler o IPCA');
    expect(ipca!.exemplo.texto).toContain('6,17%');
  });

  it('educação sem recomendação: nada de título, empresa, opinião, previsão, ranking ou "melhores"; sem travessão nem a expressão proibida', () => {
    const tudo = textos().join('\n');
    expect(tudo).not.toMatch(/[–—]/);
    expect(tudo).not.toMatch(/faz\w*\s+sentido/i);
    expect(tudo).not.toMatch(/\bmelhor(es)?\b|ranking|\bcompr(e|ar) (ações|agora)|\bvend(a|er) agora|\brecomend(amos|o)\b|vai (subir|cair)\b(?! ou)|deve (subir|cair)|previs[ãa]o de|\b[A-Z]{4}\d{1,2}\b|Ibovespa|IFIX/);
    expect(tudo).not.toMatch(/Nubank|Inter\b|XP\b|Itaú|Bradesco|Santander|Caixa Econômica|Banco do Brasil/);
    // "Não prevê" aparece, e "vai subir ou cair" só na frase que diz que a Clarevo não diz isso.
    expect(tudo).toContain('A Clarevo não prevê a Selic');
  });

  it('as fontes têm endereço https, publicador e data de consulta, e a revisão é de 17/11/2026', () => {
    expect(INDICADORES_REVIEWED_ON).toBe('2026-11-17');
    for (const s of fontesDasPaginasDeMercado()) {
      if (s.kind !== 'oficial' && s.kind !== 'mercado') throw new Error('fonte sem endereço');
      expect(s.url, s.title).toMatch(/^https:\/\//);
      expect(s.consultedOn, s.title).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    // A página do Copom é o único caminho para o calendário: nada de datas de reunião no texto.
    expect(textos().join('\n')).not.toMatch(/\b\d{1,2} e \d{1,2} de (janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/);
  });
});
