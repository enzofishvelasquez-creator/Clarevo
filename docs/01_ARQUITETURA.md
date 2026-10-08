# Arquitetura

08/10/2026 · versão 0.3 (primeiro ciclo e contas a pagar)

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
    a-pagar, a-pagar/nova, a-pagar/[id], a-pagar/[id]/editar, a-pagar/[id]/pagar
    composicao, quem-ve, conta, explicacao/[tema]
  components/           interface (logo, campos, botões, formulários de registro, conta a pagar e pagamento, estados)
  lib/                  autenticação (Supabase e demonstração), conteúdos de Aprender
  state/                sessão, dados (consultas e gravações), contexto e mês
  theme/                tokens de cor, tipografia, movimento e vetores do logo
packages/core/          regras financeiras, validação, repositório em memória, testes
supabase/
  migrations/           esquema, funções e permissões (0001 fundação, 0002 contas a pagar)
  tests/                testes de isolamento, da sequência de aceite e de contas a pagar
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
   │                                                                    └──< conta a pagar (previsto) ── 0 ou 1 gasto vivo que a quitou (registro)
   ├──< operação (chave de idempotência, ação, registro e/ou conta a pagar resultante)
   └──< direito ao plano >── licença >── contrato de benefício >── organização ──< administrador
```

**Contas a pagar** (`commitments`) são origem separada dos registros realizados e nunca entram em Recebido, Pago ou Diferença.

- **Vínculo:** ao marcar como paga, `pay_commitment` cria um gasto com `financial_records.commitment_id` apontando para a conta a pagar. A chave estrangeira é composta com o contexto (mesmo contexto garantido), o gasto é sempre `despesa`, há no máximo um gasto vivo por conta a pagar e o vínculo nunca muda.
- **Leitura:** a visão `commitment_items` junta a conta a pagar e o gasto vivo que a quitou (`paid_record_id`, `paid_on`, `paid_amount_cents`, `paid_account_id`). Ela usa `security_invoker`, então a RLS de quem consulta vale nas duas tabelas. Os dados do pagamento não são copiados para a conta a pagar: vêm sempre do gasto. A lista de um mês (`listCommitments`) traz as contas com vencimento no mês, as pagas com data do pagamento no mês (`paid_on`, qualquer que seja o vencimento) e as em aberto de outros meses; excluídas nunca vêm.
- **Coerência:** uma restrição adiada confere, no fim de cada transação, que conta paga tem exatamente um gasto vivo vinculado e conta em aberto nenhum. Ela dispara ao gravar a conta a pagar, ao gravar um gasto vinculado e ao apagar fisicamente um gasto vinculado; se a conta a pagar foi apagada na mesma transação (contexto inteiro), não há o que conferir.
- **Repetição:** as funções de contas a pagar guardam o hash dos argumentos codificados em JSON (`jsonb_build_array`), sem ambiguidade entre campos de texto e com datas em ISO; as funções de registro mantêm o formato da 0001.
- **"Ainda a pagar":** calculado por `summarizeToPay` no core e repetido no banco por `month_to_pay`; o teste de API compara os dois.

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
