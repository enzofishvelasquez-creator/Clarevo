/**
 * Bytes de um arquivo de banco em texto, sem TextDecoder (o Hermes antigo não tem todos os conjuntos). Aceita UTF-8 (com ou sem
 * marca BOM), UTF-16 com BOM e, quando os bytes não são UTF-8 válido, Windows-1252, que cobre também ISO-8859-1 nos acentos do
 * português. A conferência de UTF-8 é estrita: um único byte fora do padrão manda o arquivo inteiro para Windows-1252.
 */

export type ImportEncoding = 'utf-8' | 'utf-16' | 'windows-1252';

/** Windows-1252 nos bytes 0x80 a 0x9F (o resto é igual ao ISO-8859-1). Bytes sem caractere viram U+FFFD. */
const CP1252_HIGH: readonly number[] = [
  0x20ac, 0xfffd, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0xfffd, 0x017d, 0xfffd,
  0xfffd, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0xfffd, 0x017e, 0x0178,
];

const CHUNK = 8192;

function fromCodes(codes: number[]): string {
  let out = '';
  for (let i = 0; i < codes.length; i += CHUNK) out += String.fromCharCode(...codes.slice(i, i + CHUNK));
  return out;
}

function pushCodePoint(codes: number[], cp: number) {
  if (cp >= 0x10000) {
    const v = cp - 0x10000;
    codes.push(0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff));
  } else codes.push(cp);
}

/** UTF-8 estrito: devolve null se houver sequência inválida, curta, não mínima, substituto ou acima de U+10FFFF. */
export function decodeUtf8Strict(bytes: Uint8Array, start = 0): string | null {
  const codes: number[] = [];
  for (let i = start; i < bytes.length; ) {
    const b = bytes[i]!;
    if (b < 0x80) {
      codes.push(b);
      i += 1;
      continue;
    }
    let need: number;
    let cp: number;
    let min: number;
    if (b >= 0xc2 && b <= 0xdf) {
      need = 1;
      cp = b & 0x1f;
      min = 0x80;
    } else if (b >= 0xe0 && b <= 0xef) {
      need = 2;
      cp = b & 0x0f;
      min = 0x800;
    } else if (b >= 0xf0 && b <= 0xf4) {
      need = 3;
      cp = b & 0x07;
      min = 0x10000;
    } else return null;
    for (let k = 1; k <= need; k++) {
      const c = bytes[i + k];
      if (c === undefined || (c & 0xc0) !== 0x80) return null;
      cp = (cp << 6) | (c & 0x3f);
    }
    if (cp < min || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return null;
    pushCodePoint(codes, cp);
    i += need + 1;
  }
  return fromCodes(codes);
}

export function decodeWindows1252(bytes: Uint8Array, start = 0): string {
  const codes: number[] = [];
  for (let i = start; i < bytes.length; i++) {
    const b = bytes[i]!;
    codes.push(b >= 0x80 && b <= 0x9f ? CP1252_HIGH[b - 0x80]! : b);
  }
  return fromCodes(codes);
}

function decodeUtf16(bytes: Uint8Array, littleEndian: boolean): string {
  const codes: number[] = [];
  for (let i = 2; i + 1 < bytes.length; i += 2) codes.push(littleEndian ? bytes[i]! | (bytes[i + 1]! << 8) : (bytes[i]! << 8) | bytes[i + 1]!);
  return fromCodes(codes);
}

/** O texto do arquivo e a codificação usada. */
export function decodeImportBytes(bytes: Uint8Array): { text: string; encoding: ImportEncoding } {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return { text: decodeUtf16(bytes, true), encoding: 'utf-16' };
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return { text: decodeUtf16(bytes, false), encoding: 'utf-16' };
  const start = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  const utf8 = decodeUtf8Strict(bytes, start);
  if (utf8 !== null) return { text: utf8, encoding: 'utf-8' };
  return { text: decodeWindows1252(bytes, start), encoding: 'windows-1252' };
}
