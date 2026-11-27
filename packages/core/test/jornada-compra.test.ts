/// <reference types="node" />
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as core from '../src';
import { APP_DIR, loadApp } from './app-sandbox';
import {
  ACCESS_TEXT,
  CHOSEN_PLAN_PARAMS,
  CHOSEN_PLAN_STORAGE_KEY,
  CHOSEN_PLAN_TEXT,
  FAMILY_MAX_PEOPLE,
  FAMILY_PLAN_NEXT_TEXT,
  PLAN_PERIOD_DEFAULT,
  SIGNUP_TEXT,
  STORE_SUBSCRIPTION_TEXT,
  SUBSCRIBE_OPEN,
  WEB_SUBSCRIPTION_TEXT,
  WELCOME_TEXT,
  chosenPlanFromSearch,
  chosenPlanStillUseful,
  familyPlanNextStep,
  parseChosenPlan,
  parseStoredChosenPlan,
  serializeChosenPlan,
  signedOutScreen,
  signupEntryFrom,
  signupTrialLine,
  type Access,
  type FamilyOverview,
} from '../src';

/**
 * Jornada de compra de 27/11/2026 (itens 2, 3, 4, 7 e 15 do relatório): a linha do teste grátis em Criar conta, o plano escolhido no site
 * levado à tela Assinatura (só no aparelho), o que a página de pagamento pede, o próximo passo do plano Família e a descrição do app web
 * instalado. A ordem da tela Assinatura é conferida no roteiro web (scripts/e2e-web.js).
 */
const raiz = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const ler = (p: string) => readFileSync(raiz(p), 'utf8');
const FORBIDDEN = /[–—]|\bfaz(er|endo)?\s+sentido\b|bem-vind[oa]|usu[aá]ri[oa]s?\b|recomend|invista|aplique|plus\b|urgente|aproveite|não perca|só hoje/i;

describe('o plano escolhido no site (item 15)', () => {
  it('os nomes dos parâmetros são os do site: plano e periodo', () => {
    expect(CHOSEN_PLAN_PARAMS).toEqual({ plan: 'plano', period: 'periodo' });
  });

  it('aceita só individual ou familia, com mensal, anual ou sem período', () => {
    expect(parseChosenPlan({ plano: 'individual', periodo: 'mensal' })).toEqual({ plan: 'individual', period: 'mensal' });
    expect(parseChosenPlan({ plano: 'familia', periodo: 'anual' })).toEqual({ plan: 'familiar', period: 'anual' });
    expect(parseChosenPlan({ plano: 'familia' })).toEqual({ plan: 'familiar', period: null });
    expect(parseChosenPlan({ plano: 'individual', periodo: undefined })).toEqual({ plan: 'individual', period: null });
    // Sem período no endereço, a tela abre no mensal, o marcado de sempre desde 27/11/2026 (o anual só com periodo=anual).
    expect(parseChosenPlan({ plano: 'familia' })?.period ?? PLAN_PERIOD_DEFAULT).toBe('mensal');
    expect(chosenPlanFromSearch('?plano=individual')?.period ?? PLAN_PERIOD_DEFAULT).toBe('mensal');
    expect(chosenPlanFromSearch('?plano=individual&periodo=anual')?.period ?? PLAN_PERIOD_DEFAULT).toBe('anual');
  });

  it('recusa a escolha inteira com qualquer valor fora da lista, lista repetida ou plano ausente', () => {
    for (const params of [
      {},
      { periodo: 'anual' },
      { plano: '' },
      { plano: 'familiar' },
      { plano: 'Familia' },
      { plano: 'FAMILIA' },
      { plano: ' familia' },
      { plano: 'empresa' },
      { plano: 'plus' },
      { plano: 'toString' },
      { plano: '__proto__' },
      { plano: 'familia', periodo: '' },
      { plano: 'familia', periodo: 'Anual' },
      { plano: 'familia', periodo: 'semestral' },
      { plano: ['familia', 'individual'] },
      { plano: 'familia', periodo: ['anual'] },
      { plano: 1 },
      { plano: 'individual', periodo: 12 },
    ]) {
      expect(parseChosenPlan(params as Record<string, unknown>), JSON.stringify(params)).toBeNull();
    }
  });

  it('lê do endereço, com as mesmas regras (o parâmetro repetido também recusa)', () => {
    expect(chosenPlanFromSearch('?plano=familia&periodo=anual')).toEqual({ plan: 'familiar', period: 'anual' });
    expect(chosenPlanFromSearch('plano=individual&periodo=mensal&utm=x')).toEqual({ plan: 'individual', period: 'mensal' });
    expect(chosenPlanFromSearch('?plano=individual')).toEqual({ plan: 'individual', period: null });
    expect(chosenPlanFromSearch('?plano=familia&plano=individual')).toBeNull();
    expect(chosenPlanFromSearch('?plano=familia&periodo=anual&periodo=mensal')).toBeNull();
    expect(chosenPlanFromSearch('?plano=familia%20&periodo=anual')).toBeNull();
    expect(chosenPlanFromSearch('')).toBeNull();
    expect(chosenPlanFromSearch('?email=ana%40exemplo.com')).toBeNull();
  });

  it('o texto guardado no aparelho volta igual, e um texto fora do formato não vale', () => {
    for (const c of [
      { plan: 'individual', period: 'mensal' },
      { plan: 'individual', period: 'anual' },
      { plan: 'familiar', period: 'mensal' },
      { plan: 'familiar', period: 'anual' },
      { plan: 'familiar', period: null },
    ] as const) {
      expect(parseStoredChosenPlan(serializeChosenPlan(c))).toEqual(c);
    }
    expect(serializeChosenPlan({ plan: 'familiar', period: 'anual' })).toBe('familia:anual');
    for (const raw of [null, undefined, 1, '', 'familia:', 'familia:anual:x', 'familiar:anual', '{"plan":"familiar"}', `familia:${'x'.repeat(50)}`]) {
      expect(parseStoredChosenPlan(raw), String(raw)).toBeNull();
    }
    expect(CHOSEN_PLAN_STORAGE_KEY).toMatch(/^clarevo\./);
  });

  it('só vale para quem ainda escolhe um plano (antes do início da cobrança, no teste e em só ver e exportar)', () => {
    expect(['pre_lancamento', 'teste', 'leitura'].map(chosenPlanStillUseful)).toEqual([true, true, true]);
    expect(['assinatura', 'familia', 'beneficio', 'cortesia'].map(chosenPlanStillUseful)).toEqual([false, false, false, false]);
  });

  it('o app guarda a escolha só no aparelho e a apaga depois de usar ou ao esquecer o aparelho; nada vai ao servidor', () => {
    const lib = ler('apps/app/src/lib/chosen-plan.ts');
    expect(lib).toContain('localStorage');
    expect(lib).not.toMatch(/repo\.|supabase|fetch\(/);
    expect(lib.match(/try \{/g)?.length).toBeGreaterThanOrEqual(4);
    expect(ler('apps/app/src/app/criar-conta.tsx')).toContain('rememberChosenPlan(params)');
    expect(ler('apps/app/src/app/entrar.tsx')).toContain('rememberChosenPlan(params)');
    expect(ler('apps/app/src/app/_layout.tsx')).toContain('rememberChosenPlanFromLocation()');
    expect(ler('apps/app/src/lib/device-forget.ts')).toContain('clearChosenPlan()');
    const tela = ler('apps/app/src/app/conta/assinatura.tsx');
    expect(tela).toContain('peekChosenPlan()');
    expect(tela).toContain('clearChosenPlan()');
    expect(CHOSEN_PLAN_TEXT.badge).toBe('O plano que você escolheu');
  });
});

describe('o link de cadastro do site abre Criar conta direto (27/11/2026)', () => {
  it('só o endereço de Criar conta vira destino, com a escolha do plano só quando ela é válida', () => {
    expect(signupEntryFrom('/criar-conta', '')).toBe('/criar-conta');
    expect(signupEntryFrom('/criar-conta/', '')).toBe('/criar-conta');
    expect(signupEntryFrom('/criar-conta', '?plano=familia&periodo=mensal')).toBe('/criar-conta?plano=familia&periodo=mensal');
    expect(signupEntryFrom('/criar-conta', '?plano=individual&periodo=anual')).toBe('/criar-conta?plano=individual&periodo=anual');
    expect(signupEntryFrom('/criar-conta', '?plano=individual')).toBe('/criar-conta?plano=individual');
    // Outros parâmetros ficam de fora; uma escolha inválida não segue, mas Criar conta abre do mesmo jeito.
    expect(signupEntryFrom('/criar-conta', '?plano=familia&periodo=anual&utm_source=site&email=ana%40exemplo.com')).toBe('/criar-conta?plano=familia&periodo=anual');
    expect(signupEntryFrom('/criar-conta', '?plano=empresa&periodo=anual')).toBe('/criar-conta');
    expect(signupEntryFrom('/criar-conta', '?plano=familia&plano=individual')).toBe('/criar-conta');
    // A raiz, Entrar e as demais telas seguem como antes (nenhum destino de cadastro).
    for (const path of ['/', '/entrar', '/boas-vindas', '/conta/assinatura', '/criar-conta/x', '/x/criar-conta', '/criar-contas', '/confirmar-email']) {
      expect(signupEntryFrom(path, '?plano=familia&periodo=mensal'), path).toBeNull();
    }
  });

  it('sem sessão: Entrar para retomar um destino; Criar conta pelo link do site; senão, as boas-vindas', () => {
    expect(signedOutScreen(false, null)).toBe('/boas-vindas');
    expect(signedOutScreen(false, '/criar-conta')).toBe('/criar-conta');
    expect(signedOutScreen(false, '/criar-conta?plano=familia&periodo=mensal')).toBe('/criar-conta?plano=familia&periodo=mensal');
    expect(signedOutScreen(true, null)).toBe('/entrar');
    expect(signedOutScreen(true, '/criar-conta')).toBe('/entrar');
  });

  it('o app lê o endereço uma vez, só na web, e a tela de carregamento usa o destino só sem sessão (com sessão, ele sai sem uso)', () => {
    const layout = ler('apps/app/src/app/_layout.tsx');
    expect(layout).toContain('signupEntryTarget.set(readSignupEntry());');
    expect(layout).toMatch(/function readSignupEntry\(\): string \| null \{\n  if \(Platform\.OS !== 'web'/);
    expect(layout).toContain('signupEntryFrom(window.location.pathname, window.location.search)');
    const carregando = ler('apps/app/src/app/carregando.tsx');
    expect(carregando).toContain('if (user) signupEntryTarget.take();');
    expect(carregando).toContain("status === 'sem-sessao') router.replace(signedOutScreen(afterLogin.pending(), signupEntryTarget.take())");
    // O destino guardado vale uma vez (lib/nav.ts de verdade, com o roteador de mentira).
    const { signupEntryTarget } = loadApp(path.join(APP_DIR, 'src', 'lib', 'nav.ts'), { platform: 'web', mocks: { '@clarevo/core': core, 'expo-router': { router: {} } } });
    expect(signupEntryTarget.take()).toBeNull();
    signupEntryTarget.set('/criar-conta?plano=familia&periodo=mensal');
    expect(signupEntryTarget.take()).toBe('/criar-conta?plano=familia&periodo=mensal');
    expect(signupEntryTarget.take()).toBeNull();
    // De Criar conta, voltar leva às boas-vindas quando não há tela antes, e "Já tenho conta" a Entrar, como antes.
    expect(ler('apps/app/src/components/auth-shell.tsx')).toContain("router.canGoBack() ? router.back() : router.replace('/boas-vindas')");
    expect(ler('apps/app/src/app/criar-conta.tsx')).toContain("router.replace('/entrar')");
  });
});

describe('Criar conta diz o teste grátis (item 2)', () => {
  it('a linha começa pelo texto das boas-vindas e é verdadeira com a compra fechada e aberta', () => {
    expect(signupTrialLine(false)).toBe('14 dias grátis, sem cartão. Por enquanto, o acesso é completo e nada é cobrado.');
    expect(signupTrialLine(true)).toBe('14 dias grátis, sem cartão. O plano você escolhe depois, no app.');
    for (const open of [false, true]) expect(signupTrialLine(open).startsWith(`${WELCOME_TEXT.trial}.`)).toBe(true);
    // Com a compra fechada, a frase é a da tela Assinatura com a compra fechada, sem "Assinatura em breve".
    expect(ACCESS_TEXT.notOpenYet.endsWith('Por enquanto, o acesso é completo e nada é cobrado.')).toBe(true);
    expect(SIGNUP_TEXT.trial).toBe(signupTrialLine(SUBSCRIBE_OPEN));
    expect(ler('apps/app/src/app/criar-conta.tsx')).toContain('note={SIGNUP_TEXT.trial}');
  });
});

describe('a compra na web e nas lojas (itens 3 e 5)', () => {
  it('antes dos botões, o que a página de pagamento do cartão pede, como diz docs/39 (nome, CPF, e-mail e o cartão)', () => {
    expect(WEB_SUBSCRIPTION_TEXT.paymentPageAsks).toBe('Na página de pagamento, você informa nome, CPF, e-mail e os dados do cartão.');
    expect(ler('docs/39_ASAAS.md')).toContain('Lá a pessoa informa nome, CPF, e-mail e o cartão (a Clarevo não coleta nada disso).');
  });

  it('o texto da renovação nas lojas não depende de o preço estar acima (o resumo do contrato vem antes dos planos)', () => {
    expect(STORE_SUBSCRIPTION_TEXT.autoRenew).not.toContain('acima');
    expect(STORE_SUBSCRIPTION_TEXT.autoRenew).toContain('com o preço mostrado no plano');
  });
});

describe('o próximo passo do plano Família (item 4)', () => {
  const NOW = new Date('2026-12-01T12:00:00.000Z');
  const paid: Access = { status: 'assinatura', plan: 'familiar', until: '2027-01-01T12:00:00.000Z', canWrite: true, provider: 'web', period: 'mensal' };
  const me = { personId: 'a', firstName: 'Ana', role: 'titular' as const, status: 'ativo' as const, isMe: true, joinedAt: '2026-12-01', leftAt: null };
  const family = (over: Partial<FamilyOverview> = {}): FamilyOverview =>
    ({ context: { id: 'f', name: 'Casa' }, role: 'titular', members: [me], invites: [], ...over }) as unknown as FamilyOverview;
  const invite = (over: Record<string, unknown> = {}) => ({ id: 'i', contextId: 'f', role: 'membro', createdBy: 'a', expiresAt: '2026-12-08T12:00:00.000Z', usedAt: null, cancelledAt: null, createdAt: '2026-12-01', ...over });

  it('sem Família, criar; titular sozinha e sem convite válido, convidar', () => {
    expect(familyPlanNextStep(paid, null, NOW)).toBe('criar');
    expect(familyPlanNextStep(paid, family(), NOW)).toBe('convidar');
    // Convite vencido, usado ou cancelado não conta.
    expect(familyPlanNextStep(paid, family({ invites: [invite({ expiresAt: '2026-11-30T12:00:00.000Z' })] as never }), NOW)).toBe('convidar');
    expect(familyPlanNextStep(paid, family({ invites: [invite({ cancelledAt: '2026-12-01' })] as never }), NOW)).toBe('convidar');
  });

  it('some com outra pessoa na Família, com um convite válido, sem ser titular ou enquanto a Família não foi lida', () => {
    const davi = { ...me, personId: 'b', firstName: 'Davi', role: 'membro' as const, isMe: false };
    expect(familyPlanNextStep(paid, family({ members: [me, davi] }), NOW)).toBeNull();
    expect(familyPlanNextStep(paid, family({ invites: [invite()] as never }), NOW)).toBeNull();
    expect(familyPlanNextStep(paid, family({ role: 'membro' }), NOW)).toBeNull();
    expect(familyPlanNextStep(paid, undefined, NOW)).toBeNull();
    // Quem saiu não conta como pessoa na Família.
    expect(familyPlanNextStep(paid, family({ members: [me, { ...davi, status: 'ex-membro' as const }] }), NOW)).toBe('convidar');
  });

  it('só com a assinatura Família em vigor da própria pessoa', () => {
    expect(familyPlanNextStep({ ...paid, plan: 'individual' }, null, NOW)).toBeNull();
    for (const status of ['teste', 'leitura', 'pre_lancamento', 'familia', 'beneficio', 'cortesia'] as const) {
      expect(familyPlanNextStep({ ...paid, status }, null, NOW), status).toBeNull();
    }
  });

  it('textos calmos, com o número de pessoas do plano, e a tela leva à criação e ao convite que já existem', () => {
    expect(FAMILY_PLAN_NEXT_TEXT.createTitle).toBe(`Crie a Família e convide até ${FAMILY_MAX_PEOPLE - 1} pessoas`);
    expect(FAMILY_MAX_PEOPLE - 1).toBe(5);
    for (const t of Object.values(FAMILY_PLAN_NEXT_TEXT)) expect(t).not.toMatch(FORBIDDEN);
    const tela = ler('apps/app/src/app/conta/assinatura.tsx');
    expect(tela).toContain("'/familia/nova'");
    expect(tela).toContain("'/familia/convidar'");
  });
});

describe('o app web instalado (item 7)', () => {
  it('a descrição do manifesto é o benefício concreto das boas-vindas, sem a frase antiga', () => {
    const manifest = JSON.parse(ler('apps/app/public/manifest.webmanifest')) as { description: string };
    expect(manifest.description).toBe(WELCOME_TEXT.subtitle);
    expect(manifest.description).not.toMatch(/educação financeira/);
  });
});

describe('textos novos sem termos vetados', () => {
  it('nada de travessão, expressão vetada, recomendação, pressão ou Plus', () => {
    for (const t of [SIGNUP_TEXT.trial, signupTrialLine(true), WEB_SUBSCRIPTION_TEXT.paymentPageAsks, STORE_SUBSCRIPTION_TEXT.autoRenew, ...Object.values(CHOSEN_PLAN_TEXT)]) {
      expect(t, t).not.toMatch(FORBIDDEN);
    }
  });
});
