# Clarevo · Publicação nas lojas (Apple e Google)

19/10/2026, Ciclo R (D-060 item 1, `docs/00`). Passo a passo para Enzo publicar o app no iPhone e no Android, o que já está pronto no repositório, o que falta e as decisões que só ele toma. Tudo o que não depende de conta de desenvolvedor, de cobrança nem de segredo foi feito neste ciclo. **Nada aqui foi publicado nem enviado a loja alguma**, e nenhuma chave, senha ou identificador de conta foi escrito no repositório: onde a loja pede um identificador, o campo está vazio para Enzo.

**Como ler as fontes.** Valores e regras das lojas só entram com fonte oficial e data de consulta. O que não pôde ser lido na fonte (a rede desta sessão não abriu `support.google.com`, `docs.expo.dev` nem `play.google.com`) aparece como "conferir na página oficial". Fontes lidas em 19/10/2026: páginas de ajuda do App Store Connect e do programa de desenvolvedores em `developer.apple.com` (inscrição, especificações de captura, propriedades da ficha, classificação etária, privacidade, TestFlight, criação do app, exportação de criptografia, App Review Guidelines); `developer.android.com` (ícone do Google Play e categorias de "Segurança dos dados"); a documentação do Expo no GitHub (`raw.githubusercontent.com/expo/expo`, páginas de envio ao Google Play, versões do app e variáveis de ambiente); os tipos e o esquema instalados (`@expo/config-types` 57.0.2 e `@expo/eas-json` 25.2.0).

## 1. Resumo

| | Estado |
|---|---|
| Configuração de build (`apps/app/eas.json`, `apps/app/app.json`) | Pronta e validada (seção 8), sem nenhum identificador de conta. Nunca rodou um build de verdade: o primeiro é do Enzo |
| Ícones e abertura | Prontos, gerados por `scripts/gerar-icones.js` a partir de `docs/marca/` (seção 6) |
| Capturas das lojas | Prontas, 8 telas em 3 tamanhos, geradas por `scripts/capturas-lojas.js` com a demonstração (seção 7) |
| Ficha (pt-BR) | Pronta, com limites conferidos: `docs/lojas/ficha.md`. Campos de contato, URLs e direitos autorais: vazios para Enzo |
| Privacidade nas lojas | Roteiro pronto, derivado do código e do banco: `docs/lojas/privacidade.md`. Depende do advogado e da decisão sobre o Sentry |
| Política de privacidade, termos de uso, página de exclusão | **Não existem.** Obrigatórios nas duas lojas (seção 9) |
| Contas Apple, Google e Expo | **Não existem.** Dependem de CNPJ, domínio e da pessoa responsável (P-006) |
| Conta de teste para a revisão | A criar (seção 5) |

## 2. Decisões que ficam com Enzo

Nenhuma destas foi tomada pelo Claude. A coluna "Proposta" é só o que está no repositório hoje ou o que o Claude recomenda.

| # | Decisão | Proposta | O que está em jogo |
|---|---|---|---|
| 1 | **Identificador do app** (`ios.bundleIdentifier` e `android.package`) | `app.clarevo`, o que já está em `app.json`, igual nas duas lojas. Alternativas: `com.clarevo.app` ou `br.com.clarevo` | **Não muda depois de publicado.** A Apple diz que não dá para trocar o Bundle ID depois de enviar um build (`.../reference/app-information/app-information`); no Google, conferir na página oficial. O costume é o domínio ao contrário (P-006): escolher conforme o domínio que o Clarevo tiver. Trocar antes do primeiro build é só editar `app.json` |
| 2 | **Nome do desenvolvedor exibido** | Nome legal da empresa | Na Apple, quem se inscreve como organização pode usar um nome fantasia registrado, mas **só ao criar o primeiro app, e não dá para editar depois** (`.../create-an-app-record/set-your-developer-name`). No Google, é o nome público da conta: conferir |
| 3 | **E-mail de suporte e URL de suporte** | E-mail dedicado no domínio do Clarevo (P-023), sem formulário no app | A Apple exige uma URL de suporte que leve a contato real (endereço legal, e-mail ou telefone) |
| 4 | **URL da política de privacidade** (e dos termos de uso) | Páginas públicas no domínio, escritas com o advogado | Obrigatória nas duas lojas; a Apple também exige um acesso dentro do app (5.1.1(i)) |
| 5 | **Pessoa responsável pelas contas** (titular da conta Apple, "Account Holder") | Quem tem poder de assinar pela empresa | A Apple exige que a pessoa que inscreve a organização tenha autoridade legal para vinculá-la (dona ou fundador, diretoria, líder sênior ou quem recebeu autoridade por escrito): `developer.apple.com/programs/enroll/` |
| 6 | Nome do app nas lojas | "Clarevo" (alternativa: "Clarevo: finanças pessoais") | O nome só vale para um app por localização na Apple; se estiver em uso, a Apple oferece alternativas (`.../add-a-new-app`) |
| 7 | Classificação etária (P-002) | 4+ pelo questionário; 18+ por substituição se os termos exigirem | Se o contrato de uso tem idade mínima acima da calculada, a Apple exige substituir (`.../manage-app-information/set-an-app-age-rating`) |
| 8 | Declaração de exportação de criptografia (`ITSAppUsesNonExemptEncryption`) | **Não foi escrita em `app.json`.** O app usa HTTPS e resumo SHA-256 | A Apple avisa que quem declara isenção responde por erro de interpretação (`.../manage-app-information/overview-of-export-compliance`). Sem a chave, o App Store Connect pergunta a cada build; depois de decidir, a chave `ios.config.usesNonExemptEncryption` em `app.json` evita a pergunta |
| 9 | Backup automático do Android (`android.allowBackup`) | **Não foi mexido** (padrão do Android, ligado) | Com ele ligado, o Android copia os dados do app para o Google Drive da pessoa. Para um app financeiro, a recomendação é `"allowBackup": false` em `app.json`; é uma linha, mas muda o que a pessoa recebe ao trocar de celular |
| 10 | Os 4 últimos dígitos do cartão e o "histórico de compras" nas respostas de privacidade | Declarar por prudência (ou tirar o campo) | `docs/lojas/privacidade.md`, seções 2 e 3 |
| 11 | Sentry (relatório de falhas) antes do lançamento? | Instalar antes, com `sendDefaultPii` desligado | Muda as respostas de diagnóstico nas duas lojas e a política |
| 12 | Preço | Gratuito no lançamento (cobrança está fora do ciclo atual, P-005) | Com cobrança ou compra dentro do app, entram acordos e formulários que não estão aqui; conferir na página oficial |
| 13 | Países e regiões | Brasil | |

## 3. O que já está no repositório

| Arquivo | O que é |
|---|---|
| `apps/app/eas.json` | Perfis `development`, `preview` e `production`; submissão `production` |
| `apps/app/app.json` | Nome, versão 1.0.0, identificadores, `buildNumber` 1, `versionCode` 1, orientação retrato, fundo `#2457F5`, `scheme` `clarevo`, textos de permissão, permissões bloqueadas do Android |
| `apps/app/assets/images/` | `icon.png`, `android-icon-*.png` e `splash-icon.png` (gerados); `favicon.png` e `notification-icon.png` (mantidos) |
| `apps/app/assets/loja/icone-play-512.png` | Ícone da página do app no Google Play |
| `scripts/gerar-icones.js` | Gera os PNG a partir de `docs/marca/` (`--verificar` confere sem gravar) |
| `scripts/capturas-lojas.js` | Gera as capturas a partir da demonstração |
| `docs/lojas/capturas/` | 24 capturas (8 telas em 3 tamanhos) |
| `docs/lojas/ficha.md` | Ficha em pt-BR com limites conferidos |
| `docs/lojas/privacidade.md` | Respostas de privacidade da Apple e do Google |
| `packages/core/test/lojas.test.ts` | Teste dos limites e termos da ficha e da configuração (`npm test`) |

## 4. Passo a passo

A ordem importa: o caminho mais longo é o das contas (CNPJ, domínio, verificação de empresa), então as fases 0 a 2 começam juntas.

### Fase 0. Antes de abrir contas (P-006)

1. **CNPJ ativo** e **pessoa responsável** (decisão 5). A Apple não aceita nome fantasia nem filial como entidade: "We do not accept DBAs, fictitious business names, trade names, or branches"; o nome da organização aparece como vendedora do app (`developer.apple.com/programs/enroll/`).
2. **Número D-U-N-S** da empresa: obrigatório na Apple para organizações (exceto órgãos do governo); quem não tem pede à Dun & Bradstreet pelo caminho que a Apple indica na mesma página. No Google, conferir na página oficial se a conta de organização pede o mesmo.
3. **Domínio, site público e e-mail no domínio.** A Apple exige que o e-mail de trabalho use o domínio da organização e que o site seja público e funcional, "links para redes sociais ou páginas de registrador de domínio não são aceitos". O domínio também resolve P-008 (e-mail de confirmação), P-023 (canal de pedidos de titular) e o link de convite direto no app (links universais).
4. **Advogado:** política de privacidade, termos de uso, D-058 (prazos de guarda e exclusão), M-5 (papel da empresa) e a página de exclusão. Sem isso, as duas lojas barram o envio (seção 9).
5. **Supabase de produção em dia:** migrações até a 0015 coladas e conferidas (`docs/05`, passo 12e e consulta 21c), e os endereços de retorno do Supabase com `clarevo://**` (já em `docs/07`). Sem a 0015, a tela "Excluir minha conta" abre, mas a exclusão falha.

### Fase 1. Expo e EAS

1. Criar a conta em `expo.dev` (gratuita para começar; limites de build do plano gratuito: conferir na página oficial de preços).
2. Em `apps/app`: `npx eas-cli@latest login` e `npx eas-cli@latest init`. O `init` grava `extra.eas.projectId` em `app.json`: é o primeiro identificador de conta no repositório, não é segredo, e só Enzo o gera.
3. Variáveis de ambiente do app, criadas no EAS (nunca no repositório). O app lê `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_KEY` (a chave pública, `docs/07`). Cada perfil de `eas.json` aponta um ambiente do EAS: `development`, `preview` (use o projeto `clarevo-teste`) e `production` (`clarevo-producao`). Exemplo, com a visibilidade `plaintext` (as variáveis `EXPO_PUBLIC_*` vão dentro do app e **não podem** ser "secret", segundo a documentação do Expo):
   `npx eas-cli@latest env:set --name EXPO_PUBLIC_SUPABASE_URL --environment production --visibility plaintext` (o comando pede o valor).
   Sem as duas variáveis, o build de produção abre "Configuração incompleta" (`apps/app/src/state/session.tsx`), de propósito: nunca vira demonstração em silêncio.
4. Primeiro build de teste, para pessoas de confiança: `npx eas-cli@latest build --platform android --profile preview` (gera o APK, instalável por link). No iOS, o perfil `preview` gera um build de loja, que vai ao TestFlight.
5. **Versões:** `cli.appVersionSource` é `remote` e o perfil `production` soma o número de build sozinho (`autoIncrement`), que é o comportamento recomendado pelo Expo para evitar "versão duplicada" na loja. Na primeira vez, o EAS pergunta se começa a partir dos valores de `app.json` (1 e 1). A versão que a pessoa vê (`version`, 1.0.0) só Enzo muda, a cada lançamento.

### Fase 2. Conta Apple e iPhone

1. **Inscrever-se** no Apple Developer Program como **organização** (`developer.apple.com/programs/enroll/`): conta Apple com autenticação em dois fatores, nome legal, D-U-N-S, site e e-mail da empresa. **US$ 99 por ano** (a Apple mostra o valor em moeda local na inscrição; há isenção para organizações sem fins lucrativos, instituições de ensino e governo). Prazo de aprovação: conferir na página oficial, não há valor lido.
2. No App Store Connect, **o titular da conta (Account Holder) aceita o último acordo em "Business"**: sem isso não se cria app (`.../add-a-new-app`).
3. **Novo app:** plataforma iOS, nome (decisão 6), idioma principal **Português (Brasil)**, Bundle ID (o de `app.json`; o EAS o registra no primeiro build, ou se registra antes no portal de certificados), **SKU** (código interno qualquer, sem espaços, que não muda depois) e, se for empresa, o nome do desenvolvedor (decisão 2: só aqui). Acesso: "Acesso total".
4. **Build de loja:** `npx eas-cli@latest build --platform ios --profile production`. O EAS pede o login Apple e cuida de certificados e perfis (não ficam no repositório; `*.p12`, `*.p8`, `*.key`, `*.jks` e `*.mobileprovision` estão no `.gitignore` do app).
5. **Envio ao TestFlight:** `npx eas-cli@latest submit --platform ios`. O build aparece no TestFlight depois do processamento.
6. **TestFlight antes de publicar** (`.../test-a-beta-version/testflight-overview`): testadores internos são até 100 pessoas com acesso ao App Store Connect; externos, até 10 mil por convite ou link. **O primeiro build de um grupo externo passa por análise da Apple** (revisão para testes), e cada build fica disponível para teste por 90 dias. Faça primeiro o teste interno e percorra os itens "Teste em aparelho" de `docs/04`.
7. **Ficha:** colar os textos de `docs/lojas/ficha.md` (nome, subtítulo, promocional, descrição, palavras-chave), as URLs (decisões 3 e 4), a categoria Finanças, a classificação (seção 9 da ficha), os **direitos autorais** e as **capturas** (seção 7 deste documento).
8. **Privacidade do app:** responder conforme `docs/lojas/privacidade.md`, seção 2, depois de o advogado conferir. A URL da política é obrigatória.
9. **Exportação de criptografia:** responder o questionário do App Store Connect (decisão 8).
10. **Informações para a revisão:** conta de teste e notas (seção 5 deste documento e `docs/lojas/ficha.md`, seção 10).
11. **Enviar para análise.** A Apple informa que revisa, em geral, pelo menos 50% dos envios em menos de 24 horas e 90% em menos de 48 horas (`developer.apple.com/distribute/app-review/`). Escolher o modo de liberação: manual, automática, ou automática a partir de uma data.

**Regras da Apple que o app já cumpre** (App Review Guidelines, lidas em 19/10/2026): quem permite criar conta precisa permitir **excluí-la dentro do app** (5.1.1(v); feito em D-058); apps que pedem login precisam dar conta de demonstração funcional ou modo de demonstração (2.1); o "Entrar com Apple" só é exigido quando o app usa login de terceiros (4.8), e o Clarevo entra só com e-mail e senha; apps de áreas muito reguladas, como serviços financeiros, devem ser enviados por uma entidade jurídica, não por pessoa física (5.1.1(ix)), o que reforça a inscrição como organização.

### Fase 3. Conta Google e Android

Tudo desta fase é **a conferir na página oficial do Play Console**, porque a rede desta sessão não abriu a ajuda do Google. O que está escrito vem do `docs/04` (taxa única de US$ 25) e da documentação do Expo.

1. Criar a conta de desenvolvedor do Google Play (`play.google.com/console`), de preferência como organização. Conferir: taxa, verificação de identidade e de empresa, **exigências de teste fechado antes da produção para contas novas** e o prazo.
2. **Criar o app** no Play Console: nome (decisão 6), idioma padrão Português (Brasil), aplicativo (não jogo), gratuito.
3. **Chave de serviço do Google** para o EAS enviar por você (guia do Expo: `expo.fyi/creating-google-service-account`). O arquivo JSON da chave **é segredo**: o EAS o guarda na conta Expo (`eas credentials`), e ele nunca vai ao repositório (o `.gitignore` do app ignora `*service-account*.json` por garantia).
4. **Build de loja:** `npx eas-cli@latest build --platform android --profile production` gera o **AAB**. O Google Play exige pacote AAB para app novo, e o APK do perfil `preview` não pode ser enviado à loja (documentação do Expo, página de envio ao Google Play).
5. **Primeiro envio:** `npx eas-cli@latest submit --platform android` cria a primeira versão na **faixa de teste interno**; o perfil `submit.production` de `eas.json` usa `track: internal` e `releaseStatus: draft`, e o app fica em rascunho no Play Console até a ficha e as declarações estarem completas.
6. **Teste interno antes de publicar:** criar a lista de testadores (e-mails) e testar o app instalado pela loja, nos mesmos itens de aparelho do TestFlight.
7. **Conteúdo do app** (todas as declarações são obrigatórias para sair do rascunho; conferir a lista atual no Play Console): política de privacidade (URL), acesso ao app (conta de teste: seção 5), anúncios (não há), classificação etária (`docs/lojas/ficha.md`, seção 9), público-alvo (adultos), **Segurança dos dados** (`docs/lojas/privacidade.md`, seção 3), recursos financeiros (declaração que o Play Console traz para apps de finanças: conferir as opções e responder conforme o app: ele não é banco, não concede crédito e não movimenta dinheiro), e as demais (governo, saúde, notícias: não se aplicam).
8. **Página do app:** ícone `apps/app/assets/loja/icone-play-512.png` (512 x 512, PNG de 32 bits, sRGB, até 1024 KB, formato dado em `developer.android.com/distribute/google-play/resources/icon-design-specifications`), **gráfico de recursos de 1024 x 500** (falta; seção 9), capturas (seção 7), descrições curta e completa e categoria Finanças.
9. Promover da faixa interna para teste fechado ou produção conforme as regras da conta.

### Fase 4. Antes do envio de produção

1. `npm test`, `npm run typecheck` e `npm run test:web` verdes na `main`.
2. Teste em aparelho dos itens abertos de `docs/04`: câmera da nota, biometria, lembretes, exportar e compartilhar, importar arquivo, letra grande e leitor de tela, e-mail de confirmação abrindo o app (`clarevo://`).
3. **Teste de usabilidade** com 5 pessoas (`docs/15`, D-054 item 8), planejado para antes das lojas.
4. Conferir o checklist "Conferir no primeiro build" (seção 10).

## 5. Conta de teste para a revisão (Apple e Google)

A Apple pede, quando o app exige login, uma **conta de demonstração ativa que não expire** (ou um modo de demonstração totalmente funcional), mais o que for preciso para testar (`.../reference/app-information/platform-version-information`, "App Review information"; App Review Guidelines 2.1). O Google pede o mesmo no formulário "Acesso ao app". No Clarevo de produção **não existe o botão "Ver demonstração com dados fictícios"** (a demonstração só vale no build `export:demo`, e conta nova nunca recebe dados de exemplo, CLAUDE.md), então a conta de teste é uma conta comum com dados fictícios que Enzo anota:

1. No Supabase de **produção**, criar a conta por Authentication › Users › "Add user" com "Auto Confirm User" (ou pelo app, com um e-mail da empresa que Enzo controle, por exemplo uma caixa do domínio). **Nunca** usar o e-mail de uma pessoa real.
2. Senha forte, guardada no gerenciador de senhas de Enzo e **escrita só nos campos de acesso do App Store Connect e do Play Console**, nunca no repositório, em documento, em chat nem em commit.
3. Entrar pelo app, criar a primeira conta e anotar dados **fictícios e identificados**, no padrão da demonstração (`packages/core/src/demo.ts`): por exemplo "Salário (exemplo)" de R$ 6.000,00 recebido, "Aluguel (exemplo)" de R$ 2.500,00 e "Mercado (exemplo)" de R$ 1.400,00 pagos, duas contas a pagar ("Internet (exemplo)", "Condomínio (exemplo)"), um gasto fixo, um cartão "Cartão Exemplo" com uma compra parcelada, uma meta "Viagem (exemplo)" e a renda de referência. Assim todas as telas mostram algo.
4. Conferir a conta no build do TestFlight e do teste interno do Google antes de enviar.
5. **Não excluir esta conta** pelo app durante a revisão (a exclusão é definitiva, D-058). Manter a conta ativa enquanto durar a revisão e trocar a senha depois da aprovação.
6. Se a revisão pedir Família ou empresa, explicar nas notas: a Família funciona com duas contas de teste; o painel das empresas existe só na web e não é parte do app das lojas.

## 6. Ícones e abertura

`node scripts/gerar-icones.js` desenha cada SVG de `docs/marca/` no Chromium do Playwright e grava PNG sem compressão com perdas (nada é redesenhado, `docs/marca/LEIAME.md`). `--verificar` confere, sem gravar, se os PNG gravados são os que os SVG produzem.

| Arquivo | Origem | Tamanho e formato | Uso |
|---|---|---|---|
| `apps/app/assets/images/icon.png` | `icone-app.svg` | 1024 x 1024, PNG RGB **sem canal alfa** | Ícone do iOS e da App Store (`ios.icon` e `icon`). O Expo gera os outros tamanhos; a Apple pede 1024 sem transparência |
| `android-icon-foreground.png` | `icone-android-frente.svg` | 1024 x 1024, RGBA | Frente do ícone adaptativo; o símbolo C fica dentro da zona segura central |
| `android-icon-background.png` | cor do `icone-app.svg` (`#2457F5`) | 1024 x 1024, RGB | Fundo do ícone adaptativo |
| `android-icon-monochrome.png` | `icone-android-uma-cor.svg` | 1024 x 1024, RGBA | Ícone temático do Android 13 em diante (o SDK 57 suporta `monochromeImage`) |
| `splash-icon.png` | `icone-splash.svg` | 1024 x 1024, RGBA | Abertura, sobre o fundo azul do `expo-splash-screen` (largura 140) |
| `apps/app/assets/loja/icone-play-512.png` | `icone-app.svg` | 512 x 512, PNG de 32 bits (RGBA) | Ícone da página do app no Google Play (fonte: `developer.android.com`, acima) |

O ícone da notificação (`notification-icon.png`) e o favicon continuam como estavam. O prebuild de teste (feito fora do repositório em 19/10/2026) confirmou o ícone adaptativo com fundo, frente e monocromático, e o fundo azul da abertura e da janela.

## 7. Capturas das lojas

`node scripts/capturas-lojas.js` gera o build de demonstração (`export:demo`, que ignora o Supabase), sobe um servidor local e percorre, com o Playwright, oito telas por tamanho: **Resumo, Anotar gasto (preenchido, sem salvar), Contas a pagar, Cartões, Evolução, Análises em bolhas, Metas e Aprender**. Os dados são os fictícios da demonstração (07/10/2026), e cada tela mostra a etiqueta "Demonstração". O script bloqueia qualquer requisição para fora de `localhost` e falha se alguma tentar sair; confere o tamanho exato e a ausência de canal alfa de cada PNG. `--sem-build` reaproveita o `apps/app/dist` de um build de demonstração; `--saida` e `--tamanho` escolhem a pasta e o tamanho. Porta: `E2E_PORT` (padrão 8098).

| Pasta em `docs/lojas/capturas/` | Pixels | Loja e uso | Fonte e situação |
|---|---|---|---|
| `apple-iphone-6-3pol-1206x2622` | 1206 x 2622 (402 x 874 pontos a 3x) | Apple, iPhone com Dynamic Island, tela média (iPhone 17 Pro, 16 Pro, 15 Pro, entre outros). **É o tamanho que a Apple exige**: "pelo menos uma captura para iPhone com Dynamic Island (tela média)" | `developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications`, lida em 19/10/2026. A página aceita também 1179 x 2556 nesta classe |
| `apple-iphone-6-9pol-1320x2868` | 1320 x 2868 (440 x 956 pontos a 3x) | Apple, iPhone com Dynamic Island, tela grande (iPhone 17 Pro Max, Air, 16 Pro Max). Opcional: sem ele, a Apple escala as capturas do tamanho exigido | Mesma página |
| `google-play-celular-1080x1920` | 1080 x 1920 (450 x 800 pontos a 2,4x), proporção 9:16 | Google Play, celular | **A conferir**: a página oficial do Play Console não abriu nesta rede. O tamanho é o mais comum para celular (proporção 9:16, lados entre 320 e 3840 pixels, de 2 a 8 capturas, PNG sem alfa ou JPEG, segundo a ajuda do Google como costuma ser publicada) |

**Regras da Apple que o script segue** (mesma página): de 1 a 10 capturas por tamanho, em `.jpeg`, `.jpg` ou `.png`, "sem canal alfa nem transparência". Se a interface é igual em vários tamanhos, basta o tamanho exigido, e o App Store Connect escala para os menores. O app não é para iPad (`ios.supportsTablet` falso), então **não há capturas de iPad** (a Apple só exige 13 polegadas "se o app roda no iPadOS").

**Ordem e uso sugerido na loja:** 01 Resumo, 02 Anotar gasto, 03 Contas a pagar, 04 Cartões, 05 Evolução, 06 Análises em bolhas, 07 Metas, 08 Aprender. A Evolução usa o cenário fictício "evolucao" da demonstração com a janela de 12 meses (para o gráfico mostrar meses de comparação); as outras usam a demonstração padrão. As capturas não foram retocadas.

## 8. Configuração de build e permissões

**`apps/app/eas.json`** (validado em 19/10/2026 com o esquema oficial `@expo/eas-json` 25.2.0, que resolveu os seis perfis por plataforma sem erro):

| Perfil | Distribuição | Android | iOS | Ambiente EAS |
|---|---|---|---|---|
| `development` | interna, cliente de desenvolvimento | APK | build para aparelho (precisa de aparelho cadastrado na Apple; para o simulador, criar um perfil à parte, como o Expo sugere) | `development` |
| `preview` | interna | APK (instalável por link) | **loja** (vai ao TestFlight, sem cadastrar aparelhos) | `preview` |
| `production` | loja | **AAB** | loja | `production` |

`cli.version` exige `>= 25.2.0` (a versão com que o arquivo foi validado) e `appVersionSource` é `remote`. A submissão `production` usa `track: internal` e `releaseStatus: draft` no Android e `language: pt-BR` no iOS. Não há `appleId`, `ascAppId`, `appleTeamId`, chave de serviço nem senha de keystore.

**`apps/app/app.json`**, em relação ao que já existia: `backgroundColor` `#2457F5`, `ios.buildNumber` `"1"`, `ios.supportsTablet` `false`, `android.versionCode` `1` e `android.blockedPermissions`. O resto (nome "Clarevo", versão 1.0.0, retrato, `scheme` `clarevo`, os dois identificadores `app.clarevo`, ícones, abertura e os textos de permissão) já estava e foi conferido. `npx expo config --type public` rodou sem erro; um `expo prebuild` de teste em cópia fora do repositório gerou o `Info.plist` e o `AndroidManifest.xml` descritos abaixo.

**Permissões que o app usa de fato** (conferidas no código):

| Permissão ou capacidade | Onde o app usa | Como está declarada |
|---|---|---|
| Câmera | `components/receipt-scan.tsx`: lê o QR Code e o código de barras da nota fiscal; nenhuma foto é guardada. O comprovante de Pix e a nota em PDF vêm do seletor de arquivos, não da câmera | iOS `NSCameraUsageDescription`: "O Clarevo usa a câmera só para ler o código da nota fiscal. Nenhuma foto é guardada." Android `CAMERA`. Microfone removido (`microphonePermission` e `recordAudioAndroid` falsos) |
| Biometria | `lib/device.ts`: bloqueio opcional ao abrir (Conta) | iOS `NSFaceIDUsageDescription`: "O Clarevo usa o Face ID só para desbloquear o app, quando você liga essa opção em Conta." Android `USE_BIOMETRIC` e `USE_FINGERPRINT` (a segunda é a que o Android 7 e o 8 usam; o app aceita a partir do Android 7) |
| Notificações de lembrete | `lib/device.ts`: avisos locais de contas a pagar, ligados pela pessoa | iOS pede a permissão na hora, sem texto no `Info.plist`. Android `POST_NOTIFICATIONS` e `RECEIVE_BOOT_COMPLETED` (vêm da biblioteca; o segundo reagenda os avisos depois de reiniciar) |
| Vibração | `expo-haptics`, em 28 arquivos de telas e formulários | Android `VIBRATE` |
| Internet | Supabase | Android `INTERNET` |
| Compartilhar a exportação, escolher arquivo | `lib/export-share.ts` (`expo-sharing`, `expo-print`, cache do app) e `expo-document-picker` | Nenhuma permissão: usam a folha de compartilhamento e o seletor do sistema |
| Fotos | Não usa | **Não declarada** (`NSPhotoLibraryUsageDescription` não existe) |

**Removidas do Android com `blockedPermissions`:** `READ_EXTERNAL_STORAGE` e `WRITE_EXTERNAL_STORAGE` (vêm do `expo-file-system` e do modelo do projeto, só até o Android 12L, e o app não acessa o armazenamento) e `SYSTEM_ALERT_WINDOW` (vem do modelo do projeto, só serve ao desenvolvimento). Pelo código das bibliotecas, o Android final deve ter exatamente: `CAMERA`, `INTERNET`, `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, `USE_BIOMETRIC`, `USE_FINGERPRINT` e `VIBRATE`.

## 9. O que falta

1. Contas Apple, Google e Expo (P-006) e a pessoa responsável (decisão 5).
2. **Política de privacidade e termos de uso**, escritos com o advogado (`docs/12`, CL-16), publicados em URL pública; o **acesso dentro do app** (por exemplo, em Conta) entra no código quando a URL existir. Hoje o app só tem "Quem vê estes dados?".
3. **Página pública de exclusão da conta e dos dados**, exigida pelo Google na "Segurança dos dados" (a exclusão pelo app já existe).
4. Domínio, site, e-mail de suporte e de recuperação (P-006, P-008, P-023).
5. **Gráfico de recursos do Google Play (1024 x 500)**: não foi desenhado (seria um desenho novo; usar o logotipo oficial de `docs/marca/`). Conferir o formato na página oficial.
6. Migração 0015 colada e conferida no Supabase de produção (`docs/05`).
7. Decisões 1 a 13 da seção 2.
8. Conta de teste da revisão (seção 5).
9. Teste em aparelho e teste de usabilidade (seção 4, fase 4).
10. Primeiro build de verdade no EAS (a configuração só foi validada por esquema e por `expo prebuild` local) e a conferência abaixo.
11. Fora desta fase, porque dependem do build das lojas e do domínio: abrir o link do convite direto no app (links universais), "Compartilhar com o Clarevo" a partir de outros apps e o widget nativo (`docs/04`).

## 10. Conferir no primeiro build

- **Manifesto de privacidade do iOS.** O projeto gerado não traz um `PrivacyInfo.xcprivacy` próprio; as bibliotecas do Expo trazem os delas. Se a Apple mandar e-mail por falta de declaração de motivo de uso de API, acrescentar `ios.privacyManifests` em `app.json`.
- **Permissões do Android.** Abrir o AAB ou o APK e listar as permissões (por exemplo, `aapt dump permissions`): devem ser as sete da seção 8.
- **`aps-environment` no iOS.** O plugin de notificações liga a capacidade de notificação remota, embora o app só agende lembretes locais. Conferir se o App Store Connect não faz pergunta sobre isso e, na primeira revisão, se a Apple aceita.
- **Idioma do binário.** O `Info.plist` não tem localização em português; os textos do app e das permissões estão em português. Ver como a loja mostra o idioma no TestFlight.
- **Lembretes no Android 12 em diante.** O app não pede permissão de alarme exato; o lembrete pode atrasar alguns minutos.
- **Câmera como requisito no Android.** Declarar a permissão de câmera faz o Google Play tratá-la como requisito do aparelho; celulares sem câmera deixam de ver o app. O app já funciona sem câmera (a opção some), então é uma escolha de alcance, não de funcionamento.
- Ícone adaptativo e temático, abertura azul, e-mail de confirmação abrindo o app por `clarevo://` e as telas com letra grande, em aparelho de verdade.

## 11. Fontes

- Apple, App Store Connect, referência: `developer.apple.com/help/app-store-connect/reference/app-information/` `screenshot-specifications`, `app-information`, `platform-version-information`, `age-ratings-values-and-definitions`, `app-privacy`; `.../manage-app-information/` `set-an-app-age-rating`, `overview-of-export-compliance`; `.../create-an-app-record/` `add-a-new-app`, `set-your-developer-name`; `.../test-a-beta-version/testflight-overview`.
- Apple: `developer.apple.com/programs/enroll/`, `developer.apple.com/app-store/app-privacy-details/`, `developer.apple.com/app-store/review/guidelines/`, `developer.apple.com/distribute/app-review/`.
- Google: `developer.android.com/distribute/google-play/resources/icon-design-specifications`, `developer.android.com/privacy-and-security/declare-data-use`. Páginas do Play Console (`support.google.com`, `play.google.com/console`): **não abertas**, tudo que depende delas está marcado "a conferir".
- Expo: documentação no GitHub (`expo/expo`, `docs/pages/submit/android.mdx`, `build-reference/app-versions.mdx`, `eas/environment-variables/`), tipos de configuração do SDK 57 (`@expo/config-types`) e esquema do `eas.json` (`@expo/eas-json`).
