# Site da Clarevo, versão 1 (Ciclo Site 2, D-065)

23/10/2026. O site da Clarevo mostra o app, ensina educação financeira, tem notícias e é o lugar para tirar dúvidas. É estático, vai para a hospedagem gratuita do Cloudflare Pages (projeto `clarevo-site`, que Enzo cria depois), não tem servidor, cookies, análise de acesso nem recurso de terceiros, como diz a política de privacidade. **Nada vai ao ar antes do domínio e da revisão do advogado**: as páginas legais continuam com a faixa "Versão preliminar, em revisão", e até lá o que se vê são capturas de tela e a pasta `site/`.

Este documento é o mapa do site, o manual de quem edita e a lista do que ficou para depois. O passo a passo de criar o projeto na Cloudflare está também em `docs/07` (seção "Site público"), e as URLs que as lojas pedem estão em `docs/16` (seção 3) e `docs/lojas/ficha.md` (seção 8).

## 1. Mapa do site

| Página | Arquivo gerado | De onde vem o conteúdo |
|---|---|---|
| Início | `index.html` | Modelo em `scripts/site/paginas/inicio.js`, com os textos da ficha das lojas (`docs/lojas/ficha.md`) e capturas da demonstração |
| O app | `app/index.html` | Modelo em `paginas/app.js`. O "para que serve" de cada recurso é o do **guia de uso do app** (`packages/core/src/guide`), e cada recurso tem a captura da demonstração com a legenda "Dados fictícios de demonstração". Web hoje, lojas "em breve", sem selos |
| Para empresas | `empresas/index.html` | Modelo em `paginas/empresas.js`, conferido em `packages/core/src/company.ts`, `docs/13` e `docs/legal`. Só o que a empresa vê de fato: e-mails convidados, situação dos convites e licenças, datas e contagens. Sem preço (P-005), sem cliente nem número inventado |
| Aprender | `aprender/index.html`, `aprender/<tema>.html`, `aprender/agenda.html` | **Catálogo do app** (`packages/core/src/learn`): um tema publicado e não legado das seções `organizar`, `juros` e `tempo` por página (30 hoje), com o texto, o exemplo calculado, as hipóteses, os fatos e as fontes com a data de consulta, a data de revisão e os temas relacionados. A Agenda financeira vem do calendário de época (`learn/epoca.ts`) |
| Novidades | `novidades/index.html`, `novidades/AAAA-MM-DD-slug.html`, `novidades/feed.xml`, `novidades/como-escrevemos.html` | Posts em `site-src/novidades/*.md`; regras editoriais em `site-src/paginas/como-escrevemos.md` |
| Ajuda | `ajuda/index.html`, `ajuda/<tema>.html` (7 temas), `ajuda/indice.json`, `ajuda/busca.js` | Perguntas do suporte (`site-src/ajuda/perguntas.md`), seções "Usar o Clarevo" e "Dúvidas frequentes" do catálogo e o guia de uso do app. O mapa de qual resposta vai em qual tema fica em `paginas/ajuda.js` (`TEMAS`) |
| Segurança e privacidade | `seguranca.html` | Modelo em `paginas/seguranca.js`, coerente com `docs/legal/politica-de-privacidade.md` |
| Sobre | `sobre.html` | Modelo em `paginas/outras.js`. Sem nome de pessoa, foto nem número de uso |
| Suporte | `suporte.html` | Continua sendo a página de contato que as lojas citam; as perguntas moraram na Ajuda |
| Legais | `privacidade.html`, `termos.html`, `excluir-conta.html` | Convertidas de `docs/legal/*.md` |
| Não encontrada | `404.html` | Usa caminhos a partir da raiz, porque a Cloudflare a serve em qualquer endereço que não existe |

Todas as páginas têm o mesmo cabeçalho (logotipo oficial e menu, que no celular é um `<details>` e funciona sem JavaScript), "Pular para o conteúdo" e o rodapé com todas as seções, as páginas legais e "[RAZÃO SOCIAL] · CNPJ [CNPJ]". O modelo da página fica num só lugar, `scripts/site/modelo.js`.

**O único JavaScript** é a busca da Ajuda (`ajuda/busca.js`, 65 linhas, do próprio site). Ela lê `ajuda/indice.json`, compara no navegador e não envia nada a ninguém. O campo de busca começa escondido e só aparece quando o índice carrega, então, sem JavaScript, não há campo morto e a lista completa continua na página. Os dados estruturados (`application/ld+json`) são dados, não script que executa.

## 2. Como gerar

```
node scripts/gerar-site.js                 grava o site em site/
node scripts/gerar-site.js --final         só grava se estiver pronto para publicar; senão sai com código 1 e lista o que falta
node scripts/gerar-site.js --pdf pacote.pdf  também gera o "Pacote para revisão jurídica" (PDF A4)
node scripts/gerar-og-site.js              refaz a imagem de compartilhamento (precisa do Chromium do Playwright)
```

`--final` recusa: marcador de dado sem valor, `[A DEFINIR`, `[PROPOSTA`, a frase de rascunho, texto de proposta, travessão, a expressão proibida pela orientação do projeto, título fora de ordem e link interno quebrado. Com os dados atuais (todos os campos de `site/dados-da-empresa.json` vazios e os textos jurídicos ainda em rascunho), ele falha, e é o que se espera até a revisão do advogado.

**Marcadores.** `site/dados-da-empresa.json` é a entrada: `RAZÃO SOCIAL`, `CNPJ`, `ENDEREÇO`, `E-MAIL DE PRIVACIDADE`, `E-MAIL DE SUPORTE`, `E-MAIL DE CONTATO` (novo, usado em Sobre, Para empresas e Como escrevemos), `DOMÍNIO` e `DATA DE VIGÊNCIA`. Valor vazio mantém o marcador destacado e a faixa de versão preliminar. **Com o domínio preenchido**, o site passa a ter `sitemap.xml`, `<link rel="canonical">`, `og:url` e `og:image` com endereço completo e o feed com links completos; sem domínio, nada disso existe. `robots.txt` pede para não indexar nada enquanto houver marcador pendente.

### Como o TypeScript do core roda no Node, sem pacote novo

Aprender e a Ajuda leem o catálogo e o guia do `packages/core`, que são TypeScript. O Node 22 não resolve `import './math'` sem extensão, então `scripts/site/catalogo.js` registra, só durante o carregamento, um gancho para `.ts` que transpila cada arquivo na hora com o `typescript` que já está instalado (é dependência do core), sem checar tipos (isso é o `npm run typecheck`). O carregamento leva 1 a 3 segundos e fica guardado em memória. O teste confere que esse caminho e o do `vitest` leem o mesmo catálogo. Se o `typescript` faltar, o gerador diz para rodar `npm install`.

### Capturas de tela

As capturas vêm da **demonstração** (dados fictícios): sete de `docs/lojas/capturas/apple-iphone-6-3pol-1206x2622/` e sete de `docs/telas/`. A lista, com o texto alternativo de cada uma, está em `scripts/site/imagens.js`. O gerador lê o original, reduz por média de área para 480 px (o painel da empresa, 960 px), reduz para até 256 cores sem pontilhado (as telas do app têm poucas cores de verdade) e grava PNG em `site/imagens/`. Cada imagem declara largura e altura na página. Resultado: 14 imagens com 28 a 95 KB cada (0,66 MB no total) e o site inteiro, com as 55 páginas, as fontes e o feed, com 1,58 MB. Uma cópia de cada resultado fica no cache `clarevo-site-imagens` da pasta temporária do sistema, e o teste compara os pixels, não os bytes, porque o zlib de cada versão do Node pode gerar bytes diferentes para o mesmo desenho.

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

- **Data**: a do nome do arquivo e a do cabeçalho precisam ser a mesma, e a data é a de publicação.
- **Fontes**: pelo menos uma. `tema: slug` traz sozinhas as fontes do tema do catálogo de Aprender; `Rótulo | página.html` liga a outra página do site (o caminho parte da raiz do site); `Rótulo | https://...` liga uma fonte externa (só `https`; e a política de segurança do site só aceita links de texto).
- **Texto do catálogo sem copiar**: uma linha sozinha, como `{{tema:decimo-terceiro:short}}`, é trocada pelo texto do catálogo (`titulo`, `subtitulo`, `short`, `p1` a `p5`, `exemplo` e `hipoteses`). Assim a mesma frase nunca existe em dois lugares, e o texto do post acompanha a revisão do tema.
- **Só fato que já existe**: sem notícia externa nova, sem preço, sem número de uso, sem depoimento, sem recomendar produto financeiro.
- **Correção**: se um erro for achado, corrija no próprio texto e registre a correção nele (uma seção "Correção", com a data e o que mudou). Não apague o erro em silêncio.

O gerador recusa o post sem título, data, resumo, autoria ou fontes, com data diferente da do nome e com `tema:` ou `{{tema:...}}` que não existe no catálogo. O índice, o feed (`novidades/feed.xml`) e o sitemap se atualizam sozinhos.

## 4. Regras editoriais

Estão publicadas em `novidades/como-escrevemos.html` (texto em `site-src/paginas/como-escrevemos.md`): toda informação com fonte oficial ou identificada; data de publicação e de revisão; fontes de mercado marcadas; exemplos com hipóteses e contas conferidas por teste; nenhuma recomendação de produto financeiro; nenhuma publicidade; correção no próprio texto; português do Brasil, linguagem neutra de gênero, frases curtas.

Valem também as regras do projeto (`CLAUDE.md`): sem travessão e sem a expressão proibida (o teste confere todo texto gerado), conteúdo financeiro só do catálogo (com fonte), nenhuma marca das lojas além de "App Store" e "Google Play" em texto, sem selos, sem preço e sem número de uso. O catálogo de Aprender é revisado como descreve `docs/09`: quando um tema mudar lá, o site muda junto na próxima geração.

## 5. Criar o projeto `clarevo-site` e apontar o domínio

O passo a passo completo e as condições para publicar estão em `docs/07`, seção "Site público". Em resumo, depois da revisão do advogado:

1. Cloudflare, **Workers e Pages**, **Pages**, **Conectar ao Git**, repositório do Clarevo.
2. Nome `clarevo-site`, branch `main`, framework **None**, **sem comando de build**, pasta de saída **`site`**, sem variáveis.
3. Deixe **desligados** o Web Analytics, o Email Address Obfuscation e o Rocket Loader: os três injetam script, a política de segurança (`_headers`) só aceita arquivos do próprio site, e medir acessos contradiz a política de privacidade.
4. Abra o endereço e confira as páginas no celular e no computador, claro e escuro, que o console não mostra bloqueio da política de segurança, que a busca da Ajuda acha "senha" e que a Cloudflare não define cookie (o painel de rede do navegador não deve mostrar `Set-Cookie`).
5. **Domínio** (P-006): preencher `DOMÍNIO` em `site/dados-da-empresa.json` (só o endereço, sem `https://`), gerar de novo, e em **Domínios personalizados** de `clarevo-site` apontar o **domínio raiz**. O app web iria para `app.` do domínio (em `clarevo`), **a confirmar**: nesse caso troque `URL_APP` em `scripts/site/config.js`, atualize o Site URL e as Redirect URLs do Supabase e `EXPO_PUBLIC_SITE_URL`, e as URLs das lojas (`docs/07` e `docs/16`).
6. Com o domínio ligado, confira o **Email Address Obfuscation** na zona e considere o HSTS (a linha vai no bloco `/*` de `CABECALHOS` em `scripts/site/gerar.js`, e o `site/_headers` se gera, não se edita).

A Cloudflare serve `privacidade.html` em `/privacidade`, `app/index.html` em `/app/` e assim por diante; as páginas se ligam por caminhos relativos com `.html`, que funcionam também abertas direto do disco.

## 6. O que fica para depois

- Calculadoras na web (hoje os temas só dizem em qual calculadora do app fazer a conta com os seus números).
- Newsletter, só com consentimento e depois de decidir o provedor de e-mail (P-008).
- Formulário de contato (hoje o contato é por e-mail, e o site não tem formulário nem coleta nada).
- Análise de acesso sem cookies (hoje não há análise nenhuma, e qualquer uma precisa entrar na política de privacidade antes).
- Kit de imprensa (logotipo, ícone, capturas e a descrição curta, com os termos de uso da marca).
- Páginas de loja ligadas aos selos oficiais, quando o app estiver publicado.
- Versão em inglês, busca dentro de Aprender e o card "Neste mês" na página inicial (hoje a Agenda mostra o ano todo, porque o site é gerado e não depende da data).
- Gerar o site no próprio build da Cloudflare (`node scripts/gerar-site.js --final` como comando de build), o que faria o `--final` ser a trava de publicação. Hoje a pasta `site/` é commitada pronta, para o projeto continuar sem comando de build.

## 7. Decisões e pendências deste ciclo (a registrar em `docs/00`)

Decisões da Claude, revisáveis por Enzo:

1. Estrutura do gerador em módulos (`scripts/site/*.js`), conteúdo próprio em `site-src/` e `node scripts/gerar-site.js` como único comando.
2. Aprender com uma página por tema publicado das seções `organizar`, `juros` e `tempo`; "Usar o Clarevo" e "Dúvidas frequentes" vão para a Ajuda, e o tema em rascunho (`apagar-dados`) fica de fora, como no app.
3. A página de um tema não mostra o campo "onde na fonte" (`locator`) das fontes, como o app também não mostra, porque ele guarda anotações de método (por exemplo, "trecho de resultado de busca; a página não abriu"). Mostra o nome da fonte com link, a data de consulta e a numeração que os "fatos" citam.
4. As fontes do tipo "decisões do projeto" (`D-021`) aparecem como "Clarevo: D-021, ... Decisões do projeto Clarevo, sem link", como no app.
5. A Ajuda tem sete temas, e cada resposta do guia de uso, do catálogo e do suporte fica em um só tema; uma função nova do app sem tema faz o gerador falhar com a lista.
6. O novo marcador `[E-MAIL DE CONTATO]` (Sobre, piloto de empresas e correções), a ser trocado junto com os outros quando houver e-mail próprio.
7. A busca da Ajuda usa JavaScript do próprio site, e a política de segurança do `_headers` ganhou `script-src 'self'` e `connect-src 'self'`.
8. Sem domínio, não há `canonical`, `og:url`, `og:image` nem sitemap, e o feed usa endereços relativos.

Pendências:

- **Política de privacidade** (`docs/legal`): a seção 2 diz "[A DEFINIR: confirmar que o site não tem formulário nem rastreador]". O site tem agora um campo de busca (sem `<form>`, sem envio, só leitura de um arquivo do próprio site) e dados estruturados, e continua sem cookies, análise e recurso de terceiros. Vale o advogado ler esta seção com o site novo.
- A página Segurança e privacidade repete fatos da política (o que guardamos, o que não guardamos, quem vê). Quando a política mudar, atualize `scripts/site/paginas/seguranca.js` junto (a lista de mudanças de `docs/legal/LEIAME.md` vale também para ela).
- Os dois e-mails e o domínio ainda não existem (P-006, P-008, P-023): os marcadores ficam visíveis e o `--final` falha até lá.
- Nada disso foi publicado.
