import { BUSINESS_TEXT, DEMO_EMAIL, FIRST_STEPS_TEXT, SAVINGS_TEXT, TELEGRAM_BOT, TELEGRAM_IN_ACCOUNT } from '@clarevo/core';
import { router } from 'expo-router';
import { ArrowDownLeft, ArrowUpRight, Check, ChevronRight, FileUp, MessageCircle, PiggyBank, Repeat, Store, type LucideIcon } from 'lucide-react-native';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeOut, ReduceMotion } from 'react-native-reanimated';

import { Card, LinkButton, Txt } from '@/components/ui';
import { useDoneSteps, useFirstSteps } from '@/lib/onboarding';
import { useBusiness } from '@/state/business';
import { useMonthRecords, useSavingsStepDone, useSeriesList, useView } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, motion, radius, space } from '@/theme/tokens';

interface Step {
  key: 'fixos' | 'recebido' | 'pago' | 'guardar';
  icon: LucideIcon;
  title: string;
  text: string;
  open: () => void;
}

const STEPS: Step[] = [
  {
    key: 'fixos',
    icon: Repeat,
    title: 'Cadastre seus gastos fixos',
    text: 'Aluguel, escola, luz, internet e parcelas, uma vez só.',
    open: () => router.push('/gastos-fixos/novo'),
  },
  {
    key: 'recebido',
    icon: ArrowDownLeft,
    title: 'Registre o que você recebeu este mês',
    text: 'Salário ou outra renda.',
    open: () => router.push({ pathname: '/registro/novo', params: { tipo: 'receita' } }),
  },
  {
    key: 'pago',
    icon: ArrowUpRight,
    title: 'Anote um gasto já pago',
    text: 'Mercado, farmácia ou transporte.',
    open: () => router.push({ pathname: '/registro/novo', params: { tipo: 'despesa' } }),
  },
  {
    // D-036: abre a aba Metas, onde está o card da pergunta "Você consegue guardar algum valor por mês?".
    key: 'guardar',
    icon: PiggyBank,
    title: SAVINGS_TEXT.firstStepTitle,
    text: SAVINGS_TEXT.firstStepText,
    open: () => router.navigate('/metas'),
  },
];

/**
 * Os dois jeitos rápidos de começar, no alto do card (estudo de 25/11/2026, Onda 1, item 8): importar o extrato, a fatura ou um print (a
 * importação que fica em Movimentos › Organizar) e anotar por mensagem no Telegram. Não contam como passo: levam às telas que já existem,
 * e o que entrar por elas marca os passos de recebido e de gasto como qualquer anotação.
 */
interface Quick {
  key: 'importar' | 'telegram';
  icon: LucideIcon;
  label: string;
  caption: string;
  open: () => void;
}

const QUICK: Quick[] = [
  { key: 'importar', icon: FileUp, label: FIRST_STEPS_TEXT.importLabel, caption: FIRST_STEPS_TEXT.importCaption, open: () => router.push('/importar') },
  { key: 'telegram', icon: MessageCircle, label: FIRST_STEPS_TEXT.telegramLabel, caption: FIRST_STEPS_TEXT.telegramCaption, open: () => router.push('/conta/telegram') },
];

/** O Telegram só aparece onde a tela existe para todas as pessoas (D-080; na demonstração, a tela explica). */
const QUICK_SHOWN = QUICK.filter((q) => q.key !== 'telegram' || (TELEGRAM_BOT !== null && TELEGRAM_IN_ACCOUNT));

/**
 * Em que pé está o card, para o aviso seguinte esperar a vez ("Como você conheceu o Clarevo?" só aparece quando este não está na tela,
 * nem prestes a aparecer): 'carregando' enquanto não se sabe, 'visivel' com o card na tela e 'oculto' quando ele não aparece (fechado,
 * concluído, fora do Pessoal e do mês de hoje).
 */
export type PrimeirosPassosState = 'carregando' | 'visivel' | 'oculto';

/** Fechar o card (três passos prontos ou "Agora não") é a única transição: esmaece em 240 ms (CL-V008). */
const cardExit = FadeOut.duration(motion.confirm).reduceMotion(ReduceMotion.System);

/**
 * "Primeiros passos" no Resumo, na área dos avisos temporários, depois de "Anotar gasto" (D-039). Só no contexto Pessoal,
 * no mês corrente, fora da conta de demonstração com dados e com tudo carregado: um passo só aparece concluído
 * quando a lista que o comprova carregou bem (nunca um sinal de concluído por engano). Some de vez, por pessoa,
 * quando os quatro passos ficam prontos ou depois de "Agora não" (lib/onboarding.ts). Conta nova continua vazia:
 * o card só leva às telas de cadastro, sem dados de exemplo.
 * O 4º passo, "Planejar quanto guardar" (D-036), abre a aba Metas e conta como concluído com a resposta "consigo" ou
 * "agora não" ao plano de guardar. Se a resposta não carregar, o passo fica como não concluído (e o card continua).
 */
export function PrimeirosPassos({ contextId, onState }: { contextId: string | undefined; onState?: (state: PrimeirosPassosState) => void }) {
  const { user, auth } = useSession();
  const { space: kind, month, currentMonth } = useView();
  // Só a demonstração tem dados de exemplo: uma conta real com este e-mail continua vendo o card (CL-11).
  const demoWithData = auth.mode === 'demo' && user?.email === DEMO_EMAIL;
  const firstSteps = useFirstSteps(demoWithData ? undefined : user?.id, auth.mode !== 'demo');
  // Passos que já ficaram prontos continuam prontos (docs/10 A25): o Recebido e o Pago do mês novo não os desfazem.
  const remembered = useDoneSteps(demoWithData ? undefined : user?.id, auth.mode !== 'demo');
  const eligible = kind === 'pessoal' && month === currentMonth && firstSteps.status === 'aberto';
  // Nenhuma consulta depois que o card fechou. Enquanto ele está aberto, os registros do mês são os mesmos do Resumo
  // e a sincronização do dia é a mesma de "Ainda a pagar"; só a lista de gastos fixos é lida a mais.
  const series = useSeriesList(eligible ? contextId : undefined);
  const records = useMonthRecords(eligible ? contextId : undefined, currentMonth);
  const savings = useSavingsStepDone(eligible ? contextId : undefined);
  const summary = records.summary;
  // "Tem um negócio?" (D-113b): só para quem, com certeza, ainda não tem um espaço Negócio.
  const business = useBusiness();
  const noBusiness = business.isSuccess && business.data === null;
  const ready = eligible && series.isSuccess && records.isSuccess && summary !== null && remembered.steps !== null;
  const live: Record<Step['key'], boolean> = {
    fixos: Boolean(series.data && series.data.length > 0),
    recebido: Boolean(summary && summary.composition.received.length > 0),
    pago: Boolean(summary && summary.composition.paid.length > 0),
    guardar: savings.isSuccess && savings.data === true,
  };
  const was = (k: Step['key']) => remembered.steps?.has(k) ?? false;
  const done: Record<Step['key'], boolean> = {
    fixos: live.fixos || was('fixos'),
    recebido: live.recebido || was('recebido'),
    pago: live.pago || was('pago'),
    guardar: live.guardar || was('guardar'),
  };
  const newlyDone = ready ? (Object.keys(live) as Step['key'][]).filter((k) => live[k] && !was(k)) : [];
  const { add: rememberSteps } = remembered;
  useEffect(() => {
    if (newlyDone.length > 0) rememberSteps(newlyDone);
  }, [newlyDone.join(','), rememberSteps]); // eslint-disable-line react-hooks/exhaustive-deps
  const allDone = done.fixos && done.recebido && done.pago && done.guardar;
  const doneCount = (Object.keys(done) as Step['key'][]).filter((k) => done[k]).length;
  const { close } = firstSteps;
  // A demonstração com dados nunca mostra o card, e uma leitura que falhou também não: nos dois casos o estado é "oculto", para a fila de
  // avisos do Resumo não ficar esperando um card que não vai aparecer (revisão independente de 12/11/2026).
  const failed = eligible && (series.isError || records.isError);
  const state: PrimeirosPassosState = demoWithData || failed
    ? 'oculto'
    : firstSteps.status === 'carregando'
      ? 'carregando'
      : !eligible
        ? 'oculto'
        : !ready
          ? 'carregando'
          : allDone
            ? 'oculto'
            : 'visivel';
  useEffect(() => {
    onState?.(state);
  }, [state, onState]);

  useEffect(() => {
    if (ready && allDone) close('concluido');
  }, [ready, allDone, close]);

  if (!ready || allDone) return null;

  return (
    <Animated.View exiting={cardExit}>
      <Card style={styles.card}>
        <View style={{ gap: space[1] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {FIRST_STEPS_TEXT.title}
          </Txt>
          <Txt variant="caption" color={colors.textSecondary}>
            {FIRST_STEPS_TEXT.intro}
          </Txt>
        </View>
        {/* Os jeitos rápidos vêm antes dos passos: importar e anotar por mensagem (sem dado de exemplo; só levam às telas). */}
        <View style={{ gap: space[2] }}>
          <Txt variant="label" style={{ fontFamily: fonts.bold }}>
            {FIRST_STEPS_TEXT.quickTitle}
          </Txt>
          <View style={styles.quickRow}>
            {QUICK_SHOWN.map((q) => (
              <QuickTile key={q.key} quick={q} />
            ))}
          </View>
        </View>
        {/* O caminho já feito (12/11/2026): a barra e a contagem, para cada passo pronto aparecer como avanço. */}
        <View style={{ gap: space[1] }}>
          <View
            style={styles.track}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel="Primeiros passos prontos"
            accessibilityValue={{ min: 0, max: STEPS.length, now: doneCount }}
            aria-valuemin={0}
            aria-valuemax={STEPS.length}
            aria-valuenow={doneCount}>
            <View style={[styles.fill, { width: `${Math.max(4, (doneCount / STEPS.length) * 100)}%` }]} />
          </View>
          <Txt variant="caption" style={{ fontFamily: fonts.bold }}>
            {doneCount === 1 ? `1 de ${STEPS.length} passos pronto` : `${doneCount} de ${STEPS.length} passos prontos`}
          </Txt>
        </View>
        <View>
          {STEPS.map((step, i) => (
            <StepRow key={step.key} step={step} done={done[step.key]} last={i === STEPS.length - 1} />
          ))}
        </View>
        {/* Quem não tem gastos fixos conclui o primeiro passo sem cadastrar nada (docs/10 A25). */}
        {done.fixos ? null : <LinkButton label="Não tenho gastos fixos" style={styles.dismiss} onPress={() => rememberSteps(['fixos'])} />}
        {/* O espaço Negócio (D-113b): uma linha a mais, que não conta como passo, para quem tem CNPJ ou trabalha por conta achar o espaço
            logo no começo (o "+" do seletor, no alto, também cria). Some quando a pessoa cria o negócio e junto com o card. */}
        {noBusiness ? (
          <LinkButton label={BUSINESS_TEXT.firstStepsTip} icon={Store} trailing={ChevronRight} style={styles.dismiss} onPress={() => router.push('/negocio/novo')} />
        ) : null}
        <LinkButton label="Agora não" style={styles.dismiss} onPress={() => close('dispensado')} />
      </Card>
    </Animated.View>
  );
}

/** Um jeito rápido de começar: ícone, rótulo e uma linha curta, num bloco tocável que leva à tela. */
function QuickTile({ quick }: { quick: Quick }) {
  const Icon = quick.icon;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${quick.label}. ${quick.caption}`}
      onPress={quick.open}
      style={(st) => [styles.quick, st.pressed && { opacity: 0.7 }, (st as { focused?: boolean }).focused && styles.focusRing]}>
      <Icon size={20} color={colors.brandText} strokeWidth={2.25} aria-hidden />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt variant="label" style={{ fontFamily: fonts.bold }}>
          {quick.label}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {quick.caption}
        </Txt>
      </View>
      <ChevronRight size={20} color={colors.brandText} aria-hidden />
    </Pressable>
  );
}

/** Um passo: ícone (ou o sinal de concluído), título, texto curto e seta. Continua tocável depois de concluído. */
function StepRow({ step, done, last }: { step: Step; done: boolean; last: boolean }) {
  const Icon = done ? Check : step.icon;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${step.title}${done ? ', concluído' : ''}. ${step.text}`}
      onPress={step.open}
      style={(st) => [
        styles.row,
        !last && styles.divider,
        st.pressed && { opacity: 0.7 },
        (st as { focused?: boolean }).focused && styles.focusRing,
      ]}>
      <View style={[styles.icon, done && styles.iconDone]}>
        <Icon size={18} color={done ? colors.textOnAccent : colors.brandText} strokeWidth={done ? 2.75 : 2.25} aria-hidden />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 15 }}>
          {step.title}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {step.text}
        </Txt>
      </View>
      <ChevronRight size={20} color={colors.textSecondary} aria-hidden />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[2], paddingVertical: space[4] },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  // No celular, um atalho por linha (o texto inteiro à vista); no computador, lado a lado.
  quick: {
    flexGrow: 1,
    flexBasis: 260,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    borderRadius: radius.md,
    backgroundColor: colors.brandTint,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 10, minHeight: 56 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  icon: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
  // Passo pronto: o lima da marca, com o visto escuro (12,4:1).
  iconDone: { backgroundColor: colors.accent },
  track: { height: 8, borderRadius: radius.pill, backgroundColor: colors.brandTint, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.brandMark },
  dismiss: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  focusRing: { outlineWidth: 3, outlineColor: colors.brandText, outlineStyle: 'solid', outlineOffset: 2 } as object,
});
