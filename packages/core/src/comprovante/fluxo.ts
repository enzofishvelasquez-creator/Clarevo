import type { IsoDate } from '../dates';
import { daysBetween, formatDateBR } from '../dates';
import type { Cents } from '../money';
import { MAX_RECORD_CENTS, centsToInput, formatBRL } from '../money';
import type { StoreMemory } from '../nota-flow';
import { CATEGORIES } from '../records';
import type { FinancialRecord, RecordKind } from '../records';
import { sha256Hex } from '../sha256';
import { DESCRIPTION_MAX } from '../validation';
import type { ComprovanteDirection, ComprovanteErrorCode, ComprovanteKind, ComprovanteReading } from './tipos';
import { fitWords, fold, trimEdges } from './texto';

/**
 * Regras do preenchimento de "Anotar gasto" e "Registrar recebimento" a partir de um comprovante de Pix ou de pagamento em PDF
 * (Ciclo I2, D-051). Tudo puro, sem tela: o que a leitura preenche e onde fica o foco, a descrição ("Pix para Maria", com a memória
 * por nome), o aviso de tipo trocado (comprovante de recebimento em Anotar gasto e o inverso) e o aviso de "Parece já anotado".
 *
 * Privacidade: a "memória por nome" (descrição e categoria da última vez com a mesma pessoa ou empresa) fica só neste aparelho, por
 * pessoa de uso do app, e usa o resumo SHA-256 do nome normalizado como chave. O nome em si, o documento, a chave Pix e os códigos
 * do comprovante nunca vão ao servidor nem ao armazenamento: o registro leva só o que a pessoa salvou (descrição, valor, data,
 * categoria), e o comprovante não deixa nenhuma chave no registro (a duplicidade é avisada por semelhança, sem migração).
 */

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

export const COMPROVANTE_TEXT = {
  /** Opção da folha "Escanear nota fiscal" (Anotar gasto) e linha de Registrar recebimento. */
  option: 'Ler comprovante de Pix ou pagamento',
  /** Com a leitura de imagem (no navegador, D-078 B): PDF ou print. */
  lineHint: 'Comprovante ou holerite, em PDF ou imagem, lido aqui no aparelho',
  lineA11y: 'Ler comprovante de Pix ou pagamento. Comprovante ou holerite, em PDF ou imagem, lido aqui no aparelho.',
  /** Sem a leitura de imagem (app das lojas, por enquanto): só PDF. */
  lineHintPdf: 'Comprovante ou holerite em PDF, lido aqui no aparelho',
  lineA11yPdf: 'Ler comprovante de Pix ou pagamento. Comprovante ou holerite em PDF, lido aqui no aparelho.',
  workingImage: 'Lendo a imagem aqui no aparelho. Pode levar alguns segundos…',
  /** Na folha de Anotar gasto, abaixo da frase de privacidade da nota. */
  sheetPrivacy: 'Comprovante em PDF ou imagem: lido aqui no aparelho e não guardado. Não guardamos CPF, CNPJ, chave Pix, conta nem códigos do comprovante.',
  working: 'Lendo o comprovante aqui no aparelho…',
  readTitle: 'Comprovante lido',
  readAnnounce: 'Comprovante lido',
  readAgain: 'Ler outro comprovante',
  undoRead: 'Desfazer leitura',
  filled: 'Preenchemos o que o comprovante informa. Confira e toque em Salvar.',
  privacy: 'O arquivo foi lido aqui no aparelho e não é guardado. Não guardamos CPF, CNPJ, chave Pix, conta nem códigos do comprovante.',
  messageLabel: 'Mensagem do comprovante',
  lastTimeLegend: 'Como da última vez com este nome',
  nameLegend: 'Nome lido do comprovante',
  messageLegend: 'Mensagem lida do comprovante',
  holeriteLegend: 'Mês de competência lido do holerite',
  placeholderOut: 'Ex.: Pix para Maria',
  placeholderIn: 'Ex.: Pix de Maria',
  /** O que o comprovante não trouxe (a leitura não falhou). */
  missingAmount: 'O valor não apareceu no comprovante. Digite o valor.',
  missingDay: 'A data não apareceu no comprovante. Escolha o dia.',
  /** Holerite: traz o mês de competência, não o dia do pagamento. */
  holeriteDay: 'O holerite mostra o mês de competência, não o dia do pagamento. Escolha o dia em que o salário entrou.',
  futureDay: 'A data do comprovante ainda não chegou. Escolha o dia.',
  missingName: 'O nome não apareceu no comprovante. Digite uma descrição.',
  directionGuessed: 'O comprovante não diz se o dinheiro saiu ou entrou. Usamos o tipo desta tela. Confira se está certo.',
  /** Tipo trocado: o comprovante é do outro lado. */
  switchToIncome: 'Trocar para Registrar recebimento',
  switchToExpense: 'Trocar para Anotar gasto',
  /** Erros da leitura do PDF, um por causa. */
  errors: {
    texto_vazio: 'Não encontramos texto neste PDF. Ele pode ser uma foto do comprovante. Digite os dados à mão.',
    nota_fiscal: 'Este PDF parece ser de uma nota fiscal, não de um comprovante. Para ler notas, use Escanear nota fiscal em Anotar gasto.',
    nao_e_comprovante: 'Não reconhecemos um comprovante neste PDF. Confira se é o comprovante de um Pix, de uma TED, de um boleto ou de um pagamento.',
  } satisfies Record<ComprovanteErrorCode, string>,
  pdf: {
    tooBig: 'Este PDF é grande demais para ler aqui. Digite os dados à mão.',
    failed: 'Não foi possível ler este PDF. Digite os dados à mão.',
    notPdf: 'Este arquivo não é um PDF.',
    /** Imagem (print ou foto) sem texto que dê para ler. */
    imageNoText: 'Não conseguimos ler esta imagem. Confira se está nítida e inteira, ou digite os dados à mão.',
    imageFailed: 'Não foi possível ler esta imagem. Digite os dados à mão.',
    imageTooBig: 'Esta imagem passa de 10 MB. Use um print ou uma foto menor.',
    notSupported: 'Este arquivo não é um PDF nem uma imagem.',
  },
  /** "Parece já anotado em 05/10/2026: Padaria, R$ 85,00." */
  looksNoted: (date: IsoDate, description: string, cents: Cents): string => `Parece já anotado em ${formatDateBR(date)}: ${description}, ${formatBRL(cents)}.`,
  looksNotedHint: 'Pode ser o mesmo lançamento. Se for outro, é só salvar.',
} as const;

export function comprovanteErrorText(code: ComprovanteErrorCode): string {
  return COMPROVANTE_TEXT.errors[code];
}

// ---------------------------------------------------------------------------
// Tipo
// ---------------------------------------------------------------------------

/** "Pix enviado", "Pix recebido", "TED enviada", "Boleto pago", "Débito"; sem direção, só o tipo ("Pix"). */
export function comprovanteKindLabel(kind: ComprovanteKind, direction: ComprovanteDirection | null): string {
  switch (kind) {
    case 'pix':
      return direction === 'saida' ? 'Pix enviado' : direction === 'entrada' ? 'Pix recebido' : 'Pix';
    case 'ted':
      return direction === 'saida' ? 'TED enviada' : direction === 'entrada' ? 'TED recebida' : 'TED';
    case 'boleto':
      return 'Boleto pago';
    case 'debito':
      return 'Débito';
    case 'holerite':
      return 'Holerite';
    default:
      return direction === 'saida' ? 'Pagamento' : direction === 'entrada' ? 'Recebimento' : 'Comprovante';
  }
}

/** Com artigo, para frases: "um Pix recebido", "uma TED enviada", "um boleto pago". */
export function comprovanteKindPhrase(kind: ComprovanteKind, direction: ComprovanteDirection | null): string {
  switch (kind) {
    case 'pix':
      return direction === 'entrada' ? 'um Pix recebido' : direction === 'saida' ? 'um Pix enviado' : 'um Pix';
    case 'ted':
      return direction === 'entrada' ? 'uma TED recebida' : direction === 'saida' ? 'uma TED enviada' : 'uma TED';
    case 'boleto':
      return 'um boleto pago';
    case 'debito':
      return 'um débito';
    case 'holerite':
      return 'um holerite';
    default:
      return direction === 'entrada' ? 'um recebimento' : 'um pagamento';
  }
}

function descriptionFor(kind: ComprovanteKind, direction: ComprovanteDirection | null, name: string): string {
  if (direction === 'entrada') return kind === 'pix' ? `Pix de ${name}` : kind === 'ted' ? `TED de ${name}` : `Recebimento de ${name}`;
  switch (kind) {
    case 'pix':
      return `Pix para ${name}`;
    case 'ted':
      return `TED para ${name}`;
    case 'boleto':
      return `Boleto para ${name}`;
    case 'debito':
      return `Débito em ${name}`;
    default:
      return `Pagamento para ${name}`;
  }
}

// ---------------------------------------------------------------------------
// Rascunho
// ---------------------------------------------------------------------------

/** O que o comprovante diz, já conferido para o formulário (valor dentro do limite, data que não é futura). */
export interface ComprovanteDraft {
  kind: ComprovanteKind;
  direction: ComprovanteDirection | null;
  directionGuessed: boolean;
  /** Gasto (o dinheiro saiu) ou recebimento (entrou); null quando o comprovante não diz. */
  recordKind: RecordKind | null;
  amountCents: Cents | null;
  occurredOn: IsoDate | null;
  /** A data do comprovante é depois de hoje: não é usada, a pessoa escolhe o dia. */
  dayFuture: boolean;
  time: string | null;
  counterpart: string | null;
  message: string | null;
}

export function comprovanteDraft(reading: ComprovanteReading, today: IsoDate): ComprovanteDraft {
  const future = reading.occurredOn !== null && reading.occurredOn > today;
  return {
    kind: reading.kind,
    direction: reading.direction,
    directionGuessed: reading.directionGuessed,
    recordKind: reading.direction === 'saida' ? 'despesa' : reading.direction === 'entrada' ? 'receita' : null,
    amountCents: reading.amountCents !== null && reading.amountCents >= 1 && reading.amountCents <= MAX_RECORD_CENTS ? reading.amountCents : null,
    occurredOn: reading.occurredOn !== null && !future ? reading.occurredOn : null,
    dayFuture: future,
    time: reading.time,
    counterpart: reading.counterpart,
    message: reading.message,
  };
}

/**
 * "Comprovante lido: Pix enviado · Maria Souza · R$ 85,00 · 05/10/2026 às 14:32" (só o que a leitura traz). A direção só entra
 * quando o comprovante a diz; a que veio da tela não é afirmada ("Pix"). A tela passa o texto por `MoneyTxt`, então o valor
 * respeita "Ocultar valores".
 */
export function comprovanteReadLine(draft: ComprovanteDraft): string {
  const kind = comprovanteKindLabel(draft.kind, draft.directionGuessed ? null : draft.direction);
  const when = draft.occurredOn ? `${formatDateBR(draft.occurredOn)}${draft.time ? ` às ${draft.time}` : ''}` : null;
  const amount = draft.amountCents === null ? null : formatBRL(draft.amountCents);
  return `${COMPROVANTE_TEXT.readTitle}: ${[kind, draft.counterpart, amount, when].filter(Boolean).join(' · ')}`;
}

export interface ComprovanteGaps {
  amount: string | null;
  day: string | null;
  name: string | null;
  guessed: string | null;
}

/** As mensagens do que o comprovante não trouxe, para a leitura não parecer falha. */
export function comprovanteGaps(draft: ComprovanteDraft): ComprovanteGaps {
  return {
    amount: draft.amountCents === null ? COMPROVANTE_TEXT.missingAmount : null,
    day: draft.occurredOn === null ? (draft.dayFuture ? COMPROVANTE_TEXT.futureDay : draft.kind === 'holerite' ? COMPROVANTE_TEXT.holeriteDay : COMPROVANTE_TEXT.missingDay) : null,
    name: draft.counterpart === null && draft.message === null ? COMPROVANTE_TEXT.missingName : null,
    guessed: draft.directionGuessed ? COMPROVANTE_TEXT.directionGuessed : null,
  };
}

/** A tela é a do outro lado: "Este comprovante é de um Pix recebido..." com a ação de trocar. null quando combina (ou não diz). */
export function comprovanteMismatch(draft: ComprovanteDraft, screen: RecordKind): { text: string; action: string; other: RecordKind } | null {
  if (draft.recordKind === null || draft.recordKind === screen || draft.directionGuessed) return null;
  const phrase = comprovanteKindPhrase(draft.kind, draft.direction);
  return screen === 'despesa'
    ? { text: `Este comprovante é de ${phrase}. Ele entra como recebimento, não como gasto.`, action: COMPROVANTE_TEXT.switchToIncome, other: 'receita' }
    : { text: `Este comprovante é de ${phrase}. Ele entra como gasto, não como recebimento.`, action: COMPROVANTE_TEXT.switchToExpense, other: 'despesa' };
}

// ---------------------------------------------------------------------------
// Descrição e memória por nome
// ---------------------------------------------------------------------------

export interface ComprovanteDescription {
  description: string;
  category: string | null;
  source: 'ultima_vez' | 'nome' | 'mensagem' | 'em_branco';
  /** Legenda curta sob o campo; null quando não há. */
  legend: string | null;
  placeholder: string;
}

/**
 * Descrição sugerida ao ler um comprovante, nesta ordem:
 * 1. a mesma pessoa ou empresa já foi anotada neste aparelho: repete descrição e categoria da última vez, com a legenda;
 * 2. o nome é conhecido: "Pix para Maria Souza" (saída) ou "Pix de Maria Souza" (entrada), "TED para", "Boleto para", "Débito em";
 * 3. só há a mensagem do comprovante: a própria mensagem;
 * 4. nada: em branco, com a dica "Ex.: Pix para Maria".
 * `kind` é o tipo do formulário (gasto ou recebimento): decide a dica e a categoria que vale.
 */
export function suggestComprovanteDescription(draft: ComprovanteDraft, lastTime: StoreMemory | null, kind: RecordKind): ComprovanteDescription {
  const placeholder = kind === 'despesa' ? COMPROVANTE_TEXT.placeholderOut : COMPROVANTE_TEXT.placeholderIn;
  if (lastTime && lastTime.description.trim() !== '') {
    return {
      description: fitWords(lastTime.description, DESCRIPTION_MAX),
      category: lastTime.category && CATEGORIES[kind].includes(lastTime.category) ? lastTime.category : null,
      source: 'ultima_vez',
      legend: COMPROVANTE_TEXT.lastTimeLegend,
      placeholder,
    };
  }
  if (draft.counterpart) {
    return {
      description: fitWords(descriptionFor(draft.kind, kind === 'despesa' ? 'saida' : 'entrada', draft.counterpart), DESCRIPTION_MAX),
      category: null,
      source: 'nome',
      legend: COMPROVANTE_TEXT.nameLegend,
      placeholder,
    };
  }
  if (draft.message && draft.kind === 'holerite') {
    // "Salário de setembro de 2026", na categoria Salário quando a tela é de recebimento.
    const category = kind === 'receita' && CATEGORIES.receita.includes('Salário') ? 'Salário' : null;
    return { description: fitWords(draft.message, DESCRIPTION_MAX), category, source: 'mensagem', legend: COMPROVANTE_TEXT.holeriteLegend, placeholder };
  }
  if (draft.message) {
    return { description: fitWords(draft.message, DESCRIPTION_MAX), category: null, source: 'mensagem', legend: COMPROVANTE_TEXT.messageLegend, placeholder };
  }
  return { description: '', category: null, source: 'em_branco', legend: null, placeholder };
}

/** Nome sem acento, em minúsculas, só com letras e números separados por um espaço. */
export function normalizeCounterpart(name: string): string {
  let out = '';
  let pendingSpace = false;
  for (const ch of fold(name)) {
    const c = ch.charCodeAt(0);
    if ((c >= 97 && c <= 122) || (c >= 48 && c <= 57)) {
      if (pendingSpace && out !== '') out += ' ';
      pendingSpace = false;
      out += ch;
    } else pendingSpace = true;
  }
  return out;
}

/**
 * Chave da memória por nome: o resumo SHA-256 do nome normalizado (com o tipo do registro, porque "Pix para Maria" e "Pix de Maria"
 * são lembranças diferentes). null sem nome. O nome em si nunca é guardado como chave.
 */
export function counterpartMemoryId(name: string | null, kind: RecordKind): string | null {
  const normalized = name ? normalizeCounterpart(name) : '';
  return normalized.length >= 2 ? sha256Hex(`pessoa:${kind}:${normalized}`) : null;
}

/** O que guardar depois de salvar: descrição (1 a 80) e categoria do tipo do registro. Descrição vazia não é guardada. */
export function comprovanteMemoryFor(description: string, category: string | null, kind: RecordKind): StoreMemory | null {
  const text = trimEdges(description, ' ').replace(/\s+/g, ' ');
  if (text === '' || [...text].length > DESCRIPTION_MAX) return null;
  return { description: text, category: category && CATEGORIES[kind].includes(category) ? category : null };
}

// ---------------------------------------------------------------------------
// O que a leitura preenche
// ---------------------------------------------------------------------------

export interface ComprovanteFillPlan {
  /** Valor para o campo (reais, "85,00"); null quando o comprovante não traz. */
  amountText: string | null;
  /** Data para o campo (DD/MM/AAAA); '' quando a pessoa precisa escolher o dia. */
  dateText: string;
  /** Primeiro campo que falta: o foco vai para ele. null: nada falta, o teclado fica fechado. */
  focus: 'amountText' | 'dateText' | 'description' | null;
}

/** O que a leitura coloca nos campos e para onde vai o foco: valor, depois dia, depois descrição. */
export function comprovanteFillPlan(draft: ComprovanteDraft, description: string): ComprovanteFillPlan {
  return {
    amountText: draft.amountCents === null ? null : centsToInput(draft.amountCents),
    dateText: draft.occurredOn ? formatDateBR(draft.occurredOn) : '',
    focus: draft.amountCents === null ? 'amountText' : draft.occurredOn === null ? 'dateText' : description.trim() === '' ? 'description' : null,
  };
}

// ---------------------------------------------------------------------------
// "Parece já anotado"
// ---------------------------------------------------------------------------

/** Mesmo valor e data a até este número de dias de um registro que já existe: aviso, sem bloquear. */
export const COMPROVANTE_LOOKALIKE_DAYS = 1;

export interface LookalikeRecord {
  id: string;
  description: string;
  occurredOn: IsoDate;
  amountCents: Cents;
}

/**
 * Registro que já existe com o mesmo tipo, o mesmo valor e a data a até um dia da escolhida (o comprovante não deixa chave no
 * registro, então a duplicidade só se avisa por semelhança). O de data mais próxima vem primeiro; sem valor ou sem data, nada.
 * Quem chama só passa os registros dos meses em volta da data.
 */
export function findLookalikeRecord(
  records: readonly Pick<FinancialRecord, 'id' | 'kind' | 'amountCents' | 'occurredOn' | 'description'>[],
  target: { kind: RecordKind; amountCents: Cents | null; date: IsoDate | null },
): LookalikeRecord | null {
  if (target.amountCents === null || target.date === null) return null;
  let best: { record: LookalikeRecord; gap: number } | null = null;
  for (const r of records) {
    if (r.kind !== target.kind || r.amountCents !== target.amountCents) continue;
    const gap = Math.abs(daysBetween(target.date, r.occurredOn));
    if (gap > COMPROVANTE_LOOKALIKE_DAYS) continue;
    if (best === null || gap < best.gap) best = { record: { id: r.id, description: r.description, occurredOn: r.occurredOn, amountCents: r.amountCents }, gap };
  }
  return best ? best.record : null;
}
