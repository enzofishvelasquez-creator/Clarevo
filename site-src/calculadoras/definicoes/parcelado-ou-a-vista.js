// Calculadora "parcelado-ou-a-vista" (D-066): os campos, o que calcular e o que mostrar. O que ela chama do core (o cálculo, os textos e as faixas) vem no
// terceiro argumento, que é o módulo dela em js/nucleo/ (o do core, transpilado). Só esta página carrega este arquivo.
import { blocoResultado, campoTexto, camposDe, cartao, escolha, nota, simNao } from '../base.js';

export default (ctx, pre, { calcParceladoOuAVista }) => {
  const modo = pre.modo === 'cota-unica' ? 'cota-unica' : 'compra';
  const specs = camposDe('parcelado-ou-a-vista', modo);
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
};
