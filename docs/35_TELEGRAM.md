# Anotar pelo Telegram (D-080)

01/11/2026. O mesmo "anotar por mensagem" do WhatsApp (D-076, `docs/32_WHATSAPP.md`), por um bot da Clarevo no Telegram. Entrou porque a conta empresarial da Clarevo na Meta está restrita (seção 5c do documento do WhatsApp) e o Telegram não depende de nenhuma aprovação: o bot é criado em poucos minutos, no próprio Telegram, e a API de bots é gratuita. O código está pronto e testado; falta a parte do Enzo (criar o bot e guardar os segredos), na seção 5.

## 1. O que a pessoa faz

1. No app, em **Conta > Telegram** (aberto a todas as pessoas desde 03/11/2026, D-081; a tela também abre por https://app.clarevo.app.br/conta/telegram), escolhe o espaço (Pessoal ou a Família em que anota) e toca em **Gerar código**.
2. Toca em **Abrir o Telegram**: abre a conversa com o bot da Clarevo. Toca em **Iniciar**, e o Telegram manda o código sozinho (se o Telegram não abrir, a tela mostra o @ do bot e a pessoa manda "Ativar" e o código).
3. A Clarevo responde que a conta está ligada e mostra os exemplos.
4. Daí em diante, as mesmas mensagens do WhatsApp: `mercado 52,30`, `farmácia 38 ontem`, `recebi 1500 salário`, `farmácia 41 cartão` (compra no cartão de crédito, D-089 C; com mais de um cartão, o nome depois: `farmácia 41 cartão azul`), `DESFAZER`, `DESLIGAR`, `AJUDA`. No Telegram também valem os comandos `/desfazer`, `/desligar` e `/ajuda`.

A leitura e as respostas são as do WhatsApp (`packages/core/src/whatsapp/mensagem.ts` e `respostas.ts`), com o nome do canal: "este Telegram está ligado à conta de Ana na Clarevo". Com o card em Conta (D-081), as respostas mandam abrir Conta e tocar em Telegram; num piloto fechado, apontariam o endereço da tela (`packages/core/src/whatsapp/canais.ts`). A pessoa pode ter o WhatsApp e o Telegram ligados ao mesmo tempo: cada canal tem o seu vínculo e o seu código, e DESFAZER e DESLIGAR só mexem no próprio canal.

## 1a. No espaço Negócio (27/11/2026)

**No ar desde 27/11/2026** (D-131: a migração 0049 aplicada e conferida e a função `telegram` publicada de novo, com 1762 linhas; a `whatsapp` continua na versão de antes, em piloto fechado). Pedido do Enzo, no lugar do item 5 da D-113 para os canais de mensagem (que deixava o Telegram só no Pessoal). O vínculo continua **um por canal, no Pessoal ou na Família** em que a pessoa anota: o código de ligar ainda recusa o negócio (D-113a). O que muda é a mensagem:

- **A palavra "negócio" no começo** (ou "negocio", em qualquer caixa, com ":", "," ou "." logo depois se quiser) anota no espaço Negócio da própria pessoa: `negócio material 120`, `negócio recebi 300 conserto`, `negócio gasolina 80 cartão`. O resto da mensagem segue as regras de sempre (valor, data, recebimento, cartão). Sem a palavra, nada muda. Só no negócio (revisão independente da D-131): o DAS fica na descrição e vai para Impostos e DAS (`negócio DAS 76,60` é "DAS", `negócio guia do das 76` é "Guia do DAS", `negócio das do mei 76` é "DAS do MEI"; "das" no meio, como em "venda das camisetas", segue palavra de ligação); "vendi" é de recebimento, como "recebi", e venda paga no cartão é entrada, nunca compra no cartão do negócio (`negócio vendi 80 no cartão` é a entrada "Vendas", categoria Vendas). Só como primeira palavra inteira: "negócios 50" e "material negócio 120" são anotações comuns. Depois da palavra, só anotar vale (e DESFAZER); "negócio desligar" e "negócio" sozinho recebem a ajuda, para DESLIGAR nunca ficar escondido atrás da palavra.
- **As categorias do negócio** (`BUSINESS_CATEGORIES`, em `packages/core/src/business-categories.ts`): o nome escrito ("negócio vendas 450") ou regras simples de palavras do negócio ("material" é Material e mercadoria; "conserto", Serviços; "gasolina", Combustível e transporte; "maquininha", Taxas e maquininha), nunca as do Pessoal. Na compra no cartão do negócio, sem "Parcela de empréstimo" e "Equipamento" (fora da operação, D-121), como na escolha do app.
- **"cartão"** usa os cartões do negócio, com as mesmas regras do Pessoal (um cartão: é ele; mais de um: o nome depois da palavra escolhe; senão, a resposta pergunta, listando os do negócio). Um cartão do Pessoal nunca recebe compra com a palavra "negócio".
- **A resposta** diz o nome do negócio, no estilo de sempre, com as palavras do negócio no app: "Anotado no espaço Sacolé da Maria: Saída: Material, R$ 120,00 ...". DESFAZER desfaz a última anotação do canal, no negócio ou no espaço ligado.
- **Sem negócio** (ou só anotando no negócio de outra pessoa, do Clarevo Plus, desligado): nada é gravado e a resposta diz como criar, sem falar do Plus: "Nada foi anotado. Para anotar no negócio por aqui, crie antes o espaço Negócio no app: abra Conta e toque em Criar o espaço Negócio. Sem a palavra negócio no começo, a mensagem anota como sempre."
- **As marcas do negócio** ("Teve nota fiscal?" e "Quem pagou") ficam vazias: a pessoa preenche no app.
- **Só para quem tem negócio**: a ajuda e a resposta de ligado mostram a palavra só a quem tem o próprio negócio (o banco devolve `"negocio": true`); a tela do Telegram mostra o card "No seu negócio" só para quem administra o negócio. O guia (que é o mesmo para todo mundo) diz "Com o espaço Negócio, comece com a palavra negócio...".

Segurança: o servidor só tira a palavra do começo e chama `telegram_add_business_record` ou `telegram_add_business_card_purchase` com os mesmos argumentos das de sempre (o espaço nunca vai na chamada). O banco acha o negócio pela pessoa do vínculo (`clarevo_own_business`: o negócio ativo que ela criou, como dona e titular com escrita), toma a trava de `end_business` e confere de novo, e anota pelas mesmas `create_record` e `add_card_purchase` em nome da pessoa: autoria, permissão de escrita e a trava "só ver e exportar" (`sem_assinatura`) são as de sempre. Migração 0049 (`supabase/migrations/20261127000003_telegram_negocio.sql`; docs/05, passos 12ap e 21ak), testes em `supabase/tests/99zzzzzzzzzzzzzzzzzzzzzzzzzzzz_telegram_negocio.sql` e `packages/core/test/telegram-negocio.test.ts`. O WhatsApp usa a mesma leitura (`whatsapp_add_business_record` e `whatsapp_add_business_card_purchase`) e ganha o mesmo comportamento, mas continua em piloto fechado.

## 2. Sem custo, por construção

| Item | Custo | Por quê |
|---|---|---|
| API de bots do Telegram | R$ 0 | Gratuita, sem conta empresarial, sem verificação e sem número de telefone da Clarevo |
| Mensagens | R$ 0 | A Clarevo só responde à mensagem que a pessoa mandou, no corpo da resposta à entrega do Telegram |
| Servidor | R$ 0 | Uma função do Supabase (Edge Function) no projeto que já existe, como a do WhatsApp |

A função do servidor **não tem o token do bot**: a resposta volta junto com a resposta à entrega (o Telegram aceita o pedido de envio no corpo da resposta). Assim, a Clarevo não consegue mandar mensagem por iniciativa própria, e quem lesse os segredos da função não conseguiria falar em nome do bot. O token fica só com o Enzo, para criar o bot e ligar o endereço (seção 5).

## 3. Privacidade

- **No banco da Clarevo** fica só o que vira registro, pelas mesmas funções do app. O Telegram informa ao bot o identificador da conta, o nome e o usuário da pessoa (não o telefone); a função usa só o identificador e manda ao banco um resumo HMAC-SHA256 feito com uma chave que só ela conhece (`TELEGRAM_ID_KEY`). O texto, o nome e o usuário nunca são guardados. Das mensagens tratadas ficam, por 30 dias, um resumo do identificador da mensagem (`telegram:` e 64 hexadecimais, feito com a mesma chave sobre a conversa e o número da mensagem: a conversa é a própria conta, e o banco recusa o identificador sem resumo), o resumo da conta, o resultado e o registro anotado (para o DESFAZER).
- **Ninguém desvia as mensagens de outra pessoa**: o botão Iniciar não mostra o código, então um link com o código de outra pessoa poderia ligar um Telegram à conta errada. Por isso, uma conta do Telegram já ligada a uma pessoa não passa a outra sozinha (resposta "já está ligado a outra conta"; é preciso mandar DESLIGAR antes), e a resposta de ligado diz o nome da conta da Clarevo, para quem escreve conferir. O WhatsApp segue a mesma regra.
- **No Telegram**: as conversas com bots passam pelos servidores do Telegram e ficam na conversa da pessoa, como as conversas comuns do Telegram (sem criptografia de ponta a ponta), até ela apagar. A Clarevo não tem contrato com o Telegram: a pessoa usa o Telegram pelas regras dele.
- **Só para quem quiser**: funciona depois de a própria pessoa ligar a conta no app, e desliga a qualquer momento (pelo app ou escrevendo DESLIGAR).
- **Exclusão da conta** apaga os vínculos, os códigos e as mensagens tratadas dos dois canais.
- **Só conversa particular**: mensagens de grupo, de canal ou de outro bot são ignoradas, e o bot é configurado para não entrar em grupos (seção 5, passo 2).
- **Antes de abrir para o público**: a seção do Telegram da política de privacidade (3.11 quando redigida; 3.8 depois de tirar as seções desligadas, em 05/11/2026) e a pergunta 45 do resumo para o advogado (`docs/legal/resumo-para-advogado.md`). No piloto fechado, as pessoas do teste recebem a explicação acima antes de ligar.

## 4. Como está montado

| Parte | Onde | O que faz |
|---|---|---|
| Servidor | `packages/core/src/telegram/servidor.ts` | Confere o segredo do endereço (cabeçalho `X-Telegram-Bot-Api-Secret-Token`) antes de ler o corpo, lê a entrega (só conversa particular), traduz `/start <código>`, `/desfazer` e `/desligar`, e usa a mesma resposta do WhatsApp (`answerChatMessage`, em `packages/core/src/whatsapp/servidor.ts`). Testes em `packages/core/test/telegram.test.ts` |
| Função do servidor | `supabase/functions/telegram/index.ts` | Arquivo único, gerado por `npm run telegram` (o mesmo gerador do WhatsApp, `scripts/gerar-funcoes.js`; não editar à mão) |
| Banco | `supabase/migrations/20261101000001_telegram.sql` (0022) | As tabelas do WhatsApp passam a servir aos dois canais (`chat_links`, `chat_link_codes`, `chat_messages`, com o canal em cada linha) e as regras ficam uma vez só, nas funções internas `clarevo_chat_*`. Funções do app (`my_telegram`, `create_telegram_code`, `unlink_telegram`) e do servidor (`telegram_note`, `telegram_link`, `telegram_add_record`, `telegram_undo`, `telegram_unlink`, só com a chave de serviço). As do WhatsApp continuam com os mesmos nomes e respostas. Testes em `supabase/tests/99z_telegram.sql` (e `99x_whatsapp.sql`, que segue valendo). Depois: a compra no cartão (0028, `telegram_add_card_purchase`) e o espaço Negócio (0049, `telegram_add_business_record` e `telegram_add_business_card_purchase`, seção 1a) |
| App | `apps/app/src/components/chat-link-screen.tsx`, `apps/app/src/app/conta/telegram.tsx` e o card em Conta | A mesma tela do WhatsApp, com os textos do Telegram (`TELEGRAM_TEXT`). O card só aparece quando `TELEGRAM_BOT` (em `packages/core/src/telegram/app.ts`) tiver o usuário do bot e `TELEGRAM_IN_ACCOUNT` for verdadeiro |
| Ponta a ponta | `apps/app/test/telegram-api.int.test.ts` (`npm run test:api`) | O app gera o código, a função recebe entregas como as do Telegram e fala com o banco real |

## 5. O que falta (Enzo, à mão)

O token do bot e os segredos nunca vão para o chat, para o repositório nem para o Claude Chrome: só para o Telegram, o gerenciador de senhas e o painel do Supabase, pela própria pessoa. O usuário do bot (o @) não é segredo.

1. **Banco** (Claude Chrome pode fazer, como nas migrações anteriores): aplicar a migração 0022 no SQL Editor (docs/05, passo 12l) e conferir (passo 21j).
2. **Criar o bot** (Enzo, no celular, no Telegram): procurar **@BotFather** (a conta oficial, com o selo azul de verificado), tocar em Iniciar e mandar:
   - `/newbot`; nome: `Clarevo`; usuário: um que termine em `bot` e esteja livre (por exemplo `ClarevoBot`, `ClarevoAppBot` ou `clarevo_app_bot`). O BotFather responde com um **token** (uma sequência como `123456789:AA...`): copie para o gerenciador de senhas e não mande para ninguém.
   - `/setjoingroups`, escolha o bot e **Disable** (o bot não entra em grupos).
   - `/setdescription`, escolha o bot e mande: `Anote gastos e recebimentos na Clarevo mandando uma mensagem como "mercado 52,30". Para ligar, abra o app da Clarevo, toque em Conta e em Telegram.`
   - `/setabouttext`, escolha o bot e mande: `Anote gastos e recebimentos na Clarevo por mensagem.`
   - `/setcommands`, escolha o bot e mande as três linhas:
     ```
     ajuda - Mostra os exemplos
     desfazer - Apaga a última anotação feita por aqui
     desligar - Desliga este Telegram da Clarevo
     ```
   - `/setuserpic`, escolha o bot e mande a imagem do símbolo da Clarevo (`docs/marca`).
3. **Inventar dois segredos** (Enzo, no gerenciador de senhas): dois textos aleatórios, diferentes, com **40 caracteres ou mais, só letras e algarismos** (sem símbolos). Um é o "segredo do endereço" (`TELEGRAM_WEBHOOK_SECRET`) e o outro, a "chave dos resumos" (`TELEGRAM_ID_KEY`; trocar essa chave depois desliga todas as contas ligadas pelo Telegram).
4. **Supabase, função** (Claude Chrome pode fazer): em Edge Functions, criar a função `telegram` pelo editor, colar todo o conteúdo de `supabase/functions/telegram/index.ts`, **desligar a verificação de JWT** (o Telegram não manda login; manda o segredo no cabeçalho) e publicar. O endereço fica `https://gywufwrdegucnoonoenr.supabase.co/functions/v1/telegram`.
5. **Supabase, segredos** (Enzo, em Edge Functions > Secrets): `TELEGRAM_WEBHOOK_SECRET` e `TELEGRAM_ID_KEY`, os do passo 3. `SUPABASE_URL` e a chave de serviço o Supabase já fornece. O token do bot **não** vai para o Supabase.
6. **Ligar o endereço** (Enzo, uma vez, no navegador do computador): montar o endereço abaixo trocando `TOKEN` pelo token do passo 2 e `SEGREDO` pelo segredo do endereço do passo 3, colar na barra do navegador e apertar Enter:
   ```
   https://api.telegram.org/botTOKEN/setWebhook?url=https://gywufwrdegucnoonoenr.supabase.co/functions/v1/telegram&secret_token=SEGREDO&allowed_updates=["message"]&drop_pending_updates=true
   ```
   A resposta esperada é `{"ok":true,"result":true,"description":"Webhook was set"}`. Para conferir depois: `https://api.telegram.org/botTOKEN/getWebhookInfo` mostra o endereço e, se houver, o último erro. Depois, apague essas duas páginas do histórico do navegador (o token fica nelas).
7. **App** (equipe): o Enzo manda o usuário do bot (o @, que não é segredo); a equipe põe em `TELEGRAM_BOT`, faz o PR e, depois do merge, a tela `/conta/telegram` passa a gerar código.
8. **Teste** (Enzo): em https://app.clarevo.app.br/conta/telegram, gerar o código, tocar em Abrir o Telegram e em Iniciar; mandar `mercado 52,30`, conferir o gasto no app e mandar `DESFAZER`.
9. **Abrir a todos**: feito em 03/11/2026 (D-081), com `TELEGRAM_IN_ACCOUNT = true` (o card aparece em Conta e no guia) e a função do servidor publicada de novo, porque as respostas mudam. Falta a resposta do advogado (pergunta 45).

## 6. Identificadores (não são segredos)

O token do bot, o segredo do endereço e a chave dos resumos nunca entram aqui.

| O quê | Valor |
|---|---|
| Bot da Clarevo no Telegram | @ClarevoBot (https://t.me/ClarevoBot), criado pelo Enzo em 03/11/2026 |
| Função do servidor | https://gywufwrdegucnoonoenr.supabase.co/functions/v1/telegram (publicada em 03/11/2026, sem verificação de JWT; segredos cadastrados e endereço do bot ligado no mesmo dia, testado com "oi" e "mercado 52,30"). Depois disso, o arquivo gerado passou a levar só o servidor (`scripts/gerar-funcoes.js`, entrada `telegram/servidor.ts`): o comportamento é o mesmo da versão publicada, então não é preciso publicar de novo por isso |
| Banco | migração 0022 aplicada no clarevo-producao em 03/11/2026 (conferência 21j: 3, 0, 10, 3, 0 e 91) |
| Tela do piloto | https://app.clarevo.app.br/conta/telegram |

## 7. Fontes

- API de bots do Telegram: [setWebhook e o segredo no cabeçalho](https://core.telegram.org/bots/api#setwebhook), [resposta no corpo da entrega](https://core.telegram.org/bots/api#making-requests-when-getting-updates), [sendMessage](https://core.telegram.org/bots/api#sendmessage) e [links de bot com /start](https://core.telegram.org/api/links#bot-links).
- Criar e configurar o bot: [BotFather](https://core.telegram.org/bots/features#botfather).
- Privacidade do Telegram: [política do Telegram](https://telegram.org/privacy) e [perguntas sobre bots](https://core.telegram.org/bots/faq).
