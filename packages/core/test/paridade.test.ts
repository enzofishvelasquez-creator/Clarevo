import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Paridade entre a web (inclusive a versão para computador, a partir de 1024 px) e o app no celular (D-110). Pedido do Enzo: "o app no
 * pc, não tem a opção de ocultar valores" (ela estava só embaixo na barra lateral; no celular, o olho fica no cabeçalho azul) e
 * "corrija as bordas, para que fiquem todas arredondadas". As regras ficam no app; aqui o teste lê o código, como em widget.test.ts.
 */
const APP_SRC = fileURLToPath(new URL('../../../apps/app/src/', import.meta.url));
const read = (rel: string) => readFileSync(`${APP_SRC}${rel}`, 'utf8');
const fn = (rel: string, name: string) => new RegExp(`function ${name}\\b[\\s\\S]*?\\n}\\n`).exec(read(rel))?.[0] ?? '';

describe('ocultar valores no computador e no celular (D-110)', () => {
  const header = read('components/header.tsx');

  it('o cabeçalho das abas no computador tem "Ocultar valores" com o texto, no título ou, no Resumo, numa linha acima do mês', () => {
    const app = fn('components/header.tsx', 'AppHeader');
    expect(app).toContain('{sideNav ? null : <BrandRow />}');
    expect(app.match(/<HideValuesButton labeled \/>/g)?.length).toBe(2);
  });

  it('um estado só: o olho do cabeçalho, o da barra lateral e o interruptor de Conta mudam o mesmo setValuesHidden', () => {
    const button = fn('components/header.tsx', 'HideValuesButton');
    expect(button).toContain('onPress={() => setValuesHidden(!hidden)}');
    expect(button).toContain('accessibilityLabel={label}');
    expect(button).toContain('const label = hidden ? PRIVACY_TEXT.showNow : PRIVACY_TEXT.hideNow;');
    expect(read('components/desktop-nav.tsx')).toContain('onPress={() => setValuesHidden(!hidden)}');
    expect(read('components/device-settings.tsx')).toContain('setValuesHidden(v);');
    // Nenhum outro lugar guarda o estado de valores ocultos.
    expect(read('lib/privacy.ts').match(/^let hidden = false;$/m)).not.toBeNull();
  });

  it('no celular, com o selo da demonstração, os três da direita se aproximam para o olho caber a partir de 390 px', () => {
    const fits = fn('components/header.tsx', 'eyeFits');
    expect(fits).toContain('[gap, space[2]]');
    expect(header).toContain('const eyeGap = eyeFits(width, narrow, demo, PixelRatio.getFontScale());');
    // A conta do app, repetida: logotipo de 24 px de altura, selo de 102 px, olho e avatar de 44 px, faixa de até 560 px menos 48.
    const logo = 24 * (7492 / 1500);
    const row = (w: number) => Math.min(w, 560) - 48;
    const need = (inner: number) => logo + 12 + 102 + inner + 44 + inner + 44;
    expect(need(12)).toBeGreaterThan(row(390));
    expect(need(8)).toBeLessThanOrEqual(row(390));
    expect(need(8)).toBeGreaterThan(row(375));
  });
});

describe('cantos arredondados na versão para computador (D-110)', () => {
  const header = read('components/header.tsx');
  const panel = read('components/form-panel.tsx');

  it('o bloco azul das abas e o cabeçalho das telas cheias viram cartões com os quatro cantos no raio dos cartões grandes', () => {
    expect(header).toContain("bandCard: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg }");
    expect(header).toContain("subCard: { borderRadius: radius.lg }");
    expect(header).toContain('<View style={[styles.band, sideNav && styles.bandCard]} {...BAND_MARK}>');
    expect(header).toContain('<View style={[styles.subBand, card && styles.subCard]} {...BAND_MARK}>');
    // No celular, a faixa continua presa ao alto, com só os cantos de baixo arredondados.
    expect(header).toContain('if (!sideNav) return band;');
    expect(header).toContain("band: { backgroundColor: colors.brand, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },");
  });

  it('o bloco azul de destaque das telas de detalhe usa o mesmo cartão (meta e fatura)', () => {
    for (const rel of ['app/meta/[id]/index.tsx', 'app/cartoes/[id]/fatura/[mes]/index.tsx']) {
      const src = read(rel);
      expect(src.match(/heroCard\?\.band/g)?.length, rel).toBe(2);
      expect(src.match(/heroCard\?\.inner/g)?.length, rel).toBe(2);
    }
  });

  it('o painel dos formulários é um cartão arredondado, e o cabeçalho dentro dele fica preso ao alto do painel', () => {
    expect(panel).toContain('borderRadius: radius.lg,');
    expect(panel).toContain("overflow: 'hidden',");
    expect(panel).toContain('<InPanelContext value={true}>{children}</InPanelContext>');
    expect(fn('components/header.tsx', 'SubHeader')).toContain('const card = sideNav && !inPanel;');
  });

  it('Esc e o toque no fundo fecham o painel do mesmo jeito, também sem tela atrás', () => {
    expect(fn('components/form-panel.tsx', 'closePanel')).toContain("else router.replace('/');");
    expect(panel).toContain('      closePanel();\n');
    expect(panel).toContain('onPress={closePanel}');
  });
});

describe('limites da web explicados, sem botão que não funciona (D-110)', () => {
  it('o widget na web: só o texto, sem o interruptor "Mostrar valores no widget"', () => {
    const card = read('components/device-settings.tsx').match(/export function WidgetCard[\s\S]*$/)![0];
    expect(card).toMatch(/\{Platform\.OS !== 'web' \? \(\s*<SettingSwitch\s+label=\{WIDGET_TEXT\.showValues\}/);
  });

  it('convite da Família: sem compartilhamento no navegador, só "Copiar link", como botão principal', () => {
    expect(fn('lib/invite-share.web.ts', 'canShareInvite')).toContain("typeof nav.share === 'function'");
    expect(fn('lib/invite-share.ts', 'canShareInvite')).toContain('return true;');
    const screen = read('app/familia/convidar.tsx');
    expect(screen).toContain('{canShareInvite() ? <Button label={T.share}');
    expect(screen).toContain("tone={canShareInvite() ? 'soft' : 'brand'}");
    expect(screen).toContain('if (link && canShareInvite()) void share(link, true);');
  });

  it('na web, o Espaço escolhe a imagem da meta e, em Contas a pagar, o foco vai para o primeiro mês que apareceu', () => {
    expect(read('app/meta/[id]/imagem.tsx')).toContain('{...(disabled ? {} : spaceKeyPress(onPress))}');
    const payables = read('app/a-pagar/index.tsx');
    expect(payables).toContain('tabIndex={open && mi === firstShown ? -1 : undefined}');
    expect(payables).not.toContain("if (!open || Platform.OS === 'web') return;");
  });
});
