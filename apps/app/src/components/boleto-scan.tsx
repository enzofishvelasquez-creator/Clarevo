import { BOLETO_TEXT, NOTA_CAMERA, NOTA_FLOW_TEXT, NOTA_TEXT, readBoleto, readReceiptCode, type BoletoReading, type IsoDate } from '@clarevo/core';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Barcode, ChevronRight, Flashlight, FlashlightOff } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ChoiceDialog, type DialogChoice } from '@/components/choice-dialog';
import { SubHeader } from '@/components/header';
import { cameraIsAvailable } from '@/components/receipt-scan';
import { Button, TextField, Txt, styles as ui } from '@/components/ui';
import { pickAndReadBoletoPdf } from '@/lib/boleto-read';
import { improveCameraFocus } from '@/lib/camera-focus';
import { OCR_AVAILABLE } from '@/lib/ocr';
import { colors, fonts, radius, space } from '@/theme/tokens';

/**
 * "Ler boleto" em Anotar conta a pagar (D-078 G): a linha do topo, a folha (câmera, PDF, colar), a câmera que lê o código de barras
 * do boleto (Interleaved 2 of 5, o "itf" do navegador) e o campo da linha digitável. Nada é gravado aqui: a leitura (`readBoleto`,
 * `boletoFromText`) só devolve valor, vencimento e o nome de quem recebe, e o formulário preenche os campos.
 */
type Step = null | 'folha' | 'camera' | 'colar';

export function BoletoReader({ today, disabled, onRead }: { today: IsoDate; disabled?: boolean; onRead: (reading: BoletoReading) => void }) {
  const [step, setStep] = useState<Step>(null);
  const [hasCamera, setHasCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [imageReading, setImageReading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    cameraIsAvailable().then((ok) => {
      if (alive) setHasCamera(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  /** O texto colado ou lido pela câmera: boleto vira leitura; chave de nota ganha o aviso próprio. */
  const fromCode = (raw: string): string | null => {
    const reading = readBoleto(raw, today);
    if (reading) {
      setStep(null);
      setMessage(null);
      onRead(reading);
      return null;
    }
    return readReceiptCode(raw).ok ? BOLETO_TEXT.errors.notaFiscal : BOLETO_TEXT.errors.invalid;
  };

  async function readPdf() {
    setStep(null);
    setBusy(true);
    setImageReading(false);
    setMessage(null);
    try {
      const r = await pickAndReadBoletoPdf(today, () => setImageReading(true));
      if (r.ok) onRead(r.reading);
      else if (!r.cancelled) setMessage(r.message);
    } finally {
      setBusy(false);
    }
  }

  const choices: DialogChoice[] = [
    ...(hasCamera ? [{ label: BOLETO_TEXT.camera, tone: 'brand' as const, onPress: () => setStep('camera') }] : []),
    { label: OCR_AVAILABLE ? BOLETO_TEXT.pdfOrImage : BOLETO_TEXT.pdf, tone: hasCamera ? ('soft' as const) : ('brand' as const), onPress: () => void readPdf() },
    { label: BOLETO_TEXT.paste, tone: 'soft' as const, onPress: () => setStep('colar') },
  ];

  return (
    <View style={{ gap: space[2] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={BOLETO_TEXT.lineA11y}
        disabled={disabled || busy}
        onPress={() => {
          setMessage(null);
          setStep('folha');
        }}
        style={(s) => [styles.line, (s as { focused?: boolean }).focused && ui.focusRing, s.pressed && { backgroundColor: colors.brandTintPressed }]}>
        <Barcode size={24} color={colors.brand} strokeWidth={2.25} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="label" color={colors.brand} style={{ fontFamily: fonts.bold }}>
            {BOLETO_TEXT.line}
          </Txt>
          <Txt variant="caption" color={colors.textSecondary}>
            {BOLETO_TEXT.lineHint}
          </Txt>
        </View>
        <ChevronRight size={20} color={colors.brand} aria-hidden />
      </Pressable>
      {busy ? (
        <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'center' }} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.brand} />
          <Txt variant="label" color={colors.textSecondary}>
            {imageReading ? BOLETO_TEXT.workingImage : BOLETO_TEXT.working}
          </Txt>
        </View>
      ) : null}
      {message ? (
        <Txt variant="label" color={colors.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {message}
        </Txt>
      ) : null}

      <ChoiceDialog visible={step === 'folha'} title={BOLETO_TEXT.sheetTitle} choices={choices} onCancel={() => setStep(null)}>
        {hasCamera ? (
          <Txt variant="label" color={colors.textSecondary}>
            {BOLETO_TEXT.cameraIntro}
          </Txt>
        ) : null}
        <Txt variant="caption" color={colors.textSecondary}>
          {BOLETO_TEXT.privacy}
        </Txt>
      </ChoiceDialog>

      <BoletoPaste visible={step === 'colar'} onSubmit={fromCode} onClose={() => setStep(null)} />
      <BoletoCamera
        visible={step === 'camera'}
        onCode={fromCode}
        onPdf={() => void readPdf()}
        onPaste={() => setStep('colar')}
        onClose={() => setStep(null)}
      />
    </View>
  );
}

/** Campo da linha digitável (ou do código de barras), com pontos e espaços. O erro fica junto do campo. */
function BoletoPaste({ visible, onSubmit, onClose }: { visible: boolean; onSubmit: (text: string) => string | null; onClose: () => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (visible) {
      setText('');
      setError(null);
    }
  }, [visible]);
  const submit = () => setError(onSubmit(text));
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.backdrop}>
          <View style={styles.box} accessibilityViewIsModal accessibilityRole="alert">
            <Txt variant="title" accessibilityRole="header">
              {BOLETO_TEXT.pasteTitle}
            </Txt>
            <TextField
              label={BOLETO_TEXT.pasteLabel}
              hint={BOLETO_TEXT.pasteHint}
              value={text}
              onChangeText={(t) => {
                setText(t);
                if (error) setError(null);
              }}
              autoFocus
              keyboardType="number-pad"
              inputMode="numeric"
              autoCorrect={false}
              spellCheck={false}
              returnKeyType="go"
              onSubmitEditing={submit}
              error={error ?? undefined}
            />
            <View style={{ gap: space[2], marginTop: space[1] }}>
              <Button label={BOLETO_TEXT.pasteSubmit} onPress={submit} />
              <Button label="Cancelar" tone="ghost" onPress={onClose} />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * Câmera do boleto: código de barras Interleaved 2 of 5 (44 dígitos). A moldura é larga, como o código. Na web, o mesmo pedido de foco
 * contínuo e resolução maior da câmera da nota (`lib/camera-focus.web.ts`). A permissão só é pedida aqui, depois da frase de uso.
 */
function BoletoCamera({
  visible,
  onCode,
  onPdf,
  onPaste,
  onClose,
}: {
  visible: boolean;
  onCode: (data: string) => string | null;
  onPdf: () => void;
  onPaste: () => void;
  onClose: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [closer, setCloser] = useState(false);
  const [mountError, setMountError] = useState(false);
  const last = useRef({ data: '', at: 0 });
  const done = useRef(false);
  const previewRef = useRef<View>(null);

  useEffect(() => {
    if (!visible) return;
    done.current = false;
    last.current = { data: '', at: 0 };
    setTorch(false);
    setMessage(null);
    setReady(false);
    setCloser(false);
    setMountError(false);
  }, [visible]);

  useEffect(() => {
    if (!visible || !ready) return;
    const timer = setTimeout(() => setCloser(true), NOTA_CAMERA.closerHintMs);
    return () => clearTimeout(timer);
  }, [visible, ready]);

  useEffect(() => {
    if (!visible || !ready || Platform.OS !== 'web') return;
    const timer = setTimeout(() => {
      improveCameraFocus(previewRef.current, torch).catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [visible, ready, torch]);

  const handle = ({ data }: { data: string }) => {
    if (done.current) return;
    const now = Date.now();
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
        <SubHeader title={BOLETO_TEXT.cameraTitle} onBack={onClose} />
        <View style={styles.cameraBody}>
          {permission === null ? (
            <Txt color={colors.textSecondary}>{NOTA_FLOW_TEXT.cameraStarting}</Txt>
          ) : !granted ? (
            <View style={{ gap: space[3] }}>
              <Txt>{canAsk ? BOLETO_TEXT.cameraIntro : BOLETO_TEXT.cameraDenied}</Txt>
              {canAsk ? (
                <Button label={NOTA_TEXT.cameraAllow} onPress={() => requestPermission()} />
              ) : Platform.OS !== 'web' ? (
                <Button label="Abrir ajustes" tone="soft" onPress={() => Linking.openSettings().catch(() => {})} />
              ) : null}
            </View>
          ) : mountError ? (
            <Txt>{BOLETO_TEXT.cameraUnavailable}</Txt>
          ) : (
            <View style={{ gap: space[3] }}>
              <View ref={previewRef} style={styles.preview}>
                <CameraView
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  enableTorch={torch}
                  barcodeScannerSettings={{ barcodeTypes: ['itf14'] }}
                  onBarcodeScanned={handle}
                  onCameraReady={() => setReady(true)}
                  onMountError={() => setMountError(true)}
                />
                <View style={styles.frameBox} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <View style={styles.frame} />
                </View>
                {!ready ? (
                  <View style={styles.frameBox} pointerEvents="none">
                    <ActivityIndicator color={colors.textOnBrand} />
                  </View>
                ) : null}
              </View>
              <Txt>{BOLETO_TEXT.cameraAim}</Txt>
              {message ? (
                <Txt variant="label" color={colors.textSecondary} accessibilityLiveRegion="polite" accessibilityRole="alert">
                  {message}
                </Txt>
              ) : null}
              {closer ? (
                <Txt variant="label" color={colors.textSecondary} accessibilityLiveRegion="polite">
                  {BOLETO_TEXT.cameraCloser}
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
            <Button label={OCR_AVAILABLE ? BOLETO_TEXT.pdfOrImage : BOLETO_TEXT.pdf} tone="soft" onPress={onPdf} />
            <Button label={BOLETO_TEXT.paste} tone="soft" onPress={onPaste} />
            <Button label={NOTA_FLOW_TEXT.back} tone="ghost" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  line: {
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
  frameBox: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  // Moldura larga e baixa, do formato do código de barras do boleto.
  frame: { width: '90%', height: '34%', borderRadius: radius.md, borderWidth: 3, borderColor: colors.accent },
});
