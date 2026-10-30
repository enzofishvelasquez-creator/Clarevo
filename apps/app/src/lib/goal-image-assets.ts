import type { GoalImageKey } from '@clarevo/core';
import type { ImageSourcePropType } from 'react-native';

/**
 * Fotos das imagens sugeridas das metas (D-077), em `apps/app/assets/metas/`, com licença livre (créditos em
 * docs/33_METAS_COM_IMAGEM.md). Sugestão sem foto aqui aparece como o ícone dela sobre a cor da marca (components/goal-image.tsx).
 */
export const GOAL_IMAGE_ASSETS: Partial<Record<GoalImageKey, ImageSourcePropType>> = {};
