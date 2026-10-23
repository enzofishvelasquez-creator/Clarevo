// Calculadora "juntar-para-objetivo" (D-066): os campos, o que calcular e o que mostrar. O que ela chama do core (o cálculo, os textos e as faixas) vem no
// terceiro argumento, que é o módulo dela em js/nucleo/ (o do core, transpilado). Só esta página carrega este arquivo.
import { blocoResultado, campoTexto, camposDe, cartao, escolha } from '../base.js';

export default (ctx, pre, { calcJuntarParaObjetivo }) => {
  const specs = camposDe('juntar-para-objetivo');
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
};
