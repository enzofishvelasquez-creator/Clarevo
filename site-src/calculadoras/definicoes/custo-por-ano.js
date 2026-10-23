// Calculadora "custo-por-ano" (D-066): os campos, o que calcular e o que mostrar. O que ela chama do core (o cálculo, os textos e as faixas) vem no
// terceiro argumento, que é o módulo dela em js/nucleo/ (o do core, transpilado). Só esta página carrega este arquivo.
import { blocoResultado, campoTexto, camposDe, cartao, escolha, soEscolhasFaltam, textoDoErro } from '../base.js';

export default (ctx, pre, { calcCustoPorAno }) => {
  const specs = camposDe('custo-por-ano');
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
          erro: () => (!saida.ok && soEscolhasFaltam(saida.errors, ['frequencia']) ? textoDoErro('custo-por-ano', 'frequencia', 'vazio') : null),
        }),
      ),
    ],
    resultado: () => [blocoResultado(saida.ok ? saida.result : null)],
  };
};
