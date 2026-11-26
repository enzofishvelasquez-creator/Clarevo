import { describe, expect, it } from 'vitest';
import {
  ANTES_ESTIMATE_TEXT,
  CALC_SLUGS,
  COMMITTED_TEXT,
  DIVIDA_TEXT,
  DIVIDIR_NOTES,
  MULTA_CARD_TEXT,
  MULTA_CONSUMER_FINE_TEXT,
  MULTA_EXACT_TEXT,
  MULTA_FATURA_TEXT,
  PLANO_ESTIMATE_TEXT,
  PLANO_TEXT,
  QUITAR_ESTIMATE_TEXT,
  calcAntesDeFinanciar,
  calcCustoDaDivida,
  calcCustoPorAno,
  calcDividirContas,
  calcJuntarParaObjetivo,
  calcJurosCompostos,
  calcMultaEJuros,
  calcNotes,
  calcParceladoOuAVista,
  calcPlanoDividas,
  calcQuitarAntes,
  calcRendimentoCdi,
  calcReserva,
  splitCalcNotes,
  type CalcNoteKind,
  type CalcOutcome,
  type CalcTexts,
  type MultaInput,
} from '../src';

/**
 * O tipo de cada aviso das calculadoras (revisão de 26/11/2026). Antes, o app decidia o que ficava à vista por uma expressão no texto
 * ("estimad", "pode ser maior"), e avisos importantes (multa acima de 2%, teto do rotativo e do cheque especial, saldo que não diminui,
 * total acima das rendas, "O valor exato é o do boleto atualizado.") iam para "Como a conta é feita", fechado. Agora cada calculadora diz
 * o tipo de cada aviso; só os de apoio ('info') ficam recolhidos.
 */

const ok = <R extends CalcTexts>(out: CalcOutcome<R, string>): R => {
  if (!out.ok) throw new Error(JSON.stringify(out.errors));
  return out.result;
};
const pairs = (r: CalcTexts): [CalcNoteKind, string][] => r.notes.map((n, i) => [r.noteKinds[i]!, n]);

const saldo = (s: string, taxa: string, pagamento: string, apelido?: string) => ({ tipo: 'saldo' as const, saldo: s, taxaSaldo: taxa, pagamento, ...(apelido ? { apelido } : {}) });
const parcelada = (parcela: string, restantes: string, taxa = '', apelido?: string) => ({ tipo: 'parcelada' as const, parcela, restantes, taxaParcelada: taxa, ...(apelido ? { apelido } : {}) });
const fatura = (over: Partial<MultaInput> = {}): MultaInput => ({ modo: 'fatura', valor: '1.000,00', rotativoPct: '15', moraPct: '1', multaPct: '2', jurosMesPct: '', dias: '30', ...over });

/** Cada calculadora, nos casos que acendem cada aviso, com o tipo esperado de cada um, na ordem da tela. */
const CASES: { name: string; slug?: (typeof CALC_SLUGS)[number]; result: CalcTexts; expected: [CalcNoteKind, string][] }[] = [
  {
    name: 'Antes de financiar, com a renda',
    slug: 'antes-de-financiar',
    result: ok(calcAntesDeFinanciar({ preco: '1.200,00', entrada: '200,00', parcelas: '12', taxaMes: '1', renda: '4.000,00', comprometidoCents: 100_000 })),
    expected: [
      ['estimate', ANTES_ESTIMATE_TEXT],
      ['info', `${COMMITTED_TEXT.debtReference} ${COMMITTED_TEXT.debtReferenceSource}`],
    ],
  },
  {
    name: 'Antes de financiar, sem nada a financiar',
    result: ok(calcAntesDeFinanciar({ preco: '1.200,00', entrada: '1.200,00', parcelas: '12', taxaMes: '1' })),
    expected: [],
  },
  { name: 'Parcelado ou à vista?', slug: 'parcelado-ou-a-vista', result: ok(calcParceladoOuAVista({ aVista: '1.080,00', parcelas: '10', parcela: '120,00', primeiraNaCompra: false, formaPagamento: null })), expected: [] },
  { name: 'Quanto custa por ano?', slug: 'custo-por-ano', result: ok(calcCustoPorAno({ valor: '130,60', frequencia: 'mes' })), expected: [] },
  {
    name: 'Quanto custa uma dívida?, cheque especial acima do teto',
    slug: 'custo-da-divida',
    result: ok(calcCustoDaDivida({ tipo: 'cheque_especial', valor: '500,00', taxaMes: '8,01', meses: '1' })),
    expected: [
      ['warning', DIVIDA_TEXT.chequeCapNote],
      ['estimate', DIVIDA_TEXT.cetOutNote],
    ],
  },
  { name: 'Quanto custa uma dívida?, rotativo', result: ok(calcCustoDaDivida({ tipo: 'rotativo', valor: '700,00', taxaMes: '14' })), expected: [['estimate', DIVIDA_TEXT.cetOutNote]] },
  {
    name: 'Quanto custa uma dívida?, empréstimo',
    result: ok(calcCustoDaDivida({ tipo: 'emprestimo', valor: '5.000,00', taxaMes: '2', parcelas: '12' })),
    expected: [['estimate', DIVIDA_TEXT.cetNote]],
  },
  { name: 'Quitar antes ou adiantar parcelas', slug: 'quitar-antes', result: ok(calcQuitarAntes({ parcela: '850,00', restantes: '36', taxaMes: '1,5', modo: 'tudo' })), expected: [['estimate', QUITAR_ESTIMATE_TEXT]] },
  {
    name: 'Multa e juros por atraso, conta com multa acima de 2%',
    slug: 'multa-e-juros',
    result: ok(calcMultaEJuros({ valor: '200,00', multaPct: '10', jurosMesPct: '1', dias: '10' })),
    expected: [
      ['warning', MULTA_CONSUMER_FINE_TEXT],
      ['estimate', MULTA_EXACT_TEXT],
      ['info', MULTA_CARD_TEXT],
    ],
  },
  {
    name: 'Multa e juros por atraso, fatura no teto, com multa acima de 2% e depois da próxima fatura',
    result: ok(calcMultaEJuros(fatura({ rotativoPct: '99', multaPct: '10', dias: '365' }))),
    expected: [
      ['warning', MULTA_FATURA_TEXT.beyondCycle(365)],
      ['warning', MULTA_FATURA_TEXT.cap],
      ['warning', MULTA_FATURA_TEXT.fine],
      ['info', MULTA_FATURA_TEXT.rotativo],
      ['estimate', MULTA_FATURA_TEXT.exact],
    ],
  },
  {
    name: 'Em que ordem quitar as dívidas?, saldo que não diminui e dívida sem taxa',
    slug: 'plano-dividas',
    result: ok(calcPlanoDividas({ extra: '100,00', dividas: [parcelada('300,00', '12', '', 'Loja'), saldo('1.000,00', '8', '10,00', 'Rotativo')] })),
    expected: [
      ['estimate', PLANO_ESTIMATE_TEXT],
      ['warning', PLANO_TEXT.unknownRateNote('Loja', true, false)],
      ['warning', PLANO_TEXT.balanceStaysNote('Rotativo', 8_000)],
    ],
  },
  { name: 'Quanto guardar para imprevistos?', slug: 'reserva', result: ok(calcReserva({ essenciais: '3.750,00', meses: '6' } as never)), expected: [] },
  { name: 'Juntar para um objetivo', slug: 'juntar-para-objetivo', result: ok(calcJuntarParaObjetivo({ alvo: '10.000,00', modo: 'prazo', meses: '60' } as never)), expected: [] },
  {
    name: 'Dividir as contas da casa, total acima das rendas',
    slug: 'dividir-contas',
    result: ok(calcDividirContas({ total: '5.000,00', modo: 'renda', pessoas: [{ renda: '2.000,00' }, { renda: '2.000,00' }] })),
    expected: [
      ['warning', DIVIDIR_NOTES.aboveIncome],
      ['info', 'Os apelidos e as rendas ficam só nesta tela e não são gravados.'],
    ],
  },
  { name: 'Dividir as contas da casa, partes iguais', result: ok(calcDividirContas({ total: '100,00', modo: 'iguais', pessoas: [{}, {}] })), expected: [['info', 'Os apelidos ficam só nesta tela e não são gravados.']] },
  // Só no site (D-106).
  {
    name: 'Juros compostos (site)',
    result: ok(calcJurosCompostos({ mensal: '500,00', taxaAno: '10', meses: '120' } as never)),
    expected: [['estimate', 'É uma estimativa: na vida real a taxa muda com o tempo, e imposto, taxas e inflação mudam o resultado.']],
  },
  {
    name: 'Rendimento pelo CDI (site), tabela regressiva',
    result: ok(calcRendimentoCdi({ valor: '10.000,00', percentual: '100', cdiAno: '10', meses: '12', imposto: 'regressivo' } as never)),
    expected: [
      ['info', 'Na tabela regressiva, a alíquota cai com o prazo: 22,5% até 180 dias, 20% de 181 a 360, 17,5% de 361 a 720 e 15% acima de 720 dias.'],
      ['estimate', 'O CDI acompanha a Selic e muda com o tempo: o resultado de verdade pode ser maior ou menor que esta estimativa.'],
    ],
  },
];

describe('avisos das calculadoras com tipo (revisão de 26/11/2026)', () => {
  it('cada calculadora do app aparece na lista', () => {
    expect(new Set(CASES.map((c) => c.slug).filter(Boolean))).toEqual(new Set(CALC_SLUGS));
  });

  for (const c of CASES) {
    it(`${c.name}: cada aviso com o seu tipo, na ordem da tela`, () => {
      expect(c.result.noteKinds).toHaveLength(c.result.notes.length);
      expect(pairs(c.result)).toEqual(c.expected);
    });
  }

  it('à vista: a estimativa e os avisos que mudam a leitura da conta; em "Como a conta é feita": só os de apoio', () => {
    const multa = CASES.find((c) => c.name.startsWith('Multa e juros por atraso, conta'))!.result;
    expect(splitCalcNotes(multa)).toEqual({ shown: [MULTA_CONSUMER_FINE_TEXT, MULTA_EXACT_TEXT], folded: [MULTA_CARD_TEXT] });
    const fatura = CASES.find((c) => c.name.startsWith('Multa e juros por atraso, fatura'))!.result;
    expect(splitCalcNotes(fatura).shown).toEqual([MULTA_FATURA_TEXT.beyondCycle(365), MULTA_FATURA_TEXT.cap, MULTA_FATURA_TEXT.fine, MULTA_FATURA_TEXT.exact]);
    expect(splitCalcNotes(fatura).folded).toEqual([MULTA_FATURA_TEXT.rotativo]);
    // Os avisos que a revisão de 26/11/2026 achou recolhidos ficam todos à vista.
    const important = [
      MULTA_CONSUMER_FINE_TEXT,
      MULTA_FATURA_TEXT.fine,
      MULTA_FATURA_TEXT.cap,
      DIVIDA_TEXT.chequeCapNote,
      PLANO_TEXT.balanceStaysNote('Rotativo', 8_000),
      DIVIDIR_NOTES.aboveIncome,
      MULTA_EXACT_TEXT,
    ];
    const shown = CASES.flatMap((c) => splitCalcNotes(c.result).shown);
    for (const note of important) expect(shown, note).toContain(note);
    // Nenhum aviso de estimativa ou de regra vai para o bloco recolhido.
    for (const c of CASES) for (const [kind, note] of pairs(c.result)) if (kind !== 'info') expect(splitCalcNotes(c.result).folded, note).not.toContain(note);
  });

  it('calcNotes monta os avisos e os tipos juntos, deixando de fora os que não valem no caso', () => {
    expect(calcNotes()).toEqual({ notes: [], noteKinds: [] });
    expect(calcNotes(false && ['warning', 'a'], ['estimate', 'b'], null, undefined, ['info', 'c'])).toEqual({ notes: ['b', 'c'], noteKinds: ['estimate', 'info'] });
    expect(splitCalcNotes(null)).toEqual({ shown: [], folded: [] });
  });
});
