# Clarevo

Organização e educação financeira para pessoas e famílias, com fundação preparada para empresas oferecerem o plano como benefício.

<p>
  <img src="docs/telas/01_boas_vindas.png" width="200" alt="Boas-vindas">
  <img src="docs/telas/06_resumo_demo.png" width="200" alt="Resumo">
  <img src="docs/telas/08_anotar_preenchido.png" width="200" alt="Anotar gasto">
  <img src="docs/telas/10_detalhe_gasto_salvo.png" width="200" alt="Detalhe do registro">
</p>

Primeiro ciclo: 07/10/2026. Contas a pagar: 08/10/2026. Gastos fixos e parcelamentos: 08/10/2026. Contas do ano: 08/10/2026. Primeiros passos: 08/10/2026. Calculadoras: 09/10/2026. Seus últimos meses, Aprender e dúvidas, lembretes, ocultar valores e biometria, renda comprometida, metas e reserva, plano de guardar e simulador: 09/10/2026 (com itens em aberto em `docs/04`, entre eles o teste em aparelho; o roteiro web cobre as telas novas). Sem Supabase configurado, o app roda em **demonstração** (acesso simulado e dados fictícios, com selo visível).

## O que funciona

- Entrada: boas-vindas, criar conta, confirmar e-mail, entrar, recuperar acesso e nova senha.
- Sua primeira conta, criada uma única vez.
- Gasto pago e recebimento já recebido: anotar, conferir no detalhe, editar e excluir com confirmação.
- Resumo do mês e composição de cada total pela mesma origem; troca de mês.
- Contas a pagar: anotar, editar e excluir; marcar como paga (o gasto entra em Pago na mesma operação) e desfazer; lista com vencidas, a vencer, pagas e próximos meses; "Ainda a pagar neste mês" no Resumo.
- Gastos fixos e parcelamentos: cadastrar uma vez (todo mês, com ou sem término, ou parcelado em até 480 parcelas) e ver a conta de cada mês aparecer sozinha em Contas a pagar um mês antes de vencer, paga com o mesmo toque de sempre; "Parcela 13 de 48" e quando termina; valor que muda (luz, água) marcado como estimado até a conta chegar; alterar só uma conta ou a partir de um mês; encerrar, retomar e excluir.
- Contas do ano (IPVA, IPTU, matrícula, material escolar, seguro anual): cota única ou de 2 a 12 parcelas no ano; o ano inteiro aparece em Contas a pagar dois meses antes do primeiro vencimento, e cada conta só entra em "Ainda a pagar" no mês em que vence; valor que muda de um ano para outro fica estimado até "Informar o valor de 2027"; "Paguei o ano todo de uma vez", tirar as parcelas do ano e "Ano a ano" no detalhe.
- Assinaturas (streaming, aplicativo, academia, clube, plano de celular): um gasto fixo mensal marcado como assinatura aparece no grupo "Assinaturas" no topo de Gastos fixos, com o que custa por mês e por ano; "Revisar assinaturas" lista as ativas e só grava a data da revisão, e um aviso dentro do app lembra de revisar depois de 6 meses (3 meses, se nunca revisou). Só informa: não muda nenhum total do mês e não cancela nada.
- Primeiros passos para conta nova: um card no Resumo com quatro passos (gastos fixos, recebimento do mês, gasto já pago e "Planejar quanto guardar"), que some ao concluir ou com "Agora não"; em Movimentações, o bloco "Organizar" leva a Contas a pagar e a Gastos fixos e parcelamentos.
- Calculadoras: 8 contas rápidas com os números que a pessoa digita, sem gravar nada (parcelado ou à vista, quanto custa por ano, quanto custa uma dívida, quitar antes, multa e juros, reserva, juntar para um objetivo e dividir as contas da casa), abertas por Movimentos, Metas, Aprender e links na hora da decisão; também "Já paguei" na lista de contas, "Por categoria" no Pago, "Somar valores" nos campos de valor e atalhos do ícone na versão web.
- Seus últimos meses: depois de 45 dias sem anotar (ou de um mês inteiro em branco), uma faixa discreta no Resumo, sem valores, oferece um resumo mês a mês do que ficou sem registro; "Atualizar agora" marca conta por conta "Já paguei", "Não houve" ou "Ainda não paguei" e anota recebimentos e gastos de meses passados, e "Seguir adiante" não cria nem apaga nada. Sem notificação nem e-mail; a data da última anotação fica só com a pessoa.
- Lembretes, ocultar valores e biometria (só no aparelho): um aviso no dia anterior ao vencimento, no horário escolhido, sem valores nem descrições na tela bloqueada; "Ocultar valores ao abrir" (também na web), que mostra "R$ ••••"; "Pedir biometria ao abrir" (opcional, nunca impede de sair da conta). O teste em aparelho fica para depois de o app estar pronto.
- Renda comprometida: quanto da renda de referência, informada por você, já tem destino no mês (gastos fixos, contas do ano, parcelamentos e outras contas), em uma linha dentro de "Ainda a pagar" e numa tela própria com "Fora dos compromissos", "Próximos meses" e a previsão dos pagamentos do mês em Contas a pagar; sem cor de alerta e sem julgamento, e sem mudar o Resumo.
- Metas e reserva para imprevistos: reserva a partir dos seus gastos essenciais, metas com prazo, aportes, resgates, rendimento recebido e "Atualizar valor guardado"; o Clarevo não guarda nem movimenta dinheiro, e o que você guarda não entra em Pago nem em Recebido.
- Plano de guardar: o Clarevo pergunta se você consegue guardar algum valor por mês; com "sim", monta etapas (reserva de 1, 3 e 6 meses e suas metas) e o mês previsto; com "agora não", sugere começar uma reserva mínima, a partir de R$ 100,00, sem julgamento. A resposta fica só com você.
- Simulador: quanto guardar por mês, em quanto tempo e quanto posso ter, com a taxa que você digita (campo vazio por padrão), o resultado sem rendimento sempre ao lado e as hipóteses à vista; só simulação, sem indicar produto, banco nem taxa, e nada é gravado.
- Aprender e dúvidas: busca, cinco seções e 40 temas curtos (juros, taxas, CET, IOF, cartão, cheque especial, inflação, Selic, FGC, contas do ano, reserva, renda comprometida, aporte, gastos essenciais, como ler uma simulação e o próprio app), com fonte e "Revisado em" em todos, fonte oficial com data de consulta sempre que existe e, nos temas com números, exemplo fictício com a conta aberta e, quando há calculadora correspondente, "Fazer a conta com os seus números"; "O que é isso?" ao lado dos termos nas telas; sem indicar produto e sem registrar o que a pessoa lê ou busca.
- Rascunho preservado, aviso antes de descartar, estados de carregamento, erro e vazio.
- Banco com permissões por pessoa, contexto e ação; empresa não vê finanças.

## Como rodar

Requer Node 22.12 ou mais recente.

```bash
npm install
npm run web        # navegador (em desenvolvimento, sem Supabase, abre em demonstração)
npm run app        # celular com o app Expo Go (QR code)
```

Uma versão web de demonstração para apresentar: `npm --workspace apps/app run export:demo` (gera `apps/app/dist`). Um build de produção sem Supabase configurado mostra "Configuração incompleta" em vez de abrir a demonstração.

## Como verificar

```bash
npm test           # regras financeiras (core)
npm run typecheck
npm run test:db    # permissões e sequência de aceite no banco (Postgres local)
npm run test:api   # código do app contra a API real do banco (PostgREST)
npm run test:web   # fluxos completos na versão web (Playwright)
```

## Documentação

1. [Visão e decisões](docs/00_VISAO_E_DECISOES.md)
2. [Arquitetura](docs/01_ARQUITETURA.md)
3. [Regras financeiras](docs/02_REGRAS_FINANCEIRAS.md)
4. [Acesso e permissões](docs/03_ACESSO_E_PERMISSOES.md)
5. [Roteiro até o lançamento](docs/04_ROTEIRO_LANCAMENTO.md)
6. [Ligar ao Supabase](docs/05_SUPABASE.md)
7. [Marca](docs/marca/) e [telas](docs/telas/)
8. [Análise e propostas (07/10/2026)](docs/06_ANALISE_E_PROPOSTAS.md)
9. [Publicação da versão web](docs/07_PUBLICACAO_WEB.md)
10. [Calculadoras, acessos rápidos e o que falta construir (08/10/2026)](docs/08_ACESSOS_E_ROTEIRO.md)
11. [Aprender e dúvidas: catálogo, fontes e revisões](docs/09_APRENDER.md)
12. [Referências recebidas](docs/referencias/)
