import { PROFILE_PHOTO_MAX_BYTES, PROFILE_PHOTO_SIDE, base64Bytes } from '@clarevo/core';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

export type PhotoSource = 'galeria' | 'camera';
export type PickedProfilePhoto = { ok: true; base64: string } | { ok: false; reason: 'cancelado' | 'sem_permissao' | 'foto_grande' | 'falha' };

/** A câmera só no celular; na web, a galeria (o seletor de arquivos do navegador). */
export const CAMERA_AVAILABLE = Platform.OS !== 'web';

/**
 * Foto do perfil (pedido do Enzo, 16/11/2026): pela galeria (o seletor do sistema; só a foto escolhida chega ao app) ou pela câmera, com
 * o recorte quadrado do sistema quando o aparelho oferece. O app corta no centro o que sobrar, reduz para 512 × 512 px em JPEG e manda;
 * se passar de 150 KB, tenta com mais compressão. Nada fica guardado no aparelho.
 */
export async function pickProfilePhoto(source: PhotoSource): Promise<PickedProfilePhoto> {
  try {
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return { ok: false, reason: 'sem_permissao' };
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 };
    const res = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = res.canceled ? null : res.assets[0];
    if (!asset) return { ok: false, reason: 'cancelado' };
    const ctx = ImageManipulator.manipulate(asset.uri);
    const w = asset.width ?? 0;
    const h = asset.height ?? 0;
    // Quadrada: o recorte do sistema já costuma vir quadrado; se não, o centro.
    if (w > 0 && h > 0 && w !== h) {
      const side = Math.min(w, h);
      ctx.crop({ originX: Math.floor((w - side) / 2), originY: Math.floor((h - side) / 2), width: side, height: side });
    }
    ctx.resize({ width: PROFILE_PHOTO_SIDE, height: PROFILE_PHOTO_SIDE });
    const image = await ctx.renderAsync();
    for (const compress of [0.8, 0.6, 0.4]) {
      const out = await image.saveAsync({ compress, format: SaveFormat.JPEG, base64: true });
      const b64 = (out.base64 ?? '').replace(/^data:[^,]*,/, '');
      if (b64 && base64Bytes(b64) <= PROFILE_PHOTO_MAX_BYTES) return { ok: true, base64: b64 };
    }
    return { ok: false, reason: 'foto_grande' };
  } catch {
    return { ok: false, reason: 'falha' };
  }
}
