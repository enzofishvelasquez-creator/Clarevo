import type { IsoDate } from '../dates';
import { addDays, addMonths, monthOf, todayIn } from '../dates';
import { bcbSeriesUrl } from '../investments';
import { INDICADORES_FUSO, INDICADORES_TEXT, INDICADOR_IDS, SGS_INDICADORES, exibirRetrato, lerIndicador, type IndicadorId, type RetratoIndicadores, type ValorIndicador } from './index';

/**
 * `/api/indicadores` do site (D-106, `docs/22_SITE.md`, seção 16): o worker do site busca no Banco Central as cinco séries do painel,
 * guarda uma cópia na memória e devolve ao site. O navegador de quem visita só fala com o próprio site (`connect-src 'self'`); nenhuma
 * fonte vê o IP de quem visita. Sem chave, sem segredo, sem log e sem armazenamento: só a cópia em memória, que some quando o worker
 * reinicia. O mesmo código grava o retrato que o gerador do site põe nas páginas (`node scripts/gerar-site.js --atualizar-indicadores`).
 *
 * Cota do plano gratuito da Cloudflare (100 mil pedidos por dia, contando também os que saem da cópia): a página pergunta uma vez ao
 * abrir, nunca de tempos em tempos, e a resposta pode ficar 15 minutos no navegador. O Banco Central é consultado no máximo uma vez por
 * hora por instância do worker (cinco pedidos, um por série); uma falha espera 5 minutos antes de tentar de novo.
 */

/** Uma hora de cópia (o Banco Central publica cada série uma vez por dia; a meta da Selic só muda em reunião do Copom). */
export const INDICADORES_CACHE_MS = 60 * 60 * 1000;
/** Depois de uma falha (ou de uma resposta incompleta), 5 minutos antes de consultar de novo. */
export const INDICADORES_FALHA_MS = 5 * 60 * 1000;
/** Quanto a resposta pode ficar guardada no navegador: 15 minutos. */
export const INDICADORES_NAVEGADOR_S = 15 * 60;
/** Prazo de cada consulta ao Banco Central. */
export const INDICADORES_TIMEOUT_MS = 8000;

export interface IndicadoresFetch {
  (url: string, init: { timeoutMs: number }): Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
}

/**
 * O endereço de cada série, com o período que basta para achar o último número: 30 dias para as séries diárias (a API do Banco Central
 * pede um período nas séries diárias) e 15 meses para o IPCA, que precisa dos últimos 12 meses publicados.
 */
export function enderecosDosIndicadores(hoje: IsoDate): Record<IndicadorId, string> {
  const ha30dias = addDays(hoje, -30);
  return {
    selic: bcbSeriesUrl(SGS_INDICADORES.selic, ha30dias, hoje),
    cdi: bcbSeriesUrl(SGS_INDICADORES.cdi, ha30dias, hoje),
    ipca: bcbSeriesUrl(SGS_INDICADORES.ipca, `${addMonths(monthOf(hoje), -15)}-01`, hoje),
    poupanca: bcbSeriesUrl(SGS_INDICADORES.poupanca, ha30dias, hoje),
    ptax: bcbSeriesUrl(SGS_INDICADORES.ptax, ha30dias, hoje),
  };
}

/**
 * Consulta as cinco séries ao mesmo tempo. Cada uma é independente: a que falhar fica de fora (e entra em `falhas`), sem levar as outras.
 * `agora`: o instante da consulta (milissegundos), que vira `consultadoEm` e decide o dia de hoje em Brasília.
 */
export async function buscarRetrato(deps: { fetch: IndicadoresFetch; agora: number }): Promise<{ retrato: RetratoIndicadores; falhas: IndicadorId[] }> {
  const instante = new Date(deps.agora);
  const hoje = todayIn(INDICADORES_FUSO, instante);
  const enderecos = enderecosDosIndicadores(hoje);
  const lidos = await Promise.all(
    INDICADOR_IDS.map(async (id): Promise<[IndicadorId, ValorIndicador | null]> => {
      try {
        const r = await deps.fetch(enderecos[id], { timeoutMs: INDICADORES_TIMEOUT_MS });
        if (!r.ok) return [id, null];
        return [id, lerIndicador(id, await r.json(), hoje)];
      } catch {
        return [id, null];
      }
    }),
  );
  const valores: Partial<Record<IndicadorId, ValorIndicador>> = {};
  const falhas: IndicadorId[] = [];
  for (const [id, v] of lidos) {
    if (v) valores[id] = v;
    else falhas.push(id);
  }
  return { retrato: { consultadoEm: instante.toISOString(), valores }, falhas };
}

/** A resposta de `/api/indicadores`: o retrato, o texto de cada número (o mesmo das páginas) e a linha "Atualizado em". */
export function corpoDosIndicadores(retrato: RetratoIndicadores): string {
  return JSON.stringify({
    fonte: INDICADORES_TEXT.fonte,
    consultadoEm: retrato.consultadoEm,
    atualizado: retrato.consultadoEm ? INDICADORES_TEXT.atualizado(retrato.consultadoEm) : null,
    valores: retrato.valores,
    exibicao: exibirRetrato(retrato),
  });
}

export interface IndicadoresResposta {
  status: number;
  body: string;
  headers: Record<string, string>;
}

const JSON_TYPE = 'application/json; charset=utf-8';

/**
 * O atendimento de `/api/indicadores`. Só GET e HEAD (o resto, 405). Com uma cópia de menos de uma hora, devolve a cópia. Senão consulta
 * o Banco Central: com as cinco séries, guarda por uma hora; com parte delas, junta com a cópia anterior (cada número com a data dele) e
 * tenta de novo em 5 minutos; sem nenhuma, devolve a cópia anterior, se houver, ou 503 (a página continua com o retrato da geração).
 * Pedidos que chegam durante uma consulta esperam a mesma consulta, sem repetir.
 */
export function createIndicadoresHandler(deps: { fetch: IndicadoresFetch; agora?: () => number; cacheMs?: number; falhaMs?: number }) {
  const agora = deps.agora ?? (() => Date.now());
  const cacheMs = deps.cacheMs ?? INDICADORES_CACHE_MS;
  const falhaMs = deps.falhaMs ?? INDICADORES_FALHA_MS;
  let copia: { retrato: RetratoIndicadores; ate: number } | null = null;
  let emCurso: Promise<void> | null = null;

  const consultar = async () => {
    const t = agora();
    const { retrato, falhas } = await buscarRetrato({ fetch: deps.fetch, agora: t });
    const novos = INDICADOR_IDS.length - falhas.length;
    if (novos === 0) {
      // Nada veio: a cópia anterior (se houver) continua, e a próxima tentativa espera 5 minutos.
      if (copia) copia = { retrato: copia.retrato, ate: t + falhaMs };
      else copia = null;
      return;
    }
    const valores = { ...(copia?.retrato.valores ?? {}), ...retrato.valores };
    copia = { retrato: { consultadoEm: retrato.consultadoEm, valores }, ate: t + (falhas.length === 0 ? cacheMs : falhaMs) };
  };

  let semNadaAte = 0;
  return async (req: { method: string }): Promise<IndicadoresResposta> => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return { status: 405, body: JSON.stringify({ erro: 'metodo' }), headers: { 'Content-Type': JSON_TYPE, 'Cache-Control': 'no-store', Allow: 'GET, HEAD' } };
    }
    const t = agora();
    const valida = copia !== null && t < copia.ate;
    if (!valida && t >= semNadaAte) {
      emCurso ??= consultar().finally(() => {
        emCurso = null;
      });
      await emCurso;
      if (copia === null) semNadaAte = agora() + falhaMs;
    }
    if (copia === null) {
      return { status: 503, body: JSON.stringify({ erro: 'indisponivel' }), headers: { 'Content-Type': JSON_TYPE, 'Cache-Control': 'no-store' } };
    }
    const body = corpoDosIndicadores(copia.retrato);
    return { status: 200, body: req.method === 'HEAD' ? '' : body, headers: { 'Content-Type': JSON_TYPE, 'Cache-Control': `public, max-age=${INDICADORES_NAVEGADOR_S}` } };
  };
}
