/* Busca da Ajuda: roda só neste navegador. Lê ajuda/indice.json (gerado pelo site) e não envia nada a ninguém. */
(function () {
  'use strict';
  var caixa = document.querySelector('[data-busca]');
  if (!caixa || !window.fetch) return;
  var campo = caixa.querySelector('input');
  var estado = caixa.querySelector('.busca-estado');
  var lista = caixa.querySelector('.resultados');
  var escondidos = document.querySelectorAll('[data-some-na-busca]');
  var indice = null;

  function norma(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  function mostrarLista(buscando) {
    for (var i = 0; i < escondidos.length; i++) escondidos[i].hidden = buscando;
  }
  function buscar() {
    var consulta = norma(campo.value).trim();
    lista.textContent = '';
    if (!consulta) {
      estado.textContent = '';
      mostrarLista(false);
      return;
    }
    var termos = consulta.split(/\s+/);
    var achados = [];
    for (var i = 0; i < indice.length; i++) {
      var item = indice[i];
      var titulo = norma(item.t);
      var resto = norma(item.k + ' ' + item.x);
      var pontos = 0;
      var todos = true;
      for (var j = 0; j < termos.length; j++) {
        if (titulo.indexOf(termos[j]) >= 0) pontos += 3;
        else if (resto.indexOf(termos[j]) >= 0) pontos += 1;
        else { todos = false; break; }
      }
      if (todos) achados.push({ item: item, pontos: pontos });
    }
    achados.sort(function (a, b) { return b.pontos - a.pontos; });
    achados = achados.slice(0, 20);
    mostrarLista(true);
    estado.textContent = achados.length === 0 ? 'Nenhuma resposta para "' + campo.value.trim() + '". Tente outra palavra.' : (achados.length === 1 ? '1 resposta' : achados.length + ' respostas') + ' para "' + campo.value.trim() + '".';
    for (var k = 0; k < achados.length; k++) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = achados[k].item.u;
      a.textContent = achados[k].item.t;
      var tema = document.createElement('small');
      tema.textContent = achados[k].item.a;
      a.appendChild(tema);
      li.appendChild(a);
      lista.appendChild(li);
    }
  }
  fetch(caixa.getAttribute('data-indice'))
    .then(function (r) { if (!r.ok) throw new Error('índice'); return r.json(); })
    .then(function (dados) {
      indice = dados;
      caixa.hidden = false;
      campo.addEventListener('input', buscar);
    })
    .catch(function () { /* sem índice, a lista completa continua na página */ });
})();
