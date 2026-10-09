/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  LEARN_SECTIONS,
  START_HERE,
  TOPICS,
  TOPIC_SLUGS,
  anyTopicBySlug,
  calcPrefill,
  expectedExampleNumbers,
  isAllowedSourceUrl,
  isTopicPublished,
  learnReviewWarnings,
  numbersInText,
  canonicalNumber,
  publishedTopics,
  readingMinutes,
  relatedTopics,
  resolveTopicSlug,
  reviewDueOn,
  topicBySlug,
  topicCalculator,
  topicReadingMinutes,
  topicWordCount,
  topicsBySection,
  validateLearnCatalog,
  wordCount,
  type LearnProblemCode,
  type Topic,
  type TopicSlug,
} from '../src';

const DOCS = fileURLToPath(new URL('../../../docs/', import.meta.url));

/** Decisões registradas em docs/00 ("| D-021 |"). */
function registeredDecisions(): string[] {
  const text = readFileSync(join(DOCS, '00_VISAO_E_DECISOES.md'), 'utf8');
  return [...text.matchAll(/^\|\s*(D-\d{3})\s*\|/gm)].map((m) => m[1]!);
}

/** Referências citadas nos documentos de docs/referencias ("CL C005", "CL-V007"). */
function referenceIds(): string[] {
  const dir = join(DOCS, 'referencias');
  const ids = new Set<string>();
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.md')))
    for (const m of readFileSync(join(dir, f), 'utf8').matchAll(/CL[ -][A-Z]?\d{3}/g)) ids.add(m[0]);
  return [...ids];
}

const TODAY = new Date().toISOString().slice(0, 10);

const clone = (slug: TopicSlug): Topic => structuredClone(TOPICS.find((t) => t.slug === slug)!);
const codes = (topics: Topic[], today = '2026-10-09') => validateLearnCatalog(topics, { today }).map((p) => `${p.code}:${p.slug}`);
const withTopic = (t: Topic) => TOPICS.map((x) => (x.slug === t.slug ? t : x));

describe('catálogo de Aprender (spec3 §3.3, com spec5_notes §2)', () => {
  it('R1 a R7, R9 e R12: validateLearnCatalog sem problemas, com as decisões de docs/00 e as referências', () => {
    const decisions = registeredDecisions();
    expect(decisions.length).toBeGreaterThan(25);
    // D-030, D-031 e D-032 já estão em docs/00: o catálogo cita só decisões registradas.
    for (const id of ['D-030', 'D-031', 'D-032']) expect(decisions).toContain(id);
    const problems = validateLearnCatalog(TOPICS, { today: TODAY, decisionIds: decisions, referenceIds: referenceIds() });
    expect(problems).toEqual([]);
  });

  it('R6: aviso 30 dias antes do prazo de revisão (console.warn), sem reprovar', () => {
    const warnings = learnReviewWarnings(TOPICS, TODAY);
    if (warnings.length > 0) console.warn(`Aprender: revisar em breve: ${warnings.map((w) => `${w.slug} (${w.detail})`).join(', ')}`);
    // Na data do prazo de cheque-especial (6 meses), o aviso aparece; 31 dias antes, não.
    const due = reviewDueOn(TOPICS.find((t) => t.slug === 'cheque-especial')!)!;
    expect(due).toBe('2027-04-09');
    expect(learnReviewWarnings(TOPICS, '2027-03-10').map((w) => w.slug)).toEqual(['iof-credito', 'rotativo-cartao', 'cheque-especial']);
    expect(learnReviewWarnings(TOPICS, '2027-03-09')).toEqual([]);
  });

  it('os 37 slugs na ordem; TOPICS e TOPIC_SLUGS iguais', () => {
    expect(TOPIC_SLUGS.length).toBe(37);
    expect(TOPICS.map((t) => t.slug)).toEqual([...TOPIC_SLUGS]);
  });

  it('seção, tipo e status de cada tema: 35 publicados e 2 rascunhos', () => {
    const table: Record<TopicSlug, string> = {
      diferenca: 'usar tema publicado',
      'realizado-previsto': 'usar tema publicado',
      saldo: 'usar tema publicado',
      fatura: 'usar tema publicado',
      'gasto-fixo': 'usar tema publicado',
      estimativa: 'usar tema publicado',
      parcelamentos: 'usar tema publicado',
      'sem-registro': 'usar tema publicado',
      'gasto-fixo-variavel': 'organizar tema publicado',
      'contas-do-ano': 'organizar tema publicado',
      'orcamento-50-30-20': 'organizar tema rascunho',
      'reserva-imprevistos': 'organizar tema publicado',
      'juros-simples-compostos': 'juros tema publicado',
      'taxa-mes-ano': 'juros tema publicado',
      'taxa-e-tarifa': 'juros tema publicado',
      cet: 'juros tema publicado',
      'iof-credito': 'juros tema publicado',
      'parcelado-ou-a-vista': 'juros tema publicado',
      'rotativo-cartao': 'juros tema publicado',
      'cheque-especial': 'juros tema publicado',
      'amortizacao-price-sac': 'juros tema publicado',
      'quitar-antes': 'juros tema publicado',
      'multa-juros-atraso': 'juros tema publicado',
      'score-credito': 'juros tema publicado',
      superendividamento: 'juros tema publicado',
      'inflacao-ipca': 'tempo tema publicado',
      selic: 'tempo tema publicado',
      'liquidez-risco-retorno': 'tempo tema publicado',
      fgc: 'tempo tema publicado',
      'quem-ve-meus-dados': 'duvidas pergunta publicado',
      'empresa-ve': 'duvidas pergunta publicado',
      demonstracao: 'duvidas pergunta publicado',
      'marcar-como-paga': 'duvidas pergunta publicado',
      'contei-duas-vezes': 'duvidas pergunta publicado',
      'voltei-depois': 'duvidas pergunta publicado',
      'apagar-dados': 'duvidas pergunta rascunho',
      'o-que-o-clarevo-nao-faz': 'duvidas pergunta publicado',
    };
    expect(Object.fromEntries(TOPICS.map((t) => [t.slug, `${t.section} ${t.kind} ${t.status}`]))).toEqual(table);
    expect(publishedTopics().length).toBe(35);
    // Rascunho diz o que falta conferir.
    for (const t of TOPICS.filter((x) => x.status === 'rascunho')) expect(t.pending!.length).toBeGreaterThan(0);
  });

  it('temas de antes do A5: slug e textos iguais (quitar-antes e contas-do-ano trocam pelo texto com fontes)', () => {
    const legacy: Record<string, { title: string; subtitle: string; paragraphs: string[]; hypotheses: string }> = {
      diferenca: {
        title: 'Diferença do mês',
        subtitle: 'Como um registro entra no mês',
        paragraphs: [
          'A diferença do mês é o total recebido menos o total pago no período. Entra no mês a data do pagamento ou do recebimento, não a data da compra.',
          'Exemplo: com R$ 6.000 recebidos e R$ 3.900 pagos em outubro, a diferença é R$ 2.100. Um gasto de R$ 80 pago em 7 de outubro muda o total pago para R$ 3.980.',
        ],
        hypotheses: 'Exemplo fictício. Considera apenas registros realizados no mesmo contexto.',
      },
      'realizado-previsto': {
        title: 'Realizado e previsto',
        subtitle: 'O que já aconteceu e o que ainda vai acontecer',
        paragraphs: [
          'Realizado é o que já foi pago ou recebido. Previsto é uma conta a pagar que ainda não foi paga, como a internet que vence no dia 15.',
          'Contas a pagar aparecem em "Ainda a pagar neste mês" e não entram em Recebido, Pago ou na diferença do mês. Quando você marca uma conta como paga, o Clarevo registra um gasto com o valor e a data do pagamento, e só esse gasto entra em Pago, no mês da data do pagamento.',
          'Uma conta vencida e ainda não paga continua em "Ainda a pagar" nos meses seguintes, até ser paga ou excluída. Se você anotou o pagamento como gasto em vez de marcar a conta como paga, exclua a conta a pagar para ela não continuar em "Ainda a pagar".',
        ],
        hypotheses: 'Exemplo fictício.',
      },
      saldo: {
        title: 'Diferença do mês e saldo da conta',
        subtitle: 'Por que são números diferentes',
        paragraphs: [
          'O saldo da conta depende do quanto havia antes do mês começar, de transferências e de outros movimentos. A diferença do mês olha só para recebimentos e pagamentos do período.',
          'Por isso o Clarevo não chama a diferença do mês de saldo nem de dinheiro disponível. Sem saldo inicial informado, não mostramos um saldo calculado.',
        ],
        hypotheses: 'Exemplo fictício.',
      },
      fatura: {
        title: 'Fatura sem contar duas vezes',
        subtitle: 'Entenda o efeito no seu mês',
        paragraphs: [
          'Uma compra de R$ 160 no cartão registra o consumo. Pagar a fatura quita essa obrigação e movimenta a conta. Contar esse pagamento como uma nova compra duplicaria o consumo. Juros e tarifas têm registros próprios.',
          'Cartões ainda não estão disponíveis no Clarevo. Este conteúdo explica o conceito para quando chegarem.',
        ],
        hypotheses: 'Exemplo fictício: uma única compra à vista no cartão, sem parcelas, juros ou estornos.',
      },
      'gasto-fixo': {
        title: 'Gasto fixo, conta a pagar e gasto anotado',
        subtitle: 'Como cada um entra no mês',
        paragraphs: [
          'Um gasto fixo é uma regra: todo mês ele cria uma conta a pagar. Só quando você marca a conta como paga entra um gasto em Pago, uma única vez.',
          'Anotar o mesmo aluguel como gasto e como gasto fixo contaria duas vezes. Parcelas de compras no cartão ficam na fatura.',
        ],
        hypotheses: 'Exemplo fictício: aluguel de R$ 2.500,00 com vencimento no dia 5.',
      },
      estimativa: {
        title: 'Contas que mudam de valor',
        subtitle: 'Luz, água e gás',
        paragraphs: [
          'Usamos o valor de referência que você informou, marcado como estimado, até você informar o valor de cada conta.',
          'Quando houver contas pagas, mostramos a média das últimas três como sugestão, e você decide se usa.',
        ],
        hypotheses: 'Contas fictícias de R$ 165,30, R$ 180,00 e R$ 171,90: média de R$ 172,40.',
      },
    };
    for (const [slug, old] of Object.entries(legacy)) {
      const t = topicBySlug(slug)!;
      // Em diferenca, o parágrafo "Exemplo: ..." passou para o campo example, com o mesmo texto. Os demais ganharam
      // (estimativa) ou já tinham o exemplo fora dos parágrafos.
      const paragraphs =
        slug === 'diferenca' && t.example ? [...t.paragraphs, `Exemplo: ${t.example[0]!.toLowerCase()}${t.example.slice(1)}`] : t.paragraphs;
      expect({ title: t.title, subtitle: t.subtitle, paragraphs, hypotheses: t.hypotheses }).toEqual(old);
    }
    // quitar-antes troca de texto (Anexo A, 14, com fontes conferidas) e mantém título e subtítulo.
    const q = topicBySlug('quitar-antes')!;
    expect([q.title, q.subtitle]).toEqual(['Quitar antes do prazo', 'O que a soma das parcelas não mostra']);
    expect(q.paragraphs.join(' ')).toContain('estimativa com a taxa que digitar; o valor oficial é o que a instituição informar');
    expect(q.paragraphs.join(' ')).not.toMatch(/saldo devedor/i);
    // A vedação da tarifa começa na publicação da Resolução CMN nº 3.516/2007 (10/12/2007), não em 1º de dezembro.
    expect(q.paragraphs[2]).toContain('assinados a partir de 10 de dezembro de 2007 (Resolução CMN nº 3.516/2007)');
    expect(q.paragraphs.join(' ')).not.toContain('desde dezembro de 2007');
    // estimativa: o exemplo traz a mesma conta que "Ver a conta" mostra.
    const est = topicBySlug('estimativa')!;
    expect(est.example).toContain('R$ 172,40');
    expect(est.calculation).toBe('(165,30 + 180,00 + 171,90) ÷ 3 = 172,40.');
    expect(topicBySlug('contas-do-ano')!.paragraphs[4]).toBe(
      'No Clarevo, cadastre cada uma como conta do ano: o ano inteiro aparece em Contas a pagar dois meses antes do primeiro vencimento, e cada conta só entra em Ainda a pagar no mês em que vence.',
    );
  });

  it('R3 e R4: tempo de leitura calculado (200 palavras por minuto), no máximo 2 minutos', () => {
    expect([150, 200, 201, 320].map(readingMinutes)).toEqual([1, 1, 2, 2]);
    expect(readingMinutes(0)).toBe(1);
    expect(() => readingMinutes(-1)).toThrow(RangeError);
    expect(wordCount('R$ 1.000,00 a 2% · ao mês')).toBe(6);
    for (const t of TOPICS) {
      expect(topicReadingMinutes(t)).toBeLessThanOrEqual(2);
      expect(topicWordCount(t)).toBeLessThanOrEqual(320);
    }
  });

  it('R5: toda fonte externa de tema publicado tem endereço permitido e data de consulta 09/10/2026', () => {
    for (const t of publishedTopics())
      for (const s of t.sources) {
        if (s.kind === 'clarevo') continue;
        expect(s.consultedOn, `${t.slug}: ${s.title}`).toBe('2026-10-09');
        if (s.kind !== 'obra') expect(isAllowedSourceUrl(s.url, s.kind, t.slug), s.url).toBe(true);
      }
    expect(isAllowedSourceUrl('https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm', 'oficial', 'cet')).toBe(true);
    expect(isAllowedSourceUrl('https://www.serasa.com.br/x', 'mercado', 'renda-comprometida')).toBe(true);
    expect(isAllowedSourceUrl('https://www.serasa.com.br/x', 'mercado', 'score-credito')).toBe(false);
    expect(isAllowedSourceUrl('https://www.fgc.org.br/x', 'oficial', 'fgc')).toBe(false);
    expect(isAllowedSourceUrl('http://www.bcb.gov.br/x', 'oficial', 'selic')).toBe(false);
    expect(isAllowedSourceUrl('https://notgov.br.example.com/x', 'oficial', 'selic')).toBe(false);
    expect(isAllowedSourceUrl('https://exemplogov.br/x', 'oficial', 'selic')).toBe(false);
  });

  it('R7: conjunto esperado calculado por learn/math.ts mais os fatos do tema', () => {
    const withFacts = (slug: TopicSlug) => {
      const set = expectedExampleNumbers(slug);
      for (const f of topicBySlug(slug)!.facts) for (const n of numbersInText(f.text)) set.add(canonicalNumber(n)!);
      return set;
    };
    const multa = withFacts('multa-juros-atraso');
    for (const n of ['R$ 200,00', 'R$ 4,00', 'R$ 0,67', 'R$ 204,67', '2%', '1%']) expect(multa.has(canonicalNumber(n)!), n).toBe(true);
    const iof = withFacts('iof-credito');
    for (const n of ['R$ 2.000,00', 'R$ 22,36', 'R$ 7,60', 'R$ 14,76', '0,38%', '0,0082%', '3,37%']) expect(iof.has(canonicalNumber(n)!), n).toBe(true);
    const cet = withFacts('cet');
    for (const n of ['R$ 472,80', '2,85%', '40,03%', 'R$ 4.750,00']) expect(cet.has(canonicalNumber(n)!), n).toBe(true);
    expect(cet.has(canonicalNumber('40,07%')!)).toBe(false);
    expect(canonicalNumber('R$ 6.000')).toBe(canonicalNumber('R$ 6.000,00'));
    expect(canonicalNumber('0,80%')).toBe(canonicalNumber('0,8%'));
    expect(numbersInText('De R$ 1.000.000,00 a 1,5% e 4,5%; R$ 80.')).toEqual(['R$ 1.000.000,00', '1,5%', '4,5%', 'R$ 80']);
  });

  it('validateLearnCatalog reprova cada regra quebrada', () => {
    const expectCode = (topics: Topic[], code: LearnProblemCode, slug: string, today?: string) => expect(codes(topics, today)).toContain(`${code}:${slug}`);

    const badSlug = clone('saldo');
    badSlug.slug = 'Saldo' as TopicSlug;
    expectCode(withTopic(clone('saldo')).map((t) => (t.slug === 'saldo' ? badSlug : t)), 'slug_invalido', 'Saldo');

    const alias = clone('fgc');
    alias.aliases = ['selic'];
    expectCode(withTopic(alias), 'apelido_invalido', 'fgc');

    const self = clone('selic');
    self.related = ['selic'];
    expectCode(withTopic(self), 'relacionado_proprio', 'selic');

    const noDate = clone('cet');
    noDate.sources = noDate.sources.map((s) => (s.kind === 'oficial' ? { ...s, consultedOn: null } : s));
    expectCode(withTopic(noDate), 'fonte_sem_data', 'cet');

    const badUrl = clone('selic');
    badUrl.sources = [{ kind: 'oficial', publisher: 'Blog', title: 'Selic', url: 'https://blog.example.com/selic', locator: null, consultedOn: '2026-10-09' }];
    expectCode(withTopic(badUrl), 'fonte_endereco', 'selic');

    const noExternal = clone('selic');
    noExternal.sources = [{ kind: 'clarevo', refs: ['D-023'] }];
    expectCode(withTopic(noExternal), 'fonte_externa_faltando', 'selic');

    expectCode([...TOPICS], 'revisao_vencida', 'cheque-especial', '2027-04-10');
    expect(codes([...TOPICS], '2027-04-09')).not.toContain('revisao_vencida:cheque-especial');

    const wrongPeriod = clone('iof-credito');
    wrongPeriod.reviewEveryMonths = 12;
    expectCode(withTopic(wrongPeriod), 'revisao_prazo', 'iof-credito');

    const number = clone('multa-juros-atraso');
    number.example = `${number.example} Com R$ 1,23 a mais.`;
    expectCode(withTopic(number), 'numero_nao_conferido', 'multa-juros-atraso');

    const percent = clone('cheque-especial');
    percent.paragraphs = [...percent.paragraphs.slice(0, 2), 'Antes, o teto era 12% ao mês.'];
    expectCode(withTopic(percent), 'numero_nao_conferido', 'cheque-especial');

    const noHyp = clone('fgc');
    noHyp.hypotheses = null;
    expectCode(withTopic(noHyp), 'hipoteses_faltando', 'fgc');

    const notFictional = clone('selic');
    notFictional.hypotheses = 'Taxas de exemplo.';
    expectCode(withTopic(notFictional), 'hipoteses_sem_ficticio', 'selic');

    const mark = clone('fgc');
    mark.paragraphs = [...mark.paragraphs, 'Trecho a confirmar [conferir].'];
    expectCode(withTopic(mark), 'marca_pendente', 'fgc');

    // "Ver a conta" só aparece dentro do cartão Exemplo: calculation exige example.
    const calcWithoutExample = clone('estimativa');
    calcWithoutExample.example = null;
    expectCode(withTopic(calcWithoutExample), 'calculo_sem_exemplo', 'estimativa');
    expect(codes([...TOPICS])).not.toContain('calculo_sem_exemplo:estimativa');
    expect(TOPICS.filter((t) => t.calculation !== null && t.example === null).map((t) => t.slug)).toEqual([]);

    const long = clone('selic');
    long.paragraphs = [...long.paragraphs, Array.from({ length: 150 }, () => 'palavra').join(' ')];
    expectCode(withTopic(long), 'palavras_demais', 'selic');

    const shortLong = clone('selic');
    shortLong.short = 'x'.repeat(221);
    expectCode(withTopic(shortLong), 'resumo', 'selic');

    const faq = clone('empresa-ve');
    faq.subtitle = 'Não pode ter subtítulo';
    expectCode(withTopic(faq), 'subtitulo', 'empresa-ve');

    const unknownDecision = clone('empresa-ve');
    unknownDecision.sources = [{ kind: 'clarevo', refs: ['D-999'] }];
    expect(validateLearnCatalog(withTopic(unknownDecision), { today: '2026-10-09', decisionIds: ['D-006'] }).map((p) => `${p.code}:${p.detail}`)).toContain('decisao_desconhecida:D-999');

    const draftWithoutPending = clone('orcamento-50-30-20');
    delete draftWithoutPending.pending;
    expectCode(withTopic(draftWithoutPending), 'rascunho_sem_pendencia', 'orcamento-50-30-20');

    const reordered = [...TOPICS].reverse();
    expectCode(reordered, 'catalogo_diferente', '*');
  });
});

describe('consulta ao catálogo', () => {
  it('apelidos abrem o tema novo; rascunho e desconhecido não abrem (R12)', () => {
    expect(topicBySlug('reservas')!.slug).toBe('reserva-imprevistos');
    expect(topicBySlug('juros')!.slug).toBe('juros-simples-compostos');
    expect(topicBySlug('juros-compostos')!.slug).toBe('juros-simples-compostos');
    expect(topicBySlug('cartao-rotativo')!.slug).toBe('rotativo-cartao');
    expect(topicBySlug('atraso')!.slug).toBe('multa-juros-atraso');
    expect(topicBySlug('inflacao')!.slug).toBe('inflacao-ipca');
    expect(topicBySlug('liquidez')!.slug).toBe('liquidez-risco-retorno');
    expect(topicBySlug('taxa-mensal-anual')!.slug).toBe('taxa-mes-ano');
    expect(topicBySlug('juros-no-parcelamento')!.slug).toBe('amortizacao-price-sac');
    expect(resolveTopicSlug('reservas')).toBe('reserva-imprevistos');
    expect(topicBySlug('orcamento-50-30-20')).toBeNull();
    expect(topicBySlug('apagar-dados')).toBeNull();
    expect(anyTopicBySlug('orcamento-50-30-20')!.status).toBe('rascunho');
    expect(topicBySlug('nao-existe')).toBeNull();
    expect(resolveTopicSlug('nao-existe')).toBeNull();
    expect(isTopicPublished('taxa-e-tarifa')).toBe(true);
    expect(isTopicPublished('apagar-dados')).toBe(false);
  });

  it('relacionados: só publicados, sem o próprio tema', () => {
    expect(relatedTopics('gasto-fixo-variavel').map((t) => t.slug)).toEqual(['gasto-fixo', 'contas-do-ano']);
    expect(relatedTopics('quem-ve-meus-dados').map((t) => t.slug)).toEqual(['empresa-ve']);
    for (const t of TOPICS) for (const r of relatedTopics(t.slug)) expect(r.status).toBe('publicado');
  });

  it('seções na ordem da tela, com os temas publicados; Comece por aqui publicado', () => {
    const sections = topicsBySection();
    expect(sections.map((s) => s.section.title)).toEqual(['Usar o Clarevo', 'Organizar o mês', 'Juros e crédito', 'Dinheiro no tempo', 'Dúvidas frequentes']);
    expect(sections.map((s) => s.topics.length)).toEqual([8, 3, 13, 4, 7]);
    expect(LEARN_SECTIONS.length).toBe(5);
    expect([...START_HERE]).toEqual(['diferenca', 'juros-simples-compostos', 'gasto-fixo']);
    for (const slug of START_HERE) expect(isTopicPublished(slug)).toBe(true);
  });

  it('"Fazer a conta com os seus números": calculadora de cada tema (spec5_notes §2) e parâmetros aceitos pela calculadora', () => {
    const expected: Partial<Record<TopicSlug, string>> = {
      'parcelado-ou-a-vista': 'parcelado-ou-a-vista',
      'quitar-antes': 'quitar-antes',
      'multa-juros-atraso': 'multa-e-juros',
      'rotativo-cartao': 'custo-da-divida?modo=rotativo',
      'cheque-especial': 'custo-da-divida?modo=cheque_especial',
      'juros-simples-compostos': 'custo-da-divida',
      'taxa-mes-ano': 'custo-da-divida',
      cet: 'custo-da-divida?modo=emprestimo',
      'reserva-imprevistos': 'reserva',
      'contas-do-ano': 'parcelado-ou-a-vista?modo=cota-unica',
    };
    const actual: Partial<Record<TopicSlug, string>> = {};
    for (const t of TOPICS) {
      const c = topicCalculator(t.slug);
      if (!c) continue;
      const query = new URLSearchParams(c.params as Record<string, string>).toString();
      actual[t.slug] = query ? `${c.slug}?${query}` : c.slug;
      // Todo parâmetro do link é lido pela calculadora (calcPrefill ignora o que é inválido).
      expect(Object.keys(calcPrefill(c.slug, c.params)).length, t.slug).toBe(Object.keys(c.params).length);
    }
    expect(actual).toEqual(expected);
    // O orçamento 50-30-20 não liga com "Dividir as contas da casa" (o texto não trata de dividir contas).
    expect(anyTopicBySlug('orcamento-50-30-20')!.calculator).toBeUndefined();
  });
});
