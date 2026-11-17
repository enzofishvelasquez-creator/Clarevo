import type { AppReportInfo } from '@clarevo/core';
import Constants from 'expo-constants';

/**
 * O que o app sabe de si e do aparelho, para a versão em Conta, o e-mail de sugestão ou problema e o relatório de falhas (nada da pessoa).
 * Na web: só a versão do app. Sem build, sem atualização pelo ar (a web é publicada inteira) e sem modelo de aparelho; esta versão não
 * importa `expo-updates` nem `expo-application`, que só entram no celular (`app-info.native.ts`).
 */
export const APP_INFO: Readonly<AppReportInfo> & { native: boolean } = {
  native: false,
  version: Constants.expoConfig?.version ?? null,
  build: null,
  updateId: null,
  embedded: true,
  profile: null,
  system: 'Navegador',
  device: null,
};
