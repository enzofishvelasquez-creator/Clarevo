import { CRASH_REPORT_OPTIONS, buildProfileName, crashReportDsn, scrubBreadcrumb, scrubCrashEvent, scrubCrashPath, updateLabel } from '@clarevo/core';
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

import { APP_INFO } from '@/lib/app-info';

let started = false;

/**
 * Relatório de falhas no app de celular (D-093, `docs/46_RELATORIO_DE_FALHAS.md`): só com `EXPO_PUBLIC_SENTRY_DSN` nas variáveis do EAS;
 * sem ela, nada é iniciado nem enviado. Só os erros do JavaScript, sem a parte nativa do SDK (que não passaria pela limpeza). Antes de cada
 * envio, `scrubCrashEvent` tira tudo o que identifica a pessoa ou mostra um valor; dos rastros, só ficam as trocas de tela, com o caminho
 * limpo já ao entrar no escopo. Sem captura de tela, gravação, desempenho nem sessões.
 *
 * Teste com pessoas (16/11/2026): `environment` é o perfil do build (o canal do EAS Update, gravado no build e igual ao nome do perfil em
 * `eas.json`; fora de um build do EAS, "desconhecido"), `dist` é o número do build, e as marcas dizem o sistema, o modelo do aparelho e a
 * atualização em uso (`lib/app-info.native.ts`, nada da pessoa).
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
    ...(APP_INFO.build ? { dist: APP_INFO.build } : null),
    environment: buildProfileName(APP_INFO.profile),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
    beforeSend: (event) => scrubCrashEvent(event),
  });
  Sentry.setTags({
    sistema: APP_INFO.system ?? 'desconhecido',
    aparelho: APP_INFO.device ?? 'desconhecido',
    atualizacao: updateLabel(APP_INFO.updateId, APP_INFO.embedded),
  });
}

/**
 * Falha pega pela tela de erro do app inteiro (`components/route-error.tsx`): o erro pego por uma tela de erro do React não chega ao
 * relatório sozinho (não passa pelo tratamento global), então vai daqui, com a marca da tela (o caminho da rota, sem identificadores).
 */
export function reportError(error: unknown, screen?: string): void {
  if (!started) return;
  try {
    Sentry.captureException(error, { tags: { origem: 'tela-de-erro', ...(screen ? { tela: scrubCrashPath(screen) } : null) } });
  } catch {
    // O relatório nunca derruba a tela de erro.
  }
}
