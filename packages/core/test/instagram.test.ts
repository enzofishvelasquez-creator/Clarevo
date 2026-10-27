/// <reference types="node" />
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Instagram da Clarevo (D-069, `docs/25_INSTAGRAM.md`): a lógica pura do gerador `scripts/gerar-instagram.js`. Sem navegador e sem ffmpeg:
 * confere os limites do perfil (nome até 30 caracteres, bio até 150), as contas dos exemplos numéricos das peças (4.200 = 2.550 + 800 + 850;
 * 60,714% + 19,048% + 20,238%; 10 x 120 = 1.200; 6 x 120 = 720; 50 x 12 = 600), os contrastes do Manual v2.2, a redação de todo texto que
 * sai (sem travessão, sem a expressão proibida pelo CLAUDE.md, a marca no feminino, sem nome de pessoa real, sem promessa), a estrutura de cada peça e que os
 * nomes de tela do app que as artes citam existem de verdade no app. O desenho em si (margens, fontes e contraste do texto real) é conferido
 * pelo próprio gerador, em cada página, no navegador.
 */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(import.meta.url);

type Exemplos = Record<string, Record<string, unknown>>;
const calc = require(join(ROOT, 'scripts', 'instagram', 'calculos.js')) as {
  contarCaracteres: (t: string) => number;
  LIMITES: { nome: number; bio: number };
  reais: (c: number, o?: { centavos?: boolean }) => string;
  percentual: (parte: number, total: number, casas: number) => string;
  milesimos: (parte: number, total: number) => number;
  EXEMPLOS: Exemplos & { mes: { recebido: number; pago: number; aPagar: number; diferenca: number }; parcelado: { total: number } };
  conferirExemplos: (e?: unknown) => string[];
  contraste: (a: string, b: string) => number;
  PALETA: Record<string, string>;
  CONTRASTES_DO_MANUAL: { texto: string; fundo: string; relacao: number }[];
  PARES_EM_USO: { texto: string; fundo: string; soIcone?: boolean }[];
  conferirContrastes: () => string[];
  conferirRedacao: (texto: string, origem: string) => string[];
};
const conteudo = require(join(ROOT, 'scripts', 'instagram', 'conteudo.js')) as {
  PERFIL: { nome: string; bio: string[]; bioAcessoAberto: string[]; link: string };
  DESTAQUES: { id: string; nome: string }[];
  TERMOS_DO_APP: string[];
  PECAS: {
    id: string;
    paginas?: { modelo: string; nota?: string; numero?: string; corpo?: string }[];
    formato: string;
    legenda?: string;
    alt?: unknown;
    semArte?: boolean;
    roteiro?: { em?: number; tela?: string; fala: string }[];
    depende?: string[];
  }[];
  CALENDARIO: { dia: number; peca: string }[];
};
const validar = require(join(ROOT, 'scripts', 'instagram', 'validar.js')) as {
  validarTudo: (o?: { modelos?: unknown }) => string[];
  textosPublicos: () => { origem: string; texto: string }[];
  conferirValoresCitados: (t?: { origem: string; texto: string }[]) => string[];
  conferirRegrasDasPecas: (p?: unknown[]) => string[];
  PAGINAS_ESPERADAS: Record<string, number>;
};
const { MODELOS } = require(join(ROOT, 'scripts', 'instagram', 'modelos.js')) as { MODELOS: Record<string, unknown> };

const peca = (id: string) => {
  const p = conteudo.PECAS.find((x) => x.id === id);
  if (!p) throw new Error(`peça ${id} não existe`);
  return p;
};

describe('Instagram: perfil (D-069)', () => {
  it('o nome de exibição tem até 30 caracteres e a bio, até 150, mesmo se a quebra de linha valesse 2', () => {
    expect(calc.contarCaracteres(conteudo.PERFIL.nome)).toBe(30);
    expect(calc.contarCaracteres(conteudo.PERFIL.nome)).toBeLessThanOrEqual(calc.LIMITES.nome);
    for (const linhas of [conteudo.PERFIL.bio, conteudo.PERFIL.bioAcessoAberto]) {
      const total = calc.contarCaracteres(linhas.join('\n'));
      expect(total).toBeLessThanOrEqual(calc.LIMITES.bio);
      expect(total + linhas.length - 1).toBeLessThanOrEqual(calc.LIMITES.bio);
      expect(linhas).toHaveLength(3);
    }
    expect(conteudo.PERFIL.bio.map((l) => calc.contarCaracteres(l))).toEqual([54, 27, 36]);
    expect(calc.contarCaracteres(conteudo.PERFIL.bio.join('\n'))).toBe(119);
  });

  it('a bio de hoje segue o Playbook v2.2 com o acesso em preparação (D-067) e a bio do acesso aberto traz "Conheça a Clarevo"', () => {
    expect(conteudo.PERFIL.nome).toBe('Clarevo | Bem-estar financeiro');
    expect(conteudo.PERFIL.bio[0]).toBe('Cuidar da vida financeira faz parte de cuidar de você.');
    expect(conteudo.PERFIL.bio[1]).toBe('App para organizar seu mês.');
    expect(conteudo.PERFIL.bio[2]).toBe('Acompanhe as informações de acesso ↓');
    expect(conteudo.PERFIL.bioAcessoAberto[2]).toBe('Conheça a Clarevo ↓');
    expect(conteudo.PERFIL.link).toBe('clarevo.app.br/comece.html');
    expect(conteudo.PERFIL.link).not.toMatch(/[?&#]|utm_/);
  });

  it('são seis destaques, na ordem do Playbook, com "Para empresas" por último', () => {
    expect(conteudo.DESTAQUES.map((d) => d.nome)).toEqual(['Comece aqui', 'Na prática', 'Dúvidas', 'Quem faz', 'Ajuda', 'Para empresas']);
  });
});

describe('Instagram: as contas dos exemplos (centavos inteiros)', () => {
  const R = (n: number) => n * 100;

  it('4.200 = 2.550 + 800 + 850, e a diferença depois das despesas é 850', () => {
    const m = calc.EXEMPLOS.mes;
    expect(m.pago + m.aPagar + m.diferenca).toBe(m.recebido);
    expect(m.recebido - m.pago - m.aPagar).toBe(m.diferenca);
    expect([m.recebido, m.pago, m.aPagar, m.diferenca]).toEqual([R(4200), R(2550), R(800), R(850)]);
  });

  it('60,714% + 19,048% + 20,238% = 100,000%, e a uma casa 60,7% + 19,0% + 20,2% = 99,9%', () => {
    const m = calc.EXEMPLOS.mes;
    expect([m.pago, m.aPagar, m.diferenca].map((p) => calc.percentual(p, m.recebido, 3))).toEqual(['60,714', '19,048', '20,238']);
    expect([m.pago, m.aPagar, m.diferenca].reduce((s, p) => s + calc.milesimos(p, m.recebido), 0)).toBe(100000);
    const umaCasa = [m.pago, m.aPagar, m.diferenca].map((p) => calc.percentual(p, m.recebido, 1));
    expect(umaCasa).toEqual(['60,7', '19,0', '20,2']);
    expect(umaCasa.reduce((s, p) => s + Number(p.replace(',', '')), 0)).toBe(999);
  });

  it('10 x 120 = 1.200 (diferença de 200, 20% do preço à vista) e 6 x 120 = 720 (70 acima de 650)', () => {
    const d = calc.EXEMPLOS.dezParcelas as unknown as { parcelas: number; valorParcela: number; total: number; aVista: number; diferenca: number };
    expect(d.parcelas * d.valorParcela).toBe(R(1200));
    expect(d.total - d.aVista).toBe(R(200));
    expect((d.diferenca * 100) / d.aVista).toBe(20);
    const p = calc.EXEMPLOS.parcelado as unknown as { parcelas: number; valorParcela: number; total: number; aVista: number; diferenca: number };
    expect(p.parcelas * p.valorParcela).toBe(R(720));
    expect(p.total - p.aVista).toBe(R(70));
  });

  it('T01: 200 - 150 = 50, 50 x 12 = 600 e 600 é metade de 1.200; P04: 900 - 650 = 250', () => {
    const a = calc.EXEMPLOS.assinaturas as unknown as { hoje: number; depois: number; diferencaPorMes: number; meses: number; somaNoAno: number; meta: number };
    expect(a.hoje - a.depois).toBe(R(50));
    expect(a.diferencaPorMes * a.meses).toBe(R(600));
    expect(a.somaNoAno * 2).toBe(a.meta);
    const c = calc.EXEMPLOS.conta as unknown as { naConta: number; previstas: number; diferenca: number };
    expect(c.naConta - c.previstas).toBe(c.diferenca);
  });

  it('os números das gravações (P02, P05, P08 e P11) fecham com o que a tela mostra', () => {
    expect(calc.conferirExemplos()).toEqual([]);
    expect(calc.percentual(140000, 180000, 1)).toBe('77,8');
    expect(calc.percentual(40000, 30000, 1)).toBe('133,3');
    expect(calc.percentual(60000, 300000, 0)).toBe('20');
  });

  it('o dinheiro nunca é decimal: valor não inteiro e centavos sem pedir são recusados', () => {
    expect(() => calc.reais(1.5)).toThrow();
    expect(() => calc.reais(12345)).toThrow();
    expect(calc.reais(12345, { centavos: true })).toBe('R$ 123,45');
    expect(calc.reais(420000)).toBe('R$ 4.200');
  });

  it('todo valor em reais citado numa arte, legenda ou texto alternativo é um valor dos exemplos conferidos', () => {
    expect(validar.conferirValoresCitados()).toEqual([]);
    expect(validar.conferirValoresCitados([{ origem: 'teste', texto: 'São R$ 5.600 no mês.' }])).toHaveLength(1);
  });
});

describe('Instagram: contraste (Manual v2.2, WCAG 2.2 1.4.3)', () => {
  it('os pares do Manual dão as relações que ele informa, e nenhum par em uso fica abaixo do mínimo', () => {
    for (const par of calc.CONTRASTES_DO_MANUAL) expect(calc.contraste(calc.PALETA[par.texto] ?? '', calc.PALETA[par.fundo] ?? '')).toBeCloseTo(par.relacao, 1);
    expect(calc.conferirContrastes()).toEqual([]);
  });

  it('branco sobre lima (1,28:1) nunca é usado como texto, e lima sobre azul só vale como texto grande', () => {
    expect(calc.contraste('#FFFFFF', '#D4F05B')).toBeLessThan(1.5);
    expect(calc.PARES_EM_USO.some((p) => p.texto === 'branco' && p.fundo === 'lima')).toBe(false);
    const limaSobreAzul = calc.contraste('#D4F05B', '#2457F5');
    expect(limaSobreAzul).toBeGreaterThanOrEqual(3);
    expect(limaSobreAzul).toBeLessThan(4.5);
  });
});

describe('Instagram: redação de tudo o que sai', () => {
  it('o conteúdo inteiro passa na conferência do gerador (redação, números, estrutura, limites e modelos existentes)', () => {
    expect(validar.validarTudo({ modelos: MODELOS })).toEqual([]);
  });

  it('a conferência recusa travessão, a expressão proibida, a marca no masculino, nome de pessoa real e promessa', () => {
    const ruim = (t: string) => calc.conferirRedacao(t, 'x').length;
    expect(ruim('Veja isto \u2014 agora')).toBe(1);
    expect(ruim('Veja 2010\u20132020')).toBe(1);
    expect(ruim(`Isso ${'faz'} ${'sentido'} para você`)).toBe(1);
    expect(ruim('Conheça o Clarevo')).toBe(1);
    expect(ruim('Conheça a Clarevo')).toBe(0);
    expect(ruim('Vídeo com a Adriana')).toBe(1);
    expect(ruim('Teste grátis por 7 dias')).toBe(1);
    expect(ruim('Entre na lista de espera')).toBe(1);
    expect(ruim('Isso é o seu saldo disponível')).toBe(1);
    expect(ruim('Não é saldo disponível.')).toBe(0);
    expect(ruim('Veja como acessar a Clarevo')).toBe(1);
    expect(ruim('Para conhecer o acesso, veja o fixado Como acessar.')).toBeGreaterThanOrEqual(1);
    expect(ruim('Veja no perfil as informações de acesso.')).toBe(0);
    expect(ruim('A Clarevo acaba com a ansiedade')).toBe(1);
    expect(ruim('Sem lista de espera nem data de abertura.')).toBe(0);
  });

  it('todo texto público está no feminino para a marca e sem os limites de saúde mental violados', () => {
    const todos = validar.textosPublicos().map((t) => t.texto).join('\n');
    expect(todos).not.toMatch(/\b(o|do|no|ao|pelo|um|este|esse|seu)\s+Clarevo\b/i);
    expect(todos).not.toMatch(/ninguém prospera no caos|não adianta fazer terapia|acaba com a ansiedade/i);
    expect(todos).not.toMatch(/\bcura\b|\bsono\b|produtividade|tranquilidade|ansiedade|depress/i);
    expect(todos).not.toMatch(/[\u2014\u2013]/);
  });

  it('a P03 é a versão com acesso em preparação: sem lista de espera, data, preço, "grátis" nem chamada de cadastro', () => {
    const p03 = peca('P03');
    const txt = JSON.stringify(p03.paginas) + (p03.legenda ?? '');
    expect(txt).not.toMatch(/lista de espera|gr[áa]tis|teste gratuito|cadastre|R\$|\d{1,2}\/\d{1,2}|\bem breve\b/i);
    expect(txt).toMatch(/fase de testes/);
    expect(txt).toMatch(/próximas informações de acesso/);
  });

  it('a B01 traz a ressalva da NR-1 e nenhum serviço que o produto não tem', () => {
    const b01 = peca('B01');
    const txt = JSON.stringify(b01.paginas) + (b01.legenda ?? '');
    expect(txt).toMatch(/NR-1/);
    expect(txt).toMatch(/depende de avaliação técnica e não substitui o gerenciamento de riscos/);
    expect(txt).not.toMatch(/certificad|conformidade|laudo|\bPGR\b|psicolog|mentoria|palestra|absente[ií]smo|colaboradores/i);
  });

  it('as peças com número dizem "exemplo fictício" e as de comparação de compra nunca chamam a diferença de juros nem de CET', () => {
    expect(validar.conferirRegrasDasPecas()).toEqual([]);
  });

  it('a B01 diz, como D-056, que a empresa nunca vê as finanças de ninguém, nem somadas (página 2 e legenda)', () => {
    const b01 = peca('B01');
    expect(b01.paginas?.[1]?.corpo).toBe('A empresa nunca vê as finanças de ninguém, nem somadas.');
    expect(b01.legenda).toContain('A empresa nunca vê as finanças de ninguém, nem somadas.');
    expect(Array.isArray(b01.alt) ? b01.alt[1] : '').toContain('nunca vê as finanças de ninguém, nem somadas');
  });

  it('a P11 avisa que, numa conta nova, o primeiro registro começa do zero (a gravação usa a demonstração, que já tem registros)', () => {
    const p11 = peca('P11');
    const frase = 'Na sua conta, o primeiro registro começa do zero.';
    expect(p11.legenda).toContain(frase);
    expect(p11.roteiro?.some((t) => t.fala.includes(frase))).toBe(true);
    expect(p11.roteiro?.some((t) => (t.tela ?? '').includes(frase))).toBe(true);
    // A frase vem depois do resultado no Resumo e cabe nos segundos finais da gravação (35,6 s).
    const ultimo = p11.roteiro?.[p11.roteiro.length - 1];
    expect(ultimo?.fala).toBe(frase);
    expect(ultimo?.em).toBeLessThan(35.6 - 3);
  });

  it('os Reels mandam ver no perfil as informações de acesso (acesso em preparação), nunca o fixado "Como acessar" nem "saber como acessar"', () => {
    for (const id of ['P02', 'P05', 'P08', 'P11']) {
      const p = peca(id);
      const todos = JSON.stringify([p.roteiro, p.legenda, p.alt]);
      expect(todos, id).toContain('Veja no perfil as informações de acesso');
      expect(todos, id).not.toMatch(/fixado Como acessar|como acessar|conhecer o acesso|link da bio/i);
    }
  });

  it('a P02 dá sujeito à frase "não é saldo nem autorização para gastar" no texto na tela dos 17 aos 24 s', () => {
    const t = peca('P02').roteiro?.find((x) => x.em === 17.4);
    expect(t?.tela).toBe('A diferença do orçamento não é saldo nem autorização para gastar');
  });

  it('a página 3 da T01 traz "Exemplo fictício" junto de "R$ 50 × 12 = R$ 600"', () => {
    const pg = peca('T01').paginas?.[2];
    expect(pg?.numero).toBe('R$ 50 × 12 = R$ 600');
    expect(pg?.nota).toBe('Exemplo fictício.');
  });

  it('a R01 diz "Não é saldo disponível." (sem "necessariamente"), e a B cita a calculadora "Parcelado ou à vista?" na página 5', () => {
    const r01 = JSON.stringify(peca('R01'));
    expect(r01).toContain('Não é saldo disponível.');
    expect(r01).not.toMatch(/necessariamente/i);
    const b = peca('B');
    const ultima = JSON.stringify(b.paginas?.[4]);
    expect(ultima).toContain('Parcelado ou à vista?');
    expect(JSON.stringify([b.paginas, b.legenda, b.alt])).not.toContain('Antes de financiar');
  });

  it('nenhuma legenda tem campo entre colchetes (legenda dita pronta), inclusive a da P12; o que depende da equipe fica na ficha', () => {
    for (const p of conteudo.PECAS) expect(p.legenda ?? '', p.id).not.toMatch(/\[[^\]]*\]/);
    const p12 = peca('P12');
    expect(p12.legenda).toContain('A dúvida de hoje é sobre o acesso.');
    expect((p12.depende ?? []).join('\n')).toMatch(/legenda\.txt/);
  });
});

describe('Instagram: estrutura das peças e do calendário', () => {
  it('cada carrossel tem o número de páginas do Playbook, e o texto alternativo tem uma linha por página', () => {
    for (const [id, n] of Object.entries(validar.PAGINAS_ESPERADAS)) {
      const p = peca(id);
      expect(p.paginas?.length, id).toBe(n);
      expect(Array.isArray(p.alt) ? p.alt.length : -1, id).toBe(n);
    }
  });

  it('os quatro Reels do calendário (P02, P05, P08, P11) têm roteiro (de 6 trechos, 7 na P11) e os vídeos com integrante só têm roteiro e capa', () => {
    for (const id of ['P02', 'P05', 'P08', 'P11']) expect(peca(id).formato).toBe('reel');
    for (const id of ['P06', 'P09', 'P12']) expect(peca(id).formato).toBe('video-integrante');
    expect(peca('T02').semArte).toBe(true);
  });

  it('o calendário cobre D1 a D30, com as peças do Playbook v2.2 nos dias certos', () => {
    const dias = new Map(conteudo.CALENDARIO.map((c) => [c.dia, c.peca]));
    expect([...dias.keys()].sort((a, b) => a - b)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(dias.get(5)).toBe('P01');
    expect(dias.get(6)).toBe('P02');
    expect(dias.get(7)).toBe('P03');
    expect(dias.get(9)).toBe('P04');
    expect(dias.get(11)).toBe('P05');
    expect(dias.get(13)).toBe('P06 ou T01');
    expect(dias.get(16)).toBe('P07');
    expect(dias.get(18)).toBe('P08');
    expect(dias.get(20)).toBe('P09 ou T02');
    expect(dias.get(23)).toBe('P10');
    expect(dias.get(25)).toBe('P11');
    expect(dias.get(27)).toBe('B01');
  });
});

function textoDoApp(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (/node_modules|\/dist\//.test(caminho)) continue;
    if (statSync(caminho).isDirectory()) textoDoApp(caminho, saida);
    else if (['.ts', '.tsx'].includes(extname(nome))) saida.push(readFileSync(caminho, 'utf8'));
  }
  return saida;
}

describe('Instagram: o que as artes dizem do app existe no app de hoje', () => {
  const fonte = [...textoDoApp(join(ROOT, 'apps', 'app', 'src')), ...textoDoApp(join(ROOT, 'packages', 'core', 'src'))].join('\n');

  it.each(conteudo.TERMOS_DO_APP)('"%s" é texto do app', (termo) => {
    expect(fonte).toContain(termo);
  });

  it('a calculadora "Parcelado ou à vista?" (a que a reserva B cita) existe no catálogo do core, com esse título', () => {
    const catalogo = readFileSync(join(ROOT, 'packages', 'core', 'src', 'calculators', 'catalog.ts'), 'utf8');
    expect(catalogo).toContain("slug: 'parcelado-ou-a-vista', title: 'Parcelado ou à vista?'");
  });
});

describe('Instagram: marca, fonte e ativos', () => {
  it('a DM Sans está no repositório com a licença OFL, e a assinatura vem do ativo original (nunca redigitada)', () => {
    expect(existsSync(join(ROOT, 'scripts', 'instagram', 'fontes', 'DMSans-variavel.ttf'))).toBe(true);
    expect(readFileSync(join(ROOT, 'scripts', 'instagram', 'fontes', 'OFL.txt'), 'utf8')).toContain('SIL OPEN FONT LICENSE Version 1.1');
    const modelos = readFileSync(join(ROOT, 'scripts', 'instagram', 'modelos.js'), 'utf8');
    expect(modelos).toContain("'clarevo-logotipo.svg'");
    expect(modelos).toContain("'clarevo-logotipo-reverso.svg'");
    expect(modelos).toContain("'icone-app.svg'");
    // O texto "clarevo." nunca é digitado numa arte: só o ativo.
    expect(modelos.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')).not.toMatch(/>\s*clarevo\.\s*</);
    for (const arq of ['clarevo-logotipo.svg', 'clarevo-logotipo-reverso.svg', 'icone-app.svg']) expect(existsSync(join(ROOT, 'docs', 'marca', arq))).toBe(true);
  });

  it('as cores das artes são as da paleta oficial', () => {
    expect(calc.PALETA).toMatchObject({ azul: '#2457F5', lima: '#D4F05B', marinho: '#17223B', off: '#F7F9FD', claro: '#EAF0FF', cinza: '#53637D' });
  });
});
