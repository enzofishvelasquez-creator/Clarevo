import { IMPORT_MAX_IMAGES, deviceTimeZone, statementFromImageTexts, todayIn, type ImportDestination, type ImportRead } from '@clarevo/core';
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';

import { IMAGE_MAX_BYTES, isImageAsset } from '@/lib/comprovante-read';
import { withExternalScreen } from '@/lib/external-screen';
import { deleteCacheFile, pickImagesForReading } from '@/lib/image-pick';
import { OCR_AVAILABLE, textsFromImages } from '@/lib/ocr';

/**
 * Importar extrato ou fatura por print (D-108): um ou mais prints da tela do banco, lidos no próprio aparelho (D-078 B: tesseract.js
 * servido pelo app na web; o leitor de texto do sistema no celular), e o texto vai direto para `statementFromImageTexts` do core, que
 * monta as linhas para a mesma conferência do PDF. Nenhuma imagem nem texto vai a servidor nenhum: a imagem fica na memória (web) ou
 * no cache do app (celular) só enquanto é lida, e a cópia é apagada no fim, com ou sem erro. Na web, o endereço temporário que o
 * navegador cria para cada arquivo também é liberado.
 *
 * `hint`: o destino já escolhido ("Importar fatura" na tela do cartão), para as linhas da fatura saírem com o sinal da fatura.
 * `onProgress(feitas, total)` deixa a tela dizer "Lendo o print 2 de 3…".
 */
export type PickedPrints = { cancelled: true } | { cancelled: false; count: number; read: ImportRead };

/** Um print escolhido: o arquivo (web) ou o endereço no cache (celular), o tamanho e o endereço para apagar ou liberar depois. */
export interface PrintSource {
  image: Blob | string;
  size?: number | null;
  uri: string;
}

/** Lê os prints já escolhidos, na ordem. Limite de quantidade e de tamanho antes de ler qualquer um. */
export async function readPrints(
  sources: readonly PrintSource[],
  timeZone: string | undefined,
  hint: ImportDestination | null,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportRead> {
  if (!OCR_AVAILABLE) return { kind: 'erro', code: 'imagem_indisponivel' };
  if (sources.length > IMPORT_MAX_IMAGES) return { kind: 'erro', code: 'imagens_demais' };
  if (sources.some((s) => typeof s.size === 'number' && s.size > IMAGE_MAX_BYTES)) return { kind: 'erro', code: 'imagem_grande' };
  let texts: string[];
  try {
    texts = await textsFromImages(
      sources.map((s) => s.image),
      onProgress,
    );
  } catch {
    return { kind: 'erro', code: 'imagem_ilegivel' };
  }
  if (texts.every((t) => t.trim() === '')) return { kind: 'erro', code: 'imagem_ilegivel' };
  const parse = statementFromImageTexts(texts, todayIn(timeZone ?? deviceTimeZone()), hint);
  return parse ? { kind: 'ok', parse, table: null } : { kind: 'erro', code: 'imagem_sem_lancamentos' };
}

/** Apaga a cópia do print no cache do app (celular) ou libera o endereço temporário do navegador (web). Nunca lança. */
export async function discardPrint(uri: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (uri.startsWith('blob:')) URL.revokeObjectURL(uri);
    } catch {
      // Nada a fazer: o navegador libera ao fechar a página.
    }
    return;
  }
  await deleteCacheFile(uri);
}

/**
 * Abre o seletor e lê os prints escolhidos. Na web, o seletor de arquivos só com imagens (várias de uma vez); no celular, a galeria
 * (onde ficam os prints), com seleção de várias. Cancelar não é erro.
 */
export async function pickPrints(timeZone: string | undefined, hint: ImportDestination | null, onProgress?: (done: number, total: number) => void): Promise<PickedPrints> {
  if (!OCR_AVAILABLE) return { cancelled: false, count: 0, read: { kind: 'erro', code: 'imagem_indisponivel' } };
  let sources: PrintSource[];
  if (Platform.OS === 'web') {
    let picked: DocumentPicker.DocumentPickerResult;
    try {
      picked = await withExternalScreen(() =>
        DocumentPicker.getDocumentAsync({ type: ['image/png', 'image/jpeg', 'image/webp'], multiple: true, copyToCacheDirectory: false, base64: false }),
      );
    } catch {
      return { cancelled: false, count: 0, read: { kind: 'erro', code: 'imagem_ilegivel' } };
    }
    const assets = picked.canceled ? [] : picked.assets;
    if (assets.length === 0) return { cancelled: true };
    sources = assets.map((a) => ({ image: a.file ?? a.uri, size: a.file?.size ?? a.size, uri: a.uri }));
    if (!assets.every(isImageAsset)) {
      await Promise.all(sources.map((s) => discardPrint(s.uri)));
      return { cancelled: false, count: assets.length, read: { kind: 'erro', code: 'formato_desconhecido' } };
    }
  } else {
    const picked = await pickImagesForReading(IMPORT_MAX_IMAGES);
    if (picked.kind === 'cancelado') return { cancelled: true };
    if (picked.kind === 'falhou') return { cancelled: false, count: 0, read: { kind: 'erro', code: 'imagem_ilegivel' } };
    sources = picked.images.map((i) => ({ image: i.uri, size: i.size, uri: i.uri }));
  }
  try {
    // A leitura demora: avisa quantos são e cede a vez antes, para a tela mostrar "Lendo o print 1 de 3…".
    onProgress?.(0, sources.length);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    return { cancelled: false, count: sources.length, read: await readPrints(sources, timeZone, hint, onProgress) };
  } finally {
    await Promise.all(sources.map((s) => discardPrint(s.uri)));
  }
}
