'use strict';
/**
 * Regras dos dois formulários do site (D-066), num só lugar: o `_worker.js` (que recebe o envio) e as páginas (que desenham o formulário e
 * dizem o tamanho máximo de cada campo) leem daqui, e por isso nunca divergem. O gerador troca o marcador `/*LIMITES*\/` do modelo
 * `site-src/worker/worker.js` por este objeto.
 *
 * Os formulários são "prontos e desligados": só aparecem quando `site/dados-da-empresa.json` tem `"formulario_contato": true` e
 * `"newsletter": true`, e o envio só funciona com as variáveis do painel da Cloudflare (`docs/22_SITE.md`).
 */

/** Tamanhos máximos, em caracteres. A página usa `maxlength` igual, e o worker confere de novo (o navegador não é garantia). */
const TAMANHOS = { nome: 100, email: 254, empresa: 120, mensagem: 2000 };

/** Faixas de "número aproximado de pessoas" que poderiam receber o benefício: valor do formulário e texto mostrado. */
const FAIXAS = [
  { valor: 'ate-50', rotulo: 'Até 50 pessoas' },
  { valor: '51-200', rotulo: 'De 51 a 200 pessoas' },
  { valor: '201-1000', rotulo: 'De 201 a 1.000 pessoas' },
  { valor: 'mais-de-1000', rotulo: 'Mais de 1.000 pessoas' },
  { valor: 'nao-sei', rotulo: 'Ainda não sei' },
];

/** O campo-isca contra robôs: escondido por CSS, fora da ordem do teclado. Quem preenche é robô, e o envio é descartado. */
const ISCA = 'website';

/** Os interruptores do JSON da empresa. Valem só se forem `true` (booleano). */
const INTERRUPTORES = ['formulario_contato', 'newsletter'];

/** O que o worker precisa saber das páginas (o que o gerador injeta no modelo). */
const LIMITES = { tamanhos: TAMANHOS, faixas: Object.fromEntries(FAIXAS.map((f) => [f.valor, f.rotulo])), isca: ISCA };

/** O formulário está ligado? Só o booleano `true` liga. */
const ligado = (valores, nome) => Boolean(valores) && valores[nome] === true;

module.exports = { TAMANHOS, FAIXAS, ISCA, INTERRUPTORES, LIMITES, ligado };
