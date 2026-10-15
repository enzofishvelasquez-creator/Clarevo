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
