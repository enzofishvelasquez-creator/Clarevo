// Calculadora "juros-compostos" (D-106): os campos, o que calcular e o que mostrar. O que ela chama do core (o cálculo, os textos e as faixas)
// vem no terceiro argumento, que é o módulo dela em js/nucleo/ (o do core, transpilado). Só esta página carrega este arquivo.
import { blocoResultado, campoTexto, camposDe, cartao } from '../base.js';

export default (ctx, pre, { calcJurosCompostos }) => {
  const specs = camposDe('juros-compostos');
  const v = { inicial: '', mensal: '', taxaAno: '', meses: '' };
  let saida;
  const campo = (chave, extra = {}) => campoTexto(ctx, { chave, spec: specs[chave], ler: () => v[chave], escrever: (t) => (v[chave] = t), erro: () => saida.errors?.[chave], ...extra });
  return {
    calcular: () => (saida = calcJurosCompostos(v)),
    formulario: () => [cartao(campo('inicial', { dica: 'Opcional.' }), campo('mensal'), campo('taxaAno'), campo('meses'))],
    resultado: () => [blocoResultado(saida.ok ? saida.result : null)],
  };
};
