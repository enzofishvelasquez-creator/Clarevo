import { BOLETO_TEXT, boletoFromText, type BoletoReading, type IsoDate } from '@clarevo/core';
import * as DocumentPicker from 'expo-document-picker';

import { isImageAsset } from '@/lib/comprovante-read';
import { OCR_AVAILABLE, textFromImage } from '@/lib/ocr';
import { bytesOf, deleteCachedCopy, readPdfText } from '@/lib/receipt-read';

/**
 * PDF do boleto até a leitura (D-078 G): o mesmo caminho da nota e do comprovante (tamanho, cabeçalho, tempo limite), e o texto vai
 * direto para `boletoFromText`, que tira só o código, o valor, o vencimento e o nome de quem recebe. O texto e a cópia do PDF no cache
 * do aparelho são descartados ao fim; nada vai a servidor nenhum.
 */
export type BoletoRead = { ok: true; reading: BoletoReading } | { ok: false; message: string; cancelled?: false } | { ok: false; message: ''; cancelled: true };

/** PDF e, onde a leitura de imagem existe (no navegador, D-078 B), também foto ou print do boleto. */
export async function pickAndReadBoletoPdf(today: IsoDate, onImage?: () => void): Promise<BoletoRead> {
  let picked: DocumentPicker.DocumentPickerResult;
  try {
    picked = await DocumentPicker.getDocumentAsync({
      type: OCR_AVAILABLE ? ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'] : 'application/pdf',
      copyToCacheDirectory: true,
      multiple: false,
      base64: false,
    });
  } catch {
    return { ok: false, message: BOLETO_TEXT.errors.pdfFailed };
  }
  const asset = picked.canceled ? null : picked.assets[0];
  if (!asset) return { ok: false, message: '', cancelled: true };
  try {
    if (OCR_AVAILABLE && isImageAsset(asset)) {
      onImage?.();
      let imageText: string;
      try {
        imageText = await textFromImage(asset.file ?? asset.uri);
      } catch {
        return { ok: false, message: BOLETO_TEXT.errors.imageNone };
      }
      const fromImage = boletoFromText(imageText, today);
      return fromImage ? { ok: true, reading: fromImage } : { ok: false, message: BOLETO_TEXT.errors.imageNone };
    }
    const text = await readPdfText(() => bytesOf(asset), asset.size);
    if (!text.ok) {
      return { ok: false, message: text.reason === 'grande' ? BOLETO_TEXT.errors.pdfTooBig : text.reason === 'nao_pdf' ? BOLETO_TEXT.errors.notPdf : BOLETO_TEXT.errors.pdfFailed };
    }
    const reading = boletoFromText(text.text, today);
    return reading ? { ok: true, reading } : { ok: false, message: BOLETO_TEXT.errors.pdfNone };
  } finally {
    await deleteCachedCopy(asset);
  }
}
