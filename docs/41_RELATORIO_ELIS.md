# Relatório: o que a Elis testou e indicou (30/10 a 09/11/2026)

Pedido de Enzo em 09/11/2026: "monte um relatório com tudo o que a Elis tem trabalhado e indicado nas últimas semanas". Este documento junta os três retornos, o que virou produto a partir de cada um, o que ainda depende de decisão e o que vale pedir a ela daqui para a frente. Os detalhes item a item estão em `docs/34_RETORNO_DO_TESTE.md`; as decisões, em `docs/00_VISAO_E_DECISOES.md` (D-076, D-078, D-080, D-081 e D-088).

**Uma ressalva.** Os retornos de 30/10 e 31/10 estão registrados nos documentos como "uma pessoa do teste", sem nome. Este relatório os atribui à Elis por duas ligações diretas: em 31/10 a pessoa perguntou "O e-mail para o suporte chegou?" e em 09/11 a Elis perguntou "Naquele dia, vc recebeu o meu email de teste?"; em 30/10 a pessoa contou que anotava gastos mandando mensagem no WhatsApp e em 09/11 a Elis citou "como eu fiz com o chat daquela vez". Se não for a mesma pessoa, vale separar as duas primeiras seções.

## 1. Como ela usa o app

- **Onde:** no celular Android, pelo navegador (`app.clarevo.app.br`), com a própria conta e dados de verdade; e pelo Telegram, com o @ClarevoBot ligado à conta (mensagem de 06/11/2026, "Farmácia 41 hoje cartão").
- **Situação financeira que aparece nos prints:** salário que cai nos últimos dias do mês (R$ 4.092,72 em outubro), cartão de crédito com compras parceladas em mais de um cartão (um cartão de limite R$ 820,00, fatura fecha dia 5 e vence dia 10), boletos (conta de luz e um plano de assistência), um acordo em 9 parcelas de R$ 265,00 a 1% ao mês e um empréstimo em 60 parcelas de R$ 100,00 a 1,88% ao mês, fatura de cartão com rotativo a 20,90% ao mês, reserva para imprevistos com plano de R$ 50,00 por mês e meta de R$ 2.750,00.
- **O que ela testa de verdade:** os caminhos de entrada de dados (comprovante, boleto, holerite, extrato, Telegram), as calculadoras de dívida e o começo de uso de quem já tem cartão e contas em andamento. É o perfil P2 ou P3 do kit do teste com 5 pessoas (`docs/27`): carteira assinada ou renda que varia, cartão todo mês, com parcelas.
- **Além do teste:** ela acompanha o conteúdo do Instagram. Em 31/10 sugeriu o post "Já pensou em organizar suas finanças usando a câmera do celular?" (reels e carrossel) e em 09/11 pediu um vídeo para publicar "ali", com a compra de mercado e o orçamento, e sugeriu o aviso discreto ao salvar o gasto.

## 2. Linha do tempo

| Data | O que ela mandou | O que virou |
|---|---|---|
| 30/10/2026 | Contou que anotava gastos mandando mensagem no WhatsApp | Anotar pelo WhatsApp, fase 1, só texto e sem custo (D-076). Com a restrição da Meta, o mesmo recurso saiu pelo Telegram (D-080, 01/11) e o Telegram virou o canal de mensagens para todas as pessoas (D-081, 03/11) |
| 31/10/2026 | Prints, um áudio e um holerite, com textos confusos e o pedido de dar menos trabalho a anotar ("tá dando muito trabalho para cadastrar toda a vida no app") | 25 pontos (D-078): 22 prontos no código no mesmo dia e no seguinte, 1 a fazer (o post para as redes, que espera a leitura de boleto e de imagem publicada) e 2 com Enzo (o e-mail para o suporte e a Meta) |
| 06/11/2026 | Usou o Telegram ligado à conta: "Farmácia 41 hoje cartão" | Mostrou que a mensagem não reconhece "cartão" (ponto 5 de 09/11) |
| 09/11/2026 | Sequência de prints com 18 pontos, e o aviso de que quer conferir de novo no dia seguinte | Pacote 1 (D-088): 11 pontos prontos no código no mesmo dia, sem mudança no banco. Pacote 2: 7 pontos que dependem de decisão de Enzo (seção 5) |

## 3. O que ela indicou, por tema, e o que foi feito

### 3.1 Entrar com os dados sem digitar (o tema principal dela)

| O que ela disse | O que foi feito | Situação |
|---|---|---|
| Registrar pagamento só aceitava PDF; o banco só deixa tirar print | "Ler comprovante" aceita PDF ou imagem (print ou foto), lida no próprio aparelho (exceção à regra "sem IA", só para ler texto em imagem no aparelho) | no app |
| Comprovante de Pix em imagem | Mesmo caminho | no app |
| Holerite: ler o valor líquido e o mês de competência | Holerite em PDF preenche o valor líquido e "Salário de setembro de 2026" na categoria Salário, e pede o dia | no app |
| Importar o extrato em PDF, que é o que o banco entrega | Importar aceita PDF (a conferir com extratos reais de cada banco) | no app |
| Boleto do seguro do carro em PDF ou imagem | "Ler boleto" em Anotar conta a pagar: câmera, PDF, foto ou a linha digitável colada | no app |
| Câmera que lê a chave da nota numa faixa | "Ler a chave numa foto" | no app |
| Câmera da nota não focava | Foco contínuo e resolução maior no navegador | no app (confirmar no celular) |
| Sugestões a partir do extrato: conta de luz como conta fixa, posto de gasolina como orçamento | "Contas que se repetem" e "Planejamento por categoria" no fim da importação | no app |
| "Ele leu o print da conta de luz, mas a descrição precisa informar isso" | A opção de Anotar gasto passou a "Ler comprovante ou boleto"; guia e site dizem que lê boleto e conta de luz | pronto (09/11) |
| "O boleto da Protebem, só o código de barras, ele não leu" | O leitor reconhece o boleto pela linha digitável ou pelo código de barras: valor e vencimento do código, nome do beneficiário, com o aviso de que a data é o vencimento | pronto (09/11) |
| Importar a fatura do cartão todo mês, reconhecendo as compras e as parcelas "3/4" | Decisão B do pacote 2 | com Enzo |
| "Farmácia 41 hoje cartão" no Telegram virou gasto na conta | Decisão C do pacote 2 | com Enzo |

### 3.2 Textos e explicações

| O que ela disse | O que foi feito | Situação |
|---|---|---|
| Três cartões do tour confusos | Frases curtas e separadas | no app |
| Excluir conta e Família com "escrita extremamente confusa", "não é movimento, são movimentações" | Textos reescritos | no app |
| "Pra que serve esse somar valores?" | A soma aberta explica para que serve | no app |
| "Precisa da explicação do que é cota única" | Dica no campo da calculadora | pronto (09/11) |
| A taxa do parcelado: "é uma afirmação?" | "Nas parcelas há juros embutidos de X ao mês" e a explicação de que a taxa é calculada só com os números, não vem do contrato | pronto (09/11) |
| "Precisa informar se a gente inclui o CET no cálculo" | Nota no rotativo e no cheque especial: só a taxa de juros, sem o CET | pronto (09/11) |
| Pergunta "quanto a mais por mês" confusa | Reescrita, com exemplo e o que acontece em branco | pronto (09/11) |
| Plano de dívidas: "informação demais junta e repetida", "qual informação nova ela trouxe?" | O resultado começa pelo que as ordens dão e termina pela referência em uma frase: com os números dela, tudo termina 41 meses antes, com R$ 1.495,19 a menos de juros, só por passar a parcela do acordo para o empréstimo quando ele terminar. As duas ordens viram um bloco só quando dão no mesmo | pronto (09/11) |

### 3.3 Fluxos e atalhos

| O que ela disse | O que foi feito | Situação |
|---|---|---|
| Levar o que a calculadora de financiamento calculou para as contas do mês (áudio) | "Anotar como parcelamento" logo abaixo do resultado | no app |
| Quanto custa por dia uma conta mensal | "Quanto custa por ano?" mostra por dia, semana e mês | no app |
| Convite da empresa "tem que ser possível colocar ao entrar" | "Tenho um convite da empresa" nas boas-vindas | no app |
| Reserva: "Guardar quando entrar um valor extra" não salvava sem valor | Dá para salvar só a escolha, e o Resumo lembra quando entra um valor extra | no app |
| Gasto com data futura: "o mais intuitivo é adicionar aos gastos, com previsão futura" | Link "Ainda vai vencer? Anotar como conta a pagar", já com descrição, valor, data e categoria | pronto (09/11) |
| "Registrar aporte tem que indicar o valor que eu defini, mesmo que eu queira editar" | O aporte abre com o valor planejado por mês preenchido, editável | pronto (09/11) |
| Multa e juros: "O meu é 20,99. Precisa aceitar"; "e os demais encargos?" | Juros até 99,99% ao mês, com a dica de somar rotativo e mora; o IOF fica de fora. Um modo próprio para a fatura é a decisão G | pronto (09/11); modo com Enzo |

### 3.4 O que mexe no modelo do app (depende de você)

| O que ela disse | Por que depende de decisão |
|---|---|
| Salário do fim do mês deveria contar no mês seguinte | Hoje tudo conta pela data em que o dinheiro entrou (caixa). Reconhecer o valor no mês seguinte pede um ajuste no recebimento e mudança no banco (decisão A) |
| Variações de cor nas bolhas das categorias | A D-059 escolheu só o azul da marca e o lima da escolhida; mudar é decisão de identidade (decisão D) |
| Aviso discreto do orçamento ao salvar o gasto, sempre | A D-041 escolheu avisar só ao cruzar 80% e 100% (decisão E) |

## 4. Em números

| | 31/10/2026 | 09/11/2026 | Total |
|---|---|---|---|
| Pontos levantados | 25 | 18 | 43 |
| Prontos no código | 22 | 11 | 33 |
| A fazer pela equipe (sem decisão pendente) | 1 (post para as redes) | 0 | 1 |
| Dependem de decisão ou ação de Enzo | 2 | 7 | 9 |

Das decisões maiores do produto nas últimas semanas, três nasceram dela: anotar por mensagem (WhatsApp e depois Telegram), a leitura de texto em imagem no aparelho (print de comprovante, chave da nota, boleto) e o pacote de leitura de holerite, boleto e extrato em PDF. É a pessoa de fora com mais influência no que entrou no app desde 30/10.

## 5. O que está com você

1. **Decisões do pacote 2** (tabela em `docs/34`, seção "Pacote 2"): A salário do fim do mês (recomendo a opção 1, só para recebimentos, cerca de 1 dia, com migração); B importar a fatura com parcelas "3/4" (recomendo, cerca de 1 dia, com migração); C "cartão" no Telegram (recomendo, meio dia, com migração e a função publicada de novo); D tons de azul nas bolhas (recomendo, meio período); E aviso discreto do orçamento ao salvar (recomendo, pequeno); F vídeo em formato de reels gravado na web com a demonstração (o gerador do Instagram, `scripts/gerar-instagram.js` e `scripts/gravar-redes.js`, já produz rascunhos em MP4 de 1080 por 1920; meio período para a peça nova); G modo "Fatura de cartão depois do vencimento" na calculadora (depois do lançamento).
2. **A resposta sobre o e-mail de teste** (perguntas de 31/10 e de 09/11): conferir a caixa contato@clarevo.app.br.
3. **Avisar a Elis quando o merge do pacote 1 sair:** ela quis conferir no dia seguinte. A web atualiza sozinha depois do merge.
4. **O post para as redes** (item 25 de 31/10) pode sair agora: a leitura de boleto, de print e de holerite já está publicada e a leitura de boleto pelo código entra com o pacote 1. O rascunho do carrossel e do reels está em `docs/34`, seção "Rascunho para as redes".

## 6. O que ela pode conferir (mensagem, depois dos dois merges, 10/11/2026)

> Oi, Elis! Tudo o que você apontou nos testes já está no ar. É só recarregar o app no navegador. O que dá para conferir:
>
> 1. **Boleto:** em Anotar gasto, "Ler comprovante ou boleto", com uma foto nítida do boleto da Protebem mostrando a linha digitável inteira. Deve preencher o valor, o vencimento e o nome de quem recebe.
> 2. **Gasto com data futura:** aparece "Ainda vai vencer? Anotar como conta a pagar", que leva tudo para as contas a pagar.
> 3. **Reserva:** em Registrar aporte, o valor planejado por mês já vem preenchido.
> 4. **Calculadoras:** a explicação da cota única, a frase da taxa, a nota do CET, os juros aceitando 20,99 com a dica de somar rotativo e mora, e o plano de dívidas mais direto.
> 5. **Salário do fim do mês:** em Registrar recebimento, com a data nos últimos 7 dias do mês, aparece "Este valor é do mês seguinte". Ligado, o valor conta no Resumo do mês seguinte.
> 6. **Fatura do cartão:** na tela do cartão, "Importar fatura". A linha com "3/10" entra como a compra com as parcelas que faltam, na numeração da fatura.
> 7. **Telegram:** "farmácia 41 cartão" agora vira compra no cartão. Com mais de um cartão, ponha o nome dele no fim, por exemplo "farmácia 41 cartão azul". DESFAZER desfaz.
> 8. **Orçamento:** ao salvar um gasto numa categoria com orçamento, aparece uma linha como "Mercado: R$ 1.400,00 de R$ 1.800,00 em novembro (78%)".
> 9. **Análises:** as bolhas das categorias ganharam tons de azul.
>
> O modo próprio para a fatura do cartão vencida em Multa e juros fica para depois do lançamento. Se puder, me conta como foi o boleto pela foto no celular. Agradeço muito pelos testes, eles mudaram muita coisa no app!

## 7. O que vale pedir a ela

- **Extratos e comprovantes reais** para o aceite da leitura em PDF (item 6 de 31/10 está "a conferir com extratos reais"; P-026 pede de 5 a 10 comprovantes): pode mandar com os dados pessoais cobertos.
- **Uma sessão do teste formal** do kit de 5 pessoas (`docs/27`), como P2 ou P3: ela já conhece o app, então vale como a pessoa de "segunda visita", para medir o que ficou claro depois das mudanças.
- **Conferir no celular** o que só dá para ver no aparelho: a câmera da nota focando e a leitura do boleto pela foto.
- **O retorno sobre o vídeo** (decisão F): o que ela quer mostrar e em que ordem, para o roteiro do rascunho em MP4.

## 8. Fontes deste relatório

- `docs/00_VISAO_E_DECISOES.md`: D-076, D-078, D-080, D-081 e D-088.
- `docs/34_RETORNO_DO_TESTE.md`: as duas tabelas item a item e o rascunho para as redes.
- `docs/04_ROTEIRO_LANCAMENTO.md`: blocos "Retorno do teste de 09/11/2026, pacote 1 (D-088)".
- Os prints encaminhados por Enzo em 09/11/2026 (não ficam no repositório).
