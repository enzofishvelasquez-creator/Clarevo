# Ligar o Clarevo ao Supabase (login e dados reais)

07/10/2026. Sem esta configuração, o app roda em **demonstração**: acesso simulado, nenhum e-mail enviado, dados só na memória do aparelho. Com ela, cadastro, confirmação de e-mail, recuperação de senha e registros passam a ser reais.

Não consegui abrir a documentação do Supabase deste ambiente (acesso bloqueado pela rede). Os nomes dos menus abaixo podem variar um pouco no painel; o conteúdo de cada passo é o mesmo.

## 1. Criar o projeto (você, ~5 min)

1. Entre em supabase.com e crie uma conta (pode usar o GitHub).
2. **New project**: nome `clarevo-producao`, região **South America (São Paulo)**.
3. Crie uma senha forte para o banco e guarde em um gerenciador de senhas. Não envie essa senha a ninguém, nem a mim.
4. Recomendado: crie também `clarevo-teste` para testes, separado dos dados reais.

## 2. Criar as tabelas e permissões

1. No projeto, abra **SQL Editor** → **New query**.
2. Cole todo o conteúdo de `supabase/migrations/20261007000001_fundacao.sql` e clique em **Run**.
3. Deve terminar sem erro. Se aparecer erro, me envie a mensagem.

## 3. Configurar o login

Em **Authentication**:

- **Providers → Email**: ativado, com **Confirm email** ligado.
- **Password**: tamanho mínimo **8** e exigência de letras e números (o app já informa essa regra antes do envio).
- **URL Configuration**:
  - *Site URL*: o endereço da versão web quando publicada (por enquanto, `http://localhost:8081`).
  - *Redirect URLs*: adicione `clarevo://**`, `exp://**` (para testar no Expo Go) e `http://localhost:8081/**`.
- **Rate limits**: mantenha os limites padrão contra tentativas abusivas.
- **Emails → SMTP**: o envio padrão do Supabase tem limite baixo e serve só para testes. Antes do lançamento, configure um provedor de e-mail próprio (por exemplo, Resend ou Amazon SES) com o domínio do Clarevo.

### Textos dos e-mails (Authentication → Emails → Templates)

**Confirmar cadastro** · assunto: `Confirme seu e-mail no Clarevo`

```html
<p>Olá!</p>
<p>Para liberar sua conta no Clarevo, confirme este endereço de e-mail.</p>
<p><a href="{{ .ConfirmationURL }}">Confirmar meu e-mail</a></p>
<p>Se você não pediu esta conta, ignore esta mensagem.</p>
```

**Recuperar senha** · assunto: `Defina uma nova senha no Clarevo`

```html
<p>Recebemos um pedido para recuperar o acesso à sua conta.</p>
<p><a href="{{ .ConfirmationURL }}">Definir nova senha</a></p>
<p>O link expira em pouco tempo. Se você não fez esse pedido, ignore esta mensagem; sua senha continua a mesma.</p>
```

## 4. Conectar o app

1. Em **Project Settings → API**, copie a **Project URL** e a chave pública (**publishable** ou **anon**). Nunca use a chave `service_role` no app.
2. Na pasta `apps/app`, copie `.env.example` para `.env` e preencha:

```
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_KEY=sua-chave-publica
```

3. Rode `npm run web` (ou `npm run app`). A tela de boas-vindas deixa de mostrar o selo "Demonstração".

Se preferir, me envie só a **Project URL** e a **chave pública** (são públicas por natureza: ficam dentro do app) e eu faço o restante.

## 5. Conferir

- Criar conta com um e-mail seu → chega o e-mail de confirmação → abrir o link → "Sua primeira conta".
- "Esqueci minha senha" → chega o e-mail → abrir o link → "Nova senha".
- Anotar um gasto, fechar o app, abrir de novo: o gasto continua lá.

Os testes de permissão do banco (`npm run test:db`) rodam em Postgres local com uma simulação do esquema de autenticação do Supabase; esses scripts não devem ser aplicados no Supabase. Depois de criar o projeto, repetir os fluxos pelo app no `clarevo-teste`.

## Custos (consultados em 07/10/2026 no repositório oficial do Supabase)

- **Free (US$ 0):** bom para desenvolvimento. Pausa o projeto após 1 semana sem uso, não tem backup automático e o e-mail embutido envia cerca de 2 mensagens por hora, só para a equipe do projeto. Não serve para pessoas reais.
- **Pro (a partir de US$ 25 por mês por organização):** não pausa, backup diário de 7 dias, 100 mil usuários ativos por mês incluídos e proteção contra senhas vazadas. Cada projeto a mais (por exemplo, `clarevo-teste`) soma cerca de US$ 10 por mês.
- **E-mail próprio (SMTP):** sem custo no Supabase; o custo é do provedor escolhido.
- **Recuperação para um ponto no tempo (PITR):** cerca de US$ 105 por mês a mais; pode esperar haver volume real.
