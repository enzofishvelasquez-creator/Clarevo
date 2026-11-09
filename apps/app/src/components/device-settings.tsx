import {
  REMINDER_HOURS,
  REMINDER_TEXT,
  ROUTINE_REMINDER_HOURS,
  ROUTINE_REMINDER_KINDS,
  ROUTINE_REMINDER_TEXT,
  WIDGET_TEXT,
  anyRoutineReminder,
  reminderHourA11y,
  reminderHourLabel,
} from '@clarevo/core';
import { BellOff, Settings } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { AppState, View } from 'react-native';

import { ChoiceGroup } from '@/components/series-parts';
import { SettingSwitch } from '@/components/setting-switch';
import { Banner, Button, Card, Chip, Txt } from '@/components/ui';
import { authenticate, biometricsAvailable, DEVICE_FEATURES, openDeviceSettings, type NotificationPermission } from '@/lib/device';
import { loadPrefs, updatePrefs, useDevicePrefs } from '@/lib/device-prefs';
import { PRIVACY_TEXT, setValuesHidden } from '@/lib/privacy';
import { disableReminders, enableReminders, getNotificationPermission, type ReminderSwitch } from '@/lib/reminders';
import { useSession } from '@/state/session';
import { colors, fonts, space } from '@/theme/tokens';

function useDeviceSettings() {
  const { user, auth } = useSession();
  const userId = user?.id;
  const persist = auth.mode !== 'demo';
  const prefs = useDevicePrefs(userId);
  useEffect(() => {
    if (userId) loadPrefs(userId, persist);
  }, [userId, persist]);
  return { userId, persist, prefs, demo: auth.mode === 'demo' };
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Txt variant="title" accessibilityRole="header" aria-level={2}>
      {children}
    </Txt>
  );
}

/**
 * Conta › Lembretes: os lembretes de contas a pagar (D-025: interruptor e horário do aviso) e os do dia a dia (D-087: um interruptor
 * por aviso e o horário deles), com o caminho para as configurações quando o aparelho bloqueia os avisos. A permissão do sistema só
 * é pedida depois do toque. Na web, só o texto "Lembretes estão disponíveis no app para celular."
 */
export function RemindersCard() {
  const { userId, persist, prefs, demo } = useDeviceSettings();
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [busy, setBusy] = useState(false);

  // Conferida ao abrir Conta e ao voltar das configurações do aparelho.
  useEffect(() => {
    if (!DEVICE_FEATURES) return;
    let alive = true;
    const check = () =>
      getNotificationPermission().then((p) => {
        if (alive) setPermission(p);
      });
    check();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  const toggle = async (which: ReminderSwitch, next: boolean) => {
    if (!userId || busy) return;
    if (!next) {
      disableReminders(userId, persist, which);
      return;
    }
    setBusy(true);
    try {
      setPermission(await enableReminders(userId, persist, which));
    } finally {
      setBusy(false);
    }
  };

  const routineOn = prefs ? anyRoutineReminder(prefs.routineReminders) : false;
  const body = !DEVICE_FEATURES ? (
    <Txt color={colors.textSecondary}>{REMINDER_TEXT.web}</Txt>
  ) : demo ? (
    <Txt color={colors.textSecondary}>{REMINDER_TEXT.demo}</Txt>
  ) : !prefs || !permission || !userId ? null : (
    <>
      <SettingSwitch label={REMINDER_TEXT.toggle} caption={REMINDER_TEXT.caption} value={prefs.reminders} disabled={busy} onChange={(v) => toggle('contas', v)} />
      {prefs.reminders ? (
        <ChoiceGroup label={REMINDER_TEXT.hourLabel}>
          {REMINDER_HOURS.map((h) => (
            <Chip
              key={h}
              label={reminderHourLabel(h)}
              accessibilityLabel={reminderHourA11y(h)}
              selected={prefs.reminderHour === h}
              onPress={() => updatePrefs(userId, { reminderHour: h }, persist)}
            />
          ))}
        </ChoiceGroup>
      ) : null}
      <View style={{ gap: space[1] }}>
        <Txt variant="label" accessibilityRole="header" aria-level={3}>
          {ROUTINE_REMINDER_TEXT.section}
        </Txt>
        <Txt color={colors.textSecondary}>{ROUTINE_REMINDER_TEXT.intro}</Txt>
      </View>
      {ROUTINE_REMINDER_KINDS.map((k) => (
        <SettingSwitch
          key={k}
          label={ROUTINE_REMINDER_TEXT.kinds[k].toggle}
          caption={ROUTINE_REMINDER_TEXT.kinds[k].caption}
          value={prefs.routineReminders[k]}
          disabled={busy}
          onChange={(v) => toggle(k, v)}
        />
      ))}
      {routineOn ? (
        <ChoiceGroup label={ROUTINE_REMINDER_TEXT.hourLabel}>
          {ROUTINE_REMINDER_HOURS.map((h) => (
            <Chip
              key={h}
              label={reminderHourLabel(h)}
              accessibilityLabel={reminderHourA11y(h)}
              selected={prefs.routineReminderHour === h}
              onPress={() => updatePrefs(userId, { routineReminderHour: h }, persist)}
            />
          ))}
        </ChoiceGroup>
      ) : null}
      {(prefs.reminders || routineOn) && !permission.granted ? (
        <View style={{ gap: space[2] }}>
          <Banner tone="info" icon={BellOff}>
            <Txt variant="label">{REMINDER_TEXT.denied}</Txt>
          </Banner>
          <Button label={REMINDER_TEXT.openSettings} icon={Settings} tone="soft" onPress={openDeviceSettings} />
        </View>
      ) : null}
    </>
  );

  return (
    <Card style={{ gap: space[3] }}>
      <SectionTitle>{REMINDER_TEXT.section}</SectionTitle>
      {body}
    </Card>
  );
}

/**
 * Conta › Privacidade neste aparelho: "Ocultar valores ao abrir" (também na web) e "Pedir biometria ao abrir" (só no
 * aparelho com biometria cadastrada; desligado por padrão). Ligar a biometria pede uma confirmação antes.
 */
export function PrivacyCard() {
  const { userId, persist, prefs } = useDeviceSettings();
  const [biometrics, setBiometrics] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!DEVICE_FEATURES) return;
    let alive = true;
    biometricsAvailable().then((ok) => {
      if (alive) setBiometrics(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!prefs || !userId) return null;

  const toggleLock = async (next: boolean) => {
    if (busy) return;
    setMsg(null);
    if (!next) {
      updatePrefs(userId, { biometricLock: false }, persist);
      return;
    }
    setBusy(true);
    try {
      const r = await authenticate(PRIVACY_TEXT.lockConfirmPrompt);
      if (r === 'ok') updatePrefs(userId, { biometricLock: true }, persist);
      else if (r !== 'cancelado') setMsg(PRIVACY_TEXT.lockConfirmFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: space[3] }}>
      <SectionTitle>{PRIVACY_TEXT.section}</SectionTitle>
      <SettingSwitch
        label={PRIVACY_TEXT.hideToggle}
        caption={PRIVACY_TEXT.hideCaption}
        value={prefs.hideOnOpen}
        onChange={(v) => {
          updatePrefs(userId, { hideOnOpen: v }, persist);
          setValuesHidden(v);
        }}
      />
      {DEVICE_FEATURES && (biometrics || prefs.biometricLock) ? (
        <SettingSwitch label={PRIVACY_TEXT.lockToggle} caption={PRIVACY_TEXT.lockCaption} value={prefs.biometricLock} disabled={busy} onChange={toggleLock} />
      ) : null}
      {msg ? (
        <Banner tone="info">
          <Txt variant="label">{msg}</Txt>
        </Banner>
      ) : null}
    </Card>
  );
}

/**
 * Conta › "Widget na tela inicial" (D-052): o widget nativo só existe com o app nas lojas ("Disponível quando o app estiver nas
 * lojas"), mas a escolha de mostrar ou não os valores nele já fica guardada, só neste aparelho. Desligada de início: o widget mostra
 * R$ •••• no lugar dos valores. Não depende de "Ocultar valores ao abrir" e não muda nada no app.
 */
export function WidgetCard() {
  const { userId, persist, prefs } = useDeviceSettings();
  if (!prefs || !userId) return null;
  return (
    <Card style={{ gap: space[3] }}>
      <SectionTitle>{WIDGET_TEXT.section}</SectionTitle>
      <Txt style={{ fontFamily: fonts.bold }}>{WIDGET_TEXT.availability}</Txt>
      <Txt color={colors.textSecondary}>{WIDGET_TEXT.explain}</Txt>
      <SettingSwitch
        label={WIDGET_TEXT.showValues}
        caption={WIDGET_TEXT.showValuesCaption}
        value={prefs.widgetShowValues}
        onChange={(v) => updatePrefs(userId, { widgetShowValues: v }, persist)}
      />
    </Card>
  );
}
