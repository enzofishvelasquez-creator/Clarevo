/**
 * Guia de uso (D-049): o catálogo das funções publicadas do Clarevo, com para que serve, onde fica e como usar. É a fonte única do
 * guia dentro do app (Aprender › Como usar o Clarevo), da ajuda no próprio lugar (o botão "?") e do manual para compartilhar
 * (`scripts/gerar-manual.js`). Nada aqui lê dados da pessoa nem registra o que ela abre ou busca.
 */

/** Os cinco grupos da lista do guia, nesta ordem. */
export type GuideGroupId = 'dia-a-dia' | 'contas-e-cartoes' | 'planejar' | 'aprender-e-ajuda' | 'conta-e-privacidade';

export interface GuideGroup {
  id: GuideGroupId;
  title: string;
  /** Uma linha sob o título do grupo. */
  caption: string;
}

/**
 * Telas com o botão "?" no cabeçalho (D-049(3)). Cada uma abre a folha com o "Como usar" de uma entrada; mais de uma tela pode
 * apontar para a mesma entrada (Cartões e Fatura).
 */
export type HelpScreen =
  | 'cartoes'
  | 'fatura'
  | 'conta-do-ano'
  | 'orcamento'
  | 'renda-comprometida'
  | 'contas-de-origem'
  | 'importar'
  | 'buscar'
  | 'plano-dividas'
  | 'antes-de-financiar';

/** Uma linha de uma lista dentro da entrada (cada calculadora, em uma linha). */
export interface GuideLine {
  title: string;
  caption: string;
  /** Endereço da tela que a linha descreve. */
  href: string;
}

export interface GuideEntry {
  id: string;
  group: GuideGroupId;
  title: string;
  /** "Para que serve": uma ou duas frases. */
  purpose: string;
  /** "Onde fica": o caminho com os nomes das telas e abas, como "Movimentos › Organizar › Cartões". */
  where: readonly string[];
  /** Outros caminhos que levam à mesma tela ("Também em"). */
  alsoWhere?: readonly (readonly string[])[];
  /** "Como usar": de 3 a 6 passos curtos. */
  steps: readonly string[];
  /** Nome da tela para o botão "Abrir {tela}". */
  screenName: string;
  /** Endereço aberto pelo botão "Abrir {tela}". */
  href: string;
  /** Palavras que a pessoa usa para procurar a função, com sinônimos. A busca olha o título e estas palavras. */
  keywords: readonly string[];
  /** Telas (arquivos de `apps/app/src/app`, com colchetes nos parâmetros) que a entrada explica. */
  routes: readonly string[];
  /** Telas que mostram o botão "?" com esta entrada. */
  help?: readonly HelpScreen[];
  /** Linhas de uma lista dentro da entrada (cada calculadora). */
  lines?: readonly GuideLine[];
  /** Captura de `docs/telas` (390 px, demonstração fictícia) usada no manual. */
  screenshot: string;
}
