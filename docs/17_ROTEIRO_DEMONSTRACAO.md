# Clarevo · Roteiro da demonstração ao vivo (10 minutos)

20/10/2026, atualizado em 21/10/2026 (D-063 item 1: Evolução com "Renda comprometida" e "Guardado em metas" e o relatório do RH no painel da empresa). Roteiro para Enzo mostrar o app a quem investe, ao vivo, pelo celular ou pelo computador. Baseado só no que existe no código e em `docs/00_VISAO_E_DECISOES.md` (as decisões vêm citadas, como D-056). Quando a resposta depende de algo que ainda não foi feito ou decidido, o texto diz. Se perguntarem o que não está aqui, a resposta certa é "vou confirmar e te retorno".

A versão gravada, de cerca de 2 min 55 s (175 s, 13,9 MB, 12 passos), para enviar pelo WhatsApp, sai de `node scripts/video-demonstracao.js --saida <pasta>` (usa a mesma demonstração, só com dados fictícios). Serve também de plano B. Os passos do vídeo estão na seção 6.

## 1. Antes de começar

### Endereços

| O quê | Endereço | Observação |
|---|---|---|
| Demonstração | https://demo.clarevo.app.br (ou https://clarevo-demo.pages.dev) | Dados fictícios e identificados ("Demonstração · Pessoal" no alto de cada tela). É a única que se usa na apresentação. |
| Cenário da Evolução | https://demo.clarevo.app.br/?cenario=evolucao | Pago de janeiro a junho de 2026, com o "Reparo do carro" de R$ 4.400,00 em abril. Serve só para a tela Evolução: nele o Resumo de outubro fica zerado. |
| Painel da empresa | sem endereço próprio | Resumo › avatar "MA" (canto superior direito) › Conta › "Abrir painel da empresa". Só existe na web, e a demonstração mostra a "Empresa Exemplo (demonstração)". |

Não use `app.clarevo.app.br` (nem `clarevo.pages.dev`) na apresentação: é a versão com login real (`docs/07_PUBLICACAO_WEB.md`).

### Celular ou computador

- **Celular:** abra o endereço no navegador, com o aparelho em pé. As telas 1 a 8 e o painel da empresa funcionam assim. A versão web está preparada para ser adicionada à tela inicial, mas para a demonstração basta o navegador.
- **Computador:** deixe a janela estreita (cerca de 390 pontos de largura) para ver o app como no celular. O painel da empresa também aparece bem em janela larga, que é como o RH o usaria.
- Lembretes, widget e biometria não funcionam na web (dependem do app nas lojas, `docs/00` D-025 e D-052). Não os apresente como algo que dá para ver agora.

### Preparo, 5 minutos antes

1. Abra duas abas do navegador: **A**, a demonstração normal, e **B**, o cenário `?cenario=evolucao`. Cada aba é uma demonstração independente, que vive só na memória dela. Recarregar uma aba a recria do zero (o gasto que você anotou some).
2. Em cada aba, toque em "Ver demonstração com dados fictícios". Na primeira vez, o Resumo abre um tour de 5 cartões ("1 de 5. Resumo do mês"): toque em "Pular".
3. Brilho no máximo, "não perturbe" ligado, tela sem bloqueio automático.
4. Plano B para o caso de a internet cair: o vídeo no celular e as capturas em `docs/lojas/capturas/`.
5. Nada de conta real: a demonstração nunca grava fora do aparelho.

### Números fictícios para ter à mão

| Onde | Valores |
|---|---|
| Resumo de outubro (07/10/2026) | Recebido R$ 6.000,00, Pago R$ 3.900,00, Diferença do mês R$ 2.100,00, Ainda a pagar R$ 650,00, renda comprometida 52,5% |
| Depois de anotar a "Feira de sábado" | Pago R$ 3.986,40, Diferença R$ 2.013,60 |
| Cartão Exemplo | Fatura de novembro R$ 550,00, limite usado R$ 2.300,00 de R$ 5.000,00 |
| Cenário da Evolução, 12 meses | Média R$ 4.125,00 e mediana R$ 3.425,00 (6 de 6 meses). Sem abril: média R$ 3.390,00 e mediana R$ 3.400,00 (5 de 6). Total R$ 24.750,00 |
| Cenário da Evolução, "Renda comprometida" e "Guardado em metas" | Não há renda de referência nem meta nesse cenário: o primeiro mostra "Sem base para estes meses" (com "Informar renda de referência") e o segundo "Sem registros nestes meses" (com "Criar meta"). Nunca aparece um zero no lugar |
| Metas | Reserva para imprevistos R$ 3.500,00 de R$ 22.500,00 (15%), plano de guardar R$ 500,00 por mês |
| Painel da empresa | 40 vagas, 18 em uso, 22 livres. Uso do app: 6 convites, 12 licenças ativas, 3 encerradas |
| Relatório de adesão (planilha) | Arquivo `clarevo-relatorio-adesao-2026-10-07.csv`, com o contrato (Individual, 40 vagas) e as contagens 40, 6, 12 e 3, sem nenhum e-mail |

## 2. Roteiro

| Tempo | Tela | Duração |
|---|---|---|
| 0:00 | Abertura | 0:30 |
| 0:30 | 1. Resumo | 0:50 |
| 1:20 | 2. Anotar gasto | 1:00 |
| 2:20 | 3. Contas a pagar | 0:50 |
| 3:10 | 4. Cartões e a fatura | 0:50 |
| 4:00 | 5. Análises | 0:50 |
| 4:50 | 6. Evolução (aba B) | 1:45 |
| 6:35 | 7. Metas | 0:30 |
| 7:05 | 8. Aprender | 0:35 |
| 7:40 | 9. Painel da empresa e relatório do RH | 1:10 |
| 8:50 | 10. Quem vê estes dados? | 0:30 |
| 9:20 | Fechamento e perguntas | 0:40 |

**Abertura (0:30).** Aba A, na tela "Mais clareza para decidir".
- Diga: "A Clarevo ajuda a entender o próprio mês: o que entrou, o que foi pago, o que vence e o que é só previsão. Tudo o que vocês vão ver é fictício, e a tela diz isso."
- Aponte a frase da tela: "Seus registros pessoais são só seus. Se uma empresa oferecer o plano, ela não vê suas finanças."
- Toque em "Ver demonstração com dados fictícios" e, se aparecer o tour, em "Pular".

**1. Resumo (0:50).**
- Mostre o topo: "Diferença do mês R$ 2.100,00", "Recebido menos pago até 07/10 · não é saldo". Role até "Pagamentos do mês" e volte.
- Diga: "Recebido menos pago. Não é saldo de conta, e o app escreve isso na tela. O que ainda vai vencer fica separado, como previsto: R$ 650,00."

**2. Anotar gasto (1:10).**
- Toque em "Anotar gasto". Digite "Feira de sábado" e "86,40", escolha a categoria "Mercado" e toque em "Salvar gasto". O app responde "Mercado chegou a 82% do orçamento de outubro." Toque na aba Resumo: Pago e Diferença já mudaram.
- Diga: "Descrição, valor e categoria. O gasto entra no mês da data do pagamento, e aqui fica só na memória desta demonstração."
- Se perguntarem pela nota fiscal: está no alto do formulário ("Escanear nota fiscal"). Ver a pergunta C3 sobre o que foi testado.

**3. Contas a pagar (0:50).**
- No Resumo, toque no card "Ainda a pagar neste mês". Mostre "A vencer em outubro" e o botão "Já paguei" (sem tocar). Role até "Próximos meses" e pare em "Fatura Cartão Exemplo, vence segunda, 11/01 (próximo dia útil)", com "Não é dia útil · vencimento anotado: domingo, 10/01".
- Diga: "Gastos fixos, parcelas e faturas viram contas a pagar. Se o vencimento cai em fim de semana ou feriado nacional, o app avisa o próximo dia útil e não muda a data anotada." (D-060 e D-061)

**4. Cartões e a fatura (0:50).**
- Aba Movimentos › "Cartões" › "Cartão Exemplo" › "Fatura de novembro". Role até "Como o total é formado".
- Diga: "A compra no cartão entra na fatura e só vira Pago quando a fatura é paga. Por isso a fatura nunca conta duas vezes. O app guarda o apelido e o final do cartão, nunca o número, a validade nem o código." (D-037)

**5. Análises (0:50).**
- Aba Movimentos › "Análises" › "Categorias" › "Bolhas" › toque em "Moradia". Se der tempo, mostre as abas "Próximos meses" e "Orçamento".
- Diga: "Só leitura, nada é gravado. As bolhas mostram o peso de cada categoria, as barras comparam com mais precisão, e tocar numa categoria abre os lançamentos do mês." (D-059)

**6. Evolução (1:30).** Troque para a aba B.
- Aba Movimentos › "Evolução" › "12 meses". Toque em abril: R$ 7.800,00, com o "Reparo do carro" de R$ 4.400,00. Role até a média e a mediana (R$ 4.125,00 e R$ 3.425,00). Abra "Entender o que mudou". Desligue "Mostrar este mês na comparação": média R$ 3.390,00 e mediana R$ 3.400,00.
- Diga: "Um gasto grande distorce a média. Dá para tirar o mês da comparação sem apagar nada: os lançamentos e o total ficam, só a média e a mediana mudam. E 'Entender o que mudou' descreve a diferença entre dois meses sem dizer que algo foi a causa." (D-057)
- Volte ao topo e mostre o seletor: além de "Recebido" e "Pago", ele tem "Renda comprometida" e "Guardado em metas" (D-062). Toque em cada um e volte a "Pago" (abril continua fora da comparação, porque a escolha vale só para Pago). Os dois valem só para meses já fechados, e cada um escreve a própria base no subtítulo. Nesta aba não há renda de referência nem meta, então a tela diz "Sem base para estes meses" e "Sem registros nestes meses".
- Diga: "O mesmo gráfico mostra também quanto da renda de referência estava ligado a contas e quanto foi guardado nas metas, só de meses fechados. Sem a renda ou sem a meta, a tela diz que não há base e não inventa um zero." (D-062)
- Aviso: o Resumo desta aba está zerado. Vá direto a Movimentos.

**7. Metas (0:35).** Volte para a aba A.
- Aba Metas. Mostre a "Reserva para imprevistos" (15%), o "Seu plano de guardar" e a "Viagem de férias".
- Diga: "Meta com valor, prazo e quanto guardar por mês. O app faz a conta do prazo, mas não indica onde aplicar o dinheiro." (D-027 e D-036)

**8. Aprender (0:40).**
- Aba Aprender › card "Neste mês" › "13º salário". Role até "Exemplo" e "Fontes" (cada fonte traz "Consultada em 15/10/2026").
- Diga: "Educação financeira na hora certa: temas de época, com exemplo calculado e fonte pública datada. Não recomenda produto nem oferece crédito, e o app não registra o que a pessoa lê nem o que busca." (D-032 e D-053)

**9. Painel da empresa (0:55).**
- Resumo › avatar "MA" › Conta › "Abrir painel da empresa". Mostre o "Contrato" e role até "Uso do app".
- Diga: "A empresa paga o benefício e administra vagas e licenças. Vê os e-mails que ela mesma convidou e a situação de cada licença. Não vê quem usa o app, nem quando, e nenhum valor, categoria, meta, conta ou cartão, nem somado." (D-056)
- Role até "Relatório de adesão" e toque em "Baixar relatório em planilha (CSV)": o app responde "Relatório baixado. Confira a pasta de downloads." A caixa "Incluir a lista de licenças" começa desmarcada, e sem ela o arquivo tem só o contrato e as quatro contagens, sem e-mail. Não toque em "Baixar relatório em PDF" ao vivo: ele abre a página de impressão em outra janela, e o navegador pode pedir para permitir janelas.
- Diga: "Para a reunião com o RH, o relatório leva o contrato e as contagens de licenças, o mesmo que o painel mostra. O arquivo é montado neste navegador, e a Clarevo não guarda cópia. O rodapé repete que a empresa não vê dados financeiros de ninguém, nem somados." (D-062)
- A empresa e as pessoas da demonstração são fictícias, e a tela diz: "Nada é gravado fora deste aparelho."

**10. Quem vê estes dados? (0:30).**
- Aba Resumo › role até o fim › "Quem vê estes dados?".
- Diga: "No Pessoal, entre as pessoas do app, só você vê, anota, edita e exclui. A equipe da Clarevo não olha os dados no dia a dia. A permissão é conferida no banco a cada leitura, não só escondida na tela."

**Fechamento (0:50).**
- Diga: "Hoje existe o produto funcionando em demonstração, com as regras financeiras e as permissões testadas. O que falta para chegar às pessoas é, em boa parte, de fora do código: contas das lojas, política de privacidade e termos com advogado, teste com pessoas reais e preço." Abra para perguntas.

## 3. Perguntas comuns e respostas

### Privacidade e empresa

**A1. Quem vê os dados de uma pessoa?**
No Pessoal, só ela. A regra é validada no banco (permissões por linha e funções), e a escrita só passa por funções do banco; não é só uma tela escondida (D-012). Na Família (até 6 pessoas), cada pessoa vê o que o papel permite: titular, "anota e vê" ou "só vê". Entrar numa Família não mostra o Pessoal de ninguém (D-055).

**A2. O que a empresa que oferece o benefício vê?**
Vê os e-mails que ela mesma convidou, a situação de cada licença (convite enviado, ativa ou encerrada), as datas e as contagens de vagas, convites, licenças ativas e encerradas. Não vê quem usa o app depois de aceitar, nem quando. Não vê valores, categorias, metas, contas, cartões nem a Família de ninguém, nem somados (D-006 e D-056). O indicador "pessoas que entraram no mês" foi retirado na revisão de segurança de 16/10/2026, pelo risco de identificar pessoas.

**A3. E quando a pessoa sai da empresa?**
A licença termina e a pessoa mantém 30 dias de acesso pleno. Depois passa ao plano gratuito, com leitura do histórico. Nada é apagado nem passa para a empresa (D-056). A trava de recursos depois dos 30 dias entra junto com a cobrança, então hoje o que existe é o prazo registrado.

**A4. Que dados sensíveis o app guarda?**
Não guarda número completo do cartão, validade nem código de segurança (só apelido e final). Da nota fiscal guarda só o resumo (SHA-256) da chave, nunca o CPF. Dos convites guarda só o resumo do código. Não pede senha de banco e avisa para não informá-la a ninguém em nome da Clarevo.

**A5. A pessoa consegue levar ou apagar os dados?**
Sim. "Exportar meus dados" gera planilha (CSV) ou resumo em PDF. "Excluir minha conta" apaga o Pessoal de verdade e encerra a licença. Os prazos de guarda e os textos finais estão marcados como "a confirmar com advogado" (D-058).

**A6. Quão seguro e testado é?**
Em 20/10/2026, 2.056 testes automatizados das regras financeiras e de texto passaram (`npm test`). Há também testes do banco (`supabase/tests`) e um roteiro automatizado das telas da versão web. Houve uma revisão de segurança em 16/10/2026 (D-056). Não há registro de auditoria externa nos documentos.

**A7. Está em conformidade com a LGPD?**
O desenho segue minimização: a empresa não acessa finanças, o app não registra leituras nem buscas e existe exclusão da conta. Mas a política de privacidade, os termos, a página pública de exclusão e a definição de papéis (a empresa só paga e a Clarevo é controlador) dependem de advogado e ainda não existem (D-056 item M-5 e `docs/16_PUBLICACAO_LOJAS.md`, seção 9). Não afirme conformidade.

### Integração bancária

**B1. O app conecta com o banco?**
Não. A integração bancária está fora do ciclo atual (D-008). A pesquisa de 11/10/2026 (`docs/11_INTEGRACAO_BANCARIA.md`) apontou fornecedores autorizados do Open Finance a partir de cerca de R$ 2.500 por mês (valor de página de preços lida por busca, a confirmar em proposta) e uma revisão do Banco Central sobre as parcerias, com conclusão prevista para dezembro de 2026. Enzo decidiu não investir nisso agora.

**B2. Então como os dados do banco entram?**
Por arquivo, sob controle da pessoa. Em Movimentos › Organizar › "Importar extrato ou fatura", ela escolhe o OFX ou a planilha que baixou no banco; as linhas aparecem em "A revisar", e só o que ela confirma vira lançamento (D-048). Para Pix, TED, boleto e débito, lê o comprovante em PDF (D-051). A senha do banco nunca passa pelo app.

**B3. Vão integrar com os bancos depois?**
É o caminho possível, não um compromisso. A recomendação do memorando é um parceiro regulado (Pluggy como primeira escolha, Belvo como segunda), com protótipo no ambiente de testes antes de qualquer contrato, nunca raspagem de tela. Depende de decisão e verba de Enzo, de contrato com cláusula de dados, de relatório de impacto e das novas regras do Banco Central. Não dê prazo.

**B4. O que se perde com a importação de arquivo?**
Não é automática, não traz saldo nem investimentos e depende de o banco oferecer OFX ou planilha (ou PDF com texto, no caso do comprovante).

### Lojas e lançamento

**C1. O app está nas lojas?**
Não. Nada foi enviado à Apple nem ao Google. Está pronto o que não depende de conta: configuração de build, ícones, capturas, textos da ficha e respostas de privacidade (D-060, `docs/16`). Faltam as contas de desenvolvedor (dependem de CNPJ, domínio e de uma pessoa responsável, P-006), a política de privacidade e os termos, o primeiro build de verdade, o teste em aparelho e o teste de usabilidade com pessoas (`docs/15`). Custos previstos: Apple US$ 99 por ano e Google US$ 25, uma vez (`docs/04`).

**C2. Dá para usar hoje?**
A demonstração, sim. A versão web com login real existe, mas ainda não foi aberta a outras pessoas: faltam domínio e e-mail próprios e o plano Pro do Supabase (`docs/07`). As migrações mais recentes do banco ainda precisam ser coladas e conferidas no Supabase de produção (`docs/16`, seção 9, e D-060).

**C3. E a leitura de nota fiscal e de comprovante?**
Existe, mas foi testada só com páginas e PDFs sintéticos. A validação com cupons e comprovantes reais é uma pendência (P-025 e P-026).

**C4. Quais são os próximos passos?**
1. Contas Apple, Google e Expo, domínio e e-mail (P-006 e P-008).
2. Política de privacidade, termos e página de exclusão, com advogado.
3. Primeiro build no EAS, TestFlight e teste interno do Google.
4. Teste de usabilidade com 5 pessoas e teste em aparelho.
5. Validar as leituras com documentos reais.
6. Preço e cobrança (P-005).
7. Decidir sobre a integração bancária, com a revisão do Banco Central em vista.

### Produto e negócio

**D1. Como a Clarevo ganha dinheiro?**
Ainda não está definido. O desenho é de benefício pago por empresas (uma vaga por pessoa que recebe) e plano para pessoas e famílias. Preços e limites dos planos são pergunta aberta (P-005), e a cobrança e a trava por plano ainda não existem. A Família está aberta a todas as pessoas durante o piloto (D-055).

**D2. Quantas pessoas usam?**
Nenhuma pessoa real ainda: só a demonstração. O app não registra leituras nem buscas, e a empresa nem vê o uso (D-056). Não cite números.

**D3. Usa inteligência artificial? Recomenda investimento ou crédito?**
Não. IA e recomendação de produtos financeiros estão fora do ciclo. Aprender traz conteúdo educativo com fonte pública, e as calculadoras e o simulador usam só os números que a pessoa informa.

**D4. Que tecnologia usa?**
Expo (React Native), um código para iOS, Android e web, e Supabase (Postgres, autenticação e permissões por linha) (D-003 e D-004). O dinheiro é guardado em centavos inteiros, e as regras financeiras ficam num pacote próprio, repetidas e validadas no banco.

## 4. O que NÃO prometer

- **Integração bancária automática**, com ou sem data. Hoje existe importação de arquivo e de comprovante em PDF.
- **Data ou garantia de publicação nas lojas.** Nenhuma conta existe, e a aprovação da Apple pode levar dias.
- **Conformidade com a LGPD ou parecer jurídico.** Política, termos e a definição de controlador e pagadora dependem de advogado.
- **Segurança absoluta, criptografia ponta a ponta ou "ninguém consegue ver".** As permissões são conferidas no banco e testadas, mas os dados ficam no banco do Supabase, e quem administra o projeto tem acesso técnico a ele (um ponto que ainda precisa constar da política de privacidade). Diga só o que o produto faz: não há tela nem consulta que mostre os dados de uma pessoa à empresa ou a outra pessoa.
- **Usuários, uso, retenção ou receita.** Não há pessoas reais nem medição de uso.
- **Preço, planos e cobrança funcionando.** Estão por decidir e por fazer.
- **Leitura de qualquer nota ou comprovante.** Só foi testada com documentos sintéticos; foto de comprovante e PDF escaneado não são lidos.
- **Saldo de conta ou conciliação com o banco.** O app não calcula saldo por conta, e "Diferença do mês" não é saldo.
- **Recomendação de investimento, crédito ou produto financeiro**, nem IA.
- **Resultado garantido para a pessoa.** O app mostra o que ela registrou; não guarda nem movimenta dinheiro.
- **Funções que dependem das lojas:** lembretes, widget, biometria, abrir convites direto no app e "Compartilhar com a Clarevo".
- **O painel da empresa no app nativo.** O painel é só da web.
- **Feriados municipais e estaduais no aviso de dia útil.** Só valem os feriados nacionais de data fixa definidos em lei federal, e o aviso nunca diz que não há multa ou juros.

## 5. Se algo der errado

- **A demonstração travou ou os números mudaram:** recarregue a aba. Ela volta ao estado inicial, e é preciso tocar de novo em "Ver demonstração com dados fictícios".
- **O Resumo da aba B está zerado:** é o esperado no cenário da Evolução. Vá a Movimentos › Evolução.
- **Não aparece "Painel da empresa" em Conta:** confira se está no navegador (web) e na demonstração, não no app nativo.
- **O relatório do RH não baixou ou o PDF não abriu:** o navegador pode ter bloqueado o download ou a janela de impressão. Permita-os para o site e toque de novo, ou mostre só a planilha.
- **A internet caiu:** mostre o vídeo e as capturas de `docs/lojas/capturas/`.

## 6. Vídeo gravado (plano B)

`node scripts/video-demonstracao.js --saida <pasta> --nome clarevo-demonstracao-v2.mp4` grava a demonstração, em tela de celular, com uma legenda curta no rodapé, e confere o arquivo no fim (H.264, yuv420p, `+faststart`, no máximo 15 MB e de 2 a 3 minutos). O build vem de `apps/app/dist` (`--build` o refaz) e a gravação não usa rede: qualquer pedido para fora de `localhost` faz o script falhar. A gravação de 21/10/2026 tem 175 s e 13,9 MB, e a pasta de saída traz 1 quadro de conferência por passo, tirado do próprio MP4.

| Passo | Tela | Legenda |
|---|---|---|
| 1 | Resumo | Resumo do mês: recebido, pago e o que falta pagar |
| 2 | Anotar gasto | Anotar gasto: descrição, valor e categoria em poucos toques |
| 3 | Contas a pagar | Vencimento em fim de semana: o app avisa o próximo dia útil |
| 4 | Cartões e a fatura | A fatura mostra cada parcela e como o total é formado |
| 5 | Análises, com as Bolhas | Toque numa categoria para ver os lançamentos do mês |
| 6 | Evolução (cenário), abril fora da comparação | Sem abril, média e mediana mudam e nenhum lançamento é apagado |
| 7 | Evolução: "Renda comprometida" e "Guardado em metas" (novo) | Também renda comprometida e guardado em metas, só de meses fechados |
| 8 | Metas | Metas: reserva para imprevistos e plano de guardar |
| 9 | Aprender, "Neste mês" | Neste mês: o 13º salário, com exemplo calculado e fonte |
| 10 | Painel "Empresa Exemplo (demonstração)" | Uso do app: só contagens de licenças, nenhum dado financeiro |
| 11 | Relatório de adesão do RH, planilha baixada (novo) | O arquivo é montado no navegador, e a Clarevo não guarda cópia |
| 12 | Quem vê estes dados? | Quem vê estes dados?: só a própria pessoa, não a empresa |

No passo 7 o vídeo toca em "Renda comprometida" e em "Guardado em metas", mostra o estado vazio de cada um (o cenário não tem renda de referência nem meta) e volta a "Pago". No passo 11 ele baixa só a planilha: o PDF abriria outra janela e fica de fora da gravação.
