import { CALC_UI_TEXT, calcPrefill, isCalcSlug } from '@clarevo/core';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { AntesDeFinanciarCalc } from '@/components/calc/antes-de-financiar';
import { CustoDaDividaCalc } from '@/components/calc/custo-da-divida';
import { CustoPorAnoCalc } from '@/components/calc/custo-por-ano';
import { DividirContasCalc } from '@/components/calc/dividir-contas';
import { JuntarParaObjetivoCalc } from '@/components/calc/juntar-para-objetivo';
import { MultaEJurosCalc } from '@/components/calc/multa-e-juros';
import { ParceladoCalc } from '@/components/calc/parcelado-ou-a-vista';
import { PlanoDividasCalc } from '@/components/calc/plano-dividas';
import { QuitarAntesCalc } from '@/components/calc/quitar-antes';
import { ReservaCalc } from '@/components/calc/reserva';
import { SubHeader } from '@/components/header';
import { Button, Card, Screen, Txt } from '@/components/ui';
import { colors, space } from '@/theme/tokens';

/**
 * Uma calculadora pelo endereço (/calcular/<slug>), preenchida pelos parâmetros do link de contexto (calcPrefill:
 * inválidos são ignorados, nada lança). Endereço desconhecido: "Esta calculadora não está disponível."
 */
export default function CalculadoraScreen() {
  const params = useLocalSearchParams();
  const slug = typeof params.slug === 'string' ? params.slug : '';
  if (!isCalcSlug(slug)) return <Unavailable />;
  switch (slug) {
    case 'antes-de-financiar':
      return <AntesDeFinanciarCalc prefill={calcPrefill(slug, params)} />;
    case 'parcelado-ou-a-vista':
      return <ParceladoCalc prefill={calcPrefill(slug, params)} />;
    case 'custo-por-ano':
      return <CustoPorAnoCalc prefill={calcPrefill(slug, params)} />;
    case 'custo-da-divida':
      return <CustoDaDividaCalc prefill={calcPrefill(slug, params)} />;
    case 'quitar-antes':
      return <QuitarAntesCalc prefill={calcPrefill(slug, params)} />;
    case 'multa-e-juros':
      return <MultaEJurosCalc prefill={calcPrefill(slug, params)} />;
    case 'plano-dividas':
      return <PlanoDividasCalc />;
    case 'reserva':
      return <ReservaCalc prefill={calcPrefill(slug, params)} />;
    case 'juntar-para-objetivo':
      return <JuntarParaObjetivoCalc prefill={calcPrefill(slug, params)} />;
    case 'dividir-contas':
      return <DividirContasCalc prefill={calcPrefill(slug, params)} />;
  }
}

function Unavailable() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={CALC_UI_TEXT.screenTitle} onBack={() => (router.canGoBack() ? router.back() : router.replace('/calcular'))} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        <Card style={{ gap: space[3] }}>
          <Txt>{CALC_UI_TEXT.unavailable}</Txt>
          <Button label={CALC_UI_TEXT.seeAll} onPress={() => router.replace('/calcular')} />
        </Card>
      </Screen>
    </View>
  );
}
