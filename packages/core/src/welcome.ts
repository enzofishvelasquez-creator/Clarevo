import { ACCESS_TEXT, SUBSCRIBE_OPEN, TRIAL_DAYS } from './plano';

/**
 * Primeiro uso (D-125, Onda 1, itens 8 e 9 do estudo de 25/11/2026): as boas-vindas dizem o teste grátis e têm um caminho principal
 * ("Criar conta") e um segundo à vista ("Ver a demonstração"); entrar e o convite da empresa continuam como links menores. O primeiro passo
 * da conta nova ("Sua primeira conta") oferece, ao lado de criar a conta, os dois jeitos de começar com menos digitação que o app já tem:
 * importar o extrato, a fatura ou um print, e anotar por mensagem no Telegram. Conta nova continua sem nenhum dado de exemplo.
 */
/**
 * A demonstração na web (dados fictícios, acesso simulado), o mesmo endereço que o site usa em "Ver a demonstração" (`URL_DEMO` de
 * `scripts/site/config.js`; teste em guide.test). Na versão publicada do app, "Ver a demonstração" das boas-vindas abre este endereço no
 * navegador; no build de demonstração, o botão entra direto na conta de demonstração.
 */
export const DEMO_URL = 'https://demo.clarevo.app.br';

/**
 * Marca do botão "Ver a demonstração" só no build de demonstração (`data-testid` na web). Os roteiros de gravação (`scripts/video-demonstracao.js`,
 * `scripts/gravar-videos-site.js` e `scripts/gravar-redes.js`) conferem por ela que `apps/app/dist` é o build de demonstração: o botão com o
 * mesmo nome também existe na versão publicada, onde abre a demonstração da web.
 */
export const DEMO_ENTRY_TEST_ID = 'entrar-na-demonstracao';

export const WELCOME_TEXT = {
  /**
   * O título (D-128, Enzo, 26/11/2026, revisão da D-126): de novo a frase central da marca (D-068), o mesmo título da página inicial do site
   * e a mensagem central da ficha das lojas, sem nenhuma frase pequena acima dele.
   */
  title: 'Cuidar da vida financeira faz parte de cuidar de você.',
  /** O benefício concreto, logo abaixo do título (D-128): a primeira frase do subtítulo do site e a primeira linha das descrições das lojas. */
  subtitle: 'Contas, cartões e gastos do mês em ordem, com o pessoal, a família e o negócio separados.',
  /** O teste grátis (D-083): sem cartão. */
  trial: `${TRIAL_DAYS} dias grátis, sem cartão`,
  /** O que acontece depois do teste, sem pressão (D-083: sem assinatura, só ver e exportar). */
  trialNote: 'Depois, sem assinar, você continua vendo e exportando o que anotou.',
  privacy: 'Seus registros pessoais são só seus. Se uma empresa oferecer o plano, ela não vê suas finanças.',
  create: 'Criar conta',
  demo: 'Ver a demonstração',
  demoNote: 'Com dados fictícios, sem criar conta.',
  demoOpening: 'Abrindo…',
  /** Na versão publicada, a demonstração abre no navegador (o endereço de `DEMO_URL`). */
  demoHint: 'Abre a demonstração no navegador, com dados fictícios.',
  haveAccount: 'Já tem conta?',
  signIn: 'Entrar',
} as const;

/**
 * A linha do teste grátis em Criar conta (jornada de compra de 27/11/2026, item 2): com a assinatura aberta, o "Assine aqui" do site leva
 * direto a esta tela, sem passar pelas boas-vindas, e a tela não falava de dinheiro. A primeira parte é a das boas-vindas
 * (`WELCOME_TEXT.trial`), que vale nos dois estados: antes do início da cobrança, o acesso é completo e sem cobrança, e o teste de
 * TRIAL_DAYS dias conta a partir dele (`accessView`, "pre_lancamento"); depois, toda conta nova começa com o teste. A segunda depende da
 * compra: fechada (`SUBSCRIBE_OPEN` falso), a cobrança ainda não começou para ninguém, e vale a frase da tela Assinatura com a compra
 * fechada (`ACCESS_TEXT.notOpenYet`, sem "Assinatura em breve"); aberta, a cobrança pode ou não ter começado, e só se diz o que é verdade
 * nos dois casos: o plano se escolhe depois, no app. Nunca promete o que o banco decide (o dia do início da cobrança).
 */
export function signupTrialLine(subscribeOpen: boolean): string {
  const second = subscribeOpen ? 'O plano você escolhe depois, no app.' : ACCESS_TEXT.notOpenYet.replace(/^Assinatura em breve\. /, '');
  return `${WELCOME_TEXT.trial}. ${second}`;
}

export const SIGNUP_TEXT = {
  title: 'Criar conta',
  /** "14 dias grátis, sem cartão. Por enquanto, o acesso é completo e nada é cobrado." (compra fechada). */
  trial: signupTrialLine(SUBSCRIBE_OPEN),
  subtitle: 'Leva menos de um minuto. Você confirma o e-mail e já começa a organizar o mês.',
} as const;

/** "Sua primeira conta": os atalhos de começo ao lado de "Começar meu mês". */
export const FIRST_ACCOUNT_TEXT = {
  quickTitle: 'Ou comece com menos digitação',
  importLabel: 'Importar extrato, fatura ou print',
  importHint: 'Cria a conta e abre a importação: arquivo do banco, PDF ou print, lido aqui no aparelho.',
  telegramLabel: 'Anotar pelo Telegram',
  telegramHint: 'Cria a conta e abre a tela para ligar o Telegram e anotar por mensagem.',
} as const;

/** "Primeiros passos" (D-033): os dois jeitos rápidos de começar vêm antes dos passos. */
export const FIRST_STEPS_TEXT = {
  title: 'Primeiros passos',
  intro: 'Quatro passos para a Clarevo mostrar o seu mês de verdade.',
  quickTitle: 'Comece pelo mais rápido',
  importLabel: 'Importar extrato, fatura ou print',
  importCaption: 'Os lançamentos do mês de uma vez',
  telegramLabel: 'Anotar pelo Telegram',
  telegramCaption: 'Mande "mercado 45" numa mensagem',
} as const;

/**
 * Onde a oferta da biometria logo depois de entrar (16/11/2026) pode aparecer: só no Resumo ("/") e sem um atalho do primeiro passo à
 * espera (revisão de 26/11/2026). Numa conta nova, "Importar extrato, fatura ou print" e "Anotar pelo Telegram" abrem a tela pedida por
 * cima do Resumo, e a pergunta não cobre essa tela: ela vem quando a pessoa volta ao Resumo.
 */
export function biometricOfferFits(pathname: string, firstStepPending: boolean): boolean {
  return pathname === '/' && !firstStepPending;
}
