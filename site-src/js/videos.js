/*
 * Vídeos de uso do app no site (D-115, docs/22_SITE.md, seção 17). Cada vídeo fica na moldura de celular do bloco que ele mostra
 * (`celularComVideo` em scripts/site/videos.js) e toca sozinho, sem som e em repetição, só enquanto pelo menos metade dele aparece na
 * tela; ao sair da tela, pausa. Em cada moldura, um botão redondo pausa e toca o vídeo (WCAG 2.2.2: movimento que começa sozinho precisa
 * de um jeito de parar). Com movimento reduzido (prefers-reduced-motion) ou economia de dados (navigator.connection.saveData), nada toca
 * sozinho: fica a capa, e o mesmo botão toca o vídeo a pedido. Sem JavaScript, fica a capa e nada quebra.
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
    e.botao.setAttribute('aria-label', (tocando ? 'Pausar o vídeo: ' : 'Tocar o vídeo: ') + e.titulo);
    e.botao.setAttribute('data-estado', tocando ? 'tocando' : 'parado');
    e.figura.setAttribute('data-estado', tocando ? 'tocando' : 'parado');
  }

  function tocar(e) {
    var promessa = e.video.play();
    // O navegador pode recusar (modo de economia de bateria, por exemplo): o vídeo fica parado na capa e o botão diz "Tocar".
    if (promessa && promessa.catch) promessa.catch(function () { rotular(e); });
  }

  /** O que cada vídeo deve fazer agora: tocar se aparece, se ninguém pausou e se pode tocar sozinho ou alguém pediu. */
  function decidir(e) {
    var deveTocar = e.visivel && !e.pausadoPelaPessoa && (e.pedidoPelaPessoa || podeTocarSozinho());
    if (deveTocar && e.video.paused) tocar(e);
    else if (!deveTocar && !e.video.paused) e.video.pause();
  }

  Array.prototype.forEach.call(figuras, function (figura) {
    var video = figura.querySelector('video');
    var moldura = figura.querySelector('.celular-moldura');
    if (!video || !moldura) return;
    video.muted = true;
    var botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'video-botao';
    var e = { figura: figura, video: video, botao: botao, titulo: figura.getAttribute('data-titulo') || 'demonstração', visivel: false, pausadoPelaPessoa: false, pedidoPelaPessoa: false };
    botao.addEventListener('click', function () {
      if (!video.paused && !video.ended) {
        e.pausadoPelaPessoa = true;
        e.pedidoPelaPessoa = false;
        video.pause();
      } else {
        e.pausadoPelaPessoa = false;
        e.pedidoPelaPessoa = true;
        tocar(e);
      }
    });
    video.addEventListener('play', function () { rotular(e); });
    video.addEventListener('pause', function () { rotular(e); });
    moldura.appendChild(botao);
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
