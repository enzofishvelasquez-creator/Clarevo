import {
  COMPROVANTE_TEXT,
  NOTA_CAMERA,
  NOTA_FLOW_TEXT,
  NOTA_TEXT,
  SEFAZ_TEXT,
  accessKeyFromText,
  scanOptionLabel,
  scanSheetOptions,
  type ReceiptMatch,
  type ScanOption,
} from '@clarevo/core';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { Camera, ChevronRight, FileText, Flashlight, FlashlightOff, Info, QrCode } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ChoiceDialog, type DialogChoice } from '@/components/choice-dialog';
import { ContextPill, SubHeader } from '@/components/header';
import { MoneyTxt } from '@/components/money-text';
import { Banner, Button, LinkButton, TextField, Txt, styles as ui } from '@/components/ui';
import { improveCameraFocus } from '@/lib/camera-focus';
import { OCR_AVAILABLE, textFromImage } from '@/lib/ocr';
import { invoiceHref } from '@/lib/cards';
import { imageTooBig } from '@/lib/comprovante-read';
import { useCard, useCardEntry, useRecord } from '@/state/data';
import { colors, fonts, radius, space } from '@/theme/tokens';

/**
 * "Escanear nota fiscal" em Anotar gasto novo (D-038): a linha do topo, a folha do primeiro toque (câmera, PDF, colar), a câmera
 * (QR e Code 128 da chave), o campo "Colar o link ou a chave" e o aviso de nota já anotada. O bloco "Nota lida" fica em
 * `receipt-block.tsx`. Nada é gravado aqui: a leitura só preenche o formulário.
 */

/**
 * A linha de 56 px (azul claro) que abre a folha ou a câmera. `variant="comprovante"` (D-051) é a linha de Registrar recebimento:
 * "Ler comprovante de Pix ou pagamento (PDF)", que vai direto ao seletor de arquivos.
 */
export function ScanLine({ onPress, disabled, variant = 'nota' }: { onPress: () => void; disabled?: boolean; variant?: 'nota' | 'comprovante' }) {
  const proof = variant === 'comprovante';
  const Icon = proof ? FileText : QrCode;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={proof ? (OCR_AVAILABLE ? COMPROVANTE_TEXT.lineA11y : COMPROVANTE_TEXT.lineA11yPdf) : NOTA_FLOW_TEXT.scanLineA11y}
      disabled={disabled}
      onPress={onPress}
      style={(s) => [styles.scanLine, (s as { focused?: boolean }).focused && ui.focusRing, s.pressed && { backgroundColor: colors.brandTintPressed }]}>
      <Icon size={24} color={colors.brand} strokeWidth={2.25} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="label" color={colors.brand} style={{ fontFamily: fonts.bold }}>
          {proof ? COMPROVANTE_TEXT.option : NOTA_TEXT.scanButton}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {proof ? (OCR_AVAILABLE ? COMPROVANTE_TEXT.lineHint : COMPROVANTE_TEXT.lineHintPdf) : NOTA_FLOW_TEXT.scanLineHint}
        </Txt>
      </View>
      <ChevronRight size={20} color={colors.brand} aria-hidden />
    </Pressable>
  );
}

/** Folha com as opções (câmera só quando existe câmera). A frase da permissão aparece antes de a câmera pedi-la. */
export function ScanSheet({
  visible,
  cameraAvailable,
  showCameraIntro,
  onChoose,
  onClose,
}: {
  visible: boolean;
  cameraAvailable: boolean;
  showCameraIntro: boolean;
  onChoose: (option: ScanOption) => void;
  onClose: () => void;
}) {
  const choices: DialogChoice[] = scanSheetOptions(cameraAvailable).map((option) => ({
    label: scanOptionLabel(option),
    tone: option === scanSheetOptions(cameraAvailable)[0] ? 'brand' : 'soft',
    onPress: () => onChoose(option),
  }));
  return (
    <ChoiceDialog visible={visible} title={NOTA_FLOW_TEXT.sheetTitle} choices={choices} onCancel={onClose}>
      {cameraAvailable && showCameraIntro ? (
        <Txt variant="label" color={colors.textSecondary}>
          {NOTA_FLOW_TEXT.cameraIntro}
        </Txt>
      ) : null}
      <Txt variant="caption" color={colors.textSecondary}>
        {NOTA_TEXT.privacy}
      </Txt>
      <Txt variant="caption" color={colors.textSecondary}>
        {COMPROVANTE_TEXT.sheetPrivacy}
      </Txt>
      {!cameraAvailable && Platform.OS === 'web' ? (
        <Txt variant="label" color={colors.textSecondary}>
          {NOTA_FLOW_TEXT.webPdfFirst}
        </Txt>
      ) : null}
    </ChoiceDialog>
  );
}

/** Campo "Colar o link ou a chave da nota". Na demonstração, também a nota de exemplo (fictícia e identificada). */
export function PasteModal({
  visible,
  message,
  boleto,
  demo,
  onSubmit,
  onExample,
  onBoleto,
  onClose,
}: {
  visible: boolean;
  /** Erro da última tentativa (a leitura não deu certo). */
  message: string | null;
  boleto: boolean;
  demo: boolean;
  onSubmit: (text: string) => void;
  onExample: () => void;
  onBoleto: () => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  // "Ler a chave numa foto" (D-078 B): a foto é lida no aparelho e só a chave achada vai para o campo.
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  useEffect(() => {
    if (visible) {
      setText('');
      setPhotoError(null);
    }
  }, [visible]);
  async function keyFromPhoto() {
    setPhotoError(null);
    let picked: DocumentPicker.DocumentPickerResult;
    try {
      picked = await DocumentPicker.getDocumentAsync({ type: ['image/png', 'image/jpeg', 'image/webp'], copyToCacheDirectory: true, multiple: false, base64: false });
    } catch {
      setPhotoError(NOTA_TEXT.keyPhotoNone);
      return;
    }
    const asset = picked.canceled ? null : picked.assets[0];
    if (!asset) return;
    if (imageTooBig(asset)) {
      setPhotoError(NOTA_TEXT.keyPhotoNone);
      return;
    }
    setPhotoBusy(true);
    try {
      const key = accessKeyFromText(await textFromImage(asset.file ?? asset.uri));
      if (key) {
        setText(key);
        onSubmit(key);
      } else setPhotoError(NOTA_TEXT.keyPhotoNone);
    } catch {
      setPhotoError(NOTA_TEXT.keyPhotoNone);
    } finally {
      setPhotoBusy(false);
    }
  }
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.backdrop}>
          <View style={styles.box} accessibilityViewIsModal accessibilityRole="alert">
            <Txt variant="title" accessibilityRole="header">
              {NOTA_FLOW_TEXT.pasteTitle}
            </Txt>
            <TextField
              label={NOTA_TEXT.pasteLabel}
              hint={NOTA_TEXT.pasteHint}
              value={text}
              onChangeText={setText}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              returnKeyType="go"
              onSubmitEditing={() => onSubmit(text)}
              error={boleto ? undefined : (message ?? undefined)}
            />
            {boleto ? (
              <Banner tone="info" icon={Info}>
                <Txt variant="label">{NOTA_FLOW_TEXT.boleto}</Txt>
                <Button label={NOTA_FLOW_TEXT.boletoAction} tone="soft" onPress={onBoleto} />
              </Banner>
            ) : null}
            {OCR_AVAILABLE ? (
              <View style={{ gap: space[1] }}>
                <Button label={photoBusy ? NOTA_TEXT.keyPhotoWorking : NOTA_TEXT.keyPhoto} icon={Camera} tone="soft" disabled={photoBusy} onPress={() => void keyFromPhoto()} />
                <Txt variant="caption" color={colors.textSecondary}>
                  {NOTA_TEXT.keyPhotoHint}
                </Txt>
                {photoError ? (
                  <Txt variant="label" color={colors.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
                    {photoError}
                  </Txt>
                ) : null}
              </View>
            ) : null}
            <View style={{ gap: space[2], marginTop: space[1] }}>
              <Button label={NOTA_FLOW_TEXT.pasteSubmit} onPress={() => onSubmit(text)} />
              {demo ? (
                <View style={{ gap: space[1] }}>
                  <Button label={NOTA_TEXT.example.button} tone="soft" onPress={onExample} />
                  <Txt variant="caption" color={colors.textSecondary}>
                    {NOTA_TEXT.example.note}
                  </Txt>
                </View>
              ) : null}
              <Button label="Cancelar" tone="ghost" onPress={onClose} />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * Tela da câmera: QR (NFC-e) e código de barras Code 128 (chave da NF-e no DANFE). O boleto usa outro código de barras e nem
 * é lido. A permissão só é pedida aqui, depois da frase que explica o uso (nenhuma foto é guardada). Sem câmera ou com a permissão
 * negada, as outras saídas continuam: PDF e colar. O contexto fica à vista ("Salvando em Pessoal").
 * `onCode` devolve o texto do erro quando o código lido não serve (a câmera continua procurando) ou null quando a leitura foi aceita.
 */
export function CameraModal({
  visible,
  onCode,
  onPdf,
  onPaste,
  onProof,
  onClose,
}: {
  visible: boolean;
  onCode: (data: string) => string | null;
  onPdf: () => void;
  onPaste: () => void;
  /** "Ler comprovante de Pix ou pagamento (PDF)" (D-051): quem já usou a câmera abre direto nela, então a opção também mora aqui. */
  onProof: () => void;
  onClose: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  /** 0: nenhuma dica; 1: "Aproxime..." (5 s); 2: também a da lanterna (10 s). */
  const [hint, setHint] = useState<0 | 1 | 2>(0);
  const [ready, setReady] = useState(false);
  const [mountError, setMountError] = useState(false);
  const last = useRef({ data: '', at: 0 });
  const done = useRef(false);
  /** O quadro da câmera: na web, o vídeo dentro dele recebe o pedido de foco contínuo (lib/camera-focus.web.ts). */
  const previewRef = useRef<View>(null);

  useEffect(() => {
    if (!visible) return;
    done.current = false;
    last.current = { data: '', at: 0 };
    setTorch(false);
    setMessage(null);
    setHint(0);
    setReady(false);
    setMountError(false);
  }, [visible]);

  // Na web, com a câmera pronta (e a cada troca da lanterna, depois do pedido do expo-camera), pede foco contínuo e resolução maior.
  useEffect(() => {
    if (!visible || !ready || Platform.OS !== 'web') return;
    const timer = setTimeout(() => {
      improveCameraFocus(previewRef.current, torch).catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [visible, ready, torch]);

  // As dicas contam a partir de a câmera estar pronta: o tempo de pedir a permissão e de abrir a câmera não entra na conta.
  useEffect(() => {
    if (!visible || !ready) return;
    const closer = setTimeout(() => setHint(1), NOTA_CAMERA.closerHintMs);
    const torchHint = setTimeout(() => setHint(2), NOTA_CAMERA.torchHintMs);
    return () => {
      clearTimeout(closer);
      clearTimeout(torchHint);
    };
  }, [visible, ready]);

  const handle = ({ data }: { data: string }) => {
    if (done.current) return;
    const now = Date.now();
    // O mesmo código repetido pela câmera (muitos quadros por segundo) só é tratado de novo depois de uns segundos.
    if (data === last.current.data && now - last.current.at < 3000) return;
    last.current = { data, at: now };
    const error = onCode(data);
    if (error === null) done.current = true;
    else setMessage(error);
  };

  const granted = permission?.granted === true;
  const canAsk = permission?.canAskAgain !== false;

  return (
    <Modal visible={visible} animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SubHeader title={NOTA_TEXT.scanTitle} onBack={onClose} right={<ContextPill label="Salvando em Pessoal" />} />
        <View style={styles.cameraBody}>
          {permission === null ? (
            <Txt color={colors.textSecondary}>{NOTA_FLOW_TEXT.cameraStarting}</Txt>
          ) : !granted ? (
            <View style={{ gap: space[3] }}>
              <Txt>{canAsk ? NOTA_FLOW_TEXT.cameraIntro : NOTA_FLOW_TEXT.cameraDeniedHelp}</Txt>
              {canAsk ? (
                <Button label={NOTA_TEXT.cameraAllow} onPress={() => requestPermission()} />
              ) : Platform.OS !== 'web' ? (
                <Button label="Abrir ajustes" tone="soft" onPress={() => Linking.openSettings().catch(() => {})} />
              ) : null}
            </View>
          ) : mountError ? (
            <Txt>{NOTA_FLOW_TEXT.cameraUnavailable}</Txt>
          ) : (
            <View style={{ gap: space[3] }}>
              <View ref={previewRef} style={styles.preview}>
                <CameraView
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  enableTorch={torch}
                  zoom={Platform.OS === 'ios' ? NOTA_CAMERA.zoom : 0}
                  barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128'] }}
                  onBarcodeScanned={handle}
                  onCameraReady={() => setReady(true)}
                  onMountError={() => setMountError(true)}
                />
                <View style={styles.frameBox} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <View style={styles.frame} />
                </View>
                {!ready ? (
                  <View style={styles.starting} pointerEvents="none">
                    <ActivityIndicator color={colors.textOnBrand} />
                  </View>
                ) : null}
              </View>
              <Txt>{NOTA_FLOW_TEXT.cameraAim}</Txt>
              {message ? (
                <Txt variant="label" color={colors.textSecondary} accessibilityLiveRegion="polite" accessibilityRole="alert">
                  {message}
                </Txt>
              ) : null}
              {hint >= 1 ? (
                <Txt variant="label" color={colors.textSecondary} accessibilityLiveRegion="polite">
                  {NOTA_FLOW_TEXT.cameraCloser}
                </Txt>
              ) : null}
              {hint >= 2 ? (
                <Txt variant="label" color={colors.textSecondary} accessibilityLiveRegion="polite">
                  {NOTA_TEXT.torchHint}
                </Txt>
              ) : null}
              <Button
                label={torch ? NOTA_FLOW_TEXT.torchOff : NOTA_FLOW_TEXT.torchOn}
                icon={torch ? FlashlightOff : Flashlight}
                tone="soft"
                accessibilityState={{ selected: torch }}
                onPress={() => setTorch((t) => !t)}
              />
            </View>
          )}
          <View style={{ gap: space[2] }}>
            <Button label={NOTA_TEXT.sheet.pdf} tone="soft" onPress={onPdf} />
            <Button label={NOTA_TEXT.sheet.paste} tone="soft" onPress={onPaste} />
            <Button label={COMPROVANTE_TEXT.option} tone="soft" onPress={onProof} />
            <Button label={NOTA_FLOW_TEXT.back} tone="ghost" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/**
 * "Esta nota já foi anotada em 06/10/2026: Mercado, R$ 87,40." com "Abrir registro". Para compra no cartão, diz também o cartão e
 * abre a fatura da compra. O aviso vem da leitura da visão receipt_items (findReceipt) feita logo depois de ler a nota.
 */
export function AlreadyNotedBanner({ match }: { match: ReceiptMatch }) {
  const record = useRecord(match.recordId ?? undefined);
  const entry = useCardEntry(match.cardEntryId ?? undefined);
  const card = useCard(match.cardId ?? undefined);
  let text: string | null = null;
  let open: (() => void) | null = null;
  if (match.recordId && record.data) {
    const r = record.data;
    text = NOTA_TEXT.alreadyNoted(r.occurredOn, r.description, r.amountCents);
    open = () => router.push(`/registro/${r.id}`);
  } else if (match.cardEntryId && entry.data && card.data) {
    const e = entry.data;
    text = NOTA_TEXT.alreadyNotedCard(e.purchasedOn ?? e.invoiceMonth + '-01', e.description ?? 'Compra', e.amountCents, card.data.name);
    const cardId = card.data.id;
    open = () => router.push(invoiceHref(cardId, e.invoiceMonth));
  }
  if (!text || !open) return null;
  return (
    <Banner tone="info" icon={Info}>
      <MoneyTxt variant="label" style={{ fontFamily: fonts.bold }}>
        {text}
      </MoneyTxt>
      <Txt variant="caption" color={colors.textSecondary}>
        {NOTA_FLOW_TEXT.alreadyNotedSave}
      </Txt>
      <LinkButton label={NOTA_TEXT.openRecord} style={styles.inlineLink} onPress={open} />
    </Banner>
  );
}

/** Texto da leitura da página da Sefaz (em andamento ou com o resultado). */
export function SefazStatus({ state, message }: { state: 'idle' | 'reading' | 'done' | 'failed'; message: string | null }) {
  if (state === 'reading') {
    return (
      <View style={styles.sefazRow} accessibilityLiveRegion="polite" accessible accessibilityLabel={SEFAZ_TEXT.readingA11y}>
        <ActivityIndicator color={colors.brand} />
        <Txt variant="label">{SEFAZ_TEXT.reading}</Txt>
      </View>
    );
  }
  if (state === 'done') return <Txt variant="label">{SEFAZ_TEXT.done}</Txt>;
  if (state === 'failed' && message) {
    return (
      <Txt variant="label" accessibilityLiveRegion="polite">
        {message}
      </Txt>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  scanLine: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    borderRadius: radius.md,
    backgroundColor: colors.brandTint,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(23,34,59,0.55)', alignItems: 'center', justifyContent: 'center', padding: space[6] },
  box: { width: '100%', maxWidth: 420, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space[6], gap: space[3] },
  cameraBody: { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center', padding: space[5], gap: space[4], justifyContent: 'space-between' },
  preview: { width: '100%', aspectRatio: 4 / 3, maxHeight: 360, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#0E1526' },
  // Moldura quadrada ao centro (o QR é quadrado): o app não recorta a imagem, ela só guia a distância.
  frameBox: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  frame: { height: '68%', aspectRatio: 1, borderRadius: radius.md, borderWidth: 3, borderColor: colors.accent },
  starting: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  inlineLink: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  sefazRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
});

/** Existe câmera neste aparelho (no navegador, uma câmera conectada)? Sem ela a folha oferece só o PDF e colar. */
export async function cameraIsAvailable(): Promise<boolean> {
  try {
    return await CameraView.isAvailableAsync();
  } catch {
    return false;
  }
}
