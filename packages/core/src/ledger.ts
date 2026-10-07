import type { FinancialEvent } from './events';

/**
 * Registro de eventos em memória com proteção contra envio duplicado.
 * Serve ao protótipo e aos testes; a versão persistente aplica a mesma regra
 * com índice único (context_id, idempotency_key) no banco.
 */
export class Ledger {
  private events: FinancialEvent[];

  constructor(initial: readonly FinancialEvent[] = []) {
    this.events = [...initial];
  }

  all(): readonly FinancialEvent[] {
    return this.events;
  }

  /** Insere o evento. Se a mesma chave já foi usada no contexto, devolve o existente sem duplicar. */
  add(event: FinancialEvent): { event: FinancialEvent; created: boolean } {
    const existing = this.events.find(
      (e) => e.contextId === event.contextId && e.idempotencyKey === event.idempotencyKey,
    );
    if (existing) return { event: existing, created: false };
    this.events = [...this.events, event];
    return { event, created: true };
  }

  update(id: string, changes: Partial<Omit<FinancialEvent, 'id' | 'createdBy' | 'createdAt'>>, now: string) {
    const current = this.events.find((e) => e.id === id);
    if (!current) throw new Error('Evento não encontrado');
    if (current.deletedAt) throw new Error('Evento excluído não pode ser editado');
    const next = { ...current, ...changes, updatedAt: now };
    this.events = this.events.map((e) => (e.id === id ? next : e));
    return next;
  }

  remove(id: string, now: string) {
    return this.update(id, { deletedAt: now }, now);
  }
}
