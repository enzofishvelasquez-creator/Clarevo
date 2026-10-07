/** Mensagem curta para a próxima tela (ex.: "Gasto salvo" ao abrir o detalhe). Lida uma única vez. */
let message: string | null = null;

export const flash = {
  set(m: string) {
    message = m;
  },
  take(): string | null {
    const m = message;
    message = null;
    return m;
  },
};
