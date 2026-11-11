# Relatório de falhas (Sentry, D-093)

Decisão 11 das lojas (`docs/37`), antecipada pela D-093 em 11/11/2026: o app de celular entra nas lojas com relatório de falhas, **sem dado
financeiro nem pessoal**, com a conta criada pelo Enzo, o trecho na política e a pergunta ao advogado (pergunta 50 de
`docs/legal/resumo-para-advogado.md`).

## 1. Como está no app

- **Só no app de celular.** A web não tem relatório: o pacote `@sentry/react-native` (7.11, a versão do SDK 57 do Expo) só entra nos builds
  de iPhone e Android (`apps/app/src/lib/crash-report.native.ts`; na web, `crash-report.ts` não faz nada).
- **Desligado sem o endereço do projeto.** O relatório só começa com `EXPO_PUBLIC_SENTRY_DSN` nas variáveis do EAS. Sem ela, nada é
  iniciado nem enviado (`crashReportDsn`, `packages/core/src/crash-report.ts`).
- **Limpeza antes de cada envio** (`scrubCrashEvent`, testada em `packages/core/test/crash-report.test.ts`): saem quem é a pessoa, o pedido
  de rede, os dados extras, o nome do aparelho (como "iPhone de Maria") e todo rastro que não seja troca de tela; das trocas de tela, o
  caminho perde os identificadores (`/investimento/[id]/movimento`); no texto do erro, números, e-mails e identificadores viram `#`,
  `[e-mail]` e `[id]`. Ficam o tipo do erro, a pilha de chamadas do código, o modelo e o sistema do aparelho e a versão do app.
- **Só os erros do JavaScript, sem a parte nativa do SDK** (revisão independente de 11/11/2026): o SDK nativo não passa pela limpeza do
  JavaScript, e as falhas nativas, os travamentos e os rastros de rede do sistema (com os endereços das consultas ao banco) iriam sem ela.
  Por isso `enableNative`, `enableNativeCrashHandling`, `enableAppHangTracking`, `enableNdk` e `enableCaptureFailedRequests` ficam
  desligados: uma falha que derruba o app sem passar pelo JavaScript não é relatada. A versão do app vai à mão (`clarevo@<versão>`).
- **Opções fixas** (`CRASH_REPORT_OPTIONS`): sem dado pessoal padrão do SDK, sem captura de tela, sem hierarquia de tela, sem medição de
  desempenho e sem sessões. Os rastros já entram limpos no escopo (`beforeBreadcrumb`), e do contexto do app só ficam nome, versão e build. Sem o plugin de envio de mapas de código (precisaria de um segredo no EAS): a pilha chega com os nomes do
  código compactado; dá para acrescentar depois, se a equipe precisar.
- **Política de privacidade**, seção 8: o Sentry está em "Estão previstos", com o que recebe e o que não recebe.

## 2. Passos do Enzo (à mão; nenhum segredo passa pelo chat)

1. **Conta**: criar em `sentry.io` com o e-mail da empresa, no plano gratuito (Developer). Na criação da organização, escolher a **região
   de dados** (Estados Unidos ou Alemanha). Recomendação da equipe: Alemanha, até a resposta do advogado (pergunta 50, item c).
2. **Projeto**: novo projeto da plataforma **React Native**, nome `clarevo-app`. O Sentry mostra o **DSN** (um endereço que começa com
   `https://` e termina com um número). O DSN não é segredo (fica dentro do app), mas não precisa ir para o chat.
3. **Privacidade do projeto** (Settings, Security & Privacy): ligar **Prevent Storing of IP Addresses**, **Data Scrubber** e **Use Default
   Scrubbers**. Em Data Retention, deixar o menor prazo que o plano permitir.
4. **EAS** (expo.dev, projeto Clarevo, Environment variables): criar `EXPO_PUBLIC_SENTRY_DSN` com o DSN, visibilidade **Plain text**, nos
   ambientes **preview** e **production**.
5. **Conferir**: no próximo build de teste (`preview`), abrir o app e seguir normalmente. Falhas, se houver, aparecem em Issues no Sentry,
   sem nome, e-mail, valores nem IP. Se aparecer qualquer dado da pessoa num relatório, avise a equipe antes do lançamento.

## 3. Depois

- Mover o Sentry de "Estão previstos" para "Hoje usamos" na política quando o DSN estiver no build de produção, com a região, o prazo de
  guarda e o contrato preenchidos (marcador `[A DEFINIR]` da seção 8).
- Se a equipe precisar da pilha com os nomes do código: o plugin `@sentry/react-native/expo` com `SENTRY_AUTH_TOKEN` como **segredo** no
  EAS (só o Enzo).
