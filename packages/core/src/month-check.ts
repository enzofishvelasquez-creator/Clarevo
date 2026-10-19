import { formatMonthYearBR, type IsoMonth } from './dates';
import type { MonthCheckKind, MonthOverview } from './records';
import { ERROR_TEXT } from './validation';

/**
 * "Conferi este mês" (D-060, item 2; resolve P-022): regras puras e textos. Para um mês já terminado, a pessoa marca "Conferi: não
 * houve recebimentos em {mês}" e/ou "Conferi: não houve gastos em {mês}" (dois tipos separados). Só aparece quando o mês, naquele
 * tipo, não tem nenhum registro. Mês conferido com zero é "zero confirmado" (a Evolução mostra "R$ 0,00, conferido", entra nas médias
 * como zero, e "Seus últimos meses" deixa de apontá-lo como possível lacuna). Se depois aparecer um registro do tipo no mês, a marca
 * deixa de valer (sem ser apagada); ao excluir o registro, volta a valer. A marca nunca muda um total, não conta como anotação para a
 * atividade de D-030 e vale por contexto: na Família quem escreve marca e desmarca, e quem só lê vê. Mês atual e meses futuros
 * não podem ser marcados. Regras repetidas no banco (set_month_check, clear_month_check e months_overview, migração 0016).
 */

/** O que é um mês para um tipo de marca. */
export type MonthCheckState =
  /** Mês ainda não terminado (o atual ou um futuro): nunca se marca (mes_invalido). */
  | 'nao_encerrado'
  /** Mês terminado com registro do tipo: nada a conferir (se havia marca, ela deixou de valer). */
  | 'com_registros'
  /** Mês terminado, sem registro do tipo e com a marca: zero confirmado. */
  | 'conferido'
  /** Mês terminado, sem registro do tipo e sem marca: a pessoa pode conferir. */
  | 'sem_registros';

/** Os registros (contagem) do tipo no mês, na linha de months_overview. */
export function monthCheckCount(row: MonthOverview, kind: MonthCheckKind): number {
  return kind === 'recebimentos' ? row.receivedCount : row.paidCount;
}

/** A marca do tipo vale no mês: existe e o mês não tem registro do tipo (o que months_overview entrega). Ausente: sem marca. */
export function monthCheckValid(row: MonthOverview, kind: MonthCheckKind): boolean {
  return (kind === 'recebimentos' ? row.receivedChecked : row.paidChecked) === true && monthCheckCount(row, kind) === 0;
}

/**
 * O estado do mês para o tipo. `currentMonth` é o mês de hoje: o mês atual e os seguintes são 'nao_encerrado'. Um registro vence a
 * marca ('com_registros'), e a contagem vem da própria linha: a marca só vale com contagem zero.
 */
export function monthCheckState(row: MonthOverview, kind: MonthCheckKind, currentMonth: IsoMonth): MonthCheckState {
  if (row.month >= currentMonth) return 'nao_encerrado';
  if (monthCheckCount(row, kind) > 0) return 'com_registros';
  return monthCheckValid(row, kind) ? 'conferido' : 'sem_registros';
}

/** "recebimentos" e "gastos": o que a frase diz que não houve. */
const THINGS: Record<MonthCheckKind, string> = { recebimentos: 'recebimentos', pagamentos: 'gastos' };

export const MONTH_CHECK_TEXT = {
  /** "Conferi: não houve gastos em agosto de 2026" (o botão). */
  action: (kind: MonthCheckKind, month: IsoMonth): string => `Conferi: não houve ${THINGS[kind]} em ${formatMonthYearBR(month)}`,
  /** Sob o botão: o que marcar faz e não faz. */
  actionNote: 'Não muda nenhum valor e você pode desfazer.',
  /** "Você conferiu: não houve gastos em agosto de 2026." (no lugar de "Mês sem anotação não quer dizer mês sem gastos"). */
  done: (kind: MonthCheckKind, month: IsoMonth): string => `Você conferiu: não houve ${THINGS[kind]} em ${formatMonthYearBR(month)}.`,
  /**
   * A frase de mês fechado sem registros que a pessoa ainda não conferiu (a de D-030): "Mês sem anotação não quer dizer mês sem gastos: aqui
   * aparece só o que está registrado no Clarevo." Com a conferência, `done` toma o lugar dela.
   */
  unchecked: (kind: MonthCheckKind): string =>
    `Mês sem anotação não quer dizer mês sem ${THINGS[kind]}: aqui aparece só o que está registrado no Clarevo.`,
  /** O botão de desfazer e o nome acessível dele. */
  undo: 'Desfazer a conferência',
  undoA11y: (kind: MonthCheckKind, month: IsoMonth): string => `Desfazer a conferência: não houve ${THINGS[kind]} em ${formatMonthYearBR(month)}`,
  saving: 'Salvando…',
  /** Anúncios (uma vez): depois de marcar e de desfazer. */
  announceDone: (kind: MonthCheckKind, month: IsoMonth): string => `Conferência registrada: não houve ${THINGS[kind]} em ${formatMonthYearBR(month)}.`,
  announceUndone: (kind: MonthCheckKind, month: IsoMonth): string => `Conferência desfeita: ${THINGS[kind]} em ${formatMonthYearBR(month)}.`,
  /** O ponto conferido na Evolução, em texto: "R$ 0,00, conferido". */
  zeroConfirmed: 'conferido',
  /** Códigos de recusa que a tela explica; o resto usa a falha genérica de salvar. */
  errors: {
    mes_com_registros: 'Este mês já tem registros do tipo. A tela foi atualizada.',
    versao_desatualizada: 'Algo mudou em outro aparelho. A tela foi atualizada; confira e tente de novo.',
    mes_invalido: 'Só é possível conferir um mês que já terminou.',
    sem_permissao: ERROR_TEXT.sem_permissao,
    nao_encontrado: ERROR_TEXT.nao_encontrado,
    chave_reutilizada: ERROR_TEXT.salvar_falhou,
    tipo_invalido: ERROR_TEXT.salvar_falhou,
  },
  failed: ERROR_TEXT.salvar_falhou,
  /** Resultado incerto (a conexão caiu): repetir com a mesma chave é seguro. */
  uncertain: 'Não deu para confirmar se salvou. Toque de novo: repetir é seguro.',
} as const;

/** Texto de erro de uma escrita da marca: o código conhecido, ou a falha genérica. */
export function monthCheckErrorText(code: string): string {
  const own = MONTH_CHECK_TEXT.errors as Record<string, string>;
  return own[code] ?? MONTH_CHECK_TEXT.failed;
}

/** O que a tela mostra para um mês e tipo (sem ler nada). */
export interface MonthCheckPlan {
  kind: MonthCheckKind;
  month: IsoMonth;
  state: MonthCheckState;
  /** O botão "Conferi: não houve gastos em agosto de 2026": só com mês terminado, sem registro do tipo, sem marca e com escrita. */
  action: string | null;
  /** O que o botão faz e não faz; só junto de `action`. */
  actionNote: string | null;
  /** "Você conferiu: não houve gastos em agosto de 2026.": mês conferido (a quem lê e a quem escreve). */
  doneText: string | null;
  /** "Desfazer a conferência" e o nome acessível: mês conferido, para quem escreve. */
  undo: string | null;
  undoA11y: string | null;
}

/**
 * O plano de um mês e tipo: o botão para conferir (mês terminado, sem registro do tipo, sem marca, com escrita), ou a frase de mês
 * conferido com o botão de desfazer (só com escrita). Quem só lê vê a frase, nunca os botões. Mês com registro e mês não terminado:
 * nada.
 */
export function monthCheckPlan(row: MonthOverview, kind: MonthCheckKind, currentMonth: IsoMonth, canWrite: boolean): MonthCheckPlan {
  const state = monthCheckState(row, kind, currentMonth);
  const T = MONTH_CHECK_TEXT;
  return {
    kind,
    month: row.month,
    state,
    action: state === 'sem_registros' && canWrite ? T.action(kind, row.month) : null,
    actionNote: state === 'sem_registros' && canWrite ? T.actionNote : null,
    doneText: state === 'conferido' ? T.done(kind, row.month) : null,
    undo: state === 'conferido' && canWrite ? T.undo : null,
    undoA11y: state === 'conferido' && canWrite ? T.undoA11y(kind, row.month) : null,
  };
}

/** Todos os textos de MONTH_CHECK_TEXT com meses e tipos de exemplo (para o teste de textos). */
export function monthCheckTextSamples(): string[] {
  const T = MONTH_CHECK_TEXT;
  const strings = (Object.values(T) as unknown[]).filter((v): v is string => typeof v === 'string');
  const out: string[] = [...strings, ...Object.values(T.errors), T.unchecked('recebimentos'), T.unchecked('pagamentos')];
  for (const kind of ['recebimentos', 'pagamentos'] as const) {
    for (const month of ['2026-08', '2025-12']) {
      out.push(T.action(kind, month), T.done(kind, month), T.undoA11y(kind, month), T.announceDone(kind, month), T.announceUndone(kind, month));
    }
  }
  return out;
}
