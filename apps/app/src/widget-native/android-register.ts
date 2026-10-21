// Roda antes do app abrir (metro.config.js, só com CLAREVO_WIDGET=1): o Android desenha o widget com o aplicativo fechado, e para isso a
// tarefa em segundo plano precisa estar registrada assim que o pacote de JavaScript carrega, sem esperar a primeira tela.
//
// A biblioteca (e `./android`, que também a importa) é carregada dentro de um `try`: sem o módulo nativo (Expo Go, ou um build feito sem o
// widget) ela lança ao carregar, e um import comum fecharia o app antes da primeira tela. Sem o módulo, não há widget para desenhar e o app
// abre como sempre.
try {
  const { registerWidgetTaskHandler } = require('react-native-android-widget') as typeof import('react-native-android-widget');
  const { widgetTaskHandler } = require('./android') as typeof import('./android');
  registerWidgetTaskHandler(widgetTaskHandler);
} catch {
  // Sem widget neste aparelho: nada a registrar.
}
