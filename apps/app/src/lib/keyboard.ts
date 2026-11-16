import { Platform, type KeyboardAvoidingViewProps } from 'react-native';

/**
 * Como os formulários e os diálogos com campo fogem do teclado (`KeyboardAvoidingView`). No iPhone, 'padding', como sempre. No Android,
 * também 'padding': o app desenha de ponta a ponta (edge-to-edge, obrigatório no Android 15 e no React Native 0.86), então a janela não
 * encolhe mais quando o teclado abre, e sem isso o teclado cobria os campos de baixo e o rodapé fixo com "Salvar". Onde a janela ainda
 * encolhe, o próprio KeyboardAvoidingView mede que o teclado já não cobre nada e não soma espaço. Na web, nada: o navegador cuida.
 */
export const KEYBOARD_BEHAVIOR: KeyboardAvoidingViewProps['behavior'] = Platform.OS === 'web' ? undefined : 'padding';
