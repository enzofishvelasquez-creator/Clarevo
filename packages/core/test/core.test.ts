import { describe, expect, it } from 'vitest';
import {
  DEMO_TODAY,
  addDays,
  formatDateTimeBR,
  formatDayHeader,
  maskDateBR,
  ERROR_TEXT,
  MemoryRepository,
  centsToInput,
  createDemoRepository,
  formatBRL,
  formatDateBR,
  isRepoError,
  newOperationKey,
  parseBRL,
  parseDateBR,
  summarizeCommitments,
  summarizeMonth,
  todayIn,
  validateRecordDraft,
  type RecordDraft,
} from '../src';

const OCT = '2026-10';

async function setup() {
  const repo = await createDemoRepository();
  const space = (await repo.getSpace())!;
  const ctx = space.personalContextId;
  const accountId = space.accounts[0]!.id;
  const totals = async (month = OCT) => {
    const s = summarizeMonth(await repo.listRecords(ctx, month), ctx, month);
    return [s.receivedCents / 100, s.paidCents / 100, s.differenceCents / 100];
  };
  const input = (reais: number, occurredOn = '2026-10-07', description = 'Café') => ({
    accountId,
    amountCents: Math.round(reais * 100),
    occurredOn,
    description,
    category: null,
  });
  return { repo, ctx, accountId, totals, input };
}

describe('dinheiro', () => {
  it('formata em reais', () => {
    expect(formatBRL(210000)).toBe('R$ 2.100,00');
    expect(formatBRL(-5050)).toBe('-R$ 50,50');
    expect(centsToInput(123456)).toBe('1.234,56');
  });

  it.each([
    ['80', 8000],
    ['80,00', 8000],
    ['80,5', 8050],
    ['1.234,56', 123456],
    ['1234,56', 123456],
    ['R$ 80', 8000],
    ['9.999.999,99', 999999999],
    ['12.50', 1250],
    ['12.5', 1250],
    [' 80,00 ', 8000],
  ])('lê "%s"', (text, cents) => expect(parseBRL(text)).toBe(cents));

  it.each(['', 'abc', '1,234', '-10', '10,', '80,001', '1.2345,00', '12 34', '1.2.3', '12.345.6'])('rejeita "%s"', (text) =>
    expect(parseBRL(text)).toBeNull(),
  );
});

describe('datas civis', () => {
  it('converte DD/MM/AAAA sem deslocar o dia', () => {
    expect(parseDateBR('07/10/2026')).toBe('2026-10-07');
    expect(parseDateBR('7/1/2026')).toBe('2026-01-07');
    expect(formatDateBR('2026-10-07')).toBe('07/10/2026');
  });

  it.each(['31/09/2026', '29/02/2026', '00/10/2026', '2026-10-07', '07/13/2026'])('rejeita data impossível "%s"', (d) =>
    expect(parseDateBR(d)).toBeNull(),
  );

  it('máscara de data e soma de dias', () => {
    expect(maskDateBR('06102026')).toBe('06/10/2026');
    expect(maskDateBR('06/10/2026')).toBe('06/10/2026');
    expect(maskDateBR('061')).toBe('06/1');
    expect(maskDateBR('06')).toBe('06');
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('data e hora no fuso da pessoa e títulos de dia', () => {
    expect(formatDateTimeBR('2026-10-07T17:32:00Z', 'America/Sao_Paulo')).toBe('07/10/2026 às 14:32');
    expect(formatDayHeader('2026-10-07', '2026-10-07')).toBe('Hoje');
    expect(formatDayHeader('2026-10-06', '2026-10-07')).toBe('Ontem');
    expect(formatDayHeader('2026-10-05', '2026-10-07')).toBe('5 de outubro');
  });

  it('dia atual usa o fuso da pessoa', () => {
    // 02:30 UTC de 8/10 ainda é 7/10 em São Paulo (UTC−3).
    expect(todayIn('America/Sao_Paulo', new Date('2026-10-08T02:30:00Z'))).toBe('2026-10-07');
  });
});

describe('validação do formulário (CL C002)', () => {
  const draft = (over: Partial<RecordDraft> = {}): RecordDraft => ({
    accountId: 'conta-1',
    amountText: '80,00',
    description: '  Café  ',
    category: null,
    dateText: '07/10/2026',
    ...over,
  });

  it('aceita e normaliza', () => {
    const v = validateRecordDraft(draft(), DEMO_TODAY);
    expect(v).toEqual({
      ok: true,
      input: { accountId: 'conta-1', amountCents: 8000, occurredOn: '2026-10-07', description: 'Café', category: null },
    });
  });

  it('mensagens exatas por campo', () => {
    const v = validateRecordDraft(draft({ description: '   ', amountText: '0', dateText: '31/09/2026' }), DEMO_TODAY);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.errors.description).toBe('Dê um nome para este registro.');
      expect(v.errors.amountText).toBe('Informe um valor maior que zero, como 80,00.');
      expect(v.errors.dateText).toBe('Confira a data informada.');
    }
  });

  it('recusa data futura, descrição longa e valor acima do limite', () => {
    const v = validateRecordDraft(draft({ dateText: '08/10/2026', description: 'x'.repeat(81), amountText: '10.000.000,00' }), DEMO_TODAY);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.errors.dateText).toBe(ERROR_TEXT.data_futura);
      expect(v.errors.description).toBe(ERROR_TEXT.descricao_longa);
      expect(v.errors.amountText).toBe(ERROR_TEXT.valor_acima_do_limite);
    }
  });

  it('valor com dígitos demais mostra a mensagem de limite', () => {
    const v = validateRecordDraft(draft({ amountText: '99999999999999999' }), DEMO_TODAY);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors.amountText).toBe(ERROR_TEXT.valor_acima_do_limite);
  });

  it('descrição conta caracteres como o banco (emoji conta 1)', () => {
    expect(validateRecordDraft(draft({ description: '🍞'.repeat(80) }), DEMO_TODAY).ok).toBe(true);
    expect(validateRecordDraft(draft({ description: '🍞'.repeat(81) }), DEMO_TODAY).ok).toBe(false);
  });

  it('80 caracteres é aceito', () => {
    expect(validateRecordDraft(draft({ description: 'x'.repeat(80) }), DEMO_TODAY).ok).toBe(true);
  });
});

describe('sequência de aceite do primeiro ciclo (mesmo mês e contexto)', () => {
  it('reproduz a tabela do handoff, com R$ 650 previstos sempre separados', async () => {
    const { repo, ctx, totals, input } = await setup();
    const toPay = async () => summarizeCommitments(await repo.listCommitments(ctx, OCT), ctx, OCT).toPayCents / 100;

    expect(await totals()).toEqual([6000, 3900, 2100]);
    expect(await toPay()).toBe(650);

    const gasto = await repo.createRecord(newOperationKey(), ctx, 'despesa', input(80));
    expect(await totals()).toEqual([6000, 3980, 2020]);

    const editado = await repo.updateRecord(newOperationKey(), gasto.id, gasto.version, input(95));
    expect(editado.id).toBe(gasto.id);
    expect(editado.version).toBe(gasto.version + 1);
    expect(await totals()).toEqual([6000, 3995, 2005]);

    await repo.deleteRecord(newOperationKey(), gasto.id, editado.version);
    expect(await totals()).toEqual([6000, 3900, 2100]);

    const renda = await repo.createRecord(newOperationKey(), ctx, 'receita', input(200, '2026-10-07', 'Freelance'));
    expect(await totals()).toEqual([6200, 3900, 2300]);

    const rendaEditada = await repo.updateRecord(newOperationKey(), renda.id, renda.version, input(250, '2026-10-07', 'Freelance'));
    expect(await totals()).toEqual([6250, 3900, 2350]);

    await repo.deleteRecord(newOperationKey(), renda.id, rendaEditada.version);
    expect(await totals()).toEqual([6000, 3900, 2100]);
    expect(await toPay()).toBe(650);
  });

  it('a composição soma exatamente o total', async () => {
    const { repo, ctx } = await setup();
    const s = summarizeMonth(await repo.listRecords(ctx, OCT), ctx, OCT);
    const total = (xs: { amountCents: number }[]) => xs.reduce((a, r) => a + r.amountCents, 0);
    expect(total(s.composition.paid)).toBe(s.paidCents);
    expect(total(s.composition.received)).toBe(s.receivedCents);
  });

  it('gasto de 30/09 não entra em outubro; mover para outubro atualiza os dois meses', async () => {
    const { repo, ctx, totals, input } = await setup();
    const before = await totals('2026-09');
    const r = await repo.createRecord(newOperationKey(), ctx, 'despesa', input(80, '2026-09-30'));
    expect(await totals()).toEqual([6000, 3900, 2100]);
    expect((await totals('2026-09'))[1]).toBe(before[1]! + 80);
    await repo.updateRecord(newOperationKey(), r.id, r.version, input(80, '2026-10-01'));
    expect(await totals('2026-09')).toEqual(before);
    expect(await totals()).toEqual([6000, 3980, 2020]);
  });
});

describe('duplicidade, versões e falhas', () => {
  it('mesma operação enviada duas vezes cria um único registro', async () => {
    const { repo, ctx, totals, input } = await setup();
    const key = newOperationKey();
    const a = await repo.createRecord(key, ctx, 'despesa', input(80));
    const b = await repo.createRecord(key, ctx, 'despesa', input(80));
    expect(b.id).toBe(a.id);
    expect(await totals()).toEqual([6000, 3980, 2020]);
  });

  it('timeout depois de gravar + nova tentativa com a mesma chave: um único registro', async () => {
    const { repo, ctx, totals, input } = await setup();
    const key = newOperationKey();
    repo.failNextWrite = 'depois';
    await expect(repo.createRecord(key, ctx, 'despesa', input(80))).rejects.toMatchObject({ code: 'rede' });
    expect(await repo.findOperation(key)).not.toBeNull(); // reconciliação antes de repetir
    await repo.createRecord(key, ctx, 'despesa', input(80));
    expect(await totals()).toEqual([6000, 3980, 2020]);
  });

  it('falha antes de gravar não altera nada e a operação não existe', async () => {
    const { repo, ctx, totals, input } = await setup();
    const key = newOperationKey();
    repo.failNextWrite = 'antes';
    await expect(repo.createRecord(key, ctx, 'despesa', input(80))).rejects.toMatchObject({ code: 'rede' });
    expect(await repo.findOperation(key)).toBeNull();
    expect(await totals()).toEqual([6000, 3900, 2100]);
  });

  it('reutilizar a chave com outro conteúdo é recusado', async () => {
    const { repo, ctx, input } = await setup();
    const key = newOperationKey();
    await repo.createRecord(key, ctx, 'despesa', input(80));
    await expect(repo.createRecord(key, ctx, 'despesa', input(81))).rejects.toMatchObject({ code: 'chave_reutilizada' });
  });

  it('edição com versão antiga não sobrescreve a alteração de outro aparelho', async () => {
    const { repo, ctx, totals, input } = await setup();
    const r = await repo.createRecord(newOperationKey(), ctx, 'despesa', input(80));
    repo.simulateRemoteEdit(r.id, { amountCents: 9000 });
    await expect(repo.updateRecord(newOperationKey(), r.id, r.version, input(95))).rejects.toMatchObject({
      code: 'versao_desatualizada',
    });
    expect((await repo.getRecord(r.id))!.amountCents).toBe(9000);
    expect(await totals()).toEqual([6000, 3990, 2010]);
  });

  it('excluir muda o total uma única vez, e registro excluído não pode ser editado', async () => {
    const { repo, ctx, totals, input } = await setup();
    const r = await repo.createRecord(newOperationKey(), ctx, 'despesa', input(80));
    const key = newOperationKey();
    const del = await repo.deleteRecord(key, r.id, r.version);
    await repo.deleteRecord(key, r.id, r.version); // repetição da mesma operação
    expect(await totals()).toEqual([6000, 3900, 2100]);
    expect(await repo.getRecord(r.id)).toBeNull();
    await expect(repo.updateRecord(newOperationKey(), r.id, del.version, input(1))).rejects.toMatchObject({ code: 'nao_encontrado' });
  });

  it('descrição com < e > é guardada como texto', async () => {
    const { repo, ctx, input } = await setup();
    const r = await repo.createRecord(newOperationKey(), ctx, 'despesa', input(1, '2026-10-07', '<b>café</b> & <script>'));
    expect((await repo.getRecord(r.id))!.description).toBe('<b>café</b> & <script>');
  });

  it('o repositório também valida (não confia só no formulário)', async () => {
    const { repo, ctx, input } = await setup();
    await expect(repo.createRecord(newOperationKey(), ctx, 'despesa', input(80, '2026-10-08'))).rejects.toMatchObject({ code: 'data_futura' });
    await expect(repo.createRecord(newOperationKey(), ctx, 'despesa', input(10_000_000))).rejects.toMatchObject({
      code: 'valor_acima_do_limite',
    });
    await expect(repo.createRecord(newOperationKey(), 'outro-contexto', 'despesa', input(80))).rejects.toMatchObject({
      code: 'sem_permissao',
    });
  });

  it('falha de leitura é erro, não zero', async () => {
    const { repo, ctx } = await setup();
    repo.failNextRead = true;
    const err = await repo.listRecords(ctx, OCT).catch((e) => e);
    expect(isRepoError(err, 'rede')).toBe(true);
  });
});

describe('primeira conta (CL C001)', () => {
  it('conta nova começa vazia e o espaço pessoal é criado uma única vez', async () => {
    const repo = new MemoryRepository({ actorId: 'p1', displayName: 'Ana', today: () => DEMO_TODAY });
    expect(await repo.getSpace()).toBeNull();
    const a = await repo.ensurePersonalSpace('Conta principal');
    const b = await repo.ensurePersonalSpace('Outro nome');
    expect(b.personalContextId).toBe(a.personalContextId);
    expect(b.accounts).toHaveLength(1);
    expect(b.accounts[0]!.name).toBe('Conta principal');
    expect(b.accounts[0]!.initialBalanceCents).toBeNull(); // desconhecido, não zero
    expect(await repo.listRecords(a.personalContextId, OCT)).toEqual([]);
    expect(await repo.listCommitments(a.personalContextId, OCT)).toEqual([]);
  });

  it('nome da conta é validado', async () => {
    const repo = new MemoryRepository({ actorId: 'p1', displayName: 'Ana', today: () => DEMO_TODAY });
    await expect(repo.ensurePersonalSpace('   ')).rejects.toMatchObject({ code: 'nome_da_conta_invalido' });
  });
});
