import { describe, expect, it } from 'vitest';
import {
  CompanyStaffError,
  DEMO_EMAIL,
  DEMO_TODAY,
  MemoryCompanyHub,
  MemoryRepository,
  contractAccessUntil,
  createDemoCompanyHub,
  createDemoRepository,
  isRepoError,
  licenseCodeHash,
  licenseLink,
  newOperationKey,
  sha256Hex,
  type Benefit,
  type RepoError,
  type RepoErrorCode,
} from '../src';

const key = () => newOperationKey();

async function expectCode(p: Promise<unknown>, code: RepoErrorCode, detail?: string) {
  let error: unknown = null;
  try {
    await p;
  } catch (e) {
    error = e;
  }
  expect(isRepoError(error, code), `esperava ${code}, veio ${error instanceof Error ? ((error as RepoError).code ?? error.message) : String(error)}`).toBe(true);
  if (detail !== undefined) expect((error as RepoError).detail).toBe(detail);
}

/** Relógio dos testes: 07/10/2026 ao meio-dia (UTC), com o dia fixo. */
function clock(day = '2026-10-07') {
  const c = { day, ms: Date.parse(`${day}T12:00:00.000Z`) };
  const hub = new MemoryCompanyHub({ now: () => c.ms, today: () => c.day, random: seeded() });
  return { c, hub };
}

/** Sorteio repetível: cada chamada devolve outro número em [0, 1). */
function seeded() {
  let n = 11;
  return () => {
    n = (n * 48271) % 2147483647;
    return n / 2147483647;
  };
}

const NAMES: Record<string, [string, string]> = {
  rita: ['Rita Prado', 'rita@alfa.test'],
  ricardo: ['Ricardo Alves', 'ricardo@beta.test'],
  bia: ['Bia Souza', 'Bia@Exemplo.test'],
  caio: ['Caio Reis', 'caio@exemplo.test'],
  duda: ['Duda Melo', 'duda@exemplo.test'],
  edu: ['Edu Lima', 'edu@exemplo.test'],
  fabi: ['Fabi Neves', 'fabi@exemplo.test'],
  gui: ['Gui Dias', 'gui@exemplo.test'],
  hugo: ['Hugo Sá', 'hugo@exemplo.test'],
};

/** Uma pessoa com o próprio repositório, no mesmo hub das outras. */
async function person(hub: MemoryCompanyHub, id: keyof typeof NAMES, today = '2026-10-07') {
  const [displayName, email] = NAMES[id]!;
  const repo = new MemoryRepository({ actorId: id, displayName, email, today: () => today, company: hub });
  await repo.ensurePersonalSpace('Conta principal');
  return { id: id as string, repo };
}

async function alfa(hub: MemoryCompanyHub, seats = 6) {
  const rita = await person(hub, 'rita');
  const r = hub.staffCreateOrganization({ name: ' Empresa Alfa ', seats, plan: 'individual', startsOn: '2026-10-01', endsOn: null, adminEmail: 'RITA@alfa.test ' });
  return { rita, ...r };
}

const codeOf = (w: { results: { email: string; code: string | null }[] }, email: string) => w.results.find((r) => r.email === email)!.code!;

describe('Empresas na memória: equipe Clarevo (M-3)', () => {
  it('cria organização, contrato e a primeira pessoa administradora, que precisa já ter conta', async () => {
    const { hub } = clock();
    expect(() => hub.staffCreateOrganization({ name: 'Alfa', seats: 3, plan: 'individual', startsOn: '2026-10-01', endsOn: null, adminEmail: 'rita@alfa.test' })).toThrow(CompanyStaffError);
    try {
      hub.staffCreateOrganization({ name: 'Alfa', seats: 3, plan: 'individual', startsOn: '2026-10-01', endsOn: null, adminEmail: 'rita@alfa.test' });
    } catch (e) {
      expect((e as CompanyStaffError).code).toBe('administrador_sem_conta');
      expect((e as CompanyStaffError).hint).toContain('criar a conta no app');
    }
    const { rita, organizationId, contractId, adminPersonId } = await alfa(hub);
    expect(adminPersonId).toBe('rita');
    const list = await rita.repo.listAdministeredCompanies();
    expect(list).toHaveLength(1);
    expect(list[0]!.organization).toEqual({ id: organizationId, name: 'Empresa Alfa' });
    expect(list[0]!.contracts).toEqual([{ id: contractId, organizationId, seats: 6, plan: 'individual', startsOn: '2026-10-01', endsOn: null }]);
    expect(list[0]!.licenses).toEqual([]);
    expect(list[0]!.demo).toBe(false);
  });

  it('valida nome, vagas, plano e datas; nome repetido; repetir a pessoa administradora não duplica', async () => {
    const { hub } = clock();
    const { organizationId } = await alfa(hub);
    const code = (input: Partial<Parameters<MemoryCompanyHub['staffCreateOrganization']>[0]>) => {
      try {
        hub.staffCreateOrganization({ name: 'Nova', seats: 3, plan: 'individual', startsOn: '2026-10-01', endsOn: null, adminEmail: 'rita@alfa.test', ...input });
      } catch (e) {
        return (e as CompanyStaffError).code;
      }
      return 'passou';
    };
    expect(code({ name: '   ' })).toBe('nome_da_organizacao_invalido');
    expect(code({ name: 'x'.repeat(121) })).toBe('nome_da_organizacao_invalido');
    expect(code({ seats: 0 })).toBe('vagas_invalidas');
    expect(code({ plan: 'gratis' as never })).toBe('plano_invalido');
    expect(code({ endsOn: '2026-09-30' })).toBe('datas_invalidas');
    expect(code({ name: 'empresa alfa' })).toBe('organizacao_ja_existe');
    expect(code({ adminEmail: 'isto não é e-mail' })).toBe('email_invalido');
    expect(code({ adminEmail: 'ninguem@alfa.test' })).toBe('administrador_sem_conta');
    expect(hub.staffAddOrgAdmin(organizationId, 'rita@alfa.test')).toMatchObject({ alreadyAdmin: true });
    const ricardo = await person(hub, 'ricardo');
    expect(hub.staffAddOrgAdmin(organizationId, 'RICARDO@beta.test')).toMatchObject({ adminPersonId: 'ricardo', alreadyAdmin: false });
    expect(await ricardo.repo.listAdministeredCompanies()).toHaveLength(1);
  });
});

describe('Empresas na memória: convidar (M-2)', () => {
  it('normaliza, tira os repetidos, devolve um código de 128 bits por pessoa nova e guarda só o resumo', async () => {
    const { hub } = clock();
    const { rita, contractId } = await alfa(hub);
    const w = await rita.repo.inviteLicenses(key(), contractId, [' Bia@Exemplo.test ', 'caio@exemplo.test', 'bia@exemplo.test', 'DUDA@exemplo.test']);
    expect(w.results.map((r) => r.email)).toEqual(['bia@exemplo.test', 'caio@exemplo.test', 'duda@exemplo.test']);
    expect(w.results.every((r) => r.outcome === 'convidada' && /^[0-9a-f]{32}$/.test(r.code!) && r.license.status === 'convidada')).toBe(true);
    expect(new Set(w.results.map((r) => r.code)).size).toBe(3);
    expect(w).toMatchObject({ seats: 6, inUse: 3 });
    const list = (await rita.repo.listAdministeredCompanies())[0]!;
    expect(list.licenses.map((l) => l.email).sort()).toEqual(['bia@exemplo.test', 'caio@exemplo.test', 'duda@exemplo.test']);
    // Nenhuma licença lida pelo RH traz o código, o resumo ou a pessoa.
    expect(JSON.stringify(list)).not.toContain(w.results[0]!.code);
    expect(JSON.stringify(list)).not.toContain(sha256Hex(w.results[0]!.code!));
    expect(Object.keys(list.licenses[0]!).sort()).toEqual(['activatedAt', 'cancelledAt', 'contractId', 'createdAt', 'email', 'endedAt', 'id', 'invitedAt', 'status']);
  });

  it('e-mail inválido (item=N), lista vazia ou com mais de 500, contrato fora da vigência e vagas no limite: tudo ou nada', async () => {
    const { hub } = clock();
    const { rita, contractId } = await alfa(hub, 3);
    await expectCode(rita.repo.inviteLicenses(key(), contractId, ['edu@exemplo.test', 'edu@@exemplo.test']), 'email_invalido', 'item=2');
    await expectCode(rita.repo.inviteLicenses(key(), contractId, ['   ']), 'email_invalido', 'item=1');
    await expectCode(rita.repo.inviteLicenses(key(), contractId, []), 'itens_invalidos');
    await expectCode(rita.repo.inviteLicenses(key(), contractId, Array.from({ length: 501 }, (_, i) => `p${i}@exemplo.test`)), 'itens_invalidos');
    expect((await rita.repo.listAdministeredCompanies())[0]!.licenses).toEqual([]);
    await rita.repo.inviteLicenses(key(), contractId, ['a@exemplo.test', 'b@exemplo.test']);
    await expectCode(rita.repo.inviteLicenses(key(), contractId, ['c@exemplo.test', 'd@exemplo.test']), 'vagas_insuficientes', 'disponiveis=1');
    expect((await rita.repo.listAdministeredCompanies())[0]!.licenses).toHaveLength(2);
    // Quem já foi convidado não ocupa vaga de novo e volta sem código; a última vaga ainda cabe uma pessoa nova.
    const w = await rita.repo.inviteLicenses(key(), contractId, ['a@exemplo.test', 'c@exemplo.test']);
    expect(w.results.map((r) => [r.email, r.outcome, r.code === null])).toEqual([['a@exemplo.test', 'ja_convidado', true], ['c@exemplo.test', 'convidada', false]]);
    expect(w.inUse).toBe(3);
    await expectCode(rita.repo.inviteLicenses(key(), contractId, ['d@exemplo.test']), 'vagas_insuficientes', 'disponiveis=0');
    const w2 = await rita.repo.inviteLicenses(key(), contractId, ['a@exemplo.test']);
    expect(w2.results[0]!.outcome).toBe('ja_convidado');
  });

  it('contrato que ainda não começou ou já terminou não convida; quem não administra recebe nao_encontrado', async () => {
    const { hub } = clock();
    const { rita } = await alfa(hub);
    const gil = await person(hub, 'hugo');
    const futura = hub.staffCreateOrganization({ name: 'Futura', seats: 2, plan: 'individual', startsOn: '2026-11-01', endsOn: null, adminEmail: 'hugo@exemplo.test' });
    const encerrada = hub.staffCreateOrganization({ name: 'Encerrada', seats: 2, plan: 'individual', startsOn: '2026-01-01', endsOn: '2026-09-30', adminEmail: 'hugo@exemplo.test' });
    await expectCode(gil.repo.inviteLicenses(key(), futura.contractId, ['x@exemplo.test']), 'contrato_nao_vigente');
    await expectCode(gil.repo.inviteLicenses(key(), encerrada.contractId, ['x@exemplo.test']), 'contrato_nao_vigente');
    // A Rita não administra a Futura; o Hugo não administra a Alfa.
    await expectCode(rita.repo.inviteLicenses(key(), futura.contractId, ['x@exemplo.test']), 'nao_encontrado');
    const alfaId = (await rita.repo.listAdministeredCompanies())[0]!.contracts[0]!.id;
    await expectCode(gil.repo.inviteLicenses(key(), alfaId, ['x@exemplo.test']), 'nao_encontrado');
    await expectCode(gil.repo.inviteLicenses(key(), 'nao-existe', ['x@exemplo.test']), 'nao_encontrado');
  });

  it('repetir a chave devolve os mesmos resultados, sem o código; outro conteúdo com a chave é chave_reutilizada; o espaço de chaves é um só', async () => {
    const { hub } = clock();
    const { rita, contractId } = await alfa(hub);
    const k = key();
    const w = await rita.repo.inviteLicenses(k, contractId, ['bia@exemplo.test', 'caio@exemplo.test']);
    const again = await rita.repo.inviteLicenses(k, contractId, ['bia@exemplo.test', 'caio@exemplo.test']);
    expect(again.results.map((r) => [r.email, r.outcome, r.code])).toEqual([['bia@exemplo.test', 'convidada', null], ['caio@exemplo.test', 'convidada', null]]);
    expect(again.results.map((r) => r.license.id)).toEqual(w.results.map((r) => r.license.id));
    expect((await rita.repo.listAdministeredCompanies())[0]!.licenses).toHaveLength(2);
    await expectCode(rita.repo.inviteLicenses(k, contractId, ['bia@exemplo.test']), 'chave_reutilizada');
    await expectCode(rita.repo.renewLicenseInvite(k, w.results[0]!.license.id), 'chave_reutilizada');
    // A chave de um registro não vale aqui, e a daqui não vale lá.
    const space = await rita.repo.getSpace();
    const account = space!.accounts[0]!.id;
    const recordKey = key();
    await rita.repo.createRecord(recordKey, space!.personalContextId, 'despesa', { accountId: account, amountCents: 100, occurredOn: '2026-10-02', description: 'Café', category: null });
    await expectCode(rita.repo.inviteLicenses(recordKey, contractId, ['x@exemplo.test']), 'chave_reutilizada');
    await expectCode(rita.repo.createRecord(k, space!.personalContextId, 'despesa', { accountId: account, amountCents: 100, occurredOn: '2026-10-02', description: 'Café', category: null }), 'chave_reutilizada');
    // A empresa não conta como anotação: a atividade da Rita segue como a do único registro.
    expect((await rita.repo.getReturnReviewState(space!.personalContextId)).activity).toMatchObject({ lastWriteOn: '2026-10-07' });
  });
});

describe('Empresas na memória: prévia e aceite (E3, E4)', () => {
  it('só o e-mail do convite vê a prévia e aceita; qualquer outro caso responde convite_invalido', async () => {
    const { hub } = clock();
    const { rita, contractId } = await alfa(hub);
    const w = await rita.repo.inviteLicenses(key(), contractId, ['bia@exemplo.test', 'caio@exemplo.test']);
    const bia = await person(hub, 'bia');
    const caio = await person(hub, 'caio');
    const hugo = await person(hub, 'hugo');
    const code = codeOf(w, 'bia@exemplo.test');
    expect(await bia.repo.previewLicenseInvite(code)).toEqual({ organizationName: 'Empresa Alfa', plan: 'individual' });
    expect(await bia.repo.previewLicenseInvite(` ${code.toUpperCase()} `)).toEqual({ organizationName: 'Empresa Alfa', plan: 'individual' });
    for (const r of [caio, hugo, rita]) {
      await expectCode(r.repo.previewLicenseInvite(code), 'convite_invalido');
      await expectCode(r.repo.acceptLicense(key(), code), 'convite_invalido');
    }
    for (const bad of ['', 'isto-nao-e-um-codigo', '0'.repeat(32)]) {
      await expectCode(bia.repo.previewLicenseInvite(bad), 'convite_invalido');
      await expectCode(bia.repo.acceptLicense(key(), bad), 'convite_invalido');
    }
    expect(await bia.repo.getMyBenefit()).toBeNull();
    expect((await rita.repo.listAdministeredCompanies())[0]!.licenses.every((l) => l.status === 'convidada')).toBe(true);
  });

  it('aceitar: licença ativa com a pessoa, direito ao plano, uso único; a repetição da chave devolve o mesmo resultado', async () => {
    const { hub } = clock();
    const { rita, contractId } = await alfa(hub);
    const w = await rita.repo.inviteLicenses(key(), contractId, ['bia@exemplo.test']);
    const bia = await person(hub, 'bia');
    const code = codeOf(w, 'bia@exemplo.test');
    const k = key();
    const benefit = await bia.repo.acceptLicense(k, code);
    expect(benefit).toMatchObject({ organizationName: 'Empresa Alfa', plan: 'individual', status: 'ativa', endedAt: null, accessUntil: null, contractEndsOn: null });
    expect(await bia.repo.acceptLicense(k, code)).toEqual(benefit);
    expect(await bia.repo.getMyBenefit()).toEqual(benefit);
    await expectCode(bia.repo.acceptLicense(key(), code), 'convite_invalido');
    await expectCode(bia.repo.previewLicenseInvite(code), 'convite_invalido');
    await expectCode(bia.repo.acceptLicense(k, '1'.repeat(32)), 'chave_reutilizada');
    const l = (await rita.repo.listAdministeredCompanies())[0]!.licenses[0]!;
    expect(l).toMatchObject({ status: 'ativa', cancelledAt: null, endedAt: null });
    expect(l.activatedAt).not.toBeNull();
    // A empresa não sabe quem aceitou além do e-mail que ela mesma informou.
    expect(JSON.stringify(l)).not.toContain('bia"');
    // O espaço pessoal e o Pessoal da Bia não mudaram (aceitar nunca mexe em finanças).
    expect(await bia.repo.listRecords((await bia.repo.getSpace())!.personalContextId, '2026-10')).toEqual([]);
  });

  it('quem ainda não tem espaço pessoal recebe sem_permissao; uma licença ativa por pessoa (ja_tem_licenca)', async () => {
    const { hub } = clock();
    const { rita, contractId } = await alfa(hub);
    const beta = hub.staffCreateOrganization({ name: 'Beta', seats: 3, plan: 'familiar', startsOn: '2026-09-01', endsOn: '2027-12-31', adminEmail: 'rita@alfa.test' });
    const w = await rita.repo.inviteLicenses(key(), contractId, ['bia@exemplo.test']);
    const w2 = await rita.repo.inviteLicenses(key(), beta.contractId, ['bia@exemplo.test']);
    const semEspaco = new MemoryRepository({ actorId: 'xena', displayName: 'Xena', email: 'xena@exemplo.test', today: () => '2026-10-07', company: hub });
    await expectCode(semEspaco.acceptLicense(key(), codeOf(w, 'bia@exemplo.test')), 'sem_permissao');
    await expectCode(semEspaco.acceptLicense(key(), '0'.repeat(32)), 'sem_permissao');
    const bia = await person(hub, 'bia');
    await bia.repo.acceptLicense(key(), codeOf(w, 'bia@exemplo.test'));
    expect(await bia.repo.previewLicenseInvite(codeOf(w2, 'bia@exemplo.test'))).toEqual({ organizationName: 'Beta', plan: 'familiar' });
    await expectCode(bia.repo.acceptLicense(key(), codeOf(w2, 'bia@exemplo.test')), 'ja_tem_licenca');
    expect((await bia.repo.getMyBenefit())!.organizationName).toBe('Empresa Alfa');
  });

  it('contrato com fim: o acesso pleno acompanha o fim do contrato mais 30 dias, e mudar o fim move as licenças ativas', async () => {
    const { hub } = clock();
    const { rita } = await alfa(hub);
    const beta = hub.staffCreateOrganization({ name: 'Beta', seats: 3, plan: 'familiar', startsOn: '2026-09-01', endsOn: '2027-12-31', adminEmail: 'rita@alfa.test' });
    const w = await rita.repo.inviteLicenses(key(), beta.contractId, ['bia@exemplo.test', 'caio@exemplo.test']);
    const bia = await person(hub, 'bia');
    const caio = await person(hub, 'caio');
    const b = await bia.repo.acceptLicense(key(), codeOf(w, 'bia@exemplo.test'));
    expect(b.accessUntil).toBe(contractAccessUntil('2027-12-31'));
    expect(contractAccessUntil('2027-12-31')).toBe(new Date('2028-01-30T23:59:59-03:00').toISOString());
    expect(contractAccessUntil(null)).toBeNull();
    expect(b.contractEndsOn).toBe('2027-12-31');
    // O fim passa para 06/10/2026 (antes de "hoje"): o contrato sai da vigência, a ativa muda e a convidada não aceita mais.
    expect(hub.staffUpdateContract(beta.contractId, 3, '2026-10-06')).toMatchObject({ seats: 3, inUse: 2 });
    expect((await bia.repo.getMyBenefit())!.accessUntil).toBe(contractAccessUntil('2026-10-06'));
    await expectCode(caio.repo.previewLicenseInvite(codeOf(w, 'caio@exemplo.test')), 'convite_invalido');
    await expectCode(rita.repo.inviteLicenses(key(), beta.contractId, ['novo@exemplo.test']), 'contrato_nao_vigente');
    await expectCode(rita.repo.renewLicenseInvite(key(), w.results[1]!.license.id), 'contrato_nao_vigente');
    expect((await rita.repo.getCompanyUsage(beta.organizationId)).seats).toBe(0);
    // Vagas nunca abaixo do que está em uso; fim antes do início é recusado; sem fim, o acesso fica aberto de novo.
    expect(() => hub.staffUpdateContract(beta.contractId, 1, null)).toThrow(CompanyStaffError);
    expect(() => hub.staffUpdateContract(beta.contractId, 3, '2026-08-31')).toThrow(CompanyStaffError);
    hub.staffUpdateContract(beta.contractId, 3, null);
    expect((await bia.repo.getMyBenefit())!.accessUntil).toBeNull();
    expect((await caio.repo.previewLicenseInvite(codeOf(w, 'caio@exemplo.test'))).organizationName).toBe('Beta');
  });
});

describe('Empresas na memória: reenviar, cancelar e encerrar', () => {
  it('reenviar troca o código e o anterior deixa de valer; só convite pendente, só quem administra', async () => {
    const { hub } = clock();
    const { rita, contractId } = await alfa(hub);
    const w = await rita.repo.inviteLicenses(key(), contractId, ['bia@exemplo.test', 'caio@exemplo.test']);
    const bia = await person(hub, 'bia');
    const ricardo = await person(hub, 'ricardo');
    const old = codeOf(w, 'bia@exemplo.test');
    const id = w.results[0]!.license.id;
    await expectCode(ricardo.repo.renewLicenseInvite(key(), id), 'nao_encontrado');
    await expectCode(rita.repo.renewLicenseInvite(key(), 'nao-existe'), 'nao_encontrado');
    const k = key();
    const r = await rita.repo.renewLicenseInvite(k, id);
    expect(r.code).toMatch(/^[0-9a-f]{32}$/);
    expect(r.code).not.toBe(old);
    expect(licenseCodeHash(r.code)).toBe(sha256Hex(r.code!));
    expect(await rita.repo.renewLicenseInvite(k, id)).toEqual({ license: r.license, code: null });
    await expectCode(bia.repo.previewLicenseInvite(old), 'convite_invalido');
    await expectCode(bia.repo.acceptLicense(key(), old), 'convite_invalido');
    expect((await bia.repo.previewLicenseInvite(r.code!)).organizationName).toBe('Empresa Alfa');
    // Licença ativa não se reenvia.
    await bia.repo.acceptLicense(key(), r.code!);
    await expectCode(rita.repo.renewLicenseInvite(key(), id), 'licenca_nao_convidada');
  });

  it('cancelar: a linha fica encerrada com a data de cancelamento, a vaga volta e o e-mail pode ser convidado de novo', async () => {
    const { hub } = clock();
    const { rita, contractId, organizationId } = await alfa(hub, 2);
    const w = await rita.repo.inviteLicenses(key(), contractId, ['duda@exemplo.test', 'edu@exemplo.test']);
    const duda = await person(hub, 'duda');
    const id = w.results[0]!.license.id;
    const k = key();
    const cancelled = await rita.repo.cancelLicenseInvite(k, id);
    expect(cancelled).toMatchObject({ status: 'encerrada', endedAt: null, activatedAt: null });
    expect(cancelled.cancelledAt).not.toBeNull();
    expect(await rita.repo.cancelLicenseInvite(k, id)).toEqual(cancelled);
    expect(await rita.repo.cancelLicenseInvite(key(), id)).toEqual(cancelled);
    await expectCode(duda.repo.previewLicenseInvite(codeOf(w, 'duda@exemplo.test')), 'convite_invalido');
    await expectCode(rita.repo.renewLicenseInvite(key(), id), 'licenca_nao_convidada');
    expect(await rita.repo.getCompanyUsage(organizationId)).toMatchObject({ invited: 1, active: 0, ended: 0 });
    const again = await rita.repo.inviteLicenses(key(), contractId, ['duda@exemplo.test']);
    expect(again.results[0]).toMatchObject({ outcome: 'convidada' });
    expect(again.results[0]!.license.id).not.toBe(id);
    expect((await rita.repo.listAdministeredCompanies())[0]!.licenses).toHaveLength(3);
  });

  it('encerrar: só licença ativa; 30 dias de acesso pleno; conta, histórico e Família ficam como estão', async () => {
    const { hub, c } = clock();
    const { rita, contractId } = await alfa(hub);
    const w = await rita.repo.inviteLicenses(key(), contractId, ['bia@exemplo.test', 'caio@exemplo.test']);
    const bia = await person(hub, 'bia');
    const ctx = (await bia.repo.getSpace())!.personalContextId;
    const account = (await bia.repo.getSpace())!.accounts[0]!.id;
    await bia.repo.createRecord(key(), ctx, 'despesa', { accountId: account, amountCents: 12345, occurredOn: '2026-10-02', description: 'Mercado da Bia', category: null });
    const fam = await bia.repo.createFamily(key(), 'Casa da Bia');
    await bia.repo.acceptLicense(key(), codeOf(w, 'bia@exemplo.test'));
    const [biaLic, caioLic] = [w.results[0]!.license.id, w.results[1]!.license.id];
    await expectCode(rita.repo.endLicense(key(), caioLic), 'licenca_nao_ativa');
    const ricardo = await person(hub, 'ricardo');
    await expectCode(ricardo.repo.endLicense(key(), biaLic), 'nao_encontrado');
    await expectCode(bia.repo.endLicense(key(), biaLic), 'nao_encontrado');
    c.ms = Date.parse('2026-10-07T15:00:00.000Z');
    const k = key();
    const ended = await rita.repo.endLicense(k, biaLic);
    expect(ended).toMatchObject({ status: 'encerrada', cancelledAt: null });
    expect(ended.endedAt).toBe('2026-10-07T15:00:00.000Z');
    expect(await rita.repo.endLicense(k, biaLic)).toEqual(ended);
    await expectCode(rita.repo.endLicense(key(), biaLic), 'licenca_nao_ativa');
    const benefit = (await bia.repo.getMyBenefit())!;
    expect(benefit).toMatchObject({ status: 'encerrada', endedAt: '2026-10-07T15:00:00.000Z', accessUntil: '2026-11-06T15:00:00.000Z' });
    // Nada foi apagado: o histórico, o Pessoal e a Família continuam.
    expect((await bia.repo.listRecords(ctx, '2026-10')).map((r) => r.description)).toEqual(['Mercado da Bia']);
    expect((await bia.repo.getFamily())!.context.id).toBe(fam.context.id);
    // E depois de encerrada, uma licença nova pode ser aceita.
    const novo = await rita.repo.inviteLicenses(key(), contractId, ['bia@exemplo.test']);
    const b2 = await bia.repo.acceptLicense(key(), codeOf(novo, 'bia@exemplo.test'));
    expect(b2.status).toBe('ativa');
    expect(b2.licenseId).not.toBe(biaLic);
  });
});

describe('Empresas na memória: indicadores de uso (M-1)', () => {
  async function team(hub: MemoryCompanyHub, contractId: string, rita: Awaited<ReturnType<typeof person>>, who: (keyof typeof NAMES)[]) {
    const emails = who.map((w) => NAMES[w]![1]);
    const inv = await rita.repo.inviteLicenses(key(), contractId, emails);
    const people: Awaited<ReturnType<typeof person>>[] = [];
    for (const w of who) {
      const p = await person(hub, w);
      await p.repo.acceptLicense(key(), codeOf(inv, NAMES[w]![1].toLowerCase()));
      people.push(p);
    }
    return people;
  }

  it('só quem administra lê; com menos de 5 pessoas ativas o uso do mês é nulo; com 5, aparece, sem dizer quem', async () => {
    const { hub } = clock();
    const { rita, contractId, organizationId } = await alfa(hub);
    const ricardo = await person(hub, 'ricardo');
    await expectCode(ricardo.repo.getCompanyUsage(organizationId), 'nao_encontrado');
    await expectCode(rita.repo.getCompanyUsage('nao-existe'), 'nao_encontrado');
    const four = await team(hub, contractId, rita, ['bia', 'caio', 'edu', 'fabi']);
    for (const p of four) hub.recordSignIn(p.id, '2026-10-05T12:00:00.000Z');
    let u = await rita.repo.getCompanyUsage(organizationId);
    expect(u).toMatchObject({ month: '2026-10-01', seats: 6, invited: 0, active: 4, ended: 0, joinedThisMonth: null, usageVisible: false, usageMinimum: 5 });
    const [gui] = await team(hub, contractId, rita, ['gui']);
    u = await rita.repo.getCompanyUsage(organizationId);
    expect(u).toMatchObject({ active: 5, joinedThisMonth: 4, usageVisible: true });
    expect(Object.keys(u).sort()).toEqual(['active', 'ended', 'invited', 'joinedThisMonth', 'month', 'organizationId', 'seats', 'usageMinimum', 'usageVisible']);
    // Entrar no mês é o último acesso no mês do fuso de São Paulo: 01:00 UTC de 1º/11 ainda é 31/10.
    hub.recordSignIn(gui!.id, '2026-11-01T01:00:00.000Z');
    expect((await rita.repo.getCompanyUsage(organizationId)).joinedThisMonth).toBe(5);
    hub.recordSignIn(four[0]!.id, '2026-09-30T23:00:00.000-03:00');
    expect((await rita.repo.getCompanyUsage(organizationId)).joinedThisMonth).toBe(4);
    // Encerrar uma licença volta ao limite: a licença ativa cai para 4 e o número some de novo; convite cancelado não conta como encerrada.
    const lic = (await rita.repo.listAdministeredCompanies())[0]!.licenses[0]!;
    await rita.repo.endLicense(key(), lic.id);
    u = await rita.repo.getCompanyUsage(organizationId);
    expect(u).toMatchObject({ active: 4, ended: 1, joinedThisMonth: null, usageVisible: false });
    const extra = await rita.repo.inviteLicenses(key(), contractId, ['hugo@exemplo.test']);
    await rita.repo.cancelLicenseInvite(key(), extra.results[0]!.license.id);
    expect(await rita.repo.getCompanyUsage(organizationId)).toMatchObject({ invited: 0, ended: 1 });
  });
});

describe('Empresas na memória: conta nova e demonstração', () => {
  it('conta nova nunca recebe empresa de exemplo: nenhuma organização, nenhum benefício', async () => {
    const hub = new MemoryCompanyHub();
    const bia = await person(hub, 'bia');
    expect(await bia.repo.listAdministeredCompanies()).toEqual([]);
    expect(await bia.repo.getMyBenefit()).toBeNull();
    const alone = new MemoryRepository({ actorId: 'ana', displayName: 'Ana', today: () => '2026-10-07' });
    await alone.ensurePersonalSpace('Conta principal');
    expect(await alone.listAdministeredCompanies()).toEqual([]);
    expect(await alone.getMyBenefit()).toBeNull();
  });

  it('a demonstração administra a "Empresa Exemplo (demonstração)": fictícia, identificada, com licenças e números de uso fictícios', async () => {
    const demo = await createDemoRepository();
    const [company] = await demo.listAdministeredCompanies();
    expect(company!.demo).toBe(true);
    expect(company!.organization.name).toBe('Empresa Exemplo (demonstração)');
    expect(company!.contracts).toHaveLength(1);
    expect(company!.contracts[0]).toMatchObject({ seats: 40, plan: 'individual', startsOn: '2026-03-01', endsOn: null });
    const by = (status: string) => company!.licenses.filter((l) => l.status === status);
    expect([by('ativa').length, by('convidada').length, by('encerrada').length, company!.licenses.filter((l) => l.cancelledAt !== null).length]).toEqual([12, 6, 4, 1]);
    // Todos os e-mails são de pessoas fictícias do domínio reservado .example.
    expect(company!.licenses.every((l) => l.email.endsWith('@empresa-exemplo.example'))).toBe(true);
    const usage = await demo.getCompanyUsage(company!.organization.id);
    expect(usage).toMatchObject({ seats: 40, invited: 6, active: 12, ended: 3, joinedThisMonth: 9, usageVisible: true, month: '2026-10-01' });
    // Nada sobra para quem recebe: a conta de demonstração não tem benefício.
    expect(await demo.getMyBenefit()).toBeNull();
    // O painel da demonstração funciona na memória: convidar cria o convite só no hub dela.
    const w = await demo.inviteLicenses(key(), company!.contracts[0]!.id, ['novo.exemplo@empresa-exemplo.example']);
    expect(w.results[0]!.outcome).toBe('convidada');
    expect(w.inUse).toBe(19);
    // Cada demonstração tem a sua empresa: uma nova não vê o convite criado antes.
    const other = await createDemoRepository();
    expect((await other.listAdministeredCompanies())[0]!.licenses).toHaveLength(22);
    expect(DEMO_EMAIL).toBe('demo@clarevo.app');
    expect(DEMO_TODAY).toBe('2026-10-07');
    expect(licenseLink(w.results[0]!.code!, 'http://localhost')).toContain('/beneficio/');
    const hub = createDemoCompanyHub('alguem');
    expect(hub.listAdministered('alguem')).toHaveLength(1);
    expect(hub.listAdministered('pessoa-demo')).toHaveLength(0);
  });

  it('o resumo da demonstração não muda: nenhuma operação da empresa conta como anotação', async () => {
    const demo = await createDemoRepository();
    const ctx = (await demo.getSpace())!.personalContextId;
    const before = await demo.getReturnReviewState(ctx);
    const [company] = await demo.listAdministeredCompanies();
    await demo.inviteLicenses(key(), company!.contracts[0]!.id, ['outra.pessoa@empresa-exemplo.example']);
    expect(await demo.getReturnReviewState(ctx)).toEqual(before);
  });
});

describe('Empresas na memória: a empresa nunca lê finanças', () => {
  it('as respostas da empresa não têm nenhum campo de finanças, de Família nem da pessoa', async () => {
    const { hub } = clock();
    const { rita, contractId, organizationId } = await alfa(hub);
    const w = await rita.repo.inviteLicenses(key(), contractId, ['bia@exemplo.test']);
    const bia = await person(hub, 'bia');
    const ctx = (await bia.repo.getSpace())!.personalContextId;
    await bia.repo.createRecord(key(), ctx, 'despesa', {
      accountId: (await bia.repo.getSpace())!.accounts[0]!.id,
      amountCents: 98765,
      occurredOn: '2026-10-03',
      description: 'Gasto muito pessoal',
      category: 'Saúde',
    });
    await bia.repo.createFamily(key(), 'Família secreta');
    await bia.repo.acceptLicense(key(), codeOf(w, 'bia@exemplo.test'));
    const everything: Benefit | unknown[] = [await rita.repo.listAdministeredCompanies(), await rita.repo.getCompanyUsage(organizationId)];
    const text = JSON.stringify(everything);
    for (const secret of ['Gasto muito pessoal', '98765', 'Saúde', 'Família secreta', 'Conta principal', ctx]) expect(text, secret).not.toContain(secret);
  });
});
