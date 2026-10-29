import type { IsoDate } from './dates';
import { formatDateBR, todayIn } from './dates';
import { CSV_BOM, CSV_EOL, csvCell, csvText } from './export';
import { INVITE_BASE_URL, INVITE_CODE_PATTERN, normalizeInviteCode } from './family';
import { CONTACT_EMAIL, SUPPORT_EMAIL } from './legal';
import { seasonalCard } from './learn/epoca';
import type { RepoErrorCode } from './repository';
import { sha256Hex } from './sha256';
import { ERROR_TEXT } from './validation';

/**
 * Painel de empresas (D-056, Ciclo M; docs/13). Regras puras, repetidas no banco pelas funções invite_licenses,
 * renew_license_invite, cancel_license_invite, end_license, preview_license_invite, accept_license e organization_usage
 * (migração 0014), pelas recomendações M-1 a M-6:
 *
 * - M-1: a empresa vê vagas, convites e licenças (e só as contagens delas), nunca finanças, nem somadas, nem o uso do app. O
 *   indicador "pessoas que entraram no mês" saiu depois da revisão de segurança de 16/10/2026: o RH vê o e-mail de cada licença e
 *   pode controlar contas próprias, então um número de acessos permitiria identificar quem entrou.
 * - M-2: o convite é um link da empresa, enviado pelo canal interno do RH (sem custo de envio pelo Clarevo).
 * - M-3: a equipe Clarevo cadastra a empresa, o contrato e a primeira pessoa administradora, pelo SQL Editor do Supabase.
 * - M-4: ao encerrar a licença, 30 dias de acesso pleno e depois o plano gratuito, com leitura do histórico. Nada é apagado.
 * - M-6: uma vaga por pessoa que recebe o benefício.
 *
 * O painel só existe na web. A pessoa que recebe o convite abre o link no navegador ou no app.
 */

/** Situação de uma licença: convidada, ativa ou encerrada. Um convite cancelado fica encerrado, com `cancelledAt`. */
export type LicenseStatus = 'convidada' | 'ativa' | 'encerrada';
/** O que a licença mostra na tela: a situação, com o convite cancelado à parte. */
export type LicenseKind = 'convidada' | 'ativa' | 'encerrada' | 'cancelada';
export type BenefitPlan = 'individual' | 'familiar';

export const LICENSE_STATUSES: readonly LicenseStatus[] = ['convidada', 'ativa', 'encerrada'];
export const BENEFIT_PLANS: readonly BenefitPlan[] = ['individual', 'familiar'];

/** Filtro da lista de licenças. */
export type LicenseFilter = 'todas' | LicenseStatus;
export const LICENSE_FILTERS: readonly LicenseFilter[] = ['todas', 'convidada', 'ativa', 'encerrada'];

/** Até quantas pessoas se convida por vez (a mesma conta do banco). */
export const LICENSE_BATCH_MAX = 500;
/** Dias de acesso pleno depois do fim do benefício (M-4). */
export const BENEFIT_GRACE_DAYS = 30;
/** Tamanho máximo do e-mail e das partes dele. */
export const EMAIL_MAX = 254;
export const EMAIL_LOCAL_MAX = 64;

/** A organização que quem administra enxerga. */
export interface Organization {
  id: string;
  name: string;
}

/** O contrato de benefício: vagas, plano e vigência. */
export interface BenefitContract {
  id: string;
  organizationId: string;
  seats: number;
  plan: BenefitPlan;
  startsOn: IsoDate;
  endsOn: IsoDate | null;
}

/** Uma licença como a empresa a lê: o e-mail convidado, a situação e as datas. Nunca a pessoa, nem o resumo do código. */
export interface License {
  id: string;
  contractId: string;
  email: string;
  status: LicenseStatus;
  invitedAt: string;
  createdAt: string;
  activatedAt: string | null;
  endedAt: string | null;
  cancelledAt: string | null;
}

/** O que o painel lê: a organização, os contratos dela e as licenças desses contratos. */
export interface CompanyOverview {
  organization: Organization;
  contracts: BenefitContract[];
  licenses: License[];
  /** Organização de demonstração: fictícia, identificada, sem gravar nada fora do aparelho. */
  demo: boolean;
}

/**
 * Contagens de licenças (organization_usage): vagas dos contratos em vigor, convidadas, ativas e encerradas (convite cancelado não
 * conta). As mesmas contagens que o RH já vê na lista de licenças; nada de acesso ao app nem de pessoas.
 */
export interface CompanyUsage {
  organizationId: string;
  seats: number;
  invited: number;
  active: number;
  ended: number;
}

export type InviteOutcome = 'convidada' | 'ja_convidado';

/** Resultado de convidar um e-mail: a licença e, só se ela é nova, o código (uma única vez). */
export interface LicenseInviteResult {
  email: string;
  outcome: InviteOutcome;
  code: string | null;
  license: License;
}

/** Resultado de invite_licenses. Repetir a mesma chave devolve os mesmos resultados, sem os códigos. */
export interface LicenseInviteWrite {
  contractId: string;
  results: LicenseInviteResult[];
  seats: number;
  inUse: number;
}

/** Resultado de renew_license_invite: o código novo aparece uma única vez; ao repetir a chave, vem null. */
export interface LicenseRenewWrite {
  license: License;
  code: string | null;
}

/** A prévia do convite da empresa: só o nome da organização e o plano. */
export interface BenefitPreview {
  organizationName: string;
  plan: BenefitPlan;
}

/** O benefício de quem o recebe (visão my_benefit). accessUntil: até quando vale o acesso pleno, quando há fim. */
export interface Benefit {
  licenseId: string;
  organizationName: string;
  plan: BenefitPlan;
  status: 'ativa' | 'encerrada';
  activatedAt: string;
  endedAt: string | null;
  accessUntil: string | null;
  contractEndsOn: IsoDate | null;
}

/** Ações gravadas em record_operations (alvo em target_id: o contrato ou a licença); nenhuma conta como anotação (D-030). */
export type CompanyAction = 'convidar_licencas' | 'renovar_convite_licenca' | 'cancelar_convite_licenca' | 'encerrar_licenca' | 'aceitar_licenca';

export const COMPANY_ACTIONS: readonly CompanyAction[] = [
  'convidar_licencas',
  'renovar_convite_licenca',
  'cancelar_convite_licenca',
  'encerrar_licenca',
  'aceitar_licenca',
];

export function isCompanyAction(action: string): action is CompanyAction {
  return (COMPANY_ACTIONS as readonly string[]).includes(action);
}

// ---------------------------------------------------------------------------
// E-mail (a mesma regra do banco: clarevo_normalize_email e clarevo_email_valid)
// ---------------------------------------------------------------------------

/** E-mail como a empresa e a pessoa o escrevem: sem os espaços das pontas e em minúsculas. */
export function normalizeEmail(input: unknown): string {
  return typeof input === 'string' ? input.trim().toLowerCase() : '';
}

/**
 * E-mail comum, já normalizado: até 254 caracteres, parte local de 1 a 64 (letras, números e . _ % + -, sem ponto no início, no
 * fim nem repetido), domínio com pelo menos um ponto e último trecho de 2 a 63 caracteres. Sem acentos.
 */
const EMAIL_PATTERN = /^[a-z0-9._%+-]{1,64}@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

export function isValidEmail(normalized: string): boolean {
  if (typeof normalized !== 'string' || normalized.length > EMAIL_MAX) return false;
  if (!EMAIL_PATTERN.test(normalized)) return false;
  if (/^\.|\.\.|\.@/.test(normalized)) return false;
  return /\.[a-z0-9-]{2,63}$/.test(normalized);
}

/** O e-mail da conta é o do convite? Sem diferenciar maiúsculas nem os espaços das pontas. */
export function sameEmail(a: unknown, b: unknown): boolean {
  const x = normalizeEmail(a);
  return x !== '' && x === normalizeEmail(b);
}

/**
 * Divide o texto colado em itens: um por linha, ou separados por vírgula ou ponto e vírgula. "Nome <email>" vale como o e-mail
 * dentro dos sinais, também no formato do Outlook, em que o nome tem vírgula ("Silva, Ana <ana@x.com>; Souza, Bia <bia@x.com>"):
 * o nome vai do último ponto e vírgula ou quebra de linha até o sinal, e dele só fica o que tiver arroba. Itens vazios saem; o
 * resto fica como a pessoa digitou, sem os espaços das pontas.
 */
export function splitEmailList(text: unknown): string[] {
  if (typeof text !== 'string') return [];
  const items: string[] = [];
  const plain = (chunk: string) => {
    for (const raw of chunk.split(/[\r\n,;]+/)) if (raw.trim() !== '') items.push(raw.trim());
  };
  const angle = /<([^<>]*)>/g;
  let last = 0;
  for (let m = angle.exec(text); m !== null; m = angle.exec(text)) {
    const before = text.slice(last, m.index);
    const cut = Math.max(before.lastIndexOf(';'), before.lastIndexOf('\n'), before.lastIndexOf('\r'));
    plain(before.slice(0, cut + 1));
    for (const raw of before.slice(cut + 1).split(',')) if (raw.includes('@') && raw.trim() !== '') items.push(raw.trim());
    if (m[1]!.trim() !== '') items.push(m[1]!.trim());
    last = m.index + m[0].length;
  }
  plain(text.slice(last));
  return items;
}

/** O que a pessoa colou: válidos (únicos), repetidos na lista e inválidos. */
export interface EmailListPreview {
  /** E-mails válidos, normalizados, sem repetição, na ordem em que aparecem. */
  valid: string[];
  /** E-mails válidos que aparecem mais de uma vez na lista (cada um uma vez, normalizado). */
  repeated: string[];
  /** Itens que não são e-mail válido, como digitados (sem os espaços das pontas), cada um uma vez. */
  invalid: string[];
  /** Quantos itens foram lidos (sem os vazios). */
  total: number;
}

export function parseEmailList(text: unknown): EmailListPreview {
  const items = splitEmailList(text);
  const seen = new Set<string>();
  const repeatedSet = new Set<string>();
  const valid: string[] = [];
  const repeated: string[] = [];
  const invalid: string[] = [];
  const invalidSeen = new Set<string>();
  for (const item of items) {
    const email = normalizeEmail(item);
    if (isValidEmail(email)) {
      if (seen.has(email)) {
        if (!repeatedSet.has(email)) {
          repeatedSet.add(email);
          repeated.push(email);
        }
      } else {
        seen.add(email);
        valid.push(email);
      }
    } else if (!invalidSeen.has(item)) {
      invalidSeen.add(item);
      invalid.push(item);
    }
  }
  return { valid, repeated, invalid, total: items.length };
}

// ---------------------------------------------------------------------------
// Contrato, vagas e licenças
// ---------------------------------------------------------------------------

/** O contrato está em vigor no dia: começou e ainda não terminou. */
export function contractIsOpen(contract: Pick<BenefitContract, 'startsOn' | 'endsOn'>, day: IsoDate): boolean {
  return contract.startsOn <= day && (contract.endsOn === null || contract.endsOn >= day);
}

/** Estado do contrato para a tela. */
export function contractState(contract: Pick<BenefitContract, 'startsOn' | 'endsOn'>, day: IsoDate): 'vigente' | 'futuro' | 'encerrado' {
  if (contract.startsOn > day) return 'futuro';
  return contract.endsOn !== null && contract.endsOn < day ? 'encerrado' : 'vigente';
}

/**
 * O contrato que vale para a tela e para o relatório no dia: o vigente (se houver mais de um, o de início mais recente, que é o
 * renovado). Sem contrato vigente, o de início mais recente. Não depende da ordem da lista. Sem contrato nenhum, `null`.
 */
export function currentContract<T extends Pick<BenefitContract, 'startsOn' | 'endsOn'>>(contracts: readonly T[], day: IsoDate): T | null {
  const latest = (list: readonly T[]): T | null => list.reduce<T | null>((best, c) => (best === null || c.startsOn > best.startsOn ? c : best), null);
  return latest(contracts.filter((c) => contractIsOpen(c, day))) ?? latest(contracts);
}

/** A licença ocupa vaga: convidada ou ativa. */
export function licenseUsesSeat(license: Pick<License, 'status'>): boolean {
  return license.status === 'convidada' || license.status === 'ativa';
}

/** Vagas, vagas em uso (convidadas e ativas) e vagas livres de um contrato. */
export function seatsOf(contract: Pick<BenefitContract, 'id' | 'seats'>, licenses: readonly License[]): { seats: number; used: number; free: number } {
  const used = licenses.filter((l) => l.contractId === contract.id && licenseUsesSeat(l)).length;
  return { seats: contract.seats, used, free: Math.max(0, contract.seats - used) };
}

export function licenseKind(license: Pick<License, 'status' | 'cancelledAt'>): LicenseKind {
  return license.status === 'encerrada' && license.cancelledAt !== null ? 'cancelada' : license.status;
}

/** Contagem por situação (o convite cancelado conta em "encerradas", como no filtro). */
export function licenseCounts(licenses: readonly Pick<License, 'status'>[]): Record<LicenseFilter, number> {
  return {
    todas: licenses.length,
    convidada: licenses.filter((l) => l.status === 'convidada').length,
    ativa: licenses.filter((l) => l.status === 'ativa').length,
    encerrada: licenses.filter((l) => l.status === 'encerrada').length,
  };
}

const STATUS_RANK: Readonly<Record<LicenseStatus, number>> = { convidada: 0, ativa: 1, encerrada: 2 };

/** Lista filtrada: convidadas primeiro, depois ativas e encerradas; dentro de cada grupo, por e-mail. */
export function filterLicenses<T extends Pick<License, 'status' | 'email' | 'id'>>(licenses: readonly T[], filter: LicenseFilter): T[] {
  return licenses
    .filter((l) => filter === 'todas' || l.status === filter)
    .slice()
    .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.email.localeCompare(b.email) || a.id.localeCompare(b.id));
}

/** Dia (no fuso da pessoa) de um instante gravado. */
export function dayOf(instant: string, timeZone: string): IsoDate {
  return todayIn(timeZone, new Date(instant));
}

/** Dia em que o acesso pleno termina (data do instante gravado, no fuso dado). */
export function accessUntilDay(accessUntil: string | null, timeZone: string): IsoDate | null {
  return accessUntil === null ? null : dayOf(accessUntil, timeZone);
}

// ---------------------------------------------------------------------------
// Convidar: o plano a partir do que foi colado
// ---------------------------------------------------------------------------

export type InviteProblem = 'vazia' | 'invalidos' | 'lote_grande' | 'sem_vagas' | 'contrato_fora_da_vigencia';

/** O que vai acontecer se a pessoa confirmar. */
export interface InvitePlan {
  /** E-mails que ganham convite novo. */
  newEmails: string[];
  /** E-mails válidos que já têm licença aberta (convidada ou ativa) neste contrato: voltam como "já convidado". */
  alreadyInvited: string[];
  repeated: string[];
  invalid: string[];
  seatsFree: number;
  /** O primeiro motivo que impede de confirmar, ou null. */
  problem: InviteProblem | null;
}

/**
 * A prévia de quem colou a lista: quem é novo, quem já foi convidado, os repetidos e os inválidos, e se cabe nas vagas. Confirmar
 * só vale sem inválidos, com ao menos uma pessoa nova, até 500 por vez e dentro das vagas livres (a mesma conta do banco).
 */
export function planInvites(
  text: unknown,
  contract: Pick<BenefitContract, 'id' | 'seats' | 'startsOn' | 'endsOn'>,
  licenses: readonly License[],
  today: IsoDate,
): InvitePlan {
  const preview = parseEmailList(text);
  const open = new Set(
    licenses.filter((l) => l.contractId === contract.id && licenseUsesSeat(l)).map((l) => normalizeEmail(l.email)),
  );
  const newEmails = preview.valid.filter((e) => !open.has(e));
  const alreadyInvited = preview.valid.filter((e) => open.has(e));
  const seatsFree = seatsOf(contract, licenses).free;
  let problem: InviteProblem | null = null;
  if (preview.invalid.length > 0) problem = 'invalidos';
  else if (!contractIsOpen(contract, today)) problem = 'contrato_fora_da_vigencia';
  else if (newEmails.length === 0) problem = 'vazia';
  else if (preview.valid.length > LICENSE_BATCH_MAX) problem = 'lote_grande';
  else if (newEmails.length > seatsFree) problem = 'sem_vagas';
  return { newEmails, alreadyInvited, repeated: preview.repeated, invalid: preview.invalid, seatsFree, problem };
}

// ---------------------------------------------------------------------------
// Link do convite, lista e CSV
// ---------------------------------------------------------------------------

/** O código do convite da empresa tem 128 bits em 32 hexadecimais minúsculos, como o da Família. */
export const LICENSE_CODE_PATTERN = INVITE_CODE_PATTERN;

/** Código escrito como a pessoa o recebe (maiúsculas e espaços nas pontas valem): 32 hexadecimais minúsculos, ou null. */
export function normalizeLicenseCode(input: unknown): string | null {
  return normalizeInviteCode(input);
}

/** Resumo SHA-256 do código (o que o banco guarda); null se o código não tem o formato certo. */
export function licenseCodeHash(input: unknown): string | null {
  const code = normalizeLicenseCode(input);
  return code === null ? null : sha256Hex(code);
}

/** O link do convite da empresa: `${base}/beneficio/${código}`. */
export function licenseLink(code: string, base: string = INVITE_BASE_URL): string {
  return `${base.replace(/\/+$/, '')}/beneficio/${code}`;
}

/** O código de um texto colado: o próprio código ou um link `…/beneficio/<código>`. Nulo se não houver código válido. */
export function licenseCodeFromText(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const direct = normalizeLicenseCode(text);
  if (direct) return direct;
  const m = /\/beneficio\/([0-9a-fA-F]{32})(?![0-9a-fA-F])/.exec(text);
  return m ? normalizeLicenseCode(m[1]) : null;
}

/** Uma pessoa e o link dela. */
export interface InviteLinkRow {
  email: string;
  link: string;
}

/** As linhas de links a partir do resultado de convidar: só quem ganhou convite novo (o código existe só nesse momento). */
export function inviteLinkRows(results: readonly LicenseInviteResult[], base: string = INVITE_BASE_URL): InviteLinkRow[] {
  return results.flatMap((r) => (r.code ? [{ email: r.email, link: licenseLink(r.code, base) }] : []));
}

/** "Copiar todos": uma linha por pessoa, com o e-mail e o link, para o RH enviar pelo canal interno. */
export function buildInviteListText(rows: readonly InviteLinkRow[]): string {
  return rows.map((r) => `${r.email}: ${r.link}`).join('\n');
}

export const CSV_INVITE_HEADER: readonly string[] = ['E-mail', 'Link'];

/** "Baixar lista": CSV como o das exportações (BOM, ponto e vírgula e fim de linha do Excel), com e-mail e link. */
export function buildInviteCsv(rows: readonly InviteLinkRow[]): string {
  const line = (cells: readonly string[]) => cells.map(csvCell).join(';');
  return CSV_BOM + [line(CSV_INVITE_HEADER), ...rows.map((r) => line([csvText(r.email), csvText(r.link)]))].join(CSV_EOL) + CSV_EOL;
}

/** Nome do arquivo da lista: letras sem acento, números e hífen. */
export function inviteCsvFileName(today: IsoDate): string {
  return `clarevo-convites-${today}.csv`;
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

export const BENEFIT_PLAN_LABEL: Readonly<Record<BenefitPlan, string>> = { individual: 'Individual', familiar: 'Familiar' };

export const LICENSE_FILTER_LABEL: Readonly<Record<LicenseFilter, string>> = {
  todas: 'Todas',
  convidada: 'Convidadas',
  ativa: 'Ativas',
  encerrada: 'Encerradas',
};

/** Situação de cada licença na linha: o convite cancelado é dito à parte. */
export const LICENSE_KIND_LABEL: Readonly<Record<LicenseKind, string>> = {
  convidada: 'Convite enviado',
  ativa: 'Ativa',
  encerrada: 'Encerrada',
  cancelada: 'Convite cancelado',
};

/** O que a empresa nunca vê (a frase da privacidade do painel e de "Quem vê estes dados?"). */
export const COMPANY_PRIVACY =
  'A empresa não vê valores, categorias, metas, contas, cartões nem a Família de ninguém, nem somados.';

export const COMPANY_TEXT = {
  title: 'Painel da empresa',
  /** Conta (só na web, só para quem administra). */
  accountTitle: 'Painel da empresa',
  accountHint: 'Convide pessoas para o benefício e acompanhe as vagas e as licenças.',
  accountOpen: 'Abrir painel da empresa',
  webOnly: 'O painel da empresa está disponível só na web. Abra o app da Clarevo no navegador para usá-lo.',
  notAdmin: `Esta área é para quem administra o benefício de uma empresa. Se a sua empresa contratou a Clarevo e você administra o benefício, escreva para ${SUPPORT_EMAIL}.`,
  loading: 'Carregando o painel…',
  loadFailed: 'Não foi possível carregar o painel. Tente novamente.',
  demoBadge: 'Demonstração: empresa e pessoas fictícias. Nada é gravado fora deste aparelho.',
  demoOrganization: 'Empresa Exemplo (demonstração)',
  organizationChoose: 'Empresa',
  /** Contrato. */
  contractTitle: 'Contrato',
  plan: 'Plano',
  seats: 'Vagas',
  seatsUsed: 'Em uso',
  seatsFree: 'Livres',
  startsOn: 'Início',
  endsOn: 'Fim',
  noEnd: 'Sem data de fim',
  state: { vigente: 'Em vigor', futuro: 'Ainda não começou', encerrado: 'Terminou' } as const,
  seatsLine: (used: number, seats: number): string => `${used} de ${seats} vagas em uso`,
  contractNote: 'Cada pessoa que recebe o benefício ocupa uma vaga, enquanto o convite está pendente ou a licença está ativa.',
  /** Convidar pessoas. */
  inviteTitle: 'Convidar pessoas',
  inviteHelp:
    'Cole os e-mails, um por linha ou separados por vírgula ou ponto e vírgula. Cada pessoa recebe um link de uso único, que você envia pelo canal interno da empresa. A Clarevo não envia e-mail.',
  inviteLabel: 'E-mails',
  invitePlaceholder: 'ana@empresa.com.br\nbruno@empresa.com.br',
  previewTitle: 'Conferência da lista',
  previewValid: (n: number): string => (n === 1 ? '1 e-mail válido para convidar' : `${n} e-mails válidos para convidar`),
  previewRepeated: (n: number): string => (n === 1 ? '1 e-mail repetido na lista (conta uma vez)' : `${n} e-mails repetidos na lista (contam uma vez)`),
  previewAlready: (n: number): string => (n === 1 ? '1 e-mail já convidado (não ocupa outra vaga)' : `${n} e-mails já convidados (não ocupam outra vaga)`),
  previewInvalid: (n: number): string => (n === 1 ? '1 item que não parece um e-mail' : `${n} itens que não parecem um e-mail`),
  previewNone: 'Cole os e-mails para ver a conferência.',
  previewSeats: (free: number): string => (free === 1 ? 'Sobra 1 vaga' : `Sobram ${free} vagas`),
  problem: {
    vazia: 'Nenhum e-mail novo para convidar.',
    invalidos: 'Corrija ou retire os itens que não parecem um e-mail para continuar.',
    lote_grande: `Convide até ${LICENSE_BATCH_MAX} pessoas por vez.`,
    sem_vagas: `A lista tem mais pessoas novas do que vagas livres. Retire alguns e-mails ou escreva para ${CONTACT_EMAIL} para ampliar as vagas.`,
    contrato_fora_da_vigencia: `O contrato não está em vigor. Escreva para ${CONTACT_EMAIL}.`,
  } as const,
  confirm: (n: number): string => (n === 1 ? 'Convidar 1 pessoa' : `Convidar ${n} pessoas`),
  confirmBusy: 'Convidando…',
  invited: (n: number): string => (n === 1 ? '1 convite criado.' : `${n} convites criados.`),
  invitedNone: 'Todos os e-mails já tinham convite. Nenhum link novo foi criado.',
  /** Links gerados nesta tela. */
  linksTitle: 'Links para enviar',
  linksNote:
    'Os links aparecem só agora e valem para uma única pessoa, com o e-mail do convite. Copie ou baixe a lista antes de sair desta tela. Depois, use "Reenviar convite" para gerar um link novo.',
  linkFor: (email: string): string => `Link de ${email}`,
  copy: 'Copiar link',
  copyA11y: (email: string): string => `Copiar o link de ${email}`,
  copyAll: 'Copiar todos',
  copyAllDone: 'Lista copiada.',
  copied: 'Link copiado.',
  copyFailed: 'Não foi possível copiar. Selecione o texto e copie à mão.',
  download: 'Baixar lista',
  downloaded: 'Lista baixada.',
  downloadFailed: 'Não foi possível baixar a lista. Use "Copiar todos".',
  /** Licenças. */
  licensesTitle: 'Licenças',
  licensesEmpty: 'Nenhuma licença ainda. Convide pessoas acima.',
  licensesNone: 'Nenhuma licença nesta situação.',
  filterLabel: 'Situação',
  filterCount: (label: string, n: number): string => `${label}, ${n}`,
  invitedOn: (day: IsoDate): string => `Convite enviado em ${formatDateBR(day)}`,
  activeSince: (day: IsoDate): string => `Ativa desde ${formatDateBR(day)}`,
  endedOn: (day: IsoDate): string => `Encerrada em ${formatDateBR(day)}`,
  cancelledOn: (day: IsoDate): string => `Convite cancelado em ${formatDateBR(day)}`,
  licenseA11y: (email: string, kind: LicenseKind, when: string): string => `${email}, ${LICENSE_KIND_LABEL[kind]}. ${when}`,
  renew: 'Reenviar convite',
  renewA11y: (email: string): string => `Reenviar o convite de ${email}`,
  renewed: 'Novo link gerado. O link anterior deixou de valer.',
  cancelInvite: 'Cancelar convite',
  cancelInviteA11y: (email: string): string => `Cancelar o convite de ${email}`,
  cancelTitle: 'Cancelar o convite?',
  cancelBody: 'O link deixa de funcionar e a vaga volta. Você pode convidar o mesmo e-mail de novo depois.',
  cancelConfirm: 'Cancelar convite',
  cancelled: 'Convite cancelado.',
  end: 'Encerrar licença',
  endA11y: (email: string): string => `Encerrar a licença de ${email}`,
  endTitle: 'Encerrar a licença?',
  endBody:
    'A pessoa continua com a conta, o histórico e a Família dela: nada é apagado. O acesso pleno segue por 30 dias e depois ela passa para o plano gratuito, com leitura do histórico. Para voltar a ter o benefício, será preciso convidar de novo.',
  endConfirm: 'Encerrar licença',
  ended: 'Licença encerrada.',
  keep: 'Voltar',
  /** Uso do app: só as contagens das licenças. */
  usageTitle: 'Uso do app',
  usageIntro: 'Só a contagem das licenças. A empresa não vê quem entrou no app, nem quando, nem o que cada pessoa faz nele.',
  usageSeats: 'Vagas contratadas',
  usageInvited: 'Convites pendentes',
  usageActive: 'Licenças ativas',
  usageEnded: 'Licenças encerradas',
  usageLoadFailed: 'Não foi possível carregar o uso do app.',
  privacy: COMPANY_PRIVACY,
  /** Textos para divulgar (P-028). */
  promoTitle: 'Textos para divulgar',
  promoIntro: 'Textos prontos e neutros para o RH divulgar o benefício. Nenhum leva dados de ninguém. Copie, ajuste o que quiser e envie pelo canal interno.',
  promoCopy: 'Copiar texto',
  promoCopyA11y: (title: string): string => `Copiar o texto ${title}`,
  promoCopied: 'Texto copiado.',
  /** Erros. */
  loadingAction: 'Aguarde…',
} as const;

/** Textos prontos para o RH divulgar o benefício. Neutros, sem dados de ninguém e sem prometer o que o app não faz. */
export interface PromoText {
  id: string;
  title: string;
  text: string;
}

const PROMO_BASE: readonly PromoText[] = [
  {
    id: 'anuncio',
    title: 'Anúncio do benefício',
    text:
      'Chegou um benefício para ajudar a organizar o dinheiro do mês: a Clarevo. É um app para anotar gastos e recebimentos, acompanhar contas a pagar e planejar o mês com calma. Para começar, use o link de convite que enviamos para o seu e-mail. A empresa não vê o que você anota: seus gastos, contas, metas e cartões ficam só com você.',
  },
  {
    id: 'como-entrar',
    title: 'Como entrar',
    text:
      'Como começar na Clarevo: abra o link de convite que você recebeu, entre com o e-mail que a empresa usou no convite (ou crie sua conta com ele) e confira o nome da empresa antes de aceitar. O link serve uma única vez e só funciona com esse e-mail.',
  },
  {
    id: 'lembrete',
    title: 'Lembrete para quem ainda não entrou',
    text:
      'Ainda não ativou o benefício da Clarevo? O link de convite está no e-mail ou na mensagem que enviamos. Se ele não abrir, peça um novo link ao RH.',
  },
  {
    id: 'privacidade',
    title: 'O que a empresa vê',
    text:
      'Sobre privacidade: a empresa vê quantas licenças existem e a situação de cada uma. Ela não vê quem usa o app, nem quando, e não vê valores, categorias, metas, contas, cartões nem a Família de ninguém, nem somados.',
  },
];

/** "13º salário e contas do ano": os títulos dos temas, ligados por vírgula e "e". */
function joinTitles(titles: readonly string[]): string {
  if (titles.length <= 1) return titles.join('');
  return `${titles.slice(0, -1).join(', ')} e ${titles[titles.length - 1]}`;
}

/**
 * Os textos para divulgar. Nos meses com tema de época, entra um texto a mais, montado a partir de `seasonalCard` (os temas
 * públicos de Aprender do mês). O texto não leva dado de ninguém.
 */
export function promoTexts(today: IsoDate): PromoText[] {
  const card = seasonalCard(today);
  if (!card) return [...PROMO_BASE];
  const titles = card.topics.map((t) => t.title);
  return [
    ...PROMO_BASE,
    {
      id: 'neste-mes',
      title: `Neste mês: ${card.monthName}`,
      text: `Em ${card.monthName}, a Clarevo tem conteúdo sobre ${joinTitles(titles)}. Em Aprender, o card "Neste mês" reúne os temas e as calculadoras do período. É informação pública, com fonte e data de revisão, para quem quiser se organizar com antecedência.`,
    },
  ];
}

/** Textos de quem recebe o benefício (rota /beneficio/[código] e o card de Conta). */
export const BENEFIT_TEXT = {
  title: 'Benefício da empresa',
  signedOut:
    'Você recebeu um convite da sua empresa para usar o app da Clarevo como benefício. Entre ou crie sua conta com o e-mail do convite para ver os detalhes e aceitar. Depois você volta para este convite.',
  enter: 'Entrar',
  createAccount: 'Criar conta',
  loading: 'Conferindo o convite…',
  needSpace: 'Termine de criar a sua primeira conta antes de aceitar o convite.',
  invitedBy: (organization: string): string => `Convite de ${organization}`,
  planLine: (plan: BenefitPlan): string => `Plano ${BENEFIT_PLAN_LABEL[plan].toLowerCase()}`,
  privacy:
    'Aceitar dá a você o plano do benefício. A empresa administra só o seu acesso ao plano e não vê seus registros, contas, metas, cartões nem a sua Família.',
  accept: 'Aceitar benefício',
  notNow: 'Agora não',
  invalidTitle: 'Convite indisponível',
  invalid: 'Este convite não está disponível. Se o link é seu, entre com o e-mail que a empresa usou no convite ou peça um novo link ao RH.',
  accepted: (organization: string): string => `Benefício ativado: ${organization}.`,
  alreadyHave: 'Você já tem um benefício ativo de uma empresa. Cada pessoa tem uma licença ativa por vez.',
  openAccount: 'Ver em Conta',
  goHome: 'Ir para o início',
  retry: 'Tentar de novo',
  /** Conta. */
  accountTitle: 'Benefício pela empresa',
  accountNone: 'Se a sua empresa oferece a Clarevo como benefício, cole aqui o link do convite para ver os detalhes e aceitar.',
  demoOnly: 'Na demonstração não há benefício de exemplo. Para receber o convite de uma empresa, entre com uma conta sua.',
  haveInvite: 'Tenho um convite da empresa',
  pasteLabel: 'Link do convite da empresa',
  pasteHint: 'Cole o link que o RH enviou.',
  pasteSubmit: 'Ver convite',
  pasteInvalid: 'Não encontramos um convite da empresa neste texto. Confira o link que você recebeu.',
  organization: 'Empresa',
  plan: 'Plano',
  since: 'Desde',
  situation: 'Situação',
  active: 'Benefício ativo',
  endedLine: (day: IsoDate): string => `Benefício encerrado em ${formatDateBR(day)}`,
  fullAccessUntil: (day: IsoDate): string => `Acesso pleno até ${formatDateBR(day)}`,
  freePlan: (day: IsoDate): string => `O acesso pleno terminou em ${formatDateBR(day)}. Você está no plano gratuito, com leitura do histórico.`,
  contractUntil: (day: IsoDate): string => `O benefício vale até ${formatDateBR(day)}.`,
  keepsData: 'Sua conta, seu histórico e a sua Família continuam com você.',
  planCardSituation: 'Benefício pela empresa',
  /** "Quem vê estes dados?". */
  whoSees:
    'A empresa que oferece o benefício vê os e-mails que ela mesma convidou, a situação de cada convite ou licença (convite enviado, convite cancelado, ativa ou encerrada) e as datas. Ela não vê se ou quando você usa o app depois de aceitar. ' +
    COMPANY_PRIVACY,
} as const;

/** Textos de erro das telas da empresa (nomes e regras do banco). */
export const COMPANY_ERROR_TEXT = {
  email_invalido: 'Um dos itens não parece um e-mail. Corrija a lista e tente de novo.',
  itens_invalidos: `Convide de 1 a ${LICENSE_BATCH_MAX} pessoas por vez.`,
  contrato_nao_vigente: `O contrato não está em vigor. Escreva para ${CONTACT_EMAIL}.`,
  vagas_insuficientes: `Não há vagas livres para todas as pessoas da lista. Retire alguns e-mails ou escreva para ${CONTACT_EMAIL} para ampliar as vagas.`,
  licenca_nao_convidada: 'Esta licença já não é um convite pendente. Atualize a tela.',
  licenca_nao_ativa: 'Esta licença já não está ativa. Atualize a tela.',
  convite_invalido: BENEFIT_TEXT.invalid,
  ja_tem_licenca: BENEFIT_TEXT.alreadyHave,
  sem_permissao: 'Você não tem permissão para esta ação.',
  nao_encontrado: 'Esta empresa ou esta licença não está mais disponível. Atualize a tela.',
  chave_reutilizada: ERROR_TEXT.salvar_falhou,
  rede: 'Sem conexão no momento. Tente novamente.',
  salvar_falhou: ERROR_TEXT.salvar_falhou,
  carregar_falhou: ERROR_TEXT.carregar_falhou,
} as const;

/** Texto de um erro das telas da empresa; o que não é conhecido cai em "Não foi possível salvar...". */
export function companyErrorText(code: string): string {
  return (COMPANY_ERROR_TEXT as Record<string, string>)[code] ?? COMPANY_ERROR_TEXT.salvar_falhou;
}

/** Os códigos que as funções da empresa lançam, além dos comuns. */
export const COMPANY_ERROR_CODES: readonly RepoErrorCode[] = [
  'email_invalido',
  'itens_invalidos',
  'contrato_nao_vigente',
  'vagas_insuficientes',
  'licenca_nao_convidada',
  'licenca_nao_ativa',
  'convite_invalido',
  'ja_tem_licenca',
];

/** Todos os textos montados com entradas de exemplo, para o teste de textos. */
export function companyTextSamples(): string[] {
  const t = COMPANY_TEXT;
  const out: string[] = [];
  for (const value of Object.values(t)) if (typeof value === 'string') out.push(value);
  out.push(...Object.values(t.state), ...Object.values(t.problem));
  out.push(
    t.seatsLine(3, 10),
    t.previewValid(1),
    t.previewValid(4),
    t.previewRepeated(1),
    t.previewRepeated(2),
    t.previewAlready(1),
    t.previewAlready(2),
    t.previewInvalid(1),
    t.previewInvalid(3),
    t.previewSeats(1),
    t.previewSeats(5),
    t.confirm(1),
    t.confirm(8),
    t.invited(1),
    t.invited(3),
    t.linkFor('ana@empresa.com.br'),
    t.copyA11y('ana@empresa.com.br'),
    t.filterCount('Ativas', 2),
    t.invitedOn('2026-10-07'),
    t.activeSince('2026-10-07'),
    t.endedOn('2026-10-07'),
    t.cancelledOn('2026-10-07'),
    t.licenseA11y('ana@empresa.com.br', 'ativa', t.activeSince('2026-10-07')),
    t.renewA11y('ana@empresa.com.br'),
    t.cancelInviteA11y('ana@empresa.com.br'),
    t.endA11y('ana@empresa.com.br'),
    t.promoCopyA11y('Anúncio do benefício'),
  );
  for (const label of Object.values(LICENSE_FILTER_LABEL)) out.push(label);
  for (const label of Object.values(LICENSE_KIND_LABEL)) out.push(label);
  for (const label of Object.values(BENEFIT_PLAN_LABEL)) out.push(label);
  for (let m = 1; m <= 12; m += 1) for (const p of promoTexts(`2026-${String(m).padStart(2, '0')}-10`)) out.push(p.title, p.text);
  const b = BENEFIT_TEXT;
  for (const value of Object.values(b)) if (typeof value === 'string') out.push(value);
  out.push(
    b.invitedBy('Empresa Exemplo'),
    b.planLine('individual'),
    b.planLine('familiar'),
    b.accepted('Empresa Exemplo'),
    b.endedLine('2026-10-07'),
    b.fullAccessUntil('2026-11-06'),
    b.freePlan('2026-11-06'),
    b.contractUntil('2027-12-31'),
  );
  for (const value of Object.values(COMPANY_ERROR_TEXT)) out.push(value);
  return out;
}
