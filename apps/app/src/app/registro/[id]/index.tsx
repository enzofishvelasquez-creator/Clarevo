import {
  ERROR_TEXT,
  NO_CATEGORY_LABEL,
  deviceTimeZone,
  formatDateTimeBR,
  formatBRL,
  formatDateBR,
  formatMonthBR,
  isRepoError,
  monthOf,
  newOperationKey,
} from '@clarevo/core';
import { router, useLocalSearchParams } from 'expo-router';
import { AlertCircle, ArrowDownLeft, ArrowUpRight, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ConfirmDialog } from '@/components/dialog';
import { ContextPill, SubHeader } from '@/components/header';
import { ErrorState } from '@/components/states';
import { FlashBanner, useFlash } from '@/components/flash';
import { Banner, Button, Card, FitMoney, Screen, Skeleton, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { totalChange } from '@/lib/highlight';
import { openSummary } from '@/lib/nav';
import { useDeleteRecord, useRecord, useSpace, useView } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, radius, space } from '@/theme/tokens';

/** Detalhe do registro (CL C002/C003): data, contexto, conta, valor, situação e período afetado. */
export default function DetalheRegistro() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const record = useRecord(id);
  const personal = useSpace().data;
  const view = useView();
  const { user } = useSession();
  const remove = useDeleteRecord();
  const [notice] = useFlash();
  const [confirming, setConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteKey = useRef(newOperationKey());

  const toList = () => (router.canGoBack() ? router.back() : router.replace('/movimentacoes'));

  const r = record.data;
  const account = personal?.accounts.find((a) => a.id === r?.accountId);

  const doDelete = async () => {
    if (!r) return;
    setDeleteError(null);
    try {
      await remove.mutateAsync({ key: deleteKey.current, id: r.id, version: r.version });
      setConfirming(false);
      // Excluir o gasto de uma conta a pagar reabre a conta na mesma operação do banco (D-021, regra 2).
      flash.set(r.commitmentId ? 'Registro excluído. A conta a pagar voltou para Ainda a pagar.' : 'Registro excluído');
      totalChange.set({ total: r.kind === 'despesa' ? 'pago' : 'recebido', month: monthOf(r.occurredOn), deltaCents: -r.amountCents });
      toList();
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
      <SubHeader title={r ? (r.kind === 'despesa' ? 'Gasto' : 'Recebimento') : 'Registro'} onBack={toList} right={<ContextPill label="Pessoal" />} />
      <Screen>
        <View style={styles.body}>
          {record.isPending ? (
            <Card style={{ gap: space[3] }}>
              <Skeleton width={110} height={26} />
              <Skeleton width="60%" height={28} />
              <Skeleton width="45%" height={40} />
              <Skeleton width="100%" height={120} />
            </Card>
          ) : record.isError ? (
            <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => record.refetch()} />
          ) : !r ? (
            <Card style={{ gap: space[3] }}>
              <Txt>{ERROR_TEXT.nao_encontrado}</Txt>
              <Button label="Ir para Movimentações" onPress={() => router.replace('/movimentacoes')} />
            </Card>
          ) : (
            <>
              <FlashBanner message={notice} />
              {deleteError ? (
                <Banner tone="erro" icon={AlertCircle}>
                  <Txt variant="label" color={colors.error}>
                    {deleteError}
                  </Txt>
                </Banner>
              ) : null}

              <Card style={{ gap: space[3] }}>
                <View style={[styles.badge, r.kind === 'receita' && { backgroundColor: colors.successTint }]}>
                  {r.kind === 'despesa' ? <ArrowUpRight size={16} color={colors.brand} /> : <ArrowDownLeft size={16} color={colors.successText} />}
                  <Txt variant="label" color={r.kind === 'despesa' ? colors.brand : colors.successText} style={{ fontFamily: fonts.bold }}>
                    {r.kind === 'despesa' ? 'Gasto pago' : 'Recebido'}
                  </Txt>
                </View>
                <Txt variant="title" style={{ fontSize: 24, lineHeight: 32 }} accessibilityRole="header" aria-level={2}>
                  {r.description}
                </Txt>
                <FitMoney cents={r.amountCents} />
                <View>
                  <Row label="Contexto" value="Pessoal" />
                  <Row label="Conta" value={account?.name ?? 'Conta não encontrada'} />
                  <Row label="Data" value={formatDateBR(r.occurredOn)} />
                  <Row label="Categoria" value={r.category ?? NO_CATEGORY_LABEL} />
                  {r.commitmentId ? <Row label="Origem" value="Conta a pagar" /> : null}
                  <Row label="Resumo afetado" value={formatMonthBR(monthOf(r.occurredOn))} last />
                </View>
                <View style={styles.trail} accessible>
                  <Txt variant="caption" color={colors.textSecondary}>
                    Anotado por {r.createdBy === user?.id ? 'você' : 'outra pessoa da família'} em {formatDateTimeBR(r.createdAt, deviceTimeZone())}
                  </Txt>
                  {r.version > 1 ? (
                    <Txt variant="caption" color={colors.textSecondary}>
                      Última alteração em {formatDateTimeBR(r.updatedAt, deviceTimeZone())}
                    </Txt>
                  ) : null}
                </View>
              </Card>

              {notice === 'Gasto salvo' || notice === 'Recebimento salvo' ? (
                <Button
                  label={r.kind === 'despesa' ? 'Anotar outro gasto' : 'Registrar outro recebimento'}
                  icon={Plus}
                  tone="soft"
                  onPress={() => router.replace({ pathname: '/registro/novo', params: { tipo: r.kind } })}
                />
              ) : null}
              <Button label="Editar registro" icon={Pencil} onPress={() => router.push(`/registro/${r.id}/editar`)} />
              {r.commitmentId ? (
                <Button label="Ver conta a pagar" tone="soft" onPress={() => router.push(`/a-pagar/${r.commitmentId}`)} />
              ) : null}
              <Button label="Excluir registro" icon={Trash2} tone="danger" onPress={() => setConfirming(true)} />
              <Button
                label="Ver resumo do mês"
                tone="soft"
                onPress={() => {
                  view.setMonth(monthOf(r.occurredOn));
                  view.setSpace('pessoal');
                  openSummary();
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
                <Txt color={colors.textSecondary}>O valor deixa de contar no resumo de {formatMonthBR(monthOf(r.occurredOn)).toLowerCase()}.</Txt>
                {r.commitmentId ? <Txt color={colors.textSecondary}>A conta a pagar ligada a este gasto volta para Ainda a pagar.</Txt> : null}
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
  body: { padding: space[5], gap: space[3] },
  trail: { gap: 2, paddingTop: space[1] },
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
