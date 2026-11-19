/*
 * Tema do site (D-115, docs/22_SITE.md, seção 17): "Igual ao aparelho" (o padrão), "Claro" ou "Escuro", escolhido no rodapé de todas
 * as páginas. Este script é carregado no <head>, antes do estilo, e marca o <html> com data-tema="aparelho|claro|escuro" antes de a
 * página aparecer, para ela nunca piscar no tema errado. O estilo usa o tema escuro com prefers-color-scheme quando o <html> não está
 * marcado como claro, e sempre que está marcado como escuro.
 *
 * Guarda só a escolha, "claro" ou "escuro", no armazenamento do navegador, numa chave só (clarevo.site.tema.v1); "Igual ao aparelho" é
 * não guardar nada. A escolha nunca sai do aparelho e serve só para mostrar o tema escolhido. Sem armazenamento (janela anônima, site
 * bloqueado) ou sem JavaScript, o site segue o tema do aparelho e o controle não aparece (a escolha não passaria para a página seguinte).
 * Para saber se dá para guardar, o script grava e apaga a própria chave uma vez. Não envia nada nem lê cookie.
 */
(function () {
  'use strict';
  var CHAVE = 'clarevo.site.tema.v1';
  var ESCURO_DO_APARELHO = '(prefers-color-scheme: dark)';
  var raiz = document.documentElement;

  /** Dá para guardar? Grava a própria chave (com o valor que já tinha) e, se não havia nada, apaga de novo. */
  function podeGuardar() {
    try {
      var antes = window.localStorage.getItem(CHAVE);
      window.localStorage.setItem(CHAVE, antes || 'aparelho');
      if (!antes) window.localStorage.removeItem(CHAVE);
      return true;
    } catch (e) {
      return false;
    }
  }

  function lerEscolha() {
    try {
      var v = window.localStorage.getItem(CHAVE);
      return v === 'claro' || v === 'escuro' ? v : 'aparelho';
    } catch (e) {
      return 'aparelho';
    }
  }

  function guardarEscolha(v) {
    try {
      if (v === 'aparelho') window.localStorage.removeItem(CHAVE);
      else window.localStorage.setItem(CHAVE, v);
    } catch (e) {
      // Sem armazenamento: a escolha vale só até sair da página.
    }
  }

  // As telas das matérias têm a versão escura num <source media="(prefers-color-scheme: dark)">: com o tema escolhido, a versão segue a
  // escolha, e não o aparelho.
  function ajustarTelas(v) {
    var fontes = document.querySelectorAll('picture > source[media]');
    for (var i = 0; i < fontes.length; i++) {
      var f = fontes[i];
      if (!f.hasAttribute('data-media-do-aparelho')) {
        if (f.getAttribute('media') !== ESCURO_DO_APARELHO) continue;
        f.setAttribute('data-media-do-aparelho', ESCURO_DO_APARELHO);
      }
      f.setAttribute('media', v === 'escuro' ? 'all' : v === 'claro' ? 'not all' : ESCURO_DO_APARELHO);
    }
  }

  // O <meta name="color-scheme"> também segue a escolha: o navegador pinta o fundo da página antes do estilo no tema certo.
  function ajustarMeta(v) {
    var meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) meta.setAttribute('content', v === 'escuro' ? 'dark' : v === 'claro' ? 'light' : 'light dark');
  }

  function aplicar(v) {
    raiz.setAttribute('data-tema', v);
    ajustarMeta(v);
    ajustarTelas(v);
  }

  var guardavel = podeGuardar();
  aplicar(lerEscolha());

  // Com um tema escolhido diferente do aparelho, as telas das matérias são ajustadas assim que o navegador lê cada <source>, antes de a
  // imagem ser escolhida, para não baixar a versão do outro tema primeiro.
  var observador = null;
  if (raiz.getAttribute('data-tema') !== 'aparelho' && 'MutationObserver' in window) {
    observador = new MutationObserver(function () {
      ajustarTelas(raiz.getAttribute('data-tema'));
    });
    observador.observe(document.documentElement, { childList: true, subtree: true });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (observador) observador.disconnect();
    ajustarTelas(raiz.getAttribute('data-tema'));
    // Sem armazenamento, o controle fica escondido: a escolha não valeria na página seguinte.
    if (!guardavel) return;
    var grupos = document.querySelectorAll('[data-tema-site]');
    Array.prototype.forEach.call(grupos, function (grupo) {
      var opcoes = grupo.querySelectorAll('input[name="tema-site"]');
      Array.prototype.forEach.call(opcoes, function (o) {
        o.checked = o.value === raiz.getAttribute('data-tema');
        o.addEventListener('change', function () {
          if (!o.checked) return;
          guardarEscolha(o.value);
          aplicar(o.value);
        });
      });
      grupo.hidden = false;
    });
  });
})();
