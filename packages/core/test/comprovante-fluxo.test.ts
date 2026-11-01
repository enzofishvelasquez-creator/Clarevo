/// <reference types="node" />
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  COMPROVANTE_LOOKALIKE_DAYS,
  COMPROVANTE_TEXT,
  MAX_RECORD_CENTS,
  comprovanteDraft,
  comprovanteErrorText,
  comprovanteFillPlan,
  comprovanteFromText,
  comprovanteGaps,
  comprovanteKindLabel,
  comprovanteKindPhrase,
  comprovanteMemoryFor,
  comprovanteMismatch,
  comprovanteReadLine,
  counterpartMemoryId,
  findLookalikeRecord,
  normalizeCounterpart,
  scanOptionLabel,
  scanSheetOptions,
  suggestComprovanteDescription,
  type ComprovanteDraft,
  type ComprovanteKind,
  type ComprovanteReading,
  type FinancialRecord,
} from '../src';

const TODAY = '2026-10-07';

function reading(over: Partial<ComprovanteReading> = {}): ComprovanteReading {
  return { kind: 'pix', direction: 'saida', directionGuessed: false, amountCents: 8500, occurredOn: '2026-10-05', time: '14:32', counterpart: 'Maria Souza Exemplo', message: null, ...over };
}

const draftOf = (over: Partial<ComprovanteReading> = {}): ComprovanteDraft => comprovanteDraft(reading(over), TODAY);

describe('rascunho do comprovante', () => {
  it('confere valor e data: valor dentro do limite, data que não é futura', () => {
    expect(draftOf()).toMatchObject({ recordKind: 'despesa', amountCents: 8500, occurredOn: '2026-10-05', dayFuture: false, time: '14:32', counterpart: 'Maria Souza Exemplo' });
    expect(draftOf({ direction: 'entrada' }).recordKind).toBe('receita');
    expect(draftOf({ direction: null }).recordKind).toBeNull();
    expect(draftOf({ amountCents: 0 }).amountCents).toBeNull();
    expect(draftOf({ amountCents: MAX_RECORD_CENTS + 1 }).amountCents).toBeNull();
    expect(draftOf({ amountCents: MAX_RECORD_CENTS }).amountCents).toBe(MAX_RECORD_CENTS);
    expect(draftOf({ occurredOn: TODAY }).occurredOn).toBe(TODAY);
    expect(draftOf({ occurredOn: '2026-10-08' })).toMatchObject({ occurredOn: null, dayFuture: true });
    expect(draftOf({ occurredOn: null })).toMatchObject({ occurredOn: null, dayFuture: false });
  });

  it('a linha "Comprovante lido": tipo, nome, valor, data e hora, só o que a leitura traz', () => {
    expect(comprovanteReadLine(draftOf())).toBe('Comprovante lido: Pix enviado · Maria Souza Exemplo · R$ 85,00 · 05/10/2026 às 14:32');
    expect(comprovanteReadLine(draftOf({ direction: 'entrada', counterpart: 'Fulano de Tal' }))).toBe('Comprovante lido: Pix recebido · Fulano de Tal · R$ 85,00 · 05/10/2026 às 14:32');
    expect(comprovanteReadLine(draftOf({ time: null }))).toBe('Comprovante lido: Pix enviado · Maria Souza Exemplo · R$ 85,00 · 05/10/2026');
    expect(comprovanteReadLine(draftOf({ amountCents: null, occurredOn: null, time: null }))).toBe('Comprovante lido: Pix enviado · Maria Souza Exemplo');
    expect(comprovanteReadLine(draftOf({ counterpart: null, kind: 'boleto' }))).toBe('Comprovante lido: Boleto pago · R$ 85,00 · 05/10/2026 às 14:32');
    // A direção que veio da tela não é afirmada.
    expect(comprovanteReadLine(draftOf({ directionGuessed: true }))).toBe('Comprovante lido: Pix · Maria Souza Exemplo · R$ 85,00 · 05/10/2026 às 14:32');
    // Data futura: não aparece (a pessoa escolhe o dia).
    expect(comprovanteReadLine(draftOf({ occurredOn: '2026-12-01' }))).toBe('Comprovante lido: Pix enviado · Maria Souza Exemplo · R$ 85,00');
  });

  it('rótulos e frases de cada tipo', () => {
    const cases: [ComprovanteKind, 'saida' | 'entrada' | null, string, string][] = [
      ['pix', 'saida', 'Pix enviado', 'um Pix enviado'],
      ['pix', 'entrada', 'Pix recebido', 'um Pix recebido'],
      ['pix', null, 'Pix', 'um Pix'],
      ['ted', 'saida', 'TED enviada', 'uma TED enviada'],
      ['ted', 'entrada', 'TED recebida', 'uma TED recebida'],
      ['boleto', 'saida', 'Boleto pago', 'um boleto pago'],
      ['debito', 'saida', 'Débito', 'um débito'],
      ['outro', 'saida', 'Pagamento', 'um pagamento'],
      ['outro', 'entrada', 'Recebimento', 'um recebimento'],
      ['outro', null, 'Comprovante', 'um pagamento'],
    ];
    for (const [kind, direction, label, phrase] of cases) {
      expect(comprovanteKindLabel(kind, direction), `${kind} ${direction}`).toBe(label);
      expect(comprovanteKindPhrase(kind, direction), `${kind} ${direction}`).toBe(phrase);
    }
  });

  it('o que o comprovante não trouxe vira mensagem, sem parecer falha', () => {
    expect(comprovanteGaps(draftOf())).toEqual({ amount: null, day: null, name: null, guessed: null });
    expect(comprovanteGaps(draftOf({ amountCents: null })).amount).toBe('O valor não apareceu no comprovante. Digite o valor.');
    expect(comprovanteGaps(draftOf({ occurredOn: null })).day).toBe('A data não apareceu no comprovante. Escolha o dia.');
    expect(comprovanteGaps(draftOf({ occurredOn: '2026-11-01' })).day).toBe('A data do comprovante ainda não chegou. Escolha o dia.');
    expect(comprovanteGaps(draftOf({ counterpart: null })).name).toBe('O nome não apareceu no comprovante. Digite uma descrição.');
    // Com a mensagem do comprovante, a descrição tem de onde vir.
    expect(comprovanteGaps(draftOf({ counterpart: null, message: 'Almoço' })).name).toBeNull();
    expect(comprovanteGaps(draftOf({ directionGuessed: true })).guessed).toBe('O comprovante não diz se o dinheiro saiu ou entrou. Usamos o tipo desta tela. Confira se está certo.');
  });
});

describe('tipo trocado', () => {
  it('recebimento em Anotar gasto e gasto em Registrar recebimento oferecem a troca', () => {
    expect(comprovanteMismatch(draftOf({ direction: 'entrada' }), 'despesa')).toEqual({
      text: 'Este comprovante é de um Pix recebido. Ele entra como recebimento, não como gasto.',
      action: 'Trocar para Registrar recebimento',
      other: 'receita',
    });
    expect(comprovanteMismatch(draftOf({ direction: 'saida' }), 'receita')).toEqual({
      text: 'Este comprovante é de um Pix enviado. Ele entra como gasto, não como recebimento.',
      action: 'Trocar para Anotar gasto',
      other: 'despesa',
    });
    expect(comprovanteMismatch(draftOf({ direction: 'saida', kind: 'boleto' }), 'receita')?.text).toBe('Este comprovante é de um boleto pago. Ele entra como gasto, não como recebimento.');
  });

  it('nada a avisar quando combina, quando o comprovante não diz ou quando a direção veio da tela', () => {
    expect(comprovanteMismatch(draftOf({ direction: 'saida' }), 'despesa')).toBeNull();
    expect(comprovanteMismatch(draftOf({ direction: 'entrada' }), 'receita')).toBeNull();
    expect(comprovanteMismatch(draftOf({ direction: null }), 'despesa')).toBeNull();
    expect(comprovanteMismatch(draftOf({ direction: 'entrada', directionGuessed: true }), 'receita')).toBeNull();
  });
});

describe('descrição sugerida e memória por nome', () => {
  it('"Pix para {nome}" no gasto e "Pix de {nome}" no recebimento; TED, boleto e débito têm a sua', () => {
    expect(suggestComprovanteDescription(draftOf(), null, 'despesa')).toMatchObject({
      description: 'Pix para Maria Souza Exemplo',
      category: null,
      source: 'nome',
      legend: 'Nome lido do comprovante',
      placeholder: 'Ex.: Pix para Maria',
    });
    expect(suggestComprovanteDescription(draftOf({ direction: 'entrada' }), null, 'receita')).toMatchObject({ description: 'Pix de Maria Souza Exemplo', placeholder: 'Ex.: Pix de Maria' });
    expect(suggestComprovanteDescription(draftOf({ kind: 'ted' }), null, 'despesa').description).toBe('TED para Maria Souza Exemplo');
    expect(suggestComprovanteDescription(draftOf({ kind: 'ted', direction: 'entrada' }), null, 'receita').description).toBe('TED de Maria Souza Exemplo');
    expect(suggestComprovanteDescription(draftOf({ kind: 'boleto' }), null, 'despesa').description).toBe('Boleto para Maria Souza Exemplo');
    expect(suggestComprovanteDescription(draftOf({ kind: 'debito' }), null, 'despesa').description).toBe('Débito em Maria Souza Exemplo');
    expect(suggestComprovanteDescription(draftOf({ kind: 'outro' }), null, 'despesa').description).toBe('Pagamento para Maria Souza Exemplo');
    expect(suggestComprovanteDescription(draftOf({ kind: 'outro', direction: 'entrada' }), null, 'receita').description).toBe('Recebimento de Maria Souza Exemplo');
  });

  it('a lembrança da última vez vale mais do que o nome, e a categoria só vale se é do tipo do formulário', () => {
    const last = { description: 'Aluguel', category: 'Moradia' };
    expect(suggestComprovanteDescription(draftOf(), last, 'despesa')).toMatchObject({ description: 'Aluguel', category: 'Moradia', source: 'ultima_vez', legend: 'Como da última vez com este nome' });
    expect(suggestComprovanteDescription(draftOf(), { description: 'Aluguel', category: 'Salário' }, 'despesa').category).toBeNull();
    expect(suggestComprovanteDescription(draftOf({ direction: 'entrada' }), { description: 'Pagamento do mês', category: 'Salário' }, 'receita').category).toBe('Salário');
    expect(suggestComprovanteDescription(draftOf(), { description: '   ', category: 'Moradia' }, 'despesa').source).toBe('nome');
  });

  it('sem nome, vale a mensagem do comprovante; sem nada, fica em branco com a dica', () => {
    expect(suggestComprovanteDescription(draftOf({ counterpart: null, message: 'Almoço de domingo' }), null, 'despesa')).toMatchObject({
      description: 'Almoço de domingo',
      source: 'mensagem',
      legend: 'Mensagem lida do comprovante',
    });
    expect(suggestComprovanteDescription(draftOf({ counterpart: null }), null, 'despesa')).toEqual({
      description: '',
      category: null,
      source: 'em_branco',
      legend: null,
      placeholder: 'Ex.: Pix para Maria',
    });
  });

  it('a descrição sugerida cabe nas 80 letras do app', () => {
    const long = 'Empresa Exemplo de Comércio e Serviços de Tecnologia da Informação e Comunicação Ltda'.repeat(2);
    const s = suggestComprovanteDescription(draftOf({ counterpart: long }), null, 'despesa').description;
    expect([...s].length).toBeLessThanOrEqual(80);
    expect(s.startsWith('Pix para Empresa Exemplo')).toBe(true);
  });

  it('chave da memória: resumo SHA-256 do nome normalizado, nunca o nome', () => {
    const id = counterpartMemoryId('Maria Souza Exemplo', 'despesa')!;
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(id).toBe(createHash('sha256').update('pessoa:despesa:maria souza exemplo').digest('hex'));
    expect(id.includes('maria')).toBe(false);
    // Caixa, acento, pontuação e espaços repetidos não mudam a chave.
    for (const same of ['MARIA SOUZA EXEMPLO', '  maria   souza exemplo ', 'María Souza, Exemplo.', 'Maria-Souza Exemplo']) expect(counterpartMemoryId(same, 'despesa')).toBe(id);
    // Outra pessoa, outro tipo de registro ou sem nome: outra chave ou nenhuma.
    expect(counterpartMemoryId('Maria Souza', 'despesa')).not.toBe(id);
    expect(counterpartMemoryId('Maria Souza Exemplo', 'receita')).not.toBe(id);
    expect(counterpartMemoryId(null, 'despesa')).toBeNull();
    expect(counterpartMemoryId('', 'despesa')).toBeNull();
    expect(counterpartMemoryId('*', 'despesa')).toBeNull();
    expect(normalizeCounterpart('João da Silva-Ávila Jr.')).toBe('joao da silva avila jr');
  });

  it('o que se lembra depois de salvar: descrição de 1 a 80 e a categoria do tipo', () => {
    expect(comprovanteMemoryFor('  Aluguel   de outubro ', 'Moradia', 'despesa')).toEqual({ description: 'Aluguel de outubro', category: 'Moradia' });
    expect(comprovanteMemoryFor('Aluguel', 'Salário', 'despesa')).toEqual({ description: 'Aluguel', category: null });
    expect(comprovanteMemoryFor('Pagamento do mês', 'Salário', 'receita')).toEqual({ description: 'Pagamento do mês', category: 'Salário' });
    expect(comprovanteMemoryFor('Aluguel', null, 'despesa')).toEqual({ description: 'Aluguel', category: null });
    expect(comprovanteMemoryFor('   ', 'Moradia', 'despesa')).toBeNull();
    expect(comprovanteMemoryFor('x'.repeat(81), null, 'despesa')).toBeNull();
  });
});

describe('o que a leitura preenche', () => {
  it('valor e data no formato dos campos; o foco vai para o primeiro que falta: valor, dia, descrição', () => {
    expect(comprovanteFillPlan(draftOf(), 'Pix para Maria')).toEqual({ amountText: '85,00', dateText: '05/10/2026', focus: null });
    expect(comprovanteFillPlan(draftOf({ amountCents: 123456 }), 'x').amountText).toBe('1.234,56');
    expect(comprovanteFillPlan(draftOf({ amountCents: null }), 'x')).toEqual({ amountText: null, dateText: '05/10/2026', focus: 'amountText' });
    expect(comprovanteFillPlan(draftOf({ amountCents: null, occurredOn: null }), 'x').focus).toBe('amountText');
    expect(comprovanteFillPlan(draftOf({ occurredOn: null }), 'x')).toEqual({ amountText: '85,00', dateText: '', focus: 'dateText' });
    expect(comprovanteFillPlan(draftOf({ occurredOn: '2026-12-01' }), 'x')).toEqual({ amountText: '85,00', dateText: '', focus: 'dateText' });
    expect(comprovanteFillPlan(draftOf(), '')).toEqual({ amountText: '85,00', dateText: '05/10/2026', focus: 'description' });
    expect(comprovanteFillPlan(draftOf(), '   ').focus).toBe('description');
  });

  it('da leitura do texto ao formulário, nos formatos de comprovante', () => {
    const text = ['Pix enviado', 'Valor', 'R$ 85,00', 'Data da transferência', '05/10/2026 14:32', 'Pago para', 'MARIA SOUZA EXEMPLO', 'CPF', '***.982.247-**'].join('\n');
    const r = comprovanteFromText(text, { defaultDirection: 'saida' });
    if (!r.ok) throw new Error('esperava leitura');
    const draft = comprovanteDraft(r.reading, TODAY);
    const description = suggestComprovanteDescription(draft, null, 'despesa');
    expect(comprovanteReadLine(draft)).toBe('Comprovante lido: Pix enviado · Maria Souza Exemplo · R$ 85,00 · 05/10/2026 às 14:32');
    expect(comprovanteFillPlan(draft, description.description)).toEqual({ amountText: '85,00', dateText: '05/10/2026', focus: null });
    expect(description.description).toBe('Pix para Maria Souza Exemplo');
    expect(comprovanteMismatch(draft, 'despesa')).toBeNull();
    expect(comprovanteMismatch(draft, 'receita')?.other).toBe('despesa');
  });
});

describe('"Parece já anotado"', () => {
  type Row = Pick<FinancialRecord, 'id' | 'kind' | 'amountCents' | 'occurredOn' | 'description'>;
  const row = (id: string, over: Partial<Row> = {}): Row => ({ id, kind: 'despesa', amountCents: 8500, occurredOn: '2026-10-05', description: `Registro ${id}`, ...over });
  const target = { kind: 'despesa' as const, amountCents: 8500, date: '2026-10-05' };

  it('mesmo tipo, mesmo valor e data a até um dia', () => {
    expect(COMPROVANTE_LOOKALIKE_DAYS).toBe(1);
    expect(findLookalikeRecord([row('a')], target)).toEqual({ id: 'a', description: 'Registro a', occurredOn: '2026-10-05', amountCents: 8500 });
    expect(findLookalikeRecord([row('a', { occurredOn: '2026-10-04' })], target)?.id).toBe('a');
    expect(findLookalikeRecord([row('a', { occurredOn: '2026-10-06' })], target)?.id).toBe('a');
    expect(findLookalikeRecord([row('a', { occurredOn: '2026-10-03' })], target)).toBeNull();
    expect(findLookalikeRecord([row('a', { occurredOn: '2026-10-07' })], target)).toBeNull();
  });

  it('vira o mês e o ano', () => {
    expect(findLookalikeRecord([row('a', { occurredOn: '2026-09-30' })], { ...target, date: '2026-10-01' })?.id).toBe('a');
    expect(findLookalikeRecord([row('a', { occurredOn: '2026-11-01' })], { ...target, date: '2026-10-31' })?.id).toBe('a');
    expect(findLookalikeRecord([row('a', { occurredOn: '2027-01-01' })], { ...target, date: '2026-12-31' })?.id).toBe('a');
    expect(findLookalikeRecord([row('a', { occurredOn: '2026-09-29' })], { ...target, date: '2026-10-01' })).toBeNull();
  });

  it('outro valor, outro tipo ou sem valor ou data: nada', () => {
    expect(findLookalikeRecord([row('a', { amountCents: 8501 })], target)).toBeNull();
    expect(findLookalikeRecord([row('a', { kind: 'receita' })], target)).toBeNull();
    expect(findLookalikeRecord([row('a', { kind: 'receita' })], { ...target, kind: 'receita' })?.id).toBe('a');
    expect(findLookalikeRecord([row('a')], { ...target, amountCents: null })).toBeNull();
    expect(findLookalikeRecord([row('a')], { ...target, date: null })).toBeNull();
    expect(findLookalikeRecord([], target)).toBeNull();
  });

  it('com vários, o de data mais próxima; no empate, o primeiro', () => {
    expect(findLookalikeRecord([row('a', { occurredOn: '2026-10-06' }), row('b', { occurredOn: '2026-10-05' }), row('c', { occurredOn: '2026-10-04' })], target)?.id).toBe('b');
    expect(findLookalikeRecord([row('a', { occurredOn: '2026-10-06' }), row('c', { occurredOn: '2026-10-04' })], target)?.id).toBe('a');
  });

  it('o texto do aviso', () => {
    expect(COMPROVANTE_TEXT.looksNoted('2026-10-05', 'Padaria', 8500)).toBe('Parece já anotado em 05/10/2026: Padaria, R$ 85,00.');
    expect(COMPROVANTE_TEXT.looksNotedHint).toBe('Pode ser o mesmo lançamento. Se for outro, é só salvar.');
  });
});

describe('folha "Escanear nota fiscal" e erros', () => {
  it('"Ler comprovante de Pix ou pagamento" é a última opção da folha, com ou sem câmera', () => {
    expect(scanSheetOptions(true)).toEqual(['camera', 'pdf', 'colar', 'comprovante']);
    expect(scanSheetOptions(false)).toEqual(['pdf', 'colar', 'comprovante']);
    expect(scanOptionLabel('comprovante')).toBe('Ler comprovante de Pix ou pagamento');
    expect(scanSheetOptions(true).map(scanOptionLabel)).toEqual(['Usar a câmera', 'Escolher o PDF da nota', 'Colar o link ou a chave', 'Ler comprovante de Pix ou pagamento']);
  });

  it('um erro por causa, sem devolver o texto do PDF', () => {
    expect(Object.keys(COMPROVANTE_TEXT.errors).sort()).toEqual(['nao_e_comprovante', 'nota_fiscal', 'texto_vazio']);
    for (const code of ['texto_vazio', 'nota_fiscal', 'nao_e_comprovante'] as const) expect(comprovanteErrorText(code)).toBe(COMPROVANTE_TEXT.errors[code]);
    expect(comprovanteErrorText('nota_fiscal')).toContain('Escanear nota fiscal');
  });
});
