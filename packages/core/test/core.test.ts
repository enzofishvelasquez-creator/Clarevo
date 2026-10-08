import { describe, expect, it } from 'vitest';
import {
  COMMITMENT_ERROR_TEXT,
  DEMO_TODAY,
  PAYMENT_ERROR_TEXT,
  addDays,
  addMonthsToDate,
  addYearsClamped,
  commitmentSituation,
  daysBetween,
  dueDateBounds,
  dueText,
  fieldForErrorCode,
  findNextMonthCommitment,
  formatDateTimeBR,
  formatDayHeader,
  formatDayMonth,
  formatMonthName,
  maskDateBR,
  ERROR_TEXT,
  MemoryRepository,
  centsToInput,
  createDemoRepository,
  formatBRL,
  formatDateBR,
  isRepoError,
  newOperationKey,
  nextMonthPrefill,
  parseBRL,
  parseDateBR,
  summarizeMonth,
  summarizeToPay,
  toPayCaption,
  todayIn,
  validateCommitmentDraft,
  validatePaymentDraft,
  validateRecordDraft,
  type Commitment,
  type CommitmentDraft,
  type PaymentDraft,
  type RecordDraft,
} from '../src';

const OCT = '2026-10';
const SEP = '2026-09';
const NOV = '2026-11';

async function setup() {
  const repo = await createDemoRepository();
  const space = (await repo.getSpace())!;
  const ctx = space.personalContextId;
  const accountId = space.accounts[0]!.id;
  const totals = async (month = OCT) => {
    const s = summarizeMonth(await repo.listRecords(ctx, month), ctx, month);
    return [s.receivedCents / 100, s.paidCents / 100, s.differenceCents / 100];
  };
  /** "Ainda a pagar" do mês, em reais, pela mesma regra do card. */
  const toPay = async (month = OCT) => summarizeToPay(await repo.listCommitments(ctx, month), ctx, month, DEMO_TODAY).toPayCents / 100;
  const input = (reais: number, occurredOn = '2026-10-07', description = 'Café') => ({
    accountId,
    amountCents: Math.round(reais * 100),
    occurredOn,
    description,
    category: null,
  });
  /** Conta a pagar da demonstração pela descrição (estado atual). */
  const bill = async (description: string) => (await repo.listCommitments(ctx, OCT)).find((c) => c.description === description)!;
  const payment = (reais: number, paidOn = '2026-10-07') => ({ accountId, amountCents: Math.round(reais * 100), paidOn, category: 'Moradia' });
  const note = (description: string, reais: number, dueOn: string) =>
    repo.createCommitment(newOperationKey(), ctx, { description, amountCents: Math.round(reais * 100), dueOn, category: null });
  return { repo, ctx, accountId, totals, toPay, input, bill, payment, note };
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
    const { repo, ctx, totals, toPay, input } = await setup();

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
    const commitments = await repo.listCommitments(a.personalContextId, OCT);
    expect(commitments).toEqual([]); // conta nova nunca recebe dados de exemplo
    const s = summarizeToPay(commitments, a.personalContextId, OCT, DEMO_TODAY);
    expect(s.toPayCents).toBe(0);
    expect(s.hasAny).toBe(false);
    expect(toPayCaption(s, DEMO_TODAY)).toEqual({ main: null, overdue: null, includes: null });
  });

  it('nome da conta é validado', async () => {
    const repo = new MemoryRepository({ actorId: 'p1', displayName: 'Ana', today: () => DEMO_TODAY });
    await expect(repo.ensurePersonalSpace('   ')).rejects.toMatchObject({ code: 'nome_da_conta_invalido' });
  });
});

/** Conta a pagar avulsa para as funções puras (sem repositório). */
const commitment = (over: Partial<Commitment> = {}): Commitment => ({
  id: 'cp-1',
  contextId: 'ctx',
  description: 'Internet',
  amountCents: 15000,
  currency: 'BRL',
  dueOn: '2026-10-15',
  category: 'Moradia',
  status: 'aberto',
  payment: null,
  createdBy: 'pessoa',
  version: 1,
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: '2026-10-01T12:00:00.000Z',
  ...over,
});
const paidCommitment = (dueOn: string, paidOn: string, over: Partial<Commitment> = {}) =>
  commitment({ dueOn, status: 'quitado', payment: { recordId: 'reg-1', amountCents: 15000, paidOn, accountId: 'conta-1' }, ...over });

describe('contas a pagar', () => {
  describe('regras puras', () => {
    it('1. datas: anos e meses limitados ao fim do mês, dias civis e dia/mês', () => {
      expect(addYearsClamped('2028-02-29', -1)).toBe('2027-02-28');
      expect(addYearsClamped('2028-02-29', 2)).toBe('2030-02-28');
      expect(addYearsClamped('2026-10-07', -1)).toBe('2025-10-07');
      expect(addMonthsToDate('2026-01-31', 1)).toBe('2026-02-28');
      expect(addMonthsToDate('2026-12-10', 1)).toBe('2027-01-10');
      expect(addMonthsToDate('2026-10-05', 1)).toBe('2026-11-05');
      expect(addMonthsToDate('2028-01-31', 1)).toBe('2028-02-29');
      expect(daysBetween('2026-10-07', '2026-10-10')).toBe(3);
      expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
      expect(daysBetween('2026-10-07', '2026-10-05')).toBe(-2);
      expect(formatDayMonth('2026-10-15')).toBe('15/10');
      expect(formatMonthName('2026-10')).toBe('outubro');
      expect(formatMonthName('2026-03')).toBe('março');
    });

    describe('2. validateCommitmentDraft', () => {
      const draft = (over: Partial<CommitmentDraft> = {}): CommitmentDraft => ({
        description: 'Internet',
        amountText: '150,00',
        dateText: '15/10/2026',
        category: 'Moradia',
        ...over,
      });
      const dateError = (dateText: string, today = DEMO_TODAY, originalDueOn?: string) => {
        const v = validateCommitmentDraft(draft({ dateText }), today, { originalDueOn });
        return v.ok ? null : v.errors.dateText;
      };

      it('rascunho vazio mostra os textos de conta a pagar', () => {
        const v = validateCommitmentDraft({ description: '', amountText: '', dateText: '', category: null }, DEMO_TODAY);
        expect(v.ok).toBe(false);
        if (!v.ok) {
          expect(v.errors.description).toBe('Dê um nome para esta conta a pagar.');
          expect(v.errors.amountText).toBe('Informe um valor maior que zero, como 80,00.');
          expect(v.errors.dateText).toBe('Confira a data informada.');
          expect(v.errors.accountId).toBeUndefined();
        }
      });

      it('data impossível e valor acima do limite', () => {
        expect(dateError('31/09/2026')).toBe('Confira a data informada.');
        const v = validateCommitmentDraft(draft({ amountText: '10.000.000,00' }), DEMO_TODAY);
        expect(v.ok ? null : v.errors.amountText).toBe('O valor máximo por conta a pagar é R$ 9.999.999,99.');
      });

      it('janela de vencimento: de 1 ano antes a 2 anos depois de hoje', () => {
        const fora = 'Use um vencimento entre 1 ano atrás e 2 anos à frente.';
        expect(dateError('07/10/2025')).toBeNull();
        expect(dateError('07/10/2028')).toBeNull();
        expect(dateError('06/10/2025')).toBe(fora);
        expect(dateError('08/10/2028')).toBe(fora);
        expect(dateError('05/10/2026')).toBeNull(); // vencida é aceita
        expect(dueDateBounds('2028-02-29')).toEqual({ min: '2027-02-28', max: '2030-02-28' });
        expect(dateError('28/02/2027', '2028-02-29')).toBeNull();
        expect(dateError('28/02/2030', '2028-02-29')).toBeNull();
        expect(dateError('27/02/2027', '2028-02-29')).toBe(fora);
        expect(dateError('01/03/2030', '2028-02-29')).toBe(fora);
      });

      it('na edição, vencimento antigo que não mudou continua aceito', () => {
        expect(dateError('10/01/2025', DEMO_TODAY, '2025-01-10')).toBeNull();
        expect(dateError('11/01/2025', DEMO_TODAY, '2025-01-10')).toBe(COMMITMENT_ERROR_TEXT.vencimento_fora_do_intervalo);
      });

      it('descrição: emoji conta 1, máximo 80, aparada', () => {
        expect(validateCommitmentDraft(draft({ description: '💡'.repeat(80) }), DEMO_TODAY).ok).toBe(true);
        const v = validateCommitmentDraft(draft({ description: '💡'.repeat(81) }), DEMO_TODAY);
        expect(v.ok ? null : v.errors.description).toBe(ERROR_TEXT.descricao_longa);
        expect(validateCommitmentDraft(draft({ description: '  Luz  ', amountText: '90', category: ' ' }), DEMO_TODAY)).toEqual({
          ok: true,
          input: { description: 'Luz', amountCents: 9000, dueOn: '2026-10-15', category: null },
        });
      });

      it('textos de registro não mudam; erro do servidor vai para o campo do vencimento', () => {
        expect(ERROR_TEXT.descricao_obrigatoria).toBe('Dê um nome para este registro.');
        expect(COMMITMENT_ERROR_TEXT.data_invalida).toBe(ERROR_TEXT.data_invalida);
        expect(COMMITMENT_ERROR_TEXT.nao_encontrado).toBe('Esta conta a pagar não está mais disponível.');
        expect(fieldForErrorCode('vencimento_fora_do_intervalo')).toBe('dateText');
      });
    });

    it('3. validatePaymentDraft', () => {
      const draft = (over: Partial<PaymentDraft> = {}): PaymentDraft => ({
        accountId: 'conta-1',
        amountText: '155,00',
        dateText: '07/10/2026',
        category: 'Moradia',
        ...over,
      });
      expect(validatePaymentDraft(draft(), DEMO_TODAY)).toEqual({
        ok: true,
        input: { accountId: 'conta-1', amountCents: 15500, paidOn: '2026-10-07', category: 'Moradia' },
      });
      const v = validatePaymentDraft(draft({ dateText: '08/10/2026', amountText: '0', accountId: '' }), DEMO_TODAY);
      expect(v.ok).toBe(false);
      if (!v.ok) {
        expect(v.errors.dateText).toBe('Use uma data até hoje. A conta só é marcada como paga depois do pagamento.');
        expect(v.errors.amountText).toBe(PAYMENT_ERROR_TEXT.valor_invalido);
        expect(v.errors.accountId).toBe('Escolha a conta usada no pagamento.');
      }
      const antiga = validatePaymentDraft(draft({ dateText: '30/02/2026' }), DEMO_TODAY);
      expect(antiga.ok ? null : antiga.errors.dateText).toBe('Confira a data informada.');
      // Pagamento antes ou depois do vencimento é aceito; só a data futura é recusada.
      expect(validatePaymentDraft(draft({ dateText: '30/09/2026' }), DEMO_TODAY).ok).toBe(true);
    });

    it.each([
      [commitment({ dueOn: '2026-10-07' }), 'vence_hoje', 'Vence hoje'],
      [commitment({ dueOn: '2026-10-08' }), 'a_vencer', 'Vence amanhã'],
      [commitment({ dueOn: '2026-10-09' }), 'a_vencer', 'Vence em 2 dias · 09/10'],
      [commitment({ dueOn: '2026-10-10' }), 'a_vencer', 'Vence em 3 dias · 10/10'],
      [commitment({ dueOn: '2026-10-14' }), 'a_vencer', 'Vence em 7 dias · 14/10'],
      [commitment({ dueOn: '2026-10-15' }), 'a_vencer', 'Vence em 15/10/2026'],
      [commitment({ dueOn: '2026-10-05' }), 'vencida', 'Venceu em 05/10/2026'],
      [paidCommitment('2026-10-15', '2026-10-01'), 'paga', 'Paga em 01/10/2026'],
      [paidCommitment('2026-10-05', '2026-10-07'), 'paga', 'Paga em 07/10/2026'],
    ] as const)('4. situação e texto: %#', (c, situation, text) => {
      expect(commitmentSituation(c, DEMO_TODAY)).toBe(situation);
      expect(dueText(c, DEMO_TODAY)).toBe(text);
    });

    it('5. summarizeToPay: separa vencidas, a vencer, pagas e próximos meses, em ordem de vencimento', () => {
      const list = [
        commitment({ id: 'c', description: 'Condomínio', amountCents: 50000, dueOn: '2026-10-20' }),
        paidCommitment('2026-10-10', '2026-10-07', { id: 'p', description: 'Luz' }),
        commitment({ id: 's', description: 'Seguro do carro', amountCents: 30000, dueOn: '2026-11-10' }),
        commitment({ id: 'b', description: 'Água', amountCents: 9000, dueOn: '2026-10-05', createdAt: '2026-10-02T00:00:00.000Z' }),
        commitment({ id: 'a', description: 'Feira', amountCents: 2000, dueOn: '2026-10-05', createdAt: '2026-10-02T00:00:00.000Z' }),
        commitment({ id: 'g', description: 'Gás', amountCents: 4000, dueOn: '2026-09-28' }),
        commitment({ id: 'x', contextId: 'outro', description: 'De outro contexto', dueOn: '2026-10-12' }),
        commitment({ id: 'i', description: 'Internet', dueOn: '2026-10-15' }),
      ];
      const s = summarizeToPay(list, 'ctx', OCT, DEMO_TODAY);
      const names = (xs: Commitment[]) => xs.map((c) => c.description);
      expect(s.isCurrentMonth).toBe(true);
      expect(names(s.items)).toEqual(['Gás', 'Feira', 'Água', 'Internet', 'Condomínio']);
      expect(s.toPayCents).toBe(4000 + 2000 + 9000 + 15000 + 50000);
      expect(s.dueInMonthCents).toBe(2000 + 9000 + 15000 + 50000);
      expect(s.overdueBeforeCents).toBe(4000);
      expect(names(s.overdue)).toEqual(['Gás', 'Feira', 'Água']);
      expect(s.overdueCount).toBe(3);
      expect(names(s.upcomingInMonth)).toEqual(['Internet', 'Condomínio']);
      expect(s.nextDue?.description).toBe('Internet');
      expect(names(s.paidInMonth)).toEqual(['Luz']);
      expect(names(s.later)).toEqual(['Seguro do carro']);
      expect(s.hasAny).toBe(true);

      const sep = summarizeToPay(list, 'ctx', SEP, DEMO_TODAY);
      expect(sep.isCurrentMonth).toBe(false);
      expect(names(sep.items)).toEqual(['Gás']);
      expect(sep.toPayCents).toBe(4000);
      expect(sep.overdueBeforeCents).toBe(0);
      expect(sep.later).toEqual([]);
    });

    describe('6. toPayCaption', () => {
      const caption = (list: Commitment[], month = OCT) => toPayCaption(summarizeToPay(list, 'ctx', month, DEMO_TODAY), DEMO_TODAY);
      const internet = commitment({ id: 'i' });
      const condominio = commitment({ id: 'c', description: 'Condomínio', amountCents: 50000, dueOn: '2026-10-20' });
      const agua = commitment({ id: 'a', description: 'Água', amountCents: 9000, dueOn: '2026-10-05' });
      const gas = commitment({ id: 'g', description: 'Gás', amountCents: 4000, dueOn: '2026-09-28' });

      it('dois ou mais itens com próxima', () => {
        expect(caption([internet, condominio])).toEqual({ main: '2 contas · próxima: Internet, 15/10', overdue: null, includes: null });
        expect(caption([internet, condominio, agua])).toEqual({
          main: '3 contas · próxima: Internet, 15/10',
          overdue: '1 conta vencida',
          includes: null,
        });
        expect(caption([internet, condominio, agua, gas])).toEqual({
          main: '4 contas · próxima: Internet, 15/10',
          overdue: '2 contas vencidas',
          includes: 'Inclui R$ 40,00 de contas vencidas antes de outubro.',
        });
        expect(caption([commitment({ dueOn: '2026-10-07' }), condominio]).main).toBe('2 contas · próxima: Internet, hoje');
        expect(caption([commitment({ dueOn: '2026-10-08' }), condominio]).main).toBe('2 contas · próxima: Internet, amanhã');
      });

      it('um item', () => {
        expect(caption([internet]).main).toBe('Internet · vence em 15/10');
        expect(caption([commitment({ dueOn: '2026-10-07' })]).main).toBe('Internet · vence hoje');
        expect(caption([commitment({ dueOn: '2026-10-08' })]).main).toBe('Internet · vence amanhã');
        expect(caption([commitment({ dueOn: '2026-10-05' })])).toEqual({ main: 'Internet · venceu em 05/10', overdue: null, includes: null });
      });

      it('todos vencidos, mês passado e sem itens', () => {
        expect(caption([agua, gas])).toEqual({
          main: '2 contas vencidas',
          overdue: null,
          includes: 'Inclui R$ 40,00 de contas vencidas antes de outubro.',
        });
        expect(caption([internet, gas], SEP)).toEqual({ main: '1 conta em aberto', overdue: null, includes: null });
        expect(caption([gas, commitment({ id: 'g2', dueOn: '2026-09-10' })], SEP).main).toBe('2 contas em aberto');
        expect(caption([paidCommitment('2026-10-10', '2026-10-07')])).toEqual({ main: null, overdue: null, includes: null });
      });
    });

    it('7. nextMonthPrefill e findNextMonthCommitment', () => {
      const internet = paidCommitment('2026-10-15', '2026-10-07');
      expect(nextMonthPrefill(internet)).toEqual({ description: 'Internet', amountCents: 15000, dueOn: '2026-11-15', category: 'Moradia' });
      expect(nextMonthPrefill(commitment({ dueOn: '2026-01-31' })).dueOn).toBe('2026-02-28');

      const next = commitment({ id: 'cp-2', description: 'internet ', dueOn: '2026-11-15' });
      expect(findNextMonthCommitment([internet, next], internet)?.id).toBe('cp-2');
      expect(findNextMonthCommitment([internet], internet)).toBeNull();
      expect(findNextMonthCommitment([internet, { ...next, dueOn: '2026-11-16' }], internet)).toBeNull();
      expect(findNextMonthCommitment([internet, { ...next, description: 'Internet fibra' }], internet)).toBeNull();
      expect(findNextMonthCommitment([internet, paidCommitment('2026-11-15', '2026-10-07', { id: 'cp-3' })], internet)).toBeNull();
    });
  });

  describe('repositório', () => {
    it('8. sequência de aceite estendida (2.7), com Recebido, Pago e Diferença sem contar contas a pagar', async () => {
      const { repo, totals, toPay, bill, payment, note } = await setup();
      const step = async (expected: number[], aPagar: number, setembroAPagar = 0) => {
        repo.checkInvariants();
        expect(await totals()).toEqual(expected);
        expect(await toPay()).toBe(aPagar);
        expect((await totals(SEP))[1]).toBe(3750);
        expect(await toPay(SEP)).toBe(setembroAPagar);
      };
      const base = [6000, 3900, 2100];
      await step(base, 650);

      const agua = await note('Água', 90, '2026-10-05');
      await step(base, 740);

      const gas = await note('Gás', 40, '2026-09-28');
      await step(base, 780, 40);
      expect(summarizeToPay(await repo.listCommitments(gas.commitment.contextId, OCT), gas.commitment.contextId, OCT, DEMO_TODAY)).toMatchObject({
        overdueBeforeCents: 4000,
        dueInMonthCents: 74000,
      });

      const internet = await bill('Internet');
      const key = newOperationKey();
      const paid = await repo.payCommitment(key, internet.id, internet.version, payment(155));
      await step([6000, 4055, 1945], 630, 40);

      const again = await repo.payCommitment(key, internet.id, internet.version, payment(155));
      expect(again.record.id).toBe(paid.record.id);
      await step([6000, 4055, 1945], 630, 40);

      const undone = await repo.undoCommitmentPayment(newOperationKey(), internet.id, paid.commitment.version);
      await step(base, 780, 40);

      const paid2 = await repo.payCommitment(newOperationKey(), internet.id, undone.commitment.version, payment(150));
      await step([6000, 4050, 1950], 630, 40);

      const next = await repo.createCommitment(newOperationKey(), internet.contextId, nextMonthPrefill(paid2.commitment));
      expect(next.commitment.dueOn).toBe('2026-11-15');
      expect(findNextMonthCommitment(await repo.listCommitments(internet.contextId, OCT), paid2.commitment)?.id).toBe(next.commitment.id);
      await step([6000, 4050, 1950], 630, 40);

      await repo.deleteRecord(newOperationKey(), paid2.record.id, paid2.record.version);
      await step(base, 780, 40);

      for (const c of [agua.commitment, gas.commitment, next.commitment]) {
        await repo.deleteCommitment(newOperationKey(), c.id, (await repo.getCommitment(c.id))!.version);
      }
      await step(base, 650);
    });

    it('9. pagamento idempotente: resposta perdida e falha antes de gravar', async () => {
      const { repo, totals, bill, payment } = await setup();
      const internet = await bill('Internet');
      const key = newOperationKey();
      repo.failNextWrite = 'depois';
      await expect(repo.payCommitment(key, internet.id, internet.version, payment(150))).rejects.toMatchObject({ code: 'rede' });
      const op = await repo.findCommitmentOperation(key);
      expect(op).toEqual({ action: 'pagar_compromisso', commitmentId: internet.id, recordId: expect.any(String) });
      const retry = await repo.payCommitment(key, internet.id, internet.version, payment(150));
      expect(retry.record.id).toBe(op!.recordId);
      expect(await totals()).toEqual([6000, 4050, 1950]);
      repo.checkInvariants();

      const condominio = await bill('Condomínio');
      const key2 = newOperationKey();
      repo.failNextWrite = 'antes';
      await expect(repo.payCommitment(key2, condominio.id, condominio.version, payment(500))).rejects.toMatchObject({ code: 'rede' });
      expect(await repo.findCommitmentOperation(key2)).toBeNull();
      expect(await repo.getCommitment(condominio.id)).toEqual(condominio);
      expect(await totals()).toEqual([6000, 4050, 1950]);
    });

    it('10. segundo pagamento: versão antiga e conta já paga', async () => {
      const { repo, bill, payment } = await setup();
      const internet = await bill('Internet');
      const paid = await repo.payCommitment(newOperationKey(), internet.id, internet.version, payment(150));
      await expect(repo.payCommitment(newOperationKey(), internet.id, internet.version, payment(150))).rejects.toMatchObject({
        code: 'versao_desatualizada',
      });
      await expect(repo.payCommitment(newOperationKey(), internet.id, paid.commitment.version, payment(150))).rejects.toMatchObject({
        code: 'compromisso_quitado',
      });
      await expect(repo.payCommitment(newOperationKey(), internet.id, null as unknown as number, payment(150))).rejects.toMatchObject({
        code: 'versao_desatualizada',
      });
      repo.checkInvariants();
    });

    it('11. chave reutilizada entre operações e conteúdos', async () => {
      const { repo, ctx, bill, payment, input } = await setup();
      const internet = await bill('Internet');
      const key = newOperationKey();
      await repo.payCommitment(key, internet.id, internet.version, payment(150));
      await expect(repo.payCommitment(key, internet.id, internet.version, payment(151))).rejects.toMatchObject({ code: 'chave_reutilizada' });
      expect(await repo.findOperation(key)).toBeNull();
      await expect(repo.createRecord(key, ctx, 'despesa', input(150))).rejects.toMatchObject({ code: 'chave_reutilizada' });

      const condominio = await bill('Condomínio');
      const recordKey = newOperationKey();
      await repo.createRecord(recordKey, ctx, 'despesa', input(80));
      await expect(repo.payCommitment(recordKey, condominio.id, condominio.version, payment(500))).rejects.toMatchObject({
        code: 'chave_reutilizada',
      });
      expect(await repo.findCommitmentOperation(recordKey)).toBeNull();
      repo.checkInvariants();
    });

    it('12. valor pago diferente do previsto: o previsto não muda', async () => {
      const { repo, accountId, bill, payment } = await setup();
      const internet = await bill('Internet');
      const { commitment: c, record } = await repo.payCommitment(newOperationKey(), internet.id, internet.version, payment(155));
      expect(record).toMatchObject({
        kind: 'despesa',
        amountCents: 15500,
        occurredOn: '2026-10-07',
        description: 'Internet',
        category: 'Moradia',
        commitmentId: internet.id,
        version: 1,
      });
      expect(c).toMatchObject({ status: 'quitado', amountCents: 15000, version: internet.version + 1 });
      expect(c.payment).toEqual({ recordId: record.id, amountCents: 15500, paidOn: '2026-10-07', accountId });
      expect(await repo.getCommitment(internet.id)).toEqual(c);
      expect((await repo.getRecord(record.id))!.commitmentId).toBe(internet.id);
    });

    it('13. pagamento adiantado entra em Pago do mês da data do pagamento', async () => {
      const { repo, totals, toPay, bill, payment } = await setup();
      const internet = await bill('Internet');
      await repo.payCommitment(newOperationKey(), internet.id, internet.version, payment(150, '2026-09-30'));
      expect((await totals(SEP))[1]).toBe(3900);
      expect(await totals()).toEqual([6000, 3900, 2100]);
      expect(await toPay()).toBe(500);
      repo.checkInvariants();
    });

    it.each([
      ['data_futura', { paidOn: '2026-10-08' }],
      ['conta_invalida', { accountId: 'conta-de-outro-contexto' }],
      ['valor_acima_do_limite', { amountCents: 1_000_000_000 }],
      ['valor_invalido', { amountCents: 0 }],
      ['categoria_invalida', { category: 'x'.repeat(41) }],
    ])('14. recusa atômica: %s não grava nada', async (code, over) => {
      const { repo, ctx, totals, bill, payment } = await setup();
      const internet = await bill('Internet');
      const records = (await repo.listRecords(ctx, OCT)).length;
      const key = newOperationKey();
      await expect(repo.payCommitment(key, internet.id, internet.version, { ...payment(150), ...over })).rejects.toMatchObject({ code });
      expect(await repo.getCommitment(internet.id)).toEqual(internet);
      expect(await repo.listRecords(ctx, OCT)).toHaveLength(records);
      expect(await repo.findCommitmentOperation(key)).toBeNull();
      expect(await totals()).toEqual([6000, 3900, 2100]);
      // A mesma chave com conteúdo válido passa: nada ficou gravado.
      await repo.payCommitment(key, internet.id, internet.version, payment(150));
      repo.checkInvariants();
    });

    it('15. desfazer o pagamento exclui o gasto e reabre a conta', async () => {
      const { repo, totals, toPay, bill, payment } = await setup();
      const internet = await bill('Internet');
      const paid = await repo.payCommitment(newOperationKey(), internet.id, internet.version, payment(155));
      const key = newOperationKey();
      const undone = await repo.undoCommitmentPayment(key, internet.id, paid.commitment.version);
      expect(undone.commitment).toMatchObject({ status: 'aberto', payment: null, version: paid.commitment.version + 1 });
      expect(undone.record).toMatchObject({ id: paid.record.id, commitmentId: internet.id, version: 2 }); // rastro
      expect(await repo.getRecord(paid.record.id)).toBeNull();
      expect(await totals()).toEqual([6000, 3900, 2100]);
      expect(await toPay()).toBe(650);

      expect(await repo.undoCommitmentPayment(key, internet.id, paid.commitment.version)).toEqual(undone);
      await expect(repo.undoCommitmentPayment(newOperationKey(), internet.id, undone.commitment.version)).rejects.toMatchObject({
        code: 'compromisso_aberto',
      });
      repo.checkInvariants();
    });

    it('16. gasto da conta a pagar: excluir reabre; editar sobe a versão da conta', async () => {
      const { repo, totals, bill, payment } = await setup();
      const internet = await bill('Internet');
      const paid = await repo.payCommitment(newOperationKey(), internet.id, internet.version, payment(150));

      const edited = await repo.updateRecord(newOperationKey(), paid.record.id, paid.record.version, {
        accountId: paid.record.accountId,
        amountCents: 15800,
        occurredOn: '2026-10-06',
        description: 'Internet',
        category: 'Moradia',
      });
      expect(edited.commitmentId).toBe(internet.id);
      const afterEdit = (await repo.getCommitment(internet.id))!;
      expect(afterEdit).toMatchObject({ status: 'quitado', amountCents: 15000, version: paid.commitment.version + 1 });
      expect(afterEdit.payment).toMatchObject({ amountCents: 15800, paidOn: '2026-10-06' });
      expect(await totals()).toEqual([6000, 4058, 1942]);
      await expect(repo.undoCommitmentPayment(newOperationKey(), internet.id, paid.commitment.version)).rejects.toMatchObject({
        code: 'versao_desatualizada',
      });

      const key = newOperationKey();
      await repo.deleteRecord(key, edited.id, edited.version);
      await repo.deleteRecord(key, edited.id, edited.version); // repetição
      const reopened = (await repo.getCommitment(internet.id))!;
      expect(reopened).toMatchObject({ status: 'aberto', payment: null, version: afterEdit.version + 1 });
      expect(await totals()).toEqual([6000, 3900, 2100]);
      repo.checkInvariants();
    });

    it('17. conta paga não é editada nem excluída', async () => {
      const { repo, bill, payment } = await setup();
      const internet = await bill('Internet');
      const { commitment: c } = await repo.payCommitment(newOperationKey(), internet.id, internet.version, payment(150));
      const input = { description: 'Internet', amountCents: 16000, dueOn: '2026-10-15', category: null };
      await expect(repo.updateCommitment(newOperationKey(), c.id, c.version, input)).rejects.toMatchObject({ code: 'compromisso_quitado' });
      await expect(repo.deleteCommitment(newOperationKey(), c.id, c.version)).rejects.toMatchObject({ code: 'compromisso_quitado' });
      expect(await repo.getCommitment(c.id)).toEqual(c);
    });

    it('18. mudar o vencimento de mês move a conta entre os meses', async () => {
      const { repo, ctx, toPay, note } = await setup();
      const { commitment: agua } = await note('Água', 90, '2026-10-05');
      expect(await toPay()).toBe(740);
      const { commitment: moved } = await repo.updateCommitment(newOperationKey(), agua.id, agua.version, {
        description: 'Água',
        amountCents: 9000,
        dueOn: '2026-11-05',
        category: null,
      });
      expect(moved.version).toBe(agua.version + 1);
      expect(await toPay()).toBe(650);
      const nov = summarizeToPay(await repo.listCommitments(ctx, NOV), ctx, NOV, DEMO_TODAY);
      expect(nov.items.map((c) => c.description)).toEqual(['Água', 'Seguro do carro']);
      expect(nov.toPayCents).toBe(39000);
    });

    it('19. excluir tira a conta de tudo; versão antiga é recusada', async () => {
      const { repo, ctx, toPay, bill } = await setup();
      const internet = await bill('Internet');
      const deleted = await repo.deleteCommitment(newOperationKey(), internet.id, internet.version);
      expect(deleted.commitment.version).toBe(internet.version + 1);
      expect((await repo.listCommitments(ctx, OCT)).map((c) => c.description)).toEqual(['Condomínio', 'Seguro do carro']);
      expect(await repo.getCommitment(internet.id)).toBeNull();
      expect(await toPay()).toBe(500);
      const input = { description: 'Internet', amountCents: 15000, dueOn: '2026-10-15', category: null };
      await expect(repo.updateCommitment(newOperationKey(), internet.id, deleted.commitment.version, input)).rejects.toMatchObject({
        code: 'nao_encontrado',
      });

      const condominio = await bill('Condomínio');
      repo.simulateRemoteCommitmentEdit(condominio.id, { amountCents: 52000 });
      await expect(repo.deleteCommitment(newOperationKey(), condominio.id, condominio.version)).rejects.toMatchObject({
        code: 'versao_desatualizada',
      });
      expect((await repo.getCommitment(condominio.id))!.amountCents).toBe(52000);
      repo.checkInvariants();
    });

    it('20. falha de leitura de contas a pagar é erro, não zero', async () => {
      const { repo, ctx } = await setup();
      repo.failNextRead = true;
      const err = await repo.listCommitments(ctx, OCT).catch((e) => e);
      expect(isRepoError(err, 'rede')).toBe(true);
    });

    it('21. findCommitmentOperation reconcilia a criação; findOperation não a vê', async () => {
      const { repo, ctx } = await setup();
      const key = newOperationKey();
      const { commitment: c } = await repo.createCommitment(key, ctx, { description: 'Luz', amountCents: 12000, dueOn: '2026-10-25', category: null });
      expect(await repo.findCommitmentOperation(key)).toEqual({ action: 'criar_compromisso', commitmentId: c.id, recordId: null });
      expect(await repo.findOperation(key)).toBeNull();
      const again = await repo.createCommitment(key, ctx, { description: ' Luz ', amountCents: 12000, dueOn: '2026-10-25', category: null });
      expect(again.commitment.id).toBe(c.id);
      await expect(
        repo.createCommitment(key, ctx, { description: 'Luz', amountCents: 12001, dueOn: '2026-10-25', category: null }),
      ).rejects.toMatchObject({ code: 'chave_reutilizada' });
    });

    it('o repositório também valida contas a pagar (não confia só no formulário)', async () => {
      const { repo, ctx, bill } = await setup();
      const create = (over: object) =>
        repo.createCommitment(newOperationKey(), ctx, { description: 'Luz', amountCents: 12000, dueOn: '2026-10-25', category: null, ...over });
      await expect(create({ dueOn: '2028-10-08' })).rejects.toMatchObject({ code: 'vencimento_fora_do_intervalo' });
      await expect(create({ dueOn: '2025-10-06' })).rejects.toMatchObject({ code: 'vencimento_fora_do_intervalo' });
      await expect(create({ dueOn: '2026-09-31' })).rejects.toMatchObject({ code: 'data_invalida' });
      await expect(create({ description: ' \t ' })).rejects.toMatchObject({ code: 'descricao_obrigatoria' });
      await expect(create({ amountCents: 0 })).rejects.toMatchObject({ code: 'valor_invalido' });
      await expect(create({ category: 'x'.repeat(41) })).rejects.toMatchObject({ code: 'categoria_invalida' });
      await expect(
        repo.createCommitment(newOperationKey(), 'outro-contexto', { description: 'Luz', amountCents: 1, dueOn: '2026-10-25', category: null }),
      ).rejects.toMatchObject({ code: 'sem_permissao' });
      expect(await create({ dueOn: '2025-10-07', description: '  Luz antiga  ' })).toMatchObject({
        commitment: { description: 'Luz antiga', status: 'aberto', version: 1, payment: null, createdBy: 'pessoa-demo' },
        record: null,
      });
      const internet = await bill('Internet');
      await expect(
        repo.updateCommitment(newOperationKey(), internet.id, internet.version, { ...internet, dueOn: '2028-10-08' }),
      ).rejects.toMatchObject({ code: 'vencimento_fora_do_intervalo' });
      repo.checkInvariants();
    });

    it('vencimento que não muda continua editável depois de sair da janela', async () => {
      let today = DEMO_TODAY;
      const repo = new MemoryRepository({ actorId: 'p1', displayName: 'Ana', today: () => today });
      const ctx = (await repo.ensurePersonalSpace('Conta principal')).personalContextId;
      const input = { description: 'Água', amountCents: 9000, dueOn: '2026-10-05', category: null };
      const { commitment: agua } = await repo.createCommitment(newOperationKey(), ctx, input);
      today = '2027-12-01';
      const edited = await repo.updateCommitment(newOperationKey(), agua.id, agua.version, { ...input, amountCents: 9500 });
      expect(edited.commitment).toMatchObject({ amountCents: 9500, dueOn: '2026-10-05', version: 2 });
      await expect(
        repo.updateCommitment(newOperationKey(), agua.id, edited.commitment.version, { ...input, dueOn: '2026-11-06' }),
      ).rejects.toMatchObject({ code: 'vencimento_fora_do_intervalo' });
    });

    it('22. demonstração: três contas a pagar em aberto, R$ 650 em outubro e nada em setembro', async () => {
      const { repo, ctx, toPay } = await setup();
      const list = await repo.listCommitments(ctx, OCT);
      expect(list.map((c) => [c.description, c.amountCents, c.dueOn, c.category, c.status, c.payment, c.version])).toEqual([
        ['Internet', 15000, '2026-10-15', 'Moradia', 'aberto', null, 1],
        ['Condomínio', 50000, '2026-10-20', 'Moradia', 'aberto', null, 1],
        ['Seguro do carro', 30000, '2026-11-10', 'Transporte', 'aberto', null, 1],
      ]);
      expect(await toPay()).toBe(650);
      expect(await toPay(SEP)).toBe(0);
      const s = summarizeToPay(list, ctx, OCT, DEMO_TODAY);
      expect(s.items.map((c) => c.description)).toEqual(['Internet', 'Condomínio']);
      expect(s.nextDue?.description).toBe('Internet');
      expect(s.later.map((c) => c.description)).toEqual(['Seguro do carro']);
      expect(s.overdueCount).toBe(0);
      expect(toPayCaption(s, DEMO_TODAY)).toEqual({ main: '2 contas · próxima: Internet, 15/10', overdue: null, includes: null });
      repo.checkInvariants();
    });
  });
});
