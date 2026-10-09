import { MemoryRepository } from './memory-repository';
import { newOperationKey } from './repository';

/**
 * Dados FICTÍCIOS da conta de demonstração. Não representam nenhuma pessoa real
 * e nunca entram em uma conta criada pelo cadastro (conta nova nunca recebe série de exemplo).
 * Outubro reproduz a base de aceite: R$ 6.000 recebidos, R$ 3.900 pagos e R$ 650 em contas a pagar.
 * O aluguel de outubro é a conta do gasto fixo, paga em 05/10. Em "Próximos meses": Aluguel (05/11),
 * Financiamento do carro (parcela 13 de 48, 10/11), Seguro do carro (10/11) e Luz estimada (12/11).
 * Contas do ano: IPVA (cota única, 20/01, desde 2027) e IPTU (10 parcelas de fevereiro a novembro, dia 10, desde 2027),
 * ambos com valor que muda. Em 07/10/2026 nenhuma conta delas existe (entram em novembro e dezembro de 2026), então
 * nenhum total de outubro, novembro ou dezembro de 2026 muda.
 * Renda de referência (D-026): R$ 6.000,00 desde setembro de 2026, renda fixa. Renda comprometida de outubro: 52,5%
 * (R$ 3.150,00); novembro: 63,8% (R$ 3.830,00). Recebido, Pago, Diferença e Ainda a pagar não mudam.
 * Metas (D-027): "Reserva para imprevistos" (gastos essenciais de setembro, R$ 3.750,00, × 6 meses = R$ 22.500,00; já
 * guardado R$ 3.000,00 em 01/10 e aporte de R$ 500,00 em 06/10; plano de R$ 500,00 por mês): 15%, cobre 0,9 mês, chega
 * lá em dezembro de 2029. "Viagem de férias" (R$ 6.000,00 até julho de 2027, já guardado R$ 1.200,00 em 01/10, plano de
 * R$ 480,00): 20%, R$ 480,00 por mês até julho de 2027. Guardado em metas em outubro: R$ 500,00; planejado: R$ 980,00 por
 * mês. Movimentos de meta não entram em nenhum total do mês nem na renda comprometida.
 * Plano de guardar (spec7): resposta "consigo" com R$ 500,00 por mês em 07/10/2026 (sem data de volta), igual ao plano da
 * reserva. Com os gastos essenciais de R$ 3.750,00 e R$ 3.500,00 guardados na reserva, as etapas chegam em novembro de 2026
 * (1 mês), fevereiro de 2028 (3 meses) e dezembro de 2029 (6 meses).
 */
export const DEMO_TODAY = '2026-10-07';
export const DEMO_EMAIL = 'demo@clarevo.app';

/**
 * Cenários da demonstração (D-016), só no modo de demonstração e sempre com a pílula "Demonstração":
 * - 'padrao': a base de aceite de outubro de 2026 (tudo anotado em 07/10/2026, sem faixa de retorno);
 * - 'retorno': a montagem FICTÍCIA da sequência R do Ciclo A4 (D-030), anotada em 20/05/2026 e aberta em 07/10/2026.
 * Conta nova nunca recebe nenhum dos dois.
 */
export type DemoScenario = 'padrao' | 'retorno';
export const DEMO_SCENARIOS: readonly DemoScenario[] = ['padrao', 'retorno'];
/** Dia da montagem do cenário 'retorno' (última anotação antes do tempo sem usar). */
export const DEMO_RETURN_SETUP_DAY = '2026-05-20';

/** Parâmetro "?cenario=retorno" → 'retorno'; ausente ou desconhecido → 'padrao'. */
export function demoScenarioFrom(param: string | null | undefined): DemoScenario {
  const value = (param ?? '').trim().toLowerCase();
  return (DEMO_SCENARIOS as readonly string[]).includes(value) ? (value as DemoScenario) : 'padrao';
}

export async function createDemoRepository(opts: { latencyMs?: number; scenario?: DemoScenario } = {}) {
  if (opts.scenario === 'retorno') return createReturnDemoRepository(opts.latencyMs);
  const repo = new MemoryRepository({
    actorId: 'pessoa-demo',
    displayName: 'Maria Alves',
    today: () => DEMO_TODAY,
    latencyMs: 0,
  });
  const space = await repo.ensurePersonalSpace('Conta principal');
  const ctx = space.personalContextId;
  const accountId = space.accounts[0]!.id;
  const add = (kind: 'receita' | 'despesa', description: string, reais: number, occurredOn: string, category: string | null) =>
    repo.createRecord(newOperationKey(), ctx, kind, { accountId, amountCents: reais * 100, occurredOn, description, category });

  await add('receita', 'Salário', 6000, '2026-09-01', 'Salário');
  await add('despesa', 'Aluguel', 2500, '2026-09-05', 'Moradia');
  await add('despesa', 'Mercado', 1250, '2026-09-12', 'Mercado');
  await add('receita', 'Salário', 6000, '2026-10-01', 'Salário');
  await add('despesa', 'Mercado', 1400, '2026-10-06', 'Mercado');

  // Gastos fixos e contas a pagar passam pelas mesmas regras do cadastro (sem semente direta).
  const fixed = (description: string, reais: number, dueDay: number, firstDueMonth: string, amountMode: 'fixo' | 'variavel', category: string) =>
    repo.createSeries(newOperationKey(), ctx, {
      kind: 'mensal',
      nature: 'conta',
      description,
      category,
      amountCents: reais * 100,
      amountMode,
      dueDay,
      firstDueMonth,
      firstNumber: 1,
      installmentTotal: null,
      partsPerYear: null,
      lastMonth: null,
    });
  const aluguel = await fixed('Aluguel', 2500, 5, '2026-10', 'fixo', 'Moradia');
  // A conta de outubro é paga no vencimento: o gasto de 05/10 nasce do pagamento.
  const outubro = aluguel.occurrences.find((c) => c.dueOn === '2026-10-05')!;
  await repo.payCommitment(newOperationKey(), outubro.id, outubro.version, {
    accountId,
    amountCents: outubro.amountCents,
    paidOn: '2026-10-05',
    category: 'Moradia',
  });
  await fixed('Luz', 180, 12, '2026-11', 'variavel', 'Moradia');
  await repo.createSeries(newOperationKey(), ctx, {
    kind: 'parcelada',
    nature: 'financiamento',
    description: 'Financiamento do carro',
    category: 'Transporte',
    amountCents: 85000,
    amountMode: 'fixo',
    dueDay: 10,
    firstDueMonth: '2026-11',
    firstNumber: 13,
    installmentTotal: 48,
    partsPerYear: null,
    lastMonth: null,
  });
  // Contas do ano (D-029): valor de referência estimado; o ano inteiro entra em Contas a pagar dois meses antes.
  const annual = (description: string, reais: number, partsPerYear: number, dueDay: number, firstDueMonth: string, category: string) =>
    repo.createSeries(newOperationKey(), ctx, {
      kind: 'anual',
      nature: 'conta',
      description,
      category,
      amountCents: reais * 100,
      amountMode: 'variavel',
      dueDay,
      firstDueMonth,
      firstNumber: 1,
      installmentTotal: null,
      partsPerYear,
      lastMonth: null,
    });
  await annual('IPVA', 2400, 1, 20, '2027-01', 'Transporte');
  await annual('IPTU', 180, 10, 10, '2027-02', 'Moradia');

  const bill = (description: string, reais: number, dueOn: string, category: string) =>
    repo.createCommitment(newOperationKey(), ctx, { description, amountCents: reais * 100, dueOn, category });
  await bill('Internet', 150, '2026-10-15', 'Moradia');
  await bill('Condomínio', 500, '2026-10-20', 'Moradia');
  await bill('Seguro do carro', 300, '2026-11-10', 'Transporte'); // só em "Próximos meses"
  await repo.syncSeriesOccurrences(ctx); // o app sincroniza ao abrir; aqui não cria nada
  // Renda de referência (D-026): R$ 6.000,00 por mês desde setembro de 2026, renda fixa. Só calcula percentuais (52,5% em
  // outubro, 63,8% em novembro); não entra em Recebido.
  await repo.setIncomeReference(newOperationKey(), ctx, '2026-09', 0, 600_000, false);
  // Metas (D-027), pelas mesmas funções do cadastro. A reserva usa a média de setembro (Moradia e Mercado).
  const reserva = await repo.createGoal(newOperationKey(), ctx, {
    goalType: 'emergencia',
    name: 'Reserva para imprevistos',
    targetCents: 2_250_000,
    targetMonth: null,
    plannedMonthlyCents: 50_000,
    essentialBaseCents: 375_000,
    essentialMonths: 6,
    essentialBaseSource: 'media_gastos',
    initialCents: 300_000,
    initialOn: '2026-10-01',
  });
  await repo.addGoalMovement(newOperationKey(), reserva.goal.id, 'aporte', { amountCents: 50_000, occurredOn: '2026-10-06', note: null });
  await repo.createGoal(newOperationKey(), ctx, {
    goalType: 'objetivo',
    name: 'Viagem de férias',
    targetCents: 600_000,
    targetMonth: '2027-07',
    plannedMonthlyCents: 48_000,
    essentialBaseCents: null,
    essentialMonths: null,
    essentialBaseSource: null,
    initialCents: 120_000,
    initialOn: '2026-10-01',
  });
  // Plano de guardar (spec7): a pessoa respondeu "consigo" com R$ 500,00 por mês, o mesmo plano da reserva. Só é lida pela
  // própria pessoa; não conta como anotação e não muda nenhum total.
  await repo.setSavingsAnswer(newOperationKey(), ctx, 0, 'consigo', 50_000);

  // A latência só passa a valer depois de semear, para a demonstração abrir rápido.
  repo.latencyMs = opts.latencyMs ?? 0;
  return repo;
}

/**
 * Cenário 'retorno' (FICTÍCIO, identificado como demonstração): montagem da sequência R do Ciclo A4. Em 20/05/2026,
 * Maria cadastra Aluguel (todo mês, R$ 2.500,00, dia 5, desde maio), Luz (todo mês, valor que muda, referência
 * R$ 180,00, dia 12, desde maio) e Financiamento do carro (48 parcelas de R$ 850,00, próxima 8 em maio, dia 10), paga as
 * contas de maio e anota Salário (R$ 6.000,00 em 01/05) e Mercado (R$ 1.250,00 em 15/05). Depois o dia passa a
 * 07/10/2026 sem nenhuma anotação: a geração das contas fica para a abertura do app (useSeriesSync), como na volta real.
 * Maio: Recebido R$ 6.000,00, Pago R$ 4.765,30. Ao abrir: faixa "Seus últimos meses" com 4 meses com algo sem
 * registro e 13 contas para conferir.
 */
async function createReturnDemoRepository(latencyMs?: number) {
  let today = DEMO_RETURN_SETUP_DAY;
  const repo = new MemoryRepository({
    actorId: 'pessoa-demo',
    displayName: 'Maria Alves',
    today: () => today,
    latencyMs: 0,
  });
  const space = await repo.ensurePersonalSpace('Conta principal');
  const ctx = space.personalContextId;
  const accountId = space.accounts[0]!.id;
  const monthly = (description: string, amountCents: number, dueDay: number, amountMode: 'fixo' | 'variavel') =>
    repo.createSeries(newOperationKey(), ctx, {
      kind: 'mensal',
      nature: 'conta',
      description,
      category: 'Moradia',
      amountCents,
      amountMode,
      dueDay,
      firstDueMonth: '2026-05',
      firstNumber: 1,
      installmentTotal: null,
      partsPerYear: null,
      lastMonth: null,
    });
  const aluguel = await monthly('Aluguel', 250_000, 5, 'fixo');
  const luz = await monthly('Luz', 18_000, 12, 'variavel');
  const carro = await repo.createSeries(newOperationKey(), ctx, {
    kind: 'parcelada',
    nature: 'financiamento',
    description: 'Financiamento do carro',
    category: 'Transporte',
    amountCents: 85_000,
    amountMode: 'fixo',
    dueDay: 10,
    firstDueMonth: '2026-05',
    firstNumber: 8,
    installmentTotal: 48,
    partsPerYear: null,
    lastMonth: null,
  });
  // Contas de maio pagas (os gastos nascem do pagamento).
  const payMay = async (occurrences: readonly { id: string; version: number; dueOn: string; category: string | null }[], amountCents: number) => {
    const c = occurrences.find((o) => o.dueOn.startsWith('2026-05'))!;
    await repo.payCommitment(newOperationKey(), c.id, c.version, { accountId, amountCents, paidOn: c.dueOn, category: c.category });
  };
  await payMay(aluguel.occurrences, 250_000);
  await payMay(luz.occurrences, 16_530);
  await payMay(carro.occurrences, 85_000);
  await repo.createRecord(newOperationKey(), ctx, 'receita', {
    accountId,
    amountCents: 600_000,
    occurredOn: '2026-05-01',
    description: 'Salário',
    category: 'Salário',
  });
  await repo.createRecord(newOperationKey(), ctx, 'despesa', {
    accountId,
    amountCents: 125_000,
    occurredOn: '2026-05-15',
    description: 'Mercado',
    category: 'Mercado',
  });
  today = DEMO_TODAY;
  repo.latencyMs = latencyMs ?? 0;
  return repo;
}
