import { formatTenths } from '../learn/format';
import { percentTenths, sharesCents } from '../learn/math';
import { formatBRL, type Cents } from '../money';
import { FieldReader, moneyField, type CalcFieldSpec, type CalcOutcome, type CalcTexts } from './common';
import { parseMoney } from './inputs';

/**
 * 7. Dividir as contas da casa (docs/08 §3.2). Partes iguais ou proporcionais à renda, com sharesCents (maior resto:
 * a soma fecha com o total) e percentuais com percentTenths. Não pede nome real e não grava nada (LGPD); não é o
 * plano Família.
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
  renda: moneyField('Renda', 'a renda desta pessoa', '4.000,00'),
};

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
  const incomes = modo === 'renda' ? input.pessoas.map((p, i) => r.read(`renda.${i}`, parseMoney(p.renda ?? ''))) : [];
  if (!r.ok || total === undefined || modo === undefined) return { ok: false, errors: r.errors };

  const weights = modo === 'renda' ? (incomes as number[]) : names.map(() => 1);
  const shares = sharesCents(total, weights);
  const people = shares.map((cents, i) => {
    const tenths = percentTenths(cents, total);
    return { name: names[i]!, cents, tenths, line: `${names[i]}: ${formatBRL(cents)} (${formatTenths(tenths)})` };
  });
  const incomeSum = weights.reduce((a, b) => a + b, 0);
  const hypotheses =
    modo === 'iguais'
      ? ['Partes iguais. Os centavos que sobram vão para as primeiras pessoas da lista.']
      : [
          `Cada pessoa põe a mesma parte da própria renda: ${incomeShareText(percentTenths(total, incomeSum))}.`,
          'Os centavos que sobram vão para quem tem a maior fração, para a soma fechar com o total.',
        ];
  return {
    ok: true,
    result: {
      modo,
      totalCents: total,
      people,
      resultLines: ['Com estes números, a divisão fica assim:', ...people.map((p) => p.line)],
      hypotheses,
      notes: [modo === 'renda' ? 'Os apelidos e as rendas ficam só nesta tela e não são gravados.' : 'Os apelidos ficam só nesta tela e não são gravados.'],
    },
  };
}
