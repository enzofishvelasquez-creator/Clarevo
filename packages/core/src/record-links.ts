import { daysBetween, formatDateBR, formatMonthBR, formatMonthName, type IsoDate, type IsoMonth } from './dates';
import { formatBRL, type Cents } from './money';
import { CATEGORIES, recordMonth, type Card, type Commitment, type FinancialRecord, type RecordKind } from './records';
import { occurrenceLabel } from './series';
import type { Investment } from './investments';

/**
 * Gasto e recebimento ligados ao que pagaram ou renderam, subcategorias e troca de tipo (D-107, retorno de quem testa de 17/11/2026).
 * Regras e textos do formulário de gasto e recebimento, do detalhe e da composição; o banco repete as regras na migração
 * 20261117000002 (create_record, update_record, pay_commitment, pay_invoice e os desfazer).
 */

/** Subcategoria: até 30 caracteres (financial_records_subcategoria). */
export const SUBCATEGORY_MAX = 30;
/** Quantas subcategorias próprias por categoria ficam guardadas no aparelho. */
export const CUSTOM_SUBCATEGORIES_MAX = 8;

/**
 * Sugestões de subcategoria por categoria de gasto: listas curtas e comuns, sem marca. "Outra" (texto livre curto) completa cada lista.
 * O orçamento continua por categoria; a subcategoria só detalha (detalhe, lista e composição).
 */
export const SUBCATEGORIES: Readonly<Record<string, readonly string[]>> = {
  Moradia: ['Aluguel', 'Condomínio', 'Conta de luz', 'Conta de água', 'Gás', 'Internet', 'IPTU', 'Manutenção da casa'],
  Mercado: ['Supermercado', 'Feira', 'Padaria', 'Açougue', 'Produtos de limpeza'],
  Transporte: ['Combustível', 'Transporte público', 'Aplicativo de corrida', 'Estacionamento', 'Manutenção do carro', 'Seguro do carro', 'IPVA'],
  Saúde: ['Farmácia', 'Consulta', 'Exames', 'Plano de saúde', 'Dentista', 'Academia'],
  Educação: ['Mensalidade', 'Curso', 'Material escolar', 'Livros'],
  Lazer: ['Restaurante', 'Delivery', 'Streaming e assinaturas', 'Viagem', 'Cinema e shows', 'Bares'],
  'Crédito e parcelas': ['Fatura do cartão', 'Parcela de compra', 'Financiamento', 'Empréstimo', 'Acordo de dívida', 'Juros e tarifas'],
};

/** A categoria que pede "O que este gasto pagou?" sempre. */
export const CREDIT_CATEGORY = 'Crédito e parcelas';

/** Texto da subcategoria como fica guardado: espaços repetidos viram um, sem espaços nas pontas; vazio = null. */
export function normalizeSubcategory(text: string | null | undefined): string | null {
  if (typeof text !== 'string') return null;
  const t = text.replace(/\s+/g, ' ').trim();
  return t === '' ? null : t;
}

/** A subcategoria vale: nula, ou de 1 a 30 caracteres num gasto com categoria (como clarevo_check_subcategory). */
export function subcategoryAllowed(kind: RecordKind, category: string | null, subcategory: string | null): boolean {
  if (subcategory === null) return true;
  return kind === 'despesa' && category !== null && [...subcategory].length <= SUBCATEGORY_MAX && subcategory === subcategory.trim();
}

/**
 * Subcategorias próprias da pessoa (as escritas em "Outra"), por categoria, guardadas só no aparelho (como a memória das categorias).
 * Não é dado financeiro e nada vai para o servidor.
 */
export type SubcategoryMemory = Readonly<Record<string, readonly string[]>>;

/** As escolhas da categoria: as sugestões e, depois, as próprias da pessoa que não repetem uma sugestão. */
export function subcategoryChoices(category: string | null, memory: SubcategoryMemory = {}): { suggested: readonly string[]; own: readonly string[] } {
  if (category === null) return { suggested: [], own: [] };
  const suggested = SUBCATEGORIES[category] ?? [];
  const seen = new Set(suggested.map((s) => s.toLocaleLowerCase('pt-BR')));
  const own = (memory[category] ?? []).filter((s) => !seen.has(s.toLocaleLowerCase('pt-BR')));
  return { suggested, own };
}

/** Guarda uma subcategoria própria (a mais nova primeiro, sem repetir, até CUSTOM_SUBCATEGORIES_MAX). Sugestão não é guardada. */
export function rememberSubcategory(memory: SubcategoryMemory, category: string, name: string): SubcategoryMemory {
  const t = normalizeSubcategory(name);
  if (t === null || [...t].length > SUBCATEGORY_MAX) return memory;
  const lower = t.toLocaleLowerCase('pt-BR');
  if ((SUBCATEGORIES[category] ?? []).some((s) => s.toLocaleLowerCase('pt-BR') === lower)) return memory;
  const list = [t, ...(memory[category] ?? []).filter((s) => s.toLocaleLowerCase('pt-BR') !== lower)].slice(0, CUSTOM_SUBCATEGORIES_MAX);
  return { ...memory, [category]: list };
}

/** Tira uma subcategoria própria (só do aparelho; os lançamentos que já a têm continuam com ela). */
export function forgetSubcategory(memory: SubcategoryMemory, category: string, name: string): SubcategoryMemory {
  const list = (memory[category] ?? []).filter((s) => s !== name);
  const next = { ...memory };
  if (list.length > 0) next[category] = list;
  else delete next[category];
  return next;
}

/** Lê a memória guardada (valor desconhecido ou estragado volta vazio). */
export function parseSubcategoryMemory(value: unknown): SubcategoryMemory {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string[]> = {};
  for (const [category, list] of Object.entries(value as Record<string, unknown>)) {
    if (!CATEGORIES.despesa.includes(category) || !Array.isArray(list)) continue;
    const names = list.flatMap((s) => {
      const t = normalizeSubcategory(typeof s === 'string' ? s : null);
      return t !== null && [...t].length <= SUBCATEGORY_MAX ? [t] : [];
    });
    if (names.length > 0) out[category] = names.slice(0, CUSTOM_SUBCATEGORIES_MAX);
  }
  return out;
}

// ---------------------------------------------------------------------------
// "O que este gasto pagou?" (item 1)
// ---------------------------------------------------------------------------

/** Uma conta a pagar (ou parcela) em aberto, ou a fatura fechada de um cartão, que o gasto pode ter pagado. */
export type PaymentLinkOption =
  | {
      type: 'conta';
      /** "conta:<id>" */
      key: string;
      commitmentId: string;
      version: number;
      /** "Acordo (parcela 18 de 21)" */
      label: string;
      amountCents: Cents;
      dueOn: IsoDate;
    }
  | {
      type: 'fatura';
      /** "fatura:<cartão>:<mês>" */
      key: string;
      cardId: string;
      month: IsoMonth;
      version: number;
      /** "Fatura Cartão Exemplo (novembro)" */
      label: string;
      amountCents: Cents;
      dueOn: IsoDate;
    };

/** "Acordo (parcela 18 de 21)", "Internet" ou "Luz (todo mês)". */
export function commitmentLinkLabel(c: Pick<Commitment, 'description' | 'series' | 'dueOn'>): string {
  const occ = occurrenceLabel(c);
  return occ ? `${c.description} (${occ.charAt(0).toLowerCase()}${occ.slice(1)})` : c.description;
}

/** "Fatura Cartão Exemplo (novembro)"; de outro ano, "(novembro de 2027)". */
export function invoiceLinkLabel(cardName: string, month: IsoMonth, today: IsoDate): string {
  const year = month.slice(0, 4) === today.slice(0, 4) ? '' : ` de ${month.slice(0, 4)}`;
  return `Fatura ${cardName} (${formatMonthName(month)}${year})`;
}

/**
 * As opções de "O que este gasto pagou?": as contas a pagar e parcelas em aberto (sem as de fatura) e as faturas fechadas e ainda sem
 * pagamento dos cartões (só depois do fechamento a fatura recebe pagamento: hoje depois do dia do fechamento). Pela ordem: as de valor
 * igual ao digitado primeiro, depois pelo vencimento (o mais antigo primeiro). `commitments` é a lista de contas do mês (listCommitments:
 * traz todas as abertas); `cards`, os cartões do contexto (para o nome da fatura).
 */
export function paymentLinkOptions(
  commitments: readonly Commitment[],
  cards: readonly Pick<Card, 'id' | 'name'>[],
  today: IsoDate,
  amountCents: Cents | null = null,
): PaymentLinkOption[] {
  const out: PaymentLinkOption[] = [];
  const cardName = new Map(cards.map((c) => [c.id, c.name] as const));
  for (const c of commitments) {
    if (c.status !== 'aberto') continue;
    if (c.invoice) {
      if (today <= c.invoice.closingOn || c.amountCents < 1) continue;
      const name = cardName.get(c.invoice.cardId);
      if (!name) continue;
      out.push({
        type: 'fatura',
        key: `fatura:${c.invoice.cardId}:${c.invoice.month}`,
        cardId: c.invoice.cardId,
        month: c.invoice.month,
        version: c.version,
        label: invoiceLinkLabel(name, c.invoice.month, today),
        amountCents: c.amountCents,
        dueOn: c.dueOn,
      });
    } else {
      out.push({ type: 'conta', key: `conta:${c.id}`, commitmentId: c.id, version: c.version, label: commitmentLinkLabel(c), amountCents: c.amountCents, dueOn: c.dueOn });
    }
  }
  const same = (o: PaymentLinkOption) => (amountCents !== null && o.amountCents === amountCents ? 0 : 1);
  return out.sort((a, b) => same(a) - same(b) || a.dueOn.localeCompare(b.dueOn) || a.label.localeCompare(b.label, 'pt-BR') || a.key.localeCompare(b.key));
}

/** Palavras de 4 letras ou mais, sem acento, para comparar a descrição com o nome da conta. */
function words(text: string): Set<string> {
  return new Set(
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLocaleLowerCase('pt-BR')
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4),
  );
}

/** Até quantos dias do vencimento um gasto de mesmo valor parece ser o pagamento da conta. */
export const LINK_NEAR_DAYS = 15;

/**
 * A opção parece com o gasto digitado: uma palavra do nome da conta na descrição, ou o mesmo valor com a data a até 15 dias do vencimento
 * (sem data, só o valor).
 */
export function looksLikeOption(option: PaymentLinkOption, description: string, amountCents: Cents | null, date: IsoDate | null = null): boolean {
  if (amountCents !== null && amountCents === option.amountCents && (date === null || Math.abs(daysBetween(date, option.dueOn)) <= LINK_NEAR_DAYS)) return true;
  const typed = words(description);
  if (typed.size === 0) return false;
  const name = option.type === 'fatura' ? new Set(['fatura', ...words(option.label)]) : words(option.label);
  for (const w of name) if (typed.has(w)) return true;
  return false;
}

/**
 * "O que este gasto pagou?" aparece no gasto (fora da compra no cartão): sempre com "Crédito e parcelas", e em qualquer categoria quando
 * alguma conta em aberto parece com o gasto digitado (mesmo valor, ou o nome dela na descrição), ou quando o gasto já está ligado.
 */
export function showPaymentLink(
  category: string | null,
  options: readonly PaymentLinkOption[],
  description: string,
  amountCents: Cents | null,
  linkedKey: string | null = null,
  date: IsoDate | null = null,
): boolean {
  if (linkedKey !== null || category === CREDIT_CATEGORY) return true;
  return options.some((o) => looksLikeOption(o, description, amountCents, date));
}

/** A opção que corresponde ao vínculo atual do gasto (conta a pagar ou fatura), ou null. */
export function linkedOptionKey(record: Pick<FinancialRecord, 'commitmentId' | 'invoice'> | null | undefined): string | null {
  if (!record) return null;
  if (record.invoice) return `fatura:${record.invoice.cardId}:${record.invoice.month}`;
  return record.commitmentId ? `conta:${record.commitmentId}` : null;
}

/**
 * Os passos para gravar o vínculo escolhido ao salvar (na ordem): desligar o de antes (mantendo o gasto) e ligar o novo. `current` é
 * o vínculo que o gasto tem agora; `chosen`, a opção escolhida (null = "Nenhuma destas").
 */
export function linkSteps(current: string | null, chosen: PaymentLinkOption | null): { unlink: boolean; link: PaymentLinkOption | null } {
  if ((chosen?.key ?? null) === current) return { unlink: false, link: null };
  return { unlink: current !== null, link: chosen };
}

// ---------------------------------------------------------------------------
// Rendimento de investimento (item 4)
// ---------------------------------------------------------------------------

/** Os investimentos que podem receber o rendimento: os ativos, por nome. O ligado agora entra mesmo encerrado (para aparecer marcado). */
export function incomeInvestmentOptions(investments: readonly Pick<Investment, 'id' | 'name' | 'status'>[], keepId: string | null = null) {
  return investments
    .filter((i) => i.status === 'ativo' || i.id === keepId)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------------
// Troca de tipo (item 3)
// ---------------------------------------------------------------------------

/** O efeito no mês de trocar o tipo ao editar: "Ao salvar, este valor sai de Pago e entra em Recebido de novembro de 2026." */
export function kindSwitchNotice(from: RecordKind, to: RecordKind, record: Pick<FinancialRecord, 'occurredOn' | 'nextMonth'>): string | null {
  if (from === to) return null;
  const month = formatMonthBR(recordMonth({ occurredOn: record.occurredOn, nextMonth: to === 'receita' ? record.nextMonth : false })).toLowerCase();
  return from === 'despesa'
    ? `Ao salvar, este valor sai de Pago e entra em Recebido de ${month}. A categoria passa a ser uma de recebimento.`
    : `Ao salvar, este valor sai de Recebido e entra em Pago de ${month}. A categoria passa a ser uma de gasto.`;
}

// ---------------------------------------------------------------------------
// Composição: quanto foi para cada subcategoria dentro da categoria (item 2)
// ---------------------------------------------------------------------------

/** Uma linha "Conta de luz · R$ 170,52" dentro da categoria; label "Sem subcategoria" para o resto. */
export interface SubcategoryShare {
  subcategory: string | null;
  label: string;
  cents: Cents;
}

// ---------------------------------------------------------------------------
// Textos (português do Brasil, linguagem neutra, sem cor de alerta)
// ---------------------------------------------------------------------------

export const RECORD_LINK_TEXT = {
  // Subcategoria
  subcategoryLabel: 'Subcategoria (opcional)',
  subcategoryNone: 'Nenhuma',
  subcategoryOther: 'Outra',
  subcategoryOtherLabel: 'Nome da subcategoria',
  subcategoryOtherHint: 'Até 30 caracteres. Fica guardada neste aparelho para as próximas vezes.',
  subcategoryOtherEmpty: 'Escreva o nome da subcategoria ou escolha uma da lista.',
  subcategoryEdit: 'Editar minhas subcategorias',
  subcategoryEditDone: 'Concluir edição',
  subcategoryEditHint: 'Tirar daqui não muda os lançamentos que já têm a subcategoria.',
  subcategoryRemove: (name: string) => `Tirar ${name}`,
  subcategoryRow: 'Subcategoria',
  noSubcategory: 'Sem subcategoria',
  categoryFixedNote: 'As categorias são as mesmas do orçamento. Para um nome seu, use a subcategoria Outra.',
  // O que este gasto pagou?
  paidTitle: 'O que este gasto pagou?',
  paidHint: 'Ligando o gasto à conta, ela sai de Ainda a pagar e o valor não conta duas vezes.',
  paidNone: 'Nenhuma destas',
  paidEmpty: 'Nenhuma conta a pagar em aberto nem fatura fechada para ligar agora.',
  paidInvoiceNote:
    'Na fatura, o gasto vira o pagamento dela, com este valor e esta data, como em Registrar pagamento. Se o valor for menor que a fatura, o restante vai para a fatura seguinte.',
  paidLinkedNow: 'Ligado agora.',
  optionDue: (dueOn: IsoDate) => `vence em ${formatDateBR(dueOn)}`,
  optionLine: (o: Pick<PaymentLinkOption, 'label' | 'amountCents' | 'dueOn'>) => `${o.label} · ${formatBRL(o.amountCents)} · vence em ${formatDateBR(o.dueOn)}`,
  registerCommitment: 'Cadastrar conta a pagar',
  registerInstallment: 'Cadastrar parcelamento',
  registerBackHint: 'Depois de salvar, você volta para o lançamento que estava anotando, com o que já preencheu.',
  linkedRow: 'Pagou',
  linkedInvoiceDetail: 'Este gasto foi anotado antes e ligado a esta fatura. Para que ele deixe de ser o pagamento dela, desligue aqui: o gasto continua.',
  unlinkInvoice: 'Desligar da fatura',
  unlinkInvoiceTitle: 'Desligar este gasto da fatura?',
  unlinkInvoiceBody:
    'O gasto continua em Pago, na data dele, e a fatura volta a ficar em aberto. Se uma parte da fatura tinha ido para a seguinte, ela sai.',
  unlinkedInvoice: 'Gasto desligado da fatura. A fatura voltou a ficar em aberto.',
  /** Linha a mais no aviso de salvo: "Ligado a Acordo (parcela 18 de 21), que saiu de Ainda a pagar." */
  linkedNotice: (label: string) => `Ligado a ${label}, que saiu de Ainda a pagar.`,
  linkedInvoiceNotice: (label: string) => `Registrado como o pagamento de ${label}.`,
  unlinkedNotice: 'A conta de antes voltou para Ainda a pagar, e o gasto continua.',
  linkFailedAfterSave: (reason: string) => `Não foi ligado à conta: ${reason} Para ligar, abra Editar gasto.`,
  linkFailedAfterUpdate: (reason: string) => `As alterações foram salvas, mas o gasto não foi ligado: ${reason}`,
  linkNotLoaded: 'Não foi possível carregar a conta escolhida. Tente de novo.',
  // Troca de tipo
  kindTitle: 'Tipo',
  kindExpense: 'Gasto',
  kindIncome: 'Recebimento',
  kindLocked: 'Este gasto é o pagamento de uma conta. Para trocar o tipo, escolha Nenhuma destas em O que este gasto pagou?',
  kindLockedReceipt: 'Este gasto veio de uma nota fiscal e continua como gasto.',
  // Rendimento de investimento
  incomeToggle: 'Rendimento de investimento',
  incomeCaption: 'Liga este recebimento a um investimento cadastrado no espaço Pessoal.',
  incomeChoose: 'Qual investimento?',
  incomeEffect: (name: string) =>
    `Ao salvar, o valor entra em Recebido uma vez só e fica registrado como rendimento recebido em ${name}, na mesma data. O valor atual do investimento não muda.`,
  incomeEmpty: 'Nenhum investimento cadastrado ainda.',
  incomeChooseError: 'Escolha o investimento ou desligue Rendimento de investimento.',
  incomeOnlyPersonal: 'Investimentos ficam só no espaço Pessoal.',
  registerInvestment: 'Cadastrar investimento',
  incomeRow: 'Rendimento de',
  /** Na legenda da linha da lista: "Recebido · 05/11/2026 · rendimento de investimento". */
  rowIncome: 'rendimento de investimento',
  /** Na composição por categoria: "Conta de luz: R$ 170,52". */
  subcategoryLine: (label: string, cents: Cents) => `${label}: ${formatBRL(cents)}`,
  incomeRemovedNote: 'Ao salvar, o rendimento ligado sai do investimento.',
  incomeRemovedOnDelete: 'O rendimento ligado a este recebimento sai do investimento.',
  // Cadastrar e voltar
  registerAnotherCard: 'Cadastrar outro cartão',
} as const;

/** Recusas ao ligar ou desligar um gasto (pay_commitment, pay_invoice e os desfazer com o gasto), em uma frase. */
export const RECORD_LINK_ERROR_TEXT: Readonly<Record<string, string>> = {
  versao_desatualizada: 'A conta ou o gasto mudou em outro aparelho. Confira e tente de novo.',
  compromisso_quitado: 'Esta conta já está paga. Escolha outra ou Nenhuma destas.',
  compromisso_aberto: 'Esta conta já não estava ligada a este gasto.',
  registro_ja_ligado: 'Este gasto já é o pagamento de outra conta.',
  registro_invalido: 'Este gasto não pode ser o pagamento desta conta.',
  fatura_aberta: 'Esta fatura ainda não fechou. O pagamento se liga depois do fechamento.',
  valor_acima_da_fatura: 'O valor do gasto é maior que o da fatura. Confira o valor ou escolha outra conta.',
  fatura_seguinte_paga: 'A fatura seguinte já foi paga, então o restante não tem para onde ir. Confira o valor.',
  data_invalida: 'A data do gasto é anterior ao período desta fatura.',
  conta_invalida: 'Escolha o banco ou a carteira de onde saiu o gasto.',
  conta_de_fatura: 'Esta conta é a fatura de um cartão. Escolha a fatura na lista.',
  nao_encontrado: 'Esta conta não está mais disponível.',
  sem_permissao: 'Você não pode mudar esta conta.',
};

/** Recusas novas de create_record e update_record (D-107). */
export const RECORD_KIND_ERROR_TEXT: Readonly<Record<string, string>> = {
  subcategoria_invalida: 'Use uma subcategoria de até 30 caracteres, com uma categoria de gasto escolhida.',
  tipo_nao_muda: 'Este gasto é o pagamento de uma conta, de uma fatura ou veio de uma nota fiscal, então continua como gasto.',
  investimento_invalido: 'Escolha um investimento ativo do espaço Pessoal.',
  investimento_encerrado: 'Este investimento está encerrado. Escolha outro ou reative o investimento.',
};

export function recordLinkErrorText(code: string): string {
  return RECORD_LINK_ERROR_TEXT[code] ?? 'Não foi possível ligar o gasto à conta. Tente de novo.';
}
