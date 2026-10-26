Rascunho preparado pela equipe da Clarevo para revisão jurídica. Não é parecer jurídico.

# Ciclo Jurídico (D-064): rascunhos para revisão

21/10/2026. Esta pasta reúne os rascunhos dos textos legais da Clarevo. A ideia é que a revisão jurídica parta de textos fiéis ao que o app faz, e que quem revisa corrija e responda perguntas objetivas, em vez de escrever do zero.

Os textos foram escritos a partir do código e das decisões do produto (`docs/00_VISAO_E_DECISOES.md`), não da memória. Onde um documento diverge do código, valeu o código, e a divergência está em `resumo-para-advogado.md`. Ninguém aqui é advogado: tudo o que não está decidido ficou como `[A DEFINIR: ...]`.

## O que é cada arquivo

| Arquivo | O que é | Vai para o site? |
|---|---|---|
| `resumo-para-advogado.md` | Comece por ele. Até 4 páginas: o produto, o mapa de dados, os serviços de terceiros, o que já está decidido, 25 perguntas com a nossa proposta (mais as da seção h, sobre o site da segunda etapa, D-066, a da seção i, sobre a pergunta de origem, D-067, e a da seção j, sobre a NR-1 em Para empresas, D-068), o escopo pedido e as referências | Não |
| `politica-de-privacidade.md` | Política de Privacidade, em linguagem simples | Sim |
| `termos-de-uso.md` | Termos de Uso | Sim |
| `exclusao-de-conta.md` | Página pública de exclusão de conta e dos dados, exigida pelo Google Play | Sim |
| `empresas-pontos-do-contrato.md` | Cláusulas essenciais para a minuta com as empresas, cada uma com texto proposto curto. Não é contrato completo | Não |
| `contrato-empresas-minuta.md` | Minuta completa do contrato com empresas privadas (26/10/2026), que desenvolve os pontos acima, com o Anexo I de cada contrato | Não |
| `plano-de-trabalho-piloto.md` | Rascunho do plano de trabalho do acordo de cooperação técnica para o piloto de 90 dias com órgão público, sem repasse de recursos (26/10/2026) | Não |

## O que a pessoa que revisa precisa fazer

1. Ler `resumo-para-advogado.md` e responder as 25 perguntas da seção e e as das seções h, i e j (da 26 à 35): confirmar a nossa proposta ou corrigir.
2. Revisar os 4 textos: política, termos, página de exclusão e pontos do contrato. Corrigir a redação e resolver cada `[A DEFINIR]` de natureza jurídica.
3. Devolver os textos corrigidos e as respostas. Os `[A DEFINIR]` de produto (por exemplo, aceite no cadastro) viram trabalho nosso, e a pessoa que revisa indica quais são.

O que não precisa: escrever do zero, redigir o contrato completo, revisar código nem preencher as declarações das lojas (escopo detalhado na seção f do resumo).

## Convenções dos textos

- Todo arquivo começa com a frase "Rascunho preparado pela equipe da Clarevo para revisão jurídica. Não é parecer jurídico." Essa frase sai quando o texto for aprovado.
- Dados da empresa aparecem como marcadores fixos: `[RAZÃO SOCIAL]`, `[CNPJ]`, `[ENDEREÇO]`, `[E-MAIL DE PRIVACIDADE]`, `[E-MAIL DE SUPORTE]`, `[DOMÍNIO]` e `[DATA DE VIGÊNCIA]`. Eles são trocados todos de uma vez, quando a empresa e o domínio existirem (P-006).
- `[A DEFINIR: ...]` marca o que não está decidido. Cada um ou é pergunta do resumo ou é uma pendência de produto.
- `[PROPOSTA: ...]` marca o que a equipe propõe e ainda não tem confirmação jurídica (por exemplo, as bases legais da política). Some quando o texto é aprovado. Texto corrido que diga "Proposta:" ou "proposta, ainda sem confirmação" também não vai ao ar: use a marca ou resolva o trecho.
- Os textos usam português do Brasil, linguagem neutra de gênero e frases curtas. Eles não prometem nada que o app não faça. Não há nome de pessoa real nem valor em reais.

## Como os textos viram páginas do site

O script `scripts/gerar-site.js` (feito em paralelo por outro agente) lê `politica-de-privacidade.md`, `termos-de-uso.md` e `exclusao-de-conta.md` e gera as páginas públicas do site. O resumo, o LEIAME, os pontos do contrato, a minuta e o plano de trabalho não vão ao site.

Para a geração ser segura, o texto aprovado precisa passar por esta checagem, e o script a faz: `node scripts/gerar-site.js --final` recusa (código 1, com a lista por página) a versão de produção se encontrar a frase de rascunho, qualquer `[A DEFINIR: ...]` ou `[PROPOSTA: ...]`, texto de proposta ("Proposta:", "proposta, ainda sem confirmação"), qualquer um dos sete marcadores fixos sem valor em `site/dados-da-empresa.json`, travessão, a expressão proibida, título fora de ordem ou link interno quebrado. Sem `--final`, o script gera só a versão de prévia, claramente marcada como rascunho (faixa "Versão preliminar, em revisão" e `noindex`), e esses pontos viram avisos. O teste `packages/core/test/site.test.ts` confere cada um desses casos.

## Regra: nada vai ao ar antes da revisão

Nenhum destes textos é publicado, enviado às lojas ou ligado dentro do app antes da revisão jurídica e da aprovação de Enzo. Isso vale para:

- as páginas do site e as URLs de política, termos e exclusão que as lojas pedem (`docs/lojas/ficha.md`, seção 8);
- o acesso à política dentro do app (Apple, App Review Guidelines 5.1.1(i)): o código já tem os links (cadastro e Conta), mas eles só aparecem quando `EXPO_PUBLIC_SITE_URL` aponta para o site publicado, e a variável só se configura depois da revisão (`docs/07` e `docs/16`);
- qualquer mudança no texto da tela "Quem vê estes dados?" e da tela de exclusão de conta que dependa da revisão (D-058). O app já traz, sem publicar, a redação proposta sobre a equipe da Clarevo; se o advogado mudar a regra, o ajuste é pequeno.

## Quando o produto mudar, os textos mudam

Os textos descrevem o que o app faz hoje. Se uma destas coisas mudar, atualize o texto junto, e registre a mudança em `docs/00_VISAO_E_DECISOES.md`:

- o que é guardado, ou por quanto tempo (tabelas, `persons`, `record_operations`, rastro técnico, P-010);
- a exclusão de conta (`delete_my_account`, `packages/core/src/deletion.ts`);
- o que a empresa vê (`organization_usage`, `licenses`, `packages/core/src/company.ts`);
- Família: papéis, convites e o que fica de quem sai (`packages/core/src/family.ts`);
- um serviço novo de terceiros (por exemplo Sentry ou provedor de e-mail, `docs/20_SENTRY_E_EMAIL.md`), o widget ligado (`docs/21_WIDGET_NATIVO.md`) ou cobrança (P-005);
- o texto do cadastro, a seção "Privacidade e termos" de Conta e as frases sobre a equipe da Clarevo em "Quem vê estes dados?" (`packages/core/src/legal.ts`, `apps/app/src/lib/site.ts`): são a redação proposta na política e dependem das perguntas 14 e 25 do resumo;
- o formulário de contato e as Novidades por e-mail do site, se forem ligados (D-066, seções 3.6 e 3.7 da política, `site/dados-da-empresa.json` e `docs/22_SITE.md`): quem liga um formulário confere antes se o texto da política vale;
- as declarações das lojas (`docs/lojas/privacidade.md`): os textos novos não podem contradizê-las.

## Verificação feita

Em 21/10/2026, depois das correções da revisão (D-064), sobre `docs/legal/*.md`: nenhum travessão (U+2013 ou U+2014) e nenhuma ocorrência da expressão proibida em `CLAUDE.md`. As afirmações sobre exclusão, aparelho, empresa e exportação foram conferidas de novo no código (`supabase/migrations`, `apps/app/src`, `packages/core/src`). Dois pontos ficaram "a conferir" porque a rede deste ambiente não abriu as páginas dos fornecedores: a lista de suboperadores do Supabase (a Cloudflare na frente do banco, pergunta 19) e o prazo dos registros de acesso do Supabase (pergunta 4).
