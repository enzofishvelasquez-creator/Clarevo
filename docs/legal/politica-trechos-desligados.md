# Trechos da política guardados à parte (A14 e A15)

Decidido em 04/11/2026 (A14 e A15 de `pendencias-do-lancamento.md`): os formulários do site (contato para empresas e Novidades por e-mail) e o WhatsApp ficam desligados no lançamento. Os trechos da política que falavam deles saíram do texto publicado e ficam guardados aqui, para voltar quando cada recurso for ligado. Este arquivo não é publicado.

Para voltar a ligar: devolva os trechos ao lugar indicado, renumere as seções 3.x de novo (no texto publicado, depois da 3.5 vêm "Como você conheceu a Clarevo?" (3.6), as contagens (3.7), o Telegram (3.8) e a assinatura (3.9)), confira as referências "seção 3.x" e ligue o interruptor em `site/dados-da-empresa.json` (`formulario_contato`, `newsletter`). O gerador do site recusa formulário ligado sem a seção, e seção sem o formulário (seções "Contato pelo site" e "Novidades por e-mail"). Os números de seção abaixo são os de antes da retirada.

## Seção inteira (entre a 3.5 e a seção "Como você conheceu a Clarevo?")

### 3.6 Contato pelo site

[PROPOSTA: seção a incluir só quando o formulário de contato da página "Para empresas" estiver ligado.]

Se você usar o formulário de contato da página "Para empresas":

- **Dados.** Nome, e-mail, nome da empresa, a faixa do número aproximado de pessoas (por exemplo, "de 51 a 200 pessoas") e a mensagem que você escrever. O formulário não pede nem envia outros dados. Não escreva dados financeiros nem de pessoas que trabalham na empresa.
- **Para quê.** Para responder ao seu contato sobre a Clarevo para empresas, como a conversa sobre um piloto do benefício.
- **O site não guarda a mensagem.** Ela não é gravada em banco de dados nem em arquivo do site. O pedido chega ao servidor do site, que o repassa por e-mail à equipe da Clarevo e não guarda nada.
- **Quem trata.** A Cloudflare, que hospeda o site, recebe o pedido de envio e o seu IP, e o Resend, serviço de envio de e-mail, entrega a mensagem à equipe e guarda uma cópia dela nos registros dele, por [A DEFINIR: prazo de guarda no Resend]. Os dois tratam os dados a serviço da Clarevo, como operadores. [A DEFINIR: confirmar o papel de operador, o país e o contrato de cada um]
- **Por quanto tempo.** A mensagem fica na caixa de e-mail da Clarevo por [A DEFINIR: prazo na caixa de e-mail], e a cópia nos registros do Resend, por [A DEFINIR: prazo de guarda no Resend]. Você pode pedir a eliminação por [E-MAIL DE PRIVACIDADE].

## Seção inteira (entre a 3.5 e a seção "Como você conheceu a Clarevo?")

### 3.7 Novidades por e-mail

[PROPOSTA: seção a incluir só quando o cadastro das Novidades por e-mail estiver ligado.]

Se você pedir para receber as Novidades por e-mail:

- **Dado.** O seu e-mail. O formulário não pede mais nada.
- **Para quê.** Só para enviar as Novidades da Clarevo, os textos curtos da página Novidades, com data e fonte. Não enviamos publicidade de terceiros nem vendemos a lista.
- **Consentimento.** Você marca a caixa "Quero receber as Novidades da Clarevo por e-mail. Posso cancelar quando quiser.", que vem desmarcada, e depois confirma o cadastro em um e-mail que enviamos (dupla confirmação). Sem confirmar, você não entra na lista e não recebe nada.
- **Quem trata.** O Brevo, serviço de envio de e-mail, guarda o seu e-mail na lista e a confirmação do cadastro, e envia as Novidades. A Cloudflare recebe o pedido do formulário. Os dois tratam os dados a serviço da Clarevo, como operadores. O site não grava o e-mail. [A DEFINIR: rastreamento de abertura e clique desligado no Brevo] [A DEFINIR: confirmar o que o Brevo registra da confirmação (data, hora e IP), o país e o contrato]
- **Cancelar.** Todo e-mail das Novidades traz um link para cancelar, do próprio Brevo. Você também pode pedir por [E-MAIL DE PRIVACIDADE]. [A DEFINIR: por quanto tempo o Brevo mantém o e-mail depois do cancelamento, e se ele é eliminado da lista]

## Seção inteira (antes da seção do Telegram)

### 3.10 Anotar pelo WhatsApp (opcional)

[PROPOSTA: seção a incluir junto com a abertura do WhatsApp a todas as pessoas. A base legal, o papel da Meta e a transferência internacional ainda não foram confirmados juridicamente.]

Você pode ligar o seu número de WhatsApp à Clarevo, em Conta, e anotar gastos e recebimentos mandando mensagens escritas para o número da Clarevo, como "mercado 52,30". Ligar é opcional, e nada no app depende disso.

- **Como liga.** O app gera um código, que vale 15 minutos e serve uma vez, e você o manda pelo WhatsApp do número que vai usar. Da Clarevo, fica guardado só um resumo do código, nunca o código.
- **O que guardamos.** O que vira registro, como qualquer anotação do app (seção 3.2), no espaço que você escolheu (Pessoal ou Família). Do seu número, só um resumo feito com uma chave secreta (HMAC-SHA256), que serve para reconhecer quem escreve; sem a chave, o resumo não volta ao número. De cada mensagem tratada, por 30 dias, guardamos um resumo, feito com a mesma chave, do identificador que a Meta dá à mensagem (para não anotar duas vezes a mesma; o identificador em si traz o número e não é guardado), o resumo do número, o resultado (por exemplo, "anotado") e o registro criado, para você poder desfazer. **Não guardamos o texto das mensagens nem o seu número.**
- **Áudio, foto e figurinha.** A Clarevo não lê nem guarda. A resposta pede uma mensagem escrita.
- **Quem participa.** As mensagens passam pelos servidores da Meta, empresa dona do WhatsApp, que presta o serviço de mensagens para empresas (WhatsApp Cloud API). Nesse trecho, a mensagem deixa de ter a criptografia de ponta a ponta do WhatsApp, e a Meta trata o conteúdo como operadora, em nome da Clarevo (seção 8).
- **As respostas.** A Clarevo só responde à mensagem que você mandou, em texto, para o mesmo número. Ela não manda mensagens por iniciativa própria, propaganda nem lembretes pelo WhatsApp.
- **Para quê.** Só para anotar, desfazer e responder às suas mensagens. Não usamos o WhatsApp para anúncio, para montar perfil nem para falar com você sobre outros assuntos.
- **Como desliga.** Em Conta, na tela do WhatsApp, ou mandando DESLIGAR (ou PARAR) para o número da Clarevo. Ao desligar, o vínculo é apagado na hora; o que você já anotou continua no app. Se você trocar de número no WhatsApp, o número antigo é desligado sozinho.
- **Por quanto tempo.** O vínculo, enquanto você não desligar nem excluir a conta. As mensagens tratadas, por 30 dias. Ao excluir a conta, o vínculo, o código e as mensagens tratadas são apagados junto.

## O essencial

- Se você ligar o WhatsApp para anotar por mensagem, as mensagens passam pela Meta, dona do WhatsApp. A Clarevo não guarda o texto das mensagens nem o seu número.

## Seção 4 (O que não guardamos?)

- O texto das mensagens do WhatsApp e o seu número de telefone. Do número, guardamos só um resumo feito com chave secreta (seção 3.10).

## Seção 6 (bases legais)

- Contato pelo formulário do site (seção 3.6): [PROPOSTA: procedimentos preliminares relacionados a contrato, a pedido da pessoa (art. 7º, V); alternativa, legítimo interesse (art. 7º, IX)]. [A DEFINIR: confirmar a base]

## Seção 6 (bases legais)

- Novidades por e-mail (seção 3.7): consentimento (art. 7º, I), que você pode revogar a qualquer momento, cancelando pelo link de qualquer e-mail (art. 8º, § 5º). [A DEFINIR: confirmar a base e a forma de registrar o consentimento]

## Seção 6 (bases legais)

- Anotar pelo WhatsApp (seção 3.10): [PROPOSTA: execução de contrato, a pedido da pessoa, que liga o número quando quer (art. 7º, V)]. [A DEFINIR: confirmar a base e o papel da Meta como operadora]

## Seção 8 (serviços), depois da Resend

- **Meta (WhatsApp Business, Cloud API), só para quem liga o WhatsApp** (seção 3.10). Recebe as mensagens que você manda para o número da Clarevo, o seu número e as respostas, e atua como operadora, em nome da Clarevo. Guarda o conteúdo das mensagens por até 30 dias, para entregá-las. [PROPOSTA: pedir à Meta o armazenamento das mensagens no Brasil ao registrar o número da Clarevo; sem isso, o conteúdo fica guardado nos Estados Unidos.] [A DEFINIR: termos da Meta para empresas, transferência internacional (LGPD, art. 33) e o que a Meta faz com os dados técnicos das conversas]

## Seção 8, em "Estão previstos"

- **Resend** (envio da mensagem do formulário de contato do site, seção 3.6, se for ligado). Receberá o que você escrever no formulário e guarda uma cópia nos registros dele. [A DEFINIR: país e contrato; é o mesmo serviço dos e-mails de cadastro, acima]

## Seção 8, em "Estão previstos"

- **Brevo** (Novidades por e-mail, seção 3.7, se forem ligadas). Receberá o seu e-mail e a confirmação do cadastro. [A DEFINIR: país e contrato]

## Seção 11 (prazos), antes do Telegram

- **WhatsApp** (seção 3.10). O vínculo do número, enquanto você não desligar nem excluir a conta. As mensagens tratadas (sem o texto e sem o número), por 30 dias. O que virou registro segue a regra dos registros. Na Meta, o conteúdo das mensagens fica por até 30 dias.

## Seção 11 (prazos)

- **Mensagem do formulário de contato** (seção 3.6). Fica na caixa de e-mail da Clarevo por [A DEFINIR: prazo na caixa de e-mail], e uma cópia fica nos registros do Resend por [A DEFINIR: prazo de guarda no Resend]. O site não a guarda.

## Seção 11 (prazos)

- **E-mail das Novidades** (seção 3.7). Fica no Brevo enquanto você não cancelar. [A DEFINIR: prazo depois do cancelamento]

## Seção 12 (direitos)

- Nas Novidades por e-mail, cancele pelo link de qualquer e-mail das Novidades.

## Seção 2, no item das páginas do site (o texto publicado termina em "...nem guardado)." e segue o marcador)

, o formulário de contato para empresas e o cadastro das Novidades por e-mail (seções 3.6 e 3.7). [PROPOSTA: os dois formulários só valem depois de ligados; até lá, o site não tem formulário.]

## Seção 8, no item da Cloudflare, depois de "...e não recebe o que você anota."

Se o formulário de contato ou o cadastro das Novidades estiver ligado, o pedido de envio também passa por ela, que o entrega ao site e não o guarda.

## Seção do Telegram, no primeiro parágrafo (antes de "Ligar é opcional")

Funciona como o WhatsApp (seção 3.10), e um não depende do outro.
