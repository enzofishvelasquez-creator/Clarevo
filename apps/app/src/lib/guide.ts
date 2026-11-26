import { appScreenIsTab, guideEntryHref } from '@clarevo/core';
import { router, type Href } from 'expo-router';

/**
 * Guia de uso no app (D-049). O catálogo, a busca e as regras do tour vêm do core (`packages/core/src/guide`); aqui ficam só os
 * caminhos das telas. Nada aqui grava, envia ou registra a entrada aberta ou o que a pessoa busca.
 */
export {
  GUIDE_ENTRIES,
  GUIDE_GROUPS,
  GUIDE_TEXT,
  HELP_TEXT,
  TOUR_CARDS,
  TOUR_TEXT,
  guideByGroup,
  guideEntry,
  guideHelpEntry,
  guideSummary,
  guideWhere,
  searchGuide,
  type GuideEntry,
  type HelpScreen,
  type TourCard,
  type TourIcon,
} from '@clarevo/core';

/** Abre a entrada no guia (/aprender/guia/[id]), por cima da tela atual. */
export function openGuideEntry(id: string) {
  router.push(guideEntryHref(id) as Href);
}

/** Abre a tela de uma entrada: uma aba troca de aba; qualquer outra tela empilha por cima. */
export function openGuideScreen(href: string) {
  if (appScreenIsTab({ href })) router.navigate(href as Href);
  else router.push(href as Href);
}
