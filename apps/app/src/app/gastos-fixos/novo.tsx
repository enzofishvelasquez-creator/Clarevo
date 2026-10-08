import { CATEGORIES, DESCRIPTION_MAX, MAX_RECORD_CENTS, charCount, isValidIsoDate, isValidIsoMonth, monthOf } from '@clarevo/core';
import { useLocalSearchParams } from 'expo-router';

import { SeriesForm, type SeriesPrefill } from '@/components/series-form';
import { LoadingState } from '@/components/states';
import { useSpace } from '@/state/data';

/**
 * Parâmetros da rota (todos opcionais): tipo=mensal|parcelada|anual, descricao, valor (centavos), categoria,
 * dia (1 a 31), inicio (AAAA-MM), vencimento (AAAA-MM-DD, vira dia e primeiro mês quando dia e inicio faltam)
 * gasto (AAAA-MM-DD, data do gasto anotado em "Tornar gasto fixo") e origem=digitado (o preenchimento veio do que a
 * pessoa digitou em "Anotar conta a pagar": sair sem salvar pede confirmação).
 * Conta do ano: parcelas (1 a 12; 1 = cota única), mes (1 a 12), ano (primeiro ano, AAAA), modo=fixo|variavel e
 * apos (rótulo do último ano da conta do ano encerrada em "Mudar a forma de pagamento").
 */
type Params = {
  tipo?: string;
  parcelas?: string;
  mes?: string;
  ano?: string;
  modo?: string;
  apos?: string;
  descricao?: string;
  valor?: string;
  categoria?: string;
  dia?: string;
  inicio?: string;
  vencimento?: string;
  gasto?: string;
  origem?: string;
};

/** Só entram valores válidos, campo a campo. */
function prefillFrom(p: Params): SeriesPrefill | undefined {
  const out: SeriesPrefill = {};
  const description = typeof p.descricao === 'string' ? p.descricao.trim() : '';
  if (description && charCount(description) <= DESCRIPTION_MAX) out.description = description;
  if (typeof p.valor === 'string' && /^\d{1,9}$/.test(p.valor)) {
    const cents = Number(p.valor);
    if (cents >= 1 && cents <= MAX_RECORD_CENTS) out.amountCents = cents;
  }
  if (typeof p.categoria === 'string' && CATEGORIES.despesa.includes(p.categoria)) out.category = p.categoria;
  if (typeof p.vencimento === 'string' && isValidIsoDate(p.vencimento)) {
    out.dueDay = Number(p.vencimento.slice(8, 10));
    out.firstMonth = monthOf(p.vencimento);
  }
  if (typeof p.dia === 'string' && /^\d{1,2}$/.test(p.dia) && Number(p.dia) >= 1 && Number(p.dia) <= 31) out.dueDay = Number(p.dia);
  if (typeof p.inicio === 'string' && isValidIsoMonth(p.inicio)) out.firstMonth = p.inicio;
  if (typeof p.gasto === 'string' && isValidIsoDate(p.gasto)) out.basedOn = p.gasto;
  const int = (v: string | undefined, min: number, max: number) =>
    typeof v === 'string' && /^\d{1,4}$/.test(v) && Number(v) >= min && Number(v) <= max ? Number(v) : undefined;
  const parts = int(p.parcelas, 1, 12);
  if (parts !== undefined) out.partsPerYear = parts;
  const month = int(p.mes, 1, 12);
  if (month !== undefined) out.month = month;
  const year = int(p.ano, 2000, 2200);
  if (year !== undefined) out.startYear = year;
  if (p.modo === 'fixo' || p.modo === 'variavel') out.amountMode = p.modo;
  if (typeof p.apos === 'string' && /^\d{4}(\/\d{4})?$/.test(p.apos)) out.endedYear = p.apos;
  return Object.keys(out).length > 0 ? out : undefined;
}

export default function NovoGastoFixo() {
  const params = useLocalSearchParams<Params>();
  const space = useSpace().data;
  if (!space) return <LoadingState />;
  const prefill = prefillFrom(params);
  return (
    <SeriesForm
      kind={params.tipo === 'parcelada' ? 'parcelada' : params.tipo === 'anual' ? 'anual' : 'mensal'}
      prefill={prefill}
      typed={params.origem === 'digitado' && prefill !== undefined}
      space={space}
    />
  );
}
