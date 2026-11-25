import { describe, expect, it } from 'vitest';
import {
  ACCOUNTING_TEXT,
  BUSINESS_ACCOUNTANT_MAX,
  BUSINESS_INVITE_ROLES,
  BUSINESS_INVITE_TEXT,
  BUSINESS_MEMBER_ROLES,
  BUSINESS_PARTNERSHIP_TEXT,
  BUSINESS_PEOPLE_ERROR_CODES,
  BUSINESS_PEOPLE_ERROR_TEXT,
  BUSINESS_PEOPLE_TEXT,
  BUSINESS_ROLE_HELP,
  BUSINESS_ROLE_LABEL,
  DELETE_TEXT,
  DEMO_ACCOUNTING_BUSINESSES,
  DEMO_BUSINESS_NAME,
  DEMO_BUSINESS_PEOPLE,
  MemoryBusinessHub,
  MemoryRepository,
  accountantSeatsLeft,
  businessMonth,
  ERROR_TEXT,
  businessPartnershipErrorText,
  businessPartnershipVisible,
  businessPeopleErrorText,
  businessPeopleVisible,
  businessSeatsLeft,
  businessTransferCandidates,
  businessYear,
  canChangeRole,
  canEndBusiness,
  canTransferTo,
  createDemoRepository,
  deleteBusinessHow,
  deleteBusinessOutcome,
  deleteBusinessText,
  demoScenarioFrom,
  demoScenarioOpensPlus,
  isAccountant,
  isBusinessAction,
  isBusinessInviteRole,
  isBusinessPeopleAction,
  isBusinessRole,
  isRepoError,
  newOperationKey,
  seatsLeftFor,
  sortAccountingBusinesses,
  summarizeMonth,
  type BusinessInvite,
  type BusinessMember,
  type BusinessPeople,
  type RepoError,
  type RepoErrorCode,
} from '../src';

/**
 * Negócio com equipe (D-123, migração 0046; Clarevo Plus, DESLIGADO até o Plus abrir): a sociedade, passar a administração e o papel
 * Contabilidade, nas regras puras, nos textos, no repositório em memória (as mesmas recusas do banco) e na demonstração.
 */

/** Termos que nenhum texto do app usa (o mesmo critério de copy.test.ts), travessões e a expressão proibida. */
const FORBIDDEN =
  /\b(recomendamos|recomendo|invista|aplique|tesouro|cdb|lci|lca|caixinha|cofrinho)\b|fundo de investimento|rentabilidade garantida|rendimento garantido|retorno garantido|enriquec|faz(er|endo)?\s+sentido|[–—]/i;
/** Julgamento, pressão e o que o Plus ainda não pode dizer (preço, nome do plano). */
const JUDGMENT = /\b(preju[ií]zo|lucro|cuidado|aten[cç][aã]o|alerta|ruim|parab[eé]ns|deveria|urgente|agora mesmo)\b/i;
const PRICE = /R\$|\bpre[cç]o\b|\bplus\b|assinatura|\bgr[aá]tis\b/i;
/** A Clarevo não orienta contabilidade, impostos nem a declaração. */
const ADVICE = /\b(declare|pague|recolha|deduza|sonegar)\b|imposto devido|voc[eê] deve (pagar|declarar)/i;

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
      for (const args of [['Rafa'], [true], [false], [0], [1], [2], [3], ['Oficina do Téo', 'Téo', '2026-03-02'], ['contabilidade'], ['membro'], ['leitor'], ['2026-03-02']]) {
        try {
          const r = (v as (...a: unknown[]) => unknown)(...args);
          if (typeof r === 'string' && !/undefined|NaN/.test(r)) out.push(r);
        } catch {
          // Outros parâmetros: as outras chamadas cobrem.
        }
      }
      return out;
    }
    return [];
  });

/** Relógio dos testes: o convite vale 7 dias a partir daqui. */
function clock(plusOpen = true) {
  const c = { ms: Date.parse('2026-11-20T12:00:00.000Z') };
  let n = 7;
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
  enio: 'Ênio Prado',
  fabi: 'Fabi Melo',
  gil: 'Gil Rocha',
  hana: 'Hana Dias',
  ivo: 'Ivo Sá',
  joca: 'Joca Paz',
  lara: 'Lara Neri',
  mel: '',
};

async function person(hub: MemoryBusinessHub, id: keyof typeof NAMES) {
  const repo = new MemoryRepository({ actorId: id, displayName: NAMES[id]!, today: () => '2026-11-20', business: hub });
  const space = await repo.ensurePersonalSpace('Conta principal');
  return { id: id as string, repo, personal: space.personalContextId };
}

/** Bia administra "Sacolé da Bia"; `join` convida (com o papel) e a pessoa aceita. */
async function shared(hub: MemoryBusinessHub) {
  const bia = await person(hub, 'bia');
  const b = await bia.repo.createBusiness(key(), 'Sacolé da Bia');
  const join = async (who: Awaited<ReturnType<typeof person>>, role: 'membro' | 'leitor' | 'contabilidade' = 'membro') => {
    const w = await bia.repo.createBusinessInvite(key(), b.id, role);
    return who.repo.acceptBusinessInvite(key(), w.code!);
  };
  return { bia, b, join };
}

const member = (over: Partial<BusinessMember>): BusinessMember => ({
  personId: 'x',
  firstName: 'Rafa',
  role: 'membro',
  status: 'ativo',
  isMe: false,
  joinedAt: '2026-11-01T12:00:00.000Z',
  leftAt: null,
  ...over,
});

const invite = (role: BusinessInvite['role'], expiresAt = '2026-11-26T12:00:00.000Z'): BusinessInvite => ({
  id: `${role}-${expiresAt}`,
  contextId: 'n',
  role,
  createdBy: 'me',
  expiresAt,
  usedAt: null,
  cancelledAt: null,
  createdAt: '2026-11-19T12:00:00.000Z',
});

describe('negócio com equipe: regras puras (D-123)', () => {
  const now = Date.parse('2026-11-20T12:00:00.000Z');
  const me = member({ personId: 'me', firstName: 'Maria', role: 'titular', isMe: true });
  const rafa = member({ personId: 'rafa' });
  const nina = member({ personId: 'nina', firstName: 'Nina', role: 'leitor' });
  const dora = member({ personId: 'dora', firstName: 'Dora', role: 'contabilidade' });

  it('os papéis: "Contabilidade" à parte, fora das trocas de papel', () => {
    expect(BUSINESS_INVITE_ROLES).toEqual(['membro', 'leitor', 'contabilidade']);
    expect(BUSINESS_MEMBER_ROLES).toEqual(['membro', 'leitor']);
    expect(BUSINESS_ROLE_LABEL.contabilidade).toBe('Contabilidade');
    expect(BUSINESS_ROLE_HELP.contabilidade).toBe('Vê e exporta os lançamentos deste negócio. Não anota nem muda nada, e não vê o Pessoal nem a Família de ninguém.');
    expect(isBusinessInviteRole('contabilidade')).toBe(true);
    expect(isBusinessInviteRole('titular')).toBe(false);
    expect(isBusinessRole('titular')).toBe(true);
    expect(isBusinessRole('dono')).toBe(false);
    expect(isAccountant(dora)).toBe(true);
    expect(isAccountant(rafa)).toBe(false);
    expect(canChangeRole(rafa)).toBe(true);
    expect(canChangeRole(nina)).toBe(true);
    expect(canChangeRole(dora)).toBe(false);
    expect(BUSINESS_ACCOUNTANT_MAX).toBe(3);
    expect(isBusinessPeopleAction('transferir_administracao_negocio')).toBe(true);
    expect(isBusinessAction('definir_sociedade_negocio')).toBe(true);
    expect(BUSINESS_PEOPLE_ERROR_CODES).toContain('contabilidade_cheia');
  });

  it('as vagas: a Contabilidade (pessoas e convites) fica fora das 6 pessoas e tem os 3 acessos dela', () => {
    const people: Pick<BusinessPeople, 'members' | 'invites'> = {
      members: [me, rafa, dora, member({ personId: 'ex', role: 'contabilidade', status: 'ex-membro', leftAt: '2026-11-10T12:00:00.000Z' })],
      invites: [invite('leitor'), invite('contabilidade'), invite('contabilidade', '2026-11-19T12:00:00.000Z')],
    };
    // 6 menos Maria, Rafa e o convite "Só vê"; 3 menos Dora e o convite de Contabilidade válido (o vencido e quem saiu não contam).
    expect(businessSeatsLeft(people, now)).toBe(3);
    expect(accountantSeatsLeft(people, now)).toBe(1);
    expect(seatsLeftFor(people, 'membro', now)).toBe(3);
    expect(seatsLeftFor(people, 'leitor', now)).toBe(3);
    expect(seatsLeftFor(people, 'contabilidade', now)).toBe(1);
    expect(accountantSeatsLeft({ members: [me, dora, dora, dora], invites: [] }, now)).toBe(0);
  });

  it('encerrar: a Contabilidade não impede; quem anota ou só vê, sim', () => {
    expect(canEndBusiness([me, dora])).toBe(true);
    expect(canEndBusiness([me, dora, nina])).toBe(false);
    // Sem o papel (chamadas antigas), toda outra pessoa ativa impede, como antes.
    expect(canEndBusiness([{ status: 'ativo', isMe: true }, { status: 'ativo', isMe: false }])).toBe(false);
  });

  it('passar a administração: só quem administra, com o Plus aberto, para outra pessoa ativa que anota ou só vê', () => {
    const owner: Pick<BusinessPeople, 'role' | 'plusOpen'> = { role: 'titular', plusOpen: true };
    expect(canTransferTo(owner, rafa)).toBe(true);
    expect(canTransferTo(owner, nina)).toBe(true);
    expect(canTransferTo(owner, dora)).toBe(false);
    expect(canTransferTo(owner, me)).toBe(false);
    expect(canTransferTo(owner, { ...rafa, status: 'ex-membro' })).toBe(false);
    expect(canTransferTo({ ...owner, plusOpen: false }, rafa)).toBe(false);
    expect(canTransferTo({ role: 'membro', plusOpen: true }, nina)).toBe(false);
    expect(businessTransferCandidates({ ...owner, members: [me, rafa, dora, nina] }).map((m) => m.personId)).toEqual(['rafa', 'nina']);
    expect(businessTransferCandidates({ ...owner, members: [me, dora] })).toEqual([]);
  });

  it('a pergunta da sociedade: só quem administra e só com o Plus aberto', () => {
    expect(businessPartnershipVisible({ role: 'titular', plusOpen: true })).toBe(true);
    expect(businessPartnershipVisible({ role: 'titular', plusOpen: false })).toBe(false);
    expect(businessPartnershipVisible({ role: 'membro', plusOpen: true })).toBe(false);
    expect(businessPartnershipVisible(null)).toBe(false);
    // Com o Plus fechado e sozinha, a seção inteira continua escondida (D-120).
    expect(businessPeopleVisible({ role: 'titular', plusOpen: false, members: [me], invites: [] })).toBe(false);
  });

  it('a lista da Contabilidade por nome, com o id como desempate', () => {
    const b = (id: string, name: string) => ({ id, name, businessProfile: null, adminName: 'Téo', createdAt: '2025-01-01T00:00:00.000Z', since: '2026-01-01T00:00:00.000Z' });
    expect(sortAccountingBusinesses([b('2', 'Oficina'), b('1', 'Ateliê'), b('0', 'Oficina')]).map((x) => x.id)).toEqual(['1', '0', '2']);
  });

  it('a exclusão da conta: a Contabilidade não bloqueia; com o Plus aberto, passar a administração também resolve', () => {
    expect(deleteBusinessOutcome({ role: 'titular' }, { members: [me, dora] })).toBe('proprio');
    expect(deleteBusinessOutcome({ role: 'titular' }, { members: [me, dora, rafa] })).toBe('bloqueia');
    expect(deleteBusinessText('bloqueia', 'Sacolé', true)).toBe(
      'Você administra o negócio Sacolé e há outras pessoas nele. Antes de excluir a conta, passe a administração para outra pessoa ou remova as outras pessoas do negócio.',
    );
    // Com o Plus fechado, a frase de antes (nada novo aparece).
    expect(deleteBusinessText('bloqueia', 'Sacolé')).toBe(DELETE_TEXT.businessBlocked('Sacolé'));
    expect(deleteBusinessHow(true)).toBe('Em "Seu negócio", toque em "Gerenciar" ao lado de uma pessoa e escolha "Passar a administração" ou "Remover do negócio".');
    expect(deleteBusinessHow(false)).toBe(DELETE_TEXT.businessBlockedHow);
  });
});

describe('negócio com equipe: os textos (D-123)', () => {
  it('pt-BR, neutros, sem travessão, sem julgamento, sem preço, sem "titular" e sem orientação contábil', () => {
    const all = [
      ...texts(BUSINESS_PARTNERSHIP_TEXT),
      ...texts(ACCOUNTING_TEXT),
      ...texts(BUSINESS_PEOPLE_TEXT),
      ...texts(BUSINESS_INVITE_TEXT),
      ...Object.values(BUSINESS_PEOPLE_ERROR_TEXT),
      ...Object.values(BUSINESS_ROLE_HELP),
      ...Object.values(BUSINESS_ROLE_LABEL),
      DELETE_TEXT.businessBlockedPlus('Sacolé'),
      DELETE_TEXT.businessBlockedHowPlus,
    ];
    expect(all.length).toBeGreaterThan(120);
    for (const t of all) {
      expect(t, t).not.toMatch(FORBIDDEN);
      expect(t, t).not.toMatch(JUDGMENT);
      expect(t, t).not.toMatch(PRICE);
      expect(t, t).not.toMatch(ADVICE);
      expect(t, t).not.toMatch(/\btitular\b/i);
    }
  });

  it('as frases pedidas', () => {
    expect(BUSINESS_PARTNERSHIP_TEXT.question).toBe('O negócio é uma sociedade?');
    expect(BUSINESS_PARTNERSHIP_TEXT.answer(true)).toBe('O negócio é uma sociedade.');
    expect(BUSINESS_PARTNERSHIP_TEXT.answer(false)).toBe('O negócio não é uma sociedade.');
    expect(BUSINESS_PARTNERSHIP_TEXT.yesHint).toContain('Convide as outras pessoas sócias, por exemplo com "Anota e vê"');
    expect(BUSINESS_PARTNERSHIP_TEXT.yesHint).toContain('passe a administração para uma delas');
    expect(BUSINESS_PEOPLE_TEXT.transferTitle('Rafa')).toBe('Passar a administração para Rafa?');
    expect(BUSINESS_PEOPLE_TEXT.transferBody('Rafa')).toBe(
      'Rafa passa a convidar, mudar papéis, remover pessoas e encerrar o negócio. Você continua no negócio com "Anota e vê" e pode sair depois.',
    );
    expect(BUSINESS_PEOPLE_TEXT.accountantSeats(0)).toBe('Os 3 acessos de Contabilidade estão em uso, contando os convites pendentes.');
    expect(BUSINESS_PEOPLE_TEXT.accountantSeats(1)).toContain('Cabe mais 1 acesso de Contabilidade');
    expect(BUSINESS_PEOPLE_TEXT.inviteRow('contabilidade', '2026-10-14')).toBe('Contabilidade · vale até 14/10');
    expect(BUSINESS_INVITE_TEXT.roleLine('contabilidade')).toBe(
      'Você vai ver e exportar os lançamentos deste negócio, sem anotar nem mudar nada, e sem ver o Pessoal de ninguém.',
    );
    expect(BUSINESS_INVITE_TEXT.acceptedAccountant('Sacolé da Maria')).toBe('Agora você acompanha o negócio Sacolé da Maria.');
    expect(businessPeopleErrorText('contabilidade_cheia')).toContain('3 acessos de Contabilidade');
    expect(businessPeopleErrorText('contabilidade_cheia', true)).toBe('Este negócio já tem 3 acessos de Contabilidade. Peça a quem convidou para liberar um acesso.');
    // Só ver e exportar: a frase de sempre do app (a trava da assinatura), e não "Não foi possível salvar".
    expect(businessPeopleErrorText('assinatura_necessaria')).toBe(ERROR_TEXT.assinatura_necessaria);
    // A pergunta da sociedade que deixou de valer: uma frase neutra, sem falar em convite nem no plano.
    expect(businessPartnershipErrorText('plus_indisponivel')).toBe('Não foi possível salvar a resposta agora. Atualize a tela.');
    expect(businessPartnershipErrorText('assinatura_necessaria')).toBe(ERROR_TEXT.assinatura_necessaria);
    expect(businessPartnershipErrorText('sem_permissao')).toBe(businessPeopleErrorText('sem_permissao'));
    expect(ACCOUNTING_TEXT.accountTitle).toBe('Negócios que você acompanha');
    expect(ACCOUNTING_TEXT.accountHint(2)).toMatch(/^Você acompanha 2 negócios como Contabilidade/);
    expect(ACCOUNTING_TEXT.accountHint(1)).toMatch(/^Você acompanha 1 negócio como Contabilidade/);
    expect(ACCOUNTING_TEXT.rowSince('2026-03-02')).toBe('Você acompanha desde 02/03/2026');
    expect(ACCOUNTING_TEXT.leaveTitle('Oficina do Téo')).toBe('Deixar de acompanhar Oficina do Téo?');
  });
});

describe('negócio com equipe na memória: passar a administração (transfer_business_admin)', () => {
  it('a ordem das recusas, os papéis trocados, os convites que continuam, sem a chave do Plus e a chave repetida', async () => {
    const { hub } = clock();
    const { bia, b, join } = await shared(hub);
    const caio = await person(hub, 'caio');
    const duda = await person(hub, 'duda');
    const enio = await person(hub, 'enio');
    const fabi = await person(hub, 'fabi');
    await join(caio, 'membro');
    await join(duda, 'leitor');
    await join(enio, 'contabilidade');
    const pending = await bia.repo.createBusinessInvite(key(), b.id, 'leitor');
    // Recusas, em ordem.
    await expectCode(fabi.repo.transferBusinessAdmin(key(), b.id, 'caio'), 'nao_encontrado');
    await expectCode(bia.repo.transferBusinessAdmin(key(), bia.personal, 'caio'), 'contexto_invalido');
    await expectCode(caio.repo.transferBusinessAdmin(key(), b.id, 'duda'), 'sem_permissao');
    await expectCode(bia.repo.transferBusinessAdmin(key(), b.id, 'bia'), 'nao_sobre_si');
    await expectCode(bia.repo.transferBusinessAdmin(key(), b.id, 'fabi'), 'nao_encontrado');
    await expectCode(bia.repo.transferBusinessAdmin(key(), b.id, 'enio'), 'papel_invalido');
    // O Plus fechado não impede: é a saída de um negócio que ficaria preso.
    hub.setPlusOpen(false);
    const k = key();
    await bia.repo.transferBusinessAdmin(k, b.id, 'duda');
    // A mesma chave repete sem erro; outro conteúdo com a mesma chave, não.
    await bia.repo.transferBusinessAdmin(k, b.id, 'duda');
    await expectCode(bia.repo.transferBusinessAdmin(k, b.id, 'caio'), 'chave_reutilizada');
    // Quem administrava passa a "Anota e vê"; quem só via passa a administrar (lê, anota e edita o que é de outras pessoas).
    expect((await bia.repo.getBusiness())!.role).toBe('membro');
    expect((await duda.repo.getBusiness())!.role).toBe('titular');
    hub.setPlusOpen(true);
    const people = await duda.repo.getBusinessPeople(b.id);
    const active = people.members.filter((m) => m.status === 'ativo').map((m) => `${m.personId}:${m.role}`);
    // Quem administra no topo e a Contabilidade por último.
    expect(active[0]).toBe('duda:titular');
    expect(active[3]).toBe('enio:contabilidade');
    expect([...active].sort()).toEqual(['bia:membro', 'caio:membro', 'duda:titular', 'enio:contabilidade']);
    // Os convites válidos continuam, agora na lista de quem administra.
    expect(people.invites.map((i) => i.id)).toEqual([pending.invite.id]);
    expect((await bia.repo.getBusinessPeople(b.id)).invites).toEqual([]);
    // Bia já não administra: não convida, não renomeia; pode anotar e sair.
    await expectCode(bia.repo.createBusinessInvite(key(), b.id, 'membro'), 'sem_permissao');
    await expectCode(bia.repo.renameBusiness(key(), b.id, 'Outro nome'), 'sem_permissao');
    const acc = (await bia.repo.listAccounts(b.id))[0]!.id;
    await bia.repo.createRecord(key(), b.id, 'receita', { accountId: acc, amountCents: 1000, occurredOn: '2026-11-20', description: 'Venda', category: 'Vendas' });
    await expectCode(duda.repo.leaveBusiness(key(), b.id), 'titular_nao_sai');
    await bia.repo.leaveBusiness(key(), b.id);
    expect(await bia.repo.getBusiness()).toBeNull();
    // Duda administra: renomeia, muda papéis e passa de volta para Caio.
    expect((await duda.repo.renameBusiness(key(), b.id, 'Sacolé da Duda')).name).toBe('Sacolé da Duda');
    await duda.repo.transferBusinessAdmin(key(), b.id, 'caio');
    expect((await caio.repo.getBusiness())!.role).toBe('titular');
    expect((await duda.repo.getBusiness())!.role).toBe('membro');
  });

  it('a exclusão da conta segue quem administra agora', async () => {
    const { hub } = clock();
    const { bia, b, join } = await shared(hub);
    const caio = await person(hub, 'caio');
    await join(caio, 'membro');
    await expectCode(bia.repo.deleteMyAccount('EXCLUIR', key()), 'negocio_com_membros');
    await bia.repo.transferBusinessAdmin(key(), b.id, 'caio');
    // Bia participa do negócio de Caio: sai ao excluir a conta, e o negócio continua com Caio.
    await bia.repo.deleteMyAccount('EXCLUIR', key());
    expect((await caio.repo.getBusiness())!.id).toBe(b.id);
    expect((await caio.repo.getBusinessPeople(b.id)).members.filter((m) => m.status === 'ativo').map((m) => m.personId)).toEqual(['caio']);
  });
});

describe('negócio com equipe na memória: a sociedade (set_business_partnership)', () => {
  it('só quem administra, com o Plus aberto; nulo limpa; não muda permissão nenhuma', async () => {
    const { hub } = clock();
    const { bia, b, join } = await shared(hub);
    const caio = await person(hub, 'caio');
    const duda = await person(hub, 'duda');
    await join(caio, 'membro');
    expect((await bia.repo.getBusiness())!.businessPartnership).toBeNull();
    await expectCode(duda.repo.setBusinessPartnership(key(), b.id, true), 'nao_encontrado');
    await expectCode(bia.repo.setBusinessPartnership(key(), bia.personal, true), 'contexto_invalido');
    await expectCode(caio.repo.setBusinessPartnership(key(), b.id, true), 'sem_permissao');
    hub.setPlusOpen(false);
    await expectCode(bia.repo.setBusinessPartnership(key(), b.id, true), 'plus_indisponivel');
    hub.setPlusOpen(true);
    const k = key();
    const yes = await bia.repo.setBusinessPartnership(k, b.id, true);
    expect(yes).toMatchObject({ id: b.id, role: 'titular', businessPartnership: true });
    expect(await bia.repo.setBusinessPartnership(k, b.id, true)).toEqual(yes);
    await expectCode(bia.repo.setBusinessPartnership(k, b.id, false), 'chave_reutilizada');
    // Quem anota lê a resposta (o negócio é o mesmo), mas o papel não muda.
    expect(await caio.repo.getBusiness()).toMatchObject({ role: 'membro', businessPartnership: true });
    expect((await bia.repo.setBusinessPartnership(key(), b.id, false)).businessPartnership).toBe(false);
    expect((await bia.repo.setBusinessPartnership(key(), b.id, null)).businessPartnership).toBeNull();
  });
});

describe('negócio com equipe na memória: o papel Contabilidade', () => {
  it('convidar: até 3 acessos contando os convites válidos (contabilidade_cheia), fora das 6 pessoas', async () => {
    const { hub, c } = clock();
    const { bia, b } = await shared(hub);
    const w1 = await bia.repo.createBusinessInvite(key(), b.id, 'contabilidade');
    expect(w1.invite.role).toBe('contabilidade');
    await bia.repo.createBusinessInvite(key(), b.id, 'contabilidade');
    await bia.repo.createBusinessInvite(key(), b.id, 'contabilidade');
    await expectCode(bia.repo.createBusinessInvite(key(), b.id, 'contabilidade'), 'contabilidade_cheia');
    // As 6 pessoas não mudam: cabem 5 convites de "Anota e vê" ou "Só vê".
    const people = await bia.repo.getBusinessPeople(b.id);
    expect(businessSeatsLeft(people, c.ms)).toBe(5);
    expect(accountantSeatsLeft(people, c.ms)).toBe(0);
    for (let i = 0; i < 5; i += 1) await bia.repo.createBusinessInvite(key(), b.id, i % 2 ? 'leitor' : 'membro');
    await expectCode(bia.repo.createBusinessInvite(key(), b.id, 'membro'), 'negocio_cheio');
    // Cancelar um convite de Contabilidade libera um acesso.
    await bia.repo.cancelBusinessInvite(key(), w1.invite.id);
    await bia.repo.createBusinessInvite(key(), b.id, 'contabilidade');
    // O Plus fechado recusa antes do papel.
    hub.setPlusOpen(false);
    await expectCode(bia.repo.createBusinessInvite(key(), b.id, 'contabilidade'), 'plus_indisponivel');
    hub.setPlusOpen(true);
    await expectCode(bia.repo.createBusinessInvite(key(), b.id, 'titular' as 'membro'), 'papel_invalido');
  });

  it('aceitar: sem ja_tem_negocio nem negocio_cheio; contabilidade_cheia com 3 acessos; ja_no_negocio com qualquer papel', async () => {
    const { hub } = clock();
    const { bia, b, join } = await shared(hub);
    // Caio tem o próprio negócio e acompanha o de Bia; Duda participa de outro negócio e acompanha o de Bia.
    const caio = await person(hub, 'caio');
    const own = await caio.repo.createBusiness(key(), 'Oficina do Caio');
    const preview = await (async () => {
      const w = await bia.repo.createBusinessInvite(key(), b.id, 'contabilidade');
      const p = await caio.repo.previewBusinessInvite(w.code!);
      return { w, p };
    })();
    expect(preview.p).toMatchObject({ businessName: 'Sacolé da Bia', invitedBy: 'Bia', role: 'contabilidade' });
    const joined = await caio.repo.acceptBusinessInvite(key(), preview.w.code!);
    // O papel da resposta é 'contabilidade'; o negócio é lido como quem só vê (nunca vira espaço de quem acompanha).
    expect(joined.role).toBe('contabilidade');
    expect(joined.context).toMatchObject({ id: b.id, role: 'leitor', businessPartnership: null });
    // O negócio próprio continua sendo o único negócio de Caio.
    expect((await caio.repo.getBusiness())!.id).toBe(own.id);
    // A Contabilidade não conta nas 6 pessoas: com 5 pessoas que anotam, mais a Contabilidade, o negócio ainda aceita a sexta.
    const others = ['duda', 'enio', 'fabi', 'gil'] as const;
    for (const id of others) await join(await person(hub, id), 'membro');
    await join(await person(hub, 'hana'), 'leitor');
    expect((await bia.repo.getBusinessPeople(b.id)).members.filter((m) => m.status === 'ativo')).toHaveLength(7);
    // Quem já está no negócio (com qualquer papel) recebe ja_no_negocio, também num convite de Contabilidade.
    const again = await bia.repo.createBusinessInvite(key(), b.id, 'contabilidade');
    await expectCode(caio.repo.acceptBusinessInvite(key(), again.code!), 'ja_no_negocio');
    // Caio ativo e os convites "again" e "late" válidos: os 3 acessos estão em uso.
    const late = await bia.repo.createBusinessInvite(key(), b.id, 'contabilidade');
    await expectCode(bia.repo.createBusinessInvite(key(), b.id, 'contabilidade'), 'contabilidade_cheia');
    expect(accountantSeatsLeft(await bia.repo.getBusinessPeople(b.id), Date.parse('2026-11-20T12:00:00.000Z'))).toBe(0);
    const ivo = await person(hub, 'ivo');
    await ivo.repo.acceptBusinessInvite(key(), again.code!);
    // Se outro acesso entra antes do aceite (ao mesmo tempo), o aceite conta os 3 ativos e recusa; com a vaga de volta, entra.
    const members = hub['members'];
    members.set(`${b.id}|joca`, { contextId: b.id, personId: 'joca', owner: false, canWrite: false, accountant: true, joinedAt: '2026-11-20T12:00:00.000Z', leftAt: null });
    const lara = await person(hub, 'lara');
    await expectCode(lara.repo.acceptBusinessInvite(key(), late.code!), 'contabilidade_cheia');
    members.delete(`${b.id}|joca`);
    expect((await lara.repo.acceptBusinessInvite(key(), late.code!)).role).toBe('contabilidade');
  });

  it('só lê: não anota, não muda de papel, não recebe a administração; quem administra remove; a pessoa deixa de acompanhar', async () => {
    const { hub } = clock();
    const { bia, b, join } = await shared(hub);
    const caio = await person(hub, 'caio');
    await join(caio, 'contabilidade');
    // Lê os lançamentos do negócio, mas não anota.
    const acc = (await bia.repo.listAccounts(b.id))[0]!.id;
    await bia.repo.createRecord(key(), b.id, 'receita', { accountId: acc, amountCents: 5000, occurredOn: '2026-11-20', description: 'Venda', category: 'Vendas' });
    const caioAcc = (await caio.repo.listAccounts(b.id))[0]!.id;
    await expectCode(
      caio.repo.createRecord(key(), b.id, 'receita', { accountId: caioAcc, amountCents: 5000, occurredOn: '2026-11-20', description: 'Venda', category: 'Vendas' }),
      'sem_permissao',
    );
    await expectCode(caio.repo.createBusinessWithdrawal(key(), b.id, { businessAccountId: caioAcc, personalAccountId: 'x', amountCents: 100, occurredOn: '2026-11-20', description: null }), 'sem_permissao');
    await expectCode(caio.repo.createBusinessInvite(key(), b.id, 'membro'), 'sem_permissao');
    await expectCode(caio.repo.setBusinessPartnership(key(), b.id, true), 'sem_permissao');
    // Não muda de papel (nem para, nem de) e não recebe a administração.
    await expectCode(bia.repo.setBusinessMemberRole(key(), b.id, 'caio', 'membro'), 'papel_invalido');
    await expectCode(bia.repo.setBusinessMemberRole(key(), b.id, 'caio', 'contabilidade' as 'membro'), 'papel_invalido');
    await expectCode(bia.repo.transferBusinessAdmin(key(), b.id, 'caio'), 'papel_invalido');
    // Fora dos espaços: getBusiness não o mostra; a lista da Contabilidade, sim.
    expect(await caio.repo.getBusiness()).toBeNull();
    expect(await caio.repo.listAccountingBusinesses()).toEqual([
      { id: b.id, name: 'Sacolé da Bia', businessProfile: null, adminName: 'Bia', createdAt: b.createdAt, since: '2026-11-20T12:00:00.000Z' },
    ]);
    // Criar o próprio negócio continua valendo (um negócio por vez não conta a Contabilidade).
    const own = await caio.repo.createBusiness(key(), 'Escritório do Caio');
    expect((await caio.repo.getBusiness())!.id).toBe(own.id);
    // Deixar de acompanhar (sair).
    await caio.repo.leaveBusiness(key(), b.id);
    expect(await caio.repo.listAccountingBusinesses()).toEqual([]);
    // Quem administra remove a Contabilidade.
    const duda = await person(hub, 'duda');
    await join(duda, 'contabilidade');
    await bia.repo.removeBusinessMember(key(), b.id, 'duda');
    expect(await duda.repo.listAccountingBusinesses()).toEqual([]);
    expect((await bia.repo.getBusinessPeople(b.id)).members.find((m) => m.personId === 'duda')).toMatchObject({ role: 'contabilidade', status: 'ex-membro' });
  });

  it('encerrar e excluir a conta: a Contabilidade não impede, e perde o acesso', async () => {
    const { hub } = clock();
    const { bia, b, join } = await shared(hub);
    const caio = await person(hub, 'caio');
    await join(caio, 'contabilidade');
    expect(canEndBusiness((await bia.repo.getBusinessPeople(b.id)).members)).toBe(true);
    await bia.repo.endBusiness(key(), b.id);
    expect(await caio.repo.listAccountingBusinesses()).toEqual([]);
    expect(await caio.repo.listRecords(b.id, '2026-11')).toEqual([]);
    // Outro negócio, só com a Contabilidade: quem administra exclui a conta, e o negócio vai junto.
    const duda = await person(hub, 'duda');
    const d = await duda.repo.createBusiness(key(), 'Doces da Duda');
    const w = await duda.repo.createBusinessInvite(key(), d.id, 'contabilidade');
    await caio.repo.acceptBusinessInvite(key(), w.code!);
    expect((await caio.repo.listAccountingBusinesses()).map((x) => x.name)).toEqual(['Doces da Duda']);
    await duda.repo.deleteMyAccount('EXCLUIR', key());
    expect(await caio.repo.listAccountingBusinesses()).toEqual([]);
  });

  it('a lista: por nome, quem administra pelo primeiro nome ("Pessoa do negócio" sem nome) e desde quando', async () => {
    const { hub, c } = clock();
    const caio = await person(hub, 'caio');
    const mel = await person(hub, 'mel');
    const bia = await person(hub, 'bia');
    const m = await mel.repo.createBusiness(key(), 'Marcenaria');
    const b = await bia.repo.createBusiness(key(), 'Ateliê da Bia');
    const wm = await mel.repo.createBusinessInvite(key(), m.id, 'contabilidade');
    await caio.repo.acceptBusinessInvite(key(), wm.code!);
    c.ms += 24 * 60 * 60 * 1000;
    const wb = await bia.repo.createBusinessInvite(key(), b.id, 'contabilidade');
    await caio.repo.acceptBusinessInvite(key(), wb.code!);
    expect(await caio.repo.listAccountingBusinesses()).toEqual([
      { id: b.id, name: 'Ateliê da Bia', businessProfile: null, adminName: 'Bia', createdAt: b.createdAt, since: '2026-11-21T12:00:00.000Z' },
      { id: m.id, name: 'Marcenaria', businessProfile: null, adminName: 'Pessoa do negócio', createdAt: m.createdAt, since: '2026-11-20T12:00:00.000Z' },
    ]);
    // O tipo do negócio vem junto; passar a administração muda quem administra na lista.
    await bia.repo.setBusinessProfile(key(), b.id, 'mei');
    expect((await caio.repo.listAccountingBusinesses())[0]).toMatchObject({ businessProfile: 'mei', adminName: 'Bia' });
  });
});

describe('negócio com equipe na memória: os convites de quem sai ou é removido (clarevo_cancel_business_invites_of)', () => {
  it('sair e ser removido cancelam os convites pendentes que a pessoa criou no negócio; os de outras pessoas e os usados não mudam', async () => {
    const { hub, c } = clock();
    const { bia, b, join } = await shared(hub);
    const caio = await person(hub, 'caio');
    const duda = await person(hub, 'duda');
    await join(caio, 'membro');
    await join(duda, 'membro');
    // Bia passa a administração para Caio com dois convites pendentes dela; Caio cria um; um convite de Bia já foi usado por Ênio.
    const used = await bia.repo.createBusinessInvite(key(), b.id, 'leitor');
    await (await person(hub, 'enio')).repo.acceptBusinessInvite(key(), used.code!);
    const fromBia = await bia.repo.createBusinessInvite(key(), b.id, 'membro');
    const fromBiaAcc = await bia.repo.createBusinessInvite(key(), b.id, 'contabilidade');
    await bia.repo.transferBusinessAdmin(key(), b.id, 'caio');
    const fromCaio = await caio.repo.createBusinessInvite(key(), b.id, 'leitor');
    const pending = async () => (await caio.repo.getBusinessPeople(b.id)).invites.map((i) => i.id).sort();
    expect(await pending()).toEqual([fromBia.invite.id, fromBiaAcc.invite.id, fromCaio.invite.id].sort());
    // Bia sai: os dois convites pendentes dela são cancelados e deixam de valer; o de Caio continua.
    c.ms += 60 * 1000;
    await bia.repo.leaveBusiness(key(), b.id);
    expect(await pending()).toEqual([fromCaio.invite.id]);
    const stored = hub['invites'];
    expect(stored.get(fromBia.invite.id)!.cancelledAt).toBe('2026-11-20T12:01:00.000Z');
    expect(stored.get(used.invite.id)!.cancelledAt).toBeNull();
    await expectCode((await person(hub, 'fabi')).repo.acceptBusinessInvite(key(), fromBia.code!), 'convite_invalido');
    // Caio passa a administração para Duda e é removido por ela: o convite de Caio também é cancelado.
    await caio.repo.transferBusinessAdmin(key(), b.id, 'duda');
    const fromDuda = await duda.repo.createBusinessInvite(key(), b.id, 'membro');
    await duda.repo.removeBusinessMember(key(), b.id, 'caio');
    expect((await duda.repo.getBusinessPeople(b.id)).invites.map((i) => i.id)).toEqual([fromDuda.invite.id]);
    expect(stored.get(fromCaio.invite.id)!.cancelledAt).not.toBeNull();
    await expectCode((await person(hub, 'gil')).repo.acceptBusinessInvite(key(), fromCaio.code!), 'convite_invalido');
    // A repetição da saída com a mesma chave não cancela de novo (nada muda).
    expect(stored.get(fromDuda.invite.id)!.cancelledAt).toBeNull();
  });
});

describe('demonstração do negócio com equipe (D-123)', () => {
  it('cenário "negocio-plus": Dora acompanha como Contabilidade, fora das 6 pessoas, com 2 acessos livres', async () => {
    const repo = await createDemoRepository({ scenario: 'negocio-plus' });
    const b = (await repo.getBusiness())!;
    expect(b.businessPartnership).toBeNull();
    const people = await repo.getBusinessPeople(b.id);
    const now = Date.parse('2026-10-07T12:00:00.000Z');
    expect(people.members.find((m) => m.personId === DEMO_BUSINESS_PEOPLE.accountant.personId)).toMatchObject({ firstName: 'Dora', role: 'contabilidade', status: 'ativo' });
    expect(businessSeatsLeft(people, now)).toBe(3);
    expect(accountantSeatsLeft(people, now)).toBe(2);
    expect(businessPartnershipVisible(people)).toBe(true);
    expect(businessTransferCandidates(people).map((m) => m.firstName)).toEqual(['Rafa']);
    // A sociedade e passar a administração funcionam na memória.
    expect((await repo.setBusinessPartnership(key(), b.id, true)).businessPartnership).toBe(true);
    await repo.transferBusinessAdmin(key(), b.id, DEMO_BUSINESS_PEOPLE.helper.personId);
    expect((await repo.getBusiness())!.role).toBe('membro');
  });

  it('cenário "negocio-plus-contabilidade": o negócio próprio no seletor, dois negócios acompanhados fora dele, e os totais de sempre', async () => {
    expect(demoScenarioFrom('negocio-plus-contabilidade')).toBe('negocio-plus-contabilidade');
    expect(demoScenarioOpensPlus('negocio-plus-contabilidade')).toBe(true);
    const repo = await createDemoRepository({ scenario: 'negocio-plus-contabilidade' });
    expect(await repo.getPlusStatus()).toEqual({ open: true });
    const own = (await repo.getBusiness())!;
    expect(own).toMatchObject({ name: DEMO_BUSINESS_NAME, role: 'titular' });
    const ownPeople = await repo.getBusinessPeople(own.id);
    expect(ownPeople.members.map((m) => m.firstName)).toEqual(['Maria']);
    const list = await repo.listAccountingBusinesses();
    expect(list).toEqual([
      { id: 'neg-demo-pessoa-lia', name: 'Ateliê da Lia', businessProfile: 'me_epp', adminName: 'Lia', createdAt: '2026-01-10T09:00:00.000Z', since: '2026-06-15T12:00:00.000Z' },
      { id: 'neg-demo-pessoa-teo', name: 'Oficina do Téo', businessProfile: 'mei', adminName: 'Téo', createdAt: '2025-08-01T09:00:00.000Z', since: '2026-03-02T12:00:00.000Z' },
    ]);
    expect(DEMO_ACCOUNTING_BUSINESSES.map((a) => a.name)).toEqual(list.map((a) => a.name));
    // Os lançamentos de cada negócio, anotados por quem administra; o ano de 2026 e o de 2025 do Téo.
    const teo = list[1]!.id;
    const months = ['2025-11', '2026-01', '2026-02', '2026-04', '2026-06', '2026-09', '2026-10'];
    const records = (await Promise.all(months.map((m) => repo.listRecords(teo, m)))).flat();
    expect(records.every((r) => r.createdBy === 'pessoa-teo')).toBe(true);
    expect(businessYear(records, teo, 2026)).toMatchObject({ inCents: 320_000, outCents: 68_200, salesCents: 12_000, servicesCents: 308_000 });
    expect(businessYear(records, teo, 2025)).toMatchObject({ inCents: 85_000, outCents: 26_000 });
    const lia = list[0]!.id;
    const liaRecords = (await Promise.all(['2026-07', '2026-08', '2026-09', '2026-10'].map((m) => repo.listRecords(lia, m)))).flat();
    expect(businessYear(liaRecords, lia, 2026)).toMatchObject({ inCents: 236_000, outCents: 122_000 });
    // Só lê.
    const acc = (await repo.listAccounts(teo))[0]!.id;
    await expectCode(repo.createRecord(key(), teo, 'receita', { accountId: acc, amountCents: 100, occurredOn: '2026-10-07', description: 'x', category: 'Vendas' }), 'sem_permissao');
    // O negócio próprio e o Pessoal de sempre.
    expect(businessMonth(await repo.listRecords(own.id, '2026-10'), own.id, '2026-10')).toMatchObject({ inCents: 76_000, outCents: 41_800 });
    const space = (await repo.getSpace())!;
    const s = summarizeMonth(await repo.listRecords(space.personalContextId, '2026-10'), space.personalContextId, '2026-10');
    expect([s.receivedCents, s.paidCents]).toEqual([600_000, 390_000]);
    // Deixar de acompanhar um deles.
    await repo.leaveBusiness(key(), teo);
    expect((await repo.listAccountingBusinesses()).map((a) => a.name)).toEqual(['Ateliê da Lia']);
    expect((await repo.getBusiness())!.id).toBe(own.id);
  });

  it('as pessoas da demonstração são só as fictícias combinadas', () => {
    const people = [
      ...DEMO_ACCOUNTING_BUSINESSES.map((a) => a.owner.firstName),
      ...Object.values(DEMO_BUSINESS_PEOPLE).map((p) => p.firstName),
    ];
    expect([...new Set(people)].sort()).toEqual(['Bia', 'Dora', 'Lia', 'Nina', 'Rafa', 'Téo']);
  });
});
