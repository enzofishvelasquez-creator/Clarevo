# Primeiro build das lojas: lista

05/11/2026. O que precisa estar pronto antes do primeiro build do app (Android para teste pelo link do Expo e iPhone pelo TestFlight), o que a equipe já conferiu sem as contas e o que conferir no aparelho. O passo a passo completo continua em `docs/16_PUBLICACAO_LOJAS.md`; a ordem e o teste no celular, em `docs/37_LANCAMENTO.md` (seções 5 e 6).

Regra de sempre: contas, senhas, códigos, chaves de assinatura, pagamentos e verificações são feitos só pelo Enzo, à mão. O Claude Chrome não cria conta em loja nenhuma nem no Expo. Nenhum identificador de conta vai ao repositório antes de o Enzo mandar (só o `owner` e o Project ID do Expo, que não são segredo).

## 1. O que a equipe conferiu em 05/11/2026, sem as contas

| Conferência | Resultado |
|---|---|
| O app monta para Android e iPhone (`expo export --platform android --platform ios`, o mesmo empacotamento do JavaScript que o build faz) | Sem erro nem aviso: 12 MB no Android e 11 MB no iPhone, já em Hermes |
| Projetos nativos gerados numa cópia descartável (`expo prebuild --clean`, apagada depois) | Sem erro nem aviso. Android: backup desligado, esquema `clarevo://`, leitura de texto do ML Kit marcada para baixar na instalação. iPhone: textos de permissão em português e criptografia isenta. Mínimos: iOS 16.4 (o leitor de texto pede 15.1) e Android 7 (API 24). O `prebuild` não junta os manifestos das bibliotecas (isso só acontece no build, com o Gradle, que não roda aqui): ver a próxima linha |
| **Build do Android pararia na junção dos manifestos (corrigido, achado na revisão)** | A marca dos modelos do ML Kit (`com.google.mlkit.vision.DEPENDENCIES`) era `ocr` no app e `barcode_ui` no `expo-camera`: dois valores diferentes param o build com "Manifest merger failed". Agora o app declara `barcode_ui,ocr` e substitui a da biblioteca (`tools:replace`, `apps/app/plugins/leitura-imagem.js`). Confirmar no registro do primeiro build |
| **Câmera bloqueada no app do celular (corrigido)** | Desde a foto das metas (31/10), `cameraPermission: false` no plugin do seletor de fotos **bloqueava a câmera no Android e apagava o texto da câmera no iPhone**: o leitor da nota, o do boleto e a foto de documento não funcionariam, e no iPhone o app fecharia ao abrir a câmera. Agora o plugin usa o mesmo texto da câmera. A web não era afetada |
| **Idioma do iPhone (corrigido)** | O app não declarava o português: as telas do sistema dentro do app (escolher foto, compartilhar) podiam sair em inglês. Agora `app.json` declara `pt-BR` como único idioma. O idioma que a App Store lista vem das localizações do pacote: conferir no TestFlight |
| **Assinatura no celular sem citar pagamento fora da loja (corrigido)** | A Apple e o Google recusam app que aponte para outro jeito de pagar. No celular, a tela Assinatura diz só "No celular, a assinatura é feita pela loja de aplicativos do aparelho"; na web, a tela continua citando o cartão e o Pix. O passo do guia e a situação "Plano" ficaram neutros em todas as plataformas (e, com eles, a Ajuda do site e o manual). As capturas das lojas saem da web: `scripts/capturas-lojas.js` agora recusa tela que cite pagamento na web |
| **Foto tirada para leitura apagada do aparelho (corrigido)** | A foto de "Tirar uma foto" e a cópia do seletor ficavam no cache do app até o sistema limpar. Agora são apagadas logo depois da leitura (`apps/app/src/lib/image-pick.ts`), como já acontecia com os PDFs |
| Respostas de privacidade das lojas (`docs/lojas/privacidade.md`) | Atualizadas: a foto da meta passa a ser declarada (fica guardada na Clarevo), o Telegram e o WhatsApp (só resumos, nunca o texto), a leitura de texto em imagem (no aparelho; no Android, SDK do Google declarado por precaução) e a assinatura |
| Teste automático novo (`packages/core/test/lojas.test.ts`) | A cada `npm test`, roda os plugins como o build roda e confere a câmera liberada nas duas plataformas, o microfone bloqueado, as permissões do Android, o backup desligado, o idioma e a marca do ML Kit com todo modelo do `expo-camera` (falha com a configuração antiga, conferido) |
| Conferência do Expo (`expo-doctor`) | 18 de 21 itens. Os 3 que faltam (versões dos pacotes, esquema do `app.json` e o diretório de bibliotecas) precisam da internet do Expo, bloqueada nesta sessão: olhar os avisos no registro do primeiro build |

## 2. Antes do primeiro build Android (APK de teste)

| # | O quê | Quem | Estado |
|---|---|---|---|
| 0 | PR com estas correções juntado ao `main` (o build sai do `main`; sem o PR, a câmera continua bloqueada no build) | Claude Chrome cria o PR; Enzo faz o merge | Feito (PR #18, 06/11/2026) |
| 1 | Conta no expo.dev com o e-mail do domínio e um projeto `clarevo`; mandar à equipe o usuário (owner) e o Project ID | Enzo | Feito (06/11/2026: conta `clarevos-team`, projeto `clarevo`) |
| 2 | `owner` e `extra.eas.projectId` em `apps/app/app.json`, PR e merge (a imagem de build `latest` em `eas.json`, que o build pelo GitHub exige, já está no `main` desde 06/11) | Equipe | Feito no ramo em 06/11/2026 (`owner` `clarevos-team` e o Project ID); PR e merge |
| 3 | No projeto do expo.dev: ligar o GitHub ao repositório `enzofishvelasquez-creator/clarevo`, pasta base `apps/app` | Enzo | Repositório ligado em 06/11/2026 (app do Expo instalado só nele); a pasta base `apps/app` a confirmar em Settings |
| 4 | Variáveis `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_KEY` (a chave pública, a mesma da web) nos ambientes `preview` e `production`, visibilidade "plain text". Sem elas, o app abre "Configuração incompleta" de propósito | Enzo | Falta |
| 5 | Endereços de retorno do Supabase com `clarevo://**` (para o e-mail de confirmação abrir o app) | Enzo | Feito (lido no painel em 30/10/2026, `docs/05`) |
| 6 | "Build from GitHub": ramo `main`, Android, perfil `preview`; deixar o Expo gerar e guardar a chave de assinatura do Android (é a do app para sempre; nunca vai ao repositório) | Enzo | Depois do 4 |
| 7 | Instalar o APK pelo link e fazer o teste de `docs/37`, seção 6 (17 itens), mais a seção 4 desta lista | Enzo | Depois do 6 |

### 2a. Passo a passo no expo.dev (Enzo, à mão; 06/11/2026)

Nada aqui é segredo além da senha da conta, que fica no Bitwarden. O Claude Chrome não entra no expo.dev.

**Como ficou (06/11/2026):** o cadastro criou a conta `clarevos-team` (o Expo a mostra como organização, "clarevo's team") e o projeto `clarevo`, e o repositório pessoal `enzofishvelasquez-creator/Clarevo` foi ligado sem problema, apesar de a documentação do Expo ("Trigger builds from the Expo GitHub App", lida no mesmo dia) dizer que só repositório de organização do GitHub liga a organização do Expo. Os passos abaixo ficam como registro.

1. **Criar a conta:** `expo.dev/signup`, com o e-mail do domínio (`contato@clarevo.app.br`), senha nova no Bitwarden, confirmar o e-mail. Nome de usuário sugerido: `clarevo` (minúsculas; vira o `owner`). Se estiver tomado, outro curto, e avisar a equipe qual.
2. **Ligar o GitHub ao usuário:** `expo.dev/settings`, em "Connections", "GitHub", "Connect", autorizar com a conta `enzofishvelasquez-creator`. Sem isso, o passo 6 não mostra o repositório.
3. **Criar o projeto:** na página inicial, "Projects", "Create a Project". Nome `Clarevo`, slug exatamente `clarevo` (igual ao `slug` de `app.json`; com outro slug o build recusa).
4. **Mandar à equipe:** o `owner` (o nome da conta, que aparece no endereço `expo.dev/accounts/<owner>/projects/clarevo`) e o **Project ID** (na página do projeto, em "Overview", o "ID" de 36 caracteres com traços). Não são segredo.
5. **Equipe:** PR com `owner` e `extra.eas.projectId`; Enzo faz o merge ("Create a merge commit").
6. **Ligar o GitHub ao projeto:** `expo.dev/accounts/<owner>/projects/clarevo/github`. "Install the Expo GitHub App", escolhendo só o repositório `clarevo` ("Only select repositories"). De volta ao Expo, selecionar o repositório, e em "Base directory" escrever `apps/app`, salvar.
7. **Variáveis:** no projeto, "Environment variables", "Add variable", duas vezes: nome `EXPO_PUBLIC_SUPABASE_URL` com a "Project URL" do `clarevo-producao` (Supabase, Project Settings, Data API), e nome `EXPO_PUBLIC_SUPABASE_KEY` com a chave pública (`sb_publishable_...`, Project Settings, API Keys; **nunca** a `secret` nem a `service_role`). Nas duas: ambientes `preview` e `production` marcados, visibilidade "Plain text" (as `EXPO_PUBLIC_*` vão dentro do app; "Secret" faz o build falhar). A chave pública é a mesma que a web usa na Cloudflare.
8. **Build:** "Builds", "Build from GitHub": Git ref `main`, Platform `Android`, Build profile `preview`, "Build". Leva de 15 a 25 minutos; a página mostra o registro ao vivo. A chave de assinatura do Android é gerada e guardada pelo Expo sozinha (conferido no código do `eas-cli` 27.5.0: sem terminal, ele gera uma chave nova em vez de perguntar). A documentação do Expo lista "um build feito do computador" como pré-requisito do build pelo GitHub; se o build parar nas credenciais, mandar à equipe o link do build, que a saída é um build pelo computador do Enzo, com roteiro.
9. **Instalar:** com o build pronto, abrir a página do build no celular Android (ou ler o QR da página), "Install", permitir a instalação de origem desconhecida quando o Android pedir. Depois, o teste da seção 4 e o de `docs/37`, seção 6.

Se algo falhar, mandar à equipe o link da página do build (`expo.dev/accounts/<owner>/projects/clarevo/builds/...`): o registro não tem segredo, e as variáveis "Plain text" aparecem nele de propósito.

O endereço do site (`EXPO_PUBLIC_SITE_URL`) **não** entra neste primeiro build: só depois de o site final estar publicado com os textos revisados pelo advogado. Sem ele, os links "Termos de uso", "Política de privacidade" e "Privacidade e termos" não aparecem no app; o aviso de aceite dos termos aparece, sem os links.

## 3. iPhone (quando a Apple aprovar a conta)

| # | O quê | Quem |
|---|---|---|
| 1 | D-U-N-S e inscrição na Apple como organização, depois da resposta sobre a Inova Simples (`docs/37`, seção 1) | Enzo |
| 2 | No App Store Connect: aceitar o acordo em "Business" e criar o app (Clarevo, Português do Brasil, Bundle ID `app.clarevo`, um SKU qualquer; o nome do desenvolvedor só pode ser escolhido aqui) | Enzo, com roteiro |
| 3 | Credenciais do iPhone no Expo (certificado e perfil, ou uma chave da API do App Store Connect guardada no Expo) | Enzo, com o passo a passo que a equipe manda na hora |
| 4 | "Build from GitHub", iOS, perfil `preview`; depois, enviar o build ao TestFlight (o build sozinho não vai: é o envio do Expo, `eas submit`, ou o envio automático, com a chave do App Store Connect; `eas.json` só tem o envio de `production` configurado) e fazer o teste interno | Enzo, com roteiro |

## 4. Conferir no aparelho, no primeiro build

Além dos 17 itens de `docs/37`, seção 6:

- **Câmera** (o que foi corrigido): Anotar gasto, "Escanear nota fiscal"; Contas a pagar, "Ler boleto"; "Ler comprovante de Pix ou pagamento", "Tirar uma foto". Na primeira vez, o celular pede a permissão com o texto da Clarevo.
- **Foto da meta**: escolher uma foto da galeria; no iPhone, o seletor deve estar em português.
- **Leitura de texto no Android**: ler um print logo depois de instalar. O modelo do Google é baixado na instalação; se a primeira leitura falhar, tentar de novo com internet e anotar o que apareceu.
- **Aviso dos termos**: em conta antiga, aparece uma vez, depois do desbloqueio por biometria (se ligado), e some ao tocar em "Concordo e continuar".
- **Assinatura**: Conta, Assinatura mostra "Acesso completo", os planos e "No celular, a assinatura é feita pela loja de aplicativos do aparelho", sem botão de assinar.
- **Telegram**: Conta, "Anotar pelo Telegram", gerar o código e "Abrir o Telegram" abre o @ClarevoBot.
- Os itens de `docs/16`, seção 10: permissões do Android, manifesto de privacidade e notificação remota no iPhone, ícone adaptativo, abertura azul.

## 5. Antes de enviar para a revisão das lojas (não trava o primeiro build)

| # | O quê | Quem |
|---|---|---|
| 1 | **Compra da assinatura pelas lojas** (fase 2 da D-083): produto de R$ 29,90 e R$ 69,90 nas duas lojas, botão de assinar e "Restaurar compras". A Apple e o Google exigem a compra pela loja para assinatura de app; sem ela, o app só pode ir à loja sem cobrança (data de início vazia) | Equipe, depois das contas e dos acordos de apps pagos de cada loja (Enzo) |
| 2 | Site final publicado (advogado, endereço, nome do canal de privacidade) e `EXPO_PUBLIC_SITE_URL` nos dois ambientes: a Apple exige o acesso à política dentro do app | Enzo passa os dados; equipe publica |
| 3 | Conta de teste da revisão, com dados fictícios (`docs/16`, seção 5) | Enzo |
| 4 | Ficha, capturas novas (com o Telegram; sem a tela Assinatura da web, que cita o pagamento na web) e respostas de privacidade conferidas na tela de cada loja (`docs/lojas/`) | Equipe prepara; Enzo cola |
| 5 | Build `production` nas duas lojas, teste interno e envio com liberação manual, para sair junto com a web | Enzo, com roteiro |
