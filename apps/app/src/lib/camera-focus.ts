/**
 * Ajuste da câmera da nota fiscal. No celular (app das lojas), o próprio expo-camera já usa o foco automático contínuo do aparelho:
 * nada a fazer. A versão web (`camera-focus.web.ts`) pede ao navegador o foco contínuo e uma resolução maior.
 */
export async function improveCameraFocus(_container: unknown, _torch: boolean): Promise<boolean> {
  return false;
}
