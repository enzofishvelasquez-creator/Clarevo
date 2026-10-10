import {
  NOTA_FLOW_TEXT,
  NOTA_TEXT,
  danfeFromText,
  factsFromDanfe,
  factsFromKey,
  factsFromQr,
  looksLikeBoleto,
  noteErrorText,
  readReceiptCode,
  receiptDraft,
  type IsoDate,
  type ReceiptDraft,
  type ReceiptFacts,
} from '@clarevo/core';
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';

import { PDF_MAX_BYTES, hasPdfHeader, pdfTextFromBytes } from '@/lib/pdf-text';

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

async function bytesOf(asset: DocumentPicker.DocumentPickerAsset): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    if (!asset.file) throw new Error('sem arquivo');
    return new Uint8Array(await asset.file.arrayBuffer());
  }
  const { File } = await import('expo-file-system');
  return new Uint8Array(await new File(asset.uri).arrayBuffer());
}

/** Bytes de um PDF (já escolhido) até o rascunho. Mensagens de cada falha em NOTA_TEXT.pdf. */
export async function readNotePdfBytes(read: () => Promise<Uint8Array>, size: number | undefined, today: IsoDate): Promise<NoteReading> {
  const fail = (message: string): NoteReading => ({ ok: false, message, boleto: false });
  if (typeof size === 'number' && size > PDF_MAX_BYTES) return fail(NOTA_TEXT.pdf.tooBig);
  let text: string;
  try {
    const bytes = await read();
    if (bytes.length > PDF_MAX_BYTES) return fail(NOTA_TEXT.pdf.tooBig);
    if (!hasPdfHeader(bytes)) return fail(NOTA_TEXT.pdf.notPdf);
    text = await pdfTextFromBytes(bytes);
  } catch {
    return fail(NOTA_TEXT.pdf.failed);
  }
  const danfe = danfeFromText(text);
  if (!danfe.ok) {
    if (danfe.code === 'texto_vazio') return fail(NOTA_TEXT.pdf.noText);
    if (danfe.code === 'chave_nao_encontrada') return fail(NOTA_TEXT.pdf.noKey);
    return fail(noteErrorText(danfe.code));
  }
  const facts = factsFromDanfe(danfe.reading);
  return { ok: true, source: 'pdf', facts, draft: receiptDraft(facts, today) };
}

/** Abre o seletor de arquivos (só PDF) e lê o escolhido. Cancelar não é erro. */
export async function pickAndReadNotePdf(today: IsoDate): Promise<NoteReading> {
  let picked: DocumentPicker.DocumentPickerResult;
  try {
    picked = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false, base64: false });
  } catch {
    return { ok: false, message: NOTA_TEXT.pdf.failed, boleto: false };
  }
  const asset = picked.canceled ? null : picked.assets[0];
  if (!asset) return { ok: false, message: '', boleto: false, cancelled: true };
  return readNotePdfBytes(() => bytesOf(asset), asset.size, today);
}
