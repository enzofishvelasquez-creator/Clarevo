import { isAccountLevel, type AccountLevel } from '@clarevo/core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * O último nível da conta que este aparelho já mostrou à pessoa (D-095), para o card de comemoração aparecer uma vez só a cada troca de
 * nível (o maior já visto: a volta depois de uma queda, D-111, não comemora de novo), e, no fim do arquivo, o aviso de queda dispensado. Guardado só neste aparelho (localStorage na web, AsyncStorage no celular), numa chave com o identificador da pessoa. Ler ou
 * gravar pode falhar (navegação privada, armazenamento cheio): a falha nunca quebra a tela; vale a cópia em memória. Na demonstração,
 * as contas existem só na memória e o identificador se repete: ali o nível visto também fica só na memória.
 */
const PREFIX = 'clarevo.nivel-visto.v1.';
const memory = new Map<string, AccountLevel>();

async function readStored(key: string): Promise<AccountLevel | null> {
  try {
    const raw = Platform.OS === 'web' ? (typeof localStorage === 'undefined' ? null : localStorage.getItem(key)) : await AsyncStorage.getItem(key);
    return isAccountLevel(raw) ? raw : null;
  } catch {
    return null;
  }
}

async function writeStored(key: string, level: AccountLevel): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, level);
    } else await AsyncStorage.setItem(key, level);
  } catch {
    // Sem armazenamento: a cópia em memória vale enquanto o app estiver aberto.
  }
}

/** Ao sair da conta ou excluí-la (`forgetDevice`): o nível visto e o aviso dispensado desta pessoa saem do aparelho. Nunca falha. */
export async function forgetLevelSeen(personId: string): Promise<void> {
  const key = `${PREFIX}${personId}`;
  const warningKey = `${WARNING_PREFIX}${personId}`;
  memory.delete(key);
  warningMemory.delete(warningKey);
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
        localStorage.removeItem(warningKey);
      }
    } else await AsyncStorage.multiRemove([key, warningKey]);
  } catch {
    // Sem armazenamento: não há o que apagar.
  }
}

/** `loaded` falso enquanto lê; `level` nulo quando este aparelho ainda não viu nível nenhum desta pessoa. */
export function useLevelSeen(personId: string | undefined, persist: boolean) {
  const key = personId ? `${PREFIX}${personId}` : null;
  const [state, setState] = useState<{ key: string | null; loaded: boolean; level: AccountLevel | null }>({ key: null, loaded: false, level: null });
  useEffect(() => {
    if (!key) return;
    const cached = memory.get(key);
    if (cached || !persist) {
      setState({ key, loaded: true, level: cached ?? null });
      return;
    }
    let alive = true;
    void readStored(key).then((level) => {
      if (!alive) return;
      if (level) memory.set(key, level);
      setState({ key, loaded: true, level: memory.get(key) ?? null });
    });
    return () => {
      alive = false;
    };
  }, [key, persist]);
  const mark = useCallback(
    (level: AccountLevel) => {
      if (!key) return;
      memory.set(key, level);
      setState({ key, loaded: true, level });
      if (persist) void writeStored(key, level);
    },
    [key, persist],
  );
  const current = state.key === key ? state : { loaded: false, level: null };
  return { loaded: current.loaded, level: current.level, mark };
}

/**
 * O aviso de queda do nível que a pessoa dispensou com "Agora não" (D-111), para ele só voltar no próximo marco de tempo (o aviso seguinte
 * tem outra chave: outro começo de contagem ou outro degrau). Guardado só neste aparelho, como o nível visto; o mesmo "Agora não" vale para
 * o Resumo, o card de Conta e a tela do nível. Na demonstração, só na memória.
 */
const WARNING_PREFIX = 'clarevo.nivel-aviso.v1.';
const warningMemory = new Map<string, string>();
const warningListeners = new Set<() => void>();

async function readWarning(key: string): Promise<string | null> {
  try {
    const raw = Platform.OS === 'web' ? (typeof localStorage === 'undefined' ? null : localStorage.getItem(key)) : await AsyncStorage.getItem(key);
    return typeof raw === 'string' && raw.length > 0 && raw.length <= 40 ? raw : null;
  } catch {
    return null;
  }
}

async function writeWarning(key: string, value: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    } else await AsyncStorage.setItem(key, value);
  } catch {
    // Sem armazenamento: a cópia em memória vale enquanto o app estiver aberto.
  }
}

/** `loaded` falso enquanto lê; `dismissed` é a chave do último aviso dispensado neste aparelho (nula se nenhum). */
export function useLevelWarningDismissed(personId: string | undefined, persist: boolean) {
  const key = personId ? `${WARNING_PREFIX}${personId}` : null;
  const [state, setState] = useState<{ key: string | null; loaded: boolean; dismissed: string | null }>({ key: null, loaded: false, dismissed: null });
  useEffect(() => {
    if (!key) return;
    let alive = true;
    const sync = () => alive && setState({ key, loaded: true, dismissed: warningMemory.get(key) ?? null });
    warningListeners.add(sync);
    if (warningMemory.has(key) || !persist) sync();
    else
      void readWarning(key).then((v) => {
        if (v && !warningMemory.has(key)) warningMemory.set(key, v);
        sync();
      });
    return () => {
      alive = false;
      warningListeners.delete(sync);
    };
  }, [key, persist]);
  const dismiss = useCallback(
    (warningKey: string) => {
      if (!key) return;
      warningMemory.set(key, warningKey);
      for (const l of warningListeners) l();
      if (persist) void writeWarning(key, warningKey);
    },
    [key, persist],
  );
  const current = state.key === key ? state : { loaded: false, dismissed: null };
  return { loaded: current.loaded, dismissed: current.dismissed, dismiss };
}
