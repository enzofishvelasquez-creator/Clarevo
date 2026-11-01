/**
 * Leitura de imagem no Android (D-078 B): o `expo-text-extractor` usa o ML Kit do Google pelo Google Play services, que baixa o
 * modelo de texto na primeira vez. Esta marca no AndroidManifest pede o download junto com a instalação do app, para a primeira
 * leitura já funcionar. A leitura acontece no aparelho; a marca não muda nada no iPhone (lá, quem lê é o Apple Vision, do sistema).
 * JavaScript puro, lido por quem avalia a configuração do app (o EAS e o `expo prebuild`).
 */
const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

module.exports = function withLeituraImagem(config) {
  return withAndroidManifest(config, (mod) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(application, 'com.google.mlkit.vision.DEPENDENCIES', 'ocr');
    return mod;
  });
};
