import type {
  Benefit,
  BenefitContract,
  BenefitPlan,
  BenefitPreview,
  CompanyAction,
  CompanyOverview,
  CompanyUsage,
  InviteOutcome,
  License,
  LicenseInviteResult,
  LicenseInviteWrite,
  LicenseRenewWrite,
  LicenseStatus,
  Organization,
} from './company';
import { BENEFIT_GRACE_DAYS, LICENSE_BATCH_MAX, contractIsOpen, isValidEmail, licenseCodeHash, normalizeEmail } from './company';
import type { IsoDate } from './dates';
import { addDays, isValidIsoDate, todayIn } from './dates';
import { RepoError } from './repository';
import { sha256Hex } from './sha256';

/**
 * Empresas na memória (demonstração e testes): as mesmas regras e os mesmos códigos de erro das funções da migração 0014, para
 * várias pessoas ao mesmo tempo. Cada MemoryRepository registra a pessoa aqui; repositórios que compartilham o mesmo hub
 * compartilham organizações, contratos, licenças e direitos ao plano. Nada aqui sabe de finanças nem de acesso ao app: só licenças.
 *
 * As funções da equipe Clarevo (`staff*`), que no banco só o SQL Editor executa, existem aqui só para montar cenários de teste e da
 * demonstração: nenhum repositório as expõe à pessoa. Tudo é síncrono e atômico: valida tudo antes da primeira mudança.
 */

/** Erro das funções da equipe (que no banco só o SQL Editor executa): o código e uma dica do que fazer. */
export class CompanyStaffError extends Error {
  constructor(
    readonly code: string,
    readonly hint?: string,
  ) {
    super(code);
    this.name = 'CompanyStaffError';
  }
}

export interface MemoryCompanyHubOptions {
  /** Relógio em milissegundos desde 1970. Padrão: Date.now. */
  now?: () => number;
  /** Dia atual da empresa (vigência do contrato). Padrão: o dia de `now` em São Paulo. */
  today?: () => IsoDate;
  /** Sorteio em [0, 1) do código do convite. Padrão: Math.random. */
  random?: () => number;
}

interface StoredPerson {
  id: string;
  email: string;
  displayName: string;
  timeZone: string;
}

interface StoredLicense {
  id: string;
  contractId: string;
  email: string;
  status: LicenseStatus;
  invitedAt: string;
  createdAt: string;
  activatedAt: string | null;
  endedAt: string | null;
  cancelledAt: string | null;
  personId: string | null;
  codeHash: string | null;
}

interface StoredOp {
  action: CompanyAction;
  hash: string;
  targetId: string;
  /** convidar_licencas: a licença e o resultado de cada e-mail, na ordem da lista. */
  results: { licenseId: string; outcome: InviteOutcome }[] | null;
}

const SP = 'America/Sao_Paulo';

/** Até quando vale o acesso pleno quando o contrato termina em `endsOn`: 30 dias depois, no fim do dia em São Paulo (UTC-3). */
export function contractAccessUntil(endsOn: IsoDate | null): string | null {
  return endsOn === null ? null : new Date(`${addDays(endsOn, BENEFIT_GRACE_DAYS)}T23:59:59-03:00`).toISOString();
}

/** O instante em que o contrato termina em `endsOn`: o último segundo do dia, em São Paulo (clarevo_contract_ended_at). */
export function contractEndedAt(endsOn: IsoDate | null): string | null {
  return endsOn === null ? null : new Date(`${endsOn}T23:59:59-03:00`).toISOString();
}

export class MemoryCompanyHub {
  private people = new Map<string, StoredPerson>();
  private orgs = new Map<string, Organization & { demo: boolean }>();
  private admins = new Set<string>();
  private contracts = new Map<string, BenefitContract>();
  private licenses = new Map<string, StoredLicense>();
  private entitlements = new Map<string, { licenseId: string; plan: BenefitPlan; validUntil: string | null }>();
  private ops = new Map<string, StoredOp>();
  private seq = 0;

  constructor(private readonly opts: MemoryCompanyHubOptions = {}) {}

  private nowMs(): number {
    return (this.opts.now ?? Date.now)();
  }

  private nowIso(): string {
    return new Date(this.nowMs()).toISOString();
  }

  private today(): IsoDate {
    return this.opts.today ? this.opts.today() : todayIn(SP, new Date(this.nowMs()));
  }

  private id(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq.toString(36).padStart(4, '0')}`;
  }

  private newCode(): string {
    const random = this.opts.random ?? Math.random;
    let code = '';
    for (let i = 0; i < 32; i += 1) code += Math.floor(random() * 16).toString(16);
    return code;
  }

  /** A pessoa existe (tem espaço pessoal): é o que `persons` representa no banco. O e-mail é o da conta. */
  register(personId: string, email: string, displayName: string, timeZone: string = SP): void {
    this.people.set(personId, { id: personId, email: normalizeEmail(email), displayName, timeZone });
  }

  // -------------------------------------------------------------------------
  // Equipe Clarevo (o SQL Editor, no banco)
  // -------------------------------------------------------------------------

  private findAdmin(email: string): StoredPerson {
    const e = normalizeEmail(email);
    if (!isValidEmail(e)) throw new CompanyStaffError('email_invalido', 'Confira o e-mail da pessoa administradora.');
    const p = [...this.people.values()].find((x) => x.email === e);
    if (!p) {
      throw new CompanyStaffError(
        'administrador_sem_conta',
        'A pessoa administradora precisa criar a conta no app com este e-mail antes, confirmar o e-mail e criar a primeira conta.',
      );
    }
    return p;
  }

  /** clarevo_staff_create_organization. Cria a organização, o contrato e a primeira pessoa administradora (que já tem conta). */
  staffCreateOrganization(input: {
    name: string;
    seats: number;
    plan: BenefitPlan;
    startsOn: IsoDate;
    endsOn: IsoDate | null;
    adminEmail: string;
  }): { organizationId: string; contractId: string; adminPersonId: string } {
    const name = input.name.trim();
    if (name.length < 1 || name.length > 120) throw new CompanyStaffError('nome_da_organizacao_invalido', 'Use de 1 a 120 caracteres.');
    if (!Number.isInteger(input.seats) || input.seats < 1 || input.seats > 1_000_000) throw new CompanyStaffError('vagas_invalidas');
    if (input.plan !== 'individual' && input.plan !== 'familiar') throw new CompanyStaffError('plano_invalido');
    if (!isValidIsoDate(input.startsOn) || (input.endsOn !== null && (!isValidIsoDate(input.endsOn) || input.endsOn < input.startsOn))) {
      throw new CompanyStaffError('datas_invalidas');
    }
    if ([...this.orgs.values()].some((o) => o.name.toLowerCase() === name.toLowerCase())) throw new CompanyStaffError('organizacao_ja_existe');
    const admin = this.findAdmin(input.adminEmail);
    const organizationId = this.id('empresa');
    const contractId = this.id('contrato');
    this.orgs.set(organizationId, { id: organizationId, name, demo: false });
    this.contracts.set(contractId, { id: contractId, organizationId, seats: input.seats, plan: input.plan, startsOn: input.startsOn, endsOn: input.endsOn });
    this.admins.add(`${organizationId}|${admin.id}`);
    return { organizationId, contractId, adminPersonId: admin.id };
  }

  /** clarevo_staff_add_org_admin. Repetir não duplica. */
  staffAddOrgAdmin(organizationId: string, adminEmail: string): { organizationId: string; adminPersonId: string; alreadyAdmin: boolean } {
    if (!this.orgs.has(organizationId)) throw new CompanyStaffError('organizacao_nao_encontrada');
    const admin = this.findAdmin(adminEmail);
    const key = `${organizationId}|${admin.id}`;
    const already = this.admins.has(key);
    this.admins.add(key);
    return { organizationId, adminPersonId: admin.id, alreadyAdmin: already };
  }

  private seatsInUse(contractId: string): number {
    return [...this.licenses.values()].filter((l) => l.contractId === contractId && (l.status === 'convidada' || l.status === 'ativa')).length;
  }

  /** clarevo_staff_update_contract. As vagas nunca ficam abaixo das licenças convidada + ativa; mudar o fim move o acesso pleno das ativas. */
  staffUpdateContract(contractId: string, seats: number, endsOn: IsoDate | null): { contractId: string; seats: number; endsOn: IsoDate | null; inUse: number } {
    const c = this.contracts.get(contractId);
    if (!c) throw new CompanyStaffError('contrato_nao_encontrado');
    if (!Number.isInteger(seats) || seats < 1 || seats > 1_000_000) throw new CompanyStaffError('vagas_invalidas');
    if (endsOn !== null && (!isValidIsoDate(endsOn) || endsOn < c.startsOn)) throw new CompanyStaffError('datas_invalidas');
    if (seats < this.seatsInUse(contractId)) throw new CompanyStaffError('vagas_em_uso');
    c.seats = seats;
    c.endsOn = endsOn;
    for (const l of this.licenses.values()) {
      if (l.contractId === contractId && l.status === 'ativa') {
        const e = this.entitlements.get(l.id);
        if (e) e.validUntil = contractAccessUntil(endsOn);
      }
    }
    return { contractId, seats, endsOn, inUse: this.seatsInUse(contractId) };
  }

  // -------------------------------------------------------------------------
  // Leitura
  // -------------------------------------------------------------------------

  private isAdminOf(personId: string, organizationId: string): boolean {
    return this.admins.has(`${organizationId}|${personId}`);
  }

  private contractAdmin(personId: string, contractId: string | undefined): BenefitContract {
    const c = contractId ? this.contracts.get(contractId) : undefined;
    if (!c || !this.isAdminOf(personId, c.organizationId)) throw new RepoError('nao_encontrado');
    return c;
  }

  private licenseAdmin(personId: string, licenseId: string): { license: StoredLicense; contract: BenefitContract } {
    const license = this.licenses.get(licenseId);
    const contract = this.contractAdmin(personId, license?.contractId);
    return { license: license!, contract };
  }

  private view(l: StoredLicense): License {
    return {
      id: l.id,
      contractId: l.contractId,
      email: l.email,
      status: l.status,
      invitedAt: l.invitedAt,
      createdAt: l.createdAt,
      activatedAt: l.activatedAt,
      endedAt: l.endedAt,
      cancelledAt: l.cancelledAt,
    };
  }

  /** As organizações que a pessoa administra, com os contratos e as licenças deles (o que a RLS deixa o RH ler). */
  listAdministered(personId: string): CompanyOverview[] {
    return [...this.orgs.values()]
      .filter((o) => this.isAdminOf(personId, o.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((o) => {
        const contracts = [...this.contracts.values()].filter((c) => c.organizationId === o.id).map((c) => ({ ...c }));
        const ids = new Set(contracts.map((c) => c.id));
        const licenses = [...this.licenses.values()]
          .filter((l) => ids.has(l.contractId))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
          .map((l) => this.view(l));
        return { organization: { id: o.id, name: o.name }, contracts, licenses, demo: o.demo };
      });
  }

  /**
   * organization_usage. Só quem administra; só contagens de licenças (o indicador de entradas no mês saiu depois da revisão de
   * segurança de 16/10/2026: com o e-mail de cada licença à vista, identificaria quem entrou).
   */
  usage(personId: string, organizationId: string): CompanyUsage {
    if (!this.orgs.has(organizationId) || !this.isAdminOf(personId, organizationId)) throw new RepoError('nao_encontrado');
    const today = this.today();
    const contracts = [...this.contracts.values()].filter((c) => c.organizationId === organizationId);
    const ids = new Set(contracts.map((c) => c.id));
    const licenses = [...this.licenses.values()].filter((l) => ids.has(l.contractId));
    return {
      organizationId,
      seats: contracts.filter((c) => contractIsOpen(c, today)).reduce((sum, c) => sum + c.seats, 0),
      invited: licenses.filter((l) => l.status === 'convidada').length,
      active: licenses.filter((l) => l.status === 'ativa').length,
      ended: licenses.filter((l) => l.status === 'encerrada' && l.cancelledAt === null).length,
    };
  }

  /** A licença ainda ativa, mas de um contrato que já terminou (ends_on antes de hoje): quem a recebe a lê como encerrada (E7). */
  private contractEnded(l: StoredLicense): boolean {
    const c = this.contracts.get(l.contractId);
    return l.status === 'ativa' && c !== undefined && c.endsOn !== null && c.endsOn < this.today();
  }

  private benefitOf(l: StoredLicense): Benefit {
    const c = this.contracts.get(l.contractId)!;
    const o = this.orgs.get(c.organizationId)!;
    const expired = this.contractEnded(l);
    return {
      licenseId: l.id,
      organizationName: o.name,
      plan: c.plan,
      status: l.status === 'ativa' && !expired ? 'ativa' : 'encerrada',
      activatedAt: l.activatedAt!,
      endedAt: expired ? contractEndedAt(c.endsOn) : l.endedAt,
      accessUntil: this.entitlements.get(l.id)?.validUntil ?? null,
      contractEndsOn: c.endsOn,
    };
  }

  /** my_benefit: o benefício da própria pessoa. A licença ativa (de contrato em vigor) vale; sem ela, a encerrada mais recente. */
  myBenefit(personId: string): Benefit | null {
    const own = [...this.licenses.values()].filter((l) => l.personId === personId && l.activatedAt !== null);
    const active = own.find((l) => l.status === 'ativa' && !this.contractEnded(l));
    if (active) return this.benefitOf(active);
    const last = own.sort((a, b) => (b.activatedAt ?? '').localeCompare(a.activatedAt ?? ''))[0];
    return last ? this.benefitOf(last) : null;
  }

  // -------------------------------------------------------------------------
  // Chave de idempotência (por pessoa)
  // -------------------------------------------------------------------------

  private replay(actor: string, key: string, action: CompanyAction, hash: string): StoredOp | null {
    const op = this.ops.get(`${actor}|${key}`);
    if (!op) return null;
    if (op.action !== action || op.hash !== hash) throw new RepoError('chave_reutilizada');
    return op;
  }

  private save(actor: string, key: string, action: CompanyAction, hash: string, targetId: string, results: StoredOp['results'] = null): void {
    this.ops.set(`${actor}|${key}`, { action, hash, targetId, results });
  }

  /** A pessoa já usou esta chave em alguma ação da empresa? Para o MemoryRepository conferir o espaço de chaves comum. */
  hasOperation(actor: string, key: string): boolean {
    return this.ops.has(`${actor}|${key}`);
  }

  /** Reconciliação: a ação com esta chave já foi concluída? targetId é o contrato ou a licença, como em record_operations.target_id. */
  findOperation(actor: string, key: string): { action: CompanyAction; targetId: string } | null {
    const op = this.ops.get(`${actor}|${key}`);
    return op ? { action: op.action, targetId: op.targetId } : null;
  }

  // -------------------------------------------------------------------------
  // Escritas (invite_licenses ... accept_license)
  // -------------------------------------------------------------------------

  private open(contractId: string): boolean {
    const c = this.contracts.get(contractId);
    return Boolean(c && contractIsOpen(c, this.today()));
  }

  /**
   * invite_licenses. Ordem: repetição; contrato lido por quem administra (nao_encontrado); itens_invalidos (de 1 a 500); email_invalido
   * (detalhe item=N); contrato_nao_vigente; vagas_insuficientes (detalhe disponiveis=N). Tudo ou nada.
   */
  invite(actor: string, key: string, contractId: string, rawEmails: readonly string[] | null): LicenseInviteWrite {
    const list: string[] = [];
    for (const raw of rawEmails ?? []) {
      const e = normalizeEmail(raw);
      if (!list.includes(e)) list.push(e);
    }
    const hash = JSON.stringify(['convidar_licencas', contractId, list]);
    const prev = this.replay(actor, key, 'convidar_licencas', hash);
    if (prev) {
      const c = this.contractAdmin(actor, prev.targetId);
      const results: LicenseInviteResult[] = (prev.results ?? []).map((r) => {
        const l = this.licenses.get(r.licenseId)!;
        return { email: l.email, outcome: r.outcome, code: null, license: this.view(l) };
      });
      return { contractId, results, seats: c.seats, inUse: this.seatsInUse(contractId) };
    }
    const contract = this.contractAdmin(actor, contractId);
    if (list.length < 1 || list.length > LICENSE_BATCH_MAX) throw new RepoError('itens_invalidos');
    const bad = list.findIndex((e) => !isValidEmail(e));
    if (bad >= 0) throw new RepoError('email_invalido', undefined, `item=${bad + 1}`);
    if (!this.open(contractId)) throw new RepoError('contrato_nao_vigente');
    const openByEmail = new Map<string, StoredLicense>();
    for (const l of this.licenses.values()) if (l.contractId === contractId && l.status !== 'encerrada') openByEmail.set(l.email, l);
    const fresh = list.filter((e) => !openByEmail.has(e)).length;
    const used = this.seatsInUse(contractId);
    if (used + fresh > contract.seats) throw new RepoError('vagas_insuficientes', undefined, `disponiveis=${Math.max(contract.seats - used, 0)}`);

    const now = this.nowIso();
    const results: LicenseInviteResult[] = [];
    const stored: NonNullable<StoredOp['results']> = [];
    for (const email of list) {
      const existing = openByEmail.get(email);
      if (existing) {
        results.push({ email, outcome: 'ja_convidado', code: null, license: this.view(existing) });
        stored.push({ licenseId: existing.id, outcome: 'ja_convidado' });
        continue;
      }
      const code = this.newCode();
      const l: StoredLicense = {
        id: this.id('licenca'),
        contractId,
        email,
        status: 'convidada',
        invitedAt: now,
        createdAt: now,
        activatedAt: null,
        endedAt: null,
        cancelledAt: null,
        personId: null,
        codeHash: sha256Hex(code),
      };
      this.licenses.set(l.id, l);
      results.push({ email, outcome: 'convidada', code, license: this.view(l) });
      stored.push({ licenseId: l.id, outcome: 'convidada' });
    }
    this.save(actor, key, 'convidar_licencas', hash, contractId, stored);
    return { contractId, results, seats: contract.seats, inUse: this.seatsInUse(contractId) };
  }

  /** renew_license_invite. Só licença convidada (licenca_nao_convidada), contrato em vigor (contrato_nao_vigente). O link anterior deixa de valer. */
  renew(actor: string, key: string, licenseId: string): LicenseRenewWrite {
    const hash = JSON.stringify(['renovar_convite_licenca', licenseId]);
    const prev = this.replay(actor, key, 'renovar_convite_licenca', hash);
    if (prev) {
      const { license } = this.licenseAdmin(actor, prev.targetId);
      return { license: this.view(license), code: null };
    }
    const { license } = this.licenseAdmin(actor, licenseId);
    if (license.status !== 'convidada') throw new RepoError('licenca_nao_convidada');
    if (!this.open(license.contractId)) throw new RepoError('contrato_nao_vigente');
    const code = this.newCode();
    license.codeHash = sha256Hex(code);
    license.invitedAt = this.nowIso();
    this.save(actor, key, 'renovar_convite_licenca', hash, licenseId);
    return { license: this.view(license), code };
  }

  /** cancel_license_invite. A linha fica encerrada com cancelledAt; já cancelado segue cancelado, sem erro. */
  cancel(actor: string, key: string, licenseId: string): License {
    const hash = JSON.stringify(['cancelar_convite_licenca', licenseId]);
    const prev = this.replay(actor, key, 'cancelar_convite_licenca', hash);
    if (prev) return this.view(this.licenseAdmin(actor, prev.targetId).license);
    const { license } = this.licenseAdmin(actor, licenseId);
    if (license.status === 'convidada') {
      license.status = 'encerrada';
      license.cancelledAt = this.nowIso();
      license.codeHash = null;
    } else if (!(license.status === 'encerrada' && license.cancelledAt !== null)) {
      throw new RepoError('licenca_nao_convidada');
    }
    this.save(actor, key, 'cancelar_convite_licenca', hash, licenseId);
    return this.view(license);
  }

  /** end_license. Só licença ativa (licenca_nao_ativa). O acesso pleno vale mais 30 dias; nada é apagado. */
  end(actor: string, key: string, licenseId: string): License {
    const hash = JSON.stringify(['encerrar_licenca', licenseId]);
    const prev = this.replay(actor, key, 'encerrar_licenca', hash);
    if (prev) return this.view(this.licenseAdmin(actor, prev.targetId).license);
    const { license } = this.licenseAdmin(actor, licenseId);
    if (license.status !== 'ativa') throw new RepoError('licenca_nao_ativa');
    const now = this.nowIso();
    license.status = 'encerrada';
    license.endedAt = now;
    const e = this.entitlements.get(licenseId);
    if (e) {
      const limit = new Date(this.nowMs() + BENEFIT_GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();
      e.validUntil = e.validUntil === null || e.validUntil > limit ? limit : e.validUntil;
    }
    this.save(actor, key, 'encerrar_licenca', hash, licenseId);
    return this.view(license);
  }

  private byCode(code: unknown): StoredLicense | null {
    const h = licenseCodeHash(code);
    if (h === null) return null;
    for (const l of this.licenses.values()) if (l.codeHash === h) return l;
    return null;
  }

  /** O convite vale para esta pessoa: convidada, contrato em vigor e o e-mail da conta é o do convite. */
  private inviteFor(actor: string, code: unknown): StoredLicense | null {
    const l = this.byCode(code);
    const me = this.people.get(actor);
    if (!l || !me || l.status !== 'convidada' || l.email !== me.email || !this.open(l.contractId)) return null;
    return l;
  }

  /** preview_license_invite. Qualquer convite que não vale (inclusive o de outro e-mail) responde convite_invalido. */
  preview(actor: string, code: string): BenefitPreview {
    const l = this.inviteFor(actor, code);
    if (!l) throw new RepoError('convite_invalido');
    const c = this.contracts.get(l.contractId)!;
    return { organizationName: this.orgs.get(c.organizationId)!.name, plan: c.plan };
  }

  /**
   * accept_license. Ordem: repetição; sem_permissao (sem espaço pessoal); convite_invalido; encerra as licenças ativas da pessoa
   * cujo contrato já terminou (E7); ja_tem_licenca.
   */
  accept(actor: string, key: string, code: string): Benefit {
    const hash = JSON.stringify(['aceitar_licenca', licenseCodeHash(code)]);
    const prev = this.replay(actor, key, 'aceitar_licenca', hash);
    if (prev) {
      const l = this.licenses.get(prev.targetId);
      if (!l || l.personId !== actor) throw new RepoError('nao_encontrado');
      return this.benefitOf(l);
    }
    if (!this.people.has(actor)) throw new RepoError('sem_permissao');
    const l = this.inviteFor(actor, code);
    if (!l) throw new RepoError('convite_invalido');
    // E7: a licença ativa de um contrato que já terminou não prende a pessoa. Encerra no fim do contrato; o direito ao plano dela
    // segue a regra dos 30 dias, contados a partir do fim do contrato (nunca depois do que já valia).
    for (const x of this.licenses.values()) {
      if (x.personId !== actor || !this.contractEnded(x)) continue;
      const ended = this.contracts.get(x.contractId)!;
      x.status = 'encerrada';
      x.endedAt = contractEndedAt(ended.endsOn);
      const e = this.entitlements.get(x.id);
      const limit = contractAccessUntil(ended.endsOn)!;
      if (e) e.validUntil = e.validUntil === null || e.validUntil > limit ? limit : e.validUntil;
    }
    if ([...this.licenses.values()].some((x) => x.personId === actor && x.status === 'ativa')) throw new RepoError('ja_tem_licenca');
    const c = this.contracts.get(l.contractId)!;
    l.status = 'ativa';
    l.personId = actor;
    l.activatedAt = this.nowIso();
    l.codeHash = null;
    this.entitlements.set(l.id, { licenseId: l.id, plan: c.plan, validUntil: contractAccessUntil(c.endsOn) });
    this.save(actor, key, 'aceitar_licenca', hash, l.id);
    return this.benefitOf(l);
  }

  // -------------------------------------------------------------------------
  // Demonstração (investidor): empresa fictícia, identificada, só na memória
  // -------------------------------------------------------------------------

  /**
   * A "Empresa Exemplo (demonstração)": 40 vagas, plano individual, 12 licenças ativas, 6 convites
   * pendentes, 3 licenças encerradas e 1 convite cancelado, todas de pessoas FICTÍCIAS (e-mails do domínio reservado .example).
   * Nenhuma delas é registrada como pessoa de verdade, e nada aqui chega a um servidor.
   */
  seedDemo(adminPersonId: string): { organizationId: string; contractId: string } {
    const organizationId = this.id('empresa');
    const contractId = this.id('contrato');
    this.orgs.set(organizationId, { id: organizationId, name: 'Empresa Exemplo (demonstração)', demo: true });
    this.contracts.set(contractId, { id: contractId, organizationId, seats: 40, plan: 'individual', startsOn: '2026-03-01', endsOn: null });
    this.admins.add(`${organizationId}|${adminPersonId}`);
    const email = (prefix: string, n: number) => `${prefix}.${String(n).padStart(2, '0')}@empresa-exemplo.example`;
    const add = (l: Partial<StoredLicense> & Pick<StoredLicense, 'email' | 'status'>) => {
      const id = this.id('licenca');
      const person = l.status === 'ativa' || l.endedAt ? this.id('pessoa-ficticia') : null;
      if (person) this.people.set(person, { id: person, email: l.email, displayName: 'Pessoa fictícia', timeZone: SP });
      this.licenses.set(id, {
        id,
        contractId,
        invitedAt: l.invitedAt ?? '2026-04-10T12:00:00.000Z',
        createdAt: l.createdAt ?? l.invitedAt ?? '2026-04-10T12:00:00.000Z',
        activatedAt: l.activatedAt ?? null,
        endedAt: l.endedAt ?? null,
        cancelledAt: l.cancelledAt ?? null,
        personId: person,
        codeHash: l.status === 'convidada' ? sha256Hex(this.newCode()) : null,
        ...l,
      });
      if (l.activatedAt) this.entitlements.set(id, { licenseId: id, plan: 'individual', validUntil: l.endedAt ? new Date(Date.parse(l.endedAt) + BENEFIT_GRACE_DAYS * 86_400_000).toISOString() : null });
    };
    for (let n = 1; n <= 12; n += 1) {
      add({ email: email('pessoa', n), status: 'ativa', invitedAt: '2026-04-10T12:00:00.000Z', activatedAt: `2026-04-${String(10 + n).padStart(2, '0')}T12:00:00.000Z` });
    }
    for (let n = 1; n <= 6; n += 1) add({ email: email('convite', n), status: 'convidada', invitedAt: `2026-10-0${n}T12:00:00.000Z` });
    for (let n = 1; n <= 3; n += 1) {
      add({ email: email('antiga', n), status: 'encerrada', invitedAt: '2026-03-05T12:00:00.000Z', activatedAt: '2026-03-08T12:00:00.000Z', endedAt: `2026-09-0${n}T12:00:00.000Z` });
    }
    add({ email: email('cancelado', 1), status: 'encerrada', invitedAt: '2026-09-20T12:00:00.000Z', cancelledAt: '2026-09-25T12:00:00.000Z' });
    return { organizationId, contractId };
  }
}
