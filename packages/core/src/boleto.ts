import { addDays, daysBetween, formatDateBR, type IsoDate } from './dates';
import { cleanPersonName, fitWords, fold, toLines, cleanText } from './comprovante/texto';
import { MAX_RECORD_CENTS, formatBRL, type Cents } from './money';
import { boletoBarcodeOf } from './nota-flow';
import { DESCRIPTION_MAX } from './validation';

/**
 * Boleto de uma conta (D-078 G; retorno do teste: "poderia ter como importar um PDF ou a imagem de uma conta, tipo o boleto do seguro
 * do carro"): do código de barras, da linha digitável ou do PDF do boleto saem o valor e o vencimento da conta a pagar.
 *
 * Tudo vem do próprio código, conferido pelos dígitos verificadores (`boletoBarcodeOf`), não de rótulos do PDF:
 * - boleto bancário (linha de 47 dígitos): o valor nas posições 10 a 19 do código de barras e o vencimento pelo fator de vencimento
 *   (dias desde 07/10/1997; o fator chegou a 9999 em 21/02/2025 e recomeçou de 1000 em 22/02/2025, então vale a data mais perto de
 *   hoje). Fator 0000: sem vencimento; valor zero: sem valor (o boleto deixa a pessoa digitar);
 * - conta de consumo ou tributo (48 dígitos, começa por 8): o valor nas posições 5 a 15 quando o código diz que é valor em reais
 *   (identificador 6 ou 8); o vencimento não tem lugar fixo nesse código e fica para a pessoa.
 * Do PDF, além do código, só o nome de quem recebe ("Beneficiário"), sem documento, como sugestão de descrição. O código, a linha e o
 * texto do PDF não são guardados: a leitura só preenche o formulário de conta a pagar.
 */

export interface BoletoReading {
  kind: 'bancario' | 'arrecadacao';
  /** Valor em centavos; null quando o código não traz (ou passa do limite de um registro). */
  amountCents: Cents | null;
  /** Vencimento; null quando o código não traz. */
  dueOn: IsoDate | null;
  /** Nome de quem recebe, lido do PDF (sem CPF ou CNPJ); null fora do PDF ou sem nome. */
  description: string | null;
}

const FACTOR_BASE: IsoDate = '1997-10-07';
/** Dia em que o fator recomeçou de 1000 (FEBRABAN). */
const FACTOR_RESTART: IsoDate = '2025-02-22';

/** Vencimento do fator: das duas leituras possíveis (antes e depois de 22/02/2025), a mais perto de hoje. null com fator 0. */
export function boletoDueDate(factor: number, today: IsoDate): IsoDate | null {
  if (!Number.isInteger(factor) || factor <= 0 || factor > 9999) return null;
  const first = addDays(FACTOR_BASE, factor);
  if (factor < 1000) return first;
  const second = addDays(FACTOR_RESTART, factor - 1000);
  return Math.abs(daysBetween(today, second)) < Math.abs(daysBetween(today, first)) ? second : first;
}

function amountOf(cents: number): Cents | null {
  return Number.isInteger(cents) && cents >= 1 && cents <= MAX_RECORD_CENTS ? cents : null;
}

/** Valor e vencimento do código de barras, da linha digitável (com ou sem pontos e espaços). null quando não é boleto. */
export function readBoleto(raw: string, today: IsoDate): BoletoReading | null {
  const code = boletoBarcodeOf(raw);
  if (!code) return null;
  const b = code.barcode;
  if (code.kind === 'bancario') {
    return { kind: 'bancario', amountCents: amountOf(Number(b.slice(9, 19))), dueOn: boletoDueDate(Number(b.slice(5, 9)), today), description: null };
  }
  const realValue = b[2] === '6' || b[2] === '8';
  return { kind: 'arrecadacao', amountCents: realValue ? amountOf(Number(b.slice(4, 15))) : null, dueOn: null, description: null };
}

/** Trechos de algarismos com pontos, espaços e hífens no meio (como a linha digitável aparece), até 120 caracteres. */
const DIGIT_RUN = /\d[\d.\s-]{30,118}\d/g;

/** O código do boleto dentro de um texto: o trecho inteiro ou um pedaço de 47, 48 ou 44 algarismos que passe na conferência. */
function codeInText(text: string, today: IsoDate): BoletoReading | null {
  for (const line of toLines(text)) {
    for (const m of line.matchAll(DIGIT_RUN)) {
      const whole = readBoleto(m[0], today);
      if (whole) return whole;
      const only = m[0].replace(/\D/g, '');
      for (const size of [47, 48, 44]) {
        for (let i = 0; i + size <= only.length; i++) {
          const part = readBoleto(only.slice(i, i + size), today);
          if (part) return part;
        }
      }
    }
  }
  return null;
}

/** Nome depois de "Beneficiário" (ou "Cedente"), na mesma linha ou na seguinte, sem documento. */
function beneficiaryOf(lines: string[]): string | null {
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*(beneficiario|cedente)(\s+final)?\s*:?\s*(.*)$/.exec(fold(lines[i]!));
    if (!m) continue;
    const start = lines[i]!.length - m[3]!.length;
    for (const candidate of [lines[i]!.slice(start), lines[i + 1] ?? '']) {
      const name = candidate.trim() ? cleanPersonName(candidate) : null;
      if (name) return fitWords(name, DESCRIPTION_MAX);
    }
  }
  return null;
}

/** Leitura do texto de um PDF de boleto (ou de um texto colado): o código e o nome de quem recebe. null sem código de boleto. */
export function boletoFromText(raw: string, today: IsoDate): BoletoReading | null {
  const text = typeof raw === 'string' ? cleanText(raw).slice(0, 100_000) : '';
  const reading = codeInText(text, today);
  if (!reading) return null;
  return { ...reading, description: beneficiaryOf(toLines(text)) };
}

/** Textos de "Ler boleto" em Anotar conta a pagar. */
export const BOLETO_TEXT = {
  line: 'Ler boleto',
  lineHint: 'Código de barras, linha digitável ou PDF do boleto',
  lineA11y: 'Ler boleto. Código de barras, linha digitável ou PDF do boleto.',
  sheetTitle: 'Ler boleto',
  camera: 'Usar a câmera',
  pdf: 'Ler o PDF do boleto',
  /** Com a leitura de imagem (no navegador, D-078 B). */
  pdfOrImage: 'Ler o PDF ou uma foto do boleto',
  workingImage: 'Lendo a imagem aqui no aparelho. Pode levar alguns segundos…',
  paste: 'Colar ou digitar a linha digitável',
  privacy: 'O boleto é lido aqui no aparelho e não é guardado. Ficam só o valor, o vencimento e a descrição que você salvar.',
  cameraTitle: 'Ler o código do boleto',
  cameraAim: 'Aponte a câmera para o código de barras do boleto, com o celular deitado e o código inteiro na tela.',
  cameraIntro: 'A Clarevo usa a câmera só para ler o código do boleto. Nenhuma foto é guardada.',
  cameraCloser: 'Deixe o código de barras inteiro dentro da moldura, sem reflexo.',
  cameraDenied: 'Para usar a câmera, permita o acesso nos ajustes do aparelho. Você também pode ler o PDF ou colar a linha digitável.',
  cameraUnavailable: 'Não conseguimos usar a câmera neste aparelho. Você pode ler o PDF ou colar a linha digitável.',
  pasteTitle: 'Linha digitável do boleto',
  pasteLabel: 'Linha digitável ou código de barras',
  pasteHint: 'Os números que ficam acima do código de barras. Pode colar com pontos e espaços.',
  pasteSubmit: 'Ler o boleto',
  working: 'Lendo o boleto aqui no aparelho…',
  undo: 'Desfazer leitura',
  readAgain: 'Ler outro boleto',
  /** O que o código não traz. */
  noAmount: 'O código não traz o valor. Digite o valor do boleto.',
  noDue: 'O código não traz o vencimento. Digite a data.',
  noDueCollection: 'Contas de luz, água e telefone não trazem o vencimento no código. Digite a data.',
  pastDue: 'O vencimento lido já passou. Confira a data.',
  filled: 'Preenchemos o valor e o vencimento do boleto. Confira e toque em Salvar.',
  errors: {
    invalid: 'Não reconhecemos um boleto nestes números. Confira se copiou a linha digitável inteira, com 47 ou 48 números.',
    notaFiscal: 'Este é o código de uma nota fiscal, não de um boleto. Para anotar um gasto já pago, use Anotar gasto.',
    pdfNone: 'Não achamos a linha digitável neste PDF. Cole ou digite os números do boleto.',
    imageNone: 'Não achamos a linha digitável nesta imagem. Tente uma foto mais nítida, só da linha, ou digite os números.',
    pdfFailed: 'Não foi possível ler este PDF. Cole ou digite os números do boleto.',
    pdfTooBig: 'Este PDF é grande demais para ler aqui. Cole ou digite os números do boleto.',
    notPdf: 'Este arquivo não é um PDF.',
  },
  /** "Boleto lido: R$ 1.234,56 · vence em 10/11/2026" (só o que a leitura traz). */
  readLine: (r: Pick<BoletoReading, 'amountCents' | 'dueOn' | 'description'>): string =>
    `Boleto lido: ${[r.description, r.amountCents === null ? null : formatBRL(r.amountCents), r.dueOn ? `vence em ${formatDateBR(r.dueOn)}` : null].filter(Boolean).join(' · ') || 'sem valor nem vencimento'}`,
} as const;

/** Avisos do que a leitura não trouxe, para não parecer falha. */
export function boletoGaps(r: BoletoReading, today: IsoDate): string[] {
  const out: string[] = [];
  if (r.amountCents === null) out.push(BOLETO_TEXT.noAmount);
  if (r.dueOn === null) out.push(r.kind === 'arrecadacao' ? BOLETO_TEXT.noDueCollection : BOLETO_TEXT.noDue);
  else if (r.dueOn < today) out.push(BOLETO_TEXT.pastDue);
  return out;
}
