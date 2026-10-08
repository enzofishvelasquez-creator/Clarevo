import type { IsoDate, IsoMonth } from './dates';
import { addMonths, addYearsClamped, formatMonthYearBR, isValidIsoMonth, monthOf, monthsBetween, parseDateBR, parseMonthBR } from './dates';
import type { Cents } from './money';
import { MAX_RECORD_CENTS, parseBRL } from './money';
import type { AmountMode, CommitmentInput, PaymentInput, RecordInput, SeriesInput, SeriesKind, SeriesNature } from './records';
import { PARTS_PER_YEAR_MAX } from './records';
import { ANNUAL_MAX_YEARS, annualLastMonth } from './series';

/**
 * Códigos de erro compartilhados entre app e banco (mesmas mensagens de exceção do Postgres).
 * Textos exatos do handoff "Primeiro ciclo" (07/10/2026), CL C002.
 */
export const ERROR_TEXT = {
  descricao_obrigatoria: 'Dê um nome para este registro.',
  descricao_longa: 'Use no máximo 80 caracteres.',
  valor_invalido: 'Informe um valor maior que zero, como 80,00.',
  valor_acima_do_limite: 'O valor máximo por registro é R$ 9.999.999,99.',
  categoria_invalida: 'Use uma categoria de até 40 caracteres.',
  data_invalida: 'Confira a data informada.',
  data_futura: 'Use uma data até hoje. Aqui entram só valores já pagos ou recebidos.',
  conta_invalida: 'Escolha a conta.',
  salvar_falhou: 'Não foi possível salvar. Seu preenchimento foi mantido. Tente novamente.',
  carregar_falhou: 'Não foi possível carregar. Tente novamente.',
  versao_desatualizada: 'Este registro foi alterado em outro aparelho. Confira a versão atual antes de salvar.',
  nao_encontrado: 'Este registro não está mais disponível.',
  sem_permissao: 'Você não tem permissão para esta ação.',
} as const;

export type ErrorCode = keyof typeof ERROR_TEXT;

/** Textos de conta a pagar. ERROR_TEXT continua fixo para registros; aqui só o que muda ou é novo. */
export const COMMITMENT_ERROR_TEXT = {
  ...ERROR_TEXT,
  descricao_obrigatoria: 'Dê um nome para esta conta a pagar.',
  valor_acima_do_limite: 'O valor máximo por conta a pagar é R$ 9.999.999,99.',
  vencimento_fora_do_intervalo: 'Use um vencimento entre 1 ano atrás e 2 anos à frente.',
  /** Só no app, com o vencimento em branco; o banco recusa como data_invalida. */
  vencimento_obrigatorio: 'Informe a data de vencimento, como 15/10/2026.',
  versao_desatualizada: 'Esta conta a pagar foi alterada em outro aparelho. Confira a versão atual antes de salvar.',
  nao_encontrado: 'Esta conta a pagar não está mais disponível.',
  compromisso_quitado: 'Esta conta a pagar já foi paga. Para alterar, desfaça o pagamento.',
  compromisso_aberto: 'Este pagamento já foi desfeito.',
  ja_paga_em_outro_aparelho: 'Esta conta a pagar já foi marcada como paga em outro aparelho.',
  pagar_falhou: 'Não foi possível registrar o pagamento. Seu preenchimento foi mantido. Tente novamente.',
  desfazer_falhou: 'Não foi possível desfazer o pagamento. Tente novamente.',
  excluir_falhou: 'Não foi possível excluir a conta a pagar. Tente novamente.',
  vencimento_fora_do_mes:
    'Numa conta de gasto fixo, o vencimento fica no mesmo mês. Para mudar o dia de todos os meses, edite o gasto fixo.',
  estimativa_invalida: ERROR_TEXT.salvar_falhou,
} as const;

/** Textos do formulário "Marcar como paga". */
export const PAYMENT_ERROR_TEXT = {
  ...COMMITMENT_ERROR_TEXT,
  data_futura: 'Use uma data até hoje. A conta só é marcada como paga depois do pagamento.',
  conta_invalida: 'Escolha a conta usada no pagamento.',
} as const;

/** Textos de gasto fixo e parcelamento (seção 3.1 e 4.3 da especificação). */
export const SERIES_ERROR_TEXT = {
  ...COMMITMENT_ERROR_TEXT,
  descricao_obrigatoria: 'Dê um nome para este gasto fixo ou parcelamento.',
  dia_invalido: 'Informe um dia de 1 a 31.',
  /** Genérico; no formulário, firstMonthRangeText(today) dá os meses. */
  inicio_fora_do_intervalo: 'Escolha um primeiro mês entre o mês passado e 12 meses à frente.',
  parcelas_invalidas: 'Informe de 2 a 480 parcelas.',
  parcelas_no_ano_invalidas: 'Informe de 2 a 12 parcelas por ano.',
  parcela_inicial_invalida: 'A próxima parcela precisa estar entre 1 e o total de parcelas.',
  fim_invalido: 'O último mês precisa ser igual ou depois do primeiro, em até 50 anos.',
  natureza_invalida: 'Escolha o tipo do parcelamento.',
  numero_fora_da_serie: 'Este mês está fora do período do gasto fixo.',
  inicio_em_conta_paga: 'A conta deste mês já foi paga. Escolha uma conta em aberto ou um mês seguinte.',
  limite_de_gastos_fixos:
    'Você chegou a 100 contas que se repetem (gastos fixos, parcelamentos e contas do ano). Encerre alguma para adicionar outra.',
  serie_tem_pagamento_posterior: 'Há conta paga depois do mês escolhido. Desfaça esse pagamento ou escolha um mês depois dele.',
  serie_tem_pagamentos: 'Este gasto fixo já tem conta paga. Para parar a repetição, use Encerrar.',
  versao_desatualizada: 'Algo mudou neste gasto fixo em outro aparelho. Confira as contas afetadas e confirme de novo.',
  nao_encontrado: 'Este gasto fixo não está mais disponível.',
  // Internos (o app nunca provoca): texto genérico de falha.
  tipo_invalido: ERROR_TEXT.salvar_falhou,
  modo_de_valor_invalido: ERROR_TEXT.salvar_falhou,
  serie_inconsistente: ERROR_TEXT.salvar_falhou,
} as const;

/** Textos da conta do ano (seção 1.4 da especificação do Ciclo A3): só o que muda em relação a SERIES_ERROR_TEXT. */
export const ANNUAL_SERIES_ERROR_TEXT = {
  ...SERIES_ERROR_TEXT,
  descricao_obrigatoria: 'Dê um nome para esta conta do ano.',
  /** Genérico; no formulário, firstMonthRangeText(today, 'anual') dá os meses. */
  inicio_fora_do_intervalo: 'Escolha um primeiro vencimento entre o mês passado e 23 meses à frente.',
  fim_invalido: 'O último ano precisa ser igual ou depois do primeiro, em até 50 anos.',
  numero_fora_da_serie: 'Este ano está fora do período da conta do ano.',
  inicio_em_conta_paga: 'Esta conta já foi paga. Escolha uma conta em aberto ou uma seguinte.',
  vencimento_fora_do_mes:
    'Numa conta do ano, o vencimento fica no mesmo mês. Para mudar o dia de todos os anos, edite a conta do ano.',
  serie_tem_pagamentos: 'Esta conta do ano já tem conta paga. Para parar a repetição, use Encerrar.',
  serie_tem_pagamento_posterior: 'Há conta paga depois do ano escolhido. Desfaça esse pagamento ou escolha um ano depois dele.',
  versao_desatualizada: 'Algo mudou nesta conta do ano em outro aparelho. Confira as contas afetadas e confirme de novo.',
  nao_encontrado: 'Esta conta do ano não está mais disponível.',
} as const;

/**
 * "Escolha um primeiro mês entre setembro de 2026 e outubro de 2027." ou, na conta do ano, "Escolha um primeiro
 * vencimento entre setembro de 2026 e setembro de 2028." (meses calculados a partir de hoje)
 */
export function firstMonthRangeText(today: IsoDate, kind?: SeriesKind): string {
  const { min, max } = firstMonthBounds(today, kind);
  const what = kind === 'anual' ? 'vencimento' : 'mês';
  return `Escolha um primeiro ${what} entre ${formatMonthYearBR(min)} e ${formatMonthYearBR(max)}.`;
}

/**
 * Texto do código, com os meses de hoje em inicio_fora_do_intervalo; com kind 'anual', as variantes da conta do ano.
 * Código desconhecido → falha genérica.
 */
export function seriesErrorText(code: string, today: IsoDate, kind?: SeriesKind): string {
  if (code === 'inicio_fora_do_intervalo') return firstMonthRangeText(today, kind);
  const texts: Record<string, string> = kind === 'anual' ? ANNUAL_SERIES_ERROR_TEXT : SERIES_ERROR_TEXT;
  return code in texts ? texts[code]! : SERIES_ERROR_TEXT.salvar_falhou;
}

/**
 * Erros de "Informar o valor de 2027" e "Tirar as parcelas de 2027" (informSeriesYear, skipSeriesYear):
 * versao_desatualizada vira "Algo mudou nas contas de 2027 em outro aparelho. Confira e tente de novo.".
 */
export function annualYearErrorText(code: string, yearLabel: string): string {
  if (code === 'versao_desatualizada') return `Algo mudou nas contas de ${yearLabel} em outro aparelho. Confira e tente de novo.`;
  const texts: Record<string, string> = ANNUAL_SERIES_ERROR_TEXT;
  return code in texts ? texts[code]! : SERIES_ERROR_TEXT.salvar_falhou;
}

export type DraftField = 'description' | 'amountText' | 'dateText' | 'accountId';
export type FieldErrors = Partial<Record<DraftField, string>>;

/** Rascunho do formulário. Guarda o texto digitado, para nunca perder o preenchimento. */
export interface RecordDraft {
  accountId: string;
  amountText: string;
  description: string;
  category: string | null;
  /** DD/MM/AAAA */
  dateText: string;
}

export const DESCRIPTION_MAX = 80;
export const CATEGORY_MAX = 40;

/** Conta caracteres como a pessoa vê (emoji conta 1), igual ao banco. */
export function charCount(text: string): number {
  return [...text].length;
}

/** Ordem dos campos na tela: o foco vai para o primeiro erro. */
export const FIELD_ORDER: DraftField[] = ['description', 'amountText', 'dateText', 'accountId'];

export type DraftValidation = { ok: true; input: RecordInput } | { ok: false; errors: FieldErrors };

export function validateRecordDraft(draft: RecordDraft, today: IsoDate): DraftValidation {
  const errors: FieldErrors = {};

  const description = draft.description.trim();
  if (description === '') errors.description = ERROR_TEXT.descricao_obrigatoria;
  else if (charCount(description) > DESCRIPTION_MAX) errors.description = ERROR_TEXT.descricao_longa;

  const amount = checkAmount(draft.amountText, ERROR_TEXT, errors);

  const occurredOn = parseDateBR(draft.dateText);
  if (occurredOn === null) errors.dateText = ERROR_TEXT.data_invalida;
  else if (occurredOn > today) errors.dateText = ERROR_TEXT.data_futura;

  if (draft.accountId.trim() === '') errors.accountId = ERROR_TEXT.conta_invalida;

  if (Object.keys(errors).length > 0 || amount === null || occurredOn === null) return { ok: false, errors };
  return {
    ok: true,
    input: { accountId: draft.accountId, amountCents: amount, occurredOn, description, category: normalizeCategory(draft.category) },
  };
}

/** Rascunho do formulário de conta a pagar. dateText é o vencimento (DD/MM/AAAA). */
export interface CommitmentDraft {
  description: string;
  amountText: string;
  dateText: string;
  category: string | null;
}

/** Rascunho de "Marcar como paga". dateText é a data do pagamento (DD/MM/AAAA). */
export interface PaymentDraft {
  accountId: string;
  amountText: string;
  dateText: string;
  category: string | null;
}

export const COMMITMENT_FIELD_ORDER: DraftField[] = ['description', 'amountText', 'dateText'];
export const PAYMENT_FIELD_ORDER: DraftField[] = ['amountText', 'dateText', 'accountId'];

/** Janela de vencimento aceita (igual ao banco): de 1 ano antes a 2 anos depois de hoje. */
export function dueDateBounds(today: IsoDate): { min: IsoDate; max: IsoDate } {
  return { min: addYearsClamped(today, -1), max: addYearsClamped(today, 2) };
}

/**
 * Conta a pagar. A janela de vencimento só é conferida quando o vencimento é novo ou muda
 * (opts.originalDueOn), para uma conta antiga continuar editável. Datas passadas e futuras são aceitas.
 * A categoria vem dos chips; o limite de 40 caracteres é conferido no repositório e no banco.
 */
export function validateCommitmentDraft(
  draft: CommitmentDraft,
  today: IsoDate,
  opts: { originalDueOn?: IsoDate } = {},
): { ok: true; input: CommitmentInput } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};

  const description = draft.description.trim();
  if (description === '') errors.description = COMMITMENT_ERROR_TEXT.descricao_obrigatoria;
  else if (charCount(description) > DESCRIPTION_MAX) errors.description = COMMITMENT_ERROR_TEXT.descricao_longa;

  const amount = checkAmount(draft.amountText, COMMITMENT_ERROR_TEXT, errors);

  const dueOn = parseDateBR(draft.dateText);
  if (draft.dateText.trim() === '') errors.dateText = COMMITMENT_ERROR_TEXT.vencimento_obrigatorio;
  else if (dueOn === null) errors.dateText = COMMITMENT_ERROR_TEXT.data_invalida;
  else if (dueOn !== opts.originalDueOn) {
    const { min, max } = dueDateBounds(today);
    if (dueOn < min || dueOn > max) errors.dateText = COMMITMENT_ERROR_TEXT.vencimento_fora_do_intervalo;
  }

  if (Object.keys(errors).length > 0 || amount === null || dueOn === null) return { ok: false, errors };
  return { ok: true, input: { description, amountCents: amount, dueOn, category: normalizeCategory(draft.category) } };
}

/** Pagamento: valor que saiu da conta, data até hoje e conta de saída. */
export function validatePaymentDraft(
  draft: PaymentDraft,
  today: IsoDate,
): { ok: true; input: PaymentInput } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};

  const amount = checkAmount(draft.amountText, PAYMENT_ERROR_TEXT, errors);

  const paidOn = parseDateBR(draft.dateText);
  if (paidOn === null) errors.dateText = PAYMENT_ERROR_TEXT.data_invalida;
  else if (paidOn > today) errors.dateText = PAYMENT_ERROR_TEXT.data_futura;

  if (draft.accountId.trim() === '') errors.accountId = PAYMENT_ERROR_TEXT.conta_invalida;

  if (Object.keys(errors).length > 0 || amount === null || paidOn === null) return { ok: false, errors };
  return { ok: true, input: { accountId: draft.accountId, amountCents: amount, paidOn, category: normalizeCategory(draft.category) } };
}

/**
 * Primeiro mês aceito (igual ao banco): do mês anterior a 12 meses depois do mês de hoje. Conta do ano: até 23 meses
 * depois (a conta do ano seguinte, quando a deste já passou ou foi paga).
 */
export function firstMonthBounds(today: IsoDate, kind?: SeriesKind): { min: IsoMonth; max: IsoMonth } {
  const m = monthOf(today);
  return { min: addMonths(m, -1), max: addMonths(m, kind === 'anual' ? 23 : 12) };
}

/** Códigos de clarevo_validate_series, na ordem do banco. */
export const SERIES_CODE_ORDER = [
  'tipo_invalido',
  'natureza_invalida',
  'valor_invalido',
  'valor_acima_do_limite',
  'descricao_obrigatoria',
  'descricao_longa',
  'categoria_invalida',
  'modo_de_valor_invalido',
  'dia_invalido',
  'inicio_fora_do_intervalo',
  'parcelas_invalidas',
  'parcelas_no_ano_invalidas',
  'parcela_inicial_invalida',
  'fim_invalido',
] as const;
export type SeriesErrorCode = (typeof SERIES_CODE_ORDER)[number];

const SERIES_KINDS: readonly string[] = ['mensal', 'parcelada', 'anual'];
const NATURES: readonly string[] = ['conta', 'financiamento', 'compra_parcelada', 'outro_parcelamento'];
const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n);

/** Vigência (mesma ordem de clarevo_validate_series_term). Textos já aparados. */
export function seriesTermError(term: {
  amountCents: Cents;
  description: string;
  category: string | null;
  amountMode: string;
  dueDay: number;
}): SeriesErrorCode | null {
  if (!isInt(term.amountCents) || term.amountCents < 1) return 'valor_invalido';
  if (term.amountCents > MAX_RECORD_CENTS) return 'valor_acima_do_limite';
  if (!term.description) return 'descricao_obrigatoria';
  if (charCount(term.description) > DESCRIPTION_MAX) return 'descricao_longa';
  if (term.category && charCount(term.category) > CATEGORY_MAX) return 'categoria_invalida';
  if (term.amountMode !== 'fixo' && term.amountMode !== 'variavel') return 'modo_de_valor_invalido';
  if (!isInt(term.dueDay) || term.dueDay < 1 || term.dueDay > 31) return 'dia_invalido';
  return null;
}

/**
 * Cadastro de série (mesma ordem de clarevo_validate_series). Textos já aparados.
 * Conta do ano: natureza 'conta', primeiro mês até 23 meses à frente, partsPerYear de 1 a 12, firstNumber de 1 a k e
 * lastMonth nulo ou o mês da última parcela de um ano, de 0 a 49 anos depois do primeiro.
 */
export function seriesInputError(input: SeriesInput, today: IsoDate): SeriesErrorCode | null {
  const { kind, nature } = input;
  if (!SERIES_KINDS.includes(kind)) return 'tipo_invalido';
  const natureOk = kind === 'parcelada' ? nature !== 'conta' && NATURES.includes(nature) : nature === 'conta';
  if (!natureOk) return 'natureza_invalida';
  const term = seriesTermError(input);
  if (term) return term;
  const { min, max } = firstMonthBounds(today, kind);
  const first = input.firstDueMonth;
  if (typeof first !== 'string' || !isValidIsoMonth(first) || first < min || first > max) return 'inicio_fora_do_intervalo';
  const total = input.installmentTotal;
  if (kind === 'parcelada' ? !isInt(total) || total < 2 || total > 480 : total !== null) return 'parcelas_invalidas';
  // Ausente vale como nulo, como p_parts_per_year default null.
  const k = input.partsPerYear ?? null;
  if (kind === 'anual' ? !isInt(k) || k < 1 || k > PARTS_PER_YEAR_MAX : k !== null) return 'parcelas_no_ano_invalidas';
  const n = input.firstNumber;
  const nMax = kind === 'parcelada' ? total! : kind === 'anual' ? k! : 1;
  if (kind === 'mensal' ? n !== 1 : !isInt(n) || n < 1 || n > nMax) return 'parcela_inicial_invalida';
  const last = input.lastMonth;
  switch (kind) {
    case 'parcelada':
      return last !== null ? 'fim_invalido' : null;
    case 'mensal':
      if (last !== null) {
        if (typeof last !== 'string' || !isValidIsoMonth(last)) return 'fim_invalido';
        const months = monthsBetween(first, last);
        if (months < 0 || months > 599) return 'fim_invalido';
      }
      return null;
    case 'anual':
      if (last !== null) {
        // Mês da última parcela de um ano: d = meses(âncora, último), d ≥ 0, d mod 12 = k − 1 e até 49 anos depois.
        if (typeof last !== 'string' || !isValidIsoMonth(last)) return 'fim_invalido';
        const d = monthsBetween(addMonths(first, -(n - 1)), last);
        if (d < 0 || d % 12 !== k! - 1 || Math.floor(d / 12) > ANNUAL_MAX_YEARS - 1) return 'fim_invalido';
      }
      return null;
    default:
      return 'tipo_invalido';
  }
}

/** Rascunho do formulário de série. Os textos guardam o que a pessoa digitou. */
export interface SeriesDraft {
  kind: SeriesKind;
  /** Parcelado: tipo escolhido (null antes de escolher). Ignorado no gasto fixo e na conta do ano, que são sempre 'conta'. */
  nature: SeriesNature | null;
  description: string;
  amountText: string;
  amountMode: AmountMode;
  /** 1 a 31. */
  dueDayText: string;
  /**
   * MM/AAAA: primeira conta (todo mês), mês da próxima parcela (parcelado) ou, na conta do ano, mês da próxima parcela a
   * pagar (o 1º mês do primeiro ano, ou o da parcela escolhida num ano já começado; annualStartChoices).
   */
  firstMonthText: string;
  /** Parcelado: número da próxima parcela a pagar. Todo ano: posição no primeiro ano (vazio = 1). Ignorado no gasto fixo. */
  firstNumberText: string;
  /** Parcelado: total de parcelas. Ignorado nos outros. */
  installmentTotalText: string;
  /** Todo ano: parcelas por ano, "1" para cota única. Ignorado nos outros. */
  partsPerYearText: string;
  /**
   * Todo mês: último mês (MM/AAAA). Todo ano: "Último ano" (AAAA, o ano da primeira parcela do último ano: 2026 para
   * "2026/2027"; dica em annualLastYearHint). Vazio para "Sem data para terminar". Ignorado no parcelado.
   */
  lastMonthText: string;
  category: string | null;
}

export type SeriesField =
  | 'description'
  | 'nature'
  | 'amountText'
  | 'dueDayText'
  | 'firstMonthText'
  | 'installmentTotalText'
  | 'partsPerYearText'
  | 'firstNumberText'
  | 'lastMonthText';
export type SeriesFieldErrors = Partial<Record<SeriesField, string>>;

/** Ordem dos campos na tela: o foco vai para o primeiro erro. */
export const SERIES_FIELD_ORDER: SeriesField[] = [
  'description',
  'nature',
  'amountText',
  'dueDayText',
  'firstMonthText',
  'installmentTotalText',
  'partsPerYearText',
  'firstNumberText',
  'lastMonthText',
];

const intText = (text: string): number | null => (/^\s*\d{1,9}\s*$/.test(text) ? Number(text.trim()) : null);

/**
 * Dica do campo "Último ano (AAAA)" da conta do ano (cadastro e "Outro ano" ao encerrar) quando o ano dela atravessa
 * dezembro (k parcelas a partir do mês `month`, de 1 a 12, com a última no ano seguinte). Nesse caso o rótulo do ano é
 * "2026/2027" e o ano digitado é o da primeira parcela (D-029), o que a dica diz com o ano digitado (4 dígitos, de
 * firstYear a firstYear + 49) ou, sem ele, com firstYear, o ano da primeira parcela do primeiro ano da série:
 * "Digite o ano em que começa o último período, como 2027 para 2027/2028.". null quando o ano não atravessa dezembro
 * (o app mantém a dica dele). Para uma série s: month e firstYear de seriesMonthOf(s, 1).
 */
export function annualLastYearHint(k: number, month: number, firstYear: number, yearText = ''): string | null {
  if (!isInt(k) || k < 2 || k > PARTS_PER_YEAR_MAX || !isInt(month) || month < 1 || month > 12 || month + k - 1 <= 12) return null;
  const typed = /^\d{4}$/.test(yearText.trim()) ? Number(yearText.trim()) : null;
  const y = typed !== null && typed >= firstYear && typed - firstYear <= ANNUAL_MAX_YEARS - 1 ? typed : firstYear;
  return `Digite o ano em que começa o último período, como ${y} para ${y}/${y + 1}.`;
}

/**
 * Formulário de série com as mesmas regras e a mesma ordem do banco. errors traz um texto por campo;
 * code é o primeiro erro na ordem do banco (o mesmo que create_series devolveria).
 * Campos escondidos pelo tipo (término no parcelado; total, próxima e tipo no gasto fixo; total e tipo na conta do ano;
 * parcelas por ano fora da conta do ano) são ignorados. Na conta do ano, lastMonthText é o "Último ano" (AAAA) e vira
 * input.lastMonth = mês da última parcela desse ano.
 */
export function validateSeriesDraft(
  draft: SeriesDraft,
  today: IsoDate,
): { ok: true; input: SeriesInput } | { ok: false; errors: SeriesFieldErrors; code: SeriesErrorCode } {
  const codes = new Set<SeriesErrorCode>();
  const errors: SeriesFieldErrors = {};
  const kind = draft.kind;
  const texts: Record<SeriesErrorCode, string> = kind === 'anual' ? ANNUAL_SERIES_ERROR_TEXT : SERIES_ERROR_TEXT;
  const fail = (code: SeriesErrorCode, field: SeriesField | null) => {
    codes.add(code);
    if (field && !errors[field]) errors[field] = code === 'inicio_fora_do_intervalo' ? firstMonthRangeText(today, kind) : texts[code];
  };
  const parcelada = kind === 'parcelada';
  const anual = kind === 'anual';
  if (!SERIES_KINDS.includes(kind)) fail('tipo_invalido', null);

  const nature: SeriesNature | null = parcelada ? draft.nature : 'conta';
  if (parcelada && (nature === null || nature === 'conta' || !NATURES.includes(nature))) fail('natureza_invalida', 'nature');

  const amount = parseBRL(draft.amountText);
  if (amount === null || amount <= 0) fail('valor_invalido', 'amountText');
  else if (amount > MAX_RECORD_CENTS) fail('valor_acima_do_limite', 'amountText');

  const description = draft.description.trim();
  if (description === '') fail('descricao_obrigatoria', 'description');
  else if (charCount(description) > DESCRIPTION_MAX) fail('descricao_longa', 'description');

  const category = normalizeCategory(draft.category);
  if (category && charCount(category) > CATEGORY_MAX) fail('categoria_invalida', null);
  if (draft.amountMode !== 'fixo' && draft.amountMode !== 'variavel') fail('modo_de_valor_invalido', null);

  const dueDay = intText(draft.dueDayText);
  if (dueDay === null || dueDay < 1 || dueDay > 31) fail('dia_invalido', 'dueDayText');

  const { min, max } = firstMonthBounds(today, kind);
  const first = parseMonthBR(draft.firstMonthText);
  if (first === null || first < min || first > max) fail('inicio_fora_do_intervalo', 'firstMonthText');

  let total: number | null = null;
  let firstNumber = 1;
  let lastMonth: IsoMonth | null = null;
  let partsPerYear: number | null = null;
  if (anual) {
    partsPerYear = intText(draft.partsPerYearText);
    const kOk = partsPerYear !== null && partsPerYear >= 1 && partsPerYear <= PARTS_PER_YEAR_MAX;
    if (!kOk) fail('parcelas_no_ano_invalidas', 'partsPerYearText');
    const n = draft.firstNumberText.trim() === '' ? 1 : intText(draft.firstNumberText);
    const nOk = n !== null && n >= 1 && n <= (kOk ? partsPerYear! : PARTS_PER_YEAR_MAX);
    if (!nOk) fail('parcela_inicial_invalida', 'firstNumberText');
    firstNumber = n ?? 0;
    const yearText = draft.lastMonthText.trim();
    if (yearText !== '') {
      if (!/^\d{4}$/.test(yearText)) fail('fim_invalido', 'lastMonthText');
      else if (first !== null && kOk && nOk) {
        const input = { firstDueMonth: first, firstNumber: n!, partsPerYear: partsPerYear! };
        const firstYear = Number(addMonths(first, -(n! - 1)).slice(0, 4));
        const years = Number(yearText) - firstYear;
        if (years < 0 || years > ANNUAL_MAX_YEARS - 1) fail('fim_invalido', 'lastMonthText');
        else lastMonth = annualLastMonth(input, Number(yearText));
      }
      // Ano que atravessa dezembro ("2026/2027"): o erro ocupa o lugar da dica, então diz também qual ano digitar.
      if (errors.lastMonthText && first !== null && kOk && nOk) {
        const anchor = addMonths(first, -(n! - 1));
        const hint = annualLastYearHint(partsPerYear!, Number(anchor.slice(5, 7)), Number(anchor.slice(0, 4)));
        if (hint) errors.lastMonthText = `${errors.lastMonthText} ${hint}`;
      }
    }
  } else if (parcelada) {
    total = intText(draft.installmentTotalText);
    const totalOk = total !== null && total >= 2 && total <= 480;
    if (!totalOk) fail('parcelas_invalidas', 'installmentTotalText');
    const n = intText(draft.firstNumberText);
    if (n === null || n < 1 || n > (totalOk ? total! : 480)) fail('parcela_inicial_invalida', 'firstNumberText');
    firstNumber = n ?? 0;
  } else if (draft.lastMonthText.trim() !== '') {
    lastMonth = parseMonthBR(draft.lastMonthText);
    const months = lastMonth !== null && first !== null ? monthsBetween(first, lastMonth) : 0;
    if (lastMonth === null || months < 0 || months > 599) fail('fim_invalido', 'lastMonthText');
  }

  const code = SERIES_CODE_ORDER.find((c) => codes.has(c));
  if (code) return { ok: false, errors, code };
  return {
    ok: true,
    input: {
      kind,
      nature: nature!,
      description,
      category,
      amountCents: amount!,
      amountMode: draft.amountMode,
      dueDay: dueDay!,
      firstDueMonth: first!,
      firstNumber,
      installmentTotal: total,
      partsPerYear,
      lastMonth,
    },
  };
}

function checkAmount(
  text: string,
  texts: { valor_invalido: string; valor_acima_do_limite: string },
  errors: FieldErrors,
): Cents | null {
  const amount = parseBRL(text);
  if (amount === null || amount <= 0) errors.amountText = texts.valor_invalido;
  else if (amount > MAX_RECORD_CENTS) errors.amountText = texts.valor_acima_do_limite;
  return amount;
}

function normalizeCategory(category: string | null): string | null {
  return category?.trim() ? category.trim() : null;
}

/**
 * Erro de servidor que corresponde a um campo do formulário. Sem segundo argumento, campos dos formulários
 * de registro, conta a pagar e pagamento; com 'series', campos do formulário de série (SERIES_FIELD_ORDER).
 */
export function fieldForErrorCode(code: string): DraftField | null;
export function fieldForErrorCode(code: string, form: 'series'): SeriesField | null;
export function fieldForErrorCode(code: string, form?: 'series'): DraftField | SeriesField | null {
  if (form === 'series') return seriesFieldForErrorCode(code);
  switch (code) {
    case 'descricao_obrigatoria':
    case 'descricao_longa':
      return 'description';
    case 'valor_invalido':
    case 'valor_acima_do_limite':
      return 'amountText';
    case 'data_invalida':
    case 'data_futura':
    case 'vencimento_fora_do_intervalo':
    case 'vencimento_fora_do_mes':
      return 'dateText';
    case 'conta_invalida':
      return 'accountId';
    default:
      return null;
  }
}

function seriesFieldForErrorCode(code: string): SeriesField | null {
  switch (code) {
    case 'descricao_obrigatoria':
    case 'descricao_longa':
      return 'description';
    case 'natureza_invalida':
      return 'nature';
    case 'valor_invalido':
    case 'valor_acima_do_limite':
      return 'amountText';
    case 'dia_invalido':
      return 'dueDayText';
    case 'inicio_fora_do_intervalo':
      return 'firstMonthText';
    case 'parcelas_invalidas':
      return 'installmentTotalText';
    case 'parcelas_no_ano_invalidas':
      return 'partsPerYearText';
    case 'parcela_inicial_invalida':
      return 'firstNumberText';
    case 'fim_invalido':
      return 'lastMonthText';
    default:
      return null;
  }
}
