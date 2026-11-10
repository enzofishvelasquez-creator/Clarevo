/**
 * "É um recebimento? Registrar recebimento" (e o inverso) no fim de Anotar gasto (docs/10 A4): passa o que a pessoa já digitou
 * (descrição, valor, data e a conta) para o formulário do outro tipo, que o pega ao abrir. O mesmo caminho leva um parcelamento que
 * fala em cartão para Anotar gasto como compra no cartão (docs/10 A15). A categoria não vai, porque as listas de
 * gasto e de recebimento são outras. Fica SÓ em memória, vale uma vez e por poucos segundos, como o comprovante da troca de tipo.
 */
export interface HandedDraft {
  description: string;
  amountText: string;
  dateText: string;
  /** A conta de origem (nula quando o rascunho vem de um parcelamento: a compra vai para o cartão). */
  accountId: string | null;
  /**
   * "Anotar como compra no cartão" num parcelamento que fala em cartão ou fatura (docs/10 A15): Anotar gasto abre já em "Cartão de
   * crédito", com o número de parcelas.
   */
  card?: { installmentsText: string };
}

const TTL_MS = 30_000;
let pending: { draft: HandedDraft; at: number } | null = null;

export const draftHandoff = {
  set(draft: HandedDraft) {
    pending = { draft, at: Date.now() };
  },
  /** Entrega o rascunho guardado (uma vez) ou null se não há ou se já passou o tempo. */
  take(): HandedDraft | null {
    const current = pending;
    pending = null;
    return current && Date.now() - current.at <= TTL_MS ? current.draft : null;
  },
};
