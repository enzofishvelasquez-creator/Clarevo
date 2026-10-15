import { savedBeforeText, type SavedBeforeKind } from '@clarevo/core';
import { Info } from 'lucide-react-native';
import { useRef, useState, type ReactNode } from 'react';

import { Banner, Button, Txt } from '@/components/ui';

/**
 * "Este gasto já tinha sido salvo. Anotar outro igual?" (CL-03 e CL-19, revisão do D-050). Quando uma tentativa de uma visita anterior
 * ao formulário é achada gravada, o formulário não conclui sozinho: a pessoa pode estar anotando outro igual de verdade. Duas saídas:
 * "outro igual" (esquece a tentativa e envia com chave nova) e "ver o que foi salvo" (resolve a tentativa e abre). Os textos e as regras
 * estão em `packages/core/src/pending.ts` e `pending-text.ts`.
 */
export function SavedBeforeBanner({
  kind,
  onView,
  onAnother,
  busy = false,
}: {
  kind: SavedBeforeKind;
  onView: () => void;
  onAnother: () => void;
  busy?: boolean;
}) {
  const t = savedBeforeText(kind);
  return (
    <Banner tone="info" icon={Info}>
      <Txt variant="label">{t.message}</Txt>
      {t.another ? <Button label={t.another} tone="soft" onPress={onAnother} disabled={busy} /> : null}
      <Button label={t.view} tone={t.another ? 'ghost' : 'soft'} onPress={onView} disabled={busy} />
    </Banner>
  );
}

/**
 * O estado do aviso num formulário. `watch` é o preenchimento (texto estável): enquanto a pessoa muda o que digitou, o aviso sai da
 * tela, porque já não fala do que está nos campos (um conteúdo diferente nunca usa a tentativa antiga). `onView` e `onAnother`
 * recebem o que o `guardedWrite` devolveu em `saved_before`.
 */
export function useSavedBefore<S>(
  kind: SavedBeforeKind,
  watch: string,
  actions: { onView: (saved: S) => void; onAnother: (saved: S) => void },
  busy = false,
): { show: (saved: S, watchAtSubmit?: string) => void; hide: () => void; active: boolean; banner: ReactNode } {
  const [state, setState] = useState<{ saved: S; watch: string } | null>(null);
  const latest = useRef(watch);
  latest.current = watch;
  const current = state && state.watch === watch ? state : null;
  return {
    // O aviso fala do preenchimento do envio (`watchAtSubmit`); sem ele, do que está nos campos agora.
    show: (saved, watchAtSubmit) => setState({ saved, watch: watchAtSubmit ?? latest.current }),
    hide: () => setState(null),
    active: current !== null,
    banner: current ? (
      <SavedBeforeBanner
        kind={kind}
        busy={busy}
        onView={() => {
          setState(null);
          actions.onView(current.saved);
        }}
        onAnother={() => {
          setState(null);
          actions.onAnother(current.saved);
        }}
      />
    ) : null,
  };
}
