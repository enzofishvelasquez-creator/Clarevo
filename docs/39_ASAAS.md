# Assinatura na web pelo Asaas (D-084)

Plano da fase 2 da assinatura na web (D-083), com o Asaas como serviço de pagamento (D-084, 05/11/2026). No celular, a assinatura é pelas lojas e não entra aqui.

## O que já está confirmado na documentação do Asaas

Lido pelas buscas em 05/11/2026 (o endereço docs.asaas.com não abre deste ambiente; ver "Pendências").

- **API:** `https://api.asaas.com/v3` em produção e `https://api-sandbox.asaas.com/v3` no ambiente de testes (sandbox).
- **Checkout do Asaas** (`POST /v3/checkouts`): página de pagamento do próprio Asaas. Campos obrigatórios: `billingTypes`, `chargeTypes`, `callback` (`successUrl`, `cancelUrl`, `expiredUrl`) e `items` (`name`, `quantity`, `value`). Com `chargeTypes: ["RECURRENT"]`, o objeto `subscription` é obrigatório, e o Asaas cria a assinatura mensal quando a pessoa conclui o pagamento. O exemplo oficial de recorrência usa cartão (`CREDIT_CARD`). `minutesToExpire` vai de 10 a 1440. Eventos: `CHECKOUT_CREATED`, `CHECKOUT_PAID`, `CHECKOUT_CANCELED` e `CHECKOUT_EXPIRED`. A página do Asaas pede os dados da pessoa (a Clarevo não coleta CPF nem cartão).
- **Pix Automático:** API própria (`POST /v3/pix/automatic/authorizations`, com `frequency`, `contractId`, `startDate`, `finishDate` e `paymentCreationMode: "SUBSCRIPTION"` com `value`). A resposta traz o QR Code do primeiro pagamento, que também serve para a pessoa autorizar no banco. A autorização só vale depois do evento `PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED`; cancela com `DELETE /v3/pix/automatic/authorizations/{id}`.
- **Avisos (webhooks):** o Asaas não assina o corpo; manda o token escolhido na configuração (32 a 255 caracteres, que não pode ser a chave da API) no cabeçalho `asaas-access-token`. Corpo com `id` do evento (`evt_...`), `event` e o objeto (`payment`, `subscription`...). Entrega "pelo menos uma vez" (o mesmo `id` pode chegar de novo) e fora de ordem. Só a resposta **HTTP 200**, em até 10 segundos, conta como entregue; depois de **15 falhas seguidas a fila para**, e os eventos parados por mais de 14 dias são apagados.
- **Assinatura:** `externalReference` liga a assinatura ao identificador do nosso sistema e vem no evento `SUBSCRIPTION_CREATED`.

## Como a Clarevo vai usar

1. **Assinar (web):** na tela Assinatura, "Assinar" chama a função do servidor `assinatura-web` com a sessão da pessoa e o plano. A função cria um Checkout recorrente (cartão) com o preço do plano, a referência da conta e os endereços de volta (`app.clarevo.app.br/conta/assinatura`), e devolve o link. O app abre a página do Asaas.
2. **Receber os avisos:** a mesma função recebe os webhooks, confere o token em tempo constante e, para cada evento de cobrança ou assinatura, **consulta o estado atual no Asaas** (a assinatura e a última cobrança paga) em vez de confiar na ordem dos avisos. Com o estado atual, chama `billing_apply` (provider `web`, resumo SHA-256 do identificador da assinatura, plano, até quando vale e a hora da consulta como data do evento). Responde 200 a todo aviso autenticado que não precisa ser repetido, para a fila não parar.
3. **Até quando vale:** o próximo vencimento da assinatura mais 3 dias de tolerância; estorno ou contestação, na hora. Cancelar não corta o mês já pago.
4. **Excluir a conta:** a função cancela a assinatura da web no Asaas. Como rede de segurança, um aviso de cobrança de uma conta que não existe mais cancela a assinatura no Asaas.
5. **Segredos (Enzo, à mão):** `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` só no Asaas, no Bitwarden e nos segredos do Supabase. Nunca no chat, no repositório ou com o Claude Chrome.

## Pendências

- **Ler a documentação completa** (docs.asaas.com está bloqueado pela rede deste ambiente; o Enzo pode liberar o domínio nas configurações de rede do ambiente) ou testar no sandbox, para confirmar: se o `externalReference` do Checkout passa para a assinatura e para as cobranças, os campos do evento (`dateCreated`, `payment.subscription`) e o nome do cabeçalho da chave da API.
- **Pix Automático:** o Checkout recorrente aparece documentado só com cartão. O Pix Automático pela API provavelmente pede um cliente com CPF no Asaas, o que faria a Clarevo coletar o CPF no app (passado ao Asaas, sem guardar). Decisão do Enzo depois da confirmação: começar só com cartão na web e acrescentar o Pix Automático depois, ou coletar o CPF desde o início.
- **Conta do Asaas** (Enzo, à mão): a conta da Clarevo, com o CNPJ, e uma conta no sandbox para os testes.

## Fontes

- Checkout: https://docs.asaas.com/reference/create-new-checkout e https://docs.asaas.com/docs/checkout-com-assinatura-recorrente
- Pix Automático: https://docs.asaas.com/docs/pix-automatico-implementacao, https://docs.asaas.com/reference/criar-uma-autorizacao-pix-automatico e https://docs.asaas.com/docs/fluxos-de-webhook
- Webhooks: https://docs.asaas.com/docs/sobre-os-webhooks, https://docs.asaas.com/docs/create-new-webhook-via-api e https://docs.asaas.com/docs/fila-pausada
- Assinaturas: https://docs.asaas.com/docs/criando-uma-assinatura e https://docs.asaas.com/docs/eventos-para-assinaturas
