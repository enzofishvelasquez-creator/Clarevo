/**
 * Versão web de `export-share.ts` (D-047): o CSV é baixado por Blob e o resumo abre uma página de impressão com o mesmo HTML
 * (a pessoa escolhe "Salvar como PDF"). Os pacotes nativos ficam fora do site. Nada vai ao servidor e nada é guardado.
 */
import type { ExportFile } from '@clarevo/core';

import type { DeliverResult } from './export-share';

export type { DeliverResult };

export const EXPORT_NATIVE = false;

/** Na web não há cópia temporária: o CSV baixa por Blob e a página de impressão não grava nada. */
export function cleanupExportFiles(): void {}

export async function deliverExportFile(file: ExportFile, _dialogTitle: string): Promise<DeliverResult> {
  try {
    if (file.kind === 'csv') {
      const url = URL.createObjectURL(new Blob([file.content], { type: file.mime }));
      const link = document.createElement('a');
      link.href = url;
      link.download = file.fileName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return 'ok';
    }
    // Chamada direto do toque, sem espera antes: assim o navegador não trata a janela como bloqueada.
    const page = window.open('', '_blank');
    if (!page) return 'bloqueado';
    page.document.open();
    page.document.write(file.content);
    page.document.close();
    let printed = false;
    const print = () => {
      if (printed) return;
      printed = true;
      if (page.closed) return;
      page.focus();
      page.print();
    };
    page.addEventListener('load', print);
    setTimeout(print, 600);
    return 'ok';
  } catch {
    return 'falhou';
  }
}
