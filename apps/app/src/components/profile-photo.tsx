import { PROFILE_PHOTO_TEXT as T, initialsOf, isRepoError, profilePhotoErrorText, profilePhotoUri } from '@clarevo/core';
import { ImagePlus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Image, Platform, View } from 'react-native';

import { ChoiceDialog, type DialogChoice } from '@/components/choice-dialog';
import { ConfirmDialog } from '@/components/dialog';
import { Banner, LinkButton, Txt } from '@/components/ui';
import { openDeviceSettings } from '@/lib/device';
import { CAMERA_AVAILABLE, pickProfilePhoto, type PhotoSource } from '@/lib/profile-photo';
import { useMyPhoto, useSetMyPhoto } from '@/state/profile-photo';
import { useSession } from '@/state/session';
import { colors, fonts, space } from '@/theme/tokens';

/**
 * O círculo da pessoa (pedido do Enzo, 16/11/2026): a foto do perfil, se houver, ou as iniciais. No cabeçalho (branco sobre o azul), na
 * barra lateral e em Conta. A foto vem de uma consulta só (useMyPhoto); enquanto ela carrega, ou se falhar, ficam as iniciais. Decorativo
 * para o leitor de tela: quem o usa já diz o que ele abre.
 */
export function ProfileAvatar({
  size,
  background = colors.brandTint,
  color = colors.brandText,
  textVariant = 'title',
}: {
  size: number;
  background?: string;
  color?: string;
  textVariant?: 'title' | 'label' | 'caption';
}) {
  const { user } = useSession();
  const photo = useMyPhoto();
  const round = { width: size, height: size, borderRadius: size / 2 };
  if (photo.data?.photo) {
    return <Image source={{ uri: profilePhotoUri(photo.data.photo) }} style={[round, { backgroundColor: background }]} aria-hidden accessibilityIgnoresInvertColors />;
  }
  return (
    <View style={[round, { alignItems: 'center', justifyContent: 'center', backgroundColor: background }]} aria-hidden>
      <Txt variant={textVariant} color={color} style={textVariant === 'title' ? undefined : { fontFamily: fonts.extrabold }} maxFontSizeMultiplier={1.3}>
        {initialsOf(user?.displayName ?? '')}
      </Txt>
    </View>
  );
}

/**
 * Em Conta, embaixo do nome: "Pôr uma foto" (ou "Trocar a foto") abre a escolha entre a galeria e a câmera (só no celular) e, com foto,
 * "Tirar a foto". Na demonstração, a foto fica só na memória do app aberto, como o resto.
 */
export function ProfilePhotoActions() {
  const photo = useMyPhoto();
  const save = useSetMyPhoto();
  const [choosing, setChoosing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  /** `settings`: a câmera sem acesso, com o botão que abre as configurações do app no aparelho. */
  const [message, setMessage] = useState<{ text: string; error: boolean; settings?: boolean } | null>(null);
  const has = Boolean(photo.data?.photo);
  // A versão que o app leu: sem a leitura (carregando ou falhou), os botões ficam parados, para não mandar uma versão errada.
  const version = photo.data?.version ?? 0;
  const ready = photo.data !== undefined;

  async function choose(source: PhotoSource) {
    const fromDialog = choosing;
    setChoosing(false);
    setMessage(null);
    // No iPhone, o seletor do sistema só abre depois que o diálogo terminou de fechar (como a folha de ler documento, docs/04).
    if (fromDialog && Platform.OS === 'ios') await new Promise((resolve) => setTimeout(resolve, 450));
    const picked = await pickProfilePhoto(source);
    if (!picked.ok) {
      if (picked.reason === 'cancelado') return;
      if (picked.reason === 'sem_permissao') {
        setMessage(source === 'camera' ? { text: T.cameraDenied, error: true, settings: true } : { text: T.galleryDenied, error: true });
        return;
      }
      // Foto grande demais mesmo reduzida, ou a escolha, o recorte ou a redução falharam no aparelho: nada foi enviado.
      setMessage({ text: picked.reason === 'foto_grande' ? profilePhotoErrorText('foto_grande') : T.pickFailed, error: true });
      return;
    }
    await write(picked.base64);
  }

  async function write(base64: string | null) {
    setBusy(true);
    try {
      await save.mutateAsync({ base64, expectedVersion: version });
      setMessage({ text: base64 === null ? T.removed : T.saved, error: false });
    } catch (e) {
      setMessage({ text: profilePhotoErrorText(isRepoError(e) ? e.code : 'desconhecido'), error: true });
    } finally {
      setBusy(false);
    }
  }

  const choices: DialogChoice[] = [{ label: T.fromGallery, onPress: () => void choose('galeria'), tone: 'brand' }];
  if (CAMERA_AVAILABLE) choices.push({ label: T.fromCamera, onPress: () => void choose('camera') });

  return (
    <View style={{ gap: space[1], alignItems: 'flex-start' }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space[3] }}>
        <LinkButton
          label={busy ? T.saving : has ? T.change : T.add}
          icon={ImagePlus}
          disabled={busy || !ready}
          onPress={() => (CAMERA_AVAILABLE ? setChoosing(true) : void choose('galeria'))}
          style={{ paddingHorizontal: 0 }}
        />
        {has ? <LinkButton label={T.remove} icon={Trash2} disabled={busy} onPress={() => setConfirmRemove(true)} style={{ paddingHorizontal: 0 }} /> : null}
      </View>
      <Txt variant="caption" color={colors.textSecondary}>
        {T.note}
      </Txt>
      {message ? (
        message.error ? (
          <Banner tone="info">
            <Txt variant="label">{message.text}</Txt>
            {message.settings ? (
              <LinkButton label={T.openSettings} onPress={openDeviceSettings} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
            ) : null}
          </Banner>
        ) : (
          <Txt variant="label" color={colors.textSecondary} accessibilityLiveRegion="polite">
            {message.text}
          </Txt>
        )
      ) : null}
      <ChoiceDialog visible={choosing} title={T.choose} choices={choices} cancelLabel={T.cancel} onCancel={() => setChoosing(false)}>
        <Txt variant="caption" color={colors.textSecondary}>
          {T.note}
        </Txt>
      </ChoiceDialog>
      <ConfirmDialog
        visible={confirmRemove}
        title={T.removeTitle}
        cancelLabel={T.cancel}
        confirmLabel={T.removeConfirm}
        busy={busy}
        onCancel={() => setConfirmRemove(false)}
        onConfirm={async () => {
          setConfirmRemove(false);
          await write(null);
        }}>
        <Txt color={colors.textSecondary}>{T.removeBody}</Txt>
      </ConfirmDialog>
    </View>
  );
}
