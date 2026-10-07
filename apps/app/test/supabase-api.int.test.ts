/// <reference types="node" />
/**
 * Teste de integração: o repositório do app falando com o banco real através de uma API
 * compatível com a do Supabase (PostgREST), com tokens de pessoas diferentes.
 * Executado por `npm run test:api` (ver supabase/tests/run_api.sh). Pessoas FICTÍCIAS.
 */
import { createHmac, randomUUID } from 'node:crypto';

import { RepoError, newOperationKey, summarizeMonth, type RecordInput } from '@clarevo/core';
import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

import { SupabaseRepository } from '../src/lib/supabase-repository';

const API = process.env.CLAREVO_API_URL!;
const SECRET = process.env.CLAREVO_JWT_SECRET!;
const ANA = process.env.CLAREVO_ANA!;
const BRUNO = process.env.CLAREVO_BRUNO!;
const EVA = process.env.CLAREVO_EVA!;

function jwt(payload: Record<string, unknown>) {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ exp: Math.floor(Date.now() / 1000) + 3600, ...payload })}`;
  return `${body}.${createHmac('sha256', SECRET).update(body).digest('base64url')}`;
}

const ANON_KEY = () => jwt({ role: 'anon' });

function clientFor(personId: string | null) {
  const token = personId ? jwt({ role: 'authenticated', sub: personId }) : ANON_KEY();
  return createClient(API, ANON_KEY(), { accessToken: async () => token });
}

const repoFor = (id: string) => new SupabaseRepository(clientFor(id), { id });

const err = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e instanceof RepoError ? e.code : String(e)));

describe('API real: espaço pessoal, registros e permissões', () => {
  const ana = repoFor(ANA);
  const bruno = repoFor(BRUNO);
  let ctx = '';
  let account = '';
  const input = (reais: number, occurredOn = '2026-10-07', description = 'Café'): RecordInput => ({
    accountId: account,
    amountCents: Math.round(reais * 100),
    occurredOn,
    description,
    category: null,
  });
  const totals = async () => {
    const s = summarizeMonth(await ana.listRecords(ctx, '2026-10'), ctx, '2026-10');
    return [s.receivedCents / 100, s.paidCents / 100, s.differenceCents / 100];
  };

  beforeAll(async () => {
    expect(await ana.getSpace()).toBeNull();
    const space = await ana.ensurePersonalSpace('Conta principal');
    ctx = space.personalContextId;
    account = space.accounts[0]!.id;
    await bruno.ensurePersonalSpace('Conta do Bruno');
  });

  it('e-mail não confirmado não cria espaço', async () => {
    expect(await err(repoFor(EVA).ensurePersonalSpace('Conta principal'))).toBe('email_nao_confirmado');
  });

  it('primeira conta é criada uma única vez, sem dados de exemplo', async () => {
    const again = await ana.ensurePersonalSpace('Outro nome');
    expect(again.personalContextId).toBe(ctx);
    expect(again.accounts).toHaveLength(1);
    expect(again.accounts[0]!.name).toBe('Conta principal');
    expect(again.accounts[0]!.initialBalanceCents).toBeNull();
    expect(await ana.listRecords(ctx, '2026-10')).toEqual([]);
    expect(await ana.listCommitments(ctx, '2026-10')).toEqual([]);
  });

  it('sequência de aceite pela API', async () => {
    await ana.createRecord(newOperationKey(), ctx, 'receita', input(6000, '2026-10-01', 'Salário'));
    await ana.createRecord(newOperationKey(), ctx, 'despesa', input(2500, '2026-10-05', 'Aluguel'));
    await ana.createRecord(newOperationKey(), ctx, 'despesa', input(1400, '2026-10-06', 'Mercado'));
    expect(await totals()).toEqual([6000, 3900, 2100]);

    const g = await ana.createRecord(newOperationKey(), ctx, 'despesa', input(80));
    expect(await totals()).toEqual([6000, 3980, 2020]);
    const g2 = await ana.updateRecord(newOperationKey(), g.id, g.version, input(95));
    expect([g2.id, g2.version]).toEqual([g.id, g.version + 1]);
    expect(await totals()).toEqual([6000, 3995, 2005]);
    await ana.deleteRecord(newOperationKey(), g.id, g2.version);
    expect(await totals()).toEqual([6000, 3900, 2100]);

    const r = await ana.createRecord(newOperationKey(), ctx, 'receita', input(200, '2026-10-07', 'Freela'));
    expect(await totals()).toEqual([6200, 3900, 2300]);
    const r2 = await ana.updateRecord(newOperationKey(), r.id, r.version, input(250, '2026-10-07', 'Freela'));
    expect(await totals()).toEqual([6250, 3900, 2350]);
    await ana.deleteRecord(newOperationKey(), r.id, r2.version);
    expect(await totals()).toEqual([6000, 3900, 2100]);
    expect(await ana.getRecord(r.id)).toBeNull();
  });

  it('repetir a operação devolve o mesmo registro; mesma chave com outro conteúdo é recusada', async () => {
    const key = newOperationKey();
    const a = await ana.createRecord(key, ctx, 'despesa', input(10));
    const b = await ana.createRecord(key, ctx, 'despesa', input(10));
    expect(b.id).toBe(a.id);
    expect((await ana.findOperation(key))?.recordId).toBe(a.id);
    expect(await err(ana.createRecord(key, ctx, 'despesa', input(11)))).toBe('chave_reutilizada');
    await ana.deleteRecord(newOperationKey(), a.id, a.version);
  });

  it('versão antiga não sobrescreve', async () => {
    const a = await ana.createRecord(newOperationKey(), ctx, 'despesa', input(10));
    const a2 = await ana.updateRecord(newOperationKey(), a.id, a.version, input(12));
    expect(await err(ana.updateRecord(newOperationKey(), a.id, a.version, input(15)))).toBe('versao_desatualizada');
    expect((await ana.getRecord(a.id))!.amountCents).toBe(1200);
    await ana.deleteRecord(newOperationKey(), a.id, a2.version);
  });

  it('validação também no banco', async () => {
    expect(await err(ana.createRecord(newOperationKey(), ctx, 'despesa', input(10, '2026-10-08')))).toBe('data_futura');
    expect(await err(ana.createRecord(newOperationKey(), ctx, 'despesa', input(10, '2026-10-07', 'x'.repeat(81))))).toBe('descricao_longa');
    expect(await err(ana.createRecord(newOperationKey(), ctx, 'despesa', input(10_000_000)))).toBe('valor_acima_do_limite');
    expect(await err(ana.createRecord(newOperationKey(), ctx, 'despesa', { ...input(10), accountId: randomUUID() }))).toBe('conta_invalida');
  });

  it('outra pessoa não lê nem altera por ID, filtro ou operação', async () => {
    const a = await ana.createRecord(newOperationKey(), ctx, 'despesa', input(33, '2026-10-07', 'Privado'));
    const key = newOperationKey();
    await ana.updateRecord(key, a.id, a.version, input(34, '2026-10-07', 'Privado'));
    expect(await bruno.getRecord(a.id)).toBeNull();
    expect(await bruno.listRecords(ctx, '2026-10')).toEqual([]);
    expect(await bruno.findOperation(key)).toBeNull();
    expect(await err(bruno.updateRecord(newOperationKey(), a.id, 2, input(1)))).toBe('nao_encontrado');
    expect(await err(bruno.deleteRecord(newOperationKey(), a.id, 2))).toBe('nao_encontrado');
    expect(await err(bruno.createRecord(newOperationKey(), ctx, 'despesa', input(1)))).toBe('sem_permissao');
    expect(await err(bruno.renameAccount(account, 'Invasão'))).toBe('nao_encontrado');
    expect((await ana.getRecord(a.id))!.amountCents).toBe(3400);
  });

  it('gravação direta na tabela é recusada; sem sessão nada é visível', async () => {
    const direct = await clientFor(ANA)
      .from('financial_records')
      .insert({ context_id: ctx, account_id: account, kind: 'despesa', amount_cents: 1, currency: 'BRL', occurred_on: '2026-10-07', description: 'x', created_by: ANA });
    expect(direct.error).not.toBeNull();
    const anon = await clientFor(null).from('financial_records').select('id');
    expect(anon.data ?? []).toEqual([]);
    const rpc = await clientFor(null).rpc('ensure_personal_space', { p_account_name: 'x' });
    expect(rpc.error).not.toBeNull();
  });

  it('renomear a própria conta', async () => {
    await ana.renameAccount(account, 'Conta corrente');
    expect((await ana.getSpace())!.accounts[0]!.name).toBe('Conta corrente');
    expect(await err(ana.renameAccount(account, '   '))).toBe('nome_da_conta_invalido');
  });
});
