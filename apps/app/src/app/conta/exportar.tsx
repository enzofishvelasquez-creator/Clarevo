import {
  DEFAULT_EXPORT_FORMAT,
  DEFAULT_EXPORT_PERIOD,
  EXPORT_FORMATS,
  EXPORT_PERIODS,
  EXPORT_TEXT,
  buildExportFiles,
  exportAfterAuth,
  loadExportSource,
  type ExportFile,
  type ExportFiles,
  type ExportFormat,
  type ExportPeriod,
} from '@clarevo/core';
import { AlertCircle, Check, Download, FileText, Info, Share2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { ContextPill, SubHeader } from '@/components/header';
import { ChoiceGroup } from '@/components/series-parts';
import { Banner, Button, Card, Chip, Screen, Txt } from '@/components/ui';
import { authenticate, DEVICE_FEATURES } from '@/lib/device';
import { getPrefs, loadPrefs } from '@/lib/device-prefs';
import { EXPORT_LOGO_SVG } from '@/lib/export-logo';
import { deliverExportFile, EXPORT_NATIVE, type DeliverResult } from '@/lib/export-share';
import { useValuesHidden } from '@/lib/privacy';
import { useSpace } from '@/state/data';
import { useRepo, useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

const T = EXPORT_TEXT;

type Msg = { tone: 'erro' | 'sucesso' | 'info'; text: string } | null;

/**
 * Exportar meus dados (D-047, docs/08 §5 item 14): o período e o formato (planilha CSV ou resumo em PDF), o arquivo montado neste
 * aparelho com as leituras de sempre (nada novo vai ao servidor) e entregue pelo compartilhamento do aparelho ou, na web, por
 * download e página de impressão. O app não grava nada: nem o arquivo, nem o período escolhido. Com "Pedir biometria ao abrir"
 * ligado (D-025), a biometria é pedida antes de gerar. O arquivo sempre leva os valores, mesmo com "Ocultar valores" ligado.
 */
export default function ExportarScreen() {
  const { user, auth, today } = useSession();
  const repo = useRepo();
  const contextId = useSpace().data?.personalContextId;
  const hidden = useValuesHidden();
  const userId = user?.id;
  const persist = auth.mode !== 'demo';

  const [period, setPeriod] = useState<ExportPeriod>(DEFAULT_EXPORT_PERIOD);
  const [format, setFormat] = useState<ExportFormat>(DEFAULT_EXPORT_FORMAT);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [ready, setReady] = useState<ExportFiles | null>(null);
  const [delivering, setDelivering] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Preferências do aparelho (biometria) lidas ao abrir a tela.
  useEffect(() => {
    if (userId) loadPrefs(userId, persist);
  }, [userId, persist]);

  // O arquivo pronto vale para o período e o formato escolhidos: mudar um deles tira o arquivo e os avisos.
  const choose = (patch: { period?: ExportPeriod; format?: ExportFormat }) => {
    if (busy) return;
    if (patch.period) setPeriod(patch.period);
    if (patch.format) setFormat(patch.format);
    setReady(null);
    setMsg(null);
    setDone(null);
  };

  const prepare = async () => {
    if (busy || !contextId || !userId) return;
    setBusy(true);
    setMsg(null);
    setReady(null);
    setDone(null);
    try {
      const prefs = getPrefs(userId) ?? (await loadPrefs(userId, persist));
      if (prefs.biometricLock && DEVICE_FEATURES) {
        const gate = exportAfterAuth(await authenticate(T.biometricPrompt));
        if (gate !== 'seguir') {
          setMsg({ tone: gate === 'cancelado' ? 'info' : 'erro', text: gate === 'cancelado' ? T.biometricCancelled : T.biometricFailed });
          return;
        }
      }
      const load = await loadExportSource(repo, contextId, period, today, { withInvoices: format === 'pdf' });
      if (!load.ok) {
        setMsg({ tone: 'erro', text: T.tooMany });
        return;
      }
      const built = buildExportFiles(load.source, format, { logoSvg: EXPORT_LOGO_SVG });
      if (built.empty) setMsg({ tone: 'info', text: `${T.emptyTitle}. ${T.emptyBody}` });
      else setReady(built);
    } catch {
      setMsg({ tone: 'erro', text: T.loadFailed });
    } finally {
      setBusy(false);
    }
  };

  const deliver = (file: ExportFile) => {
    if (delivering) return;
    setDelivering(file.id);
    setMsg(null);
    setDone(null);
    // Sem espera antes da entrega: na web, a janela de impressão precisa abrir direto do toque.
    deliverExportFile(file, T.title).then((r) => {
      setDelivering(null);
      if (r === 'ok') {
        setDone(file.id);
        setMsg({ tone: 'sucesso', text: file.kind === 'pdf' && !EXPORT_NATIVE ? T.pdfOpened : EXPORT_NATIVE ? T.fileDone.native : T.fileDone.web });
      } else setMsg({ tone: 'erro', text: failureText(r) });
    });
  };

  const hint = EXPORT_NATIVE ? T.readyHint.native : T.readyHint.web;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={T.title} right={<ContextPill label="Pessoal" />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        <Txt color={colors.textSecondary}>{T.intro}</Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {T.portability}
        </Txt>

        <Card style={{ gap: space[4] }}>
          <ChoiceGroup label={T.periodLabel}>
            {EXPORT_PERIODS.map((p) => (
              <Chip key={p} label={T.periods[p]} selected={period === p} onPress={() => choose({ period: p })} />
            ))}
          </ChoiceGroup>
          <ChoiceGroup label={T.formatLabel} hint={T.formatHints[format]}>
            {EXPORT_FORMATS.map((f) => (
              <Chip key={f} label={T.formats[f]} selected={format === f} onPress={() => choose({ format: f })} />
            ))}
          </ChoiceGroup>
        </Card>

        <Card style={{ gap: space[2] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {T.contentTitle}
          </Txt>
          <Txt color={colors.textSecondary}>{format === 'csv' ? T.contentCsv : T.contentPdf}</Txt>
          <Txt variant="caption" color={colors.textSecondary}>
            {T.notIncluded}
          </Txt>
          {hidden ? (
            <Banner tone="info" icon={Info} live={false}>
              <Txt variant="label">{T.valuesNote}</Txt>
            </Banner>
          ) : (
            <Txt variant="caption" color={colors.textSecondary}>
              {T.valuesNote}
            </Txt>
          )}
          <Txt variant="caption" color={colors.textSecondary}>
            {T.sensitiveNote}
          </Txt>
        </Card>

        <Button label={T.prepare} icon={FileText} busy={busy} busyLabel={T.preparing} disabled={!contextId} onPress={prepare} />

        {msg ? (
          <Banner tone={msg.tone} icon={msg.tone === 'erro' ? AlertCircle : msg.tone === 'sucesso' ? Check : Info}>
            <Txt variant="label" color={msg.tone === 'erro' ? colors.error : msg.tone === 'sucesso' ? colors.successText : colors.text}>
              {msg.text}
            </Txt>
          </Banner>
        ) : null}

        {ready ? (
          <Card style={{ gap: space[3] }}>
            <Txt variant="title" accessibilityRole="header" aria-level={2}>
              {T.readyTitle}
            </Txt>
            <View style={{ gap: space[1] }} accessibilityLiveRegion="polite">
              <Txt variant="label">{T.readyCounts(ready.recordCount, ready.purchaseCount)}</Txt>
              <Txt variant="caption" color={colors.textSecondary}>
                {T.readyPeriod(ready.periodLabel)}
              </Txt>
            </View>
            <Txt variant="caption" color={colors.textSecondary}>
              {hint}
            </Txt>
            {ready.files.map((file) => (
              <Button
                key={file.id}
                label={T.fileButton(file.id, EXPORT_NATIVE)}
                icon={done === file.id ? Check : EXPORT_NATIVE ? Share2 : Download}
                tone="soft"
                busy={delivering === file.id}
                busyLabel={T.preparing}
                disabled={delivering !== null}
                onPress={() => deliver(file)}
              />
            ))}
          </Card>
        ) : null}
      </Screen>
    </View>
  );
}

function failureText(r: Exclude<DeliverResult, 'ok'>): string {
  return r === 'bloqueado' ? T.popupBlocked : r === 'indisponivel' ? T.shareUnavailable : T.shareFailed;
}
