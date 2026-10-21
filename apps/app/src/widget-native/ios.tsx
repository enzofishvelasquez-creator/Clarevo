import { WIDGET_NATIVE, type WidgetSnapshot } from '@clarevo/core';
import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  accessibilityElement,
  accessibilityLabel,
  containerBackground,
  font,
  foregroundStyle,
  lineLimit,
  minimumScaleFactor,
  padding,
  privacySensitive,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

/**
 * Widget da tela inicial do iOS (D-063 item 3, Ciclo AA): uma extensão WidgetKit nos tamanhos pequeno e médio, criada por `expo-widgets`
 * (App Group `group.<bundleIdentifier>`, derivado do `ios.bundleIdentifier` de app.json, nunca escrito aqui). Só entra no app com
 * `CLAREVO_WIDGET=1`; sem a variável o Metro troca este arquivo por um módulo vazio (`metro.config.js`).
 *
 * O widget só DESENHA. Todo texto, valor, rota e estado vêm prontos no `WidgetSnapshot` que o app grava (`planWidgetSync`, no núcleo): nenhuma
 * regra financeira, nenhum cálculo de data e nenhum texto próprio existe aqui. A virada do dia vem da linha do tempo: o app grava duas
 * entradas, o snapshot de hoje e, à meia-noite do aparelho, o estado "Abra o Clarevo para atualizar" (`afterMidnight`).
 *
 * Regras do `expo-widgets` para esta função: o componente roda sozinho dentro da extensão, só com os componentes e modificadores de
 * `@expo/ui/swift-ui` (sem alias, os nomes importados são os da extensão), sem hooks, sem importar nada e sem usar nada declarado fora
 * dela. Por isso as cores estão escritas aqui dentro (os tokens do app, `src/theme/tokens.ts`) e o endereço é montado com o esquema
 * `clarevo:/` + rota (o mesmo que `widgetUrl`, do núcleo; um teste confere). Sem comentário dentro da função, porque ela vira texto.
 *
 * Antes da primeira gravação (galeria de widgets, widget recém-adicionado) `props` vem vazio: o widget mostra só o nome, "Clarevo", e abre o app.
 */
const ClarevoWidget = (props: WidgetSnapshot, environment: WidgetEnvironment) => {
  'widget';
  const BRAND = '#2457F5';
  const ON_BRAND = '#FFFFFF';
  const TEXT = '#17223B';
  const SECONDARY = '#4B5873';
  const SURFACE = '#FFFFFF';
  const open = (route: string) => 'clarevo:/' + route;

  if (!props || !props.small || !props.medium) {
    return (
      <VStack modifiers={[containerBackground(BRAND, 'widget'), widgetURL('clarevo://')]}>
        <Text modifiers={[font({ textStyle: 'title3', weight: 'bold' }), foregroundStyle(ON_BRAND)]}>Clarevo</Text>
      </VStack>
    );
  }

  if (environment.widgetFamily === 'systemSmall') {
    const small = props.small;
    return (
      <HStack modifiers={[containerBackground(BRAND, 'widget'), widgetURL(open(small.route)), accessibilityElement('ignore'), accessibilityLabel(small.a11y)]}>
        <VStack alignment="leading" spacing={8}>
          <Image systemName="plus.circle.fill" size={28} color={ON_BRAND} />
          <Spacer />
          <Text modifiers={[font({ textStyle: 'headline', weight: 'bold' }), foregroundStyle(ON_BRAND), lineLimit(2)]}>{small.label}</Text>
        </VStack>
        <Spacer />
      </HStack>
    );
  }

  const medium = props.medium;
  return (
    <HStack modifiers={[containerBackground(SURFACE, 'widget'), widgetURL(open(medium.route)), accessibilityElement('ignore'), accessibilityLabel(medium.a11y)]}>
      <VStack alignment="leading" spacing={4}>
        {medium.title ? (
          <Text modifiers={[font({ textStyle: 'footnote', weight: 'semibold' }), foregroundStyle(SECONDARY), lineLimit(1)]}>{medium.title}</Text>
        ) : null}
        {medium.value ? (
          <Text modifiers={[font({ textStyle: 'title', weight: 'heavy' }), foregroundStyle(TEXT), lineLimit(1), minimumScaleFactor(0.7), privacySensitive()]}>
            {medium.value}
          </Text>
        ) : null}
        {medium.next ? (
          <Text modifiers={[font({ textStyle: 'subheadline', weight: 'medium' }), foregroundStyle(TEXT), lineLimit(2), minimumScaleFactor(0.8), privacySensitive()]}>
            {medium.next.line}
          </Text>
        ) : null}
        {medium.overdue ? (
          <Text modifiers={[font({ textStyle: 'footnote', weight: 'semibold' }), foregroundStyle(SECONDARY), lineLimit(1)]}>{medium.overdue}</Text>
        ) : null}
        {medium.message ? (
          <Text modifiers={[font({ textStyle: 'subheadline', weight: 'medium' }), foregroundStyle(TEXT), lineLimit(3), padding({ top: 2 })]}>{medium.message}</Text>
        ) : null}
        <Spacer />
      </VStack>
      <Spacer />
    </HStack>
  );
};

export default createWidget<WidgetSnapshot>(WIDGET_NATIVE.ios, ClarevoWidget);
