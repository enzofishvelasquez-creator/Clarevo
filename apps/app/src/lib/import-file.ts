import { IMPORT_MAX_BYTES, readImportFile, type ImportRead } from '@clarevo/core';
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';

/**
 * Escolher e ler o arquivo de "Importar extrato ou fatura" (D-048), no aparelho. O arquivo (OFX ou planilha CSV) vai do seletor
 * para a memória, é lido pelo core e descartado: nada dele é enviado nem guardado, e a cópia que o seletor faz no cache do app
 * (só no celular) é apagada ao fim. O tamanho é conferido ANTES de ler os bytes (5 MB).
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

/** Abre o seletor de arquivos e lê o escolhido. Cancelar não é erro. */
export async function pickImportFile(): Promise<PickedImport> {
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
    return { cancelled: false, name: asset.name, read: readImportFile(bytes, asset.name) };
  } catch (e) {
    return { cancelled: false, name: asset.name, read: { kind: 'erro', code: e instanceof TooBigError ? 'arquivo_grande' : 'csv_invalido' } };
  } finally {
    await deleteCachedCopy(asset);
  }
}
