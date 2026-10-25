# Instagram da Clarevo (D-069): identidade do perfil e peças do primeiro mês

25/10/2026. Este documento descreve o que o gerador `scripts/gerar-instagram.js` produz, como gerar de novo, o que fica para a equipe no Canva e as regras de conferência antes de publicar. Os textos das peças vêm do **Playbook de Redes Sociais v2.2** e do **Manual Operacional v2.2** (24/10/2026; resumo em `docs/referencias/redes-sociais-e-guia-visual.md`), com o ajuste mínimo da **ficha de afirmações** (`docs/24_REDES_SOCIAIS.md`, seção 1) para o texto bater com o app de hoje. Marca no feminino ("a Clarevo"), mensagem central "Cuidar da vida financeira faz parte de cuidar de você." e apoio "Mais clareza para decidir". Sem nomes de pessoas: a proprietária, a equipe e as integrantes só aparecem por foto ou gravação reais, que a equipe escolhe.

**Tudo é rascunho para revisão.** A arte final é montada no Canva (camadas editáveis) e os vídeos, no Edits, depois da conferência da equipe. Nada foi publicado, e nenhum arquivo de mídia vai para o repositório: ficam no repositório só o gerador, os textos, a fonte e o teste.

## 1. O que o gerador produz

Saída em `--saida <pasta>` (nesta rodada, uma pasta fora do repositório). Quantidades da primeira geração:

| O quê | Quantidade | Onde |
|---|---|---|
| Avatar 1080 x 1080 (o ícone oficial C) e a conferência a 110 px e 44 px | 1 + 1 | `perfil/avatar-1080.png`, `perfil/avatar-conferencia.png` |
| Capas de destaque 1080 x 1920 (Comece aqui, Na prática, Dúvidas, Quem faz, Ajuda, Para empresas) | 6 | `perfil/destaques/` |
| Prévia do perfil no celular (cabeçalho, nome, bio, link, destaques e a grade com as 9 primeiras peças) | 1 | `perfil/previa-do-perfil.png` |
| Nome de exibição, bio (com a contagem de caracteres), link, destaques e fixados | 1 texto | `perfil/nome-e-bio.txt` |
| Carrosséis do calendário, todas as páginas 1080 x 1350: P01 (6), P03 (5), P04 (5), P07 (5), P10 (6), B01 (5) e T01 (5) | 7 peças, 37 páginas | uma pasta por peça, na ordem do calendário |
| Carrosséis de reserva, fora do calendário: R01 (5), B do Manual (5), F01 (7) e F02 (6) | 4 peças, 23 páginas | `reserva-*` |
| Capas de Reel 1080 x 1920 (P02, P05, P08, P11) | 4 | `capa.png` |
| Rascunhos em MP4 com a gravação real e o texto na tela do roteiro, em trechos (1080 x 1920, H.264, 25 quadros por segundo, sem áudio, de 33 a 36 s, de 1,4 a 1,9 MB) | 4 | `rascunho.mp4`, mais `rascunho-conferencia.png` (3 quadros), `gravacao-limpa.mp4` e `legendas.srt` (a narração) |
| Capas de vídeo com integrante real, com o quadro "[Gravação com integrante real]" (P06, P09 e P12) | 3 | `capa.png` e `roteiro.md` |
| T02 (trend a definir): só a ficha, sem arte | 1 | `D20-T02-trend-a-definir/` |
| Em cada peça: `legenda.txt`, `alt.txt` (uma linha por página nos carrosséis), `ficha.md` (ação principal, o que depende da equipe, conferência das afirmações sobre o app, ajustes ao Playbook e a lista de conferência antes de publicar) | todas | na pasta da peça |
| Calendário D1 a D30 (dia, peça, formato, objetivo, ação e o que depende da equipe) e a imagem-resumo | 2 | `calendario.md`, `calendario.png` |
| Folha de contato com todas as páginas e capas, e o `LEIA-ME.txt` com a ordem de publicação | 2 | `montagem.png`, `LEIA-ME.txt` |

Total da primeira geração: 160 arquivos (82 PNG, 8 MP4 e os textos), 26 MB.

**Foto real.** Onde o Playbook pede foto (capa da P01, a página 5 da P01 e as capas de F01 e F02) o quadro traz a moldura e a indicação "[Foto real: ...cena sugerida...]". Nenhum rosto foi gerado, nenhuma foto de banco foi baixada e nenhuma foto foi inventada. A equipe escolhe foto própria ou licenciada, com autorização de imagem, e troca no Canva. O texto alternativo dessas páginas (P01 páginas 1 e 5, capas de F01 e F02) descreve só o quadro e a cena sugerida: a `ficha.md` de cada peça diz que a equipe o reescreve, antes de publicar, para descrever o que a foto escolhida realmente mostra.

**Telas do app.** Só de captura ou gravação real da demonstração (dados fictícios, etiqueta "Demonstração"), recortadas e ampliadas sem redesenhar: as capturas 4:5 e as gravações de `scripts/gravar-redes.js` (`docs/24`, seção 2). As páginas que mostram tela levam o aviso "Exemplo fictício" ou "Dados fictícios".

## 2. Como gerar de novo

```
node scripts/gravar-redes.js --saida <pasta das gravações>          (só se precisar refazer as gravações e capturas reais)
node scripts/gerar-instagram.js --saida <pasta> --redes <pasta das gravações>
node scripts/gerar-instagram.js --saida <pasta> --redes <pasta> --so perfil,P01,P05,calendario,montagem
node scripts/gerar-instagram.js --saida <pasta> --redes <pasta> --sem-video
```

- `--redes` é a pasta que o `gravar-redes.js` grava (os `.mp4`, os quadros de conferência e `capturas/`). Sem ela, o gerador explica o que falta.
- `--so` aceita `perfil`, `calendario`, `montagem` e o código de cada peça (`P01`, `T01`, `B01`, `R01`, `F01`...). A prévia do perfil e a folha de contato leem o que já está na pasta de saída.
- A geração completa leva cerca de 7 minutos (a maior parte é a codificação dos quatro vídeos); sem vídeo, cerca de 1 minuto e meio.
- Ambiente: Chromium do Playwright (`/opt/pw-browsers` ou `CHROMIUM_PATH`), `ffmpeg` e `ffprobe` (ou `FFMPEG` e `FFPROBE`). Nenhum pacote novo e nenhum acesso à rede: a DM Sans está em `scripts/instagram/fontes`.
- Onde mexer: `scripts/instagram/conteudo.js` (os textos e os dados de cada peça), `modelos.js` (os modelos de página), `video.js` (a montagem dos rascunhos), `paineis.js` (prévia, calendário e folha de contato), `calculos.js` e `validar.js` (as contas e as conferências puras, que o teste roda).

### O que o gerador recusa

Antes de desenhar, ele confere o conteúdo e **não gera** se algo falhar: travessão, a expressão que o `CLAUDE.md` proíbe, a marca no masculino, nome de pessoa real, termo de promessa (grátis, lista de espera, "saldo disponível" afirmado, "acaba com a ansiedade", "certificado pela NR-1"...), chamada que sugira acesso aberto ("como acessar", "conhecer o acesso", "fixado Como acessar", cadastro, download: o acesso está em preparação, D-067), legenda com campo entre colchetes ("legenda pronta" não tem marcador a preencher), valor em reais que não seja de um exemplo conferido, número de páginas diferente do Playbook, nome ou bio acima dos limites e contraste abaixo do mínimo. Confere também pontos que a revisão pediu: a P11 dizer que na conta nova o primeiro registro começa do zero, a frase "não é saldo nem autorização para gastar" da P02 ter sujeito, a B01 dizer que a empresa nunca vê as finanças de ninguém, nem somadas (D-056), e a T01 página 3, a B página 5 e a R01 página 4 com o texto fixado. Em **cada página desenhada**, no navegador, confere ainda: margens laterais de 80 px; nada sobre o rodapé; nas artes 9:16, o conteúdo entre 250 px do topo e 350 px do rodapé; rótulo de 24 px ou mais, título de 56 a 72 px e corpo de 32 a 40 px; contraste real de cada texto (nunca branco sobre lima; lima sobre azul só em texto grande e em negrito); texto que não rola nem é cortado. O teste `packages/core/test/instagram.test.ts` roda a parte pura (limites do perfil, somas dos exemplos, contrastes do Manual, redação, estrutura e que cada nome de tela do app citado existe no app).

## 3. Identidade do perfil

- **Nome de exibição:** `Clarevo | Bem-estar financeiro` (Playbook v2.2), com exatamente 30 caracteres, o limite adotado. Conferir o identificador e o limite do campo na conta.
- **Bio, com o acesso em preparação (vale hoje, D-067), 119 caracteres de 150:**
  ```
  Cuidar da vida financeira faz parte de cuidar de você.
  App para organizar seu mês.
  Acompanhe as informações de acesso ↓
  ```
  Quando o acesso abrir, a terceira linha volta a ser "Conheça a Clarevo ↓" (102 caracteres), junto com a P03 e o destaque Comece aqui.
- **Link da bio:** `clarevo-site.pages.dev/comece.html`, sem parâmetro de rastreamento (D-067). É a versão preliminar do site, sem domínio próprio e sem indexação: testar no navegador do Instagram e no celular antes de abrir o perfil.
- **Identificador:** o `@` só aparece depois de confirmado o identificador real; a prévia mostra "@identificador a confirmar".
- **Avatar:** o ícone oficial C, o mesmo de `docs/marca/icone-app.svg`, nos 1080 px. A 110 px (perfil) e a 44 px (feed) o C e o crescente lima continuam legíveis (conferência em `perfil/avatar-conferencia.png`). A assinatura "clarevo." nunca vai no avatar.
- **Destaques (nesta ordem):** Comece aqui, Na prática, Dúvidas, Quem faz, Ajuda e Para empresas. As seis capas têm o mesmo desenho: só um ícone simples em traço marinho, grande e centrado, sobre um disco lima no fundo azul, **sem o nome** (o Instagram já mostra o rótulo do destaque, e o texto dentro do círculo ficaria ilegível a 110 px). O disco e o ícone ficam no centro da arte, que é onde o Instagram recorta o círculo; a prévia do perfil usa o mesmo recorte central. O conteúdo de cada destaque está em `perfil/nome-e-bio.txt`. **Para empresas** só entra com a apresentação e o canal comercial conferidos, como o Playbook manda; na prévia aparece esmaecido e tracejado.
- **Fixados:** P01, P02 e P03, nessa ordem. Na grade, os três fixados vêm primeiro e, depois, as peças mais novas primeiro (a prévia usa P09 no D20 e P06 no D13, as alternativas perenes).

## 4. Peças do primeiro mês

Na ordem do calendário do Playbook v2.2. O detalhe de cada peça (objetivo, ação, o que depende da equipe, a conferência com o app e os ajustes) está na `ficha.md` da pasta.

| Dia | Peça | Formato | Ação principal | Arte gerada |
|---|---|---|---|---|
| D5 | P01 O que é a Clarevo | Carrossel fixado, 6 páginas | Ver o fixado Clarevo na prática | 6 páginas; capa e página 5 com quadro de foto real; página 4 com a tela de Orçamento por categoria |
| D6 | P02 Clarevo na prática | Reel fixado | Ver no perfil as informações de acesso (fixado P03) | Capa, rascunho em MP4 (33 s) com Mercado e Lazer |
| D7 | P03 Como acessar | Carrossel fixado, 5 páginas | Acompanhar o perfil e ver a demonstração pelo link da bio | 5 páginas, "versão com acesso em preparação" (sem lista de espera, data nem preço); página 4 com o Resumo |
| D9 | P04 Saldo e compromissos do mês | Carrossel, 5 páginas | Salvar a sequência de conferência | 5 páginas em fundo claro, valores em reais, barras a partir de zero |
| D11 | P05 Planejar uma categoria | Reel | Ver no perfil as informações de acesso | Capa, rascunho em MP4 (34 s): Transporte, R$ 600,00 |
| D13 | P06 ou T01 | Vídeo com integrante ou trend (posição flexível) | Uma pergunta específica | P06: capa e roteiro. T01: carrossel de 5 páginas no visual de post reproduzido |
| D16 | P07 Parcela e total da compra | Carrossel, 5 páginas | Guardar o roteiro de perguntas | 5 páginas: o mesmo produto em 6 x R$ 120 e à vista, e a linha dos meses |
| D18 | P08 Uma meta com próximo passo | Reel | Ver no perfil as informações de acesso | Capa, rascunho em MP4 (36 s): meta Estudos |
| D20 | P09 ou T02 | Vídeo com integrante ou trend (posição flexível) | Escolher uma pergunta para a próxima compra | P09: capa e roteiro. T02: só a ficha (a referência é escolhida na revisão semanal) |
| D23 | P10 Revisão do mês | Carrossel, 6 páginas | Fazer a revisão com os próprios registros | 6 páginas; página 3 com a tela do orçamento |
| D25 | P11 Primeiro registro de despesa | Reel | Concluir a primeira tarefa | Capa, rascunho em MP4 (36 s, 7 trechos): Farmácia, R$ 35,00; o último avisa que, na conta da pessoa, o primeiro registro começa do zero |
| D27 | B01 Bem-estar financeiro nas empresas | Carrossel, 5 páginas | Solicitar apresentação pelo canal conferido | 5 páginas, com a ressalva da NR-1 e a frase de D-056 (a empresa nunca vê as finanças de ninguém, nem somadas); **bloqueada** (seção 6) |
| Stories e destaque Ajuda | P12 Dúvida de acesso | Vídeo com integrante | Acessar ou pedir orientação pelo canal confirmado | Capa, roteiro (com [pergunta real] e [resposta conferida] para a equipe), legenda completa, sequência de Stories e respostas-base |
| Reserva | R01, B (Manual), F01, F02 | Carrosséis | Ver cada `ficha.md` | R01 (calendário visual e a barra de 100% do Manual; a página 4 diz "Não é saldo disponível."), B (à vista ou em 10 parcelas; a página 5 cita a calculadora "Parcelado ou à vista?"), F01 (5 perguntas) e F02 (conversa sobre as contas da casa) |

### Os rascunhos em vídeo

Cada Reel traz a gravação real da demonstração (a de `scripts/gravar-redes.js`, feita até o fim do fluxo) recortada e ampliada em um quadro de 800 x 1052 px sobre o fundo azul, com a assinatura "clarevo." e o aviso "Exemplo fictício · demonstração" no alto e o texto na tela do roteiro em trechos. Tudo fica dentro das áreas livres (250 px no topo, 350 px no rodapé). A gravação perde a faixa de 200 px do alto (o cabeçalho das telas internas, que traz a etiqueta "Demonstração") e a barra de abas, que são moldura; o aviso do rascunho a substitui. Os textos e a assinatura vêm de camadas PNG desenhadas no Chromium (a DM Sans variável não passa pelo `drawtext` do `ffmpeg`), e o `ffmpeg` só as empilha. Texto na tela em DM Sans em negrito, 50 px (no vídeo o texto na tela faz o papel de título). Os tempos dos trechos são os da gravação. Como a gravação é a "limpa", o Edits pode refazer tudo a partir de `gravacao-limpa.mp4` e `legendas.srt`.

## 5. Calendário D1 a D30

`calendario.md` traz a tabela completa e `calendario.png`, a imagem-resumo. Resumo: D1 a D4 preparo (conta e acessos, avatar, bio, link e destaques, conferência do produto e da oferta, montar P01 a P03); D5, D6 e D7 os três fixados; depois P04 (D9), P05 (D11), D13 flexível, P07 (D16), P08 (D18), D20 flexível, P10 (D23), P11 (D25) e B01 (D27); revisões nos D14, D21, D28, D29 e D30; escuta (caixa de perguntas nativa) nos D15, D22 e D29; Stories de apoio nos dias de publicação. Três peças por semana como referência, sem promessa de alcance. Horários a testar: 12h e 19h de Brasília, anotando horário e formato. D13 e D20: T01 ou T02 se houver trend adequada (referência escolhida na revisão semanal, até 48 horas antes, com a ficha de referência externa do Manual e direitos de uso), senão P06 ou P09.

## 6. Conferência antes de publicar

A peça só entra na agenda quando as perguntas do Playbook estiverem respondidas (a lista está em cada `ficha.md`): utilidade, produto, autenticidade, dados, promessa, oferta, acesso, leitura, áudio e legenda, ação e registro. Um problema de acesso bloqueia a chamada para cadastro; uma informação incorreta bloqueia a publicação. Além disso:

1. **Produto.** A conferência da ficha de afirmações vale para a demonstração de 07/10/2026 e as gravações de 23/10/2026 (`docs/24`). O responsável pelo produto (a designar) refaz o teste na versão que for ao ar, com data, antes de cada peça de demonstração (P01 página 4, P02, P03 página 4, P05, P08, P10 página 3 e P11).
2. **Palavras que o app não diz.** Nada de "saldo" para o que o app calcula (a "Diferença do mês" é Recebido menos Pago e diz que não é saldo), nada de "planejado e registrado" no lugar de "orçado e usado" quando a tela aparecer, nada de "grátis", "teste gratuito", preço, data de abertura, lista de espera, plataforma ou loja (D-064, P-005).
3. **Saúde mental e NR-1.** Associação não é causalidade; nenhuma peça promete sono, produtividade ou tranquilidade, nem trata o app como tratamento. Afirmação técnica passa por profissional habilitado. A NR-1 só aparece com a ressalva "depende de avaliação técnica e não substitui o gerenciamento de riscos".
4. **Pessoas.** Foto e gravação só de pessoas reais, com função correta e autorização de imagem e de fala; a própria pessoa revisa a fala. Nada de rosto gerado, depoimento inventado nem interface gerada como se fosse tela do app.
5. **Bloqueios conhecidos hoje:**
   - **B01 e o destaque Para empresas:** canal comercial conferido (hoje o contato é marcador), revisão técnica de saúde e NR-1 e a resposta da pergunta 35 ao advogado (`docs/legal/resumo-para-advogado.md`). Uma arte com aparência de botão não cria acesso clicável. A legenda da B01 só mantém a última frase com o canal existindo.
   - **P11 e o destaque Ajuda:** canal de ajuda e horário real de atendimento (o e-mail de suporte ainda é marcador).
   - **P03, bio e destaque Comece aqui:** mudam juntos quando o acesso abrir (texto de `ACESSO` em `scripts/site/paginas/comece.js`).
   - **Link da bio:** o site é preliminar (sem domínio e sem indexação).
   - **F02:** se passar a citar a Família da Clarevo, conferir antes: a demonstração não tem Família de exemplo.
6. **Leitura e acessibilidade.** Conferir a prévia no aplicativo do Instagram (o recorte da grade e a interface podem mudar), a leitura no celular e com o som desligado, as legendas automáticas dos vídeos e o texto alternativo (`alt.txt`, uma linha por página). Contraste forte; a cor nunca é a única diferença entre valores.
7. **Registro.** Código da peça, formato, data, horário, URL publicada e janela de leitura no relatório semanal; sem parâmetro de rastreamento nos links; números do painel do Instagram anotados à mão; "não medido" onde não houver captura (`docs/24`, seção 4).

## 7. O que fica para a equipe no Canva

- **Montar cada arte como design nativo do Canva**, com texto, avatar, imagens e números em camadas separadas e a fonte DM Sans (títulos em negrito, corpo sem negrito nem itálico). Os PNG daqui são o desenho de referência; o Playbook não converte nada automaticamente em Canva. Usar a assinatura "clarevo." pelo ativo original de `docs/marca` e o ícone C só no avatar.
- **Fotos reais** (P01 capa e página 5, F01 e F02 quando forem usadas): escolher, ter a autorização e trocar o quadro. Reescrever o texto alternativo dessas páginas depois da escolha, para descrever o que a foto mostra (o `alt.txt` descreve só o quadro). Não associar a foto a depoimento nem a resultado de saúde.
- **Vídeos com integrante** (P06, P09 e P12): gravar, revisar a fala com a pessoa, legendar no Edits e montar a capa no Canva no lugar do quadro "[Gravação com integrante real]".
- **Reels** (P02, P05, P08 e P11): edição final no Edits a partir de `gravacao-limpa.mp4`, com pergunta na tela, legendas revisadas, "Exemplo fictício" enquanto os valores aparecerem e trilha só com direitos de uso. O `rascunho.mp4` serve de referência de posição e de texto.
- **Trends** (T01 e T02): decidir na revisão semanal, preencher a ficha de referência externa e manter a alternativa perene pronta.
- **Stories de apoio** nos dias de publicação, com enquete e caixa de perguntas nativas do Instagram (nunca um desenho que simule a interação).
- **Publicar**, agendar, registrar e ler as métricas.

## 8. Escolhas e desvios em relação ao Playbook

- **Números e nomes das telas.** P02, P05, P08 e P11 usam os números e os nomes que a tela da demonstração mostra (orçado, usado, faltam, acima; Transporte, R$ 600,00; meta Estudos; Farmácia, R$ 35,00), no lugar de R$ 600, R$ 450 e R$ 150, de "alimentação", de "nome" do orçamento e de "planejado e registrado" do texto original, que o app não tem. Ajustes de texto mínimos nas páginas P01 4, P04 4, P10 3 e B01 2 e 4 (cada um está em `ajustes` da `ficha.md`).
- **P03** é a versão "com acesso em preparação" do Playbook (D-067), com o texto de `docs/24`, seção 1.3.
- **Pessoas.** As peças P06, P09 e P12 do Playbook citam integrantes pelo nome; aqui a legenda diz "uma pessoa da equipe" e o nome e a função só entram depois de confirmados com a própria pessoa.
- **P11, legenda.** Sem citar o canal de ajuda (ainda a definir): "Se precisar de orientação, veja o destaque Ajuda."
- **P11, conta nova.** A gravação usa a demonstração, que já tem registros; por isso o roteiro (um sétimo trecho, nos 3,8 s finais), a legenda e o texto na tela dizem "Na sua conta, o primeiro registro começa do zero." Para caber no tempo da gravação, a narração do fim perdeu "É o primeiro passo para acompanhar".
- **Acesso em preparação nos Reels.** P02, P05, P08 e P11 terminam com "Veja no perfil as informações de acesso" (texto na tela, narração e legenda), em vez de "fixado Como acessar", "como acessar a Clarevo" ou "condições atuais": nada sugere acesso aberto, em coerência com a P03 e a bio. Quando o acesso abrir, a frase muda junto com a P03, a bio e o destaque Comece aqui.
- **P02, 17 a 24 s.** O texto na tela diz "A diferença do orçamento não é saldo nem autorização para gastar", com sujeito, para a frase não ficar solta sobre os valores de Mercado e Lazer.
- **P12, legenda.** A legenda-base do Playbook traz o campo [tema]; o `legenda.txt` sai completo, com "o acesso", e a troca do tema (se a dúvida recebida for outra) fica na ficha, em "O que depende da equipe". Só o `roteiro.md` mantém [pergunta real] e [resposta conferida], que a equipe preenche antes de gravar.
- **B01.** A página 2 e a legenda trazem "A empresa nunca vê as finanças de ninguém, nem somadas.", frase que o Playbook não tem e que repete D-056 (o RH vê vagas, convites e licenças e só as contagens de licenças). A frase fala de finanças, e não de "dados", porque o RH vê o e-mail de cada licença.
- **T01, B e R01.** A página 3 da T01 leva "Exemplo fictício" logo abaixo de "R$ 50 × 12 = R$ 600", como a página 2. A página 5 da B cita a calculadora "Parcelado ou à vista?" (a que compara à vista e parcelado), e não "Antes de financiar". A página 4 da R01 diz "Não é saldo disponível.", sem "necessariamente".
- **P12** fica nos Stories e no destaque Ajuda (v2.2), sem arte além da capa e do roteiro.
- **B01.** A legenda é nova (o Playbook só traz as páginas), só com frases do Playbook e do Manual. "Colaboradores" virou "pessoas da equipe".
- **Tamanhos.** Títulos de 56 a 72 px (o Manual admite até 90 px na capa), corpo de 32 a 40 px, rótulos de 24 px ou mais, números protagonistas de 104 a 140 px. No vídeo, o texto na tela tem 50 px em negrito.
- **Tons de apoio.** Os contornos e a hachura dos quadros de foto usam tons derivados do azul-claro (`#CBD7F3` e `#E0E8FB`); o azul escuro `#153EBD` só aparece na segunda série de barras. Não são cores novas da marca.
- **Fonte.** A DM Sans variável (OFL) foi guardada em `scripts/instagram/fontes` com o `OFL.txt` (origem e commit em `LEIAME.md`), só para gerar estas artes: o app e o site continuam em Manrope.
- **Prévia do perfil.** Mostra "n/m" (não medido) em seguidores e seguindo e "9 publicações", porque o perfil começa do zero; não inventa contagens, selos, curtidas nem comentários.
- **R01** inclui a barra de 100% do exemplo A do Manual (60,714% pago, 19,048% a pagar e 20,238% diferença, que somam 100%; arredondados a uma casa, 60,7%, 19,0% e 20,2% somam 99,9%, e a página diz isso).
- **Não gerados:** o exemplo C do Manual (humor do pet, que pede foto ou ilustração licenciada), o D (Reel de renda comprometida), o E (Stories nativos) e o F (site e mensagens); nenhum está no calendário do primeiro mês.

## 9. Decisões a registrar em `docs/00_VISAO_E_DECISOES.md` (não registradas aqui)

1. D-069: o ciclo do Instagram gera, por script, o desenho de referência do perfil e das peças do primeiro mês (`scripts/gerar-instagram.js`), sem mudar app, site nem banco; as artes finais são do Canva e do Edits.
2. A DM Sans (OFL) entra no repositório só para estas artes.
3. O nome de exibição tem 30 caracteres (no limite adotado) e a bio de hoje é a do acesso em preparação (119 caracteres).
4. A B01 e o destaque Para empresas ficam bloqueados até o canal comercial e a revisão técnica (saúde e NR-1).
5. Pautas de reserva fora do calendário: R01, B, F01 e F02.
