import type { GoalImageKey } from '@clarevo/core';
import type { ImageSourcePropType } from 'react-native';

/**
 * Fotos das imagens sugeridas das metas (D-077), em `apps/app/assets/metas/`, da Unsplash com uso gratuito (autoria e links em
 * docs/33_METAS_COM_IMAGEM.md). Recortadas em 16:9, 1080 x 608 px, até cerca de 150 KB. Sugestão sem foto aqui aparece como o ícone
 * dela sobre a cor da marca (components/goal-image.tsx).
 */
export const GOAL_IMAGE_ASSETS: Partial<Record<GoalImageKey, ImageSourcePropType>> = {
  viagem: require('../../assets/metas/viagem.jpg'),
  reserva: require('../../assets/metas/reserva.jpg'),
  carro: require('../../assets/metas/carro.jpg'),
  casa: require('../../assets/metas/casa.jpg'),
  estudos: require('../../assets/metas/estudos.jpg'),
  casamento: require('../../assets/metas/casamento.jpg'),
  bebe: require('../../assets/metas/bebe.jpg'),
  tecnologia: require('../../assets/metas/tecnologia.jpg'),
  saude: require('../../assets/metas/saude.jpg'),
  aposentadoria: require('../../assets/metas/aposentadoria.jpg'),
  pet: require('../../assets/metas/pet.jpg'),
  objetivo: require('../../assets/metas/objetivo.jpg'),
};
