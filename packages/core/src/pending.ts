import { isRepoError, newOperationKey, type RepoError } from './repository';

/**
 * Tentativas de escrita com resultado incerto (CL-03 e CL-19).
 *
 * Toda escrita vai com uma chave de operação, e o banco devolve o mesmo resultado quando a mesma chave chega de novo (D-012). Quando
 * a conexão cai DEPOIS de enviar, o app não sabe se gravou: guarda a tentativa (chave e conteúdo) e, na próxima, confere se ela foi
 * gravada antes de enviar outra vez. Se a pessoa sai do formulário e anota de novo, a tentativa tem de continuar guardada, senão a
 * segunda anotação sai com chave nova e o lançamento duplica. Por isso a tentativa fica numa memória FORA do formulário: só na
 * memória do app, por pessoa e por tipo de formulário. Nunca vai ao aparelho (nem ao servidor) e some ao sair da conta, ao trocar de
 * pessoa e ao recarregar a página.
 *
 * Regra de segurança: uma tentativa que sobrou de uma visita anterior ao formulário (`carried`) só vale para o MESMO conteúdo. Com
 * outro conteúdo, a pessoa está anotando outra coisa: a tentativa antiga não é conferida nem aproveitada, o registro novo nunca
 * troca nem sobrescreve o que foi gravado antes, e o envio usa SEMPRE uma chave nova (`keyForSend`; a chave antiga voltaria como
 * `chave_reutilizada`). Dentro da mesma visita, o comportamento de sempre continua: depois de uma falha, o preenchimento mudado vira
 * edição do que foi gravado.
 *
 * Entrada idêntica legítima: uma tentativa de visita anterior, conferida e achada gravada, NÃO conclui sozinha. A pessoa pode ter
 * querido anotar outro igual (dois cafés de R$ 8,00 no mesmo dia), então o formulário pergunta ("Este gasto já tinha sido salvo.
 * Anotar outro igual?"): "outro igual" esquece a tentativa e envia com chave nova; "Ver o gasto salvo" resolve a tentativa e abre o
 * que foi gravado. A tentativa de visita anterior vale por 30 minutos (`CARRIED_ATTEMPT_MAX_AGE_MS`); depois, sai da memória e o
 * mesmo conteúdo é uma anotação nova. E o que foi excluído depois nunca conta como salvo: a conferência esquece a tentativa e o
 * envio segue com chave nova.
 */

/** Quanto tempo uma tentativa deixada por uma visita anterior continua valendo: 30 minutos depois de ficar incerta. */
export const CARRIED_ATTEMPT_MAX_AGE_MS = 30 * 60 * 1000;

/** Uma tentativa com resultado incerto: a chave enviada e o conteúdo (texto estável) que ela levava. */
export interface PendingAttempt {
  key: string;
  snapshot: string;
  /** Sobrou de uma visita anterior ao formulário. */
  carried?: boolean;
  /** Quando ficou incerta (milissegundos desde 1970); a validade das tentativas de visitas anteriores conta daqui. */
  at?: number;
}

/** O que um formulário guarda entre tentativas: a chave do próximo envio e as tentativas incertas, da mais antiga para a mais recente. */
export interface AttemptSlot {
  current: string;
  pending: PendingAttempt[];
}

export function newAttemptSlot(): AttemptSlot {
  return { current: newOperationKey(), pending: [] };
}

/**
 * Gravação confirmada ou reconciliada: nada fica pendente e a próxima operação usa outra chave. A chave de uma gravação que deu
 * certo nunca volta a ser enviada: o formulário seguinte, aberto com o mesmo espaço, é outra anotação.
 */
export function settleSlot(slot: AttemptSlot): void {
  slot.pending = [];
  slot.current = newOperationKey();
}

/** Guarda uma tentativa com resultado incerto (falha de rede depois de enviar). */
export function recordUncertain(slot: AttemptSlot, key: string, snapshot: string, now: number = Date.now()): void {
  slot.pending = [...slot.pending, { key, snapshot, at: now }];
}

/**
 * A chave do próximo envio. Reusa a da última tentativa incerta quando o conteúdo é o mesmo (o banco reconhece a repetição); com
 * outro conteúdo, SEMPRE uma chave nova, mesmo que a última tentativa seja de uma visita anterior e por isso não conte como
 * relevante. Girar a chave só dentro do "tem tentativa relevante" reenviava a chave antiga com conteúdo diferente, e o banco
 * recusava com `chave_reutilizada`. Todo formulário que cuida das próprias chaves chama esta função.
 */
export function keyForSend(slot: AttemptSlot, snapshot: string): string {
  const last = slot.pending[slot.pending.length - 1];
  if (last && last.snapshot !== snapshot) slot.current = newOperationKey();
  return slot.current;
}

/** O servidor recusou (nada foi gravado com a chave): a próxima tentativa usa outra. */
export function refuseKey(slot: AttemptSlot): void {
  slot.current = newOperationKey();
}

/**
 * Esquece tentativas que já não valem (a conferência mostrou que o que elas gravaram foi excluído, ou a pessoa escolheu anotar
 * outro igual). Se a chave do próximo envio era de uma delas, gira: reenviá-la devolveria o resultado antigo, em silêncio.
 */
export function dropAttempts(slot: AttemptSlot, match: (attempt: PendingAttempt) => boolean): void {
  const dropped = slot.pending.filter(match);
  if (dropped.length === 0) return;
  slot.pending = slot.pending.filter((a) => !match(a));
  if (dropped.some((a) => a.key === slot.current) && !slot.pending.some((a) => a.key === slot.current)) slot.current = newOperationKey();
}

/** "Anotar outro igual": esquece a tentativa achada gravada (e as outras do mesmo conteúdo); o envio seguinte leva chave nova. */
export function repeatAfterSaved(slot: AttemptSlot, saved: { snapshot: string }): void {
  dropAttempts(slot, (a) => a.snapshot === saved.snapshot);
}

/** A tentativa de uma visita anterior já passou da validade? Sem horário guardado, não expira. */
export function attemptExpired(attempt: PendingAttempt, now: number = Date.now()): boolean {
  return attempt.at !== undefined && now - attempt.at > CARRIED_ATTEMPT_MAX_AGE_MS;
}

/**
 * As tentativas que valem para este envio: todas, se não há conteúdo para comparar ou se são da mesma visita; as de visitas
 * anteriores, só quando o conteúdo é igual ao que está sendo enviado.
 */
export function relevantAttempts(slot: AttemptSlot, snapshot?: string): PendingAttempt[] {
  return slot.pending.filter((a) => !a.carried || (snapshot !== undefined && a.snapshot === snapshot));
}

/** Memória das tentativas incertas, por pessoa e por formulário ("registro:novo:despesa"). */
export class PendingAttemptStore {
  private readonly slots = new Map<string, AttemptSlot>();

  private id(personId: string, scope: string): string {
    return `${personId}\u0000${scope}`;
  }

  /**
   * Abre uma visita ao formulário: devolve o espaço guardado (ou um novo), esquece o que passou da validade (30 minutos) e marca como
   * `carried` o que sobrou. Chame uma vez por abertura do formulário, não a cada desenho da tela.
   */
  adopt(personId: string, scope: string, now: number = Date.now()): AttemptSlot {
    const id = this.id(personId, scope);
    let slot = this.slots.get(id);
    if (!slot) {
      slot = newAttemptSlot();
      this.slots.set(id, slot);
    }
    dropAttempts(slot, (a) => attemptExpired(a, now));
    for (const a of slot.pending) a.carried = true;
    return slot;
  }

  /** O espaço guardado, sem abrir uma visita (testes e leitura). */
  peek(personId: string, scope: string): AttemptSlot | null {
    return this.slots.get(this.id(personId, scope)) ?? null;
  }

  /** Quantas tentativas incertas estão guardadas (de uma pessoa, ou de todas). */
  count(personId?: string): number {
    let n = 0;
    for (const [id, slot] of this.slots) if (personId === undefined || id.startsWith(`${personId}\u0000`)) n += slot.pending.length;
    return n;
  }

  /** Esquece tudo (sair da conta ou trocar de pessoa), ou só o de uma pessoa. */
  clear(personId?: string): void {
    if (personId === undefined) this.slots.clear();
    else for (const id of [...this.slots.keys()]) if (id.startsWith(`${personId}\u0000`)) this.slots.delete(id);
  }
}

/** O servidor respondeu e recusou (nada foi gravado com a chave). Falha de rede ou erro desconhecido: resultado incerto. */
export function isRefusal(e: unknown): boolean {
  return isRepoError(e) && e.code !== 'rede' && e.code !== 'desconhecido';
}

/**
 * Escrita com chave de operação e reconciliação de resultado incerto (padrão das telas de conta a pagar e de gasto fixo, agora para
 * metas, renda de referência, plano de guardar, cartões e contas). Quem chama guarda as chaves num espaço de tentativas
 * (`OperationKeys`) e passa o conteúdo enviado em `snapshot`.
 *
 * - ok: o servidor confirmou (o cache já está atualizado quando isto volta); nenhuma animação antes disso;
 * - reconciled: uma tentativa anterior com resultado incerto tinha sido gravada (findSaved) e os dados já foram recarregados:
 *   mostrar como concluído;
 * - refused: o servidor respondeu e recusou (nada foi gravado com a chave): mostrar o texto do código;
 * - uncertain: falha de rede ou erro desconhecido; a gravação pode ou não ter acontecido. A tentativa fica guardada e a próxima,
 *   com o mesmo conteúdo, usa a mesma chave (o banco devolve o estado atual, sem gravar de novo). Mostrar `UNCERTAIN_TEXT`.
 */
export interface OperationAttempt {
  key: string;
  snapshot: string;
  /** Sobrou de uma visita anterior ao formulário (a pessoa decide se é o mesmo ou outro igual). */
  carried?: boolean;
}

export interface OperationKeys<F extends object> {
  hasPending: (snapshot?: string) => boolean;
  findSaved: (snapshot?: string) => Promise<(OperationAttempt & F) | null>;
  keyFor: (snapshot: string) => string;
  uncertain: (key: string, snapshot: string) => void;
  settled: () => void;
  refused: () => void;
  /** "Anotar outro igual": esquece a tentativa achada gravada; o envio seguinte leva chave nova. */
  release: (saved: OperationAttempt) => void;
}

export type WriteResult<T, F extends object> =
  | { status: 'ok'; value: T }
  | { status: 'reconciled'; saved: OperationAttempt & F }
  /**
   * Uma tentativa de visita anterior foi achada gravada. Não conclui sozinha: a pessoa escolhe entre ver o que foi salvo
   * (`keys.settled()` e abrir) e anotar outro igual (`keys.release(saved)` e enviar de novo). Nada foi enviado.
   */
  | { status: 'saved_before'; saved: OperationAttempt & F }
  | { status: 'refused'; code: string; detail: string | null }
  | { status: 'uncertain' };

/**
 * As chaves de um espaço de tentativas, no formato que `guardedWrite` e os formulários usam:
 * - o mesmo conteúdo depois de uma falha de rede vai com a mesma chave, e o banco reconhece a repetição (devolve o estado atual,
 *   sem gravar de novo);
 * - antes de repetir, `findSaved` confere com a busca da operação (`find`, quando existe) se alguma tentativa anterior foi gravada;
 * - as tentativas só são esquecidas depois de uma gravação confirmada ou reconciliada (`settled`).
 * Sem `find` (renda de referência, orçamento e resposta do plano de guardar), `findSaved` devolve sempre null e a reconciliação é
 * repetir a mesma chave com o mesmo conteúdo. `refresh` roda quando uma tentativa fica incerta e quando uma foi achada gravada,
 * para as telas abertas lerem de novo.
 */
export function slotKeys<F extends object>(
  slot: AttemptSlot,
  find: ((key: string) => Promise<F | null>) | null,
  refresh: () => void = () => {},
  /**
   * O que a operação gravou ainda existe? Excluído nunca conta como salvo: a tentativa é esquecida e o envio segue com chave nova.
   * Sem esta função, tudo o que a busca da operação achar conta.
   */
  alive?: (found: F) => Promise<boolean>,
): OperationKeys<F> {
  return {
    hasPending: (snapshot) => relevantAttempts(slot, snapshot).length > 0,
    findSaved: async (snapshot) => {
      if (!find) return null;
      for (const attempt of [...relevantAttempts(slot, snapshot)].reverse()) {
        const op = await find(attempt.key);
        if (!op) continue;
        if (alive && !(await alive(op))) {
          // Gravou e foi excluído depois: não há o que mostrar como salvo.
          dropAttempts(slot, (a) => a.key === attempt.key);
          refresh();
          continue;
        }
        refresh();
        return { ...attempt, ...op };
      }
      return null;
    },
    /** Chave do envio: a da última tentativa incerta, se o conteúdo é o mesmo; senão, uma nova. */
    keyFor: (snapshot) => keyForSend(slot, snapshot),
    /** Falha de rede: a gravação pode ou não ter acontecido. */
    uncertain: (key, snapshot) => {
      recordUncertain(slot, key, snapshot);
      refresh();
    },
    /** Gravação confirmada ou reconciliada: nada fica pendente e a próxima operação usa outra chave. */
    settled: () => settleSlot(slot),
    /** Recusa do servidor: nada foi gravado com esta chave; a próxima tentativa usa outra. */
    refused: () => refuseKey(slot),
    release: (saved) => repeatAfterSaved(slot, saved),
  };
}

export async function guardedWrite<T, F extends object>(
  keys: OperationKeys<F>,
  snapshot: string,
  send: (key: string) => Promise<T>,
  accept?: (saved: OperationAttempt & F) => boolean,
  /**
   * Escritas sem busca de operação (renda de referência e resposta do plano de guardar): repetir uma vez, com a mesma chave e o
   * mesmo conteúdo, é a reconciliação (o banco devolve o estado atual, sem gravar de novo). Se a rede continua fora, a segunda
   * tentativa também fica incerta e quem chama mostra a falha.
   */
  options: { retryOnce?: boolean } = {},
): Promise<WriteResult<T, F>> {
  const first = await attempt(keys, snapshot, send, accept);
  if (first.status === 'uncertain' && options.retryOnce) return attempt(keys, snapshot, send, accept);
  return first;
}

async function attempt<T, F extends object>(
  keys: OperationKeys<F>,
  snapshot: string,
  send: (key: string) => Promise<T>,
  accept?: (saved: OperationAttempt & F) => boolean,
): Promise<WriteResult<T, F>> {
  if (keys.hasPending(snapshot)) {
    try {
      const saved = await keys.findSaved(snapshot);
      if (saved && (!accept || accept(saved))) {
        // De uma visita anterior: pode ser outro igual de verdade. Quem chama pergunta; nada é enviado nem esquecido ainda.
        if (saved.carried) return { status: 'saved_before', saved };
        keys.settled();
        return { status: 'reconciled', saved };
      }
      // Foi gravada outra ação (por exemplo, arquivar antes de excluir): a anterior está resolvida e esta é enviada com chave nova.
      if (saved) keys.settled();
    } catch {
      // Não deu para conferir a tentativa anterior: ela continua guardada e é conferida de novo na próxima vez.
      return { status: 'uncertain' };
    }
  }
  const key = keys.keyFor(snapshot);
  try {
    const value = await send(key);
    keys.settled();
    return { status: 'ok', value };
  } catch (e) {
    if (isRefusal(e)) {
      keys.refused();
      const error = e as RepoError;
      return { status: 'refused', code: error.code, detail: error.detail ?? null };
    }
    keys.uncertain(key, snapshot);
    return { status: 'uncertain' };
  }
}
