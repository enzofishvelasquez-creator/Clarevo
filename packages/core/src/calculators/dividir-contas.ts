import { formatTenths } from '../learn/format';
import { percentTenths, sharesCents } from '../learn/math';
import { formatBRL, type Cents } from '../money';
import { FieldReader, calcNotes, moneyField, type CalcFieldSpec, type CalcOutcome, type CalcTexts } from './common';
import { parseMoney } from './inputs';

/**
 * 8. Dividir as contas da casa (docs/08 §3.2). Partes iguais ou proporcionais à renda, com sharesCents (maior resto:
 * a soma fecha com o total) e percentuais com percentTenths. Não pede nome real e não grava nada (LGPD); não é o
 * plano Família.
 *
 * Revisão externa de 18/11/2026: uma renda zero é aceita (a parte dessa pessoa é zero) quando as outras somam mais que zero; todas zero
 * pedem uma renda ou a divisão em partes iguais; rendas negativas não passam na leitura do valor. Os percentuais exibidos, cada um com
 * uma casa, podem somar 99,9% ou 100,1%, e a hipótese diz isso (os valores em reais sempre fecham). Contas acima da soma das rendas
 * continuam calculadas, com o aviso de que pedem mais de 100% da renda informada. Os produtos total × renda ficam em BigInt.
 */
export type DividirModo = 'iguais' | 'renda';
export type DividirField = 'total' | 'modo' | 'pessoas' | `apelido.${number}` | `renda.${number}`;

export interface DividirPessoaInput {
  /** Opcional, até 20 caracteres; em branco vira "Pessoa 1", "Pessoa 2"… */
  apelido?: string;
  /** Só no modo 'renda'. */
  renda?: string;
}

export interface DividirInput {
  total: string;
  modo: DividirModo | null;
  /** 2 a 6 pessoas. */
  pessoas: readonly DividirPessoaInput[];
}

export interface DividirPessoaResult {
  name: string;
  cents: Cents;
  /** Percentual do total em décimos (percentTenths). */
  tenths: number;
  /** "Pessoa 1: R$ 1.200,00 (40%)" */
  line: string;
}

export interface DividirResult extends CalcTexts {
  modo: DividirModo;
  totalCents: Cents;
  people: DividirPessoaResult[];
}

export const DIVIDIR_MIN_PEOPLE = 2;
export const DIVIDIR_MAX_PEOPLE = 6;
export const NICKNAME_MAX = 20;

export const DIVIDIR_TEXT = {
  addPerson: 'Adicionar pessoa',
  removePerson: (name: string) => `Remover ${name}`,
  nicknameLabel: (index: number) => `Apelido da pessoa ${index + 1}`,
  nicknameHint: 'Opcional. Fica só nesta tela.',
  incomeLabel: (name: string) => `Renda de ${name}`,
  peopleRange: 'De 2 a 6 pessoas.',
} as const;

/** Nome mostrado: o apelido sem espaços nas pontas ou "Pessoa N". */
export function personName(apelido: string | undefined, index: number): string {
  const nick = (apelido ?? '').trim();
  return nick !== '' ? nick : `Pessoa ${index + 1}`;
}

export const DIVIDIR_FIELDS: Record<'total' | 'modo' | 'pessoas' | 'apelido' | 'renda', CalcFieldSpec> = {
  total: moneyField('Total das contas', 'o total das contas', '3.000,00'),
  modo: {
    label: 'Como dividir?',
    kind: 'opcao',
    default: 'iguais',
    options: [
      { value: 'iguais', label: 'Em partes iguais' },
      { value: 'renda', label: 'Pela renda de cada pessoa' },
    ],
    errors: { vazio: 'Escolha como dividir.' },
  },
  pessoas: {
    label: 'Pessoas',
    kind: 'inteiro',
    min: DIVIDIR_MIN_PEOPLE,
    max: DIVIDIR_MAX_PEOPLE,
    errors: { fora_da_faixa: 'Divida entre 2 e 6 pessoas.' },
  },
  apelido: { label: 'Apelido', hint: DIVIDIR_TEXT.nicknameHint, kind: 'texto', optional: true, errors: { longo: 'Use no máximo 20 caracteres.' } },
  renda: moneyField('Renda', 'a renda desta pessoa', '4.000,00', {
    errors: { zero: 'Informe ao menos uma renda maior que zero, ou escolha "Em partes iguais".' },
  }),
};

export const DIVIDIR_NOTES = {
  /** Percentuais com uma casa que não somam 100,0%. */
  roundedPercents: 'Percentuais arredondados com uma casa: a soma pode dar 99,9% ou 100,1%, mas os valores em reais fecham com o total.',
  /** Total das contas acima da soma das rendas (revisão externa de 18/11/2026): a conta continua, sem dizer se dá para pagar. */
  aboveIncome: 'O total das contas passa da soma das rendas informadas: a divisão pede mais de 100% da renda de cada pessoa. A conta mostra a divisão, sem dizer se dá para pagar.',
  zeroIncome: (names: string) => `${names}: renda zero, então a parte é R$ 0,00.`,
} as const;

const incomeShareText = (tenths: number) => (tenths === 0 ? 'menos de 0,1%' : `cerca de ${formatTenths(tenths)}`);

export function calcDividirContas(input: DividirInput): CalcOutcome<DividirResult, DividirField> {
  const r = new FieldReader<DividirField>();
  const total = r.read('total', parseMoney(input.total));
  const modo = input.modo === 'iguais' || input.modo === 'renda' ? input.modo : r.fail('modo', 'vazio');
  const n = input.pessoas.length;
  if (n < DIVIDIR_MIN_PEOPLE || n > DIVIDIR_MAX_PEOPLE) r.fail('pessoas', 'fora_da_faixa');
  const names = input.pessoas.map((p, i) => {
    if ([...(p.apelido ?? '').trim()].length > NICKNAME_MAX) r.fail(`apelido.${i}`, 'longo');
    return personName(p.apelido, i);
  });
  // Uma renda zero é aceita; todas zero não dão proporção (cada campo pede uma renda ou a divisão em partes iguais).
  const incomes = modo === 'renda' ? input.pessoas.map((p, i) => r.read(`renda.${i}`, parseMoney(p.renda ?? '', { allowZero: true }))) : [];
  if (modo === 'renda' && incomes.length > 0 && incomes.every((x) => x === 0)) incomes.forEach((_, i) => r.fail(`renda.${i}`, 'zero'));
  if (!r.ok || total === undefined || modo === undefined) return { ok: false, errors: r.errors };

  const weights = modo === 'renda' ? (incomes as number[]) : names.map(() => 1);
  const shares = sharesCents(total, weights);
  const people = shares.map((cents, i) => {
    const tenths = percentTenths(cents, total);
    return { name: names[i]!, cents, tenths, line: `${names[i]}: ${formatBRL(cents)} (${formatTenths(tenths)})` };
  });
  const incomeSum = weights.reduce((a, b) => a + b, 0);
  const incomeShare = modo === 'renda' ? percentTenths(total, incomeSum) : 0;
  const hypotheses =
    modo === 'iguais'
      ? ['Partes iguais. Os centavos que sobram vão para as primeiras pessoas da lista.']
      : [
          `Cada pessoa põe a mesma parte da própria renda: ${incomeShareText(incomeShare)}.`,
          'Os centavos que sobram vão para quem tem a maior fração, para a soma fechar com o total.',
        ];
  const zeroNames = modo === 'renda' ? names.filter((_, i) => weights[i] === 0) : [];
  if (zeroNames.length > 0) hypotheses.push(DIVIDIR_NOTES.zeroIncome(zeroNames.join(', ')));
  if (people.reduce((sum, p) => sum + p.tenths, 0) !== 1000) hypotheses.push(DIVIDIR_NOTES.roundedPercents);
  const aboveIncome = modo === 'renda' && total > incomeSum;
  return {
    ok: true,
    result: {
      modo,
      totalCents: total,
      people,
      resultLines: ['Com estes números, a divisão fica assim:', ...people.map((p) => p.line)],
      hypotheses,
      ...calcNotes(
        aboveIncome && ['warning', DIVIDIR_NOTES.aboveIncome],
        ['info', modo === 'renda' ? 'Os apelidos e as rendas ficam só nesta tela e não são gravados.' : 'Os apelidos ficam só nesta tela e não são gravados.'],
      ),
    },
  };
}
