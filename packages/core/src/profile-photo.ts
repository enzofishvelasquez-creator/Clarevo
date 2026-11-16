/**
 * Foto do perfil (pedido do Enzo, 16/11/2026; migração 0038). A pessoa põe uma foto em Conta: pela galeria ou pela câmera, recortada
 * quadrada e reduzida no aparelho (512 px, até 150 KB) antes de mandar. Só a própria pessoa vê a foto: nem a Família nem a empresa. No
 * cabeçalho, na barra lateral e em Conta, a foto toma o lugar das iniciais.
 */
import { base64Bytes, goalPhotoMime } from './goal-images';

/** O mesmo limite do banco (person_photos, 150 KB depois de decodificar o base64). */
export const PROFILE_PHOTO_MAX_BYTES = 150 * 1024;
/** Lado da foto quadrada que o app manda. */
export const PROFILE_PHOTO_SIDE = 512;

/** A foto em si. */
export interface ProfilePhoto {
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
  base64: string;
}

/**
 * O que my_photo devolve: a versão (0 sem foto nunca posta; depois de remover, a versão segue, para uma troca em outro aparelho nunca
 * voltar a uma versão já vista) e a foto, ou null.
 */
export interface ProfilePhotoRead {
  version: number;
  photo: ProfilePhoto | null;
}

/** O resultado de set_my_photo: se há foto e a versão (0 sem linha), para a próxima troca. */
export interface ProfilePhotoState {
  hasPhoto: boolean;
  version: number;
  updatedAt: string | null;
}

/** Recusa da foto antes de enviar (as mesmas regras do banco): foto_grande, foto_invalida ou null. */
export function profilePhotoError(base64: string): 'foto_grande' | 'foto_invalida' | null {
  if (base64Bytes(base64) < 1 || goalPhotoMime(base64) === null) return 'foto_invalida';
  return base64Bytes(base64) > PROFILE_PHOTO_MAX_BYTES ? 'foto_grande' : null;
}

/** "data:image/jpeg;base64,..." para mostrar a foto numa imagem. */
export function profilePhotoUri(photo: Pick<ProfilePhoto, 'mime' | 'base64'>): string {
  return `data:${photo.mime};base64,${photo.base64}`;
}

/** Iniciais do nome para o círculo sem foto: a primeira letra do primeiro e do último nome ("Ana Lima" vira "AL"); sem nome, "·". */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase() || '·';
}

export const PROFILE_PHOTO_TEXT = {
  /** Rótulo do círculo em Conta para o leitor de tela. */
  a11yPhoto: 'Sua foto do perfil',
  a11yInitials: 'Sem foto do perfil',
  add: 'Pôr uma foto',
  change: 'Trocar a foto',
  fromGallery: 'Escolher da galeria',
  fromCamera: 'Tirar uma foto',
  remove: 'Remover a foto',
  removeTitle: 'Remover a foto do perfil?',
  removeBody: 'O círculo volta a mostrar as suas iniciais.',
  removeConfirm: 'Remover',
  cancel: 'Cancelar',
  choose: 'De onde vem a foto?',
  note: 'Só você vê a sua foto, neste e nos seus outros aparelhos.',
  saving: 'Salvando a foto',
  saved: 'Foto do perfil salva.',
  removed: 'Foto do perfil removida.',
  cameraDenied: 'Sem acesso à câmera. Você pode liberar nas configurações do aparelho ou escolher uma foto da galeria.',
  galleryDenied: 'Sem acesso às fotos. Você pode liberar nas configurações do aparelho.',
  /** Botão junto do aviso de câmera sem acesso: abre as configurações do app no aparelho. */
  openSettings: 'Abrir ajustes',
  /** A escolha, o recorte ou a redução da foto falharam no aparelho (nada foi enviado): diferente da falha ao salvar. */
  pickFailed: 'Não foi possível abrir ou preparar esta foto. Tente de novo ou escolha outra.',
  error: {
    foto_grande: 'A foto ficou grande demais, mesmo reduzida. Tente outra.',
    foto_invalida: 'Esta imagem não pode ser usada. Escolha uma foto JPG, PNG ou WebP.',
    versao_desatualizada: 'A foto mudou desde que a tela abriu. Confira a foto atual e tente de novo, se precisar.',
    rede: 'Sem conexão. Confira a foto quando a conexão voltar e tente de novo, se precisar.',
    desconhecido: 'Não foi possível salvar a foto agora. Tente de novo.',
  },
} as const;

/** O texto do erro ao salvar a foto, pelo código do repositório. */
export function profilePhotoErrorText(code: string): string {
  const e = PROFILE_PHOTO_TEXT.error as Record<string, string>;
  return e[code] ?? PROFILE_PHOTO_TEXT.error.desconhecido;
}
