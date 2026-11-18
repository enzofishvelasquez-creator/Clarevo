import type { IsoDate, IsoMonth } from '../dates';
import { addMonths, formatDateBR, formatDateTimeBR, formatMonthSpanBR, formatMonthYearBR, isValidIsoDate, monthOf, parseDateBR } from '../dates';
import { BCB_SERIES, indexOverMonths } from '../investments';
import { formatInteger } from '../learn/format';

/**
 * Indicadores oficiais do site (D-106, `docs/22_SITE.md`, seção 16): Selic (meta), CDI, IPCA em 12 meses, rendimento da poupança e
 * dólar PTAX, sempre com a data do dado, a hora da consulta e "Fonte: Banco Central do Brasil". Este arquivo é a parte leve, que o
 * gerador do site e o worker de `/api/indicadores` usam: os códigos das séries do Sistema Gerenciador de Séries Temporais (SGS) do
 * Banco Central, a leitura das respostas, as contas (CDI ao ano e IPCA acumulado) e os textos de cada número. Quem busca as séries é
 * `servidor.ts`; o texto das páginas fica em `conteudo.ts`.
 *
 * Nada aqui é cotação ao vivo nem previsão: são os últimos números que o Banco Central publicou, cada um com a data dele.
 */

export type IndicadorId = 'selic' | 'cdi' | 'ipca' | 'poupanca' | 'ptax';
export const INDICADOR_IDS: readonly IndicadorId[] = ['selic', 'cdi', 'ipca', 'poupanca', 'ptax'];

/**
 * Séries do SGS: meta da Selic definida pelo Copom (432, % ao ano, por dia), CDI (12, % ao dia, nos dias úteis), IPCA (433, variação
 * mensal, a mesma da função `indices` do app), rendimento da poupança pela regra de 04/05/2012 (195, % no período, por data de
 * aniversário, também da função `indices`) e dólar dos Estados Unidos, venda, PTAX de fechamento (1, R$ por dólar, nos dias úteis).
 */
export const SGS_INDICADORES: Readonly<Record<IndicadorId, number>> = { selic: 432, cdi: 12, ipca: BCB_SERIES.ipca, poupanca: BCB_SERIES.poupanca, ptax: 1 };

/** O fuso das datas e horas que o site mostra. */
export const INDICADORES_FUSO = 'America/Sao_Paulo';

/**
 * Um número lido do Banco Central. `valor`: selic, % ao ano; cdi, % ao ano (a taxa do dia anualizada em 252 dias úteis); ipca, % em 12
 * meses; poupanca, % no período; ptax, R$ por dólar. `data`: o dia do dado (selic, cdi, ptax), o começo do período (poupanca) ou o dia
 * 1 do último mês (ipca). `dia`: a taxa do CDI ao dia. `mes`: a variação do IPCA no último mês. `fim`: o fim do período da poupança.
 */
export interface ValorIndicador {
  valor: number;
  data: IsoDate;
  dia?: number;
  mes?: number;
  fim?: IsoDate;
}

/** O retrato: quando a Clarevo consultou o Banco Central (instante ISO) e o que veio, indicador por indicador. */
export interface RetratoIndicadores {
  consultadoEm: string | null;
  valores: Partial<Record<IndicadorId, ValorIndicador>>;
}

/** Faixas de bom senso: um número fora delas é descartado (nunca um número estranho com o nome do Banco Central ao lado). */
export const FAIXAS_INDICADORES: Readonly<Record<IndicadorId | 'cdiDia' | 'ipcaMes', readonly [number, number]>> = {
  selic: [0, 50],
  cdi: [0, 60],
  cdiDia: [0, 0.2],
  ipca: [-20, 100],
  ipcaMes: [-10, 10],
  poupanca: [0, 3],
  ptax: [0.5, 50],
};

const dentro = (faixa: readonly [number, number], v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= faixa[0] && v <= faixa[1];

/** Uma linha do SGS: `{ "data": "17/11/2026", "valor": "15.00" }` (a poupança traz também `"dataFim"`; aceita também `"datafim"`). */
export interface LinhaSgs {
  data: IsoDate;
  valor: number;
  fim: IsoDate | null;
}

/** Lê a resposta do SGS: só as linhas com data dd/mm/aaaa e valor numérico (com ponto ou vírgula), na ordem da data. O resto é ignorado. */
export function lerLinhasSgs(json: unknown): LinhaSgs[] {
  if (!Array.isArray(json)) return [];
  const linhas: LinhaSgs[] = [];
  for (const row of json) {
    if (typeof row !== 'object' || row === null) continue;
    const r = row as { data?: unknown; valor?: unknown; dataFim?: unknown; datafim?: unknown };
    const data = typeof r.data === 'string' ? parseDateBR(r.data) : null;
    const valor = typeof r.valor === 'number' ? r.valor : typeof r.valor === 'string' && /^-?\d+(?:[.,]\d+)?$/.test(r.valor.trim()) ? Number(r.valor.trim().replace(',', '.')) : NaN;
    if (!data || !Number.isFinite(valor)) continue;
    const fimBruto = typeof r.dataFim === 'string' ? r.dataFim : r.datafim;
    const fim = typeof fimBruto === 'string' ? parseDateBR(fimBruto) : null;
    linhas.push({ data, valor, fim });
  }
  return linhas.sort((a, b) => a.data.localeCompare(b.data));
}

/** Arredonda para `casas` casas sem o ruído do ponto flutuante: (14.896, 2) → 14,9. */
function arredondar(valor: number, casas: number): number {
  const f = 10 ** casas;
  return Math.round(Number((valor * f).toFixed(6))) / f;
}

/** Taxa ao dia (em %) anualizada em 252 dias úteis, com 2 casas: 0,055131 → 14,90. */
export function anualizarTaxaDiaria(percentualAoDia: number): number {
  return arredondar(Math.expm1(252 * Math.log1p(percentualAoDia / 100)) * 100, 2);
}

/**
 * IPCA acumulado nos 12 meses que terminam no último mês da série (variações mensais em %), com 2 casas, pela conta do núcleo
 * (`indexOverMonths`: as taxas se multiplicam). Null se faltar algum dos 12 meses.
 */
export function ipcaDozeMeses(serie: Readonly<Record<IsoMonth, number>>): { valor: number; ultimoMes: IsoMonth; mes: number } | null {
  const meses = Object.keys(serie).sort();
  const ultimo = meses[meses.length - 1];
  if (!ultimo) return null;
  const doze = Array.from({ length: 12 }, (_, i) => addMonths(ultimo, i - 11));
  const acumulado = indexOverMonths(serie, doze);
  if (acumulado === null) return null;
  return { valor: arredondar(acumulado * 100, 2), ultimoMes: ultimo, mes: serie[ultimo]! };
}

/** A última linha com data até `hoje`. */
const ultimaAte = (linhas: readonly LinhaSgs[], hoje: IsoDate): LinhaSgs | null => linhas.filter((l) => l.data <= hoje).pop() ?? null;

/**
 * O número de um indicador a partir da resposta da série dele no SGS, ou null quando a resposta não tem um número que passe nas faixas.
 * O IPCA usa as variações mensais (dia 1 de cada mês) e acumula os últimos 12 meses publicados.
 */
export function lerIndicador(id: IndicadorId, json: unknown, hoje: IsoDate): ValorIndicador | null {
  const linhas = lerLinhasSgs(json);
  if (id === 'ipca') {
    const serie: Record<IsoMonth, number> = {};
    for (const l of linhas) if (l.data.endsWith('-01') && l.data <= hoje && dentro(FAIXAS_INDICADORES.ipcaMes, l.valor)) serie[monthOf(l.data)] = l.valor;
    const ac = ipcaDozeMeses(serie);
    if (!ac || !dentro(FAIXAS_INDICADORES.ipca, ac.valor)) return null;
    return { valor: ac.valor, data: `${ac.ultimoMes}-01`, mes: ac.mes };
  }
  const l = ultimaAte(linhas, hoje);
  if (!l) return null;
  if (id === 'cdi') {
    if (!dentro(FAIXAS_INDICADORES.cdiDia, l.valor)) return null;
    const anual = anualizarTaxaDiaria(l.valor);
    return dentro(FAIXAS_INDICADORES.cdi, anual) ? { valor: anual, data: l.data, dia: l.valor } : null;
  }
  if (!dentro(FAIXAS_INDICADORES[id], l.valor)) return null;
  if (id === 'poupanca') return l.fim && l.fim > l.data ? { valor: l.valor, data: l.data, fim: l.fim } : null;
  return { valor: l.valor, data: l.data };
}

const INSTANTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Um instante ISO válido ("2026-11-17T16:12:00.000Z"). */
export function instanteValido(valor: unknown): valor is string {
  return typeof valor === 'string' && INSTANTE.test(valor) && !Number.isNaN(Date.parse(valor));
}

/**
 * Confere um retrato vindo de fora (o arquivo do site ou a resposta da API): fica só o que tem o formato e passa nas faixas. Um retrato
 * ilegível vira um retrato vazio, nunca um erro.
 */
export function retratoDeJson(json: unknown): RetratoIndicadores {
  const vazio: RetratoIndicadores = { consultadoEm: null, valores: {} };
  if (typeof json !== 'object' || json === null) return vazio;
  const j = json as { consultadoEm?: unknown; valores?: unknown };
  const valores: Partial<Record<IndicadorId, ValorIndicador>> = {};
  const brutos = typeof j.valores === 'object' && j.valores !== null ? (j.valores as Record<string, unknown>) : {};
  for (const id of INDICADOR_IDS) {
    const v = brutos[id] as Partial<ValorIndicador> | undefined;
    if (!v || typeof v !== 'object' || typeof v.data !== 'string' || !isValidIsoDate(v.data) || !dentro(FAIXAS_INDICADORES[id], v.valor)) continue;
    const item: ValorIndicador = { valor: v.valor, data: v.data };
    if (id === 'cdi') {
      if (!dentro(FAIXAS_INDICADORES.cdiDia, v.dia)) continue;
      item.dia = v.dia;
    }
    if (id === 'ipca') {
      if (!dentro(FAIXAS_INDICADORES.ipcaMes, v.mes) || !v.data.endsWith('-01')) continue;
      item.mes = v.mes;
    }
    if (id === 'poupanca') {
      if (typeof v.fim !== 'string' || !isValidIsoDate(v.fim) || v.fim <= v.data) continue;
      item.fim = v.fim;
    }
    valores[id] = item;
  }
  const consultadoEm = instanteValido(j.consultadoEm) ? j.consultadoEm : null;
  // Sem a hora da consulta, os números não podem dizer de quando são: o retrato fica vazio.
  return consultadoEm ? { consultadoEm, valores } : vazio;
}

/** Número com vírgula e `casas` casas, sem o ruído do ponto flutuante: (15, 2) → "15,00"; (5.387, 4) → "5,3870". */
export function numeroBR(valor: number, casas: number): string {
  const f = 10 ** casas;
  const escalado = Math.round(Number((Math.abs(valor) * f).toFixed(6)));
  const inteiro = formatInteger(Math.floor(escalado / f));
  const decimais = casas > 0 ? `,${String(escalado % f).padStart(casas, '0')}` : '';
  return `${valor < 0 && escalado > 0 ? '-' : ''}${inteiro}${decimais}`;
}

/** O que o site mostra de um indicador: o nome, o número, a unidade, a data e, no IPCA, a linha do último mês. */
export interface ExibicaoIndicador {
  nome: string;
  numero: string;
  unidade: string;
  data: string;
  extra: string | null;
}

export const INDICADORES_TEXT = {
  tituloPainel: 'Indicadores oficiais',
  fonte: 'Fonte: Banco Central do Brasil.',
  /** O aviso do rodapé das páginas de mercado (indicadores, glossário, explicações e resumo semanal). */
  avisoMercado: 'Conteúdo educativo. Não é recomendação nem análise de valores mobiliários.',
  nomes: {
    selic: 'Selic (meta)',
    cdi: 'CDI',
    ipca: 'IPCA em 12 meses',
    poupanca: 'Rendimento da poupança',
    ptax: 'Dólar PTAX (Banco Central)',
  } satisfies Record<IndicadorId, string>,
  /** O retrato gravado na geração do site, que a página mostra sem JavaScript ou quando a consulta falha. */
  retrato: (instante: string) => `Retrato de ${formatDateTimeBR(instante, INDICADORES_FUSO)}, horário de Brasília.`,
  /** Depois que a página consulta o próprio servidor. */
  atualizado: (instante: string) => `Atualizado em ${formatDateTimeBR(instante, INDICADORES_FUSO)}, horário de Brasília.`,
  semRetrato: 'Ainda não há um retrato salvo destes números. Com o JavaScript ligado, a página busca os números do Banco Central quando abre.',
  numeroAusente: 'Sem número',
  naoAoVivo: 'São os últimos números que o Banco Central publicou, cada um com a data dele. Não são cotações ao vivo nem previsões.',
  comoAtualiza:
    'Quando você abre a página, ela pergunta ao próprio site da Clarevo, uma vez só. O servidor do site consulta o Banco Central em geral uma vez por hora (depois de uma falha, de novo em alguns minutos) e guarda uma cópia. O seu navegador não fala com nenhum outro site.',
} as const;

/** A data de um dado para o texto: "17/11/2026". */
const dataBR = (iso: IsoDate) => formatDateBR(iso);
const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** O texto de um indicador, com o número ou, sem ele, "Sem número". */
export function exibirIndicador(id: IndicadorId, v: ValorIndicador | null | undefined): ExibicaoIndicador {
  const nome = INDICADORES_TEXT.nomes[id];
  // Sem número, a linha da hora (`semRetrato`) já explica: a data fica vazia, sem repetir "Sem número".
  if (!v) return { nome, numero: INDICADORES_TEXT.numeroAusente, unidade: '', data: '', extra: null };
  switch (id) {
    case 'selic':
      return { nome, numero: `${numeroBR(v.valor, 2)}%`, unidade: 'ao ano', data: `Meta em vigor em ${dataBR(v.data)}`, extra: null };
    case 'cdi':
      return { nome, numero: `${numeroBR(v.valor, 2)}%`, unidade: 'ao ano', data: `Taxa de ${dataBR(v.data)}, em 252 dias úteis`, extra: null };
    case 'ipca': {
      const mes = monthOf(v.data);
      return {
        nome,
        numero: `${numeroBR(v.valor, 2)}%`,
        unidade: 'em 12 meses',
        data: `Acumulado ${formatMonthSpanBR(addMonths(mes, -11), mes)}`,
        extra: v.mes === undefined ? null : `${maiuscula(formatMonthYearBR(mes))}: ${numeroBR(v.mes, 2)}% no mês`,
      };
    }
    case 'poupanca':
      return {
        nome,
        numero: `${numeroBR(v.valor, 4)}%`,
        unidade: 'no mês',
        data: `De ${dataBR(v.data)} a ${dataBR(v.fim ?? v.data)}, para depósitos com aniversário no dia ${Number(v.data.slice(8, 10))}`,
        extra: null,
      };
    case 'ptax':
      return { nome, numero: `R$ ${numeroBR(v.valor, 4)}`, unidade: 'por dólar, na venda', data: `Fechamento de ${dataBR(v.data)}`, extra: null };
  }
}

/** O texto de todos os indicadores de um retrato, na ordem do painel. */
export function exibirRetrato(retrato: RetratoIndicadores): Record<IndicadorId, ExibicaoIndicador> {
  return Object.fromEntries(INDICADOR_IDS.map((id) => [id, exibirIndicador(id, retrato.valores[id])])) as Record<IndicadorId, ExibicaoIndicador>;
}

/** Quantos indicadores o retrato tem. */
export const indicadoresNoRetrato = (retrato: RetratoIndicadores): number => INDICADOR_IDS.filter((id) => retrato.valores[id]).length;
