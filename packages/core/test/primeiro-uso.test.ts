/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CALC_UI_TEXT,
  DEMO_URL,
  FIRST_ACCOUNT_TEXT,
  FIRST_STEPS_TEXT,
  TAB_LABEL_MAX_FONT_SCALE,
  TRIAL_DAYS,
  WELCOME_TEXT,
  barTabFor,
  completeMoneyText,
  isNoTabArea,
  maskMoneyTyping,
  parseBRL,
  splitCalcNotes,
  tabLabelsShown,
  topicTabFor,
} from '../src';

/**
 * Primeiro uso e acabamento (D-125, estudo de 25/11/2026, Onda 1, itens 8 e 9; sinais 19 a 23 e 26): boas-vindas com o teste grátis e a
 * demonstração à vista, o primeiro passo com importar e o Telegram, o tour sob pedido, a aba certa nas telas de Conta, as abas com letra
 * grande, a máscara de moeda nos campos e o resultado das calculadoras que começa pela resposta.
 */
const raiz = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const ler = (p: string) => readFileSync(raiz(p), 'utf8');

const FORBIDDEN = /[–—]|\bfaz(er|endo)?\s+sentido\b|bem-vind[oa]|usu[aá]ri[oa]s?\b|recomend|invista|aplique/i;

describe('boas-vindas (sinal 19)', () => {
  it('diz o teste grátis de 14 dias sem cartão e o que acontece depois, sem pressão', () => {
    expect(TRIAL_DAYS).toBe(14);
    expect(WELCOME_TEXT.trial).toBe('14 dias grátis, sem cartão');
    expect(WELCOME_TEXT.trialNote).toContain('vendo e exportando');
    expect(WELCOME_TEXT.demo).toBe('Ver a demonstração');
    expect(WELCOME_TEXT.demoNote).toContain('dados fictícios');
    for (const t of Object.values(WELCOME_TEXT)) expect(t).not.toMatch(FORBIDDEN);
  });

  it('um caminho principal e um segundo à vista; entrar e o convite continuam, como links menores', () => {
    const tela = ler('apps/app/src/app/boas-vindas.tsx');
    // Dois botões grandes: "Criar conta" (o principal) e "Ver a demonstração" (o segundo, suave), e o do convite, só com o campo aberto.
    expect(tela.match(/<Button\b/g)).toHaveLength(3);
    expect(tela).toMatch(/<Button label=\{WELCOME_TEXT\.create\}/);
    expect(tela).toMatch(/label=\{opening \? WELCOME_TEXT\.demoOpening : WELCOME_TEXT\.demo\}\s*tone="soft"/);
    expect(tela).toContain("router.push('/entrar')");
    expect(tela).toContain("router.push('/criar-conta')");
    expect(tela).toContain('ENTRY_INVITE_TEXT.open');
    // Na versão publicada, a demonstração abre no navegador; no build de demonstração, entra na conta fictícia.
    expect(tela).toContain('Linking.openURL(DEMO_URL)');
    expect(tela).toContain('demo.signInDemo()');
  });

  it('o endereço da demonstração é o mesmo do site', () => {
    expect(DEMO_URL).toBe('https://demo.clarevo.app.br');
    expect(ler('scripts/site/config.js')).toContain(`const URL_DEMO = '${DEMO_URL}';`);
  });
});

describe('primeiro passo e Primeiros passos (Onda 1, item 8)', () => {
  it('"Sua primeira conta" oferece importar e o Telegram ao lado de "Começar meu mês", e os três criam a mesma conta vazia', () => {
    const tela = ler('apps/app/src/app/primeira-conta.tsx');
    expect(FIRST_ACCOUNT_TEXT.importLabel).toBe('Importar extrato, fatura ou print');
    expect(FIRST_ACCOUNT_TEXT.telegramLabel).toBe('Anotar pelo Telegram');
    expect(tela).toContain('label="Começar meu mês"');
    expect(tela).toContain("submit('importar')");
    expect(tela).toContain("submit('telegram')");
    // Os três passam pela mesma criação do espaço; só o destino muda (nenhum dado de exemplo).
    expect(tela.match(/ensurePersonalSpace\(/g)).toHaveLength(1);
    expect(tela).toContain("firstStepTarget.set(start === 'importar' ? '/importar' : start === 'telegram' ? '/conta/telegram' : null);");
    expect(ler('apps/app/src/app/_layout.tsx')).toContain('const firstStep = firstStepTarget.take();');
    for (const t of Object.values(FIRST_ACCOUNT_TEXT)) expect(t).not.toMatch(FORBIDDEN);
  });

  it('o card começa pelos dois jeitos rápidos, que não contam como passo', () => {
    const card = ler('apps/app/src/components/primeiros-passos.tsx');
    expect(card.indexOf('FIRST_STEPS_TEXT.quickTitle')).toBeGreaterThan(0);
    expect(card.indexOf('FIRST_STEPS_TEXT.quickTitle')).toBeLessThan(card.indexOf('accessibilityRole="progressbar"'));
    expect(FIRST_STEPS_TEXT.intro).toBe('Quatro passos para a Clarevo mostrar o seu mês de verdade.');
    expect(card).toContain("key: 'fixos'");
    expect(card).not.toContain("key: 'importar' | 'telegram' | 'fixos'");
    for (const t of Object.values(FIRST_STEPS_TEXT)) expect(t).not.toMatch(FORBIDDEN);
  });
});

describe('aba marcada nas telas fora das abas (sinal 21)', () => {
  it('a área de Conta não marca aba nenhuma, por qualquer caminho', () => {
    for (const path of ['/conta', '/conta/', '/conta/exportar', '/conta/telegram', '/familia', '/familia/convidar', '/empresa', '/contabilidade', '/contabilidade/abc']) {
      expect(isNoTabArea(path), path).toBe(true);
      for (const origin of ['/', '/investimentos', '/aprender', null] as const) expect(barTabFor(path, origin), `${path} de ${origin}`).toBeNull();
    }
  });

  it('o que se abre por cima da Conta também fica sem aba; as outras telas seguem a aba de origem ou a do assunto', () => {
    expect(barTabFor('/negocio', '/', true)).toBeNull();
    expect(barTabFor('/quem-ve', '/metas', true)).toBeNull();
    expect(barTabFor('/a-pagar', '/')).toBe('/');
    expect(barTabFor('/a-pagar', null)).toBe('/movimentacoes');
    expect(barTabFor('/a-pagar', null)).toBe(topicTabFor('/a-pagar'));
    expect(isNoTabArea('/contas/nova')).toBe(false);
    expect(isNoTabArea('/contabilidades')).toBe(false);
  });

  it('a barra de baixo e a lateral do computador usam a mesma regra', () => {
    expect(ler('apps/app/src/components/tab-bar.tsx')).toContain('barTabFor(pathname, origin, contaBelow(navState))');
    expect(ler('apps/app/src/components/desktop-nav.tsx')).toContain('isNoTabArea(path) || fromConta');
  });
});

describe('letra grande (sinal 20)', () => {
  it('as abas mostram o rótulo até 1,3 vez; acima, só o ícone (o nome continua para o leitor de tela)', () => {
    expect(TAB_LABEL_MAX_FONT_SCALE).toBe(1.3);
    expect(tabLabelsShown(1)).toBe(true);
    expect(tabLabelsShown(1.3)).toBe(true);
    expect(tabLabelsShown(1.31)).toBe(false);
    expect(tabLabelsShown(2)).toBe(false);
    const bar = ler('apps/app/src/components/tab-bar.tsx');
    expect(bar).toContain('accessibilityLabel={a11y}');
    expect(bar).toContain('{labeled ? (');
  });

  it('valores em reais numa linha que encolhe para caber: Money, FitMoney e o total de Investir', () => {
    const ui = ler('apps/app/src/components/ui.tsx');
    expect(ui).toMatch(/export function FitTxt[\s\S]*numberOfLines=\{1\} adjustsFontSizeToFit minimumFontScale=\{minimumFontScale\}/);
    expect(ui).toMatch(/export function Money\([\s\S]*?<FitTxt variant=\{variant\}/);
    expect(ui).toMatch(/export function FitMoney\([\s\S]*?<FitTxt\s/);
    expect(ler('apps/app/src/app/(tabs)/investimentos.tsx')).toContain('<MoneyTxt fit color={colors.textOnBrand}');
  });
});

describe('máscara de moeda nos campos (sinal 26)', () => {
  const type = (keys: string) => [...keys].reduce((acc, k) => maskMoneyTyping(acc, acc + k), '');

  it('agrupa os milhares durante a digitação e completa ao sair do campo', () => {
    expect(type('2000')).toBe('2.000');
    expect(type('1234567')).toBe('1.234.567');
    expect(type('2000,5')).toBe('2.000,5');
    expect(completeMoneyText('2.000')).toBe('2.000,00');
    expect(completeMoneyText('400')).toBe('400,00');
    expect(completeMoneyText('12,5')).toBe('12,50');
    expect(completeMoneyText('abc')).toBe('abc');
    expect(completeMoneyText('')).toBe('');
  });

  it('o ponto digitado vale como vírgula; apagar reagrupa; colar segue a leitura de parseBRL', () => {
    expect(type('12.50')).toBe('12,50');
    expect(type('1250.5')).toBe('1.250,5');
    expect(maskMoneyTyping('12,5', '12,5.')).toBe('12,5');
    expect(maskMoneyTyping('1.250', '1.25')).toBe('125');
    expect(maskMoneyTyping('', '12.50')).toBe('12,50');
    expect(maskMoneyTyping('', '1.250')).toBe('1.250');
    expect(maskMoneyTyping('', '1234.56')).toBe('1.234,56');
    expect(maskMoneyTyping('', '1.2345,00')).toBe('1.2345,00');
    expect(maskMoneyTyping('', '0.500')).toBe('0.500');
    expect(maskMoneyTyping('', 'R$ 80')).toBe('R$ 80');
    expect(maskMoneyTyping('', '1,2,3')).toBe('1,2,3');
    expect(type('0500')).toBe('500');
  });

  it('o valor lido nunca muda com a máscara', () => {
    for (const raw of ['80', '80,5', '1234', '1234,56', '12.50', '1.250', '999999999', '0,99', '10000,00']) {
      expect(parseBRL(maskMoneyTyping('', raw)), raw).toBe(parseBRL(raw));
      expect(parseBRL(completeMoneyText(maskMoneyTyping('', raw))), raw).toBe(parseBRL(raw));
    }
  });

  it('vale em todo campo com o prefixo "R$" (o TextField aplica as duas funções)', () => {
    const ui = ler('apps/app/src/components/ui.tsx');
    expect(ui).toContain("const money = prefix === 'R$';");
    expect(ui).toContain('onChangeText(maskMoneyTyping(current, text))');
    expect(ui).toContain('const complete = completeMoneyText(current);');
  });
});

describe('menos texto antes do conteúdo (sinal 23)', () => {
  it('o resultado das calculadoras começa pela resposta; avisos e hipóteses ficam em "Como a conta é feita", e o de estimativa à vista', () => {
    expect(CALC_UI_TEXT.howTitle).toBe('Como a conta é feita');
    const notes = [
      'A conta usa só a taxa de juros, sem o CET. O CET da fatura ou do extrato soma o IOF e as tarifas, por isso o custo real pode ser maior.',
      'Desde 2024, os juros e os encargos do rotativo não podem passar do valor que ficou sem pagar (Lei 14.690/2023). Por isso, a conta para nesse teto.',
      'O IOF é estimado.',
    ];
    const split = splitCalcNotes(notes);
    expect(split.shown).toEqual([notes[0], notes[2]]);
    expect(split.folded).toEqual([notes[1]]);
    const parts = ler('apps/app/src/components/calc/parts.tsx');
    expect(parts).toContain('<HowSection>');
    expect(parts).toContain('aria-expanded={open}');
  });

  it('a regra do cartão no Orçamento não abre a tela: vem no fim, só com algum cartão', () => {
    const tela = ler('apps/app/src/app/orcamento/index.tsx');
    expect(tela.indexOf('{BUDGET_TEXT.rule}')).toBeGreaterThan(tela.indexOf('BUDGET_TEXT.withoutTitle'));
    expect(tela).toContain('{cardRule ? (');
  });
});
