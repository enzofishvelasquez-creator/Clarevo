import { parseBillingPeriod, type BillingPeriod, type PlanKind } from './plano-precos';

/**
 * O plano escolhido no site, levado ao app (jornada de compra de 27/11/2026, item 15). As páginas de plano do site mandam a escolha no
 * endereço do cadastro: `/criar-conta?plano=individual|familia&periodo=mensal|anual` (os mesmos nomes no link de Entrar, se a pessoa passar
 * por ele). O app lê o endereço, confere os valores com rigor e guarda a escolha só no aparelho (nunca no servidor: não é rastreamento e
 * nada vai ao banco). Na primeira vez que a pessoa abre a tela Assinatura, a escolha marca o período e destaca o plano, sem assinar nem
 * marcar mais nada por ela; depois disso, ou quando já há assinatura, a escolha sai do aparelho.
 */
export interface ChosenPlan {
  plan: PlanKind;
  /** Nulo quando o endereço não traz o período: a tela abre no período de sempre. */
  period: BillingPeriod | null;
}

/** Os nomes dos parâmetros no endereço, exatamente os do site. */
export const CHOSEN_PLAN_PARAMS = { plan: 'plano', period: 'periodo' } as const;

/** O valor de `plano` no endereço para cada plano (o site diz "familia"; no app, o plano se chama "familiar"). */
const PLAN_FROM_PARAM: Readonly<Record<string, PlanKind>> = { individual: 'individual', familia: 'familiar' };
const PARAM_FROM_PLAN: Readonly<Record<PlanKind, string>> = { individual: 'individual', familiar: 'familia' };

/** A chave do aparelho (localStorage na web). */
export const CHOSEN_PLAN_STORAGE_KEY = 'clarevo.plano-escolhido.v1';

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

/** Lê o texto guardado no aparelho, com as mesmas regras do endereço. Fora do formato: null. */
export function parseStoredChosenPlan(raw: unknown): ChosenPlan | null {
  if (typeof raw !== 'string' || raw.length > 40) return null;
  const [plan, period, extra] = raw.split(':');
  if (extra !== undefined) return null;
  return parseChosenPlan({ [CHOSEN_PLAN_PARAMS.plan]: plan, [CHOSEN_PLAN_PARAMS.period]: period });
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
