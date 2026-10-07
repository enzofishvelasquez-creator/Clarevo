import {
  DEMO_CONTEXTS,
  DEMO_EVENTS,
  DEMO_MONTH,
  DEMO_USER_ID,
  Ledger,
  expenseFromDraft,
  summarizeMonth,
  validateExpenseDraft,
  type ExpenseDraft,
  type FieldErrors,
  type FinancialContext,
  type FinancialEvent,
  type MonthSummary,
} from '@clarevo/core';
import { createContext, use, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';

/**
 * Estado do protótipo: eventos FICTÍCIOS em memória, usando as mesmas regras do pacote @clarevo/core.
 * Próximo passo: trocar o Ledger em memória por chamadas ao Supabase (RLS já testada em supabase/tests).
 */
type SaveResult = { ok: true; event: FinancialEvent; duplicate: boolean } | { ok: false; errors: FieldErrors };

interface FinanceState {
  contexts: FinancialContext[];
  activeContext: FinancialContext;
  setActiveContext: (id: string) => void;
  month: string;
  events: readonly FinancialEvent[];
  summary: MonthSummary;
  summaryFor: (contextId: string) => MonthSummary;
  saveExpense: (draft: ExpenseDraft) => SaveResult;
  removeEvent: (id: string) => void;
}

const FinanceContext = createContext<FinanceState | null>(null);

let seq = 0;
export const newKey = () => `form-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function FinanceProvider({ children }: { children: ReactNode }) {
  const ledger = useRef(new Ledger(DEMO_EVENTS)).current;
  const [events, setEvents] = useState<readonly FinancialEvent[]>(ledger.all());
  const [activeId, setActiveId] = useState(DEMO_CONTEXTS[0]!.id);

  const summaryFor = useCallback((contextId: string) => summarizeMonth(events, contextId, DEMO_MONTH), [events]);

  const saveExpense = useCallback(
    (draft: ExpenseDraft): SaveResult => {
      const v = validateExpenseDraft(draft);
      if (!v.ok) return v;
      const now = new Date().toISOString();
      const { event, created } = ledger.add(
        expenseFromDraft(draft, v.amountCents, { id: `ev-${draft.idempotencyKey}`, createdBy: DEMO_USER_ID, now }),
      );
      setEvents(ledger.all());
      return { ok: true, event, duplicate: !created };
    },
    [ledger],
  );

  const removeEvent = useCallback(
    (id: string) => {
      ledger.remove(id, new Date().toISOString());
      setEvents(ledger.all());
    },
    [ledger],
  );

  const value = useMemo<FinanceState>(() => {
    const activeContext = DEMO_CONTEXTS.find((c) => c.id === activeId)!;
    return {
      contexts: DEMO_CONTEXTS,
      activeContext,
      setActiveContext: setActiveId,
      month: DEMO_MONTH,
      events,
      summary: summaryFor(activeId),
      summaryFor,
      saveExpense,
      removeEvent,
    };
  }, [activeId, events, summaryFor, saveExpense, removeEvent]);

  return <FinanceContext value={value}>{children}</FinanceContext>;
}

export function useFinance() {
  const ctx = use(FinanceContext);
  if (!ctx) throw new Error('useFinance fora do FinanceProvider');
  return ctx;
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function monthLabel(isoMonth: string) {
  const [y, m] = isoMonth.split('-');
  const name = MONTHS[Number(m) - 1] ?? '';
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${y}`;
}

export function shortDate(iso?: string) {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return `${Number(d)} ${(MONTHS[Number(m) - 1] ?? '').slice(0, 3)}`;
}
