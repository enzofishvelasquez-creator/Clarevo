import type { TopicCalculatorLink, TopicSlug } from '@clarevo/core';
import type { Href } from 'expo-router';

/**
 * Aprender e dúvidas no app (spec3 §3.12; spec5_notes §2). O conteúdo, a busca e as regras do catálogo vêm do core
 * (`packages/core/src/learn`); aqui ficam só os endereços das telas e as ações "No Clarevo".
 *
 * Privacidade (R11): leitura e busca acontecem no aparelho. Nada aqui grava, envia ou registra o tema aberto ou o
 * termo buscado.
 */
export {
  LEARN_DISCLAIMER_SECTIONS,
  LEARN_SECTIONS,
  LEARN_UI_TEXT,
  START_HERE,
  TOPICS,
  isTopicPublished,
  learnSection,
  publishedTopics,
  relatedTopics,
  resolveTopicSlug,
  searchTopics,
  topicBySlug,
  topicCalculator,
  topicReadingMinutes,
  topicsBySection,
  type LearnSectionId,
  type LearnSource,
  type Topic,
  type TopicCalculatorLink,
  type TopicSlug,
} from '@clarevo/core';

/**
 * De onde a explicação foi aberta: 'tarefa' (um formulário ou detalhe; o fechamento é "Voltar à tarefa") ou
 * 'aprender' (a aba; "Voltar para Aprender").
 */
export type LearnOrigin = 'tarefa' | 'aprender';

/** Origem lida do endereço: qualquer valor diferente de 'aprender' é tratado como 'tarefa'. */
export function learnOrigin(value: unknown): LearnOrigin {
  return value === 'aprender' ? 'aprender' : 'tarefa';
}

/**
 * Endereço da explicação de um tema (R2 e R13): o único lugar do app que monta a rota de explicação.
 * O slug tem tipo, então um link para tema que não existe não compila.
 */
export function explanationHref(slug: TopicSlug, origem: LearnOrigin = 'tarefa'): Href {
  return { pathname: '/explicacao/[tema]', params: { tema: slug, origem } };
}

/**
 * Ação "Fazer a conta com os seus números": abre a calculadora com os parâmetros do tema (os mesmos que calcPrefill
 * lê). Sem `origem` de propósito: com ela, a calculadora esconde "Anotar como...".
 */
export function calculatorHref(link: TopicCalculatorLink): Href {
  return { pathname: '/calcular/[slug]', params: { ...link.params, slug: link.slug } };
}

export interface LearnAction {
  label: string;
  href: Href;
}

/**
 * Ações "No Clarevo" de cada tema (spec3 §3.4 e §3.5). Ficam aqui, e não em lib/learn-actions.ts, para que as rotas
 * sejam conferidas pelo typecheck no mesmo arquivo de explanationHref.
 */
export const LEARN_ACTIONS: Partial<Record<TopicSlug, readonly LearnAction[]>> = {
  'quem-ve-meus-dados': [{ label: 'Ver quem vê estes dados', href: '/quem-ve' }],
  'marcar-como-paga': [{ label: 'Abrir Contas a pagar', href: '/a-pagar' }],
  'contei-duas-vezes': [{ label: 'Ver Movimentações', href: '/movimentacoes' }],
  'voltei-depois': [{ label: 'Revisar contas vencidas', href: '/a-pagar/vencidas' }],
  // Ciclos B, C e D: cada tema dos novos leva à tela do app em que o assunto aparece.
  'renda-comprometida': [{ label: 'Ver minha renda comprometida', href: '/renda-comprometida' }],
  'renda-variavel': [{ label: 'Revisar minha renda de referência', href: '/renda-comprometida/referencia' }],
  aporte: [{ label: 'Abrir Metas', href: '/metas' }],
  essenciais: [{ label: 'Calcular minha reserva', href: '/reserva' }],
  simulacao: [{ label: 'Simular um plano', href: '/simular' }],
};

/** Ações de um tema na ordem da tela: as do app e, por último, a calculadora correspondente (quando houver). */
export function topicActions(slug: TopicSlug, calculator: TopicCalculatorLink | null, calculatorLabel: string): LearnAction[] {
  const actions = [...(LEARN_ACTIONS[slug] ?? [])];
  if (calculator) actions.push({ label: calculatorLabel, href: calculatorHref(calculator) });
  return actions;
}
