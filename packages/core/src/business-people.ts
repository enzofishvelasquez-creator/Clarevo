import type { BusinessContext, BusinessProfile } from './business';
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
 *
 * Negócio com equipe (D-123, migração 0046, também DESLIGADO até o Plus abrir):
 * - Sociedade: quem administra responde "O negócio é uma sociedade?" (BusinessContext.businessPartnership); a resposta não muda permissão.
 * - Passar a administração (transfer_business_admin): quem administra passa para outra pessoa ativa que anota ou só vê (nunca para a
 *   Contabilidade); quem administrava continua no negócio com "Anota e vê" e pode sair depois.
 * - Papel Contabilidade: só lê e exporta aquele negócio, nunca anota; não conta nas 6 pessoas nem na regra de um negócio por vez; até 3
 *   acessos de Contabilidade por negócio, contando os convites válidos (contabilidade_cheia). Os negócios que a pessoa acompanha ficam
 *   fora dos espaços dela (getBusiness os ignora) e aparecem só em "Negócios que você acompanha" (listAccountingBusinesses).
 */

/**
 * Papel no negócio: titular ("Administra"), membro ("Anota e vê") e leitor ("Só vê"), os mesmos vínculos da Família, e contabilidade
 * ("Contabilidade", D-123: no banco, o vínculo de leitor com accountant = true).
 */
export type BusinessRole = FamilyRole | 'contabilidade';
/** Papel que um convite do negócio oferece (quem administra é só quem criou ou quem recebeu a administração). */
export type BusinessInviteRole = InviteRole | 'contabilidade';
/** Os papéis entre os quais quem administra muda uma pessoa ("Anota e vê" e "Só vê"): a Contabilidade não muda de papel (nem para, nem de). */
export type BusinessMemberRole = InviteRole;

export const BUSINESS_INVITE_ROLES: readonly BusinessInviteRole[] = [...INVITE_ROLES, 'contabilidade'];
export const BUSINESS_MEMBER_ROLES: readonly BusinessMemberRole[] = INVITE_ROLES;

export function isBusinessInviteRole(value: unknown): value is BusinessInviteRole {
  return (BUSINESS_INVITE_ROLES as readonly unknown[]).includes(value);
}

export function isBusinessRole(value: unknown): value is BusinessRole {
  return value === 'titular' || isBusinessInviteRole(value);
}

/** Pessoas por negócio, contando quem administra e os convites ainda válidos (o mesmo limite da Família). A Contabilidade não conta. */
export const BUSINESS_MAX_PEOPLE = FAMILY_MAX_PEOPLE;
/** Acessos de Contabilidade por negócio (D-123), contando os convites de Contabilidade ainda válidos: um limite à parte. */
export const BUSINESS_ACCOUNTANT_MAX = 3;
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

/**
 * Resultado de aceitar: o negócio (com o papel de quem entrou), o papel e o primeiro nome de quem convidou. Quem entra como Contabilidade
 * tem `role` 'contabilidade' e, no negócio, o papel de leitura ('leitor'): BusinessContext.role nunca é 'contabilidade', porque o negócio
 * acompanhado não é um espaço da pessoa (a tela leva a /contabilidade/<id>).
 */
export interface BusinessJoin {
  context: BusinessContext;
  role: BusinessRole;
  invitedBy: string;
}

/**
 * Um negócio que a pessoa acompanha como Contabilidade (my_accounting_businesses, D-123): o nome, o tipo, o primeiro nome de quem
 * administra ("Pessoa do negócio" sem nome), quando o negócio foi criado (a troca de ano do Resumo do ano começa do mesmo ano que a de quem
 * administra) e desde quando a pessoa acompanha. Fica fora dos espaços dela.
 */
export interface AccountingBusiness {
  id: string;
  name: string;
  businessProfile: BusinessProfile | null;
  adminName: string;
  createdAt: string;
  since: string;
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
  | 'alterar_papel_negocio'
  | 'transferir_administracao_negocio';

export const BUSINESS_PEOPLE_ACTIONS: readonly BusinessPeopleAction[] = [
  'criar_convite_negocio',
  'cancelar_convite_negocio',
  'aceitar_convite_negocio',
  'sair_negocio',
  'remover_membro_negocio',
  'alterar_papel_negocio',
  'transferir_administracao_negocio',
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

/** A pessoa (ou o convite) é da Contabilidade (D-123)? */
export function isAccountant(x: { role: BusinessRole | BusinessInviteRole }): boolean {
  return x.role === 'contabilidade';
}

/** Vagas livres: seis menos as pessoas ativas e os convites ainda válidos. A Contabilidade (pessoas e convites) não conta (D-123). */
export function businessSeatsLeft(people: Pick<BusinessPeople, 'members' | 'invites'>, nowMs: number): number {
  const active = people.members.filter((m) => m.status === 'ativo' && !isAccountant(m)).length;
  const pending = people.invites.filter((i) => inviteIsValid(i, nowMs) && !isAccountant(i)).length;
  return Math.max(0, BUSINESS_MAX_PEOPLE - active - pending);
}

/** Acessos de Contabilidade livres (D-123): três menos os acessos ativos e os convites de Contabilidade ainda válidos. */
export function accountantSeatsLeft(people: Pick<BusinessPeople, 'members' | 'invites'>, nowMs: number): number {
  const active = people.members.filter((m) => m.status === 'ativo' && isAccountant(m)).length;
  const pending = people.invites.filter((i) => inviteIsValid(i, nowMs) && isAccountant(i)).length;
  return Math.max(0, BUSINESS_ACCOUNTANT_MAX - active - pending);
}

/** As vagas que valem para um papel de convite: as 6 pessoas, ou os 3 acessos de Contabilidade. */
export function seatsLeftFor(people: Pick<BusinessPeople, 'members' | 'invites'>, role: BusinessInviteRole, nowMs: number): number {
  return role === 'contabilidade' ? accountantSeatsLeft(people, nowMs) : businessSeatsLeft(people, nowMs);
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

/** Encerrar só vale sem outra pessoa ativa que anota ou só vê: a Contabilidade não impede (D-123), e encerrar tira o acesso dela. */
export function canEndBusiness(members: readonly (Pick<BusinessMember, 'status' | 'isMe'> & { role?: BusinessRole })[]): boolean {
  return !members.some((m) => m.status === 'ativo' && !m.isMe && m.role !== 'contabilidade');
}

/**
 * Quem administra pode passar a administração para esta pessoa (D-123)? Só com o Plus aberto (o banco aceita sempre: é a saída de um
 * negócio que ficaria preso; o app só mostra com o Plus aberto), para outra pessoa ativa que anota ou só vê, nunca para a Contabilidade.
 */
export function canTransferTo(people: Pick<BusinessPeople, 'role' | 'plusOpen'>, member: Pick<BusinessMember, 'status' | 'isMe' | 'role'>): boolean {
  return people.role === 'titular' && people.plusOpen && member.status === 'ativo' && !member.isMe && (member.role === 'membro' || member.role === 'leitor');
}

/** Quem pode receber a administração (para dizer a quem administra como sair: passar antes, ou encerrar sem ninguém para receber). */
export function businessTransferCandidates(people: Pick<BusinessPeople, 'role' | 'plusOpen' | 'members'>): BusinessMember[] {
  return people.members.filter((m) => canTransferTo(people, m));
}

/** A pergunta "O negócio é uma sociedade?" (D-123): só quem administra, só com o Plus aberto. */
export function businessPartnershipVisible(people: Pick<BusinessPeople, 'role' | 'plusOpen'> | null | undefined): boolean {
  return Boolean(people && people.role === 'titular' && people.plusOpen);
}

/** A Contabilidade muda de papel? Nunca (nem para, nem de): só é removida. */
export function canChangeRole(member: Pick<BusinessMember, 'role'>): boolean {
  return member.role === 'membro' || member.role === 'leitor';
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

/** Papel no negócio como aparece nas linhas ("Administra", "Anota e vê", "Só vê", "Contabilidade"). */
export const BUSINESS_ROLE_LABEL: Readonly<Record<BusinessRole, string>> = {
  titular: 'Administra',
  membro: 'Anota e vê',
  leitor: 'Só vê',
  contabilidade: 'Contabilidade',
};

/** O que cada papel pode fazer no negócio, em uma frase. */
export const BUSINESS_ROLE_HELP: Readonly<Record<BusinessRole, string>> = {
  titular: 'Vê, anota e edita o que é de outras pessoas. Convida, muda papéis, remove e encerra.',
  membro: 'Vê e anota. Altera só o que anotou.',
  leitor: 'Só vê. Não anota nem altera nada.',
  contabilidade: 'Vê e exporta os lançamentos deste negócio. Não anota nem muda nada, e não vê o Pessoal nem a Família de ninguém.',
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
  roleTitle: (firstName: string, role: BusinessMemberRole): string => `Mudar ${firstName} para "${BUSINESS_ROLE_LABEL[role]}"?`,
  roleBody: (role: BusinessMemberRole): string =>
    role === 'leitor'
      ? 'A pessoa continua vendo o negócio, mas deixa de anotar. O que ela já anotou não muda, e as retiradas dela para o Pessoal deixam de ser ligadas.'
      : 'A pessoa passa a ver e anotar no negócio. Ela altera só o que ela mesma anotar.',
  roleConfirm: 'Mudar o papel',
  roleChanged: 'Papel atualizado.',
  remove: 'Remover do negócio',
  removeTitle: (firstName: string): string => `Remover ${firstName} do negócio?`,
  removeBody:
    'A pessoa deixa de ver o negócio na hora. O que ela anotou continua no negócio, como histórico. As retiradas que ela levou para o Pessoal continuam lá, como recebimentos comuns, e o Pessoal dela não muda.',
  /** Remover a Contabilidade (D-123): ela nunca anotou nada, então só perde a leitura. */
  removeAccountantBody: 'A Contabilidade deixa de ver e exportar o negócio na hora. Nada muda nos lançamentos do negócio.',
  removeConfirm: 'Remover',
  removed: 'Pessoa removida do negócio.',
  /** Passar a administração (D-123), em "Gerenciar" de uma pessoa que anota ou só vê. */
  transfer: 'Passar a administração',
  transferTitle: (firstName: string): string => `Passar a administração para ${firstName}?`,
  transferBody: (firstName: string): string =>
    `${firstName} passa a convidar, mudar papéis, remover pessoas e encerrar o negócio. Você continua no negócio com "Anota e vê" e pode sair depois.`,
  transferNote: 'Para você voltar a administrar, a pessoa que passar a administrar precisa passar a administração de volta.',
  transferConfirm: 'Passar a administração',
  transferred: (firstName: string): string => `A administração passou para ${firstName}. Agora o seu papel é "Anota e vê".`,
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
  /** Os acessos de Contabilidade (D-123), à parte das 6 pessoas. */
  accountantSeats: (left: number): string =>
    left === 0
      ? 'Os 3 acessos de Contabilidade estão em uso, contando os convites pendentes.'
      : left === 1
        ? 'Cabe mais 1 acesso de Contabilidade, contando os convites pendentes. A Contabilidade não conta nas 6 pessoas.'
        : `Cabem mais ${left} acessos de Contabilidade, contando os convites pendentes. A Contabilidade não conta nas 6 pessoas.`,
  invite: 'Convidar alguém',
  /** Sair. */
  leave: 'Sair do negócio',
  leaveTitle: 'Sair do negócio?',
  leaveBody:
    'Você deixa de ver o negócio na hora. O que você anotou continua lá, como histórico. As retiradas que você levou para o Pessoal continuam no seu Pessoal, como recebimentos comuns.',
  leaveConfirm: 'Sair do negócio',
  left: 'Você saiu do negócio.',
  /** Quem administra tenta sair (titular_nao_sai): passar a administração antes (D-123), ou encerrar sem ninguém para receber. */
  ownerCannotLeave: 'Quem administra passa a administração para outra pessoa do negócio antes de sair. Sem ninguém para receber, encerre o espaço Negócio.',
  ownerLeaveTitle: 'Como sair do negócio',
  ownerLeaveBody:
    'Antes de sair, passe a administração para outra pessoa que anota ou só vê: em "Gerenciar", ao lado da pessoa, escolha "Passar a administração". Depois, com "Anota e vê", você pode sair do negócio.',
  ownerLeaveAlone:
    'Não há outra pessoa que anota ou só vê para receber a administração. Para sair, encerre o espaço Negócio em "Nome e encerrar". Encerrar também tira o acesso da Contabilidade, se houver.',
  ownerLeaveOk: 'Entendi',
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

/**
 * A pergunta da sociedade (D-123), em "Pessoas do negócio", só para quem administra e só com o Plus aberto. A resposta não muda o que
 * cada pessoa pode fazer; com "Sim", só a frase de convidar as outras pessoas sócias e de passar a administração se precisar sair.
 */
export const BUSINESS_PARTNERSHIP_TEXT = {
  question: 'O negócio é uma sociedade?',
  yes: 'Sim',
  no: 'Não',
  answer: (partnership: boolean): string => (partnership ? 'O negócio é uma sociedade.' : 'O negócio não é uma sociedade.'),
  change: 'Alterar',
  changeA11y: (partnership: boolean): string => `Alterar a resposta: ${partnership ? 'o negócio é uma sociedade' : 'o negócio não é uma sociedade'}`,
  yesHint:
    'Convide as outras pessoas sócias, por exemplo com "Anota e vê". Se um dia você precisar sair, passe a administração para uma delas.',
  why: 'A resposta não muda o que cada pessoa pode fazer no negócio.',
  saved: 'Resposta salva.',
  /** A pergunta deixou de valer enquanto a tela estava aberta (plus_indisponivel). */
  unavailable: 'Não foi possível salvar a resposta agora. Atualize a tela.',
  cancel: 'Cancelar',
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
    role === 'membro'
      ? 'Você poderá ver e anotar o que entra e sai do negócio.'
      : role === 'contabilidade'
        ? 'Você vai ver e exportar os lançamentos deste negócio, sem anotar nem mudar nada, e sem ver o Pessoal de ninguém.'
        : 'Você poderá só ver o que entra e sai do negócio.',
  validUntil: (day: IsoDate): string => `Vale até ${formatDateBR(day)}.`,
  privacy: 'Aceitar não mostra nem copia o seu Pessoal. Você também não vê o Pessoal de ninguém do negócio.',
  oneAtATime: 'Cada pessoa participa de um negócio por vez.',
  /** No convite da Contabilidade (D-123): fora da regra de um negócio por vez e fora dos espaços da pessoa. */
  accountantNote:
    'Acompanhar como Contabilidade não conta na regra de um negócio por vez: você pode acompanhar vários negócios e ter o seu. O negócio fica em Conta, em "Negócios que você acompanha", fora dos seus espaços.',
  /** Em "Convidar para o negócio", com a opção "Contabilidade". */
  accountantInviteNote:
    'Para o escritório ou a pessoa que cuida da contabilidade do negócio. Não conta nas 6 pessoas: são até 3 acessos de Contabilidade. A Clarevo não faz contabilidade: ela só mostra o que foi anotado.',
  accept: 'Aceitar convite',
  accepting: 'Aceitando…',
  notNow: 'Agora não',
  invalid: 'Este convite não está disponível. Peça um novo link a quem convidou.',
  invalidTitle: 'Convite indisponível',
  accepted: (businessName: string): string => `Você entrou no negócio ${businessName}.`,
  acceptedAccountant: (businessName: string): string => `Agora você acompanha o negócio ${businessName}.`,
  needSpace: 'Termine de criar a sua primeira conta antes de aceitar o convite.',
  createFirst: 'Criar minha primeira conta',
  goHome: 'Ir para o início',
} as const;

/** Textos de erro das ações do negócio compartilhado (nomes e regras do banco). */
export const BUSINESS_PEOPLE_ERROR_TEXT = {
  plus_indisponivel: 'Convidar pessoas para o negócio ainda não está disponível.',
  negocio_cheio: 'O negócio já tem 6 pessoas, contando os convites pendentes. Cancele um convite ou remova alguém.',
  contabilidade_cheia: 'O negócio já tem 3 acessos de Contabilidade, contando os convites pendentes. Cancele um convite ou remova um acesso.',
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
  contabilidade_cheia: 'Este negócio já tem 3 acessos de Contabilidade. Peça a quem convidou para liberar um acesso.',
  sem_permissao: BUSINESS_INVITE_TEXT.needSpace,
};

/**
 * Texto de um erro das ações do negócio compartilhado; `accept` usa as frases da tela do convite. A conta em "só ver e exportar"
 * (assinatura_necessaria, a trava da assinatura) recebe a frase de sempre do app. O que não é conhecido cai em "Não foi possível salvar...".
 */
export function businessPeopleErrorText(code: string, accept = false): string {
  if (accept && ACCEPT_ERROR_TEXT[code]) return ACCEPT_ERROR_TEXT[code]!;
  if (code === 'assinatura_necessaria') return ERROR_TEXT.assinatura_necessaria;
  return (BUSINESS_PEOPLE_ERROR_TEXT as Record<string, string>)[code] ?? BUSINESS_PEOPLE_ERROR_TEXT.salvar_falhou;
}

/**
 * Texto de um erro da pergunta da sociedade (D-123): plus_indisponivel (a pergunta deixou de valer) com uma frase neutra, sem falar em
 * convite; os outros, como as ações do negócio compartilhado.
 */
export function businessPartnershipErrorText(code: string): string {
  if (code === 'plus_indisponivel') return BUSINESS_PARTNERSHIP_TEXT.unavailable;
  return businessPeopleErrorText(code);
}

/**
 * Os códigos novos que as funções do negócio compartilhado lançam (migração 0043; contabilidade_cheia na 0046, D-123), além dos que a
 * Família e o negócio já tinham.
 */
export const BUSINESS_PEOPLE_ERROR_CODES: readonly RepoErrorCode[] = [
  'plus_indisponivel',
  'negocio_cheio',
  'contabilidade_cheia',
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

// ---------------------------------------------------------------------------
// Negócios que a pessoa acompanha como Contabilidade (D-123): /contabilidade e /contabilidade/[id]
// ---------------------------------------------------------------------------

/**
 * A área da Contabilidade, separada dos espaços da pessoa: o cartão de Conta (só com o Plus aberto e ao menos um negócio acompanhado), a
 * lista e o negócio (o Resumo do ano, a exportação e "Deixar de acompanhar"). Só leitura: a Contabilidade nunca anota.
 */
export const ACCOUNTING_TEXT = {
  accountTitle: 'Negócios que você acompanha',
  /** A pílula do cabeçalho das telas da Contabilidade: a área, que não é um espaço da pessoa. */
  context: 'Contabilidade',
  accountHint: (count: number): string =>
    count === 1
      ? 'Você acompanha 1 negócio como Contabilidade: vê o resumo do ano e exporta os lançamentos.'
      : `Você acompanha ${count} negócios como Contabilidade: vê o resumo do ano e exporta os lançamentos.`,
  accountOpen: 'Ver os negócios que você acompanha',
  title: 'Negócios que você acompanha',
  intro:
    'Você acompanha estes negócios como Contabilidade: vê o resumo do ano e exporta os lançamentos, sem anotar nem mudar nada. Eles ficam fora dos seus espaços.',
  privacy: 'Ninguém destes negócios vê o seu Pessoal, e você não vê o Pessoal nem a Família de ninguém.',
  rowAdmin: (adminName: string): string => `Quem administra: ${adminName}`,
  rowSince: (day: IsoDate): string => `Você acompanha desde ${formatDateBR(day)}`,
  rowA11y: (name: string, adminName: string, day: IsoDate): string => `${name}. Quem administra: ${adminName}. Você acompanha desde ${formatDateBR(day)}`,
  /** O estado vazio neutro das telas /contabilidade* (Plus fechado ou nenhum negócio acompanhado): nada do Plus é dito. */
  neutralTitle: 'Nada para mostrar',
  neutralBody: 'Não há nada para mostrar nesta tela agora.',
  goBack: 'Voltar para Conta',
  yearTitle: 'Resumo do ano',
  readOnly: 'Só leitura: você vê e exporta, sem anotar nem mudar nada.',
  notAdvice: 'Os valores são os que as pessoas do negócio anotaram. A Clarevo não faz contabilidade nem cálculo de impostos.',
  meiNote: 'Pela data de cada entrada. Os valores são os que as pessoas do negócio anotaram e não são uma declaração pronta.',
  export: 'Exportar os lançamentos',
  exportHint: 'A exportação que já existe na Clarevo, com este negócio: planilha ou PDF, montados neste aparelho.',
  /** A tela de exportar aberta pela Contabilidade: o título e a introdução (o resto é a exportação de sempre, com este negócio). */
  exportIntro:
    'Leve os lançamentos deste negócio para uma planilha ou guarde um resumo em PDF. O arquivo é montado neste aparelho, com os registros que o app já lê. A Clarevo não guarda cópia dele.',
  leave: 'Deixar de acompanhar',
  leaveTitle: (name: string): string => `Deixar de acompanhar ${name}?`,
  leaveBody: 'Você deixa de ver este negócio na hora. Nada muda nos lançamentos do negócio, e quem administra pode convidar você de novo.',
  leaveConfirm: 'Deixar de acompanhar',
  left: (name: string): string => `Você deixou de acompanhar ${name}.`,
  /** Enquanto a chave do Plus e a lista são lidas: o mesmo quadro neutro, sem nada da Contabilidade (a tela pode abrir com o Plus fechado). */
  pendingTitle: 'Um momento',
  pendingLabel: 'Carregando…',
  unavailable: 'Este negócio não está disponível para você agora.',
  cancel: 'Cancelar',
} as const;

/** Os negócios acompanhados em ordem de nome (a ordem de my_accounting_businesses), com o id como desempate. */
export function sortAccountingBusinesses(list: readonly AccountingBusiness[]): AccountingBusiness[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || a.id.localeCompare(b.id));
}
