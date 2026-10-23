# Site da Clarevo (Ciclo Site 2, D-065, e segunda etapa, D-066)

23/10/2026. A **segunda etapa (D-066)** está nas seções 8 a 10: calculadoras, kit de imprensa, formulário de contato e Novidades por e-mail (prontos e desligados) e a contagem de visitas sem cookies. O site da Clarevo mostra o app, ensina educação financeira, tem notícias e é o lugar para tirar dúvidas. É estático, vai para a hospedagem gratuita do Cloudflare Pages (projeto `clarevo-site`, que Enzo cria depois), não tem servidor, cookies, análise de acesso nem recurso de terceiros, como diz a política de privacidade. **Nada vai ao ar antes do domínio e da revisão do advogado**: as páginas legais continuam com a faixa "Versão preliminar, em revisão", e até lá o que se vê são capturas de tela e a pasta `site/`.

Este documento é o mapa do site, o manual de quem edita e a lista do que ficou para depois. O passo a passo de criar o projeto na Cloudflare está também em `docs/07` (seção "Site público"), e as URLs que as lojas pedem estão em `docs/16` (seção 3) e `docs/lojas/ficha.md` (seção 8).

## 1. Mapa do site

| Página | Arquivo gerado | De onde vem o conteúdo |
|---|---|---|
| Início | `index.html` | Modelo em `scripts/site/paginas/inicio.js`, com os textos da ficha das lojas (`docs/lojas/ficha.md`) e capturas da demonstração |
| O app | `app/index.html` | Modelo em `paginas/app.js`. O "para que serve" de cada recurso é o do **guia de uso do app** (`packages/core/src/guide`), e cada recurso tem a captura da demonstração com a legenda "Dados fictícios de demonstração". Web hoje, lojas "em breve", sem selos |
| Para empresas | `empresas/index.html` | Modelo em `paginas/empresas.js`, conferido em `packages/core/src/company.ts`, `docs/13` e `docs/legal`. Só o que a empresa vê de fato: e-mails convidados, situação dos convites e licenças, datas e contagens. Sem preço (P-005), sem cliente nem número inventado |
| Aprender | `aprender/index.html`, `aprender/<tema>.html`, `aprender/agenda.html` | **Catálogo do app** (`packages/core/src/learn`): um tema publicado e não legado das seções `organizar`, `juros` e `tempo` por página (30 hoje), com o texto, o exemplo calculado, as hipóteses, os fatos e as fontes com a data de consulta, a data de revisão e os temas relacionados. A Agenda financeira vem do calendário de época (`learn/epoca.ts`). Cada tema que tem calculadora no catálogo liga para a página dela no site, com o mesmo `modo` do app |
| Calculadoras | `calculadoras/index.html`, `calculadoras/<slug>.html` (10), `calculadoras/calculadora.js`, `js/nucleo/` | As dez calculadoras do app (`packages/core/src/calculators`): títulos, grupos, campos, regras de validação, resultados e hipóteses são os do core, que roda no navegador (seção 8.1). Modelo em `paginas/calculadoras.js` |
| Imprensa | `imprensa.html`, `imprensa/` | Kit de imprensa (seção 8.2). Modelo em `paginas/imprensa.js` |
| Novidades | `novidades/index.html`, `novidades/AAAA-MM-DD-slug.html`, `novidades/feed.xml` (só com domínio), `novidades/como-escrevemos.html` | Posts em `site-src/novidades/*.md`; regras editoriais em `site-src/paginas/como-escrevemos.md` |
| Ajuda | `ajuda/index.html`, `ajuda/<tema>.html` (7 temas), `ajuda/indice.json`, `ajuda/busca.js` | Perguntas do suporte (`site-src/ajuda/perguntas.md`), seções "Usar o Clarevo" e "Dúvidas frequentes" do catálogo e o guia de uso do app. O mapa de qual resposta vai em qual tema fica em `paginas/ajuda.js` (`TEMAS`) |
| Segurança e privacidade | `seguranca.html` | Modelo em `paginas/seguranca.js`, coerente com `docs/legal/politica-de-privacidade.md` |
| Sobre | `sobre.html` | Modelo em `paginas/outras.js`. Sem nome de pessoa, foto nem número de uso |
| Suporte | `suporte.html` | Continua sendo a página de contato que as lojas citam; as perguntas moraram na Ajuda |
| Legais | `privacidade.html`, `termos.html`, `excluir-conta.html` | Convertidas de `docs/legal/*.md` |
| Não encontrada | `404.html` | Usa caminhos a partir da raiz, porque a Cloudflare a serve em qualquer endereço que não existe |

Todas as páginas têm o mesmo cabeçalho (logotipo oficial e menu, que no celular é um `<details>` e funciona sem JavaScript), "Pular para o conteúdo" e o rodapé com todas as seções, as páginas legais e "[RAZÃO SOCIAL] · CNPJ [CNPJ]". O modelo da página fica num só lugar, `scripts/site/modelo.js`.

**O JavaScript do site** é só do próprio site: a busca da Ajuda (`ajuda/busca.js`, 65 linhas) e as calculadoras (`calculadoras/calculadora.js`, módulo ES, mais o núcleo de `js/nucleo/`, seção 8.1). Ela lê `ajuda/indice.json`, compara no navegador e não envia nada a ninguém. O campo de busca começa escondido e só aparece quando o índice carrega, então, sem JavaScript, não há campo morto e a lista completa continua na página. Os dados estruturados (`application/ld+json`) são dados, não script que executa. Nenhum dos dois scripts envia nada, grava nada nem lê cookie.

## 2. Como gerar

```
node scripts/gerar-site.js                 grava o site em site/
node scripts/gerar-site.js --final         só grava se estiver pronto para publicar; senão sai com código 1 e lista o que falta
node scripts/gerar-site.js --pdf pacote.pdf  também gera o "Pacote para revisão jurídica" (PDF A4)
node scripts/gerar-site.js --referencia AAAA-MM-DD   data de referência dos posts (nenhum pode ter data depois dela; padrão: hoje, em Brasília)
node scripts/gerar-og-site.js              refaz a imagem de compartilhamento (precisa do Chromium do Playwright)
node scripts/gerar-marca-imprensa.js       refaz os PNG do logotipo e do símbolo do kit de imprensa, a partir dos SVG de docs/marca (--verificar só confere)
npm run test:site                          teste de navegador: calculadoras, formulários (com o worker de verdade) e kit de imprensa (precisa do Chromium)
```

`--final` recusa: marcador de dado sem valor, `[A DEFINIR`, `[PROPOSTA`, a frase de rascunho, texto de proposta, travessão, a expressão proibida pela orientação do projeto, título fora de ordem e link interno quebrado. Também recusa, em Novidades, o post sem fontes, com data que não existe ou depois da data de referência (`--referencia`, padrão hoje) e com `{{tema:...}}` ou `tema:` que não existe no catálogo (sem `--final`, cada um é um aviso no console, e o parágrafo de um `{{tema:...}}` que falta fica na página, destacado, em vez de sumir). E exige o **domínio preenchido** de propósito (`DOMÍNIO`, algo como `clarevo.com.br`), mesmo que a política deixe de citar `[DOMÍNIO]`. Com os dados atuais (todos os campos de `site/dados-da-empresa.json` vazios e os textos jurídicos ainda em rascunho), ele falha, e é o que se espera até a revisão do advogado.

**Marcadores.** `site/dados-da-empresa.json` é a entrada: `RAZÃO SOCIAL`, `CNPJ`, `ENDEREÇO`, `E-MAIL DE PRIVACIDADE`, `E-MAIL DE SUPORTE`, `E-MAIL DE CONTATO` (novo, usado em Sobre, Para empresas e Como escrevemos), `DOMÍNIO` e `DATA DE VIGÊNCIA`, e dois interruptores booleanos (D-066), `formulario_contato` e `newsletter`, que ficam `false` até Enzo ligar (seção 9). Valor vazio mantém o marcador destacado e a faixa de versão preliminar. **Com o domínio preenchido**, o site passa a ter `sitemap.xml`, `<link rel="canonical">`, `og:url` e `og:image` com endereço completo e o feed `novidades/feed.xml` (RSS) com links completos; sem domínio, nada disso existe, nem o feed nem o botão e o link que apontam para ele, porque um feed precisa de endereços completos. `robots.txt` pede para não indexar nada enquanto houver marcador pendente.

**Ver o site local, com os cabeçalhos e o worker.** As páginas abrem direto do disco, mas as calculadoras (módulos ES) e os formulários (que precisam do `_worker.js`) não. `scripts/site/servir.js` é um servidor mínimo, sem pacote, que serve `site/` como o Cloudflare Pages (`/x` abre `x.html`), aplica o `_headers` (a política de segurança inclusive) e roda o `_worker.js` para `/api/*`:

```
node -e "require('./scripts/site/servir').servir('site').then((s) => console.log(s.url))"
```

Sem variáveis, as rotas `/api/*` respondem 503. Para testar um envio sem mandar e-mail de verdade, use o roteiro `npm run test:site`, que gera o site numa pasta temporária com os formulários ligados e troca o Resend e o Brevo por um `fetch` simulado.

### Como o TypeScript do core roda no Node, sem pacote novo

Aprender e a Ajuda leem o catálogo e o guia do `packages/core`, que são TypeScript. O Node 22 não resolve `import './math'` sem extensão, então `scripts/site/catalogo.js` registra, só durante o carregamento, um gancho para `.ts` que transpila cada arquivo na hora com o `typescript` que já está instalado (é dependência do core), sem checar tipos (isso é o `npm run typecheck`). O carregamento leva 1 a 3 segundos e fica guardado em memória. O teste confere que esse caminho e o do `vitest` leem o mesmo catálogo. Se o `typescript` faltar, o gerador diz para rodar `npm install`.

### Capturas de tela

As capturas vêm da **demonstração** (dados fictícios): sete de `docs/lojas/capturas/apple-iphone-6-3pol-1206x2622/` e seis de `docs/telas/`. Os lembretes não têm captura: são do app para celular, e a única tela que existe, a da web, só avisa que eles não existem lá, então a página O app descreve o recurso só com texto. A lista, com o texto alternativo de cada uma, está em `scripts/site/imagens.js`. O gerador lê o original, reduz por média de área para 480 px (o painel da empresa, 960 px), reduz para até 256 cores sem pontilhado (as telas do app têm poucas cores de verdade) e grava PNG em `site/imagens/`. Cada imagem declara largura e altura na página. Resultado: 13 imagens com 28 a 95 KB cada (0,63 MB no total) nas páginas. O kit de imprensa (seção 8.2) é a exceção: guarda as 6 capturas em tamanho original (1206 x 2622, cerca de 1,3 MB) e os PNG da marca, para a imprensa baixar. O site inteiro, com as 67 páginas (formulários desligados), as fontes, o núcleo das calculadoras e o kit de imprensa, tem 3,6 MB, bem abaixo dos limites do Cloudflare Pages. Uma cópia de cada resultado fica no cache `clarevo-site-imagens` da pasta temporária do sistema, e a chave dele junta os bytes do original, a largura e o resumo do código de `png.js` e de `imagens.js`: mudar o método invalida o cache sozinho. O teste compara os pixels, não os bytes, porque o zlib de cada versão do Node pode gerar bytes diferentes para o mesmo desenho.

Toda captura mostra "Dados fictícios de demonstração" na legenda. Quando uma tela do app mudar, é preciso refazer a captura do app (`npm run test:web` regrava `docs/telas`; `scripts/capturas-lojas.js` regrava as das lojas) e rodar o gerador.

### Imagem de compartilhamento

`site/og/clarevo.png` (1200 x 630, PNG de 24 bits, sem transparência) vem de `site-src/imagens/og-clarevo-1200x630.png`, que `scripts/gerar-og-site.js` desenha no mesmo padrão do gráfico do Google Play: fundo azul, logotipo oficial reverso, o subtítulo da ficha das lojas e a tela Resumo da demonstração. O script confere as margens e recusa o desenho que encostar nas bordas.

## 3. Como publicar uma novidade

Um post é um arquivo Markdown em `site-src/novidades/AAAA-MM-DD-slug.md`. **Fluxo combinado:** Enzo manda o assunto, a Claude escreve o texto com fonte, Enzo aprova e a Claude gera o site e entrega. Ou Enzo escreve ou edita o Markdown pelo GitHub e pede à Claude para gerar o site (o `site/` só muda rodando `node scripts/gerar-site.js`, e o `npm test` falha enquanto o `site/` estiver desatualizado).

O arquivo começa com um cabeçalho entre `---`:

```
---
titulo: 13º salário: quando cai e como se organizar
data: 2026-10-23
resumo: Uma frase de até 220 caracteres, que aparece no índice, no feed e no compartilhamento.
autoria: Equipe Clarevo
fontes:
  - tema: decimo-terceiro
  - Para empresas | empresas/index.html
  - Nome da fonte oficial | https://www.gov.br/endereco
  - Um texto sem link
---
O corpo, em Markdown. Use ## para as seções (o título da página já é o h1).
```

- **Data**: a do nome do arquivo e a do cabeçalho precisam ser a mesma, existir no calendário e não ser depois da data de referência (hoje, ou a de `--referencia`); a data é a de publicação. Um arquivo `.md` com nome fora do padrão `AAAA-MM-DD-slug.md` também é recusado, para um texto nunca ficar de fora sem aviso.
- **Fontes**: pelo menos uma. `tema: slug` traz sozinhas as fontes do tema do catálogo de Aprender; `Rótulo | página.html` liga a outra página do site (o caminho parte da raiz do site); `Rótulo | https://...` liga uma fonte externa (só `https`; e a política de segurança do site só aceita links de texto).
- **Texto do catálogo sem copiar**: uma linha sozinha, como `{{tema:decimo-terceiro:short}}`, é trocada pelo texto do catálogo (`titulo`, `subtitulo`, `short`, `p1` a `p5`, `exemplo` e `hipoteses`). Assim a mesma frase nunca existe em dois lugares, e o texto do post acompanha a revisão do tema.
- **Só fato que já existe**: sem notícia externa nova, sem preço, sem número de uso, sem depoimento, sem recomendar produto financeiro.
- **Correção**: se um erro for achado, corrija no próprio texto e registre a correção nele (uma seção "Correção", com a data e o que mudou). Não apague o erro em silêncio.

O gerador recusa o post sem título, data, resumo, autoria ou fontes, com data inválida, futura ou diferente da do nome e com `tema:` ou `{{tema:...}}` que não existe no catálogo: sem `--final`, é um aviso no console, e o `--final` falha. O índice, o feed (`novidades/feed.xml`, só com domínio) e o sitemap se atualizam sozinhos.

## 4. Regras editoriais

Estão publicadas em `novidades/como-escrevemos.html` (texto em `site-src/paginas/como-escrevemos.md`): toda informação com fonte oficial ou identificada; data de publicação e de revisão; fontes de mercado marcadas; exemplos com hipóteses e contas conferidas por teste; nenhuma recomendação de produto financeiro; nenhuma publicidade; correção no próprio texto; português do Brasil, linguagem neutra de gênero, frases curtas.

Valem também as regras do projeto (`CLAUDE.md`): sem travessão e sem a expressão proibida (o teste confere todo texto gerado), conteúdo financeiro só do catálogo (com fonte), nenhuma marca das lojas além de "App Store" e "Google Play" em texto, sem selos, sem preço e sem número de uso. O catálogo de Aprender é revisado como descreve `docs/09`: quando um tema mudar lá, o site muda junto na próxima geração.

## 5. Criar o projeto `clarevo-site` e apontar o domínio

O passo a passo completo e as condições para publicar estão em `docs/07`, seção "Site público". Em resumo, depois da revisão do advogado:

1. Cloudflare, **Workers e Pages**, **Pages**, **Conectar ao Git**, repositório do Clarevo.
2. Nome `clarevo-site`, branch `main`, framework **None**, **sem comando de build**, pasta de saída **`site`**, sem variáveis (elas só entram quando o formulário de contato e as Novidades por e-mail forem ligados, seção 9). A Cloudflare reconhece sozinha o `_worker.js` da pasta `site` e o `_routes.json`.
3. Deixe **desligados** o Web Analytics, o Email Address Obfuscation e o Rocket Loader: os três injetam script, a política de segurança (`_headers`) só aceita arquivos do próprio site, e medir acessos contradiz a política de privacidade.
4. Abra o endereço e confira as páginas no celular e no computador, claro e escuro, que o console não mostra bloqueio da política de segurança, que a busca da Ajuda acha "senha" e que a Cloudflare não define cookie (o painel de rede do navegador não deve mostrar `Set-Cookie`).
5. **Domínio** (P-006): preencher `DOMÍNIO` em `site/dados-da-empresa.json` (só o endereço, sem `https://`), gerar de novo, e em **Domínios personalizados** de `clarevo-site` apontar o **domínio raiz**. O app web iria para `app.` do domínio (em `clarevo`), **a confirmar**: nesse caso troque `URL_APP` em `scripts/site/config.js`, atualize o Site URL e as Redirect URLs do Supabase e `EXPO_PUBLIC_SITE_URL`, e as URLs das lojas (`docs/07` e `docs/16`).
6. Com o domínio ligado, confira o **Email Address Obfuscation** na zona e considere o HSTS (a linha vai no bloco `/*` de `CABECALHOS` em `scripts/site/gerar.js`, e o `site/_headers` se gera, não se edita).

A Cloudflare serve `privacidade.html` em `/privacidade`, `app/index.html` em `/app/` e assim por diante; as páginas se ligam por caminhos relativos com `.html`, que funcionam também abertas direto do disco.

## 6. O que fica para depois

- Versão em inglês, busca dentro de Aprender e o card "Neste mês" na página inicial (hoje a Agenda mostra o ano todo, porque o site é gerado e não depende da data).
- Páginas de loja ligadas aos selos oficiais, quando o app estiver publicado.
- Gerar o site no próprio build da Cloudflare (`node scripts/gerar-site.js --final` como comando de build), o que faria o `--final` ser a trava de publicação. Hoje a pasta `site/` é commitada pronta, para o projeto continuar sem comando de build.
- Ligar o formulário de contato e as Novidades por e-mail (seção 9), que dependem de contas de Enzo no Resend e no Brevo e da revisão do advogado.
- Termos de uso da marca para terceiros, depois do registro no INPI (hoje o kit de imprensa só libera o uso "para falar do Clarevo, sem alterar").
- Calculadoras que guardam o resultado (anotar parcelamento, criar meta, simular com rendimento): ficam só no app, porque o site não grava nada.

## 7. Decisões e pendências deste ciclo (a registrar em `docs/00`)

Decisões da Claude, revisáveis por Enzo:

1. Estrutura do gerador em módulos (`scripts/site/*.js`), conteúdo próprio em `site-src/` e `node scripts/gerar-site.js` como único comando.
2. Aprender com uma página por tema publicado das seções `organizar`, `juros` e `tempo`; "Usar o Clarevo" e "Dúvidas frequentes" vão para a Ajuda, e o tema em rascunho (`apagar-dados`) fica de fora, como no app.
3. A página de um tema não mostra o campo "onde na fonte" (`locator`) das fontes, como o app também não mostra, porque ele guarda anotações de método (por exemplo, "trecho de resultado de busca; a página não abriu"). Mostra o nome da fonte com link, a data de consulta e a numeração que os "fatos" citam.
4. As fontes do tipo "decisões do projeto" (`D-021`) aparecem no site como "Regra do próprio Clarevo", sem os códigos, que são referências internas (o app mostra "Clarevo: D-021"). É igual em Aprender, nos posts e na Ajuda; um teste recusa qualquer `D-NNN` nas páginas.
5. A Ajuda tem sete temas, e cada resposta do guia de uso, do catálogo e do suporte fica em um só tema; uma função nova do app sem tema faz o gerador falhar com a lista.
6. O novo marcador `[E-MAIL DE CONTATO]` (Sobre, piloto de empresas e correções), a ser trocado junto com os outros quando houver e-mail próprio.
7. A busca da Ajuda usa JavaScript do próprio site, e a política de segurança do `_headers` ganhou `script-src 'self'` e `connect-src 'self'`.
8. Sem domínio, não há `canonical`, `og:url`, `og:image`, sitemap nem feed (nem o botão e o link para ele): um feed com endereços relativos seria inválido. O `--final` exige o domínio preenchido.
9. O fim do benefício, no site, diz só o que o código garante: nada é apagado e o acesso pleno continua por 30 dias, contados do encerramento da licença ou do fim do contrato (`BENEFIT_GRACE_DAYS` e `end_license`). O que vale depois disso (o "plano gratuito") é `[A DEFINIR]` (P-005) nos termos e o site não o afirma.
10. A empresa não vê "quando a pessoa abre o app nem o que ela anota", mas vê a data em que a pessoa aceitou o convite ("Ativa desde") e a do encerramento (inclusive quando a pessoa exclui a conta). O site diz isso, e não "não vê o que você faz no app".
11. A página Segurança diz que o site não usa **cookies próprios** nem análise de acesso e que a hospedagem recebe o endereço da página e o IP, e traz uma linha sobre o componente do Google (ML Kit) na leitura de QR Code no Android, como nas seções 5 e 8 da política (que ainda tem `[A DEFINIR]` sobre isso).

Pendências:

- **Política de privacidade** (`docs/legal`): a seção 2 diz "[A DEFINIR: confirmar que o site não tem formulário nem rastreador]". O site tem agora um campo de busca (sem `<form>`, sem envio, só leitura de um arquivo do próprio site) e dados estruturados, e continua sem cookies próprios, análise de acesso e recurso de terceiros (a hospedagem recebe o endereço da página e o IP, como em qualquer site). Vale o advogado ler esta seção com o site novo.
- A página Segurança e privacidade repete fatos da política (o que guardamos, o que não guardamos, quem vê). Quando a política mudar, atualize `scripts/site/paginas/seguranca.js` junto (a lista de mudanças de `docs/legal/LEIAME.md` vale também para ela).
- Os dois e-mails e o domínio ainda não existem (P-006, P-008, P-023): os marcadores ficam visíveis e o `--final` falha até lá.
- Nada disso foi publicado.

## 8. Segunda etapa (D-066): as cinco novidades

Enzo aprovou a versão 1 e pediu a segunda etapa em 23/10/2026. Tudo continua gratuito e coerente com "sem cookies próprios, sem análise de acesso, sem recurso de terceiros carregado no navegador". O que depende de conta de Enzo (Resend, Brevo e o painel da Cloudflare) está **pronto e desligado**: nunca há chave, senha ou token no repositório nem no chat, e os segredos ficam só no painel da Cloudflare.

### 8.1 Calculadoras (`calculadoras/`)

As dez calculadoras do app, na ordem e nos grupos do catálogo (`packages/core/src/calculators/catalog.ts`): um índice (`calculadoras/index.html`, com os três grupos) e uma página por calculadora. **Uma só fonte de verdade**: o navegador roda o mesmo código do core.

- **Núcleo.** `scripts/site/nucleo.js` parte das entradas das calculadoras, transpila cada `.ts` com o `typescript` que já está instalado (o mesmo gancho de `catalogo.js`, só que para módulos ES e sem comentários), segue os imports relativos, reescreve cada caminho para terminar em `.js` e grava só o fecho de dependências em `site/js/nucleo/` (26 arquivos, cerca de 300 KB sem compressão: o fecho vem de `committed`, `series`, `cards`, `records` e `simulate`, que as calculadoras importam). Cada arquivo diz de onde veio e que não se edita. Rodar o gerador duas vezes dá os mesmos bytes.
- **Script da página.** `site-src/calculadoras/calculadora.js` (copiado para `calculadoras/calculadora.js`) só monta os campos, lê o que a pessoa digita e mostra o que o núcleo devolve. Os rótulos, as dicas, as faixas, as mensagens de erro, o resultado, os avisos e as hipóteses são os do core. A regra de quando mostrar um erro é a do app (o "vazio" só depois de mexer no campo e sair dele). Resultado e erros ficam numa região para leitor de tela que fala o resultado uma vez, depois que a pessoa para de digitar.
- **O que não vem do app.** Os atalhos que gravam algo ("Anotar como parcelamento", "Anotar como gasto fixo", "Criar reserva", "Criar meta", "Simular com rendimento") ficam só no app, porque o site não grava nada. Em "Antes de financiar", a renda é a que a pessoa digita (o app a traz da renda de referência, e o comprometido do mês vem da conta dela). Em "Em que ordem quitar as dívidas?", a lista começa vazia (o app a preenche com os parcelamentos).
- **Nada sai do navegador.** Sem envio, sem armazenamento (nem `localStorage`), sem cookie e sem nada na URL. O único parâmetro lido do endereço é `modo`, o mesmo que o catálogo de Aprender usa nos temas (`?modo=emprestimo`, `rotativo`, `cheque_especial` em "Quanto custa uma dívida?" e `?modo=cota-unica` em "Parcelado ou à vista?", que vira "Cota única ou parcelado?"). O teste de navegador confere que `localStorage`, `sessionStorage`, cookie e a URL ficam vazios depois de usar.
- **Sem JavaScript.** Cada página mostra o que a calculadora faz, a lista do que ela pede (num `<noscript>`), o aviso de que a conta precisa de JavaScript, o link para a versão web e um **exemplo calculado na geração** pelo próprio core, com números fictícios (`EXEMPLOS` em `paginas/calculadoras.js`). Módulos ES não abrem direto do disco (`file://`): para ver as calculadoras localmente, use um servidor (`scripts/site/servir.js`).
- **Avisos.** Cada página repete o aviso fixo do app (`CALC_DISCLAIMER`: "Simulação com os valores e as taxas que você informou. Não é recomendação de produto financeiro nem oferta de crédito.") e acrescenta que os resultados são estimativas e não garantem resultado.
- **Ligações.** Cada tema de Aprender que tem calculadora no catálogo liga para a página dela, com o mesmo `modo` do app. O índice de Aprender, a página inicial, o menu principal, o rodapé e a 404 ganham "Calculadoras". Com oito itens mais o botão "Abrir a versão web", o menu em linha não cabe abaixo de 1120 px (70 rem; antes, 62 rem, e com 7 itens), então abaixo disso vale o menu do celular (um `<details>`, que funciona sem JavaScript). O teste de largura foi feito em 360, 375, 768, 991, 1119, 1120, 1152, 1200, 1280 e 1440 px: nunca há duas linhas nem rolagem horizontal.
- **Segurança.** A política de segurança continua `'self'`: os módulos são do próprio site, e `connect-src 'self'` já existia por causa da busca da Ajuda.

### 8.2 Kit de imprensa (`imprensa.html`, `imprensa/`)

Logotipo e símbolo oficiais em SVG (cópia exata de `docs/marca`, sem redesenho) e em PNG com fundo transparente, nas três versões (colorido, reverso e de uma cor), cores, fonte (Manrope, licença OFL), três descrições prontas (uma frase, 50 e 100 palavras, com a contagem conferida pelo gerador), fatos para conferir, regras de uso do logotipo, seis capturas da demonstração em tamanho original (dados fictícios, com a etiqueta "Demonstração" do próprio app) e o contato (`[E-MAIL DE CONTATO]`). Sem números de uso, clientes nem prêmios.

Os PNG saem de `node scripts/gerar-marca-imprensa.js` (Chromium do Playwright) para `site-src/imprensa/`, com um `origem.json` que guarda o resumo SHA-256 de cada SVG: o teste do site confere que o logotipo de `docs/marca` não mudou sem refazer o PNG. As regras de uso seguem `docs/marca/LEIAME.md` (o ponto lima faz parte do logotipo, não redesenhar, o símbolo só como ícone). Os termos de uso da marca são curtos de propósito ("para falar do Clarevo, sem alterar; para outro uso, escreva antes") e viram a pergunta 32 do advogado.

### 8.3 Formulário de contato para empresas (pronto e desligado)

Em "Para empresas", no bloco "Falar sobre um piloto": nome, e-mail, empresa, faixa do número aproximado de pessoas, mensagem, texto curto de privacidade ao lado (para que os dados servem, que o site não guarda a mensagem, link para a política), campo-isca escondido contra robôs (`website`, fora da tela e do teclado), tamanhos máximos iguais no navegador (`maxlength`) e no worker, e validação nos dois lados. **Sem JavaScript o envio funciona**: é um `POST` comum para `/api/contato`.

- **O worker.** `site/_worker.js` (gerado de `site-src/worker/worker.js`) usa o **Cloudflare Pages em modo avançado** e só existe no projeto `clarevo-site`: o app tem outro projeto (`apps/app/dist`) e não é afetado. `_routes.json` manda só `/api/*` para o worker, de modo que as páginas estáticas continuam servidas direto, com o `_headers` de sempre, e não gastam a cota de execuções. Qualquer outra rota que chegue ao worker cai nos arquivos estáticos (`env.ASSETS.fetch`), com os cabeçalhos de segurança.
- **O envio.** `POST /api/contato` manda um e-mail ao endereço de contato pela API do **Resend** (`https://api.resend.com/emails`) e termina: sem KV, banco, arquivo nem log. O corpo enviado ao Resend tem só `from`, `to`, `reply_to` (o e-mail da pessoa), `subject`, `text` e `html` (com o texto escapado). Nenhum IP, navegador nem cabeçalho vai junto.
- **Variáveis** (painel da Cloudflare, seção 9): `RESEND_API_KEY` (segredo), `CONTATO_DESTINO` e `CONTATO_REMETENTE`. Sem elas, a rota responde **503** com mensagem clara. Quem pede HTML (um navegador, num envio de formulário) ganha um redirecionamento (303) para `contato-enviado` (sucesso) ou `contato-erro` (qualquer problema, inclusive 503); quem pede JSON ou não diz o que aceita ganha o status de verdade (400, 403, 405, 413, 502 ou 503) e um JSON com a mensagem.
- **Defesas.** Método diferente de `POST` dá 405 (`Allow: POST`); campo-isca preenchido é descartado sem enviar e com a mesma resposta de um envio de verdade; corpo acima de 20 KB dá 413; campo vazio, grande demais ou e-mail fora do formato dá 400; `Origin` de outro site dá 403 (o navegador manda `Origin: null` quando a página pede `no-referrer`, como a deste site, e isso é aceito). Não há CAPTCHA de terceiros, porque isso carregaria script de fora. Se o formulário atrair spam, a saída é uma regra de limite de taxa no painel da Cloudflare (a conferir o que o plano gratuito oferece).
- **Interruptor.** O gerador só mostra o formulário (e só gera `contato-enviado.html` e `contato-erro.html`) com `"formulario_contato": true` em `site/dados-da-empresa.json`. Com `false` (o padrão), "Para empresas" mostra o e-mail de contato, como na versão 1.

### 8.4 Novidades por e-mail, com consentimento (pronta e desligada)

`novidades/receber.html` e um bloco em Novidades (`novidades/index.html`): e-mail, caixa de consentimento **obrigatória e desmarcada** ("Quero receber as Novidades do Clarevo por e-mail. Posso cancelar quando quiser."), link para a política e a explicação da confirmação por e-mail (dupla confirmação).

- **O envio.** `POST /api/newsletter` (no mesmo `_worker.js`) cadastra o contato no **Brevo** pela API de dupla confirmação (`POST https://api.brevo.com/v3/contacts/doubleOptinConfirmation`, com o cabeçalho `api-key`), só com `email`, `includeListIds`, `templateId` e `redirectionUrl`. O Brevo envia o e-mail de confirmação; só quem clica no link entra na lista. Sem a caixa de consentimento (ou com e-mail fora do formato), nada é cadastrado.
- **Variáveis:** `BREVO_API_KEY` (segredo), `BREVO_LISTA_ID`, `BREVO_MODELO_CONFIRMACAO_ID` e, opcional, `BREVO_URL_RETORNO` (a página aberta depois do clique de confirmação; sem ela, o worker usa `<endereço do site>/novidades/receber-confirmado`). Sem as obrigatórias, 503.
- **Descadastro.** É o link de cancelamento que o próprio Brevo põe em todo e-mail das Novidades. O site não guarda o e-mail nem tem lista própria. Quando alguém pedir o cancelamento por `[E-MAIL DE PRIVACIDADE]`, o e-mail é descadastrado à mão no painel do Brevo.
- **Páginas de resposta:** `receber-enviado` ("Falta só confirmar"), `receber-confirmado` ("Cadastro confirmado") e `receber-erro`. O rodapé ganha "Novidades por e-mail" com o interruptor ligado.
- **Interruptor.** `"newsletter": true` em `site/dados-da-empresa.json`. Com `false`, nenhuma dessas páginas existe.
- **Plano gratuito do Brevo e e-mail de confirmação:** os limites do plano e a variável que o modelo de confirmação precisa ter (o link de confirmação) estão **a conferir** no painel e na documentação do Brevo, que a rede deste ambiente não abriu. O mesmo vale para o formato exato dos campos do Resend e do Brevo, que o código segue da documentação conhecida: confira no primeiro teste real (seção 9).

### 8.5 Contagem de visitas sem cookies

Não há código no site para isso. Para saber quantas pessoas visitam, use as **estatísticas de tráfego que a própria Cloudflare mostra no painel**, medidas no servidor, sem script na página e sem cookie (no painel da zona do domínio, em Analytics e Logs, Tráfego; o nome exato do menu muda, a conferir). Elas só existem depois que o domínio estiver na Cloudflare (P-006).

**Mantenha desligado o Web Analytics com script** (no projeto `clarevo-site`, em Configurações, e na zona): ele injetaria um script externo, que a política de segurança do `_headers` bloqueia e que contradiria a política de privacidade. É o mesmo cuidado da lista da seção 5 (Web Analytics, Email Address Obfuscation e Rocket Loader desligados).

Usar as estatísticas do painel acrescenta uma frase à política de privacidade (seção 10), já deixada como `[PROPOSTA: ...]` para o advogado, e a pergunta 31 do resumo.

## 9. Ligar o formulário e as Novidades por e-mail (passo a passo para Enzo)

Só depois de: domínio (P-006) com e-mail próprio, revisão do advogado das seções 3.6 e 3.7 da política (perguntas 26 a 30 do resumo) e o site publicado. **Nunca cole uma chave de API, senha ou token no chat, no repositório nem num e-mail**: os segredos entram só no painel da Cloudflare. Os planos gratuitos e os limites citados abaixo estão a conferir nas páginas dos fornecedores.

**1. Resend (contato).**
1. Crie a conta com o e-mail da empresa e adicione o domínio (os registros DNS de SPF e DKIM que o Resend pedir, no painel do domínio). Espere o domínio ficar verificado. É a mesma conta e o mesmo domínio previstos para os e-mails de confirmação de cadastro (`docs/20`, seção 2).
2. Crie uma chave de API só com permissão de envio, restrita ao domínio. Guarde-a num gerenciador de senhas.
3. Escolha o remetente (por exemplo, `Clarevo <site@seudominio>`, que deve ser do domínio verificado) e o endereço que recebe as mensagens (`CONTATO_DESTINO`, o e-mail de contato).

**2. Brevo (Novidades).**
1. Crie a conta, confirme o remetente e crie uma **lista** só para as Novidades. Anote o número dela (`BREVO_LISTA_ID`).
2. Crie o **modelo de e-mail de confirmação (dupla confirmação)**, com o texto e o botão de confirmar que o Brevo pede para esse tipo de modelo (o link de confirmação é uma variável do próprio Brevo; confira o nome no editor). Anote o número do modelo (`BREVO_MODELO_CONFIRMACAO_ID`).
3. Nas configurações da conta, em chaves de API, crie uma chave (`BREVO_API_KEY`). Guarde-a num gerenciador de senhas.
4. Garanta que os e-mails das Novidades tenham o link de cancelamento do Brevo (é o descadastro do site).

**3. Cloudflare.** (Os nomes dos menus mudam de tempos em tempos: confira no painel.)
1. Workers e Pages, projeto `clarevo-site`, **Configurações**, **Variáveis e segredos** (ambiente de **Produção**).
2. Adicione `RESEND_API_KEY` e `BREVO_API_KEY` como **Segredo** (secret), e `CONTATO_DESTINO`, `CONTATO_REMETENTE`, `BREVO_LISTA_ID` e `BREVO_MODELO_CONFIRMACAO_ID` como texto. `BREVO_URL_RETORNO` é opcional.
3. Salve e **faça uma nova implantação** (as variáveis só valem na implantação seguinte).

**4. Ligar.** Peça à Claude para ligar (ou edite `site/dados-da-empresa.json`: `"formulario_contato": true` e `"newsletter": true`), gerar o site (`node scripts/gerar-site.js`), conferir o `git diff` de `site/` e publicar. Cada interruptor é independente.

**5. Conferir depois de ligar** (no endereço real, no celular e no computador, claro e escuro):
- Contato: envie uma mensagem de teste pelo formulário. Deve cair em "Mensagem enviada", e o e-mail deve chegar em `CONTATO_DESTINO` (olhe o spam), com o nome da empresa no assunto e o e-mail da pessoa em "responder para". Envie com o e-mail inválido e sem JavaScript: deve cair em "Não foi possível enviar".
- Novidades: inscreva um e-mail seu. Deve cair em "Falta só confirmar", chegar o e-mail de confirmação, e o clique deve abrir "Cadastro confirmado" e pôr o contato na lista do Brevo. Mande um e-mail de teste da lista e confira o link de cancelamento.
- Segurança: o console do navegador não mostra bloqueio da política de segurança; o painel de rede não mostra `Set-Cookie`; abrir `/api/contato` direto no navegador mostra a mensagem de método não permitido (405); o campo escondido não aparece na tela.
- Se o formulário mandar para "Não foi possível enviar" com tudo certo, veja se as variáveis foram salvas no ambiente de **Produção**, se houve nova implantação, se o domínio do remetente está verificado e se a chave tem permissão de envio. O formato exato dos campos de cada API foi escrito da documentação conhecida e deve ser conferido no primeiro teste real.
- Spam: se chegar mensagem de robô, ligue a regra de limite de taxa da Cloudflare para `/api/contato` e `/api/newsletter` (a conferir o que o plano gratuito oferece).

**6. Desligar.** Volte os interruptores para `false`, gere o site e publique: o formulário, as páginas de resposta e o link do rodapé somem. As variáveis podem ficar, ou ser apagadas no painel.

**O que o código garante.** O worker não grava nada, não escreve log, só chama o Resend e o Brevo e só com os campos do formulário. Quem ligar também precisa de `[PROPOSTA: ...]` resolvidas na política (seções 3.6 e 3.7), porque o `--final` as recusa.

## 10. Decisões da segunda etapa (a registrar em `docs/00`)

Decisões da Claude, revisáveis por Enzo:

1. **Núcleo das calculadoras gerado do core** (`scripts/site/nucleo.js`), em vez de reescrever a conta em JavaScript do site: um erro de conta não pode existir só em um dos dois lados. O custo é cerca de 300 KB de módulos (compressão da hospedagem reduz) que o fecho de dependências do core impõe.
2. **Uma página por calculadora e um índice com os três grupos**; "Cota única ou parcelado?" é a mesma página de "Parcelado ou à vista?" aberta com `?modo=cota-unica`, que é o parâmetro que o catálogo de Aprender já usa.
3. **O aviso das calculadoras é o do app** (`CALC_DISCLAIMER`), com uma frase a mais sobre estimativa e garantia, e o que grava algo fica só no app.
4. **Formulários prontos e desligados por interruptores no JSON da empresa**; desligados, as páginas de resposta nem existem. O `_worker.js` e o `_routes.json` são gerados sempre, mas só `/api/*` chega ao worker e, sem variáveis, ele responde 503.
5. **Nada é gravado no site**: o worker só repassa a Resend e Brevo. Em HTML, o erro vira redirecionamento para uma página de erro própria; em JSON, vale o status.
6. **Sem CAPTCHA de terceiros**: só campo-isca, tamanhos, validação e `Origin`. Se houver spam, limite de taxa da Cloudflare.
7. **Contagem de visitas**: só as estatísticas do painel da Cloudflare, sem script. O Web Analytics com script fica desligado.
8. **Kit de imprensa com termos de uso da marca curtos** ("para falar do Clarevo, sem alterar"), à espera do advogado e do registro no INPI.
9. **Perguntas novas ao advogado** (26 a 32, seção h do resumo) e seções `[PROPOSTA: ...]` 3.6, 3.7 e 10 da política.

Pendências: a política e o resumo ainda são rascunhos; o `--final` continua falhando até o advogado, o domínio e as contas de e-mail existirem.
