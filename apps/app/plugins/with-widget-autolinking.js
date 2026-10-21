// Plugin local do widget (D-063 item 3, Ciclo AA). Só entra na configuração com CLAREVO_WIDGET=1 (widget.config.js).
//
// No package.json do app, `expo.autolinking.exclude` mantém `expo-widgets` e `react-native-android-widget` fora de todo build. Quando o
// build do widget roda o prebuild, este plugin tira esses dois nomes da lista, na cópia do projeto em que o prebuild está rodando (a
// máquina do EAS ou a pasta temporária de quem testa), antes de o autolinking do iOS (pod install) e do Android (Gradle) ler a lista.
// Se rodar o prebuild na própria pasta do repositório com a variável ligada, o package.json local muda: desfaça com
// `git checkout -- apps/app/package.json` quando terminar (docs/21_WIDGET_NATIVO.md).
const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod } = require('expo/config-plugins');

const { liftAutolinkingExclusion } = require('../widget.config');

function lift(projectRoot) {
  const file = path.join(projectRoot, 'package.json');
  const { pkg, changed } = liftAutolinkingExclusion(JSON.parse(fs.readFileSync(file, 'utf8')));
  if (changed) fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
}

module.exports = function withWidgetAutolinking(config) {
  for (const platform of ['ios', 'android']) {
    config = withDangerousMod(config, [
      platform,
      (modConfig) => {
        lift(modConfig.modRequest.projectRoot);
        return modConfig;
      },
    ]);
  }
  return config;
};
