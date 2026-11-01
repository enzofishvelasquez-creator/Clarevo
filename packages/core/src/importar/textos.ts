import { formatDateBR } from '../dates';
import { formatBRL } from '../money';
import { IMPORT_BATCH, IMPORT_MAX_LINES, type ImportErrorCode } from './tipos';
import type { ReviewLabel } from './revisao';

/**
 * Textos de "Importar extrato ou fatura" (D-048). Português do Brasil, linguagem neutra, sem travessão longo, sem marca de banco
 * ou de serviço e sem cobrança. O arquivo é lido no aparelho e não é guardado; o saldo dele é ignorado.
 */

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
/** Inteiro com ponto de milhar (1.200). */
const num = (n: number) => n.toLocaleString('pt-BR');

export const IMPORT_TEXT = {
  /** Linha de Movimentos › Organizar, a busca "No app" e o atalho em Conta › Contas de origem. */
  rowTitle: 'Importar extrato ou fatura',
  rowCaption: 'Arquivo OFX ou planilha do banco',
  accountsShortcut: 'Importar extrato',
  accountsShortcutHint: 'Traz os gastos e recebimentos de um arquivo do banco.',
  screenTitle: 'Importar extrato ou fatura',
  intro: 'Escolha o arquivo que o banco gera: PDF, OFX ou planilha CSV. Ele é lido aqui no aparelho e não é guardado. Só as linhas que você confirmar viram lançamentos.',
  limits: `Até 5 MB e ${IMPORT_MAX_LINES.toLocaleString('pt-BR')} linhas.`,
  pickTitle: 'Escolha o arquivo',
  pickFile: 'Escolher o arquivo',
  pickFileOther: 'Escolher outro arquivo',
  reading: 'Lendo o arquivo…',
  fileRead: (name: string) => `Arquivo lido: ${name}`,
  linesRead: (n: number) => `${num(n)} ${plural(n, 'linha lida', 'linhas lidas')}`,
  balanceIgnored: 'O saldo que vem no arquivo é ignorado. A Clarevo não guarda saldo por conta.',
  neverSaved: 'O arquivo em si não é guardado. Só as linhas que você confirmar são gravadas.',
  /** Escolha do destino. */
  destinationTitle: 'Para onde vão os lançamentos?',
  destinationAccount: 'Conta',
  destinationAccountHint: 'Extrato: gastos e recebimentos entram no mês de cada data.',
  destinationCard: 'Cartão de crédito',
  destinationCardHint: 'Fatura: as compras entram na fatura e só viram gasto quando você paga a fatura.',
  pickAccount: 'Conta de origem',
  pickCard: 'Cartão de destino',
  noCards: 'Você ainda não cadastrou nenhum cartão.',
  addCard: 'Cadastrar um cartão',
  fileLooksCard: 'Este arquivo parece uma fatura de cartão.',
  fileLooksAccount: 'Este arquivo parece um extrato de conta.',
  continueToReview: 'Revisar as linhas',
  /** Planilha sem cabeçalho conhecido. */
  columnsTitle: 'Quais colunas são quais?',
  columnsIntro: 'Não reconhecemos os nomes das colunas. Escolha qual é a data, a descrição e o valor.',
  columnDate: 'Data',
  columnDescription: 'Descrição',
  columnAmount: 'Valor',
  columnOption: (n: number, sample: string) => (sample === '' ? `Coluna ${n}` : `Coluna ${n}: ${sample.length > 24 ? `${sample.slice(0, 24)}…` : sample}`),
  firstRowHeader: 'A primeira linha tem os nomes das colunas',
  columnsPreview: 'Como o arquivo começa',
  columnsApply: 'Usar estas colunas',
  columnsNeedAll: 'Escolha uma coluna diferente para cada campo.',
  columnsAmountTitle: 'Como o valor aparece?',
  columnsAmountOne: 'Uma coluna de valor',
  columnsAmountTwo: 'Débito e crédito em colunas separadas',
  columnDebit: 'Débito (saída)',
  columnCredit: 'Crédito (entrada)',
  columnKind: 'Tipo da linha (D ou C)',
  columnKindHint: 'Use se os valores vêm sem sinal e outra coluna diz se é débito ou crédito.',
  columnKindNone: 'Sem coluna de tipo',
  columnsNoSign: 'Nenhum valor tem sinal nem coluna de tipo. Num extrato de conta, todas as linhas serão lidas como entrada; numa fatura de cartão, como compra. Confira a escolha antes de seguir.',
  columnsNoSignConfirm: 'Entendi, usar assim',
  columnsMoreHint: 'Role a lista para ver todas as colunas.',
  /** A revisar. */
  reviewTitle: 'A revisar',
  reviewIntro: 'Marque o que vira lançamento. Você pode mudar a descrição e a categoria de cada linha.',
  counts: (total: number, included: number) => `${num(total)} ${plural(total, 'linha', 'linhas')} · ${num(included)} ${plural(included, 'marcada', 'marcadas')}`,
  ignoredLines: (n: number) => `${num(n)} ${plural(n, 'linha do arquivo foi deixada de lado', 'linhas do arquivo foram deixadas de lado')} (sem data ou valor, saldo ou valor zero).`,
  selectAll: 'Selecionar tudo',
  clearAll: 'Limpar seleção',
  invertSigns: 'Entradas e saídas estão trocadas',
  invertSignsHint: 'Use se os gastos aparecerem como recebimentos.',
  kindOut: 'Saída',
  kindIn: 'Entrada',
  kindPurchase: 'Compra',
  kindRefund: 'Estorno',
  kindPayment: 'Pagamento',
  editLine: 'Editar',
  doneEditing: 'Pronto',
  descriptionLabel: 'Descrição',
  categoryLabel: 'Categoria',
  noCategory: 'Sem categoria',
  noDescription: 'Sem descrição',
  alreadyImportedHint: 'Esta linha já foi importada antes e não entra de novo.',
  suggestedCategory: 'Sugerida',
  lineInclude: (description: string, amount: string, date: string) => `Incluir: ${description}, ${amount}, ${date}`,
  /** Marcas. */
  labels: {
    ja_anotado: 'Já anotado',
    parcela: 'Parece parcela',
    pagamento_fatura: 'Parece pagamento de fatura',
    transferencia: 'Parece transferência',
    pagamento_recebido: 'Pagamento da fatura, não entra',
    data_futura: 'Data futura, não entra',
    data_antiga: 'Mais de 48 meses atrás, não entra',
    valor_alto: 'Valor acima do limite, não entra',
    fatura_paga: 'Fatura já paga, não entra',
  } satisfies Record<ReviewLabel, string>,
  labelHints: {
    ja_anotado: 'Parece igual a um lançamento que já existe. Vem desmarcado.',
    parcela: 'Compra parcelada: anote uma vez em Anotar gasto, com o número de parcelas.',
    pagamento_fatura: 'O pagamento da fatura já é registrado em Pagar fatura. Vem desmarcado.',
    transferencia: 'Transferência entre as suas contas não é gasto. Vem desmarcada.',
  } satisfies Partial<Record<ReviewLabel, string>>,
  /** Rodapé. */
  importButton: (n: number) => (n === 0 ? 'Importar' : `Importar ${num(n)} ${plural(n, 'lançamento', 'lançamentos')}`),
  importing: (done: number, total: number) => `Importando… lote ${num(done)} de ${num(total)}`,
  showMore: (n: number, rest: number) => `Mostrar mais ${num(n)} (${num(rest)} ${plural(rest, 'linha restante', 'linhas restantes')})`,
  prepareFailed: 'Não foi possível preparar a revisão agora. Tente de novo.',
  nothingSelected: 'Marque ao menos uma linha para importar.',
  needDescription: 'Toda linha marcada precisa de uma descrição.',
  descriptionTooLong: 'A descrição passa de 80 caracteres.',
  cardPurchaseNote: 'Compras no cartão entram na fatura e não somam em Pago até a fatura ser paga.',
  /** Depois de importar. */
  doneTitle: 'Importação concluída',
  seeInMovements: 'Ver em Movimentos',
  seeInCard: 'Ver o cartão',
  importAnother: 'Importar outro arquivo',
  /** Rodapé da revisão: rótulo curto (cabe ao lado do botão principal em 320 px) e o nome acessível completo. */
  back: 'Voltar',
  backA11y: 'Voltar ao destino',
  /** Falha no meio: o que entrou fica, e repetir é seguro. */
  partial: (done: number, total: number) =>
    `${num(done)} de ${num(total)} ${plural(total, 'lançamento foi importado', 'lançamentos foram importados')} antes da falha. Tente de novo: o que já entrou não é repetido.`,
  retry: 'Tentar novamente',
  needAccount: 'Escolha a conta.',
  needCard: 'Escolha o cartão.',
  noAccountsHint: 'Cadastre uma conta em Conta antes de importar.',
  /** Quem só lê. */
  readOnly: 'Você só tem permissão para ver este espaço. Para importar, peça permissão de escrita.',
  familyNotice: 'Importar extrato fica no espaço Pessoal por enquanto.',
} as const;

/** "18 lançamentos importados, 4 já estavam anotados." e as variações com 0 e 1. */
export function importedSummary(created: number, skipped: number): string {
  const made = `${num(created)} ${plural(created, 'lançamento importado', 'lançamentos importados')}`;
  const already = `${num(skipped)} ${plural(skipped, 'já estava anotado', 'já estavam anotados')}`;
  if (created === 0 && skipped === 0) return 'Nenhum lançamento novo.';
  if (created === 0) return `Nenhum lançamento novo. ${already}.`;
  if (skipped === 0) return `${made}.`;
  return `${made}, ${already}.`;
}

/** Erros ao ler o arquivo, um por código. */
export const IMPORT_ERROR_TEXT: Record<ImportErrorCode, string> = {
  arquivo_vazio: 'O arquivo está vazio.',
  arquivo_grande: 'O arquivo passa de 5 MB. Peça ao banco um período menor.',
  linhas_demais: `O arquivo tem mais de ${IMPORT_MAX_LINES.toLocaleString('pt-BR')} linhas. Peça ao banco um período menor.`,
  formato_desconhecido: 'Não reconhecemos este arquivo. Use um OFX ou uma planilha CSV do banco.',
  arquivo_pdf: 'Este arquivo é um PDF, e neste aparelho a Clarevo ainda não lê extrato em PDF. No app ou no site do banco, procure a opção de exportar o extrato em OFX ou CSV.',
  pdf_sem_lancamentos:
    'Não achamos lançamentos neste PDF. Confira se é o extrato ou a fatura (com data, descrição e valor em cada linha) ou peça ao banco o arquivo em OFX ou CSV.',
  pdf_ilegivel: 'Não conseguimos abrir este PDF. Se ele tem senha, peça ao banco o extrato sem senha, em OFX ou CSV.',
  pdf_paginas_demais: 'O PDF passa de 30 páginas. Peça ao banco o extrato de um período menor, ou em OFX ou CSV.',
  planilha_excel: 'Este arquivo é uma planilha de Excel. Abra a planilha, salve uma cópia no formato CSV e escolha esse arquivo de novo.',
  sem_lancamentos: 'Não achamos lançamentos neste arquivo.',
  moeda_diferente: 'Este arquivo não está em reais. A Clarevo importa só valores em reais.',
  ofx_invalido: 'Este arquivo OFX não tem um extrato que possamos ler.',
  csv_invalido: 'Não conseguimos ler esta planilha. Confira se é um CSV do banco.',
};

/** Erros ao importar (códigos do banco), com a posição da linha quando houver. */
export const IMPORT_SAVE_ERROR_TEXT: Record<string, string> = {
  itens_invalidos: 'O pedido de importação não está completo. Revise as linhas e tente de novo.',
  destino_invalido: 'Escolha de novo a conta ou o cartão.',
  conta_invalida: 'Esta conta não está disponível. Escolha outra conta ativa.',
  nao_encontrado: 'Não encontramos este cartão. Escolha de novo.',
  cartao_arquivado: 'Este cartão está arquivado. Reative o cartão ou escolha outro.',
  fatura_paga: 'Uma das linhas cai numa fatura que já foi paga. Desmarque a linha ou desfaça o pagamento da fatura.',
  limite_de_lancamentos: 'O cartão chegou ao limite de 5.000 lançamentos.',
  sem_permissao: 'Você não tem permissão para importar neste espaço.',
  valor_invalido: 'Uma das linhas tem valor inválido.',
  valor_acima_do_limite: 'Uma das linhas passa do valor máximo de R$ 9.999.999,99.',
  descricao_obrigatoria: 'Uma das linhas está sem descrição.',
  descricao_longa: 'Uma das linhas tem descrição acima de 80 caracteres.',
  categoria_invalida: 'Uma das linhas tem categoria inválida.',
  data_invalida: 'Uma das linhas tem data inválida ou antiga demais.',
  data_futura: 'Uma das linhas tem data futura.',
  mes_invalido: 'Uma das linhas cai numa fatura fora do período aceito.',
  tipo_invalido: 'Uma das linhas tem tipo que o destino não aceita.',
  chave_de_importacao_invalida: 'Não foi possível identificar uma das linhas. Leia o arquivo de novo.',
  rede: 'Sem conexão. Verifique a internet e tente de novo.',
  desconhecido: 'Não foi possível importar agora. Tente de novo.',
};

/**
 * Posição, na lista de itens enviados (de 0 em diante), da linha que o banco recusou: `detail` é "item=N" (N de 1 em diante, dentro
 * do lote) e `batchIndex` é o lote (de 0 em diante, de IMPORT_BATCH itens). null quando o detalhe não traz posição.
 */
export function failedItemIndex(detail: string | undefined, batchIndex: number): number | null {
  const at = /^item=(\d{1,4})$/.exec(detail ?? '');
  const n = at ? Number(at[1]) : 0;
  return n >= 1 ? batchIndex * IMPORT_BATCH + n - 1 : null;
}

/** Texto do erro de importação; com a linha recusada (descrição, valor e data já formatados), diz qual é. */
export function importSaveErrorText(code: string, line?: { description: string; amount: string; date: string }): string {
  const base = IMPORT_SAVE_ERROR_TEXT[code] ?? IMPORT_SAVE_ERROR_TEXT.desconhecido!;
  return line ? `${base} Linha: ${line.description || IMPORT_TEXT.noDescription}, ${line.amount}, ${line.date}.` : base;
}

/** Nome acessível de uma linha da revisão. */
export function reviewLineA11y(description: string, amountCents: number, date: string, kindLabel: string, label: string | null): string {
  return [`${description}`, formatBRL(amountCents), formatDateBR(date), kindLabel, label].filter(Boolean).join(', ');
}

