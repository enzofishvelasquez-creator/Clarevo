# Depois do app pronto: passos, processos e custos

Versão de 20/10/2026. Junta o que está em `docs/04` (tabela "O que só você pode providenciar"), `docs/05` (custos do Supabase, consultados em 07/10/2026), `docs/07` (publicação web) e `docs/16` (lojas). Valores em dólar são cobrados em dólar ou convertidos pela loja; os marcados "a conferir" não foram confirmados em página oficial nesta sessão.

## 1. Custos

| Item | Para quê | Custo | Quando |
|---|---|---|---|
| CNPJ e contador | Contas das lojas e contratos em nome da empresa | Orçamento do contador | Antes das lojas |
| Domínio (.com.br) | Site, e-mail e links do app | Cerca de R$ 40 a R$ 150 por ano (a conferir no Registro.br) | Antes das lojas |
| Apple Developer (organização) | Publicar no iPhone | US$ 99 por ano (`docs/16`, página oficial da Apple) | Antes do iOS |
| D-U-N-S | Exigido pela Apple para organização | Sem custo pela Apple (a conferir) | Antes da Apple |
| Google Play Console | Publicar no Android | US$ 25, uma vez (a conferir) | Antes do Android |
| Expo (EAS) | Gerar o app e enviar às lojas | Plano gratuito para começar; limites a conferir | Antes das lojas |
| Supabase Pro | Banco e login para pessoas reais: não pausa, backup diário de 7 dias | A partir de US$ 25 por mês; cada projeto a mais (o de teste) cerca de US$ 10 por mês | Antes das primeiras pessoas reais |
| E-mail próprio (ex.: Resend) | Confirmação de conta e recuperação de senha com a marca | Plano gratuito no início (a conferir) | Antes das primeiras pessoas reais |
| Cloudflare Pages | Site e versão web | Plano gratuito em uso hoje | Já em uso |
| Sentry | Registro de falhas, sem dados financeiros | Plano gratuito (a conferir) | Antes do piloto |
| Advogado | Política de privacidade, termos de uso, contrato com empresas, prazos de guarda | Orçamento do escritório | Antes do piloto |
| Busca e registro de marca no INPI | Evitar conflito com o nome "Clarevo" e proteger a marca | Busca gratuita; pedido de registro (código 389, especificação pré-aprovada) com taxa única por classe que já inclui a concessão desde 20/09/2025: R$ 880, ou R$ 440 com o desconto de ME, EPP e MEI (Portaria GM/MDIC nº 110/2025; conferir a tabela vigente do INPI antes de gerar a GRU). Começar pela classe 9 | Busca antes do domínio; pedido quando houver caixa |
| Recuperação para um ponto no tempo (Supabase) | Voltar o banco a qualquer minuto | Cerca de US$ 105 por mês a mais | Só com volume real |

**Mínimo para lançar:** Apple (US$ 99 por ano), Google (US$ 25 uma vez), Supabase Pro (US$ 25 por mês, mais cerca de US$ 10 se mantiver o projeto de teste), domínio, contador e advogado. O resto começa no plano gratuito.

## 2. Passo a passo

### Fase 1. Empresa e contas (1 a 3 semanas)
1. CNPJ, domínio e um e-mail da empresa (por exemplo, `contato@` e `suporte@`).
2. D-U-N-S da empresa e conta Apple Developer como organização; conta Google Play como organização; conta Expo.
3. Decidir o identificador do app (`app.clarevo` proposto; não muda depois de publicado), o nome do desenvolvedor e o e-mail de suporte (`docs/16`, seção 2).

### Fase 2. Jurídico (em paralelo, 2 a 4 semanas)
1. Política de privacidade e termos de uso, publicados num endereço do domínio.
2. Revisão das regras de exclusão de conta e dos prazos de guarda (D-058, P-010).
3. Modelo de contrato com as empresas: a empresa só paga; o Clarevo é controlador dos dados financeiros; a empresa nunca vê finanças (M-5, D-056).
4. Canal para pedidos de titular da LGPD (P-023) e quem responde por eles.

### Fase 3. Produção (1 semana)
1. Supabase Pro no projeto de produção; manter um projeto de teste separado.
2. E-mail próprio no Supabase (confirmação e recuperação com a marca).
3. Sentry no app, sem dados financeiros (D-054 item 9).
4. Conferir que todas as migrações estão coladas (`docs/05`, hoje até a 0016) e fazer um teste de restauração do backup.

### Fase 4. Lojas (1 a 3 semanas, contando revisões)
1. Primeiro build (`docs/16`, fases 1 a 3).
2. Teste interno: TestFlight no iPhone e teste interno ou fechado no Google (contas novas do Google podem exigir teste fechado antes da produção; a conferir).
3. Conta de teste com dados fictícios para a revisão da Apple e do Google (`docs/16`, seção 5).
4. Enviar para revisão, corrigir o que for pedido e publicar.

### Fase 5. Teste de uso e piloto (4 a 8 semanas)
1. Teste com 5 pessoas e 5 tarefas (`docs/15`), ajustes do que travar.
2. Primeira empresa: contrato assinado, cadastro pela equipe no SQL Editor (`docs/05`, passo 24), o RH convida pelo painel, as pessoas aceitam pelo link.
3. Acompanhar só o que a empresa também vê: vagas, convites, licenças ativas e encerradas.

## 3. Processos contínuos

| Processo | Frequência | Quem |
|---|---|---|
| Suporte por e-mail às pessoas | Diário | Equipe Clarevo |
| Atualização do app: testes, publicação web (`docs/07`) e envio às lojas | A cada versão | Equipe técnica, com o "sim" de Enzo |
| Migração nova: colar e conferir no Supabase antes de publicar | A cada mudança no banco | Enzo (com o roteiro pronto) |
| Olhar falhas no Sentry | Semanal | Equipe técnica |
| Backup: conferir e testar restauração | Mensal | Equipe técnica |
| Conteúdo de Aprender: revisar temas no prazo (`docs/09`) e conferir datas do ano (Imposto de Renda, 13º, feriados) | Conforme o prazo de cada tema | Equipe de conteúdo |
| Pedidos de titular da LGPD (acesso, correção, exclusão) | Até o prazo da lei | Responsável indicado na Fase 2 |
| Renovar a conta Apple | Anual | Enzo |
| Cadastrar empresa, vagas e fim de contrato | A cada contrato | Equipe Clarevo |

## 4. Depois do piloto

- Cobrança e planos (P-005): preço do individual e do familiar, forma de pagamento e o que muda quando o benefício acaba.
- Integração bancária (Open Finance), quando houver investimento (`docs/11`).
- Pessoas menores de 18 anos na Família (P-002), com consentimento.
