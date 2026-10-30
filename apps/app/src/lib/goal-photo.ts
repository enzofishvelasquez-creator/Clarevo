import { GOAL_PHOTO_MAX_BYTES, GOAL_PHOTO_MAX_SIDE, base64Bytes } from '@clarevo/core';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export type PickedGoalPhoto = { ok: true; base64: string } | { ok: false; reason: 'cancelado' | 'foto_grande' | 'falha' };

/**
 * Foto da meta (D-077): a pessoa escolhe na galeria (o seletor do sistema; só a foto escolhida chega ao app), recorta em 16:9 quando o
 * aparelho oferece, e o app reduz o lado maior para 1080 px em JPEG antes de mandar (o banco aceita até 300 KB). Se ainda passar, tenta
 * com mais compressão. Nada fica guardado no aparelho.
 */
export async function pickGoalPhoto(): Promise<PickedGoalPhoto> {
  try {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 1 });
    const asset = res.canceled ? null : res.assets[0];
    if (!asset) return { ok: false, reason: 'cancelado' };
    const landscape = (asset.width ?? 0) >= (asset.height ?? 0);
    const side = landscape ? asset.width : asset.height;
    const ctx = ImageManipulator.manipulate(asset.uri);
    if (side && side > GOAL_PHOTO_MAX_SIDE) ctx.resize(landscape ? { width: GOAL_PHOTO_MAX_SIDE } : { height: GOAL_PHOTO_MAX_SIDE });
    const image = await ctx.renderAsync();
    for (const compress of [0.72, 0.5, 0.35]) {
      const out = await image.saveAsync({ compress, format: SaveFormat.JPEG, base64: true });
      const b64 = (out.base64 ?? '').replace(/^data:[^,]*,/, '');
      if (b64 && base64Bytes(b64) <= GOAL_PHOTO_MAX_BYTES) return { ok: true, base64: b64 };
    }
    return { ok: false, reason: 'foto_grande' };
  } catch {
    return { ok: false, reason: 'falha' };
  }
}
