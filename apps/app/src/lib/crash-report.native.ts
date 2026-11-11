import { CRASH_REPORT_OPTIONS, crashReportDsn, scrubBreadcrumb, scrubCrashEvent } from '@clarevo/core';
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

let started = false;

/**
 * Relatório de falhas no app de celular (D-093, `docs/46_RELATORIO_DE_FALHAS.md`): só com `EXPO_PUBLIC_SENTRY_DSN` nas variáveis do EAS;
 * sem ela, nada é iniciado nem enviado. Só os erros do JavaScript, sem a parte nativa do SDK (que não passaria pela limpeza). Antes de cada
 * envio, `scrubCrashEvent` tira tudo o que identifica a pessoa ou mostra um valor; dos rastros, só ficam as trocas de tela, com o caminho
 * limpo já ao entrar no escopo. Sem captura de tela, gravação, desempenho nem sessões.
 */
export function initCrashReport(): void {
  if (started) return;
  const dsn = crashReportDsn(process.env.EXPO_PUBLIC_SENTRY_DSN);
  if (!dsn) return;
  started = true;
  Sentry.init({
    dsn,
    ...CRASH_REPORT_OPTIONS,
    // Sem a parte nativa, a versão do app vai à mão (o SDK não a lê sozinho).
    release: `clarevo@${Constants.expoConfig?.version ?? 'desconhecida'}`,
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
    beforeSend: (event) => scrubCrashEvent(event),
  });
}
