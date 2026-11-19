/**
 * Notícias do site (D-117, `docs/22_SITE.md`, seção 18): as fontes, num só lugar. O worker do site (`/api/noticias`) só busca os
 * endereços desta lista, nunca um endereço que venha do pedido de quem visita, de um feed ou de uma matéria.
 *
 * Regra de licença de cada fonte (decisão do Enzo com o estudo "Bolsa no site e aba Investir", 19/11/2026, Lei 9.610/1998):
 * - `texto_completo`: a licença da fonte permite mostrar o texto inteiro no site, sem alterações e com crédito. Vale para a Agência Brasil
 *   só nas matérias com crédito da própria Agência Brasil (as de parceiros, como Reuters, TV Brasil e Rádio Nacional, ou com "com
 *   informações de", ficam só com resumo) e para o gov.br (CC BY-ND 3.0, ao pé da letra, nunca editado). O texto só aparece se o feed
 *   trouxer a matéria inteira: os feeds do gov.br trazem só a linha fina, então as notícias deles levam "Ler na fonte".
 * - `so_resumo`: tudo o mais, inclusive os portais privados. A página mostra título, data, nome da fonte, o resumo curto do próprio feed
 *   (cortado em até duas frases, nunca o corpo da matéria) e "Ler na fonte".
 *
 * Portais privados: a lista começa vazia (o Enzo escolhe depois). Um portal privado sempre fica em `so_resumo`, seja qual for a licença
 * escrita aqui (`licencaEfetiva`).
 */

export type LicencaNoticias = 'texto_completo' | 'so_resumo';
export type TipoDeFonte = 'publica' | 'privada';

export interface FonteNoticias {
  /** Identificador estável da fonte (o `id` de cada notícia vem do link dela, não daqui). */
  id: string;
  /** O nome que a página mostra, sempre como crédito ("Agência Brasil", "Banco Central do Brasil"). */
  nome: string;
  /** A página de notícias da fonte, para "leia direto nas fontes" (link de texto, sem carregar nada). */
  site: string;
  /** O endereço do feed (RSS 2.0, RSS 1.0 ou Atom), conferido à mão. Só `https://`. */
  feed: string;
  /** Os hosts que os links das notícias podem ter (uma notícia com link para outro host é descartada). */
  hosts: readonly string[];
  tipo: TipoDeFonte;
  licenca: LicencaNoticias;
  /** Conferência de crédito por notícia: `agencia-brasil` só deixa o texto inteiro para matéria assinada pela própria Agência Brasil. */
  credito?: 'agencia-brasil';
  /**
   * A fonte põe a matéria inteira no `description` do RSS (a Agência Brasil): ele é sempre o corpo, mesmo curto, e nunca vira o resumo de
   * uma notícia que fica só com título e link.
   */
  descricaoEhCorpo?: boolean;
  /** A linha de licença que a página de leitura mostra (e a lista, em "De onde vêm as notícias"). */
  linhaDeLicenca: string;
  /** Quando e como o feed foi conferido. */
  conferido: string;
}

/** As fontes públicas (19/11/2026). Para mudar uma fonte, mude aqui e rode os testes do núcleo (`noticias.test.ts`). */
export const FONTES_PUBLICAS: readonly FonteNoticias[] = [
  {
    id: 'agencia-brasil-economia',
    nome: 'Agência Brasil',
    site: 'https://agenciabrasil.ebc.com.br/economia',
    feed: 'https://agenciabrasil.ebc.com.br/rss/economia/feed.xml',
    hosts: ['agenciabrasil.ebc.com.br'],
    tipo: 'publica',
    licenca: 'texto_completo',
    credito: 'agencia-brasil',
    descricaoEhCorpo: true,
    linhaDeLicenca:
      'Texto da Agência Brasil (EBC), reproduzido sem alterações e com o crédito da autoria. A formatação foi simplificada, e fotos, vídeos e tabelas ficam só na matéria original.',
    conferido: 'RSS 2.0, 19/11/2026: 10 matérias da editoria de Economia, com o texto inteiro em <description> (HTML escapado), autoria em <dc:creator>, data em <pubDate> e assuntos em <category>.',
  },
  {
    id: 'bcb-noticias',
    nome: 'Banco Central do Brasil',
    site: 'https://www.bcb.gov.br/',
    feed: 'https://www.bcb.gov.br/api/feed/sitebcb/sitefeeds/noticias',
    hosts: ['www.bcb.gov.br'],
    tipo: 'publica',
    // O site do Banco Central não é o portal gov.br, e a licença dele para uso por empresa não foi confirmada (pergunta 57).
    licenca: 'so_resumo',
    linhaDeLicenca: 'Notícia do Banco Central do Brasil. Para ler o texto, abra a página do Banco Central.',
    conferido: 'Atom, 19/11/2026: 10 notícias, com o texto inteiro em <content type="html"> (links relativos ao site do Banco Central), data em <updated>, sem autoria nem resumo.',
  },
  {
    id: 'bcb-notas',
    nome: 'Banco Central do Brasil',
    site: 'https://www.bcb.gov.br/',
    feed: 'https://www.bcb.gov.br/api/feed/sitebcb/sitefeeds/notasImprensa',
    hosts: ['www.bcb.gov.br'],
    tipo: 'publica',
    licenca: 'so_resumo',
    linhaDeLicenca: 'Nota à imprensa do Banco Central do Brasil. Para ler o texto, abra a página do Banco Central.',
    conferido: 'Atom, 19/11/2026: 10 notas à imprensa, no mesmo formato das notícias do Banco Central.',
  },
  {
    id: 'receita-federal',
    nome: 'Receita Federal',
    site: 'https://www.gov.br/receitafederal/pt-br/assuntos/noticias',
    feed: 'https://www.gov.br/receitafederal/pt-br/assuntos/noticias/ultimas-noticias/atom.xml',
    hosts: ['www.gov.br'],
    tipo: 'publica',
    licenca: 'texto_completo',
    linhaDeLicenca: 'Conteúdo do gov.br, publicado sob a licença Creative Commons Atribuição-SemDerivações 3.0 (CC BY-ND 3.0), reproduzido sem alterações e com crédito.',
    conferido: 'Atom, 19/11/2026: 15 notícias, só com a linha fina em <summary> (sem o texto inteiro), autoria em <author><name>, data em <published>.',
  },
  {
    id: 'ministerio-da-fazenda',
    nome: 'Ministério da Fazenda',
    site: 'https://www.gov.br/fazenda/pt-br/assuntos/noticias',
    feed: 'https://www.gov.br/fazenda/pt-br/search_rss?portal_type=collective.nitf.content&sort_on=effective&sort_order=reverse',
    hosts: ['www.gov.br'],
    tipo: 'publica',
    licenca: 'texto_completo',
    linhaDeLicenca: 'Conteúdo do gov.br, publicado sob a licença Creative Commons Atribuição-SemDerivações 3.0 (CC BY-ND 3.0), reproduzido sem alterações e com crédito.',
    conferido:
      'RSS 1.0 (RDF), 19/11/2026: a busca de notícias do próprio portal (as páginas de notícias do ministério não têm feed), 15 notícias, só com a linha fina em <description>, data em <dc:date> no formato "2026/11/19 11:25:40 GMT-3".',
  },
];

/**
 * Portais privados (o Enzo escolhe depois). Cada um entra com `tipo: 'privada'`; a licença efetiva é sempre `so_resumo`: título, data,
 * nome do portal, o resumo curto do próprio feed (até duas frases) e "Ler na fonte". Nunca o corpo da matéria.
 */
export const PORTAIS_PRIVADOS: readonly FonteNoticias[] = [];

/** Todas as fontes que o worker busca, na ordem de preferência quando a mesma notícia vem de duas. */
export const FONTES_NOTICIAS: readonly FonteNoticias[] = [...FONTES_PUBLICAS, ...PORTAIS_PRIVADOS];

/** A licença que vale de fato: portal privado é sempre `so_resumo`. */
export const licencaEfetiva = (fonte: FonteNoticias): LicencaNoticias => (fonte.tipo === 'publica' ? fonte.licenca : 'so_resumo');

/**
 * Proteção contra SSRF: o endereço é exatamente o feed de uma fonte configurada, com `https://` e host de uma das fontes? O atendimento
 * confere isto antes de cada busca, e nenhum endereço que venha do pedido, de um feed ou de uma matéria é buscado.
 */
export function feedPermitido(url: string, fontes: readonly FonteNoticias[] = FONTES_NOTICIAS): boolean {
  if (typeof url !== 'string' || url.length > 500) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.username !== '' || u.password !== '' || u.port !== '') return false;
  return fontes.some((f) => f.feed === url && f.hosts.includes(u.hostname) && new URL(f.feed).hostname === u.hostname);
}

/** As fontes como a página mostra ("leia direto nas fontes"): uma por nome e página, na ordem da lista. */
export function fontesParaLer(fontes: readonly FonteNoticias[] = FONTES_NOTICIAS): { nome: string; site: string; licenca: LicencaNoticias }[] {
  const vistas = new Map<string, { nome: string; site: string; licenca: LicencaNoticias }>();
  for (const f of fontes) {
    const chave = `${f.nome}|${f.site}`;
    if (!vistas.has(chave)) vistas.set(chave, { nome: f.nome, site: f.site, licenca: licencaEfetiva(f) });
  }
  return [...vistas.values()];
}

/** Os temas que a página acompanha (finanças pessoais), com o rótulo. As palavras de cada tema ficam em `filtro.ts`. */
export const TEMAS_NOTICIAS = {
  juros: 'Juros e Selic',
  inflacao: 'Inflação',
  'imposto-de-renda': 'Imposto de Renda',
  pix: 'Pix e pagamentos',
  credito: 'Crédito e dívidas',
  golpes: 'Golpes e fraudes',
  fgc: 'FGC',
  'tesouro-e-poupanca': 'Tesouro Direto e poupança',
  salario: 'Salário e 13º',
} as const;
export type TemaNoticia = keyof typeof TEMAS_NOTICIAS;

/** Os textos das páginas de notícias (lista e leitura). O script da página só mostra e esconde o que já vem no HTML. */
export const NOTICIAS_TEXT = {
  titulo: 'Notícias',
  descricao: 'Notícias de fontes públicas sobre juros, inflação, Imposto de Renda, Pix, crédito, golpes e poupança, com a fonte e o link de cada uma.',
  lead: 'Notícias de fontes públicas sobre juros, inflação, Imposto de Renda, Pix, crédito, golpes, FGC, Tesouro Direto, poupança e salário, com a fonte e o link de cada uma.',
  tituloDaLista: 'Últimas notícias',
  carregando: 'Carregando as notícias.',
  semJavaScript: 'A lista de notícias usa JavaScript. Você também pode ler direto nas fontes:',
  emBreve: 'Em breve. As notícias de fontes públicas ainda não estão ligadas neste site. Enquanto isso, você pode ler direto nas fontes:',
  falha: 'Não foi possível carregar as notícias agora. Tente de novo mais tarde ou leia direto nas fontes:',
  vazia: 'Nenhuma notícia dos temas acompanhados por enquanto. Você pode ler direto nas fontes:',
  lerAqui: 'Ler aqui',
  lerNaFonte: 'Ler na fonte',
  tituloDeOnde: 'De onde vêm as notícias',
  deOnde:
    'O servidor da Clarevo lê os feeds públicos da Agência Brasil, do Banco Central do Brasil, da Receita Federal e do Ministério da Fazenda e mostra só os temas de finanças pessoais. Notícias sobre ações, bolsa, empresas listadas ou dicas de investimento ficam de fora. O navegador de quem visita só fala com o próprio site da Clarevo.',
  comoLer:
    'Quando a licença da fonte permite, o texto aparece aqui, sem alterações e com o crédito, em "Ler aqui". Nos outros casos, a página mostra o título, a data, a fonte e um resumo curto do próprio feed, e o texto fica na fonte, em "Ler na fonte". Imagens de outros sites nunca aparecem aqui.',
  regraTextoCompleto: 'o texto pode aparecer aqui quando o feed traz a matéria inteira',
  regraSoResumo: 'só título, data, link e, quando o feed traz, um resumo curto',
  tituloDasFontes: 'As fontes',
  tituloDosResumos: 'Resumos da semana',
  // Página de leitura.
  tituloDaMateria: 'Notícia',
  descricaoDaMateria: 'O texto de uma notícia de fonte pública, com a fonte, a data, a autoria e o link para a matéria original.',
  materiaCarregando: 'Carregando a notícia.',
  materiaSemJavaScript: 'Esta página mostra o texto de uma notícia e usa JavaScript. Veja a lista de notícias ou leia direto nas fontes:',
  materiaFalha: 'Não foi possível carregar a notícia agora. Tente de novo mais tarde, veja a lista de notícias ou leia direto nas fontes:',
  materiaNaoEncontrada: 'Esta notícia não está mais disponível aqui. Ela pode ter saído da lista ou ser de uma fonte que só permite o resumo. Veja a lista de notícias ou leia direto nas fontes:',
  verOriginal: 'Ver a matéria original',
  verTodas: 'Ver todas as notícias',
  notaDaMateria: 'O texto é da fonte indicada no alto da página. A Clarevo não muda o conteúdo e não responde pelo que a fonte publica.',
} as const;
