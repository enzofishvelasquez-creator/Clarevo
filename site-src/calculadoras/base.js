// Peças comuns das calculadoras do Clarevo no navegador (D-066): como montar um elemento, um campo de texto, uma escolha, o cartão do
// resultado e quando mostrar um erro (a mesma regra das calculadoras do app). Cada calculadora (definicoes/<slug>.js) importa só daqui e do
// próprio módulo do núcleo; o que o core faz com `fields.js` (que importaria as dez calculadoras de uma vez) é refeito abaixo com os
// mesmos dados. Nada sai do navegador: sem envio, sem armazenamento, sem cookie.
import { CALC_UI_TEXT } from '../js/nucleo/calculators/catalog.js';
import { CALC_ERROR_TEXT, parsePercentBp } from '../js/nucleo/calculators/inputs.js';
import { MAX_RECORD_CENTS, centsToInput, parseBRL } from '../js/nucleo/money.js';

/**
 * O nome com que o módulo de cada calculadora exporta os campos dela (rótulo, dica, tipo, faixa e mensagens), o que `calcFields` do core
 * (`calculators/fields.ts`) faz com o mapa `CALC_FIELDS`. O teste confere que são os mesmos campos que o core entrega, para as dez.
 */
export const NOMES_DOS_CAMPOS = {
  'antes-de-financiar': { campos: 'ANTES_FIELDS' },
  'parcelado-ou-a-vista': { campos: 'PARCELADO_FIELDS', camposCotaUnica: 'COTA_UNICA_FIELDS' },
  'custo-por-ano': { campos: 'CUSTO_POR_ANO_FIELDS' },
  'custo-da-divida': { campos: 'DIVIDA_FIELDS' },
  'quitar-antes': { campos: 'QUITAR_FIELDS' },
  'multa-e-juros': { campos: 'MULTA_FIELDS' },
  'plano-dividas': { campos: 'PLANO_FIELDS' },
  reserva: { campos: 'RESERVA_FIELDS' },
  'juntar-para-objetivo': { campos: 'OBJETIVO_FIELDS' },
  'dividir-contas': { campos: 'DIVIDIR_FIELDS' },
};

/** O módulo do núcleo da calculadora desta página, depois de carregado (uma página, uma calculadora). */
let modulo = null;
export function usarModulo(m) {
  modulo = m;
}

/** Os campos da calculadora, como `calcFields` do core: "Parcelado ou à vista?" na cota única usa os da conta do ano. */
export function camposDe(slug, modo, doModulo = modulo) {
  const n = NOMES_DOS_CAMPOS[slug];
  return doModulo[slug === 'parcelado-ou-a-vista' && modo === 'cota-unica' ? n.camposCotaUnica : n.campos];
}

/** A mensagem de um erro, como `calcErrorText` do core: a do campo ou, sem ela, a genérica do código; campos por pessoa ("renda.1") usam a de "renda". */
export function textoDoErro(slug, campo, codigo, modo, doModulo = modulo) {
  return camposDe(slug, modo, doModulo)[campo.replace(/\.\d+$/, '')]?.errors?.[codigo] ?? CALC_ERROR_TEXT[codigo];
}

/** Elemento DOM com atributos e filhos (texto sempre como texto, nunca como HTML). */
export function h(tag, attrs = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'hidden') el.hidden = Boolean(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const f of filhos.flat(Infinity)) if (f !== null && f !== undefined && f !== false) el.append(f);
  return el;
}

// --------------------------------------------------------------------------------------------------------------------
// Quando mostrar um erro (a mesma regra das calculadoras do app): "vazio" só depois de mexer e sair do campo; os outros depois de
// sair; durante a digitação, só os que mais dígitos não corrigem.
const CODIGOS_FINAIS = ['casas_demais', 'acima_do_limite', 'longo', 'resultado_alto'];

function acimaDoMaximo(texto, spec) {
  if (spec.max === undefined) return false;
  if (spec.kind === 'inteiro') {
    const digitos = texto.replace(/\D/g, '');
    return digitos !== '' && Number(digitos) > spec.max;
  }
  if (spec.kind === 'taxa') {
    const bp = parsePercentBp(texto, { min: 0, max: Number.MAX_SAFE_INTEGER });
    return bp.ok && bp.value > spec.max;
  }
  return false;
}

export function mostrarErro(codigo, spec, texto, saiu, mexeu) {
  if (!codigo) return false;
  if (codigo === 'vazio') return saiu && mexeu;
  if (saiu || CODIGOS_FINAIS.includes(codigo)) return true;
  return codigo === 'fora_da_faixa' && acimaDoMaximo(texto, spec);
}

/** "1080" vira "1.080,00" ao sair do campo. */
export function formatarDinheiro(texto) {
  const centavos = parseBRL(texto);
  return centavos !== null && centavos >= 0 && centavos <= MAX_RECORD_CENTS ? centsToInput(centavos) : texto;
}

export const soEscolhasFaltam = (erros, escolhas) => {
  const entradas = Object.entries(erros);
  return entradas.length > 0 && entradas.every(([k, c]) => c === 'vazio' && escolhas.includes(k));
};

// --------------------------------------------------------------------------------------------------------------------
// Peças da tela

/** Campo de texto ligado a uma chave: rótulo, dica, prefixo "R$", erro e teclado conforme o tipo do campo. */
export function campoTexto(ctx, { chave, spec, rotulo, dica, ler, escrever, erro, nomeErro, nomeAcessivel }) {
  const id = `c-${chave.replace(/\./g, '-')}`;
  const dinheiro = spec.kind === 'dinheiro';
  const livre = spec.kind === 'texto';
  const input = h('input', {
    id,
    type: 'text',
    inputmode: livre ? 'text' : spec.kind === 'inteiro' ? 'numeric' : 'decimal',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    placeholder: dinheiro ? '0,00' : null,
    'aria-label': nomeAcessivel ?? null,
  });
  input.value = ler();
  const dicaTexto = dica ?? spec.hint;
  input.setAttribute('aria-describedby', dicaTexto ? `${id}-dica ${id}-erro` : `${id}-erro`);
  const pErro = h('p', { class: 'erro', id: `${id}-erro`, hidden: true });
  input.addEventListener('input', () => {
    escrever(input.value);
    ctx.editado[chave] = true;
    ctx.atualizar();
  });
  input.addEventListener('blur', () => {
    // Tirar o campo da tela (ao refazer o formulário) não é "sair do campo".
    if (ctx.trocando) return;
    if (dinheiro && input.value.trim() !== '') {
      const formatado = formatarDinheiro(input.value);
      if (formatado !== input.value) {
        input.value = formatado;
        escrever(formatado);
      }
    }
    ctx.saiu[chave] = true;
    ctx.atualizar();
  });
  ctx.ganchos.push(() => {
    const codigo = erro();
    const ver = mostrarErro(codigo, spec, input.value, Boolean(ctx.saiu[chave]), Boolean(ctx.editado[chave]));
    pErro.hidden = !ver;
    pErro.textContent = ver ? textoDoErro(ctx.slug, nomeErro ?? chave, codigo, ctx.modo) : '';
    input.setAttribute('aria-invalid', ver ? 'true' : 'false');
  });
  return h(
    'div',
    { class: 'campo' },
    h('label', { for: id }, rotulo ?? spec.label),
    dicaTexto ? h('p', { class: 'dica', id: `${id}-dica` }, dicaTexto) : null,
    h('div', { class: 'campo-entrada' }, dinheiro ? h('span', { class: 'campo-prefixo', 'aria-hidden': 'true' }, 'R$') : null, input),
    pErro,
  );
}

/** Escolha em chips (botões de rádio nativos, que já funcionam com o teclado). */
export function escolha(ctx, { chave, rotulo, dica, opcoes, ler, escrever, estrutural = false, erro = () => null, rotulosAcessiveis = {} }) {
  const nome = `r-${chave.replace(/\./g, '-')}`;
  const pErro = h('p', { class: 'erro', id: `${nome}-erro`, hidden: true });
  const chips = opcoes.map((o) => {
    const input = h('input', { type: 'radio', name: nome, value: o.value, 'aria-label': rotulosAcessiveis[o.value] ?? null, 'aria-describedby': `${nome}-erro` });
    input.checked = ler() === o.value;
    input.addEventListener('change', () => {
      escrever(o.value);
      if (estrutural) ctx.reconstruir(`${nome}:${o.value}`);
      else ctx.atualizar();
    });
    return h('label', { class: 'chip' }, input, h('span', {}, o.label));
  });
  ctx.ganchos.push(() => {
    const texto = erro();
    pErro.hidden = !texto;
    pErro.textContent = texto || '';
  });
  return h('fieldset', { class: 'escolha' }, h('legend', {}, rotulo), dica ? h('p', { class: 'dica' }, dica) : null, h('div', { class: 'chips' }, chips), pErro);
}

export const simNao = (ctx, args) =>
  escolha(ctx, {
    ...args,
    opcoes: args.spec.options,
    ler: () => (args.ler() ? 'sim' : 'nao'),
    escrever: (v) => args.escrever(v === 'sim'),
    rotulo: args.spec.label,
    dica: args.spec.hint,
  });

export const cartao = (...filhos) => h('div', { class: 'calc-cartao' }, ...filhos);
export const botao = (texto, aoClicar, classe = 'botao botao-suave') => {
  const b = h('button', { type: 'button', class: classe }, texto);
  b.addEventListener('click', aoClicar);
  return b;
};
export const nota = (texto) => h('p', { class: 'calc-nota' }, texto);

/** O cartão do resultado: as linhas (a primeira é o destaque), os avisos e as hipóteses; sem resultado, o texto de espera. */
export function blocoResultado(textos, { nivel = 3, titulo = CALC_UI_TEXT.resultTitle, extras = [] } = {}) {
  const [primeira, ...resto] = textos?.resultLines ?? [];
  const mostrando = textos && primeira !== undefined;
  return h(
    'section',
    { class: 'calc-resultado' },
    h(`h${nivel}`, {}, titulo),
    h(
      'div',
      { class: 'calc-linhas' },
      mostrando ? [h('p', { class: 'calc-destaque' }, primeira), resto.map((l) => h('p', {}, l))] : h('p', { class: 'nota' }, CALC_UI_TEXT.waiting),
    ),
    mostrando ? textos.notes.map(nota) : null,
    mostrando && textos.hypotheses.length > 0
      ? h('div', { class: 'calc-hipoteses' }, h(`h${nivel + 1}`, {}, CALC_UI_TEXT.hypothesesTitle), h('ul', {}, textos.hypotheses.map((x) => h('li', {}, x))))
      : null,
    mostrando ? extras : null,
  );
}
