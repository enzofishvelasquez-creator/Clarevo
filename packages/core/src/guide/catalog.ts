import { ACCOUNTS_TEXT } from '../accounts';
import { BUDGET_TEXT, LIMIT_TEXT } from '../budget';
import { ANTES_FIELDS, ANTES_TEXT } from '../calculators/antes-de-financiar';
import { CALCULATORS, CALC_GROUPS, CALC_UI_TEXT } from '../calculators/catalog';
import { PLANO_FIELDS, PLANO_TEXT } from '../calculators/plano-dividas';
import { CARDS_TEXT } from '../cards';
import { QUICK_PAY_TEXT } from '../commitments';
import { COMMITTED_TEXT } from '../committed';
import { COMPROVANTE_TEXT } from '../comprovante/fluxo';
import { EXPORT_TEXT } from '../export';
import { FAMILY_TEXT, INVITE_TEXT } from '../family';
import { GOALS_TEXT } from '../goals';
import { IMPORT_TEXT } from '../importar/textos';
import { LEARN_SECTIONS } from '../learn/sections';
import { LEARN_UI_TEXT, SEASONAL_TEXT } from '../learn/ui-text';
import { GOALS_NAV_TEXT, REMINDERS_SETTINGS_HREF, SUMMARY_NAV_TEXT } from '../navigation';
import { NOTA_TEXT } from '../nota';
import { REMINDER_TEXT } from '../reminders';
import { RETURN_TEXT } from '../retorno';
import { SAVINGS_TEXT } from '../savings';
import { SEARCH_TEXT } from '../search';
import { SEU_MES_TEXT } from '../seu-mes';
import { ORGANIZE_TEXT } from '../shortcuts';
import { SIMULATE_TEXT } from '../simulate';
import { SUBSCRIPTION_TEXT } from '../subscriptions';
import { WIDGET_TEXT } from '../widget';
import { GUIDE_GROUPS, GUIDE_TEXT, HELP_TEXT } from './text';
import type { GuideEntry, GuideGroup, GuideGroupId, GuideLine, HelpScreen } from './types';

/** Nome de botão, aba ou seção entre aspas, como a pessoa lê na tela. */
const q = (label: string): string => `"${label}"`;

/** "A, B e C" (ou "A, B ou C"): lista de nomes entre aspas para uma frase. */
const list = (labels: readonly string[], joiner: 'e' | 'ou'): string => {
  const quoted = labels.map(q);
  return quoted.length < 2 ? quoted.join('') : `${quoted.slice(0, -1).join(', ')} ${joiner} ${quoted[quoted.length - 1]}`;
};

/** Nomes que o app só desenha na tela (a barra, o cabeçalho e Conta); o teste confere cada um nos textos do código. */
const TAB = { resumo: 'Resumo', movimentos: 'Movimentos', metas: 'Metas', aprender: LEARN_UI_TEXT.tabLabel } as const;
const ACCOUNT_SCREEN = 'Conta';
const PRIVACY_SECTION = 'Privacidade neste aparelho';

const calcTitle = (slug: string): string => CALCULATORS.find((c) => c.slug === slug)!.title;

/** "Movimentos › Organizar › X": o caminho comum de quase todas as telas do card Organizar. */
const organizar = (name: string): readonly string[] => [TAB.movimentos, ORGANIZE_TEXT.title, name];

/** Uma linha por calculadora, com o título e a legenda do próprio catálogo de calculadoras. */
const CALCULATOR_LINES: readonly GuideLine[] = CALCULATORS.map((c) => ({ title: c.title, caption: c.subtitle, href: `/calcular/${c.slug}` }));

/**
 * O catálogo: uma entrada por função publicada (D-049). Cada entrada diz para que serve, onde fica (com os nomes que existem nas
 * telas, conferidos pelo teste), como usar em 3 a 6 passos e qual tela abrir. Os nomes de botões vêm das constantes de texto do
 * core sempre que existem, para o guia nunca divergir da tela. Sem produto financeiro, sem julgamento, sem valores da pessoa.
 * A busca olha o título e as palavras de busca (nunca o texto dos passos).
 */
export const GUIDE_ENTRIES: readonly GuideEntry[] = [
  // ---------------------------------------------------------------------------------------------------------------- Dia a dia
  {
    id: 'resumo',
    group: 'dia-a-dia',
    title: 'Resumo do mês',
    purpose: 'Mostra, de uma vez, o que você recebeu, o que pagou e o que ainda vai vencer no mês.',
    where: [TAB.resumo],
    steps: [
      `No topo, ${q('Diferença do mês')} é o que você recebeu menos o que já pagou. Toque em ${q('Recebido')} ou ${q('Pago')} para ver os registros de cada total.`,
      'Use as setas ao lado do nome do mês para ver outros meses.',
      `Em ${q('Ainda a pagar neste mês')} fica o que ainda vai vencer. Toque em ${q(SUMMARY_NAV_TEXT.viewPayables)} para abrir Contas a pagar.`,
      `${q('Pagamentos do mês')} lista os últimos gastos, e ${q('Ver todos')} abre a lista completa, com a divisão por categoria.`,
      `Logo abaixo do cabeçalho fica o botão ${q('Anotar gasto')}.`,
      `Em conta nova, o card ${q('Primeiros passos')} leva aos primeiros cadastros.`,
    ],
    screenName: TAB.resumo,
    href: '/',
    keywords: ['resumo', 'mês', 'diferença', 'recebido', 'pago', 'ainda a pagar', 'início', 'tela inicial', 'totais', 'primeiros passos'],
    routes: ['/', '/composicao'],
    screenshot: '06_resumo_demo.png',
  },
  {
    id: 'seu-mes',
    group: 'dia-a-dia',
    title: SEU_MES_TEXT.title,
    purpose: 'Resume o mês em poucos cartões, lidos um por vez: o que entrou e saiu, para onde foi o dinheiro, o que ainda vence, o orçamento e as metas.',
    where: [TAB.movimentos, SEU_MES_TEXT.title],
    steps: [
      `Em Movimentos, logo abaixo de ${q(SEARCH_TEXT.entry)}, toque em ${q(SEU_MES_TEXT.title)}.`,
      `Leia um cartão por vez: toque em ${q(SEU_MES_TEXT.next)} (ou deslize para o lado) e use ${q(SEU_MES_TEXT.previous)} para voltar. No último cartão, o botão é ${q(SEU_MES_TEXT.finish)}.`,
      `${q(SEU_MES_TEXT.cards.enteredAndLeft)} mostra ${q(SEU_MES_TEXT.entered.received)}, ${q(SEU_MES_TEXT.entered.paid)} e ${q(SEU_MES_TEXT.entered.difference)}, que não é saldo da conta.`,
      `${q(SEU_MES_TEXT.cards.whereItWent)} traz as três maiores categorias de Pago e, quando o mês anterior tem pagamentos, a diferença para ele. É só um fato, sem nota.`,
      `${q(SEU_MES_TEXT.cards.stillDue)} mostra o total a pagar e as próximas contas. ${q(SEU_MES_TEXT.cards.budget)} e ${q(SEU_MES_TEXT.cards.goals)} só aparecem se você tem orçamento ou metas.`,
      'Use as setas ao lado do nome do mês para ver outro mês. Os valores seguem o que você escolheu em Ocultar valores.',
    ],
    screenName: SEU_MES_TEXT.title,
    href: '/seu-mes',
    keywords: ['seu mês', 'mês em 30 segundos', '30 segundos', 'revisão do mês', 'balanço do mês', 'o que entrou', 'o que saiu', 'resumo rápido', 'visão do mês'],
    routes: ['/seu-mes'],
    screenshot: '360_seu_mes_entrou_saiu.png',
  },
  {
    id: 'anotar-gasto',
    group: 'dia-a-dia',
    title: 'Anotar gasto e recebimento',
    purpose: 'Registra um gasto que você já pagou ou um recebimento que já aconteceu, com valor, data e categoria.',
    where: [TAB.resumo, 'Anotar gasto'],
    alsoWhere: [
      [TAB.movimentos, 'Anotar gasto'],
      [TAB.movimentos, 'Registrar recebimento'],
    ],
    steps: [
      `Toque em ${q('Anotar gasto')}, logo abaixo do cabeçalho do Resumo, ou em ${q('Registrar recebimento')}, em Movimentos.`,
      `Digite a descrição e o ${q('Valor em reais')}.`,
      `Escolha a data (${q('Hoje')}, ${q('Ontem')} ou outra) e a categoria.`,
      `Se pagou no cartão de crédito, escolha o cartão em ${q(CARDS_TEXT.screens.payHow)}. Com mais de uma conta de origem, escolha de onde o dinheiro saiu em ${q(ACCOUNTS_TEXT.out)}.`,
      `Toque em ${q('Salvar gasto')} (ou ${q('Salvar recebimento')}). O valor entra no total do mês na hora.`,
    ],
    screenName: 'Anotar gasto',
    href: '/registro/novo?tipo=despesa',
    keywords: ['gasto', 'despesa', 'compra', 'anotar', 'lançar', 'registrar', 'recebimento', 'receber', 'salário', 'receita', 'paguei', 'mercado'],
    routes: ['/registro/novo', '/registro/[id]', '/registro/[id]/editar'],
    screenshot: '150_anotar_gasto_escanear.png',
  },
  {
    id: 'nota-fiscal',
    group: 'dia-a-dia',
    title: 'Escanear nota fiscal',
    purpose: 'Preenche o gasto com os dados de uma nota fiscal, lendo o QR code, o PDF ou a chave de acesso.',
    where: [TAB.resumo, 'Anotar gasto', NOTA_TEXT.scanButton],
    steps: [
      `Abra ${q('Anotar gasto')} e toque em ${q(NOTA_TEXT.scanButton)}, a primeira linha da tela.`,
      `Escolha como ler a nota: ${list([NOTA_TEXT.sheet.camera, NOTA_TEXT.sheet.pdf, NOTA_TEXT.sheet.paste], 'ou')}.`,
      'Aponte a câmera para o QR code do cupom ou para o código de barras da chave de acesso.',
      'Confira o que foi preenchido, como valor, data e descrição, e mude o que precisar.',
      `Para ler o PDF do comprovante de um Pix, de uma TED, de um boleto ou de uma compra no débito, escolha ${q(COMPROVANTE_TEXT.option)} na mesma folha. Em Registrar recebimento, a linha tem o mesmo nome. O PDF é lido no aparelho e não é guardado.`,
      `Toque em ${q('Salvar gasto')}. Só um resumo da chave é guardado, nunca o CPF, a chave inteira nem o link.`,
    ],
    screenName: 'Anotar gasto',
    href: '/registro/novo?tipo=despesa',
    keywords: ['nota', 'fiscal', 'cupom', 'qr', 'qr code', 'nfc-e', 'nf-e', 'danfe', 'escanear', 'câmera', 'chave de acesso', 'recibo', 'comprovante', 'pix', 'ted', 'boleto'],
    routes: [],
    screenshot: '153_nota_lida.png',
  },
  {
    id: 'movimentos',
    group: 'dia-a-dia',
    title: 'Movimentos e Organizar',
    purpose: 'Lista os gastos e recebimentos do mês e reúne, em Organizar, os atalhos para contas a pagar, gastos fixos, cartões e orçamento.',
    where: [TAB.movimentos],
    steps: [
      'Veja os registros do mês, do mais recente para o mais antigo. Use as setas ao lado do nome do mês para mudar de mês.',
      `Filtre por ${list(['Todos', 'Recebidos', 'Pagos'], 'ou')}.`,
      'Toque em um registro para ver o detalhe, editar ou excluir.',
      `No card ${q(ORGANIZE_TEXT.title)}, abra ${list(
        [ORGANIZE_TEXT.payables.title, ORGANIZE_TEXT.series.title, CARDS_TEXT.organizeRow, BUDGET_TEXT.organize.title, IMPORT_TEXT.rowTitle, ORGANIZE_TEXT.calculators.title],
        'ou',
      )}.`,
      `Com duas ou mais contas de origem, aparece o filtro ${q(ACCOUNTS_TEXT.filterLabel)} para ver só os registros de uma delas.`,
    ],
    screenName: TAB.movimentos,
    href: '/movimentacoes',
    keywords: ['movimentos', 'movimentações', 'extrato', 'histórico', 'registros', 'lista de gastos', 'editar gasto', 'excluir gasto', 'organizar'],
    routes: ['/movimentacoes'],
    screenshot: '260_movimentos_buscar_entrada.png',
  },
  {
    id: 'buscar',
    group: 'dia-a-dia',
    title: 'Buscar em Movimentos',
    purpose: 'Acha um gasto ou recebimento em todos os meses e mostra quanto deu no período.',
    where: [TAB.movimentos, SEARCH_TEXT.entry],
    steps: [
      `Em Movimentos, toque no campo ${q(SEARCH_TEXT.entry)}, no topo.`,
      `Digite o que procura, como ${q('luz')} ou ${q('mercado')}. Não precisa de acento.`,
      `Escolha o ${q(SEARCH_TEXT.kindLabel)} (${SEARCH_TEXT.kinds.todos}, ${SEARCH_TEXT.kinds.despesa} ou ${SEARCH_TEXT.kinds.receita}) e o ${q(SEARCH_TEXT.periodLabel)}.`,
      `Toque em ${q(SEARCH_TEXT.moreFilters(0))} para limitar por categoria, conta ou valor.`,
      'Veja o total e a média do período e toque em uma linha para abrir o registro. Nada do que você busca é guardado.',
    ],
    screenName: SEARCH_TEXT.entry,
    href: '/movimentacoes/buscar',
    keywords: ['buscar', 'busca', 'procurar', 'pesquisar', 'achar', 'encontrar', 'quanto paguei', 'quanto gastei', 'gasto antigo', 'registro antigo', 'luz'],
    routes: ['/movimentacoes/buscar'],
    help: ['buscar'],
    screenshot: '261_buscar_luz.png',
  },
  {
    id: 'importar-extrato',
    group: 'dia-a-dia',
    title: 'Importar extrato ou fatura',
    purpose: 'Traz gastos, recebimentos e compras no cartão de um arquivo do banco (OFX ou planilha CSV), com revisão de cada linha antes de importar.',
    where: organizar(IMPORT_TEXT.rowTitle),
    alsoWhere: [[ACCOUNT_SCREEN, ACCOUNTS_TEXT.title, IMPORT_TEXT.accountsShortcut]],
    steps: [
      `Toque em ${q(IMPORT_TEXT.pickFile)} e escolha o arquivo OFX ou a planilha CSV que o banco gera. Ele é lido neste aparelho e não é guardado.`,
      `Diga para onde vão os lançamentos: ${q(IMPORT_TEXT.destinationAccount)} (extrato) ou ${q(IMPORT_TEXT.destinationCard)} (fatura), e escolha a conta ou o cartão.`,
      `Se o Clarevo não reconhecer as colunas, escolha qual é a data, a descrição e o valor e toque em ${q(IMPORT_TEXT.columnsApply)}.`,
      `Toque em ${q(IMPORT_TEXT.continueToReview)}. Marque o que vira lançamento e mude a descrição ou a categoria de uma linha, se quiser.`,
      `Linhas com ${list([IMPORT_TEXT.labels.ja_anotado, IMPORT_TEXT.labels.parcela, IMPORT_TEXT.labels.pagamento_fatura], 'ou')} vêm desmarcadas, para nada entrar duas vezes.`,
      'Toque no botão de importar, que mostra quantos lançamentos entram. Compras no cartão só contam em Pago quando a fatura é paga.',
    ],
    screenName: IMPORT_TEXT.rowTitle,
    href: '/importar',
    keywords: ['importar', 'importação', 'extrato', 'ofx', 'banco', 'planilha', 'csv', 'arquivo do banco', 'trazer lançamentos', 'fatura'],
    routes: ['/importar'],
    help: ['importar'],
    screenshot: '303_importar_revisar.png',
  },
  {
    id: 'ultimos-meses',
    group: 'dia-a-dia',
    title: 'Seus últimos meses',
    purpose: 'Ajuda a atualizar os meses em que você não anotou nada, sem cobrança. Atualizar é opcional.',
    where: [TAB.resumo, RETURN_TEXT.title],
    steps: [
      `Quando há meses sem anotação, o Resumo mostra a faixa ${q(RETURN_TEXT.title)}. Ela some quando você decide.`,
      `Toque em ${q(RETURN_TEXT.seeSummary)} para ver, mês a mês, o que está registrado e as contas para conferir.`,
      'Mês sem anotação não quer dizer mês sem gastos: aqui aparece só o que está registrado no Clarevo.',
      `Toque em ${q(RETURN_TEXT.updateNow)} para passar pelos meses um a um. Em cada conta, use ${list([RETURN_TEXT.paidButton, RETURN_TEXT.notHappenedButton, RETURN_TEXT.stillOpenButton], 'ou')}; nos meses, ${q(RETURN_TEXT.addReceipts)} ou ${q(RETURN_TEXT.addExpenses)}.`,
      `Para deixar como está, toque em ${q(RETURN_TEXT.moveOn)}. Nada é criado, pago nem excluído.`,
    ],
    screenName: RETURN_TEXT.title,
    href: '/retomar',
    keywords: ['voltei', 'voltar', 'últimos meses', 'meses sem anotação', 'atualizar meses', 'fiquei sem usar', 'retomar'],
    routes: ['/retomar', '/retomar/atualizar', '/retomar/pagar'],
    screenshot: '72_seus_ultimos_meses.png',
  },

  // ---------------------------------------------------------------------------------------------------------- Contas e cartões
  {
    id: 'contas-a-pagar',
    group: 'contas-e-cartoes',
    title: 'Contas a pagar e Já paguei',
    purpose: 'Reúne as contas que ainda vão vencer. Quando você paga, marca como paga e o valor passa a contar em Pago.',
    where: organizar(ORGANIZE_TEXT.payables.title),
    alsoWhere: [[TAB.resumo, 'Ainda a pagar neste mês', SUMMARY_NAV_TEXT.viewPayables]],
    steps: [
      `Toque em ${q('Anotar conta a pagar')} e preencha a descrição, o valor e o vencimento.`,
      `A lista separa ${list(['Vencidas', 'A vencer', 'Próximos meses'], 'e')}, com o total em ${q('Ainda a pagar neste mês')}.`,
      `Quando pagar, toque em ${q(QUICK_PAY_TEXT.button)} na linha da conta e confirme com ${q(QUICK_PAY_TEXT.confirm)}.`,
      `Para mudar o valor ou a data do pagamento, escolha ${q(QUICK_PAY_TEXT.change)}.`,
      `A conta paga passa a contar em ${q('Pago')}, no mês da data do pagamento.`,
      'Use as setas ao lado do nome do mês para ver as contas de outros meses.',
    ],
    screenName: ORGANIZE_TEXT.payables.title,
    href: '/a-pagar',
    keywords: ['conta', 'pagar', 'boleto', 'vencimento', 'vencer', 'vencida', 'já paguei', 'marcar como paga', 'ainda a pagar', 'internet', 'condomínio'],
    routes: ['/a-pagar', '/a-pagar/nova', '/a-pagar/[id]', '/a-pagar/[id]/editar', '/a-pagar/[id]/pagar'],
    screenshot: '175_contas_a_pagar_outubro.png',
  },
  {
    id: 'vencidas',
    group: 'contas-e-cartoes',
    title: 'Contas vencidas',
    purpose: 'Ajuda a conferir, de uma vez, as contas que passaram do vencimento e continuam em aberto.',
    where: [...organizar(ORGANIZE_TEXT.payables.title), 'Revisar vencidas'],
    steps: [
      `Em Contas a pagar, abra a seção ${q('Vencidas')} e toque em ${q('Revisar vencidas')}.`,
      'Marque as contas que você já pagou.',
      `Com mais de uma conta de origem, escolha de onde o dinheiro saiu em ${q(ACCOUNTS_TEXT.out)}.`,
      `Toque em ${q('Marcar as selecionadas como pagas no vencimento')} e confirme.`,
      `Se uma conta não houve, toque em ${q(RETURN_TEXT.notHappenedButton)}: ela sai da lista e não volta.`,
    ],
    screenName: 'Contas vencidas',
    href: '/a-pagar/vencidas',
    keywords: ['vencida', 'vencidas', 'vencimento', 'passou do vencimento', 'em aberto', 'revisar vencidas', 'multa'],
    routes: ['/a-pagar/vencidas'],
    screenshot: '34_revisar_vencidas.png',
  },
  {
    id: 'gastos-fixos',
    group: 'contas-e-cartoes',
    title: 'Gastos fixos e parcelamentos',
    purpose: 'Cadastra uma vez o que se repete todo mês, como aluguel e escola, ou o que você paga em parcelas. Cada mês vira uma conta a pagar.',
    where: organizar(ORGANIZE_TEXT.series.title),
    steps: [
      `Toque em ${q('Novo gasto fixo ou parcelamento')}.`,
      `Em ${q('Com que frequência?')}, escolha ${q('Todo mês')} para um gasto fixo ou ${q('Parcelado')} para parcelas.`,
      'Informe a descrição, o valor e o dia do vencimento. Se o valor muda de um mês para outro, como luz e água, marque que ele muda: o valor do cadastro vira estimativa.',
      `Toque em ${q('Salvar gasto fixo')} ou ${q('Salvar parcelamento')}.`,
      'Cada mês aparece em Contas a pagar. Só o que você marca como paga entra em Pago.',
      `Para mudar o valor a partir de um mês ou terminar, abra o item e use ${q('Mudar valor ou dia a partir de uma conta')} ou ${q('Encerrar gasto fixo')}.`,
    ],
    screenName: ORGANIZE_TEXT.series.title,
    href: '/gastos-fixos',
    keywords: ['gasto fixo', 'fixo', 'parcelamento', 'parcela', 'aluguel', 'escola', 'financiamento', 'mensalidade', 'carnê', 'crediário'],
    routes: ['/gastos-fixos', '/gastos-fixos/novo', '/gastos-fixos/[id]', '/gastos-fixos/[id]/editar', '/gastos-fixos/[id]/encerrar'],
    screenshot: '270_gastos_fixos_assinaturas.png',
  },
  {
    id: 'contas-do-ano',
    group: 'contas-e-cartoes',
    title: 'Contas do ano',
    purpose: 'Para contas que vencem uma vez por ano ou em poucas parcelas, como IPVA e IPTU. O Clarevo cria a conta do mês certo, dois meses antes de vencer.',
    where: [...organizar(ORGANIZE_TEXT.series.title), 'Contas do ano'],
    steps: [
      `Em ${q('Contas do ano')}, toque em ${q('Nova conta do ano')}.`,
      `Em ${q('Como você paga?')}, escolha ${q('Uma vez no ano (cota única)')} ou ${q('Em parcelas no ano')}.`,
      `Informe o mês do vencimento, o valor e, em ${q('O valor muda de um ano para outro?')}, se ele muda.`,
      `Toque em ${q('Salvar conta do ano')}. Nos anos seguintes, o Clarevo cria as contas automaticamente.`,
      `Quando chegar o carnê ou o boleto com outro valor, abra a conta do ano e use, em ${q('Ano a ano')}, o botão que começa com ${q('Informar o valor de')}. Só aquele ano muda.`,
      `Se uma conta do ano não houve, use o botão que começa com ${q('Não houve em')} (ou ${q('Tirar as parcelas de')}, quando há várias parcelas).`,
    ],
    screenName: 'Contas do ano',
    href: '/gastos-fixos',
    keywords: ['conta do ano', 'anual', 'ipva', 'iptu', 'matrícula', 'seguro', 'licenciamento', 'imposto', 'cota única'],
    routes: ['/gastos-fixos/[id]/informar'],
    help: ['conta-do-ano'],
    screenshot: '221_contas_do_ano_lista.png',
  },
  {
    id: 'assinaturas',
    group: 'contas-e-cartoes',
    title: 'Assinaturas',
    purpose: 'Mostra quanto as assinaturas custam por mês e por ano e dá um lugar para conferir, de tempos em tempos, se cada uma ainda é usada.',
    where: [...organizar(ORGANIZE_TEXT.series.title), SUBSCRIPTION_TEXT.groupTitle],
    steps: [
      `Ao cadastrar ou editar um gasto fixo ${q('Todo mês')}, ligue ${q(SUBSCRIPTION_TEXT.switchLabel)}.`,
      `Em Gastos fixos e parcelamentos, as assinaturas aparecem no grupo ${q(SUBSCRIPTION_TEXT.groupTitle)}, com o total por mês e por ano.`,
      `Toque em ${q(SUBSCRIPTION_TEXT.reviewLink)} para ver cada uma e o custo por ano.`,
      `Se não usa mais uma assinatura, toque em ${q(SUBSCRIPTION_TEXT.endFrom)} e escolha o mês. Isso a tira só do Clarevo: para deixar de pagar, encerre também com quem oferece o serviço.`,
      `Toque em ${q(SUBSCRIPTION_TEXT.reviewedButton)} para registrar a data da revisão. O Clarevo guarda só essa data.`,
    ],
    screenName: SUBSCRIPTION_TEXT.reviewTitle,
    href: '/gastos-fixos/assinaturas',
    keywords: ['assinatura', 'assinaturas', 'streaming', 'academia', 'plano de celular', 'clube', 'aplicativo', 'mensalidade', 'revisar assinaturas'],
    routes: ['/gastos-fixos/assinaturas'],
    screenshot: '272_revisar_assinaturas.png',
  },
  {
    id: 'cartoes',
    group: 'contas-e-cartoes',
    title: 'Cartões e faturas',
    purpose: 'Cadastra seus cartões de crédito para anotar as compras na fatura. A compra só entra em Pago quando você paga a fatura.',
    where: organizar(CARDS_TEXT.organizeRow),
    steps: [
      `Toque em ${q(CARDS_TEXT.newCard)}. Informe o apelido, os 4 últimos dígitos (opcional) e os dias de fechamento e de vencimento. Nunca digite o número completo, o código de segurança nem a validade.`,
      `Para anotar uma compra, abra ${q('Anotar gasto')}, escolha ${q(CARDS_TEXT.expense.credit)} em ${q(CARDS_TEXT.screens.payHow)} e depois o cartão.`,
      `Toque no cartão para ver a ${q(CARDS_TEXT.currentInvoice)}, as anteriores e as próximas.`,
      `Na fatura, use ${q(CARDS_TEXT.invoice.addCharges)} para juros, multa ou tarifa que o banco cobrou, e ${q(CARDS_TEXT.invoice.addRefund)} para uma devolução.`,
      `Depois do fechamento, toque em ${q(CARDS_TEXT.invoice.payInvoice)} e informe o valor e a data. O pagamento vira um gasto só, na data em que você pagou.`,
      `Para desfazer um pagamento, use ${q(CARDS_TEXT.invoice.undoPayment)}.`,
    ],
    screenName: CARDS_TEXT.title,
    href: '/cartoes',
    keywords: ['cartão', 'cartões', 'cartao', 'fatura', 'crédito', 'limite', 'compra no cartão', 'pagar fatura', 'estorno', 'encargos'],
    routes: [
      '/cartoes',
      '/cartoes/novo',
      '/cartoes/[id]',
      '/cartoes/[id]/editar',
      '/cartoes/[id]/fatura/[mes]',
      '/cartoes/[id]/fatura/[mes]/pagar',
      '/cartoes/[id]/fatura/[mes]/encargo',
      '/cartoes/[id]/fatura/[mes]/estorno',
      '/cartoes/[id]/fatura/[mes]/compra',
    ],
    help: ['cartoes', 'fatura'],
    screenshot: '130_cartoes.png',
  },
  {
    id: 'contas-de-origem',
    group: 'contas-e-cartoes',
    title: 'Contas de origem',
    purpose: 'Cadastra de onde sai o dinheiro, como a conta do banco e a carteira, para escolher uma em cada gasto, pagamento e aporte. É só a origem: o Clarevo não guarda saldo.',
    where: [ACCOUNT_SCREEN, ACCOUNTS_TEXT.title],
    steps: [
      'Toque no círculo com as suas iniciais, no canto do cabeçalho, para abrir Conta.',
      `Em ${q(ACCOUNTS_TEXT.title)}, toque em ${q(ACCOUNTS_TEXT.add)}, dê um nome e escolha o tipo: conta bancária, dinheiro ou outra.`,
      `Nos gastos, pagamentos e aportes, escolha a conta em ${q(ACCOUNTS_TEXT.out)}, ${q(ACCOUNTS_TEXT.into)} ou ${q(ACCOUNTS_TEXT.to)}. A principal já vem marcada.`,
      `Toque em uma conta para renomear, usar ${q(ACCOUNTS_TEXT.makeDefault)}, arquivar ou excluir.`,
      `${ACCOUNTS_TEXT.balanceNote} A conta mostra só de onde o dinheiro saiu.`,
    ],
    screenName: ACCOUNTS_TEXT.title,
    href: '/conta?secao=contas',
    keywords: ['contas', 'suas contas', 'origem do dinheiro', 'saiu de', 'carteira', 'conta principal', 'adicionar conta', 'arquivar conta'],
    routes: ['/conta', '/contas/nova', '/contas/[id]/editar'],
    help: ['contas-de-origem'],
    screenshot: '240_suas_contas.png',
  },

  // ---------------------------------------------------------------------------------------------------------------- Planejar
  {
    id: 'orcamento',
    group: 'planejar',
    title: 'Orçamento por categoria',
    purpose: 'Define quanto você pretende usar por mês em cada categoria de gasto e mostra quanto já foi usado.',
    where: organizar(BUDGET_TEXT.organize.title),
    steps: [
      `Em ${q(BUDGET_TEXT.withoutTitle)}, escolha uma categoria, como Mercado ou Lazer.`,
      `Informe o ${q(BUDGET_TEXT.form.amountLabel)} e ${q(BUDGET_TEXT.form.fromLabel)} qual mês ele vale. Os meses anteriores não mudam.`,
      `Toque em ${q(BUDGET_TEXT.form.save)}.`,
      `Em ${q(BUDGET_TEXT.withBudgetTitle)}, cada categoria mostra o usado no mês, quanto falta e o percentual.`,
      BUDGET_TEXT.rule,
      `Para mudar ou tirar um orçamento, toque na categoria e use ${q(BUDGET_TEXT.form.remove)}.`,
    ],
    screenName: BUDGET_TEXT.title,
    href: '/orcamento',
    keywords: ['orçamento', 'orcamento', 'limite', 'limite de gastos', 'gastar menos', 'quanto gastar', 'teto de gastos', 'meta de gasto', 'categoria', 'lazer'],
    routes: ['/orcamento', '/orcamento/[categoria]'],
    help: ['orcamento'],
    screenshot: '200_orcamento.png',
  },
  {
    id: 'renda-comprometida',
    group: 'planejar',
    title: 'Renda comprometida e limite pessoal',
    purpose: 'Mostra quanto da sua renda de referência já tem destino em contas, parcelas e faturas, e deixa você escolher um limite seu.',
    where: [TAB.metas, GOALS_TEXT.monthTitle, GOALS_TEXT.seeCommitted],
    alsoWhere: [[TAB.resumo, 'Ainda a pagar neste mês']],
    steps: [
      `Toque em ${q(COMMITTED_TEXT.noReferenceButton)} e digite quanto costuma cair na sua conta por mês. Esse valor só calcula percentuais: ele não conta como recebido.`,
      `Veja o percentual da renda que já tem destino no mês, por grupo: ${COMMITTED_TEXT.groupLabel.fixos.toLowerCase()}, ${COMMITTED_TEXT.groupLabel.parcelamentos.toLowerCase()}, ${COMMITTED_TEXT.groupLabel.anuais.toLowerCase()}, ${COMMITTED_TEXT.groupLabel.faturas.toLowerCase()} e outras contas.`,
      `Em ${q(COMMITTED_TEXT.upcomingTitle)}, veja a previsão dos meses seguintes e, em ${q(COMMITTED_TEXT.milestonesTitle)}, quando uma parcela termina.`,
      `Em ${q(LIMIT_TEXT.title)}, toque em ${q(LIMIT_TEXT.choose)} e informe até quantos por cento da renda você quer comprometer. A escolha é sua: o Clarevo não sugere um valor.`,
      `Se a renda mudar, toque em ${q(COMMITTED_TEXT.change)} na renda de referência.`,
      'Metas e aportes não entram no percentual: guardar não é conta a pagar.',
    ],
    screenName: COMMITTED_TEXT.title,
    href: '/renda-comprometida',
    keywords: ['renda comprometida', 'comprometimento', 'renda de referência', 'quanto da renda', 'fora dos compromissos', 'meu limite', 'limite de renda', 'limite de comprometimento'],
    routes: ['/renda-comprometida', '/renda-comprometida/referencia', '/renda-comprometida/limite'],
    help: ['renda-comprometida'],
    screenshot: '101_renda_comprometida_outubro.png',
  },
  {
    id: 'metas',
    group: 'planejar',
    title: 'Metas e reserva',
    purpose: 'Acompanha o que você está juntando para uma viagem, um curso ou imprevistos, mostrando só o que você registrou como guardado.',
    where: [TAB.metas],
    steps: [
      `Em ${q(GOALS_TEXT.reserveTitle)}, toque em ${q(GOALS_TEXT.reserveCalculate)} para ver quantos meses de gastos essenciais você quer cobrir.`,
      `Toque em ${q(GOALS_TEXT.newGoal)}, dê um nome e informe o valor e, se quiser, o prazo.`,
      `Quando guardar dinheiro, abra a meta e use ${q(GOALS_TEXT.detail.addDeposit)}. O valor guardado só anda com o que você registrar.`,
      `Para usar o dinheiro, use ${q(GOALS_TEXT.detail.addWithdrawal)}. Resgate não entra como recebido.`,
      'Aportes e resgates não entram em Pago nem em Recebido: o dinheiro continua seu, só mudou de lugar.',
      `Quando a meta chegar ao valor, use ${q(GOALS_TEXT.detail.conclude)}.`,
    ],
    screenName: TAB.metas,
    href: '/metas',
    keywords: ['meta', 'metas', 'guardar', 'poupar', 'economizar', 'reserva', 'imprevistos', 'emergência', 'objetivo', 'aporte', 'resgate'],
    routes: ['/metas', '/meta/nova', '/meta/[id]', '/meta/[id]/editar', '/meta/[id]/movimento', '/reserva'],
    screenshot: '16_metas.png',
  },
  {
    id: 'plano-de-guardar',
    group: 'planejar',
    title: 'Plano de guardar',
    purpose: 'Pergunta se você consegue guardar um valor por mês e monta um plano em etapas com os seus números, sem contar rendimento.',
    where: [TAB.metas, SAVINGS_TEXT.askTitle],
    alsoWhere: [[TAB.resumo, 'Primeiros passos', SAVINGS_TEXT.firstStepTitle]],
    steps: [
      `No topo de Metas, responda ${q(SAVINGS_TEXT.askTitle)} com ${list([SAVINGS_TEXT.yes, SAVINGS_TEXT.notNow, SAVINGS_TEXT.later], 'ou')}.`,
      `Com ${q(SAVINGS_TEXT.yes)}, informe quanto por mês. O plano mostra etapas de 1, 3 e 6 meses de gastos essenciais e o mês previsto de cada uma.`,
      'Se o plano pedir, informe quanto você gasta por mês com o essencial: moradia, mercado, transporte, saúde e educação.',
      `Toque em ${q(SAVINGS_TEXT.useThisPlan)} para criar ou atualizar a sua reserva com o valor por mês.`,
      `Com ${q(SAVINGS_TEXT.notNow)}, você pode começar uma reserva mínima, a partir de R$ 100,00, ou ver passos pequenos. Nada é gravado até você escolher.`,
      'Só você vê a sua resposta, e a pergunta pode voltar mais tarde, sem cobrança.',
    ],
    screenName: TAB.metas,
    href: '/metas',
    keywords: ['plano de guardar', 'guardar', 'quanto guardar', 'reserva mínima', 'etapas', 'plano', 'poupar', 'economizar'],
    routes: ['/guardar', '/guardar/minima'],
    screenshot: '119_plano_de_guardar.png',
  },
  {
    id: 'simulador',
    group: 'planejar',
    title: 'Simulador',
    purpose: 'Faz contas com hipóteses suas: quanto guardar por mês, em quanto tempo ou quanto você pode ter. Nada é gravado.',
    where: [TAB.metas, GOALS_NAV_TEXT.doTheMathTitle, SIMULATE_TEXT.title],
    steps: [
      `Em ${q(SIMULATE_TEXT.modeLabel)}, escolha ${list([SIMULATE_TEXT.modes['quanto-guardar'], SIMULATE_TEXT.modes['em-quanto-tempo'], SIMULATE_TEXT.modes['quanto-ter']], 'ou')}.`,
      'Preencha os campos. A taxa de rendimento é a que você quer testar: o Clarevo não sugere taxas.',
      `Toque em ${q(SIMULATE_TEXT.simulateButton)} e veja o resultado, as hipóteses e a tabela ${q(SIMULATE_TEXT.chart.title)}.`,
      `Marque ${q(SIMULATE_TEXT.fields.inflationToggle)} para ver o valor em dinheiro de hoje.`,
      `Para guardar o resultado, toque em ${q(SIMULATE_TEXT.createGoal)}.`,
      'É uma simulação com as hipóteses que você informou, não uma promessa de rendimento.',
    ],
    screenName: SIMULATE_TEXT.title,
    href: '/simular',
    keywords: ['simular', 'simulador', 'simulação', 'rendimento', 'aporte', 'quanto vou ter', 'plano', 'inflação'],
    routes: ['/simular'],
    screenshot: '131_simular_resultado.png',
  },
  {
    id: 'calculadoras',
    group: 'planejar',
    title: 'Calculadoras',
    purpose: CALC_UI_TEXT.intro,
    where: organizar(ORGANIZE_TEXT.calculators.title),
    alsoWhere: [
      [TAB.metas, GOALS_NAV_TEXT.doTheMathTitle, GOALS_TEXT.calculators],
      [TAB.aprender, CALC_UI_TEXT.learnCardTitle],
    ],
    steps: [
      `Abra ${q(ORGANIZE_TEXT.calculators.title)} e escolha uma, organizadas em ${list(
        CALC_GROUPS.map((g) => g.title),
        'e',
      )}.`,
      'Digite os valores. O resultado aparece enquanto você digita, sem botão de calcular.',
      'As taxas são sempre as que você digita: o Clarevo não traz taxa pronta.',
      `Confira as ${q(CALC_UI_TEXT.hypothesesTitle)}, logo abaixo do resultado.`,
      `Algumas calculadoras oferecem ${q(CALC_UI_TEXT.noteInstallment)} ou ${q(CALC_UI_TEXT.noteFixed)}, para guardar o que você calculou.`,
    ],
    screenName: ORGANIZE_TEXT.calculators.title,
    href: '/calcular',
    keywords: ['calculadora', 'calculadoras', 'calcular', 'cálculo', 'fazer a conta', 'à vista', 'quitar', 'multa', 'dividir contas', 'reserva'],
    routes: ['/calcular', '/calcular/[slug]'],
    lines: CALCULATOR_LINES,
    screenshot: '236_calculadoras_com_antes_de_financiar.png',
  },
  {
    id: 'antes-de-financiar',
    group: 'planejar',
    title: 'Antes de financiar',
    purpose: 'Mostra a parcela, os juros totais e quanto a parcela pesa na renda antes de você comprar a prazo, e compara com juntar antes.',
    where: [...organizar(ORGANIZE_TEXT.calculators.title), calcTitle('antes-de-financiar')],
    steps: [
      `Informe o ${q(ANTES_FIELDS.preco.label)} e a ${q(ANTES_FIELDS.entrada.label)}, se houver.`,
      `Digite o ${q(ANTES_FIELDS.parcelas.label)} e a ${q(ANTES_FIELDS.taxaMes.label)}, que está na proposta do banco ou da loja.`,
      `Em ${q(ANTES_FIELDS.primeiraEmUmMes.label)}, escolha Sim ou Não.`,
      `Para ver quanto a parcela pesa, informe ${q(ANTES_FIELDS.renda.label)}. A renda de referência entra automaticamente, e mudar aqui não altera a referência.`,
      `Veja o total pago, os juros e a alternativa ${q(ANTES_TEXT.savingTitle)}, com quanto tempo leva para juntar o valor.`,
      'É uma estimativa: as condições oficiais são as da proposta, e vale pedir o CET.',
    ],
    screenName: calcTitle('antes-de-financiar'),
    href: '/calcular/antes-de-financiar',
    keywords: ['financiar', 'financiamento', 'financiado', 'poder de compra', 'entrada', 'à vista', 'comprar a prazo', 'parcela', 'prestação'],
    routes: [],
    help: ['antes-de-financiar'],
    screenshot: '231_antes_de_financiar_resultado.png',
  },
  {
    id: 'plano-dividas',
    group: 'planejar',
    title: 'Plano para quitar dívidas',
    purpose: 'Compara duas ordens de pagamento das suas dívidas, lado a lado, para você ver o efeito de cada uma. Nada é gravado.',
    where: [TAB.metas, GOALS_NAV_TEXT.doTheMathTitle, calcTitle('plano-dividas')],
    steps: [
      `A lista já vem com os seus parcelamentos em aberto. Para outras dívidas, toque em ${q(PLANO_TEXT.addDebt)}, de 1 a 10.`,
      `Escolha o tipo: ${q('Parcelada')} ou ${q('Saldo com juros')}.`,
      'Preencha o valor da parcela, as parcelas que faltam e a taxa ao mês, ou o saldo de hoje, a taxa e quanto você paga por mês. As taxas são as do seu contrato.',
      `Em ${q(PLANO_FIELDS.extra.label)}, informe um valor extra, se houver.`,
      `Compare ${q(PLANO_TEXT.scenario.maior_taxa)} e ${q(PLANO_TEXT.scenario.menor_divida)}: juros totais, mês em que cada dívida termina e os detalhes de cada ordem.`,
      'O Clarevo não diz qual ordem escolher e não oferece crédito.',
    ],
    screenName: calcTitle('plano-dividas'),
    href: '/calcular/plano-dividas',
    keywords: ['dívida', 'dívidas', 'quitar', 'quitação', 'bola de neve', 'avalanche', 'sair das dívidas', 'ordem de pagamento', 'rotativo', 'cheque especial'],
    routes: [],
    help: ['plano-dividas'],
    screenshot: '190_plano_dividas_demonstracao.png',
  },

  // ---------------------------------------------------------------------------------------------------------- Aprender e ajuda
  {
    id: 'aprender',
    group: 'aprender-e-ajuda',
    title: 'Aprender',
    purpose: 'Explicações curtas sobre contas, juros e o próprio Clarevo, com exemplos fictícios e fontes. Funciona no aparelho, sem registrar o que você lê nem o que busca.',
    where: [TAB.aprender],
    steps: [
      `Em ${q(LEARN_UI_TEXT.startHere)}, leia os três temas para começar.`,
      `Em ${q(SEASONAL_TEXT.title)}, veja os temas do mês: 13º salário e contas do começo do ano no fim do ano, volta às aulas no começo, Imposto de Renda de fevereiro a maio e férias em junho e julho. O card some nos meses sem tema.`,
      `Use ${q(LEARN_UI_TEXT.goTo)} para pular a uma seção: ${list(
        LEARN_SECTIONS.map((s) => s.title),
        'ou',
      )}.`,
      `Busque em ${q(LEARN_UI_TEXT.searchLabel)}. A busca acha temas, telas do app e passos do guia.`,
      `Abra um tema para ver o resumo, o exemplo com ${q(LEARN_UI_TEXT.showCalculation)}, as fontes e, quando houver, a ação em ${q(LEARN_UI_TEXT.inClarevo)}.`,
      'O Clarevo não registra quais temas você abre nem o que busca.',
    ],
    screenName: TAB.aprender,
    href: '/aprender',
    keywords: ['aprender', 'dúvidas', 'tema', 'explicação', 'o que é', 'educação financeira', 'dúvidas frequentes'],
    routes: ['/aprender', '/explicacao/[tema]'],
    screenshot: '320_aprender_como_usar.png',
  },
  {
    id: 'ajuda',
    group: 'aprender-e-ajuda',
    title: 'Guia, ajuda no lugar e tour',
    purpose: 'Reúne o passo a passo de cada função. A ajuda também aparece no próprio lugar, com o botão ?, e num tour curto na primeira entrada.',
    where: [TAB.aprender, GUIDE_TEXT.cardTitle],
    steps: [
      `Em Aprender, toque em ${q(GUIDE_TEXT.cardTitle)}.`,
      `Escolha uma função na lista, organizada em grupos. Cada uma mostra ${list([GUIDE_TEXT.purposeTitle, GUIDE_TEXT.whereTitle, GUIDE_TEXT.stepsTitle], 'e')}.`,
      `Toque em ${q('Abrir')} e o nome da tela para ir direto a ela.`,
      `Em algumas telas, o botão ${q('?')} no cabeçalho abre o ${q(HELP_TEXT.sheetSteps)} daquela tela, com o atalho ${q(HELP_TEXT.seeInGuide)}.`,
      `Para rever o tour de boas-vindas, toque em ${q(GUIDE_TEXT.tourAgain)}, no topo do guia.`,
      'Nada do que você abre ou busca no guia é registrado.',
    ],
    screenName: GUIDE_TEXT.cardTitle,
    href: '/aprender/guia',
    keywords: ['guia', 'como usar', 'tutorial', 'ajuda', 'tour', 'primeiros passos', 'manual', 'passo a passo', 'onde fica', 'interrogação'],
    routes: ['/aprender/guia', '/aprender/guia/[id]'],
    screenshot: '321_guia_lista.png',
  },

  // ---------------------------------------------------------------------------------------------------- Conta e privacidade
  {
    id: 'lembretes',
    group: 'conta-e-privacidade',
    title: 'Lembretes de vencimento',
    purpose: 'Um aviso no dia anterior ao vencimento de cada conta a pagar. Funciona no app para celular.',
    where: [ACCOUNT_SCREEN, REMINDER_TEXT.section],
    steps: [
      `No app para celular, abra Conta e ligue ${q(REMINDER_TEXT.toggle)}.`,
      'Permita os avisos quando o aparelho pedir.',
      `Escolha o ${q(REMINDER_TEXT.hourLabel)}.`,
      'O aviso não mostra valores nem descrições na tela bloqueada e fica só neste aparelho.',
      `Se o aparelho bloquear os avisos, use ${q(REMINDER_TEXT.openSettings)}.`,
      'Na versão para navegador, os lembretes não existem.',
    ],
    screenName: ACCOUNT_SCREEN,
    href: REMINDERS_SETTINGS_HREF,
    keywords: ['lembrete', 'lembretes', 'aviso', 'avisar', 'notificação', 'um dia antes', 'horário do aviso', 'vencimento'],
    routes: ['/conta'],
    screenshot: '329_conta_privacidade.png',
  },
  {
    id: 'ocultar-valores',
    group: 'conta-e-privacidade',
    title: 'Ocultar valores e biometria',
    purpose: 'Esconde os valores em reais da tela e, no celular, pede biometria ao abrir o app. As escolhas valem só para este aparelho.',
    where: [ACCOUNT_SCREEN, PRIVACY_SECTION],
    alsoWhere: [[ACCOUNT_SCREEN, WIDGET_TEXT.section]],
    steps: [
      `Toque no olho, no cabeçalho, para ${q('Ocultar valores')} ou ${q('Mostrar valores')} na hora. Os valores aparecem como R$ ••••.`,
      `Em telas estreitas, o olho não aparece. Ligue ${q('Ocultar valores ao abrir')}, em Conta: os valores ficam ocultos agora e sempre que você abrir o app.`,
      `No celular com biometria configurada, ligue ${q('Pedir biometria ao abrir')}. Sair da conta nunca depende dela.`,
      `O arquivo de ${q(EXPORT_TEXT.entry)} mostra os valores, mesmo com a ocultação ligada.`,
      `Em Conta, ${q(WIDGET_TEXT.section)} guarda se o widget mostra valores: ${q(WIDGET_TEXT.showValues)} começa desligado. O widget só existe quando o app estiver nas lojas.`,
    ],
    screenName: ACCOUNT_SCREEN,
    href: '/conta',
    keywords: ['ocultar', 'esconder', 'valores', 'privacidade', 'biometria', 'digital', 'rosto', 'olho'],
    routes: ['/conta'],
    screenshot: '110_resumo_valores_ocultos.png',
  },
  {
    id: 'exportar',
    group: 'conta-e-privacidade',
    title: 'Exportar meus dados',
    purpose: 'Leva seus gastos e recebimentos para uma planilha (CSV) ou para um resumo em PDF, montado neste aparelho.',
    where: [ACCOUNT_SCREEN, EXPORT_TEXT.entry],
    steps: [
      `Em Conta, no card ${q(EXPORT_TEXT.entry)}, toque em ${q(EXPORT_TEXT.entryButton)}.`,
      `Escolha o ${q(EXPORT_TEXT.periodLabel)}, como ${list([EXPORT_TEXT.periods.mes, EXPORT_TEXT.periods['12m'], EXPORT_TEXT.periods.tudo], 'ou')}.`,
      `Escolha o ${q(EXPORT_TEXT.formatLabel)}: ${q(EXPORT_TEXT.formats.csv)} ou ${q(EXPORT_TEXT.formats.pdf)}.`,
      `Toque em ${q(EXPORT_TEXT.prepare)}. Com a biometria ligada, o aparelho pede a confirmação antes.`,
      `Em ${q(EXPORT_TEXT.readyTitle)}, baixe ou compartilhe o arquivo. O Clarevo não guarda cópia dele.`,
      'O arquivo tem dados financeiros: guarde e compartilhe só com quem você escolher.',
    ],
    screenName: EXPORT_TEXT.title,
    href: '/conta/exportar',
    keywords: ['exportar', 'exportação', 'planilha', 'excel', 'csv', 'pdf', 'backup', 'baixar', 'baixar meus dados', 'levar meus dados', 'relatório', 'cópia dos dados'],
    routes: ['/conta/exportar'],
    screenshot: '291_exportar_meus_dados.png',
  },
  {
    id: 'familia',
    group: 'conta-e-privacidade',
    title: 'Família',
    purpose: 'Reúne até 6 pessoas para ver e anotar as contas da casa em conjunto. O Pessoal de cada pessoa continua só dela.',
    where: [ACCOUNT_SCREEN, FAMILY_TEXT.title],
    steps: [
      `Em Conta, no card ${q(FAMILY_TEXT.title)}, toque em ${q(FAMILY_TEXT.create)}, dê um nome e confirme. Quem cria é titular.`,
      `Toque em ${q(FAMILY_TEXT.invite)}, escolha ${q('Anota e vê')} ou ${q('Só vê')} e toque em ${q(FAMILY_TEXT.inviteGenerate)}. Envie o link com ${q(FAMILY_TEXT.share)}: ele vale por 7 dias e serve uma vez.`,
      `Quem recebe o link entra ou cria a conta, vê o nome da Família e quem convidou e toca em ${q(INVITE_TEXT.accept)}.`,
      `Com Família, o seletor ${q('Pessoal')} e ${q(FAMILY_TEXT.context)} aparece no topo das abas: cada tela usa o contexto escolhido, e os formulários dizem onde a anotação vai ficar.`,
      `O titular muda o papel de cada pessoa, remove, usa ${q(FAMILY_TEXT.transfer)} ou ${q(FAMILY_TEXT.end)}. Quem não é titular usa ${q(FAMILY_TEXT.leave)}.`,
      'O que alguém anotou continua na Família depois que sai, como "ex-membro" e o primeiro nome.',
    ],
    screenName: FAMILY_TEXT.title,
    href: '/familia',
    keywords: ['família', 'familia', 'casa', 'convidar', 'convite', 'link de convite', 'pessoas', 'membros', 'titular', 'dividir contas da casa', 'anotar junto', 'compartilhar contas'],
    routes: ['/familia'],
    screenshot: '400_familia_criar.png',
  },
  {
    id: 'quem-ve',
    group: 'conta-e-privacidade',
    title: 'Quem vê estes dados',
    purpose: 'Mostra quem tem acesso aos registros: em Pessoal, só você; na Família, as pessoas e o papel de cada uma. A empresa que oferece o plano não vê seus registros.',
    where: [TAB.resumo, 'Quem vê estes dados?'],
    steps: [
      `No fim do Resumo, de Contas a pagar e de outras telas, toque em ${q('Quem vê estes dados?')}.`,
      'Veja o nome e a permissão de cada pessoa com acesso. Em Pessoal, só você vê, anota, edita e exclui. Na Família, aparecem as pessoas e o papel de cada uma.',
      'A empresa que oferece o Clarevo como benefício administra só o seu acesso ao plano, não os seus registros.',
      'Gastos fixos, renda de referência, metas, simulações e a revisão dos últimos meses também são só seus no Pessoal.',
      `Para uma resposta mais completa, toque em ${q('A empresa vê meus gastos?')}.`,
    ],
    screenName: 'Quem vê estes dados?',
    href: '/quem-ve',
    keywords: ['quem vê', 'privacidade', 'permissões', 'meus dados', 'compartilhar', 'acesso', 'família', 'empresa'],
    routes: ['/quem-ve'],
    screenshot: '330_quem_ve.png',
  },
];

const BY_ID = new Map(GUIDE_ENTRIES.map((e) => [e.id, e]));

/** Entrada pelo id, ou undefined quando não existe (endereço antigo ou digitado). */
export function guideEntry(id: string): GuideEntry | undefined {
  return BY_ID.get(id);
}

/** As entradas de um grupo, na ordem do catálogo. */
export function guideEntriesOf(group: GuideGroupId): GuideEntry[] {
  return GUIDE_ENTRIES.filter((e) => e.group === group);
}

/** Os grupos com as suas entradas, na ordem da tela; grupo sem entrada não aparece. */
export function guideByGroup(): { group: GuideGroup; entries: GuideEntry[] }[] {
  return GUIDE_GROUPS.map((group) => ({ group, entries: guideEntriesOf(group.id) })).filter((g) => g.entries.length > 0);
}

/** A entrada que o botão "?" de uma tela abre. */
export function guideHelpEntry(screen: HelpScreen): GuideEntry {
  const entry = GUIDE_ENTRIES.find((e) => e.help?.includes(screen));
  if (!entry) throw new Error(`Sem entrada de guia para o "?" de ${screen}`);
  return entry;
}

/** O caminho "Movimentos › Organizar › Cartões", como mostrado em "Onde fica". */
export function guideWhere(path: readonly string[]): string {
  return path.join(GUIDE_TEXT.pathSeparator);
}

/** Endereço da entrada no guia (/aprender/guia/[id]). */
export function guideEntryHref(id: string): string {
  return `/aprender/guia/${id}`;
}

/** A primeira frase de "Para que serve": a legenda da entrada na lista do guia e na busca. */
export function guideSummary(entry: Pick<GuideEntry, 'purpose'>): string {
  return entry.purpose.split(/(?<=[.!?])\s+/)[0] ?? entry.purpose;
}
