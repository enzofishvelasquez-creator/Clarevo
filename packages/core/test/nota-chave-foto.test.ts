import { describe, expect, it } from 'vitest';
import { NOTA_TEXT, accessKeyCheckDigit, accessKeyFromText, parseAccessKey } from '../src';

/** Chave de acesso numa foto (D-078 B). Chave fictícia (RJ, 10/2026, CNPJ inventado), com o dígito verificador certo. */
const BODY = '3326101122233300018165001000012345187654321';
const KEY = BODY + String(accessKeyCheckDigit(BODY));

describe('chave de acesso no texto lido de uma foto', () => {
  it('a chave de teste é válida', () => {
    expect(parseAccessKey(KEY).ok).toBe(true);
  });

  it('em grupos de quatro, com espaços, no meio de outras linhas', () => {
    const groups = KEY.match(/.{4}/g)!.join(' ');
    const text = `CUPOM FISCAL ELETRONICO\nConsulte pela Chave de Acesso em\nwww.exemplo.gov.br\n${groups}\nCONSUMIDOR NAO IDENTIFICADO`;
    expect(accessKeyFromText(text)).toBe(KEY);
  });

  it('com números vizinhos colados (o reconhecimento junta) e quebrada em duas linhas', () => {
    expect(accessKeyFromText(`Nº 12345 ${KEY} 9`)).toBe(KEY);
    expect(accessKeyFromText(`${KEY.slice(0, 24)}\n${KEY.slice(24)}`)).toBe(KEY);
  });

  it('um algarismo trocado, poucos números ou texto sem chave: null', () => {
    const wrong = KEY.slice(0, 43) + String((Number(KEY[43]) + 1) % 10);
    expect(accessKeyFromText(wrong)).toBeNull();
    expect(accessKeyFromText('TOTAL R$ 45,90 12/10/2026 10:32')).toBeNull();
    expect(accessKeyFromText('')).toBeNull();
  });

  it('textos', () => {
    expect(NOTA_TEXT.keyPhoto).toBe('Ler a chave numa foto');
    expect(NOTA_TEXT.keyPhotoNone).not.toMatch(/[–—]/);
  });
});
