/**
 * Impressão digital nativa do app (`runtimeVersion` com a política `fingerprint`, EAS Update; `docs/50_ATUALIZACOES.md`).
 *
 * O build do EAS calcula a impressão digital duas vezes: antes do prebuild (o eas-cli, ao pedir o build) e depois dele (na máquina do
 * build). Se as duas forem diferentes, o build para ("Runtime version calculated on local machine not equal to runtime version calculated
 * during build"). A atualização publicada a cada merge (`.eas/workflows/atualizar-preview.yml`) é calculada como a primeira, sem prebuild.
 *
 * O plugin do widget (`plugins/with-widget-autolinking.js`) tira `expo-widgets` e `react-native-android-widget` da exclusão do autolinking
 * durante o prebuild. Sem este arquivo, os dois pacotes só entrariam na segunda conta: o build pararia e nenhuma atualização chegaria a
 * ele. Aqui os dois ficam fora das duas contas (as pastas deles e as linhas deles nas listas do autolinking), e as contas ficam iguais
 * (conferido com o prebuild em 16/11/2026). Ligar ou desligar o widget continua mudando a impressão digital, pela configuração do app: com
 * CLAREVO_WIDGET=1 os plugins do widget entram em `plugins` (`widget.config.js`).
 *
 * JavaScript puro e sem dependências, como `widget.config.js`: quem lê é o `@expo/fingerprint` (pelo `expo-updates` e pelo EAS).
 */
const { NATIVE_PACKAGES } = require('./widget.config');

/** As listas do autolinking que entram na impressão digital (módulos do Expo e do React Native, Android e iPhone). */
const AUTOLINKING = /^(expoAutolinkingConfig|rncoreAutolinkingConfig):(android|ios)$/;

/** A lista do autolinking sem os pacotes do widget: `modules` (Expo) é uma lista; a do React Native, um objeto pelo nome do pacote. */
function withoutWidgetPackages(contents) {
  let config;
  try {
    config = JSON.parse(contents);
  } catch {
    return contents;
  }
  if (!config || typeof config !== 'object') return contents;
  if (Array.isArray(config.modules)) {
    config.modules = config.modules.filter((m) => !(m && NATIVE_PACKAGES.includes(m.packageName)));
  } else {
    for (const name of NATIVE_PACKAGES) delete config[name];
  }
  return JSON.stringify(config);
}

/** @type {import('expo/fingerprint').Config} */
module.exports = {
  ignorePaths: NATIVE_PACKAGES.map((name) => `**/node_modules/${name}/**`),
  fileHookTransform(source, chunk) {
    if (source.type !== 'contents' || !AUTOLINKING.test(source.id) || chunk == null) return chunk;
    return withoutWidgetPackages(String(chunk));
  },
  withoutWidgetPackages,
};
