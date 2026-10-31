import type { IsoDate } from '../dates';

/**
 * Importar extrato ou fatura (D-048, Ciclo I1). O arquivo (OFX ou CSV) é lido no aparelho; nada dele é guardado além dos
 * lançamentos que a pessoa confirma e do resumo (`import_key`) de cada linha. Tipos compartilhados dos leitores, da revisão e do
 * repositório.
 */

/** Onde as linhas vão parar: gastos e recebimentos de uma conta (D-043) ou compras e estornos de um cartão (D-037). */
export type ImportDestination = 'conta' | 'cartao';

/** Tamanho máximo do arquivo: 5 MB. */
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
/** Quantas linhas um arquivo pode ter: 5.000. */
export const IMPORT_MAX_LINES = 5000;
/** Quantos itens vão numa chamada de importação (o banco recusa mais que isso); a tela divide em lotes. */
export const IMPORT_BATCH = 500;

/** Por que um arquivo não foi lido. */
export type ImportErrorCode =
  | 'arquivo_vazio'
  | 'arquivo_grande'
  | 'linhas_demais'
  | 'formato_desconhecido'
  | 'arquivo_pdf'
  | 'pdf_sem_lancamentos'
  | 'pdf_ilegivel'
  | 'pdf_paginas_demais'
  | 'planilha_excel'
  | 'sem_lancamentos'
  | 'moeda_diferente'
  | 'ofx_invalido'
  | 'csv_invalido';

/**
 * Uma linha lida do arquivo, antes de escolher o destino. `amountCents` é inteiro com sinal na convenção do dinheiro que mexe:
 * negativo = saiu (gasto na conta, compra no cartão), positivo = entrou (recebimento, estorno, pagamento da fatura). Nunca zero.
 */
export interface ParsedLine {
  /** Posição na lista de linhas lidas, de 1 em diante. */
  ordinal: number;
  date: IsoDate;
  /** Texto aparado, com os espaços do meio reduzidos a um, de 1 a 80 caracteres. */
  description: string;
  amountCents: number;
  /** Identificador da linha no arquivo (FITID do OFX), quando houver. Só entra no resumo da chave; nunca é guardado. */
  fitId: string | null;
}

/** O arquivo lido: as linhas e o que foi deixado de lado. O saldo do arquivo é sempre ignorado (não existe saldo por conta, P-018). */
export interface ImportParse {
  source: 'ofx' | 'csv' | 'pdf';
  /** O arquivo diz que é extrato de conta ou fatura de cartão (OFX); null quando não dá para saber (planilha). */
  statement: ImportDestination | null;
  lines: ParsedLine[];
  /** Linhas do arquivo que não viraram lançamento (sem data ou valor legível, saldo, valor zero). */
  ignored: number;
  /** O arquivo trazia saldo, que é ignorado. */
  balanceIgnored: boolean;
  /**
   * Planilha com o valor numa coluna só, sem tipo: numa fatura de cartão a compra costuma ser o valor positivo, então com destino
   * "cartão" a revisão inverte o sinal. Falso no OFX (sinal definido pelo formato) e nas planilhas com débito e crédito separados
   * ou com coluna de tipo.
   */
  cardPositive: boolean;
}

export type ImportFileResult = { ok: true; parse: ImportParse } | { ok: false; code: ImportErrorCode };

/** Uma linha pronta para o banco (import_records). `kind` é do destino: despesa e receita na conta; compra e estorno no cartão. */
export interface ImportItem {
  /** Resumo SHA-256 da linha (64 hexadecimais minúsculos). */
  importKey: string;
  kind: 'despesa' | 'receita' | 'compra' | 'estorno';
  /** Positivo, em centavos. */
  amountCents: number;
  /** Dia do gasto, do recebimento, da compra ou do estorno. */
  occurredOn: IsoDate;
  /** De 1 a 80 caracteres. */
  description: string;
  category: string | null;
}

/** Resultado de uma importação: quantas linhas viraram lançamento e quantas já existiam (chave repetida) e foram puladas. */
export interface ImportResult {
  created: number;
  skipped: number;
}
