import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * A fila dos avisos temporários do Resumo (pedido do Enzo em 12/11/2026: "definir uma ordem e um limite para não poluir"). Cada aviso
 * diz se quer aparecer (`useNotice`) e a fila deixa aparecer só os primeiros, na ordem combinada, até o limite: hoje, um por vez, como
 * já era a regra de "Seus últimos meses", "Primeiros passos" e "Como você conheceu a Clarevo?". O aviso que espera aparece quando o da
 * frente some (concluído, dispensado ou fechado). Os avisos da assinatura e dos termos não entram na fila: aparecem sempre.
 */
export const RESUMO_NOTICE_ORDER = ['retorno', 'passos', 'nivel', 'orcamento', 'extra', 'origem'] as const;
export type ResumoNoticeId = (typeof RESUMO_NOTICE_ORDER)[number];
export const RESUMO_NOTICE_LIMIT = 1;

type Queue = { want: (id: ResumoNoticeId, on: boolean) => void; shown: readonly ResumoNoticeId[] };
const QueueContext = createContext<Queue | null>(null);

export function NoticeQueue({ children, limit = RESUMO_NOTICE_LIMIT }: { children: ReactNode; limit?: number }) {
  const [wanted, setWanted] = useState<Partial<Record<ResumoNoticeId, boolean>>>({});
  const want = useCallback((id: ResumoNoticeId, on: boolean) => {
    setWanted((w) => (Boolean(w[id]) === on ? w : { ...w, [id]: on }));
  }, []);
  const shownKey = RESUMO_NOTICE_ORDER.filter((id) => wanted[id]).slice(0, limit).join(',');
  const value = useMemo<Queue>(() => ({ want, shown: shownKey ? (shownKey.split(',') as ResumoNoticeId[]) : [] }), [want, shownKey]);
  return <QueueContext.Provider value={value}>{children}</QueueContext.Provider>;
}

/** Diz à fila se este aviso quer aparecer e devolve se ele pode aparecer agora. Fora de uma fila, aparece sempre que quiser. */
export function useNotice(id: ResumoNoticeId, wants: boolean): boolean {
  const queue = useContext(QueueContext);
  const want = queue?.want;
  useEffect(() => {
    if (!want) return;
    want(id, wants);
    return () => want(id, false);
  }, [want, id, wants]);
  if (!queue) return wants;
  return wants && queue.shown.includes(id);
}

/** Só marca na fila um aviso que outro trecho da tela desenha (a faixa "Seus últimos meses" e "Primeiros passos"). */
export function NoticeClaim({ id, wants }: { id: ResumoNoticeId; wants: boolean }) {
  useNotice(id, wants);
  return null;
}
