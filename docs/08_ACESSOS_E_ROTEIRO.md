# Clarevo: calculadoras, acessos rápidos e o que falta construir

Documento para Enzo, 08/10/2026. Nenhum arquivo do repositório foi alterado. Conferi no código e nas especificações os nomes, as rotas e os números usados aqui. Os números de pesquisa foram checados por busca na web e vêm de matérias e resumos, não das páginas originais. Antes de entrar no app ou em material de venda, cada um precisa ser conferido na fonte.

Atualização de 09/10/2026: o Ciclo A6 entregou as calculadoras e o "Achar tudo" com as regras de D-035. A situação de cada função está na seção 4; o restante do texto é a proposta de 08/10/2026, mantida como registro.

Atualização de 10/10/2026 (D-039, `docs/10_NAVEGACAO.md`): a navegação mudou depois desta proposta. "Anotar gasto" fica sempre logo abaixo do cabeçalho azul do Resumo, com os avisos temporários depois dele; o card "Ainda a pagar" ganhou "Ver contas ›", e "Recebido" e "Pago" ganharam "›" (a resposta à pergunta 4 da seção 7); a barra inferior com as quatro abas aparece em todas as telas de consulta, como Calculadoras e Contas a pagar, e só os formulários e os passos com rodapé fixo ficam sem ela. Onde este texto diz "o Resumo fica como foi aprovado", leia os blocos e a ordem de D-022, que não mudaram. Os desenhos de Movimentos, Metas e Aprender abaixo valem como foram implementados em D-035, com as mudanças de D-039 (Metas compacta, "Fazer as contas" e o grupo "No app" na busca de Aprender).

Legenda: **[E]** evidência com fonte · **[O]** opinião minha · **[!]** dado frágil, a conferir.

## Resumo em 10 linhas

1. Hoje o app não tem calculadora. Ela existe só nos documentos de planejamento.
2. Proposta: um lugar chamado **"Calculadoras"**, a 2 toques. As portas ficam em Movimentos, Metas e Aprender, e há links na hora da decisão, como ao cadastrar um parcelamento ou ao abrir uma conta vencida.
3. Primeira leva: 7 calculadoras prontas para começar e 1 que depende de você ("Quitar antes"). São elas: parcelado ou à vista, quanto custa uma dívida, multa por atraso, reserva para imprevistos, juntar para um objetivo, dividir as contas da casa e quanto custa por ano.
4. Todas usam os números que a pessoa digita e não gravam nada. Nenhuma indica banco, produto ou crédito.
5. O Resumo fica exatamente como foi aprovado. Movimentos ganha o bloco "Organizar" (Contas a pagar, Gastos fixos e Calculadoras), e a aba Metas deixa de ser uma tela vazia.
6. Pagar uma conta cai de 4 para 3 toques com o botão "Já paguei" na própria lista (conta a vencer; a conta vencida se paga pela revisão de vencidas em 4 toques, D-039(6)). A opção "Por categoria" mostra para onde foi o dinheiro.
7. O que mais falta, por ordem de valor: lembretes, renda comprometida, metas e reserva, orçamento por categoria, ocultar valores, plano para sair das dívidas e exportar dados.
8. A pesquisa mostra três coisas: só 14,3% das pessoas sabem calcular juros simples; 29,9% das famílias têm contas atrasadas; e lembretes funcionam, mas precisam juntar as contas para a pessoa não se descuidar de outras.
9. Ordem sugerida: fechar as contas do ano, deixar tudo fácil de achar, entregar as calculadoras e depois seguir os ciclos já desenhados, com os lembretes em paralelo.
10. Preciso de 5 respostas suas (seção 7). A principal é se posso adiantar as calculadoras.

## 1. Resposta direta: onde está a calculadora

**Hoje o app não tem calculadora.** Não existe tela, rota nem conta interativa. `packages/core/src` só calcula totais, vencimentos e séries (`commitments`, `dates`, `demo`, `money`, `records`, `series`, `summary`, `validation` e os repositórios). As contas aparecem apenas em documentos:

- `docs/06_ANALISE_E_PROPOSTAS.md` §4.1: calculadoras recomendadas, sem tela definida.
- `spec2` §1.5 e §4.6: calculadora da reserva em `/reserva`, no Ciclo C.
- `spec2` §1.6 e §4.7: simulador `/simular`, no Ciclo D, o último da fila.
- `spec2` §7.6: "Parcelado ou à vista" e "Quitar antes", só como sugestão.
- `spec3` §3.11: o motor de contas `learn/math.ts`, previsto no A5 apenas para os exemplos dos temas.

Não há contradição na `spec3`. O "5. Calcular" do Anexo A é texto antigo, e a própria `spec3` diz que essa seção não existe mais (l. 1726 e 1780). O que esta proposta ajusta são dois textos ainda não registrados: D-031(2), que define o topo de Aprender, e o lugar do simulador.

**Proposta: um lugar só, com o nome que a pessoa procura.**

- A tela se chama **"Calculadoras"** e fica em `/calcular`. "Calculadora" foi a palavra que você usou e é a que as pessoas procuram. "Ferramentas" e "Calcular" são mais vagas.
- **Três portas fixas, todas fora do Resumo:**
  1. Linha "Calculadoras" no bloco "Organizar" de **Movimentos**.
  2. Card "Calculadoras" no topo de **Aprender**.
  3. Card "Enquanto isso, faça as contas" na aba **Metas**.
- **Links no momento da decisão**, por exemplo:
  - ao cadastrar um parcelamento: "Parcelado ou à vista? Fazer a conta";
  - numa conta vencida: "Calcular multa e juros";
  - no detalhe de um financiamento: "Quanto economizo se quitar antes?";
  - na tela da Família ainda sem vínculo: "Enquanto isso, dividir as contas da casa".
- **A calculadora no sentido mais simples:** todo campo Valor ganha o link **"Somar valores"**. Ele abre campos para somar, como "35,90" e "12,50", mostra "Total: R$ 48,40" e preenche o campo com "Usar o total". O teclado numérico que o app usa não tem a tecla "+" (`keyboardType="decimal-pad"` em todos os formulários). Por isso a soma precisa de um botão próprio, e não de digitar "+".
- Uma calculadora comum de bolso não entra: o celular já tem uma. [O]

## 2. Acessos rápidos

### 2.1 Princípios

- [E] Esconder a navegação principal reduz quase pela metade a chance de a pessoa encontrar as funções (NN/g, estudo com 179 pessoas). Por isso o essencial fica à vista e com nome.
- [E] Ícone de navegação precisa de rótulo de texto sempre visível (NN/g, Icon usability).
- [E] A barra de abas serve para navegar, não para executar uma ação (Apple HIG, Tab bars). Por isso **não proponho um "+" no meio da barra**: ele mudaria as quatro abas aprovadas, e o leitor de tela anunciaria como aba algo que abre uma folha.
- [O] Cada aba tem um papel claro, e o Resumo continua como foi aprovado:

| Aba | Papel | O que muda |
|---|---|---|
| Resumo | Ver o mês e anotar gasto | Nada |
| Movimentos | Tudo o que entra, sai ou vence | Bloco "Organizar" com 3 linhas (as duas primeiras já existem, com legendas fixas, D-033) |
| Metas | Até o Ciclo C, porta para as contas de guardar | Card com 2 calculadoras, além do texto atual |
| Aprender | Entender e calcular | Card "Calculadoras" no topo; nos temas de juros, o link "Fazer a conta com os seus números" |

### 2.2 Desenho e textos exatos

**Movimentos** (só no contexto Pessoal; na Família continua `FamilyNotLinked`):

```
Movimentações
(Pessoal | Família)   < Outubro de 2026 >
[ Anotar gasto ] [ Registrar recebimento ]             (igual)
Organizar                                              (título nível 2)
  [CalendarClock] Contas a pagar                              >
                  R$ 650,00 em aberto neste mês · 1 vencida
  [Repeat]        Gastos fixos e parcelamentos                >
                  3 cadastrados, com as contas do ano
  [Calculator]    Calculadoras                                >
                  Parcelado ou à vista, dívidas, reserva e outras contas
[Recebido em outubro] [Pago em outubro]                (igual)
(Todos) (Recebidos) (Pagos)
```

- **Legendas conforme o estado:**
  - "Nada em aberto neste mês".
  - Nos outros meses: "R$ 300,00 em aberto em novembro".
  - "Nenhum cadastrado. Aluguel, escola, financiamento, IPVA".
- **Origem dos valores:** a mesma regra do card "Ainda a pagar" (D-021(5)). Nenhuma cor de alerta.
- **Linhas:** com 56 px ou mais e nome acessível completo, por exemplo "Contas a pagar, R$ 650,00 em aberto neste mês, 1 vencida".
- **Altura:** o bloco acrescenta cerca de 190 px antes da lista. É uma estimativa, a medir na entrega. Se a lista descer demais em 360 × 640, os dois cards de totais podem virar uma linha só.

**Metas** (até o Ciclo C):

```
Metas
[card] Metas chegam em uma próxima versão              (texto atual)
[card] Enquanto isso, faça as contas
   > Reserva para imprevistos   Quantos meses seus gastos essenciais cobrem
   > Juntar para um objetivo    Quanto guardar por mês ou em quanto tempo
   > Todas as calculadoras
[link] Enquanto isso, acompanhe o mês no Resumo        (atual)
```

Os três itens levam a telas que funcionam, como pede o CL C005: nada de botão sem destino útil.

**Aprender:**

```
Aprender
Explicações curtas e opcionais, ligadas ao que você faz no app.
[card branco, ícone azul] Calculadoras                         >
     Parcelado ou à vista, dívidas, reserva e outras contas com os seus números
(temas atuais)
```

- Com o A5, o card fica logo abaixo da busca e acima do card lima "Comece por aqui". Isso ajusta o texto de D-031(2), registrado assim em 09/10/2026.
- O atalho "Simular", previsto em Dinheiro no tempo, continua como D-031(7) já prevê.

**`/calcular`** é uma tela interna com `SubHeader`. Não tem pílula de contexto, porque nada é gravado.

```
<- Calculadoras
Contas rápidas com os valores que você informa. Nada é gravado.
Decidir uma compra
  > Parcelado ou à vista?              Descubra os juros embutidos no parcelado
  > Quanto custa por ano?              Assinaturas e gastos que se repetem
Dívidas e atrasos
  > Quanto custa uma dívida?           Rotativo, cheque especial ou empréstimo
  > Quitar antes ou adiantar parcelas  Quanto dos juros sai da conta (se aprovado)
  > Multa e juros por atraso           Com os valores do boleto
Guardar e dividir
  > Reserva para imprevistos           Quantos meses seus gastos essenciais cobrem
  > Juntar para um objetivo            Quanto guardar por mês ou em quanto tempo
  > Dividir as contas da casa          Partes iguais ou pela renda de cada pessoa
Simulação com os valores e as taxas que você informou. Não é recomendação
de produto financeiro nem oferta de crédito.
```

**Contas a pagar (`/a-pagar`): "Já paguei" na linha.**

- Hoje "Já paguei" existe só na revisão de vencidas (`a-pagar/vencidas.tsx`), e lá o pagamento vai para a data do vencimento.
- **Na proposta:**
  - Cada conta **a vencer** com valor fixo ganha o botão secundário "Já paguei", com o nome acessível "Já paguei Luz, vence 12/10".
  - O diálogo pergunta "Marcar Luz como paga hoje?" e mostra "R$ 180,00 em 08/10/2026". Os botões são "Confirmar pagamento", "Mudar valor ou data" (abre o formulário atual) e "Cancelar".
  - Conta com valor estimado mostra "Informar valor e pagar", que abre o formulário, porque o valor precisa vir da pessoa (D-024(4)).
- **Banco:** grava pela função `pay_commitment` que já existe, sem mudança no banco.

**Composição do mês (toque em "Pago"): "Por registro | Por categoria".**

- Mostra barras horizontais com valor e percentual de cada categoria. São as 6 categorias fixas mais "Sem categoria" (`records.ts:222`), e a soma fecha com Pago.
- Não há cor de alerta. O cálculo é em centavos, no core, e não mexe no banco.
- Hoje não existe visão por categoria em nenhuma tela.

**Família sem vínculo:** o estado "Nenhuma família vinculada" ganha o link "Enquanto isso, dividir as contas da casa". O link leva à calculadora 7, que não grava nada sobre outra pessoa.

**Somar valores** (em todos os campos Valor: registro, conta a pagar, pagamento, série e valor do ano):

```
Valor
[ R$ 0,00            ]
Somar valores                                   (link)
  [ 35,90 ]  [ 12,50 ]  + Adicionar outro valor
  Total: R$ 48,40                               (anunciado ao leitor de tela)
  [ Usar o total ]
```

- **Regra:** cada valor passa por `parseBRL`, a soma é inteira em centavos, o total respeita `MAX_RECORD_CENTS` (R$ 9.999.999,99) e só o total é salvo.
- **Código:** a função fica no core, com testes. O banco não muda.
- **Teste:** precisa rodar no iOS, no Android e na web.

**Fora do app** (não muda nenhuma tela):

- **Versão web instalada:** o campo `shortcuts` de `public/manifest.webmanifest`, que hoje não tem atalhos, ganha quatro:
  - "Anotar gasto" (`/registro/novo?tipo=despesa`);
  - "Registrar recebimento" (`/registro/novo?tipo=receita`);
  - "Contas a pagar" (`/a-pagar`);
  - "Calculadoras" (`/calcular`).
- **Onde funciona:** no Chrome, no Edge e no Samsung Internet do Android. Não funciona no Safari do iOS.
- **Teste:** abrir cada atalho sem sessão; a pessoa entra e volta para a tela pedida.
- **No app nativo:** fica para depois com `expo-quick-actions`. É um pacote da comunidade, e a tabela de versões achada vai até o SDK 56. Antes, é preciso conferir a compatibilidade com o SDK 57 (`apps/app/AGENTS.md`).

### 2.3 Toques desde a abertura

Contagem a partir do Resumo, no contexto Pessoal e no mês atual. Cada toque conta, inclusive "Salvar" e "Confirmar"; digitar não conta.

| Ação essencial | Hoje | Depois | Caminho depois |
|---|---|---|---|
| Anotar gasto | 2 | 2 | "Anotar gasto" › "Salvar gasto" (igual) |
| Registrar recebimento | 3 | 3 (2 pelo atalho do ícone da versão web no Android) | Movimentos › "Registrar recebimento" › Salvar |
| Ver quanto falta pagar | 0 | 0 | Valor visível no card "Ainda a pagar" (igual) |
| Ver a lista de contas | 1 | 1 (ou 2 por Movimentos) | Card "Ainda a pagar", ou Movimentos › "Contas a pagar" com o total na legenda |
| Pagar uma conta a vencer | 4 | 3 | Card › "Já paguei" › "Confirmar pagamento". Com o A2: aviso › "Já paguei" › Confirmar, porque o aviso abre `/a-pagar` (`spec2` §4.4) |
| Anotar conta a pagar | 2 | 2 | Igual |
| Ver gastos fixos, parcelamentos e contas do ano | 2 (link abaixo de outro botão, dentro de Contas a pagar) | 2, com nome visível | Movimentos › "Gastos fixos e parcelamentos" |
| Cadastrar gasto fixo | 3 | 3 | "Anotar conta a pagar" › chip "Todo mês" › Salvar |
| Abrir as calculadoras | não existe | 2 | Movimentos › "Calculadoras", ou Aprender › card |
| Usar uma calculadora | não existe | 3 | … › item; o resultado aparece enquanto a pessoa digita, sem botão "Calcular" |
| Calcular na hora da decisão | não existe | 1 a partir do formulário ou do detalhe | Seção 3, "Onde aparece" |
| Somar valores ao anotar | não existe | 2 a mais | "Somar valores" › "Usar o total" |
| Ver para onde foi o dinheiro | não existe | 2 | Toque em "Pago" › "Por categoria" |
| Tirar uma dúvida | 2 | 2 (com busca no A5) | Aprender › tema |

O ganho maior é de **descoberta**: as funções escondidas ganham nome visível, a aba Metas deixa de ser beco sem saída e a calculadora passa a existir a 2 toques. Em toques, o ganho é pagar uma conta (4 para 3).

### 2.4 O que muda na estrutura aprovada

- **Nada no Resumo nem nas quatro abas.** Os elementos que D-022 lista continuam iguais. As mudanças ficam em Movimentos, que não perde nada (o Primeiro ciclo, l. 48, pede "Registrar recebimento em Movimentações", e o botão continua), na tela provisória de Metas e em Aprender.
- **O card lima do Resumo continua "Fatura sem contar duas vezes".** O CL C005 diz que esse card "pode orientar o conceito, mas não torna cartões uma função implementada", e a `spec3` §3.2 e D-031(5) mantêm o card. Não proponho trocar. Com o Ciclo E (D-037), os cartões são uma função implementada, e o card continua igual.
- **Mudanças no Resumo que só entram com a sua aprovação** (decisão 4):
  - (a) Um link "Ver todas" ao lado de "Ainda a pagar neste mês", no mesmo padrão do "Ver todos" de "Pagamentos do mês". Hoje o card leva à lista, mas não há texto visível de ação. É uma mudança pequena num card aprovado.
  - (b) Uma fileira de 4 atalhos com nome (Recebimento, Contas a pagar, Gastos fixos, Calculadoras) abaixo de "Anotar gasto".
    - É uma seção nova no Resumo e acrescenta cerca de 100 px, conforme a medição em `navprobe/nav_options.md`.
    - Em 360 × 640, o rótulo "Ainda a pagar" desceria de y 496 para cerca de 596, abaixo do topo da barra de abas (576), e sairia da primeira tela.
    - Em 390 × 844, "Pagamentos do mês" sairia da primeira tela.
    - As medidas não consideram a barra do navegador nem as barras do Android.
  - (c) Alternativa discreta: um segmento "Mais" ao lado de "Anotar gasto" (0 px a mais). Ele abre a folha "O que você quer anotar?". Ajuda menos a encontrar as funções.
  - Para (b) e (c), recomendo antes um protótipo testado com 5 pessoas do público. As tarefas seriam "anote o salário", "onde está o financiamento do carro?" e "faça a conta da geladeira", medindo o acerto no primeiro toque. Assim a decisão sai com medida real num aparelho de 360 × 800 com as barras do Android.

## 3. Calculadoras: primeira entrega

### 3.1 Regras comuns

- **Código:** cálculo em `packages/core`, reaproveitando `learn/math.ts` da `spec3` §3.11. Ele já prevê `impliedMonthlyRate`, `compoundTotalCents`, `equivalentAnnualBp`, `installmentCents`, `presentValueCents`, `lateChargesCents`, `sharesCents`, `percentTenths` e `monthsToReach`, com vetores. A `spec3` §3.16 já permite começar esse core antes do A5.
- **Números:**
  - entradas e saídas em centavos inteiros;
  - taxas em pontos-base inteiros, com até 2 casas;
  - potências inteiras em aritmética exata (D-032(3));
  - ponto flutuante só no fator de juros quando o expoente é fracionário;
  - arredondamento só no fim, com metade para cima, salvo quando a regra disser outra coisa.
- **Banco:** nada é gravado e o banco não muda. Nenhuma pílula de contexto.
- **Aviso fixo**, visível sem rolar em 360 px: "Simulação com os valores e as taxas que você informou. Não é recomendação de produto financeiro nem oferta de crédito."
- **Hipóteses:** listadas abaixo de cada resultado.
- **Taxas:**
  - nenhuma taxa padrão, nenhuma média de mercado e nenhum número que muda todo mês fixo no texto (D-032(5));
  - nenhum banco, produto, emissor ou ranking (Resoluções CVM 19, 20 e 30);
  - nunca sugerir empréstimo, consignado, portabilidade ou renegociação (Handoff CL-V007; D-032(5)).
  - Os links de contexto preenchem valores e datas, mas a taxa é sempre a pessoa que digita.
- **Tom:**
  - nada de "vale a pena", "ruim", "cuidado" ou vermelho;
  - a frase padrão é "Com estes números, …";
  - o texto diz "depois do vencimento", nunca "atrasado".
- **Testes:**
  - `packages/core/test/copy.test.ts` cobre todos os textos das calculadoras com o padrão `FORBIDDEN`, que proíbe "invista", "caixinha", a expressão vetada e travessões;
  - os vetores da `spec3` §3.11 entram nos testes;
  - os exemplos são comparados com a Calculadora do Cidadão do Banco Central.
- **Acessibilidade:**
  - resultado anunciado com `accessibilityLiveRegion="polite"`;
  - alvos de 48 px;
  - texto a 200% sem corte.

Recalculei em Python todos os exemplos abaixo, e eles batem com a `spec3` §3.11 e com D-028.

### 3.2 As 8 calculadoras

**1. Parcelado ou à vista?**
- **Para quê:** ver os juros embutidos no "sem juros" quando há desconto à vista.
- **Pede:**
  - preço à vista;
  - número de parcelas (2 a 480);
  - valor da parcela;
  - "A primeira parcela é paga na compra?" (Não / Sim);
  - "Como vai pagar as parcelas?" (Boleto ou carnê / Débito ou Pix / Cartão de crédito).
- **Mostra:**
  - a diferença em reais;
  - a taxa ao mês e ao ano;
  - ou "Não há juros embutidos" quando os dois preços são iguais.
- **Regra em centavos:**
  - diferença = n × parcela - à vista;
  - taxa i por bisseção (`impliedMonthlyRate`) em à vista = parcela × (1 - (1 + i)^-n) ÷ i;
  - com a primeira parcela na compra: financiado = à vista - parcela, em n - 1 parcelas;
  - ao ano = (1 + i)^12 - 1.
- **Exemplo:** R$ 1.080,00 à vista ou 10 × R$ 120,00.
  - Diferença de R$ 120,00.
  - Com a primeira parcela em 30 dias: 1,96% ao mês (26,27% ao ano).
  - Com a primeira na compra: 2,42% ao mês (33,28% ao ano).
- **Cuidados:**
  - Não compara com rendimento, que fica no Ciclo D (só simulação, sem indicar produto; D-034(5)).
  - Cita a Lei 13.455/2017 só no tema.
  - O botão "Anotar como parcelamento" aparece **só fora do cartão**, porque parcelas no cartão estão fora (D-023 e D-024). Com "Cartão de crédito", aparece o aviso de fatura que já existe. Desde o Ciclo E (D-037), a compra parcelada no cartão existe em Anotar gasto ("Em quantas vezes?"), e as parcelas caem nas faturas; esta calculadora continua sem o botão com cartão.
  - O botão abre `/gastos-fixos/novo?tipo=parcelada` preenchido. A rota já aceita `tipo`, `descricao`, `valor`, `categoria` e `dia`. O parâmetro `parcelas` hoje vale só para a conta do ano (1 a 12), então o número de parcelas do parcelamento (2 a 480) e o tipo do parcelamento entram como ampliação da rota, só no app.
- **Onde aparece:**
  - em Calculadoras;
  - no novo parcelamento (chip "Parcelado"): "Parcelado ou à vista? Fazer a conta";
  - no tema `parcelado-ou-a-vista` (A5).
  - Na conta do ano ("Cota única ou parcelado? Fazer a conta"), só se você aprovar a decisão 3, porque D-029 deixou fora o cálculo do desconto da cota única.

**2. Quanto custa uma dívida?**
- **Para quê:** ver em reais o efeito de uma taxa ao mês.
- **Pede:**
  - tipo (Rotativo do cartão / Cheque especial / Empréstimo ou outra dívida);
  - valor;
  - taxa ao mês ("está na fatura, no extrato ou no contrato").
  - No cheque especial: meses (1 a 24).
  - No empréstimo: número de parcelas (1 a 120).
- **Mostra:** total, juros e taxa ao ano. No rotativo, também o limite legal.
- **Regra em centavos:**
  - total = `compoundTotalCents(valor, bp, n)`, exato;
  - juros = total - valor;
  - ao ano = `equivalentAnnualBp`;
  - parcelas = `installmentCents` (Price).
  - **Rotativo:** calcula **1 ciclo só**, porque o rotativo dura até a fatura seguinte (Res. CMN 4.549/2017). Depois oferece "E se parcelar a fatura?", com taxa e parcelas. Juros e encargos do rotativo e do parcelamento ficam limitados ao valor original (Lei 14.690/2023 e Res. CMN 5.112/2023), então o total máximo é 2 × o valor original, sem o IOF.
- **Exemplo:**
  - R$ 1.000,00 a 8% ao mês por 3 meses: R$ 1.259,71, com R$ 259,71 de juros (151,82% ao ano).
  - Rotativo de R$ 700,00 a 14%: R$ 98,00 de juros no mês, saldo de R$ 798,00. Parcelar em 24 × R$ 75,79 a 8% somaria R$ 1.818,96, mas o limite deixa o total em no máximo R$ 1.400,00. Em 12 × R$ 105,89, o total é R$ 1.270,68.
  - Empréstimo de R$ 5.000,00 a 2% em 12 vezes: R$ 472,80 por mês, R$ 5.673,60 no total.
- **Cuidados:**
  - Sem média de mercado.
  - No cheque especial acima de 8% ao mês: "A taxa informada passa do teto de 8% ao mês do cheque especial (Res. CMN 4.765/2019). Confira o extrato."
  - O empréstimo lembra que o CET do contrato inclui tarifas, seguros e IOF.
  - Não cria função de cartão: é só uma conta com números digitados, como o tema `rotativo-cartao`.
  - O teto do rotativo entra na revisão periódica da `spec3` (R6). A MP 1.393/2026, em votação, não muda o teto segundo a `spec3`, mas deve ser conferida de novo depois da votação.
- **Onde aparece:**
  - em Calculadoras;
  - nos temas `rotativo-cartao`, `cheque-especial`, `juros-simples-compostos`, `taxa-mes-ano` e `cet` (A5);
  - no detalhe de parcelamento do tipo "Financiamento ou empréstimo".

**3. Quitar antes ou adiantar parcelas** (depende da decisão 3)
- **Para quê:** estimar quanto dos juros sai ao antecipar.
- **Pede:**
  - valor da parcela;
  - parcelas que faltam;
  - taxa ao mês do contrato;
  - "Quitar tudo" ou "Adiantar as últimas N".
- **Mostra:** o valor estimado hoje e o desconto estimado sobre a soma.
- **Regra em centavos:**
  - soma = parcela × k;
  - valor presente = Σ parcela ÷ (1 + i)^t (`presentValueCents`).
  - Aberta do detalhe da série, t usa a data real de cada vencimento, que o app conhece pela série (dias ÷ 30).
  - Aberta sozinha, a hipótese visível é "próxima parcela em 1 mês".
- **Exemplo:** 36 × R$ 850,00 a 1,5% ao mês.
  - Soma de R$ 30.600,00; quitar hoje fica em cerca de R$ 23.511,58, com desconto estimado de R$ 7.088,42.
  - Adiantar as 3 últimas: R$ 1.514,47 em vez de R$ 2.550,00.
- **Cuidados:**
  - Nunca chamar de "saldo devedor" (D-024(7)).
  - Texto fixo: "Estimativa. O valor oficial é o que a instituição informar; peça o valor atualizado" (CDC art. 52 §2º; Res. CMN 5.004/2022).
  - Só para financiamento e compra parcelada, nunca para imposto ou taxa.
  - Muda D-024, que deixou fora "juros, saldo devedor e amortização calculados".
- **Onde aparece:**
  - em Calculadoras;
  - em `/gastos-fixos/[id]` com natureza `financiamento` ou `compra_parcelada`: "Quanto economizo se quitar antes?";
  - no tema `quitar-antes`.

**4. Multa e juros por atraso**
- **Para quê:** saber quanto uma conta passa a custar depois do vencimento, antes de pegar o boleto atualizado.
- **Pede:**
  - valor da conta;
  - multa (%) e juros ao mês (%) ("estão no boleto ou no contrato");
  - dias depois do vencimento.
- **Mostra:** multa, juros e total.
- **Regra em centavos:**
  - multa = arredonda(valor × multa);
  - juros = arredonda(valor × juros × dias ÷ 30), simples e proporcional (`lateChargesCents`).
- **Exemplo:** R$ 200,00, 2%, 1% ao mês, 10 dias: R$ 4,00 + R$ 0,67 = R$ 204,67.
- **Cuidados:**
  - Sem percentuais padrão.
  - "O valor exato é o do boleto atualizado".
- **Onde aparece:**
  - em Calculadoras;
  - no detalhe de conta vencida `/a-pagar/[id]`: "Calcular multa e juros", com valor e dias preenchidos;
  - no tema `multa-juros-atraso`.

**5. Reserva para imprevistos**
- **Para quê:** saber o tamanho da reserva, quantos meses o que já está guardado cobre e quanto tempo falta.
- **Pede:**
  - gastos essenciais por mês;
  - meses a cobrir (chips 1, 3, 6 e 12, mais "Outro" de 1 a 24, nenhum marcado);
  - já guardado (opcional);
  - quanto guarda por mês (opcional).
- **Mostra:** valor da reserva, quantos meses já estão cobertos e o prazo.
- **Regra em centavos:**
  - alvo = essenciais × meses;
  - cobertura em décimos = piso(guardado × 10 ÷ essenciais);
  - prazo = teto((alvo - guardado) ÷ mensal).
  - Sem rendimento.
- **Exemplo:** R$ 3.750,00 × 6 = R$ 22.500,00. Com R$ 4.500,00 guardados, cobre 1,2 mês; guardando R$ 500,00 por mês, chega lá em 36 meses.
- **Cuidados:**
  - Não diz onde guardar.
  - A referência aparece com fonte e data, como no tema `reserva-imprevistos` da `spec3`: o Portal do Investidor da CVM cita de 6 a 12 meses, conforme o tipo de renda, e metas iniciais de 1, 3 ou 6 meses [!].
- **Onde aparece:**
  - em Calculadoras;
  - na aba Metas;
  - no tema `reserva-imprevistos`.
  - No Ciclo C, vira `/reserva` com a mesma regra, os gastos essenciais já preenchidos e o botão "Criar reserva".

**6. Juntar para um objetivo**
- **Para quê:** transformar um objetivo (viagem, troca de celular, entrada de um carro) em um valor por mês ou em um prazo.
- **Pede:**
  - quanto quer juntar;
  - quanto já tem (opcional);
  - "Em quantos meses" (1 a 600) ou "Quanto vai guardar por mês".
- **Mostra:** o valor por mês ou o prazo.
- **Regra em centavos:**
  - mensal = teto((alvo - já tem) ÷ meses);
  - prazo = teto((alvo - já tem) ÷ mensal).
  - Sem rendimento.
- **Exemplo:** R$ 22.500,00 em 14 meses, começando com R$ 4.500,00, dá R$ 1.285,72 por mês. Com R$ 1.000,00 por mês, leva 18 meses.
- **Cuidados:** sem rendimento, não há tema da CVM envolvido.
- **Ciclo D:** é a primeira parte do simulador de D-028, com as mesmas regras.
  - No D, a mesma tela ganha "Taxa de rendimento ao ano (%)", vazia, de 0% a 30%. O resultado com a taxa aparece ao lado do sem rendimento: R$ 1.184,52 por mês na hipótese de 10% ao ano.
  - Ganha também a inflação opcional, o modo "Quanto posso ter" e o aviso fixo de D-028.
  - Sem parecer jurídico (D-034(5)): o app só presta informação pública já disponível, com fonte, e não indica produto.
- **Onde aparece:**
  - em Calculadoras;
  - na aba Metas;
  - depois, em "Nova meta" e "Simular com rendimento" (Ciclos C e D).

**7. Dividir as contas da casa**
- **Para quê:** combinar quanto cada pessoa da casa põe nas contas, em partes iguais ou de acordo com a renda.
- **Pede:**
  - total (com "Somar valores");
  - "Em partes iguais" ou "Pela renda de cada pessoa";
  - de 2 a 6 pessoas ("Pessoa 1", apelido opcional);
  - a renda de cada uma.
- **Mostra:** o valor e o percentual de cada pessoa.
- **Regra em centavos:** `sharesCents`, com os centavos que sobram distribuídos pelo maior resto, para a soma fechar com o total.
- **Exemplo:**
  - R$ 3.000,00 com rendas de R$ 4.000,00 e R$ 6.000,00: R$ 1.200,00 (40%) e R$ 1.800,00 (60%).
  - R$ 100,00 por 3: R$ 33,34, R$ 33,33 e R$ 33,33.
- **Cuidados:**
  - Não pede nome real e não grava dado de outra pessoa (LGPD).
  - Não é o plano Família.
- **Onde aparece:**
  - em Calculadoras;
  - na Família sem vínculo;
  - na lista de gastos fixos: "Dividir estas contas", preenchida com o "Por mês" que a tela já mostra.

**8. Quanto custa por ano?**
- **Para quê:** ver no ano o que se paga aos poucos, como assinaturas, estacionamento e lanche.
- **Pede:**
  - valor (com "Somar valores");
  - frequência: "Por dia útil", "Por semana" ou "Por mês".
- **Mostra:** valor por mês e por ano.
- **Regra em centavos:**
  - ano = valor × 12, × 52, ou × 22 × 12 no dia útil;
  - mês = valor × 22 no dia útil, ou arredonda(valor × 52 ÷ 12) na semana.
  - As hipóteses de 22 dias úteis e 52 semanas ficam visíveis.
- **Exemplo:**
  - R$ 39,90 + R$ 21,90 + R$ 55,90 + R$ 12,90 = R$ 130,60 por mês, R$ 1.567,20 por ano.
  - R$ 25,00 por semana: R$ 108,33 por mês, R$ 1.300,00 por ano.
  - R$ 18,00 por dia útil: R$ 396,00 por mês, R$ 4.752,00 por ano.
- **Cuidados:**
  - Sem "corte", "desperdício" ou julgamento.
  - O botão "Anotar como gasto fixo" abre `/gastos-fixos/novo?tipo=mensal` preenchido.
- **Onde aparece:**
  - em Calculadoras;
  - no detalhe de gasto fixo mensal: "Quanto custa por ano?".

### 3.3 Ficam para depois, com o motivo

- **Correção pela inflação (IPCA):** exige baixar e manter a série oficial, e D-032(5) não deixa número mensal fixo no texto.
- **13º, férias, salário líquido e imposto de renda:** as tabelas mudam todo ano, o que traz custo de manutenção e risco jurídico.
- **Tabela Price e SAC:** o tema `amortizacao-price-sac` e o link "Quanto das parcelas é juros?" já cobrem.
- **Comparar parcelado com rendimento:** depende do Ciclo D.

## 4. O que já existe, o que está desenhado e o que falta

Situação em 10/10/2026, depois dos Ciclos A6 (D-035), A4 (D-030), A5 (D-031 e D-032), A2 (D-025), B (D-026), C (D-027 e D-036), D (D-028) e E (D-037 e D-038).

| Função | Situação | Onde fica ou ficaria |
|---|---|---|
| Entrada, cadastro, recuperação, demonstração | Existe | Fluxo de entrada |
| Anotar gasto e recebimento, detalhe, editar, excluir | Existe | Resumo, Movimentos |
| Resumo, composição, troca de mês | Existe; a composição de Pago tem "Por registro \| Por categoria" (A6, D-035(6)) | Resumo › toque em "Pago" |
| Contas a pagar: vencidas, pagar, desfazer, próximos meses | Existe, com "Já paguei" nas contas a vencer do mês atual e "Informar valor e pagar" nas estimadas (A6, D-035(5)); as vencidas seguem na revisão de vencidas | Card "Ainda a pagar" › `/a-pagar`; Movimentos › "Organizar" |
| Gastos fixos e parcelamentos | Existe, com os links "Quanto custa por ano?", "Quanto economizo se quitar antes?" e "Dividir estas contas" (A6) | Movimentos › "Organizar"; `/a-pagar` › link; chips "Todo mês" e "Parcelado" |
| Contas do ano (IPVA, IPTU, matrícula) | Existe (A3, D-029), com "Cota única ou parcelado? Fazer a conta" no detalhe (A6) e, desde D-042, explicada: texto curto no topo do cadastro com "O que é isso?" (abre o tema de Aprender), exemplos nos campos, cota única e parcelado com exemplo numérico, o que acontece nos anos seguintes e a legenda de "Ano a ano" | Gastos fixos › Contas do ano; chip "Todo ano" |
| Conta, segurança, "Quem vê estes dados?" | Existe | Avatar, rodapés |
| Metas e reserva (C) | Existe (D-027): aba Metas com a pergunta do plano de guardar (D-036), "Seu mês", reserva para imprevistos, metas, aportes, resgates e "Atualizar valor guardado"; as calculadoras continuam em um acesso no fim da aba. O roteiro web (`e2e-web.js`) cobre as telas. Falta: o teste em aparelho (`docs/04`) | Aba Metas, `/reserva`, `/meta/*`, `/guardar` |
| Primeiros passos e "Organizar" em Movimentos | Existe (D-033); "Organizar" com 3 linhas, Calculadoras e legendas com valores (D-035(8)) | Card temporário no Resumo; Movimentos |
| Seus últimos meses (A4) | Existe (D-030): faixa, resumo mês a mês, "Atualizar agora" e "Seguir adiante", com "Ver resumo dos últimos meses" em Contas a pagar, "Registrar parcelas" na conta do ano e o cenário da demonstração pelo endereço, todos no roteiro web. Falta: o teste em aparelho (`docs/04`) | Faixa temporária no Resumo, `/retomar` |
| Aprender e dúvidas: busca, 5 seções, 42 temas (40 publicados), "O que é isso?" (A5) | Existe (D-031 e D-032), com o card "Calculadoras" e o atalho "Simular" no topo, "Fazer a conta com os seus números" nos temas e os temas dos Ciclos B, C e D; catálogo e fontes em `docs/09_APRENDER.md`. Falta: o teste em aparelho (`docs/04`) | Aba Aprender; "O que é isso?" nas telas |
| Lembretes de vencimento (A2) | Existe (D-025), só no aparelho: um aviso no dia anterior, sem valor nem descrição. Falta: o teste em aparelho, que Enzo fará com o app pronto (`docs/04`) | Conta › interruptor; aviso no celular |
| Renda comprometida (B) | Existe (D-026), com renda de referência, "Próximos meses" e linha informativa das contas do ano. O roteiro web (`e2e-web.js`) cobre as telas. Falta: o teste em aparelho (`docs/04`) | Linha dentro do card "Ainda a pagar", `/renda-comprometida` |
| Simulador (D) | Existe (D-028): `/simular` com três modos, taxa digitada, resultado sem rendimento ao lado, ano a ano e "Criar meta com estes valores"; "Simular com rendimento" na calculadora "Juntar para um objetivo". O roteiro web (`e2e-web.js`) cobre as telas. Falta: o teste em aparelho e a conferência com a Calculadora do Cidadão (`docs/04`) | `/simular`; Metas; detalhe da meta; calculadora; Aprender |
| Calculadoras, "Somar valores", atalhos do ícone na web | Existe (A6, D-035): 8 calculadoras (a 9ª, "Em que ordem quitar as dívidas?", é do Ciclo F1, D-040, e a 10ª, "Antes de financiar", a primeira da lista, é de D-044), "Somar valores" em todos os campos Valor, 4 atalhos no manifesto e volta à tela pedida depois de entrar. Falta: teste em aparelho e link da CVM na reserva (`docs/04`) | `/calcular`; campos Valor; manifesto |
| "Já paguei" na lista e "Por categoria" | Existe (A6, D-035(5) e (6)) | `/a-pagar`; composição |
| Previsão dos pagamentos do mês | Existe (D-026(10)) | Topo de `/a-pagar`, só no mês atual |
| Busca de registros, orçamento por categoria | Falta, sem ciclo (o orçamento está no "núcleo proposto" das Instruções v2.1) | Movimentos; Metas ou Movimentos |
| Ocultar valores e biometria | Existe (D-025). Falta: o teste em aparelho (`docs/04`) | Conta; olho no cabeçalho das abas quando couber |
| Assinaturas, plano para sair das dívidas, revisão do mês, exportar dados, aviso de valor fora do habitual, "Parece um gasto fixo" | Falta (só sugestão em `spec2` §7) | Seção 5 |
| Notas fiscais (E) | Existe (D-038): "Escanear nota fiscal" em Anotar gasto, com câmera (QR da NFC-e e código de barras da NF-e), PDF do DANFE e "Colar o link ou a chave"; no RJ, a página da Sefaz-RJ preenche loja, valor, data e forma de pagamento no celular, e a linha "Nota lida" mostra loja, valor, data e forma (D-042; "Como você pagou?" já vem escolhido, sem a forma, nenhuma escolha). Na web, a dica "No celular, o Clarevo lê o valor e a data na página da Sefaz." Só o resumo SHA-256 da chave é guardado, nunca CPF. Sem parecer jurídico (D-034(5)). Falta: o aceite com notas reais (P-025), o teste em aparelho, compartilhar o PDF de outro app e a cobertura de outros estados (`docs/04`) | Primeiro item de Anotar gasto novo |
| Cartões de crédito e faturas (E) | Existe (D-037): cartões, compra parcelada no cartão, fatura como conta a pagar, pagamento total ou parcial com saldo anterior, encargos e estornos, "Por categoria" e grupo "Faturas de cartão" na renda comprometida; desde D-042, o card "Faturas de outubro" no topo de `/cartoes`, com a soma das faturas do mês, quanto isso é da renda de referência e as próximas faturas. Falta: o teste em aparelho e a interface na Família (`docs/04`) | Movimentos › "Organizar" › Cartões; "Como você pagou?" em Anotar gasto; `/cartoes` |
| Família, integração bancária, IA, crédito, painel de empresas | Fora do ciclo atual; a Família sem vínculo ganhou só o link "Enquanto isso, dividir as contas da casa" (fora do Resumo, A6) | Ciclos seguintes de `docs/04`, ou nunca (crédito) |

## 5. Sugestões fundamentais com base em pesquisa

Ordem pelo valor para a pessoa e para a empresa que oferece o benefício. Valor: Alto (A), Médio (M) ou Baixo (B). Esforço: S (pequeno), M (médio) ou L (grande).

1. **Lembretes agrupados (A2).**
   - O aviso sai 1 dia antes: "Você tem 3 contas com vencimento amanhã.", sem valores na tela bloqueada. O toque abre Contas a pagar.
   - Valor: pessoa A, empresa A. Esforço: S/M.
   - [E] Medina (*Review of Financial Studies*, 2021), em experimento no Brasil: o lembrete da fatura reduziu em 14% a multa por atraso, mas aumentou em 9% as tarifas de cheque especial. Juntar as contas e lembrar "confira se foi debitado" no débito automático reduz esse efeito.
   - [E] Em agosto de 2026, 29,9% das famílias tinham contas em atraso e 82% tinham dívidas, o sétimo mês seguido no maior nível da série; nas famílias com renda de até 3 salários mínimos, o atraso chegou a 38,8% (Peic/CNC, divulgada em 10/09/2026). O tempo médio de atraso foi de 64,6 dias em julho. A Peic de setembro ainda não foi encontrada.
   - Depende de: build de desenvolvimento e `expo-notifications` instalado com `npx expo install`.
   - Situação: feito em 09/10/2026 (D-025). Falta o teste em aparelho.
   - Riscos: a atenção mudar de uma conta para outra; cansaço com pedidos de permissão. Não há lembrete na web.
2. **Calculadoras (seção 3).**
   - Valor: pessoa A, empresa A. Esforço: M/L (8 a 12 dias, com textos, acessibilidade e testes).
   - [E] Só 14,3% das pessoas calculam juros simples (Banco Central, 2023).
   - [E] O rotativo do cartão chegou a 444,9% ao ano em agosto de 2026 (Banco Central).
   - [E] O parcelado sem juros respondeu por 41% do volume do cartão em 2024 (Abecs).
   - [E] Fernandes, Lynch e Netemeyer (2014): o efeito da educação financeira cai com o tempo, e por isso ela funciona melhor perto da decisão.
   - Depende de: `learn/math.ts`.
   - Risco: a simulação ser lida como recomendação. Mitigação: as regras de 3.1 e só informação pública já disponível, com fonte (D-034(5)).
3. **Achar tudo.**
   - Bloco "Organizar", Metas com saída, "Já paguei" na lista, estados vazios com ação e Primeiros passos.
   - Valor: pessoa A, empresa M. Esforço: S/M.
   - [E] Esconder a navegação reduz quase pela metade a descoberta (NN/g).
   - [E] 35% dos cancelamentos de planos anuais acontecem no primeiro mês, e só cerca de 5% de quem cancela um plano anual volta (RevenueCat, State of Subscription Apps 2026, mais de 115 mil apps). Num produto pago, o primeiro mês decide.
   - Depende de: nada no banco; reaproveita Primeiros passos e o bloco "Organizar", que já existem (D-033).
   - Riscos: virar tutorial. Conta nova continua sem dados de exemplo.
4. **Renda comprometida (B).**
   - Proposta extra: incluir "consignado" no texto de ajuda do tipo "Financiamento ou empréstimo", só no texto, sem mudar o banco.
   - Valor: pessoa A, empresa A. Esforço: M.
   - [E] O comprometimento da renda com dívidas bateu o recorde de 29,3% (Banco Central, janeiro de 2026).
   - [E] O consignado para quem tem carteira assinada somou R$ 117,1 bilhões no primeiro ano, sendo R$ 82,9 bilhões em contratos novos, com parcela de até 35% do salário. Isso toca diretamente quem recebe o benefício pela empresa.
   - Depende de: A3 e P-019.
   - Situação: feito em 09/10/2026 (D-026); P-019 resolvida com a linha informativa fora do percentual.
   - Riscos: percentual errado sem a renda informada; nada de cor de alerta nem sugestão de crédito.
5. **Para onde foi o dinheiro.**
   - Primeiro "Por categoria" na composição, sem banco. Depois "Buscar" em Movimentos ("quanto paguei de luz?").
   - Valor: pessoa A, empresa M. Esforço: S (categoria) e M (busca).
   - [E] Hoje não existe visão por categoria em nenhuma tela. Mobills e Organizze têm relatórios por categoria.
   - Depende de: nada para "Por categoria" (as categorias já estão nos registros); a busca pode pedir uma função de leitura no banco.
   - Riscos: as 6 categorias fixas limitam o detalhe; a busca em todos os meses pode pedir função nova no banco, com teste em `supabase/tests`.
6. **Metas e reserva (C).**
   - Valor: pessoa A, empresa A. Esforço: L.
   - [E] 31% das pessoas não têm nenhuma reserva (Anbima, Raio X 2026).
   - [E] Karlan e outros (2016): lembretes que citam a meta da própria pessoa aumentam a poupança.
   - Depende de: B.
   - Situação: feito em 09/10/2026 (D-027), com o plano de guardar (D-036) e o simulador do Ciclo D (D-028).
   - Risco: dizer onde guardar, o que esbarra nas regras da CVM. Fica fora.
7. **Previsão dos pagamentos do mês, só em `/a-pagar` e só no mês atual.**
   - Texto: "Se pagar tudo o que está em aberto, os pagamentos de outubro chegam a R$ X", com a linha "Inclui R$ Y estimados".
   - Valor: pessoa A, empresa M. Esforço: S.
   - [E] Simplifi e Monarch mostram previsão do mês.
   - [O] O número vale só no mês atual: vencidas antigas pagas hoje entram em Pago do mês corrente (D-021(1)). Não usa "Diferença", que o CL C004 reserva para valores realizados, e nunca vai para o Resumo.
   - Depende de: nada no banco; usa os mesmos totais do card "Ainda a pagar". Pode sair junto com o B.
   - Situação: feito em 09/10/2026, junto com o B (D-026(10)).
   - Risco: ser lido como saldo. Por isso nunca usa "disponível" nem "sobra".
8. **Ocultar valores e bloqueio por biometria.**
   - Valor: pessoa M, empresa A. Esforço: S.
   - [O] O app é usado no ambiente de trabalho, e isso é condição para um widget no futuro (`spec2` §7.11).
   - Depende de: `expo-local-authentication` instalado com `npx expo install`, no mesmo build do A2.
   - Situação: feito em 09/10/2026 (D-025). Falta o teste em aparelho.
   - Risco: a pessoa ficar sem acesso. Saída: usar a senha do aparelho.
9. **Orçamento por categoria e limite pessoal de comprometimento** (`spec2` §7.4).
   - A pessoa escolhe o limite e recebe um aviso neutro ao chegar perto.
   - Valor: pessoa A, empresa M. Esforço: M (banco, funções e testes).
   - [E] As Instruções v2.1 põem "orçamento" no núcleo proposto. Mobills, Organizze e Simplifi têm.
   - Depende de: item 5 e B.
   - Risco: tom de julgamento ("estourou" é proibido).
10. **Plano para sair das dívidas, educativo.**
    - Lista as dívidas cadastradas, compara "maior taxa primeiro" com "menor dívida primeiro" usando as taxas digitadas e mostra o efeito de quitar antes.
    - Valor: pessoa A, empresa A. Esforço: M.
    - [E] 81,7 milhões de CPFs negativados (Serasa, fevereiro de 2026).
    - [E] 66% das pessoas que trabalham relatam estresse por causa das dívidas (SalaryFits, 2025) [!].
    - [E] O YNAB tem um planejador de quitação.
    - Depende de: calculadoras 2 e 3, e B.
    - Riscos: não sugerir renegociação nem crédito (D-032(5)). Orientar a negociar com o credor só se o parecer permitir (decisão 5). Programas públicos mudam rápido: o Desenrola 2.0 perdeu a validade em 31/08/2026, e a MP 1.393/2026 cria outro.
    - Situação: feito em 10/10/2026 (D-040, Ciclo F1), com a ordem proposta aprovada por Enzo ("sim"). É a nona calculadora, "Em que ordem quitar as dívidas?" (`/calcular/plano-dividas`), só no core e no app: lê os parcelamentos ativos sem alterar nada, compara "Maior taxa primeiro" com "Menor dívida primeiro" lado a lado, com "Sem valor a mais" como referência, e nunca diz qual ordem é a certa. Não sugere renegociação, crédito nem taxa; o programa público do Desenrola não aparece. Falta: teste em aparelho e o tema de Aprender que explique as duas ordens, com fonte (`docs/04`).
11. **Assinaturas.**
    - Marcador nos gastos fixos, custo no ano (calculadora 8) e lembrete para revisar.
    - Valor: pessoa M, empresa M. Esforço: S, ou M se precisar de campo novo no banco.
    - [E] 46% pagam mais de R$ 100 por mês em assinaturas (Vindi, 2026, pela soma das faixas de R$ 101 a R$ 200 e de R$ 201 a R$ 500).
    - Risco: sem conexão bancária, a lista é manual.
12. **"Seu mês em 30 segundos" e resumo da semana.**
    - Valor: pessoa M, empresa M. Esforço: M.
    - [E] O Copilot tem revisão do mês e do ano; Karlan (2016) mostra o efeito de lembrar a meta.
    - Depende de: A2, para o aviso.
    - Riscos: celebração automática ou comparação que julga; compartilhar só sem valores.
13. **Conteúdo de época.**
    - Contas do ano em janeiro, 13º em novembro e IR em março, em Aprender, na aba Metas e num texto pronto para o RH divulgar.
    - Valor: pessoa M, empresa A. Esforço: S.
    - [E] O 13º de 2025 foi projetado em R$ 369,4 bilhões (Dieese).
    - Depende de: A3 (contas do ano) e A5 (temas com fonte conferida).
    - Risco: calcular imposto. Fica só a explicação.
14. **Exportar meus dados** (planilha e PDF).
    - Valor: pessoa M, empresa M. Esforço: M.
    - [E] Direito de portabilidade da LGPD (art. 18); ajuda na declaração de IR.
    - Depende de: uma função de leitura que respeite as permissões do banco (RLS), com teste em `supabase/tests`.
    - Risco: arquivo com dado sensível fora do app.
15. **Notas fiscais NFC-e, fase 1** (QR: loja, data e total). **Situação em 10/10/2026: implementado no Ciclo E (D-038), além da fase 1.** Câmera, PDF do DANFE e "Colar o link ou a chave" estão em Anotar gasto; a leitura automática da página oficial (loja, valor, data e, desde D-042, a forma de pagamento) vale no celular e só no RJ, e só foi testada com páginas sintéticas. O aceite com notas reais (P-025), o teste em aparelho e a cobertura de outros estados ficam abertos. A dependência "parecer jurídico" abaixo não vale mais (D-034(5)).
    - Valor: pessoa M, empresa M. Esforço: M/L.
    - [E] Um trabalho da UFGD mostra que os apps que leem a nota quase só usam a data e o total.
    - Depende de: parecer jurídico e câmera.
    - Riscos: as páginas das Secretarias da Fazenda mudam e variam por estado; não guardar o CPF.

**Para a empresa que oferece o benefício** [O]:

- **Índice:** o Índice de Saúde Financeira da Febraban, feito com apoio técnico do Banco Central, tem 4 dimensões [E]. Cada uma é coberta por estes itens:

| Dimensão | Itens que cobrem |
|---|---|
| Habilidade | Calculadoras e Aprender |
| Comportamento | Lembretes, contas em dia e orçamento |
| Segurança | Reserva e renda comprometida |
| Liberdade | Metas |

- **Promessa:** não prometer melhora medida no índice.
- **Contexto de venda:** a NR-1 incluiu os riscos psicossociais na gestão de riscos das empresas (Portaria MTE 1.419/2024), com fiscalização marcada para começar em 26/05/2026 [E]. Uma notícia fala em suspensão das multas por 90 dias pelo STF (ADPF 1316) até 23/09/2026, e a situação atual precisa ser conferida [!]. A norma trata de riscos ligados ao trabalho e não cita dívidas, então o argumento é indireto [O].
- **Privacidade:** a garantia de que a empresa não vê nenhum dado, nem somado, continua igual.

**O que evitar:**

- tom de deboche sobre gastos;
- adiantamento de salário e oferta de crédito;
- conexão bancária agora;
- cursos longos e soltos, porque o efeito da educação some com o tempo (Fernandes e outros, 2014).

## 6. Roteiro recomendado

| Passo | O quê | Esforço | O que Enzo vê |
|---|---|---|---|
| 0 | Fechar o A3 (contas do ano) e terminar Primeiros passos e "Organizar" em Movimentos | Feito em 08/10/2026 (D-029, D-033) | IPVA e IPTU em Gastos fixos › Contas do ano; conta nova com 3 primeiros passos; Contas a pagar e Gastos fixos com nome em Movimentos |
| 1 | **Achar tudo**, sem banco: card em Metas, "Já paguei" na lista, "Por categoria" na composição, atalhos do ícone na web | S/M, 3 a 5 dias | Pagar uma conta com 3 toques; quanto foi para Mercado no mês; atalho "Contas a pagar" ao pressionar o ícone no Android |
| 2 | **Calculadoras**, sem banco: `learn/math.ts` adiantado, `/calcular` com 7 (ou 8) calculadoras, "Somar valores", links de contexto, linha em Movimentos, cards em Aprender e Metas, link na Família | M/L, 8 a 12 dias | "Parcelado ou à vista? Fazer a conta" no parcelamento; "Calcular multa e juros" numa conta vencida; "35,90" e "12,50" viram R$ 48,40 |
| 2' | **A2 Lembretes**, em paralelo, com ocultar valores e biometria no mesmo build de desenvolvimento | M | Interruptor em Conta; aviso "Você tem 3 contas com vencimento amanhã."; olho para ocultar valores |
| 3 | **A4** Seus últimos meses | M | Faixa no Resumo depois de 45 dias sem anotar, com "Atualizar agora" |
| 4 | **A5** Aprender e dúvidas, mais leve porque o motor de contas já existe | M | Busca, 35 temas, "O que é isso?" nas telas, "Fazer a conta com os seus números" |
| 5 | **B** Renda comprometida, com a previsão dos pagamentos do mês em `/a-pagar` | M | Linha dentro do card "Ainda a pagar"; tela com medidor e próximos meses |
| 6 | **C** Metas e reserva | L | Aba Metas completa; a calculadora da reserva passa a "Criar reserva" |
| 7 | **D** Simulador, só simulação e sem indicar produto (D-028, D-034(5)) | S/M | "Juntar para um objetivo" ganha a taxa, a inflação e "Quanto posso ter" |
| 8 | Seção 5, nesta ordem: busca de registros, orçamento por categoria, plano para sair das dívidas, assinaturas, "Seu mês", exportar, NFC-e (feita no Ciclo E, D-038) e widget com valores ocultos | Varia | Uma entrega por vez |

- **Ciclos seguintes:** o Ciclo 2 (Família) e os demais continuam como em `docs/04`. O conteúdo de época (item 13) pode sair antes, como texto para o RH.
- **Resumo:** antes de qualquer mudança, o protótipo com 5 pessoas da seção 2.4. Ele pode correr junto do passo 1.
- **Verificações:**
  - Passos 1 e 2: não mexem no banco. Pedem `npm test`, `npm run typecheck` e `npm run test:web`, mais os vetores da `spec3` §3.11 no passo 2.
  - Passos com banco (B, C, busca, orçamento e talvez assinaturas): pedem também `npm run test:db` e testes em `supabase/tests`.
  - Só vou informar as verificações realmente executadas.
- **Arquivos que os passos 1 e 2 tocam:**
  - Telas que já existem: `(tabs)/movimentacoes.tsx`, `(tabs)/metas.tsx`, `(tabs)/aprender.tsx`, `_layout.tsx` (rotas novas), `a-pagar/index.tsx`, `a-pagar/[id]/index.tsx`, `composicao.tsx`, `gastos-fixos/index.tsx`, `gastos-fixos/[id]/index.tsx`, `gastos-fixos/novo.tsx`, `components/family-state.tsx`, os formulários com campo Valor e `public/manifest.webmanifest`.
  - Arquivos novos: `app/calcular/index.tsx`, `app/calcular/[slug].tsx` e as contas em `packages/core`.

## 7. Decisões que precisam do Enzo

Respondidas em 08/10/2026 (D-034): 1, 2 e 3 aprovadas; 4 refeita de forma mais simples, com o Resumo como está até a resposta; 5, sem parecer jurídico: o app presta só informações públicas já disponíveis.

A pergunta 4 foi respondida em 09/10/2026, com a auditoria de `docs/10`, e registrada em D-039(2): "Ver contas ›" no card "Ainda a pagar" e "›" em Recebido e Pago (Enzo: "Sim"). A fileira de atalhos e o botão "Mais" ficaram de fora.

1. **Ordem:** posso fazer o "Achar tudo" e as calculadoras logo depois das contas do ano, antes de "Seus últimos meses"?
   - Isso muda a ordem combinada em D-023, mas não muda nenhuma tela aprovada.
   - "Juntar para um objetivo" é a primeira parte do simulador do Ciclo D, que depois ganha a taxa.
   - Recomendo que sim.
2. **Lugar e nome:** a tela se chama "Calculadoras", com portas em Movimentos, Metas e Aprender e links na hora da decisão, e o Resumo não muda. Está bom assim, com a lista da seção 3?
3. **Quitar antes e cota única:** aceita que o app mostre um valor **estimado** para quitar ou adiantar parcelas, com a taxa que a pessoa digita e o aviso de que o valor oficial vem da instituição? Aceita também a conta "cota única ou parcelado" na conta do ano?
   - Isso muda o que D-024 e D-029 deixaram de fora.
   - Recomendo que sim, nunca com o nome "saldo devedor".
4. **Resumo:** qual destas opções você prefere?
   - (a) manter como está (recomendo);
   - (b) só acrescentar "Ver todas" no card "Ainda a pagar";
   - (c) testar com protótipo a fileira de 4 atalhos ou o botão "Mais". A fileira tira "Ainda a pagar" da primeira tela nos celulares pequenos.
5. **Parecer jurídico agora:** posso pedir já o parecer de P-016, ampliado? Ele cobriria:
   - as calculadoras de dívida (CDC);
   - o simulador;
   - os textos de reserva;
   - se o plano para sair das dívidas pode orientar a negociar com o credor (hoje proibido por D-032(5)).

   Pedir agora evita travar a venda para empresas depois.

## Fontes

**Pesquisa** (consultadas por busca em 08/10/2026; páginas originais a conferir):

- Comportamento e educação:
  - [Medina, RFS 2021](https://ideas.repec.org/a/oup/rfinst/v34y2021i5p2580-2607..html)
  - [Karlan e outros, 2016](https://pubsonline.informs.org/doi/suppl/10.1287/mnsc.2015.2296)
  - [Fernandes, Lynch e Netemeyer, 2014](https://papers.ssrn.com/abstract=2333898)
  - [RevenueCat 2026](https://www.revenuecat.com/sosa-2026-insights-part-2), com a cobertura de [9to5Mac](https://9to5mac.com/2026/05/27/new-report-shows-annual-app-subscribers-rarely-return-after-they-cancel/) e [PPC Land](https://ppc.land/95-of-annual-app-subscribers-who-cancel-never-return-revenuecat-finds/)
- Endividamento e crédito:
  - Peic/CNC: [agosto de 2026 (Gazeta do Povo)](https://www.gazetadopovo.com.br/economia/dividas-atingem-82-familias-baixa-renda-sofre-alta-inadimplencia/) e [julho de 2026, com o tempo médio de atraso (Mercado e Consumo)](https://mercadoeconsumo.com.br/06/08/2026/noticias/cnc-endividamento-das-familias-sobe-para-82-mas-inadimplencia-cai/). A Peic de setembro de 2026 ainda não foi encontrada.
  - [Banco Central, 14,3%](https://convergenciadigital.com.br/governo/banco-central-brasileiro-no-sabe-calcular-juros-mas-conhece-apps-financeiros-e-adora-pix)
  - [Rotativo em agosto de 2026](https://www.jornaldocomercio.com/economia/2026/09/1265047-juro-medio-do-rotativo-do-cartao-de-credito-sobe-a-4449-ao-ano-em-agosto-diz-bc.html)
  - [Comprometimento recorde](https://www.poder360.com.br/poder-economia/endividamento-das-familias-atinge-maxima-historica-diz-bc/)
  - [Abecs](https://www.portalin.com.br/negocios/uso-de-cartoes-supera-r-41-trilhoes-em-um-ano-pela-primeira-vez-no-brasil/)
  - [Consignado CLT](https://diariodocomercio.com.br/financas/consignado-clt-empresta-r-117-bi-um-ano-mas-juros-ainda-sao-desafio/)
  - [Serasa, 81,7 milhões](https://timesbrasil.com.br/brasil/economia-brasileira/brasil-atinge-817-milhoes-de-inadimplentes-em-fevereiro-de-2026-maior-nivel-da-serie-diz-serasa/)
  - [Desenrola 2.0](https://www.poder360.com.br/poder-congresso/novo-desenrola-brasil-perde-validade-apos-mp-nao-virar-lei/)
  - [SalaryFits, 66% (Viva)](https://viva.com.br/dinheiro/pesquisa-2-em-cada-3-trabalhadores-relatam-estresse-por-causa-de-dividas.html)
- Reserva, renda e consumo:
  - [Anbima, reserva](https://investidor10.com.br/noticias/reserva-de-emergencia-acima-de-6-meses-so-24-dos-brasileiros-tem-veja-panorama-119838/)
  - [Vindi, assinaturas (Canaltech)](https://canaltech.com.br/mercado/quase-50-dos-brasileiros-gastam-mais-de-r-100-com-assinaturas-por-mes/)
  - [Dieese, 13º](https://www.dieese.org.br/notaaimprensa/2025/decimoTerceiroSalario2025.html)
- Empresas:
  - [Índice de Saúde Financeira, 4 dimensões (InvestNews)](https://investnews.com.br/financas/febraban-lanca-indice-de-saude-financeira-do-brasileiro/)
  - [Febraban 2024](https://static.poder360.com.br/2024/10/Febraban-saude-financeira-2024.pdf)
  - [NR-1, fiscalização a partir de 26 de maio](https://contadores.cnt.br/projetos/46/noticias/tecnicas/2026/04/28/apos-adiamentos-nr-1-entra-em-fase-de-fiscalizacao-em-26-de-maio.html) e [suspensão das multas pelo STF, a conferir (Jornal Contábil)](https://jornalcontabil.com.br/noticia/nr-1-e-saude-mental-empresas-tem-ate-dia-23-para-se-ajustar/amp/)
- Navegação:
  - [NN/g, Hamburger menus](https://www.nngroup.com/articles/hamburger-menus/)
  - [NN/g, Icon usability](https://www.nngroup.com/articles/icon-usability/)
  - [Apple HIG, Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)
  - [Can I Use, atalhos do manifesto](https://caniuse.com/mdn-manifests_webapp_shortcuts)
  - [expo-quick-actions](https://npmjs.com/package/expo-quick-actions)
- Concorrentes:
  - [Mobills](https://www.mobills.com.br/planos/)
  - [Monarch](https://monarchmoney.com/features/recurring)
  - [Copilot](https://help.copilot.money/en/articles/10310024-month-and-year-in-review)
  - [YNAB Loan Planner](https://www.ynab.com/ynab-loan-planner/)
  - [Simplifi](https://quicken.com/features/manage-your-budget)
  - [NFC-e (UFGD)](https://repositorio.ufgd.edu.br/jspui/bitstream/prefix/4644/1/EricHenriqueHellerLopes.pdf)
- Normas: as citações de Lei 13.455/2017, Lei 14.690/2023, Res. CMN 4.549/2017, 4.765/2019, 5.004/2022 e 5.112/2023, CDC art. 52 e CVM Portal do Investidor seguem as fontes listadas nos temas da `spec3` (Anexo A), com data de consulta.

**Retirados por não se confirmarem:**

- "65% precisariam de empréstimo para cobrir 1 mês de renda";
- os números da Mercer Marsh;
- "4 em 10 não usam o que assinam";
- "5 componentes" do índice da Febraban;
- as resoluções de tela da StatCounter;
- os 57% e 86% da NN/g;
- a Peic de setembro de 2026.

**Lidos, só para leitura:**

- `/home/user/clarevo/docs/00_VISAO_E_DECISOES.md`
- `docs/referencias/CLAREVO_Primeiro_Ciclo_para_Claude_v1.0.md` e `CLAREVO_Instrucoes_do_Projeto_v2.1.md`
- `apps/app/src/app/(tabs)/movimentacoes.tsx` e `metas.tsx`
- `apps/app/src/app/a-pagar/index.tsx` e `vencidas.tsx`
- `apps/app/src/app/gastos-fixos/novo.tsx` e `composicao.tsx`
- `apps/app/src/lib/topics.ts`, os campos Valor dos formulários e `public/manifest.webmanifest`
- `packages/core/src/records.ts`
- `scratchpad/spec2.md` (§1.3 a 1.6, 4.4, 4.6, 4.7, 5, 7) e `spec3.md` (§0, 3.2, 3.7, 3.11, 3.14 a 3.16, 4, Anexo A)
- `scratchpad/navprobe/nav_options.md`

Exemplos recalculados em `scratchpad/final_doc/vec.py`. Nenhum teste do projeto foi executado, porque nada foi alterado.
