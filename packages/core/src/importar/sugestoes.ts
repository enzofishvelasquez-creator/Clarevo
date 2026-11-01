import { fold } from '../comprovante/texto';
import { daysBetween } from '../dates';
import { formatBRL, MAX_RECORD_CENTS, type Cents } from '../money';
import { CATEGORIES } from '../records';
import { DESCRIPTION_MAX } from '../validation';
import { installmentMark } from './dedupe';
import type { ReviewLine } from './revisao';

/**
 * Sugestões depois de importar um extrato ou uma fatura (D-078 H; retorno do teste: "identificamos um valor referente à companhia de
 * luz, gostaria de adicionar como conta recorrente?" e "identificamos 300 reais gastos em postos de gasolina, gostaria de adicionar
 * esse valor no seu planejamento?"). Regras simples, sem IA, só com as linhas importadas, no aparelho; nada é gravado: cada sugestão
 * abre o cadastro já preenchido, e a pessoa confere e salva.
 *
 * 1. Conta que se repete → gasto fixo: gastos da conta (não compras no cartão, que já entram na fatura) com a mesma descrição, sem
 *    os números e as palavras do meio de pagamento ("pagamento de boleto", "pix enviado"), em 2 meses ou mais, e valores parecidos (o maior até 30% acima do menor). Fica de fora o que já tem um gasto fixo
 *    com descrição parecida. Até 5, os de maior valor. Valor e dia: os da ocorrência mais recente.
 * 2. Média por categoria → orçamento: gastos e compras no cartão de cada categoria, somados e divididos pelos meses do período dos
 *    gastos (da primeira à última data, 30 dias por mês, sem as parcelas), arredondados para cima em R$ 10,00. Só categorias de gasto sem orçamento, a partir de R$ 50,00 por mês. Até 3, as maiores.
 */

export interface RecurringSuggestion {
  description: string;
  amountCents: Cents;
  /** Dia do mês da ocorrência mais recente (1 a 31). */
  day: number;
  /** Em quantos meses diferentes apareceu. */
  months: number;
  category: string | null;
}

export interface BudgetSuggestion {
  category: string;
  monthlyCents: Cents;
}

export interface ImportSuggestions {
  recurring: RecurringSuggestion[];
  budgets: BudgetSuggestion[];
}

type Line = Pick<ReviewLine, 'date' | 'description' | 'amountCents' | 'kind' | 'category'>;

export const RECURRING_MAX = 5;
export const BUDGET_SUGGESTION_MAX = 3;
export const BUDGET_SUGGESTION_MIN_CENTS = 5_000;
const RECURRING_SPREAD = 1.3;

/** Palavras que só dizem o meio de pagamento ("pagamento de boleto", "pix enviado", "débito automático"): saem da chave. */
const PAYMENT_WORDS = new Set([
  'pag', 'pagto', 'pagamento', 'pgto', 'boleto', 'bol', 'pix', 'enviado', 'enviada', 'env', 'ted', 'doc', 'transferencia', 'transf',
  'deb', 'debito', 'automatico', 'aut', 'compra', 'cartao', 'de', 'do', 'da', 'dos', 'das', 'para', 'em', 'no', 'na', 'via', 'conta',
]);

/**
 * Descrição sem números, acentos, sinais e as palavras do meio de pagamento: "PAG*BOLETO ENEL 0412" e "PAG BOLETO ENEL 0511" ficam
 * iguais ("enel"), e "PAGAMENTO DE BOLETO NET" e "PAGAMENTO DE BOLETO CONDOMINIO" ficam diferentes. Sem nada além dessas palavras,
 * fica a descrição inteira sem números.
 */
export function recurringKey(description: string): string {
  const words = fold(description)
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  const named = words.filter((w) => !PAYMENT_WORDS.has(w));
  return (named.length > 0 ? named : words).join(' ');
}

function similar(a: string, b: string): boolean {
  return a !== '' && b !== '' && (a === b || a.includes(b) || b.includes(a));
}

export function importSuggestions(
  lines: readonly Line[],
  existing: { seriesDescriptions: readonly string[]; budgetCategories: readonly string[] },
): ImportSuggestions {
  const seriesKeys = existing.seriesDescriptions.map(recurringKey).filter(Boolean);

  // 1. Contas que se repetem.
  const groups = new Map<string, Line[]>();
  for (const l of lines) {
    if (l.kind !== 'despesa' || l.amountCents <= 0) continue;
    const key = recurringKey(l.description);
    if (key === '') continue;
    const list = groups.get(key);
    if (list) list.push(l);
    else groups.set(key, [l]);
  }
  const recurring: RecurringSuggestion[] = [];
  for (const [key, list] of groups) {
    const months = new Set(list.map((l) => l.date.slice(0, 7)));
    if (months.size < 2) continue;
    const amounts = list.map((l) => l.amountCents);
    if (Math.max(...amounts) > Math.min(...amounts) * RECURRING_SPREAD) continue;
    if (seriesKeys.some((s) => similar(s, key))) continue;
    const latest = [...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0]!;
    if (latest.amountCents > MAX_RECORD_CENTS) continue;
    recurring.push({
      description: latest.description.trim().slice(0, DESCRIPTION_MAX),
      amountCents: latest.amountCents,
      day: Number(latest.date.slice(8, 10)),
      months: months.size,
      category: latest.category,
    });
  }
  recurring.sort((a, b) => b.amountCents - a.amountCents || a.description.localeCompare(b.description, 'pt-BR'));

  // 2. Média por categoria. Os meses são o intervalo entre a primeira e a última data dos gastos (30 dias = 1 mês), sem as compras
  // parceladas, que trazem a data da compra original (uma parcela 05/10 de maio numa fatura de outubro não estica o período).
  const spending = lines.filter((l) => (l.kind === 'despesa' || l.kind === 'compra') && l.amountCents > 0);
  const dated = spending.filter((l) => installmentMark(l.description, l.date) === null);
  const range = (dated.length > 0 ? dated : spending).map((l) => l.date).sort();
  const span = range.length === 0 ? 1 : Math.max(1, Math.round((daysBetween(range[0]!, range[range.length - 1]!) + 1) / 30.4));
  const totals = new Map<string, number>();
  for (const l of lines) {
    if ((l.kind !== 'despesa' && l.kind !== 'compra') || l.category === null || l.amountCents <= 0) continue;
    if (!CATEGORIES.despesa.includes(l.category) || existing.budgetCategories.includes(l.category)) continue;
    totals.set(l.category, (totals.get(l.category) ?? 0) + l.amountCents);
  }
  const budgets: BudgetSuggestion[] = [...totals]
    .map(([category, total]) => ({ category, monthlyCents: Math.ceil(total / span / 1_000) * 1_000 }))
    .filter((b) => b.monthlyCents >= BUDGET_SUGGESTION_MIN_CENTS && b.monthlyCents <= MAX_RECORD_CENTS)
    .sort((a, b) => b.monthlyCents - a.monthlyCents || a.category.localeCompare(b.category, 'pt-BR'))
    .slice(0, BUDGET_SUGGESTION_MAX);

  return { recurring: recurring.slice(0, RECURRING_MAX), budgets };
}

/** Textos das sugestões, na tela de fim da importação. */
export const IMPORT_SUGGESTION_TEXT = {
  title: 'Sugestões a partir do arquivo',
  intro: 'A Clarevo olhou só as linhas que você importou, aqui no aparelho. Nada muda sem você confirmar.',
  recurringTitle: 'Contas que se repetem',
  recurringIntro: 'Estes pagamentos aparecem todo mês. Anotar como gasto fixo põe cada um nas contas a pagar dos próximos meses.',
  /** "Luz · R$ 180,00 · todo dia 12 · em 3 meses" */
  recurringLine: (s: RecurringSuggestion) => `${s.description} · ${formatBRL(s.amountCents)} · todo dia ${s.day} · em ${s.months} meses`,
  recurringAction: 'Anotar como gasto fixo',
  recurringA11y: (s: RecurringSuggestion) => `Anotar ${s.description} como gasto fixo, ${formatBRL(s.amountCents)} todo dia ${s.day}`,
  budgetTitle: 'Planejamento por categoria',
  budgetIntro: 'Pelo arquivo, a média de gastos por mês nestas categorias, arredondada para cima. Dá para usar como orçamento.',
  /** "Transporte · R$ 300,00 por mês" */
  budgetLine: (s: BudgetSuggestion) => `${s.category} · ${formatBRL(s.monthlyCents)} por mês`,
  budgetAction: 'Definir orçamento',
  budgetA11y: (s: BudgetSuggestion) => `Definir orçamento de ${s.category} com ${formatBRL(s.monthlyCents)} por mês`,
} as const;
