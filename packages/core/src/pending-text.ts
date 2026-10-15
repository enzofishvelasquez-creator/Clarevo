/**
 * Textos de "já tinha sido salvo" (CL-03 e CL-19, revisão do D-050): quando uma tentativa de uma visita anterior ao formulário é
 * achada gravada, o formulário não conclui sozinho, porque a pessoa pode estar anotando outro igual de verdade (dois cafés de
 * R$ 8,00 no mesmo dia). Ele pergunta, com duas saídas: anotar outro igual (chave nova) ou ver o que foi salvo.
 *
 * Cada tipo de formulário tem o seu substantivo, no gênero certo. Onde um segundo igual não é possível pelas regras (uma conta já
 * paga não é paga duas vezes; só há uma reserva para imprevistos), não há pergunta nem "outro igual": só "ver".
 */

export type SavedBeforeKind =
  | 'gasto'
  | 'recebimento'
  | 'compra'
  | 'conta-a-pagar'
  | 'pagamento'
  | 'gasto-fixo'
  | 'parcelamento'
  | 'conta-do-ano'
  | 'meta'
  | 'reserva'
  | 'aporte'
  | 'resgate'
  | 'rendimento'
  | 'cartao'
  | 'conta'
  | 'fatura-pagamento'
  | 'fatura-lancamento';

export interface SavedBeforeText {
  /** O aviso, com a pergunta quando há "outro igual". */
  message: string;
  /** O botão que envia outro igual, com chave nova; null onde um segundo igual não é possível. */
  another: string | null;
  /** O botão que abre o que foi salvo. */
  view: string;
}

export const SAVED_BEFORE_TEXT: Record<SavedBeforeKind, SavedBeforeText> = {
  gasto: { message: 'Este gasto já tinha sido salvo. Anotar outro igual?', another: 'Anotar outro igual', view: 'Ver o gasto salvo' },
  recebimento: { message: 'Este recebimento já tinha sido salvo. Anotar outro igual?', another: 'Anotar outro igual', view: 'Ver o recebimento salvo' },
  compra: { message: 'Esta compra já tinha sido salva. Anotar outra igual?', another: 'Anotar outra igual', view: 'Ver a compra salva' },
  'conta-a-pagar': { message: 'Esta conta a pagar já tinha sido salva. Anotar outra igual?', another: 'Anotar outra igual', view: 'Ver a conta salva' },
  pagamento: { message: 'Este pagamento já tinha sido registrado. A conta já está paga.', another: null, view: 'Ver a conta paga' },
  'gasto-fixo': { message: 'Este gasto fixo já tinha sido salvo. Criar outro igual?', another: 'Criar outro igual', view: 'Ver o gasto fixo salvo' },
  parcelamento: { message: 'Este parcelamento já tinha sido salvo. Criar outro igual?', another: 'Criar outro igual', view: 'Ver o parcelamento salvo' },
  'conta-do-ano': { message: 'Esta conta do ano já tinha sido salva. Criar outra igual?', another: 'Criar outra igual', view: 'Ver a conta do ano salva' },
  meta: { message: 'Esta meta já tinha sido salva. Criar outra igual?', another: 'Criar outra igual', view: 'Ver a meta salva' },
  reserva: { message: 'Esta reserva já tinha sido salva. Só pode haver uma reserva para imprevistos.', another: null, view: 'Ver a reserva salva' },
  aporte: { message: 'Este aporte já tinha sido salvo. Anotar outro igual?', another: 'Anotar outro igual', view: 'Ver a meta' },
  resgate: { message: 'Este resgate já tinha sido salvo. Anotar outro igual?', another: 'Anotar outro igual', view: 'Ver a meta' },
  rendimento: { message: 'Este rendimento já tinha sido salvo. Anotar outro igual?', another: 'Anotar outro igual', view: 'Ver a meta' },
  cartao: { message: 'Este cartão já tinha sido salvo. Cadastrar outro igual?', another: 'Cadastrar outro igual', view: 'Ver o cartão salvo' },
  conta: { message: 'Esta conta já tinha sido salva. Cadastrar outra igual?', another: 'Cadastrar outra igual', view: 'Ver a conta salva' },
  'fatura-pagamento': {
    message: 'Este pagamento da fatura já tinha sido registrado. Registrar outro igual?',
    another: 'Registrar outro igual',
    view: 'Ver a fatura',
  },
  'fatura-lancamento': { message: 'Este lançamento já tinha sido salvo. Anotar outro igual?', another: 'Anotar outro igual', view: 'Ver a fatura' },
};

/** Os textos de um tipo de formulário. */
export function savedBeforeText(kind: SavedBeforeKind): SavedBeforeText {
  return SAVED_BEFORE_TEXT[kind];
}
