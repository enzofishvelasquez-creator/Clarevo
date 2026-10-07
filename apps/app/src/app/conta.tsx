import { isRepoError } from '@clarevo/core';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, LogOut } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { Banner, Button, Card, DemoBadge, Screen, TextField, Txt } from '@/components/ui';
import { signOutIntent } from '@/lib/nav';
import { useSpace } from '@/state/data';
import { useRepo, useSession } from '@/state/session';
import { colors, fonts, space } from '@/theme/tokens';

/** Conta: perfil, conta financeira e situação do acesso ao plano. */
export default function ContaScreen() {
  const { user, auth, signOut } = useSession();
  const repo = useRepo();
  const qc = useQueryClient();
  const personal = useSpace().data;
  const account = personal?.accounts[0];
  const [name, setName] = useState(account?.name ?? '');
  const [msg, setMsg] = useState<{ tone: 'erro' | 'sucesso'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const saveName = async () => {
    if (!account || busy) return;
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 40) {
      setMsg({ tone: 'erro', text: 'Dê um nome de 1 a 40 caracteres para a conta.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await repo.renameAccount(account.id, trimmed);
      await qc.invalidateQueries({ queryKey: ['space'] });
      setMsg({ tone: 'sucesso', text: 'Nome da conta salvo.' });
    } catch (e) {
      setMsg({
        tone: 'erro',
        text: isRepoError(e, 'nome_da_conta_invalido') ? 'Dê um nome de 1 a 40 caracteres para a conta.' : 'Não foi possível salvar. Tente novamente.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen contentStyle={{ padding: space[6], gap: space[4] }}>
      {auth.mode === 'demo' ? <DemoBadge /> : null}
      <Card style={{ gap: space[1] }}>
        <Txt variant="title">{user?.displayName}</Txt>
        <Txt color={colors.textSecondary}>{user?.email}</Txt>
      </Card>

      <Card style={{ gap: space[3] }}>
        <Txt variant="title">Conta financeira</Txt>
        <TextField label="Nome da conta" value={name} onChangeText={setName} maxLength={60} />
        <Txt variant="caption" color={colors.textSecondary}>
          Saldo inicial: não informado. Sem ele, o Clarevo não calcula o saldo da conta.
        </Txt>
        {msg ? (
          <Banner tone={msg.tone} icon={msg.tone === 'erro' ? AlertCircle : Check}>
            <Txt variant="label" color={msg.tone === 'erro' ? colors.error : colors.successText}>
              {msg.text}
            </Txt>
          </Banner>
        ) : null}
        <Button label="Salvar nome" tone="soft" busy={busy} busyLabel="Salvando…" onPress={saveName} />
      </Card>

      <Card style={{ gap: space[2] }}>
        <Txt variant="title">Acesso ao plano</Txt>
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
        label="Sair"
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
  );
}
