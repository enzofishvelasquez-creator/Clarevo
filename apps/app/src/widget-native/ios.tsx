import { WIDGET_NATIVE, type WidgetSnapshot } from '@clarevo/core';
import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  accessibilityElement,
  accessibilityLabel,
  background,
  clipShape,
  containerBackground,
  font,
  foregroundStyle,
  frame,
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
 * dela. Por isso as cores estão escritas aqui dentro (as das duas paletas do app, `src/theme/palettes.ts`) e o endereço é montado com o esquema
 * `clarevo:/` + rota (o mesmo que `widgetUrl`, do núcleo; um teste confere). Sem comentário dentro da função, porque ela vira texto.
 *
 * Antes da primeira gravação (galeria de widgets, widget recém-adicionado) `props` vem vazio: o widget mostra só o nome, "Clarevo", e abre o app.
 *
 * Visual de 16/11/2026 (docs/21_WIDGET_NATIVO.md, seção 9), alinhado ao do Android onde sai barato: o "+" lima com o sinal escuro no
 * pequeno, o visto lima no mês sem nada em aberto, o médio no tema do aparelho (superfície azul-marinho e texto claro no escuro, as cores de
 * `palettes.ts`) e as vencidas sem cor de alerta. O símbolo C da marca fica de fora no iPhone por enquanto: a extensão só desenha imagem que
 * esteja no catálogo dela, e pôr o símbolo lá pede um passo de build que ainda não existe. Também não há atalho separado de anotar no médio:
 * o widget inteiro abre Contas a pagar, e o pequeno é o atalho.
 */
const ClarevoWidget = (props: WidgetSnapshot, environment: WidgetEnvironment) => {
  'widget';
  const dark = environment.colorScheme === 'dark';
  const BRAND = '#2457F5';
  const ON_BRAND = '#FFFFFF';
  const ACCENT = '#D4F05B';
  const ON_ACCENT = '#17223B';
  const TEXT = dark ? '#EEF2FB' : '#17223B';
  const SECONDARY = dark ? '#A7B4D2' : '#4B5873';
  const SURFACE = dark ? '#1D2B54' : '#FFFFFF';
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
          <HStack>
            <Spacer />
            <Image systemName="plus" size={20} color={ON_ACCENT} modifiers={[frame({ width: 44, height: 44 }), background(ACCENT), clipShape('circle')]} />
          </HStack>
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
          <HStack spacing={10} modifiers={[padding({ top: 4 })]}>
            {medium.state === 'vazio' ? (
              <Image systemName="checkmark" size={14} color={ON_ACCENT} modifiers={[frame({ width: 30, height: 30 }), background(ACCENT), clipShape('circle')]} />
            ) : null}
            <Text modifiers={[font({ textStyle: 'subheadline', weight: 'semibold' }), foregroundStyle(TEXT), lineLimit(3)]}>{medium.message}</Text>
          </HStack>
        ) : null}
        <Spacer />
      </VStack>
      <Spacer />
    </HStack>
  );
};

export default createWidget<WidgetSnapshot>(WIDGET_NATIVE.ios, ClarevoWidget);
