# Clarevo

Organização e educação financeira para pessoas e famílias, com fundação preparada para empresas oferecerem o plano como benefício.

<p>
  <img src="docs/telas/01_boas_vindas.png" width="200" alt="Boas-vindas">
  <img src="docs/telas/06_resumo_demo.png" width="200" alt="Resumo">
  <img src="docs/telas/08_anotar_preenchido.png" width="200" alt="Anotar gasto">
  <img src="docs/telas/10_detalhe_gasto_salvo.png" width="200" alt="Detalhe do registro">
</p>

Primeiro ciclo: 07/10/2026. Contas a pagar: 08/10/2026. Gastos fixos e parcelamentos: 08/10/2026. Contas do ano: 08/10/2026. Primeiros passos: 08/10/2026. Sem Supabase configurado, o app roda em **demonstração** (acesso simulado e dados fictícios, com selo visível).

## O que funciona

- Entrada: boas-vindas, criar conta, confirmar e-mail, entrar, recuperar acesso e nova senha.
- Sua primeira conta, criada uma única vez.
- Gasto pago e recebimento já recebido: anotar, conferir no detalhe, editar e excluir com confirmação.
- Resumo do mês e composição de cada total pela mesma origem; troca de mês.
- Contas a pagar: anotar, editar e excluir; marcar como paga (o gasto entra em Pago na mesma operação) e desfazer; lista com vencidas, a vencer, pagas e próximos meses; "Ainda a pagar neste mês" no Resumo.
- Gastos fixos e parcelamentos: cadastrar uma vez (todo mês, com ou sem término, ou parcelado em até 480 parcelas) e ver a conta de cada mês aparecer sozinha em Contas a pagar um mês antes de vencer, paga com o mesmo toque de sempre; "Parcela 13 de 48" e quando termina; valor que muda (luz, água) marcado como estimado até a conta chegar; alterar só uma conta ou a partir de um mês; encerrar, retomar e excluir.
- Contas do ano (IPVA, IPTU, matrícula, material escolar, seguro anual): cota única ou de 2 a 12 parcelas no ano; o ano inteiro aparece em Contas a pagar dois meses antes do primeiro vencimento, e cada conta só entra em "Ainda a pagar" no mês em que vence; valor que muda de um ano para outro fica estimado até "Informar o valor de 2027"; "Paguei o ano todo de uma vez", tirar as parcelas do ano e "Ano a ano" no detalhe.
- Primeiros passos para conta nova: um card no Resumo com três passos (gastos fixos, recebimento do mês e gasto já pago), que some ao concluir ou com "Agora não"; em Movimentações, o bloco "Organizar" leva a Contas a pagar e a Gastos fixos e parcelamentos.
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
11. [Referências recebidas](docs/referencias/)
