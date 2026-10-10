import {
  NOTA_FLOW_TEXT,
  NOTA_TEXT,
  PDF_READ_TIMEOUT_MS,
  danfeFromText,
  factsFromDanfe,
  factsFromKey,
  factsFromQr,
  looksLikeBoleto,
  noteErrorText,
  raceWithTimeout,
  readReceiptCode,
  receiptDraft,
  type IsoDate,
  type ReceiptDraft,
  type ReceiptFacts,
} from '@clarevo/core';
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';

import { PDF_MAX_BYTES, hasPdfHeader, newPdfReadControl, pdfTextFromBytes, type PdfReadControl } from '@/lib/pdf-text';

/**
 * Da leitura (câmera, texto colado, PDF) ao rascunho de "Anotar gasto". A chave de 44 caracteres e o endereço do QR só existem
 * em memória, em `facts`; nada daqui vai ao armazenamento do aparelho. O texto do PDF é descartado depois da leitura.
 */
export type NoteSource = 'qr' | 'chave' | 'pdf';

export type NoteReading =
  | { ok: true; source: NoteSource; facts: ReceiptFacts; draft: ReceiptDraft }
  | { ok: false; message: string; boleto: boolean; cancelled?: false }
  | { ok: false; message: ''; boleto: false; cancelled: true };

/** QR, chave ou texto colado. Código de boleto recebe o aviso próprio, não o erro de chave. */
export function readNoteCode(raw: string, today: IsoDate): NoteReading {
  const r = readReceiptCode(raw);
  if (r.ok) {
    const facts = r.qr ? factsFromQr(r.qr, raw.trim()) : factsFromKey(r.key);
    return { ok: true, source: r.source, facts, draft: receiptDraft(facts, today) };
  }
  if (looksLikeBoleto(raw)) return { ok: false, message: NOTA_FLOW_TEXT.boleto, boleto: true };
  return { ok: false, message: noteErrorText(r.code), boleto: false };
}

/** O arquivo passa do limite: confere o tamanho ANTES de ler os bytes para a memória. */
class PdfTooBigError extends Error {}

async function bytesOf(asset: DocumentPicker.DocumentPickerAsset): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    if (!asset.file) throw new Error('sem arquivo');
    if (asset.file.size > PDF_MAX_BYTES) throw new PdfTooBigError();
    return new Uint8Array(await asset.file.arrayBuffer());
  }
  const { File } = await import('expo-file-system');
  const file = new File(asset.uri);
  if (typeof file.size === 'number' && file.size > PDF_MAX_BYTES) throw new PdfTooBigError();
  return new Uint8Array(await file.arrayBuffer());
}

/** Apaga a cópia do PDF que o seletor fez no cache do app (tem CPF, nome e endereço de quem comprou). Só no nativo; nunca lança. */
async function deleteCachedCopy(asset: DocumentPicker.DocumentPickerAsset): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const { File, Paths } = await import('expo-file-system');
    const cache = Paths.cache.uri;
    if (asset.uri.startsWith(cache)) {
      const file = new File(asset.uri);
      if (file.exists) file.delete();
    }
  } catch {
    // O sistema limpa o cache quando precisa; a cópia só fica até lá.
  }
}

/**
 * Bytes de um PDF (já escolhido) até o rascunho. Mensagens de cada falha em NOTA_TEXT.pdf. A leitura inteira (arquivo e texto)
 * tem tempo limite (`PDF_READ_TIMEOUT_MS`): passou dele, destrói a tarefa do PDF e mostra NOTA_TEXT.pdf.failed.
 * `extract` e `timeoutMs` existem para a leitura ser testável.
 */
export async function readNotePdfBytes(
  read: () => Promise<Uint8Array>,
  size: number | undefined,
  today: IsoDate,
  options: { timeoutMs?: number; extract?: (bytes: Uint8Array, control: PdfReadControl) => Promise<string> } = {},
): Promise<NoteReading> {
  const fail = (message: string): NoteReading => ({ ok: false, message, boleto: false });
  if (typeof size === 'number' && size > PDF_MAX_BYTES) return fail(NOTA_TEXT.pdf.tooBig);
  const control = newPdfReadControl();
  const extract = options.extract ?? pdfTextFromBytes;
  const work = (async (): Promise<string | NoteReading> => {
    const bytes = await read();
    if (bytes.length > PDF_MAX_BYTES) return fail(NOTA_TEXT.pdf.tooBig);
    if (!hasPdfHeader(bytes)) return fail(NOTA_TEXT.pdf.notPdf);
    return extract(bytes, control);
  })();
  const raced = await raceWithTimeout(work, options.timeoutMs ?? PDF_READ_TIMEOUT_MS, () => control.abort());
  if (raced === 'tempo') return fail(NOTA_TEXT.pdf.failed);
  if (raced === 'erro') {
    // A causa só importa para o tamanho; o resto cai na mensagem geral.
    const cause = await work.then(
      () => null,
      (e: unknown) => e,
    );
    return fail(cause instanceof PdfTooBigError ? NOTA_TEXT.pdf.tooBig : NOTA_TEXT.pdf.failed);
  }
  if (typeof raced.value !== 'string') return raced.value;
  const danfe = danfeFromText(raced.value);
  if (!danfe.ok) {
    if (danfe.code === 'texto_vazio') return fail(NOTA_TEXT.pdf.noText);
    if (danfe.code === 'chave_nao_encontrada') return fail(NOTA_TEXT.pdf.noKey);
    return fail(noteErrorText(danfe.code));
  }
  const facts = factsFromDanfe(danfe.reading);
  return { ok: true, source: 'pdf', facts, draft: receiptDraft(facts, today) };
}

/** Abre o seletor de arquivos (só PDF) e lê o escolhido. Cancelar não é erro. A cópia do cache é apagada ao fim, com ou sem erro. */
export async function pickAndReadNotePdf(today: IsoDate): Promise<NoteReading> {
  let picked: DocumentPicker.DocumentPickerResult;
  try {
    picked = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false, base64: false });
  } catch {
    return { ok: false, message: NOTA_TEXT.pdf.failed, boleto: false };
  }
  const asset = picked.canceled ? null : picked.assets[0];
  if (!asset) return { ok: false, message: '', boleto: false, cancelled: true };
  try {
    return await readNotePdfBytes(() => bytesOf(asset), asset.size, today);
  } finally {
    await deleteCachedCopy(asset);
  }
}
