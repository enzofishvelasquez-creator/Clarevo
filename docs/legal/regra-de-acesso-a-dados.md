Rascunho preparado pela equipe da Clarevo para revisão jurídica. Não é parecer jurídico.

# Regra interna: quem da equipe acessa os dados das pessoas, quando e como fica registrado

16/11/2026. Rascunho pedido pela política de privacidade (seção "Quem vê os seus dados", marcador da regra interna) e pela pergunta 14 do
`resumo-para-advogado.md` (item B5 de `pendencias-do-lancamento.md`). Documento interno: não vai para o site. A política publicada só diz
que a regra existe e resume as situações. O advogado confere e a equipe ajusta.

## 1. A que se aplica

Aos dados das pessoas que usam a Clarevo, onde estiverem:

- o banco de dados de produção (Supabase, projeto `clarevo-producao`), incluindo os registros das funções;
- os painéis dos serviços que recebem algum dado de pessoa: Resend (e-mails do login), Sentry (relatório de falhas, já sem dado pessoal
  por regra do app), Cloudflare (acessos ao site e ao app na web), Telegram (mensagens ao robô), Asaas e RevenueCat (situação da
  assinatura), Zoho (caixa de e-mail de suporte e privacidade).

Não se aplica aos dados da demonstração, que são fictícios, nem ao banco local de testes, que só tem dados inventados.

## 2. Quem tem acesso hoje

| Quem | O que alcança | Como |
|---|---|---|
| Enzo, fundador e responsável pelo canal de privacidade | Tudo: é o dono das contas dos serviços | Com a própria senha e a verificação em duas etapas |
| Claude Chrome (assistente que opera o navegador do Enzo, na sessão dele) | O que o Enzo deixar aberto, nas tarefas que o Enzo pede | Só com o Enzo presente e confirmando as ações de produção; não digita senha nem código |
| Equipe de desenvolvimento (inclui o Claude Code) | O código e o banco local de testes | Não tem acesso ao banco de produção nem aos painéis |

Toda pessoa nova na equipe que precisar de acesso recebe um acesso próprio, nunca uma conta dividida, e perde esse acesso no dia em que
sair. O acesso é revisto a cada 6 meses e sempre que alguém entra ou sai.

## 3. Quando o conteúdo pode ser acessado

A Clarevo não consulta o conteúdo financeiro de ninguém no dia a dia. O conteúdo de uma pessoa (valores, descrições, categorias, metas,
investimentos, notas, mensagens ao robô) só é acessado em uma destas situações:

1. **Pedido da própria pessoa**, para resolver um problema que ela relatou, pelo e-mail cadastrado. A equipe pergunta antes se pode olhar
   e guarda a resposta.
2. **Obrigação legal ou pedido de autoridade**, conforme o procedimento da seção 6.
3. **Segurança**: investigar um incidente ou um uso que ponha outras pessoas ou o serviço em risco.
4. **Manutenção técnica** que não dá para fazer de outro jeito, por exemplo corrigir um dado gravado errado por uma falha do app.

Nunca: curiosidade, propaganda, venda, pesquisa de mercado, treino de inteligência artificial ou mostrar exemplo a terceiros.

## 4. Como acessar

- **O mínimo necessário.** Primeiro, tentar resolver sem ver o conteúdo: contagens, a estrutura do banco, o identificador da pessoa. Se
  precisar ver, ver só as linhas e colunas do problema.
- **Contagens da equipe** (seções da política sobre as contagens por semana) são feitas por consultas que devolvem números, sem nome,
  e-mail ou identificador.
- **Nada sai do lugar.** Dados de pessoas não vão para planilha, print, chat, conversa com assistente de inteligência artificial, código,
  documento do repositório nem e-mail, salvo a resposta à própria pessoa ou à autoridade.
- **Migrações e conferências** do banco (feitas pelo Enzo ou pelo Claude Chrome com o Enzo) só mexem na estrutura e conferem contagens.
  O roteiro da equipe nunca pede para mostrar linhas com dados de pessoas.
- **Testes no ar** usam a conta do próprio Enzo ou uma conta de teste, e o que foi criado para o teste é apagado no fim.

## 5. Registro dos acessos

Todo acesso ao conteúdo de uma pessoa, ou a um dado que a identifique fora das telas normais do app, vira uma linha no registro de
acessos:

| Campo | Exemplo |
|---|---|
| Data e hora | 16/11/2026 14:05 |
| Quem acessou | Enzo |
| Situação (seção 3) | 1, pedido da própria pessoa |
| Motivo | Fatura do cartão aparecendo em dobro |
| O que foi acessado | Faturas e compras do cartão da pessoa, pelo identificador interno (sem copiar o nome) |
| A pessoa foi avisada | Sim, no e-mail de resposta |

- Onde fica: no começo, uma planilha privada do Enzo, fora do repositório e fora de qualquer ferramenta de inteligência artificial.
  Quando houver mais de uma pessoa com acesso, a equipe propõe uma tabela no próprio banco, gravada por uma função de suporte.
- [A DEFINIR: por quanto tempo guardar o registro; proposta: 5 anos, para responder a um pedido da pessoa ou da autoridade]
- A pessoa pode pedir, pelo e-mail de privacidade, para saber se o conteúdo dela foi acessado e por quê.

## 6. Pedido de autoridade

1. Conferir que o pedido é formal, por escrito, de autoridade competente, e diz o que quer e com que base.
2. Entregar só o que foi pedido.
3. Registrar na seção 5.
4. Avisar a pessoa, a menos que a lei ou a ordem proíba. [A DEFINIR: procedimento confirmado pelo advogado, item B6]

## 7. Incidente

Se alguém de fora alcançar dados, ou se um acesso fugir desta regra, o Enzo registra o que aconteceu e segue o procedimento de incidente
da política. [A DEFINIR: prazo e forma de comunicação, item B4]

## 8. Perguntas ao advogado

1. Esta regra atende ao que a política promete e à LGPD (arts. 46 a 49, segurança e boas práticas)?
2. O registro manual em planilha é suficiente no começo?
3. Prazo de guarda do registro de acessos.
4. O Claude Chrome, operando na sessão do Enzo, precisa de alguma menção própria na política ou nesta regra?
