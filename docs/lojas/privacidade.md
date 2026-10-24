# Privacidade nas lojas

19/10/2026 (Ciclo R, D-060 item 1). Respostas para "Privacidade do app" (App Privacy) da Apple e "Segurança dos dados" (Data safety) do Google Play, derivadas do que o app **realmente** coleta, conferido no código (`apps/app/src`, `packages/core/src`) e no banco (`supabase/migrations`). Servem de roteiro de preenchimento; quem assina as respostas nas lojas é Enzo, e as marcadas "depende" esperam o advogado (D-058, M-5, P-010, P-023) ou a decisão de instalar o Sentry (ainda não instalado). Nenhuma chave, senha ou identificador de conta aparece aqui.

**Fontes.** Apple: `developer.apple.com/app-store/app-privacy-details/` (tipos de dados, finalidades, "vinculado à pessoa" e rastreamento) e `.../help/app-store-connect/reference/app-information/app-privacy`, lidas em 19/10/2026. Google: `developer.android.com/privacy-and-security/declare-data-use` (categorias e tipos do formulário "Segurança dos dados"), lida em 19/10/2026. As perguntas exatas do Play Console ficam em `support.google.com`, que a rede desta sessão não abriu: as respostas abaixo seguem as categorias da página do Android e precisam ser **conferidas na tela do formulário** no dia de preencher. Os dois formulários podem ser corrigidos a qualquer momento (a Apple diz que não é preciso enviar nova versão para mudar as respostas); a obrigação é mantê-los iguais ao que o app faz.

## 1. O que o app coleta de fato

"Coletar", para a Apple, é enviar o dado para fora do aparelho de um jeito que o Clarevo (ou um parceiro) possa acessar por mais tempo do que o pedido exige. Tudo o que vai ao Supabase (autenticação e banco, projeto `clarevo-producao`, região São Paulo, `docs/05`) conta como coletado. O que fica só no aparelho não conta.

**Vai para o servidor, ligado à conta da pessoa**

| Dado | De onde vem | Onde fica |
|---|---|---|
| E-mail | Digitado ao criar a conta e ao entrar | Autenticação do Supabase (`auth.users`); o banco do app não o copia. A empresa só vê o e-mail que ela mesma convidou (D-056) |
| Nome de apresentação (1 a 80 caracteres), fuso e idioma | O nome é digitado ao criar a conta; o fuso vem do aparelho no primeiro acesso (`ensure_personal_space`, com America/Sao_Paulo se o aparelho não informar) e o idioma é o português do Brasil | `persons` |
| Identificador interno da conta | Criado pelo Supabase | `auth.users` e em toda linha da pessoa |
| Dados financeiros digitados: valores (em centavos), datas, descrições (até 80 caracteres), categorias, contas a pagar, gastos fixos, parcelamentos e contas do ano, metas e aportes, renda de referência, limite e orçamento, contas de origem do dinheiro, cartões (apelido, 4 últimos dígitos se a pessoa quiser, dias de fechamento e vencimento, limite) e faturas | Digitados ou importados pela pessoa | `financial_records`, `commitments`, `commitment_series`, `goals`, `cards`, `card_entries`, `category_budgets` e as outras tabelas de `docs/05` |
| Resumo SHA-256 da chave da nota fiscal e de cada linha importada | Calculado no aparelho | `receipt_key` e o resumo de cada linha importada. Só o resumo, nunca a chave, o CNPJ, o CPF nem o texto da nota |
| Resposta do plano de guardar e datas da última anotação | Resposta da pessoa; atividade mantida por gatilho | `savings_checks`, `context_activity` (lidos só pela própria pessoa, sem ir à empresa) |
| Resposta opcional de "Como você conheceu o Clarevo?" (D-067): uma de seis origens, sem texto livre, quando respondeu e a versão | Resposta da pessoa, opcional | `signup_sources` (lida só pela própria pessoa; a equipe só vê contagens por semana, sem identificar ninguém e com contagens de 1 a 4 escondidas; sai junto com a conta). Entra na declaração como outro conteúdo fornecido pela pessoa, ligado à conta, sem uso para rastreamento nem anúncio (pergunta 34 do resumo para o advogado) |
| Família: vínculo, papel, convites (só o resumo SHA-256 do código) | Convite por link | `context_memberships`, `family_invites` |
| Rastro técnico: quem fez qual operação e quando | Gravado pelas funções de escrita | `record_operations` (sai junto com a conta, D-058; a retenção dos registros excluídos que ficam na Família é P-010) |

**Não sai do aparelho**

- A imagem da câmera (a câmera só lê o QR Code ou o código de barras; nenhuma foto é guardada) e o código lido, que vira só o resumo SHA-256.
- Os PDFs de nota e de comprovante e os arquivos de extrato (OFX ou CSV): o texto é lido no aparelho e descartado; só o que a pessoa confirma vira lançamento.
- A biometria: o sistema do aparelho decide e o app só recebe "sim" ou "não". Não há dado biométrico no app.
- Os lembretes: são notificações locais agendadas no aparelho; o app não pede nem guarda token de notificação remota.
- As preferências (ocultar valores, tema de bolhas ou barras, "Primeiros passos", o dia de primeiro uso e o "Agora não" da pergunta "Como você conheceu o Clarevo?") e a memória de lojas e nomes (pelo resumo SHA-256 do CNPJ).
- As buscas e as leituras de Aprender: o app não registra (CLAUDE.md).
- A exportação: o arquivo CSV ou PDF vai ao compartilhamento do aparelho por ação da pessoa.
- A leitura da página pública da Sefaz-RJ: o aparelho consulta o site do governo diretamente, a pedido da pessoa, sem servidor do Clarevo no meio (`apps/app/src/lib/sefaz-fetch.ts`). Não é coleta pelo Clarevo; o advogado confere se o texto da política precisa citar essa consulta.

**Não existe no app:** anúncios, SDK de anúncio ou de análise de uso escolhido pelo Clarevo, identificador de publicidade, localização, contatos, fotos da galeria, microfone, saúde, histórico de navegação, compras dentro do app (cobrança está fora do ciclo atual) e venda ou cessão de dados.

**Exceção no Android: SDK do Google na leitura de código.** O `expo-camera` inclui `com.google.android.gms:play-services-code-scanner` e `com.google.mlkit:barcode-scanning` (`node_modules/expo-camera/android/build.gradle`, linhas 43 e 44). A imagem é lida no aparelho, mas esses SDKs do Google podem enviar métricas de uso e de desempenho com identificadores do aparelho. Por isso a seção 3 declara, por precaução, identificadores do aparelho e diagnósticos; **confirmar na documentação do ML Kit antes de enviar**. No iOS o `expo-camera` lê o código com o leitor do sistema (VisionKit e AVFoundation) e, para PDF417, Code 39 e Codabar, com a biblioteca de decodificação ZXingObjC (`node_modules/expo-camera/ios/ExpoCameraBarcodeScanning.podspec`); o app só pede QR Code e Code 128 (`apps/app/src/components/receipt-scan.tsx`, linha 266). Nenhum SDK do Google entra no iOS, e a resposta da Apple não muda.

**Compras e notas, nas duas lojas.** As compras no cartão e as notas fiscais lidas ou digitadas entram em "Outras informações financeiras" na Apple e no Google, e não em "Compras" nem em "Histórico de compras", porque são anotações financeiras que a pessoa digita, não compras feitas dentro do app nem histórico de uma loja.

## 2. Apple: App Privacy (App Store Connect)

**Rastreamento (tracking): não.** Nenhum dado é ligado a dados de terceiros para publicidade nem entregue a corretor de dados. Domínios de rastreamento: nenhum. Não há pergunta de rastreamento no app (nenhum `NSUserTrackingUsageDescription`).

| Tipo de dado (nome na Apple) | Coleta? | Ligado à pessoa? | Finalidade | Observação |
|---|---|---|---|---|
| Informações de contato › Endereço de e-mail | Sim | Sim | Funcionalidade do app | Entrar, confirmar o e-mail, recuperar o acesso |
| Informações de contato › Nome | Sim | Sim | Funcionalidade do app | Nome de apresentação, mostrado a quem convive na mesma Família |
| Informações financeiras › Outras informações financeiras | Sim | Sim | Funcionalidade do app | Renda, gastos, contas, dívidas e metas que a pessoa digita, inclusive compras no cartão e notas lidas ou digitadas |
| Informações financeiras › Informações de pagamento | **Depende** | Sim | Funcionalidade do app | O app guarda só os 4 últimos dígitos do cartão, se a pessoa quiser, nunca o número inteiro (D-037). A Apple define "informações de pagamento" como forma de pagamento, número de cartão ou de conta. **Proposta:** declarar por prudência enquanto o campo existir; decisão de Enzo e do advogado. Tirar o campo é a alternativa |
| Conteúdo do usuário › Outro conteúdo do usuário | Sim | Sim | Funcionalidade do app | Descrições livres de registros, nomes de contas, de metas e de cartões. A Apple manda marcar este tipo para campos de texto livres |
| Identificadores › ID do usuário | Sim | Sim | Funcionalidade do app | Identificador interno da conta |
| Diagnósticos › Dados de falhas e de desempenho | **Não hoje; depende do Sentry** | Se o Sentry for instalado, ligar ou não ao usuário depende da configuração | Funcionalidade do app | Hoje o app não envia relatório de falha. Se o Sentry entrar: declarar estes tipos, sem enviar valores, descrições nem e-mail (não ligados à pessoa), e atualizar a política |
| Uso do app, localização, contatos, saúde e atividade física, fotos ou vídeos, áudio, histórico de busca ou de navegação, compras, informações sensíveis, ID do dispositivo | Não | | | "Compras" é a Apple e a loja; as compras no cartão que a pessoa anota são "Outras informações financeiras" (acima). Sem SDK do Google no iOS (ponto 3 abaixo) |

**Resultado no cartão da App Store:** "Dados ligados a você": informações de contato, informações financeiras, conteúdo do usuário e identificadores. "Dados usados para rastreá-lo": nenhum.

**Links.** URL da política de privacidade: obrigatória (campo para Enzo em `docs/lojas/ficha.md`, seção 8). URL de opções de privacidade: opcional; a página de exclusão da conta pode ocupar este campo.

**Pontos de atenção da Apple.** (1) "Coletar" não inclui o que é enviado só para atender o pedido e descartado; este caso não existe no Clarevo (tudo que é enviado fica na conta). (2) O IP: se o Clarevo guardar o endereço IP das pessoas, a Apple manda declará-lo conforme o uso (a página cita localização, ID do dispositivo ou diagnósticos). O Supabase pode guardar IP e agente do navegador nos registros de autenticação: **conferir no painel do Supabase** e decidir com o advogado se entra como "Outros dados de diagnóstico". (3) O Clarevo não instala SDK de anúncio nem de análise (conferido em `apps/app/package.json`), mas as bibliotecas do Expo trazem SDKs e manifestos de privacidade próprios. No iOS, o único caso a olhar é a leitura de código: usa o leitor do sistema e a ZXingObjC, sem SDK do Google (seção 1), então a tabela acima não muda. Conferir no primeiro envio ao TestFlight se a Apple reclama de algum manifesto (ver `docs/16`, "Conferir no primeiro build").

## 3. Google Play: Segurança dos dados (Data safety)

**Perguntas gerais**

| Pergunta | Resposta |
|---|---|
| O app coleta ou compartilha algum dos tipos de dados exigidos? | Sim, coleta. Compartilha: não |
| Todos os dados coletados são criptografados em trânsito? | Sim: toda a comunicação com o Supabase é por HTTPS. O projeto nativo gerado para produção deixa `NSAllowsArbitraryLoads` falso no iOS (conferido em um `expo prebuild` de teste em 19/10/2026) e o Android bloqueia tráfego sem criptografia por padrão |
| As pessoas podem pedir a exclusão dos dados? | Sim: dentro do app (Conta › Excluir minha conta, D-058). O Google também pede o endereço de uma página que explique o pedido: a página existe como rascunho em `site/excluir-conta.html` (texto em `docs/legal/exclusao-de-conta.md`, D-064), com o endereço do projeto `clarevo-site` ou do domínio (P-006); **só vale publicar depois da revisão do advogado** e do e-mail de privacidade (P-023). Campo em `docs/lojas/ficha.md`, seção 8 |
| Público-alvo | Adultos (18 anos ou mais); P-002 é recomendação, ainda não decisão de Enzo |

**Tipos de dados** (categorias da página `declare-data-use` do Android)

| Categoria › tipo | Coleta | Compartilha | Obrigatório ou opcional | Finalidades |
|---|---|---|---|---|
| Informações pessoais › Nome | Sim | Não | Obrigatório (nome de apresentação) | Funcionalidade do app; gerenciamento de conta |
| Informações pessoais › Endereço de e-mail | Sim | Não | Obrigatório | Funcionalidade do app; gerenciamento de conta |
| Informações pessoais › IDs de usuário | Sim | Não | Obrigatório | Funcionalidade do app; gerenciamento de conta |
| Informações financeiras › Outras informações financeiras | Sim | Não | Opcional (a pessoa escolhe o que anota) | Funcionalidade do app. Inclui compras no cartão e notas lidas ou digitadas (seção 1) |
| Informações financeiras › Histórico de compras | Não | | | Tratado como na Apple: o que a pessoa anota é "Outras informações financeiras" (linha acima). Conferir o enquadramento na tela do formulário |
| Informações financeiras › Informações de pagamento do usuário | **Depende** | Não | Opcional | Funcionalidade do app. Mesma questão dos 4 últimos dígitos do cartão (seção 2) |
| Atividade no app › Outro conteúdo gerado pelo usuário | Sim | Não | Opcional | Funcionalidade do app (descrições livres) |
| Informações e desempenho do app › Diagnósticos | **Sim, por precaução** (SDK de leitura de código do Google, só no Android) | Não | Opcional (só quando a pessoa abre o leitor da nota) | Finalidade provável: análises e funcionalidade do app, só do SDK; **nenhum uso para anúncios**. Evidência: `play-services-code-scanner` e `com.google.mlkit:barcode-scanning` em `node_modules/expo-camera/android/build.gradle`, linhas 43 e 44. **Confirmar na documentação do ML Kit antes de enviar** |
| Informações e desempenho do app › Registros de falhas | **Não hoje; depende do Sentry** | Não | | Do app, ainda não instalado. Se o Sentry entrar, declarar e atualizar a política |
| Dispositivo ou outros IDs › ID do dispositivo ou outros IDs | **Sim, por precaução** (SDK de leitura de código do Google, só no Android) | Não | Opcional (só quando a pessoa abre o leitor da nota) | Finalidade provável: análises e funcionalidade do app, só do SDK; **nenhum uso para anúncios**. Mesma evidência da linha acima. **Confirmar na documentação do ML Kit antes de enviar** |
| Localização, mensagens, fotos e vídeos, áudio, arquivos e documentos, agenda, contatos, saúde e condicionamento, navegação na web | Não | | | Os arquivos que a pessoa escolhe (PDF, OFX, CSV) são lidos no aparelho e não são enviados, e o app não pede acesso ao armazenamento: por isso "arquivos e documentos" não é coletado |

**Compartilhamento: nenhum.** O Supabase hospeda a autenticação e o banco em nome do Clarevo (prestador de serviço), o que o Google não conta como compartilhamento; **conferir o enquadramento na tela do formulário** e, no texto da política, nomear o prestador. A Família mostra o que a pessoa lança às outras pessoas da mesma Família, por escolha dela (convite por link). A empresa que oferece o Clarevo como benefício nunca lê finanças, nem somadas (D-056, M-5).

## 4. O que depende do advogado, de Enzo ou do Sentry

| Item | Depende de | O que muda nas respostas |
|---|---|---|
| Prazos de guarda e texto final da exclusão da conta (D-058), inclusive por quanto tempo as cópias de segurança do Supabase guardam dado já apagado | Advogado | O texto da política e a frase "A exclusão da conta e dos dados é feita por você" da ficha. As respostas de coleta não mudam |
| Papel da empresa que paga a licença e papel do Clarevo como controlador dos dados financeiros (M-5, `docs/13`) | Advogado, antes do primeiro contrato | Confirma "compartilhamento: nenhum" e o texto sobre empresas |
| Retenção do rastro técnico de registros excluídos que ficam na Família (P-010) | Assessoria de privacidade | Texto da política |
| Canal para pedidos de titular da LGPD, art. 18 (P-023), e a página de exclusão exigida pelo Google | Domínio e e-mail próprios (P-006) | URL de exclusão e de suporte |
| Os 4 últimos dígitos do cartão: declarar "informações de pagamento" (Apple) e "informações de pagamento do usuário" (Google), ou tirar o campo | Enzo e advogado | As duas tabelas acima |
| Compras no cartão e notas como "Outras informações financeiras" nas duas lojas, e "Histórico de compras" (Google) e "Compras" (Apple) como "Não" | Enzo e advogado, e a tela do formulário | As tabelas das seções 2 e 3 |
| IP e agente do navegador nos registros do Supabase Auth | Painel do Supabase e advogado | Possível linha "Outros dados de diagnóstico" (Apple) |
| Provedor de hospedagem é empresa estrangeira (o projeto fica em São Paulo) | Advogado (LGPD, art. 33) | Texto da política |
| Leitura do QR Code no Android: `expo-camera` usa o ML Kit do Google (modelo dentro do app, leitura no aparelho; `build.gradle`, linhas 43 e 44) | Página de divulgação de dados do ML Kit, que esta rede não abriu | Já declarados por precaução: identificadores do aparelho e diagnósticos, não compartilhados, sem anúncios. Confirmar na documentação do ML Kit antes de enviar, inclusive "compartilhamento: nenhum"; a resposta pode mudar de finalidade ou sair |
| Relatório de falhas (Sentry) ainda não instalado | Decisão de Enzo | Diagnósticos nas duas lojas, o manifesto de privacidade e a política. Instalar já com `sendDefaultPii` desligado e sem valores, descrições nem e-mail nos eventos |
| Classificação etária: 18+ ou não (P-002) | Enzo | Substituição da classificação na Apple (`docs/lojas/ficha.md`, seção 9) |

Os textos da política de privacidade, dos termos de uso e da exclusão de conta **existem como rascunho para o advogado** em `docs/legal/` (D-064; `docs/12`, CL-16) e as páginas do site, em `site/`, com as URLs `privacidade`, `termos` e `excluir-conta` do projeto `clarevo-site` (ou do domínio, P-006). Nada disso é publicado nem informado às lojas antes da revisão do advogado e de `node scripts/gerar-site.js --final` passar. A política é obrigatória nas duas lojas e precisa ter também um acesso dentro do app (Apple, App Review Guidelines 5.1.1(i)): o app já traz, em Conta, a seção "Privacidade e termos" e, no cadastro, os links para os Termos de uso e a Política de privacidade, mas só quando `EXPO_PUBLIC_SITE_URL` aponta para o site publicado (`docs/07` e `docs/16`); sem a variável, os links não aparecem. Os rascunhos das duas lojas devem continuar iguais ao que a política disser: se o advogado mudar o que é guardado ou compartilhado, atualize este arquivo.
