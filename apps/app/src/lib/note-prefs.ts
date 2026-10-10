import type { StoreMemory } from '@clarevo/core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * Memórias das notas fiscais guardadas só neste aparelho, por pessoa (nada vai para o servidor):
 * - `cameraUsed`: a câmera já foi usada para ler uma nota, então o toque em "Escanear nota fiscal" abre a câmera direto;
 * - `stores`: descrição e categoria da última nota anotada de cada loja ("Como da última vez nesta loja"), pela chave
 *   `storeMemoryId` (resumo do CNPJ da loja). Guardam-se no máximo 50 lojas, das mais recentes.
 * Nunca guarda a chave de acesso, o link, CPF nem o CNPJ legível. Ler ou gravar pode falhar (navegação privada, armazenamento
 * cheio): vale a cópia em memória. Na demonstração fica só em memória (conta nova nunca herda a de outra).
 */
interface NotePrefs {
  cameraUsed: boolean;
  stores: Record<string, StoreMemory & { at: number }>;
}

const PREFIX = 'clarevo.notas.v1.';
const MAX_STORES = 50;
const EMPTY: NotePrefs = { cameraUsed: false, stores: {} };
const memory = new Map<string, NotePrefs>();
const loading = new Map<string, Promise<NotePrefs>>();
/** Muda a cada `clearNotePrefsMemory`: uma leitura que começou antes da limpeza não guarda o resultado em memória. */
let generation = 0;

function parse(raw: string | null | undefined): NotePrefs {
  if (!raw) return { cameraUsed: false, stores: {} };
  try {
    const v = JSON.parse(raw) as { cameraUsed?: unknown; stores?: unknown };
    const stores: NotePrefs['stores'] = {};
    if (v.stores && typeof v.stores === 'object') {
      for (const [id, m] of Object.entries(v.stores as Record<string, unknown>)) {
        const e = m as { description?: unknown; category?: unknown; at?: unknown };
        if (/^[0-9a-f]{64}$/.test(id) && typeof e.description === 'string' && e.description !== '' && typeof e.at === 'number') {
          stores[id] = { description: e.description.slice(0, 80), category: typeof e.category === 'string' ? e.category : null, at: e.at };
        }
      }
    }
    return { cameraUsed: v.cameraUsed === true, stores };
  } catch {
    return { cameraUsed: false, stores: {} };
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

export function loadNotePrefs(userId: string, persist: boolean): Promise<NotePrefs> {
  const cached = memory.get(userId);
  if (cached) return Promise.resolve(cached);
  const pending = loading.get(userId);
  if (pending) return pending;
  const key = PREFIX + userId;
  const startedIn = generation;
  const run = async (): Promise<NotePrefs> => {
    let prefs: NotePrefs = { ...EMPTY, stores: {} };
    if (persist) {
      try {
        prefs = parse(Platform.OS === 'web' ? webStorage()?.getItem(key) : await AsyncStorage.getItem(key));
      } catch {
        prefs = { ...EMPTY, stores: {} };
      }
    }
    // A limpeza (sair da conta ou trocar de pessoa) vence a leitura em andamento: o resultado dela não vai para a memória.
    if (startedIn !== generation) return prefs;
    const now = memory.get(userId) ?? prefs;
    memory.set(userId, now);
    return now;
  };
  const p: Promise<NotePrefs> = run().then((prefs) => {
    // Só tira a própria leitura: depois de uma limpeza, `loading` pode já ter a de uma leitura nova.
    if (loading.get(userId) === p) loading.delete(userId);
    return prefs;
  });
  loading.set(userId, p);
  return p;
}

function save(userId: string, next: NotePrefs, persist: boolean) {
  memory.set(userId, next);
  if (!persist) return;
  const key = PREFIX + userId;
  const raw = JSON.stringify(next);
  try {
    if (Platform.OS === 'web') webStorage()?.setItem(key, raw);
    else AsyncStorage.setItem(key, raw).catch(() => {});
  } catch {
    // Sem armazenamento: vale enquanto o app estiver aberto.
  }
}

export async function cameraWasUsed(userId: string, persist: boolean): Promise<boolean> {
  return (await loadNotePrefs(userId, persist)).cameraUsed;
}

export async function markCameraUsed(userId: string, persist: boolean): Promise<void> {
  const current = await loadNotePrefs(userId, persist);
  if (!current.cameraUsed) save(userId, { ...current, cameraUsed: true }, persist);
}

export async function storeMemoryOf(userId: string, storeId: string, persist: boolean): Promise<StoreMemory | null> {
  const found = (await loadNotePrefs(userId, persist)).stores[storeId];
  return found ? { description: found.description, category: found.category } : null;
}

export async function rememberStore(userId: string, storeId: string, memoryOfStore: StoreMemory, persist: boolean): Promise<void> {
  const current = await loadNotePrefs(userId, persist);
  const stores = { ...current.stores, [storeId]: { ...memoryOfStore, at: Date.now() } };
  const ids = Object.keys(stores).sort((a, b) => stores[b]!.at - stores[a]!.at);
  for (const id of ids.slice(MAX_STORES)) delete stores[id];
  save(userId, { ...current, stores }, persist);
}

/** Ao sair da conta (ou trocar de pessoa): esquece as memórias em RAM. O que foi gravado no aparelho vale só para a mesma pessoa. */
export function clearNotePrefsMemory(): void {
  generation++;
  memory.clear();
  loading.clear();
}
