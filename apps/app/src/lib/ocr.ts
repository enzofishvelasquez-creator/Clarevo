/**
 * Leitura de texto em imagem no próprio aparelho (D-078 B). No app das lojas ainda não existe: a leitura de imagem precisa de um
 * módulo nativo e de um build novo. A versão web (`ocr.web.ts`) usa o tesseract.js servido pelo próprio app.
 */
export const OCR_AVAILABLE = false;

export async function textFromImage(_image: Blob | string, _onProgress?: (fraction: number) => void): Promise<string> {
  throw new Error('leitura de imagem indisponível neste aparelho');
}
