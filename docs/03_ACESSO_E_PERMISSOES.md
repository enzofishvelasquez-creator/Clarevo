# Acesso e permissões

08/10/2026 · implementado em `supabase/migrations/20261007000001_fundacao.sql` e `20261007000002_contas_a_pagar.sql`. Testes em `supabase/tests/` e `apps/app/test/`.

## Quem pode o quê

| Pessoa | Pessoal próprio | Família (membro) | Pessoal de outra pessoa | Licenças da empresa | Finanças de funcionários |
|---|---|---|---|---|---|
| Titular | ver, anotar, editar, excluir | ver, anotar, editar tudo, revogar membros | não | só a própria | não |
| Membro da família | ver, anotar, editar, excluir | ver, anotar, editar só o que criou | não | só a própria | não |
| Quem administra a empresa (RH) | o próprio | o próprio | não | gerencia vagas e licenças | **não** |
| Pessoa sem vínculo, sessão anônima | nada | nada | não | não | não |

- Toda leitura passa por políticas do banco; toda escrita de registro passa pelas funções `create_record`, `update_record` e `delete_record`, que conferem permissão, versão e chave de idempotência.
- Contas a pagar só são gravadas por `create_commitment`, `update_commitment`, `delete_commitment`, `pay_commitment` e `undo_commitment_payment`, com as mesmas garantias. `pay_commitment` e `undo_commitment_payment` são as únicas outras funções que gravam registros (o gasto do pagamento). A leitura usa a visão `commitment_items`, que aplica as políticas de quem consulta, e o total "Ainda a pagar" no banco vem de `month_to_pay`, que recusa contexto sem permissão de leitura em vez de devolver zero.
- Contas a pagar seguem as permissões de registro. Quem tem escrita anota; altera, paga e desfaz só o que criou, salvo "editar de outras pessoas". Desfazer também exige permissão sobre o gasto. Excluídas não aparecem.
- A autoria vem da sessão, nunca de um valor enviado pelo app.
- Registro ou conta a pagar de outra pessoa consultado por ID responde "não encontrado" (não revela que existe).
- Família e convites existem no modelo, mas não têm telas neste ciclo. A tela Família mostra um estado explicativo, sem membros simulados. As regras de contas a pagar já valem para a Família no banco, sem tela (P-012).

## O que foi testado

**Banco (`npm run test:db`, Postgres 16 local com simulação do `auth` do Supabase):**

1. E-mail não confirmado não cria espaço nem vê dados.
2. Espaço pessoal e "Conta principal" criados uma única vez; saldo inicial desconhecido; conta nova sem registros.
3. Familiar vê a família e não vê pessoal, conta financeira, contas a pagar ou contexto de quem é titular.
4. Familiar não grava no pessoal de outra pessoa, não edita nem exclui por ID, não edita registro alheio sem permissão, não usa conta de outro contexto.
5. Gravação, alteração e exclusão diretas nas tabelas são recusadas (só pelas funções).
6. Ninguém altera as próprias permissões; operações de outras pessoas ficam ocultas.
7. RH vê a licença e nada de finanças, contas, família ou direitos ao plano de outras pessoas.
8. Pessoa externa, sessão vazia e papel anônimo não veem nada nem executam funções.
9. Revogação bloqueia leitura e escrita imediatamente.
10. Fim do benefício mantém conta, histórico e família.
11. Autoria, contexto e tipo do registro são imutáveis.
12. Repetir uma operação antiga depois da revogação não devolve o registro.
13. Quem é titular não revoga nem altera o próprio vínculo (todo contexto continua com titular).
14. A empresa convida por e-mail e encerra licenças, mas não escolhe quem recebe o benefício nem ativa licença.
15. Totais do mês de um contexto sem permissão são recusados, não aparecem como zero.
16. Fuso horário vem do aparelho no primeiro acesso, é validado e não pode ser trocado pela API.
17. Sequência de aceite, idempotência, versões, mudança de mês e validações (ver Regras financeiras).
18. Contas a pagar: familiar vê as da família e não vê as do pessoal de quem é titular, nem pela visão; não anota no pessoal de outra pessoa; conta a pagar pessoal de outra pessoa responde "não encontrado" ao editar, excluir, pagar ou desfazer.
19. Sem "editar de outras pessoas", membro não edita, exclui, paga nem desfaz a conta a pagar criada por outra pessoa; paga a própria só com conta do mesmo contexto. Quem é titular desfaz o pagamento feito por um membro.
20. RH não vê contas a pagar nem anota ou paga no pessoal de outra pessoa; o papel anônimo não lê a visão nem executa as funções novas; depois da revogação, repetir um pagamento antigo responde "não encontrado" e não é possível anotar.
21. Gravação direta em contas a pagar, na visão e no vínculo entre gasto e conta a pagar é recusada; o total "Ainda a pagar" de contexto sem permissão é recusado.
22. O vínculo é garantido no banco, mesmo para escrita direta do backend: conta paga tem exatamente um gasto vivo e conta em aberto nenhum, inclusive quando o gasto vivo é apagado fisicamente (apagar um gasto já excluído ou o contexto inteiro continua possível); o gasto vinculado é sempre gasto do mesmo contexto; o vínculo não muda; o status "cancelado" fica bloqueado.
23. Lista exata das funções que uma pessoa com sessão pode executar; o papel anônimo não executa nenhuma.
24. Contas a pagar: sequência de aceite, idempotência (mesma chave com outro conteúdo é recusada, mesmo com barra vertical na descrição ou na categoria, e a repetição exata é reconhecida com qualquer formato de data da sessão), versão (inclusive ausente), pagamento atômico, desfazer e janela de vencimento (ver Regras financeiras).

**API (`npm run test:api`):** o código do app (`SupabaseRepository`) contra o PostgREST, o mesmo servidor de API usado pelo Supabase, com tokens de pessoas diferentes: sequência de aceite, duplicidade, conflito de versão, validação no banco, acesso por ID, filtro e operação de outra pessoa, gravação direta recusada, sessão anônima. Em contas a pagar: "Ainda a pagar" igual no core e no banco (`month_to_pay`), pagar, repetir, desfazer, excluir o gasto, conta paga em mês diferente do vencimento listada nos dois meses sem mudar o total, validação no banco, outra pessoa sem acesso por ID, lista, operação ou total, e gravação direta recusada.

**Limite:** os testes rodaram fora do Supabase real (Postgres local com uma simulação do `auth`). Depois de criar o projeto, repetir os fluxos de login e permissão no ambiente `clarevo-teste` pelo app; os scripts de teste locais não devem ser aplicados no Supabase.

## Pendente

- Convite familiar (token com validade e uso único), aceite, saída voluntária.
- Contas a pagar na Família: quem pode marcar como paga uma conta criada por outra pessoa (P-012).
- Registro auditável de acesso interno (equipe Clarevo).
- Retenção do rastro técnico de exclusões, exportação e exclusão de conta (LGPD).
