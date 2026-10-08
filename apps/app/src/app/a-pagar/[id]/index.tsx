import {
  COMMITMENT_ERROR_TEXT,
  ERROR_TEXT,
  NO_CATEGORY_LABEL,
  commitmentSituation,
  deviceTimeZone,
  dueText,
  findNextMonthCommitment,
  formatBRL,
  formatDateBR,
  formatDateTimeBR,
  formatMonthBR,
  formatMonthName,
  isRepoError,
  monthOf,
  newOperationKey,
  nextMonthPrefill,
  type Commitment,
} from '@clarevo/core';
import { router, useLocalSearchParams } from 'expo-router';
import { AlertCircle, Check, Pencil, Plus, ShieldCheck, Trash2, Undo2 } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { SITUATION_LOOK } from '@/components/commitment-row';
import { ConfirmDialog } from '@/components/dialog';
import { FlashBanner, useFlash } from '@/components/flash';
import { ContextPill, SubHeader } from '@/components/header';
import { ErrorState } from '@/components/states';
import { Banner, Button, Card, FitMoney, LinkButton, Screen, Skeleton, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { totalChange } from '@/lib/highlight';
import { useCommitment, useCommitments, useDeleteCommitment, useSpace, useUndoCommitmentPayment, useView } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, radius, space } from '@/theme/tokens';

const textFor = (code: string) =>
  code in COMMITMENT_ERROR_TEXT ? COMMITMENT_ERROR_TEXT[code as keyof typeof COMMITMENT_ERROR_TEXT] : COMMITMENT_ERROR_TEXT.salvar_falhou;

/** Detalhe da conta a pagar: situação, vencimento, efeito no resumo e as ações permitidas em cada estado (D-021). */
export default function DetalheContaAPagar() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const commitment = useCommitment(id);
  const personal = useSpace().data;
  const view = useView();
  const { user, today } = useSession();
  const remove = useDeleteCommitment();
  const undo = useUndoCommitmentPayment();
  const [notice, setNotice] = useFlash();
  const [confirming, setConfirming] = useState<null | 'excluir' | 'desfazer'>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const deleteKey = useRef(newOperationKey());
  const undoKey = useRef(newOperationKey());

  const toList = () => (router.canGoBack() ? router.back() : router.replace('/a-pagar'));

  const c = commitment.data;
  const situation = c ? commitmentSituation(c, today) : null;
  const paid = c?.status === 'quitado' ? c.payment : null;

  const doDelete = async () => {
    if (!c) return;
    setActionError(null);
    try {
      await remove.mutateAsync({ key: deleteKey.current, id: c.id, version: c.version });
      deleteKey.current = newOperationKey();
      setConfirming(null);
      flash.set('Conta a pagar excluída');
      toList();
    } catch (e) {
      setConfirming(null);
      if (isRepoError(e, 'versao_desatualizada')) {
        deleteKey.current = newOperationKey();
        setActionError(`${COMMITMENT_ERROR_TEXT.versao_desatualizada} Nada foi alterado.`);
        commitment.refetch();
      } else if (isRepoError(e, 'compromisso_quitado') || isRepoError(e, 'nao_encontrado') || isRepoError(e, 'sem_permissao')) {
        deleteKey.current = newOperationKey();
        setActionError(textFor(e.code));
        commitment.refetch();
      } else setActionError(COMMITMENT_ERROR_TEXT.excluir_falhou); // rede: a mesma chave torna a repetição segura
    }
  };

  const doUndo = async () => {
    if (!c || !paid) return;
    setActionError(null);
    try {
      await undo.mutateAsync({ key: undoKey.current, id: c.id, version: c.version });
      // Chave nova: um próximo desfazer (depois de pagar de novo) é outra operação.
      undoKey.current = newOperationKey();
      setConfirming(null);
      setNotice('Pagamento desfeito');
      totalChange.set({ total: 'pago', month: monthOf(paid.paidOn), deltaCents: -paid.amountCents });
    } catch (e) {
      setConfirming(null);
      if (isRepoError(e, 'versao_desatualizada')) {
        undoKey.current = newOperationKey();
        try {
          const { data: current } = await commitment.refetch();
          setActionError(
            current && current.status === 'aberto'
              ? COMMITMENT_ERROR_TEXT.compromisso_aberto
              : `${COMMITMENT_ERROR_TEXT.versao_desatualizada} Nada foi alterado.`,
          );
        } catch {
          setActionError(`${COMMITMENT_ERROR_TEXT.versao_desatualizada} Nada foi alterado.`);
        }
      } else if (isRepoError(e, 'compromisso_aberto') || isRepoError(e, 'nao_encontrado') || isRepoError(e, 'sem_permissao')) {
        undoKey.current = newOperationKey();
        setActionError(textFor(e.code));
        commitment.refetch();
      } else setActionError(COMMITMENT_ERROR_TEXT.desfazer_falhou); // rede: repetir com a mesma chave é seguro
    }
  };

  const openSummary = () => {
    if (!c) return;
    // Paga: o mês da data do pagamento. Em aberto: o mês do vencimento, ou o corrente se ela ainda vai vencer depois dele.
    const target = paid ? monthOf(paid.paidOn) : monthOf(c.dueOn) < view.currentMonth ? monthOf(c.dueOn) : view.currentMonth;
    view.setMonth(target);
    view.setSpace('pessoal');
    router.navigate('/');
  };

  const affected = !c
    ? ''
    : paid
      ? `Pago de ${formatMonthBR(monthOf(paid.paidOn)).toLowerCase()}`
      : monthOf(c.dueOn) < view.currentMonth
        ? `Ainda a pagar de ${formatMonthBR(view.currentMonth).toLowerCase()}, como vencida`
        : `Ainda a pagar de ${formatMonthBR(monthOf(c.dueOn)).toLowerCase()}`;
  const look = situation ? SITUATION_LOOK[situation] : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title="Conta a pagar" onBack={toList} right={<ContextPill label="Pessoal" />} />
      <Screen>
        <View style={styles.body}>
          {commitment.isPending ? (
            <Card style={{ gap: space[3] }}>
              <Skeleton width={110} height={26} />
              <Skeleton width="60%" height={28} />
              <Skeleton width="45%" height={40} />
              <Skeleton width="100%" height={120} />
            </Card>
          ) : commitment.isError ? (
            <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => commitment.refetch()} />
          ) : !c || !look ? (
            <Card style={{ gap: space[3] }}>
              <Txt>{COMMITMENT_ERROR_TEXT.nao_encontrado}</Txt>
              <Button label="Ir para Contas a pagar" onPress={() => router.replace('/a-pagar')} />
            </Card>
          ) : (
            <>
              <FlashBanner message={notice} />
              {actionError ? (
                <Banner tone="erro" icon={AlertCircle}>
                  <Txt variant="label" color={colors.error}>
                    {actionError}
                  </Txt>
                </Banner>
              ) : null}

              <Card style={{ gap: space[3] }}>
                <View style={[styles.badge, { backgroundColor: look.bg }]}>
                  <look.Icon size={16} color={look.fg} />
                  <Txt variant="label" color={look.fg} style={{ fontFamily: fonts.bold }}>
                    {look.label}
                  </Txt>
                </View>
                <Txt variant="title" style={{ fontSize: 24, lineHeight: 32 }} accessibilityRole="header">
                  {c.description}
                </Txt>
                <FitMoney cents={paid ? paid.amountCents : c.amountCents} />
                <Txt variant="label" color={situation === 'vencida' ? colors.error : colors.textSecondary}>
                  {dueText(c, today)}
                </Txt>
                <View>
                  <Row label="Contexto" value="Pessoal" />
                  <Row label="Vencimento" value={formatDateBR(c.dueOn)} />
                  <Row label="Categoria" value={c.category ?? NO_CATEGORY_LABEL} />
                  {paid ? (
                    <>
                      <Row label="Valor previsto" value={formatBRL(c.amountCents)} />
                      <Row label="Data do pagamento" value={formatDateBR(paid.paidOn)} />
                      <Row label="Conta" value={personal?.accounts.find((a) => a.id === paid.accountId)?.name ?? 'Conta não encontrada'} />
                    </>
                  ) : null}
                  <Row label="Resumo afetado" value={affected} last />
                </View>
                <View style={styles.trail} accessible>
                  <Txt variant="caption" color={colors.textSecondary}>
                    Anotada por {c.createdBy === user?.id ? 'você' : 'outra pessoa da família'} em {formatDateTimeBR(c.createdAt, deviceTimeZone())}
                  </Txt>
                  {c.version > 1 ? (
                    <Txt variant="caption" color={colors.textSecondary}>
                      Última alteração em {formatDateTimeBR(c.updatedAt, deviceTimeZone())}
                    </Txt>
                  ) : null}
                </View>
              </Card>

              {paid ? (
                <>
                  <Button label="Ver gasto registrado" tone="soft" onPress={() => router.push(`/registro/${paid.recordId}`)} />
                  <Button label="Desfazer pagamento" icon={Undo2} tone="danger" onPress={() => setConfirming('desfazer')} />
                  <NextMonth commitment={c} />
                  <Txt variant="caption" color={colors.textSecondary}>
                    Para alterar esta conta a pagar, desfaça o pagamento. O gasto registrado pode ser editado em Movimentações.
                  </Txt>
                </>
              ) : (
                <>
                  <Button label="Marcar como paga" icon={Check} onPress={() => router.push(`/a-pagar/${c.id}/pagar`)} />
                  {notice === 'Conta a pagar salva' ? (
                    <Button label="Anotar outra conta a pagar" icon={Plus} tone="soft" onPress={() => router.replace('/a-pagar/nova')} />
                  ) : null}
                  <Button label="Editar conta a pagar" icon={Pencil} tone="soft" onPress={() => router.push(`/a-pagar/${c.id}/editar`)} />
                  <Button label="Excluir conta a pagar" icon={Trash2} tone="danger" onPress={() => setConfirming('excluir')} />
                </>
              )}
              <Button label="Ver resumo do mês" tone="soft" onPress={openSummary} />
              <Pressable accessibilityRole="button" onPress={() => router.push('/quem-ve')} style={styles.privacy}>
                <ShieldCheck size={18} color={colors.textSecondary} />
                <Txt variant="label" color={colors.textSecondary}>
                  Quem vê estes dados?
                </Txt>
              </Pressable>

              <ConfirmDialog
                visible={confirming === 'excluir'}
                title="Excluir conta a pagar?"
                cancelLabel="Cancelar"
                confirmLabel="Excluir conta a pagar"
                busy={remove.isPending}
                onCancel={() => setConfirming(null)}
                onConfirm={doDelete}>
                <Txt style={{ fontFamily: fonts.bold }}>
                  {c.description} · {formatBRL(c.amountCents)} · vence em {formatDateBR(c.dueOn)} · Pessoal
                </Txt>
                <Txt color={colors.textSecondary}>O valor deixa de contar em Ainda a pagar. Recebido, Pago e a diferença do mês não mudam.</Txt>
              </ConfirmDialog>

              {paid ? (
                <ConfirmDialog
                  visible={confirming === 'desfazer'}
                  title="Desfazer pagamento?"
                  cancelLabel="Cancelar"
                  confirmLabel="Desfazer pagamento"
                  busy={undo.isPending}
                  onCancel={() => setConfirming(null)}
                  onConfirm={doUndo}>
                  <Txt style={{ fontFamily: fonts.bold }}>
                    {c.description} · {formatBRL(paid.amountCents)} pago em {formatDateBR(paid.paidOn)} · Pessoal
                  </Txt>
                  <Txt color={colors.textSecondary}>
                    O gasto registrado será excluído e deixa de contar em Pago de {formatMonthBR(monthOf(paid.paidOn)).toLowerCase()}. A conta a
                    pagar volta para Ainda a pagar.
                  </Txt>
                </ConfirmDialog>
              ) : null}
            </>
          )}
        </View>
      </Screen>
    </View>
  );
}

/**
 * Atalho "Adicionar a conta do próximo mês" (sem recorrência neste ciclo). Só aparece com a consulta confirmada:
 * enquanto carrega ou se falhar, nada aparece, para não arriscar uma conta duplicada.
 */
function NextMonth({ commitment: c }: { commitment: Commitment }) {
  const { currentMonth } = useView();
  const list = useCommitments(c.contextId, currentMonth);
  if (!list.isSuccess) return null;
  const prefill = nextMonthPrefill(c);
  const existing = findNextMonthCommitment(list.data, c);
  if (existing) {
    const month = monthOf(prefill.dueOn);
    return (
      <View style={{ gap: space[1] }}>
        <Txt variant="label" color={colors.textSecondary}>
          A conta a pagar de {formatMonthBR(month).toLowerCase()} já foi anotada.
        </Txt>
        <LinkButton
          label={`Ver conta a pagar de ${formatMonthName(month)}`}
          style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
          onPress={() => router.push(`/a-pagar/${existing.id}`)}
        />
      </View>
    );
  }
  return (
    <Button
      label="Adicionar a conta do próximo mês"
      icon={Plus}
      tone="soft"
      onPress={() =>
        router.push({
          pathname: '/a-pagar/nova',
          params: {
            descricao: prefill.description,
            valor: String(prefill.amountCents),
            vencimento: prefill.dueOn,
            ...(prefill.category ? { categoria: prefill.category } : {}),
          },
        })
      }
    />
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
    paddingHorizontal: space[3],
    paddingVertical: space[1],
    borderRadius: radius.sm,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space[4], paddingVertical: space[3], minHeight: 44, alignItems: 'center' },
  privacy: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: space[2], minHeight: 44 },
});
