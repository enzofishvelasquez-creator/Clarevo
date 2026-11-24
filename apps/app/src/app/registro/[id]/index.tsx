import {
  BUSINESS_WORDS,
  BUSINESS_TEXT,
  CARDS_TEXT,
  businessErrorText,
  canMoveRecord,
  isChoosableExpenseCategory,
  isWithdrawal,
  ERROR_TEXT,
  NOTA_FLOW_TEXT,
  NEXT_MONTH_TEXT,
  NOTA_TEXT,
  NO_CATEGORY_LABEL,
  ACCOUNTS_TEXT,
  RECORD_TEXT,
  RECORD_LINK_TEXT,
  accountDisplayName,
  commitmentLinkLabel,
  invoiceLinkLabel,
  recordLinkErrorText,
  addMonths,
  deviceTimeZone,
  firstMonthBounds,
  formatDateTimeBR,
  formatBRL,
  formatDateBR,
  formatMonthBR,
  isRepoError,
  monthOf,
  newOperationKey,
  recordMonth,
  type FinancialRecord,
  type IsoDate,
} from '@clarevo/core';
import { router, useLocalSearchParams } from 'expo-router';
import { AlertCircle, ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Check, HandCoins, Pencil, Plus, Repeat, ShieldCheck, Trash2 } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ConfirmDialog } from '@/components/dialog';
import { ExtraIncomeAsk } from '@/components/extra-income-ask';
import { ContextPill, SubHeader } from '@/components/header';
import { MoneyTxt } from '@/components/money-text';
import { ErrorState } from '@/components/states';
import { FlashBanner, useFlash } from '@/components/flash';
import { Banner, Button, Card, FitMoney, Screen, Skeleton, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { totalChange } from '@/lib/highlight';
import { invoiceHref } from '@/lib/cards';
import { openOfficialUrl, receiptLinks } from '@/lib/receipt-link';
import { openSummary } from '@/lib/nav';
import { useAccounts, useCards, useCommitment, useDeleteRecord, useInvestment, useRecord, useRecordLinks, useWork, useView } from '@/state/data';
import { useAuthorship } from '@/components/family-parts';
import { kindLabel } from '@/components/record-row';
import { useBusiness, useDeleteWithdrawal } from '@/state/business';
import { useSession } from '@/state/session';
import { colors, fonts, radius, space } from '@/theme/tokens';

/**
 * "Tornar gasto fixo": abre o cadastro de gasto fixo com descrição, valor, categoria, o dia do gasto e o início no mês
 * seguinte (dentro do intervalo aceito; o mês atual, se o seguinte já ficou para trás). O gasto anotado não muda.
 */
function openAsSeries(r: FinancialRecord, today: IsoDate) {
  const { min, max } = firstMonthBounds(today);
  const next = addMonths(monthOf(r.occurredOn), 1);
  const inicio = next < min ? monthOf(today) : next > max ? max : next;
  router.push({
    pathname: '/gastos-fixos/novo',
    params: {
      tipo: 'mensal',
      descricao: r.description,
      valor: String(r.amountCents),
      dia: String(Number(r.occurredOn.slice(8, 10))),
      inicio,
      gasto: r.occurredOn,
      ...(isChoosableExpenseCategory(r.category) ? { categoria: r.category } : {}),
    },
  });
}

/** Detalhe do registro (CL C002/C003): data, contexto, conta, valor, situação e período afetado. */
export default function DetalheRegistro() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const record = useRecord(id);
  const personal = useWork().data;
  const view = useView();
  const { user, today } = useSession();
  const remove = useDeleteRecord();
  const [notice] = useFlash();
  /** Acabou de salvar (o aviso pode trazer linhas depois da primeira: orçamento, D-089 E; mês seguinte, D-089 A). */
  const justSaved = notice?.split('\n')[0] === RECORD_TEXT.saved('despesa') || notice?.split('\n')[0] === RECORD_TEXT.saved('receita');
  const [confirming, setConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteKey = useRef(newOperationKey());
  // D-107: o que o gasto pagou (a conta ou a fatura) e de qual investimento é o rendimento, pelo nome.
  const links = useRecordLinks();
  const [unlinking, setUnlinking] = useState(false);
  const [unlinkBusy, setUnlinkBusy] = useState(false);
  const [unlinked, setUnlinked] = useState(false);
  const unlinkKey = useRef(newOperationKey());
  // Espaço Negócio (D-113): a retirada (os dois lados juntos) e o mover entre o Pessoal e o negócio.
  const business = useBusiness().data;
  const removeWithdrawal = useDeleteWithdrawal();
  const [confirmingWithdrawal, setConfirmingWithdrawal] = useState(false);
  const withdrawalKey = useRef(newOperationKey());

  const toList = () => (router.canGoBack() ? router.back() : router.replace('/movimentacoes'));

  const r = record.data;
  const by = useAuthorship(r?.contextId ?? '', r?.createdBy ?? '');
  // Conta de origem (D-043): também a arquivada de um registro antigo ("Carteira (arquivada)").
  const accounts = useAccounts(r?.contextId);
  const accountList = accounts.data ?? personal?.accounts ?? [];
  const accountName = accountDisplayName(accountList, r?.accountId);
  const paidBill = useCommitment(r?.commitmentId ?? undefined);
  const cards = useCards(r?.invoice ? r.contextId : undefined);
  const investment = useInvestment(r?.investmentId ?? undefined);
  const paidLabel = r?.invoice
    ? invoiceLinkLabel(cards.data?.find((c) => c.id === r.invoice!.cardId)?.name ?? RECORD_LINK_TEXT.cardFallback, r.invoice.month, today)
    : paidBill.data
      ? commitmentLinkLabel(paidBill.data)
      : null;

  const withdrawal = r ? isWithdrawal(r) : false;
  // Também o vocabulário: no espaço Negócio, "Saída" e "Entrada" (auditoria de 18/11/2026).
  const inBusiness = Boolean(business && r && r.contextId === business.id);
  const inPersonal = Boolean(personal && r && r.contextId === personal.personalContextId);
  // Mover (D-113): o lançamento comum, entre o Pessoal e o negócio da pessoa, para quem anotou no lugar errado.
  // Quem só vê o negócio (leitor, D-116 e D-120) não encontra editar, excluir, mover nem tornar gasto fixo: o banco recusaria.
  const readOnly = inBusiness && business?.role === 'leitor';
  const movable = Boolean(r && business && (inBusiness || inPersonal) && canMoveRecord(r) && (personal?.canWrite ?? true) && !readOnly);

  /** "Desligar da fatura" (D-107): o gasto que foi ligado depois continua, e a fatura volta a ficar em aberto. */
  const doUnlinkInvoice = async () => {
    if (!r?.invoice || !paidBill.data) return;
    setUnlinkBusy(true);
    setDeleteError(null);
    try {
      await links.unlinkInvoice(unlinkKey.current, r.invoice.cardId, r.invoice.month, paidBill.data.version);
      unlinkKey.current = newOperationKey();
      setUnlinking(false);
      setUnlinked(true);
      record.refetch();
    } catch (e) {
      setUnlinking(false);
      if (isRepoError(e) && e.code !== 'rede' && e.code !== 'desconhecido') {
        unlinkKey.current = newOperationKey();
        setDeleteError(recordLinkErrorText(e.code));
        paidBill.refetch();
      } else setDeleteError(RECORD_LINK_TEXT.unlinkUncertain);
    } finally {
      setUnlinkBusy(false);
    }
  };

  /** Excluir a retirada (D-113): os dois lados, no negócio e no Pessoal, saem juntos. */
  const doDeleteWithdrawal = async () => {
    if (!r) return;
    setDeleteError(null);
    try {
      await removeWithdrawal.mutateAsync({ key: withdrawalKey.current, recordId: r.id, version: r.version });
      setConfirmingWithdrawal(false);
      flash.set(BUSINESS_TEXT.withdrawalDeleted);
      // Os dois lados saíram: o detalhe do outro lado, se ficou na pilha, também não existe mais.
      router.replace('/movimentacoes');
    } catch (e) {
      setConfirmingWithdrawal(false);
      if (isRepoError(e) && e.code !== 'rede' && e.code !== 'desconhecido') {
        withdrawalKey.current = newOperationKey();
        setDeleteError(businessErrorText(e.code));
        record.refetch();
      } else setDeleteError(businessErrorText('rede'));
    }
  };

  const doDelete = async () => {
    if (!r) return;
    setDeleteError(null);
    try {
      await remove.mutateAsync({ key: deleteKey.current, id: r.id, version: r.version });
      setConfirming(false);
      // Excluir o gasto de uma conta a pagar reabre a conta na mesma operação do banco (D-021, regra 2).
      flash.set(r.commitmentId ? RECORD_TEXT.removedReopened : RECORD_TEXT.removed(r.kind));
      totalChange.set({ total: r.kind === 'despesa' ? 'pago' : 'recebido', month: recordMonth(r), deltaCents: -r.amountCents });
      toList();
    } catch (e) {
      setConfirming(false);
      if (isRepoError(e, 'versao_desatualizada')) {
        deleteKey.current = newOperationKey();
        setDeleteError(`${ERROR_TEXT.versao_desatualizada} O registro foi mantido.`);
        record.refetch();
      } else if (isRepoError(e, 'nao_encontrado')) setDeleteError(ERROR_TEXT.nao_encontrado);
      else setDeleteError('Não foi possível excluir. O registro foi mantido. Tente de novo.');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={r ? (inBusiness ? kindLabel(r, true) : r.kind === 'despesa' ? 'Gasto' : 'Recebimento') : 'Registro'} onBack={toList} right={r ? <ContextPill label={by.contextName} fixed /> : <ContextPill label="Pessoal" />} />
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
              <Button label="Ir para Movimentos" onPress={() => router.replace('/movimentacoes')} />
            </Card>
          ) : (
            <>
              <FlashBanner message={unlinked ? null : notice} />
              {/* Logo depois de salvar (docs/10 A3): o próximo passo à vista, antes do card. "Ver resumo do mês" é o botão principal e
                  "Anotar outro" vem logo abaixo; o aviso pode trazer linhas depois da primeira (orçamento, D-089 E; mês seguinte, D-089 A). */}
              {justSaved ? (
                <View style={{ gap: space[3] }}>
                  <Button
                    label="Ver resumo do mês"
                    onPress={() => {
                      view.setMonth(recordMonth(r));
                      openSummary();
                    }}
                  />
                  <Button
                    label={r.kind === 'despesa' ? 'Anotar outro gasto' : 'Registrar outro recebimento'}
                    icon={Plus}
                    tone="soft"
                    onPress={() => router.replace({ pathname: '/registro/novo', params: { tipo: r.kind } })}
                  />
                </View>
              ) : null}
              {/* "Separar parte para uma meta?" (D-105): só logo depois de salvar um recebimento que não é o de sempre. */}
              {justSaved && !inBusiness ? <ExtraIncomeAsk record={r} canWrite={personal?.canWrite ?? true} /> : null}
              {unlinked ? (
                <Banner tone="sucesso" icon={Check}>
                  <Txt variant="label" color={colors.successText}>
                    {RECORD_LINK_TEXT.unlinkedInvoice}
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
                  {r.kind === 'despesa' ? <ArrowUpRight size={16} color={colors.brandText} /> : <ArrowDownLeft size={16} color={colors.successText} />}
                  <Txt variant="label" color={r.kind === 'despesa' ? colors.brandText : colors.successText} style={{ fontFamily: fonts.bold }}>
                    {inBusiness ? kindLabel(r, true) : r.kind === 'despesa' ? 'Gasto pago' : 'Recebido'}
                  </Txt>
                </View>
                <Txt variant="title" style={{ fontSize: 24, lineHeight: 32 }} accessibilityRole="header" aria-level={2}>
                  {r.description}
                </Txt>
                <FitMoney cents={r.amountCents} />
                <View>
                  <Row label="Espaço" value={by.contextName} />
                  <Row
                    label={r.kind === 'despesa' ? ACCOUNTS_TEXT.out : ACCOUNTS_TEXT.into}
                    value={accountName}
                  />
                  <Row label="Data" value={formatDateBR(r.occurredOn)} />
                  <Row label="Categoria" value={r.category ?? NO_CATEGORY_LABEL} />
                  {r.subcategory ? <Row label={RECORD_LINK_TEXT.subcategoryRow} value={r.subcategory} /> : null}
                  {r.invoice ? <Row label="Origem" value={CARDS_TEXT.paymentOrigin} /> : null}
                  {r.commitmentId ? <Row label={RECORD_LINK_TEXT.linkedRow} value={paidLabel ?? RECORD_LINK_TEXT.paidFallback} /> : null}
                  {r.investmentId ? <Row label={RECORD_LINK_TEXT.incomeRow} value={investment.data?.name ?? RECORD_LINK_TEXT.incomeFallback} /> : null}
                  {r.receiptKey ? <Row label={NOTA_FLOW_TEXT.detailRow} value={NOTA_FLOW_TEXT.detailRowValue} /> : null}
                  {/* Recebimento marcado do mês seguinte (D-089 A): conta no mês seguinte ao da data. */}
                  <Row label={RECORD_TEXT.monthRow} value={`${formatMonthBR(recordMonth(r))}${r.nextMonth ? NEXT_MONTH_TEXT.detailSuffix : ''}`} last />
                </View>
                <View style={styles.trail} accessible>
                  <Txt variant="caption" color={colors.textSecondary}>
                    Anotado por {by.by} em {formatDateTimeBR(r.createdAt, deviceTimeZone())}
                  </Txt>
                  {r.version > 1 ? (
                    <Txt variant="caption" color={colors.textSecondary}>
                      Última alteração em {formatDateTimeBR(r.updatedAt, deviceTimeZone())}
                    </Txt>
                  ) : null}
                </View>
              </Card>

              {/* Nota fiscal lida (D-038): o endereço da Sefaz só vale na sessão em que a nota foi lida; o registro guarda só o resumo da chave. */}
              {r.receiptKey ? (
                receiptLinks.get(r.receiptKey) ? (
                  <Button
                    label={NOTA_TEXT.viewOnSefaz}
                    tone="soft"
                    onPress={() => {
                      const url = receiptLinks.get(r.receiptKey);
                      if (url) openOfficialUrl(url).then((ok) => ok || setDeleteError(NOTA_FLOW_TEXT.openFailed));
                    }}
                  />
                ) : (
                  <Txt variant="caption" color={colors.textSecondary}>
                    {NOTA_FLOW_TEXT.detailNoLink}
                  </Txt>
                )
              ) : null}

              {/* Pagamento de fatura (D-037): só se muda ou se desfaz pela fatura. O gasto anotado antes e ligado depois (D-107) também
                  pode ser desligado aqui, e continua. */}
              {r.invoice ? (
                <>
                  <Txt variant="label" color={colors.textSecondary}>
                    {r.linkedPayment ? RECORD_LINK_TEXT.linkedInvoiceDetail : CARDS_TEXT.screens.paymentRecordNote}
                  </Txt>
                  <Button label={CARDS_TEXT.openInvoice} onPress={() => router.push(invoiceHref(r.invoice!.cardId, r.invoice!.month))} />
                  {r.linkedPayment ? (
                    <Button label={RECORD_LINK_TEXT.unlinkInvoice} tone="soft" disabled={!paidBill.data} onPress={() => setUnlinking(true)} />
                  ) : null}
                </>
              ) : withdrawal ? (
                // Retirada para o Pessoal (D-113): ligada nos dois espaços; muda só excluindo e anotando de novo.
                <>
                  <Banner tone="info" icon={HandCoins}>
                    <Txt variant="label">
                      {r.kind === 'despesa' ? BUSINESS_TEXT.withdrawalBusinessNote : BUSINESS_TEXT.withdrawalPersonalNote(business?.name ?? null)}
                    </Txt>
                  </Banner>
                  <Txt variant="caption" color={colors.textSecondary}>
                    {BUSINESS_TEXT.withdrawalLocked}
                  </Txt>
                  <Button
                    label={BUSINESS_TEXT.seeOtherSide(r.kind === 'despesa' ? 'Pessoal' : (business?.name ?? BUSINESS_TEXT.context))}
                    tone="soft"
                    onPress={() => router.push(`/registro/${r.pairedRecordId}`)}
                  />
                </>
              ) : readOnly ? null : (
                <Button label={inBusiness ? (r.kind === 'despesa' ? BUSINESS_WORDS.editOut : BUSINESS_WORDS.editIn) : RECORD_TEXT.edit(r.kind)} icon={Pencil} tone={justSaved ? 'soft' : 'brand'} onPress={() => router.push(`/registro/${r.id}/editar`)} />
              )}
              {movable ? (
                <Button
                  label={inBusiness ? BUSINESS_TEXT.moveToPersonal : BUSINESS_TEXT.moveToBusiness}
                  icon={ArrowLeftRight}
                  tone="soft"
                  onPress={() => router.push(`/registro/${r.id}/mover`)}
                />
              ) : null}
              {/* Gasto anotado sem conta a pagar: pode virar um gasto fixo, que começa no próximo vencimento. */}
              {r.kind === 'despesa' && !r.commitmentId && !r.invoice && !withdrawal && !readOnly ? (
                <Button label="Tornar gasto fixo" icon={Repeat} tone="soft" onPress={() => openAsSeries(r, today)} />
              ) : null}
              {r.commitmentId && !r.invoice ? (
                <Button label="Ver conta a pagar" tone="soft" onPress={() => router.push(`/a-pagar/${r.commitmentId}`)} />
              ) : null}
              {r.investmentId ? (
                <Button label={RECORD_LINK_TEXT.seeInvestment} tone="soft" onPress={() => router.push(`/investimento/${r.investmentId}`)} />
              ) : null}
              {justSaved ? null : (
                <Button
                  label="Ver resumo do mês"
                  tone="soft"
                  onPress={() => {
                    view.setMonth(recordMonth(r));
                    openSummary();
                  }}
                />
              )}
              {r.invoice || readOnly ? null : withdrawal ? (
                <Button label={BUSINESS_TEXT.deleteWithdrawal} icon={Trash2} tone="danger" onPress={() => setConfirmingWithdrawal(true)} />
              ) : (
                <Button label={RECORD_TEXT.remove(r.kind)} icon={Trash2} tone="danger" onPress={() => setConfirming(true)} />
              )}
              <Pressable accessibilityRole="button" onPress={() => router.push('/quem-ve')} style={styles.privacy}>
                <ShieldCheck size={18} color={colors.textSecondary} />
                <Txt variant="label" color={colors.textSecondary}>
                  Quem vê estes dados?
                </Txt>
              </Pressable>

              <ConfirmDialog
                visible={unlinking}
                title={RECORD_LINK_TEXT.unlinkInvoiceTitle}
                cancelLabel="Cancelar"
                confirmLabel={RECORD_LINK_TEXT.unlinkInvoice}
                busy={unlinkBusy}
                onCancel={() => setUnlinking(false)}
                onConfirm={doUnlinkInvoice}>
                <Txt color={colors.textSecondary}>{RECORD_LINK_TEXT.unlinkInvoiceBody}</Txt>
              </ConfirmDialog>

              <ConfirmDialog
                visible={confirmingWithdrawal}
                title={BUSINESS_TEXT.deleteWithdrawalTitle}
                cancelLabel="Cancelar"
                confirmLabel={BUSINESS_TEXT.deleteWithdrawal}
                busy={removeWithdrawal.isPending}
                onCancel={() => setConfirmingWithdrawal(false)}
                onConfirm={doDeleteWithdrawal}>
                <MoneyTxt style={{ fontFamily: fonts.bold }}>{`${r.description} · ${formatBRL(r.amountCents)}`}</MoneyTxt>
                <Txt color={colors.textSecondary}>{BUSINESS_TEXT.deleteWithdrawalBody}</Txt>
              </ConfirmDialog>

              <ConfirmDialog
                visible={confirming}
                title={RECORD_TEXT.removeTitle(r.kind)}
                cancelLabel="Cancelar"
                confirmLabel={RECORD_TEXT.remove(r.kind)}
                busy={remove.isPending}
                onCancel={() => setConfirming(false)}
                onConfirm={doDelete}>
                <MoneyTxt style={{ fontFamily: fonts.bold }}>{`${r.description} · ${formatBRL(r.amountCents)} · ${by.contextName}`}</MoneyTxt>
                <Txt color={colors.textSecondary}>O valor deixa de contar no resumo de {formatMonthBR(recordMonth(r)).toLowerCase()}.</Txt>
                {r.commitmentId ? <Txt color={colors.textSecondary}>A conta a pagar ligada a este gasto volta para Ainda a pagar.</Txt> : null}
                {r.investmentId ? <Txt color={colors.textSecondary}>{RECORD_LINK_TEXT.incomeRemovedOnDelete}</Txt> : null}
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
