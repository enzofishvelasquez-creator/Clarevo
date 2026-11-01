/**
 * Selo de demonstração nas telas que não são abas (CL-11). Nas abas, o selo "Demonstração" fica ao lado do logotipo. Nos formulários e
 * nos detalhes, o cabeçalho compacto mostra a pílula do contexto fixo ("Salvando em Pessoal"); na demonstração ela passa a dizer
 * "Demonstração · Pessoal", e a linha final do formulário avisa que nada sai dali. Numa conta real, nenhum dos dois aparece:
 * `contextPillText(label, false)` devolve o texto de sempre. Texto neutro, sem marca nem dado real.
 */
export const DEMO_TEXT = {
  /** O selo, como nas abas. */
  badge: 'Demonstração',
  /** Última linha dos formulários na demonstração, depois de "Será salvo em Pessoal, Conta principal." */
  saveNote: 'Fica só nesta demonstração, com dados fictícios.',
  /** Pílula do cabeçalho compacto: "Demonstração · Pessoal". */
  pill: (context: string): string => `Demonstração · ${context}`,
  /**
   * Tela "Entrar" da demonstração: as contas existem só na memória da página, e a conta de verdade da pessoa não entra aqui
   * (retorno de 01/11/2026: tentar entrar com o próprio e-mail na demonstração dava "Não foi possível entrar").
   */
  signInNotice: 'Esta é a demonstração. Aqui só entram as contas criadas nesta página, e elas somem ao fechar. Para entrar com a sua conta, use o app.',
  openApp: 'Abrir o app da Clarevo',
  /** Tela "Criar conta" da demonstração. */
  signUpNotice: 'Esta é a demonstração: a conta criada aqui é só para testar e some ao fechar a página. Para criar a sua conta de verdade, use o app.',
  /** Tela "Confira seu e-mail" da demonstração: nada é enviado, a confirmação é simulada em dois toques. */
  confirmNotice: 'Demonstração: nenhum e-mail é enviado. Toque em "Simular abertura do link" e depois em "Já confirmei meu e-mail".',
} as const;

/** "Salvando em Pessoal" e "Importando em Pessoal" viram só o contexto, para a pílula caber ao lado do título em 320 px. */
const CONTEXT_LEAD = /^(Salvando|Importando) em /;

/**
 * Texto da pílula de contexto do cabeçalho compacto. Fora da demonstração, o texto recebido. Na demonstração, "Demonstração · " e o
 * contexto ("Salvando em Pessoal" e "Pessoal" viram "Demonstração · Pessoal"; "Família", "Demonstração · Família").
 */
export function contextPillText(label: string, demo: boolean): string {
  return demo ? DEMO_TEXT.pill(label.replace(CONTEXT_LEAD, '')) : label;
}
