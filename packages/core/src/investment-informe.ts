import type { IsoDate } from './dates';
import { taxRegimeOf, type InvestmentIncomeKind } from './investment-details';
import { declarationSummary, type DeclarationItem } from './investment-insights';
import type { Investment, InvestmentMovement } from './investments';
import type { Cents } from './money';
import { formatBRL } from './money';

/**
 * Resumo da declaração no formato do informe de rendimentos (D-104, item 11). As instituições mandam um informe por ano com a posição em
 * 31/12 (o saldo do ano anterior e o do ano), os rendimentos isentos e não tributáveis, os rendimentos sujeitos à tributação exclusiva e o
 * que vai em Bens e Direitos. Este resumo segue a mesma ordem, com o que a pessoa registrou na Clarevo, e leva sempre o selo "Resumo
 * estimado. Confira com o informe da instituição.": quem diz o valor a declarar é o informe.
 *
 * R1. Posição em 31/12: os itens de `declarationSummary` (o valor registrado em 31/12 do ano anterior e do ano; no ano de hoje, o valor de
 *     hoje). Os de custo de compra (ações, FII, ETF, BDR, fundo de ações, criptoativos) ficam sem valor: o informe da corretora tem o custo.
 * R2. Rendimentos recebidos no ano, por investimento, pela regra do tipo do rendimento e do investimento (a mesma de `declarationSummary`):
 *     dividendos e rendimentos de FII são isentos; JCP é tributação exclusiva; juros de produto isento são isentos e de produto com tabela
 *     regressiva, tributação exclusiva; o resto fica "para conferir".
 * R3. Bens e Direitos: grupo e código para conferir e a discriminação sugerida (com a descrição que a pessoa escreveu, se houver).
 */

type Item = Parameters<typeof declarationSummary>[0][number] & Partial<Pick<Investment, 'description'>>;
type Movement = Pick<InvestmentMovement, 'kind' | 'amountCents' | 'occurredOn' | 'investmentId' | 'incomeKind'> & { createdAt?: string; id?: string };

export type InformeIncomeGroup = 'isento' | 'exclusiva' | 'conferir';

export interface InformeIncomeLine {
  investmentId: string;
  name: string;
  label: string;
  institution: string | null;
  cents: Cents;
}

export interface InformeIncomeSection {
  lines: InformeIncomeLine[];
  totalCents: Cents;
}

export interface DeclarationInforme {
  year: number;
  /** R1: os itens com valor e o total registrado em cada 31/12 (só os que têm valor). */
  position: { items: DeclarationItem[]; previousTotalCents: Cents; currentTotalCents: Cents };
  /** R2. */
  income: Record<InformeIncomeGroup, InformeIncomeSection>;
  /** R3: os mesmos itens, com a discriminação sugerida. */
  assets: (DeclarationItem & { userDescription: string | null })[];
  institutions: string[];
}

/** O grupo de um rendimento recebido (R2). */
export function informeIncomeGroup(kind: Investment['kind'], subkind: Investment['subkind'], incomeKind: InvestmentIncomeKind | null): InformeIncomeGroup {
  if (incomeKind === 'dividendo' || incomeKind === 'fii') return 'isento';
  if (incomeKind === 'jcp') return 'exclusiva';
  const regime = taxRegimeOf(kind, subkind);
  if (incomeKind === 'juros' && regime === 'isento') return 'isento';
  if (incomeKind === 'juros' && regime === 'regressiva') return 'exclusiva';
  return 'conferir';
}

export function declarationInforme(items: readonly Item[], movements: readonly Movement[], year: number): DeclarationInforme {
  const summary = declarationSummary(items, movements, year);
  const byId = new Map(items.map((i) => [i.id, i]));
  const income: Record<InformeIncomeGroup, InformeIncomeSection> = {
    isento: { lines: [], totalCents: 0 },
    exclusiva: { lines: [], totalCents: 0 },
    conferir: { lines: [], totalCents: 0 },
  };
  for (const it of summary.items) {
    const inv = byId.get(it.investmentId)!;
    const sums: Record<InformeIncomeGroup, number> = { isento: 0, exclusiva: 0, conferir: 0 };
    for (const m of movements) {
      if (m.investmentId !== it.investmentId || m.kind !== 'rendimento' || !m.occurredOn.startsWith(`${year}-`)) continue;
      sums[informeIncomeGroup(inv.kind, inv.subkind, m.incomeKind)] += m.amountCents;
    }
    for (const g of ['isento', 'exclusiva', 'conferir'] as const) {
      if (sums[g] <= 0) continue;
      income[g].lines.push({ investmentId: it.investmentId, name: it.name, label: it.label, institution: it.institution, cents: sums[g] });
      income[g].totalCents += sums[g];
    }
  }
  const valued = summary.items.filter((i) => !i.costBased && !i.pgbl);
  return {
    year,
    position: {
      items: summary.items,
      previousTotalCents: valued.reduce((a, i) => a + (i.previousCents ?? 0), 0),
      currentTotalCents: valued.reduce((a, i) => a + (i.currentCents ?? 0), 0),
    },
    income,
    assets: summary.items.map((i) => ({ ...i, userDescription: byId.get(i.investmentId)?.description ?? null })),
    institutions: summary.institutions,
  };
}

/** O que a linha mostra: "Aplicação do banco · LCI · Banco Exemplo". */
export function informeLineTitle(l: Pick<InformeIncomeLine, 'name' | 'label' | 'institution'>): string {
  return [l.name, l.label, l.institution].filter((x): x is string => x !== null && x !== '').join(' · ');
}

export const INFORME_TEXT = {
  /** O selo, sempre no alto (D-104, item 11). */
  seal: 'Resumo estimado. Confira com o informe da instituição.',
  sealDetail: 'Cada instituição manda o informe de rendimentos até o fim de fevereiro. É ele que diz o valor a declarar; aqui está o que você registrou na Clarevo.',
  yearLabel: 'Ano-calendário',
  positionTitle: (year: number) => `Posição em 31/12/${year}`,
  positionCurrentTitle: (year: number) => `Posição em ${year}, até hoje`,
  /** "Total registrado em 31/12/2025: R$ 0,00. Em 31/12/2026: R$ 10.875,00." */
  positionTotal: (year: number, prev: Cents, cur: Cents, current: boolean) =>
    `Total registrado em 31/12/${year - 1}: ${formatBRL(prev)}. ${current ? 'Hoje' : `Em 31/12/${year}`}: ${formatBRL(cur)}.`,
  exemptTitle: 'Rendimentos isentos e não tributáveis',
  exclusiveTitle: 'Rendimentos sujeitos à tributação exclusiva',
  otherTitle: 'Rendimentos para conferir no informe',
  exemptNote: 'Dividendos, rendimentos de FII e os juros de produtos isentos, pelo tipo que você escolheu ao registrar cada rendimento.',
  exclusiveNote: 'JCP e juros de produtos com tabela regressiva: o imposto já sai na fonte, pela instituição.',
  otherNote: 'Rendimentos sem tipo informado ou de regra que depende do caso.',
  /** "Aplicação do banco · LCI · Banco Exemplo: R$ 12,50" */
  line: (l: InformeIncomeLine) => `${informeLineTitle(l)}: ${formatBRL(l.cents)}`,
  total: (c: Cents) => `Total: ${formatBRL(c)}`,
  none: 'Nenhum rendimento registrado nesta parte.',
  assetsTitle: 'Bens e Direitos',
  assetsNote: 'Para cada investimento, o grupo e o código para conferir no programa da Receita e uma discriminação sugerida.',
  /** A discriminação com a descrição da pessoa: "LCI na instituição Banco Exemplo, aplicado desde 01/06/2026. Reserva da casa." */
  description: (it: DeclarationItem & { userDescription: string | null }) => (it.userDescription ? `${it.description} ${it.userDescription.replace(/[.]?$/, '.')}` : it.description),
} as const;

/** Até maio (o prazo da declaração), o ano padrão é o que acabou; depois, o de hoje. */
export function defaultInformeYear(today: IsoDate): number {
  const y = Number(today.slice(0, 4));
  return Number(today.slice(5, 7)) <= 5 ? y - 1 : y;
}
