import { COMPROVANTE_TEXT, comprovanteErrorText, comprovanteFromText, type ComprovanteDirection, type ComprovanteReading, type PdfTextItem } from '@clarevo/core';
import * as DocumentPicker from 'expo-document-picker';

import type { PdfReadControl } from '@/lib/pdf-text';
import { OCR_AVAILABLE, textFromImage } from '@/lib/ocr';
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
  options: { timeoutMs?: number; extract?: (bytes: Uint8Array, control: PdfReadControl, items?: PdfTextItem[]) => Promise<string> } = {},
): Promise<ComprovanteRead> {
  // As posições dos pedaços de texto (o holerite usa) ficam só nesta leitura, como o texto.
  const items: PdfTextItem[] = [];
  const text = await readPdfText(read, size, { ...options, items });
  if (!text.ok) {
    return { ok: false, message: text.reason === 'grande' ? COMPROVANTE_TEXT.pdf.tooBig : text.reason === 'nao_pdf' ? COMPROVANTE_TEXT.pdf.notPdf : COMPROVANTE_TEXT.pdf.failed };
  }
  const result = comprovanteFromText(text.text, { defaultDirection, items });
  return result.ok ? { ok: true, reading: result.reading } : { ok: false, message: comprovanteErrorText(result.code) };
}

/** A imagem é PNG, JPEG ou WebP, pelo tipo que o seletor informa ou pela extensão do nome. */
export function isImageAsset(asset: Pick<DocumentPicker.DocumentPickerAsset, 'mimeType' | 'name'>): boolean {
  return /^image\/(png|jpe?g|webp)$/i.test(asset.mimeType ?? '') || /\.(png|jpe?g|webp)$/i.test(asset.name ?? '');
}

/** Imagem acima de 10 MB (foto de câmera muito grande): não é lida, para a leitura não travar o aparelho. */
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export function imageTooBig(asset: Pick<DocumentPicker.DocumentPickerAsset, 'size' | 'file'>): boolean {
  const size = asset.file?.size ?? asset.size;
  return typeof size === 'number' && size > IMAGE_MAX_BYTES;
}

/**
 * Texto de um print ou de uma foto (D-078 B), lido no próprio aparelho, para o mesmo leitor do PDF. Até 10 MB. Sem texto que dê
 * para ler, a mensagem diz para conferir a imagem.
 */
export async function readComprovanteImage(asset: DocumentPicker.DocumentPickerAsset, defaultDirection: ComprovanteDirection, onProgress?: (f: number) => void): Promise<ComprovanteRead> {
  if (imageTooBig(asset)) return { ok: false, message: COMPROVANTE_TEXT.pdf.imageTooBig };
  let text: string;
  try {
    const source: Blob | string = asset.file ?? asset.uri;
    text = await textFromImage(source, onProgress);
  } catch {
    return { ok: false, message: COMPROVANTE_TEXT.pdf.imageFailed };
  }
  const result = comprovanteFromText(text, { defaultDirection });
  if (result.ok) return { ok: true, reading: result.reading };
  return { ok: false, message: result.code === 'texto_vazio' ? COMPROVANTE_TEXT.pdf.imageNoText : comprovanteErrorText(result.code) };
}

/**
 * Abre o seletor de arquivos e lê o escolhido: PDF e, onde a leitura de imagem existe (no navegador), também print ou foto. Cancelar
 * não é erro. A cópia do cache é apagada ao fim, com ou sem erro. `onImage` avisa a tela de que a leitura é de imagem (mais lenta).
 */
export async function pickAndReadComprovantePdf(defaultDirection: ComprovanteDirection, onImage?: () => void): Promise<ComprovanteRead> {
  let picked: DocumentPicker.DocumentPickerResult;
  try {
    picked = await DocumentPicker.getDocumentAsync({
      type: OCR_AVAILABLE ? ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'] : 'application/pdf',
      copyToCacheDirectory: true,
      multiple: false,
      base64: false,
    });
  } catch {
    return { ok: false, message: COMPROVANTE_TEXT.pdf.failed };
  }
  const asset = picked.canceled ? null : picked.assets[0];
  if (!asset) return { ok: false, message: '', cancelled: true };
  try {
    if (OCR_AVAILABLE && isImageAsset(asset)) {
      onImage?.();
      return await readComprovanteImage(asset, defaultDirection);
    }
    return await readComprovantePdfBytes(() => bytesOf(asset), asset.size, defaultDirection);
  } finally {
    await deleteCachedCopy(asset);
  }
}
