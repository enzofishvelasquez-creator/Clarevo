import { parseCsvText, type CsvTable } from './csv';
import { decodeImportBytes } from './decode';
import { looksLikeOfx, OFX_DEFAULT_TIME_ZONE, parseOfxText } from './ofx';
import { IMPORT_MAX_BYTES, type ImportErrorCode, type ImportParse } from './tipos';

/**
 * Do arquivo escolhido às linhas lidas: confere o tamanho (5 MB), reconhece OFX ou planilha pelo conteúdo (não só pela
 * extensão) e devolve as linhas, ou a tabela para a pessoa escolher as colunas, ou o motivo de não ler. Nada é guardado.
 */
export type ImportRead = { kind: 'ok'; parse: ImportParse; table: CsvTable | null } | { kind: 'mapear'; table: CsvTable } | { kind: 'erro'; code: ImportErrorCode };

/** PDF, planilha do Excel, imagem ou outro formato binário: não são OFX nem CSV. */
function looksBinary(bytes: Uint8Array): boolean {
  const head = bytes.subarray(0, 8);
  const startsWith = (...codes: number[]) => codes.every((c, i) => head[i] === c);
  if (startsWith(0x25, 0x50, 0x44, 0x46)) return true; // %PDF
  if (startsWith(0x50, 0x4b, 0x03, 0x04)) return true; // PK (xlsx, zip)
  if (startsWith(0xd0, 0xcf, 0x11, 0xe0)) return true; // xls antigo
  if (startsWith(0x89, 0x50, 0x4e, 0x47) || startsWith(0xff, 0xd8, 0xff)) return true; // PNG, JPEG
  const sample = bytes.subarray(0, 4096);
  let zeros = 0;
  for (const b of sample) if (b === 0) zeros += 1;
  // UTF-16 tem muitos zeros e começa com BOM; qualquer outro arquivo com zeros é binário.
  const utf16 = (head[0] === 0xff && head[1] === 0xfe) || (head[0] === 0xfe && head[1] === 0xff);
  return !utf16 && zeros > 0;
}

/** `timeZone`: o fuso do espaço, para converter a hora de um OFX que informa o fuso (padrão São Paulo). */
export function readImportFile(bytes: Uint8Array, _name = '', timeZone: string = OFX_DEFAULT_TIME_ZONE): ImportRead {
  if (bytes.length === 0) return { kind: 'erro', code: 'arquivo_vazio' };
  if (bytes.length > IMPORT_MAX_BYTES) return { kind: 'erro', code: 'arquivo_grande' };
  if (looksBinary(bytes)) return { kind: 'erro', code: 'formato_desconhecido' };
  const { text } = decodeImportBytes(bytes);
  if (text.trim() === '') return { kind: 'erro', code: 'arquivo_vazio' };
  if (looksLikeOfx(text)) {
    const r = parseOfxText(text, timeZone);
    return r.ok ? { kind: 'ok', parse: r.parse, table: null } : { kind: 'erro', code: r.code };
  }
  const csv = parseCsvText(text);
  if (csv.kind === 'ok') return { kind: 'ok', parse: csv.parse, table: csv.table };
  if (csv.kind === 'mapear') return { kind: 'mapear', table: csv.table };
  return csv;
}
