import type { IsoDate } from './dates';
import { addDays, formatDateBR } from './dates';
import { calendarDaysBetween, type InvestmentDetails, type InvestmentSubkind, type TaxRegime } from './investment-details';
import type { InvestmentKind, InvestmentMovement } from './investments';
import { investmentValueOn } from './investments';
import type { Cents } from './money';
import { formatBRL } from './money';

/**
 * Regras de imposto dos investimentos (D-099, `docs/49_ESTUDO_INVESTIMENTOS.md`, seção b.6 e item 7), num lugar só, com vigência e
 * fonte, para mudar no dia em que a lei mudar. A Clarevo só ESTIMA: nunca escreve "imposto devido", nunca diz o que fazer.
 *
 * Revisão a cada 6 meses, como os temas de Aprender sobre imposto. Fontes (consulta de 13/11/2026):
 * - Lei 11.033/2004, art. 1º: tabela regressiva da renda fixa (22,5% até 180 dias; 20% de 181 a 360; 17,5% de 361 a 720; 15% acima).
 * - Decreto 6.306/2007, art. 32 e anexo: IOF regressivo nos resgates em menos de 30 dias, sobre o rendimento (96% no 1º dia a 0% no 30º).
 * - Lei 11.033/2004, art. 3º, e Lei 12.431/2011: isenção de LCI, LCA, CRI, CRA e debêntures incentivadas para pessoa física; LCD pela
 *   Lei 14.937/2024; poupança pela Lei 8.981/1995, art. 68.
 * - Lei Complementar 224/2025: JCP com 17,5% retidos na fonte desde 01/01/2026 (antes, 15%).
 * - Lei 15.270/2025: dividendos isentos até R$ 50.000,00 por mês de uma mesma empresa; acima, 10% retidos sobre o total do mês.
 * - Taxa de custódia dos títulos públicos: 0,20% ao ano (B3), sem cobrança no título pós-fixado até R$ 10.000,00. Não entra na estimativa.
 */
export const INVESTMENT_TAX_RULES = {
  reviewedOn: '2026-11-13' as IsoDate,
  reviewEveryMonths: 6,
  /** Até `maxDays` dias corridos (inclusive), a alíquota. */
  regressive: [
    { maxDays: 180, rate: 0.225 },
    { maxDays: 360, rate: 0.2 },
    { maxDays: 720, rate: 0.175 },
    { maxDays: Number.POSITIVE_INFINITY, rate: 0.15 },
  ],
  /** IOF sobre o rendimento, em %, pelo número de dias corridos desde a aplicação (1 a 29); 30 ou mais: 0. */
  iof: [96, 93, 90, 86, 83, 80, 76, 73, 70, 66, 63, 60, 56, 53, 50, 46, 43, 40, 36, 33, 30, 26, 23, 20, 16, 13, 10, 6, 3],
  jcpRate: 0.175,
  dividendMonthlyExemptionCents: 5_000_000,
  dividendWithholdingRate: 0.1,
  stockMonthlySalesExemptionCents: 2_000_000,
  custodyRatePerYear: 0.002,
  custodySelicExemptUpToCents: 1_000_000,
  sources: [
    { title: 'Lei nº 11.033/2004 (tabela regressiva e isenções)', url: 'https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l11033.htm' },
    { title: 'Decreto nº 6.306/2007 (IOF, anexo da tabela regressiva)', url: 'https://legis.senado.leg.br/norma/570935/publicacao/15741229' },
    { title: 'Lei nº 12.431/2011 (debêntures incentivadas)', url: 'https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2011/lei/l12431.htm' },
    { title: 'Lei nº 15.270/2025 (dividendos), texto', url: 'https://www.lex.com.br/lei-no-15-270-de-26-de-novembro-de-2025/' },
    { title: 'Lei Complementar nº 224/2025 (JCP), resumo', url: 'https://www.pinheiroguimaraes.com.br/sancionada-lei-complementar-que-reduz-incentivos-e-beneficios-tributarios-federais-eleva-o-irrf-sobre-jcp-e-aumenta-aliquota-da-csll/' },
    { title: 'Receita Federal, Perguntas e Respostas do IRPF', url: 'https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/perguntas-e-respostas/dirpf' },
  ],
} as const;

/** Alíquota da tabela regressiva pelo número de dias corridos aplicados. */
export function regressiveRate(days: number): number {
  return INVESTMENT_TAX_RULES.regressive.find((r) => days <= r.maxDays)!.rate;
}

/** IOF (fração do rendimento) pelo número de dias corridos: 0,96 no 1º dia, 0 a partir do 30º. No dia da aplicação, o do 1º dia. */
export function iofRate(days: number): number {
  if (days >= 30) return 0;
  const table = INVESTMENT_TAX_RULES.iof;
  return table[Math.max(1, days) - 1]! / 100;
}

export interface NetEstimate {
  grossCents: Cents;
  /** Rendimento ainda no investimento (valor menos o aplicado que continua lá). */
  gainCents: Cents;
  iofCents: Cents;
  irCents: Cents;
  netCents: Cents;
  /** Alíquota da parte mais antiga e da mais recente, para o texto ("de 15% a 22,5%"). */
  rates: { min: number; max: number } | null;
}

type Flow = Pick<InvestmentMovement, 'kind' | 'amountCents' | 'occurredOn'> & { createdAt?: string; id?: string };

/**
 * "Se resgatasse hoje", na tabela regressiva (com o IOF de quem aplicou há menos de 30 dias). Cada aporte é um lote com a própria data;
 * um resgate tira primeiro dos lotes mais antigos, na proporção entre o aplicado e o valor do dia; o rendimento de hoje se divide entre os
 * lotes pelo aplicado vezes os dias. Rendimentos recebidos já saíram (com o imposto na fonte) e não entram. Sem valor atualizado (o valor
 * é o aplicado), não há rendimento para estimar.
 */
export function estimateRegressiveNet(movements: readonly Flow[], today: IsoDate): NetEstimate {
  return estimateLotsNet(movements, today, regressiveRate, true);
}

/**
 * A conta por lotes de `estimateRegressiveNet`, com a alíquota do IR pelo número de dias (`irRate`) e com ou sem o IOF dos primeiros 30
 * dias. Nos isentos de IR (D-104, item 3), `irRate` é zero e o IOF continua (a poupança não tem nenhum dos dois).
 */
function estimateLotsNet(movements: readonly Flow[], today: IsoDate, irRate: (days: number) => number, withIof: boolean): NetEstimate {
  const live = movements.filter((m) => m.occurredOn <= today);
  // Data, e no mesmo dia aportes, depois resgates, depois o resto (revisão independente de 13/11/2026: as listas chegam do mais recente
  // ao mais antigo, e um resgate do dia vinha antes do aporte do mesmo dia). Empate: pela criação, como o banco.
  const rank: Readonly<Record<Flow['kind'], number>> = { aporte: 0, resgate: 1, rendimento: 2, valor: 3 };
  const ordered = [...live].sort(
    (a, b) => (a.occurredOn < b.occurredOn ? -1 : a.occurredOn > b.occurredOn ? 1 : rank[a.kind] - rank[b.kind] || (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || (a.id ?? '').localeCompare(b.id ?? '')),
  );
  const lots: { on: IsoDate; principal: number }[] = [];
  let day: IsoDate | null = null;
  let withdrawnToday = 0;
  for (const m of ordered) {
    if (m.occurredOn !== day) {
      day = m.occurredOn;
      withdrawnToday = 0;
    }
    if (m.kind === 'aporte') lots.push({ on: m.occurredOn, principal: m.amountCents });
    else if (m.kind === 'resgate') {
      // Valor antes deste resgate: o do dia anterior, mais os aportes do dia, menos os resgates do dia que vieram antes.
      const before =
        investmentValueOn(live, addDays(m.occurredOn, -1)) + live.filter((x) => x.kind === 'aporte' && x.occurredOn === m.occurredOn).reduce((a, x) => a + x.amountCents, 0) - withdrawnToday;
      withdrawnToday += m.amountCents;
      const principal = lots.reduce((a, l) => a + l.principal, 0);
      if (before <= 0 || principal <= 0) continue;
      let take = principal * Math.min(1, m.amountCents / before);
      for (const l of lots) {
        if (take <= 0) break;
        const t = Math.min(l.principal, take);
        l.principal -= t;
        take -= t;
      }
    }
  }
  const gross = investmentValueOn(live, today);
  let open = lots.filter((l) => l.principal > 0.5);
  const principal = open.reduce((a, l) => a + l.principal, 0);
  const gain = gross - principal;
  if (gain <= 0 || lots.length === 0) return { grossCents: gross, gainCents: Math.round(gain), iofCents: 0, irCents: 0, netCents: gross, rates: null };
  // Todo o aplicado já saiu e ficou só rendimento (revisão de 13/11/2026): ele conta pela idade do aporte mais recente.
  if (open.length === 0) open = [{ on: lots[lots.length - 1]!.on, principal: 1 }];
  const weights = open.map((l) => l.principal * Math.max(1, calendarDaysBetween(l.on, today)));
  const totalWeight = weights.reduce((a, w) => a + w, 0);
  let iof = 0;
  let ir = 0;
  const rates: number[] = [];
  open.forEach((l, i) => {
    const days = calendarDaysBetween(l.on, today);
    const g = (gain * weights[i]!) / totalWeight;
    const iofPart = withIof ? g * iofRate(days) : 0;
    iof += iofPart;
    const rate = irRate(days);
    rates.push(rate);
    ir += (g - iofPart) * rate;
  });
  const iofCents = Math.round(iof);
  const irCents = Math.round(ir);
  return { grossCents: gross, gainCents: Math.round(gain), iofCents, irCents, netCents: gross - iofCents - irCents, rates: { min: Math.min(...rates), max: Math.max(...rates) } };
}

/**
 * Rendimento bruto, IR e IOF estimados e rendimento líquido estimado (D-104, item 3), nas regras que a Clarevo calcula: a tabela regressiva
 * (IR e IOF) e os isentos de IR (só o IOF dos primeiros 30 dias; a poupança, sem nenhum dos dois). Nas outras regras, null: a tela explica
 * sem calcular. Os rendimentos recebidos já saíram (com o imposto na fonte) e não entram.
 */
export function estimateNetIncome(regime: TaxRegime | null, subkind: InvestmentSubkind | null, movements: readonly Flow[], on: IsoDate): NetEstimate | null {
  if (regime === 'regressiva') return estimateRegressiveNet(movements, on);
  if (regime === 'isento') return estimateLotsNet(movements, on, () => 0, subkind !== 'poupanca');
  return null;
}

/** As três linhas do detalhe (D-104, item 3), alinhadas: rótulo e valor. */
export interface NetIncomeLine {
  label: string;
  cents: Cents;
  /** O IR e o IOF saem do rendimento: o valor vem com o sinal de menos. */
  minus: boolean;
}

export function netIncomeLines(e: Pick<NetEstimate, 'gainCents' | 'irCents' | 'iofCents'>, regime: TaxRegime): NetIncomeLine[] {
  const tax = e.irCents + e.iofCents;
  return [
    { label: NET_INCOME_TEXT.gross, cents: Math.max(0, e.gainCents), minus: false },
    { label: regime === 'isento' ? NET_INCOME_TEXT.taxExempt : NET_INCOME_TEXT.tax, cents: tax, minus: tax > 0 },
    { label: NET_INCOME_TEXT.net, cents: Math.max(0, e.gainCents - tax), minus: false },
  ];
}

export const NET_INCOME_TEXT = {
  gross: 'Rendimento bruto',
  tax: 'IR e IOF estimados',
  taxExempt: 'IOF estimado (isento de IR)',
  net: 'Rendimento líquido estimado',
  /** "R$ 65,92" ou "−R$ 65,92" (o sinal e a palavra no rótulo; nunca uma cor). */
  value: (l: NetIncomeLine) => (l.minus ? `\u2212${formatBRL(l.cents)}` : formatBRL(l.cents)),
  /** Nome acessível da linha: "IR e IOF estimados: menos R$ 65,92". */
  a11y: (l: NetIncomeLine) => `${l.label}: ${l.minus ? 'menos ' : ''}${formatBRL(l.cents)}`,
  /** O rendimento é o valor de hoje menos o que continua aplicado. */
  grossNote: 'O rendimento bruto é o valor de hoje menos o que continua aplicado. Rendimentos que já caíram na conta não entram.',
  /** Regras que a Clarevo não calcula: só o rendimento bruto, e a explicação. */
  grossOnly: (c: Cents) => `Rendimento bruto até hoje: ${formatBRL(c)}`,
} as const;

/** O que a tela mostra no lugar do cálculo, para as regras que a Clarevo explica sem calcular. */
export function taxExplanation(regime: TaxRegime, kind: InvestmentKind, subkind: InvestmentSubkind | null): string {
  switch (regime) {
    case 'isento':
      return subkind === 'poupanca'
        ? 'A poupança não tem imposto de renda nem IOF para pessoa física.'
        : 'Este tipo não tem imposto de renda para pessoa física. Num resgate antes de 30 dias, pode haver IOF sobre o rendimento.';
    case 'regressiva':
      return 'O imposto sai do rendimento no resgate, pela tabela regressiva: 22,5% até 180 dias, 20% até 360, 17,5% até 720 e 15% depois disso.';
    case 'come_cotas':
      return 'O valor do extrato já desconta o come-cotas de maio e novembro. No resgate, pode haver um complemento do imposto, conforme o tempo aplicado.';
    case 'venda':
      if (subkind === 'acao' || (kind === 'acoes' && subkind === null))
        return `Ações: vendas de até ${formatBRL(INVESTMENT_TAX_RULES.stockMonthlySalesExemptionCents)} no mês ficam isentas; acima disso, 15% sobre o ganho. Dividendos de até ${formatBRL(INVESTMENT_TAX_RULES.dividendMonthlyExemptionCents)} por mês de uma mesma empresa não têm imposto retido; o JCP já vem com 17,5% descontados.`;
      if (subkind === 'fii' || subkind === 'fiagro') return 'Os rendimentos mensais costumam ser isentos para pessoa física, com condições. Na venda das cotas, 20% sobre o ganho.';
      if (subkind === 'fundo_acoes') return 'Fundo de ações: 15% sobre o rendimento, só no resgate, sem come-cotas.';
      return 'Imposto de 15% sobre o ganho na venda, sem a isenção mensal das ações.';
    case 'previdencia':
      return 'Depende do regime escolhido no contrato (progressivo ou regressivo) e do tipo (PGBL ou VGBL). O extrato do plano mostra o regime.';
    case 'cripto':
      return 'Criptoativos têm regra própria, que depende de onde estão e de quanto foi vendido no mês. Confira no tema de Aprender e na Receita Federal.';
  }
}

export const TAX_TEXT = {
  title: 'Se resgatasse hoje',
  /** Resgate só no vencimento (revisão de 16/11/2026): o card não diz "hoje". */
  maturityTitle: 'No vencimento',
  atMaturityTitle: (on: IsoDate) => `No vencimento, em ${formatDateBR(on)} (estimativa)`,
  /** A premissa da conta fica junto dos números (D-104, item 4: ESTIMATE_PREMISE_TEXT.maturityPremise). */
  atMaturityNote: 'Este investimento só pode ser resgatado no vencimento.',
  maturityOnlyNote: 'Este investimento só pode ser resgatado no vencimento. Informe a data do vencimento em Editar para ver a estimativa.',
  /** "Cerca de R$ 10.412,00 líquidos." */
  net: (c: Cents) => `Cerca de ${formatBRL(c)} líquidos.`,
  ir: (c: Cents) => `Imposto de renda estimado: ${formatBRL(c)}`,
  iof: (c: Cents) => `IOF estimado: ${formatBRL(c)}`,
  rates: (r: { min: number; max: number }) => {
    const p = (x: number) => `${(x * 100).toFixed(1).replace('.0', '').replace('.', ',')}%`;
    return r.min === r.max ? `Alíquota de ${p(r.min)} pelo tempo aplicado.` : `Alíquotas de ${p(r.min)} a ${p(r.max)}, pelo tempo de cada aporte.`;
  },
  noGain: 'Sem rendimento registrado, não há imposto para estimar. Atualize o valor com o que aparece no extrato.',
  rule: (on: IsoDate) => `Estimativa pela regra em vigor em ${on.slice(8, 10)}/${on.slice(5, 7)}/${on.slice(0, 4)}, sem a taxa de custódia. O valor do resgate no seu extrato é o que vale.`,
  noRegime: 'Escolha "Qual é o investimento?" em Editar para ver a regra de imposto.',
  /** Tipo "Outro" (D-104, item 12): não há tipo exato para escolher. */
  noRegimeOther: 'Para um investimento do tipo Outro, a Clarevo não estima o imposto: a regra depende do que ele é. O informe da instituição mostra o que vale.',
} as const;

/**
 * De quando é a estimativa do card de resgate. Resgate a qualquer momento (ou ficha sem liquidez): hoje, "Se resgatasse hoje". Só no
 * vencimento (revisão de 16/11/2026): com a data do vencimento ainda por vir, a estimativa é nessa data (o valor de hoje com a alíquota
 * daquele dia); sem a data, nenhuma conta, só o aviso. Vencimento já passado: o resgate vale hoje.
 */
export function netEstimateWhen(details: Pick<InvestmentDetails, 'liquidity' | 'maturityOn'> | null | undefined, today: IsoDate): { on: IsoDate | null; title: string; note: string | null } {
  if (details?.liquidity !== 'no_vencimento') return { on: today, title: TAX_TEXT.title, note: null };
  if (details.maturityOn === null) return { on: null, title: TAX_TEXT.maturityTitle, note: TAX_TEXT.maturityOnlyNote };
  if (details.maturityOn <= today) return { on: today, title: TAX_TEXT.title, note: null };
  return { on: details.maturityOn, title: TAX_TEXT.atMaturityTitle(details.maturityOn), note: TAX_TEXT.atMaturityNote };
}
