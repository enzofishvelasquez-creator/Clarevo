import { CRASH_REPORT_OPTIONS, crashReportDsn, scrubCrashEvent } from '@clarevo/core';
import * as Sentry from '@sentry/react-native';

let started = false;

/**
 * Relatório de falhas no app de celular (D-093, `docs/46_RELATORIO_DE_FALHAS.md`): só com `EXPO_PUBLIC_SENTRY_DSN` nas variáveis do EAS;
 * sem ela, nada é iniciado nem enviado. Antes de cada envio, `scrubCrashEvent` tira tudo o que identifica a pessoa ou mostra um valor; dos
 * rastros, só ficam as trocas de tela, com o caminho limpo. Sem captura de tela, gravação, desempenho nem sessões.
 */
export function initCrashReport(): void {
  if (started) return;
  const dsn = crashReportDsn(process.env.EXPO_PUBLIC_SENTRY_DSN);
  if (!dsn) return;
  started = true;
  Sentry.init({
    dsn,
    ...CRASH_REPORT_OPTIONS,
    beforeBreadcrumb: (breadcrumb) => (breadcrumb.category === 'navigation' ? breadcrumb : null),
    beforeSend: (event) => scrubCrashEvent(event),
  });
}
