/**
 * "Baixar lista" do painel da empresa (D-056): o painel só existe na web, então no celular não há download. A versão web
 * (`company-file.web.ts`) baixa o CSV por Blob. Nada vai ao servidor e nada é guardado.
 */
export const CAN_DOWNLOAD = false;

export type DownloadResult = 'ok' | 'falhou';

export async function downloadTextFile(_fileName: string, _content: string, _mime: string): Promise<DownloadResult> {
  return 'falhou';
}
