import type { IsoDate } from '../dates';
import type { Cents } from '../money';
import { cleanPersonName, cleanText, fold, scanDate, scanMoney } from './texto';
import type { ComprovanteDirection, ComprovanteReading, PdfTextItem } from './tipos';

/**
 * Nota fiscal de serviço (NFS-e) em PDF ou imagem, lida em Registrar recebimento e em Anotar gasto (D-079; Enzo, 01/11/2026: "Estou
 * tentando registrar minha nota fiscal de recebimento aqui e não funciona"). Feita sobre o DANFSe do padrão nacional (o documento
 * auxiliar da NFS-e emitido pelo portal nacional, inclusive o do MEI) e sobre os rótulos que as notas das prefeituras costumam usar
 * ("Valor Líquido", "Valor do Serviço", "Data de Emissão", "Prestador de Serviços", "Tomador de Serviços", "Razão Social").
 *
 * O que sai: o valor líquido (sem ele, o valor do serviço), a data de emissão, o número da nota e o nome de quem prestou e de quem
 * contratou o serviço, sem documento. A nota não diz qual das pontas é a pessoa: a tela decide (`comprovanteDraft`). Em Registrar
 * recebimento, a pessoa prestou o serviço e o nome é o de quem contratou; em Anotar gasto, o inverso.
 *
 * O que NUNCA sai: CPF, CNPJ, inscrição municipal, endereço, telefone, e-mail, a chave de acesso, o código de verificação, a
 * descrição do serviço e os tributos. Nada disso tem campo no resultado.
 */

/** O texto (já sem acentos e em minúsculas) é de uma nota de serviço: a marca da NFS-e e as duas pontas, prestador e tomador. */
export function looksLikeNfse(folded: string): boolean {
  return (
    (folded.includes('nfs-e') || folded.includes('nfse') || folded.includes('nota fiscal de servico') || folded.includes('nota fiscal eletronica de servico')) &&
    folded.includes('prestador') &&
    folded.includes('tomador')
  );
}

/** Nome do que a nota chama de nota: "NFS-e", "nota", "nota fiscal". */
const NOTE = String.raw`(?:nfs-?e|nota(?:\s+fiscal)?)`;

/** Valor líquido: o que de fato passa de uma ponta à outra (o serviço menos as retenções). */
const NET = new RegExp(String.raw`^valor\s+liquido(?:\s+(?:da|de)\s+${NOTE})?`);
/** Valor do serviço, quando a nota não traz o líquido. */
const GROSS = new RegExp(
  String.raw`^(?:valor\s+(?:total\s+)?(?:do|dos)\s+servicos?|valor\s+da\s+operacao\s*/\s*servico|valor\s+total\s+(?:da|de)\s+${NOTE}|valor\s+(?:da|de)\s+${NOTE}|valor\s+bruto)`,
);
/** Data de emissão da nota (não a do RPS nem a da DPS, que têm o mesmo rótulo seguido de "da DPS"). */
const ISSUED = new RegExp(
  String.raw`^(?:data\s+(?:e\s+hora\s+)?(?:da|de)\s+emissao(?:\s+(?:da|de)\s+${NOTE})?|data\s*/\s*hora\s+(?:da|de)\s+emissao|data\s+emissao|emitida\s+em|emissao)`,
);
/** Número da nota. */
const NUMBER = new RegExp(String.raw`^(?:numero|n[°º.o]?)\s*(?:da\s+|de\s+)?${NOTE}`);

/** Começo de uma seção: prestador ou tomador; outras seções encerram as duas. */
const SECTION = /^(?:dados\s+do\s+)?(prestador|tomador)\b/;
const SECTION_WITH_NAME = /^(?:dados\s+do\s+)?(?:prestador|tomador)(?:\s+(?:de|do)\s+servicos?)?\s*:\s*(\S.*)$/;
const OTHER_SECTION =
  /^(?:dados\s+do\s+)?(?:intermediario|destinatario|discriminacao|servico\s+prestado|servicos\s+prestados|descricao|tributacao|valor|informacoes|outras\s+informacoes|atividade|codigo\s+(?:do|de)\s+servico)/;
/** Rótulo do nome dentro da seção. */
const NAME =
  /^(?:nome\s*\/\s*nome\s+empresarial|nome\s*\/\s*razao\s+social|razao\s+social\s*\/\s*nome|nome\s+ou\s+razao\s+social|nome\s+empresarial|razao\s+social|nome)/;
/** Linha que é outro rótulo, não o nome que faltou na linha do rótulo. */
const LABELISH = /^(?:municipio|endereco|cnpj|cpf|e-mail|email|telefone|inscricao|indicador|codigo|cep|bairro|uf|nome|razao\s+social)\b/;

/**
 * O resto da linha depois do rótulo, quando o rótulo ocupa o começo dela inteiro: vazio (o valor vem abaixo), depois de dois pontos
 * ou de "=" ("VALOR TOTAL DO SERVIÇO = R$ 1.500,00"), ou já o valor. "(R$)" ou "R$" logo depois do rótulo ("Valor Líquido (R$)") é
 * parte dele. `valueStart` diz como o valor começa. null quando a linha é outro rótulo ("Valor Líquido da NFS-e + IBS/CBS").
 */
function afterLabel(folded: string, label: RegExp, valueStart: RegExp): string | null {
  const m = label.exec(folded);
  if (!m) return null;
  let rest = folded.slice(m[0].length).trimStart();
  if (rest.startsWith('(r$)')) rest = rest.slice(4).trimStart();
  else if (rest === 'r$' || rest.startsWith('r$:') || rest.startsWith('r$ :') || rest.startsWith('r$=') || rest.startsWith('r$ =')) rest = rest.slice(2).trimStart();
  const separated = rest.startsWith(':') || rest.startsWith('=');
  if (separated) rest = rest.slice(1).trimStart();
  if (rest === '' || separated || valueStart.test(rest)) return rest;
  return null;
}

const MONEY_START = /^(?:r\$\s*)?\d/;
const DIGIT_START = /^\d/;
const MONEY_ONLY = /^\s*(?:r\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2}\s*$/i;

function moneyIn(text: string): Cents | null {
  const m = scanMoney(text, 0, Math.min(text.length, 60));
  return m ? m.cents : null;
}

function dateIn(text: string): IsoDate | null {
  const d = scanDate(fold(text.slice(0, 60)));
  return d ? d.iso : null;
}

/** Quantos rótulos iguais a busca pela posição confere (uma nota tem um ou dois; um PDF montado com milhares não trava a leitura). */
const LABEL_TRIES = 6;

/** O valor de um rótulo pela posição na página: no mesmo pedaço de texto, na mesma linha à direita ou logo abaixo (até 30 pt). */
function nearLabel<T>(items: readonly PdfTextItem[], label: RegExp, valueStart: RegExp, valueOf: (s: string) => T | null, valueItem: (s: string) => boolean): T | null {
  let tries = 0;
  for (const item of items) {
    const rest = afterLabel(fold(item.str.trim()), label, valueStart);
    if (rest === null) continue;
    if (++tries > LABEL_TRIES) break;
    if (rest !== '') {
      const inside = valueOf(rest);
      if (inside !== null) return inside;
    }
    let best: { value: T; score: number } | null = null;
    for (const other of items) {
      if (other === item || other.page !== item.page || !valueItem(other.str)) continue;
      const dy = item.y - other.y;
      const dx = other.x - item.x;
      if (dy < -3 || dy > 30 || dx < -20 || dx > item.width + 200) continue;
      const value = valueOf(other.str);
      if (value === null) continue;
      const score = (Math.abs(dy) <= 3 ? 0 : 1000) + Math.abs(dy) * 10 + Math.abs(dx);
      if (best === null || score < best.score) best = { value, score };
    }
    if (best) return best.value;
  }
  return null;
}

/** Sem posições: o valor depois do rótulo, na mesma linha ou na seguinte (se ela começa como o valor). */
function nextToLabel<T>(lines: readonly string[], label: RegExp, valueStart: RegExp, valueOf: (s: string) => T | null): T | null {
  let tries = 0;
  for (let i = 0; i < lines.length; i++) {
    const rest = afterLabel(fold(lines[i]!), label, valueStart);
    if (rest === null) continue;
    if (++tries > LABEL_TRIES) break;
    if (rest !== '') {
      const same = valueOf(rest);
      if (same !== null) return same;
      continue;
    }
    const next = lines[i + 1];
    if (next !== undefined && valueStart.test(fold(next))) {
      const below = valueOf(next);
      if (below !== null) return below;
    }
  }
  return null;
}

function byLabel<T>(
  lines: readonly string[],
  items: readonly PdfTextItem[] | undefined,
  label: RegExp,
  valueStart: RegExp,
  valueOf: (s: string) => T | null,
  valueItem: (s: string) => boolean,
): T | null {
  return (items && items.length > 0 ? nearLabel(items, label, valueStart, valueOf, valueItem) : null) ?? nextToLabel(lines, label, valueStart, valueOf);
}

/**
 * Os valores de uma linha que só tem valores ("R$ 300,00 R$ 4.200,00 R$ 0,00", "- R$ 4.200,00 - -"), um por coluna, com "-" para a
 * coluna vazia; null se a linha tem qualquer outra coisa (texto, como a descrição do serviço).
 */
function valueRow(line: string): (Cents | null)[] | null {
  const tokens = fold(line).split(' ');
  const out: (Cents | null)[] = [];
  for (let i = 0; i < tokens.length; i++) {
    let t = tokens[i]!;
    if (t === '') continue;
    if (t === '-') {
      out.push(null);
      continue;
    }
    if (t === 'r$') t = tokens[++i] ?? '';
    else if (t.startsWith('r$')) t = t.slice(2);
    if (!/^\d{1,3}(?:\.\d{3})*,\d{2}$/.test(t)) return null;
    out.push(moneyIn(t) ?? 0);
  }
  return out.length > 0 ? out : null;
}

/**
 * Foto do DANFSe nacional lida linha a linha: a linha dos rótulos "Total das Retenções", "Valor Líquido da NFS-e", "Total do IBS/CBS"
 * e "Valor Líquido da NFS-e + IBS/CBS" vem seguida dos quatro valores, na mesma ordem; o líquido é o segundo.
 */
function netFromDanfseRow(lines: readonly string[]): Cents | null {
  for (let i = 0; i + 1 < lines.length; i++) {
    const folded = fold(lines[i]!);
    if (!folded.includes('total das retencoes') || !folded.includes('valor liquido da nfs')) continue;
    const row = valueRow(lines[i + 1]!);
    if (row && row.length === 4 && row[1]) return row[1];
  }
  return null;
}

/**
 * Valor: o líquido; sem ele, o do serviço; numa foto do DANFSe nacional, o líquido pela ordem das colunas; sem nada disso, o maior
 * valor das linhas que só têm valores, que é o do serviço (os outros são partes dele: tributos, retenções, descontos). Valores no meio
 * de um texto (a descrição do serviço, "parcela 1 de 12 do contrato de R$ 18.000,00") não contam.
 */
function amountOf(lines: readonly string[], items: readonly PdfTextItem[] | undefined): Cents | null {
  const isMoney = (s: string) => MONEY_ONLY.test(s);
  const labeled = byLabel(lines, items, NET, MONEY_START, moneyIn, isMoney) ?? byLabel(lines, items, GROSS, MONEY_START, moneyIn, isMoney);
  if (labeled !== null) return labeled;
  const fromRow = netFromDanfseRow(lines);
  if (fromRow !== null) return fromRow;
  let largest: Cents | null = null;
  for (let i = 0; i < lines.length; i++) {
    // A linha de baixo de "Valor Líquido da NFS-e + IBS/CBS" soma os tributos novos ao líquido: não é o valor da nota.
    if (i > 0 && fold(lines[i - 1]!).includes('+ ibs/cbs')) continue;
    for (const cents of valueRow(lines[i]!) ?? []) if (cents && (largest === null || cents > largest)) largest = cents;
  }
  return largest;
}

/** Data de emissão; sem o rótulo, a primeira data seguida de hora (a da emissão vem com a hora; a de competência, não). */
function issuedOf(lines: readonly string[], items: readonly PdfTextItem[] | undefined): IsoDate | null {
  const labeled = byLabel(lines, items, ISSUED, DIGIT_START, dateIn, (s) => dateIn(s) !== null);
  if (labeled !== null) return labeled;
  for (const line of lines) {
    const m = /(\d{2}\/\d{2}\/\d{4})\s+\d{2}:\d{2}/.exec(line);
    if (m) return dateIn(m[1]!);
  }
  return null;
}

/** Número da nota, sem os zeros da frente ("00000035" vira "35"); null sem número ou com mais de 15 algarismos (é a chave). */
function numberOf(lines: readonly string[], items: readonly PdfTextItem[] | undefined): string | null {
  const valueOf = (s: string): string | null => {
    // "35" ou "35 / <chave>"; "05/10/2026" (uma data ao lado) não é número.
    const m = /^\s*(\d{1,15})(?![\d/.,:-])/.exec(s);
    if (!m) return null;
    const n = m[1]!.replace(/^0+(?=\d)/, '');
    return n === '0' ? null : n;
  };
  return byLabel(lines, items, NUMBER, DIGIT_START, valueOf, (s) => valueOf(s) !== null);
}

/** Outro campo na mesma linha do nome ("EMPRESA EXEMPLO LTDA Endereço: RUA ...", "... CPF/CNPJ: ..."): o nome para antes dele. */
const NAME_STOP = /\s(?:endereco|cpf|cnpj|inscricao|municipio|telefone|fone|e-?mail|cep|bairro|complemento|codigo|uf)\b|:/;

/**
 * Nome sem documento: para no próximo rótulo da linha e tira a raiz do CNPJ que o MEI leva na frente ("12.345.678 FULANO DE TAL")
 * antes de limpar o nome.
 */
function nameFrom(raw: string): string | null {
  const stop = NAME_STOP.exec(fold(raw));
  const value = stop ? raw.slice(0, stop.index) : raw;
  return cleanPersonName(value.replace(/^\s*\d{2}\.?\d{3}\.?\d{3}\s+/, ''));
}

/** Nome de quem prestou e de quem contratou: o primeiro "Nome" ou "Razão Social" de cada seção, na mesma linha ou na seguinte. */
function partiesOf(lines: readonly string[]): { provider: string | null; client: string | null } {
  let section: 'prestador' | 'tomador' | null = null;
  const found: { prestador: string | null; tomador: string | null } = { prestador: null, tomador: null };
  for (let i = 0; i < lines.length; i++) {
    const folded = fold(lines[i]!);
    const head = SECTION.exec(folded);
    if (head) {
      section = head[1] as 'prestador' | 'tomador';
      // "Tomador: EMPRESA EXEMPLO LTDA", com o nome depois de dois pontos na mesma linha.
      const inline = SECTION_WITH_NAME.exec(folded);
      if (inline && found[section] === null) found[section] = nameFrom(lines[i]!.slice(folded.length - inline[1]!.length));
      continue;
    }
    if (OTHER_SECTION.test(folded)) {
      section = null;
      continue;
    }
    if (section === null || found[section] !== null) continue;
    const m = NAME.exec(folded);
    if (!m) continue;
    let rest = folded.slice(m[0].length).trimStart();
    if (rest.startsWith(':')) rest = rest.slice(1).trimStart();
    else if (rest !== '') continue;
    if (rest !== '') {
      found[section] = nameFrom(lines[i]!.slice(lines[i]!.length - rest.length));
      continue;
    }
    const next = lines[i + 1];
    if (next !== undefined && !LABELISH.test(fold(next)) && !SECTION.test(fold(next))) found[section] = nameFrom(next);
  }
  return { provider: found.prestador, client: found.tomador };
}

/**
 * A leitura da nota de serviço. A direção é a da tela (`defaultDirection`): a nota não diz qual das pontas é a pessoa. O nome da outra
 * ponta segue a direção (recebimento: quem contratou; gasto: quem prestou), e os dois ficam em `serviceNote` para a troca de tela.
 */
export function nfseReading(lines: readonly string[], items: readonly PdfTextItem[] | undefined, direction: ComprovanteDirection | null): ComprovanteReading {
  const parties = partiesOf(lines);
  return {
    kind: 'nota_servico',
    direction,
    directionGuessed: false,
    amountCents: amountOf(lines, items),
    occurredOn: issuedOf(lines, items),
    time: null,
    counterpart: direction === 'entrada' ? parties.client : direction === 'saida' ? parties.provider : null,
    message: null,
    serviceNote: { number: numberOf(lines, items), provider: parties.provider, client: parties.client },
  };
}

/** O texto de um PDF é de uma nota de serviço (para o caminho do PDF da nota em Anotar gasto indicar a leitura certa). */
export function serviceNoteInText(raw: string): boolean {
  return typeof raw === 'string' && looksLikeNfse(fold(cleanText(raw.slice(0, 100_000))));
}
