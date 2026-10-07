# Arquitetura

07/10/2026 · versão 0.2 (primeiro ciclo)

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
    composicao, quem-ve, conta, explicacao/[tema]
  components/           interface (logo, campos, botões, formulário de registro, estados)
  lib/                  autenticação (Supabase e demonstração), conteúdos de Aprender
  state/                sessão, dados (consultas e gravações), contexto e mês
  theme/                tokens de cor, tipografia, movimento e vetores do logo
packages/core/          regras financeiras, validação, repositório em memória, testes
supabase/
  migrations/           esquema, funções e permissões
  tests/                testes de isolamento e da sequência de aceite
scripts/e2e-web.js      roteiro de verificação na versão web
docs/                   decisões, regras, acessos, Supabase, roteiro, marca, telas
```

## Navegação protegida

- Sem sessão: só as telas de entrada.
- Sessão de recuperação de senha: só "Nova senha".
- Com sessão e sem conta financeira: só "Sua primeira conta".
- Com conta: o app.
- Sessão expirada: volta para Entrar e, depois do login, para a tela onde a pessoa estava.

A navegação organiza a experiência; **quem protege os dados é o banco**.

## Modelo de dados

```
pessoa ──< vínculo (permissões por ação) >── contexto (pessoal | família) ──< conta financeira ──< registro
   │                                                                    └──< compromisso (previsto)
   ├──< operação (chave de idempotência, ação, registro resultante)
   └──< direito ao plano >── licença >── contrato de benefício >── organização ──< administrador
```

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
