import { describe, expect, it } from 'vitest';
import {
  DEMO_SUBSCRIPTIONS_SETUP_DAY,
  DEMO_TODAY,
  MemoryRepository,
  SUBSCRIPTION_ERROR_TEXT,
  SUBSCRIPTION_FIRST_REVIEW_AFTER_MONTHS,
  SUBSCRIPTION_REVIEW_AFTER_MONTHS,
  SUBSCRIPTION_SNOOZE_DAYS,
  SUBSCRIPTION_TEXT,
  createDemoRepository,
  createdDay,
  demoScenarioFrom,
  isActiveSubscription,
  isRepoError,
  lastSubscriptionReview,
  newOperationKey,
  oldestSubscriptionDay,
  subscriptionCount,
  subscriptionErrorText,
  subscriptionReminderDue,
  subscriptionReminderVisible,
  subscriptionRow,
  subscriptionRows,
  subscriptionSnoozeUntil,
  subscriptionSnoozed,
  subscriptionTotals,
  subscriptionYearlyCents,
  summarizeMonth,
  summarizeToPay,
  type CommitmentSeries,
  type IsoDate,
  type RepoError,
  type RepoErrorCode,
  type SeriesInput,
  type SubscriptionSeries,
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

/** Série de exemplo para as regras puras (Streaming, R$ 39,90, dia 10, desde outubro de 2026). */
const sub = (over: Partial<SubscriptionSeries> & { amountCents?: number; mode?: 'fixo' | 'variavel'; name?: string } = {}): SubscriptionSeries => {
  const { amountCents, mode, name, ...rest } = over;
  return {
    id: 's1',
    kind: 'mensal',
    firstDueMonth: '2026-10',
    firstNumber: 1,
    lastNumber: null,
    partsPerYear: null,
    terms: [{ fromNumber: 1, description: name ?? 'Streaming', category: 'Lazer', amountCents: amountCents ?? 3990, amountMode: mode ?? 'fixo', dueDay: 10 }],
    subscription: true,
    subscriptionReviewedOn: null,
    createdAt: '2026-10-01T12:00:00.000Z',
    ...rest,
  };
};

describe('assinaturas: quais são e quanto custam (D-046)', () => {
  it('só gasto fixo mensal marcado e não encerrado é assinatura ativa', () => {
    expect(isActiveSubscription(sub(), DEMO_TODAY)).toBe(true);
    expect(isActiveSubscription(sub({ subscription: false }), DEMO_TODAY)).toBe(false);
    // Parcelamento e conta do ano nunca são (mesmo com a marca gravada à força).
    expect(isActiveSubscription(sub({ kind: 'parcelada' }), DEMO_TODAY)).toBe(false);
    expect(isActiveSubscription(sub({ kind: 'anual', partsPerYear: 1 }), DEMO_TODAY)).toBe(false);
    // Encerrada: último mês antes do mês de hoje (n = 1 é outubro; setembro de 2026 = n 0 em série que começou em setembro).
    expect(isActiveSubscription(sub({ firstDueMonth: '2026-08', lastNumber: 1 }), DEMO_TODAY)).toBe(false);
    expect(isActiveSubscription(sub({ firstDueMonth: '2026-09', lastNumber: 1 }), DEMO_TODAY)).toBe(false);
    // O último mês é o de hoje: ainda ativa neste mês.
    expect(isActiveSubscription(sub({ firstDueMonth: '2026-10', lastNumber: 1 }), DEMO_TODAY)).toBe(true);
    expect(isActiveSubscription(sub({ firstDueMonth: '2026-10', lastNumber: 1 }), '2026-11-01')).toBe(false);
    // Encerrada antes da primeira conta.
    expect(isActiveSubscription(sub({ lastNumber: 0 }), DEMO_TODAY)).toBe(false);
    // Ainda não começou: ativa (é um compromisso cadastrado).
    expect(isActiveSubscription(sub({ firstDueMonth: '2027-06' }), DEMO_TODAY)).toBe(true);
  });

  it('por mês é o valor vigente e por ano é por mês × 12', () => {
    expect(subscriptionYearlyCents(3990)).toBe(47880);
    expect(subscriptionYearlyCents(9900)).toBe(118800);
    const row = subscriptionRow(sub(), DEMO_TODAY);
    expect(row).toEqual({ id: 's1', name: 'Streaming', monthlyCents: 3990, yearlyCents: 47880, estimated: false, dueDay: 10, reviewedOn: null });
    expect(subscriptionRow(sub({ mode: 'variavel' }), DEMO_TODAY).estimated).toBe(true);
  });

  it('usa a vigência de hoje, não a primeira, quando o valor mudou', () => {
    const s = sub({
      firstDueMonth: '2026-05',
      terms: [
        { fromNumber: 1, description: 'Streaming', category: null, amountCents: 3990, amountMode: 'fixo', dueDay: 10 },
        { fromNumber: 5, description: 'Streaming', category: null, amountCents: 4490, amountMode: 'fixo', dueDay: 10 },
      ],
    });
    // Outubro de 2026 é o número 6 de uma série que começou em maio: vale a vigência do 5 em diante.
    expect(subscriptionRow(s, DEMO_TODAY).monthlyCents).toBe(4490);
    expect(subscriptionRow(s, '2026-08-15').monthlyCents).toBe(3990);
  });

  it('a lista vai da que mais custa para a que menos custa, e o empate pelo nome', () => {
    const list = [
      sub({ id: 'a', name: 'Revista', amountCents: 1990 }),
      sub({ id: 'b', name: 'Academia', amountCents: 9900 }),
      sub({ id: 'c', name: 'Clube', amountCents: 1990 }),
      sub({ id: 'd', name: 'Aluguel', subscription: false, amountCents: 250000 }),
      sub({ id: 'e', name: 'Antiga', lastNumber: 0, amountCents: 5000 }),
    ];
    expect(subscriptionRows(list, DEMO_TODAY).map((r) => r.name)).toEqual(['Academia', 'Clube', 'Revista']);
  });

  it('totais: soma dos valores vigentes das ativas, por ano × 12, e a parte estimada', () => {
    const list = [sub({ id: 'a', amountCents: 3990 }), sub({ id: 'b', name: 'Academia', amountCents: 9900, mode: 'variavel' }), sub({ id: 'c', subscription: false })];
    expect(subscriptionTotals(list, DEMO_TODAY)).toEqual({ count: 2, monthlyCents: 13890, yearlyCents: 166680, estimatedMonthlyCents: 9900 });
    expect(subscriptionTotals([], DEMO_TODAY)).toEqual({ count: 0, monthlyCents: 0, yearlyCents: 0, estimatedMonthlyCents: 0 });
    // Nenhuma ativa: zeros.
    expect(subscriptionTotals([sub({ subscription: false }), sub({ lastNumber: 0 })], DEMO_TODAY).count).toBe(0);
  });

  it('contagem no singular e no plural', () => {
    expect(subscriptionCount(1)).toBe('1 assinatura');
    expect(subscriptionCount(0)).toBe('0 assinaturas');
    expect(subscriptionCount(3)).toBe('3 assinaturas');
  });
});

describe('assinaturas: quando mostrar o lembrete (D-046)', () => {
  const at = (reviewedOn: string | null, createdAt = '2026-01-10T12:00:00.000Z') => sub({ subscriptionReviewedOn: reviewedOn, createdAt });

  it('as constantes são as da especificação', () => {
    expect(SUBSCRIPTION_REVIEW_AFTER_MONTHS).toBe(6);
    expect(SUBSCRIPTION_FIRST_REVIEW_AFTER_MONTHS).toBe(3);
    expect(SUBSCRIPTION_SNOOZE_DAYS).toBe(30);
  });

  it('o dia do cadastro é a data do instante de criação', () => {
    expect(createdDay({ createdAt: '2026-06-30T12:00:00.001Z' })).toBe('2026-06-30');
  });

  it('nunca revisada: aparece quando a assinatura mais antiga tem 3 meses ou mais', () => {
    expect(subscriptionReminderDue([at(null, '2026-07-07T12:00:00.000Z')], '2026-10-07')).toBe(true); // exatamente 3 meses
    expect(subscriptionReminderDue([at(null, '2026-07-08T12:00:00.000Z')], '2026-10-07')).toBe(false); // 2 meses e 29 dias
    expect(subscriptionReminderDue([at(null, '2026-07-08T12:00:00.000Z')], '2026-10-08')).toBe(true);
    // Cadastrada em 31/07: 3 meses depois é 31/10 (o dia limitado ao fim do mês, como no banco: 31/01 + 1 mês = 28/02).
    expect(subscriptionReminderDue([at(null, '2026-07-31T12:00:00.000Z')], '2026-10-30')).toBe(false);
    expect(subscriptionReminderDue([at(null, '2026-07-31T12:00:00.000Z')], '2026-10-31')).toBe(true);
    expect(subscriptionReminderDue([at(null, '2026-11-30T12:00:00.000Z')], '2027-02-28')).toBe(true); // 30/11 + 3 meses = 28/02 (limitado)
    // Nova (de hoje): não incomoda.
    expect(subscriptionReminderDue([at(null, '2026-10-07T12:00:00.000Z')], '2026-10-07')).toBe(false);
  });

  it('já revisada: aparece só depois de mais de 6 meses da última revisão', () => {
    expect(subscriptionReminderDue([at('2026-04-07')], '2026-10-07')).toBe(false); // exatamente 6 meses
    expect(subscriptionReminderDue([at('2026-04-07')], '2026-10-08')).toBe(true); // 6 meses e 1 dia
    expect(subscriptionReminderDue([at('2026-04-08')], '2026-10-08')).toBe(false);
    expect(subscriptionReminderDue([at('2026-09-01')], '2026-10-07')).toBe(false);
    // Uma revisão recente vale mesmo que a assinatura seja antiga (o "3 meses" é só para quem nunca revisou).
    expect(subscriptionReminderDue([at('2026-09-01', '2020-01-01T12:00:00.000Z')], '2026-10-07')).toBe(false);
    // Revisão no futuro (relógio do aparelho para trás): não aparece.
    expect(subscriptionReminderDue([at('2026-12-01')], '2026-10-07')).toBe(false);
  });

  it('com várias, vale a revisão mais recente; uma assinatura nova sem revisão não liga o aviso se outra foi revisada', () => {
    const list = [at('2025-12-01', '2025-11-01T12:00:00.000Z'), { ...at('2026-08-15'), id: 'b' }, { ...at(null, '2026-09-01T12:00:00.000Z'), id: 'c' }];
    expect(lastSubscriptionReview(list, '2026-10-07')).toBe('2026-08-15');
    expect(subscriptionReminderDue(list, '2026-10-07')).toBe(false);
    // Se só a antiga foi revisada, vale a data dela.
    expect(subscriptionReminderDue([at('2025-12-01'), { ...at(null, '2026-09-01T12:00:00.000Z'), id: 'c' }], '2026-10-07')).toBe(true);
    expect(oldestSubscriptionDay([at(null, '2026-03-04T12:00:00.000Z'), { ...at(null, '2026-02-01T12:00:00.000Z'), id: 'z' }], '2026-10-07')).toBe('2026-02-01');
  });

  it('sem assinatura ativa não há aviso; encerradas, desmarcadas e outros tipos não contam', () => {
    expect(subscriptionReminderDue([], DEMO_TODAY)).toBe(false);
    expect(subscriptionReminderDue([at(null, '2020-01-01T12:00:00.000Z')].map((s) => ({ ...s, subscription: false })), DEMO_TODAY)).toBe(false);
    expect(subscriptionReminderDue([{ ...at(null, '2020-01-01T12:00:00.000Z'), lastNumber: 0 }], DEMO_TODAY)).toBe(false);
    expect(subscriptionReminderDue([{ ...at(null, '2020-01-01T12:00:00.000Z'), kind: 'parcelada' as const }], DEMO_TODAY)).toBe(false);
    expect(lastSubscriptionReview([], DEMO_TODAY)).toBeNull();
    expect(oldestSubscriptionDay([], DEMO_TODAY)).toBeNull();
    // A revisão de uma encerrada não conta para a última revisão.
    expect(lastSubscriptionReview([{ ...at('2026-09-01'), lastNumber: 0 }], DEMO_TODAY)).toBeNull();
  });

  it('"Agora não" esconde por 30 dias, só neste aparelho', () => {
    expect(subscriptionSnoozeUntil('2026-10-07')).toBe('2026-11-06');
    expect(subscriptionSnoozeUntil('2026-12-15')).toBe('2027-01-14');
    expect(subscriptionSnoozed('2026-11-06', '2026-10-07')).toBe(true);
    expect(subscriptionSnoozed('2026-11-06', '2026-11-05')).toBe(true);
    expect(subscriptionSnoozed('2026-11-06', '2026-11-06')).toBe(false); // no 30º dia o aviso volta
    expect(subscriptionSnoozed(null, '2026-10-07')).toBe(false);
    expect(subscriptionSnoozed(undefined, '2026-10-07')).toBe(false);
    expect(subscriptionSnoozed('texto', '2026-10-07')).toBe(false);
    expect(subscriptionSnoozed('2026-11-6', '2026-10-07')).toBe(false);
    const due = [at(null, '2026-03-01T12:00:00.000Z')];
    expect(subscriptionReminderVisible(due, '2026-10-07', null)).toBe(true);
    expect(subscriptionReminderVisible(due, '2026-10-07', '2026-11-06')).toBe(false);
    expect(subscriptionReminderVisible(due, '2026-11-06', '2026-11-06')).toBe(true);
    // Não devido: nunca visível.
    expect(subscriptionReminderVisible([at('2026-09-01')], '2026-10-07', null)).toBe(false);
  });
});

describe('assinaturas: textos (D-046)', () => {
  it('os textos da especificação', () => {
    expect(SUBSCRIPTION_TEXT.switchLabel).toBe('É uma assinatura?');
    expect(SUBSCRIPTION_TEXT.switchCaption).toBe('Streaming, aplicativo, academia, clube, plano de celular.');
    expect(SUBSCRIPTION_TEXT.groupTitle).toBe('Assinaturas');
    expect(SUBSCRIPTION_TEXT.totals(13890, 166680)).toBe('R$ 138,90 por mês · R$ 1.666,80 por ano');
    expect(SUBSCRIPTION_TEXT.perYear(47880)).toBe('R$ 478,80 por ano');
    expect(SUBSCRIPTION_TEXT.reviewTitle).toBe('Revisar assinaturas');
    expect(SUBSCRIPTION_TEXT.reviewIntro).toBe('Vale olhar de tempos em tempos se cada uma ainda é usada.');
    expect(SUBSCRIPTION_TEXT.endFrom).toBe('Encerrar a partir de…');
    expect(SUBSCRIPTION_TEXT.keeps).toBe('Continua');
    expect(SUBSCRIPTION_TEXT.reviewedButton).toBe('Revisei minhas assinaturas');
    expect(SUBSCRIPTION_TEXT.reminderTitle).toBe('Faz tempo que você não revisa suas assinaturas.');
    expect(SUBSCRIPTION_TEXT.reminderReview).toBe('Revisar agora');
    expect(SUBSCRIPTION_TEXT.reminderLater).toBe('Agora não');
    expect(SUBSCRIPTION_TEXT.lastReview(null)).toBe('Você ainda não registrou uma revisão.');
    expect(SUBSCRIPTION_TEXT.lastReview('2026-10-07')).toBe('Última revisão: 07/10/2026.');
    expect(SUBSCRIPTION_TEXT.keepsCount(2, 3)).toBe('2 de 3 marcadas como Continua');
  });

  it('o texto de um erro desconhecido cai em "Não foi possível salvar"', () => {
    expect(subscriptionErrorText('assinatura_so_gasto_fixo')).toBe(SUBSCRIPTION_ERROR_TEXT.assinatura_so_gasto_fixo);
    expect(subscriptionErrorText('qualquer_coisa')).toBe(SUBSCRIPTION_ERROR_TEXT.salvar_falhou);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// MemoryRepository: as mesmas regras de set_series_subscription e mark_subscriptions_reviewed
// ---------------------------------------------------------------------------------------------------------------------

function memory(today: { value: IsoDate } = { value: DEMO_TODAY }) {
  const repo = new MemoryRepository({ actorId: 'pessoa-teste', displayName: 'Pessoa de teste', today: () => today.value });
  return { repo, today };
}

const monthly = (description: string, amountCents: number, firstDueMonth = '2026-10', lastMonth: string | null = null): SeriesInput => ({
  kind: 'mensal',
  nature: 'conta',
  description,
  category: 'Lazer',
  amountCents,
  amountMode: 'fixo',
  dueDay: 10,
  firstDueMonth,
  firstNumber: 1,
  installmentTotal: null,
  partsPerYear: null,
  lastMonth,
});

async function seeded() {
  const t = memory();
  const space = await t.repo.ensurePersonalSpace('Conta principal');
  const ctx = space.personalContextId;
  const stream = (await t.repo.createSeries(key(), ctx, monthly('Streaming', 3990))).series;
  return { ...t, ctx, stream, accountId: space.accounts[0]!.id };
}

describe('MemoryRepository: marcar e desmarcar assinatura (set_series_subscription)', () => {
  it('a série nasce sem a marca e sem data de revisão', async () => {
    const { stream } = await seeded();
    expect(stream.subscription).toBe(false);
    expect(stream.subscriptionReviewedOn).toBeNull();
    expect(stream.version).toBe(1);
  });

  it('marcar sobe a versão, devolve a série e as ocorrências, e grava a operação', async () => {
    const { repo, stream } = await seeded();
    const k = key();
    const w = await repo.setSeriesSubscription(k, stream.id, 1, true);
    expect(w.changed).toBe(1);
    expect(w.series).toMatchObject({ id: stream.id, subscription: true, subscriptionReviewedOn: null, version: 2 });
    expect(w.occurrences.length).toBeGreaterThan(0);
    expect(await repo.findSeriesOperation(k)).toEqual({ action: 'marcar_assinatura', seriesId: stream.id });
    expect((await repo.getSeries(stream.id))!.subscription).toBe(true);
    expect((await repo.listSeries(stream.contextId))[0]!.subscription).toBe(true);
  });

  it('marcar o que já está marcado, ou desmarcar o que não está, não muda nada nem sobe a versão', async () => {
    const { repo, stream } = await seeded();
    const none = await repo.setSeriesSubscription(key(), stream.id, 1, false);
    expect(none.changed).toBe(0);
    expect(none.series.version).toBe(1);
    await repo.setSeriesSubscription(key(), stream.id, 1, true);
    const again = await repo.setSeriesSubscription(key(), stream.id, 2, true);
    expect(again.changed).toBe(0);
    expect(again.series).toMatchObject({ subscription: true, version: 2 });
  });

  it('a versão esperada precisa ser a atual', async () => {
    const { repo, stream } = await seeded();
    await expectCode(repo.setSeriesSubscription(key(), stream.id, 2, true), 'versao_desatualizada');
    await expectCode(repo.setSeriesSubscription(key(), stream.id, 0, true), 'versao_desatualizada');
    expect((await repo.getSeries(stream.id))!.subscription).toBe(false);
  });

  it('só gasto fixo mensal: parcelamento e conta do ano são recusados, para marcar e para desmarcar', async () => {
    const { repo, ctx } = await seeded();
    const sofa = (
      await repo.createSeries(key(), ctx, {
        ...monthly('Sofá', 20000, '2026-11'),
        kind: 'parcelada',
        nature: 'compra_parcelada',
        installmentTotal: 10,
        firstNumber: 1,
      })
    ).series;
    const ipva = (await repo.createSeries(key(), ctx, { ...monthly('IPVA', 240000, '2027-01'), kind: 'anual', partsPerYear: 1, amountMode: 'variavel' })).series;
    for (const s of [sofa, ipva]) {
      await expectCode(repo.setSeriesSubscription(key(), s.id, 1, true), 'assinatura_so_gasto_fixo');
      await expectCode(repo.setSeriesSubscription(key(), s.id, 1, false), 'assinatura_so_gasto_fixo');
    }
    // A versão vem antes do tipo; a marca inválida vem antes do tipo.
    await expectCode(repo.setSeriesSubscription(key(), sofa.id, 9, true), 'versao_desatualizada');
    await expectCode(repo.setSeriesSubscription(key(), sofa.id, 1, null as never), 'marca_invalida');
    await expectCode(repo.setSeriesSubscription(key(), (await repo.listSeries(ctx))[0]!.id, 1, 'sim' as never), 'marca_invalida');
  });

  it('série que não existe ou foi excluída: nao_encontrado', async () => {
    const { repo, stream } = await seeded();
    await expectCode(repo.setSeriesSubscription(key(), 'nao-existe', 1, true), 'nao_encontrado');
    const open = await repo.listOpenSeriesOccurrences(stream.id);
    await repo.deleteSeries(
      key(),
      stream.id,
      1,
      open.map((c) => ({ id: c.id, version: c.version })),
    );
    await expectCode(repo.setSeriesSubscription(key(), stream.id, 2, true), 'nao_encontrado');
  });

  it('repetição com a mesma chave devolve o estado atual sem gravar; outro conteúdo com a chave é recusado', async () => {
    const { repo, stream } = await seeded();
    const k = key();
    const first = await repo.setSeriesSubscription(k, stream.id, 1, true);
    const replay = await repo.setSeriesSubscription(k, stream.id, 1, true);
    expect(replay.changed).toBe(0);
    expect(replay.series).toEqual(first.series);
    expect((await repo.getSeries(stream.id))!.version).toBe(2);
    await expectCode(repo.setSeriesSubscription(k, stream.id, 1, false), 'chave_reutilizada');
    await expectCode(repo.setSeriesSubscription(k, stream.id, 2, true), 'chave_reutilizada');
    await expectCode(repo.markSubscriptionsReviewed(k, stream.contextId), 'chave_reutilizada');
    await expectCode(repo.endSeries(k, stream.id, 2, null, []), 'chave_reutilizada');
  });

  it('desmarcar apaga a data da revisão e marcar de novo começa sem data', async () => {
    const { repo, ctx, stream } = await seeded();
    await repo.setSeriesSubscription(key(), stream.id, 1, true);
    await repo.markSubscriptionsReviewed(key(), ctx);
    expect((await repo.getSeries(stream.id))!.subscriptionReviewedOn).toBe(DEMO_TODAY);
    const off = await repo.setSeriesSubscription(key(), stream.id, 2, false);
    expect(off.series).toMatchObject({ subscription: false, subscriptionReviewedOn: null, version: 3 });
    const on = await repo.setSeriesSubscription(key(), stream.id, 3, true);
    expect(on.series).toMatchObject({ subscription: true, subscriptionReviewedOn: null, version: 4 });
  });

  it('a marca sobrevive a editar a partir de um mês, encerrar e retomar', async () => {
    const { repo, stream } = await seeded();
    await repo.setSeriesSubscription(key(), stream.id, 1, true);
    const open = (await repo.listOpenSeriesOccurrences(stream.id)).filter((c) => c.series!.number >= 2);
    const edited = await repo.updateSeriesFrom(
      key(),
      stream.id,
      2,
      2,
      open.map((c) => ({ id: c.id, version: c.version })),
      { nature: 'conta', description: 'Streaming', category: 'Lazer', amountCents: 4490, amountMode: 'fixo', dueDay: 10 },
    );
    expect(edited.series).toMatchObject({ subscription: true, version: 3 });
    const gone = (await repo.listOpenSeriesOccurrences(stream.id)).filter((c) => c.series!.number > 1);
    const ended = await repo.endSeries(
      key(),
      stream.id,
      3,
      1,
      gone.map((c) => ({ id: c.id, version: c.version })),
    );
    expect(ended.series.subscription).toBe(true);
    const resumed = await repo.endSeries(key(), stream.id, 4, null, []);
    expect(resumed.series).toMatchObject({ subscription: true, version: 5 });
  });

  it('não mexe em contas a pagar, registros nem totais do mês', async () => {
    const { repo, ctx, stream } = await seeded();
    const before = JSON.stringify([await repo.listCommitments(ctx, '2026-10'), await repo.listRecords(ctx, '2026-10')]);
    const totalsBefore = summarizeMonth(await repo.listRecords(ctx, '2026-10'), ctx, '2026-10');
    await repo.setSeriesSubscription(key(), stream.id, 1, true);
    await repo.markSubscriptionsReviewed(key(), ctx);
    expect(JSON.stringify([await repo.listCommitments(ctx, '2026-10'), await repo.listRecords(ctx, '2026-10')])).toBe(before);
    expect(summarizeMonth(await repo.listRecords(ctx, '2026-10'), ctx, '2026-10')).toEqual(totalsBefore);
  });

  it('falha de rede antes não grava; depois grava e a repetição reconhece', async () => {
    const { repo, stream } = await seeded();
    const k = key();
    repo.failNextWrite = 'antes';
    await expectCode(repo.setSeriesSubscription(k, stream.id, 1, true), 'rede');
    expect((await repo.getSeries(stream.id))!.subscription).toBe(false);
    repo.failNextWrite = 'depois';
    await expectCode(repo.setSeriesSubscription(k, stream.id, 1, true), 'rede');
    expect((await repo.getSeries(stream.id))!.subscription).toBe(true);
    const replay = await repo.setSeriesSubscription(k, stream.id, 1, true);
    expect(replay.series.version).toBe(2);
    expect((await repo.getSeries(stream.id))!.version).toBe(2);
  });
});

describe('MemoryRepository: "Revisei minhas assinaturas" (mark_subscriptions_reviewed)', () => {
  async function withSeveral() {
    const base = await seeded();
    const { repo, ctx, stream } = base;
    const gym = (await repo.createSeries(key(), ctx, monthly('Academia', 9900, '2026-11'))).series;
    const clube = (await repo.createSeries(key(), ctx, monthly('Clube', 4500, '2026-09', '2026-09'))).series;
    const revista = (await repo.createSeries(key(), ctx, monthly('Revista', 1990))).series;
    const aluguel = (await repo.createSeries(key(), ctx, monthly('Aluguel', 250000))).series;
    for (const s of [stream, gym, clube, revista]) await repo.setSeriesSubscription(key(), s.id, 1, true);
    const open = await repo.listOpenSeriesOccurrences(revista.id);
    await repo.deleteSeries(
      key(),
      revista.id,
      2,
      open.map((c) => ({ id: c.id, version: c.version })),
    );
    return { ...base, gym, clube, revista, aluguel };
  }

  it('só as ativas recebem a data de hoje; encerrada, excluída e gasto fixo comum ficam como estão; a versão não sobe', async () => {
    const { repo, ctx, stream, gym, clube, aluguel } = await withSeveral();
    const r = await repo.markSubscriptionsReviewed(key(), ctx);
    expect(r).toEqual({ reviewedOn: DEMO_TODAY, changed: 2 });
    const get = async (id: string) => (await repo.getSeries(id))!;
    expect(await get(stream.id)).toMatchObject({ subscriptionReviewedOn: DEMO_TODAY, version: 2 });
    expect(await get(gym.id)).toMatchObject({ subscriptionReviewedOn: DEMO_TODAY, version: 2 });
    expect(await get(clube.id)).toMatchObject({ subscriptionReviewedOn: null, version: 2 });
    expect(await get(aluguel.id)).toMatchObject({ subscription: false, subscriptionReviewedOn: null, version: 1 });
  });

  it('sem assinatura ativa vale e muda 0; repetir no mesmo dia não muda nada', async () => {
    const { repo, ctx } = await seeded();
    expect(await repo.markSubscriptionsReviewed(key(), ctx)).toEqual({ reviewedOn: DEMO_TODAY, changed: 0 });
    const { repo: repo2, ctx: ctx2 } = await withSeveral();
    expect((await repo2.markSubscriptionsReviewed(key(), ctx2)).changed).toBe(2);
    expect(await repo2.markSubscriptionsReviewed(key(), ctx2)).toEqual({ reviewedOn: DEMO_TODAY, changed: 0 });
  });

  it('a data nunca recua e no dia seguinte muda de novo', async () => {
    const { repo, today, ctx, stream } = { ...(await withSeveral()) };
    await repo.markSubscriptionsReviewed(key(), ctx);
    today.value = '2026-10-01';
    expect((await repo.markSubscriptionsReviewed(key(), ctx)).changed).toBe(0);
    expect((await repo.getSeries(stream.id))!.subscriptionReviewedOn).toBe(DEMO_TODAY);
    today.value = '2026-10-08';
    expect(await repo.markSubscriptionsReviewed(key(), ctx)).toEqual({ reviewedOn: '2026-10-08', changed: 2 });
    expect((await repo.getSeries(stream.id))!.subscriptionReviewedOn).toBe('2026-10-08');
  });

  it('a retomada de uma encerrada a traz de volta para a revisão; desmarcar a tira', async () => {
    const { repo, today, ctx, stream, clube } = { ...(await withSeveral()) };
    await repo.endSeries(key(), clube.id, 2, null, []);
    today.value = '2026-10-09';
    expect((await repo.markSubscriptionsReviewed(key(), ctx)).changed).toBe(3);
    expect((await repo.getSeries(clube.id))!.subscriptionReviewedOn).toBe('2026-10-09');
    await repo.setSeriesSubscription(key(), stream.id, 2, false);
    today.value = '2026-10-10';
    expect((await repo.markSubscriptionsReviewed(key(), ctx)).changed).toBe(2);
  });

  it('repetição com a mesma chave devolve a data mais recente, sem gravar; outro contexto com a chave é recusado', async () => {
    const { repo, ctx } = await withSeveral();
    const k = key();
    await repo.markSubscriptionsReviewed(k, ctx);
    expect(await repo.markSubscriptionsReviewed(k, ctx)).toEqual({ reviewedOn: DEMO_TODAY, changed: 0 });
    await expectCode(repo.markSubscriptionsReviewed(k, 'outro-contexto'), 'chave_reutilizada');
  });

  it('contexto que não é da pessoa: sem_permissao', async () => {
    const { repo } = await seeded();
    await expectCode(repo.markSubscriptionsReviewed(key(), 'outro-contexto'), 'sem_permissao');
  });

  it('marcar conta como anotação na atividade; revisar não conta', async () => {
    const today = { value: '2026-10-07' as IsoDate };
    const { repo } = memory(today);
    const space = await repo.ensurePersonalSpace('Conta principal');
    const ctx = space.personalContextId;
    const stream = (await repo.createSeries(key(), ctx, monthly('Streaming', 3990))).series;
    expect((await repo.getReturnReviewState(ctx)).activity).toMatchObject({ lastWriteOn: '2026-10-07', absenceFromOn: null });
    // 74 dias depois, revisar não é anotação: a última anotação e a ausência ficam como estavam.
    today.value = '2026-12-20';
    await repo.markSubscriptionsReviewed(key(), ctx);
    expect((await repo.getReturnReviewState(ctx)).activity).toMatchObject({ lastWriteOn: '2026-10-07', absenceFromOn: null, absenceUntilOn: null });
    // Marcar conta como anotação e registra a ausência.
    await repo.setSeriesSubscription(key(), stream.id, 1, true);
    expect((await repo.getReturnReviewState(ctx)).activity).toEqual({ lastWriteOn: '2026-12-20', absenceFromOn: '2026-10-07', absenceUntilOn: '2026-12-20' });
  });

  it('o cadastro de cada série leva o dia da pessoa, não o relógio do aparelho', async () => {
    const today = { value: '2026-06-30' as IsoDate };
    const { repo } = memory(today);
    const ctx = (await repo.ensurePersonalSpace('Conta principal')).personalContextId;
    const s = (await repo.createSeries(key(), ctx, monthly('Streaming', 3990, '2026-07'))).series;
    expect(createdDay(s)).toBe('2026-06-30');
    expect(s.createdAt).toMatch(/^2026-06-30T12:00:00\.\d{3}Z$/);
  });
});

describe('assinaturas na demonstração e em conta nova (D-046)', () => {
  it('a demonstração tem duas assinaturas de exemplo e os totais de outubro não mudam', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const list = await repo.listSeries(ctx);
    const rows = subscriptionRows(list, DEMO_TODAY);
    expect(rows.map((r) => [r.name, r.monthlyCents, r.yearlyCents, r.estimated])).toEqual([
      ['Academia (exemplo)', 9900, 118800, false],
      ['Streaming (exemplo)', 3990, 47880, false],
    ]);
    expect(subscriptionTotals(list, DEMO_TODAY)).toEqual({ count: 2, monthlyCents: 13890, yearlyCents: 166680, estimatedMonthlyCents: 0 });
    // Só gastos fixos mensais viram assinatura: o resto da demonstração continua sem marca.
    expect(list.filter((s) => s.subscription).map((s) => s.kind)).toEqual(['mensal', 'mensal']);
    // Outubro: 6.000 / 3.900 / 2.100 e R$ 650 a pagar, como antes.
    const month = summarizeMonth(await repo.listRecords(ctx, '2026-10'), ctx, '2026-10');
    expect([month.receivedCents, month.paidCents, month.differenceCents]).toEqual([600000, 390000, 210000]);
    const toPay = summarizeToPay(await repo.listCommitments(ctx, '2026-10'), ctx, '2026-10', DEMO_TODAY);
    expect(toPay.toPayCents).toBe(65000);
    // Nenhuma conta delas existe (a primeira é em junho de 2027).
    for (const s of list.filter((x) => x.subscription)) {
      expect(s.firstDueMonth).toBe('2027-06');
      expect([s.openCount, s.paidCount]).toEqual([0, 0]);
    }
    // A demonstração padrão não mostra o lembrete: as assinaturas são de hoje.
    expect(subscriptionReminderDue(list, DEMO_TODAY)).toBe(false);
  });

  it("o cenário 'assinaturas' tem as mesmas assinaturas cadastradas em 30/06/2026, nunca revisadas: o lembrete aparece e some com a revisão", async () => {
    expect(demoScenarioFrom('assinaturas')).toBe('assinaturas');
    expect(demoScenarioFrom(' Assinaturas ')).toBe('assinaturas');
    expect(DEMO_SUBSCRIPTIONS_SETUP_DAY).toBe('2026-06-30');
    const repo = await createDemoRepository({ scenario: 'assinaturas' });
    const ctx = (await repo.getSpace())!.personalContextId;
    const list = await repo.listSeries(ctx);
    expect(subscriptionTotals(list, DEMO_TODAY)).toMatchObject({ count: 2, monthlyCents: 13890, yearlyCents: 166680 });
    expect(list.filter((s) => s.subscription).map((s) => createdDay(s))).toEqual(['2026-06-30', '2026-06-30']);
    expect(oldestSubscriptionDay(list, DEMO_TODAY)).toBe('2026-06-30');
    expect(lastSubscriptionReview(list, DEMO_TODAY)).toBeNull();
    expect(subscriptionReminderDue(list, DEMO_TODAY)).toBe(true);
    // Os totais de outubro e a "Seus últimos meses" não mudam: a atividade não recuou.
    const month = summarizeMonth(await repo.listRecords(ctx, '2026-10'), ctx, '2026-10');
    expect([month.receivedCents, month.paidCents, month.differenceCents]).toEqual([600000, 390000, 210000]);
    expect((await repo.getReturnReviewState(ctx)).activity).toEqual({ lastWriteOn: DEMO_TODAY, absenceFromOn: null, absenceUntilOn: null });
    // "Revisei": a data de hoje, e o aviso some.
    expect(await repo.markSubscriptionsReviewed(key(), ctx)).toEqual({ reviewedOn: DEMO_TODAY, changed: 2 });
    const after = await repo.listSeries(ctx);
    expect(lastSubscriptionReview(after, DEMO_TODAY)).toBe(DEMO_TODAY);
    expect(subscriptionReminderDue(after, DEMO_TODAY)).toBe(false);
    // Seis meses e um dia depois, o aviso volta.
    expect(subscriptionReminderDue(after, '2027-04-08')).toBe(true);
    expect(subscriptionReminderDue(after, '2027-04-07')).toBe(false);
  });

  it('conta nova não tem série nem assinatura de exemplo', async () => {
    const { repo } = memory();
    const ctx = (await repo.ensurePersonalSpace('Conta principal')).personalContextId;
    const list = await repo.listSeries(ctx);
    expect(list).toEqual([]);
    expect(subscriptionTotals(list, DEMO_TODAY).count).toBe(0);
    expect(subscriptionReminderDue(list, DEMO_TODAY)).toBe(false);
  });

  it('o tipo CommitmentSeries traz a marca e a data (contrato com o app)', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const s: CommitmentSeries = (await repo.listSeries(ctx))[0]!;
    expect(typeof s.subscription).toBe('boolean');
    expect(s.subscriptionReviewedOn).toBeNull();
    // A chave de operação de uma série qualquer reconhece 'marcar_assinatura' como ação de série.
    const k = key();
    await repo.setSeriesSubscription(k, (await repo.listSeries(ctx)).find((x) => x.kind === 'mensal' && !x.subscription)!.id, 1, true);
    expect((await repo.findSeriesOperation(k))?.action).toBe('marcar_assinatura');
  });
});

describe('sequência de aceite das assinaturas (docs/02)', () => {
  it('os doze passos, com os totais de outubro iguais em todos', async () => {
    const today = { value: '2026-10-07' as IsoDate };
    const { repo } = memory(today);
    const ctx = (await repo.ensurePersonalSpace('Conta principal')).personalContextId;
    const totals = async () => {
      const m = summarizeMonth(await repo.listRecords(ctx, '2026-10'), ctx, '2026-10');
      const p = summarizeToPay(await repo.listCommitments(ctx, '2026-10'), ctx, '2026-10', today.value);
      return [m.receivedCents, m.paidCents, m.differenceCents, p.dueInMonthCents];
    };
    const base = await totals();
    // 1. Cadastrar "Streaming" sem a marca.
    const created = (await repo.createSeries(key(), ctx, monthly('Streaming', 3990))).series;
    const afterCreate = await totals();
    expect(created.subscription).toBe(false);
    expect(subscriptionTotals(await repo.listSeries(ctx), today.value).count).toBe(0);
    // 2. Marcar: versão 2; por mês R$ 39,90, por ano R$ 478,80.
    const marked = (await repo.setSeriesSubscription(key(), created.id, 1, true)).series;
    expect(marked.version).toBe(2);
    expect(subscriptionTotals(await repo.listSeries(ctx), today.value)).toMatchObject({ count: 1, monthlyCents: 3990, yearlyCents: 47880 });
    // 3. Marcar de novo, com a versão 2: nada muda.
    const again = await repo.setSeriesSubscription(key(), created.id, 2, true);
    expect([again.changed, again.series.version]).toEqual([0, 2]);
    // 4. Marcar com a versão 1: versao_desatualizada.
    await expectCode(repo.setSeriesSubscription(key(), created.id, 1, true), 'versao_desatualizada');
    // 5. Parcelamento e conta do ano.
    const sofa = (await repo.createSeries(key(), ctx, { ...monthly('Sofá', 20000, '2026-11'), kind: 'parcelada', nature: 'compra_parcelada', installmentTotal: 10 })).series;
    const ipva = (await repo.createSeries(key(), ctx, { ...monthly('IPVA', 240000, '2027-01'), kind: 'anual', partsPerYear: 1, amountMode: 'variavel' })).series;
    await expectCode(repo.setSeriesSubscription(key(), sofa.id, 1, true), 'assinatura_so_gasto_fixo');
    await expectCode(repo.setSeriesSubscription(key(), ipva.id, 1, true), 'assinatura_so_gasto_fixo');
    // 6. "Revisei minhas assinaturas": revisão de 07/10/2026, versão 2, Pago e Ainda a pagar iguais.
    expect(await repo.markSubscriptionsReviewed(key(), ctx)).toEqual({ reviewedOn: '2026-10-07', changed: 1 });
    expect(await repo.getSeries(created.id)).toMatchObject({ subscriptionReviewedOn: '2026-10-07', version: 2 });
    expect(await totals()).toEqual(afterCreate);
    // 7. De novo no mesmo dia, e com o relógio um dia antes: nada muda.
    expect((await repo.markSubscriptionsReviewed(key(), ctx)).changed).toBe(0);
    today.value = '2026-10-06';
    expect((await repo.markSubscriptionsReviewed(key(), ctx)).changed).toBe(0);
    expect((await repo.getSeries(created.id))!.subscriptionReviewedOn).toBe('2026-10-07');
    // 8. No dia seguinte, a data passa a 08/10/2026.
    today.value = '2026-10-08';
    expect((await repo.markSubscriptionsReviewed(key(), ctx)).changed).toBe(1);
    expect((await repo.getSeries(created.id))!.subscriptionReviewedOn).toBe('2026-10-08');
    // 9. Encerrar o Streaming em setembro (nenhuma conta): sai das somas e da revisão; a marca continua.
    today.value = '2026-10-07';
    const open = (await repo.listOpenSeriesOccurrences(created.id)).map((c) => ({ id: c.id, version: c.version }));
    await repo.endSeries(key(), created.id, 2, 0, open);
    const ended = (await repo.getSeries(created.id))!;
    expect(ended.subscription).toBe(true);
    expect(subscriptionTotals(await repo.listSeries(ctx), today.value).count).toBe(0);
    today.value = '2026-10-09';
    expect((await repo.markSubscriptionsReviewed(key(), ctx)).changed).toBe(0);
    // 10. Retomar sem data para terminar: volta às somas e à revisão.
    today.value = '2026-10-07';
    await repo.endSeries(key(), created.id, ended.version, null, []);
    expect(subscriptionTotals(await repo.listSeries(ctx), today.value).count).toBe(1);
    today.value = '2026-10-10';
    expect((await repo.markSubscriptionsReviewed(key(), ctx)).changed).toBe(1);
    // 11. Desmarcar: sem marca e sem data; a versão sobe 1.
    const before = (await repo.getSeries(created.id))!;
    const off = (await repo.setSeriesSubscription(key(), created.id, before.version, false)).series;
    expect(off).toMatchObject({ subscription: false, subscriptionReviewedOn: null, version: before.version + 1 });
    // 12. O lembrete: 6 meses e 1 dia depois de uma revisão, ou 3 meses sem nenhuma.
    await repo.setSeriesSubscription(key(), created.id, off.version, true);
    today.value = '2026-10-07';
    await repo.markSubscriptionsReviewed(key(), ctx);
    const list = await repo.listSeries(ctx);
    expect(subscriptionReminderDue(list, '2027-04-07')).toBe(false);
    expect(subscriptionReminderDue(list, '2027-04-08')).toBe(true);
    expect(subscriptionReminderVisible(list, '2027-04-08', subscriptionSnoozeUntil('2027-04-08'))).toBe(false);
    // Os totais de outubro foram os mesmos em todos os passos (o cadastro de contas é o único que acrescenta "Ainda a pagar").
    expect((await totals()).slice(0, 3)).toEqual(base.slice(0, 3));
  });
});
