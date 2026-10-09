import {
  affectedByYear,
  isRepoError,
  mergeOccurrences,
  newOperationKey,
  type Commitment,
  type CommitmentSeries,
  type FinancialRecord,
  type IsoMonth,
  type OccurrenceMode,
  type PaymentInput,
  type ReturnDecision,
  type ReturnReview,
  type ReviewAnnualGroup,
  type ReviewRow,
  type YearPlan,
} from '@clarevo/core';
import { useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import {
  useCreateSeriesOccurrence,
  useDecideReturnReview,
  useDeleteCommitment,
  usePayCommitment,
  useSkipSeriesYear,
  useUndoCommitmentPayment,
  useUpdateRecord,
} from '@/state/data';
import { useRepo } from '@/state/session';

/**
 * Ciclo A4 · Seus últimos meses (D-030): escritas da revisão, com chave de operação por linha e reconciliação de
 * resultado incerto (falha de rede). Nada aparece como feito antes da confirmação do servidor.
 */

/** Falha de rede ou resposta ilegível: a gravação pode ou não ter acontecido. */
export const isUncertain = (e: unknown) => !isRepoError(e) || e.code === 'rede' || e.code === 'desconhecido';

/** Código da recusa (ou 'desconhecido'), para returnErrorText. */
export const codeOf = (e: unknown) => (isRepoError(e) ? e.code : 'desconhecido');

/** Recusas em que a tela recarrega a linha (algo mudou em outro aparelho). */
export const isConflict = (e: unknown) =>
  isRepoError(e, 'versao_desatualizada') ||
  isRepoError(e, 'ocorrencia_existente') ||
  isRepoError(e, 'compromisso_quitado') ||
  isRepoError(e, 'nao_encontrado');

/** Situação de uma linha resolvida na sessão. 'registrada': "Ainda não paguei" (a conta ficou em aberto). */
export type RowOutcome =
  | { type: 'paga'; commitment: Commitment }
  | { type: 'nao_houve' }
  | { type: 'registrada'; commitment: Commitment };

/**
 * Canal só em memória entre "Atualizar meses" e as telas que ele abre (registrar e pagar, anotar no modo "Dia"):
 * o resultado de cada linha e se houve alguma ação. Lido pelas funções abaixo (fora dos componentes), como lib/flash.
 */
let outcomes = new Map<string, RowOutcome>();
let actedElsewhere = false;

export const returnSession = {
  /** Começo de uma sessão de "Atualizar meses". */
  start() {
    outcomes = new Map();
    actedElsewhere = false;
  },
  /** Linha resolvida em outra tela (chave de ReviewRow). Conta como ação. */
  setOutcome(rowKey: string, outcome: RowOutcome) {
    outcomes.set(rowKey, outcome);
    actedElsewhere = true;
  },
  /** Recebimento ou gasto anotado no modo "Dia" a partir da revisão. */
  noteAction() {
    actedElsewhere = true;
  },
  /** Lidos uma única vez, ao "Atualizar meses" receber o foco de novo. */
  take(): { outcomes: [string, RowOutcome][]; acted: boolean } {
    const out = { outcomes: [...outcomes], acted: actedElsewhere };
    outcomes = new Map();
    actedElsewhere = false;
    return out;
  },
};

/** Todas as linhas da revisão (meses fechados e este mês). */
export function allReviewRows(review: ReturnReview | null): ReviewRow[] {
  if (!review) return [];
  return [...review.months.flatMap((m) => m.rows), ...review.current.rows];
}

/**
 * A mesma conta na revisão recarregada: pela chave ou, para uma linha sem conta registrada que passou a existir em
 * aberto (criada em outro aparelho), pela série e pelo número.
 */
export function findLiveRow(review: ReturnReview | null, row: ReviewRow): ReviewRow | null {
  const rows = allReviewRows(review);
  const same = rows.find((r) => r.key === row.key);
  if (same) return same;
  if (row.series) {
    const ref = row.series;
    return rows.find((r) => r.series?.id === ref.id && r.series.number === ref.number) ?? null;
  }
  if (row.commitment) {
    const id = row.commitment.id;
    return rows.find((r) => r.commitment?.id === id) ?? null;
  }
  return null;
}

/** Linha que passou a ter conta em aberto (depois de criar a conta do número). */
export function openRowFrom(row: ReviewRow, c: Commitment): ReviewRow {
  return {
    ...row,
    state: 'aberta',
    dueOn: c.dueOn,
    description: c.description,
    category: c.category,
    amountCents: c.amountCents,
    amountIsEstimate: c.amountIsEstimate,
    commitment: c,
  };
}

/** Erro de "Já paguei" numa linha sem conta: created preenchido quando a conta foi registrada e o pagamento não. */
export class PayRowError extends Error {
  constructor(
    readonly cause: unknown,
    readonly created: Commitment | null,
  ) {
    super('pagar_linha');
  }
}

interface CreateSlot {
  key: string;
  /** Argumentos enviados com a chave: uma repetição vai com os mesmos (o banco reconhece pelo conteúdo). */
  args: { seriesId: string; seriesVersion: number; number: number; mode: OccurrenceMode };
  uncertain: boolean;
}

interface PaySlot {
  key: string;
  pending: { key: string; snapshot: string }[];
}

/**
 * Escritas da revisão, uma chave por linha e por ação, guardadas entre tentativas (padrão das contas a pagar):
 * - recusa do servidor: nada foi gravado; a próxima tentativa usa outra chave;
 * - falha de rede: a tentativa fica guardada; antes de repetir, findCommitmentOperation confere se ela foi gravada.
 */
export function useReturnWriter() {
  const repo = useRepo();
  const qc = useQueryClient();
  const createOcc = useCreateSeriesOccurrence();
  const pay = usePayCommitment();
  const updateRecord = useUpdateRecord();
  const remove = useDeleteCommitment();
  const undo = useUndoCommitmentPayment();
  const skipYear = useSkipSeriesYear();
  const decide = useDecideReturnReview();

  const creates = useRef(new Map<string, CreateSlot>());
  const pays = useRef(new Map<string, PaySlot>());
  const removes = useRef(new Map<string, string>());
  const undos = useRef(new Map<string, string>());
  const skips = useRef(new Map<string, { key: string; snapshot: string }>());
  const decision = useRef<{ key: string; snapshot: string } | null>(null);
  /** Conta criada por "Já paguei" cujo pagamento ainda não foi confirmado (falha parcial): "Salvar de novo" só paga. */
  const createdFor = useRef(new Map<string, Commitment>());

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['commitments'] });
    qc.invalidateQueries({ queryKey: ['commitment'] });
    qc.invalidateQueries({ queryKey: ['records'] });
    qc.invalidateQueries({ queryKey: ['series'] });
    qc.invalidateQueries({ queryKey: ['returnReview'] });
  };

  /**
   * Conta do número da linha (create_series_occurrence). Resultado incerto antes: findCommitmentOperation(chave)
   * recupera a conta gravada; se nada foi gravado, repete com a mesma chave e os mesmos argumentos.
   */
  const createOccurrence = async (row: ReviewRow, mode: OccurrenceMode): Promise<Commitment | null> => {
    if (!row.series || row.seriesVersion === null) throw new Error('linha_sem_serie');
    const slotKey = `${row.key}|${mode}`;
    const slot: CreateSlot = creates.current.get(slotKey) ?? {
      key: newOperationKey(),
      args: { seriesId: row.series.id, seriesVersion: row.seriesVersion, number: row.series.number, mode },
      uncertain: false,
    };
    creates.current.set(slotKey, slot);
    if (slot.uncertain) {
      const op = await repo.findCommitmentOperation(slot.key);
      if (op && op.action === 'criar_ocorrencia') {
        refresh();
        creates.current.delete(slotKey);
        // "Não houve": a conta foi gravada já excluída (a visão não a mostra); nada mais a ler.
        if (mode === 'nao_houve') return null;
        const c = await repo.getCommitment(op.commitmentId);
        if (!c) throw new Error('conta_nao_encontrada');
        return c;
      }
    }
    try {
      const w = await createOcc.mutateAsync({ key: slot.key, ...slot.args });
      creates.current.delete(slotKey);
      return w.commitment;
    } catch (e) {
      if (isUncertain(e)) {
        slot.uncertain = true;
        refresh();
      } else {
        creates.current.delete(slotKey);
        // Algo mudou em outro aparelho: a revisão e as listas recarregam.
        if (isConflict(e)) refresh();
      }
      throw e;
    }
  };

  /**
   * Pagamento de uma conta em aberto (usePayOnce de Contas vencidas): depois de uma falha de rede, confere se alguma
   * tentativa foi gravada; se foi e o conteúdo mudou, edita o gasto gerado. Nunca há um segundo pagamento.
   */
  const payCommitment = async (c: Commitment, input: PaymentInput): Promise<Commitment> => {
    const snapshot = JSON.stringify([input, c.version]);
    const slot = pays.current.get(c.id) ?? { key: newOperationKey(), pending: [] };
    if (slot.pending.length > 0) {
      for (const attempt of [...slot.pending].reverse()) {
        const op = await repo.findCommitmentOperation(attempt.key);
        if (!op || op.action !== 'pagar_compromisso' || !op.recordId) continue;
        refresh();
        const expense = await repo.getRecord(op.recordId);
        if (expense && attempt.snapshot !== snapshot) {
          await updateRecord.mutateAsync({
            key: newOperationKey(),
            id: expense.id,
            version: expense.version,
            input: { accountId: input.accountId, amountCents: input.amountCents, occurredOn: input.paidOn, description: expense.description, category: input.category },
          });
        }
        pays.current.delete(c.id);
        const current = await repo.getCommitment(c.id);
        if (!current) throw new Error('conta_nao_encontrada');
        return current;
      }
      // Nada foi gravado: repetir com a mesma chave só se o conteúdo é o mesmo da última tentativa.
      if (slot.pending[slot.pending.length - 1]!.snapshot !== snapshot) slot.key = newOperationKey();
    }
    try {
      const w = await pay.mutateAsync({ key: slot.key, id: c.id, version: c.version, input });
      pays.current.delete(c.id);
      return w.commitment;
    } catch (e) {
      if (isUncertain(e)) {
        slot.pending = [...slot.pending, { key: slot.key, snapshot }];
        pays.current.set(c.id, slot);
        refresh();
      } else {
        pays.current.delete(c.id);
        if (isConflict(e)) refresh();
      }
      throw e;
    }
  };

  return {
    /**
     * "Já paguei": em aberto, paga; sem conta registrada, registra a conta (K1) e paga (K2), em duas chamadas. Se a
     * segunda falhar, a conta fica em aberto (estado verdadeiro) e a próxima tentativa só paga.
     */
    payRow: async (row: ReviewRow, input: PaymentInput): Promise<Commitment> => {
      let target = row.commitment ?? createdFor.current.get(row.key) ?? null;
      if (!target) {
        try {
          target = await createOccurrence(row, 'aberta');
        } catch (e) {
          throw new PayRowError(e, null);
        }
        if (!target) throw new PayRowError(new Error('conta_nao_encontrada'), null);
        createdFor.current.set(row.key, target);
      }
      if (target.status === 'quitado') {
        createdFor.current.delete(row.key);
        return target;
      }
      try {
        const paid = await payCommitment(target, input);
        createdFor.current.delete(row.key);
        return paid;
      } catch (e) {
        throw new PayRowError(e, row.commitment ? null : target);
      }
    },
    /** Conta criada por "Já paguei" com o pagamento ainda não confirmado, se houver. */
    createdFor: (rowKey: string) => createdFor.current.get(rowKey) ?? null,
    /** "Ainda não paguei": registra a conta em aberto. */
    stillOpen: async (row: ReviewRow): Promise<Commitment> => {
      const c = await createOccurrence(row, 'aberta');
      if (!c) throw new Error('conta_nao_encontrada');
      return c;
    },
    /** "Não houve": sem conta, registra excluída só neste mês; em aberto, exclui só esta conta (não volta). */
    notHappened: async (row: ReviewRow): Promise<void> => {
      const c = row.commitment ?? createdFor.current.get(row.key) ?? null;
      if (!c) {
        await createOccurrence(row, 'nao_houve');
        return;
      }
      const key = removes.current.get(c.id) ?? newOperationKey();
      removes.current.set(c.id, key);
      try {
        await remove.mutateAsync({ key, id: c.id, version: c.version });
        removes.current.delete(c.id);
        createdFor.current.delete(row.key);
      } catch (e) {
        // Rede: repetir com a mesma chave é seguro; recusa: a próxima tentativa usa outra.
        if (!isUncertain(e)) removes.current.delete(c.id);
        throw e;
      }
    },
    /** "Desfazer" numa linha paga: exclui o gasto e reabre a conta. */
    undoPaid: async (c: Commitment): Promise<Commitment> => {
      const key = undos.current.get(c.id) ?? newOperationKey();
      undos.current.set(c.id, key);
      try {
        const w = await undo.mutateAsync({ key, id: c.id, version: c.version });
        undos.current.delete(c.id);
        return w.commitment;
      } catch (e) {
        if (!isUncertain(e)) undos.current.delete(c.id);
        throw e;
      }
    },
    /** Plano de "Não houve em 2027": todas as parcelas em aberto do ano (lista completa da série). */
    yearPlan: async (group: ReviewAnnualGroup, series: CommitmentSeries): Promise<YearPlan> => {
      const list = mergeOccurrences(await repo.listSeriesOccurrences(series.id), await repo.listOpenSeriesOccurrences(series.id));
      return affectedByYear(list, series, group.number, 'tirar');
    },
    /** "Não houve em 2027" (skip_series_year), com o conjunto confirmado no diálogo. */
    skipYear: async (group: ReviewAnnualGroup, plan: Extract<YearPlan, { ok: true }>): Promise<void> => {
      const snapshot = JSON.stringify([group.seriesId, group.number, plan.affected]);
      const prev = skips.current.get(group.key);
      const key = prev && prev.snapshot === snapshot ? prev.key : newOperationKey();
      skips.current.set(group.key, { key, snapshot });
      try {
        await skipYear.mutateAsync({ key, seriesId: group.seriesId, number: group.number, affected: plan.affected });
        skips.current.delete(group.key);
      } catch (e) {
        if (!isUncertain(e)) skips.current.delete(group.key);
        throw e;
      }
    },
    /**
     * "Seguir adiante" e "Concluir": grava só a decisão. Depois de uma falha de rede, o mesmo conteúdo vai com a mesma
     * chave (o banco devolve a marca gravada); outro conteúdo, com outra.
     */
    decide: async (v: { contextId: string; expectedVersion: number; reviewedThrough: IsoMonth; decision: ReturnDecision }) => {
      const snapshot = JSON.stringify([v.contextId, v.expectedVersion, v.reviewedThrough, v.decision]);
      const key = decision.current && decision.current.snapshot === snapshot ? decision.current.key : newOperationKey();
      decision.current = { key, snapshot };
      try {
        const mark = await decide.mutateAsync({ key, ...v });
        decision.current = null;
        return mark;
      } catch (e) {
        if (!isUncertain(e)) decision.current = null;
        throw e;
      }
    },
    busy:
      createOcc.isPending || pay.isPending || remove.isPending || undo.isPending || skipYear.isPending || decide.isPending || updateRecord.isPending,
  };
}

export type ReturnWriter = ReturnType<typeof useReturnWriter>;

/** Gasto anotado que a revisão usa no aviso de gasto solto (lista do mês da linha). */
export type MonthRecords = readonly FinancialRecord[];
