import { parseBillingPeriod, type BillingPeriod, type PlanKind } from './plano-precos';

/**
 * O plano escolhido no site, levado ao app (jornada de compra de 27/11/2026, item 15). As páginas de plano do site mandam a escolha no
 * endereço do cadastro: `/criar-conta?plano=individual|familia&periodo=mensal|anual` (os mesmos nomes no link de Entrar, se a pessoa passar
 * por ele). O app lê o endereço, confere os valores com rigor e guarda a escolha só no aparelho (nunca no servidor: não é rastreamento e
 * nada vai ao banco), por no máximo 24 horas. Na primeira vez que a pessoa abre a tela Assinatura, a escolha marca o período e destaca o
 * plano, sem assinar nem marcar mais nada por ela; depois disso, quando já há assinatura (também ao entrar numa conta que já assina) ou
 * passadas as 24 horas, a escolha sai do aparelho.
 */
export interface ChosenPlan {
  plan: PlanKind;
  /**
   * Nulo quando o endereço não traz o período: a tela abre no período de sempre, o mensal (`PLAN_PERIOD_DEFAULT`, em `plano.ts`; desde
   * 27/11/2026, o mensal vem primeiro e marcado). Assim, um link sem `periodo` vale como mensal.
   */
  period: BillingPeriod | null;
}

/** Os nomes dos parâmetros no endereço, exatamente os do site. */
export const CHOSEN_PLAN_PARAMS = { plan: 'plano', period: 'periodo' } as const;

/** O valor de `plano` no endereço para cada plano (o site diz "familia"; no app, o plano se chama "familiar"). */
const PLAN_FROM_PARAM: Readonly<Record<string, PlanKind>> = { individual: 'individual', familia: 'familiar' };
const PARAM_FROM_PLAN: Readonly<Record<PlanKind, string>> = { individual: 'individual', familiar: 'familia' };

/** A chave do aparelho (localStorage na web). */
export const CHOSEN_PLAN_STORAGE_KEY = 'clarevo.plano-escolhido.v1';
/**
 * Quanto tempo a escolha vale no aparelho (revisão independente da D-131): 24 horas. O app guarda a escolha ao abrir a página, mesmo sem
 * ninguém criar conta; depois de um dia, ela é ignorada e sai do aparelho, para não aparecer marcada para outra pessoa que entrar no mesmo
 * navegador.
 */
export const CHOSEN_PLAN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Um valor do endereço: só texto simples (o roteador entrega lista quando o parâmetro se repete, e isso é recusado). */
function single(v: unknown): string | null | 'invalido' {
  if (v === undefined || v === null) return null;
  return typeof v === 'string' ? v : 'invalido';
}

/**
 * Lê `plano` e `periodo` do endereço, com rigor: o plano é obrigatório e só "individual" ou "familia"; o período, se vier, só "mensal" ou
 * "anual". Qualquer outro valor (maiúsculas, espaços, lista, plano sem nome) recusa a escolha inteira: null.
 */
export function parseChosenPlan(params: Readonly<Record<string, unknown>>): ChosenPlan | null {
  const rawPlan = single(params[CHOSEN_PLAN_PARAMS.plan]);
  const rawPeriod = single(params[CHOSEN_PLAN_PARAMS.period]);
  if (rawPlan === null || rawPlan === 'invalido' || rawPeriod === 'invalido') return null;
  const plan = Object.prototype.hasOwnProperty.call(PLAN_FROM_PARAM, rawPlan) ? PLAN_FROM_PARAM[rawPlan]! : null;
  if (!plan) return null;
  if (rawPeriod === null) return { plan, period: null };
  const period = parseBillingPeriod(rawPeriod);
  return period ? { plan, period } : null;
}

/** Lê a escolha de um texto de endereço ("?plano=familia&periodo=anual"). */
export function chosenPlanFromSearch(search: string): ChosenPlan | null {
  const query = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const params: Record<string, unknown> = {};
  for (const key of [CHOSEN_PLAN_PARAMS.plan, CHOSEN_PLAN_PARAMS.period]) {
    const all = query.getAll(key);
    if (all.length === 1) params[key] = all[0];
    else if (all.length > 1) params[key] = all;
  }
  return parseChosenPlan(params);
}

/** O texto guardado no aparelho: "familia:anual" ou, sem período, "familia". */
export function serializeChosenPlan(choice: ChosenPlan): string {
  return choice.period ? `${PARAM_FROM_PLAN[choice.plan]}:${choice.period}` : PARAM_FROM_PLAN[choice.plan];
}

/** O texto guardado no aparelho: a escolha e o instante em que foi guardada, em milissegundos ("familia:anual@1764244800000"). */
export function serializeStoredChosenPlan(choice: ChosenPlan, savedAt: number): string {
  return `${serializeChosenPlan(choice)}@${Math.floor(savedAt)}`;
}

/**
 * Lê o texto guardado no aparelho, com as mesmas regras do endereço, e só se foi guardado há menos de 24 horas (`CHOSEN_PLAN_MAX_AGE_MS`)
 * antes de `now`. Fora do formato, sem o instante (o formato de antes de 27/11/2026), guardado "no futuro" (o relógio do aparelho mudou) ou
 * velho: null, e quem lê apaga.
 */
export function parseStoredChosenPlan(raw: unknown, now: number): ChosenPlan | null {
  if (typeof raw !== 'string' || raw.length > 40) return null;
  const m = /^([^@]*)@(\d{1,15})$/.exec(raw);
  if (!m) return null;
  const savedAt = Number(m[2]);
  if (!Number.isFinite(now) || savedAt > now || now - savedAt >= CHOSEN_PLAN_MAX_AGE_MS) return null;
  const [plan, period, extra] = m[1]!.split(':');
  if (extra !== undefined) return null;
  return parseChosenPlan({ [CHOSEN_PLAN_PARAMS.plan]: plan, [CHOSEN_PLAN_PARAMS.period]: period });
}

/**
 * O link de cadastro do site (27/11/2026): o site manda quem está sem sessão para `/criar-conta` (às vezes com `?plano=` e `?periodo=`).
 * Sem sessão, esse endereço abre Criar conta direto, sem passar pelas boas-vindas; a raiz, Entrar e as demais telas seguem como antes.
 * Recebe o endereço da primeira carga da web e devolve o destino de Criar conta, com a escolha do plano só quando ela é válida (as mesmas
 * regras de `chosenPlanFromSearch`; qualquer outro parâmetro fica de fora), ou null quando o endereço não é o de Criar conta.
 */
export function signupEntryFrom(pathname: string, search: string): string | null {
  if (!/^\/criar-conta\/?$/.test(pathname)) return null;
  const choice = chosenPlanFromSearch(search);
  if (!choice) return '/criar-conta';
  const query = new URLSearchParams({ [CHOSEN_PLAN_PARAMS.plan]: PARAM_FROM_PLAN[choice.plan] });
  if (choice.period) query.set(CHOSEN_PLAN_PARAMS.period, choice.period);
  return `/criar-conta?${query.toString()}`;
}

/**
 * Para onde vai quem está sem sessão, decidido pela tela de carregamento: Entrar, quando a sessão caiu e há um destino a retomar depois de
 * entrar de novo (como antes); Criar conta, quando a página abriu pelo link de cadastro do site (`signupEntryFrom`, uma vez só); nos demais
 * casos, as boas-vindas.
 */
export function signedOutScreen(resumeAfterLogin: boolean, signupEntry: string | null): string {
  if (resumeAfterLogin) return '/entrar';
  return signupEntry ?? '/boas-vindas';
}

/**
 * A escolha ainda vale para a tela Assinatura? Só para quem ainda pode escolher um plano (quem já tem assinatura, Plano Família de outra
 * pessoa, benefício ou cortesia não escolhe): nesses casos, a escolha sai do aparelho sem ser usada.
 */
export function chosenPlanStillUseful(status: string): boolean {
  return status === 'teste' || status === 'leitura' || status === 'pre_lancamento';
}

/** Textos da escolha na tela Assinatura. */
export const CHOSEN_PLAN_TEXT = {
  /** O selo no cartão do plano escolhido no site. */
  badge: 'O plano que você escolheu',
  /** O mesmo, no nome do cartão para o leitor de tela. */
  a11y: 'É o plano que você escolheu.',
} as const;
