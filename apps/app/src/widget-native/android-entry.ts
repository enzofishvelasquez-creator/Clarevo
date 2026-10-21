// Só no Android e só com CLAREVO_WIDGET=1 (metro.config.js): este módulo toma o lugar de `expo-router/build/qualified-entry` no ponto de
// entrada do expo-router. Registra a tarefa em segundo plano do widget (o Android desenha o widget com o app fechado) e devolve o mesmo
// `App`, de modo que o app abre como sempre.
import './android-register';

export { App } from 'expo-router/build/qualified-entry';
