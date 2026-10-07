# Análise geral e propostas

07/10/2026 · versão 1.0. Três análises independentes (código, design e pesquisa de mercado) e as correções feitas em seguida. Propostas seguem o formato das instruções do projeto: problema, solução, lugar no app, alcance, risco e decisão. Fontes consultadas em 07/10/2026; itens marcados como "não verificado" precisam de conferência antes de decisão.

## 1. Respostas diretas

**O Supabase é pago?** Tem plano gratuito, mas ele não serve para pessoas reais: pausa o projeto após 1 semana sem uso, não tem backup automático e o e-mail embutido envia cerca de 2 mensagens por hora, só para a equipe. Para o piloto: plano Pro, a partir de US$ 25 por mês, mais um provedor de e-mail. Um ambiente de teste soma cerca de US$ 10 por mês. Detalhes em `05_SUPABASE.md`.

**A calculadora já foi mencionada?** Não. Nenhum documento recebido fala em calculadora. A única regra relacionada está nas instruções v2.1: "Simulações mostram hipóteses e alcance. Operações bancárias e recomendação de produtos financeiros não estão aprovadas." Proposta na seção 4.1.

**Dá para conectar as contas do banco e ver saldos, limites e faturas?** Sim, pelo Open Finance Brasil, que tem permissões para saldos, transações, limites de cartão e faturas. Mas um app sem autorização do Banco Central não acessa direto: precisa de um agregador (Pluggy, Belvo e outros) e há custo fixo mensal relevante. O Banco Central está revendo as regras dessas parcerias, com conclusão prevista para dezembro de 2026. Proposta na seção 4.3.

**Notas fiscais para saber o que, onde e quanto se consome?** Sim, e é um diferencial possível. O caminho mais confiável é ler o QR code da NFC-e (nota do consumidor): ele leva à consulta pública da Secretaria da Fazenda do estado, com itens, quantidades, preços, loja e data. Proposta na seção 4.2.

**Animações e interações são bem-vindas?** Sim, com as regras do handoff (CL-V008): sempre começam por uma ação da pessoa, duram de 100 a 350 ms, respeitam "reduzir movimento" e nunca animam valores em dinheiro contando. Plano na seção 5.

## 2. Revisão de código

Executado: testes de regras (49), banco (isolamento e sequência de aceite), app contra a API do banco (9) e fluxos na web (46 verificações, duas rodadas e uma com movimento reduzido). Todos passando depois das correções abaixo.

### Corrigido nesta revisão

| Gravidade | Problema | Correção |
|---|---|---|
| Alta | Uma falha momentânea de rede ao atualizar dados em segundo plano tirava a pessoa da tela e apagava o rascunho | Dados já carregados prevalecem sobre falha de atualização |
| Média (segurança) | Repetir uma operação antiga devolvia o registro mesmo depois de o acesso ser revogado | A repetição confere permissão de leitura; teste novo |
| Média (segurança) | O titular podia revogar o próprio vínculo e perder o acesso à família | Vínculo de titular não pode ser alterado; teste novo |
| Média | Depois de uma falha de rede incerta, os totais não eram atualizados e correções feitas depois da falha eram ignoradas | Reconciliação atualiza os totais e aplica a correção como edição do mesmo registro |
| Média | Em produção, a confirmação "Senha atualizada" não apareceria e, na web, recarregar a página perdia a recuperação | Fluxo de nova senha refeito; marca de recuperação guardada na sessão do navegador |
| Baixa | A empresa podia vincular qualquer pessoa a uma licença | Empresa só convida por e-mail e encerra; vínculo e ativação ficam para o aceite; teste novo |
| Baixa | Dia atual fixo em São Paulo, sem atualizar depois da meia-noite | Fuso do aparelho guardado no primeiro acesso; dia recalculado ao voltar para o app |
| Baixa | Mês com mais de 1.000 registros mostraria total incompleto | Leitura em páginas |
| Baixa | Pequenas diferenças entre app e banco (tabulação nas pontas, emoji, categoria longa) | Mesmas regras nos dois lados; testes novos |
| Baixa | Um build de produção sem servidor abriria em demonstração sem avisar | Demonstração só em desenvolvimento ou quando pedida; senão, "Configuração incompleta" |
| Baixa | Escolhas de mês e contexto passavam para a próxima pessoa que entrasse no mesmo aparelho | Estado reiniciado a cada pessoa |
| Higiene | Dependências do modelo sem uso e todos os pesos da fonte no app | Removidas; só os 5 pesos usados |

### Fica para o próximo passo técnico

- Pacote de ícones inteiro entra na versão web (4,7 MB): importar só os ícones usados.
- Rotas tipadas do Expo Router não são conferidas no `typecheck` (os tipos são gerados só ao rodar o app).
- Teste automatizado de queda de rede na tela do formulário (a regra está testada no core e no banco).

## 3. Revisão de design e experiência

### Corrigido

- Valores em reais nunca são cortados: o tamanho da fonte se ajusta à largura (antes, em 320 px aparecia "R$ 9.997.89…").
- Linhas de lista: valor sempre inteiro; em tela estreita ou fonte grande, o valor vai para baixo da descrição.
- Contraste: textos claros sobre o azul, aviso de sucesso, contorno de campos e chips e texto de exemplo passaram a cumprir o mínimo.
- Botão ocupado mantém a cor ("Salvando…") em vez de ficar apagado.
- Data: barras automáticas ao digitar só números e atalhos "Hoje" e "Ontem".
- Valor aceita `12.50` (teclados que só mostram ponto).
- Contador de caracteres a partir de 60; limite de 80 no próprio campo.
- Categorias diferentes para gasto e recebimento.
- Excluir volta para a tela de origem com o aviso "Registro excluído".
- Depois de salvar, botão "Anotar outro gasto".
- "Ainda a pagar" abre os compromissos que compõem o total; em meses passados vira "Previsto para setembro de 2026".
- Mês corrente indica até que dia ("até 07/10"); diferença negativa ganha explicação neutra.
- Leitores de tela: idioma da página em português, estado selecionado nas abas, no seletor e nas categorias, e Recebido/Pago anunciados com o valor.
- Navegação entre telas respeita "reduzir movimento".
- Travessão removido do detalhe; "Sair" deixou de ser vermelho (não é ação destrutiva).

### Próximo ciclo de acabamento (proposta)

| Tema | O que muda | Por quê |
|---|---|---|
| Cabeçalho único | Mesmo topo azul com logo e avatar em todas as abas; topo compacto em formulário e detalhe | Hoje cada tela tem um cabeçalho diferente |
| Formulário mais curto | Botão Salvar fixo acima do teclado; valor com máscara que preenche pelos centavos; calendário | Anotar gasto hoje exige rolagem |
| Foco visível só no teclado | Anel de foco aparece ao navegar por Tab, não ao tocar | Hoje aparece também no toque |
| Confiança no detalhe | "Anotado por você em 07/10/2026 às 14:32" e última alteração | Autoria visível transmite segurança |
| Conta | Seção Segurança: alterar senha, encerrar sessões, exportar dados | Esperado em um app pago |
| Movimentações | Totais do mês no topo, agrupamento por dia, filtro Recebido/Pago | Leitura mais rápida |
| Estados vazios | Ilustrações orgânicas diferentes por contexto | Hoje o mesmo desenho aparece em tudo |
| Carregamento | Esqueletos no lugar do indicador giratório | Sensação de rapidez |
| Entrada | Mostrar senha, voltar visível, promessas de privacidade verificáveis na boas-vindas | Fluidez e confiança |

## 4. Propostas de funcionalidades

### 4.1 Calculadoras do dia a dia (simuladores)

- **Problema:** decisões frequentes (parcelar ou pagar à vista, quanto guardar, como dividir as contas da casa) são feitas sem conta. 82% das famílias estão endividadas e o cartão aparece em 85% delas (CNC, agosto e julho de 2026); 31% não têm reserva (Anbima, 2026).
- **Solução:** área "Calcular" dentro de Aprender, com simuladores curtos que mostram premissas e resultado, e podem virar um registro ou uma meta quando essas funções existirem:
  1. Parcelado ou à vista (com desconto à vista e juros informados pela pessoa).
  2. Reserva para imprevistos: meses de despesas essenciais e tempo para chegar lá.
  3. Dividir as contas da casa: em partes iguais, proporcional à renda ou por item.
  4. Quanto guardar por mês para um objetivo.
  5. Quanto custa sair de uma dívida (rotativo, cheque especial) e ordem de pagamento.
  6. Correção de um valor pela inflação (IPCA, série oficial do Banco Central).
- **Lugar:** Aprender → Calcular; atalhos contextuais (ex.: "Parcelado ou à vista?" ao anotar um gasto alto).
- **Alcance:** cálculos em `packages/core`, em centavos, com testes comparados à Calculadora do Cidadão do Banco Central.
- **Risco:** confundir simulação com recomendação. Mitigação: premissas sempre visíveis, taxa informada pela pessoa, sem citar produtos ou instituições (regra das instruções e da CVM).
- **Decisão:** quais simuladores entram primeiro. Recomendação: 1, 2 e 3.

### 4.2 Notas fiscais: o que, onde e quanto

- **Problema:** o total do mês não mostra o que está pesando. A pessoa quer saber quanto gasta com carne, limpeza ou farmácia, em qual mercado, e como os preços mudam.
- **Solução:** ler o QR code da NFC-e com a câmera. O app abre a consulta pública da Secretaria da Fazenda do estado (no aparelho da pessoa, com consentimento), lê os itens e mostra para conferência antes de salvar: loja, data, total e cada item com quantidade e preço. O gasto entra como um registro normal, e os itens ficam ligados a ele.
- **O que isso permite:**
  - Gastos por tipo de produto (categorias pelo código NCM do item e por um dicionário de descrições).
  - Gastos por loja e comparação de preço do mesmo produto entre visitas.
  - "Sua inflação": variação do preço dos itens que a pessoa compra de verdade.
  - Garantia e trocas: nota guardada e encontrada pela busca.
- **Lugar:** botão "Ler nota fiscal" em Anotar gasto; nova área "Compras" com itens, lojas e preços.
- **Alcance:**
  - Fase 1: leitura do QR code, total, loja e data (menor risco).
  - Fase 2: itens, nos estados mais populosos primeiro, com lançamento manual quando a consulta falhar.
  - Fase 3: análises por item, loja e preço.
- **Risco:**
  - Cada estado tem uma página de consulta diferente, que pode mudar; serviços pagos (ex.: Infosimples) são alternativa, com custo por consulta (não verificado).
  - Robôs em massa no servidor são desaconselhados (as Secretarias da Fazenda bloqueiam consumo automatizado); por isso a leitura acontece no aparelho, por ação da pessoa.
  - A página pode exibir o CPF da compra: não guardar esse dado.
  - Precisa de parecer jurídico sobre a leitura das páginas públicas.
  - Leitura de foto de cupom em papel com IA é alternativa para notas sem QR code, mas exige proposta própria e revisão antes de salvar (regra das instruções).
- **Decisão:** aprovar a fase 1 como próximo diferencial e pedir o parecer jurídico.

### 4.3 Contas do banco, cartões, limites e faturas (Open Finance)

- **Problema:** anotar tudo à mão cansa; a pessoa quer ver saldos, limites e faturas num lugar só.
- **Solução:** conexão por Open Finance via agregador regulado. Dados disponíveis na especificação oficial: saldos, transações de até 12 meses, limite de cheque especial, cartões com limites, faturas fechadas e suas transações, empréstimos e investimentos.
- **Lugar:** Conta → Conexões; plano "Conectado".
- **Alcance e custo:**
  - Custo fixo de agregadores relatado entre R$ 540 e R$ 6.000 por mês (relatos de terceiros, não verificado), mais custo por conexão.
  - Referência de mercado: o Organizze cobra R$ 199,90 por ano no plano manual e R$ 399,90 com conexão bancária.
- **Risco:**
  - Cobertura e estabilidade: falhas de sincronização são a principal reclamação nos apps concorrentes.
  - Atualização limitada (até cerca de 4 vezes por dia) e atraso de até 24 horas.
  - Fatura aberta não vem pronta: precisa ser montada pelas transações.
  - Duplicidade com lançamentos manuais.
  - Regras de parceria em revisão pelo Banco Central até dezembro de 2026.
- **Decisão:** não contratar agregador agora. Preparar o modelo de dados (origem do lançamento, identificador externo e conciliação) e decidir em dezembro, com a regra publicada.

### 4.4 Outras ideias que agregam valor a um app pago

| Ideia | Valor | Observação |
|---|---|---|
| Contas a pagar com lembrete | O que vence e quando, com aviso no dia anterior | É o "Ainda a pagar", que hoje só tem leitura |
| Orçamento por categoria | Limite por categoria com aviso neutro ao se aproximar | Sem culpa nem julgamento |
| Resumo da semana | Notificação curta: recebido, pago e o que vence | Cria hábito sem exigir abrir o app |
| Família (ciclo 2) | Convite com permissões, quem vê o quê | Diferencial frente a apps só individuais |
| Bloqueio do app | Biometria ou senha do aparelho ao abrir; botão para ocultar valores | Segurança visível |
| Verificação em duas etapas | Código de aplicativo autenticador no login | Disponível no Supabase (MFA) |
| Exportar dados | Planilha ou PDF do mês | Confiança e portabilidade (LGPD) |
| Relatório mensal | "Seu mês em 30 segundos" com 3 números e uma explicação | Valor percebido do plano |

## 5. Animações e interações

O Bíos usava movimento ambiente: arcos que "respiram", ondas e órbitas. No Clarevo, a recomendação é movimento **funcional**, ligado à ação, com a personalidade do logo:

- **Assinatura:** o crescente lima do C pode "crescer" como uma fase da lua na abertura e no carregamento (uma vez, até 300 ms; parado com movimento reduzido).
- **Toque:** botões reduzem levemente (escala 0,98) e mudam de cor em 120 ms.
- **Seletor Pessoal/Família:** a pílula branca desliza em 200 ms e o conteúdo troca com fade.
- **Troca de mês:** o conteúdo desliza 12 px na direção escolhida em 200 ms.
- **Salvar:** o indicador vira um sinal de confirmação em 220 ms, com vibração leve, **só depois** da confirmação do servidor.
- **Depois de salvar:** o total afetado ganha um destaque lima por 300 ms ("+ R$ 80,00 em Pago"); o número aparece direto no valor final.
- **Excluir:** a linha recolhe em 250 ms e o aviso sobe.
- **Ilustrações:** formas orgânicas entram uma única vez nas telas de boas-vindas e Aprender.

**Como fazer:** Reanimated 4 (já instalado) para transições e microinterações; `expo-haptics` para vibração; Lottie ou Rive só se houver ilustrações animadas de marca. Tudo com `ReduceMotion.System`, durações em `theme/tokens.ts` e verificação na web e no aparelho.

## 6. Preço e posicionamento

- O principal concorrente é papel, planilha e o app gratuito do banco: só 19% usam app de controle (Lina Open X e MindMiners, 2026); o Minhas Finanças, do Banco do Brasil, é gratuito e já agrega outros bancos.
- Referências no Brasil: de R$ 120 a R$ 200 por ano no modelo manual; de R$ 400 a R$ 600 por ano com conexão bancária. YNAB e Monarch cobram por domicílio, o que combina com a proposta familiar.
- O que pessoas pagantes valorizam: estabilidade, transparência de preço e de uso dos dados, lançamento rápido.
- Sugestão: plano Pessoal e plano Família (por domicílio), anual com desconto, teste gratuito, sem anúncios e sem venda de dados, dito com clareza.

## 7. Próximos passos sugeridos

1. Ciclo de acabamento de design (seção 3) e animações (seção 5).
2. Contas a pagar (compromissos) com lembrete.
3. Calculadoras 1, 2 e 3.
4. Notas fiscais, fase 1 (QR code), após parecer jurídico.
5. Login real com Supabase Pro e e-mail próprio, quando for abrir para pessoas de fora.
6. Família (ciclo 2).
7. Open Finance: decisão em dezembro de 2026.
