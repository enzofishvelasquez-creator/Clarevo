import { addDays, type IsoDate } from './dates';
import { ERROR_TEXT } from './validation';

/**
 * "Como você conheceu o Clarevo?" (D-067, item 2; migração 0018): a pergunta OPCIONAL que deixa a equipe contar, sem rastrear ninguém,
 * de onde as pessoas chegam. A resposta é uma de seis origens (lista fechada, sem texto livre), é só da própria pessoa (tabela
 * signup_sources, função set_signup_source) e só entra em contagens por semana, com supressão de células pequenas, que a equipe
 * consulta no SQL Editor. Não é condição de nada: a pessoa pode responder "Prefiro não dizer", pular com "Agora não" ou ignorar.
 *
 * No app:
 * - Um cartão no Resumo, só em conta real (nunca na demonstração), só no Pessoal e no mês de hoje, só a partir do dia seguinte ao
 *   primeiro dia de uso neste aparelho e nunca junto de outro aviso temporário ("Seus últimos meses", "Primeiros passos"). "Agora
 *   não" some por 30 dias (guardado no aparelho); responder some para sempre.
 * - Em Conta, a pessoa vê a resposta e pode mudá-la (inclusive para "Prefiro não dizer").
 * - A resposta tem versão: a primeira vale 1 e cada mudança de origem soma 1; o app manda a versão que leu (0 sem resposta).
 *   Responder a mesma origem não grava nada. Não conta como anotação para a atividade de "Seus últimos meses" (D-030).
 * Regras repetidas no banco (set_signup_source).
 */

/** As seis origens, como o banco guarda. */
export type SignupSourceOption = 'instagram' | 'indicacao' | 'empresa' | 'busca' | 'outro' | 'prefiro_nao_dizer';

/** Na ordem em que as telas mostram. */
export const SIGNUP_SOURCES: readonly SignupSourceOption[] = ['instagram', 'indicacao', 'empresa', 'busca', 'outro', 'prefiro_nao_dizer'];

/** O nome de cada origem, como a pessoa lê. */
export const SIGNUP_SOURCE_LABEL: Record<SignupSourceOption, string> = {
  instagram: 'Instagram',
  indicacao: 'Indicação de alguém',
  empresa: 'Empresa onde trabalho',
  busca: 'Busca na internet',
  outro: 'Outro',
  prefiro_nao_dizer: 'Prefiro não dizer',
};

/**
 * A resposta da própria pessoa (signup_sources). `version` começa em 1 e sobe 1 a cada mudança de origem; `answeredAt` é o momento da
 * primeira resposta e `updatedAt`, o da última mudança.
 */
export interface SignupSource {
  source: SignupSourceOption;
  version: number;
  answeredAt: string;
  updatedAt: string;
}

/** "Agora não" some por 30 dias. */
export const SIGNUP_SOURCE_NOT_NOW_DAYS = 30;

/** Código de set_signup_source que o core confere (os outros vêm do repositório). */
export type SignupSourceErrorCode = 'origem_invalida';

/** A origem é uma das seis, escrita exatamente como o banco guarda (minúsculas, sem espaços); senão, `origem_invalida`. */
export function signupSourceError(source: unknown): SignupSourceErrorCode | null {
  return typeof source === 'string' && (SIGNUP_SOURCES as readonly string[]).includes(source) ? null : 'origem_invalida';
}

/** Quando a pergunta volta depois de "Agora não": hoje + 30 dias. */
export function signupSourceNotNowUntil(today: IsoDate): IsoDate {
  return addDays(today, SIGNUP_SOURCE_NOT_NOW_DAYS);
}

/** O que o aparelho sabe da pergunta, por pessoa: o primeiro dia de uso aqui e até quando "Agora não" vale. */
export interface SignupSourceDevice {
  /** O dia em que este aparelho viu o Resumo da pessoa pela primeira vez (nulo antes disso). */
  firstSeenOn: IsoDate | null;
  /** "Agora não" vale até este dia (a pergunta volta nele); nulo sem "Agora não". */
  notNowUntil: IsoDate | null;
}

/**
 * O cartão do Resumo deve aparecer agora? Só se a pessoa ainda não respondeu; se este aparelho já viu o Resumo dela em um dia anterior
 * ao de hoje (o primeiro dia de uso passa sem a pergunta: nunca no cadastro, nunca na primeira tela); e se "Agora não" não está valendo
 * (volta no dia marcado, 30 dias depois). Quem decide se a conta é real, o espaço, o mês e os outros avisos é a tela.
 */
export function shouldAskSignupSource(input: { answered: boolean; today: IsoDate; device: SignupSourceDevice }): boolean {
  if (input.answered) return false;
  const { firstSeenOn, notNowUntil } = input.device;
  if (firstSeenOn === null || input.today <= firstSeenOn) return false;
  if (notNowUntil !== null && input.today < notNowUntil) return false;
  return true;
}

/** Textos do cartão do Resumo, do card de Conta e dos anúncios. */
export const SIGNUP_SOURCE_TEXT = {
  /** O título do cartão do Resumo e do card de Conta. */
  title: 'Como você conheceu o Clarevo?',
  /** A linha curta ao lado: o que é, para que serve e que é opcional. */
  note: 'Opcional. Usamos só para contar, sem identificar ninguém, de onde as pessoas chegam.',
  /** O nome acessível do grupo de opções. */
  groupA11y: 'Como você conheceu o Clarevo? Escolha uma opção. É opcional.',
  /** Fecha o cartão por 30 dias. */
  notNow: 'Agora não',
  notNowA11y: 'Agora não. A pergunta volta daqui a 30 dias.',
  /** Resumo, depois de responder (a faixa de confirmação) e o anúncio. */
  saved: 'Resposta guardada. Você pode mudar em Conta.',
  /** Conta: a resposta de agora e a ausência dela. */
  accountTitle: 'Como você conheceu o Clarevo?',
  accountCurrent: (source: SignupSourceOption): string => `Sua resposta: ${SIGNUP_SOURCE_LABEL[source]}.`,
  accountNone: 'Você ainda não respondeu.',
  accountChange: 'Você pode mudar a resposta quando quiser, inclusive para "Prefiro não dizer".',
  accountSaved: 'Resposta guardada.',
  /**
   * O nome acessível de uma opção: só o nome dela. Quem lê a tela já ouve o estado marcado pelo próprio chip (papel de opção de escolha
   * única, marcada ou não); repetir "escolhida" no nome dobraria o aviso. Fica explícito porque o rótulo visível vira "Salvando…" durante
   * a gravação.
   */
  optionA11y: (source: SignupSourceOption): string => SIGNUP_SOURCE_LABEL[source],
  saving: 'Salvando…',
  /** Algo mudou em outro aparelho: a tela recarrega e a pessoa escolhe de novo. */
  changedElsewhere: 'Sua resposta mudou em outro aparelho. A tela foi atualizada; escolha de novo se quiser mudar.',
  failed: ERROR_TEXT.salvar_falhou,
  /** Resultado incerto (a conexão caiu): repetir é seguro. */
  uncertain: 'Não deu para confirmar se salvou. Toque de novo: repetir é seguro.',
  /** Códigos de recusa que a tela explica; o resto usa a falha genérica. */
  errors: {
    versao_desatualizada: 'Sua resposta mudou em outro aparelho. A tela foi atualizada; escolha de novo se quiser mudar.',
    sem_permissao: ERROR_TEXT.sem_permissao,
    origem_invalida: ERROR_TEXT.salvar_falhou,
    chave_reutilizada: ERROR_TEXT.salvar_falhou,
    nao_encontrado: ERROR_TEXT.nao_encontrado,
  },
} as const;

/** A chave da leitura da resposta no cache de consultas do app: ['signupSource', pessoa]. */
export const SIGNUP_SOURCE_QUERY_KEY = 'signupSource';

/** O que o app precisa do cache de consultas (o QueryClient do TanStack tem os dois métodos). */
export interface SignupSourceCache {
  setQueryData(queryKey: readonly unknown[], data: unknown): unknown;
  invalidateQueries(filters: { queryKey: readonly unknown[] }): unknown;
}

/** Resposta confirmada pelo servidor: entra na hora na leitura (o cartão do Resumo some e Conta mostra a escolha). */
export function signupSourceSaved(cache: SignupSourceCache, personId: string | undefined, row: SignupSource): void {
  cache.setQueryData([SIGNUP_SOURCE_QUERY_KEY, personId], row);
}

/**
 * Gravação recusada pelo servidor: com `versao_desatualizada` (outro aparelho respondeu ou mudou antes) a leitura é recarregada, para a
 * tela mostrar o que vale e o próximo toque mandar a versão certa. Sem isso o app repetiria a versão velha e seria recusado de novo.
 * Os outros códigos não mudam a leitura. Devolve se pediu a recarga.
 */
export function signupSourceRefused(cache: SignupSourceCache, code: string): boolean {
  if (code !== 'versao_desatualizada') return false;
  cache.invalidateQueries({ queryKey: [SIGNUP_SOURCE_QUERY_KEY] });
  return true;
}

/** Texto de erro de uma escrita da resposta: o código conhecido, ou a falha genérica. */
export function signupSourceErrorText(code: string): string {
  const own = SIGNUP_SOURCE_TEXT.errors as Record<string, string>;
  return own[code] ?? SIGNUP_SOURCE_TEXT.failed;
}

/** Todos os textos montados (para conferir as regras de redação nos testes). */
export function signupSourceTextSamples(): string[] {
  const t = SIGNUP_SOURCE_TEXT;
  const labels = Object.values(SIGNUP_SOURCE_LABEL);
  return [
    t.title,
    t.note,
    t.groupA11y,
    t.notNow,
    t.notNowA11y,
    t.saved,
    t.accountTitle,
    t.accountNone,
    t.accountChange,
    t.accountSaved,
    t.saving,
    t.changedElsewhere,
    t.failed,
    t.uncertain,
    ...Object.values(t.errors),
    ...labels,
    ...SIGNUP_SOURCES.flatMap((s) => [t.accountCurrent(s), t.optionA11y(s)]),
  ];
}
