// Calculadora "multa-e-juros" (D-066): os campos, o que calcular e o que mostrar. O que ela chama do core (o cálculo, os textos e as faixas) vem no
// terceiro argumento, que é o módulo dela em js/nucleo/ (o do core, transpilado). Só esta página carrega este arquivo.
import { blocoResultado, campoTexto, camposDe, cartao, escolha } from '../base.js';

export default (ctx, pre, { calcMultaEJuros }) => {
  // "Conta ou boleto" ou "Fatura do cartão" (o `modo` do core): a escolha troca os campos, os rótulos, as mensagens de erro e a conta.
  // O endereço só traz o modo (`?modo=fatura`), como nas outras calculadoras.
  let modo = pre.modo === 'fatura' ? 'fatura' : 'conta';
  ctx.modo = modo;
  const v = { valor: pre.valor ?? '', multaPct: '', jurosMesPct: '', dias: pre.dias ?? '', rotativoPct: '', moraPct: '' };
  let saida;
  const campo = (chave) => campoTexto(ctx, { chave, spec: camposDe('multa-e-juros', modo)[chave], ler: () => v[chave], escrever: (t) => (v[chave] = t), erro: () => saida.errors?.[chave] });
  return {
    calcular: () => (saida = calcMultaEJuros({ modo, ...v })),
    formulario: () => {
      const specs = camposDe('multa-e-juros', modo);
      return [
        cartao(
          escolha(ctx, {
            chave: 'modo',
            rotulo: specs.modo.label,
            opcoes: specs.modo.options,
            ler: () => modo,
            escrever: (x) => {
              modo = x;
              ctx.modo = x;
            },
            estrutural: true,
          }),
          campo('valor'),
          modo === 'fatura' ? [campo('rotativoPct'), campo('moraPct'), campo('multaPct')] : [campo('multaPct'), campo('jurosMesPct')],
          campo('dias'),
        ),
      ];
    },
    resultado: () => [blocoResultado(saida.ok ? saida.result : null)],
  };
};
