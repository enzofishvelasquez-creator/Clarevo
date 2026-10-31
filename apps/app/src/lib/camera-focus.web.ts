/**
 * Câmera da nota fiscal no navegador (retorno do teste, 31/10/2026: "a câmera não foca; só foca depois de sair e voltar pra página").
 *
 * O expo-camera abre a câmera traseira sem pedir resolução (o navegador usa 640 x 480) e supõe que o foco já é contínuo, sem pedir
 * isso à câmera. Em vários Android, o foco fica parado até a câmera ser aberta de novo, e um QR pequeno de cupom fica um borrão.
 * Aqui, depois de a câmera abrir, pedimos à própria trilha de vídeo: foco automático contínuo, resolução perto de 1920 x 1080 e a
 * lanterna como está na tela. Pedir de novo substitui o pedido anterior inteiro, então a lanterna vai junto sempre que muda.
 * Nada sai do aparelho: são só ajustes da câmera.
 */
type FocusCapabilities = MediaTrackCapabilities & { focusMode?: string[]; torch?: boolean };
type AdvancedSet = MediaTrackConstraintSet & { focusMode?: string; torch?: boolean };

/** Procura o vídeo da câmera dentro do quadro, esperando até cerca de 3 s que ele receba a imagem. */
async function findTrack(container: HTMLElement): Promise<MediaStreamTrack | null> {
  for (let i = 0; i < 20; i += 1) {
    const video = container.querySelector('video');
    const stream = video?.srcObject;
    if (stream instanceof MediaStream) {
      const track = stream.getVideoTracks()[0];
      if (track && track.readyState === 'live') return track;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return null;
}

/** true quando o pedido foi aceito pelo navegador. Falha (câmera sem esses ajustes, navegador antigo) não atrapalha a leitura. */
export async function improveCameraFocus(container: unknown, torch: boolean): Promise<boolean> {
  if (typeof HTMLElement === 'undefined' || !(container instanceof HTMLElement)) return false;
  const track = await findTrack(container);
  if (!track || typeof track.getCapabilities !== 'function') return false;
  const caps = track.getCapabilities() as FocusCapabilities;
  const advanced: AdvancedSet = {};
  if (caps.focusMode?.includes('continuous')) advanced.focusMode = 'continuous';
  if (caps.torch) advanced.torch = torch;
  const size: MediaTrackConstraints = {};
  if (caps.width?.max) size.width = { ideal: Math.min(1920, caps.width.max) };
  if (caps.height?.max) size.height = { ideal: Math.min(1080, caps.height.max) };
  const withAdvanced = Object.keys(advanced).length > 0 ? { advanced: [advanced] } : {};
  try {
    await track.applyConstraints({ ...size, ...withAdvanced });
    return true;
  } catch {
    // Alguns aparelhos recusam a resolução: fica só o foco (e a lanterna).
    try {
      if (Object.keys(advanced).length === 0) return false;
      await track.applyConstraints(withAdvanced);
      return true;
    } catch {
      return false;
    }
  }
}
