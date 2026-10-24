import { describe, expect, it } from 'vitest';
import {
  MemoryRepository,
  SIGNUP_SOURCES,
  SIGNUP_SOURCE_LABEL,
  SIGNUP_SOURCE_NOT_NOW_DAYS,
  SIGNUP_SOURCE_TEXT,
  isRepoError,
  newOperationKey,
  shouldAskSignupSource,
  signupSourceError,
  signupSourceErrorText,
  signupSourceNotNowUntil,
  signupSourceTextSamples,
  type RepoError,
  type RepoErrorCode,
  type SignupSourceOption,
} from '../src';

/**
 * "Como você conheceu o Clarevo?" (D-067, item 2; migração 0018): a pergunta opcional, a lista fechada de origens, quando o cartão do
 * Resumo aparece (nunca no primeiro dia, nunca depois de responder, "Agora não" por 30 dias) e o repositório em memória, com as mesmas
 * regras de set_signup_source (testadas no banco em 98_como_conheceu.sql).
 */
const key = () => newOperationKey();

async function expectCode(p: Promise<unknown>, code: RepoErrorCode, detail?: string) {
  let error: unknown = null;
  try {
    await p;
  } catch (e) {
    error = e;
  }
  expect(isRepoError(error, code), `esperava ${code}, veio ${error instanceof Error ? (error as RepoError).code : String(error)}`).toBe(true);
  if (detail !== undefined) expect((error as RepoError).detail).toBe(detail);
}

async function freshRepo(day = '2026-10-07') {
  const clock = { today: day };
  const repo = new MemoryRepository({ actorId: 'pessoa-teste', displayName: 'Pessoa de teste', today: () => clock.today });
  const space = await repo.ensurePersonalSpace('Conta principal');
  return { repo, ctx: space.personalContextId, accountId: space.accounts[0]!.id, clock };
}

describe('as origens', () => {
  it('são seis, na ordem das telas, com os nomes pedidos', () => {
    expect(SIGNUP_SOURCES).toEqual(['instagram', 'indicacao', 'empresa', 'busca', 'outro', 'prefiro_nao_dizer']);
    expect(SIGNUP_SOURCES.map((s) => SIGNUP_SOURCE_LABEL[s])).toEqual([
      'Instagram',
      'Indicação de alguém',
      'Empresa onde trabalho',
      'Busca na internet',
      'Outro',
      'Prefiro não dizer',
    ]);
  });

  it('só as seis, escritas exatamente como o banco guarda', () => {
    for (const s of SIGNUP_SOURCES) expect(signupSourceError(s)).toBeNull();
    for (const bad of ['', ' ', 'Instagram', 'INSTAGRAM', ' instagram', 'instagram ', 'facebook', 'indicação', 'prefiro não dizer', 'outro: um amigo', null, undefined, 7, {}]) {
      expect(signupSourceError(bad), String(bad)).toBe('origem_invalida');
    }
  });
});

describe('quando o cartão do Resumo aparece', () => {
  const device = (firstSeenOn: string | null, notNowUntil: string | null = null) => ({ firstSeenOn, notNowUntil });

  it('nunca antes de o aparelho ter visto o Resumo, nem no primeiro dia', () => {
    expect(shouldAskSignupSource({ answered: false, today: '2026-10-07', device: device(null) })).toBe(false);
    expect(shouldAskSignupSource({ answered: false, today: '2026-10-07', device: device('2026-10-07') })).toBe(false);
    // O relógio andou para trás (fuso, aparelho): continua sem perguntar.
    expect(shouldAskSignupSource({ answered: false, today: '2026-10-06', device: device('2026-10-07') })).toBe(false);
  });

  it('a partir do dia seguinte ao primeiro dia de uso', () => {
    expect(shouldAskSignupSource({ answered: false, today: '2026-10-08', device: device('2026-10-07') })).toBe(true);
    expect(shouldAskSignupSource({ answered: false, today: '2026-12-31', device: device('2026-10-07') })).toBe(true);
  });

  it('responder some para sempre', () => {
    expect(shouldAskSignupSource({ answered: true, today: '2026-10-08', device: device('2026-10-07') })).toBe(false);
    expect(shouldAskSignupSource({ answered: true, today: '2027-10-08', device: device('2026-10-07', '2026-10-01') })).toBe(false);
  });

  it('"Agora não" some por 30 dias e volta no dia 30', () => {
    expect(SIGNUP_SOURCE_NOT_NOW_DAYS).toBe(30);
    const until = signupSourceNotNowUntil('2026-10-08');
    expect(until).toBe('2026-11-07');
    expect(shouldAskSignupSource({ answered: false, today: '2026-10-08', device: device('2026-10-07', until) })).toBe(false);
    expect(shouldAskSignupSource({ answered: false, today: '2026-11-06', device: device('2026-10-07', until) })).toBe(false);
    expect(shouldAskSignupSource({ answered: false, today: '2026-11-07', device: device('2026-10-07', until) })).toBe(true);
    expect(shouldAskSignupSource({ answered: false, today: '2026-11-08', device: device('2026-10-07', until) })).toBe(true);
  });

  it('o fim do mês e do ano contam os 30 dias do calendário', () => {
    expect(signupSourceNotNowUntil('2026-12-15')).toBe('2027-01-14');
    expect(signupSourceNotNowUntil('2028-02-01')).toBe('2028-03-02');
  });
});

describe('o repositório em memória (as regras de set_signup_source)', () => {
  it('conta nova não tem resposta', async () => {
    const { repo } = await freshRepo();
    expect(await repo.getSignupSource()).toBeNull();
  });

  it('a primeira resposta vale 1; mudar a origem soma 1; a mesma origem não grava', async () => {
    const { repo, clock } = await freshRepo();
    const first = await repo.setSignupSource(key(), 0, 'instagram');
    expect(first).toMatchObject({ source: 'instagram', version: 1 });
    expect(first.answeredAt).toBe(first.updatedAt);
    expect(await repo.getSignupSource()).toEqual(first);
    clock.today = '2026-10-09';
    const second = await repo.setSignupSource(key(), 1, 'busca');
    expect(second).toMatchObject({ source: 'busca', version: 2, answeredAt: first.answeredAt });
    const same = await repo.setSignupSource(key(), 2, 'busca');
    expect(same).toEqual(second);
    expect(await repo.getSignupSource()).toEqual(second);
    for (const [i, s] of (['indicacao', 'empresa', 'outro', 'prefiro_nao_dizer'] as SignupSourceOption[]).entries()) {
      expect(await repo.setSignupSource(key(), 2 + i, s)).toMatchObject({ source: s, version: 3 + i });
    }
  });

  it('versão: sem resposta é 0; versão velha, nula ou negativa é recusada com a atual', async () => {
    const { repo } = await freshRepo();
    await expectCode(repo.setSignupSource(key(), 1, 'instagram'), 'versao_desatualizada', 'versao_atual=0');
    await expectCode(repo.setSignupSource(key(), -1, 'instagram'), 'versao_desatualizada', 'versao_atual=0');
    await expectCode(repo.setSignupSource(key(), null as unknown as number, 'instagram'), 'versao_desatualizada', 'versao_atual=0');
    await repo.setSignupSource(key(), 0, 'instagram');
    await expectCode(repo.setSignupSource(key(), 0, 'busca'), 'versao_desatualizada', 'versao_atual=1');
    await expectCode(repo.setSignupSource(key(), 2, 'busca'), 'versao_desatualizada', 'versao_atual=1');
    // Com a versão velha, até a mesma origem é recusada.
    await expectCode(repo.setSignupSource(key(), 0, 'instagram'), 'versao_desatualizada', 'versao_atual=1');
    expect(await repo.getSignupSource()).toMatchObject({ source: 'instagram', version: 1 });
  });

  it('origem fora da lista é recusada antes da versão, e nada é gravado', async () => {
    const { repo } = await freshRepo();
    for (const bad of ['Instagram', 'facebook', '', 'outro: amigo']) {
      await expectCode(repo.setSignupSource(key(), 9, bad as SignupSourceOption), 'origem_invalida');
    }
    expect(await repo.getSignupSource()).toBeNull();
  });

  it('a mesma chave e o mesmo pedido devolvem a resposta de agora; outro pedido é chave_reutilizada', async () => {
    const { repo } = await freshRepo();
    const k = key();
    const first = await repo.setSignupSource(k, 0, 'instagram');
    expect(await repo.setSignupSource(k, 0, 'instagram')).toEqual(first);
    await expectCode(repo.setSignupSource(k, 0, 'busca'), 'chave_reutilizada');
    await expectCode(repo.setSignupSource(k, 1, 'instagram'), 'chave_reutilizada');
    // A chave de outra operação também.
    const other = await freshRepo();
    const rec = key();
    await other.repo.createRecord(rec, other.ctx, 'despesa', { accountId: other.accountId, amountCents: 1500, occurredOn: '2026-10-05', description: 'Café', category: null });
    await expectCode(other.repo.setSignupSource(rec, 0, 'instagram'), 'chave_reutilizada');
    // Depois de a resposta mudar, repetir a primeira chave devolve a resposta de agora, sem erro.
    await repo.setSignupSource(key(), 1, 'empresa');
    expect(await repo.setSignupSource(k, 0, 'instagram')).toMatchObject({ source: 'empresa', version: 2 });
  });

  it('resultado perdido (gravou, a resposta se perdeu): repetir a chave reconcilia, sem versão a mais', async () => {
    const { repo } = await freshRepo();
    const k = key();
    repo.failNextWrite = 'depois';
    await expectCode(repo.setSignupSource(k, 0, 'indicacao'), 'rede');
    // Gravou e a resposta se perdeu: repetir a mesma chave devolve a resposta gravada, sem uma versão a mais.
    const again = await repo.setSignupSource(k, 0, 'indicacao');
    expect(again).toMatchObject({ source: 'indicacao', version: 1 });
    expect(await repo.getSignupSource()).toMatchObject({ source: 'indicacao', version: 1 });
  });

  it('não conta como anotação: a atividade e a revisão dos últimos meses não mudam', async () => {
    const { repo, ctx, accountId, clock } = await freshRepo('2026-10-07');
    await repo.createRecord(key(), ctx, 'despesa', { accountId, amountCents: 1500, occurredOn: '2026-10-05', description: 'Café', category: null });
    const before = await repo.getReturnReviewState(ctx);
    expect(before.activity?.lastWriteOn).toBe('2026-10-07');
    clock.today = '2026-10-20';
    await repo.setSignupSource(key(), 0, 'instagram');
    await repo.setSignupSource(key(), 1, 'busca');
    expect(await repo.getReturnReviewState(ctx)).toEqual(before);
    // Controle: anotar de verdade conta.
    await repo.createRecord(key(), ctx, 'despesa', { accountId, amountCents: 900, occurredOn: '2026-10-19', description: 'Pão', category: null });
    expect((await repo.getReturnReviewState(ctx)).activity?.lastWriteOn).toBe('2026-10-20');
  });

  it('não muda nenhum registro, total ou conta', async () => {
    const { repo, ctx, accountId } = await freshRepo();
    await repo.createRecord(key(), ctx, 'despesa', { accountId, amountCents: 1500, occurredOn: '2026-10-05', description: 'Café', category: null });
    const records = JSON.stringify(await repo.listRecords(ctx, '2026-10'));
    const space = JSON.stringify(await repo.getSpace());
    await repo.setSignupSource(key(), 0, 'prefiro_nao_dizer');
    expect(JSON.stringify(await repo.listRecords(ctx, '2026-10'))).toBe(records);
    expect(JSON.stringify(await repo.getSpace())).toBe(space);
  });

  it('sem espaço pessoal não responde (sem_permissao), e depois de excluir a conta a resposta some', async () => {
    const clock = { today: '2026-10-07' };
    const empty = new MemoryRepository({ actorId: 'pessoa-sem-espaco', displayName: 'Sem espaço', today: () => clock.today });
    await expectCode(empty.setSignupSource(key(), 0, 'instagram'), 'sem_permissao');
    expect(await empty.getSignupSource()).toBeNull();

    const { repo } = await freshRepo();
    await repo.setSignupSource(key(), 0, 'instagram');
    expect(await repo.getSignupSource()).not.toBeNull();
    await repo.deleteMyAccount('EXCLUIR', key());
    expect(await repo.getSignupSource()).toBeNull();
    await expectCode(repo.setSignupSource(key(), 0, 'instagram'), 'sem_permissao');
  });

  it('falha de rede antes de gravar não deixa nada', async () => {
    const { repo } = await freshRepo();
    repo.failNextWrite = 'antes';
    await expectCode(repo.setSignupSource(key(), 0, 'instagram'), 'rede');
    expect(await repo.getSignupSource()).toBeNull();
  });
});

describe('textos', () => {
  it('as frases pedidas, exatamente', () => {
    expect(SIGNUP_SOURCE_TEXT.title).toBe('Como você conheceu o Clarevo?');
    expect(SIGNUP_SOURCE_TEXT.note).toBe('Opcional. Usamos só para contar, sem identificar ninguém, de onde as pessoas chegam.');
    expect(SIGNUP_SOURCE_TEXT.notNow).toBe('Agora não');
    expect(SIGNUP_SOURCE_TEXT.accountCurrent('instagram')).toBe('Sua resposta: Instagram.');
  });

  it('o código desconhecido vira a falha genérica; os conhecidos têm texto próprio', () => {
    expect(signupSourceErrorText('versao_desatualizada')).toBe(SIGNUP_SOURCE_TEXT.errors.versao_desatualizada);
    expect(signupSourceErrorText('coisa_estranha')).toBe(SIGNUP_SOURCE_TEXT.failed);
    expect(signupSourceTextSamples().length).toBeGreaterThan(20);
  });
});
