# Clarevo · Publicação da versão web

08/10/2026, com a seção "Como voltar atrás" de 15/10/2026. Configurado por Enzo com o Claude no Chrome, a partir do roteiro desta sessão.

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
3. **Migrações novas:** cada migração que entra na `main` precisa ser colada no SQL Editor do Supabase, na ordem dos nomes, antes ou junto da publicação (ver `docs/05_SUPABASE.md`). As migrações até a `20261010000001_cartoes.sql` (0008) já estão no Supabase; a `20261010000002_orcamento.sql` (0009, Ciclo F2) ainda precisa ser colada e conferida (passo 10 e consulta do passo 17 de `docs/05_SUPABASE.md`) antes de o Ciclo F2 entrar na `main`. A `20261010000003_contas.sql` (0010, Ciclo G1, contas de origem do dinheiro) também precisa ser colada e conferida (passo 11 e consulta do passo 18 de `docs/05_SUPABASE.md`) antes de o Ciclo G1 entrar na `main`; depois da publicação, o privilégio antigo de trocar só o nome da conta direto na tabela (`grant update (name)`) pode ser retirado. A `20261011000001_assinaturas.sql` (0011, Ciclo H2, assinaturas) também precisa ser colada e conferida (passo 12 e consulta do passo 19 de `docs/05_SUPABASE.md`) antes de o Ciclo H2 entrar na `main`; ela não muda nenhuma função de antes, então o app publicado antes da 0011 continua funcionando depois dela. A `20261011000002_importar.sql` (0012, Ciclo I1, importar extrato e fatura) também precisa ser colada e conferida (passo 12b e consulta do passo 20 de `docs/05_SUPABASE.md`) antes de o Ciclo I1 entrar na `main`; ela também não muda nenhuma função de antes, então o app publicado antes da 0012 continua funcionando depois dela. A `20261016000001_familia.sql` (0013, Ciclo L, Família) também precisa ser colada e conferida (passo 12c e consulta do passo 21 de `docs/05_SUPABASE.md`) antes de o Ciclo L entrar na `main`; ela recria quatro funções com as mesmas assinaturas e retira a política `memberships_manage` e o `update` direto dos vínculos, que o app nunca usou, então o app publicado antes da 0013 continua funcionando depois dela (só não mostra a tela Família). A 0004 (`20261008000002_contas_do_ano.sql`, Ciclo A3) foi colada em 09/10/2026, antes de o Ciclo A3 entrar na `main`. Em **10/10/2026**, a 0006 (`20261009000002_renda_comprometida.sql`) e a 0007 (`20261009000003_metas.sql`) foram coladas e conferidas: a consulta de conferência deu funções 11, tabelas 5, ações 1, gatilhos 3, regras 3 e permissão verdadeira, e o esquema da API foi recarregado (`notify pgrst, 'reload schema';`). No mesmo dia, o commit `29ccd51` (Ciclos A2, B, C, plano de guardar e D) foi publicado na `main`. Ainda em **10/10/2026**, a 0008 (`20261010000001_cartoes.sql`, cartões, faturas e chave da nota fiscal, Ciclo E, 3172 linhas) foi colada e conferida: funções 11, tabelas 2, visão 1, ações 1 e permissão verdadeira, e o esquema da API foi recarregado. Também em 10/10/2026, a 0009 (`20261010000002_orcamento.sql`, orçamento por categoria e limite pessoal, Ciclo F2, 659 linhas) foi colada e conferida: funções 5, tabelas 2, gatilhos 2, regras 2, ações 41, índice 1 e permissão verdadeira, e o esquema da API foi recarregado. Em 11/10/2026, a 0010 (`20261010000003_contas.sql`, contas de origem do dinheiro, Ciclo G1, 1331 linhas) foi colada e conferida: funções 5, colunas 6, coluna de metas 1, gatilhos 2, índices 2, regras 2, ações 46, contextos sem principal 0, função de apoio 1 e permissão verdadeira, e o esquema da API foi recarregado. Em 11/10/2026, a 0011 (`20261011000001_assinaturas.sql`, assinaturas, Ciclo H2, 386 linhas) foi colada e conferida: funções 2, colunas 3, colunas da visão 3, regra 1, ações 48, assinaturas 0 e permissão verdadeira, e o esquema da API foi recarregado. Em 15/10/2026, a 0012 (`20261011000002_importar.sql`, importar extrato e fatura, Ciclo I1, 453 linhas) foi colada e conferida: funções 1, colunas 2, coluna de operações 1, índices 2, regras 3, ações 49, visão 1, importadas 0 e permissão verdadeira, e o esquema da API foi recarregado. O projeto do Supabase aparece no painel como "enzofishvelasquez-creator's Project", na organização "Clarevo by Enzo Velasquez".

## Como voltar atrás

Serve para quando uma publicação nova da `main` traz um problema e é preciso devolver o app ao que funcionava (CL-20, `docs/12`). Duas coisas voltam de jeitos diferentes: o app (arquivos publicados pela Cloudflare) e o banco (Supabase). O app volta quando se quer; o banco só avança.

### 1. Saber qual versão está no ar

- Cada publicação é identificada pelo **commit da `main`** (no painel da Cloudflare, na lista de implantações, ou em `git log -1 --format=%h main`) e pela **última migração aplicada** no Supabase (a lista de `docs/05`; hoje a 0012, `20261011000002_importar.sql`, colada e conferida em 15/10/2026).
- As notas de cada versão devem citar os dois: "commit abc1234, migração 0012". Assim dá para dizer quais regras de cálculo estavam no ar e para qual versão voltar.
- Antes de qualquer mudança, anote o commit e a migração que estão no ar agora. É o ponto de volta.

### 2. O jeito mais rápido: voltar a implantação na Cloudflare

Não mexe no GitHub nem no banco e leva poucos minutos.

1. No painel da Cloudflare, abra **Workers e Pages** e o projeto (`clarevo` para o app real, `clarevo-demo` para a demonstração).
2. Entre em **Deployments** e ache a última implantação de produção que funcionava (confira o commit anotado).
3. Nessa implantação, abra o menu (os três pontos) e escolha **Rollback to this deployment**. Só as implantações de produção, da `main`, aceitam isso; as de prévia estão desligadas.
4. Abra o endereço, entre com uma conta de teste e confira o Resumo e Movimentos. Na demonstração, outubro deve mostrar Recebido R$ 6.000,00, Pago R$ 3.900,00, Diferença R$ 2.100,00 e Ainda a pagar R$ 650,00.

Atenção: o próximo envio para a `main` publica de novo a versão com o problema. Por isso, assim que o app voltar, corrija ou reverta também a `main` (a seção seguinte).

### 3. Voltar a `main` a uma versão anterior, sem reescrever o histórico

Nunca use `git push --force` na `main`: ela apagaria o histórico que a Cloudflare e as outras pessoas usam. Voltar é um commit novo que desfaz o anterior (`git revert`), passando por uma branch e por revisão.

```bash
git checkout main && git pull
git checkout -b reverter-<assunto>

# Um commit com problema:
git revert --no-edit <commit>
# Um merge (por exemplo, a junção de uma branch): o pai 1 é a main
git revert -m 1 <commit-do-merge>
# Voltar tudo o que veio depois de uma versão boa, em um commit só:
git revert --no-commit <commit-bom>..HEAD && git commit -m "Volta o app à versão <commit-bom>"

npm test && npm run typecheck && npm run test:db && npm run test:api
git push -u origin reverter-<assunto>      # abrir a PR e juntar na main
```

- Com a PR junta na `main`, a Cloudflare publica a versão revertida sozinha (os dois projetos).
- Se houver merges no intervalo, reverta um por vez, cada merge com `-m 1`: o Git recusa um intervalo com merges sem dizer qual pai manter.
- Rode os testes de banco e de API mesmo voltando: eles conferem que o app que volta ainda conversa com o banco que está no ar.

### 4. O banco: as migrações só avançam

- **Voltar o app não exige desfazer migração.** Toda migração é aditiva: cria tabelas, colunas, visões e funções novas e não muda a assinatura de nenhuma função antiga. O app de antes continua funcionando com o banco de depois (cada migração diz isso no cabeçalho, por exemplo a 0011 e a 0012).
- **Nunca apague uma migração já aplicada nem edite uma já colada.** Se a regra do banco estava errada, a correção é uma migração nova, com o número seguinte, colada depois das outras (`docs/05`).
- **Se uma migração falhar no meio**, não cole de novo no escuro e não apague partes à mão. Rode a consulta de conferência do passo dela em `docs/05`: com o resultado esperado, a migração foi aplicada; com tudo zerado, nada foi aplicado e dá para colar de novo; com um resultado entre os dois, ela ficou pela metade. Nesse caso, pare, não publique o app novo, avise quem cuida do projeto e use a cópia de segurança do Supabase (o plano Pro tem cópia; o grátis não tem, e é um dos motivos de `docs/07`, pendência 2, para antes de pessoas reais).
- **Dados não voltam sozinhos.** Reverter o app não desfaz registros que as pessoas já anotaram na versão nova. Como toda exclusão é lógica e cada escrita guarda a chave da operação, nada é perdido, mas desfazer anotações é um pedido à parte.

### 5. Depois de voltar

- Registrar em `docs/00` o que aconteceu e por quê (uma linha) e o commit e a migração que ficaram no ar.
- Abrir a correção em uma branch, com o teste que teria pegado o problema (`docs/12`, CL-20), e só juntar na `main` com `npm test`, `npm run typecheck`, `npm run test:db` e `npm run test:api` passando e, se mexeu em telas, `npm run test:web`.
