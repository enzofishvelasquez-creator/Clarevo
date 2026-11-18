import type { IsoDate } from './dates';
import { formatDateBR } from './dates';
import type { InvestmentGuarantee, TaxRegime } from './investment-details';
import type { InvestmentKind, InvestmentMovement } from './investments';
import type { Cents } from './money';
import { formatBRL } from './money';

/**
 * Textos e regras pequenas do detalhe e dos formulários de cada investimento (D-104): a data de cada valor (item 1), as frases curtas de
 * imposto, liquidez e garantia com o tema de Aprender (item 3), "Somar a uma meta?" no rendimento e no resgate do vencimento (item 10),
 * "Outro investimento" e previdência (item 12) e a meta que usa o valor dos investimentos ligados (retorno de quem testa, 17/11/2026).
 * Ficam aqui para não mudar investments.ts e investment-prices.ts, que vão para as funções do servidor "indices" e "precos".
 */

// ---------------------------------------------------------------------------
// 1. A data de cada valor
// ---------------------------------------------------------------------------

/**
 * Observação gravada com o "Usar este valor" (D-104, item 1): diz de onde veio a atualização ("Pela cota do fundo de 05/10/2026"). Fica no
 * histórico, como qualquer observação, e o alto do detalhe a usa para dizer a data da cota ou do preço. A pessoa pode mudar o texto.
 */
export const VALUE_SOURCE_NOTE = {
  treasury: (on: IsoDate) => `Pelo preço do Tesouro Nacional de ${formatDateBR(on)}`,
  fund: (on: IsoDate) => `Pela cota do fundo de ${formatDateBR(on)}`,
  /** A data da estimativa é a do próprio movimento (o dia do "Usar este valor"). */
  rate: () => 'Pela taxa contratada (estimativa)',
} as const;

const SOURCE_NOTE = /^((Pelo preço do Tesouro Nacional|Pela cota do fundo) de \d{2}\/\d{2}\/\d{4}|Pela taxa contratada \(estimativa\))$/;

/** A observação é uma das de "Usar este valor"? Então devolve a frase com a inicial minúscula para o alto do detalhe ("pela cota do fundo de 05/10/2026"). */
export function valueSourcePhrase(note: string | null): string | null {
  if (note === null || !SOURCE_NOTE.test(note)) return null;
  return note.charAt(0).toLowerCase() + note.slice(1);
}

type Mv = Pick<InvestmentMovement, 'kind' | 'amountCents' | 'occurredOn' | 'note'> & { createdAt?: string };

/** A última atualização de valor (a do dia mais recente; no mesmo dia, a criada por último, como o banco). */
export function lastValueMovement<M extends Mv>(movements: readonly M[]): M | null {
  let best: M | null = null;
  for (const m of movements) {
    if (m.kind !== 'valor') continue;
    if (best === null || m.occurredOn > best.occurredOn || (m.occurredOn === best.occurredOn && (m.createdAt ?? '') >= (best.createdAt ?? ''))) best = m;
  }
  return best;
}

/**
 * A linha embaixo do valor de hoje (D-104, item 1): "Atualizado por você em 06/10/2026.", "Atualizado em 07/10/2026, pela cota do fundo de
 * 05/10/2026." ou, sem atualização, "Sem valor do extrato ainda: é o aplicado menos o resgatado, desde 01/06/2026.". Com aportes ou resgates
 * depois da atualização, diz que eles entraram. Nunca zero sem data.
 */
export function valueDateCaption(movements: readonly Mv[]): string {
  const last = lastValueMovement(movements);
  if (!last) {
    const first = movements.reduce<IsoDate | null>((a, m) => (a === null || m.occurredOn < a ? m.occurredOn : a), null);
    return first ? `Sem valor do extrato ainda: é o aplicado menos o resgatado, desde ${formatDateBR(first)}.` : 'Sem movimentos registrados.';
  }
  const source = valueSourcePhrase(last.note);
  const head = source ? `Atualizado em ${formatDateBR(last.occurredOn)}, ${source}.` : `Atualizado por você em ${formatDateBR(last.occurredOn)}.`;
  const after = movements.some((m) => (m.kind === 'aporte' || m.kind === 'resgate') && m.occurredOn > last.occurredOn);
  return after ? `${head} Mais os aportes e resgates registrados depois dessa data.` : head;
}

export const VALUE_DATE_TEXT = {
  /** Falha ao recarregar: o detalhe continua com o que já tinha, com a data (nunca zero). */
  staleLoad: 'Não foi possível atualizar agora. Os valores abaixo são os últimos carregados, com a data de cada um.',
  /** Preço público que não veio: o último conhecido nesta sessão, com a data. */
  staleTreasury: (on: IsoDate) => `Não foi possível buscar um preço mais novo agora. Este é o último conhecido, do Tesouro Nacional de ${formatDateBR(on)}.`,
  staleFund: (on: IsoDate) => `Não foi possível buscar uma cota mais nova agora. Esta é a última conhecida, de ${formatDateBR(on)}.`,
  /** Sem nenhum preço: o valor registrado com a data. */
  lastRegistered: (cents: Cents, caption: string) => `O valor registrado continua ${formatBRL(cents)}. ${caption}`,
  /** "Preço do Tesouro Nacional de 06/10/2026" e "Cota de 05/10/2026" embaixo do valor estimado. */
  treasuryDate: (on: IsoDate) => `Preço do Tesouro Nacional de ${formatDateBR(on)}.`,
  fundDate: (on: IsoDate) => `Cota de ${formatDateBR(on)}.`,
  /** O card "No vencimento" e "Se resgatasse hoje": de quando é a estimativa. */
  estimateFor: (on: IsoDate, today: IsoDate) => (on === today ? `Estimativa para hoje, ${formatDateBR(on)}.` : `Estimativa para ${formatDateBR(on)}.`),
} as const;

// ---------------------------------------------------------------------------
// 3. Imposto, liquidez e garantia: uma frase e o tema de Aprender
// ---------------------------------------------------------------------------

/** Os temas de Aprender usados no detalhe (todos já publicados). */
export type DetailLearnSlug = 'ir-investimentos' | 'liquidez-risco-retorno' | 'fgc' | 'titulos-publicos';

export interface DetailExplanation {
  text: string;
  link: string;
  slug: DetailLearnSlug;
}

export function taxExplanationLink(regime: TaxRegime | null): DetailExplanation | null {
  if (regime === null) return null;
  return {
    text:
      regime === 'isento'
        ? 'Imposto de renda é o que a Receita fica do rendimento. Este tipo é isento para pessoa física; o IOF só existe num resgate antes de 30 dias.'
        : 'Imposto de renda é o que a Receita fica do rendimento, nunca do valor aplicado. Na renda fixa, quanto mais tempo aplicado, menor a alíquota.',
    link: 'Saber mais sobre o imposto nos investimentos',
    slug: 'ir-investimentos',
  };
}

export const LIQUIDITY_EXPLANATION: DetailExplanation = {
  text: 'Liquidez é a facilidade de transformar o investimento em dinheiro na conta, e em quanto tempo.',
  link: 'Saber mais sobre liquidez',
  slug: 'liquidez-risco-retorno',
};

export function guaranteeExplanation(g: InvestmentGuarantee | null): DetailExplanation | null {
  switch (g) {
    case 'fgc':
      return {
        text: 'O FGC é uma garantia privada que devolve até R$ 250 mil por pessoa em cada instituição, se ela quebrar, com um teto total a cada 4 anos.',
        link: 'Saber mais sobre o FGC',
        slug: 'fgc',
      };
    case 'tesouro':
      return { text: 'Títulos públicos são dívida do governo federal: a garantia é do Tesouro Nacional, não a do FGC.', link: 'Saber mais sobre títulos públicos', slug: 'titulos-publicos' };
    case 'nenhuma':
      return { text: 'Este tipo não tem a garantia do FGC: se a instituição ou o emissor tiver problemas, o valor pode não voltar inteiro.', link: 'Saber mais sobre o FGC', slug: 'fgc' };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// 10. "Somar a uma meta?" no rendimento e no resgate do vencimento
// ---------------------------------------------------------------------------

/** Pergunta só no rendimento recebido novo e no resgate novo com data no vencimento ou depois dele. */
export function asksGoalOnMovement(kind: InvestmentMovement['kind'], editing: boolean, maturityOn: IsoDate | null, occurredOn: IsoDate | null): boolean {
  if (editing) return false;
  if (kind === 'rendimento') return true;
  return kind === 'resgate' && maturityOn !== null && occurredOn !== null && occurredOn >= maturityOn;
}

export const MOVEMENT_GOAL_TEXT = {
  label: 'Somar a uma meta? (opcional)',
  hint: 'Se este dinheiro foi para uma meta, a Clarevo registra nela um aporte com o mesmo valor e a mesma data. Nada vem marcado; toque de novo para desmarcar.',
  /** Observação do aporte na meta (até 80 caracteres: o nome do investimento tem até 40). */
  note: (kind: 'rendimento' | 'resgate', investmentName: string) => (kind === 'rendimento' ? `Rendimento de ${investmentName}` : `Resgate de ${investmentName}`),
  /** "Rendimento registrado. Aporte de R$ 12,50 registrado na meta Viagem de férias." */
  saved: (first: string, cents: Cents, goalName: string) => `${first} Aporte de ${formatBRL(cents)} registrado na meta ${goalName}.`,
  failed: (first: string, goalName: string) => `${first} Não foi possível registrar o aporte na meta ${goalName}. Se quiser, registre pela tela da meta.`,
} as const;

// ---------------------------------------------------------------------------
// 12. "Outro investimento" e previdência
// ---------------------------------------------------------------------------

export const KIND_FORM_HINT: Readonly<Partial<Record<InvestmentKind, string>>> = {
  outro: 'Para o que não está na lista. Dê um nome, diga o que é na descrição (em "Mais detalhes") e atualize o valor pelo extrato quando quiser.',
  previdencia: 'PGBL ou VGBL: registre quanto já aplicou e atualize o valor pelo extrato do plano quando quiser.',
};

// ---------------------------------------------------------------------------
// Meta ligada: usar o valor dos investimentos na meta (retorno de quem testa, 17/11/2026)
// ---------------------------------------------------------------------------

export const GOAL_LINK_TEXT = {
  useInvestments: 'Usar o valor dos investimentos nesta meta',
  useInvestmentsHint: 'O valor guardado da meta passa a ser a soma do valor de hoje dos investimentos ligados. Dá para voltar a qualquer momento na tela da meta.',
  alreadyInvestments: 'Esta meta já usa o valor dos investimentos ligados.',
  /** Depois de salvar o investimento. */
  savedWithSource: (first: string, goalName: string) => `${first} A meta ${goalName} passa a usar o valor dos investimentos ligados.`,
  sourceFailed: (first: string, goalName: string) => `${first} Não foi possível mudar a origem do valor da meta ${goalName}. Se quiser, escolha na tela da meta.`,
} as const;

/** A meta pode receber a escolha "Usar o valor dos investimentos" (só metas do Pessoal que ainda usam os registros). */
export function canUseInvestmentsValue(goal: { valueSource?: 'registros' | 'investimentos' } | undefined): boolean {
  return goal !== undefined && goal.valueSource !== 'investimentos';
}
