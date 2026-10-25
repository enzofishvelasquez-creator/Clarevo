'use strict';
/**
 * Contas e conferências puras do gerador do Instagram (D-069): sem navegador, sem arquivo, sem rede. O teste
 * `packages/core/test/instagram.test.ts` roda tudo isto; o gerador (`scripts/gerar-instagram.js`) usa as mesmas funções para escrever os
 * números das artes e recusa o desenho se alguma conta não fechar.
 *
 * Dinheiro em centavos inteiros (regra do projeto): as artes mostram reais inteiros, mas a conta é feita em centavos.
 */

/** Conta de caracteres como o Instagram conta (por caractere, não por byte): a quebra de linha vale 1. */
function contarCaracteres(texto) {
  return [...texto].length;
}

/** Os limites que a spec fixa para o perfil (nome de exibição e bio). */
const LIMITES = { nome: 30, bio: 150 };

/** "R$ 4.200" (reais inteiros) ou "R$ 4.200,50" (com centavos) a partir de centavos. */
function reais(centavos, { centavos: comCentavos = false } = {}) {
  if (!Number.isInteger(centavos)) throw new Error(`valor em centavos precisa ser inteiro: ${centavos}`);
  const negativo = centavos < 0;
  const abs = Math.abs(centavos);
  const inteiro = Math.floor(abs / 100);
  const resto = abs % 100;
  if (!comCentavos && resto !== 0) throw new Error(`${centavos} centavos não são reais inteiros: peça comCentavos`);
  const milhares = String(inteiro).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negativo ? '−' : ''}R$ ${milhares}${comCentavos ? `,${String(resto).padStart(2, '0')}` : ''}`;
}

const R = (n) => n * 100;

/** Percentual de `parte` em `total` com `casas` decimais, arredondado para o mais próximo (metade para cima), só com inteiros. Devolve texto "60,7". */
function percentual(parte, total, casas) {
  if (!Number.isInteger(parte) || !Number.isInteger(total) || total <= 0) throw new Error('percentual precisa de inteiros e de total positivo');
  const m = 10 ** (casas + 2);
  const escalado = Math.floor((parte * 2 * m + total) / (2 * total));
  const inteiro = Math.floor(escalado / 10 ** casas);
  const frac = String(escalado % 10 ** casas).padStart(casas, '0');
  return casas > 0 ? `${inteiro},${frac}` : String(inteiro);
}
/** O mesmo percentual como número de milésimos (60,714 vira 60714) para somar sem ponto flutuante. */
const milesimos = (parte, total) => Number(percentual(parte, total, 3).replace(',', ''));

/**
 * Os exemplos numéricos das artes. Cada um é conferido por `conferirExemplos()` e pelo teste. Os de P04, P07, T01, R01 e Manual B vêm do
 * Playbook v2.2 e do Manual v2.2; os de P02, P05, P08 e P11 são os da tela da demonstração (`docs/24_REDES_SOCIAIS.md`, seção 2).
 */
const EXEMPLOS = {
  // R01 e Manual A: recebido, pago, ainda a pagar e a diferença depois dessas despesas (não é saldo).
  mes: { recebido: R(4200), pago: R(2550), aPagar: R(800), diferenca: R(850), contas: [{ dia: 15, valor: R(300) }, { dia: 22, valor: R(500) }] },
  // P04: o que a pessoa vê no banco, o que ainda vai vencer e a diferença do exemplo.
  conta: { naConta: R(900), previstas: R(650), diferenca: R(250) },
  // P07: seis parcelas, preço à vista, diferença.
  parcelado: { parcelas: 6, valorParcela: R(120), total: R(720), aVista: R(650), diferenca: R(70) },
  // Manual B: à vista ou em dez parcelas (diferença nominal, nunca juros nem CET).
  dezParcelas: { parcelas: 10, valorParcela: R(120), total: R(1200), aVista: R(1000), diferenca: R(200), percentualSobreAVista: 20 },
  // T01: assinaturas (exemplo fictício, sem rendimentos).
  assinaturas: { hoje: R(200), depois: R(150), diferencaPorMes: R(50), meses: 12, somaNoAno: R(600), meta: R(1200) },
  // P02: orçamento de outubro na demonstração (centavos), como a tela escreve.
  orcamento: {
    total: { orcado: 460000, usado: 430000 },
    moradia: { orcado: 250000, usado: 250000 },
    mercado: { orcado: 180000, usado: 140000, faltam: 40000, percentual: '77,8' },
    lazer: { orcado: 30000, usado: 40000, acima: 10000, percentual: '133,3' },
  },
  // P05: o orçamento que a gravação cria.
  categoria: { orcado: 60000, totalAntes: 460000, totalDepois: 520000 },
  // P08: a meta "Estudos" da gravação.
  meta: { valor: 300000, guardado: 60000, faltam: 240000, percentual: 20, porMes: 30000 },
  // P11: o gasto da gravação.
  gasto: { valor: 3500, pagoAntes: 390000, pagoDepois: 393500, recebido: 600000, diferencaAntes: 210000, diferencaDepois: 206500 },
};

/** Confere cada conta dos exemplos; devolve a lista de problemas (vazia quando tudo fecha). */
function conferirExemplos(e = EXEMPLOS) {
  const erros = [];
  const igual = (rotulo, a, b) => {
    if (a !== b) erros.push(`${rotulo}: ${a} é diferente de ${b}`);
  };
  const m = e.mes;
  igual('R01: recebido − pago − a pagar = diferença', m.recebido - m.pago - m.aPagar, m.diferenca);
  igual('R01: 4.200 = 2.550 + 800 + 850', m.pago + m.aPagar + m.diferenca, m.recebido);
  igual('R01: as contas do calendário somam o que ainda falta pagar', m.contas.reduce((s, c) => s + c.valor, 0), m.aPagar);
  igual('Manual A: 60,714% + 19,048% + 20,238% = 100,000%', milesimos(m.pago, m.recebido) + milesimos(m.aPagar, m.recebido) + milesimos(m.diferenca, m.recebido), 100000);
  igual('Manual A: percentuais com 1 casa somam 99,9', [m.pago, m.aPagar, m.diferenca].reduce((s, p) => s + Number(percentual(p, m.recebido, 1).replace(',', '')), 0), 999);
  const c = e.conta;
  igual('P04: 900 − 650 = 250', c.naConta - c.previstas, c.diferenca);
  const p = e.parcelado;
  igual('P07: 6 × 120 = 720', p.parcelas * p.valorParcela, p.total);
  igual('P07: 720 − 650 = 70', p.total - p.aVista, p.diferenca);
  const d = e.dezParcelas;
  igual('Manual B: 10 × 120 = 1.200', d.parcelas * d.valorParcela, d.total);
  igual('Manual B: 1.200 − 1.000 = 200', d.total - d.aVista, d.diferenca);
  igual('Manual B: 200 é 20% de 1.000', (d.diferenca * 100) / d.aVista, d.percentualSobreAVista);
  const a = e.assinaturas;
  igual('T01: 200 − 150 = 50', a.hoje - a.depois, a.diferencaPorMes);
  igual('T01: 50 × 12 = 600', a.diferencaPorMes * a.meses, a.somaNoAno);
  igual('T01: 600 é metade de 1.200', a.somaNoAno * 2, a.meta);
  const o = e.orcamento;
  igual('P02: Mercado, 1.800 − 1.400 = 400', o.mercado.orcado - o.mercado.usado, o.mercado.faltam);
  igual('P02: Mercado, 1.400 de 1.800 = 77,8%', percentual(o.mercado.usado, o.mercado.orcado, 1), o.mercado.percentual);
  igual('P02: Lazer, 400 − 300 = 100 acima', o.lazer.usado - o.lazer.orcado, o.lazer.acima);
  igual('P02: Lazer, 400 de 300 = 133,3%', percentual(o.lazer.usado, o.lazer.orcado, 1), o.lazer.percentual);
  const k = e.categoria;
  igual('P05: o total orçado passa de 4.600 para 5.200 com 600', k.totalAntes + k.orcado, k.totalDepois);
  igual('P05 e P10: o total orçado antes do novo orçamento é o da tela (4.600)', o.total.orcado, k.totalAntes);
  const t = e.meta;
  igual('P08: 3.000 − 600 = 2.400', t.valor - t.guardado, t.faltam);
  igual('P08: 600 de 3.000 = 20%', percentual(t.guardado, t.valor, 0), String(t.percentual));
  const g = e.gasto;
  igual('P11: pago 3.900 + 35 = 3.935', g.pagoAntes + g.valor, g.pagoDepois);
  igual('P11: diferença do mês, 6.000 − 3.900 = 2.100', g.recebido - g.pagoAntes, g.diferencaAntes);
  igual('P11: diferença do mês, 6.000 − 3.935 = 2.065', g.recebido - g.pagoDepois, g.diferencaDepois);
  return erros;
}

// ---- Contraste (WCAG 2.2, critério 1.4.3), como o Manual v2.2 valida ----
function luminancia(hex) {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contraste(a, b) {
  const [la, lb] = [luminancia(a), luminancia(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const PALETA = { azul: '#2457F5', lima: '#D4F05B', marinho: '#17223B', off: '#F7F9FD', claro: '#EAF0FF', cinza: '#53637D', branco: '#FFFFFF', azulEscuro: '#153EBD' };

/** Os pares de cor que o Manual valida (seção 3), com a relação que ele informa. */
const CONTRASTES_DO_MANUAL = [
  { texto: 'branco', fundo: 'azul', relacao: 5.59 },
  { texto: 'marinho', fundo: 'lima', relacao: 12.36 },
  { texto: 'marinho', fundo: 'branco', relacao: 15.81 },
  { texto: 'branco', fundo: 'lima', relacao: 1.28 },
  { texto: 'lima', fundo: 'azul', relacao: 4.37 },
  { texto: 'cinza', fundo: 'branco', relacao: 6.09 },
];

/**
 * Os pares de texto e fundo que as artes usam. `grande: true` quando o texto é grande ou em negrito (limite de 3:1 no WCAG); os demais
 * precisam de 4,5:1. Nunca branco sobre lima. O gerador e o teste conferem esta lista.
 */
const PARES_EM_USO = [
  { texto: 'branco', fundo: 'azul', uso: 'título e corpo sobre azul' },
  { texto: 'claro', fundo: 'azul', uso: 'texto de apoio e contador sobre azul' },
  { texto: 'marinho', fundo: 'lima', uso: 'chip e destaque sobre lima' },
  { texto: 'marinho', fundo: 'branco', uso: 'leitura padrão' },
  { texto: 'marinho', fundo: 'off', uso: 'leitura em página clara' },
  { texto: 'marinho', fundo: 'claro', uso: 'leitura em bloco azul-claro' },
  { texto: 'cinza', fundo: 'branco', uso: 'legenda e texto secundário' },
  { texto: 'cinza', fundo: 'off', uso: 'legenda e texto secundário em página clara' },
  { texto: 'cinza', fundo: 'claro', uso: 'legenda em bloco azul-claro' },
  { texto: 'azul', fundo: 'branco', uso: 'palavra-chave em azul' },
  { texto: 'azul', fundo: 'off', uso: 'palavra-chave em azul em página clara' },
  { texto: 'azul', fundo: 'claro', uso: 'palavra-chave em azul em bloco azul-claro' },
  { texto: 'lima', fundo: 'azul', uso: 'palavra em destaque, só grande e em negrito', grande: true },
  { texto: 'marinho', fundo: 'azul', uso: 'não usado como texto (só em ícone sobre lima)', grande: true, soIcone: true },
];

function conferirContrastes() {
  const erros = [];
  for (const c of CONTRASTES_DO_MANUAL) {
    const r = contraste(PALETA[c.texto], PALETA[c.fundo]);
    if (Math.abs(r - c.relacao) > 0.02) erros.push(`${c.texto} sobre ${c.fundo}: calculado ${r.toFixed(2)}, o Manual diz ${c.relacao}`);
  }
  for (const p of PARES_EM_USO) {
    if (p.soIcone) continue;
    if (p.texto === 'branco' && p.fundo === 'lima') erros.push('branco sobre lima nunca');
    const minimo = p.grande ? 3 : 4.5;
    const r = contraste(PALETA[p.texto], PALETA[p.fundo]);
    if (r < minimo) erros.push(`${p.texto} sobre ${p.fundo} (${p.uso}): ${r.toFixed(2)}:1, abaixo de ${minimo}:1`);
  }
  return erros;
}

// ---- Regras de redação do CLAUDE.md e do Playbook, para todo texto que sai ----
const TRAVESSOES = /[\u2014\u2013]/; // travessão longo e meia-risca
const FAZER_SENTIDO = /fa(z|zer|zem|ça|çam|zia|ziam|ria|riam|z-se)\s+sentido/i;
const MARCA_MASCULINA = /\b(?:o|O|do|Do|no|No|ao|Ao|pelo|Pelo|um|Um|num|Num|este|Este|esse|Esse|aquele|Aquele|seu|Seu|nosso|Nosso)\s+Clarevo\b/;
/** Nomes de pessoas reais que não podem aparecer nas artes nem nas legendas (a equipe só aparece por foto real e escolha dela). */
const NOMES_PROIBIDOS = /\b(Adriana|Cristina|Elis|Enzo|Velasquez|Mayra|Macedo|Jo[ãa]o Carvalho)\b/;
/** Promessas e termos que o Playbook e o Manual proíbem de afirmar. */
const PROMESSAS = [
  /\bgr[áa]tis\b/i,
  /teste gratuito/i,
  /lista de espera/i,
  /saldo dispon[ií]vel/i,
  /acaba com a ansiedade/i,
  /ninguém prospera no caos/i,
  /n[ãa]o adianta fazer terapia/i,
  /certificad[oa] pela NR/i,
  /adequada com uma assinatura/i,
  /redu[çc][ãa]o garantida/i,
  /garantid[oa]\b/i,
];

/**
 * Devolve os problemas de redação de um texto (lista vazia quando está de acordo). `origem` identifica o texto na mensagem. Um termo de
 * promessa só passa quando a própria frase o nega ("não é necessariamente saldo disponível", "sem lista de espera").
 */
function conferirRedacao(texto, origem) {
  const erros = [];
  if (TRAVESSOES.test(texto)) erros.push(`${origem}: travessão ou meia-risca`);
  if (FAZER_SENTIDO.test(texto)) erros.push(`${origem}: a expressão que o CLAUDE.md proíbe`);
  if (MARCA_MASCULINA.test(texto)) erros.push(`${origem}: a marca no masculino ("o Clarevo")`);
  if (NOMES_PROIBIDOS.test(texto)) erros.push(`${origem}: nome de pessoa real`);
  for (const frase of texto.split(/(?<=[.!?])\s+|\n/)) {
    if (/\b(n[ãa]o|sem|nunca|nem)\b/i.test(frase)) continue;
    for (const re of PROMESSAS) if (re.test(frase)) erros.push(`${origem}: termo que o Playbook proíbe (${re})`);
  }
  return erros;
}

module.exports = {
  contarCaracteres,
  LIMITES,
  reais,
  R,
  percentual,
  milesimos,
  EXEMPLOS,
  conferirExemplos,
  luminancia,
  contraste,
  PALETA,
  CONTRASTES_DO_MANUAL,
  PARES_EM_USO,
  conferirContrastes,
  conferirRedacao,
};
