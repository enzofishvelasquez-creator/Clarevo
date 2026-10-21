'use no memo';

import {
  WIDGET_NATIVE,
  deviceTimeZone,
  todayIn,
  widgetContentToday,
  widgetUrl,
  type WidgetContent,
} from '@clarevo/core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FlexWidget, TextWidget, requestWidgetUpdate, type WidgetTaskHandlerProps } from 'react-native-android-widget';

import { colors } from '@/theme/tokens';

/**
 * Widgets da tela inicial do Android (D-063 item 3, Ciclo AA), com `react-native-android-widget`: dois widgets, "Anotar gasto" (pequeno) e
 * "Ainda a pagar" (médio). Só entram no app com `CLAREVO_WIDGET=1`; sem a variável o Metro troca este arquivo por um módulo vazio.
 *
 * O widget só DESENHA o que o app gravou (`planWidgetSync`, no núcleo), com a conferência de data de `widgetContentToday`: em outro dia,
 * "Abra o Clarevo para atualizar". Nenhuma regra financeira existe aqui. O armazenamento compartilhado é o AsyncStorage: o widget é
 * desenhado pelo próprio JavaScript do app, em segundo plano (`widgetTaskHandler`, registrado antes do app abrir por `android-register.ts`),
 * e lê a mesma chave que o app grava (`WIDGET_NATIVE.storageKey`). Não há SharedPreferences próprias nem identificador de conta.
 *
 * 'use no memo' (acima): os widgets são funções chamadas direto pela biblioteca, sem hooks; o React Compiler os trocaria por versões com cache.
 */

type Small = WidgetContent['small'];
type Medium = WidgetContent['medium'];

export function SmallWidget({ small }: { small: Small }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: widgetUrl(small.route) }}
      accessibilityLabel={small.a11y}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 12,
        borderRadius: 20,
        backgroundColor: colors.brand,
      }}>
      <TextWidget text={small.label} maxLines={2} style={{ fontSize: 16, fontWeight: 'bold', color: colors.textOnBrand, textAlign: 'center' }} />
    </FlexWidget>
  );
}

export function MediumWidget({ medium }: { medium: Medium }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: widgetUrl(medium.route) }}
      accessibilityLabel={medium.a11y}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: 14,
        borderRadius: 20,
        backgroundColor: colors.surface,
      }}>
      {medium.title ? <TextWidget text={medium.title} maxLines={1} style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }} /> : null}
      {medium.value ? <TextWidget text={medium.value} maxLines={1} style={{ fontSize: 26, fontWeight: '800', color: colors.text }} /> : null}
      {medium.next ? <TextWidget text={medium.next.line} maxLines={2} style={{ fontSize: 13, fontWeight: '500', color: colors.text }} /> : null}
      {medium.overdue ? <TextWidget text={medium.overdue} maxLines={1} style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }} /> : null}
      {medium.message ? <TextWidget text={medium.message} maxLines={3} style={{ fontSize: 14, fontWeight: '500', color: colors.text }} /> : null}
    </FlexWidget>
  );
}

/** O widget de um nome, com o conteúdo que vale no dia de `today`. */
function widgetFor(name: string, raw: unknown, today: string) {
  const content = widgetContentToday(raw, today);
  return name === WIDGET_NATIVE.androidSmall ? <SmallWidget small={content.small} /> : <MediumWidget medium={content.medium} />;
}

async function readStored(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(WIDGET_NATIVE.storageKey);
  } catch {
    return null;
  }
}

/**
 * Tratador das tarefas do widget: ao adicionar, redimensionar e a cada atualização periódica, lê o que o app gravou e desenha. Cliques
 * (`OPEN_URI`) o Android resolve sozinho, abrindo o link `clarevo://`. Registrado por `android-register.ts`.
 */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  if (props.widgetAction === 'WIDGET_DELETED' || props.widgetAction === 'WIDGET_CLICK') return;
  const today = todayIn(deviceTimeZone(), new Date());
  props.renderWidget(widgetFor(props.widgetInfo.widgetName, await readStored(), today));
}

/** Grava o texto do snapshot e pede o desenho de novo dos dois widgets que estiverem na tela inicial. */
export async function writeAndroidWidgets(json: string): Promise<void> {
  await AsyncStorage.setItem(WIDGET_NATIVE.storageKey, json);
  const today = todayIn(deviceTimeZone(), new Date());
  for (const widgetName of [WIDGET_NATIVE.androidSmall, WIDGET_NATIVE.androidMedium]) {
    await requestWidgetUpdate({ widgetName, renderWidget: () => widgetFor(widgetName, json, today) });
  }
}
