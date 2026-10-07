import {
  ERROR_TEXT,
  NO_CATEGORY_LABEL,
  formatBRL,
  formatDateBR,
  formatMonthBR,
  isRepoError,
  monthOf,
  newOperationKey,
} from '@clarevo/core';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { AlertCircle, ArrowDownLeft, ArrowLeft, ArrowUpRight, Check, Pencil, ShieldCheck, Trash2 } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ConfirmDialog } from '@/components/dialog';
import { BrandHeader, ContextSwitch } from '@/components/header';
import { ErrorState, LoadingState } from '@/components/states';
import { Banner, Button, Card, Money, Screen, TopInset, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { useDeleteRecord, useRecord, useSpace, useView, type SpaceKind } from '@/state/data';
import { colors, fonts, radius, space } from '@/theme/tokens';

/** Detalhe do registro (CL C002/C003): data, contexto, conta, valor, situação e período afetado. */
export default function DetalheRegistro() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const record = useRecord(id);
  const personal = useSpace().data;
  const view = useView();
  const remove = useDeleteRecord();
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteKey = useRef(newOperationKey());

  useFocusEffect(
    useCallback(() => {
      const m = flash.take();
      if (m) setNotice(m);
    }, []),
  );

  const toList = () => (router.canGoBack() ? router.back() : router.replace('/movimentacoes'));
  const switchContext = (next: SpaceKind) => {
    view.setSpace(next);
    router.replace('/');
  };

  const r = record.data;
  const account = personal?.accounts.find((a) => a.id === r?.accountId);

  const doDelete = async () => {
    if (!r) return;
    setDeleteError(null);
    try {
      await remove.mutateAsync({ key: deleteKey.current, id: r.id, version: r.version });
      setConfirming(false);
      router.replace('/movimentacoes');
    } catch (e) {
      setConfirming(false);
      if (isRepoError(e, 'versao_desatualizada')) {
        deleteKey.current = newOperationKey();
        setDeleteError(`${ERROR_TEXT.versao_desatualizada} O registro foi mantido.`);
        record.refetch();
      } else if (isRepoError(e, 'nao_encontrado')) setDeleteError(ERROR_TEXT.nao_encontrado);
      else setDeleteError('Não foi possível excluir. O registro foi mantido. Tente novamente.');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopInset color={colors.brand} />
      <Screen>
        <View style={styles.hero}>
          <BrandHeader />
          <ContextSwitch onRequest={switchContext} />
        </View>
        <View style={styles.body}>
          <Button label="Movimentações" icon={ArrowLeft} tone="ghost" onPress={toList} style={styles.back} />

          {record.isPending ? (
            <LoadingState />
          ) : record.isError ? (
            <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => record.refetch()} />
          ) : !r ? (
            <Card style={{ gap: space[3] }}>
              <Txt>{ERROR_TEXT.nao_encontrado}</Txt>
              <Button label="Ir para Movimentações" onPress={() => router.replace('/movimentacoes')} />
            </Card>
          ) : (
            <>
              {notice ? (
                <Banner tone="sucesso" icon={Check}>
                  <Txt variant="label" color={colors.success} style={{ fontFamily: fonts.bold }}>
                    {notice}
                  </Txt>
                </Banner>
              ) : null}
              {deleteError ? (
                <Banner tone="erro" icon={AlertCircle}>
                  <Txt variant="label" color={colors.error}>
                    {deleteError}
                  </Txt>
                </Banner>
              ) : null}

              <Card style={{ gap: space[3] }}>
                <View style={[styles.badge, r.kind === 'receita' && { backgroundColor: colors.successTint }]}>
                  {r.kind === 'despesa' ? <ArrowUpRight size={16} color={colors.brand} /> : <ArrowDownLeft size={16} color={colors.success} />}
                  <Txt variant="label" color={r.kind === 'despesa' ? colors.brand : colors.success} style={{ fontFamily: fonts.bold }}>
                    {r.kind === 'despesa' ? 'Gasto pago' : 'Recebido'}
                  </Txt>
                </View>
                <Txt variant="title" style={{ fontSize: 24, lineHeight: 32 }} accessibilityRole="header">
                  {r.description}
                </Txt>
                <Money cents={r.amountCents} variant="hero" />
                <View>
                  <Row label="Contexto" value="Pessoal" />
                  <Row label="Conta" value={account?.name ?? '—'} />
                  <Row label="Data" value={formatDateBR(r.occurredOn)} />
                  <Row label="Situação" value={r.kind === 'despesa' ? 'Pago' : 'Recebido'} />
                  <Row label="Categoria" value={r.category ?? NO_CATEGORY_LABEL} />
                  <Row label="Resumo afetado" value={formatMonthBR(monthOf(r.occurredOn))} last />
                </View>
              </Card>

              <Button label="Editar registro" icon={Pencil} onPress={() => router.push(`/registro/${r.id}/editar`)} />
              <Button label="Excluir registro" icon={Trash2} tone="danger" onPress={() => setConfirming(true)} />
              <Button
                label="Ver resumo do mês"
                tone="soft"
                onPress={() => {
                  view.setMonth(monthOf(r.occurredOn));
                  view.setSpace('pessoal');
                  router.navigate('/');
                }}
              />
              <Pressable accessibilityRole="button" onPress={() => router.push('/quem-ve')} style={styles.privacy}>
                <ShieldCheck size={18} color={colors.textSecondary} />
                <Txt variant="label" color={colors.textSecondary}>
                  Quem vê estes dados?
                </Txt>
              </Pressable>

              <ConfirmDialog
                visible={confirming}
                title="Excluir registro?"
                cancelLabel="Cancelar"
                confirmLabel="Excluir registro"
                busy={remove.isPending}
                onCancel={() => setConfirming(false)}
                onConfirm={doDelete}>
                <Txt style={{ fontFamily: fonts.bold }}>
                  {r.description} · {formatBRL(r.amountCents)} · Pessoal
                </Txt>
                <Txt color={colors.textSecondary}>O valor deixa de contar no resumo de {formatMonthBR(monthOf(r.occurredOn))}.</Txt>
              </ConfirmDialog>
            </>
          )}
        </View>
      </Screen>
    </View>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.row, !last && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
      <Txt variant="label" color={colors.textSecondary}>
        {label}
      </Txt>
      <Txt variant="label" style={{ fontFamily: fonts.bold, flexShrink: 1, textAlign: 'right' }}>
        {value}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.brand, paddingHorizontal: space[6], paddingTop: space[4], paddingBottom: space[5] },
  body: { padding: space[6], gap: space[3] },
  back: { alignSelf: 'flex-start', paddingHorizontal: space[2], minHeight: 44 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    alignSelf: 'flex-start',
    backgroundColor: colors.brandTint,
    paddingHorizontal: space[3],
    paddingVertical: space[1],
    borderRadius: radius.sm,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space[4], paddingVertical: space[3], minHeight: 44, alignItems: 'center' },
  privacy: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: space[2], minHeight: 44 },
});
