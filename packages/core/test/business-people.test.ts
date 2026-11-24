import { describe, expect, it } from 'vitest';
import {
  BUSINESS_ERROR_TEXT,
  BUSINESS_INVITE_TEXT,
  BUSINESS_MAX_PEOPLE,
  BUSINESS_NEUTRAL_NAME,
  BUSINESS_PEOPLE_ERROR_CODES,
  BUSINESS_PEOPLE_ERROR_TEXT,
  BUSINESS_PEOPLE_TEXT,
  BUSINESS_ROLE_HELP,
  BUSINESS_ROLE_LABEL,
  DEMO_BUSINESS_NAME,
  DEMO_BUSINESS_PEOPLE,
  DEMO_MEMBER_BUSINESS_NAME,
  FAMILY_ROLE_LABEL,
  INVITE_BASE_URL,
  MemoryBusinessHub,
  MemoryFamilyHub,
  MemoryRepository,
  businessAuthorLabel,
  businessCanInvite,
  businessFirstNameOf,
  businessHasOthers,
  businessInviteCodeFromText,
  businessInviteLink,
  businessMonth,
  businessPeopleErrorText,
  businessPeopleVisible,
  businessSeatsLeft,
  businessSharedNow,
  canEndBusiness,
  createDemoRepository,
  demoScenarioFrom,
  demoScenarioOpensPlus,
  inviteCodeFromText,
  isBusinessPeopleAction,
  isRepoError,
  newOperationKey,
  summarizeMonth,
  type BusinessMember,
  type BusinessPeople,
  type RepoError,
  type RepoErrorCode,
} from '../src';

/** Termos que nenhum texto do app usa (o mesmo critério de copy.test.ts), travessões e a expressão proibida. */
const FORBIDDEN =
  /\b(recomendamos|recomendo|invista|aplique|tesouro|cdb|lci|lca|caixinha|cofrinho)\b|fundo de investimento|rentabilidade garantida|rendimento garantido|retorno garantido|enriquec|faz(er|endo)?\s+sentido|[\u2013\u2014]/i;
/** Julgamento, pressão e o que o Plus ainda não pode dizer (preço, nome do plano). */
const JUDGMENT = /\b(preju[ií]zo|lucro|cuidado|aten[cç][aã]o|alerta|ruim|parab[eé]ns|deveria|urgente|agora mesmo)\b/i;
const PRICE = /R\$|\bpre[cç]o\b|\bplus\b|assinatura|\bgr[aá]tis\b/i;

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

/** Todos os textos de um objeto de textos, chamando as funções com valores de exemplo. */
const texts = (o: Record<string, unknown>): string[] =>
  Object.values(o).flatMap((v) => {
    if (typeof v === 'string') return [v];
    if (typeof v === 'function') {
      const out: string[] = [];
      const samples = [['Rafa', 'membro'], ['Nina', 'leitor'], ['Pessoa que saiu', 'membro'], ['membro', '2026-10-14'], ['leitor', '2026-10-14'], [0], [1], [3], ['Sacolé da Maria', 'https://app.clarevo.app.br/convite/negocio/x']];
      for (const args of samples) {
        try {
          const r = (v as (...a: unknown[]) => unknown)(...args);
          // Uma chamada com parâmetros de outro tipo (um papel no lugar de uma data) não é um texto de verdade.
          if (typeof r === 'string' && !/undefined|NaN/.test(r)) out.push(r);
        } catch {
          // Função com outros parâmetros: as outras chamadas cobrem.
        }
      }
      return out;
    }
    return [];
  });

/** Relógio dos testes: o convite vale 7 dias a partir daqui. */
function clock(start = '2026-11-20T12:00:00.000Z', plusOpen = true) {
  const c = { ms: Date.parse(start) };
  let n = 11;
  const random = () => {
    n = (n * 48271) % 2147483647;
    return n / 2147483647;
  };
  return { c, hub: new MemoryBusinessHub({ now: () => c.ms, random, plusOpen }) };
}

const NAMES: Record<string, string> = {
  bia: 'Bia Souza',
  caio: 'Caio Lima',
  duda: 'Duda Reis',
  enzo: 'Ênio Prado',
  fabi: 'Fabi Melo',
  gil: 'Gil Rocha',
  hana: 'Hana Dias',
  ivo: 'Ivo Sá',
};

/** Uma pessoa com o próprio repositório e o Pessoal pronto, no mesmo hub dos negócios. */
async function person(hub: MemoryBusinessHub, id: keyof typeof NAMES, family?: MemoryFamilyHub) {
  const repo = new MemoryRepository({ actorId: id, displayName: NAMES[id]!, today: () => '2026-11-20', business: hub, ...(family ? { family } : {}) });
  const space = await repo.ensurePersonalSpace('Conta principal');
  return { id: id as string, repo, space, personal: space.personalContextId, personalAcc: space.accounts[0]!.id };
}

/** Bia administra "Sacolé da Bia" e convida; devolve o negócio e um atalho para convidar e aceitar. */
async function shared(hub: MemoryBusinessHub) {
  const bia = await person(hub, 'bia');
  const b = await bia.repo.createBusiness(key(), 'Sacolé da Bia');
  const join = async (who: Awaited<ReturnType<typeof person>>, role: 'membro' | 'leitor' = 'membro') => {
    const w = await bia.repo.createBusinessInvite(key(), b.id, role);
    return who.repo.acceptBusinessInvite(key(), w.code!);
  };
  return { bia, b, join };
}

describe('negócio compartilhado: regras puras (D-116, D-120)', () => {
  it('o link /convite/negocio/<código> e o código de um texto colado, sem misturar com o da Família', () => {
    const code = '0123456789abcdef0123456789abcdef';
    expect(businessInviteLink(code)).toBe(`${INVITE_BASE_URL}/convite/negocio/${code}`);
    expect(businessInviteLink(code, 'http://localhost:8099/')).toBe(`http://localhost:8099/convite/negocio/${code}`);
    expect(businessInviteCodeFromText(`Convite: ${businessInviteLink(code)} até sexta`)).toBe(code);
    expect(businessInviteCodeFromText(`  ${code.toUpperCase()} `)).toBe(code);
    // O link da Família não vale no negócio, e o do negócio não vale na Família.
    expect(businessInviteCodeFromText(`${INVITE_BASE_URL}/convite/${code}`)).toBeNull();
    expect(inviteCodeFromText(businessInviteLink(code))).toBeNull();
    expect(businessInviteCodeFromText(`${INVITE_BASE_URL}/convite/negocio/${code}0`)).toBeNull();
    expect(businessInviteCodeFromText('sem código')).toBeNull();
    expect(businessInviteCodeFromText(null)).toBeNull();
  });

  it('o primeiro nome, os papéis, as vagas, quem anotou e quando a seção aparece', () => {
    expect(businessFirstNameOf('  Rafaela Souza ')).toBe('Rafaela');
    expect(businessFirstNameOf('')).toBe(BUSINESS_NEUTRAL_NAME);
    expect(businessFirstNameOf('rafa@exemplo.com')).toBe(BUSINESS_NEUTRAL_NAME);
    expect(businessFirstNameOf('rafa', 'rafa@exemplo.com')).toBe(BUSINESS_NEUTRAL_NAME);
    expect(BUSINESS_NEUTRAL_NAME).toBe('Pessoa do negócio');
    // Os papéis: a mesma escrita da Família, e quem cria "Administra".
    expect(BUSINESS_ROLE_LABEL).toEqual({ titular: 'Administra', membro: FAMILY_ROLE_LABEL.membro, leitor: FAMILY_ROLE_LABEL.leitor });
    expect(BUSINESS_ROLE_LABEL.membro).toBe('Anota e vê');
    expect(BUSINESS_ROLE_LABEL.leitor).toBe('Só vê');
    expect(BUSINESS_ROLE_HELP.titular).toContain('encerra');
    expect(BUSINESS_MAX_PEOPLE).toBe(6);
    const m = (over: Partial<BusinessMember>): BusinessMember => ({
      personId: 'x',
      firstName: 'Rafa',
      role: 'membro',
      status: 'ativo',
      isMe: false,
      joinedAt: '2026-11-01T12:00:00.000Z',
      leftAt: null,
      ...over,
    });
    const me = m({ personId: 'me', firstName: 'Maria', role: 'titular', isMe: true });
    const now = Date.parse('2026-11-20T12:00:00.000Z');
    const invite = (expiresAt: string, cancelledAt: string | null = null) => ({
      id: expiresAt,
      contextId: 'n',
      role: 'leitor' as const,
      createdBy: 'me',
      expiresAt,
      usedAt: null,
      cancelledAt,
      createdAt: '2026-11-19T12:00:00.000Z',
    });
    const people: BusinessPeople = {
      role: 'titular',
      plusOpen: true,
      members: [me, m({ personId: 'rafa' }), m({ personId: 'nina', firstName: 'Nina', status: 'ex-membro', leftAt: '2026-11-10T12:00:00.000Z' })],
      invites: [invite('2026-11-26T12:00:00.000Z'), invite('2026-11-19T12:00:00.000Z'), invite('2026-11-26T12:00:00.000Z', '2026-11-20T10:00:00.000Z')],
    };
    // Seis menos as duas pessoas ativas e o único convite ainda válido (vencido e cancelado não contam).
    expect(businessSeatsLeft(people, now)).toBe(3);
    expect(businessAuthorLabel(people.members, 'me')).toBe('Maria (você)');
    expect(businessAuthorLabel(people.members, 'rafa')).toBe('Rafa');
    expect(businessAuthorLabel(people.members, 'nina')).toBe('Nina (saiu do negócio)');
    expect(businessAuthorLabel([m({ personId: 'p', firstName: 'Pessoa que saiu', status: 'ex-membro', leftAt: 'x' })], 'p')).toBe('Pessoa que saiu');
    expect(businessAuthorLabel(people.members, 'ninguem')).toBeNull();
    expect(canEndBusiness(people.members)).toBe(false);
    expect(canEndBusiness([me, people.members[2]!])).toBe(true);
    // A seção "Pessoas do negócio": Plus aberto, quem não administra ou quando já há outras pessoas. Com o Plus fechado e sozinha, não.
    const alone: BusinessPeople = { role: 'titular', plusOpen: false, members: [me], invites: [] };
    expect(businessPeopleVisible(alone)).toBe(false);
    expect(businessPeopleVisible(null)).toBe(false);
    expect(businessPeopleVisible({ ...alone, plusOpen: true })).toBe(true);
    expect(businessPeopleVisible({ ...alone, role: 'leitor' })).toBe(true);
    expect(businessPeopleVisible({ ...alone, members: [me, people.members[2]!] })).toBe(true);
    expect(businessHasOthers(alone)).toBe(false);
    expect(businessHasOthers({ members: [me, people.members[2]!] })).toBe(true);
    expect(businessSharedNow({ members: [me, people.members[2]!] })).toBe(false);
    expect(businessSharedNow(people)).toBe(true);
    expect(businessCanInvite(people)).toBe(true);
    expect(businessCanInvite({ ...people, plusOpen: false })).toBe(false);
    expect(businessCanInvite({ ...people, role: 'membro' })).toBe(false);
    expect(isBusinessPeopleAction('sair_negocio')).toBe(true);
    expect(isBusinessPeopleAction('sair_familia')).toBe(false);
  });

  it('os textos: pt-BR, sem travessão, sem julgamento, sem preço e sem o nome do plano', () => {
    const all = [...texts(BUSINESS_PEOPLE_TEXT), ...texts(BUSINESS_INVITE_TEXT), ...Object.values(BUSINESS_PEOPLE_ERROR_TEXT), ...Object.values(BUSINESS_ROLE_HELP), ...Object.values(BUSINESS_ROLE_LABEL)];
    expect(all.length).toBeGreaterThan(80);
    for (const t of all) {
      expect(t, t).not.toMatch(FORBIDDEN);
      expect(t, t).not.toMatch(JUDGMENT);
      expect(t, t).not.toMatch(PRICE);
      expect(t, t).not.toMatch(/\btitular\b/i);
    }
    // As frases pedidas para os erros novos.
    expect(businessPeopleErrorText('ja_tem_negocio', true)).toBe('Você já participa de um negócio. Cada pessoa participa de um negócio por vez.');
    expect(businessPeopleErrorText('titular_nao_sai')).toBe('Quem administra não sai do negócio. Para encerrar, remova antes as outras pessoas.');
    expect(businessPeopleErrorText('ja_no_negocio', true)).toBe('Você já participa deste negócio.');
    expect(businessPeopleErrorText('negocio_cheio')).toContain('6 pessoas');
    expect(businessPeopleErrorText('negocio_cheio', true)).toBe('Este negócio já tem 6 pessoas. Peça a quem convidou para liberar uma vaga.');
    expect(businessPeopleErrorText('convite_invalido', true)).toBe(BUSINESS_INVITE_TEXT.invalid);
    expect(businessPeopleErrorText('plus_indisponivel')).toBe('Convidar pessoas para o negócio ainda não está disponível.');
    expect(businessPeopleErrorText('qualquer')).toBe(BUSINESS_PEOPLE_ERROR_TEXT.salvar_falhou);
    for (const code of BUSINESS_PEOPLE_ERROR_CODES) expect((BUSINESS_PEOPLE_ERROR_TEXT as Record<string, string>)[code], code).toBeTruthy();
    // Criar um negócio também recusa quem já participa do de outra pessoa: a mesma frase.
    expect(BUSINESS_ERROR_TEXT.ja_tem_negocio).toBe(BUSINESS_PEOPLE_ERROR_TEXT.ja_tem_negocio);
    expect(BUSINESS_ERROR_TEXT.sem_permissao).toBe('Só quem administra o negócio pode fazer isto.');
    // Linguagem neutra: "quem administra" e "a pessoa", e "a Clarevo" no feminino.
    expect(BUSINESS_PEOPLE_TEXT.yourRole('titular')).toBe('Você administra este negócio.');
    expect(BUSINESS_PEOPLE_TEXT.yourRole('leitor')).toBe('Seu papel: Só vê');
    expect(BUSINESS_PEOPLE_TEXT.exMember('Nina')).toBe('Nina (saiu do negócio)');
    expect(BUSINESS_PEOPLE_TEXT.seats(0)).toBe('O negócio está completo: 6 pessoas, contando os convites pendentes.');
    expect(BUSINESS_PEOPLE_TEXT.seats(1)).toBe('Cabe mais 1 pessoa, contando os convites pendentes.');
    expect(BUSINESS_INVITE_TEXT.shareMessage('Sacolé da Maria', 'https://x')).toBe('Convite para o negócio Sacolé da Maria na Clarevo: https://x');
    expect(BUSINESS_INVITE_TEXT.inviteTitle).toBe('Convidar para o negócio');
  });
});

describe('negócio compartilhado na memória: a chave do Plus e a compatibilidade (D-120)', () => {
  it('com o Plus fechado (padrão), ninguém convida, e a leitura das pessoas devolve só quem administra', async () => {
    const hub = new MemoryBusinessHub();
    const bia = await person(hub, 'bia');
    expect(await bia.repo.getPlusStatus()).toEqual({ open: false });
    const b = await bia.repo.createBusiness(key(), 'Sacolé da Bia');
    expect(b.role).toBe('titular');
    expect(await bia.repo.getBusiness()).toEqual(b);
    const people = await bia.repo.getBusinessPeople(b.id);
    expect(people).toEqual({
      role: 'titular',
      plusOpen: false,
      invites: [],
      members: [expect.objectContaining({ personId: 'bia', firstName: 'Bia', role: 'titular', status: 'ativo', isMe: true })],
    });
    expect(businessPeopleVisible(people)).toBe(false);
    await expectCode(bia.repo.createBusinessInvite(key(), b.id, 'membro'), 'plus_indisponivel');
    // Um repositório sem hub próprio também começa fechado (a demonstração padrão e as contas novas).
    const alone = new MemoryRepository({ actorId: 'x', displayName: 'X', today: () => '2026-11-20' });
    expect(await alone.getPlusStatus()).toEqual({ open: false });
    await expectCode(alone.getBusinessPeople('qualquer'), 'nao_encontrado');
  });

  it('o Plus aberto e depois fechado de novo: quem já entrou continua, mas quem administra volta a ver só a si', async () => {
    const { hub } = clock();
    const { bia, b, join } = await shared(hub);
    const caio = await person(hub, 'caio');
    await join(caio, 'leitor');
    hub.setPlusOpen(false);
    expect((await bia.repo.getBusinessPeople(b.id)).members.map((m) => m.personId)).toEqual(['bia']);
    // Quem não administra continua lendo a lista inteira (o banco já tem a migração, porque alguém entrou).
    const caioView = await caio.repo.getBusinessPeople(b.id);
    expect(caioView).toMatchObject({ role: 'leitor', plusOpen: false, invites: [] });
    expect(caioView.members.map((m) => [m.firstName, m.role, m.isMe])).toEqual([
      ['Bia', 'titular', false],
      ['Caio', 'leitor', true],
    ]);
    expect(businessPeopleVisible(caioView)).toBe(true);
  });
});

describe('negócio compartilhado na memória: convidar e cancelar (create_business_invite e cancel_business_invite)', () => {
  it('a ordem das recusas, o código uma única vez, a chave repetida e as 6 vagas contando os convites válidos', async () => {
    const { c, hub } = clock();
    const { bia, b } = await shared(hub);
    const caio = await person(hub, 'caio');
    await expectCode(bia.repo.createBusinessInvite(key(), 'nao-existe', 'membro'), 'nao_encontrado');
    await expectCode(bia.repo.createBusinessInvite(key(), bia.personal, 'membro'), 'contexto_invalido');
    await expectCode(caio.repo.createBusinessInvite(key(), b.id, 'membro'), 'nao_encontrado');
    await expectCode(bia.repo.createBusinessInvite(key(), b.id, 'titular' as never), 'papel_invalido');
    const k = key();
    const first = await bia.repo.createBusinessInvite(k, b.id, 'membro');
    expect(first.code).toMatch(/^[0-9a-f]{32}$/);
    expect(first.invite).toMatchObject({ contextId: b.id, role: 'membro', createdBy: 'bia', usedAt: null, cancelledAt: null, expiresAt: '2026-11-27T12:00:00.000Z' });
    // A mesma chave devolve o mesmo convite sem o código; outro pedido com a chave é chave_reutilizada.
    expect(await bia.repo.createBusinessInvite(k, b.id, 'membro')).toEqual({ invite: first.invite, code: null });
    await expectCode(bia.repo.createBusinessInvite(k, b.id, 'leitor'), 'chave_reutilizada');
    // Uma chave de outra operação da pessoa também.
    const recKey = key();
    await bia.repo.createRecord(recKey, bia.personal, 'despesa', { accountId: bia.personalAcc, amountCents: 100, occurredOn: '2026-11-20', description: 'x', category: null });
    await expectCode(bia.repo.createBusinessInvite(recKey, b.id, 'membro'), 'chave_reutilizada');
    // Bia ativa + 5 convites válidos = 6: o sétimo não cabe.
    for (let i = 0; i < 4; i += 1) await bia.repo.createBusinessInvite(key(), b.id, 'leitor');
    await expectCode(bia.repo.createBusinessInvite(key(), b.id, 'leitor'), 'negocio_cheio');
    const people = await bia.repo.getBusinessPeople(b.id);
    expect(people.invites).toHaveLength(5);
    expect(businessSeatsLeft(people, c.ms)).toBe(0);
    // Cancelar libera a vaga; repetir a chave devolve o mesmo convite; cancelado de novo, sem erro.
    const ck = key();
    const cancelled = await bia.repo.cancelBusinessInvite(ck, first.invite.id);
    expect(cancelled.cancelledAt).not.toBeNull();
    expect(await bia.repo.cancelBusinessInvite(ck, first.invite.id)).toEqual(cancelled);
    expect((await bia.repo.cancelBusinessInvite(key(), first.invite.id)).cancelledAt).toBe(cancelled.cancelledAt);
    expect((await bia.repo.getBusinessPeople(b.id)).invites).toHaveLength(4);
    // Um convite vencido também deixa de contar.
    c.ms += 8 * 24 * 60 * 60 * 1000;
    expect((await bia.repo.getBusinessPeople(b.id)).invites).toHaveLength(0);
    await expectCode(bia.repo.previewBusinessInvite(first.code!), 'convite_invalido');
    // Cancelar: convite que não existe, de quem não administra e o já usado.
    await expectCode(bia.repo.cancelBusinessInvite(key(), 'nao-existe'), 'nao_encontrado');
    const w = await bia.repo.createBusinessInvite(key(), b.id, 'membro');
    await caio.repo.acceptBusinessInvite(key(), w.code!);
    await expectCode(caio.repo.cancelBusinessInvite(key(), w.invite.id), 'sem_permissao');
    await expectCode(bia.repo.cancelBusinessInvite(key(), w.invite.id), 'convite_ja_usado');
    // Quem não administra não convida, mesmo com o Plus aberto.
    await expectCode(caio.repo.createBusinessInvite(key(), b.id, 'membro'), 'sem_permissao');
  });

  it('a prévia mostra só o nome do negócio, o primeiro nome de quem convidou, o papel e a validade', async () => {
    const { hub } = clock();
    const { bia, b } = await shared(hub);
    const w = await bia.repo.createBusinessInvite(key(), b.id, 'leitor');
    expect(await bia.repo.previewBusinessInvite(w.code!)).toEqual({ businessName: 'Sacolé da Bia', invitedBy: 'Bia', role: 'leitor', expiresAt: w.invite.expiresAt });
    expect(await bia.repo.previewBusinessInvite(`  ${w.code!.toUpperCase()} `)).toMatchObject({ businessName: 'Sacolé da Bia' });
    await expectCode(bia.repo.previewBusinessInvite('x'), 'convite_invalido');
    await expectCode(bia.repo.previewBusinessInvite('f'.repeat(32)), 'convite_invalido');
  });
});

describe('negócio compartilhado na memória: aceitar (accept_business_invite)', () => {
  it('a ordem das recusas, o uso único, a chave repetida e o papel do convite', async () => {
    const { c, hub } = clock();
    const { bia, b, join } = await shared(hub);
    const caio = await person(hub, 'caio');
    const w = await bia.repo.createBusinessInvite(key(), b.id, 'membro');
    // Sem o Pessoal: sem_permissao, antes de olhar o código.
    const nobody = new MemoryRepository({ actorId: 'ninguem', displayName: 'Ninguém', today: () => '2026-11-20', business: hub });
    await expectCode(nobody.acceptBusinessInvite(key(), 'x'), 'sem_permissao');
    await expectCode(caio.repo.acceptBusinessInvite(key(), 'x'), 'convite_invalido');
    await expectCode(caio.repo.acceptBusinessInvite(key(), 'f'.repeat(32)), 'convite_invalido');
    // Quem administra não aceita o próprio convite: já está no negócio.
    await expectCode(bia.repo.acceptBusinessInvite(key(), w.code!), 'ja_no_negocio');
    const k = key();
    const joined = await caio.repo.acceptBusinessInvite(k, w.code!);
    expect(joined).toEqual({ context: { id: b.id, name: 'Sacolé da Bia', createdAt: b.createdAt, role: 'membro' }, role: 'membro', invitedBy: 'Bia' });
    expect(await caio.repo.acceptBusinessInvite(k, w.code!)).toEqual(joined);
    await expectCode(caio.repo.acceptBusinessInvite(k, 'f'.repeat(32)), 'chave_reutilizada');
    // Uso único: o mesmo link não serve para outra pessoa, nem para a mesma de novo.
    const duda = await person(hub, 'duda');
    await expectCode(duda.repo.acceptBusinessInvite(key(), w.code!), 'convite_invalido');
    await expectCode(duda.repo.previewBusinessInvite(w.code!), 'convite_invalido');
    // Caio lê o negócio com o papel e a "Conta do negócio" de apoio; anota.
    expect(await caio.repo.getBusiness()).toEqual(joined.context);
    const acc = (await caio.repo.listAccounts(b.id))[0]!;
    expect(acc.name).toBe('Conta do negócio');
    await caio.repo.createRecord(key(), b.id, 'receita', { accountId: acc.id, amountCents: 5_000, occurredOn: '2026-11-19', description: 'Vendas na praça', category: 'Vendas' });
    // Cancelado e vencido: convite_invalido.
    const cancelled = await bia.repo.createBusinessInvite(key(), b.id, 'leitor');
    await bia.repo.cancelBusinessInvite(key(), cancelled.invite.id);
    await expectCode(duda.repo.acceptBusinessInvite(key(), cancelled.code!), 'convite_invalido');
    const late = await bia.repo.createBusinessInvite(key(), b.id, 'leitor');
    c.ms += 7 * 24 * 60 * 60 * 1000;
    await expectCode(duda.repo.acceptBusinessInvite(key(), late.code!), 'convite_invalido');
    c.ms -= 7 * 24 * 60 * 60 * 1000;
    // Um negócio por pessoa, por vez: quem tem o próprio negócio, ou participa de outro, recebe ja_tem_negocio.
    const own = await duda.repo.createBusiness(key(), 'Doces da Duda');
    const toDuda = await bia.repo.createBusinessInvite(key(), b.id, 'leitor');
    await expectCode(duda.repo.acceptBusinessInvite(key(), toDuda.code!), 'ja_tem_negocio');
    await expectCode(caio.repo.createBusiness(key(), 'Outro'), 'ja_tem_negocio');
    // Encerrar o próprio libera: Duda entra como leitora e não anota.
    await duda.repo.endBusiness(key(), own.id);
    const asReader = await duda.repo.acceptBusinessInvite(key(), toDuda.code!);
    expect(asReader.role).toBe('leitor');
    const dudaAcc = (await duda.repo.listAccounts(b.id))[0]!.id;
    await expectCode(duda.repo.createRecord(key(), b.id, 'receita', { accountId: dudaAcc, amountCents: 100, occurredOn: '2026-11-19', description: 'x', category: null }), 'sem_permissao');
    await expectCode(
      duda.repo.createBusinessWithdrawal(key(), b.id, { businessAccountId: dudaAcc, personalAccountId: duda.personalAcc, amountCents: 100, occurredOn: '2026-11-19', description: null }),
      'sem_permissao',
    );
    // Quem não administra não renomeia nem encerra.
    await expectCode(caio.repo.renameBusiness(key(), b.id, 'Outro nome'), 'sem_permissao');
    await expectCode(caio.repo.endBusiness(key(), b.id), 'sem_permissao');
    // A lista: quem administra no topo, depois por entrada; os convites só para quem administra.
    const view = await bia.repo.getBusinessPeople(b.id);
    expect(view.members.map((m) => `${m.firstName}:${m.role}:${m.status}`)).toEqual(['Bia:titular:ativo', 'Caio:membro:ativo', 'Duda:leitor:ativo']);
    expect((await caio.repo.getBusinessPeople(b.id)).invites).toEqual([]);
    expect(join).toBeTypeOf('function');
  });

  it('negocio_cheio no aceite conta só as pessoas ativas (o convite que está sendo usado não conta duas vezes)', async () => {
    const { hub } = clock();
    const { bia, b } = await shared(hub);
    const codes: string[] = [];
    for (let i = 0; i < 5; i += 1) codes.push((await bia.repo.createBusinessInvite(key(), b.id, 'membro')).code!);
    const others = ['caio', 'duda', 'enzo', 'fabi', 'gil'] as const;
    // O último aceite chega com 5 pessoas ativas e o próprio convite válido: entra (no aceite, os convites não contam).
    for (const [i, id] of others.entries()) await (await person(hub, id)).repo.acceptBusinessInvite(key(), codes[i]!);
    expect((await bia.repo.getBusinessPeople(b.id)).members.filter((m) => m.status === 'ativo')).toHaveLength(6);
    await expectCode(bia.repo.createBusinessInvite(key(), b.id, 'membro'), 'negocio_cheio');
    // Com 5 ativas, um convite cabe; se o negócio enche antes do aceite (outra pessoa entrou ao mesmo tempo), o aceite recusa.
    await bia.repo.removeBusinessMember(key(), b.id, 'gil');
    const late = await bia.repo.createBusinessInvite(key(), b.id, 'leitor');
    const members = hub['members'];
    members.set(`${b.id}|ivo`, { contextId: b.id, personId: 'ivo', owner: false, canWrite: false, joinedAt: '2026-11-20T12:00:00.000Z', leftAt: null });
    const hana = await person(hub, 'hana');
    await expectCode(hana.repo.acceptBusinessInvite(key(), late.code!), 'negocio_cheio');
    members.delete(`${b.id}|ivo`);
    expect((await hana.repo.acceptBusinessInvite(key(), late.code!)).role).toBe('leitor');
  });
});

describe('negócio compartilhado na memória: sair, remover, mudar o papel e encerrar', () => {
  it('sair: titular_nao_sai, contexto_invalido e nao_encontrado; as retiradas de quem sai deixam de ser ligadas, as de quem administra não', async () => {
    const { hub } = clock();
    const { bia, b, join } = await shared(hub);
    const caio = await person(hub, 'caio');
    await join(caio);
    await expectCode(bia.repo.leaveBusiness(key(), b.id), 'titular_nao_sai');
    await expectCode(caio.repo.leaveBusiness(key(), caio.personal), 'contexto_invalido');
    await expectCode(caio.repo.leaveBusiness(key(), 'nao-existe'), 'nao_encontrado');
    const bizAcc = (await bia.repo.listAccounts(b.id))[0]!.id;
    const caioAcc = (await caio.repo.listAccounts(b.id))[0]!.id;
    const mine = await bia.repo.createBusinessWithdrawal(key(), b.id, { businessAccountId: bizAcc, personalAccountId: bia.personalAcc, amountCents: 1_000, occurredOn: '2026-11-19', description: null });
    const his = await caio.repo.createBusinessWithdrawal(key(), b.id, { businessAccountId: caioAcc, personalAccountId: caio.personalAcc, amountCents: 2_000, occurredOn: '2026-11-19', description: 'Pró-labore' });
    await caio.repo.createRecord(key(), b.id, 'receita', { accountId: caioAcc, amountCents: 9_000, occurredOn: '2026-11-19', description: 'Vendas', category: 'Vendas' });
    const k = key();
    await caio.repo.leaveBusiness(k, b.id);
    // Repetir a chave depois de sair responde sem erro.
    await caio.repo.leaveBusiness(k, b.id);
    expect(await caio.repo.getBusiness()).toBeNull();
    expect(await caio.repo.listRecords(b.id, '2026-11')).toEqual([]);
    // O recebimento dele no Pessoal continua, sem o vínculo (pode editar como um recebimento comum).
    const p = (await caio.repo.getRecord(his.personalRecord.id))!;
    expect(p.pairedRecordId ?? null).toBeNull();
    expect((await caio.repo.updateRecord(key(), p.id, p.version, { accountId: caio.personalAcc, amountCents: 2_100, occurredOn: '2026-11-19', description: 'Pró-labore', category: null })).amountCents).toBe(2_100);
    // A retirada de quem administra continua ligada.
    expect((await bia.repo.getRecord(mine.personalRecord.id))!.pairedRecordId).toBe(mine.businessRecord.id);
    // Na lista, Caio saiu (com o primeiro nome), e as vagas voltam.
    const view = await bia.repo.getBusinessPeople(b.id);
    expect(view.members.map((m) => `${m.firstName}:${m.status}`)).toEqual(['Bia:ativo', 'Caio:ex-membro']);
    // Voltar por um convite novo reativa o mesmo vínculo, com o papel do convite.
    const again = await join(caio, 'leitor');
    expect(again.role).toBe('leitor');
    expect((await bia.repo.getBusinessPeople(b.id)).members.map((m) => `${m.firstName}:${m.role}:${m.status}`)).toEqual(['Bia:titular:ativo', 'Caio:leitor:ativo']);
  });

  it('remover e mudar o papel: só quem administra, nunca sobre si, a pessoa ativa; o papel antes da pessoa; a remoção desliga as retiradas', async () => {
    const { hub } = clock();
    const { bia, b, join } = await shared(hub);
    const caio = await person(hub, 'caio');
    const duda = await person(hub, 'duda');
    await join(caio);
    await join(duda, 'leitor');
    // Mudar o papel: papel_invalido vem antes de olhar a pessoa (mesmo sobre si).
    await expectCode(bia.repo.setBusinessMemberRole(key(), b.id, 'bia', 'titular' as never), 'papel_invalido');
    await expectCode(bia.repo.setBusinessMemberRole(key(), b.id, 'bia', 'leitor'), 'nao_sobre_si');
    await expectCode(bia.repo.setBusinessMemberRole(key(), b.id, 'ninguem', 'leitor'), 'nao_encontrado');
    await expectCode(caio.repo.setBusinessMemberRole(key(), b.id, 'duda', 'membro'), 'sem_permissao');
    await expectCode(caio.repo.setBusinessMemberRole(key(), b.id, 'bia', 'leitor'), 'sem_permissao');
    const rk = key();
    await bia.repo.setBusinessMemberRole(rk, b.id, 'duda', 'membro');
    await bia.repo.setBusinessMemberRole(rk, b.id, 'duda', 'membro');
    await expectCode(bia.repo.setBusinessMemberRole(rk, b.id, 'duda', 'leitor'), 'chave_reutilizada');
    expect((await duda.repo.getBusiness())!.role).toBe('membro');
    // Remover: as mesmas recusas; a pessoa ativa; a retirada dela fica desligada no repositório dela.
    await expectCode(bia.repo.removeBusinessMember(key(), b.id, 'bia'), 'nao_sobre_si');
    await expectCode(caio.repo.removeBusinessMember(key(), b.id, 'duda'), 'sem_permissao');
    await expectCode(bia.repo.removeBusinessMember(key(), b.id, 'ninguem'), 'nao_encontrado');
    const caioAcc = (await caio.repo.listAccounts(b.id))[0]!.id;
    const his = await caio.repo.createBusinessWithdrawal(key(), b.id, { businessAccountId: caioAcc, personalAccountId: caio.personalAcc, amountCents: 3_000, occurredOn: '2026-11-19', description: null });
    const k = key();
    await bia.repo.removeBusinessMember(k, b.id, 'caio');
    await bia.repo.removeBusinessMember(k, b.id, 'caio');
    await expectCode(bia.repo.removeBusinessMember(key(), b.id, 'caio'), 'nao_encontrado');
    expect(await caio.repo.getBusiness()).toBeNull();
    expect((await caio.repo.getRecord(his.personalRecord.id))!.pairedRecordId ?? null).toBeNull();
    await expectCode(caio.repo.createRecord(key(), b.id, 'receita', { accountId: caioAcc, amountCents: 100, occurredOn: '2026-11-19', description: 'x', category: null }), 'sem_permissao');
    // Quem foi removido não repete a ação de quem administra nem lê a lista.
    await expectCode(caio.repo.getBusinessPeople(b.id), 'nao_encontrado');
  });

  it('encerrar só sem outras pessoas ativas (negocio_com_membros), e os convites pendentes são cancelados', async () => {
    const { hub } = clock();
    const { bia, b, join } = await shared(hub);
    const caio = await person(hub, 'caio');
    await join(caio);
    const pending = await bia.repo.createBusinessInvite(key(), b.id, 'leitor');
    await expectCode(bia.repo.endBusiness(key(), b.id), 'negocio_com_membros');
    await bia.repo.removeBusinessMember(key(), b.id, 'caio');
    await bia.repo.endBusiness(key(), b.id);
    expect(await bia.repo.getBusiness()).toBeNull();
    await expectCode(bia.repo.previewBusinessInvite(pending.code!), 'convite_invalido');
    const duda = await person(hub, 'duda');
    await expectCode(duda.repo.acceptBusinessInvite(key(), pending.code!), 'convite_invalido');
    // Depois de encerrar, quem administrava pode criar outro, e quem saiu também.
    expect((await caio.repo.createBusiness(key(), 'Conserto do Caio')).role).toBe('titular');
    expect((await bia.repo.createBusiness(key(), 'Sacolé novo')).role).toBe('titular');
  });
});

describe('negócio compartilhado na memória: excluir a conta', () => {
  it('quem administra com outras pessoas ativas recebe negocio_com_membros e nada muda; sozinha, o negócio é apagado', async () => {
    const { hub } = clock();
    const { bia, b, join } = await shared(hub);
    const caio = await person(hub, 'caio');
    await join(caio);
    await expectCode(bia.repo.deleteMyAccount('EXCLUIR', key()), 'negocio_com_membros');
    expect((await bia.repo.getBusiness())!.id).toBe(b.id);
    expect((await caio.repo.getBusiness())!.id).toBe(b.id);
    expect((await bia.repo.getSpace())).not.toBeNull();
    // A Família vem antes: titular de Família com outras pessoas recebe transferir_antes primeiro.
    const fam = new MemoryFamilyHub();
    const { hub: hub2 } = clock();
    const vera = await person(hub2, 'hana', fam);
    const ivo = await person(hub2, 'ivo', fam);
    await vera.repo.createFamily(key(), 'Casa');
    const fi = await vera.repo.createFamilyInvite(key(), (await vera.repo.getFamily())!.context.id, 'membro');
    await ivo.repo.acceptFamilyInvite(key(), fi.code!);
    const vb = await vera.repo.createBusiness(key(), 'Loja da Hana');
    const vw = await vera.repo.createBusinessInvite(key(), vb.id, 'membro');
    await ivo.repo.acceptBusinessInvite(key(), vw.code!);
    await expectCode(vera.repo.deleteMyAccount('EXCLUIR', key()), 'transferir_antes');
    // Removida a pessoa, a conta de quem administrava sai e o negócio vai junto.
    await bia.repo.removeBusinessMember(key(), b.id, 'caio');
    await bia.repo.deleteMyAccount('EXCLUIR', key());
    expect(await bia.repo.getBusiness()).toBeNull();
    expect(hub.business(b.id)).toBeNull();
  });

  it('quem participa e exclui a conta sai; se anotou algo, continua na lista como "Pessoa que saiu"', async () => {
    const { hub } = clock();
    const { bia, b, join } = await shared(hub);
    const caio = await person(hub, 'caio');
    const duda = await person(hub, 'duda');
    await join(caio);
    await join(duda, 'leitor');
    const caioAcc = (await caio.repo.listAccounts(b.id))[0]!.id;
    await caio.repo.createRecord(key(), b.id, 'receita', { accountId: caioAcc, amountCents: 5_000, occurredOn: '2026-11-19', description: 'Vendas', category: 'Vendas' });
    await caio.repo.deleteMyAccount('EXCLUIR', key());
    await duda.repo.deleteMyAccount('EXCLUIR', key());
    const view = await bia.repo.getBusinessPeople(b.id);
    expect(view.members.map((m) => `${m.firstName}:${m.status}`)).toEqual(['Bia:ativo', 'Pessoa que saiu:ex-membro']);
    expect(businessAuthorLabel(view.members, 'caio')).toBe('Pessoa que saiu');
    // Sem outras pessoas ativas, quem administra encerra.
    await bia.repo.endBusiness(key(), b.id);
  });
});

describe('demonstração: o negócio compartilhado só nos cenários com o Plus aberto', () => {
  it('a demonstração padrão e o cenário "negocio" continuam com o Plus fechado e sem pessoas', async () => {
    for (const scenario of ['padrao', 'negocio'] as const) {
      const repo = await createDemoRepository({ scenario });
      expect(await repo.getPlusStatus()).toEqual({ open: false });
      expect(demoScenarioOpensPlus(scenario)).toBe(false);
    }
    const repo = await createDemoRepository({ scenario: 'negocio' });
    const b = (await repo.getBusiness())!;
    expect(b).toMatchObject({ name: DEMO_BUSINESS_NAME, role: 'titular' });
    const people = await repo.getBusinessPeople(b.id);
    expect(businessPeopleVisible(people)).toBe(false);
    expect(people.members).toHaveLength(1);
    await expectCode(repo.createBusinessInvite(key(), b.id, 'membro'), 'plus_indisponivel');
  });

  it('cenário "negocio-plus": Maria administra com Rafa, Nina saiu, um convite pendente, e os totais de sempre', async () => {
    expect(demoScenarioFrom('negocio-plus')).toBe('negocio-plus');
    expect(demoScenarioFrom('NEGOCIO-PLUS-MEMBRO')).toBe('negocio-plus-membro');
    const repo = await createDemoRepository({ scenario: 'negocio-plus' });
    expect(await repo.getPlusStatus()).toEqual({ open: true });
    const b = (await repo.getBusiness())!;
    expect(b).toMatchObject({ name: DEMO_BUSINESS_NAME, role: 'titular' });
    const people = await repo.getBusinessPeople(b.id);
    expect(people.members.map((m) => `${m.firstName}:${m.role}:${m.status}:${m.isMe}`)).toEqual([
      'Maria:titular:ativo:true',
      'Rafa:membro:ativo:false',
      'Nina:membro:ex-membro:false',
    ]);
    expect(people.invites.map((i) => [i.role, i.expiresAt])).toEqual([['leitor', '2026-10-14T12:00:00.000Z']]);
    expect(businessSeatsLeft(people, Date.parse('2026-10-07T12:00:00.000Z'))).toBe(3);
    // Rafa anotou as duas entradas de outubro e Nina, o gás de setembro; os totais são os do cenário "negocio".
    const oct = await repo.listRecords(b.id, '2026-10');
    const sep = await repo.listRecords(b.id, '2026-09');
    expect(oct.filter((r) => r.createdBy === DEMO_BUSINESS_PEOPLE.helper.personId).map((r) => r.description).sort()).toEqual(['Encomenda de festa', 'Vendas da semana']);
    expect(sep.filter((r) => r.createdBy === DEMO_BUSINESS_PEOPLE.former.personId).map((r) => r.description)).toEqual(['Gás de cozinha']);
    expect(businessAuthorLabel(people.members, DEMO_BUSINESS_PEOPLE.former.personId)).toBe('Nina (saiu do negócio)');
    expect(businessMonth(oct, b.id, '2026-10')).toMatchObject({ inCents: 76_000, outCents: 41_800 });
    expect(businessMonth(sep, b.id, '2026-09')).toMatchObject({ inCents: 176_000, outCents: 60_100 });
    const space = (await repo.getSpace())!;
    const s = summarizeMonth(await repo.listRecords(space.personalContextId, '2026-10'), space.personalContextId, '2026-10');
    expect([s.receivedCents, s.paidCents]).toEqual([600_000, 390_000]);
    // Convidar mais, mudar o papel de Rafa e removê-lo funcionam na memória.
    const w = await repo.createBusinessInvite(key(), b.id, 'membro');
    expect(w.code).toMatch(/^[0-9a-f]{32}$/);
    await repo.setBusinessMemberRole(key(), b.id, DEMO_BUSINESS_PEOPLE.helper.personId, 'leitor');
    await repo.removeBusinessMember(key(), b.id, DEMO_BUSINESS_PEOPLE.helper.personId);
    await expectCode(repo.acceptBusinessInvite(key(), w.code!), 'ja_no_negocio');
  });

  it('cenário "negocio-plus-membro": Maria anota e vê no negócio da Bia, sem administrar', async () => {
    const repo = await createDemoRepository({ scenario: 'negocio-plus-membro' });
    const b = (await repo.getBusiness())!;
    expect(b).toMatchObject({ name: DEMO_MEMBER_BUSINESS_NAME, role: 'membro' });
    const people = await repo.getBusinessPeople(b.id);
    expect(people.members.map((m) => `${m.firstName}:${m.role}:${m.isMe}`)).toEqual(['Bia:titular:false', 'Maria:membro:true']);
    expect(people.invites).toEqual([]);
    expect(businessPeopleVisible(people)).toBe(true);
    const oct = await repo.listRecords(b.id, '2026-10');
    expect(businessMonth(oct, b.id, '2026-10')).toMatchObject({ inCents: 92_000, outCents: 52_000 });
    expect(oct.filter((r) => r.createdBy === 'pessoa-demo').map((r) => r.description).sort()).toEqual(['Embalagens', 'Entrega para escritório']);
    await expectCode(repo.renameBusiness(key(), b.id, 'Outro'), 'sem_permissao');
    await expectCode(repo.endBusiness(key(), b.id), 'sem_permissao');
    await expectCode(repo.leaveBusiness(key(), repo !== null ? (await repo.getSpace())!.personalContextId : ''), 'contexto_invalido');
    // O Pessoal de sempre.
    const space = (await repo.getSpace())!;
    const s = summarizeMonth(await repo.listRecords(space.personalContextId, '2026-10'), space.personalContextId, '2026-10');
    expect([s.receivedCents, s.paidCents]).toEqual([600_000, 390_000]);
    await repo.leaveBusiness(key(), b.id);
    expect(await repo.getBusiness()).toBeNull();
  });
});
