import { normalizeDescription } from './dedupe';
import type { ImportDestination } from './tipos';

/**
 * Gasto ou recebimento (saída ou entrada) de uma linha importada, quando o arquivo não diz pelo sinal (D-108, retorno do teste: a
 * linha "ENTRADA REND PAGO APLIC AUT APR" de R$ 0,01 entrou como gasto, e era o rendimento da aplicação automática). Vale para o PDF,
 * para os prints (imagem lida no aparelho) e para a planilha sem sinal e sem coluna de tipo; o OFX e a planilha com sinal ou com
 * colunas de débito e crédito continuam valendo pelo que o arquivo diz. A ordem, da prova mais forte para a mais fraca:
 *
 * 1. a marca do próprio valor: "-50,00", "50,00-", "50,00 D" saiu; "+0,01" e "0,01 C" entrou;
 * 2. as palavras da descrição: imposto sobre o rendimento ("IR", "IOF") saiu; "entrada", "recebido", "rend pago", "rendimento",
 *    "estorno", "salário", "depósito", "reembolso", "resgate" entraram; "pagamento", "compra", "tarifa", "saque", "enviado",
 *    "aplicação" saíram; "crédito" (fora de "cartão de crédito") entrou;
 * 3. o costume do arquivo: num extrato em que as saídas trazem "-" (ou "D"), o valor sem marca é entrada; num em que as entradas
 *    trazem "+" (ou "C"), o valor sem marca é saída;
 * 4. sem nada disso, saída (a maioria das linhas de um extrato).
 *
 * Na fatura do cartão a regra é outra: a compra vem sem marca, e "-", "C" ou as palavras de crédito ("estorno", "pagamento",
 * "crédito", "devolução") são crédito. A pessoa confere cada linha e pode trocar gasto por recebimento (ou compra por estorno) antes
 * de importar.
 */

export type LineDirection = 'entrada' | 'saida';

/** Marca escrita junto do valor. */
export type AmountMark = 'menos' | 'mais' | 'D' | 'C' | null;

/** Imposto sobre rendimento ou resgate: sai, mesmo com "rendimento" ou "resgate" na descrição. */
const TAX_OUT = /\b(imposto|irrf|iof|ir s|ir sobre|ir rend|ir aplic)\b/;
/** Entrou: palavras que só aparecem em dinheiro que chegou à conta. */
const STRONG_IN =
  /\b(entrada|entradas|recebid[oa]s?|recebimento|rec pix|pix rec|pix recebido|ted rec|ted recebida|doc rec|doc recebido|transf rec|transferencia recebida|rend|rend pago|rendimentos?|rendto|estorno|estornad[oa]|extorno|salario|salarios|proventos|deposito|depositos|dep dinheiro|reembolso|ressarcimento|devolucao|devolvid[oa]|cashback|resgate|resg|credito em conta|cred em conta|juros recebidos)\b/;
/** Saiu. */
const OUT_WORDS =
  /\b(enviad[oa]|env|pagamento|pagamentos|pagto|pgto|pag|pago|compra|compras|tarifa|tarifas|saque|debito|deb|boleto|juros|anuidade|fatura|aplicacao|aplic|apl|parcela|parc|prestacao|emprestimo|financiamento|seguro|mensalidade|transferencia enviada|transf env)\b/;
/** Entrou, mas a palavra também aparece em saídas ("cartão de crédito"): só vale quando nada mais decide. */
const WEAK_IN = /\b(credito|cred|creditado|creditada)\b/;
/** Expressões em que "crédito" não quer dizer que o dinheiro entrou. */
const NOT_CREDIT = /\b(cartao|cart|cartoes) (de )?(credito|cred)\b|\b(credito|cred) pessoal\b/g;

/** Fatura do cartão: o que é crédito (entra na fatura como abatimento). */
const CARD_CREDIT = /\b(estorno|estornad[oa]|extorno|pagamento|pagto|pgto|credito|reembolso|devolucao|devolvid[oa]|cashback|ajuste a credito)\b/;

/** O que as palavras dizem: `firm` (imposto, entrada ou saída clara) e `weak` (só "crédito", que também aparece em saídas). */
function readWords(description: string): { firm: LineDirection | null; weak: LineDirection | null } {
  const text = normalizeDescription(description);
  if (text === '') return { firm: null, weak: null };
  if (TAX_OUT.test(text)) return { firm: 'saida', weak: null };
  if (STRONG_IN.test(text)) return { firm: 'entrada', weak: null };
  if (OUT_WORDS.test(text)) return { firm: 'saida', weak: null };
  return { firm: null, weak: WEAK_IN.test(text.replace(NOT_CREDIT, ' ')) ? 'entrada' : null };
}

/**
 * A direção que as palavras da descrição indicam num extrato de conta, ou null quando nada decide. "Pago" e "aplicação" saem, mas
 * "rend pago aplic" (o rendimento da aplicação pago na conta) entra: as palavras de entrada vencem as de saída.
 */
export function wordsDirection(description: string): LineDirection | null {
  const w = readWords(description);
  return w.firm ?? w.weak;
}

/** A descrição de uma linha de fatura diz que é crédito (estorno, pagamento, devolução)? */
export function cardCreditWords(description: string): boolean {
  return CARD_CREDIT.test(normalizeDescription(description));
}

/**
 * O costume do arquivo, pelas marcas dos valores: só "-" ou "D" (as saídas marcadas) → o valor sem marca é entrada; só "+" ou "C"
 * (as entradas marcadas) → o valor sem marca é saída; as duas ou nenhuma → null.
 */
export function unmarkedDirection(marks: readonly AmountMark[]): LineDirection | null {
  const out = marks.some((m) => m === 'menos' || m === 'D');
  const inn = marks.some((m) => m === 'mais' || m === 'C');
  if (out && !inn) return 'entrada';
  if (inn && !out) return 'saida';
  return null;
}

/**
 * A direção de uma linha de extrato de conta (`statement` 'conta') ou de fatura ('cartao'). `unmarked` é o costume do arquivo
 * (`unmarkedDirection`), usado só quando a marca e as palavras não decidem.
 */
export function lineDirection(statement: ImportDestination, mark: AmountMark, description: string, unmarked: LineDirection | null = null): LineDirection {
  if (statement === 'cartao') {
    if (mark === 'D') return 'saida';
    if (mark === 'menos' || mark === 'C' || cardCreditWords(description)) return 'entrada';
    return 'saida';
  }
  if (mark === 'menos' || mark === 'D') return 'saida';
  if (mark === 'mais' || mark === 'C') return 'entrada';
  const w = readWords(description);
  return w.firm ?? unmarked ?? w.weak ?? 'saida';
}

/** Valor com sinal na convenção do app (negativo saiu, positivo entrou). */
export function signedByDirection(cents: number, direction: LineDirection): number {
  return direction === 'saida' ? -Math.abs(cents) : Math.abs(cents);
}
