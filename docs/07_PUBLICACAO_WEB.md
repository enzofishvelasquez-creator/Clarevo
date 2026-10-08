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
3. **Migrações novas:** cada migração que entra na `main` precisa ser colada no SQL Editor do Supabase, na ordem dos nomes, antes ou junto da publicação (ver `docs/05_SUPABASE.md`). Em 08/10/2026, `20261008000002_contas_do_ano.sql` (Ciclo A3, contas do ano) ainda não tinha sido colada no Supabase do `clarevo`: colar antes de o Ciclo A3 entrar na `main`.
