import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Card "Primeiros passos" do Resumo: some de vez, por pessoa, quando os três passos ficam prontos ("concluido")
 * ou depois de "Agora não" ("dispensado"). Guardado só neste aparelho (localStorage na web, AsyncStorage no
 * celular), numa chave com o identificador da pessoa. Ler ou gravar pode falhar (navegação privada, armazenamento
 * cheio ou bloqueado): a falha nunca quebra o Resumo. Na leitura, o card aparece; na gravação, ele continua
 * fechado enquanto o app estiver aberto, pela cópia em memória.
 *
 * Na demonstração, as contas existem só na memória e o identificador se repete depois de recarregar a página
 * ("pessoa-2"): ali a situação também fica só na memória, para uma conta nova nunca herdar o "Agora não" de outra.
 */
export type FirstStepsClose = 'concluido' | 'dispensado';
export type FirstStepsStatus = 'carregando' | 'aberto' | 'fechado';

const PREFIX = 'clarevo.primeiros-passos.v1.';
/** true: fechado; false: aberto. Evita ler o armazenamento de novo a cada montagem. */
const memory = new Map<string, boolean>();

const isClosed = (value: string | null | undefined) => value === 'concluido' || value === 'dispensado';

function webStorage(): Storage | null {
  if (Platform.OS !== 'web') return null;
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Leitura imediata, quando possível (memória, demonstração, web); undefined quando só a leitura assíncrona responde. */
function readNow(key: string, persist: boolean): boolean | undefined {
  const cached = memory.get(key);
  if (cached !== undefined) return cached;
  if (!persist) return false;
  if (Platform.OS !== 'web') return undefined;
  let closed = false;
  try {
    closed = isClosed(webStorage()?.getItem(key));
  } catch {
    closed = false;
  }
  memory.set(key, closed);
  return closed;
}

async function read(key: string, persist: boolean): Promise<boolean> {
  const now = readNow(key, persist);
  if (now !== undefined) return now;
  let closed = false;
  try {
    closed = isClosed(await AsyncStorage.getItem(key));
  } catch {
    closed = false;
  }
  // Fechado durante a leitura (por exemplo, "Agora não" num toque rápido) continua fechado.
  if (memory.get(key) === true) return true;
  memory.set(key, closed);
  return closed;
}

function write(key: string, value: FirstStepsClose, persist: boolean) {
  memory.set(key, true);
  if (!persist) return;
  try {
    if (Platform.OS === 'web') webStorage()?.setItem(key, value);
    else AsyncStorage.setItem(key, value).catch(() => {});
  } catch {
    // Sem armazenamento: fica fechado só enquanto o app estiver aberto.
  }
}

/** Esquece, neste aparelho, o fechamento do card da pessoa (excluir a conta, D-058): a memória e o que foi gravado. */
export function forgetFirstSteps(userId: string): void {
  forgetDoneSteps(userId);
  const key = `${PREFIX}${userId}`;
  memory.delete(key);
  try {
    if (Platform.OS === 'web') webStorage()?.removeItem(key);
    else AsyncStorage.removeItem(key).catch(() => {});
  } catch {
    // Sem armazenamento: nada a apagar.
  }
}

/**
 * Situação do card para a pessoa. `userId` indefinido (sem sessão ou conta de demonstração com dados) fica em
 * "carregando", que nunca mostra o card. `persist` falso guarda só em memória (demonstração).
 */
export function useFirstSteps(userId: string | undefined, persist: boolean) {
  const key = userId ? `${PREFIX}${userId}` : null;
  const [state, setState] = useState<{ key: string; closed: boolean } | null>(() => {
    if (!key) return null;
    const now = readNow(key, persist);
    return now === undefined ? null : { key, closed: now };
  });
  const known = state && key && state.key === key ? state : null;

  useEffect(() => {
    if (!key || known) return;
    let alive = true;
    read(key, persist).then((closed) => {
      if (alive) setState({ key, closed });
    });
    return () => {
      alive = false;
    };
  }, [key, persist, known]);

  const close = useCallback(
    (value: FirstStepsClose) => {
      if (!key) return;
      write(key, value, persist);
      setState({ key, closed: true });
    },
    [key, persist],
  );

  const status: FirstStepsStatus = !known ? 'carregando' : known.closed ? 'fechado' : 'aberto';
  return { status, close };
}

// ---------------------------------------------------------------------------------------------------------------------
// Passos já concluídos (docs/10 A25): um passo que ficou pronto continua pronto, mesmo quando o mês vira e o Recebido e o Pago do
// mês novo começam vazios. Guardado como o fechamento do card: só neste aparelho, por pessoa, e só em memória na demonstração.
// ---------------------------------------------------------------------------------------------------------------------
const STEPS_PREFIX = 'clarevo.primeiros-passos.passos.v1.';
const stepsMemory = new Map<string, string[]>();

function parseSteps(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 10) : [];
  } catch {
    return [];
  }
}

function readStepsNow(key: string, persist: boolean): string[] | undefined {
  const cached = stepsMemory.get(key);
  if (cached) return cached;
  if (!persist) return [];
  if (Platform.OS !== 'web') return undefined;
  let steps: string[] = [];
  try {
    steps = parseSteps(webStorage()?.getItem(key));
  } catch {
    steps = [];
  }
  stepsMemory.set(key, steps);
  return steps;
}

function forgetDoneSteps(userId: string): void {
  const key = `${STEPS_PREFIX}${userId}`;
  stepsMemory.delete(key);
  try {
    if (Platform.OS === 'web') webStorage()?.removeItem(key);
    else AsyncStorage.removeItem(key).catch(() => {});
  } catch {
    // Sem armazenamento: nada a apagar.
  }
}

/**
 * Os passos que a pessoa já concluiu neste aparelho. `steps` nulo enquanto a leitura não terminou (o card espera). `add` guarda
 * passos novos (por exemplo, "Não tenho gastos fixos", ou um passo que acabou de ficar pronto).
 */
export function useDoneSteps(userId: string | undefined, persist: boolean) {
  const key = userId ? `${STEPS_PREFIX}${userId}` : null;
  const [state, setState] = useState<{ key: string; steps: string[] } | null>(() => {
    if (!key) return null;
    const now = readStepsNow(key, persist);
    return now === undefined ? null : { key, steps: now };
  });
  const known = state && key && state.key === key ? state : null;

  useEffect(() => {
    if (!key || known) return;
    let alive = true;
    (async () => {
      let steps: string[] = [];
      try {
        steps = parseSteps(await AsyncStorage.getItem(key));
      } catch {
        steps = [];
      }
      const merged = [...new Set([...(stepsMemory.get(key) ?? []), ...steps])];
      stepsMemory.set(key, merged);
      if (alive) setState({ key, steps: merged });
    })();
    return () => {
      alive = false;
    };
  }, [key, known]);

  const add = useCallback(
    (more: readonly string[]) => {
      if (!key) return;
      const current = stepsMemory.get(key) ?? known?.steps ?? [];
      const next = [...new Set([...current, ...more])];
      if (next.length === current.length) return;
      stepsMemory.set(key, next);
      setState({ key, steps: next });
      if (!persist) return;
      try {
        if (Platform.OS === 'web') webStorage()?.setItem(key, JSON.stringify(next));
        else AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => {});
      } catch {
        // Sem armazenamento: vale enquanto o app estiver aberto.
      }
    },
    [key, persist, known],
  );

  return { steps: known ? new Set(known.steps) : null, add };
}
