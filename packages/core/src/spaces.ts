import { BUSINESS_TEXT } from './business';
import { FAMILY_TEXT, contextName } from './family';
import type { ContextKind } from './records';

/**
 * Seletor de espaço sempre à vista (D-113b, 18/11/2026). Retorno de quem testa: no alto de Análises ("Pessoal · Novembro de 2026"), uma
 * pessoa perguntou "Como eu mudo a versão do pessoal para o de negócios?", e o espaço Negócio só se criava por um card de Conta. O Enzo
 * pede o seletor à vista: nas abas que dependem do espaço (Resumo, Movimentos e Metas), o seletor aparece sempre, mesmo só com o
 * Pessoal, com um "+" enquanto houver um espaço para criar (o Negócio e a Família); nas telas de consulta, a pílula do espaço abre a
 * mesma folha, para trocar de espaço e criar. Formulários e detalhes continuam com a pílula fixa.
 *
 * Mudança do estudo de 25/11/2026 (D-125, sinal 22): o seletor para quem só tem o Pessoal e o "Pessoal" repetido em Metas pareciam
 * descuido. O seletor das abas e a pílula que troca de espaço só aparecem com mais de um espaço, e cada tela diz o espaço uma vez só. Só com
 * o Pessoal, o espaço Negócio e a Família se criam em Conta e pelo atalho "Tem um negócio?" dos Primeiros passos do Resumo.
 */

/** Um espaço que a pessoa pode criar pela folha, na ordem da folha. */
export type CreatableSpace = 'negocio' | 'familia';

/** Um espaço que a pessoa tem, com o nome do seletor ("Pessoal", "Família" ou o nome do negócio). */
export interface SpaceChoice {
  kind: ContextKind;
  label: string;
}

/**
 * Os espaços da pessoa, na ordem do seletor (Pessoal, a Família e o negócio), e os que ela ainda pode criar (o Negócio primeiro, depois a
 * Família). `family` e `business` são `undefined` enquanto a leitura não chegou: o espaço não aparece e também não é oferecido para
 * criar (o "+" não pisca para quem já tem um). `null` é "não tem".
 */
export function spaceChoices(
  family: boolean | undefined,
  business: { name: string } | null | undefined,
): { spaces: SpaceChoice[]; creatable: CreatableSpace[] } {
  const spaces: SpaceChoice[] = [{ kind: 'pessoal', label: contextName('pessoal') }];
  if (family) spaces.push({ kind: 'familia', label: contextName('familia') });
  if (business) spaces.push({ kind: 'negocio', label: contextName('negocio', business.name) });
  const creatable: CreatableSpace[] = [];
  if (business === null) creatable.push('negocio');
  if (family === false) creatable.push('familia');
  return { spaces, creatable };
}

/** O nome curto de um espaço para criar: "Negócio" ou "Família". */
const CREATABLE_NAME: Readonly<Record<CreatableSpace, string>> = { negocio: BUSINESS_TEXT.context, familia: FAMILY_TEXT.context };

/** Textos do seletor e da folha de espaços. */
export const SPACE_TEXT = {
  /** Nome acessível do "+" do seletor: "Criar um espaço: Negócio ou Família" (só o que ainda dá para criar). */
  createA11y: (creatable: readonly CreatableSpace[]): string => `Criar um espaço: ${creatable.map((k) => CREATABLE_NAME[k]).join(' ou ')}`,
  /** Título da folha quando só há o que criar. */
  createTitle: 'Criar um espaço',
  createIntro: 'Cada espaço guarda os próprios lançamentos. O Pessoal continua separado.',
  /** Título da folha aberta pela pílula, com mais de um espaço. */
  switchTitle: 'Escolher o espaço',
  /** Nome acessível do grupo dos espaços na folha. */
  switchGroup: 'Espaço',
  /** Nome acessível de um espaço na folha: "Pessoal", "Família" ou "Negócio Sacolé da Maria". */
  choiceA11y: (choice: SpaceChoice): string => (choice.kind === 'negocio' ? `${BUSINESS_TEXT.context} ${choice.label}` : choice.label),
  /** As opções de criar. */
  businessOption: BUSINESS_TEXT.accountTitle,
  businessHint: BUSINESS_TEXT.spaceHint,
  familyOption: FAMILY_TEXT.title,
  familyHint: FAMILY_TEXT.spaceHint,
  /** Nome acessível de uma opção de criar: o nome e a frase. */
  optionA11y: (kind: CreatableSpace): string =>
    kind === 'negocio' ? `${BUSINESS_TEXT.accountTitle}. ${BUSINESS_TEXT.spaceHint}` : `${FAMILY_TEXT.title}. ${FAMILY_TEXT.spaceHint}`,
  /** Dica da pílula que abre a folha (leitor de tela). */
  pillHint: 'Abre a escolha do espaço',
  close: 'Fechar',
} as const;
