import { FAMILY_DEPARTED_NAME, FAMILY_TEXT, canEndFamily } from './family';
import type { FamilyOverview } from './family';
import type { RepoErrorCode } from './repository';

/**
 * Excluir minha conta (D-058, Ciclo P), pelas regras de docs/00 (a confirmar com advogado: os prazos de guarda e os textos finais).
 * Regras puras, repetidas no banco por `delete_my_account(p_confirmation, p_key)` (migração 0015):
 *
 * 1. Quem exclui perde o acesso na hora e não desfaz. O e-mail fica livre para uma conta nova, que começa vazia.
 * 2. O Pessoal inteiro é apagado de verdade (não é exclusão lógica).
 * 3. Família: quem é titular com outras pessoas ativas precisa passar a titularidade ou remover as pessoas antes (`transferir_antes`).
 *    Titular sozinha ou sozinho: a Família é encerrada e os dados dela são apagados como no Pessoal. Membro ou leitor sai da Família, e
 *    o que anotou continua como histórico da casa, com a autoria "Pessoa que saiu" (nome e e-mail apagados).
 * 4. Benefício pela empresa: a licença ativa termina no ato (a empresa vê só que terminou) e os direitos ao plano são apagados.
 * 5. Nada é mantido por garantia além do item 3. O rastro técnico da pessoa (P-010) sai junto.
 *
 * Nada aqui lê dados da pessoa nem grava. A tela mostra o que o banco vai fazer; quem decide é o banco.
 */

/** A palavra que a pessoa digita para confirmar. O banco aceita só esta, exatamente; o app aceita também minúsculas e espaços nas pontas. */
export const DELETE_CONFIRMATION_WORD = 'EXCLUIR';

/** O que a pessoa digitou, pronto para comparar: sem os espaços das pontas e em maiúsculas. */
export function normalizeDeleteConfirmation(input: unknown): string {
  return typeof input === 'string' ? input.trim().toLocaleUpperCase('pt-BR') : '';
}

/** A confirmação vale? O que o app envia ao banco é sempre `DELETE_CONFIRMATION_WORD`, nunca o texto digitado. */
export function deleteConfirmationError(input: unknown): 'confirmacao_invalida' | null {
  return normalizeDeleteConfirmation(input) === DELETE_CONFIRMATION_WORD ? null : 'confirmacao_invalida';
}

/**
 * O que acontece com a Família da pessoa ao excluir a conta:
 * - 'nenhuma': não está em nenhuma Família;
 * - 'sai': membro ou leitor (sai, e o que anotou continua com a autoria "Pessoa que saiu");
 * - 'encerra': titular sem outra pessoa ativa (a Família é encerrada e os dados dela, apagados);
 * - 'bloqueia': titular com outras pessoas ativas (precisa passar a titularidade ou remover as pessoas antes).
 */
export type DeleteFamilyOutcome = 'nenhuma' | 'sai' | 'encerra' | 'bloqueia';

export function deleteFamilyOutcome(family: Pick<FamilyOverview, 'role' | 'members'> | null | undefined): DeleteFamilyOutcome {
  if (!family) return 'nenhuma';
  if (family.role !== 'titular') return 'sai';
  return canEndFamily(family.members) ? 'encerra' : 'bloqueia';
}

/** Os códigos que `delete_my_account` lança, além dos comuns (nao_autenticado, chave_invalida, chave_reutilizada). */
export const DELETE_ERROR_CODES: readonly RepoErrorCode[] = ['confirmacao_invalida', 'transferir_antes'];

export const DELETE_TEXT = {
  /** Item de Conta (o último, sem destaque de alerta). */
  entry: 'Excluir minha conta',
  entryHint: 'Apaga a sua conta e os seus dados. Antes de confirmar, a próxima tela mostra o que é apagado e o que continua.',
  entryButton: 'Ver o que é apagado',
  entryA11y: 'Excluir minha conta: ver o que é apagado e o que continua',
  /** A tela. */
  title: 'Excluir minha conta',
  intro: 'Ao excluir, você perde o acesso na hora e não é possível desfazer. O seu e-mail fica livre para uma conta nova, que começa vazia.',
  erasedTitle: 'O que é apagado',
  erased: [
    'O seu Pessoal inteiro, de verdade e não só escondido: gastos e recebimentos, contas a pagar, gastos fixos, parcelamentos e contas do ano.',
    'Metas e movimentos, cartões, lançamentos, faturas e notas, orçamento, limite e renda de referência.',
    'Contas de origem, assinaturas, importações, a revisão dos últimos meses e as respostas do plano de guardar e de "Como você conheceu a Clarevo?".',
    'O histórico de operações e de atividade da sua conta.',
    'O benefício pela empresa, se você tem um: a licença termina na hora e os seus direitos ao plano são apagados. A empresa vê só que a licença terminou.',
  ],
  keptTitle: 'O que continua',
  keptNone: 'Nada fica guardado para uso depois. As cópias de segurança do banco de dados podem manter dados apagados por um tempo.',
  /** A Família de quem excluiu, conforme o papel. */
  familyTitle: 'Sua Família',
  familyNone: 'Você não está em nenhuma Família.',
  familyLoading: 'Conferindo a sua Família…',
  familyLeaves: (familyName: string): string =>
    `Você sai da Família ${familyName}. O que você anotou continua lá, como histórico da casa, com a autoria "${FAMILY_DEPARTED_NAME}". O seu nome e o seu e-mail são apagados.`,
  familyEnds: (familyName: string): string =>
    `Você é a única pessoa ativa da Família ${familyName}. Ela é encerrada e os dados dela são apagados, como o seu Pessoal.`,
  familyBlocked: (familyName: string): string =>
    `Você é titular da Família ${familyName} e há outras pessoas nela. Antes de excluir a conta, passe a titularidade para outra pessoa ou remova as pessoas da Família.`,
  familyBlockedHow: `Na Família, toque em "${FAMILY_TEXT.manage}" ao lado de uma pessoa e escolha "${FAMILY_TEXT.transfer}" ou "${FAMILY_TEXT.remove}".`,
  familyOpen: 'Abrir a Família',
  familyGeneral:
    'Se você anota e vê ou só vê, sai da Família e o que anotou continua, com a autoria "Pessoa que saiu". Se é titular com outras pessoas, passa a titularidade antes. Se é titular sem mais ninguém, a Família é apagada junto.',
  /** Exportar antes (D-047). */
  exportTitle: 'Antes de excluir',
  exportHint: 'Depois de excluir, não há como recuperar. Se quiser guardar uma cópia, exporte os seus dados antes.',
  exportButton: 'Exportar meus dados antes',
  /** Confirmar. */
  confirmTitle: 'Confirmar',
  confirmLabel: 'Digite EXCLUIR para confirmar',
  confirmHint: 'Escreva a palavra EXCLUIR, em maiúsculas ou minúsculas.',
  submit: 'Excluir minha conta',
  submitBusy: 'Excluindo…',
  cancel: 'Cancelar',
  /** Demonstração: a tela abre e explica, mas nada é apagado. */
  demo: 'Na demonstração nada é apagado. Para excluir uma conta de verdade, entre com uma conta sua.',
  /** Depois de excluir: a tela de entrada mostra a faixa e a rota /conta-excluida o texto completo. */
  done: 'Sua conta foi excluída.',
  doneTitle: 'Sua conta foi excluída',
  doneBody: 'Os seus dados foram apagados e o seu e-mail ficou livre. Se um dia quiser voltar, é só criar uma conta nova, que começa vazia.',
  doneCreate: 'Criar uma conta',
  doneStart: 'Voltar ao início',
  /** Resposta perdida: a sessão terminou depois de pedir a exclusão, sem a confirmação do servidor. */
  unsureTitle: 'Não foi possível confirmar a exclusão',
  unsureBody:
    'A conexão caiu antes da resposta e a sessão terminou neste aparelho. Entre de novo para conferir: se a conta foi excluída, o seu e-mail está livre; se não, a conta e os seus dados continuam como estavam.',
  unsureEnter: 'Entrar',
  /** "Quem vê estes dados?". */
  whoSees:
    'Quem exclui a conta apaga o Pessoal inteiro, de verdade. Na Família, quem sai deixa o que anotou como histórico da casa, com a autoria "Pessoa que saiu", sem nome e sem e-mail. Se a pessoa é a única titular, a Família é apagada junto. A empresa só vê que a licença terminou.',
  whoSeesLink: 'Excluir minha conta',
} as const;

/** Mensagens de erro da tela. O que não é conhecido cai em `failed`. */
export const DELETE_ERROR_TEXT = {
  confirmacao_invalida: 'Digite EXCLUIR para confirmar.',
  transferir_antes: 'Antes de excluir a conta, passe a titularidade da Família para outra pessoa ou remova as outras pessoas dela.',
  rede: 'Sem conexão no momento. Tente de novo: se a conta já tiver sido excluída, você sai dela.',
  failed: 'Não foi possível excluir a conta agora. Tente novamente.',
} as const;

/** Texto de um erro da tela; o que não é conhecido cai em "Não foi possível excluir a conta agora...". */
export function deleteErrorText(code: string): string {
  return (DELETE_ERROR_TEXT as Record<string, string>)[code] ?? DELETE_ERROR_TEXT.failed;
}

/** O resumo do que acontece com a Família, em uma frase (a tela escolhe a frase pelo resultado de `deleteFamilyOutcome`). */
export function deleteFamilyText(outcome: DeleteFamilyOutcome, familyName: string): string {
  switch (outcome) {
    case 'nenhuma':
      return DELETE_TEXT.familyNone;
    case 'sai':
      return DELETE_TEXT.familyLeaves(familyName);
    case 'encerra':
      return DELETE_TEXT.familyEnds(familyName);
    case 'bloqueia':
      return DELETE_TEXT.familyBlocked(familyName);
  }
}

/** A pessoa pode confirmar? Só com a palavra certa, sem Família que exija passar a titularidade antes, e fora da demonstração o banco decide o resto. */
export function canSubmitDelete(input: unknown, outcome: DeleteFamilyOutcome): boolean {
  return deleteConfirmationError(input) === null && outcome !== 'bloqueia';
}

/**
 * A exclusão neste aparelho quando a resposta se perde. A tela marca a intenção ANTES de chamar o banco:
 * - 'em-andamento': o pedido saiu e o servidor ainda não respondeu (a conexão caiu, ou a resposta se perdeu);
 * - 'confirmada': o servidor respondeu que a conta foi excluída;
 * - 'nenhuma': nada foi pedido, ou o servidor recusou (a conta segue).
 * Se o servidor excluiu a conta e a resposta se perdeu, a sessão cai sozinha pouco depois (o servidor já não conhece a pessoa); sem a
 * intenção marcada, o app abriria a tela Entrar sem limpar o aparelho e sem dizer nada.
 */
export type DeletionAttempt = 'nenhuma' | 'em-andamento' | 'confirmada';

export interface DeletionIntent {
  /** O pedido vai ser enviado. */
  begin(): void;
  /** O servidor respondeu que a conta foi excluída. */
  confirm(): void;
  /** O servidor recusou (ou a pessoa desistiu antes de pedir): a conta segue. */
  clear(): void;
  /** Lido uma única vez, quando a sessão termina; volta a 'nenhuma'. */
  consume(): DeletionAttempt;
}

/** O marcador fica só na memória do app (nunca em disco). */
export function createDeletionIntent(): DeletionIntent {
  let state: DeletionAttempt = 'nenhuma';
  return {
    begin() {
      state = 'em-andamento';
    },
    confirm() {
      state = 'confirmada';
    },
    clear() {
      state = 'nenhuma';
    },
    consume() {
      const s = state;
      state = 'nenhuma';
      return s;
    },
  };
}

/** Os códigos em que o servidor não respondeu: o resultado é incerto e a mesma chave deve ser reenviada. */
export const DELETE_UNCERTAIN_CODES: readonly string[] = ['rede', 'desconhecido'];

/** A falha deixa o resultado incerto (a conta pode ter sido excluída)? Qualquer outra é uma recusa definitiva: a conta segue. */
export function deleteOutcomeUncertain(code: string): boolean {
  return DELETE_UNCERTAIN_CODES.includes(code);
}

/** O que o app faz quando a sessão termina. */
export type DeletionSessionEnd = {
  /** A tela de entrada que aparece: a conta foi excluída, ou não foi possível confirmar. */
  screen: 'excluida' | 'nao-confirmada';
  /** O aparelho esquece a pessoa (preferências, memórias, lembretes agendados). */
  forgetDevice: boolean;
};

/**
 * A sessão terminou. Com a exclusão confirmada, a tela "Sua conta foi excluída" (o aparelho já foi limpo pela tela). Com o pedido
 * enviado e sem confirmação (a resposta se perdeu e a sessão caiu), o aparelho é limpo do mesmo jeito e a tela diz que não foi possível
 * confirmar, para a pessoa entrar de novo e conferir. Sair do aparelho por vontade própria não é uma exclusão. Sem pedido de
 * exclusão, nada muda aqui (nulo): vale o fluxo de sempre (sessão expirada ou saída manual).
 */
export function sessionEndAfterDeletion(attempt: DeletionAttempt, manualSignOut: boolean): DeletionSessionEnd | null {
  if (attempt === 'confirmada') return { screen: 'excluida', forgetDevice: false };
  if (attempt === 'em-andamento' && !manualSignOut) return { screen: 'nao-confirmada', forgetDevice: true };
  return null;
}
