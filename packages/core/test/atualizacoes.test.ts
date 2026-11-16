/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Atualização pelo ar (EAS Update, decidida pelo Enzo em 16/11/2026; `docs/50_ATUALIZACOES.md`): a configuração que faz cada merge no
 * `main` chegar aos builds de teste sem um build novo. Nada aqui chama a rede.
 */
const nodeRequire = createRequire(import.meta.url);
const raiz = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const ler = (p: string) => readFileSync(raiz(p), 'utf8');
const app = JSON.parse(ler('apps/app/app.json')).expo;
const eas = JSON.parse(ler('apps/app/eas.json'));
const workflow = ler('apps/app/.eas/workflows/atualizar-preview.yml');

describe('EAS Update: configuração do app', () => {
  it('app.json: o endereço de atualizações do projeto e a versão nativa pela impressão digital', () => {
    expect(app.updates).toEqual({ url: `https://u.expo.dev/${app.extra.eas.projectId}` });
    expect(app.runtimeVersion).toEqual({ policy: 'fingerprint' });
  });

  it('eas.json: cada perfil num canal com o nome dele (o canal é o "perfil do build" em Conta e no relatório de falhas)', () => {
    expect(eas.build.preview.channel).toBe('preview');
    expect(eas.build['preview-sem-widget'].channel).toBe('preview-sem-widget');
    expect(eas.build.production.channel).toBe('production');
  });

  it('expo-updates e expo-application instalados na versão do SDK', () => {
    const deps = JSON.parse(ler('apps/app/package.json')).dependencies as Record<string, string>;
    const sdk = JSON.parse(ler('node_modules/expo/bundledNativeModules.json')) as Record<string, string>;
    expect(deps['expo-updates']).toBe(sdk['expo-updates']);
    expect(deps['expo-application']).toBe(sdk['expo-application']);
  });
});

describe('EAS Update: a publicação a cada merge no main', () => {
  it('na pasta do projeto que o EAS usa (a pasta base apps/app, ao lado de eas.json)', () => {
    expect(workflow).toMatch(/^on:\n {2}push:\n {4}branches: \['main'\]$/m);
    expect(workflow).toMatch(/^ {4}type: update$/m);
    expect(workflow).toMatch(/^ {6}branch: preview$/m);
    expect(workflow).toMatch(/^ {6}platform: android$/m);
  });

  it('com as variáveis do ambiente preview e o widget ligado, como o perfil preview no build (senão a atualização não chega)', () => {
    expect(workflow).toMatch(/^ {4}environment: preview$/m);
    expect(workflow).toMatch(/^ {4}env:\n {6}CLAREVO_WIDGET: '1'$/m);
    expect(eas.build.preview.env).toEqual({ CLAREVO_WIDGET: '1' });
    // Dois merges seguidos não publicam fora de ordem.
    expect(workflow).toMatch(/^concurrency:\n {2}group: atualizar-preview$/m);
  });

  it('sem travessão e sem a expressão vetada nos comentários (o Enzo lê o arquivo no GitHub)', () => {
    expect(workflow).not.toMatch(/[–—]/);
    expect(workflow).not.toMatch(/faz(er|endo)?\s+sentido/i);
  });
});

describe('EAS Update: a impressão digital antes e depois do prebuild', () => {
  const fingerprint = nodeRequire(raiz('apps/app/fingerprint.config.js')) as {
    ignorePaths: string[];
    fileHookTransform: (source: { type: string; id?: string; filePath?: string }, chunk: unknown, isEndOfFile: boolean, encoding: string) => unknown;
    withoutWidgetPackages: (contents: string) => string;
  };

  it('as pastas dos dois pacotes do widget ficam fora (o plugin do widget só os liga no prebuild)', () => {
    expect(fingerprint.ignorePaths).toEqual(['**/node_modules/expo-widgets/**', '**/node_modules/react-native-android-widget/**']);
  });

  it('a lista do autolinking (Expo e React Native) fica igual com ou sem os pacotes do widget', () => {
    const modulo = (packageName: string) => ({ packageName, projects: [{ name: packageName }] });
    const antes = { extraDependencies: [], coreFeatures: ['compose'], modules: [modulo('expo-camera'), modulo('expo-updates')] };
    const depois = { ...antes, modules: [modulo('expo-camera'), modulo('expo-updates'), modulo('expo-widgets')] };
    const t = (id: string, value: object) => fingerprint.fileHookTransform({ type: 'contents', id }, JSON.stringify(value), true, 'utf8');
    expect(t('expoAutolinkingConfig:android', depois)).toBe(t('expoAutolinkingConfig:android', antes));
    expect(t('expoAutolinkingConfig:ios', depois)).toBe(t('expoAutolinkingConfig:ios', antes));
    const rnAntes = { expo: { root: 'x' }, 'react-native-svg': { root: 'y' } };
    const rnDepois = { expo: { root: 'x' }, 'react-native-android-widget': { root: 'w' }, 'react-native-svg': { root: 'y' } };
    expect(t('rncoreAutolinkingConfig:android', rnDepois)).toBe(t('rncoreAutolinkingConfig:android', rnAntes));
    // Um pacote nativo novo continua mudando a impressão digital.
    expect(t('expoAutolinkingConfig:android', { ...antes, modules: [...antes.modules, modulo('expo-maps')] })).not.toBe(t('expoAutolinkingConfig:android', antes));
  });

  it('o resto passa sem mudança (arquivos, configuração do app, texto que não é JSON)', () => {
    const chunk = Buffer.from('abc');
    expect(fingerprint.fileHookTransform({ type: 'file', filePath: 'app.json' }, chunk, false, 'utf8')).toBe(chunk);
    expect(fingerprint.fileHookTransform({ type: 'contents', id: 'expoConfig' }, '{"plugins":["expo-widgets"]}', true, 'utf8')).toBe('{"plugins":["expo-widgets"]}');
    expect(fingerprint.withoutWidgetPackages('não é json')).toBe('não é json');
  });
});
