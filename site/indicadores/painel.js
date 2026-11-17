// Painel de indicadores oficiais da Clarevo (D-106). A página já vem com o retrato feito na geração do site (funciona sem JavaScript e
// quando a consulta falha). Este script pergunta UMA vez, ao abrir a página, ao próprio site (/api/indicadores, no worker do site, que
// consulta o Banco Central e guarda uma cópia) e troca os números e a hora pelos da resposta. Não pergunta de novo, não fala com nenhum
// outro site, não grava nada (nem cookie nem armazenamento do navegador) e não mexe no endereço da página.
(function () {
  'use strict';
  var paineis = document.querySelectorAll('[data-painel]');
  if (!paineis.length || !window.fetch) return;

  function trocar(el, campo, texto) {
    var alvo = el.querySelector('[data-campo="' + campo + '"]');
    if (!alvo) return;
    alvo.textContent = texto || '';
    if (campo === 'extra') alvo.hidden = !texto;
  }

  function aplicar(d) {
    if (!d || typeof d !== 'object' || !d.exibicao || !d.valores || typeof d.consultadoEm !== 'string' || isNaN(Date.parse(d.consultadoEm))) return;
    for (var i = 0; i < paineis.length; i++) {
      var p = paineis[i];
      var antes = p.getAttribute('data-consultado');
      // Um retrato da geração mais novo que a resposta (o que só acontece com uma cópia antiga no servidor) fica.
      if (antes && Date.parse(antes) > Date.parse(d.consultadoEm)) continue;
      var itens = [p].concat(Array.prototype.slice.call(p.querySelectorAll('[data-indicador]')));
      for (var j = 0; j < itens.length; j++) {
        var id = itens[j].getAttribute('data-indicador');
        var ex = id && d.valores[id] ? d.exibicao[id] : null;
        if (!ex) continue;
        trocar(itens[j], 'numero', ex.numero);
        trocar(itens[j], 'unidade', ex.unidade);
        trocar(itens[j], 'data', ex.data);
        trocar(itens[j], 'extra', ex.extra);
      }
      if (typeof d.atualizado === 'string') trocar(p, 'hora', d.atualizado);
      p.setAttribute('data-consultado', d.consultadoEm);
      p.setAttribute('data-atualizado', 'sim');
    }
  }

  window
    .fetch('/api/indicadores', { headers: { Accept: 'application/json' }, credentials: 'omit' })
    .then(function (r) {
      return r.ok ? r.json() : null;
    })
    .then(aplicar)
    .catch(function () {
      // Sem resposta: a página continua com o retrato da geração, que já diz de quando é.
    });
})();
