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
| 12 | Registrar pagamento só aceita PDF; o banco só deixa tirar print | "Ler comprovante de Pix ou pagamento" aceita PDF ou imagem (print ou foto), lida no próprio aparelho (B). No app pelo navegador; no app das lojas, depois de um build novo | pronto |
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
