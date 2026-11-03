# WhatsApp: os caminhos possíveis (estudo de 03/11/2026)

Contexto: a conta do WhatsApp da Clarevo está bloqueada (erro 131031, violação `SCRIPTED_BM`, docs/32 seção 5c) e a Meta manteve a restrição de anúncios do portfólio "Clarevo" depois da revisão. O Telegram (D-080) já está no ar e passa a ser o canal de mensagens do app para todas as pessoas (D-081). Este estudo compara o que existe para o WhatsApp voltar, sem pressa.

Fontes: a documentação da Meta não abriu no ambiente da equipe (rede bloqueada); os pontos abaixo vêm de buscas e de guias de terceiros, listados no fim. Antes de qualquer decisão com custo, conferir na página de preços da Meta e no painel.

## 1. O que mudou desde o D-076

- **Já não é sem custo.** O D-076 partiu de "a Clarevo só responde dentro da janela de 24 horas, que a Meta não cobra". Pelas fontes de outubro de 2026, a Meta voltou a cobrar as respostas dentro da janela a partir de 1º de outubro de 2026. Há divergência sobre uma franquia de 1.000 mensagens de serviço por número por mês; uma fonte cita cerca de R$ 0,035 por mensagem de serviço depois dela. No Brasil, a cobrança passou a ser em reais em julho de 2026. Ou seja: para uma pessoa que anota 2 vezes por dia, a resposta de cada anotação passa a ter custo depois da franquia, se ela existir para a Clarevo.
- **O bloqueio é da conta do WhatsApp, e a restrição de anúncios é do portfólio.** São duas coisas: o e-mail da Meta fala de anúncios e públicos; o erro 131031 é da conta do WhatsApp (WABA 1679227277245978).

## 2. Os caminhos

| Caminho | O que é | Custo | Risco | Quem faz |
|---|---|---|---|---|
| **A. Pedir a revisão do bloqueio da conta do WhatsApp** | Em Business Support Home ou em Qualidade da conta, escolher a violação da conta do WhatsApp e tocar em "Solicitar análise", com uma explicação verdadeira (o portfólio foi criado com ajuda de automação no navegador, não para enviar mensagens em massa; o uso é só responder a quem escreve). Completar a verificação da empresa com o cartão CNPJ. | R$ 0 | A decisão pode ficar "Inalterada". As fontes dizem que costuma sair em 24 a 48 horas e pedem **um só** pedido bem explicado (pedidos repetidos atrasam). Se não houver botão de revisão, a decisão não é apelável por aquela conta. | Enzo, à mão |
| **B. Portfólio novo** | Criar outro portfólio e outra conta do WhatsApp. | R$ 0 | **Não recomendado agora.** Os guias de terceiros dizem que a Meta trata isso como contorno de restrição e pode restringir o portfólio novo e o antigo, porque cruza pessoa, empresa, aparelho, IP e pagamento. Corrige o que o docs/32 (5c, passo 3) dizia. Só considerar se a Meta indicar por escrito, numa resposta de suporte. | Enzo, à mão |
| **C. Intermediário oficial (BSP)** | Um parceiro oficial da Meta (360dialog, Twilio, Gupshup, Zenvia, Blip) cuida da conta. | Mensalidade (uma fonte cita de R$ 97 a R$ 997, ou 10% a 30% sobre o preço da Meta; a Zenvia cita plano a partir de R$ 600 por mês) mais as mensagens | Continua passando pela Meta: o parceiro pede o portfólio e a verificação. Não resolve o bloqueio sozinho. | Contrato da empresa |
| **D. Sem a Meta (QR Code: Z-API, Evolution API com Baileys e semelhantes)** | Um serviço imita o WhatsApp Web num celular comum. Provavelmente o que o outro desenvolvedor usou. | Baixo | **Não recomendado.** Contra os termos do WhatsApp; o número pode ser banido sem aviso (há relatos no próprio projeto Evolution API). O serviço teria acesso a todas as mensagens do número, o que pesa para um app de finanças e para a LGPD. A Evolution API também conecta pela API oficial da Meta, mas aí volta ao caminho A ou C. | Não fazer |
| **E. Ficar no Telegram** | O canal já funciona, de graça, sem aprovação de ninguém. | R$ 0 | Menos gente usa Telegram do que WhatsApp no Brasil. | Já feito (D-080, D-081) |

## 3. Recomendação

1. **Agora:** Telegram para todas as pessoas (D-081). O WhatsApp fica escondido no app (piloto fechado, `WHATSAPP_IN_ACCOUNT = false`), sem mudança no código.
2. **Em paralelo, sem pressa (Enzo, à mão):** abrir Qualidade da conta e Business Support Home e ver o que aparece para a conta do WhatsApp. Se houver "Solicitar análise", fazer **um** pedido, com a verificação da empresa completa antes. Mandar à equipe um print do resultado (sem dados de senha).
3. **Se a revisão reverter o bloqueio:** decidir o custo (seção 1) antes de abrir a todos. Com a cobrança das respostas, vale estudar uma franquia por pessoa ou deixar o WhatsApp como opção paga.
4. **Não fazer:** portfólio novo para contornar a restrição, nem serviço por QR Code.

O código do WhatsApp continua pronto e testado: se a conta voltar, falta só publicar de novo a função do WhatsApp (ela passou a guardar só o resumo do identificador de cada mensagem, D-080) e conferir o número.

## 4. Fontes (consultadas em 03/11/2026)

- Erro 131031 e revisão: [WANotifier](https://help.wanotifier.com/en/article/fix-error-131031-business-account-locked-30ybl0/), [ChatDaddy](https://help.chatdaddy.tech/article/waba-error-131031-business-account-has-been-locked-appeal-steps), [Chakra](https://chakrahq.com/article/whatsapp-api-error-131031-business-account-locked-what-it-means-and-how-to-fix-it-fast/), [Vonage](https://api.support.vonage.com/hc/en-us/articles/25859589458972-WhatsApp-Business-Account-Locked-Error-1330), [fórum da Meta](https://developers.facebook.com/community/threads/1395995842682706/).
- Portfólio novo e contorno: [Metricool](https://help.metricool.com/why-meta-may-restrict-a-new-business-account-connected-to-metricool-4hsnq), [OneChatAI](https://help-onechatai.telavi.com.ph/whatsapp-meta/recover_restricted_account), [Vonage, limite de portfólios](https://api.support.vonage.com/hc/en-us/articles/30135779943708-Unable-to-Create-a-New-Meta-Business-Portfolio-Creation-Limit-Reached), [Bird](https://bird.com/docs/knowledge-base/whatsapp/account-restrictions-and-appeals), [fórum da Meta, restrição por automação](https://developers.facebook.com/community/threads/1438234438064193/).
- Preços: [respond.io](https://respond.io/blog/whatsapp-business-api-pricing), [WATI](https://www.wati.io/en/blog/whatsapp-service-message-pricing/), [WAWCD](https://wawcd.com/blog/whatsapp-pricing-change-october-2026), [Hyperleap](https://hyperleap.ai/whatsapp-pricing-calculator-brazil), [SocialHub](https://www.socialhub.pro/blog/api-oficial-whatsapp-preco-2026/), [Kommo](https://support.kommo.com/docs/updated-pricing-rules-for-whatsapp-business.md), [Zenvia](https://support.zenvia.com/kb/en/article/600343/preguntas-frecuentes-nuevas-reglas-de-cobro-de-whatsapp-business).
- API não oficial: [Hora de Codar](https://horadecodar.com.br/evolution-api-vs-api-oficial-whatsapp/), [Clint](https://clint.digital/blog/riscos-whatsapp-nao-oficial-2026), [Evolution API, relato de banimento](https://github.com/EvolutionAPI/evolution-api/issues/2228).
