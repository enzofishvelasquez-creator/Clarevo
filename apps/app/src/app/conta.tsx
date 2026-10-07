import { isRepoError } from '@clarevo/core';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, KeyRound, LogOut, MonitorSmartphone } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { ConfirmDialog } from '@/components/dialog';
import { SubHeader } from '@/components/header';
import { Banner, Button, Card, Screen, TextField, Txt } from '@/components/ui';
import { AuthError, RESEND_INTERVAL_SECONDS } from '@/lib/auth';
import { signOutIntent } from '@/lib/nav';
import { useSpace } from '@/state/data';
import { useRepo, useSession } from '@/state/session';
import { colors, fonts, space } from '@/theme/tokens';

type Msg = { tone: 'erro' | 'sucesso' | 'info'; text: string } | null;

function Message({ msg }: { msg: Msg }) {
  if (!msg) return null;
  const color = msg.tone === 'erro' ? colors.error : msg.tone === 'sucesso' ? colors.successText : colors.text;
  return (
    <Banner tone={msg.tone} icon={msg.tone === 'erro' ? AlertCircle : Check}>
      <Txt variant="label" color={color}>
        {msg.text}
      </Txt>
    </Banner>
  );
}

/** Conta: perfil, conta financeira, segurança e situação do acesso ao plano. */
export default function ContaScreen() {
  const { user, auth, signOut } = useSession();
  const repo = useRepo();
  const qc = useQueryClient();
  const personal = useSpace().data;
  const account = personal?.accounts[0];
  const [name, setName] = useState(account?.name ?? '');
  const [nameMsg, setNameMsg] = useState<Msg>(null);
  const [securityMsg, setSecurityMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState<'nome' | 'senha' | 'sessoes' | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [confirmAll, setConfirmAll] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const saveName = async () => {
    if (!account || busy) return;
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 40) {
      setNameMsg({ tone: 'erro', text: 'Dê um nome de 1 a 40 caracteres para a conta.' });
      return;
    }
    setBusy('nome');
    setNameMsg(null);
    try {
      await repo.renameAccount(account.id, trimmed);
      await qc.invalidateQueries({ queryKey: ['space'] });
      setNameMsg({ tone: 'sucesso', text: 'Nome da conta salvo.' });
    } catch (e) {
      setNameMsg({
        tone: 'erro',
        text: isRepoError(e, 'nome_da_conta_invalido') ? 'Dê um nome de 1 a 40 caracteres para a conta.' : 'Não foi possível salvar. Tente novamente.',
      });
    } finally {
      setBusy(null);
    }
  };

  /** Alterar a senha pelo mesmo caminho seguro da recuperação: link no e-mail da conta. */
  const changePassword = async () => {
    if (!user || busy || cooldown > 0) return;
    setBusy('senha');
    setSecurityMsg(null);
    try {
      await auth.requestPasswordReset(user.email);
      setCooldown(RESEND_INTERVAL_SECONDS);
      setSecurityMsg({
        tone: 'info',
        text: auth.mode === 'demo' ? 'Demonstração: nenhum e-mail é enviado.' : `Enviamos um link para ${user.email}. Abra o link para definir a nova senha.`,
      });
    } catch (e) {
      if (e instanceof AuthError && e.code === 'aguarde' && e.retryAfterSeconds) setCooldown(e.retryAfterSeconds);
      else setSecurityMsg({ tone: 'erro', text: 'Não foi possível enviar agora. Tente novamente em instantes.' });
    } finally {
      setBusy(null);
    }
  };

  const signOutEverywhere = async () => {
    setBusy('sessoes');
    signOutIntent.mark();
    try {
      await signOut('global');
    } catch {
      setBusy(null);
      setConfirmAll(false);
      setSecurityMsg({ tone: 'erro', text: 'Não foi possível encerrar as sessões agora. Tente novamente.' });
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title="Conta" />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        <Card style={{ gap: space[1] }}>
          <Txt variant="title">{user?.displayName}</Txt>
          <Txt color={colors.textSecondary}>{user?.email}</Txt>
          {auth.mode === 'demo' ? (
            <Txt variant="caption" color={colors.textSecondary}>
              Demonstração: acesso simulado e dados fictícios, guardados só neste aparelho enquanto o app está aberto.
            </Txt>
          ) : null}
        </Card>

        <Card style={{ gap: space[3] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            Conta financeira
          </Txt>
          <TextField label="Nome da conta" value={name} onChangeText={setName} maxLength={40} />
          <Txt variant="caption" color={colors.textSecondary}>
            Saldo inicial: não informado. Sem ele, o Clarevo não calcula o saldo da conta.
          </Txt>
          <Message msg={nameMsg} />
          <Button label="Salvar nome" tone="soft" busy={busy === 'nome'} busyLabel="Salvando…" onPress={saveName} />
        </Card>

        <Card style={{ gap: space[3] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            Segurança
          </Txt>
          <Txt variant="caption" color={colors.textSecondary}>
            Seus registros ficam protegidos por permissões no servidor: só você vê o contexto Pessoal.
          </Txt>
          <Message msg={securityMsg} />
          <Button
            label={cooldown > 0 ? `Alterar senha (novo envio em ${cooldown} s)` : 'Alterar senha'}
            icon={KeyRound}
            tone="soft"
            disabled={cooldown > 0}
            busy={busy === 'senha'}
            busyLabel="Enviando…"
            onPress={changePassword}
          />
          <Button label="Encerrar sessão em todos os aparelhos" icon={MonitorSmartphone} tone="soft" onPress={() => setConfirmAll(true)} />
        </Card>

        <Card style={{ gap: space[2] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            Acesso ao plano
          </Txt>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space[3] }}>
            <Txt variant="label" color={colors.textSecondary}>
              Situação
            </Txt>
            <Txt variant="label" style={{ fontFamily: fonts.bold }}>
              Plano pessoal
            </Txt>
          </View>
          <Txt variant="caption" color={colors.textSecondary}>
            Quando uma empresa oferecer o Clarevo como benefício, a validade e a cobertura aparecem aqui. A empresa administra seu acesso ao
            plano. Seus registros financeiros têm permissões próprias.
          </Txt>
        </Card>

        <Button
          label="Sair deste aparelho"
          icon={LogOut}
          tone="soft"
          onPress={() => {
            signOutIntent.mark();
            signOut();
          }}
        />
        <Txt variant="caption" color={colors.textSecondary} style={{ textAlign: 'center' }}>
          Sair encerra a sessão neste aparelho. Seus registros continuam guardados.
        </Txt>
      </Screen>

      <ConfirmDialog
        visible={confirmAll}
        title="Encerrar sessão em todos os aparelhos?"
        cancelLabel="Cancelar"
        confirmLabel="Encerrar sessões"
        confirmTone="brand"
        busy={busy === 'sessoes'}
        onCancel={() => setConfirmAll(false)}
        onConfirm={signOutEverywhere}>
        <Txt color={colors.textSecondary}>Você vai precisar entrar de novo em todos os aparelhos, inclusive neste. Seus registros continuam guardados.</Txt>
      </ConfirmDialog>
    </View>
  );
}
