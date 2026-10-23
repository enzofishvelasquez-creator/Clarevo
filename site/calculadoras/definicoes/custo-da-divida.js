// Calculadora "custo-da-divida" (D-066): os campos, o que calcular e o que mostrar. O que ela chama do core (o cálculo, os textos e as faixas) vem no
// terceiro argumento, que é o módulo dela em js/nucleo/ (o do core, transpilado). Só esta página carrega este arquivo.
import { blocoResultado, campoTexto, camposDe, cartao, escolha, h, soEscolhasFaltam, textoDoErro } from '../base.js';

export default (ctx, pre, { DIVIDA_TEXT, calcCustoDaDivida }) => {
  const specs = camposDe('custo-da-divida');
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
          erro: () => (soEscolhasFaltam(erros, ['tipo']) ? textoDoErro('custo-da-divida', 'tipo', 'vazio') : null),
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
};
