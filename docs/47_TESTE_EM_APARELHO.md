# Teste em aparelho: roteiro único

11/11/2026. Quase tudo o que falta conferir antes do lançamento só dá para ver num celular de verdade: lembretes, biometria, câmera,
widget, arquivos, letra grande e leitor de tela. Esses itens estavam espalhados em `docs/04` (um "Teste em aparelho" por ciclo),
`docs/37` (seção 6), `docs/40` (seção 4), `docs/21` (seção 6) e `docs/46` (seção 2). Este roteiro junta tudo numa ordem só, para fazer de
uma vez quando o build de teste sair. Cada item tem um número: basta responder "ok" ou "falhou" com o número e, se falhou, um print.

**Regras de sempre:** use uma conta de teste (não a demonstração, que não grava nada) ou a sua, com dados seus. Print sem senha, sem
código e sem dado de outra pessoa; se aparecer valor seu, pode cobrir. Nada de chave ou segredo no chat.

## 0. Antes de começar (Enzo, à mão)

1. **Sentry:** a variável `EXPO_PUBLIC_SENTRY_DSN` no expo.dev, ambientes `preview` e `production` (`docs/46`, seção 2). Sem ela o app
   funciona, só não manda relatório de falhas.
2. **Build:** no expo.dev, projeto `clarevo`, "Build from GitHub": ramo `main`, plataforma **Android**, perfil **`preview`** (já sai com
   o widget e o Sentry). As variáveis do Supabase são as mesmas do primeiro build (D-086). Quando terminar, instalar pelo link do Expo.
3. **Separar antes:** um cupom fiscal com QR Code, um boleto, um print de Pix, o PDF de um holerite e o de uma nota de serviço, um
   extrato do banco (PDF ou OFX) e um segundo e-mail seu para criar uma conta nova.

No iPhone, o mesmo roteiro vale quando houver TestFlight (depende da conta da Apple, `docs/37`, seção 4); os itens só do iPhone estão na
seção 2.

## 1. Android, build `preview` (cerca de 1 hora e meia; pode ser em duas vezes)

### A. Entrar e proteger

| # | O que fazer | O esperado |
| --- | --- | --- |
| 1 | Abrir o app e entrar | Entra no Resumo com os mesmos dados da web; a abertura é azul e o ícone aparece certo na tela inicial |
| 2 | Conta > ligar a biometria; fechar o app e abrir de novo | Pede a digital ou o rosto antes de mostrar os dados |
| 3 | Na biometria, errar de propósito e depois usar a senha do aparelho | Erro sem mostrar dados; com a senha do aparelho, entra |
| 4 | Conta > "Ocultar valores ao abrir"; fechar e abrir | Os valores viram "R$ ••••" em todas as telas, inclusive Investir e Metas |
| 5 | Numa conta antiga, se aparecer o aviso dos termos | Aparece uma vez, depois da biometria, e some com "Concordo e continuar" |

### B. Lembretes (permitir as notificações quando o celular pedir, e só depois do toque)

| # | O que fazer | O esperado |
| --- | --- | --- |
| 6 | Contas a pagar > nova conta vencendo amanhã, com lembrete | A notificação chega no horário (no Android pode atrasar alguns minutos), sem valor no texto, com o ícone em uma cor |
| 7 | Marcar essa conta como paga e depois reabrir | Pagar cancela o lembrete; reabrir agenda de novo |
| 8 | Uma conta que vence num sábado ou domingo, com lembrete | O texto diz "..., que não é dia útil" e o aviso continua na véspera da data original |
| 9 | Conta > Lembretes > "Anotar os gastos do dia" para daqui a pouco | O aviso chega no horário, sem valores, e o toque abre Anotar gasto |
| 10 | Anotar um gasto antes do horário do item 9 (no dia seguinte) | O aviso daquele dia não chega |
| 11 | Ligar "Uma semana sem anotar" | Fica ligado sem aviso imediato (só chega depois de 7 dias sem anotar) |
| 12 | Numa meta, ligar o lembrete do aporte num dia próximo (D-093) | O aviso chega no dia escolhido, sem valor |
| 13 | Conta > desligar todos os lembretes | Nenhum aviso chega depois; os agendados somem |

### C. Widget (D-093, `docs/21`, seção 6)

| # | O que fazer | O esperado |
| --- | --- | --- |
| 14 | Segurar a tela inicial > Widgets > Clarevo; pôr "Anotar gasto" e "Ainda a pagar" | Os dois aparecem; o médio diz "Ainda a pagar em {mês}", "R$ ••••" e "Próxima conta · em N dias", sem nome nem valor |
| 15 | Conta > "Mostrar valores no widget" ligado; depois desligado | Em poucos segundos mostra o total e a próxima conta; desligado, volta ao oculto |
| 16 | Tocar em "Anotar gasto" com o app fechado e com ele aberto | Abre direto o formulário de gasto |
| 17 | Tocar no médio | Abre Contas a pagar |
| 18 | Conferir a lista de widgets da tela de bloqueio | O Clarevo **não** aparece lá |
| 19 | Sair da conta | O widget diz "Entre no Clarevo para ver" e nunca mostra dado anterior |
| 20 | No dia seguinte, sem abrir o app | Em até cerca de 30 minutos depois da meia-noite: "Abra o Clarevo para atualizar"; abrir o app atualiza |
| 21 | Modo avião | O widget mostra o último conteúdo do dia, nunca erro |

### D. Câmera e leitura

| # | O que fazer | O esperado |
| --- | --- | --- |
| 22 | Anotar gasto > Escanear nota fiscal (primeira vez) | O celular pede a câmera com o texto da Clarevo; a lanterna liga e desliga; o zoom e a moldura ajudam |
| 23 | Apontar para o QR Code do cupom | Preenche valor, data, descrição e a forma de pagamento quando a nota traz |
| 24 | Foto da chave de uma nota (os 44 números) | Lê a chave e preenche |
| 25 | Ler comprovante > um print de Pix da galeria, logo depois de instalar | Preenche valor, data e quem recebeu; se a primeira leitura falhar, tentar de novo com internet e anotar o que apareceu |
| 26 | Contas a pagar > Ler boleto > foto do boleto (linha digitável inteira) | Cria a conta com valor e vencimento |
| 27 | Registrar recebimento > Ler comprovante > PDF do holerite e depois da nota de serviço, escolhidos no Google Drive | Preenche o valor líquido e a descrição; "Comprovante lido" e "Parece já anotado" são lidos pelo TalkBack |
| 28 | Foto de uma meta, pela galeria | Escolhe e mostra a foto na meta |

### E. Arquivos

| # | O que fazer | O esperado |
| --- | --- | --- |
| 29 | Importar extrato > o PDF ou OFX do banco (também pelo Google Drive) | Mostra as linhas para conferir antes de gravar; um arquivo grande (5 MB) não trava |
| 30 | Exportar meus dados > CSV e PDF > compartilhar | Pede a biometria (se ligada), abre a folha de compartilhar; o CSV abre no Google Planilhas; imprimir o PDF funciona |

### F. O que é novo no D-093

| # | O que fazer | O esperado |
| --- | --- | --- |
| 31 | Olhar a barra com Resumo, Movimentos, Metas, Investir e Aprender | Os cinco nomes inteiros, sem corte, também com letra grande |
| 32 | Investir > Novo investimento > "Atualizar valor" e "Registrar aporte" | Teclado de números com vírgula; o card mostra o CDI e o IPCA de verdade (com a fonte e a data); excluir o de teste depois |
| 33 | Metas > Nova meta > atalhos de prazo; depois "Ordenar metas" com duas ou mais | Os atalhos preenchem a data; a ordem escolhida fica |
| 34 | Calculadoras > Multa e juros > "Fatura do cartão" | Teclado de números; o resultado aparece e é lido uma vez pelo TalkBack |

### G. Letra grande e leitor de tela

| # | O que fazer | O esperado |
| --- | --- | --- |
| 35 | Letra do sistema no máximo (até 200%) e abrir Resumo, Movimentos, Anotar gasto, Contas a pagar, uma fatura, Investir e Conta | Nada cortado nem sobreposto; o selo "Demonstração" e os títulos longos cabem |
| 36 | TalkBack no Resumo | Anuncia "Resumo de {mês}"; números e botões com nomes claros; com valores ocultos, "valor oculto" |
| 37 | TalkBack em Movimentos (lista longa) | "Pago" e "Recebido" como títulos; a lista rola e lê cada linha |
| 38 | TalkBack em "Seu mês em 30 segundos" | Desliza os cartões; anuncia "Cartão 2 de 5. Para onde foi." |
| 39 | TalkBack em Análises (bolhas) e Evolução (gráfico) | Tocar numa bolha anuncia a categoria; cada mês do gráfico é um botão com nome |
| 40 | TalkBack no tour de boas-vindas e no guia (Aprender > Como usar o app) | O foco segue o cartão; o guia funciona com letra grande |
| 41 | "Remover animações" ligado no sistema | As telas trocam sem animação e nada some |

### H. Contas, convites e robustez

| # | O que fazer | O esperado |
| --- | --- | --- |
| 42 | Criar uma conta nova com o outro e-mail e tocar no link de confirmação no celular | O link abre o app (ou a web) e a conta fica confirmada |
| 43 | Família: gerar um convite e colar o link em "Tenho um convite" na conta nova | Entra na Família; a folha de compartilhar funciona |
| 44 | Conta > Telegram > Gerar código > Abrir o Telegram | Abre o @ClarevoBot; "Iniciar" liga a conta |
| 45 | Conta > Assinatura | "Acesso completo", os planos e "No celular, a assinatura é feita pela loja de aplicativos do aparelho", sem botão de assinar |
| 46 | Na conta nova de teste: Conta > Excluir conta (digitar EXCLUIR) | O teclado aparece; termina em "Sua conta foi excluída" |
| 47 | Modo avião e abrir o app | Mensagem clara de sem conexão, sem tela em branco |
| 48 | Girar o celular, voltar com o botão do sistema e trocar de app no meio de um cadastro | Nada se perde |

### I. Relatório de falhas

| # | O que fazer | O esperado |
| --- | --- | --- |
| 49 | Depois da sessão, abrir Issues no projeto do Sentry | Vazio ou só falhas técnicas, **sem** nome, e-mail, valor, endereço de tela com dados nem IP. Se aparecer qualquer dado pessoal, avisar antes do lançamento |

## 2. Só no iPhone (quando houver TestFlight)

| # | O que fazer | O esperado |
| --- | --- | --- |
| 50 | Os itens 1 a 49 com o VoiceOver no lugar do TalkBack e o iCloud no lugar do Google Drive | O mesmo esperado |
| 51 | Widget: tela Hoje, StandBy e tela bloqueada | Com valores ocultos, nada de valor nem nome; ligados, o iOS pode esconder (conferir) |
| 52 | Escolher foto, compartilhar e as telas do sistema dentro do app | Em português |
| 53 | Ler comprovante > "Tirar uma foto" | A câmera abre depois da folha, sem travar |

## 3. Depois, com as lojas

As compras de teste (Android na faixa de teste interno e iPhone no TestFlight) seguem `docs/42`, passo 9, quando o RevenueCat e as
contas das lojas estiverem prontos.

## 4. O que a equipe faz com o resultado

Cada "ok" marca o item correspondente em `docs/04` (os "Teste em aparelho" dos ciclos), `docs/37` (seção 6), `docs/40` (seção 4) e
`docs/21` (seção 6). Cada "falhou" vira correção, com teste automático quando der, e entra no próximo build.
