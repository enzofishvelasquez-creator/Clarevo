import type { ExportFile } from '@clarevo/core';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

/**
 * Entrega do arquivo exportado (D-047) no celular: o CSV é escrito no cache do app e o PDF é gerado pelo expo-print; os dois vão
 * ao compartilhamento do aparelho (expo-sharing). No iOS, a cópia temporária é apagada logo depois, mesmo se o compartilhamento
 * falhar. No Android, `shareAsync` volta quando a atividade escolhida devolve o controle, e o Gmail ou o Drive podem ler o arquivo
 * depois disso: a cópia só é apagada logo se o compartilhamento falhar; se deu certo, ela sai na próxima exportação ou quando a
 * tela de exportar abre (`cleanupExportFiles`). O app não guarda o arquivo. A versão web (`export-share.web.ts`) baixa por Blob e abre a página de impressão.
 *
 * APIs conferidas nas definições de tipo instaladas: expo-print 57.0.2, expo-sharing 57.0.22 e expo-file-system 57.0.7.
 */
export const EXPORT_NATIVE = true;

export type DeliverResult = 'ok' | 'indisponivel' | 'falhou' | 'bloqueado';

/** A4 em pontos, com margem de 40 pontos (a margem só vale no iOS; no Android vale a do `@page` do HTML). */
const PAGE = { width: 595, height: 842, margins: { left: 40, right: 40, top: 40, bottom: 40 } } as const;

const ANDROID = Platform.OS === 'android';

function remove(file: File | null) {
  try {
    if (file?.exists) file.delete();
  } catch {
    // O sistema limpa o cache quando precisa; a cópia só fica até lá.
  }
}

/** Apaga os arquivos `clarevo-*` que uma exportação anterior deixou no cache. Nunca lança. */
export function cleanupExportFiles(): void {
  try {
    for (const entry of Paths.cache.list()) {
      if (entry instanceof File && entry.name.startsWith('clarevo-')) remove(entry);
    }
  } catch {
    // O sistema limpa o cache quando precisa; a cópia só fica até lá.
  }
}

export async function deliverExportFile(file: ExportFile, dialogTitle: string): Promise<DeliverResult> {
  let target: File | null = null;
  let printed: File | null = null;
  let keepTarget = false;
  try {
    if (!(await Sharing.isAvailableAsync())) return 'indisponivel';
    target = new File(Paths.cache, file.fileName);
    remove(target);
    if (file.kind === 'pdf') {
      const result = await Print.printToFileAsync({ html: file.content, ...PAGE });
      printed = new File(result.uri);
      printed.moveSync(target);
      printed = null;
    } else {
      target.create();
      // O texto já começa com a marca de ordem de bytes; o UTF-8 a leva junto.
      target.write(new TextEncoder().encode(file.content));
    }
    await Sharing.shareAsync(target.uri, {
      mimeType: file.kind === 'pdf' ? 'application/pdf' : 'text/csv',
      UTI: file.kind === 'pdf' ? 'com.adobe.pdf' : 'public.comma-separated-values-text',
      dialogTitle,
    });
    // No Android o app de destino pode ler o arquivo depois que a tela de compartilhar volta: fica até a próxima limpeza.
    keepTarget = ANDROID;
    return 'ok';
  } catch {
    return 'falhou';
  } finally {
    remove(printed);
    if (!keepTarget) remove(target);
  }
}
