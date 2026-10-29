'use strict';
/**
 * Texto e dados das peças do primeiro mês do Instagram (D-069), só dados: nenhum navegador, nenhum arquivo. O gerador
 * (`scripts/gerar-instagram.js`) desenha com isto; o teste `packages/core/test/instagram.test.ts` confere a redação, os limites do perfil e
 * os números.
 *
 * Fontes: Playbook de Redes Sociais v2.2 (24/10/2026) e Manual Operacional v2.2 (os textos das peças), com o ajuste mínimo da ficha de
 * afirmações (`docs/24_REDES_SOCIAIS.md`, seção 1) para o texto bater com o app de hoje. Onde o texto do Playbook mudou, a mudança está
 * registrada em `ajustes` da peça. Marca no feminino ("a Clarevo"), sem travessão, sem nome de pessoa real, sem promessa.
 *
 * Marcação nos títulos: `*palavra*` vira destaque (lima sobre azul, azul sobre fundo claro).
 */
const { R, reais, EXEMPLOS } = require('./calculos');

// ---------------------------------------------------------------------------------------------------------------------------------
// Perfil
// ---------------------------------------------------------------------------------------------------------------------------------
const PERFIL = {
  /** Playbook v2.2: "Clarevo | Bem-estar financeiro" (conferir o identificador e o limite disponível na conta). */
  nome: 'Clarevo | Bem-estar financeiro',
  /** Bio com o acesso em preparação (D-067): a terceira linha troca "Conheça a Clarevo" por "Acompanhe as informações de acesso" (Playbook, P03). */
  bio: ['Cuidar da vida financeira faz parte de cuidar de você.', 'App para organizar seu mês.', 'Acompanhe as informações de acesso ↓'],
  /** A bio do Playbook v2.2 para quando o acesso abrir. */
  bioAcessoAberto: ['Cuidar da vida financeira faz parte de cuidar de você.', 'App para organizar seu mês.', 'Conheça a Clarevo ↓'],
  link: 'clarevo.app.br/comece.html',
  linkCompleto: 'https://clarevo.app.br/comece.html',
  /** O @ só aparece depois de confirmado (Playbook, "Identificação e autoria"). */
  identificador: '@identificador a confirmar',
  categoria: 'Bem-estar financeiro',
};

/** Os seis destaques (Playbook: cinco, e "Para empresas" quando a apresentação e o canal comercial estiverem conferidos). */
const DESTAQUES = [
  { id: 'comece-aqui', nome: 'Comece aqui', icone: 'bandeira', conteudo: 'Orientações de entrada: o que é a Clarevo, como está o acesso e por onde começar (P03 e Stories de apoio).' },
  { id: 'na-pratica', nome: 'Na prática', icone: 'tela', conteudo: 'Tarefas demonstradas na versão atual (P02, P05, P08 e P11).' },
  { id: 'duvidas', nome: 'Dúvidas', icone: 'pergunta', conteudo: 'Respostas às dúvidas externas recorrentes e às caixas de perguntas dos Stories.' },
  { id: 'quem-faz', nome: 'Quem faz', icone: 'pessoas', conteudo: 'Quem está por trás da Clarevo, só com pessoas reais, funções confirmadas e autorização (P06 e P09).' },
  { id: 'ajuda', nome: 'Ajuda', icone: 'boia', conteudo: 'Orientação de acesso e de uso (P12) e o canal de ajuda confirmado. Nunca pedir senha nem dados bancários.' },
  { id: 'para-empresas', nome: 'Para empresas', icone: 'predio', conteudo: 'A proposta para empresas (B01). Só entra com a apresentação e o canal comercial conferidos.', depois: true },
];

// ---------------------------------------------------------------------------------------------------------------------------------
// Cenas de foto real (nunca foto gerada, de banco baixado ou inventada: o quadro só indica a cena)
// ---------------------------------------------------------------------------------------------------------------------------------
const CENAS = {
  p01Capa: 'mãos organizando contas e o celular sobre a mesa da cozinha, luz natural da manhã',
  p01Final: 'uma rotina de casa, de trabalho ou de compras, com pessoas de idades e famílias diversas, de costas ou de lado se preferirem',
  f01Capa: 'objetos da rotina sobre a mesa: celular, caderno, calendário de parede e contas',
  f02Capa: 'mesa de casa com contas e xícaras e duas ou mais pessoas conversando, com autorização de imagem',
};

const PESSOA = '[Gravação com integrante real]';

/**
 * Nomes de tela e de função do app que as artes e as legendas citam (ficha de afirmações, `docs/24`). O teste confere que cada um existe
 * como texto em `apps/app/src` ou `packages/core/src`: se o app mudar o nome, a peça precisa mudar junto.
 */
const TERMOS_DO_APP = [
  'Orçamento por categoria',
  'Definir orçamento',
  'Valor por mês',
  'Orçado',
  'Usado',
  'Faltam',
  'Anotar gasto',
  'Gasto salvo',
  'Pagamentos do mês',
  'Diferença do mês',
  'Ainda a pagar neste mês',
  'Contas a pagar',
  'Seu mês em 30 segundos',
  'Nova meta',
  'Parcelado ou à vista',
  'Aprender',
  'A Clarevo não guarda nem movimenta dinheiro',
];

// ---------------------------------------------------------------------------------------------------------------------------------
// Peças
// ---------------------------------------------------------------------------------------------------------------------------------
const ex = EXEMPLOS;
const rs = (centavos) => reais(centavos);
const rsc = (centavos) => reais(centavos, { centavos: true });

const COM_ACESSO_EM_PREPARACAO = 'Acesso em preparação (D-067): a chamada para cadastro, lista de espera, data e "grátis" ficam de fora.';

/** Gravações reais que cada Reel usa (arquivos de `scripts/gravar-redes.js`, na pasta `--redes`). */
// O recorte (`recorte`, em pixels do quadro da gravação) termina sempre entre dois blocos da tela, nunca no meio de uma linha de texto:
// P02 depois do cartão de Lazer, P05 depois de "Meses anteriores ao escolhido não mudam.", P08 depois do aviso "Meta criada." e P11 depois da linha "Saiu de".
const GRAVACOES = {
  p02: { base: 'p02-orcamento-orcado-e-usado', quadroDaCapa: 'p02-orcamento-orcado-e-usado-conferencia-2.png', recorte: { x: 40, y: 325, w: 1000, h: 950 } },
  p05: { base: 'p05-orcamento-comecar-uma-categoria', quadroDaCapa: 'p05-orcamento-comecar-uma-categoria-conferencia-2.png', recorte: { x: 40, y: 290, w: 1000, h: 960 } },
  p08: { base: 'p08-meta-criar-e-ver-o-progresso', quadroDaCapa: 'p08-meta-criar-e-ver-o-progresso-capa.png', recorte: { x: 40, y: 215, w: 1000, h: 945 } },
  p11: { base: 'p11-primeiro-gasto-anotar', quadroDaCapa: 'p11-primeiro-gasto-anotar-conferencia-3.png', recorte: { x: 40, y: 240, w: 1000, h: 960 } },
};

const PECAS = [
  // =============================================================================================================================
  {
    id: 'P01',
    pasta: 'D05-P01-o-que-e-a-clarevo',
    dia: 5,
    nome: 'O que é a Clarevo',
    formato: 'carrossel',
    fixado: 1,
    objetivo: 'Compreensão do produto: apresentar a Clarevo pelo bem-estar financeiro e explicar o apoio concreto do app.',
    acao: 'Ver o fixado Clarevo na prática (P02).',
    familia: 'Fotográfica cotidiana, editorial e demonstração real',
    paginas: [
      { modelo: 'capaFoto', titulo: 'Cuidar da vida financeira faz parte de cuidar de você.', sub: 'Conheça a Clarevo.', cena: CENAS.p01Capa },
      { modelo: 'contasComprasPlanos', linhas: [['Contas', 'para lembrar,'], ['compras', 'para decidir,'], ['planos', 'para organizar.']], corpo: 'O dinheiro participa da rotina.' },
      { modelo: 'azulTexto', titulo: 'A Clarevo apoia seu *bem-estar financeiro* com um app para organizar a vida financeira pessoal e familiar.' },
      {
        modelo: 'tela',
        titulo: 'Um começo possível: comparar o que você orçou com o que usou no mês, categoria por categoria.',
        captura: { arquivo: 'capturas/orcamento-2-mercado-e-lazer.png', recorte: { x: 40, y: 215, w: 1000, h: 830 } },
        chip: 'Exemplo fictício · demonstração',
      },
      { modelo: 'fotoTexto', cena: CENAS.p01Final, texto: 'Aqui, você encontra situações reais, orientação prática e espaço para rever planos conforme a sua realidade.' },
      { modelo: 'final', titulo: 'Conheça uma tarefa do aplicativo no fixado *Clarevo na prática*.' },
    ],
    legenda:
      'Cuidar da vida financeira faz parte do cuidado com a vida. A Clarevo oferece um aplicativo para organizar o mês e apoiar decisões pessoais e familiares. Aqui, falamos de rotina, escolhas e planos, com orientações práticas e sem julgamento. Conheça uma tarefa no fixado Clarevo na prática.',
    alt: [
      'Capa do carrossel: cena cotidiana (foto real a escolher pela equipe) e o texto "Cuidar da vida financeira faz parte de cuidar de você. Conheça a Clarevo."',
      'Fundo claro com o texto "Contas para lembrar, compras para decidir, planos para organizar. O dinheiro participa da rotina."',
      'Fundo azul com o texto "A Clarevo apoia seu bem-estar financeiro com um app para organizar a vida financeira pessoal e familiar."',
      'Tela da demonstração do app, com dados fictícios, em Orçamento por categoria: Mercado com R$ 1.400,00 usados de R$ 1.800,00, faltam R$ 400,00, e Lazer com R$ 400,00 usados de R$ 300,00, R$ 100,00 acima. Texto: "Um começo possível: comparar o que você orçou com o que usou no mês, categoria por categoria."',
      'Cena cotidiana (foto real a escolher pela equipe) e o texto "Aqui, você encontra situações reais, orientação prática e espaço para rever planos conforme a sua realidade."',
      'Fundo azul com o texto "Conheça uma tarefa do aplicativo no fixado Clarevo na prática."',
    ],
    ajustes: [
      'Página 4: "o que você planejou com o que já registrou" virou "o que você orçou com o que usou no mês, categoria por categoria", que são os nomes da tela (Orçado e Usado) e a regra de competência do app.',
    ],
    depende: [
      'Foto real da capa e da página 5 (própria ou licenciada, com autorização de imagem; nada de rosto gerado nem foto de banco baixada aqui). Trocar o quadro no Canva.',
      'Conferência do produto na versão que for ao ar: Orçamento por categoria mostra Orçado, Usado e Faltam (responsável pelo produto, a designar).',
      'A P02 precisa estar pronta e fixada antes, porque a página 6 manda para ela.',
      'Montar no Canva com camadas editáveis e publicar (registrar URL, horário e janela de leitura).',
    ],
    conferencia: [
      { afirmacao: 'Cuidar da vida financeira faz parte de cuidar de você.', situacao: 'Sem afirmação sobre o app', nota: 'Mensagem central da marca (D-068); não promete resultado nem efeito sobre saúde.' },
      { afirmacao: 'Contas para lembrar, compras para decidir, planos para organizar.', situacao: 'Confirmado como descrição de situação', nota: 'Contas a pagar, calculadoras e simulador, Metas. Os lembretes no aparelho só existem no app de celular, não na web: se disser que o app "lembra", mostrar o celular.' },
      { afirmacao: 'Um app para organizar a vida financeira pessoal e familiar.', situacao: 'Confirmado, com limite', nota: 'Espaços Pessoal e Família (D-055, até 6 pessoas). "Apoia o bem-estar financeiro" é posicionamento: nenhuma tela promete efeito sobre saúde, sono, produtividade ou tranquilidade.' },
      { afirmacao: 'Comparar o que você orçou com o que usou no mês.', situacao: 'Ajustado ao app', nota: 'Orçamento por categoria (D-041) mostra Orçado, Usado e Faltam ou acima; o usado é por competência (compra no cartão conta no mês da compra).' },
      { afirmacao: 'Orientação prática e espaço para rever planos.', situacao: 'Confirmado, com limite', nota: '"Aqui" é o perfil. No app, a orientação prática é Aprender (com fonte e data de revisão) e há orçamento por mês, metas e plano de guardar editáveis.' },
    ],
  },
  // =============================================================================================================================
  {
    id: 'P02',
    pasta: 'D06-P02-reel-clarevo-na-pratica',
    dia: 6,
    nome: 'Clarevo na prática',
    formato: 'reel',
    fixado: 2,
    objetivo: 'Mostrar uma tarefa real: a comparação entre o orçado e o usado, em Orçamento por categoria.',
    acao: 'Ver no perfil as informações de acesso (fixado P03).',
    familia: 'Demonstração real',
    gravacao: 'p02',
    capa: { titulo: 'Clarevo na prática', sub: 'Orçado e usado no mesmo exemplo', chip: 'Exemplo fictício' },
    roteiro: [
      { em: 0, tela: 'Você sabe a diferença entre o que planejou e o que gastou?', fala: 'Você sabe a diferença entre o que planejou e o que gastou?' },
      { em: 4.7, tela: 'No exemplo fictício, Mercado: R$ 1.800,00 por mês', fala: 'Neste exemplo fictício, o orçamento de Mercado é de R$ 1.800,00 por mês.' },
      { em: 9.4, tela: 'Usado: R$ 1.400,00 (77,8%). Faltam R$ 400,00', fala: 'Foram usados R$ 1.400,00, ou 77,8%. Faltam R$ 400,00.' },
      { em: 13.0, tela: 'Lazer: R$ 400,00 de R$ 300,00, R$ 100,00 acima', fala: 'Em Lazer, o usado passou: R$ 400,00 de R$ 300,00, R$ 100,00 acima.' },
      { em: 17.4, tela: 'A diferença do orçamento não é saldo nem autorização para gastar', fala: 'Leia a diferença do orçamento junto com as despesas que ainda virão. Ela não é saldo nem autorização para gastar.' },
      { em: 24.1, tela: 'Orçamento por categoria, na Clarevo. Veja no perfil as informações de acesso', fala: 'A Clarevo mostra essa comparação em Orçamento por categoria. Veja no perfil as informações de acesso.' },
    ],
    legenda:
      'Planejar e acompanhar são etapas diferentes. No exemplo do vídeo, o orçamento de Mercado é de R$ 1.800,00 por mês e foram usados R$ 1.400,00: faltam R$ 400,00. Em Lazer, o usado passou: R$ 400,00 de R$ 300,00, ou seja, R$ 100,00 acima. Antes de decidir sobre qualquer valor, confira compromissos que ainda não aconteceram.\n\nOs números são fictícios, usados para demonstrar a tarefa. Veja no perfil as informações de acesso.',
    alt: 'Gravação da tela de Orçamento por categoria da demonstração da Clarevo, com dados fictícios: Mercado com R$ 1.400,00 usados de R$ 1.800,00 (faltam R$ 400,00) e Lazer com R$ 400,00 usados de R$ 300,00 (R$ 100,00 acima). Legendas na tela repetem a narração.',
    altCapa: 'Capa do Reel "Clarevo na prática, orçado e usado no mesmo exemplo", com um trecho da tela de Orçamento por categoria (Mercado e Lazer, dados fictícios).',
    ajustes: [
      'Os números são os da tela de demonstração (Mercado e Lazer), no lugar de R$ 600, R$ 450 e R$ 150 do Playbook, que o app não mostra.',
      'A tela diz "orçado", "usado", "faltam" e "acima", e não "planejado", "registrado" e "diferença"; a capa troca "Planejado e gasto" por "Orçado e usado".',
      'A narração acrescenta "nem saldo": o app nunca chama o que falta de saldo.',
      'O texto na tela do trecho de 17 a 24 s leva o sujeito ("A diferença do orçamento não é saldo nem autorização para gastar"), para a frase não ficar solta sobre os valores de Mercado e Lazer.',
      'O fim manda ver no perfil as informações de acesso, e não "o fixado Como acessar": o acesso está em preparação (D-067) e a P03 é o fixado que traz a informação.',
    ],
    depende: [
      'Conferir a prévia no Instagram: o cabeçalho do app (com a etiqueta "Demonstração") fica nos primeiros 230 px; se o topo for coberto, repetir "Exemplo fictício" dentro da área livre.',
      'Edição final no Edits (legendas revisadas, pergunta na tela, trilha só com direitos de uso) e capa no Canva.',
      'Refazer a gravação na versão que for ao ar (responsável pelo produto, a designar).',
      'P03 publicada e fixada, porque as informações de acesso a que o fim do vídeo manda ver no perfil estão nela.',
    ],
    conferencia: [
      { afirmacao: 'Mercado: R$ 1.400,00 usados de R$ 1.800,00, 77,8%, faltam R$ 400,00. Lazer: R$ 400,00 de R$ 300,00, R$ 100,00 acima.', situacao: 'Confirmado', nota: 'Tela da demonstração de outubro de 2026 (gravação P02).' },
      { afirmacao: 'Essa diferença precisa ser lida junto com despesas que ainda virão; não é saldo nem autorização para gastar.', situacao: 'Confirmado', nota: 'O orçamento mede o usado no mês, não o dinheiro disponível; o app nunca chama o que falta de "saldo".' },
      { afirmacao: 'A Clarevo mostra essa comparação em Orçamento por categoria.', situacao: 'Confirmado', nota: 'Movimentos, Organizar, Orçamento por categoria.' },
    ],
  },
  // =============================================================================================================================
  {
    id: 'P03',
    pasta: 'D07-P03-como-acessar',
    dia: 7,
    nome: 'Como acessar (acesso em preparação)',
    formato: 'carrossel',
    fixado: 3,
    objetivo: 'Informar a disponibilidade real: a Clarevo está em fase de testes e o acesso abre no piloto.',
    acao: 'Acompanhar o perfil e ver a demonstração pelo link da bio.',
    familia: 'Editorial educativa e demonstração real',
    paginas: [
      { modelo: 'capaAzul', titulo: 'Como acompanhar a disponibilidade da Clarevo' },
      { modelo: 'texto', titulo: 'A Clarevo está em *fase de testes*.', tamTitulo: 72 },
      { modelo: 'texto', titulo: 'A versão para pessoas e empresas abre no piloto.', corpo: 'Quando houver novidade de acesso, ela aparece aqui e na página Novidades do site.' },
      {
        modelo: 'tela',
        titulo: 'Enquanto isso, dá para ver a demonstração, com dados fictícios, pelo link da bio.',
        captura: { arquivo: 'capturas/resumo-diferenca-do-mes.png', recorte: { x: 0, y: 0, w: 1080, h: 900 } },
        chip: 'Dados fictícios · demonstração',
      },
      { modelo: 'final', titulo: 'Acompanhe este perfil para as próximas informações de acesso.' },
    ],
    legenda:
      'A Clarevo está em fase de testes. A versão para pessoas e empresas abre no piloto. Enquanto isso, você pode ver a demonstração, com dados fictícios, pelo link da bio. Acompanhe este perfil para as próximas informações de acesso.',
    alt: [
      'Capa do carrossel fixado, fundo azul: "Como acompanhar a disponibilidade da Clarevo".',
      'Fundo claro com o texto "A Clarevo está em fase de testes."',
      'Fundo claro com o texto "A versão para pessoas e empresas abre no piloto. Quando houver novidade de acesso, ela aparece aqui e na página Novidades do site."',
      'Tela Resumo da demonstração da Clarevo, com dados fictícios: Diferença do mês R$ 2.100,00, recebido menos pago até 07/10, "não é saldo", Recebido R$ 6.000,00 e Pago R$ 3.900,00. Texto: "Enquanto isso, dá para ver a demonstração, com dados fictícios, pelo link da bio."',
      'Fundo azul com o texto "Acompanhe este perfil para as próximas informações de acesso."',
    ],
    ajustes: [
      'É a "versão com acesso em preparação" do Playbook, com o texto de `docs/24_REDES_SOCIAIS.md`, seção 1.3. A bio troca a chamada pela "Acompanhe as informações de acesso".',
      'Quando o acesso abrir, mudam juntos: o texto de `ACESSO` em `scripts/site/paginas/comece.js`, a página Comece aqui, esta peça, a bio e o destaque Comece aqui.',
    ],
    depende: [
      'Confirmar que o link da bio funciona no navegador do Instagram e no celular (a página Comece aqui ainda é a versão preliminar do site, sem indexação).',
      'Produto e proprietária preenchem a ficha de acesso do Playbook (destino, dispositivos testados, preço, primeira tarefa e canal de ajuda, versão e responsável): hoje a resposta é "em preparação" e sem preço.',
      'Se qualquer informação de acesso mudar, refazer a peça, a bio e o destaque no mesmo dia.',
    ],
    conferencia: [
      { afirmacao: 'A Clarevo está em fase de testes. A versão para pessoas e empresas abre no piloto.', situacao: 'Confirmado', nota: 'D-064: cadastro de pessoas reais só no piloto; nada está nas lojas; preço indefinido (P-005). Mesmo texto da página Comece aqui.' },
      { afirmacao: 'Dá para ver a demonstração, com dados fictícios, pelo link da bio.', situacao: 'Confirmado', nota: 'comece.html leva à demonstração (https://demo.clarevo.app.br), com a etiqueta "Demonstração" em cada tela. Depende de o site estar no ar.' },
      { afirmacao: 'Sem cadastro, lista de espera, data de abertura, preço, "grátis" ou plataforma.', situacao: COM_ACESSO_EM_PREPARACAO, nota: 'Playbook: "não simular cadastro, lista de espera ou data de liberação que ainda não exista".' },
    ],
  },
  // =============================================================================================================================
  {
    id: 'P04',
    pasta: 'D09-P04-saldo-e-compromissos-do-mes',
    dia: 9,
    nome: 'Saldo e compromissos do mês',
    formato: 'carrossel',
    objetivo: 'Entender a diferença entre o dinheiro na conta e os compromissos do mês.',
    acao: 'Salvar a sequência de conferência.',
    familia: 'Editorial educativa',
    paginas: [
      { modelo: 'capaClara', titulo: 'O dinheiro na conta já tem *destino*?' },
      {
        modelo: 'passos',
        passos: [
          { n: 1, texto: 'Comece pelo saldo de hoje.' },
          { n: 2, texto: 'Em seguida, liste as despesas que ainda vão vencer.' },
        ],
        nota: 'O saldo é o valor que você vê no seu banco.',
      },
      {
        modelo: 'barras',
        titulo: 'Exemplo fictício: R$ 900 na conta e R$ 650 em despesas ainda previstas.',
        itens: [
          { rotulo: 'Na conta', valor: ex.conta.naConta },
          { rotulo: 'Despesas ainda previstas', valor: ex.conta.previstas },
        ],
      },
      {
        modelo: 'conta',
        titulo: 'A diferença do exemplo ainda depende de despesas variáveis e imprevistos.',
        corpo: 'Confira o restante do mês antes de decidir.',
        equacao: [rs(ex.conta.naConta), '−', rs(ex.conta.previstas), '=', rs(ex.conta.diferenca)],
        rotuloResultado: 'Diferença do exemplo',
        chip: 'Exemplo fictício',
      },
      {
        modelo: 'texto',
        titulo: 'Revise *saldo*, *próximos vencimentos* e *despesas ainda não registradas*.',
        chamada: 'Salve esta sequência para sua revisão.',
      },
    ],
    legenda:
      'O saldo de hoje conta uma parte da história. Antes de decidir sobre uma nova compra, confira também o que ainda vai acontecer neste mês. Os valores do carrossel são fictícios. Use a sequência como apoio para revisar seus próprios registros.',
    alt: [
      'Capa em fundo claro com a pergunta "O dinheiro na conta já tem destino?"',
      'Dois passos numerados em fundo claro: 1, comece pelo saldo de hoje; 2, em seguida, liste as despesas que ainda vão vencer. Nota: o saldo é o valor que você vê no seu banco.',
      'Gráfico de duas barras horizontais, a partir de zero e na mesma escala, em reais: na conta, R$ 900; despesas ainda previstas, R$ 650. Texto: "Exemplo fictício: R$ 900 na conta e R$ 650 em despesas ainda previstas."',
      'A conta do exemplo, R$ 900 menos R$ 650 igual a R$ 250, rotulada como diferença do exemplo. Texto: "A diferença do exemplo ainda depende de despesas variáveis e imprevistos. Confira o restante do mês antes de decidir."',
      'Texto "Revise saldo, próximos vencimentos e despesas ainda não registradas." e o convite "Salve esta sequência para sua revisão."',
    ],
    ajustes: [
      'Página 4: "A diferença de R$ 250" virou "A diferença do exemplo", e a conta aparece ao lado, porque o app não calcula saldo e a "Diferença do mês" do app é outra coisa (Recebido menos Pago).',
      'Página 2: nota "O saldo é o valor que você vê no seu banco", porque o app não mostra saldo de conta (D-022 e D-043).',
    ],
    depende: [
      'Não mostrar tela do app como se fosse saldo. Se a equipe quiser citar o app: "Na Clarevo, as contas que ainda vão vencer ficam separadas, em Ainda a pagar neste mês" (captura `contas-a-pagar-1-ainda-a-pagar.png`, R$ 650,00 na demonstração).',
      'Montar no Canva e publicar; registrar salvamentos por alcance na janela de 7 dias.',
    ],
    conferencia: [
      { afirmacao: 'Comece pelo saldo de hoje.', situacao: 'Sem afirmação sobre o app', nota: 'O app não calcula nem mostra saldo de conta; o saldo é o que a pessoa vê no banco (D-022, D-043).' },
      { afirmacao: 'R$ 900 na conta, R$ 650 em despesas previstas, diferença de R$ 250.', situacao: 'Exemplo fictício, conta conferida', nota: 'R$ 900 − R$ 650 = R$ 250. O R$ 650 é também o "Ainda a pagar neste mês" da demonstração, mas a peça não cita o app.' },
      { afirmacao: 'A diferença não é sobra garantida.', situacao: 'Confirmado', nota: 'Playbook: não apresentar a diferença do exemplo como sobra garantida.' },
    ],
  },
  // =============================================================================================================================
  {
    id: 'P05',
    pasta: 'D11-P05-reel-planejar-uma-categoria',
    dia: 11,
    nome: 'Planejar uma categoria',
    formato: 'reel',
    objetivo: 'Mostrar o início de um orçamento na versão atual.',
    acao: 'Ver no perfil as informações de acesso (acesso em preparação).',
    familia: 'Demonstração real',
    gravacao: 'p05',
    capa: { tag: 'Orçamento por categoria', titulo: 'Quanto você pretende gastar nesta categoria?', chip: 'Exemplo fictício' },
    roteiro: [
      { em: 0, tela: 'Quanto você pretende gastar nesta categoria?', fala: 'Quanto você pretende gastar nesta categoria?' },
      { em: 4.3, tela: 'No exemplo fictício: R$ 600,00 por mês para Transporte', fala: 'No exemplo fictício, vamos orçar R$ 600,00 por mês para Transporte.' },
      { em: 8.7, tela: 'Escolhemos a categoria e o valor por mês', fala: 'Escolhemos a categoria e preenchemos o valor por mês. Ele vale a partir do mês escolhido.' },
      { em: 14.5, tela: 'Salvar: vale a partir de outubro', fala: 'Ao salvar, o app avisa que o orçamento vale a partir de outubro.' },
      { em: 18.8, tela: 'Transporte: R$ 0,00 de R$ 600,00. Total orçado: R$ 5.200,00', fala: 'A categoria entra com R$ 0,00 usados de R$ 600,00, e o total orçado passa de R$ 4.600,00 para R$ 5.200,00.' },
      { em: 25.6, tela: 'Depois, confira os registros da categoria. Veja no perfil as informações de acesso', fala: 'Depois, é preciso conferir os registros da categoria. Veja no perfil as informações de acesso.' },
    ],
    legenda:
      'Planejar uma categoria cria uma referência para acompanhar o mês. Os R$ 600,00 por mês de Transporte neste vídeo são um exemplo fictício, sem recomendação de valor para seu orçamento. Veja no perfil as informações de acesso.',
    alt: 'Gravação da tela da demonstração da Clarevo, com dados fictícios: a pessoa escolhe a categoria Transporte, preenche R$ 600,00 por mês, salva e vê o aviso de que o orçamento vale a partir de outubro e o novo card, com R$ 0,00 usados de R$ 600,00. Legendas na tela repetem a narração.',
    altCapa: 'Capa do Reel com a pergunta "Quanto você pretende gastar nesta categoria?" e um trecho da tela de definição do orçamento de Transporte, com R$ 600 no campo Valor por mês (dados fictícios).',
    ajustes: [
      'Categoria: Transporte, uma das seis do app (o Playbook cita "alimentação", que não existe como categoria).',
      'Não há campo de nome: a pessoa escolhe a categoria e preenche "Valor por mês". O texto diz "escolhemos a categoria e preenchemos o valor por mês".',
      'A chamada final manda ver no perfil as informações de acesso (acesso em preparação), e não começar a usar nem se cadastrar.',
    ],
    depende: [
      'A sequência só pode ser publicada se terminar corretamente no teste da versão que for ao ar (a gravação atual termina com o aviso e o card novo).',
      'Edição final no Edits e capa no Canva; repetir "Exemplo fictício" dentro da área livre enquanto os valores aparecerem.',
    ],
    conferencia: [
      { afirmacao: 'Abrimos a área de orçamento.', situacao: 'Confirmado', nota: 'Movimentos, Organizar, Orçamento por categoria.' },
      { afirmacao: 'Escolhemos a categoria e preenchemos o valor por mês.', situacao: 'Ajustado ao app', nota: 'Seis categorias (Moradia, Mercado, Transporte, Saúde, Educação, Lazer); "Valor por mês" de R$ 1,00 a R$ 9.999.999,99; "A partir de" (D-041).' },
      { afirmacao: 'Ao salvar, o app avisa que o orçamento vale a partir de outubro; o card entra com R$ 0,00 de R$ 600,00; o total vai de R$ 4.600,00 a R$ 5.200,00.', situacao: 'Confirmado', nota: 'Gravação P05, até o fim do fluxo.' },
    ],
  },
  // =============================================================================================================================
  {
    id: 'P06',
    pasta: 'D13-P06-video-com-integrante-por-onde-comecar',
    dia: 13,
    nome: 'Por onde começar a organizar o mês?',
    formato: 'video-integrante',
    alternativaDe: 'T01',
    objetivo: 'Apresentar uma pessoa real ligada ao projeto e uma pergunta útil para organizar o mês (alternativa perene da posição flexível do D13).',
    acao: 'Recolher uma dúvida externa: qual etapa mais confunde hoje (registrar, planejar ou revisar).',
    familia: 'Humana e institucional',
    capa: { titulo: 'Por onde começar a organizar o mês?' },
    roteiro: [
      {
        fala:
          'Uma boa pergunta para começar é: o que já está comprometido neste mês? Separe as despesas que você já conhece e veja o que ainda precisa registrar. Esse primeiro levantamento ajuda a entender o mês antes de mudar o planejamento. Aqui no perfil, vamos mostrar como levar perguntas assim para tarefas da Clarevo. Qual etapa mais confunde você hoje: registrar, planejar ou revisar?',
      },
    ],
    legenda:
      'Começar pode ser uma tarefa pequena: conferir compromissos e registros. Neste vídeo, uma pessoa da equipe apresenta a pergunta que orienta essa primeira revisão. Conte qual etapa você quer entender melhor, sem publicar valores ou informações pessoais.',
    alt: 'Capa de vídeo em fundo azul com a pergunta "Por onde começar a organizar o mês?" e o quadro reservado à gravação com uma pessoa real da equipe (a escolher pela equipe).',
    ajustes: ['No Playbook o vídeo é de uma pessoa da equipe nomeada; aqui a legenda diz "uma pessoa da equipe" e o nome e a função entram só depois de confirmados com a própria pessoa.'],
    depende: [
      'Gravação com a pessoa integrante da equipe (integrante real), com áudio claro, e autorização de imagem e de fala. O roteiro é revisado pela própria pessoa antes de gravar.',
      'A fala precisa corresponder à atuação e ao método que a própria pessoa realmente adota; não atribuir experiência, títulos nem resultados não confirmados.',
      'Legendar e revisar no Edits; capa no Canva com o quadro real no lugar do marcador.',
    ],
    conferencia: [
      { afirmacao: 'O que já está comprometido neste mês? ... levar perguntas assim para tarefas da Clarevo.', situacao: 'Confirmado', nota: 'Ainda a pagar neste mês e Renda comprometida existem (D-026); a renda comprometida precisa da renda de referência informada.' },
      { afirmacao: 'Atuação e método da pessoa que fala.', situacao: 'A confirmar com a pessoa que fala', nota: 'Fora da ficha do app: conferido com a própria pessoa.' },
    ],
  },
  // =============================================================================================================================
  {
    id: 'T01',
    pasta: 'D13-T01-trend-post-reproduzido',
    dia: 13,
    nome: 'Trend de post reproduzido (assinaturas)',
    formato: 'carrossel-trend',
    alternativaPerene: 'P06',
    objetivo: 'Refletir sobre prioridades e mudanças possíveis, no formato de post reproduzido (posição flexível do D13, só se houver referência adequada na revisão semanal).',
    acao: 'Salvar para conferir as assinaturas quando as próximas cobranças chegarem; uma pergunta específica nos comentários.',
    familia: 'Trend (post reproduzido), com nome e ícone oficiais',
    paginas: [
      { modelo: 'post', titulo: 'Tem um plano que você adia todo mês?', corpo: 'Olhar para um gasto recorrente pode ajudar a avaliar possibilidades.' },
      {
        modelo: 'postColunas',
        titulo: 'Um exemplo com assinaturas',
        colunas: [
          { rotulo: 'Hoje', valor: rs(ex.assinaturas.hoje), unidade: 'por mês' },
          { rotulo: 'Depois de uma revisão', valor: rs(ex.assinaturas.depois), unidade: 'por mês' },
        ],
        corpo: `Diferença: ${rs(ex.assinaturas.diferencaPorMes)} por mês.`,
        nota: 'Exemplo fictício.',
      },
      {
        modelo: 'postNumero',
        titulo: 'Se essa redução for mantida por 12 meses:',
        numero: `${rs(ex.assinaturas.diferencaPorMes)} × ${ex.assinaturas.meses} = ${rs(ex.assinaturas.somaNoAno)}`,
        nota: 'Exemplo fictício.',
        corpo: 'Sem considerar rendimentos. A diferença só é acumulada se for separada e não gasta em outra coisa.',
      },
      {
        modelo: 'post',
        titulo: `Para uma meta de ${rs(ex.assinaturas.meta)}, esses ${rs(ex.assinaturas.somaNoAno)} seriam metade do valor.`,
        corpo: 'Você escolhe o objetivo e avalia se essa mudança cabe na sua rotina.',
        nota: 'Meta fictícia.',
      },
      {
        modelo: 'post',
        titulo: 'Qual assinatura você ainda usa e quer manter?',
        corpo: 'Comece por essa revisão. Depois, veja se existe algo que perdeu utilidade.',
        nota: 'Salve para conferir quando as próximas cobranças chegarem.',
        notaForte: true,
      },
    ],
    legenda:
      'Uma revisão pode mostrar gastos que continuam importantes e outros que perderam utilidade. Neste exemplo fictício, a redução de R$ 50 por mês poderia somar R$ 600 em um ano, se o valor fosse separado durante todo o período. O próximo passo depende do que você deseja manter e do objetivo que quer priorizar.',
    alt: [
      'Post reproduzido em fundo branco, com o ícone e o nome Clarevo no cabeçalho: "Tem um plano que você adia todo mês? Olhar para um gasto recorrente pode ajudar a avaliar possibilidades."',
      'Comparação em duas colunas, exemplo fictício de assinaturas: hoje R$ 200 por mês; depois de uma revisão R$ 150 por mês. Diferença: R$ 50 por mês.',
      'Texto "Se essa redução for mantida por 12 meses: R$ 50 × 12 = R$ 600", com a indicação "Exemplo fictício" logo abaixo da conta. Depois: "Sem considerar rendimentos. A diferença só é acumulada se for separada e não gasta em outra coisa."',
      'Texto "Para uma meta de R$ 1.200, esses R$ 600 seriam metade do valor. Você escolhe o objetivo e avalia se essa mudança cabe na sua rotina. Meta fictícia."',
      'Pergunta "Qual assinatura você ainda usa e quer manter?" e o convite a salvar para conferir quando as próximas cobranças chegarem.',
    ],
    ajustes: ['Visual de post reproduzido (fundo branco, cabeçalho de autor, texto direto), sem faixas azuis nem caixas lima, como o Playbook manda para a trend. Sem @, selo, curtidas nem comentários.'],
    depende: [
      'Decidir na revisão semanal (até 48 horas antes) se há referência de trend adequada e direitos de uso; se não houver, publicar a alternativa perene P06.',
      'Ficha de referência externa do Manual (mídia exata, origem, direitos, plano B) preenchida antes de produzir.',
      'Só exibir um @ depois de confirmado o identificador real.',
    ],
    conferencia: [
      { afirmacao: 'R$ 200 viram R$ 150; R$ 50 por mês; R$ 50 × 12 = R$ 600; R$ 600 é metade de uma meta de R$ 1.200.', situacao: 'Exemplo fictício, conta conferida', nota: 'Sem rendimentos; a diferença só se acumula se for separada.' },
      { afirmacao: 'Sem afirmação sobre o app.', situacao: 'Sem afirmação sobre o app', nota: 'Se a equipe citar o app: a Clarevo tem Assinaturas (D-046) e Metas "sem contar rendimentos"; guardar é registrar um aporte, não há transferência automática.' },
    ],
  },
  // =============================================================================================================================
  {
    id: 'P07',
    pasta: 'D16-P07-parcela-e-total-da-compra',
    dia: 16,
    nome: 'Parcela e total da compra',
    formato: 'carrossel',
    objetivo: 'Comparar compromisso e preço: ampliar a leitura de uma compra para além do valor mensal.',
    acao: 'Guardar as perguntas antes da próxima decisão.',
    familia: 'Editorial educativa',
    paginas: [
      { modelo: 'capaAzul', titulo: 'Você comparou a *parcela* com o *total*?' },
      {
        modelo: 'parcelas',
        titulo: `Exemplo fictício: ${ex.parcelado.parcelas} parcelas de ${rs(ex.parcelado.valorParcela)} somam ${rs(ex.parcelado.total)}.`,
        parcelas: ex.parcelado.parcelas,
        valorParcela: rs(ex.parcelado.valorParcela),
        total: rs(ex.parcelado.total),
      },
      {
        modelo: 'duasCondicoes',
        titulo: `Se o preço à vista fosse ${rs(ex.parcelado.aVista)}, a diferença para esse parcelamento seria ${rs(ex.parcelado.diferenca)}.`,
        aVista: { rotulo: 'À vista', valor: ex.parcelado.aVista, texto: rs(ex.parcelado.aVista) },
        parcelado: { rotulo: `${ex.parcelado.parcelas} × ${rs(ex.parcelado.valorParcela)}`, valor: ex.parcelado.total, texto: rs(ex.parcelado.total) },
        diferenca: `+ ${rs(ex.parcelado.diferenca)}`,
        chip: 'Exemplo fictício',
      },
      {
        modelo: 'texto',
        titulo: 'Confira o *valor total* informado, as *condições* e os *meses já comprometidos*.',
        corpo: 'O exemplo não determina qual escolha serve ao seu caso.',
      },
      { modelo: 'final', titulo: 'Antes de decidir, pergunte: qual é o *total* e por quanto tempo esse compromisso permanece?' },
    ],
    legenda:
      'Uma parcela pequena pode durar vários meses. O exemplo fictício ajuda a comparar o total, mas a decisão também depende do seu orçamento e das condições da compra. Guarde as perguntas para consultar antes de assumir um compromisso.',
    alt: [
      'Capa em fundo azul com a pergunta "Você comparou a parcela com o total?"',
      'Seis quadrinhos, um por mês, cada um com R$ 120, ao lado de um produto de exemplo; total R$ 720. Texto: "Exemplo fictício: 6 parcelas de R$ 120 somam R$ 720."',
      'Duas barras horizontais, a partir de zero e na mesma escala: à vista R$ 650; parcelado, 6 vezes de R$ 120, R$ 720. A diferença é de R$ 70. Exemplo fictício.',
      'Texto "Confira o valor total informado, as condições e os meses já comprometidos. O exemplo não determina qual escolha serve ao seu caso."',
      'Fundo azul com a pergunta "Antes de decidir, pergunte: qual é o total e por quanto tempo esse compromisso permanece?"',
    ],
    ajustes: ['A diferença de R$ 70 é diferença de preço, nunca juros mensais nem CET (regra do Manual).'],
    depende: [
      'Se a equipe citar a calculadora "Parcelado ou à vista?" (app e site), dizer que a taxa que ela mostra é a que iguala as parcelas ao preço à vista, em juros compostos; não é CET.',
      'Montar no Canva e publicar; registrar salvamentos e compartilhamentos na janela de 7 dias.',
    ],
    conferencia: [
      { afirmacao: '6 parcelas de R$ 120 somam R$ 720; à vista R$ 650; diferença de R$ 70.', situacao: 'Confirmado', nota: 'A calculadora "Parcelado ou à vista?" dá "o parcelado custa R$ 70,00 a mais" e "Total parcelado: R$ 720,00 (6 × R$ 120,00)".' },
      { afirmacao: 'O exemplo não determina qual escolha serve ao seu caso.', situacao: 'Confirmado', nota: 'Preserva a autonomia de decisão; sem juros, CET nem recomendação.' },
    ],
  },
  // =============================================================================================================================
  {
    id: 'P08',
    pasta: 'D18-P08-reel-uma-meta-com-proximo-passo',
    dia: 18,
    nome: 'Uma meta com próximo passo',
    formato: 'reel',
    objetivo: 'Mostrar como iniciar uma meta com informação concreta.',
    acao: 'Ver no perfil as informações de acesso (acesso em preparação).',
    familia: 'Demonstração real',
    gravacao: 'p08',
    capa: { tag: 'Metas', titulo: 'Qual é o próximo passo da sua meta?', chip: 'Exemplo fictício' },
    roteiro: [
      { em: 0, tela: 'Qual é o próximo passo da sua meta?', fala: 'Qual é o próximo passo da sua meta?' },
      { em: 4.3, tela: 'No exemplo fictício, criamos uma meta', fala: 'Neste exemplo fictício, vamos criar uma meta e registrar o que a tela pede.' },
      { em: 9.2, tela: 'Nome, valor, prazo, já guardado e quanto por mês', fala: 'Escolhemos um modelo de nome, o valor, o prazo, quanto já está guardado e quanto pretende guardar por mês.' },
      { em: 17.6, tela: 'R$ 600,00 guardados de R$ 3.000,00, 20%. Faltam R$ 2.400,00', fala: 'Depois de salvar, o app mostra R$ 600,00 guardados de R$ 3.000,00, 20%, e faltam R$ 2.400,00.' },
      { em: 23.6, tela: 'Com R$ 300,00 por mês: maio de 2027, sem rendimentos', fala: 'Com R$ 300,00 por mês, a meta chega em maio de 2027, sem rendimentos. A Clarevo não guarda nem movimenta dinheiro.' },
      { em: 31.0, tela: 'Veja no perfil as informações de acesso', fala: 'Veja no perfil as informações de acesso.' },
    ],
    legenda:
      'Transforme o objetivo em um registro que possa acompanhar. A meta do vídeo usa dados fictícios. Conferir o progresso faz parte da revisão, e qualquer contribuição precisa caber no orçamento. Veja no perfil as informações de acesso.',
    alt: 'Gravação da tela da demonstração da Clarevo, com dados fictícios: a pessoa cria a meta Estudos, de R$ 3.000,00, com R$ 600,00 já guardados e R$ 300,00 por mês, e vê o progresso de 20%, faltam R$ 2.400,00, e a previsão de chegar em maio de 2027, sem rendimentos. Legendas na tela repetem a narração.',
    altCapa: 'Capa do Reel com a pergunta "Qual é o próximo passo da sua meta?" e um trecho da tela da meta Estudos: R$ 600,00 de R$ 3.000,00, 20%, faltam R$ 2.400,00 (dados fictícios).',
    ajustes: ['A narração diz o que o app faz de fato: a meta mostra só o que a pessoa registra, e "a Clarevo não guarda nem movimenta dinheiro" (D-027). Nada de contribuição automática, rendimento ou transferência.'],
    depende: [
      'Refazer o teste do fluxo na versão que for ao ar (criar a meta e ver o progresso).',
      'Edição final no Edits e capa no Canva; "Exemplo fictício" visível enquanto os valores aparecerem.',
    ],
    conferencia: [
      { afirmacao: 'Criar uma meta e registrar as informações que a tela pede.', situacao: 'Confirmado', nota: 'Tipo, modelo de nome, nome, valor, "Até quando?", "Quanto você já tem guardado" e "Quanto pretende guardar por mês" (gravação P08).' },
      { afirmacao: 'R$ 600,00 de R$ 3.000,00, 20%, faltam R$ 2.400,00; com R$ 300,00 por mês chega em maio de 2027, sem rendimentos.', situacao: 'Confirmado', nota: 'Lido da tela da gravação.' },
      { afirmacao: 'A Clarevo não guarda nem movimenta dinheiro.', situacao: 'Confirmado', nota: 'Aporte é um registro feito à mão (D-027).' },
    ],
  },
  // =============================================================================================================================
  {
    id: 'P09',
    pasta: 'D20-P09-video-com-integrante-antes-de-uma-compra',
    dia: 20,
    nome: 'O que acontece antes de uma compra?',
    formato: 'video-integrante',
    alternativaDe: 'T02',
    objetivo: 'Oferecer uma pergunta de observação antes de comprar (alternativa perene da posição flexível do D20).',
    acao: 'Escolher uma pergunta do vídeo para observar uma próxima decisão de compra (salvar ou comentar a experiência).',
    familia: 'Humana e institucional',
    capa: { titulo: 'O que acontece antes de uma compra?' },
    roteiro: [
      {
        fala:
          'Antes de comprar, observe o contexto. Foi uma compra planejada? Você viu uma oferta e decidiu na hora? Que informação ainda falta para avaliar essa escolha? Essas perguntas podem ajudar a perceber padrões da rotina. No perfil da Clarevo, vamos relacionar esse olhar com o registro e a revisão do orçamento.',
      },
    ],
    legenda: 'Observar o contexto de uma compra pode ser um começo para entender seus hábitos. Escolha uma pergunta do vídeo para observar uma próxima decisão de compra.',
    alt: 'Capa de vídeo em fundo azul com a pergunta "O que acontece antes de uma compra?" e o quadro reservado à gravação com uma pessoa real da equipe (a escolher pela equipe).',
    ajustes: ['A fala diz "No perfil da Clarevo", com a marca no feminino (D-068). A função profissional da pessoa só aparece se estiver confirmada.'],
    depende: [
      'Gravação com a pessoa integrante da equipe (integrante real), função confirmada, autorização de imagem e de fala; a própria pessoa revisa o texto de acordo com a sua atuação.',
      'Manter a fala educativa: nada de rótulo de transtorno, culpa ou promessa de corrigir emoções pelo aplicativo.',
    ],
    conferencia: [
      { afirmacao: 'Relacionar esse olhar com o registro e a revisão do orçamento.', situacao: 'Confirmado', nota: 'Anotar gasto, Orçamento por categoria e Seu mês em 30 segundos existem.' },
      { afirmacao: 'Função profissional da pessoa que fala.', situacao: 'A confirmar com a pessoa que fala', nota: 'Só aparece se confirmada.' },
    ],
  },
  // =============================================================================================================================
  {
    id: 'T02',
    pasta: 'D20-T02-trend-a-definir',
    dia: 20,
    nome: 'Trend em circulação (a definir na revisão semanal)',
    formato: 'trend-a-definir',
    alternativaPerene: 'P09',
    objetivo: 'Reconhecimento e reflexão, num formato em circulação escolhido na revisão semanal.',
    acao: 'Salvar ou comentar a experiência.',
    semArte: true,
    depende: ['Escolher a referência perto da publicação (48 horas antes), registrar link, data e direitos; se faltar relevância, autorização ou tempo, publicar a P09.'],
  },
  // =============================================================================================================================
  {
    id: 'P10',
    pasta: 'D23-P10-revisao-do-mes',
    dia: 23,
    nome: 'Revisão do mês',
    formato: 'carrossel',
    objetivo: 'Ensinar uma sequência de conferência: revisar o orçamento.',
    acao: 'Fazer a revisão com os próprios registros.',
    familia: 'Editorial educativa e demonstração real',
    paginas: [
      { modelo: 'capaAzul', titulo: 'O que você precisa conferir antes do *próximo mês*?' },
      { modelo: 'texto', titulo: 'Veja se os registros do período estão *completos*.', corpo: 'Uma despesa ausente muda a leitura.' },
      {
        modelo: 'tela',
        titulo: 'Compare o orçado com o usado nas categorias que você acompanha.',
        captura: { arquivo: 'capturas/orcamento-1-total-do-mes.png', recorte: { x: 40, y: 212, w: 1000, h: 750 } },
        chip: 'Exemplo fictício · demonstração',
      },
      {
        modelo: 'chipsTexto',
        titulo: 'Observe a diferença e procure uma explicação concreta.',
        chips: ['preço', 'frequência', 'novo compromisso', 'registro faltante'],
      },
      { modelo: 'texto', titulo: 'Revise o *próximo mês* com base no que aconteceu e nos compromissos já conhecidos.' },
      { modelo: 'final', titulo: 'Escolha uma *categoria* para começar a revisão hoje.' },
    ],
    legenda:
      'Uma revisão ajuda a transformar registros em informação para a próxima decisão. Comece conferindo se estão completos e escolha uma categoria para observar. Ajuste o planejamento com base no que aconteceu e no que já sabe sobre o próximo mês.',
    alt: [
      'Capa em fundo azul com a pergunta "O que você precisa conferir antes do próximo mês?"',
      'Fundo claro com o texto "Veja se os registros do período estão completos. Uma despesa ausente muda a leitura."',
      'Tela da demonstração do app, com dados fictícios, em Orçamento por categoria: Orçado R$ 4.600,00 e Usado R$ 4.300,00 no total; Moradia com R$ 2.500,00 de R$ 2.500,00. Texto: "Compare o orçado com o usado nas categorias que você acompanha."',
      'Texto "Observe a diferença e procure uma explicação concreta" e quatro possibilidades: preço, frequência, novo compromisso, registro faltante.',
      'Fundo claro com o texto "Revise o próximo mês com base no que aconteceu e nos compromissos já conhecidos."',
      'Fundo azul com o texto "Escolha uma categoria para começar a revisão hoje."',
    ],
    ajustes: ['Página 3: "planejado" e "registrado" viraram "orçado" e "usado", os nomes da tela. Página 4: a segunda frase do Playbook virou lista de quatro possibilidades.'],
    depende: [
      'Conferir período e nomes dos campos da captura (a de hoje é de outubro de 2026, Pessoal) antes de publicar; sem telas minúsculas.',
      'Montar no Canva e publicar; registrar salvamentos na janela de 7 dias.',
    ],
    conferencia: [
      { afirmacao: 'Veja se os registros do período estão completos.', situacao: 'Confirmado', nota: '"Conferi este mês" (D-060) e a revisão de "Seus últimos meses" (D-030).' },
      { afirmacao: 'Compare o orçado com o usado nas categorias.', situacao: 'Ajustado ao app', nota: 'Orçamento por categoria mostra Orçado e Usado.' },
      { afirmacao: 'Observe a diferença e procure uma explicação concreta.', situacao: 'Confirmado', nota: 'Seu mês em 30 segundos e Entender o que mudou descrevem a diferença sem apontar causa (D-052, D-057).' },
      { afirmacao: 'Revise o próximo mês com base nos compromissos já conhecidos.', situacao: 'Confirmado', nota: 'Análises, "Próximos meses" (sempre "previsto") e Contas a pagar.' },
    ],
  },
  // =============================================================================================================================
  {
    id: 'P11',
    pasta: 'D25-P11-reel-primeiro-registro-de-despesa',
    dia: 25,
    nome: 'Primeiro registro de despesa',
    formato: 'reel',
    objetivo: 'Reduzir a dúvida de começo: mostrar a primeira tarefa até o resultado.',
    acao: 'Concluir a primeira tarefa no app (hoje, ver a demonstração pelo link da bio).',
    familia: 'Demonstração real',
    gravacao: 'p11',
    capa: { tag: 'Primeira tarefa', titulo: 'Seu primeiro registro na Clarevo', chip: 'Exemplo fictício' },
    roteiro: [
      { em: 0, tela: 'Seu primeiro registro na Clarevo', fala: 'Seu primeiro registro na Clarevo.' },
      { em: 4.1, tela: 'Exemplo fictício: uma despesa de R$ 35,00', fala: 'Comece com uma despesa que você já conhece. No exemplo fictício, vamos registrar R$ 35,00.' },
      { em: 9.9, tela: 'Descrição, valor e categoria', fala: 'Confira os campos que esta versão pede: descrição, valor e categoria.' },
      { em: 15.7, tela: 'Salvar e conferir o registro', fala: 'Salve e veja se o registro aparece corretamente.' },
      { em: 19.4, tela: 'Pago: R$ 3.900,00 para R$ 3.935,00', fala: 'No Resumo, o Pago vai de R$ 3.900,00 para R$ 3.935,00, e a Diferença do mês, de R$ 2.100,00 para R$ 2.065,00.' },
      { em: 26.4, tela: 'O gasto também aparece em Pagamentos do mês', fala: 'O gasto também aparece em Pagamentos do mês. Veja no perfil as informações de acesso.' },
      { em: 31.8, tela: 'Na sua conta, o primeiro registro começa do zero.', fala: 'Na sua conta, o primeiro registro começa do zero.' },
    ],
    legenda:
      'Uma tarefa pequena para começar: registrar uma despesa e conferir o resultado. O vídeo usa R$ 35 como exemplo fictício, na conta de demonstração, que já tem registros. Na sua conta, o primeiro registro começa do zero. Se precisar de orientação, veja o destaque Ajuda.',
    alt: 'Gravação da tela da demonstração da Clarevo, com dados fictícios: a pessoa abre Anotar gasto, preenche Farmácia, R$ 35,00, categoria Saúde, salva, vê "Gasto salvo" e confere no Resumo que o Pago foi de R$ 3.900,00 para R$ 3.935,00. Legendas na tela repetem a narração, e a última avisa que, na conta da pessoa, o primeiro registro começa do zero.',
    altCapa: 'Capa do Reel "Seu primeiro registro na Clarevo", com um trecho da tela "Gasto salvo": Farmácia, R$ 35,00 (dados fictícios).',
    ajustes: [
      'A última frase da legenda não cita canal de ajuda: o Playbook manda "pelo canal informado no perfil", e o canal ainda está a definir. Quando existir, acrescentar.',
      'A gravação usa a conta de demonstração, que já tem registros. Numa conta nova, o primeiro gasto deixaria a Diferença do mês negativa (R$ 0,00 recebidos), e a peça teria de explicar isso. Por isso o roteiro (7 trechos), a legenda e o texto na tela do último trecho dizem "Na sua conta, o primeiro registro começa do zero."',
      'A narração do fim troca "A orientação de acesso está no perfil" por "Veja no perfil as informações de acesso" (como P02, P05 e P08) e perde "É o primeiro passo para acompanhar", para caber a frase nova no tempo da gravação (a última frase fica nos 3,8 s finais, sobre o Resumo parado).',
    ],
    depende: [
      'Definir o canal de ajuda (e-mail de suporte) e o horário real de atendimento para o destaque Ajuda; sem canal, a chamada final fica só no perfil.',
      'A cena de resultado é obrigatória; refazer a gravação na versão que for ao ar.',
      'Edição final no Edits e capa no Canva; "Exemplo fictício" visível enquanto os valores aparecerem.',
    ],
    conferencia: [
      { afirmacao: 'Registrar R$ 35,00 em Farmácia, categoria Saúde.', situacao: 'Confirmado', nota: 'Gravação P11, até "Gasto salvo".' },
      { afirmacao: 'No Resumo, o Pago vai de R$ 3.900,00 para R$ 3.935,00 e a Diferença do mês de R$ 2.100,00 para R$ 2.065,00.', situacao: 'Confirmado', nota: 'Lido da tela; a Diferença do mês é Recebido menos Pago e não é saldo.' },
      { afirmacao: 'Na sua conta, o primeiro registro começa do zero.', situacao: 'Confirmado', nota: 'Conta nova nunca recebe dados de exemplo; a gravação usa a demonstração (dados fictícios, 07/10/2026), que já tem registros e por isso mostra Pago de R$ 3.900,00 antes do registro.' },
      { afirmacao: 'Consulte o destaque Ajuda pelo canal informado.', situacao: 'A decidir', nota: 'O e-mail de suporte ainda é marcador.' },
    ],
  },
  // =============================================================================================================================
  {
    id: 'B01',
    pasta: 'D27-B01-bem-estar-financeiro-nas-empresas',
    dia: 27,
    nome: 'Bem-estar financeiro nas empresas',
    formato: 'carrossel',
    objetivo: 'Apresentar o benefício para empresas.',
    acao: 'Solicitar apresentação pelo canal comercial conferido (bloqueada até o canal existir).',
    familia: 'Humana e institucional',
    paginas: [
      { modelo: 'capaAzul', rotulo: 'Para empresas', titulo: 'Bem-estar financeiro também faz parte do cuidado com *sua equipe*.' },
      { modelo: 'texto', titulo: 'A proposta é oferecer apoio à *organização financeira* das pessoas da equipe.', corpo: 'A empresa nunca vê as finanças de ninguém, nem somadas.' },
      {
        modelo: 'listaFerramentas',
        titulo: 'A Clarevo reúne ferramentas para acompanhar o mês e apoiar decisões.',
        itens: ['Resumo do mês', 'Contas a pagar', 'Orçamento por categoria', 'Metas', 'Calculadoras e simulador'],
      },
      {
        modelo: 'nr1',
        titulo: 'Esse benefício pode integrar o programa de bem-estar.',
        corpo: 'A relação com ações da NR-1 depende de avaliação técnica e não substitui o gerenciamento de riscos.',
      },
      { modelo: 'final', titulo: 'Conheça a proposta para *sua empresa*.' },
    ],
    legenda:
      'Bem-estar financeiro também faz parte do cuidado com a sua equipe. A Clarevo propõe apoio à organização financeira pessoal e familiar, integrado às iniciativas de bem-estar da empresa. A empresa nunca vê as finanças de ninguém, nem somadas. Esse benefício pode integrar o programa de bem-estar; a relação com ações da NR-1 depende de avaliação técnica e não substitui o gerenciamento de riscos. Para conhecer a proposta, use o canal comercial indicado no perfil.',
    alt: [
      'Capa em fundo azul, com o rótulo "Para empresas": "Bem-estar financeiro também faz parte do cuidado com sua equipe."',
      'Fundo claro com o texto "A proposta é oferecer apoio à organização financeira das pessoas da equipe. A empresa nunca vê as finanças de ninguém, nem somadas."',
      'Lista de ferramentas da Clarevo: Resumo do mês, Contas a pagar, Orçamento por categoria, Metas, Calculadoras e simulador. Texto: "A Clarevo reúne ferramentas para acompanhar o mês e apoiar decisões."',
      'Texto "Esse benefício pode integrar o programa de bem-estar. A relação com ações da NR-1 depende de avaliação técnica e não substitui o gerenciamento de riscos."',
      'Fundo azul com o texto "Conheça a proposta para sua empresa."',
    ],
    ajustes: [
      'Página 2: "dos colaboradores" virou "das pessoas da equipe" (linguagem neutra, como a ficha sugere).',
      'Página 4: a frase do Playbook foi dividida no ponto e vírgula, e a ressalva da NR-1 tem o mesmo peso visual da primeira frase.',
      'Página 2: a frase "A empresa nunca vê as finanças de ninguém, nem somadas." é acrescentada (o Playbook não a traz) e repete D-056: o RH vê vagas, convites e licenças e só as contagens de licenças, "nunca finanças, nem somadas, nem o uso do app". Não ampliar a frase (por exemplo, para "a empresa não vê nada"): o RH vê o e-mail de cada licença.',
      'Página 3: a lista de ferramentas só traz o que o app tem (ficha de afirmações), sem tela do painel da empresa (nunca com e-mails reais).',
      'A legenda é nova (o Playbook só traz as páginas): usa só frases do Playbook e do Manual e a mesma ressalva.',
    ],
    depende: [
      'BLOQUEADA até existir o canal comercial conferido: hoje o contato é marcador e o site é preliminar. Uma arte com aparência de botão não cria acesso clicável.',
      'Revisão técnica de saúde e NR-1 e a resposta da pergunta 35 ao advogado (`docs/legal/resumo-para-advogado.md`) antes de publicar.',
      'Não usar "app certificado pela NR-1", "sua empresa adequada com uma assinatura" nem "redução garantida de afastamentos". Não anunciar psicologia, mentoria, palestras, laudos, PGR ou relatórios de risco: não existem no produto.',
      'Para o destaque Para empresas: a apresentação e o canal comercial conferidos.',
    ],
    conferencia: [
      { afirmacao: 'Apoio à organização financeira das pessoas da equipe.', situacao: 'Confirmado, com ajuste de texto', nota: 'Benefício por licença (D-056): a empresa convida, a pessoa aceita e vê, em Conta, a empresa, o plano e até quando vale.' },
      { afirmacao: 'A empresa nunca vê as finanças de ninguém, nem somadas.', situacao: 'Confirmado', nota: 'D-056 (painel de empresas, só na web): o RH vê vagas, convites, licenças (com o e-mail de cada uma) e só as contagens de licenças de `organization_usage`; nenhuma função nem visão da empresa lê finanças, Família, vínculos nem atividade. A frase fala de finanças, e não de "dados", porque o e-mail da licença o RH vê.' },
      { afirmacao: 'A Clarevo reúne ferramentas para acompanhar o mês e apoiar decisões.', situacao: 'Confirmado', nota: 'Resumo, Contas a pagar, Orçamento por categoria, Metas, simulador e as dez calculadoras.' },
      { afirmacao: 'A relação com ações da NR-1 depende de avaliação técnica e não substitui o gerenciamento de riscos.', situacao: 'Confirmado como limite; redação à espera do advogado', nota: 'O produto não tem laudo, PGR, painel de risco nem avaliação clínica; a empresa nunca lê finanças, nem somadas (D-056).' },
      { afirmacao: 'Conheça a proposta para sua empresa.', situacao: 'Bloqueada', nota: 'O canal comercial ainda é marcador.' },
    ],
  },
  // =============================================================================================================================
  {
    id: 'P12',
    pasta: 'stories-e-ajuda-P12-duvida-de-acesso',
    dia: null,
    nome: 'Dúvida de acesso (Stories e destaque Ajuda)',
    formato: 'video-integrante',
    objetivo: 'Responder uma pergunta externa recorrente sobre acesso. No v2.2 a P12 sai do D27 (que é da B01) e fica nos Stories e no destaque Ajuda.',
    acao: 'Acessar ou pedir orientação pelo canal de ajuda confirmado.',
    familia: 'Humana e institucional',
    capa: { titulo: 'Dúvida de acesso', tag: 'Orientação inicial' },
    roteiro: [
      {
        fala:
          'Recebemos esta dúvida sobre a Clarevo: [pergunta real]. A orientação para esta versão é [resposta conferida]. Vou mostrar esse passo na tela. Se continuar com dificuldade, fale pelo canal de ajuda indicado no perfil. Não envie senha ou dados bancários.',
      },
    ],
    legenda: 'A dúvida de hoje é sobre o acesso. Confira o passo mostrado e a orientação atual no perfil. Para ajuda individual com o acesso, use o canal confirmado.',
    alt: 'Capa vertical em fundo azul com o título "Dúvida de acesso" e o quadro reservado à gravação com uma pessoa real da equipe (a escolher pela equipe).',
    ajustes: [
      'Os campos entre colchetes do roteiro ([pergunta real] e [resposta conferida]) são de produção: trocar pela pergunta real recebida e pela resposta conferida antes de gravar. Sem dúvida real ainda, identificar a peça como "orientação inicial".',
      'A legenda-base do Playbook traz o campo [tema]. Aqui o `legenda.txt` sai completo, com "o acesso" (o tema da P12); trocar o tema, se a dúvida recebida for outra, é tarefa da equipe e está em "O que depende da equipe".',
    ],
    depende: [
      'Uma dúvida efetivamente recebida e a resposta conferida pelo produto; pessoa integrante da equipe que conhece o fluxo, com autorização.',
      'Canal de ajuda e horário real de atendimento; não prometer resposta imediata. Nunca pedir senha nem dados bancários.',
      'Legenda: o `legenda.txt` está completo ("A dúvida de hoje é sobre o acesso"). Se a dúvida recebida for sobre outro tema, trocar "o acesso" pelo tema real. A frase "use o canal confirmado" só vale com o canal de ajuda definido.',
      'Roteiro: preencher [pergunta real] e [resposta conferida] com a dúvida recebida e a resposta que o produto conferiu (hoje, a da P03: acesso em preparação).',
    ],
    conferencia: [
      { afirmacao: 'A orientação para esta versão é [resposta conferida].', situacao: 'A preencher', nota: 'A resposta de acesso é a da P03 (acesso em preparação); o canal de ajuda é a definir.' },
      { afirmacao: 'Não envie senha ou dados bancários.', situacao: 'Confirmado', nota: 'O suporte nunca pede senha, cartão nem dados bancários.' },
    ],
    stories: [
      'Pergunta (enquete ou caixa de perguntas nativa do Instagram, nunca um desenho que simule a interação): "Você consegue comparar o que planejou com o que aconteceu?" Sem pedir valores pessoais.',
      'Explicação: um trecho real da peça do dia ou uma pessoa respondendo em uma frase.',
      'Ação: o link oficial conferido ou o fixado correspondente. Não anunciar acesso enquanto estiver em preparação.',
    ],
    respostas: [
      { situacao: 'Pergunta de acesso', resposta: 'A orientação atual está no destaque Comece aqui. Vou indicar o passo correto para o seu caso. (Confirmar antes o dispositivo e o destino.)' },
      { situacao: 'Pergunta de preço', resposta: 'Vou confirmar as condições atuais e enviar a orientação oficial. (Só preço vigente e conferido; hoje não há preço definido.)' },
      { situacao: 'Falha de uso', resposta: 'Em qual etapa ocorreu a dificuldade? Não envie senha ou dados financeiros. Vamos encaminhar pelo canal de ajuda.' },
      { situacao: 'Relato de dificuldade com dinheiro', resposta: 'Agradecemos por compartilhar. Podemos explicar o uso da Clarevo e os conteúdos do perfil. Para dúvidas sobre acesso, use o canal de ajuda indicado no perfil.' },
    ],
  },
  // =============================================================================================================================
  // Reserva de pautas (fora do calendário D1 a D30): o Playbook e o Manual trazem o texto, e a equipe usa no ciclo seguinte
  // ou no lugar de uma peça repetida.
  {
    id: 'R01',
    pasta: 'reserva-R01-calendario-do-mes',
    reserva: true,
    nome: 'O salário entrou: calendário visual',
    formato: 'carrossel',
    objetivo: 'Entender que o calendário participa da leitura do mês (exemplo regular com calendário visual, sem trend).',
    acao: 'Usar as perguntas na próxima revisão.',
    familia: 'Editorial educativa',
    paginas: [
      { modelo: 'calendarioCapa', titulo: 'O salário entrou. Quais contas ainda chegam este mês?' },
      {
        modelo: 'valoresGrandes',
        titulo: `Exemplo fictício: ${rs(ex.mes.recebido)} recebidos e ${rs(ex.mes.pago)} já pagos.`,
        valores: [
          { rotulo: 'Recebidos', texto: rs(ex.mes.recebido), valor: ex.mes.recebido },
          { rotulo: 'Já pagos', texto: rs(ex.mes.pago), valor: ex.mes.pago },
        ],
      },
      {
        modelo: 'calendario',
        titulo: `${rs(ex.mes.aPagar)} ainda a pagar neste mês.`,
        contas: ex.mes.contas.map((c) => ({ dia: c.dia, texto: rs(c.valor) })),
        nota: 'Mês do exemplo, datas ilustrativas.',
        chip: 'Exemplo fictício',
      },
      {
        modelo: 'equacaoBarra',
        equacao: [rs(ex.mes.recebido), '−', rs(ex.mes.pago), '−', rs(ex.mes.aPagar), '=', rs(ex.mes.diferenca)],
        titulo: 'Diferença após essas despesas.',
        corpo: 'Não é saldo disponível.',
        chip: 'Exemplo fictício',
      },
      {
        modelo: 'checklist',
        itens: ['Faltou algum registro?', 'Há outras despesas previstas?', 'Algum valor já está reservado?'],
        chamada: 'Use essas perguntas na sua próxima revisão.',
      },
    ],
    legenda:
      'Algumas contas já foram pagas; outras ainda vão vencer. Neste exemplo fictício, considerar as despesas informadas deixa uma diferença de R$ 850. Antes de decidir sobre esse valor, confira outros compromissos e registros. O calendário ajuda a enxergar quando as despesas chegam.',
    alt: [
      'Capa em fundo azul com um calendário parcial e um dia em destaque: "O salário entrou. Quais contas ainda chegam este mês?"',
      'Dois valores grandes em fundo claro: R$ 4.200 recebidos e R$ 2.550 já pagos. Exemplo fictício.',
      'Calendário do mês do exemplo, com datas ilustrativas: dia 15, conta de R$ 300; dia 22, conta de R$ 500. Texto: "R$ 800 ainda a pagar neste mês."',
      'Conta do exemplo: R$ 4.200 menos R$ 2.550 menos R$ 800 igual a R$ 850, e uma barra de 100% com as três partes: 60,7% pago, 19,0% a pagar e 20,2% diferença (percentuais arredondados, somam 99,9%). Texto: "Diferença após essas despesas. Não é saldo disponível."',
      'Lista de perguntas: Faltou algum registro? Há outras despesas previstas? Algum valor já está reservado? Texto: "Use essas perguntas na sua próxima revisão."',
    ],
    ajustes: [
      'A página 4 traz também a barra de 100% do Manual (exemplo A): 60,714% pago, 19,048% a pagar e 20,238% diferença, que somam 100%; arredondados a uma casa, 60,7%, 19,0% e 20,2% somam 99,9%, e a página diz isso.',
      'A conta é do exemplo: no app a "Diferença do mês" é Recebido menos Pago (aqui, R$ 1.650) e o "Ainda a pagar" fica à parte. Nunca chamar a diferença desta peça de "Diferença do mês" nem mostrar tela do app com o calendário editorial.',
    ],
    depende: ['Peça de reserva: a equipe decide a data. Montar no Canva e publicar.'],
    conferencia: [
      { afirmacao: 'R$ 4.200 − R$ 2.550 − R$ 800 = R$ 850, diferença após essas despesas.', situacao: 'Exemplo fictício, conta conferida', nota: 'Rotular como diferença do exemplo; o app tem outra conta (Diferença do mês é só Recebido menos Pago) e não mostra saldo.' },
    ],
  },
  {
    id: 'B',
    pasta: 'reserva-B-a-vista-ou-em-10-parcelas',
    reserva: true,
    nome: 'À vista ou em 10 parcelas?',
    formato: 'carrossel',
    objetivo: 'Conteúdo de consulta e compartilhamento: comparar custo e prazo de uma compra (exemplo B do Manual).',
    acao: 'Guardar o roteiro para consultar antes de comparar propostas.',
    familia: 'Editorial educativa',
    paginas: [
      { modelo: 'capaAzul', titulo: 'À vista ou em *10 parcelas*?', sub: 'A parcela pode caber no mês. O custo total merece atenção.' },
      {
        modelo: 'duasCondicoes',
        titulo: `Mesmo produto: à vista ${rs(ex.dezParcelas.aVista)}; parcelado ${ex.dezParcelas.parcelas} × ${rs(ex.dezParcelas.valorParcela)} = ${rs(ex.dezParcelas.total)}.`,
        aVista: { rotulo: 'À vista', valor: ex.dezParcelas.aVista, texto: rs(ex.dezParcelas.aVista) },
        parcelado: { rotulo: `${ex.dezParcelas.parcelas} × ${rs(ex.dezParcelas.valorParcela)}`, valor: ex.dezParcelas.total, texto: rs(ex.dezParcelas.total) },
        diferenca: `+ ${rs(ex.dezParcelas.diferenca)}`,
        chip: 'Exemplo fictício',
      },
      {
        modelo: 'texto',
        titulo: `Diferença nominal de ${rs(ex.dezParcelas.diferenca)}: ${ex.dezParcelas.percentualSobreAVista}% acima do preço à vista.`,
        corpo: 'Não é taxa de juros mensal nem CET.',
        chip: 'Exemplo fictício',
      },
      { modelo: 'chipsTexto', titulo: 'Critérios para comparar:', chips: ['Quais compromissos já existem?', 'Há taxas?', 'O dinheiro à vista comprometeria outro objetivo?'], grande: true },
      { modelo: 'final', titulo: 'Compare custo e prazo com o contexto da sua vida. Na Clarevo, a calculadora *Parcelado ou à vista?* pode apoiar essa avaliação.' },
    ],
    legenda:
      'Duas condições de pagamento podem parecer semelhantes quando olhamos somente para a parcela.\n\nConsidere um produto anunciado por R$ 1.000 à vista ou em 10 pagamentos de R$ 120. O parcelamento soma R$ 1.200. A diferença nominal é de R$ 200, equivalente a 20% do preço à vista. Isso não corresponde, automaticamente, à taxa de juros mensal ou ao Custo Efetivo Total.\n\nA melhor escolha depende das condições da oferta e do que já está comprometido no seu orçamento. Pagar à vista pode reduzir o custo, mas também pode consumir uma reserva necessária. Parcelar distribui os pagamentos no tempo, mas cria compromissos futuros.\n\nO exemplo serve para comparar. A decisão deve considerar suas prioridades e os detalhes reais da proposta.',
    alt: [
      'Capa em fundo azul: "À vista ou em 10 parcelas? A parcela pode caber no mês. O custo total merece atenção."',
      'Duas barras horizontais, a partir de zero e na mesma escala: à vista R$ 1.000; parcelado, 10 vezes de R$ 120, R$ 1.200. Exemplo fictício.',
      'Texto "Diferença nominal de R$ 200: 20% acima do preço à vista. Não é taxa de juros mensal nem CET."',
      'Três perguntas para comparar: quais compromissos já existem? Há taxas? O dinheiro à vista comprometeria outro objetivo?',
      'Fundo azul: "Compare custo e prazo com o contexto da sua vida. Na Clarevo, a calculadora Parcelado ou à vista? pode apoiar essa avaliação."',
    ],
    ajustes: ['Do Manual v2.2, exemplo B. A conclusão cita a calculadora "Parcelado ou à vista?", a do app e do site que compara pagar à vista e parcelado (e não "Antes de financiar", que é a conta da parcela, dos juros e do peso na renda de um financiamento).'],
    depende: [
      'Peça de reserva (alternativa a uma peça repetida). Não afirmar CET nem juros mensais sem dados adicionais.',
      'Se a equipe citar o resultado da calculadora "Parcelado ou à vista?", dizer que a taxa que ela mostra é a que iguala as parcelas ao preço à vista, em juros compostos; não é CET.',
    ],
    conferencia: [
      { afirmacao: '10 × R$ 120 = R$ 1.200; diferença nominal de R$ 200, 20% sobre o preço à vista.', situacao: 'Exemplo fictício, conta conferida', nota: 'Não afirmar CET ou juros mensais.' },
      { afirmacao: 'Na Clarevo, a calculadora Parcelado ou à vista? pode apoiar essa avaliação.', situacao: 'Confirmado', nota: 'A calculadora "Parcelado ou à vista?" (grupo Compra do catálogo) existe no app e no site e compara o preço à vista com o parcelado.' },
    ],
  },
  {
    id: 'F01',
    pasta: 'reserva-F01-5-perguntas-para-organizar-o-mes',
    reserva: true,
    nome: '5 perguntas para organizar o mês',
    formato: 'carrossel',
    objetivo: 'Pauta F01 do Playbook: organizar o mês sem tentar resolver tudo de uma vez.',
    acao: 'Escolher uma pergunta e começar por ela; salvar para a próxima revisão.',
    familia: 'Fotográfica cotidiana e editorial',
    paginas: [
      { modelo: 'capaFoto', titulo: '5 perguntas para organizar o mês sem tentar resolver tudo de uma vez', cena: CENAS.f01Capa },
      { modelo: 'numeroPergunta', numero: 1, total: 5, titulo: 'O que vence primeiro?' },
      { modelo: 'numeroPergunta', numero: 2, total: 5, titulo: 'O que já foi pago?' },
      { modelo: 'numeroPergunta', numero: 3, total: 5, titulo: 'Qual despesa ainda falta registrar?' },
      { modelo: 'numeroPergunta', numero: 4, total: 5, titulo: 'O que mudou na renda ou nas contas?' },
      { modelo: 'numeroPergunta', numero: 5, total: 5, titulo: 'Qual ajuste é possível agora?' },
      { modelo: 'final', titulo: 'Escolha uma *pergunta* e comece por ela.' },
    ],
    legenda:
      'Organizar o mês não precisa começar por tudo ao mesmo tempo. Estas cinco perguntas ajudam a olhar uma parte de cada vez: o que vence primeiro, o que já foi pago, o que falta registrar, o que mudou na renda ou nas contas e qual ajuste é possível agora. Escolha uma pergunta e comece por ela. Salve para consultar na próxima revisão.',
    alt: [
      'Capa com cena de rotina (foto real a escolher pela equipe) e o texto "5 perguntas para organizar o mês sem tentar resolver tudo de uma vez".',
      'Pergunta 1 de 5: "O que vence primeiro?"',
      'Pergunta 2 de 5: "O que já foi pago?"',
      'Pergunta 3 de 5: "Qual despesa ainda falta registrar?"',
      'Pergunta 4 de 5: "O que mudou na renda ou nas contas?"',
      'Pergunta 5 de 5: "Qual ajuste é possível agora?"',
      'Fundo azul com o texto "Escolha uma pergunta e comece por ela."',
    ],
    ajustes: ['A legenda é nova (o Playbook traz a pauta, sem legenda), só com frases da própria pauta.'],
    depende: ['Peça de reserva (ciclo seguinte ou no lugar de uma peça repetida). Foto real de rotina na capa, com autorização.'],
    conferencia: [{ afirmacao: 'Sem afirmação sobre o app.', situacao: 'Sem afirmação sobre o app', nota: 'Pauta educativa; as perguntas valem com ou sem o app.' }],
  },
  {
    id: 'F02',
    pasta: 'reserva-F02-conversar-sobre-as-contas-da-casa',
    reserva: true,
    nome: 'Conversar sobre as contas da casa',
    formato: 'carrossel',
    objetivo: 'Pauta F02 do Playbook: conversar sobre as contas da casa sem começar pela cobrança.',
    acao: 'Guardar o roteiro para preparar a conversa.',
    familia: 'Fotográfica cotidiana e editorial',
    paginas: [
      { modelo: 'capaFoto', titulo: 'Como conversar sobre as contas da casa sem começar pela cobrança?', cena: CENAS.f02Capa },
      { modelo: 'numeroPergunta', numero: 1, total: 4, titulo: 'Combine um momento.', passo: true },
      { modelo: 'numeroPergunta', numero: 2, total: 4, titulo: 'Reúna as despesas compartilhadas.', passo: true },
      { modelo: 'numeroPergunta', numero: 3, total: 4, titulo: 'Ouça as prioridades de cada pessoa.', passo: true },
      { modelo: 'numeroPergunta', numero: 4, total: 4, titulo: 'Defina um acordo possível e quando rever.', passo: true },
      { modelo: 'final', titulo: 'Guarde este *roteiro* para preparar a conversa.', corpo: 'Cada casa divide renda e responsabilidades do seu jeito.' },
    ],
    legenda:
      'Falar de contas em casa pode começar de outro jeito: combinando um momento, reunindo as despesas compartilhadas, ouvindo as prioridades de cada pessoa e definindo um acordo possível, com uma data para rever. Cada casa divide renda e responsabilidades do seu jeito. Guarde este roteiro para preparar a conversa.',
    alt: [
      'Capa com cena de casa (foto real a escolher pela equipe) e o texto "Como conversar sobre as contas da casa sem começar pela cobrança?"',
      'Passo 1 de 4: "Combine um momento."',
      'Passo 2 de 4: "Reúna as despesas compartilhadas."',
      'Passo 3 de 4: "Ouça as prioridades de cada pessoa."',
      'Passo 4 de 4: "Defina um acordo possível e quando rever."',
      'Fundo azul: "Guarde este roteiro para preparar a conversa. Cada casa divide renda e responsabilidades do seu jeito."',
    ],
    ajustes: ['Os passos do Playbook ("combinar um momento; reunir...") viraram imperativos, e "não supor que toda família divide renda do mesmo modo" virou a frase "Cada casa divide renda e responsabilidades do seu jeito". A legenda é nova.'],
    depende: [
      'Peça de reserva. Foto real de casa na capa, com autorização de imagem.',
      'Se a peça passar a citar a Família da Clarevo (D-055), conferir antes: a demonstração não tem Família de exemplo e não há gravação.',
    ],
    conferencia: [{ afirmacao: 'Sem afirmação sobre o app.', situacao: 'Sem afirmação sobre o app', nota: 'Pauta educativa sobre conversa em casa; não cita a Família do app.' }],
  },
];

// ---------------------------------------------------------------------------------------------------------------------------------
// Calendário D1 a D30 (Playbook v2.2)
// ---------------------------------------------------------------------------------------------------------------------------------
/** tipos: preparo, carrossel, reel, integrante, trend, revisao, escuta, livre, decisao. */
const CALENDARIO = [
  { dia: 1, tipo: 'preparo', peca: 'Conta', formato: 'Configuração', objetivo: 'Perfil seguro e da Clarevo', acao: 'Confirmar identificador, contato de recuperação da equipe, autenticação em duas etapas e quem administra, publica e responde.', depende: 'Equipe: conta, acessos e responsáveis; guardar acessos em local restrito.' },
  { dia: 2, tipo: 'preparo', peca: 'Perfil', formato: 'Configuração', objetivo: 'Primeira visita clara', acao: 'Subir avatar, nome, bio e link; criar os destaques; testar o link no navegador do Instagram.', depende: 'Equipe: publicar; conferir o limite do nome na conta e o link da bio.' },
  { dia: 3, tipo: 'preparo', peca: 'Produto', formato: 'Conferência', objetivo: 'Acesso e primeira tarefa conferidos', acao: 'Conferir a oferta (acesso em preparação), a demonstração e a primeira tarefa; preencher a ficha de acesso.', depende: 'Produto: responsável a designar, versão e data do teste. Proprietária: oferta.' },
  { dia: 4, tipo: 'preparo', peca: 'P01 a P03', formato: 'Produção', objetivo: 'Três fixados prontos', acao: 'Montar P01, P02 e P03 no Canva e no Edits, com texto e telas conferidos; preparar Stories de apoio; conferir a leitura no celular.', depende: 'Marketing: Canva e Edits. Fotos reais da P01. Revisão da conferência.' },
  { dia: 5, tipo: 'carrossel', peca: 'P01', formato: 'Carrossel fixado, 6 páginas', objetivo: 'Compreensão do produto', acao: 'Ver o fixado Clarevo na prática (P02).', depende: 'Fotos reais; publicar e fixar; Stories de apoio levando à peça.' },
  { dia: 6, tipo: 'reel', peca: 'P02', formato: 'Reel fixado', objetivo: 'Mostrar uma tarefa real', acao: 'Ver no perfil as informações de acesso (fixado P03).', depende: 'Edição final no Edits; gravação refeita se a versão mudou; publicar e fixar.' },
  { dia: 7, tipo: 'carrossel', peca: 'P03', formato: 'Carrossel fixado, 5 páginas', objetivo: 'Orientar a oferta atual', acao: 'Link da bio ou aviso de disponibilidade.', depende: 'Ficha de acesso preenchida; link conferido; publicar e fixar.' },
  { dia: 8, tipo: 'livre', peca: 'Stories', formato: 'Stories de apoio', objetivo: 'Contexto e escuta', acao: 'Stories com a sequência de apoio (pergunta, explicação, ação) levando ao fixado.', depende: 'Marketing: Stories com recursos nativos (enquete e caixa de perguntas).' },
  { dia: 9, tipo: 'carrossel', peca: 'P04', formato: 'Carrossel, 5 páginas', objetivo: 'Entender a diferença', acao: 'Salvar a sequência de conferência.', depende: 'Montar no Canva; publicar; registrar salvamentos.' },
  { dia: 10, tipo: 'livre', peca: 'Stories', formato: 'Stories de apoio', objetivo: 'Contexto e escuta', acao: 'Stories de apoio à P04; ler e responder perguntas em dia útil.', depende: 'Quem responde: rotina de leitura e horário real de atendimento.' },
  { dia: 11, tipo: 'reel', peca: 'P05', formato: 'Reel', objetivo: 'Demonstrar orçamento', acao: 'Ver no perfil as informações de acesso (acesso em preparação).', depende: 'Fluxo validado na versão atual; edição final; publicar.' },
  { dia: 12, tipo: 'livre', peca: 'Stories', formato: 'Stories de apoio', objetivo: 'Contexto e escuta', acao: 'Stories de apoio à P05; pesquisar a referência de trend para o D13 (revisão semanal).', depende: 'Marketing: shortlist com link e data da referência, direitos e alternativa perene.' },
  { dia: 13, tipo: 'integrante', peca: 'P06 ou T01', formato: 'Posição flexível de trend', objetivo: 'Identificação e conversa', acao: 'Uma pergunta específica. T01 (carrossel de post reproduzido) se houver trend adequada; senão, P06 (pergunta da integrante, em vídeo real).', depende: 'Decisão até 48 horas antes; gravação com integrante real e autorização (P06); ficha de referência (T01).' },
  { dia: 14, tipo: 'revisao', peca: 'Revisão D14', formato: 'Reunião curta', objetivo: 'Compreensão, visitas, acessos, cadastros e primeira tarefa', acao: 'Conferir os números do painel do Instagram e as contagens do app; anotar a pergunta externa mais frequente e o principal obstáculo.', depende: 'Equipe: relatório semanal; "não medido" onde não houver dado.' },
  { dia: 15, tipo: 'escuta', peca: 'Stories', formato: 'Stories e escuta', objetivo: 'Recolher dúvidas', acao: 'Caixa de perguntas nativa: qual parte você gostaria de entender melhor? Sem dados pessoais.', depende: 'Quem responde; a resposta padrão da equipe.' },
  { dia: 16, tipo: 'carrossel', peca: 'P07', formato: 'Carrossel, 5 páginas', objetivo: 'Comparar compromisso e preço', acao: 'Guardar o roteiro de perguntas.', depende: 'Montar no Canva; publicar; registrar salvamentos e compartilhamentos.' },
  { dia: 17, tipo: 'livre', peca: 'Stories', formato: 'Stories de apoio', objetivo: 'Contexto e escuta', acao: 'Stories de apoio à P07.', depende: 'Marketing.' },
  { dia: 18, tipo: 'reel', peca: 'P08', formato: 'Reel', objetivo: 'Demonstrar o fluxo de meta', acao: 'Ver no perfil as informações de acesso (acesso em preparação).', depende: 'Fluxo validado; edição final; publicar.' },
  { dia: 19, tipo: 'livre', peca: 'Stories', formato: 'Stories de apoio', objetivo: 'Contexto e escuta', acao: 'Stories de apoio à P08; pesquisar a referência de trend para o D20.', depende: 'Marketing: shortlist da referência, direitos e alternativa perene.' },
  { dia: 20, tipo: 'integrante', peca: 'P09 ou T02', formato: 'Posição flexível de trend', objetivo: 'Reconhecimento e reflexão', acao: 'Salvar ou comentar a experiência. T02 (formato em circulação escolhido na revisão semanal) ou, como alternativa perene, P09 (observação do contexto de uma compra).', depende: 'Decisão até 48 horas antes; gravação com integrante real, função confirmada e autorização (P09).' },
  { dia: 21, tipo: 'revisao', peca: 'Revisão D21', formato: 'Reunião curta', objetivo: 'Que explicação repetir e que atrito corrigir no acesso ou no app', acao: 'Decidir o que repetir e corrigir.', depende: 'Equipe; produto para o atrito encontrado.' },
  { dia: 22, tipo: 'escuta', peca: 'Stories', formato: 'Stories e escuta', objetivo: 'Recolher dúvidas', acao: 'Caixa de perguntas nativa; transformar dúvidas recorrentes em pauta.', depende: 'Quem responde.' },
  { dia: 23, tipo: 'carrossel', peca: 'P10', formato: 'Carrossel, 6 páginas', objetivo: 'Ensinar a revisar o orçamento', acao: 'Fazer a revisão com seus registros.', depende: 'Conferir período e campos da captura; montar no Canva; publicar.' },
  { dia: 24, tipo: 'livre', peca: 'Stories', formato: 'Stories de apoio', objetivo: 'Contexto e escuta', acao: 'Stories de apoio à P10.', depende: 'Marketing.' },
  { dia: 25, tipo: 'reel', peca: 'P11', formato: 'Reel', objetivo: 'Reduzir dúvida de começo', acao: 'Concluir a primeira tarefa.', depende: 'Canal de ajuda definido para o destaque Ajuda; gravação refeita se a versão mudou; publicar.' },
  { dia: 26, tipo: 'livre', peca: 'Stories', formato: 'Stories de apoio', objetivo: 'Contexto e escuta', acao: 'Stories de apoio à P11 e preparação da B01.', depende: 'Canal comercial e revisão técnica de saúde e NR-1 em andamento.' },
  { dia: 27, tipo: 'carrossel', peca: 'B01', formato: 'Carrossel, 5 páginas', objetivo: 'Apresentar o benefício', acao: 'Solicitar apresentação pelo canal conferido.', depende: 'BLOQUEADA sem canal comercial conferido e sem revisão técnica (saúde e NR-1) e do advogado; só então o destaque Para empresas.' },
  { dia: 28, tipo: 'revisao', peca: 'Revisão D28', formato: 'Reunião curta', objetivo: 'O que trouxe perguntas externas, cadastros e primeira tarefa', acao: 'Comparar os números; separar equipe e pessoas de fora.', depende: 'Equipe; contagens do app lidas pela equipe no SQL Editor.' },
  { dia: 29, tipo: 'escuta', peca: 'Stories e revisão D29', formato: 'Stories, escuta e reunião', objetivo: 'Quais temas repetir e quais peças refazer', acao: 'Recolher dúvidas e revisar as peças.', depende: 'Equipe.' },
  { dia: 30, tipo: 'decisao', peca: 'Revisão D30', formato: 'Decisão', objetivo: 'Há evidência para ampliar a distribuição?', acao: 'Decidir temas a repetir, ajustes de acesso e cadência do próximo ciclo. Antes de ampliar: destino funcionando, cadastro e primeira tarefa observados, mensagem compreendida por pessoas de fora e origem identificada.', depende: 'Proprietária e equipe.' },
];

module.exports = { PERFIL, DESTAQUES, CENAS, PESSOA, TERMOS_DO_APP, PECAS, CALENDARIO, GRAVACOES, COM_ACESSO_EM_PREPARACAO, R, rs, rsc };
