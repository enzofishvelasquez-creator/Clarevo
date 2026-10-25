/**
 * Widget nativo da tela inicial (D-063 item 3, Ciclo AA): preparado e DESLIGADO por padrão.
 *
 * Só `CLAREVO_WIDGET=1` liga. Ligado, a configuração do app ganha os plugins do widget (iOS: `expo-widgets`, uma extensão WidgetKit com
 * App Group; Android: `react-native-android-widget`, um receptor de AppWidget) e o `package.json` deixa de excluir os dois pacotes do
 * autolinking. Desligado (o caso de todo build de hoje, `preview` e `production`), nada muda: a configuração devolvida é a de `app.json`,
 * sem plugin, sem permissão e sem pacote nativo a mais, e o Metro troca a pasta `src/widget-native` por módulos vazios.
 * O perfil `preview-widget` de `eas.json` é o que liga a variável. Passo a passo: `docs/21_WIDGET_NATIVO.md`.
 *
 * Este arquivo é JavaScript puro (sem TypeScript, sem dependências) porque o lê quem avalia a configuração (`app.config.js`), o Metro
 * (`metro.config.js`), o plugin local e os testes do núcleo (`packages/core/test/widget-config.test.ts`).
 * Nada aqui guarda chave, segredo ou identificador de conta: o grupo do iOS sai do `ios.bundleIdentifier` do próprio app.json.
 */

const FLAG = 'CLAREVO_WIDGET';

/** O widget só liga com a variável exatamente igual a "1". Qualquer outro valor (ou nenhum) deixa tudo como era. */
function widgetEnabled(env = process.env) {
  return env[FLAG] === '1';
}

/**
 * Pacotes nativos só do widget. Ficam instalados, mas fora do autolinking (`expo.autolinking.exclude` do package.json do app) até a
 * variável ligar: sem isso o módulo `ExpoWidgets` (iOS e Android) e o provedor de imagens da biblioteca do Android (um `<provider>`
 * exportado no manifesto) entrariam em todo build. O `@expo/ui` não está aqui de propósito: o expo-router já o liga hoje.
 */
const NATIVE_PACKAGES = ['expo-widgets', 'react-native-android-widget'];

/** Nomes combinados com `packages/core/src/widget-sync.ts` (`WIDGET_NATIVE`); um teste confere que são os mesmos. */
const NAMES = { ios: 'ClarevoWidget', androidSmall: 'ClarevoAnotar', androidMedium: 'ClarevoAPagar' };

/** O mesmo texto de `WIDGET_TEXT.explain`, do núcleo. */
const DESCRIPTION = 'Mostra quanto ainda falta pagar no mês e a próxima conta a vencer, com um atalho para anotar um gasto.';

/** Plugin local: tira os dois pacotes de `expo.autolinking.exclude` no projeto em que o build do widget roda. */
const AUTOLINKING_PLUGIN = './plugins/with-widget-autolinking';

/** Os plugins do widget, na ordem em que entram no fim de `plugins`. */
function widgetPlugins() {
  return [
    [
      'expo-widgets',
      {
        widgets: [
          {
            name: NAMES.ios,
            displayName: 'Clarevo',
            description: DESCRIPTION,
            ios: { supportedFamilies: ['systemSmall', 'systemMedium'] },
            // O Android usa react-native-android-widget; o widget do expo-widgets para Android ainda é experimental.
            android: null,
          },
        ],
      },
    ],
    [
      'react-native-android-widget',
      {
        widgets: [
          {
            name: NAMES.androidSmall,
            label: 'Anotar gasto',
            description: 'Abre o app da Clarevo direto no formulário de gasto.',
            minWidth: '110dp',
            minHeight: '110dp',
            targetCellWidth: 2,
            targetCellHeight: 2,
            resizeMode: 'none',
            // Só a tela inicial: a tela de bloqueio do Android (versões novas e tablets) fica de fora até a conferência de docs/21.
            widgetCategory: 'home_screen',
          },
          {
            name: NAMES.androidMedium,
            label: 'Ainda a pagar',
            description: DESCRIPTION,
            minWidth: '250dp',
            minHeight: '110dp',
            targetCellWidth: 4,
            targetCellHeight: 2,
            resizeMode: 'horizontal',
            widgetCategory: 'home_screen',
            // O mínimo do Android: 30 minutos. É o que faz o widget mostrar "Abra o Clarevo para atualizar" depois da virada do dia.
            updatePeriodMillis: 30 * 60 * 1000,
          },
        ],
      },
    ],
    AUTOLINKING_PLUGIN,
  ];
}

/**
 * A configuração do app. Desligado, devolve a MESMA configuração recebida (o conteúdo de app.json), sem copiar nem acrescentar nada.
 * Ligado, acrescenta os plugins do widget ao fim de `plugins` e mais nada.
 */
function withWidget(config, env = process.env) {
  if (!widgetEnabled(env)) return config;
  return { ...config, plugins: [...(config.plugins ?? []), ...widgetPlugins()] };
}

/**
 * Tira `NATIVE_PACKAGES` de `expo.autolinking.exclude` do conteúdo de um package.json. Devolve o novo conteúdo e se algo mudou; quando a
 * lista de exclusão fica vazia, a chave e os níveis vazios acima dela saem também.
 */
function liftAutolinkingExclusion(pkg) {
  const exclude = pkg && pkg.expo && pkg.expo.autolinking && pkg.expo.autolinking.exclude;
  if (!Array.isArray(exclude)) return { pkg, changed: false };
  const kept = exclude.filter((name) => !NATIVE_PACKAGES.includes(name));
  if (kept.length === exclude.length) return { pkg, changed: false };
  const autolinking = { ...pkg.expo.autolinking };
  if (kept.length > 0) autolinking.exclude = kept;
  else delete autolinking.exclude;
  const expo = { ...pkg.expo };
  if (Object.keys(autolinking).length > 0) expo.autolinking = autolinking;
  else delete expo.autolinking;
  const next = { ...pkg };
  if (Object.keys(expo).length > 0) next.expo = expo;
  else delete next.expo;
  return { pkg: next, changed: true };
}

module.exports = {
  FLAG,
  NATIVE_PACKAGES,
  NAMES,
  DESCRIPTION,
  AUTOLINKING_PLUGIN,
  widgetEnabled,
  widgetPlugins,
  withWidget,
  liftAutolinkingExclusion,
};
