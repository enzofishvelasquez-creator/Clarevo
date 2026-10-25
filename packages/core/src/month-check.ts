import { formatMonthYearBR, type IsoMonth } from './dates';
import type { MonthCheck, MonthCheckKind, MonthOverview } from './records';
import { ERROR_TEXT } from './validation';

/**
 * "Conferi este mês" (D-060, item 2; resolve P-022): regras puras e textos. Para um mês já terminado, a pessoa marca "Conferi: não
 * houve recebimentos em {mês}" e/ou "Conferi: não houve pagamentos em {mês}" (dois tipos separados; "pagamentos" é a base de Pago:
 * caixa, pela data do pagamento, D-057 D07). Só aparece quando o mês, naquele tipo, não tem nenhum registro. Compra no cartão não é
 * registro de Pago (só o pagamento da fatura é): o mês só com compras no cartão pode ser conferido, e a tela avisa que "há compras no
 * cartão em {mês}" e que elas entram no Pago quando a fatura é paga. Mês conferido com zero é "zero confirmado" (a Evolução mostra
 * "R$ 0,00, conferido", entra nas médias como zero, e "Seus últimos meses" deixa de apontá-lo como possível lacuna). Se depois aparecer
 * um registro do tipo no mês, a marca deixa de valer (sem ser desligada); ao excluir o registro, volta a valer. A marca é uma linha
 * por contexto, mês e tipo, com uma versão que cresce 1 a cada marcar e desmarcar: o app manda a versão que leu, e a versão antiga é
 * recusada (versao_desatualizada). A marca nunca muda um total, não conta como anotação para a atividade de D-030 e vale por
 * contexto: na Família quem escreve marca e desmarca, e quem só lê vê. Mês atual e meses futuros não podem ser marcados. Regras
 * repetidas no banco (set_month_check, clear_month_check e months_overview, migração 0016).
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

/** A versão da linha da marca do tipo (a que o app manda ao marcar e desmarcar): 0 sem linha, ou em dado sem a versão. */
export function monthCheckVersion(row: MonthOverview, kind: MonthCheckKind): number {
  const v = kind === 'recebimentos' ? row.receivedCheckVersion : row.paidCheckVersion;
  return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : 0;
}

/** Compras no cartão vivas pela data da compra no mês (só informa: não entram em Pago), na linha de months_overview. */
export function monthCheckCardPurchases(row: MonthOverview): number {
  const n = row.cardPurchaseCount;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : 0;
}

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

/** "recebimentos" e "pagamentos": o que a conferência diz que não houve (Pago é caixa, pela data do pagamento: D-057 D07). */
const THINGS: Record<MonthCheckKind, string> = { recebimentos: 'recebimentos', pagamentos: 'pagamentos' };
/** A frase de mês sem anotação (D-030) fala de "gastos", como sempre falou. */
const UNCHECKED_THINGS: Record<MonthCheckKind, string> = { recebimentos: 'recebimentos', pagamentos: 'gastos' };

export const MONTH_CHECK_TEXT = {
  /** "Conferi: não houve pagamentos em agosto de 2026" (o botão). */
  action: (kind: MonthCheckKind, month: IsoMonth): string => `Conferi: não houve ${THINGS[kind]} em ${formatMonthYearBR(month)}`,
  /** Sob o botão: o que marcar faz e não faz. */
  actionNote: 'Não muda nenhum valor e você pode desfazer.',
  /** "Você conferiu: não houve pagamentos em agosto de 2026." (no lugar de "Mês sem anotação não quer dizer mês sem gastos"). */
  done: (kind: MonthCheckKind, month: IsoMonth): string => `Você conferiu: não houve ${THINGS[kind]} em ${formatMonthYearBR(month)}.`,
  /**
   * Junto da conferência de pagamentos, quando o mês tem compras no cartão vivas pela data da compra (inclusive importadas): compra no
   * cartão não é pagamento, e só entra no Pago quando a fatura é paga.
   */
  cardNotice: (month: IsoMonth): string => `Há compras no cartão em ${formatMonthYearBR(month)}. Elas entram no Pago quando a fatura é paga.`,
  /**
   * A frase de mês fechado sem registros que a pessoa ainda não conferiu (a de D-030): "Mês sem anotação não quer dizer mês sem gastos: aqui
   * aparece só o que está registrado no Clarevo." Com a conferência, `done` toma o lugar dela.
   */
  unchecked: (kind: MonthCheckKind): string =>
    `Mês sem anotação não quer dizer mês sem ${UNCHECKED_THINGS[kind]}: aqui aparece só o que está registrado na Clarevo.`,
  /** O botão de desfazer e o nome acessível dele. */
  undo: 'Desfazer a conferência',
  undoA11y: (kind: MonthCheckKind, month: IsoMonth): string => `Desfazer a conferência: não houve ${THINGS[kind]} em ${formatMonthYearBR(month)}`,
  saving: 'Salvando…',
  /** Anúncios (uma vez): depois de marcar e de desfazer. */
  announceDone: (kind: MonthCheckKind, month: IsoMonth): string => `Conferência registrada: não houve ${THINGS[kind]} em ${formatMonthYearBR(month)}.`,
  announceUndone: (kind: MonthCheckKind, month: IsoMonth): string => `Conferência desfeita: ${THINGS[kind]} em ${formatMonthYearBR(month)}.`,
  /** O ponto conferido na Evolução, em texto: "R$ 0,00, conferido". */
  zeroConfirmed: 'conferido',
  /**
   * O resultado veio, mas a marca não ficou como a pessoa pediu (por exemplo, a mesma chave devolveu o estado de agora e outro aparelho
   * já tinha desfeito ou refeito a marca): nada é anunciado como feito, e a tela recarrega.
   */
  changedElsewhere: 'Algo mudou em outro aparelho. A tela foi atualizada; confira e tente de novo.',
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
  /**
   * A versão da linha da marca que a tela leu (0 sem linha): é a que vai em set_month_check (marcar) e clear_month_check (desmarcar).
   * Versão antiga é recusada (versao_desatualizada).
   */
  version: number;
  /** O botão "Conferi: não houve pagamentos em agosto de 2026": só com mês terminado, sem registro do tipo, sem marca e com escrita. */
  action: string | null;
  /** O que o botão faz e não faz; só junto de `action`. */
  actionNote: string | null;
  /** "Você conferiu: não houve pagamentos em agosto de 2026.": mês conferido (a quem lê e a quem escreve). */
  doneText: string | null;
  /**
   * "Há compras no cartão em agosto de 2026. Elas entram no Pago quando a fatura é paga.": só na conferência de pagamentos (com o botão ou
   * com a frase de mês conferido), quando o mês tem compras no cartão vivas pela data da compra, inclusive importadas.
   */
  cardNotice: string | null;
  /** "Desfazer a conferência" e o nome acessível: mês conferido, para quem escreve. */
  undo: string | null;
  undoA11y: string | null;
}

/**
 * O plano de um mês e tipo: o botão para conferir (mês terminado, sem registro do tipo, sem marca, com escrita), ou a frase de mês
 * conferido com o botão de desfazer (só com escrita). Quem só lê vê a frase, nunca os botões. Mês com registro e mês não terminado:
 * nada. Em pagamentos, com compras no cartão no mês, o aviso vem junto do botão ou da frase.
 */
export function monthCheckPlan(row: MonthOverview, kind: MonthCheckKind, currentMonth: IsoMonth, canWrite: boolean): MonthCheckPlan {
  const state = monthCheckState(row, kind, currentMonth);
  const T = MONTH_CHECK_TEXT;
  const action = state === 'sem_registros' && canWrite ? T.action(kind, row.month) : null;
  const doneText = state === 'conferido' ? T.done(kind, row.month) : null;
  return {
    kind,
    month: row.month,
    state,
    version: monthCheckVersion(row, kind),
    action,
    actionNote: action ? T.actionNote : null,
    doneText,
    cardNotice: kind === 'pagamentos' && (action || doneText) && monthCheckCardPurchases(row) > 0 ? T.cardNotice(row.month) : null,
    undo: state === 'conferido' && canWrite ? T.undo : null,
    undoA11y: state === 'conferido' && canWrite ? T.undoA11y(kind, row.month) : null,
  };
}

/** O que a pessoa pediu: marcar ("Conferi: ...") ou desfazer ("Desfazer a conferência"). */
export type MonthCheckMove = 'marcar' | 'desfazer';

/**
 * Confere o resultado de set_month_check ou clear_month_check antes de anunciar qualquer coisa. 'feito': a marca ficou como a pessoa
 * pediu (ligada depois de marcar, desligada depois de desfazer). 'mudou': o banco respondeu, mas o estado é outro (a repetição da
 * mesma chave devolve o estado de agora, e outro aparelho pode ter desfeito ou refeito a marca): nada é anunciado como feito.
 */
export function monthCheckOutcome(move: MonthCheckMove, result: Pick<MonthCheck, 'checked'>): 'feito' | 'mudou' {
  return result.checked === (move === 'marcar') ? 'feito' : 'mudou';
}

/**
 * As chaves de operação das tentativas de marcar e desfazer de uma tela. A chave só é guardada depois de um resultado incerto (a
 * conexão caiu): repetir com a mesma chave e a mesma versão é seguro, porque o banco reconhece a repetição e devolve o estado. Quando
 * o estado muda (outro mês, outro tipo, outro estado ou outra versão da linha), as chaves guardadas deixam de valer e são esquecidas:
 * a versão faz parte do pedido, e reaproveitar a chave com outra versão seria recusado (chave_reutilizada). `make` cria uma chave
 * nova (no app, `newOperationKey`).
 */
export class MonthCheckKeys {
  private kept = new Map<string, string>();
  private signature = '';

  constructor(private readonly make: () => string) {}

  private static signatureOf(plan: Pick<MonthCheckPlan, 'month' | 'kind' | 'state' | 'version'>): string {
    return `${plan.month}|${plan.kind}|${plan.state}|${plan.version}`;
  }

  /** Esquece as chaves guardadas se o estado do plano é outro desde a última chamada. Devolve se esqueceu. */
  sync(plan: Pick<MonthCheckPlan, 'month' | 'kind' | 'state' | 'version'>): boolean {
    const next = MonthCheckKeys.signatureOf(plan);
    if (next === this.signature) return false;
    const forgot = this.kept.size > 0;
    this.kept.clear();
    this.signature = next;
    return forgot;
  }

  /** A chave do pedido: a guardada de uma tentativa incerta, ou uma nova. */
  keyFor(move: MonthCheckMove, plan: Pick<MonthCheckPlan, 'month' | 'kind' | 'state' | 'version'>): string {
    this.sync(plan);
    return this.kept.get(move) ?? this.make();
  }

  /** Guarda a chave de uma tentativa de resultado incerto, para repetir com ela. */
  keep(move: MonthCheckMove, plan: Pick<MonthCheckPlan, 'month' | 'kind' | 'state' | 'version'>, key: string): void {
    this.sync(plan);
    this.kept.set(move, key);
  }

  /** Esquece a chave de um pedido que terminou (resultado certo, recusa ou estado diferente do pedido). */
  settle(move: MonthCheckMove): void {
    this.kept.delete(move);
  }

  /** Quantas chaves estão guardadas (para os testes). */
  get size(): number {
    return this.kept.size;
  }
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
  for (const month of ['2026-08', '2025-12']) out.push(T.cardNotice(month));
  return out;
}
