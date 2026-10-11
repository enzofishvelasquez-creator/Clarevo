import type { ExportFile } from '@clarevo/core';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

/**
 * Entrega do arquivo exportado (D-047) no celular: o CSV é escrito no cache do app e o PDF é gerado pelo expo-print; os dois vão
 * ao compartilhamento do aparelho (expo-sharing). A cópia temporária é apagada logo depois, mesmo se o compartilhamento falhar:
 * o app não guarda o arquivo. A versão web (`export-share.web.ts`) baixa por Blob e abre a página de impressão.
 *
 * APIs conferidas nas definições de tipo instaladas: expo-print 57.0.2, expo-sharing 57.0.22 e expo-file-system 57.0.7.
 */
export const EXPORT_NATIVE = true;

export type DeliverResult = 'ok' | 'indisponivel' | 'falhou' | 'bloqueado';

/** A4 em pontos. */
const PAGE = { width: 595, height: 842 } as const;

function remove(file: File | null) {
  try {
    if (file?.exists) file.delete();
  } catch {
    // O sistema limpa o cache quando precisa; a cópia só fica até lá.
  }
}

export async function deliverExportFile(file: ExportFile, dialogTitle: string): Promise<DeliverResult> {
  let target: File | null = null;
  let printed: File | null = null;
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
    return 'ok';
  } catch {
    return 'falhou';
  } finally {
    remove(printed);
    remove(target);
  }
}
