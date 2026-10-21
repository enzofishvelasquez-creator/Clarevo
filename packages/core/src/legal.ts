/**
 * Privacidade e termos dentro do app (D-064, `docs/07` seção "Site público" e `docs/16`): os caminhos fixos das páginas do site
 * público, a regra do endereço do site e os textos do cadastro, de Conta e de "Quem vê estes dados?" que falam disso.
 *
 * O endereço do site tem uma só fonte: a variável `EXPO_PUBLIC_SITE_URL`, lida num único módulo do app (`apps/app/src/lib/site.ts`),
 * sem valor padrão no código. Sem a variável (ou com um valor que não parece um endereço), o app não mostra nenhum link: o texto do
 * cadastro sai sem link e a seção "Privacidade e termos" de Conta não é desenhada. A variável só é configurada quando o site estiver
 * publicado, depois da revisão do advogado.
 *
 * Os textos aqui são rascunho para o advogado (`docs/legal/resumo-para-advogado.md`, perguntas 14 e 25): o app nunca mostra marcadores
 * como `[A DEFINIR]`, então usa a redação que a política de privacidade propõe.
 */

/** As páginas do site que o app abre, com o arquivo de cada uma (fixos: as URLs que as lojas e a política citam). */
export const SITE_PAGES = {
  privacidade: 'privacidade.html',
  termos: 'termos.html',
  exclusao: 'excluir-conta.html',
  suporte: 'suporte.html',
} as const;

export type SitePage = keyof typeof SITE_PAGES;

/** Endereço aceito: `https://dominio[:porta][/caminho]` (e `http://localhost` para desenvolvimento), sem espaço, consulta nem âncora. */
const SITE_URL_RE = /^(https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?|http:\/\/localhost(:\d{1,5})?)(\/[^\s?#]*)?$/i;

/**
 * O endereço do site como o app o usa: sem espaços nem barras no fim, ou `null` quando a variável está vazia ou não é um endereço
 * (`null` quer dizer "sem links"). O valor nunca ganha um padrão.
 */
export function normalizeSiteUrl(raw: string | null | undefined): string | null {
  const texto = (raw ?? '').trim();
  if (!texto || !SITE_URL_RE.test(texto)) return null;
  return texto.replace(/\/+$/, '');
}

/** O endereço completo de uma página do site, ou `null` quando não há endereço do site. */
export function sitePageUrl(siteUrl: string | null | undefined, page: SitePage): string | null {
  const base = normalizeSiteUrl(siteUrl);
  return base ? `${base}/${SITE_PAGES[page]}` : null;
}

/** Um trecho do texto do cadastro: texto simples, ou o nome de uma página (que vira link quando há endereço do site). */
export interface ConsentPart {
  text: string;
  /** A página a abrir, só nos trechos que são links. */
  page?: SitePage;
}

export const LEGAL_TEXT = {
  /** Cadastro: o texto curto acima do botão "Criar conta". Sem caixa de seleção (pergunta 25 ao advogado). */
  signup: {
    before: 'Ao criar a conta, você confirma que tem 18 anos ou mais e concorda com os ',
    terms: 'Termos de uso',
    between: ' e a ',
    privacy: 'Política de privacidade',
    after: '.',
  },
  /** Conta: a seção "Privacidade e termos", só com o endereço do site. */
  account: {
    title: 'Privacidade e termos',
    hint: 'Abrem o site do Clarevo no navegador.',
    privacy: 'Política de privacidade',
    terms: 'Termos de uso',
    deletion: 'Excluir conta: como funciona',
    openFailed: 'Não foi possível abrir a página agora. Tente de novo em instantes.',
  },
  /** "Quem vê estes dados?": o Pessoal e a equipe do Clarevo (redação proposta na política, seção 7; pergunta 14 ao advogado). */
  whoSees: {
    personal: 'Única pessoa do app que vê, anota, edita e exclui registros em Pessoal.',
    team: 'A equipe do Clarevo não olha os seus dados no dia a dia. Só acessa quando a lei exigir ou para resolver um problema que você pediu.',
    security:
      'Seus registros ficam protegidos por permissões no servidor: entre as pessoas do app, só você vê o contexto Pessoal. Na Família, cada pessoa vê o que o papel dela permite.',
  },
} as const;

/** O texto do cadastro em trechos: os dois nomes ficam marcados como links, para o app desenhar o link só quando houver endereço do site. */
export function signupConsentParts(): ConsentPart[] {
  const t = LEGAL_TEXT.signup;
  return [{ text: t.before }, { text: t.terms, page: 'termos' }, { text: t.between }, { text: t.privacy, page: 'privacidade' }, { text: t.after }];
}

/** O texto do cadastro numa linha só (a mesma frase, sem links): leitor de tela, teste e documentos. */
export const SIGNUP_CONSENT_TEXT: string = signupConsentParts()
  .map((p) => p.text)
  .join('');
