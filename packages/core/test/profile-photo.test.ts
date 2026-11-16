import { describe, expect, it } from 'vitest';
import {
  PROFILE_PHOTO_MAX_BYTES,
  PROFILE_PHOTO_TEXT,
  RepoError,
  createDemoRepository,
  initialsOf,
  profilePhotoError,
  profilePhotoErrorText,
  profilePhotoUri,
} from '../src';

/** Foto do perfil (pedido do Enzo, 16/11/2026; migração 0038): as regras do app, iguais às do banco, e a memória da demonstração. */
const b64 = (hex: string) => Buffer.from(hex, 'hex').toString('base64');
const JPEG = b64('ffd8ffe000104a4649460001');
const PNG = b64('89504e470d0a1a0a0000');
const WEBP = b64('52494646000000005745425056503820');

describe('foto do perfil: regras', () => {
  it('aceita JPEG, PNG e WebP pelos primeiros bytes, até 150 KB, e recusa o resto', () => {
    for (const ok of [JPEG, PNG, WEBP]) expect(profilePhotoError(ok)).toBeNull();
    expect(profilePhotoError(b64('474946383961'))).toBe('foto_invalida');
    expect(profilePhotoError('')).toBe('foto_invalida');
    const exact = Buffer.concat([Buffer.from('ffd8ff', 'hex'), Buffer.alloc(PROFILE_PHOTO_MAX_BYTES - 3)]).toString('base64');
    const over = Buffer.concat([Buffer.from('ffd8ff', 'hex'), Buffer.alloc(PROFILE_PHOTO_MAX_BYTES - 2)]).toString('base64');
    expect(profilePhotoError(exact)).toBeNull();
    expect(profilePhotoError(over)).toBe('foto_grande');
    expect(PROFILE_PHOTO_MAX_BYTES).toBe(153600);
  });

  it('as iniciais, o endereço da imagem e os textos de erro', () => {
    expect(initialsOf('Ana Maria Lima')).toBe('AL');
    expect(initialsOf('  bia ')).toBe('B');
    expect(initialsOf('')).toBe('·');
    expect(profilePhotoUri({ mime: 'image/png', base64: PNG })).toBe(`data:image/png;base64,${PNG}`);
    expect(profilePhotoErrorText('foto_grande')).toBe(PROFILE_PHOTO_TEXT.error.foto_grande);
    expect(profilePhotoErrorText('qualquer')).toBe(PROFILE_PHOTO_TEXT.error.desconhecido);
    // Regras de texto do projeto: sem travessão e sem a expressão proibida.
    const all = JSON.stringify(PROFILE_PHOTO_TEXT);
    expect(all).not.toMatch(/[–—]/);
    expect(all).not.toMatch(/fazer sentido/i);
  });
});

describe('foto do perfil: a memória (demonstração e testes), como set_my_photo e my_photo', () => {
  it('põe, troca, recusa versão velha e formatos, remove e a versão nunca volta', async () => {
    const repo = await createDemoRepository();
    expect(await repo.getMyPhoto()).toEqual({ version: 0, photo: null });
    // Remover sem nunca ter posto: nada muda.
    expect(await repo.setMyPhoto(null, 0)).toEqual({ hasPhoto: false, version: 0, updatedAt: null });
    expect(await repo.setMyPhoto(JPEG, 0)).toMatchObject({ hasPhoto: true, version: 1 });
    expect(await repo.getMyPhoto()).toEqual({ version: 1, photo: { mime: 'image/jpeg', base64: JPEG } });
    expect(await repo.setMyPhoto(PNG, 1)).toMatchObject({ version: 2 });
    await expect(repo.setMyPhoto(WEBP, 1)).rejects.toMatchObject({ code: 'versao_desatualizada', detail: 'versao_atual=2' });
    await expect(repo.setMyPhoto(b64('474946383961'), 2)).rejects.toBeInstanceOf(RepoError);
    await expect(repo.setMyPhoto(b64('474946383961'), 2)).rejects.toMatchObject({ code: 'foto_invalida' });
    expect((await repo.getMyPhoto()).photo?.mime).toBe('image/png');
    // Remover: a foto sai e a versão sobe (outro aparelho com a versão 2 não sobrescreve sem ler de novo).
    expect(await repo.setMyPhoto(null, 2)).toMatchObject({ hasPhoto: false, version: 3 });
    expect(await repo.getMyPhoto()).toEqual({ version: 3, photo: null });
    await expect(repo.setMyPhoto(JPEG, 2)).rejects.toMatchObject({ code: 'versao_desatualizada', detail: 'versao_atual=3' });
    expect(await repo.setMyPhoto(JPEG, 3)).toMatchObject({ hasPhoto: true, version: 4 });
  });
});
