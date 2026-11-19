import { LEGAL_TEXT } from './legal';

/**
 * "Quem vê estes dados?" em duas listas curtas, "Quem vê" e "Quem não vê" (auditoria visual de 18/11/2026: eram nove parágrafos, e "A
 * empresa que oferece o benefício não vê..." aparecia quatro vezes). Cada fato da tela de antes continua aqui, com o mesmo sentido (a
 * redação segue a política de privacidade, seção 7): a frase do Pessoal e a da equipe são as de LEGAL_TEXT.whoSees; o que a empresa vê e
 * não vê junta BENEFIT_TEXT.whoSees, GOALS_TEXT.whoSeesGoals, SAVINGS_TEXT.privacy e RETURN_TEXT.privacy; a exclusão da conta continua
 * com DELETE_TEXT.whoSees. A Família e o espaço Negócio usam os textos de sempre (FAMILY_TEXT e BUSINESS_TEXT).
 */
export const WHO_SEES_TEXT = {
  seesTitle: 'Quem vê',
  notSeesTitle: 'Quem não vê',
  /** "Ana (você)". */
  you: (name: string): string => `${name} (você)`,
  /** No Pessoal: a frase da política e o que ela cobre. */
  personalYou: `${LEGAL_TEXT.whoSees.personal} Vale também para gastos fixos, parcelamentos, contas do ano (como IPVA, IPTU e matrícula), renda de referência, renda comprometida, metas, simulações e o plano de guardar.`,
  companyLabel: 'A empresa que oferece o benefício, se houver',
  companySees:
    'Administra o seu acesso ao plano e vê os e-mails que ela mesma convidou, a situação de cada convite ou licença (convite enviado, convite cancelado, ativa ou encerrada) e as datas.',
  teamLabel: 'A equipe da Clarevo',
  team: LEGAL_TEXT.whoSees.team,
  othersLabel: 'Outras pessoas do app',
  /** No Pessoal, sem Família. Com Família, vem também FAMILY_TEXT.privacy. */
  othersPersonal:
    'Não veem o seu Pessoal, nem a data da sua última anotação, as suas escolhas na revisão dos últimos meses, a sua resposta ao plano de guardar ou as datas em que essa pergunta volta.',
  /** No espaço Negócio (D-113): só a própria pessoa vê e anota. */
  othersBusiness: 'Não veem o espaço Negócio nem o seu Pessoal.',
  companyNotSees:
    'Não vê valores, categorias, metas, contas, cartões, gastos fixos, parcelamentos, contas do ano, renda, simulações, a data da sua última anotação, a revisão dos últimos meses, o plano de guardar nem a Família de ninguém, nem somados aos de outras pessoas. Também não vê se ou quando você usa o app depois de aceitar.',
  /** O título do que acontece ao excluir a conta (o texto é DELETE_TEXT.whoSees). */
  deletionTitle: 'Se você excluir a conta',
} as const;
