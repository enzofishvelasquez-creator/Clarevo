import type { IsoDate, IsoMonth } from './dates';
import { formatDateBR, formatMonthYearBR } from './dates';
import type { AccessKeyInfo, ReceiptDraft, ReceiptFacts } from './nota';
import { NOTA_TEXT } from './nota';
import { paymentSummary } from './nota-pagamento';
import { canReadSefazPage } from './sefaz-page';
import { sha256Hex } from './sha256';
import { CATEGORIES } from './records';
import { centsToInput, formatBRL } from './money';
import { DESCRIPTION_MAX } from './validation';

/**
 * Regras do preenchimento de "Anotar gasto" a partir de uma nota fiscal (Ciclo E, D-038, passo 3 do app): o que a leitura
 * preenche e onde fica o foco, a descrição ("Como da última vez nesta loja"), as mensagens de valor e dia que faltam, a
 * escolha da folha "Escanear nota fiscal" e o reconhecimento do código de um boleto. Tudo puro, sem tela.
 *
 * Privacidade: a "memória da loja" (descrição e categoria da última nota da mesma loja) é guardada só neste aparelho, por
 * pessoa, e usa o resumo do CNPJ da loja como chave. Nunca vai ao servidor, nunca guarda a chave de acesso nem CPF.
 */

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

export const NOTA_FLOW_TEXT = {
  /** Linha de "Escanear nota fiscal" no topo de Anotar gasto. */
  scanLineHint: 'Cupom do mercado ou PDF de compra on-line',
  scanLineA11y: 'Escanear nota fiscal. Cupom do mercado ou PDF de compra on-line.',
  /** Folha do primeiro toque. */
  sheetTitle: 'Como você quer ler a nota?',
  /** Antes de pedir a câmera pela primeira vez. */
  cameraIntro: 'O Clarevo usa a câmera só para ler o código da nota. Nenhuma foto é guardada.',
  cameraAim: 'Aponte para o QR code no rodapé do cupom. Compra on-line: o código de barras do DANFE.',
  /** Depois de uns 5 segundos sem ler (D-042): chegar mais perto, até o QR ocupar a moldura. */
  cameraCloser: 'Aproxime até o QR ocupar a moldura.',
  cameraStarting: 'Abrindo a câmera…',
  cameraUnavailable: 'Não conseguimos usar a câmera neste aparelho. Você pode escolher o PDF da nota ou colar o link ou a chave.',
  cameraDeniedHelp: 'Para usar a câmera, permita o acesso nos ajustes do aparelho. Você também pode escolher o PDF da nota ou colar o link ou a chave.',
  torchOn: 'Ligar a lanterna',
  torchOff: 'Desligar a lanterna',
  back: 'Voltar',
  /** Código lido pela câmera que não é de nota (continua procurando). */
  notReceiptKeepLooking: 'Esse código não é de uma nota fiscal. Aponte para o QR code do cupom ou para o código de barras da chave.',
  pasteTitle: 'Colar o link ou a chave',
  pasteSubmit: 'Ler a nota',
  pdfWorking: 'Lendo o PDF aqui no aparelho…',
  /** O bloco depois da leitura. */
  readTitle: 'Nota lida',
  readAgain: 'Ler outra nota',
  undoRead: 'Desfazer leitura',
  /** Descrição e categoria vindas da última nota da mesma loja. */
  lastTimeLegend: 'Como da última vez nesta loja',
  storeNameLegend: 'Nome da loja lido da nota',
  descriptionPlaceholder: 'Ex.: Mercado',
  /** Valor ou dia que o código não traz (a leitura não falhou). */
  missingValue: 'O valor não vem no código desta nota. Digite o total impresso no cupom.',
  missingDay: (month: IsoMonth): string => `O dia da compra não vem no código desta nota. Escolha o dia em ${formatMonthYearBR(month)}.`,
  dayAssumed: 'O dia da compra não vem no código desta nota. Usamos o de hoje. Mude se foi outro dia.',
  otherMonth: (month: IsoMonth): string => `A nota é de ${formatMonthYearBR(month)}. A data escolhida é de outro mês.`,
  /** NF-e (modelo 55) sem dados da loja além do CNPJ. */
  cnpjOnly: 'O código traz o CNPJ da loja, não o nome. Digite o nome na descrição.',
  /** Na web, nota do RJ com QR online: valor e data só vêm da página da Sefaz, que o celular lê. */
  phoneReads: 'No celular, o Clarevo lê o valor e a data na página da Sefaz.',
  /** Boleto colado no lugar da chave. */
  boleto: 'Este é o código de um boleto. Para anotar uma conta que ainda vai vencer, use Anotar conta a pagar.',
  boletoAction: 'Anotar conta a pagar',
  /** Nota repetida: o aviso fica no topo do bloco e o salvamento continua possível só em outra nota. */
  alreadyNotedSave: 'Esta nota já está anotada. Abra o registro para conferir ou leia outra nota.',
  /** O link para a Sefaz não fica guardado (privacidade): só vale logo depois da leitura e do salvamento. */
  detailRow: 'Nota fiscal',
  detailRowValue: 'Anotada com a leitura da nota',
  detailNoLink: 'Guardamos só um resumo da chave da nota, não o link. O botão para ver a nota no site da Sefaz aparece logo depois de anotar uma nota lida pelo QR.',
  /** Dica de tela larga/computador. */
  webPdfFirst: 'No computador, o PDF da nota costuma ser o caminho mais fácil.',
  /** Mensagens de carregamento e falha do PDF e da câmera, em voz de aviso (sem alerta). */
  openFailed: 'Não foi possível abrir o endereço da Sefaz agora. Tente de novo mais tarde.',
} as const;

/**
 * Câmera da leitura (D-042). Foco: o `expo-camera` 57.0.6 deixa o foco contínuo ligado quando `autofocus` não é passado (iOS) e
 * é o padrão do CameraX (Android); `autofocus="on"` faz um foco só e o trava, e no Android mede o ponto do canto da tela, por isso
 * não é usado. Não existe "toque para focar" nessa versão. O que o app faz: zoom inicial leve (10% do máximo do aparelho, para QR
 * pequeno), moldura quadrada ao centro, dica de aproximar depois de 5 s e a da lanterna depois de 10 s. Nenhuma foto é guardada.
 */
export const NOTA_CAMERA = { zoom: 0.1, closerHintMs: 5_000, torchHintMs: 10_000 } as const;

/** Tempo máximo da leitura de um PDF no aparelho (arquivo, texto e conferência). Passou disso, vale NOTA_TEXT.pdf.failed. */
export const PDF_READ_TIMEOUT_MS = 25_000;

/**
 * Espera `work` por no máximo `ms`. Passou o tempo, devolve `'tempo'` e chama `onTimeout` (para destruir a tarefa em andamento);
 * o resultado tardio de `work` é ignorado e uma falha tardia dele não vira erro solto. Nunca lança por causa de `work`: falha vira `'erro'`.
 */
export async function raceWithTimeout<T>(work: Promise<T>, ms: number, onTimeout?: () => void): Promise<{ value: T } | 'tempo' | 'erro'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'tempo'>((resolve) => {
    timer = setTimeout(() => {
      try {
        onTimeout?.();
      } catch {
        // Destruir a tarefa é só um favor ao aparelho.
      }
      resolve('tempo');
    }, ms);
  });
  const settled = work.then(
    (value) => ({ value }),
    () => 'erro' as const,
  );
  try {
    return await Promise.race([settled, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Folha "Escanear nota fiscal"
// ---------------------------------------------------------------------------

export type ScanOption = 'camera' | 'pdf' | 'colar';

/**
 * Opções da folha do primeiro toque, na ordem. Com câmera: câmera, PDF, colar. Sem câmera (computador, aparelho sem câmera):
 * o PDF vem primeiro, porque o e-mail com o DANFE costuma estar no próprio computador.
 */
export function scanSheetOptions(cameraAvailable: boolean): ScanOption[] {
  return cameraAvailable ? ['camera', 'pdf', 'colar'] : ['pdf', 'colar'];
}

export function scanOptionLabel(option: ScanOption): string {
  return NOTA_TEXT.sheet[option === 'colar' ? 'paste' : option];
}

// ---------------------------------------------------------------------------
// Descrição e categoria
// ---------------------------------------------------------------------------

/** Descrição e categoria da última nota anotada da mesma loja neste aparelho. */
export interface StoreMemory {
  description: string;
  category: string | null;
}

/** Chave da memória da loja: o resumo do CNPJ do emitente. null quando o emitente é pessoa física (sem CNPJ, sem memória). */
export function storeMemoryId(key: Pick<AccessKeyInfo, 'cnpj'>): string | null {
  return key.cnpj ? sha256Hex(`loja:${key.cnpj}`) : null;
}

function fitText(text: string, max: number): string {
  const chars = [...text.trim()];
  if (chars.length <= max) return chars.join('');
  const cut = chars.slice(0, max).join('');
  const space = cut.lastIndexOf(' ');
  return (space > max / 2 ? cut.slice(0, space) : cut).trim();
}

/** O que guardar depois de salvar a nota: descrição (1 a 80) e categoria do app. Descrição vazia não é guardada. */
export function storeMemoryFor(description: string, category: string | null): StoreMemory | null {
  const text = description.trim().replace(/\s+/g, ' ');
  if (text === '' || [...text].length > DESCRIPTION_MAX) return null;
  return { description: text, category: category && CATEGORIES.despesa.includes(category) ? category : null };
}

export interface DescriptionSuggestion {
  description: string;
  category: string | null;
  source: 'ultima_vez' | 'nome_da_loja' | 'em_branco';
  /** Legenda curta sob o campo ("Como da última vez nesta loja"); null quando não há. */
  legend: string | null;
  placeholder: string;
}

/**
 * Descrição sugerida ao ler uma nota (nunca "Compra (CNPJ ...)", que apareceria assim em Movimentos):
 * 1. a mesma loja já foi anotada neste aparelho: repete descrição e categoria da última vez, com a legenda;
 * 2. o nome da loja é conhecido (página da Sefaz ou DANFE): usa o nome;
 * 3. senão, fica em branco com a dica "Ex.: Mercado" (e tocar numa categoria com a descrição vazia a preenche, `descriptionAfterCategory`).
 */
export function suggestDescription(input: { issuerName: string | null; lastTime: StoreMemory | null }): DescriptionSuggestion {
  const last = input.lastTime;
  if (last && last.description.trim() !== '') {
    return {
      description: fitText(last.description, DESCRIPTION_MAX),
      category: last.category && CATEGORIES.despesa.includes(last.category) ? last.category : null,
      source: 'ultima_vez',
      legend: NOTA_FLOW_TEXT.lastTimeLegend,
      placeholder: NOTA_FLOW_TEXT.descriptionPlaceholder,
    };
  }
  const name = input.issuerName?.trim() ?? '';
  if (name !== '') {
    return {
      description: fitText(name, DESCRIPTION_MAX),
      category: null,
      source: 'nome_da_loja',
      legend: NOTA_FLOW_TEXT.storeNameLegend,
      placeholder: NOTA_FLOW_TEXT.descriptionPlaceholder,
    };
  }
  return { description: '', category: null, source: 'em_branco', legend: null, placeholder: NOTA_FLOW_TEXT.descriptionPlaceholder };
}

/**
 * Tocar numa categoria com a descrição vazia preenche a descrição com o nome dela (só depois de ler uma nota que não trouxe o
 * nome da loja). Com texto na descrição, ou sem categoria, não muda nada.
 */
export function descriptionAfterCategory(description: string, category: string | null): string {
  return description.trim() === '' && category ? category : description;
}

// ---------------------------------------------------------------------------
// O que a leitura preenche
// ---------------------------------------------------------------------------

/** A data que a própria nota informa (a de hoje, usada quando só o mês é conhecido, não conta). */
export function noteIssuedOn(facts: Pick<ReceiptFacts, 'issuedOn'>, draft: Pick<ReceiptDraft, 'month'>, today: IsoDate): IsoDate | null {
  const d = facts.issuedOn;
  return d && d.slice(0, 7) === draft.month && d <= today ? d : null;
}

/**
 * "Nota lida: Mercado Exemplo · RJ · R$ 87,40 · 06/10/2026 · Pix" (D-042: loja, valor, data e forma de pagamento, quando a leitura
 * os traz) ou "Nota lida: CNPJ 11.222.333/0001-81 · RJ · outubro de 2026" (só o que o código dá). A tela passa o texto por
 * `MoneyTxt`, então o valor respeita "Ocultar valores".
 */
export function noteReadLine(draft: ReceiptDraft, issuedOn: IsoDate | null): string {
  const store = draft.issuerName ?? (draft.issuerCnpj ? `CNPJ ${draft.issuerCnpj}` : null);
  const when = issuedOn ? formatDateBR(issuedOn) : formatMonthYearBR(draft.month);
  const amount = draft.amountCents === null ? null : formatBRL(draft.amountCents);
  return `${NOTA_FLOW_TEXT.readTitle}: ${[store, draft.uf, amount, when, paymentSummary(draft.payments)].filter(Boolean).join(' · ')}`;
}

/**
 * Na web, a nota do RJ com QR online não traz valor nem data (a página da Sefaz só é lida no celular): o bloco diz onde a leitura
 * completa acontece. Só quando falta o valor ou o dia, só para a nota que o celular leria, e só onde a leitura não está disponível.
 */
export function sefazPhoneHint(draft: ReceiptDraft, issuedOn: IsoDate | null, readUnavailable: boolean): string | null {
  if (!readUnavailable || !canReadSefazPage(draft)) return null;
  return draft.amountCents === null || issuedOn === null ? NOTA_FLOW_TEXT.phoneReads : null;
}

export interface NoteGaps {
  /** O valor não vem na nota (a pessoa digita o total do cupom). */
  amount: string | null;
  /** O dia não vem na nota e não dá para supor: a pessoa escolhe. */
  day: string | null;
  /** O dia não vem na nota; a data de hoje foi usada porque a nota é do mês atual. */
  dayAssumed: string | null;
  /** Só o CNPJ da loja é conhecido (sem o nome). */
  storeName: string | null;
}

/** As mensagens do que a nota não trouxe, para a leitura não parecer falha. */
export function noteGaps(draft: ReceiptDraft, issuedOn: IsoDate | null): NoteGaps {
  return {
    amount: draft.amountCents === null ? NOTA_FLOW_TEXT.missingValue : null,
    day: draft.needsDay ? NOTA_FLOW_TEXT.missingDay(draft.month) : null,
    dayAssumed: !draft.needsDay && issuedOn === null ? NOTA_FLOW_TEXT.dayAssumed : null,
    storeName: draft.issuerName === null && draft.issuerCnpj !== null ? NOTA_FLOW_TEXT.cnpjOnly : null,
  };
}

export interface NoteFillPlan {
  /** Valor para o campo (reais, "87,40"); null quando a nota não traz. */
  amountText: string | null;
  /** Data para o campo (DD/MM/AAAA); '' quando a pessoa precisa escolher o dia. */
  dateText: string;
  /** Primeiro campo que falta: o foco vai para ele. null: nada falta, o teclado fica fechado. */
  focus: 'amountText' | 'dateText' | null;
}

/** O que a leitura coloca nos campos e para onde vai o foco (primeiro o valor, depois o dia). */
export function noteFillPlan(draft: ReceiptDraft): NoteFillPlan {
  return {
    amountText: draft.amountCents === null ? null : centsToInput(draft.amountCents),
    dateText: draft.occurredOn ? formatDateBR(draft.occurredOn) : '',
    focus: draft.amountCents === null ? 'amountText' : draft.needsDay ? 'dateText' : null,
  };
}

/** A data escolhida está fora do mês da nota (aviso leve, não bloqueia). */
export function dateOutsideNoteMonth(date: IsoDate | null, month: IsoMonth): string | null {
  return date !== null && date.slice(0, 7) !== month ? NOTA_FLOW_TEXT.otherMonth(month) : null;
}

// ---------------------------------------------------------------------------
// Boleto no lugar da chave
// ---------------------------------------------------------------------------

function digitsOnly(raw: string): string | null {
  const compact = raw.replace(/[\s.\-]/g, '');
  return /^\d+$/.test(compact) ? compact : null;
}

function digits(text: string): number[] {
  return [...text].map((c) => c.charCodeAt(0) - 48);
}

/** Módulo 10 do boleto: pesos 2 e 1 da direita para a esquerda, soma dos algarismos dos produtos. */
function mod10Digit(text: string): number {
  let sum = 0;
  const d = digits(text);
  for (let i = d.length - 1, w = 2; i >= 0; i--, w = w === 2 ? 1 : 2) {
    const p = d[i]! * w;
    sum += p > 9 ? p - 9 : p;
  }
  return (10 - (sum % 10)) % 10;
}

/** Módulo 11 do boleto bancário: pesos de 2 a 9 da direita para a esquerda; resto 0, 10 ou 11 vira 1. */
function mod11BankDigit(text: string): number {
  let sum = 0;
  const d = digits(text);
  for (let i = d.length - 1, w = 2; i >= 0; i--, w = w === 9 ? 2 : w + 1) sum += d[i]! * w;
  const r = 11 - (sum % 11);
  return r === 0 || r === 10 || r === 11 ? 1 : r;
}

/** Módulo 11 de arrecadação (contas de consumo e tributos): resto 0 ou 1 vira 0; resto 10 vira 1. */
function mod11CollectionDigit(text: string): number {
  let sum = 0;
  const d = digits(text);
  for (let i = d.length - 1, w = 2; i >= 0; i--, w = w === 9 ? 2 : w + 1) sum += d[i]! * w;
  const r = sum % 11;
  return r === 0 || r === 1 ? 0 : 11 - r;
}

function collectionDigit(identifier: string, text: string): number {
  return identifier === '6' || identifier === '7' ? mod10Digit(text) : mod11CollectionDigit(text);
}

function bankBarcodeValid(code: string): boolean {
  return code.length === 44 && code[3] === '9' && mod11BankDigit(code.slice(0, 4) + code.slice(5)) === Number(code[4]);
}

function collectionBarcodeValid(code: string): boolean {
  return code.length === 44 && code[0] === '8' && /^[6-9]$/.test(code[2]!) && collectionDigit(code[2]!, code.slice(0, 3) + code.slice(4)) === Number(code[3]);
}

function bankLineValid(line: string): boolean {
  if (line.length !== 47 || line[3] !== '9') return false;
  const f1 = line.slice(0, 9);
  const f2 = line.slice(10, 20);
  const f3 = line.slice(21, 31);
  if (mod10Digit(f1) !== Number(line[9]) || mod10Digit(f2) !== Number(line[20]) || mod10Digit(f3) !== Number(line[31])) return false;
  const barcode = line.slice(0, 4) + line[32] + line.slice(33) + line.slice(4, 9) + f2 + f3;
  return bankBarcodeValid(barcode);
}

function collectionLineValid(line: string): boolean {
  if (line.length !== 48 || line[0] !== '8' || !/^[6-9]$/.test(line[2]!)) return false;
  let barcode = '';
  for (let i = 0; i < 4; i++) {
    const block = line.slice(i * 12, i * 12 + 12);
    if (collectionDigit(line[2]!, block.slice(0, 11)) !== Number(block[11])) return false;
    barcode += block.slice(0, 11);
  }
  return collectionBarcodeValid(barcode);
}

/**
 * O texto é o código de um boleto (código de barras de 44 dígitos, linha digitável de 47 ou, em contas de consumo e tributos,
 * de 48)? Confere os dígitos verificadores de cada tipo, então um número qualquer de 44 dígitos não é tomado por boleto, e a
 * chave de uma nota fiscal (que tem 44 dígitos e UF, mês, CNPJ e dígito próprios) vale como chave: quem chama tenta a chave
 * primeiro (`readReceiptCode`) e só pergunta pelo boleto quando a leitura da nota falha.
 */
export function looksLikeBoleto(raw: string): boolean {
  if (typeof raw !== 'string' || raw.length > 80) return false;
  const code = digitsOnly(raw.trim());
  if (code === null) return false;
  if (code.length === 44) return bankBarcodeValid(code) || collectionBarcodeValid(code);
  if (code.length === 47) return bankLineValid(code);
  if (code.length === 48) return collectionLineValid(code);
  return false;
}
