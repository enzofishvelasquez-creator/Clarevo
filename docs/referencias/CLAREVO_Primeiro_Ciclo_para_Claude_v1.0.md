# Clarevo Primeiro ciclo para o Claude

07/10/2026 · versão 1.0 · início do desenvolvimento do zero.

## Como começar

Crie um projeto separado no Claude chamado **Clarevo**. Cole o conteúdo de `CLAREVO_Instrucoes_Projeto_Claude.txt` no campo de instruções do projeto. Anexe este arquivo, `CLAREVO_Entrada_e_Primeiro_Fluxo_Claude.docx` e o logo aprovado com C aberto. O documento contém referências das telas, incluindo o Resumo. Como apoio, anexe a pesquisa de mercado e o handoff de identidade já entregues. As decisões específicas deste primeiro ciclo prevalecem sobre propostas visuais anteriores.

No primeiro chat, envie também `CLAREVO_Telas_Referencia_Primeiro_Ciclo.png` e o logo aprovado como referências visuais.

Não é necessário enviar todo o material do Bíos para começar. Aproveite seus métodos de desenvolvimento e validação; o Clarevo tem repositório, ambientes, dados e identidade próprios. O dossiê original do Clarevo serve como repertório de requisitos, sem pressupor código existente.

## Primeira mensagem para colar no Claude

Quero iniciar o Clarevo do zero, seguindo os arquivos anexados. É um app de organização e educação financeira para pessoas e famílias, com arquitetura que permita acesso patrocinado por empresas. A identidade aprovada usa azul vivo #2457F5, lima #D4F05B e logo com C aberto. Preserve a estrutura do Resumo mostrada nas referências; dê um acabamento mais orgânico às ilustrações e aos estados vazios.

Comece pelo primeiro ciclo: entrada, cadastro, confirmação e recuperação de acesso; criação do espaço pessoal e da primeira conta; registro manual de recebimento e gasto já realizado; listagem, detalhe, edição e exclusão com confirmação; resumo mensal e composição dos totais. Implementação real deve persistir dados e verificar autorização no backend. A demonstração visual fornecida usa dados fictícios e acesso simulado.

Antes de escrever a implementação, apresente uma recomendação objetiva de stack para o cliente mobile e o backend, usando documentação oficial atual. A stack ainda não foi escolhida neste planejamento. Explique autenticação, persistência, autorização por contexto, testes, custos iniciais e os passos para executar o projeto. Não trate uma preferência técnica como decisão já aprovada. Se eu já informar uma stack, trabalhe com ela e sinalize somente incompatibilidades concretas.

Depois, execute o primeiro ciclo em etapas pequenas, com código organizado, migrações e instruções de execução. Não amplie para integração bancária, cartões, cobranças, painel de empresas, convites familiares ou IA neste ciclo. Prepare as separações de dados e licenciamento necessárias para essas expansões. Ao entregar, informe o que funciona de ponta a ponta, testes realmente executados, pendências e como eu verifico o resultado.

## Decisões visuais que orientam a implementação

- **Manter:** cabeçalho azul, seletor Pessoal/Família, período mensal, recebido e pago, Diferença do mês, CTA Anotar gasto, compromissos separados, pagamentos, educação em lima e Quem vê estes dados.
- **Evoluir:** formas orgânicas na abertura, estados vazios, desenhos de educação e transições curtas. Manter números e formulários estáveis e fáceis de ler.
- **Logo:** preservar o C aberto aprovado. Vetorizar mantendo o desenho e o conceito; não criar uma nova marca neste ciclo.
- **Navegação:** Resumo, Movimentações, Metas e Aprender. Conta concentra perfil e situação do benefício. “Movimentos” ou “Registros” podem ser rótulos compactos, com nome acessível completo.
- **Cores:** azul #2457F5; lima #D4F05B; texto #17223B; secundário #4B5873; fundo #F6F8FC; superfície #FFFFFF; erro #B42318; confirmação #087E58.
- **Leitura e interação:** campos editáveis de pelo menos 16 px, números tabulares, foco visível, alvos de toque próximos de 44 px, texto ampliado sem corte. Transições de aproximadamente 120 a 230 ms, respeitando redução de movimento.

## CL C001 Entrada e conta pessoal

**Ação:** construir Boas vindas → Criar conta ou Entrar. Cadastro pede nome de apresentação, e-mail e senha. Confirmação de e-mail deve usar o provedor real. Recuperação inclui solicitar link, abrir o link, definir nova senha e voltar à entrada. Na primeira entrada confirmada, criar de forma idempotente o contexto pessoal e a primeira conta financeira em BRL.

**Textos:** “Seu dinheiro, mais claro.”; “Criar conta”; “Entrar”; “Esqueci minha senha”; “Confira seu e-mail”; “Já confirmei meu e-mail”; “Sua primeira conta”; “Nome da conta”; “Começar meu mês”. Usar “Nova senha” e “Salvar nova senha” na recuperação.

**Aceite:** confirmação pendente não libera acesso aos registros; o botão de confirmação consulta o estado real da conta; sessão expirada retorna à entrada e, depois da autenticação, ao destino permitido. Repetir o callback de cadastro não cria duas contas ou contextos. Sair limpa caches e dados de sessão no dispositivo, sem excluir o histórico persistido. Um novo cadastro começa sem registros fictícios.

**Erros:** e-mail malformado recebe validação junto ao campo. Login inválido mostra “Não foi possível entrar. Confira e-mail e senha.” Recuperação mostra “Se houver uma conta com esse endereço, você receberá as instruções para recuperar o acesso.” Link inválido ou expirado oferece novo envio. Erro de rede preserva e-mail, não registra senha em logs e permite tentar novamente. Reenvio informa intervalo real e evita pedidos repetidos.

**Segurança:** seguir a política documentada do provedor de autenticação, comunicar os requisitos da senha antes do envio e configurar limites contra tentativas abusivas. Não criar armazenamento próprio de senhas em texto simples. Não usar mensagens ou respostas que revelem desnecessariamente a existência de uma conta. Referência técnica: OWASP Authentication Cheat Sheet.

**Primeira conta:** nome inicial “Conta principal”, editável. Não exigir saldo inicial para registrar movimentos. Sem saldo inicial, não mostrar um saldo bancário calculado. Informar posteriormente esse saldo será um evento próprio, separado de renda.

## CL C002 Registrar e conferir

**Entrada do gasto:** Anotar gasto no Resumo ou em Movimentações. **Entrada do recebimento:** Registrar recebimento em Movimentações. O ciclo aceita somente gasto já pago e renda já recebida; compromissos previstos permanecem separados.

**Campos:** descrição obrigatória, 1 a 80 caracteres após remover espaços nas extremidades; valor obrigatório e positivo; conta financeira obrigatória; data do pagamento ou do recebimento obrigatória, em DD/MM/AAAA; contexto visível e fixo durante o preenchimento. Categoria pode ficar “Sem categoria”. Quando houver só uma conta, mostrar seu nome, sem seletor redundante.

**Valor:** aceitar entrada brasileira, como `80`, `80,00` e `1.234,56`. Rejeitar ambiguidade, valor zero, negativo ou mais de duas casas decimais. Proposta de limite inicial: R$ 9.999.999,99 por registro, validado também no backend e informado se excedido. Converter diretamente para centavos inteiros, sem cálculo financeiro acumulado em ponto flutuante.

**Data:** usar uma data civil válida, sem deslocá-la de dia ao converter fuso. Neste ciclo, realizado não aceita data futura; datas futuras pertencem ao fluxo de compromissos. Na produção, usar o dia atual no fuso da pessoa. A demonstração está fixada em 07/10/2026 e oferece setembro e outubro; essa limitação é do exemplo, não do produto.

**Salvar:** contexto e conta não podem ser trocados silenciosamente. Validar no cliente e no backend; manter rascunho durante o envio; bloquear envio repetido e usar chave idempotente por operação. Mostrar “Gasto salvo” ou “Recebimento salvo” somente depois da confirmação de persistência. Abrir o detalhe com data, contexto, conta, valor, situação e período afetado.

**Texto de erro:** “Dê um nome para este registro.”; “Informe um valor maior que zero, como 80,00.”; “Confira a data informada.”; “Não foi possível salvar. Seu preenchimento foi mantido. Tente novamente.” O limite de valor recebe mensagem específica. Em resultado de rede incerto, reconciliar a operação antes de repetir.

## CL C003 Editar e excluir

**Editar:** abrir o mesmo registro com os dados preenchidos. Salvar mantém o ID e atualiza sua versão; não acrescenta outro movimento. Não mudar tipo ou contexto nesta primeira versão. Alterar a data pode mover o registro entre períodos; indicar o mês afetado e atualizar os dois períodos.

**Excluir:** detalhe → Excluir registro → confirmação com descrição, valor e contexto. Oferecer “Cancelar” e “Excluir registro”. Excluir remove o registro das consultas financeiras após persistência confirmada e preserva um rastro técnico mínimo de autoria e operação, com política de retenção a definir. Falha mantém o registro e oferece tentar novamente. Cancelar não altera nenhum total.

**Conflito:** usar versão do registro. Se outro aparelho o tiver alterado, não sobrescrever silenciosamente: informar que há uma versão mais recente, permitir conferência e preservar o rascunho para reaplicar as alterações.

## CL C004 Resumo e composição

Uma única origem de registros alimenta lista, detalhe e totais. Filtrar pelo mesmo contexto, situação realizada e período da data de pagamento ou recebimento. Somar centavos inteiros. Registros excluídos e valores apenas previstos não entram em recebido ou pago.

**Diferença do mês = recebimentos realizados − despesas pagas no período.** O texto de apoio é “Recebimentos menos pagamentos confirmados”. Essa diferença não é o saldo da conta nem dinheiro disponível. Recebido e Pago abrem as listas que compõem os respectivos totais.

“Ainda a pagar neste mês” consulta compromissos em uma origem separada. R$ 650 no exemplo é um dado fictício, sem tela de cadastro de compromissos neste ciclo. Na conta nova, mostrar ausência de compromissos registrados. Falha ou carregamento não é zero: mostrar estado de carregamento, erro e nova tentativa. Com consulta bem-sucedida e nenhum registro, zero é o total conhecido, acompanhado do estado vazio.

## CL C005 Rascunho e educação

Abrir uma explicação preserva os campos e permite continuar preenchendo. Sair, cancelar, trocar de destino ou contexto com alterações não salvas mostra “Descartar o preenchimento?” e “Você tem alterações que ainda não foram salvas em Pessoal”, com o contexto correto. Ações: “Continuar editando” e “Descartar alterações”. Nunca salvar o rascunho no novo contexto por consequência de uma troca.

Educação explica diferença do mês, realizado versus previsto e diferença versus saldo da conta. O card sobre fatura pode orientar o conceito, mas não torna cartões uma função implementada. Metas e compartilhamento familiar entram em ciclos próprios; não entregar botões que aparentem funções prontas sem destino útil.

## CL C006 Contratos de dados e acesso

Modelo mínimo proposto, independente da stack:

| Entidade | Campos ou separações essenciais |
|---|---|
| Pessoa | ID ligado à identidade autenticada, nome de apresentação, preferências de fuso e locale |
| Contexto | ID, tipo pessoal ou familiar, titularidade, moeda |
| Vínculo | Pessoa, contexto, situação, permissões por ação |
| Conta financeira | ID, contexto, nome, moeda, situação; saldo inicial desconhecido separado de zero |
| Registro | ID, contexto, conta, tipo renda ou despesa, valor em centavos, moeda, data civil, descrição, categoria opcional, situação realizada, autoria, versão, timestamps, estado de exclusão |
| Operação | ID de idempotência, pessoa, contexto, ação, estado e registro resultante |
| Organização e acesso ao plano | Organização, contrato, licença, beneficiário e validade; separados das permissões financeiras |

Definir limites e integridade no armazenamento. Conta e registro devem pertencer ao mesmo contexto e moeda. Autor não pode ser um ID arbitrário enviado pelo cliente. A chave idempotente é vinculada ao ator e à operação; repetição retorna o mesmo resultado, e reutilização com conteúdo diferente é rejeitada. Criação do registro e conclusão da operação devem ser atômicas.

Autorizar toda leitura, criação, edição e exclusão no servidor ou nas políticas da camada de dados, inclusive acessos diretos por ID. Negar acesso quando não houver permissão explícita. O contexto selecionado na tela não é prova de autorização. Logs de uso não precisam registrar descrições e valores financeiros.

Empresa patrocina acesso ao plano; não recebe acesso às finanças pessoais ou familiares. Não modelar todos os dados pessoais como propriedade da empresa. Criar contratos e limites de autorização desde a fundação; painel, cobrança e comercialização são ciclos posteriores. No primeiro ciclo, todo cadastro recebe um contexto pessoal. Uma família não vinculada recebe estado explicativo; não simular membros ou permissão real na produção.

## Critérios de aceite com valores verificáveis

Aplicar a sequência abaixo em uma conta de teste isolada. Compromissos previstos de R$ 650 ficam separados durante toda a sequência.

| Operação no mesmo mês e contexto | Recebido | Pago | Diferença |
|---|---:|---:|---:|
| Base de teste | R$ 6.000,00 | R$ 3.900,00 | R$ 2.100,00 |
| Criar gasto de R$ 80,00 | R$ 6.000,00 | R$ 3.980,00 | R$ 2.020,00 |
| Editar o mesmo gasto para R$ 95,00 | R$ 6.000,00 | R$ 3.995,00 | R$ 2.005,00 |
| Excluir esse gasto | R$ 6.000,00 | R$ 3.900,00 | R$ 2.100,00 |
| Criar recebimento de R$ 200,00 | R$ 6.200,00 | R$ 3.900,00 | R$ 2.300,00 |
| Editar o mesmo recebimento para R$ 250,00 | R$ 6.250,00 | R$ 3.900,00 | R$ 2.350,00 |
| Excluir esse recebimento | R$ 6.000,00 | R$ 3.900,00 | R$ 2.100,00 |

Verificar também:

- Uma conta nova tem listas vazias, sem dados de exemplo na produção.
- Tentar salvar duas vezes a mesma operação cria um único registro, inclusive após timeout seguido de nova tentativa.
- Editar conserva o ID e altera a versão; excluir muda o total uma única vez.
- Um gasto de 30/09 não entra em outubro. Mover sua data para outubro atualiza ambos os meses.
- Data impossível, como 31/09, recebe erro e preserva os outros campos.
- Uma descrição com `<` e `>` é texto, sem execução de marcação.
- Outra pessoa ou organização não consegue consultar ou alterar o registro por ID, filtro, exportação ou endpoint alternativo.
- Licença empresarial não concede leitura dos registros. Vínculo revogado bloqueia novas consultas e invalida o cache correspondente.
- Falha ao salvar mantém o preenchimento; falha ao consultar mantém um estado de erro, sem apresentar zero como resultado confirmado.
- Voltar da educação mantém o rascunho; cancelar a exclusão mantém o registro; cancelar descarte mantém os campos.

## Ordem de execução e retorno esperado

1. Recomendar e documentar a stack, sem pressupor herança técnica do Bíos. Preparar projeto, ambiente separado, design tokens, esquema e contratos de autorização.
2. Completar autenticação e primeira conta com persistência real. Verificar confirmação, recuperação, sessão e cadastro repetido.
3. Completar os registros manuais e o resumo pela mesma origem. Validar idempotência, versões, erros, período e contexto.
4. Conferir as telas no dispositivo escolhido, teclado aberto, ampliação de texto e redução de movimento. Executar os testes financeiros e de autorização antes de considerar o ciclo pronto.

O Claude deve devolver instruções de execução, alterações implementadas, migrações, testes executados com resultados e pendências concretas. Screenshots e uma interface bonita não demonstram, por si só, persistência ou autorização implementadas.

**Demonstração validada neste planejamento:** entrada e recuperação simuladas; conta vazia; renda e despesa com criação, edição e exclusão; totais; mudança de período; contextos fictícios separados; rascunho; explicação; validação de campos; texto escapado; redução de movimento; telas de 320 e 736 px sem transbordamento e botões com pelo menos 44 px de altura. Não foram implementados autenticação real, persistência, rede, sincronização ou autorização de produção.

**Ciclos seguintes:** compartilhamento familiar com convites e permissões → compromissos, cartões e metas → benefício empresarial e comercialização. Educação evolui com cada tarefa.

## Referências técnicas

- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), consultada em 07/10/2026.
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html), consultada em 07/10/2026.

São referências para autenticação e autorização. A sequência, o modelo financeiro, a identidade e os critérios de produto são propostas específicas para o Clarevo.
