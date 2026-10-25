/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  APP_SCREENS,
  DEMO_TODAY,
  MemoryRepository,
  SEU_MES_CARD_IDS,
  SEU_MES_TEXT,
  SEU_MES_TOP,
  barModeFor,
  buildSeuMes,
  categoryBreakdown,
  createDemoRepository,
  isSeuMesMonth,
  loadInvoicesOfRecords,
  monthOf,
  parseBRL,
  plannedForGoals,
  savedInMonth,
  searchAppScreens,
  seuMesParams,
  seuMesRowA11y,
  seuMesStartMonth,
  seuMesStep,
  summarizeBudget,
  summarizeMonth,
  summarizeToPay,
  topicTabFor,
  type CategoryShare,
  type IsoMonth,
  type SeuMesCard,
  type SeuMesInput,
  type SeuMesView,
} from '../src';

/**
 * "Seu mês em 30 segundos" (D-052): as regras do core com a demonstração de outubro (Recebido 6.000, Pago 3.900, Diferença 2.100;
 * maiores categorias Moradia 2.500 e Mercado 1.400) e com casos montados à mão.
 */

async function readInput(repo: MemoryRepository, month: IsoMonth, today = DEMO_TODAY): Promise<SeuMesInput> {
  const ctx = (await repo.getSpace())!.personalContextId;
  const breakdownOf = async (m: IsoMonth) => {
    const summary = summarizeMonth(await repo.listRecords(ctx, m), ctx, m);
    return { summary, breakdown: categoryBreakdown(summary.composition.paid, await loadInvoicesOfRecords(repo, summary.composition.paid, today)) };
  };
  const [y, m] = month.split('-').map(Number);
  const previous = m === 1 ? `${y! - 1}-12` : `${y}-${String(m! - 1).padStart(2, '0')}`;
  const goals = await repo.listGoals(ctx);
  return {
    month,
    today,
    ...(({ summary, breakdown }) => ({ summary, breakdown }))(await breakdownOf(month)),
    previousBreakdown: (await breakdownOf(previous)).breakdown,
    toPay: summarizeToPay(await repo.listCommitments(ctx, month), ctx, month, today),
    budget: summarizeBudget(await repo.getMonthBudget(ctx, month)),
    goals: { count: goals.length, savedInMonthCents: savedInMonth(await repo.listGoalMovementsInMonth(ctx, month), month), plannedCents: plannedForGoals(goals) },
  };
}

const card = (view: SeuMesView, id: SeuMesCard['id']): SeuMesCard => view.cards.find((c) => c.id === id)!;
const rowsOf = (c: SeuMesCard) => c.rows.map((r) => [r.label, r.value, ...r.details]);

describe('Seu mês, demonstração de outubro (hoje é 07/10/2026)', () => {
  it('cinco cartões, nesta ordem', async () => {
    const view = buildSeuMes(await readInput(await createDemoRepository(), '2026-10'));
    expect(view.empty).toBeNull();
    expect(view.cards.map((c) => c.id)).toEqual(['entrou-saiu', 'para-onde-foi', 'o-que-vence', 'orcamento', 'metas']);
    expect(view.cards.map((c) => c.id)).toEqual([...SEU_MES_CARD_IDS]);
    expect(view.cards.map((c) => c.title)).toEqual(['Entrou e saiu', 'Para onde foi', 'O que ainda vence', 'Orçamento', 'Metas']);
  });

  it('1 Entrou e saiu: Recebido R$ 6.000,00, Pago R$ 3.900,00 e Diferença R$ 2.100,00, que não é saldo', async () => {
    const c = card(buildSeuMes(await readInput(await createDemoRepository(), '2026-10')), 'entrou-saiu');
    expect(rowsOf(c)).toEqual([
      ['Recebido', 'R$ 6.000,00'],
      ['Pago', 'R$ 3.900,00'],
      ['Diferença do mês', 'R$ 2.100,00', 'Recebido menos Pago · até 07/10'],
    ]);
    expect(c.rows[2]!.strong).toBe(true);
    expect(c.notes).toEqual(['A diferença do mês não é saldo da conta: é o que entrou menos o que foi pago.']);
    expect(c.action).toEqual({ label: 'Ver os registros do mês', href: '/composicao?tipo=diferenca', setsMonth: true });
  });

  it('2 Para onde foi: Moradia R$ 2.500,00 e Mercado R$ 1.400,00, com a comparação com setembro só como fato', async () => {
    const c = card(buildSeuMes(await readInput(await createDemoRepository(), '2026-10')), 'para-onde-foi');
    expect(rowsOf(c)).toEqual([
      ['Moradia', 'R$ 2.500,00', '64,1% do pago', 'Igual a setembro'],
      ['Mercado', 'R$ 1.400,00', '35,9% do pago', 'R$ 150,00 a mais que em setembro'],
    ]);
    expect(c.intro).toBe('As maiores categorias do que foi pago no mês.');
    expect(c.notes).toEqual(['Mostra o que foi pago. Compra no cartão entra quando a fatura é paga.']);
    expect(c.action).toEqual({ label: 'Ver Pago por categoria', href: '/composicao?tipo=pago&vista=categoria', setsMonth: true });
  });

  it('3 O que ainda vence: Ainda a pagar R$ 650,00 e as próximas contas, com a Internet em 15/10', async () => {
    const c = card(buildSeuMes(await readInput(await createDemoRepository(), '2026-10')), 'o-que-vence');
    expect(rowsOf(c)).toEqual([
      ['Ainda a pagar', 'R$ 650,00'],
      ['Internet', 'R$ 150,00', 'Vence 15/10'],
      ['Condomínio', 'R$ 500,00', 'Vence 20/10'],
    ]);
    expect(c.rows[0]!.strong).toBe(true);
    expect(c.notes).toEqual(['Valores previstos, separados do que já foi pago.']);
    expect(c.action).toEqual({ label: 'Ver contas a pagar', href: '/a-pagar' });
  });

  it('4 Orçamento: as categorias a 80% ou mais, da mais perto do orçado para a menos (Mercado, a 77,8%, fica de fora)', async () => {
    const c = card(buildSeuMes(await readInput(await createDemoRepository(), '2026-10')), 'orcamento');
    expect(rowsOf(c)).toEqual([
      ['Lazer', 'R$ 400,00', 'de R$ 300,00 orçados · 133,3%', 'R$ 100,00 acima do orçamento'],
      ['Moradia', 'R$ 2.500,00', 'de R$ 2.500,00 orçados · 100,0%', 'Orçamento usado por inteiro'],
    ]);
    expect(c.intro).toBe('Categorias que chegaram a 80% do orçamento ou mais.');
    expect(c.notes).toEqual(['O orçamento conta o usado no mês, com as parcelas do cartão a partir do mês da compra.']);
    expect(c.action).toEqual({ label: 'Ver orçamento por categoria', href: '/orcamento' });
  });

  it('5 Metas: guardado no mês (R$ 500,00) e o plano das metas (R$ 980,00 por mês)', async () => {
    const c = card(buildSeuMes(await readInput(await createDemoRepository(), '2026-10')), 'metas');
    expect(rowsOf(c)).toEqual([
      ['Guardado em outubro', 'R$ 500,00'],
      ['Plano das metas', 'R$ 980,00 por mês'],
    ]);
    expect(c.notes).toEqual(['Aportes e resgates das metas não entram em Recebido nem em Pago.']);
    expect(c.action).toEqual({ label: 'Ver metas', href: '/metas' });
  });

  it('não muda nenhum total da demonstração e não lê nada além do que já existe: a mesma entrada dá o mesmo resultado', async () => {
    const input = await readInput(await createDemoRepository(), '2026-10');
    const before = JSON.stringify(input);
    expect(JSON.stringify(buildSeuMes(input))).toBe(JSON.stringify(buildSeuMes(input)));
    expect(JSON.stringify(input)).toBe(before);
    expect([input.summary.receivedCents, input.summary.paidCents, input.summary.differenceCents, input.toPay.toPayCents]).toEqual([600_000, 390_000, 210_000, 65_000]);
  });
});

describe('Seu mês, outro mês', () => {
  it('setembro: sem orçamento o cartão pula, as contas em aberto viram "O que ficou em aberto" e sem aporte nem resgate o cartão Metas também pula', async () => {
    const view = buildSeuMes(await readInput(await createDemoRepository(), '2026-09'));
    expect(view.cards.map((c) => c.id)).toEqual(['entrou-saiu', 'para-onde-foi', 'o-que-vence']);
    expect(rowsOf(card(view, 'entrou-saiu'))).toEqual([
      ['Recebido', 'R$ 6.000,00'],
      ['Pago', 'R$ 3.750,00'],
      ['Diferença do mês', 'R$ 2.250,00', 'Recebido menos Pago'],
    ]);
    // Agosto não tem pagamentos: sem comparação (nada de "R$ 2.500,00 a mais").
    expect(rowsOf(card(view, 'para-onde-foi'))).toEqual([
      ['Moradia', 'R$ 2.500,00', '66,7% do pago'],
      ['Mercado', 'R$ 1.250,00', '33,3% do pago'],
    ]);
    const due = card(view, 'o-que-vence');
    expect(due.title).toBe('O que ficou em aberto em setembro');
    expect(rowsOf(due)).toEqual([['Em aberto', 'R$ 0,00', 'Nada em aberto em setembro']]);
    expect(due.action).toEqual({ label: 'Ver contas a pagar', href: '/a-pagar?mes=2026-09' });
  });

  it('mês que passou com metas, mas sem aporte nem resgate nele: o cartão Metas pula; com aporte (ou resgate), fica sem o plano', async () => {
    const input = await readInput(await createDemoRepository(), '2026-09');
    expect(input.goals!.count).toBeGreaterThan(0);
    expect(input.goals!.savedInMonthCents).toBe(0);
    expect(buildSeuMes(input).cards.map((c) => c.id)).not.toContain('metas');
    const saved = buildSeuMes({ ...input, goals: { ...input.goals!, savedInMonthCents: 30_000 } });
    expect(rowsOf(card(saved, 'metas'))).toEqual([['Guardado em setembro', 'R$ 300,00']]);
    const withdrawn = buildSeuMes({ ...input, goals: { ...input.goals!, savedInMonthCents: -10_000 } });
    expect(rowsOf(card(withdrawn, 'metas'))).toEqual([['Resgatado em setembro', 'R$ 100,00']]);
  });

  it('no mês de hoje o cartão Metas não pula, mesmo com R$ 0,00 guardado (o plano é o de hoje)', async () => {
    const input = await readInput(await createDemoRepository(), '2026-10');
    const view = buildSeuMes({ ...input, goals: { count: 2, savedInMonthCents: 0, plannedCents: 98_000 } });
    expect(rowsOf(card(view, 'metas'))).toEqual([
      ['Guardado em outubro', 'R$ 0,00'],
      ['Plano das metas', 'R$ 980,00 por mês'],
    ]);
  });

  it('mês anterior em outro ano: o nome leva o ano', async () => {
    const repo = await createDemoRepository();
    const input = await readInput(repo, '2026-10');
    const base: SeuMesInput = { ...input, month: '2027-01', today: '2027-01-10' };
    const share = (label: string, cents: number): CategoryShare => ({ category: label, label, cents, tenths: 1000, percentText: '100%', a11yLabel: label });
    const view = buildSeuMes({ ...base, breakdown: [share('Mercado', 90_000)], previousBreakdown: [share('Mercado', 100_000)] });
    expect(rowsOf(card(view, 'para-onde-foi'))[0]).toEqual(['Mercado', 'R$ 900,00', '100% do pago', 'R$ 100,00 a menos que em dezembro de 2026']);
  });
});

describe('Seu mês, comparação com o mês anterior', () => {
  const share = (label: string, cents: number, tenths: number, percentText: string, category: string | null = label): CategoryShare => ({
    category,
    label,
    cents,
    tenths,
    percentText,
    a11yLabel: `${label}, ${cents}`,
  });

  async function withBreakdown(breakdown: CategoryShare[], previousBreakdown: CategoryShare[] | null) {
    const input = await readInput(await createDemoRepository(), '2026-10');
    return buildSeuMes({ ...input, breakdown, previousBreakdown });
  }

  it('a mais, a menos, igual e "nada pago nesta categoria", sempre como fato', async () => {
    const view = await withBreakdown(
      [share('Mercado', 140_000, 600, '60%'), share('Lazer', 60_000, 250, '25%'), share('Saúde', 20_000, 150, '15%')],
      [share('Mercado', 120_000, 800, '80%'), share('Lazer', 60_000, 100, '10%'), share('Transporte', 5_000, 100, '10%')],
    );
    const rows = card(view, 'para-onde-foi').rows;
    expect(rows.map((r) => r.details[1])).toEqual([
      'R$ 200,00 a mais que em setembro',
      'Igual a setembro',
      'Nada pago nesta categoria em setembro',
    ]);
  });

  it('sem pagamentos no mês anterior (ou sem leitura dele), não há comparação', async () => {
    for (const previous of [[], null]) {
      const view = await withBreakdown([share('Mercado', 140_000, 1000, '100%')], previous);
      expect(card(view, 'para-onde-foi').rows[0]!.details).toEqual(['100% do pago']);
    }
  });

  it('nenhuma linha julga: sem "demais", "alto", "cuidado" nem "gastou"', async () => {
    const view = await withBreakdown([share('Mercado', 900_000, 1000, '100%')], [share('Mercado', 100_000, 1000, '100%')]);
    const text = view.cards.flatMap((c) => [c.title, c.intro ?? '', ...c.notes, ...c.rows.flatMap((r) => [r.label, r.value ?? '', ...r.details])]).join(' ');
    expect(text).not.toMatch(/demais|\balto\b|cuidado|gastou|exagero|estour|\bruim\b/i);
    expect(card(view, 'para-onde-foi').rows[0]!.details[1]).toBe('R$ 8.000,00 a mais que em setembro');
  });

  it('as 3 maiores por valor, mesmo "Sem categoria"; as outras viram uma linha', async () => {
    const breakdown = [
      share('Mercado', 100_000, 100, '10%'),
      share('Lazer', 80_000, 80, '8%'),
      share('Saúde', 60_000, 60, '6%'),
      share('Transporte', 40_000, 40, '4%'),
      share('Educação', 20_000, 20, '2%'),
      share('Sem categoria', 700_000, 690, '69%', null),
    ];
    const paidCents = breakdown.reduce((acc, s) => acc + s.cents, 0);
    const input = await readInput(await createDemoRepository(), '2026-10');
    const view = buildSeuMes({ ...input, summary: { ...input.summary, paidCents }, breakdown, previousBreakdown: null });
    const rows = card(view, 'para-onde-foi').rows;
    expect(SEU_MES_TOP).toBe(3);
    expect(rows.map((r) => r.label)).toEqual(['Sem categoria', 'Mercado', 'Lazer', '3 outras categorias']);
    expect(rows[3]).toEqual({ label: '3 outras categorias', value: 'R$ 1.200,00', details: ['12% do pago'] });
    // A soma dos centavos das linhas montadas (as 3 maiores e "outras") fecha com o Pago do cartão Entrou e saiu.
    const shown = rows.reduce((acc, r) => acc + parseBRL(r.value!)!, 0);
    const pago = parseBRL(rowsOf(card(view, 'entrou-saiu')).find((r) => r[0] === 'Pago')![1]!)!;
    expect(pago).toBe(1_000_000);
    expect(shown).toBe(pago);
  });

  it('empate no valor: por nome; uma categoria só entre as outras vira "1 outra categoria"', async () => {
    const view = await withBreakdown(
      [share('Saúde', 50_000, 250, '25%'), share('Lazer', 50_000, 250, '25%'), share('Moradia', 50_000, 250, '25%'), share('Mercado', 50_000, 250, '25%')],
      null,
    );
    expect(card(view, 'para-onde-foi').rows.map((r) => r.label)).toEqual(['Lazer', 'Mercado', 'Moradia', '1 outra categoria']);
  });
});

describe('Seu mês, o que ainda vence', () => {
  async function dueView(extra: (repo: MemoryRepository, ctx: string) => Promise<void>, today = DEMO_TODAY) {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    await extra(repo, ctx);
    return buildSeuMes(await readInput(repo, monthOf(today), today));
  }

  it('as vencidas vêm à parte, com o total delas, e as próximas contas são só as que vencem de hoje em diante', async () => {
    const view = await dueView(async (repo, ctx) => {
      await repo.createCommitment('seu-mes-gas', ctx, { description: 'Gás', amountCents: 4_000, dueOn: '2026-10-02', category: 'Moradia' });
    });
    expect(rowsOf(card(view, 'o-que-vence'))).toEqual([
      ['Ainda a pagar', 'R$ 690,00'],
      ['1 conta vencida', 'R$ 40,00'],
      ['Internet', 'R$ 150,00', 'Vence 15/10'],
      ['Condomínio', 'R$ 500,00', 'Vence 20/10'],
    ]);
  });

  it('mais de três contas: mostra as 3 primeiras e diz quantas faltam', async () => {
    const view = await dueView(async (repo, ctx) => {
      for (const [name, day] of [['Água', '22'], ['Gás', '25'], ['Escola', '28']] as const) {
        await repo.createCommitment(`seu-mes-${name}`, ctx, { description: name, amountCents: 10_000, dueOn: `2026-10-${day}`, category: 'Moradia' });
      }
    });
    const c = card(view, 'o-que-vence');
    expect(c.rows.map((r) => r.label)).toEqual(['Ainda a pagar', 'Internet', 'Condomínio', 'Água']);
    expect(c.rows[0]!.value).toBe('R$ 950,00');
    expect(c.notes).toEqual(['Mais 2 contas em aberto no mês.', 'Valores previstos, separados do que já foi pago.']);
  });

  it('conta de valor estimado: "≈" no valor e "estimado" no detalhe, e a soma diz quanto é estimado', async () => {
    const view = await dueView(async (repo, ctx) => {
      await repo.createSeries('seu-mes-luz', ctx, {
        kind: 'mensal', nature: 'conta', description: 'Luz de teste', category: 'Moradia', amountCents: 18_000, amountMode: 'variavel',
        dueDay: 14, firstDueMonth: '2026-10', firstNumber: 1, installmentTotal: null, partsPerYear: null, lastMonth: null,
      });
    });
    const c = card(view, 'o-que-vence');
    expect(c.rows[0]).toMatchObject({ value: 'R$ 830,00', details: ['Inclui R$ 180,00 em valores estimados.'] });
    expect(c.rows.find((r) => r.label === 'Luz de teste')).toMatchObject({ value: '≈ R$ 180,00', details: ['Vence 14/10 · estimado'] });
  });

  it('nada em aberto: R$ 0,00 e "Nada em aberto neste mês"', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    for (const c of await repo.listCommitments(ctx, '2026-10')) if (c.status === 'aberto' && !c.invoice && c.dueOn.startsWith('2026-10')) await repo.deleteCommitment(`seu-mes-del-${c.id}`, c.id, c.version);
    const view = buildSeuMes(await readInput(repo, '2026-10'));
    expect(rowsOf(card(view, 'o-que-vence'))).toEqual([['Ainda a pagar', 'R$ 0,00', 'Nada em aberto neste mês']]);
  });
});

describe('Seu mês, o que pula e o estado vazio', () => {
  it('sem orçamento no mês, o cartão Orçamento pula; sem metas, o cartão Metas pula; sem gastos pagos, Para onde foi pula', async () => {
    const input = await readInput(await createDemoRepository(), '2026-10');
    const view = buildSeuMes({
      ...input,
      breakdown: [],
      budget: { ...input.budget!, rows: [], hasAny: false },
      goals: { count: 0, savedInMonthCents: 0, plannedCents: 0 },
    });
    expect(view.cards.map((c) => c.id)).toEqual(['entrou-saiu', 'o-que-vence']);
    expect(buildSeuMes({ ...input, budget: null, goals: null }).cards.map((c) => c.id)).toEqual(['entrou-saiu', 'para-onde-foi', 'o-que-vence']);
  });

  it('com orçamento, mas nenhuma categoria a 80%: o cartão fica e diz isso', async () => {
    const input = await readInput(await createDemoRepository(), '2026-10');
    const lowRows = input.budget!.rows.map((r) => ({ ...r, level: 0 as const }));
    const view = buildSeuMes({ ...input, budget: { ...input.budget!, rows: lowRows } });
    const c = card(view, 'orcamento');
    expect(c.rows).toEqual([]);
    expect(c.intro).toBeNull();
    expect(c.notes[0]).toBe('Nenhuma categoria chegou a 80% do orçamento.');
  });

  it('mais de três categorias a 80%: três linhas e quantas faltam', async () => {
    const input = await readInput(await createDemoRepository(), '2026-10');
    const row = input.budget!.rows[0]!;
    const rows = ['Moradia', 'Mercado', 'Transporte', 'Saúde', 'Lazer'].map((category, i) => ({ ...row, category, level: 1 as const, tenths: 900 + i }));
    const c = card(buildSeuMes({ ...input, budget: { ...input.budget!, rows } }), 'orcamento');
    expect(c.rows.map((r) => r.label)).toEqual(['Lazer', 'Saúde', 'Transporte']);
    expect(c.notes[0]).toBe('Mais 2 categorias a 80% do orçamento ou mais.');
  });

  it('mês sem nada: o estado vazio, sem cartões, com "Anotar gasto"', async () => {
    const repo = new MemoryRepository({ actorId: 'pessoa-nova', displayName: 'Pat', today: () => DEMO_TODAY, latencyMs: 0 });
    await repo.ensurePersonalSpace('Conta principal');
    const view = buildSeuMes(await readInput(repo, '2026-10'));
    expect(view.cards).toEqual([]);
    expect(view.empty).toEqual({
      title: 'Nada anotado em outubro ainda',
      body: 'Anote um gasto ou um recebimento e volte aqui para ver o mês em poucos passos.',
      action: { label: 'Anotar gasto', href: '/registro/novo?tipo=despesa' },
    });
    const past = buildSeuMes(await readInput(repo, '2026-09'));
    expect(past.empty?.title).toBe('Nada anotado em setembro');
    expect(past.empty?.body).toBe('Mês sem anotação não quer dizer mês sem gastos: aqui aparece só o que está registrado na Clarevo.');
  });

  it('mês que passou, vazio e conferido ("Conferi este mês", D-060): a frase de mês sem anotação vira a de mês conferido', async () => {
    const repo = new MemoryRepository({ actorId: 'pessoa-nova', displayName: 'Pat', today: () => DEMO_TODAY, latencyMs: 0 });
    const space = await repo.ensurePersonalSpace('Conta principal');
    const unchecked = await readInput(repo, '2026-09');
    // O input do app traz a marca de pagamentos do mês (months_overview): sem ela, a frase de sempre.
    expect(buildSeuMes({ ...unchecked, paidChecked: false }).empty?.body).toBe('Mês sem anotação não quer dizer mês sem gastos: aqui aparece só o que está registrado na Clarevo.');
    await repo.setMonthCheck('chave-seu-mes-0001', space.personalContextId, '2026-09', 'pagamentos', 0);
    const row = (await repo.monthsOverview(space.personalContextId, '2026-09', '2026-09'))[0]!;
    expect(row.paidChecked).toBe(true);
    const checked = buildSeuMes({ ...unchecked, paidChecked: row.paidChecked });
    expect(checked.cards).toEqual([]);
    expect(checked.empty).toEqual({
      title: 'Nada anotado em setembro',
      body: 'Você conferiu: não houve pagamentos em setembro de 2026.',
      action: { label: 'Anotar gasto', href: '/registro/novo?tipo=despesa' },
    });
    expect(checked.empty?.body).not.toContain('Mês sem anotação');
    // O mês de hoje nunca é conferido (ainda não terminou): a frase de "ainda" segue, mesmo com a marca no dado.
    const current = buildSeuMes({ ...(await readInput(repo, '2026-10')), paidChecked: true });
    expect(current.empty?.body).toBe('Anote um gasto ou um recebimento e volte aqui para ver o mês em poucos passos.');
    // Um mês conferido que ganhou registro deixa de ser vazio (o estado vazio não aparece).
    await repo.createRecord('chave-seu-mes-0002', space.personalContextId, 'despesa', { accountId: space.accounts[0]!.id, amountCents: 1_000, occurredOn: '2026-08-10', description: 'Teste', category: null });
    expect(buildSeuMes({ ...(await readInput(repo, '2026-08')), paidChecked: false }).empty).toBeNull();
  });

  it('mês que passou sem nada anotado, mesmo com metas hoje: o estado vazio, sem cartão de Metas', async () => {
    const input = await readInput(await createDemoRepository(), '2025-03', DEMO_TODAY);
    expect(input.goals!.count).toBeGreaterThan(0);
    const view = buildSeuMes(input);
    expect(view.cards).toEqual([]);
    expect(view.empty).toEqual({
      title: 'Nada anotado em março',
      body: 'Mês sem anotação não quer dizer mês sem gastos: aqui aparece só o que está registrado na Clarevo.',
      action: { label: 'Anotar gasto', href: '/registro/novo?tipo=despesa' },
    });
    // Com aporte no mês, o mês tem anotação e o estado vazio não aparece.
    const withSaved = buildSeuMes({ ...input, goals: { ...input.goals!, savedInMonthCents: 10_000 } });
    expect(withSaved.empty).toBeNull();
    expect(withSaved.cards.map((c) => c.id)).toContain('metas');
  });

  it('no mês de hoje, com metas e nada anotado, o comportamento segue o mesmo: o cartão Metas existe e não há estado vazio', async () => {
    const repo = new MemoryRepository({ actorId: 'pessoa-nova', displayName: 'Pat', today: () => DEMO_TODAY, latencyMs: 0 });
    await repo.ensurePersonalSpace('Conta principal');
    const input = await readInput(repo, '2026-10');
    const view = buildSeuMes({ ...input, goals: { count: 1, savedInMonthCents: 0, plannedCents: 50_000 } });
    expect(view.empty).toBeNull();
    expect(view.cards.map((c) => c.id)).toContain('metas');
    const past = buildSeuMes({ ...(await readInput(repo, '2026-09')), goals: { count: 1, savedInMonthCents: 0, plannedCents: 50_000 } });
    expect(past.cards).toEqual([]);
    expect(past.empty?.title).toBe('Nada anotado em setembro');
  });

  it('conta nova com uma conta a pagar e nada mais: os dois cartões que sempre existem, sem o vazio', async () => {
    const repo = new MemoryRepository({ actorId: 'pessoa-nova', displayName: 'Pat', today: () => DEMO_TODAY, latencyMs: 0 });
    const ctx = (await repo.ensurePersonalSpace('Conta principal')).personalContextId;
    await repo.createCommitment('seu-mes-nova', ctx, { description: 'Condomínio', amountCents: 50_000, dueOn: '2026-10-20', category: 'Moradia' });
    const view = buildSeuMes(await readInput(repo, '2026-10'));
    expect(view.empty).toBeNull();
    expect(view.cards.map((c) => c.id)).toEqual(['entrou-saiu', 'o-que-vence']);
    expect(card(view, 'entrou-saiu').notes).toContain('Nada anotado em outubro ainda.');
    expect(card(view, 'entrou-saiu').rows.map((r) => r.value)).toEqual(['R$ 0,00', 'R$ 0,00', 'R$ 0,00']);
  });

  it('diferença negativa: o mesmo fato do Resumo, sem julgamento', async () => {
    const input = await readInput(await createDemoRepository(), '2026-10');
    const view = buildSeuMes({ ...input, summary: { ...input.summary, receivedCents: 100_000, paidCents: 130_000, differenceCents: -30_000 } });
    expect(card(view, 'entrou-saiu').rows[2]).toMatchObject({ value: '-R$ 300,00', details: ['Recebido menos Pago · até 07/10', 'Pagamentos acima dos recebimentos no período'] });
  });

  it('resgate maior que aporte: "Resgatado em outubro"', async () => {
    const input = await readInput(await createDemoRepository(), '2026-10');
    const c = card(buildSeuMes({ ...input, goals: { count: 1, savedInMonthCents: -20_000, plannedCents: 0 } }), 'metas');
    expect(rowsOf(c)).toEqual([['Resgatado em outubro', 'R$ 200,00']]);
  });
});

describe('Seu mês, o mês da tela', () => {
  it('abre no mês do endereço se for válido e não for futuro; senão, no mês de hoje', () => {
    expect(seuMesStartMonth('2026-09', '2026-10')).toBe('2026-09');
    expect(seuMesStartMonth(['2026-08', '2026-09'], '2026-10')).toBe('2026-08');
    expect(seuMesStartMonth('2026-11', '2026-10')).toBe('2026-10');
    expect(seuMesStartMonth('2026-13', '2026-10')).toBe('2026-10');
    expect(seuMesStartMonth('banana', '2026-10')).toBe('2026-10');
    expect(seuMesStartMonth(undefined, '2026-10')).toBe('2026-10');
    expect(isSeuMesMonth('2026-10', '2026-10')).toBe(true);
    expect(isSeuMesMonth('2026-11', '2026-10')).toBe(false);
    expect(isSeuMesMonth(202610, '2026-10')).toBe(false);
  });

  it('o seletor vai para trás quanto a pessoa quiser e para na frente no mês de hoje', () => {
    expect(seuMesStep('2026-10', '2026-10', 1)).toBeNull();
    expect(seuMesStep('2026-10', '2026-10', -1)).toBe('2026-09');
    expect(seuMesStep('2026-01', '2026-10', -1)).toBe('2025-12');
    expect(seuMesStep('2026-09', '2026-10', 1)).toBe('2026-10');
    expect(seuMesStep('2000-01', '2026-10', -1)).toBeNull();
  });

  it('?mes= só aparece quando o mês não é o de hoje', () => {
    expect(seuMesParams('2026-10', '2026-10')).toEqual({});
    expect(seuMesParams('2026-09', '2026-10')).toEqual({ mes: '2026-09' });
  });
});

describe('Seu mês, a tela no app', () => {
  it('é tela de consulta (barra inferior) e Movimentos é a aba do assunto', () => {
    expect(barModeFor('/seu-mes')).toBe('consulta');
    expect(barModeFor('/seu-mes?mes=2026-09')).toBe('consulta');
    expect(topicTabFor('/seu-mes')).toBe('/movimentacoes');
  });

  it('o índice "No app" acha a tela e usa o mesmo título e a mesma legenda do core', () => {
    const screen = APP_SCREENS.find((s) => s.id === 'seu-mes')!;
    expect(screen.title).toBe(SEU_MES_TEXT.title);
    expect(screen.caption).toBe(SEU_MES_TEXT.screenCaption);
    expect(screen.href).toBe('/seu-mes');
    for (const query of ['seu mês', '30 segundos', 'revisão do mês', 'balanço do mês', 'o que entrou']) {
      expect(searchAppScreens(query).map((s) => s.id), query).toContain('seu-mes');
    }
  });

  it('o nome acessível de uma linha junta o nome, o valor e os detalhes', () => {
    expect(seuMesRowA11y({ label: 'Mercado', value: 'R$ 1.400,00', details: ['35,9% do pago', 'R$ 150,00 a mais que em setembro'] })).toBe(
      'Mercado, R$ 1.400,00. 35,9% do pago. R$ 150,00 a mais que em setembro.',
    );
    expect(seuMesRowA11y({ label: 'Plano das metas', value: null, details: [] })).toBe('Plano das metas.');
  });
});

describe('Seu mês, o app lê o core (D-052)', () => {
  const APP_SRC = fileURLToPath(new URL('../../../apps/app/src/', import.meta.url));
  const read = (rel: string) => readFileSync(`${APP_SRC}${rel}`, 'utf8');

  it('a tela está no layout e aceita o endereço direto (ENTRY_PATH), com ou sem ?mes=', () => {
    const layout = read('app/_layout.tsx');
    expect(layout).toContain('<Stack.Screen name="seu-mes" />');
    const source = layout.match(/const ENTRY_PATH =\s*(\/\^[^\n]+\$\/);/)?.[1];
    expect(source, 'ENTRY_PATH escrito no layout').toBeTruthy();
    const entry = new RegExp(source!.slice(1, -1));
    expect(entry.test('/seu-mes')).toBe(true);
    expect(entry.test('/seu-mes/')).toBe(true);
    expect(entry.test('/seu-mes/outra')).toBe(false);
  });

  it('em Movimentos, a linha vem logo depois de Buscar e antes de "Anotar gasto"', () => {
    const text = read('app/(tabs)/movimentacoes.tsx');
    const search = text.indexOf('<SearchEntry');
    const row = text.indexOf('<SeuMesEntry');
    const action = text.indexOf('label="Anotar gasto"');
    expect(search).toBeGreaterThan(0);
    expect(row).toBeGreaterThan(search);
    expect(action).toBeGreaterThan(row);
    // Abre no mês em exibição, com o mês no endereço só quando não é o de hoje.
    expect(text).toContain("pathname: '/seu-mes', params: seuMesParams(month, currentMonth)");
  });

  it('a tela usa só o core para montar os cartões e não escreve nada (nenhuma mutação, nenhum armazenamento)', () => {
    const screen = read('app/seu-mes.tsx');
    const parts = read('components/seu-mes-parts.tsx');
    const hook = read('state/data.ts').match(/export function useSeuMes[\s\S]*?\n}\n/)![0];
    expect(hook).toContain('buildSeuMes(');
    expect(hook).not.toMatch(/useMutation|useCreate|useUpdate|useDelete|AsyncStorage|localStorage/);
    for (const text of [screen, parts]) {
      expect(text).not.toMatch(/useMutation|useCreate|useUpdate|useDelete|AsyncStorage|localStorage|sessionStorage|updatePrefs|formatBRL\(/);
    }
    // Valores em reais passam por MoneyTxt (Ocultar valores), nunca escritos à mão.
    expect(parts).toContain('MoneyTxt');
  });

  it('respeita movimento reduzido (a entrada do cartão usa ReduceMotion.System) e o gesto de deslizar tem os mesmos botões como alternativa', () => {
    const screen = read('app/seu-mes.tsx');
    expect(screen).toContain('ReduceMotion.System');
    expect(screen).toContain('SEU_MES_TEXT.next');
    expect(screen).toContain('SEU_MES_TEXT.previous');
    expect(screen).toContain('accessibilityLiveRegion="polite"');
  });
});
