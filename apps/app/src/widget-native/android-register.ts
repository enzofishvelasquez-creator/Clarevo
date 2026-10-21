import { registerWidgetTaskHandler } from 'react-native-android-widget';

import { widgetTaskHandler } from './android';

// Roda antes do app abrir (metro.config.js, só com CLAREVO_WIDGET=1): o Android desenha o widget com o aplicativo fechado, e para isso a
// tarefa em segundo plano precisa estar registrada assim que o pacote de JavaScript carrega, sem esperar a primeira tela.
registerWidgetTaskHandler(widgetTaskHandler);
