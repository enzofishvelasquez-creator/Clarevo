import type { CalcSlug } from '../calculators/catalog';
import type { IsoDate } from '../dates';

/**
 * Formato do catálogo de Aprender e dúvidas (spec3 §3.5, com spec5_notes §2).
 * O conteúdo é público, igual para todas as pessoas, vem no app e funciona sem internet (R11).
 */
export type LearnSectionId = 'usar' | 'organizar' | 'juros' | 'tempo' | 'duvidas';

/** Os 37 temas do catálogo, na ordem de spec3 §3.3. Um slug nunca é reaproveitado (R1). */
export const TOPIC_SLUGS = [
  'diferenca',
  'realizado-previsto',
  'saldo',
  'fatura',
  'gasto-fixo',
  'estimativa',
  'parcelamentos',
  'sem-registro',
  'gasto-fixo-variavel',
  'contas-do-ano',
  'orcamento-50-30-20',
  'reserva-imprevistos',
  'juros-simples-compostos',
  'taxa-mes-ano',
  'taxa-e-tarifa',
  'cet',
  'iof-credito',
  'parcelado-ou-a-vista',
  'rotativo-cartao',
  'cheque-especial',
  'amortizacao-price-sac',
  'quitar-antes',
  'multa-juros-atraso',
  'score-credito',
  'superendividamento',
  'inflacao-ipca',
  'selic',
  'liquidez-risco-retorno',
  'fgc',
  'quem-ve-meus-dados',
  'empresa-ve',
  'demonstracao',
  'marcar-como-paga',
  'contei-duas-vezes',
  'voltei-depois',
  'apagar-dados',
  'o-que-o-clarevo-nao-faz',
] as const;

export type TopicSlug = (typeof TOPIC_SLUGS)[number];

export interface LearnSection {
  id: LearnSectionId;
  title: string;
  description: string;
}

/**
 * Fonte de um tema.
 * - `oficial`: lei, norma ou página de órgão público (domínios em LEARN_SOURCE_DOMAINS).
 * - `mercado`: fonte privada identificada (P-024): o FGC sobre a própria garantia.
 * - `obra`: livro publicado, sem link.
 * - `clarevo`: decisões deste projeto (`D-021`) e referências (`CL C005`, `CL-V007`).
 *
 * `consultedOn` é a data em que um trecho de resultado de busca da própria fonte confirmou o fato citado
 * (spec5_notes §2); `locator` diz onde está o trecho (artigo, item, seção). Sem confirmação: `null`, e o tema fica
 * como rascunho (R5).
 */
export type LearnSource =
  | {
      kind: 'oficial' | 'mercado';
      publisher: string;
      title: string;
      url: string;
      locator: string | null;
      consultedOn: IsoDate | null;
    }
  | {
      kind: 'obra';
      authors: string;
      title: string;
      publisher: string;
      year: number;
      locator: string | null;
      consultedOn: IsoDate | null;
    }
  | { kind: 'clarevo'; refs: string[] };

/** Constante de norma ou do app citada no texto ("8% ao mês", "R$ 600,00"), com o índice da fonte em `sources`. */
export interface NormativeFact {
  text: string;
  source: number;
}

/**
 * Ação "Fazer a conta com os seus números": abre /calcular/[slug] com estes parâmetros de endereço (os mesmos que
 * calcPrefill lê). A taxa nunca vem no link.
 */
export interface TopicCalculatorLink {
  slug: CalcSlug;
  params: Readonly<Record<string, string>>;
}

export interface Topic {
  slug: TopicSlug;
  section: LearnSectionId;
  /** 'pergunta' só na seção Dúvidas frequentes. */
  kind: 'tema' | 'pergunta';
  status: 'publicado' | 'rascunho';
  /** Até 60 caracteres. */
  title: string;
  /** Obrigatório em 'tema' (até 80); `null` em 'pergunta'. */
  subtitle: string | null;
  /** A dúvida que o tema responde, até 100; só para a busca. */
  question: string | null;
  /** Resumo de até 220 caracteres: "O que é isso?", busca e Dúvidas frequentes. */
  short: string;
  /** 1 a 5 parágrafos, cada um até 450 caracteres. */
  paragraphs: string[];
  /** Exemplo fictício, até 450 caracteres. */
  example: string | null;
  /** "Ver a conta", recolhido. */
  calculation: string | null;
  /** Hipóteses do exemplo; obrigatórias com exemplo, "R$" ou "%" (R9). */
  hypotheses: string | null;
  facts: NormativeFact[];
  /** Sinônimos só para a busca. */
  keywords: string[];
  /** 0 a 3; rascunho não aparece. */
  related: TopicSlug[];
  /** Pelo menos uma. */
  sources: LearnSource[];
  reviewedOn: IsoDate;
  /** 6 ou 12 meses com fonte externa (R6); `null` só com fontes 'clarevo'. */
  reviewEveryMonths: 6 | 12 | null;
  aliases?: string[];
  /** Texto publicado antes do A5, ainda sem fontes conferidas (isento de R5 e R6). Nenhum tema usa hoje. */
  legacy?: true;
  /** Calculadora correspondente (spec5_notes §2). */
  calculator?: TopicCalculatorLink;
  /** Rascunho: o que falta conferir antes de publicar. */
  pending?: string[];
}
