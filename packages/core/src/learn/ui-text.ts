import { formatDateBR, type IsoDate } from '../dates';
import { LEARN_SECTIONS } from './sections';
import type { LearnSource } from './types';

const minutes = (n: number) => (n === 1 ? '1 minuto' : `${n} minutos`);

/**
 * Textos da aba Aprender e da explicação (spec3 §3.8, com spec5_notes §2), cobertos pelo teste de textos.
 * As seções (título e descrição) ficam em LEARN_SECTIONS; o card "Calculadoras" usa CALC_UI_TEXT.learnCardTitle e
 * learnCardCaption (Ciclo A6).
 */
export const LEARN_UI_TEXT = {
  /** Rótulo visível da aba (quatro destinos do Primeiro Ciclo) e nome acessível, que contém o rótulo (WCAG 2.5.3). */
  tabLabel: 'Aprender',
  tabA11y: 'Aprender e dúvidas',
  title: 'Aprender e dúvidas',
  intro: 'Explicações curtas sobre contas, juros e o próprio Clarevo, com exemplos fictícios e fontes.',
  searchLabel: 'Buscar um tema',
  searchHint: 'Ex.: juros, fatura, parcela',
  clearSearch: 'Limpar busca',
  /** "{n} temas para "{busca}"" · "1 tema para "{busca}"". */
  resultCount: (n: number, query: string) => `${n === 1 ? '1 tema' : `${n} temas`} para "${query.trim()}"`,
  noResultTitle: 'Nenhum tema encontrado',
  noResultBody: 'Tente outra palavra, como juros, fatura ou parcela.',
  showAll: 'Ver todos os temas',
  startHere: 'Comece por aqui',
  goTo: 'Ir para',
  /** Linha de tema: "1 min". */
  minutesShort: (n: number) => `${n} min`,
  /** Leitor de tela da linha: "{título}. {subtítulo}. Leitura de 1 minuto." (pergunta: sem subtítulo). */
  rowA11y: (title: string, subtitle: string | null, n: number) =>
    `${title}${/[?!.]$/.test(title) ? '' : '.'}${subtitle ? ` ${subtitle}.` : ''} Leitura de ${minutes(n)}.`,
  faqReadMore: 'Ler resposta completa',
  footer: 'Conteúdo educativo e geral, com exemplos fictícios. O Clarevo não oferece crédito nem indica investimentos.',

  /** Explicação (/explicacao/[tema]). */
  backHeader: 'Aprender',
  /** "{Seção} · {n} min de leitura". */
  sectionReading: (section: string, n: number) => `${section} · ${n} min de leitura`,
  readingA11y: (n: number) => `Leitura de ${minutes(n)}`,
  example: 'Exemplo',
  showCalculation: 'Ver a conta',
  hypotheses: 'Hipóteses do exemplo',
  inClarevo: 'No Clarevo',
  calculatorAction: 'Fazer a conta com os seus números',
  related: 'Temas relacionados',
  sources: 'Fontes',
  /** Fonte oficial ou de mercado: "{Instituição}: {título}"; obra: "{autores}. {título}. {editora}, {ano}.". */
  sourceLine: (s: LearnSource) => {
    if (s.kind === 'obra') return `${s.authors}. ${s.title}. ${s.publisher}, ${s.year}.`;
    if (s.kind === 'clarevo') return `Clarevo: ${s.refs.join(', ')}`;
    return `${s.publisher}: ${s.title}`;
  },
  consultedOn: (date: IsoDate) => `Consultada em ${formatDateBR(date)}`,
  marketLabel: 'Referência de mercado',
  externalLinkHint: 'Abre o site fora do app',
  reviewedOn: (date: IsoDate) => `Revisado em ${formatDateBR(date)}`,
  disclaimer: 'Conteúdo educativo e geral. Não é recomendação de produto financeiro nem oferta de crédito.',
  backToTask: 'Voltar à tarefa',
  backToLearn: 'Voltar para Aprender',
  linkFailed: 'Não foi possível abrir o site agora. Tente de novo mais tarde.',
  unavailable: 'Este conteúdo não está disponível.',
  unavailableAction: 'Ver temas de Aprender',
  back: 'Voltar',

  /** "O que é isso?" ao lado de termos (TermHint). */
  termHint: 'O que é isso?',
  termHintA11y: (term: string) => `O que é isso? ${term}`,
  readFull: 'Ler explicação completa',
} as const;

/** Todos os textos de LEARN_UI_TEXT e das seções, com as funções chamadas com entradas de exemplo (teste de textos). */
export function learnUiTextSamples(): string[] {
  const t = LEARN_UI_TEXT;
  const out: string[] = [];
  for (const value of Object.values(t)) if (typeof value === 'string') out.push(value);
  out.push(
    t.resultCount(1, 'juros'),
    t.resultCount(12, ' parcela '),
    t.minutesShort(1),
    t.minutesShort(2),
    t.rowA11y('Diferença do mês', 'Como um registro entra no mês', 1),
    t.rowA11y('Quem vê meus dados?', null, 2),
    t.sectionReading('Juros e crédito', 2),
    t.readingA11y(1),
    t.readingA11y(2),
    t.sourceLine({ kind: 'oficial', publisher: 'Banco Central do Brasil', title: 'Calculadora do Cidadão', url: 'https://www.bcb.gov.br', locator: null, consultedOn: '2026-10-09' }),
    t.sourceLine({ kind: 'obra', authors: 'Autoria fictícia', title: 'Título fictício', publisher: 'Editora fictícia', year: 2005, locator: null, consultedOn: null }),
    t.sourceLine({ kind: 'clarevo', refs: ['D-021', 'D-024'] }),
    t.consultedOn('2026-10-09'),
    t.reviewedOn('2026-10-09'),
    t.termHintA11y('Valor estimado'),
    ...LEARN_SECTIONS.flatMap((s) => [s.title, s.description]),
  );
  return out;
}
