# Clarevo · Widget nativo da tela inicial (preparado e desligado)

21/10/2026, Ciclo AA (D-063 item 3, `docs/00`). O código do widget do iPhone e do Android está no repositório, testado até onde dá sem aparelho, e **desligado**: nenhum build de hoje (`preview` e `production`) muda. Só o perfil novo `preview-widget` do EAS liga o widget, com `CLAREVO_WIDGET=1`. Conferir de verdade (na tela inicial, na tela bloqueada, no dia seguinte) só é possível em aparelho, depois das contas das lojas (P-006). **Nada foi compilado, publicado nem enviado a loja alguma**, e nenhuma chave, segredo ou identificador de conta foi escrito no repositório.

O conteúdo do widget é o do núcleo, de D-052: pequeno "Anotar gasto", médio "Ainda a pagar em {mês}" com a próxima conta e as vencidas, valores ocultos por padrão e, com eles ocultos, sem o nome da conta (D-054, P-027). O que este ciclo acrescenta é o outro lado: gravar o resumo para o widget, desenhá-lo e ligar tudo no build.

## 1. Resumo

| | Estado |
|---|---|
| Pesquisa e escolha (seção 2) | Feita: iOS com `expo-widgets`, Android com `react-native-android-widget` |
| Núcleo da ponte (`packages/core/src/widget-sync.ts`) | Pronto e testado: o que se grava, quando, e como o widget lê |
| Widget do iPhone (`apps/app/src/widget-native/ios.tsx`) | Escrito, passa pelo Babel do Expo e roda num ambiente de teste que só tem os nomes da extensão. **Não foi compilado nem visto num iPhone** |
| Widgets do Android (`apps/app/src/widget-native/android.tsx`) | Escritos e rodados num ambiente de teste. **Não foram compilados nem vistos num Android** |
| Desligado por padrão (seção 4) | Provado: `expo config` idêntico byte a byte, prebuild do iOS e do Android idêntico ao de antes, pacote de JavaScript sem o código do widget |
| Pacotes nativos | Instalados (versões do SDK 57, seção 2) e **fora do autolinking** de todo build sem a variável |
| Conta Apple, Google e Expo, App Group, primeiro build com o widget, teste em aparelho | **Falta** (seção 7). Depende de P-006 |

## 2. Pesquisa e escolha

Lido em 21/10/2026. O que não abriu nesta rede (`docs.expo.dev`, `saleksovski.github.io`, `reactnative.directory` e `api.expo.dev` responderam 403) foi lido na fonte do mesmo texto: o repositório `expo/expo` no GitHub (`docs/pages/versions/v57.0.0/sdk/widgets.mdx`, a página "Widgets" do SDK 57), o repositório `sAleksovski/react-native-android-widget` (`docs/docs/tutorial/register-task-handler.md`) e os próprios pacotes baixados do npm (código, tipos e plugins).

| | iOS | Android |
|---|---|---|
| **Escolhido** | `expo-widgets` **57.0.26** (publicado em 15/10/2026; etiqueta `sdk-57` no npm; o SDK 57 pede `~57.0.23` em `bundledNativeModules.json`; `expo` 57.0.27 instalado). Pacote oficial da Expo: extensão WidgetKit criada por config plugin, App Group derivado do `ios.bundleIdentifier`, widget escrito em TSX com `@expo/ui/swift-ui` (`@expo/ui` `~57.0.22`, que o expo-router já usa) | `react-native-android-widget` **0.23.0** (publicado em 20/10/2026; `peerDependencies`: `expo >= 54`, `react` e `react-native` qualquer versão). Receptor de AppWidget criado por config plugin, widgets em TSX, tarefa em segundo plano em JavaScript. A 0.23.0 tem os mesmos `src` e `android` da 0.22.1 (17/08/2026); o plugin só ganhou a opção `widgetCategory` (na 0.22.1 o valor era sempre `home_screen`), que deixa a decisão sobre a tela de bloqueio em `widget.config.js` |
| Por que | Oficial e presa ao SDK; sem Swift nem Kotlin para manter; o layout é TSX, então dá para rodar e testar sem aparelho; nenhum identificador de conta (o grupo é `group.app.clarevo`, tirado do bundle id) | Mantida (versões em jan, mai, jul, ago e out de 2026); a mais usada para AppWidget com Expo; mesma linguagem do app; os cliques abrem links `clarevo://` sem código nativo nosso |
| Alternativa vista | `@bacons/apple-targets` **5.0.0** (17/07/2026; `expo >= 52`): extensão de qualquer tipo, mas o widget é Swift escrito à mão, que não dá para compilar nem testar aqui; pede `ios.appleTeamId` (identificador de conta) no app config. Fica como plano B se o `expo-widgets` falhar no aparelho | `expo-widgets` no Android: o plugin tem `enableAndroid` (desligado, "será removido quando o Android for padrão") e a documentação do SDK 57 lista só o iOS; no 57.0.26 o JavaScript do Android é um módulo vazio (`ExpoWidgets.ts`), então ainda não serve. Reavaliar nos próximos SDKs, para ficar com uma biblioteca só |
| Outra alternativa | | AppWidget em Kotlin (Glance) à mão, com SharedPreferences: mais código nosso, sem como compilar aqui |

**Instalação.** `npx expo install expo-widgets @expo/ui react-native-android-widget` não funciona sozinho nesta rede, porque `api.expo.dev` e `reactnative.directory` são bloqueados (403); com `EXPO_OFFLINE=1` ele usa a lista do SDK instalado (`node_modules/expo/bundledNativeModules.json`: `expo-widgets ~57.0.23`, `@expo/ui ~57.0.22`) e instala pelo npm, que abre. Resultado em `apps/app/package.json`: `expo-widgets ~57.0.23` (instalou a 57.0.26), `@expo/ui ~57.0.22` (a mesma cópia que o expo-router já usa; o `expo-widgets` traz a 57.0.25 dentro da própria pasta) e `react-native-android-widget ^0.23.0`. O `expo install` também escreveu os dois plugins em `app.json`; eles foram tirados de lá de propósito, porque lá valeriam para todo build (hoje só entram por `widget.config.js`).

Fontes consultadas (todas em 21/10/2026): página "Widgets" do SDK 57 (texto no GitHub, acima); `expo-widgets` 57.0.26 (código do plugin, módulo e `ExpoWidgets.ios.ts` contra `ExpoWidgets.ts`); `react-native-android-widget` 0.23.0 (README, tipos do plugin e `register-task-handler.md`); `@bacons/apple-targets` 5.0.0 (pacote); Apple: `developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date` (a atualização é por linha do tempo e há um orçamento de recarregamentos por dia), `widgetkit/timeline` (cada entrada tem a data em que o WidgetKit troca a visão), `widgetkit/timelinereloadpolicy/atend`, `swiftui/view/privacysensitive(_:)` e `xcode/configuring-app-groups` (o App Group é como o app e a extensão compartilham dados); Android: `developer.android.com/develop/ui/views/appwidgets/advanced` ("updatePeriodMillis não aceita menos de 30 minutos") e a referência de `AppWidgetProviderInfo` (`widgetCategory`: tela inicial, tela de bloqueio ou as duas).

## 3. Como funciona

```
Resumo/Contas a pagar (Pessoal)  ->  planWidgetSync (núcleo)  ->  armazenamento compartilhado  ->  widget só desenha
                                     WidgetSnapshot (D-052)       iOS: App Group (expo-widgets)
                                                                  Android: AsyncStorage
```

**Quando o app grava** (`apps/app/src/lib/widget-sync.ts`, chamado por `components/device-features.tsx`, junto com os lembretes de D-025): ao abrir, ao voltar para o app, depois de cada escrita (e da geração do dia dos gastos fixos), ao mudar "Mostrar valores no widget" em Conta, e ao entrar ou sair da conta. Uma execução por vez; pedidos seguidos viram um só; e texto igual ao último gravado com sucesso (guardado só na memória) não é gravado de novo, porque o iOS limita os recarregamentos do widget por dia. O texto leva o dia, então o primeiro pedido de cada dia sempre grava.

**O que o núcleo decide** (`planWidgetSync`, testado em `widget-sync.test.ts`):

- O que se grava é o `WidgetSnapshot` de `buildWidgetSnapshot`, em JSON, e nada além disso. Não há identificador da pessoa, da conta nem do contexto.
- **Valores ocultos por padrão** (`widgetShowValues`, desligado, só neste aparelho): o texto gravado traz "R$ ••••", "Próxima conta" e o prazo ("hoje", "amanhã", "em N dias"), sem valor em reais e sem o nome da conta.
- **Só o contexto Pessoal** (o mês de hoje, `listCommitments`, como os lembretes). A Família nunca entra.
- **Demonstração: nada é gravado** (nem lido). **Sem sessão** (sair, sessão expirada, conta excluída): grava só o estado "Entre no Clarevo para ver", sem dado nenhum, e o widget deixa de mostrar o que a pessoa anterior viu.
- **Sem a leitura das contas ainda**: não grava; o que já estava vale no mesmo dia e vira "sem dados" sozinho em outro.
- **Dia seguinte sem dados**: o texto gravado traz "hoje" e "amanhã" e as vencidas contadas até `builtOn`; por isso `isWidgetSnapshotFresh` só deixa mostrar o gravado no mesmo dia. Em outro dia o widget mostra "Abra o Clarevo para atualizar", e "Anotar gasto" continua abrindo a tela de anotar.

**iOS.** O app grava uma linha do tempo de duas entradas (`updateTimeline`): o snapshot de hoje, a partir de agora, e, à meia-noite do aparelho, o estado sem dados (`afterMidnight`, também montado pelo núcleo). Um widget do iOS não troca de dia sozinho; é a segunda entrada que faz a mudança. O widget (`ios.tsx`) só desenha os campos prontos: título, valor, próxima conta, vencidas, mensagem, texto alternativo (`a11y`) e o endereço `clarevo://` (`widgetURL`). Valor e próxima conta levam `privacySensitive`. Um único widget, nos tamanhos pequeno e médio.

**Android.** O app grava o JSON no AsyncStorage e pede o desenho dos dois widgets (`requestWidgetUpdate`). O próprio JavaScript do app desenha o widget em segundo plano, mesmo com o app fechado: o Metro registra a tarefa (`registerWidgetTaskHandler`) antes de a primeira tela carregar, só neste build. A cada adição, redimensionamento e atualização periódica (30 minutos, o mínimo do Android), a tarefa lê a chave e confere o dia com `widgetContentToday`: em outro dia, "Abra o Clarevo para atualizar". Dois widgets: "Anotar gasto" (2 x 2) e "Ainda a pagar" (4 x 2), só para a tela inicial (`widgetCategory: home_screen`).

**Abrir o app.** "Anotar gasto" abre `clarevo://registro/novo?tipo=despesa` (o formulário de gasto) e o widget médio abre `clarevo://a-pagar`; sem sessão, os dois abrem `clarevo://entrar`. O esquema `clarevo` é o de `app.json`.

Arquivos:

| Arquivo | O que é |
|---|---|
| `packages/core/src/widget-sync.ts` | `planWidgetSync`, `parseWidgetSnapshot`, `widgetContentToday`, `widgetUrl`, `nextLocalMidnight`, `WIDGET_NATIVE` (nomes e chave) |
| `apps/app/src/lib/widget-sync.ts` | O gravador: lê as contas do Pessoal, chama o núcleo e grava pela ponte; sem widget nativo não lê nem grava nada |
| `apps/app/src/lib/widget-bridge.ts`, `.ios.ts`, `.android.ts` | A ponte. A versão sem sufixo (web, Expo Go, todo build sem o widget) é "sem widget"; as outras carregam o módulo dentro de um `try` |
| `apps/app/src/widget-native/ios.tsx` | O widget do iPhone (`createWidget`) |
| `apps/app/src/widget-native/android.tsx`, `android-register.ts`, `android-entry.ts` | Os widgets do Android, a tarefa em segundo plano e o ponto de entrada que a registra |
| `apps/app/widget.config.js`, `app.config.js`, `plugins/with-widget-autolinking.js` | A configuração do build (seção 4) |
| `apps/app/metro.config.js` | Módulos vazios sem a variável; entrada do Android com ela |
| `apps/app/eas.json` | Perfil `preview-widget` |

## 4. Desligado por padrão: as quatro travas e as provas

Sem `CLAREVO_WIDGET=1` (só o valor exato "1" liga):

1. **Configuração do app.** `apps/app/app.json` não mudou. `app.config.js` recebe esse conteúdo e o devolve sem mudar; com a variável, acrescenta ao fim de `plugins` o `expo-widgets`, o `react-native-android-widget` e um plugin local. Não há permissão nova: o App Group do iOS (`com.apple.security.application-groups`, com o valor `group.<bundle id>`) é criado pelo plugin e o Android não pede permissão para ter widget.
2. **Autolinking.** Os dois pacotes nativos estão instalados, mas `expo.autolinking.exclude`, no `package.json` do app, os mantém fora do iOS e do Android. Sem isso o módulo `ExpoWidgets` e o `<provider>` exportado da biblioteca do Android entrariam em todo build. O `@expo/ui` **não** é excluído: o expo-router já o liga hoje. Com a variável, o plugin local tira os dois nomes da lista, na cópia do projeto em que o prebuild roda.
3. **Metro.** Tudo em `src/widget-native` vira módulo vazio, então nenhum código de `expo-widgets`, de `@expo/ui/swift-ui` nem de `react-native-android-widget` entra no pacote de JavaScript. Com a variável, só no Android, o import de `expo-router/build/qualified-entry` feito por `expo-router/entry-classic` passa por `android-entry.ts`, que registra a tarefa do widget e devolve o mesmo `App`. O `main` do `package.json` continua `expo-router/entry`.
4. **EAS.** `preview` e `production` não têm a variável. O perfil `preview-widget` parte do `preview` (`extends`) e só acrescenta `env.CLAREVO_WIDGET = "1"`.

Provas (21/10/2026), rodadas fora do repositório:

| Prova | Resultado |
|---|---|
| `npx expo config --type public --json`, antes e depois, sem a variável e com `CLAREVO_WIDGET=0` | **Idêntico byte a byte** (1.672 bytes) |
| `npx expo config --type public` com `CLAREVO_WIDGET=1` | Só mudam `plugins` (os três acrescentados no fim) e `extra.eas.build.experimental.ios.appExtensions` (a extensão `app.clarevo.ExpoWidgetsTarget` com o grupo `group.app.clarevo`, feito pelo plugin) |
| `expo prebuild --no-install` do `apps/app` do último commit (`git archive HEAD`) e do app de agora, sem a variável | `ios/` e `android/` **idênticos** (`diff -r`, 81 arquivos) |
| O mesmo prebuild com `CLAREVO_WIDGET=1` | 89 arquivos: no iOS, `ios/ExpoWidgetsTarget/` (`ClarevoWidget.swift`, `index.swift`, `Info.plist`, `ExpoWidgetsTarget.entitlements`) e mudanças em `Clarevo.entitlements` (o grupo), `Info.plist` (`ExpoWidgetsAppGroupIdentifier` e `NSSupportsLiveActivities`), `project.pbxproj` e `Podfile` (o alvo `ExpoWidgetsTarget`); no Android, os receptores `.widget.ClarevoAnotar` e `.widget.ClarevoAPagar` no manifesto, o serviço `RNWidgetCollectionService`, as duas classes Java, os dois `appwidget-provider` em `res/xml` e as descrições em `strings.xml` |
| Pacotes ligados pelo autolinking (`expo-modules-autolinking resolve` e `react-native-config`): iOS 25 + 9, Android 23 + 9 | Sem a variável, nenhum pacote do widget. Depois do prebuild com a variável: `expo-widgets` nas duas plataformas e `react-native-android-widget` no Android, e mais nada |
| `expo export` (iOS e Android, sem minificar) sem a variável | Nenhum código de `expo-widgets`, `@expo/ui/swift-ui` nem `react-native-android-widget` no pacote; sobram só comentários do código-fonte e o `require` de um módulo vazio no lugar de `src/widget-native` |
| O mesmo com a variável | iOS: o widget como texto (a função serializada) e `createWidget`. Android: a tarefa registrada pelo módulo que `expo-router/entry-classic` carrega antes de `renderRootComponent` |

Tamanho do pacote de JavaScript (`expo export` com a demonstração, minificado, 21/10/2026), do último commit para o app de agora, sem a variável: web 4.803.182 para 4.804.046 bytes (+864), iOS (Hermes) 11.078.493 para 11.082.526 (+4.033) e Android 11.279.871 para 11.285.275 (+5.404), que são só o núcleo da ponte e o gravador. Com a variável: iOS +141.443 bytes (+56 KB comprimido) e Android +39.479 (+24 KB), sobre o app sem ela. A web nunca recebe o widget.

Testes (`npm test`): `widget-config.test.ts` (configuração igual sem a variável, só o valor "1" liga, plugins, exclusão do autolinking, perfis do EAS, Metro, nenhuma chave ou identificador de conta), `widget-sync.test.ts` (o núcleo da ponte) e `widget-native.test.ts` (o código nativo e o gravador rodando fora do aparelho).

## 5. Como ligar

Pré-requisitos que só Enzo tem (`docs/16`): conta Expo, Apple Developer e, para testar o Android, nenhum além da Expo. A configuração do app (`app.json`) não ganha nenhum identificador de conta; o EAS pede o que precisa na hora do build.

**Build de teste pelo EAS** (a partir de `apps/app`):

```
npx eas-cli@latest build --platform ios --profile preview-widget
npx eas-cli@latest build --platform android --profile preview-widget
```

No iOS, a primeira vez o EAS cria na conta Apple o App Group `group.app.clarevo` e o identificador da extensão `app.clarevo.ExpoWidgetsTarget` (pelo `extra.eas.build.experimental.ios.appExtensions` que o plugin escreve) e gera os perfis de assinatura dos dois alvos. O perfil `preview-widget` herda do `preview`: no iOS é um build de loja, que vai ao TestFlight, e no Android é um APK.

**Build local, só para olhar os arquivos** (sem compilar, numa cópia fora do repositório, como nas provas acima):

```
CLAREVO_WIDGET=1 npx expo prebuild --no-install
```

Atenção: o plugin local tira `expo-widgets` e `react-native-android-widget` de `expo.autolinking.exclude` no `package.json` da pasta em que o prebuild roda. Em cópia temporária isso não importa; se rodar na pasta do repositório, desfaça depois com `git checkout -- apps/app/package.json`.

**Desligar de novo:** não rodar o perfil `preview-widget` (ou tirar a variável). Nada mais a desfazer.

## 6. O que o widget mostra e o que conferir no aparelho

Instalar o build, abrir o app **uma vez** com uma conta de teste (não a demonstração: nela nada é gravado) e adicionar o widget: no iPhone, segurar a tela inicial, "+", Clarevo; no Android, segurar a tela inicial, Widgets, Clarevo ("Anotar gasto" e "Ainda a pagar").

| Conferir | Esperado |
|---|---|
| Valores ocultos (padrão) | Médio: "Ainda a pagar em {mês}", "R$ ••••" e "Próxima conta · em N dias", sem nome de conta, sem valor, sem data. Leitor de tela: "Ainda a pagar em {mês}, valor oculto. Próxima conta, vence em N dias." |
| "Mostrar valores no widget" ligado (Conta) | Em poucos segundos: total em reais e "Internet · 15/10 · R$ 150,00" (ou "≈" e "estimado"); desligar volta ao oculto |
| **Tela bloqueada** | iPhone: com o aparelho bloqueado (tela Hoje, StandBy), não deve aparecer valor nem nome de conta com os valores ocultos; com eles ligados, o valor e a próxima conta estão marcados como sensíveis e o iOS pode escondê-los (conferir). Android: o widget **não** deve aparecer na lista de widgets da tela de bloqueio (`widgetCategory: home_screen`); se aparecer, trocar por `not_keyguard` em `widget.config.js` |
| "Anotar gasto" | Abre o Clarevo direto no formulário de gasto (`clarevo://registro/novo?tipo=despesa`), com o app fechado e com ele aberto; sem sessão, abre Entrar |
| Toque no médio | Abre Contas a pagar |
| Sair da conta e entrar com outra pessoa | O widget passa a "Entre no Clarevo para ver" ao sair e nunca mostra dado da pessoa anterior; excluir a conta também |
| **Fuso** | Trocar o fuso do aparelho (por exemplo para Rio Branco) e conferir "hoje" e "amanhã" e o horário da virada |
| **Dia seguinte sem dados** | Sem abrir o app, depois da meia-noite do aparelho, o médio diz "Abra o Clarevo para atualizar" (iPhone: na virada; Android: em até cerca de 30 minutos, pode atrasar com o modo de economia) e "Anotar gasto" segue igual. Abrir o app atualiza |
| Virada de mês e de ano | Em 31/12 e em 30/11, no dia seguinte, o médio não mostra o mês anterior |
| Sem rede / aviões | O widget mostra o último conteúdo do dia, nunca erro |
| Família | O widget só tem o Pessoal, mesmo com a Família escolhida no app |
| Letra grande, modo escuro, VoiceOver e TalkBack | O texto cabe (uma a três linhas), o contraste é o do tema (5,59:1 no "Anotar gasto" branco sobre azul e 7,14:1 ou mais no médio) e o leitor de tela lê o texto alternativo do núcleo |
| Aparelho simples | Adicionar e remover o widget sem travar o app |

Se algo falhar, a primeira coisa a olhar: no iPhone, se o app já rodou uma vez com o widget (é isso que registra o layout para a extensão) e se a data do aparelho está certa; no Android, se o aviso de "tarefa em segundo plano" aparece no `adb logcat` e se a economia de bateria do fabricante não bloqueia o app.

## 7. O que falta e decisões

- **Teste em aparelho** de tudo da seção 6 (iPhone e Android), depois das contas Apple, Google e Expo (P-006). Resultado vai em `docs/04`, seção "Ciclo AA".
- **Compilar uma vez** o build `preview-widget`: o prebuild gera os arquivos, mas a compilação não rodou aqui (sem macOS, sem Android SDK). Se o `expo-widgets` falhar no iPhone, o plano B é `@bacons/apple-targets` com Swift à mão.
- **Texto do cartão "Widget na tela inicial" em Conta** continua "Disponível quando o app estiver nas lojas" (nenhum texto do app mudou). Trocar quando o widget for publicado é decisão de Enzo.
- **Android 30 minutos:** o Android não aceita atualização periódica a menos de 30 minutos. Depois da meia-noite o widget pode mostrar o conteúdo de ontem por até esse tempo, mais o atraso do sistema. Se isso incomodar, o caminho é um alarme exato (permissão especial), fora do escopo.
- **Orçamento do iOS:** o WidgetKit limita os recarregamentos por dia (Apple, "Keeping a widget up to date"); o app grava só quando algo muda e uma vez por pedido.
- **`expo-widgets` e `react-native-android-widget` são pacotes de terceiros e de versões recentes:** reavaliar a cada SDK (a Expo deve levar o Android para o `expo-widgets`).
- **Revisar** as regras de detalhe de D-052 e P-027 (já decididas) no aparelho: o que o widget mostra com os valores ocultos.

## 8. Verificações rodadas (21/10/2026)

Ver `docs/04`, seção "Ciclo AA".
