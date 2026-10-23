// Calculadora "quitar-antes" (D-066): os campos, o que calcular e o que mostrar. O que ela chama do core (o cálculo, os textos e as faixas) vem no
// terceiro argumento, que é o módulo dela em js/nucleo/ (o do core, transpilado). Só esta página carrega este arquivo.
import { blocoResultado, campoTexto, camposDe, cartao, escolha } from '../base.js';

export default (ctx, pre, { calcQuitarAntes }) => {
  const specs = camposDe('quitar-antes');
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
};
