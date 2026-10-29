import type { IsoDate } from './dates';
import { formatDateBR, todayIn } from './dates';
import type { ContextKind } from './records';
import type { RepoErrorCode } from './repository';
import { sha256Hex } from './sha256';
import { charCount, ERROR_TEXT } from './validation';

/**
 * Família (D-055, Ciclo L; docs/13). Regras puras, repetidas no banco pelas funções create_family, create_family_invite,
 * cancel_family_invite, accept_family_invite, leave_family, remove_family_member, set_member_role, transfer_family_ownership e
 * end_family (migração 0013), pelas recomendações L-1 a L-8:
 *
 * - L-1: aberta a todas as pessoas durante o piloto (nenhuma trava por plano).
 * - L-2: até 6 pessoas, contando quem é titular (pessoas ativas mais convites ainda válidos).
 * - L-3: uma Família por pessoa, por vez.
 * - L-4: na Família, quem anota marca como paga a conta criada por outra pessoa; desfazer só para quem pagou ou quem edita o que é
 *   de outras pessoas; alterar e excluir seguem a regra de edição (regra do banco, sem tela própria).
 * - L-5: a renda de referência é da casa: quem anota cria, altera e exclui.
 * - L-6: quem sai continua nos registros antigos como "ex-membro" e o primeiro nome. Nunca o e-mail.
 * - L-7: o titular não sai: passa a titularidade a outra pessoa ou encerra a Família.
 * - L-8: o convite é um link enviado pelo próprio aparelho, sem custo de envio. O servidor guarda só o resumo SHA-256 do código.
 *
 * Papéis: titular (lê, anota e edita o que é de outras pessoas), membro ("anota e vê": lê e anota) e leitor ("só vê"). O Pessoal de
 * cada pessoa nunca fica visível para a Família, nem aceitar um convite copia ou mostra algo dele.
 */

/** Papel de uma pessoa na Família. */
export type FamilyRole = 'titular' | 'membro' | 'leitor';
/** Papel que um convite oferece (o titular só se torna por transferência). */
export type InviteRole = 'membro' | 'leitor';
/** Situação do vínculo: ativo, ou ex-membro (saiu ou foi removido). */
export type MemberStatus = 'ativo' | 'ex-membro';

export const FAMILY_ROLES: readonly FamilyRole[] = ['titular', 'membro', 'leitor'];
export const INVITE_ROLES: readonly InviteRole[] = ['membro', 'leitor'];

/** Pessoas por Família, contando quem é titular (L-2). */
export const FAMILY_MAX_PEOPLE = 6;
/** Validade de um convite, em dias. */
export const INVITE_VALID_DAYS = 7;
/** Tamanho do nome da Família. */
export const FAMILY_NAME_MAX = 60;
/** Endereço do app na web: o link do convite abre aqui e funciona no navegador e no app. */
export const INVITE_BASE_URL = 'https://app.clarevo.app.br';
/** O código tem 128 bits em 32 hexadecimais minúsculos. */
export const INVITE_CODE_PATTERN = /^[0-9a-f]{32}$/;

/** A Família como o app a lê. */
export interface FamilyContext {
  id: string;
  name: string;
  createdAt: string;
}

/** Uma pessoa da Família, ativa ou ex-membro. firstName é só o primeiro nome (nunca o e-mail). */
export interface FamilyMember {
  personId: string;
  firstName: string;
  role: FamilyRole;
  status: MemberStatus;
  isMe: boolean;
  joinedAt: string;
  leftAt: string | null;
}

/** Convite (sem o resumo do código): válido enquanto não usado, não cancelado e antes de expiresAt. */
export interface FamilyInvite {
  id: string;
  contextId: string;
  role: InviteRole;
  createdBy: string;
  expiresAt: string;
  usedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

/** A Família da pessoa: o contexto, o papel dela, as pessoas e, só para o titular, os convites ainda válidos. */
export interface FamilyOverview {
  context: FamilyContext;
  role: FamilyRole;
  members: FamilyMember[];
  invites: FamilyInvite[];
}

/** Resultado de criar a Família e de aceitar um convite: a Família e o papel de quem entrou (invitedBy: só ao aceitar). */
export interface FamilyJoin {
  context: FamilyContext;
  role: FamilyRole;
  invitedBy: string | null;
}

/** Resultado de criar um convite. code vem uma única vez; ao repetir a mesma chave, vem null (cancele e gere outro). */
export interface FamilyInviteWrite {
  invite: FamilyInvite;
  code: string | null;
}

/** O que a prévia mostra antes de aceitar: só o nome da Família, o primeiro nome de quem convidou, o papel e a validade. */
export interface FamilyInvitePreview {
  familyName: string;
  invitedBy: string;
  role: InviteRole;
  expiresAt: string;
}

/** Ações da Família gravadas em record_operations (alvo em target_id); nenhuma conta como anotação na atividade (D-030). */
export type FamilyAction =
  | 'criar_familia'
  | 'criar_convite_familia'
  | 'cancelar_convite_familia'
  | 'aceitar_convite_familia'
  | 'sair_familia'
  | 'remover_membro_familia'
  | 'alterar_papel_familia'
  | 'transferir_titularidade_familia'
  | 'encerrar_familia';

export const FAMILY_ACTIONS: readonly FamilyAction[] = [
  'criar_familia',
  'criar_convite_familia',
  'cancelar_convite_familia',
  'aceitar_convite_familia',
  'sair_familia',
  'remover_membro_familia',
  'alterar_papel_familia',
  'transferir_titularidade_familia',
  'encerrar_familia',
];

export function isFamilyAction(action: string): action is FamilyAction {
  return (FAMILY_ACTIONS as readonly string[]).includes(action);
}

// ---------------------------------------------------------------------------
// Validação (a mesma do banco)
// ---------------------------------------------------------------------------

/** Rótulo de quem não tem nome para mostrar: nome vazio, que parece e-mail ou que é o início do e-mail (a mesma frase do banco). */
export const FAMILY_NEUTRAL_NAME = 'Pessoa da Família';
/**
 * Rótulo de quem excluiu a conta (D-058): o que a pessoa anotou continua na Família como histórico da casa, e a autoria passa a ser
 * esta frase, sem nome e sem e-mail (a mesma do banco, na visão family_member_items). É o único primeiro nome com espaço, além do
 * neutro, e nenhum nome de verdade tem esta forma: um primeiro nome nunca tem espaço.
 */
export const FAMILY_DEPARTED_NAME = 'Pessoa que saiu';

/**
 * Primeiro nome para mostrar a outras pessoas (L-6): a primeira palavra do nome, no máximo 40 caracteres. O e-mail de outra pessoa
 * nunca aparece: o nome vazio, o que tem arroba na primeira palavra e o que é o início do e-mail (`email`, antes do arroba; é o
 * nome que o banco grava quando a pessoa não informa um) viram "Pessoa da Família". A comparação com o início do e-mail é exata,
 * no nome inteiro e na primeira palavra. É a mesma regra de clarevo_first_name no banco.
 */
export function firstNameOf(displayName: string, email?: string | null): string {
  const name = (typeof displayName === 'string' ? displayName : '').trim();
  const first = name.split(/\s+/)[0] ?? '';
  const local = (typeof email === 'string' ? email : '').split('@')[0]!.slice(0, 80);
  if (first === '' || first.includes('@') || (local !== '' && (name === local || first === local))) return FAMILY_NEUTRAL_NAME;
  return first.slice(0, 40);
}

/** Nome da Família sem os espaços das pontas. */
export function normalizeFamilyName(name: string): string {
  return typeof name === 'string' ? name.trim() : '';
}

/** Nome de 1 a 60 caracteres (depois de tirar os espaços das pontas), contados como o banco conta (char_length). */
export function familyNameError(name: string): 'nome_da_familia_invalido' | null {
  const n = normalizeFamilyName(name);
  const size = charCount(n);
  return size >= 1 && size <= FAMILY_NAME_MAX ? null : 'nome_da_familia_invalido';
}

export function isInviteRole(role: unknown): role is InviteRole {
  return role === 'membro' || role === 'leitor';
}

export function inviteRoleError(role: unknown): 'papel_invalido' | null {
  return isInviteRole(role) ? null : 'papel_invalido';
}

/** Código de convite escrito como a pessoa o recebe (maiúsculas e espaços nas pontas valem): 32 hexadecimais minúsculos, ou null. */
export function normalizeInviteCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const code = input.trim().toLowerCase();
  return INVITE_CODE_PATTERN.test(code) ? code : null;
}

/** Resumo SHA-256 do código (o que o banco guarda); null se o código não tem o formato certo. */
export function inviteCodeHash(input: unknown): string | null {
  const code = normalizeInviteCode(input);
  return code === null ? null : sha256Hex(code);
}

/** O link do convite: `${base}/convite/${código}`. */
export function inviteLink(code: string, base: string = INVITE_BASE_URL): string {
  return `${base.replace(/\/+$/, '')}/convite/${code}`;
}

/** O código de um texto colado: o próprio código ou um link `…/convite/<código>`. Nulo se não houver código válido. */
export function inviteCodeFromText(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const direct = normalizeInviteCode(text);
  if (direct) return direct;
  const m = /\/convite\/([0-9a-fA-F]{32})(?![0-9a-fA-F])/.exec(text);
  return m ? normalizeInviteCode(m[1]) : null;
}

/** O convite ainda vale: não usado, não cancelado e antes do vencimento. */
export function inviteIsValid(invite: Pick<FamilyInvite, 'usedAt' | 'cancelledAt' | 'expiresAt'>, nowMs: number): boolean {
  return invite.usedAt === null && invite.cancelledAt === null && Date.parse(invite.expiresAt) > nowMs;
}

/** Dia (no fuso da pessoa) até o qual o convite vale. */
export function inviteExpiryDay(expiresAt: string, timeZone: string): IsoDate {
  return todayIn(timeZone, new Date(expiresAt));
}

/** Vagas livres: seis menos as pessoas ativas e os convites ainda válidos (L-2). */
export function seatsLeft(overview: Pick<FamilyOverview, 'members' | 'invites'>, nowMs: number): number {
  const active = overview.members.filter((m) => m.status === 'ativo').length;
  const pending = overview.invites.filter((i) => inviteIsValid(i, nowMs)).length;
  return Math.max(0, FAMILY_MAX_PEOPLE - active - pending);
}

/** O papel dá escrita? O titular e o membro sim; o leitor não. */
export function roleCanWrite(role: FamilyRole): boolean {
  return role !== 'leitor';
}

/** Convida, muda papéis, remove, passa a titularidade e encerra: só o titular. */
export function roleIsOwner(role: FamilyRole): boolean {
  return role === 'titular';
}

/** Quem pode ser removido, ter o papel mudado ou receber a titularidade: pessoa ativa que não é quem consulta. */
export function memberIsActionable(member: Pick<FamilyMember, 'status' | 'isMe'>): boolean {
  return member.status === 'ativo' && !member.isMe;
}

/** Encerrar só vale sem outra pessoa ativa. */
export function canEndFamily(members: readonly Pick<FamilyMember, 'status' | 'isMe'>[]): boolean {
  return !members.some((m) => m.status === 'ativo' && !m.isMe);
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

/** Papel do vínculo como aparece nas linhas ("Titular", "Anota e vê", "Só vê"). */
export const FAMILY_ROLE_LABEL: Readonly<Record<FamilyRole, string>> = {
  titular: 'Titular',
  membro: 'Anota e vê',
  leitor: 'Só vê',
};

/** O que cada papel pode fazer, em uma frase. */
export const FAMILY_ROLE_HELP: Readonly<Record<FamilyRole, string>> = {
  titular: 'Vê, anota e edita o que é de outras pessoas. Convida, muda papéis e remove.',
  membro: 'Vê e anota. Altera só o que anotou.',
  leitor: 'Só vê. Não anota nem altera nada.',
};

export const FAMILY_TEXT = {
  title: 'Família',
  /** Contexto no seletor e nas pílulas. */
  context: 'Família',
  /** Sem Família. */
  introTitle: 'Anotar a casa em conjunto',
  intro:
    'Uma Família reúne até 6 pessoas para ver e anotar as contas da casa em conjunto. Quem cria é titular, convida por um link e escolhe o que cada pessoa pode fazer.',
  privacy: 'O Pessoal de cada pessoa continua só dela: ninguém da Família vê o seu, e você não vê o de ninguém.',
  oneAtATime: 'Cada pessoa participa de uma Família por vez.',
  demoOnly: 'Na demonstração não há Família de exemplo. Para criar uma Família, entre com uma conta sua.',
  create: 'Criar Família',
  createTitle: 'Criar Família',
  nameLabel: 'Nome da Família',
  nameHint: 'Por exemplo: Casa. Quem entra na Família vê este nome.',
  createSubmit: 'Criar Família',
  created: 'Família criada.',
  /** Com Família. */
  yourRole: (role: FamilyRole): string => `Seu papel: ${FAMILY_ROLE_LABEL[role]}`,
  peopleTitle: 'Pessoas',
  you: 'você',
  exMembersTitle: 'Ex-membros',
  exMembersNote: 'O que essas pessoas anotaram continua na Família, como histórico da casa. Quem excluiu a conta aparece como "Pessoa que saiu".',
  exMember: (firstName: string): string => (firstName === FAMILY_DEPARTED_NAME ? FAMILY_DEPARTED_NAME : `ex-membro · ${firstName}`),
  memberLine: (firstName: string, isMe: boolean): string => (isMe ? `${firstName} (você)` : firstName),
  memberA11y: (firstName: string, role: FamilyRole, isMe: boolean): string =>
    `${isMe ? `${firstName}, você` : firstName}, ${FAMILY_ROLE_LABEL[role]}`,
  exMemberA11y: (firstName: string): string => (firstName === FAMILY_DEPARTED_NAME ? 'Ex-membro, pessoa que excluiu a conta' : `Ex-membro ${firstName}`),
  /** Ações do titular sobre uma pessoa. */
  manage: 'Gerenciar',
  manageA11y: (firstName: string, role: FamilyRole): string => `Gerenciar ${firstName}, ${FAMILY_ROLE_LABEL[role]}`,
  manageTitle: (firstName: string): string => `Ações para ${firstName}`,
  makeReader: 'Mudar para "Só vê"',
  makeMember: 'Mudar para "Anota e vê"',
  rolesChanged: 'Papel atualizado.',
  remove: 'Remover da Família',
  removeTitle: (firstName: string): string => `Remover ${firstName} da Família?`,
  removeBody: 'A pessoa deixa de ver a Família. O que ela anotou continua, como histórico da casa. O Pessoal dela não muda.',
  removeConfirm: 'Remover',
  removed: 'Pessoa removida da Família.',
  transfer: 'Passar a titularidade',
  transferTitle: (firstName: string): string => `Passar a titularidade para ${firstName}?`,
  transferBody: 'A pessoa passa a ser titular e você continua na Família com o papel "Anota e vê". Só ela poderá convidar, remover e encerrar.',
  transferConfirm: 'Passar a titularidade',
  transferred: 'Titularidade transferida.',
  /** Convites. */
  invitesTitle: 'Convites',
  invitesNone: 'Nenhum convite pendente.',
  inviteRow: (role: InviteRole, expiryDay: IsoDate): string => `${FAMILY_ROLE_LABEL[role]} · vale até ${formatDateBR(expiryDay).slice(0, 5)}`,
  inviteRowA11y: (role: InviteRole, expiryDay: IsoDate): string => `Convite para ${FAMILY_ROLE_LABEL[role]}, vale até ${formatDateBR(expiryDay)}`,
  invite: 'Convidar',
  inviteTitle: 'Convidar para a Família',
  inviteRoleLabel: 'O que a pessoa poderá fazer',
  inviteGenerate: 'Gerar link',
  inviteLinkTitle: 'Link do convite',
  inviteNote:
    'O link vale por 7 dias e serve uma única vez. Ele aparece só agora: se perder, cancele este convite e gere outro. Envie pelo seu aparelho, como preferir.',
  inviteLost: 'Este convite já foi criado, mas o link não pode ser mostrado de novo. Cancele o convite na lista e gere outro.',
  share: 'Compartilhar',
  copy: 'Copiar link',
  copied: 'Link copiado.',
  shareFailed: 'Não foi possível abrir o compartilhamento. Copie o link e envie como preferir.',
  shareMessage: (familyName: string, link: string): string => `Convite para a Família ${familyName} na Clarevo: ${link}`,
  shareTitle: 'Convite para a Família',
  cancelInvite: 'Cancelar convite',
  cancelInviteA11y: (role: InviteRole, expiryDay: IsoDate): string => `Cancelar convite para ${FAMILY_ROLE_LABEL[role]}, que vale até ${formatDateBR(expiryDay)}`,
  inviteCancelled: 'Convite cancelado.',
  seats: (left: number): string =>
    left === 0
      ? 'A Família está completa: 6 pessoas, contando os convites pendentes.'
      : left === 1
        ? 'Cabe mais 1 pessoa, contando os convites pendentes.'
        : `Cabem mais ${left} pessoas, contando os convites pendentes.`,
  /** Sair, encerrar. */
  leave: 'Sair da Família',
  leaveTitle: 'Sair da Família?',
  leaveBody: 'Você deixa de ver as contas da Família. O que você anotou continua lá, como histórico da casa. O seu Pessoal não muda.',
  leaveConfirm: 'Sair da Família',
  left: 'Você saiu da Família.',
  ownerCannotLeave: 'Titular não sai da Família. Passe a titularidade a outra pessoa ou encerre a Família.',
  end: 'Encerrar a Família',
  endTitle: 'Encerrar a Família?',
  endBody:
    'A Família deixa de existir para todas as pessoas. Os registros ficam guardados, sem que ninguém possa ler, até a regra de guarda de dados. O Pessoal de cada pessoa não muda.',
  endConfirm: 'Encerrar a Família',
  ended: 'Família encerrada.',
  endBlocked: 'Para encerrar, remova antes as outras pessoas ou passe a titularidade.',
  cancel: 'Cancelar',
  loading: 'Carregando a Família…',
  loadFailed: 'Não foi possível carregar a Família. Tente novamente.',
  /** "Quem vê estes dados?" na Família. */
  whoSeesIntro: 'Estas pessoas veem os registros da Família, cada uma conforme o papel que tem.',
  whoSeesNote:
    'Gastos, contas a pagar, gastos fixos, parcelamentos, cartões, metas e contas de origem da Família ficam visíveis para estas pessoas. O que cada pessoa anotou continua na Família, com o primeiro nome dela, mesmo depois de sair. Quem exclui a conta fica como "Pessoa que saiu", sem nome e sem e-mail.',
  /** Quem anotou, nos detalhes (L-6). */
  notedBy: (label: string): string => `Anotado por ${label}`,
  /** Onde a anotação vai ficar. */
  savingIn: 'Salvando em Família',
  importingIn: 'Importando em Família',
  /** Seletor de contexto (acessível). */
  switchTo: (label: string): string => `Ver dados de ${label}`,
  /** Entrada em Conta. */
  accountTitle: 'Família',
  accountHintNone: 'Crie uma Família para ver e anotar as contas da casa em conjunto, com até 6 pessoas.',
  accountHintIn: (name: string, role: FamilyRole): string => `${name} · ${FAMILY_ROLE_LABEL[role]}`,
  accountOpen: 'Abrir Família',
  accountCreate: 'Criar Família',
} as const;

/** Textos da tela do convite (rota /convite/[código], na web e no app). */
export const INVITE_TEXT = {
  title: 'Convite para a Família',
  signedOut:
    'Você recebeu um convite para uma Família na Clarevo. Entre ou crie sua conta para ver quem convidou e aceitar. Depois você volta para este convite.',
  enter: 'Entrar',
  createAccount: 'Criar conta',
  loading: 'Conferindo o convite…',
  invitedBy: (firstName: string): string => `Convite de ${firstName}`,
  roleLine: (role: InviteRole): string => (role === 'membro' ? 'Você poderá ver e anotar.' : 'Você poderá só ver.'),
  validUntil: (day: IsoDate): string => `Vale até ${formatDateBR(day)}.`,
  privacy: 'Aceitar não mostra nem copia o seu Pessoal. Você também não vê o Pessoal de ninguém da Família.',
  accept: 'Aceitar convite',
  notNow: 'Agora não',
  invalid: 'Este convite não está disponível. Peça um novo link a quem convidou.',
  invalidTitle: 'Convite indisponível',
  accepted: (familyName: string): string => `Você entrou na Família ${familyName}.`,
  alreadyIn: 'Você já está em uma Família. Para aceitar outro convite, saia dela antes.',
  full: 'Esta Família já tem 6 pessoas. Peça a quem convidou para liberar uma vaga.',
  needSpace: 'Termine de criar a sua primeira conta antes de aceitar o convite.',
  /** Quem recebeu o link e prefere colar nele mesmo (a Família sem Família). */
  haveInvite: 'Tenho um convite',
  pasteLabel: 'Link do convite',
  pasteHint: 'Cole o link que você recebeu de quem convidou.',
  pasteSubmit: 'Ver convite',
  pasteInvalid: 'Não encontramos um convite neste texto. Confira o link que você recebeu.',
  openFamily: 'Ver a Família',
  goHome: 'Ir para o início',
  retry: 'Tentar de novo',
} as const;

/** Textos de erro das telas da Família (nomes e regras do banco). */
export const FAMILY_ERROR_TEXT = {
  nome_da_familia_invalido: 'Dê um nome de 1 a 60 caracteres para a Família.',
  ja_em_familia: 'Você já está em uma Família. Cada pessoa participa de uma Família por vez.',
  familia_cheia: 'A Família já tem 6 pessoas, contando os convites pendentes. Cancele um convite ou remova alguém.',
  convite_invalido: INVITE_TEXT.invalid,
  convite_ja_usado: 'Este convite já foi aceito.',
  papel_invalido: ERROR_TEXT.salvar_falhou,
  titular_nao_sai: FAMILY_TEXT.ownerCannotLeave,
  nao_sobre_si: 'Esta ação não vale para você.',
  contexto_invalido: ERROR_TEXT.salvar_falhou,
  familia_com_membros: FAMILY_TEXT.endBlocked,
  sem_permissao: 'Só quem é titular da Família pode fazer isto.',
  nao_encontrado: 'Esta Família ou esta pessoa não está mais disponível. Atualize a tela.',
  chave_reutilizada: ERROR_TEXT.salvar_falhou,
  rede: 'Sem conexão no momento. Tente novamente.',
  salvar_falhou: ERROR_TEXT.salvar_falhou,
  carregar_falhou: ERROR_TEXT.carregar_falhou,
} as const;

/** Texto de um erro das telas da Família; o que não é conhecido cai em "Não foi possível salvar...". */
export function familyErrorText(code: string): string {
  return (FAMILY_ERROR_TEXT as Record<string, string>)[code] ?? FAMILY_ERROR_TEXT.salvar_falhou;
}

/** Os códigos que as funções da Família lançam, além dos comuns. */
export const FAMILY_ERROR_CODES: readonly RepoErrorCode[] = [
  'nome_da_familia_invalido',
  'ja_em_familia',
  'familia_cheia',
  'convite_invalido',
  'convite_ja_usado',
  'papel_invalido',
  'titular_nao_sai',
  'nao_sobre_si',
  'contexto_invalido',
  'familia_com_membros',
];

// ---------------------------------------------------------------------------
// Quem anotou (L-6)
// ---------------------------------------------------------------------------

/**
 * Nome de quem anotou, para os detalhes na Família: o primeiro nome (e "você" para quem consulta); quem saiu ou foi removido aparece
 * como "ex-membro · Nome", e quem excluiu a conta (D-058), como "Pessoa que saiu". Pessoa que não está na lista (nunca deveria
 * ocorrer) devolve null: a tela não mostra a linha.
 */
export function authorLabel(members: readonly FamilyMember[], personId: string): string | null {
  const m = members.find((x) => x.personId === personId);
  if (!m) return null;
  if (m.status === 'ex-membro') return FAMILY_TEXT.exMember(m.firstName);
  return m.isMe ? `${m.firstName} (você)` : m.firstName;
}

// ---------------------------------------------------------------------------
// Contexto de trabalho (qual contexto as telas usam)
// ---------------------------------------------------------------------------

/**
 * O contexto a que um item (conta a pagar, registro) pertence, pelo identificador do contexto dele: "pessoal" se é o Pessoal da
 * pessoa, "familia" se é a Família dela, null se não é nenhum dos dois (ainda não carregou, ou a pessoa não lê esse contexto). As
 * telas de pagar e editar usam as contas e o rótulo "Salvando em" DESTE contexto, e não o do seletor: abrir de novo (recarregar a
 * página) o endereço de uma conta da Família com o seletor em Pessoal não pode oferecer as contas do Pessoal.
 */
export function contextKindOfItem(
  contextId: string | null | undefined,
  personalContextId: string | null | undefined,
  familyContextId: string | null | undefined,
): ContextKind | null {
  if (!contextId) return null;
  if (contextId === personalContextId) return 'pessoal';
  if (contextId === familyContextId) return 'familia';
  return null;
}

/** O nome do contexto nas pílulas e nos avisos: "Pessoal" ou "Família". */
export function contextName(kind: ContextKind): string {
  return kind === 'familia' ? FAMILY_TEXT.context : 'Pessoal';
}

/**
 * Pílula de formulário e de detalhe: onde a anotação vai ficar. Os textos das telas dizem "Pessoal" ("Salvando em Pessoal",
 * "Importando em Pessoal", "Pessoal"); com a Família escolhida, o último "Pessoal" vira "Família".
 */
export function contextLabelFor(label: string, kind: ContextKind): string {
  return kind === 'familia' ? label.replace(/Pessoal$/, FAMILY_TEXT.context) : label;
}

/** "Você tem alterações que ainda não foram salvas em Pessoal." / "…em Família." */
export function unsavedChangesText(kind: ContextKind): string {
  return `Você tem alterações que ainda não foram salvas em ${contextName(kind)}.`;
}
