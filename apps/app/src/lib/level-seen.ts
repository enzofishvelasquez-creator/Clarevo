import { isAccountLevel, type AccountLevel } from '@clarevo/core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * O último nível da conta que este aparelho já mostrou à pessoa (D-095), para o card de comemoração aparecer uma vez só a cada troca de
 * nível. Guardado só neste aparelho (localStorage na web, AsyncStorage no celular), numa chave com o identificador da pessoa. Ler ou
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

/** Ao sair da conta ou excluí-la (`forgetDevice`): o nível visto desta pessoa sai do aparelho. Nunca falha. */
export async function forgetLevelSeen(personId: string): Promise<void> {
  const key = `${PREFIX}${personId}`;
  memory.delete(key);
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    } else await AsyncStorage.removeItem(key);
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
