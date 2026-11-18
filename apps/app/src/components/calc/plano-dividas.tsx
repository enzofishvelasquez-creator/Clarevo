import {
  PLANO_FIELDS,
  PLANO_MAX_DEBTS,
  PLANO_TEXT,
  calcErrorText,
  calcPlanoDividas,
  draftToInput,
  planoDebtName,
  planoDebtStays,
  type CalcErrorCode,
  type PlanoCampo,
  type PlanoDividaInput,
  type PlanoResult,
  type PlanoTipo,
} from '@clarevo/core';
import { CircleMinus, Plus } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  CalcChip,
  CalcNote,
  CalcResult,
  CalcScreen,
  CalcTextField,
  calcInlineLink,
  calcLeadStyle,
  formatMoneyText,
  showError,
  useCalcForm,
  type CalcForm,
} from '@/components/calc/parts';
import { MoneyTxt } from '@/components/money-text';
import { ChoiceGroup } from '@/components/series-parts';
import { Button, Card, LinkButton, Skeleton, Txt } from '@/components/ui';
import { HIDDEN_MONEY_A11Y, maskMoneyLabel, setValuesHidden, useValuesHidden } from '@/lib/privacy';
import { useSavingsCheck, useSeriesDebts, useWork } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, radius, space, tabular } from '@/theme/tokens';

/**
 * 9. Em que ordem quitar as dívidas? (D-040; refeita pelo retorno de 17/11/2026): no topo, para que serve; cada campo diz o que muda
 * na resposta; o resultado responde primeiro o que a pessoa ganha (em meses e em juros estimados), depois as duas ordens lado a lado
 * e o plano passo a passo de cada uma (por qual dívida começar, onde vai o valor a mais, quando cada dívida acaba e para onde vai o
 * pagamento dela), e só depois as hipóteses e os detalhes. Nada é gravado, nem no aparelho; a taxa é sempre digitada. As dívidas vêm preenchidas com os parcelamentos ativos (leitura, sem alterar nada
 * neles) e a pessoa pode tirar qualquer uma da conta ou acrescentar outras à mão. Com "Ocultar valores" ligado, a parcela que
 * veio preenchida e os valores do resultado aparecem como "R$ ••••" (o que a pessoa digita continua à vista).
 */
interface Debt extends PlanoDividaInput {
  /** Estável: os campos não trocam de dono quando outra dívida sai da lista. */
  id: number;
  /** A dívida veio de um parcelamento (lido, nunca alterado). */
  fromSeries: boolean;
  /** A parcela veio de um parcelamento e ainda não foi mexida: com valores ocultos, fica mascarada. */
  parcelaFromSeries: boolean;
}

/** O campo já mostra o prefixo "R$": com valores ocultos, só os pontos ("R$ ••••" na tela). */
const MASKED_VALUE = '••••';

const blank = (id: number): Debt => ({ id, tipo: null, apelido: '', fromSeries: false, parcelaFromSeries: false });

export function PlanoDividasCalc() {
  const { today } = useSession();
  const spaceQuery = useWork();
  const contextId = spaceQuery.data?.contextId;
  const hidden = useValuesHidden();
  const form = useCalcForm<'extra'>(() => ({ extra: '' }));
  const [debts, setDebts] = useState<Debt[]>([]);
  const nextId = useRef(0);
  const [seeded, setSeeded] = useState(false);
  const fromSeries = useSeriesDebts(contextId);
  const savings = useSavingsCheck(contextId);

  // As dívidas dos parcelamentos entram uma vez, na frente do que a pessoa já tenha acrescentado (que nunca é descartado:
  // se faltar lugar, é o pré-preenchimento que perde as últimas).
  useEffect(() => {
    if (seeded || !fromSeries.data) return;
    setSeeded(true);
    const drafts: Debt[] = fromSeries.data.map((d) => ({ ...draftToInput(d), id: nextId.current++, fromSeries: true, parcelaFromSeries: true }));
    if (drafts.length > 0) setDebts((list) => [...drafts.slice(0, Math.max(0, PLANO_MAX_DEBTS - list.length)), ...list]);
  }, [fromSeries.data, seeded]);

  // A conta só roda de novo quando uma dívida, o valor a mais ou o dia mudam (não a cada render).
  const outcome = useMemo(
    () => calcPlanoDividas({ dividas: debts.map(({ id: _id, fromSeries: _s, parcelaFromSeries: _p, ...d }) => d), extra: form.values.extra }, today),
    [debts, form.values.extra, today],
  );
  const errors: Partial<Record<string, CalcErrorCode>> = outcome.ok ? {} : outcome.errors;
  const anyFromSeries = debts.some((d) => d.fromSeries);
  // Com dívidas lidas dos parcelamentos, as hipóteses dizem que as parcelas já vencidas e em aberto ficam fora.
  const result = useMemo(
    () => (outcome.ok ? (anyFromSeries ? { ...outcome.result, hypotheses: [...outcome.result.hypotheses, PLANO_TEXT.hypotheses.overdueOut] } : outcome.result) : null),
    [outcome, anyFromSeries],
  );
  const savedMonthly = savings.data?.answer === 'consigo' ? savings.data.monthlyCents : null;

  const update = (id: number, patch: Partial<Debt>) => setDebts((list) => list.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  const add = () => {
    if (debts.length >= PLANO_MAX_DEBTS) return;
    setDebts((list) => [...list, blank(nextId.current++)]);
  };
  const remove = (id: number) => setDebts((list) => list.filter((d) => d.id !== id));

  // Sem texto de lista vazia enquanto a conta e os parcelamentos ainda estão sendo lidos, nem no quadro entre a chegada dos
  // parcelamentos e o pré-preenchimento (falha na leitura: a lista vazia aparece, com o aviso).
  const loadingDebts = !seeded && (spaceQuery.isPending || (Boolean(contextId) && !fromSeries.isError));
  // O "vazio" de uma escolha só aparece quando ela é a única coisa que falta (antes disso, o resultado já diz para preencher).
  const entries = Object.entries(errors);
  const onlyTypesMissing = entries.length > 0 && entries.every(([k, c]) => k.startsWith('tipo.') && c === 'vazio');

  return (
    <CalcScreen slug="plano-dividas">
      <Txt color={colors.textSecondary}>{PLANO_TEXT.intro}</Txt>
      <Card style={{ gap: space[4] }}>
        <View style={{ gap: space[1] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {PLANO_TEXT.listTitle}
          </Txt>
          <Txt variant="caption" color={colors.textSecondary}>
            {PLANO_TEXT.listHint}
          </Txt>
        </View>
        {anyFromSeries ? <Txt variant="label" color={colors.textSecondary}>{PLANO_TEXT.prefilledNote}</Txt> : null}
        {fromSeries.isError ? <CalcNote>{PLANO_TEXT.loadFailed}</CalcNote> : null}
        {loadingDebts ? (
          <View accessibilityRole="progressbar" accessibilityLabel={PLANO_TEXT.loading} style={{ gap: space[2] }}>
            <Skeleton width="60%" height={18} />
            <Skeleton width="100%" height={48} />
          </View>
        ) : null}
        {debts.length === 0 && !loadingDebts ? <Txt color={colors.textSecondary}>{PLANO_TEXT.emptyList}</Txt> : null}
        {debts.map((d, i) => (
          <DebtCard
            key={d.id}
            debt={d}
            index={i}
            hidden={hidden}
            errors={errors}
            form={form}
            showTypeError={onlyTypesMissing}
            first={i === 0}
            onChange={(patch) => update(d.id, patch)}
            onRemove={() => remove(d.id)}
          />
        ))}
        {debts.length < PLANO_MAX_DEBTS ? (
          <Button label={PLANO_TEXT.addDebt} icon={Plus} tone="soft" onPress={add} />
        ) : (
          <Txt variant="label" color={colors.textSecondary}>
            {PLANO_TEXT.maxReached}
          </Txt>
        )}
      </Card>

      <Card style={{ gap: space[3] }}>
        <CalcTextField
          spec={PLANO_FIELDS.extra!}
          value={form.values.extra}
          onChangeText={(t) => form.set('extra', t)}
          onBlur={() => {
            if (form.values.extra.trim() !== '') {
              const formatted = formatMoneyText(form.values.extra);
              if (formatted !== form.values.extra) form.set('extra', formatted);
            }
            form.blur('extra');
          }}
          error={
            errors.extra && showError(errors.extra, PLANO_FIELDS.extra!, form.values.extra, form.blurred('extra'), form.edited('extra'))
              ? calcErrorText('plano-dividas', 'extra', errors.extra)
              : undefined
          }
        />
        {savedMonthly !== null && savedMonthly !== undefined ? (
          <MoneyTxt variant="caption" color={colors.textSecondary}>
            {PLANO_TEXT.savingsHint(savedMonthly)}
          </MoneyTxt>
        ) : null}
      </Card>

      <CalcResult texts={result} maskMoney body={result ? <Answer result={result} /> : undefined}>
        {result && result.scenarios.length > 0 ? <Details result={result} /> : null}
      </CalcResult>
    </CalcScreen>
  );
}

/** Uma dívida: apelido, tipo e os campos do tipo; com saldo que não diminui, o aviso logo abaixo do pagamento. */
function DebtCard({
  debt,
  index,
  hidden,
  errors,
  form,
  showTypeError,
  first,
  onChange,
  onRemove,
}: {
  debt: Debt;
  index: number;
  hidden: boolean;
  errors: Partial<Record<string, CalcErrorCode>>;
  form: CalcForm<'extra'>;
  /** Só falta escolher o tipo (em alguma dívida): é a hora de dizer qual. */
  showTypeError: boolean;
  first: boolean;
  onChange: (patch: Partial<Debt>) => void;
  onRemove: () => void;
}) {
  const name = planoDebtName(debt.apelido, index);
  const tipoSpec = PLANO_FIELDS.tipo!;
  // O aviso depende só dos três campos desta dívida, não de o resto da tela estar completo.
  const stays = planoDebtStays(debt);
  const typeError = debt.tipo === null && showTypeError && errors[`tipo.${index}`] ? calcErrorText('plano-dividas', `tipo.${index}`, errors[`tipo.${index}`]!) : undefined;

  /** Campo de texto da dívida: nome acessível "Rótulo, nome da dívida"; erro conforme a regra comum das calculadoras. */
  const field = (campo: PlanoCampo & keyof PlanoDividaInput, label?: string, a11yLabel?: string) => {
    const spec = PLANO_FIELDS[campo]!;
    const key = `${campo}.${debt.id}`;
    const value = (debt[campo] as string | undefined) ?? '';
    const code = errors[`${campo}.${index}`];
    const money = spec.kind === 'dinheiro';
    const masked = hidden && campo === 'parcela' && debt.parcelaFromSeries;
    const fieldName = a11yLabel ?? `${label ?? spec.label}, ${name}`;
    const input = (
      <CalcTextField
        key={campo}
        spec={spec}
        label={label}
        hint={masked ? PLANO_TEXT.prefilledHidden : undefined}
        value={masked ? MASKED_VALUE : value}
        editable={!masked}
        accessibilityLabel={masked ? `${fieldName}, ${HIDDEN_MONEY_A11Y}` : fieldName}
        onChangeText={(t) => {
          onChange({ [campo]: t, ...(campo === 'parcela' ? { parcelaFromSeries: false } : {}) });
          form.touch(key);
        }}
        onBlur={() => {
          if (money && value.trim() !== '' && !masked) {
            const formatted = formatMoneyText(value);
            if (formatted !== value) onChange({ [campo]: formatted });
          }
          form.blur(key);
        }}
        error={!masked && code && showError(code, spec, value, form.blurred(key), form.edited(key)) ? calcErrorText('plano-dividas', `${campo}.${index}`, code) : undefined}
      />
    );
    if (!masked) return input;
    // A parcela preenchida está mascarada e sem edição: o jeito de editar é mostrar os valores, aqui mesmo.
    return (
      <View key={campo} style={{ gap: space[1] }}>
        {input}
        <LinkButton
          label={PLANO_TEXT.showValues}
          accessibilityLabel={PLANO_TEXT.showValuesA11y(name)}
          color={colors.textSecondary}
          style={calcInlineLink}
          onPress={() => setValuesHidden(false)}
        />
      </View>
    );
  };

  return (
    <View style={[styles.debt, !first && styles.divider]}>
      <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 15 }} accessibilityRole="header" aria-level={3}>
        {name}
      </Txt>
      {field('apelido', PLANO_FIELDS.apelido!.label, `Apelido da dívida ${index + 1}`)}
      <ChoiceGroup label={tipoSpec.label} accessibilityLabel={PLANO_TEXT.typeGroup(name)} hint={first ? PLANO_TEXT.typeHint : undefined} error={typeError}>
        {(tipoSpec.options ?? []).map((o) => (
          <CalcChip
            key={o.value}
            label={o.label}
            accessibilityLabel={`${o.label}, ${name}`}
            selected={debt.tipo === o.value}
            onPress={() => onChange({ tipo: o.value as PlanoTipo })}
          />
        ))}
      </ChoiceGroup>
      {debt.tipo === 'parcelada' ? (
        <>
          {field('parcela')}
          {field('restantes')}
          {field('taxaParcelada')}
        </>
      ) : null}
      {debt.tipo === 'saldo' ? (
        <>
          {field('saldo')}
          {field('taxaSaldo')}
          {field('pagamento')}
          {stays ? <CalcNote>{PLANO_TEXT.balanceStays}</CalcNote> : null}
        </>
      ) : null}
      <LinkButton
        label={PLANO_TEXT.removeDebt}
        accessibilityLabel={PLANO_TEXT.removeDebtA11y(name)}
        icon={CircleMinus}
        color={colors.textSecondary}
        style={calcInlineLink}
        onPress={onRemove}
      />
    </View>
  );
}

/**
 * A resposta (retorno de 17/11/2026), de cima para baixo: o ganho em uma frase, as duas ordens lado a lado (um item por dado, com as
 * duas ordens no mesmo item para o leitor de tela), as diferenças como fatos e o plano passo a passo de cada ordem. Valores em reais
 * passam por MoneyTxt ("Ocultar valores").
 */
function Answer({ result }: { result: PlanoResult }) {
  const hidden = useValuesHidden();
  const { comparison, plans } = result;
  return (
    <View style={{ gap: space[3] }}>
      <MoneyTxt style={[calcLeadStyle, tabular]}>{result.headline}</MoneyTxt>
      {comparison ? (
        <View style={{ gap: space[2] }}>
          <Txt variant="label" style={{ fontFamily: fonts.bold }} accessibilityRole="header" aria-level={3}>
            {PLANO_TEXT.comparisonTitle}
          </Txt>
          <View style={styles.table}>
            {/* Os nomes das ordens, no alto de cada coluna; o leitor de tela ouve o nome junto de cada valor. */}
            <View style={styles.tableRow} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {comparison.columns.map((c) => (
                <Txt key={c} variant="label" style={[styles.cell, { fontFamily: fonts.bold }]}>
                  {c}
                </Txt>
              ))}
            </View>
            <View role="list">
              {comparison.rows.map((row) => (
                <View
                  key={row.label}
                  role="listitem"
                  accessible
                  focusable={false}
                  accessibilityLabel={maskMoneyLabel(`${row.label}: ${comparison.columns.map((c, i) => `${c}, ${row.values[i]}`).join('; ')}.`, hidden)}
                  style={styles.tableItem}>
                  <Txt variant="caption" color={colors.textSecondary}>
                    {row.label}
                  </Txt>
                  <View style={styles.tableRow}>
                    {row.values.map((v, i) => (
                      <MoneyTxt key={`${i}-${v}`} variant="label" style={[styles.cell, tabular]}>
                        {v}
                      </MoneyTxt>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>
      ) : null}
      {result.differences.map((line) => (
        <MoneyTxt key={line} style={tabular}>
          {line}
        </MoneyTxt>
      ))}
      {plans.length > 0 ? (
        <View style={{ gap: space[2] }}>
          <Txt variant="label" style={{ fontFamily: fonts.bold }} accessibilityRole="header" aria-level={3}>
            {PLANO_TEXT.planTitle}
          </Txt>
          {plans.map((plan) => (
            <View key={plan.id} style={{ gap: space[1] }}>
              {plan.id !== 'com_extra' ? (
                <Txt variant="label" style={{ fontFamily: fonts.bold }} accessibilityRole="header" aria-level={4}>
                  {plan.title}
                </Txt>
              ) : null}
              <View role="list" style={{ gap: space[1] }}>
                {plan.steps.map((step, i) => (
                  <View key={`${i}-${step}`} role="listitem" style={styles.step}>
                    <Txt variant="label" color={colors.textSecondary} aria-hidden accessibilityElementsHidden importantForAccessibility="no" style={tabular}>
                      {`${i + 1}.`}
                    </Txt>
                    <MoneyTxt variant="label" style={[{ flex: 1 }, tabular]}>
                      {step}
                    </MoneyTxt>
                  </View>
                ))}
              </View>
              {plan.gain ? (
                <MoneyTxt variant="caption" color={colors.textSecondary} style={tabular}>
                  {plan.gain}
                </MoneyTxt>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
      {result.tailLines.map((line) => (
        <Txt key={line}>{line}</Txt>
      ))}
    </View>
  );
}

/**
 * Total pago e juros de cada ordem e, em "Sem valor a mais", a sequência em que as dívidas terminam; a resposta, a comparação e o plano
 * ficam no resultado. Quando as
 * duas ordens dão no mesmo, um bloco só para elas (teste de 09/11/2026: "informação demais junta e repetida").
 */
function Details({ result }: { result: PlanoResult }) {
  const blocks =
    result.sameOutcome && result.scenarios.length === 3
      ? [result.scenarios[0]!, { ...result.scenarios[1]!, title: PLANO_TEXT.bothTitle, caption: PLANO_TEXT.bothCaption }]
      : result.scenarios;
  return (
    <View style={{ gap: space[3] }}>
      <Txt variant="label" style={{ fontFamily: fonts.bold }} accessibilityRole="header" aria-level={3}>
        {PLANO_TEXT.detailsTitle}
      </Txt>
      {blocks.map((s) => (
        <View key={s.id} style={styles.scenario}>
          <Txt variant="label" style={{ fontFamily: fonts.bold }} accessibilityRole="header" aria-level={4}>
            {s.title}
          </Txt>
          {s.caption ? (
            <Txt variant="caption" color={colors.textSecondary}>
              {s.caption}
            </Txt>
          ) : null}
          {s.months === null ? <Txt variant="label">{PLANO_TEXT.noEnd}</Txt> : null}
          {s.detailLines.map((line) => (
            <MoneyTxt key={line} variant="label">
              {line}
            </MoneyTxt>
          ))}
          {s.sequenceLines.length > 0 ? (
            <View style={{ gap: space[1] }}>
              <Txt variant="caption" color={colors.textSecondary}>
                {PLANO_TEXT.sequenceTitle}
              </Txt>
              {s.sequenceLines.map((line) => (
                <Txt key={line} variant="label">
                  {line}
                </Txt>
              ))}
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  debt: { gap: space[3] },
  divider: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space[4] },
  scenario: { gap: space[1], paddingTop: space[2] },
  table: { gap: space[2], padding: space[3], borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  tableRow: { flexDirection: 'row', gap: space[3] },
  tableItem: { gap: 2, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space[2] },
  cell: { flex: 1, minWidth: 0 },
  step: { flexDirection: 'row', gap: space[2], alignItems: 'flex-start' },
});
