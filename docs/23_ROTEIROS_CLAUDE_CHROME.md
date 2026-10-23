# Roteiros para o Claude Chrome: contas da empresa, domínio, e-mail e site

Versão de 23/10/2026 (D-064 e D-065). Cada roteiro é colado no Claude Chrome por Enzo, com a sessão da pessoa certa já aberta no navegador. Regras que valem para todos:

- O Claude Chrome **não digita senhas, códigos de verificação, CPF nem dados de cartão**: quando a tela pedir, ele para e a própria pessoa digita.
- **Pagamento, assinatura e envio final** são sempre feitos pela pessoa, depois de conferir o resumo.
- Nenhuma chave de API, token ou senha vai para o chat nem para o repositório; segredos só no painel do próprio serviço.
- Dados da empresa: **CLAREVO INOVA SIMPLES (I.S.)**, CNPJ **69.771.864/0001-03**. Representante: Cristina (depois da alteração RJS2637008253 concluída).
- Os passos 2 a 6 dependem da alteração do quadro de integrantes estar **concluída**, porque bancos, a Dun & Bradstreet e o Registro.br conferem o representante no cadastro da Receita.

## 1. Domínio: quem tem o clarevo.com.br e o que está livre (só leitura, pode rodar já)

```
Tarefa só de leitura no Registro.br. Não registrar, não pagar e não criar conta.
1. Abra https://registro.br e pesquise, um por vez: clarevo.com.br, clarevo.app.br, meuclarevo.com.br, usaclarevo.com.br, appclarevo.com.br.
2. Para cada um, anote: disponível ou não; preço de 1 ano, se disponível.
3. Para clarevo.com.br (indisponível), abra a consulta "whois" (https://registro.br/tecnologia/ferramentas/whois/) e anote só: data de criação, data de expiração, se há servidores DNS configurados e se o endereço abre algum site (abra https://clarevo.com.br numa aba e descreva em uma frase). Não copie nome, e-mail nem documento de pessoas.
4. Relatório em tabela.
```

## 2. Registrar o domínio escolhido (Enzo ou a Cristina pagam)

```
Tarefa no Registro.br, com a sessão da Cristina aberta (conta do Registro.br em nome da empresa, CNPJ 69.771.864/0001-03).
1. Pesquise o domínio [DOMÍNIO ESCOLHIDO] e confira que está disponível.
2. Escolha 1 ano. Titular: a empresa (CNPJ). Não marque serviços extras pagos.
3. Em DNS, deixe o padrão por enquanto (vamos trocar para a Cloudflare no roteiro 4).
4. Pare na tela de pagamento e me diga o valor total e as opções. O pagamento é feito pela pessoa.
```

## 3. Número D-U-N-S (grátis, pela Apple)

```
Tarefa em https://developer.apple.com/enroll/duns-lookup/, com a conta Apple da Cristina já aberta (verificação em dois fatores ativa).
Regras: não pagar nada à Dun & Bradstreet; não digitar CPF nem senha.
1. Preencha os dados da organização exatamente como no cartão CNPJ: razão social CLAREVO INOVA SIMPLES (I.S.), endereço da sede e telefone da empresa. Se não tiver algum desses dados, pare e me peça.
2. Contato: nome, cargo e e-mail da Cristina (ela digita, se a tela exigir confirmação).
3. Clique para buscar. Se a empresa aparecer, anote o número D-U-N-S e pare.
4. Se não aparecer, pare na tela de envio dos dados à Dun & Bradstreet e me diga o que ela pede. O envio é feito pela pessoa.
5. Relatório: número encontrado, ou o que a tela pede para solicitar.
```

## 4. Cloudflare: domínio, e-mails do domínio e site (grátis)

```
Tarefa no painel da Cloudflare (dash.cloudflare.com), com a conta da empresa aberta. Regras: não ler, copiar nem criar chaves de API ou tokens; não mexer em Billing; plano Free.
Parte A, domínio:
1. "Add a domain" com [DOMÍNIO ESCOLHIDO], plano Free. Pule a importação de registros se não houver.
2. Anote os dois "nameservers" que a Cloudflare mostrar e pare: a troca no Registro.br é a Parte B.
Parte B, no Registro.br (sessão da Cristina): em [DOMÍNIO ESCOLHIDO] > DNS > "Alterar servidores DNS", troque pelos dois nameservers anotados e salve. Pare e me diga quando a Cloudflare mostrar o domínio como "Active" (pode levar horas).
Parte C, e-mails (Email Routing):
1. Em [DOMÍNIO ESCOLHIDO] > Email > Email Routing, ative e aceite os registros DNS que a própria Cloudflare propõe.
2. Crie os endereços contato@, suporte@ e privacidade@ encaminhando para o e-mail que Enzo indicar ([E-MAIL DE DESTINO]).
3. O e-mail de destino recebe um pedido de confirmação: a pessoa confirma na caixa dela.
4. Relatório: endereços criados e situação de cada um.
```

## 5. Publicar o site (projeto clarevo-site, depois da revisão do advogado)

Antes: `node scripts/gerar-site.js --final` precisa passar (dados da empresa, domínio e e-mails preenchidos em `site/dados-da-empresa.json`, textos jurídicos revisados). Passo a passo completo em `docs/22_SITE.md` e `docs/07_PUBLICACAO_WEB.md`.

```
Tarefa no painel da Cloudflare, conta da empresa. Regras: não ler nem criar chaves; plano Free; não ativar Web Analytics.
1. Workers & Pages > Create > Pages > Connect to Git: repositório da Clarevo no GitHub, ramo main.
2. Nome do projeto: clarevo-site. Framework preset: None. Comando de build: vazio. Pasta de saída: site.
3. Depois do primeiro deploy, em Custom domains, acrescente [DOMÍNIO ESCOLHIDO] (e www.[DOMÍNIO ESCOLHIDO], se a tela sugerir).
4. Em Settings, confira que Web Analytics está desligado. Em [DOMÍNIO ESCOLHIDO] > Scrape Shield, desligue "Email Address Obfuscation".
5. Relatório: endereço do projeto (.pages.dev), situação do domínio e o que a tela mostrou em cada passo.
```

## 6. Conta PJ (a própria pessoa abre)

Abertura de conta é feita pela representante no app do banco escolhido (sugestão em D-064: Inter Empresas; alternativa C6 Empresas), com os documentos da empresa e dela. Conferir antes: se o banco aceita empresa do Inova Simples, se o cartão aceita compra internacional (Apple e Google cobram em dólar) e quantos boletos grátis por mês.
