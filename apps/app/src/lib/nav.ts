import { createDeletionIntent } from '@clarevo/core';
import { router, type Href } from 'expo-router';

/**
 * Destino a retomar depois que a sessão expira e a mesma pessoa entra de novo.
 * Guardado só em memória.
 */
let destination: { path: string; userId: string } | null = null;
let manualSignOut = false;

export const afterLogin = {
  set(path: string | null, userId: string) {
    destination = path && path !== '/' && !path.startsWith('/carregando') ? { path, userId } : null;
  },
  /** Há um destino pendente (para decidir entre Entrar e Boas-vindas)? */
  pending(): boolean {
    return destination !== null;
  },
  take(userId: string): string | null {
    const d = destination;
    destination = null;
    return d && d.userId === userId ? d.path : null;
  },
};

export const signOutIntent = {
  mark() {
    manualSignOut = true;
  },
  consume(): boolean {
    const m = manualSignOut;
    manualSignOut = false;
    return m;
  },
};

/**
 * Excluir a conta (D-058): a tela marca a intenção antes de chamar o banco e o hook a confirma ou a limpa conforme a resposta. Lida uma
 * única vez, quando a sessão termina: com a exclusão confirmada, a sessão que termina não é "expirou" (que voltaria a Entrar para
 * retomar o destino) e a tela que aparece é "Sua conta foi excluída"; com o pedido sem resposta (a resposta se perdeu e a sessão caiu),
 * o aparelho é limpo e a tela diz que não foi possível confirmar. Só na memória do app.
 */
export const deletedAccountIntent = createDeletionIntent();

let summaryFromTop = false;

/**
 * "Ver resumo do mês": volta ao Resumo que já está na pilha, em vez de empilhar outra cópia dele,
 * e pede que ele apareça do topo, com os totais à vista. Quem chama define antes o mês e o contexto.
 */
export function openSummary() {
  summaryFromTop = true;
  router.dismissTo('/');
}

/** Lido pelo Resumo ao receber o foco: true uma única vez depois de openSummary. */
export const summaryTop = {
  take(): boolean {
    const t = summaryFromTop;
    summaryFromTop = false;
    return t;
  },
};

const TAB_TARGET = /^\/(movimentacoes|metas|aprender)\/?(\?|$)/;

/**
 * Abre uma tela pedida (endereço da versão web ou destino depois de entrar de novo). Abas substituem a pilha;
 * as outras telas ficam por cima do Resumo, para "Voltar" sempre ter para onde ir.
 */
export function restoreTarget(target: string) {
  if (TAB_TARGET.test(target)) router.replace(target as Href);
  else {
    router.replace('/');
    router.push(target as Href);
  }
}
