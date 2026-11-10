# Metas mais comuns e a aba Metas (D-092)

10/11/2026. Pedido do Enzo: a meta "Moto" mostrava a imagem de um carro; conferir as outras imagens, levantar as 15 metas mais procuradas pelo público em geral, deixá-las prontas no app e sugerir melhorias para a aba Metas.

## 1. A imagem errada da Moto, e outras

A imagem sugerida vem das palavras do nome da meta (`packages/core/src/goal-images.ts`). Havia três problemas:

| Problema | Exemplo antes | Agora |
|---|---|---|
| "moto" estava na lista do carro | "Moto" mostrava o carro | "Moto" tem imagem própria |
| A primeira imagem da lista vencia, não a primeira pista do nome | "Casamento na praia" mostrava a viagem (por "praia") | Vale a pista que aparece primeiro no nome: casamento |
| Palavras de só guardar venciam as outras | "Guardar para o casamento" mostrava o porquinho | "guardar", "poupança", "reserva" e "pé de meia" só valem quando o nome não tem outra pista |

Também há palavras que só dão contexto ("entrada", "mudança", "aluguel", "futuro", "tratamento", "cirurgia", "festa", "pós", "mensalidade", "habilitação"): valem quando o nome não tem uma palavra mais forte. "Entrada da moto" é a moto; "Entrada" sozinha é a casa. "Cirurgia do cachorro" é o pet, "Festa de casamento" é o casamento e "CNH da moto" é a moto.

Os casos conferidos estão em `packages/core/test/goal-images.test.ts` (mais de 40 nomes, entre eles todos os das metas prontas).

## 2. As 15 metas mais comuns

Pesquisa feita em 10/11/2026 em levantamentos de 2022 a 2026 (Anbima Raio X do Investidor, Radar Febraban/IPESPE, Serasa, Tecban, Creditas/Opinion Box, Quaest, Vox Populi/IESS, Locomotiva e os dados publicados por dois bancos digitais sobre os nomes que as pessoas dão às suas reservas). **Atenção:** a rede desta sessão não abriu as páginas; os números vieram dos trechos dos resultados de busca e não foram conferidos na página. Servem para ordenar as metas, não para citar.

| # | Meta | O que as pesquisas mostram |
|---|---|---|
| 1 | Reserva para imprevistos | A mais citada como motivo para guardar (mais da metade, em pesquisa de 2024) |
| 2 | Casa própria | Primeiro destino do dinheiro investido na Anbima todos os anos desde 2017 (cerca de 1 em cada 3) |
| 3 | Viagem | De 10% a 46%, conforme a pergunta |
| 4 | Quitar dívidas | O plano número 1 para 2026 na Serasa (42%) |
| 5 | Carro | Primeira meta nos nomes de reservas de um banco digital (2022) |
| 6 | Reforma da casa | 15% a 21% no Radar Febraban |
| 7 | Negócio próprio | Segundo maior sonho na Tecban (23%) |
| 8 | Moto | Terceira meta nos nomes de reservas (2022), **separada do carro**; 26% pretendem comprar (Locomotiva 2025); motos foram 43,7% dos emplacamentos de 2025 |
| 9 | Celular e eletrônicos | Maior intenção de compra para 2025 (63%) |
| 10 | Aposentadoria | Cerca de 9% |
| 11 | Estudos | 2% a 8% |
| 12 | Casamento | Segunda meta nos nomes de reservas (2022) |
| 13 | Filhos | 13% querem ver um filho formado (segundo maior sonho na Quaest) |
| 14 | Saúde | 31% planejam cuidar mais da saúde (Serasa 2026) |
| 15 | Festa | Quinta meta nos nomes de reservas (2022) |

Logo abaixo, com pouca evidência: móveis e eletrodomésticos, intercâmbio, habilitação, pet e formatura. As palavras de cada uma também puxam a imagem certa.

## 3. O que mudou no app

- **"Nova meta" começa por "O que você quer conquistar?"**: uma grade com as metas mais comuns, cada uma com a sua imagem, e "Outra meta" no fim. Um toque preenche o nome (dá para mudar) e mostra **o que costuma entrar na conta** (por exemplo, Moto: "Além do preço, conte documentação, capacete e equipamentos."). A grade substitui os quatro "modelos de nome" de antes.
- **A imagem aparece antes de criar**: logo acima do nome, a imagem que o nome puxa, que muda enquanto a pessoa digita. Assim, uma imagem errada aparece na hora, não depois de salvar.
- Quatro metas têm um atalho na dica: Quitar dívidas abre "Em que ordem quitar as dívidas?" (com o aviso de que dívida com juros altos costuma crescer mais rápido do que o dinheiro guardado); Carro abre "Antes de financiar"; Celular novo abre "Parcelado ou à vista?"; Aposentadoria abre "Simular um plano". Abrem por cima do formulário, que continua preenchido.
- **A reserva para imprevistos**, que tem tela própria, aparece logo abaixo da grade só para quem ainda não tem uma, com "Calcular minha reserva".
- Quando a pessoa muda o nome para outra coisa (por exemplo, de "Moto" para "Viagem para a Europa"), a meta pronta deixa de ficar marcada e a dica some. A calculadora ou o simulador abertos pela dica não oferecem criar uma segunda meta por cima.
- **Metas vazia**: "Comece por uma das mais comuns", com Casa própria, Viagem, Carro, Moto, Reforma da casa e Meu negócio (cada uma abre "Nova meta" já escolhida) e "Ver todas".
- **Cinco imagens novas**: Moto, Reforma, Dívidas, Negócio e Festa (17 ao todo), com fotos de uso livre da Unsplash (créditos em `docs/33_METAS_COM_IMAGEM.md`).
- Na escolha de imagem, a opção "Automática (agora: …)" aparecia cortada; agora aparece em duas linhas: "Automática" e "agora: Viagem".

Onde está: `packages/core/src/goal-presets.ts` (as metas prontas e os textos), `packages/core/src/goal-images.ts` (as imagens e as palavras), `apps/app/src/components/goal-presets.tsx` (a grade, a dica e os atalhos do Metas vazio) e `apps/app/src/components/goal-form.tsx`. Nada muda no banco: a chave da imagem já aceitava nomes novos.

## 4. Sugestões para a aba Metas (para decidir)

Em ordem do que mais ajuda, pela leitura das telas e do código:

1. **Card da reserva mais curto quando o plano já existe.** Hoje ele ocupa a primeira tela inteira num celular de 390 px, e "Suas metas" começa abaixo da dobra. Proposta: mostrar valor, barra e um botão, com o plano de guardar recolhido em "Ver o plano".
2. **Prazo com atalhos**: "6 meses", "1 ano", "2 anos" e "5 anos", além de digitar MM/AAAA.
3. **Ritmo da meta**: no card, "no ritmo" ou "X meses atrás do plano", comparando o guardado com o planejado, e "faltam R$ X".
4. **Lembrete do aporte** no dia que a pessoa escolher, com os lembretes que já existem (D-087).
5. **"Tipo de meta" mais abaixo**: "Reserva de oportunidade" é um conceito pouco conhecido e hoje é a primeira pergunta do formulário. Proposta: deixar "Objetivo" marcado e mover a escolha para depois do valor, com "O que é isso?".
6. **Marcos**: uma frase curta ao passar de 25%, 50% e 75% da meta.
7. **Metas da Família**: viagem da família, reforma, casamento. Hoje as metas são só do Pessoal.
8. **Prioridade**: a pessoa põe a meta mais importante em primeiro.
9. **Valor de referência** (por exemplo, quanto custa em média uma viagem, um casamento ou a habilitação): só depois de conferir as fontes na página, porque os números da seção 2 vieram de trechos de busca.

## 5. Fotos das imagens novas

Escolhidas em 10/11/2026 na Unsplash, com o filtro de uso livre, como as 12 de antes: pelo navegador, na conta do Enzo, sem chave de API. Créditos e observações em `docs/33_METAS_COM_IMAGEM.md`.
