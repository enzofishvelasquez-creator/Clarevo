// Calculadoras do Clarevo no navegador (D-066). A conta, as faixas de validação e todo texto de resultado vêm do MESMO código do
// packages/core, transpilado em js/nucleo/ pelo gerador. Este arquivo só inicia a página: carrega o que a calculadora dela usa, monta a
// tela, lê o que a pessoa digita e mostra o que o núcleo devolve. Nada sai do navegador: sem envio, sem armazenamento, sem cookie e sem
// nada na URL (a página só lê "modo", o parâmetro que os temas de Aprender já usam).
//
// Cada página carrega só o que usa. O núcleo é do core, que liga as dez calculadoras entre si (`fields.js` importa as dez, e `links.js`
// traz as séries e os cartões), então importar esses dois de uma vez custaria cerca de 300 KB em toda página. Aqui entram de cara só as
// peças comuns (base.js), o catálogo, as datas e o que elas importam; o módulo do núcleo da calculadora da página e a definição dela
// (definicoes/<slug>.js, com os campos e a tela) vêm de `import()` (e o `modulepreload` da página já os pediu junto com tudo o que
// importam), e `links.js` só vem se o endereço trouxer `?modo=`.
import { calcTitle } from '../js/nucleo/calculators/catalog.js';
import { deviceTimeZone, todayIn } from '../js/nucleo/dates.js';
import { h, usarModulo } from './base.js';

/**
 * Para cada calculadora, o `import()` do módulo do núcleo e o da definição, com o caminho escrito por extenso (para o navegador e o
 * `modulepreload` saberem qual é). O gerador lê esta lista para montar o `modulepreload` de cada página, e o teste confere que ele cobre
 * tudo o que a página carrega.
 */
export const MODULOS = {
  'antes-de-financiar': { nucleo: () => import('../js/nucleo/calculators/antes-de-financiar.js'), definicao: () => import('./definicoes/antes-de-financiar.js') },
  'parcelado-ou-a-vista': { nucleo: () => import('../js/nucleo/calculators/parcelado-ou-a-vista.js'), definicao: () => import('./definicoes/parcelado-ou-a-vista.js') },
  'custo-por-ano': { nucleo: () => import('../js/nucleo/calculators/custo-por-ano.js'), definicao: () => import('./definicoes/custo-por-ano.js') },
  'custo-da-divida': { nucleo: () => import('../js/nucleo/calculators/custo-da-divida.js'), definicao: () => import('./definicoes/custo-da-divida.js') },
  'quitar-antes': { nucleo: () => import('../js/nucleo/calculators/quitar-antes.js'), definicao: () => import('./definicoes/quitar-antes.js') },
  'multa-e-juros': { nucleo: () => import('../js/nucleo/calculators/multa-e-juros.js'), definicao: () => import('./definicoes/multa-e-juros.js') },
  'plano-dividas': { nucleo: () => import('../js/nucleo/calculators/plano-dividas.js'), definicao: () => import('./definicoes/plano-dividas.js') },
  reserva: { nucleo: () => import('../js/nucleo/calculators/reserva.js'), definicao: () => import('./definicoes/reserva.js') },
  'juntar-para-objetivo': { nucleo: () => import('../js/nucleo/calculators/juntar-para-objetivo.js'), definicao: () => import('./definicoes/juntar-para-objetivo.js') },
  'dividir-contas': { nucleo: () => import('../js/nucleo/calculators/dividir-contas.js'), definicao: () => import('./definicoes/dividir-contas.js') },
};

// --------------------------------------------------------------------------------------------------------------------
// Início da página

/** Sem o módulo da calculadora (rede fora do ar, por exemplo), a mensagem de "carregando" passa a dizer isso. */
function avisarFalha(raiz) {
  const aviso = raiz.querySelector('.calc-carregando');
  if (aviso && aviso.firstChild) aviso.firstChild.textContent = 'Não foi possível carregar a calculadora. Recarregue a página. Se ela não aparecer, o seu navegador pode estar bloqueando o JavaScript deste site. Você também pode usar a ';
}

async function iniciar(raiz) {
  const slug = raiz.getAttribute('data-calculadora');
  const modulos = MODULOS[slug];
  if (!modulos) return;
  // O único parâmetro lido do endereço é "modo", o mesmo que os temas de Aprender usam. Nada é escrito de volta no endereço.
  // Sem ele não há o que preencher (o prefill do core só tem valores quando o endereço traz parâmetros), e `links.js`, que traz as
  // séries e os cartões, nem é carregado.
  const modoDoEndereco = new URLSearchParams(window.location.search).get('modo');
  let nucleo;
  let definicao;
  let pre;
  try {
    [nucleo, definicao, pre] = await Promise.all([
      modulos.nucleo(),
      modulos.definicao(),
      modoDoEndereco ? import('../js/nucleo/calculators/links.js').then((l) => l.calcPrefill(slug, { modo: modoDoEndereco })) : {},
    ]);
  } catch {
    avisarFalha(raiz);
    return;
  }
  usarModulo(nucleo);
  const cotaUnica = slug === 'parcelado-ou-a-vista' && pre.modo === 'cota-unica';
  const ctx = { slug, modo: cotaUnica ? 'cota-unica' : undefined, saiu: {}, editado: {}, ganchos: [], hoje: todayIn(deviceTimeZone(), new Date()) };
  const def = definicao.default(ctx, pre, nucleo);

  const formulario = h('div', { class: 'calc-formulario' });
  const resultados = h('div', { class: 'calc-resultados' });
  raiz.replaceChildren(formulario, resultados);

  // "Cota única ou parcelado?" é a mesma calculadora aberta pela conta do ano: troca o título da página.
  if (cotaUnica) {
    const titulo = calcTitle(slug, ctx.modo);
    const h1 = document.querySelector('h1');
    if (h1) h1.textContent = titulo;
    document.title = `${titulo} · Clarevo`;
  }

  // Região viva só para o leitor de tela: o resultado é dito uma vez, depois que a pessoa para de digitar.
  const status = h('div', { class: 'so-leitor', role: 'status', 'aria-live': 'polite' });
  raiz.append(status);
  let tempoDoAnuncio = null;
  let ultimoAnuncio = '';
  const anunciar = () => {
    clearTimeout(tempoDoAnuncio);
    tempoDoAnuncio = setTimeout(() => {
      const texto = [...resultados.querySelectorAll('.calc-linhas')]
        .filter((l) => !l.querySelector('.nota'))
        .map((l) => [...l.querySelectorAll('p')].map((p) => p.textContent).join(' '))
        .join(' ');
      if (texto && texto !== ultimoAnuncio) {
        ultimoAnuncio = texto;
        status.textContent = texto;
      }
    }, 600);
  };
  // Trocar o conteúdo tira o campo do foco: o foco e a posição do cursor voltam para o mesmo campo.
  const guardarFoco = () => {
    const a = document.activeElement;
    return a && a.tagName === 'INPUT' && a.id ? { id: a.id, ini: a.selectionStart, fim: a.selectionEnd } : null;
  };
  const restaurarFoco = (f) => {
    const el = f ? document.getElementById(f.id) : null;
    if (!el) return;
    el.focus();
    try {
      el.setSelectionRange(f.ini, f.fim);
    } catch {
      // campo sem seleção: nada a restaurar
    }
  };

  let ultimoTexto = null;
  let ganchosDoResultado = [];
  ctx.trocando = false;
  ctx.atualizar = () => {
    if (ctx.trocando) return;
    def.calcular();
    for (const g of ctx.ganchos) g();
    // Os campos que moram no resultado (como "E se parcelar a fatura?") registram os próprios ganchos à parte.
    const doFormulario = ctx.ganchos;
    ctx.ganchos = [];
    const novo = h('div', {}, def.resultado());
    const doResultado = ctx.ganchos;
    ctx.ganchos = doFormulario;
    for (const g of doResultado) g();
    // O resultado só é refeito quando o texto muda: nada pisca nem se repete a cada tecla.
    if (novo.textContent !== ultimoTexto) {
      const foco = guardarFoco();
      ctx.trocando = true;
      ultimoTexto = novo.textContent;
      resultados.replaceChildren(...novo.childNodes);
      ganchosDoResultado = doResultado;
      ctx.trocando = false;
      restaurarFoco(foco);
      anunciar();
    } else for (const g of ganchosDoResultado) g();
  };
  ctx.reconstruir = (focoEm) => {
    const foco = guardarFoco();
    ctx.ganchos = [];
    def.calcular();
    ctx.trocando = true;
    formulario.replaceChildren(...def.formulario());
    ctx.trocando = false;
    ultimoTexto = null;
    ctx.atualizar();
    if (focoEm) {
      const [nome, valor] = focoEm.split(':');
      formulario.querySelector(`input[name="${nome}"][value="${valor}"]`)?.focus();
    } else restaurarFoco(foco);
  };
  ctx.reconstruir();
  raiz.setAttribute('data-pronta', 'sim');
}

const raiz = document.querySelector('[data-calculadora]');
if (raiz) iniciar(raiz);
