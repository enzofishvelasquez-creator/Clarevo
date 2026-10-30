# Metas com imagem (D-077)

30/10/2026. Cada meta mostra uma imagem, na lista de metas e no alto da tela da meta.

## 1. O que a pessoa vê e faz

- **Sem escolher nada**, a meta mostra a imagem sugerida pelo nome: "Viagem para a Grécia" mostra a praia, "Troca do carro" o carro, "Entrada do imóvel" a casa. A reserva para imprevistos mostra sempre o porquinho. Sem pista no nome, aparece a trilha na montanha ("Objetivo"). A sugestão muda sozinha se o nome da meta mudar.
- **Para trocar**: na meta, "Mais ações", depois "Trocar imagem". A tela mostra a imagem atual e:
  - **Sugeridas**: a "Automática" (a do nome) e as 12 sugestões (Viagem, Porquinho, Carro, Casa, Estudos, Casamento, Bebê, Tecnologia, Saúde, Futuro, Pet e Objetivo);
  - **Sua foto**: "Escolher uma foto" abre a galeria do celular (o seletor do sistema; só a foto escolhida chega ao app). O app recorta em 16:9 quando o aparelho oferece, reduz o lado maior para 1080 px em JPEG e manda (até 300 KB). Com foto, aparecem "Escolher outra foto" e "Tirar a foto".
- Na Família, todas as pessoas do espaço veem a imagem; trocar segue a mesma regra de editar a meta (quem só vê não troca).

Palavras que puxam cada sugestão: `packages/core/src/goal-images.ts` (`GOAL_IMAGES`), testadas em `packages/core/test/goal-images.test.ts`.

## 2. Fotos sugeridas

Nas telas, a sugestão da reserva se chama "Porquinho", nunca "cofrinho" nem "caixinha": são nomes de produtos de bancos, e a Clarevo não usa nomes de produtos financeiros (o roteiro de telas recusa essas palavras).

As sugestões serão fotos com licença livre (Unsplash: uso gratuito, inclusive comercial, sem exigir crédito; damos o crédito aqui mesmo assim). Enquanto a foto de uma sugestão não está no app, ela aparece como o ícone do tema sobre o azul da marca (avião, porquinho, carro, casa e assim por diante), o que já funciona hoje.

Para baixar as fotos, o ambiente da equipe precisa liberar `unsplash.com` e `images.unsplash.com` (configuração de rede do ambiente). Cada foto entra em `apps/app/assets/metas/<chave>.jpg` (lado maior de 1080 px, cerca de 100 KB) e em `apps/app/src/lib/goal-image-assets.ts`.

| Sugestão | Foto | Autoria e link |
|---|---|---|
| Viagem | Praia de água azul com casas brancas | a definir |
| Porquinho | Porquinho de guardar moedas | a definir |
| Carro | Carro na estrada | a definir |
| Casa | Fachada de uma casa com jardim | a definir |
| Estudos | Livros abertos sobre uma mesa | a definir |
| Casamento | Duas alianças | a definir |
| Bebê | Sapatinhos de bebê | a definir |
| Tecnologia | Notebook e celular sobre uma mesa | a definir |
| Saúde | Tênis de corrida e garrafa de água | a definir |
| Futuro | Nascer do sol sobre o mar | a definir |
| Pet | Cachorro olhando para a câmera | a definir |
| Objetivo | Trilha subindo uma montanha | a definir |

## 3. Onde a foto da pessoa fica

Decisão de Enzo (30/10/2026): **guardada na Clarevo**, para aparecer em todos os aparelhos e na Família.

- Fica no próprio banco (tabela `goal_images`, migração 0021), não num serviço de arquivos à parte, para seguir as mesmas regras de permissão e de exclusão de todo o resto: quem lê o espaço lê a foto; ela sai quando a pessoa troca a imagem, exclui a meta ou exclui a conta (o espaço apagado leva a meta e a foto junto).
- O banco confere o tipo pelos primeiros bytes (JPEG, PNG ou WebP) e o tamanho (até 300 KB), não confia no que o app diz.
- Custo: nenhum serviço novo. Cada foto ocupa até 300 KB do banco; mil metas com foto somam até cerca de 300 MB, dentro do plano Pro do Supabase (8 GB de banco incluídos). O plano gratuito tem 500 MB, que bastam para o piloto.
- Privacidade: a política (seção 3.2) ganhou um parágrafo, e a pergunta 43 do resumo para o advogado trata de fotos com terceiros e crianças.

## 4. Como está montado

| Parte | Onde |
|---|---|
| Catálogo, sugestão pelo nome, conferência da foto | `packages/core/src/goal-images.ts` |
| Banco | `supabase/migrations/20261030000002_metas_imagem.sql` (0021): `goal_images`, `set_goal_image` (escrever), `goal_photo` (ler a foto), gatilho que apaga a imagem com a meta. Testes em `supabase/tests/99y_metas_imagem.sql` |
| App | `apps/app/src/components/goal-image.tsx` (a imagem), `apps/app/src/app/meta/[id]/imagem.tsx` (a tela), `apps/app/src/lib/goal-photo.ts` (galeria e redução com `expo-image-picker` e `expo-image-manipulator`) |
| Ponta a ponta | `apps/app/test/goal-images-api.int.test.ts` (`npm run test:api`) |

Os pacotes `expo-image-picker` e `expo-image-manipulator` têm parte nativa: o app das lojas precisa de um build novo (EAS) para ter a galeria; no app da web já funciona.
