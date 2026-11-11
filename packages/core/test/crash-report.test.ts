import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CRASH_REPORT_OPTIONS, crashReportDsn, scrubCrashEvent, scrubCrashPath, scrubCrashText } from '../src';

describe('relatório de falhas (D-093): limpeza antes do envio', () => {
  it('tira números, e-mails e identificadores do texto do erro', () => {
    expect(scrubCrashText('Falhou ao salvar R$ 1.234,56 em 07/10/2026 para maria@exemplo.com (id 3f2b1c4d-1111-2222-3333-444455556666)')).toBe(
      'Falhou ao salvar R$ # em # para [e-mail] (id [id])',
    );
    expect(scrubCrashText("Cannot read property 'x' of undefined")).toBe("Cannot read property 'x' of undefined");
  });

  it('caminho de tela sem identificadores nem parâmetros', () => {
    expect(scrubCrashPath('/investimento/3f2b1c4d-1111-2222-3333-444455556666/movimento?tipo=valor')).toBe('/investimento/[id]/movimento');
    expect(scrubCrashPath('/cartoes/abc123/fatura/2026-10')).toBe('/cartoes/[id]/fatura/[id]');
    expect(scrubCrashPath('/calcular/multa-e-juros')).toBe('/calcular/multa-e-juros');
  });

  it('o evento perde pessoa, pedido, extras, nome do aparelho e rastros que não são navegação', () => {
    const event = {
      event_id: 'e1',
      message: 'Valor 980,00',
      user: { id: 'u1', email: 'maria@exemplo.com', ip_address: '1.2.3.4' },
      request: { url: 'https://app/x?token=1' },
      extra: { saldo: 12345 },
      server_name: 'iPhone de Maria',
      exception: { values: [{ type: 'RepoError', value: 'versao_desatualizada 3', stacktrace: { frames: [{ function: 'save' }] } }] },
      breadcrumbs: [
        { category: 'navigation', data: { from: '/meta/7a9/editar', to: '/metas' }, timestamp: 1 },
        { category: 'console', message: 'R$ 500,00' },
        { category: 'touch', message: 'Salvar meta' },
        { category: 'xhr', data: { url: 'https://supabase/rest/v1/rpc/create_goal' } },
      ],
      contexts: {
        device: { name: 'iPhone de Maria', model: 'iPhone15,2', family: 'iOS' },
        os: { name: 'iOS', version: '18.1' },
        app: { app_version: '1.0.0', app_build: '12', device_app_hash: 'abc123hash', app_id: 'inst-77' },
        culture: { timezone: 'America/Sao_Paulo' },
        profile: { x: 1 },
      },
      tags: { environment: 'production' },
    };
    const out = scrubCrashEvent(event);
    expect(out).not.toHaveProperty('user');
    expect(out).not.toHaveProperty('request');
    expect(out).not.toHaveProperty('extra');
    expect(out).not.toHaveProperty('server_name');
    expect(out.message).toBe('Valor #');
    expect(out.exception!.values![0]).toEqual({ type: 'RepoError', value: 'versao_desatualizada #', stacktrace: { frames: [{ function: 'save' }] } });
    expect(out.breadcrumbs).toEqual([{ timestamp: 1, category: 'navigation', type: 'navigation', data: { from: '/meta/[id]/editar', to: '/metas' } }]);
    expect(out.contexts).toEqual({ device: { model: 'iPhone15,2', family: 'iOS' }, os: { name: 'iOS', version: '18.1' }, app: { app_version: '1.0.0', app_build: '12' } });
    expect(out.tags).toEqual({ environment: 'production' });
    expect(JSON.stringify(out)).not.toMatch(/Maria|maria@|12345|500,00|980/);
  });

  it('só liga com um endereço de projeto válido; sem ele, nada é enviado', () => {
    expect(crashReportDsn(undefined)).toBeNull();
    expect(crashReportDsn('')).toBeNull();
    expect(crashReportDsn('http://abc@o1.ingest.sentry.io/1')).toBeNull();
    expect(crashReportDsn(' https://0123456789abcdef0123456789abcdef@o123.ingest.us.sentry.io/4507 ')).toBe('https://0123456789abcdef0123456789abcdef@o123.ingest.us.sentry.io/4507');
  });

  it('opções fixas: sem dado pessoal, captura de tela, desempenho nem sessões', () => {
    expect(CRASH_REPORT_OPTIONS).toMatchObject({ sendDefaultPii: false, attachScreenshot: false, attachViewHierarchy: false, enableAutoSessionTracking: false, tracesSampleRate: 0 });
    // Revisão de 11/11/2026: a parte nativa não passa pelo beforeSend, então fica desligada (falhas nativas, travamentos e rede do sistema).
    expect(CRASH_REPORT_OPTIONS).toMatchObject({ enableNative: false, enableNativeCrashHandling: false, enableAppHangTracking: false, enableNdk: false, enableCaptureFailedRequests: false });
  });

  it('no app: só no celular (a web não importa o SDK), com a limpeza em beforeSend e beforeBreadcrumb e sem chave no código', () => {
    const lib = (f: string) => readFileSync(fileURLToPath(new URL(`../../../apps/app/src/lib/${f}`, import.meta.url)), 'utf8');
    const native = lib('crash-report.native.ts');
    const web = lib('crash-report.ts');
    expect(web).not.toContain('@sentry');
    expect(native).toContain("from '@sentry/react-native'");
    expect(native).toContain('crashReportDsn(process.env.EXPO_PUBLIC_SENTRY_DSN)');
    expect(native).toContain('beforeSend: (event) => scrubCrashEvent(event)');
    expect(native).toContain('beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb)');
    expect(native).toContain('...CRASH_REPORT_OPTIONS');
    expect(native).not.toMatch(/https:\/\/[0-9a-f]{16,}@/);
  });
});
