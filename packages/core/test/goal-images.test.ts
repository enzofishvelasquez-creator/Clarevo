/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import {
  GOAL_IMAGES,
  GOAL_IMAGE_KEYS,
  GOAL_IMAGE_TEXT,
  GOAL_PHOTO_MAX_BYTES,
  GOAL_TEMPLATES,
  MemoryRepository,
  base64Bytes,
  goalImageView,
  goalPhotoError,
  goalPhotoMime,
  isRepoError,
  newOperationKey,
  suggestGoalImage,
  type GoalInput,
} from '../src';

const b64 = (hex: string) => Buffer.from(hex, 'hex').toString('base64');
const JPEG = b64('ffd8ffe000104a4649460001');
const PNG = b64('89504e470d0a1a0a0000000d');
const WEBP = b64('52494646240000005745425056503820');

describe('metas com imagem (D-077): sugestão pelo nome e pelo tipo', () => {
  it('os modelos de nome de "Nova meta" puxam a imagem certa', () => {
    expect(GOAL_TEMPLATES.filter((t) => t !== 'Outro').map((t) => [t, suggestGoalImage(t, 'objetivo')])).toEqual([
      ['Viagem', 'viagem'],
      ['Troca do carro', 'carro'],
      ['Entrada do imóvel', 'casa'],
      ['Estudos', 'estudos'],
    ]);
  });

  it('nomes comuns, com acento, maiúsculas e plural', () => {
    const cases: [string, string][] = [
      ['Lua de mel na Grécia', 'viagem'],
      ['Férias em família', 'viagem'],
      ['Cofrinho', 'reserva'],
      ['Moto nova', 'carro'],
      ['Apartamento próprio', 'casa'],
      ['Faculdade da Ana', 'estudos'],
      ['Intercâmbio', 'estudos'],
      ['Casamento', 'casamento'],
      ['Enxoval do bebê', 'bebe'],
      ['Notebook', 'tecnologia'],
      ['Cirurgia', 'saude'],
      ['Aposentadoria', 'aposentadoria'],
      ['Veterinário do Thor', 'pet'],
      ['Bicicleta', 'objetivo'],
      ['', 'objetivo'],
    ];
    for (const [name, key] of cases) expect(suggestGoalImage(name, 'objetivo'), name).toBe(key);
    expect(suggestGoalImage('Celular novo', 'oportunidade')).toBe('tecnologia');
  });

  it('a reserva para imprevistos é sempre o cofrinho', () => {
    expect(suggestGoalImage('Reserva para imprevistos', 'emergencia')).toBe('reserva');
    expect(suggestGoalImage('Viagem', 'emergencia')).toBe('reserva');
  });

  it('o que mostrar: foto, sugestão escolhida ou automática; sugestão desconhecida vira automática', () => {
    const goal = { id: 'g1', name: 'Viagem', goalType: 'objetivo' as const };
    expect(goalImageView(goal, null)).toEqual({ kind: 'sugestao', key: 'viagem', chosen: false });
    expect(goalImageView(goal, { goalId: 'g1', imageKey: 'casa', hasPhoto: false, version: 1, updatedAt: 'x' })).toEqual({ kind: 'sugestao', key: 'casa', chosen: true });
    expect(goalImageView(goal, { goalId: 'g1', imageKey: null, hasPhoto: true, version: 3, updatedAt: 'x' })).toEqual({ kind: 'foto', goalId: 'g1', version: 3 });
    expect(goalImageView(goal, { goalId: 'g1', imageKey: 'nave' as never, hasPhoto: false, version: 2, updatedAt: 'x' })).toEqual({ kind: 'sugestao', key: 'viagem', chosen: false });
  });

  it('catálogo: chaves no formato do banco, rótulos e textos alternativos, "objetivo" por último', () => {
    for (const g of GOAL_IMAGES) {
      expect(g.key).toMatch(/^[a-z_]{2,30}$/);
      expect(g.label.length).toBeGreaterThan(1);
      expect(g.alt.length).toBeGreaterThan(5);
      for (const w of g.words) expect(w, w).toBe(w.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase());
    }
    expect(new Set(GOAL_IMAGE_KEYS).size).toBe(GOAL_IMAGES.length);
    expect(GOAL_IMAGE_KEYS.at(-1)).toBe('objetivo');
  });

  it('textos: sem travessão longo, sem "contexto" e sem "fazer sentido"', () => {
    const texts = [
      ...GOAL_IMAGES.flatMap((g) => [g.label, g.alt]),
      ...Object.values(GOAL_IMAGE_TEXT).map((v) => (typeof v === 'function' ? v('Viagem') : v)),
    ];
    for (const t of texts) expect(t, t).not.toMatch(/—|–|contexto|fazer sentido/i);
  });
});

describe('metas com imagem: a foto', () => {
  it('tipo pelos primeiros bytes, como o banco', () => {
    expect(goalPhotoMime(JPEG)).toBe('image/jpeg');
    expect(goalPhotoMime(PNG)).toBe('image/png');
    expect(goalPhotoMime(WEBP)).toBe('image/webp');
    expect(goalPhotoMime(b64('474946383961'))).toBeNull();
    expect(goalPhotoMime('')).toBeNull();
    expect(goalPhotoMime('@@@@')).toBeNull();
  });

  it('tamanho sem decodificar e as recusas antes de enviar', () => {
    for (const n of [1, 2, 3, 4, 299, 300, 301]) expect(base64Bytes(Buffer.alloc(n).toString('base64')), String(n)).toBe(n);
    const max = Buffer.concat([Buffer.from('ffd8ff', 'hex'), Buffer.alloc(GOAL_PHOTO_MAX_BYTES - 3)]).toString('base64');
    expect(goalPhotoError(max)).toBeNull();
    const over = Buffer.concat([Buffer.from('ffd8ff', 'hex'), Buffer.alloc(GOAL_PHOTO_MAX_BYTES - 2)]).toString('base64');
    expect(goalPhotoError(over)).toBe('foto_grande');
    expect(goalPhotoError(b64('474946383961'))).toBe('foto_invalida');
    expect(goalPhotoError('')).toBe('foto_invalida');
  });
});

describe('metas com imagem: o repositório da demonstração (as mesmas regras do banco)', () => {
  const input: GoalInput & { initialCents: null; initialOn: null } = {
    goalType: 'objetivo',
    name: 'Lua de mel',
    targetCents: 900_000,
    targetMonth: null,
    plannedMonthlyCents: null,
    essentialBaseCents: null,
    essentialMonths: null,
    essentialBaseSource: null,
    initialCents: null,
    initialOn: null,
  };
  async function setup() {
    const repo = new MemoryRepository({ actorId: 'pessoa-img', displayName: 'Pessoa', today: () => '2026-10-30' });
    const ctx = (await repo.ensurePersonalSpace('Conta principal')).personalContextId;
    const goal = (await repo.createGoal(newOperationKey(), ctx, input)).goal;
    return { repo, ctx, goal };
  }
  const code = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (isRepoError(e) ? e.code : String(e)));

  it('sugestão, foto e automática, com a versão subindo e a foto lida à parte', async () => {
    const { repo, ctx, goal } = await setup();
    expect(await repo.listGoalImages(ctx)).toEqual([]);
    const k = newOperationKey();
    const a = await repo.setGoalImage(k, goal.id, 0, { kind: 'sugestao', key: 'viagem' });
    expect(a).toMatchObject({ goalId: goal.id, imageKey: 'viagem', hasPhoto: false, version: 1 });
    expect(await repo.setGoalImage(k, goal.id, 0, { kind: 'sugestao', key: 'viagem' })).toEqual(a);
    expect(await code(repo.setGoalImage(k, goal.id, 0, { kind: 'sugestao', key: 'casa' }))).toBe('chave_reutilizada');
    const b = await repo.setGoalImage(newOperationKey(), goal.id, 1, { kind: 'foto', base64: JPEG });
    expect(b).toMatchObject({ imageKey: null, hasPhoto: true, version: 2 });
    expect(await repo.getGoalPhoto(goal.id)).toEqual({ mime: 'image/jpeg', base64: JPEG, version: 2 });
    expect(await repo.listGoalImages(ctx)).toEqual([b]);
    const c = await repo.setGoalImage(newOperationKey(), goal.id, 2, { kind: 'automatica' });
    expect(c).toMatchObject({ imageKey: null, hasPhoto: false, version: 3 });
    expect(await repo.getGoalPhoto(goal.id)).toBeNull();
  });

  it('recusas na ordem do banco', async () => {
    const { repo, goal } = await setup();
    expect(await code(repo.setGoalImage(newOperationKey(), 'nao-existe', 0, { kind: 'sugestao', key: 'viagem' }))).toBe('nao_encontrado');
    expect(await code(repo.setGoalImage(newOperationKey(), goal.id, 0, { kind: 'sugestao', key: 'Nave!' as never }))).toBe('imagem_invalida');
    expect(await code(repo.setGoalImage(newOperationKey(), goal.id, 0, { kind: 'foto', base64: b64('474946383961') }))).toBe('foto_invalida');
    const big = Buffer.concat([Buffer.from('ffd8ff', 'hex'), Buffer.alloc(GOAL_PHOTO_MAX_BYTES)]).toString('base64');
    expect(await code(repo.setGoalImage(newOperationKey(), goal.id, 0, { kind: 'foto', base64: big }))).toBe('foto_grande');
    const stale = await repo.setGoalImage(newOperationKey(), goal.id, 3, { kind: 'sugestao', key: 'viagem' }).catch((e: unknown) => e);
    expect(isRepoError(stale) && [stale.code, stale.detail]).toEqual(['versao_desatualizada', 'versao_atual=0']);
  });

  it('excluir a meta apaga a imagem', async () => {
    const { repo, ctx, goal } = await setup();
    await repo.setGoalImage(newOperationKey(), goal.id, 0, { kind: 'foto', base64: PNG });
    await repo.deleteGoal(newOperationKey(), goal.id, goal.version);
    expect(await repo.listGoalImages(ctx)).toEqual([]);
    expect(await repo.getGoalPhoto(goal.id)).toBeNull();
  });
});
