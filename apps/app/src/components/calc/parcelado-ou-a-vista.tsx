import {
  CALC_UI_TEXT,
  calcFields,
  calcParceladoOuAVista,
  type CalcPrefill,
  type FormaPagamento,
  type ParceladoModo,
} from '@clarevo/core';
import { router } from 'expo-router';
import { Info, Layers } from 'lucide-react-native';
import { useState } from 'react';

import { CalcChoice, CalcField, CalcResult, CalcScreen, CalcYesNo, calcInlineLink, useCalcForm, useNoteHidden, type CalcBinding } from '@/components/calc/parts';
import { Banner, Button, Card, LinkButton, Txt } from '@/components/ui';
import { space } from '@/theme/tokens';

type Key = 'aVista' | 'parcelas' | 'parcela';

/**
 * 1. Parcelado ou à vista? e, aberta por uma conta do ano (modo cota-unica), "Cota única ou parcelado?".
 * Com cartão de crédito, em vez de "Anotar como parcelamento", o aviso de fatura (parcelas do cartão já entram na
 * fatura; D-023 e D-024).
 */
export function ParceladoCalc({ prefill }: { prefill: CalcPrefill<'parcelado-ou-a-vista'> }) {
  const modo: ParceladoModo = prefill.modo === 'cota-unica' ? 'cota-unica' : 'compra';
  const specs = calcFields('parcelado-ou-a-vista', modo);
  const form = useCalcForm<Key>(() => ({ aVista: prefill.aVista ?? '', parcelas: prefill.parcelas ?? '', parcela: prefill.parcela ?? '' }));
  const [first, setFirst] = useState(specs.primeiraNaCompra!.default === true);
  const [forma, setForma] = useState<FormaPagamento | null>(null);

  const outcome = calcParceladoOuAVista({ modo, ...form.values, primeiraNaCompra: first, formaPagamento: modo === 'compra' ? forma : null });
  const calc: CalcBinding<Key> = { slug: 'parcelado-ou-a-vista', modo, form, errors: outcome.ok ? {} : outcome.errors };
  const result = outcome.ok ? outcome.result : null;
  // Aberta de um cadastro ou de algo que já existe: nada a anotar de novo.
  const fromContext = useNoteHidden(prefill.origem);

  return (
    <CalcScreen slug="parcelado-ou-a-vista" modo={modo}>
      <Card style={{ gap: space[4] }}>
        <CalcField calc={calc} name="aVista" />
        <CalcField calc={calc} name="parcelas" />
        <CalcField calc={calc} name="parcela" />
        <CalcYesNo spec={specs.primeiraNaCompra!} value={first} onChange={setFirst} />
        {modo === 'compra' ? (
          <CalcChoice spec={specs.formaPagamento!} value={forma} onChange={(v) => setForma(v as FormaPagamento)} />
        ) : null}
      </Card>

      <CalcResult texts={result} />

      {result?.action === 'aviso_cartao' ? (
        <Banner tone="info" icon={Info} live={false}>
          <Txt variant="label">
            Parcelas de compras no cartão já entram na fatura. Para não contar duas vezes, anote como parcelamento só o que for pago em boleto,
            débito ou financiamento.
          </Txt>
          <LinkButton label="Fatura sem contar duas vezes" style={calcInlineLink} onPress={() => router.push('/explicacao/fatura')} />
        </Banner>
      ) : null}

      {result?.action === 'anotar_parcelamento' && result.noteParams && !fromContext ? (
        <Button
          label={CALC_UI_TEXT.noteInstallment}
          icon={Layers}
          tone="soft"
          onPress={() =>
            router.push({
              pathname: '/gastos-fixos/novo',
              params: {
                tipo: result.noteParams!.tipo,
                natureza: result.noteParams!.natureza,
                parcelas: String(result.noteParams!.parcelas),
                valor: String(result.noteParams!.valor),
              },
            })
          }
        />
      ) : null}
    </CalcScreen>
  );
}
