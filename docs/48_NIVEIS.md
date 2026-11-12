# Níveis de conta (D-095)

Pedido do Enzo em 12/11/2026: "Eu pensei de o app conter níveis de conta [...]. Quanto mais preenchida a conta, maior o nível dela, como
bronze, prata, ouro, diamante e etc. [...] E as mudanças de níveis geram cards de celebração, e alguns itens ficam bordeados com as cores
dos níveis." Nomes escolhidos por ele: **Bronze, Prata, Ouro e Diamante**.

## 1. O que é

A conta tem um nível pelo **quanto da Clarevo a pessoa já usa**. São 16 marcos do tipo "já fez alguma vez". Toda conta começa no Bronze;
com 4 marcos, Prata; com 8, Ouro; com 12, Diamante (ninguém precisa dos 16: quem não tem cartão ou não usa a Família chega ao Diamante
do mesmo jeito).

Três regras que não mudam:

- **O nível nunca mede dinheiro.** Nenhum valor entra na conta: só se a pessoa já fez cada coisa. A tela diz: "O nível mostra o quanto
  da Clarevo você já usa. Não tem a ver com quanto dinheiro você tem, e nunca desce."
- **O nível nunca desce.** Excluir um lançamento ou uma meta não desfaz o marco.
- **Sem cobrança.** Nada é obrigatório ("Nada aqui é obrigatório: use só o que ajudar no seu dia a dia"), não há prazo, sequência de
  dias nem comparação com outras pessoas.

## 2. Os 16 marcos

| Marco | Conta quando a pessoa já... | Leva para |
| --- | --- | --- |
| Anotar um gasto | anotou um gasto, uma compra no cartão ou importou um extrato | Anotar gasto |
| Registrar um recebimento | registrou um recebimento | Registrar recebimento |
| Cadastrar um gasto fixo ou uma conta a pagar | cadastrou um dos dois | Gastos fixos |
| Responder ao plano de guardar | respondeu "consigo" ou "agora não" | Plano de guardar |
| Criar uma meta | criou uma meta (a reserva conta) | Nova meta |
| Registrar um aporte numa meta | guardou ou retirou de uma meta | Metas |
| Definir o orçamento de uma categoria | definiu um orçamento | Orçamento |
| Informar a renda de referência | informou a renda | Renda comprometida |
| Cadastrar um cartão | cadastrou um cartão | Cartões |
| Registrar um investimento | criou um investimento | Novo investimento |
| Conferir um mês | marcou um mês como conferido | Movimentos |
| Marcar uma conta como paga | pagou uma conta ou uma fatura | Contas a pagar |
| Anotar em três meses diferentes | fez anotações em três meses (pelo mês em que anotou) | (acontece com o uso) |
| Importar um extrato ou uma fatura | importou um arquivo | Importar |
| Ligar o Telegram | ligou a conta ao Telegram | Conta, Telegram |
| Criar ou entrar numa Família | criou uma Família ou aceitou um convite | Família |

## 3. Onde aparece

- **Conta:** as iniciais num círculo com o contorno na cor do nível e o card "Nível da conta" (borda na cor do nível, selo, "Nível Ouro",
  "11 de 16 marcos", a barra e "Falta 1 marco para o nível Diamante."), com "Ver meu nível".
- **Conta > Nível da conta (`/conta/nivel`):** o nível no alto, sobre o azul da marca, o caminho até o próximo, os quatro níveis com
  quantos marcos cada um pede, "Para conhecer" (cada marco leva à tela dele) e "Já feitos".
- **Cabeçalho das abas:** o contorno das iniciais leva a cor do nível.
- **Resumo:** quando o nível sobe, o card de comemoração ("Sua conta chegou ao nível Prata!"), com a borda e o selo na cor do nível
  novo, "Ver meu nível" e "Fechar". Aparece uma vez por nível em cada aparelho; na primeira vez num aparelho, o app só guarda o nível de
  agora, sem comemorar (uma conta antiga não comemora de novo a cada aparelho).
- **Manual do app e Ajuda do site:** a entrada "Nível da conta".

Cores (`apps/app/src/theme/tokens.ts`, `levelColors`): bronze `#C98A52`, prata `#A3AEC2`, ouro `#E8B120` e diamante `#4CC3E6`, sempre com
o texto escuro por cima; cada uma tem um fundo claro para os cartões.

## 4. Como funciona por dentro

| Parte | Arquivo |
| --- | --- |
| Marcos, níveis, quando comemorar e textos | `packages/core/src/levels.ts` |
| Banco | `supabase/migrations/20261112000001_niveis.sql` (migração 0034): `my_account_marks()`, só leitura, só da própria pessoa; testes em `supabase/tests/99zzzzzzzzzzzzzz_niveis.sql` |
| Repositório | `getAccountMarks` em `repository.ts`, `memory-repository.ts` (demonstração e testes) e `apps/app/src/lib/supabase-repository.ts` |
| Telas | `apps/app/src/components/level-parts.tsx`, `apps/app/src/app/conta/nivel.tsx`, `header.tsx` (contorno), `conta.tsx` e o Resumo |
| O último nível visto no aparelho | `apps/app/src/lib/level-seen.ts` |
| Testes | `packages/core/test/levels.test.ts` e o bloco "Níveis de conta" de `scripts/e2e-web.js` (capturas 620 e 621) |

Os marcos saem do **registro das operações da própria pessoa** (`record_operations`), que já existe e não se desfaz com exclusões: por
isso o nível nunca desce e **nada novo é guardado no banco**. "Três meses diferentes" usa o mês de Brasília em que a anotação foi feita.
Na demonstração, a conta de exemplo tem 11 marcos (nível Ouro).

## 5. Privacidade

- Nenhum dado novo vai ao banco: o nível é calculado na hora, do que a pessoa já fez, e só ela o vê. Ninguém da Família nem a empresa
  que oferece o benefício vê o nível de ninguém, e ele não entra em relatório nenhum.
- O aparelho guarda só o último nível já mostrado (para não repetir a comemoração).
- Para o advogado (pergunta 52 de `docs/legal/resumo-para-advogado.md`): confirmar se a frase da política sobre o nível basta.

## 6. Passo do Enzo (Supabase)

`docs/05_SUPABASE.md`, passo 12z e conferência 21v: rodar a migração 0034 no SQL Editor e recarregar o esquema. Aplicar antes de
publicar o app novo (sem a função, o app não mostra nível nenhum e segue funcionando).
