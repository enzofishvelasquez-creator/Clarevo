/*
 * Tema do site (D-115, docs/22_SITE.md, seção 17): "Igual ao aparelho" (o padrão), "Claro" ou "Escuro", escolhido no rodapé de todas
 * as páginas. Este script é carregado no <head>, antes do estilo, e marca o <html> com data-tema="aparelho|claro|escuro" antes de a
 * página aparecer, para ela nunca piscar no tema errado. O estilo usa o tema escuro com prefers-color-scheme quando o <html> não está
 * marcado como claro, e sempre que está marcado como escuro.
 *
 * Guarda só a escolha, "claro" ou "escuro", no armazenamento do navegador, numa chave só (clarevo.site.tema.v1); "Igual ao aparelho" é
 * não guardar nada. A escolha nunca sai do aparelho e serve só para mostrar o tema escolhido. Sem armazenamento (janela anônima, site
 * bloqueado) ou sem JavaScript, o site segue o tema do aparelho e o controle não aparece. Não envia nada nem lê cookie.
 */
(function () {
  'use strict';
  var CHAVE = 'clarevo.site.tema.v1';
  var ESCURO_DO_APARELHO = '(prefers-color-scheme: dark)';
  var raiz = document.documentElement;

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

  function aplicar(v) {
    raiz.setAttribute('data-tema', v);
    ajustarTelas(v);
  }

  aplicar(lerEscolha());

  document.addEventListener('DOMContentLoaded', function () {
    ajustarTelas(raiz.getAttribute('data-tema'));
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
