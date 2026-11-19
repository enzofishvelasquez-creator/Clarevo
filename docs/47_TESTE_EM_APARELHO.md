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
   extrato do banco (PDF ou OFX), dois ou três prints do extrato e um da fatura do cartão tirados no app do banco (seção K) e um
   segundo e-mail seu para criar uma conta nova.

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
| 5a | Sair; em Entrar, tocar em "Esqueci minha senha", pôr o e-mail e enviar; abrir o e-mail **no mesmo celular** e tocar em "Definir nova senha" | Chega o e-mail "Defina uma nova senha na Clarevo" (de nao-responda@clarevo.app.br; se não chegar em alguns minutos, olhar o spam); o link abre o app na tela "Nova senha" (o celular pode perguntar com qual app abrir: escolher Clarevo); depois de salvar, o app pede para entrar com a senha nova, e ela funciona |
| 5b | Repetir o 5a pela versão web no computador (pedir e abrir o e-mail no mesmo navegador) | O link abre app.clarevo.app.br na tela "Nova senha" e a senha nova funciona no celular também |

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

### J. Investimentos, o que é novo no D-099 (16/11/2026)

Os números seguem depois dos do iPhone para não mudar os anteriores. Excluir os investimentos e as metas de teste no fim.

| # | O que fazer | O esperado |
| --- | --- | --- |
| 54 | Investir > "Definir plano de aportes" > valor por mês > "Salvar plano"; depois "Tirar plano" | Teclado de números com vírgula; o card mostra o plano ao lado do aportado no mês; "Tirar plano" pede confirmação e os investimentos ficam como estão |
| 55 | Com o plano definido e nenhum aporte no mês: Conta > Lembretes do dia a dia > "Aportar nos investimentos" | O aviso chega no dia escolhido para guardar, sem valor, e o toque abre Investir |
| 56 | Novo investimento ligado à reserva (ou a uma meta) > abrir a meta > "Dos investimentos ligados"; depois "Do que eu registro na meta" | A meta mostra "Investimentos ligados" com o valor de hoje; com "Dos investimentos ligados", o valor guardado vira a soma deles; voltar devolve os registros da meta |
| 57 | Investimento em título público (tipo, vencimento e quantidade, por exemplo 0,05) > abrir | O card "Valor pelo preço publicado" mostra o valor, o preço e a data; "Usar este valor" atualiza o investimento; a quantidade aceita vírgula |
| 58 | Investimento em fundo com o CNPJ (14 números) e a quantidade de cotas > abrir; depois um CNPJ com um número errado | "Valor pela cota do fundo" com a cota e a data; o CNPJ errado mostra aviso ao salvar |

### K. O que é novo na rodada de 17/11/2026 (D-104, D-107, D-108, D-111 e D-112)

Os números seguem depois dos da seção J. Precisa das migrações 0039, 0040 e 0041 aplicadas (`docs/05`, passos 12af a 12ah). Excluir os
lançamentos, as contas, os investimentos e as metas de teste no fim e voltar o tema para o de antes.

| # | O que fazer | O esperado |
| --- | --- | --- |
| 59 | Conta > Tema > "Escuro" | O card diz que o tema escolhido vale na próxima abertura e mostra "Aplicar agora"; nada muda nem recarrega sozinho |
| 60 | Tocar em "Aplicar agora"; depois abrir Anotar gasto, o seletor de data e um alerta de confirmação | O app reabre no tema escuro; o teclado, o seletor de data e os alertas também ficam no escuro |
| 61 | Fechar o app de vez e abrir de novo | Continua no escuro desde a abertura |
| 62 | Conta > Tema > "Igual ao aparelho" > "Aplicar agora"; depois trocar o tema do celular, fechar o app de vez e abrir | O app volta a seguir o tema do aparelho |
| 63 | Importar extrato > "Escolher prints" > 2 ou 3 prints do app do banco escolhidos juntos na galeria, com uma parte repetida entre eles | A galeria deixa escolher várias imagens; as linhas aparecem para conferir com "Lido de imagem: confira"; a linha repetida entra uma vez; saldo, limite e botões ficam de fora; nada é gravado antes de importar |
| 64 | Um cartão > "Importar fatura" > prints da fatura do mês, com uma compra parcelada ("3/4" ou "Parcela 3 de 4") | As compras entram na fatura aberta; a parcelada vira compra com as parcelas que faltam |
| 65 | Na conferência de um extrato, uma linha de entrada (rendimento, estorno ou salário) | Vem como recebimento; em Editar, "Tipo da linha" troca entre "Gasto (saída)" e "Recebimento (entrada)" |
| 66 | Depois de importar, abrir um lançamento importado > Editar > Tipo > "Recebimento" | Salva como recebimento, com as categorias de recebimento e a frase do efeito no mês; voltar a "Gasto" também funciona |
| 67 | Conta a pagar em aberto (por exemplo, R$ 150,00 vencendo esta semana) e um gasto já anotado com o mesmo valor > Editar gasto > "O que este gasto pagou?" > a conta | A conta sai de "Ainda a pagar" como paga e nenhum gasto novo aparece em Movimentos; escolher "Nenhuma destas" e salvar devolve a conta para "Ainda a pagar" e mantém o gasto |
| 68 | Gasto em "Crédito e parcelas" > "O que este gasto pagou?" > a fatura fechada de um cartão; depois, no detalhe do gasto, "Desligar da fatura" | A fatura fica paga com o valor e a data do gasto (se for menor, o restante vai para a fatura seguinte); desligar volta a fatura para aberta e o gasto continua em Pago |
| 69 | Anotar gasto > Mercado > Subcategoria "Feira"; depois outro gasto com "Outra" e um nome curto | A subcategoria aparece no detalhe, na lista e na composição de Pago; a "Outra" passa a aparecer nas opções deste aparelho |
| 70 | Registrar recebimento no Pessoal > "Rendimento de investimento" > um investimento > salvar; depois editar o valor e, por fim, excluir o recebimento | Recebido soma o valor uma vez; o investimento mostra o rendimento recebido com o mesmo valor e a mesma data e acompanha a edição; ao excluir, o rendimento sai do investimento |
| 71 | No meio de Anotar gasto, na categoria "Crédito e parcelas", em "O que este gasto pagou?" > "Cadastrar conta a pagar"; preencher e salvar a conta | Volta para o gasto com o que já estava preenchido e o item novo já escolhido |
| 72 | Investir > um investimento de teste que vence daqui a 7 dias, com "Vencimentos dos investimentos" ligado em Conta > Lembretes; quando o aviso chegar, tocar nele | O aviso não mostra valor nem nome na tela bloqueada; o toque abre a tela do lembrete, com o fato e os atalhos |
| 73 | Na tela do lembrete, "Lembrar de novo em 3 dias"; depois "Retomar este lembrete"; depois "Pausar este lembrete por 30 dias"; depois "Retomar este lembrete" | Cada escolha mostra até quando vale e troca o botão por "Retomar este lembrete"; pausado, o cartão do lembrete some do detalhe do investimento; retomar devolve tudo como antes |
| 74 | Investir > o investimento de teste > "Registrar rendimento recebido" > "Somar a uma meta?" > uma meta | Nada vem marcado; com a meta escolhida, a meta ganha um aporte com o mesmo valor e a mesma data |
| 75 | Conta > card do nível > "Ver meu nível" | O texto diz que o nível desce um degrau depois de 60 dias sem anotar nada e volta ao anotar de novo, e a escada mostra a Esmeralda acima do Diamante; nenhum texto diz que o nível nunca desce. O aviso de queda só aparece com o cenário da demonstração na web (`?cenario=nivel`, `docs/48_NIVEIS.md`): no aparelho, conferir só o texto |

### L. Espaço Negócio (D-113, 17/11/2026)

Os números seguem depois dos da seção K. Precisa da migração 0042 aplicada (`docs/05`, passo 12ai). No fim, encerrar o negócio de teste
(Seu negócio > "Encerrar o espaço Negócio") e excluir a retirada e os lançamentos de teste do Pessoal.

| # | O que fazer | O esperado |
| --- | --- | --- |
| 76 | Conta > card "Espaço Negócio" > "Criar o espaço Negócio" > nome "Negócio de teste" > "Criar o espaço Negócio" | O card explica para quem é (CNPJ ou trabalho por conta) e que o plano inclui um negócio por pessoa; depois de criar, o nome aparece no seletor do topo do Resumo, de Movimentos e de Metas, ao lado de "Pessoal" |
| 77 | Escolher o negócio no seletor > Movimentos > "Anotar entrada" de R$ 200,00 em "Vendas"; depois "Anotar saída" de R$ 50,00 em "Material e mercadoria" | A pílula diz "Salvando em Negócio de teste"; as categorias são as do negócio (sem subcategoria); no negócio, o vocabulário é de entradas e saídas (Entrou, Saiu, Sobrou, sem Recebido, Pago nem a renda comprometida); o Resumo do negócio mostra os dois lançamentos, e o Resumo do Pessoal não muda |
| 78 | No negócio, Resumo > card "Seu negócio" > "Ver seu negócio" | Entrou R$ 200,00, Saiu R$ 50,00 e Sobrou R$ 150,00, numa cor só, com a frase de fato ("Neste mês, entrou R$ 150,00 a mais do que saiu."), os últimos meses, as maiores saídas e o lembrete de que a Clarevo não faz contabilidade nem cálculo de impostos; com "Ocultar valores", tudo vira R$ •••• |
| 79 | Em "Seu negócio" > "Retirada para o Pessoal" > R$ 100,00 > "Salvar retirada"; depois, no Pessoal, abrir o recebimento "Retirada de Negócio de teste" e excluir a retirada | O negócio mostra a retirada à parte ("Não entram em Saiu") e Saiu continua R$ 50,00; o Pessoal ganha um recebimento de R$ 100,00 que não se edita; excluir pede confirmação e tira os dois lados juntos |
| 80 | No Pessoal, um gasto comum de teste > detalhe > "Mover para o espaço Negócio" > categoria e conta do negócio > "Mover"; depois, no negócio, "Mover para o Pessoal" | O lançamento sai do Pessoal e aparece no negócio com a categoria escolhida (e volta); um pagamento de conta a pagar ou de fatura não oferece mover |
| 81 | Com o negócio escolhido, abrir Metas e Investir; mandar "15 café" pelo Telegram (se ligado) | Metas e Investir explicam que ficam no Pessoal, com "Ir para o Pessoal"; a anotação do Telegram vai para o espaço ligado ao canal (Pessoal ou Família), nunca para o negócio, e Conta › Telegram não oferece o negócio |
| 82 | Antes do item 76, numa conta só com o Pessoal: Resumo > o "+" ao lado de "Pessoal" (D-113b) | O seletor aparece mesmo só com o Pessoal; o "+" (nome lido "Criar um espaço: Negócio ou Família") abre a folha "Criar um espaço" com "Espaço Negócio" ("Para quem tem CNPJ ou trabalha por conta.") e "Família"; "Espaço Negócio" abre a criação do negócio; "Fechar" não muda nada |
| 83 | Com o negócio criado, Movimentos > "Análises" > tocar na pílula "Pessoal" no alto > escolher o negócio; depois voltar ao Pessoal pela pílula | A pílula tem a seta para baixo e abre "Escolher o espaço" (Pessoal marcado, o negócio e, sem Família, "Criar um espaço" com a Família); escolher troca os números de Análises para os do negócio na mesma tela, e o seletor do Resumo acompanha; num formulário, a pílula não abre nada |

## 2. Só no iPhone (quando houver TestFlight)

| # | O que fazer | O esperado |
| --- | --- | --- |
| 50 | Os itens 1 a 49 e 54 a 83 com o VoiceOver no lugar do TalkBack e o iCloud no lugar do Google Drive | O mesmo esperado |
| 51 | Widget: tela Hoje, StandBy e tela bloqueada | Com valores ocultos, nada de valor nem nome; ligados, o iOS pode esconder (conferir) |
| 52 | Escolher foto, compartilhar e as telas do sistema dentro do app | Em português |
| 53 | Ler comprovante > "Tirar uma foto" | A câmera abre depois da folha, sem travar |

## 3. Depois, com as lojas

As compras de teste (Android na faixa de teste interno e iPhone no TestFlight) seguem `docs/42`, passo 9, quando o RevenueCat e as
contas das lojas estiverem prontos.

## 4. O que a equipe faz com o resultado

Cada "ok" marca o item correspondente em `docs/04` (os "Teste em aparelho" dos ciclos), `docs/37` (seção 6), `docs/40` (seção 4) e
`docs/21` (seção 6). Cada "falhou" vira correção, com teste automático quando der, e entra no próximo build.
