// Notícias de fontes públicas da Clarevo (D-117). A página já vem com o aviso para quem está sem JavaScript e os links para as fontes.
// Este script pergunta UMA vez, ao abrir a página, ao próprio site (/api/noticias, ou /api/noticias/materia na página de leitura; quem lê
// os feeds das fontes é o worker do site) e mostra a lista ou a matéria. Com as rotas desligadas (404 "desligado"), mostra "Em breve";
// com falha, a frase de falha e os links para as fontes. Não fala com nenhum outro site, não grava nada (nem cookie nem armazenamento do
// navegador), não carrega imagem e só lê do endereço o parâmetro `id` da página de leitura. O texto da matéria vem filtrado do servidor e
// é filtrado de novo aqui: só parágrafos, quebras, links http e https, negrito, itálico, listas, citações e títulos.
(function () {
  'use strict';
  var lista = document.querySelector('[data-noticias]');
  var materia = document.querySelector('[data-materia]');
  var raiz = lista || materia;
  if (!raiz || !window.fetch) return;
  var ID = /^[0-9a-f]{16}$/;

  function mostrar(nome) {
    var avisos = raiz.querySelectorAll('[data-estado]');
    for (var i = 0; i < avisos.length; i++) avisos[i].hidden = avisos[i].getAttribute('data-estado') !== nome;
    var fontes = raiz.querySelector('[data-fontes-para-ler]');
    if (fontes) fontes.hidden = nome === null || nome === 'carregando';
  }

  function linkSeguro(href) {
    try {
      var u = new URL(String(href), window.location.href);
      return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
    } catch (e) {
      return null;
    }
  }

  function elemento(tag, classe, texto) {
    var el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto !== undefined && texto !== null) el.textContent = texto;
    return el;
  }

  function soLeitor(texto) {
    return elemento('span', 'so-leitor', texto);
  }

  function linkDeFora(href, texto) {
    var a = elemento('a', null, texto);
    a.href = href;
    a.rel = 'noopener noreferrer';
    return a;
  }

  /** A data e a fonte, com a fonte em negrito: "19/11/2026 · Agência Brasil". */
  function dataEFonte(p, n) {
    var quando = elemento('time', null, n.dataTexto);
    if (typeof n.data === 'string') quando.setAttribute('datetime', n.data);
    p.appendChild(quando);
    p.appendChild(document.createTextNode(' · '));
    p.appendChild(elemento('strong', null, n.fonte));
    return p;
  }

  function pedir(caminho) {
    return window.fetch(caminho, { headers: { Accept: 'application/json' }, credentials: 'omit' }).then(function (r) {
      return r.json().then(
        function (d) {
          return { status: r.status, dados: d };
        },
        function () {
          return { status: r.status, dados: null };
        },
      );
    });
  }

  var desligado = function (res) {
    return res.status === 404 && res.dados && res.dados.erro === 'desligado';
  };

  // ------------------------------------------------------------------------------------------------------------------------------
  // A lista

  function valida(n) {
    return n && typeof n === 'object' && ID.test(n.id) && typeof n.titulo === 'string' && typeof n.dataTexto === 'string' && typeof n.fonte === 'string' && linkSeguro(n.link) !== null;
  }

  function itemDaLista(n) {
    var li = elemento('li', 'noticia-item');
    li.appendChild(dataEFonte(elemento('p', 'noticia-meta'), n));
    li.appendChild(elemento('h3', 'noticia-titulo', n.titulo));
    if (typeof n.resumo === 'string' && n.resumo !== '') li.appendChild(elemento('p', 'noticia-resumo', n.resumo));
    var acao = elemento('p', 'noticia-acao');
    var a;
    if (n.textoCompleto === true) {
      a = elemento('a', null, lista.getAttribute('data-ler-aqui'));
      a.href = lista.getAttribute('data-endereco-materia') + '?id=' + n.id;
      a.appendChild(soLeitor(': ' + n.titulo));
    } else {
      a = linkDeFora(linkSeguro(n.link), lista.getAttribute('data-ler-na-fonte'));
      a.appendChild(soLeitor(': ' + n.titulo + ', em ' + n.fonte));
    }
    acao.appendChild(a);
    li.appendChild(acao);
    return li;
  }

  function mostrarLista(res) {
    if (desligado(res)) return mostrar('em-breve');
    var d = res.dados;
    if (res.status !== 200 || !d || !Array.isArray(d.noticias)) return mostrar('falha');
    var itens = d.noticias.filter(valida);
    if (!itens.length) return mostrar('vazia');
    var ol = lista.querySelector('[data-noticias-lista]');
    for (var i = 0; i < itens.length; i++) ol.appendChild(itemDaLista(itens[i]));
    ol.hidden = false;
    var hora = lista.querySelector('[data-noticias-atualizado]');
    if (hora && typeof d.atualizado === 'string') {
      hora.textContent = d.atualizado;
      hora.hidden = false;
    }
    mostrar(null);
  }

  // ------------------------------------------------------------------------------------------------------------------------------
  // A página de leitura

  var PERMITIDOS = { P: 1, BR: 1, A: 1, STRONG: 1, EM: 1, UL: 1, OL: 1, LI: 1, BLOCKQUOTE: 1, H2: 1, H3: 1 };
  var DESCARTADOS = { SCRIPT: 1, STYLE: 1, IMG: 1, PICTURE: 1, SOURCE: 1, VIDEO: 1, AUDIO: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, SVG: 1, MATH: 1, TEMPLATE: 1, NOSCRIPT: 1, FORM: 1, INPUT: 1, BUTTON: 1, SELECT: 1, TEXTAREA: 1, LINK: 1, META: 1, FIGURE: 1 };

  /** Copia só o que é permitido, criando os elementos de novo (nenhum atributo passa, a não ser o href de um link http ou https). */
  function copiar(origem, destino) {
    for (var no = origem.firstChild; no; no = no.nextSibling) {
      if (no.nodeType === 3) destino.appendChild(document.createTextNode(no.nodeValue));
      else if (no.nodeType === 1) {
        var nome = no.nodeName.toUpperCase();
        if (DESCARTADOS[nome]) continue;
        if (!PERMITIDOS[nome]) {
          copiar(no, destino);
          continue;
        }
        if (nome === 'A') {
          var href = linkSeguro(no.getAttribute('href') || '');
          if (!href) {
            copiar(no, destino);
            continue;
          }
          var a = linkDeFora(href, null);
          copiar(no, a);
          destino.appendChild(a);
          continue;
        }
        var el = document.createElement(nome.toLowerCase());
        copiar(no, el);
        destino.appendChild(el);
      }
    }
  }

  function botaoOriginal(lugar, href) {
    var a = linkDeFora(href, materia.getAttribute('data-ver-original'));
    a.className = 'botao botao-principal';
    lugar.textContent = '';
    lugar.appendChild(a);
    lugar.hidden = false;
  }

  function mostrarMateria(res) {
    if (desligado(res)) return mostrar('em-breve');
    if (res.status === 404 || res.status === 400) return mostrar('nao-encontrada');
    var d = res.dados;
    if (res.status !== 200 || !valida(d) || typeof d.html !== 'string' || !window.DOMParser) return mostrar('falha');
    var original = linkSeguro(d.link);
    var titulo = document.querySelector('[data-materia-titulo]');
    if (titulo) titulo.textContent = d.titulo;
    document.title = d.titulo + ' · Clarevo';
    var meta = document.querySelector('[data-materia-meta]');
    if (meta) {
      dataEFonte(meta, d);
      meta.hidden = false;
    }
    var credito = materia.querySelector('[data-materia-credito]');
    if (typeof d.autor === 'string' && d.autor !== '') {
      credito.textContent = d.autor;
      credito.hidden = false;
    }
    var licenca = materia.querySelector('[data-materia-licenca]');
    if (typeof d.licenca === 'string') {
      licenca.textContent = d.licenca;
      licenca.hidden = false;
    }
    botaoOriginal(materia.querySelector('[data-materia-original]'), original);
    botaoOriginal(materia.querySelector('[data-materia-original-fim]'), original);
    var texto = materia.querySelector('[data-materia-texto]');
    var doc = new window.DOMParser().parseFromString(d.html, 'text/html');
    copiar(doc.body, texto);
    texto.hidden = false;
    materia.querySelector('[data-materia-nota]').hidden = false;
    mostrar(null);
  }

  function falhou() {
    mostrar('falha');
  }

  if (lista) {
    mostrar('carregando');
    pedir('/api/noticias').then(mostrarLista).catch(falhou);
  } else {
    var id = null;
    try {
      id = new URLSearchParams(window.location.search).get('id');
    } catch (e) {
      id = null;
    }
    if (!ID.test(id || '')) {
      mostrar('nao-encontrada');
      return;
    }
    mostrar('carregando');
    pedir('/api/noticias/materia?id=' + id).then(mostrarMateria).catch(falhou);
  }
})();
