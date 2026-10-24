# Redes sociais (D-067): o que o app e o site entregam ao Guia v2.0 e ao Playbook v2.1

24/10/2026. O Playbook de Redes Sociais v2.1 pede, antes de publicar qualquer peça sobre o app, **telas e gravações reais, conferidas, com dados fictícios identificados**, e uma **ficha de afirmações sobre o app**. Este documento é essa ficha (seção 1), registra as gravações e capturas feitas com a demonstração (seção 2), relata o que os gráficos do app e do site cumprem das regras do Guia v2.0 (seção 3), traz a decisão sobre métricas sem rastreamento (seção 4) e lista o que mudou no site e nas lojas e o que fica pendente (seções 5 e 6). O resumo dos dois materiais, com o que é oficial e o que é proposta, está em `docs/referencias/redes-sociais-e-guia-visual.md`. Sem nomes de pessoas: "proprietária", "assistente", "integrante" e "marketing".

**Decisões de Enzo de 24/10/2026 que valem aqui** (a registrar em `docs/00`): (1) a peça P03 usa a "versão com acesso em preparação" até o piloto; (2) as métricas são as da seção 4, sem rastreamento; (3) a frase do Clarevo passa a ser "Mais clareza para decidir", no lugar de "Organize seu mês e aprenda" (a bio sugerida do Instagram é "Seu mês com mais clareza.", só aqui). O núcleo da marca não muda: azul `#2457F5`, lima `#D4F05B`, texto `#17223B`, Manrope, "clarevo." nos cabeçalhos e o C só como ícone.

## 1. Ficha de afirmações sobre o app

**Versão testada:** commit `f5bb473` (base deste ciclo), app 1.0.0 (`apps/app/app.json`), build de demonstração gerado por `npm --workspace apps/app run export:demo` em 24/10/2026. O código do app e do core não mudou neste ciclo (`git diff f5bb473 -- apps/app/src packages/core/src` vazio), então a ficha vale para o commit que fechar o ciclo. **Data:** as gravações são de 23/10/2026 à noite em Brasília (24/10/2026 em UTC); a ficha, de 24/10/2026. **Responsável:** a conferência técnica foi feita por Claude; o responsável pelo produto, que o Playbook manda nomear, **está a designar** e precisa refazer o teste na versão que for ao ar. **Evidência:** a tela, o arquivo e a decisão de cada linha; um item de menu visto numa gravação só prova a presença na interface, então as quatro peças de demonstração (P02, P05, P08 e P11) foram gravadas **até o fim do fluxo**.

Situações: **Confirmado** (o app de hoje sustenta o texto), **Ajustar texto** (existe, mas o nome, o número ou a conta do Playbook não bate com a tela; a redação sugerida vem na última coluna) e **Não existe** (não dizer).

### 1.1 Peça por peça

| Peça | Afirmação do Playbook | Situação | Evidência | Redação sugerida |
|---|---|---|---|---|
| P01 | "O Clarevo é um aplicativo de finanças pessoais e familiares para organizar o dinheiro e apoiar decisões do dia a dia" | Confirmado | Contextos Pessoal e Família (D-055); `site/index.html`; ficha das lojas | Manter |
| P01 | "Comparar o que você planejou com o que registrou no orçamento" (página 4) | Ajustar texto | Tela Orçamento por categoria (D-041): mostra "Orçado", "Usado" e "Faltam" ou "acima". O usado é por competência (a compra no cartão conta a parcela no mês da compra, mesmo antes de a fatura ser paga), e "registrado" não é o nome do campo. Capturas `orcamento-1` e `orcamento-2` | "Um exemplo é comparar o que você orçou com o que usou no mês, categoria por categoria." |
| P01 | "O Clarevo reúne organização do dinheiro e educação"; "não anunciar a educação dentro do app se ela estiver só no perfil" | Confirmado | A aba Aprender traz temas com fonte e data de revisão, sem recomendar produto (D-031, D-032, D-053; `packages/core/src/learn`) | Manter. Dizer "Aprender: explicações curtas, com fonte e data de revisão" |
| P02 | "Neste exemplo fictício, planejamos R$ 600 ... Os registros somam R$ 450. A diferença é R$ 150" | Ajustar texto | Na demonstração de outubro: Mercado, R$ 1.400,00 usados de R$ 1.800,00, 77,8%, faltam R$ 400,00; Lazer, R$ 400,00 de R$ 300,00, R$ 100,00 acima. A tela usa "Orçado", "Usado", "Faltam" e "acima do orçamento", não "planejado", "registrado" e "diferença". Gravação P02 | A narração gravada, com os números da tela (seção 2.1) |
| P02 | "Essa diferença precisa ser lida junto com despesas que ainda virão. Ela não é uma autorização automática para gastar." | Confirmado | O orçamento mede o usado no mês, não o dinheiro disponível (`BUDGET_TEXT.versusPaid`); o app nunca chama o que falta de "saldo" | Manter; acrescentar "nem saldo" |
| P02 | "Conferir os nomes dos campos, o cálculo e o período usado no app" | Confirmado | Período: o mês escolhido ("Pessoal · Outubro de 2026"); a regra de competência está escrita na própria tela | Dizer "em outubro" na narração |
| P02 | Capa "Planejado e gasto no mesmo exemplo" | Ajustar texto | Os nomes da tela são orçado e usado | "Orçado e usado no mesmo exemplo" |
| P03 | Acesso, dispositivos, preço, primeira tarefa e canal de ajuda | **Versão com acesso em preparação** | Hoje existem a demonstração (`https://clarevo-demo.pages.dev`) e a versão web com login, que ainda não abriu a outras pessoas; cadastro de pessoas reais só no piloto (D-064); nada está nas lojas (`docs/17`, perguntas C1 e C2; `docs/16`); preço indefinido (P-005); o e-mail de suporte ainda é marcador | Seção 1.3 |
| P04 | "Comece pelo saldo de hoje" e "R$ 900 na conta" | Não existe (no app) | O app não calcula nem mostra saldo de conta: "Diferença do mês" é Recebido menos Pago e a tela escreve "não é saldo" (D-022, `docs/17`); as contas de origem não têm saldo (D-043) | Deixar a peça como educação (o saldo é o que a pessoa vê no banco) e não mostrar tela do app como saldo |
| P04 | "R$ 650 em despesas ainda previstas" | Confirmado como número da demonstração | "Ainda a pagar neste mês: R$ 650,00" (2 contas, próxima: Internet, 15/10). Capturas `resumo-diferenca-do-mes` e `contas-a-pagar-1` e `-2` | Se citar o app: "No Clarevo, as contas que ainda vão vencer ficam separadas, em 'Ainda a pagar neste mês'. A Diferença do mês é o recebido menos o pago, e não é saldo." |
| P04 | "A diferença de R$ 250 ..." | Ajustar texto | É a conta do exemplo (R$ 900 menos R$ 650); o app não faz essa conta | Chamar de "diferença do exemplo", nunca de "Diferença do mês" |
| P05 | "Abrimos a área de orçamento" | Confirmado | Movimentos, Organizar, "Orçamento por categoria" | Manter |
| P05 | "Preenchemos o nome e o valor planejado e salvamos" | Ajustar texto | Não há campo de nome. A pessoa escolhe uma das seis categorias (Moradia, Mercado, Transporte, Saúde, Educação, Lazer) em "Definir orçamento" e preenche "Valor por mês" (de R$ 1,00 a R$ 9.999.999,99) e "A partir de" (D-041) | "Escolhemos a categoria, preenchemos o valor por mês e salvamos" |
| P05 | "R$ 600 para alimentação" | Ajustar texto | Não existe a categoria "Alimentação"; a mais próxima é Mercado, que já tem orçamento na demonstração. A gravação usa Transporte, R$ 600,00 | Citar uma das seis categorias reais |
| P05 | "Mostrar o salvamento e o item criado" | Confirmado | Aviso "Orçamento de Transporte salvo. Vale a partir de outubro." e o card "Transporte, R$ 0,00 de R$ 600,00, faltam R$ 600,00"; o total orçado passa de R$ 4.600,00 para R$ 5.200,00. Gravação P05 | Narração gravada (seção 2.2) |
| P06 | "O que já está comprometido neste mês?" e "levar perguntas assim para tarefas do Clarevo" | Confirmado | "Ainda a pagar neste mês" e "Renda comprometida" (D-026; 52,5% em outubro na demonstração, com renda de referência informada) | Se mostrar tela, usar o Resumo e dizer que a renda comprometida precisa da renda de referência. A atuação da integrante é conferida com ela, fora desta ficha |
| P07 | "6 parcelas de R$ 120 somam R$ 720; à vista R$ 650; diferença de R$ 70" | Confirmado | A calculadora "Parcelado ou à vista?" (app e site) dá "o parcelado custa R$ 70,00 a mais", "Total parcelado: R$ 720,00 (6 × R$ 120,00)" e "juros de 3,00% ao mês (42,62% ao ano)" (`packages/core/src/calculators/parcelado-ou-a-vista.ts`) | Se citar a taxa, dizer que é a que iguala as parcelas ao preço à vista, em juros compostos; não é CET nem "diferença percentual de preços" (regra do Guia) |
| P08 | "Criar uma meta e registrar as informações que a tela pede" | Confirmado | Nova meta: tipo (Objetivo ou Reserva de oportunidade), modelo de nome (Viagem, Troca do carro, Entrada do imóvel, Estudos, Outro), nome, valor da meta, "Até quando?" (opcional), "Quanto você já tem guardado" (opcional) e "Quanto pretende guardar por mês" (opcional). Gravação P08 | Manter |
| P08 | "Depois de salvar, confira o que o app mostra sobre o progresso" | Confirmado | Após "Criar meta": "Meta criada.", R$ 600,00 de R$ 3.000,00, 20%, faltam R$ 2.400,00, e o plano ("Até junho de 2027: R$ 266,67 por mês", "chega lá em maio de 2027" com R$ 300,00 por mês, sem rendimentos) | Narração gravada (seção 2.3) |
| P08 | "Não narrar contribuição automática, previsão de rendimento ou transferência" | Confirmado | A meta mostra só o que a pessoa registra: "O Clarevo não guarda nem movimenta dinheiro" (D-027). Aporte é um registro feito à mão | Dizer isso na narração, como gravado |
| P09 | "Relacionar esse olhar com o registro e a revisão do orçamento" | Confirmado | Anotar gasto, Orçamento por categoria e Seu mês em 30 segundos existem | Manter. A função profissional da integrante só aparece se ela confirmar |
| P10 | "Veja se os registros do período estão completos" | Confirmado | "Conferi este mês" para mês sem registros (D-060) e a revisão de "Seus últimos meses" (D-030) | Manter |
| P10 | "Compare o planejado com o registrado nas categorias" | Ajustar texto | Orçamento por categoria: orçado e usado | "Compare o orçado com o usado nas categorias que você acompanha" |
| P10 | "Observe a diferença e procure uma explicação" | Confirmado | "Seu mês em 30 segundos" compara com o mês anterior (por exemplo, "R$ 150,00 a mais que em setembro" em Mercado) e "Entender o que mudou" na Evolução descreve a diferença sem apontar causa (D-052, D-057). Capturas `seu-mes-1` e `seu-mes-2` | Manter |
| P10 | "Revise o próximo mês com base nos compromissos já conhecidos" | Confirmado | Análises, "Próximos meses" (sempre "previsto") e Contas a pagar | Manter |
| P11 | "No exemplo fictício, vamos registrar R$ 35" | Confirmado | Gravação P11: Farmácia, R$ 35,00, categoria Saúde | Manter |
| P11 | "Confira os campos que esta versão pede" | Confirmado | Anotar gasto: Descrição, Valor em reais, "Como você pagou?" (Dinheiro, débito ou Pix, ou Cartão de crédito), "Saiu de" (conta), Data do pagamento (Hoje, Ontem ou digitar) e Categoria; no alto, "Escanear nota fiscal" (opcional) | Dizer "descrição, valor e categoria", como gravado |
| P11 | "Salve e veja se o registro aparece corretamente" | Confirmado | Tela "Gasto salvo"; no Resumo, Pago de R$ 3.900,00 para R$ 3.935,00 e Diferença do mês de R$ 2.100,00 para R$ 2.065,00; o gasto entra em "Pagamentos do mês" | Narração gravada (seção 2.4) |
| P11 | "Reduzir a dúvida da primeira tarefa" | Ajustar texto | Uma conta nova abre vazia, sem dados de exemplo (regra do produto); a demonstração já tem registros e é onde se grava. O primeiro registro de uma conta nova aparece no cartão "Primeiros passos" | Dizer "Na sua conta, o primeiro registro começa do zero" |
| P11 | "Consulte o destaque Ajuda pelo canal informado" | A decidir | A Ajuda do site existe, mas o canal de contato (e-mail de suporte) ainda é marcador | Só citar o canal depois de definido |
| P12 | "A orientação para esta versão é ..." e "Não envie senha ou dados bancários" | Confirmado, com o acesso em preparação | O suporte nunca pede senha, cartão nem dados bancários (`site/suporte.html`, `docs/17` A4); o acesso é o da peça P03 | A resposta de acesso é a de P03, e o canal de ajuda é a definir |
| T01 | Exemplo fictício de assinaturas (R$ 200 viram R$ 150, R$ 600 em 12 meses, meta de R$ 1.200) | Sem afirmação sobre o app | Se citar o app: o Clarevo tem Assinaturas (D-046) e Metas "sem contar rendimentos"; guardar é registrar um aporte, não há transferência automática | "A diferença só é acumulada se você separar o valor" (já está no texto) |
| T02 | Formato em circulação, escolhido na revisão semanal | A definir | A alternativa perene é P09 | Conferir a peça quando a pauta existir |
| R01 | "R$ 4.200 menos R$ 2.550 menos R$ 800, igual a R$ 850, diferença após essas despesas" | Ajustar texto | No app a Diferença do mês é só Recebido menos Pago (aqui, R$ 4.200 menos R$ 2.550, igual a R$ 1.650), e o "Ainda a pagar" (R$ 800) fica à parte. A conta de R$ 850 é do exemplo. A lâmina 8 do Guia usa a mesma conta | Rotular como "sobra do exemplo, depois das contas que ainda vencem"; nunca "Diferença do mês" nem tela do app. Não simular tela do app com o calendário editorial (regra do Playbook) |

### 1.2 Afirmações que atravessam as peças

| Afirmação | Situação | Evidência |
|---|---|---|
| Família (acesso familiar) | **Existe**, com limites | Até 6 pessoas, titular, "anota e vê" e "só vê", convite por link de uso único válido por 7 dias, sair e encerrar (D-055). Aberta a todas as pessoas durante o piloto. A demonstração não tem Família de exemplo: não há gravação, então qualquer peça sobre Família precisa de conferência própria |
| Integração bancária, conexão com o banco | **Não existe** | Fora do ciclo (D-008, `docs/11`). Existem a importação de extrato e fatura em arquivo OFX ou CSV (D-048) e de comprovante em PDF (D-051), escolhidos pela pessoa. A leitura de nota fiscal só foi testada com documentos sintéticos (P-025, P-026): não anunciar |
| "Saldo" | **Não existe** | "Diferença do mês" é Recebido menos Pago e diz "não é saldo"; sem saldo por conta (D-022, D-043) |
| Crédito e produtos financeiros | **Não existe** | O app não oferece crédito nem recomenda produto; as calculadoras e o simulador usam só os números que a pessoa digita |
| Educação dentro do app | Confirmado | Aprender (D-031, D-032, D-053), com fonte e data de revisão |
| Plataformas | Ajustar texto | Versão web (e a demonstração) sim; iPhone pela versão web com "Adicionar à Tela de Início" é o plano do piloto (D-064); nada nas lojas; lembretes, widget e biometria só existem no app das lojas, não na web (`docs/17`, seção 1). Preencher em P03 só o que foi testado |
| Preço, "grátis", "teste gratuito" | **Não existe** | Preço e planos indefinidos (P-005); a cobrança não existe |
| Convites para empresas, relatórios | Confirmado, com limite | Painel só na web, sem finanças, com relatório de adesão em planilha ou PDF só com contagens (D-056, D-062). Propostas para empresas só entram quando a oferta e o acesso estiverem confirmados |
| Exportar os dados, excluir a conta | Confirmado | "Exportar meus dados" (CSV ou PDF) e "Excluir minha conta" dentro do app (D-058, textos legais a confirmar com advogado) |
| Segurança, LGPD | Não afirmar | `docs/17`, seção 4: não afirmar conformidade nem segurança absoluta |

### 1.3 P03: a versão com acesso em preparação

Registro da equipe (a ficha de acesso do Playbook), preenchido com o que existe hoje:

| Informação | Registro |
|---|---|
| Destino oficial e forma de acesso | Link da bio para `comece.html` (o site ainda não está no ar: depende do domínio e da revisão do advogado; o endereço oficial do link da bio é decisão pendente). Hoje, só a demonstração e a versão web com login, ainda fechada |
| Dispositivos atendidos | Só navegador (testado no Chromium em roteiro automatizado). Sem loja, sem aparelho testado |
| Preço e condições | Nenhum (P-005). Não escrever "grátis" nem "teste gratuito" |
| Primeira tarefa e canal de ajuda | Primeira tarefa validada na demonstração: Anotar gasto (P11); canal de ajuda a definir (e-mail de suporte é marcador) |
| Versão e conferência | `f5bb473`, app 1.0.0, 24/10/2026, conferência técnica por Claude; responsável pelo produto a designar |

Texto sugerido (carrossel de 5 páginas, sem simular cadastro, lista de espera nem data):

1. Capa: "Como acompanhar a disponibilidade do Clarevo".
2. "O Clarevo está em fase de testes."
3. "A versão para pessoas e empresas abre no piloto. Quando houver novidade de acesso, ela aparece aqui e na página Novidades do site."
4. "Enquanto isso, dá para ver a demonstração, com dados fictícios, pelo link da bio." (com uma tela real conferida, como as de `capturas/`)
5. "Acompanhe este perfil para as próximas informações de acesso."

Legenda: "O Clarevo está em fase de testes. A versão para pessoas e empresas abre no piloto. Enquanto isso, você pode ver a demonstração, com dados fictícios, pelo link da bio. Acompanhe este perfil para as próximas informações de acesso."

**Bio sugerida** (a frase de marca acompanha a explicação, e a terceira linha troca a chamada, como o Playbook manda para esta versão):

```
Seu mês com mais clareza.
App de finanças pessoais e familiares.
Acompanhe as informações de acesso ↓
```

Quando o acesso abrir, mudam juntos: o texto de `ACESSO` em `scripts/site/paginas/comece.js` e a página Comece aqui, a peça P03, a bio e o destaque Comece aqui. Um problema de acesso bloqueia a chamada para cadastro (regra do Playbook).

## 2. Gravações e capturas reais

**Versão gravada:** a da seção 1 (commit `f5bb473`, app 1.0.0), demonstração de 07/10/2026 (dados fictícios, a etiqueta "Demonstração" no alto de cada tela). **Gravado em** 23/10/2026 à noite, em Brasília. **Como gravar de novo:**

```
node scripts/gravar-redes.js --saida <pasta>            grava tudo
node scripts/gravar-redes.js --so p02,p05,capturas ...   só estas peças (p02, p05, p08, p11, capturas)
node scripts/gravar-redes.js --build                     refaz o build de demonstração antes
```

O script usa `apps/app/dist` (o build de `export:demo`, o mesmo de `scripts/video-demonstracao.js`), sobe um servidor local, não faz nenhum pedido para fora de `localhost` (falha se algum tentar), grava o fluxo no Chromium do Playwright e converte com o `ffmpeg` que já existe. A demonstração aceita escrita (o gasto, o orçamento e a meta ficam só na memória da página, que é recriada a cada gravação), então **os quatro fluxos foram gravados até o fim**. A narração é montada com os números **lidos da tela** na hora da gravação, e o script falha se a tela não tiver o que a peça mostra. A pasta de saída desta gravação ficou em `/tmp/claude-0/-home-user/1580a5fb-b479-5b5b-aff6-916ff9dc81be/scratchpad/redes/` (os arquivos de mídia não vão para o repositório; a equipe copia para o lugar combinado). Ela também traz `manifesto.json` (versão, números lidos e narração) e `montagem.png`, uma folha de conferência com a capa e um quadro de cada vídeo e as capturas 4:5.

**Formato:** 1080 x 1920 (9:16), H.264 High, yuv420p, 25 quadros por segundo, `+faststart`, **sem áudio**, de 33 a 36 segundos cada, de 1,8 a 2,9 MB (conferido com `ffprobe`). O app aparece em 360 x 640 pontos ampliados 3 vezes, então o texto fica nítido e sem esticar imagem. O toque aparece como um círculo lima. A arte (pergunta na tela, "Exemplo fictício" enquanto os valores aparecerem, fonte, recortes, trilha) é da equipe, no Edits e no Canva. **Zonas livres do Playbook (250 px no topo e 350 px no rodapé):** o cabeçalho do app, com a etiqueta "Demonstração", fica nos primeiros 230 px, e a barra de abas, nos cerca de 210 px de baixo; os números de cada cena foram levados, na medida do possível, para a faixa do meio. A equipe precisa conferir a prévia no Instagram e, se o topo for coberto, repetir "Demonstração" ou "Exemplo fictício" dentro da área livre.

Cada vídeo traz: o `.mp4`; o `.srt` com a narração sugerida (tempos desta gravação); a capa (PNG de 1080 x 1920, um quadro do próprio vídeo, sem texto de arte); e 3 quadros de conferência, também tirados do MP4. Os tempos abaixo são os desta gravação.

### 2.1 P02: orçamento, o orçado e o usado (32,8 s, 2,6 MB)

Arquivos: `p02-orcamento-orcado-e-usado.mp4`, `.srt`, `-capa.png` (Mercado e Lazer) e `-conferencia-1`, `-2` e `-3.png` (Movimentos aos 0,5 s; Mercado e Lazer aos 15,1 s; o topo do orçamento aos 27,3 s). Fluxo: Movimentos, Organizar, "Orçamento por categoria" de outubro, Mercado e Lazer, a regra escrita na tela.

| Início | Narração sugerida, ajustada à tela |
|---|---|
| 0,0 s | Você sabe a diferença entre o que planejou e o que gastou? |
| 4,7 s | Neste exemplo fictício, o orçamento de Mercado é de R$ 1.800,00 por mês. |
| 9,4 s | Foram usados R$ 1.400,00, ou 77,8%. Faltam R$ 400,00. |
| 13,0 s | Em Lazer, o usado passou: R$ 400,00 de R$ 300,00, R$ 100,00 acima. |
| 17,4 s | Leia essa diferença junto com as despesas que ainda virão. Ela não é saldo nem autorização para gastar. |
| 24,1 s | O Clarevo mostra essa comparação em Orçamento por categoria. Para conhecer o acesso, veja o fixado Como acessar. |

O que o Playbook pediu e a tela não tem: "planejado", "registrado" e "diferença" (a tela diz orçado, usado, faltam e acima) e os R$ 600 e R$ 450 do exemplo (os números reais são os acima).

### 2.2 P05: começar o orçamento de uma categoria (34,4 s, 1,8 MB)

Arquivos: `p05-orcamento-comecar-uma-categoria.mp4`, `.srt`, `-capa.png` (o card de Transporte com R$ 0,00 de R$ 600,00) e `-conferencia-1`, `-2` e `-3.png` (o topo do orçamento aos 0,5 s; o valor digitado aos 10,4 s; o total depois de salvar aos 28,6 s). Fluxo: "Definir orçamento de Transporte", "Valor por mês" R$ 600, "Salvar orçamento", aviso "Orçamento de Transporte salvo. Vale a partir de outubro." e o card novo.

| Início | Narração sugerida, ajustada à tela |
|---|---|
| 0,0 s | Quanto você pretende gastar nesta categoria? |
| 4,3 s | No exemplo fictício, vamos orçar R$ 600,00 por mês para Transporte. |
| 8,7 s | Escolhemos a categoria e preenchemos o valor por mês. Ele vale a partir do mês escolhido. |
| 14,5 s | Ao salvar, o app avisa que o orçamento vale a partir de outubro. |
| 18,8 s | A categoria entra com R$ 0,00 usados de R$ 600,00, e o total orçado passa de R$ 4.600,00 para R$ 5.200,00. |
| 25,6 s | Depois, é preciso conferir os registros da categoria. Para saber como acessar o Clarevo, consulte o link da bio. |

A sequência terminou corretamente no teste, como o Playbook exige. Diferenças do roteiro original: não há "nome" para preencher (escolhe-se a categoria), a categoria é uma das seis do app e o valor aparece sem os centavos até a pessoa sair do campo.

### 2.3 P08: criar uma meta e ver o progresso (36,3 s, 2,6 MB)

Arquivos: `p08-meta-criar-e-ver-o-progresso.mp4`, `.srt`, `-capa.png` (a meta "Estudos" com 20%) e `-conferencia-1`, `-2` e `-3.png` (a aba Metas aos 0,5 s; o formulário preenchido aos 13,8 s; o detalhe da meta aos 26,3 s). Fluxo: aba Metas, "Nova meta", modelo "Estudos", valor R$ 3.000, prazo 06/2027, já guardado R$ 600 e R$ 300 por mês, "Criar meta".

| Início | Narração sugerida, ajustada à tela |
|---|---|
| 0,0 s | Qual é o próximo passo da sua meta? |
| 4,3 s | Neste exemplo fictício, vamos criar uma meta e registrar o que a tela pede. |
| 9,2 s | Escolhemos um modelo de nome, o valor, o prazo, quanto já está guardado e quanto pretende guardar por mês. |
| 17,6 s | Depois de salvar, o app mostra R$ 600,00 guardados de R$ 3.000,00, 20%, e faltam R$ 2.400,00. |
| 23,6 s | Com R$ 300,00 por mês, a meta chega em maio de 2027, sem rendimentos. O Clarevo não guarda nem movimenta dinheiro. |
| 31,0 s | Veja no perfil como acessar o Clarevo. |

Não narra contribuição automática, rendimento nem transferência (o app não faz nenhuma das três). Fica de fora da gravação a "Reserva para imprevistos" e o plano de guardar, que são outras peças.

### 2.4 P11: anotar o primeiro gasto (35,6 s, 2,8 MB)

Arquivos: `p11-primeiro-gasto-anotar.mp4`, `.srt`, `-capa.png` (o Resumo depois do gasto, com "+ R$ 35,00") e `-conferencia-1`, `-2` e `-3.png` (o Resumo antes, aos 0,8 s; o formulário preenchido aos 15,7 s; a tela "Gasto salvo" aos 17,6 s). Fluxo: Resumo, "Anotar gasto", Descrição "Farmácia", Valor R$ 35, categoria Saúde, "Salvar gasto", "Gasto salvo", Resumo e "Pagamentos do mês". O relógio da página acompanha a demonstração, então a tela mostra "Anotado por você em 07/10/2026".

| Início | Narração sugerida, ajustada à tela |
|---|---|
| 0,0 s | Seu primeiro registro no Clarevo. |
| 4,1 s | Comece com uma despesa que você já conhece. No exemplo fictício, vamos registrar R$ 35,00. |
| 9,9 s | Confira os campos que esta versão pede: descrição, valor e categoria. |
| 15,7 s | Salve e veja se o registro aparece corretamente. |
| 19,4 s | No Resumo, o Pago vai de R$ 3.900,00 para R$ 3.935,00, e a Diferença do mês, de R$ 2.100,00 para R$ 2.065,00. |
| 26,4 s | O gasto também aparece em Pagamentos do mês. É o primeiro passo para acompanhar. A orientação de acesso está no perfil. |

A cena de resultado, que o Playbook torna obrigatória, está nos 20 s finais. A gravação usa a conta de demonstração, que já tem registros. A demonstração também deixa criar uma conta nova simulada ("Criar conta" e "Simular abertura do link"), que abre vazia, com o cartão "Primeiros passos", e o mesmo fluxo termina certo nela (conferido, mas **não gravado**): como a conta nova tem R$ 0,00 recebidos, o primeiro gasto de R$ 35,00 deixa a Diferença do mês negativa, de menos R$ 35,00, com o aviso "Pagamentos acima dos recebimentos no período", e a peça teria de explicar isso. A equipe decide se quer essa versão; o script grava de novo com um roteiro novo.

### 2.5 Capturas estáticas 1080 x 1350 (4:5)

Telas como o app as mostra, **sem montagem de arte** (a arte final é feita no Canva), com a etiqueta "Demonstração" no cabeçalho. Ficam em `capturas/`.

| Arquivo | Tela | Peças |
|---|---|---|
| `orcamento-1-total-do-mes.png` | Orçamento por categoria: "Orçado R$ 4.600,00 · Usado R$ 4.300,00", Moradia e Mercado | P01, P02 |
| `orcamento-2-mercado-e-lazer.png` | Mercado (faltam R$ 400,00) e Lazer (R$ 100,00 acima) | P01, P02 |
| `orcamento-3-definir-categoria.png` | A lista "Definir orçamento": Transporte, Saúde e Educação | P05 |
| `resumo-diferenca-do-mes.png` | Resumo: Diferença do mês R$ 2.100,00, "Recebido menos pago até 07/10 · não é saldo", Recebido e Pago | P04, P10 |
| `contas-a-pagar-1-ainda-a-pagar.png` | Contas a pagar: "Ainda a pagar neste mês, R$ 650,00" | P04 |
| `contas-a-pagar-2-a-vencer.png` | Contas a pagar: Internet (15/10) e Condomínio (20/10) | P04 |
| `seu-mes-1-entrou-e-saiu.png` | Seu mês em 30 segundos, primeiro cartão: Recebido, Pago e Diferença do mês | P10 |
| `seu-mes-2-segundo-cartao.png` | Seu mês em 30 segundos, segundo cartão: "Para onde foi" | P10 |

A tela de 4:5 é de 400 x 500 pontos na escala 2,7, um pouco mais de área que o celular dos vídeos, e a barra de abas fica sempre embaixo: o recorte e a ampliação do trecho importante são da arte. A captura "Resumo" é a única com a barra do topo do app (logotipo, etiqueta e avatar); as outras têm o cabeçalho de subtela, também com a etiqueta.

### 2.6 O que a gravação não cobre

- **Telas de conta real:** o piloto ainda não começou; não há conta real nem dados reais. Tudo vem da demonstração (inclusive a conta nova simulada, que não foi gravada).
- **Família:** a demonstração não tem Família de exemplo, então não há gravação (seção 1.2).
- **Lembretes, widget e biometria:** só existem no app das lojas; não aparecem na versão web.
- **Evolução, Aprender e Cartões:** não foram pedidos para as peças P01 a P12; já há vídeo de demonstração completo (`scripts/video-demonstracao.js`, `docs/17`).

## 3. Regras de gráficos do Guia v2.0: o que o app e o site já cumprem

Só relato, sem mudar tela (leitura de `packages/core/src/analises.ts`, `evolucao.ts`, `evolucao-tela.ts`, `budget.ts` e `simulate.ts`, e dos componentes de `apps/app/src/components`, mais o roteiro automatizado `scripts/e2e-web.js`). O site não tem gráfico próprio: as páginas só mostram capturas do app, com a legenda "Dados fictícios de demonstração", e as calculadoras mostram texto e tabela.

| Regra do Guia | O que cumpre | O que não cumpre ou fica a conferir |
|---|---|---|
| **Barras: comparação, base zero, rótulos com unidade e período** | Orçamento por categoria: a barra vai de zero ao orçado, acima de 100% fica cheia com um trecho listrado, e cada card escreve "R$ 1.400,00 de R$ 1.800,00", o percentual e "Faltam R$ 400,00" ou "R$ 100,00 acima", no mês do seletor. Pago por categoria em barras: a largura é o percentual do total, com valor e percentual escritos. Ano a ano do simulador: barras de zero, legenda em texto e tabela com todos os valores | Em Pago por categoria, uma fatia que arredonda para 0,0% ganha um traço de 4 px (`barMin`), o que foge da base zero estrita. O ano a ano do simulador escreve o valor só no último ano (os outros estão na tabela) |
| **Linhas: evolução no tempo, realizado separado de projetado** | Evolução (Recebido, Pago, Renda comprometida e Guardado em metas): a escala parte do zero e não muda com a seleção ("O gráfico parte do zero"); nada é projetado: em Recebido e Pago o mês em andamento aparece marcado ("os valores ainda podem mudar") e fica fora da média e da mediana, e em Renda comprometida e Guardado em metas só entram meses fechados (o mês em andamento e o mês sem base viram um traço na linha de base); a linha não atravessa mês fora da comparação; o zero é desenhado quando um mês fica negativo | Não há eixo vertical com valores: o rótulo traz o título ("Pago por mês"), o período ("Meses: de maio a outubro de 2026") e "Maior valor do gráfico: R$ ...", e cada mês se lê ao tocar ou na tabela. Unidade e período estão escritos, mas não ao lado dos pontos |
| **Composição: 100% empilhado só quando as partes somam o mesmo total** | Pago por categoria divide o mesmo total do mês (os percentuais somam 100%, pelo método do maior resto, e a fatura paga é dividida entre as categorias dela, sem contar duas vezes). Não há gráfico empilhado de 100% fora disso | Nada a apontar. As bolhas têm área proporcional ao valor e as barras continuam à vista |
| **Juros: não chamar a diferença percentual de preços de taxa de juros nem de CET** | O app e o site não fazem isso. "Parcelado ou à vista?" diz "o parcelado custa R$ 70,00 a mais" e, à parte, "equivale a juros de 3,00% ao mês", que é a taxa que iguala as parcelas ao preço à vista, em juros compostos (as hipóteses aparecem na tela). Não calcula CET | Se uma peça citar a taxa, dizer de onde ela vem (seção 1.1, P07) |
| **Previsão: cenário, premissa e data de referência** | "Próximos meses" e Renda comprometida chamam tudo de "previsto" e dizem quanto é valor estimado; o simulador mostra as hipóteses sempre à vista (taxa constante, aportes no início de cada mês, inflação opcional) e o aviso "Não é promessa de rendimento nem recomendação de investimento"; o Resumo escreve a data ("até 07/10") | O simulador não escreve a data de partida do cálculo (o "hoje" da conta); fica a conferir se vale acrescentar |
| **Gráfico da lâmina 8 do Guia (pago, a pagar e diferença)** | Não existe no app | O app não tem esse gráfico. A "Diferença" da lâmina é recebido menos pago menos a pagar, e a "Diferença do mês" do app é só recebido menos pago (seção 1.1, R01): se a peça usar a lâmina, nomear a conta como do exemplo |

## 4. Métricas sem rastreamento (decisão de Enzo, 24/10/2026)

**Decisão.** O Clarevo mede o Instagram e o acesso **sem rastrear pessoas**. O Playbook pede cadastro, primeira tarefa e parâmetros UTM por peça; o Clarevo promete, na política de privacidade e no site, nenhum rastreamento e nenhuma análise de acesso, e isso vale para as redes também. Fica assim:

1. **Nenhum parâmetro de campanha nos links** (`utm_*`, `fbclid` e parecidos). O link da bio é `comece.html`, limpo.
2. **Instagram:** os números do próprio painel do Instagram (visualizações, alcance, salvamentos, compartilhamentos, visitas ao perfil e toques no link da bio), lidos pela equipe e anotados à mão no relatório semanal, com a janela de datas. São dados do Meta, que não passam pelo Clarevo.
3. **Site:** as **páginas de entrada contadas pelas estatísticas de tráfego do painel da Cloudflare** (medidas no servidor, sem script e sem cookie, `docs/22`, seção 8.5). A entrada do Instagram é `comece.html`; se o Clarevo quiser separar canais, usa **caminhos de entrada diferentes e sem parâmetro** (por exemplo, uma página de entrada por canal), em vez de marcar o link. As estatísticas só existem depois que o domínio estiver na Cloudflare (P-006), e o nome do menu e a lista de caminhos que o painel mostra ficam **a conferir** no primeiro uso. O Web Analytics com script continua desligado.
4. **Dentro do app, só contagens agregadas no banco**, lidas pela equipe no SQL Editor, sem identificação de ninguém no resultado: **cadastros por semana** (contas criadas) e **contas com ao menos um registro em 7 dias** (gasto ou recebimento, o que o Playbook chama de "primeira tarefa", sem dizer qual peça trouxe a pessoa). Opcional e também agregada: contas com registro em duas semanas seguidas, como aproximação de "retorno". As contas da própria equipe e as de teste são contadas à parte e descontadas à mão, porque não há como separá-las sem identificar.
5. **Pergunta opcional "Como conheceu o Clarevo?" no cadastro.** Opções fechadas (por exemplo: Instagram, indicação de uma pessoa, empresa onde trabalho, busca na internet, outra, prefiro não responder), que não bloqueia o cadastro e aparece uma vez. O projeto recomenda gravar **só a contagem por semana e opção, sem ligar a resposta à conta** (uma função que soma 1 num contador, sem identificador da pessoa), para a resposta não virar um dado pessoal novo. A troca: não dá para impedir que uma pessoa responda duas vezes, e a contagem é aproximada. Se Enzo preferir guardar por conta, isso passa a ser dado pessoal, entra na política e exige leitura só pela equipe.

**O que fica "não medido"** (e assim se escreve no relatório, nunca zero): qual peça trouxe cada cadastro (o Playbook também manda não atribuir), primeira tarefa e retorno de pessoas identificadas, instalações atribuídas, ativação por origem, taxa de conversão do Instagram até o cadastro e, até haver cobrança, assinatura.

| Etapa do Playbook | De onde vem | Observação |
|---|---|---|
| Distribuição | Painel do Instagram | À mão, por peça e por semana |
| Interesse | Painel do Instagram e perguntas externas | Sem dado pessoal no relatório |
| Perfil | Painel do Instagram (visitas e toques no link da bio) | Mesma janela de datas |
| Destino | Estatísticas de tráfego da Cloudflare, nas páginas de entrada | Conta visitas à página, inclui robôs; não identifica pessoa |
| Cadastro | Contagem semanal de contas criadas | Sem origem por peça; a resposta à pergunta opcional dá só a proporção aproximada por canal |
| Primeira tarefa | Contas com ao menos um registro em 7 dias | Contagem agregada; equipe e teste descontados à mão |
| Retorno | Não medido por pessoa (aproximação opcional: contas com registro em duas semanas seguidas) | Nunca por pessoa |
| Assinatura | Não existe cobrança | Não se aplica |

**O que isso exige (outro agente implementa; nada foi feito aqui):** a pergunta no cadastro (texto na tela e no app, migração com teste em `supabase/tests`, função de escrita que só soma o contador, nunca grava identificador); as duas consultas de contagem para o SQL Editor; um parágrafo na política de privacidade (nova finalidade da pergunta e as estatísticas de tráfego da Cloudflare, que já são a `[PROPOSTA]` da seção 10 da política) e uma pergunta nova ao advogado (a numerar em `docs/legal/resumo-para-advogado.md`). A regra de `CLAUDE.md` vale: toda mudança de esquema vem com teste, e a escrita só passa por função do banco.

**Cuidados de leitura** (do Playbook, que o Clarevo mantém): separar orgânico e pago, testes internos e pessoas de fora; "não medido" onde não houver captura; taxas só quando numerador e denominador são da mesma população e período.

## 5. O que mudou no site e nas lojas neste ciclo

| O quê | Onde | Como conferir |
|---|---|---|
| Página **Comece aqui** (`comece.html`) para o link da bio, com o estado real do acesso e seis caminhos, sem script e sem parâmetro | `scripts/site/paginas/comece.js`, `scripts/site/config.js` (menu do rodapé e o host da demonstração), `docs/22`, seções 1 e 11 | `npm run test:site` e o teste "Comece aqui" de `packages/core/test/site.test.ts` |
| **Tons claros do Guia v2.0** no site: base `#F7F9FD` (era `#F6F8FC`) e azul claro `#EAF0FF` (no lugar de `#EEF2FF`) | `site-src/estilo.css` | O teste de contraste do site passa nos dois modos; o menor par é `#EAF0FF` sobre `#2457F5`, 4,90:1 |
| **Frase de marca** "Mais clareza para decidir": herói e título da página inicial, rodapé, descrição, `og:image:alt`, imagem de compartilhamento, subtítulo da Apple, início da descrição curta do Google Play e gráfico do Google Play | `scripts/site/paginas/inicio.js`, `scripts/site/modelo.js`, `docs/lojas/ficha.md`, `docs/16`, `site-src/imagens/og-clarevo-1200x630.png`, `apps/app/assets/loja/grafico-recursos-1024x500.png` | Contagens da ficha (25 de 30 e 79 de 80 caracteres) conferidas por `lojas.test.ts` |
| Gravação das peças de demonstração | `scripts/gravar-redes.js` | Seção 2 |

## 6. Pendências e a decidir

- **Endereço oficial do link da bio** e a data de o site ir ao ar (domínio e revisão do advogado, P-006): enquanto isso, `comece.html` só existe na pasta `site/` e no projeto preliminar.
- **Responsável pelo produto** (a designar) e **refazer o teste na versão que for ao ar** antes de cada peça de demonstração; a ficha da seção 1 vale para o commit `f5bb473`.
- **Canal e horário de ajuda** (e-mail de suporte) para o destaque Ajuda, P11 e P12.
- **Identificador, nome de exibição e responsáveis do perfil**; autorização de imagem e de fala das integrantes (P06, P09 e P12); referência e direitos de mídia das trends (T01 e T02).
- **Métricas:** a implementação da seção 4 (pergunta no cadastro, contagens, texto da política e pergunta ao advogado) e a conferência do painel da Cloudflare quando o domínio existir.
- **Arte:** os tons antigos que ficam na imagem de compartilhamento, no gráfico do Google Play e no manual (`docs/22`, seção 11); a posição do "Exemplo fictício" nos vídeos e o recorte das capturas 4:5, que são do Canva.
- **Dois nomes a evitar nas peças:** "saldo" (o app não tem) e "planejado e registrado" no lugar de "orçado e usado" quando a tela aparecer.
