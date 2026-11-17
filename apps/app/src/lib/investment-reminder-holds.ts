import {
  INVESTMENT_REMINDER_TEXT,
  pauseReminder,
  reminderHoldState,
  resumeReminder,
  snoozeReminder,
  type InvestmentReminderHolds,
  type InvestmentReminderKind,
  type ReminderHoldState,
} from '@clarevo/core';
import { useEffect } from 'react';

import { getPrefs, loadPrefs, updatePrefs, useDevicePrefs } from '@/lib/device-prefs';
import { useSession } from '@/state/session';

const NO_HOLDS: InvestmentReminderHolds = {};

/**
 * Adiar e pausar os lembretes dos investimentos (D-104, item 6): lê e grava a escolha só neste aparelho (lib/device-prefs.ts). Na
 * demonstração, vale enquanto a página estiver aberta. Mudar a escolha reagenda os avisos (components/device-features.tsx). Cada ação
 * devolve a frase de confirmação para a tela mostrar.
 */
export function useInvestmentReminderHolds() {
  const { user, auth, today } = useSession();
  const userId = user?.id;
  const persist = auth.mode !== 'demo';
  const prefs = useDevicePrefs(userId);
  useEffect(() => {
    if (userId) loadPrefs(userId, persist);
  }, [userId, persist]);
  const holds = prefs?.investmentReminderHolds ?? NO_HOLDS;
  const write = (next: InvestmentReminderHolds) => {
    if (userId) updatePrefs(userId, { investmentReminderHolds: next }, persist);
  };
  const current = () => (userId ? (getPrefs(userId)?.investmentReminderHolds ?? NO_HOLDS) : NO_HOLDS);
  return {
    holds,
    ready: prefs !== undefined,
    state: (kind: InvestmentReminderKind): ReminderHoldState => reminderHoldState(holds, kind, today),
    snooze: (kind: InvestmentReminderKind): string => {
      const next = snoozeReminder(current(), kind, today);
      write(next);
      return INVESTMENT_REMINDER_TEXT.snoozed(next[kind]!.snoozedUntil!);
    },
    pause: (kind: InvestmentReminderKind): string => {
      const next = pauseReminder(current(), kind, today);
      write(next);
      return INVESTMENT_REMINDER_TEXT.paused(next[kind]!.pausedUntil!);
    },
    resume: (kind: InvestmentReminderKind): string => {
      write(resumeReminder(current(), kind));
      return INVESTMENT_REMINDER_TEXT.resumed;
    },
  };
}
