import type { BusinessProfile } from './business';
import type {
  AccountingBusiness,
  BusinessInvite,
  BusinessInvitePreview,
  BusinessInviteRole,
  BusinessJoin,
  BusinessMember,
  BusinessMemberRole,
  BusinessPeopleAction,
  BusinessRole,
} from './business-people';
import {
  BUSINESS_ACCOUNTANT_MAX,
  BUSINESS_MAX_PEOPLE,
  BUSINESS_INVITE_VALID_DAYS,
  businessFirstNameOf,
  isBusinessInviteRole,
  sortAccountingBusinesses,
} from './business-people';
import type { FamilyRole } from './family';
import { FAMILY_DEPARTED_NAME, inviteCodeHash, inviteRoleError } from './family';
import { RepoError } from './repository';
import { sha256Hex } from './sha256';

/**
 * Negócios na memória (demonstração e testes), com as mesmas regras e os mesmos códigos de erro das migrações 0042 e 0043: o registro dos
 * negócios (nome, quem administra, encerramento), os vínculos (quem administra, quem anota e vê, quem só vê), os convites do negócio
 * compartilhado (D-116, Clarevo Plus) e a chave do Plus. Cada MemoryRepository registra a pessoa aqui; repositórios que compartilham o
 * mesmo hub compartilham os negócios, os vínculos e os convites. O que cada pessoa anota no negócio (lançamentos, contas a pagar etc.) fica
 * no repositório dela: aqui só mora a administração, como no MemoryFamilyHub.
 *
 * As ações do negócio compartilhado usam a chave de idempotência por pessoa: repetir a mesma chave devolve o mesmo resultado, e outro
 * conteúdo com a mesma chave é chave_reutilizada. Tudo é síncrono: cada ação confere tudo antes da primeira mudança.
 *
 * Negócio com equipe (D-123, migração 0046): a resposta da sociedade, passar a administração (transfer) e o vínculo da Contabilidade
 * (accountant: lê, nunca anota; fora das 6 pessoas e da regra de um negócio por vez; até 3 por negócio, contando os convites válidos).
 */

export interface MemoryBusinessHubOptions {
  /** Relógio em milissegundos desde 1970 (convite vale 7 dias a partir daqui). Padrão: Date.now. */
  now?: () => number;
  /** Sorteio em [0, 1) do código do convite. Padrão: Math.random. */
  random?: () => number;
  /** A chave do Plus (plus_settings): fechada por padrão, como no banco. */
  plusOpen?: boolean;
}

interface StoredBusiness {
  id: string;
  name: string;
  createdAt: string;
  endedAt: string | null;
  ownerId: string;
  /** O tipo do negócio (D-121), ou null ("Prefiro não dizer"). */
  profile: BusinessProfile | null;
  /** O negócio é uma sociedade? (D-123): null enquanto quem administra não respondeu. */
  partnership: boolean | null;
}

interface StoredMember {
  contextId: string;
  personId: string;
  owner: boolean;
  canWrite: boolean;
  /** O vínculo da Contabilidade (D-123, context_memberships.accountant): só lê e exporta. */
  accountant: boolean;
  joinedAt: string;
  leftAt: string | null;
}

interface StoredInvite extends BusinessInvite {
  codeHash: string;
  usedBy: string | null;
}

interface StoredOp {
  action: BusinessPeopleAction;
  hash: string;
  contextId: string;
  targetId: string;
}

interface StoredPerson {
  displayName: string;
  /**
   * O repositório da pessoa desliga as retiradas dela entre o negócio e o Pessoal (como clarevo_unlink_withdrawals): chamado quando ela
   * sai ou é removida. As retiradas ficam no repositório de quem as fez.
   */
  onUnlink?: (contextId: string) => void;
}

/** O negócio como o repositório o lê. */
export interface MemoryBusinessView {
  id: string;
  name: string;
  createdAt: string;
  endedAt: string | null;
  ownerId: string;
  profile: BusinessProfile | null;
  partnership: boolean | null;
}

/** As pessoas de um negócio como quem consulta as lê (sem a chave do Plus, que o repositório junta). */
export interface MemoryBusinessPeopleView {
  role: BusinessRole;
  members: BusinessMember[];
  invites: BusinessInvite[];
}

const memberKey = (contextId: string, personId: string) => `${contextId}|${personId}`;

export class MemoryBusinessHub {
  private people = new Map<string, StoredPerson>();
  private businesses = new Map<string, StoredBusiness>();
  private members = new Map<string, StoredMember>();
  private invites = new Map<string, StoredInvite>();
  private ops = new Map<string, StoredOp>();
  /** Quem excluiu a conta e ainda aparece como ex-membro de algum negócio: o nome vira "Pessoa que saiu". */
  private departed = new Set<string>();
  private seq = 0;
  private plus: boolean;

  constructor(private readonly opts: MemoryBusinessHubOptions = {}) {
    this.plus = opts.plusOpen === true;
  }

  private nowMs(): number {
    return (this.opts.now ?? Date.now)();
  }

  private nowIso(): string {
    return new Date(this.nowMs()).toISOString();
  }

  private id(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq.toString(36).padStart(4, '0')}`;
  }

  // -------------------------------------------------------------------------
  // A chave do Plus (plus_settings e clarevo_staff_set_plus)
  // -------------------------------------------------------------------------

  /** plus_status: aberto para todas as pessoas? */
  plusOpen(): boolean {
    return this.plus;
  }

  /** Como clarevo_staff_set_plus: só a equipe, pelo SQL Editor; aqui, a demonstração e os testes. */
  setPlusOpen(open: boolean): void {
    this.plus = open;
  }

  // -------------------------------------------------------------------------
  // Pessoas e negócios (o repositório chama ao criar o Pessoal, criar, renomear e encerrar o negócio)
  // -------------------------------------------------------------------------

  /** A pessoa existe (tem o Pessoal). `onUnlink` desliga as retiradas dela quando sai ou é removida de um negócio. */
  register(personId: string, displayName: string, onUnlink?: (contextId: string) => void): void {
    this.people.set(personId, { displayName, onUnlink });
  }

  /** A pessoa tem o Pessoal (para aceitar um convite: sem_permissao antes). */
  hasPerson(personId: string): boolean {
    return this.people.has(personId);
  }

  /** create_business: o negócio nasce com quem criou administrando. As regras (nome, um por pessoa) ficam no repositório. */
  open(ownerId: string, id: string, name: string, createdAt: string): void {
    this.businesses.set(id, { id, name, createdAt, endedAt: null, ownerId, profile: null, partnership: null });
    this.members.set(memberKey(id, ownerId), { contextId: id, personId: ownerId, owner: true, canWrite: true, accountant: false, joinedAt: createdAt, leftAt: null });
  }

  /** rename_business. */
  rename(id: string, name: string): void {
    const b = this.businesses.get(id);
    if (b) this.businesses.set(id, { ...b, name });
  }

  /** set_business_profile (D-121): o tipo do negócio, ou null. As regras (quem administra, o valor) ficam no repositório. */
  setProfile(id: string, profile: BusinessProfile | null): void {
    const b = this.businesses.get(id);
    if (b) this.businesses.set(id, { ...b, profile });
  }

  /** set_business_partnership (D-123): a resposta da sociedade, ou null. As regras (quem administra, o Plus) ficam no repositório. */
  setPartnership(id: string, partnership: boolean | null): void {
    const b = this.businesses.get(id);
    if (b) this.businesses.set(id, { ...b, partnership });
  }

  /** end_business: o fim do vínculo de quem administra, os convites pendentes cancelados (0043) e o negócio marcado como encerrado. */
  close(id: string, at: string): void {
    const b = this.businesses.get(id);
    if (!b) return;
    for (const m of this.members.values()) if (m.contextId === id && m.leftAt === null) m.leftAt = at;
    for (const i of this.invites.values()) if (i.contextId === id && i.usedAt === null && i.cancelledAt === null) i.cancelledAt = at;
    this.businesses.set(id, { ...b, endedAt: at });
  }

  /** O contexto é (ou foi) um negócio deste hub. */
  isBusiness(contextId: string): boolean {
    return this.businesses.has(contextId);
  }

  /** O negócio, ativo ou encerrado (para repetir uma criação), ou null. */
  business(contextId: string): MemoryBusinessView | null {
    const b = this.businesses.get(contextId);
    return b ? { ...b } : null;
  }

  private activeMember(contextId: string, personId: string): StoredMember | undefined {
    const m = this.members.get(memberKey(contextId, personId));
    return m && m.leftAt === null ? m : undefined;
  }

  /** Vínculo ativo num negócio não encerrado: o que a RLS do banco deixa ler. */
  canRead(contextId: string, personId: string): boolean {
    const b = this.businesses.get(contextId);
    return Boolean(b && b.endedAt === null && this.activeMember(contextId, personId));
  }

  /** Quem administra e quem anota e vê; quem só vê, não. */
  canWrite(contextId: string, personId: string): boolean {
    return this.canRead(contextId, personId) && Boolean(this.activeMember(contextId, personId)?.canWrite);
  }

  /** Quem administra (context_permission 'manage'). */
  isOwner(contextId: string, personId: string): boolean {
    return this.canRead(contextId, personId) && Boolean(this.activeMember(contextId, personId)?.owner);
  }

  private roleOfMember(m: StoredMember): BusinessRole {
    return m.owner ? 'titular' : m.accountant ? 'contabilidade' : m.canWrite ? 'membro' : 'leitor';
  }

  /** O papel da pessoa no negócio, ou null sem vínculo ativo. */
  roleOf(contextId: string, personId: string): BusinessRole | null {
    if (!this.canRead(contextId, personId)) return null;
    return this.roleOfMember(this.activeMember(contextId, personId)!);
  }

  /**
   * O papel como o negócio o mostra a quem o lê (BusinessContext.role): a Contabilidade lê como quem só vê ('leitor'); o negócio que ela
   * acompanha nunca é um espaço dela (D-123).
   */
  contextRoleOf(contextId: string, personId: string): FamilyRole | null {
    const role = this.roleOf(contextId, personId);
    return role === 'contabilidade' ? 'leitor' : role;
  }

  /** A pessoa acompanha este negócio como Contabilidade (vínculo ativo)? */
  isAccountantOf(contextId: string, personId: string): boolean {
    return this.canRead(contextId, personId) && Boolean(this.activeMember(contextId, personId)?.accountant);
  }

  /**
   * O negócio ativo da pessoa (o próprio ou o de outra pessoa), ou null: um por vez (clarevo_active_business_count). Os negócios que ela
   * acompanha como Contabilidade não contam (D-123): ficam fora dos espaços dela.
   */
  activeBusinessOf(personId: string): string | null {
    // Como a leitura do app (financial_contexts com kind 'negocio', o primeiro por criação, sem os da Contabilidade).
    const live = [...this.members.values()]
      .filter((m) => m.personId === personId && m.leftAt === null && !m.accountant)
      .map((m) => this.businesses.get(m.contextId))
      .filter((b): b is StoredBusiness => Boolean(b && b.endedAt === null))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    return live[0]?.id ?? null;
  }

  /** Há (ou houve) outra pessoa no negócio, ativa ou que saiu? O vínculo de quem saiu continua em context_memberships, revogado. */
  hasOthers(contextId: string, personId: string): boolean {
    return [...this.members.values()].some((m) => m.contextId === contextId && m.personId !== personId);
  }

  /**
   * Há outra pessoa ativa que anota ou só vê no negócio (negocio_com_membros ao encerrar e ao excluir a conta)? A Contabilidade não impede
   * (D-123): encerrar e excluir a conta tiram o acesso dela.
   */
  hasOtherActive(contextId: string, personId: string): boolean {
    return [...this.members.values()].some((m) => m.contextId === contextId && m.leftAt === null && m.personId !== personId && !m.accountant);
  }

  private nameOf(personId: string): string {
    if (this.departed.has(personId)) return FAMILY_DEPARTED_NAME;
    return businessFirstNameOf(this.people.get(personId)?.displayName ?? '');
  }

  private memberView(m: StoredMember, viewer: string): BusinessMember {
    return {
      personId: m.personId,
      firstName: this.nameOf(m.personId),
      role: this.roleOfMember(m),
      status: m.leftAt === null ? 'ativo' : 'ex-membro',
      isMe: m.personId === viewer,
      joinedAt: m.joinedAt,
      leftAt: m.leftAt,
    };
  }

  private inviteView(i: StoredInvite): BusinessInvite {
    return {
      id: i.id,
      contextId: i.contextId,
      role: i.role,
      createdBy: i.createdBy,
      expiresAt: i.expiresAt,
      usedAt: i.usedAt,
      cancelledAt: i.cancelledAt,
      createdAt: i.createdAt,
    };
  }

  private inviteValid(i: StoredInvite): boolean {
    return i.usedAt === null && i.cancelledAt === null && Date.parse(i.expiresAt) > this.nowMs();
  }

  private validInvites(contextId: string): StoredInvite[] {
    return [...this.invites.values()].filter((i) => i.contextId === contextId && this.inviteValid(i));
  }

  /** Pessoas ativas que contam no limite: as 6 pessoas (sem a Contabilidade) ou os 3 acessos de Contabilidade (D-123). */
  private activeCount(contextId: string, accountant = false): number {
    return [...this.members.values()].filter((m) => m.contextId === contextId && m.leftAt === null && m.accountant === accountant).length;
  }

  /** Convites válidos que contam no mesmo limite. */
  private pendingCount(contextId: string, accountant = false): number {
    return this.validInvites(contextId).filter((i) => (i.role === 'contabilidade') === accountant).length;
  }

  /** A própria pessoa, como a visão business_member_items a mostraria (para a leitura com o Plus fechado). */
  selfView(contextId: string, personId: string): BusinessMember | null {
    const m = this.activeMember(contextId, personId);
    return m && this.canRead(contextId, personId) ? this.memberView(m, personId) : null;
  }

  /**
   * As pessoas do negócio (ativas primeiro, quem administra no topo; depois as que saíram) e, só para quem administra, os convites
   * válidos (a política business_invites_read). Null sem vínculo ativo.
   */
  peopleOf(contextId: string, viewer: string): MemoryBusinessPeopleView | null {
    if (!this.canRead(contextId, viewer)) return null;
    const mine = this.activeMember(contextId, viewer)!;
    const all = [...this.members.values()].filter((m) => m.contextId === contextId);
    // Quem administra no topo, depois quem anota ou só vê e, por último, a Contabilidade (D-123), cada grupo por entrada.
    const active = all
      .filter((m) => m.leftAt === null)
      .sort((a, b) => Number(b.owner) - Number(a.owner) || Number(a.accountant) - Number(b.accountant) || a.joinedAt.localeCompare(b.joinedAt) || a.personId.localeCompare(b.personId));
    const former = all.filter((m) => m.leftAt !== null).sort((a, b) => (a.leftAt ?? '').localeCompare(b.leftAt ?? '') || a.personId.localeCompare(b.personId));
    return {
      role: this.roleOfMember(mine),
      members: [...active, ...former].map((m) => this.memberView(m, viewer)),
      invites: mine.owner ? this.validInvites(contextId).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).map((i) => this.inviteView(i)) : [],
    };
  }

  // -------------------------------------------------------------------------
  // Chave de idempotência (por pessoa)
  // -------------------------------------------------------------------------

  private replay(actor: string, key: string, action: BusinessPeopleAction, hash: string): StoredOp | null {
    const op = this.ops.get(`${actor}|${key}`);
    if (!op) return null;
    if (op.action !== action || op.hash !== hash) throw new RepoError('chave_reutilizada');
    return op;
  }

  private save(actor: string, key: string, action: BusinessPeopleAction, hash: string, contextId: string, targetId: string): void {
    this.ops.set(`${actor}|${key}`, { action, hash, contextId, targetId });
  }

  /** Reconciliação: a ação com esta chave já foi concluída? targetId é o convite, o negócio ou a pessoa, como em record_operations.target_id. */
  findOperation(actor: string, key: string): { action: BusinessPeopleAction; targetId: string } | null {
    const op = this.ops.get(`${actor}|${key}`);
    return op ? { action: op.action, targetId: op.targetId } : null;
  }

  /** Repetição: só devolve o resultado se a pessoa ainda lê o negócio (vínculo revogado não vê nada). */
  private replayRead(actor: string, op: StoredOp): void {
    if (!this.canRead(op.contextId, actor)) throw new RepoError('nao_encontrado');
  }

  /**
   * Como clarevo_require_business_owner: sem leitura, nao_encontrado (sem revelar que existe); um contexto que a pessoa lê e não é
   * negócio (o Pessoal, a Família), contexto_invalido; quem não administra, sem_permissao. `readsOther` diz se a pessoa lê o contexto fora
   * dos negócios (o repositório sabe do Pessoal e da Família).
   */
  private requireOwner(actor: string, contextId: string | null | undefined, readsOther: (contextId: string) => boolean): StoredBusiness {
    if (contextId == null || !(this.canRead(contextId, actor) || readsOther(contextId))) throw new RepoError('nao_encontrado');
    const b = this.businesses.get(contextId);
    if (!b || !this.canRead(contextId, actor)) throw new RepoError('contexto_invalido');
    if (!this.activeMember(contextId, actor)?.owner) throw new RepoError('sem_permissao');
    return b;
  }

  private unlink(personId: string, contextId: string): void {
    this.people.get(personId)?.onUnlink?.(contextId);
  }

  // -------------------------------------------------------------------------
  // Escritas do negócio compartilhado (migração 0043)
  // -------------------------------------------------------------------------

  /**
   * create_business_invite. Ordem: repetição; nao_encontrado; contexto_invalido; sem_permissao; plus_indisponivel; papel_invalido;
   * negocio_cheio (sem contar a Contabilidade) ou, no convite da Contabilidade (D-123), contabilidade_cheia (3 acessos, contando os
   * convites válidos). O código (128 bits, 32 hexadecimais) aparece uma única vez; só o resumo SHA-256 fica guardado.
   */
  createInvite(
    actor: string,
    key: string,
    contextId: string,
    role: BusinessInviteRole,
    readsOther: (contextId: string) => boolean,
  ): { invite: BusinessInvite; code: string | null } {
    const hash = JSON.stringify(['criar_convite_negocio', contextId, role]);
    const prev = this.replay(actor, key, 'criar_convite_negocio', hash);
    if (prev) {
      this.replayRead(actor, prev);
      return { invite: this.inviteView(this.invites.get(prev.targetId)!), code: null };
    }
    this.requireOwner(actor, contextId, readsOther);
    if (!this.plus) throw new RepoError('plus_indisponivel');
    if (!isBusinessInviteRole(role)) throw new RepoError('papel_invalido');
    if (role === 'contabilidade') {
      if (this.activeCount(contextId, true) + this.pendingCount(contextId, true) >= BUSINESS_ACCOUNTANT_MAX) throw new RepoError('contabilidade_cheia');
    } else if (this.activeCount(contextId) + this.pendingCount(contextId) >= BUSINESS_MAX_PEOPLE) throw new RepoError('negocio_cheio');
    const code = this.newCode();
    const now = this.nowMs();
    const invite: StoredInvite = {
      id: this.id('convite-negocio'),
      contextId,
      role,
      createdBy: actor,
      codeHash: sha256Hex(code),
      expiresAt: new Date(now + BUSINESS_INVITE_VALID_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      usedAt: null,
      usedBy: null,
      cancelledAt: null,
      createdAt: new Date(now).toISOString(),
    };
    this.invites.set(invite.id, invite);
    this.save(actor, key, 'criar_convite_negocio', hash, contextId, invite.id);
    return { invite: this.inviteView(invite), code };
  }

  private newCode(): string {
    const random = this.opts.random ?? Math.random;
    let code = '';
    for (let i = 0; i < 32; i += 1) code += Math.floor(random() * 16).toString(16);
    return code;
  }

  /** cancel_business_invite. Convite usado: convite_ja_usado; já cancelado ou vencido: segue cancelado, sem erro. */
  cancelInvite(actor: string, key: string, inviteId: string, readsOther: (contextId: string) => boolean): BusinessInvite {
    const hash = JSON.stringify(['cancelar_convite_negocio', inviteId]);
    const prev = this.replay(actor, key, 'cancelar_convite_negocio', hash);
    if (prev) {
      this.replayRead(actor, prev);
      return this.inviteView(this.invites.get(prev.targetId)!);
    }
    const invite = this.invites.get(inviteId);
    this.requireOwner(actor, invite?.contextId, readsOther);
    if (!invite) throw new RepoError('nao_encontrado');
    if (invite.usedAt !== null) throw new RepoError('convite_ja_usado');
    if (invite.cancelledAt === null) invite.cancelledAt = this.nowIso();
    this.save(actor, key, 'cancelar_convite_negocio', hash, invite.contextId, invite.id);
    return this.inviteView(invite);
  }

  private inviteByCode(code: unknown): StoredInvite | null {
    const h = inviteCodeHash(code);
    if (h === null) return null;
    for (const i of this.invites.values()) if (i.codeHash === h) return i;
    return null;
  }

  /**
   * preview_business_invite. Qualquer convite que não vale (ou de negócio encerrado, ou com o Plus fechado para quem administra) responde
   * convite_invalido, sem revelar qual caso.
   */
  preview(code: string): BusinessInvitePreview {
    const invite = this.inviteByCode(code);
    const b = invite ? this.businesses.get(invite.contextId) : undefined;
    if (!invite || !this.inviteValid(invite) || !b || b.endedAt !== null || !this.plus) throw new RepoError('convite_invalido');
    return { businessName: b.name, invitedBy: this.nameOf(invite.createdBy), role: invite.role, expiresAt: invite.expiresAt };
  }

  private join(contextId: string, personId: string, invitedBy: string): BusinessJoin {
    const b = this.businesses.get(contextId)!;
    const role = this.roleOfMember(this.members.get(memberKey(contextId, personId))!);
    // A Contabilidade lê o negócio como quem só vê: BusinessContext.role nunca é 'contabilidade' (D-123).
    const contextRole: FamilyRole = role === 'contabilidade' ? 'leitor' : role;
    return {
      context: { id: b.id, name: b.name, createdAt: b.createdAt, role: contextRole, businessProfile: b.profile, businessPartnership: b.partnership },
      role,
      invitedBy,
    };
  }

  /**
   * accept_business_invite. Ordem: repetição; sem_permissao (sem o Pessoal); convite_invalido (formato, inexistente, usado, cancelado,
   * vencido, negócio encerrado ou o Plus fechado para quem administra); ja_no_negocio (com qualquer papel); ja_tem_negocio; negocio_cheio.
   * No convite da Contabilidade (D-123), nem ja_tem_negocio nem negocio_cheio: contabilidade_cheia com 3 acessos ativos. Voltar por um
   * convite novo reativa o mesmo vínculo, com o papel do convite.
   */
  accept(actor: string, key: string, code: string): BusinessJoin {
    const codeHash = inviteCodeHash(code);
    const hash = JSON.stringify(['aceitar_convite_negocio', codeHash]);
    const prev = this.replay(actor, key, 'aceitar_convite_negocio', hash);
    if (prev) {
      this.replayRead(actor, prev);
      const invite = this.invites.get(prev.targetId)!;
      return this.join(prev.contextId, actor, this.nameOf(invite.createdBy));
    }
    if (!this.people.has(actor)) throw new RepoError('sem_permissao');
    const invite = this.inviteByCode(code);
    if (!invite) throw new RepoError('convite_invalido');
    const b = this.businesses.get(invite.contextId);
    if (!this.inviteValid(invite) || !b || b.endedAt !== null || !this.plus) throw new RepoError('convite_invalido');
    if (this.activeMember(b.id, actor)) throw new RepoError('ja_no_negocio');
    const accountant = invite.role === 'contabilidade';
    if (accountant) {
      if (this.activeCount(b.id, true) >= BUSINESS_ACCOUNTANT_MAX) throw new RepoError('contabilidade_cheia');
    } else {
      if (this.activeBusinessOf(actor)) throw new RepoError('ja_tem_negocio');
      if (this.activeCount(b.id) >= BUSINESS_MAX_PEOPLE) throw new RepoError('negocio_cheio');
    }
    const now = this.nowIso();
    this.members.set(memberKey(b.id, actor), { contextId: b.id, personId: actor, owner: false, canWrite: invite.role === 'membro', accountant, joinedAt: now, leftAt: null });
    invite.usedAt = now;
    invite.usedBy = actor;
    this.save(actor, key, 'aceitar_convite_negocio', hash, b.id, invite.id);
    return this.join(b.id, actor, this.nameOf(invite.createdBy));
  }

  /**
   * leave_business. Repetir a mesma chave devolve o resultado mesmo depois da saída. Ordem: nao_encontrado (sem leitura); contexto_invalido
   * (não é negócio); nao_encontrado (sem vínculo ativo); titular_nao_sai. As retiradas da pessoa deixam de ser ligadas, e os convites
   * pendentes que ela criou no negócio são cancelados (D-123).
   */
  leave(actor: string, key: string, contextId: string, readsOther: (contextId: string) => boolean): void {
    const hash = JSON.stringify(['sair_negocio', contextId]);
    if (this.replay(actor, key, 'sair_negocio', hash)) return;
    if (contextId == null || !(this.canRead(contextId, actor) || readsOther(contextId))) throw new RepoError('nao_encontrado');
    if (!this.businesses.has(contextId)) throw new RepoError('contexto_invalido');
    const m = this.activeMember(contextId, actor);
    if (!m || !this.canRead(contextId, actor)) throw new RepoError('nao_encontrado');
    if (m.owner) throw new RepoError('titular_nao_sai');
    m.leftAt = this.nowIso();
    this.cancelInvitesOf(contextId, actor);
    this.unlink(actor, contextId);
    this.save(actor, key, 'sair_negocio', hash, contextId, contextId);
  }

  /**
   * Os convites pendentes que a pessoa criou no negócio são cancelados quando ela sai ou é removida (clarevo_cancel_business_invites_of,
   * D-123, como na Família): depois de passar a administração, quem administrava pode ter deixado convites que ainda valeriam.
   */
  private cancelInvitesOf(contextId: string, personId: string): void {
    const now = this.nowIso();
    for (const i of this.invites.values()) {
      if (i.contextId === contextId && i.createdBy === personId && i.usedAt === null && i.cancelledAt === null) i.cancelledAt = now;
    }
  }

  /**
   * remove_business_member. Ordem: repetição; quem administra; pessoa informada; nao_sobre_si; vínculo ativo de quem não administra. Os
   * convites pendentes que a pessoa removida criou no negócio são cancelados (D-123).
   */
  remove(actor: string, key: string, contextId: string, personId: string, readsOther: (contextId: string) => boolean): void {
    const hash = JSON.stringify(['remover_membro_negocio', contextId, personId]);
    const prev = this.replay(actor, key, 'remover_membro_negocio', hash);
    if (prev) return this.replayRead(actor, prev);
    this.requireOwner(actor, contextId, readsOther);
    if (personId == null) throw new RepoError('nao_encontrado');
    if (personId === actor) throw new RepoError('nao_sobre_si');
    const target = this.activeMember(contextId, personId);
    if (!target || target.owner) throw new RepoError('nao_encontrado');
    target.leftAt = this.nowIso();
    this.cancelInvitesOf(contextId, personId);
    this.unlink(personId, contextId);
    this.save(actor, key, 'remover_membro_negocio', hash, contextId, personId);
  }

  /**
   * set_business_member_role. Ordem: repetição; quem administra; papel_invalido; pessoa informada; nao_sobre_si; vínculo ativo;
   * papel_invalido para a Contabilidade (D-123: não muda de papel, nem para, nem de). Ao passar para "Só vê", as retiradas da pessoa
   * deixam de ser ligadas.
   */
  setRole(actor: string, key: string, contextId: string, personId: string, role: BusinessMemberRole, readsOther: (contextId: string) => boolean): void {
    const hash = JSON.stringify(['alterar_papel_negocio', contextId, personId, role]);
    const prev = this.replay(actor, key, 'alterar_papel_negocio', hash);
    if (prev) return this.replayRead(actor, prev);
    this.requireOwner(actor, contextId, readsOther);
    if (inviteRoleError(role)) throw new RepoError('papel_invalido');
    if (personId == null) throw new RepoError('nao_encontrado');
    if (personId === actor) throw new RepoError('nao_sobre_si');
    const target = this.activeMember(contextId, personId);
    if (!target || target.owner) throw new RepoError('nao_encontrado');
    if (target.accountant) throw new RepoError('papel_invalido');
    target.canWrite = role === 'membro';
    // Quem passa a só ver não exclui nem move mais as retiradas dela: os dois lados deixam de ser ligados, como ao sair (0043).
    if (role === 'leitor') this.unlink(personId, contextId);
    this.save(actor, key, 'alterar_papel_negocio', hash, contextId, personId);
  }

  /**
   * transfer_business_admin (D-123, migração 0046). Ordem: repetição (chave_reutilizada com outro conteúdo); nao_encontrado (negócio que a
   * pessoa não lê); contexto_invalido; sem_permissao (não administra); pessoa informada; nao_sobre_si; nao_encontrado (alvo sem vínculo
   * ativo); papel_invalido (alvo da Contabilidade). Quem administrava passa a "Anota e vê" (lê e anota); o alvo passa a administrar (lê,
   * anota e edita o que é de outras pessoas). Os convites válidos continuam. Não passa pela chave do Plus: é a saída de um negócio que
   * ficaria preso.
   */
  transfer(actor: string, key: string, contextId: string, personId: string, readsOther: (contextId: string) => boolean): { contextId: string; personId: string; role: 'titular' } {
    const hash = JSON.stringify(['transferir_administracao_negocio', contextId, personId]);
    const prev = this.replay(actor, key, 'transferir_administracao_negocio', hash);
    if (prev) {
      this.replayRead(actor, prev);
      return { contextId, personId, role: 'titular' };
    }
    const b = this.requireOwner(actor, contextId, readsOther);
    if (personId == null) throw new RepoError('nao_encontrado');
    if (personId === actor) throw new RepoError('nao_sobre_si');
    const target = this.activeMember(contextId, personId);
    if (!target || target.owner) throw new RepoError('nao_encontrado');
    if (target.accountant) throw new RepoError('papel_invalido');
    const mine = this.activeMember(contextId, actor)!;
    mine.owner = false;
    mine.canWrite = true;
    target.owner = true;
    target.canWrite = true;
    this.businesses.set(b.id, { ...b, ownerId: personId });
    this.save(actor, key, 'transferir_administracao_negocio', hash, contextId, personId);
    return { contextId, personId, role: 'titular' };
  }

  /**
   * my_accounting_businesses (D-123): os negócios ativos (não encerrados) em que a pessoa é da Contabilidade, com vínculo ativo, por nome:
   * o primeiro nome de quem administra ("Pessoa do negócio" sem nome), quando o negócio foi criado e desde quando a pessoa acompanha.
   */
  accountingOf(personId: string): AccountingBusiness[] {
    const out: AccountingBusiness[] = [];
    for (const m of this.members.values()) {
      if (m.personId !== personId || m.leftAt !== null || !m.accountant) continue;
      const b = this.businesses.get(m.contextId);
      if (!b || b.endedAt !== null) continue;
      out.push({ id: b.id, name: b.name, businessProfile: b.profile, adminName: this.nameOf(b.ownerId), createdAt: b.createdAt, since: m.joinedAt });
    }
    return sortAccountingBusinesses(out);
  }

  // -------------------------------------------------------------------------
  // Excluir a conta (D-058 e 0043): as regras de clarevo_erase_person para os negócios
  // -------------------------------------------------------------------------

  /**
   * Quem administra um negócio ativo com outras pessoas ativas que anotam ou só veem passa a administração ou remove as pessoas antes:
   * negocio_com_membros. A Contabilidade não impede (D-123): o negócio é apagado e ela perde o acesso. Não muda nada.
   */
  assertCanErase(personId: string): void {
    for (const b of this.businesses.values()) {
      if (b.endedAt !== null || b.ownerId !== personId) continue;
      if (this.hasOtherActive(b.id, personId)) throw new RepoError('negocio_com_membros');
    }
  }

  /**
   * Apaga a pessoa dos negócios. Os negócios dela (ativos ou encerrados) acabam por inteiro, com os convites e as pessoas anônimas que só
   * continuavam por causa deles. Nos outros, a pessoa sai; ela continua na lista como "Pessoa que saiu" só se anotou algo ali
   * (`authoredIn`, os contextos em que o repositório dela tem dados). Os convites que criou somem e o uso dela, nos outros, fica sem
   * pessoa. Valida antes de mudar qualquer coisa.
   */
  erase(personId: string, authoredIn: ReadonlySet<string> = new Set()): void {
    this.assertCanErase(personId);
    const now = this.nowIso();
    for (const b of [...this.businesses.values()]) if (b.ownerId === personId) this.drop(b.id);
    for (const [key, m] of [...this.members]) {
      if (m.personId !== personId) continue;
      if (m.leftAt === null) m.leftAt = now;
      if (!authoredIn.has(m.contextId)) this.members.delete(key);
    }
    for (const [id, i] of [...this.invites]) {
      if (i.createdBy === personId) this.invites.delete(id);
      else if (i.usedBy === personId) i.usedBy = null;
    }
    for (const key of [...this.ops.keys()]) if (key.startsWith(`${personId}|`)) this.ops.delete(key);
    this.people.delete(personId);
    if ([...this.members.values()].some((m) => m.personId === personId)) this.departed.add(personId);
  }

  /** Um negócio que acaba leva os vínculos, os convites, as operações e as pessoas anônimas que só existiam por causa dele. */
  private drop(contextId: string): void {
    const ghosts = [...this.members.values()].filter((m) => m.contextId === contextId && this.departed.has(m.personId)).map((m) => m.personId);
    this.businesses.delete(contextId);
    for (const [key, m] of [...this.members]) if (m.contextId === contextId) this.members.delete(key);
    for (const [id, i] of [...this.invites]) if (i.contextId === contextId) this.invites.delete(id);
    for (const [key, op] of [...this.ops]) if (op.contextId === contextId) this.ops.delete(key);
    for (const g of ghosts) if (![...this.members.values()].some((m) => m.personId === g)) this.departed.delete(g);
  }
}
