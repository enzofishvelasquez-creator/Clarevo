# Ficha das lojas (pt-BR)

19/10/2026 (Ciclo R, D-060 item 1), revista em 25/10/2026 (Ciclo Marca 2.2, D-068: bem-estar financeiro e "a Clarevo"), em 10/11/2026 (assinatura pelas lojas, D-090, e o Telegram com compra no cartão) em 25/11/2026 (D-125, estudo "Clarevo frente ao mercado": subtítulo com palavra de busca, primeiras linhas com a promessa, a privacidade e o preço, e a lista de recursos mais curta) em 26/11/2026 (D-127, plano anual: os preços por ano nas descrições e os quatro produtos nas notas para a revisão) e de novo em 26/11/2026 (D-128, revisão da D-126 pelo Enzo: a primeira linha das descrições e o começo do texto promocional passam a ser o benefício concreto, curto, "Contas, cartões e gastos do mês em ordem, com o pessoal, a família e o negócio separados.", o mesmo subtítulo da página inicial do site e das boas-vindas do app, cujo título voltou a ser a mensagem central) e em 27/11/2026 (a captura 6 trocada, com a lista das seis capturas na seção 1). Textos prontos para colar no App Store Connect (Apple) e no Google Play Console. Cada campo tem o limite da loja e a contagem feita por script (`npm test` confere os limites e os termos proibidos em `packages/core/test/lojas.test.ts`). Nada aqui depende de conta de desenvolvedor, e nenhum identificador, senha ou chave foi escrito: o que for da conta de Enzo aparece entre colchetes, como "[preencher]".

**Limites.** Apple, conferidos em 19/10/2026 em `developer.apple.com/help/app-store-connect/reference/app-information/app-information` e `.../platform-version-information`: nome 30 caracteres, subtítulo 30, texto promocional 170, descrição 4000, palavras-chave 100 **bytes** (letra acentuada vale 2), notas para a revisão 4000 bytes. Google Play: título 30, descrição curta 80 e descrição completa 4000 caracteres são os limites que a página de ajuda do Play Console costuma trazer, **a conferir**: a rede desta sessão não abriu `support.google.com`, e esses valores não foram lidos da fonte oficial.

**Regras de redação aplicadas** (CLAUDE.md e `docs/09`): português do Brasil, linguagem neutra de gênero, sem travessão longo, sem a expressão proibida de `docs/00`, sem prometer resultado financeiro, sem citar banco nem produto financeiro pelo nome, sem "segurança nível bancário" nem "100% seguro", sem prometer economia, dizendo que só entra no app o que a pessoa anota, importa ou manda por mensagem (o app não se conecta a contas bancárias, dito no fim, em IMPORTANTE) e que a empresa não vê os dados. A ficha descreve só o que já está no produto (README e `docs/04`). **Antes de publicar**, os textos que falam de exclusão de conta e de privacidade dependem de D-058 e de M-5 passarem pelo advogado (`docs/16`).

## Contagens conferidas

| Campo | Contagem | Limite |
|---|---|---|
| Nome (Apple e Google) | 7 caracteres | 30 |
| Nome, alternativa | 29 caracteres | 30 |
| Subtítulo (Apple) | 27 caracteres | 30 |
| Mensagem central (gráfico e imagem do site) | 54 caracteres | 60 |
| Frase de apoio (não vai à loja nem às imagens desde 26/11/2026) | 25 caracteres | 30 |
| Texto promocional (Apple) | 142 caracteres | 170 |
| Palavras-chave (Apple) | 97 bytes | 100 bytes |
| Descrição (Apple) | 3395 caracteres | 4000 |
| Descrição curta (Google) | 77 caracteres | 80 (a conferir) |
| Descrição completa (Google) | 3348 caracteres | 4000 (a conferir) |
| Notas da versão (Google) | 162 caracteres | 500 (a conferir) |
| Notas para a revisão (Apple) | 2069 bytes | 4000 bytes |

## 1. Nome, subtítulo e categoria

| Campo | Loja | Limite | Texto | Contagem |
|---|---|---|---|---|
| Nome | Apple e Google | 30 | Clarevo | 7 |
| Nome, alternativa se "Clarevo" já estiver em uso na Apple | Apple | 30 | Clarevo: controle de gastos | 27 |
| Subtítulo | Apple | 30 | Controle de gastos e contas | 27 |
| Mensagem central, de novo o título do site e das boas-vindas do app desde 26/11/2026 (D-128; não vai à loja) | Gráfico do Google Play e imagem do site | 60 | Cuidar da vida financeira faz parte de cuidar de você. | 54 |
| Frase de apoio (não vai à loja; desde 26/11/2026, D-129, também saiu das duas imagens, que levam o benefício concreto) | Descrições | 30 | Mais clareza para decidir | 25 |
| Categoria principal | Apple e Google | | Finanças | |
| Categoria secundária (opcional) | Apple | | Educação | |

**Benefício concreto na primeira linha (26/11/2026, D-128).** O título longo "Organize as contas, os cartões e os gastos do mês, ..." (D-126) saiu do começo das descrições e do texto promocional: a primeira linha é a frase curta do benefício, "Contas, cartões e gastos do mês em ordem, com o pessoal, a família e o negócio separados.", a mesma que vem logo abaixo do título no site e nas boas-vindas do app. O título do site e das boas-vindas voltou a ser a mensagem central, "Cuidar da vida financeira faz parte de cuidar de você.".

**As duas imagens (análise geral de 26/11/2026, D-129).** O gráfico de recursos do Google Play (`apps/app/assets/loja/grafico-recursos-1024x500.png`, `node scripts/gerar-grafico-loja.js`) e a imagem de compartilhamento do site (`site-src/imagens/og-clarevo-1200x630.png`, `node scripts/gerar-og-site.js`) foram refeitos: o logotipo, a mensagem central (campo `mensagem-central`, abaixo), o benefício concreto logo embaixo (o mesmo `BENEFICIO` de `scripts/site/paginas/inicio.js`, no lugar da frase de apoio e da linha "Contas a pagar, cartões, metas e Família"), a nota "Dados fictícios" e a tela Resumo sem o selo "Demonstração" (`resumo-sem-selo.png`, gravada por `node scripts/capturas-lojas.js --so-resumo-sem-selo` com a mesma marca das capturas das lojas, `apps/app/src/lib/capture.ts`). A frase de apoio continua nas descrições.

**As seis capturas das lojas (D-125; a 6 trocada em 27/11/2026).** Geradas por `node scripts/capturas-lojas.js` em `docs/lojas/capturas/<tamanho>/` (os três tamanhos e a ordem de envio estão em `docs/16`, seção 7), com a demonstração e dados fictícios: a frase no alto, a nota "Dados fictícios" e a tela do aparelho embaixo, sem o selo "Demonstração". O script recusa frase com mais de 52 caracteres, travessão, nome de marca, "grátis", ponto de exclamação ou o Plus. Ordem de envio, Apple e Google: 1 a 6.

| Nº | Arquivo | Frase | Tela |
|---|---|---|---|
| 1 | `loja-1-resumo.png` | Veja o que entrou, o que saiu e o que ainda vence | Resumo da demonstração |
| 2 | `loja-2-mensagem.png` | Anote um gasto com uma mensagem | O que dá para mandar por mensagem |
| 3 | `loja-3-contas.png` | Contas a pagar e faturas do cartão no mesmo lugar | Contas a pagar do mês |
| 4 | `loja-4-familia.png` | As contas da casa, anotadas em família | A Família "Casa Alves", vista por quem é titular |
| 5 | `loja-5-negocio.png` | O negócio separado das contas pessoais | Seu negócio, cenário "negocio" |
| 6 | `loja-6-privacidade.png` | Seus registros pessoais continuam só seus | O convite para a Família visto por quem é convidado: "Anota e vê. Você poderá ver e anotar." e "Aceitar não mostra nem copia o seu Pessoal. Você também não vê o Pessoal de ninguém da Família." |

**Captura 6 desde 27/11/2026 (análise geral de 26/11/2026).** Até então, a 6 era a tela "Quem vê estes dados?" com a frase "Seus registros pessoais são só seus": nove itens em letra pequena, ilegíveis no tamanho da loja. Nenhuma tela conta a privacidade inteira em letra grande; a que conta melhor, com pouco texto, é o convite para a Família de quem é convidado, que mostra as duas metades da história: na Família, o que a pessoa poderá fazer (o papel), e o Pessoal, que não aparece nem é copiado. A frase passou a "Seus registros pessoais continuam só seus" (41 caracteres), que liga a tela à captura 4. O fato de o app não se conectar a contas bancárias continua nas descrições (IMPORTANTE), não na captura. Nomes fictícios, os mesmos da captura 4.

**Promessa concreta (25/11/2026, D-125; revista em 26/11/2026, D-128 e D-129).** O estudo "Clarevo frente ao mercado" mostrou que "Bem-estar financeiro" não é termo de busca e não diz o que o app faz. O subtítulo da Apple junta a palavra de busca e o benefício ("Controle de gastos e contas"), a descrição curta do Google diz o que o app faz e o diferencial (pessoal, família e negócio separados), e as três primeiras linhas das descrições trazem a promessa (o benefício concreto), a privacidade ("Você decide o que entra") e o preço com o teste grátis. A frase "Cuidar da vida financeira faz parte de cuidar de você." é o título da página inicial do site e das boas-vindas do app (D-128, sem frase pequena acima dele), fica no fim das descrições e no rodapé do site, e "bem-estar financeiro" fica com a página Para empresas, que é o vocabulário que o RH compra. A lista de recursos passou de 15 itens para 10, mais curta, e cita o Espaço Negócio. O gráfico do Google Play e a imagem de compartilhamento do site têm a mensagem central como título e o benefício concreto embaixo (parágrafo acima).

**Posicionamento (25/10/2026, D-068; o subtítulo e a descrição curta mudaram em 25/11/2026, D-125, e as imagens em 26/11/2026, D-129, acima).** A Clarevo se apresenta como solução de bem-estar financeiro (Playbook e Manual v2.2), dita pela mensagem central, "Cuidar da vida financeira faz parte de cuidar de você.": o título do site e das boas-vindas do app e o título do gráfico de recursos do Google Play e da imagem de compartilhamento do site, que leem o campo `mensagem-central` deste arquivo. O que o app faz vem logo depois, em palavras concretas: o subtítulo da Apple e a descrição curta do Google falam de controle de gastos e contas, e a primeira linha das descrições e as duas imagens trazem o benefício concreto. "Mais clareza para decidir" (24/10/2026) continua como expressão de apoio nas descrições, sem substituir a explicação do que o app faz. A marca é tratada no feminino ("a Clarevo"); quando o texto fala do software como objeto, diz "o app da Clarevo". Os textos não prometem resultado financeiro nem de saúde mental, sono, produtividade ou tranquilidade, e dizem que a Clarevo não é atendimento de saúde (Playbook v2.2, "Bem-estar financeiro e saúde mental").

<!-- campo: apple-nome | limite: 30 | unidade: caracteres -->
```
Clarevo
```

<!-- campo: apple-nome-alternativo | limite: 30 | unidade: caracteres -->
```
Clarevo: controle de gastos
```

<!-- campo: apple-subtitulo | limite: 30 | unidade: caracteres -->
```
Controle de gastos e contas
```

<!-- campo: mensagem-central | limite: 60 | unidade: caracteres -->
```
Cuidar da vida financeira faz parte de cuidar de você.
```

<!-- campo: frase-de-apoio | limite: 30 | unidade: caracteres -->
```
Mais clareza para decidir
```

## 2. Texto promocional (Apple, até 170)

Pode ser trocado a qualquer momento, sem nova versão.

<!-- campo: apple-promocional | limite: 170 | unidade: caracteres -->
```
Contas, cartões e gastos do mês em ordem, com o pessoal, a família e o negócio separados. Você decide o que entra. 14 dias grátis, sem cartão.
```

## 3. Palavras-chave (Apple, até 100 bytes)

Separadas por vírgula, sem espaço depois da vírgula, sem repetir o nome do app e sem nome de outro app ou empresa. Desde 25/11/2026 (D-125), sem as palavras que já estão no subtítulo ("controle", "gastos", "contas"): a Apple junta as palavras do nome, do subtítulo e deste campo, e repetir só gasta espaço. Entraram "planilha" (de quem procura uma planilha de gastos) e "mei".

<!-- campo: apple-palavras-chave | limite: 100 | unidade: bytes -->
```
planilha,orçamento,despesas,cartão,fatura,mei,família,finanças pessoais,metas,dinheiro,boleto
```

## 4. Descrição (Apple, até 4000)

Texto simples, sem HTML. A mesma descrição serve de base para o Google (seção 6); só a seção ASSINATURA muda, porque a Apple não aceita citar outra loja nos textos dela (diretriz 2.3.10), e a assinatura automática pede, na descrição, o preço, a renovação, como cancelar e o link dos Termos de uso (diretriz 3.1.2). **Os dois links só entram na loja depois de as páginas estarem publicadas, sem a faixa de versão preliminar** (seção 8).

<!-- campo: apple-descricao | limite: 4000 | unidade: caracteres -->
```
Contas, cartões e gastos do mês em ordem, com o pessoal, a família e o negócio separados.
Você decide o que entra: só aparece o que você anota, importa ou manda por mensagem. Sem anúncios e sem venda de dados.
Individual por R$ 29,90 por mês ou R$ 269,90 por ano; Família por R$ 69,90 por mês ou R$ 629,90 por ano, até 6 pessoas. Toda conta começa com 14 dias grátis, sem pedir cartão.

Você anota o que recebe e o que paga, e o app mostra o que entrou, o que saiu e o que ainda vence, cada coisa separada da outra. Se sua empresa oferecer a Clarevo como benefício de bem-estar financeiro, ela vê o e-mail que convidou e a situação do convite ou da licença, com as datas: nunca vê seus gastos, seus valores nem o que você faz no app.

O QUE VOCÊ FAZ NA CLAREVO

• Resumo do mês: o que entrou, o que saiu e o que ainda falta pagar, com a explicação de cada número.
• Anotar em poucos toques ou pelo Telegram: mande "mercado 52,30" e o gasto entra no app na hora.
• Ler nota fiscal, comprovante de Pix, boleto, holerite e nota de serviço, em PDF, print ou foto. A leitura acontece no próprio aparelho, e nenhuma foto é guardada por ela.
• Importar extrato e fatura (PDF, OFX, CSV ou prints), conferindo linha por linha antes de gravar.
• Contas a pagar com lembretes, gastos fixos, parcelamentos e contas do ano, como IPVA e IPTU.
• Cartões de crédito com faturas e limite usado. O app guarda só o apelido e, se você quiser, os 4 últimos dígitos, nunca o número inteiro.
• Família: até 6 pessoas, com papéis, convite por link e o Pessoal de cada pessoa só dela.
• Espaço Negócio, para quem trabalha por conta ou é MEI: o dinheiro do negócio separado do da casa, com retirada para o Pessoal, valores a receber e o limite do MEI.
• Metas e reserva para imprevistos, análises do mês, Aprender e calculadoras feitas com os números que você digita.
• Ocultar valores, biometria, exportar em CSV ou PDF e excluir a conta dentro do app.

ASSINATURA

A Clarevo é paga por assinatura mensal ou anual, com dois planos e os mesmos recursos: Individual, por R$ 29,90 por mês ou R$ 269,90 por ano, e Família, por R$ 69,90 por mês ou R$ 629,90 por ano, para você e a sua Família na Clarevo, até 6 pessoas. Toda conta começa com 14 dias grátis, sem pedir cartão. A assinatura é feita pela App Store, com a forma de pagamento da sua conta Apple, e renova sozinha a cada mês ou a cada ano, conforme o período escolhido, pelo mesmo preço, até você cancelar nos ajustes de assinatura da conta Apple, pelo menos 24 horas antes da renovação. Sem assinatura depois do teste, a conta fica só para ver e exportar, com os seus dados guardados.

Termos de uso: https://clarevo.app.br/termos
Política de privacidade: https://clarevo.app.br/privacidade

SEUS DADOS

• Sem anúncios, sem venda de dados e sem rastreamento para publicidade.
• Conexão protegida (criptografia em trânsito).
• A exclusão da conta e dos dados é feita por você, em Conta.

IMPORTANTE

A Clarevo é uma ferramenta de organização e de educação financeira. Não é banco, não se conecta a contas bancárias, não movimenta dinheiro, não oferece crédito e não indica produtos financeiros. Não é atendimento de saúde, não substitui acompanhamento de profissionais e não promete resultado financeiro nem de saúde. As simulações são exemplos feitos com os números que você digita e não garantem resultado.

Cuidar da vida financeira faz parte de cuidar de você.
```

## 5. Google Play: descrição curta (até 80)

<!-- campo: google-descricao-curta | limite: 80 | unidade: caracteres -->
```
Controle de gastos e contas do mês, com pessoal, família e negócio separados.
```

**Gráfico de recursos (Google Play, 1024 x 500): feito** (D-064). `apps/app/assets/loja/grafico-recursos-1024x500.png`, gerado por `node scripts/gerar-grafico-loja.js` com o logotipo oficial, a mensagem central e a frase de apoio desta ficha (campos `mensagem-central` e `frase-de-apoio`) e a tela Resumo da demonstração (`docs/16`, seção 6). Não leva preço, ranking, "melhor", "grátis" nem selos das lojas.

## 6. Google Play: descrição completa (até 4000)

<!-- campo: google-descricao-completa | limite: 4000 | unidade: caracteres -->
```
Contas, cartões e gastos do mês em ordem, com o pessoal, a família e o negócio separados.
Você decide o que entra: só aparece o que você anota, importa ou manda por mensagem. Sem anúncios e sem venda de dados.
Individual por R$ 29,90 por mês ou R$ 269,90 por ano; Família por R$ 69,90 por mês ou R$ 629,90 por ano, até 6 pessoas. Toda conta começa com 14 dias grátis, sem pedir cartão.

Você anota o que recebe e o que paga, e o app mostra o que entrou, o que saiu e o que ainda vence, cada coisa separada da outra. Se sua empresa oferecer a Clarevo como benefício de bem-estar financeiro, ela vê o e-mail que convidou e a situação do convite ou da licença, com as datas: nunca vê seus gastos, seus valores nem o que você faz no app.

O QUE VOCÊ FAZ NA CLAREVO

• Resumo do mês: o que entrou, o que saiu e o que ainda falta pagar, com a explicação de cada número.
• Anotar em poucos toques ou pelo Telegram: mande "mercado 52,30" e o gasto entra no app na hora.
• Ler nota fiscal, comprovante de Pix, boleto, holerite e nota de serviço, em PDF, print ou foto. A leitura acontece no próprio aparelho, e nenhuma foto é guardada por ela.
• Importar extrato e fatura (PDF, OFX, CSV ou prints), conferindo linha por linha antes de gravar.
• Contas a pagar com lembretes, gastos fixos, parcelamentos e contas do ano, como IPVA e IPTU.
• Cartões de crédito com faturas e limite usado. O app guarda só o apelido e, se você quiser, os 4 últimos dígitos, nunca o número inteiro.
• Família: até 6 pessoas, com papéis, convite por link e o Pessoal de cada pessoa só dela.
• Espaço Negócio, para quem trabalha por conta ou é MEI: o dinheiro do negócio separado do da casa, com retirada para o Pessoal, valores a receber e o limite do MEI.
• Metas e reserva para imprevistos, análises do mês, Aprender e calculadoras feitas com os números que você digita.
• Ocultar valores, biometria, exportar em CSV ou PDF e excluir a conta dentro do app.

ASSINATURA

A Clarevo é paga por assinatura mensal ou anual, com dois planos e os mesmos recursos: Individual, por R$ 29,90 por mês ou R$ 269,90 por ano, e Família, por R$ 69,90 por mês ou R$ 629,90 por ano, para você e a sua Família na Clarevo, até 6 pessoas. Toda conta começa com 14 dias grátis, sem pedir cartão. A assinatura é feita pelo Google Play, com a forma de pagamento da sua conta Google, e renova sozinha a cada mês ou a cada ano, conforme o período escolhido, pelo mesmo preço, até você cancelar nas assinaturas do Google Play. Sem assinatura depois do teste, a conta fica só para ver e exportar, com os seus dados guardados.

Termos de uso: https://clarevo.app.br/termos
Política de privacidade: https://clarevo.app.br/privacidade

SEUS DADOS

• Sem anúncios, sem venda de dados e sem rastreamento para publicidade.
• Conexão protegida (criptografia em trânsito).
• A exclusão da conta e dos dados é feita por você, em Conta.

IMPORTANTE

A Clarevo é uma ferramenta de organização e de educação financeira. Não é banco, não se conecta a contas bancárias, não movimenta dinheiro, não oferece crédito e não indica produtos financeiros. Não é atendimento de saúde, não substitui acompanhamento de profissionais e não promete resultado financeiro nem de saúde. As simulações são exemplos feitos com os números que você digita e não garantem resultado.

Cuidar da vida financeira faz parte de cuidar de você.
```

## 7. Notas da versão 1.0.0

A Apple não mostra "O que há de novo" na primeira versão. No Google Play, o campo aceita poucos caracteres (o limite costuma ser 500, **a conferir**).

<!-- campo: google-notas-da-versao | limite: 500 | unidade: caracteres -->
```
Primeira versão da Clarevo: resumo do mês, contas a pagar, cartões, leitura de notas, comprovantes e boletos, Telegram, metas, Aprender, Família e Espaço Negócio.
```

## 8. Contato, links e direitos (campos para Enzo)

Estes campos não podem ser inventados. As quatro URLs abaixo são as do site público do projeto `clarevo-site` (D-064, `docs/07`, seção "Site público"); com o domínio (P-006), troque o começo pelo domínio. **Só preencha uma URL na loja depois de a página estar publicada**, sem a faixa "Versão preliminar, em revisão" e com `node scripts/gerar-site.js --final` passando, o que depende da revisão do advogado. O e-mail de suporte e os dados da empresa dependem do domínio e do e-mail próprio (P-006 e P-023); enquanto isso ficam vazios, e a submissão não passa sem eles.

| Campo | Loja | O que a loja exige | Valor |
|---|---|---|---|
| E-mail de suporte | Apple (contato da revisão e suporte) e Google (contato do desenvolvedor) | Caixa lida por uma pessoa de verdade | contato@clarevo.app.br (decidido em 03/11/2026; a caixa precisa estar sendo lida) |
| URL de suporte | Apple | Página que leve a contato real (a Apple pede endereço legal, e-mail ou telefone) | `https://clarevo.app.br/suporte` |
| URL da política de privacidade | Apple e Google | Página pública, aberta sem login; também precisa de um acesso dentro do app (App Review Guidelines 5.1.1(i)) | `https://clarevo.app.br/privacidade` (depois da revisão do advogado) |
| URL dos termos de uso | Apple e Google (se pedirem) | Página pública, aberta sem login | `https://clarevo.app.br/termos` (depois da revisão do advogado) |
| URL de exclusão da conta e dos dados | Google | Página que explique como pedir a exclusão (o app já exclui pela tela Conta, D-058; a página existe no site, ainda não publicada) | `https://clarevo.app.br/excluir-conta` |
| URL de marketing (opcional) | Apple | Site do produto | `https://clarevo.app.br/` |
| Direitos autorais | Apple | "2026 Nome legal de quem é dona ou dono do app" | 2026 CLAREVO INOVA SIMPLES (I.S.) |
| Nome do desenvolvedor exibido | Apple (nome legal da organização) e Google | Nome que aparece como vendedora ou vendedor | CLAREVO INOVA SIMPLES (I.S.), CNPJ 69.771.864/0001-03 (decidido em 03/11/2026: a razão social; na Apple, é o nome da organização que aparece como vendedora) |

## 9. Classificação etária (respostas do questionário)

Resultado esperado: **4+** na Apple e a menor faixa na classificação do Google para o Brasil. Os textos exatos das perguntas mudam; confira a pergunta no momento de responder. A Clarevo não tem conteúdo sensível: as respostas são "não" ou "nenhum" em todos os itens abaixo.

**Apple** (questionário de classificação do App Store Connect, valores de iOS 26 em diante, conferido em `.../reference/app-information/age-ratings-values-and-definitions` em 19/10/2026):

| Pergunta | Resposta | Por quê |
|---|---|---|
| Controles dos pais; verificação de idade | Não | O app não tem |
| Acesso irrestrito à web | Não | Não há navegador dentro do app; as fontes de Aprender abrem no navegador do aparelho |
| Conteúdo gerado por pessoas (divulgação ampla) | Não | O que se anota fica na conta da pessoa ou na Família que ela escolheu, sem divulgação |
| Mensagens e bate-papo | Não | A Família compartilha anotações, não mensagens |
| Anúncios | Não | O app não tem anúncios |
| Palavrões, terror, álcool, tabaco ou drogas | Nenhum | |
| Informação médica ou de saúde e bem-estar | Nenhum | |
| Conteúdo sexual ou nudez; temas adultos ou sugestivos | Nenhum | |
| Violência de qualquer tipo; armas | Nenhum | |
| Apostas, apostas simuladas, concursos, caixas de recompensa | Não ou nenhum | |
| Categoria "Feito para crianças" | Não se aplica | |
| **Substituir por uma classificação mais alta** | **Sim, 18+** (decidido em 03/11/2026: os termos e a política dizem 18 anos ou mais) | P-002 recomenda 18+ no lançamento. Se os termos de uso exigirem 18 anos, a Apple exige substituir a classificação calculada por 18+ (`.../manage-app-information/set-an-app-age-rating`) |

**Google Play** (questionário de classificação por faixa etária, IARC, em Conteúdo do app; **a conferir** na hora, a rede não abriu a página oficial):

| Pergunta (resumo) | Resposta |
|---|---|
| Categoria do app | Utilitário, produtividade ou outro (não é jogo, rede social nem notícia) |
| Violência, conteúdo sexual, linguagem imprópria, drogas, apostas | Não |
| As pessoas interagem ou trocam conteúdo entre si? | Só dentro da Família (convite por link, sem mensagens, sem conteúdo público). Responder conforme a pergunta aceitar: se pedir "compartilha informações do usuário com outras pessoas", responder sim e descrever a Família |
| Compartilha a localização? | Não |
| Permite compras de bens digitais? | Sim: a assinatura mensal ou anual, pelo Google Play (D-083, D-090, D-127) |
| Acesso irrestrito à internet? | Não |

## 10. Informações para a revisão

**Apple, "Notas" (até 4000 bytes) e conta de teste.** Modelo; a conta e a senha ficam no campo próprio do App Store Connect, nunca no repositório (`docs/16`, seção 5).

<!-- campo: apple-notas-da-revisao | limite: 4000 | unidade: bytes -->
```
A Clarevo é um app de organização financeira: organiza o dinheiro do mês (gastos, recebimentos, contas a pagar, cartões, metas), com espaços separados para o Pessoal, a Família e o negócio de quem trabalha por conta, e traz explicações de educação financeira. Não se conecta a contas bancárias e não movimenta dinheiro.

Assinatura: a Clarevo é paga por assinatura mensal ou anual, com compra dentro do app (quatro produtos de assinatura automática no mesmo grupo: clarevo_individual_mensal, R$ 29,90 por mês; clarevo_familia_mensal, R$ 69,90 por mês; clarevo_individual_anual, R$ 269,90 por ano; e clarevo_familia_anual, R$ 629,90 por ano). O anual tem os mesmos recursos do mensal; muda só o período da cobrança. Toda conta nova tem 14 dias de acesso completo grátis, dados pela própria conta, sem compra; depois, sem assinatura, a conta fica só para ver e exportar. Para ver e testar a compra: Conta, Assinatura, escolha "Mensal" ou "Anual" no alto dos planos (o mensal vem marcado) e toque em "Assinar o plano Individual mensal" (ou anual) ou "Assinar o plano Família mensal" (ou anual). "Restaurar compras" fica na mesma tela.

Para entrar, use a conta de teste informada nos campos de acesso. Todos os dados dessa conta são fictícios e estão identificados como exemplo.

Permissões: a câmera é usada só para ler o QR Code da nota fiscal ou o código do boleto e para fotografar um documento que a pessoa quer ler (nenhuma foto é guardada); as fotos, só a imagem que a pessoa escolhe para ler ou para uma meta; o Face ID é opcional e só desbloqueia o app (Conta, "Pedir biometria ao abrir"); as notificações são lembretes locais, ligados pela pessoa em Conta.

Exclusão da conta: Conta, último item, "Excluir minha conta" (exige digitar EXCLUIR). Com assinatura pela App Store, a tela avisa que a assinatura se cancela nos ajustes da conta Apple.

Uma empresa pode oferecer a Clarevo como benefício. Ela vê os e-mails que convidou, a situação das licenças e as datas, e nunca vê gastos nem valores. O painel das empresas existe só na web.
```

**Google Play, "Acesso ao app".** Informar que o app exige login, e preencher as instruções de acesso com a conta de teste (nome de usuário e senha nos campos do Play Console, nunca no repositório). Texto das instruções: "Entre com o e-mail e a senha da conta de teste. Todos os dados são fictícios. A exclusão da conta fica em Conta, último item."
