# Anotar pelo WhatsApp (D-076)

30/10/2026. Fase 1: só mensagens escritas, sem IA e sem custo. O código está pronto e testado; falta a parte da Meta (conta, número e segredos), que é da pessoa responsável pela empresa.

## 1. O que a pessoa faz

1. No app, em **Conta > WhatsApp**, escolhe o espaço (Pessoal ou a Família em que anota) e toca em **Gerar código**.
2. Toca em **Abrir o WhatsApp com a mensagem pronta**: abre a conversa com a Clarevo com "Ativar ABCD-EF23" escrito. Envia.
3. A Clarevo responde que o número está ligado e mostra os exemplos.
4. Daí em diante, escreve como falaria:

| Mensagem | O que acontece |
|---|---|
| `mercado 52,30` | Gasto de R$ 52,30, categoria Mercado, hoje |
| `farmácia 38 ontem` | Gasto de ontem, categoria Saúde |
| `luz 180 12/10` | Gasto de 12/10, categoria Moradia |
| `recebi 1500 salário` | Recebimento de R$ 1.500,00, categoria Salário |
| `+200 freela` | Recebimento, sem categoria |
| `DESFAZER` | Apaga a última anotação feita pelo WhatsApp (até 24 horas) |
| `DESLIGAR` ou `PARAR` | Desliga o número da Clarevo |
| `AJUDA` ou `oi` | Mostra os exemplos |

"Hoje" e "ontem" são os do fuso de quem escreve (o mesmo do app). Mais de 30 mensagens em 10 minutos de um mesmo número recebem um aviso e, depois, nenhuma resposta. Se a pessoa troca de número no WhatsApp, o número antigo é desligado.

A resposta sempre repete o que foi anotado (espaço, valor, categoria, data e conta de origem) e lembra do DESFAZER. O registro aparece no app na hora, com a autoria da pessoa, na conta de origem principal do espaço. Áudio, foto e figurinha recebem a resposta "só mensagens escritas" com a dica do microfone do teclado do celular, que transforma a fala em texto antes de enviar (nada disso passa pela Clarevo).

A leitura é por regras simples (`packages/core/src/whatsapp/mensagem.ts`): o valor (um só; com dois números, vale o único com centavos ou R$), a data (hoje, ontem, anteontem, "dia 5", "12/10", "12/10/2025"), o tipo (recebimento com "+", "recebi", "ganhei", "entrou" ou palavras como "salário" e "reembolso"; senão, gasto) e a categoria (o nome dela escrito ou as mesmas regras de palavras da importação de extrato). O que não dá para ler recebe um exemplo de como escrever, e nada é anotado.

## 2. Sem custo, por construção

| Item | Custo | Por quê |
|---|---|---|
| API da Meta (WhatsApp Cloud API) | R$ 0 | A hospedagem da Meta é gratuita e usamos a API direto, sem intermediário pago |
| Mensagens | R$ 0 | A Clarevo só responde à mensagem que a pessoa acabou de mandar (janela de atendimento de 24 horas, que a Meta não cobra). Não há lembrete nem mensagem iniciada pela Clarevo, nem mensagem de modelo, que são as cobradas. Um teste recusa qualquer envio desse tipo no código |
| Forma de pagamento na Meta | Não cadastrar | Sem cartão cadastrado, a Meta não deixa sair mensagem cobrada: é uma trava a mais |
| Número | R$ 0 | No piloto, o número de teste que a Meta dá (até 5 pessoas). Para abrir a todos, um número que a empresa já tenha e que não esteja no WhatsApp (um chip parado ou um fixo) |
| Servidor | R$ 0 | Uma função do Supabase (Edge Function) no projeto que já existe; o uso do piloto fica muito abaixo do que o plano inclui (conferir em Usage no painel) |

Se um dia a Clarevo quiser mandar lembretes pelo WhatsApp, aí sim há custo por mensagem (alguns centavos cada, valor a conferir no painel da Meta, que passa a cobrar em reais no 2º semestre de 2026). Isso exige nova decisão.

## 3. Privacidade

- **No banco da Clarevo** fica só o que vira registro, pelas mesmas funções do app. Do número, só um resumo HMAC-SHA256 feito com uma chave que só a função do servidor conhece (para reconhecer quem escreve; sem a chave, quem lê o banco não volta ao número). O texto das mensagens nunca é guardado. Das mensagens tratadas (inclusive ajuda e as que a Clarevo não entendeu) ficam, por 30 dias, o identificador da Meta (para não anotar duas vezes a mesma entrega), o resumo do número, o resultado e o registro anotado (para o DESFAZER).
- **Na Meta**: as mensagens passam pelos servidores da Meta, que deixa de ter a criptografia de ponta a ponta nesse trecho e atua como operadora dos dados (Cloud API). A Meta guarda o conteúdo por até 30 dias. Por padrão, nos Estados Unidos; existe a opção de armazenamento no Brasil, a pedir ao registrar o número.
- **Só para quem quiser**: o WhatsApp só funciona depois de a própria pessoa ligar o número no app, e desliga a qualquer momento (pelo app ou escrevendo DESLIGAR).
- **Exclusão da conta** apaga o vínculo, o código e as mensagens tratadas da pessoa.
- **Antes de abrir para o público**: seção nova na política de privacidade e a pergunta 42 do resumo para o advogado (`docs/legal/RESUMO_PARA_ADVOGADO.md`). No piloto fechado, as pessoas do teste recebem a explicação acima antes de ligar.

## 4. Como está montado

| Parte | Onde | O que faz |
|---|---|---|
| Leitura, respostas e servidor | `packages/core/src/whatsapp/` | Lê a mensagem, monta a resposta, confere a assinatura da Meta (HMAC-SHA256) e chama o banco. Testes em `packages/core/test/whatsapp.test.ts` |
| Função do servidor | `supabase/functions/whatsapp/index.ts` | Arquivo único, gerado por `npm run whatsapp` a partir do núcleo (não editar à mão). É o que se cola no painel do Supabase |
| Banco | `supabase/migrations/20261030000001_whatsapp.sql` (0020) | Tabelas do vínculo, do código e das mensagens; funções do app (`my_whatsapp`, `create_whatsapp_code`, `unlink_whatsapp`) e do servidor (`whatsapp_note`, `whatsapp_link`, `whatsapp_add_record`, `whatsapp_undo`, `whatsapp_unlink`, só com a chave de serviço). Anotar e desfazer passam por `create_record` e `delete_record`. Testes em `supabase/tests/99x_whatsapp.sql` |
| App | `apps/app/src/app/conta/whatsapp.tsx` e o card em Conta | Gerar o código, abrir a conversa, conferir se ligou, desligar. O card só aparece quando `WHATSAPP_NUMBER` (em `packages/core/src/whatsapp/app.ts`) tiver o número |
| Ponta a ponta | `apps/app/test/whatsapp-api.int.test.ts` (`npm run test:api`) | O app gera o código, a função recebe entregas assinadas como as da Meta e fala com o banco real |

## 5. O que falta (fase 2, com a pessoa responsável)

Credenciais (token, chave secreta do app) nunca no chat nem no repositório: só nos painéis da Meta e do Supabase, pela própria pessoa. O Claude Chrome pode ajudar com o que não é credencial nem pagamento.

1. **Banco**: aplicar a migração 0020 no SQL Editor (docs/05, passo 12j) e conferir (passo 21h).
2. **Meta, conta da empresa**: em business.facebook.com, criar o portfólio empresarial "Clarevo" com os dados do CNPJ e pedir a verificação da empresa (Central de segurança). Não cadastrar forma de pagamento.
3. **Meta, app**: em developers.facebook.com, criar um app do tipo empresa com o caso de uso do WhatsApp, ligado ao portfólio. Na página de configuração da API aparecem o número de teste, o identificador do número (Phone number ID) e o lugar para cadastrar até 5 números que recebem mensagens no teste.
4. **Segredos inventados**: dois textos longos e aleatórios, diferentes (o "token de verificação" e a chave dos números), guardados no gerenciador de senhas.
5. **Supabase, função**: em Edge Functions, criar a função `whatsapp` pelo editor, colar todo o conteúdo de `supabase/functions/whatsapp/index.ts`, **desligar a verificação de JWT** (a Meta não manda login) e publicar. O endereço fica `https://gywufwrdegucnoonoenr.supabase.co/functions/v1/whatsapp`.
6. **Supabase, segredos** (Edge Functions > Secrets, pela própria pessoa): `WHATSAPP_VERIFY_TOKEN` (o do passo 4), `WHATSAPP_PHONE_KEY` (outro texto longo e aleatório, só para o resumo dos números; trocar depois desliga todos os números ligados), `WHATSAPP_APP_SECRET` (chave secreta do app, em Configurações do app > Básico), `WHATSAPP_ACCESS_TOKEN` (token permanente de um usuário do sistema do portfólio, com as permissões de mensagens do WhatsApp) e `WHATSAPP_PHONE_NUMBER_ID`. `SUPABASE_URL` e a chave de serviço o Supabase já fornece (a função usa `SUPABASE_SECRET_KEYS`, a chave nova, e, sem ela, `SUPABASE_SERVICE_ROLE_KEY`).
7. **Meta, webhook**: na configuração do WhatsApp do app, URL de retorno = o endereço do passo 5, token de verificação = o do passo 4; assinar o campo `messages`.
8. **App**: com o número definido, a equipe põe o número em `WHATSAPP_NUMBER`, publica o app e o card aparece em Conta.
9. **Piloto fechado** (fase 3): as pessoas do teste (até 5 no número de teste) ligam o WhatsApp e anotam por uma semana. Conferir no SQL Editor quantas mensagens deram "não entendi" para ajustar as regras.
10. **Abrir a todos**: número próprio registrado com armazenamento no Brasil, nome de exibição "Clarevo" aprovado, política atualizada e resposta do advogado.

## 5b. Abrir a todos: o número próprio, passo a passo

O número de teste da Meta só conversa com até 5 números cadastrados. Para todas as pessoas, a Clarevo precisa de um número próprio. Ordem:

1. **Escolher o número** (Enzo). Precisa receber SMS ou ligação, **não pode estar no WhatsApp** (nem no comum nem no Business; se estiver, apagar a conta do WhatsApp nele antes) e vai ser o endereço da Clarevo para sempre. Opções: chip pré-pago novo usado só para isso (o único custo: o chip e uma recarga mínima de tempos em tempos para a operadora não cancelar a linha), um número que a empresa já tenha e não use no WhatsApp, ou um fixo da empresa (confirmado por ligação).
2. **Verificação da empresa** na Meta (Enzo, com o cartão CNPJ).
3. **Cadastrar o número** no WhatsApp Manager (Claude Chrome; o código de confirmação é o Enzo quem digita): Números de telefone > Adicionar, nome de exibição "Clarevo", categoria de finanças. Sai um Phone number ID novo.
4. **Ativar o número na API, com armazenamento no Brasil** (Enzo, no Graph API Explorer da Meta): `POST <Phone number ID>/register` com `messaging_product=whatsapp`, `pin=<6 dígitos inventados e guardados no gerenciador de senhas>` e `data_localization_region=BR`. Pela documentação da Meta, o registro só se faz pela API (não pelo painel), e o armazenamento no Brasil só se escolhe aqui; mudar depois exige desligar e registrar de novo.
5. **Trocar o segredo** `WHATSAPP_PHONE_NUMBER_ID` no Supabase pelo novo (Enzo).
6. **Deixar o app da Meta ao vivo** (Claude Chrome): em Configurações > Básico, URL da política `https://clarevo.app.br/privacidade.html` e de exclusão de dados `https://clarevo.app.br/excluir-conta.html`, ícone e categoria; depois, trocar o modo do app de desenvolvimento para ao vivo.
7. **App da Clarevo** (equipe): `WHATSAPP_NUMBER` com o número novo e `WHATSAPP_IN_ACCOUNT = true`; PR e merge.
8. **Teste** com um número que não estava no piloto e aviso às pessoas.

Antes disso, vale terminar o teste com o número de teste (segredos, webhook e "oi"): ele prova a função e o banco, e o número próprio só troca o passo 4 em diante.

## 6. Identificadores (não são segredos)

Criados em 30/10/2026. Os segredos (token, chave secreta do app, token de verificação e chave dos números) nunca entram aqui.

| O quê | Valor |
|---|---|
| Portfólio empresarial "Clarevo" | 1913629572938246 |
| App "Clarevo" (Meta for Developers) | 1686700749544098 |
| Conta do WhatsApp Business (WABA) | 1679227277245978 |
| Número de teste (piloto) | +1 (555) 208-7378 |
| Phone number ID do número de teste | 1370020676203219 |
| Função do servidor | https://gywufwrdegucnoonoenr.supabase.co/functions/v1/whatsapp |

**Piloto fechado:** o app usa o número de teste (`WHATSAPP_NUMBER`) e esconde o card em Conta (`WHATSAPP_IN_ACCOUNT = false`). As pessoas do piloto recebem o link https://app.clarevo.app.br/conta/whatsapp. O número de teste só troca mensagens com os até 5 números cadastrados no app da Meta.

## 6. Fontes

- Preços: [Meta, preços da plataforma do WhatsApp](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing) e guias de terceiros ([calculadora Brasil 2026](https://hyperleap.ai/whatsapp-pricing-calculator-brazil), [wati](https://www.wati.io/blog/whatsapp-api-pricing-guide)). Valores a conferir no painel da Meta, porque a página oficial não abriu no ambiente da equipe.
- Privacidade e armazenamento: [Infobip, privacidade no WhatsApp](https://www.infobip.com/docs/whatsapp/compliance/data-privacy) e [360dialog, armazenamento local](https://docs.360dialog.com/docs/hub/local-storage), que reproduzem a documentação da Cloud API (Meta como operadora, até 30 dias, armazenamento no Brasil).
