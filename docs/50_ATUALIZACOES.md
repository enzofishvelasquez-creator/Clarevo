# Atualizações pelo ar (EAS Update)

16/11/2026. Decisão do Enzo (D-100): os celulares de teste recebem as correções sem instalar outro APK. Junto, para a rodada de testes com pessoas: a versão do app na última linha de Conta, o botão "Enviar sugestão ou problema" e uma tela de erro com saída.

## 1. Como funciona, em poucas palavras

- O app instalado tem duas partes. A **parte nativa** (o "build", o APK) só muda com um build novo. As **telas, os textos e as regras** podem ser trocados pelo ar.
- Depois do próximo build `preview`, **todo merge no `main` publica sozinho uma atualização** para os celulares com esse build (o expo.dev faz isso pelo arquivo `apps/app/.eas/workflows/atualizar-preview.yml`, em "Workflows").
- **Quem testa recebe assim:** abrir o app com internet e esperar alguns segundos (ele baixa a atualização sem mostrar nada), fechar o app de vez (tirar da lista de apps abertos) e abrir de novo. Se a última linha de Conta ainda não mudou, repetir uma vez.
- A atualização só vai para os celulares com a mesma parte nativa. Quando um merge muda a parte nativa (seção 3), a atualização fica guardada para o próximo build, e quem tem o build antigo continua com a versão de antes, sem quebrar.

## 2. O que o Enzo faz no expo.dev

Nenhum segredo passa por aqui, e não é preciso criar variável nova (seção 5). A ordem importa: o build do passo 2 é o primeiro que recebe atualizações.

1. **Juntar o PR ao `main`** no GitHub ("Create a merge commit"), como sempre.
2. **Build novo:** "Builds", "Build from GitHub", Git ref `main`, Platform `Android`, Build profile `preview`. Instalar o APK por cima do anterior (os dados da conta ficam). Os builds de antes (versão 1.0.0) **não** recebem atualização: todo mundo que testa precisa deste build novo uma vez.
3. **Conferir no celular:** Conta, última linha: "Versão 1.0.1 (build N) · original do build".
4. **Conferir a primeira atualização,** depois do próximo merge no `main`: no expo.dev, "Workflows", a execução "Atualizar o app de teste" fica verde em alguns minutos; em "Updates" aparece a atualização no ramo `preview`. No celular: abrir, esperar, fechar de vez e abrir de novo. A última linha de Conta passa a "Versão 1.0.1 (build N) · atualização" seguida de 8 letras e números.
5. **Se a execução ficar vermelha,** mandar à equipe o link da página dela (não tem segredo). Os celulares continuam com a versão anterior.

Para desfazer uma atualização com problema: fazer o revert do PR no GitHub e juntar o revert ao `main`. A publicação seguinte volta ao código de antes.

## 3. O que precisa de build novo (não vai pelo ar)

- Pacote nativo novo ou atualizado (um módulo novo do Expo, câmera, biometria, notificações, widget).
- Mudança em `apps/app/app.json`, nos plugins (`apps/app/plugins`), em `widget.config.js` ou nas variáveis que mudam a configuração do app (`CLAREVO_WIDGET`).
- **Nova versão do app** (`version` em `app.json`, o número que as lojas mostram), ícone, tela de abertura, nome e permissões.

Vai pelo ar: telas, textos, regras do núcleo (`packages/core`) e correções do JavaScript do app.

Como saber: a equipe avisa no PR quando ele pede build novo. Se ninguém avisou e a última linha de Conta não muda depois do merge (fechando e abrindo duas vezes), é sinal de que precisa de build novo.

## 4. A versão em Conta e o "Enviar sugestão ou problema"

- **Conta, última linha:** "Versão 1.0.1 (build 12) · atualização 1a2b3c4d" (exemplo). "original do build" quer dizer que o celular ainda roda o que veio no APK. Na web aparece só a versão.
- **Conta, logo abaixo do perfil:** "Enviar sugestão ou problema" abre o e-mail do celular para `suporte@clarevo.app.br`, com o assunto "Clarevo · sugestão ou problema", um espaço para a pessoa escrever e, abaixo de uma linha, só: versão e build, atualização, perfil do build, sistema e modelo do aparelho e a tela. **Nada da conta:** sem nome, e-mail, valores, categorias nem identificadores. Se o celular não abrir o e-mail, o endereço aparece para copiar. O "Escrever para o suporte" de "Ajuda e contato" continua igual.
- **Tela de erro:** se uma tela falhar, aparece "Algo deu errado nesta tela." com "Tentar de novo", "Voltar ao Resumo" e "Enviar um problema", e a falha vai para o relatório de falhas (Sentry, `docs/46`), já limpa. Os dois primeiros recomeçam o app do início e levam ao Resumo.
- **Falha ao carregar a conta:** a tela azul de carregamento diz "Sem conexão no momento" quando o problema é a internet e oferece, além de tentar de novo, "Sair da conta" e "Enviar um problema".

## 5. Para a equipe

- **Configuração:** `expo-updates` e `expo-application` instalados na versão do SDK 57; em `app.json`, `updates.url` (`https://u.expo.dev/` mais o Project ID) e `runtimeVersion` com a política `fingerprint`; em `eas.json`, o `channel` de cada perfil com o nome dele (`preview`, `preview-sem-widget`, `production`). A versão foi para 1.0.1; o número do build continua somado sozinho pelo EAS (`appVersionSource: remote` e `autoIncrement`).
- **Sem variável nova no expo.dev:** a publicação liga o widget no próprio arquivo (`env` do job, que vale mais que as variáveis do expo.dev) e lê as `EXPO_PUBLIC_*` do ambiente `preview`, as mesmas do build. `CLAREVO_WIDGET` **não** deve ir para o ambiente `preview` do expo.dev: o perfil de reserva `preview-sem-widget` usa o mesmo ambiente, e o build do EAS junta as variáveis do ambiente depois das do `eas.json` (`@expo/build-tools` 27.10, `context.js`), então a variável poderia ligar o widget na reserva e fazer o build dela parar na conferência da impressão digital. Uma publicação à mão (só a equipe, pelo terminal) leva `CLAREVO_WIDGET=1` na frente do comando.
- **Publicação:** `apps/app/.eas/workflows/atualizar-preview.yml` (a pasta `.eas` fica ao lado do `eas.json`, na pasta base `apps/app`). A cada push no `main`, um job `type: update` com `environment: preview` (as `EXPO_PUBLIC_*` do expo.dev), `env: CLAREVO_WIDGET: '1'`, `branch: preview` e `platform: android`, com `concurrency` para dois merges seguidos não publicarem fora de ordem. Chaves conferidas na documentação do Expo (pre-packaged jobs, "Update"; syntax, `environment`, `env` e `concurrency`) em 16/11/2026; o esquema que o `eas-cli` usa para validar vem da API do Expo, que esta rede não alcança. Quando houver build de iPhone, trocar `platform` por `all`. Para o lançamento, decidir se o `production` também recebe pelo ar (outro arquivo, com `branch: production`, ou publicação só à mão).
- **Impressão digital igual antes e depois do prebuild:** o EAS calcula a impressão digital antes do prebuild (ao pedir o build) e depois dele (na máquina do build) e **para o build** se forem diferentes. O plugin do widget tira `expo-widgets` e `react-native-android-widget` da exclusão do autolinking no prebuild, o que mudaria a segunda conta. `apps/app/fingerprint.config.js` deixa esses dois pacotes fora das duas contas. Conferido com `expo prebuild` em 16/11/2026: com `CLAREVO_WIDGET=1`, a impressão digital do Android antes e depois do prebuild é a mesma (e a do iPhone também, com o `package.json` como o prebuild deixa); sem o widget, é outra.
- **Web:** `expo-updates` e `expo-application` só são importados em `apps/app/src/lib/app-info.native.ts` (a web usa `app-info.ts`, só com a versão), então `export:web` e `export:demo` não mudam e a Cloudflare publica como antes.
- **Relatório de falhas:** `environment` é o canal (o perfil do build), `dist` é o número do build, e as marcas `sistema`, `aparelho` e `atualizacao` vão em todo relatório; a tela de erro manda a falha com a marca `tela` (o caminho da rota, sem identificadores). O caminho limpo agora também troca por `[id]` qualquer parte com maiúscula, acento, espaço ou `%` (nome de categoria). Veja `docs/46`.
- **Privacidade:** a política (seção 8, Expo) diz o que vai na consulta ao servidor de atualizações: o IP, o sistema, a versão do app e um código aleatório da instalação (o `EAS-Client-ID` que o `expo-updates` cria), sem ligação com a conta.
