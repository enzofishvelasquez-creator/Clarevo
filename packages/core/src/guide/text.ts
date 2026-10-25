import type { GuideGroup } from './types';

/** Os cinco grupos do guia, na ordem da tela (D-049(1)). */
export const GUIDE_GROUPS: readonly GuideGroup[] = [
  { id: 'dia-a-dia', title: 'Dia a dia', caption: 'Resumo, anotações, notas fiscais, busca e importação.' },
  { id: 'contas-e-cartoes', title: 'Contas e cartões', caption: 'Contas a pagar, gastos fixos, assinaturas, cartões e contas de origem.' },
  { id: 'planejar', title: 'Planejar', caption: 'Orçamento, renda comprometida, metas, simulador e calculadoras.' },
  { id: 'aprender-e-ajuda', title: 'Aprender e ajuda', caption: 'Temas curtos, o guia, o botão ? e o tour.' },
  { id: 'conta-e-privacidade', title: 'Conta e privacidade', caption: 'Lembretes, ocultar valores, exportar e quem vê os dados.' },
];

/**
 * Textos do guia dentro do app (Aprender › Como usar o Clarevo). O card em Aprender, a lista por grupos e a entrada com as
 * três seções ("Para que serve", "Onde fica" e "Como usar") e o botão "Abrir {tela}".
 */
export const GUIDE_TEXT = {
  /** Card no topo de Aprender, antes das calculadoras. */
  cardTitle: 'Como usar o app da Clarevo',
  cardCaption: 'Onde fica cada função e como usar, passo a passo',
  cardA11y: 'Como usar o app da Clarevo. Onde fica cada função e como usar, passo a passo.',
  /** Título da lista (/aprender/guia). */
  screenTitle: 'Como usar o app da Clarevo',
  intro: 'Cada função da Clarevo, com para que serve, onde fica e como usar. Nada do que você abre aqui é registrado.',
  /** Seções de uma entrada. */
  purposeTitle: 'Para que serve',
  whereTitle: 'Onde fica',
  stepsTitle: 'Como usar',
  alsoTitle: 'Também em',
  linesTitle: 'Uma por uma',
  /** Separador do caminho: "Movimentos › Organizar › Cartões". */
  pathSeparator: ' › ',
  /** Botão da entrada: "Abrir Cartões". */
  open: (screen: string): string => `Abrir ${screen}`,
  /** Leitor de tela de um passo: "Passo 2. Toque em ...". */
  stepA11y: (n: number, text: string): string => `Passo ${n}. ${text}`,
  /** Leitor de tela do caminho: "Movimentos, Organizar, Cartões" (o › é desenho). */
  whereA11y: (path: readonly string[]): string => path.join(', '),
  /** Linha da lista do guia: "{título}. {para que serve}". */
  rowA11y: (title: string, purpose: string): string => `${title}${/[?!.]$/.test(title) ? '' : '.'} ${purpose}`,
  tourAgain: 'Ver o tour de novo',
  tourAgainHint: 'Mostra de novo os cinco cartões de boas-vindas.',
  /** Entrada que não existe (endereço antigo ou digitado). */
  notFoundTitle: 'Esta função não está no guia.',
  notFoundAction: 'Ver o guia',
  backToGuide: 'Voltar ao guia',
  /** Grupo de resultados na busca de Aprender. */
  searchGroupTitle: 'Como usar',
  /** Leitor de tela da linha de resultado: "Como usar Cartões e faturas. Cadastra ...". */
  searchRowA11y: (title: string, purpose: string): string => `Como usar ${title}${/[?!.]$/.test(title) ? '' : '.'} ${purpose}`,
  /** Anúncio da contagem junto às outras: "2 guias para "cartão"". */
  countFor: (n: number, query: string): string => `${n === 1 ? '1 guia' : `${n} guias`} para "${query.trim()}"`,
} as const;

/** O botão "?" no cabeçalho de algumas telas e a folha que ele abre (D-049(3)). */
export const HELP_TEXT = {
  /** Nome acessível do botão (alvo de 44 px). */
  button: 'Como usar esta tela',
  /** Título da seção de passos na folha, acima da lista. */
  sheetSteps: 'Como usar',
  seeInGuide: 'Ver no guia',
  close: 'Fechar',
  /** Nome acessível da folha. */
  sheetLabel: (title: string): string => `Como usar: ${title}`,
} as const;

/** Os ícones simples do tour; o app liga cada nome a um desenho. */
export type TourIcon = 'resumo' | 'anotar' | 'contas' | 'metas' | 'ajuda';

export interface TourCard {
  id: 'resumo' | 'anotar' | 'contas' | 'metas' | 'ajuda';
  icon: TourIcon;
  title: string;
  body: string;
}

/** Os cinco cartões do tour de boas-vindas, na ordem (D-049(2)). */
export const TOUR_CARDS: readonly TourCard[] = [
  {
    id: 'resumo',
    icon: 'resumo',
    title: 'Resumo do mês',
    body: 'Veja o que você recebeu, o que pagou e o que ainda vai vencer no mês. Os valores só entram em Pago quando o pagamento já aconteceu.',
  },
  {
    id: 'anotar',
    icon: 'anotar',
    title: 'Anotar um gasto',
    body: 'Toque em Anotar gasto para registrar o que você pagou. Com uma nota fiscal, escaneie o QR code e confira o que a Clarevo preencheu.',
  },
  {
    id: 'contas',
    icon: 'contas',
    title: 'Contas a pagar e lembretes',
    body: 'Anote as contas que ainda vão vencer e toque em Já paguei na hora de pagar. No app para celular, um lembrete avisa no dia anterior.',
  },
  {
    id: 'metas',
    icon: 'metas',
    title: 'Metas e calculadoras',
    body: 'Em Metas, acompanhe o que você guarda e veja um plano. As calculadoras fazem as contas com os seus números, sem gravar nada.',
  },
  {
    id: 'ajuda',
    icon: 'ajuda',
    title: 'Onde achar ajuda',
    body: 'Em Aprender › Como usar o app da Clarevo, cada função tem o passo a passo. Em várias telas, o botão ? no cabeçalho explica a tela.',
  },
];

/** Textos do tour: botões, progresso e nomes acessíveis. */
export const TOUR_TEXT = {
  /** Nome acessível da janela. */
  dialogLabel: 'Primeiros passos na Clarevo',
  skip: 'Pular',
  skipHint: 'Fecha o tour. Você pode rever em Aprender, em Como usar o app da Clarevo.',
  next: 'Próximo',
  start: 'Começar',
  /** "1 de 5", visível e lido com o título do cartão. */
  progress: (index: number, total: number): string => `${index} de ${total}`,
  /** Anúncio ao trocar de cartão: "Cartão 2 de 5. Anotar um gasto." */
  announce: (index: number, total: number, title: string): string => `Cartão ${index} de ${total}. ${title}.`,
} as const;

/** Textos do manual para compartilhar (docs/manual/index.html, gerado por scripts/gerar-manual.js). */
export const MANUAL_TEXT = {
  title: 'Como usar o app da Clarevo',
  subtitle: 'Manual de uso, com as funções, onde achar e como usar.',
  /** Faixa em toda captura de tela e na capa: as imagens são da demonstração. */
  demoBand: 'Dados fictícios de demonstração',
  intro:
    'Este manual mostra, função por função, para que serve, onde fica e como usar. As telas são da demonstração da Clarevo, com dados fictícios. O mesmo texto está no app, em Aprender, em Como usar o app da Clarevo.',
  tocTitle: 'Sumário',
  figureAlt: (title: string): string => `Tela de exemplo: ${title}`,
  footer: 'Clarevo. Conteúdo educativo e geral, com dados fictícios de demonstração.',
  printHint: 'Para guardar em PDF, use Imprimir e escolha Salvar como PDF. O manual cabe em folhas A4.',
  linesTitle: 'Uma por uma',
} as const;
