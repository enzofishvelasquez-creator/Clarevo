/**
 * Texto de um PDF lido no próprio aparelho (D-038, fase "PDF"; escolha e provas em e_pdf_choice.md): unpdf 1.8.1 (PDF.js embutido),
 * sem servidor. O texto vai direto para `danfeFromText` e é descartado; o arquivo não sai do aparelho.
 *
 * Condições obrigatórias da escolha da biblioteca:
 * 1. guarda do `structuredClone`: o polyfill do Expo no nativo falha com o 2º argumento `null` (que o PDF.js passa) e a promessa
 *    nunca resolve. A guarda troca `null` por `undefined`. Na web o navegador já tem `structuredClone` correto e a guarda é inofensiva.
 * 2. juntar os itens de texto aqui (`getTextContent`), não com `extractText` (que cola o valor no rótulo da mesma linha);
 * 3. `getDocument` com `{ disableFontFace: true, verbosity: 0 }` (mesmos padrões do `getDocumentProxy`) e destruir a tarefa no `finally`
 *    e no tempo limite (`PdfReadControl`).
 * No nativo o Metro não separa o código: o PDF.js (cerca de 1,7 MB de JavaScript) entra no pacote. Na web, o `import()` abaixo vira
 * um pedaço separado que só carrega quando a pessoa escolhe o PDF.
 */
export const PDF_MAX_BYTES = 10 * 1024 * 1024;
const PDF_MAX_PAGES = 3;

type CloneFn = (value: unknown, options?: unknown) => unknown;
type GuardedClone = CloneFn & { __clarevoGuard?: true };

export function installStructuredCloneGuard(): void {
  const g = globalThis as unknown as { structuredClone?: GuardedClone };
  const original = g.structuredClone;
  if (typeof original === 'function' && !original.__clarevoGuard) {
    const guarded: GuardedClone = (value, options) => original(value, options == null ? undefined : options);
    guarded.__clarevoGuard = true;
    g.structuredClone = guarded;
  }
}

/** O arquivo parece um PDF (cabeçalho "%PDF-" nos primeiros bytes). */
export function hasPdfHeader(bytes: Uint8Array): boolean {
  const head = Array.from(bytes.subarray(0, 1024), (b) => String.fromCharCode(b)).join('');
  return head.includes('%PDF-');
}

/** Controle da leitura em andamento: `abort()` destrói a tarefa do PDF.js (também a que ainda está abrindo) e para a leitura das páginas. */
export interface PdfReadControl {
  aborted: boolean;
  task: { destroy(): Promise<void> } | null;
  abort(): void;
}

export function newPdfReadControl(): PdfReadControl {
  const control: PdfReadControl = {
    aborted: false,
    task: null,
    abort() {
      control.aborted = true;
      control.task?.destroy().catch(() => {});
    },
  };
  return control;
}

/**
 * Texto das primeiras páginas do PDF, com os itens separados por espaço e quebra de linha onde o PDF a indica. Lança se o PDF não
 * abre ou se a leitura foi abortada. A tarefa é criada aqui (`getDocument`) para ser destruída em qualquer saída: sucesso, falha
 * ao abrir, falha numa página ou `control.abort()` (tempo limite).
 */
export async function pdfTextFromBytes(bytes: Uint8Array, control?: PdfReadControl): Promise<string> {
  installStructuredCloneGuard();
  const { getResolvedPDFJS } = await import('unpdf');
  const { getDocument } = await getResolvedPDFJS();
  if (control?.aborted) throw new Error('leitura cancelada');
  const task = getDocument({ data: bytes, useSystemFonts: true, disableFontFace: true, verbosity: 0 });
  if (control) control.task = task;
  try {
    const pdf = await task.promise;
    const parts: string[] = [];
    for (let n = 1; n <= Math.min(pdf.numPages, PDF_MAX_PAGES); n++) {
      if (control?.aborted) throw new Error('leitura cancelada');
      const content = await (await pdf.getPage(n)).getTextContent();
      for (const item of content.items) if ('str' in item) parts.push(item.str, item.hasEOL ? '\n' : ' ');
      parts.push('\n');
    }
    return parts.join('');
  } finally {
    await task.destroy().catch(() => {});
  }
}
