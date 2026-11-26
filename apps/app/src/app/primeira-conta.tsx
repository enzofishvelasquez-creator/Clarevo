import { ACCOUNT_NAME_MAX, ACCOUNTS_TEXT, FIRST_ACCOUNT_TEXT, TELEGRAM_BOT, TELEGRAM_IN_ACCOUNT, deviceTimeZone, isRepoError } from '@clarevo/core';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, FileUp, Landmark, MessageCircle } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { AuthShell } from '@/components/auth-shell';
import { Banner, Button, Card, LinkButton, TextField, Txt } from '@/components/ui';
import { firstStepTarget, signOutIntent } from '@/lib/nav';
import { useRepo, useSession } from '@/state/session';
import { colors, fonts, space } from '@/theme/tokens';

type Start = 'mes' | 'importar' | 'telegram';

/**
 * "Sua primeira conta" (CL C001). Cria contexto pessoal e conta em BRL uma única vez. Ao lado de "Começar meu mês", os dois jeitos de
 * começar com menos digitação (estudo de 25/11/2026, Onda 1, item 8): "Importar extrato, fatura ou print" e "Anotar pelo Telegram" criam a
 * conta com o mesmo nome e abrem a tela pedida por cima do Resumo. Nenhum dado de exemplo: a conta começa vazia nos três caminhos.
 */
export default function PrimeiraConta() {
  const repo = useRepo();
  const { user, signOut } = useSession();
  const qc = useQueryClient();
  const [name, setName] = useState('Conta principal');
  const [error, setError] = useState<string | undefined>();
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState<Start | null>(null);
  // O Telegram só aparece onde a tela existe para todas as pessoas (D-080; na demonstração, a tela explica).
  const telegram = TELEGRAM_BOT !== null && TELEGRAM_IN_ACCOUNT;

  const submit = async (start: Start = 'mes') => {
    if (busy) return;
    const trimmed = name.trim();
    if (trimmed.length < 1 || [...trimmed].length > ACCOUNT_NAME_MAX) {
      setError('Dê um nome de 1 a 40 caracteres para a conta.');
      return;
    }
    setError(undefined);
    setBanner(null);
    setBusy(start);
    // Com o espaço pronto, a navegação da raiz abre o atalho escolhido por cima do Resumo (app/_layout.tsx e lib/nav.ts).
    firstStepTarget.set(start === 'importar' ? '/importar' : start === 'telegram' ? '/conta/telegram' : null);
    try {
      const space = await repo.ensurePersonalSpace(trimmed, deviceTimeZone());
      qc.setQueryData(['space', user?.id], space);
    } catch (e) {
      firstStepTarget.set(null);
      if (isRepoError(e, 'nome_da_conta_invalido')) setError('Dê um nome de 1 a 40 caracteres para a conta.');
      else setBanner('Não foi possível criar a conta agora. O nome foi mantido. Tente de novo.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <AuthShell
      title="Sua primeira conta"
      subtitle={`${user?.displayName ? `${user.displayName}, a` : 'A'} conta representa onde o dinheiro entra e sai, como uma conta corrente. Você pode mudar o nome depois.`}
      art={
        <View style={{ alignItems: 'center' }}>
          <Landmark size={48} color={colors.brandText} />
        </View>
      }>
      <TextField label="Nome da conta" value={name} onChangeText={setName} maxLength={ACCOUNT_NAME_MAX} error={error} onSubmitEditing={() => submit()} />
      <Card style={{ backgroundColor: colors.brandTint, gap: space[1] }}>
        <Txt variant="label">{ACCOUNTS_TEXT.firstAccountNote}</Txt>
      </Card>
      {banner ? (
        <Banner tone="erro" icon={AlertCircle}>
          <Txt variant="label" color={colors.error}>
            {banner}
          </Txt>
        </Banner>
      ) : null}
      <Button label="Começar meu mês" busy={busy === 'mes'} busyLabel="Preparando…" disabled={busy !== null && busy !== 'mes'} onPress={() => submit()} />
      <View style={{ gap: space[2] }}>
        <Txt variant="label" color={colors.textSecondary} style={{ fontFamily: fonts.bold }}>
          {FIRST_ACCOUNT_TEXT.quickTitle}
        </Txt>
        <Button
          label={FIRST_ACCOUNT_TEXT.importLabel}
          icon={FileUp}
          tone="soft"
          accessibilityHint={FIRST_ACCOUNT_TEXT.importHint}
          busy={busy === 'importar'}
          busyLabel="Preparando…"
          disabled={busy !== null && busy !== 'importar'}
          onPress={() => submit('importar')}
        />
        {telegram ? (
          <Button
            label={FIRST_ACCOUNT_TEXT.telegramLabel}
            icon={MessageCircle}
            tone="soft"
            accessibilityHint={FIRST_ACCOUNT_TEXT.telegramHint}
            busy={busy === 'telegram'}
            busyLabel="Preparando…"
            disabled={busy !== null && busy !== 'telegram'}
            onPress={() => submit('telegram')}
          />
        ) : null}
      </View>
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
