// Plugin local do widget do Android (D-093). Só entra na configuração com CLAREVO_WIDGET=1 (widget.config.js).
//
// O react-native-android-widget usa o WorkManager 2.8.1 (`androidx.work:work-runtime`). Outra biblioteca do app traz, por dependência,
// o `androidx.work:work-runtime-ktx` 2.7.1, que ainda tem as classes `OneTimeWorkRequestKt` e `PeriodicWorkRequestKt`; da 2.8.0 em
// diante elas ficam no próprio `work-runtime`. Com as duas versões juntas, a montagem do Android para em `checkReleaseDuplicateClasses`
// (build `preview` de 16/11/2026, docs/21_WIDGET_NATIVO.md).
//
// Este plugin acrescenta ao android/app/build.gradle uma restrição de versão (Gradle "constraints"): quando o `work-runtime-ktx` está no
// projeto, ele vem na mesma versão do `work-runtime` do widget, e as classes deixam de aparecer duas vezes. Uma restrição não traz
// biblioteca nenhuma: se nada usar o `work-runtime-ktx`, ela não faz nada. Um teste do núcleo confere que WORK_VERSION é a versão que o
// react-native-android-widget declara.
const { withAppBuildGradle } = require('expo/config-plugins');

const WORK_VERSION = '2.8.1';
const MARK = '// Clarevo: work-runtime-ktx na versao do work-runtime do widget (plugins/with-work-runtime.js)';

const BLOCK = `
${MARK}
dependencies {
    constraints {
        implementation("androidx.work:work-runtime-ktx:${WORK_VERSION}") {
            because("react-native-android-widget usa work-runtime ${WORK_VERSION}; o work-runtime-ktx 2.7.1 repete classes dele")
        }
    }
}
`;

/** Acrescenta o bloco ao fim do build.gradle do app, uma vez só (rodar o prebuild de novo não duplica). */
function addWorkConstraint(contents) {
  if (contents.includes(MARK)) return contents;
  return `${contents.replace(/\s*$/, '\n')}${BLOCK}`;
}

function withWorkRuntime(config) {
  return withAppBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language !== 'groovy') {
      throw new Error('with-work-runtime: o android/app/build.gradle não está em Groovy; ajuste o plugin.');
    }
    modConfig.modResults.contents = addWorkConstraint(modConfig.modResults.contents);
    return modConfig;
  });
}

module.exports = withWorkRuntime;
module.exports.WORK_VERSION = WORK_VERSION;
module.exports.MARK = MARK;
module.exports.addWorkConstraint = addWorkConstraint;
