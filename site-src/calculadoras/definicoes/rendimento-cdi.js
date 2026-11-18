// Calculadora "rendimento-cdi" (D-106): os campos, o que calcular e o que mostrar. O que ela chama do core (o cálculo, os textos e as faixas)
// vem no terceiro argumento, que é o módulo dela em js/nucleo/ (o do core, transpilado). Só esta página carrega este arquivo.
import { blocoResultado, campoTexto, camposDe, cartao, escolha } from '../base.js';

export default (ctx, pre, { calcRendimentoCdi }) => {
  const specs = camposDe('rendimento-cdi');
  const v = { valor: '', percentual: '', cdiAno: '', meses: '' };
  let imposto = specs.imposto.default;
  let saida;
  const campo = (chave, extra = {}) => campoTexto(ctx, { chave, spec: specs[chave], ler: () => v[chave], escrever: (t) => (v[chave] = t), erro: () => saida.errors?.[chave], ...extra });
  return {
    calcular: () => (saida = calcRendimentoCdi({ ...v, imposto })),
    formulario: () => [
      cartao(
        campo('valor'),
        campo('percentual'),
        campo('cdiAno'),
        campo('meses'),
        escolha(ctx, { chave: 'imposto', rotulo: specs.imposto.label, opcoes: specs.imposto.options, ler: () => imposto, escrever: (x) => (imposto = x) }),
      ),
    ],
    resultado: () => [blocoResultado(saida.ok ? saida.result : null)],
  };
};
