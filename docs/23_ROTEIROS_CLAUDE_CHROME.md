# Roteiros para o Claude Chrome: contas da empresa, domínio, e-mail e site

Versão de 25/10/2026 (D-064, D-065 e D-070). Cada roteiro é colado no Claude Chrome por Enzo, com a sessão da pessoa certa já aberta no navegador. Regras que valem para todos:

- O Claude Chrome **não digita senhas, códigos de verificação, CPF nem dados de cartão**: quando a tela pedir, ele para e a própria pessoa digita.
- **Pagamento, assinatura e envio final** são sempre feitos pela pessoa, depois de conferir o resumo.
- Nenhuma chave de API, token ou senha vai para o chat nem para o repositório; segredos só no painel do próprio serviço.
- Dados da empresa: **CLAREVO INOVA SIMPLES (I.S.)**, CNPJ **69.771.864/0001-03**. Representante: Cristina. A alteração RJS2637008253 foi concluída (certificado do Inova Simples emitido em 25/10/2026: Cristina e Bernardo no quadro). Endereço da sede: o do certificado, copiado exatamente como está lá.
- Domínio escolhido (D-070): **clarevo.app.br**, para o site, o app e os e-mails. Ordem: roteiro 2, roteiro 4 (Cloudflare e Zoho), roteiro 3 (D-U-N-S, já com o contato@clarevo.app.br) e roteiro 6.

## 1. Domínio: quem tem o clarevo.com.br e o que está livre (só leitura, pode rodar já)

```
Tarefa só de leitura no Registro.br. Não registrar, não pagar e não criar conta.
1. Abra https://registro.br e pesquise, um por vez: clarevo.com.br, clarevo.app.br, meuclarevo.com.br, usaclarevo.com.br, appclarevo.com.br.
2. Para cada um, anote: disponível ou não; preço de 1 ano, se disponível.
3. Para clarevo.com.br (indisponível), abra a consulta "whois" (https://registro.br/tecnologia/ferramentas/whois/) e anote só: data de criação, data de expiração, se há servidores DNS configurados e se o endereço abre algum site (abra https://clarevo.com.br numa aba e descreva em uma frase). Não copie nome, e-mail nem documento de pessoas.
4. Relatório em tabela.
```

## 2. Registrar o clarevo.app.br (R$ 40 por 1 ano; a pessoa paga)

Antes: quem registra entra no Registro.br com a própria conta. A criação da conta pede CPF, senha e confirmação por e-mail, e essas partes ficam com a pessoa.

```
Tarefa no Registro.br (https://registro.br), com a sessão da pessoa já aberta neste Chrome.
Regras: não digitar senhas, códigos de verificação nem CPF; não marcar nenhum serviço extra pago; não pagar; se a tela pedir um dado que você não tenha, pare e me pergunte.

1. Pesquise o domínio clarevo.app.br e confira que aparece como disponível. Se não estiver, pare e me avise.
2. Clique em Registrar.
3. Titular do domínio: a empresa, como pessoa jurídica, com o CNPJ 69.771.864/0001-03. Confira se o nome que aparece é CLAREVO INOVA SIMPLES (I.S.). Se o sistema pedir o nome do responsável pela empresa ou outro dado da empresa que não esteja preenchido, pare e me pergunte.
4. Contatos (administrativo, técnico e de cobrança): use a conta que está logada, se o sistema oferecer essa opção.
5. Servidores DNS: deixe a opção padrão do Registro.br (vamos trocar depois para a Cloudflare).
6. Período: 1 ano (R$ 40,00). Não escolha 2 ou 5 anos.
7. Siga até a tela de pagamento e PARE. Não pague.
8. Me mande o relatório: o resumo do pedido (domínio, titular, período, valor total), as formas de pagamento oferecidas e qualquer aviso que tenha aparecido.
```

Depois: a pessoa confere o resumo e paga (pelo Pix costuma confirmar mais rápido que pelo boleto).

## 3. Número D-U-N-S (grátis, pela Apple)

Pedido enviado em 27/10/2026 pela conta Apple da Cristina, com contato@clarevo.app.br (a ferramenta da Apple estava fora do ar em 26/10/2026). A confirmação e o número chegam por e-mail da Dun & Bradstreet nesse endereço, em alguns dias úteis; o número pode levar até cerca de duas semanas para aparecer na busca da Apple. Não pagar nenhuma opção de agilizar.

```
Tarefa em https://developer.apple.com/enroll/duns-lookup/, com a conta Apple da Cristina já aberta (verificação em dois fatores ativa).
Regras: não pagar nada à Dun & Bradstreet; não digitar CPF nem senha.
1. Preencha os dados da organização exatamente como no certificado do Inova Simples: razão social CLAREVO INOVA SIMPLES (I.S.), endereço da sede (rua, número, complemento, bairro, cidade, UF e CEP) e telefone da empresa. Se não tiver algum desses dados, pare e me peça.
2. Contato: nome e cargo da Cristina, com o e-mail contato@clarevo.app.br (ela digita, se a tela exigir confirmação).
3. Clique para buscar. Se a empresa aparecer, anote o número D-U-N-S e pare.
4. Se não aparecer, pare na tela de envio dos dados à Dun & Bradstreet e me diga o que ela pede. O envio é feito pela pessoa.
5. Relatório: número encontrado, ou o que a tela pede para solicitar.
```

## 4. Cloudflare e Zoho: domínio e e-mails (grátis)

Os e-mails ficam no Zoho Mail, numa organização só da Clarevo, separada da Finan Velasquez (D-070). O Email Routing da Cloudflare **não** é ativado: ele troca os registros MX e conflita com o Zoho. Plano B, só se o plano gratuito do Zoho não estiver disponível: Email Routing da Cloudflare, só para receber, encaminhando para uma caixa que Enzo indicar.

Registrado em 25/10/2026 em nome da empresa, expira em 25/10/2027 no painel (renovação de R$ 40 por ano, avisada pelo Registro.br por e-mail). Feito em 25/10/2026: zona na Cloudflare (nameservers harlee e jaziel), sem DNSSEC. A Cloudflare importou os registros de proteção que o Registro.br publica para domínio sem e-mail (MX nulo ".", SPF "v=spf1 -all" e DMARC "p=reject"); eles ficam até o Zoho e são trocados no roteiro abaixo.

```
Tarefa na Cloudflare (dash.cloudflare.com) e no Registro.br (https://registro.br), com as duas sessões já abertas neste Chrome. Use a mesma conta da Cloudflare onde estão os projetos clarevo, clarevo-demo e clarevo-site.
Regras: não ler, copiar nem criar chaves de API ou tokens; não mexer em Billing; plano Free; não ativar o Email Routing; não digitar senhas nem códigos de verificação; se a tela pedir um dado que você não tenha, pare e me pergunte.

Parte A, conferir o registro (só leitura):
1. No Registro.br, abra clarevo.app.br e anote: o nome do titular (deve ser CLAREVO INOVA SIMPLES (I.S.)), a situação do domínio e se o pagamento aparece como confirmado. Se o titular não for a empresa, pare e me avise.

Parte B, Cloudflare:
2. Em "Add a domain", informe clarevo.app.br e escolha o plano Free. Se a Cloudflare oferecer a varredura de registros, aceite, mas não crie nenhum registro além dos que ela encontrar.
3. Anote os dois nameservers que a Cloudflare mostrar.

Parte C, servidores DNS no Registro.br:
4. Em clarevo.app.br > DNS > "Alterar servidores DNS", troque pelos dois nameservers da Cloudflare e salve. Se o Registro.br não deixar porque o pagamento ainda não foi confirmado, pare e me avise.
5. Depois de salvar, se a tela de DNSSEC do clarevo.app.br ainda mostrar registros DS, remova-os: eles são do DNS do Registro.br e deixam de valer com a Cloudflare (o DNSSEC da Cloudflare fica para depois).
6. Volte à Cloudflare e clique em "Check nameservers" (ou equivalente).

Relatório: titular e situação do domínio, os dois nameservers, o que a tela de DNSSEC mostrou, se a troca foi salva e a situação na Cloudflare (Pending ou Active).
```

**O que a pessoa faz no Zoho**, porque pede senha e confirmação pelo celular: em `zoho.com/mail`, criar uma conta nova, só da Clarevo, no plano gratuito se aparecer (limites a conferir), com a opção de usar um domínio que já tem (`clarevo.app.br`). O primeiro usuário, que administra a conta, é `contato@clarevo.app.br`; a pessoa define a senha e liga a verificação em duas etapas.

```
Tarefa no painel do Zoho Mail (Admin Console) e no painel da Cloudflare, com as sessões já abertas neste Chrome.
Antes: a zona clarevo.app.br precisa aparecer como "Active" na Cloudflare.
Regras: não digitar nem copiar senhas, códigos de verificação ou chaves; não mexer em Billing nem em planos pagos; não ativar o Email Routing da Cloudflare (ele conflita com o Zoho); se a tela pedir um dado que você não tenha, pare e me pergunte.

Parte A, verificar o domínio:
1. No Zoho Admin Console, em Domínios, abra clarevo.app.br e veja o registro de verificação pedido (TXT ou CNAME). Anote só o tipo, o nome e o valor.
2. Na Cloudflare, em clarevo.app.br > DNS > Records, crie esse registro exatamente como o Zoho mostrou (Proxy desligado, "DNS only").
3. Volte ao Zoho e clique em Verificar. Se falhar, espere 10 minutos e tente de novo; me avise se continuar falhando.

Parte B, entrega de e-mail:
4. Na Cloudflare, crie os registros MX que o Zoho indicar na configuração de e-mail (normalmente mx.zoho.com prioridade 10, mx2.zoho.com prioridade 20 e mx3.zoho.com prioridade 50; use os que o Zoho mostrar). Apague o MX nulo (".", prioridade 0) que veio do Registro.br e qualquer outro MX que não seja do Zoho.
5. Edite o TXT de SPF que já existe na raiz ("v=spf1 -all") e troque o valor pelo que o Zoho indicar (normalmente "v=spf1 include:zoho.com ~all"). Deve ficar um único SPF na raiz.
6. No Zoho, em DKIM, crie a chave do domínio e copie o registro TXT que ele mostrar para a Cloudflare. Volte e clique em Verificar.
7. Edite o TXT _dmarc que já existe ("v=DMARC1; p=reject;") e troque o valor por "v=DMARC1; p=none; rua=mailto:privacidade@clarevo.app.br". Deve ficar um único _dmarc.

Parte C, caixas:
8. No Zoho, em Usuários, crie: suporte@clarevo.app.br, privacidade@clarevo.app.br e marketing@clarevo.app.br (contato@ já existe como administrador). Quando o Zoho pedir senha para cada uma, pare: a pessoa define as senhas.
9. Relatório: o que foi verificado (domínio, MX, SPF, DKIM, DMARC), as caixas criadas e qualquer aviso.
```

Depois: um e-mail de teste de um Gmail para `contato@clarevo.app.br` e outro de volta, para conferir que chega e sai. Em seguida, `site/dados-da-empresa.json` recebe o domínio e os e-mails, e a política de privacidade passa a citar o Zoho entre os serviços usados.

## 5. Publicar o site (projeto clarevo-site, depois da revisão do advogado)

Antes: `node scripts/gerar-site.js --final` precisa passar (dados da empresa, domínio e e-mails preenchidos em `site/dados-da-empresa.json`, textos jurídicos revisados). Passo a passo completo em `docs/22_SITE.md` e `docs/07_PUBLICACAO_WEB.md`.

```
Tarefa no painel da Cloudflare, conta da empresa. Regras: não ler nem criar chaves; plano Free; não ativar Web Analytics.
1. Workers & Pages > Create > Pages > Connect to Git: repositório da Clarevo no GitHub, ramo main.
2. Nome do projeto: clarevo-site. Framework preset: None. Comando de build: vazio. Pasta de saída: site.
3. Depois do primeiro deploy, em Custom domains, acrescente clarevo.app.br (e www.clarevo.app.br, se a tela sugerir).
4. Em Settings, confira que Web Analytics está desligado. Em clarevo.app.br > Scrape Shield, desligue "Email Address Obfuscation".
5. Relatório: endereço do projeto (.pages.dev), situação do domínio e o que a tela mostrou em cada passo.
```

## 5a. clarevo.app.br no site preliminar (D-071, 26/10/2026)

O site continua com a faixa "Versão preliminar" e sem indexação enquanto houver marcador sem valor; o domínio só troca o endereço `clarevo-site.pages.dev` pelo oficial (a Apple pede um site no cadastro). Os registros de e-mail do Zoho (MX, SPF, DKIM e DMARC) não mudam: o domínio do site usa só o registro do próprio endereço.

```
Tarefa no painel da Cloudflare (dash.cloudflare.com), na conta onde estão os projetos clarevo, clarevo-demo e clarevo-site.
Regras: não ler, copiar nem criar chaves de API ou tokens; não mexer em Billing; não alterar nem apagar registros MX, TXT, SPF, DKIM ou DMARC; não mexer nas variáveis de ambiente do projeto; se a tela pedir um dado que você não tenha, pare e me pergunte.

1. Workers & Pages > clarevo-site > Custom domains > "Set up a custom domain": informe clarevo.app.br e confirme. A Cloudflare cria sozinha o registro do endereço na zona clarevo.app.br; aceite.
2. Repita para www.clarevo.app.br.
3. Espere os dois aparecerem como "Active" (pode levar alguns minutos). Se algum ficar com erro, pare e me diga a mensagem exata.
4. Em clarevo.app.br > SSL/TLS > Edge Certificates, confira que "Always Use HTTPS" está ligado (ligue, se estiver desligado).
5. Em clarevo.app.br > Scrape Shield, desligue "Email Address Obfuscation".
6. Abra https://clarevo.app.br e https://www.clarevo.app.br em abas novas e confira que aparece o site da Clarevo com a faixa "Versão preliminar".
7. Relatório: situação dos dois domínios, o que foi ligado ou desligado nos passos 4 e 5, os registros DNS da zona depois da mudança (tipo, nome e valor) e o que as duas abas mostraram.
```

Feito em 26/10/2026: os dois endereços ficaram ativos, com "Always Use HTTPS" ligado e "Email Address Obfuscation" desligado. Depois: `site/dados-da-empresa.json` recebe `DOMÍNIO` = `clarevo.app.br` (link canônico, sitemap e Open Graph com endereço completo), e o site é gerado de novo e publicado. Se o formulário de contato for ligado um dia, a variável `SITE_HOST` do projeto passa a ser `clarevo.app.br` (`docs/22_SITE.md`, seção 9).

## 5b. Endereços oficiais do app e da demonstração (26/10/2026)

Feito e conferido em 27/10/2026: os dois domínios ativos, Site URL `https://app.clarevo.app.br` e as Redirect URLs com `https://app.clarevo.app.br/**`. `app.clarevo.app.br` abre o app com login (projeto `clarevo`) e `demo.clarevo.app.br`, a demonstração com dados fictícios (projeto `clarevo-demo`). Os endereços `.pages.dev` continuam funcionando, então nada quebra durante a troca. Depois do relatório, a equipe troca os links do app (convites da Família e das empresas), do site e da apresentação para os endereços novos.

```
Tarefa no painel da Cloudflare (dash.cloudflare.com) e no painel do Supabase (supabase.com/dashboard), com as duas sessões já abertas neste Chrome.
Regras: não ler, copiar nem criar chaves de API, tokens ou senhas; no Supabase, não abrir as telas de API Keys, Database password nem Billing; não alterar nem apagar registros MX, TXT, SPF, DKIM ou DMARC; não mexer nas variáveis de ambiente dos projetos; se a tela pedir um dado que você não tenha, pare e me pergunte.

Parte A, Cloudflare:
1. Workers & Pages > clarevo > Custom domains > "Set up a custom domain": app.clarevo.app.br. Aceite o registro que a Cloudflare propõe.
2. Workers & Pages > clarevo-demo > Custom domains > "Set up a custom domain": demo.clarevo.app.br. Aceite o registro que a Cloudflare propõe.
3. Espere os dois aparecerem como "Active". Se algum der erro, pare e me diga a mensagem exata.

Parte B, Supabase (projeto do app):
4. Authentication > URL Configuration.
5. Site URL: troque para https://app.clarevo.app.br e salve.
6. Redirect URLs: acrescente https://app.clarevo.app.br/** e mantenha as que já existem (inclusive https://clarevo.pages.dev/**). Salve.

Parte C, conferência:
7. Abra https://app.clarevo.app.br numa aba nova: deve aparecer a tela de entrada da Clarevo. Não entre em nenhuma conta.
8. Abra https://demo.clarevo.app.br: deve aparecer o app com "Demonstração" no alto.
9. Relatório: situação dos dois domínios, o Site URL e a lista de Redirect URLs depois da mudança, e o que as duas abas mostraram.
```

## 5c. E-mails do app com a marca (Resend, 26/10/2026)

Os e-mails de confirmação de cadastro e de nova senha passam a sair de `nao-responda@clarevo.app.br`, com o nome "Clarevo", pelo Resend (plano gratuito: 3.000 e-mails por mês e 100 por dia, a conferir). O Resend usa o subdomínio `send.clarevo.app.br` e a chave `resend._domainkey`, então os registros do Zoho (MX, SPF e DKIM da raiz) **não mudam**. A chave de envio do Resend é criada e colada no Supabase **pela própria pessoa**, nunca no chat nem no repositório.

Feito em 27/10/2026: domínio verificado no Resend, região São Paulo (sa-east-1), com os registros que o painel pediu (CNAME `send`, CNAME `rsend` e TXT `resend._domainkey`). O MX na raiz que o Resend pede só para **receber** e-mails **não** foi criado, porque conflita com o Zoho; o recebimento do Resend fica desligado. Falta salvar o SMTP no Supabase com a chave (passos 5 a 8) e colar os modelos em português de `docs/05`, seção 3 (o Supabase só deixa editar os modelos com o SMTP próprio ligado).

**Antes, a pessoa:** cria a conta em resend.com com o contato@clarevo.app.br (senha e confirmação por e-mail são dela).

```
Tarefa no painel do Resend (resend.com), na Cloudflare e no Supabase, com as três sessões já abertas neste Chrome.
Regras: não criar, ler nem copiar chaves de API, tokens ou senhas (a pessoa faz isso); não mexer em Billing nem em planos pagos; na Cloudflare, não alterar nem apagar os registros MX, SPF, DKIM (zmail._domainkey) e DMARC que já existem: só acrescentar os do Resend; se a tela pedir um dado que você não tenha, pare e me pergunte.

Parte A, domínio no Resend:
1. Domains > Add Domain: clarevo.app.br. Se pedir região, escolha São Paulo (sa-east-1), se houver; senão, a padrão, e me diga qual ficou.
2. Anote os registros que o Resend pedir (tipo, nome, valor e prioridade).
3. Na Cloudflare, em clarevo.app.br > DNS > Records, crie cada um exatamente como o Resend mostrou, com Proxy desligado ("DNS only"). Normalmente são: um MX e um TXT de SPF no nome "send", e um TXT de DKIM no nome "resend._domainkey". Se algum registro pedido for na raiz (clarevo.app.br) e já existir um parecido, pare e me avise antes.
4. Volte ao Resend e clique em Verify. Se ficar pendente, espere 10 minutos e tente de novo.

Parte B, a pessoa cria a chave:
5. Pare e peça para a pessoa criar, em API Keys, uma chave só de envio ("Sending access"), restrita ao domínio clarevo.app.br, e deixar a chave copiada. Não olhe nem copie a chave.

Parte C, SMTP no Supabase (projeto do app):
6. Authentication > Emails > SMTP Settings: ligue o SMTP próprio ("Enable Custom SMTP").
7. Preencha: Sender email nao-responda@clarevo.app.br; Sender name Clarevo; Host smtp.resend.com; Port 465; Username resend.
8. No campo Password, pare: a pessoa cola a chave do passo 5. Depois que ela avisar, salve.
9. Authentication > Emails > Templates: veja se os modelos estão em português (por exemplo, o assunto de "Confirm signup"). Não altere; só me diga o assunto de cada modelo.

Relatório: região e situação do domínio no Resend, os registros criados na Cloudflare (tipo, nome e valor resumido), o que ficou salvo no SMTP (sem a senha) e os assuntos dos modelos.
```

**Depois, a pessoa:** cria uma conta de teste no app com um e-mail próprio e confere que o e-mail de confirmação chega de "Clarevo <nao-responda@clarevo.app.br>", fora do spam, e que o link abre o app. Em seguida, a equipe atualiza a política de privacidade (provedor de e-mail escolhido: Resend, P-008), `docs/05`, `docs/07` e `docs/16`.

## 6. Conta PJ (a própria pessoa abre)

Abertura de conta é feita pela representante no app do banco escolhido (sugestão em D-064: Inter Empresas; alternativa C6 Empresas), com os documentos da empresa e dela. Conferir antes: se o banco aceita empresa do Inova Simples, se o cartão aceita compra internacional (Apple e Google cobram em dólar) e quantos boletos grátis por mês.
