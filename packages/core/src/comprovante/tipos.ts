import type { IsoDate } from '../dates';
import type { Cents } from '../money';

/**
 * Comprovante de Pix e de pagamento em PDF (Ciclo I2, D-051): o que a leitura devolve.
 *
 * Privacidade: o resultado tem só os campos abaixo. CPF e CNPJ (inteiros ou mascarados), chave Pix, banco ou instituição, agência,
 * conta, ID da transação (E2E id), código de autenticação, protocolo, número do cartão e o texto original não têm campo aqui: o
 * leitor descarta tudo isso. Do nome, só o da pessoa ou empresa da outra ponta (quem recebeu, num gasto; quem enviou, num
 * recebimento).
 */

/**
 * Pix, TED, boleto pago, débito; `outro` quando o comprovante é de pagamento ou transferência sem dizer qual; `holerite` para o
 * holerite (contracheque), sempre um recebimento (`holerite.ts`).
 */
export type ComprovanteKind = 'pix' | 'ted' | 'boleto' | 'debito' | 'outro' | 'holerite';

/** `saida`: o dinheiro saiu (gasto). `entrada`: o dinheiro entrou (recebimento). */
export type ComprovanteDirection = 'saida' | 'entrada';

export interface ComprovanteReading {
  kind: ComprovanteKind;
  /** Para onde o dinheiro foi; null quando o comprovante não diz e a tela não deu um padrão. */
  direction: ComprovanteDirection | null;
  /** O comprovante não dizia: a direção veio do tipo da tela onde a pessoa lê (Anotar gasto ou Registrar recebimento). */
  directionGuessed: boolean;
  /** Valor em centavos; null quando não achou. */
  amountCents: Cents | null;
  /** Data do pagamento ou do recebimento (não a de vencimento nem a de agendamento); null quando não achou. */
  occurredOn: IsoDate | null;
  /** "14:32", quando o comprovante traz a hora. */
  time: string | null;
  /** Nome de quem recebeu (saída) ou de quem enviou (entrada), sem documento; null quando não achou. */
  counterpart: string | null;
  /** Descrição ou mensagem que a pessoa escreveu no comprovante, sem números longos; null quando não há. */
  message: string | null;
}

export type ComprovanteErrorCode = 'texto_vazio' | 'nota_fiscal' | 'nao_e_comprovante';

export type ComprovanteResult = { ok: true; reading: ComprovanteReading } | { ok: false; code: ComprovanteErrorCode };

/**
 * Um pedaço de texto do PDF com a posição na página (em pontos, a partir do canto de baixo à esquerda, como no PDF). Só o holerite
 * usa: nele, o rótulo e o valor ficam em colunas que o texto corrido separa. O app monta a lista na leitura e a descarta junto do texto.
 */
export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  page: number;
}

export interface ComprovanteOptions {
  /** Os pedaços de texto com a posição (opcional; ver `PdfTextItem`). */
  items?: readonly PdfTextItem[];
  /**
   * Direção a usar quando o comprovante não diz se o dinheiro saiu ou entrou (muitos comprovantes de transferência trazem "Origem"
   * e "Destino" e nenhum aviso): a de Anotar gasto (`saida`) ou a de Registrar recebimento (`entrada`).
   */
  defaultDirection?: ComprovanteDirection;
}

/** Quanto do texto do PDF é lido; o excedente é ignorado. Um comprovante tem uma ou duas páginas. */
export const COMPROVANTE_TEXT_MAX = 100_000;
/** No máximo estas linhas (de até `COMPROVANTE_LINE_MAX` caracteres) entram na leitura. */
export const COMPROVANTE_LINES_MAX = 600;
export const COMPROVANTE_LINE_MAX = 4_000;
