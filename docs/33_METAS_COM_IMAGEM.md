# Metas com imagem (D-077)

30/10/2026. Cada meta mostra uma imagem, na lista de metas e no alto da tela da meta.

## 1. O que a pessoa vê e faz

- **Sem escolher nada**, a meta mostra a imagem sugerida pelo nome: "Viagem para a Grécia" mostra as casas brancas diante do mar, "Troca do carro" o carro, "Entrada do imóvel" a casa. A reserva para imprevistos mostra sempre o porquinho. Sem pista no nome, aparece a trilha na montanha ("Objetivo"). A sugestão muda sozinha se o nome da meta mudar.
- **Para trocar**: na meta, "Mais ações", depois "Trocar imagem". A tela mostra a imagem atual e:
  - **Sugeridas**: a "Automática" (a do nome) e as 12 sugestões (Viagem, Porquinho, Carro, Casa, Estudos, Casamento, Bebê, Tecnologia, Saúde, Futuro, Pet e Objetivo);
  - **Sua foto**: "Escolher uma foto" abre a galeria do celular (o seletor do sistema; só a foto escolhida chega ao app). O app recorta em 16:9 quando o aparelho oferece, reduz o lado maior para 1080 px em JPEG e manda (até 300 KB). Com foto, aparecem "Escolher outra foto" e "Tirar a foto".
- Na Família, todas as pessoas do espaço veem a imagem; trocar segue a mesma regra de editar a meta (quem só vê não troca).

Palavras que puxam cada sugestão: `packages/core/src/goal-images.ts` (`GOAL_IMAGES`), testadas em `packages/core/test/goal-images.test.ts`.

## 2. Fotos sugeridas

Nas telas, a sugestão da reserva se chama "Porquinho", nunca "cofrinho" nem "caixinha": são nomes de produtos de bancos, e a Clarevo não usa nomes de produtos financeiros (o roteiro de telas recusa essas palavras).

As sugestões são fotos da Unsplash com uso gratuito (Licença Unsplash: uso livre, inclusive comercial, sem exigir crédito; damos o crédito aqui mesmo assim). Escolhidas em 31/10/2026 com o filtro "Grátis" (nenhuma do Unsplash+), conferindo na página de cada uma "Uso gratuito sob a Licença da Unsplash", sem rosto de pessoa em destaque e sem marca ou texto legível no tamanho do app.

Cada foto está em `apps/app/assets/metas/<chave>.jpg` (recortada em 16:9 pelo centro, 1080 x 608 px, de 56 a 152 KB; 1,35 MB as 12) e em `apps/app/src/lib/goal-image-assets.ts`. Baixadas de `images.unsplash.com`. Sugestão sem foto no app aparece como o ícone do tema sobre o azul da marca (avião, porquinho, carro e assim por diante).

| Sugestão | Foto | Autoria e link |
|---|---|---|
| Viagem | Casas brancas e cúpulas azuis diante do mar (Santorini, Grécia) | Wojciech Wyszkowski, [unsplash.com/photos/64nCpuzkgVY](https://unsplash.com/photos/64nCpuzkgVY) |
| Porquinho | Porquinho de guardar moedas | Braňo, [unsplash.com/photos/heYdDdq0cbE](https://unsplash.com/photos/heYdDdq0cbE) |
| Carro | Carro na estrada, visto de cima | Hyundai Motor Group, [unsplash.com/photos/Ax5hexSdvCg](https://unsplash.com/photos/Ax5hexSdvCg) |
| Casa | Fachada de uma casa com jardim | QY Liu, [unsplash.com/photos/RykkS_DVhPQ](https://unsplash.com/photos/RykkS_DVhPQ) |
| Estudos | Livros abertos lado a lado | Patrick Tomasso, [unsplash.com/photos/Oaqk7qqNh_c](https://unsplash.com/photos/Oaqk7qqNh_c) |
| Casamento | Duas alianças | Sandy Millar, [unsplash.com/photos/8vaQKYnawHw](https://unsplash.com/photos/8vaQKYnawHw) |
| Bebê | Sapatinhos de bebê | Elsa Lilja, [unsplash.com/photos/xlkuA0VQshU](https://unsplash.com/photos/xlkuA0VQshU) |
| Tecnologia | Notebook, celular e café sobre uma mesa | Unsplash, [unsplash.com/photos/NuFUbftUu_s](https://unsplash.com/photos/NuFUbftUu_s) |
| Saúde | Tapete de exercício com toalha e halteres | Andrea Stuart, [unsplash.com/photos/zBYG9kzN-8s](https://unsplash.com/photos/zBYG9kzN-8s) |
| Futuro | Nascer do sol sobre o mar | Sebastien Gabriel, [unsplash.com/photos/-IMlv9Jlb24](https://unsplash.com/photos/-IMlv9Jlb24) |
| Pet | Cachorro olhando para a câmera | Alvan Nee, [unsplash.com/photos/Nms-W0u4J7c](https://unsplash.com/photos/Nms-W0u4J7c) |
| Objetivo | Trilha subindo uma montanha | Mateusz Sobczak, [unsplash.com/photos/9hhhZaj1CxA](https://unsplash.com/photos/9hhhZaj1CxA) |

Observações da escolha:

- **Saúde**: as fotos de tênis de corrida com uso gratuito mostravam marca (no tênis ou na garrafa); ficou o tapete de exercício com toalha e halteres, sem marca.
- **Carro**: a foto é da conta oficial de uma montadora na Unsplash, com a mesma licença das outras. Vista de cima, sem logotipo nem placa legível.
- **Tecnologia**: o nome do notebook, embaixo da tela, não se lê no tamanho do app.
- Para trocar uma foto: escolher outra com o filtro "Grátis", baixar de `images.unsplash.com`, recortar e reduzir do mesmo jeito, trocar o arquivo, o texto alternativo (`alt` em `GOAL_IMAGES`) e a linha desta tabela.

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
