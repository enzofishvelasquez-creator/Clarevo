import { IMPORT_MAX_BYTES, deviceTimeZone, raceWithTimeout, readImportFile, statementFromPdfItems, todayIn, type ImportRead, type PdfTextItem } from '@clarevo/core';
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';

import { PDF_STATEMENT_MAX_PAGES, PdfTooManyPagesError, newPdfReadControl, pdfTextFromBytes } from '@/lib/pdf-text';

/** Tempo máximo para abrir e ler o PDF de um extrato (até 30 páginas). */
const PDF_STATEMENT_TIMEOUT_MS = 60_000;

/**
 * Escolher e ler o arquivo de "Importar extrato ou fatura" (D-048), no aparelho. O arquivo (OFX ou planilha CSV) vai do seletor
 * para a memória, é lido pelo core e descartado: nada dele é enviado nem guardado, e a cópia que o seletor faz no cache do app
 * (só no celular) é apagada ao fim. O tamanho é conferido ANTES de ler os bytes (5 MB). `timeZone`: o fuso do espaço, para a data de
 * um OFX que informa a hora e o fuso.
 */
export type PickedImport = { cancelled: true } | { cancelled: false; name: string; read: ImportRead };

/** O arquivo passa do limite de tamanho. */
class TooBigError extends Error {}

async function bytesOf(asset: DocumentPicker.DocumentPickerAsset): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    if (!asset.file) throw new Error('sem arquivo');
    if (asset.file.size > IMPORT_MAX_BYTES) throw new TooBigError();
    return new Uint8Array(await asset.file.arrayBuffer());
  }
  const { File } = await import('expo-file-system');
  const file = new File(asset.uri);
  if (typeof file.size === 'number' && file.size > IMPORT_MAX_BYTES) throw new TooBigError();
  return new Uint8Array(await file.arrayBuffer());
}

/** Apaga a cópia do arquivo que o seletor fez no cache do app (tem lançamentos da pessoa). Só no celular; nunca lança. */
async function deleteCachedCopy(asset: DocumentPicker.DocumentPickerAsset): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const { File, Paths } = await import('expo-file-system');
    if (asset.uri.startsWith(Paths.cache.uri)) {
      const file = new File(asset.uri);
      if (file.exists) file.delete();
    }
  } catch {
    // O sistema limpa o cache quando precisa; a cópia só fica até lá.
  }
}

/**
 * Extrato ou fatura em PDF (D-078 A): o texto e a posição de cada pedaço vêm do PDF.js no aparelho e vão para a leitura genérica do
 * core (`statementFromPdfItems`); a pessoa revê cada linha antes de importar. PDF com senha ou quebrado: `pdf_ilegivel`.
 */
async function readImportPdf(bytes: Uint8Array, timeZone: string | undefined): Promise<ImportRead> {
  const items: PdfTextItem[] = [];
  const control = newPdfReadControl();
  const work = pdfTextFromBytes(bytes, control, items, PDF_STATEMENT_MAX_PAGES, true);
  const raced = await raceWithTimeout(work, PDF_STATEMENT_TIMEOUT_MS, () => control.abort());
  if (raced === 'tempo') return { kind: 'erro', code: 'pdf_ilegivel' };
  if (raced === 'erro') {
    const cause = await work.then(() => null, (e: unknown) => e);
    return { kind: 'erro', code: cause instanceof PdfTooManyPagesError ? 'pdf_paginas_demais' : 'pdf_ilegivel' };
  }
  const parse = statementFromPdfItems(items, todayIn(timeZone ?? deviceTimeZone()));
  return parse ? { kind: 'ok', parse, table: null } : { kind: 'erro', code: 'pdf_sem_lancamentos' };
}

const isPdf = (bytes: Uint8Array) => bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;

/** Abre o seletor de arquivos e lê o escolhido. Cancelar não é erro. */
export async function pickImportFile(timeZone?: string): Promise<PickedImport> {
  let picked: DocumentPicker.DocumentPickerResult;
  try {
    // Qualquer tipo: o OFX não tem um tipo comum e o sistema esconderia o arquivo; o conteúdo é que diz o que ele é.
    picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false, base64: false });
  } catch {
    return { cancelled: false, name: '', read: { kind: 'erro', code: 'csv_invalido' } };
  }
  const asset = picked.canceled ? null : picked.assets[0];
  if (!asset) return { cancelled: true };
  try {
    if (typeof asset.size === 'number' && asset.size > IMPORT_MAX_BYTES) return { cancelled: false, name: asset.name, read: { kind: 'erro', code: 'arquivo_grande' } };
    const bytes = await bytesOf(asset);
    // A leitura é síncrona e pode levar um tempo num arquivo grande: cede a vez antes, para a tela mostrar "Lendo o arquivo…".
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (isPdf(bytes)) return { cancelled: false, name: asset.name, read: await readImportPdf(bytes, timeZone) };
    return { cancelled: false, name: asset.name, read: readImportFile(bytes, asset.name, timeZone) };
  } catch (e) {
    return { cancelled: false, name: asset.name, read: { kind: 'erro', code: e instanceof TooBigError ? 'arquivo_grande' : 'csv_invalido' } };
  } finally {
    await deleteCachedCopy(asset);
  }
}
