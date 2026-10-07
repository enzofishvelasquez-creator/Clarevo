# Acesso e permissões

07/10/2026 · implementado em `supabase/migrations/20261007000001_fundacao.sql`. Testes em `supabase/tests/` e `apps/app/test/`.

## Quem pode o quê

| Pessoa | Pessoal próprio | Família (membro) | Pessoal de outra pessoa | Licenças da empresa | Finanças de funcionários |
|---|---|---|---|---|---|
| Titular | ver, anotar, editar, excluir | ver, anotar, editar tudo, revogar membros | não | só a própria | não |
| Membro da família | ver, anotar, editar, excluir | ver, anotar, editar só o que criou | não | só a própria | não |
| Administrador da empresa (RH) | o próprio | o próprio | não | gerencia vagas e licenças | **não** |
| Pessoa sem vínculo, sessão anônima | nada | nada | não | não | não |

- Toda leitura passa por políticas do banco; toda escrita de registro passa pelas funções `create_record`, `update_record` e `delete_record`, que conferem permissão, versão e chave de idempotência.
- A autoria vem da sessão, nunca de um valor enviado pelo app.
- Registro de outra pessoa consultado por ID responde "não encontrado" (não revela que existe).
- Família e convites existem no modelo, mas não têm telas neste ciclo. A tela Família mostra um estado explicativo, sem membros simulados.

## O que foi testado

**Banco (`npm run test:db`, Postgres 16 local com simulação do `auth` do Supabase):**

1. E-mail não confirmado não cria espaço nem vê dados.
2. Espaço pessoal e "Conta principal" criados uma única vez; saldo inicial desconhecido; conta nova sem registros.
3. Familiar vê a família e não vê pessoal, conta, compromissos ou contexto da titular.
4. Familiar não grava no pessoal de outra pessoa, não edita nem exclui por ID, não edita registro alheio sem permissão, não usa conta de outro contexto.
5. Gravação, alteração e exclusão diretas nas tabelas são recusadas (só pelas funções).
6. Ninguém altera as próprias permissões; operações de outras pessoas ficam ocultas.
7. RH vê a licença e nada de finanças, contas, família ou direitos ao plano de outras pessoas.
8. Pessoa externa, sessão vazia e papel anônimo não veem nada nem executam funções.
9. Revogação bloqueia leitura e escrita imediatamente.
10. Fim do benefício mantém conta, histórico e família.
11. Autoria, contexto e tipo do registro são imutáveis.
12. Sequência de aceite, idempotência, versões, mudança de mês e validações (ver Regras financeiras).

**API (`npm run test:api`):** o código do app (`SupabaseRepository`) contra o PostgREST, o mesmo servidor de API usado pelo Supabase, com tokens de pessoas diferentes: sequência de aceite, duplicidade, conflito de versão, validação no banco, acesso por ID, filtro e operação de outra pessoa, gravação direta recusada, sessão anônima.

**Limite:** os testes rodaram fora do Supabase real. Depois de criar o projeto, repetir no ambiente `clarevo-teste`.

## Pendente

- Convite familiar (token com validade e uso único), aceite, saída voluntária.
- Registro auditável de acesso interno (equipe Clarevo).
- Retenção do rastro técnico de exclusões, exportação e exclusão de conta (LGPD).
