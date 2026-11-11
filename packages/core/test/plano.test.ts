import { describe, expect, it } from 'vitest';

import {
  ACCESS_TEXT,
  ERROR_TEXT,
  FAMILY_MAX_PEOPLE,
  FULL_ACCESS,
  MemoryRepository,
  PLAN_PRICE_CENTS,
  SUBSCRIBE_OPEN,
  TRIAL_DAYS,
  accessBanner,
  accessView,
  demoTrialAccess,
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
    expect(accessView(at('pre_lancamento', null), NOW, TZ)).toEqual({
      situation: 'Acesso completo',
      body: 'Até o lançamento, o acesso é completo e sem cobrança. Depois, a Clarevo passa a ser paga, com 14 dias grátis para começar.',
      showPlans: true,
    });
    expect(accessView(at('pre_lancamento', '2026-12-01T03:00:00.000Z'), NOW, TZ).body).toBe(
      'A partir de 01/12/2026, a Clarevo passa a ser paga. Quem já usa ganha 14 dias grátis a contar dessa data. Até lá, o acesso é completo e sem cobrança.',
    );
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

  it('a demonstração fica no teste grátis, contado do relógio real', () => {
    const now = NOW.getTime();
    const demo = demoTrialAccess(now);
    expect(demo).toEqual({ status: 'teste', plan: null, until: '2026-11-18T13:00:00.000Z', canWrite: true, provider: null });
    expect(trialDaysLeft(demo, NOW, TZ)).toBe(14);
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
