import { addMonths, formatMonthName } from './dates';
import type { IsoMonth } from './dates';
import type { Cents } from './money';
import { formatBRL } from './money';
import { installmentAmounts } from './cards';

/**
 * Contas do ano explicadas (D-042, pedido de Enzo de 10/10/2026: "Deixa contas do ano mais claro, explicado melhor").
 *
 * Só textos e exemplos, sem mudar regra nem banco: o cadastro, a lista, o detalhe ("Ano a ano") e "Informar o valor do ano" usam
 * estas frases. Os exemplos são fictícios e calculados aqui (o total de um IPTU em 10 parcelas é 10 vezes a parcela), e o teste
 * confere as contas. O tema de Aprender `contas-do-ano` (com fonte e data de revisão) é a explicação mais longa; "O que é isso?"
 * abre esse tema, e nenhum tema novo nasceu.
 */

/** Exemplo de cota única: um IPVA que vence em janeiro. */
export const ANNUAL_EXAMPLE_SINGLE = { name: 'IPVA', cents: 240_000, month: '2027-01' as IsoMonth } as const;

/** Exemplo de conta em parcelas: um IPTU de R$ 1.800,00 em 10 parcelas, de fevereiro a novembro. */
export const ANNUAL_EXAMPLE_PARTS = { name: 'IPTU', totalCents: 180_000, parts: 10, firstMonth: '2027-02' as IsoMonth } as const;

/** O que o exemplo em parcelas resulta: a parcela, o total e o último mês. */
export function annualPartsExample(): { partCents: Cents; totalCents: Cents; lastMonth: IsoMonth } {
  const { totalCents, parts, firstMonth } = ANNUAL_EXAMPLE_PARTS;
  const amounts = installmentAmounts(totalCents, parts);
  return { partCents: amounts[amounts.length - 1]!, totalCents: amounts.reduce((acc, c) => acc + c, 0), lastMonth: addMonths(firstMonth, parts - 1) };
}

const single = ANNUAL_EXAMPLE_SINGLE;
const parts = ANNUAL_EXAMPLE_PARTS;

export const ANNUAL_HELP_TEXT = {
  /** Topo do cadastro de uma conta do ano. */
  intro:
    'Contas do ano são as que vêm uma vez por ano, como IPVA, IPTU, matrícula e seguro. Você cadastra uma vez; todo ano o Clarevo lembra e cria as contas do mês certo.',
  whatIsThis: 'O que é isso?',

  /** "Como você paga?": cota única e parcelado, com exemplo numérico. */
  howPaysHint: `Cota única: o valor do ano sai de uma vez. Ex.: ${single.name} de ${formatBRL(single.cents)}, que vence em ${formatMonthName(single.month)}.\nEm parcelas: o valor do ano é dividido em vezes. Ex.: ${parts.name} de ${formatBRL(parts.totalCents)} em ${parts.parts} parcelas de ${formatBRL(annualPartsExample().partCents)}, de ${formatMonthName(parts.firstMonth)} a ${formatMonthName(annualPartsExample().lastMonth)}.`,

  /** Mês do vencimento (cota única) e mês da primeira parcela (parcelas). */
  monthHintSingle: `Em que mês a conta vence. Ex.: ${single.name} em ${formatMonthName(single.month)}.`,
  monthHintParts: `Em que mês vence a primeira parcela. Ex.: ${parts.name} começa em ${formatMonthName(parts.firstMonth)}.`,

  /** Dia do vencimento, junto de "De 1 a 31.". */
  dayExample: 'Ex.: dia 20 para uma conta que vence em 20/01.',

  /** Valor de referência, junto da dica que já existe. */
  amountExampleSingle: `Ex.: ${single.name} de ${formatBRL(single.cents)}.`,
  amountExampleParts: `Ex.: a parcela de ${formatBRL(annualPartsExample().partCents)} do ${parts.name}.`,

  /** "O valor muda de um ano para outro?" */
  changesHint:
    'Se muda, o Clarevo usa o valor que você cadastrou como estimativa. Quando o carnê ou o boleto do ano chegar, abra a conta do ano e informe o valor em Ano a ano.',
  sameHint: 'Se é sempre o mesmo, o Clarevo repete o valor todo ano e você não precisa fazer nada.',

  /** "Primeiro ano" */
  firstYearHint: 'O ano da primeira conta que o Clarevo vai criar. Dos anos seguintes ele cuida sozinho.',

  /** Perto do fim do cadastro: o que acontece nos anos seguintes. */
  nextYearsTitle: 'E nos próximos anos?',
  nextYears:
    'Todo ano, o Clarevo cria as contas do ano dois meses antes do primeiro vencimento. Se o valor mudou, abra a conta do ano e use Informar o valor em Ano a ano: só aquele ano muda. Se o valor é sempre o mesmo, não precisa fazer nada.',

  /** Lista de Gastos fixos, card "Contas do ano". */
  listIntro:
    'Contas que vêm uma vez por ano, como IPVA, IPTU, matrícula e seguro. Você cadastra uma vez; todo ano o Clarevo cria a conta do mês certo, dois meses antes de vencer.',

  /** Detalhe da conta do ano. */
  detailHowItWorks:
    'Quando o valor de um ano mudar, use Informar o valor daquele ano, em Ano a ano. Só ele muda; os outros continuam com a referência.',

  /** "Ano a ano": legenda curta das palavras da lista. */
  yearByYearHelp: [
    'Cada linha é um ano da conta. Previsto: o Clarevo ainda vai criar a conta, dois meses antes de vencer.',
    'Quando o carnê ou o boleto de um ano chegar com outro valor, toque em Informar o valor desse ano. Só ele muda.',
    'Tirada: você marcou que aquela conta não houve.',
  ],

  /** Tela "Informar o valor de 2027": o que esta ação muda. */
  informOnlyYear: (yearLabel: string): string => `Isso vale só para ${yearLabel}. Os outros anos continuam com a referência atual.`,

  /** "Mudar valor ou dia a partir de uma conta" (editar), junto do texto que já existe. */
  editVsInform: 'Para mudar o valor de um ano só, use Informar o valor, em Ano a ano. Aqui a mudança vale também para os anos seguintes.',
} as const;
