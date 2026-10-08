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
