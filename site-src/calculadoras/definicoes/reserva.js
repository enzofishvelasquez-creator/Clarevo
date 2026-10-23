// Calculadora "reserva" (D-066): os campos, o que calcular e o que mostrar. O que ela chama do core (o cálculo, os textos e as faixas) vem no
// terceiro argumento, que é o módulo dela em js/nucleo/ (o do core, transpilado). Só esta página carrega este arquivo.
import { blocoResultado, campoTexto, camposDe, cartao, escolha, h, nota, soEscolhasFaltam } from '../base.js';

export default (ctx, pre, { RESERVA_MONTH_CHIPS, RESERVA_REFERENCIA, RESERVA_TEXT, calcReserva }) => {
  const specs = camposDe('reserva');
  const v = { essenciais: pre.essenciais ?? '', meses: '', guardado: '', mensal: '' };
  let escolhido = null; // número de meses (1, 3, 6, 12), 'outro' ou nada ainda
  let saida;
  const campo = (chave, extra = {}) => campoTexto(ctx, { chave, spec: specs[chave], ler: () => v[chave], escrever: (t) => (v[chave] = t), erro: () => saida.errors?.[chave], ...extra });
  const textoDosMeses = () => (escolhido === 'outro' ? v.meses : escolhido === null ? '' : String(escolhido));
  const mesesRotulo = (n) => (n === 1 ? '1 mês' : `${n} meses`);
  return {
    calcular: () => (saida = calcReserva({ ...v, meses: textoDosMeses() })),
    formulario: () => [
      cartao(
        campo('essenciais'),
        escolha(ctx, {
          chave: 'meses-escolha',
          rotulo: specs.meses.label,
          dica: specs.meses.hint,
          opcoes: [...RESERVA_MONTH_CHIPS.map((n) => ({ value: String(n), label: mesesRotulo(n) })), { value: 'outro', label: 'Outro' }],
          rotulosAcessiveis: { outro: 'Outro número de meses' },
          ler: () => (escolhido === null ? null : String(escolhido)),
          escrever: (x) => (escolhido = x === 'outro' ? 'outro' : Number(x)),
          estrutural: true,
          erro: () => (escolhido === null && !saida.ok && soEscolhasFaltam(saida.errors, ['meses']) ? RESERVA_TEXT.chooseMonths : null),
        }),
        escolhido === 'outro' ? campo('meses', { rotulo: 'Número de meses', dica: 'De 1 a 24.' }) : null,
        campo('guardado', { dica: 'Opcional.' }),
        campo('mensal', { dica: 'Opcional.' }),
      ),
    ],
    resultado: () => [blocoResultado(saida.ok ? saida.result : null), h('p', { class: 'nota' }, RESERVA_REFERENCIA.text)],
  };
};
