# Pagamento na web: comparação dos serviços (05/11/2026)

Para a assinatura paga (D-083) na versão web: cartão de crédito com renovação automática e Pix Automático (a pessoa autoriza uma vez no app do banco e o débito mensal acontece sozinho). No celular, o pagamento é pelas lojas (Apple e Google) e não entra aqui.

O que a Clarevo precisa do serviço: conta com o CNPJ da Clarevo; assinatura mensal por cartão e por Pix Automático; aviso automático (webhook) a cada pagamento, renovação, falha e cancelamento, que a função do servidor transforma em `billing_apply`; página de pagamento do próprio serviço (a Clarevo não recebe o número do cartão); cancelamento pela pessoa.

## Comparação

Valores das páginas e ajudas oficiais encontradas em 05/11/2026. Taxas mudam e algumas são promocionais: o Enzo confere na página de preços antes de abrir a conta.

| | Asaas | Mercado Pago | Efí Bank |
|---|---|---|---|
| Cartão com renovação automática | Sim | Sim (Assinaturas) | Sim |
| Pix Automático pela API | Sim (autorização e novas tentativas de débito) | Anunciado pelo Mercado Pago; a tabela de taxa não foi encontrada | Sim |
| Taxa no cartão | R$ 0,49 + 1,99% (promocional, 3 meses); a tabela padrão pode ser maior | 4,99% recebendo no mesmo dia, 4,49% em 14 dias ou 3,99% em 30 dias | Conferir na tabela |
| Taxa no Pix Automático | A taxa normal do Pix: R$ 1,99 por Pix (R$ 0,99 nos 3 primeiros meses) | Não encontrada | R$ 3,50 por Pix Automático pago |
| Custo por mês numa assinatura de R$ 29,90 | Cartão: cerca de R$ 1,09 (promocional); Pix: R$ 1,99 | Cartão: R$ 1,19 a R$ 1,49 | Pix: R$ 3,50 |
| Mensalidade do serviço | Não, só por cobrança recebida | Não | Não |

Fora da lista: **Stripe**, porque a ajuda dela diz que conta brasileira não tem Pix Automático (só Pix avulso).

## Decisão (D-084, 05/11/2026)

O Enzo escolheu o **Asaas**.

## Recomendação da equipe

**Asaas.** Tem as duas formas que a Clarevo quer, com Pix Automático já documentado na API (inclusive novas tentativas quando o débito falha), cobra só quando recebe e sai mais barato nas duas formas. O Mercado Pago é a segunda opção, por ser conhecido das pessoas, mas é mais caro no cartão e não mostra a taxa do Pix Automático. O Efí cobra R$ 3,50 por Pix Automático, mais de 10% de uma assinatura de R$ 29,90.

## O que o Enzo faz e o que a equipe faz

1. **Enzo, à mão:** escolhe o serviço, abre a conta com o CNPJ da Clarevo e confere as taxas. A chave da API e o segredo do webhook ficam só no serviço, no Bitwarden e nos segredos do Supabase, nunca no chat nem no repositório (como no Telegram).
2. **Equipe:** a página de assinatura na web, a função do servidor que recebe os avisos e chama `billing_apply`, o cancelamento junto com a exclusão da conta, os testes e o roteiro dos segredos.
3. **Contador:** a nota fiscal das vendas da web e o que a Inova Simples permite (pergunta 46 ao advogado).

## Fontes

- Asaas, preços e taxas: https://www.asaas.com/precos-e-taxas
- Asaas, taxas do Pix Automático: https://central.ajuda.asaas.com/hc/pt-br/articles/41912520942235-Quais-s%C3%A3o-as-taxas-do-Pix-Autom%C3%A1tico-no-Asaas
- Asaas, taxas de assinatura: https://central.ajuda.asaas.com/hc/pt-br/articles/31997100041371-Quais-s%C3%A3o-as-taxas-para-criar-cobran%C3%A7as-por-assinatura-recorrentes
- Asaas, Pix Automático e assinaturas na API: https://docs.asaas.com/docs/diferen%C3%A7a-entre-pix-autom%C3%A1tico-e-assinaturas-1
- Mercado Pago, pagamentos recorrentes: https://www.mercadopago.com.br/blog/como-receber-pagamentos-recorrentes
- Mercado Pago, Pix Automático: https://www.mercadopago.com.br/blog/pix-automatico-gestao-assinaturas-receita-recorrente
- Efí, Pix Automático: https://sejaefi.com.br/efi-pay/pix-automatico
- Efí, API Pix e tarifas: https://sejaefi.com.br/efi-pay/api-pix
- Stripe, Pix no Brasil: https://support.stripe.com/questions/how-to-enable-pix-as-a-payment-method-in-brazil
- Stripe, Pix Automático: https://docs.stripe.com/payments/pix/pix-automatico
