# Ficha das lojas (pt-BR)

19/10/2026 (Ciclo R, D-060 item 1). Textos prontos para colar no App Store Connect (Apple) e no Google Play Console. Cada campo tem o limite da loja e a contagem feita por script (`npm test` confere os limites e os termos proibidos em `packages/core/test/lojas.test.ts`). Nada aqui depende de conta de desenvolvedor, e nenhum identificador, senha ou chave foi escrito: o que for da conta de Enzo aparece entre colchetes, como "[preencher]".

**Limites.** Apple, conferidos em 19/10/2026 em `developer.apple.com/help/app-store-connect/reference/app-information/app-information` e `.../platform-version-information`: nome 30 caracteres, subtítulo 30, texto promocional 170, descrição 4000, palavras-chave 100 **bytes** (letra acentuada vale 2), notas para a revisão 4000 bytes. Google Play: título 30, descrição curta 80 e descrição completa 4000 caracteres são os limites que a página de ajuda do Play Console costuma trazer, **a conferir**: a rede desta sessão não abriu `support.google.com`, e esses valores não foram lidos da fonte oficial.

**Regras de redação aplicadas** (CLAUDE.md e `docs/09`): português do Brasil, linguagem neutra de gênero, sem travessão longo, sem a expressão proibida de `docs/00`, sem prometer resultado financeiro, sem citar banco nem produto financeiro pelo nome, deixando claro que o app não se conecta a contas bancárias e que a empresa não vê os dados. A ficha descreve só o que já está no produto (README e `docs/04`). **Antes de publicar**, os textos que falam de exclusão de conta e de privacidade dependem de D-058 e de M-5 passarem pelo advogado (`docs/16`).

## Contagens conferidas

| Campo | Contagem | Limite |
|---|---|---|
| Nome (Apple e Google) | 7 caracteres | 30 |
| Nome, alternativa | 26 caracteres | 30 |
| Subtítulo (Apple) | 26 caracteres | 30 |
| Texto promocional (Apple) | 167 caracteres | 170 |
| Palavras-chave (Apple) | 98 bytes | 100 bytes |
| Descrição (Apple) | 2692 caracteres | 4000 |
| Descrição curta (Google) | 76 caracteres | 80 (a conferir) |
| Descrição completa (Google) | 2692 caracteres | 4000 (a conferir) |
| Notas da versão (Google) | 94 caracteres | 500 (a conferir) |
| Notas para a revisão (Apple) | 940 bytes | 4000 bytes |

## 1. Nome, subtítulo e categoria

| Campo | Loja | Limite | Texto | Contagem |
|---|---|---|---|---|
| Nome | Apple e Google | 30 | Clarevo | 7 |
| Nome, alternativa se "Clarevo" já estiver em uso na Apple | Apple | 30 | Clarevo: finanças pessoais | 26 |
| Subtítulo | Apple | 30 | Organize seu mês e aprenda | 26 |
| Categoria principal | Apple e Google | | Finanças | |
| Categoria secundária (opcional) | Apple | | Educação | |

<!-- campo: apple-nome | limite: 30 | unidade: caracteres -->
```
Clarevo
```

<!-- campo: apple-nome-alternativo | limite: 30 | unidade: caracteres -->
```
Clarevo: finanças pessoais
```

<!-- campo: apple-subtitulo | limite: 30 | unidade: caracteres -->
```
Organize seu mês e aprenda
```

## 2. Texto promocional (Apple, até 170)

Pode ser trocado a qualquer momento, sem nova versão.

<!-- campo: apple-promocional | limite: 170 | unidade: caracteres -->
```
Anote gastos e recebimentos, acompanhe contas a pagar e cartões e aprenda o essencial. O Clarevo não se conecta a contas bancárias, e sua empresa não vê suas finanças.
```

## 3. Palavras-chave (Apple, até 100 bytes)

Separadas por vírgula, sem espaço depois da vírgula, sem repetir o nome do app e sem nome de outro app ou empresa.

<!-- campo: apple-palavras-chave | limite: 100 | unidade: bytes -->
```
gastos,orçamento,contas a pagar,despesas,cartão,fatura,metas,reserva,família,finanças pessoais
```

## 4. Descrição (Apple, até 4000)

Texto simples, sem HTML. A mesma descrição serve de base para o Google (seção 6).

<!-- campo: apple-descricao | limite: 4000 | unidade: caracteres -->
```
O Clarevo ajuda você e sua família a organizar o dinheiro do mês e a entender melhor as próprias contas. Você anota o que recebe e o que paga, e o app mostra quanto entrou, quanto saiu e quanto ainda vai vencer, cada coisa separada da outra.

O Clarevo não se conecta a contas bancárias. Tudo o que aparece no app foi anotado ou importado por você, e é você quem decide o que registrar. Se sua empresa oferecer o Clarevo como benefício, ela vê o e-mail que convidou e a situação do convite ou da licença, com as datas: nunca vê seus gastos, seus valores nem o que você faz no app.

O QUE VOCÊ FAZ NO CLAREVO

• Resumo do mês: Recebido, Pago, a diferença entre os dois e o que ainda falta pagar, com a explicação de cada número.
• Anotar gasto e registrar recebimento em poucos toques, com rascunho preservado e aviso antes de descartar.
• Contas a pagar: vencimentos, lembretes no aparelho e o gasto só entra em Pago quando você marca a conta como paga.
• Gastos fixos, parcelamentos e contas do ano (como IPVA e IPTU), que aparecem sozinhos nos meses certos.
• Cartões de crédito: compras à vista e parceladas, faturas e limite usado. O app guarda só o apelido e, se você quiser, os 4 últimos dígitos, nunca o número inteiro.
• Leitura de nota fiscal pelo QR Code ou por PDF, e de comprovantes em PDF. A câmera só lê o código: nenhuma foto é guardada.
• Importar arquivos de extrato e de fatura (OFX ou CSV), conferindo linha por linha antes de gravar.
• Evolução e Análises: Recebido e Pago mês a mês, média e mediana, categorias em barras ou em bolhas e orçamento por categoria.
• Metas e reserva para imprevistos, com um plano de guardar que mostra as etapas e o mês previsto, sem contar rendimento.
• Simulador e calculadoras (parcelado ou à vista, quanto custa por ano, juros e multa, entre outras), feitos com os números que você digita.
• Família: até 6 pessoas, com os papéis de titular, membro e leitor, convite por link e a opção de sair ou encerrar quando quiser.
• Aprender: explicações curtas sobre juros, taxas e contas do dia a dia, cada uma com fonte e data de revisão.
• Ocultar valores na tela e pedir biometria para abrir o app.
• Exportar seus gastos e recebimentos em CSV ou PDF e excluir a conta dentro do app.

SEUS DADOS

• Sem anúncios, sem venda de dados e sem rastreamento para publicidade.
• Conexão protegida (criptografia em trânsito).
• A exclusão da conta e dos dados é feita por você, em Conta.

IMPORTANTE

O Clarevo é uma ferramenta de organização e de educação financeira. Não é banco, não movimenta dinheiro, não oferece crédito e não indica produtos financeiros. As simulações são exemplos feitos com os números que você digita e não garantem resultado.
```

## 5. Google Play: descrição curta (até 80)

<!-- campo: google-descricao-curta | limite: 80 | unidade: caracteres -->
```
Anote gastos, veja contas e cartões e aprenda. Sem ligar a contas bancárias.
```

**Gráfico de recursos (Google Play, 1024 x 500): feito** (D-064). `apps/app/assets/loja/grafico-recursos-1024x500.png`, gerado por `node scripts/gerar-grafico-loja.js` com o logotipo oficial, o subtítulo desta ficha e a tela Resumo da demonstração (`docs/16`, seção 6). Não leva preço, ranking, "melhor", "grátis" nem selos das lojas.

## 6. Google Play: descrição completa (até 4000)

<!-- campo: google-descricao-completa | limite: 4000 | unidade: caracteres -->
```
O Clarevo ajuda você e sua família a organizar o dinheiro do mês e a entender melhor as próprias contas. Você anota o que recebe e o que paga, e o app mostra quanto entrou, quanto saiu e quanto ainda vai vencer, cada coisa separada da outra.

O Clarevo não se conecta a contas bancárias. Tudo o que aparece no app foi anotado ou importado por você, e é você quem decide o que registrar. Se sua empresa oferecer o Clarevo como benefício, ela vê o e-mail que convidou e a situação do convite ou da licença, com as datas: nunca vê seus gastos, seus valores nem o que você faz no app.

O QUE VOCÊ FAZ NO CLAREVO

• Resumo do mês: Recebido, Pago, a diferença entre os dois e o que ainda falta pagar, com a explicação de cada número.
• Anotar gasto e registrar recebimento em poucos toques, com rascunho preservado e aviso antes de descartar.
• Contas a pagar: vencimentos, lembretes no aparelho e o gasto só entra em Pago quando você marca a conta como paga.
• Gastos fixos, parcelamentos e contas do ano (como IPVA e IPTU), que aparecem sozinhos nos meses certos.
• Cartões de crédito: compras à vista e parceladas, faturas e limite usado. O app guarda só o apelido e, se você quiser, os 4 últimos dígitos, nunca o número inteiro.
• Leitura de nota fiscal pelo QR Code ou por PDF, e de comprovantes em PDF. A câmera só lê o código: nenhuma foto é guardada.
• Importar arquivos de extrato e de fatura (OFX ou CSV), conferindo linha por linha antes de gravar.
• Evolução e Análises: Recebido e Pago mês a mês, média e mediana, categorias em barras ou em bolhas e orçamento por categoria.
• Metas e reserva para imprevistos, com um plano de guardar que mostra as etapas e o mês previsto, sem contar rendimento.
• Simulador e calculadoras (parcelado ou à vista, quanto custa por ano, juros e multa, entre outras), feitos com os números que você digita.
• Família: até 6 pessoas, com os papéis de titular, membro e leitor, convite por link e a opção de sair ou encerrar quando quiser.
• Aprender: explicações curtas sobre juros, taxas e contas do dia a dia, cada uma com fonte e data de revisão.
• Ocultar valores na tela e pedir biometria para abrir o app.
• Exportar seus gastos e recebimentos em CSV ou PDF e excluir a conta dentro do app.

SEUS DADOS

• Sem anúncios, sem venda de dados e sem rastreamento para publicidade.
• Conexão protegida (criptografia em trânsito).
• A exclusão da conta e dos dados é feita por você, em Conta.

IMPORTANTE

O Clarevo é uma ferramenta de organização e de educação financeira. Não é banco, não movimenta dinheiro, não oferece crédito e não indica produtos financeiros. As simulações são exemplos feitos com os números que você digita e não garantem resultado.
```

## 7. Notas da versão 1.0.0

A Apple não mostra "O que há de novo" na primeira versão. No Google Play, o campo aceita poucos caracteres (o limite costuma ser 500, **a conferir**).

<!-- campo: google-notas-da-versao | limite: 500 | unidade: caracteres -->
```
Primeira versão do Clarevo: resumo do mês, contas a pagar, cartões, metas, Aprender e Família.
```

## 8. Contato, links e direitos (campos para Enzo)

Estes campos não podem ser inventados. As quatro URLs abaixo são as do site público do projeto `clarevo-site` (D-064, `docs/07`, seção "Site público"); com o domínio (P-006), troque o começo pelo domínio. **Só preencha uma URL na loja depois de a página estar publicada**, sem a faixa "Versão preliminar, em revisão" e com `node scripts/gerar-site.js --final` passando, o que depende da revisão do advogado. O e-mail de suporte e os dados da empresa dependem do domínio e do e-mail próprio (P-006 e P-023); enquanto isso ficam vazios, e a submissão não passa sem eles.

| Campo | Loja | O que a loja exige | Valor |
|---|---|---|---|
| E-mail de suporte | Apple (contato da revisão e suporte) e Google (contato do desenvolvedor) | Caixa lida por uma pessoa de verdade | [preencher: e-mail de suporte] |
| URL de suporte | Apple | Página que leve a contato real (a Apple pede endereço legal, e-mail ou telefone) | `https://clarevo-site.pages.dev/suporte` (a conferir o endereço que a Cloudflare der) ou `https://[DOMÍNIO]/suporte` |
| URL da política de privacidade | Apple e Google | Página pública, aberta sem login; também precisa de um acesso dentro do app (App Review Guidelines 5.1.1(i)) | `https://clarevo-site.pages.dev/privacidade` ou `https://[DOMÍNIO]/privacidade` |
| URL dos termos de uso | Apple e Google (se pedirem) | Página pública, aberta sem login | `https://clarevo-site.pages.dev/termos` ou `https://[DOMÍNIO]/termos` |
| URL de exclusão da conta e dos dados | Google | Página que explique como pedir a exclusão (o app já exclui pela tela Conta, D-058; a página existe no site, ainda não publicada) | `https://clarevo-site.pages.dev/excluir-conta` ou `https://[DOMÍNIO]/excluir-conta` |
| URL de marketing (opcional) | Apple | Site do produto | `https://clarevo-site.pages.dev/` ou `https://[DOMÍNIO]/`, depois de publicado |
| Direitos autorais | Apple | "2026 Nome legal de quem é dona ou dono do app" | [preencher: 2026 nome da empresa] |
| Nome do desenvolvedor exibido | Apple (nome legal da organização) e Google | Nome que aparece como vendedora ou vendedor | [preencher: decisão de Enzo, `docs/16`] |

## 9. Classificação etária (respostas do questionário)

Resultado esperado: **4+** na Apple e a menor faixa na classificação do Google para o Brasil. Os textos exatos das perguntas mudam; confira a pergunta no momento de responder. O Clarevo não tem conteúdo sensível: as respostas são "não" ou "nenhum" em todos os itens abaixo.

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
| **Substituir por uma classificação mais alta** | **Decisão de Enzo (P-002)** | P-002 recomenda 18+ no lançamento. Se os termos de uso exigirem 18 anos, a Apple exige substituir a classificação calculada por 18+ (`.../manage-app-information/set-an-app-age-rating`) |

**Google Play** (questionário de classificação por faixa etária, IARC, em Conteúdo do app; **a conferir** na hora, a rede não abriu a página oficial):

| Pergunta (resumo) | Resposta |
|---|---|
| Categoria do app | Utilitário, produtividade ou outro (não é jogo, rede social nem notícia) |
| Violência, conteúdo sexual, linguagem imprópria, drogas, apostas | Não |
| As pessoas interagem ou trocam conteúdo entre si? | Só dentro da Família (convite por link, sem mensagens, sem conteúdo público). Responder conforme a pergunta aceitar: se pedir "compartilha informações do usuário com outras pessoas", responder sim e descrever a Família |
| Compartilha a localização? | Não |
| Permite compras de bens digitais? | Não (cobrança está fora do ciclo atual) |
| Acesso irrestrito à internet? | Não |

## 10. Informações para a revisão

**Apple, "Notas" (até 4000 bytes) e conta de teste.** Modelo; a conta e a senha ficam no campo próprio do App Store Connect, nunca no repositório (`docs/16`, seção 5).

<!-- campo: apple-notas-da-revisao | limite: 4000 | unidade: bytes -->
```
O Clarevo organiza o dinheiro do mês (gastos, recebimentos, contas a pagar, cartões, metas) e traz explicações de educação financeira. Não se conecta a contas bancárias, não movimenta dinheiro e não vende nada dentro do app.

Para entrar, use a conta de teste informada nos campos de acesso. Todos os dados dessa conta são fictícios e estão identificados como exemplo.

Permissões: a câmera é usada só para ler o QR Code da nota fiscal (nenhuma foto é guardada); o Face ID é opcional e só desbloqueia o app (Conta, "Pedir biometria ao abrir"); as notificações são lembretes locais de contas a pagar, ligados pela pessoa em Conta.

Exclusão da conta: Conta, último item, "Excluir minha conta" (exige digitar EXCLUIR).

Uma empresa pode oferecer o Clarevo como benefício. Ela vê os e-mails que convidou, a situação das licenças e as datas, e nunca vê gastos nem valores. O painel das empresas existe só na web.
```

**Google Play, "Acesso ao app".** Informar que o app exige login, e preencher as instruções de acesso com a conta de teste (nome de usuário e senha nos campos do Play Console, nunca no repositório). Texto das instruções: "Entre com o e-mail e a senha da conta de teste. Todos os dados são fictícios. A exclusão da conta fica em Conta, último item."
