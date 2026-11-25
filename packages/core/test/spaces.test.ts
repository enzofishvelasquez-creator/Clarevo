/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BUSINESS_TEXT, FAMILY_TEXT, FIRST_STEPS_TEXT, GUIDE_ENTRIES, SPACE_TEXT, spaceChoices } from '../src';

/** Termos que nenhum texto do app usa (o mesmo critério de copy.test.ts). */
const FORBIDDEN =
  /\b(recomendamos|recomendo|invista|aplique|tesouro|cdb|lci|lca|caixinha|cofrinho)\b|fundo de investimento|rentabilidade garantida|rendimento garantido|retorno garantido|enriquec|faz(er|endo)?\s+sentido|[–—]/i;
/** Julgamento e pressão: a folha só diz para quem é cada espaço. */
const PRESSURE = /\b(cuidado|aten[cç][aã]o|alerta|deveria|precisa|não perca|agora mesmo|urgente)\b/i;

const app = (rel: string): string => readFileSync(fileURLToPath(new URL(`../../../apps/app/src/${rel}`, import.meta.url)), 'utf8');
const repo = (rel: string): string => readFileSync(fileURLToPath(new URL(`../../../${rel}`, import.meta.url)), 'utf8');

describe('seletor de espaço sempre à vista (D-113b)', () => {
  it('só com o Pessoal: o Pessoal e, para criar, o Negócio e depois a Família', () => {
    expect(spaceChoices(false, null)).toEqual({ spaces: [{ kind: 'pessoal', label: 'Pessoal' }], creatable: ['negocio', 'familia'] });
  });

  it('com a Família e o negócio: os três, na ordem do seletor, e nada para criar', () => {
    expect(spaceChoices(true, { name: 'Sacolé da Maria' })).toEqual({
      spaces: [
        { kind: 'pessoal', label: 'Pessoal' },
        { kind: 'familia', label: 'Família' },
        { kind: 'negocio', label: 'Sacolé da Maria' },
      ],
      creatable: [],
    });
  });

  it('esconde o que a pessoa já tem: com o negócio, só a Família para criar; com a Família, só o Negócio', () => {
    expect(spaceChoices(false, { name: 'Conserto' }).creatable).toEqual(['familia']);
    expect(spaceChoices(true, null).creatable).toEqual(['negocio']);
  });

  it('enquanto a leitura não chegou, o espaço não aparece nem é oferecido para criar (o "+" não pisca)', () => {
    expect(spaceChoices(undefined, undefined)).toEqual({ spaces: [{ kind: 'pessoal', label: 'Pessoal' }], creatable: [] });
    expect(spaceChoices(undefined, null).creatable).toEqual(['negocio']);
    expect(spaceChoices(false, undefined).creatable).toEqual(['familia']);
  });

  it('o nome do negócio vazio vira "Negócio" no seletor', () => {
    expect(spaceChoices(false, { name: '  ' }).spaces[1]).toEqual({ kind: 'negocio', label: 'Negócio' });
  });

  it('o "+" diz o que dá para criar: "Criar um espaço: Negócio ou Família"', () => {
    expect(SPACE_TEXT.createA11y(['negocio', 'familia'])).toBe('Criar um espaço: Negócio ou Família');
    expect(SPACE_TEXT.createA11y(['negocio'])).toBe('Criar um espaço: Negócio');
    expect(SPACE_TEXT.createA11y(['familia'])).toBe('Criar um espaço: Família');
  });

  it('a folha: o Espaço Negócio com a frase de para quem é (a mesma do núcleo) e a Família com a dela', () => {
    expect(SPACE_TEXT.businessOption).toBe('Espaço Negócio');
    expect(SPACE_TEXT.businessHint).toBe('Para quem tem CNPJ ou trabalha por conta.');
    expect(BUSINESS_TEXT.accountHintNone).toContain('Para quem tem CNPJ ou trabalha por conta');
    expect(SPACE_TEXT.familyOption).toBe('Família');
    expect(SPACE_TEXT.familyHint).toBe(FAMILY_TEXT.spaceHint);
    expect(SPACE_TEXT.optionA11y('negocio')).toBe('Espaço Negócio. Para quem tem CNPJ ou trabalha por conta.');
    expect(SPACE_TEXT.choiceA11y({ kind: 'negocio', label: 'Sacolé da Maria' })).toBe('Negócio Sacolé da Maria');
    expect(SPACE_TEXT.choiceA11y({ kind: 'pessoal', label: 'Pessoal' })).toBe('Pessoal');
  });

  it('os textos novos seguem as regras de escrita: sem travessão, sem a expressão proibida, sem pressão nem julgamento', () => {
    const texts = [
      SPACE_TEXT.createA11y(['negocio', 'familia']),
      SPACE_TEXT.createTitle,
      SPACE_TEXT.createIntro,
      SPACE_TEXT.switchTitle,
      SPACE_TEXT.switchGroup,
      SPACE_TEXT.businessHint,
      SPACE_TEXT.familyHint,
      SPACE_TEXT.pillHint,
      SPACE_TEXT.close,
      BUSINESS_TEXT.firstStepsTip,
      BUSINESS_TEXT.overviewTitle,
      BUSINESS_TEXT.accountOpen,
    ];
    for (const t of texts) {
      expect(t, t).not.toMatch(FORBIDDEN);
      expect(t, t).not.toMatch(PRESSURE);
    }
  });
});

describe('"Seu negócio" (D-113b: o novo nome da visão do negócio)', () => {
  it('o título da tela, o card do Resumo do negócio e o botão de Conta', () => {
    expect(BUSINESS_TEXT.overviewTitle).toBe('Seu negócio');
    expect(BUSINESS_TEXT.overviewLink).toBe('Seu negócio');
    expect(BUSINESS_TEXT.accountOpen).toBe('Ver seu negócio');
    expect(BUSINESS_TEXT.withdrawalBusinessNote).toContain('"Seu negócio"');
  });

  it('o guia (e a Ajuda do site, que lê o guia) usa o nome novo, e nenhum texto do núcleo usa o antigo', () => {
    const entry = GUIDE_ENTRIES.find((e) => e.id === 'negocio')!;
    expect(entry.screenName).toBe('Seu negócio');
    expect(entry.steps.some((s) => s.includes('"Seu negócio"'))).toBe(true);
    const old = /como est[aá] o neg[oó]cio/i;
    for (const e of GUIDE_ENTRIES) for (const t of [e.title, e.purpose, e.screenName, ...e.steps]) expect(t, e.id).not.toMatch(old);
    for (const v of Object.values(BUSINESS_TEXT)) if (typeof v === 'string') expect(v).not.toMatch(old);
    for (const file of ['packages/core/src/business.ts', 'packages/core/src/guide/catalog.ts', 'apps/app/src/app/negocio/index.tsx', 'apps/app/src/components/business-parts.tsx', 'apps/app/src/app/conta.tsx']) {
      expect(repo(file), file).not.toMatch(old);
    }
  });

  it('o guia do espaço Negócio e da Família ensina o "+" do seletor e a pílula das telas de consulta', () => {
    const negocio = GUIDE_ENTRIES.find((e) => e.id === 'negocio')!;
    expect(negocio.steps[0]).toContain(`"${SPACE_TEXT.businessOption}"`);
    expect(negocio.steps.join(' ')).toContain('pílula do espaço');
    const familia = GUIDE_ENTRIES.find((e) => e.id === 'familia')!;
    expect(familia.steps.join(' ')).toContain('seletor de espaço');
  });
});

describe('no app (lido como código-fonte)', () => {
  const header = app('components/header.tsx');
  const sheet = app('components/space-sheet.tsx');

  it('o seletor das abas só aparece com mais de um espaço (D-125, sinal 22), e o "+" fica fora da lista de abas', () => {
    const fn = header.slice(header.indexOf('export function ContextSwitch()'), header.indexOf('function ContextSwitchTrack'));
    expect(fn).toContain('if (spaces.length < 2) return null;');
    expect(fn).toContain('SPACE_TEXT.createA11y(creatable)');
    const track = header.slice(header.indexOf('function ContextSwitchTrack'));
    expect(track).toContain('accessibilityRole="tablist"');
    expect(track).toContain('<SpaceSheet mode="criar"');
    // A animação de 200 ms e "reduzir movimento" continuam (revisão de 23/11/2026: a pílula branca acompanha a posição e a largura medidas
    // da opção escolhida, porque cada opção tem a largura do nome).
    expect(track).toContain('if (reduced || !placed) {');
    expect(track).toContain('x.value = withTiming(spotX, { duration: motion.context });');
    expect(track).toContain('w.value = withTiming(spotW, { duration: motion.context });');
    // O nome longo do negócio é cortado com reticências.
    expect(track).toContain('numberOfLines={1}');
  });

  it('a pílula só vira botão com `switchable` e nunca com `fixed`; o nome acessível continua "Espaço: ..."', () => {
    const pill = header.slice(header.indexOf('export function ContextPill('), header.indexOf('export function ContextSwitch()'));
    // Só com mais de um espaço a pílula troca (D-125, sinal 22); só com o Pessoal, ela só diz o espaço.
    expect(pill).toContain('const canSwitch = Boolean(switchable) && !fixed && choices.spaces.length > 1;');
    expect(pill).toContain('accessibilityLabel={`Espaço: ${text}`}');
    expect(pill).toContain('<SpaceSheet mode="trocar"');
  });

  it('as telas de consulta que leem o espaço têm a pílula que troca; formulários e detalhes não', () => {
    for (const f of [
      'app/analises.tsx',
      'app/calendario.tsx',
      'app/evolucao.tsx',
      'app/a-pagar/index.tsx',
      'app/a-pagar/vencidas.tsx',
      'app/cartoes/index.tsx',
      'app/orcamento/index.tsx',
      'app/movimentacoes/buscar.tsx',
      'app/gastos-fixos/index.tsx',
      'app/gastos-fixos/assinaturas.tsx',
      'app/composicao.tsx',
      'app/seu-mes.tsx',
      'components/accounts-card.tsx',
    ]) expect(app(f), f).toMatch(/<ContextPill label="Pessoal" switchable \/>/);
    for (const f of ['components/record-form.tsx', 'components/series-form.tsx', 'components/commitment-form.tsx', 'app/registro/[id]/index.tsx', 'app/a-pagar/[id]/index.tsx', 'app/cartoes/[id]/index.tsx', 'app/negocio/index.tsx', 'app/(tabs)/investimentos.tsx']) {
      expect(app(f), f).not.toContain('switchable');
    }
  });

  it('a folha leva o Negócio a /negocio/novo e a Família à tela Família; trocar de espaço usa o mesmo estado das abas', () => {
    expect(sheet).toContain("router.push(kind === 'negocio' ? '/negocio/novo' : '/familia')");
    expect(sheet).toContain('setSpace(kind)');
    expect(sheet).toContain('accessibilityRole="radiogroup"');
  });

  it('Conta: o Espaço Negócio e a Família logo depois da assinatura, na seção "Plano e espaços", antes do benefício e de "Este aparelho"', () => {
    const conta = app('app/conta.tsx');
    const access = conta.indexOf('<AccessCard />');
    const business = conta.indexOf('BUSINESS_TEXT.accountTitle');
    const family = conta.indexOf('FAMILY_TEXT.accountTitle');
    expect(conta.indexOf('<SectionTitle>{ACCOUNT_SECTIONS.plan}</SectionTitle>')).toBeLessThan(access);
    expect(access).toBeGreaterThan(conta.indexOf('<LevelCard />'));
    expect(business).toBeGreaterThan(access);
    expect(family).toBeGreaterThan(business);
    expect(family).toBeLessThan(conta.indexOf('<BenefitCard />'));
    expect(conta.indexOf('<BenefitCard />')).toBeLessThan(conta.indexOf('<SectionTitle>{ACCOUNT_SECTIONS.device}</SectionTitle>'));
    // Sem widget no navegador (auditoria de 18/11/2026).
    expect(conta).toContain("{Platform.OS === 'web' ? null : <WidgetCard />}");
  });

  it('Primeiros passos: "Tem um negócio?" só para quem não tem negócio, sem contar como passo', () => {
    const pp = app('components/primeiros-passos.tsx');
    expect(BUSINESS_TEXT.firstStepsTip).toBe('Tem um negócio? Crie o espaço Negócio');
    expect(pp).toContain('const noBusiness = business.isSuccess && business.data === null;');
    expect(pp).toContain("router.push('/negocio/novo')");
    // Os quatro passos continuam quatro; os dois jeitos rápidos (importar e o Telegram) vêm antes deles, sem contar como passo.
    expect(FIRST_STEPS_TEXT.intro).toBe('Quatro passos para a Clarevo mostrar o seu mês de verdade.');
    expect(pp).toContain('{FIRST_STEPS_TEXT.intro}');
    expect(pp).toContain("router.push('/importar')");
    expect(pp).toContain("router.push('/conta/telegram')");
  });
});
