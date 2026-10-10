import { addMonths, formatMonthBR, isValidIsoMonth, type IsoMonth } from './dates';
import { searchWords } from './learn/search';

/**
 * Navegação (D-039): regras puras que o app usa para mostrar a barra inferior, abrir Contas a pagar no mês certo e achar
 * telas do app pela busca de Aprender. Nada aqui grava, lê dados da pessoa ou registra buscas.
 */

// ---------------------------------------------------------------------------------------------------------------------
// Barra inferior
// ---------------------------------------------------------------------------------------------------------------------

/** As quatro abas, na ordem da barra. */
export const TAB_ROUTES = ['/', '/movimentacoes', '/metas', '/aprender'] as const;
export type TabRoute = (typeof TAB_ROUTES)[number];

/**
 * Como a barra inferior aparece numa tela:
 * - 'abas': a própria tela é uma aba (o layout das abas desenha a barra);
 * - 'consulta': tela de consulta aberta por cima de uma aba; a barra continua à vista, com a aba de origem marcada;
 * - 'formulario': formulário, passo a passo com rodapé fixo ou tela de entrada; sem barra (a ação principal fica no rodapé).
 */
export type BarMode = 'abas' | 'consulta' | 'formulario';

const ID = '[^/]+';
const MONTH = '\\d{4}-\\d{2}';

/**
 * Telas sem barra: só formulários, passos com rodapé fixo e as telas de entrada. Qualquer outra tela é de consulta e mostra
 * a barra, de modo que uma tela nova nunca perde a barra por esquecimento.
 */
const FORM_PATHS: readonly RegExp[] = [
  // Registro de gasto ou recebimento (novo e editar).
  new RegExp(`^/registro/(novo|${ID}/editar)$`),
  // Contas a pagar: nova, editar, pagar e a revisão de vencidas (rodapé fixo com o pagamento em lote).
  new RegExp(`^/a-pagar/(nova|vencidas|${ID}/(editar|pagar))$`),
  // Gastos fixos, parcelamentos e contas do ano.
  new RegExp(`^/gastos-fixos/(novo|${ID}/(editar|encerrar|informar))$`),
  // Metas, reserva e plano de guardar.
  new RegExp(`^/meta/(nova|${ID}/(editar|movimento))$`),
  /^\/(reserva|guardar|guardar\/minima)$/,
  // Renda de referência e limite pessoal (D-041).
  /^\/renda-comprometida\/(referencia|limite)$/,
  // Orçamento de uma categoria (D-041): o formulário. A lista do orçamento (/orcamento) é de consulta e mostra a barra.
  new RegExp(`^/orcamento/${ID}$`),
  // Cartões: cadastrar, editar e os formulários da fatura.
  new RegExp(`^/cartoes/(novo|${ID}/editar|${ID}/fatura/${MONTH}/(pagar|encargo|estorno|compra))$`),
  // Seus últimos meses: o passo a passo e o pagamento de uma conta sem registro.
  /^\/retomar\/(atualizar|pagar)$/,
  // Entrada, cadastro, recuperação e carregamento.
  /^\/(boas-vindas|criar-conta|confirmar-email|entrar|recuperar-acesso|nova-senha|primeira-conta|carregando|confirmado)$/,
];

/** Caminho sem parâmetros nem barra final: "/a-pagar/vencidas/?x=1" → "/a-pagar/vencidas". */
export function normalizePath(pathname: string): string {
  const path = (pathname.split(/[?#]/)[0] ?? '').replace(/\/+$/, '');
  return path === '' ? '/' : path;
}

export function barModeFor(pathname: string): BarMode {
  const path = normalizePath(pathname);
  if ((TAB_ROUTES as readonly string[]).includes(path)) return 'abas';
  return FORM_PATHS.some((re) => re.test(path)) ? 'formulario' : 'consulta';
}

/** Abas que uma tela de consulta abre quando a pessoa não veio de nenhuma (endereço aberto direto): a do assunto. */
const TAB_OF_TOPIC: readonly [RegExp, TabRoute][] = [
  [/^\/(a-pagar|gastos-fixos|cartoes|registro|orcamento)(\/|$)/, '/movimentacoes'],
  [/^\/(meta|reserva|guardar|simular|renda-comprometida)(\/|$)/, '/metas'],
  [/^\/explicacao(\/|$)/, '/aprender'],
];

/** Aba do assunto da tela (Contas a pagar → Movimentos); Resumo quando o assunto não é de outra aba. */
export function topicTabFor(pathname: string): TabRoute {
  const path = normalizePath(pathname);
  return TAB_OF_TOPIC.find(([re]) => re.test(path))?.[1] ?? '/';
}

export const BAR_TEXT = {
  /** Nome acessível da barra de abas. */
  label: 'Navegação principal',
} as const;

// ---------------------------------------------------------------------------------------------------------------------
// Contas a pagar: mês de abertura e seletor local
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Até quantos meses à frente o seletor de Contas a pagar avança a partir do mês de hoje. Para trás não há limite (como no
 * Resumo): qualquer mês válido, a partir de `PAYABLES_FIRST_MONTH`, abre e o seletor volta quanto a pessoa quiser.
 */
export const PAYABLES_MONTH_RANGE = { forward: 12 } as const;
export const PAYABLES_FIRST_MONTH: IsoMonth = '2000-01';

/** Mês dentro do que o seletor oferece. */
export function isPayablesMonth(month: unknown, currentMonth: IsoMonth): month is IsoMonth {
  return (
    typeof month === 'string' &&
    isValidIsoMonth(month) &&
    month >= PAYABLES_FIRST_MONTH &&
    month <= addMonths(currentMonth, PAYABLES_MONTH_RANGE.forward)
  );
}

/**
 * Mês com que Contas a pagar abre. Entradas "de agora" (lembrete, atalho do ícone, aviso de vencidas, endereço salvo) não
 * levam mês e abrem no mês atual. Os cards que mostram um mês ("Previsto para setembro") levam esse mês no endereço.
 * Valor inválido, ou fora do que o seletor oferece (qualquer mês válido até 12 meses à frente), abre o mês atual.
 */
export function payablesStartMonth(param: string | string[] | undefined, currentMonth: IsoMonth): IsoMonth {
  const value = Array.isArray(param) ? param[0] : param;
  return isPayablesMonth(value, currentMonth) ? value : currentMonth;
}

/**
 * Parâmetro de endereço para abrir Contas a pagar a partir de uma tela que mostra um mês: só leva `mes` quando o mês não é o
 * atual (o mês atual é o padrão da tela, e o endereço fica limpo: `/a-pagar`).
 */
export function payablesMonthParams(month: IsoMonth, currentMonth: IsoMonth): { mes?: IsoMonth } {
  return month === currentMonth ? {} : { mes: month };
}

/**
 * A linha "Lembretes de vencimento" de Contas a pagar aparece só onde ela pode ajudar: no app de celular (a web não tem
 * lembretes), fora da demonstração, com as preferências já lidas, com os lembretes desligados e sem a oferta depois do primeiro
 * gasto fixo ter sido mostrada (quem respondeu "Agora não" não vê a linha de novo).
 */
export function showsRemindersLink(state: { deviceFeatures: boolean; demo: boolean; prefsLoaded: boolean; remindersOn: boolean; offerShown: boolean }): boolean {
  return state.deviceFeatures && !state.demo && state.prefsLoaded && !state.remindersOn && !state.offerShown;
}

/** Endereço de Conta que rola até o card de lembretes. */
export const REMINDERS_SETTINGS_HREF = '/conta?secao=lembretes';

/** Mês vizinho no seletor local, ou null no limite (o botão fica desabilitado). */
export function payablesStep(month: IsoMonth, currentMonth: IsoMonth, delta: 1 | -1): IsoMonth | null {
  const next = addMonths(month, delta);
  return isPayablesMonth(next, currentMonth) ? next : null;
}

export const PAYABLES_NAV_TEXT = {
  /** "Mês anterior: setembro de 2026". */
  previous: (month: IsoMonth) => `Mês anterior: ${formatMonthBR(month).toLowerCase()}`,
  next: (month: IsoMonth) => `Próximo mês: ${formatMonthBR(month).toLowerCase()}`,
  /** "Voltar para outubro de 2026". */
  backToCurrent: (currentMonth: IsoMonth) => `Voltar para ${formatMonthBR(currentMonth).toLowerCase()}`,
  /** Lembretes de vencimento: o interruptor e o horário ficam em Conta. */
  reminders: {
    title: 'Lembretes de vencimento',
    caption: 'Um aviso no dia anterior ao vencimento. Ligar em Conta.',
  },
} as const;

// ---------------------------------------------------------------------------------------------------------------------
// Resumo
// ---------------------------------------------------------------------------------------------------------------------

export const SUMMARY_NAV_TEXT = {
  /** Link do card "Ainda a pagar" (a seta › é desenho). */
  viewPayables: 'Ver contas',
  viewPayablesA11y: 'Ver contas a pagar',
  /** Dicas dos totais do cabeçalho (o nome acessível continua "Recebido, R$ ..." e "Pago, R$ ..."). */
  receivedHint: 'Abre os recebimentos do mês',
  paidHint: 'Abre os pagamentos do mês, com a divisão por categoria',
} as const;

// ---------------------------------------------------------------------------------------------------------------------
// Metas compactas
// ---------------------------------------------------------------------------------------------------------------------

export const GOALS_NAV_TEXT = {
  /** Uma linha sob a pergunta compacta, no lugar do parágrafo. */
  askPrivacy: 'Só você vê esta resposta.',
  /** Card com Simular e Calculadoras. */
  doTheMathTitle: 'Fazer as contas',
  doTheMathCaption: 'Só a conta: nada é gravado.',
} as const;

// ---------------------------------------------------------------------------------------------------------------------
// Aprender: o grupo "No app"
// ---------------------------------------------------------------------------------------------------------------------

export const APP_SEARCH_TEXT = {
  /** Título do grupo de resultados que levam a telas do app. */
  groupTitle: 'No app',
  /** Anúncio quando só há telas do app: "2 telas do app para "boleto"". */
  countFor: (n: number, query: string) => `${n === 1 ? '1 tela do app' : `${n} telas do app`} para "${query.trim()}"`,
} as const;

/** Uma tela do app que a busca de Aprender sabe achar. */
export interface AppScreen {
  id: string;
  title: string;
  /** Uma linha: o que a pessoa faz ali. */
  caption: string;
  /** Endereço da tela (com parâmetros, se houver). */
  href: string;
  /** Palavras que a pessoa usa para procurar a função, com sinônimos. */
  keywords: readonly string[];
}

/**
 * Índice fixo das telas do app (A21). Fica no core para ser testado: toda tela tem título e legenda, os endereços existem no
 * app e os textos passam pelo teste de textos. Não há produto financeiro nem recomendação: só o caminho para uma função.
 */
export const APP_SCREENS: readonly AppScreen[] = [
  {
    id: 'anotar-gasto',
    title: 'Anotar gasto',
    caption: 'Valor, data e categoria de um gasto já pago',
    href: '/registro/novo?tipo=despesa',
    keywords: ['gasto', 'despesa', 'compra', 'anotar', 'lançar', 'registrar gasto', 'paguei', 'mercado', 'farmácia'],
  },
  {
    id: 'nota-fiscal',
    title: 'Escanear nota fiscal',
    caption: 'Primeira linha de Anotar gasto: lê o QR code, o PDF ou a chave da nota',
    href: '/registro/novo?tipo=despesa',
    keywords: ['nota', 'fiscal', 'cupom', 'qr', 'qr code', 'nfc-e', 'nf-e', 'danfe', 'escanear', 'câmera', 'chave de acesso', 'recibo'],
  },
  {
    id: 'recebimento',
    title: 'Registrar recebimento',
    caption: 'Salário, renda extra ou outro dinheiro que entrou',
    href: '/registro/novo?tipo=receita',
    keywords: ['recebimento', 'receber', 'recebi', 'salário', 'renda', 'receita', 'entrada', 'pagamento recebido'],
  },
  {
    id: 'contas-a-pagar',
    title: 'Contas a pagar',
    caption: 'Vencidas, a vencer e próximos meses, com Já paguei',
    href: '/a-pagar',
    keywords: ['conta', 'pagar', 'boleto', 'vencimento', 'vencer', 'vencida', 'atrasada', 'já paguei', 'marcar como paga', 'ainda a pagar'],
  },
  {
    id: 'anotar-conta',
    title: 'Anotar conta a pagar',
    caption: 'Uma conta que ainda vai vencer, como boleto, internet ou condomínio',
    href: '/a-pagar/nova',
    keywords: ['boleto', 'nova conta', 'anotar conta', 'conta a pagar', 'condomínio', 'internet', 'vencimento'],
  },
  {
    id: 'gastos-fixos',
    title: 'Gastos fixos e parcelamentos',
    caption: 'Aluguel, escola, financiamentos e compras parceladas',
    href: '/gastos-fixos',
    keywords: ['gasto fixo', 'fixo', 'parcelamento', 'parcela', 'aluguel', 'escola', 'financiamento', 'assinatura', 'mensalidade', 'carnê', 'crediário'],
  },
  {
    id: 'contas-do-ano',
    title: 'Contas do ano',
    caption: 'Contas que vencem uma vez por ano ou em poucas parcelas, como IPVA e IPTU',
    href: '/gastos-fixos',
    keywords: ['conta do ano', 'anual', 'ipva', 'iptu', 'matrícula', 'seguro', 'licenciamento', 'imposto'],
  },
  {
    id: 'cartoes',
    title: 'Cartões',
    caption: 'Cartões de crédito, faturas e compras no cartão',
    href: '/cartoes',
    keywords: ['cartão', 'cartões', 'cartao', 'fatura', 'crédito', 'limite', 'compra no cartão', 'pagar fatura', 'estorno'],
  },
  {
    id: 'categoria',
    title: 'Pago por categoria',
    caption: 'Para onde foi o dinheiro neste mês',
    href: '/composicao?tipo=pago&vista=categoria',
    keywords: ['categoria', 'categorias', 'por categoria', 'para onde foi', 'onde gastei', 'em que gastei', 'gastos por tipo'],
  },
  {
    id: 'diferenca',
    title: 'Diferença do mês',
    caption: 'Recebido menos pago, com os registros que compõem o total',
    href: '/composicao?tipo=diferenca',
    keywords: ['diferença', 'saldo do mês', 'recebido', 'pago', 'sobrou', 'resultado do mês'],
  },
  {
    id: 'movimentos',
    title: 'Movimentos',
    caption: 'Registros do mês, contas a pagar e gastos fixos',
    href: '/movimentacoes',
    keywords: ['movimentos', 'movimentações', 'extrato', 'histórico', 'registros', 'lista de gastos', 'editar gasto', 'excluir gasto'],
  },
  {
    id: 'lembretes',
    title: 'Lembretes de vencimento',
    caption: 'Um aviso no dia anterior, ligado em Conta (no app para celular)',
    href: '/conta',
    keywords: ['lembrete', 'lembretes', 'aviso', 'avisar', 'notificação', 'alerta', 'um dia antes', 'horário do aviso'],
  },
  {
    id: 'ocultar-valores',
    title: 'Ocultar valores',
    caption: 'Esconder os valores na tela, em Conta e no olho do cabeçalho',
    href: '/conta',
    keywords: ['ocultar', 'esconder', 'valores', 'privacidade', 'biometria', 'digital', 'rosto', 'olho'],
  },
  {
    id: 'conta',
    title: 'Conta',
    caption: 'Perfil, senha, lembretes, privacidade e sair',
    href: '/conta',
    keywords: ['conta', 'perfil', 'senha', 'alterar senha', 'sair', 'segurança', 'nome da conta', 'acesso ao plano'],
  },
  {
    id: 'quem-ve',
    title: 'Quem vê estes dados?',
    caption: 'Quem tem acesso aos seus registros',
    href: '/quem-ve',
    keywords: ['quem vê', 'privacidade', 'permissões', 'meus dados', 'compartilhar', 'acesso', 'família'],
  },
  {
    id: 'orcamento',
    title: 'Orçamento por categoria',
    caption: 'Quanto usar por mês em cada categoria de gasto, mês a mês',
    href: '/orcamento',
    keywords: ['orçamento', 'orcamento', 'limite', 'limite de gastos', 'gastar menos', 'quanto gastar', 'teto de gastos', 'meta de gasto', 'mercado', 'lazer'],
  },
  {
    id: 'metas',
    title: 'Metas e reserva',
    caption: 'Metas, reserva para imprevistos e plano de guardar',
    href: '/metas',
    keywords: ['meta', 'metas', 'guardar', 'poupar', 'economizar', 'reserva', 'imprevistos', 'emergência', 'objetivo', 'plano de guardar'],
  },
  {
    id: 'renda-comprometida',
    title: 'Renda comprometida',
    caption: 'Quanto da sua renda de referência já tem destino',
    href: '/renda-comprometida',
    keywords: ['renda comprometida', 'comprometimento', 'renda de referência', 'quanto da renda', 'fora dos compromissos', 'meu limite', 'limite de renda', 'limite de comprometimento'],
  },
  {
    id: 'simular',
    title: 'Simular um plano',
    caption: 'Quanto guardar por mês, em quanto tempo e quanto você pode ter',
    href: '/simular',
    keywords: ['simular', 'simulador', 'simulação', 'rendimento', 'aporte', 'juros compostos', 'quanto vou ter', 'plano'],
  },
  {
    id: 'calculadoras',
    title: 'Calculadoras',
    caption: 'Parcelado ou à vista, dívidas, reserva e outras contas',
    href: '/calcular',
    keywords: ['calculadora', 'calculadoras', 'calcular', 'cálculo', 'fazer a conta', 'à vista', 'quitar', 'multa', 'dividir contas'],
  },
  {
    id: 'antes-de-financiar',
    title: 'Antes de financiar',
    caption: 'Veja a parcela, os juros e quanto pesa na renda antes de comprar a prazo',
    href: '/calcular/antes-de-financiar',
    keywords: ['financiar', 'financiamento', 'financiado', 'poder de compra', 'entrada', 'à vista', 'comprar a prazo', 'parcela', 'prestação'],
  },
  {
    id: 'plano-dividas',
    title: 'Em que ordem quitar as dívidas?',
    caption: 'Compare duas ordens de pagamento para sair das dívidas',
    href: '/calcular/plano-dividas',
    keywords: ['dívida', 'dívidas', 'quitar', 'quitação', 'bola de neve', 'avalanche', 'sair das dívidas', 'ordem de pagamento', 'rotativo', 'cheque especial', 'financiamento'],
  },
  {
    id: 'ultimos-meses',
    title: 'Seus últimos meses',
    caption: 'Atualizar os meses em que você não anotou nada, sem cobrança',
    href: '/retomar',
    keywords: ['voltei', 'voltar', 'últimos meses', 'meses sem anotação', 'atualizar meses', 'fiquei sem usar', 'atrasei'],
  },
];

/** Quantas telas do app o grupo "No app" mostra no máximo. */
export const APP_SEARCH_LIMIT = 5;

/** Peso por campo: título 8, palavras de busca 6, legenda 2. */
const APP_WEIGHTS = { title: 8, keywords: 6, caption: 2 } as const;

function appMatches(queryWord: string, words: readonly string[]): boolean {
  return queryWord.length >= 3 ? words.some((w) => w.startsWith(queryWord)) : words.includes(queryWord);
}

/**
 * Telas do app que casam com a busca, da mais à menos relevante (empate: ordem do índice). Mesma normalização dos temas de
 * Aprender (sem acentos, minúsculas, palavras vazias fora, plural simples). Todas as palavras precisam casar. Sem palavra
 * útil: []. Nada é gravado: a busca é uma conta sobre texto fixo, no aparelho.
 */
export function searchAppScreens(query: string, screens: readonly AppScreen[] = APP_SCREENS, limit: number = APP_SEARCH_LIMIT): AppScreen[] {
  const words = [...new Set(searchWords(query))];
  if (words.length === 0) return [];
  const scored: { screen: AppScreen; score: number; order: number }[] = [];
  screens.forEach((screen, order) => {
    const fields = [
      { weight: APP_WEIGHTS.title, words: searchWords(screen.title) },
      { weight: APP_WEIGHTS.keywords, words: searchWords(screen.keywords.join(' ')) },
      { weight: APP_WEIGHTS.caption, words: searchWords(screen.caption) },
    ];
    let score = 0;
    for (const q of words) {
      const hit = fields.reduce((sum, f) => sum + (appMatches(q, f.words) ? f.weight : 0), 0);
      if (hit === 0) return;
      score += hit;
    }
    scored.push({ screen, score, order });
  });
  return scored
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map((s) => s.screen);
}

/** A tela é uma aba (abre trocando de aba, não empilhando)? */
export function appScreenIsTab(screen: Pick<AppScreen, 'href'>): boolean {
  return (TAB_ROUTES as readonly string[]).includes(normalizePath(screen.href));
}
