import type { GoalImageKey } from './goal-images';

/**
 * Metas prontas em "Nova meta" (D-092): as 15 metas que mais aparecem nas pesquisas sobre para que as pessoas guardam dinheiro no
 * Brasil (docs/43_METAS_MAIS_COMUNS.md), na ordem dessas pesquisas. Um toque preenche o nome; a imagem vem do nome (suggestGoalImage) e a
 * dica diz o que costuma entrar na conta. A reserva para imprevistos não é uma meta comum: abre a tela da reserva (D-027) e some de "Nova
 * meta" quando a pessoa já tem uma. Nenhuma dica indica produto financeiro; os links levam só a calculadoras e ao simulador da Clarevo.
 */

export type GoalPresetId =
  | 'reserva'
  | 'casa'
  | 'viagem'
  | 'dividas'
  | 'carro'
  | 'reforma'
  | 'negocio'
  | 'moto'
  | 'celular'
  | 'aposentadoria'
  | 'estudos'
  | 'casamento'
  | 'filhos'
  | 'saude'
  | 'festa';

/** Um atalho de "Nova meta" para uma calculadora ou para o simulador (abre por cima do formulário, que continua preenchido). */
export type GoalPresetLink = { kind: 'calculadora'; slug: 'plano-dividas' | 'parcelado-ou-a-vista' | 'antes-de-financiar'; label: string } | { kind: 'simular'; label: string };

export interface GoalPreset {
  id: GoalPresetId;
  /** O nome que entra no campo "Nome da meta" (e o nome da opção na grade). */
  name: string;
  /** A imagem que o nome puxa (conferida nos testes: o nome sempre puxa esta imagem). */
  image: GoalImageKey;
  /** O que costuma entrar na conta, mostrado logo abaixo do nome depois do toque. */
  hint: string;
  link?: GoalPresetLink;
}

export const GOAL_PRESETS: readonly GoalPreset[] = [
  { id: 'reserva', name: 'Reserva para imprevistos', image: 'reserva', hint: 'A reserva tem uma tela própria, que calcula o valor pelos seus gastos essenciais.' },
  { id: 'casa', name: 'Casa própria', image: 'casa', hint: 'Conte a entrada, a escritura e o registro, e a mudança.' },
  { id: 'viagem', name: 'Viagem', image: 'viagem', hint: 'Some passagens, hospedagem, alimentação, passeios e uma folga para imprevistos.' },
  {
    id: 'dividas',
    name: 'Quitar dívidas',
    image: 'dividas',
    hint: 'Dívida com juros altos costuma crescer mais rápido do que o dinheiro guardado. Veja qual pagar primeiro antes de definir o valor.',
    link: { kind: 'calculadora', slug: 'plano-dividas', label: 'Em que ordem quitar as dívidas?' },
  },
  {
    id: 'carro',
    name: 'Carro',
    image: 'carro',
    hint: 'Além do preço, conte documentação, impostos do primeiro ano e manutenção.',
    link: { kind: 'calculadora', slug: 'antes-de-financiar', label: 'Antes de financiar' },
  },
  { id: 'reforma', name: 'Reforma da casa', image: 'reforma', hint: 'Conte material, mão de obra e uma folga: obra costuma custar mais do que o previsto.' },
  { id: 'negocio', name: 'Meu negócio', image: 'negocio', hint: 'Separe o que é para começar (equipamento, estoque, registro) e o que segura os primeiros meses.' },
  { id: 'moto', name: 'Moto', image: 'moto', hint: 'Além do preço, conte documentação, capacete e equipamentos.' },
  {
    id: 'celular',
    name: 'Celular novo',
    image: 'tecnologia',
    hint: 'Com o valor guardado, dá para comparar o preço à vista com o parcelado.',
    link: { kind: 'calculadora', slug: 'parcelado-ou-a-vista', label: 'Parcelado ou à vista?' },
  },
  {
    id: 'aposentadoria',
    name: 'Aposentadoria',
    image: 'aposentadoria',
    hint: 'Quanto antes começar, menor o valor por mês. Veja com hipóteses suas.',
    link: { kind: 'simular', label: 'Simular um plano' },
  },
  { id: 'estudos', name: 'Estudos', image: 'estudos', hint: 'Conte matrícula, mensalidades e material.' },
  { id: 'casamento', name: 'Casamento', image: 'casamento', hint: 'Conte festa, roupas, documentação e a lua de mel, se houver.' },
  { id: 'filhos', name: 'Futuro dos filhos', image: 'bebe', hint: 'Pode ser a chegada de um bebê, a escola ou a faculdade.' },
  { id: 'saude', name: 'Saúde', image: 'saude', hint: 'Para um tratamento, um procedimento ou o dentista.' },
  { id: 'festa', name: 'Festa', image: 'festa', hint: 'Aniversário, 15 anos, formatura ou as festas de fim de ano.' },
];

export function goalPresetById(id: string | null | undefined): GoalPreset | null {
  return GOAL_PRESETS.find((p) => p.id === id) ?? null;
}

/** Textos da grade de metas prontas e da imagem sugerida em "Nova meta". */
export const GOAL_PRESET_TEXT = {
  title: 'O que você quer conquistar?',
  intro: 'Toque em uma das metas mais comuns ou escolha "Outra meta". Dá para mudar o nome depois.',
  other: 'Outra meta',
  hintTitle: 'O que costuma entrar na conta',
  /** A imagem que o nome puxa, logo acima do nome. */
  imageCaption: 'Imagem sugerida pelo nome. Depois de criar, dá para trocar por outra ou por uma foto sua.',
  /** No Metas sem nenhuma meta: as mais comuns, com um toque. */
  emptyShortcuts: 'Comece por uma das mais comuns',
  seeAll: 'Ver todas',
} as const;

/** As que aparecem no Metas vazio (as mais comuns depois da reserva, que já tem o seu próprio card). */
export const GOAL_PRESETS_EMPTY: readonly GoalPresetId[] = ['casa', 'viagem', 'carro', 'moto', 'reforma', 'negocio'];
