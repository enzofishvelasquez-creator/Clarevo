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

/** O app web, no endereço oficial desde 27/10/2026 (D-070); `clarevo.pages.dev` continua respondendo. Troque aqui e em `docs/07`. */
const URL_APP = 'https://app.clarevo.app.br';
const HOST_APP = 'app.clarevo.app.br';
/** A demonstração do app (dados fictícios, nada é gravado fora do aparelho): o destino de "Ver a demonstração" na página Comece aqui. */
const URL_DEMO = 'https://demo.clarevo.app.br';
const HOST_DEMO = 'demo.clarevo.app.br';
/** A tela de criar conta do app web (`apps/app/src/app/criar-conta.tsx`): o destino de "Testar 14 dias grátis" depois do lançamento. */
const URL_CRIAR_CONTA = `${URL_APP}/criar-conta`;
/**
 * A tela de entrar do app web (`apps/app/src/app/entrar.tsx`): o destino de "Entrar (quem testa)" antes do lançamento. A tela inicial do app
 * web começa com "14 dias grátis, sem cartão" e "Criar conta", e o cadastro de pessoas reais só abre no lançamento (D-064): antes dele, o
 * site nunca leva à tela inicial do app, só à de entrar, para quem já testa.
 */
const URL_ENTRAR = `${URL_APP}/entrar`;

/**
 * O estado do produto (D-125, 25/11/2026): UM interruptor para todas as páginas contarem a mesma história (`scripts/site/estado.js`,
 * `docs/22_SITE.md`, seção 19).
 *   - `lancado: false` (o padrão, pré-lançamento): as páginas dizem que a Clarevo está em fase de testes e que o acesso para pessoas e
 *     famílias abre no lançamento; os planos aparecem como os preços do lançamento, sem oferta nos dados estruturados; as chamadas levam à
 *     demonstração e a "Como ter acesso" (Comece aqui), sem convidar a criar conta (D-064 e `docs/44`, seção 2: o acesso de pessoas reais
 *     abre por decisão do Enzo); o botão do menu é "Entrar (quem testa)" e leva à tela de entrar do app web (`URL_ENTRAR`).
 *   - `lancado: true`: some todo texto de fase de testes; a chamada principal vira "Testar 14 dias grátis" (a tela de criar conta do app
 *     web) e os selos das lojas aparecem, cada um só com o endereço dele preenchido em `lojas`. O gerador RECUSA `lancado: true` enquanto
 *     a assinatura pelo app estiver fechada (`SUBSCRIBE_OPEN` em `packages/core/src/plano.ts`): primeiro abre a assinatura, depois o site.
 * A frase "A assinatura pelo app abre no lançamento" não é um segundo interruptor: segue o mesmo `SUBSCRIBE_OPEN`, e como o lançamento
 * exige a assinatura aberta, ela nunca aparece no site lançado.
 * `lojas`: os endereços das páginas do app (só `https://apps.apple.com/...` e `https://play.google.com/...`), vazios até a publicação.
 * `prazoDeResposta`: o prazo de resposta do atendimento que a equipe consegue cumprir sempre (por exemplo, "até 1 dia útil, de segunda a
 * sexta"). Vazio, nenhuma página promete prazo; preenchido, entra em Sobre e em Suporte. Decisão do Enzo (pergunta do estudo de 25/11).
 * Para testar outro estado sem mudar este arquivo: `node scripts/gerar-site.js --estado <arquivo.json>` (as chaves do JSON trocam as daqui).
 * Só o JSON do `--estado` (os testes) aceita também `simularAssinaturaAberta: true`, para ver o site lançado antes de a assinatura abrir;
 * a geração avisa e o `--final` recusa. Aqui ela não é aceita: a assinatura aberta vem só do núcleo.
 */
const ESTADO_DO_PRODUTO = {
  lancado: false,
  lojas: { appStore: '', googlePlay: '' },
  prazoDeResposta: 'até 1 dia útil, de segunda a sexta',
};
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
const HOSTS_BASE = [HOST_APP, HOST_DEMO, 'www.gov.br', 'www.planalto.gov.br', 'apps.apple.com', 'play.google.com'];

/** As páginas que vêm de `docs/legal/`, na ordem do rodapé. */
const PAGINAS_LEGAIS = [
  { arquivo: 'privacidade.html', md: 'politica-de-privacidade.md', titulo: 'Política de privacidade', rotulo: 'Privacidade', descricao: 'Como a Clarevo trata os dados pessoais de quem usa o app.' },
  { arquivo: 'termos.html', md: 'termos-de-uso.md', titulo: 'Termos de uso', rotulo: 'Termos', descricao: 'As regras para usar o app e o serviço da Clarevo, de organização de finanças pessoais e da família.' },
  { arquivo: 'excluir-conta.html', md: 'exclusao-de-conta.md', titulo: 'Excluir conta e dados', rotulo: 'Excluir conta', descricao: 'Como pedir a exclusão da sua conta e dos seus dados da Clarevo.' },
  // A16 (aprovada em 04/11/2026): as versões anteriores ficam publicadas, em vez de "mediante pedido".
  { arquivo: 'versoes.html', md: 'versoes.md', titulo: 'Versões dos termos e da política', rotulo: 'Versões dos textos', descricao: 'As versões dos Termos de uso e da Política de privacidade da Clarevo, com a data de cada uma.' },
];
/** Links entre os textos jurídicos: o Markdown aponta para o arquivo, o site para a página. */
const MAPA_LINKS_SITE = Object.fromEntries(PAGINAS_LEGAIS.map((p) => [p.md, p.arquivo]));
/** O pacote do advogado, na ordem pedida. */
const DOCUMENTOS_DO_PACOTE = ['resumo-para-advogado.md', 'pendencias-do-lancamento.md', 'politica-de-privacidade.md', 'termos-de-uso.md', 'exclusao-de-conta.md', 'regra-de-acesso-a-dados.md', 'empresas-pontos-do-contrato.md', 'contrato-empresas-minuta.md', 'plano-de-trabalho-piloto.md'];

/**
 * O menu principal (cabeçalho). `pasta` marca a seção quando a página é uma das filhas dela. Desde 25/11/2026 (D-125): "Planos" e "Para MEI"
 * no menu (as três portas: pessoas e famílias, quem trabalha por conta e MEI, empresas); "Início" saiu (o logotipo leva ao início) e
 * "Novidades" ficou no rodapé, para o menu caber numa linha a partir de 70 rem.
 */
const MENU = [
  { arquivo: 'app/index.html', rotulo: 'O app', pasta: 'app' },
  { arquivo: 'planos.html', rotulo: 'Planos', pasta: 'planos' },
  { arquivo: 'mei.html', rotulo: 'Para MEI', pasta: null },
  { arquivo: 'empresas/index.html', rotulo: 'Para empresas', pasta: 'empresas' },
  { arquivo: 'aprender/index.html', rotulo: 'Aprender', pasta: 'aprender' },
  { arquivo: 'calculadoras/index.html', rotulo: 'Calculadoras', pasta: 'calculadoras' },
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
      { arquivo: 'planos.html', rotulo: 'Planos' },
      { arquivo: 'mei.html', rotulo: 'Por conta e MEI' },
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
      // Indicadores oficiais e glossário (D-106) e as notícias de fontes públicas (D-117), que mostram "Em breve" até a variável
      // NOTICIAS=ligado no painel da Cloudflare; os resumos semanais, quando houver, ficam na mesma página.
      { arquivo: 'indicadores/index.html', rotulo: 'Indicadores' },
      { arquivo: 'indicadores/glossario.html', rotulo: 'Glossário' },
      { arquivo: 'noticias/index.html', rotulo: 'Notícias' },
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
      { arquivo: 'licencas.html', rotulo: 'Licenças de código aberto' },
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
  URL_CRIAR_CONTA,
  URL_ENTRAR,
  ESTADO_DO_PRODUTO,
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
