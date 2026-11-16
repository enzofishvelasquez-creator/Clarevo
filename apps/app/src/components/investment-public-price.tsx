import {
  PUBLIC_PRICE_TEXT,
  formatQuantity,
  fundValue,
  investmentErrorText,
  isRepoError,
  newOperationKey,
  treasuryValue,
  type Investment,
} from '@clarevo/core';
import { useState } from 'react';
import { View } from 'react-native';

import { MoneyTxt } from '@/components/money-text';
import { Button, Card, Skeleton, Txt } from '@/components/ui';
import { useInvalidateInvestments, usePublicPrices } from '@/state/data';
import { useRepo, useSession } from '@/state/session';
import { colors, fonts, space, tabular } from '@/theme/tokens';

const T = PUBLIC_PRICE_TEXT;

/**
 * Valor pelo preço público (D-099, itens 19 e 20): nos títulos públicos, a quantidade × o preço de resgate do dia publicado pelo governo
 * federal; nos fundos, a quantidade de cotas × a cota mais recente do Informe Diário da CVM. Sempre com a data, a fonte e "o valor do seu
 * extrato é o que vale"; o valor só é gravado com "Usar este valor". Sem o que falta na ficha, diz o que falta. Só em investimento ativo.
 */
export function InvestmentPublicPriceCard({ investment: i, onNotice }: { investment: Investment; onNotice: (m: string | null) => void }) {
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
  if (prices.isError || !prices.data) return note(T.unavailable);
  const data = prices.data;
  let valueCents: number;
  let line: string;
  let source: string;
  if (isTreasury) {
    if (!data.treasury) return note(T.unavailable);
    const v = treasuryValue(i, data.treasury);
    if (v.kind !== 'ok') return note(v.kind === 'fora_da_oferta' ? T.reason.fora_da_oferta(data.treasury.on) : v.kind === 'sem_quantidade' ? T.reason.sem_quantidade(false) : T.reason[v.kind]);
    valueCents = v.valueCents;
    line = T.treasuryLine(formatQuantity(i.quantityMicro), v.puSellCents, v.on);
    source = T.treasurySource;
  } else {
    if (!(i.fundCnpj! in data.fundos)) return note(T.unavailable);
    const v = fundValue(i, data.fundos);
    if (v.kind !== 'ok') return note(v.kind === 'sem_quantidade' ? T.reason.sem_quantidade(true) : T.reason[v.kind]);
    valueCents = v.valueCents;
    line = T.fundLine(formatQuantity(i.quantityMicro), v.quota, v.on);
    source = T.fundSource;
  }
  const differs = valueCents !== i.valueCents || i.lastValueOn !== today;

  async function use() {
    if (busy) return;
    setBusy(true);
    setError(null);
    onNotice(null);
    try {
      await repo.addInvestmentMovement(key, i.id, 'valor', { amountCents: valueCents, occurredOn: today, note: null });
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
