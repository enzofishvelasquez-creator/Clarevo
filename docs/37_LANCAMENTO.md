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

## 2. Semana a semana

### Semana 1: 3 a 9/11, contas e decisões

| # | O quê | Quem | Estado |
|---|---|---|---|
| 1.1 | Conferir se a Clarevo já tem D-U-N-S e, se não, pedir (seção 4) | Enzo | |
| 1.2 | Caixa de e-mail no domínio funcionando (contato@clarevo.app.br): a Apple exige e-mail da empresa no domínio | Enzo | |
| 1.3 | Inscrição na Apple como organização, assim que o D-U-N-S sair (seção 4) | Enzo | |
| 1.4 | Conta de organização no Google Play Console (seção 4) | Enzo | |
| 1.5 | Conta no Expo (gratuita), para os builds | Enzo | |
| 1.6 | Mandar ao advogado: `docs/legal/resumo-para-advogado.md` (perguntas 41 a 45), a política e os termos; pedir resposta até 17/11 | Enzo | |
| 1.7 | Supabase: plano Pro (cópias de segurança), proteção contra senhas vazadas; apagar o projeto antigo e a chave antiga do Resend | Enzo | |
| 1.8 | Aprovar as 13 decisões das lojas (seção 3) | Enzo | Aprovadas em 03/11/2026 |
| 1.9 | Telegram: aviso "Baixar o Telegram", PR e função publicada de novo | Equipe e Claude Chrome | Feito o código; falta o PR |
| 1.10 | Aplicar as decisões aprovadas em `app.json` e atualizar `docs/16` e `docs/lojas/` | Equipe | Feito em 03/11/2026 (falta a razão social, que vem do Enzo) |

### Semana 2: 10 a 16/11, primeiro build

| # | O quê | Quem |
|---|---|---|
| 2.1 | Primeiro build Android (`preview`, APK por link) e teste no celular do Enzo | Enzo, com roteiro da equipe |
| 2.2 | Teste em aparelho dos itens abertos (`docs/04`): câmera da nota, leitura de print e boleto, biometria, lembretes, exportar, importar, letra grande, e-mail de confirmação abrindo o app | Enzo |
| 2.3 | Corrigir o que o teste mostrar | Equipe |
| 2.4 | Conta de teste para a revisão das lojas, com dados fictícios (`docs/16`, seção 5) | Enzo |
| 2.5 | Primeiro build iPhone e TestFlight, quando a Apple aprovar a conta | Enzo, com roteiro da equipe |

### Semana 3: 17 a 23/11, acabamento

| # | O quê | Quem |
|---|---|---|
| 3.1 | Respostas do advogado aplicadas na política, nos termos e nas telas | Equipe |
| 3.2 | Site final: CNPJ, razão social, endereço e e-mails em `site/dados-da-empresa.json`; tirar a faixa "Versão preliminar" | Enzo passa os dados; equipe publica |
| 3.3 | Ficha das lojas, capturas novas (com o Telegram) e respostas de privacidade (`docs/lojas/`) | Equipe; Enzo cola nos painéis |
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
| 11 | Relatório de falhas (Sentry) | Não no lançamento; avaliar em dezembro (menos uma conta, um segredo e uma mudança de política agora) |
| 12 | Preço | Gratuito |
| 13 | Países | Brasil |

## 4. Roteiro das contas (Enzo, à mão)

1. **D-U-N-S:** em https://developer.apple.com/enroll/duns-lookup/, entre com uma Apple Account e procure a Clarevo pela razão social e endereço do cartão CNPJ. Se não achar, peça pelo mesmo caminho (gratuito). Guarde o número: o Google também pede.
2. **Apple Account da empresa:** com um e-mail do domínio (por exemplo contato@clarevo.app.br), autenticação em dois fatores ligada e o seu nome legal.
3. **Inscrição:** em https://developer.apple.com/programs/enroll/, como organização, com o D-U-N-S, o site (https://clarevo.app.br) e o e-mail do domínio. Pagar os US$ 99 com o cartão da empresa. A Apple pode ligar para confirmar que você representa a empresa.
4. **Google:** em https://play.google.com/console, criar a conta como **organização**, com o D-U-N-S, os dados do CNPJ e o e-mail do domínio; pagar os US$ 25 e fazer a verificação pedida.
5. **Expo:** em https://expo.dev, criar a conta com o e-mail do domínio (gratuita).
6. Mandar à equipe só o estado de cada um (por exemplo "Apple: em análise"), sem senhas, códigos nem números de cartão.
