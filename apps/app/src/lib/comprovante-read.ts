import { COMPROVANTE_TEXT, comprovanteErrorText, comprovanteFromText, type ComprovanteDirection, type ComprovanteReading } from '@clarevo/core';
import * as DocumentPicker from 'expo-document-picker';

import type { PdfReadControl } from '@/lib/pdf-text';
import { bytesOf, deleteCachedCopy, readPdfText } from '@/lib/receipt-read';

/**
 * Do PDF de um comprovante de Pix ou de pagamento (D-051) ao que o formulário usa. O texto do PDF só existe dentro desta leitura: o
 * leitor do core (`comprovanteFromText`) devolve só tipo, direção, valor, data e hora, o nome da outra ponta e a mensagem, e o texto
 * é descartado. CPF, CNPJ, chave Pix, agência, conta, ID da transação e código de autenticação nem chegam ao resultado. A cópia do
 * PDF no cache do aparelho é apagada ao fim, e o arquivo, o texto e o resultado não vão a servidor nenhum.
 *
 * `defaultDirection` é a do formulário onde a pessoa está (Anotar gasto: saiu; Registrar recebimento: entrou), usada só quando o
 * comprovante não diz se o dinheiro saiu ou entrou.
 */
export type ComprovanteRead =
  | { ok: true; reading: ComprovanteReading }
  | { ok: false; message: string; cancelled?: false }
  | { ok: false; message: ''; cancelled: true };

/** Bytes de um PDF (já escolhido) até a leitura. `extract` e `timeoutMs` existem para a leitura ser testável. */
export async function readComprovantePdfBytes(
  read: () => Promise<Uint8Array>,
  size: number | undefined,
  defaultDirection: ComprovanteDirection,
  options: { timeoutMs?: number; extract?: (bytes: Uint8Array, control: PdfReadControl) => Promise<string> } = {},
): Promise<ComprovanteRead> {
  const text = await readPdfText(read, size, options);
  if (!text.ok) {
    return { ok: false, message: text.reason === 'grande' ? COMPROVANTE_TEXT.pdf.tooBig : text.reason === 'nao_pdf' ? COMPROVANTE_TEXT.pdf.notPdf : COMPROVANTE_TEXT.pdf.failed };
  }
  const result = comprovanteFromText(text.text, { defaultDirection });
  return result.ok ? { ok: true, reading: result.reading } : { ok: false, message: comprovanteErrorText(result.code) };
}

/** Abre o seletor de arquivos (só PDF) e lê o escolhido. Cancelar não é erro. A cópia do cache é apagada ao fim, com ou sem erro. */
export async function pickAndReadComprovantePdf(defaultDirection: ComprovanteDirection): Promise<ComprovanteRead> {
  let picked: DocumentPicker.DocumentPickerResult;
  try {
    picked = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false, base64: false });
  } catch {
    return { ok: false, message: COMPROVANTE_TEXT.pdf.failed };
  }
  const asset = picked.canceled ? null : picked.assets[0];
  if (!asset) return { ok: false, message: '', cancelled: true };
  try {
    return await readComprovantePdfBytes(() => bytesOf(asset), asset.size, defaultDirection);
  } finally {
    await deleteCachedCopy(asset);
  }
}
