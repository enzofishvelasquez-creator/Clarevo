import {
  INVESTMENT_GOAL_TEXT,
  formatBRL,
  isRepoError,
  linkedInvestmentsSummary,
  newOperationKey,
  type Goal,
  type GoalValueSource,
  type LinkedInvestmentsSummary,
} from '@clarevo/core';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { MoneyTxt, useMoneyLabelMask } from '@/components/money-text';
import { ChoiceGroup } from '@/components/series-parts';
import { Card, Chip, LinkButton, Txt, styles as ui } from '@/components/ui';
import { useInvestments, useSetGoalValueSource, useSpace } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, space, tabular } from '@/theme/tokens';

const T = INVESTMENT_GOAL_TEXT;
const S = T.source;

/**
 * Investimentos ligados à reserva ou à meta (D-099, item 13): o valor de hoje dos ativos ligados e, na reserva, quanto tem resgate em até
 * 1 dia pela ficha. Com investimentos ligados, a escolha "De onde vem o valor guardado" (fase 2): dos registros da meta ou dos
 * investimentos ligados. Some sem nenhum ligado (a não ser que a meta já leia dos investimentos, para poder voltar) e fora do Pessoal.
 */
export function LinkedInvestmentsCard({ goal }: { goal: Goal }) {
  const { today } = useSession();
  const space_ = useSpace();
  const personal = space_.data?.personalContextId === goal.contextId;
  const list = useInvestments(personal ? goal.contextId : undefined);
  const maskLabel = useMoneyLabelMask();
  const setSource = useSetGoalValueSource();
  const qc = useQueryClient();
  const [key, setKey] = useState(() => newOperationKey());
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const summary = list.data ? linkedInvestmentsSummary(goal.id, list.data, today) : null;
  if (!personal || !list.data || (!summary && goal.valueSource !== 'investimentos')) return null;
  const reserve = goal.goalType === 'emergencia';
  const fromInvestments = goal.valueSource === 'investimentos';
  const archived = goal.status === 'arquivada';

  async function choose(source: GoalValueSource) {
    if (setSource.isPending || source === goal.valueSource) return;
    setMessage(null);
    try {
      await setSource.mutateAsync({ key, id: goal.id, version: goal.version, source });
      setKey(newOperationKey());
      setMessage({ text: S.saved, error: false });
    } catch (e) {
      const code = isRepoError(e) ? e.code : 'desconhecido';
      // Falha de rede: a mesma chave na nova tentativa (se já tinha gravado, a repetição devolve a meta como ficou). E a meta é lida de novo.
      if (code !== 'rede') setKey(newOperationKey());
      qc.invalidateQueries({ queryKey: ['goals'] });
      setMessage({ text: code === 'contexto_invalido' ? S.personalOnly : code === 'versao_desatualizada' ? S.changedElsewhere : S.error, error: true });
    }
  }

  return (
    <Card style={{ gap: space[2] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {reserve ? T.reserveTitle : T.goalTitle}
      </Txt>
      {summary ? (
        <>
          <MoneyTxt>{T.totalLine(summary.valueCents, summary.items.length)}</MoneyTxt>
          {reserve ? <MoneyTxt>{T.quickLine(summary.quickCents)}</MoneyTxt> : null}
          {reserve && summary.unknownLiquidity > 0 ? (
            <Txt variant="caption" color={colors.textSecondary}>
              {T.unknownLine(summary.unknownLiquidity)}
            </Txt>
          ) : null}
          <View>
            {summary.items.map((i, n) => (
              <Pressable
                key={i.id}
                accessibilityRole="link"
                accessibilityLabel={maskLabel(`${i.name}, ${formatBRL(i.valueCents)}`)}
                accessibilityHint="Abre o investimento"
                onPress={() => router.push({ pathname: '/investimento/[id]', params: { id: i.id } })}
                style={(st) => [styles.row, n > 0 && styles.divider, st.pressed && { opacity: 0.7 }, (st as { focused?: boolean }).focused && ui.focusRing]}>
                {/* Nome e valor um embaixo do outro: com a letra grande, o valor não passa da largura da tela. */}
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Txt variant="label" style={{ fontFamily: fonts.bold }}>
                    {i.name}
                  </Txt>
                  <MoneyTxt variant="label" style={tabular}>
                    {formatBRL(i.valueCents)}
                  </MoneyTxt>
                </View>
                <ChevronRight size={18} color={colors.textSecondary} aria-hidden />
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
      {archived ? null : (
        <ChoiceGroup label={S.title} hint={fromInvestments ? S.investmentsHint : S.recordsHint}>
          <Chip label={S.records} selected={!fromInvestments} onPress={() => choose('registros')} />
          <Chip label={S.investments} selected={fromInvestments} onPress={() => choose('investimentos')} />
        </ChoiceGroup>
      )}
      {message ? (
        <Txt variant="label" color={message.error ? colors.error : colors.textSecondary} accessibilityLiveRegion="polite">
          {message.text}
        </Txt>
      ) : null}
      <Txt variant="caption" color={colors.textSecondary}>
        {fromInvestments ? S.paused : T.note}
      </Txt>
    </Card>
  );
}

/**
 * Investimentos ligados à meta que não entram no guardado (o valor vem dos registros da meta): o resumo deles, ou null. Fora do Pessoal,
 * sem investimento ligado ou com o valor lido dos investimentos, null. Usa a mesma leitura do card "Investimentos ligados".
 */
export function useUncountedLinkedInvestments(goal: Goal | null): LinkedInvestmentsSummary | null {
  const { today } = useSession();
  const space_ = useSpace();
  const personal = goal !== null && space_.data?.personalContextId === goal.contextId;
  const list = useInvestments(personal ? goal.contextId : undefined);
  if (!goal || !personal || !list.data || goal.valueSource === 'investimentos') return null;
  return linkedInvestmentsSummary(goal.id, list.data, today);
}

/**
 * "Investimentos ligados: R$ 10.875,00, não somados ao guardado" e o link "Ver os investimentos ligados" (revisão das telas, 16/11/2026; auditoria de 18/11/2026), nos cards de Metas e no
 * detalhe: quem ligou um investimento à meta vê que ele não está somado, e o "Ver" leva ao card com a escolha "De onde vem o valor
 * guardado". O valor segue Ocultar valores.
 */
export function UncountedLinkedLine({ summary, onSee, onBrand = false }: { summary: LinkedInvestmentsSummary; onSee: () => void; onBrand?: boolean }) {
  return (
    <View style={styles.uncounted}>
      <MoneyTxt variant="label" color={onBrand ? colors.textOnBrand : colors.textSecondary} style={[tabular, { flexShrink: 1 }]}>
        {T.notCounted(summary.valueCents)}
      </MoneyTxt>
      <LinkButton
        label={T.notCountedSee}
        accessibilityLabel={T.notCountedSeeA11y}
        color={onBrand ? colors.textOnBrand : colors.brandText}
        style={styles.see}
        onPress={onSee}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  uncounted: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space[2] },
  // O link inteiro ("Ver os investimentos ligados"), alinhado ao texto quando desce para a linha de baixo (auditoria de 18/11/2026).
  see: { minWidth: 44, paddingHorizontal: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 48, paddingVertical: space[2] },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
