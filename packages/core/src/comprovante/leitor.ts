import type { IsoDate } from '../dates';
import type { Cents } from '../money';
import { holeriteReading, looksLikeHolerite } from './holerite';
import type { ComprovanteDirection, ComprovanteKind, ComprovanteOptions, ComprovanteReading, ComprovanteResult } from './tipos';
import { cleanMessage, cleanPersonName, cleanText, fold, isDigit, isLetter, scanDate, scanMoney, scanTime, toLines, trimEdges } from './texto';

/**
 * Leitor tolerante do texto de comprovantes de Pix e de pagamento em PDF (Ciclo I2, D-051), no formato típico dos bancos
 * brasileiros e sem marca nenhuma. O app extrai o texto do PDF no aparelho (`lib/pdf-text.ts`) e o entrega a `comprovanteFromText`.
 *
 * O que sai: tipo (Pix, TED, boleto, débito), direção (saiu ou entrou), valor, data e hora do pagamento, o nome da outra ponta e a
 * mensagem. O que NUNCA sai: CPF e CNPJ (inteiros ou mascarados), chave Pix, instituição, agência, conta, ID da transação (E2E
 * id), código de autenticação, protocolo, número de cartão e o texto original. Os rótulos desses dados são conhecidos e o valor
 * deles é lido só para ser jogado fora (o leitor não os guarda em lugar nenhum). O nome passa por `cleanPersonName`, que corta
 * qualquer documento que venha na mesma linha.
 *
 * Como lê. O texto vira linhas. Uma linha começa por um rótulo conhecido ("Valor", "Pago para", "Recebido de", "Destino",
 * "Origem", "Quem recebeu", "Quem pagou", "Tipo de transferência"...) ou é texto solto. O valor vem depois do rótulo, na mesma linha ou
 * na linha seguinte; linhas longas (texto sem quebra) são cortadas nos rótulos que trazem. "Destino" e "Origem" (e as variações) abrem
 * uma seção: o "Nome" que vem depois pertence a ela. Tipo e direção vêm das expressões do título ("Pix enviado", "Pix recebido",
 * "Você pagou", "Transferência recebida"...); sem elas, de rótulos que só um lado traz ("Pago para" sozinho, "Recebido de" sozinho);
 * sem isso, do padrão que a tela deu (`defaultDirection`), marcado em `directionGuessed`.
 *
 * Tempo linear: o texto é cortado em `COMPROVANTE_TEXT_MAX`, linhas e tamanho de linha têm teto, cada posição do texto tenta no
 * máximo os rótulos que começam pela mesma letra e as expressões regulares só veem trechos de poucos caracteres.
 */

type LabelId = 'valor' | 'ignora' | 'data' | 'hora' | 'tipo' | 'destino' | 'origem' | 'nomeDestino' | 'nomeOrigem' | 'nome' | 'mensagem' | 'descarte';

interface LabelSpec {
  id: LabelId;
  /** Rótulo sem acento e em minúsculas. */
  phrase: string;
  /** Valor: 1 (total pago), 2 (valor), 3 (valor do documento). */
  rank: number;
  /** Pode começar no meio de uma linha longa (texto sem quebra). */
  inline: boolean;
  /** Só vale sozinho na linha ou seguido de dois pontos ("Para", "De"). */
  alone: boolean;
}

const LABELS: LabelSpec[] = [];

function add(id: LabelId, phrases: string[], o: { rank?: number; inline?: boolean; alone?: boolean } = {}): void {
  for (const phrase of phrases) LABELS.push({ id, phrase, rank: o.rank ?? 2, inline: o.inline ?? true, alone: o.alone ?? false });
}

add('valor', ['valor pago', 'valor total', 'valor cobrado', 'valor debitado', 'total pago'], { rank: 1 });
add('valor', ['valor', 'valor da transferencia', 'valor do pix', 'valor do pagamento', 'valor da transacao', 'valor transferido', 'valor enviado', 'valor recebido', 'valor da operacao', 'valor a pagar', 'quantia', 'montante']);
add('valor', ['valor do documento', 'valor nominal', 'valor original', 'valor do boleto'], { rank: 3 });
add('ignora', ['valor da tarifa', 'valor do iof', 'valor de juros', 'valor da multa', 'valor do desconto', 'valor dos encargos', 'valor do abatimento', 'saldo anterior', 'saldo atual']);
add('ignora', ['tarifa', 'taxa', 'juros', 'multa', 'desconto', 'encargos', 'abatimento', 'iof', 'saldo', 'limite'], { inline: false });
add('data', [
  'data e hora', 'data/hora', 'data e horario', 'data da transferencia', 'data do pagamento', 'data de pagamento', 'data da transacao', 'data da operacao',
  'data de efetivacao', 'data do pix', 'data da realizacao', 'data do recebimento', 'data de recebimento', 'data', 'realizado em', 'pago em',
  'efetivado em', 'enviado em', 'recebido em', 'transferido em',
]);
add('hora', ['hora', 'horario', 'hora da transferencia', 'hora do pagamento']);
add('tipo', ['tipo de transferencia', 'tipo de pagamento', 'tipo de transacao', 'tipo de operacao', 'tipo de pix']);
add('tipo', ['tipo'], { inline: false });
add('destino', [
  'destino', 'destinatario', 'favorecido', 'beneficiario', 'recebedor', 'quem recebeu', 'dados de quem recebeu', 'dados do favorecido',
  'dados do destinatario', 'dados do recebedor', 'dados do beneficiario', 'dados do destino', 'pago para', 'pagou para', 'enviado para',
  'transferido para', 'transferencia para', 'estabelecimento',
]);
add('destino', ['para'], { inline: false, alone: true });
add('origem', [
  'origem', 'remetente', 'pagador', 'quem pagou', 'quem enviou', 'dados de quem pagou', 'dados de quem enviou', 'dados do pagador',
  'dados do remetente', 'dados da origem', 'recebido de', 'recebeu de', 'enviado por', 'pago por',
]);
add('origem', ['de'], { inline: false, alone: true });
add('nomeDestino', ['nome do favorecido', 'nome do recebedor', 'nome do destinatario', 'nome de quem recebeu', 'nome do beneficiario']);
add('nomeOrigem', ['nome do pagador', 'nome de quem pagou', 'nome do remetente', 'nome de quem enviou']);
add('nome', ['nome', 'nome completo', 'razao social', 'nome/razao social', 'nome / razao social', 'nome social']);
add('mensagem', [
  'descricao', 'mensagem', 'descricao do pagamento', 'descricao da transferencia', 'descricao do pix', 'mensagem opcional', 'mensagem para o recebedor',
  'mensagem para o destinatario', 'mensagem do pagador', 'observacao', 'observacoes', 'informacoes adicionais', 'campo livre', 'motivo',
]);
// Rótulos de dados que nunca saem do leitor: o valor é lido só para não ser tomado por outra coisa.
add('descarte', [
  'cpf', 'cnpj', 'cpf/cnpj', 'cpf / cnpj', 'cnpj/cpf', 'cpf ou cnpj', 'numero do documento', 'chave pix', 'chave de acesso', 'instituicao', 'agencia',
  'tipo de conta', 'conta de origem', 'conta de destino', 'conta destino', 'conta origem', 'conta corrente', 'conta pagamento', 'numero da conta',
  'id da transacao', 'id da transferencia', 'id da operacao', 'id do pagamento', 'identificador', 'identificacao', 'codigo de autenticacao',
  'autenticacao', 'codigo de identificacao', 'numero de controle', 'end to end', 'end-to-end', 'endtoend', 'e2e', 'protocolo', 'numero do protocolo',
  'nosso numero', 'codigo de barras', 'linha digitavel', 'ispb', 'numero da transacao', 'numero da operacao', 'nsu', 'autorizacao',
  'codigo da transacao', 'codigo do pagamento', 'numero do cartao', 'final do cartao', 'bandeira', 'parcelas', 'telefone', 'e-mail', 'email',
  'cep', 'vencimento', 'data de vencimento', 'data do vencimento', 'data de emissao', 'data de agendamento', 'agendamento', 'data de competencia',
  'competencia', 'chave',
]);
add('descarte', ['conta', 'banco', 'id', 'cartao', 'documento', 'controle', 'endereco', 'cidade', 'estado'], { inline: false });

/** Rótulos por primeira letra, do mais longo para o mais curto: o mais específico vale ("data do pagamento" antes de "data"). */
const BY_FIRST: Map<string, LabelSpec[]> = new Map();
for (const spec of LABELS) {
  const list = BY_FIRST.get(spec.phrase[0]!) ?? [];
  list.push(spec);
  BY_FIRST.set(spec.phrase[0]!, list);
}
for (const list of BY_FIRST.values()) list.sort((a, b) => b.phrase.length - a.phrase.length);

/** A partir de quantos caracteres uma linha é tratada como texto sem quebra, com rótulos no meio. */
const INLINE_MIN = 70;

function labelAt(plain: string, i: number, inlineOnly: boolean): LabelSpec | null {
  const list = BY_FIRST.get(plain[i]!);
  if (!list) return null;
  for (const spec of list) {
    if (inlineOnly && !spec.inline) continue;
    if (!plain.startsWith(spec.phrase, i)) continue;
    const end = i + spec.phrase.length;
    if (end < plain.length) {
      const next = plain.charCodeAt(end);
      if (isLetter(next) || isDigit(next)) continue;
    }
    if (spec.alone) {
      let k = end;
      while (k < plain.length && plain[k] === ' ') k++;
      if (k < plain.length && plain[k] !== ':') continue;
    }
    return spec;
  }
  return null;
}

interface Segment {
  spec: LabelSpec | null;
  value: string;
}

const VALUE_EDGES = ' :|-';

/** A linha em pedaços: texto solto ou rótulo e valor. Em linha longa, os rótulos do meio também abrem um pedaço. */
function segmentsOf(text: string): Segment[] {
  const plain = fold(text);
  const segments: Segment[] = [];
  let spec = labelAt(plain, 0, false);
  let start = spec ? spec.phrase.length : 0;
  if (plain.length > INLINE_MIN) {
    for (let i = 1; i < plain.length; i++) {
      if (plain[i - 1] !== ' ') continue;
      const m = labelAt(plain, i, true);
      if (!m) continue;
      segments.push({ spec, value: trimEdges(text.slice(start, i), VALUE_EDGES) });
      spec = m;
      start = i + m.phrase.length;
      i = start - 1;
    }
  }
  segments.push({ spec, value: trimEdges(text.slice(start), VALUE_EDGES) });
  return segments.filter((s) => s.spec !== null || s.value !== '');
}

interface Field {
  spec: LabelSpec | null;
  value: string;
}

/** Rótulo sem valor na linha: o valor é a linha seguinte, se ela for texto solto (e não outro rótulo). */
function fieldsOf(lines: string[]): Field[] {
  const fields: Field[] = [];
  for (let li = 0; li < lines.length; li++) {
    const segments = segmentsOf(lines[li]!);
    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si]!;
      if (seg.spec && seg.value === '' && si === segments.length - 1 && li + 1 < lines.length) {
        const next = lines[li + 1]!;
        if (next.length <= 200 && labelAt(fold(next), 0, false) === null) {
          seg.value = trimEdges(next, VALUE_EDGES);
          li++;
        }
      }
      fields.push({ spec: seg.spec, value: seg.value });
    }
  }
  return fields;
}

// ---------------------------------------------------------------------------
// Expressões do título
// ---------------------------------------------------------------------------

const SAIDA_CUES = [
  'pix enviado', 'pix realizado', 'pix efetuado', 'pix pago', 'voce enviou', 'voce pagou', 'voce transferiu', 'transferencia enviada',
  'transferencia realizada', 'transferencia efetuada', 'transferencia efetivada', 'ted enviada', 'ted realizada', 'pagamento realizado',
  'pagamento efetuado', 'pagamento efetivado', 'pagamento de boleto', 'pagamento de conta', 'boleto pago', 'comprovante de pagamento',
  'compra no debito', 'enviado com sucesso',
];
const ENTRADA_CUES = [
  'pix recebido', 'voce recebeu', 'transferencia recebida', 'ted recebida', 'recebimento de pix', 'comprovante de recebimento',
  'pagamento recebido', 'credito em conta', 'deposito recebido', 'recebeu um pix', 'pix de entrada',
];
const LEAD_SAIDA = [
  'pix enviado para ', 'pix realizado para ', 'transferencia enviada para ', 'transferencia realizada para ', 'ted enviada para ',
  'pagamento realizado para ', 'pagamento para ', 'voce pagou para ', 'voce enviou para ', 'pix para ', 'transferencia para ',
];
const LEAD_ENTRADA = ['pix recebido de ', 'transferencia recebida de ', 'ted recebida de ', 'pagamento recebido de ', 'voce recebeu de ', 'pix de '];

function earliest(text: string, cues: readonly string[]): number {
  let best = -1;
  for (const cue of cues) {
    const k = text.indexOf(cue);
    if (k >= 0 && (best < 0 || k < best)) best = k;
  }
  return best;
}

/** Posição da primeira ocorrência de `word` como palavra inteira, ou -1. */
function wordIndex(text: string, word: string): number {
  let from = 0;
  for (;;) {
    const k = text.indexOf(word, from);
    if (k < 0) return -1;
    const before = k > 0 ? text.charCodeAt(k - 1) : 32;
    const after = k + word.length < text.length ? text.charCodeAt(k + word.length) : 32;
    if (!isLetter(before) && !isDigit(before) && !isLetter(after) && !isDigit(after)) return k;
    from = k + 1;
  }
}

const KIND_WORDS: readonly { kind: ComprovanteKind; word: string }[] = [
  { kind: 'pix', word: 'pix' },
  { kind: 'ted', word: 'ted' },
  { kind: 'debito', word: 'debito' },
];

function kindFrom(tipoValues: readonly string[], heads: string): ComprovanteKind | null {
  for (const v of tipoValues) {
    if (wordIndex(v, 'pix') >= 0) return 'pix';
    if (wordIndex(v, 'ted') >= 0) return 'ted';
    if (v.includes('boleto')) return 'boleto';
    if (wordIndex(v, 'debito') >= 0) return 'debito';
  }
  if (heads.includes('boleto') || heads.includes('linha digitavel') || heads.includes('codigo de barras')) return 'boleto';
  let best: { kind: ComprovanteKind; at: number } | null = null;
  for (const { kind, word } of KIND_WORDS) {
    const at = wordIndex(heads, word);
    if (at >= 0 && (best === null || at < best.at)) best = { kind, at };
  }
  return best ? best.kind : null;
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

/** Linhas de texto solto que não valem para a data: vencimento, agendamento, emissão do próprio comprovante. */
const NOT_THE_DAY = ['venc', 'agend', 'emit', 'emiss', 'gerad', 'impress', 'consult', 'validade'];
/** Linhas de texto solto com valor que não é o do pagamento. */
const NOT_THE_AMOUNT = ['saldo', 'tarifa', 'limite', 'juros', 'multa', 'desconto', 'encarg', 'iof', 'taxa'];

function alnumCount(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (isDigit(c) || isLetter(c)) n++;
  }
  return n;
}

export function comprovanteFromText(raw: string, options: ComprovanteOptions = {}): ComprovanteResult {
  const text = typeof raw === 'string' ? cleanText(raw) : '';
  if (alnumCount(text) < 20) return { ok: false, code: 'texto_vazio' };
  const lines = toLines(text);
  const everything = fold(lines.join('\n'));
  if (everything.includes('danfe') || everything.includes('documento auxiliar da nota') || everything.includes('chave de acesso')) {
    return { ok: false, code: 'nota_fiscal' };
  }
  // Holerite: só o valor líquido e o mês de competência (holerite.ts); o resto do texto nem é lido.
  if (looksLikeHolerite(everything)) return { ok: true, reading: holeriteReading(lines, everything, options.items) };

  const fields = fieldsOf(lines);
  let section: 'destino' | 'origem' | null = null;
  let sawDest = false;
  let sawOrig = false;
  const dest: string[] = [];
  const orig: string[] = [];
  const amounts: { rank: number; cents: Cents }[] = [];
  const dateValues: string[] = [];
  const timeValues: string[] = [];
  const tipoValues: string[] = [];
  const messages: string[] = [];
  const free: string[] = [];
  const phrases = new Set<string>();

  const pushName = (into: string[], value: string) => {
    const name = cleanPersonName(value);
    if (name && !into.includes(name)) into.push(name);
  };

  for (const f of fields) {
    if (!f.spec) {
      free.push(f.value);
      continue;
    }
    phrases.add(f.spec.phrase);
    switch (f.spec.id) {
      case 'valor': {
        const m = scanMoney(f.value, 0, 160);
        if (m) amounts.push({ rank: f.spec.rank, cents: m.cents });
        break;
      }
      case 'data':
        dateValues.push(f.value);
        break;
      case 'hora':
        timeValues.push(f.value);
        break;
      case 'tipo':
        tipoValues.push(fold(f.value));
        break;
      case 'destino':
        sawDest = true;
        section = 'destino';
        if (f.value) pushName(dest, f.value);
        break;
      case 'origem':
        sawOrig = true;
        section = 'origem';
        if (f.value) pushName(orig, f.value);
        break;
      case 'nomeDestino':
        sawDest = true;
        section = 'destino';
        pushName(dest, f.value);
        break;
      case 'nomeOrigem':
        sawOrig = true;
        section = 'origem';
        pushName(orig, f.value);
        break;
      case 'nome':
        if (section === 'destino') pushName(dest, f.value);
        else if (section === 'origem') pushName(orig, f.value);
        break;
      case 'mensagem': {
        const message = cleanMessage(f.value);
        if (message) messages.push(message);
        break;
      }
      default:
        break;
    }
  }

  // Tipo e direção: título (texto solto), valor de "Tipo de transferência" e os próprios rótulos ("Chave Pix", "Linha digitável").
  const freePlain = free.map((v) => fold(v));
  const heads = [...freePlain, ...tipoValues, ...phrases].join('\n');
  const kindCue = kindFrom(tipoValues, heads);
  const saidaAt = earliest(heads, SAIDA_CUES);
  const entradaAt = earliest(heads, ENTRADA_CUES);
  let cueDirection: ComprovanteDirection | null = null;
  if (saidaAt >= 0 && (entradaAt < 0 || saidaAt < entradaAt)) cueDirection = 'saida';
  else if (entradaAt >= 0) cueDirection = 'entrada';

  let direction: ComprovanteDirection | null = cueDirection;
  if (direction === null && (kindCue === 'boleto' || kindCue === 'debito')) direction = 'saida';
  if (direction === null && sawDest !== sawOrig) direction = sawDest ? 'saida' : 'entrada';
  let guessed = false;
  if (direction === null && options.defaultDirection) {
    direction = options.defaultDirection;
    guessed = true;
  }

  // Nome da outra ponta: o da seção do lado de lá, ou o que vem depois de "Pix enviado para ..." / "Pix recebido de ...".
  const leadIn = (leads: readonly string[]): string | null => {
    for (let i = 0; i < free.length; i++) {
      const plain = freePlain[i]!;
      for (const lead of leads) {
        if (plain.startsWith(lead)) {
          const name = cleanPersonName(free[i]!.slice(lead.length));
          if (name) return name;
        }
      }
    }
    return null;
  };
  let counterpart: string | null = null;
  if (direction === 'saida') counterpart = dest[0] ?? leadIn(LEAD_SAIDA);
  else if (direction === 'entrada') counterpart = orig[0] ?? leadIn(LEAD_ENTRADA);

  // Valor: o de rótulo mais específico; sem rótulo, o único valor com "R$" em texto solto que não seja saldo, tarifa etc.
  let amountCents: Cents | null = null;
  if (amounts.length > 0) {
    let best = amounts[0]!;
    for (const a of amounts) if (a.rank < best.rank) best = a;
    amountCents = best.cents;
  } else {
    const seen = new Set<Cents>();
    for (let i = 0; i < free.length; i++) {
      const plain = freePlain[i]!;
      if (!plain.includes('r$') || NOT_THE_AMOUNT.some((w) => plain.includes(w))) continue;
      const m = scanMoney(free[i]!, 0, 200);
      if (m) seen.add(m.cents);
      if (seen.size > 1) break;
    }
    if (seen.size === 1) amountCents = [...seen][0]!;
  }

  // Data e hora: a do rótulo de pagamento; sem ele, a primeira data de texto solto que não seja vencimento, agendamento nem emissão.
  let occurredOn: IsoDate | null = null;
  let time: string | null = null;
  for (const v of dateValues) {
    const plain = fold(v);
    const d = scanDate(plain);
    if (d) {
      occurredOn = d.iso;
      time = scanTime(plain, d.end, Math.min(plain.length, d.end + 40)) ?? scanTime(plain, 0, d.start);
      break;
    }
  }
  if (occurredOn === null) {
    for (let i = 0; i < free.length; i++) {
      const plain = freePlain[i]!;
      if (NOT_THE_DAY.some((w) => plain.includes(w))) continue;
      const d = scanDate(plain);
      if (d) {
        occurredOn = d.iso;
        time = scanTime(plain, d.end, Math.min(plain.length, d.end + 40)) ?? scanTime(plain, 0, d.start);
        break;
      }
    }
  }
  if (occurredOn !== null && time === null) {
    for (const v of timeValues) {
      time = scanTime(fold(v));
      if (time) break;
    }
  }

  const message = messages[0] ?? null;
  const kind: ComprovanteKind = kindCue ?? 'outro';
  const hasWord = heads.includes('comprovante') || heads.includes('recibo');
  const signals = [amountCents !== null, occurredOn !== null, kindCue !== null, counterpart !== null, hasWord, cueDirection !== null, sawDest || sawOrig].filter(Boolean).length;
  const strong = kindCue !== null || hasWord || cueDirection !== null || sawDest || sawOrig;
  if (!strong || signals < 2 || (amountCents === null && occurredOn === null && counterpart === null && message === null)) {
    return { ok: false, code: 'nao_e_comprovante' };
  }
  const reading: ComprovanteReading = { kind, direction, directionGuessed: guessed, amountCents, occurredOn, time, counterpart, message };
  return { ok: true, reading };
}
