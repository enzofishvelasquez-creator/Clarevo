import { sha256Hex } from '../sha256';
import type { ItemDoFeed } from './feed';
import { TEMAS_NOTICIAS, licencaEfetiva, type FonteNoticias, type TemaNoticia } from './fontes';
import { corpoCitaMercado, foraDaLinhaEditorial, normalizar, temaDaNoticia } from './filtro';
import { MAX_TEXTO_DA_MATERIA, filtrarHtml, resumir, textoPuro } from './html';

/**
 * Notícias do site (D-117, `docs/22_SITE.md`, seção 18): de cada feed lido, a lista que a página mostra. Para cada notícia: confere o
 * link e a data, decide a regra de licença (texto inteiro só quando a fonte e o crédito permitem), monta o resumo curto (do próprio feed;
 * nunca do corpo de uma fonte que só permite resumo), aplica o filtro de temas e a linha editorial, filtra o HTML do texto inteiro e dá um
 * identificador estável. Depois junta as fontes, tira as repetidas e põe a mais nova primeiro.
 */

export { FONTES_NOTICIAS, FONTES_PUBLICAS, PORTAIS_PRIVADOS, NOTICIAS_TEXT, TEMAS_NOTICIAS, feedPermitido, fontesParaLer, licencaEfetiva } from './fontes';
export type { FonteNoticias, LicencaNoticias, TemaNoticia, TipoDeFonte } from './fontes';

export const NOTICIAS_FUSO = 'America/Sao_Paulo';
/** No máximo tantas notícias na lista. */
export const MAX_NOTICIAS = 30;
/** Uma notícia com data mais de 2 dias no futuro (relógio errado na fonte) fica de fora. */
const FUTURO_MS = 2 * 24 * 60 * 60 * 1000;
/** Um corpo com menos texto que isto não é a matéria inteira (é uma chamada com link), e a notícia fica com "Ler na fonte". */
const MIN_TEXTO_DO_CORPO = 400;
/**
 * A linha fina de uma fonte que permite o texto inteiro (gov.br, CC BY-ND 3.0) aparece inteira, sem corte, até este tamanho (as conferidas
 * têm até uns 300 caracteres). Passou disso, vale o resumo curto de duas frases, como nas outras fontes.
 */
const MAX_LINHA_FINA = 600;

/** Uma notícia da lista (o que `/api/noticias` devolve). */
export interface Noticia {
  /** 16 caracteres hexadecimais, do resumo SHA-256 do link: o mesmo link dá sempre o mesmo `id`. */
  id: string;
  titulo: string;
  /** O instante da notícia (ISO). */
  data: string;
  /** A data como a página mostra, no horário de Brasília (dd/mm/aaaa). */
  dataTexto: string;
  /** O nome da fonte (crédito). */
  fonte: string;
  fonteId: string;
  /** O link da matéria na fonte. */
  link: string;
  /** Uma ou duas frases do próprio feed, ou `null`. */
  resumo: string | null;
  tema: TemaNoticia;
  temaRotulo: string;
  /** O texto inteiro pode ser lido no site ("Ler aqui")? Senão, "Ler na fonte". */
  textoCompleto: boolean;
}

/** A notícia com o que só a página de leitura usa (o texto inteiro fica no servidor até alguém abrir a matéria). */
export interface NoticiaCompleta extends Noticia {
  /** O crédito da autoria, como a página mostra ("Por Fulana de Tal, repórter da Agência Brasil"), ou `null`. */
  autor: string | null;
  /** A linha de licença da fonte. */
  licenca: string;
  /**
   * O corpo como o feed trouxe (só com `textoCompleto`; senão, `null`). O filtro de HTML roda só quando alguém abre a matéria
   * (`htmlDaMateria`), para a busca dos feeds gastar pouco processamento.
   */
  corpoHtml: string | null;
}

/** A matéria que `/api/noticias/materia` devolve. */
export type Materia = Omit<NoticiaCompleta, 'corpoHtml'> & { html: string };

/** Agências e veículos parceiros que a Agência Brasil republica: matéria que cita um deles fica só com resumo. */
const PARCEIROS = /\b(Reuters|AFP|France[- ]Presse|EFE|Lusa|ANSA|Xinhua|Bloomberg|Associated Press|Sputnik|Deutsche Welle|RFI|BBC|Agência Gov|Agência Senado|Agência Câmara|TV Brasil|Rádio Nacional|Radioagência)\b/i;

/**
 * A autoria da própria Agência Brasil: "Agência Brasil" ou "Nome - Repórter da Agência Brasil" (com hífen, meia-risca ou traço, como o
 * feed escreve; "Nome e Nome - Repórteres da Agência Brasil" também). O nome não pode ter outro traço, parênteses, vírgula nem ponto e
 * vírgula: assim "Fulana - Repórter da TV Brasil - Repórter da Agência Brasil" e "Fulana (Reuters) - Repórter da Agência Brasil" não passam.
 */
const AUTORIA_DA_AGENCIA = /^(?:agência brasil|[^*()[\],;\-\u2010-\u2015\u2500]+?\s*[-\u2010-\u2015\u2500]\s*rep[oó]rter(?:a|es|as)? da agência brasil)$/i;

/**
 * A matéria é da própria Agência Brasil? A autoria tem de ser a da agência (`AUTORIA_DA_AGENCIA`), com um "repórter" só, sem asterisco (que
 * marca colaboração) e sem citar agência ou veículo parceiro; e o texto não pode ter "com informações de" nem citar agência ou veículo
 * parceiro. Na dúvida, a matéria fica só com título e link.
 */
export function creditoDaAgenciaBrasil(autor: string | null, corpoTexto: string): boolean {
  if (!autor) return false;
  const a = autor.replace(/\s+/g, ' ').trim();
  if (a.length > 200 || a.includes('*')) return false;
  if (!AUTORIA_DA_AGENCIA.test(a)) return false;
  if ((a.match(/rep[oó]rter/gi) ?? []).length > 1) return false;
  if (PARCEIROS.test(a)) return false;
  if (/com informaç(?:ões|ão) d[aeo]s?\s/i.test(corpoTexto)) return false;
  return !PARCEIROS.test(corpoTexto);
}

/** O crédito como a página mostra: "Por Nome, repórter da Agência Brasil" (sem o traço do feed), ou o nome como veio. */
export function creditoDaAutoria(autor: string | null): string | null {
  if (!autor) return null;
  const a = autor.replace(/\*/g, '').replace(/\s+/g, ' ').trim();
  if (a === '') return null;
  const m = /^(.+?)\s*[-\u2010-\u2015\u2500]\s*(rep[oó]rter.*)$/i.exec(a);
  if (m) return `Por ${m[1]!.trim()}, ${m[2]!.charAt(0).toLowerCase()}${m[2]!.slice(1)}`;
  return a.replace(/[\u2013\u2014\u2500]/g, '-');
}

/**
 * O horário de Brasília sem `Intl`: três horas antes do UTC (o Brasil não tem horário de verão desde 2019). No worker, o primeiro
 * formatador do `Intl` com fuso custa mais processamento que toda a preparação das notícias (carrega os dados de fusos).
 */
const BRASILIA_MS = -3 * 60 * 60 * 1000;
const doisDigitos = (n: number) => String(n).padStart(2, '0');

/** A data e a hora de um instante no horário de Brasília: `{ data: 'dd/mm/aaaa', hora: 'hh:mm' }`. */
export function horarioDeBrasilia(instante: Date | number | string): { data: string; hora: string } {
  const d = new Date(new Date(instante).getTime() + BRASILIA_MS);
  return {
    data: `${doisDigitos(d.getUTCDate())}/${doisDigitos(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`,
    hora: `${doisDigitos(d.getUTCHours())}:${doisDigitos(d.getUTCMinutes())}`,
  };
}

/** O link sem âncora, com o host em minúsculas: a chave do `id` e da repetição. */
function linkNormalizado(link: string): string {
  const u = new URL(link);
  u.hash = '';
  return u.href;
}

export const idDaNoticia = (link: string): string => sha256Hex(linkNormalizado(link)).slice(0, 16);

/** Uma notícia de um feed, pronta para a lista, ou `null` se ela fica de fora (sem título, link, data, fora dos temas ou da linha editorial). */
export function prepararNoticia(item: ItemDoFeed, fonte: FonteNoticias, agora: number): NoticiaCompleta | null {
  const titulo = item.titulo.slice(0, 300);
  if (titulo === '' || !item.link || item.data === null) return null;
  if (item.data > agora + FUTURO_MS) return null;
  let host: string;
  try {
    host = new URL(item.link).hostname;
  } catch {
    return null;
  }
  // Link para fora dos sites da fonte: descartado (um feed adulterado não manda ninguém para outro lugar).
  if (!fonte.hosts.includes(host)) return null;

  // O corpo só é lido quando a licença da fonte permite o texto inteiro: nas outras ele nunca é usado (nem para o resumo).
  const licencaPermite = licencaEfetiva(fonte) === 'texto_completo';
  const corpoTexto = licencaPermite && item.corpoHtml ? textoPuro(item.corpoHtml) : '';
  const creditoOk = fonte.credito === 'agencia-brasil' ? creditoDaAgenciaBrasil(item.autor, corpoTexto) : true;
  const permiteTexto = licencaPermite && creditoOk;

  // O resumo: o resumo curto do próprio feed (inteiro, se a fonte permite o texto inteiro e ele é curto; senão, até duas frases); sem
  // resumo no feed, só quando a licença permite o texto inteiro, o primeiro parágrafo do corpo.
  let resumo: string | null = null;
  if (item.resumoHtml) {
    const texto = textoPuro(item.resumoHtml).replace(/\s+/g, ' ').trim();
    resumo = permiteTexto && texto.length <= MAX_LINHA_FINA ? texto : resumir(texto);
  } else if (permiteTexto && corpoTexto !== '') {
    const primeiro = corpoTexto
      .split(/\n{2,}/)
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .find((p) => p.length >= 40);
    if (primeiro) resumo = resumir(primeiro);
  }
  if (resumo === '') resumo = null;

  const assuntos = item.categorias.join('. ');
  const tema = temaDaNoticia(`${titulo}. ${assuntos}`, resumo ?? '');
  if (!tema) return null;
  if (foraDaLinhaEditorial(`${titulo}. ${resumo ?? ''}. ${assuntos}`)) return null;

  const textoCompleto =
    permiteTexto && item.corpoHtml !== null && corpoTexto.length >= MIN_TEXTO_DO_CORPO && corpoTexto.length <= MAX_TEXTO_DA_MATERIA && !corpoCitaMercado(corpoTexto);

  const data = new Date(item.data);
  return {
    id: idDaNoticia(item.link),
    titulo,
    data: data.toISOString(),
    dataTexto: horarioDeBrasilia(data).data,
    fonte: fonte.nome,
    fonteId: fonte.id,
    link: item.link,
    resumo,
    tema,
    temaRotulo: TEMAS_NOTICIAS[tema],
    textoCompleto,
    autor: creditoDaAutoria(item.autor),
    licenca: fonte.linhaDeLicenca,
    corpoHtml: textoCompleto ? item.corpoHtml : null,
  };
}

/** O texto filtrado de cada matéria, feito na primeira leitura e guardado junto da notícia (some com a cópia). */
const HTML_DAS_MATERIAS = new WeakMap<NoticiaCompleta, string | null>();

/** O texto inteiro de uma notícia, filtrado (veja `html.ts`), ou `null` se ela não tem texto inteiro ou nada sobra do filtro. */
export function htmlDaMateria(n: NoticiaCompleta): string | null {
  if (!n.textoCompleto || !n.corpoHtml) return null;
  if (!HTML_DAS_MATERIAS.has(n)) HTML_DAS_MATERIAS.set(n, filtrarHtml(n.corpoHtml, n.link));
  return HTML_DAS_MATERIAS.get(n) ?? null;
}

/** As notícias de um feed, prontas para a lista (as que ficam de fora já saem aqui). */
export function prepararFonte(fonte: FonteNoticias, itens: readonly ItemDoFeed[], agora: number): NoticiaCompleta[] {
  const lista: NoticiaCompleta[] = [];
  for (const item of itens) {
    const n = prepararNoticia(item, fonte, agora);
    if (n) lista.push(n);
  }
  return lista;
}

/** A chave de repetição pelo título (sem acento, sem pontuação). */
const chaveDoTitulo = (t: string) => normalizar(t).replace(/[^a-z0-9 ]/g, '');

/**
 * Junta as notícias já preparadas de todas as fontes: tira as repetidas (mesmo link ou mesmo título; fica a que tem o texto inteiro e,
 * depois, a da fonte que vem antes na lista), põe a mais nova primeiro e guarda no máximo `MAX_NOTICIAS`.
 */
export function juntarPreparadas(porFonte: readonly { fonte: FonteNoticias; noticias: readonly NoticiaCompleta[] }[], ordem: readonly FonteNoticias[] = porFonte.map((p) => p.fonte)): NoticiaCompleta[] {
  const todas: { n: NoticiaCompleta; posicao: number }[] = [];
  for (const { fonte, noticias } of porFonte) {
    const posicao = Math.max(0, ordem.findIndex((f) => f.id === fonte.id));
    for (const n of noticias) todas.push({ n, posicao });
  }
  todas.sort((a, b) => Number(b.n.textoCompleto) - Number(a.n.textoCompleto) || a.posicao - b.posicao || b.n.data.localeCompare(a.n.data));
  const links = new Set<string>();
  const titulos = new Set<string>();
  const unicas: NoticiaCompleta[] = [];
  for (const { n } of todas) {
    const l = linkNormalizado(n.link);
    const t = chaveDoTitulo(n.titulo);
    if (links.has(l) || titulos.has(t)) continue;
    links.add(l);
    titulos.add(t);
    unicas.push(n);
  }
  unicas.sort((a, b) => b.data.localeCompare(a.data) || a.titulo.localeCompare(b.titulo, 'pt-BR'));
  return unicas.slice(0, MAX_NOTICIAS);
}

/** Prepara e junta as notícias de todas as fontes (`prepararFonte` e `juntarPreparadas` de uma vez). */
export function juntarNoticias(porFonte: readonly { fonte: FonteNoticias; itens: readonly ItemDoFeed[] }[], agora: number, ordem: readonly FonteNoticias[] = porFonte.map((p) => p.fonte)): NoticiaCompleta[] {
  return juntarPreparadas(
    porFonte.map(({ fonte, itens }) => ({ fonte, noticias: prepararFonte(fonte, itens, agora) })),
    ordem,
  );
}

/** A notícia como a lista mostra (sem o texto inteiro, a autoria e a licença). */
export function paraLista(n: NoticiaCompleta): Noticia {
  return {
    id: n.id,
    titulo: n.titulo,
    data: n.data,
    dataTexto: n.dataTexto,
    fonte: n.fonte,
    fonteId: n.fonteId,
    link: n.link,
    resumo: n.resumo,
    tema: n.tema,
    temaRotulo: n.temaRotulo,
    textoCompleto: n.textoCompleto,
  };
}
