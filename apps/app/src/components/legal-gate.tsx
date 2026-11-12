import { LEGAL_ACCEPT_TEXT, legalAcceptanceNeeded, newOperationKey, type LegalAcceptance } from '@clarevo/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { AlertCircle, ExternalLink, FileDown, Trash2 } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Banner, Button, LinkButton, Txt } from '@/components/ui';
import { useDeviceLocked } from '@/lib/device-lock';
import { signOutIntent } from '@/lib/nav';
import { SITE_URL, openSitePage } from '@/lib/site';
import { useSession } from '@/state/session';
import { colors, fonts, radius, space } from '@/theme/tokens';

const T = LEGAL_ACCEPT_TEXT;

/** O aceite da própria pessoa (my_legal_acceptance, A1). */
function useLegalAcceptance(enabled: boolean) {
  const { repo, user } = useSession();
  return useQuery({
    queryKey: ['legal-acceptance', user?.id ?? null],
    queryFn: (): Promise<LegalAcceptance> => repo!.getLegalAcceptance(),
    enabled: Boolean(enabled && repo && user),
    retry: 1,
  });
}

/**
 * Aceite dos termos e da política (A1): por cima do app, uma vez, para quem ainda não aceitou a versão vigente (contas criadas antes
 * do registro do aceite, ou uma versão nova que peça novo aceite, A5). "Concordo e continuar" ou "Sair da conta"; quem não concorda pode
 * exportar os dados e excluir a conta (Termos, seção 8), e nessas duas telas o aviso sai da frente. Os links abrem as páginas do site
 * (quando há endereço do site). Espera o app destravar (biometria). Se a leitura do aceite falhar, nada aparece: o aceite não pode
 * travar o app por uma falha de rede.
 */
export function LegalGate({ active }: { active: boolean }) {
  const locked = useDeviceLocked();
  const { repo, user, signOut } = useSession();
  const qc = useQueryClient();
  const acceptance = useLegalAcceptance(active);
  const key = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openFailed, setOpenFailed] = useState(false);
  const { height } = useWindowDimensions();
  const accept = useMutation({
    mutationFn: (version: number) => {
      key.current ??= newOperationKey();
      return repo!.acceptLegalTerms(key.current, version);
    },
    onSuccess: (data) => {
      key.current = null;
      qc.setQueryData(['legal-acceptance', user?.id ?? null], data);
    },
    onError: () => setError(T.failed),
  });

  const a = acceptance.data;
  if (!active || locked || !a || !legalAcceptanceNeeded(a)) return null;
  const open = async (page: 'termos' | 'privacidade') => {
    setOpenFailed(false);
    if (!(await openSitePage(page))) setOpenFailed(true);
  };
  return (
    <Modal visible transparent animationType="none" onRequestClose={() => {}} {...({ 'aria-label': T.title } as object)}>
      <View style={styles.backdrop}>
        <View style={[styles.box, { maxHeight: Math.max(280, Math.round(height * 0.9)) }]} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Txt variant="title" accessibilityRole="header" aria-level={2} style={styles.title}>
              {T.title}
            </Txt>
            <Txt>{a.version === null ? T.first : T.updated}</Txt>
            {SITE_URL ? (
              <View style={{ gap: space[1] }}>
                <LinkButton label={T.terms} trailing={ExternalLink} style={styles.link} onPress={() => void open('termos')} />
                <LinkButton label={T.privacy} trailing={ExternalLink} style={styles.link} onPress={() => void open('privacidade')} />
              </View>
            ) : null}
            {openFailed ? (
              <Banner tone="erro" icon={AlertCircle}>
                <Txt variant="label" color={colors.error}>
                  {T.openFailed}
                </Txt>
              </Banner>
            ) : null}
            {/* Quem não concorda: exportar os dados e excluir a conta continuam possíveis (Termos, seção 8). */}
            <Txt variant="caption" color={colors.textSecondary}>
              {T.disagree}
            </Txt>
            <View style={{ gap: space[1] }}>
              <LinkButton label={T.export} icon={FileDown} style={styles.link} onPress={() => router.push('/conta/exportar')} />
              <LinkButton label={T.delete} icon={Trash2} style={styles.link} onPress={() => router.push('/conta/excluir')} />
            </View>
            {error ? (
              <Banner tone="erro" icon={AlertCircle}>
                <Txt variant="label" color={colors.error}>
                  {error}
                </Txt>
              </Banner>
            ) : null}
          </ScrollView>
          <View style={styles.actions}>
            <Button
              label={T.signOut}
              tone="ghost"
              style={styles.action}
              onPress={() => {
                signOutIntent.mark();
                void signOut();
              }}
            />
            <Button
              label={T.accept}
              style={styles.action}
              busy={accept.isPending}
              busyLabel="Guardando…"
              onPress={() => {
                setError(null);
                accept.mutate(a.current);
              }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: space[4] },
  box: { width: '100%', maxWidth: 440, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space[6], gap: space[4] },
  content: { gap: space[3] },
  title: { fontFamily: fonts.extrabold, fontSize: 22, lineHeight: 30 },
  link: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], justifyContent: 'flex-end' },
  action: { alignSelf: 'auto', flexGrow: 1, flexBasis: 120 },
});
