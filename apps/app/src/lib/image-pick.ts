import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { withExternalScreen } from '@/lib/external-screen';

/**
 * Imagem para ler um documento no app de celular (D-078 B): um print ou foto da galeria (o seletor do sistema; só a imagem escolhida
 * chega ao app) ou uma foto tirada na hora. A imagem fica só no cache do app enquanto é lida e é apagada logo depois
 * (`discardPickedImage`); nada é enviado nem guardado. Na web, o seletor de arquivos já oferece as duas coisas, e este módulo não é usado.
 */
export type PickedImage = { uri: string; size?: number };
export type ImagePick = { kind: 'ok'; image: PickedImage } | { kind: 'cancelado' } | { kind: 'sem_permissao' } | { kind: 'falhou' };

export async function pickImageForReading(source: 'galeria' | 'camera'): Promise<ImagePick> {
  try {
    let result: ImagePicker.ImagePickerResult;
    // O pedido da câmera, a câmera e a galeria são telas de fora: a volta delas não trava o app (lib/external-screen.ts).
    if (source === 'camera') {
      const permission = await withExternalScreen(() => ImagePicker.requestCameraPermissionsAsync());
      if (!permission.granted) return { kind: 'sem_permissao' };
      result = await withExternalScreen(() => ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 }));
    } else {
      result = await withExternalScreen(() => ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 }));
    }
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return { kind: 'cancelado' };
    return { kind: 'ok', image: { uri: asset.uri, size: asset.fileSize ?? undefined } };
  } catch {
    return { kind: 'falhou' };
  }
}

/**
 * Vários prints da galeria de uma vez (D-108, importar extrato ou fatura por print), na ordem em que a pessoa escolheu, até `limit`.
 * Como na escolha de uma imagem, só as escolhidas chegam ao app, ficam no cache enquanto são lidas e são apagadas depois
 * (`deleteCacheFile` de cada uma). O seletor do sistema não deixa passar do limite; onde ele não limita, quem chama confere.
 */
export type ImagesPick = { kind: 'ok'; images: PickedImage[] } | { kind: 'cancelado' } | { kind: 'falhou' };

export async function pickImagesForReading(limit: number): Promise<ImagesPick> {
  try {
    const result = await withExternalScreen(() =>
      ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsMultipleSelection: true, selectionLimit: limit, orderedSelection: true }),
    );
    const assets = result.canceled ? [] : result.assets;
    if (assets.length === 0) return { kind: 'cancelado' };
    return { kind: 'ok', images: assets.map((a) => ({ uri: a.uri, size: a.fileSize ?? undefined })) };
  } catch {
    return { kind: 'falhou' };
  }
}

/**
 * Apaga um arquivo do cache do app (a foto tirada ou a cópia que o seletor faz). Só dentro do cache: nunca apaga a foto original da
 * galeria. Falhar não é erro: o sistema limpa o cache quando precisa.
 */
export async function deleteCacheFile(uri: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const { File, Paths } = await import('expo-file-system');
    if (uri.startsWith(Paths.cache.uri)) {
      const file = new File(uri);
      if (file.exists) file.delete();
    }
  } catch {
    // O sistema limpa o cache quando precisa; a cópia só fica até lá.
  }
}

/** Depois de ler a imagem escolhida ou fotografada, apaga a cópia do cache. */
export async function discardPickedImage(pick: ImagePick): Promise<void> {
  if (pick.kind === 'ok') await deleteCacheFile(pick.image.uri);
}
