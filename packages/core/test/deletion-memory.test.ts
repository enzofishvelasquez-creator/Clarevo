import { describe, expect, it } from 'vitest';
import {
  DELETE_CONFIRMATION_WORD,
  FAMILY_DEPARTED_NAME,
  MemoryCompanyHub,
  MemoryFamilyHub,
  MemoryRepository,
  isRepoError,
  newOperationKey,
  type FamilyInviteWrite,
  type RepoError,
  type RepoErrorCode,
} from '../src';

/**
 * Excluir a conta na memória (D-058): as mesmas regras e os mesmos códigos de erro de delete_my_account (migração 0015), que o banco
 * confere em supabase/tests/99_exclusao.sql. O que cada pessoa anota na Família fica no repositório dela, então a autoria "Pessoa
 * que saiu" de verdade (anotações compartilhadas) é conferida no banco; aqui valem a ordem dos erros, o que sai de cada pessoa, a
 * Família, a empresa e a repetição.
 */
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

function seeded() {
  let n = 13;
  return () => {
    n = (n * 48271) % 2147483647;
    return n / 2147483647;
  };
}

const NOW = Date.parse('2026-10-07T12:00:00.000Z');

function world() {
  const family = new MemoryFamilyHub({ now: () => NOW, random: seeded() });
  const company = new MemoryCompanyHub({ now: () => NOW, today: () => '2026-10-07', random: seeded() });
  return { family, company };
}

const PEOPLE: Record<string, [string, string]> = {
  eli: ['Eli Prado', 'eli@exemplo.test'],
  bia: ['Bia Lopes', 'bia@exemplo.test'],
  lia: ['Lia Nunes', 'lia@exemplo.test'],
  gil: ['Gil Rocha', 'gil@alfa.test'],
  mia: ['Mia Santos', 'mia@exemplo.test'],
  otto: ['Otto Reis', 'otto@exemplo.test'],
  xena: ['Xena', 'xena@exemplo.test'],
};

async function person(w: ReturnType<typeof world>, id: keyof typeof PEOPLE, email?: string) {
  const [displayName, defaultEmail] = PEOPLE[id]!;
  const repo = new MemoryRepository({ actorId: id, displayName, email: email ?? defaultEmail, today: () => '2026-10-07', family: w.family, company: w.company });
  const space = await repo.ensurePersonalSpace('Conta principal');
  return { id: id as string, repo, ctx: space.personalContextId, account: space.accounts[0]!.id };
}
type Person = Awaited<ReturnType<typeof person>>;

/** Dados no Pessoal (ou na Família), para provar o que sai e o que fica. */
async function fill(p: Person, contextId: string, accountId: string, tag: string) {
  await p.repo.createRecord(key(), contextId, 'despesa', { accountId, amountCents: 3500, occurredOn: '2026-10-02', description: `Mercado ${tag}`, category: 'Mercado' });
  await p.repo.createRecord(key(), contextId, 'receita', { accountId, amountCents: 600000, occurredOn: '2026-10-01', description: `Salário ${tag}`, category: 'Salário' });
  await p.repo.createCommitment(key(), contextId, { description: `Internet ${tag}`, amountCents: 15000, dueOn: '2026-10-15', category: 'Moradia' });
  await p.repo.createCard(key(), contextId, { name: `Cartão ${tag}`, lastDigits: '1234', closingDay: 5, dueDay: 12, limitCents: 500000 });
  await p.repo.createGoal(key(), contextId, {
    goalType: 'oportunidade',
    name: `Bicicleta ${tag}`,
    targetCents: 50000,
    targetMonth: null,
    plannedMonthlyCents: null,
    essentialBaseCents: null,
    essentialMonths: null,
    essentialBaseSource: null,
    initialCents: null,
    initialOn: null,
  });
}

async function invite(from: Person, contextId: string, role: 'membro' | 'leitor'): Promise<FamilyInviteWrite> {
  return from.repo.createFamilyInvite(key(), contextId, role);
}
async function join(who: Person, code: string | null) {
  return who.repo.acceptFamilyInvite(key(), code!);
}

describe('excluir a conta na memória: confirmação, chave e repetição', () => {
  it('só com a palavra exata, e uma chave já usada em outra operação é reutilizada; nada muda nas recusas', async () => {
    const w = world();
    const eli = await person(w, 'eli');
    await fill(eli, eli.ctx, eli.account, 'eli');
    const k = key();
    await eli.repo.createRecord(k, eli.ctx, 'despesa', { accountId: eli.account, amountCents: 100, occurredOn: '2026-10-03', description: 'Pão', category: null });
    for (const bad of ['excluir', ' EXCLUIR', 'EXCLUIR ', '', 'SIM', 'EXCLUIR!']) await expectCode(eli.repo.deleteMyAccount(bad, key()), 'confirmacao_invalida');
    await expectCode(eli.repo.deleteMyAccount(DELETE_CONFIRMATION_WORD, k), 'chave_reutilizada');
    expect((await eli.repo.listRecords(eli.ctx, '2026-10')).length).toBe(3);
    expect(await eli.repo.getSpace()).not.toBeNull();
  });

  it('apaga o Pessoal inteiro; repetir (a mesma chave ou outra) responde sem erro e sem efeito; a conta não volta a existir', async () => {
    const w = world();
    const eli = await person(w, 'eli');
    await fill(eli, eli.ctx, eli.account, 'eli');
    const before = (await eli.repo.listRecords(eli.ctx, '2026-10')).length;
    expect(before).toBeGreaterThan(0);
    const k = key();
    await eli.repo.deleteMyAccount(DELETE_CONFIRMATION_WORD, k);
    expect(await eli.repo.getSpace()).toBeNull();
    expect(await eli.repo.listRecords(eli.ctx, '2026-10')).toEqual([]);
    expect(await eli.repo.listCommitments(eli.ctx, '2026-10')).toEqual([]);
    expect(await eli.repo.listCards(eli.ctx)).toEqual([]);
    expect(await eli.repo.listGoals(eli.ctx)).toEqual([]);
    expect(await eli.repo.listAccounts(eli.ctx)).toEqual([]);
    expect(await eli.repo.getFamily()).toBeNull();
    // Repetição: sem erro e sem efeito.
    await eli.repo.deleteMyAccount(DELETE_CONFIRMATION_WORD, k);
    await eli.repo.deleteMyAccount(DELETE_CONFIRMATION_WORD, key());
    await expectCode(eli.repo.deleteMyAccount('excluir', key()), 'confirmacao_invalida');
    // A conta já não existe: não cria o espaço de novo, nem Família, nem grava registro.
    await expectCode(eli.repo.ensurePersonalSpace('Conta principal'), 'email_nao_confirmado');
    await expectCode(eli.repo.createFamily(key(), 'Casa fantasma'), 'sem_permissao');
    await expectCode(eli.repo.createRecord(key(), eli.ctx, 'despesa', { accountId: eli.account, amountCents: 100, occurredOn: '2026-10-03', description: 'x', category: null }), 'sem_permissao');
  });

  it('conta que nunca criou o espaço também exclui, sem nada a apagar', async () => {
    const w = world();
    const repo = new MemoryRepository({ actorId: 'xena', displayName: 'Xena', today: () => '2026-10-07', family: w.family, company: w.company });
    await repo.deleteMyAccount(DELETE_CONFIRMATION_WORD, key());
    await repo.deleteMyAccount(DELETE_CONFIRMATION_WORD, key());
    expect(await repo.getSpace()).toBeNull();
  });

  it('o e-mail fica livre: uma conta nova com o mesmo e-mail começa vazia e não herda nada', async () => {
    const w = world();
    const eli = await person(w, 'eli');
    await fill(eli, eli.ctx, eli.account, 'eli');
    await eli.repo.deleteMyAccount(DELETE_CONFIRMATION_WORD, key());
    const novo = new MemoryRepository({ actorId: 'eli-2', displayName: 'Eli Prado', email: 'eli@exemplo.test', today: () => '2026-10-07', family: w.family, company: w.company });
    const space = await novo.ensurePersonalSpace('Conta principal');
    expect(space.personalContextId).not.toBe(eli.ctx);
    expect(space.accounts).toHaveLength(1);
    expect(await novo.listRecords(space.personalContextId, '2026-10')).toEqual([]);
    expect(await novo.listCommitments(space.personalContextId, '2026-10')).toEqual([]);
    expect(await novo.listCards(space.personalContextId)).toEqual([]);
    expect(await novo.listGoals(space.personalContextId)).toEqual([]);
    expect(await novo.getFamily()).toBeNull();
    expect(await novo.getMyBenefit()).toBeNull();
  });
});

describe('excluir a conta na memória: Família', () => {
  it('titular com outras pessoas ativas: transferir_antes, e nada muda (nem o Pessoal)', async () => {
    const w = world();
    const bia = await person(w, 'bia');
    const eli = await person(w, 'eli');
    await fill(bia, bia.ctx, bia.account, 'bia');
    const fam = (await bia.repo.createFamily(key(), 'Casa da Bia')).context.id;
    await join(eli, (await invite(bia, fam, 'membro')).code);
    await expectCode(bia.repo.deleteMyAccount(DELETE_CONFIRMATION_WORD, key()), 'transferir_antes');
    expect((await bia.repo.listRecords(bia.ctx, '2026-10')).length).toBe(2);
    expect((await bia.repo.getFamily())!.members.filter((m) => m.status === 'ativo')).toHaveLength(2);
    // Removendo a outra pessoa, a exclusão passa (e a Família acaba junto).
    await bia.repo.removeFamilyMember(key(), fam, 'eli');
    await bia.repo.deleteMyAccount(DELETE_CONFIRMATION_WORD, key());
    expect(await bia.repo.getSpace()).toBeNull();
  });

  it('titular que passa a titularidade deixa de ser titular e pode excluir: sai da Família, que segue com a nova titular', async () => {
    const w = world();
    const bia = await person(w, 'bia');
    const lia = await person(w, 'lia');
    const fam = (await bia.repo.createFamily(key(), 'Casa da Bia')).context.id;
    await join(lia, (await invite(bia, fam, 'leitor')).code);
    await bia.repo.transferFamilyOwnership(key(), fam, 'lia');
    await fill(bia, fam, (await bia.repo.listAccounts(fam))[0]!.id, 'bif');
    await bia.repo.deleteMyAccount(DELETE_CONFIRMATION_WORD, key());
    const casa = (await lia.repo.getFamily())!;
    expect(casa.role).toBe('titular');
    expect(casa.members.filter((m) => m.status === 'ativo').map((m) => m.firstName)).toEqual(['Lia']);
    // Quem anotou na Família continua na lista, sem nome e sem e-mail.
    const gone = casa.members.find((m) => m.status === 'ex-membro')!;
    expect(gone).toMatchObject({ personId: 'bia', firstName: FAMILY_DEPARTED_NAME, role: 'membro', isMe: false });
    expect(JSON.stringify(casa.members)).not.toContain('Bia');
    expect(JSON.stringify(casa)).not.toContain('bia@exemplo.test');
  });

  it('quem não anotou nada na Família some da lista; quem anotou fica como "Pessoa que saiu"', async () => {
    const w = world();
    const bia = await person(w, 'bia');
    const eli = await person(w, 'eli');
    const lia = await person(w, 'lia');
    const fam = (await bia.repo.createFamily(key(), 'Casa da Bia')).context.id;
    await join(eli, (await invite(bia, fam, 'membro')).code);
    await join(lia, (await invite(bia, fam, 'membro')).code);
    await fill(eli, fam, (await eli.repo.listAccounts(fam))[0]!.id, 'elf');
    await eli.repo.deleteMyAccount(DELETE_CONFIRMATION_WORD, key());
    await lia.repo.deleteMyAccount(DELETE_CONFIRMATION_WORD, key());
    const casa = (await bia.repo.getFamily())!;
    expect(casa.members.map((m) => `${m.firstName}:${m.status}`)).toEqual(['Bia:ativo', `${FAMILY_DEPARTED_NAME}:ex-membro`]);
    // Lia, que só entrou e saiu da conta, não deixou rastro; Eli, que anotou, deixou só o rótulo.
    expect(casa.members.some((m) => m.personId === 'lia')).toBe(false);
  });

  it('titular sozinha: a Família acaba por inteiro, com as pessoas anônimas que só existiam por causa dela', async () => {
    const w = world();
    const bia = await person(w, 'bia');
    const eli = await person(w, 'eli');
    const fam = (await bia.repo.createFamily(key(), 'Casa da Bia')).context.id;
    await join(eli, (await invite(bia, fam, 'membro')).code);
    await fill(eli, fam, (await eli.repo.listAccounts(fam))[0]!.id, 'elf');
    await eli.repo.deleteMyAccount(DELETE_CONFIRMATION_WORD, key());
    expect((await bia.repo.getFamily())!.members.map((m) => m.firstName)).toContain(FAMILY_DEPARTED_NAME);
    await invite(bia, fam, 'leitor');
    await bia.repo.deleteMyAccount(DELETE_CONFIRMATION_WORD, key());
    // A Família não existe mais: ninguém a lê, e o convite pendente não vale.
    expect(await bia.repo.getFamily()).toBeNull();
    const otto = await person(w, 'otto');
    expect(await otto.repo.getFamily()).toBeNull();
    // A pessoa anônima saiu com a Família: criar outra com o mesmo nome começa sem ninguém.
    const nova = (await otto.repo.createFamily(key(), 'Casa da Bia')).context.id;
    expect(nova).not.toBe(fam);
    expect((await otto.repo.getFamily())!.members.map((m) => m.firstName)).toEqual(['Otto']);
  });

  it('o convite que a pessoa criou deixa de valer; o que ela aceitou segue usado', async () => {
    const w = world();
    const bia = await person(w, 'bia');
    const eli = await person(w, 'eli');
    const lia = await person(w, 'lia');
    const fam = (await bia.repo.createFamily(key(), 'Casa da Bia')).context.id;
    await join(eli, (await invite(bia, fam, 'membro')).code);
    await bia.repo.transferFamilyOwnership(key(), fam, 'eli');
    const pendente = await invite(eli, fam, 'leitor');
    expect((await eli.repo.previewFamilyInvite(pendente.code!)).role).toBe('leitor');
    await eli.repo.removeFamilyMember(key(), fam, 'bia');
    await eli.repo.deleteMyAccount(DELETE_CONFIRMATION_WORD, key());
    await expectCode(lia.repo.previewFamilyInvite(pendente.code!), 'convite_invalido');
    await expectCode(join(lia, pendente.code), 'convite_invalido');
  });

  it('nenhuma outra pessoa perde dado: o Pessoal e a Família de quem não saiu seguem iguais', async () => {
    const w = world();
    const bia = await person(w, 'bia');
    const eli = await person(w, 'eli');
    const otto = await person(w, 'otto');
    const mia = await person(w, 'mia');
    await fill(bia, bia.ctx, bia.account, 'bia');
    await fill(eli, eli.ctx, eli.account, 'eli');
    await fill(otto, otto.ctx, otto.account, 'otto');
    const fam = (await otto.repo.createFamily(key(), 'Casa do Otto')).context.id;
    await join(mia, (await invite(otto, fam, 'membro')).code);
    const snap = async (p: Person) => ({
      records: await p.repo.listRecords(p.ctx, '2026-10'),
      commitments: await p.repo.listCommitments(p.ctx, '2026-10'),
      cards: await p.repo.listCards(p.ctx),
      goals: await p.repo.listGoals(p.ctx),
      accounts: await p.repo.listAccounts(p.ctx),
      family: await p.repo.getFamily(),
    });
    const before = { bia: await snap(bia), otto: await snap(otto), mia: await snap(mia) };
    await eli.repo.deleteMyAccount(DELETE_CONFIRMATION_WORD, key());
    expect({ bia: await snap(bia), otto: await snap(otto), mia: await snap(mia) }).toEqual(before);
  });
});

describe('excluir a conta na memória: benefício pela empresa', () => {
  it('a licença ativa termina no ato, os direitos e a administração saem, e a empresa fica só com a contagem', async () => {
    const w = world();
    const gil = await person(w, 'gil');
    const eli = await person(w, 'eli');
    const mia = await person(w, 'mia');
    const { organizationId, contractId } = w.company.staffCreateOrganization({ name: 'Alfa', seats: 3, plan: 'individual', startsOn: '2026-01-01', endsOn: null, adminEmail: 'gil@alfa.test' });
    w.company.staffAddOrgAdmin(organizationId, 'eli@exemplo.test');
    const invited = await gil.repo.inviteLicenses(key(), contractId, ['eli@exemplo.test', 'mia@exemplo.test', 'novo@exemplo.test']);
    const code = (email: string) => invited.results.find((r) => r.email === email)!.code!;
    await eli.repo.acceptLicense(key(), code('eli@exemplo.test'));
    await mia.repo.acceptLicense(key(), code('mia@exemplo.test'));
    expect(await gil.repo.getCompanyUsage(organizationId)).toMatchObject({ seats: 3, invited: 1, active: 2, ended: 0 });
    expect((await eli.repo.listAdministeredCompanies()).length).toBe(1);
    const miaBenefit = await mia.repo.getMyBenefit();

    await eli.repo.deleteMyAccount(DELETE_CONFIRMATION_WORD, key());

    expect(await gil.repo.getCompanyUsage(organizationId)).toMatchObject({ seats: 3, invited: 1, active: 1, ended: 1 });
    const company = (await gil.repo.listAdministeredCompanies())[0]!;
    const eliLicense = company.licenses.find((l) => l.email === 'eli@exemplo.test')!;
    expect(eliLicense.status).toBe('encerrada');
    expect(eliLicense.endedAt).not.toBeNull();
    expect(JSON.stringify(eliLicense)).not.toContain('"personId"');
    // A outra beneficiária e o convite pendente não mudam.
    expect(await mia.repo.getMyBenefit()).toEqual(miaBenefit);
    expect(company.licenses.find((l) => l.email === 'novo@exemplo.test')!.status).toBe('convidada');
    expect(company.licenses.find((l) => l.email === 'mia@exemplo.test')!.status).toBe('ativa');
    // O que era dele sai: nem lê o benefício, nem administra a organização.
    expect(await eli.repo.getMyBenefit()).toBeNull();
    expect(await eli.repo.listAdministeredCompanies()).toEqual([]);
    // A vaga voltou: a empresa pode convidar de novo, inclusive o mesmo e-mail.
    const again = await gil.repo.inviteLicenses(key(), contractId, ['eli@exemplo.test']);
    expect(again.results[0]!.outcome).toBe('convidada');
  });
});
