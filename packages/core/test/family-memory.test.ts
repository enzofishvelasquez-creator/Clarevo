import { describe, expect, it } from 'vitest';
import {
  INVITE_VALID_DAYS,
  MemoryFamilyHub,
  MemoryRepository,
  inviteCodeHash,
  isRepoError,
  newOperationKey,
  sha256Hex,
  type FamilyOverview,
  type RepoError,
  type RepoErrorCode,
} from '../src';

const key = () => newOperationKey();

async function expectCode(p: Promise<unknown>, code: RepoErrorCode) {
  let error: unknown = null;
  try {
    await p;
  } catch (e) {
    error = e;
  }
  expect(isRepoError(error, code), `esperava ${code}, veio ${error instanceof Error ? (error as RepoError).code : String(error)}`).toBe(true);
}

/** Relógio dos testes: o convite vale 7 dias a partir daqui. */
function clock(start = '2026-10-07T12:00:00.000Z') {
  const c = { ms: Date.parse(start) };
  return { c, hub: new MemoryFamilyHub({ now: () => c.ms, random: seeded() }) };
}

/** Sorteio repetível: cada chamada devolve outro número em [0, 1). */
function seeded() {
  let n = 7;
  return () => {
    n = (n * 48271) % 2147483647;
    return n / 2147483647;
  };
}

const NAMES: Record<string, string> = {
  vera: 'Vera Lima',
  mauro: 'Mauro Dias',
  nina: 'Nina Rocha',
  quirino: 'Quirino Sá',
  saulo: 'Saulo Reis',
  tania: 'Tânia Melo',
  rita: 'Rita Prado',
  ursula: 'Úrsula Neves',
  otto: 'Otto Reis',
};

/** Uma pessoa com o próprio repositório, no mesmo hub das outras. */
async function person(hub: MemoryFamilyHub, id: keyof typeof NAMES, today = '2026-10-07') {
  const repo = new MemoryRepository({ actorId: id, displayName: NAMES[id]!, today: () => today, family: hub });
  const space = await repo.ensurePersonalSpace('Conta principal');
  return { id: id as string, repo, space };
}

describe('Família na memória: criar', () => {
  it('quem cria vira titular, a Família nasce com a Conta principal e nenhum dado de exemplo', async () => {
    const { hub } = clock();
    const vera = await person(hub, 'vera');
    expect(await vera.repo.getFamily()).toBeNull();
    const r = await vera.repo.createFamily(key(), '  Casa Lima  ');
    expect(r.context.name).toBe('Casa Lima');
    expect(r.role).toBe('titular');
    expect(r.invitedBy).toBeNull();
    const family = (await vera.repo.getFamily())!;
    expect(family.context.id).toBe(r.context.id);
    expect(family.role).toBe('titular');
    expect(family.members).toEqual([
      expect.objectContaining({ personId: 'vera', firstName: 'Vera', role: 'titular', status: 'ativo', isMe: true, leftAt: null }),
    ]);
    expect(family.invites).toEqual([]);
    // A Conta principal da Família é só dela; nada de exemplo.
    const accounts = await vera.repo.listAccounts(r.context.id);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ name: 'Conta principal', kind: 'banco', status: 'ativa', isDefault: true });
    expect(await vera.repo.listRecords(r.context.id, '2026-10')).toEqual([]);
    expect(await vera.repo.listCommitments(r.context.id, '2026-10')).toEqual([]);
    expect(await vera.repo.listGoals(r.context.id)).toEqual([]);
    expect(await vera.repo.listCards(r.context.id)).toEqual([]);
    // O Pessoal não muda.
    expect((await vera.repo.getSpace())!.personalContextId).toBe(vera.space.personalContextId);
  });

  it('repetir a mesma chave devolve o mesmo resultado; outro nome com a mesma chave é chave_reutilizada', async () => {
    const { hub } = clock();
    const vera = await person(hub, 'vera');
    const k = key();
    const a = await vera.repo.createFamily(k, 'Casa Lima');
    const b = await vera.repo.createFamily(k, ' Casa Lima ');
    expect(b).toEqual(a);
    await expectCode(vera.repo.createFamily(k, 'Outra casa'), 'chave_reutilizada');
    // L-3: uma Família por pessoa.
    await expectCode(vera.repo.createFamily(key(), 'Outra casa'), 'ja_em_familia');
  });

  it('valida o nome (1 a 60 caracteres) e a chave é a mesma dos outros registros', async () => {
    const { hub } = clock();
    const vera = await person(hub, 'vera');
    for (const bad of ['', '   ', 'x'.repeat(61)]) await expectCode(vera.repo.createFamily(key(), bad), 'nome_da_familia_invalido');
    expect(await vera.repo.getFamily()).toBeNull();
    const ok = await vera.repo.createFamily(key(), 'x'.repeat(60));
    expect(ok.context.name).toHaveLength(60);
    // Uma chave já usada por um gasto não serve para a Família.
    const other = await person(hub, 'mauro');
    const space = other.space;
    const k = key();
    await other.repo.createRecord(k, space.personalContextId, 'despesa', { accountId: space.accounts[0]!.id, amountCents: 1000, occurredOn: '2026-10-05', description: 'Mercado', category: null });
    await expectCode(other.repo.createFamily(k, 'Casa'), 'chave_reutilizada');
    const k2 = key();
    await other.repo.createFamily(k2, 'Casa');
    await expectCode(
      other.repo.createRecord(k2, space.personalContextId, 'despesa', { accountId: space.accounts[0]!.id, amountCents: 1000, occurredOn: '2026-10-05', description: 'Mercado', category: null }),
      'chave_reutilizada',
    );
  });

  it('quem ainda não tem espaço pessoal não cria Família', async () => {
    const { hub } = clock();
    const repo = new MemoryRepository({ actorId: 'xena', displayName: 'Xena', today: () => '2026-10-07', family: hub });
    await expectCode(repo.createFamily(key(), 'Casa'), 'sem_permissao');
  });
});

describe('Família na memória: convites', () => {
  it('o titular convida; o código tem 32 hexadecimais e só o resumo fica guardado; repetir a chave devolve o convite sem o código', async () => {
    const { hub } = clock();
    const vera = await person(hub, 'vera');
    const { context } = await vera.repo.createFamily(key(), 'Casa Lima');
    const k = key();
    const w = await vera.repo.createFamilyInvite(k, context.id, 'membro');
    expect(w.code).toMatch(/^[0-9a-f]{32}$/);
    expect(w.invite).toMatchObject({ contextId: context.id, role: 'membro', createdBy: 'vera', usedAt: null, cancelledAt: null });
    expect(Date.parse(w.invite.expiresAt) - Date.parse(w.invite.createdAt)).toBe(INVITE_VALID_DAYS * 24 * 60 * 60 * 1000);
    expect(JSON.stringify(w.invite)).not.toContain(w.code!);
    expect(JSON.stringify(w.invite)).not.toContain(sha256Hex(w.code!));
    const again = await vera.repo.createFamilyInvite(k, context.id, 'membro');
    expect(again.code).toBeNull();
    expect(again.invite).toEqual(w.invite);
    await expectCode(vera.repo.createFamilyInvite(k, context.id, 'leitor'), 'chave_reutilizada');
    // O titular vê o convite válido na Família; sem código.
    const family = (await vera.repo.getFamily())!;
    expect(family.invites).toEqual([w.invite]);
    expect(JSON.stringify(family)).not.toContain(w.code!);
    expect(inviteCodeHash(w.code)).toBe(sha256Hex(w.code!));
  });

  it('recusas: papel inválido, o Pessoal, quem de fora, quem não é titular', async () => {
    const { hub } = clock();
    const vera = await person(hub, 'vera');
    const mauro = await person(hub, 'mauro');
    const otto = await person(hub, 'otto');
    const { context } = await vera.repo.createFamily(key(), 'Casa Lima');
    await expectCode(vera.repo.createFamilyInvite(key(), context.id, 'titular' as never), 'papel_invalido');
    await expectCode(vera.repo.createFamilyInvite(key(), context.id, null as never), 'papel_invalido');
    await expectCode(vera.repo.createFamilyInvite(key(), vera.space.personalContextId, 'membro'), 'contexto_invalido');
    await expectCode(vera.repo.createFamilyInvite(key(), mauro.space.personalContextId, 'membro'), 'nao_encontrado');
    await expectCode(vera.repo.createFamilyInvite(key(), 'ctx-inexistente', 'membro'), 'nao_encontrado');
    await expectCode(otto.repo.createFamilyInvite(key(), context.id, 'membro'), 'nao_encontrado');
    const w = await vera.repo.createFamilyInvite(key(), context.id, 'membro');
    await mauro.repo.acceptFamilyInvite(key(), w.code!);
    await expectCode(mauro.repo.createFamilyInvite(key(), context.id, 'membro'), 'sem_permissao');
  });

  it('a prévia mostra só o nome da Família, o primeiro nome de quem convidou, o papel e a validade', async () => {
    const { hub } = clock();
    const vera = await person(hub, 'vera');
    const mauro = await person(hub, 'mauro');
    const { context } = await vera.repo.createFamily(key(), 'Casa Lima');
    const w = await vera.repo.createFamilyInvite(key(), context.id, 'leitor');
    const p = await mauro.repo.previewFamilyInvite(w.code!);
    expect(p).toEqual({ familyName: 'Casa Lima', invitedBy: 'Vera', role: 'leitor', expiresAt: w.invite.expiresAt });
    expect(await mauro.repo.previewFamilyInvite(` ${w.code!.toUpperCase()} `)).toEqual(p);
    // A prévia não usa o convite nem cria vínculo.
    expect(await mauro.repo.getFamily()).toBeNull();
    expect((await vera.repo.getFamily())!.invites).toHaveLength(1);
  });

  it('convite inexistente, malformado, usado, cancelado, vencido ou de Família encerrada dizem o mesmo: convite_invalido', async () => {
    const { c, hub } = clock();
    const vera = await person(hub, 'vera');
    const mauro = await person(hub, 'mauro');
    const ursula = await person(hub, 'ursula');
    const { context } = await vera.repo.createFamily(key(), 'Casa Lima');
    const used = await vera.repo.createFamilyInvite(key(), context.id, 'membro');
    await mauro.repo.acceptFamilyInvite(key(), used.code!);
    const cancelled = await vera.repo.createFamilyInvite(key(), context.id, 'membro');
    await vera.repo.cancelFamilyInvite(key(), cancelled.invite.id);
    const expired = await vera.repo.createFamilyInvite(key(), context.id, 'membro');
    const codes = [used.code!, cancelled.code!, 'b'.repeat(32), 'b'.repeat(31), 'não é um código', ''];
    c.ms += (INVITE_VALID_DAYS * 24 + 1) * 3_600_000;
    codes.push(expired.code!);
    const errors: string[] = [];
    for (const code of codes) {
      for (const run of [() => ursula.repo.previewFamilyInvite(code), () => ursula.repo.acceptFamilyInvite(key(), code)]) {
        try {
          await run();
          errors.push('passou');
        } catch (e) {
          errors.push(`${(e as RepoError).code}|${(e as RepoError).detail ?? ''}|${(e as RepoError).message}`);
        }
      }
    }
    expect(new Set(errors)).toEqual(new Set(['convite_invalido||convite_invalido']));
    // Família encerrada: o convite que sobrou também some.
    c.ms -= (INVITE_VALID_DAYS * 24 + 1) * 3_600_000;
    const open = await vera.repo.createFamilyInvite(key(), context.id, 'membro');
    await vera.repo.removeFamilyMember(key(), context.id, 'mauro');
    await vera.repo.endFamily(key(), context.id);
    await expectCode(ursula.repo.previewFamilyInvite(open.code!), 'convite_invalido');
    await expectCode(ursula.repo.acceptFamilyInvite(key(), open.code!), 'convite_invalido');
  });

  it('cancelar: só o titular; o convite usado não se cancela; cancelar de novo não dá erro', async () => {
    const { hub } = clock();
    const vera = await person(hub, 'vera');
    const mauro = await person(hub, 'mauro');
    const otto = await person(hub, 'otto');
    const { context } = await vera.repo.createFamily(key(), 'Casa Lima');
    const a = await vera.repo.createFamilyInvite(key(), context.id, 'membro');
    const b = await vera.repo.createFamilyInvite(key(), context.id, 'membro');
    await mauro.repo.acceptFamilyInvite(key(), a.code!);
    await expectCode(vera.repo.cancelFamilyInvite(key(), a.invite.id), 'convite_ja_usado');
    await expectCode(mauro.repo.cancelFamilyInvite(key(), b.invite.id), 'sem_permissao');
    await expectCode(otto.repo.cancelFamilyInvite(key(), b.invite.id), 'nao_encontrado');
    await expectCode(vera.repo.cancelFamilyInvite(key(), 'conv-inexistente'), 'nao_encontrado');
    const k = key();
    const first = await vera.repo.cancelFamilyInvite(k, b.invite.id);
    expect(first.cancelledAt).not.toBeNull();
    expect(await vera.repo.cancelFamilyInvite(k, b.invite.id)).toEqual(first);
    expect(await vera.repo.cancelFamilyInvite(key(), b.invite.id)).toEqual(first);
    await expectCode(vera.repo.cancelFamilyInvite(k, a.invite.id), 'chave_reutilizada');
    expect((await vera.repo.getFamily())!.invites).toEqual([]);
  });
});

describe('Família na memória: aceitar', () => {
  it('aceitar cria o vínculo com o papel do convite, uma única vez, e repetir a chave devolve o mesmo resultado', async () => {
    const { hub } = clock();
    const vera = await person(hub, 'vera');
    const mauro = await person(hub, 'mauro');
    const nina = await person(hub, 'nina');
    const { context } = await vera.repo.createFamily(key(), 'Casa Lima');
    const m = await vera.repo.createFamilyInvite(key(), context.id, 'membro');
    const n = await vera.repo.createFamilyInvite(key(), context.id, 'leitor');
    const k = key();
    const joined = await mauro.repo.acceptFamilyInvite(k, m.code!);
    expect(joined).toMatchObject({ role: 'membro', invitedBy: 'Vera', context: { id: context.id, name: 'Casa Lima' } });
    expect(await mauro.repo.acceptFamilyInvite(k, m.code!)).toEqual(joined);
    await expectCode(mauro.repo.acceptFamilyInvite(key(), m.code!), 'convite_invalido');
    await expectCode(nina.repo.acceptFamilyInvite(key(), m.code!), 'convite_invalido');
    await expectCode(mauro.repo.acceptFamilyInvite(k, n.code!), 'chave_reutilizada');
    const leitor = await nina.repo.acceptFamilyInvite(key(), n.code!);
    expect(leitor.role).toBe('leitor');
    const family = (await vera.repo.getFamily())!;
    expect(family.members.map((x) => `${x.firstName}:${x.role}:${x.status}`)).toEqual(['Vera:titular:ativo', 'Mauro:membro:ativo', 'Nina:leitor:ativo']);
    expect(family.invites).toEqual([]);
    // Quem entrou vê a Família, sem os convites; o nome inteiro e o e-mail nunca aparecem.
    const view = (await mauro.repo.getFamily())!;
    expect(view.role).toBe('membro');
    expect(view.invites).toEqual([]);
    expect(view.members.find((x) => x.isMe)).toMatchObject({ personId: 'mauro', firstName: 'Mauro' });
    expect(JSON.stringify(view)).not.toMatch(/Vera Lima|Mauro Dias|Nina Rocha|@/);
  });

  it('o Pessoal de ninguém aparece para a Família, e aceitar não copia nada', async () => {
    const { hub } = clock();
    const vera = await person(hub, 'vera');
    const mauro = await person(hub, 'mauro');
    const { context } = await vera.repo.createFamily(key(), 'Casa Lima');
    await vera.repo.createRecord(key(), vera.space.personalContextId, 'despesa', {
      accountId: vera.space.accounts[0]!.id,
      amountCents: 7700,
      occurredOn: '2026-10-02',
      description: 'Mercado da Vera',
      category: null,
    });
    const w = await vera.repo.createFamilyInvite(key(), context.id, 'membro');
    await mauro.repo.acceptFamilyInvite(key(), w.code!);
    // Mauro não lê o Pessoal da Vera e a Família dele começa sem registros.
    expect(await mauro.repo.listRecords(vera.space.personalContextId, '2026-10')).toEqual([]);
    expect(await mauro.repo.listRecords(context.id, '2026-10')).toEqual([]);
    expect(await mauro.repo.listAccounts(vera.space.personalContextId)).toEqual([]);
    // Vera não lê o Pessoal do Mauro.
    expect(await vera.repo.listRecords(mauro.space.personalContextId, '2026-10')).toEqual([]);
  });

  it('uma Família por pessoa: quem já está em uma não aceita outro convite nem o da própria Família, e o convite continua valendo', async () => {
    const { hub } = clock();
    const vera = await person(hub, 'vera');
    const rita = await person(hub, 'rita');
    const mauro = await person(hub, 'mauro');
    const { context } = await vera.repo.createFamily(key(), 'Casa Lima');
    const ritaFamily = await rita.repo.createFamily(key(), 'Casa da Rita');
    const w = await vera.repo.createFamilyInvite(key(), context.id, 'membro');
    await expectCode(rita.repo.acceptFamilyInvite(key(), w.code!), 'ja_em_familia');
    expect((await vera.repo.getFamily())!.invites).toHaveLength(1);
    await mauro.repo.acceptFamilyInvite(key(), w.code!);
    await expectCode(mauro.repo.createFamily(key(), 'Casa do Mauro'), 'ja_em_familia');
    const r = await rita.repo.createFamilyInvite(key(), ritaFamily.context.id, 'membro');
    await expectCode(mauro.repo.acceptFamilyInvite(key(), r.code!), 'ja_em_familia');
    const w2 = await vera.repo.createFamilyInvite(key(), context.id, 'leitor');
    await expectCode(mauro.repo.acceptFamilyInvite(key(), w2.code!), 'ja_em_familia');
  });

  it('quem ainda não tem espaço pessoal não aceita; o código inválido vem antes', async () => {
    const { hub } = clock();
    const vera = await person(hub, 'vera');
    const { context } = await vera.repo.createFamily(key(), 'Casa Lima');
    const w = await vera.repo.createFamilyInvite(key(), context.id, 'membro');
    const xena = new MemoryRepository({ actorId: 'xena', displayName: 'Xena', today: () => '2026-10-07', family: hub });
    await expectCode(xena.acceptFamilyInvite(key(), w.code!), 'sem_permissao');
    await expectCode(xena.acceptFamilyInvite(key(), 'b'.repeat(32)), 'convite_invalido');
  });
});

describe('Família na memória: limite de 6 pessoas (L-2)', () => {
  it('pessoas ativas mais convites válidos somam no máximo 6; cancelado e vencido não contam', async () => {
    const { c, hub } = clock();
    const vera = await person(hub, 'vera');
    const { context } = await vera.repo.createFamily(key(), 'Casa Lima');
    const invites = [];
    for (let i = 0; i < 5; i += 1) invites.push(await vera.repo.createFamilyInvite(key(), context.id, 'membro'));
    await expectCode(vera.repo.createFamilyInvite(key(), context.id, 'membro'), 'familia_cheia');
    await vera.repo.cancelFamilyInvite(key(), invites[4]!.invite.id);
    const sixth = await vera.repo.createFamilyInvite(key(), context.id, 'leitor');
    await expectCode(vera.repo.createFamilyInvite(key(), context.id, 'membro'), 'familia_cheia');
    // Vencido não conta: dois dias depois dos 7, abre vaga.
    c.ms += (INVITE_VALID_DAYS + 1) * 24 * 3_600_000;
    const fresh = await vera.repo.createFamilyInvite(key(), context.id, 'membro');
    expect(fresh.code).toMatch(/^[0-9a-f]{32}$/);
    expect(sixth.code).not.toBeNull();
  });

  it('aceitar também confere a Família cheia; seis pessoas ativas e nenhuma vaga', async () => {
    const { hub } = clock();
    const vera = await person(hub, 'vera');
    const { context } = await vera.repo.createFamily(key(), 'Casa Lima');
    const others = await Promise.all((['mauro', 'nina', 'quirino', 'saulo', 'tania'] as const).map((id) => person(hub, id)));
    for (const o of others) {
      const w = await vera.repo.createFamilyInvite(key(), context.id, 'membro');
      await o.repo.acceptFamilyInvite(key(), w.code!);
    }
    expect((await vera.repo.getFamily())!.members.filter((m) => m.status === 'ativo')).toHaveLength(6);
    await expectCode(vera.repo.createFamilyInvite(key(), context.id, 'membro'), 'familia_cheia');
    // Dois convites ao mesmo tempo não passam de 6: o segundo aceite, com a Família cheia, é recusado (convite criado antes da cheia).
    await vera.repo.removeFamilyMember(key(), context.id, 'tania');
    const a = await vera.repo.createFamilyInvite(key(), context.id, 'membro');
    const ursula = await person(hub, 'ursula');
    const otto = await person(hub, 'otto');
    await ursula.repo.acceptFamilyInvite(key(), a.code!);
    const vaga = await vera.repo.getFamily();
    expect(vaga!.members.filter((m) => m.status === 'ativo')).toHaveLength(6);
    await expectCode(otto.repo.acceptFamilyInvite(key(), a.code!), 'convite_invalido');
  });
});

describe('Família na memória: papéis e permissões de escrita', () => {
  async function setup() {
    const { c, hub } = clock();
    const vera = await person(hub, 'vera');
    const mauro = await person(hub, 'mauro');
    const nina = await person(hub, 'nina');
    const { context } = await vera.repo.createFamily(key(), 'Casa Lima');
    const m = await vera.repo.createFamilyInvite(key(), context.id, 'membro');
    const n = await vera.repo.createFamilyInvite(key(), context.id, 'leitor');
    await mauro.repo.acceptFamilyInvite(key(), m.code!);
    await nina.repo.acceptFamilyInvite(key(), n.code!);
    return { c, hub, vera, mauro, nina, ctx: context.id };
  }

  const input = (accountId: string, description: string) => ({ accountId, amountCents: 1500, occurredOn: '2026-10-05', description, category: null });

  it('membro anota na Família; leitor só lê; Pessoal e Família têm contas separadas', async () => {
    const { mauro, nina, vera, ctx } = await setup();
    const acc = (await mauro.repo.listAccounts(ctx))[0]!;
    expect(acc.contextId).toBe(ctx);
    const rec = await mauro.repo.createRecord(key(), ctx, 'despesa', input(acc.id, 'Mercado da casa'));
    expect(rec.contextId).toBe(ctx);
    expect(await mauro.repo.listRecords(ctx, '2026-10')).toHaveLength(1);
    // Leitor: lê a lista (a dele, no próprio repositório), não escreve nem cria conta a pagar, meta ou cartão.
    const ninaAcc = (await nina.repo.listAccounts(ctx))[0]!;
    await expectCode(nina.repo.createRecord(key(), ctx, 'despesa', input(ninaAcc.id, 'Intrusa')), 'sem_permissao');
    await expectCode(nina.repo.createCommitment(key(), ctx, { amountCents: 1000, dueOn: '2026-10-20', description: 'Luz', category: null }), 'sem_permissao');
    expect(await nina.repo.listRecords(ctx, '2026-10')).toEqual([]);
    // Quem não é da Família não lê nem escreve.
    const otto = await person(clock().hub, 'otto');
    await expectCode(otto.repo.createRecord(key(), ctx, 'despesa', input(otto.space.accounts[0]!.id, 'Intruso')), 'sem_permissao');
    expect(await otto.repo.listRecords(ctx, '2026-10')).toEqual([]);
    // O Pessoal continua o mesmo para cada pessoa.
    expect(await vera.repo.listRecords(vera.space.personalContextId, '2026-10')).toEqual([]);
  });

  it('o titular muda o papel de quem não é ele; a mudança vale na hora (Nina passa a anotar e volta a só ver)', async () => {
    const { vera, mauro, nina, ctx } = await setup();
    const ninaAcc = (await nina.repo.listAccounts(ctx))[0]!;
    const k = key();
    await vera.repo.setMemberRole(k, ctx, 'nina', 'membro');
    await vera.repo.setMemberRole(k, ctx, 'nina', 'membro');
    await nina.repo.createRecord(key(), ctx, 'despesa', input(ninaAcc.id, 'Pão da Nina'));
    expect((await vera.repo.getFamily())!.members.find((m) => m.personId === 'nina')!.role).toBe('membro');
    await vera.repo.setMemberRole(key(), ctx, 'nina', 'leitor');
    expect((await vera.repo.getFamily())!.members.find((m) => m.personId === 'nina')!.role).toBe('leitor');
    await expectCode(nina.repo.createRecord(key(), ctx, 'despesa', input(ninaAcc.id, 'Outro')), 'sem_permissao');
    // Recusas.
    await expectCode(mauro.repo.setMemberRole(key(), ctx, 'nina', 'leitor'), 'sem_permissao');
    await expectCode(vera.repo.setMemberRole(key(), ctx, 'vera', 'leitor'), 'nao_sobre_si');
    await expectCode(vera.repo.setMemberRole(key(), ctx, 'nina', 'titular' as never), 'papel_invalido');
    await expectCode(vera.repo.setMemberRole(key(), ctx, 'otto', 'leitor'), 'nao_encontrado');
    await expectCode(vera.repo.setMemberRole(key(), vera.space.personalContextId, 'vera', 'leitor'), 'contexto_invalido');
    await expectCode(vera.repo.setMemberRole(k, ctx, 'nina', 'leitor'), 'chave_reutilizada');
  });
});

describe('Família na memória: sair, remover, transferir e encerrar', () => {
  async function setup() {
    const { c, hub } = clock();
    const vera = await person(hub, 'vera');
    const mauro = await person(hub, 'mauro');
    const nina = await person(hub, 'nina');
    const { context } = await vera.repo.createFamily(key(), 'Casa Lima');
    const m = await vera.repo.createFamilyInvite(key(), context.id, 'membro');
    const n = await vera.repo.createFamilyInvite(key(), context.id, 'leitor');
    await mauro.repo.acceptFamilyInvite(key(), m.code!);
    await nina.repo.acceptFamilyInvite(key(), n.code!);
    return { c, hub, vera, mauro, nina, ctx: context.id };
  }

  const names = (f: FamilyOverview) => f.members.map((m) => `${m.firstName}:${m.role}:${m.status}`);

  it('sair: membro e leitor saem, o titular não (L-7); repetir a chave devolve o resultado mesmo depois de sair; o histórico fica', async () => {
    const { vera, mauro, ctx } = await setup();
    const acc = (await mauro.repo.listAccounts(ctx))[0]!;
    await mauro.repo.createRecord(key(), ctx, 'despesa', { accountId: acc.id, amountCents: 500, occurredOn: '2026-10-06', description: 'Pão', category: null });
    const k = key();
    await mauro.repo.leaveFamily(k, ctx);
    await mauro.repo.leaveFamily(k, ctx);
    expect(await mauro.repo.getFamily()).toBeNull();
    expect(await mauro.repo.listRecords(ctx, '2026-10')).toEqual([]);
    await expectCode(mauro.repo.createRecord(key(), ctx, 'despesa', { accountId: acc.id, amountCents: 500, occurredOn: '2026-10-06', description: 'Depois', category: null }), 'sem_permissao');
    await expectCode(mauro.repo.leaveFamily(key(), ctx), 'nao_encontrado');
    await expectCode(vera.repo.leaveFamily(key(), ctx), 'titular_nao_sai');
    await expectCode(mauro.repo.leaveFamily(key(), mauro.space.personalContextId), 'contexto_invalido');
    await expectCode(mauro.repo.leaveFamily(k, 'outra'), 'chave_reutilizada');
    const family = (await vera.repo.getFamily())!;
    expect(names(family)).toEqual(['Vera:titular:ativo', 'Nina:leitor:ativo', 'Mauro:membro:ex-membro']);
    expect(family.members.find((m) => m.personId === 'mauro')!.leftAt).not.toBeNull();
    // Quem saiu pode criar a própria Família.
    expect((await mauro.repo.createFamily(key(), 'Casa do Mauro')).role).toBe('titular');
  });

  it('voltar por um novo convite reativa o vínculo, com o papel do convite novo', async () => {
    const { vera, mauro, ctx } = await setup();
    await mauro.repo.leaveFamily(key(), ctx);
    const again = await vera.repo.createFamilyInvite(key(), ctx, 'leitor');
    const joined = await mauro.repo.acceptFamilyInvite(key(), again.code!);
    expect(joined.role).toBe('leitor');
    const family = (await vera.repo.getFamily())!;
    expect(names(family)).toEqual(['Vera:titular:ativo', 'Mauro:leitor:ativo', 'Nina:leitor:ativo']);
    expect(family.members.filter((m) => m.personId === 'mauro')).toHaveLength(1);
  });

  it('remover: só o titular, nunca sobre si; a pessoa perde a leitura na hora e vira ex-membro', async () => {
    const { vera, mauro, nina, ctx } = await setup();
    const k = key();
    await vera.repo.removeFamilyMember(k, ctx, 'nina');
    await vera.repo.removeFamilyMember(k, ctx, 'nina');
    expect(await nina.repo.getFamily()).toBeNull();
    expect(names((await vera.repo.getFamily())!)).toEqual(['Vera:titular:ativo', 'Mauro:membro:ativo', 'Nina:leitor:ex-membro']);
    await expectCode(vera.repo.removeFamilyMember(key(), ctx, 'nina'), 'nao_encontrado');
    await expectCode(vera.repo.removeFamilyMember(key(), ctx, 'vera'), 'nao_sobre_si');
    await expectCode(vera.repo.removeFamilyMember(key(), ctx, 'otto'), 'nao_encontrado');
    await expectCode(vera.repo.removeFamilyMember(key(), vera.space.personalContextId, 'mauro'), 'contexto_invalido');
    await expectCode(mauro.repo.removeFamilyMember(key(), ctx, 'vera'), 'sem_permissao');
    await expectCode(vera.repo.removeFamilyMember(k, ctx, 'mauro'), 'chave_reutilizada');
  });

  it('remover ou sair cancela os convites que a pessoa criou (depois de passar a titularidade)', async () => {
    const { vera, mauro, ctx } = await setup();
    const pend = await vera.repo.createFamilyInvite(key(), ctx, 'membro');
    await vera.repo.transferFamilyOwnership(key(), ctx, 'mauro');
    // O convite pendente da Vera continua valendo depois de passar a titularidade.
    expect((await mauro.repo.getFamily())!.invites.map((i) => i.id)).toEqual([pend.invite.id]);
    expect(await mauro.repo.previewFamilyInvite(pend.code!)).toMatchObject({ invitedBy: 'Vera' });
    await vera.repo.leaveFamily(key(), ctx);
    await expectCode(mauro.repo.previewFamilyInvite(pend.code!), 'convite_invalido');
    expect((await mauro.repo.getFamily())!.invites).toEqual([]);
  });

  it('passar a titularidade: quem era titular vira membro, a nova titular edita o que é de outras pessoas', async () => {
    const { vera, mauro, nina, ctx } = await setup();
    const k = key();
    await vera.repo.transferFamilyOwnership(k, ctx, 'mauro');
    await vera.repo.transferFamilyOwnership(k, ctx, 'mauro');
    expect(names((await nina.repo.getFamily())!)).toEqual(['Mauro:titular:ativo', 'Vera:membro:ativo', 'Nina:leitor:ativo']);
    expect((await vera.repo.getFamily())!.role).toBe('membro');
    expect((await mauro.repo.getFamily())!.role).toBe('titular');
    // Vera já não administra a Família.
    await expectCode(vera.repo.createFamilyInvite(key(), ctx, 'membro'), 'sem_permissao');
    await expectCode(vera.repo.removeFamilyMember(key(), ctx, 'nina'), 'sem_permissao');
    await expectCode(vera.repo.endFamily(key(), ctx), 'sem_permissao');
    await expectCode(vera.repo.transferFamilyOwnership(key(), ctx, 'nina'), 'sem_permissao');
    // Recusas.
    await expectCode(mauro.repo.transferFamilyOwnership(key(), ctx, 'mauro'), 'nao_sobre_si');
    await expectCode(mauro.repo.transferFamilyOwnership(key(), ctx, 'otto'), 'nao_encontrado');
    await expectCode(mauro.repo.transferFamilyOwnership(key(), mauro.space.personalContextId, 'vera'), 'contexto_invalido');
    await expectCode(vera.repo.transferFamilyOwnership(k, ctx, 'nina'), 'chave_reutilizada');
    // Quem saiu não recebe a titularidade.
    await mauro.repo.removeFamilyMember(key(), ctx, 'nina');
    await expectCode(mauro.repo.transferFamilyOwnership(key(), ctx, 'nina'), 'nao_encontrado');
  });

  it('encerrar: só o titular e só sem outra pessoa ativa; ninguém lê depois; quem encerrou pode criar outra', async () => {
    const { vera, mauro, nina, ctx } = await setup();
    await expectCode(vera.repo.endFamily(key(), ctx), 'familia_com_membros');
    await expectCode(mauro.repo.endFamily(key(), ctx), 'sem_permissao');
    await expectCode(vera.repo.endFamily(key(), vera.space.personalContextId), 'contexto_invalido');
    await vera.repo.removeFamilyMember(key(), ctx, 'mauro');
    await vera.repo.removeFamilyMember(key(), ctx, 'nina');
    const pend = await vera.repo.createFamilyInvite(key(), ctx, 'membro');
    const acc = (await vera.repo.listAccounts(ctx))[0]!;
    await vera.repo.createRecord(key(), ctx, 'despesa', { accountId: acc.id, amountCents: 900, occurredOn: '2026-10-06', description: 'Antes de encerrar', category: null });
    const k = key();
    await vera.repo.endFamily(k, ctx);
    await vera.repo.endFamily(k, ctx);
    for (const p of [vera, mauro, nina]) {
      expect(await p.repo.getFamily()).toBeNull();
      expect(await p.repo.listRecords(ctx, '2026-10')).toEqual([]);
      expect(await p.repo.listAccounts(ctx)).toEqual([]);
    }
    await expectCode(vera.repo.createRecord(key(), ctx, 'despesa', { accountId: acc.id, amountCents: 900, occurredOn: '2026-10-06', description: 'Depois', category: null }), 'sem_permissao');
    await expectCode(mauro.repo.previewFamilyInvite(pend.code!), 'convite_invalido');
    await expectCode(vera.repo.createFamilyInvite(key(), ctx, 'membro'), 'nao_encontrado');
    await expectCode(vera.repo.endFamily(k, mauro.space.personalContextId), 'chave_reutilizada');
    expect((await vera.repo.createFamily(key(), 'Casa nova')).context.id).not.toBe(ctx);
  });
});

describe('Família na memória: atividade e conferências', () => {
  it('as nove ações não contam como anotação; a primeira anotação, sim', async () => {
    const { hub } = clock();
    const vera = await person(hub, 'vera');
    const mauro = await person(hub, 'mauro');
    const { context } = await vera.repo.createFamily(key(), 'Casa Lima');
    const w = await vera.repo.createFamilyInvite(key(), context.id, 'membro');
    await mauro.repo.acceptFamilyInvite(key(), w.code!);
    await vera.repo.setMemberRole(key(), context.id, 'mauro', 'leitor');
    await vera.repo.setMemberRole(key(), context.id, 'mauro', 'membro');
    await expect(vera.repo.getReturnReviewState(context.id)).resolves.toMatchObject({ activity: null });
    await expect(mauro.repo.getReturnReviewState(context.id)).resolves.toMatchObject({ activity: null });
    const acc = (await mauro.repo.listAccounts(context.id))[0]!;
    await mauro.repo.createRecord(key(), context.id, 'despesa', { accountId: acc.id, amountCents: 800, occurredOn: '2026-10-06', description: 'Pão', category: null });
    const state = await mauro.repo.getReturnReviewState(context.id);
    expect(state.activity).not.toBeNull();
  });

  it('o hub guarda só o resumo do código e nenhuma ação revela o e-mail', async () => {
    const { hub } = clock();
    const vera = await person(hub, 'vera');
    const { context } = await vera.repo.createFamily(key(), 'Casa Lima');
    const w = await vera.repo.createFamilyInvite(key(), context.id, 'membro');
    const serial = JSON.stringify(hub, (_k, v) => (v instanceof Map ? [...v.entries()] : v));
    expect(serial).not.toContain(w.code!);
    expect(serial).toContain(sha256Hex(w.code!));
    expect(hub.findOperation('vera', 'inexistente')).toBeNull();
  });
});
