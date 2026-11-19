import { formatDateTimeBR } from '../dates';
import { MAX_BYTES_DO_FEED, lerFeed, type ItemDoFeed } from './feed';
import { FONTES_NOTICIAS, feedPermitido, fontesParaLer, type FonteNoticias } from './fontes';
import { NOTICIAS_FUSO, juntarNoticias, paraLista, type NoticiaCompleta } from './index';

/**
 * `/api/noticias` e `/api/noticias/materia` do site (D-117, `docs/22_SITE.md`, seção 18), com o mesmo desenho de `/api/indicadores`
 * (seção 16): o worker busca os feeds configurados (`fontes.ts`), guarda uma cópia na memória por uma hora e devolve ao site. O navegador
 * de quem visita só fala com o próprio site; nenhuma fonte vê o IP de quem visita. Sem chave, sem log e sem armazenamento: só a cópia em
 * memória, que some quando o worker reinicia.
 *
 * Proteção contra SSRF: só os endereços de `FONTES_NOTICIAS` são buscados (`feedPermitido` confere cada um antes da busca); o `id` da
 * matéria só procura na cópia, e nenhum endereço do pedido, de um feed ou de uma matéria é buscado. O worker também não segue
 * redirecionamento (um feed que mude de endereço falha até alguém conferir e mudar a lista).
 *
 * Quem liga é o worker: com a variável `NOTICIAS` diferente de `ligado`, as duas rotas respondem 404 antes de chegar aqui.
 */

/** Uma hora de cópia. */
export const NOTICIAS_CACHE_MS = 60 * 60 * 1000;
/** Depois de uma falha (ou de parte dos feeds), 5 minutos antes de buscar de novo. */
export const NOTICIAS_FALHA_MS = 5 * 60 * 1000;
/** Quanto a resposta pode ficar guardada no navegador: 15 minutos. */
export const NOTICIAS_NAVEGADOR_S = 15 * 60;
/** Prazo de cada busca. */
export const NOTICIAS_TIMEOUT_MS = 8000;
/** O que o worker pede no cabeçalho `Accept`. */
export const ACEITA_FEED = 'application/rss+xml, application/atom+xml, application/rdf+xml;q=0.9, application/xml;q=0.8, text/xml;q=0.8';

export interface NoticiasFetch {
  (url: string, init: { timeoutMs: number; maxBytes: number }): Promise<{ ok: boolean; status: number; text: () => Promise<string | null> }>;
}

/** Busca e lê um feed. `null` se a busca falhar, o feed for grande demais ou não for um feed. O endereço é conferido antes. */
export async function buscarFeed(fonte: FonteNoticias, deps: { fetch: NoticiasFetch; fontes?: readonly FonteNoticias[] }): Promise<ItemDoFeed[] | null> {
  if (!feedPermitido(fonte.feed, deps.fontes ?? FONTES_NOTICIAS)) return null;
  try {
    const r = await deps.fetch(fonte.feed, { timeoutMs: NOTICIAS_TIMEOUT_MS, maxBytes: MAX_BYTES_DO_FEED });
    if (!r.ok) return null;
    const xml = await r.text();
    if (typeof xml !== 'string' || xml.length > MAX_BYTES_DO_FEED) return null;
    return lerFeed(xml, { base: fonte.feed })?.itens ?? null;
  } catch {
    return null;
  }
}

export interface NoticiasResposta {
  status: number;
  body: string;
  headers: Record<string, string>;
}

const JSON_TYPE = 'application/json; charset=utf-8';
const erro = (status: number, codigo: string, extra: Record<string, string> = {}): NoticiasResposta => ({
  status,
  body: JSON.stringify({ erro: codigo }),
  headers: { 'Content-Type': JSON_TYPE, 'Cache-Control': 'no-store', ...extra },
});
const ok = (body: string, metodo: string): NoticiasResposta => ({
  status: 200,
  body: metodo === 'HEAD' ? '' : body,
  headers: { 'Content-Type': JSON_TYPE, 'Cache-Control': `public, max-age=${NOTICIAS_NAVEGADOR_S}` },
});

/** O `id` de uma matéria: 16 caracteres hexadecimais. */
export const ID_VALIDO = /^[0-9a-f]{16}$/;

/** A resposta da lista: as notícias, a hora da consulta e as fontes ("leia direto nas fontes"). */
export function corpoDaLista(lista: readonly NoticiaCompleta[], consultadoEm: string, fontes: readonly FonteNoticias[] = FONTES_NOTICIAS): string {
  return JSON.stringify({
    consultadoEm,
    atualizado: `Atualizado em ${formatDateTimeBR(consultadoEm, NOTICIAS_FUSO)}, horário de Brasília.`,
    fontes: fontesParaLer(fontes).map((f) => ({ nome: f.nome, site: f.site })),
    noticias: lista.map(paraLista),
  });
}

/**
 * O atendimento das duas rotas. `rota`: `lista` ou `materia`; `id`: o parâmetro `id` da página de leitura (só procurado na cópia). Só
 * GET e HEAD (o resto, 405). Com uma cópia de menos de uma hora, usa a cópia. Senão busca os feeds ao mesmo tempo, cada um independente:
 * o feed que falha fica com as notícias da busca anterior, se houver, e a próxima tentativa espera 5 minutos; sem nenhum feed e sem cópia,
 * 503. Pedidos que chegam durante uma busca esperam a mesma busca.
 */
export function createNoticiasHandler(deps: { fetch: NoticiasFetch; agora?: () => number; cacheMs?: number; falhaMs?: number; fontes?: readonly FonteNoticias[] }) {
  const agora = deps.agora ?? (() => Date.now());
  const cacheMs = deps.cacheMs ?? NOTICIAS_CACHE_MS;
  const falhaMs = deps.falhaMs ?? NOTICIAS_FALHA_MS;
  const fontes = deps.fontes ?? FONTES_NOTICIAS;
  /** O último feed lido de cada fonte. */
  const porFonte = new Map<string, readonly ItemDoFeed[]>();
  let copia: { lista: NoticiaCompleta[]; consultadoEm: string; ate: number } | null = null;
  let emCurso: Promise<void> | null = null;
  let semNadaAte = 0;

  const consultar = async () => {
    const t = agora();
    const lidos = await Promise.all(fontes.map(async (f) => [f, await buscarFeed(f, { fetch: deps.fetch, fontes })] as const));
    let falhas = 0;
    for (const [f, itens] of lidos) {
      if (itens) porFonte.set(f.id, itens);
      else falhas++;
    }
    if (falhas === fontes.length) {
      // Nada veio: a cópia anterior (se houver) continua, e a próxima tentativa espera 5 minutos.
      if (copia) copia = { ...copia, ate: t + falhaMs };
      return;
    }
    const lista = juntarNoticias(
      fontes.filter((f) => porFonte.has(f.id)).map((f) => ({ fonte: f, itens: porFonte.get(f.id)! })),
      t,
      fontes,
    );
    copia = { lista, consultadoEm: new Date(t).toISOString(), ate: t + (falhas === 0 ? cacheMs : falhaMs) };
  };

  return async (req: { method: string; rota: 'lista' | 'materia'; id?: string | null }): Promise<NoticiasResposta> => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return erro(405, 'metodo', { Allow: 'GET, HEAD' });
    if (req.rota === 'materia' && !ID_VALIDO.test(req.id ?? '')) return erro(400, 'id');
    const t = agora();
    const valida = copia !== null && t < copia.ate;
    if (!valida && t >= semNadaAte) {
      emCurso ??= consultar().finally(() => {
        emCurso = null;
      });
      await emCurso;
      if (copia === null) semNadaAte = agora() + falhaMs;
    }
    if (copia === null) return erro(503, 'indisponivel');
    if (req.rota === 'lista') return ok(corpoDaLista(copia.lista, copia.consultadoEm, fontes), req.method);
    const n = copia.lista.find((x) => x.id === req.id);
    // Só a notícia com o texto inteiro permitido tem página de leitura; o resto é 404 (a página manda para a fonte).
    if (!n || !n.textoCompleto || !n.html) return erro(404, 'nao-encontrada');
    const { html, ...resto } = n;
    return ok(JSON.stringify({ ...paraLista(n), autor: resto.autor, licenca: resto.licenca, html }), req.method);
  };
}
