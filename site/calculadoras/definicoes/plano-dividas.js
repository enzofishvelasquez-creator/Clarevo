// Calculadora "plano-dividas" (D-066): os campos, o que calcular e o que mostrar. O que ela chama do core (o cálculo, os textos e as faixas) vem no
// terceiro argumento, que é o módulo dela em js/nucleo/ (o do core, transpilado). Só esta página carrega este arquivo.
import { blocoResultado, botao, campoTexto, cartao, escolha, h, nota, textoDoErro } from '../base.js';

export default (ctx, pre, { PLANO_FIELDS, PLANO_MAX_DEBTS, PLANO_TEXT, calcPlanoDividas, planoDebtName, planoDebtStays }) => {
  let proximoId = 0;
  let dividas = [];
  const v = { extra: '' };
  let saida;
  const erros = () => (saida.ok ? {} : saida.errors);
  const sem = ({ id, ...d }) => d;
  const campoDaDivida = (d, i, campo, nome) => {
    const spec = PLANO_FIELDS[campo];
    return campoTexto(ctx, {
      chave: `${campo}.${d.id}`,
      nomeErro: `${campo}.${i}`,
      spec,
      ler: () => d[campo] ?? '',
      escrever: (t) => (d[campo] = t),
      erro: () => erros()[`${campo}.${i}`],
      nomeAcessivel: `${spec.label}, ${nome}`,
    });
  };
  const cartaoDaDivida = (d, i) => {
    const nome = planoDebtName(d.apelido, i);
    // O "vazio" de uma escolha só aparece quando ela é a única coisa que falta (antes disso, o resultado já diz para preencher).
    const soTipos = () => Object.entries(erros()).length > 0 && Object.entries(erros()).every(([k, c]) => k.startsWith('tipo.') && c === 'vazio');
    return h(
      'div',
      { class: 'calc-item' },
      h('h4', {}, nome),
      campoDaDivida(d, i, 'apelido', nome),
      escolha(ctx, {
        chave: `tipo.${d.id}`,
        rotulo: PLANO_FIELDS.tipo.label,
        dica: i === 0 ? PLANO_TEXT.typeHint : undefined,
        opcoes: PLANO_FIELDS.tipo.options,
        ler: () => d.tipo,
        escrever: (x) => (d.tipo = x),
        estrutural: true,
        rotulosAcessiveis: Object.fromEntries(PLANO_FIELDS.tipo.options.map((o) => [o.value, `${o.label}, ${nome}`])),
        erro: () => (d.tipo === null && soTipos() && erros()[`tipo.${i}`] ? textoDoErro('plano-dividas', `tipo.${i}`, erros()[`tipo.${i}`]) : null),
      }),
      d.tipo === 'parcelada' ? [campoDaDivida(d, i, 'parcela', nome), campoDaDivida(d, i, 'restantes', nome), campoDaDivida(d, i, 'taxaParcelada', nome)] : null,
      d.tipo === 'saldo' ? [campoDaDivida(d, i, 'saldo', nome), campoDaDivida(d, i, 'taxaSaldo', nome), campoDaDivida(d, i, 'pagamento', nome), planoDebtStays(d) ? nota(PLANO_TEXT.balanceStays) : null] : null,
      botao(PLANO_TEXT.removeDebt, () => {
        dividas = dividas.filter((x) => x.id !== d.id);
        ctx.reconstruir();
      }, 'botao-texto'),
    );
  };
  return {
    calcular: () => (saida = calcPlanoDividas({ dividas: dividas.map(sem), extra: v.extra }, ctx.hoje)),
    formulario: () => [
      cartao(
        h('div', { class: 'calc-titulo' }, h('h3', {}, PLANO_TEXT.listTitle), h('p', { class: 'dica' }, PLANO_TEXT.listHint)),
        dividas.length === 0 ? h('p', { class: 'nota' }, PLANO_TEXT.emptyList) : null,
        dividas.map(cartaoDaDivida),
        dividas.length < PLANO_MAX_DEBTS
          ? botao(PLANO_TEXT.addDebt, () => {
              dividas = [...dividas, { id: proximoId++, tipo: null, apelido: '' }];
              ctx.reconstruir();
            })
          : h('p', { class: 'nota' }, PLANO_TEXT.maxReached),
      ),
      cartao(campoTexto(ctx, { chave: 'extra', spec: PLANO_FIELDS.extra, ler: () => v.extra, escrever: (t) => (v.extra = t), erro: () => erros().extra })),
    ],
    resultado: () => {
      const r = saida.ok ? saida.result : null;
      const detalhes =
        r && r.scenarios.length > 0
          ? h(
              'div',
              { class: 'calc-detalhes' },
              h('h4', {}, PLANO_TEXT.detailsTitle),
              r.scenarios.map((s) =>
                h(
                  'div',
                  { class: 'calc-cenario' },
                  h('h5', {}, s.title),
                  s.caption ? h('p', { class: 'dica' }, s.caption) : null,
                  s.months === null ? h('p', {}, PLANO_TEXT.noEnd) : null,
                  s.detailLines.map((l) => h('p', {}, l)),
                  s.sequenceLines.length > 0 ? [h('p', { class: 'dica' }, PLANO_TEXT.sequenceTitle), s.sequenceLines.map((l) => h('p', {}, l))] : null,
                ),
              ),
            )
          : null;
      return [blocoResultado(r, { extras: detalhes ? [detalhes] : [] })];
    },
  };
};
