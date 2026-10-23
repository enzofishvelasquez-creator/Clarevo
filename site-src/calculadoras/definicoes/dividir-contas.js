// Calculadora "dividir-contas" (D-066): os campos, o que calcular e o que mostrar. O que ela chama do core (o cálculo, os textos e as faixas) vem no
// terceiro argumento, que é o módulo dela em js/nucleo/ (o do core, transpilado). Só esta página carrega este arquivo.
import { blocoResultado, botao, campoTexto, camposDe, cartao, escolha, h } from '../base.js';

export default (ctx, pre, { DIVIDIR_MAX_PEOPLE, DIVIDIR_MIN_PEOPLE, DIVIDIR_TEXT, calcDividirContas, personName }) => {
  const specs = camposDe('dividir-contas');
  const v = { total: pre.total ?? '' };
  let modo = pre.modo ?? specs.modo.default;
  let proximoId = 2;
  let pessoas = [0, 1].map((id) => ({ id, apelido: '', renda: '' }));
  let saida;
  const erros = () => (saida.ok ? {} : saida.errors);
  const campoDaPessoa = (p, i, chave, rotulo, dica) =>
    campoTexto(ctx, {
      chave: `${chave}.${p.id}`,
      nomeErro: `${chave}.${i}`,
      spec: specs[chave],
      rotulo,
      dica,
      ler: () => p[chave],
      escrever: (t) => (p[chave] = t),
      erro: () => erros()[`${chave}.${i}`],
    });
  return {
    calcular: () => (saida = calcDividirContas({ total: v.total, modo, pessoas: pessoas.map((p) => ({ apelido: p.apelido, ...(modo === 'renda' ? { renda: p.renda } : {}) })) })),
    formulario: () => [
      cartao(
        campoTexto(ctx, { chave: 'total', spec: specs.total, ler: () => v.total, escrever: (t) => (v.total = t), erro: () => erros().total }),
        escolha(ctx, { chave: 'modo', rotulo: specs.modo.label, opcoes: specs.modo.options, ler: () => modo, escrever: (x) => (modo = x), estrutural: true }),
      ),
      cartao(
        h('div', { class: 'calc-titulo' }, h('h3', {}, specs.pessoas.label), h('p', { class: 'dica' }, DIVIDIR_TEXT.peopleRange)),
        pessoas.map((p, i) => {
          const nome = personName(p.apelido, i);
          return h(
            'div',
            { class: 'calc-item' },
            h('h4', {}, `Pessoa ${i + 1}`),
            campoDaPessoa(p, i, 'apelido', DIVIDIR_TEXT.nicknameLabel(i), DIVIDIR_TEXT.nicknameHint),
            modo === 'renda' ? campoDaPessoa(p, i, 'renda', DIVIDIR_TEXT.incomeLabel(nome)) : null,
            pessoas.length > DIVIDIR_MIN_PEOPLE
              ? botao(DIVIDIR_TEXT.removePerson(nome), () => {
                  pessoas = pessoas.filter((x) => x.id !== p.id);
                  ctx.reconstruir();
                }, 'botao-texto')
              : null,
          );
        }),
        pessoas.length < DIVIDIR_MAX_PEOPLE
          ? botao(DIVIDIR_TEXT.addPerson, () => {
              pessoas = [...pessoas, { id: proximoId++, apelido: '', renda: '' }];
              ctx.reconstruir();
            })
          : null,
      ),
    ],
    resultado: () => [blocoResultado(saida.ok ? saida.result : null)],
  };
};
