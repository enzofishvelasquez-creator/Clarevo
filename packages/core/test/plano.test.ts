/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  ACCESS_TEXT,
  ERROR_TEXT,
  SUBSCRIPTION_SCREEN_TEXT,
  FAMILY_MAX_PEOPLE,
  FULL_ACCESS,
  MemoryRepository,
  PLAN_PERIOD_DEFAULT,
  PLAN_PERIOD_ORDER,
  PLAN_PERIOD_PRICE_CENTS,
  PLAN_PERIOD_TEXT,
  PLAN_PRICE_CENTS,
  annualMonthlyEquivalentCents,
  annualSavingCents,
  planPeriodPrice,
  planPeriodPriceAmount,
  SUBSCRIBE_OPEN,
  TRIAL_DAYS,
  accessBanner,
  accessView,
  demoInstant,
  demoTrialAccess,
  DEMO_TODAY,
  guideEntry,
  parseAccess,
  pixPaidThrough,
  planPrice,
  trialDaysLeft,
  type Access,
} from '../src';

const TZ = 'America/Sao_Paulo';
// 04/11/2026, 10:00 em Brasília.
const NOW = new Date('2026-11-04T13:00:00.000Z');
const at = (status: Access['status'], until: string | null, plan: Access['plan'] = null): Access => ({
  status,
  plan,
  until,
  canWrite: status !== 'leitura',
  provider: null,
});

describe('assinatura paga (D-083): preços e textos', () => {
  it('R$ 29,90 e R$ 69,90 por mês, em centavos, 14 dias grátis, compra ainda fechada', () => {
    expect(PLAN_PRICE_CENTS).toEqual({ individual: 2990, familiar: 6990 });
    expect(planPrice('individual')).toBe('R$ 29,90 por mês');
    expect(planPrice('familiar')).toBe('R$ 69,90 por mês');
    expect(TRIAL_DAYS).toBe(14);
    expect(SUBSCRIBE_OPEN).toBe(false);
    expect(ACCESS_TEXT.plans[1].who).toContain(`até ${FAMILY_MAX_PEOPLE} pessoas`);
  });

  it('plano anual (D-125): R$ 269,90 e R$ 629,90 por ano; o equivalente por mês e a diferença para 12 mensalidades, sem exagero', () => {
    expect(PLAN_PERIOD_PRICE_CENTS).toEqual({ individual: { mensal: 2990, anual: 26990 }, familiar: { mensal: 6990, anual: 62990 } });
    expect(PLAN_PERIOD_PRICE_CENTS.individual.mensal).toBe(PLAN_PRICE_CENTS.individual);
    expect(PLAN_PERIOD_PRICE_CENTS.familiar.mensal).toBe(PLAN_PRICE_CENTS.familiar);
    expect(planPeriodPrice('individual', 'anual')).toBe('R$ 269,90 por ano');
    expect(planPeriodPrice('familiar', 'anual')).toBe('R$ 629,90 por ano');
    expect(planPeriodPrice('individual', 'mensal')).toBe(planPrice('individual'));
    expect(planPeriodPriceAmount('familiar', 'anual')).toBe('R$ 629,90');
    // 269,90 / 12 = 22,4916...: R$ 22,49; 629,90 / 12 = 52,4916...: R$ 52,49 (o mais próximo, sem arredondar para baixo de propósito).
    expect([annualMonthlyEquivalentCents('individual'), annualMonthlyEquivalentCents('familiar')]).toEqual([2249, 5249]);
    // 12 × 29,90 = 358,80, menos 269,90 = 88,90; 12 × 69,90 = 838,80, menos 629,90 = 208,90 (a tela diz o valor exato, sem porcentagem).
    expect([annualSavingCents('individual'), annualSavingCents('familiar')]).toEqual([8890, 20890]);
    expect(PLAN_PERIOD_TEXT.equivalent('individual')).toBe('Equivale a R$ 22,49 por mês');
    expect(PLAN_PERIOD_TEXT.saving('individual')).toBe('R$ 88,90 a menos que 12 mensalidades');
    expect(PLAN_PERIOD_TEXT.saving('familiar')).toBe('R$ 208,90 a menos que 12 mensalidades');
    expect(PLAN_PERIOD_TEXT.other('individual', 'anual')).toBe('No mensal: R$ 29,90 por mês');
    expect(PLAN_PERIOD_TEXT.other('familiar', 'mensal')).toBe('No anual: R$ 629,90 por ano, equivale a R$ 52,49 por mês');
    expect(PLAN_PERIOD_TEXT.planLabel('individual', 'anual', 'Para você.')).toBe(
      'Plano Individual anual, R$ 269,90 por ano, equivale a R$ 22,49 por mês. No mensal, R$ 29,90 por mês. Para você.',
    );
    // A escolha: o mensal primeiro e marcado (decisão de 27/11/2026, no lugar do anual primeiro da D-127), sem pressão, sem prazo e sem
    // alarme; sem prometer economia.
    const texts = [
      PLAN_PERIOD_TEXT.choiceLabel,
      PLAN_PERIOD_TEXT.note.store,
      PLAN_PERIOD_TEXT.note.neutral,
      ...Object.values(PLAN_PERIOD_TEXT.option),
      ...Object.values(PLAN_PERIOD_TEXT.optionHint),
      ...(['individual', 'familiar'] as const).flatMap((p) => [
        PLAN_PERIOD_TEXT.equivalent(p),
        PLAN_PERIOD_TEXT.saving(p),
        PLAN_PERIOD_TEXT.other(p, 'anual'),
        PLAN_PERIOD_TEXT.other(p, 'mensal'),
        PLAN_PERIOD_TEXT.planLabel(p, 'anual', ''),
        PLAN_PERIOD_TEXT.planLabel(p, 'mensal', ''),
      ]),
    ];
    expect(Object.keys(PLAN_PERIOD_TEXT.option)).toEqual(['mensal', 'anual']);
    expect(Object.keys(PLAN_PERIOD_TEXT.optionHint)).toEqual(['mensal', 'anual']);
    expect(PLAN_PERIOD_ORDER).toEqual(['mensal', 'anual']);
    expect(PLAN_PERIOD_DEFAULT).toBe('mensal');
    // A tela segue a ordem e o marcado do núcleo, sem lista própria (apps/app/src/components/access-parts.tsx).
    const tela = readFileSync(fileURLToPath(new URL('../../../apps/app/src/components/access-parts.tsx', import.meta.url)), 'utf8');
    expect(tela).toContain('const options = PLAN_PERIOD_ORDER;');
    expect(tela).toContain('chosen?.period ?? PLAN_PERIOD_DEFAULT');
    expect(tela).not.toMatch(/\['anual', 'mensal'\]|\?\? 'anual'/);
    // O guia de uso diz as opções na ordem da tela.
    expect(guideEntry('assinatura')?.steps.some((t) => t.includes('escolha "Mensal" ou "Anual"'))).toBe(true);
    for (const t of texts) {
      expect(t).not.toMatch(/—|–/);
      expect(t).not.toMatch(/fa(z|ç)er? sentido|faz sentido/i);
      expect(t).not.toMatch(/economi|aproveit|promo|só hoje|últim[oa]s? (dias|vagas)|não perca|corra|imperd|grátis por|desconto/i);
      expect(t).not.toMatch(/\bweb\b|Pix|App Store|Google Play/);
      // Sem prometer teste grátis ao anual: o anual no cartão é cobrado no dia, as lojas não têm oferta de teste e a escolha aparece também
      // para quem já passou do teste (o teste da conta fica em ACCESS_TEXT.plansNote).
      expect(t).not.toMatch(/grátis|teste/i);
    }
    // A nota do anual por canal (análise geral de 26/11/2026, D-129): diz que o anual renova (o cartão e as lojas) e que o Pix não. Na web,
    // o cartão e o Pix; nas lojas, sem Pix nem web, com o cancelamento nos ajustes da loja; a neutra (demonstração e guia), sem canal; a do
    // site, sem nome de loja. Nenhuma promete teste grátis ao anual nem economia.
    expect(PLAN_PERIOD_TEXT.note.web).toBe(
      'No anual, os 12 meses são pagos de uma vez. No cartão, a assinatura renova sozinha a cada período até você cancelar; com Pix, não renova: você paga o próximo período se quiser continuar. Os dois períodos têm os mesmos recursos.',
    );
    expect(PLAN_PERIOD_TEXT.note.store).toBe(
      'No anual, os 12 meses são cobrados de uma vez, e a assinatura renova sozinha a cada período até você cancelar nos ajustes da loja. Os dois períodos têm os mesmos recursos.',
    );
    expect(PLAN_PERIOD_TEXT.note.neutral).toBe(
      'No anual, os 12 meses são cobrados de uma vez. A assinatura renova automaticamente a cada período até você cancelar, e o acesso continua até o fim do período já pago; quem paga um período de cada vez não tem renovação.',
    );
    expect(PLAN_PERIOD_TEXT.noteSite).toBe(
      'No anual, os 12 meses são pagos de uma vez. No cartão e pelas lojas de aplicativos, a assinatura renova sozinha ao fim de cada período, pelo mesmo preço, até você cancelar; com Pix, não há renovação: você paga o próximo período se quiser continuar.',
    );
    for (const t of [PLAN_PERIOD_TEXT.note.web, PLAN_PERIOD_TEXT.noteSite]) {
      expect(t).not.toMatch(/—|–|App Store|Google Play|economi|grátis|teste/i);
    }
    expect(PLAN_PERIOD_TEXT.note.web).not.toMatch(/loja/);
    expect(ACCESS_TEXT.plansNote).toContain('Toda conta começa com 14 dias grátis');
    // A compra fechada, sem falar de lançamento (D-129).
    expect(ACCESS_TEXT.notOpenYet).toBe('Assinatura em breve. Por enquanto, o acesso é completo e nada é cobrado.');
    expect(ACCESS_TEXT.notOpenYetShort).toBe('Assinatura em breve.');
    expect(SUBSCRIPTION_SCREEN_TEXT.eyebrow.pre_lancamento).toBe('Sem cobrança por enquanto');
    for (const t of [ACCESS_TEXT.notOpenYet, SUBSCRIPTION_SCREEN_TEXT.eyebrow.pre_lancamento]) expect(t).not.toMatch(/lançamento|Até lá/i);
  });

  it('a recusa do banco tem texto próprio em ERROR_TEXT (e, com ele, nos textos de cada formulário)', () => {
    expect(ERROR_TEXT.assinatura_necessaria).toBe(ACCESS_TEXT.refused);
  });

  it('os textos seguem as regras: sem travessão longo, sem "fazer sentido", sem produto financeiro e sem código de decisão', () => {
    const views = (['pre_lancamento', 'teste', 'leitura', 'assinatura', 'beneficio', 'cortesia', 'familia'] as const).flatMap((s) => {
      const v = accessView(at(s, '2026-11-18T13:00:00.000Z', s === 'assinatura' ? 'familiar' : null), NOW, TZ);
      return [v.situation, v.body];
    });
    const texts = [
      ...views,
      ...Object.values(ACCESS_TEXT).flatMap((v) => (typeof v === 'string' ? [v] : v.map((p) => p.who))),
      accessBanner(at('leitura', null), NOW, TZ)!.text,
      accessBanner(at('teste', '2026-11-05T13:00:00.000Z'), NOW, TZ)!.text,
    ];
    for (const t of texts) {
      expect(t).not.toMatch(/—|–/);
      expect(t).not.toMatch(/fa(z|ç)er? sentido|faz sentido/i);
      expect(t).not.toMatch(/D-0\d\d|cofrinho|caixinha|investimento|empréstimo|crédito pessoal/i);
    }
  });

  it('no app das lojas, nada aponta para pagamento fora da loja (a Apple e o Google recusam)', () => {
    const store = [
      ACCESS_TEXT.howToPayStore,
      ...(['pre_lancamento', 'teste', 'leitura', 'assinatura', 'beneficio', 'cortesia', 'familia'] as const).map(
        (s) => accessView(at(s, '2026-11-18T13:00:00.000Z', s === 'assinatura' ? 'familiar' : null), NOW, TZ).body,
      ),
      ...Object.entries(ACCESS_TEXT)
        .filter(([k, v]) => k !== 'howToPay' && typeof v === 'string')
        .map(([, v]) => v as string),
      // O guia "Como usar o app" também aparece no app das lojas.
      ...(guideEntry('assinatura')?.steps ?? ['sem o tema assinatura no guia']),
    ];
    for (const t of store) expect(t).not.toMatch(/\bweb\b|Pix|site|boleto/i);
    expect(ACCESS_TEXT.howToPay).toContain('Na web, por cartão ou Pix.');
  });
});

describe('parseAccess: a resposta de my_access', () => {
  it('lê as sete situações e recusa o que foge do formato', () => {
    expect(parseAccess({ status: 'teste', plan: null, until: '2026-11-18T13:00:00+00:00', can_write: true })).toEqual({
      status: 'teste',
      plan: null,
      until: '2026-11-18T13:00:00+00:00',
      canWrite: true,
      provider: null,
      period: null,
    });
    // De onde vem o direito (migração 0026): só os valores conhecidos; o app antigo nem recebia a chave.
    expect(parseAccess({ status: 'assinatura', plan: 'individual', until: null, can_write: true, provider: 'web' }).provider).toBe('web');
    expect(parseAccess({ status: 'cortesia', plan: 'individual', until: null, can_write: true, provider: 'equipe' }).provider).toBe('equipe');
    expect(parseAccess({ status: 'assinatura', plan: 'individual', until: null, can_write: true, provider: 'loja' }).provider).toBeNull();
    expect(parseAccess({ status: 'assinatura', plan: 'familiar', until: null, can_write: true }).plan).toBe('familiar');
    expect(parseAccess({ status: 'leitura', plan: null, until: '2026-11-01T00:00:00Z', can_write: false }).canWrite).toBe(false);
    expect(() => parseAccess(null)).toThrow('acesso_invalido');
    expect(() => parseAccess({ status: 'gratis', can_write: true })).toThrow('acesso_invalido');
    expect(() => parseAccess({ status: 'teste' })).toThrow('acesso_invalido');
    // Só leitura nunca escreve, e nenhuma outra situação deixa de escrever.
    expect(() => parseAccess({ status: 'leitura', can_write: true })).toThrow('acesso_invalido');
    expect(() => parseAccess({ status: 'teste', can_write: false })).toThrow('acesso_invalido');
    // Plano ou data fora do formato viram nulos.
    expect(parseAccess({ status: 'cortesia', plan: 'outro', until: 'amanhã', can_write: true })).toMatchObject({ plan: null, until: null });
  });

  it('o período da assinatura (D-127, migração 0047): só na assinatura e só os dois valores; sem a chave (banco de antes), nulo', () => {
    expect(parseAccess({ status: 'assinatura', plan: 'individual', until: null, can_write: true, provider: 'apple', period: 'anual' }).period).toBe('anual');
    expect(parseAccess({ status: 'assinatura', plan: 'individual', until: null, can_write: true, provider: 'pix', period: 'mensal' }).period).toBe('mensal');
    expect(parseAccess({ status: 'assinatura', plan: 'individual', until: null, can_write: true, provider: 'web' }).period).toBeNull();
    expect(parseAccess({ status: 'assinatura', plan: 'individual', until: null, can_write: true, provider: 'web', period: 'semestral' }).period).toBeNull();
    // Fora da assinatura, o período não vale (o banco o manda nulo; o app não confia no contrário).
    expect(parseAccess({ status: 'cortesia', plan: 'individual', until: null, can_write: true, provider: 'equipe', period: 'anual' }).period).toBeNull();
    expect(parseAccess({ status: 'familia', plan: 'familiar', until: null, can_write: true, period: 'anual' }).period).toBeNull();
  });
});

describe('teste grátis: dias que faltam, no fuso da pessoa', () => {
  it('conta dias de calendário até o fim; 0 no último dia; nulo fora do teste', () => {
    expect(trialDaysLeft(at('teste', '2026-11-18T13:00:00.000Z'), NOW, TZ)).toBe(14);
    expect(trialDaysLeft(at('teste', '2026-11-05T02:00:00.000Z'), NOW, TZ)).toBe(0); // 23:00 de 04/11 em Brasília
    expect(trialDaysLeft(at('teste', '2026-11-05T04:00:00.000Z'), NOW, TZ)).toBe(1); // 01:00 de 05/11 em Brasília
    expect(trialDaysLeft(at('leitura', '2026-11-01T13:00:00.000Z'), NOW, TZ)).toBeNull();
    expect(trialDaysLeft(at('assinatura', '2026-12-01T13:00:00.000Z', 'individual'), NOW, TZ)).toBeNull();
  });

  it('o aviso do Resumo só aparece nos últimos 3 dias e em só leitura', () => {
    expect(accessBanner(at('teste', '2026-11-08T13:00:00.000Z'), NOW, TZ)).toBeNull();
    expect(accessBanner(at('teste', '2026-11-07T13:00:00.000Z'), NOW, TZ)?.text).toBe(
      'O seu teste grátis termina em 3 dias. Depois, sem assinatura, a conta fica só para ver e exportar.',
    );
    expect(accessBanner(at('teste', '2026-11-05T13:00:00.000Z'), NOW, TZ)?.text).toContain('termina amanhã');
    expect(accessBanner(at('teste', '2026-11-04T20:00:00.000Z'), NOW, TZ)?.text).toContain('termina hoje');
    expect(accessBanner(at('leitura', '2026-11-01T13:00:00.000Z'), NOW, TZ)).toEqual({
      text: 'Sem assinatura ativa, a conta está só para ver e exportar. Para voltar a anotar, assine um dos planos.',
      tone: 'aviso',
    });
    for (const s of ['pre_lancamento', 'assinatura', 'beneficio', 'cortesia', 'familia'] as const) {
      expect(accessBanner(at(s, '2026-11-05T13:00:00.000Z', 'individual'), NOW, TZ)).toBeNull();
    }
  });
});

describe('accessView: a tela Assinatura e o card de Conta', () => {
  it('antes do início da cobrança: acesso completo, com a data quando marcada', () => {
    // Sem falar de lançamento (D-129). O teste de quem já usa conta do início da cobrança (my_access, migração 0047).
    expect(accessView(at('pre_lancamento', null), NOW, TZ)).toEqual({
      situation: 'Acesso completo',
      body: 'Por enquanto, o acesso é completo e sem cobrança. Quando a Clarevo passar a ser paga, você terá 14 dias grátis antes de precisar assinar.',
      showPlans: true,
    });
    expect(accessView(at('pre_lancamento', '2026-12-01T03:00:00.000Z'), NOW, TZ).body).toBe(
      'A partir de 01/12/2026, a Clarevo passa a ser paga. Quem já usa ganha 14 dias grátis a contar dessa data. Até essa data, o acesso é completo e sem cobrança.',
    );
  });

  it('com o período (D-127): "Plano Individual anual" e "Assinatura anual ativa, renova em ..."; sem ele, como antes', () => {
    const annual: Access = { ...at('assinatura', '2027-11-26T13:00:00.000Z', 'individual'), provider: 'apple', period: 'anual' };
    expect(accessView(annual, NOW, TZ)).toEqual({
      situation: 'Plano Individual anual',
      body: 'Assinatura anual ativa, renova em 26/11/2027. Para cancelar ou mudar de plano, use o mesmo lugar onde assinou.',
      showPlans: false,
    });
    const monthly: Access = { ...at('assinatura', '2026-12-04T13:00:00.000Z', 'familiar'), provider: 'google', period: 'mensal' };
    expect(accessView(monthly, NOW, TZ)).toMatchObject({ situation: 'Plano Família mensal', body: expect.stringContaining('Assinatura mensal ativa, renova em 04/12/2026') });
    // O cartão anual na web, com a situação lida no Asaas.
    const card: Access = { ...annual, provider: 'web' };
    // D-129: o caminho do cancelamento com o nome do botão. Na tela Assinatura, ele vem logo abaixo; no card de Conta, por "Ver a assinatura".
    expect(accessView(card, NOW, TZ, { web: true, webSubscription: { active: true, nextDueDate: '2027-11-23' }, cancelBelow: true }).body).toBe(
      'Assinatura anual ativa, renova em 23/11/2027. Para cancelar, toque em Cancelar assinatura, logo abaixo.',
    );
    expect(accessView(card, NOW, TZ, { web: true, webSubscription: { active: true, nextDueDate: '2027-11-23' } }).body).toBe(
      'Assinatura anual ativa, renova em 23/11/2027. Para cancelar, toque em Ver a assinatura e depois em Cancelar assinatura.',
    );
  });

  it('assinou no cartão durante o teste (D-129): continua no teste, com a primeira cobrança no fim dele, sem os planos e sem comemoração', () => {
    const trial = at('teste', '2026-11-18T13:00:00.000Z');
    expect(accessView(trial, NOW, TZ, { web: true, firstCharge: '2026-11-18', cancelBelow: true })).toEqual({
      situation: 'Teste grátis',
      body: 'O seu teste grátis termina em 14 dias, em 18/11/2026. A assinatura no cartão já está feita: a primeira cobrança é em 18/11/2026, quando o teste grátis acaba. Até lá, nada é cobrado.',
      showPlans: false,
      eyebrow: 'Assinatura feita',
    });
    // No app das lojas, nada aponta para a web.
    expect(accessView(trial, NOW, TZ, { firstCharge: '2026-11-18' }).body).toBe(
      'O seu teste grátis termina em 14 dias, em 18/11/2026. Você já assinou: a primeira cobrança é em 18/11/2026, quando o teste grátis acaba. Para cancelar, use o mesmo lugar onde assinou.',
    );
    // Sem a primeira cobrança pendente (cancelada, ou nunca assinou): o teste de sempre, com os planos.
    expect(accessView(trial, NOW, TZ, { web: true, firstCharge: null })).toMatchObject({ showPlans: true });
    expect(accessView(trial, NOW, TZ, { web: true })).not.toHaveProperty('eyebrow');
    // A oeste de Brasília, o teste acaba na véspera do dia da cobrança (as duas datas, sem contradição).
    const lateTrial = at('teste', '2026-11-18T03:30:00.000Z');
    expect(accessView(lateTrial, NOW, 'America/Manaus', { web: true, firstCharge: '2026-11-18' }).body).toContain(
      'em 17/11/2026. A assinatura no cartão já está feita: a primeira cobrança é em 18/11/2026, no dia seguinte ao fim do teste grátis.',
    );
  });

  it('o dia da primeira cobrança (D-129): o banco já diz "assinatura", mas nada foi pago; sem "renova em", com o cancelamento sem cobrança', () => {
    const onDay: Access = { status: 'assinatura', plan: 'individual', until: '2026-11-22T02:59:59.999Z', canWrite: true, provider: 'web', period: 'mensal' };
    expect(accessView(onDay, NOW, TZ, { web: true, webSubscription: { active: true, nextDueDate: '2026-12-18' }, firstCharge: '2026-11-18', cancelBelow: true })).toEqual({
      situation: 'Plano Individual mensal',
      body: 'A assinatura no cartão já está feita, e a primeira cobrança, marcada para 18/11/2026, ainda não foi confirmada. Se cancelar antes da confirmação, nada é cobrado. Para cancelar, toque em Cancelar assinatura, logo abaixo.',
      showPlans: false,
      eyebrow: 'Assinatura feita',
    });
    expect(accessView(onDay, NOW, TZ, { firstCharge: '2026-11-18' }).body).toBe(
      'Você já assinou, e a primeira cobrança, marcada para 18/11/2026, ainda não foi confirmada. Para cancelar, use o mesmo lugar onde assinou.',
    );
    // Paga, a de sempre: "renova em".
    expect(accessView(onDay, NOW, TZ, { web: true, webSubscription: { active: true, nextDueDate: '2026-12-18' }, cancelBelow: true }).body).toContain('renova em 18/12/2026');
  });

  it('o aviso do fim do teste no Resumo para quem assinou no teste (D-129): o dia da primeira cobrança, com o atalho para a assinatura; no app das lojas, nenhum', () => {
    const ending = at('teste', '2026-11-06T13:00:00.000Z');
    expect(accessBanner(ending, NOW, TZ, { web: true, firstCharge: '2026-11-06' })).toEqual({
      text: 'A primeira cobrança da sua assinatura no cartão é em 06/11/2026, quando o teste grátis acaba.',
      tone: 'info',
      action: 'Ver a assinatura',
    });
    expect(accessBanner(ending, NOW, TZ, { firstCharge: '2026-11-06' })).toBeNull();
    expect(accessBanner(ending, NOW, TZ, { web: true })?.text).toContain('Depois, sem assinatura, a conta fica só para ver e exportar.');
  });

  it('teste, só leitura e as situações pagas', () => {
    expect(accessView(at('teste', '2026-11-18T13:00:00.000Z'), NOW, TZ)).toEqual({
      situation: 'Teste grátis',
      body: 'O seu teste grátis termina em 14 dias, em 18/11/2026. Depois, sem assinatura, a conta fica só para ver e exportar. Nada é cobrado sem você assinar.',
      showPlans: true,
    });
    expect(accessView(at('leitura', '2026-11-01T13:00:00.000Z'), NOW, TZ)).toEqual({
      situation: 'Só ver e exportar',
      body: 'Sem assinatura ativa, a conta está só para ver e exportar. Os seus dados continuam aqui: você vê e exporta tudo. Para voltar a anotar, assine um dos planos.',
      showPlans: true,
    });
    const paid = accessView(at('assinatura', '2026-12-04T13:00:00.000Z', 'familiar'), NOW, TZ);
    expect(paid).toMatchObject({ situation: 'Plano Família', showPlans: false });
    expect(paid.body).toContain('renova em 04/12/2026');
    expect(accessView(at('beneficio', null, 'individual'), NOW, TZ)).toMatchObject({ situation: 'Benefício pela empresa', showPlans: false });
    expect(accessView(at('cortesia', null, 'individual'), NOW, TZ).body).toBe('Acesso completo oferecido pela Clarevo, sem cobrança.');
    expect(accessView(at('familia', null, 'familiar'), NOW, TZ)).toMatchObject({ situation: 'Plano Família', showPlans: false });
  });
});

describe('repositório em memória e demonstração', () => {
  it('sem opção, acesso pleno; com a opção, o que my_access devolveria', async () => {
    const base = { actorId: 'p1', displayName: 'Pessoa Exemplo', today: () => '2026-11-04' };
    expect(await new MemoryRepository(base).getMyAccess()).toEqual(FULL_ACCESS);
    const readOnly = at('leitura', '2026-11-01T13:00:00.000Z');
    expect(await new MemoryRepository({ ...base, access: () => readOnly }).getMyAccess()).toEqual(readOnly);
  });

  it('a demonstração fica no teste grátis, contado do dia dela (o mesmo relógio das telas na demonstração)', () => {
    const demo = demoTrialAccess(DEMO_TODAY);
    expect(demo).toMatchObject({ status: 'teste', plan: null, until: '2026-10-21T12:00:00.000Z', canWrite: true, provider: null });
    expect(demo.period ?? null).toBeNull();
    expect(demoInstant(DEMO_TODAY).toISOString()).toBe('2026-10-07T12:00:00.000Z');
    expect(trialDaysLeft(demo, demoInstant(DEMO_TODAY), TZ)).toBe(14);
  });
});

describe('Pix mês a mês (D-093, caminho B): a situação e o aviso', () => {
  // Pago até 05/12, com os 3 dias de tolerância: acesso até 08/12 (fim do dia em Brasília).
  const pix = (until: string | null): Access => ({ status: 'assinatura', plan: 'individual', until, canWrite: true, provider: 'pix' });
  const UNTIL = '2026-12-09T02:59:59.999Z';

  it('a origem "pix" vem de my_access', () => {
    expect(parseAccess({ status: 'assinatura', plan: 'individual', until: UNTIL, can_write: true, provider: 'pix' }).provider).toBe('pix');
  });

  it('na web, a situação diz o último dia pago (sem anunciar a tolerância) e que o Pix não renova sozinho; no app das lojas, só até quando', () => {
    const web = accessView(pix(UNTIL), NOW, TZ, { web: true });
    expect(pixPaidThrough(pix(UNTIL), TZ)).toBe('2026-12-05');
    expect(web.situation).toBe('Plano Individual');
    expect(web.body).toBe('Pago com Pix até 05/12/2026. O Pix não renova sozinho: pague o próximo mês até essa data, aqui na tela Assinatura.');
    expect(web.showPlans).toBe(false);
    // Na tolerância (06/12 a 08/12), o acesso continua, e a tela diz que o mês terminou.
    expect(accessView(pix(UNTIL), new Date('2026-12-07T13:00:00.000Z'), TZ, { web: true }).body).toBe(
      'O mês pago com Pix terminou em 05/12/2026. Para continuar anotando, pague o próximo mês aqui na tela Assinatura.',
    );
    const store = accessView(pix(UNTIL), NOW, TZ);
    expect(store.body).toBe('Acesso completo até 08/12/2026.');
    expect(store.body).not.toMatch(/\bweb\b|Pix|site|boleto/i);
    // A assinatura no cartão segue com o texto de sempre.
    expect(accessView({ ...pix(UNTIL), provider: 'web' }, NOW, TZ, { web: true }).body).toContain('renova em 08/12/2026');
    expect(pixPaidThrough({ ...pix(UNTIL), provider: 'web' }, TZ)).toBeNull();
  });

  it('o aviso no Resumo: só na web, nos últimos 7 dias do mês pago e na tolerância, com o atalho "Pagar o próximo mês"; no app das lojas, nada', () => {
    expect(accessBanner(pix(UNTIL), NOW, TZ, { web: true })).toBeNull();
    const near = new Date('2026-11-28T13:00:00.000Z');
    expect(accessBanner(pix(UNTIL), near, TZ, { web: true })).toEqual({
      text: 'O mês pago com Pix vai até 05/12/2026. Para continuar anotando depois, pague o próximo mês.',
      tone: 'info',
      action: 'Pagar o próximo mês',
    });
    expect(accessBanner(pix(UNTIL), new Date('2026-11-27T13:00:00.000Z'), TZ, { web: true })).toBeNull();
    expect(accessBanner(pix(UNTIL), new Date('2026-12-04T13:00:00.000Z'), TZ, { web: true })?.text).toContain('termina amanhã');
    expect(accessBanner(pix(UNTIL), new Date('2026-12-05T13:00:00.000Z'), TZ, { web: true })?.text).toContain('termina hoje');
    expect(accessBanner(pix(UNTIL), new Date('2026-12-07T13:00:00.000Z'), TZ, { web: true })).toEqual({
      text: 'O mês pago com Pix terminou em 05/12/2026. Para continuar anotando, pague o próximo mês.',
      tone: 'aviso',
      action: 'Pagar o próximo mês',
    });
    expect(accessBanner(pix(UNTIL), near, TZ)).toBeNull();
    expect(accessBanner(pix(null), near, TZ, { web: true })).toBeNull();
    for (const t of [accessBanner(pix(UNTIL), near, TZ, { web: true })!.text, accessView(pix(UNTIL), NOW, TZ, { web: true }).body]) {
      expect(t).not.toMatch(/—|–|fazer sentido/);
    }
  });
});

describe('Pix de um ano (D-127): a situação e o aviso, com "ano" no lugar de "mês"', () => {
  // Pago até 05/11/2027 com Pix de um ano, mais os 3 dias de tolerância: acesso até 08/11/2027 (fim do dia em Brasília).
  const pixYear = (until: string | null): Access => ({ status: 'assinatura', plan: 'familiar', until, canWrite: true, provider: 'pix', period: 'anual' });
  const UNTIL = '2027-11-09T02:59:59.999Z';

  it('na web, "Pago com Pix até ..." e "pague o próximo ano"; no app das lojas, só até quando', () => {
    const web = accessView(pixYear(UNTIL), NOW, TZ, { web: true });
    expect(web.situation).toBe('Plano Família anual');
    expect(web.body).toBe('Pago com Pix até 05/11/2027. O Pix não renova sozinho: pague o próximo ano até essa data, aqui na tela Assinatura.');
    expect(accessView(pixYear(UNTIL), new Date('2027-11-07T13:00:00.000Z'), TZ, { web: true }).body).toBe(
      'O ano pago com Pix terminou em 05/11/2027. Para continuar anotando, pague o próximo ano aqui na tela Assinatura.',
    );
    expect(accessView(pixYear(UNTIL), NOW, TZ).body).toBe('Acesso completo até 08/11/2027.');
  });

  it('o aviso no Resumo começa 14 dias antes do fim do ano pago (7 no mensal), com "Pagar o próximo ano"', () => {
    expect(accessBanner(pixYear(UNTIL), new Date('2027-10-21T13:00:00.000Z'), TZ, { web: true })).toBeNull();
    expect(accessBanner(pixYear(UNTIL), new Date('2027-10-22T13:00:00.000Z'), TZ, { web: true })).toEqual({
      text: 'O ano pago com Pix vai até 05/11/2027. Para continuar anotando depois, pague o próximo ano.',
      tone: 'info',
      action: 'Pagar o próximo ano',
    });
    expect(accessBanner(pixYear(UNTIL), new Date('2027-11-07T13:00:00.000Z'), TZ, { web: true })?.tone).toBe('aviso');
    expect(accessBanner(pixYear(UNTIL), new Date('2027-10-22T13:00:00.000Z'), TZ)).toBeNull();
  });
});

describe('a tela Assinatura com cor e celebração (pedido do Enzo, 12/11/2026)', () => {
  const card = (until: string): Access => ({ status: 'assinatura', plan: 'individual', until, canWrite: true, provider: 'web' });
  const UNTIL = '2026-12-16T02:59:59.999Z'; // 15/12 em Brasília: pago até 12/12, mais 3 dias de tolerância

  it('a assinatura no cartão com a situação lida no Asaas: a renovação de verdade, ou cancelada até o fim do período pago', () => {
    expect(accessView(card(UNTIL), NOW, TZ, { web: true }).body).toContain('renova em 15/12/2026');
    expect(accessView(card(UNTIL), NOW, TZ, { web: true, webSubscription: { active: true, nextDueDate: '2026-12-12' }, cancelBelow: true }).body).toBe(
      'Assinatura ativa, renova em 12/12/2026. Para cancelar, toque em Cancelar assinatura, logo abaixo.',
    );
    expect(accessView(card(UNTIL), NOW, TZ, { web: true, webSubscription: { active: false } }).body).toBe(
      'Assinatura cancelada: o acesso completo continua até 15/12/2026, sem nova cobrança.',
    );
    // Sem a situação do Asaas (não deu para saber), o texto de sempre.
    expect(accessView(card(UNTIL), NOW, TZ, { web: true, webSubscription: null }).body).toContain('renova em 15/12/2026');
  });

  it('os textos novos seguem as regras e não apontam pagamento fora da loja (aparecem também no celular)', () => {
    const T = SUBSCRIPTION_SCREEN_TEXT;
    const texts = [
      ...Object.values(T.eyebrow),
      T.eyebrowCanceled,
      T.celebrate,
      T.justPaidEyebrow,
      T.justPaidTitle('individual'),
      T.justPaidTitle('familiar'),
      ...[0, 1, 14].flatMap((d) => [T.trialDays(d), T.trialDaysCaption(d)]),
      T.trialProgressLabel,
      T.benefitsTitle,
      T.benefitsTitleSubscribed,
      ...T.benefits.map((b) => b.text),
      T.perMonth,
    ];
    for (const t of texts) {
      expect(t).not.toMatch(/—|–/);
      expect(t).not.toMatch(/fa(z|ç)er? sentido|faz sentido/i);
      expect(t).not.toMatch(/\bweb\b|Pix|site|boleto|cartão de crédito/i);
      expect(t).not.toMatch(/bem-vind[oa]|obrigad[oa]/i);
    }
    expect(T.justPaidTitle('familiar')).toBe('Boas-vindas ao plano Família!');
    expect(T.trialDays(0)).toBe('Último dia');
    expect(T.benefits.some((b) => b.text.includes('até 6 pessoas'))).toBe(true);
  });
});
