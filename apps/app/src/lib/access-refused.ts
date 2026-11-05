/**
 * Assinatura paga (D-083): o banco recusou uma escrita com assinatura_necessaria (a conta passou a só ver e exportar enquanto o app
 * estava aberto). Quem ouve (state/access.ts) recarrega a situação do acesso, e as telas escondem o que grava.
 */
type Listener = () => void;
const listeners = new Set<Listener>();

export const accessRefused = {
  notify() {
    for (const l of listeners) l();
  },
  listen(l: Listener): () => void {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};
