import { addDays, formatDateBR, formatDayMonth, formatListDate, isValidIsoDate, type IsoDate } from './dates';
import type { Invoice } from './cards';
import type { Commitment, SeriesKind } from './records';

/**
 * Vencimento em sábado, domingo ou feriado nacional (D-060 item 3, resolve P-014; Ciclo T) e o padrão de mercado do próximo dia
 * útil (D-061; Ciclo T2).
 *
 * A data de vencimento calculada NÃO muda (nada no banco, nenhum total, nenhuma ocorrência de gasto fixo ou de conta do ano), e o
 * app nunca promete que o pagamento no próximo dia útil vale para qualquer cobrança nem que não há encargos. Cada cobrança tem a
 * própria regra, então o aviso termina mandando conferir com quem cobra.
 *
 * D-061: conta a pagar, boleto, fatura, gasto fixo e parcelamento com vencimento em dia que não é útil aparecem como "Vence terça,
 * 13/10 (próximo dia útil)" e só passam a "vencida" depois que esse dia termina (`effectiveOverdue`, no dia da sessão). Contas do
 * ano (IPVA, IPTU, matrícula e outras, que costumam ser tributos) NÃO ganham a tolerância: seguem "vencida" a partir do dia
 * seguinte à data cadastrada, e o aviso manda conferir a data no carnê ou no site do órgão. A ordem, os totais e o horário do
 * lembrete seguem pela data cadastrada.
 *
 * Tudo aqui trabalha com data civil (`AAAA-MM-DD`), sem passar pelo fuso local: o dia da semana sai de `Date.UTC`, e o "hoje"
 * que decide se o aviso aparece é o da sessão (`todayIn(fuso)`), nunca o do relógio do aparelho. Sem banco, sem rede e sem
 * nada gravado.
 *
 * Feriados nacionais: só os definidos em lei federal (lista e fontes abaixo, conferidas em 19/10/2026 e registradas em
 * `docs/09_APRENDER.md`, seção "Feriados nacionais do aviso de dia útil"). Carnaval, Sexta-feira Santa, Corpus Christi e feriados
 * estaduais e municipais NÃO entram.
 */

/** Fonte de uma lei, no formato das fontes oficiais de Aprender (`LearnSource`, `kind: 'oficial'`). */
export interface HolidaySource {
  kind: 'oficial';
  publisher: string;
  title: string;
  url: string;
  /** Onde está o trecho que confirma o fato; diz quando a página não abriu e o trecho veio de resultado de busca. */
  locator: string;
  consultedOn: IsoDate;
}

const PLANALTO = 'Presidência da República';

/** Data da consulta das três leis e da última revisão da lista (o teste de `dia-util.test.ts` cobra a revisão no prazo). */
export const NATIONAL_HOLIDAYS_CONSULTED_ON: IsoDate = '2026-10-19';
export const NATIONAL_HOLIDAYS_REVIEWED_ON: IsoDate = '2026-10-19';
/** Meses até a próxima revisão: uma lei nova pode criar ou tirar um feriado nacional. */
export const NATIONAL_HOLIDAYS_REVIEW_EVERY_MONTHS = 12;

/**
 * As três leis federais. Os sites oficiais não abriram a partir do ambiente de trabalho (DNS e bloqueio de saída): cada fato
 * vem de trecho de resultado de busca da própria fonte, como nos temas de época de Aprender (D-053), e o `locator` diz isso.
 */
export const NATIONAL_HOLIDAY_SOURCES: readonly HolidaySource[] = [
  {
    kind: 'oficial',
    publisher: PLANALTO,
    title: 'Lei nº 662, de 6 de abril de 1949, com a redação da Lei nº 10.607, de 19 de dezembro de 2002 (feriados nacionais)',
    url: 'https://www.planalto.gov.br/ccivil_03/leis/l0662.htm',
    locator:
      'Art. 1º, "Redação dada pela Lei nº 10.607, de 19.12.2002": 1º de janeiro, 21 de abril, 1º de maio, 7 de setembro, 2 de novembro, 15 de novembro e 25 de dezembro. A Lei nº 10.607/2002 revogou a Lei nº 1.266, de 8.12.1950, cujo art. 3º já declarava feriado nacional o 21 de abril (Tiradentes). Trecho de resultado de busca; a página não abriu',
    consultedOn: NATIONAL_HOLIDAYS_CONSULTED_ON,
  },
  {
    kind: 'oficial',
    publisher: PLANALTO,
    title: 'Lei nº 6.802, de 30 de junho de 1980 (12 de outubro, Nossa Senhora Aparecida)',
    url: 'https://www.planalto.gov.br/ccivil_03/LEIS/L6802.htm',
    locator:
      'Art. 1º: declarado feriado nacional o dia 12 de outubro, para culto público e oficial a Nossa Senhora Aparecida, Padroeira do Brasil; Art. 2º: vigência na data da publicação (Diário Oficial de 1º de julho de 1980). Trecho de resultado de busca; a página não abriu',
    consultedOn: NATIONAL_HOLIDAYS_CONSULTED_ON,
  },
  {
    kind: 'oficial',
    publisher: PLANALTO,
    title: 'Lei nº 14.759, de 21 de dezembro de 2023 (20 de novembro, Dia Nacional de Zumbi e da Consciência Negra)',
    url: 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14759.htm',
    locator:
      'Art. 1º: declarado feriado nacional o dia 20 de novembro, Dia Nacional de Zumbi e da Consciência Negra; Art. 2º: vigência na data da publicação (Diário Oficial de 22 de dezembro de 2023, e o primeiro feriado foi em 20 de novembro de 2024). Trecho de resultado de busca; a página não abriu',
    consultedOn: NATIONAL_HOLIDAYS_CONSULTED_ON,
  },
] as const;

/** Rótulos curtos das leis, na ordem de `NATIONAL_HOLIDAY_SOURCES`. */
export const NATIONAL_HOLIDAY_LAWS = [
  'Lei nº 662/1949, com a redação da Lei nº 10.607/2002',
  'Lei nº 6.802/1980',
  'Lei nº 14.759/2023',
] as const;

/** Data da consulta das fontes da regra do próximo dia útil (D-061), em `docs/09_APRENDER.md`, seção 11. */
export const DUE_RULE_CONSULTED_ON: IsoDate = '2026-10-19';

/** Rótulo curto da lei que o aviso cita: a Lei nº 7.089/1983. */
export const DUE_RULE_LAW = 'Lei nº 7.089/1983';

/**
 * Fontes da regra do próximo dia útil (D-061): a lei e, como notícia (não é o acórdão), o entendimento do STJ sobre o que acontece
 * se o pagamento passar do primeiro dia útil. Como nas leis dos feriados, as páginas não abriram a partir do ambiente de trabalho
 * (DNS e bloqueio de saída): cada trecho vem de resultado de busca da própria fonte, e o `locator` diz isso.
 */
export const DUE_RULE_SOURCES: readonly HolidaySource[] = [
  {
    kind: 'oficial',
    publisher: PLANALTO,
    title: 'Lei nº 7.089, de 23 de março de 1983 (juros de mora em título que vence em sábado, domingo ou feriado)',
    url: 'https://www.planalto.gov.br/ccivil_03/leis/l7089.htm',
    locator:
      'Art. 1º: "Fica proibida a cobrança de juros de mora, por estabelecimentos bancários e instituições financeiras, sobre títulos de qualquer natureza, cujo vencimento se dê em sábado, domingo ou feriado, desde que seja quitado no primeiro dia subsequente."; o art. 2º foi vetado e a lei não menciona multa. Trecho de resultado de busca; a página não abriu',
    consultedOn: DUE_RULE_CONSULTED_ON,
  },
  {
    kind: 'oficial',
    publisher: 'Superior Tribunal de Justiça',
    title:
      'Notícia do STJ: juros sobre dívida não paga no primeiro dia útil subsequente incidem a partir do vencimento original (REsp 1.954.924, Terceira Turma). É notícia do tribunal, não o acórdão',
    url: 'https://www.stj.jus.br/sites/portalp/Paginas/Comunicacao/Noticias/25022022-Juros-sobre-divida-nao-paga-no-primeiro-dia-util-subsequente-incidem-a-partir-do-vencimento-original.aspx',
    locator:
      'Se a dívida vence em dia não útil e o pagamento não é feito no primeiro dia útil subsequente, os juros de mora são contados a partir do vencimento original (fatura de cartão que venceu num sábado e foi paga depois); a proteção do art. 1º da Lei 7.089/1983 depende do pagamento no primeiro dia útil seguinte. Trecho de resultado de busca; a página não abriu',
    consultedOn: DUE_RULE_CONSULTED_ON,
  },
] as const;

export interface NationalHoliday {
  /** Data civil do feriado naquele ano. */
  date: IsoDate;
  /** Nome usual, usado só no texto do aviso (as leis 662 e 10.607 citam só as datas). */
  name: string;
  /** Mês (1 a 12) e dia do mês. */
  month: number;
  day: number;
  /** Lei que define o feriado, entre `NATIONAL_HOLIDAY_LAWS`. */
  law: string;
  /** Posição da fonte em `NATIONAL_HOLIDAY_SOURCES`. */
  source: number;
}

interface HolidayRule {
  month: number;
  day: number;
  name: string;
  /** Índice da lei em `NATIONAL_HOLIDAY_LAWS` e `NATIONAL_HOLIDAY_SOURCES`. */
  law: 0 | 1 | 2;
  /**
   * Primeiro ano em que vale pela lei: 1949 (Lei 662), 1951 (21 de abril: já era feriado nacional pela Lei 1.266, de 08/12/1950,
   * art. 3, que a Lei 10.607, de 19/12/2002, revogou e cuja data manteve na redação que deu à Lei 662), 1980 (Lei 6.802), 2003 (2 de
   * novembro entrou pela Lei 10.607; **a conferir**: nenhuma fonte consultada traz a cláusula de vigência da Lei 10.607, então 2003
   * é só o primeiro 2 de novembro depois da publicação, em 20/12/2002, e `docs/09`, seção 11, não afirma o ano) e 2024 (Lei 14.759,
   * em vigor desde 22/12/2023). O aviso só olha vencimentos de hoje em diante, então o ano de 2003 nunca decide nada na tela.
   */
  fromYear: number;
}

/**
 * Os nove feriados nacionais, em ordem de data. O 20 de novembro só vale de 2024 em diante: a Lei 14.759 entrou em vigor em
 * 22/12/2023, depois de 20/11/2023. Antes de 2003 a lista só foi conferida para o 21 de abril (desde 1951); as outras datas desses anos
 * não (o app só avisa de vencimentos de hoje em diante).
 */
const RULES: readonly HolidayRule[] = [
  { month: 1, day: 1, name: 'Confraternização Universal', law: 0, fromYear: 1949 },
  { month: 4, day: 21, name: 'Tiradentes', law: 0, fromYear: 1951 },
  { month: 5, day: 1, name: 'Dia do Trabalho', law: 0, fromYear: 1949 },
  { month: 9, day: 7, name: 'Independência do Brasil', law: 0, fromYear: 1949 },
  { month: 10, day: 12, name: 'Nossa Senhora Aparecida', law: 1, fromYear: 1980 },
  { month: 11, day: 2, name: 'Finados', law: 0, fromYear: 2003 },
  { month: 11, day: 15, name: 'Proclamação da República', law: 0, fromYear: 1949 },
  { month: 11, day: 20, name: 'Dia Nacional de Zumbi e da Consciência Negra', law: 2, fromYear: 2024 },
  { month: 12, day: 25, name: 'Natal', law: 0, fromYear: 1949 },
];

const two = (n: number) => String(n).padStart(2, '0');

/** Feriados nacionais de um ano (inteiro de 4 dígitos), em ordem de data. Ano inválido: lista vazia. */
export function nationalHolidays(year: number): NationalHoliday[] {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) return [];
  return RULES.filter((r) => year >= r.fromYear).map((r) => ({
    date: `${year}-${two(r.month)}-${two(r.day)}`,
    name: r.name,
    month: r.month,
    day: r.day,
    law: NATIONAL_HOLIDAY_LAWS[r.law],
    source: r.law,
  }));
}

/** Feriado nacional nesta data, ou `null` (data inválida também). */
export function nationalHolidayOn(date: IsoDate): NationalHoliday | null {
  if (!isValidIsoDate(date)) return null;
  return nationalHolidays(Number(date.slice(0, 4))).find((h) => h.date === date) ?? null;
}

/** Dia da semana de uma data civil: 0 domingo, 1 segunda, ..., 6 sábado. Pelo calendário, sem fuso. Data inválida: `null`. */
export function weekdayOf(date: IsoDate): number | null {
  if (!isValidIsoDate(date)) return null;
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** É sábado ou domingo? */
export function isWeekend(date: IsoDate): boolean {
  const w = weekdayOf(date);
  return w === 0 || w === 6;
}

/** Dia útil: nem sábado, nem domingo, nem feriado nacional. Data inválida: `false`. */
export function isBusinessDay(date: IsoDate): boolean {
  const w = weekdayOf(date);
  return w !== null && w !== 0 && w !== 6 && nationalHolidayOn(date) === null;
}

/**
 * O próximo dia útil DEPOIS da data (nunca a própria data): de uma sexta útil, a segunda útil seguinte. Pula sábado, domingo e
 * feriado nacional, inclusive viradas de ano e feriado seguido de fim de semana. Data inválida: `null`.
 */
export function nextBusinessDay(date: IsoDate): IsoDate | null {
  if (!isValidIsoDate(date)) return null;
  let day = addDays(date, 1);
  // No pior caso (feriado na sexta e na segunda) são 4 dias; o limite só protege contra um erro de regra.
  for (let i = 0; i < 31 && !isBusinessDay(day); i++) day = addDays(day, 1);
  return day;
}

const WEEKDAY = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'] as const;

/** "domingo", "segunda", "terça", ..., "sábado" (sem "-feira", como no aviso). */
export function weekdayName(date: IsoDate): string {
  const w = weekdayOf(date);
  return w === null ? '' : WEEKDAY[w]!;
}

/** "no domingo", "no sábado" ou "na segunda", "na terça", ... */
function onWeekday(date: IsoDate): string {
  const w = weekdayOf(date);
  return w === null ? '' : `${w === 0 || w === 6 ? 'no' : 'na'} ${WEEKDAY[w]}`;
}

/**
 * Tipo de cobrança, para a regra do próximo dia útil (D-061). A tolerância vale para conta avulsa, boleto, fatura, gasto fixo e
 * parcelamento; a conta do ano não a tem (costuma ser tributo, e imposto pode ter regra diferente).
 */
export type DueKind = 'conta' | 'fatura' | 'gasto_fixo' | 'parcelamento' | 'conta_do_ano';

/** Todos os tipos, para testes e para quem precisa percorrer todos. */
export const DUE_KINDS: readonly DueKind[] = ['conta', 'fatura', 'gasto_fixo', 'parcelamento', 'conta_do_ano'];

/** A conta do ano é a única sem a tolerância do próximo dia útil (D-061 item 3). */
export function hasNextBusinessDayGrace(kind: DueKind): boolean {
  return kind !== 'conta_do_ano';
}

/** Tipo de cobrança de uma série: gasto fixo, parcelamento ou conta do ano. */
export function dueKindOfSeries(kind: SeriesKind): DueKind {
  return kind === 'anual' ? 'conta_do_ano' : kind === 'parcelada' ? 'parcelamento' : 'gasto_fixo';
}

/** Tipo de cobrança de uma conta a pagar: fatura de cartão, ocorrência de série ou conta avulsa. */
export function dueKindOf(c: Pick<Commitment, 'invoice' | 'series'>): DueKind {
  if (c.invoice) return 'fatura';
  return c.series ? dueKindOfSeries(c.series.kind) : 'conta';
}

/**
 * O último dia em que a conta ainda NÃO está vencida: o próprio vencimento, ou, com a tolerância (D-061), o próximo dia útil quando
 * o vencimento cai em sábado, domingo ou feriado nacional. Data inválida e conta do ano: o próprio vencimento.
 */
export function lastOnTimeDay(dueOn: IsoDate, kind: DueKind): IsoDate {
  if (!hasNextBusinessDayGrace(kind) || !isValidIsoDate(dueOn) || isBusinessDay(dueOn)) return dueOn;
  return nextBusinessDay(dueOn) ?? dueOn;
}

/**
 * Vencida de verdade (D-061): só depois que o último dia sem atraso termina. `today` é o dia da sessão (`todayIn(fuso)`), nunca o do
 * relógio do aparelho. Sexta feriado, sábado e domingo: vencida só na terça (segunda útil termina). Conta do ano: a partir do dia
 * seguinte à data cadastrada. É a única regra de "vencida" do app, usada por toda tela, resumo, widget e revisão que a mostram.
 */
export function effectiveOverdue(dueOn: IsoDate, kind: DueKind, today: IsoDate): boolean {
  return lastOnTimeDay(dueOn, kind) < today;
}

/** `effectiveOverdue` de uma conta a pagar (sem olhar se está paga: quem chama já separou as em aberto). */
export function isCommitmentOverdue(c: Pick<Commitment, 'dueOn' | 'invoice' | 'series'>, today: IsoDate): boolean {
  return effectiveOverdue(c.dueOn, dueKindOf(c), today);
}

/** Textos fixos do aviso. Sem promessa de ausência de encargos, sem julgamento, sem produto financeiro. */
export const DUE_DAY_TEXT = {
  /** Frase neutra, depois do aviso de conta, boleto, fatura, gasto fixo e parcelamento. */
  advice: 'Confira com quem cobra se o pagamento pode ser feito no próximo dia útil.',
  /** Frase da conta do ano (costuma ser tributo), no lugar da anterior (D-061 item 3). */
  adviceYearBill: 'Impostos podem ter regra diferente. Confira a data no carnê ou no site do órgão.',
  /** Etiqueta da data em que a conta passa a contar como vencida: "Vence terça, 13/10 (próximo dia útil)". */
  nextBusinessDayTag: '(próximo dia útil)',
  /** Sinal da lista de contas a pagar (texto, nunca só ícone ou cor). */
  sign: 'Não é dia útil',
  /** Botão que abre a explicação, no próprio lugar. */
  learnMore: 'Saiba mais',
  learnMoreA11y: 'Saiba mais sobre vencimento em dia que não é útil',
  learnMoreTitle: 'Vencimento em dia que não é útil',
  /** Corpo da explicação. */
  learnMoreParagraphs: [
    'A Clarevo não muda a data de vencimento: ela segue como você anotou, ou como o dia escolhido do gasto fixo, do parcelamento ou da conta do ano a calcula. Quando essa data cai em sábado, domingo ou feriado nacional, a conta, o boleto ou a fatura aparece como "Vence terça, 13/10 (próximo dia útil)" e só passa a vencida depois que esse dia termina. Os totais, a ordem das contas e o lembrete seguem na data de vencimento.',
    'A Lei nº 7.089/1983 proíbe bancos e instituições financeiras de cobrar juros de mora sobre título que vence em sábado, domingo ou feriado, desde que seja quitado no primeiro dia subsequente, que o STJ lê como o primeiro dia útil seguinte. A multa e as regras de cada cobrança podem variar, e a Clarevo não sabe qual vale para a sua conta. Por isso, confira com quem cobra antes de escolher a data do pagamento.',
    'Se o pagamento passar do primeiro dia útil, os juros podem contar desde a data original do vencimento: é o entendimento do STJ, que o tribunal divulgou em notícia sobre um caso de fatura de cartão.',
    'Contas do ano, como IPVA, IPTU e matrícula, costumam ser tributos e não ganham essa tolerância na Clarevo: ficam vencidas a partir do dia seguinte ao vencimento. Impostos podem ter regra diferente. Confira a data no carnê ou no site do órgão.',
    'Contam só os feriados nacionais de data fixa definidos em lei federal: 1º de janeiro, 21 de abril, 1º de maio, 7 de setembro, 12 de outubro, 2 de novembro, 15 de novembro, 20 de novembro e 25 de dezembro. Carnaval, Sexta-feira Santa, Corpus Christi e os feriados de estados e municípios não entram. O dia de eleição cai sempre num domingo, que já é coberto pelo fim de semana. Quem cobra pode ter outro calendário.',
  ],
  /** Fonte e data da consulta, no fim da explicação. */
  source: `Fontes: ${NATIONAL_HOLIDAY_LAWS.join('; ')}; ${DUE_RULE_LAW}; notícia do STJ sobre o REsp 1.954.924. Consultadas em ${formatDateBR(NATIONAL_HOLIDAYS_CONSULTED_ON)}.`,
} as const;

/**
 * A etiqueta de uma conta com tolerância (D-061), ainda sem atraso: "terça, 13/10 (próximo dia útil)" ou "hoje (próximo dia útil)".
 * `null` quando não se aplica: dia útil, conta do ano, data inválida ou conta já vencida de verdade.
 */
export function nextBusinessDayWhen(dueOn: IsoDate, kind: DueKind, today: IsoDate): { lastOnTime: IsoDate; when: string } | null {
  if (!hasNextBusinessDayGrace(kind) || !isValidIsoDate(dueOn) || isBusinessDay(dueOn)) return null;
  const last = nextBusinessDay(dueOn)!;
  if (last < today) return null;
  const when = last === today ? 'hoje' : `${weekdayName(last)}, ${formatListDate(last, today)}`;
  return { lastOnTime: last, when: `${when} ${DUE_DAY_TEXT.nextBusinessDayTag}` };
}

/** "Vence terça, 13/10 (próximo dia útil)", "Vence hoje (próximo dia útil)" ou `null` (ver `nextBusinessDayWhen`). */
export function nextBusinessDayDueText(dueOn: IsoDate, kind: DueKind, today: IsoDate): string | null {
  const w = nextBusinessDayWhen(dueOn, kind, today);
  return w === null ? null : `Vence ${w.when}`;
}

export interface DueDayNotice {
  /** Vencimento avisado (a data calculada, que não muda). */
  dueOn: IsoDate;
  /** Tipo de cobrança que decidiu o aviso. */
  kind: DueKind;
  /** A tolerância do próximo dia útil vale para este tipo (D-061): falso na conta do ano. */
  grace: boolean;
  /** Por que não é dia útil: sábado, domingo ou, em dia de semana, feriado nacional. */
  reason: 'sabado' | 'domingo' | 'feriado';
  /** Feriado nacional na data, mesmo quando ela também cai em fim de semana. */
  holiday: NationalHoliday | null;
  /** O próximo dia útil depois do vencimento. */
  nextBusinessDay: IsoDate;
  /** O último dia sem atraso: o próximo dia útil com a tolerância; o próprio vencimento na conta do ano. */
  lastOnTimeDay: IsoDate;
  /**
   * Com tolerância: "Vence no domingo, 11/10/2026, que não é dia útil. O próximo dia útil é terça, 13/10/2026. Só depois desse dia ela
   * passa a vencida." Conta do ano: "Vence na sexta, 25/12/2026, que não é dia útil (feriado nacional: Natal). Em conta do ano, o
   * Clarevo não usa o próximo dia útil: ela passa a vencida a partir do dia seguinte ao vencimento."
   */
  text: string;
  /** Com tolerância, "Confira com quem cobra se o pagamento pode ser feito no próximo dia útil."; conta do ano, a frase dos impostos. */
  advice: string;
  /** Sinal curto da lista: "Não é dia útil". */
  sign: string;
  /**
   * Sinal da lista: "Não é dia útil · vencimento anotado: domingo, 11/10" (a etiqueta "Vence terça, 13/10 (próximo dia útil)" já
   * está na legenda da conta) ou, na conta do ano, "Não é dia útil · confira a data no carnê ou no site do órgão".
   */
  signLine: string;
  /** O que o leitor de tela diz do sinal da lista: "não é dia útil, vencimento anotado domingo, 11/10". */
  signA11y: string;
  /** O que o leitor de tela diz do aviso inteiro: o aviso e a frase neutra. */
  a11y: string;
}

/**
 * O aviso de uma data de vencimento, ou `null` quando é dia útil (ou a data é inválida). Só depende da data civil e do tipo de
 * cobrança: quem decide se o aviso aparece (conta em aberto, que ainda não venceu) são `commitmentDueNotice` e `invoiceDueNotice`.
 * `kind` padrão: `conta`, com a tolerância do próximo dia útil (D-061).
 *
 * Em feriado nacional que cai em dia de semana, o texto diz qual: "Vence na segunda, 12/10/2026, que não é dia útil (feriado
 * nacional: Nossa Senhora Aparecida). O próximo dia útil é terça, 13/10/2026. Só depois desse dia ela passa a vencida."
 */
export function dueDayNotice(dueOn: IsoDate, kind: DueKind = 'conta'): DueDayNotice | null {
  if (!isValidIsoDate(dueOn) || isBusinessDay(dueOn)) return null;
  const next = nextBusinessDay(dueOn)!;
  const holiday = nationalHolidayOn(dueOn);
  const w = weekdayOf(dueOn);
  const reason = w === 6 ? 'sabado' : w === 0 ? 'domingo' : 'feriado';
  const why = holiday ? ` (feriado nacional: ${holiday.name})` : '';
  const grace = hasNextBusinessDayGrace(kind);
  const opening = `Vence ${onWeekday(dueOn)}, ${formatDateBR(dueOn)}, que não é dia útil${why}.`;
  const text = grace
    ? `${opening} O próximo dia útil é ${weekdayName(next)}, ${formatDateBR(next)}. Só depois desse dia ela passa a vencida.`
    : `${opening} Em conta do ano, a Clarevo não usa o próximo dia útil: ela passa a vencida a partir do dia seguinte ao vencimento.`;
  const advice = grace ? DUE_DAY_TEXT.advice : DUE_DAY_TEXT.adviceYearBill;
  const registered = `${weekdayName(dueOn)}, ${formatDayMonth(dueOn)}`;
  return {
    dueOn,
    kind,
    grace,
    reason,
    holiday,
    nextBusinessDay: next,
    lastOnTimeDay: grace ? next : dueOn,
    text,
    advice,
    sign: DUE_DAY_TEXT.sign,
    signLine: grace ? `${DUE_DAY_TEXT.sign} · vencimento anotado: ${registered}` : `${DUE_DAY_TEXT.sign} · confira a data no carnê ou no site do órgão`,
    signA11y: grace
      ? `${DUE_DAY_TEXT.sign.toLowerCase()}, vencimento anotado ${registered}`
      : `${DUE_DAY_TEXT.sign.toLowerCase()}, confira a data no carnê ou no site do órgão`,
    a11y: `${text} ${advice}`,
  };
}

/**
 * Aviso de uma conta a pagar (detalhe, lista, gasto fixo e conta do ano): só conta em aberto que ainda não está vencida de verdade
 * (D-061: com a tolerância, depois do próximo dia útil; conta do ano, depois da data cadastrada). Conta paga ou vencida não mostra
 * aviso. `today` é o dia da sessão (`todayIn(fuso)`), nunca o do relógio do aparelho. Vale também para a conta de uma fatura de cartão.
 */
export function commitmentDueNotice(c: Pick<Commitment, 'status' | 'dueOn' | 'invoice' | 'series'>, today: IsoDate): DueDayNotice | null {
  if (c.status !== 'aberto') return null;
  const kind = dueKindOf(c);
  return effectiveOverdue(c.dueOn, kind, today) ? null : dueDayNotice(c.dueOn, kind);
}

/** Aviso do detalhe de uma fatura de cartão: só fatura aberta ou fechada, com valor a pagar, que ainda não venceu de verdade. */
export function invoiceDueNotice(invoice: Pick<Invoice, 'situation' | 'dueOn' | 'totalCents'>, today: IsoDate): DueDayNotice | null {
  if ((invoice.situation !== 'aberta' && invoice.situation !== 'fechada') || invoice.totalCents <= 0) return null;
  return effectiveOverdue(invoice.dueOn, 'fatura', today) ? null : dueDayNotice(invoice.dueOn, 'fatura');
}

/** Conta prevista de um gasto fixo, parcelamento ou conta do ano (ainda não é conta a pagar): o aviso vale enquanto não venceu de verdade. */
export function plannedDueNotice(dueOn: IsoDate, today: IsoDate, kind: DueKind = 'gasto_fixo'): DueDayNotice | null {
  return effectiveOverdue(dueOn, kind, today) ? null : dueDayNotice(dueOn, kind);
}
