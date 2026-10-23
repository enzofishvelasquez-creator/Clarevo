# Sentry e e-mail com a marca: o que Enzo faz e o que vem depois

Versão de 20/10/2026 (D-062 itens 6 e 7). Os dois dependem de contas em nome da empresa. Nenhuma senha, chave secreta ou token vai para o chat nem para o repositório: o que o app precisa do Sentry é só o **DSN**, um endereço público de envio, e o que o Supabase precisa do provedor de e-mail fica guardado no próprio painel do Supabase. Planos e limites são "a conferir" na página oficial de cada serviço.

## 1. Monitoramento de falhas (Sentry)

**Para quê:** saber quando o app trava ou dá erro no celular de alguém, com a tela e a versão, para corrigir antes de a pessoa reclamar (D-054 item 9, CL-20). Só o erro técnico: nenhum valor, descrição, categoria, nome, e-mail ou dado financeiro.

**O que Enzo faz (cerca de 10 minutos):**
1. Criar a conta em `sentry.io` com o e-mail da empresa (plano gratuito para começar; conferir os limites).
2. Criar um projeto do tipo **React Native** chamado `clarevo-app`.
3. Copiar o **DSN** (começa com `https://` e termina com um número) e me enviar. O DSN não é segredo: ele só permite enviar erros, não ler.
4. Não criar nem enviar "auth token": quando for preciso enviar os mapas do código nos builds, ele fica guardado como segredo no Expo (EAS), configurado por Enzo, nunca no chat.

**O que eu faço depois de receber o DSN:**
1. Instalar `@sentry/react-native` na versão compatível com o Expo SDK 57 (com o plugin do Expo) e ligar o envio só com o DSN configurado.
2. Filtro antes do envio: apagar dos eventos qualquer texto digitado, valores em reais, e-mails, nomes, parâmetros de endereço (códigos de convite e de benefício) e o conteúdo das telas; manter só o tipo do erro, a tela, a versão e o aparelho.
3. Desligar coleta de IP, gravação de sessão e rastreamento de desempenho, e marcar o ambiente (demonstração, teste, produção) para não misturar.
4. Teste que confere o filtro, atualização de `docs/lojas/privacidade.md` (diagnóstico de falhas) e de "Quem vê estes dados?".

## 2. E-mails de confirmação e recuperação com a marca

**Para quê:** hoje o Supabase envia os e-mails de confirmar conta e de nova senha pelo serviço padrão, que tem limite baixo e serve só para testes (`docs/05`, seção 3). Para pessoas reais, os e-mails precisam sair de um endereço do domínio do Clarevo.

**O que Enzo faz (cerca de 30 minutos, depois de ter o domínio):**
1. Criar a conta num provedor de e-mail transacional (sugestão: Resend, pela simplicidade; plano gratuito para começar, a conferir) com o e-mail da empresa.
2. No provedor, adicionar o domínio (por exemplo, `clarevo.com.br`) e criar no painel do domínio os registros DNS que o provedor pedir (SPF, DKIM e, se pedido, DMARC). O provedor mostra quando o domínio estiver verificado.
3. No provedor, gerar as credenciais de **SMTP**.
4. No Supabase, em **Authentication → Emails → SMTP Settings**, ligar o SMTP próprio e preencher: remetente `nao-responda@` (ou `contato@`) do domínio, nome do remetente "Clarevo", servidor, porta, usuário e senha do SMTP gerados no passo 3. **A senha do SMTP é colada só ali, nunca no chat.**
5. Em **Authentication → Emails → Templates**, conferir que os textos de `docs/05` (seção 3) estão colados.
6. Em **Authentication → URL Configuration**, trocar o *Site URL* pelo endereço definitivo da versão web e acrescentar o domínio nas *Redirect URLs*.
7. Criar uma conta de teste com um e-mail próprio e conferir que o e-mail de confirmação chega com o nome Clarevo e que o link abre o app.

**O que eu faço depois:** conferir que os links dos e-mails abrem a tela certa no app e na web com o domínio novo, atualizar `docs/05`, `docs/07` e `docs/16` e, se o provedor permitir, preparar um texto de "Lembrete de vencimento por e-mail" para decisão futura (hoje os lembretes são só no aparelho, D-025).

## 3. O mesmo provedor no site: contato e Novidades por e-mail (D-066)

O site (`docs/22_SITE.md`, seções 8.3, 8.4 e 9) tem dois formulários **prontos e desligados**, que usam serviços de e-mail por chamada de API, sem SMTP e sem gravar nada no site:

- **Contato de "Para empresas"**: o `_worker.js` do projeto `clarevo-site` manda a mensagem ao e-mail de contato pelo **Resend**. É o provedor já sugerido na seção 2, então a conta, o domínio verificado (SPF e DKIM) e o remetente podem ser os mesmos dos e-mails de confirmação de cadastro. A chave de API é **outra** (só envio, restrita ao domínio) e fica só como segredo no painel da Cloudflare, nunca no repositório nem no chat.
- **Novidades por e-mail**: cadastro com dupla confirmação no **Brevo** (plano gratuito, a conferir), que também envia as Novidades e traz o link de cancelamento de cada e-mail. É uma conta à parte do Resend (o Brevo é para lista e envio em lote, o Resend para mensagens do serviço).

Antes de ligar qualquer um: o domínio e o e-mail da empresa (P-006, P-008), as seções 3.6 e 3.7 da política revisadas pelo advogado (perguntas 26 a 30 e 33 do resumo), o limite de taxa da Cloudflare criado e conferido (`docs/22`, seção 9, passo 1) e a atualização de `docs/lojas/privacidade.md` se o texto das lojas citar os serviços (Resend e Brevo viram operadores da lista de terceiros da política, seção 8).
