# Lançamento (D-082): web, iPhone e Android juntos

Decisões do Enzo em 03/11/2026: **lançar os três juntos** (app na web, iPhone e Android), mesmo que passe de 30/11; **contas das lojas em nome da empresa**, com o CNPJ da Clarevo; meta: **até 30/11/2026**. Este documento junta as pontas soltas, com quem faz cada uma e a semana. O passo a passo das lojas continua em `docs/16_PUBLICACAO_LOJAS.md`; aqui fica a ordem.

Regra de sempre: contas, senhas, códigos, pagamentos e verificações são feitos **só pelo Enzo, à mão, no próprio navegador**. O Claude Chrome não cria contas em loja nenhuma (o bloqueio da Meta veio de um portfólio criado por automação, `docs/32`, seção 5c). A equipe manda o roteiro e lê os prints.

## 1. O caminho mais longo

As contas de empresa nas lojas são o que mais demora, então começam **nesta semana**:

1. **D-U-N-S** (número da Dun & Bradstreet para a empresa). A Apple diz que um número novo leva até 5 dias úteis, mais até 2 dias úteis para chegar à Apple. Os dados precisam ser **iguais** aos do cartão CNPJ (razão social, endereço, telefone).
2. **Apple Developer Program como organização** (US$ 99 por ano). A Apple não publica prazo; há relatos de 2 a 8 semanas para organizações. Se demorar, a data do lançamento anda junto (decisão "tudo junto").
3. **Google Play Console como organização** (taxa única de US$ 25). Conta de organização não tem a exigência de teste fechado com 12 pessoas por 14 dias, que vale para contas pessoais novas; a verificação da empresa também leva dias.
4. **Advogado**: a política, os termos e as perguntas 41 a 45. As lojas pedem as URLs públicas da política e da exclusão de conta.

Fontes: [Apple, D-U-N-S](https://developer.apple.com/br/help/account/membership/D-U-N-S/), [fórum da Apple, prazos de inscrição](https://developer.apple.com/forums/thread/842701), [regra dos 12 testadores](https://ontest.app/blog/google-play-12-testers-14-days-requirement-explained) (conferir na página oficial do Play Console).

### Risco: a natureza jurídica da Clarevo (Inova Simples)

A Clarevo foi aberta em 23/10/2026 como **Empresa Simples de Inovação (Inova Simples)**, CNPJ 69.771.864/0001-03, razão social CLAREVO INOVA SIMPLES (I.S.), natureza jurídica própria desse regime (código 234-8, Resolução CGSIM 55/2020). Dois pontos a conferir **antes** de pagar a inscrição da Apple:

1. **A Apple só aceita organização que seja pessoa jurídica capaz de assinar contratos** e recusa empresário individual, nome fantasia e filial. A lei não define bem as características da natureza Inova Simples nem a responsabilidade de quem a institui (Ofício Circular DREI 4767/2022). A Dun & Bradstreet pode emitir o D-U-N-S e a Apple ainda assim recusar, ou pedir documentos. Na App Store, o nome que aparece como vendedora seria "CLAREVO INOVA SIMPLES (I.S.)".
2. **Saída prevista:** a resolução permite transformar a Inova Simples em empresário individual ou sociedade (inclusive limitada, Ofício Circular DREI 3785/2022), com novo nome empresarial. Uma sociedade limitada unipessoal (SLU) daria um nome como "CLAREVO LTDA", aceito pelas lojas, mas a transformação leva o tempo da Junta Comercial e pede D-U-N-S do novo registro.

**Plano B, se a conta de empresa da Apple travar:** conta da Apple em nome do Enzo (pessoa física) e do Google em nome da Clarevo. É possível, porque as contas são independentes, mas tem um risco próprio: a regra 5.1.1(ix) das diretrizes da Apple pede que apps de áreas reguladas, como serviços financeiros, **ou que peçam informação sensível** sejam enviados por pessoa jurídica, e há relatos de recusa pedindo conta de organização. A Clarevo não move dinheiro nem oferece crédito, o que ajuda a argumentar, mas a decisão é da revisão. Antes de usar o plano B, vale pedir a consulta individual do App Review (no portal de desenvolvedores). Depois, a Apple aceita pedir a conversão da conta pessoal em conta de organização, pelo suporte, com o D-U-N-S; as fontes não confirmam se o app passa junto sem mudança, então conferir com a Apple por escrito. Fontes: [regra 5.1.1(ix) e relatos](https://developer.apple.com/forums/thread/825891), [conversão de conta](https://median.co/blog/how-to-change-your-apple-developer-account-from-individual-to-organization).

O que fazer nesta semana: (a) consultar o D-U-N-S pela ferramenta da Apple, que é gratuita e mostra se a Dun & Bradstreet reconhece a empresa; (b) perguntar ao contador ou ao advogado (pergunta 46) se a Inova Simples pode assinar os contratos da Apple e do Google e se convém transformar em SLU antes do lançamento; (c) só pagar a inscrição da Apple depois dessa resposta. O Google e o Expo podem seguir em paralelo.

## 2. Semana a semana

### Estado em 11/11/2026 e o pacote de D-093

Enzo decidiu, em 11/11/2026, o que entra antes do lançamento (D-093). Isso acrescenta trabalho da equipe, estimado assim:

| Pacote (D-093) | Estimativa da equipe | O que depende do Enzo |
|---|---|---|
| Oito melhorias da aba Metas (`docs/43`, seção 4) | **No ar em 11/11/2026** (PR #30) | Feito: migração 0031 aplicada em 11/11/2026 |
| Investimentos, aba nova, com CDI e IPCA (`docs/45`) | **No ar em 11/11/2026** (PR #30) | Feito: migração 0032 e função `indices` em 11/11/2026, conferida no ar com uma conta real (CDI e fonte na tela) |
| Fatura vencida em Multa e juros | **No ar em 11/11/2026** (PR #30) | Nada |
| Pix Automático na web | 2 a 3 dias (caminho A) ou 1 dia (caminho B) | **Decidir o caminho** (`docs/39`, seção 6: o Pix Automático pede o CPF no app e a conta liberada pelo Asaas) e perguntar ao Asaas se a conta pode usar |
| Widget ligado | **Pronto no código em 11/11/2026** (PR #30) | O próximo build (`preview`, já com o widget) e o teste no iPhone e no Android |
| Formulário de contato para empresas no site | Pronto desde D-066; ligar leva minutos | A regra de limite e as variáveis do Resend no painel da Cloudflare (`docs/22`, seção 9; a chave nunca passa pelo chat); depois, a equipe liga |
| Relatório de falhas (Sentry) | **Pronto no código em 11/11/2026** (PR #30) | A conta no Sentry e o endereço do projeto nas variáveis do EAS (`docs/46`, seção 2); pergunta 50 ao advogado |

Somando, eram cerca de 3 semanas de trabalho da equipe a partir de 11/11/2026, mas Metas, Investimentos, a fatura vencida, o widget e o Sentry ficaram prontos no mesmo dia e entraram na `main` com o PR #30. Do código, falta só o Pix Automático (1 a 3 dias depois da decisão do caminho). O que mais pesa agora na data é o teste em aparelho (roteiro único em `docs/47_TESTE_EM_APARELHO.md`), as contas da Apple e do Google e as respostas do advogado. A meta de 30/11/2026 (D-082) não se mantém; com as contas da Apple e do Google e as respostas do advogado, a segunda quinzena de dezembro é o mais provável. **A nova data é decisão do Enzo.**

O que já aconteceu desde o plano de 03/11: o Telegram para todas as pessoas está no ar (D-081, item 1.9); houve um primeiro build de teste no Android, instalado por link (item 2.1, D-086 e D-087); as capturas e a ficha das lojas estão prontas (item 3.3, 10/11/2026); a assinatura pelas lojas (D-090) e pela web (D-085) está pronta no código, com a compra fechada; o pacote do Instagram (item 4.2) passou para a sessão de redes sociais (`docs/44`).

### Semana 1: 3 a 9/11, contas e decisões

| # | O quê | Quem | Estado |
|---|---|---|---|
| 1.1 | Conferir se a Clarevo já tem D-U-N-S e, se não, pedir (seção 4) | Enzo | Pedido feito pela ferramenta da Apple em 03/11/2026; a Dun & Bradstreet entra em contato em até 5 dias úteis para confirmar os dados (se não entrar, falar com a Apple pelo link da mesma página) |
| 1.2 | Caixa de e-mail no domínio funcionando (contato@clarevo.app.br): a Apple exige e-mail da empresa no domínio | Enzo | |
| 1.3 | Inscrição na Apple como organização, assim que o D-U-N-S sair (seção 4) | Enzo | |
| 1.4 | Conta de organização no Google Play Console (seção 4) | Enzo | |
| 1.5 | Conta no Expo (gratuita), para os builds | Enzo | |
| 1.6 | Mandar ao advogado: `docs/legal/resumo-para-advogado.md` (perguntas 41 a 46), `docs/legal/pendencias-do-lancamento.md` (grupo B), a política e os termos; pedir resposta até 17/11 | Enzo | |
| 1.7 | Supabase: plano Pro (cópias de segurança), proteção contra senhas vazadas; apagar o projeto antigo e a chave antiga do Resend | Enzo | |
| 1.8 | Aprovar as 13 decisões das lojas (seção 3) | Enzo | Aprovadas em 03/11/2026 |
| 1.8b | Aprovar as 16 decisões de produto dos textos legais (`docs/legal/pendencias-do-lancamento.md`, grupo A) | Enzo | |
| 1.9 | Telegram: aviso "Baixar o Telegram", PR e função publicada de novo | Equipe e Claude Chrome | Código pronto e roteiro de telas 9.091 de 9.091 (03/11/2026); falta o PR e publicar a função |
| 1.10 | Aplicar as decisões aprovadas em `app.json` e atualizar `docs/16` e `docs/lojas/` | Equipe | Feito em 03/11/2026 (falta a razão social, que vem do Enzo) |

### Semana 2: 10 a 16/11, primeiro build

| # | O quê | Quem |
|---|---|---|
| 2.1 | Primeiro build Android (`preview`, APK por link) e teste no celular do Enzo. Lista do que falta e do que conferir: `docs/40_PRIMEIRO_BUILD.md` | Enzo, com roteiro da equipe |
| 2.2 | Teste em aparelho dos itens abertos (`docs/04`): câmera da nota, leitura de print e boleto, biometria, lembretes, exportar, importar, letra grande, e-mail de confirmação abrindo o app | Enzo |
| 2.3 | Corrigir o que o teste mostrar | Equipe |
| 2.4 | Conta de teste para a revisão das lojas, com dados fictícios (`docs/16`, seção 5) | Enzo |
| 2.5 | Primeiro build iPhone e TestFlight, quando a Apple aprovar a conta | Enzo, com roteiro da equipe |

### Semana 3: 17 a 23/11, acabamento

| # | O quê | Quem |
|---|---|---|
| 3.1 | Respostas do advogado aplicadas na política, nos termos e nas telas | Equipe |
| 3.2 | Site final: CNPJ, razão social, endereço e e-mails em `site/dados-da-empresa.json`; tirar a faixa "Versão preliminar" | Enzo passa os dados; equipe publica |
| 3.3 | Ficha das lojas, capturas novas (com o Telegram) e respostas de privacidade (`docs/lojas/`) | Equipe; Enzo cola nos painéis. **Capturas e ficha prontas em 10/11/2026:** 10 telas em 3 tamanhos, com o comprovante lido e o Telegram (ordem de envio em `docs/16`, seção 7); a ficha ganhou a seção ASSINATURA (preço, renovação, cancelamento e o link dos Termos), as notas para a revisão dizem onde está a compra, e a classificação do Google responde que há compra de bens digitais. Falta o que depende do advogado (as páginas publicadas) e das respostas de privacidade quando a compra abrir |
| 3.4 | Build de produção nas duas lojas e teste interno | Enzo, com roteiro |

### Semana 4: 24 a 30/11, lançamento

| # | O quê | Quem |
|---|---|---|
| 4.1 | Enviar para a revisão da Apple e do Google, com liberação manual (para sair junto) | Enzo |
| 4.2 | Vídeo do reels e pacote do Instagram com o Telegram e as leituras novas | Equipe |
| 4.3 | Última rodada de testes (núcleo, banco, API, telas) na `main` | Equipe |
| 4.4 | Liberar nas lojas e anunciar, no mesmo dia | Enzo |

## 3. As 13 decisões das lojas (`docs/16`, seção 2), com a recomendação

| # | Decisão | Recomendação |
|---|---|---|
| 1 | Identificador do app (não muda depois) | `app.clarevo`, o que já está em `app.json` |
| 2 | Nome do desenvolvedor | A razão social do CNPJ (ou "Clarevo", se for o nome fantasia registrado no CNPJ; na Apple, só dá para escolher ao criar o primeiro app) |
| 3 | Suporte | contato@clarevo.app.br e https://clarevo.app.br/suporte.html |
| 4 | Política e termos | https://clarevo.app.br/privacidade.html e https://clarevo.app.br/termos.html, depois do advogado |
| 5 | Responsável pelas contas | Enzo, como fundador |
| 6 | Nome nas lojas | Clarevo |
| 7 | Classificação etária | 18+, porque os termos e a política dizem que a Clarevo é para pessoas com 18 anos ou mais |
| 8 | Criptografia | Isenta: o app só usa a criptografia padrão (HTTPS) e resumos; `usesNonExemptEncryption: false` em `app.json` |
| 9 | Backup automático do Android | Desligado (`allowBackup: false`): app financeiro |
| 10 | 4 últimos dígitos do cartão e notas nas respostas de privacidade | Declarar, por prudência |
| 11 | Relatório de falhas (Sentry) | **Entra no lançamento (D-093, 11/11/2026)**, sem dado financeiro nem pessoal, com conta criada pelo Enzo, trecho na política e pergunta ao advogado (era "avaliar em dezembro") |
| 12 | Preço | Gratuito para baixar, com assinatura dentro do app (D-083 e D-090): R$ 29,90 e R$ 69,90 por mês, 14 dias grátis dados pela própria conta |
| 13 | Países | Brasil |

## 4. Roteiro das contas (Enzo, à mão)

1. **D-U-N-S:** em https://developer.apple.com/enroll/duns-lookup/, entre com uma Apple Account e procure a Clarevo pela razão social e endereço do cartão CNPJ. Se não achar, peça pelo mesmo caminho (gratuito). Guarde o número: o Google também pede.
2. **Apple Account da empresa:** com um e-mail do domínio (por exemplo contato@clarevo.app.br), autenticação em dois fatores ligada e o seu nome legal.
3. **Inscrição:** em https://developer.apple.com/programs/enroll/, como organização, com o D-U-N-S, o site (https://clarevo.app.br) e o e-mail do domínio. Pagar os US$ 99 com o cartão da empresa. A Apple pode ligar para confirmar que você representa a empresa.
4. **Google:** em https://play.google.com/console, criar a conta como **organização**, com o D-U-N-S, os dados do CNPJ e o e-mail do domínio; pagar os US$ 25 e fazer a verificação pedida.
5. **Expo:** em https://expo.dev, criar a conta com o e-mail do domínio (gratuita).
6. Mandar à equipe só o estado de cada um (por exemplo "Apple: em análise"), sem senhas, códigos nem números de cartão.

## 5. Primeiro build, sem terminal (semana 2)

O Expo monta o app das lojas a partir do repositório no GitHub, pelo site expo.dev, com o botão "Build from GitHub" (o Enzo não precisa instalar nada no computador). Ordem:

1. **Enzo, em expo.dev:** criar a conta com o e-mail do domínio e um projeto com o nome `clarevo`. Mandar à equipe o **usuário (owner)** e o **Project ID** da página do projeto (não são segredos).
2. **Equipe:** pôr `owner` e `extra.eas.projectId` em `apps/app/app.json`, PR e merge. (Feito em 06/11/2026: `clarevos-team` e o projeto `clarevo`.)
3. **Enzo, em expo.dev, no projeto:** instalar o app do Expo no GitHub e ligar o repositório `Clarevo`, com a pasta base `apps/app` (configuração "Base directory" da página GitHub do projeto). Em Environment variables, criar `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_KEY` (a chave pública do app, a mesma da web) nos ambientes `preview` e `production`, com visibilidade "plain text". Nenhuma senha nem chave secreta vai para o Expo.
4. **Enzo:** na lista de builds do projeto, "Build from GitHub": ramo `main`, plataforma Android, perfil `preview`. A chave de assinatura do Android é gerada e guardada pelo Expo (é a chave que assina o app para sempre, nunca vai ao repositório). O passo a passo com os nomes das telas está em `docs/40`, seção 2a.
5. **Enzo:** instalar o APK pelo link que o Expo mostra no fim, no próprio celular Android, e fazer o teste da semana 2 (item 2.2).
6. **iPhone:** só depois de a Apple aprovar a conta; as credenciais do iPhone pedem um passo a mais, que a equipe manda na hora.

Fontes: [Expo, builds a partir do GitHub](https://docs.expo.dev/build/building-from-github), [tutorial do Expo](https://docs.expo.dev/tutorial/eas/using-github) (consultadas em 03/11/2026; as telas do expo.dev podem ter nomes um pouco diferentes).

## 6. Teste no celular (semana 2, item 2.2)

O roteiro completo, que inclui estes 17 itens e os testes em aparelho de todos os ciclos (widget, lembretes de D-087 e D-093, câmera, arquivos, letra grande, leitor de tela e Sentry), está em `docs/47_TESTE_EM_APARELHO.md`. Com o app instalado pelo link do Expo (Android) ou pelo TestFlight (iPhone). Para cada item, anotar "ok" ou mandar um print do que deu errado. Dados de verdade só os seus; para testar outra pessoa, usar um e-mail de teste.

| # | O que fazer | O esperado |
|---|---|---|
| 1 | Abrir o app e entrar com a sua conta | Entra no Resumo com os seus dados, igual à web |
| 2 | Conta > ligar a biometria; fechar o app e abrir de novo | Pede a digital ou o rosto antes de mostrar os dados |
| 3 | Conta > Ocultar valores | Os valores viram pontinhos em todas as telas |
| 4 | Contas a pagar > nova conta vencendo amanhã, com lembrete; permitir as notificações | A notificação chega no horário (pode atrasar alguns minutos no Android) |
| 4b | Conta > Lembretes > ligar "Anotar os gastos do dia" (horário daqui a pouco) e "Uma semana sem anotar" | O aviso do dia chega no horário, sem valores, e o toque abre Anotar gasto; com um gasto anotado antes do horário, o aviso de hoje não chega |
| 5 | Anotar gasto > Escanear nota fiscal > apontar para o QR Code de um cupom | Preenche valor, data e descrição |
| 6 | Escanear nota fiscal > foto da chave de uma nota (os 44 números) | Lê a chave e preenche |
| 7 | Ler comprovante > escolher um print de Pix da galeria | Preenche valor, data e o nome de quem recebeu |
| 8 | Contas a pagar > Ler boleto > foto de um boleto | Cria a conta a pagar com valor e vencimento |
| 9 | Registrar recebimento > Ler comprovante > PDF do holerite e, depois, de uma nota de serviço | Preenche o valor líquido e a descrição |
| 10 | Importar extrato > um PDF ou OFX do banco | Mostra as linhas para conferir antes de gravar |
| 11 | Exportar meus dados > CSV e PDF > compartilhar | Abre a folha de compartilhar do celular |
| 12 | Aumentar a letra nas configurações do celular e abrir Resumo, Movimentos e Conta | Nada cortado nem sobreposto |
| 13 | Ligar o leitor de tela (TalkBack no Android, VoiceOver no iPhone) e passar pelo Resumo | Lê os números e os botões com nomes claros |
| 14 | Criar uma conta nova com outro e-mail seu e tocar no link de confirmação no celular | O link abre o app (ou a web) e a conta fica confirmada |
| 15 | Conta > Telegram > Gerar código > Abrir o Telegram | Abre o Telegram com o @ClarevoBot; Iniciar liga a conta |
| 16 | Modo avião e abrir o app | Mensagem clara de sem conexão, sem tela em branco |
| 17 | Girar o celular, voltar com o botão do sistema, trocar de app e voltar | Nada se perde no meio de um cadastro |

## 7. Assinatura paga (D-083)

R$ 29,90 por mês, 14 dias grátis sem cartão, depois só ver e exportar; pelas lojas no celular e por cartão e Pix na web; o benefício pela empresa continua sem pagar; plano Família de R$ 69,90 por mês, até 6 pessoas, pago pela titular. Isso entra no lançamento e é o maior pedaço que falta.

| # | O quê | Quem |
|---|---|---|
| 7.1 | Valor do plano Família (R$ 69,90, decidido em 04/11/2026) e se haverá plano anual | Enzo. Decidido em 10/11/2026 (D-090): só o mensal no lançamento |
| 7.2 | Banco: o direito de uso de cada pessoa (teste, assinatura, benefício), a regra "só ver e exportar" nas funções de escrita e o registro de cada mudança; testes | Equipe. **Fase 1 pronta em 04/11/2026** (migração 0023, `supabase/tests/99zz_assinatura.sql`), aplicada em produção em 05/11/2026 (conferência 2, 1, 1, 1, 0 e 92), com a função do Telegram publicada de novo; a cobrança só começa quando a equipe marcar a data (`clarevo_staff_set_billing_start`) |
| 7.3 | App: tela de assinar, contagem dos dias do teste, aviso antes do fim, modo "só ver e exportar" e "Restaurar compras" | Equipe. **Fase 1 pronta em 04/11/2026:** card e tela Assinatura em Conta (situação, datas, planos e preços), aviso no Resumo nos últimos 3 dias e em só leitura, botões de anotar escondidos em só leitura, Telegram responde que a conta está só para ver. **Fase 2, web, pronta em 06/11/2026** (D-085): botões de assinar pelo Asaas, volta do pagamento e "Cancelar assinatura" em Conta, Assinatura, escondidos até o lançamento (`SUBSCRIBE_OPEN`). **Fase 2, lojas, pronta em 10/11/2026** (D-090, `docs/42_ASSINATURA_LOJAS.md`): compra pela App Store e pelo Google Play com o RevenueCat, botões de assinar, "Restaurar compras", ajustes da loja e troca de plano, a função do servidor `assinatura-lojas` (avisos do RevenueCat e `billing_apply`), sem migração nova; escondida até o lançamento (`SUBSCRIBE_OPEN`). Excluir a conta cancela a assinatura da web e avisa que a da loja se cancela na loja |
| 7.4 | Lojas: assinaturas no App Store Connect e no Play Console (`clarevo_individual_mensal` a R$ 29,90 e `clarevo_familia_mensal` a R$ 69,90), contrato de apps pagos da Apple com conta bancária e dados fiscais da empresa, perfil de pagamentos do Google, e o RevenueCat (D-090) | Enzo, com o roteiro de `docs/42_ASSINATURA_LOJAS.md`, seção 4 |
| 7.5 | Web: escolher e abrir a conta do serviço de pagamento (cartão e Pix Automático), com o CNPJ; a equipe liga o retorno do pagamento ao banco | Enzo abre a conta; equipe integra. **Asaas escolhido em 05/11/2026 (D-084) e integração pronta em 06/11/2026 (D-085, `docs/39`):** função do servidor, migração 0026, botões de assinar e cancelar na web (só cartão por enquanto). Falta: conta no sandbox e em produção, segredos no Supabase, aviso configurado no Asaas e o teste no sandbox (`docs/39`, seção 4) |
| 7.6 | Termos (preço, renovação, cancelamento, arrependimento) e política (serviços de pagamento) para o advogado | Equipe redige; advogado confere. **Redigidos em 04/11/2026:** termos, seção 12; política, seção 3.9 (era 3.12 antes de tirar as seções desligadas) e trechos das seções 6, 8 e 11; exclusão de conta; pergunta 47 do resumo para o advogado |
| 7.7 | Contador: nota fiscal das vendas da web e dos repasses das lojas, e o que a Inova Simples permite vender (pergunta 46) | Enzo |

**Prazo:** a assinatura acrescenta cerca de duas semanas de trabalho da equipe e as contas de pagamento do Enzo. Com a decisão "tudo junto", 30/11 continua sendo a meta, mas o mais provável passa a ser a primeira quinzena de dezembro.
