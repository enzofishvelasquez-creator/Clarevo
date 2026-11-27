# Avisos por e-mail: o aviso de fim do teste (D-131, item E)

Decisão do Enzo em 27/11/2026 (D-131, item E): "e-mail de serviço só no fim do teste (2 dias antes)", depois do advogado e da chave do
serviço de e-mail, que é do Enzo. **Está tudo pronto e DESLIGADO.** Nada é posto na fila e nada é enviado até o Enzo seguir a seção 4,
depois da resposta do advogado (seção 7).

Hoje a Clarevo manda só os e-mails do login (confirmar o cadastro e definir nova senha), pelo Supabase Auth com o SMTP do Resend
(`docs/05`, seção 3; P-008). Este é o único e-mail de serviço a mais: um aviso, uma vez, perto do fim do teste grátis.

## 1. O que faz

- **Quando:** uma vez, 2 dias antes do fim do teste, no calendário de Brasília (o teste que acaba em 12/12 é avisado em 10/12), entre 9h e
  18h de Brasília. O fim do teste é a mesma conta da tela (`my_access`): o maior entre a criação da conta e o início da cobrança
  (`billing_settings.enforced_from`), mais 14 dias.
- **Antes do início da cobrança, ninguém recebe.** Hoje, sem a data de início em produção, todo mundo está em "pre_lancamento" e a fila
  fica vazia, mesmo com tudo ligado.
- **Quem não recebe:** quem já assina (lojas, cartão ou Pix na web); quem assinou no cartão durante o teste e tem a primeira cobrança
  marcada para o fim do teste (D-129, o direito com o começo no futuro em `plan_entitlements`); quem é de uma Família cuja titular tem o
  plano Família valendo ou marcado para começar; quem tem o benefício da empresa ou a cortesia da equipe; conta excluída; e-mail não
  confirmado; e quem já recebeu o aviso daquele fim do teste. Quem assina, entra numa Família coberta ou ganha cortesia entre a preparação
  da fila (8h45) e o envio também não recebe: a regra é conferida de novo na hora de enviar.
- **O texto** (núcleo, `packages/core/src/avisos-email.ts`, com testes em `packages/core/test/avisos-email.test.ts`), em texto puro e em
  HTML simples, sem imagem, sem pixel de abertura e sem link rastreado:

  > Assunto: O teste grátis da sua conta na Clarevo termina em 12/12/2026
  >
  > Olá,
  >
  > O teste grátis da sua conta na Clarevo termina em 12/12/2026.
  >
  > Quando o teste terminar, sem assinatura, a conta fica só para ver e exportar; nada é apagado. Tudo o que você anotou continua guardado,
  > e você pode assinar quando quiser para voltar a anotar.
  >
  > Para assinar, abra Conta, Assinatura, no app ou na web:
  > https://app.clarevo.app.br/conta/assinatura
  >
  > Este é um aviso único sobre a sua conta.
  >
  > Clarevo
  > Dúvidas: suporte@clarevo.app.br

  Remetente `Clarevo <nao-responda@clarevo.app.br>` (o mesmo do login); a resposta vai para `suporte@clarevo.app.br`. Sem preço, sem pressa
  e sem nome da pessoa.
- **Dados:** só o e-mail e a data do fim do teste. O registro de cada aviso (`trial_notices`) guarda a pessoa (o identificador interno), o
  dia do fim do teste, a situação, as horas e o identificador da mensagem no Resend ou um código de erro curto; **nunca o e-mail**. O app
  não lê a tabela (RLS sem política, sem privilégio), e o registro da função (logs) leva só contagens, o identificador do aviso e códigos.
- **Guarda:** os registros saem 6 meses depois do dia do fim do teste (o mesmo prazo de A7) e, na hora, com a exclusão da conta. Quem apaga
  os de 6 meses é só a preparação diária, o agendamento `clarevo-aviso-fim-do-teste-fila`: por isso ele fica no ar mesmo com o aviso
  desligado (seção 5). Desligado, ele não põe ninguém na fila nem chama nada fora do banco; só apaga e marca como expirado.

## 2. Como está montado

O banco só prepara a fila; a função do servidor envia. O banco nunca fala com o Resend nem guarda a chave dele.

1. **Banco (migração 0051, `supabase/migrations/20261128000002_aviso_fim_do_teste.sql`; `docs/05`, passo 12ar, conferência 21am).**
   O interruptor `billing_settings.trial_notice_mode` (`desligado`, o padrão; `ensaio`; `ligado`), mudado só por
   `clarevo_staff_set_trial_notice_mode` no SQL Editor; a tabela `trial_notices`; a preparação `clarevo_trial_notice_prepare()`, que o
   pg_cron roda todo dia às 8h45 de Brasília (põe na fila quem tem o fim do teste daqui a 2 dias, com o interruptor em ensaio ou ligado;
   marca como expirado o que não saiu no dia; apaga o que passou de 6 meses); e as duas funções da função do servidor, só com a chave de
   serviço: `trial_notice_claim` (entrega um aviso do dia, no horário, conferindo a regra de novo) e `trial_notice_finish` (grava o
   resultado). Nenhuma função nova para o app (130), nenhuma ação nova (105). Testes em
   `supabase/tests/99zzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_aviso_fim_do_teste.sql`.
2. **Função do servidor `aviso-fim-do-teste`** (gerada do núcleo, `packages/core/src/aviso-fim-do-teste/servidor.ts`, por
   `node scripts/gerar-funcoes.js`; arquivo `supabase/functions/aviso-fim-do-teste/index.ts`, 442 linhas). Acordada de hora em hora, das
   9h05 às 17h05 de Brasília, pelo agendamento do banco. Pede um aviso por vez, envia pela API do Resend (`POST https://api.resend.com/emails`)
   com a chave `Idempotency-Key` igual ao identificador do aviso (uma nova tentativa no mesmo dia não manda duas vezes), no máximo 2 por
   segundo e 50 por rodada (até 450 por dia), e grava o resultado. Falha passageira (rede, limite, chave recusada, erro do Resend) volta
   para a fila depois de 30 minutos, até 3 tentativas no dia; recusa do endereço vira erro, sem nova tentativa.
3. **Quem pode acordar a função:** só quem tem o token `AVISOS_EMAIL_TOKEN`, no cabeçalho `x-clarevo-avisos-token`. Sem ele, a função
   responde 401 e nem chama o banco. É o padrão das funções da Clarevo: todas são publicadas com a verificação de JWT do painel desligada e
   conferem a própria credencial (o token do Asaas, o segredo do Telegram, o token do RevenueCat). Ligar a verificação de JWT do painel não
   protegeria: ela aceita a chave pública do projeto, que está no app; para valer, a função teria de exigir a chave de serviço, e o
   agendamento teria de guardar a chave mais poderosa do projeto. O token só acorda a função, que envia o que o banco já pôs na fila.
4. **O agendamento.** A preparação é SQL puro no pg_cron, como a limpeza de A7 (`docs/05`, passo 12o). Para acordar a função de hora em
   hora, o caminho do Supabase é o próprio pg_cron com a extensão **pg_net**, que faz a chamada HTTP (o agendamento de Edge Functions do
   painel, em Integrations, Cron, usa o mesmo par; não consegui abrir a documentação do Supabase deste ambiente para citar a página). A chamada não leva dado de ninguém, só o token, que fica guardado no **Vault** do banco (criptografado), e não no texto do
   agendamento.

**Os interruptores.** (1) O do banco, desligado: nada entra na fila e nada é entregue à função. (2) A chave `RESEND_API_KEY`, que só o Enzo
põe: sem ela, no modo ligado, a função avisa ao banco que não pode enviar, nada é entregue e nada sai (o ensaio funciona sem ela). E uma
trava a mais: com a compra fechada (`SUBSCRIBE_OPEN` falso em `packages/core/src/plano-precos.ts`), a função também não envia, porque o
e-mail manda assinar na tela Assinatura; quando a compra abrir, a função precisa ser gerada e publicada de novo (seção 4, passo 9).

**Ensaio.** Com o interruptor em `ensaio`, a fila e a função andam como no ligado, mas a função só grava o que enviaria (situação `ensaio`),
sem chamar o Resend e sem receber o e-mail da pessoa. O ensaio fica num registro à parte e não impede o envio de verdade depois.

## 3. Antes de ligar

- A resposta do advogado sobre a base legal e a frase da política de privacidade publicada (seção 7). Sem isso, fica desligado.
- A compra aberta e o início da cobrança marcado (`docs/04`, "Assinatura pelas lojas"): sem o início, ninguém está no teste e a fila fica
  vazia; com a compra fechada, a função não envia.
- No Resend (o domínio `clarevo.app.br` já está verificado, P-008): em Domains, `clarevo.app.br`, conferir que o rastreio de abertura
  (open tracking) e o de cliques (click tracking) estão desligados. Conferir também o limite diário e mensal do plano do Resend: no dia em
  que a cobrança começar, as contas criadas antes têm o mesmo fim do teste e o aviso sai para todas no mesmo dia (até 450 por dia pela
  função; o que passar disso, ou do limite do plano, expira sem ser enviado).

## 4. Como ligar (só o Enzo, nesta ordem)

O Claude Chrome pode preparar as consultas e o editor nos passos sem segredo (1, 2, 4, 5, 6, 8 e 9). **Nos passos com segredo (3, o token,
e 7, a chave do Resend), o Claude Chrome fica desligado** (a extensão desconectada, sem nenhuma aba do Supabase, do Resend ou do Bitwarden
ligada a ele), e o Enzo faz sozinho: segredo nenhum passa pelo chat, pelo repositório ou por uma tela que o Claude Chrome vê.

1. **Migração.** Aplicar a 0051 no SQL Editor e conferir (`docs/05`, passo 12ar, conferência 21am). Não envia nada.
2. **Função.** Em Edge Functions, criar `aviso-fim-do-teste` pelo editor, colar todo o conteúdo de
   `supabase/functions/aviso-fim-do-teste/index.ts`, publicar e deixar **"Verify JWT with legacy secret" desligado**. Sem o token, ela
   responde 503 e não faz nada.
3. **Token** (só o Enzo, com o Claude Chrome desligado). O token nunca aparece num resultado de consulta: ele nasce no Bitwarden e é
   colado em dois lugares.
   1. No Bitwarden, gere uma senha nova pelo gerador de senhas: **64 caracteres**, com letras maiúsculas, letras minúsculas e números, e
      **sem caracteres especiais** (a função aceita só letras, algarismos, `_` e `-`). Salve como um item novo, "Clarevo, AVISOS_EMAIL_TOKEN".
   2. No painel do Supabase, abra a tela do **Vault** (procure "Vault" no menu do projeto) e crie um segredo novo com o nome
      `clarevo_avisos_email_token`, a descrição "Acorda a função aviso-fim-do-teste (docs/53)" e, como valor, o token colado do Bitwarden.
      Se o painel não mostrar a tela do Vault, abra o SQL Editor numa consulta nova, escreva você mesmo
      `select vault.create_secret('<token>', 'clarevo_avisos_email_token', 'Acorda a função aviso-fim-do-teste (docs/53)');`, troque
      `<token>` pelo token colado do Bitwarden, rode (o resultado é só o identificador do segredo), apague o texto da consulta e feche sem
      salvar.
   3. Em Edge Functions, Secrets, crie `AVISOS_EMAIL_TOKEN` com o mesmo token, colado do Bitwarden.

   Não rode consulta em `vault.decrypted_secrets` para ver o token: o agendamento do passo 5 lê o valor direto do Vault, sem mostrar. Para
   trocar o token, gere outro no Bitwarden e repita os passos 2 (editando o segredo no Vault) e 3.
4. **pg_net.** Em Database, Extensions, procurar "pg_net" e ligar (o pg_cron já está ligado desde o passo 12o).
5. **Agendamento.** Numa consulta nova, troque `<endereço da função>` pelo endereço que o painel mostra para a função (Edge Functions,
   `aviso-fim-do-teste`, termina em `/functions/v1/aviso-fim-do-teste`; não é segredo) e rode:

   ```sql
   -- A fila: todo dia às 11h45 UTC (8h45 em Brasília).
   select cron.schedule('clarevo-aviso-fim-do-teste-fila', '45 11 * * *', $$select public.clarevo_trial_notice_prepare()$$);
   -- O envio: de hora em hora, das 12h05 às 20h05 UTC (9h05 às 17h05 em Brasília).
   select cron.schedule('clarevo-aviso-fim-do-teste-envio', '5 12-20 * * *', $$
     select net.http_post(
       url := '<endereço da função>',
       headers := jsonb_build_object('Content-Type', 'application/json', 'x-clarevo-avisos-token',
                    (select decrypted_secret from vault.decrypted_secrets where name = 'clarevo_avisos_email_token')),
       body := '{}'::jsonb,
       timeout_milliseconds := 120000)
   $$);
   ```

   Conferir (só leitura): `select jobname, schedule, active from cron.job where jobname like 'clarevo-aviso-fim-do-teste-%' order by jobname;`
   devolve as duas linhas (`-envio` com `5 12-20 * * *` e `-fila` com `45 11 * * *`, as duas ativas). Com o interruptor desligado, as
   duas rodam e não enviam nada. A `-fila` é também a que apaga os registros com mais de 6 meses: ela fica sempre (seção 5).
6. **Ensaio, primeiro.** `select public.clarevo_staff_set_trial_notice_mode('ensaio');` (devolve o modo e a fila do dia). Antes do início
   da cobrança, a fila sai vazia (esperado). Depois do início, deixe pelo menos um dia em ensaio e confira:

   ```sql
   select trial_ends_on, dry_run, status, count(*) from public.trial_notices group by 1, 2, 3 order by 1 desc, 2, 3;
   ```

   As linhas `dry_run = true` com situação `ensaio` são as pessoas que receberiam (só a contagem; o e-mail não fica gravado). Para não esperar
   a hora cheia, entre 9h e 18h, rode numa consulta a mesma chamada `select net.http_post(...)` do agendamento e veja a resposta em
   `select status_code, content from net._http_response order by created desc limit 1;` (200, com `"modo": "ensaio"` e as contagens).
7. **Chave do Resend** (só o Enzo, com o Claude Chrome desligado). No Resend, em API Keys, crie uma chave só para este aviso, com permissão "Sending access" e só para o domínio
   `clarevo.app.br` (separada da chave do SMTP do login, para poder revogar uma sem a outra). Cole em Edge Functions, Secrets, com o nome
   `RESEND_API_KEY`; guarde no Bitwarden. Sem ela, nada é enviado.
8. **Ligar.** `select public.clarevo_staff_set_trial_notice_mode('ligado');`. Na rodada seguinte, os avisos do dia saem. Acompanhe pela
   consulta do passo 6 (situação `enviado`, com o identificador do Resend, ou `erro`, com o código) e pelo painel do Resend (Emails).
9. **Quando a compra abrir** (`SUBSCRIBE_OPEN` verdadeiro), gere de novo as funções (`node scripts/gerar-funcoes.js`) e publique de novo a
   `aviso-fim-do-teste` (todo o conteúdo do arquivo, JWT desligado). Até lá, mesmo ligada e com a chave, ela responde `compra_fechada` e
   não envia.

## 5. Como desligar (volta atrás)

- **Na hora:** `select public.clarevo_staff_set_trial_notice_mode('desligado');`. A próxima entrega já não acontece (no máximo o e-mail que
  estiver saindo naquele segundo termina) e a preparação não põe mais ninguém na fila; o que ficou pendente expira no dia seguinte.
- **Sem depender do banco:** apague o segredo `RESEND_API_KEY` em Edge Functions, Secrets (e revogue a chave no Resend). A função continua
  no ar, mas não envia.
- **Parar o envio:** `select cron.unschedule('clarevo-aviso-fim-do-teste-envio');`. **Não pare a `-fila`:** ela é o único lugar que apaga
  os registros com mais de 6 meses (a promessa da política) e marca como expirado o que ficou pendente. Com o interruptor desligado, ela não
  põe ninguém na fila e não chama nada fora do banco, então pode ficar para sempre.
- **Tirar tudo:** apagar a função `aviso-fim-do-teste`, o segredo `AVISOS_EMAIL_TOKEN` e o token do Vault
  (`delete from vault.secrets where name = 'clarevo_avisos_email_token';`), parar o envio (acima) e, só então, apagar os registros e parar a
  fila, nesta ordem: `delete from public.trial_notices;` e `select cron.unschedule('clarevo-aviso-fim-do-teste-fila');`. Sem a `-fila`, nada
  mais apaga registro nenhum: por isso os registros saem antes dela. A migração pode ficar: desligada, não faz nada.

## 6. O que a função responde (para os registros)

`200` com `{"result": "ok", "modo", "janela", "envio_possivel", "enviados", "ensaios", "falhas", "recusados"}` e, quando ligado sem poder
enviar, `"motivo": "sem_chave"` ou `"compra_fechada"`; `401` sem o token; `503` sem a configuração (falta o token ou a chave de serviço);
`502` quando o banco não responde. Nos registros da função (Edge Functions, Logs), uma linha por rodada com as contagens e uma por falha,
com o identificador do aviso e o código (por exemplo `http_429_rate_limit_exceeded`), nunca o e-mail.

## 7. Jurídico (pendente)

Antes de ligar, o advogado confirma a base legal (execução do contrato ou legítimo interesse) e se um aviso de serviço único, sobre a
própria conta, pode sair sem pedido prévio da pessoa; e a política de privacidade passa a citar este aviso (hoje ela fala só dos e-mails
de confirmação de cadastro e de nova senha, nas seções 3.1, 6 e 8, no trecho do Resend). A frase proposta e a pergunta para o resumo do
advogado ficam com a sessão dos textos legais (`docs/legal/`).

## 8. Arquivos

- `supabase/migrations/20261128000002_aviso_fim_do_teste.sql` (0051) e `supabase/tests/99zzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_aviso_fim_do_teste.sql`
  (e a chave estrangeira nova na lista de `supabase/tests/99_exclusao.sql`).
- `packages/core/src/avisos-email.ts` (os textos) e `packages/core/src/aviso-fim-do-teste/servidor.ts` (a função), com
  `packages/core/test/avisos-email.test.ts` e `packages/core/test/aviso-fim-do-teste.test.ts` (o Resend é de mentira nos testes: nenhum
  e-mail sai).
- `scripts/gerar-funcoes.js` (a entrada nova) e `supabase/functions/aviso-fim-do-teste/index.ts` (gerado; não editar à mão).
