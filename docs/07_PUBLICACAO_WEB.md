# Clarevo · Publicação da versão web

08/10/2026. Configurado por Enzo com o Claude no Chrome, a partir do roteiro desta sessão.

## Endereços

| Projeto (Cloudflare Pages) | Endereço | O que mostra |
|---|---|---|
| `clarevo` | https://clarevo.pages.dev | App com login real no projeto Supabase |
| `clarevo-demo` | https://clarevo-demo.pages.dev | Só demonstração, com dados fictícios (para apresentações) |

Os dois são publicados sozinhos a cada atualização da branch `main` do GitHub. Implantações de prévia (outras branches) estão desligadas.

## Configuração dos dois projetos

| Item | `clarevo` | `clarevo-demo` |
|---|---|---|
| Repositório | `enzofishvelasquez-creator/clarevo` (o app do Cloudflare tem acesso só a ele) | o mesmo |
| Branch de produção | `main` | `main` |
| Framework preset | None | None |
| Comando de build | `npm --workspace apps/app run export:web` | `npm --workspace apps/app run export:demo` |
| Pasta publicada | `apps/app/dist` | `apps/app/dist` |
| Variáveis | `NODE_VERSION=22`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_KEY` (chave pública) | só `NODE_VERSION=22` |

- O Cloudflare instala as dependências sozinho a partir do `package-lock.json` da raiz.
- O app web é uma página única (`web.output: "single"`): sem `404.html`, o Cloudflare devolve o `index.html` em qualquer endereço, e o Expo Router abre a tela certa.
- `export:web` e `export:demo` rodam com `--clear`, para o cache do Metro não misturar as variáveis de um build com as de outro.
- A demonstração usa dados fictícios mesmo se alguém configurar o Supabase no projeto `clarevo-demo`: `EXPO_PUBLIC_MODO_DEMO=1` sempre vence (`apps/app/src/state/session.tsx`).
- Node 22 está em manutenção. Quando o Expo recomendar, trocar `NODE_VERSION` para a versão LTS seguinte nos dois projetos.

## Supabase (Authentication → URL Configuration)

- Site URL: `https://clarevo.pages.dev`
- Redirect URLs: `clarevo://**`, `exp://**`, `http://localhost:8081/**` e `https://clarevo.pages.dev/**`
- Antes de publicar nas lojas, retirar `exp://**` (aceita qualquer endereço do Expo e só serve para desenvolvimento).

## Pendências antes de abrir para outras pessoas

1. **Domínio e e-mail próprios:** os modelos de e-mail em português só podem ser editados com SMTP próprio. O envio padrão do Supabase manda poucos e-mails por hora e só para membros da organização. Registrar um domínio do Clarevo, configurar um provedor de e-mail (por exemplo, Resend ou Amazon SES) e então aplicar os textos de `docs/05_SUPABASE.md`.
2. **Plano Pro do Supabase** antes de pessoas reais usarem (o plano grátis pausa o projeto sem uso e não tem cópia de segurança).
3. **Migrações novas:** cada migração que entra na `main` precisa ser colada no SQL Editor do Supabase, na ordem dos nomes, antes ou junto da publicação (ver `docs/05_SUPABASE.md`). As migrações até a `20261010000001_cartoes.sql` (0008) já estão no Supabase; a `20261010000002_orcamento.sql` (0009, Ciclo F2) ainda precisa ser colada e conferida (passo 10 e consulta do passo 15 de `docs/05_SUPABASE.md`) antes de o Ciclo F2 entrar na `main`. A 0004 (`20261008000002_contas_do_ano.sql`, Ciclo A3) foi colada em 09/10/2026, antes de o Ciclo A3 entrar na `main`. Em **10/10/2026**, a 0006 (`20261009000002_renda_comprometida.sql`) e a 0007 (`20261009000003_metas.sql`) foram coladas e conferidas: a consulta de conferência deu funções 11, tabelas 5, ações 1, gatilhos 3, regras 3 e permissão verdadeira, e o esquema da API foi recarregado (`notify pgrst, 'reload schema';`). No mesmo dia, o commit `29ccd51` (Ciclos A2, B, C, plano de guardar e D) foi publicado na `main`. Ainda em **10/10/2026**, a 0008 (`20261010000001_cartoes.sql`, cartões, faturas e chave da nota fiscal, Ciclo E, 3172 linhas) foi colada e conferida: funções 11, tabelas 2, visão 1, ações 1 e permissão verdadeira, e o esquema da API foi recarregado. O projeto do Supabase aparece no painel como "enzofishvelasquez-creator's Project", na organização "Clarevo by Enzo Velasquez".
