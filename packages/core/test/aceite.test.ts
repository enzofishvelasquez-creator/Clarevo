import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { LEGAL_ACCEPT_TEXT, LEGAL_VERSION, MemoryRepository, RepoError, legalAcceptanceNeeded, parseLegalAcceptance } from '../src';

const MIGRATIONS = join(__dirname, '..', '..', '..', 'supabase', 'migrations');

describe('aceite dos termos e da política (A1)', () => {
  it('a versão do app é a mesma da última definição de clarevo_legal_version() nas migrações', () => {
    const versions = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .flatMap((f) => {
        const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
        return [...sql.matchAll(/function public\.clarevo_legal_version\(\)[\s\S]*?\$\$\s*select (\d+);\s*\$\$/g)].map((m) => Number(m[1]));
      });
    expect(versions.length).toBeGreaterThan(0);
    expect(versions.at(-1)).toBe(LEGAL_VERSION);
  });

  it('lê a resposta do banco e recusa o que foge do formato', () => {
    expect(parseLegalAcceptance({ current: 1, version: 1, accepted_at: '2026-11-01T18:30:00+00:00' })).toEqual({
      current: 1,
      version: 1,
      acceptedAt: '2026-11-01T18:30:00+00:00',
    });
    expect(parseLegalAcceptance({ current: 1, version: null, accepted_at: null })).toEqual({ current: 1, version: null, acceptedAt: null });
    expect(() => parseLegalAcceptance(null)).toThrow('aceite_invalido');
    expect(() => parseLegalAcceptance({ current: 0 })).toThrow('aceite_invalido');
    expect(() => parseLegalAcceptance({ current: 1, version: 'um' })).toThrow('aceite_invalido');
    expect(() => parseLegalAcceptance({ current: 1, version: 1, accepted_at: 'ontem' })).toThrow('aceite_invalido');
  });

  it('pede aceite só sem aceite ou com uma versão anterior à vigente', () => {
    expect(legalAcceptanceNeeded({ current: 1, version: null, acceptedAt: null })).toBe(true);
    expect(legalAcceptanceNeeded({ current: 2, version: 1, acceptedAt: '2026-11-01T00:00:00Z' })).toBe(true);
    expect(legalAcceptanceNeeded({ current: 1, version: 1, acceptedAt: '2026-11-01T00:00:00Z' })).toBe(false);
  });

  it('textos do aviso: sem travessão longo, sem "fazer sentido", com a idade e os dois textos', () => {
    for (const t of Object.values(LEGAL_ACCEPT_TEXT)) {
      expect(t).not.toMatch(/—|–/);
      expect(t).not.toMatch(/faz(er)? sentido/i);
    }
    expect(LEGAL_ACCEPT_TEXT.first).toContain('18 anos ou mais');
    expect(LEGAL_ACCEPT_TEXT.first).toContain('termos de uso e a política de privacidade');
  });

  it('repositório em memória: aceito por padrão; sem aceite, aceita só a versão vigente', async () => {
    const base = { actorId: 'p1', displayName: 'Pessoa Exemplo', today: () => '2026-11-05' };
    expect((await new MemoryRepository(base).getLegalAcceptance()).version).toBe(LEGAL_VERSION);
    const repo = new MemoryRepository({ ...base, legalAccepted: null });
    expect(await repo.getLegalAcceptance()).toEqual({ current: LEGAL_VERSION, version: null, acceptedAt: null });
    await expect(repo.acceptLegalTerms('ac-0001', LEGAL_VERSION + 1)).rejects.toEqual(new RepoError('versao_invalida'));
    const after = await repo.acceptLegalTerms('ac-0002', LEGAL_VERSION);
    expect(after.version).toBe(LEGAL_VERSION);
    expect(legalAcceptanceNeeded(after)).toBe(false);
  });
});
