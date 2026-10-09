import { isCalcSlug } from '../calculators/catalog';
import type { IsoDate } from '../dates';
import { addMonthsToDate, daysBetween, isValidIsoDate } from '../dates';
import { canonicalNumber, expectedExampleNumbers, numbersInText } from './examples';
import { topicWordCount, TOPIC_MAX_WORDS } from './reading';
import type { LearnSource, Topic, TopicSlug } from './types';
import { TOPIC_SLUGS } from './types';

/**
 * Validação do catálogo de Aprender (spec3 §3.6, R1 a R7, R9 e R12, com spec5_notes §2). Devolve a lista de
 * problemas; catálogo correto devolve []. Os textos proibidos (R10) ficam no teste de textos (copy.test.ts).
 */
export type LearnProblemCode =
  | 'slug_invalido'
  | 'slug_repetido'
  | 'catalogo_diferente'
  | 'apelido_invalido'
  | 'apelido_repetido'
  | 'secao_tipo'
  | 'relacionado_desconhecido'
  | 'relacionado_proprio'
  | 'relacionado_repetido'
  | 'relacionados_demais'
  | 'titulo'
  | 'subtitulo'
  | 'pergunta'
  | 'resumo'
  | 'paragrafos'
  | 'exemplo'
  | 'calculo_sem_exemplo'
  | 'palavras_demais'
  | 'sem_fonte'
  | 'fonte_sem_data'
  | 'fonte_data_invalida'
  | 'fonte_endereco'
  | 'fonte_externa_faltando'
  | 'fonte_clarevo_faltando'
  | 'referencia_formato'
  | 'decisao_desconhecida'
  | 'referencia_desconhecida'
  | 'revisao_data'
  | 'revisao_prazo'
  | 'revisao_vencida'
  | 'numero_nao_conferido'
  | 'fato_fonte'
  | 'fato_fora_do_texto'
  | 'hipoteses_faltando'
  | 'hipoteses_sem_ficticio'
  | 'marca_pendente'
  | 'rascunho_sem_pendencia'
  | 'pendencia_em_publicado'
  | 'calculadora';

export interface LearnProblem {
  code: LearnProblemCode;
  slug: string;
  detail?: string;
}

export interface LearnValidationOptions {
  today: IsoDate;
  /** Decisões registradas em docs/00 ("D-021"); sem a lista, a existência não é conferida. */
  decisionIds?: readonly string[];
  /** Referências de docs/referencias ("CL C005", "CL-V007"); sem a lista, a existência não é conferida. */
  referenceIds?: readonly string[];
}

/** Domínios aceitos em fontes oficiais (R5): órgãos públicos (gov.br), Legislativo (leg.br), Judiciário (jus.br) e Defensorias (def.br). */
export const OFFICIAL_SOURCE_DOMAINS: readonly string[] = ['gov.br', 'leg.br', 'jus.br', 'def.br'];

/** Fontes privadas identificadas (P-024): domínio e temas em que podem aparecer. */
export const MARKET_SOURCE_DOMAINS: Readonly<Record<string, readonly string[]>> = {
  'fgc.org.br': ['fgc'],
  'serasa.com.br': ['renda-comprometida'],
};

/** Temas revisados a cada 6 meses (quadro do Anexo A); os demais com fonte externa, a cada 12. */
export const SIX_MONTH_REVIEW: readonly TopicSlug[] = ['iof-credito', 'rotativo-cartao', 'cheque-especial'];

/** Aviso de revisão (R6): dias antes do prazo. */
export const REVIEW_WARNING_DAYS = 30;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DECISION = /^D-\d{3}$/;
const REFERENCE = /^CL[ -][A-Z]?\d{3}$/;

const hostOf = (url: string): string | null => {
  const m = /^https:\/\/([a-z0-9.-]+)(?:[/:?#]|$)/i.exec(url);
  return m ? m[1]!.toLowerCase() : null;
};
const inDomain = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/** A fonte pode aparecer neste tema? (R5: https e domínio permitido; fonte de mercado só nos temas listados.) */
export function isAllowedSourceUrl(url: string, kind: 'oficial' | 'mercado', slug: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  if (kind === 'oficial') return OFFICIAL_SOURCE_DOMAINS.some((d) => inDomain(host, d));
  return Object.entries(MARKET_SOURCE_DOMAINS).some(([d, slugs]) => inDomain(host, d) && slugs.includes(slug));
}

const isExternal = (s: LearnSource) => s.kind !== 'clarevo';

/** Textos exibidos de um tema (os que passam por R7, R9 e R10). */
export function topicDisplayTexts(t: Topic): string[] {
  return [t.title, t.subtitle ?? '', t.question ?? '', t.short, ...t.paragraphs, t.example ?? '', t.hypotheses ?? ''].filter((x) => x !== '');
}

/** Data do próximo prazo de revisão (R6); sem prazo: null. */
export function reviewDueOn(t: Pick<Topic, 'reviewedOn' | 'reviewEveryMonths'>): IsoDate | null {
  return t.reviewEveryMonths === null ? null : addMonthsToDate(t.reviewedOn, t.reviewEveryMonths);
}

export function validateLearnCatalog(topics: readonly Topic[], opts: LearnValidationOptions): LearnProblem[] {
  const out: LearnProblem[] = [];
  const push = (code: LearnProblemCode, slug: string, detail?: string) => out.push(detail === undefined ? { code, slug } : { code, slug, detail });

  // R1 e R2: slugs, catálogo e apelidos.
  const slugs = topics.map((t) => t.slug as string);
  const seen = new Set<string>();
  for (const s of slugs) {
    if (!SLUG.test(s)) push('slug_invalido', s);
    if (seen.has(s)) push('slug_repetido', s);
    seen.add(s);
  }
  if (slugs.join('|') !== TOPIC_SLUGS.join('|')) push('catalogo_diferente', '*', 'TOPICS e TOPIC_SLUGS precisam ter os mesmos slugs, na mesma ordem');
  const aliases = new Set<string>();
  for (const t of topics)
    for (const a of t.aliases ?? []) {
      if (!SLUG.test(a) || seen.has(a)) push('apelido_invalido', t.slug, a);
      if (aliases.has(a)) push('apelido_repetido', t.slug, a);
      aliases.add(a);
    }

  for (const t of topics) {
    const published = t.status === 'publicado';
    // Seção e tipo.
    if ((t.section === 'duvidas') !== (t.kind === 'pergunta')) push('secao_tipo', t.slug);
    // Relacionados (R2).
    if (t.related.length > 3) push('relacionados_demais', t.slug);
    if (new Set(t.related).size !== t.related.length) push('relacionado_repetido', t.slug);
    for (const r of t.related) {
      if (r === t.slug) push('relacionado_proprio', t.slug);
      else if (!seen.has(r)) push('relacionado_desconhecido', t.slug, r);
    }
    // Tamanhos (R3).
    if (t.title.trim() === '' || t.title.length > 60) push('titulo', t.slug);
    if (t.kind === 'tema' ? !t.subtitle || t.subtitle.length > 80 : t.subtitle !== null) push('subtitulo', t.slug);
    if (t.question !== null && (t.question.trim() === '' || t.question.length > 100)) push('pergunta', t.slug);
    if (t.short.trim() === '' || t.short.length > 220) push('resumo', t.slug, String(t.short.length));
    if (t.paragraphs.length < 1 || t.paragraphs.length > 5 || t.paragraphs.some((p) => p.trim() === '' || p.length > 450)) push('paragrafos', t.slug);
    if (t.example !== null && (t.example.trim() === '' || t.example.length > 450)) push('exemplo', t.slug);
    // "Ver a conta" abre dentro do cartão Exemplo: conta sem exemplo nunca apareceria na tela.
    if (t.calculation !== null && t.example === null) push('calculo_sem_exemplo', t.slug);
    const words = topicWordCount(t);
    if (words > TOPIC_MAX_WORDS) push('palavras_demais', t.slug, String(words));
    // Calculadora.
    if (t.calculator && !isCalcSlug(t.calculator.slug)) push('calculadora', t.slug, t.calculator.slug);
    // Rascunho com o que falta; publicado sem marcas pendentes.
    if (!published && (!t.pending || t.pending.length === 0)) push('rascunho_sem_pendencia', t.slug);
    if (published && t.pending && t.pending.length > 0) push('pendencia_em_publicado', t.slug);
    if (published && topicDisplayTexts(t).some((x) => /\[conferir\]|[{}]/i.test(x))) push('marca_pendente', t.slug);

    // Fontes (R5).
    if (t.sources.length === 0) push('sem_fonte', t.slug);
    const external = t.sources.filter(isExternal);
    const clarevo = t.sources.filter((s): s is Extract<LearnSource, { kind: 'clarevo' }> => s.kind === 'clarevo');
    if (['organizar', 'juros', 'tempo'].includes(t.section) && external.length === 0) push('fonte_externa_faltando', t.slug);
    if (['usar', 'duvidas'].includes(t.section) && clarevo.length === 0) push('fonte_clarevo_faltando', t.slug);
    for (const s of t.sources) {
      if (s.kind === 'clarevo') {
        if (s.refs.length === 0) push('referencia_formato', t.slug, '(vazia)');
        for (const ref of s.refs) {
          if (DECISION.test(ref)) {
            if (opts.decisionIds && !opts.decisionIds.includes(ref)) push('decisao_desconhecida', t.slug, ref);
          } else if (REFERENCE.test(ref)) {
            if (opts.referenceIds && !opts.referenceIds.includes(ref)) push('referencia_desconhecida', t.slug, ref);
          } else push('referencia_formato', t.slug, ref);
        }
        continue;
      }
      if (s.kind !== 'obra' && !isAllowedSourceUrl(s.url, s.kind, t.slug)) push('fonte_endereco', t.slug, s.url);
      if (t.legacy || !published) continue;
      if (s.consultedOn === null) push('fonte_sem_data', t.slug, s.title);
      else if (!isValidIsoDate(s.consultedOn) || s.consultedOn > t.reviewedOn || s.consultedOn > opts.today) push('fonte_data_invalida', t.slug, s.title);
    }

    // Revisão (R6).
    if (!isValidIsoDate(t.reviewedOn) || t.reviewedOn > opts.today) push('revisao_data', t.slug, t.reviewedOn);
    const expectedMonths = external.length === 0 ? null : SIX_MONTH_REVIEW.includes(t.slug) ? 6 : 12;
    if (!t.legacy && t.reviewEveryMonths !== expectedMonths) push('revisao_prazo', t.slug, String(t.reviewEveryMonths));
    const due = reviewDueOn(t);
    if (published && !t.legacy && due !== null && opts.today > due) push('revisao_vencida', t.slug, `revisar até ${due}`);

    // Fatos (índice da fonte e presença no texto).
    const display = topicDisplayTexts(t);
    for (const f of t.facts) {
      if (!Number.isInteger(f.source) || f.source < 0 || f.source >= t.sources.length) push('fato_fonte', t.slug, f.text);
      if (!display.some((x) => x.includes(f.text))) push('fato_fora_do_texto', t.slug, f.text);
    }

    // Números conferidos (R7).
    if (published) {
      const expected = expectedExampleNumbers(t.slug);
      for (const f of t.facts) for (const n of numbersInText(f.text)) expected.add(canonicalNumber(n)!);
      for (const text of display)
        for (const n of numbersInText(text)) {
          const c = canonicalNumber(n);
          if (c === null || !expected.has(c)) push('numero_nao_conferido', t.slug, n);
        }
    }

    // Hipóteses (R9).
    const shown = [t.title, t.subtitle ?? '', t.short, ...t.paragraphs, t.example ?? ''];
    const needsHypotheses = t.example !== null || shown.some((x) => /R\$|%/.test(x));
    if (needsHypotheses && !t.hypotheses) push('hipoteses_faltando', t.slug);
    if (t.hypotheses && !/fict[ií]ci/i.test(t.hypotheses)) push('hipoteses_sem_ficticio', t.slug);
  }
  return out;
}

/** Temas publicados com prazo de revisão nos próximos 30 dias (R6: aviso, sem reprovar). */
export function learnReviewWarnings(topics: readonly Topic[], today: IsoDate): LearnProblem[] {
  return topics.flatMap((t) => {
    const due = reviewDueOn(t);
    if (t.status !== 'publicado' || t.legacy || due === null || today > due) return [];
    return daysBetween(today, due) <= REVIEW_WARNING_DAYS ? [{ code: 'revisao_vencida' as const, slug: t.slug, detail: `revisar até ${due}` }] : [];
  });
}
