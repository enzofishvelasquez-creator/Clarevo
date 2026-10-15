import type { ComprovanteReading } from '@clarevo/core';

/**
 * Passa o comprovante já lido de Anotar gasto para Registrar recebimento (e o inverso) quando a pessoa toca em "Trocar para...":
 * o formulário novo o pega ao abrir, sem pedir o PDF de novo. Fica SÓ em memória (só os campos que o leitor devolve: tipo, direção,
 * valor, data e hora, nome da outra ponta e mensagem, nunca o texto do PDF, documento, chave nem códigos), vale uma vez e por
 * poucos segundos: se a troca não chegar a abrir o formulário, o comprovante não fica esperando para aparecer em outra tela.
 */
const TTL_MS = 30_000;
let pending: { reading: ComprovanteReading; at: number } | null = null;

export const comprovanteHandoff = {
  set(reading: ComprovanteReading) {
    pending = { reading, at: Date.now() };
  },
  /** Entrega o comprovante guardado (uma vez) ou null se não há ou se já passou o tempo. */
  take(): ComprovanteReading | null {
    const current = pending;
    pending = null;
    return current && Date.now() - current.at <= TTL_MS ? current.reading : null;
  },
  clear() {
    pending = null;
  },
};
