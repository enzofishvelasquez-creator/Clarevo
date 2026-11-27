'use strict';
/**
 * Conferências puras do conteúdo do Instagram (D-069): redação, números, estrutura e limites do perfil. Sem navegador e sem arquivo. O
 * gerador recusa gerar se algo falhar, e o teste `packages/core/test/instagram.test.ts` roda a mesma função.
 */
const { LIMITES, contarCaracteres, conferirExemplos, conferirContrastes, conferirRedacao, EXEMPLOS, reais, FRASE_DA_ASSINATURA } = require('./calculos');
const { PERFIL, DESTAQUES, PECAS, CALENDARIO } = require('./conteudo');

const CHAVES_DE_TEXTO_PUBLICO = ['paginas', 'legenda', 'alt', 'altCapa', 'capa', 'roteiro', 'stories', 'respostas'];
const CHAVES_IGNORADAS = new Set(['modelo', 'arquivo', 'captura', 'icone', 'recorte', 'resposta_interna']);

/** Todo texto que pode chegar ao público (arte, legenda, texto alternativo, roteiro), com uma origem para a mensagem de erro. */
function textosPublicos(pecas = PECAS) {
  const saida = [];
  const andar = (valor, origem) => {
    if (typeof valor === 'string') saida.push({ origem, texto: valor });
    else if (Array.isArray(valor)) valor.forEach((v, i) => andar(v, `${origem}[${i}]`));
    else if (valor && typeof valor === 'object') for (const [k, v] of Object.entries(valor)) if (!CHAVES_IGNORADAS.has(k)) andar(v, `${origem}.${k}`);
  };
  for (const p of pecas) for (const k of CHAVES_DE_TEXTO_PUBLICO) if (p[k] !== undefined) andar(p[k], `${p.id}.${k}`);
  PERFIL.bio.forEach((l, i) => saida.push({ origem: `perfil.bio[${i}]`, texto: l }));
  saida.push({ origem: 'perfil.nome', texto: PERFIL.nome });
  for (const d of DESTAQUES) saida.push({ origem: `destaque.${d.id}`, texto: d.nome });
  return saida;
}

/** Todo valor em reais que as artes e as legendas podem citar: os dos exemplos conferidos, em reais inteiros e com centavos. */
function valoresPermitidos(e = EXEMPLOS) {
  const permitidos = new Set(['R$ 0,00', 'R$ 0']);
  const andar = (v) => {
    if (typeof v === 'number' && Number.isInteger(v)) {
      if (v % 100 === 0) permitidos.add(reais(v));
      permitidos.add(reais(v, { centavos: true }));
    } else if (v && typeof v === 'object') Object.values(v).forEach(andar);
  };
  andar(e);
  return permitidos;
}

const REAIS_NO_TEXTO = /R\$\s?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{2})?/g;

function conferirValoresCitados(textos = textosPublicos()) {
  const permitidos = valoresPermitidos();
  const erros = [];
  for (const { origem, texto } of textos) {
    for (const m of texto.matchAll(REAIS_NO_TEXTO)) {
      const valor = m[0].replace(/\s+/g, ' ').replace('R$', 'R$ ').replace(/\s+/g, ' ');
      if (!permitidos.has(valor)) erros.push(`${origem}: ${valor} não é um valor dos exemplos conferidos (calculos.js)`);
    }
  }
  return erros;
}

/** Páginas por carrossel, como o Playbook e o Manual definem. */
const PAGINAS_ESPERADAS = { P01: 6, P03: 5, P04: 5, P07: 5, P10: 6, B01: 5, T01: 5, R01: 5, R02: 6, B: 5, F01: 7, F02: 6 };

function conferirEstrutura(pecas = PECAS, modelos = null) {
  const erros = [];
  const ids = new Set();
  for (const p of pecas) {
    if (ids.has(p.id)) erros.push(`${p.id}: repetida`);
    ids.add(p.id);
    if (p.paginas) {
      if (PAGINAS_ESPERADAS[p.id] && p.paginas.length !== PAGINAS_ESPERADAS[p.id]) erros.push(`${p.id}: ${p.paginas.length} páginas, o Playbook pede ${PAGINAS_ESPERADAS[p.id]}`);
      if (!Array.isArray(p.alt) || p.alt.length !== p.paginas.length) erros.push(`${p.id}: o texto alternativo precisa ter uma linha por página`);
      if (modelos) p.paginas.forEach((pg, i) => !modelos[pg.modelo] && erros.push(`${p.id} página ${i + 1}: modelo "${pg.modelo}" não existe`));
    }
    if (!p.semArte) {
      if (!p.legenda) erros.push(`${p.id}: sem legenda`);
      if (!p.alt) erros.push(`${p.id}: sem texto alternativo`);
    }
    if (!p.objetivo || !p.acao) erros.push(`${p.id}: falta objetivo ou ação principal`);
    if (!p.semArte && (!p.conferencia || p.conferencia.length === 0)) erros.push(`${p.id}: sem a conferência da ficha de afirmações`);
    if (p.formato === 'reel') {
      if (!p.roteiro || p.roteiro.length < 5) erros.push(`${p.id}: roteiro com menos de 5 trechos`);
      if (!p.gravacao) erros.push(`${p.id}: sem gravação`);
      for (let i = 1; i < (p.roteiro || []).length; i++) if (p.roteiro[i].em <= p.roteiro[i - 1].em) erros.push(`${p.id}: tempos do roteiro fora de ordem`);
    }
  }
  const comPrazo = CALENDARIO.map((c) => c.dia);
  for (let d = 1; d <= 30; d++) if (!comPrazo.includes(d)) erros.push(`calendário sem o dia D${d}`);
  return erros;
}

/** Regras específicas do Playbook que valem para uma peça. */
function conferirRegrasDasPecas(pecas = PECAS) {
  const erros = [];
  const t = (p) => textosPublicos([p]).map((x) => x.texto).join('\n');
  const p03 = pecas.find((p) => p.id === 'P03');
  if (p03) {
    // A tela do app que a arte mostra tem datas e valores da demonstração; a regra vale para o texto da peça (páginas e legenda).
    const txt = textosPublicos([{ id: 'P03', paginas: p03.paginas, legenda: p03.legenda }]).map((x) => x.texto).join('\n');
// Antes da abertura (D-130): sem data, lista de espera, cadastro nem preço; "em breve" e "grátis" só na frase do site.
    const semFrase = txt.split(FRASE_DA_ASSINATURA).join(' ');
    for (const re of [/\d{1,2}\/\d{1,2}/, /\b20\d{2}\b/, /\bem breve\b/i, /cadastr/i, /cri(?:e|ar) (?:sua|uma|a) conta/i, /lista de espera/i, /\bgr[áa]tis\b/i, /R\$/]) if (re.test(semFrase)) erros.push(`P03: antes da abertura, a peça não pode ter ${re}`);
    if (!txt.includes(FRASE_DA_ASSINATURA)) erros.push('P03: falta a frase do site "' + FRASE_DA_ASSINATURA + '"');
    if (!/Conheça a Clarevo pelo link da bio\./.test(txt)) erros.push('P03: a ação é "Conheça a Clarevo pelo link da bio."');
  }
  const b01 = pecas.find((p) => p.id === 'B01');
  if (b01) {
    const txt = t(b01);
    if (!/não substitui o gerenciamento de riscos/.test(txt)) erros.push('B01: falta a ressalva da NR-1');
    if (!/avaliação técnica/.test(txt)) erros.push('B01: falta "avaliação técnica"');
    for (const re of [/certificad/i, /conformidade/i, /laudo/i, /\bPGR\b/, /psicolog/i, /mentoria/i, /palestra/i, /absente[ií]smo/i]) if (re.test(txt)) erros.push(`B01: não pode anunciar ${re}`);
  }
  const por = (id) => pecas.find((x) => x.id === id);
  const frase = 'Na sua conta, o primeiro registro começa do zero.';
  const p11 = por('P11');
  if (p11) {
    // A gravação usa a demonstração, que já tem registros: a peça diz que numa conta nova o primeiro registro começa do zero.
    if (!p11.legenda.includes(frase)) erros.push('P11: a legenda precisa dizer "' + frase + '"');
    if (!p11.roteiro.some((x) => x.fala.includes(frase))) erros.push('P11: a narração (roteiro e srt) precisa dizer "' + frase + '"');
    if (!p11.roteiro.some((x) => x.tela.includes(frase))) erros.push('P11: o texto na tela precisa dizer "' + frase + '"');
  }
  // Antes da abertura (D-130): os Reels fecham convidando a conhecer a Clarevo pelo link da bio, sem sugerir usar agora. Em P02, P05 e
  // P08 a frase está no último trecho (narração e texto na tela) e no fim da legenda. Na P11, que só sai depois da abertura, a narração
  // traz a frase e o último trecho é "Na sua conta, o primeiro registro começa do zero.".
  for (const id of ['P02', 'P05', 'P08', 'P11']) {
    const r = por(id);
    if (!r) continue;
    const fim = 'Conheça a Clarevo pelo link da bio';
    if (id === 'P11') {
      if (!r.roteiro.some((x) => x.fala.endsWith(fim + '.'))) erros.push(id + ': a narração diz "' + fim + '."');
      continue;
    }
    const ultimo = r.roteiro[r.roteiro.length - 1];
    if (!ultimo.fala.endsWith(fim + '.') || !ultimo.tela.endsWith(fim)) erros.push(id + ': o último trecho do Reel termina com "' + fim + '" na narração e no texto na tela');
    if (!r.legenda.endsWith(fim + '.')) erros.push(id + ': a legenda termina com "' + fim + '."');
  }
  const p02 = por('P02');
  if (p02) {
    const trecho = p02.roteiro.find((x) => /saldo/.test(x.tela));
    if (!trecho || !/^A diferença do orçamento não é saldo nem autorização para gastar/.test(trecho.tela)) erros.push('P02: a frase "não é saldo nem autorização para gastar" precisa de sujeito no texto na tela');
  }
  const b01Txt = b01 ? t(b01) : '';
  if (b01 && !/A empresa nunca vê as finanças de ninguém, nem somadas\./.test(b01Txt)) erros.push('B01: falta "A empresa nunca vê as finanças de ninguém, nem somadas." (D-056)');
  const t01 = por('T01');
  if (t01) {
    const pg3 = t01.paginas[2];
    if (!pg3 || !/R\$ 50 × 12 = R\$ 600/.test(pg3.numero) || !/Exemplo fictício/.test(pg3.nota || '')) erros.push('T01: a página 3 precisa de "Exemplo fictício" junto de "R$ 50 × 12 = R$ 600"');
  }
  const b = por('B');
  if (b) {
    const ultima = JSON.stringify(b.paginas[4]);
    if (!/Parcelado ou à vista\?/.test(ultima) || /Antes de financiar/.test(JSON.stringify([b.paginas, b.legenda, b.alt]))) erros.push('B: a página 5 cita a calculadora "Parcelado ou à vista?", e não "Antes de financiar"');
  }
  const r01 = por('R01');
  if (r01 && (/necessariamente/i.test(t(r01)) || !/Não é saldo disponível\./.test(t(r01)))) erros.push('R01: a página 4 diz "Não é saldo disponível.", sem "necessariamente"');
  for (const p of pecas) if (p.legenda && /\[[^\]]*\]/.test(p.legenda)) erros.push(p.id + ': a legenda tem um campo entre colchetes; legenda pronta não pode ter marcador a preencher');
  for (const p of pecas) {
    const txt = t(p);
    if (/\bsaldo\b/i.test(txt) && !['P02', 'P03', 'P04', 'R01', 'P11'].includes(p.id)) erros.push(`${p.id}: cita "saldo"; só as peças que explicam que a diferença não é saldo podem`);
    if (/cura|sono|produtividade|tranquilidade/i.test(txt)) erros.push(`${p.id}: promete ou cita cura, sono, produtividade ou tranquilidade`);
    if (/ansiedade|depress/i.test(txt)) erros.push(`${p.id}: cita ansiedade ou depressão`);
    if (/\bjuros\b|\bCET\b/i.test(txt) && !['P07', 'B', 'R01'].includes(p.id)) erros.push(`${p.id}: cita juros ou CET fora das peças de compra parcelada`);
    if (['P07', 'B'].includes(p.id) && /\bjuros\b|\bCET\b/i.test(txt) && !/n[ãa]o (é|corresponde)[^.]*(juros|CET)/i.test(txt)) erros.push(`${p.id}: cita juros ou CET sem dizer que a diferença não é taxa nem CET`);
    if (p.paginas && /R\$/.test(txt) && !/fictíci/i.test(txt)) erros.push(`${p.id}: tem números sem a indicação "exemplo fictício"`);
  }
  return erros;
}

function conferirPerfil() {
  const erros = [];
  const nome = contarCaracteres(PERFIL.nome);
  if (nome > LIMITES.nome) erros.push(`nome de exibição com ${nome} caracteres (limite ${LIMITES.nome})`);
  for (const [chave, linhas] of [['bio', PERFIL.bio]]) {
    const total = contarCaracteres(linhas.join('\n'));
    if (total > LIMITES.bio) erros.push(`${chave} com ${total} caracteres (limite ${LIMITES.bio})`);
    // Margem de segurança: se a quebra de linha valesse 2 caracteres, ainda caberia.
    if (total + (linhas.length - 1) > LIMITES.bio) erros.push(`${chave} não cabe se a quebra de linha valer 2 caracteres`);
  }
  if (DESTAQUES.length !== 6) erros.push('são seis destaques');
  return erros;
}

function validarTudo({ modelos = null } = {}) {
  const textos = textosPublicos();
  const erros = [...conferirExemplos(), ...conferirContrastes(), ...conferirPerfil(), ...conferirEstrutura(PECAS, modelos), ...conferirRegrasDasPecas(), ...conferirValoresCitados(textos)];
  for (const { origem, texto } of textos) erros.push(...conferirRedacao(texto, origem));
  return erros;
}

module.exports = { textosPublicos, valoresPermitidos, conferirValoresCitados, conferirEstrutura, conferirRegrasDasPecas, conferirPerfil, validarTudo, PAGINAS_ESPERADAS };
