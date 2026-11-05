/**
 * Leitura de imagem no Android (D-078 B): o `expo-text-extractor` usa o ML Kit do Google pelo Google Play services, que baixa o
 * modelo de texto na primeira vez. Esta marca no AndroidManifest pede o download junto com a instalação do app, para a primeira
 * leitura já funcionar. A leitura acontece no aparelho; a marca não muda nada no iPhone (lá, quem lê é o Apple Vision, do sistema).
 * JavaScript puro, lido por quem avalia a configuração do app (o EAS e o `expo prebuild`).
 *
 * O `expo-camera` declara a mesma marca no manifesto dele, com o leitor de códigos (`barcode_ui`). Dois valores diferentes param a
 * junção dos manifestos no build ("Manifest merger failed"), então a marca do app lista os dois modelos, separados por vírgula, e
 * substitui a da biblioteca (`tools:replace`). `packages/core/test/lojas.test.ts` confere que todo modelo do `expo-camera` está aqui.
 */
const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

const NOME = 'com.google.mlkit.vision.DEPENDENCIES';
const MODELOS = ['barcode_ui', 'ocr'];

module.exports = function withLeituraImagem(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    manifest.$ = { ...manifest.$, 'xmlns:tools': manifest.$?.['xmlns:tools'] ?? 'http://schemas.android.com/tools' };
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(application, NOME, MODELOS.join(','));
    const item = application['meta-data'].find((m) => m.$['android:name'] === NOME);
    item.$['tools:replace'] = 'android:value';
    return mod;
  });
};
