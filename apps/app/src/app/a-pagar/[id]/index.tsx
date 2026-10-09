import {
  CALC_UI_TEXT,
  COMMITMENT_ERROR_TEXT,
  ERROR_TEXT,
  NO_CATEGORY_LABEL,
  addMonths,
  affectedByYear,
  annualYearLabelOf,
  annualYearErrorText,
  commitmentSituation,
  deviceTimeZone,
  dueText,
  findNextMonthCommitment,
  firstMonthBounds,
  formatBRL,
  formatDateBR,
  formatDateTimeBR,
  formatMonthBR,
  formatMonthName,
  isRepoError,
  mergeOccurrences,
  monthOf,
  multaLink,
  newOperationKey,
  nextMonthPrefill,
  occurrenceLabel,
  termFor,
  type Commitment,
  type IsoDate,
  type IsoMonth,
  type YearPlan,
} from '@clarevo/core';
import { router, useLocalSearchParams } from 'expo-router';
import { AlertCircle, Calculator, CalendarSync, Check, Info, Pencil, Plus, Repeat, ShieldCheck, Trash2, Undo2 } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { openCalc } from '@/components/calc/open';
import { ChoiceDialog } from '@/components/choice-dialog';
import { bySeries, ofSeries, SERIES_NOUN, yearA11yLabel } from '@/components/series-parts';
import { SITUATION_LOOK } from '@/components/commitment-row';
import { ConfirmDialog } from '@/components/dialog';
import { FlashBanner, useFlash } from '@/components/flash';
import { ContextPill, SubHeader } from '@/components/header';
import { ErrorState } from '@/components/states';
import { Banner, Button, Card, FitMoney, LinkButton, Screen, Skeleton, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { openSummary } from '@/lib/nav';
import { totalChange } from '@/lib/highlight';
import {
  useCommitment,
  useCommitments,
  useDeleteCommitment,
  useSeries,
  useSeriesOccurrences,
  useSeriesOpenOccurrences,
  useSeriesOperationKey,
  useSkipSeriesYear,
  useSpace,
  useUndoCommitmentPayment,
  useView,
} from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, radius, space } from '@/theme/tokens';

const textFor = (code: string) =>
  code in COMMITMENT_ERROR_TEXT ? COMMITMENT_ERROR_TEXT[code as keyof typeof COMMITMENT_ERROR_TEXT] : COMMITMENT_ERROR_TEXT.salvar_falhou;

/** "novembro" no ano de hoje; "janeiro de 2027" em outro ano. */
const monthWord = (dueOn: IsoDate, today: IsoDate) => `${formatMonthName(monthOf(dueOn))}${dueOn.slice(0, 4) === today.slice(0, 4) ? '' : ` de ${dueOn.slice(0, 4)}`}`;

/** Conta do ano: posição da conta no ano (1 a k). */
const partOfYear = (c: Commitment) => ((c.series!.number - 1) % (c.series!.partsPerYear ?? 1)) + 1;

/**
 * Primeiro mês de um gasto fixo criado a partir de uma conta paga ("Repetir todo mês"): o mês seguinte ao vencimento,
 * dentro do intervalo aceito pelo cadastro (o mês atual, se o seguinte já ficou para trás).
 */
function startAfter(date: IsoDate, today: IsoDate): IsoMonth {
  const next = addMonths(monthOf(date), 1);
  const { min, max } = firstMonthBounds(today);
  return next < min ? monthOf(today) : next > max ? max : next;
}

/**
 * Detalhe da conta a pagar: situação, vencimento, efeito no resumo e as ações permitidas em cada estado (D-021).
 * Conta de gasto fixo (D-024): mostra de qual série faz parte, "Só esta conta" ou "esta e as próximas" ao editar,
 * "Excluir só a conta de novembro" (não volta a ser criada) e, se estimada, "Informar o valor da conta".
 * Conta do ano (D-029): "Parte de: IPTU · parcela 3 de 10 de 2027", "Informar o valor de 2027" e, com parcelas,
 * "Excluir só esta parcela" ou "Tirar todas as parcelas de 2027 em aberto".
 * "Adicionar a conta do próximo mês", "Repetir todo mês" e "Repetir todo ano" só em conta avulsa paga.
 */
export default function DetalheContaAPagar() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const commitment = useCommitment(id);
  const personal = useSpace().data;
  const view = useView();
  const { user, today } = useSession();
  const remove = useDeleteCommitment();
  const undo = useUndoCommitmentPayment();
  const [notice, setNotice] = useFlash();
  const [confirming, setConfirming] = useState<null | 'excluir' | 'desfazer' | 'editar' | 'excluir-escolha' | 'tirar'>(null);
  /** "Tirar todas as parcelas de 2027 em aberto" em andamento, inclusive a conferência de uma tentativa anterior. */
  const [skipping, setSkipping] = useState(false);
  const skip = useSkipSeriesYear();
  const skipKeys = useSeriesOperationKey();
  /**
   * Tirar com resultado incerto: o plano enviado (para a faixa de sucesso) e o botão "Tentar novamente" na faixa de erro.
   * O botão não depende do plano atual: se a escrita foi gravada, as listas recarregadas já não têm parcelas do ano em
   * aberto, e o diálogo de confirmação some.
   */
  const skipAttempt = useRef<Extract<YearPlan, { ok: true }> | null>(null);
  /** Texto da faixa de resultado incerto, com "Tentar novamente" (null: nada pendente). */
  const [skipFailed, setSkipFailed] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const deleteKey = useRef(newOperationKey());
  const undoKey = useRef(newOperationKey());
  /** Versão a que a chave do desfazer se refere: outra versão (por exemplo, paga de novo) é outra operação. */
  const undoFor = useRef<number | null>(null);

  const toList = () => (router.canGoBack() ? router.back() : router.replace('/a-pagar'));

  const c = commitment.data;
  const situation = c ? commitmentSituation(c, today) : null;
  const paid = c?.status === 'quitado' ? c.payment : null;
  const ref = c?.series ?? null;
  const series = useSeries(ref?.id, c?.contextId);
  const annual = ref?.kind === 'anual' ? { k: ref.partsPerYear ?? 1, label: annualYearLabelOf(c!)!, part: partOfYear(c!) } : null;
  // Conta do ano com parcelas em aberto: as listas completas da série, para "Tirar todas as parcelas de 2027 em aberto".
  const yearLists = annual && annual.k > 1 && c?.status === 'aberto';
  const seriesOcc = useSeriesOccurrences(yearLists ? ref!.id : undefined, c?.contextId);
  const seriesOpen = useSeriesOpenOccurrences(yearLists ? ref!.id : undefined, c?.contextId);
  const yearPlan =
    yearLists && series.data && seriesOcc.data && seriesOpen.data
      ? affectedByYear(mergeOccurrences(seriesOcc.data, seriesOpen.data), series.data, ref!.number, 'tirar')
      : null;
  // Mês da conta ("novembro", "janeiro de 2027"); na conta do ano, "2027" (cota única) ou "parcela 3 de 2027".
  const occurrenceWord = !c || !ref ? '' : annual ? (annual.k === 1 ? annual.label : `parcela ${annual.part} de ${annual.label}`) : monthWord(c.dueOn, today);

  const doDelete = async () => {
    if (!c) return;
    setActionError(null);
    try {
      await remove.mutateAsync({ key: deleteKey.current, id: c.id, version: c.version });
      deleteKey.current = newOperationKey();
      setConfirming(null);
      flash.set(
        !ref
          ? 'Conta a pagar excluída'
          : annual
            ? annual.k === 1
              ? `Conta de ${annual.label} excluída. A conta do ano continua nos outros anos.`
              : `Parcela ${annual.part} de ${annual.label} excluída. A conta do ano continua nas outras parcelas.`
            : `Conta de ${occurrenceWord} excluída. O ${seriesNoun} continua nos outros meses.`,
      );
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
    // Repetir depois de uma falha de rede usa a mesma chave; outra versão da conta pede chave nova.
    if (undoFor.current !== c.version) {
      undoKey.current = newOperationKey();
      undoFor.current = c.version;
    }
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

  /**
   * "Tirar todas as parcelas de 2027 em aberto" (skip_series_year): saem de uma vez e não voltam. Resultado incerto (rede):
   * confere na hora com findSeriesOperation se a escrita foi gravada; se a conferência também falhar, "Tentar novamente"
   * confere de novo antes de repetir, e a repetição usa a mesma chave.
   */
  const doSkip = async () => {
    const current = yearPlan?.ok ? yearPlan : null;
    if (!c || !ref || skipping || (!current && !skipKeys.hasPending())) return;
    const label = current?.year.label ?? skipAttempt.current?.year.label ?? annual?.label ?? '';
    setActionError(null);
    setSkipping(true);
    const failed = `Não foi possível tirar as parcelas de ${label}. Tente novamente.`;
    const done = (text: string) => {
      skipKeys.settled();
      skipAttempt.current = null;
      setSkipFailed(null);
      setConfirming(null);
      flash.set(text);
      toList();
    };
    const reloadAll = () => {
      commitment.refetch();
      seriesOcc.refetch();
      seriesOpen.refetch();
    };
    try {
      if (skipKeys.hasPending()) {
        const saved = await skipKeys.findSaved();
        if (saved?.action === 'tirar_ano') {
          done(skipAttempt.current?.doneText ?? current?.doneText ?? `As parcelas de ${label} saíram de Contas a pagar.`);
          return;
        }
        if (!yearPlan && yearLists) {
          // Nada foi gravado, mas as listas do ano ainda não voltaram: conferir de novo depois que carregarem.
          reloadAll();
          setSkipFailed(failed);
          return;
        }
        if (!current) {
          // Nada foi gravado, e as parcelas do ano em aberto mudaram (pagas ou tiradas em outro aparelho): nada a repetir.
          skipKeys.settled();
          skipAttempt.current = null;
          setSkipFailed(null);
          setConfirming(null);
          setActionError(annualYearErrorText('versao_desatualizada', label));
          reloadAll();
          return;
        }
      }
      if (!current) return;
      const plan = current;
      const snapshot = JSON.stringify([ref.id, ref.number, plan.affected]);
      const key = skipKeys.keyFor(snapshot);
      try {
        await skip.mutateAsync({ key, seriesId: ref.id, number: ref.number, affected: plan.affected });
        done(plan.doneText);
      } catch (e) {
        setConfirming(null);
        if (isRepoError(e) && e.code !== 'rede' && e.code !== 'desconhecido') {
          skipKeys.refused();
          skipAttempt.current = null;
          setSkipFailed(null);
          setActionError(annualYearErrorText(e.code, plan.year.label));
          reloadAll();
          return;
        }
        skipKeys.uncertain(key, snapshot);
        skipAttempt.current = plan;
        // Conferir já: se foi gravada, esta parcela já saiu de Contas a pagar.
        try {
          const saved = await skipKeys.findSaved();
          if (saved?.action === 'tirar_ano') {
            done(plan.doneText);
            return;
          }
        } catch {
          // A conferência também falhou: recarregar para não mostrar como aberta uma parcela que pode já ter saído.
          // "Tentar novamente" confere de novo antes de repetir.
          reloadAll();
        }
        setSkipFailed(failed);
      }
    } catch {
      setConfirming(null);
      if (skipKeys.hasPending()) setSkipFailed(failed);
      else setActionError(failed);
    } finally {
      setSkipping(false);
    }
  };

  const showSummary = () => {
    if (!c) return;
    // Paga: o mês da data do pagamento. Em aberto: o mês do vencimento, ou o corrente se ela ainda vai vencer depois dele.
    const target = paid ? monthOf(paid.paidOn) : monthOf(c.dueOn) < view.currentMonth ? monthOf(c.dueOn) : view.currentMonth;
    view.setMonth(target);
    view.setSpace('pessoal');
    openSummary();
  };

  const affected = !c
    ? ''
    : paid
      ? `Pago de ${formatMonthBR(monthOf(paid.paidOn)).toLowerCase()}`
      : monthOf(c.dueOn) < view.currentMonth
        ? `Ainda a pagar de ${formatMonthBR(view.currentMonth).toLowerCase()}, como vencida`
        : `Ainda a pagar de ${formatMonthBR(monthOf(c.dueOn)).toLowerCase()}`;
  const look = situation ? SITUATION_LOOK[situation] : null;

  // "Parte de: Aluguel · todo mês, dia 5", "Parcela 13 de 48 de Financiamento do carro" ou, na conta do ano, "Parte de:
  // IPTU · parcela 3 de 10 de 2027". O nome e o dia vêm da vigência desta conta; enquanto a série carrega, só o rótulo da conta.
  const term = ref && series.data ? termFor(series.data.terms, ref.number) : null;
  const label = c && ref ? occurrenceLabel(c) : null;
  const partOf = !ref
    ? null
    : ref.kind === 'parcelada'
      ? term
        ? `${label} de ${term.description}`
        : label
      : ref.kind === 'anual'
        ? term
          ? `Parte de: ${term.description} · ${label!.charAt(0).toLowerCase()}${label!.slice(1)}`
          : `Parte de uma conta do ano · ${label!.charAt(0).toLowerCase()}${label!.slice(1)}`
        : term
          ? `Parte de: ${term.description} · todo mês, dia ${term.dueDay}`
          : 'Parte de um gasto fixo · todo mês';
  const seriesNoun = SERIES_NOUN[ref?.kind ?? 'mensal'];
  const estimateOpen = Boolean(c && !paid && c.amountIsEstimate);
  // Conta vencida em aberto: "Calcular multa e juros", com o valor e os dias depois do vencimento (D-034).
  const lateCalc = c ? multaLink(c, today) : null;

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
                  <Txt variant="label" color={colors.error} accessibilityLabel={yearA11yLabel(actionError)}>
                    {actionError}
                  </Txt>
                </Banner>
              ) : null}
              {skipFailed ? (
                <Banner tone="erro" icon={AlertCircle}>
                  <Txt variant="label" color={colors.error} accessibilityLabel={yearA11yLabel(skipFailed)}>
                    {skipFailed}
                  </Txt>
                  <Button label="Tentar novamente" tone="soft" busy={skipping} busyLabel="Aguarde…" onPress={doSkip} />
                </Banner>
              ) : null}

              <Card style={{ gap: space[3] }}>
                <View style={[styles.badge, { backgroundColor: look.bg }]}>
                  <look.Icon size={16} color={look.fg} />
                  <Txt variant="label" color={look.fg} style={{ fontFamily: fonts.bold }}>
                    {look.label}
                  </Txt>
                </View>
                <Txt variant="title" style={{ fontSize: 24, lineHeight: 32 }} accessibilityRole="header" aria-level={2}>
                  {c.description}
                </Txt>
                <FitMoney cents={paid ? paid.amountCents : c.amountCents} />
                {estimateOpen ? (
                  <Txt variant="label" color={colors.textSecondary}>
                    Valor estimado
                  </Txt>
                ) : null}
                <Txt variant="label" color={situation === 'vencida' ? colors.error : colors.textSecondary}>
                  {dueText(c, today)}
                </Txt>
                {lateCalc ? (
                  <LinkButton
                    label={CALC_UI_TEXT.links.multa}
                    icon={Calculator}
                    style={styles.inlineLink}
                    onPress={() => openCalc('multa-e-juros', lateCalc)}
                  />
                ) : null}
                {ref ? (
                  <View style={{ gap: space[1] }}>
                    <Txt variant="label" accessibilityLabel={partOf ? yearA11yLabel(partOf) : undefined}>
                      {partOf}
                    </Txt>
                    <LinkButton
                      label={`Ver ${seriesNoun}`}
                      style={styles.inlineLink}
                      onPress={() => router.push(`/gastos-fixos/${ref.id}`)}
                    />
                    {c.seriesOverride ? (
                      <Txt variant="label" color={colors.textSecondary}>
                        {annual ? 'Valor informado ou alterado só nesta conta.' : 'Alterada só neste mês.'}
                      </Txt>
                    ) : null}
                  </View>
                ) : null}
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
                    {ref
                      ? `Criada ${bySeries(ref.kind)} em ${formatDateTimeBR(c.createdAt, deviceTimeZone())}`
                      : `Anotada por ${c.createdBy === user?.id ? 'você' : 'outra pessoa da família'} em ${formatDateTimeBR(c.createdAt, deviceTimeZone())}`}
                  </Txt>
                  {c.version > 1 ? (
                    <Txt variant="caption" color={colors.textSecondary}>
                      Última alteração em {formatDateTimeBR(c.updatedAt, deviceTimeZone())}
                    </Txt>
                  ) : null}
                </View>
              </Card>

              {estimateOpen && annual && ref ? (
                <Banner tone="info" icon={Info} live={false}>
                  <Txt variant="label">Valor estimado pela referência da conta do ano. Quando o carnê ou o boleto chegar, informe o valor.</Txt>
                  <Button
                    label={`Informar o valor de ${annual.label}`}
                    accessibilityLabel={yearA11yLabel(`Informar o valor de ${annual.label}`)}
                    tone="soft"
                    onPress={() => router.push({ pathname: '/gastos-fixos/[id]/informar', params: { id: ref.id, numero: String(ref.number) } })}
                  />
                </Banner>
              ) : estimateOpen ? (
                <Banner tone="info" icon={Info} live={false}>
                  <Txt variant="label">Valor estimado pela referência {ref ? ofSeries(ref.kind) : 'do gasto fixo'}. Quando a conta chegar, informe o valor.</Txt>
                  <Button
                    label="Informar o valor da conta"
                    tone="soft"
                    onPress={() => router.push({ pathname: '/a-pagar/[id]/editar', params: { id: c.id, informar: '1' } })}
                  />
                </Banner>
              ) : null}

              {paid ? (
                <>
                  <Button label="Ver gasto registrado" tone="soft" onPress={() => router.push(`/registro/${paid.recordId}`)} />
                  <Button label="Desfazer pagamento" icon={Undo2} tone="danger" onPress={() => setConfirming('desfazer')} />
                  {/* Conta de gasto fixo: a do próximo mês é criada pela série (D-024, regra 10). */}
                  {ref ? null : (
                    <>
                      <NextMonth commitment={c} />
                      <Button
                        label="Repetir todo mês"
                        icon={Repeat}
                        tone="soft"
                        onPress={() =>
                          router.push({
                            pathname: '/gastos-fixos/novo',
                            params: {
                              tipo: 'mensal',
                              descricao: c.description,
                              valor: String(c.amountCents),
                              dia: String(Number(c.dueOn.slice(8, 10))),
                              inicio: startAfter(c.dueOn, today),
                              ...(c.category ? { categoria: c.category } : {}),
                            },
                          })
                        }
                      />
                      {/* Conta do ano a partir do ano seguinte ao vencimento, no mesmo mês e dia (cota única). */}
                      <Button
                        label="Repetir todo ano"
                        icon={CalendarSync}
                        tone="soft"
                        onPress={() =>
                          router.push({
                            pathname: '/gastos-fixos/novo',
                            params: {
                              tipo: 'anual',
                              descricao: c.description,
                              valor: String(c.amountCents),
                              dia: String(Number(c.dueOn.slice(8, 10))),
                              mes: String(Number(c.dueOn.slice(5, 7))),
                              ano: String(Number(c.dueOn.slice(0, 4)) + 1),
                              parcelas: '1',
                              ...(c.category ? { categoria: c.category } : {}),
                            },
                          })
                        }
                      />
                    </>
                  )}
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
                  <Button
                    label="Editar conta a pagar"
                    icon={Pencil}
                    tone="soft"
                    onPress={() => (ref ? setConfirming('editar') : router.push(`/a-pagar/${c.id}/editar`))}
                  />
                  {annual && annual.k > 1 ? (
                    <Button label="Excluir parcela" icon={Trash2} tone="danger" onPress={() => setConfirming('excluir-escolha')} />
                  ) : (
                    <Button
                      label={ref ? `Excluir só a conta de ${occurrenceWord}` : 'Excluir conta a pagar'}
                      icon={Trash2}
                      tone="danger"
                      onPress={() => setConfirming('excluir')}
                    />
                  )}
                </>
              )}
              <Button label="Ver resumo do mês" tone="soft" onPress={showSummary} />
              <Pressable accessibilityRole="button" onPress={() => router.push('/quem-ve')} style={styles.privacy}>
                <ShieldCheck size={18} color={colors.textSecondary} />
                <Txt variant="label" color={colors.textSecondary}>
                  Quem vê estes dados?
                </Txt>
              </Pressable>

              <ConfirmDialog
                visible={confirming === 'excluir'}
                title={ref ? (annual && annual.k > 1 ? `Excluir a ${occurrenceWord}?` : `Excluir a conta de ${occurrenceWord}?`) : 'Excluir conta a pagar?'}
                cancelLabel="Cancelar"
                confirmLabel={ref ? 'Excluir só esta' : 'Excluir conta a pagar'}
                busy={remove.isPending}
                onCancel={() => setConfirming(null)}
                onConfirm={doDelete}>
                <Txt style={{ fontFamily: fonts.bold }}>
                  {c.description} · {formatBRL(c.amountCents)} · vence em {formatDateBR(c.dueOn)} · Pessoal
                </Txt>
                {ref ? (
                  <Txt color={colors.textSecondary}>
                    {annual
                      ? annual.k > 1
                        ? 'A conta do ano continua nas outras parcelas, e esta parcela não volta a ser criada.'
                        : 'A conta do ano continua nos outros anos, e esta conta não volta a ser criada.'
                      : `O ${seriesNoun} continua nos outros meses, e esta conta não volta a ser criada.`}
                  </Txt>
                ) : null}
                <Txt color={colors.textSecondary}>O valor deixa de contar em Ainda a pagar. Recebido, Pago e a diferença do mês não mudam.</Txt>
              </ConfirmDialog>

              {annual && annual.k > 1 && ref && !paid ? (
                <ChoiceDialog
                  visible={confirming === 'excluir-escolha'}
                  title="O que você quer excluir?"
                  onCancel={() => setConfirming(null)}
                  choices={[
                    { label: 'Excluir só esta parcela', onPress: () => setConfirming('excluir') },
                    ...(yearPlan?.ok && yearPlan.changing.length > 1
                      ? [{ label: `Tirar todas as parcelas de ${annual.label} em aberto`, onPress: () => setConfirming('tirar') }]
                      : []),
                  ]}
                />
              ) : null}

              {yearPlan?.ok ? (
                <ConfirmDialog
                  visible={confirming === 'tirar'}
                  title={yearPlan.title}
                  cancelLabel="Cancelar"
                  confirmLabel="Tirar parcelas"
                  busy={skipping || skip.isPending}
                  onCancel={() => setConfirming(null)}
                  onConfirm={doSkip}>
                  <Txt color={colors.textSecondary}>{yearPlan.text}</Txt>
                  <Txt color={colors.textSecondary}>Os valores deixam de contar em Ainda a pagar. Recebido, Pago e a diferença do mês não mudam.</Txt>
                </ConfirmDialog>
              ) : null}

              {ref && !paid ? (
                <ChoiceDialog
                  visible={confirming === 'editar'}
                  title="O que você quer alterar?"
                  onCancel={() => setConfirming(null)}
                  choices={[
                    {
                      label: annual
                        ? annual.k === 1
                          ? `Só a conta de ${annual.label}`
                          : `Só a parcela ${annual.part} de ${annual.label}`
                        : `Só a conta de ${occurrenceWord}`,
                      onPress: () => {
                        setConfirming(null);
                        router.push(`/a-pagar/${c.id}/editar`);
                      },
                    },
                    {
                      label: annual
                        ? annual.k === 1
                          ? `${annual.label} e os próximos anos`
                          : `A parcela ${annual.part} de ${annual.label} e as próximas`
                        : `${occurrenceWord.charAt(0).toUpperCase()}${occurrenceWord.slice(1)} e os próximos meses`,
                      onPress: () => {
                        setConfirming(null);
                        router.push({ pathname: '/gastos-fixos/[id]/editar', params: { id: ref.id, 'a-partir': String(ref.number) } });
                      },
                    },
                  ]}
                />
              ) : null}

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
 * Atalho "Adicionar a conta do próximo mês" (sem recorrência neste ciclo). Consulta o mês do vencimento seguinte,
 * que traz a conta dele em aberto ou já paga. Só aparece com a consulta confirmada: enquanto carrega ou se falhar,
 * nada aparece, para não arriscar uma conta duplicada.
 */
function NextMonth({ commitment: c }: { commitment: Commitment }) {
  const prefill = nextMonthPrefill(c);
  const month = monthOf(prefill.dueOn);
  const list = useCommitments(c.contextId, month);
  if (!list.isSuccess) return null;
  const existing = findNextMonthCommitment(list.data, c);
  if (existing) {
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
  inlineLink: { alignSelf: 'flex-start', paddingHorizontal: 0 },
});
