/**
 * Versão web de `company-file.ts` (D-056): o CSV da lista de links é baixado por Blob, como as exportações (D-047). Nada vai ao
 * servidor e nada é guardado.
 */
import type { DownloadResult } from './company-file';

export type { DownloadResult };

export const CAN_DOWNLOAD = true;

export async function downloadTextFile(fileName: string, content: string, mime: string): Promise<DownloadResult> {
  try {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return 'ok';
  } catch {
    return 'falhou';
  }
}
