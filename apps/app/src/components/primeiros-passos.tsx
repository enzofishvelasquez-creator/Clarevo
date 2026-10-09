import { DEMO_EMAIL, SAVINGS_TEXT } from '@clarevo/core';
import { router } from 'expo-router';
import { ArrowDownLeft, ArrowUpRight, Check, ChevronRight, PiggyBank, Repeat, type LucideIcon } from 'lucide-react-native';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeOut, ReduceMotion } from 'react-native-reanimated';

import { Card, LinkButton, Txt } from '@/components/ui';
import { useFirstSteps } from '@/lib/onboarding';
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

/** Fechar o card (três passos prontos ou "Agora não") é a única transição: esmaece em 240 ms (CL-V008). */
const cardExit = FadeOut.duration(motion.confirm).reduceMotion(ReduceMotion.System);

/**
 * "Primeiros passos" no Resumo, na área dos avisos temporários, antes de "Anotar gasto". Só no contexto Pessoal,
 * no mês corrente, fora da conta de demonstração com dados e com tudo carregado: um passo só aparece concluído
 * quando a lista que o comprova carregou bem (nunca um sinal de concluído por engano). Some de vez, por pessoa,
 * quando os quatro passos ficam prontos ou depois de "Agora não" (lib/onboarding.ts). Conta nova continua vazia:
 * o card só leva às telas de cadastro, sem dados de exemplo.
 * O 4º passo, "Planejar quanto guardar" (D-036), abre a aba Metas e conta como concluído com a resposta "consigo" ou
 * "agora não" ao plano de guardar. Se a resposta não carregar, o passo fica como não concluído (e o card continua).
 */
export function PrimeirosPassos({ contextId }: { contextId: string | undefined }) {
  const { user, auth } = useSession();
  const { space: kind, month, currentMonth } = useView();
  const demoWithData = user?.email === DEMO_EMAIL;
  const firstSteps = useFirstSteps(demoWithData ? undefined : user?.id, auth.mode !== 'demo');
  const eligible = kind === 'pessoal' && month === currentMonth && firstSteps.status === 'aberto';
  // Nenhuma consulta depois que o card fechou. Enquanto ele está aberto, os registros do mês são os mesmos do Resumo
  // e a sincronização do dia é a mesma de "Ainda a pagar"; só a lista de gastos fixos é lida a mais.
  const series = useSeriesList(eligible ? contextId : undefined);
  const records = useMonthRecords(eligible ? contextId : undefined, currentMonth);
  const savings = useSavingsStepDone(eligible ? contextId : undefined);
  const summary = records.summary;
  const ready = eligible && series.isSuccess && records.isSuccess && summary !== null;
  const done: Record<Step['key'], boolean> = {
    fixos: Boolean(series.data && series.data.length > 0),
    recebido: Boolean(summary && summary.composition.received.length > 0),
    pago: Boolean(summary && summary.composition.paid.length > 0),
    guardar: savings.isSuccess && savings.data === true,
  };
  const allDone = done.fixos && done.recebido && done.pago && done.guardar;
  const { close } = firstSteps;

  useEffect(() => {
    if (ready && allDone) close('concluido');
  }, [ready, allDone, close]);

  if (!ready || allDone) return null;

  return (
    <Animated.View exiting={cardExit}>
      <Card style={styles.card}>
        <View style={{ gap: space[1] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            Primeiros passos
          </Txt>
          <Txt variant="caption" color={colors.textSecondary}>
            Quatro passos para o Clarevo mostrar o seu mês de verdade.
          </Txt>
        </View>
        <View>
          {STEPS.map((step, i) => (
            <StepRow key={step.key} step={step} done={done[step.key]} last={i === STEPS.length - 1} />
          ))}
        </View>
        <LinkButton label="Agora não" style={styles.dismiss} onPress={() => close('dispensado')} />
      </Card>
    </Animated.View>
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
        <Icon size={18} color={done ? colors.success : colors.brand} strokeWidth={done ? 2.75 : 2.25} aria-hidden />
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
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 10, minHeight: 56 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  icon: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
  iconDone: { backgroundColor: colors.successTint },
  dismiss: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  focusRing: { outlineWidth: 3, outlineColor: colors.brand, outlineStyle: 'solid', outlineOffset: 2 } as object,
});
