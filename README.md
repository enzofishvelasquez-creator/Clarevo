# Clarevo

Organização e educação financeira para pessoas e famílias, com fundação preparada para empresas oferecerem o plano como benefício.

Primeiro incremento: 07/10/2026. Dados de demonstração são **fictícios**.

![Resumo pessoal](docs/telas/01_resumo_pessoal.png)

## O que existe hoje

| Parte | Onde | Situação |
|---|---|---|
| App (iOS, Android e web, um só código) | `apps/app` | Resumo, Movimentos, Metas, Aprender, Anotar gasto, Composição dos totais, Quem vê estes dados. Dados em memória. |
| Regras financeiras | `packages/core` | Dinheiro em centavos, resumo do mês, validação, proteção contra duplicidade. 23 testes. |
| Banco e permissões | `supabase/migrations` | Pessoas, contextos, família, empresa, licenças, direito ao plano, eventos. Permissões no banco (RLS). Testes de isolamento. |
| Decisões e planejamento | `docs/` | Visão, arquitetura, regras, acessos e roteiro de lançamento. |

## Como rodar

Requer Node 20+.

```bash
cd clarevo
npm install
npm run web        # abre no navegador
npm run app        # abre o Expo; leia o QR code com o app Expo Go no celular
npm test           # regras financeiras
npm run typecheck
npm run test:db    # permissões no banco (requer Postgres local)
```

## Documentação

1. [Visão e decisões](docs/00_VISAO_E_DECISOES.md)
2. [Arquitetura](docs/01_ARQUITETURA.md)
3. [Regras financeiras](docs/02_REGRAS_FINANCEIRAS.md)
4. [Acesso e permissões](docs/03_ACESSO_E_PERMISSOES.md)
5. [Roteiro até o lançamento](docs/04_ROTEIRO_LANCAMENTO.md)
6. [Referências recebidas](docs/referencias/) (instruções v2.1, handoff visual v1.0, pesquisa de mercado)
