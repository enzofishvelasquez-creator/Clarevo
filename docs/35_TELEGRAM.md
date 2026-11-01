# Anotar pelo Telegram (D-080)

01/11/2026. O mesmo "anotar por mensagem" do WhatsApp (D-076, `docs/32_WHATSAPP.md`), por um bot da Clarevo no Telegram. Entrou porque a conta empresarial da Clarevo na Meta está restrita (seção 5c do documento do WhatsApp) e o Telegram não depende de nenhuma aprovação: o bot é criado em poucos minutos, no próprio Telegram, e a API de bots é gratuita. O código está pronto e testado; falta a parte do Enzo (criar o bot e guardar os segredos), na seção 5.

## 1. O que a pessoa faz

1. No app, em **Conta > Telegram** (no piloto, pelo link https://app.clarevo.app.br/conta/telegram), escolhe o espaço (Pessoal ou a Família em que anota) e toca em **Gerar código**.
2. Toca em **Abrir o Telegram**: abre a conversa com o bot da Clarevo. Toca em **Iniciar**, e o Telegram manda o código sozinho (se o Telegram não abrir, a tela mostra o @ do bot e a pessoa manda "Ativar" e o código).
3. A Clarevo responde que a conta está ligada e mostra os exemplos.
4. Daí em diante, as mesmas mensagens do WhatsApp: `mercado 52,30`, `farmácia 38 ontem`, `recebi 1500 salário`, `DESFAZER`, `DESLIGAR`, `AJUDA`. No Telegram também valem os comandos `/desfazer`, `/desligar` e `/ajuda`.

A leitura e as respostas são as do WhatsApp (`packages/core/src/whatsapp/mensagem.ts` e `respostas.ts`), com o nome do canal: "este Telegram está ligado", "toque em Telegram". A pessoa pode ter o WhatsApp e o Telegram ligados ao mesmo tempo: cada canal tem o seu vínculo e o seu código, e DESFAZER e DESLIGAR só mexem no próprio canal.

## 2. Sem custo, por construção

| Item | Custo | Por quê |
|---|---|---|
| API de bots do Telegram | R$ 0 | Gratuita, sem conta empresarial, sem verificação e sem número de telefone da Clarevo |
| Mensagens | R$ 0 | A Clarevo só responde à mensagem que a pessoa mandou, no corpo da resposta à entrega do Telegram |
| Servidor | R$ 0 | Uma função do Supabase (Edge Function) no projeto que já existe, como a do WhatsApp |

A função do servidor **não tem o token do bot**: a resposta volta junto com a resposta à entrega (o Telegram aceita o pedido de envio no corpo da resposta). Assim, a Clarevo não consegue mandar mensagem por iniciativa própria, e quem lesse os segredos da função não conseguiria falar em nome do bot. O token fica só com o Enzo, para criar o bot e ligar o endereço (seção 5).

## 3. Privacidade

- **No banco da Clarevo** fica só o que vira registro, pelas mesmas funções do app. O Telegram informa ao bot o identificador da conta, o nome e o usuário da pessoa (não o telefone); a função usa só o identificador e manda ao banco um resumo HMAC-SHA256 feito com uma chave que só ela conhece (`TELEGRAM_ID_KEY`). O texto, o nome e o usuário nunca são guardados. Das mensagens tratadas ficam, por 30 dias, o identificador da mensagem (`telegram:<conversa>:<mensagem>`, para não anotar duas vezes a mesma entrega), o resumo, o resultado e o registro anotado (para o DESFAZER).
- **No Telegram**: as conversas com bots passam pelos servidores do Telegram e ficam na conversa da pessoa, como as conversas comuns do Telegram (sem criptografia de ponta a ponta), até ela apagar. A Clarevo não tem contrato com o Telegram: a pessoa usa o Telegram pelas regras dele.
- **Só para quem quiser**: funciona depois de a própria pessoa ligar a conta no app, e desliga a qualquer momento (pelo app ou escrevendo DESLIGAR).
- **Exclusão da conta** apaga os vínculos, os códigos e as mensagens tratadas dos dois canais.
- **Só conversa particular**: mensagens de grupo, de canal ou de outro bot são ignoradas, e o bot é configurado para não entrar em grupos (seção 5, passo 2).
- **Antes de abrir para o público**: a seção 3.11 da política de privacidade (já redigida) e a pergunta 45 do resumo para o advogado (`docs/legal/resumo-para-advogado.md`). No piloto fechado, as pessoas do teste recebem a explicação acima antes de ligar.

## 4. Como está montado

| Parte | Onde | O que faz |
|---|---|---|
| Servidor | `packages/core/src/telegram/servidor.ts` | Confere o segredo do endereço (cabeçalho `X-Telegram-Bot-Api-Secret-Token`) antes de ler o corpo, lê a entrega (só conversa particular), traduz `/start <código>`, `/desfazer` e `/desligar`, e usa a mesma resposta do WhatsApp (`answerChatMessage`, em `packages/core/src/whatsapp/servidor.ts`). Testes em `packages/core/test/telegram.test.ts` |
| Função do servidor | `supabase/functions/telegram/index.ts` | Arquivo único, gerado por `npm run telegram` (o mesmo gerador do WhatsApp, `scripts/gerar-funcoes.js`; não editar à mão) |
| Banco | `supabase/migrations/20261101000001_telegram.sql` (0022) | As tabelas do WhatsApp passam a servir aos dois canais (`chat_links`, `chat_link_codes`, `chat_messages`, com o canal em cada linha) e as regras ficam uma vez só, nas funções internas `clarevo_chat_*`. Funções do app (`my_telegram`, `create_telegram_code`, `unlink_telegram`) e do servidor (`telegram_note`, `telegram_link`, `telegram_add_record`, `telegram_undo`, `telegram_unlink`, só com a chave de serviço). As do WhatsApp continuam com os mesmos nomes e respostas. Testes em `supabase/tests/99z_telegram.sql` (e `99x_whatsapp.sql`, que segue valendo) |
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
9. **Abrir a todos**: `TELEGRAM_IN_ACCOUNT = true` (o card aparece em Conta), a seção 3.11 entra na política publicada e a resposta do advogado (pergunta 45).

## 6. Fontes

- API de bots do Telegram: [setWebhook e o segredo no cabeçalho](https://core.telegram.org/bots/api#setwebhook), [resposta no corpo da entrega](https://core.telegram.org/bots/api#making-requests-when-getting-updates), [sendMessage](https://core.telegram.org/bots/api#sendmessage) e [links de bot com /start](https://core.telegram.org/api/links#bot-links).
- Criar e configurar o bot: [BotFather](https://core.telegram.org/bots/features#botfather).
- Privacidade do Telegram: [política do Telegram](https://telegram.org/privacy) e [perguntas sobre bots](https://core.telegram.org/bots/faq).
