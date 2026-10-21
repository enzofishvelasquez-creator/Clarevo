Rascunho preparado pela equipe do Clarevo para revisão jurídica. Não é parecer jurídico.

# Ciclo Jurídico (D-064): rascunhos para revisão

21/10/2026. Esta pasta reúne os rascunhos dos textos legais do Clarevo. A ideia é que a revisão jurídica parta de textos fiéis ao que o app faz, e que quem revisa corrija e responda perguntas objetivas, em vez de escrever do zero.

Os textos foram escritos a partir do código e das decisões do produto (`docs/00_VISAO_E_DECISOES.md`), não da memória. Onde um documento diverge do código, valeu o código, e a divergência está em `resumo-para-advogado.md`. Ninguém aqui é advogado: tudo o que não está decidido ficou como `[A DEFINIR: ...]`.

## O que é cada arquivo

| Arquivo | O que é | Vai para o site? |
|---|---|---|
| `resumo-para-advogado.md` | Comece por ele. Até 4 páginas: o produto, o mapa de dados, os serviços de terceiros, o que já está decidido, 17 perguntas com a nossa proposta, o escopo pedido e as referências | Não |
| `politica-de-privacidade.md` | Política de Privacidade, em linguagem simples | Sim |
| `termos-de-uso.md` | Termos de Uso | Sim |
| `exclusao-de-conta.md` | Página pública de exclusão de conta e dos dados, exigida pelo Google Play | Sim |
| `empresas-pontos-do-contrato.md` | Cláusulas essenciais para a minuta com as empresas, cada uma com texto proposto curto. Não é contrato completo | Não |

## O que a pessoa que revisa precisa fazer

1. Ler `resumo-para-advogado.md` e responder as 17 perguntas da seção e: confirmar a nossa proposta ou corrigir.
2. Revisar os 4 textos: política, termos, página de exclusão e pontos do contrato. Corrigir a redação e resolver cada `[A DEFINIR]` de natureza jurídica.
3. Devolver os textos corrigidos e as respostas. Os `[A DEFINIR]` de produto (por exemplo, aceite no cadastro) viram trabalho nosso, e a pessoa que revisa indica quais são.

O que não precisa: escrever do zero, redigir o contrato completo, revisar código nem preencher as declarações das lojas (escopo detalhado na seção f do resumo).

## Convenções dos textos

- Todo arquivo começa com a frase "Rascunho preparado pela equipe do Clarevo para revisão jurídica. Não é parecer jurídico." Essa frase sai quando o texto for aprovado.
- Dados da empresa aparecem como marcadores fixos: `[RAZÃO SOCIAL]`, `[CNPJ]`, `[ENDEREÇO]`, `[E-MAIL DE PRIVACIDADE]`, `[E-MAIL DE SUPORTE]`, `[DOMÍNIO]` e `[DATA DE VIGÊNCIA]`. Eles são trocados todos de uma vez, quando a empresa e o domínio existirem (P-006).
- `[A DEFINIR: ...]` marca o que não está decidido. Cada um ou é pergunta do resumo ou é uma pendência de produto.
- Os textos usam português do Brasil, linguagem neutra de gênero e frases curtas. Eles não prometem nada que o app não faça. Não há nome de pessoa real nem valor em reais.

## Como os textos viram páginas do site

O script `scripts/gerar-site.js` (feito em paralelo por outro agente) lê `politica-de-privacidade.md`, `termos-de-uso.md` e `exclusao-de-conta.md` e gera as páginas públicas do site. O resumo, o LEIAME e os pontos do contrato não vão ao site.

Para a geração ser segura, o texto aprovado precisa passar por esta checagem: sem a frase de rascunho, sem nenhum marcador `[A DEFINIR: ...]`, e sem nenhum dos sete marcadores fixos acima. A recomendação é que o script se recuse a gerar a versão de produção se encontrar qualquer um deles, e gere só uma versão de prévia, claramente marcada como rascunho, para a revisão. Este arquivo não controla o script: a regra fica documentada aqui para quem o mantiver.

## Regra: nada vai ao ar antes da revisão

Nenhum destes textos é publicado, enviado às lojas ou ligado dentro do app antes da revisão jurídica e da aprovação de Enzo. Isso vale para:

- as páginas do site e as URLs de política, termos e exclusão que as lojas pedem (`docs/lojas/ficha.md`, seção 8);
- o acesso à política dentro do app (Apple, App Review Guidelines 5.1.1(i));
- qualquer mudança no texto da tela "Quem vê estes dados?" e da tela de exclusão de conta que dependa da revisão (D-058).

## Quando o produto mudar, os textos mudam

Os textos descrevem o que o app faz hoje. Se uma destas coisas mudar, atualize o texto junto, e registre a mudança em `docs/00_VISAO_E_DECISOES.md`:

- o que é guardado, ou por quanto tempo (tabelas, `persons`, `record_operations`, rastro técnico, P-010);
- a exclusão de conta (`delete_my_account`, `packages/core/src/deletion.ts`);
- o que a empresa vê (`organization_usage`, `licenses`, `packages/core/src/company.ts`);
- Família: papéis, convites e o que fica de quem sai (`packages/core/src/family.ts`);
- um serviço novo de terceiros (por exemplo Sentry ou provedor de e-mail, `docs/20_SENTRY_E_EMAIL.md`), o widget ligado (`docs/21_WIDGET_NATIVO.md`) ou cobrança (P-005);
- as declarações das lojas (`docs/lojas/privacidade.md`): os textos novos não podem contradizê-las.

## Verificação feita

Em 21/10/2026, sobre `docs/legal/*.md`: nenhum travessão (U+2013 ou U+2014) e nenhuma ocorrência da expressão proibida em `CLAUDE.md`. `npm test` e `npm run typecheck` também passaram com esta pasta presente.
