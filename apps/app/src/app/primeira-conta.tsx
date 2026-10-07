import { isRepoError } from '@clarevo/core';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Landmark } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { AuthShell } from '@/components/auth-shell';
import { Banner, Button, Card, LinkButton, TextField, Txt } from '@/components/ui';
import { signOutIntent } from '@/lib/nav';
import { useRepo, useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

/** "Sua primeira conta" (CL C001). Cria contexto pessoal e conta em BRL uma única vez. */
export default function PrimeiraConta() {
  const repo = useRepo();
  const { user, signOut } = useSession();
  const qc = useQueryClient();
  const [name, setName] = useState('Conta principal');
  const [error, setError] = useState<string | undefined>();
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 40) {
      setError('Dê um nome de 1 a 40 caracteres para a conta.');
      return;
    }
    setError(undefined);
    setBanner(null);
    setBusy(true);
    try {
      const space = await repo.ensurePersonalSpace(trimmed);
      qc.setQueryData(['space', user?.id], space);
    } catch (e) {
      if (isRepoError(e, 'nome_da_conta_invalido')) setError('Dê um nome de 1 a 40 caracteres para a conta.');
      else setBanner('Não foi possível criar a conta agora. O nome foi mantido. Tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Sua primeira conta"
      subtitle={`${user?.displayName ? `${user.displayName}, a` : 'A'} conta representa onde o dinheiro entra e sai, como uma conta corrente. Você pode mudar o nome depois.`}
      art={
        <View style={{ alignItems: 'center' }}>
          <Landmark size={48} color={colors.brand} />
        </View>
      }>
      <TextField label="Nome da conta" value={name} onChangeText={setName} maxLength={60} error={error} onSubmitEditing={submit} />
      <Card style={{ backgroundColor: colors.brandTint, gap: space[1] }}>
        <Txt variant="label">Saldo inicial não é obrigatório.</Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          Sem ele, o Clarevo mostra a diferença do mês, mas não calcula o saldo da conta.
        </Txt>
      </Card>
      {banner ? (
        <Banner tone="erro" icon={AlertCircle}>
          <Txt variant="label" color={colors.error}>
            {banner}
          </Txt>
        </Banner>
      ) : null}
      <Button label="Começar meu mês" busy={busy} busyLabel="Preparando…" onPress={submit} />
      <LinkButton
        label="Sair"
        color={colors.textSecondary}
        onPress={() => {
          signOutIntent.mark();
          signOut();
        }}
      />
    </AuthShell>
  );
}
