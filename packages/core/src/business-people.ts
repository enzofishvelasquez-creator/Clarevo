import type { BusinessContext } from './business';
import type { IsoDate } from './dates';
import { formatDateBR } from './dates';
import type { FamilyRole, InviteRole, MemberStatus } from './family';
import { FAMILY_DEPARTED_NAME, FAMILY_MAX_PEOPLE, INVITE_BASE_URL, INVITE_ROLES, INVITE_VALID_DAYS, inviteIsValid, normalizeInviteCode } from './family';
import type { RepoErrorCode } from './repository';
import { ERROR_TEXT } from './validation';

/**
 * Negócio compartilhado (D-116, Clarevo Plus; implementado e DESLIGADO em D-120). Regras puras, repetidas no banco pela migração 0043
 * (`supabase/migrations/20261123000001_negocio_compartilhado.sql`): create_business_invite, cancel_business_invite,
 * preview_business_invite, accept_business_invite, leave_business, remove_business_member e set_business_member_role, a visão
 * business_member_items e a chave do Plus (plus_status).
 *
 * - Qualquer pessoa cria um negócio e chama outras; uma só pessoa administra cada negócio (quem criou: convida, muda os papéis, remove e
 *   encerra; não há passar a administração). As outras "Anotam e veem" (membro) ou "Só veem" (leitor). O Pessoal de cada pessoa
 *   continua só dela.
 * - Cada pessoa participa de um negócio por vez (o próprio ou o de outra pessoa), como a Família (L-3).
 * - Até 6 pessoas por negócio, contando quem administra e os convites ainda válidos.
 * - Convite por link de uso único, válido por 7 dias, cancelável; só o resumo SHA-256 do código fica no banco. O link é
 *   `<endereço do app>/convite/negocio/<código>` (o da Família, `/convite/<código>`, não muda).
 * - Quem sai ou é removido perde o acesso na hora; o que anotou continua no negócio, com o primeiro nome. As retiradas para o Pessoal
 *   dessa pessoa deixam de ser ligadas (viram lançamentos comuns dos dois lados), como no encerrar.
 * - Encerrar continua só sem outras pessoas ativas (negocio_com_membros) e cancela os convites. Excluir a conta de quem administra um
 *   negócio com outras pessoas ativas: negocio_com_membros.
 *
 * "Nada do Plus aparece no app nem no site até o Enzo definir" (docs/52, seção 5): com o Plus fechado, a seção "Pessoas do negócio" só
 * aparece para quem não administra (o que só acontece depois de o Plus ter aberto) ou quando já há outras pessoas
 * (`businessPeopleVisible`). Nenhum texto daqui fala em preço.
 */

/** Papel no negócio: titular ("Administra"), membro ("Anota e vê") e leitor ("Só vê"), os mesmos vínculos da Família. */
export type BusinessRole = FamilyRole;
/** Papel que um convite do negócio oferece (quem administra é só quem criou). */
export type BusinessInviteRole = InviteRole;

export const BUSINESS_INVITE_ROLES: readonly BusinessInviteRole[] = INVITE_ROLES;

/** Pessoas por negócio, contando quem administra e os convites ainda válidos (o mesmo limite da Família). */
export const BUSINESS_MAX_PEOPLE = FAMILY_MAX_PEOPLE;
/** Validade de um convite do negócio, em dias (a mesma da Família). */
export const BUSINESS_INVITE_VALID_DAYS = INVITE_VALID_DAYS;

/** Uma pessoa do negócio, ativa ou que saiu. firstName é só o primeiro nome (nunca o e-mail). */
export interface BusinessMember {
  personId: string;
  firstName: string;
  role: BusinessRole;
  status: MemberStatus;
  isMe: boolean;
  joinedAt: string;
  leftAt: string | null;
}

/** Convite do negócio (sem o resumo do código): vale enquanto não usado, não cancelado e antes de expiresAt. */
export interface BusinessInvite {
  id: string;
  contextId: string;
  role: BusinessInviteRole;
  createdBy: string;
  expiresAt: string;
  usedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

/**
 * As pessoas do negócio como o app lê: o papel de quem consulta, as pessoas (ativas primeiro, quem administra no topo; depois as que
 * saíram), os convites ainda válidos (só para quem administra e só com o Plus aberto) e se o Plus está aberto. Com o Plus fechado, quem
 * administra e nenhuma outra pessoa no negócio (o banco pode não ter a migração 0043), o app não lê a lista: vem só a própria pessoa.
 */
export interface BusinessPeople {
  role: BusinessRole;
  members: BusinessMember[];
  invites: BusinessInvite[];
  plusOpen: boolean;
}

/** Resultado de criar um convite. code vem uma única vez; ao repetir a mesma chave, vem null (cancele e gere outro). */
export interface BusinessInviteWrite {
  invite: BusinessInvite;
  code: string | null;
}

/** O que a prévia mostra antes de aceitar: só o nome do negócio, o primeiro nome de quem convidou, o papel e a validade. */
export interface BusinessInvitePreview {
  businessName: string;
  invitedBy: string;
  role: BusinessInviteRole;
  expiresAt: string;
}

/** Resultado de aceitar: o negócio (com o papel de quem entrou), o papel e o primeiro nome de quem convidou. */
export interface BusinessJoin {
  context: BusinessContext;
  role: BusinessRole;
  invitedBy: string;
}

/** A chave do Plus (plus_status): aberto ou fechado para todas as pessoas. Qualquer falha ao ler conta como fechado. */
export interface PlusStatus {
  open: boolean;
}

/** Ações do negócio compartilhado em record_operations (alvo em target_id); nenhuma conta como anotação na atividade. */
export type BusinessPeopleAction =
  | 'criar_convite_negocio'
  | 'cancelar_convite_negocio'
  | 'aceitar_convite_negocio'
  | 'sair_negocio'
  | 'remover_membro_negocio'
  | 'alterar_papel_negocio';

export const BUSINESS_PEOPLE_ACTIONS: readonly BusinessPeopleAction[] = [
  'criar_convite_negocio',
  'cancelar_convite_negocio',
  'aceitar_convite_negocio',
  'sair_negocio',
  'remover_membro_negocio',
  'alterar_papel_negocio',
];

export function isBusinessPeopleAction(action: string): action is BusinessPeopleAction {
  return (BUSINESS_PEOPLE_ACTIONS as readonly string[]).includes(action);
}

// ---------------------------------------------------------------------------
// Regras (as mesmas do banco)
// ---------------------------------------------------------------------------

/** Rótulo de quem não tem nome para mostrar no negócio (o mesmo da visão business_member_items). */
export const BUSINESS_NEUTRAL_NAME = 'Pessoa do negócio';

/**
 * Primeiro nome para mostrar a outras pessoas do negócio: a primeira palavra do nome, no máximo 40 caracteres. Nome vazio, com arroba ou
 * igual ao início do e-mail vira "Pessoa do negócio" (a mesma regra da visão business_member_items e de firstNameOf da Família).
 */
export function businessFirstNameOf(displayName: string, email?: string | null): string {
  const name = (typeof displayName === 'string' ? displayName : '').trim();
  const first = name.split(/\s+/)[0] ?? '';
  const local = (typeof email === 'string' ? email : '').split('@')[0]!.slice(0, 80);
  if (first === '' || first.includes('@') || (local !== '' && (name === local || first === local))) return BUSINESS_NEUTRAL_NAME;
  return first.slice(0, 40);
}

/** O link do convite do negócio: `${base}/convite/negocio/${código}`. */
export function businessInviteLink(code: string, base: string = INVITE_BASE_URL): string {
  return `${base.replace(/\/+$/, '')}/convite/negocio/${code}`;
}

/**
 * O código de um texto colado: o próprio código ou um link `…/convite/negocio/<código>`. Nulo se não houver código válido. Um link de
 * convite da Família (`…/convite/<código>`) não vale aqui, e o da Família (`inviteCodeFromText`) não aceita o do negócio.
 */
export function businessInviteCodeFromText(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const direct = normalizeInviteCode(text);
  if (direct) return direct;
  const m = /\/convite\/negocio\/([0-9a-fA-F]{32})(?![0-9a-fA-F])/.exec(text);
  return m ? normalizeInviteCode(m[1]) : null;
}

/** Vagas livres: seis menos as pessoas ativas e os convites ainda válidos. */
export function businessSeatsLeft(people: Pick<BusinessPeople, 'members' | 'invites'>, nowMs: number): number {
  const active = people.members.filter((m) => m.status === 'ativo').length;
  const pending = people.invites.filter((i) => inviteIsValid(i, nowMs)).length;
  return Math.max(0, BUSINESS_MAX_PEOPLE - active - pending);
}

/** Há outras pessoas no negócio (ativas ou que saíram)? É quando os detalhes dizem quem anotou. */
export function businessHasOthers(people: Pick<BusinessPeople, 'members'> | null | undefined): boolean {
  return Boolean(people?.members.some((m) => !m.isMe));
}

/** Há outras pessoas ativas no negócio? É quando "Quem vê estes dados?" lista as pessoas. */
export function businessSharedNow(people: Pick<BusinessPeople, 'members'> | null | undefined): boolean {
  return Boolean(people?.members.some((m) => !m.isMe && m.status === 'ativo'));
}

/**
 * A seção "Pessoas do negócio" aparece? Com o Plus aberto, para quem não administra ou quando há (ou houve) outras pessoas, mesmo que o Plus
 * tenha fechado depois: quem administra continua vendo quem lê o negócio. Com o Plus fechado, quem administra sozinha ou sozinho vê "Seu
 * negócio" exatamente como antes (D-120).
 */
export function businessPeopleVisible(people: BusinessPeople | null | undefined): boolean {
  if (!people) return false;
  return people.plusOpen || people.role !== 'titular' || businessHasOthers(people);
}

/** Convidar: só quem administra, com o Plus aberto. */
export function businessCanInvite(people: Pick<BusinessPeople, 'role' | 'plusOpen'>): boolean {
  return people.role === 'titular' && people.plusOpen;
}

/** Encerrar só vale sem outra pessoa ativa. */
export function canEndBusiness(members: readonly Pick<BusinessMember, 'status' | 'isMe'>[]): boolean {
  return !members.some((m) => m.status === 'ativo' && !m.isMe);
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

/** Papel no negócio como aparece nas linhas ("Administra", "Anota e vê", "Só vê"). */
export const BUSINESS_ROLE_LABEL: Readonly<Record<BusinessRole, string>> = {
  titular: 'Administra',
  membro: 'Anota e vê',
  leitor: 'Só vê',
};

/** O que cada papel pode fazer no negócio, em uma frase. */
export const BUSINESS_ROLE_HELP: Readonly<Record<BusinessRole, string>> = {
  titular: 'Vê, anota e edita o que é de outras pessoas. Convida, muda papéis, remove e encerra.',
  membro: 'Vê e anota. Altera só o que anotou.',
  leitor: 'Só vê. Não anota nem altera nada.',
};

export const BUSINESS_PEOPLE_TEXT = {
  title: 'Pessoas do negócio',
  /** O papel de quem consulta, no alto da seção. */
  yourRole: (role: BusinessRole): string => (role === 'titular' ? 'Você administra este negócio.' : `Seu papel: ${BUSINESS_ROLE_LABEL[role]}`),
  /** Com o Plus aberto e ninguém mais no negócio: para que serve. */
  intro: 'Chame quem trabalha com você para ver e anotar o que entra e sai do negócio, com até 6 pessoas. Você convida por um link e escolhe o que cada pessoa pode fazer.',
  privacy: 'O Pessoal de cada pessoa continua só dela: ninguém do negócio vê o seu, e você não vê o de ninguém.',
  oneAtATime: 'Cada pessoa participa de um negócio por vez.',
  you: 'você',
  memberLine: (firstName: string, isMe: boolean): string => (isMe ? `${firstName} (você)` : firstName),
  memberA11y: (firstName: string, role: BusinessRole, isMe: boolean): string =>
    `${isMe ? `${firstName}, você` : firstName}, ${BUSINESS_ROLE_LABEL[role]}`,
  exMembersTitle: 'Pessoas que saíram',
  exMembersNote: 'O que essas pessoas anotaram continua no negócio, como histórico. Quem excluiu a conta aparece como "Pessoa que saiu".',
  /** Quem saiu: "Nina (saiu do negócio)", também em "Anotado por Nina (saiu do negócio)". Quem excluiu a conta: "Pessoa que saiu". */
  exMember: (firstName: string): string => (firstName === FAMILY_DEPARTED_NAME ? FAMILY_DEPARTED_NAME : `${firstName} (saiu do negócio)`),
  exMemberA11y: (firstName: string): string => (firstName === FAMILY_DEPARTED_NAME ? `${FAMILY_DEPARTED_NAME}, excluiu a conta` : `${firstName}, saiu do negócio`),
  /** Ações de quem administra sobre uma pessoa. */
  manage: 'Gerenciar',
  manageA11y: (firstName: string, role: BusinessRole): string => `Gerenciar ${firstName}, ${BUSINESS_ROLE_LABEL[role]}`,
  manageTitle: (firstName: string): string => `Ações para ${firstName}`,
  makeReader: 'Mudar para "Só vê"',
  makeMember: 'Mudar para "Anota e vê"',
  roleTitle: (firstName: string, role: BusinessInviteRole): string => `Mudar ${firstName} para "${BUSINESS_ROLE_LABEL[role]}"?`,
  roleBody: (role: BusinessInviteRole): string =>
    role === 'leitor'
      ? 'A pessoa continua vendo o negócio, mas deixa de anotar. O que ela já anotou não muda, e as retiradas dela para o Pessoal deixam de ser ligadas.'
      : 'A pessoa passa a ver e anotar no negócio. Ela altera só o que ela mesma anotar.',
  roleConfirm: 'Mudar o papel',
  roleChanged: 'Papel atualizado.',
  remove: 'Remover do negócio',
  removeTitle: (firstName: string): string => `Remover ${firstName} do negócio?`,
  removeBody:
    'A pessoa deixa de ver o negócio na hora. O que ela anotou continua no negócio, como histórico. As retiradas que ela levou para o Pessoal continuam lá, como recebimentos comuns, e o Pessoal dela não muda.',
  removeConfirm: 'Remover',
  removed: 'Pessoa removida do negócio.',
  /** Convites. */
  invitesTitle: 'Convites',
  invitesNone: 'Nenhum convite pendente.',
  inviteRow: (role: BusinessInviteRole, expiryDay: IsoDate): string => `${BUSINESS_ROLE_LABEL[role]} · vale até ${formatDateBR(expiryDay).slice(0, 5)}`,
  inviteRowA11y: (role: BusinessInviteRole, expiryDay: IsoDate): string => `Convite para ${BUSINESS_ROLE_LABEL[role]}, vale até ${formatDateBR(expiryDay)}`,
  cancelInvite: 'Cancelar convite',
  cancelInviteA11y: (role: BusinessInviteRole, expiryDay: IsoDate): string =>
    `Cancelar convite para ${BUSINESS_ROLE_LABEL[role]}, que vale até ${formatDateBR(expiryDay)}`,
  inviteCancelled: 'Convite cancelado.',
  seats: (left: number): string =>
    left === 0
      ? 'O negócio está completo: 6 pessoas, contando os convites pendentes.'
      : left === 1
        ? 'Cabe mais 1 pessoa, contando os convites pendentes.'
        : `Cabem mais ${left} pessoas, contando os convites pendentes.`,
  invite: 'Convidar alguém',
  /** Sair. */
  leave: 'Sair do negócio',
  leaveTitle: 'Sair do negócio?',
  leaveBody:
    'Você deixa de ver o negócio na hora. O que você anotou continua lá, como histórico. As retiradas que você levou para o Pessoal continuam no seu Pessoal, como recebimentos comuns.',
  leaveConfirm: 'Sair do negócio',
  left: 'Você saiu do negócio.',
  ownerCannotLeave: 'Quem administra não sai do negócio. Para encerrar, remova antes as outras pessoas.',
  endBlocked: 'Para encerrar o espaço Negócio, remova antes as outras pessoas.',
  cancel: 'Cancelar',
  loading: 'Carregando as pessoas do negócio…',
  loadFailed: 'Não foi possível carregar as pessoas do negócio. Tente de novo.',
  /** "Quem vê estes dados?" no negócio com outras pessoas. */
  whoSeesIntro: 'Estas pessoas veem os lançamentos do negócio, cada uma conforme o papel que tem.',
  whoSeesNote:
    'Entradas, saídas, contas a pagar, gastos fixos, parcelamentos, cartões, bancos e carteira do negócio ficam visíveis para estas pessoas. O que cada pessoa anotou continua no negócio, com o primeiro nome dela, mesmo depois de sair. Quem exclui a conta fica como "Pessoa que saiu", sem nome e sem e-mail.',
  whoSeesOthers: 'Quem não está no negócio não vê o negócio. Ninguém do negócio vê o seu Pessoal.',
  /** Quem anotou, nos detalhes. */
  notedBy: (label: string): string => `Anotado por ${label}`,
  /** O card de Conta com o negócio compartilhado: "Marmitas da Bia · Anota e vê". */
  accountHintShared: (name: string, role: BusinessRole): string => `${name} · ${BUSINESS_ROLE_LABEL[role]}`,
} as const;

/** Textos do convite do negócio: convidar (/negocio/convidar) e aceitar (/convite/negocio/[código], na web e no app). */
export const BUSINESS_INVITE_TEXT = {
  /** Convidar. */
  inviteTitle: 'Convidar para o negócio',
  roleLabel: 'O que a pessoa poderá fazer',
  generate: 'Gerar link',
  linkTitle: 'Link do convite',
  note: 'O link vale por 7 dias e serve uma única vez. Ele aparece só agora: se perder, cancele este convite e gere outro. Envie pelo seu aparelho, como preferir.',
  lost: 'Este convite já foi criado, mas o link não pode ser mostrado de novo. Cancele o convite na lista e gere outro.',
  share: 'Compartilhar',
  copy: 'Copiar link',
  copied: 'Link copiado.',
  shareFailed: 'Não foi possível abrir o compartilhamento. Copie o link e envie como preferir.',
  shareMessage: (businessName: string, link: string): string => `Convite para o negócio ${businessName} na Clarevo: ${link}`,
  shareTitle: 'Convite para o negócio',
  done: 'Concluir',
  /** Aceitar. */
  title: 'Convite para um negócio',
  signedOut:
    'Você recebeu um convite para um negócio na Clarevo. Entre ou crie sua conta para ver quem convidou e aceitar. Depois você volta para este convite.',
  enter: 'Entrar',
  createAccount: 'Criar conta',
  loading: 'Conferindo o convite…',
  invitedBy: (firstName: string): string => `Convite de ${firstName}`,
  roleLine: (role: BusinessInviteRole): string =>
    role === 'membro' ? 'Você poderá ver e anotar o que entra e sai do negócio.' : 'Você poderá só ver o que entra e sai do negócio.',
  validUntil: (day: IsoDate): string => `Vale até ${formatDateBR(day)}.`,
  privacy: 'Aceitar não mostra nem copia o seu Pessoal. Você também não vê o Pessoal de ninguém do negócio.',
  oneAtATime: 'Cada pessoa participa de um negócio por vez.',
  accept: 'Aceitar convite',
  accepting: 'Aceitando…',
  notNow: 'Agora não',
  invalid: 'Este convite não está disponível. Peça um novo link a quem convidou.',
  invalidTitle: 'Convite indisponível',
  accepted: (businessName: string): string => `Você entrou no negócio ${businessName}.`,
  needSpace: 'Termine de criar a sua primeira conta antes de aceitar o convite.',
  createFirst: 'Criar minha primeira conta',
  goHome: 'Ir para o início',
} as const;

/** Textos de erro das ações do negócio compartilhado (nomes e regras do banco). */
export const BUSINESS_PEOPLE_ERROR_TEXT = {
  plus_indisponivel: 'Convidar pessoas para o negócio ainda não está disponível.',
  negocio_cheio: 'O negócio já tem 6 pessoas, contando os convites pendentes. Cancele um convite ou remova alguém.',
  ja_no_negocio: 'Você já participa deste negócio.',
  ja_tem_negocio: 'Você já participa de um negócio. Cada pessoa participa de um negócio por vez.',
  titular_nao_sai: BUSINESS_PEOPLE_TEXT.ownerCannotLeave,
  nao_sobre_si: 'Esta ação não vale para você.',
  papel_invalido: ERROR_TEXT.salvar_falhou,
  convite_invalido: BUSINESS_INVITE_TEXT.invalid,
  convite_ja_usado: 'Este convite já foi aceito.',
  negocio_com_membros: BUSINESS_PEOPLE_TEXT.endBlocked,
  contexto_invalido: ERROR_TEXT.salvar_falhou,
  sem_permissao: 'Só quem administra o negócio pode fazer isto.',
  nao_encontrado: 'Este negócio ou esta pessoa não está mais disponível. Atualize a tela.',
  chave_reutilizada: ERROR_TEXT.salvar_falhou,
  rede: 'Sem conexão no momento. Tente de novo.',
  salvar_falhou: ERROR_TEXT.salvar_falhou,
  carregar_falhou: ERROR_TEXT.carregar_falhou,
} as const;

/** Ao aceitar, o negócio cheio diz o que a pessoa pode fazer (pedir uma vaga), e não "cancele um convite". */
const ACCEPT_ERROR_TEXT: Readonly<Record<string, string>> = {
  negocio_cheio: 'Este negócio já tem 6 pessoas. Peça a quem convidou para liberar uma vaga.',
  sem_permissao: BUSINESS_INVITE_TEXT.needSpace,
};

/** Texto de um erro das ações do negócio compartilhado; `accept` usa as frases da tela do convite. O que não é conhecido cai em "Não foi possível salvar...". */
export function businessPeopleErrorText(code: string, accept = false): string {
  if (accept && ACCEPT_ERROR_TEXT[code]) return ACCEPT_ERROR_TEXT[code]!;
  return (BUSINESS_PEOPLE_ERROR_TEXT as Record<string, string>)[code] ?? BUSINESS_PEOPLE_ERROR_TEXT.salvar_falhou;
}

/** Os códigos novos que as funções do negócio compartilhado lançam (migração 0043), além dos que a Família e o negócio já tinham. */
export const BUSINESS_PEOPLE_ERROR_CODES: readonly RepoErrorCode[] = [
  'plus_indisponivel',
  'negocio_cheio',
  'ja_no_negocio',
  'ja_tem_negocio',
  'titular_nao_sai',
  'nao_sobre_si',
  'papel_invalido',
  'convite_invalido',
  'convite_ja_usado',
  'negocio_com_membros',
];

// ---------------------------------------------------------------------------
// Quem anotou
// ---------------------------------------------------------------------------

/**
 * Nome de quem anotou, nos detalhes do negócio com outras pessoas: o primeiro nome (e "(você)" para quem consulta); quem saiu, "Nina
 * (saiu do negócio)"; quem excluiu a conta, "Pessoa que saiu". Pessoa fora da lista devolve null (a tela usa a frase de sempre).
 */
export function businessAuthorLabel(members: readonly BusinessMember[], personId: string): string | null {
  const m = members.find((x) => x.personId === personId);
  if (!m) return null;
  if (m.status === 'ex-membro') return BUSINESS_PEOPLE_TEXT.exMember(m.firstName);
  return m.isMe ? `${m.firstName} (você)` : m.firstName;
}
