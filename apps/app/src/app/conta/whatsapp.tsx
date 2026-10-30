import {
  WHATSAPP_NUMBER,
  WHATSAPP_TEXT,
  formatWhatsAppCode,
  newOperationKey,
  roleCanWrite,
  whatsappChatLink,
  type WhatsAppCode,
  type WhatsAppLinkState,
} from '@clarevo/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, ExternalLink, Info, MessageCircle, RefreshCw, ShieldCheck, Unlink } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, View } from 'react-native';

import { ConfirmDialog } from '@/components/dialog';
import { SubHeader } from '@/components/header';
import { Banner, Button, Card, Chip, Screen, Txt } from '@/components/ui';
import { useSpace } from '@/state/data';
import { useFamily } from '@/state/family';
import { useRepo, useSession } from '@/state/session';
import { colors, fonts, space } from '@/theme/tokens';

const T = WHATSAPP_TEXT;

type Msg = { tone: 'erro' | 'sucesso' | 'info'; text: string } | null;

/**
 * Conta > WhatsApp (D-076): ligar o número da pessoa à Clarevo para anotar gastos e recebimentos por mensagem escrita. O app gera um
 * código (create_whatsapp_code) e abre a conversa com "Ativar <código>" pronto; quem liga de verdade é a função do servidor, quando a
 * mensagem chega da Meta. O número da pessoa nunca passa pelo app nem fica guardado (só o resumo, no banco). Desligar: unlink_whatsapp.
 * Na demonstração e enquanto o número da Clarevo não existe (WHATSAPP_NUMBER nulo), a tela só explica.
 */
export default function WhatsAppScreen() {
  const { user, auth } = useSession();
  const repo = useRepo();
  const qc = useQueryClient();
  const personal = useSpace().data?.personalContextId;
  const family = useFamily().data;
  const ready = auth.mode !== 'demo' && WHATSAPP_NUMBER !== null;
  const state = useQuery({ queryKey: ['whatsapp', user?.id ?? null], queryFn: () => repo.getWhatsApp(), enabled: ready && Boolean(user) });

  const spaces = [
    ...(personal ? [{ id: personal, label: 'Pessoal' }] : []),
    ...(family && roleCanWrite(family.role) ? [{ id: family.context.id, label: family.context.name }] : []),
  ];
  const [target, setTarget] = useState<string | null>(null);
  const chosen = target ?? spaces[0]?.id ?? null;
  const [code, setCode] = useState<WhatsAppCode | null>(null);
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState<'codigo' | 'conferir' | 'desligar' | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  const labelOf = (contextId: string | null) => spaces.find((s) => s.id === contextId)?.label ?? null;
  const setState = (s: WhatsAppLinkState) => qc.setQueryData(['whatsapp', user?.id ?? null], s);

  const generate = async () => {
    if (!chosen || busy) return;
    setBusy('codigo');
    setMsg(null);
    try {
      setCode(await repo.createWhatsAppCode(newOperationKey(), chosen));
    } catch {
      setMsg({ tone: 'erro', text: T.error });
    } finally {
      setBusy(null);
    }
  };

  const openChat = async () => {
    if (!code?.code || !WHATSAPP_NUMBER) return;
    try {
      await Linking.openURL(whatsappChatLink(WHATSAPP_NUMBER, code.code));
    } catch {
      setMsg({ tone: 'erro', text: T.openFailed });
    }
  };

  /** "Já mandei a mensagem": relê o estado; ligado, a tela mostra o número ligado. */
  const check = async () => {
    setBusy('conferir');
    setMsg(null);
    try {
      const s = await repo.getWhatsApp();
      setState(s);
      // Ligado com o código desta tela: o código foi usado (some do estado) e o espaço é o dele.
      if (s.linked && s.codeExpiresAt === null && (!code || s.contextId === code.contextId)) {
        setCode(null);
        setChanging(false);
        setMsg({ tone: 'sucesso', text: T.linkedNow });
      } else setMsg({ tone: 'info', text: T.notYet });
    } catch {
      setMsg({ tone: 'erro', text: T.error });
    } finally {
      setBusy(null);
    }
  };

  const unlink = async () => {
    setBusy('desligar');
    try {
      setState(await repo.unlinkWhatsApp(newOperationKey()));
      setCode(null);
      setChanging(false);
      setMsg({ tone: 'sucesso', text: T.unlinked });
    } catch {
      setMsg({ tone: 'erro', text: T.error });
    } finally {
      setBusy(null);
      setConfirmUnlink(false);
    }
  };

  const linked = state.data?.linked ? state.data : null;
  const showGenerator = ready && state.isSuccess && (!linked || changing);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={T.title} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        {msg ? (
          <Banner tone={msg.tone} icon={msg.tone === 'erro' ? AlertCircle : msg.tone === 'sucesso' ? Check : Info}>
            <Txt variant="label" color={msg.tone === 'erro' ? colors.error : msg.tone === 'sucesso' ? colors.successText : colors.text}>
              {msg.text}
            </Txt>
          </Banner>
        ) : null}

        <Card style={{ gap: space[2] }}>
          <Txt>{T.intro}</Txt>
          <Txt variant="caption" color={colors.textSecondary}>
            {T.textOnly}
          </Txt>
          {!ready ? (
            <Txt variant="label" color={colors.textSecondary}>
              {auth.mode === 'demo' ? T.demo : T.notReady}
            </Txt>
          ) : null}
        </Card>

        {ready && state.isError ? (
          <Banner tone="erro" icon={AlertCircle}>
            <Txt variant="label" color={colors.error}>
              {T.error}
            </Txt>
          </Banner>
        ) : null}

        {linked && !changing ? (
          <Card style={{ gap: space[3] }}>
            <Txt variant="title" accessibilityRole="header" aria-level={2}>
              {T.linkedTitle}
            </Txt>
            <Txt color={colors.textSecondary}>{labelOf(linked.contextId) ? T.linkedBody(labelOf(linked.contextId)!) : T.linkedGone}</Txt>
            <Button label={T.changeSpace} icon={RefreshCw} tone="soft" onPress={() => setChanging(true)} />
            <Button label={T.unlink} icon={Unlink} tone="soft" onPress={() => setConfirmUnlink(true)} />
          </Card>
        ) : null}

        {showGenerator ? (
          <Card style={{ gap: space[3] }}>
            {spaces.length > 1 ? (
              <View style={{ gap: space[2] }} accessibilityRole="radiogroup" accessibilityLabel={T.spaceLabel}>
                <Txt variant="label">{T.spaceLabel}</Txt>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
                  {spaces.map((s) => (
                    <Chip key={s.id} label={s.label} selected={s.id === chosen} onPress={() => setTarget(s.id)} />
                  ))}
                </View>
              </View>
            ) : null}
            <Button label={T.generate} icon={MessageCircle} busy={busy === 'codigo'} busyLabel={T.generating} disabled={!chosen} onPress={generate} />
          </Card>
        ) : null}

        {showGenerator && code ? (
          <Card style={{ gap: space[3] }}>
            <Txt variant="title" accessibilityRole="header" aria-level={2}>
              {T.codeTitle}
            </Txt>
            {code.code ? (
              <>
                <Txt variant="hero" selectable style={{ fontFamily: fonts.extrabold, letterSpacing: 2 }} accessibilityLabel={code.code.split('').join(' ')}>
                  {formatWhatsAppCode(code.code)}
                </Txt>
                <Txt color={colors.textSecondary}>{T.codeHelp}</Txt>
                <Txt variant="label">{T.numberLabel(WHATSAPP_NUMBER!)}</Txt>
                <Button label={T.openWhatsApp} icon={ExternalLink} onPress={openChat} />
                <Button label={T.checkLinked} icon={Check} tone="soft" busy={busy === 'conferir'} onPress={check} />
              </>
            ) : (
              <Txt color={colors.textSecondary}>{T.codeLost}</Txt>
            )}
          </Card>
        ) : null}

        <Card style={{ gap: space[2] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {T.examplesTitle}
          </Txt>
          {T.examples.map((e) => (
            <Txt key={e} variant="label" color={colors.textSecondary}>
              {e}
            </Txt>
          ))}
        </Card>

        <Card style={{ gap: space[2] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <ShieldCheck size={18} color={colors.textSecondary} />
            <Txt variant="title" accessibilityRole="header" aria-level={2}>
              {T.privacyTitle}
            </Txt>
          </View>
          <Txt variant="caption" color={colors.textSecondary}>
            {T.privacy}
          </Txt>
        </Card>
      </Screen>

      <ConfirmDialog
        visible={confirmUnlink}
        title={T.unlinkTitle}
        cancelLabel="Cancelar"
        confirmLabel={T.unlinkConfirm}
        confirmTone="brand"
        busy={busy === 'desligar'}
        onCancel={() => setConfirmUnlink(false)}
        onConfirm={unlink}>
        <Txt color={colors.textSecondary}>{T.unlinkBody}</Txt>
      </ConfirmDialog>
    </View>
  );
}
