/**
 * Relatório de falhas (D-093): na web não há relatório (o SDK nem entra no pacote da web). A versão do celular está em
 * `crash-report.native.ts`.
 */
export function initCrashReport(): void {}

/** Falha pega pela tela de erro do app inteiro (`components/route-error.tsx`): na web, nada é enviado. */
export function reportError(_error: unknown, _screen?: string): void {}
