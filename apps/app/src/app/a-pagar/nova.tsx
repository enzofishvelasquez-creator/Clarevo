import { isChoosableExpenseCategory, DESCRIPTION_MAX, MAX_RECORD_CENTS, charCount, isValidIsoDate, type CommitmentInput } from '@clarevo/core';
import { useLocalSearchParams } from 'expo-router';

import { CommitmentForm } from '@/components/commitment-form';
import { LoadingState } from '@/components/states';
import { useWork } from '@/state/data';

type Params = { descricao?: string; valor?: string; vencimento?: string; categoria?: string; origem?: string };

/** Preenchimento opcional pela rota ("Adicionar a conta do próximo mês"): só entram valores válidos, campo a campo. */
function prefillFrom(p: Params): Partial<CommitmentInput> | undefined {
  const out: Partial<CommitmentInput> = {};
  const description = typeof p.descricao === 'string' ? p.descricao.trim() : '';
  if (description && charCount(description) <= DESCRIPTION_MAX) out.description = description;
  if (typeof p.valor === 'string' && /^\d{1,9}$/.test(p.valor)) {
    const cents = Number(p.valor);
    if (cents >= 1 && cents <= MAX_RECORD_CENTS) out.amountCents = cents;
  }
  if (typeof p.vencimento === 'string' && isValidIsoDate(p.vencimento)) out.dueOn = p.vencimento;
  if (isChoosableExpenseCategory(p.categoria)) out.category = p.categoria;
  return Object.keys(out).length > 0 ? out : undefined;
}

export default function NovaContaAPagar() {
  const params = useLocalSearchParams<Params>();
  const space = useWork().data;
  if (!space) return <LoadingState />;
  // origem=registro (D-107): veio de "Cadastrar conta a pagar" em Anotar gasto; depois de salvar, volta para lá.
  return <CommitmentForm mode={{ type: 'nova', prefill: prefillFrom(params), backToRecord: params.origem === 'registro' }} space={space} />;
}
