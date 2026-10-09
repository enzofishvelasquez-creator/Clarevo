import type { LearnSection, LearnSectionId, TopicSlug } from './types';

/** As cinco seções da aba, nesta ordem (D-031(2)). */
export const LEARN_SECTIONS: readonly LearnSection[] = [
  { id: 'usar', title: 'Usar o Clarevo', description: 'Como cada número do app é calculado.' },
  { id: 'organizar', title: 'Organizar o mês', description: 'Gastos fixos e variáveis, contas do ano, orçamento e reserva.' },
  { id: 'juros', title: 'Juros e crédito', description: 'Juros, taxas, CET, IOF, cartão, cheque especial e atraso.' },
  { id: 'tempo', title: 'Dinheiro no tempo', description: 'Inflação, Selic, liquidez e a garantia do FGC.' },
  { id: 'duvidas', title: 'Dúvidas frequentes', description: 'Respostas rápidas sobre privacidade e uso do app.' },
];

export const LEARN_SECTION_IDS: readonly LearnSectionId[] = LEARN_SECTIONS.map((s) => s.id);

/** Seção pelo id. */
export function learnSection(id: LearnSectionId): LearnSection {
  return LEARN_SECTIONS.find((s) => s.id === id)!;
}

/** Card lima "Comece por aqui", na ordem da tela. */
export const START_HERE: readonly TopicSlug[] = ['diferenca', 'juros-simples-compostos', 'gasto-fixo'];

/** Seções com o aviso "Conteúdo educativo e geral..." no fim da explicação (spec3 §3.8). */
export const LEARN_DISCLAIMER_SECTIONS: readonly LearnSectionId[] = ['juros', 'tempo'];
