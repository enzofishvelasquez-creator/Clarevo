# Clarevo · Kit do teste com 5 pessoas (D-064, etapa 1)

26/10/2026. Kit para Enzo conduzir nesta semana o teste da etapa 1 do D-064: cada pessoa cria uma conta de teste no app com login real (https://clarevo.pages.dev), usa só valores inventados e apaga a conta no fim. Valem as regras de condução e de resumo de `docs/15_TESTE_DE_USABILIDADE.md`; a diferença é que aqui a pessoa começa do cadastro, numa conta vazia, e não na demonstração. O banco está no plano gratuito do Supabase, sem cópia de segurança: só dados de teste.

## 1. Antes da primeira sessão

1. **E-mail de confirmação.** O cadastro só termina com o link enviado por e-mail, e o envio padrão do Supabase manda poucos e-mails por hora e só para membros da organização (`docs/07`). Ligue o SMTP próprio com o domínio clarevo.app.br (`docs/20`, seção 2) e crie uma conta com um e-mail de fora da equipe: o link precisa chegar em poucos minutos. Depois, exclua essa conta (seção 4.4).
2. **Plano B, sem SMTP pronto:** faça as tarefas 1 a 7 em https://clarevo-demo.pages.dev, com "Criar conta" (não "Ver demonstração com dados fictícios") e, em "Confira seu e-mail", "Simular abertura do link". A conta começa vazia e fica só naquela aba, o app considera hoje 07/10/2026 e a tarefa 8 fica de fora.
3. **Projeto ativo.** O plano gratuito pausa o projeto depois de dias sem uso: na véspera de cada sessão, entre em https://clarevo.pages.dev com a sua conta de teste e confira que o Resumo abre.
4. **Endereço.** Use https://clarevo.pages.dev (app.clarevo.app.br ainda não está ativo) e mande o link só no começo da sessão: o primeiro contato faz parte do teste.
5. **Material.** Uma ficha da seção 5 por pessoa, caneta e o cronômetro do celular.

## 2. Convite para o WhatsApp

> Oi, [nome]! Tudo bem?
>
> Estou criando a Clarevo, um app para organizar o dinheiro do mês, e queria sua ajuda num teste de 30 a 40 minutos, on-line (chamada de vídeo) ou presencial, como for melhor para você. Você usa o app e eu observo o que fica claro e o que confunde. Quem está em teste é o app, não você.
>
> Importante: não use nenhum dado financeiro seu. O banco de dados do app ainda está em fase de teste, então tudo é feito com valores inventados, que eu passo na hora. Você só precisa de um e-mail que consiga abrir no celular, para confirmar o cadastro, e no fim apagamos a conta de teste.
>
> Pode dizer não sem problema, e dá para parar a qualquer momento. Se topar, me diga um dia e horário desta semana.

## 3. Quem convidar

| Código | Idade | Renda e trabalho | Quem organiza a casa | Cartão de crédito |
|---|---|---|---|---|
| P1 | 18 a 29 | Primeiro emprego ou estágio, salário fixo | Mora com a família e não cuida das contas | Não tem ou usa pouco; Pix e débito |
| P2 | 30 a 44 | Carteira assinada, renda média | Divide as contas com outra pessoa | Usa todo mês, com parcelas |
| P3 | 30 a 50 | Renda que muda todo mês (conta própria, MEI ou comissão) | Cuida das contas da casa sem dividir | Usa às vezes |
| P4 | 45 a 59 | Renda mais alta, em empresa | Cuida das contas da família (escola, plano de saúde) | Dois cartões ou mais |
| P5 | 60 ou mais | Aposentadoria ou pensão | Anota no papel ou de cabeça | Não tem ou tem um só |

Pelo menos 3 pessoas que trabalham em empresa (quem recebe a Clarevo como benefício), Android e iPhone misturados e pelo menos 2 que nunca usaram app de finanças. Evite quem tem muita proximidade com você ou trabalha no projeto: costuma poupar críticas. Para a tarefa 8, ajuda se duas das cinco dividirem a casa.

## 4. Roteiro da sessão (30 a 40 minutos)

### 4.1 Abertura e consentimento (5 minutos)

> "Agradeço por participar. Hoje você vai experimentar um aplicativo novo para organizar o dinheiro do mês. Quem está em teste é o aplicativo, não você: não existe resposta certa, e se algo confundir, isso ajuda muito. Vou pedir algumas tarefas, uma de cada vez. Use como usaria no dia a dia e, se puder, fale em voz alta o que está pensando. Eu anoto, mas não ajudo durante a tarefa. Não digite nada real além do e-mail: nem valores, nem nome de banco, nem número de cartão. Eu passo os valores inventados, e no fim apagamos a conta."

Leia os quatro pontos, peça o sim de viva voz e marque na ficha. Sem o sim, a sessão não começa.

1. Participo por escolha e posso parar a qualquer momento, sem dar motivo.
2. Uso só valores inventados; o único dado real é o e-mail, e a conta é apagada no fim.
3. Não há gravação.
4. As anotações ficam com um código (P1 a P5), sem nome, e posso pedir que sejam apagadas pelo contato@clarevo.app.br.

Sem gravação é o padrão, como no `docs/15`. Se quiser gravar, troque o item 3 por "Só a tela do app é gravada, sem voz e sem rosto, e o vídeo é apagado depois do resumo", e só grave com o sim da pessoa.

### 4.2 Tarefas (20 a 25 minutos)

Como no `docs/15` (seção 3.3): leia a tarefa sem os nomes dos botões; não ajude ("O que você faria se eu não estivesse aqui?"); encerre com 4 minutos sem avanço; ao fim de cada uma, pergunte "Foi como você esperava?". Se a tarefa 1 não terminar, ajude a concluir o cadastro, marque N e siga. Na hora de abrir o e-mail, peça que a pessoa pause o compartilhamento de tela (on-line) ou vire o celular (presencial).

| # | O que se lê para a pessoa | Caminho no app (só para Enzo) | O que observar |
|---|---|---|---|
| 1 | "Crie uma conta no aplicativo, com um apelido e o seu e-mail, até chegar à tela inicial." | "Criar conta" › "Nome de apresentação", "E-mail", "Senha" › "Criar conta" › "Confira seu e-mail" › link do e-mail (ou "Já confirmei meu e-mail") › "Sua primeira conta" › "Começar meu mês" › tour de 5 cartões ("Próximo", "Pular", "Começar") | Quanto o e-mail demora; se entende que a conta de "Sua primeira conta" é onde o dinheiro entra e sai, não o cadastro; se lê ou pula o tour |
| 2 | "Você pagou R$ 45,00 no mercado hoje, no Pix. Anote esse gasto." | Resumo › "Anotar gasto" › "Descrição", "Valor em reais", "Como você pagou?" ("Dinheiro, débito ou Pix"), "Data do pagamento", categoria "Mercado" › "Salvar gasto" | Se escolhe a categoria; se percebe "Gasto salvo" e o Pago subir |
| 3 | "Você recebeu R$ 2.500,00 de salário este mês. Anote." | Card "Primeiros passos" › "Registre o que você recebeu este mês", ou Movimentos › "Registrar recebimento" › "Descrição", "Valor em reais", "Data do recebimento", categoria "Salário" › "Salvar recebimento" | Onde procura primeiro (o Resumo só tem "Anotar gasto"); se tenta usar "Anotar gasto" |
| 4 | "A conta de luz, de R$ 180,00, vence amanhã e ainda não foi paga. Anote para não esquecer." | Resumo › card "Ainda a pagar neste mês" › "Anotar conta a pagar" › "Descrição", "Valor em reais", "Data de vencimento" ("Amanhã"), "Com que frequência?" ("Só uma vez") › "Salvar conta a pagar" | Se anota como gasto (aí a luz conta como paga); se acha o link dentro do card. No último dia do mês, troque "amanhã" por "hoje" |
| 5 | "Olhe a tela inicial e me explique, com suas palavras, o número grande lá no alto." Depois: "E a conta de luz, onde ela aparece?" | "Diferença do mês": R$ 2.455,00, com "Recebido menos pago até [data] · não é saldo"; a luz fica em "Ainda a pagar neste mês" (R$ 180,00) | Se lê como saldo do banco; se lê a legenda; se esperava a luz descontada; se toca no número |
| 6 | "Você quer juntar R$ 3.000,00 para uma viagem. Crie uma meta para isso." | Metas › "Nova meta" › "Tipo de meta" ("Objetivo"), "Nome da meta", "Valor da meta", "Até quando? (opcional)" › "Criar meta" | Reação a "Tipo de meta" e a "Reserva de oportunidade"; se o card "Você consegue guardar algum valor por mês?" atrapalha |
| 7 | "Você quer entender quanto guardar para imprevistos. Procure uma explicação no aplicativo." | Aprender › "Buscar um tema ou uma função" (ex.: reserva) ou a seção "Organizar o mês" › "Reserva para imprevistos" | Se busca ou rola; se lê até o exemplo; se nota a fonte e a data de revisão |
| 8 (opcional) | Duas pessoas do teste, ou a pessoa e a sua conta de teste: "Vocês dividem as contas da casa. Organizem no aplicativo um lugar para anotar essas contas em conjunto." | Avatar com as iniciais (alto, à direita) › Conta › "Criar Família" › "Criar Família" › "Nome da Família" › "Criar Família" › "Convidar" › "O que a pessoa poderá fazer" ("Anota e vê" ou "Só vê") › "Gerar link" › "Copiar link" ou "Compartilhar"; a outra pessoa, já com conta, abre o link › "Aceitar convite" | Se procura a Família em Conta; se entende os papéis; se entende que o Pessoal de cada pessoa continua separado (seletor "Pessoal" e "Família" no Resumo) |

Tarefa 5 na ficha: S se explica como o que entrou menos o que saiu e diz que não é o saldo da conta; D se explica em parte; N se entende como saldo do banco ou não sabe.

### 4.3 Perguntas finais (5 minutos)

Uma de cada vez, anotando as palavras da pessoa: "O que foi mais fácil?"; "O que confundiu? Alguma palavra você não entendeu?"; "Você usaria isto no seu mês? Em que situação?"; "Se pudesse mudar uma coisa, qual seria?". Se a pessoa quiser, mostre o caminho do que ela não concluiu.

### 4.4 Apagar a conta de teste (3 minutos)

Com a pessoa: Conta › último item, "Excluir minha conta" › "Ver o que é apagado" › "Digite EXCLUIR para confirmar" › "Excluir minha conta" › "Sua conta foi excluída". Não precisa exportar. Se houve Família, quem entrou sai antes (Conta › "Abrir Família" › "Sair da Família") e depois quem criou exclui a conta; a Família é apagada junto. Conta excluída também sai das contagens semanais de cadastro. Exclua a sua conta de teste no fim da semana.

## 5. Ficha por pessoa

Código: P__ · Data: __/__/____ · ( ) presencial ( ) on-line · ( ) celular ( ) computador · Sim de viva voz ( ) · Gravação ( ) não ( ) só a tela · Conta excluída ( )

| Tarefa | Concluiu (S, D, N, X) | Tempo | Onde travou (tela, botão ou palavra) | Frase dita, entre aspas | Foi como esperava? |
|---|---|---|---|---|---|
| 1 Criar conta | | | | | |
| 2 Anotar gasto | | | | | |
| 3 Anotar recebimento | | | | | |
| 4 Conta a pagar | | | | | |
| 5 Explicar a Diferença do mês | | | | | |
| 6 Criar meta | | | | | |
| 7 Aprender | | | | | |
| 8 Família (opcional) | | | | | |

Perguntas finais: mais fácil ______ · confundiu ______ · usaria? ( ) sim ( ) talvez ( ) não, situação ______ · mudaria ______

S: sim, sem ajuda. D: sim, com dúvida. N: não concluiu. X: desistiu. Anote o que viu e ouviu, nunca uma conclusão, sem nome e sem dado pessoal (`docs/15`, seção 5).

## 6. Como juntar os resultados das 5 pessoas

No mesmo dia da última sessão, numa folha só:

1. **Quadro.** Uma linha por tarefa e uma coluna por pessoa (P1 a P5), com S, D, N ou X e quantas concluíram; Passou, Ajustar ou Refazer como no `docs/15`, seção 6.
2. **O que repetiu.** Cada problema numa linha, com quem passou por ele. Em 3 ou mais pessoas: **prioridade**, resolver primeiro. Em 2: lista de mudanças, como no `docs/15`. Em 1: "observar de novo".
3. **Ordem das prioridades:** Impede, depois Atrasa, depois Incomoda (`docs/15`, seção 6).
4. **Perguntas finais.** Some sim, talvez e não de "usaria" e copie as situações citadas.

| Problema (tela, botão ou palavra) | Pessoas | Frase que mostra | Gravidade | Mudança proposta |
|---|---|---|---|---|
| | | | | |

Cada prioridade vira pendência em `docs/00_VISAO_E_DECISOES.md`. O resumo não propõe produto financeiro, crédito nem investimento.

## 7. Cuidados

- **Só dados inventados.** Se aparecer um dado real, peça que a pessoa apague o registro e não anote o dado.
- **A pessoa pode parar quando quiser,** sem dar motivo, e pedir que as anotações sejam apagadas.
- **Sem pagamento nem brinde que pareça compra de opinião.** Se quiser agradecer, algo simples e igual para todas as pessoas (um café, por exemplo), combinado antes e sem depender do que disserem.
- **Sem promessa.** Se perguntarem quando o app chega ou o que vai ter, responda "ainda não está definido".
- **Depois de passar a limpo,** guarde só as fichas com o código e apague o resto das anotações e as gravações.
