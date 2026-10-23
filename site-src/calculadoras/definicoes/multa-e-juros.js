// Calculadora "multa-e-juros" (D-066): os campos, o que calcular e o que mostrar. O que ela chama do core (o cálculo, os textos e as faixas) vem no
// terceiro argumento, que é o módulo dela em js/nucleo/ (o do core, transpilado). Só esta página carrega este arquivo.
import { blocoResultado, campoTexto, camposDe, cartao } from '../base.js';

export default (ctx, pre, { calcMultaEJuros }) => {
  const specs = camposDe('multa-e-juros');
  const v = { valor: pre.valor ?? '', multaPct: '', jurosMesPct: '', dias: pre.dias ?? '' };
  let saida;
  const campo = (chave) => campoTexto(ctx, { chave, spec: specs[chave], ler: () => v[chave], escrever: (t) => (v[chave] = t), erro: () => saida.errors?.[chave] });
  return {
    calcular: () => (saida = calcMultaEJuros(v)),
    formulario: () => [cartao(campo('valor'), campo('multaPct'), campo('jurosMesPct'), campo('dias'))],
    resultado: () => [blocoResultado(saida.ok ? saida.result : null)],
  };
};
