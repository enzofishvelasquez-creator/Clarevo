/// <reference types="node" />
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_DIR, createHooksHarness, loadApp, type Platform } from './app-sandbox';

/**
 * Celular deitado na web (revisão independente da D-131): `useShortLandscape` decidia por `useWindowDimensions`, que no react-native-web
 * segue a `visualViewport`. Ela encolhe quando o teclado da tela abre, então um celular em pé virava "deitado" ao tocar num campo, e o
 * cabeçalho, a barra de baixo e a arte das boas-vindas trocavam de versão. Na web, a decisão agora vem da janela de layout
 * (`document.documentElement`) e de `matchMedia('(orientation: landscape)')`, que o teclado não muda; no celular, nada muda.
 */
const LAYOUT = path.join(APP_DIR, 'src', 'lib', 'layout.ts');

function load(platform: Platform, dims: { width: number; height: number }) {
  const harness = createHooksHarness();
  const useWindowDimensions = () => ({ ...dims, scale: 2, fontScale: 1 });
  const mod = loadApp(LAYOUT, {
    platform,
    mocks: {
      ...harness.mocks,
      'react-native': { Platform: { OS: platform }, useWindowDimensions },
      // Na web, o Babel do Expo troca o import de react-native pelos módulos do react-native-web.
      'react-native-web/dist/exports/Platform': { __esModule: true, default: { OS: 'web' } },
      'react-native-web/dist/exports/useWindowDimensions': { __esModule: true, default: useWindowDimensions },
    },
  });
  return { harness, mod };
}

/** Um navegador de mentira: a janela de layout, a orientação e os ouvintes de tamanho e de orientação. */
function fakeBrowser(view: { width: number; height: number }) {
  const listeners = new Map<string, Set<() => void>>();
  const on = (type: string, fn: () => void) => (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(fn);
  const off = (type: string, fn: () => void) => listeners.get(type)?.delete(fn);
  const media = {
    get matches() {
      return view.width > view.height;
    },
    addEventListener: (_: string, fn: () => void) => on('media', fn),
    removeEventListener: (_: string, fn: () => void) => off('media', fn),
  };
  vi.stubGlobal('document', {
    documentElement: {
      get clientWidth() {
        return view.width;
      },
      get clientHeight() {
        return view.height;
      },
    },
  });
  vi.stubGlobal('window', { addEventListener: on, removeEventListener: off, matchMedia: () => media });
  return {
    fire(type: 'resize' | 'orientationchange' | 'media') {
      for (const fn of [...(listeners.get(type) ?? [])]) fn();
    },
    count: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('celular deitado na web, sem confundir o teclado com a tela deitada', () => {
  it('a decisão: deitada e com menos de 500 px de altura', () => {
    const { mod } = load('web', { width: 390, height: 844 });
    const short = mod.isShortLandscape as (w: number, h: number, landscape?: boolean) => boolean;
    expect(mod.SHORT_MAX_HEIGHT).toBe(500);
    expect(short(844, 390)).toBe(true);
    expect(short(667, 375)).toBe(true);
    expect(short(390, 844)).toBe(false);
    expect(short(1024, 600)).toBe(false);
    expect(short(1280, 499)).toBe(true);
    expect(short(1280, 500)).toBe(false);
    expect(short(500, 500)).toBe(false);
    // A orientação do navegador, quando vem, decide: em pé com teclado aberto não conta como deitado.
    expect(short(390, 340, false)).toBe(false);
    expect(short(844, 390, true)).toBe(true);
    // Sem medida (0), nunca deitado.
    expect(short(844, 0)).toBe(false);
  });

  it('na web, o teclado aberto num celular em pé não troca a versão; virar o celular troca', async () => {
    const view = { width: 390, height: 664 };
    const browser = fakeBrowser(view);
    // A `visualViewport` (o que useWindowDimensions devolve) encolhida pelo teclado: mais larga que alta e baixa.
    const { harness, mod } = load('web', { width: 390, height: 340 });
    let short: boolean | undefined;
    const app = harness.mount(() => {
      short = mod.useShortLandscape();
      return null;
    });
    expect(short).toBe(false);
    expect(browser.count()).toBe(3);

    // Virou o celular: a janela de layout fica deitada.
    view.width = 664;
    view.height = 390;
    browser.fire('resize');
    await settle();
    expect(short).toBe(true);

    // Voltou para em pé, avisado só pela orientação.
    view.width = 390;
    view.height = 664;
    browser.fire('media');
    await settle();
    expect(short).toBe(false);

    app.unmount();
    expect(browser.count()).toBe(0);
  });

  it('na web sem medida da janela de layout, volta às medidas da tela; no celular, decide pelas medidas da tela, como antes', () => {
    fakeBrowser({ width: 0, height: 0 });
    for (const [platform, dims, expected] of [
      ['web', { width: 844, height: 390 }, true],
      ['web', { width: 390, height: 844 }, false],
      ['ios', { width: 844, height: 390 }, true],
      ['android', { width: 390, height: 340 }, true],
      ['ios', { width: 390, height: 844 }, false],
    ] as const) {
      const { harness, mod } = load(platform, dims);
      let short: boolean | undefined;
      const app = harness.mount(() => {
        short = mod.useShortLandscape();
        return null;
      });
      expect(short, `${platform} ${dims.width}x${dims.height}`).toBe(expected);
      app.unmount();
    }
  });
});
