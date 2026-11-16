import { deviceLabel, systemLabel, type AppReportInfo } from '@clarevo/core';
import * as Application from 'expo-application';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

/**
 * O que o app sabe de si e do aparelho, para a versão em Conta, o e-mail de sugestão ou problema e o relatório de falhas (nada da pessoa).
 * No celular: versão e número do build gravados no próprio build (`expo-application`), a atualização pelo ar em uso e o canal do build
 * (`expo-updates`; o canal tem o nome do perfil de `eas.json` e, como a versão, não muda com uma atualização), o sistema e o modelo do
 * aparelho (`Platform`; no iPhone, só "iPhone" ou "iPad", nunca o nome que a pessoa deu ao aparelho). Lido uma vez: nada disso muda
 * enquanto o app está aberto. Veja `docs/50_ATUALIZACOES.md`.
 */
export const APP_INFO: Readonly<AppReportInfo> & { native: boolean } = {
  native: true,
  version: Application.nativeApplicationVersion,
  build: Application.nativeBuildVersion,
  updateId: Updates.updateId,
  embedded: Updates.isEmbeddedLaunch,
  profile: Updates.channel || null,
  system: systemLabel(Platform.OS, Platform.Version, Platform.constants),
  device: deviceLabel(Platform.OS, Platform.constants),
};
