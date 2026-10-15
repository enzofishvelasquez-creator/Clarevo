import { barModeFor, normalizePath } from '../navigation';

/**
 * Quando o tour de boas-vindas pode aparecer (D-049(2)). O tour é um modal de cinco cartões, mostrado uma vez por pessoa em cada
 * aparelho, sempre pulável. Ele nunca abre sobre formulários nem sobre a faixa "Seus últimos meses" (D-030), nem muda a estrutura
 * do Resumo ou o card "Primeiros passos" (D-033).
 */
export interface TourState {
  /** Endereço em que o tour seria mostrado. */
  pathname: string;
  /** As preferências do aparelho já foram lidas. Enquanto não, o tour espera. */
  prefsLoaded: boolean;
  /** A pessoa já viu ou pulou o tour neste aparelho. */
  seen: boolean;
  /** Contexto Pessoal (a Família ainda não tem Resumo). */
  personal: boolean;
  /** Faixa "Seus últimos meses": 'pendente' enquanto a revisão carrega, 'visivel' com algo a conferir, 'oculta' no resto. */
  reviewBand: 'pendente' | 'visivel' | 'oculta';
  /** O ambiente desligou o tour (só o roteiro automatizado faz isso). */
  disabled?: boolean;
}

/**
 * O tour abre só no Resumo (a primeira aba, onde a pessoa chega ao entrar; nunca num formulário, passo a passo, tela de consulta
 * aberta por cima de uma aba ou tela de entrada), com as preferências lidas, ainda não visto, no Pessoal e com a revisão dos
 * últimos meses resolvida e sem faixa.
 */
export function shouldShowTour(state: TourState): boolean {
  return (
    state.disabled !== true &&
    state.prefsLoaded &&
    !state.seen &&
    state.personal &&
    state.reviewBand === 'oculta' &&
    barModeFor(state.pathname) === 'abas' &&
    normalizePath(state.pathname) === '/'
  );
}
