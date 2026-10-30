/// <reference types="node" />
/**
 * Teste de integração da imagem das metas (D-077): o repositório do app (SupabaseRepository) falando com o banco real pela API
 * (PostgREST), com a pessoa só deste teste. Executado por `npm run test:api` (supabase/tests/run_api.sh). Pessoas FICTÍCIAS.
 */
import { createHmac } from 'node:crypto';

import { isRepoError, newOperationKey } from '@clarevo/core';
import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

import { SupabaseRepository } from '../src/lib/supabase-repository';

const API = process.env.CLAREVO_API_URL!;
const SECRET = process.env.CLAREVO_JWT_SECRET!;
const HUGO = process.env.CLAREVO_HUGO!;

function jwt(payload: Record<string, unknown>) {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ exp: Math.floor(Date.now() / 1000) + 3600, ...payload })}`;
  return `${body}.${createHmac('sha256', SECRET).update(body).digest('base64url')}`;
}
const ANON_KEY = jwt({ role: 'anon' });
const repo = new SupabaseRepository(createClient(API, ANON_KEY, { accessToken: async () => jwt({ role: 'authenticated', sub: HUGO }) }), { id: HUGO });

const JPEG = Buffer.concat([Buffer.from('ffd8ffe000104a464946', 'hex'), Buffer.alloc(2000, 7)]).toString('base64');
const code = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (isRepoError(e) ? e.code : String(e)));

let ctx = '';
beforeAll(async () => {
  ctx = (await repo.ensurePersonalSpace('Conta principal')).personalContextId;
});

describe('Imagem das metas pela API', () => {
  it('sugestão, foto (lida à parte, igual à enviada), automática e exclusão da meta', async () => {
    const goal = (await repo.createGoal(newOperationKey(), ctx, {
      goalType: 'objetivo', name: 'Lua de mel na Grécia', targetCents: 900_000, targetMonth: null, plannedMonthlyCents: null,
      essentialBaseCents: null, essentialMonths: null, essentialBaseSource: null, initialCents: null, initialOn: null,
    })).goal;
    expect(await repo.listGoalImages(ctx)).toEqual([]);
    const a = await repo.setGoalImage(newOperationKey(), goal.id, 0, { kind: 'sugestao', key: 'viagem' });
    expect(a).toMatchObject({ goalId: goal.id, imageKey: 'viagem', hasPhoto: false, version: 1 });
    const b = await repo.setGoalImage(newOperationKey(), goal.id, 1, { kind: 'foto', base64: JPEG });
    expect(b).toMatchObject({ imageKey: null, hasPhoto: true, version: 2 });
    expect(await repo.getGoalPhoto(goal.id)).toEqual({ mime: 'image/jpeg', base64: JPEG, version: 2 });
    expect(await repo.listGoalImages(ctx)).toEqual([b]);
    expect(await code(repo.setGoalImage(newOperationKey(), goal.id, 2, { kind: 'foto', base64: Buffer.from('GIF89a').toString('base64') }))).toBe('foto_invalida');
    expect(await code(repo.setGoalImage(newOperationKey(), goal.id, 1, { kind: 'automatica' }))).toBe('versao_desatualizada');
    const c = await repo.setGoalImage(newOperationKey(), goal.id, 2, { kind: 'automatica' });
    expect(c).toMatchObject({ imageKey: null, hasPhoto: false, version: 3 });
    expect(await repo.getGoalPhoto(goal.id)).toBeNull();
    await repo.setGoalImage(newOperationKey(), goal.id, 3, { kind: 'foto', base64: JPEG });
    await repo.deleteGoal(newOperationKey(), goal.id, goal.version);
    expect(await repo.listGoalImages(ctx)).toEqual([]);
    expect(await repo.getGoalPhoto(goal.id)).toBeNull();
  });
});
