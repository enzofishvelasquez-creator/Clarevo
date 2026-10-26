'use strict';
/**
 * Constantes do gerador do site (D-064 e D-065). Um só lugar para caminhos, marcadores, menu e páginas legais.
 */
const path = require('node:path');

const RAIZ = path.join(__dirname, '..', '..');
const SITE = path.join(RAIZ, 'site');
/** Conteúdo próprio do site: novidades, perguntas da Ajuda, páginas de texto e imagens geradas (Open Graph). */
const SITE_SRC = path.join(RAIZ, 'site-src');
const LEGAL = path.join(RAIZ, 'docs', 'legal');
const MARCA = path.join(RAIZ, 'docs', 'marca');
const FONTES = path.join(RAIZ, 'apps', 'app', 'assets', 'fonts');
const CAPTURAS_LOJAS = path.join(RAIZ, 'docs', 'lojas', 'capturas');
const TELAS = path.join(RAIZ, 'docs', 'telas');

/** O app web de hoje. Com o domínio (P-006) o app iria para `app.` do domínio (a confirmar): troque aqui e em `docs/07`. */
const URL_APP = 'https://clarevo.pages.dev';
const HOST_APP = 'clarevo.pages.dev';
/** A demonstração do app (dados fictícios, nada é gravado fora do aparelho): o destino de "Ver a demonstração" na página Comece aqui. */
const URL_DEMO = 'https://clarevo-demo.pages.dev';
const HOST_DEMO = 'clarevo-demo.pages.dev';
/** A página oficial da NR-1 no site do Ministério do Trabalho e Emprego (D-068): a fonte do bloco "Bem-estar financeiro e a NR-1", em Para empresas. Endereço achado na busca de 25/10/2026 (título "Norma Regulamentadora No. 1 (NR-1)"). */
const URL_NR1 = 'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-1';
/** Fontes do site: o corpo (500), o negrito (700) e os títulos (800). Subconjuntos Latin do app, com a licença OFL. */
const PESOS_FONTE = ['500Medium', '700Bold', '800ExtraBold'];

const MARCADORES = ['RAZÃO SOCIAL', 'CNPJ', 'ENDEREÇO', 'E-MAIL DE PRIVACIDADE', 'E-MAIL DE SUPORTE', 'E-MAIL DE CONTATO', 'DOMÍNIO', 'DATA DE VIGÊNCIA'];
const MARCADORES_EMAIL = new Set(['E-MAIL DE PRIVACIDADE', 'E-MAIL DE SUPORTE', 'E-MAIL DE CONTATO']);
/**
 * Links de texto, sem carregar nada, que as páginas podem ter além dos das fontes do catálogo de Aprender: o app web e páginas oficiais
 * que os textos jurídicos citam. Os endereços das fontes do catálogo entram em `hostsDeFontes` (catalogo.js).
 */
const HOSTS_BASE = [HOST_APP, HOST_DEMO, 'www.gov.br', 'www.planalto.gov.br'];

/** As páginas que vêm de `docs/legal/`, na ordem do rodapé. */
const PAGINAS_LEGAIS = [
  { arquivo: 'privacidade.html', md: 'politica-de-privacidade.md', titulo: 'Política de privacidade', rotulo: 'Privacidade', descricao: 'Como a Clarevo trata os dados pessoais de quem usa o app.' },
  { arquivo: 'termos.html', md: 'termos-de-uso.md', titulo: 'Termos de uso', rotulo: 'Termos', descricao: 'As regras para usar o app e o serviço da Clarevo, de organização de finanças pessoais e da família.' },
  { arquivo: 'excluir-conta.html', md: 'exclusao-de-conta.md', titulo: 'Excluir conta e dados', rotulo: 'Excluir conta', descricao: 'Como pedir a exclusão da sua conta e dos seus dados da Clarevo.' },
];
/** Links entre os textos jurídicos: o Markdown aponta para o arquivo, o site para a página. */
const MAPA_LINKS_SITE = Object.fromEntries(PAGINAS_LEGAIS.map((p) => [p.md, p.arquivo]));
/** O pacote do advogado, na ordem pedida. */
const DOCUMENTOS_DO_PACOTE = ['resumo-para-advogado.md', 'politica-de-privacidade.md', 'termos-de-uso.md', 'exclusao-de-conta.md', 'empresas-pontos-do-contrato.md', 'contrato-empresas-minuta.md', 'plano-de-trabalho-piloto.md'];

/** O menu principal (cabeçalho). `pasta` marca a seção quando a página é uma das filhas dela. */
const MENU = [
  { arquivo: 'index.html', rotulo: 'Início', pasta: null },
  { arquivo: 'app/index.html', rotulo: 'O app', pasta: 'app' },
  { arquivo: 'empresas/index.html', rotulo: 'Para empresas', pasta: 'empresas' },
  { arquivo: 'aprender/index.html', rotulo: 'Aprender', pasta: 'aprender' },
  { arquivo: 'calculadoras/index.html', rotulo: 'Calculadoras', pasta: 'calculadoras' },
  { arquivo: 'novidades/index.html', rotulo: 'Novidades', pasta: 'novidades' },
  { arquivo: 'ajuda/index.html', rotulo: 'Ajuda', pasta: 'ajuda' },
  { arquivo: 'seguranca.html', rotulo: 'Segurança', pasta: null },
];
/** O rodapé: todas as seções, as páginas legais e o contato. */
const RODAPE_COLUNAS = [
  {
    titulo: 'Clarevo',
    links: [
      { arquivo: 'index.html', rotulo: 'Início' },
      { arquivo: 'comece.html', rotulo: 'Comece aqui' },
      { arquivo: 'app/index.html', rotulo: 'O app' },
      { arquivo: 'empresas/index.html', rotulo: 'Para empresas' },
      { arquivo: 'sobre.html', rotulo: 'Sobre' },
      { arquivo: 'imprensa.html', rotulo: 'Imprensa' },
    ],
  },
  {
    titulo: 'Aprender e ajuda',
    links: [
      { arquivo: 'aprender/index.html', rotulo: 'Aprender' },
      { arquivo: 'aprender/agenda.html', rotulo: 'Agenda financeira' },
      { arquivo: 'calculadoras/index.html', rotulo: 'Calculadoras' },
      { arquivo: 'novidades/index.html', rotulo: 'Novidades' },
      { arquivo: 'ajuda/index.html', rotulo: 'Ajuda' },
      { arquivo: 'suporte.html', rotulo: 'Suporte' },
    ],
  },
  {
    titulo: 'Confiança e regras',
    links: [
      { arquivo: 'seguranca.html', rotulo: 'Segurança e privacidade' },
      ...PAGINAS_LEGAIS.map((p) => ({ arquivo: p.arquivo, rotulo: p.rotulo })),
      { arquivo: 'novidades/como-escrevemos.html', rotulo: 'Como escrevemos' },
    ],
  },
];
const RODAPE_LEGAL = '[RAZÃO SOCIAL] · CNPJ [CNPJ]';

/** Autoria dos posts. */
const AUTORIA_PADRAO = 'Equipe Clarevo';
/** Data dos três posts iniciais e de referência da agenda: 23/10/2026. */
const DATA_DO_CICLO = '2026-10-23';

module.exports = {
  RAIZ,
  SITE,
  SITE_SRC,
  LEGAL,
  MARCA,
  FONTES,
  CAPTURAS_LOJAS,
  TELAS,
  URL_APP,
  HOST_APP,
  URL_DEMO,
  HOST_DEMO,
  URL_NR1,
  PESOS_FONTE,
  MARCADORES,
  MARCADORES_EMAIL,
  HOSTS_BASE,
  PAGINAS_LEGAIS,
  MAPA_LINKS_SITE,
  DOCUMENTOS_DO_PACOTE,
  MENU,
  RODAPE_COLUNAS,
  RODAPE_LEGAL,
  AUTORIA_PADRAO,
  DATA_DO_CICLO,
};
