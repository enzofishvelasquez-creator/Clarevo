import { describe, expect, it } from 'vitest';
import { TOPICS, searchTopics, searchWords, type Topic } from '../src';

const slugs = (r: Topic[] | null) => (r === null ? null : r.map((t) => t.slug));

describe('searchWords: normalização', () => {
  it('sem acentos, minúsculas, sem pontuação nem palavras vazias; "s" final só com 4 letras ou mais', () => {
    expect(searchWords('Quanto é o IOF de um empréstimo?')).toEqual(['quanto', 'iof', 'emprestimo']);
    expect(searchWords('A empresa vê meus gastos')).toEqual(['empresa', 've', 'gasto']);
    expect(searchWords('JÚROS, Parcelas e mês')).toEqual(['juro', 'parcela', 'mes']);
    expect(searchWords('R$ 1.000,00 a 2%')).toEqual(['r', '1', '000', '00', '2']);
    expect(searchWords('de da do')).toEqual([]);
  });
});

describe('searchTopics (spec3 §3.11)', () => {
  it('"juros": juros simples e compostos primeiro; inclui multa e juros por atraso e taxa ao mês e ao ano', () => {
    const r = slugs(searchTopics('juros'))!;
    expect(r[0]).toBe('juros-simples-compostos');
    expect(r).toContain('multa-juros-atraso');
    expect(r).toContain('taxa-mes-ano');
  });

  it('"JÚROS" dá o mesmo que "juros"', () => {
    expect(slugs(searchTopics('JÚROS'))).toEqual(slugs(searchTopics('juros')));
  });

  it('"cartao" põe o rotativo antes de fatura', () => {
    const r = slugs(searchTopics('cartao'))!;
    expect(r.indexOf('rotativo-cartao')).toBeGreaterThanOrEqual(0);
    expect(r.indexOf('fatura')).toBeGreaterThan(r.indexOf('rotativo-cartao'));
  });

  it('"IPVA" dá só contas do ano', () => {
    expect(slugs(searchTopics('IPVA'))).toEqual(['contas-do-ano']);
  });

  it('"empresa vê meus gastos" tem empresa-ve primeiro', () => {
    expect(slugs(searchTopics('empresa vê meus gastos'))![0]).toBe('empresa-ve');
  });

  it('"parcelas" encontra parcelamentos (plural e início de palavra)', () => {
    expect(slugs(searchTopics('parcelas'))).toContain('parcelamentos');
  });

  it('"zzz" dá []; sem palavra útil ("de", "", espaços) dá null', () => {
    expect(searchTopics('zzz')).toEqual([]);
    expect(searchTopics('de')).toBeNull();
    expect(searchTopics('')).toBeNull();
    expect(searchTopics('   ')).toBeNull();
  });

  it('todas as palavras precisam casar; palavra curta só casa inteira', () => {
    expect(slugs(searchTopics('ipva zzz'))).toEqual([]);
    // "ve" (2 letras) não casa com "verdade" nem "vence": só com "vê".
    for (const t of searchTopics('ve')!) expect(searchWords([t.title, t.question ?? '', t.keywords.join(' '), t.subtitle ?? '', t.short, ...t.paragraphs].join(' '))).toContain('ve');
  });

  it('só temas publicados aparecem (rascunhos ficam fora)', () => {
    expect(slugs(searchTopics('50-30-20'))).not.toContain('orcamento-50-30-20');
    expect(slugs(searchTopics('apagar meus dados'))).not.toContain('apagar-dados');
    const all = searchTopics('juros')!;
    expect(all.every((t) => t.status === 'publicado')).toBe(true);
  });

  it('empate segue a ordem do catálogo', () => {
    const diferenca = TOPICS.find((t) => t.slug === 'diferenca')!;
    const saldo = TOPICS.find((t) => t.slug === 'saldo')!;
    // Mesmo texto, slugs diferentes: a pontuação empata e vale a ordem do catálogo (diferenca vem antes de saldo).
    const clone: Topic = { ...diferenca, slug: saldo.slug };
    expect(slugs(searchTopics('diferença do mês', [clone, diferenca]))).toEqual(['diferenca', 'saldo']);
  });
});
