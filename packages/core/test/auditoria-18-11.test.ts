/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ACCOUNTS_TEXT,
  BENEFIT_TEXT,
  BUSINESS_WORDS,
  CALC_DISCLAIMER,
  CALC_NOTICE,
  CARDS_TEXT,
  DELETE_TEXT,
  EXPORT_TEXT,
  FAMILY_TEXT,
  GUIDE_ENTRIES,
  INVESTMENT_GOAL_TEXT,
  INVESTMENT_TEXT,
  LEARN_UI_TEXT,
  ORGANIZE_TEXT,
  PERFORMANCE_TEXT,
  SEASONAL_TEXT,
  WHO_SEES_TEXT,
  calcNotice,
  evolutionStartWindow,
  searchAppScreens,
  seriesCaptionShort,
} from '../src';

/** Termos que nenhum texto do app usa (o mesmo critério de copy.test.ts). */
const FORBIDDEN =
  /\b(recomendamos|recomendo|invista|aplique|caixinha|cofrinho)\b|fundo de investimento|rentabilidade garantida|rendimento garantido|retorno garantido|enriquec|faz(er|endo)?\s+sentido|[–—]/i;

const app = (rel: string): string => readFileSync(fileURLToPath(new URL(`../../../apps/app/src/${rel}`, import.meta.url)), 'utf8');

describe('auditoria visual de 18/11/2026', () => {
  it('1. Aprender não mostra os códigos das decisões como fonte: a linha interna é "Como o app da Clarevo funciona"', () => {
    const line = LEARN_UI_TEXT.sourceLine({ kind: 'clarevo', refs: ['D-020', 'D-021'] });
    expect(line).toBe('Como o app da Clarevo funciona');
    expect(line).not.toMatch(/D-\d{3}/);
    const screen = app('app/explicacao/[tema].tsx');
    expect(screen).toContain('<InternalSourceLine reviewedOn={onlyInternal ? topic.reviewedOn : null} />');
    expect(screen).not.toContain('[...external, ...internal]');
  });

  it('2. a tabela de Movimentos no computador: categoria e conta em até duas linhas, com largura mínima', () => {
    const table = app('components/records-table.tsx');
    expect(table.match(/numberOfLines=\{2\}/g)?.length).toBe(2);
    expect(table).toContain('cat: { flex: 1.2, minWidth: 112 }');
    expect(app('app/(tabs)/movimentacoes.tsx')).toContain('wideSide: { width: 312');
  });

  it('3. dinheiro numa cor só: Recebido e as linhas sem verde; as contas vencidas do Resumo sem a cor de erro nem o ícone de alerta', () => {
    for (const f of ['components/record-row.tsx', 'components/records-table.tsx']) expect(app(f), f).not.toMatch(/color=\{isIn \? colors\.success : colors\.text\}/);
    expect(app('app/(tabs)/movimentacoes.tsx')).not.toContain("cents: s.receivedCents, color: colors.success");
    const resumo = app('app/(tabs)/index.tsx');
    expect(resumo).not.toMatch(/AlertCircle|colors\.error/);
    expect(resumo).toContain('<CalendarX size={16} color={colors.text} aria-hidden />');
  });

  it('4. o Desempenho tem card próprio logo abaixo do total, e a busca "No app" acha a tela por desempenho, CDI, IPCA e poupança', () => {
    expect(PERFORMANCE_TEXT.cardTitle).toBe('Desempenho: comparar com CDI, IPCA e poupança');
    const tab = app('app/(tabs)/investimentos.tsx');
    expect(tab.indexOf('<PerformanceCard />')).toBeGreaterThan(tab.indexOf('<Summary active={active}'));
    expect(tab.indexOf('<PerformanceCard />')).toBeLessThan(tab.indexOf('T.newInvestment'));
    for (const q of ['desempenho', 'CDI', 'IPCA', 'poupança', 'indicadores']) expect(searchAppScreens(q)[0]?.id, q).toBe('investimentos-desempenho');
  });

  it('5. avisos curtos: a calculadora numa linha, Investir numa frase, Bancos e carteira sem repetir o saldo, Exportar sem "parecer jurídico"', () => {
    expect(CALC_NOTICE).toBe('Simulação com os seus números. Não é recomendação nem oferta de crédito.');
    expect(CALC_NOTICE.length).toBeLessThan(CALC_DISCLAIMER.length);
    expect(calcNotice('dividir-contas')).toBe('Cálculo com os seus números. O que vale é o combinado da casa.');
    expect(app('components/calc/parts.tsx')).not.toContain('styles.disclaimer');
    expect(INVESTMENT_TEXT.closingNote.split(/(?<=\.)\s/).length).toBe(1);
    expect(INVESTMENT_TEXT.disclaimer.split(/(?<=\.)\s/).length).toBe(1);
    expect(app('components/accounts-card.tsx')).not.toContain('ACCOUNTS_TEXT.balanceNote');
    expect(ACCOUNTS_TEXT.intro).toContain('não guarda saldo');
    expect(EXPORT_TEXT.portability).not.toMatch(/parecer/);
    for (const t of [CALC_NOTICE, INVESTMENT_TEXT.closingNote, INVESTMENT_TEXT.disclaimer, EXPORT_TEXT.portability]) expect(t).not.toMatch(FORBIDDEN);
  });

  it('5. "Quem vê estes dados?" em duas listas, com cada fato da tela de antes e "a empresa não vê" uma vez só', () => {
    expect(WHO_SEES_TEXT.seesTitle).toBe('Quem vê');
    expect(WHO_SEES_TEXT.notSeesTitle).toBe('Quem não vê');
    // O que a empresa vê (BENEFIT_TEXT.whoSees): os e-mails que convidou, a situação e as datas; e o que não vê, nem somado, nem o uso do app.
    expect(WHO_SEES_TEXT.companySees).toContain('(convite enviado, convite cancelado, ativa ou encerrada) e as datas');
    expect(BENEFIT_TEXT.whoSees).toContain('(convite enviado, convite cancelado, ativa ou encerrada) e as datas');
    for (const fact of ['valores', 'categorias', 'metas', 'contas', 'cartões', 'gastos fixos', 'parcelamentos', 'contas do ano', 'renda', 'simulações', 'a data da sua última anotação', 'a revisão dos últimos meses', 'o plano de guardar', 'a Família de ninguém', 'nem somados', 'se ou quando você usa o app depois de aceitar']) {
      expect(WHO_SEES_TEXT.companyNotSees, fact).toContain(fact);
    }
    for (const fact of ['gastos fixos', 'parcelamentos', 'contas do ano (como IPVA, IPTU e matrícula)', 'renda de referência', 'renda comprometida', 'metas', 'simulações', 'plano de guardar']) {
      expect(WHO_SEES_TEXT.personalYou, fact).toContain(fact);
    }
    expect(WHO_SEES_TEXT.othersPersonal).toContain('a sua resposta ao plano de guardar ou as datas em que essa pergunta volta');
    const screen = app('app/quem-ve.tsx');
    expect(screen).toContain('FAMILY_TEXT.privacy');
    expect(screen).toContain('DELETE_TEXT.whoSees');
    expect(screen).not.toMatch(/GOALS_TEXT\.whoSeesGoals|SAVINGS_TEXT\.privacy|RETURN_TEXT\.privacy|BENEFIT_TEXT\.whoSees/);
    expect(DELETE_TEXT.whoSees).toContain('A empresa só vê que a licença terminou.');
    expect(FAMILY_TEXT.privacy).toContain('O Pessoal de cada pessoa continua só dela');
  });

  it('6. o card "Neste mês" desenha a calculadora como as linhas de tema, com "Calculadora" no lugar do tempo de leitura', () => {
    const card = app('components/season-card.tsx');
    expect(card).not.toContain('CalcNavRow');
    expect(card).toContain('tag={SEASONAL_TEXT.calculatorTag}');
    expect(SEASONAL_TEXT.calculatorTag).toBe('Calculadora');
  });

  it('7. Análises: a aba Evolução mostra os últimos meses e a aba Orçamento, cada categoria com a barra', () => {
    const parts = app('components/analises-parts.tsx');
    expect(parts).toContain('{result.recent.length > 1 ? <RecentMonths points={result.recent} /> : null}');
    expect(parts).toContain('<BudgetBar solidTenths={r.solidTenths} stripedTenths={r.stripedTenths} minimal />');
  });

  it('8. Resumo no computador: o orçamento na coluna principal e o cartão lima numa linha inteira embaixo', () => {
    const resumo = app('app/(tabs)/index.tsx');
    expect(resumo.indexOf("{wide && kind === 'pessoal' ? <BudgetPanel")).toBeLessThan(resumo.indexOf('<View style={wide ? styles.sideCol : styles.stack}>'));
    expect(resumo).toContain('<View style={styles.wideEnd}>');
  });

  it('9. Movimentos: os dois totais com a mesma altura e o valor embaixo', () => {
    expect(app('app/(tabs)/movimentacoes.tsx')).toContain("total: { flexGrow: 1, padding: space[4], gap: space[1], justifyContent: 'space-between' }");
  });

  it('10. espaço Negócio: entradas e saídas, sem renda comprometida e com exemplos do negócio', () => {
    expect([BUSINESS_WORDS.in, BUSINESS_WORDS.out, BUSINESS_WORDS.left, BUSINESS_WORDS.addOut, BUSINESS_WORDS.addIn]).toEqual(['Entrou', 'Saiu', 'Sobrou', 'Anotar saída', 'Anotar entrada']);
    expect(BUSINESS_WORDS.leftCaption('2026-10', '2026-10-07')).toBe('Entrou menos saiu até 07/10 · não é saldo');
    expect(BUSINESS_WORDS.inMonth('2026-10')).toBe('Entrou em outubro');
    for (const v of Object.values(BUSINESS_WORDS)) {
      const t = typeof v === 'function' ? (v as (m: string, d: string) => string)('2026-10', '2026-10-07') : v;
      expect(t, t).not.toMatch(/\b(Recebido|Pago|Anotar gasto|Registrar recebimento)\b/);
      expect(t).not.toMatch(FORBIDDEN);
    }
    expect(seriesCaptionShort([], true)).toBe('Nenhum cadastrado. Aluguel do ponto, DAS, maquininha, fornecedor');
    expect(ORGANIZE_TEXT.series.businessFallback).toContain('Aluguel do ponto');
    const resumo = app('app/(tabs)/index.tsx');
    expect(resumo).toContain("{kind === 'negocio' ? null : <CommittedRow contextId={contextId} />}");
    expect(app('components/card-parts.tsx')).toContain('committed = true');
  });

  it('11. Conta: o tema numa coluna em telas estreitas (nunca 2 + 1)', () => {
    expect(app('components/theme-card.tsx')).toContain("flexDirection: stacked ? 'column' : 'row'");
  });

  it('12. Evolução: abre em 3 meses quando o histórico é curto e recente; senão, em 6', () => {
    const row = (month: string, n: number) => ({ month, receivedCount: 0, paidCount: n });
    // A demonstração: setembro e outubro.
    expect(evolutionStartWindow([row('2026-05', 0), row('2026-09', 2), row('2026-10', 2)], '2026-10')).toBe(3);
    // Histórico em maio e junho (o cenário "evolucao"): 6 meses, para os dados aparecerem.
    expect(evolutionStartWindow([row('2026-05', 3), row('2026-06', 3)], '2026-10')).toBe(6);
    // Histórico longo: 6 meses, como sempre.
    expect(evolutionStartWindow(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map((m) => row(m, 1)), '2026-10')).toBe(6);
    // Conta sem nada: 6 meses.
    expect(evolutionStartWindow([], '2026-10')).toBe(6);
    const screen = app('app/evolucao.tsx');
    expect(screen).toContain('function Segmented(');
    expect(screen).not.toContain('<Chip ');
  });

  it('13. a entrada no computador com a mesma largura da faixa; "Página não encontrada" com o cabeçalho das telas internas', () => {
    expect(app('components/auth-shell.tsx')).toContain('flexGrow: 1, maxWidth: 560');
    const nf = app('components/not-found.tsx');
    expect(nf).toContain('<SubHeader title={NOT_FOUND_TEXT.title}');
  });

  it('15. a mesma ação com o mesmo nome: a ajuda dos cartões cita os dois botões, a aba e o título de Investir, e um padrão para voltar', () => {
    const cards = GUIDE_ENTRIES.find((e) => e.id === 'cartoes')!;
    expect(cards.steps[0]).toContain(`"${CARDS_TEXT.newCard}"`);
    expect(cards.steps[0]).toContain(`"${CARDS_TEXT.addAnotherCard}"`);
    expect(INVESTMENT_TEXT.tabTitle).toBe(INVESTMENT_TEXT.tabLabel);
    expect(LEARN_UI_TEXT.backToTask).toBe('Voltar para a tarefa');
    expect(LEARN_UI_TEXT.backToLearn).toBe('Voltar para Aprender');
  });

  it('16. pequenos: o link dos investimentos ligados diz o que abre; "Exemplo fictício." sozinho não ocupa um card', () => {
    expect(INVESTMENT_GOAL_TEXT.notCountedSee).toBe('Ver os investimentos ligados');
    expect(INVESTMENT_GOAL_TEXT.notCountedSeeA11y.startsWith(INVESTMENT_GOAL_TEXT.notCountedSee)).toBe(true);
    expect(app('components/topic-example.tsx')).toContain('const onlyFictional =');
  });
});
