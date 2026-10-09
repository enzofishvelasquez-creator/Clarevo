import {
  DIVIDIR_MAX_PEOPLE,
  DIVIDIR_MIN_PEOPLE,
  DIVIDIR_TEXT,
  calcDividirContas,
  calcErrorText,
  calcFields,
  personName,
  type CalcPrefill,
  type DividirModo,
} from '@clarevo/core';
import { UserMinus, UserPlus } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CalcChoice, CalcField, CalcResult, CalcScreen, CalcTextField, formatMoneyText, showError, useCalcForm, type CalcBinding } from '@/components/calc/parts';
import { Button, Card, LinkButton, Txt } from '@/components/ui';
import { colors, fonts, space } from '@/theme/tokens';

/** Pessoa da divisão: só nesta tela, nunca gravada (LGPD). O id é estável para os campos não trocarem de dono. */
interface Person {
  id: number;
  apelido: string;
  renda: string;
}

const blank = (id: number): Person => ({ id, apelido: '', renda: '' });

/**
 * 8. Dividir as contas da casa: em partes iguais ou pela renda de cada pessoa, de 2 a 6 pessoas. O maior resto fecha a
 * soma com o total. Não pede nome real (apelido opcional, até 20 caracteres) e não é o plano Família.
 */
export function DividirContasCalc({ prefill }: { prefill: CalcPrefill<'dividir-contas'> }) {
  const specs = calcFields('dividir-contas');
  const form = useCalcForm<'total'>(() => ({ total: prefill.total ?? '' }));
  const [modo, setModo] = useState<DividirModo>(prefill.modo ?? (specs.modo!.default as DividirModo));
  const [people, setPeople] = useState<Person[]>(() => [blank(0), blank(1)]);
  const [nextId, setNextId] = useState(2);

  const outcome = calcDividirContas({
    total: form.values.total,
    modo,
    pessoas: people.map((p) => ({ apelido: p.apelido, ...(modo === 'renda' ? { renda: p.renda } : {}) })),
  });
  const errors = outcome.ok ? {} : outcome.errors;
  const calc: CalcBinding<'total'> = { slug: 'dividir-contas', form, errors };

  const update = (id: number, patch: Partial<Person>) => setPeople((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const add = () => {
    if (people.length >= DIVIDIR_MAX_PEOPLE) return;
    setPeople((list) => [...list, blank(nextId)]);
    setNextId((n) => n + 1);
  };
  const remove = (id: number) => setPeople((list) => (list.length <= DIVIDIR_MIN_PEOPLE ? list : list.filter((p) => p.id !== id)));

  /** Erro de um campo por pessoa: o código vem pela posição ("renda.1"); tocado e digitado, pelo id. */
  const personError = (field: 'apelido' | 'renda', index: number, id: number, text: string) => {
    const code = errors[`${field}.${index}`];
    const key = `${field}.${id}`;
    return code && showError(code, specs[field]!, text, form.blurred(key), form.edited(key)) ? calcErrorText('dividir-contas', `${field}.${index}`, code) : undefined;
  };

  return (
    <CalcScreen slug="dividir-contas">
      <Card style={{ gap: space[4] }}>
        <CalcField calc={calc} name="total" />
        <CalcChoice spec={specs.modo!} value={modo} onChange={(v) => setModo(v as DividirModo)} />
      </Card>

      <Card style={{ gap: space[4] }}>
        <View style={{ gap: space[1] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {specs.pessoas!.label}
          </Txt>
          <Txt variant="caption" color={colors.textSecondary}>
            {DIVIDIR_TEXT.peopleRange}
          </Txt>
        </View>
        {people.map((p, i) => {
          const name = personName(p.apelido, i);
          return (
            <View key={p.id} style={[styles.person, i > 0 && styles.divider]}>
              <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 15 }} accessibilityRole="header" aria-level={3}>
                Pessoa {i + 1}
              </Txt>
              <CalcTextField
                spec={specs.apelido!}
                label={DIVIDIR_TEXT.nicknameLabel(i)}
                hint={DIVIDIR_TEXT.nicknameHint}
                value={p.apelido}
                onChangeText={(t) => {
                  update(p.id, { apelido: t });
                  form.touch(`apelido.${p.id}`);
                }}
                onBlur={() => form.blur(`apelido.${p.id}`)}
                error={personError('apelido', i, p.id, p.apelido)}
              />
              {modo === 'renda' ? (
                <CalcTextField
                  spec={specs.renda!}
                  label={DIVIDIR_TEXT.incomeLabel(name)}
                  value={p.renda}
                  onChangeText={(t) => {
                    update(p.id, { renda: t });
                    form.touch(`renda.${p.id}`);
                  }}
                  onBlur={() => {
                    if (p.renda.trim() !== '') update(p.id, { renda: formatMoneyText(p.renda) });
                    form.blur(`renda.${p.id}`);
                  }}
                  error={personError('renda', i, p.id, p.renda)}
                />
              ) : null}
              {people.length > DIVIDIR_MIN_PEOPLE ? (
                <LinkButton
                  label={DIVIDIR_TEXT.removePerson(name)}
                  icon={UserMinus}
                  color={colors.textSecondary}
                  style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
                  onPress={() => remove(p.id)}
                />
              ) : null}
            </View>
          );
        })}
        {people.length < DIVIDIR_MAX_PEOPLE ? <Button label={DIVIDIR_TEXT.addPerson} icon={UserPlus} tone="soft" onPress={add} /> : null}
      </Card>

      <CalcResult texts={outcome.ok ? outcome.result : null} />
    </CalcScreen>
  );
}

const styles = StyleSheet.create({
  person: { gap: space[3] },
  divider: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space[4] },
});
