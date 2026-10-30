import { normalizeDescription } from './importar/dedupe';
import type { GoalType } from './records';

/**
 * Imagem das metas (D-077). Cada meta mostra uma imagem: a que a pessoa escolheu entre as sugeridas, a foto que ela mandou (guardada na
 * Clarevo, até 300 KB) ou, sem escolha, a sugerida pelo nome e pelo tipo da meta ("Viagem para a Grécia" → praia; reserva → porquinho).
 * Nas telas, "Porquinho" e nunca "cofrinho" nem "caixinha", que são nomes de produtos de bancos (a palavra só serve para reconhecer o nome).
 * As sugeridas são fotos com licença livre (créditos em docs/33_METAS_COM_IMAGEM.md); enquanto a foto de uma sugestão não existe no app,
 * aparece o ícone dela sobre a cor da marca.
 */

export type GoalImageKey =
  | 'viagem'
  | 'reserva'
  | 'carro'
  | 'casa'
  | 'estudos'
  | 'casamento'
  | 'bebe'
  | 'tecnologia'
  | 'saude'
  | 'aposentadoria'
  | 'pet'
  | 'objetivo';

export interface GoalImageSuggestion {
  key: GoalImageKey;
  /** Nome curto na escolha de imagem. */
  label: string;
  /** Texto alternativo (leitor de tela). */
  alt: string;
  /** Palavras (sem acento, minúsculas) que, no nome da meta, puxam esta imagem. A primeira sugestão que combina vence. */
  words: readonly string[];
}

/** Na ordem em que a escolha mostra e em que o nome é conferido. "objetivo" é a de qualquer meta sem pista. */
export const GOAL_IMAGES: readonly GoalImageSuggestion[] = [
  {
    key: 'viagem',
    label: 'Viagem',
    alt: 'Praia de água azul com casas brancas',
    words: ['viagem', 'viagens', 'viajar', 'ferias', 'praia', 'grecia', 'europa', 'turismo', 'passeio', 'lua de mel', 'mochilao', 'cruzeiro', 'exterior', 'disney'],
  },
  {
    key: 'reserva',
    label: 'Porquinho',
    alt: 'Porquinho de guardar moedas',
    words: ['reserva', 'imprevisto', 'imprevistos', 'emergencia', 'guardar', 'poupar', 'poupanca', 'cofrinho', 'colchao'],
  },
  { key: 'carro', label: 'Carro', alt: 'Carro na estrada', words: ['carro', 'moto', 'veiculo', 'automovel', 'habilitacao', 'cnh'] },
  {
    key: 'casa',
    label: 'Casa',
    alt: 'Fachada de uma casa com jardim',
    words: ['casa', 'imovel', 'apartamento', 'apto', 'entrada', 'reforma', 'mudanca', 'terreno', 'moveis', 'casa propria'],
  },
  {
    key: 'estudos',
    label: 'Estudos',
    alt: 'Livros abertos sobre uma mesa',
    words: ['estudo', 'estudos', 'faculdade', 'curso', 'pos', 'mestrado', 'doutorado', 'intercambio', 'escola', 'livros', 'idioma', 'ingles', 'formatura', 'vestibular'],
  },
  { key: 'casamento', label: 'Casamento', alt: 'Duas alianças', words: ['casamento', 'casar', 'noivado', 'aliancas'] },
  { key: 'bebe', label: 'Bebê', alt: 'Sapatinhos de bebê', words: ['bebe', 'filho', 'filha', 'filhos', 'gravidez', 'enxoval', 'maternidade', 'paternidade'] },
  {
    key: 'tecnologia',
    label: 'Tecnologia',
    alt: 'Notebook e celular sobre uma mesa',
    words: ['celular', 'notebook', 'computador', 'tablet', 'videogame', 'console', 'televisao', 'tv', 'camera'],
  },
  { key: 'saude', label: 'Saúde', alt: 'Tênis de corrida e garrafa de água', words: ['saude', 'cirurgia', 'tratamento', 'dentista', 'oculos', 'academia', 'plano de saude'] },
  { key: 'aposentadoria', label: 'Futuro', alt: 'Nascer do sol sobre o mar', words: ['aposentadoria', 'aposentar', 'futuro', 'previdencia', 'independencia', 'liberdade'] },
  { key: 'pet', label: 'Pet', alt: 'Cachorro olhando para a câmera', words: ['pet', 'cachorro', 'cachorra', 'gato', 'gata', 'veterinario'] },
  { key: 'objetivo', label: 'Objetivo', alt: 'Trilha subindo uma montanha', words: [] },
];

export const GOAL_IMAGE_KEYS: readonly GoalImageKey[] = GOAL_IMAGES.map((g) => g.key);

export function isGoalImageKey(value: unknown): value is GoalImageKey {
  return typeof value === 'string' && (GOAL_IMAGE_KEYS as readonly string[]).includes(value);
}

export function goalImageOf(key: GoalImageKey): GoalImageSuggestion {
  return GOAL_IMAGES.find((g) => g.key === key)!;
}

/** Sugestão pelo nome e pelo tipo: a reserva para imprevistos é sempre o porquinho; sem pista no nome, "objetivo". */
export function suggestGoalImage(name: string, goalType: GoalType): GoalImageKey {
  if (goalType === 'emergencia') return 'reserva';
  const padded = ` ${normalizeDescription(name)} `;
  for (const g of GOAL_IMAGES) {
    if (g.words.some((w) => padded.includes(` ${w} `) || padded.includes(` ${w}s `))) return g.key;
  }
  return 'objetivo';
}

/** Imagem guardada de uma meta (goal_images): a sugestão escolhida OU a foto da pessoa. Sem linha: a sugestão automática. */
export interface GoalImage {
  goalId: string;
  /** Sugestão escolhida (null quando a imagem é uma foto). */
  imageKey: GoalImageKey | null;
  hasPhoto: boolean;
  /** Versão da imagem (0 quando não há linha): sobe a cada troca; serve também para buscar a foto de novo. */
  version: number;
  updatedAt: string | null;
}

/** O que mostrar: foto da pessoa, sugestão escolhida ou a automática. */
export type GoalImageView =
  | { kind: 'foto'; goalId: string; version: number }
  | { kind: 'sugestao'; key: GoalImageKey; chosen: boolean };

export function goalImageView(goal: { id: string; name: string; goalType: GoalType }, image: GoalImage | null | undefined): GoalImageView {
  if (image?.hasPhoto) return { kind: 'foto', goalId: goal.id, version: image.version };
  if (image?.imageKey && isGoalImageKey(image.imageKey)) return { kind: 'sugestao', key: image.imageKey, chosen: true };
  return { kind: 'sugestao', key: suggestGoalImage(goal.name, goal.goalType), chosen: false };
}

/** set_goal_image: escolher uma sugestão, mandar uma foto (JPEG, PNG ou WebP em base64, até 300 KB) ou voltar à automática. */
export type GoalImageChoice = { kind: 'sugestao'; key: GoalImageKey } | { kind: 'foto'; base64: string } | { kind: 'automatica' };

/** Limite da foto no banco (bytes, depois de decodificar o base64). O app reduz antes de mandar (lado maior de 1080 px). */
export const GOAL_PHOTO_MAX_BYTES = 300 * 1024;
/** Lado maior da foto depois de reduzida no aparelho. */
export const GOAL_PHOTO_MAX_SIDE = 1080;

export const GOAL_IMAGE_TEXT = {
  change: 'Trocar imagem',
  title: 'Imagem da meta',
  intro: 'Escolha uma das sugeridas ou uma foto sua. A imagem aparece na meta e na lista de metas.',
  suggestedTitle: 'Sugeridas',
  automatic: (label: string) => `Automática (agora: ${label})`,
  automaticHint: 'Muda sozinha conforme o nome da meta.',
  photoTitle: 'Sua foto',
  pickPhoto: 'Escolher uma foto',
  replacePhoto: 'Escolher outra foto',
  removePhoto: 'Tirar a foto',
  photoHint: 'A foto é reduzida antes de enviar e fica guardada na Clarevo, só para quem vê esta meta. Escolha uma foto que você pode compartilhar.',
  familyHint: 'Na Família, todas as pessoas do espaço veem a imagem da meta.',
  saving: 'Salvando…',
  saved: 'Imagem salva.',
  tooBig: 'A foto ficou grande demais, mesmo reduzida. Escolha outra.',
  invalid: 'Não deu para ler essa imagem. Escolha uma foto em JPEG, PNG ou WebP.',
  error: 'Não deu para salvar a imagem agora. Tente de novo.',
  photoAlt: (goal: string) => `Foto escolhida para a meta ${goal}`,
} as const;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Os primeiros bytes de um base64 (sem Buffer nem atob: roda igual no app, no servidor e nos testes). */
function headBytes(base64: string, count: number): number[] {
  const clean = base64.replace(/\s+/g, '').slice(0, Math.ceil(count / 3) * 4);
  const out: number[] = [];
  for (let i = 0; i < clean.length && out.length < count; i += 4) {
    const n = [0, 1, 2, 3].map((k) => B64.indexOf(clean[i + k] ?? '='));
    if (n[0]! < 0 || n[1]! < 0) break;
    out.push(((n[0]! << 2) | (n[1]! >> 4)) & 0xff);
    if (n[2]! >= 0) out.push((((n[1]! & 15) << 4) | (n[2]! >> 2)) & 0xff);
    if (n[3]! >= 0) out.push((((n[2]! & 3) << 6) | n[3]!) & 0xff);
  }
  return out.slice(0, count);
}

/** Tipo da foto pelos primeiros bytes (como o banco confere): JPEG, PNG ou WebP; null se não é nenhum. */
export function goalPhotoMime(base64: string): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  const b = headBytes(base64, 12);
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x)) return 'image/png';
  if ([0x52, 0x49, 0x46, 0x46].every((x, i) => b[i] === x) && [0x57, 0x45, 0x42, 0x50].every((x, i) => b[8 + i] === x)) return 'image/webp';
  return null;
}

/** Recusa da foto antes de enviar (as mesmas regras do banco): foto_grande, foto_invalida ou null. */
export function goalPhotoError(base64: string): 'foto_grande' | 'foto_invalida' | null {
  if (base64Bytes(base64) < 1 || goalPhotoMime(base64) === null) return 'foto_invalida';
  return base64Bytes(base64) > GOAL_PHOTO_MAX_BYTES ? 'foto_grande' : null;
}

/** Bytes de um texto em base64 (sem decodificar), para recusar antes de enviar. */
export function base64Bytes(base64: string): number {
  const clean = base64.replace(/\s+/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}
