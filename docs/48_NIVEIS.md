# Níveis de conta (D-095)

Pedido do Enzo em 12/11/2026: "Eu pensei de o app conter níveis de conta [...]. Quanto mais preenchida a conta, maior o nível dela, como
bronze, prata, ouro, diamante e etc. [...] E as mudanças de níveis geram cards de celebração, e alguns itens ficam bordeados com as cores
dos níveis." Nomes escolhidos por ele: **Bronze, Prata, Ouro e Diamante**.

## 1. O que é

A conta tem um nível pelo **quanto da Clarevo a pessoa já usa**. São 18 marcos do tipo "já fez alguma vez". Toda conta começa no Bronze;
com 4 marcos, Prata; com 9, Ouro; com 14, Diamante (um quarto, metade e três quartos dos 18). Ninguém precisa dos 18: quem não tem
cartão, não investe, não guarda dinheiro em meta e não usa a Família chega ao Diamante do mesmo jeito, porque há marcos que não
envolvem dinheiro (conta de origem, limite pessoal, imagem da meta, Telegram).

Três regras que não mudam:

- **O nível nunca mede dinheiro.** Nenhum valor entra na conta: só se a pessoa já fez cada coisa. A tela diz: "O nível mostra o quanto
  da Clarevo você já usa. Não tem a ver com quanto dinheiro você tem, e nunca desce."
- **O nível nunca desce.** Excluir um lançamento ou uma meta não desfaz o marco: o marco alcançado fica guardado (seção 4).
- **Sem cobrança.** Nada é obrigatório ("Nada aqui é obrigatório: use só o que ajudar no seu dia a dia"), não há prazo, sequência de
  dias nem comparação com outras pessoas.

## 2. Os 18 marcos

| Marco | Conta quando a pessoa já... | Leva para |
| --- | --- | --- |
| Anotar um gasto | anotou um gasto ou uma compra no cartão, pagou uma conta ou uma fatura, ou importou um gasto | Anotar gasto |
| Registrar um recebimento | registrou ou importou um recebimento | Registrar recebimento |
| Cadastrar um gasto fixo ou uma conta a pagar | cadastrou um dos dois | Gastos fixos |
| Responder ao plano de guardar | respondeu "consigo" ou "agora não" | Plano de guardar |
| Criar uma meta | criou uma meta (a reserva conta) | Nova meta |
| Registrar um aporte numa meta | guardou ou retirou de uma meta | Metas |
| Definir o orçamento de uma categoria | definiu um orçamento | Orçamento |
| Informar a renda de referência | informou a renda | Renda comprometida |
| Cadastrar um cartão | cadastrou um cartão | Cartões |
| Registrar um investimento | criou um investimento | Novo investimento |
| Marcar uma conta como paga | pagou uma conta ou uma fatura | Contas a pagar |
| Anotar em três meses diferentes | fez anotações em três meses (pelo mês em que anotou) | (acontece com o uso) |
| Importar um extrato ou uma fatura | importou um arquivo | Importar |
| Ligar o Telegram | ligou a conta ao Telegram | Conta, Telegram |
| Criar ou entrar numa Família | criou uma Família ou aceitou um convite | Família |
| Cadastrar uma conta de origem | cadastrou uma conta (banco, dinheiro ou outra) | Nova conta |
| Definir o seu limite de renda comprometida | definiu o limite pessoal | Limite pessoal |
| Escolher a imagem de uma meta | trocou a imagem de uma meta | Metas |

## 3. Onde aparece

Em tom discreto, como o nível da conta do gov.br (pedido do Enzo em 12/11/2026: "não precisam ser tão alarmantes nas cores e gerar
TANTO destaque"): os cartões são os brancos de sempre, a cor do nível fica só num selo pequeno com a medalha, e a barra usa as cores da
marca.

- **Conta:** um selo pequeno do nível no canto das iniciais e o card "Nível da conta" (o selo, "Nível Ouro", "13 de 18 marcos", a barra
  fina e "Falta 1 marco para o nível Diamante."), com o link "Ver meu nível".
- **Conta > Nível da conta (`/conta/nivel`):** o resumo do nível com o que ele é, "Os níveis" (lista com o selo, "A partir de N marcos"
  e "Seu nível" no de agora), "Para conhecer" (cada marco leva à tela dele) e "Já feitos".
- **Resumo:** quando o nível sobe, um card branco de comemoração ("Novo nível", "Sua conta chegou ao nível Prata!", o recado, "Ver meu
  nível" e "Fechar"), com o selo do nível novo. Aparece uma vez por nível em cada aparelho; na primeira vez num aparelho, o app só guarda
  o nível de agora, sem comemorar (uma conta antiga não comemora de novo a cada aparelho).
- **Manual do app e Ajuda do site:** a entrada "Nível da conta".

Cores (`apps/app/src/theme/tokens.ts`, `levelColors`), suaves: bronze `#C9A07E`, prata `#B4BCC9`, ouro `#D9B65A` e diamante `#8CC7DB`,
só no selo, com a medalha escura por cima (acima de 6,6:1).

## 4. Como funciona por dentro

| Parte | Arquivo |
| --- | --- |
| Marcos, níveis, quando comemorar e textos | `packages/core/src/levels.ts` |
| Banco | `supabase/migrations/20261112000001_niveis.sql` (migração 0034): a tabela `account_marks` e `my_account_marks()`, só da própria pessoa; testes em `supabase/tests/99zzzzzzzzzzzzzz_niveis.sql` |
| Repositório | `getAccountMarks` em `repository.ts`, `memory-repository.ts` (demonstração e testes) e `apps/app/src/lib/supabase-repository.ts` |
| Telas | `apps/app/src/components/level-parts.tsx`, `apps/app/src/app/conta/nivel.tsx`, `conta.tsx` (selo e card) e o Resumo |
| O último nível visto no aparelho | `apps/app/src/lib/level-seen.ts` |
| Testes | `packages/core/test/levels.test.ts` e o bloco "Níveis de conta" de `scripts/e2e-web.js` (capturas 620 e 621) |

Os marcos saem do **registro das operações da própria pessoa** (`record_operations`), que já existe. Esse registro pode perder linhas
(a limpeza dos lançamentos excluídos depois de 6 meses e a Família apagada; revisão independente de 12/11/2026), então cada marco
alcançado fica guardado em `account_marks` (a pessoa, o marco e quando, sem valor nenhum): é isso que garante que o nível nunca desce.
`my_account_marks` calcula os marcos de agora, guarda os novos e devolve o que está guardado ou acabou de ser calculado. A tabela some
com a pessoa (exclusão da conta) e ninguém a lê direto, nem o app. "Três meses diferentes" usa o mês de Brasília em que a anotação foi
feita. Na demonstração, a conta de exemplo tem 13 marcos (nível Ouro).

## 5. Privacidade

- O banco guarda só quais marcos a pessoa já alcançou e quando (nenhum valor, nome ou dado financeiro), para o nível nunca descer; some
  com a exclusão da conta, e a tela "Nível da conta" mostra tudo o que está guardado ("Já feitos"). Só a pessoa vê o nível. Ninguém da Família nem a empresa
  que oferece o benefício vê o nível de ninguém, e ele não entra em relatório nenhum.
- O aparelho guarda só o último nível já mostrado (para não repetir a comemoração).
- Para o advogado (pergunta 52 de `docs/legal/resumo-para-advogado.md`): confirmar se a frase da política sobre o nível basta.

## 6. Passo do Enzo (Supabase)

`docs/05_SUPABASE.md`, passo 12z e conferência 21v: rodar a migração 0034 no SQL Editor e recarregar o esquema. Aplicar antes de
publicar o app novo (sem a função, o app não mostra nível nenhum e segue funcionando).
