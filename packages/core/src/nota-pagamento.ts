/**
 * Forma de pagamento lida de uma nota fiscal (D-042, pedido de Enzo de 10/10/2026: "Informar se a compra foi no dinheiro, Pix/débito
 * ou cartão de crédito"). Serve à página da Sefaz-RJ (`sefaz-page.ts`, tabela "Forma de pagamento" / "Valor pago" e "Troco") e ao
 * DANFE em PDF (`danfe.ts`, bloco "FORMA DE PAGAMENTO" e códigos `tPag` da NF-e).
 *
 * O QR da NFC-e (versões 2 e 3 e o formato antigo) não traz a forma de pagamento, nem em contingência: o leitor de QR não muda.
 *
 * Só a forma entra no resultado, nunca valores, troco, número de cartão, bandeira nem dado do consumidor. A leitura procura o
 * rótulo "Forma de pagamento" e olha só o trecho curto que vem depois dele, parando em "Troco", nas informações gerais, no bloco do
 * consumidor e em outras seções. Sem o rótulo, ou sem forma conhecida logo depois, o resultado é vazio ("se não houver, nada").
 *
 * Sem `normalize`, lookbehind, grupos nomeados nem `\p{}`: o Hermes (iOS e Android) tem suporte parcial.
 */

export type PaymentForm = 'dinheiro' | 'credito' | 'debito' | 'pix' | 'vale' | 'outros';

export const PAYMENT_FORMS: readonly PaymentForm[] = ['dinheiro', 'credito', 'debito', 'pix', 'vale', 'outros'];

/** Como a forma aparece no bloco "Nota lida". */
export const PAYMENT_FORM_LABEL: Readonly<Record<PaymentForm, string>> = {
  dinheiro: 'Dinheiro',
  credito: 'Cartão de crédito',
  debito: 'Cartão de débito',
  pix: 'Pix',
  vale: 'Vale',
  outros: 'Outra forma de pagamento',
};

/**
 * Códigos `tPag` da NF-e (tabela da Nota Técnica do leiaute 4.00) para a forma do app. `null`: "Sem pagamento" (90), que não é
 * uma forma. 18 (transferência bancária e carteira digital) e os demais entram em "outros", porque o app não sabe se a conta saiu
 * do débito, do Pix ou do saldo de uma carteira.
 */
const TPAG: Readonly<Record<string, PaymentForm | null>> = {
  '01': 'dinheiro',
  '02': 'outros',
  '03': 'credito',
  '04': 'debito',
  '05': 'outros',
  '10': 'vale',
  '11': 'vale',
  '12': 'vale',
  '13': 'vale',
  '14': 'outros',
  '15': 'outros',
  '16': 'outros',
  '17': 'pix',
  '18': 'outros',
  '19': 'outros',
  '20': 'pix',
  '21': 'outros',
  '22': 'outros',
  '90': null,
  '99': 'outros',
};

/** Forma do código `tPag` ("01", "03", "17"...); `null` quando o código não é conhecido ou é "Sem pagamento". */
export function paymentFormFromCode(code: string): PaymentForm | null {
  return TPAG[code.trim()] ?? null;
}

const ACCENTS: Record<string, string> = {
  á: 'a', à: 'a', â: 'a', ã: 'a', ä: 'a', é: 'e', è: 'e', ê: 'e', ë: 'e', í: 'i', ì: 'i', î: 'i', ï: 'i',
  ó: 'o', ò: 'o', ô: 'o', õ: 'o', ö: 'o', ú: 'u', ù: 'u', û: 'u', ü: 'u', ç: 'c',
};

/** Minúsculas e sem acento, para comparar rótulos escritos de jeitos diferentes ("Cartão de Crédito", "CARTAO DE CREDITO"). */
function plain(text: string): string {
  return text.toLowerCase().replace(/[à-ü]/g, (ch) => ACCENTS[ch] ?? ch);
}

/**
 * Palavras que marcam uma forma, em ordem de especificidade. "Crédito Loja" e "Crédito Virtual" não são cartão de crédito; "Sem
 * pagamento" não é forma.
 */
const FORM_WORDS: { form: PaymentForm | null; re: string }[] = [
  { form: null, re: 'sem\\s+pagamento' },
  { form: 'outros', re: 'credito\\s+(?:em\\s+)?(?:loja|virtual)' },
  { form: 'credito', re: 'cartao\\s+(?:de\\s+)?credito|\\bcredito\\b' },
  { form: 'debito', re: 'cartao\\s+(?:de\\s+)?debito|\\bdebito\\b' },
  { form: 'dinheiro', re: '\\bdinheiro\\b' },
  { form: 'pix', re: '\\bpix\\b|pagamento\\s+instantaneo' },
  { form: 'vale', re: '\\bvale\\b' },
  { form: 'outros', re: '\\boutros?\\b|\\bcheque\\b|\\bboleto\\b|deposito\\s+bancario|transferencia\\s+bancaria|carteira\\s+digital|fidelidade|\\bcashback\\b' },
];

/** Onde a leitura da forma para: troco, informações gerais, consumidor e as seções que vêm depois do pagamento. */
const STOP = new RegExp(
  [
    'troco',
    'informa[cç]',
    'consumidor',
    'destinat',
    'chave\\s+de\\s+acesso',
    'tributos',
    'transportador',
    'dados\\s+(?:adicionais|dos)',
    'calculo',
    'protocolo',
    'fatura',
    'emissao',
    'numero',
    'serie',
  ]
    .join('|')
    .replace(/ç/g, 'c'),
  'i',
);

/** Quantos caracteres depois do rótulo "Forma de pagamento" a leitura olha (a tabela é curta: uma ou duas formas). */
const WINDOW_CHARS = 260;

const HEADER = /forma(?:s)?\s+de\s+pagamento|forma\s+pagamento|meio\s+de\s+pagamento|\btpag\b/gi;

/** Quantos rótulos "Forma de pagamento" a leitura segue (um cupom tem um; o limite protege de texto hostil repetido). */
const MAX_HEADERS = 8;

/**
 * Formas na ordem em que aparecem num trecho já sem acento e em minúsculas. `codeText` (os códigos `tPag`) é o mesmo trecho sem a
 * última linha, quando ela pode estar cortada, ou `null` quando os códigos não são lidos.
 */
function formsIn(windowText: string, codeText: string | null): PaymentForm[] {
  const hits: { at: number; form: PaymentForm | null }[] = [];
  // Trechos já lidos: "Crédito Loja" vira "outros" e o "crédito" dentro dele não conta de novo como cartão. Uma marca por caractere
  // deixa o teste de sobreposição linear no tamanho do trecho.
  const used = new Uint8Array(windowText.length);
  for (const { form, re } of FORM_WORDS) {
    const g = new RegExp(re, 'g');
    let m: RegExpExecArray | null;
    while ((m = g.exec(windowText)) !== null) {
      const from = m.index;
      const to = from + m[0].length;
      let taken = false;
      for (let i = from; i < to; i++) {
        if (used[i] === 1) {
          taken = true;
          break;
        }
      }
      if (taken) continue;
      used.fill(1, from, to);
      hits.push({ at: from, form });
    }
  }
  if (codeText !== null) {
    // Código logo depois do rótulo ("tPag: 03", "Forma de pagamento 17"). Não é código o que parece data, valor, número com
    // barra ou ponto, nem "10x" (parcelas).
    const leading = /^[\s:=-]*(\d{2})(?![\d,./x])/.exec(codeText);
    if (leading && leading[1]! in TPAG) hits.push({ at: leading.index, form: TPAG[leading[1]!] ?? null });
    // Código sozinho na linha (só se a linha termina em quebra de linha de verdade) ou "03 - Cartão de crédito".
    const codes = /(?:^|\n)[ \t]*(\d{2})[ \t]*(?=\n)|(?:^|\s)(\d{2})\s*-\s*(?=[a-z])/g;
    let m: RegExpExecArray | null;
    while ((m = codes.exec(codeText)) !== null) {
      const code = m[1] ?? m[2] ?? '';
      // "Parcelas" ou "Quantidade" na linha de cima: o número é contagem, não código.
      const before = codeText.slice(codeText.lastIndexOf('\n', m.index - 1) + 1, m.index);
      if (m[1] !== undefined && /parcela|quantidade|\bqtd/.test(before)) continue;
      if (code in TPAG) hits.push({ at: m.index, form: TPAG[code] ?? null });
    }
  }
  hits.sort((a, b) => a.at - b.at);
  const out: PaymentForm[] = [];
  for (const h of hits) if (h.form !== null && !out.includes(h.form)) out.push(h.form);
  return out;
}

/**
 * As formas de pagamento que o texto da nota traz logo depois do rótulo "Forma de pagamento" (a página da Sefaz e o DANFE).
 * `text` pode ter quebras de linha; a leitura é tolerante com maiúsculas, acentos, "Forma de pagamento: Dinheiro" na mesma linha ou
 * em linhas separadas, e com os códigos `tPag` quando `withCodes`. Vazio quando não há o rótulo ou nenhuma forma conhecida depois
 * dele. Sem o rótulo nada é lido: um "Pix" no meio do texto de outra seção (nome da loja, produto) nunca vira forma.
 *
 * Os códigos `tPag` só valem em linha inteira: quando o trecho foi cortado pelo limite de caracteres ou por uma palavra de parada
 * ("Número", "Troco"), a última linha pode estar pela metade e não é lida como código ("12/10/2026" cortado em "12").
 */
export function paymentFormsFromText(text: string, options: { withCodes?: boolean } = {}): PaymentForm[] {
  if (typeof text !== 'string' || text === '') return [];
  const p = plain(text);
  const withCodes = options.withCodes === true;
  const out: PaymentForm[] = [];
  const re = new RegExp(HEADER.source, 'gi');
  let h: RegExpExecArray | null;
  let headers = 0;
  while (headers < MAX_HEADERS && (h = re.exec(p)) !== null) {
    headers++;
    const start = h.index + h[0].length;
    let windowText = p.slice(start, start + WINDOW_CHARS);
    let cut = start + WINDOW_CHARS < p.length;
    const stop = STOP.exec(windowText);
    if (stop) {
      windowText = windowText.slice(0, stop.index);
      cut = true;
    }
    // O próximo rótulo só é procurado depois do trecho já lido: cada caractere é lido uma vez.
    re.lastIndex = start + windowText.length;
    const codeText = withCodes ? (cut ? windowText.slice(0, windowText.lastIndexOf('\n') + 1) : windowText) : null;
    for (const form of formsIn(windowText, codeText)) if (!out.includes(form)) out.push(form);
  }
  return out;
}

/** Sem repetição, na ordem; ignora o que não é forma conhecida. */
export function uniquePaymentForms(forms: readonly PaymentForm[] | null | undefined): PaymentForm[] {
  const out: PaymentForm[] = [];
  for (const f of forms ?? []) if (PAYMENT_FORMS.includes(f) && !out.includes(f)) out.push(f);
  return out;
}

/** A escolha de "Como você pagou?" que a nota indica: cartão de crédito, "Dinheiro, débito ou Pix" ou nenhuma (não pré-seleciona). */
export type PaymentChoice = 'cartao' | 'dinheiro' | null;

/**
 * Pré-seleção de "Como você pagou?" (D-042): cartão de crédito leva a "Cartão de crédito"; dinheiro, débito, Pix e vale levam a
 * "Dinheiro, débito ou Pix". Mais de uma forma, "outra forma" ou nenhuma forma conhecida: a nota não escolhe pela pessoa.
 */
export function paymentChoiceFor(forms: readonly PaymentForm[]): PaymentChoice {
  const list = uniquePaymentForms(forms);
  if (list.length !== 1) return null;
  const only = list[0]!;
  if (only === 'credito') return 'cartao';
  if (only === 'outros') return null;
  return 'dinheiro';
}

export const NOTA_PAYMENT_TEXT = {
  /** Mais de uma forma na nota (ex.: parte em dinheiro, parte no cartão). */
  multiple: 'Pagamento em mais de uma forma',
  /** A nota diz cartão de crédito e a pessoa ainda não cadastrou nenhum cartão. */
  creditNoCard: 'A nota diz cartão de crédito. Cadastre o cartão para anotar a compra na fatura.',
  /** "Salvar compra" com cartão de crédito escolhido e nenhum cartão cadastrado. */
  noCardToSave: 'Para anotar a compra no cartão de crédito, cadastre o cartão. Ou escolha Dinheiro, débito ou Pix.',
  /** Logo abaixo de "Como você pagou?" quando a nota escolheu. */
  fromNote: (form: PaymentForm): string => `A nota informa: ${PAYMENT_FORM_LABEL[form]}. Mude se você pagou de outro jeito.`,
} as const;

/** "Pix", "Cartão de crédito" ou "Pagamento em mais de uma forma"; null quando a nota não traz a forma. */
export function paymentSummary(forms: readonly PaymentForm[]): string | null {
  const list = uniquePaymentForms(forms);
  if (list.length === 0) return null;
  return list.length > 1 ? NOTA_PAYMENT_TEXT.multiple : PAYMENT_FORM_LABEL[list[0]!];
}
