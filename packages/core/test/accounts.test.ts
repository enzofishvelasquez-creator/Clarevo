import { describe, expect, it } from 'vitest';
import {
  ACCOUNTS_ACTIVE_MAX,
  ACCOUNTS_TEXT,
  ACCOUNT_ERROR_TEXT,
  ACCOUNT_KINDS,
  ACCOUNT_KIND_LABEL,
  DEMO_TODAY,
  MemoryRepository,
  accountBlock,
  accountErrorText,
  accountFilterOptions,
  accountForPaymentForms,
  accountInputError,
  accountNameOf,
  accountNameTaken,
  activeAccounts,
  canAddActiveAccount,
  chooseAccountId,
  createDemoRepository,
  defaultAccountOf,
  filterByAccount,
  hasAccountChoice,
  pickerShowsChips,
  pickerShownAccount,
  isRepoError,
  newOperationKey,
  normalizeAccountInput,
  recordAccountName,
  summarizeMonth,
  summarizeToPay,
  validateAccountDraft,
  type FinancialAccount,
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
  expect(isRepoError(error, code), `esperava ${code}, veio ${String(error)}`).toBe(true);
  if (detail !== undefined) expect((error as RepoError).detail).toBe(detail);
}

const acc = (over: Partial<FinancialAccount> & Pick<FinancialAccount, 'id' | 'name'>): FinancialAccount => ({
  contextId: 'ctx',
  currency: 'BRL',
  initialBalanceCents: null,
  kind: 'banco',
  status: 'ativa',
  isDefault: false,
  version: 1,
  ...over,
});

describe('regras puras das contas (D-043)', () => {
  const list = [
    acc({ id: 'a', name: 'Conta principal', isDefault: true }),
    acc({ id: 'b', name: 'Carteira', kind: 'dinheiro' }),
    acc({ id: 'c', name: 'Antiga', status: 'arquivada' }),
    acc({ id: 'd', name: 'Reserva', kind: 'outra' }),
  ];

  it('nome e tipo: 1 a 40 caracteres, aparados, na ordem do banco', () => {
    expect(accountInputError({ name: 'Carteira', kind: 'dinheiro' })).toBeNull();
    expect(accountInputError({ name: 'x', kind: 'outra' })).toBeNull();
    expect(accountInputError({ name: 'é'.repeat(40), kind: 'banco' })).toBeNull();
    expect(accountInputError({ name: '', kind: 'banco' })).toBe('nome_da_conta_invalido');
    expect(accountInputError({ name: ' \t\n ', kind: 'banco' })).toBe('nome_da_conta_invalido');
    expect(accountInputError({ name: 'x'.repeat(41), kind: 'banco' })).toBe('nome_da_conta_invalido');
    expect(accountInputError({ name: 'Carteira', kind: 'poupanca' as never })).toBe('tipo_da_conta_invalido');
    expect(accountInputError({ name: 'Carteira', kind: null as never })).toBe('tipo_da_conta_invalido');
    // O nome vem antes do tipo.
    expect(accountInputError({ name: '', kind: 'poupanca' as never })).toBe('nome_da_conta_invalido');
    // Pontos de código, não unidades UTF-16: 40 emojis valem 40 caracteres.
    expect(accountInputError({ name: '😀'.repeat(40), kind: 'banco' })).toBeNull();
    expect(accountInputError({ name: '😀'.repeat(41), kind: 'banco' })).toBe('nome_da_conta_invalido');
    expect(normalizeAccountInput({ name: '  Carteira \n', kind: 'dinheiro' })).toEqual({ name: 'Carteira', kind: 'dinheiro' });
    expect(ACCOUNT_KINDS).toEqual(['banco', 'dinheiro', 'outra']);
    expect(Object.keys(ACCOUNT_KIND_LABEL)).toEqual([...ACCOUNT_KINDS]);
  });

  it('nome repetido: sem diferenciar maiúsculas de minúsculas, ignorando a própria conta', () => {
    expect(accountNameTaken(list, 'carteira')).toBe(true);
    expect(accountNameTaken(list, ' CARTEIRA ')).toBe(true);
    expect(accountNameTaken(list, 'Antiga')).toBe(true); // a arquivada também conta
    expect(accountNameTaken(list, 'Carteira', 'b')).toBe(false);
    expect(accountNameTaken(list, 'Cofre')).toBe(false);
  });

  it('o formulário valida nome, tipo e repetido, com o texto de cada campo', () => {
    const ok = validateAccountDraft({ name: ' Cofre ', kind: 'outra' }, list);
    expect(ok).toEqual({ ok: true, input: { name: 'Cofre', kind: 'outra' } });
    const empty = validateAccountDraft({ name: '', kind: null }, list);
    expect(empty).toEqual({
      ok: false,
      code: 'nome_da_conta_invalido',
      errors: { name: ACCOUNT_ERROR_TEXT.nome_da_conta_invalido, kind: ACCOUNT_ERROR_TEXT.tipo_da_conta_invalido },
    });
    const kindOnly = validateAccountDraft({ name: 'Cofre', kind: null }, list);
    expect(kindOnly).toMatchObject({ ok: false, code: 'tipo_da_conta_invalido', errors: { kind: ACCOUNT_ERROR_TEXT.tipo_da_conta_invalido } });
    const taken = validateAccountDraft({ name: 'carteira', kind: 'banco' }, list);
    expect(taken).toMatchObject({ ok: false, code: 'nome_da_conta_repetido', errors: { name: ACCOUNT_ERROR_TEXT.nome_da_conta_repetido } });
    // Editando a própria conta, o próprio nome vale.
    expect(validateAccountDraft({ name: 'carteira', kind: 'dinheiro' }, list, 'b').ok).toBe(true);
    // Sem lista de contas, só nome e tipo.
    expect(validateAccountDraft({ name: 'Carteira', kind: 'dinheiro' }).ok).toBe(true);
  });

  it('ativas com a principal primeiro; a conta que vem marcada; o seletor só tem chips com mais de uma ativa', () => {
    const shuffled = [list[1]!, list[0]!, list[2]!, list[3]!];
    expect(activeAccounts(shuffled).map((a) => a.id)).toEqual(['a', 'b', 'd']);
    expect(defaultAccountOf(shuffled)?.id).toBe('a');
    expect(defaultAccountOf([list[2]!])).toBeNull();
    // A pedida, se ativa; senão a última usada, se ativa; senão a principal.
    expect(chooseAccountId(list)).toBe('a');
    expect(chooseAccountId(list, 'b')).toBe('b');
    expect(chooseAccountId(list, 'c')).toBe('a'); // arquivada: ignorada
    expect(chooseAccountId(list, 'zzz')).toBe('a'); // desconhecida: ignorada
    expect(chooseAccountId(list, 'b', 'd')).toBe('d');
    expect(chooseAccountId(list, 'b', 'c')).toBe('b');
    expect(chooseAccountId([])).toBe('');
    expect(hasAccountChoice(list)).toBe(true);
    expect(hasAccountChoice([list[0]!, list[2]!])).toBe(false);
    expect(hasAccountChoice([])).toBe(false);
    expect(accountNameOf(list, 'c')).toBe('Antiga');
    expect(accountNameOf(list, 'x')).toBeNull();
    expect(accountNameOf(list, null)).toBeNull();
    expect(canAddActiveAccount(list)).toBe(true);
    const full = Array.from({ length: ACCOUNTS_ACTIVE_MAX }, (_, i) => acc({ id: `x${i}`, name: `Conta ${i}` }));
    expect(canAddActiveAccount(full)).toBe(false);
    expect(canAddActiveAccount([...full.slice(1), acc({ id: 'old', name: 'Velha', status: 'arquivada' })])).toBe(true);
  });

  it('o seletor: chips quando há o que escolher; com uma conta só, o nome da conta escolhida como texto', () => {
    const one = [list[0]!];
    const two = [list[0]!, list[1]!];
    // Uma conta, escolhida e sem "Sem conta": texto.
    expect(pickerShowsChips(one, 'a')).toBe(false);
    expect(pickerShownAccount(one, 'a')?.id).toBe('a');
    // Com "Sem conta" (aporte e resgate) há o que escolher, mesmo com uma conta só e já escolhida (editar um aporte).
    expect(pickerShowsChips(one, 'a', true)).toBe(true);
    expect(pickerShowsChips(one, null, true)).toBe(true);
    // Um valor que não é a primeira conta (a arquivada do registro, no fim da lista) mostra os chips.
    expect(pickerShowsChips(one, 'outra')).toBe(true);
    expect(pickerShowsChips(one, null)).toBe(true);
    expect(pickerShowsChips(two, 'a')).toBe(true);
    expect(pickerShowsChips([], null)).toBe(false);
    // O texto mostra a conta escolhida, não a primeira.
    expect(pickerShownAccount(two, 'b')?.id).toBe('b');
    expect(pickerShownAccount(two, null)?.id).toBe('a');
    expect(pickerShownAccount([], 'a')).toBeNull();
  });

  it('o que impede arquivar ou excluir, olhando só a lista', () => {
    expect(accountBlock(list, list[1]!, 'archive')).toBeNull();
    expect(accountBlock(list, list[0]!, 'archive')).toBeNull(); // a principal arquiva escolhendo outra
    expect(accountBlock([list[0]!, list[2]!], list[0]!, 'archive')).toBe('ultima_conta_ativa');
    expect(accountBlock(list, list[2]!, 'archive')).toBeNull(); // já arquivada
    expect(accountBlock(list, list[0]!, 'delete')).toBe('conta_principal');
    expect(accountBlock(list, list[1]!, 'delete')).toBeNull();
  });

  it('a nota fiscal escolhe a conta: dinheiro só com uma conta de dinheiro; Pix e débito, a principal se for banco', () => {
    expect(accountForPaymentForms(list, ['dinheiro'])).toBe('b');
    expect(accountForPaymentForms([list[0]!, acc({ id: 'e', name: 'Cofre', kind: 'dinheiro' }), list[1]!], ['dinheiro'])).toBeNull();
    expect(accountForPaymentForms([list[0]!], ['dinheiro'])).toBeNull();
    // Uma conta de dinheiro arquivada não conta.
    expect(accountForPaymentForms([list[0]!, acc({ id: 'f', name: 'Velha', kind: 'dinheiro', status: 'arquivada' })], ['dinheiro'])).toBeNull();
    expect(accountForPaymentForms(list, ['pix'])).toBe('a');
    expect(accountForPaymentForms(list, ['debito'])).toBe('a');
    const walletFirst = [acc({ id: 'w', name: 'Carteira', kind: 'dinheiro', isDefault: true }), list[0]!];
    expect(accountForPaymentForms(walletFirst, ['pix'])).toBeNull(); // a principal não é banco
    // Mais de uma forma, vale, outra forma, crédito e nenhuma: a nota não escolhe a conta.
    expect(accountForPaymentForms(list, ['dinheiro', 'pix'])).toBeNull();
    expect(accountForPaymentForms(list, ['vale'])).toBeNull();
    expect(accountForPaymentForms(list, ['outros'])).toBeNull();
    expect(accountForPaymentForms(list, ['credito'])).toBeNull();
    expect(accountForPaymentForms(list, [])).toBeNull();
    expect(accountForPaymentForms(list, ['pix', 'pix'])).toBe('a');
  });

  it('a conta nas linhas e o filtro de Movimentações: só com mais de uma conta ativa', () => {
    const records = [{ accountId: 'a' }, { accountId: 'b' }, { accountId: 'c' }];
    expect(recordAccountName(list, { accountId: 'b' })).toBe('Carteira');
    expect(recordAccountName(list, { accountId: 'c' })).toBe('Antiga');
    expect(recordAccountName([list[0]!], { accountId: 'a' })).toBeNull();
    expect(recordAccountName(list, { accountId: 'zzz' })).toBeNull();
    expect(accountFilterOptions([list[0]!], records)).toEqual([]);
    expect(accountFilterOptions([list[0]!, list[2]!], records)).toEqual([]);
    expect(accountFilterOptions(list, [{ accountId: 'a' }])).toEqual([
      { id: null, label: 'Todas' },
      { id: 'a', label: 'Conta principal' },
      { id: 'b', label: 'Carteira' },
      { id: 'd', label: 'Reserva' },
    ]);
    // A arquivada só aparece se algum registro do mês é dela.
    expect(accountFilterOptions(list, records).map((o) => o.label)).toEqual(['Todas', 'Conta principal', 'Carteira', 'Reserva', 'Antiga (arquivada)']);
    expect(filterByAccount(records, null)).toHaveLength(3);
    expect(filterByAccount(records, 'b')).toEqual([{ accountId: 'b' }]);
    expect(filterByAccount(records, 'x')).toEqual([]);
  });

  it('textos das contas montados', () => {
    expect(ACCOUNTS_TEXT.rowCaption('banco', true, 'ativa')).toBe('Conta bancária · Principal');
    expect(ACCOUNTS_TEXT.rowCaption('dinheiro', false, 'ativa')).toBe('Dinheiro');
    expect(ACCOUNTS_TEXT.rowCaption('outra', false, 'arquivada')).toBe('Outra · Arquivada');
    expect(ACCOUNTS_TEXT.single(ACCOUNTS_TEXT.out, 'Conta principal')).toBe('Saiu de: Conta principal');
    expect(ACCOUNTS_TEXT.leavingFrom('Carteira')).toBe('saindo da conta Carteira');
    // Nenhum saldo por conta: o aviso não sugere que há saldo inicial a informar.
    expect(ACCOUNTS_TEXT.balanceNote).toBe('O Clarevo não calcula saldo por conta.');
    expect(accountErrorText('conta_com_lancamentos')).toBe(ACCOUNT_ERROR_TEXT.conta_com_lancamentos);
    expect(accountErrorText('qualquer_coisa')).toBe(ACCOUNT_ERROR_TEXT.salvar_falhou);
  });
});

describe('MemoryRepository: contas de origem (D-043)', () => {
  const setup = async (today = DEMO_TODAY) => {
    const clock = { today };
    const repo = new MemoryRepository({ actorId: 'pessoa-teste', displayName: 'Pessoa de teste', today: () => clock.today });
    const space = await repo.ensurePersonalSpace('Conta principal');
    return { repo, ctx: space.personalContextId, principal: space.accounts[0]!.id, clock };
  };

  it('conta nova: só a Conta principal (banco, ativa, principal, versão 1), sem conta de exemplo', async () => {
    const { repo, ctx, principal } = await setup();
    const space = (await repo.getSpace())!;
    expect(space.accounts).toEqual([
      { id: principal, contextId: ctx, name: 'Conta principal', currency: 'BRL', initialBalanceCents: null, kind: 'banco', status: 'ativa', isDefault: true, version: 1 },
    ]);
    expect(await repo.listAccounts(ctx)).toEqual(space.accounts);
    expect(await repo.listAccounts('outro-contexto')).toEqual([]);
  });

  it('cria, valida na ordem do banco, recusa nome repetido e passa de 10 ativas', async () => {
    const { repo, ctx } = await setup();
    await expectCode(repo.createAccount(key(), 'outro-contexto', { name: 'Carteira', kind: 'dinheiro' }), 'sem_permissao');
    await expectCode(repo.createAccount(key(), ctx, { name: ' ', kind: 'dinheiro' }), 'nome_da_conta_invalido');
    await expectCode(repo.createAccount(key(), ctx, { name: 'x'.repeat(41), kind: 'dinheiro' }), 'nome_da_conta_invalido');
    await expectCode(repo.createAccount(key(), ctx, { name: 'Carteira', kind: 'poupanca' as never }), 'tipo_da_conta_invalido');
    await expectCode(repo.createAccount(key(), ctx, { name: '', kind: 'poupanca' as never }), 'nome_da_conta_invalido');
    await expectCode(repo.createAccount(key(), ctx, { name: 'conta PRINCIPAL', kind: 'banco' }), 'nome_da_conta_repetido');
    const k = key();
    const a = await repo.createAccount(k, ctx, { name: '  Carteira ', kind: 'dinheiro' });
    expect(a).toMatchObject({ name: 'Carteira', kind: 'dinheiro', status: 'ativa', isDefault: false, version: 1, contextId: ctx });
    // Repetição devolve a mesma conta; conteúdo diferente ou outra ação com a chave: chave_reutilizada.
    expect(await repo.createAccount(k, ctx, { name: 'Carteira', kind: 'dinheiro' })).toEqual(a);
    await expectCode(repo.createAccount(k, ctx, { name: 'Carteira', kind: 'banco' }), 'chave_reutilizada');
    await expectCode(repo.updateAccount(k, a.id, 1, { name: 'Carteira', kind: 'dinheiro' }), 'chave_reutilizada');
    expect((await repo.findAccountOperation(k))).toEqual({ action: 'criar_conta', accountId: a.id });
    expect(await repo.findAccountOperation('nunca')).toBeNull();
    expect((await repo.listAccounts(ctx)).map((x) => x.name)).toEqual(['Conta principal', 'Carteira']);
    // Até 10 ativas: a 11ª é recusada; arquivar libera uma vaga; reativar com 10 ativas é recusado.
    for (let i = 3; i <= 10; i++) await repo.createAccount(key(), ctx, { name: `Conta ${i}`, kind: 'banco' });
    expect((await repo.listAccounts(ctx)).filter((x) => x.status === 'ativa')).toHaveLength(10);
    await expectCode(repo.createAccount(key(), ctx, { name: 'Conta 11', kind: 'banco' }), 'limite_de_contas');
    const c3 = (await repo.listAccounts(ctx)).find((x) => x.name === 'Conta 3')!;
    const archived = await repo.setAccountStatus(key(), c3.id, c3.version, 'arquivada');
    await repo.createAccount(key(), ctx, { name: 'Conta 11', kind: 'banco' });
    await expectCode(repo.setAccountStatus(key(), c3.id, archived.version, 'ativa'), 'limite_de_contas');
  });

  it('altera nome e tipo com a versão; renomeia a arquivada; repete a chave', async () => {
    const { repo, ctx, principal } = await setup();
    const cart = await repo.createAccount(key(), ctx, { name: 'Carteira', kind: 'dinheiro' });
    await expectCode(repo.updateAccount(key(), cart.id, 0, { name: 'Dinheiro', kind: 'dinheiro' }), 'versao_desatualizada', 'versao_atual=1');
    await expectCode(repo.updateAccount(key(), cart.id, 1, { name: '', kind: 'dinheiro' }), 'nome_da_conta_invalido');
    await expectCode(repo.updateAccount(key(), cart.id, 1, { name: 'Dinheiro', kind: 'x' as never }), 'tipo_da_conta_invalido');
    await expectCode(repo.updateAccount(key(), cart.id, 1, { name: 'Conta Principal', kind: 'dinheiro' }), 'nome_da_conta_repetido');
    await expectCode(repo.updateAccount(key(), 'nao-existe', 1, { name: 'X', kind: 'banco' }), 'nao_encontrado');
    const k = key();
    const a = await repo.updateAccount(k, cart.id, 1, { name: ' Dinheiro vivo ', kind: 'outra' });
    expect(a).toMatchObject({ name: 'Dinheiro vivo', kind: 'outra', version: 2, status: 'ativa', isDefault: false });
    expect(await repo.updateAccount(k, cart.id, 1, { name: 'Dinheiro vivo', kind: 'outra' })).toEqual(a);
    expect((await repo.listAccounts(ctx)).find((x) => x.id === cart.id)!.version).toBe(2);
    // Trocar só a caixa do próprio nome vale.
    expect((await repo.updateAccount(key(), cart.id, 2, { name: 'DINHEIRO VIVO', kind: 'outra' })).name).toBe('DINHEIRO VIVO');
    // Arquivada também renomeia.
    const arch = await repo.setAccountStatus(key(), cart.id, 3, 'arquivada');
    expect((await repo.updateAccount(key(), cart.id, arch.version, { name: 'Antiga', kind: 'outra' })).status).toBe('arquivada');
    expect(principal).toBeTruthy();
  });

  it('a principal: troca (a anterior sobe +1), já ser a principal não muda nada, arquivada recusada', async () => {
    const { repo, ctx, principal } = await setup();
    const cart = await repo.createAccount(key(), ctx, { name: 'Carteira', kind: 'dinheiro' });
    await expectCode(repo.setDefaultAccount(key(), cart.id, 0), 'versao_desatualizada', 'versao_atual=1');
    const k = key();
    const next = await repo.setDefaultAccount(k, cart.id, 1);
    expect(next).toMatchObject({ isDefault: true, version: 2 });
    expect(await repo.setDefaultAccount(k, cart.id, 1)).toEqual(next);
    const list = await repo.listAccounts(ctx);
    expect(list.map((a) => [a.name, a.isDefault, a.version])).toEqual([
      ['Carteira', true, 2],
      ['Conta principal', false, 2],
    ]);
    expect((await repo.getSpace())!.accounts.map((a) => a.id)).toEqual([cart.id, principal]); // a principal vem primeiro nos seletores
    // Já ser a principal: aceito, a versão não sobe.
    expect((await repo.setDefaultAccount(key(), cart.id, 2)).version).toBe(2);
    // Conta arquivada nunca é a principal.
    const arch = await repo.setAccountStatus(key(), principal, 2, 'arquivada');
    await expectCode(repo.setDefaultAccount(key(), principal, arch.version), 'conta_arquivada');
  });

  it('situação: nunca a última ativa; arquivar a principal só escolhendo outra; mesma situação não muda nada', async () => {
    const { repo, ctx, principal } = await setup();
    await expectCode(repo.setAccountStatus(key(), principal, 1, 'arquivada'), 'ultima_conta_ativa');
    const cart = await repo.createAccount(key(), ctx, { name: 'Carteira', kind: 'dinheiro' });
    await expectCode(repo.setAccountStatus(key(), cart.id, 1, 'excluida' as never), 'situacao_invalida');
    await expectCode(repo.setAccountStatus(key(), cart.id, 0, 'arquivada'), 'versao_desatualizada', 'versao_atual=1');
    // newDefaultId só quando se arquiva a principal.
    await expectCode(repo.setAccountStatus(key(), cart.id, 1, 'arquivada', principal), 'campo_nao_se_aplica');
    await expectCode(repo.setAccountStatus(key(), cart.id, 1, 'ativa', principal), 'campo_nao_se_aplica');
    // A principal exige a nova escolhida: ativa, outra e do contexto.
    await expectCode(repo.setAccountStatus(key(), principal, 1, 'arquivada'), 'conta_principal');
    await expectCode(repo.setAccountStatus(key(), principal, 1, 'arquivada', principal), 'conta_invalida');
    await expectCode(repo.setAccountStatus(key(), principal, 1, 'arquivada', 'nao-existe'), 'conta_invalida');
    const old = await repo.createAccount(key(), ctx, { name: 'Antiga', kind: 'banco' });
    const oldArch = await repo.setAccountStatus(key(), old.id, 1, 'arquivada');
    expect(oldArch.status).toBe('arquivada');
    await expectCode(repo.setAccountStatus(key(), principal, 1, 'arquivada', old.id), 'conta_invalida');
    const k = key();
    const archived = await repo.setAccountStatus(k, principal, 1, 'arquivada', cart.id);
    expect(archived).toMatchObject({ status: 'arquivada', isDefault: false, version: 2 });
    expect(await repo.setAccountStatus(k, principal, 1, 'arquivada', cart.id)).toEqual(archived);
    const space = (await repo.getSpace())!;
    expect(space.accounts.map((a) => [a.name, a.isDefault])).toEqual([['Carteira', true]]);
    expect((await repo.listAccounts(ctx)).map((a) => [a.name, a.status])).toEqual([
      ['Carteira', 'ativa'],
      ['Conta principal', 'arquivada'],
      ['Antiga', 'arquivada'],
    ]);
    // Mesma situação: aceita, nada muda (a versão não sobe).
    expect((await repo.setAccountStatus(key(), principal, 2, 'arquivada')).version).toBe(2);
    expect((await repo.setAccountStatus(key(), cart.id, 2, 'ativa')).version).toBe(2);
    // Agora a Carteira é a principal e a única ativa: nada a arquivar. Reativa a Conta principal e volta.
    await expectCode(repo.setAccountStatus(key(), cart.id, 2, 'arquivada', principal), 'ultima_conta_ativa');
    const back = await repo.setAccountStatus(key(), principal, 2, 'ativa');
    expect(back).toMatchObject({ status: 'ativa', isDefault: false, version: 3 });
    expect((await repo.getSpace())!.accounts.map((a) => a.name)).toEqual(['Carteira', 'Conta principal']);
  });

  it('exclui sem lançamentos (fica arquivada e some); a principal nunca; com gasto ou movimento de meta, arquive', async () => {
    const { repo, ctx, principal } = await setup();
    const cart = await repo.createAccount(key(), ctx, { name: 'Carteira', kind: 'dinheiro' });
    await expectCode(repo.deleteAccount(key(), principal, 1), 'conta_principal');
    await expectCode(repo.deleteAccount(key(), cart.id, 0), 'versao_desatualizada', 'versao_atual=1');
    await expectCode(repo.deleteAccount(key(), 'nao-existe', 1), 'nao_encontrado');
    const rec = await repo.createRecord(key(), ctx, 'despesa', { accountId: cart.id, amountCents: 1000, occurredOn: DEMO_TODAY, description: 'Pão', category: null });
    await expectCode(repo.deleteAccount(key(), cart.id, 1), 'conta_com_lancamentos');
    await repo.deleteRecord(key(), rec.id, 1);
    // Movimento de meta vivo também segura a conta.
    const goal = await repo.createGoal(key(), ctx, {
      goalType: 'objetivo',
      name: 'Viagem',
      targetCents: 500_000,
      targetMonth: null,
      plannedMonthlyCents: null,
      essentialBaseCents: null,
      essentialMonths: null,
      essentialBaseSource: null,
      initialCents: null,
      initialOn: null,
    });
    const mv = await repo.addGoalMovement(key(), goal.goal.id, 'aporte', { amountCents: 1000, occurredOn: DEMO_TODAY, note: null, accountId: cart.id });
    await expectCode(repo.deleteAccount(key(), cart.id, 1), 'conta_com_lancamentos');
    await repo.deleteGoalMovement(key(), mv.movement!.id, mv.movement!.version);
    const k = key();
    const deleted = await repo.deleteAccount(k, cart.id, 1);
    expect(deleted).toMatchObject({ status: 'arquivada', isDefault: false, version: 2 });
    expect(await repo.deleteAccount(k, cart.id, 1)).toEqual(deleted);
    expect((await repo.listAccounts(ctx)).map((a) => a.name)).toEqual(['Conta principal']);
    await expectCode(repo.updateAccount(key(), cart.id, 2, { name: 'Volta', kind: 'banco' }), 'nao_encontrado');
    await expectCode(repo.setDefaultAccount(key(), cart.id, 2), 'nao_encontrado');
    await expectCode(repo.createRecord(key(), ctx, 'despesa', { accountId: cart.id, amountCents: 100, occurredOn: DEMO_TODAY, description: 'X', category: null }), 'conta_invalida');
    // O nome da excluída volta a poder ser usado.
    const again = await repo.createAccount(key(), ctx, { name: 'Carteira', kind: 'dinheiro' });
    expect(again.id).not.toBe(cart.id);
  });

  it('gastos, pagamentos e faturas: só conta ativa do contexto; editar mantendo a conta arquivada vale', async () => {
    const { repo, ctx, principal } = await setup();
    const cart = await repo.createAccount(key(), ctx, { name: 'Carteira', kind: 'dinheiro' });
    const old = await repo.createAccount(key(), ctx, { name: 'Antiga', kind: 'banco' });
    const input = (accountId: string, amountCents = 1000) => ({ accountId, amountCents, occurredOn: DEMO_TODAY, description: 'Troco', category: null });
    const rec = await repo.createRecord(key(), ctx, 'despesa', input(old.id));
    await repo.setAccountStatus(key(), old.id, 1, 'arquivada');
    await expectCode(repo.createRecord(key(), ctx, 'despesa', input(old.id)), 'conta_invalida');
    await expectCode(repo.createRecord(key(), ctx, 'despesa', input('nao-existe')), 'conta_invalida');
    // Editar o gasto da arquivada mantendo a conta; trocar para a arquivada, não; para a ativa, sim.
    const edited = await repo.updateRecord(key(), rec.id, 1, input(old.id, 1500));
    expect([edited.accountId, edited.amountCents, edited.version]).toEqual([old.id, 1500, 2]);
    const moved = await repo.updateRecord(key(), rec.id, 2, input(cart.id, 1500));
    expect(moved.accountId).toBe(cart.id);
    await expectCode(repo.updateRecord(key(), rec.id, 3, input(old.id, 1500)), 'conta_invalida');
    // Pagar conta a pagar escolhendo a conta.
    const bill = await repo.createCommitment(key(), ctx, { description: 'Internet', amountCents: 15_000, dueOn: '2026-10-15', category: 'Moradia' });
    await expectCode(repo.payCommitment(key(), bill.commitment.id, 1, { accountId: old.id, amountCents: 15_000, paidOn: DEMO_TODAY, category: 'Moradia' }), 'conta_invalida');
    const paid = await repo.payCommitment(key(), bill.commitment.id, 1, { accountId: cart.id, amountCents: 15_000, paidOn: DEMO_TODAY, category: 'Moradia' });
    expect(paid.record.accountId).toBe(cart.id);
    expect(paid.commitment.payment?.accountId).toBe(cart.id);
    // Fatura paga numa conta escolhida.
    const card = await repo.createCard(key(), ctx, { name: 'Cartão', lastDigits: null, closingDay: 3, dueDay: 10, limitCents: null });
    await repo.addCardPurchase(key(), card.card.id, { description: 'Livro', category: null, purchasedOn: '2026-09-20', totalCents: 20_000, installments: 1 });
    const inv = (await repo.listInvoiceItems(card.card.id)).find((i) => i.month === '2026-10')!;
    await expectCode(repo.payInvoice(key(), card.card.id, '2026-10', inv.commitmentVersion!, 20_000, DEMO_TODAY, old.id), 'conta_invalida');
    const paidInvoice = await repo.payInvoice(key(), card.card.id, '2026-10', inv.commitmentVersion!, 20_000, DEMO_TODAY, cart.id);
    expect(paidInvoice.record.accountId).toBe(cart.id);
    expect(principal).toBeTruthy();
    // Sem a conta, a principal do contexto (não a mais antiga): primeiro a Conta principal, depois a Carteira quando ela passa a principal.
    const bill2 = await repo.createCommitment(key(), ctx, { description: 'Água', amountCents: 5000, dueOn: '2026-10-16', category: 'Moradia' });
    const byDefault = await repo.payCommitment(key(), bill2.commitment.id, 1, { accountId: null, amountCents: 5000, paidOn: DEMO_TODAY, category: 'Moradia' });
    expect(byDefault.record.accountId).toBe(principal);
    await repo.undoInvoicePayment(key(), card.card.id, '2026-10', (await repo.listInvoiceItems(card.card.id)).find((i) => i.month === '2026-10')!.commitmentVersion!);
    const afterUndo = (await repo.listInvoiceItems(card.card.id)).find((i) => i.month === '2026-10')!;
    const first = await repo.payInvoice(key(), card.card.id, '2026-10', afterUndo.commitmentVersion!, 20_000, DEMO_TODAY);
    expect(first.record.accountId).toBe(principal);
    await repo.setDefaultAccount(key(), cart.id, cart.version);
    await repo.undoInvoicePayment(key(), card.card.id, '2026-10', (await repo.listInvoiceItems(card.card.id)).find((i) => i.month === '2026-10')!.commitmentVersion!);
    const again = await repo.payInvoice(key(), card.card.id, '2026-10', (await repo.listInvoiceItems(card.card.id)).find((i) => i.month === '2026-10')!.commitmentVersion!, 20_000, DEMO_TODAY);
    expect(again.record.accountId).toBe(cart.id);
    const bill3 = await repo.createCommitment(key(), ctx, { description: 'Gás', amountCents: 6000, dueOn: '2026-10-17', category: 'Moradia' });
    const byNew = await repo.payCommitment(key(), bill3.commitment.id, 1, { accountId: null, amountCents: 6000, paidOn: DEMO_TODAY, category: 'Moradia' });
    expect(byNew.record.accountId).toBe(cart.id);
    // A primeira entrada devolve a principal primeiro.
    expect((await repo.ensurePersonalSpace('Outro nome')).accounts[0]!.id).toBe(cart.id);
  });

  it('aporte e resgate de meta com a conta: só nesses tipos, conta ativa do contexto; a conta só informa', async () => {
    const { repo, ctx, principal } = await setup();
    const cart = await repo.createAccount(key(), ctx, { name: 'Carteira', kind: 'dinheiro' });
    const old = await repo.createAccount(key(), ctx, { name: 'Antiga', kind: 'banco' });
    const goal = await repo.createGoal(key(), ctx, {
      goalType: 'objetivo',
      name: 'Viagem',
      targetCents: 500_000,
      targetMonth: null,
      plannedMonthlyCents: null,
      essentialBaseCents: null,
      essentialMonths: null,
      essentialBaseSource: null,
      initialCents: 100_000,
      initialOn: '2026-10-01',
    });
    const gid = goal.goal.id;
    expect(goal.movement!.accountId).toBeNull(); // o já guardado ao criar não leva conta
    await repo.setAccountStatus(key(), old.id, 1, 'arquivada');
    const base = (accountId?: string | null) => ({ amountCents: 1000, occurredOn: DEMO_TODAY, note: null, accountId });
    const before = await repo.listRecords(ctx, '2026-10');
    const k = key();
    const a = await repo.addGoalMovement(k, gid, 'aporte', base(cart.id));
    expect(a.movement).toMatchObject({ kind: 'aporte', accountId: cart.id, version: 1 });
    expect(a.goal.savedCents).toBe(101_000);
    expect(await repo.addGoalMovement(k, gid, 'aporte', base(cart.id))).toEqual(a);
    await expectCode(repo.addGoalMovement(k, gid, 'aporte', base(principal)), 'chave_reutilizada');
    await expectCode(repo.addGoalMovement(k, gid, 'aporte', base(null)), 'chave_reutilizada');
    const r = await repo.addGoalMovement(key(), gid, 'resgate', base(principal));
    expect(r.movement!.accountId).toBe(principal);
    const none = await repo.addGoalMovement(key(), gid, 'aporte', base());
    expect(none.movement!.accountId).toBeNull();
    // Os outros tipos não levam conta; conta arquivada, inexistente ou de outro contexto: conta_invalida.
    for (const kind of ['rendimento', 'valorizacao', 'desvalorizacao'] as const) {
      await expectCode(repo.addGoalMovement(key(), gid, kind, base(principal)), 'campo_nao_se_aplica');
    }
    await expectCode(repo.addGoalMovement(key(), gid, 'aporte', base(old.id)), 'conta_invalida');
    await expectCode(repo.addGoalMovement(key(), gid, 'aporte', base('nao-existe')), 'conta_invalida');
    // Ordem: o valor vem antes da conta; a conta, antes do saldo.
    await expectCode(repo.addGoalMovement(key(), gid, 'aporte', { ...base(old.id), amountCents: 0 }), 'valor_invalido');
    await expectCode(repo.addGoalMovement(key(), gid, 'resgate', { ...base(old.id), amountCents: 99_999_999 }), 'conta_invalida');
    await expectCode(repo.addGoalMovement(key(), gid, 'resgate', { ...base(cart.id), amountCents: 99_999_999 }), 'saldo_da_meta_insuficiente');
    // Alterar: trocar, tirar (nulo), manter a conta arquivada, e o tipo que não leva conta.
    const m = a.movement!;
    const swapped = await repo.updateGoalMovement(key(), m.id, 1, base(principal));
    expect(swapped.movement).toMatchObject({ accountId: principal, version: 2 });
    // Sem a conta no pedido (o app publicado antes da 0010): a conta do movimento é mantida, e o hash é outro que o do nulo informado.
    const kk = key();
    const kept = await repo.updateGoalMovement(kk, m.id, 2, { amountCents: 1200, occurredOn: DEMO_TODAY, note: null });
    expect(kept.movement).toMatchObject({ accountId: principal, amountCents: 1200, version: 3 });
    expect(await repo.updateGoalMovement(kk, m.id, 2, { amountCents: 1200, occurredOn: DEMO_TODAY, note: null })).toEqual(kept);
    await expectCode(repo.updateGoalMovement(kk, m.id, 2, { amountCents: 1200, occurredOn: DEMO_TODAY, note: null, accountId: null }), 'chave_reutilizada');
    // Nulo informado tira a conta.
    const cleared = await repo.updateGoalMovement(key(), m.id, 3, base(null));
    expect(cleared.movement!.accountId).toBeNull();
    // Sem conta no movimento, ausente continua sem conta.
    const noneKept = await repo.updateGoalMovement(key(), m.id, 4, { amountCents: 1000, occurredOn: DEMO_TODAY, note: null });
    expect(noneKept.movement).toMatchObject({ accountId: null, version: 5 });
    await expectCode(repo.updateGoalMovement(key(), m.id, 5, base(old.id)), 'conta_invalida');
    const interest = await repo.addGoalMovement(key(), gid, 'rendimento', base());
    await expectCode(repo.updateGoalMovement(key(), interest.movement!.id, 1, base(principal)), 'campo_nao_se_aplica');
    await expectCode(repo.updateGoalMovement(key(), goal.movement!.id, 1, base(principal)), 'campo_nao_se_aplica');
    // Manter a conta que o movimento já tem vale mesmo depois de arquivada.
    const keep = await repo.updateGoalMovement(key(), m.id, 5, base(cart.id));
    await repo.setAccountStatus(key(), cart.id, 1, 'arquivada');
    const stillThere = await repo.updateGoalMovement(key(), m.id, keep.movement!.version, { ...base(cart.id), amountCents: 2000 });
    expect(stillThere.movement).toMatchObject({ accountId: cart.id, amountCents: 2000 });
    // E sem a conta no pedido (cliente antigo) também, mesmo arquivada.
    const stillOld = await repo.updateGoalMovement(key(), m.id, stillThere.movement!.version, { amountCents: 2100, occurredOn: DEMO_TODAY, note: null });
    expect(stillOld.movement).toMatchObject({ accountId: cart.id, amountCents: 2100 });
    expect((await repo.listGoalMovements(gid)).filter((x) => x.accountId === cart.id)).toHaveLength(1);
    // Só informativo: nenhum gasto nasceu e os totais do mês são os de sempre.
    expect(await repo.listRecords(ctx, '2026-10')).toEqual(before);
    const totals = summarizeMonth(await repo.listRecords(ctx, '2026-10'), ctx, '2026-10');
    expect([totals.receivedCents, totals.paidCents]).toEqual([0, 0]);
  });

  it('sequência de aceite (docs/02): os dez passos, com o Pago mudando só pelo gasto', async () => {
    const { repo, ctx, principal } = await setup();
    const totals = async () => {
      const t = summarizeMonth(await repo.listRecords(ctx, '2026-10'), ctx, '2026-10');
      return [t.receivedCents, t.paidCents];
    };
    // 1. Conta nova.
    expect((await repo.listAccounts(ctx)).map((a) => [a.name, a.kind, a.status, a.isDefault, a.version])).toEqual([['Conta principal', 'banco', 'ativa', true, 1]]);
    expect(await totals()).toEqual([0, 0]);
    // 2. Criar a Carteira.
    const cart = await repo.createAccount(key(), ctx, { name: 'Carteira', kind: 'dinheiro' });
    expect(activeAccounts(await repo.listAccounts(ctx)).map((a) => [a.name, a.isDefault])).toEqual([['Conta principal', true], ['Carteira', false]]);
    // 3. Mesmo nome com outra caixa.
    await expectCode(repo.createAccount(key(), ctx, { name: 'carteira', kind: 'dinheiro' }), 'nome_da_conta_repetido');
    // 4. Gasto de R$ 80,00 na Carteira.
    const spent = await repo.createRecord(key(), ctx, 'despesa', { accountId: cart.id, amountCents: 8000, occurredOn: DEMO_TODAY, description: 'Feira', category: 'Mercado' });
    expect(spent.accountId).toBe(cart.id);
    expect(await totals()).toEqual([0, 8000]);
    // 5. Excluir a Carteira.
    await expectCode(repo.deleteAccount(key(), cart.id, cart.version), 'conta_com_lancamentos');
    // 6. Arquivar a Carteira: o gasto mantém a conta.
    const archived = await repo.setAccountStatus(key(), cart.id, cart.version, 'arquivada');
    expect(archived.status).toBe('arquivada');
    expect((await repo.listRecords(ctx, '2026-10')).find((r) => r.id === spent.id)!.accountId).toBe(cart.id);
    // 7. Arquivar a principal sem escolher a nova: só resta ela ativa.
    await expectCode(repo.setAccountStatus(key(), principal, 1, 'arquivada'), 'ultima_conta_ativa');
    // 8. Reativar a Carteira e arquivar a principal escolhendo a Carteira.
    const back = await repo.setAccountStatus(key(), cart.id, archived.version, 'ativa');
    const k = key();
    const swapped = await repo.setAccountStatus(k, principal, 1, 'arquivada', cart.id);
    expect(swapped.status).toBe('arquivada');
    const list = await repo.listAccounts(ctx);
    expect(list.find((a) => a.id === cart.id)).toMatchObject({ isDefault: true, status: 'ativa' });
    expect(list.find((a) => a.id === principal)).toMatchObject({ isDefault: false, status: 'arquivada' });
    expect(back.status).toBe('ativa');
    // 9. A mesma chave: nada muda.
    expect(await repo.setAccountStatus(k, principal, 1, 'arquivada', cart.id)).toEqual(swapped);
    expect(await repo.listAccounts(ctx)).toEqual(list);
    // 10. Aporte com a conta e resgate sem conta: só os movimentos mudam.
    const goal = await repo.createGoal(key(), ctx, {
      goalType: 'objetivo', name: 'Viagem', targetCents: 500_000, targetMonth: null, plannedMonthlyCents: null,
      essentialBaseCents: null, essentialMonths: null, essentialBaseSource: null, initialCents: 0, initialOn: null,
    });
    const gid = goal.goal.id;
    const base = (amountCents: number, accountId: string | null) => ({ amountCents, occurredOn: DEMO_TODAY, note: null, accountId });
    const dep = await repo.addGoalMovement(key(), gid, 'aporte', base(10_000, cart.id));
    const out = await repo.addGoalMovement(key(), gid, 'resgate', base(3000, null));
    expect([dep.movement!.accountId, out.movement!.accountId]).toEqual([cart.id, null]);
    expect(await totals()).toEqual([0, 8000]);
  });

  it('o cliente antigo (sem a conta) mantém o hash: a mesma chave com o mesmo conteúdo repete', async () => {
    const { repo, ctx } = await setup();
    const goal = await repo.createGoal(key(), ctx, {
      goalType: 'objetivo',
      name: 'Curso',
      targetCents: 100_000,
      targetMonth: null,
      plannedMonthlyCents: null,
      essentialBaseCents: null,
      essentialMonths: null,
      essentialBaseSource: null,
      initialCents: null,
      initialOn: null,
    });
    const k = key();
    const a = await repo.addGoalMovement(k, goal.goal.id, 'aporte', { amountCents: 500, occurredOn: DEMO_TODAY, note: null });
    expect(await repo.addGoalMovement(k, goal.goal.id, 'aporte', { amountCents: 500, occurredOn: DEMO_TODAY, note: null, accountId: null })).toEqual(a);
  });

  it('falha no meio devolve tudo: nenhuma conta pela metade', async () => {
    const { repo, ctx, principal } = await setup();
    repo.failNextWrite = 'antes';
    await expectCode(repo.createAccount(key(), ctx, { name: 'Carteira', kind: 'dinheiro' }), 'rede');
    expect(await repo.listAccounts(ctx)).toHaveLength(1);
    const cart = await repo.createAccount(key(), ctx, { name: 'Carteira', kind: 'dinheiro' });
    // Resposta perdida: a conta foi gravada; repetir a chave reconcilia.
    repo.failNextWrite = 'depois';
    const k = key();
    await expectCode(repo.setDefaultAccount(k, cart.id, 1), 'rede');
    expect((await repo.findAccountOperation(k))?.accountId).toBe(cart.id);
    expect((await repo.setDefaultAccount(k, cart.id, 1)).isDefault).toBe(true);
    expect((await repo.listAccounts(ctx)).filter((a) => a.isDefault).map((a) => a.id)).toEqual([cart.id]);
    expect(principal).toBeTruthy();
  });

  it('renameAccount (app publicado antes da 0010): soma 1 à versão e recusa nome repetido', async () => {
    const { repo, ctx, principal } = await setup();
    await repo.createAccount(key(), ctx, { name: 'Carteira', kind: 'dinheiro' });
    await repo.renameAccount(principal, 'Conta corrente');
    expect((await repo.getSpace())!.accounts[0]).toMatchObject({ name: 'Conta corrente', version: 2 });
    await expectCode(repo.renameAccount(principal, 'carteira'), 'nome_da_conta_repetido');
    await expectCode(repo.renameAccount(principal, ' '), 'nome_da_conta_invalido');
    await expectCode(repo.renameAccount('nao-existe', 'X'), 'nao_encontrado');
  });
});

describe('demonstração: Conta principal e Carteira (D-043)', () => {
  it('duas contas, gastos na Carteira e os totais de outubro de sempre', async () => {
    const repo = await createDemoRepository();
    const space = (await repo.getSpace())!;
    const ctx = space.personalContextId;
    expect(space.accounts.map((a) => [a.name, a.kind, a.isDefault])).toEqual([
      ['Conta principal', 'banco', true],
      ['Carteira', 'dinheiro', false],
    ]);
    const carteira = space.accounts[1]!.id;
    const october = await repo.listRecords(ctx, '2026-10');
    expect(october.filter((r) => r.accountId === carteira).map((r) => [r.description, r.amountCents])).toEqual([['Mercado', 140_000]]);
    expect((await repo.listRecords(ctx, '2026-09')).filter((r) => r.accountId === carteira)).toHaveLength(1);
    const s = summarizeMonth(october, ctx, '2026-10');
    expect([s.receivedCents, s.paidCents, s.differenceCents]).toEqual([600_000, 390_000, 210_000]);
    const toPay = summarizeToPay(await repo.listCommitments(ctx, '2026-10'), ctx, '2026-10', DEMO_TODAY);
    expect(toPay.toPayCents).toBe(65_000);
    // O aporte da demonstração saiu da Conta principal.
    const reserva = (await repo.listGoals(ctx)).find((g) => g.goalType === 'emergencia')!;
    const aporte = (await repo.listGoalMovements(reserva.id)).find((m) => m.kind === 'aporte')!;
    expect(aporte.accountId).toBe(space.accounts[0]!.id);
    // Sem as faturas (bases dos ciclos anteriores) as contas são as mesmas.
    const base = await createDemoRepository({ cards: false });
    expect((await base.getSpace())!.accounts.map((a) => a.name)).toEqual(['Conta principal', 'Carteira']);
    // O cenário de retorno (montagem de maio) tem só a Conta principal.
    const back = await createDemoRepository({ scenario: 'retorno' });
    expect((await back.getSpace())!.accounts.map((a) => a.name)).toEqual(['Conta principal']);
  });
});
