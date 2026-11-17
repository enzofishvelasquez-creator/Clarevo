# Glossário: um nome só para cada coisa

29/10/2026 (D-072). Os nomes que o app, o site, o guia, o material de vendas e as publicações usam. Cada coisa tem um nome, e o mesmo nome não serve para duas coisas. O teste `packages/core/test/glossario.test.ts` recusa os nomes aposentados nas telas, nos textos do núcleo e no site (comentários de código e palavras de busca ficam de fora).

| Nome | O que é | Não usar |
|---|---|---|
| **Movimentos** | A aba e a tela com os registros do mês: gastos, recebimentos, contas a pagar, gastos fixos e o card Organizar. O endereço continua `/movimentacoes`. | Movimentações |
| **Bancos e carteira** | De onde o dinheiro sai ou para onde entra: o banco, a carteira. Sem saldo. Card em Conta ("Adicionar banco ou carteira", "Gerenciar bancos e carteira"), escolhido em "Saiu de", "Entrou em" e "Foi para". O item que nasce com a conta continua "Conta principal"; nunca "conta Conta principal" (por exemplo: "saindo de Conta principal"). Decisão de Enzo em 16/11/2026. | Contas de origem, conta de origem, Suas contas, Conta de destino, "Gerenciar contas" |
| **Contas a pagar** | Contas com vencimento (boleto, aluguel, fatura). Não confundir com bancos e carteira. | |
| **Espaço** | Onde cada registro fica: Pessoal ou Família. É o que a pílula do cabeçalho e o seletor mostram. | contexto (o termo técnico fica só no código e nos documentos de arquitetura) |
| **Ocultar** | Tirar da tela: "Ocultar valores", "Ocultar tabela", "Ocultar as parcelas". | Esconder |
| **Histórico da meta** | A lista de aportes, resgates e rendimentos de uma meta. | Movimentos (é o nome da aba) |
| **Quem é titular, Anota e vê, Só vê** | Os papéis na Família. Quem saiu aparece como "ex-membro" e o primeiro nome na autoria. | membro, como nome de papel |
| **a Clarevo** | A marca, no feminino (D-068). O software, como objeto, é "o app da Clarevo". | o Clarevo |

O que já tinha um nome só e segue igual: Resumo, Metas, Aprender, Conta, Anotar gasto, Registrar recebimento, Gastos fixos, Contas do ano, Cartões, Orçamento por categoria, Renda comprometida, Calculadoras, Importar extrato ou fatura.
