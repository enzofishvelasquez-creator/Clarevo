import type {
  FamilyAction,
  FamilyInvite,
  FamilyInvitePreview,
  FamilyJoin,
  FamilyMember,
  FamilyOverview,
  FamilyRole,
  InviteRole,
} from './family';
import { FAMILY_DEPARTED_NAME, FAMILY_MAX_PEOPLE, INVITE_VALID_DAYS, familyNameError, firstNameOf, inviteCodeHash, inviteRoleError, normalizeFamilyName } from './family';
import { RepoError } from './repository';
import { sha256Hex } from './sha256';

/**
 * Família na memória (demonstração e testes): as mesmas regras e os mesmos códigos de erro das funções da migração 0013, para
 * várias pessoas ao mesmo tempo. Cada MemoryRepository registra a pessoa aqui; repositórios que compartilham o mesmo hub compartilham
 * vínculos, convites e papéis. O que cada pessoa anota na Família (registros, contas a pagar etc.) fica no repositório dela: aqui
 * só mora a administração da Família.
 *
 * Tudo é síncrono e atômico: valida tudo antes da primeira mudança. As ações usam a chave de idempotência por pessoa: repetir a mesma
 * chave devolve o mesmo resultado (enquanto o vínculo vale, como no banco), e outro conteúdo com a mesma chave é chave_reutilizada.
 * Nenhuma ação conta como anotação na atividade (D-030).
 */

export interface MemoryFamilyHubOptions {
  /** Relógio em milissegundos desde 1970 (convite vale 7 dias a partir daqui). Padrão: Date.now. */
  now?: () => number;
  /** Sorteio em [0, 1) do código do convite. Padrão: Math.random. */
  random?: () => number;
}

interface StoredFamily {
  id: string;
  name: string;
  createdAt: string;
  endedAt: string | null;
  ownerId: string;
}

interface StoredMember {
  contextId: string;
  personId: string;
  owner: boolean;
  canWrite: boolean;
  joinedAt: string;
  leftAt: string | null;
}

interface StoredInvite extends FamilyInvite {
  codeHash: string;
  usedBy: string | null;
}

interface StoredOp {
  action: FamilyAction;
  hash: string;
  contextId: string;
  targetId: string;
}

const memberKey = (contextId: string, personId: string) => `${contextId}|${personId}`;

export class MemoryFamilyHub {
  private people = new Map<string, { displayName: string; personalContextId: string | null }>();
  private families = new Map<string, StoredFamily>();
  private members = new Map<string, StoredMember>();
  private invites = new Map<string, StoredInvite>();
  private ops = new Map<string, StoredOp>();
  /** Quem excluiu a conta (D-058) e ainda aparece como ex-membro de alguma Família: o nome vira "Pessoa que saiu". */
  private departed = new Set<string>();
  private seq = 0;

  constructor(private readonly opts: MemoryFamilyHubOptions = {}) {}

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

  /** A pessoa existe (tem espaço pessoal). personalContextId é o Pessoal dela, para distinguir "o seu Pessoal" de "não encontrado". */
  register(personId: string, displayName: string, personalContextId: string | null = null): void {
    this.people.set(personId, { displayName, personalContextId });
  }

  // -------------------------------------------------------------------------
  // Leitura
  // -------------------------------------------------------------------------

  private activeMember(contextId: string, personId: string): StoredMember | undefined {
    const m = this.members.get(memberKey(contextId, personId));
    return m && m.leftAt === null ? m : undefined;
  }

  /** Vínculo ativo numa Família não encerrada: o que a RLS do banco deixa ler. */
  canRead(contextId: string, personId: string): boolean {
    const f = this.families.get(contextId);
    return Boolean(f && f.endedAt === null && this.activeMember(contextId, personId));
  }

  canWrite(contextId: string, personId: string): boolean {
    return this.canRead(contextId, personId) && Boolean(this.activeMember(contextId, personId)?.canWrite);
  }

  /** Só o titular edita o que é de outras pessoas. */
  canEditOthers(contextId: string, personId: string): boolean {
    return this.canRead(contextId, personId) && Boolean(this.activeMember(contextId, personId)?.owner);
  }

  isFamily(contextId: string): boolean {
    return this.families.has(contextId);
  }

  /** A Família ativa (não encerrada) da pessoa, ou null: uma por pessoa (L-3). */
  activeFamilyOf(personId: string): string | null {
    let found: StoredMember | null = null;
    for (const m of this.members.values()) {
      if (m.personId !== personId || m.leftAt !== null) continue;
      const f = this.families.get(m.contextId);
      if (!f || f.endedAt !== null) continue;
      if (!found || m.joinedAt < found.joinedAt) found = m;
    }
    return found ? found.contextId : null;
  }

  private roleOf(m: StoredMember): FamilyRole {
    return m.owner ? 'titular' : m.canWrite ? 'membro' : 'leitor';
  }

  private nameOf(personId: string): string {
    if (this.departed.has(personId)) return FAMILY_DEPARTED_NAME;
    return firstNameOf(this.people.get(personId)?.displayName ?? '');
  }

  private memberView(m: StoredMember, viewer: string): FamilyMember {
    return {
      personId: m.personId,
      firstName: this.nameOf(m.personId),
      role: this.roleOf(m),
      status: m.leftAt === null ? 'ativo' : 'ex-membro',
      isMe: m.personId === viewer,
      joinedAt: m.joinedAt,
      leftAt: m.leftAt,
    };
  }

  private inviteView(i: StoredInvite): FamilyInvite {
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

  private activeCount(contextId: string): number {
    return [...this.members.values()].filter((m) => m.contextId === contextId && m.leftAt === null).length;
  }

  /** A Família ativa da pessoa com as pessoas (ativas primeiro, ex-membros depois) e, só para o titular, os convites válidos. */
  getFamily(personId: string): FamilyOverview | null {
    const contextId = this.activeFamilyOf(personId);
    if (!contextId) return null;
    const f = this.families.get(contextId)!;
    const mine = this.activeMember(contextId, personId)!;
    const all = [...this.members.values()].filter((m) => m.contextId === contextId);
    const active = all.filter((m) => m.leftAt === null).sort((a, b) => Number(b.owner) - Number(a.owner) || a.joinedAt.localeCompare(b.joinedAt));
    const former = all.filter((m) => m.leftAt !== null).sort((a, b) => (a.leftAt ?? '').localeCompare(b.leftAt ?? ''));
    return {
      context: { id: f.id, name: f.name, createdAt: f.createdAt },
      role: this.roleOf(mine),
      members: [...active, ...former].map((m) => this.memberView(m, personId)),
      invites: mine.owner ? this.validInvites(contextId).map((i) => this.inviteView(i)) : [],
    };
  }

  private join(contextId: string, personId: string, invitedBy: string | null): FamilyJoin {
    const f = this.families.get(contextId)!;
    return {
      context: { id: f.id, name: f.name, createdAt: f.createdAt },
      role: this.roleOf(this.members.get(memberKey(contextId, personId))!),
      invitedBy,
    };
  }

  // -------------------------------------------------------------------------
  // Chave de idempotência (por pessoa)
  // -------------------------------------------------------------------------

  private replay(actor: string, key: string, action: FamilyAction, hash: string): StoredOp | null {
    const op = this.ops.get(`${actor}|${key}`);
    if (!op) return null;
    if (op.action !== action || op.hash !== hash) throw new RepoError('chave_reutilizada');
    return op;
  }

  private save(actor: string, key: string, action: FamilyAction, hash: string, contextId: string, targetId: string): void {
    this.ops.set(`${actor}|${key}`, { action, hash, contextId, targetId });
  }

  /** A pessoa já usou esta chave (em qualquer ação da Família)? Para o MemoryRepository conferir o espaço de chaves comum. */
  hasOperation(actor: string, key: string): boolean {
    return this.ops.has(`${actor}|${key}`);
  }

  /** Reconciliação: a ação com esta chave já foi concluída? targetId é a Família, o convite ou a pessoa, como em record_operations.target_id. */
  findOperation(actor: string, key: string): { action: FamilyAction; targetId: string } | null {
    const op = this.ops.get(`${actor}|${key}`);
    return op ? { action: op.action, targetId: op.targetId } : null;
  }

  /** Repetição: só devolve o resultado se a pessoa ainda lê a Família (vínculo revogado não vê nada). */
  private replayRead(actor: string, op: StoredOp): void {
    if (!this.canRead(op.contextId, actor)) throw new RepoError('nao_encontrado');
  }

  /**
   * Como clarevo_require_family_owner: sem leitura, nao_encontrado (sem revelar que existe); o Pessoal da própria pessoa,
   * contexto_invalido; quem não é titular, sem_permissao. ownPersonal é o Pessoal de quem chama.
   */
  private requireOwner(actor: string, contextId: string | null | undefined, ownPersonal: string | null): StoredFamily {
    const readable = contextId != null && (this.canRead(contextId, actor) || contextId === ownPersonal);
    if (!readable || contextId == null) throw new RepoError('nao_encontrado');
    const f = this.families.get(contextId);
    if (!f) throw new RepoError('contexto_invalido');
    if (!this.activeMember(contextId, actor)?.owner) throw new RepoError('sem_permissao');
    return f;
  }

  private cancelInvitesOf(contextId: string, personId: string): void {
    const now = this.nowIso();
    for (const i of this.invites.values()) {
      if (i.contextId === contextId && i.createdBy === personId && i.usedAt === null && i.cancelledAt === null) i.cancelledAt = now;
    }
  }

  private requirePerson(actor: string): void {
    if (!this.people.has(actor)) throw new RepoError('sem_permissao');
  }

  // -------------------------------------------------------------------------
  // Escritas (create_family ... end_family)
  // -------------------------------------------------------------------------

  /** create_family. Ordem: repetição; sem_permissao; nome_da_familia_invalido; ja_em_familia. */
  create(actor: string, key: string, rawName: string): FamilyJoin {
    const name = normalizeFamilyName(rawName);
    const hash = JSON.stringify(['criar_familia', name]);
    const prev = this.replay(actor, key, 'criar_familia', hash);
    if (prev) {
      this.replayRead(actor, prev);
      return this.join(prev.contextId, actor, null);
    }
    this.requirePerson(actor);
    if (familyNameError(name)) throw new RepoError('nome_da_familia_invalido');
    if (this.activeFamilyOf(actor)) throw new RepoError('ja_em_familia');
    const now = this.nowIso();
    const id = this.id('familia');
    this.families.set(id, { id, name, createdAt: now, endedAt: null, ownerId: actor });
    this.members.set(memberKey(id, actor), { contextId: id, personId: actor, owner: true, canWrite: true, joinedAt: now, leftAt: null });
    this.save(actor, key, 'criar_familia', hash, id, id);
    return this.join(id, actor, null);
  }

  /**
   * create_family_invite. Ordem: repetição; nao_encontrado; contexto_invalido; sem_permissao; papel_invalido; familia_cheia. O código
   * (128 bits, 32 hexadecimais) aparece uma única vez; só o resumo SHA-256 fica guardado.
   */
  createInvite(actor: string, key: string, contextId: string, role: InviteRole, ownPersonal: string | null): { invite: FamilyInvite; code: string | null } {
    const hash = JSON.stringify(['criar_convite_familia', contextId, role]);
    const prev = this.replay(actor, key, 'criar_convite_familia', hash);
    if (prev) {
      this.replayRead(actor, prev);
      return { invite: this.inviteView(this.invites.get(prev.targetId)!), code: null };
    }
    this.requireOwner(actor, contextId, ownPersonal);
    if (inviteRoleError(role)) throw new RepoError('papel_invalido');
    if (this.activeCount(contextId) + this.validInvites(contextId).length >= FAMILY_MAX_PEOPLE) throw new RepoError('familia_cheia');
    const code = this.newCode();
    const now = this.nowMs();
    const invite: StoredInvite = {
      id: this.id('convite'),
      contextId,
      role,
      createdBy: actor,
      codeHash: sha256Hex(code),
      expiresAt: new Date(now + INVITE_VALID_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      usedAt: null,
      usedBy: null,
      cancelledAt: null,
      createdAt: new Date(now).toISOString(),
    };
    this.invites.set(invite.id, invite);
    this.save(actor, key, 'criar_convite_familia', hash, contextId, invite.id);
    return { invite: this.inviteView(invite), code };
  }

  private newCode(): string {
    const random = this.opts.random ?? Math.random;
    let code = '';
    for (let i = 0; i < 32; i += 1) code += Math.floor(random() * 16).toString(16);
    return code;
  }

  /** cancel_family_invite. Convite usado: convite_ja_usado; já cancelado ou vencido: segue cancelado, sem erro. */
  cancelInvite(actor: string, key: string, inviteId: string): FamilyInvite {
    const hash = JSON.stringify(['cancelar_convite_familia', inviteId]);
    const prev = this.replay(actor, key, 'cancelar_convite_familia', hash);
    if (prev) {
      this.replayRead(actor, prev);
      return this.inviteView(this.invites.get(prev.targetId)!);
    }
    const invite = this.invites.get(inviteId);
    this.requireOwner(actor, invite?.contextId, null);
    if (!invite) throw new RepoError('nao_encontrado');
    if (invite.usedAt !== null) throw new RepoError('convite_ja_usado');
    if (invite.cancelledAt === null) invite.cancelledAt = this.nowIso();
    this.save(actor, key, 'cancelar_convite_familia', hash, invite.contextId, invite.id);
    return this.inviteView(invite);
  }

  private inviteByCode(code: unknown): StoredInvite | null {
    const h = inviteCodeHash(code);
    if (h === null) return null;
    for (const i of this.invites.values()) if (i.codeHash === h) return i;
    return null;
  }

  /** preview_family_invite. Qualquer convite que não vale responde convite_invalido, sem revelar qual caso. */
  preview(code: string): FamilyInvitePreview {
    const invite = this.inviteByCode(code);
    const family = invite ? this.families.get(invite.contextId) : undefined;
    if (!invite || !this.inviteValid(invite) || !family || family.endedAt !== null) throw new RepoError('convite_invalido');
    return { familyName: family.name, invitedBy: this.nameOf(invite.createdBy), role: invite.role, expiresAt: invite.expiresAt };
  }

  /** accept_family_invite. Ordem: repetição; convite_invalido; sem_permissao; (de novo, sob trava) convite_invalido; ja_em_familia; familia_cheia. */
  accept(actor: string, key: string, code: string): FamilyJoin {
    const codeHash = inviteCodeHash(code);
    const hash = JSON.stringify(['aceitar_convite_familia', codeHash]);
    const prev = this.replay(actor, key, 'aceitar_convite_familia', hash);
    if (prev) {
      this.replayRead(actor, prev);
      const invite = this.invites.get(prev.targetId)!;
      return this.join(prev.contextId, actor, this.nameOf(invite.createdBy));
    }
    const invite = this.inviteByCode(code);
    if (!invite) throw new RepoError('convite_invalido');
    this.requirePerson(actor);
    const family = this.families.get(invite.contextId);
    if (!this.inviteValid(invite) || !family || family.endedAt !== null) throw new RepoError('convite_invalido');
    if (this.activeFamilyOf(actor)) throw new RepoError('ja_em_familia');
    if (this.activeCount(family.id) >= FAMILY_MAX_PEOPLE) throw new RepoError('familia_cheia');
    const now = this.nowIso();
    // Voltar por um novo convite reativa o mesmo vínculo (com o papel do convite).
    this.members.set(memberKey(family.id, actor), {
      contextId: family.id,
      personId: actor,
      owner: false,
      canWrite: invite.role === 'membro',
      joinedAt: now,
      leftAt: null,
    });
    invite.usedAt = now;
    invite.usedBy = actor;
    this.save(actor, key, 'aceitar_convite_familia', hash, family.id, invite.id);
    return this.join(family.id, actor, this.nameOf(invite.createdBy));
  }

  /** leave_family. Repetir a mesma chave devolve o resultado mesmo depois da saída. Titular: titular_nao_sai. */
  leave(actor: string, key: string, contextId: string, ownPersonal: string | null): void {
    const hash = JSON.stringify(['sair_familia', contextId]);
    if (this.replay(actor, key, 'sair_familia', hash)) return;
    const readable = contextId != null && (this.canRead(contextId, actor) || contextId === ownPersonal);
    if (!readable) throw new RepoError('nao_encontrado');
    if (!this.families.has(contextId)) throw new RepoError('contexto_invalido');
    const m = this.activeMember(contextId, actor);
    if (!m) throw new RepoError('nao_encontrado');
    if (m.owner) throw new RepoError('titular_nao_sai');
    m.leftAt = this.nowIso();
    this.cancelInvitesOf(contextId, actor);
    this.save(actor, key, 'sair_familia', hash, contextId, contextId);
  }

  /** remove_family_member. Ordem: repetição; titular; pessoa informada; nao_sobre_si; vínculo ativo (nao_encontrado). */
  remove(actor: string, key: string, contextId: string, personId: string, ownPersonal: string | null): void {
    const hash = JSON.stringify(['remover_membro_familia', contextId, personId]);
    const prev = this.replay(actor, key, 'remover_membro_familia', hash);
    if (prev) return this.replayRead(actor, prev);
    this.requireOwner(actor, contextId, ownPersonal);
    if (personId == null) throw new RepoError('nao_encontrado');
    if (personId === actor) throw new RepoError('nao_sobre_si');
    const target = this.activeMember(contextId, personId);
    if (!target) throw new RepoError('nao_encontrado');
    target.leftAt = this.nowIso();
    this.cancelInvitesOf(contextId, personId);
    this.save(actor, key, 'remover_membro_familia', hash, contextId, personId);
  }

  /** set_member_role. Ordem: repetição; titular; papel_invalido; pessoa informada; nao_sobre_si; vínculo ativo. */
  setRole(actor: string, key: string, contextId: string, personId: string, role: InviteRole, ownPersonal: string | null): void {
    const hash = JSON.stringify(['alterar_papel_familia', contextId, personId, role]);
    const prev = this.replay(actor, key, 'alterar_papel_familia', hash);
    if (prev) return this.replayRead(actor, prev);
    this.requireOwner(actor, contextId, ownPersonal);
    if (inviteRoleError(role)) throw new RepoError('papel_invalido');
    if (personId == null) throw new RepoError('nao_encontrado');
    if (personId === actor) throw new RepoError('nao_sobre_si');
    const target = this.activeMember(contextId, personId);
    if (!target) throw new RepoError('nao_encontrado');
    target.canWrite = role === 'membro';
    this.save(actor, key, 'alterar_papel_familia', hash, contextId, personId);
  }

  /** transfer_family_ownership. Quem era titular vira membro (lê e anota); a nova titular edita o que é de outras pessoas. */
  transfer(actor: string, key: string, contextId: string, personId: string, ownPersonal: string | null): void {
    const hash = JSON.stringify(['transferir_titularidade_familia', contextId, personId]);
    const prev = this.replay(actor, key, 'transferir_titularidade_familia', hash);
    if (prev) return this.replayRead(actor, prev);
    const family = this.requireOwner(actor, contextId, ownPersonal);
    if (personId == null) throw new RepoError('nao_encontrado');
    if (personId === actor) throw new RepoError('nao_sobre_si');
    const target = this.activeMember(contextId, personId);
    if (!target) throw new RepoError('nao_encontrado');
    const me = this.activeMember(contextId, actor)!;
    me.owner = false;
    me.canWrite = true;
    target.owner = true;
    target.canWrite = true;
    family.ownerId = personId;
    this.save(actor, key, 'transferir_titularidade_familia', hash, contextId, personId);
  }

  // -------------------------------------------------------------------------
  // Excluir a conta (D-058): as regras 3 e 5 de clarevo_erase_person, na ordem do banco
  // -------------------------------------------------------------------------

  /**
   * Quem é titular (ou dona de Família ainda ativa) com outras pessoas ativas precisa passar a titularidade ou remover as pessoas
   * antes: transferir_antes. Não muda nada.
   */
  assertCanErase(personId: string): void {
    for (const f of this.families.values()) {
      if (f.endedAt !== null) continue;
      if (f.ownerId !== personId && !this.activeMember(f.id, personId)?.owner) continue;
      if ([...this.members.values()].some((m) => m.contextId === f.id && m.leftAt === null && m.personId !== personId)) {
        throw new RepoError('transferir_antes');
      }
    }
  }

  /**
   * Apaga a pessoa da administração da Família. As Famílias dela (titular, ou dona de Família já encerrada) acabam por inteiro, com
   * os convites e as pessoas anônimas que só continuavam por causa delas. Nas outras, a pessoa sai e os convites que criou somem; ela
   * continua na lista como "Pessoa que saiu" só se anotou algo ali (`authoredIn`, os contextos em que o repositório dela tem
   * dados): quem não anotou nada some, como no banco. Valida antes de mudar qualquer coisa.
   */
  erase(personId: string, authoredIn: ReadonlySet<string> = new Set()): void {
    this.assertCanErase(personId);
    const now = this.nowIso();
    for (const f of [...this.families.values()]) {
      if (f.ownerId === personId || this.activeMember(f.id, personId)?.owner) this.dropFamily(f.id);
    }
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

  /** Uma Família que acaba leva os vínculos, os convites, as operações e as pessoas anônimas que só existiam por causa dela. */
  private dropFamily(contextId: string): void {
    const ghosts = [...this.members.values()].filter((m) => m.contextId === contextId && this.departed.has(m.personId)).map((m) => m.personId);
    this.families.delete(contextId);
    for (const [key, m] of [...this.members]) if (m.contextId === contextId) this.members.delete(key);
    for (const [id, i] of [...this.invites]) if (i.contextId === contextId) this.invites.delete(id);
    for (const [key, op] of [...this.ops]) if (op.contextId === contextId) this.ops.delete(key);
    for (const g of ghosts) if (![...this.members.values()].some((m) => m.personId === g)) this.departed.delete(g);
  }

  /** end_family. Só sem outra pessoa ativa (familia_com_membros). Repetir a chave devolve o resultado mesmo depois de encerrar. */
  end(actor: string, key: string, contextId: string, ownPersonal: string | null): void {
    const hash = JSON.stringify(['encerrar_familia', contextId]);
    if (this.replay(actor, key, 'encerrar_familia', hash)) return;
    const family = this.requireOwner(actor, contextId, ownPersonal);
    const others = [...this.members.values()].some((m) => m.contextId === contextId && m.leftAt === null && m.personId !== actor);
    if (others) throw new RepoError('familia_com_membros');
    const now = this.nowIso();
    for (const m of this.members.values()) if (m.contextId === contextId && m.leftAt === null) m.leftAt = now;
    for (const i of this.invites.values()) if (i.contextId === contextId && i.usedAt === null && i.cancelledAt === null) i.cancelledAt = now;
    family.endedAt = now;
    this.save(actor, key, 'encerrar_familia', hash, contextId, contextId);
  }
}
