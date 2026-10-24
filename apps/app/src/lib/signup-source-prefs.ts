import type { IsoDate, SignupSourceDevice } from '@clarevo/core';
import { signupSourceNotNowUntil } from '@clarevo/core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * O que este aparelho sabe da pergunta "Como você conheceu o Clarevo?" (D-067), por pessoa, guardado só aqui (localStorage na web,
 * AsyncStorage no celular), nunca no servidor:
 * - `firstSeenOn`: o dia em que este aparelho viu o Resumo da pessoa pela primeira vez. A pergunta só aparece a partir do dia seguinte;
 * - `notNowUntil`: até quando o "Agora não" vale (30 dias); a pergunta volta nesse dia.
 * Só datas, nenhuma resposta. Ler ou gravar pode falhar (navegação privada, armazenamento cheio ou bloqueado): a falha nunca quebra o
 * Resumo. Sem leitura, a pergunta não aparece (nunca insistir por falta de memória); sem gravação, o que vale é a cópia em memória
 * enquanto o app estiver aberto. A conta de demonstração não usa isto (a pergunta nunca aparece nela). Excluir a conta apaga a chave
 * (device-forget.ts).
 */

const PREFIX = 'clarevo.como-conheceu.v1.';
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const EMPTY: SignupSourceDevice = { firstSeenOn: null, notNowUntil: null };
/** Cópia em memória, por pessoa: evita ler o armazenamento de novo a cada montagem e vale quando não dá para gravar. */
const memory = new Map<string, SignupSourceDevice>();

const day = (v: unknown): IsoDate | null => (typeof v === 'string' && ISO_DAY.test(v) ? v : null);

function parse(raw: string | null | undefined): SignupSourceDevice {
  if (!raw) return { ...EMPTY };
  try {
    const v = JSON.parse(raw) as { firstSeenOn?: unknown; notNowUntil?: unknown };
    return { firstSeenOn: day(v.firstSeenOn), notNowUntil: day(v.notNowUntil) };
  } catch {
    return { ...EMPTY };
  }
}

function webStorage(): Storage | null {
  if (Platform.OS !== 'web') return null;
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Leitura imediata quando possível (memória e web); undefined quando só a leitura assíncrona do celular responde. */
function readNow(key: string): SignupSourceDevice | undefined {
  const cached = memory.get(key);
  if (cached) return cached;
  if (Platform.OS !== 'web') return undefined;
  let value: SignupSourceDevice;
  try {
    value = parse(webStorage()?.getItem(key));
  } catch {
    value = { ...EMPTY };
  }
  memory.set(key, value);
  return value;
}

async function read(key: string): Promise<SignupSourceDevice> {
  const now = readNow(key);
  if (now) return now;
  let value: SignupSourceDevice;
  try {
    value = parse(await AsyncStorage.getItem(key));
  } catch {
    value = { ...EMPTY };
  }
  // Gravado durante a leitura (um toque rápido em "Agora não") continua valendo.
  const meanwhile = memory.get(key);
  if (meanwhile) return meanwhile;
  memory.set(key, value);
  return value;
}

function write(key: string, value: SignupSourceDevice) {
  memory.set(key, value);
  const raw = JSON.stringify(value);
  try {
    if (Platform.OS === 'web') webStorage()?.setItem(key, raw);
    else AsyncStorage.setItem(key, raw).catch(() => {});
  } catch {
    // Sem armazenamento: vale só enquanto o app estiver aberto.
  }
}

/** Esquece, neste aparelho, o que se guardou da pessoa (excluir a conta, D-058): a memória e o armazenamento. */
export function forgetSignupSourcePrefs(userId: string): void {
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
 * O que o aparelho sabe da pergunta para a pessoa. `ready` falso enquanto a leitura não terminou (e sem pessoa): nesse tempo a pergunta
 * não aparece. `markSeen(hoje)` guarda o primeiro dia de uso, uma vez; `notNow(hoje)` fecha a pergunta por 30 dias.
 */
export function useSignupSourceDevice(userId: string | undefined) {
  const key = userId ? `${PREFIX}${userId}` : null;
  const [state, setState] = useState<{ key: string; value: SignupSourceDevice } | null>(() => {
    if (!key) return null;
    const now = readNow(key);
    return now ? { key, value: now } : null;
  });
  const known = state && key && state.key === key ? state.value : null;

  useEffect(() => {
    if (!key || known) return;
    let alive = true;
    read(key).then((value) => {
      if (alive) setState({ key, value });
    });
    return () => {
      alive = false;
    };
  }, [key, known]);

  const markSeen = useCallback(
    (today: IsoDate) => {
      if (!key || !known || known.firstSeenOn !== null) return;
      const next = { ...known, firstSeenOn: today };
      write(key, next);
      setState({ key, value: next });
    },
    [key, known],
  );

  const notNow = useCallback(
    (today: IsoDate) => {
      if (!key || !known) return;
      const next = { ...known, firstSeenOn: known.firstSeenOn ?? today, notNowUntil: signupSourceNotNowUntil(today) };
      write(key, next);
      setState({ key, value: next });
    },
    [key, known],
  );

  return { ready: known !== null, device: known ?? EMPTY, markSeen, notNow };
}
