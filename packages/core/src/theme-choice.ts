/**
 * Conta › Tema (D-112, complementa a D-096). Por padrão o app segue o tema do aparelho (no celular, o do sistema; na web, o do
 * navegador), lido ao abrir. Em Conta, a pessoa pode escolher "Igual ao aparelho" (o padrão), "Claro" ou "Escuro". A escolha fica
 * guardada só neste aparelho (na web, no localStorage; no celular, num arquivo pequeno do app), é lida de forma síncrona antes de as
 * cores serem decididas (`apps/app/src/theme/tokens.ts`) e sai junto com as outras preferências ao sair da conta ou excluí-la
 * (`forgetDevice`). Só "light" ou "dark" ficam guardados: "Igual ao aparelho" é não guardar nada, então o padrão não deixa rastro.
 *
 * Como na D-096, o app nunca recarrega sozinho (a pessoa pode estar digitando): a escolha vale na próxima abertura, e "Aplicar agora",
 * que a própria pessoa toca, reabre o app com o novo tema (na web, recarrega a página). O widget e o resumo em PDF não mudam.
 */

export type ThemeChoice = 'system' | 'light' | 'dark';

/** O tema que vale numa abertura do app (o mesmo `ColorScheme` de `apps/app/src/theme/palettes.ts`). */
export type ThemeScheme = 'light' | 'dark';

/** Na ordem da tela: o padrão primeiro. */
export const THEME_CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark'];

export const DEFAULT_THEME_CHOICE: ThemeChoice = 'system';

/**
 * Onde a escolha fica neste aparelho: a chave do localStorage na web (a mesma do script de `apps/app/public/index.html`, que pinta o
 * fundo antes de o app desenhar) e o nome do arquivo na pasta de documentos do app no celular. O valor é só "light" ou "dark".
 */
export const THEME_STORAGE_KEY = 'clarevo.tema.v1';

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'system' || value === 'light' || value === 'dark';
}

/** O que foi lido do aparelho: "light" ou "dark" (com espaços em volta tolerados); qualquer outra coisa, ou nada, é o padrão. */
export function parseThemeChoice(raw: string | null | undefined): ThemeChoice {
  const v = typeof raw === 'string' ? raw.trim() : '';
  return v === 'light' || v === 'dark' ? v : DEFAULT_THEME_CHOICE;
}

/** O que gravar no aparelho para uma escolha: "light" ou "dark"; null para "Igual ao aparelho" (apagar o que houver). */
export function storedThemeValue(choice: ThemeChoice): ThemeScheme | null {
  return choice === 'system' ? null : choice;
}

/** O tema desta abertura: a escolha da pessoa ou, em "Igual ao aparelho", o do aparelho. */
export function resolveThemeScheme(choice: ThemeChoice, device: ThemeScheme): ThemeScheme {
  return choice === 'system' ? device : choice;
}

/**
 * A escolha marcada em Conta é diferente da que vale nesta abertura (a lida ao abrir): mostra que ela vale na próxima abertura e
 * oferece "Aplicar agora". Voltar à escolha da abertura esconde de novo.
 */
export function themeChoicePending(chosen: ThemeChoice, opening: ThemeChoice): boolean {
  return chosen !== opening;
}

/** Textos de Conta › Tema. */
export const THEME_TEXT = {
  section: 'Tema',
  intro: 'Por padrão, a Clarevo segue o tema do aparelho.',
  deviceOnly: 'A escolha vale só para este aparelho.',
  /** Na ordem de `THEME_CHOICES`. */
  labels: { system: 'Igual ao aparelho', light: 'Claro', dark: 'Escuro' },
  /** Com uma escolha diferente da que vale agora. */
  pending: 'O tema escolhido vale a partir da próxima vez que você abrir a Clarevo.',
  apply: 'Aplicar agora',
  applyCaption: {
    web: 'Aplicar agora recarrega a página com o novo tema.',
    native: 'Aplicar agora reabre o app com o novo tema.',
  },
  /** Na demonstração (web), recarregar a página volta às boas-vindas: os dados fictícios recomeçam. */
  applyDemo: 'Na demonstração, recarregar a página volta ao começo, com os dados fictícios de sempre.',
  applyBusy: 'Reabrindo…',
  applyFailed: 'Não foi possível reabrir o app agora. O tema escolhido vale na próxima vez que você abrir a Clarevo.',
  /** Sem como guardar no aparelho (navegação privada, armazenamento bloqueado). */
  saveFailed: 'Não foi possível guardar a escolha neste aparelho. O tema continua o de agora.',
} as const;
