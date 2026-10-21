# Clarevo · Acessibilidade e desempenho em Android simples (D-062 item 5)

Ciclo Y, 20/10/2026, e Ciclo Z, 21/10/2026 (D-063 item 2: as pendências da seção 10, resolvidas ou avaliadas na seção 14). Revisão de acessibilidade (contraste, leitor de tela, letra grande, movimento e alvos de toque) e de desempenho (pacote, listas longas, cálculos repetidos, consultas e imagens), com as correções seguras e locais. **Sem migração, sem função nova no banco e sem pacote novo** (a troca do pacote de ícones é uma regra do Metro, `apps/app/metro.config.js`, sem dependência nova). Decisão: `docs/00` (D-062 item 5 e D-063 item 2). Passos dos ciclos: `docs/04` (Ciclo Y e Ciclo Z). O Ciclo Z também não tem migração nem função nova no banco, e não instala pacote (o `@expo-google-fonts/manrope` continua instalado, só deixou de ser importado).

## 1. Resumo

| Área | O que a auditoria achou | Situação |
|---|---|---|
| Contraste | De 1.866 textos em 63 telas, nenhum abaixo da meta fora o botão desabilitado (2,93:1, que o WCAG dispensa). Na tabela de estados, dois pares abaixo de 4,5:1: o texto de exemplo (placeholder) no campo com erro (4,11:1) e o azul sobre o botão suave pressionado (4,47:1) | Corrigido: `placeholder` de #68748C para #616D85 (4,55:1 no campo com erro, 5,2:1 no branco) e novo `brandTintPressed` #DDE7FF (4,51:1). Azul, lima e #17223B não mudaram |
| Leitor de tela | Nenhum botão, caixa, rádio, aba, campo, link ou imagem sem nome (878 alvos em 63 telas); nada clicável sem papel; estados anunciados. Dois cartões de total ("Pago" e "Recebido" na composição) sem papel de título | "Pago" e "Recebido" viraram títulos de nível 2. O resto sem achado (seção 4). A hierarquia de títulos (Resumo sem título de nível 1, duas na explicação, saltos de 1 para 3) ficou para o Ciclo Z e foi resolvida: seção 14.1 |
| Letra grande | Legenda do registro cortada em "…" já no tamanho normal (a origem e a conta ficavam escondidas); títulos de lista limitados a 2 linhas com letra grande; selo "Demonstração" e pílula de contexto passando da tela com letra 2,0; título longo sem quebra na web; rótulo da aba "Movimentos" cortado a partir de 1,3 | Corrigidos (seção 5). A parte que só o aparelho mostra está na seção 11 |
| Movimento | Nenhum achado: toda animação (Reanimated, FadeIn, FadeOut, layout, escala ao tocar, esqueleto, trilho do seletor, transição de telas, janelas) respeita "reduzir movimento" | Conferido no código e no navegador, nos dois modos |
| Alvos de toque | Nenhum alvo abaixo de 44 x 44 px (largura e altura) em 63 telas | Sem correção. O roteiro media só a altura e só em parte das telas; agora mede largura e altura em todas |
| Pacote | Entrada de 6,88 MB (1,43 MB comprimida): os 1.867 ícones do `lucide-react-native` estavam dentro, e só 98 são usados. O leitor de PDF (1,74 MB) já é um arquivo à parte e só é pedido quando a pessoa lê um PDF | Entrada de 4,78 MB (1,23 MB comprimida): `apps/app/src/lib/lucide.ts` com só os ícones usados |
| Listas longas | Movimentações, fatura e composição montavam todas as linhas de uma vez (500 lançamentos: 5.479 elementos e 3.116 ms para abrir). Busca e importação já mostram 100 por vez | `FlatList` a partir de 80 linhas nas três telas (500 lançamentos: 526 elementos e 486 ms). Custo: arrastar a lista em ritmo de fling fica mais travado na web com CPU lenta (seção 8.3) |
| Cálculos repetidos | Totais do mês e da busca refeitos a cada quadro; digitar na busca recalculava as até 1.000 linhas | `useMemo` nos totais, na busca e na lista de Movimentações (digitar na busca: 131 a 152 para 106 a 108 ms por tecla) |
| Consultas | `staleTime` de 30 s em todas (padrão do `QueryClient`) | Sem achado |
| Imagens | Maior imagem do pacote: 25 KB (ícone de abertura). Cinco fontes Manrope de 97 KB | Imagens sem achado. Fontes: Ciclo Z, subconjunto Latin de 34 KB cada, 484.996 para 172.128 B (seção 14.2) |

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
| Níveis de título | No Ciclo Y havia três exceções antigas, fixadas pelo roteiro: o Resumo sem `h1` (estrutura preservada, D-022), a explicação de um tema com duas e quatro telas que pulavam de `h1` para `h3` (reserva, plano de guardar, editar meta e assinaturas). **Resolvidas no Ciclo Z** (seção 14.1): cada tela tem uma só `h1`, sem salto de nível, e o roteiro confere isso em todas as telas que visita |
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
| Fontes Manrope (5 pesos) | 484.996 B | 484.996 B (Ciclo Y); 172.128 B no Ciclo Z | 209.277 B | 209.277 B; 86.019 B no Ciclo Z |

Os 1.867 ícones do `lucide-react-native` somavam 2,1 MB da entrada: o Metro não elimina o que não se usa, e `import { Wallet } from 'lucide-react-native'` traz o pacote inteiro. O `metro.config.js` troca o pacote por `apps/app/src/lib/lucide.ts`, que reexporta só os 98 ícones usados, direto dos arquivos de cada ícone. As telas continuam importando `lucide-react-native`: nenhum arquivo de tela mudou. O TypeScript lê o mesmo arquivo: `paths` em `apps/app/tsconfig.json` aponta `lucide-react-native` para `src/lib/lucide.ts` (que também exporta o tipo `LucideIcon`), então ícone que não está lá é erro de tipo em `npm run typecheck`, não só falha ao abrir a tela. Ícone novo entra com uma linha em `lucide.ts`; `packages/core/test/lucide-barrel.test.ts` (aspas simples ou duplas, `import` e `export { … } from`, arquivos `.ts`, `.tsx`, `.js` e `.jsx`) falha se uma tela importa um ícone que não está lá, se uma linha aponta para o arquivo errado, se o `paths` sai do `tsconfig.json`, ou se alguém importa o pacote todo (`import *`, `export *`, `require` ou `import()`). O roteiro confere que a entrada fica abaixo de 5,5 MB.

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

Ajustes da lista que ficam como estão: sem `getItemLayout` (as linhas têm altura variável, porque a legenda quebra com letra grande, e uma altura fixa errada faria a lista pular) e `initialNumToRender` de 12. **O `windowSize` maior (hoje 5 telas) fica para conferir no aparelho:** na web ele custou quadros longos (a janela de 7 telas travou quadros de 90 ms), mas só o Android simples mostra se uma janela maior troca área em branco no fling por memória e por trabalho a mais ao montar (seção 11, item 4).

### 8.4 Cálculos refeitos a cada renderização

O app compila com o React Compiler (`app.json`), que já memoiza boa parte. Conferido rodando o plugin pelo `babel-preset-expo`, como o Metro chama: a Busca (`movimentacoes/buscar.tsx`) compila, com `params` (o rascunho lido) memorizado pelos campos do rascunho e `cardNames` por `cards.data`, sem `eslint-disable`; uma dependência que não bate com a que o compilador infere (ou um `eslint-disable` de `react-hooks`) faz o compilador pular a tela inteira, sem erro à vista. A fatura não compila (as ações têm `try`/`finally` sem `catch`), então nela `renderItem`, `openLine` e `extraData` são memorizados à mão (`useCallback` e `useMemo`). Onde o compilador não alcançava, entraram `useMemo`: `summarizeMonth` e `summarizeToPay` nos hooks `useMonthRecords` e `useCommitments` (`state/data.ts`); a lista filtrada, os grupos por dia e as linhas de Movimentações; a conferência do texto nas até 1.000 linhas da busca, a soma, o agrupamento por mês e as próprias linhas (elementos prontos, que digitar no campo não refaz).

### 8.5 Consultas

`QueryClient` com `staleTime: 30_000` e `retry: 1` para todas as consultas (`app/_layout.tsx`), sem consulta que o troque por zero. Sem achado.

### 8.6 Imagens e fontes

A maior imagem do pacote é o ícone de abertura (25 KB); o resto são ícones de 1 a 20 KB. As cinco fontes Manrope (400, 500, 600, 700 e 800) tinham 97 KB cada, completas. No Ciclo Z viraram subconjuntos Latin de 34 KB (seção 14.2).

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
7. Ciclo Z (D-063 item 2): hierarquia de títulos (uma só `h1` por tela, sem salto), fontes em subconjunto Latin (172.128 B no lugar de 484.996 B) e a avaliação das rotas sob demanda (não aplicadas). Seção 14.

## 10. O que não foi corrigido, e por quê (decisão de Enzo)

- **Resumo sem `h1`, explicação com duas e pulo de `h1` para `h3` em quatro telas.** Resolvido no Ciclo Z (seção 14.1), com os testes atualizados.
- **Título de estado vazio como texto.** Marcar `EmptyState` como título mudaria a lista de títulos do Resumo de conta nova (conferida no roteiro). Proposta: dar o papel só onde o estado vazio é a seção inteira. Segue como estava.
- **Fontes completas.** Resolvido no Ciclo Z (seção 14.2): subconjunto Latin gerado com `pyftsubset` por `scripts/gerar-fontes.js`.
- **Rotas carregadas sob demanda (`asyncRoutes` do Expo Router).** Avaliado no Ciclo Z e **não aplicado**: o tempo até o Resumo piora com a CPU 4 vezes mais lenta (seção 14.3).
- **Lista virtualizada sem a sombra do cartão.** A partir de 80 linhas o cartão não tem a sombra de 6% de opacidade (a sombra de cada pedaço riscaria o vizinho). Abaixo disso, igual a antes.
- **Importação e busca** continuam mostrando 100 linhas por vez, e quem toca em "Mostrar mais" até o fim monta todas (até 1.000 na busca). Não virou `FlatList` porque as duas telas misturam formulário e lista no mesmo rolar.

## 11. O que só dá para conferir em aparelho de verdade

1. TalkBack e VoiceOver: "Pago" e "Recebido" lidos como título; a lista virtualizada anuncia a posição na lista e o foco não se perde ao mudar de mês ou de filtro; a ordem de leitura do cabeçalho.
2. Letra grande do sistema (Android: Tamanho da fonte e do display, até 200%; iOS: Tamanho do texto, tamanhos de acessibilidade) em Resumo, Movimentações, registrar gasto, contas a pagar e fatura: rótulo da barra com `adjustsFontSizeToFit`, título longo quebrando no meio da palavra, títulos de lista sem limite de linhas, selo "Demonstração" e o olho do cabeçalho.
3. Reduzir movimento do Android ("Remover animações") e do iOS ("Reduzir movimento"): as janelas e as telas abrem sem animar.
4. Android simples (2 GB de memória): abrir Movimentações de um mês com 500 lançamentos e rolar até o fim (área em branco em fling rápido, memória; aqui também se vê se um `windowSize` maior que 5 vale a memória a mais), abrir a fatura com 500 lançamentos, digitar na busca com 1.000 resultados.
5. O guia do manual (`npm run manual`) não mudou: nenhum texto de tela mudou.

## 12. Anotado sobre a Evolução (não alterada neste ciclo)

A Evolução (`app/evolucao.tsx`, `components/evolucao-parts.tsx`, `packages/core/src/evolucao*.ts`) ficou de fora por estar em outro ciclo. A auditoria não achou nada que ela meça (contraste, nomes, papéis, alvos, largura com letra 1,3 e 2,0). Para olhar depois: o rótulo do eixo do gráfico tem `numberOfLines={1}` (`evolucao-parts.tsx`, `styles.axis` com `minHeight: 40`) e deve ser conferido com letra grande em aparelho; o botão de cada mês no gráfico mede 44 px ou mais na web.

## 13. Como repetir

- `npm test` (inclui contraste, lista longa, letra grande e ícones) e `npm run typecheck`.
- `E2E_PORT=8299 npm run test:web`: o bloco "Acessibilidade (D-062)" faz a auditoria nas 63 telas, a letra grande a 1,3 e a 2,0, "reduzir movimento", a lista de 500 lançamentos e a conferência do pacote. As capturas 590 a 612 ficam em `docs/telas/`.
- Ícone novo: uma linha em `apps/app/src/lib/lucide.ts`. Cor nova: no tema, com o par na tabela de `packages/core/src/contrast.ts`.
- Caractere novo nos textos que a Manrope local não tem (`packages/core/test/fontes.test.ts` falha e diz qual): uma linha em `UNICODES` de `scripts/gerar-fontes.js` e `node scripts/gerar-fontes.js`. `node scripts/gerar-fontes.js --verificar` confere que os arquivos de `apps/app/assets/fonts` saem iguais ao que o script gera (precisa do `pyftsubset`, do fonttools; fica fora do `npm test` por isso).
- Título novo: uma só `h1` por tela (`SubHeader` ou `AppHeader`), `h2` para as seções e `h3` para o que está dentro delas, sem pular. O roteiro confere em toda leitura de tela (bloco "Hierarquia de títulos", seção 14.1).

## 14. Ciclo Z (D-063 item 2): títulos, fontes e rotas sob demanda

Ciclo Z, 21/10/2026. Resolve as pendências de títulos e de fontes da seção 10 e avalia as rotas carregadas sob demanda. Sem migração, sem função nova no banco e sem pacote novo.

### 14.1 Hierarquia de títulos

Regra nova: **no máximo um título de nível 1 por tela e nenhum salto de nível** (de 1 para 2, de 2 para 3; nunca de 1 para 3). Uma janela aberta por cima (diálogo, folha de ajuda, tour) é um escopo à parte: o título dela é o nível 1 dela.

| Tela | Antes | Depois |
|---|---|---|
| Resumo | Nenhum título de nível 1 (o mês era de nível 2) | O mês do cabeçalho é o título de nível 1. O leitor de tela lê "Resumo de outubro de 2026" (`SUMMARY_NAV_TEXT.pageTitleA11y`, o nome acompanha o mês); o que se vê continua "Outubro de 2026", no mesmo lugar e do mesmo tamanho. A estrutura de D-022 não mudou: nenhum texto, cartão ou título novo. As seções seguem de nível 2 ("Primeiros passos", "Seus últimos meses", "Pagamentos do mês") |
| Explicação de um tema | Duas de nível 1: a barra "Aprender" e o título do tema | Uma só: o título do tema. A barra "Aprender" é texto, sem papel de título (`SubHeader` com `plainTitle`). Com o tema indisponível ("Este conteúdo não está disponível."), a barra segue como nível 1 e a mensagem é de nível 2 |
| Reserva, plano de guardar, editar a reserva | 1, 3 ("Seus gastos essenciais por mês"), 2 | 1, 2, 2 (`EssentialsBlock` passou de nível 3 para 2: é irmão de "Valor da reserva" e de "Etapas do plano", não filho) |
| Revisar assinaturas | 1, 3, 3 (o nome de cada assinatura) | 1, 2, 2 |
| Contas vencidas, com parcelas de contas do ano | 1, 3 (o título de cada grupo "Material escolar de 2026 · 2 parcelas vencidas") | 1, 2 (`aria-level` do título do grupo, em `a-pagar/vencidas.tsx`) |

A auditoria do Ciclo Y listava quatro telas que pulavam; a varredura das 63 telas do roteiro de acessibilidade (as quatro abas e 59 rotas) achou 6 com achado antes (Resumo, explicação e as quatro acima) e nenhuma depois. A sétima, Contas vencidas com grupos de parcelas do ano, **só apareceu quando o roteiro passou a conferir toda tela que visita**: a demonstração de sempre não tem esses grupos, e o roteiro os cria numa conta de teste. Foi o primeiro achado da conferência nova (a primeira rodada completa falhou nela, a segunda passou).

Como o roteiro confere (`scripts/e2e-web.js`):

- **Em toda tela que o roteiro visita.** `body()`, a leitura do texto da tela que o roteiro faz em cada tela, passou a conferir também a lista de títulos visíveis (`headingWatch`): mais de um nível 1 no escopo, ou um título que pula mais de um nível em relação ao anterior, vira achado (só vale se continuar 250 ms depois, para não pegar troca de tela em andamento). O resultado fecha o roteiro na verificação "Hierarquia de títulos": na rodada final, 1.005 conferências em 212 endereços diferentes, sem nenhum achado (a janela aberta por cima de uma tela conta à parte; a lista informativa de telas lidas sem título de nível 1 saiu vazia).
- **Nas 63 telas do roteiro de acessibilidade**, a conferência é mais rígida (`acScan`): exatamente um nível 1, que vem primeiro, e nenhum salto.
- **Nos casos que mudaram** (bloco "3b. Hierarquia de títulos"): o Resumo (nível 1 com o nome "Resumo de outubro de 2026" e o texto "Outubro de 2026"; em setembro, "Resumo de setembro de 2026"), Movimentações (nível 1 "Movimentações" e o mês em nível 2), a explicação com um só nível 1 e a barra "Aprender" sem papel de título, a explicação indisponível e as quatro telas que pulavam.
- Testes que fixavam o estado antigo foram atualizados: os títulos do Resumo (`1:Outubro de 2026` no lugar de `2:Outubro de 2026`, em seis conferências) e os temas de Aprender (o único nível 1 é o título do tema, no lugar de `["Aprender", título]`, em 45 temas e em seis conferências de época e de Média e mediana).

### 14.2 Fontes: subconjunto Latin

As cinco Manrope que o app usa (400, 500, 600, 700 e 800) tinham 678 glifos de vários alfabetos. O app só escreve português do Brasil. `scripts/gerar-fontes.js` chama o `pyftsubset` (fonttools 4.66.1) sobre as fontes do pacote `@expo-google-fonts/manrope` e grava os subconjuntos em `apps/app/assets/fonts/`, com a licença (`OFL.txt`). O `useFonts` de `apps/app/src/app/_layout.tsx` carrega desses arquivos (`require('../../assets/fonts/Manrope_400Regular.ttf')` e os outros quatro, com os mesmos nomes de antes, então `theme/tokens.ts` não mudou). O pacote continua instalado e deixou de ser importado.

O que entra (202 glifos): Latin básico (U+0020 a U+007E: algarismos, letras, "R$", pontuação, aspas retas), Latin-1 (U+00A0 a U+00FF: espaço que não quebra, letras com acento, cedilha, ordinais ª e º, "·", "§", "×", "÷", "°", "©"), as aspas curvas (U+2018, U+2019, U+201C, U+201D) e os símbolos que as telas escrevem: "•", "…", "‹", "›", "→", "−" (sinal de menos) e "≈". Ficam de fora os travessões (U+2013 e U+2014: os textos do produto não usam), outros alfabetos e o Latin estendido. Os recursos de layout ficam todos: o app usa números de largura fixa (`tabular-nums`, o `tnum` da fonte) e o pareamento de letras (`kern`). As larguras de todos os glifos que ficaram são iguais às da fonte completa (conferido com o fonttools), e o arquivo sai igual toda vez que o script roda (`--verificar`). Quem digita um caractere fora do conjunto (por exemplo "ő" na descrição de um gasto) vê esse caractere na fonte do sistema, sem erro. O desenho não muda: 11 telas (Resumo, as três outras abas, explicação, reserva, plano de guardar, assinaturas, vencidas, composição e Conta) capturadas em 390 px com a versão de antes e a de depois saem **iguais byte a byte**, e o roteiro confere que o navegador carrega os arquivos de 34 KB e usa os quatro pesos do texto.

| Arquivo | Antes (B) | Depois (B) | Depois / antes |
|---|---|---|---|
| Manrope_400Regular.ttf | 96.832 | 34.400 | 35,5% |
| Manrope_500Medium.ttf | 96.904 | 34.436 | 35,5% |
| Manrope_600SemiBold.ttf | 96.936 | 34.424 | 35,5% |
| Manrope_700Bold.ttf | 96.800 | 34.312 | 35,4% |
| Manrope_800ExtraBold.ttf | 97.524 | 34.556 | 35,4% |
| **Total** | **484.996** | **172.128** | **35,5%** (312.868 B a menos) |

Comprimido (gzip, nível 6, como um servidor entrega): 209.277 para 86.019 B (123.258 B a menos). A entrada JavaScript do pacote web ficou 856 B menor (4.800.582 para 4.799.726 B: as duas linhas de importação do pacote de fontes). No aparelho, a diferença é de 312.868 B a menos no aplicativo, porque as fontes viajam dentro dele.

Efeito no tempo (Chromium com a CPU 4 vezes mais lenta, servidor com gzip, janela de 390 x 844, mediana de 5 cargas de página nova, a cada rodada intercaladas as versões; o computador rodava outros dois ciclos ao mesmo tempo, então diferenças de uns 100 ms são ruído). "Antes" é o pacote com as fontes completas; "Depois", só as fontes do Ciclo Z:

| Rede simulada | Medida | Antes | Depois |
|---|---|---|---|
| Local (como em 8.7) | Tela de boas-vindas pronta | 1.988 ms | 1.923 ms |
| Local | Do toque em "Ver demonstração" até o Resumo | 1.371 ms | 1.354 ms |
| Local | Do carregamento da página até o Resumo | 3.500 ms | 3.436 ms |
| Local | Baixado até o Resumo, comprimido | 1.421 KB | 1.300 KB (121 KB a menos) |
| 10 Mbps e 40 ms | Do carregamento da página até o Resumo | 4.741 ms | 4.585 ms |
| 1,6 Mbps e 150 ms (mediana de 3) | Do carregamento da página até o Resumo | 10.760 ms | 10.162 ms |

Os 121 KB a menos se pagam na rede: -156 ms em 10 Mbps e -598 ms em 1,6 Mbps. Na rede local o ganho (-64 ms) é do tamanho do ruído, porque a fonte não é o que a CPU mais gasta.

O teste `packages/core/test/fontes.test.ts` (5 testes) lê a tabela de caracteres (`cmap`) de cada arquivo e confere que **todo caractere escrito nos textos do core e do app** (cadeias, modelos de texto e texto de JSX, lidos com o analisador do TypeScript; comentários ficam de fora) está nos cinco, que os cinco têm os mesmos caracteres, que os travessões não estão, que cada arquivo tem menos de 40 KB, que o `useFonts` carrega dos arquivos locais, que nenhuma tela importa o pacote `@expo-google-fonts` e que a licença acompanha. Quem acrescentar um caractere novo aos textos que a fonte não tem recebe o código do caractere e o arquivo em que ele aparece. Foi verificado trocando um peso por um subconjunto sem "≈", "→", "−", "•", "›" e "‹": o teste falhou e listou os seis.

### 14.3 Rotas carregadas sob demanda (`asyncRoutes`): avaliadas, não aplicadas

O Expo Router tem a opção `asyncRoutes` (a rede desta sessão não abriu `docs.expo.dev`; a opção foi lida no esquema do plugin instalado, `node_modules/expo-router/plugin/options.json`, e no código do `@expo/cli`, que a repassa ao Metro; no SDK 57 ela entra na configuração do plugin: `["expo-router", { "asyncRoutes": { "web": "production", "default": false } }]` em `app.json`; `production` vale só para a web, e o nativo fica de fora de qualquer jeito). Cada arquivo de `src/app` vira um arquivo JavaScript à parte, baixado na primeira vez que a tela abre. A condição era aplicar só se o roteiro web inteiro passasse e o tempo até o Resumo, com a CPU 4 vezes mais lenta, não piorasse. **Piora, então não foi aplicada.** Nada disso ficou no repositório (`app.json` está como estava).

Pacote (exportação de demonstração, com as fontes do Ciclo Z nas duas):

| | Sem rotas sob demanda | Com rotas sob demanda |
|---|---|---|
| Arquivos JavaScript | 5 | 87 (83 de rotas e módulos pequenos, mais `__common`, `__expo-metro-runtime`, `entry` e o leitor de PDF) |
| Baixado antes de aparecer qualquer tela | `entry` 4.799.726 B | `entry` 1.099.426 B + `__common` 2.869.220 B + `__expo-metro-runtime` 3.537 B = 3.972.183 B (827.543 B a menos, 17%) |
| Soma de todos os arquivos | 6.612.366 B | 6.619.008 B |
| Soma comprimida (gzip) | 1.768.344 B | 1.834.360 B (66.016 B a mais: módulos repetidos em arquivos de rotas diferentes) |

Tempo (CPU 4x, servidor com gzip, mediana de 5 cargas; na rede lenta, de 3). "Fontes completas" é o pacote antes do Ciclo Z; "Ciclo Z" é a versão entregue; "Ciclo Z + sob demanda" é a versão com a opção ligada:

| Rede simulada | Medida | Fontes completas | Ciclo Z | Ciclo Z + sob demanda |
|---|---|---|---|---|
| Local | Tela de boas-vindas pronta | 1.988 ms | 1.923 ms | 2.052 ms |
| Local | Do toque em "Ver demonstração" até o Resumo | 1.371 ms | 1.354 ms | 1.537 ms |
| Local | **Do carregamento da página até o Resumo** | 3.500 ms | **3.436 ms** | **3.774 ms** (+338 ms, +10%) |
| Local | Arquivos pedidos até o Resumo | 7 | 7 | 14 |
| Local | Primeira abertura de Movimentações, Metas e Aprender | 455, 414, 522 ms | 460, 367, 509 ms | 494, 495, 645 ms |
| 10 Mbps e 40 ms | Do carregamento da página até o Resumo | 4.741 ms | 4.585 ms | 4.743 ms (+158 ms) |
| 1,6 Mbps e 150 ms | Do carregamento da página até o Resumo | 10.760 ms | 10.162 ms | 9.348 ms (-814 ms, -8%) |

Leitura: a opção tira 17% do que é baixado antes da primeira tela, mas troca isso por mais pedidos em sequência (a tela de entrada, a barra de abas e o Resumo vêm em arquivos diferentes) e por mais trabalho de montagem. Com a CPU lenta e a rede boa, que é a condição pedida, o Resumo demora 10% a mais; ela só compensa na rede lenta (1,6 Mbps e 150 ms), e mesmo ali o ganho é de 814 ms (8%), contra uma piora de 338 ms (10%) na condição pedida. Custos que a medida não mostra: a primeira abertura de cada tela passa a depender de um arquivo (sem rede, a tela não abre, e depois de uma publicação nova uma aba antiga pede arquivos cujo nome mudou, o que exige manter os arquivos antigos no servidor ou recarregar a página), e o ganho existe só na web, porque o nativo não aceita a opção em produção. Com a opção ligada, a varredura das 63 telas abriu todas sem erro (hierarquia de títulos sem achado), mas o roteiro web inteiro não foi rodado nela, porque o critério de tempo já a barrou. **Reavaliar** se houver medida de uso real na web em rede lenta (Sentry, `docs/20`) mostrando que a primeira carga é o problema.

### 14.4 O que só dá para conferir em aparelho

1. Fontes no iOS e no Android: abrir o app (instalado, sem o Expo Go) e ver o texto em Manrope em Resumo, Movimentações, uma fatura e uma explicação de Aprender, com acentos, "R$", ordinais, "→", "≈" e "−" no lugar certo, e os valores alinhados em coluna (números de largura fixa).
2. Leitor de tela: o Resumo anuncia "Resumo de outubro de 2026" como título; navegar por títulos no Resumo (VoiceOver: rotor Títulos; TalkBack: Títulos) pula de "Resumo de outubro de 2026" para "Pagamentos do mês"; a explicação de um tema anuncia o título do tema como o primeiro título e lê "Aprender" da barra como texto.
3. A barra da explicação sem papel de título não muda a aparência (a conferência pixel a pixel foi feita na web; no aparelho, só olhar).
