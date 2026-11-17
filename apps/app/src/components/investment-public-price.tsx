import {
  PUBLIC_PRICE_TEXT,
  VALUE_DATE_TEXT,
  VALUE_SOURCE_NOTE,
  formatBRL,
  formatQuantity,
  valueDateCaption,
  fundValue,
  investmentErrorText,
  isRepoError,
  newOperationKey,
  treasuryValue,
  type Investment,
  type InvestmentMovement,
} from '@clarevo/core';
import { useState } from 'react';
import { View } from 'react-native';

import { MoneyTxt } from '@/components/money-text';
import { maskMoneyText, useValuesHidden } from '@/lib/privacy';
import { Button, Card, Skeleton, Txt } from '@/components/ui';
import { useInvalidateInvestments, usePublicPrices } from '@/state/data';
import { useRepo, useSession } from '@/state/session';
import { colors, fonts, space, tabular } from '@/theme/tokens';

const T = PUBLIC_PRICE_TEXT;

/**
 * Valor pelo preço público (D-099, itens 19 e 20): nos títulos públicos, a quantidade × o preço de resgate do dia publicado pelo governo
 * federal; nos fundos, a quantidade de cotas × a cota mais recente do Informe Diário da CVM. Sempre com a data, a fonte e "o valor do seu
 * extrato é o que vale"; o valor só é gravado com "Usar este valor". Sem o que falta na ficha, diz o que falta. Só em investimento ativo.
 * D-104, item 1: a data do preço ou da cota logo embaixo do valor; "Usar este valor" grava a observação com a data ("Pela cota do fundo de
 * 05/10/2026"); numa falha ao buscar de novo, o último preço conhecido com a data; sem nenhum, o valor registrado com a data (nunca zero).
 * Item 7: com "Ocultar valores", a cota (com mais de duas casas) também some.
 */
export function InvestmentPublicPriceCard({ investment: i, movements, onNotice }: { investment: Investment; movements: readonly InvestmentMovement[]; onNotice: (m: string | null) => void }) {
  const repo = useRepo();
  const { today } = useSession();
  const invalidate = useInvalidateInvestments();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A mesma chave numa nova tentativa depois de uma falha de rede (a atualização não fica duas vezes); outra depois de gravar.
  const [key, setKey] = useState(() => newOperationKey());
  const isTreasury = i.kind === 'titulos_publicos';
  const isFund = i.kind === 'fundos';
  // Só busca quando a ficha tem o necessário (o título com vencimento e quantidade; o fundo com CNPJ e quantidade).
  const canQuery =
    i.status === 'ativo' && i.quantityMicro !== null && ((isTreasury && i.subkind !== null && i.subkind !== 'tesouro_reserva' && i.maturityOn !== null) || (isFund && i.fundCnpj !== null));
  const prices = usePublicPrices(canQuery ? { treasury: isTreasury, fundos: isFund && i.fundCnpj ? [i.fundCnpj] : [] } : null);
  const hidden = useValuesHidden();
  if (i.status !== 'ativo' || (!isTreasury && !isFund)) return null;

  const title = isTreasury ? T.treasuryTitle : T.fundTitle;
  const header = (
    <Txt variant="title" accessibilityRole="header" aria-level={2}>
      {title}
    </Txt>
  );
  const note = (text: string) => (
    <Card style={{ gap: space[2] }}>
      {header}
      <Txt color={colors.textSecondary}>{text}</Txt>
    </Card>
  );

  // O que falta na ficha (sem consultar).
  if (isTreasury) {
    if (i.subkind === 'tesouro_reserva') return note(T.reason.reserva);
    if (i.subkind === null) return note(T.reason.sem_tipo);
    if (i.maturityOn === null) return note(T.reason.sem_vencimento);
  } else if (i.fundCnpj === null) return note(T.reason.sem_cnpj);
  if (i.quantityMicro === null) return note(T.reason.sem_quantidade(isFund));

  if (prices.isPending) {
    return (
      <Card style={{ gap: space[2] }}>
        {header}
        <View style={{ gap: space[2] }} accessibilityRole="progressbar" accessibilityLabel={T.loading}>
          <Skeleton width="50%" height={18} />
          <Skeleton width="80%" height={14} />
        </View>
      </Card>
    );
  }
  // Sem nenhum preço nesta sessão: o valor registrado, com a data (nunca zero).
  const unavailable = () => (
    <Card style={{ gap: space[2] }}>
      {header}
      <Txt color={colors.textSecondary}>{T.unavailable}</Txt>
      <MoneyTxt variant="caption" color={colors.textSecondary}>
        {VALUE_DATE_TEXT.lastRegistered(i.valueCents, valueDateCaption(movements))}
      </MoneyTxt>
    </Card>
  );
  // Falha ao buscar de novo com um preço já carregado: o último conhecido, com a data (o React Query guarda os dados da última busca).
  if (!prices.data) return unavailable();
  const staleData = prices.isError;
  const data = prices.data;
  let valueCents: number;
  let line: string;
  let source: string;
  let priceDate: string;
  let staleLine: string | null = null;
  let sourceNote: string;
  if (isTreasury) {
    if (!data.treasury) return unavailable();
    const v = treasuryValue(i, data.treasury);
    if (v.kind !== 'ok') return note(v.kind === 'fora_da_oferta' ? T.reason.fora_da_oferta(data.treasury.on) : v.kind === 'sem_quantidade' ? T.reason.sem_quantidade(false) : T.reason[v.kind]);
    valueCents = v.valueCents;
    line = T.treasuryLine(formatQuantity(i.quantityMicro), v.puSellCents, v.on);
    source = T.treasurySource;
    priceDate = VALUE_DATE_TEXT.treasuryDate(v.on);
    if (staleData) staleLine = VALUE_DATE_TEXT.staleTreasury(v.on);
    sourceNote = VALUE_SOURCE_NOTE.treasury(v.on);
  } else {
    if (!(i.fundCnpj! in data.fundos)) return unavailable();
    const v = fundValue(i, data.fundos);
    if (v.kind !== 'ok') return note(v.kind === 'sem_quantidade' ? T.reason.sem_quantidade(true) : T.reason[v.kind]);
    valueCents = v.valueCents;
    // A cota tem mais de duas casas: com "Ocultar valores", ela sai inteira (a máscara geral pega só "R$ 0,00").
    line = T.fundLine(formatQuantity(i.quantityMicro), v.quota, v.on);
    if (hidden) line = line.replace(/R\$\s?[\d.]+,\d+/, maskMoneyText(formatBRL(0), true));
    source = T.fundSource;
    priceDate = VALUE_DATE_TEXT.fundDate(v.on);
    if (staleData) staleLine = VALUE_DATE_TEXT.staleFund(v.on);
    sourceNote = VALUE_SOURCE_NOTE.fund(v.on);
  }
  const differs = valueCents !== i.valueCents || i.lastValueOn !== today;

  async function use() {
    if (busy) return;
    setBusy(true);
    setError(null);
    onNotice(null);
    try {
      await repo.addInvestmentMovement(key, i.id, 'valor', { amountCents: valueCents, occurredOn: today, note: sourceNote });
      setKey(newOperationKey());
      invalidate();
      onNotice(T.used);
    } catch (e) {
      const code = isRepoError(e) ? e.code : 'desconhecido';
      if (code !== 'rede') setKey(newOperationKey());
      invalidate();
      setError(investmentErrorText(code));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: space[2] }}>
      {header}
      <MoneyTxt variant="label" style={[tabular, { fontFamily: fonts.bold, fontSize: 18 }]}>
        {T.value(valueCents)}
      </MoneyTxt>
      <Txt variant="caption" color={colors.textSecondary}>
        {priceDate}
      </Txt>
      {staleLine ? <Txt variant="label">{staleLine}</Txt> : null}
      <MoneyTxt variant="caption" color={colors.textSecondary}>
        {line}
      </MoneyTxt>
      {data.example ? (
        <Txt variant="caption" color={colors.textSecondary}>
          {T.demo}
        </Txt>
      ) : null}
      <Txt variant="caption" color={colors.textSecondary}>
        {source}
      </Txt>
      <Txt variant="caption" color={colors.textSecondary}>
        {T.statementNote}
      </Txt>
      {differs ? <Button label={T.use} tone="soft" busy={busy} onPress={use} /> : null}
      {error ? (
        <Txt variant="label" color={colors.error}>
          {error}
        </Txt>
      ) : null}
    </Card>
  );
}
