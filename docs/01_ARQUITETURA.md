# Arquitetura

08/10/2026 · versão 0.4 (primeiro ciclo, contas a pagar e gastos fixos)

## Escolhas (aprovadas)

| Camada | Escolha | Por quê |
|---|---|---|
| App | Expo SDK 57 + React Native + Expo Router | Um código para iOS, Android e web. Publicação e atualizações pela nuvem (EAS), sem precisar de Mac para compilar. |
| Dados no app | TanStack Query | Estados de carregando, erro e nova tentativa; cache limpo ao sair ou trocar de pessoa. |
| Regras financeiras | `@clarevo/core` (TypeScript puro) | As mesmas regras no app e nos testes; o banco repete as validações. |
| Backend | Supabase: Postgres, Auth, RLS | Confirmação de e-mail e recuperação reais; autorização no banco em cada acesso, inclusive por ID. Região São Paulo. |
| Fonte e ícones | Manrope (OFL), Lucide (ISC), Lexend (OFL) no nome do logo | Licenças livres para uso comercial. |
| Testes | Vitest (regras), SQL em Postgres local (permissões), Playwright (fluxos na web) | Cada camada testada onde a falha acontece. |

## Estrutura

```
apps/app/src/
  app/                  telas (Expo Router)
    boas-vindas, criar-conta, confirmar-email, entrar, recuperar-acesso, nova-senha
    primeira-conta, carregando, confirmado
    (tabs)/             Resumo, Movimentações, Metas, Aprender
    registro/novo, registro/[id], registro/[id]/editar
    a-pagar, a-pagar/nova, a-pagar/vencidas, a-pagar/[id], a-pagar/[id]/editar, a-pagar/[id]/pagar
    gastos-fixos, gastos-fixos/novo, gastos-fixos/[id], gastos-fixos/[id]/editar, gastos-fixos/[id]/encerrar
    composicao, quem-ve, conta, explicacao/[tema]
  components/           interface (logo, campos, botões, formulários de registro, conta a pagar, pagamento e gasto fixo, estados)
  lib/                  autenticação (Supabase e demonstração), conteúdos de Aprender
  state/                sessão, dados (consultas e gravações), contexto e mês
  theme/                tokens de cor, tipografia, movimento e vetores do logo
packages/core/          regras financeiras, validação, repositório em memória, testes
supabase/
  migrations/           esquema, funções e permissões (0001 fundação, 0002 contas a pagar, 0003 gastos fixos)
  tests/                testes de isolamento, da sequência de aceite, de contas a pagar e de gastos fixos
scripts/e2e-web.js      roteiro de verificação na versão web
docs/                   decisões, regras, acessos, Supabase, roteiro, marca, telas
```

## Navegação protegida

- Sem sessão: só as telas de entrada.
- Sessão de recuperação de senha: só "Nova senha".
- Com sessão e sem conta financeira: só "Sua primeira conta".
- Com conta: o app.
- Sessão expirada: volta para Entrar e, depois do login da mesma pessoa, para a tela onde ela estava.
- Uma falha momentânea de rede não tira a pessoa da tela em que está (os dados já carregados continuam valendo).

A navegação organiza a experiência; **quem protege os dados é o banco**.

## Modelo de dados

```
pessoa ──< vínculo (permissões por ação) >── contexto (pessoal | família) ──< conta financeira ──< registro
   │                                                                    ├──< conta a pagar (previsto) ── 0 ou 1 gasto vivo que a quitou (registro)
   │                                                                    └──< série (gasto fixo ou parcelamento) ──< vigência
   │                                                                                  └──< ocorrência = conta a pagar com número
   ├──< operação (chave de idempotência, ação, registro, conta a pagar ou série resultante)
   └──< direito ao plano >── licença >── contrato de benefício >── organização ──< administrador
```

**Contas a pagar** (`commitments`) são origem separada dos registros realizados e nunca entram em Recebido, Pago ou Diferença.

- **Vínculo:** ao marcar como paga, `pay_commitment` cria um gasto com `financial_records.commitment_id` apontando para a conta a pagar. A chave estrangeira é composta com o contexto (mesmo contexto garantido), o gasto é sempre `despesa`, há no máximo um gasto vivo por conta a pagar e o vínculo nunca muda.
- **Leitura:** a visão `commitment_items` junta a conta a pagar e o gasto vivo que a quitou (`paid_record_id`, `paid_on`, `paid_amount_cents`, `paid_account_id`). Ela usa `security_invoker`, então a RLS de quem consulta vale nas duas tabelas. Os dados do pagamento não são copiados para a conta a pagar: vêm sempre do gasto. A lista de um mês (`listCommitments`) traz as contas com vencimento no mês, as pagas com data do pagamento no mês (`paid_on`, qualquer que seja o vencimento) e as em aberto de outros meses; excluídas nunca vêm.
- **Coerência:** uma restrição adiada confere, no fim de cada transação, que conta paga tem exatamente um gasto vivo vinculado e conta em aberto nenhum. Ela dispara ao gravar a conta a pagar, ao gravar um gasto vinculado e ao apagar fisicamente um gasto vinculado; se a conta a pagar foi apagada na mesma transação (contexto inteiro), não há o que conferir.
- **Repetição:** as funções de contas a pagar guardam o hash dos argumentos codificados em JSON (`jsonb_build_array`), sem ambiguidade entre campos de texto e com datas em ISO; as funções de registro mantêm o formato da 0001.
- **"Ainda a pagar":** calculado por `summarizeToPay` no core e repetido no banco por `month_to_pay`; o teste de API compara os dois.

**Gastos fixos e parcelamentos** (migração `20261008000001_gastos_fixos.sql`, D-024) são séries que criam contas a pagar comuns, uma por mês.

- **Tabelas:** `commitment_series` guarda a série (tipo `mensal` ou `parcelada`, natureza `conta`, `financiamento`, `compra_parcelada` ou `outro_parcelamento`, primeiro mês, primeiro e último número, total de parcelas, autoria, versão e exclusão lógica). `series_terms` guarda as vigências (descrição, categoria, valor, modo `fixo` ou `variavel` e dia do vencimento, a partir de um número); uma vigência nunca é editada, só substituída (`superseded_at`, `superseded_by`). Série, vigências e ocorrências ficam no mesmo contexto por chaves estrangeiras compostas; apagar o contexto inteiro apaga tudo em cascata.
- **Ocorrências:** `commitments` ganhou `series_id`, `occurrence_number`, `series_override` (alterada só neste mês), `series_skipped` (excluída só neste mês, nunca volta) e `amount_is_estimate`. Um índice único parcial garante no máximo uma ocorrência viva por série e número; excluídas não bloqueiam a recriação ao retomar uma série encerrada. Pagar, desfazer e "Ainda a pagar" são os de contas a pagar, sem mudança.
- **Operações:** `record_operations.target_id` identifica a série nas ações `criar_serie`, `alterar_serie`, `encerrar_serie` e `excluir_serie` (só nelas, com `record_id` e `commitment_id` nulos). O app usa a coluna para reconciliar uma gravação de resultado incerto.
- **Leitura:** `commitment_items` ganhou no fim `series_id`, `occurrence_number`, `series_override`, `amount_is_estimate` e, pela junção com a série, `series_kind`, `series_nature` e `series_installment_total`; nada da série é copiado para a conta a pagar. A visão nova `series_items` traz as séries não excluídas com as vigências vivas, os números pulados, as contagens de pagas e em aberto e `generating` (quem criou ainda pode gravar no contexto). Ela não usa `security_invoker`, porque precisa ler as ocorrências excluídas só neste mês, que a RLS esconde; por isso filtra a permissão de leitura de forma explícita e é `security_barrier`, para que um filtro de quem consulta não rode antes da permissão. O consultor de segurança do Supabase pode apontá-la como visão com privilégios de quem a criou: é intencional.
- **Geração:** `clarevo_materialize_series` cria as ocorrências do mês anterior ao seguinte a hoje (no máximo três números por série, qualquer que seja a idade dela), com a vigência de cada número, a autoria de quem criou a série e nada se essa pessoa perdeu a escrita. Ela roda dentro de `create_series`, `update_series_from` e `end_series` e em `sync_series_occurrences`, que o app chama uma vez por dia e contexto (consulta `['seriesSync', contexto, dia]`) antes de mostrar a lista de contas a pagar; se a geração falha, a lista inteira mostra erro, nunca um total parcial. O core repete a regra em `occurrencesToMaterialize`, e o teste de API compara os dois.
- **Coerência:** gatilhos de proteção mantêm imutáveis o vínculo da ocorrência (série e número), a forma e o início da série e o conteúdo das vigências; conta paga não muda nem perde a marca de estimado. Uma restrição adiada confere no fim de cada transação que série excluída não tem ocorrência viva, que toda ocorrência viva fica entre o primeiro e o último número e com vencimento no mês dela e que existe vigência viva no primeiro número e nenhuma antes. Ordem de travas: série, contas a pagar por número crescente, registro.
- **Conjunto afetado:** "esta e as próximas", encerrar e excluir recebem a lista `[{id, version}]` das contas que a pessoa confirmou e a comparam com a atual como conjunto, depois de travar as contas; qualquer diferença é recusada como versão desatualizada. No core, `affectedByEditFrom`, `affectedByEnd` e `affectedByDelete` montam essa lista a partir de `listSeriesOccurrences` (até 60 ocorrências, por número decrescente).

## Como executar

```bash
npm install
npm run web          # navegador (demonstração se não houver .env)
npm run app          # Expo Go no celular (QR code)
npm test             # regras financeiras
npm run typecheck
npm run test:db      # banco (Postgres local)
npm run test:api     # app contra a API (PostgREST)
npm run test:web     # fluxos completos na versão web
```

Para dados reais: `docs/05_SUPABASE.md`.
