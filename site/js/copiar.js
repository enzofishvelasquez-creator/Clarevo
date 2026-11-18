/*
 * "Copiar o endereço" (D-115, docs/22_SITE.md, seção 17): na página do feed RSS das Novidades, copia o endereço do campo só de leitura
 * para a área de transferência. O botão começa escondido e só aparece com este script, então, sem JavaScript, fica o campo para selecionar
 * e copiar. Este script não envia nada, não grava nada no navegador e não lê cookie.
 */
(function () {
  'use strict';
  var botoes = document.querySelectorAll('button[data-copiar]');
  Array.prototype.forEach.call(botoes, function (botao) {
    var campo = document.getElementById(botao.getAttribute('data-copiar'));
    var estado = document.getElementById(botao.getAttribute('data-estado'));
    if (!campo) return;
    function avisar(texto) {
      if (estado) estado.textContent = texto;
    }
    function copiarSelecionando() {
      campo.focus();
      campo.select();
      var ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (e) {
        ok = false;
      }
      avisar(ok ? 'Endereço copiado.' : 'Não foi possível copiar. O endereço está selecionado: copie com o teclado ou com o menu do aparelho.');
    }
    botao.addEventListener('click', function () {
      avisar('');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(campo.value).then(function () {
          avisar('Endereço copiado.');
        }, copiarSelecionando);
      } else copiarSelecionando();
    });
    // Tocar no campo seleciona o endereço inteiro, para copiar à mão.
    campo.addEventListener('focus', function () {
      campo.select();
    });
    botao.hidden = false;
  });
})();
