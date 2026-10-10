import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256Hex, sha256HexOfBytes } from '../src/sha256';

const node = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

describe('SHA-256 em JavaScript puro', () => {
  it('vetores do NIST (FIPS 180-4)', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
    expect(sha256Hex('abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu')).toBe(
      'cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1',
    );
  });

  it('um milhão de "a" (vários blocos)', () => {
    expect(sha256Hex('a'.repeat(1_000_000))).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  });

  it('fronteiras do preenchimento: 0 a 130 caracteres iguais ao Node', () => {
    for (let n = 0; n <= 130; n++) {
      const text = 'x'.repeat(n);
      expect(sha256Hex(text)).toBe(node(text));
    }
  });

  it('texto fora do ASCII (UTF-8, pares substitutos) igual ao Node', () => {
    for (const text of ['açaí', 'Fatura Nubank (março)', 'R$ 1.234,56', '日本語', 'emoji 😀 par', 'x😀', 'é́', 'ç'.repeat(40)]) {
      expect(sha256Hex(text)).toBe(node(text));
    }
    // Sobra isolada de par substituto: vira U+FFFD, como a conversão do Node.
    expect(sha256Hex('a\ud800b')).toBe(node('a\ud800b'));
    expect(sha256Hex('a\udc00')).toBe(node('a\udc00'));
  });

  it('mais de mil entradas pseudoaleatórias, de 0 a 200 caracteres, iguais ao Node', () => {
    let seed = 12345;
    const next = () => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      return seed;
    };
    for (let i = 0; i < 1200; i++) {
      const len = next() % 201;
      let text = '';
      for (let j = 0; j < len; j++) text += String.fromCharCode(32 + (next() % 95));
      expect(sha256Hex(text)).toBe(node(text));
    }
  });

  it('bytes diretos (todos os valores de byte)', () => {
    const bytes = Array.from({ length: 256 }, (_, i) => i);
    expect(sha256HexOfBytes(bytes)).toBe(createHash('sha256').update(Buffer.from(bytes)).digest('hex'));
  });

  it('mesmo valor que o SHA-256 do PostgreSQL (fixtures de supabase/tests/70_cartoes.sql)', () => {
    expect(sha256Hex('35080599999090910270550010000000010000000011')).toBe('7ad0f9e89a093ba3fbaa6099be31f117c550f8171ac4acda57d090fba35af79e');
    expect(sha256Hex('33101234567800019065001000000123410000123454')).toBe('077c629d7c0482086b714ca21caca21da5d16f10fab42112559e4dce9222ded2');
    expect(sha256Hex('33260500000000000190650010000009871000000016')).toBe('2904729dae2e687811879a4343c29bb82be66b36778fca9a44ac9ce2070d58da');
  });

  it('não altera a entrada', () => {
    const bytes = [1, 2, 3];
    sha256HexOfBytes(bytes);
    expect(bytes).toEqual([1, 2, 3]);
  });
});
