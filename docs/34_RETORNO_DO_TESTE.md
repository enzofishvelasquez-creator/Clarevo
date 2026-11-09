# Retorno do teste de 31/10/2026 (D-078)

Uma pessoa do teste mandou a Enzo prints, um áudio e um holerite com o que achou confuso e o que gostaria de ter. Ela pediu para saber quando cada sugestão entrar no app, porque várias servem para a divulgação. Esta lista acompanha cada uma.

Situação: **no app** (publicado), **pronto** (no código, esperando o PR e a publicação), **em andamento**, **a fazer**, **com Enzo** (depende dele).

| # | O que a pessoa disse | O que foi feito | Situação |
|---|---|---|---|
| 1 | Tour, cartão "Contas a pagar e lembretes": "Tá muito confusa essa mensagem" | Frases curtas e separadas: anotar as contas que vão vencer, tocar em Já paguei, o lembrete um dia antes | pronto |
| 2 | Tour, cartão "Metas e calculadoras": "veja um plano" não está claro | Diz o que o plano mostra: com um prazo, quanto guardar por mês | pronto |
| 3 | Tour, cartão "Onde achar ajuda": confuso, repete "tela" | Duas frases, "tela" uma vez só | pronto |
| 4 | Calculadora de financiamento: levar o que foi calculado para as contas do mês e dos próximos (áudio) | O botão "Anotar como parcelamento" já existia no fim da página; agora fica logo abaixo do resultado, com uma frase que explica | pronto |
| 5 | Importar: "Não reconheceu o extrato do banco. O arquivo do banco é PDF" | O aviso diz que é PDF (ou planilha de Excel) e como pedir OFX ou CSV ao banco | pronto |
| 6 | Importar o extrato em PDF, que é o que o banco entrega | Importar aceita PDF: cada linha com data, descrição e valor vira lançamento, com o sinal pelo próprio valor ou pela descrição; saldo e total ficam de fora; a pessoa revê tudo antes de importar (A). Leitura genérica, testada com extratos inventados: falta conferir com um extrato real de cada banco | pronto (a conferir com extratos reais) |
| 7 | Convite da empresa: "tem que ser possível colocar ao entrar" | "Tenho um convite da empresa" nas boas-vindas abre o campo do link e leva ao convite antes de criar a conta ou entrar (E) | pronto |
| 8 | "O e-mail para o suporte chegou?" | Conferir a caixa contato@clarevo.app.br | com Enzo |
| 9 | Excluir conta: "várias frases estranhas"; "não é movimento, são movimentações"; "as respostas do plano de guardar"; "depois dos dois-pontos é letra maiúscula" | Itens reescritos sem dois-pontos (pela norma, depois de dois-pontos vai minúscula; tirar os dois-pontos resolve), "o que você guardou ou retirou das metas", "o que você respondeu sobre guardar dinheiro por mês" | pronto |
| 10 | Excluir conta, "O que continua" e "Sua Família": "escrita extremamente confusa" | Frases curtas: o que fica nas cópias de segurança e o que acontece em cada papel na Família | pronto |
| 11 | Reserva mínima: "Guardar quando entrar um valor extra" não salva sem informar valor; lembrete no início para quem escolher | Dá para salvar só essa escolha ("Lembrar quando entrar um valor extra"); o Resumo mostra "Entrou um valor extra" quando o mês tem Renda extra ou recebimentos acima da renda de referência, com "Guardar uma parte", "Agora não" e "Parar de lembrar" (F) | pronto |
| 12 | Registrar pagamento só aceita PDF; o banco só deixa tirar print | "Ler comprovante de Pix ou pagamento" aceita PDF ou imagem (print ou foto), lida no próprio aparelho (B). No app pelo navegador, o seletor aceita os dois; no app de celular, a pessoa escolhe galeria, foto na hora ou PDF (precisa de um build novo para as lojas) | pronto |
| 13 | Holerite: "precisa conseguir ler o valor líquido e a data; no caso de folha é só o mês de competência" | Em Registrar recebimento, o holerite em PDF preenche o valor líquido e "Salário de setembro de 2026" na categoria Salário, e pede o dia | pronto |
| 14 | Comprovante de Pix em imagem | Mesmo caminho do item 12 (B) | pronto |
| 15 | Câmera da nota: "não foca, fica um borrão; só foca depois de sair e voltar" | No navegador, a câmera agora pede foco automático contínuo e resolução maior ao celular | pronto (confirmar no celular depois de publicar) |
| 16 | Câmera que lê a chave de acesso numa faixa, como o app de um shopping | Em "Colar o link ou a chave", "Ler a chave numa foto": a foto da chave é lida no aparelho e os 44 números são conferidos pelo dígito verificador (B) | pronto |
| 17 | Importar o PDF ou a imagem de uma conta, como o boleto do seguro do carro | "Ler boleto" em Anotar conta a pagar: câmera (código de barras), PDF ou foto, ou a linha digitável colada; preenche valor, vencimento e o nome de quem recebe (G) | pronto |
| 18 | "Tá dando muito trabalho para cadastrar toda a vida no app" | É o motivo dos itens 6, 12, 13, 16, 17, 22 e 23 | pronto |
| 19 | "Pra que serve esse somar valores? Precisa explicar" | A soma aberta explica: para quando o valor tem várias partes | pronto |
| 20 | Calculadora de custo: ver quanto custa por dia uma conta mensal ("quanto custa ter a internet por dia") | "Quanto custa por ano?" mostra também o valor por dia, na semana e no mês | pronto |
| 21 | Integração com o WhatsApp | Anotar pelo WhatsApp já está pronto (D-076); espera a liberação da Meta | com Enzo (Meta) |
| 22 | Extrato importado: "identificamos um valor referente à companhia de luz, gostaria de adicionar como conta recorrente?" | No fim da importação, "Contas que se repetem": o mesmo pagamento em 2 meses ou mais vira sugestão de gasto fixo, com o cadastro preenchido (H) | pronto |
| 23 | Extrato importado: "identificamos 300 reais em postos de gasolina, gostaria de adicionar no seu planejamento?" | No fim da importação, "Planejamento por categoria": a média por mês de cada categoria vira sugestão de orçamento, com o valor preenchido (H) | pronto |
| 24 | "Uma leitura inteligente dos extratos, tanto para conta mensal como para planejamento e leitura dos dados" | Itens 22 e 23, por regras simples e sem enviar dados a serviço nenhum | pronto |
| 25 | Post para as redes: "Já pensou em organizar suas finanças usando a câmera do celular?", em reels e carrossel: o diferencial é facilitar a entrada das informações, sem custo, porque notas, comprovantes e extratos já trazem tudo | Texto do carrossel e do reels quando a leitura de boleto e de imagem estiverem no app | a fazer |

## Retorno de 09/11/2026 (segunda pessoa do teste)

Elis mandou a Enzo prints com o que achou confuso e o que gostaria de ter, e pediu aviso quando as mudanças estiverem publicadas ("vou tentar parar pra conferir amanhã de novo"). Mesmas situações da tabela acima. O pacote 1 (D-088) foi feito em 09/11/2026, sem mudança no banco; o pacote 2 espera as decisões do Enzo.

| # | O que a pessoa disse | O que foi feito | Situação |
|---|---|---|---|
| 1 | Salário que cai no fim do mês somou no mês anterior: "é necessário ter a opção de reconhecer esse valor como algo que encontrou para o mês vigente" | Decisão A do pacote 2 (abaixo) | com Enzo |
| 2 | "Ele leu o print do boleto da conta de luz, o que é ótimo, mas a descrição precisa informar isso. Hoje ele só diz ler comprovante Pix ou pagamento" | Em Anotar gasto, a opção passou a "Ler comprovante ou boleto"; o guia e o site dizem que lê boleto e conta de luz | pronto |
| 3 | "O boleto da Protebem, que não tem imagem, só o código de barras e as informações, ele não leu" | O leitor reconhece o boleto pela linha digitável ou pelo código de barras: valor e vencimento do código e o nome do beneficiário; a linha lida diz "Boleto · ... · vence em ..." e avisa que a data é o vencimento | pronto (conferir com a foto do boleto no celular) |
| 4 | Cartão: "uma compra parcelada não foi feita hoje"; importar a fatura reconhecendo as compras que já existem e as parcelas "3/4", todo mês | Decisão B do pacote 2 | com Enzo |
| 5 | Telegram: "Farmácia 41 hoje cartão" virou gasto na conta; "ele não reconhece pagamento em cartão" | Decisão C do pacote 2 | com Enzo |
| 6 | Análises: "as categorias poderiam ter variações de cor" | Decisão D do pacote 2 | com Enzo |
| 7 | Reserva: "se eu coloco que o valor que eu vou guardar é 50, a opção registrar aporte tem que indicar colocar esse valor, mesmo que eu queira editar" | Registrar aporte abre com o valor planejado por mês, editável, com a legenda "Preenchemos com o valor planejado por mês. Pode mudar." | pronto |
| 8 | Calculadora da cota única: "precisa da explicação do que é cota única" | Dica no campo: pagar o ano inteiro de uma vez, em geral com desconto, como no IPVA e no IPTU | pronto |
| 9 | "Precisa explicar melhor essa questão da taxa. É uma afirmação?" | O resultado diz "Nas parcelas há juros embutidos de X ao mês" e a hipótese explica que a taxa é calculada só com os números, não vem do contrato | pronto |
| 10 | Custo da dívida: "precisa informar se a gente inclui o CET no cálculo" | Nota no rotativo e no cheque especial: a conta usa só a taxa de juros; o CET soma IOF e tarifas; a dica do campo diz para usar a taxa de juros | pronto |
| 11 | Plano de dívidas: "muito confusa essa pergunta" (quanto a mais por mês) | Pergunta reescrita: "Além do que já paga, quanto a mais por mês você consegue pôr nas dívidas?", com exemplo e o que acontece em branco | pronto |
| 12 | Multa e juros: "O meu é 20,99. Precisa aceitar" | Juros de 0% a 99,99% ao mês (a multa segue até 20%) | pronto |
| 13 | "E todos esses demais encargos, como juros de mora, de parcelas, não coloca?" | Dica e nota: na fatura do cartão, somar os juros do rotativo com os de mora no campo de juros; o IOF fica de fora. Um modo próprio para a fatura é a decisão G | pronto (dica); com Enzo (modo) |
| 14 | Gasto com data futura: "o mais intuitivo é adicionar aos gastos, com previsão futura, não ter que procurar outra aba ou esperar vencer" | Com data futura, o link "Ainda vai vencer? Anotar como conta a pagar" leva descrição, valor, data e categoria para Anotar conta a pagar | pronto |
| 15 | Plano de dívidas: "é muito confuso saber qual é a indicação, é informação demais junta e repetida... não tem uma indicação do que quitar primeiro" | O resultado começa pelo que as ordens dão (uma frase só quando dão no mesmo) e termina pela referência: quanto antes tudo termina e quanto de juros a menos em relação a só pagar as parcelas; nos detalhes, um bloco só para as duas ordens quando dão no mesmo. Nenhum texto diz qual ordem é a certa (D-040) | pronto |
| 16 | "Qual informação nova ela trouxe? A data do fim das contas já haviam sido informadas quando eu informei que era um gasto parcelado" | A informação nova é a frase da referência (com os números dela: tudo termina 41 meses antes, com R$ 1.495,19 a menos de juros, só por passar a parcela do Acordo para o Empréstimo quando ele terminar) | pronto |
| 17 | Vídeo para o Instagram: salvar uma compra de mercado e ir ao orçamento ver quanto falta; ou um aviso discreto no próprio app ao salvar | Decisões E (aviso) e F (vídeo) do pacote 2 | com Enzo |
| 18 | "Naquele dia, vc recebeu o meu email de teste?" | Conferir a caixa contato@clarevo.app.br | com Enzo |

### Pacote 2: decisões para Enzo (09/11/2026)

Enzo aprovou as sete em 09/11/2026 ("Aprovo", D-089), na ordem E, D, C, B, A, F e G.

| Letra | Decisão | Recomendação da equipe | Tamanho | Situação |
|---|---|---|---|---|
| A | Salário no fim do mês: (1) no recebimento, um ajuste "Este valor é do mês seguinte", mostrado quando a data cai nos últimos 7 dias do mês, respeitado pelo Recebido do Resumo, pela Evolução, pelas Análises e pela exportação (coluna nova e migração); (2) sem mexer no banco, uma dica no formulário sugerindo anotar com a data do dia 1º | Opção 1, só para recebimentos | cerca de 1 dia | a fazer |
| B | Botão "Importar fatura" na tela do cartão; a importação cria a compra com as parcelas que faltam, mantendo a numeração do extrato (3 de 4, 4 de 4) | Fazer: é o que destrava quem já tem cartão | cerca de 1 dia, com migração | a fazer |
| C | "cartão" (ou o nome do cartão) na mensagem do Telegram vira compra no cartão; DESFAZER desfaz | Fazer | meio dia, com migração e a função republicada | pronto (09/11/2026; falta aplicar a migração 0028 e publicar as funções) |
| D | Bolhas das categorias em cinco tons do azul da marca, contraste conferido, a escolhida em lima como hoje | Fazer | meio período | pronto (09/11/2026) |
| E | Ao salvar um gasto com orçamento na categoria, uma linha "Mercado: R$ 1.400,00 de R$ 1.800,00 neste mês (78%)", sempre, não só ao cruzar 80% e 100% | Fazer | pequeno | pronto (09/11/2026) |
| F | Vídeo em formato de reels (1080 por 1920) gravado na web com os dados de demonstração: salvar uma compra de mercado e abrir o orçamento | Fazer depois do pacote 1 | meio período | a fazer |
| G | Modo "Fatura de cartão depois do vencimento" em Multa e juros: rotativo, mora, multa e IOF estimado | Depois do lançamento | meio dia | depois do lançamento |

## Rascunho para as redes (item 25)

Publicar só depois que a leitura de boleto, de print e de holerite estiver no app publicado (depois do PR e da publicação), e conferir as telas antes de gravar. Textos sem nome de banco, de loja nem de produto financeiro.

**Carrossel (6 cartões)**

1. Já pensou em organizar suas finanças com a câmera do celular?
2. Nota fiscal: aponte a câmera para o QR code do cupom. A Clarevo preenche a loja, o valor e a data.
3. Comprovante de Pix: um print basta. A Clarevo lê o valor, a data e quem recebeu ou enviou.
4. Boleto: leia o código de barras ou uma foto. A conta entra nas contas a pagar, com valor e vencimento.
5. Holerite: o valor líquido e o mês de competência vão direto para o seu recebimento.
6. Tudo é lido no seu celular. A imagem não é guardada nem enviada para ninguém. Você confere e salva.

Legenda: As notas, os comprovantes e os boletos já trazem as informações. A Clarevo lê para você, no seu celular, e você só confere. Menos digitação, mais tempo para o que importa.

**Reels (20 a 30 segundos)**

1. (0 a 3 s) Texto na tela: "Anotar gasto à mão? Já pensou em usar a câmera?"
2. (3 a 9 s) Câmera no QR code do cupom; o formulário aparece preenchido. Texto: "Nota fiscal: lida na hora."
3. (9 a 15 s) Print de um Pix escolhido na galeria; aparece "Comprovante lido". Texto: "Comprovante: um print basta."
4. (15 a 21 s) Câmera no código de barras de um boleto; a conta a pagar aparece com valor e vencimento. Texto: "Boleto: vira conta a pagar."
5. (21 a 27 s) Texto na tela: "Tudo lido no seu celular. Nada é guardado nem enviado." Logotipo "clarevo." e o endereço do app.

Gravar com dados fictícios (a demonstração tem nota de exemplo) e sem mostrar nome, CPF, conta ou chave Pix de ninguém.
