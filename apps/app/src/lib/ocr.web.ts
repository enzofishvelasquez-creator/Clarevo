/**
 * Leitura de texto em imagem no navegador (D-078 B): tesseract.js (código aberto, sem custo) rodando no próprio aparelho, com o
 * worker, o núcleo em WebAssembly e os dados do português servidos pelo próprio app em `/ocr/` (`scripts/copiar-ocr.js`). A imagem
 * nunca sai do aparelho e não vai a serviço nenhum; o texto lido vai direto para os leitores do core (comprovante, holerite, boleto,
 * chave da nota) e é descartado. O worker é criado na hora e encerrado ao fim de cada leitura.
 *
 * É reconhecimento de texto (OCR), uma técnica de aprendizado de máquina: a única exceção à regra "sem IA" do ciclo, aprovada por
 * Enzo em 31/10/2026 (D-078), e só assim, no aparelho.
 */
export const OCR_AVAILABLE = true;

/** Tempo máximo de uma leitura (abrir o worker, carregar o português e ler). */
const OCR_TIMEOUT_MS = 60_000;

function base(): string {
  return `${globalThis.location?.origin ?? ''}/ocr`;
}

export async function textFromImage(image: Blob | string, onProgress?: (fraction: number) => void): Promise<string> {
  const { createWorker, OEM } = await import('tesseract.js');
  const worker = await createWorker('por', OEM.LSTM_ONLY, {
    workerPath: `${base()}/worker.min.js`,
    corePath: base(),
    langPath: base(),
    // Os dados do português vão descomprimidos (scripts/copiar-ocr.js); o servidor comprime na entrega.
    gzip: false,
    workerBlobURL: false,
    logger: (m: { status: string; progress: number }) => {
      if (onProgress && m.status === 'recognizing text') onProgress(m.progress);
    },
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const work = worker.recognize(image).then((r: { data: { text: string } }) => r.data.text);
    const limit = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('tempo esgotado')), OCR_TIMEOUT_MS);
    });
    return await Promise.race([work, limit]);
  } finally {
    if (timer) clearTimeout(timer);
    await worker.terminate().catch(() => {});
  }
}
