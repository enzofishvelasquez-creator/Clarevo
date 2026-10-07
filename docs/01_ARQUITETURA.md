# Arquitetura

07/10/2026 · versão 0.1

## Escolhas e motivo

| Camada | Escolha | Por quê |
|---|---|---|
| App | Expo SDK 57 + React Native + Expo Router | Um código para iOS, Android e web. Publicação nas lojas e atualizações pela nuvem (EAS), sem precisar de Mac para compilar. |
| Fonte e ícones | Manrope (licença OFL) e Lucide (licença ISC) | Recomendados no handoff; uso livre comercial. |
| Regras financeiras | Pacote `@clarevo/core` em TypeScript puro | As mesmas regras rodam no app, nos testes e, depois, no servidor. Testável sem interface. |
| Backend | Supabase: Postgres, autenticação, RLS | Autorização validada no banco em cada acesso, inclusive acesso direto à API. Região São Paulo disponível. Plano gratuito para começar. |
| Testes | Vitest (regras), SQL com Postgres local (permissões), Playwright (fluxo na web) | Cada camada testada onde a falha acontece. |

## Estrutura do repositório

```
clarevo/
  apps/app/            App Expo (telas em src/app, componentes em src/components)
    src/theme/tokens.ts  Cores, espaçamento, tipografia e movimento (CL-V001)
    src/state/finance.tsx  Estado do protótipo (troca para Supabase no próximo passo)
  packages/core/       Regras financeiras e testes
  supabase/
    migrations/        Esquema do banco e permissões
    tests/             Testes de isolamento entre pessoas, famílias e empresas
  docs/                Decisões, regras, acessos, roteiro e referências
```

## Modelo de dados

```
pessoa ──< vínculo >── contexto financeiro (pessoal | família) ──< evento financeiro
   │
   └──< direito ao plano >── licença >── contrato de benefício >── organização ──< administrador
```

- **Pessoa** existe independentemente de qualquer empresa.
- **Contexto** é onde o registro é salvo. Cada pessoa nasce com um contexto Pessoal.
- **Vínculo** guarda as permissões de cada pessoa em cada contexto (ler, anotar, editar registros de outros, administrar).
- **Organização / contrato / licença** controlam vagas e convites empresariais.
- **Direito ao plano** diz de onde vem o acesso (benefício, particular, cortesia). Encerrar não apaga nada.
- **Evento financeiro** é a fonte única: resumo, listas e composição consultam a mesma tabela.

## Próximos passos técnicos

1. Criar projeto Supabase (região São Paulo), aplicar a migração, configurar login por e-mail.
2. Trocar o estado em memória por chamadas ao Supabase, mantendo `@clarevo/core` para cálculos e validação.
3. Fluxo de convite familiar (token com validade, aceite, revogação) e saída voluntária.
4. Configurar EAS (builds de teste para iOS e Android).
5. Integração contínua no GitHub: testes e typecheck em cada envio.
