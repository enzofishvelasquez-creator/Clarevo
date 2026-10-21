// Metro do app. Mudanças em relação ao padrão do Expo:
// 1. `lucide-react-native` vira `src/lib/lucide.ts`, que traz só os ícones usados (o pacote inteiro põe 1.867 ícones no pacote web e no do
//    aparelho). Veja docs/19_ACESSIBILIDADE_E_DESEMPENHO.md.
// 2. Widget nativo (D-063 item 3, Ciclo AA, docs/21_WIDGET_NATIVO.md): desligado por padrão. Sem CLAREVO_WIDGET=1, tudo o que está em
//    `src/widget-native` vira um módulo vazio (nenhum código do `expo-widgets`, do `@expo/ui/swift-ui` nem do `react-native-android-widget`
//    entra no pacote de JavaScript, e a ponte `src/lib/widget-bridge.*` cai no "sem widget"). Com a variável, no Android, a tarefa em
//    segundo plano do widget é registrada antes do app abrir: o Android desenha o widget com o aplicativo fechado, e o pacote de JavaScript
//    carrega sem renderizar nenhuma tela. O `main` do package.json (`expo-router/entry`) não muda: o ponto de entrada do expo-router
//    importa `expo-router/build/qualified-entry`, e só esse import, só no Android e só com a variável, vai para `android-entry.ts`
//    (`android-register.ts` e depois o mesmo `App`).
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const { widgetEnabled } = require('./widget.config');

const config = getDefaultConfig(__dirname);
const icons = path.join(__dirname, 'src', 'lib', 'lucide.ts');
const widgetNative = path.join(__dirname, 'src', 'widget-native') + path.sep;
const androidEntry = path.join(widgetNative, 'android-entry.ts');
const withWidget = widgetEnabled();
const resolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'lucide-react-native') return { type: 'sourceFile', filePath: icons };
  if (
    withWidget &&
    platform === 'android' &&
    moduleName === 'expo-router/build/qualified-entry' &&
    /[\\/]expo-router[\\/]entry-classic\.js$/.test(context.originModulePath)
  ) {
    return { type: 'sourceFile', filePath: androidEntry };
  }
  const resolution = resolveRequest ? resolveRequest(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
  if (!withWidget && resolution.type === 'sourceFile' && resolution.filePath.startsWith(widgetNative)) return { type: 'empty' };
  return resolution;
};

module.exports = config;
