// Calculadoras do Clarevo no navegador (D-066). A conta, as faixas de validação e todo texto de resultado vêm do MESMO código do
// packages/core, transpilado em js/nucleo/ pelo gerador. Este arquivo só monta a tela, lê o que a pessoa digita e mostra o que o
// núcleo devolve. Nada sai do navegador: sem envio, sem armazenamento, sem cookie e sem nada na URL (a página só lê "modo",
// o parâmetro que os temas de Aprender já usam).
import { CALC_UI_TEXT, calcTitle } from '../js/nucleo/calculators/catalog.js';
import { calcErrorText, calcFields } from '../js/nucleo/calculators/fields.js';
import { parsePercentBp } from '../js/nucleo/calculators/inputs.js';
import { calcPrefill } from '../js/nucleo/calculators/links.js';
import { deviceTimeZone, todayIn } from '../js/nucleo/dates.js';
import { MAX_RECORD_CENTS, centsToInput, parseBRL } from '../js/nucleo/money.js';
import { ANTES_FIELDS, ANTES_TEXT, calcAntesDeFinanciar } from '../js/nucleo/calculators/antes-de-financiar.js';
import { calcParceladoOuAVista } from '../js/nucleo/calculators/parcelado-ou-a-vista.js';
import { calcCustoPorAno } from '../js/nucleo/calculators/custo-por-ano.js';
import { DIVIDA_TEXT, calcCustoDaDivida } from '../js/nucleo/calculators/custo-da-divida.js';
import { calcQuitarAntes } from '../js/nucleo/calculators/quitar-antes.js';
import { calcMultaEJuros } from '../js/nucleo/calculators/multa-e-juros.js';
import { PLANO_FIELDS, PLANO_MAX_DEBTS, PLANO_TEXT, calcPlanoDividas, planoDebtName, planoDebtStays } from '../js/nucleo/calculators/plano-dividas.js';
import { RESERVA_MONTH_CHIPS, RESERVA_REFERENCIA, RESERVA_TEXT, calcReserva } from '../js/nucleo/calculators/reserva.js';
import { calcJuntarParaObjetivo } from '../js/nucleo/calculators/juntar-para-objetivo.js';
import { DIVIDIR_MAX_PEOPLE, DIVIDIR_MIN_PEOPLE, DIVIDIR_TEXT, calcDividirContas, personName } from '../js/nucleo/calculators/dividir-contas.js';

/** Elemento DOM com atributos e filhos (texto sempre como texto, nunca como HTML). */
function h(tag, attrs = {}, ...filhos) {
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

function mostrarErro(codigo, spec, texto, saiu, mexeu) {
  if (!codigo) return false;
  if (codigo === 'vazio') return saiu && mexeu;
  if (saiu || CODIGOS_FINAIS.includes(codigo)) return true;
  return codigo === 'fora_da_faixa' && acimaDoMaximo(texto, spec);
}

/** "1080" vira "1.080,00" ao sair do campo. */
function formatarDinheiro(texto) {
  const centavos = parseBRL(texto);
  return centavos !== null && centavos >= 0 && centavos <= MAX_RECORD_CENTS ? centsToInput(centavos) : texto;
}

const soEscolhasFaltam = (erros, escolhas) => {
  const entradas = Object.entries(erros);
  return entradas.length > 0 && entradas.every(([k, c]) => c === 'vazio' && escolhas.includes(k));
};

// --------------------------------------------------------------------------------------------------------------------
// Peças da tela

/** Campo de texto ligado a uma chave: rótulo, dica, prefixo "R$", erro e teclado conforme o tipo do campo. */
function campoTexto(ctx, { chave, spec, rotulo, dica, ler, escrever, erro, nomeErro, nomeAcessivel }) {
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
    pErro.textContent = ver ? calcErrorText(ctx.slug, nomeErro ?? chave, codigo, ctx.modo) : '';
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
function escolha(ctx, { chave, rotulo, dica, opcoes, ler, escrever, estrutural = false, erro = () => null, rotulosAcessiveis = {} }) {
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

const simNao = (ctx, args) =>
  escolha(ctx, {
    ...args,
    opcoes: args.spec.options,
    ler: () => (args.ler() ? 'sim' : 'nao'),
    escrever: (v) => args.escrever(v === 'sim'),
    rotulo: args.spec.label,
    dica: args.spec.hint,
  });

const cartao = (...filhos) => h('div', { class: 'calc-cartao' }, ...filhos);
const botao = (texto, aoClicar, classe = 'botao botao-suave') => {
  const b = h('button', { type: 'button', class: classe }, texto);
  b.addEventListener('click', aoClicar);
  return b;
};
const nota = (texto) => h('p', { class: 'calc-nota' }, texto);

/** O cartão do resultado: as linhas (a primeira é o destaque), os avisos e as hipóteses; sem resultado, o texto de espera. */
function blocoResultado(textos, { nivel = 3, titulo = CALC_UI_TEXT.resultTitle, extras = [] } = {}) {
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

// --------------------------------------------------------------------------------------------------------------------
// As dez calculadoras. Cada uma recebe o contexto e devolve `calcular` (guarda o resultado), `formulario` (os campos) e
// `resultado` (os blocos do resultado). O que cada uma pede, em que ordem e o que mostra é o que o app faz.

const DEFINICOES = {
  'custo-por-ano': (ctx, pre) => {
    const specs = calcFields('custo-por-ano');
    const v = { valor: pre.valor ?? '' };
    let frequencia = pre.frequencia ?? null;
    let saida;
    return {
      calcular: () => (saida = calcCustoPorAno({ valor: v.valor, frequencia })),
      formulario: () => [
        cartao(
          campoTexto(ctx, { chave: 'valor', spec: specs.valor, ler: () => v.valor, escrever: (t) => (v.valor = t), erro: () => saida.errors?.valor }),
          escolha(ctx, {
            chave: 'frequencia',
            rotulo: specs.frequencia.label,
            opcoes: specs.frequencia.options,
            ler: () => frequencia,
            escrever: (x) => (frequencia = x),
            erro: () => (!saida.ok && soEscolhasFaltam(saida.errors, ['frequencia']) ? calcErrorText('custo-por-ano', 'frequencia', 'vazio') : null),
          }),
        ),
      ],
      resultado: () => [blocoResultado(saida.ok ? saida.result : null)],
    };
  },

  'custo-da-divida': (ctx, pre) => {
    const specs = calcFields('custo-da-divida');
    const v = { valor: pre.valor ?? '', taxaMes: '', meses: '', parcelas: pre.parcelas ?? '', parcelarTaxaMes: '', parcelarParcelas: '' };
    let tipo = pre.tipo ?? null;
    let saida;
    let erros = {};
    const campo = (chave, extra = {}) => campoTexto(ctx, { chave, spec: specs[chave], ler: () => v[chave], escrever: (t) => (v[chave] = t), erro: () => erros[chave], ...extra });
    return {
      calcular: () => {
        saida = calcCustoDaDivida({ tipo, ...v });
        const parcelamento = saida.ok ? saida.result.parcelamento : null;
        erros = saida.ok ? (parcelamento && !parcelamento.ok ? parcelamento.errors : {}) : saida.errors;
      },
      formulario: () => [
        cartao(
          escolha(ctx, {
            chave: 'tipo',
            rotulo: specs.tipo.label,
            opcoes: specs.tipo.options,
            ler: () => tipo,
            escrever: (x) => (tipo = x),
            estrutural: true,
            erro: () => (soEscolhasFaltam(erros, ['tipo']) ? calcErrorText('custo-da-divida', 'tipo', 'vazio') : null),
          }),
          campo('valor'),
          campo('taxaMes'),
          tipo === 'cheque_especial' ? campo('meses') : null,
          tipo === 'emprestimo' ? campo('parcelas') : null,
        ),
      ],
      resultado: () => {
        const r = saida.ok ? saida.result : null;
        const parcelamento = r?.parcelamento ?? null;
        const blocos = [blocoResultado(r)];
        if (r?.tipo === 'rotativo') {
          blocos.push(
            h('section', { class: 'calc-secao' }, h('h3', {}, DIVIDA_TEXT.parcelarTitle), cartao(campo('parcelarTaxaMes'), campo('parcelarParcelas')), blocoResultado(parcelamento?.ok ? parcelamento.result : null, { nivel: 4 })),
          );
        }
        return blocos;
      },
    };
  },

  'parcelado-ou-a-vista': (ctx, pre) => {
    const modo = pre.modo === 'cota-unica' ? 'cota-unica' : 'compra';
    const specs = calcFields('parcelado-ou-a-vista', modo);
    const v = { aVista: pre.aVista ?? '', parcelas: pre.parcelas ?? '', parcela: pre.parcela ?? '' };
    let primeira = specs.primeiraNaCompra.default === true;
    let forma = null;
    let saida;
    const campo = (chave) => campoTexto(ctx, { chave, spec: specs[chave], ler: () => v[chave], escrever: (t) => (v[chave] = t), erro: () => saida.errors?.[chave] });
    return {
      calcular: () => (saida = calcParceladoOuAVista({ modo, ...v, primeiraNaCompra: primeira, formaPagamento: modo === 'compra' ? forma : null })),
      formulario: () => [
        cartao(
          campo('aVista'),
          campo('parcelas'),
          campo('parcela'),
          simNao(ctx, { chave: 'primeiraNaCompra', spec: specs.primeiraNaCompra, ler: () => primeira, escrever: (x) => (primeira = x) }),
          modo === 'compra'
            ? escolha(ctx, { chave: 'formaPagamento', rotulo: specs.formaPagamento.label, opcoes: specs.formaPagamento.options, ler: () => forma, escrever: (x) => (forma = x) })
            : null,
        ),
      ],
      resultado: () => {
        const r = saida.ok ? saida.result : null;
        const aviso =
          r?.action === 'aviso_cartao'
            ? nota('Parcelas de compras no cartão já entram na fatura. Para não contar duas vezes, anote como parcelamento só o que for pago em boleto, débito ou financiamento.')
            : null;
        return [blocoResultado(r, { extras: aviso ? [aviso] : [] })];
      },
    };
  },

  'quitar-antes': (ctx, pre) => {
    const specs = calcFields('quitar-antes');
    const v = { parcela: pre.parcela ?? '', restantes: pre.restantes ?? '', taxaMes: '', quantas: '' };
    let modo = pre.modo ?? specs.modo.default;
    let saida;
    const campo = (chave) => campoTexto(ctx, { chave, spec: specs[chave], ler: () => v[chave], escrever: (t) => (v[chave] = t), erro: () => saida.errors?.[chave] });
    return {
      calcular: () => (saida = calcQuitarAntes({ ...v, modo })),
      formulario: () => [
        cartao(
          campo('parcela'),
          campo('restantes'),
          campo('taxaMes'),
          escolha(ctx, { chave: 'modo', rotulo: specs.modo.label, opcoes: specs.modo.options, ler: () => modo, escrever: (x) => (modo = x), estrutural: true }),
          modo === 'ultimas' ? campo('quantas') : null,
        ),
      ],
      resultado: () => [blocoResultado(saida.ok ? saida.result : null)],
    };
  },

  'multa-e-juros': (ctx, pre) => {
    const specs = calcFields('multa-e-juros');
    const v = { valor: pre.valor ?? '', multaPct: '', jurosMesPct: '', dias: pre.dias ?? '' };
    let saida;
    const campo = (chave) => campoTexto(ctx, { chave, spec: specs[chave], ler: () => v[chave], escrever: (t) => (v[chave] = t), erro: () => saida.errors?.[chave] });
    return {
      calcular: () => (saida = calcMultaEJuros(v)),
      formulario: () => [cartao(campo('valor'), campo('multaPct'), campo('jurosMesPct'), campo('dias'))],
      resultado: () => [blocoResultado(saida.ok ? saida.result : null)],
    };
  },

  reserva: (ctx, pre) => {
    const specs = calcFields('reserva');
    const v = { essenciais: pre.essenciais ?? '', meses: '', guardado: '', mensal: '' };
    let escolhido = null; // número de meses (1, 3, 6, 12), 'outro' ou nada ainda
    let saida;
    const campo = (chave, extra = {}) => campoTexto(ctx, { chave, spec: specs[chave], ler: () => v[chave], escrever: (t) => (v[chave] = t), erro: () => saida.errors?.[chave], ...extra });
    const textoDosMeses = () => (escolhido === 'outro' ? v.meses : escolhido === null ? '' : String(escolhido));
    const mesesRotulo = (n) => (n === 1 ? '1 mês' : `${n} meses`);
    return {
      calcular: () => (saida = calcReserva({ ...v, meses: textoDosMeses() })),
      formulario: () => [
        cartao(
          campo('essenciais'),
          escolha(ctx, {
            chave: 'meses-escolha',
            rotulo: specs.meses.label,
            dica: specs.meses.hint,
            opcoes: [...RESERVA_MONTH_CHIPS.map((n) => ({ value: String(n), label: mesesRotulo(n) })), { value: 'outro', label: 'Outro' }],
            rotulosAcessiveis: { outro: 'Outro número de meses' },
            ler: () => (escolhido === null ? null : String(escolhido)),
            escrever: (x) => (escolhido = x === 'outro' ? 'outro' : Number(x)),
            estrutural: true,
            erro: () => (escolhido === null && !saida.ok && soEscolhasFaltam(saida.errors, ['meses']) ? RESERVA_TEXT.chooseMonths : null),
          }),
          escolhido === 'outro' ? campo('meses', { rotulo: 'Número de meses', dica: 'De 1 a 24.' }) : null,
          campo('guardado', { dica: 'Opcional.' }),
          campo('mensal', { dica: 'Opcional.' }),
        ),
      ],
      resultado: () => [blocoResultado(saida.ok ? saida.result : null), h('p', { class: 'nota' }, RESERVA_REFERENCIA.text)],
    };
  },

  'juntar-para-objetivo': (ctx, pre) => {
    const specs = calcFields('juntar-para-objetivo');
    const v = { alvo: pre.alvo ?? '', jaTem: '', meses: '', mensal: '' };
    let modo = pre.modo ?? specs.modo.default;
    let saida;
    const campo = (chave, extra = {}) => campoTexto(ctx, { chave, spec: specs[chave], ler: () => v[chave], escrever: (t) => (v[chave] = t), erro: () => saida.errors?.[chave], ...extra });
    return {
      calcular: () => (saida = calcJuntarParaObjetivo({ ...v, modo })),
      formulario: () => [
        cartao(
          campo('alvo'),
          campo('jaTem', { dica: 'Opcional.' }),
          escolha(ctx, { chave: 'modo', rotulo: specs.modo.label, opcoes: specs.modo.options, ler: () => modo, escrever: (x) => (modo = x), estrutural: true }),
          modo === 'prazo' ? campo('meses') : campo('mensal'),
        ),
      ],
      resultado: () => [blocoResultado(saida.ok ? saida.result : null)],
    };
  },

  'dividir-contas': (ctx, pre) => {
    const specs = calcFields('dividir-contas');
    const v = { total: pre.total ?? '' };
    let modo = pre.modo ?? specs.modo.default;
    let proximoId = 2;
    let pessoas = [0, 1].map((id) => ({ id, apelido: '', renda: '' }));
    let saida;
    const erros = () => (saida.ok ? {} : saida.errors);
    const campoDaPessoa = (p, i, chave, rotulo, dica) =>
      campoTexto(ctx, {
        chave: `${chave}.${p.id}`,
        nomeErro: `${chave}.${i}`,
        spec: specs[chave],
        rotulo,
        dica,
        ler: () => p[chave],
        escrever: (t) => (p[chave] = t),
        erro: () => erros()[`${chave}.${i}`],
      });
    return {
      calcular: () => (saida = calcDividirContas({ total: v.total, modo, pessoas: pessoas.map((p) => ({ apelido: p.apelido, ...(modo === 'renda' ? { renda: p.renda } : {}) })) })),
      formulario: () => [
        cartao(
          campoTexto(ctx, { chave: 'total', spec: specs.total, ler: () => v.total, escrever: (t) => (v.total = t), erro: () => erros().total }),
          escolha(ctx, { chave: 'modo', rotulo: specs.modo.label, opcoes: specs.modo.options, ler: () => modo, escrever: (x) => (modo = x), estrutural: true }),
        ),
        cartao(
          h('div', { class: 'calc-titulo' }, h('h3', {}, specs.pessoas.label), h('p', { class: 'dica' }, DIVIDIR_TEXT.peopleRange)),
          pessoas.map((p, i) => {
            const nome = personName(p.apelido, i);
            return h(
              'div',
              { class: 'calc-item' },
              h('h4', {}, `Pessoa ${i + 1}`),
              campoDaPessoa(p, i, 'apelido', DIVIDIR_TEXT.nicknameLabel(i), DIVIDIR_TEXT.nicknameHint),
              modo === 'renda' ? campoDaPessoa(p, i, 'renda', DIVIDIR_TEXT.incomeLabel(nome)) : null,
              pessoas.length > DIVIDIR_MIN_PEOPLE
                ? botao(DIVIDIR_TEXT.removePerson(nome), () => {
                    pessoas = pessoas.filter((x) => x.id !== p.id);
                    ctx.reconstruir();
                  }, 'botao-texto')
                : null,
            );
          }),
          pessoas.length < DIVIDIR_MAX_PEOPLE
            ? botao(DIVIDIR_TEXT.addPerson, () => {
                pessoas = [...pessoas, { id: proximoId++, apelido: '', renda: '' }];
                ctx.reconstruir();
              })
            : null,
        ),
      ],
      resultado: () => [blocoResultado(saida.ok ? saida.result : null)],
    };
  },

  'antes-de-financiar': (ctx) => {
    const v = { preco: '', entrada: '', parcelas: '', taxaMes: '', renda: '', guardar: '', rendimento: '' };
    let primeira = ANTES_FIELDS.primeiraEmUmMes.default === true;
    let saida;
    const campo = (chave, extra = {}) => campoTexto(ctx, { chave, spec: ANTES_FIELDS[chave], ler: () => v[chave], escrever: (t) => (v[chave] = t), erro: () => saida.errors?.[chave], ...extra });
    return {
      // O comprometido do mês vem da conta de quem usa o app; aqui só entra a renda que a pessoa digita.
      calcular: () => (saida = calcAntesDeFinanciar({ ...v, primeiraEmUmMes: primeira }, ctx.hoje)),
      formulario: () => [
        cartao(
          campo('preco'),
          campo('entrada'),
          campo('parcelas'),
          campo('taxaMes'),
          simNao(ctx, { chave: 'primeiraEmUmMes', spec: ANTES_FIELDS.primeiraEmUmMes, ler: () => primeira, escrever: (x) => (primeira = x) }),
        ),
        cartao(campo('renda')),
        cartao(h('h3', {}, ANTES_TEXT.alternativeTitle), h('p', { class: 'dica' }, ANTES_TEXT.alternativeHint), campo('guardar'), campo('rendimento')),
      ],
      resultado: () => {
        const r = saida.ok ? saida.result : null;
        const blocos = [blocoResultado(r)];
        if (r && !r.nothingToFinance) {
          blocos.push(
            h('section', { class: 'calc-secao' }, h('h3', {}, ANTES_TEXT.savingTitle), h('div', {}, r.savingLines.map((l, i) => h('p', { class: i === 0 ? 'calc-destaque-2' : null }, l)))),
            h(
              'section',
              { class: 'calc-secao' },
              h('h3', {}, ANTES_TEXT.entryTitle),
              r.entryLines.length > 0 ? r.entryLines.map((l) => h('p', {}, l)) : h('p', { class: 'nota' }, ANTES_TEXT.noBiggerEntry),
              botao(ANTES_TEXT.otherEntry, () => document.getElementById('c-entrada')?.focus(), 'botao-texto'),
            ),
          );
        }
        return blocos;
      },
    };
  },

  'plano-dividas': (ctx) => {
    let proximoId = 0;
    let dividas = [];
    const v = { extra: '' };
    let saida;
    const erros = () => (saida.ok ? {} : saida.errors);
    const sem = ({ id, ...d }) => d;
    const campoDaDivida = (d, i, campo, nome) => {
      const spec = PLANO_FIELDS[campo];
      return campoTexto(ctx, {
        chave: `${campo}.${d.id}`,
        nomeErro: `${campo}.${i}`,
        spec,
        ler: () => d[campo] ?? '',
        escrever: (t) => (d[campo] = t),
        erro: () => erros()[`${campo}.${i}`],
        nomeAcessivel: `${spec.label}, ${nome}`,
      });
    };
    const cartaoDaDivida = (d, i) => {
      const nome = planoDebtName(d.apelido, i);
      // O "vazio" de uma escolha só aparece quando ela é a única coisa que falta (antes disso, o resultado já diz para preencher).
      const soTipos = () => Object.entries(erros()).length > 0 && Object.entries(erros()).every(([k, c]) => k.startsWith('tipo.') && c === 'vazio');
      return h(
        'div',
        { class: 'calc-item' },
        h('h4', {}, nome),
        campoDaDivida(d, i, 'apelido', nome),
        escolha(ctx, {
          chave: `tipo.${d.id}`,
          rotulo: PLANO_FIELDS.tipo.label,
          dica: i === 0 ? PLANO_TEXT.typeHint : undefined,
          opcoes: PLANO_FIELDS.tipo.options,
          ler: () => d.tipo,
          escrever: (x) => (d.tipo = x),
          estrutural: true,
          rotulosAcessiveis: Object.fromEntries(PLANO_FIELDS.tipo.options.map((o) => [o.value, `${o.label}, ${nome}`])),
          erro: () => (d.tipo === null && soTipos() && erros()[`tipo.${i}`] ? calcErrorText('plano-dividas', `tipo.${i}`, erros()[`tipo.${i}`]) : null),
        }),
        d.tipo === 'parcelada' ? [campoDaDivida(d, i, 'parcela', nome), campoDaDivida(d, i, 'restantes', nome), campoDaDivida(d, i, 'taxaParcelada', nome)] : null,
        d.tipo === 'saldo' ? [campoDaDivida(d, i, 'saldo', nome), campoDaDivida(d, i, 'taxaSaldo', nome), campoDaDivida(d, i, 'pagamento', nome), planoDebtStays(d) ? nota(PLANO_TEXT.balanceStays) : null] : null,
        botao(PLANO_TEXT.removeDebt, () => {
          dividas = dividas.filter((x) => x.id !== d.id);
          ctx.reconstruir();
        }, 'botao-texto'),
      );
    };
    return {
      calcular: () => (saida = calcPlanoDividas({ dividas: dividas.map(sem), extra: v.extra }, ctx.hoje)),
      formulario: () => [
        cartao(
          h('div', { class: 'calc-titulo' }, h('h3', {}, PLANO_TEXT.listTitle), h('p', { class: 'dica' }, PLANO_TEXT.listHint)),
          dividas.length === 0 ? h('p', { class: 'nota' }, PLANO_TEXT.emptyList) : null,
          dividas.map(cartaoDaDivida),
          dividas.length < PLANO_MAX_DEBTS
            ? botao(PLANO_TEXT.addDebt, () => {
                dividas = [...dividas, { id: proximoId++, tipo: null, apelido: '' }];
                ctx.reconstruir();
              })
            : h('p', { class: 'nota' }, PLANO_TEXT.maxReached),
        ),
        cartao(campoTexto(ctx, { chave: 'extra', spec: PLANO_FIELDS.extra, ler: () => v.extra, escrever: (t) => (v.extra = t), erro: () => erros().extra })),
      ],
      resultado: () => {
        const r = saida.ok ? saida.result : null;
        const detalhes =
          r && r.scenarios.length > 0
            ? h(
                'div',
                { class: 'calc-detalhes' },
                h('h4', {}, PLANO_TEXT.detailsTitle),
                r.scenarios.map((s) =>
                  h(
                    'div',
                    { class: 'calc-cenario' },
                    h('h5', {}, s.title),
                    s.caption ? h('p', { class: 'dica' }, s.caption) : null,
                    s.months === null ? h('p', {}, PLANO_TEXT.noEnd) : null,
                    s.detailLines.map((l) => h('p', {}, l)),
                    s.sequenceLines.length > 0 ? [h('p', { class: 'dica' }, PLANO_TEXT.sequenceTitle), s.sequenceLines.map((l) => h('p', {}, l))] : null,
                  ),
                ),
              )
            : null;
        return [blocoResultado(r, { extras: detalhes ? [detalhes] : [] })];
      },
    };
  },
};

// --------------------------------------------------------------------------------------------------------------------
// Início da página

function iniciar(raiz) {
  const slug = raiz.getAttribute('data-calculadora');
  const fabrica = DEFINICOES[slug];
  if (!fabrica) return;
  // O único parâmetro lido do endereço é "modo", o mesmo que os temas de Aprender usam. Nada é escrito de volta no endereço.
  const modoDoEndereco = new URLSearchParams(window.location.search).get('modo');
  const pre = calcPrefill(slug, modoDoEndereco ? { modo: modoDoEndereco } : {});
  const cotaUnica = slug === 'parcelado-ou-a-vista' && pre.modo === 'cota-unica';
  const ctx = { slug, modo: cotaUnica ? 'cota-unica' : undefined, saiu: {}, editado: {}, ganchos: [], hoje: todayIn(deviceTimeZone(), new Date()) };
  const def = fabrica(ctx, pre);

  const formulario = h('div', { class: 'calc-formulario' });
  const resultados = h('div', { class: 'calc-resultados' });
  raiz.replaceChildren(formulario, resultados);

  // "Cota única ou parcelado?" é a mesma calculadora aberta pela conta do ano: troca o título da página.
  if (cotaUnica) {
    const titulo = calcTitle(slug, ctx.modo);
    const h1 = document.querySelector('h1');
    if (h1) h1.textContent = titulo;
    document.title = `${titulo} · Clarevo`;
  }

  // Região viva só para o leitor de tela: o resultado é dito uma vez, depois que a pessoa para de digitar.
  const status = h('div', { class: 'so-leitor', role: 'status', 'aria-live': 'polite' });
  raiz.append(status);
  let tempoDoAnuncio = null;
  let ultimoAnuncio = '';
  const anunciar = () => {
    clearTimeout(tempoDoAnuncio);
    tempoDoAnuncio = setTimeout(() => {
      const texto = [...resultados.querySelectorAll('.calc-linhas')]
        .filter((l) => !l.querySelector('.nota'))
        .map((l) => [...l.querySelectorAll('p')].map((p) => p.textContent).join(' '))
        .join(' ');
      if (texto && texto !== ultimoAnuncio) {
        ultimoAnuncio = texto;
        status.textContent = texto;
      }
    }, 600);
  };
  // Trocar o conteúdo tira o campo do foco: o foco e a posição do cursor voltam para o mesmo campo.
  const guardarFoco = () => {
    const a = document.activeElement;
    return a && a.tagName === 'INPUT' && a.id ? { id: a.id, ini: a.selectionStart, fim: a.selectionEnd } : null;
  };
  const restaurarFoco = (f) => {
    const el = f ? document.getElementById(f.id) : null;
    if (!el) return;
    el.focus();
    try {
      el.setSelectionRange(f.ini, f.fim);
    } catch {
      // campo sem seleção: nada a restaurar
    }
  };

  let ultimoTexto = null;
  let ganchosDoResultado = [];
  ctx.trocando = false;
  ctx.atualizar = () => {
    if (ctx.trocando) return;
    def.calcular();
    for (const g of ctx.ganchos) g();
    // Os campos que moram no resultado (como "E se parcelar a fatura?") registram os próprios ganchos à parte.
    const doFormulario = ctx.ganchos;
    ctx.ganchos = [];
    const novo = h('div', {}, def.resultado());
    const doResultado = ctx.ganchos;
    ctx.ganchos = doFormulario;
    for (const g of doResultado) g();
    // O resultado só é refeito quando o texto muda: nada pisca nem se repete a cada tecla.
    if (novo.textContent !== ultimoTexto) {
      const foco = guardarFoco();
      ctx.trocando = true;
      ultimoTexto = novo.textContent;
      resultados.replaceChildren(...novo.childNodes);
      ganchosDoResultado = doResultado;
      ctx.trocando = false;
      restaurarFoco(foco);
      anunciar();
    } else for (const g of ganchosDoResultado) g();
  };
  ctx.reconstruir = (focoEm) => {
    const foco = guardarFoco();
    ctx.ganchos = [];
    def.calcular();
    ctx.trocando = true;
    formulario.replaceChildren(...def.formulario());
    ctx.trocando = false;
    ultimoTexto = null;
    ctx.atualizar();
    if (focoEm) {
      const [nome, valor] = focoEm.split(':');
      formulario.querySelector(`input[name="${nome}"][value="${valor}"]`)?.focus();
    } else restaurarFoco(foco);
  };
  ctx.reconstruir();
  raiz.setAttribute('data-pronta', 'sim');
}

const raiz = document.querySelector('[data-calculadora]');
if (raiz) iniciar(raiz);
