/**
 * Leitura de texto em imagem no app de celular (D-078 B), no próprio aparelho e sem custo: no iPhone, o leitor de texto do sistema
 * (Apple Vision); no Android, o ML Kit do Google, pelo Google Play services. O módulo é o `expo-text-extractor`. A imagem não vai a
 * servidor nenhum da Clarevo; o texto lido vai direto para os leitores do core (comprovante, holerite, boleto, chave da nota) e é
 * descartado. A versão web (`ocr.web.ts`) usa o tesseract.js servido pelo próprio app.
 *
 * O módulo é nativo: num build antigo, sem ele, `require` falha e a leitura de imagem simplesmente não aparece (OCR_AVAILABLE falso),
 * sem derrubar o app.
 */
type TextExtractor = { isSupported: boolean; extractTextFromImage: (uri: string) => Promise<string[]> };

let extractor: TextExtractor | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  extractor = require('expo-text-extractor') as TextExtractor;
} catch {
  extractor = null;
}

export const OCR_AVAILABLE = extractor?.isSupported === true;

/** No celular, a imagem é sempre um endereço de arquivo (o da galeria ou o da foto tirada). */
export async function textFromImage(image: Blob | string, _onProgress?: (fraction: number) => void): Promise<string> {
  if (!extractor || typeof image !== 'string') throw new Error('leitura de imagem indisponível neste aparelho');
  const blocks = await extractor.extractTextFromImage(image);
  return blocks.join('\n');
}
