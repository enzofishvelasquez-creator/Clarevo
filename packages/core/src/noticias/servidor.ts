import { MAX_BYTES_DO_FEED, lerFeed, type ItemDoFeed } from './feed';
import { FONTES_NOTICIAS, feedPermitido, fontesParaLer, type FonteNoticias } from './fontes';
import { horarioDeBrasilia, htmlDaMateria, juntarPreparadas, paraLista, prepararFonte, type NoticiaCompleta } from './index';

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

/** Uma hora de cópia: cada feed é buscado no máximo uma vez por hora. */
export const NOTICIAS_CACHE_MS = 60 * 60 * 1000;
/** Um feed que falhou espera 5 minutos antes de ser buscado de novo (só ele; os outros seguem a hora deles). */
export const NOTICIAS_FALHA_MS = 5 * 60 * 1000;
/** O feed que falha fica com as notícias da última busca boa por até 12 horas; depois, as notícias dele saem da lista até ele voltar. */
export const NOTICIAS_VALIDADE_MS = 12 * 60 * 60 * 1000;
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
    return lerFeed(xml, { base: fonte.feed, descricaoEhCorpo: fonte.descricaoEhCorpo === true })?.itens ?? null;
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
  const horario = horarioDeBrasilia(consultadoEm);
  return JSON.stringify({
    consultadoEm,
    atualizado: `Atualizado em ${horario.data} às ${horario.hora}, horário de Brasília.`,
    fontes: fontesParaLer(fontes).map((f) => ({ nome: f.nome, site: f.site })),
    noticias: lista.map(paraLista),
  });
}

/**
 * O atendimento das duas rotas. `rota`: `lista` ou `materia`; `id`: o parâmetro `id` da página de leitura (só procurado na cópia). Só
 * GET e HEAD (o resto, 405). Com a cópia em dia, usa a cópia. Senão busca, ao mesmo tempo, só os feeds que já podem ser buscados de novo:
 * o que deu certo há menos de uma hora espera; o que falhou espera 5 minutos e, enquanto isso, fica com as notícias da última busca boa
 * (por até 12 horas). Cada feed é preparado uma vez, quando chega (as notícias de um feed que não mudou não são refeitas). Sem nenhuma
 * notícia guardada, 503. Pedidos que chegam durante uma busca esperam a mesma busca. O texto filtrado de uma matéria só é feito quando
 * alguém abre a matéria.
 */
export function createNoticiasHandler(deps: { fetch: NoticiasFetch; agora?: () => number; cacheMs?: number; falhaMs?: number; validadeMs?: number; fontes?: readonly FonteNoticias[] }) {
  const agora = deps.agora ?? (() => Date.now());
  const cacheMs = deps.cacheMs ?? NOTICIAS_CACHE_MS;
  const falhaMs = deps.falhaMs ?? NOTICIAS_FALHA_MS;
  const validadeMs = deps.validadeMs ?? NOTICIAS_VALIDADE_MS;
  const fontes = deps.fontes ?? FONTES_NOTICIAS;
  /** As notícias da última busca boa de cada fonte, já preparadas, e quando ela foi. */
  const porFonte = new Map<string, { noticias: NoticiaCompleta[]; lidoEm: number }>();
  /** Quando cada fonte pode ser buscada de novo. */
  const proxima = new Map<string, number>();
  let copia: { lista: NoticiaCompleta[]; consultadoEm: string; ate: number } | null = null;
  let emCurso: Promise<void> | null = null;

  const consultar = async () => {
    const t = agora();
    const devidas = fontes.filter((f) => t >= (proxima.get(f.id) ?? 0));
    const lidos = await Promise.all(devidas.map(async (f) => [f, await buscarFeed(f, { fetch: deps.fetch, fontes })] as const));
    for (const [f, itens] of lidos) {
      if (itens) {
        porFonte.set(f.id, { noticias: prepararFonte(f, itens, t), lidoEm: t });
        proxima.set(f.id, t + cacheMs);
      } else proxima.set(f.id, t + falhaMs);
    }
    for (const [id, v] of porFonte) if (t - v.lidoEm > validadeMs) porFonte.delete(id);
    const ate = Math.min(...fontes.map((f) => proxima.get(f.id) ?? t + falhaMs));
    if (porFonte.size === 0) {
      copia = null;
      return;
    }
    const comNoticias = fontes.filter((f) => porFonte.has(f.id));
    const lista = juntarPreparadas(
      comNoticias.map((f) => ({ fonte: f, noticias: porFonte.get(f.id)!.noticias })),
      fontes,
    );
    // "Atualizado em": a busca boa mais recente.
    const lidoEm = Math.max(...comNoticias.map((f) => porFonte.get(f.id)!.lidoEm));
    copia = { lista, consultadoEm: new Date(lidoEm).toISOString(), ate };
  };

  return async (req: { method: string; rota: 'lista' | 'materia'; id?: string | null }): Promise<NoticiasResposta> => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return erro(405, 'metodo', { Allow: 'GET, HEAD' });
    if (req.rota === 'materia' && !ID_VALIDO.test(req.id ?? '')) return erro(400, 'id');
    const t = agora();
    if (copia === null || t >= copia.ate) {
      emCurso ??= consultar().finally(() => {
        emCurso = null;
      });
      await emCurso;
    }
    if (copia === null) return erro(503, 'indisponivel');
    if (req.rota === 'lista') return ok(corpoDaLista(copia.lista, copia.consultadoEm, fontes), req.method);
    const n = copia.lista.find((x) => x.id === req.id);
    // Só a notícia com o texto inteiro permitido tem página de leitura; o resto é 404 (a página manda para a fonte).
    const html = n ? htmlDaMateria(n) : null;
    if (!n || !html) return erro(404, 'nao-encontrada');
    return ok(JSON.stringify({ ...paraLista(n), autor: n.autor, licenca: n.licenca, html }), req.method);
  };
}
