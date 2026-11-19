/*
 * Vídeos de uso do app no site (D-115, docs/22_SITE.md, seção 17). Cada vídeo fica na moldura de celular do bloco que ele mostra
 * (`celularComVideo` em scripts/site/videos.js) e toca sozinho, sem som e em repetição, só enquanto pelo menos metade dele aparece na
 * tela; ao sair da tela, pausa. Sem botão de pausar (Enzo, 19/11/2026): tocar no próprio vídeo pausa e toca de novo, e pelo teclado o
 * vídeo recebe foco e Enter ou Espaço fazem o mesmo, com o nome para o leitor de tela ("Pausar o vídeo: título" ou "Tocar o vídeo:
 * título"). Com movimento reduzido (prefers-reduced-motion) ou economia de dados (navigator.connection.saveData), nada toca sozinho:
 * fica a capa, e tocar no vídeo o toca a pedido. Sem JavaScript, fica a capa e nada quebra.
 * Este script não envia nada, não grava nada no navegador e não lê cookie.
 */
(function () {
  'use strict';
  var figuras = document.querySelectorAll('figure[data-video]');
  if (!figuras.length) return;
  var movimentoReduzido = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var conexao = navigator.connection;

  /** Pode tocar sem pedido: sem movimento reduzido e sem economia de dados. */
  function podeTocarSozinho() {
    return !(movimentoReduzido && movimentoReduzido.matches) && !(conexao && conexao.saveData);
  }

  var estados = [];

  function rotular(e) {
    var tocando = !e.video.paused && !e.video.ended;
    e.video.setAttribute('aria-label', (tocando ? 'Pausar o vídeo: ' : 'Tocar o vídeo: ') + e.titulo);
    e.figura.setAttribute('data-estado', tocando ? 'tocando' : 'parado');
  }

  function tocar(e) {
    var promessa = e.video.play();
    // O navegador pode recusar (modo de economia de bateria, por exemplo): o vídeo fica parado na capa.
    if (promessa && promessa.catch) promessa.catch(function () { rotular(e); });
  }

  /** O que cada vídeo deve fazer agora: tocar se aparece, se ninguém pausou e se pode tocar sozinho ou alguém pediu. */
  function decidir(e) {
    var deveTocar = e.visivel && !e.pausadoPelaPessoa && (e.pedidoPelaPessoa || podeTocarSozinho());
    if (deveTocar && e.video.paused) tocar(e);
    else if (!deveTocar && !e.video.paused) e.video.pause();
  }

  function alternar(e) {
    if (!e.video.paused && !e.video.ended) {
      e.pausadoPelaPessoa = true;
      e.pedidoPelaPessoa = false;
      e.video.pause();
    } else {
      e.pausadoPelaPessoa = false;
      e.pedidoPelaPessoa = true;
      tocar(e);
    }
  }

  Array.prototype.forEach.call(figuras, function (figura) {
    var video = figura.querySelector('video');
    if (!video) return;
    video.muted = true;
    var e = { figura: figura, video: video, titulo: figura.getAttribute('data-titulo') || 'demonstração', visivel: false, pausadoPelaPessoa: false, pedidoPelaPessoa: false };
    // O próprio vídeo é o controle: recebe foco, tem papel de botão e o nome diz o que um toque faz. O nome sem script ("Vídeo: título",
    // por aria-labelledby) dá lugar a esse; a descrição em texto continua ligada por aria-describedby.
    video.setAttribute('tabindex', '0');
    video.setAttribute('role', 'button');
    video.removeAttribute('aria-labelledby');
    video.addEventListener('click', function () { alternar(e); });
    video.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') {
        ev.preventDefault();
        alternar(e);
      }
    });
    video.addEventListener('play', function () { rotular(e); });
    video.addEventListener('pause', function () { rotular(e); });
    rotular(e);
    estados.push(e);
  });

  if (!('IntersectionObserver' in window)) return;
  var observador = new IntersectionObserver(function (entradas) {
    entradas.forEach(function (entrada) {
      for (var i = 0; i < estados.length; i++) {
        if (estados[i].video === entrada.target) {
          estados[i].visivel = entrada.isIntersecting && entrada.intersectionRatio >= 0.5;
          decidir(estados[i]);
        }
      }
    });
  }, { threshold: [0, 0.5, 1] });
  estados.forEach(function (e) { observador.observe(e.video); });

  // Se a pessoa ligar o movimento reduzido com a página aberta, o que tocava sozinho para (e o que ela pediu continua).
  function aoMudarPreferencia() { estados.forEach(decidir); }
  if (movimentoReduzido) {
    if (movimentoReduzido.addEventListener) movimentoReduzido.addEventListener('change', aoMudarPreferencia);
    else if (movimentoReduzido.addListener) movimentoReduzido.addListener(aoMudarPreferencia);
  }
})();
