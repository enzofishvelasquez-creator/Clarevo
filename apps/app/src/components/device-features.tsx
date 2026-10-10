import { REMINDER_ROUTE, REMINDER_TEXT, offerCaption, type PersonalSpace, type SeriesWrite } from '@clarevo/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, usePathname, type Href } from 'expo-router';
import { LockKeyhole } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { AppState, Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/dialog';
import { Banner, Button, Txt } from '@/components/ui';
import { authenticate, DEVICE_FEATURES, listenToReminders, openDeviceSettings } from '@/lib/device';
import { loadPrefs, updatePrefs, useDevicePrefs } from '@/lib/device-prefs';
import { signOutIntent } from '@/lib/nav';
import { PRIVACY_TEXT, setValuesHidden } from '@/lib/privacy';
import { enableReminders, queueReminders } from '@/lib/reminders';
import { useView } from '@/state/data';
import { useSession } from '@/state/session';
import { useSpaceStatus } from '@/state/space-status';
import { colors, radius, space } from '@/theme/tokens';

/** Espera depois de uma escrita ou da volta ao app antes de reagendar (várias escritas seguidas viram uma leitura). */
const RESCHEDULE_DELAY_MS = 800;
/** Fora do app por pelo menos 1 minuto: ao voltar, pede a biometria de novo (se ligada). */
const LOCK_AFTER_MS = 60_000;

/**
 * Recursos do Ciclo A2 montados no layout (fora de state/data.ts):
 * - "Ocultar valores ao abrir": aplica a preferência da pessoa ao abrir o app ou entrar (também na web);
 * - lembretes (só no aparelho): reagenda ao abrir, ao voltar para o app e depois de escritas, e o toque no aviso abre
 *   Contas a pagar;
 * - oferta de lembretes depois do primeiro gasto fixo salvo no Pessoal (só no aparelho);
 * - biometria ao abrir (só no aparelho), que nunca impede de sair da conta.
 */
export function DeviceFeatures() {
  const { user, auth } = useSession();
  const userId = user?.id;
  const persist = auth.mode !== 'demo';

  // Valores ocultos começam pela preferência da pessoa; sem sessão, nada fica oculto.
  useEffect(() => {
    if (!userId) {
      setValuesHidden(false);
      return;
    }
    let alive = true;
    loadPrefs(userId, persist).then((p) => {
      if (alive) setValuesHidden(p.hideOnOpen);
    });
    return () => {
      alive = false;
    };
  }, [userId, persist]);

  return DEVICE_FEATURES ? <NativeFeatures /> : null;
}

function NativeFeatures() {
  const { ready, user, auth, repo } = useSession();
  const { status } = useSpaceStatus();
  const { setSpace, setMonth, currentMonth } = useView();
  const pathname = usePathname();
  const qc = useQueryClient();
  const userId = user?.id;
  const demo = auth.mode === 'demo';
  const persist = !demo;
  const prefs = useDevicePrefs(userId);
  // Mesma consulta do layout (sem buscar de novo): o contexto Pessoal de quem usa o aparelho.
  const space = useQuery<PersonalSpace | null>({
    queryKey: ['space', userId],
    queryFn: () => repo!.getSpace(),
    enabled: false,
  });
  const contextId = space.data?.personalContextId;

  // ---- Lembretes: reagendamento -------------------------------------------------------------
  const run = () => {
    if (!ready) return;
    if (!userId || !repo) {
      // Sem sessão neste aparelho: nenhum aviso de conta fica agendado.
      queueReminders({ enabled: false });
      return;
    }
    if (!prefs || status !== 'pronto' || !contextId) return;
    if (demo || !prefs.reminders) queueReminders({ enabled: false });
    else queueReminders({ enabled: true, repo, contextId, hour: prefs.reminderHour });
  };
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });

  // Ao abrir, ao entrar e ao mudar a preferência ou o horário.
  useEffect(() => {
    runRef.current();
  }, [ready, userId, contextId, status, prefs?.reminders, prefs?.reminderHour, demo]);

  // Ao voltar para o app, depois de qualquer escrita concluída e da geração do dia dos gastos fixos.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        runRef.current();
      }, RESCHEDULE_DELAY_MS);
    };
    const appState = AppState.addEventListener('change', (s) => s === 'active' && schedule());
    const mutations = qc.getMutationCache().subscribe((e) => {
      if (e.type === 'updated' && e.action.type === 'success') schedule();
    });
    const queries = qc.getQueryCache().subscribe((e) => {
      if (e.type === 'updated' && e.action.type === 'success' && e.query.queryKey[0] === 'seriesSync') schedule();
    });
    return () => {
      appState.remove();
      mutations();
      queries();
      if (timer) clearTimeout(timer);
    };
  }, [qc]);

  // ---- Toque no aviso: Contas a pagar (Pessoal, mês atual) ------------------------------------
  const [pendingOpen, setPendingOpen] = useState(false);
  useEffect(() => listenToReminders(() => setPendingOpen(true)), []);
  useEffect(() => {
    if (!pendingOpen || status !== 'pronto' || pathname === '/carregando') return;
    setPendingOpen(false);
    setSpace('pessoal');
    setMonth(currentMonth);
    if (pathname !== REMINDER_ROUTE) router.push(REMINDER_ROUTE as Href);
  }, [pendingOpen, status, pathname, setSpace, setMonth, currentMonth]);

  // ---- Oferta depois do primeiro gasto fixo salvo -------------------------------------------
  const [offer, setOffer] = useState<'pergunta' | 'negada' | null>(null);
  const [offerBusy, setOfferBusy] = useState(false);
  const offerCheck = (w: SeriesWrite, vars: unknown) => {
    const ctx = (vars as { contextId?: unknown } | undefined)?.contextId;
    if (demo || !userId || !prefs || prefs.reminders || prefs.reminderOffered) return;
    if (typeof ctx !== 'string' || ctx !== contextId || w.series.contextId !== contextId) return;
    updatePrefs(userId, { reminderOffered: true }, persist);
    // Depois da navegação para a tela da série e do aviso de "salvo".
    setTimeout(() => setOffer('pergunta'), 700);
  };
  const offerRef = useRef(offerCheck);
  useEffect(() => {
    offerRef.current = offerCheck;
  });
  useEffect(
    () =>
      qc.getMutationCache().subscribe((e) => {
        if (e.type !== 'updated' || e.action.type !== 'success') return;
        const data = e.action.data as Partial<SeriesWrite> | undefined;
        const vars = e.mutation.state.variables as { contextId?: unknown; input?: unknown } | undefined;
        // Criação de gasto fixo (create_series): resultado com série e contas, variáveis com contexto e cadastro.
        if (data?.series && Array.isArray(data.occurrences) && vars && 'contextId' in vars && 'input' in vars) offerRef.current(data as SeriesWrite, vars);
      }),
    [qc],
  );

  const acceptOffer = async () => {
    if (!userId || offerBusy) return;
    setOfferBusy(true);
    const permission = await enableReminders(userId, persist);
    setOfferBusy(false);
    setOffer(permission.granted ? null : 'negada');
  };

  // ---- Biometria ao abrir ---------------------------------------------------------------------
  const [locked, setLocked] = useState(false);
  const [unlockMsg, setUnlockMsg] = useState<string | null>(null);
  const authenticating = useRef(false);
  /** Pessoa com sessão quando o app abriu (undefined: sessão ainda sendo conferida). Quem entra depois não é bloqueado. */
  const startUser = useRef<string | null | undefined>(undefined);
  const startChecked = useRef(false);
  useEffect(() => {
    if (ready && startUser.current === undefined) startUser.current = userId ?? null;
  }, [ready, userId]);
  useEffect(() => {
    if (startChecked.current || !ready || startUser.current === undefined) return;
    if (!userId || startUser.current !== userId) {
      startChecked.current = true;
      return;
    }
    if (!prefs) return;
    startChecked.current = true;
    if (prefs.biometricLock) setLocked(true);
  }, [ready, userId, prefs]);

  const lockState = useRef({ enabled: false, userId: undefined as string | undefined });
  useEffect(() => {
    lockState.current = { enabled: Boolean(prefs?.biometricLock), userId };
  });
  useEffect(() => {
    let awaySince: number | null = null;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') {
        if (!authenticating.current) awaySince = Date.now();
      } else if (s === 'active') {
        const away = awaySince === null ? 0 : Date.now() - awaySince;
        awaySince = null;
        if (away >= LOCK_AFTER_MS && lockState.current.enabled && lockState.current.userId && !authenticating.current) setLocked(true);
      }
    });
    return () => sub.remove();
  }, []);
  // Sem sessão (saiu da conta ou a sessão expirou), nada fica bloqueado.
  useEffect(() => {
    if (!userId) setLocked(false);
  }, [userId]);

  const unlock = async () => {
    if (authenticating.current) return;
    authenticating.current = true;
    setUnlockMsg(null);
    const r = await authenticate(PRIVACY_TEXT.lockTitle);
    authenticating.current = false;
    // Sem biometria nem senha cadastradas, não há o que conferir.
    if (r === 'ok' || r === 'indisponivel') setLocked(false);
    else if (r === 'falhou') setUnlockMsg(PRIVACY_TEXT.unlockFailed);
  };
  const unlockRef = useRef(unlock);
  useEffect(() => {
    unlockRef.current = unlock;
  });
  // Pede a biometria uma vez ao bloquear; depois, pelo botão "Desbloquear".
  useEffect(() => {
    if (locked) unlockRef.current();
  }, [locked]);

  return (
    <>
      <ConfirmDialog
        visible={offer !== null && !locked}
        title={REMINDER_TEXT.offerTitle}
        cancelLabel={REMINDER_TEXT.offerDecline}
        confirmLabel={offer === 'negada' ? REMINDER_TEXT.openSettings : REMINDER_TEXT.offerAccept}
        confirmTone="brand"
        busy={offerBusy}
        onCancel={() => setOffer(null)}
        onConfirm={() => {
          if (offer === 'negada') {
            setOffer(null);
            openDeviceSettings();
          } else acceptOffer();
        }}>
        <Txt color={colors.textSecondary}>{offer === 'negada' ? REMINDER_TEXT.denied : offerCaption(prefs?.reminderHour)}</Txt>
      </ConfirmDialog>
      {locked && userId ? <LockScreen message={unlockMsg} onUnlock={unlock} /> : null}
    </>
  );
}

/** Tela de desbloqueio: cobre o app inteiro; "Sair da conta" funciona sem a biometria. */
function LockScreen({ message, onUnlock }: { message: string | null; onUnlock: () => void }) {
  const { signOut } = useSession();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible animationType="none" onRequestClose={() => {}} statusBarTranslucent>
      <View style={[styles.lock, { paddingTop: insets.top + space[10], paddingBottom: insets.bottom + space[6] }]} accessibilityViewIsModal>
        <View style={styles.box}>
          <View style={styles.icon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <LockKeyhole size={32} color={colors.brand} />
          </View>
          <Txt variant="title" accessibilityRole="header" style={{ textAlign: 'center', fontSize: 22, lineHeight: 30 }}>
            {PRIVACY_TEXT.lockTitle}
          </Txt>
          <Txt color={colors.textSecondary} style={{ textAlign: 'center' }}>
            {PRIVACY_TEXT.lockBody}
          </Txt>
          {message ? (
            <Banner tone="info">
              <Txt variant="label">{message}</Txt>
            </Banner>
          ) : null}
          <Button label={PRIVACY_TEXT.unlock} icon={LockKeyhole} onPress={onUnlock} />
          <Button
            label={PRIVACY_TEXT.signOut}
            tone="soft"
            onPress={() => {
              signOutIntent.mark();
              signOut();
            }}
          />
          <Txt variant="caption" color={colors.textSecondary} style={{ textAlign: 'center' }}>
            {PRIVACY_TEXT.signOutCaption}
          </Txt>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  lock: { flex: 1, backgroundColor: colors.background, paddingHorizontal: space[6], alignItems: 'center' },
  box: { width: '100%', maxWidth: 420, gap: space[4] },
  icon: { alignSelf: 'center', width: 64, height: 64, borderRadius: radius.pill, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
});
