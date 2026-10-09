import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useEffect, useState } from 'react';

import { ConfirmDialog } from '@/components/dialog';
import { Txt } from '@/components/ui';
import { colors } from '@/theme/tokens';

/**
 * Sair de um formulário com alterações não salvas pede confirmação (voltar, gesto, botão do sistema), como em Anotar
 * gasto e Anotar conta a pagar. `leave(fn)` sai sem perguntar (depois de salvar); `requestCancel` é o "Cancelar" e o
 * "Voltar" do cabeçalho. `fallback` é para onde ir quando não há tela anterior (endereço aberto direto na web).
 */
export function useLeaveGuard(dirty: boolean, fallback: string) {
  const navigation = useNavigation();
  const [leaveTo, setLeaveTo] = useState<null | (() => void)>(null);
  const [confirmDiscard, setConfirmDiscard] = useState<null | (() => void)>(null);

  usePreventRemove(dirty && !leaveTo, ({ data }) => {
    setConfirmDiscard(() => () => navigation.dispatch(data.action));
  });

  useEffect(() => {
    if (leaveTo) leaveTo();
  }, [leaveTo]);

  const leave = (fn: () => void) => setLeaveTo(() => fn);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace(fallback as never));
  const requestCancel = () => {
    if (dirty) setConfirmDiscard(() => goBack);
    else goBack();
  };

  const dialog = (
    <ConfirmDialog
      visible={Boolean(confirmDiscard)}
      title="Descartar o preenchimento?"
      cancelLabel="Continuar editando"
      confirmLabel="Descartar alterações"
      onCancel={() => setConfirmDiscard(null)}
      onConfirm={() => {
        const action = confirmDiscard;
        setConfirmDiscard(null);
        if (action) leave(action);
      }}>
      <Txt color={colors.textSecondary}>Você tem alterações que ainda não foram salvas.</Txt>
    </ConfirmDialog>
  );

  return { leave, requestCancel, dialog };
}
