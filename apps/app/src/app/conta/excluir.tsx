import { DELETE_CONFIRMATION_WORD, DELETE_TEXT, FAMILY_TEXT, canSubmitDelete, deleteErrorText, deleteFamilyOutcome, deleteFamilyText } from '@clarevo/core';
import { router } from 'expo-router';
import { AlertCircle, FileDown, Info, Users } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { SubHeader } from '@/components/header';
import { Banner, Button, Card, LinkButton, Screen, TextField, Txt } from '@/components/ui';
import { forgetDevice } from '@/lib/device-forget';
import { deletedAccountIntent, signOutIntent } from '@/lib/nav';
import { useDeleteAccount } from '@/state/account';
import { useFamily } from '@/state/family';
import { useSession } from '@/state/session';
import { colors, fonts, space } from '@/theme/tokens';

const T = DELETE_TEXT;

type Msg = { tone: 'erro' | 'info'; text: string } | null;

/** Uma linha de lista: o marcador é enfeite, só o texto é lido. */
function Line({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: space[2] }}>
      <Txt color={colors.textSecondary} accessibilityElementsHidden importantForAccessibility="no">
        •
      </Txt>
      <Txt style={{ flex: 1 }}>{text}</Txt>
    </View>
  );
}

/**
 * Excluir minha conta (D-058, CL-04 e CL-16): explica o que é apagado e o que continua (a Família conforme o papel), oferece
 * exportar antes (D-047), mostra o bloqueio de titular com o caminho para passar a titularidade, pede para digitar EXCLUIR e confirma.
 * Depois de excluir, o aparelho esquece a pessoa, a sessão termina e a tela de entrada diz "Sua conta foi excluída". Na demonstração a
 * tela abre e explica, mas o botão final diz que nada é apagado. Sem tom de alerta: a escolha é da pessoa.
 */
export default function ExcluirContaScreen() {
  const { user, auth, signOut } = useSession();
  const family = useFamily();
  const deleteAccount = useDeleteAccount();
  const demo = auth.mode === 'demo';
  const outcome = deleteFamilyOutcome(family.data);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const canSubmit = canSubmitDelete(typed, outcome) && !family.isPending;

  const submit = async () => {
    if (busy || !canSubmit) return;
    setMsg(null);
    if (demo) {
      setMsg({ tone: 'info', text: T.demo });
      return;
    }
    setBusy(true);
    const r = await deleteAccount(DELETE_CONFIRMATION_WORD);
    if (!r.ok) {
      setBusy(false);
      setMsg({ tone: 'erro', text: deleteErrorText(r.code) });
      return;
    }
    // A conta já não existe: o que o aparelho guardava dela sai também, a sessão termina e a entrada diz "Sua conta foi excluída".
    if (user) await forgetDevice(user.id);
    deletedAccountIntent.mark();
    signOutIntent.mark();
    try {
      await signOut();
    } catch {
      // O servidor já não conhece a sessão: o aparelho a encerra do mesmo jeito.
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={T.title} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        <Txt color={colors.textSecondary}>{T.intro}</Txt>

        <Card style={{ gap: space[3] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {T.erasedTitle}
          </Txt>
          {T.erased.map((line) => (
            <Line key={line} text={line} />
          ))}
        </Card>

        <Card style={{ gap: space[3] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {T.keptTitle}
          </Txt>
          <Txt>{T.keptNone}</Txt>
          <Txt variant="label" style={{ fontFamily: fonts.bold }}>
            {T.familyTitle}
          </Txt>
          {family.isPending ? (
            <Txt color={colors.textSecondary}>{T.familyLoading}</Txt>
          ) : family.isError ? (
            <>
              <Txt color={colors.textSecondary}>{FAMILY_TEXT.loadFailed}</Txt>
              <LinkButton label="Tentar novamente" onPress={() => family.refetch()} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
            </>
          ) : (
            <>
              <Txt>{deleteFamilyText(outcome, family.data?.context.name ?? '')}</Txt>
              {outcome === 'nenhuma' ? <Txt variant="caption" color={colors.textSecondary}>{T.familyGeneral}</Txt> : null}
              {outcome === 'bloqueia' ? (
                <>
                  <Txt variant="caption" color={colors.textSecondary}>
                    {T.familyBlockedHow}
                  </Txt>
                  <Button label={T.familyOpen} icon={Users} tone="soft" onPress={() => router.push('/familia')} />
                </>
              ) : null}
            </>
          )}
        </Card>

        <Card style={{ gap: space[3] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {T.exportTitle}
          </Txt>
          <Txt color={colors.textSecondary}>{T.exportHint}</Txt>
          <Button label={T.exportButton} icon={FileDown} tone="soft" onPress={() => router.push('/conta/exportar')} />
        </Card>

        <Card style={{ gap: space[3] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {T.confirmTitle}
          </Txt>
          <TextField
            label={T.confirmLabel}
            hint={T.confirmHint}
            value={typed}
            onChangeText={(v) => {
              setTyped(v);
              setMsg(null);
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
            editable={!busy}
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          {msg ? (
            <Banner tone={msg.tone} icon={msg.tone === 'erro' ? AlertCircle : Info}>
              <Txt variant="label" color={msg.tone === 'erro' ? colors.error : colors.text}>
                {msg.text}
              </Txt>
            </Banner>
          ) : null}
          <Button label={T.submit} busy={busy} busyLabel={T.submitBusy} disabled={!canSubmit} onPress={submit} />
          <Button label={T.cancel} tone="ghost" disabled={busy} onPress={() => (router.canGoBack() ? router.back() : router.replace('/conta'))} />
        </Card>
      </Screen>
    </View>
  );
}
