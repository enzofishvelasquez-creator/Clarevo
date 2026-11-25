import { ACCOUNTING_TEXT, ERROR_TEXT, BUSINESS_PROFILE_LABEL, businessPeopleErrorText, deviceTimeZone, todayIn, type AccountingBusiness } from '@clarevo/core';
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { LogOut } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { AccountingNeutral, AccountingPending, AccountingShell } from '@/components/accounting-parts';
import { BusinessYearView } from '@/components/business-year';
import { ConfirmDialog } from '@/components/dialog';
import { FlashBanner, useFlash } from '@/components/flash';
import { ErrorState } from '@/components/states';
import { Banner, Button, Card, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { useAccounting, useLeaveAccounting, type AccountingView } from '@/state/business';
import { attemptFamily, useFamilyKeys } from '@/state/family';
import { colors, fonts, space } from '@/theme/tokens';

const A = ACCOUNTING_TEXT;

/**
 * Um negócio que a pessoa acompanha como Contabilidade (D-123, Clarevo Plus; pronto e desligado): quem administra e desde quando, o Resumo
 * do ano daquele negócio (o mesmo de "Seu negócio" → Resumo do ano, só leitura, com troca de ano), "Exportar os lançamentos" (a exportação
 * de sempre, com este negócio) e "Deixar de acompanhar" (sair do negócio, com confirmação). O negócio não vira espaço da pessoa. Com o Plus
 * fechado, ou se a pessoa não acompanha este negócio, o estado vazio neutro e a volta para Conta. Enquanto a chave do Plus e a lista são
 * lidas (ou lidas de novo, logo depois de aceitar um convite), o quadro neutro de carregando.
 */
export default function ContabilidadeNegocioScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const accounting = useAccounting();
  const leave = useLeaveAccounting();
  const keys = useFamilyKeys();
  const [notice] = useFlash();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Depois de "Deixar de acompanhar", a tela continua com o negócio que saiu até sair da pilha (sem passar pelo estado neutro).
  const [gone, setGone] = useState<{ business: AccountingBusiness; others: number } | null>(null);
  const qc = useQueryClient();

  const found = accounting.data?.plusOpen ? accounting.data.businesses.find((b) => b.id === id) : undefined;
  const business = gone?.business ?? found;
  if (!business && (accounting.isPending || accounting.isFetching)) return <AccountingPending />;
  if (!business && accounting.isError) {
    // A falha também fica no quadro neutro: a tela pode ter sido aberta pelo endereço com o Plus fechado.
    return (
      <AccountingShell title={A.pendingTitle} pill={false}>
        <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => accounting.refetch()} />
      </AccountingShell>
    );
  }
  if (!business) return <AccountingNeutral />;
  const since = todayIn(deviceTimeZone(), new Date(business.since));
  const others = gone ? gone.others : (accounting.data?.businesses.filter((b) => b.id !== business.id).length ?? 0);

  async function doLeave() {
    if (!business) return;
    setError(null);
    const r = await attemptFamily(keys, `deixar:${business.id}`, (key) => leave.mutateAsync({ key, contextId: business.id }));
    setConfirm(false);
    if (r.ok) {
      // Com outros negócios acompanhados, volta à lista (a que já está na pilha, ou uma no lugar desta); sem nenhum, a Conta (o cartão
      // some). Só depois de sair daqui as leituras são refeitas.
      setGone({ business, others });
      // A lista guardada já sai sem o negócio (a da tela de antes não o mostra nem por um instante); depois, tudo é lido de novo.
      qc.setQueriesData<AccountingView>({ queryKey: ['accounting'] }, (old) => (old ? { ...old, businesses: old.businesses.filter((b) => b.id !== business.id) } : old));
      flash.set(A.left(business.name));
      router.dismissTo(others > 0 ? '/contabilidade' : '/conta');
      void qc.invalidateQueries();
      return;
    }
    setError(businessPeopleErrorText(r.code));
  }

  return (
    <AccountingShell title={business.name}>
      <FlashBanner message={notice} />
      {error ? (
        <Banner tone="erro">
          <Txt variant="label" color={colors.error}>
            {error}
          </Txt>
        </Banner>
      ) : null}
      <Card style={{ gap: space[1] }}>
        <Txt variant="label" style={{ fontFamily: fonts.bold }}>
          {A.rowAdmin(business.adminName)}
        </Txt>
        {business.businessProfile ? (
          <Txt variant="caption" color={colors.textSecondary}>
            {BUSINESS_PROFILE_LABEL[business.businessProfile]}
          </Txt>
        ) : null}
        <Txt variant="caption" color={colors.textSecondary}>
          {A.rowSince(since)}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {A.readOnly}
        </Txt>
      </Card>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {A.yearTitle}
      </Txt>
      <BusinessYearView
        business={{ id: business.id, name: business.name, createdAt: business.createdAt, businessProfile: business.businessProfile }}
        onExport={(periodo) => router.push({ pathname: '/conta/exportar', params: { contabilidade: business.id, periodo } })}
        texts={{ exportLabel: A.export, exportHint: A.exportHint, notAdvice: A.notAdvice, meiNote: A.meiNote }}
      />
      <View style={{ gap: space[2] }}>
        <Button label={A.leave} icon={LogOut} tone="danger" disabled={leave.isPending} onPress={() => setConfirm(true)} />
        <Txt variant="caption" color={colors.textSecondary}>
          {A.privacy}
        </Txt>
      </View>
      <ConfirmDialog
        visible={confirm}
        title={A.leaveTitle(business.name)}
        cancelLabel={A.cancel}
        confirmLabel={A.leaveConfirm}
        busy={leave.isPending}
        onCancel={() => setConfirm(false)}
        onConfirm={doLeave}>
        <Txt color={colors.textSecondary}>{A.leaveBody}</Txt>
      </ConfirmDialog>
    </AccountingShell>
  );
}
