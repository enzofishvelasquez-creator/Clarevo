import {
  TELEGRAM_BOT,
  TELEGRAM_DOWNLOAD_TEXT,
  TELEGRAM_TEXT,
  WHATSAPP_NUMBER,
  WHATSAPP_TEXT,
  formatWhatsAppCode,
  newOperationKey,
  roleCanWrite,
  telegramDownloadLink,
  telegramStartLink,
  whatsappChatLink,
  type ChatChannel,
  type ChatCode,
  type ChatLinkState,
  type ChatScreenText,
} from '@clarevo/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, Download, ExternalLink, Info, MessageCircle, RefreshCw, ShieldCheck, Unlink } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Platform, View } from 'react-native';

import { ConfirmDialog } from '@/components/dialog';
import { SubHeader } from '@/components/header';
import { Banner, Button, Card, Chip, Screen, Txt } from '@/components/ui';
import { useSpace } from '@/state/data';
import { useFamily } from '@/state/family';
import { useRepo, useSession } from '@/state/session';
import { colors, fonts, space } from '@/theme/tokens';

/** Navegador da web (iPhone ou Android), para o link de baixar o Telegram; no app, vale o sistema. */
const userAgent = () => (Platform.OS === 'web' && typeof navigator !== 'undefined' ? navigator.userAgent : '');

/**
 * O que muda de um canal para o outro: os textos, onde achar a Clarevo (número ou bot), o link que abre a conversa com o código e, no
 * Telegram, o link de baixar o app para quem ainda não tem (o WhatsApp quase todo mundo já tem).
 */
const CHANNELS: Record<
  ChatChannel,
  { texts: ChatScreenText; target: string | null; link: (target: string, code: string) => string; download?: () => string }
> = {
  whatsapp: { texts: WHATSAPP_TEXT, target: WHATSAPP_NUMBER, link: whatsappChatLink },
  telegram: { texts: TELEGRAM_TEXT, target: TELEGRAM_BOT, link: telegramStartLink, download: () => telegramDownloadLink(Platform.OS, userAgent()) },
};

type Msg = { tone: 'erro' | 'sucesso' | 'info'; text: string } | null;

/**
 * Conta > WhatsApp (D-076) e Conta > Telegram (D-080): ligar a conta da pessoa no canal para anotar gastos e recebimentos por mensagem
 * escrita. O app gera um código (create_<canal>_code) e abre a conversa com o código pronto (no WhatsApp, "Ativar <código>"; no
 * Telegram, o botão Iniciar manda o código); quem liga de verdade é a função do servidor do canal, quando a mensagem chega. Quem escreve
 * nunca passa pelo app nem fica guardado (só o resumo, no banco). Desligar: unlink_<canal>. Na demonstração e enquanto a Clarevo não
 * existe no canal (número ou bot nulo), a tela só explica.
 */
export function ChatLinkScreen({ channel }: { channel: ChatChannel }) {
  const { texts: T, target, link, download } = CHANNELS[channel];
  const { user, auth } = useSession();
  const repo = useRepo();
  const qc = useQueryClient();
  const personal = useSpace().data?.personalContextId;
  const family = useFamily().data;
  const ready = auth.mode !== 'demo' && target !== null;
  const queryKey = ['chat-link', channel, user?.id ?? null];
  const state = useQuery({ queryKey, queryFn: () => repo.getChatLink(channel), enabled: ready && Boolean(user) });

  const spaces = [
    ...(personal ? [{ id: personal, label: 'Pessoal' }] : []),
    ...(family && roleCanWrite(family.role) ? [{ id: family.context.id, label: family.context.name }] : []),
  ];
  const [chosenSpace, setChosenSpace] = useState<string | null>(null);
  const chosen = chosenSpace ?? spaces[0]?.id ?? null;
  const [code, setCode] = useState<ChatCode | null>(null);
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState<'codigo' | 'conferir' | 'desligar' | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  const labelOf = (contextId: string | null) => spaces.find((s) => s.id === contextId)?.label ?? null;
  const setState = (s: ChatLinkState) => qc.setQueryData(queryKey, s);

  const generate = async () => {
    if (!chosen || busy) return;
    setBusy('codigo');
    setMsg(null);
    try {
      setCode(await repo.createChatCode(channel, newOperationKey(), chosen));
    } catch {
      setMsg({ tone: 'erro', text: T.error });
    } finally {
      setBusy(null);
    }
  };

  const openChat = async () => {
    if (!code?.code || !target) return;
    try {
      await Linking.openURL(link(target, code.code));
    } catch {
      setMsg({ tone: 'erro', text: T.openFailed });
    }
  };

  /** "Já mandei a mensagem": relê o estado; ligado, a tela mostra o canal ligado. */
  const check = async () => {
    setBusy('conferir');
    setMsg(null);
    try {
      const s = await repo.getChatLink(channel);
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

  /** "Baixar o Telegram": abre a loja do aparelho (ou a página de apps do Telegram). */
  const openDownload = async () => {
    if (!download) return;
    try {
      await Linking.openURL(download());
    } catch {
      setMsg({ tone: 'erro', text: TELEGRAM_DOWNLOAD_TEXT.failed });
    }
  };

  const unlink = async () => {
    setBusy('desligar');
    try {
      setState(await repo.unlinkChat(channel, newOperationKey()));
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

        {download && !state.data?.linked ? (
          <Card style={{ gap: space[2] }}>
            <Txt variant="title" accessibilityRole="header" aria-level={2}>
              {TELEGRAM_DOWNLOAD_TEXT.title}
            </Txt>
            <Txt color={colors.textSecondary}>{TELEGRAM_DOWNLOAD_TEXT.body}</Txt>
            <Button
              label={TELEGRAM_DOWNLOAD_TEXT.button}
              icon={Download}
              tone="soft"
              accessibilityLabel={TELEGRAM_DOWNLOAD_TEXT.a11y}
              onPress={openDownload}
            />
          </Card>
        ) : null}

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
                    <Chip key={s.id} label={s.label} selected={s.id === chosen} onPress={() => setChosenSpace(s.id)} />
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
                <Txt variant="label">{T.targetLabel(target!)}</Txt>
                <Button label={T.openChat} icon={ExternalLink} onPress={openChat} />
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
