import {
  PLANO_FIELDS,
  PLANO_MAX_DEBTS,
  PLANO_TEXT,
  calcErrorText,
  calcPlanoDividas,
  draftToInput,
  planoDebtName,
  type CalcErrorCode,
  type PlanoCampo,
  type PlanoDividaInput,
  type PlanoResult,
  type PlanoTipo,
} from '@clarevo/core';
import { CircleMinus, Plus } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CalcChip, CalcNote, CalcResult, CalcScreen, CalcTextField, calcInlineLink, formatMoneyText, showError, useCalcForm, type CalcForm } from '@/components/calc/parts';
import { MoneyTxt } from '@/components/money-text';
import { ChoiceGroup } from '@/components/series-parts';
import { Button, Card, LinkButton, Skeleton, Txt } from '@/components/ui';
import { useValuesHidden } from '@/lib/privacy';
import { useSavingsCheck, useSeriesDebts, useSpace } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, space } from '@/theme/tokens';

/**
 * 9. Em que ordem quitar as dívidas? (D-040): duas ordens lado a lado e a referência "Sem valor a mais". Nada é gravado, nem
 * no aparelho; a taxa é sempre digitada. As dívidas vêm preenchidas com os parcelamentos ativos (leitura, sem alterar nada
 * neles) e a pessoa pode tirar qualquer uma da conta ou acrescentar outras à mão. Com "Ocultar valores" ligado, a parcela que
 * veio preenchida e os valores do resultado aparecem como "R$ ••••" (o que a pessoa digita continua à vista).
 */
interface Debt extends PlanoDividaInput {
  /** Estável: os campos não trocam de dono quando outra dívida sai da lista. */
  id: number;
  /** A parcela veio de um parcelamento e ainda não foi mexida: com valores ocultos, fica mascarada. */
  parcelaFromSeries: boolean;
}

/** O campo já mostra o prefixo "R$": com valores ocultos, só os pontos ("R$ ••••" na tela). */
const MASKED_VALUE = '••••';

const blank = (id: number): Debt => ({ id, tipo: null, apelido: '', parcelaFromSeries: false });

export function PlanoDividasCalc() {
  const { today } = useSession();
  const contextId = useSpace().data?.personalContextId;
  const hidden = useValuesHidden();
  const form = useCalcForm<'extra'>(() => ({ extra: '' }));
  const [debts, setDebts] = useState<Debt[]>([]);
  const nextId = useRef(0);
  const seeded = useRef(false);
  const fromSeries = useSeriesDebts(contextId);
  const savings = useSavingsCheck(contextId);

  // As dívidas dos parcelamentos entram uma vez, na frente do que a pessoa já tenha acrescentado.
  useEffect(() => {
    if (seeded.current || !fromSeries.data) return;
    seeded.current = true;
    const drafts: Debt[] = fromSeries.data.map((d) => ({ ...draftToInput(d), id: nextId.current++, parcelaFromSeries: true }));
    if (drafts.length > 0) setDebts((list) => [...drafts, ...list].slice(0, PLANO_MAX_DEBTS));
  }, [fromSeries.data]);

  const outcome = calcPlanoDividas({ dividas: debts.map(({ id: _id, parcelaFromSeries: _p, ...d }) => d), extra: form.values.extra }, today);
  const errors: Partial<Record<string, CalcErrorCode>> = outcome.ok ? {} : outcome.errors;
  const result = outcome.ok ? outcome.result : null;
  const savedMonthly = savings.data?.answer === 'consigo' ? savings.data.monthlyCents : null;
  const anyFromSeries = debts.some((d) => d.parcelaFromSeries);

  const update = (id: number, patch: Partial<Debt>) => setDebts((list) => list.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  const add = () => {
    if (debts.length >= PLANO_MAX_DEBTS) return;
    setDebts((list) => [...list, blank(nextId.current++)]);
  };
  const remove = (id: number) => setDebts((list) => list.filter((d) => d.id !== id));

  const loadingDebts = fromSeries.isPending && Boolean(contextId) && !seeded.current;
  // O "vazio" de uma escolha só aparece quando ela é a única coisa que falta (antes disso, o resultado já diz para preencher).
  const entries = Object.entries(errors);
  const onlyTypesMissing = entries.length > 0 && entries.every(([k, c]) => k.startsWith('tipo.') && c === 'vazio');

  return (
    <CalcScreen slug="plano-dividas">
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
            excluded={result?.debts.find((x) => x.index === i)?.excluded ?? false}
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

      <CalcResult texts={result} maskMoney>
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
  excluded,
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
  excluded: boolean;
  first: boolean;
  onChange: (patch: Partial<Debt>) => void;
  onRemove: () => void;
}) {
  const name = planoDebtName(debt.apelido, index);
  const tipoSpec = PLANO_FIELDS.tipo!;

  /** Campo de texto da dívida: nome acessível "Rótulo, nome da dívida"; erro conforme a regra comum das calculadoras. */
  const field = (campo: PlanoCampo & keyof PlanoDividaInput, label?: string, a11yLabel?: string) => {
    const spec = PLANO_FIELDS[campo]!;
    const key = `${campo}.${debt.id}`;
    const value = (debt[campo] as string | undefined) ?? '';
    const code = errors[`${campo}.${index}`];
    const money = spec.kind === 'dinheiro';
    const masked = hidden && campo === 'parcela' && debt.parcelaFromSeries;
    return (
      <CalcTextField
        key={campo}
        spec={spec}
        label={label}
        hint={masked ? PLANO_TEXT.prefilledHidden : undefined}
        value={masked ? MASKED_VALUE : value}
        editable={!masked}
        accessibilityLabel={a11yLabel ?? `${label ?? spec.label}, ${name}`}
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
  };

  return (
    <View style={[styles.debt, !first && styles.divider]}>
      <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 15 }} accessibilityRole="header" aria-level={3}>
        {name}
      </Txt>
      {field('apelido', PLANO_FIELDS.apelido!.label, `Apelido da dívida ${index + 1}`)}
      <ChoiceGroup label={tipoSpec.label} hint={first ? PLANO_TEXT.typeHint : undefined}>
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
      {debt.tipo === null && showTypeError && errors[`tipo.${index}`] ? (
        <Txt variant="label" color={colors.error}>
          {calcErrorText('plano-dividas', `tipo.${index}`, errors[`tipo.${index}`]!)}
        </Txt>
      ) : null}
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
          {excluded ? <CalcNote>{PLANO_TEXT.balanceStays}</CalcNote> : null}
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

/** Total pago e juros de cada ordem e a sequência em que as dívidas terminam; o resumo e as diferenças ficam no resultado. */
function Details({ result }: { result: PlanoResult }) {
  return (
    <View style={{ gap: space[3] }}>
      <Txt variant="label" style={{ fontFamily: fonts.bold }} accessibilityRole="header" aria-level={3}>
        {PLANO_TEXT.detailsTitle}
      </Txt>
      {result.scenarios.map((s) => (
        <View key={s.id} style={styles.scenario}>
          <Txt variant="label" style={{ fontFamily: fonts.bold }} accessibilityRole="header" aria-level={4}>
            {s.title}
          </Txt>
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
});
