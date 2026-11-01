import { formatMonthYearBR, type IsoMonth } from '../dates';
import type { Cents } from '../money';
import { fold, scanMoney } from './texto';
import type { ComprovanteReading, PdfTextItem } from './tipos';

/**
 * Holerite (contracheque, recibo de pagamento de salário) em PDF, lido em Registrar recebimento (retorno do teste, 31/10/2026: "ele
 * precisa conseguir ler o valor líquido e a data; no caso de folha é só o mês de competência").
 *
 * O que sai: o valor líquido e o mês de competência, que vira a descrição ("Salário de setembro de 2026"). O dia não sai: o holerite
 * traz o mês, não o dia em que o salário entrou, e a pessoa escolhe o dia. O que NUNCA sai: nome, CPF, CNPJ, cargo, matrícula,
 * banco, agência, conta, salário base, as linhas de vencimentos e descontos (plano de saúde, empréstimos, pensão) e as bases de
 * INSS, FGTS e IRRF. Nada disso tem campo no resultado.
 *
 * Como lê o valor. Nos holerites, o rótulo "Valor Líquido" e o valor costumam ficar em colunas e linhas diferentes do texto corrido
 * do PDF (a ordem dos pedaços de texto não segue a página). Por isso o app entrega também a posição de cada pedaço (`PdfTextItem`):
 * o valor é o número mais perto do rótulo, na mesma linha à direita ou logo abaixo. Sem as posições (ou sem achar assim), vale o
 * primeiro valor depois do rótulo no texto, na mesma linha ou na seguinte.
 */

const HOLERITE_TITLES = [
  'holerite',
  'contracheque',
  'contra-cheque',
  'contra cheque',
  'folha mensal',
  'folha de pagamento',
  'recibo de pagamento de salario',
  'recibo de salario',
  'demonstrativo de pagamento',
  'demonstrativo de salario',
];

/** O texto (já sem acentos e em minúsculas) é de um holerite: um título de folha, "líquido" e a coluna de vencimentos ou descontos. */
export function looksLikeHolerite(folded: string): boolean {
  return (
    HOLERITE_TITLES.some((t) => folded.includes(t)) &&
    folded.includes('liquido') &&
    (folded.includes('vencimentos') || folded.includes('proventos') || folded.includes('descontos'))
  );
}

/** Rótulo do valor líquido, sem acento e em minúsculas. */
const NET_LABEL = /(?:valor|total)\s+liquido|liquido\s+(?:a\s+receber|do\s+mes|a\s+pagar)|^liquido\b/;

const MONEY_ONLY = /^\s*(?:r\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2}\s*$/i;

function moneyOf(text: string): Cents | null {
  const m = scanMoney(text, 0, Math.min(text.length, 60));
  return m ? m.cents : null;
}

/** O valor líquido pela posição na página: mesma linha à direita (até 3 pt de diferença na altura) ou logo abaixo (até 40 pt). */
function netFromItems(items: readonly PdfTextItem[]): Cents | null {
  const labels = items.filter((i) => NET_LABEL.test(fold(i.str.trim())));
  for (const label of labels) {
    // "Valor Líquido: 2.345,67" no mesmo pedaço de texto.
    const after = fold(label.str).replace(NET_LABEL, ' ');
    const inside = /\d,\d{2}/.test(after) ? moneyOf(after) : null;
    if (inside !== null) return inside;
    let best: { cents: Cents; score: number } | null = null;
    for (const item of items) {
      if (item === label || item.page !== label.page || !MONEY_ONLY.test(item.str)) continue;
      const dy = label.y - item.y;
      const dx = item.x - label.x;
      if (dy < -3 || dy > 40 || dx < -20 || dx > label.width + 260) continue;
      const cents = moneyOf(item.str);
      if (cents === null) continue;
      const score = (Math.abs(dy) <= 3 ? 0 : 1000) + Math.abs(dy) * 10 + Math.abs(dx);
      if (best === null || score < best.score) best = { cents, score };
    }
    if (best) return best.cents;
  }
  return null;
}

/** Sem posições: o primeiro valor depois do rótulo, na mesma linha ou na seguinte. */
function netFromText(lines: readonly string[]): Cents | null {
  for (let i = 0; i < lines.length; i++) {
    const folded = fold(lines[i]!);
    const m = NET_LABEL.exec(folded.trim()) ?? /(?:valor|total)\s+liquido|liquido\s+(?:a\s+receber|do\s+mes|a\s+pagar)/.exec(folded);
    if (!m) continue;
    const start = folded.indexOf(m[0]) + m[0].length;
    const sameLine = lines[i]!.slice(start);
    if (/\d,\d{2}/.test(sameLine)) {
      const cents = moneyOf(sameLine);
      if (cents !== null) return cents;
    }
    const next = lines[i + 1];
    if (next !== undefined && /\d,\d{2}/.test(next)) {
      const cents = moneyOf(next);
      if (cents !== null) return cents;
    }
  }
  return null;
}

const MONTHS = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SHORT_MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function isoMonth(year: number, monthIndex: number): IsoMonth | null {
  if (year < 2000 || year > 2099 || monthIndex < 0 || monthIndex > 11) return null;
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}` as IsoMonth;
}

/**
 * Mês de competência: "Setembro de 2026", "Setembro/2026", "SET/2026" ou, depois de "Competência", "Referência", "Mês/Ano" ou
 * "Período", "09/2026". Uma data com dia (a da assinatura, a de admissão) não conta.
 */
export function holeriteMonth(folded: string): IsoMonth | null {
  const long = new RegExp(`\\b(${MONTHS.join('|')})\\s*(?:de|/|-)?\\s*(20\\d{2})\\b`).exec(folded);
  if (long) return isoMonth(Number(long[2]), MONTHS.indexOf(long[1]!));
  const labeled = /(?:competencia|referencia|mes\s*\/\s*ano|periodo)\s*:?\s*(\d{1,2})\s*\/\s*(20\d{2})\b/.exec(folded);
  if (labeled) return isoMonth(Number(labeled[2]), Number(labeled[1]) - 1);
  const short = new RegExp(`\\b(${SHORT_MONTHS.join('|')})\\s*/\\s*(20\\d{2})\\b`).exec(folded);
  if (short) return isoMonth(Number(short[2]), SHORT_MONTHS.indexOf(short[1]!));
  return null;
}

/** "Salário de setembro de 2026"; sem o mês, "Salário". */
export function holeriteDescription(month: IsoMonth | null): string {
  return month ? `Salário de ${formatMonthYearBR(month)}` : 'Salário';
}

/** A leitura do holerite: recebimento, com o valor líquido (ou null) e a descrição com o mês de competência. */
export function holeriteReading(lines: readonly string[], folded: string, items: readonly PdfTextItem[] | undefined): ComprovanteReading {
  const amountCents = (items && items.length > 0 ? netFromItems(items) : null) ?? netFromText(lines);
  return {
    kind: 'holerite',
    direction: 'entrada',
    directionGuessed: false,
    amountCents,
    occurredOn: null,
    time: null,
    counterpart: null,
    message: holeriteDescription(holeriteMonth(folded)),
  };
}
