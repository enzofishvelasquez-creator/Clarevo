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
import { PixelRatio } from 'react-native';
import {
  FlexWidget,
  SvgWidget,
  TextWidget,
  requestWidgetUpdate,
  type WidgetRepresentation,
  type WidgetTaskHandlerProps,
} from 'react-native-android-widget';

import { darkColors, lightColors, type ColorScheme } from '@/theme/palettes';

import { checkSvg, plusSvg, refreshSvg, signInSvg, symbolSvg } from './android-art';

/**
 * Widgets da tela inicial do Android (D-063 item 3, Ciclo AA), com `react-native-android-widget`: dois widgets, "Anotar gasto" (pequeno) e
 * "Ainda a pagar" (médio). Só entram no app com `CLAREVO_WIDGET=1`; sem a variável o Metro troca este arquivo por um módulo vazio.
 *
 * O widget só DESENHA o que o app gravou (`planWidgetSync`, no núcleo), com a conferência de data de `widgetContentToday`: em outro dia,
 * "Abra o app da Clarevo para atualizar". Nenhuma regra financeira e nenhum texto próprio existem aqui: todo texto vem do núcleo. O
 * armazenamento compartilhado é o AsyncStorage: o widget é desenhado pelo próprio JavaScript do app, em segundo plano (`widgetTaskHandler`,
 * registrado antes do app abrir por `android-register.ts`), e lê a mesma chave que o app grava (`WIDGET_NATIVE.storageKey`). Não há
 * SharedPreferences próprias nem identificador de conta.
 *
 * Visual de 16/11/2026 (docs/21_WIDGET_NATIVO.md, seção 9): o símbolo C da marca nos dois widgets, o "+" lima de anotar gasto (no pequeno e
 * como atalho no médio), cantos de 24 dp, margem interna de 16 dp, toques de 48 dp ou mais e texto sempre com limite de linhas. A biblioteca
 * desenha o widget numa imagem do tamanho que a tela inicial informa (`widgetInfo.width` e `height`, em dp), então o layout se ajusta a ele:
 * o pequeno muda de proporção quando a célula é alta (2 x 3 em alguns aparelhos), e o médio tem uma versão baixa (o atalho vira só o "+").
 * A conta da altura leva em conta a letra do aparelho (Tamanho da fonte, `PixelRatio.getFontScale`): com letra grande, o widget passa
 * antes para a versão mais enxuta, em vez de cortar o que fica embaixo. O médio segue o tema do aparelho (claro e escuro, `{ light, dark }`
 * da biblioteca); o pequeno é azul nos dois.
 *
 * 'use no memo' (acima): os widgets são funções chamadas direto pela biblioteca, sem hooks; o React Compiler os trocaria por versões com cache.
 */

type Small = WidgetContent['small'];
type Medium = WidgetContent['medium'];

/** Tamanho do widget em dp, como a tela inicial informa. */
export interface WidgetSize {
  width: number;
  height: number;
}

/** Sem o tamanho (0 ou ausente, por exemplo no primeiro desenho), o de uma célula comum: 2 x 2 e 4 x 2. */
export const DEFAULT_SIZE = {
  small: { width: 170, height: 170 },
  medium: { width: 344, height: 184 },
} as const satisfies Record<string, WidgetSize>;

/** Cantos do widget (o Android 12 ou mais recorta no raio do sistema, que nunca passa de 28 dp), margem interna e área mínima de toque. */
const RADIUS = 24;
const PAD = 16;
const TOUCH = 48;

/** As cores que não mudam com o tema: o azul da marca com texto branco e o lima com o texto escuro (iguais nas duas paletas). */
const BRAND = lightColors.brand;
const ON_BRAND = lightColors.textOnBrand;
const ACCENT = lightColors.accent;
const ON_ACCENT = lightColors.textOnAccent;

/** As cores do widget médio em cada tema. O símbolo vai em cor sobre a superfície clara e reverso (C branco) sobre a escura (docs/marca). */
function lookOf(scheme: ColorScheme) {
  const p = scheme === 'dark' ? darkColors : lightColors;
  return {
    surface: p.surface,
    text: p.text,
    secondary: p.textSecondary,
    symbol: scheme === 'dark' ? p.surfaceOnBrand : p.brand,
    chip: p.brandTint,
    chipIcon: p.brandText,
    pill: p.muted,
    pillText: p.textSecondary,
  };
}
type Look = ReturnType<typeof lookOf>;

/** A escala de letra do aparelho (1 sem ajuste). Os textos do widget crescem com ela (sp); menor que 1 conta como 1, que sobra espaço. */
function deviceFontScale(): number {
  try {
    const scale = PixelRatio.getFontScale();
    return Number.isFinite(scale) && scale > 1 ? scale : 1;
  } catch {
    return 1;
  }
}

/** Altura, em dp, de `lines` linhas de texto de `sp` na escala de letra `scale` (Roboto: 1,172 em por linha e 0,155 em de respiro da fonte). */
const textHeight = (sp: number, scale: number, lines = 1) => sp * scale * (1.172 * lines + 0.155);
/** Altura do bloco do valor grande, que diminui a letra para caber nele (não cresce com a escala). */
const valueHeight = (sp: number) => Math.ceil(sp * 1.34);
/** Folga na conta da altura de cada versão. */
const SLACK = 4;

function sizeOf(info: { width?: number; height?: number } | undefined, fallback: WidgetSize): WidgetSize {
  const width = info?.width && info.width > 0 ? info.width : fallback.width;
  const height = info?.height && info.height > 0 ? info.height : fallback.height;
  return { width, height };
}

/** Ocupa o espaço que sobra na linha ou na coluna. */
const Fill = () => <FlexWidget style={{ flex: 1 }} />;

/**
 * Pequeno, "Anotar gasto": fundo azul, o símbolo branco no alto à esquerda e, embaixo, o rótulo. Na célula quadrada, o "+" lima fica no
 * alto à direita; na célula alta (2 x 3 em alguns aparelhos), desce e forma com o rótulo um bloco só, como um botão com legenda. O espaço
 * que sobra fica sempre entre o alto e o bloco de baixo, então nada flutua no meio do azul.
 */
export function SmallWidget({ small, size = DEFAULT_SIZE.small, fontScale = 1 }: { small: Small; size?: WidgetSize; fontScale?: number }) {
  const compact = size.width < 140 || size.height < Math.max(140, 2 * PAD + 44 + textHeight(18, fontScale, 2));
  const tall = !compact && size.height >= size.width * 1.3 && size.height >= Math.max(200, 2 * PAD + 36 + 56 + 12 + textHeight(22, fontScale, 2));
  const labelLines = compact && size.height < 2 * 12 + 40 + textHeight(15, fontScale, 2) ? 1 : 2;
  const symbol = compact ? 24 : tall ? 36 : 32;
  const plus = compact ? 40 : tall ? 56 : 44;
  const label = compact ? 15 : tall ? 22 : 18;
  const plusIcon = <SvgWidget svg={plusSvg(plus, ACCENT, ON_ACCENT)} style={{ width: plus, height: plus }} />;
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: widgetUrl(small.route) }}
      accessibilityLabel={small.a11y}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        padding: compact ? 12 : PAD,
        borderRadius: RADIUS,
        backgroundColor: BRAND,
      }}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center' }}>
        <SvgWidget svg={symbolSvg(symbol, ON_BRAND, ACCENT)} style={{ width: symbol, height: symbol }} />
        {tall ? null : <Fill />}
        {tall ? null : plusIcon}
      </FlexWidget>
      <Fill />
      {tall ? <FlexWidget style={{ marginBottom: 12 }}>{plusIcon}</FlexWidget> : null}
      <TextWidget text={small.label} maxLines={labelLines} truncate="END" style={{ fontSize: label, fontWeight: '700', color: ON_BRAND }} />
    </FlexWidget>
  );
}

/** Cabeçalho do médio: o símbolo e, quando há, o título ("Ainda a pagar em novembro"). */
function Header({ title, look }: { title: string | null; look: Look }) {
  return (
    <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center' }}>
      <SvgWidget svg={symbolSvg(20, look.symbol, ACCENT)} style={{ width: 20, height: 20 }} />
      {title ? (
        <FlexWidget style={{ flex: 1, marginLeft: 8 }}>
          <TextWidget text={title} maxLines={1} truncate="END" style={{ fontSize: 13, fontWeight: '600', color: look.secondary }} />
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
}

/** "1 vencida": selo neutro, sem cor de alerta (dinheiro nunca em vermelho). */
function Pill({ text, look, compact }: { text: string; look: Look; compact: boolean }) {
  return (
    <FlexWidget style={{ backgroundColor: look.pill, borderRadius: 12, paddingHorizontal: 10, paddingVertical: compact ? 2 : 4 }}>
      <TextWidget text={text} maxLines={1} truncate="END" style={{ fontSize: 12, fontWeight: '600', color: look.pillText }} />
    </FlexWidget>
  );
}

/** O valor grande: uma linha só, que diminui a letra em vez de cortar o número ("R$ 12.345,67" ou "R$ ••••"). */
function Value({ value, fontSize, look }: { value: string; fontSize: number; look: Look }) {
  return (
    <TextWidget
      text={value}
      maxLines={1}
      truncate="END"
      style={{ width: 'match_parent', height: valueHeight(fontSize), fontSize, fontWeight: '800', color: look.text, adjustsFontSizeToFit: true }}
    />
  );
}

/** Ícone e texto de um estado sem valor: vazio (visto lima), sem dados (atualizar) e sem sessão (entrar). */
function MessageRow({ medium, look, compact, gap, lines }: { medium: Medium; look: Look; compact: boolean; gap: number; lines: number }) {
  const chip = compact ? 28 : 36;
  const icon =
    medium.state === 'vazio'
      ? checkSvg(chip, ACCENT, ON_ACCENT)
      : medium.state === 'sem_sessao'
        ? signInSvg(chip, look.chip, look.chipIcon)
        : refreshSvg(chip, look.chip, look.chipIcon);
  return (
    <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', marginTop: gap }}>
      <SvgWidget svg={icon} style={{ width: chip, height: chip }} />
      <FlexWidget style={{ flex: 1, marginLeft: compact ? 10 : 12 }}>
        <TextWidget
          text={medium.message ?? ''}
          maxLines={lines}
          truncate="END"
          style={{ fontSize: compact ? 14 : 16, fontWeight: medium.state === 'vazio' ? '700' : '600', color: look.text }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}

/** Atalho "+ Anotar gasto" do médio: abre o formulário de gasto (a rota do widget pequeno), com área de toque de 48 dp. */
function Shortcut({ small, compact }: { small: Small; compact: boolean }) {
  const click = { clickAction: 'OPEN_URI', clickActionData: { uri: widgetUrl(small.route) }, accessibilityLabel: small.a11y };
  if (compact) {
    return (
      <FlexWidget {...click} style={{ width: TOUCH, height: TOUCH, borderRadius: TOUCH / 2, flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <SvgWidget svg={plusSvg(44, ACCENT, ON_ACCENT)} style={{ width: 44, height: 44 }} />
      </FlexWidget>
    );
  }
  return (
    <FlexWidget {...click} style={{ height: TOUCH, borderRadius: TOUCH / 2, flexDirection: 'row', alignItems: 'center' }}>
      <FlexWidget style={{ height: 40, borderRadius: 20, backgroundColor: BRAND, flexDirection: 'row', alignItems: 'center', paddingLeft: 6, paddingRight: 14 }}>
        <SvgWidget svg={plusSvg(28, ACCENT, ON_ACCENT)} style={{ width: 28, height: 28 }} />
        <TextWidget text={small.label} maxLines={1} truncate="END" style={{ marginLeft: 8, fontSize: 14, fontWeight: '700', color: ON_BRAND }} />
      </FlexWidget>
    </FlexWidget>
  );
}

/**
 * Médio, "Ainda a pagar": cabeçalho com o símbolo e o título, o valor grande (ou "R$ ••••"), a próxima conta, as vencidas num selo neutro
 * e o atalho "+ Anotar gasto". Sem sessão não há atalho: o widget inteiro já abre Entrar. Quando a altura não dá para tudo (abaixo de 172 dp
 * com a letra padrão), o atalho vira só o "+" à direita e as vencidas vão para a linha da próxima conta; a partir de 220 dp, o valor cresce.
 */
export function MediumWidget({
  content,
  size = DEFAULT_SIZE.medium,
  scheme = 'light',
  fontScale = 1,
}: {
  content: WidgetContent;
  size?: WidgetSize;
  scheme?: ColorScheme;
  fontScale?: number;
}) {
  const { medium } = content;
  const look = lookOf(scheme);
  const shortcut = medium.state === 'sem_sessao' ? null : content.small;
  const root = {
    clickAction: 'OPEN_URI',
    clickActionData: { uri: widgetUrl(medium.route) },
    accessibilityLabel: medium.a11y,
  };
  const value = medium.state === 'normal' ? medium.value : null;

  // A altura que cada versão pede, com a letra do aparelho: escolhe a maior que cabe, para nada ficar cortado embaixo.
  const header = Math.max(20, textHeight(13, fontScale));
  const bottomRow = Boolean(medium.overdue || shortcut);
  const frame = PAD + header + (bottomRow ? TOUCH + PAD - (TOUCH - 40) / 2 : PAD);
  const body = (big: boolean) =>
    value
      ? big
        ? 12 + valueHeight(36) + (medium.next ? 4 + textHeight(14, fontScale, 2) : 0)
        : 10 + valueHeight(30) + (medium.next ? 2 + textHeight(14, fontScale) : 0)
      : (bottomRow ? 14 : 0) + Math.max(36, textHeight(16, fontScale, 2));
  const tall = size.height >= 220 && size.height >= frame + body(true) + SLACK;
  const compact = !tall && size.height < frame + body(false) + SLACK;

  if (compact) {
    // Versão baixa: a linha da próxima conta só entra se couber inteira; o recado fica em uma linha se duas não couberem.
    const column = 2 * 10 + header + 6;
    const compactDetail = size.height >= column + valueHeight(28) + 2 + Math.max(textHeight(13, fontScale), textHeight(12, fontScale) + 4);
    const compactLines = size.height >= column + Math.max(28, textHeight(14, fontScale, 2)) ? 2 : 1;
    return (
      <FlexWidget
        {...root}
        style={{
          height: 'match_parent',
          width: 'match_parent',
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: PAD,
          paddingVertical: 10,
          borderRadius: RADIUS,
          backgroundColor: look.surface,
        }}>
        <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
          <Header title={medium.title} look={look} />
          {value ? (
            <FlexWidget style={{ width: 'match_parent', flexDirection: 'column', marginTop: 6 }}>
              <Value value={value} fontSize={28} look={look} />
              {(medium.next || medium.overdue) && compactDetail ? (
                <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                  {medium.next ? (
                    <FlexWidget style={{ flex: 1 }}>
                      <TextWidget text={medium.next.line} maxLines={1} truncate="END" style={{ fontSize: 13, fontWeight: '500', color: look.text }} />
                    </FlexWidget>
                  ) : null}
                  {medium.overdue ? (
                    <FlexWidget style={{ marginLeft: medium.next ? 8 : 0 }}>
                      <Pill text={medium.overdue} look={look} compact />
                    </FlexWidget>
                  ) : null}
                </FlexWidget>
              ) : null}
            </FlexWidget>
          ) : (
            <MessageRow medium={medium} look={look} compact gap={6} lines={compactLines} />
          )}
        </FlexWidget>
        {shortcut ? (
          <FlexWidget style={{ marginLeft: 12 }}>
            <Shortcut small={shortcut} compact />
          </FlexWidget>
        ) : null}
      </FlexWidget>
    );
  }

  const valueSize = tall ? 36 : 30;
  return (
    <FlexWidget
      {...root}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        paddingTop: PAD,
        paddingHorizontal: PAD,
        // O atalho tem 48 dp de toque e 40 dp de desenho: 12 + 4 deixam o desenho a 16 dp da borda, como o resto.
        paddingBottom: shortcut ? PAD - (TOUCH - 40) / 2 : PAD,
        borderRadius: RADIUS,
        backgroundColor: look.surface,
      }}>
      <Header title={medium.title} look={look} />
      {value ? (
        <FlexWidget style={{ width: 'match_parent', flexDirection: 'column', marginTop: tall ? 12 : 10 }}>
          <Value value={value} fontSize={valueSize} look={look} />
          {medium.next ? (
            <TextWidget
              text={medium.next.line}
              maxLines={tall ? 2 : 1}
              truncate="END"
              style={{ marginTop: tall ? 4 : 2, fontSize: 14, fontWeight: '500', color: look.text }}
            />
          ) : null}
        </FlexWidget>
      ) : null}
      {/* Sem a linha de baixo (sem sessão), o recado fica no meio do espaço abaixo do cabeçalho, e não colado nele. */}
      {!value && !bottomRow ? <Fill /> : null}
      {value ? null : <MessageRow medium={medium} look={look} compact={false} gap={bottomRow ? 14 : 0} lines={2} />}
      <Fill />
      {bottomRow ? (
        <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center' }}>
          {medium.overdue ? <Pill text={medium.overdue} look={look} compact={false} /> : null}
          <Fill />
          {shortcut ? <Shortcut small={shortcut} compact={false} /> : null}
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
}

/**
 * O widget de um nome, com o conteúdo que vale no dia de `today`, no tamanho que a tela inicial informou. O médio vem nas duas versões
 * (clara e escura): o Android mostra a do tema do aparelho, sem precisar desenhar de novo quando o tema muda.
 */
function widgetFor(name: string, raw: unknown, today: string, info?: { width?: number; height?: number }): WidgetRepresentation {
  const content = widgetContentToday(raw, today);
  const fontScale = deviceFontScale();
  if (name === WIDGET_NATIVE.androidSmall) return <SmallWidget small={content.small} size={sizeOf(info, DEFAULT_SIZE.small)} fontScale={fontScale} />;
  const size = sizeOf(info, DEFAULT_SIZE.medium);
  return {
    light: <MediumWidget content={content} size={size} scheme="light" fontScale={fontScale} />,
    dark: <MediumWidget content={content} size={size} scheme="dark" fontScale={fontScale} />,
  };
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
  props.renderWidget(widgetFor(props.widgetInfo.widgetName, await readStored(), today, props.widgetInfo));
}

/** Grava o texto do snapshot e pede o desenho de novo dos dois widgets que estiverem na tela inicial. */
export async function writeAndroidWidgets(json: string): Promise<void> {
  await AsyncStorage.setItem(WIDGET_NATIVE.storageKey, json);
  const today = todayIn(deviceTimeZone(), new Date());
  for (const widgetName of [WIDGET_NATIVE.androidSmall, WIDGET_NATIVE.androidMedium]) {
    await requestWidgetUpdate({ widgetName, renderWidget: (info) => widgetFor(widgetName, json, today, info) });
  }
}
