// Calculadora "antes-de-financiar" (D-066): os campos, o que calcular e o que mostrar. O que ela chama do core (o cálculo, os textos e as faixas) vem no
// terceiro argumento, que é o módulo dela em js/nucleo/ (o do core, transpilado). Só esta página carrega este arquivo.
import { blocoResultado, botao, campoTexto, cartao, h, nota, simNao } from '../base.js';

export default (ctx, pre, { ANTES_FIELDS, ANTES_TEXT, calcAntesDeFinanciar }) => {
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
};
