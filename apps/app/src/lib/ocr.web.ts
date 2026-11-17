/**
 * Leitura de texto em imagem no navegador (D-078 B): tesseract.js (código aberto, sem custo) rodando no próprio aparelho, com o
 * worker, o núcleo em WebAssembly e os dados do português servidos pelo próprio app em `/ocr/` (`scripts/copiar-ocr.js`). A imagem
 * nunca sai do aparelho e não vai a serviço nenhum; o texto lido vai direto para os leitores do core (comprovante, holerite, boleto,
 * chave da nota, prints da tela do banco para importar) e é descartado. O worker é criado na hora e encerrado ao fim de cada leitura.
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

type OcrWorker = {
  recognize: (image: Blob | string) => Promise<{ data: { text: string } }>;
  setParameters: (params: Record<string, string>) => Promise<unknown>;
  terminate: () => Promise<unknown>;
};

async function newWorker(onProgress?: (fraction: number) => void): Promise<OcrWorker> {
  const { createWorker, OEM } = await import('tesseract.js');
  return (await createWorker('por', OEM.LSTM_ONLY, {
    workerPath: `${base()}/worker.min.js`,
    corePath: base(),
    langPath: base(),
    // Os dados do português vão descomprimidos (scripts/copiar-ocr.js); o servidor comprime na entrega.
    gzip: false,
    workerBlobURL: false,
    logger: (m: { status: string; progress: number }) => {
      if (onProgress && m.status === 'recognizing text') onProgress(m.progress);
    },
  })) as unknown as OcrWorker;
}

async function recognizeWithin(worker: OcrWorker, image: Blob | string): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const work = worker.recognize(image).then((r) => r.data.text);
    const limit = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('tempo esgotado')), OCR_TIMEOUT_MS);
    });
    return await Promise.race([work, limit]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function textFromImage(image: Blob | string, onProgress?: (fraction: number) => void): Promise<string> {
  const worker = await newWorker(onProgress);
  try {
    return await recognizeWithin(worker, image);
  } finally {
    await worker.terminate().catch(() => {});
  }
}

/**
 * Prints da tela do banco para importar (D-108): um worker só para todas as imagens, na ordem, com a página lida como uma coluna de
 * linhas de tamanhos diferentes (modo 4 do tesseract), para a descrição e o valor de cada lançamento ficarem na mesma linha, e a
 * resolução de 300 pontos por polegada.
 * `onProgress(feitas, total)` avisa antes de cada imagem. O worker é encerrado no fim, com ou sem erro.
 */
export async function textsFromImages(images: readonly (Blob | string)[], onProgress?: (done: number, total: number) => void): Promise<string[]> {
  const worker = await newWorker();
  try {
    // Resolução fixa: o print não diz a dele, e o tesseract avisaria no console a cada imagem ("Estimating resolution").
    await worker.setParameters({ tessedit_pageseg_mode: '4', user_defined_dpi: '300' });
    const out: string[] = [];
    for (let i = 0; i < images.length; i++) {
      onProgress?.(i, images.length);
      out.push(await recognizeWithin(worker, images[i]!));
    }
    return out;
  } finally {
    await worker.terminate().catch(() => {});
  }
}
