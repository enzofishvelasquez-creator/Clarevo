# Acesso e permissões

07/10/2026 · implementado em `supabase/migrations/20261007000001_fundacao.sql`, testado em `supabase/tests/10_isolamento.sql`.

## Quem pode o quê

| Pessoa | Pessoal próprio | Família (membro) | Pessoal de outro | Licenças da empresa | Finanças de funcionários |
|---|---|---|---|---|---|
| Titular | ver, anotar, editar | ver, anotar, editar tudo, convidar, revogar | não | só a própria | não |
| Membro da família | ver, anotar, editar | ver, anotar, editar só o que criou | não | só a própria | não |
| Administrador da empresa (RH) | o próprio | o próprio | não | gerencia vagas e licenças | **não** |
| Pessoa sem vínculo | o próprio | não | não | não | não |

A verificação acontece no banco em cada leitura e escrita. Esconder botões no app não é a proteção.

## Casos testados (todos passaram em 07/10/2026, Postgres 16 local)

1. Cada pessoa recebe um contexto Pessoal ao ser criada.
2. Envio duplicado recusado pelo banco.
3. "Confirmado" sem data de pagamento recusado.
4. Familiar vê a família, não vê o Pessoal do titular.
5. Familiar não consegue gravar no Pessoal de outra pessoa (acesso direto).
6. Ninguém grava em nome de outra pessoa.
7. Familiar sem permissão não edita registro alheio.
8. Ninguém apaga fisicamente eventos.
9. Familiar não altera as próprias permissões.
10. RH vê a licença, não vê eventos, contextos, composição familiar nem direitos ao plano de outros.
11. Pessoa externa e sessão anônima não veem nada.
12. Revogação bloqueia leitura e escrita imediatamente.
13. Fim do benefício mantém conta, histórico e família.
14. Autoria de um evento não pode ser alterada.

Limite: testes rodaram em Postgres comum com uma simulação mínima do `auth` do Supabase. Repetir no projeto Supabase real quando criado.

## Pendente

- Fluxo de convite familiar (função de aceite com token, validade e uso único).
- Saída voluntária da família.
- Registro auditável de acesso interno (equipe Clarevo).
- Política de retenção, exportação e exclusão de conta (LGPD).
