# Clarevo · Acessibilidade e desempenho em Android simples (D-062 item 5)

Ciclo Y, 20/10/2026. Revisão de acessibilidade (contraste, leitor de tela, letra grande, movimento e alvos de toque) e de desempenho (pacote, listas longas, cálculos repetidos, consultas e imagens), com as correções seguras e locais. **Sem migração, sem função nova no banco e sem pacote novo** (a troca do pacote de ícones é uma regra do Metro, `apps/app/metro.config.js`, sem dependência nova). Decisão: `docs/00` (D-062 item 5). Passos do ciclo: `docs/04` (Ciclo Y).

## 1. Resumo

| Área | O que a auditoria achou | Situação |
|---|---|---|
| Contraste | De 1.866 textos em 63 telas, nenhum abaixo da meta fora o botão desabilitado (2,93:1, que o WCAG dispensa). Na tabela de estados, dois pares abaixo de 4,5:1: o texto de exemplo (placeholder) no campo com erro (4,11:1) e o azul sobre o botão suave pressionado (4,47:1) | Corrigido: `placeholder` de #68748C para #616D85 (4,55:1 no campo com erro, 5,2:1 no branco) e novo `brandTintPressed` #DDE7FF (4,51:1). Azul, lima e #17223B não mudaram |
| Leitor de tela | Nenhum botão, caixa, rádio, aba, campo, link ou imagem sem nome (878 alvos em 63 telas); nada clicável sem papel; estados anunciados. Dois cartões de total ("Pago" e "Recebido" na composição) sem papel de título | "Pago" e "Recebido" viraram títulos de nível 2. O resto sem achado (seção 4) |
| Letra grande | Legenda do registro cortada em "…" já no tamanho normal (a origem e a conta ficavam escondidas); títulos de lista limitados a 2 linhas com letra grande; selo "Demonstração" e pílula de contexto passando da tela com letra 2,0; título longo sem quebra na web; rótulo da aba "Movimentos" cortado a partir de 1,3 | Corrigidos (seção 5). A parte que só o aparelho mostra está na seção 11 |
| Movimento | Nenhum achado: toda animação (Reanimated, FadeIn, FadeOut, layout, escala ao tocar, esqueleto, trilho do seletor, transição de telas, janelas) respeita "reduzir movimento" | Conferido no código e no navegador, nos dois modos |
| Alvos de toque | Nenhum alvo abaixo de 44 x 44 px (largura e altura) em 63 telas | Sem correção. O roteiro media só a altura e só em parte das telas; agora mede largura e altura em todas |
| Pacote | Entrada de 6,88 MB (1,43 MB comprimida): os 1.867 ícones do `lucide-react-native` estavam dentro, e só 98 são usados. O leitor de PDF (1,74 MB) já é um arquivo à parte e só é pedido quando a pessoa lê um PDF | Entrada de 4,78 MB (1,23 MB comprimida): `apps/app/src/lib/lucide.ts` com só os ícones usados |
| Listas longas | Movimentações, fatura e composição montavam todas as linhas de uma vez (500 lançamentos: 5.479 elementos e 3.116 ms para abrir). Busca e importação já mostram 100 por vez | `FlatList` a partir de 80 linhas nas três telas (500 lançamentos: 526 elementos e 486 ms). Custo: arrastar a lista em ritmo de fling fica mais travado na web com CPU lenta (seção 8.3) |
| Cálculos repetidos | Totais do mês e da busca refeitos a cada quadro; digitar na busca recalculava as até 1.000 linhas | `useMemo` nos totais, na busca e na lista de Movimentações (digitar na busca: 131 a 152 para 106 a 108 ms por tecla) |
| Consultas | `staleTime` de 30 s em todas (padrão do `QueryClient`) | Sem achado |
| Imagens | Maior imagem do pacote: 25 KB (ícone de abertura). Cinco fontes Manrope de 97 KB | Imagens sem achado. Fontes: pendência (seção 10) |

## 2. Como foi medido

- **Auditoria em tempo de execução** no Chromium do Playwright (1.56.1), com a demonstração aberta: um percurso de 63 telas (as quatro abas e todas as rotas de `apps/app/src/app` que a demonstração alcança, com os registros, contas, séries, metas e cartão da própria demonstração). Em cada tela: contraste de todo texto visível (camadas de fundo e opacidades dos elementos somadas de cima para baixo), árvore de acessibilidade do Chromium (`Accessibility.getFullAXTree`: nome de botão, caixa, rádio, campo, aba, link, chave e imagem), alvos de toque (largura e altura), elementos com cursor de mão sem papel, texto cortado, texto por cima de texto e fora da tela, níveis de título.
- **Auditoria estática** com o analisador do TypeScript sobre `apps/app/src`: `Pressable` sem `accessibilityRole` ou sem nome, `Image` sem descrição, `TextInput` e `Switch` sem rótulo, animações sem "reduzir movimento", título (`variant="title"`) sem papel de título.
- **Letra grande, simulada.** Na web a escala de fonte do sistema é sempre 1 (`PixelRatio.getFontScale()`), então o roteiro multiplica o tamanho e a altura da linha de todo texto por 1,3 (largura de 360 px) e por 2,0 (largura de 359 px, que empilha valores como o aparelho faz acima de 1,3). Rótulos das abas, avatar e selo "Demonstração" crescem no máximo 1,3 vez, como no app (`maxFontSizeMultiplier`), os títulos com limite de linhas ficam sem limite (como `clampLines`) e o olho do cabeçalho some (como `eyeFits`).
- **Desempenho:** Chromium com a CPU 4 vezes mais lenta (`Emulation.setCPUThrottlingRate`, taxa 4), janela de 390 x 844, versão web de demonstração (que simula 300 ms de resposta por consulta), mediana de 3 repetições. O Resumo é medido do carregamento da página até o texto "Diferença do mês". A lista é o mês de setembro de 2026 com 500 lançamentos fictícios gravados só no teste, pelo mesmo atalho "outro aparelho" do roteiro, sem mudar a demonstração.
- **Testes:** `packages/core/test/contrast.test.ts`, `long-list.test.ts`, `text-scale.test.ts` e `lucide-barrel.test.ts` (regras), e o bloco "Acessibilidade (D-062)" de `scripts/e2e-web.js` (conferência nas telas, capturas 590 a 612).

## 3. Contraste (WCAG 2.2, 1.4.3 e 1.4.11)

Metas: 4,5:1 para texto normal; 3:1 para texto grande (24 px, ou 18,66 px em negrito), ícones e contornos de campo. A conta é `contrastRatio` em `packages/core/src/contrast.ts`; a tabela de pares é `THEME_CONTRAST_PAIRS` no mesmo arquivo, e o teste lê as cores de `apps/app/src/theme/tokens.ts`: trocar uma cor do tema sem rever o contraste quebra `npm test`. O teste também falha se o app usar uma cor literal (`#RRGGBB`) que não está no tema nem na tabela.

| Par | Texto ou traço | Fundo | Tipo | Razão | Meta | Situação |
|---|---|---|---|---|---|---|
| Texto principal sobre cartão branco | #17223B | #FFFFFF | texto | 15,81:1 | 4,5:1 | passa |
| Texto principal sobre o fundo da tela | #17223B | #F6F8FC | texto | 14,87:1 | 4,5:1 | passa |
| Texto principal sobre o lima (selo "Demonstração", cartões de Aprender) | #17223B | #D4F05B | texto | 12,36:1 | 4,5:1 | passa |
| Texto principal sobre o fundo do resumo de explicação | #17223B | #F2FAD0 | texto | 14,57:1 | 4,5:1 | passa |
| Texto principal sobre azul claro (aviso informativo, chip, aba ativa) | #17223B | #EAF0FF | texto | 13,86:1 | 4,5:1 | passa |
| Texto principal sobre o trilho do seletor "Por registro" e "Por categoria" | #17223B | #E6EBF5 | texto | 13,22:1 | 4,5:1 | passa |
| Texto principal sobre o aviso de erro | #17223B | #FDECEA | texto | 13,82:1 | 4,5:1 | passa |
| Texto secundário sobre cartão branco (legendas, dicas) | #4B5873 | #FFFFFF | texto | 7,14:1 | 4,5:1 | passa |
| Texto secundário sobre o fundo da tela | #4B5873 | #F6F8FC | texto | 6,71:1 | 4,5:1 | passa |
| Texto secundário sobre azul claro | #4B5873 | #EAF0FF | texto | 6,26:1 | 4,5:1 | passa |
| Texto secundário sobre o fundo do resumo de explicação | #4B5873 | #F2FAD0 | texto | 6,58:1 | 4,5:1 | passa |
| Texto secundário sobre o aviso de erro | #4B5873 | #FDECEA | texto | 6,24:1 | 4,5:1 | passa |
| Texto de exemplo (placeholder) sobre campo branco | #616D85 | #FFFFFF | texto | 5,21:1 | 4,5:1 | passa |
| Texto de exemplo (placeholder) sobre campo com erro | #616D85 | #FDECEA | texto | 4,55:1 | 4,5:1 | passa |
| Links e botões suaves sobre cartão branco | #2457F5 | #FFFFFF | texto | 5,59:1 | 4,5:1 | passa |
| Links e "Voltar" sobre o fundo da tela | #2457F5 | #F6F8FC | texto | 5,26:1 | 4,5:1 | passa |
| Botão suave, chip selecionado e aba ativa (azul sobre azul claro) | #2457F5 | #EAF0FF | texto | 4,90:1 | 4,5:1 | passa |
| Azul sobre o fundo do resumo de explicação ("O que é isso?") | #2457F5 | #F2FAD0 | texto | 5,15:1 | 4,5:1 | passa |
| Azul sobre o botão suave pressionado | #2457F5 | #DDE7FF | texto | 4,51:1 | 4,5:1 | passa |
| Texto branco sobre o azul (cabeçalho, botão principal) | #FFFFFF | #2457F5 | texto | 5,59:1 | 4,5:1 | passa |
| Texto branco sobre o botão principal pressionado | #FFFFFF | #1D47CC | texto | 7,43:1 | 4,5:1 | passa |
| Texto branco sobre o trilho do seletor Pessoal e Família | #FFFFFF | #1E4BD8 | texto | 6,88:1 | 4,5:1 | passa |
| Legenda clara sobre o azul ("Recebido menos pago até 07/10") | #EEF2FF | #2457F5 | texto | 5,00:1 | 4,5:1 | passa |
| Legenda clara sobre o trilho do seletor | #EEF2FF | #1E4BD8 | texto | 6,15:1 | 4,5:1 | passa |
| Valor grande em branco sobre o azul (diferença do mês) | #FFFFFF | #2457F5 | texto grande | 5,59:1 | 3:1 | passa |
| Mensagem de erro de campo e botão "Excluir" | #B42318 | #FFFFFF | texto | 6,57:1 | 4,5:1 | passa |
| Aviso de erro | #B42318 | #FDECEA | texto | 5,75:1 | 4,5:1 | passa |
| Valor recebido (verde) sobre cartão branco | #087E58 | #FFFFFF | texto | 5,08:1 | 4,5:1 | passa |
| Aviso de confirmação ("Gasto salvo") | #06704F | #E3F5EE | texto | 5,40:1 | 4,5:1 | passa |
| Ícone azul sobre o quadrado azul claro (linha de gasto, atalhos) | #2457F5 | #EAF0FF | ícone | 4,90:1 | 3:1 | passa |
| Ícone verde sobre o quadrado verde claro (linha de recebimento) | #087E58 | #E3F5EE | ícone | 4,49:1 | 3:1 | passa |
| Ícone cinza (setas "›", lupa) sobre cartão branco | #4B5873 | #FFFFFF | ícone | 7,14:1 | 3:1 | passa |
| Ícone branco sobre o azul (voltar, olho, mês anterior) | #FFFFFF | #2457F5 | ícone | 5,59:1 | 3:1 | passa |
| Contorno de campo e de chip sobre cartão branco | #7D8AA6 | #FFFFFF | contorno | 3,47:1 | 3:1 | passa |
| Contorno de campo sobre o fundo da tela | #7D8AA6 | #F6F8FC | contorno | 3,26:1 | 3:1 | passa |
| Contorno de campo com erro sobre o fundo de erro | #B42318 | #FDECEA | contorno | 5,75:1 | 3:1 | passa |
| Anel de foco azul sobre cartão branco | #2457F5 | #FFFFFF | contorno | 5,59:1 | 3:1 | passa |
| Anel de foco azul sobre o fundo da tela | #2457F5 | #F6F8FC | contorno | 5,26:1 | 3:1 | passa |
| Anel de foco lima sobre o azul (cabeçalho) | #D4F05B | #2457F5 | contorno | 4,37:1 | 3:1 | passa |
| Anel de foco lima sobre o trilho do seletor | #D4F05B | #1E4BD8 | contorno | 5,38:1 | 3:1 | passa |
| Campo em foco: contorno escuro sobre cartão branco | #17223B | #FFFFFF | contorno | 15,81:1 | 3:1 | passa |
| Botão principal desabilitado (65% de opacidade sobre o cartão) | #FFFFFF | #2457F5 | texto | 2,93:1 | 4,5:1 | exceção |
| Botão suave desabilitado (65% de opacidade sobre o cartão) | #2457F5 | #EAF0FF | texto | 2,69:1 | 4,5:1 | exceção |
| Seta de mês indisponível no cabeçalho (35% de opacidade sobre o azul) | #FFFFFF | #2457F5 | ícone | 1,91:1 | 3:1 | exceção |
| Segmento "em aberto" das barras (azul claro sobre branco), sempre com rótulo e listras | #7FA0F7 | #FFFFFF | ícone | 2,54:1 | 3:1 | exceção |

Observações:

- "Pressionado" e "foco" são estados que a demonstração não mostra parados; entram na tabela pela cor do código.
- Os dois pares abaixo da meta que a auditoria achou foram corrigidos mudando só a cor de texto secundário e a cor do botão pressionado: `placeholder` (#68748C passou a #616D85) e o novo `brandTintPressed` (#DDE7FF no lugar de #DCE6FF, que estava escrito direto em três arquivos).
- **Exceções, com motivo.** Botão desabilitado (65% de opacidade) fica em 2,93:1 e a seta de mês indisponível (35%) em 1,91:1: componente desabilitado não tem mínimo no WCAG 1.4.3, e o estado também é dito pelo leitor de tela (`accessibilityState.disabled`). O segmento "em aberto" das barras (azul claro, 2,54:1 sobre branco) nunca depende só da cor: tem listras e o valor escrito ao lado.
- Medido nas telas: 1.866 textos em 63 telas, o único achado é o botão "Excluir minha conta" desabilitado até a pessoa digitar a confirmação (a exceção acima).

## 4. Leitor de tela

| Conferência | Resultado |
|---|---|
| Botão só com ícone sem nome acessível | Nenhum (878 alvos em 63 telas; os ícones soltos dentro de botões com texto são `aria-hidden`) |
| Imagens sem descrição | Nenhuma: o logotipo é imagem com o nome "Clarevo"; as ilustrações são decorativas (`aria-hidden`) |
| Elemento clicável sem `accessibilityRole` | Nenhum no navegador. No código há um `Pressable` com `accessible={false}` de propósito (a caixa do campo "Dia" em `record-form.tsx`, que só leva o foco ao campo) |
| Título sem papel de título | Corrigido: "Pago" e "Recebido" na composição (nível 2). Os títulos de estado vazio (`EmptyState`) ficam como texto: são a mensagem do estado, e a seção já tem título (decisão, seção 10) |
| Níveis de título | Uma só `h1` por tela, com três exceções antigas e fixadas pelo roteiro: o Resumo não tem `h1` (estrutura preservada, D-022), a explicação de um tema tem duas (a barra "Aprender" e o título do tema), e quatro telas pulam de `h1` para `h3` (reserva, plano de guardar, editar meta e assinaturas). Não mudaram (seção 10) |
| Ordem de leitura | A ordem do DOM é a visual: nenhum `row-reverse`, e a posição absoluta só na barra inferior e nos rodapés fixos |
| Estados | Aba `aria-selected`; rádio, caixa e chave `aria-checked`; 23 usos de `aria-expanded`; `accessibilityState.disabled` e `busy` no botão; janelas com `accessibilityViewIsModal`. Nenhum rádio, aba, caixa ou chave sem o estado, em 63 telas |

## 5. Letra grande

No tamanho normal (390 px), 1,3 vez (360 px) e 2,0 vezes (359 px), em cerca de 60 telas na auditoria e em 12 telas no roteiro (Resumo, Movimentações, Metas, registrar gasto, contas a pagar, cartões, cartão, fatura, busca, composição, gastos fixos e Conta).

| Achado | Correção |
|---|---|
| A legenda do registro ("Pago · 05/10/2026 · conta a pagar · Conta principal") tinha `numberOfLines={1}` e terminava em "…" já no tamanho normal, escondendo a conta de origem (Resumo, Movimentações, busca e composição). A legenda da compra no cartão, na busca, tinha limite de 2 linhas e também cortava | `RecordRow` e `PurchaseRow`: a legenda quebra sem limite |
| Títulos de lista com limite de 2 linhas (registro, conta a pagar, conta do ano, cartão, fatura, conta de origem, importação, busca e Análises): com letra grande o nome terminava em "…" | `clampLines(2)` em `ui.tsx` (regra `clampedLines` no core): sem limite quando a escala de fonte passa de 1. Na web a escala é 1, então nada muda lá |
| Selo "Demonstração" crescia sem teto e empurrava o avatar para fora da tela com letra 2,0 | `maxFontSizeMultiplier` de 1,3 no selo (`DEMO_PILL_MAX_FONT_SCALE`), e `eyeFits` conta o selo com o mesmo teto |
| Pílula de contexto ("Demonstração · Pessoal") passava da largura da tela na web | `flexShrink: 1`: o texto quebra dentro da pílula |
| Título longo ("Movimentações") passava da tela na web com letra 2,0 (uma palavra sem ponto de quebra) | `overflowWrap: 'anywhere'` nos títulos do cabeçalho (só a web usa; no aparelho o texto já quebra) |
| Rótulo da aba ("Movimentos") cortado em "Movi…" a partir de 1,3 | `adjustsFontSizeToFit` com `minimumFontScale` de 0,8 nos rótulos da barra (só o aparelho usa; a web ignora) |

Resultado no roteiro: com letra 1,3 e 2,0, nada passa da largura da tela, nenhum texto cortado (fora os rótulos das abas, que o aparelho encolhe), nenhum texto por cima de outro e os alvos seguem com 44 px ou mais. A simulação tem limites: ela não vê o que o sistema faz com `adjustsFontSizeToFit` nem com a quebra de palavras longas no aparelho (seção 11).

## 6. Movimento

- Toda animação do app passa por "reduzir movimento": `FadeIn`, `FadeOut` e `LinearTransition` do Reanimated com `reduceMotion(ReduceMotion.System)`; escala de 0,98 ao tocar (`usePressScale`), esqueleto pulsando, trilho do seletor Pessoal | Família, interruptor, barras de progresso, janelas (`animationType` `none` com a preferência ligada), transição entre telas (`animation: 'none'`) e rolagens animadas (`animated: !reduced`).
- Conferido no navegador, nos dois modos: com a animação ligada, trocar de mês toca `FadeInLeft` e o botão encolhe a 0,98; com "reduzir movimento", nada anima parado nem ao trocar de mês, e o botão não encolhe (bloco "Acessibilidade (D-062)").

## 7. Alvos de toque

Nenhum botão, aba, rádio, caixa, chave, link ou campo abaixo de 44 x 44 px em 63 telas (878 alvos). O roteiro antigo (`layoutChecks`) media só a altura e só nas telas onde era chamado; o bloco novo mede largura e altura em todas as 63 e na lista longa.

## 8. Desempenho

### 8.1 Pacote web, por arquivo

| Arquivo | Antes | Depois | Comprimido, antes | Comprimido, depois |
|---|---|---|---|---|
| Entrada (`entry-*.js`) | 6.880.023 B (6,88 MB) | 4.778.278 B (4,78 MB) | 1.433.689 B | 1.231.950 B |
| Leitor de PDF (`pdfjs-*.js`, carregado sob demanda) | 1.735.611 B | 1.735.611 B | 506.753 B | 506.753 B |
| Rotas e módulos pequenos (3 arquivos `index-*.js`) | 77.029 B | 77.029 B | 24.031 B | 24.031 B |
| Fontes Manrope (5 pesos) | 485.000 B | 485.000 B | sem mudança | sem mudança |

Os 1.867 ícones do `lucide-react-native` somavam 2,1 MB da entrada: o Metro não elimina o que não se usa, e `import { Wallet } from 'lucide-react-native'` traz o pacote inteiro. O `metro.config.js` troca o pacote por `apps/app/src/lib/lucide.ts`, que reexporta só os 98 ícones usados, direto dos arquivos de cada ícone. As telas continuam importando `lucide-react-native`: nenhum arquivo de tela mudou. Ícone novo entra com uma linha em `lucide.ts`; `packages/core/test/lucide-barrel.test.ts` falha se uma tela importa um ícone que não está lá, se uma linha aponta para o arquivo errado, ou se alguém importa o pacote todo (`import *`, `require` ou `import()`). O roteiro confere que a entrada fica abaixo de 5,5 MB.

### 8.2 Leitor de PDF

`unpdf` (PDF.js embutido, 1,7 MB) é importado só em `await import('unpdf')` em `apps/app/src/lib/pdf-text.ts`, então vira um arquivo à parte. Conferido: abrir o app, o Resumo, as quatro abas e 59 telas não pede o arquivo `pdfjs-*.js` (bloco "Acessibilidade (D-062)"); o pedido só acontece quando a pessoa lê um PDF.

### 8.3 Listas longas

| Tela | Lista | Situação |
|---|---|---|
| Movimentações | Registros do mês, por dia | Virtualizada a partir de 80 linhas |
| Fatura do cartão | Lançamentos | Virtualizada a partir de 80 linhas |
| Composição de Pago, Recebido e da diferença | Registros de cada total | Virtualizada a partir de 80 linhas, cada total por si |
| Busca em Movimentações | Até 1.000 linhas do servidor | Já mostra 100 por vez, com "Mostrar mais" (`SEARCH_PAGE`); sem mudança |
| Importar extrato ou fatura | Até 500 linhas | Já mostra 100 por vez, com "Mostrar mais"; sem mudança |
| Contas a pagar, gastos fixos, metas, cartões, Aprender | Dezenas de linhas no máximo | Sem mudança |

Como funciona: `ScreenList` (em `ui.tsx`) é a tela inteira como `FlatList`, com o que vem antes da lista no `header`, o que vem depois no `footer` e cada linha como um item. Abaixo de 80 linhas, o item é o cartão inteiro de sempre (o mesmo desenho, com sombra e animação de saída das linhas): comparadas pixel a pixel antes e depois, as telas de Movimentações, fatura e composição saem iguais, a não ser pela legenda do registro que agora quebra. A partir de 80 linhas, cada linha é um pedaço do cartão (`CardSlice`, sem a sombra, que riscaria o pedaço vizinho). Ficar sempre na mesma `FlatList` evita remontar o cabeçalho (e perder o foco do leitor de tela no seletor de mês) quando o filtro ou o mês muda de curto para longo. Uma `FlatList` dentro de um `Screen` não serve: a lista aninhada monta tudo do mesmo jeito. Valores de montagem (12 linhas de início, lotes de 6 a cada 30 ms, janela de 5 telas) escolhidos por medida, entre cinco combinações.

Ressalva medida: com a CPU 4 vezes mais lenta, a lista virtualizada abre muito mais rápido, mas ao arrastar a lista em ritmo de fling o navegador precisa montar linhas novas durante a rolagem: arrastando 18.000 px (300 passos de 60 px, um quadro por passo), a rolagem leva 9,0 s contra 6,6 s, com 95% dos quadros abaixo de 90 ms contra 41 ms e 54 quadros acima de 50 ms contra 7. O tempo bloqueado é o mesmo (cerca de 3 s), só que, em vez de ficar todo na abertura da tela, é espalhado ao longo da rolagem. No aparelho, a rolagem em si é do sistema, e o que pode aparecer é área em branco por um instante em fling muito rápido (seção 11).

### 8.4 Cálculos refeitos a cada renderização

O app compila com o React Compiler (`app.json`), que já memoiza boa parte. Onde ele não alcançava, entraram `useMemo`: `summarizeMonth` e `summarizeToPay` nos hooks `useMonthRecords` e `useCommitments` (`state/data.ts`); a lista filtrada, os grupos por dia e as linhas de Movimentações; a conferência do texto nas até 1.000 linhas da busca, a soma, o agrupamento por mês e as próprias linhas (elementos prontos, que digitar no campo não refaz).

### 8.5 Consultas

`QueryClient` com `staleTime: 30_000` e `retry: 1` para todas as consultas (`app/_layout.tsx`), sem consulta que o troque por zero. Sem achado.

### 8.6 Imagens e fontes

A maior imagem do pacote é o ícone de abertura (25 KB); o resto são ícones de 1 a 20 KB. As cinco fontes Manrope (400, 500, 600, 700 e 800) têm 97 KB cada, completas; reduzir ao alfabeto latino pede uma ferramenta de subconjunto de fontes (seção 10).

### 8.7 Medidas, antes e depois (CPU 4x mais lenta, mediana de 3)

| Medida | Antes | Depois |
|---|---|---|
| Entrada JavaScript | 6,88 MB | 4,78 MB |
| Tela de boas-vindas pronta (carregar e executar o pacote) | 2.946 ms | 2.120 ms |
| Do toque em "Ver demonstração" até o Resumo | 1.931 ms | 1.779 ms |
| Do carregamento da página até o Resumo | 4.923 ms | 4.129 ms |
| Abrir Movimentações de um mês com 500 lançamentos | 3.116 ms | 486 ms |
| Elementos na tela, com 500 lançamentos | 5.479 | 526 |
| Linhas montadas, com 500 lançamentos | 503 | 14 |
| Abrir uma fatura com 500 lançamentos | 1.763 ms | 448 ms |
| Abrir a composição de Pago com 500 registros | 2.272 ms | 287 ms |
| Digitar na busca com 1.001 registros, por tecla | 131 a 152 ms | 106 a 108 ms |
| Rolar 300 passos de 60 px na lista de 500 | 6,6 s (95% dos quadros abaixo de 41 ms; 7 acima de 50 ms) | 9,0 s (95% dos quadros abaixo de 90 ms; 54 acima de 50 ms) |

Fatura e composição: os elementos incluem as telas escondidas da pilha (a composição abriu com Movimentações de setembro montada por baixo). Do Resumo: a demonstração simula 300 ms de resposta por consulta e o Resumo espera algumas em sequência, então uma parte do tempo (cerca de 1 s) é a simulação, não o app. A mudança do pacote aparece inteira na tela de boas-vindas.

## 9. O que foi corrigido

1. Contraste: `placeholder` e `brandTintPressed` (uma cor nova, no lugar de #DCE6FF escrito em três arquivos); teste com a tabela de pares do tema e guarda contra cor literal nova.
2. Títulos: "Pago" e "Recebido" na composição.
3. Letra grande: legenda do registro e da compra no cartão sem corte; títulos de lista sem limite acima de escala 1; selo "Demonstração" com teto; pílula de contexto que encolhe; títulos do cabeçalho que quebram; rótulos da barra que encolhem.
4. Pacote: só os ícones usados (6,88 para 4,78 MB), com guarda em teste.
5. Listas: Movimentações, fatura e composição virtualizadas a partir de 80 linhas; busca com `useMemo`; totais do mês e das contas a pagar com `useMemo`.
6. Roteiro: bloco "Acessibilidade (D-062)" em `scripts/e2e-web.js` (63 telas, letra grande, movimento, lista de 500, pacote), capturas 590 a 612.

## 10. O que não foi corrigido, e por quê (decisão de Enzo)

- **Resumo sem `h1`, explicação com duas e pulo de `h1` para `h3` em quatro telas.** São decisões antigas que os testes do roteiro fixam (a estrutura do Resumo é D-022). Mudar pede revisar dezenas de verificações. Efeito: quem navega por títulos não encontra um título de página no Resumo (a aba selecionada diz "Resumo").
- **Título de estado vazio como texto.** Marcar `EmptyState` como título mudaria a lista de títulos do Resumo de conta nova (conferida no roteiro). Proposta: dar o papel só onde o estado vazio é a seção inteira.
- **Fontes completas.** Cinco fontes de 97 KB, completas. Um subconjunto só com o alfabeto latino reduziria bastante o tamanho (a medir); precisa de uma ferramenta de subconjunto de fontes (como `pyftsubset`), que não é pacote do app, mas muda os arquivos de fonte; fica a escolha de Enzo.
- **Rotas carregadas sob demanda (`asyncRoutes` do Expo Router).** Dividiria a entrada por tela. Muda como cada tela abre (cada primeira abertura baixa um arquivo, e o aplicativo instalado sem rede precisa tê-los todos), então não entrou em um ciclo de correções seguras. Proposta: medir e decidir.
- **Lista virtualizada sem a sombra do cartão.** A partir de 80 linhas o cartão não tem a sombra de 6% de opacidade (a sombra de cada pedaço riscaria o vizinho). Abaixo disso, igual a antes.
- **Importação e busca** continuam mostrando 100 linhas por vez, e quem toca em "Mostrar mais" até o fim monta todas (até 1.000 na busca). Não virou `FlatList` porque as duas telas misturam formulário e lista no mesmo rolar.

## 11. O que só dá para conferir em aparelho de verdade

1. TalkBack e VoiceOver: "Pago" e "Recebido" lidos como título; a lista virtualizada anuncia a posição na lista e o foco não se perde ao mudar de mês ou de filtro; a ordem de leitura do cabeçalho.
2. Letra grande do sistema (Android: Tamanho da fonte e do display, até 200%; iOS: Tamanho do texto, tamanhos de acessibilidade) em Resumo, Movimentações, registrar gasto, contas a pagar e fatura: rótulo da barra com `adjustsFontSizeToFit`, título longo quebrando no meio da palavra, títulos de lista sem limite de linhas, selo "Demonstração" e o olho do cabeçalho.
3. Reduzir movimento do Android ("Remover animações") e do iOS ("Reduzir movimento"): as janelas e as telas abrem sem animar.
4. Android simples (2 GB de memória): abrir Movimentações de um mês com 500 lançamentos e rolar até o fim (área em branco em fling rápido, memória), abrir a fatura com 500 lançamentos, digitar na busca com 1.000 resultados.
5. O guia do manual (`npm run manual`) não mudou: nenhum texto de tela mudou.

## 12. Anotado sobre a Evolução (não alterada neste ciclo)

A Evolução (`app/evolucao.tsx`, `components/evolucao-parts.tsx`, `packages/core/src/evolucao*.ts`) ficou de fora por estar em outro ciclo. A auditoria não achou nada que ela meça (contraste, nomes, papéis, alvos, largura com letra 1,3 e 2,0). Para olhar depois: o rótulo do eixo do gráfico tem `numberOfLines={1}` (`evolucao-parts.tsx`, `styles.axis` com `minHeight: 40`) e deve ser conferido com letra grande em aparelho; o botão de cada mês no gráfico mede 44 px ou mais na web.

## 13. Como repetir

- `npm test` (inclui contraste, lista longa, letra grande e ícones) e `npm run typecheck`.
- `E2E_PORT=8299 npm run test:web`: o bloco "Acessibilidade (D-062)" faz a auditoria nas 63 telas, a letra grande a 1,3 e a 2,0, "reduzir movimento", a lista de 500 lançamentos e a conferência do pacote. As capturas 590 a 612 ficam em `docs/telas/`.
- Ícone novo: uma linha em `apps/app/src/lib/lucide.ts`. Cor nova: no tema, com o par na tabela de `packages/core/src/contrast.ts`.
